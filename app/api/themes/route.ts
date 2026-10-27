import { adminOk, db, fail, ok, readJson, setPhase } from "@/lib/server";

type Theme = { title: string; summary: string; post_ids: string[] };
type Direction = { title: string; why: string };

export async function POST(req: Request) {
  const b = await readJson(req);
  if (!adminOk(b.k)) return fail("管理キーが違います", 403);
  const r = process.env.ROOM_CODE!;

  const [{ data: posts }, { data: votes }, { data: wak }, { data: replies }] = await Promise.all([
    db().from("posts").select("id, body").eq("room_id", r).eq("hidden", false),
    db().from("votes").select("post_id").eq("room_id", r),
    db().from("wakaru").select("target_id").eq("room_id", r),
    db().from("replies").select("post_id, body, is_solution").eq("room_id", r).eq("hidden", false),
  ]);
  const count = (rows: { [k: string]: string }[] | null, key: string, id: string) => (rows ?? []).filter((x) => x[key] === id).length;
  const items = (posts ?? []).map((p) => ({
    id: p.id,
    body: p.body,
    votes: count(votes, "post_id", p.id),
    wakaru: count(wak, "target_id", p.id),
    solutions: (replies ?? []).filter((x) => x.post_id === p.id && x.is_solution).map((x) => x.body),
  }));

  let themes: Theme[] = [];
  let directions: Direction[] = [];
  let fallback = true;

  if (process.env.ANTHROPIC_API_KEY && items.length > 0) {
    try {
      const prompt = `あなたはチームのブレスト進行役です。社内チームが出した「困りごと」一覧(JSON)を、似たもの同士で3〜5個のテーマにまとめてください。
その上で、チームが6か月でデモまで作れそうなプロダクトの方向性を2〜3個提案してください。票(votes)と共感(wakaru)が多いものを重視し、解決案(solutions)も参考にすること。
出力はJSONのみ。形式:
{"themes":[{"title":"短いテーマ名","summary":"1文","post_ids":["..."]}],"directions":[{"title":"プロダクト案の名前","why":"誰のどんな困りごとを解決するか1文"}]}

困りごと:
${JSON.stringify(items)}`;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(45000),
      });
      const j = await res.json();
      const text: string = j?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
      const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      const valid = new Set(items.map((i) => i.id));
      themes = (parsed.themes ?? []).map((t: Theme) => ({
        title: String(t.title ?? ""),
        summary: String(t.summary ?? ""),
        post_ids: (t.post_ids ?? []).filter((id) => valid.has(id)),
      }));
      directions = (parsed.directions ?? []).map((d: Direction) => ({ title: String(d.title ?? ""), why: String(d.why ?? "") }));
      fallback = themes.length === 0;
    } catch {
      fallback = true;
    }
  }

  const ranking = [...items].sort((a, b) => b.votes - a.votes || b.wakaru - a.wakaru).slice(0, 10);
  await db()
    .from("rooms")
    .update({ themes: { fallback, themes, directions, ranking, at: new Date().toISOString() } })
    .eq("id", r);
  await setPhase(r, "themes");
  return ok({ fallback });
}
