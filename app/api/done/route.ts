import { db, fail, getRoom, maybeAdvance, ok, readJson, who } from "@/lib/server";

export async function POST(req: Request) {
  const b = await readJson(req);
  const me = await who(b as { r: string; pid: string; secret: string });
  if (!me) return fail("参加し直してね", 401);
  const room = await getRoom(me.room_id);
  if (!room || !["post", "react", "vote"].includes(room.phase)) return fail("いまは完了ボタンはないよ");
  if (b.undo) {
    await db().from("done").delete().eq("room_id", me.room_id).eq("phase", room.phase).eq("participant_id", me.id);
    return ok({ done: false });
  }
  await db().from("done").upsert({ room_id: me.room_id, phase: room.phase, participant_id: me.id });
  const advanced = await maybeAdvance(me.room_id);
  return ok({ done: true, advanced });
}
