"use client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Phase } from "./phases";

export type Room = {
  id: string; phase: Phase; phase_ends_at: string | null; expected: number; nice_threshold: number;
  post_count: number; themes: Themes | null;
};
export type Themes = {
  fallback: boolean;
  themes: { title: string; summary: string; post_ids: string[] }[];
  directions: { title: string; why: string }[];
  ranking: { id: string; body: string; votes: number; wakaru: number }[];
};
export type Participant = { id: string; nickname: string; created_at: string };
export type Post = { id: string; body: string; late: boolean; created_at: string };
export type Reply = { id: string; post_id: string; participant_id: string; nickname: string; body: string; is_solution: boolean; created_at: string };
export type Wakaru = { id: string; target_type: "post" | "reply"; target_id: string; participant_id: string; nickname: string };
export type Vote = { id: string; post_id: string; participant_id: string };
export type Done = { phase: string; participant_id: string };
export type Board = {
  room: Room | null; participants: Participant[]; posts: Post[]; replies: Reply[];
  wakaru: Wakaru[]; votes: Vote[]; done: Done[];
};

const EMPTY: Board = { room: null, participants: [], posts: [], replies: [], wakaru: [], votes: [], done: [] };

let _sb: SupabaseClient | null = null;
function sb() {
  if (!_sb) _sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_KEY!, { auth: { persistSession: false } });
  return _sb;
}

/* ---------- server clock (timers must agree on every phone) ---------- */
let clockOffset = 0;
export const serverNow = () => Date.now() + clockOffset;

/* ---------- API with retry (bad Wi-Fi shouldn't lose what someone typed) ---------- */
export async function api<T = Record<string, unknown>>(path: string, body: object): Promise<T & { ok: boolean; error?: string }> {
  let last: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(`/api/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (typeof j.now === "number") clockOffset = j.now - Date.now();
      return j;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  return { ok: false, error: "通信できませんでした。電波を確認してね" } as T & { ok: boolean; error?: string };
}

/* ---------- local storage (wrapped: private mode can throw) ---------- */
export const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem("komari:" + k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem("komari:" + k, JSON.stringify(v));
    } catch {}
  },
};

/* ---------- live board ---------- */
export function useBoard(r: string | null, demo: Board | null = null) {
  const [board, setBoard] = useState<Board>(demo ?? EMPTY);
  const [online, setOnline] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!r || demo) return;
    const c = sb();
    const [room, participants, posts, replies, wakaru, votes, done] = await Promise.all([
      c.from("rooms").select("*").eq("id", r).maybeSingle(),
      c.from("participants").select("id,nickname,created_at").eq("room_id", r).order("created_at"),
      c.from("posts").select("id,body,late,created_at").eq("room_id", r).order("created_at"),
      c.from("replies").select("id,post_id,participant_id,nickname,body,is_solution,created_at").eq("room_id", r).order("created_at"),
      c.from("wakaru").select("id,target_type,target_id,participant_id,nickname").eq("room_id", r),
      c.from("votes").select("id,post_id,participant_id").eq("room_id", r),
      c.from("done").select("phase,participant_id").eq("room_id", r),
    ]);
    if (room.error) {
      setOnline(false);
      return;
    }
    setOnline(true);
    setBoard({
      room: (room.data as Room) ?? null,
      participants: (participants.data as Participant[]) ?? [],
      posts: (posts.data as Post[]) ?? [],
      replies: (replies.data as Reply[]) ?? [],
      wakaru: (wakaru.data as Wakaru[]) ?? [],
      votes: (votes.data as Vote[]) ?? [],
      done: (done.data as Done[]) ?? [],
    });
  }, [r, demo]);

  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 150);
  }, [load]);

  useEffect(() => {
    if (!r || demo) return;
    load();
    const ch = sb().channel("board-" + r);
    for (const t of ["participants", "posts", "replies", "wakaru", "votes", "done"]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `room_id=eq.${r}` }, refresh);
    }
    ch.on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${r}` }, refresh);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setOnline(true);
        refresh();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setOnline(false);
    });
    const poll = setInterval(load, 15000); // safety net if a live event is missed
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("online", load);
    return () => {
      sb().removeChannel(ch);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("online", load);
    };
  }, [r, demo, load, refresh]);

  return { board, online, refresh: load, setBoard };
}

/* ---------- countdown ---------- */
export function useCountdown(endsAt: string | null | undefined) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!endsAt) {
      setLeft(null);
      return;
    }
    const end = new Date(endsAt).getTime();
    const f = () => setLeft(Math.max(0, Math.ceil((end - serverNow()) / 1000)));
    f();
    const id = setInterval(f, 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return left;
}
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/* ---------- 「ナイス！」 detection: fires once per post when わかる hits the threshold ---------- */
export function useNice(board: Board, onNice: (post: Post) => void) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!board.room) return;
    const th = board.room.nice_threshold;
    const hot = board.posts.filter((p) => board.wakaru.filter((w) => w.target_id === p.id).length >= th);
    if (seen.current === null) {
      seen.current = new Set(hot.map((p) => p.id)); // don't celebrate old ones on page load
      return;
    }
    for (const p of hot) {
      if (!seen.current.has(p.id)) {
        seen.current.add(p.id);
        onNice(p);
      }
    }
  }, [board, onNice]);
}

export const countFor = (rows: { target_id?: string; post_id?: string }[], id: string) =>
  rows.filter((x) => x.target_id === id || x.post_id === id).length;
