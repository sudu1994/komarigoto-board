import { db, fail, getRoom, ok, readJson, who } from "@/lib/server";

export async function POST(req: Request) {
  const b = await readJson(req);
  const me = await who(b as { r: string; pid: string; secret: string });
  if (!me) return fail("参加し直してね", 401);
  const room = await getRoom(me.room_id);
  if (!room || !["react", "vote", "free"].includes(room.phase)) return fail("いまは反応できないタイムです");
  const targetType = b.targetType === "reply" ? "reply" : "post";
  const targetId = String(b.targetId ?? "");
  if (!targetId) return fail("対象がありません");

  const { data: existing } = await db()
    .from("wakaru")
    .select("id")
    .eq("target_id", targetId)
    .eq("participant_id", me.id)
    .maybeSingle();
  if (existing) {
    await db().from("wakaru").delete().eq("id", existing.id);
    return ok({ on: false });
  }
  const { error } = await db()
    .from("wakaru")
    .insert({ room_id: me.room_id, target_type: targetType, target_id: targetId, participant_id: me.id, nickname: me.nickname });
  if (error) return fail("できませんでした", 500);
  return ok({ on: true });
}
