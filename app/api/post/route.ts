import { db, fail, getRoom, ok, readJson, sha, token, who } from "@/lib/server";

async function recount(r: string) {
  const { count } = await db().from("posts").select("*", { count: "exact", head: true }).eq("room_id", r).eq("hidden", false);
  await db().from("rooms").update({ post_count: count ?? 0 }).eq("id", r);
}

export async function POST(req: Request) {
  const b = await readJson(req);
  // identity is checked only to keep outsiders out — it is NOT stored with the post
  const me = await who(b as { r: string; pid: string; secret: string });
  if (!me) return fail("参加し直してね", 401);
  const body = String(b.body ?? "").trim().slice(0, 140);
  if (!body) return fail("なにか書いてね");
  const room = await getRoom(me.room_id);
  if (!room) return fail("ルームがありません", 404);
  if (!["post", "free"].includes(room.phase)) return fail("いまは投稿できないタイムです");

  const { data: p, error } = await db()
    .from("posts")
    .insert({ room_id: me.room_id, body, late: room.phase === "free" })
    .select("id, created_at")
    .single();
  if (error || !p) return fail("投稿できませんでした", 500);
  const del = token();
  await db().from("post_secrets").insert({ post_id: p.id, del_hash: sha(del) });
  await recount(me.room_id);
  return ok({ id: p.id, del, created_at: p.created_at });
}
