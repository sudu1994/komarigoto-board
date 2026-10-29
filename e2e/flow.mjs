#!/usr/bin/env node
// Full-session E2E: monitor opens → 6 phones join from the QR URL → post → react → vote → free → themes.
// No admin key needed: the board advances on its own (6 joins start it; all 完了 + phase minimum ends each phase).
// Takes ~30 min because of PHASE_MIN_SECONDS. Leaves test data in the room — reset it from /admin afterwards.
//
// env: BASE (default prod), ROOM_CODE (required),
//      SUPABASE_URL + SUPABASE_KEY (publishable key, to read board state like the screen does),
//      SKIP_BROWSER=1 to skip the Playwright monitor/QR check.
//
// usage: ROOM_CODE=... SUPABASE_URL=... SUPABASE_KEY=... node e2e/flow.mjs

const BASE = (process.env.BASE || "https://komarigoto-board-one.vercel.app").replace(/\/$/, "");
const R = process.env.ROOM_CODE;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
if (!R || !SB_URL || !SB_KEY) {
  console.error("ROOM_CODE, SUPABASE_URL and SUPABASE_KEY are required");
  process.exit(2);
}

const PHONES = 6; // START_AT
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  return pass;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ r: R, ...body }),
  });
  let json = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, ...json };
}

async function sb(table, query) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}` } });
  if (!res.ok) throw new Error(`supabase ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}
const room = async () => (await sb("rooms", `id=eq.${encodeURIComponent(R)}&select=*`))[0];

/** keep ticking (like the monitor does) until the phase changes from `from`; returns the new phase */
async function waitPhase(from, maxSec) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxSec * 1000) {
    await api("/api/tick", {});
    const rm = await room();
    if (rm.phase !== from) return rm.phase;
    const left = rm.phase_ends_at ? Math.round((new Date(rm.phase_ends_at) - Date.now()) / 1000) : "-";
    process.stdout.write(`   …${from} (ends in ${left}s)\r`);
    await sleep(10_000);
  }
  return from;
}

async function monitorCheck() {
  if (process.env.SKIP_BROWSER) return console.log("⏭  monitor/QR browser check skipped");
  let chromium;
  try { ({ chromium } = await import("playwright")); } catch { return console.log("⏭  playwright not installed — monitor/QR check skipped"); }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${BASE}/screen?r=${encodeURIComponent(R)}`);
    const qr = page.locator('img[alt="参加用QRコード"]');
    await qr.waitFor({ timeout: 20_000 });
    const src = await qr.getAttribute("src");
    check("monitor shows QR code", !!src && src.startsWith("data:image/png"));
    const want = `${BASE}/join?r=${encodeURIComponent(R)}`;
    check("monitor shows join URL", (await page.content()).includes(want.replace(/&/g, "&amp;")) || (await page.getByText(want).count()) > 0, want);
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const res = await phone.goto(want);
    check("join page opens from QR URL", res?.status() === 200);
  } catch (e) {
    check("monitor/QR check", false, String(e).slice(0, 200));
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log(`## E2E flow — ${BASE} — ${new Date().toISOString()}\n`);

  // 0. monitor opens → room exists, must be fresh
  const t = await api("/api/tick", {});
  if (!check("tick creates/loads room", t.ok === true, JSON.stringify(t))) return;
  const r0 = await room();
  if (!check("room is in lobby", r0?.phase === "lobby", `phase=${r0?.phase}`)) {
    console.log("   → board isn't fresh; reset it from /admin first");
    return;
  }
  const already = (await sb("participants", `room_id=eq.${encodeURIComponent(R)}&select=id`)).length;
  if (!check("lobby empty", already === 0, `${already} already joined`)) return;

  await monitorCheck();

  // 1. lobby: phones join; the 6th join starts the board
  const phones = [];
  for (let i = 0; i < PHONES; i++) {
    const j = await api("/api/join", { nickname: `E2E-${i + 1}` });
    if (!check(`phone ${i + 1} joins`, j.ok && j.pid && j.secret, j.error)) return;
    phones.push({ pid: j.pid, secret: j.secret, started: j.started });
  }
  check("6th join starts board", phones[PHONES - 1].started === true);
  check("phase = post", (await room()).phase === "post");
  const me = (p) => ({ pid: p.pid, secret: p.secret });

  // rejoin keeps identity
  const re = await api("/api/join", { ...me(phones[0]), nickname: "E2E-1b" });
  check("rejoin keeps pid", re.ok && re.pid === phones[0].pid);

  // 2. post
  const posts = [];
  for (const [i, p] of phones.entries()) {
    const r = await api("/api/post", { ...me(p), body: `E2Eテスト困りごと ${i + 1}` });
    if (!check(`phone ${i + 1} posts`, r.ok && r.id, r.error)) return;
    posts.push(r.id);
  }
  const extra = await api("/api/post", { ...me(phones[0]), body: "E2E 消すやつ" });
  check("bad delete token rejected", (await api("/api/delete", { id: extra.id, del: "WRONG" })).ok === false);
  check("own delete within 2 min", (await api("/api/delete", { id: extra.id, del: extra.del })).ok === true);
  check("vote blocked during post", (await api("/api/vote", { ...me(phones[0]), postId: posts[1] })).ok === false);
  check("empty post rejected", (await api("/api/post", { ...me(phones[0]), body: "  " })).ok === false);
  check("fake pid rejected", (await api("/api/post", { pid: "fake", secret: "fake", body: "x" })).status === 401);
  const d = await api("/api/done", { ...me(phones[0]) });
  check("done", d.ok && d.done === true);
  check("undo done", (await api("/api/done", { ...me(phones[0]), undo: true })).done === false);
  for (const p of phones) await api("/api/done", me(p));
  console.log("   all 完了 — waiting for post minimum (8 min)…");
  if (!check("post → react", (await waitPhase("post", 13 * 60)) === "react")) return;

  // 3. react
  const w1 = await api("/api/wakaru", { ...me(phones[0]), targetType: "post", targetId: posts[1] });
  const w2 = await api("/api/wakaru", { ...me(phones[0]), targetType: "post", targetId: posts[1] });
  check("わかる on/off toggle", w1.on === true && w2.on === false);
  for (const [i, p] of phones.entries()) await api("/api/wakaru", { ...me(p), targetType: "post", targetId: posts[(i + 1) % PHONES] });
  check("reply", (await api("/api/reply", { ...me(phones[1]), postId: posts[0], body: "なるほど" })).ok === true);
  check("post blocked during react", (await api("/api/post", { ...me(phones[0]), body: "x" })).ok === false);
  for (const p of phones) await api("/api/done", me(p));
  console.log("   all 完了 — waiting for react minimum (6 min)…");
  if (!check("react → vote", (await waitPhase("react", 11 * 60)) === "vote")) return;

  // 4. vote: 3 each, 4th rejected, toggle frees a vote
  for (const [i, p] of phones.entries()) {
    for (let k = 1; k <= 3; k++) await api("/api/vote", { ...me(p), postId: posts[(i + k) % PHONES] });
  }
  const v4 = await api("/api/vote", { ...me(phones[0]), postId: posts[0] });
  check("4th vote rejected (3票まで)", v4.ok === false && /3票まで/.test(v4.error || ""), v4.error);
  const off = await api("/api/vote", { ...me(phones[0]), postId: posts[1] });
  const on = await api("/api/vote", { ...me(phones[0]), postId: posts[0] });
  check("vote toggle frees a slot", off.on === false && on.on === true);
  const votes = await sb("votes", `room_id=eq.${encodeURIComponent(R)}&select=id`);
  check("18 votes recorded", votes.length === PHONES * 3, `${votes.length}`);
  for (const p of phones) await api("/api/done", me(p));
  console.log("   all 完了 — waiting for vote minimum (5 min)…");
  if (!check("vote → free", (await waitPhase("vote", 10 * 60)) === "free")) return;

  // 5. free: solutions + late post
  check("solution reply", (await api("/api/reply", { ...me(phones[2]), postId: posts[0], body: "こうしたら？", isSolution: true })).ok === true);
  const late = await api("/api/post", { ...me(phones[3]), body: "E2E 遅れて投稿" });
  check("late post in free", late.ok === true);
  for (const p of phones) await api("/api/done", me(p));
  console.log("   all 完了 — waiting for free minimum (10 min) + theme generation…");
  if (!check("free → themes", (await waitPhase("free", 17 * 60)) === "themes")) return;

  // 6. themes
  const fin = await room();
  const themes = fin.themes;
  check("themes generated", Array.isArray(themes) ? themes.length > 0 : !!themes, JSON.stringify(themes).slice(0, 200));
}

main()
  .catch((e) => check("unexpected error", false, String(e)))
  .finally(() => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} passed — Overall: ${failed.length ? "FAIL" : "PASS"}`);
    if (failed.length) console.log("Failed: " + failed.map((f) => f.name).join(", "));
    console.log("⚠ test data (E2E-* nicknames/posts) is still in the room — reset from /admin");
    process.exit(failed.length ? 1 : 0);
  });
