import { db, ensureRoom, fail, ok, readJson, roomOk, sha, token, who } from "@/lib/server";

export async function POST(req: Request) {
  const b = await readJson(req);
  if (!roomOk(b.r)) return fail("ルームコードが違います", 403);
  const nickname = String(b.nickname ?? "").trim().slice(0, 16);
  if (!nickname) return fail("ニックネームを入れてね");
  await ensureRoom(b.r);

  // rejoin: same phone keeps its identity, just renames
  const me = await who(b as { r: string; pid?: string; secret?: string });
  if (me) {
    await db().from("participants").update({ nickname }).eq("id", me.id);
    await db().from("wakaru").update({ nickname }).eq("participant_id", me.id);
    await db().from("replies").update({ nickname }).eq("participant_id", me.id);
    return ok({ pid: me.id, secret: b.secret, nickname });
  }

  const { data: p, error } = await db().from("participants").insert({ room_id: b.r, nickname }).select("id").single();
  if (error || !p) return fail("参加できませんでした", 500);
  const secret = token();
  await db().from("participant_secrets").insert({ participant_id: p.id, secret_hash: sha(secret) });
  return ok({ pid: p.id, secret, nickname });
}
