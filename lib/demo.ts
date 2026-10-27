import type { Board } from "./client";
import type { Phase } from "./phases";

/** sample data for rehearsal: add ?demo=1&phase=react to any page */
export function demoBoard(phase: Phase): Board {
  const names = ["なかの", "モモ", "すえなが", "ふるい", "ユウキ", "レン"];
  const participants = names.map((n, i) => ({ id: "u" + i, nickname: n, created_at: "" }));
  const bodies = [
    "会議の日程調整がめんどすぎる",
    "経費精算のレシート、毎回なくす",
    "新しい現場に入ると、だれに何を聞けばいいかわからない",
    "勉強したいけど何から始めればいいか迷う",
    "Slackの通知が多すぎて大事なのを見逃す",
    "ランチの店がいつも同じになる",
    "ドキュメントがどこにあるか毎回さがす",
  ];
  const posts = bodies.map((b, i) => ({ id: "p" + i, body: b, late: false, created_at: new Date(Date.now() - (9 - i) * 60000).toISOString() }));
  const wk = [[0, 1, 2, 3], [0, 4], [1, 2, 3, 5, 0], [4], [2, 3, 1], [], [5, 1]];
  const wakaru = wk.flatMap((ids, pi) =>
    ids.map((u) => ({ id: `w${pi}-${u}`, target_type: "post" as const, target_id: "p" + pi, participant_id: "u" + u, nickname: names[u] })),
  );
  const replies = [
    { id: "r0", post_id: "p2", participant_id: "u1", nickname: "モモ", body: "わかる、最初の1週間つらい", is_solution: false, created_at: "" },
    { id: "r1", post_id: "p2", participant_id: "u3", nickname: "ふるい", body: "現場ごとの『聞く人マップ』を作れたら便利かも", is_solution: true, created_at: "" },
    { id: "r2", post_id: "p0", participant_id: "u4", nickname: "ユウキ", body: "候補日を投げるだけで決まってほしい", is_solution: false, created_at: "" },
  ];
  const votes = [
    ["p2", 0], ["p2", 1], ["p2", 3], ["p0", 2], ["p0", 4], ["p4", 5], ["p2", 5], ["p6", 1],
  ].map(([p, u], i) => ({ id: "v" + i, post_id: p as string, participant_id: "u" + u }));
  const done = [0, 1, 2, 4].map((u) => ({ phase, participant_id: "u" + u }));
  return {
    room: {
      id: "demo",
      phase,
      phase_ends_at: ["post", "react", "vote"].includes(phase) ? new Date(Date.now() + 263000).toISOString() : null,
      expected: 6,
      nice_threshold: 3,
      post_count: posts.length,
      themes:
        phase === "themes"
          ? {
              fallback: false,
              themes: [
                { title: "現場になじむまでが大変", summary: "新しい現場で誰に何を聞くかわからない不安", post_ids: ["p2", "p6"] },
                { title: "連絡・調整のムダ", summary: "日程調整や通知の多さで時間が溶ける", post_ids: ["p0", "p4"] },
                { title: "ちょっとした事務作業", summary: "経費精算など地味な手間", post_ids: ["p1"] },
              ],
              directions: [
                { title: "現場オンボーディング・ナビ", why: "SES初日の人が、聞く相手と資料にすぐたどり着ける" },
                { title: "ゆる日程ボット", why: "Slackで候補を投げるだけで会議が決まる" },
              ],
              ranking: [],
            }
          : null,
    },
    participants,
    posts: phase === "post" || phase === "lobby" ? [] : posts,
    replies,
    wakaru,
    votes,
    done,
  };
}
