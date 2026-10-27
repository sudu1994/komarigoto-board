import { fail, maybeAdvance, ok, readJson, roomOk } from "@/lib/server";

/** called by the monitor when a timer runs out — the server re-checks and advances at most once */
export async function POST(req: Request) {
  const b = await readJson(req);
  if (!roomOk(b.r)) return fail("ルームコードが違います", 403);
  return ok({ advanced: await maybeAdvance(b.r) });
}
