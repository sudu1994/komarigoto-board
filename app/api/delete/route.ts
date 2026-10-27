import { DELETE_WINDOW_MS } from "@/lib/phases";
import { db, fail, ok, readJson, roomOk, sha } from "@/lib/server";

export async function POST(req: Request) {
  const b = await readJson(req);
  if (!roomOk(b.r) || typeof b.id !== "string" || typeof b.del !== "string") return fail("だめでした", 403);
  const { data: s } = await db().from("post_secrets").select("del_hash").eq("post_id", b.id).maybeSingle();
  if (!s || s.del_hash !== sha(b.del)) return fail("消せません", 403);
  const { data: p } = await db().from("posts").select("created_at").eq("id", b.id).single();
  if (!p || Date.now() - new Date(p.created_at).getTime() > DELETE_WINDOW_MS) return fail("2分を過ぎたので消せません");
  await db().from("posts").delete().eq("id", b.id);
  const { count } = await db().from("posts").select("*", { count: "exact", head: true }).eq("room_id", b.r).eq("hidden", false);
  await db().from("rooms").update({ post_count: count ?? 0 }).eq("id", b.r);
  return ok();
}
