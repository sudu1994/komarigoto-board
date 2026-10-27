"use client";
// All sounds are synthesized — no audio files to load. Browsers need one tap before audio works.
let ctx: AudioContext | null = null;
let muted = false;

export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    // iOS needs a sound to actually play inside the tap
    tone(1, 0.001, 0, "sine", 0.0001);
  } catch {}
}
export const setMuted = (m: boolean) => (muted = m);
export const isMuted = () => muted;

function tone(freq: number, dur: number, at = 0, type: OscillatorType = "sine", vol = 0.25, slideTo?: number) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  /** ぽん — posting */
  pop: () => tone(520, 0.12, 0, "triangle", 0.3, 900),
  /** ぴこっ — わかる */
  wakaru: () => {
    tone(880, 0.08, 0, "square", 0.08);
    tone(1320, 0.1, 0.07, "square", 0.08);
  },
  /** とんっ — vote stamp */
  stamp: () => tone(180, 0.15, 0, "sine", 0.4, 60),
  /** phase change chime */
  chime: () => [659, 784, 1047].forEach((f, i) => tone(f, 0.35, i * 0.12, "triangle", 0.2)),
  /** 「ナイス！」 fanfare */
  nice: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, i * 0.09, "square", 0.12));
    tone(1047, 0.6, 0.38, "triangle", 0.25);
    tone(1319, 0.6, 0.38, "triangle", 0.18);
  },
  /** last-10-seconds tick */
  tick: () => tone(1200, 0.04, 0, "square", 0.05),
  /** themes reveal drumroll-ish */
  reveal: () => {
    for (let i = 0; i < 12; i++) tone(110 + i * 8, 0.06, i * 0.07, "sawtooth", 0.06);
    [523, 784, 1047, 1568].forEach((f) => tone(f, 1.0, 0.9, "triangle", 0.15));
  },
};

export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern); // Android only; iPhone ignores it
  } catch {}
}
