import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { generateThemes } from "./themes";
import { DEFAULT_EXPECTED, nextPhase, PHASE_SECONDS, Phase, TIMED_PHASES } from "./phases";

let _db: SupabaseClient | null = null;
export function db() {
  if (!_db) {
    _db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false },
    });
  }
  return _db;
}

export const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const token = () => randomBytes(24).toString("base64url");

export const ok = (data: object = {}) => NextResponse.json({ ok: true, now: Date.now(), ...data });
export const fail = (msg: string, status = 400) => NextResponse.json({ ok: false, error: msg }, { status });

function safeEq(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function roomOk(r: unknown): r is string {
  return typeof r === "string" && !!process.env.ROOM_CODE && safeEq(r, process.env.ROOM_CODE);
}
export function adminOk(k: unknown) {
  return typeof k === "string" && !!process.env.ADMIN_KEY && safeEq(k, process.env.ADMIN_KEY);
}

export async function ensureRoom(r: string) {
  const { data } = await db().from("rooms").select("*").eq("id", r).maybeSingle();
  if (data) return data;
  const { data: created } = await db().from("rooms").upsert({ id: r, expected: DEFAULT_EXPECTED }).select("*").single();
  return created;
}

export async function getRoom(r: string) {
  const { data } = await db().from("rooms").select("*").eq("id", r).single();
  return data as { id: string; phase: Phase; phase_ends_at: string | null; expected: number; nice_threshold: number } | null;
}

/** verifies pid+secret; returns participant row or null */
export async function who(body: { r?: string; pid?: string; secret?: string }) {
  if (!roomOk(body.r) || typeof body.pid !== "string" || typeof body.secret !== "string") return null;
  const { data: s } = await db().from("participant_secrets").select("secret_hash").eq("participant_id", body.pid).maybeSingle();
  if (!s || !safeEq(s.secret_hash, sha(body.secret))) return null;
  const { data: p } = await db().from("participants").select("*").eq("id", body.pid).eq("room_id", body.r).maybeSingle();
  return p as { id: string; nickname: string; room_id: string } | null;
}

/** move to the phase after `from` — idempotent: only one caller wins */
export async function setPhase(r: string, to: Phase, from?: Phase) {
  const secs = PHASE_SECONDS[to];
  const patch = {
    phase: to,
    phase_ends_at: secs ? new Date(Date.now() + secs * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  let q = db().from("rooms").update(patch).eq("id", r);
  if (from) q = q.eq("phase", from);
  const { data } = await q.select("id");
  return (data?.length ?? 0) > 0;
}

export async function maybeAdvance(r: string) {
  const room = await getRoom(r);
  if (!room) return false;
  const nxt = nextPhase(room.phase);
  if (!nxt || !TIMED_PHASES.includes(room.phase)) return false;
  const timeUp = room.phase_ends_at && new Date(room.phase_ends_at).getTime() <= Date.now();
  const { count } = await db().from("done").select("*", { count: "exact", head: true }).eq("room_id", r).eq("phase", room.phase);
  const allDone = (count ?? 0) >= room.expected;
  if (!timeUp && !allDone) return false;

  if (nxt === "themes") {
    // claim by pushing the timer 2 min out (compare-and-swap) so only one caller runs the AI step;
    // if it crashes, the lock expires and the next tick retries
    const lock = new Date(Date.now() + 120_000).toISOString();
    let q = db().from("rooms").update({ phase_ends_at: lock }).eq("id", r).eq("phase", "free");
    q = room.phase_ends_at ? q.eq("phase_ends_at", room.phase_ends_at) : q.is("phase_ends_at", null);
    const { data } = await q.select("id");
    if (!data?.length) return false;
    await generateThemes(r);
    return setPhase(r, "themes", "free");
  }
  return setPhase(r, nxt, room.phase);
}

/** lobby → post automatically once `expected` people have joined */
export async function maybeStart(r: string) {
  const room = await getRoom(r);
  if (!room || room.phase !== "lobby") return false;
  const { count } = await db().from("participants").select("*", { count: "exact", head: true }).eq("room_id", r);
  if ((count ?? 0) >= room.expected) return setPhase(r, "post", "lobby");
  return false;
}

export async function readJson(req: Request) {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
