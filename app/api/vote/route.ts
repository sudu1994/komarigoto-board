import { VOTES_PER_PERSON } from "@/lib/phases";
import { db, fail, getRoom, ok, readJson, who } from "@/lib/server";

export async function POST(req: Request) {
  const b = await readJson(req);
  const me = await who(b as { r: string; pid: string; secret: string });
  if (!me) return fail("参加し直してね", 401);
  const room = await getRoom(me.room_id);
  if (!room || !["vote", "free"].includes(room.phase)) return fail("いまは投票タイムじゃないよ");
  const postId = String(b.postId ?? "");
  if (!postId) return fail("対象がありません");

  const { data: existing } = await db().from("votes").select("id").eq("post_id", postId).eq("participant_id", me.id).maybeSingle();
  if (existing) {
    await db().from("votes").delete().eq("id", existing.id);
    return ok({ on: false });
  }
  const { count } = await db()
    .from("votes")
    .select("*", { count: "exact", head: true })
    .eq("room_id", me.room_id)
    .eq("participant_id", me.id);
  if ((count ?? 0) >= VOTES_PER_PERSON) return fail(`投票は${VOTES_PER_PERSON}票までだよ`);
  const { error } = await db().from("votes").insert({ room_id: me.room_id, post_id: postId, participant_id: me.id });
  if (error) return fail("投票できませんでした", 500);
  return ok({ on: true });
}
