import { ensureRoom, fail, maybeAdvance, ok, readJson, roomOk } from "@/lib/server";

/** called by the monitor/phones when a timer (incl. the lobby fallback) runs out — the server re-checks and advances at most once */
export const maxDuration = 60;

export async function POST(req: Request) {
  const b = await readJson(req);
  if (!roomOk(b.r)) return fail("ルームコードが違います", 403);
  await ensureRoom(b.r); // the monitor opens before anyone joins — create the room so its QR shows
  return ok({ advanced: await maybeAdvance(b.r) });
}
