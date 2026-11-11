/**
 * Pure (Web-Audio-free) music theory + deterministic step generator.
 * Everything here is unit-testable in Node: theme selection, scale math, and
 * per-sixteenth-step note generation for the lookahead sequencer.
 */
import type { AppMode } from '../types';

export type VoiceName =
  | 'rhodes'
  | 'marimba'
  | 'kalimba'
  | 'celesta'
  | 'bass'
  | 'pad'
  | 'reed'
  | 'pluck'
  | 'bell';

export interface NoteEvent {
  voice: VoiceName;
  midi: number;
  vel: number; // 0..1
  durSteps: number;
  pan: number; // -1..1
  send: number; // reverb send 0..1
}

export interface DrumEvent {
  kind: 'shaker' | 'rim' | 'kick' | 'hat';
  vel: number;
}

export interface ChordDef {
  root: number; // semitones above key root
  tones: number[]; // intervals above chord root
}

export type ThemeId =
  | 'hub'
  | 'hub_globe'
  | 'hub_ready'
  | 'cosmic'
  | 'brush_along'
  | 'report'
  | 'world_1'
  | 'world_2'
  | 'world_3'
  | 'world_4'
  | 'world_5'
  | 'pulp';

export interface ThemeDef {
  id: ThemeId;
  bpm: number;
  swing: number; // 0..0.4 delay applied to odd sixteenths
  keyRoot: number; // MIDI note of the tonic
  scale: number[]; // semitone offsets within one octave
  progressionA: ChordDef[]; // one chord per bar, 8 bars (A section)
  progressionB: ChordDef[]; // 8 bars (B section)
  lead: VoiceName | null;
  leadRhythm: number[]; // sixteenth steps (0..15) where lead may play
  comp: VoiceName | null;
  compSteps: number[];
  arp: VoiceName | null; // arpeggio voice
  arpEvery: number; // sixteenth spacing of arpeggio notes (0 disables)
  bass: string; // 16 chars: . none, r root, 5 fifth, 3 third, o octave, a approach
  bassVoice: VoiceName;
  shaker: string;
  rim: string;
  kick: string;
  hat: string;
  pad: boolean;
  seed: number;
  /** Optional per-theme trim (default 1.0) so airy/sparse themes sit balanced in the mix. */
  mixGain?: number;
}

const maj9: number[] = [0, 4, 7, 11, 14];
const min9: number[] = [0, 3, 7, 10, 14];
const min7: number[] = [0, 3, 7, 10];
const maj7: number[] = [0, 4, 7, 11];
const dom7: number[] = [0, 4, 7, 10];
const maj6: number[] = [0, 4, 7, 9, 14];
const sus: number[] = [0, 5, 7, 10];
const triad: number[] = [0, 4, 7, 12];
const minTriad: number[] = [0, 3, 7, 12];

const MAJOR_PENT = [0, 2, 4, 7, 9];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MINOR_PENT = [0, 3, 5, 7, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MAJOR_BLUES = [0, 2, 3, 4, 7, 9];

const c = (root: number, tones: number[]): ChordDef => ({ root, tones });
const rep = (a: ChordDef[], n: number): ChordDef[] => {
  const out: ChordDef[] = [];
  for (let i = 0; i < n; i++) out.push(a[i % a.length]);
  return out;
};

export const THEMES: Record<ThemeId, ThemeDef> = {
  hub: {
    id: 'hub',
    bpm: 84,
    swing: 0.12,
    keyRoot: 53, // F
    scale: MAJOR_PENT,
    progressionA: rep([c(0, maj9), c(-1, min7), c(-3, min9), c(-5, maj9)], 8),
    progressionB: rep([c(5, maj7), c(-1, min7), c(-3, min9), c(-5, dom7)], 8),
    lead: 'kalimba',
    leadRhythm: [0, 3, 6, 8, 11, 14],
    comp: 'rhodes',
    compSteps: [0, 3, 6, 10, 13],
    arp: null,
    arpEvery: 0,
    bass: 'r..5..r..3..5.a.',
    bassVoice: 'bass',
    shaker: 'x.x.x.x.x.x.x.x.',
    rim: '....x.......x...',
    kick: 'x.......x.......',
    hat: '................',
    pad: false,
    seed: 11,
  },
  hub_globe: {
    id: 'hub_globe',
    bpm: 80,
    swing: 0.1,
    keyRoot: 53,
    scale: MAJOR_PENT,
    progressionA: rep([c(0, maj9), c(-1, min7), c(-3, min9), c(-5, maj9)], 8),
    progressionB: rep([c(5, maj7), c(-1, min7), c(-3, min9), c(-5, dom7)], 8),
    lead: 'celesta',
    leadRhythm: [0, 4, 8, 12],
    comp: 'rhodes',
    compSteps: [0, 8],
    arp: 'celesta',
    arpEvery: 2,
    bass: 'r.......5.......',
    bassVoice: 'bass',
    shaker: '....x.......x...',
    rim: '................',
    kick: 'x...............',
    hat: '................',
    pad: true,
    seed: 12,
    mixGain: 1.16,
  },
  hub_ready: {
    id: 'hub_ready',
    bpm: 76,
    swing: 0,
    keyRoot: 53,
    scale: MAJOR_PENT,
    progressionA: rep([c(0, maj7), c(-3, min7), c(-5, maj7), c(-1, sus)], 8),
    progressionB: rep([c(0, maj7), c(-3, min7), c(-5, maj7), c(-1, sus)], 8),
    lead: 'marimba',
    leadRhythm: [0, 8],
    comp: 'rhodes',
    compSteps: [0, 6],
    arp: null,
    arpEvery: 0,
    bass: 'r.......r.......',
    bassVoice: 'bass',
    shaker: '....x.......x...',
    rim: '................',
    kick: 'x.......x.......', // gentle readiness heartbeat
    hat: '................',
    pad: true,
    seed: 13,
    mixGain: 1.16,
  },
  cosmic: {
    id: 'cosmic',
    bpm: 58,
    swing: 0,
    keyRoot: 48, // C
    scale: MAJOR_PENT,
    progressionA: [
      c(0, maj9),
      c(9, min9),
      c(5, maj7),
      c(7, sus),
      c(0, maj9),
      c(9, min9),
      c(5, maj7),
      c(7, dom7),
    ],
    progressionB: [c(0, maj9), c(4, min7), c(5, maj9), c(7, sus), c(0, maj9), c(9, min7), c(5, maj9), c(0, maj9)],
    lead: 'bell',
    leadRhythm: [0, 6, 10],
    comp: null,
    compSteps: [],
    arp: 'celesta',
    arpEvery: 2,
    bass: '................',
    bassVoice: 'bass',
    shaker: '................',
    rim: '................',
    kick: '................',
    hat: '................',
    pad: true,
    seed: 21,
    mixGain: 1.75,
  },
  brush_along: {
    id: 'brush_along',
    bpm: 96,
    swing: 0.08,
    keyRoot: 55, // G
    scale: MAJOR,
    progressionA: rep([c(0, maj7), c(4, min7), c(5, maj7), c(7, dom7)], 8),
    progressionB: rep([c(0, maj9), c(9, min7), c(2, min7), c(7, sus)], 8),
    lead: 'marimba',
    leadRhythm: [0, 2, 3, 6, 8, 10, 11, 14],
    comp: 'rhodes',
    compSteps: [0, 3, 6, 8, 11, 14],
    arp: 'celesta',
    arpEvery: 4,
    bass: 'r..r..5.r..3..a.',
    bassVoice: 'bass',
    shaker: 'x.xxx.xxx.xxx.xx',
    rim: '....x.......x...',
    kick: 'x.....x.x.......',
    hat: '................',
    pad: false,
    seed: 31,
  },
  report: {
    id: 'report',
    bpm: 76,
    swing: 0.14,
    keyRoot: 50, // D
    scale: MAJOR_PENT,
    progressionA: rep([c(0, maj9), c(-3, min7), c(-5, maj9), c(2, dom7)], 8),
    progressionB: rep([c(5, maj9), c(0, maj9), c(2, min7), c(7, dom7)], 8),
    lead: 'rhodes',
    leadRhythm: [0, 3, 8, 11],
    comp: 'rhodes',
    compSteps: [0, 6, 10],
    arp: 'celesta',
    arpEvery: 4,
    bass: 'r.....5.r.....a.',
    bassVoice: 'bass',
    shaker: 'x.x.x.x.x.x.x.x.',
    rim: '....x.......x...',
    kick: 'x.......x.......',
    hat: '................',
    pad: true,
    seed: 41,
  },
  world_1: {
    id: 'world_1',
    bpm: 112,
    swing: 0.06,
    keyRoot: 48, // C Lydian
    scale: LYDIAN,
    progressionA: rep([c(0, maj7), c(2, triad), c(4, min7), c(2, triad)], 8),
    progressionB: rep([c(0, maj9), c(7, triad), c(9, min7), c(5, maj7)], 8),
    lead: 'marimba',
    leadRhythm: [0, 2, 4, 7, 8, 10, 12, 15],
    comp: 'rhodes',
    compSteps: [0, 3, 6, 8, 11, 14],
    arp: null,
    arpEvery: 0,
    bass: 'r.r.r.5.r.r.5.a.',
    bassVoice: 'bass',
    shaker: 'x.xxx.xxx.xxx.xx',
    rim: '....x.......x...',
    kick: 'x.......x.x.....',
    hat: '................',
    pad: false,
    seed: 51,
  },
  world_2: {
    id: 'world_2',
    bpm: 104,
    swing: 0.3,
    keyRoot: 46, // Bb
    scale: MAJOR_BLUES,
    progressionA: rep([c(0, maj6), c(-3, min7), c(2, min7), c(7, dom7)], 8),
    progressionB: rep([c(5, dom7), c(5, dom7), c(0, maj6), c(-3, min7), c(2, min7), c(7, dom7), c(0, maj6), c(7, dom7)], 8),
    lead: 'reed',
    leadRhythm: [0, 3, 6, 8, 11, 14],
    comp: 'rhodes',
    compSteps: [3, 7, 11, 15],
    arp: null,
    arpEvery: 0,
    bass: 'r...3...5...a...',
    bassVoice: 'bass',
    shaker: 'x.x.x.x.x.x.x.x.',
    rim: '....x.......x...',
    kick: 'x.......x.......',
    hat: '..x...x...x...x.',
    pad: false,
    seed: 61,
  },
  world_3: {
    id: 'world_3',
    bpm: 108,
    swing: 0.04,
    keyRoot: 57, // A minor city-pop
    scale: DORIAN,
    progressionA: rep([c(-4, maj7), c(-2, maj6), c(-5, min7), c(0, min9)], 8),
    progressionB: rep([c(-4, maj7), c(-5, min7), c(-7, maj7), c(-2, dom7)], 8),
    lead: 'bell',
    leadRhythm: [0, 3, 4, 8, 10, 12, 14],
    comp: 'rhodes',
    compSteps: [0, 3, 6, 10, 12],
    arp: 'bell',
    arpEvery: 4,
    bass: 'r..r.5..r..r.5a.',
    bassVoice: 'bass',
    shaker: 'x.x.x.x.x.x.x.x.',
    rim: '....x.......x...',
    kick: 'x...x...x...x...',
    hat: '..x...x...x...x.',
    pad: true,
    seed: 71,
  },
  world_4: {
    id: 'world_4',
    bpm: 118,
    swing: 0.1,
    keyRoot: 55, // G pentatonic highlife
    scale: MAJOR_PENT,
    progressionA: rep([c(0, triad), c(5, triad), c(0, triad), c(7, dom7)], 8),
    progressionB: rep([c(0, triad), c(9, minTriad), c(5, triad), c(7, dom7)], 8),
    lead: 'kalimba',
    leadRhythm: [0, 2, 3, 5, 7, 8, 10, 11, 13, 15],
    comp: 'pluck',
    compSteps: [0, 3, 6, 8, 11, 14],
    arp: 'marimba',
    arpEvery: 3,
    bass: 'r..r..5.r..5..r.',
    bassVoice: 'bass',
    shaker: 'x.xxx.xxx.xxx.xx',
    rim: '..x...x...x...x.',
    kick: 'x.....x.x.......',
    hat: '................',
    pad: false,
    seed: 81,
  },
  world_5: {
    id: 'world_5',
    bpm: 80,
    swing: 0,
    keyRoot: 52, // E
    scale: LYDIAN,
    progressionA: rep([c(0, maj9), c(-3, min9), c(5, maj9), c(7, sus)], 8),
    progressionB: rep([c(0, maj9), c(4, min7), c(-3, min9), c(7, sus)], 8),
    lead: 'celesta',
    leadRhythm: [0, 5, 8, 13],
    comp: null,
    compSteps: [],
    arp: 'celesta',
    arpEvery: 2,
    bass: 'r.......r.....5.',
    bassVoice: 'bass',
    shaker: '................',
    rim: '................',
    kick: 'x.......x.......',
    hat: '................',
    pad: true,
    seed: 91,
    mixGain: 1.22,
  },
  pulp: {
    id: 'pulp',
    bpm: 128,
    swing: 0.03,
    keyRoot: 52, // E minor funk
    scale: MINOR_PENT,
    progressionA: rep([c(0, min7), c(0, min7), c(5, dom7), c(7, min7)], 8),
    progressionB: rep([c(0, min7), c(3, maj7), c(5, dom7), c(7, dom7)], 8),
    lead: 'reed',
    leadRhythm: [0, 3, 6, 7, 10, 12, 14],
    comp: 'rhodes',
    compSteps: [2, 5, 7, 10, 13],
    arp: null,
    arpEvery: 0,
    bass: 'r..r.r..5..r.ra.',
    bassVoice: 'bass',
    shaker: 'x.xxx.xxx.xxx.xx',
    rim: '....x.......x...',
    kick: 'x..x..x.x..x....',
    hat: '..x...x...x...x.',
    pad: false,
    seed: 101,
  },
};

export interface ThemeSelectContext {
  mode: AppMode;
  worldId?: string;
  hubGlobe?: boolean;
  pulpZero?: boolean;
}

export function selectTheme(ctx: ThemeSelectContext): ThemeId {
  switch (ctx.mode) {
    case 'COSMIC_INTRO':
      return 'cosmic';
    case 'BRUSH_ALONG':
      return 'brush_along';
    case 'REPORT':
      return 'report';
    case 'PULP_RESCUE':
      return 'pulp';
    case 'ARCADE': {
      const w = ctx.worldId ?? 'world_1';
      if (w === 'world_2' || w === 'world_3' || w === 'world_4' || w === 'world_5') return w;
      return 'world_1';
    }
    case 'HUB':
    default:
      if (ctx.pulpZero) return 'hub_ready';
      return ctx.hubGlobe ? 'hub_globe' : 'hub';
  }
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Midi note of scale degree `degree` (may be negative) counted from `base`. */
export function scaleMidi(scale: number[], base: number, degree: number): number {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return base + oct * 12 + scale[idx];
}

export function chordMidis(theme: ThemeDef, chord: ChordDef, transpose = 0, baseOct = 12): number[] {
  return chord.tones.map((t) => theme.keyRoot + transpose + chord.root + t + baseOct);
}

export function chordPitchClasses(theme: ThemeDef, chord: ChordDef, transpose = 0): Set<number> {
  const s = new Set<number>();
  for (const t of chord.tones) s.add((((theme.keyRoot + transpose + chord.root + t) % 12) + 12) % 12);
  return s;
}

export function snapToChord(midi: number, pcs: Set<number>): number {
  for (const off of [0, -1, 1, -2, 2]) {
    if (pcs.has((((midi + off) % 12) + 12) % 12)) return midi + off;
  }
  return midi;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function chordAtBar(theme: ThemeDef, bar: number): ChordDef {
  const b = ((bar % 16) + 16) % 16;
  return b < 8 ? theme.progressionA[b] : theme.progressionB[b - 8];
}

export interface GenerateOptions {
  transpose?: number; // semitones
  intensity?: number; // 0..1.2, scales velocities
  urgency?: boolean; // adds hat 16ths + brighter accents
  coda?: boolean; // sparkle coda mode
  layers?: { lead?: boolean; comp?: boolean; arp?: boolean; bass?: boolean; drums?: boolean; pad?: boolean };
  chordOverride?: ChordDef | null;
}

export interface StepResult {
  notes: NoteEvent[];
  drums: DrumEvent[];
  chord: ChordDef;
  bar: number;
  step: number;
}

/** Generates everything that should sound on global sixteenth `gs`. */
export function generateStep(theme: ThemeDef, gs: number, opts: GenerateOptions = {}): StepResult {
  const step = ((gs % 16) + 16) % 16;
  const bar = Math.floor(gs / 16);
  const barInLoop = ((bar % 16) + 16) % 16;
  const chord = opts.chordOverride ?? chordAtBar(theme, bar);
  const nextChord = opts.chordOverride ?? chordAtBar(theme, bar + 1);
  const tr = opts.transpose ?? 0;
  const k = opts.intensity ?? 1;
  const L = { lead: true, comp: true, arp: true, bass: true, drums: true, pad: true, ...opts.layers };
  const notes: NoteEvent[] = [];
  const drums: DrumEvent[] = [];
  const pcs = chordPitchClasses(theme, chord, tr);
  const section = barInLoop < 8 ? 0 : 1;
  const phraseBar = barInLoop % 4; // 4-bar phrases: question, answer, repeat, resolve

  // Pad swell on the downbeat of each bar (long attack, long release)
  if (L.pad && theme.pad && step === 0) {
    const tones = chordMidis(theme, chord, tr, 12).slice(0, 4);
    tones.forEach((m, i) => {
      notes.push({ voice: 'pad', midi: m, vel: 0.35 * k, durSteps: 16, pan: (i - 1.5) * 0.35, send: 0.6 });
    });
  }

  // Chord comp stabs
  if (L.comp && theme.comp && theme.compSteps.includes(step)) {
    const tones = chordMidis(theme, chord, tr, 12).slice(0, 4);
    const strong = step === 0 || step === 8;
    tones.forEach((m, i) => {
      notes.push({
        voice: theme.comp as VoiceName,
        midi: m,
        vel: (strong ? 0.5 : 0.36) * k * (0.9 + 0.1 * ((i + step) % 3)),
        durSteps: strong ? 4 : 2,
        pan: -0.25 + i * 0.15,
        send: 0.35,
      });
    });
  }

  // Arpeggio
  if (L.arp && theme.arp && theme.arpEvery > 0 && step % theme.arpEvery === 0) {
    const tones = chordMidis(theme, chord, tr, 24);
    const idx = (Math.floor(step / theme.arpEvery) + bar) % tones.length;
    const pan = Math.sin((gs + theme.seed) * 0.7) * 0.6;
    notes.push({ voice: theme.arp, midi: tones[idx], vel: 0.3 * k, durSteps: 3, pan, send: 0.7 });
  }

  // Lead melody (A/B sections, 4-bar phrases with repeat & resolve)
  if (L.lead && theme.lead && theme.leadRhythm.includes(step)) {
    const motifBar = phraseBar === 2 ? 0 : phraseBar === 3 ? 1 : phraseBar;
    const rand = rng(theme.seed * 977 + section * 131 + motifBar * 17 + step * 3);
    const gate = rand();
    const density = opts.coda ? 1 : 0.78;
    if (gate < density) {
      const rhythmIdx = theme.leadRhythm.indexOf(step);
      // random walk in scale degrees anchored by phrase position
      const walkRand = rng(theme.seed * 31 + section * 7 + motifBar * 101);
      let deg = section === 0 ? 2 : 4;
      for (let i = 0; i <= rhythmIdx; i++) {
        const stepDeg = Math.floor(walkRand() * 5) - 2; // -2..2
        deg += stepDeg;
        deg = Math.max(-2, Math.min(theme.scale.length + 3, deg));
      }
      const base = theme.keyRoot + tr + 24;
      let midi = scaleMidi(theme.scale, base, deg);
      const strong = step % 4 === 0;
      if (strong) midi = snapToChord(midi, pcs);
      // cadence: final lead note of phrase resolves to chord root
      if (phraseBar === 3 && rhythmIdx === theme.leadRhythm.length - 1) {
        midi = theme.keyRoot + tr + chord.root + 24;
      }
      while (midi > theme.keyRoot + tr + 40) midi -= 12;
      notes.push({
        voice: theme.lead,
        midi,
        vel: (strong ? 0.62 : 0.5) * k * (0.92 + rand() * 0.16),
        durSteps: strong ? 3 : 2,
        pan: 0.25 + (rand() - 0.5) * 0.3,
        send: 0.4,
      });
    }
  }

  // Bass
  if (L.bass) {
    const ch = theme.bass[step];
    if (ch && ch !== '.') {
      const rootMidi = theme.keyRoot + tr + chord.root;
      let low = rootMidi;
      while (low > theme.keyRoot + tr + 7) low -= 12;
      while (low < theme.keyRoot + tr - 8) low += 12;
      let m = low;
      if (ch === '5') m = low + 7;
      else if (ch === '3') m = low + (chord.tones[1] ?? 4);
      else if (ch === 'o') m = low + 12;
      else if (ch === 'a') {
        const nextRoot = theme.keyRoot + tr + nextChord.root;
        let n = nextRoot;
        while (n > low + 7) n -= 12;
        while (n < low - 5) n += 12;
        m = n + (n >= low ? -1 : 1);
      }
      notes.push({
        voice: theme.bassVoice,
        midi: m,
        vel: (step === 0 ? 0.7 : 0.55) * k,
        durSteps: 2,
        pan: 0,
        send: 0.05,
      });
    }
  }

  // Soft brushed percussion
  if (L.drums) {
    if (theme.shaker[step] && theme.shaker[step] !== '.')
      drums.push({ kind: 'shaker', vel: (theme.shaker[step] === 'X' ? 0.8 : 0.5) * k });
    if (theme.rim[step] && theme.rim[step] !== '.') drums.push({ kind: 'rim', vel: 0.5 * k });
    if (theme.kick[step] && theme.kick[step] !== '.') drums.push({ kind: 'kick', vel: 0.65 * k });
    if (theme.hat[step] && theme.hat[step] !== '.') drums.push({ kind: 'hat', vel: 0.35 * k });
    if (opts.urgency && step % 2 === 0 && !drums.some((d) => d.kind === 'hat')) {
      drums.push({ kind: 'hat', vel: 0.32 * k });
    }
  }

  return { notes, drums, chord, bar, step };
}

/** Quadrant (0..3) → transposition used by the Brush-Along pacer so the groove evolves. */
export const PACER_TRANSPOSE: number[] = [0, 2, 4, 7];

/** Distinct chord bar index per Cosmic Intro prologue beat (Cmaj9 → Fmaj7 → Amin9 → Gsus). */
export const COSMIC_BEAT_BARS: readonly number[] = [0, 2, 1, 3];

/** Intervals for harmonic quantization of gameplay SFX. */
export function harmonicSfxMidi(theme: ThemeDef, chord: ChordDef, degree: number, octaveShift = 36): number {
  const base = theme.keyRoot + octaveShift;
  const pcs = chordPitchClasses(theme, chord);
  return snapToChord(scaleMidi(theme.scale, base, degree), pcs);
}

// ---------------------------------------------------------------------------
// Audio preference persistence (pure; storage injectable for tests)
// ---------------------------------------------------------------------------

export interface AudioPrefs {
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
}

export const AUDIO_PREFS_KEY = 'mouthlife.audioPrefs';
export const DEFAULT_AUDIO_PREFS: AudioPrefs = { muted: false, musicVolume: 0.7, sfxVolume: 0.85 };

const clamp01 = (n: unknown, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;

export function sanitizeAudioPrefs(raw: unknown): AudioPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    muted: r.muted === true,
    musicVolume: clamp01(r.musicVolume, DEFAULT_AUDIO_PREFS.musicVolume),
    sfxVolume: clamp01(r.sfxVolume, DEFAULT_AUDIO_PREFS.sfxVolume),
  };
}

type MiniStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function loadAudioPrefs(storage?: MiniStorage | null): AudioPrefs {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    const txt = s?.getItem(AUDIO_PREFS_KEY);
    if (!txt) return { ...DEFAULT_AUDIO_PREFS };
    return sanitizeAudioPrefs(JSON.parse(txt));
  } catch {
    return { ...DEFAULT_AUDIO_PREFS };
  }
}

export function saveAudioPrefs(prefs: AudioPrefs, storage?: MiniStorage | null): void {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    s?.setItem(AUDIO_PREFS_KEY, JSON.stringify(sanitizeAudioPrefs(prefs)));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/** Synergy thresholds that trigger the rank-up chime. */
export const SYNERGY_RANKS = [1.5, 2.0, 2.5, 3.0];
export function synergyRankIndex(mult: number): number {
  let r = -1;
  for (let i = 0; i < SYNERGY_RANKS.length; i++) if (mult >= SYNERGY_RANKS[i] - 1e-6) r = i;
  return r;
}
