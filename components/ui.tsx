"use client";
import { useCallback, useEffect, useState } from "react";

const CONFETTI = ["#f2b33d", "#7cc6a4", "#f4a7b9", "#9cc8e8", "#fbf5ea"];

export function NiceOverlay({ text, big = false, onDone }: { text: string; big?: boolean; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, big ? 3200 : 2400);
    return () => clearTimeout(t);
  }, [onDone, big]);
  const bits = Array.from({ length: big ? 36 : 22 }, (_, i) => {
    const a = (i / (big ? 36 : 22)) * Math.PI * 2;
    const d = (big ? 520 : 260) * (0.6 + ((i * 37) % 10) / 20);
    return {
      "--dx": `${Math.cos(a) * d}px`,
      "--dy": `${Math.sin(a) * d}px`,
      "--rot": `${(i * 77) % 720}deg`,
      background: CONFETTI[i % CONFETTI.length],
      animationDelay: `${(i % 5) * 0.03}s`,
    } as React.CSSProperties;
  });
  return (
    <div className="nice-overlay" role="status" aria-live="polite">
      {bits.map((s, i) => (
        <span key={i} className="burst" style={s} />
      ))}
      <div className="nice-card" style={big ? { padding: "40px 56px", maxWidth: 1100 } : undefined}>
        <div className="display" style={{ fontSize: big ? 120 : 56, lineHeight: 1 }}>ナイス！</div>
        <div style={{ marginTop: 12, fontSize: big ? 40 : 18, fontWeight: 900 }}>{text}</div>
      </div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
  return { toast: useCallback((m: string) => setMsg(m), []), node };
}

/** little hand-drawn style mascot: a worried sticky note */
export function Komaru({ size = 96, mood = "worry" }: { size?: number; mood?: "worry" | "happy" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ animation: "wobble 2.4s ease-in-out infinite" }}>
      <path d="M14 12 H84 Q88 12 88 16 V70 L68 90 H18 Q14 90 14 86 Z" fill="#f2b33d" stroke="#1e2a44" strokeWidth="4" strokeLinejoin="round" />
      <path d="M88 70 H72 Q68 70 68 74 V90" fill="#e09a22" stroke="#1e2a44" strokeWidth="4" strokeLinejoin="round" />
      {mood === "worry" ? (
        <>
          <path d="M30 38 l10 4 M70 38 l-10 4" stroke="#1e2a44" strokeWidth="4" strokeLinecap="round" />
          <circle cx="37" cy="50" r="4" fill="#1e2a44" />
          <circle cx="63" cy="50" r="4" fill="#1e2a44" />
          <path d="M40 68 q10 -8 20 0" stroke="#1e2a44" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M76 26 q4 8 0 12 q-4 -4 0 -12" fill="#9cc8e8" stroke="#1e2a44" strokeWidth="2" />
        </>
      ) : (
        <>
          <path d="M31 48 q6 -8 12 0 M57 48 q6 -8 12 0" stroke="#1e2a44" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M38 62 q12 12 24 0" stroke="#1e2a44" strokeWidth="4" fill="#d94a33" strokeLinecap="round" />
          <circle cx="28" cy="60" r="5" fill="#f4a7b9" />
          <circle cx="72" cy="60" r="5" fill="#f4a7b9" />
        </>
      )}
    </svg>
  );
}

/** stable pseudo-random order so posting order can't reveal who wrote what */
export function shuffleStable<T extends { id: string }>(xs: T[]) {
  const h = (s: string) => {
    let x = 2166136261;
    for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
    return x >>> 0;
  };
  return [...xs].sort((a, b) => h(a.id) - h(b.id));
}

export function useQuery() {
  const [q, setQ] = useState<URLSearchParams | null>(null);
  useEffect(() => setQ(new URLSearchParams(window.location.search)), []);
  return q;
}
