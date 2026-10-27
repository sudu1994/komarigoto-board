"use client";
import { useCallback, useEffect, useState } from "react";
import { api, mmss, useBoard, useCountdown } from "@/lib/client";
import { Phase, PHASES, PHASE_LABEL, nextPhase } from "@/lib/phases";
import { useQuery, useToast } from "@/components/ui";

type Row = { id: string; body: string; hidden: boolean; late?: boolean; nickname?: string; post_id?: string; is_solution?: boolean };

export default function AdminPage() {
  const q = useQuery();
  const [k, setK] = useState<string | null>(null);
  const [r, setR] = useState<string | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!q) return;
    const key = q.get("k");
    if (!key) return setErr("URLに ?k=管理キー をつけてね");
    setK(key);
    api<{ r: string }>("admin", { k: key, action: "info" }).then((res) => (res.ok ? setR(res.r) : setErr(res.error ?? "だめでした")));
  }, [q]);
  if (err) return <p style={{ padding: 24, fontWeight: 900 }}>{err}</p>;
  if (!k || !r) return <p style={{ padding: 24 }}>…</p>;
  return <Admin k={k} r={r} />;
}

function Admin({ k, r }: { k: string; r: string }) {
  const { board, online } = useBoard(r);
  const { toast, node } = useToast();
  const [rows, setRows] = useState<{ posts: Row[]; replies: Row[] }>({ posts: [], replies: [] });
  const [busy, setBusy] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const room = board.room;
  const left = useCountdown(room?.phase_ends_at);

  const act = useCallback(
    async (action: string, extra: object = {}) => {
      setBusy(true);
      const res = await api(action === "themes" ? "themes" : "admin", { k, action, ...extra });
      setBusy(false);
      if (!res.ok) toast(res.error ?? "エラー");
      return res;
    },
    [k, toast],
  );

  const loadRows = useCallback(async () => {
    const res = await api<{ posts: Row[]; replies: Row[] }>("admin", { k, action: "list" });
    if (res.ok) setRows({ posts: res.posts, replies: res.replies });
  }, [k]);
  useEffect(() => {
    loadRows();
  }, [loadRows, board]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const ph = room?.phase ?? "lobby";
  const nxt = nextPhase(ph);
  const doneN = board.done.filter((d) => d.phase === ph).length;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, display: "grid", gap: 16 }}>
      {!online && <div className="offline">接続が切れています</div>}
      <h1 className="display" style={{ margin: 0, fontSize: 28 }}>管理画面</h1>

      <section className="note c4" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="display" style={{ fontSize: 24 }}>{room ? PHASE_LABEL[ph] : "未作成"}</span>
          {left !== null && <span className="chip" style={{ fontSize: 18 }}>⏱ {mmss(left)}</span>}
          {["post", "react", "vote"].includes(ph) && <span className="chip">完了 {doneN}/{room?.expected}</span>}
          <span className="chip">参加 {board.participants.length}人</span>
          <span className="chip">投稿 {room?.post_count ?? 0}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ph === "lobby" && (
            <button className="btn btn-red btn-big" disabled={busy} onClick={() => act("phase", { to: "post" })}>
              ▶ スタート（投稿タイムへ）
            </button>
          )}
          {nxt && ph !== "lobby" && nxt !== "themes" && (
            <button className="btn btn-yellow" disabled={busy} onClick={() => act("phase", { to: nxt })}>
              ⏭ 次へ：{PHASE_LABEL[nxt]}
            </button>
          )}
          {(ph === "free" || ph === "vote" || ph === "themes") && (
            <button className="btn btn-red" disabled={busy} onClick={() => act("themes").then((x) => x.ok && toast(x.fallback ? "AIなし：ランキング表示にしました" : "テーマ発表！"))}>
              🎉 テーマ発表（AIでまとめる）
            </button>
          )}
          {room?.phase_ends_at && (
            <>
              <button className="btn" disabled={busy} onClick={() => act("extend", { seconds: 120 })}>＋2分</button>
              <button className="btn" disabled={busy} onClick={() => act("stopTimer")}>⏸ タイマー止める</button>
            </>
          )}
          {room && !room.phase_ends_at && ["post", "react", "vote"].includes(ph) && (
            <button className="btn" disabled={busy} onClick={() => act("extend", { seconds: 120 })}>⏱ タイマー2分</button>
          )}
        </div>
        <details>
          <summary style={{ fontWeight: 700 }}>フェーズを直接えらぶ</summary>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {PHASES.map((p) => (
              <button key={p} className={`chip ${p === ph ? "on" : ""}`} onClick={() => act("phase", { to: p as Phase })}>
                {PHASE_LABEL[p]}
              </button>
            ))}
          </div>
        </details>
      </section>

      <section className="note c1" style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 900 }}>設定</div>
        <label style={{ fontWeight: 700 }}>
          完了の人数（自分は数えない）：
          <input type="number" min={1} defaultValue={room?.expected ?? 6} key={"e" + room?.expected} style={{ width: 64, marginLeft: 6 }}
            onBlur={(e) => act("expected", { n: Number(e.target.value) })} />
        </label>
        <label style={{ fontWeight: 700 }}>
          「ナイス！」になる わかる数：
          <input type="number" min={1} defaultValue={room?.nice_threshold ?? 3} key={"t" + room?.nice_threshold} style={{ width: 64, marginLeft: 6 }}
            onBlur={(e) => act("threshold", { n: Number(e.target.value) })} />
        </label>
      </section>

      <section className="note c0" style={{ display: "grid", gap: 6, wordBreak: "break-all" }}>
        <div style={{ fontWeight: 900 }}>リンク</div>
        <div>📺 モニター：<a href={`/screen?r=${encodeURIComponent(r)}`} target="_blank">{origin}/screen?r={r}</a></div>
        <div>📱 参加：{origin}/join?r={r}</div>
        <div>📄 <a href={`/api/export?k=${encodeURIComponent(k)}`}>CSVダウンロード</a>（Googleスプレッドシートで開けます）</div>
      </section>

      <section className="note c2" style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 900 }}>投稿一覧（投稿タイム中もここだけ見えます・匿名）</div>
        {rows.posts.length === 0 && <div>まだなし</div>}
        {rows.posts.map((p) => (
          <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", opacity: p.hidden ? 0.4 : 1 }}>
            <span style={{ flex: 1, fontWeight: 700 }}>{p.body}{p.late ? "（あとから）" : ""}</span>
            {!p.hidden && <button className="chip" onClick={() => act("hide", { type: "post", id: p.id }).then(loadRows)}>非表示</button>}
          </div>
        ))}
        {rows.replies.length > 0 && <div style={{ fontWeight: 900, marginTop: 8 }}>コメント</div>}
        {rows.replies.map((c) => (
          <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", opacity: c.hidden ? 0.4 : 1 }}>
            <span style={{ flex: 1 }}>{c.is_solution ? "💡" : ""}<b>{c.nickname}</b>：{c.body}</span>
            {!c.hidden && <button className="chip" onClick={() => act("hide", { type: "reply", id: c.id }).then(loadRows)}>非表示</button>}
          </div>
        ))}
      </section>

      <section className="note c3" style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 900 }}>リセット（全部消えます）</div>
        {!resetArmed ? (
          <button className="btn" onClick={() => setResetArmed(true)}>リセットする…</button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-red" onClick={async () => { await act("reset"); setResetArmed(false); toast("リセットしました"); }}>本当に消す</button>
            <button className="btn" onClick={() => setResetArmed(false)}>やめる</button>
          </div>
        )}
        <div style={{ fontSize: 13 }}>先にCSVをダウンロードしておくと安心</div>
      </section>
      {node}
    </main>
  );
}
