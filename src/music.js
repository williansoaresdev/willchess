// Procedural background music with 3 suspense levels, synthesized with WebAudio (no audio files).
//  level 0: Bach — Prelude in C major (BWV 846), soft plucks
//  level 1: Beethoven — Moonlight Sonata (1st mov.) style triplets, darker
//  level 2: Grieg — "In the Hall of the Mountain King" style, accelerating + heartbeat + riser
// (All three compositions are in the public domain; this is an original synthesized rendition.)
import { getAudio, isSoundOn } from './sound.js';

const SEMI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midi = (n) => {
  const m = n.match(/^([A-G]#?)(-?\d)$/);
  return 12 * (+m[2] + 1) + SEMI[m[1]];
};
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

const MASTER = 0.5; // overall music volume (kept low on purpose)
const LEVEL_GAIN = [0.55, 0.7, 0.85];

let ctx = null;
let out = null; // music master -> destination (+ reverb)
let reverb = null;
let wanted = false; // a game is running
let enabled = true; // user toggle
let desiredLevel = 0;
let progress = 0; // 0..1 inside the final level
let current = null; // { level, track, bus }
const dying = new Set();

function init() {
  if (ctx) return true;
  const a = getAudio();
  if (!a) return false;
  ctx = a.ctx;
  out = ctx.createGain();
  out.gain.value = MASTER;
  out.connect(ctx.destination);
  // generated impulse response -> soft hall reverb
  const len = Math.floor(ctx.sampleRate * 2.4);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  reverb = ctx.createConvolver();
  reverb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.38;
  reverb.connect(wet).connect(out);
  return true;
}

function makeBus() {
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.connect(out);
  bus.connect(reverb);
  return bus;
}

// ---- voices ----
function env(g, t, vel, attack, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(vel, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function pluck(bus, t, f, { dur = 1, vel = 0.15 } = {}) {
  const g = ctx.createGain();
  env(g, t, vel, 0.012, dur);
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = f;
  o.connect(g);
  const o2 = ctx.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = f * 2;
  const g2 = ctx.createGain();
  env(g2, t, vel * 0.3, 0.008, dur * 0.45);
  o2.connect(g2).connect(g);
  g.connect(bus);
  o.start(t);
  o2.start(t);
  o.stop(t + dur + 0.05);
  o2.stop(t + dur + 0.05);
}
function soft(bus, t, f, dur, vel) {
  // slow-attack sine: bass / pad
  const g = ctx.createGain();
  env(g, t, vel, Math.min(0.25, dur / 3), dur);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = f;
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function strings(bus, t, f, dur, vel, cut) {
  const g = ctx.createGain();
  env(g, t, vel, 0.02, dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cut;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = f;
  o.detune.value = (Math.random() - 0.5) * 12;
  o.connect(lp).connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function thump(bus, t, vel) {
  const g = ctx.createGain();
  env(g, t, vel, 0.006, 0.22);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(95, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + 0.3);
}

// ---- level 0: Bach Prelude in C (BWV 846) ----
const BACH = [
  ['C4', 'E4', 'G4', 'C5', 'E5'],
  ['C4', 'D4', 'A4', 'D5', 'F5'],
  ['B3', 'D4', 'G4', 'D5', 'F5'],
  ['C4', 'E4', 'G4', 'C5', 'E5'],
  ['C4', 'E4', 'A4', 'E5', 'A5'],
  ['C4', 'D4', 'F#4', 'A4', 'D5'],
  ['B3', 'D4', 'G4', 'D5', 'G5'],
  ['B3', 'C4', 'E4', 'G4', 'C5'],
  ['A3', 'C4', 'E4', 'G4', 'C5'],
  ['D3', 'A3', 'D4', 'F#4', 'C5'],
  ['G3', 'B3', 'D4', 'G4', 'B4'],
  ['G3', 'A#3', 'E4', 'G4', 'C#5'],
  ['F3', 'A3', 'D4', 'A4', 'D5'],
  ['F#3', 'C4', 'D4', 'A4', 'D5'],
  ['G#3', 'F4', 'B4', 'C5', 'D5'],
  ['G3', 'F4', 'G4', 'B4', 'D5'],
  ['C4', 'E4', 'G4', 'C5', 'E5'],
].map((b) => b.map(midi));
const PATTERN = [0, 1, 2, 3, 4, 2, 3, 4];

const bach = {
  dur: () => 0.2,
  play(i, t, bus) {
    const bar = BACH[Math.floor(i / 16) % BACH.length];
    const pos = i % 16;
    const first = pos % 8 === 0;
    pluck(bus, t, hz(bar[PATTERN[pos % 8]]), { dur: 1.3, vel: first ? 0.16 : 0.1 });
    if (first) soft(bus, t, hz(bar[0] - 12), 1.8, 0.14);
  },
};

// ---- level 1: Moonlight-style triplets (C# minor) ----
const MOON = [
  ['C#2', 'G#3', 'C#4', 'E4'],
  ['B1', 'G#3', 'C#4', 'E4'],
  ['A1', 'A3', 'C#4', 'E4'],
  ['F#1', 'A3', 'C#4', 'F#4'],
  ['G#1', 'G#3', 'C#4', 'E4'],
  ['G#1', 'C4', 'D#4', 'F#4'],
  ['C#2', 'G#3', 'C#4', 'E4'],
  ['C#2', 'G#3', 'C#4', 'E4'],
].map((b) => b.map(midi));

const moon = {
  dur: () => 0.23,
  play(i, t, bus) {
    const bar = MOON[Math.floor(i / 12) % MOON.length];
    const pos = i % 12;
    if (pos === 0) {
      soft(bus, t, hz(bar[0]), 2.9, 0.2);
      soft(bus, t, hz(bar[0] + 12), 2.9, 0.1);
    }
    pluck(bus, t, hz(bar[1 + (pos % 3)]), { dur: 1.1, vel: pos % 3 === 2 ? 0.085 : 0.07 });
  },
};

// ---- level 2: "Hall of the Mountain King"-style: accelerating, heartbeat, riser ----
const KING = [
  [0, 2, 3, 5, 7, 3, 7, null],
  [6, 2, 6, null, 5, 2, 5, null],
  [0, 2, 3, 5, 7, 3, 7, null],
  [12, 7, 3, 7, 12, 7, 3, 0],
];
const king = {
  dur: () => 60 / (100 + 85 * progress) / 2,
  onStart(bus) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(bus);
    o.start();
    this.riser = { o, g };
    this.timer = setInterval(() => {
      const t = ctx.currentTime;
      o.frequency.setTargetAtTime(220 + 900 * progress * progress, t, 0.3);
      g.gain.setTargetAtTime(0.012 + 0.05 * progress, t, 0.3);
    }, 250);
  },
  onStop() {
    clearInterval(this.timer);
    try {
      this.riser?.o.stop(ctx.currentTime + 0.1);
    } catch {}
  },
  play(i, t, bus) {
    const step = this.dur();
    const phrase = KING[Math.floor(i / 8) % KING.length];
    const pos = i % 8;
    const n = phrase[pos];
    if (n !== null) {
      strings(bus, t, hz(47 + n), step * 0.9, 0.14, 900 + 900 * progress);
      if (progress > 0.35) strings(bus, t, hz(59 + n), step * 0.8, 0.05, 1400);
    }
    if (i % 8 === 0) strings(bus, t, hz(35), step * 7.5, 0.1, 220);
    if (i % 2 === 0) {
      thump(bus, t, 0.22 + 0.28 * progress);
      if (progress > 0.6) thump(bus, t + step * 0.5, 0.12 + 0.15 * progress);
    }
  },
};

const DEFS = [bach, moon, king];

// ---- scheduler ----
function startTrack(level) {
  const def = Object.create(DEFS[level]);
  const bus = makeBus();
  const track = { def, bus, i: 0, next: ctx.currentTime + 0.12, timer: null };
  def.onStart?.(bus);
  const pump = () => {
    if (track.next < ctx.currentTime - 1) track.next = ctx.currentTime + 0.05; // resumed after suspend
    while (track.next < ctx.currentTime + 0.4) {
      def.play(track.i, track.next, bus);
      track.next += def.dur(track.i);
      track.i++;
    }
  };
  pump();
  track.timer = setInterval(pump, 100);
  bus.gain.setTargetAtTime(LEVEL_GAIN[level], ctx.currentTime, 1.1);
  return track;
}
function killTrack({ track, bus }, fade = 1.6) {
  bus.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
  dying.add(track);
  setTimeout(() => {
    clearInterval(track.timer);
    track.def.onStop?.();
    try {
      bus.disconnect();
    } catch {}
    dying.delete(track);
  }, fade * 1000 + 300);
}

function apply() {
  const shouldPlay = wanted && enabled && isSoundOn();
  if (!shouldPlay) {
    if (current && ctx) killTrack(current, 0.8);
    current = null;
    return;
  }
  if (!init()) return;
  if (current && current.level === desiredLevel) return;
  if (current) killTrack(current, 2.4);
  const track = startTrack(desiredLevel);
  current = { level: desiredLevel, track, bus: track.bus };
}

document.addEventListener('visibilitychange', () => {
  if (!ctx || !wanted) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else ctx.resume().catch(() => {});
});

export function musicStart() {
  wanted = true;
  desiredLevel = 0;
  progress = 0;
  apply();
}
export function musicStop() {
  wanted = false;
  apply();
}
export function musicSetLevel(l) {
  if (l === desiredLevel) return;
  desiredLevel = l;
  apply();
}
export function musicSetProgress(p) {
  progress = Math.max(0, Math.min(1, p));
}
export function musicSetEnabled(v) {
  enabled = v;
  apply();
}
export const isMusicEnabled = () => enabled;
/** Call after the global sound toggle changes. */
export function musicSync() {
  apply();
}
