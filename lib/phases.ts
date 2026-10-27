export type Phase = "lobby" | "post" | "react" | "vote" | "free" | "themes";

export const PHASES: Phase[] = ["lobby", "post", "react", "vote", "free", "themes"];

/** default seconds per phase (null = no timer) */
export const PHASE_SECONDS: Record<Phase, number | null> = {
  lobby: null,
  post: 600,
  react: 600,
  vote: 300,
  free: null,
  themes: null,
};

export const nextPhase = (p: Phase): Phase | null => PHASES[PHASES.indexOf(p) + 1] ?? null;

export const PHASE_LABEL: Record<Phase, string> = {
  lobby: "まもなくスタート",
  post: "投稿タイム",
  react: "わかる！タイム",
  vote: "投票タイム",
  free: "フリータイム",
  themes: "テーマ発表",
};

export const PHASE_HINT: Record<Phase, string> = {
  lobby: "みんなが集まるまで待っててね",
  post: "困りごとをどんどん書こう（匿名だよ）。書けたら「完了」を押してね",
  react: "「わかる！」やコメントで反応しよう。終わったら「完了」",
  vote: "いいなと思う困りごとに3票まで投票！終わったら「完了」",
  free: "上位の困りごとに解決案💡を書こう。スレッドで話そう",
  themes: "画面を見てね！みんなの困りごとをテーマにまとめたよ",
};

export const VOTES_PER_PERSON = 3;
export const DELETE_WINDOW_MS = 2 * 60 * 1000;
