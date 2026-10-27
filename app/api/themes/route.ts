import { adminOk, fail, ok, readJson, setPhase } from "@/lib/server";
import { generateThemes } from "@/lib/themes";

export async function POST(req: Request) {
  const b = await readJson(req);
  if (!adminOk(b.k)) return fail("管理キーが違います", 403);
  const r = process.env.ROOM_CODE!;
  const { fallback } = await generateThemes(r);
  await setPhase(r, "themes");
  return ok({ fallback });
}
