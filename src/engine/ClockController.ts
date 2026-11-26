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
import { setNativeKeepScreenOn } from './nativePlatform';

export const FIXED_DT = 1 / 60;
const MAX_FRAME_DELTA_SEC = 0.1;
const MAX_HIT_STOP_SEC = 0.09;

export class ClockController {
  private rafId: number | null = null;
  private lastNowMs = 0;
  private accumulatorSec = 0;
  /** Seconds the simulation stays frozen to punctuate a big hit (rendering continues). */
  private hitStopSec = 0;

  private pacerActive = false;
  private pacerPausedManual = false;
  private pacerStage: PacerStage = 'brushing';
  private pacerMouthwashDurationSec = BRUSH_ALONG_MOUTHWASH_BONUS_SEC;
  /**
   * Cumulative session clock on real time: 0..120 brushing, 120..165 floss, 165.. rinse. It keeps
   * running while the tab is hidden or the phone is locked (H04); only the player's Pause and the
   * wait between stages stop it. It may run past the current stage's end until the ritual notices
   * (the phone was locked); that overflow says how long ago the stage really ended, and is dropped
   * when the clock holds for the next stage: every stage starts at its own 0:00, on a tap.
   */
  private pacerRawSec = 0;
  /**
   * Brushing or floss has run its time and the next stage waits for a tap ("Start Flossing",
   * "Start Rinse"): the clock holds at the stage's end and the screen may dim, as when paused.
   */
  private pacerWaiting = false;
  /** Wall-clock time the tab was hidden, to count the time away when it comes back. */
  private hiddenAtWallMs: number | null = null;
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
          this.noteHidden(Date.now());
        } else {
          this.noteVisible(Date.now(), performance.now());
        }
      });
    }
    this.lastNowMs = performance.now();
    const loop = (nowMs: number) => {
      // Ask for the next frame before running this one. If anything in this frame fails (a browser
      // refusing some feature, as in H07), the picture and the 2-minute brushing timer still go on.
      this.rafId = requestAnimationFrame(loop);
      this.tickFrame(nowMs);
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

  /** The tab was hidden or the phone locked: the session clock keeps going (H04). */
  noteHidden(wallNowMs: number): void {
    this.accumulatorSec = 0;
    this.hiddenAtWallMs = wallNowMs;
  }

  /**
   * Back in view: the time away counts on the session clock (never backwards, if the device clock
   * was changed meanwhile), and the screen is kept awake again. A stage that ended while away then
   * holds at its end for the tap that starts the next one (or finishes the brush, when the wait has
   * already run out). Paused, or already waiting between stages, the time away counts for nothing.
   */
  noteVisible(wallNowMs: number, perfNowMs: number): void {
    this.lastNowMs = perfNowMs;
    const hiddenAt = this.hiddenAtWallMs;
    this.hiddenAtWallMs = null;
    if (hiddenAt !== null && this.pacerActive && !this.pacerPausedManual && !this.pacerWaiting) {
      this.pacerRawSec += Math.max(0, wallNowMs - hiddenAt) / 1000;
      this.lastEmittedDecisecond = -1;
      this.requestScreenWakeLock();
    }
    // The browser lets go of the wake lock whenever the page is hidden, so a finale that is still
    // playing asks for it again.
    if (this.showAwake) this.requestScreenWakeLock();
  }

  /**
   * A city's finale starts (on) or ends (off). The show plays by itself for 30 to 90 seconds with
   * nothing to touch, so without this the phone would dim and lock in the middle of it. Off lets
   * the screen go again, unless a brush is running and still needs it.
   */
  setShowAwake(on: boolean): void {
    this.showAwake = on;
    if (on) {
      this.requestScreenWakeLock();
    } else if (!this.pacerActive || this.pacerPausedManual || this.pacerWaiting) {
      this.releaseScreenWakeLock();
    }
  }

  startPacer(): void {
    this.pacerActive = true;
    this.pacerPausedManual = false;
    this.pacerWaiting = false;
    this.pacerStage = 'brushing';
    this.pacerRawSec = 0;
    this.lastEmittedDecisecond = -1;
    this.requestScreenWakeLock();
  }

  /** Start the 45s floss stage (a tap on "Start Flossing"), at its 0:00. */
  enterFlossBonus(): void {
    this.enterPacerStage('flossBonus', BRUSH_ALONG_TOTAL_SEC);
  }

  /** Start the fluoride rinse stage (a tap on "Start Rinse" or the rinse button during floss), at its 0:00. */
  enterMouthwashBonus(): void {
    this.enterPacerStage('mouthwashBonus', BRUSH_ALONG_TOTAL_SEC + BRUSH_ALONG_FLOSS_BONUS_SEC);
  }

  private enterPacerStage(stage: PacerStage, startSec: number): void {
    // Nothing carries over: time past the stage before (the phone was locked) was dropped by the hold.
    this.pacerActive = true;
    this.pacerPausedManual = false;
    this.pacerWaiting = false;
    this.pacerStage = stage;
    this.pacerRawSec = startSec;
    this.lastEmittedDecisecond = -1;
    this.requestScreenWakeLock();
  }

  /**
   * The current stage has run its time and the next waits for a tap. The clock stops at the stage's
   * end and stays there; any time already past it (the phone was locked, H04) is dropped, so read
   * `getPacerOverflowSec()` first to know when the stage really ended. The screen may dim meanwhile.
   */
  holdPacerForNextStage(): void {
    if (!this.pacerActive) return;
    this.pacerRawSec = this.getPacerStageEndSec();
    this.pacerWaiting = true;
    // A card has nothing to resume: a pause (floss skipped while paused) ends here. Quietly: the
    // overlay brings the music back itself and lets go of speech left paused.
    this.pacerPausedManual = false;
    this.lastEmittedDecisecond = -1;
    this.releaseScreenWakeLock();
  }

  /** Between stages: brushing or floss is over and the next stage has not been started yet. */
  isPacerWaiting(): boolean {
    return this.pacerActive && this.pacerWaiting;
  }

  /** Switching 60s/30s mid-rinse keeps the same fraction of the rinse done. */
  setPacerMouthwashDurationSec(durationSec: number): void {
    const newDur = Math.max(6, durationSec);
    const oldDur = Math.max(6, this.pacerMouthwashDurationSec);
    if (this.pacerStage === 'mouthwashBonus' && newDur !== oldDur) {
      const mwStart = BRUSH_ALONG_TOTAL_SEC + BRUSH_ALONG_FLOSS_BONUS_SEC;
      const frac = Math.min(0.98, Math.max(0, (this.getPacerElapsedSec() - mwStart) / oldDur));
      this.pacerRawSec = mwStart + frac * newDur;
      this.lastEmittedDecisecond = -1;
    }
    this.pacerMouthwashDurationSec = newDur;
  }

  getPacerMouthwashDurationSec(): number {
    return this.pacerMouthwashDurationSec;
  }

  stopPacer(): void {
    this.releaseScreenWakeLock();
    this.pacerActive = false;
    this.pacerPausedManual = false;
    this.pacerWaiting = false;
    this.pacerStage = 'brushing';
  }

  /** User-driven pause/resume: with the wait between stages, the only things that stop the session clock. */
  setPacerPaused(paused: boolean): void {
    this.setPacerPausedInternal(paused);
  }

  private setPacerPausedInternal(paused: boolean): void {
    const changed = this.pacerPausedManual !== paused;
    this.pacerPausedManual = paused;
    if (!paused && !this.pacerWaiting) {
      this.requestScreenWakeLock();
    } else {
      this.releaseScreenWakeLock();
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

  /** The session clock, held at the current stage's end until the next stage is started. */
  getPacerElapsedSec(): number {
    return Math.min(this.getPacerStageEndSec(), this.pacerRawSec);
  }

  /** How far the session clock has run past the current stage's end (time spent locked or hidden). */
  getPacerOverflowSec(): number {
    return Math.max(0, this.pacerRawSec - this.getPacerStageEndSec());
  }

  /** Cumulative session-clock second at which the current stage ends. */
  getPacerStageEndSec(): number {
    return pacerStageEndSec(this.pacerStage, this.pacerMouthwashDurationSec);
  }

  /**
   * One screen wake lock, held while the pacer runs and let go when it pauses, waits between stages
   * or stops. A city's
   * finale holds the same lock for as long as it plays (`showAwake`).
   */
  private wakeLock: { release(): Promise<void>; addEventListener?: (type: 'release', cb: () => void) => void } | null = null;
  private wakeWanted = false;
  /** A finale is playing: the screen stays awake whatever the pacer does meanwhile. */
  private showAwake = false;

  private requestScreenWakeLock(): void {
    this.wakeWanted = true;
    setNativeKeepScreenOn(true);
    if (this.wakeLock || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<NonNullable<ClockController['wakeLock']>> } })
      .wakeLock?.request('screen')
      .then((lock) => {
        // the pacer may have stopped while the request was pending
        if (!this.wakeWanted || this.wakeLock) {
          void lock.release().catch(() => {});
          return;
        }
        this.wakeLock = lock;
        lock.addEventListener?.('release', () => {
          if (this.wakeLock === lock) this.wakeLock = null;
        });
      })
      .catch(() => {});
  }

  private releaseScreenWakeLock(): void {
    // A finale still needs the screen: a brush pausing or ending must not take the lock from it.
    if (this.showAwake) return;
    this.wakeWanted = false;
    setNativeKeepScreenOn(false);
    const lock = this.wakeLock;
    this.wakeLock = null;
    if (lock) void lock.release().catch(() => {});
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

    // Real-time Brush-Along pacer (brush, floss, rinse on one cumulative clock). A slow frame or a
    // stall counts in full: the ritual follows the clock on the wall, not the frame rate.
    if (this.pacerActive && !this.pacerPausedManual && !this.pacerWaiting) {
      this.pacerRawSec += rawDeltaSec;
      const elapsedSec = this.getPacerElapsedSec();
      const decisecond = Math.floor(elapsedSec * 10);
      if (decisecond !== this.lastEmittedDecisecond) {
        this.lastEmittedDecisecond = decisecond;
        const phase = evaluateBrushPhase(
          elapsedSec,
          this.pacerStage,
          this.pacerMouthwashDurationSec
        );
        this.bus.emit('pacer:tick', {
          elapsedSec,
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
