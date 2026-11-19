// Procedural sound effects (WebAudio) — no audio assets needed.
let ctx = null;
let enabled = true;
let master = null;

export const isSoundOn = () => enabled;
export function setSoundOn(v) {
  enabled = v;
}

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Shared AudioContext (used by the music engine). */
export function getAudio() {
  const c = ac();
  return c ? { ctx: c } : null;
}

// Call from a user gesture so browsers allow audio.
export function unlockAudio() {
  ac();
}

function noise(c, dur) {
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

function tone(c, { f, f2, dur, type = 'sine', gain = 0.3, at = 0 }) {
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function knock(c, { freq, gain, dur = 0.06, at = 0 }) {
  const t0 = c.currentTime + at;
  const n = noise(c, dur);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1.4;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  n.connect(bp).connect(g).connect(master);
  n.start(t0);
  tone(c, { f: freq / 5, f2: freq / 8, dur: dur * 1.6, gain: gain * 0.8, at });
}

const sounds = {
  move(c) {
    knock(c, { freq: 1100, gain: 0.7 });
  },
  capture(c) {
    knock(c, { freq: 800, gain: 1, dur: 0.09 });
    knock(c, { freq: 1300, gain: 0.6, dur: 0.05, at: 0.045 });
  },
  transition(c) {
    const t0 = c.currentTime;
    const n = noise(c, 0.35);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t0);
    f.frequency.exponentialRampToValueAtTime(2200, t0 + 0.3);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    n.connect(f).connect(g).connect(master);
    n.start(t0);
  },
  alert(c) {
    tone(c, { f: 440, dur: 0.18, type: 'triangle', gain: 0.25 });
    tone(c, { f: 330, dur: 0.28, type: 'triangle', gain: 0.25, at: 0.16 });
  },
  tick(c) {
    knock(c, { freq: 2400, gain: 0.5, dur: 0.03 });
  },
  good(c) {
    tone(c, { f: 660, f2: 880, dur: 0.14, type: 'sine', gain: 0.15 });
  },
  finish(c) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(c, { f, dur: 0.5, type: 'triangle', gain: 0.25, at: i * 0.14 }),
    );
    tone(c, { f: 1046.5, dur: 1.1, type: 'sine', gain: 0.18, at: 0.56 });
  },
};

export function play(name) {
  if (!enabled) return;
  try {
    const c = ac();
    if (c) sounds[name]?.(c);
  } catch {}
}
