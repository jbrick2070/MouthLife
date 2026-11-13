import {
  evaluateBrushPhase,
  pacerStageEndSec,
  type PacerStage,
} from '../config/brushCoach';
import {
  BRUSH_ALONG_FLOSS_BONUS_SEC,
  BRUSH_ALONG_MOUTHWASH_BONUS_SEC,
  BRUSH_ALONG_TOTAL_SEC,
} from '../config/gameConfig';
import type { EventBus } from './EventBus';

export const FIXED_DT = 1 / 60;
const MAX_FRAME_DELTA_SEC = 0.1;
const MAX_HIT_STOP_SEC = 0.09;
/** The brushing pacer follows real time (a slow frame must not stretch 2:00), but never jumps more than this. */
const MAX_PACER_DELTA_SEC = 0.5;

export class ClockController {
  private rafId: number | null = null;
  private lastNowMs = 0;
  private accumulatorSec = 0;
  /** Seconds the simulation stays frozen to punctuate a big hit (rendering continues). */
  private hitStopSec = 0;

  private pacerActive = false;
  private pacerPausedManual = false;
  /** Paused because the tab was hidden, not by the user: resumes by itself when the tab returns. */
  private pacerSuspendedBySystem = false;
  private pacerStage: PacerStage = 'brushing';
  private pacerMouthwashDurationSec = BRUSH_ALONG_MOUTHWASH_BONUS_SEC;
  /** Cumulative session clock: 0..120 brushing, 120..165 floss, 165.. rinse. */
  private pacerElapsedSec = 0;
  private lastEmittedDecisecond = -1;

  private onSimFixedStep: ((dt: number) => void) | null = null;
  private onRenderFrame: ((frameDt: number, nowSec: number, simAlpha: number) => void) | null = null;
  private visibilityListenerBound = false;

  constructor(private readonly bus: EventBus) {}

  setCallbacks(
    onSimFixedStep: (dt: number) => void,
    onRenderFrame: (frameDt: number, nowSec: number, simAlpha: number) => void
  ): void {
    this.onSimFixedStep = onSimFixedStep;
    this.onRenderFrame = onRenderFrame;
  }

  start(): void {
    if (this.rafId !== null) return;
    if (!this.visibilityListenerBound && typeof document !== 'undefined') {
      this.visibilityListenerBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.accumulatorSec = 0;
          if (this.pacerActive && !this.pacerPausedManual) {
            this.setPacerPausedInternal(true);
            this.pacerSuspendedBySystem = true;
          }
        } else {
          this.lastNowMs = performance.now();
          if (this.pacerActive && this.pacerSuspendedBySystem) {
            this.pacerSuspendedBySystem = false;
            this.setPacerPausedInternal(false);
          }
        }
      });
    }
    this.lastNowMs = performance.now();
    const loop = (nowMs: number) => {
      this.tickFrame(nowMs);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /**
   * Freeze the simulation for a few hundredths of a second so a big moment lands with weight.
   * Capped so it can never feel like a hang; a second request extends to the longer of the two.
   */
  requestHitStop(seconds: number): void {
    this.hitStopSec = Math.max(this.hitStopSec, Math.min(MAX_HIT_STOP_SEC, Math.max(0, seconds)));
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  startPacer(): void {
    this.pacerActive = true;
    this.pacerPausedManual = false;
    this.pacerSuspendedBySystem = false;
    this.pacerStage = 'brushing';
    this.pacerElapsedSec = 0;
    this.lastEmittedDecisecond = -1;
    this.requestScreenWakeLock();
  }

  /** Jump (or roll) into the 45s floss stage. */
  enterFlossBonus(): void {
    this.enterPacerStage('flossBonus', BRUSH_ALONG_TOTAL_SEC);
  }

  /** Jump (or roll) into the fluoride rinse stage. */
  enterMouthwashBonus(): void {
    this.enterPacerStage('mouthwashBonus', BRUSH_ALONG_TOTAL_SEC + BRUSH_ALONG_FLOSS_BONUS_SEC);
  }

  private enterPacerStage(stage: PacerStage, startSec: number): void {
    this.pacerActive = true;
    this.pacerPausedManual = false;
    this.pacerSuspendedBySystem = false;
    this.pacerStage = stage;
    this.pacerElapsedSec = startSec;
    this.lastEmittedDecisecond = -1;
    this.requestScreenWakeLock();
  }

  /** Switching 60s/30s mid-rinse keeps the same fraction of the rinse done. */
  setPacerMouthwashDurationSec(durationSec: number): void {
    const newDur = Math.max(6, durationSec);
    const oldDur = Math.max(6, this.pacerMouthwashDurationSec);
    if (this.pacerStage === 'mouthwashBonus' && newDur !== oldDur) {
      const mwStart = BRUSH_ALONG_TOTAL_SEC + BRUSH_ALONG_FLOSS_BONUS_SEC;
      const frac = Math.min(0.98, Math.max(0, (this.pacerElapsedSec - mwStart) / oldDur));
      this.pacerElapsedSec = mwStart + frac * newDur;
      this.lastEmittedDecisecond = -1;
    }
    this.pacerMouthwashDurationSec = newDur;
  }

  getPacerMouthwashDurationSec(): number {
    return this.pacerMouthwashDurationSec;
  }

  stopPacer(): void {
    this.pacerActive = false;
    this.pacerPausedManual = false;
    this.pacerSuspendedBySystem = false;
    this.pacerStage = 'brushing';
  }

  /** User-driven pause/resume. */
  setPacerPaused(paused: boolean): void {
    this.pacerSuspendedBySystem = false;
    this.setPacerPausedInternal(paused);
  }

  private setPacerPausedInternal(paused: boolean): void {
    const changed = this.pacerPausedManual !== paused;
    this.pacerPausedManual = paused;
    if (!paused) {
      this.requestScreenWakeLock();
    }
    if (changed && this.pacerActive) {
      this.bus.emit('pacer:paused', { paused });
    }
  }

  isPacerPaused(): boolean {
    return this.pacerPausedManual;
  }

  isPacerActive(): boolean {
    return this.pacerActive;
  }

  getPacerStage(): PacerStage {
    return this.pacerStage;
  }

  isPacerInFlossBonus(): boolean {
    return this.pacerStage === 'flossBonus';
  }

  getPacerElapsedSec(): number {
    return this.pacerElapsedSec;
  }

  /** Cumulative session-clock second at which the current stage ends. */
  getPacerStageEndSec(): number {
    return pacerStageEndSec(this.pacerStage, this.pacerMouthwashDurationSec);
  }

  private requestScreenWakeLock(): void {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<unknown> } })
        .wakeLock?.request('screen')
        .catch(() => {});
    }
  }

  tickFrame(nowMs: number): void {
    const rawDeltaSec = Math.max(0, (nowMs - this.lastNowMs) / 1000);
    this.lastNowMs = nowMs;

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }

    const clampedDt = Math.min(rawDeltaSec, MAX_FRAME_DELTA_SEC);

    // Fixed-step simulation accumulator
    if (this.hitStopSec > 0) {
      this.hitStopSec = Math.max(0, this.hitStopSec - clampedDt);
    } else if (this.onSimFixedStep) {
      this.accumulatorSec += clampedDt;
      let subSteps = 0;
      while (this.accumulatorSec >= FIXED_DT && subSteps < 8) {
        this.onSimFixedStep(FIXED_DT);
        this.accumulatorSec -= FIXED_DT;
        subSteps++;
      }
      if (subSteps >= 8) {
        this.accumulatorSec = 0;
      }
    }

    // Real-time Brush-Along pacer (brush, floss, rinse on one cumulative clock)
    if (this.pacerActive && !this.pacerPausedManual) {
      const cap = this.getPacerStageEndSec();
      const pacerDt = Math.min(rawDeltaSec, MAX_PACER_DELTA_SEC);
      this.pacerElapsedSec = Math.min(cap, this.pacerElapsedSec + pacerDt);
      const decisecond = Math.floor(this.pacerElapsedSec * 10);
      if (decisecond !== this.lastEmittedDecisecond) {
        this.lastEmittedDecisecond = decisecond;
        const phase = evaluateBrushPhase(
          this.pacerElapsedSec,
          this.pacerStage,
          this.pacerMouthwashDurationSec
        );
        this.bus.emit('pacer:tick', {
          elapsedSec: this.pacerElapsedSec,
          stage: this.pacerStage,
          quadrantIdx: phase.quadrant,
          surfaceIdx: phase.surface,
          inFlossBonus: this.pacerStage === 'flossBonus',
        });
      }
    }

    // simAlpha = how far this frame sits between the last two fixed sim steps (0..1). On displays
    // faster than 60 Hz most frames fall between steps; drawing the blend removes the judder.
    const simAlpha = this.onSimFixedStep ? Math.min(1, this.accumulatorSec / FIXED_DT) : 1;
    this.onRenderFrame?.(clampedDt, nowMs / 1000, simAlpha);
  }
}
