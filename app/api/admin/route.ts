import { PHASES, Phase } from "@/lib/phases";
import { adminOk, db, ensureRoom, fail, getRoom, ok, readJson, setPhase } from "@/lib/server";

export async function POST(req: Request) {
  const b = await readJson(req);
  if (!adminOk(b.k)) return fail("管理キーが違います", 403);
  const r = process.env.ROOM_CODE!;
  await ensureRoom(r);

  switch (b.action) {
    case "info":
      return ok({ r });
    case "phase": {
      const to = b.to as Phase;
      if (!PHASES.includes(to)) return fail("unknown phase");
      await setPhase(r, to);
      return ok();
    }
    case "extend": {
      const room = await getRoom(r);
      const base = room?.phase_ends_at ? Math.max(new Date(room.phase_ends_at).getTime(), Date.now()) : Date.now();
      const secs = Number(b.seconds ?? 120);
      await db().from("rooms").update({ phase_ends_at: new Date(base + secs * 1000).toISOString() }).eq("id", r);
      return ok();
    }
    case "stopTimer":
      await db().from("rooms").update({ phase_ends_at: null }).eq("id", r);
      return ok();
    case "expected":
      await db().from("rooms").update({ expected: Math.max(1, Number(b.n) || 6) }).eq("id", r);
      return ok();
    case "threshold":
      await db().from("rooms").update({ nice_threshold: Math.max(1, Number(b.n) || 3) }).eq("id", r);
      return ok();
    case "hide": {
      const table = b.type === "reply" ? "replies" : "posts";
      await db().from(table).update({ hidden: true }).eq("id", String(b.id));
      return ok();
    }
    case "list": {
      // admin sees everything, including posts during the posting phase (still anonymous)
      const [posts, replies] = await Promise.all([
        db().from("posts").select("*").eq("room_id", r).order("created_at"),
        db().from("replies").select("*").eq("room_id", r).order("created_at"),
      ]);
      return ok({ posts: posts.data ?? [], replies: replies.data ?? [] });
    }
    case "reset":
      // wipes the board but keeps the room
      await db().from("posts").delete().eq("room_id", r);
      await db().from("participants").delete().eq("room_id", r);
      await db().from("done").delete().eq("room_id", r);
      await db()
        .from("rooms")
        .update({ phase: "lobby", phase_ends_at: null, themes: null, post_count: 0 })
        .eq("id", r);
      return ok();
    default:
      return fail("unknown action");
  }
}
