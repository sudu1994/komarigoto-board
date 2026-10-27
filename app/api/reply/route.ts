import { db, fail, getRoom, ok, readJson, who } from "@/lib/server";

export async function POST(req: Request) {
  const b = await readJson(req);
  const me = await who(b as { r: string; pid: string; secret: string });
  if (!me) return fail("参加し直してね", 401);
  const room = await getRoom(me.room_id);
  if (!room || !["react", "vote", "free"].includes(room.phase)) return fail("いまはコメントできないタイムです");
  const body = String(b.body ?? "").trim().slice(0, 200);
  const postId = String(b.postId ?? "");
  if (!body || !postId) return fail("なにか書いてね");
  const { error } = await db().from("replies").insert({
    room_id: me.room_id,
    post_id: postId,
    participant_id: me.id,
    nickname: me.nickname,
    body,
    is_solution: !!b.isSolution,
  });
  if (error) return fail("送れませんでした", 500);
  return ok();
}
