/**
 * Lookahead Web Audio music sequencer: a ~45ms setInterval only *schedules* notes
 * 0.14s ahead on the audio clock — notes never play directly on timer ticks.
 */
import {
  THEMES,
  chordAtBar,
  generateStep,
  type ChordDef,
  type GenerateOptions,
  type ThemeDef,
  type ThemeId,
} from './musicTheory';
import { playDrum, playVoice, type VoiceOut } from './SynthVoices';

export const LOOKAHEAD_SEC = 0.14;
export const SCHEDULER_INTERVAL_MS = 45;

export class MusicSequencer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private gs = 0;
  theme: ThemeDef = THEMES.hub;
  opts: GenerateOptions = {};
  tempoScale = 1;
  currentChord: ChordDef = THEMES.hub.progressionA[0];
  stepsScheduled = 0;
  onTempo: ((stepSec: number) => void) | null = null;

  constructor(private readonly ctx: AudioContext, private readonly out: VoiceOut) {}

  isRunning(): boolean {
    return this.timer !== null;
  }

  stepSec(): number {
    return 60 / (this.theme.bpm * this.tempoScale) / 4;
  }

  setTheme(id: ThemeId): void {
    if (this.theme.id === id) return;
    this.theme = THEMES[id];
    this.gs = 0;
    this.currentChord = chordAtBar(this.theme, 0);
    this.onTempo?.(this.stepSec());
    // Re-align to "now" so the new theme starts promptly without overlapping backlog.
    this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.06);
  }

  setTempoScale(s: number): void {
    this.tempoScale = s;
    this.onTempo?.(this.stepSec());
  }

  start(): void {
    if (this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.08; // never burst-schedule a backlog
    this.onTempo?.(this.stepSec());
    this.timer = setInterval(() => this.tick(), SCHEDULER_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Public so tests / debug hooks can pump the scheduler deterministically. */
  tick(): void {
    const now = this.ctx.currentTime;
    if (this.nextTime < now - 0.25) this.nextTime = now + 0.05; // tab was throttled: skip, don't flood
    let guard = 0;
    while (this.nextTime < now + LOOKAHEAD_SEC && guard++ < 16) {
      this.scheduleStep(this.nextTime);
      const stepSec = this.stepSec();
      this.nextTime += stepSec;
      this.gs++;
    }
  }

  private scheduleStep(t0: number): void {
    const stepSec = this.stepSec();
    const res = generateStep(this.theme, this.gs, this.opts);
    this.currentChord = res.chord;
    this.stepsScheduled++;
    const swing = res.step % 2 === 1 ? this.theme.swing * stepSec : 0;
    const base = t0 + swing;
    for (const n of res.notes) {
      const human = (Math.random() - 0.5) * 0.012;
      const t = Math.max(this.ctx.currentTime, base + human);
      const vel = Math.max(0.05, Math.min(1.2, n.vel * (0.94 + Math.random() * 0.12)));
      playVoice(this.out, n.voice, t, n.midi, n.durSteps * stepSec, vel, n.pan, n.send);
    }
    for (const d of res.drums) {
      playDrum(this.out, d.kind, Math.max(this.ctx.currentTime, base), d.vel * (0.9 + Math.random() * 0.2));
    }
  }
}
