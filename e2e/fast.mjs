#!/usr/bin/env node
// Fast E2E (<2 min): jumps phases with the admin API instead of waiting on PHASE_MIN_SECONDS.
// WIPES the board (reset) at start and end, then restores expected=5.
// env: ROOM_CODE, ADMIN_KEY, optional BASE, SUPABASE_URL + SUPABASE_KEY (to read room phase)
// usage: ROOM_CODE=... ADMIN_KEY=... node e2e/fast.mjs

const BASE = (process.env.BASE || "https://komarigoto-board-one.vercel.app").replace(/\/$/, "");
const R = process.env.ROOM_CODE, K = process.env.ADMIN_KEY;
const SB_URL = process.env.SUPABASE_URL, SB_KEY = process.env.SUPABASE_KEY;
if (!R || !K) { console.error("ROOM_CODE and ADMIN_KEY are required"); process.exit(2); }

const rows = [];
const fivexx = [];
const step = (n, pass, note = "") => rows.push({ n, pass: !!pass, note });

async function post(path, body) {
  const res = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let j = {};
  try { j = await res.json(); } catch {}
  if (res.status >= 500) fivexx.push(`${path} ${res.status} ${JSON.stringify(j)}`);
  return { status: res.status, ...j };
}
const admin = (action, extra = {}) => post("/api/admin", { k: K, action, ...extra });
const as = (u) => ({ r: R, pid: u.pid, secret: u.secret });
const all = (...xs) => xs.every(Boolean);
const brief = (...xs) => xs.map((x) => (x.ok ? "ok" : `${x.status}:${x.error ?? ""}`)).join(" / ");

async function roomPhase() {
  if (!SB_URL || !SB_KEY) return null;
  const res = await fetch(`${SB_URL}/rest/v1/rooms?id=eq.${encodeURIComponent(R)}&select=phase`, { headers: { apikey: SB_KEY } });
  return (await res.json())[0]?.phase ?? null;
}

async function main() {
  const t0 = Date.now();

  // 1
  const a1 = await admin("reset"), a2 = await admin("expected", { n: 1 });
  step("1 reset + expected=1", a1.ok && a2.ok, brief(a1, a2));

  // 2
  const jA = await post("/api/join", { r: R, nickname: "E2E_A" });
  const jB = await post("/api/join", { r: R, nickname: "E2E_B" });
  const A = jA, B = jB;
  step("2 join A, B", all(jA.ok, jA.pid, jA.secret, jB.ok, jB.pid, jB.secret), brief(jA, jB));

  // 3
  const ph1 = await admin("phase", { to: "post" });
  step("3 phase→post", ph1.ok, brief(ph1));

  // 4
  const p1 = await post("/api/post", { ...as(A), body: "テスト1" });
  const p2 = await post("/api/post", { ...as(A), body: "テスト2" });
  const p3 = await post("/api/post", { ...as(A), body: "テスト3" });
  const p4 = await post("/api/post", { ...as(B), body: "テスト4" });
  step("4 posts p1–p4", all(p1.id, p1.del, p2.id, p3.id, p4.id), brief(p1, p2, p3, p4));

  // 5
  const d1 = await post("/api/delete", { r: R, id: p1.id, del: p1.del });
  const d2 = await post("/api/delete", { r: R, id: p2.id, del: "WRONG" });
  step("5 delete own p1 / wrong token p2", d1.ok && !d2.ok && d2.status === 403, `p1:${brief(d1)} p2:${d2.status}`);

  // 6
  const v0 = await post("/api/vote", { ...as(A), postId: p2.id });
  step("6 vote blocked in post", !v0.ok, `${v0.status}:${v0.error ?? ""}`);

  // 7
  const ph2 = await admin("phase", { to: "react" });
  const w1 = await post("/api/wakaru", { ...as(A), targetType: "post", targetId: p2.id });
  const w2 = await post("/api/wakaru", { ...as(A), targetType: "post", targetId: p2.id });
  const r1 = await post("/api/reply", { ...as(B), postId: p2.id, body: "なるほど" });
  const r2 = await post("/api/reply", { ...as(B), postId: p2.id, body: "こうしたら？", isSolution: true });
  step("7 react: わかる on/off, reply, solution", all(ph2.ok, w1.on === true, w2.on === false, r1.ok, r2.ok),
    `phase:${brief(ph2)} wakaru:${w1.on}/${w2.on} reply:${brief(r1, r2)}`);

  // 8
  const ph3 = await admin("phase", { to: "vote" });
  const va = [await post("/api/vote", { ...as(A), postId: p2.id }), await post("/api/vote", { ...as(A), postId: p3.id }), await post("/api/vote", { ...as(A), postId: p4.id })];
  const vOff = await post("/api/vote", { ...as(A), postId: p2.id });
  const vOn = await post("/api/vote", { ...as(A), postId: p2.id });
  const vb = [await post("/api/vote", { ...as(B), postId: p2.id }), await post("/api/vote", { ...as(B), postId: p3.id }), await post("/api/vote", { ...as(B), postId: p4.id })];
  const v4 = await post("/api/vote", { ...as(A), postId: "00000000-0000-0000-0000-000000000000" });
  step("8 vote: 3 each, toggle, 4th rejected",
    all(ph3.ok, va.every((v) => v.on === true), vOff.on === false, vOn.on === true, vb.every((v) => v.on === true), !v4.ok, /3票まで/.test(v4.error ?? "")),
    `A:${va.map((v) => v.on)} toggle:${vOff.on}/${vOn.on} B:${vb.map((v) => v.on)} 4th:${v4.status}:${v4.error ?? ""}`);

  // 9
  const dn = await post("/api/done", as(A));
  const du = await post("/api/done", { ...as(A), undo: true });
  step("9 done / undo", dn.done === true && du.done === false, `done:${dn.done} undo:${du.done}`);

  // 10
  const tk = await post("/api/tick", { r: R });
  step("10 tick", tk.ok, `advanced:${tk.advanced}`);

  // 11
  const ex = await admin("extend", { seconds: 60 }), st = await admin("stopTimer");
  step("11 extend / stopTimer", ex.ok && st.ok, brief(ex, st));

  // 12
  const ph4 = await admin("phase", { to: "free" });
  const late = await post("/api/post", { ...as(A), body: "あとから" });
  const vf = await post("/api/vote", { ...as(A), postId: p2.id }); // toggle off is fine — proves vote is open
  const rf = await post("/api/reply", { ...as(B), postId: p3.id, body: "フリーでコメント" });
  step("12 free: late post, vote, reply", all(ph4.ok, late.ok, vf.ok, rf.ok), brief(ph4, late, vf, rf));

  // 13
  const ls = await admin("list");
  const ids = new Set((ls.posts ?? []).map((p) => p.id));
  const bodies = (ls.posts ?? []).map((p) => p.body);
  step("13 list", all(ls.ok, !ids.has(p1.id), ids.has(p2.id), ids.has(p3.id), ids.has(p4.id), bodies.includes("あとから"), (ls.replies ?? []).length >= 3),
    `posts:${bodies.join(",")} replies:${(ls.replies ?? []).length}`);

  // 14
  const hd = await admin("hide", { type: "post", id: p4.id });
  const ls2 = await admin("list");
  const h4 = (ls2.posts ?? []).find((p) => p.id === p4.id);
  step("14 hide p4", hd.ok && h4?.hidden === true, `hidden:${h4?.hidden}`);

  // 15
  const exr = await fetch(`${BASE}/api/export?k=${encodeURIComponent(K)}`);
  const csv = await exr.text();
  if (exr.status >= 500) fivexx.push(`/api/export ${exr.status}`);
  step("15 export CSV", exr.status === 200 && /text\/csv/.test(exr.headers.get("content-type") ?? "") && csv.includes("テスト2"),
    `${exr.status} ${exr.headers.get("content-type")} ${csv.split("\r\n").length - 1} rows`);

  // 16
  const th = await post("/api/themes", { k: K });
  const info = await admin("info");
  const ph = await roomPhase();
  step("16 themes", th.ok && info.ok && (ph === null || ph === "themes"), `fallback:${th.fallback} phase:${ph ?? "n/a"} ${th.ok ? "" : th.status + ":" + (th.error ?? "")}`);

  // 17
  const n1 = await post("/api/join", { r: "WRONG", nickname: "x" });
  const n2 = await post("/api/post", { r: R, pid: "fake", secret: "fake", body: "x" });
  const n3 = await post("/api/admin", { k: "WRONG", action: "info" });
  const n4 = await fetch(`${BASE}/api/export?k=WRONG`);
  step("17 auth negatives", n1.status === 403 && !n1.ok && n2.status === 401 && !n2.ok && n3.status === 403 && !n3.ok && n4.status === 403,
    `join:${n1.status} post:${n2.status} admin:${n3.status} export:${n4.status}`);

  // 18
  const bad = [];
  for (const page of ["join", "screen"]) for (const p of ["lobby", "post", "react", "vote", "free", "themes"]) {
    const res = await fetch(`${BASE}/${page}?demo=1&phase=${p}`);
    const html = await res.text();
    if (res.status !== 200 || !html.includes("<html")) bad.push(`${page}/${p}:${res.status}`);
  }
  step("18 demo pages ×12", bad.length === 0, bad.join(" ") || "all 200");

  // 19
  const c1 = await admin("reset"), c2 = await admin("expected", { n: 5 });
  const ph5 = await roomPhase();
  step("19 cleanup reset + expected=5", c1.ok && c2.ok && (ph5 === null || ph5 === "lobby"), `${brief(c1, c2)} phase:${ph5 ?? "n/a"}`);

  return Date.now() - t0;
}

main()
  .then((ms) => {
    console.log("| step | | note |\n|---|---|---|");
    for (const r of rows) console.log(`| ${r.n} | ${r.pass ? "✅" : "❌"} | ${String(r.note).replace(/\|/g, "/")} |`);
    const failed = rows.filter((r) => !r.pass);
    console.log(`\nOverall: ${failed.length ? "FAIL" : "PASS"} (${rows.length - failed.length}/${rows.length}, ${(ms / 1000).toFixed(1)}s)`);
    if (fivexx.length) console.log("5xx: " + fivexx.join("; "));
    process.exit(failed.length ? 1 : 0);
  })
  .catch(async (e) => {
    console.log("CRASH " + e);
    try { await admin("reset"); await admin("expected", { n: 5 }); console.log("cleanup done"); } catch {}
    process.exit(1);
  });
