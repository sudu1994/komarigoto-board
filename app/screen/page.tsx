"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { api, Board, mmss, Post, useBoard, useCountdown, useNice } from "@/lib/client";
import { demoBoard } from "@/lib/demo";
import { Phase, PHASE_LABEL } from "@/lib/phases";
import { sfx, unlockAudio } from "@/lib/sound";
import { Komaru, NiceOverlay, shuffleStable, useQuery } from "@/components/ui";

const NAVY = "#1e2a44";
const CREAM = "#f4ebdd";

export default function ScreenPage() {
  const q = useQuery();
  if (!q) return null;
  const demo = q.get("demo") === "1";
  const r = demo ? "demo" : q.get("r");
  if (!r) return <div style={{ padding: 40 }}>URLに ?r=ルームコード をつけてね</div>;
  return <Screen r={r} demoPhase={demo ? ((q.get("phase") as Phase) || "react") : null} />;
}

function Screen({ r, demoPhase }: { r: string; demoPhase: Phase | null }) {
  const demo = useMemo(() => (demoPhase ? demoBoard(demoPhase) : null), [demoPhase]);
  const { board, online } = useBoard(r, demo);
  const [sound, setSound] = useState(false);
  const [nice, setNice] = useState<Post | null>(null);
  const [qr, setQr] = useState("");
  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/join?r=${encodeURIComponent(r)}` : "";

  useEffect(() => {
    if (joinUrl) QRCode.toDataURL(joinUrl, { margin: 1, width: 640, color: { dark: NAVY, light: CREAM } }).then(setQr);
  }, [joinUrl]);

  const room = board.room;
  const left = useCountdown(room?.phase_ends_at);

  // timer ran out → ask the server to move on (it re-checks, so many screens are safe)
  const ticked = useRef<string | null>(null);
  useEffect(() => {
    if (demo || !room?.phase_ends_at || left !== 0) return;
    const key = room.phase + room.phase_ends_at;
    if (ticked.current === key) return;
    ticked.current = key;
    api("tick", { r });
  }, [left, room, r, demo]);

  // sounds
  const prev = useRef<Phase | undefined>(undefined);
  useEffect(() => {
    if (!room) return;
    if (prev.current && prev.current !== room.phase) room.phase === "themes" ? sfx.reveal() : sfx.chime();
    prev.current = room.phase;
  }, [room]);
  useEffect(() => {
    if (left !== null && left <= 10 && left > 0) sfx.tick();
  }, [left]);
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    const n = (room?.post_count ?? 0) + board.wakaru.length + board.replies.length + board.participants.length;
    if (lastCount.current !== null && n > lastCount.current) sfx.pop();
    lastCount.current = n;
  }, [room?.post_count, board.wakaru.length, board.replies.length, board.participants.length]);

  const onNice = useCallback((p: Post) => {
    setNice(p);
    sfx.nice();
  }, []);
  useNice(board, onNice);

  if (!room) {
    return (
      <Shell>
        <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 32 }}>
          {online ? "読み込み中…（管理画面でスタートするとルームができます）" : "接続できません"}
        </div>
      </Shell>
    );
  }

  const ph = room.phase;
  const doneIds = new Set(board.done.filter((d) => d.phase === ph).map((d) => d.participant_id));

  return (
    <Shell>
      {!sound && (
        <button
          onClick={() => {
            unlockAudio();
            setSound(true);
            sfx.chime();
          }}
          style={{ position: "fixed", zIndex: 80, right: 24, bottom: 24, background: "#d94a33", color: CREAM, border: `4px solid ${CREAM}`, borderRadius: 16, padding: "14px 22px", fontSize: 22, fontWeight: 900 }}
        >
          🔊 クリックで音をオン
        </button>
      )}
      {!online && <div className="offline">接続が切れています…再接続中</div>}

      {/* top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 28, padding: "22px 40px", borderBottom: `4px solid ${CREAM}` }}>
        <div className="display" style={{ fontSize: 54, lineHeight: 1 }}>{PHASE_LABEL[ph]}</div>
        {left !== null && (
          <div className="display" style={{ fontSize: 54, lineHeight: 1, padding: "6px 18px", borderRadius: 16, background: left <= 10 ? "#d94a33" : "transparent", border: `4px solid ${CREAM}` }}>
            {mmss(left)}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {["post", "react", "vote"].includes(ph) && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "50%" }}>
            <span style={{ fontSize: 26, fontWeight: 900, marginRight: 6 }}>完了 {doneIds.size}/{room.expected}</span>
            {board.participants.map((p) => (
              <span
                key={p.id}
                style={{
                  fontSize: 22, fontWeight: 900, padding: "4px 14px", borderRadius: 999,
                  border: `3px solid ${CREAM}`,
                  background: doneIds.has(p.id) ? "#7cc6a4" : "transparent",
                  color: doneIds.has(p.id) ? NAVY : CREAM,
                }}
              >
                {doneIds.has(p.id) ? "✓ " : ""}
                {p.nickname}
              </span>
            ))}
          </div>
        )}
        {(ph === "free" || ph === "react" || ph === "vote") && qr && <img src={qr} alt="参加用QRコード" style={{ width: 110, height: 110, borderRadius: 10 }} />}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "26px 40px" }}>
        {ph === "lobby" && <LobbyScreen board={board} qr={qr} url={joinUrl} />}
        {ph === "post" && <PostScreen board={board} qr={qr} />}
        {(ph === "react" || ph === "vote" || ph === "free") && <WallScreen board={board} />}
        {ph === "themes" && <ThemesScreen board={board} />}
      </div>

      {nice && <NiceOverlay big text={`「${nice.body}」`} onDone={() => setNice(null)} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        position: "fixed", inset: 0, display: "flex", flexDirection: "column",
        background: NAVY, color: CREAM,
        backgroundImage: "radial-gradient(rgba(244,235,221,0.07) 1.5px, transparent 1.8px)", backgroundSize: "22px 22px",
      }}
    >
      {children}
    </main>
  );
}

function LobbyScreen({ board, qr, url }: { board: Board; qr: string; url: string }) {
  const steps = [
    ["📷", "スマホのカメラでQRを読む"],
    ["✍️", "なんて呼ばれたいか入れる"],
    ["🙋", "困りごとを書いて、わかる！しよう"],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 60, height: "100%", alignItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        {qr && <img src={qr} alt="参加用QRコード" style={{ width: "min(52vh, 560px)", height: "min(52vh, 560px)", borderRadius: 20, border: `6px solid ${CREAM}` }} />}
        <div style={{ fontSize: 24, fontWeight: 900, marginTop: 14 }}>LINEで開いたら「ブラウザで開く」にしてね</div>
        <div style={{ fontSize: 18, opacity: 0.75, marginTop: 6, wordBreak: "break-all" }}>{url}</div>
      </div>
      <div>
        <div className="display" style={{ fontSize: 76, lineHeight: 1.05, marginBottom: 30 }}>困りごとボード</div>
        <div style={{ display: "grid", gap: 18 }}>
          {steps.map(([e, t], i) => (
            <div key={i} className={`note c${i} tilt${i}`} style={{ color: NAVY, display: "flex", gap: 18, alignItems: "center", padding: "16px 22px", maxWidth: 720 }}>
              <span className="display" style={{ fontSize: 44 }}>{i + 1}</span>
              <span style={{ fontSize: 44 }}>{e}</span>
              <span style={{ fontSize: 32, fontWeight: 900 }}>{t}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 34, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 28, fontWeight: 900 }}>参加中 {board.participants.length}人：</span>
          {board.participants.map((p) => (
            <span key={p.id} className="fade-up" style={{ fontSize: 28, fontWeight: 900, padding: "4px 16px", borderRadius: 999, background: "#f2b33d", color: NAVY, border: `3px solid ${CREAM}` }}>
              {p.nickname}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PostScreen({ board, qr }: { board: Board; qr: string }) {
  const n = board.room!.post_count;
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%", textAlign: "center", position: "relative" }}>
      <div>
        <Komaru size={200} />
        <div style={{ fontSize: 40, fontWeight: 900, marginTop: 10 }}>みんなの困りごと</div>
        <div key={n} className="display" style={{ fontSize: 220, lineHeight: 1, color: "#f2b33d", animation: "popIn .5s both" }}>{n}</div>
        <div style={{ fontSize: 40, fontWeight: 900 }}>件あつまったよ</div>
        <div style={{ fontSize: 26, marginTop: 18, opacity: 0.8 }}>投稿タイムが終わると、まとめて公開！（だれが書いたかはわかりません）</div>
      </div>
      {qr && <img src={qr} alt="参加用QRコード" style={{ position: "absolute", right: 0, bottom: 0, width: 180, height: 180, borderRadius: 12 }} />}
    </div>
  );
}

function WallScreen({ board }: { board: Board }) {
  const ph = board.room!.phase;
  const th = board.room!.nice_threshold;
  const posts = useMemo(() => {
    const base = shuffleStable(board.posts);
    if (ph === "react") return base;
    const v = (id: string) => board.votes.filter((x) => x.post_id === id).length;
    const w = (id: string) => board.wakaru.filter((x) => x.target_id === id).length;
    return [...base].sort((a, b) => v(b.id) - v(a.id) || w(b.id) - w(a.id));
  }, [board, ph]);

  // free mode: spotlight the busiest thread, rotating every 12s
  const busy = useMemo(
    () =>
      [...board.posts]
        .map((p) => ({ p, n: board.replies.filter((r) => r.post_id === p.id).length }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 4),
    [board],
  );
  const [spot, setSpot] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSpot((s) => s + 1), 12000);
    return () => clearInterval(id);
  }, []);
  const focus = ph === "free" && busy.length > 0 ? busy[spot % busy.length].p : null;

  const big = posts.length <= 8;
  return (
    <div style={{ display: "grid", gridTemplateColumns: focus ? "1fr 560px" : "1fr", gap: 30, height: "100%" }}>
      <div style={{ columnCount: focus ? 2 : big ? 3 : 4, columnGap: 28, height: "100%", overflow: "hidden" }}>
        {posts.map((p, i) => {
          const w = board.wakaru.filter((x) => x.target_id === p.id);
          const v = board.votes.filter((x) => x.post_id === p.id).length;
          const c = board.replies.filter((x) => x.post_id === p.id);
          const ideas = c.filter((x) => x.is_solution).length;
          const hot = w.length >= th;
          return (
            <div key={p.id} style={{ breakInside: "avoid", paddingTop: 18, paddingBottom: 10 }}>
              <div className={`note c${i % 4} tilt${i % 4} fade-up`} style={{ color: NAVY, boxShadow: `6px 6px 0 #0d1526`, outline: hot ? "5px solid #d94a33" : undefined }}>
                {ph !== "react" && i < 3 && v > 0 && <div className="display" style={{ fontSize: 22 }}>🏅 {i + 1}位</div>}
                <div style={{ fontSize: big ? 32 : 25, fontWeight: 900, lineHeight: 1.4 }}>{p.body}</div>
                <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: big ? 24 : 20, fontWeight: 900, flexWrap: "wrap" }}>
                  <span>🙋 {w.length}</span>
                  <span>💬 {c.length}</span>
                  {ideas > 0 && <span>💡 {ideas}</span>}
                  {ph !== "react" && <span>🗳️ {v}</span>}
                </div>
                {hot && (
                  <span className="display" style={{ position: "absolute", right: -12, top: -18, background: "#d94a33", color: CREAM, border: `3px solid ${NAVY}`, borderRadius: 999, padding: "4px 14px", fontSize: 22, transform: "rotate(8deg)" }}>
                    ナイス！
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {focus && (
        <div key={focus.id} className="fade-up" style={{ border: `4px solid ${CREAM}`, borderRadius: 20, padding: 24, overflow: "hidden" }}>
          <div style={{ fontSize: 22, fontWeight: 900, opacity: 0.8 }}>💬 もりあがってるスレッド</div>
          <div className="display" style={{ fontSize: 32, margin: "10px 0 18px", lineHeight: 1.3 }}>{focus.body}</div>
          <div style={{ display: "grid", gap: 12 }}>
            {board.replies
              .filter((x) => x.post_id === focus.id)
              .slice(-6)
              .map((x) => (
                <div key={x.id} style={{ background: x.is_solution ? "#f2b33d" : CREAM, color: NAVY, borderRadius: 14, padding: "10px 14px", border: `3px solid ${NAVY}` }}>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{x.is_solution ? "💡解決案 ・ " : ""}{x.nickname}</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{x.body}</div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ThemesScreen({ board }: { board: Board }) {
  const t = board.room!.themes;
  if (!t) return <div style={{ fontSize: 40, textAlign: "center", marginTop: 80 }}>まとめ中…🤔</div>;
  const byId = new Map(board.posts.map((p) => [p.id, p]));
  if (t.fallback) {
    return (
      <div>
        <div className="display" style={{ fontSize: 48, marginBottom: 20 }}>投票ランキング</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {t.ranking.slice(0, 8).map((x, i) => (
            <div key={x.id} className={`note c${i % 4} fade-up`} style={{ color: NAVY, animationDelay: `${i * 0.15}s` }}>
              <span className="display" style={{ fontSize: 30, marginRight: 10 }}>{i + 1}位</span>
              <span style={{ fontSize: 28, fontWeight: 900 }}>{x.body}</span>
              <div style={{ fontSize: 22, fontWeight: 900 }}>🗳️ {x.votes} ・ 🙋 {x.wakaru}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", alignContent: "center", gap: 44, height: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(t.themes.length, 3)}, 1fr)`, gap: 32 }}>
        {t.themes.slice(0, 6).map((x, i) => (
          <div key={i} style={{ animation: `popIn .6s ${0.9 + i * 0.35}s both` }}>
            <div className={`note c${i % 4} tilt${i % 4}`} style={{ color: NAVY, padding: "22px 24px", boxShadow: "8px 8px 0 #0d1526" }}>
              <div className="display" style={{ fontSize: 48, lineHeight: 1.15 }}>{x.title}</div>
              <div style={{ fontSize: 28, fontWeight: 900, margin: "10px 0 12px" }}>{x.summary}</div>
              {x.post_ids.slice(0, 3).map((id) =>
                byId.get(id) ? (
                  <div key={id} style={{ fontSize: 23, fontWeight: 700, opacity: 0.85, lineHeight: 1.5 }}>・{byId.get(id)!.body}</div>
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>
      {t.directions.length > 0 && (
        <div style={{ animation: `fadeUp .6s ${1.2 + t.themes.length * 0.35}s both` }}>
          <div className="display" style={{ fontSize: 52, marginBottom: 18 }}>🚀 つくれそうなもの</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${t.directions.length}, 1fr)`, gap: 28 }}>
            {t.directions.map((d, i) => (
              <div key={i} style={{ border: `5px solid ${CREAM}`, borderRadius: 20, padding: "22px 26px" }}>
                <div className="display" style={{ fontSize: 42, color: "#f2b33d" }}>{d.title}</div>
                <div style={{ fontSize: 30, fontWeight: 700, marginTop: 8 }}>{d.why}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 24, opacity: 0.75, marginTop: 16 }}>※AIのたたき台です。決めるのは次回MTGで！</div>
        </div>
      )}
    </div>
  );
}
