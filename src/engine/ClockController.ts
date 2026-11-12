import {
  BRUSH_ALONG_FLOSS_BONUS_SEC,
  BRUSH_ALONG_TOTAL_SEC,
} from '../config/gameConfig';
import type { EventBus } from './EventBus';

export const FIXED_DT = 1 / 60;
const MAX_FRAME_DELTA_SEC = 0.1;

export class ClockController {
  private rafId: number | null = null;
  private lastNowMs = 0;
  private accumulatorSec = 0;

  private pacerActive = false;
  private pacerPausedManual = false;
  private pacerInFlossBonus = false;
  private pacerElapsedSec = 0;
  private lastEmittedDecisecond = -1;

  private onSimFixedStep: ((dt: number) => void) | null = null;
  private onRenderFrame: ((frameDt: number, nowSec: number) => void) | null = null;
  private visibilityListenerBound = false;

  constructor(private readonly bus: EventBus) {}

  setCallbacks(
    onSimFixedStep: (dt: number) => void,
    onRenderFrame: (frameDt: number, nowSec: number) => void
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
            this.setPacerPaused(true);
          }
        } else {
          this.lastNowMs = performance.now();
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

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  startPacer(): void {
    this.pacerActive = true;
    this.pacerPausedManual = false;
    this.pacerInFlossBonus = false;
    this.pacerElapsedSec = 0;
    this.lastEmittedDecisecond = -1;
    this.requestScreenWakeLock();
  }

  startFlossBonusPacer(): void {
    this.pacerActive = true;
    this.pacerPausedManual = false;
    this.pacerInFlossBonus = true;
    this.pacerElapsedSec = 0;
    this.lastEmittedDecisecond = -1;
    this.requestScreenWakeLock();
  }

  stopPacer(): void {
    this.pacerActive = false;
    this.pacerPausedManual = false;
    this.pacerInFlossBonus = false;
  }

  setPacerPaused(paused: boolean): void {
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

  isPacerInFlossBonus(): boolean {
    return this.pacerInFlossBonus;
  }

  getPacerElapsedSec(): number {
    return this.pacerElapsedSec;
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
    if (this.onSimFixedStep) {
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

    // Real-time unskippable Brush-Along pacer
    if (this.pacerActive && !this.pacerPausedManual) {
      const targetSec = this.pacerInFlossBonus
        ? BRUSH_ALONG_FLOSS_BONUS_SEC
        : BRUSH_ALONG_TOTAL_SEC;
      this.pacerElapsedSec = Math.min(targetSec, this.pacerElapsedSec + clampedDt);
      const decisecond = Math.floor(this.pacerElapsedSec * 10);
      if (decisecond !== this.lastEmittedDecisecond) {
        this.lastEmittedDecisecond = decisecond;
        const quadrantIdx = Math.min(3, Math.floor(this.pacerElapsedSec / 30));
        const withinQuad = this.pacerElapsedSec - quadrantIdx * 30;
        const surfaceIdx = Math.min(2, Math.floor(withinQuad / 10));
        this.bus.emit('pacer:tick', {
          elapsedSec: this.pacerElapsedSec,
          quadrantIdx,
          surfaceIdx,
          inFlossBonus: this.pacerInFlossBonus,
        });
      }
    }

    this.onRenderFrame?.(clampedDt, nowMs / 1000);
  }
}
