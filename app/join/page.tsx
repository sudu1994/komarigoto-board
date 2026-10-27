"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, Board, mmss, Post, Reply, store, useBoard, useCountdown, useNice } from "@/lib/client";
import { demoBoard } from "@/lib/demo";
import { DELETE_WINDOW_MS, Phase, PHASE_HINT, PHASE_LABEL, VOTES_PER_PERSON } from "@/lib/phases";
import { buzz, isMuted, setMuted, sfx, unlockAudio } from "@/lib/sound";
import { Komaru, NiceOverlay, shuffleStable, useQuery, useToast } from "@/components/ui";

type Me = { pid: string; secret: string; nickname: string };
type Mine = { id: string; body: string; del: string; created_at: string };

export default function JoinPage() {
  const q = useQuery();
  if (!q) return null;
  const demo = q.get("demo") === "1";
  const r = demo ? "demo" : q.get("r");
  if (!r) return <Center>QRコードから入り直してね 🙏</Center>;
  return <Join r={r} demoPhase={demo ? ((q.get("phase") as Phase) || "react") : null} />;
}

function Join({ r, demoPhase }: { r: string; demoPhase: Phase | null }) {
  const demo = useMemo(() => (demoPhase ? demoBoard(demoPhase) : null), [demoPhase]);
  const { board, online, setBoard } = useBoard(r, demo);
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const [nice, setNice] = useState<Post | null>(null);
  const [muted, setMute] = useState(false);
  const { toast, node: toastNode } = useToast();

  useEffect(() => {
    if (demo) {
      setMe({ pid: "u0", secret: "", nickname: "なかの" });
    } else {
      setMe(store.get<Me | null>("id:" + r, null));
    }
    const m = store.get("muted", false);
    setMuted(m);
    setMute(m);
    setReady(true);
  }, [r, demo]);

  const call = useCallback(
    async (path: string, body: object) => {
      if (demo) return { ok: true } as { ok: boolean; error?: string; [k: string]: unknown };
      const res = await api(path, { r, pid: me?.pid, secret: me?.secret, ...body });
      if (!res.ok) {
        if (res.error === "参加し直してね") {
          store.set("id:" + r, null);
          setMe(null);
        }
        toast(res.error ?? "エラー");
      }
      return res;
    },
    [demo, r, me, toast],
  );

  // phase change → chime + buzz
  const phase = board.room?.phase;
  const prevPhase = useRef<Phase | undefined>(undefined);
  useEffect(() => {
    if (phase && prevPhase.current && prevPhase.current !== phase) {
      sfx.chime();
      buzz([60, 40, 60]);
      toast(`${PHASE_LABEL[phase]} はじまり！`);
    }
    prevPhase.current = phase;
  }, [phase, toast]);

  // if the monitor is off, phones still nudge the server when the timer runs out
  const left = useCountdown(board.room?.phase_ends_at);
  const ticked = useRef<string | null>(null);
  useEffect(() => {
    const room = board.room;
    if (demo || !room?.phase_ends_at || left !== 0) return;
    const key = room.phase + room.phase_ends_at;
    if (ticked.current === key) return;
    ticked.current = key;
    setTimeout(() => api("tick", { r }), 800 + Math.random() * 1500);
  }, [left, board.room, demo, r]);

  const onNice = useCallback((p: Post) => {
    setNice(p);
    buzz([80, 50, 80, 50, 200]);
    sfx.wakaru(); // the monitor plays the big fanfare; phones stay quieter
  }, []);
  useNice(board, onNice);

  if (!ready) return null;
  if (!me) {
    return (
      <Gate
        onJoin={async (nickname) => {
          unlockAudio();
          const res = await api<{ pid: string; secret: string; nickname: string }>("join", { r, nickname });
          if (!res.ok) return toast(res.error ?? "参加できませんでした");
          const m = { pid: res.pid, secret: res.secret, nickname: res.nickname };
          store.set("id:" + r, m);
          setMe(m);
          sfx.pop();
          if (!store.get("tut", false)) setTutorial(true);
        }}
        toastNode={toastNode}
      />
    );
  }

  return (
    <div onPointerDown={unlockAudio} style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 120 }}>
      {!online && <div className="offline">電波が不安定です…つながったら自動で戻ります</div>}
      <Header
        board={board}
        me={me}
        muted={muted}
        onMute={() => {
          setMuted(!muted);
          setMute(!muted);
          store.set("muted", !muted);
        }}
        onHelp={() => setTutorial(true)}
      />
      {board.room ? (
        <PhaseBody board={board} me={me} call={call} toast={toast} r={r} demo={!!demo} setBoard={setBoard} />
      ) : (
        <Center>読み込み中…</Center>
      )}
      {tutorial && (
        <Tutorial
          onClose={() => {
            store.set("tut", true);
            setTutorial(false);
          }}
        />
      )}
      {nice && <NiceOverlay text={`「${nice.body}」に共感が集まった！`} onDone={() => setNice(null)} />}
      {toastNode}
    </div>
  );
}

/* ================= entry gate ================= */
function Gate({ onJoin, toastNode }: { onJoin: (n: string) => Promise<unknown>; toastNode: React.ReactNode }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inLine = typeof navigator !== "undefined" && /Line\//i.test(navigator.userAgent);
  return (
    <main style={{ minHeight: "100dvh", padding: "36px 20px", maxWidth: 480, margin: "0 auto" }}>
      {inLine && (
        <div className="note c2" style={{ marginBottom: 22, fontWeight: 700 }}>
          LINEの中で開いています。右上の「︙」→「ブラウザで開く」にしてね（票がずれちゃうので）
        </div>
      )}
      <div style={{ textAlign: "center" }}>
        <Komaru size={120} />
        <h1 className="display" style={{ fontSize: 40, margin: "8px 0 4px", lineHeight: 1.1 }}>
          困りごと<br />ボード
        </h1>
        <p style={{ margin: 0, fontWeight: 700, color: "var(--ink-soft)" }}>AI駆動開発チーム②</p>
      </div>
      <form
        className="note c4 tilt2"
        style={{ marginTop: 30, padding: 20 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || busy) return;
          setBusy(true);
          await onJoin(name.trim());
          setBusy(false);
        }}
      >
        <label htmlFor="nick" style={{ fontWeight: 900, fontSize: 18 }}>なんて呼べばいい？</label>
        <p style={{ margin: "4px 0 12px", fontSize: 14, color: "var(--ink-soft)" }}>本名でもニックネームでもOK。わかる！やコメントに表示されます</p>
        <input
          id="nick"
          value={name}
          maxLength={16}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：モモ"
          autoComplete="off"
          style={{ width: "100%", padding: "14px 12px", border: "var(--line)", borderRadius: 12, background: "#fff", fontSize: 20 }}
        />
        <button className="btn btn-red btn-big" style={{ marginTop: 16 }} disabled={!name.trim() || busy}>
          {busy ? "…" : "はじめる！"}
        </button>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--ink-soft)", textAlign: "center" }}>🔊 音が出ます（マナーモードだと鳴らないことも）</p>
      </form>
      {toastNode}
    </main>
  );
}

/* ================= tutorial ================= */
const TUT = [
  { emoji: "📝", title: "困りごとを書こう", body: "日々の「めんどい」「こまった」をどんどん。投稿は匿名だよ。2分以内なら消せます", cls: "c0" },
  { emoji: "🙋", title: "わかる！で反応", body: "共感したら「わかる！」。コメントもできるよ。こっちは名前つき。3人以上わかると…？", cls: "c1" },
  { emoji: "🗳️", title: "3票で投票", body: "いちばん解決したい困りごとに投票。終わったら毎回「完了」ボタンを押してね", cls: "c2" },
];
function Tutorial({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const go = (n: number) => {
    setI(n);
    ref.current?.children[n]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(30,42,68,.55)", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", placeItems: "center", padding: 16 }}>
      <div style={{ width: "100%", minWidth: 0, maxWidth: 420, overflow: "hidden", background: "var(--paper)", border: "var(--line)", borderRadius: 22, boxShadow: "6px 6px 0 var(--ink)", padding: "18px 0 18px" }}>
        <div className="display" style={{ textAlign: "center", fontSize: 18 }}>つかいかた {i + 1}/3</div>
        <div
          ref={ref}
          onScroll={(e) => {
            const el = e.currentTarget;
            setI(Math.round(el.scrollLeft / el.clientWidth));
          }}
          style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none" }}
        >
          {TUT.map((t, n) => (
            <div key={n} style={{ flex: "0 0 100%", scrollSnapAlign: "center", padding: "18px 24px" }}>
              <div className={`note ${t.cls} tilt${n}`} style={{ textAlign: "center", padding: "22px 16px", minHeight: 230 }}>
                <div style={{ fontSize: 64 }}>{t.emoji}</div>
                <div className="display" style={{ fontSize: 26, margin: "6px 0 10px" }}>{t.title}</div>
                <div style={{ fontWeight: 700, lineHeight: 1.6 }}>{t.body}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: "4px 0 14px" }}>
          {TUT.map((_, n) => (
            <span key={n} style={{ width: 10, height: 10, borderRadius: 99, border: "2px solid var(--ink)", background: n === i ? "var(--ink)" : "transparent" }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, padding: "0 24px" }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>スキップ</button>
          {i < TUT.length - 1 ? (
            <button className="btn btn-yellow" style={{ flex: 2 }} onClick={() => go(i + 1)}>つぎへ →</button>
          ) : (
            <button className="btn btn-red" style={{ flex: 2 }} onClick={onClose}>OK！はじめる</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= header ================= */
function Header({ board, me, muted, onMute, onHelp }: { board: Board; me: Me; muted: boolean; onMute: () => void; onHelp: () => void }) {
  const room = board.room;
  const left = useCountdown(room?.phase_ends_at);
  const last10 = left !== null && left <= 10 && left > 0;
  useEffect(() => {
    if (last10) sfx.tick();
  }, [left, last10]);
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--paper)", borderBottom: "var(--line)", padding: "10px 14px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="display" style={{ fontSize: 22, flex: 1, lineHeight: 1.1 }}>{room ? PHASE_LABEL[room.phase] : "…"}</div>
        {left !== null && (
          <span className="chip" style={{ fontSize: 18, background: last10 ? "var(--tomato)" : "var(--paper-2)", color: last10 ? "var(--paper-2)" : undefined }}>
            ⏱ {mmss(left)}
          </span>
        )}
        <button className="chip" onClick={onMute} aria-label={muted ? "音をオン" : "音をオフ"}>{muted ? "🔇" : "🔊"}</button>
        <button className="chip" onClick={onHelp} aria-label="つかいかた">？</button>
      </div>
      {room && (
        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: "var(--ink-soft)" }}>
          {PHASE_HINT[room.phase]} <span style={{ whiteSpace: "nowrap" }}>（{me.nickname} さん）</span>
        </div>
      )}
    </header>
  );
}

/* ================= phase bodies ================= */
type Call = (path: string, body: object) => Promise<{ ok: boolean; error?: string; [k: string]: unknown }>;
type BodyProps = { board: Board; me: Me; call: Call; toast: (m: string) => void; r: string; demo: boolean; setBoard: (b: Board) => void };

function PhaseBody(p: BodyProps) {
  const ph = p.board.room!.phase;
  if (ph === "lobby") return <Lobby {...p} />;
  if (ph === "post") return <PostPhase {...p} />;
  if (ph === "themes") return <ThemesPhone {...p} />;
  return <Wall {...p} />;
}

function Lobby({ board }: BodyProps) {
  return (
    <div style={{ padding: 20, textAlign: "center" }}>
      <Komaru size={130} mood="happy" />
      <div className="display" style={{ fontSize: 26, marginTop: 10 }}>参加できたよ！</div>
      <p style={{ fontWeight: 700 }}>スタートまでちょっと待っててね</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 18 }}>
        {board.participants.map((x, i) => (
          <span key={x.id} className={`chip fade-up`} style={{ animationDelay: `${i * 0.05}s` }}>{x.nickname}</span>
        ))}
      </div>
    </div>
  );
}

function DoneBar({ board, me, call, label = "完了！" }: BodyProps & { label?: string }) {
  const ph = board.room!.phase;
  const doneIds = board.done.filter((d) => d.phase === ph).map((d) => d.participant_id);
  const mine = doneIds.includes(me.pid);
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 25, background: "var(--paper)", borderTop: "var(--line)", padding: "12px 16px calc(12px + env(safe-area-inset-bottom))" }}>
      <div style={{ maxWidth: 528, margin: "0 auto", display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ fontWeight: 900, fontSize: 15, minWidth: 82 }}>
          完了 {doneIds.length}/{board.room!.expected}
        </div>
        {mine ? (
          <button
            className="btn"
            style={{ flex: 1 }}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await call("done", { undo: true });
              setBusy(false);
            }}
          >
            ✅ 待ってるよ…（もどる）
          </button>
        ) : (
          <button
            className="btn btn-red"
            style={{ flex: 1, fontFamily: "var(--display)", fontWeight: 400, fontSize: 20 }}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await call("done", {});
              if (res.ok) {
                sfx.stamp();
                buzz(40);
              }
              setBusy(false);
            }}
          >
            {label}
          </button>
        )}
      </div>
    </div>
  );
}

function Composer({ onSend, placeholder = "例：会議の日程調整がめんどすぎる", cta = "貼る！" }: { onSend: (s: string) => Promise<boolean>; placeholder?: string; cta?: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="note c4"
      style={{ padding: 14 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || busy) return;
        setBusy(true);
        if (await onSend(text.trim())) setText("");
        setBusy(false);
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 140))}
        rows={3}
        placeholder={placeholder}
        aria-label="困りごと"
        style={{ width: "100%", border: "var(--line)", borderRadius: 10, padding: 10, resize: "none", background: "#fff" }}
      />
      <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: text.length > 125 ? "var(--tomato-ink)" : "var(--ink-soft)" }}>
          {text.length}/140 ・ クライアント情報は書かないでね
        </span>
        <button className="btn btn-yellow" disabled={!text.trim() || busy}>{busy ? "…" : cta}</button>
      </div>
    </form>
  );
}

function PostPhase(p: BodyProps) {
  const { board, call, r, toast, demo } = p;
  const [mine, setMine] = useState<Mine[]>([]);
  const [, force] = useState(0);
  useEffect(() => setMine(store.get<Mine[]>("mine:" + r, [])), [r]);
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const save = (m: Mine[]) => {
    setMine(m);
    store.set("mine:" + r, m);
  };
  return (
    <div style={{ padding: 16, display: "grid", gap: 18 }}>
      <Composer
        onSend={async (body) => {
          if (demo) {
            save([{ id: "x" + Date.now(), body, del: "", created_at: new Date().toISOString() }, ...mine]);
            sfx.pop();
            return true;
          }
          const res = await call("post", { body });
          if (!res.ok) return false;
          save([{ id: res.id as string, body, del: res.del as string, created_at: res.created_at as string }, ...mine]);
          sfx.pop();
          buzz(30);
          return true;
        }}
      />
      <div style={{ textAlign: "center", fontWeight: 900 }}>
        みんなの困りごと <span className="display" style={{ fontSize: 28, color: "var(--tomato-ink)" }}>{board.room!.post_count}</span> 件
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)" }}>投稿タイムが終わったら、まとめて公開されるよ</div>
      </div>
      {mine.length > 0 && <div style={{ fontWeight: 900 }}>あなたが書いたもの（あなたにしか見えません）</div>}
      {mine.map((m, i) => {
        const age = Date.now() - new Date(m.created_at).getTime();
        const canDel = age < DELETE_WINDOW_MS;
        return (
          <div key={m.id} className={`note c${i % 4} tilt${i % 4} fade-up`}>
            <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.5 }}>{m.body}</div>
            {canDel && (
              <button
                className="chip"
                style={{ marginTop: 8 }}
                onClick={async () => {
                  if (!demo) {
                    const res = await call("delete", { id: m.id, del: m.del });
                    if (!res.ok) return;
                  }
                  save(mine.filter((x) => x.id !== m.id));
                  toast("消したよ");
                }}
              >
                🗑 消す（あと{Math.ceil((DELETE_WINDOW_MS - age) / 1000)}秒）
              </button>
            )}
          </div>
        );
      })}
      <DoneBar {...p} label="書けた！完了" />
    </div>
  );
}

function Wall(p: BodyProps) {
  const { board, me, call, r, demo, setBoard, toast } = p;
  const ph = board.room!.phase;
  const [open, setOpen] = useState<string | null>(null);
  const [mineIds, setMineIds] = useState<Set<string>>(new Set());
  useEffect(() => setMineIds(new Set(store.get<Mine[]>("mine:" + r, []).map((m) => m.id))), [r]);

  const votesOf = (id: string) => board.votes.filter((v) => v.post_id === id);
  const wakOf = (id: string) => board.wakaru.filter((w) => w.target_id === id);
  const myVotes = board.votes.filter((v) => v.participant_id === me.pid).length;

  const posts = useMemo(() => {
    const base = shuffleStable(board.posts);
    if (ph === "free") return [...base].sort((a, b) => votesOf(b.id).length - votesOf(a.id).length || wakOf(b.id).length - wakOf(a.id).length);
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.posts, board.votes, board.wakaru, ph]);

  const demoToggle = (kind: "wakaru" | "votes", targetId: string) => {
    const b = structuredClone(board);
    if (kind === "wakaru") {
      const ex = b.wakaru.find((w) => w.target_id === targetId && w.participant_id === me.pid);
      b.wakaru = ex ? b.wakaru.filter((w) => w !== ex) : [...b.wakaru, { id: "d" + Math.random(), target_type: "post", target_id: targetId, participant_id: me.pid, nickname: me.nickname }];
    } else {
      const ex = b.votes.find((v) => v.post_id === targetId && v.participant_id === me.pid);
      if (!ex && myVotes >= VOTES_PER_PERSON) return toast(`投票は${VOTES_PER_PERSON}票までだよ`);
      b.votes = ex ? b.votes.filter((v) => v !== ex) : [...b.votes, { id: "d" + Math.random(), post_id: targetId, participant_id: me.pid }];
    }
    setBoard(b);
  };

  const wakaru = async (targetId: string, targetType: "post" | "reply") => {
    const was = board.wakaru.some((w) => w.target_id === targetId && w.participant_id === me.pid);
    if (!was) {
      sfx.wakaru();
      buzz(20);
    }
    if (demo) return demoToggle("wakaru", targetId);
    await call("wakaru", { targetId, targetType });
  };
  const vote = async (postId: string) => {
    const was = board.votes.some((v) => v.post_id === postId && v.participant_id === me.pid);
    if (!was && myVotes < VOTES_PER_PERSON) {
      sfx.stamp();
      buzz(50);
    }
    if (demo) return demoToggle("votes", postId);
    await call("vote", { postId });
  };

  return (
    <div style={{ padding: "16px 16px 0" }}>
      {ph === "vote" && (
        <div className="note c1" style={{ marginBottom: 20, textAlign: "center", fontWeight: 900, fontSize: 18 }}>
          のこり <span className="display" style={{ fontSize: 30 }}>{VOTES_PER_PERSON - myVotes}</span> 票
          <span style={{ marginLeft: 6 }}>{"🗳️".repeat(Math.max(0, VOTES_PER_PERSON - myVotes))}</span>
        </div>
      )}
      {ph === "free" && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>票が多い順にならんでるよ。解決案💡をスレッドに書こう</div>
          <details>
            <summary style={{ fontWeight: 700, cursor: "pointer" }}>＋ 困りごとを追加する（あとから投稿）</summary>
            <div style={{ marginTop: 12 }}>
              <Composer
                onSend={async (body) => {
                  if (demo) return true;
                  const res = await call("post", { body });
                  if (res.ok) {
                    store.set("mine:" + r, [{ id: res.id, body, del: res.del, created_at: res.created_at }, ...store.get<Mine[]>("mine:" + r, [])]);
                    setMineIds(new Set([...mineIds, res.id as string]));
                    sfx.pop();
                  }
                  return res.ok;
                }}
              />
            </div>
          </details>
        </div>
      )}
      {posts.length === 0 && <Center>まだ困りごとがないよ</Center>}
      <div style={{ display: "grid", gap: 22 }}>
        {posts.map((post, i) => {
          const w = wakOf(post.id);
          const iW = w.some((x) => x.participant_id === me.pid);
          const v = votesOf(post.id);
          const iV = v.some((x) => x.participant_id === me.pid);
          const thread = board.replies.filter((x) => x.post_id === post.id);
          const hot = w.length >= board.room!.nice_threshold;
          return (
            <article key={post.id} className={`note c${i % 4} tilt${i % 4}`}>
              {hot && (
                <span className="display" style={{ position: "absolute", right: -8, top: -14, background: "var(--tomato)", color: "var(--paper-2)", border: "var(--line)", borderRadius: 999, padding: "4px 10px", fontSize: 14, transform: "rotate(8deg)" }}>
                  ナイス！
                </span>
              )}
              {ph === "free" && i < 3 && v.length > 0 && <div className="display" style={{ fontSize: 14, marginBottom: 4 }}>🏅 {i + 1}位</div>}
              <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.5 }}>
                {post.body}
                {mineIds.has(post.id) && <span style={{ fontSize: 12, marginLeft: 6, color: "var(--ink-soft)" }}>（あなた）</span>}
                {post.late && <span style={{ fontSize: 12, marginLeft: 6, color: "var(--ink-soft)" }}>（あとから）</span>}
              </div>
              {w.length > 0 && (
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>
                  {w.map((x) => x.nickname).join("、")} がわかる！
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
                <button className={`chip ${iW ? "on" : ""}`} onClick={() => wakaru(post.id, "post")} aria-pressed={iW} style={{ fontSize: 15, padding: "6px 12px" }}>
                  🙋 わかる！ {w.length}
                </button>
                <button className="chip" onClick={() => setOpen(open === post.id ? null : post.id)} style={{ fontSize: 15, padding: "6px 12px" }}>
                  💬 {thread.length}
                </button>
                {(ph === "vote" || ph === "free") && (
                  <button
                    className={`chip ${iV ? "on" : ""}`}
                    disabled={ph !== "vote"}
                    onClick={() => vote(post.id)}
                    aria-pressed={iV}
                    style={{ fontSize: 15, padding: "6px 12px", marginLeft: "auto" }}
                  >
                    🗳️ {iV ? "投票済" : "投票"} {v.length}
                  </button>
                )}
              </div>
              {iV && ph === "vote" && (
                <span className="display" aria-hidden style={{ position: "absolute", right: 14, top: 10, color: "var(--tomato-ink)", border: "3px solid var(--tomato-ink)", borderRadius: 8, padding: "0 6px", fontSize: 18, animation: "stampIn .35s both" }}>
                  一票
                </span>
              )}
              {open === post.id && <Thread post={post} replies={thread} board={board} me={me} call={call} demo={demo} onWakaru={wakaru} phase={ph} />}
            </article>
          );
        })}
      </div>
      {(ph === "react" || ph === "vote" || ph === "free") && <DoneBar {...p} label={ph === "vote" ? "投票おわり！完了" : ph === "free" ? "話せた！完了" : "反応した！完了"} />}
    </div>
  );
}

function Thread({ post, replies, board, me, call, demo, onWakaru, phase }: { post: Post; replies: Reply[]; board: Board; me: Me; call: Call; demo: boolean; onWakaru: (id: string, t: "reply") => void; phase: Phase }) {
  const [text, setText] = useState("");
  const [idea, setIdea] = useState(phase === "free");
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ marginTop: 12, borderTop: "2px dashed var(--ink)", paddingTop: 10, display: "grid", gap: 8 }}>
      {replies.length === 0 && <div style={{ fontSize: 14, fontWeight: 700 }}>まだコメントなし。いちばんのりしよう</div>}
      {replies.map((c) => {
        const w = board.wakaru.filter((x) => x.target_id === c.id);
        const iW = w.some((x) => x.participant_id === me.pid);
        return (
          <div key={c.id} style={{ background: "rgba(251,245,234,.85)", border: "2px solid var(--ink)", borderRadius: 10, padding: "8px 10px" }}>
            <div style={{ fontSize: 13, fontWeight: 900 }}>
              {c.is_solution && <span style={{ marginRight: 4 }}>💡解決案</span>}
              {c.nickname}
            </div>
            <div style={{ fontWeight: 500, lineHeight: 1.5 }}>{c.body}</div>
            <button className={`chip ${iW ? "on" : ""}`} style={{ marginTop: 4, fontSize: 12 }} onClick={() => onWakaru(c.id, "reply")}>
              🙋 {w.length}
            </button>
          </div>
        );
      })}
      <form
        style={{ display: "grid", gap: 6 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim() || busy || demo) return;
          setBusy(true);
          const res = await call("reply", { postId: post.id, body: text.trim(), isSolution: idea });
          if (res.ok) {
            setText("");
            sfx.pop();
          }
          setBusy(false);
        }}
      >
        <input
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          placeholder={idea ? "こうしたら解決できるかも…" : "コメントする"}
          aria-label="コメント"
          style={{ border: "var(--line)", borderRadius: 10, padding: "10px", background: "#fff" }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className={`chip ${idea ? "on" : ""}`} onClick={() => setIdea(!idea)} aria-pressed={idea}>
            💡 解決案として
          </button>
          <button className="btn btn-yellow" style={{ marginLeft: "auto", padding: "6px 14px" }} disabled={!text.trim() || busy}>
            送る
          </button>
        </div>
      </form>
    </div>
  );
}

function ThemesPhone({ board }: BodyProps) {
  const t = board.room!.themes;
  return (
    <div style={{ padding: 20, display: "grid", gap: 18 }}>
      <div style={{ textAlign: "center" }}>
        <Komaru size={110} mood="happy" />
        <div className="display" style={{ fontSize: 26 }}>前の画面を見てね！</div>
      </div>
      {t && !t.fallback &&
        t.themes.map((x, i) => (
          <div key={i} className={`note c${i % 4} tilt${i % 4}`}>
            <div className="display" style={{ fontSize: 20 }}>{x.title}</div>
            <div style={{ fontWeight: 700 }}>{x.summary}</div>
          </div>
        ))}
      <p style={{ textAlign: "center", fontWeight: 700 }}>アイデアは次回のMTGに1〜2個もってきてね 🙌</p>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 40, textAlign: "center", fontWeight: 700 }}>{children}</div>;
}
