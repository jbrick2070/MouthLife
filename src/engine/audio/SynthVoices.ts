/**
 * Warm, click-free procedural voices. Every note owns a smooth envelope
 * (>= 5ms attack, exponential release to silence) so nothing pops.
 */
import { midiToFreq, type VoiceName } from './musicTheory';

export interface VoiceOut {
  ctx: AudioContext;
  dest: AudioNode; // music or sfx bus
  reverb: AudioNode; // shared reverb send
  delay: AudioNode; // shared delay send
  noise: AudioBuffer; // shared pink-ish noise
}

const FLOOR = 0.0001;

function stage(out: VoiceOut, t: number, pan: number, send: number, delaySend = 0): GainNode {
  const { ctx } = out;
  const g = ctx.createGain();
  let tail: AudioNode = g;
  if (typeof ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.01) {
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);
    g.connect(p);
    tail = p;
  }
  tail.connect(out.dest);
  if (send > 0.001) {
    const s = ctx.createGain();
    s.gain.value = send;
    tail.connect(s);
    s.connect(out.reverb);
  }
  if (delaySend > 0.001) {
    const d = ctx.createGain();
    d.gain.value = delaySend;
    tail.connect(d);
    d.connect(out.delay);
  }
  return g;
}

/** Click-free attack/decay/release on a gain param. Returns the time the note is fully silent. */
function env(
  p: AudioParam,
  t: number,
  peak: number,
  attack: number,
  decayTo: number,
  decayTime: number,
  hold: number,
  release: number
): number {
  p.setValueAtTime(FLOOR, t);
  p.linearRampToValueAtTime(Math.max(FLOOR, peak), t + attack);
  p.exponentialRampToValueAtTime(Math.max(FLOOR, peak * decayTo), t + attack + decayTime);
  const endHold = t + Math.max(attack + decayTime, hold);
  p.setValueAtTime(Math.max(FLOOR, peak * decayTo), endHold);
  p.exponentialRampToValueAtTime(FLOOR, endHold + release);
  return endHold + release;
}

function safeHz(ctx: BaseAudioContext, freq: number): number {
  const maxHz = Math.max(2000, ctx.sampleRate * 0.5 - 200);
  return Math.max(1, Math.min(maxHz, freq));
}

function osc(out: VoiceOut, type: OscillatorType, freq: number, t: number): OscillatorNode {
  const o = out.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(safeHz(out.ctx, freq), t);
  return o;
}

function noiseSrc(out: VoiceOut, t: number, dur: number): AudioBufferSourceNode {
  const s = out.ctx.createBufferSource();
  s.buffer = out.noise;
  s.loop = true;
  s.start(t, Math.random() * Math.max(0.1, out.noise.duration - dur - 0.1));
  s.stop(t + dur + 0.05);
  return s;
}

export function rhodes(out: VoiceOut, t: number, freq: number, dur: number, vel: number, pan: number, send: number): void {
  const g = stage(out, t, pan, send, 0.05);
  const peak = 0.16 * vel;
  const end = env(g.gain, t, peak, 0.006, 0.28, 0.7, dur, 0.35);
  // 2-op FM tine: modulator index decays quickly -> bell-like attack, warm body
  const mod = osc(out, 'sine', freq * 14, t);
  const modG = out.ctx.createGain();
  modG.gain.setValueAtTime(freq * (0.5 + vel * 1.4), t);
  modG.gain.exponentialRampToValueAtTime(freq * 0.04, t + 0.35);
  mod.connect(modG);
  const c1 = osc(out, 'sine', freq, t);
  const c2 = osc(out, 'sine', freq * 1.0035, t); // gentle chorus detune
  modG.connect(c1.frequency);
  const body = osc(out, 'sine', freq * 0.5, t);
  const bodyG = out.ctx.createGain();
  bodyG.gain.value = 0.35;
  body.connect(bodyG);
  bodyG.connect(g);
  c1.connect(g);
  const c2g = out.ctx.createGain();
  c2g.gain.value = 0.5;
  c2.connect(c2g);
  c2g.connect(g);
  for (const o of [mod, c1, c2, body]) {
    o.start(t);
    o.stop(end + 0.05);
  }
}

export function marimba(out: VoiceOut, t: number, freq: number, vel: number, pan: number, send: number, kalimba = false): void {
  const g = stage(out, t, pan, send, kalimba ? 0.12 : 0.06);
  const decay = kalimba ? 0.9 : 0.42;
  const end = env(g.gain, t, 0.2 * vel, 0.004, 0.02, decay, 0, 0.12);
  const f = osc(out, kalimba ? 'triangle' : 'sine', freq, t);
  f.connect(g);
  // short decaying overtone (4x for marimba bars, ~5.4x for kalimba tines)
  const overHz = freq * (kalimba ? 5.4 : 4);
  const nyquist = out.ctx.sampleRate * 0.5 - 200;
  if (overHz < nyquist) {
    const h = osc(out, 'sine', overHz, t);
    const hg = out.ctx.createGain();
    env(hg.gain, t, 0.09 * vel, 0.003, 0.05, 0.07, 0, 0.05);
    h.connect(hg);
    hg.connect(g);
    h.start(t);
    h.stop(t + 0.3);
  }
  // soft wooden transient
  const n = noiseSrc(out, t, 0.04);
  const bp = out.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = safeHz(out.ctx, Math.min(6000, freq * 3));
  bp.Q.value = 1.2;
  const ng = out.ctx.createGain();
  env(ng.gain, t, 0.05 * vel, 0.003, 0.05, 0.03, 0, 0.02);
  n.connect(bp);
  bp.connect(ng);
  ng.connect(g);
  f.start(t);
  f.stop(end + 0.05);
}

export function celesta(out: VoiceOut, t: number, freq: number, vel: number, pan: number, send: number, bellLike = false): void {
  const g = stage(out, t, pan, send, 0.2);
  const end = env(g.gain, t, 0.14 * vel, 0.005, 0.03, bellLike ? 1.4 : 0.9, 0, 0.35);
  const nyquist = out.ctx.sampleRate * 0.5 - 200;
  const parts: Array<[number, number]> = bellLike
    ? [
        [1, 1],
        [2.76, 0.28],
        [5.4, 0.1],
      ]
    : [
        [1, 1],
        [2, 0.18],
        [4, 0.12],
      ];
  for (const [m, w] of parts) {
    if (m > 1 && freq * m >= nyquist) continue;
    const o = osc(out, 'sine', freq * m, t);
    const pg = out.ctx.createGain();
    pg.gain.value = w;
    o.connect(pg);
    pg.connect(g);
    o.start(t);
    o.stop(end + 0.05);
  }
}

export function pluckedBass(out: VoiceOut, t: number, freq: number, dur: number, vel: number): void {
  const g = stage(out, t, 0, 0.03);
  const end = env(g.gain, t, 0.3 * vel, 0.008, 0.35, 0.28, dur, 0.1);
  const lp = out.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.1;
  lp.frequency.setValueAtTime(950, t);
  lp.frequency.exponentialRampToValueAtTime(220, t + 0.22);
  const a = osc(out, 'triangle', freq, t);
  const b = osc(out, 'sine', freq, t);
  a.connect(lp);
  lp.connect(g);
  b.connect(g);
  a.start(t);
  b.start(t);
  a.stop(end + 0.05);
  b.stop(end + 0.05);
}

export function padNote(out: VoiceOut, t: number, freq: number, dur: number, vel: number, pan: number, send: number): void {
  const g = stage(out, t, pan, send);
  const attack = Math.min(0.9, dur * 0.35);
  const end = env(g.gain, t, 0.07 * vel, attack, 0.8, dur * 0.4, dur, 1.1);
  const lp = out.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.6;
  lp.frequency.setValueAtTime(700, t);
  lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.5); // slow filter breathing
  lp.frequency.linearRampToValueAtTime(900, t + dur + 0.8);
  const a = osc(out, 'triangle', freq, t);
  const b = osc(out, 'triangle', freq * 1.004, t);
  a.connect(lp);
  b.connect(lp);
  lp.connect(g);
  a.start(t);
  b.start(t);
  a.stop(end + 0.05);
  b.stop(end + 0.05);
}

export function reedLead(out: VoiceOut, t: number, freq: number, dur: number, vel: number, pan: number, send: number): void {
  const g = stage(out, t, pan, send, 0.1);
  const end = env(g.gain, t, 0.122 * vel, 0.03, 0.7, 0.25, dur, 0.18);
  const lp = out.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.9;
  lp.frequency.setValueAtTime(600, t);
  lp.frequency.linearRampToValueAtTime(1500 + vel * 600, t + 0.08);
  lp.frequency.exponentialRampToValueAtTime(900, t + dur + 0.1);
  const a = osc(out, 'sawtooth', freq, t);
  const b = osc(out, 'triangle', freq * 1.003, t);
  const vib = osc(out, 'sine', 5.2, t);
  const vg = out.ctx.createGain();
  vg.gain.setValueAtTime(0, t);
  vg.gain.linearRampToValueAtTime(freq * 0.006, t + 0.25);
  vib.connect(vg);
  vg.connect(a.frequency);
  a.connect(lp);
  b.connect(lp);
  lp.connect(g);
  for (const o of [a, b, vib]) {
    o.start(t);
    o.stop(end + 0.05);
  }
}

export function guitarPluck(out: VoiceOut, t: number, freq: number, vel: number, pan: number, send: number): void {
  const g = stage(out, t, pan, send, 0.08);
  const end = env(g.gain, t, 0.13 * vel, 0.004, 0.05, 0.4, 0, 0.1);
  const lp = out.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.8;
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.exponentialRampToValueAtTime(650, t + 0.16);
  const a = osc(out, 'sawtooth', freq, t);
  a.connect(lp);
  lp.connect(g);
  a.start(t);
  a.stop(end + 0.05);
}

/** Dispatch by VoiceName used by the sequencer. */
export function playVoice(
  out: VoiceOut,
  voice: VoiceName,
  t: number,
  midi: number,
  durSec: number,
  vel: number,
  pan: number,
  send: number
): void {
  const f = midiToFreq(midi);
  switch (voice) {
    case 'rhodes':
      return rhodes(out, t, f, durSec, vel, pan, send);
    case 'marimba':
      return marimba(out, t, f, vel, pan, send, false);
    case 'kalimba':
      return marimba(out, t, f, vel, pan, send, true);
    case 'celesta':
      return celesta(out, t, f, vel, pan, send, false);
    case 'bell':
      return celesta(out, t, f, vel, pan, send, true);
    case 'bass':
      return pluckedBass(out, t, f, durSec, vel);
    case 'pad':
      return padNote(out, t, f, durSec, vel, pan, send);
    case 'reed':
      return reedLead(out, t, f, durSec, vel, pan, send);
    case 'pluck':
      return guitarPluck(out, t, f, vel, pan, send);
  }
}

export function shaker(out: VoiceOut, t: number, vel: number): void {
  const g = stage(out, t, (Math.random() - 0.5) * 0.4, 0.05);
  env(g.gain, t, 0.07 * vel, 0.008, 0.1, 0.07, 0, 0.03);
  const n = noiseSrc(out, t, 0.15);
  const bp = out.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = safeHz(out.ctx, 6200);
  bp.Q.value = 0.7;
  n.connect(bp);
  bp.connect(g);
}

export function hat(out: VoiceOut, t: number, vel: number): void {
  const g = stage(out, t, 0.2, 0.03);
  env(g.gain, t, 0.05 * vel, 0.005, 0.1, 0.04, 0, 0.02);
  const n = noiseSrc(out, t, 0.1);
  const hp = out.ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = safeHz(out.ctx, 7500);
  n.connect(hp);
  hp.connect(g);
}

export function rim(out: VoiceOut, t: number, vel: number): void {
  const g = stage(out, t, -0.15, 0.12);
  const end = env(g.gain, t, 0.11 * vel, 0.004, 0.05, 0.06, 0, 0.04);
  const o = osc(out, 'sine', 920, t);
  o.frequency.exponentialRampToValueAtTime(700, t + 0.04);
  o.connect(g);
  o.start(t);
  o.stop(end + 0.05);
}

/** Warm muted heartbeat kick — never a hard thump. */
export function softKick(out: VoiceOut, t: number, vel: number): void {
  const g = stage(out, t, 0, 0);
  const end = env(g.gain, t, 0.32 * vel, 0.006, 0.04, 0.14, 0, 0.08);
  const lp = out.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  const o = osc(out, 'sine', 100, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.13);
  o.connect(lp);
  lp.connect(g);
  o.start(t);
  o.stop(end + 0.05);
}

export function playDrum(out: VoiceOut, kind: 'shaker' | 'rim' | 'kick' | 'hat', t: number, vel: number): void {
  if (kind === 'shaker') shaker(out, t, vel);
  else if (kind === 'hat') hat(out, t, vel);
  else if (kind === 'rim') rim(out, t, vel);
  else softKick(out, t, vel);
}

/** Generated ~1.3s decaying stereo velvet-noise impulse (one shared convolver). */
export function buildReverbImpulse(ctx: BaseAudioContext, seconds = 1.3): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const decay = Math.pow(1 - x, 3.2);
      // velvet-ish: sparse random sign pulses + filtered noise, darker with time
      const pulse = Math.random() < 0.18 ? (Math.random() < 0.5 ? -1 : 1) : 0;
      const w = (Math.random() * 2 - 1) * 0.5 + pulse * 0.5;
      const k = 0.55 - 0.4 * x;
      lp += (w - lp) * k;
      d[i] = lp * decay;
    }
  }
  return buf;
}

/** Pink-ish noise (Paul Kellet) for shaker / foam textures. */
export function buildPinkNoise(ctx: BaseAudioContext, seconds = 3): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}
