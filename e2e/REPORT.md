# E2E Report — 困りごとボード (production)

- **Target:** https://komarigoto-board-one.vercel.app
- **Date:** 2026-10-29 (JST 16:46)
- **Script:** [`e2e/fast.mjs`](./fast.mjs) — run from a Vercel Sandbox (iad1)
- **Method:** HTTP calls against the live APIs. Phases jumped with the admin API (no waiting on `PHASE_MIN_SECONDS`).
- **Result:** ✅ **PASS — 19/19 steps, 114.8 s, no 5xx**
- **Board state after run:** reset, phase `lobby`, expected = 5 (ready for the real meeting)

| # | Step | Result |
|---|---|---|
| 1 | Reset + expected=1 | ✅ |
| 2 | Join A, B | ✅ |
| 3 | Phase → post | ✅ |
| 4 | Post p1–p4 | ✅ |
| 5 | Delete (own / wrong token) | ✅ |
| 6 | Vote blocked in post | ✅ |
| 7 | React: わかる, reply, solution | ✅ |
| 8 | Vote: limit + toggle | ✅ |
| 9 | 完了 / undo | ✅ |
| 10 | Tick | ✅ |
| 11 | Extend / stop timer | ✅ |
| 12 | Free phase actions | ✅ |
| 13 | Admin list | ✅ |
| 14 | Admin hide | ✅ |
| 15 | CSV export | ✅ |
| 16 | Theme generation | ✅ |
| 17 | Auth negatives | ✅ |
| 18 | Demo pages | ✅ |
| 19 | Cleanup | ✅ |

---

## Step reports

### 1. Reset + expected=1 — ✅
- **Purpose:** start from a clean board and let a small test group run it.
- **Calls:** `POST /api/admin {action:"reset"}`, `POST /api/admin {action:"expected", n:1}`
- **Expected:** `ok:true` for both.
- **Actual:** `ok / ok`. Board wiped (posts, participants, 完了 marks), phase `lobby`.

### 2. Join A, B — ✅
- **Purpose:** the phone join flow behind the QR code (`/join?r=…` → `/api/join`).
- **Calls:** `POST /api/join {nickname:"E2E_A"}`, `{nickname:"E2E_B"}`
- **Expected:** each returns `pid` (UUID) + `secret` token + nickname.
- **Actual:** both returned `pid` and `secret`. Identities used for every later call.

### 3. Phase → post — ✅
- **Purpose:** leader forces the board into the posting phase.
- **Call:** `POST /api/admin {action:"phase", to:"post"}`
- **Actual:** `ok:true`.

### 4. Post p1–p4 — ✅
- **Purpose:** anonymous posting.
- **Calls:** A posts テスト1/2/3, B posts テスト4.
- **Expected:** each returns `id`, `del` token, `created_at`.
- **Actual:** 4 ids returned; p1's delete token saved.

### 5. Delete own post / wrong token — ✅
- **Purpose:** a poster can undo within 2 min; nobody else can delete.
- **Calls:** `POST /api/delete {id:p1, del:<p1 token>}`, `{id:p2, del:"WRONG"}`
- **Expected:** p1 `ok:true`; p2 `403`.
- **Actual:** p1 deleted; p2 rejected with `403`.

### 6. Vote blocked during post — ✅
- **Purpose:** phase gating — voting only opens in vote/free.
- **Call:** `POST /api/vote` as A on p2 while phase = post.
- **Expected:** `ok:false`.
- **Actual:** `400 いまは投票タイムじゃないよ`.

### 7. React: わかる！, reply, solution — ✅
- **Purpose:** reactions and comments in the react phase.
- **Calls:** admin phase→react; わかる！ A on p2 twice; B replies なるほど; B replies with `isSolution:true`.
- **Expected:** わかる `on:true` then `on:false` (toggle); both replies `ok:true`.
- **Actual:** `true → false`; both replies ok.

### 8. Vote: 3-vote limit + toggle — ✅
- **Purpose:** each person has exactly 3 votes; tapping again removes a vote.
- **Calls:** admin phase→vote; A votes p2, p3, p4; A taps p2 again (off) and again (on); B votes p2, p3, p4; A tries a 4th vote.
- **Expected:** 3× `on:true`; toggle `false → true`; B 3× `on:true`; 4th `ok:false` with 3票まで.
- **Actual:** all as expected; 4th → `400 投票は3票までだよ`.

### 9. 完了 / undo — ✅
- **Purpose:** the "done" button and taking it back.
- **Calls:** `POST /api/done` as A, then with `undo:true`.
- **Expected:** `done:true`, then `done:false`.
- **Actual:** `true → false`. (Advance not awaited by design — phase minimums are intentional.)

### 10. Tick — ✅
- **Purpose:** the timer check the monitor/phones send.
- **Call:** `POST /api/tick`
- **Expected:** `ok:true`.
- **Actual:** `ok:true, advanced:false` (timer not expired, not everyone done — correct).

### 11. Extend / stop timer — ✅
- **Purpose:** leader timer controls.
- **Calls:** `POST /api/admin {action:"extend", seconds:60}`, `{action:"stopTimer"}`
- **Actual:** `ok / ok`.

### 12. Free phase actions — ✅
- **Purpose:** late posts, voting and comments all remain open in free time.
- **Calls:** admin phase→free; A posts あとから; A votes p2; B replies on p3.
- **Expected:** all `ok:true`.
- **Actual:** all ok.

### 13. Admin list — ✅
- **Purpose:** leader sees the full board.
- **Call:** `POST /api/admin {action:"list"}`
- **Expected:** p1 absent; p2, p3, p4 and the late post present; replies present.
- **Actual:** posts = テスト2, テスト3, テスト4, あとから; 3 replies.

### 14. Admin hide — ✅
- **Purpose:** leader can hide an inappropriate post.
- **Calls:** `POST /api/admin {action:"hide", type:"post", id:p4}`, then list.
- **Expected:** p4 `hidden:true`.
- **Actual:** `hidden:true`.

### 15. CSV export — ✅
- **Purpose:** download results after the meeting.
- **Call:** `GET /api/export?k=<admin key>`
- **Expected:** 200, `text/csv`, contains テスト2.
- **Actual:** `200 text/csv; charset=utf-8`, 7 data rows, テスト2 present.

### 16. Theme generation — ✅
- **Purpose:** AI groups the problems into themes at the end.
- **Calls:** `POST /api/themes`, `POST /api/admin {action:"info"}`, room phase read from Supabase.
- **Expected:** `ok:true`; phase = themes.
- **Actual:** `ok:true, fallback:false` (Claude-generated themes, not the vote-ranking fallback); phase = themes.

### 17. Auth negatives — ✅
- **Purpose:** outsiders are kept out.
- **Calls:** join with wrong room code; post with fake pid; admin with wrong key; export with wrong key.
- **Expected:** 403 / 401 / 403 / 403.
- **Actual:** 403 / 401 / 403 / 403.
- **Note:** export returns plain text `forbidden` rather than `{ok:false}` JSON — cosmetic, status code is correct.

### 18. Demo pages — ✅
- **Purpose:** rehearsal pages render for every phase.
- **Calls:** `GET /join?demo=1&phase=X` and `/screen?demo=1&phase=X` for lobby, post, react, vote, free, themes.
- **Expected:** 200 + HTML for all 12.
- **Actual:** all 200. (Pages render client-side; the HTML shell is the same for every phase.)

### 19. Cleanup — ✅
- **Purpose:** leave the board ready for the real meeting.
- **Calls:** admin reset, admin expected n:5.
- **Expected:** `ok:true`; phase lobby.
- **Actual:** `ok / ok`; phase `lobby`, expected 5.

---

## Not covered
- **Monitor QR in a real browser** (`/screen` QR image decoding) — run skipped the Playwright check. `e2e/flow.mjs` includes it when Playwright is installed.
- **Natural phase advance** (all 完了 + `PHASE_MIN_SECONDS`) — intentionally skipped; `e2e/flow.mjs` covers it (~30 min). The 6-join auto-start (lobby → post) was verified in an earlier partial run of `flow.mjs` the same day.

## Re-run
```bash
ROOM_CODE=... ADMIN_KEY=... node e2e/fast.mjs
```
Wipes the board at start and end — don't run during a meeting.
