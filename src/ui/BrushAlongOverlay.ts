import {
  BrushCoachCopy,
  BrushSurface,
  COACH_LANGUAGES,
  COACH_LANGUAGE_INFO,
  GYRO_SLOSH_IDLE,
  GyroSloshSim,
  deviceMotionSign,
  evaluateBrushPhase,
  isCoachLanguage,
  isPatientRightQuadrant,
  isUpperQuadrant,
  motionGravityG,
  motionUserAccelG,
  mouthwashDurationSec,
  type BrushPhaseState,
  type CoachLanguage,
  type FlossToolStyle,
  type GyroSloshSnapshot,
  type MouthwashDurationStyle,
  type PacerStage,
} from '../config/brushCoach';
import { BrushCheckpoint } from '../config/brushCheckpoint';
import { SMILE_ON_U_CHARITY } from '../config/charityInfo';
import {
  BRUSH_ALONG_FLOSS_BONUS_SEC,
  BRUSH_ALONG_FULL_BRUSH_GRACE_SEC,
  BRUSH_ALONG_STAGE_WAIT_SEC,
  BRUSH_ALONG_TOTAL_SEC,
  DAILY_FULL_REWARD_CAP,
} from '../config/gameConfig';
import type { VoiceCoach } from '../engine/audio/VoiceCoach';
import type { ClockController } from '../engine/ClockController';
import { DisposerBag, type EventBus } from '../engine/EventBus';
import {
  brushAlongMultiplier,
  brushAlongRinseCredit,
  brushRewardDay,
  formatLocalDateKey,
} from '../engine/persistence/HabitBank';
import { readIncludeRinse } from '../engine/persistence/pacerPrefs';
import {
  clearPendingBrush,
  holdBrushLock,
  newBrushSessionId,
  settleBrush,
  writePendingBrush,
} from '../engine/persistence/pendingBrush';
import type { SaveSystem } from '../engine/persistence/SaveSystem';
import type { OverlayView } from '../engine/types';
import { uiTranslator } from '../i18n/uiTranslator';
import { HOME_ICON_SVG } from './homeIcon';

// Same preference names as the native app (it keeps these outside the save too).
const FLOSS_STYLE_KEY = 'mouthlife.pacer.flossToolStyle';
const MOUTHWASH_STYLE_KEY = 'mouthlife.pacer.mouthwashDurationStyle';

function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}

/** Screen-space arc for one quadrant of the mirror compass (screen-left = patient left). */
function quadrantArcPath(q: number, scale = 1): string {
  const cx = 39;
  const cy = 37;
  const rx = 78 * 0.38 * scale;
  const ry = 74 * 0.39 * scale;
  // Angles in screen coords: 0 = right, 1.5π = top, π = left, 0.5π = bottom.
  const spans: Record<number, [number, number]> = {
    1: [1.05, 1.45], // upper-left
    0: [1.55, 1.95], // upper-right
    2: [0.95, 0.55], // lower-left
    3: [0.45, 0.05], // lower-right
  };
  const [a0, a1] = spans[q] ?? spans[0];
  const yShift = isUpperQuadrant(q) ? -3 : 3;
  const steps = 14;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const ang = (a0 + (a1 - a0) * (i / steps)) * Math.PI;
    const x = cx + Math.cos(ang) * rx;
    const y = cy + yShift + Math.sin(ang) * ry;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

const SURFACE_COLORS = ['var(--cyan)', 'var(--gold)', 'var(--mint)'] as const;
const SURFACE_ICONS = ['〰️', '▦', '↕️'] as const;

/** The stage a waiting card offers to start: floss after brushing, the rinse after floss. */
type StageWait = 'floss' | 'rinse';

/** How long the skip-to-floss button stays armed ("Tap again") after its first tap. */
const SKIP_TO_FLOSS_ARM_MS = 3000;

export interface BrushAlongCallbacks {
  /** Active quadrant for the 3D arch highlight; -1 when none. */
  onActiveQuadrantChanged: (quadrantIdx: number) => void;
  onPlayCue: (kind: 'surface' | 'quadrant' | 'complete') => void;
  /** 3-2-1 anticipation tick before each switch. */
  onPlayPip?: (secondsLeft: number, isUpper: boolean) => void;
  /** Rinse sloshed across the mouth (tilt-driven, phones only). */
  onPlaySwish?: (pan: number, intensity01: number) => void;
  /**
   * Back to the hub. `hubNote`: what a brush saved on the way out (Exit after the 2 minutes of
   * brushing: from a card, or during floss or the rinse) earned, for the hub's status banner; the
   * summary is skipped then, so this says it was kept.
   */
  onExitToHub: (hubNote?: string) => void;
  isMuted?: () => boolean;
  onToggleMute?: () => void;
  onPauseChanged?: (paused: boolean) => void;
}

export class BrushAlongOverlay implements OverlayView {
  private disposers = new DisposerBag();
  private container: HTMLElement | null = null;
  private view: 'running' | 'summary' = 'running';
  private renderedStage: PacerStage | null = null;
  private completedFloss = false;
  /** Whether the brushing stage ran its full 2 minutes (not tapped ahead to floss early). */
  private fullBrush = false;
  /** The fluoride rinse step (ages 6 and up): off until a grown-up turns it on in Settings. */
  private includeRinse = false;
  private flossToolStyle: FlossToolStyle = 'flossPick';
  private mouthwashStyle: MouthwashDurationStyle = 'totalCare60s';

  /**
   * Between stages: brushing (or floss) is over and the card waits for "Start Flossing" (or
   * "Start Rinse"), with the clock held. Null while a stage runs.
   */
  private stageWait: StageWait | null = null;
  /** Wall-clock ms the last stage that ran ended: a brush finished from a waiting card is dated from it. */
  private lastStageEndedAtMs = 0;
  /** Wall-clock ms this card's wait began, for the safety finish after BRUSH_ALONG_STAGE_WAIT_SEC. */
  private stageWaitSinceMs = 0;
  private stageWaitTimer: ReturnType<typeof setInterval> | null = null;
  /** When the skip-to-floss button was first tapped (wall clock), while it waits for the second tap. */
  private skipToFlossArmedAtMs: number | null = null;
  private skipToFlossTimer: ReturnType<typeof setTimeout> | null = null;

  /** This brush's id on its note and in the list of paid brushes (native `pacerSessionId`). */
  private sessionId = '';
  /** Wall-clock seconds of the last note written mid-brush (`BrushCheckpoint.isDue`); null until the first. */
  private lastCheckpointWallSec: number | null = null;
  /** Seconds brushed and when brushing ended, kept once brushing is over (time ran out, or "Floss ›"). */
  private brushedSec = 0;
  private brushingEndedAtMs = 0;
  /** Lets go of the `mouthlife-brush` lock this tab holds while its brush is unpaid. */
  private releaseBrushLock: (() => void) | null = null;

  private lastAnnouncedQuadrant = -1;
  private lastAnnouncedSurface = -1;
  private announcedFlossLowerHalf = false;
  private lastAnnouncedMouthwashStep = 0;
  private lastPipKey = '';
  private lastLiveText = '';

  private readonly slosh = new GyroSloshSim();
  private gyro: GyroSloshSnapshot = GYRO_SLOSH_IDLE;
  private motionBound = false;
  private lastMotionMs = 0;
  /** Which way round this browser signs its motion numbers (see deviceMotionSign); set when tilt starts. */
  private motionSign: 1 | -1 = -1;

  private rewardResult: {
    ionsAwarded: number;
    stampAwarded: boolean;
    slotType: 'full' | 'tip' | 'capped';
    fullBrush: boolean;
    withMouthwashBonus: boolean;
    multiplier: number;
  } | null = null;

  private readonly keyHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.exitToHub();
      return;
    }
    const target = e.target instanceof Element ? e.target : null;
    if (
      (e.code === 'Space' || e.key === ' ') &&
      !e.repeat &&
      this.view === 'running' &&
      !target?.closest('button, a, select, input')
    ) {
      e.preventDefault();
      this.togglePause();
    }
  };

  /**
   * Back in view: a waiting card that has been up long enough finishes the brush (wall clock). Going
   * out of view, the brush is noted by main.ts's own page-hide hooks (`checkpointNow`).
   */
  private readonly visibilityHandler = (): void => {
    if (document.visibilityState !== 'hidden') this.checkStageWait();
  };

  private readonly motionHandler = (e: DeviceMotionEvent): void => {
    if (this.view !== 'running' || this.clock.getPacerStage() !== 'mouthwashBonus' || this.clock.isPacerPaused()) {
      return;
    }
    const g = e.accelerationIncludingGravity;
    if (!g || g.x === null || g.y === null) return;
    const now = performance.now();
    const dt = this.lastMotionMs > 0 ? (now - this.lastMotionMs) / 1000 : 1 / 60;
    this.lastMotionMs = now;
    const rot = e.rotationRate;
    const deg2rad = Math.PI / 180;
    const rotMag = rot
      ? Math.hypot((rot.alpha ?? 0) * deg2rad, (rot.beta ?? 0) * deg2rad, (rot.gamma ?? 0) * deg2rad)
      : 0;
    // The web reports motion in m/s², and iPhone and Android browsers sign it opposite ways. The
    // slosh model wants what the native app feeds it: gravity alone, in g, pointing at the ground.
    const sign = this.motionSign;
    const ax = e.acceleration?.x ?? 0;
    const ay = e.acceleration?.y ?? 0;
    this.gyro = this.slosh.step({
      dt,
      gravityX: motionGravityG(sign, g.x, ax),
      gravityY: motionGravityG(sign, g.y, ay),
      rotationRateMag: rotMag,
      userAccelX: motionUserAccelG(sign, ax),
      userAccelY: motionUserAccelG(sign, ay),
      sensorAvailable: true,
      reducedMotion: this.prefersReducedMotion(),
    });
    if (this.gyro.didTriggerSplash) {
      this.callbacks.onPlaySwish?.(this.gyro.splashPan, this.gyro.splashIntensity01);
    }
  };

  constructor(
    private readonly bus: EventBus,
    private readonly clock: ClockController,
    private readonly saveSys: SaveSystem,
    private readonly voice: VoiceCoach,
    private readonly callbacks: BrushAlongCallbacks
  ) {}

  private get lang(): CoachLanguage {
    return this.voice.getLanguage();
  }

  /**
   * The rinse's tilt model as it stands (idle off the rinse, without motion sensors, and frozen
   * while paused): the Brush-Along camera swings toward the cheek the rinse went to, as in the app.
   */
  getGyroSnapshot(): Readonly<GyroSloshSnapshot> {
    return this.gyro;
  }

  /** The game's Reduce Motion (the in-app switch, which follows the system's), as SceneManager sets it (M11). */
  private prefersReducedMotion(): boolean {
    if (document.documentElement.classList.contains('reduced-motion')) return true;
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Whether the day the brush will be paid on still has a full reward left, so Done / Skip may show
   * their Ion amounts (L01). That is today, or `day`: from a card between stages the brush is paid
   * on the day its last stage ended, which may be yesterday.
   */
  private fullRewardLeftToday(day = new Date()): boolean {
    const slot = this.saveSys.getSave().dailySlotsByDate[formatLocalDateKey(day)];
    return (slot?.fullRewards ?? 0) < DAILY_FULL_REWARD_CAP;
  }

  private $<T extends Element = HTMLElement>(sel: string): T | null {
    return this.container?.querySelector<T>(sel) ?? null;
  }

  // ------------------------------------------------------------- lifecycle

  mount(root: HTMLElement): void {
    this.view = 'running';
    this.renderedStage = null;
    this.completedFloss = false;
    this.fullBrush = false;
    this.includeRinse = readIncludeRinse();
    this.rewardResult = null;
    this.stopStageWait();
    this.disarmSkipToFloss();
    this.lastStageEndedAtMs = 0;
    this.stageWaitSinceMs = 0;
    // A new brush. This tab holds the brush lock until the brush is paid or left, so another tab
    // never pays its note meanwhile. An older note is not cleared here (the native app can, having
    // one process): it may be another tab's brush still running, or one waiting to be paid at the
    // next start, and this brush's own first note replaces it once 20 s are brushed.
    this.sessionId = newBrushSessionId();
    this.lastCheckpointWallSec = null;
    this.brushedSec = 0;
    this.brushingEndedAtMs = 0;
    this.letGoOfBrushLock();
    this.releaseBrushLock = holdBrushLock();
    this.lastAnnouncedQuadrant = -1;
    this.lastAnnouncedSurface = -1;
    this.announcedFlossLowerHalf = false;
    this.lastAnnouncedMouthwashStep = 0;
    this.lastPipKey = '';
    this.lastLiveText = '';

    const storedFloss = readPref(FLOSS_STYLE_KEY);
    this.flossToolStyle = storedFloss === 'stringFloss' ? 'stringFloss' : 'flossPick';
    const storedRinse = readPref(MOUTHWASH_STYLE_KEY);
    this.mouthwashStyle = storedRinse === 'quick30s' ? 'quick30s' : 'totalCare60s';

    this.container = document.createElement('div');
    this.container.className = 'hub-shell brush-along-shell';
    root.appendChild(this.container);

    this.clock.setPacerMouthwashDurationSec(mouthwashDurationSec(this.mouthwashStyle));
    this.clock.startPacer();
    this.callbacks.onActiveQuadrantChanged(0);

    this.disposers.add(this.bus.on('audio:changed', () => this.syncMuteUi()));
    this.disposers.add(
      this.bus.on('pacer:paused', ({ paused }) => {
        this.callbacks.onPauseChanged?.(paused);
        if (paused) this.voice.pause();
        else this.voice.resume();
        // Paused, then the tab closed: the note has the seconds up to the pause.
        if (paused) this.checkpointNow();
        this.syncPauseUi();
      })
    );
    this.disposers.add(this.bus.on('pacer:tick', ({ elapsedSec, stage }) => this.onTick(elapsedSec, stage)));
    window.addEventListener('keydown', this.keyHandler);
    if (typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    this.render();
    this.lastAnnouncedQuadrant = 0;
    this.lastAnnouncedSurface = 0;
    this.callbacks.onPlayCue('quadrant');
    this.voice.speak(BrushCoachCopy.spokenQuadrantNumber(0, this.lang));
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
    if (typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    this.stopStageWait();
    this.disarmSkipToFloss();
    this.unbindMotion();
    this.letGoOfBrushLock();
    this.voice.stop();
    this.clock.stopPacer();
    this.callbacks.onPauseChanged?.(false);
    this.callbacks.onActiveQuadrantChanged(-1);
    this.disposers.disposeAll();
    this.container?.remove();
    this.container = null;
  }

  private exitToHub(): void {
    // Once the 2 minutes of brushing are done, leaving keeps the brush: from a card between stages,
    // or during floss or the rinse, it is saved with what was finished (floss only if it ran to its
    // end or was marked done, never the rinse; from a card, dated from when the last stage that ran
    // ended), then the hub opens as it does from the summary. Leaving while brushing, once
    // BrushCheckpoint.minBrushedSec (20 s) were brushed, keeps a "good try" with the kind words the
    // early "Floss ›" earns (the owner's decision, 28 November; native `returnToHub`). Under that,
    // leaving saves nothing.
    if (this.view === 'running') {
      const brushingDone = this.brushingIsOver();
      const brushedSec = this.clock.getPacerElapsedSec();
      const stoppedBrushing = !brushingDone && BrushCheckpoint.isWorthKeeping(brushedSec);
      // judged by the same grace rule as the early "Floss ›"
      if (stoppedBrushing) this.fullBrush = brushedSec >= BRUSH_ALONG_TOTAL_SEC - BRUSH_ALONG_FULL_BRUSH_GRACE_SEC;
      if (brushingDone || stoppedBrushing) {
        this.completeSession(this.completedFloss, false, true);
        this.voice.stop();
        this.callbacks.onExitToHub(this.hubNoteForSavedBrush());
        return;
      }
      // Nothing worth keeping, and this brush leaves no note behind (native `returnToHub`); a note
      // that belongs to another tab's brush stays.
      clearPendingBrush(this.sessionId);
      this.letGoOfBrushLock();
    }
    this.stopStageWait();
    this.voice.stop();
    this.clock.stopPacer();
    this.callbacks.onPauseChanged?.(false);
    this.callbacks.onActiveQuadrantChanged(-1);
    this.callbacks.onExitToHub();
  }

  /** Android Back button: pauses a running brush rather than ending it; exits from summary. */
  handleBackPress(): boolean {
    if (this.view === 'summary') {
      this.voice.stop();
      this.callbacks.onExitToHub();
      return true;
    }
    if (this.stageWait !== null) {
      // Hold on the Start Flossing / Start Rinse card rather than leaving mid-ritual.
      return true;
    }
    this.togglePause();
    return true;
  }

  private togglePause(): void {
    // Nothing to pause between stages: the clock is already holding for the tap.
    if (this.stageWait !== null) return;
    this.clock.setPacerPaused(!this.clock.isPacerPaused());
  }

  private bindMotion(): void {
    // Tilt is an extra, and stays off under Reduce Motion, as on native (M11).
    if (this.motionBound || typeof window.DeviceMotionEvent === 'undefined' || this.prefersReducedMotion()) return;
    this.motionBound = true;
    this.lastMotionMs = 0;
    // Settle once which way round this browser reports tilt, so left is left on iPhone and Android.
    this.motionSign = deviceMotionSign(navigator.vendor);
    window.addEventListener('devicemotion', this.motionHandler);
  }

  private unbindMotion(): void {
    if (!this.motionBound) return;
    this.motionBound = false;
    window.removeEventListener('devicemotion', this.motionHandler);
    this.gyro = GYRO_SLOSH_IDLE;
  }

  // ------------------------------------------------------------- timeline

  private currentPhase(): BrushPhaseState {
    return evaluateBrushPhase(
      this.clock.getPacerElapsedSec(),
      this.clock.getPacerStage(),
      this.clock.getPacerMouthwashDurationSec()
    );
  }

  private onTick(elapsedSec: number, stage: PacerStage): void {
    if (this.view !== 'running' || this.stageWait !== null) return;
    if (this.renderedStage !== stage) this.renderRunning();
    const mwDur = this.clock.getPacerMouthwashDurationSec();
    const phase = evaluateBrushPhase(elapsedSec, stage, mwDur);
    const flossEnd = BRUSH_ALONG_TOTAL_SEC + BRUSH_ALONG_FLOSS_BONUS_SEC;

    if (phase.countdownPip !== null) {
      const pipKey = `${stage}-${phase.phaseIndex12}-${phase.countdownPip}`;
      if (pipKey !== this.lastPipKey) {
        this.lastPipKey = pipKey;
        const isUpper =
          stage === 'mouthwashBonus' ? true : stage === 'flossBonus' ? phase.flossIsUpper : isUpperQuadrant(phase.quadrant);
        this.callbacks.onPlayPip?.(phase.countdownPip, isUpper);
      }
    }

    if (stage === 'brushing') {
      if (elapsedSec >= BRUSH_ALONG_TOTAL_SEC - 0.04) {
        // Brushing is done. Floss waits for a tap: time to put the brush down and pick up the floss.
        this.holdAfterStage('floss');
        return;
      }
      this.checkpointBrushing();
      const nearEnd = elapsedSec >= BRUSH_ALONG_TOTAL_SEC - 0.2;
      if (phase.quadrant !== this.lastAnnouncedQuadrant && !nearEnd) {
        this.lastAnnouncedQuadrant = phase.quadrant;
        this.lastAnnouncedSurface = phase.surface;
        this.callbacks.onActiveQuadrantChanged(phase.quadrant);
        this.callbacks.onPlayCue('quadrant');
        this.voice.speak(BrushCoachCopy.spokenQuadrantNumber(phase.quadrant, this.lang));
      } else if (phase.surface !== this.lastAnnouncedSurface && !nearEnd) {
        this.lastAnnouncedSurface = phase.surface;
        // Surface changes are a chime only: the voice just counts quadrants.
        this.callbacks.onPlayCue('surface');
      }
    } else if (stage === 'flossBonus') {
      const flossElapsed = elapsedSec - BRUSH_ALONG_TOTAL_SEC;
      if (!this.announcedFlossLowerHalf && flossElapsed >= BRUSH_ALONG_FLOSS_BONUS_SEC * 0.5) {
        this.announcedFlossLowerHalf = true;
        this.callbacks.onPlayCue('quadrant');
      }
      this.callbacks.onActiveQuadrantChanged(phase.quadrant);
      if (elapsedSec >= flossEnd - 0.05) {
        // Floss is done. The fluoride rinse waits for a tap, or the brush finishes when a grown-up
        // left the rinse out. Asked again now: a grown-up may have turned rinse off in another tab
        // meanwhile (M06).
        this.includeRinse = readIncludeRinse();
        if (this.includeRinse) {
          this.completedFloss = true;
          this.holdAfterStage('rinse');
        } else {
          this.completeSession(true, false);
        }
        return;
      }
    } else {
      const cap = flossEnd + mwDur;
      if (
        phase.mouthwashStepIndex !== this.lastAnnouncedMouthwashStep &&
        phase.mouthwashStepIndex > 0 &&
        elapsedSec < cap - 0.25
      ) {
        this.lastAnnouncedMouthwashStep = phase.mouthwashStepIndex;
        this.callbacks.onPlayCue('surface');
      }
      if (elapsedSec >= cap - 0.05) {
        this.completeSession(this.completedFloss, true);
        return;
      }
    }

    this.updateLive(phase);
  }

  // ------------------------------------------------------------- between stages

  /**
   * Brushing or floss has run its time (or floss was skipped with the rinse still to come): the
   * clock holds at the stage's end and a card waits for the tap that starts the next stage. `chime`:
   * one short earcon when the time ran out, since nobody may be looking; nothing is spoken.
   */
  private holdAfterStage(next: StageWait, chime = true): void {
    if (this.clock.getPacerStage() === 'brushing') {
      this.fullBrush = this.clock.getPacerElapsedSec() >= BRUSH_ALONG_TOTAL_SEC - BRUSH_ALONG_FULL_BRUSH_GRACE_SEC;
    }
    // When the stage really ended: now, or earlier if the page was hidden past its end (H04). The
    // time past it is dropped by the hold, so the next stage always starts at its own 0:00.
    this.lastStageEndedAtMs = Date.now() - this.clock.getPacerOverflowSec() * 1000;
    if (this.clock.getPacerStage() === 'brushing') this.latchBrushingEnd();
    // Kept on the device from the first Start card until the brush is paid (the screen may sleep on
    // a card, and the system may end the app meanwhile); written before the card's own wait is
    // checked, so a brush finished at once is paid from the same facts.
    this.storePendingBrush();
    // Floss skipped while paused: the hold ends the pause (a card has nothing to resume), so the
    // music comes back up and speech left paused is let go.
    const wasPaused = this.clock.isPacerPaused();
    this.disarmSkipToFloss();
    this.clock.holdPacerForNextStage();
    this.callbacks.onPauseChanged?.(false);
    if (wasPaused) this.voice.stop();
    this.showStageWait(next, this.lastStageEndedAtMs, chime);
  }

  /** Puts up the waiting card for `next`, whose wait counts from `sinceMs` (wall clock). */
  private showStageWait(next: StageWait, sinceMs: number, chime: boolean): void {
    this.stageWait = next;
    this.stageWaitSinceMs = sinceMs;
    this.lastPipKey = '';
    this.callbacks.onActiveQuadrantChanged(-1);
    // Back from a phone locked past the end of the wait too: finish now, with what was done.
    if (this.checkStageWait()) return;
    if (chime) this.callbacks.onPlayCue('quadrant');
    if (this.stageWaitTimer === null) this.stageWaitTimer = setInterval(() => this.checkStageWait(), 1000);
    this.render();
    // The card's one job: its Start button takes the focus (only here, not on a language redraw).
    this.$<HTMLButtonElement>(next === 'floss' ? '#btn-pacer-start-floss' : '#btn-pacer-start-rinse')?.focus({
      preventScroll: true,
    });
  }

  /** Leaves the waiting card (a stage starts, or the brush finishes or is left). */
  private stopStageWait(): void {
    this.stageWait = null;
    if (this.stageWaitTimer !== null) {
      clearInterval(this.stageWaitTimer);
      this.stageWaitTimer = null;
    }
  }

  /**
   * The safety finish: a waiting card up for BRUSH_ALONG_STAGE_WAIT_SEC (wall clock, so time with the
   * page hidden counts) finishes the brush with what was done; the stage never started earns
   * nothing. Checked every second, when the page comes back into view, and as the card goes up.
   */
  private checkStageWait(nowMs = Date.now()): boolean {
    if (this.stageWait === null || this.view !== 'running') return false;
    if (nowMs - this.stageWaitSinceMs < BRUSH_ALONG_STAGE_WAIT_SEC * 1000) return false;
    this.completeSession(this.completedFloss, false);
    return true;
  }

  /** "Start Flossing": floss from 0:00, with the same chime and spoken word as always. */
  private startFloss(): void {
    if (this.stageWait !== 'floss') return;
    this.stopStageWait();
    this.enterFlossBonus();
  }

  /** "Start Rinse": the fluoride rinse from 0:00. */
  private startRinse(): void {
    if (this.stageWait !== 'rinse') return;
    this.stopStageWait();
    this.enterMouthwashBonus(this.completedFloss);
  }

  /**
   * Skip on a waiting card. On the floss card: on to the rinse card when the rinse step is on (asked
   * again now, M06), otherwise finish with the brush alone. On the rinse card: finish, with the
   * floss counted if it was done.
   */
  private skipStageWait(): void {
    if (this.stageWait === 'floss') {
      this.includeRinse = readIncludeRinse();
      if (this.includeRinse) {
        this.storePendingBrush();
        this.showStageWait('rinse', Date.now(), false);
        return;
      }
    }
    if (this.stageWait !== null) this.completeSession(this.completedFloss, false);
  }

  /**
   * The small "Floss ›" button on the brushing card: the first tap arms it ("Tap again", for 3 s),
   * the second skips straight into floss, which starts now at 0:00 (the tap is the start, so no
   * waiting card). Brushing stopped early is a good try, not the full 2 minutes.
   */
  private tapSkipToFloss(): void {
    if (this.view !== 'running' || this.stageWait !== null || this.clock.isPacerPaused()) return;
    if (this.clock.getPacerStage() !== 'brushing') return;
    const nowMs = Date.now();
    if (this.skipToFlossArmedAtMs === null || nowMs - this.skipToFlossArmedAtMs > SKIP_TO_FLOSS_ARM_MS) {
      this.disarmSkipToFloss();
      this.skipToFlossArmedAtMs = nowMs;
      this.skipToFlossTimer = setTimeout(() => this.disarmSkipToFloss(), SKIP_TO_FLOSS_ARM_MS);
      this.syncSkipToFlossUi();
      return;
    }
    this.disarmSkipToFloss();
    this.fullBrush = this.clock.getPacerElapsedSec() >= BRUSH_ALONG_TOTAL_SEC - BRUSH_ALONG_FULL_BRUSH_GRACE_SEC;
    // Brushing ends here, as any stage does (now, less any time it ran on behind a hidden page).
    this.lastStageEndedAtMs = nowMs - this.clock.getPacerOverflowSec() * 1000;
    // Read before floss starts (which moves the clock on to 2:00). Kept like a Start card's brush,
    // whatever the seconds: an early Floss is the player's own choice (native `skipToFlossNow`).
    this.latchBrushingEnd();
    this.storePendingBrush();
    this.enterFlossBonus();
  }

  /** Back to "Floss ›": the 3 s ran out, the brush paused, or brushing is over. */
  private disarmSkipToFloss(): void {
    if (this.skipToFlossTimer !== null) {
      clearTimeout(this.skipToFlossTimer);
      this.skipToFlossTimer = null;
    }
    if (this.skipToFlossArmedAtMs === null) return;
    this.skipToFlossArmedAtMs = null;
    this.syncSkipToFlossUi();
  }

  /** The button's words (and its name for screen readers), and hidden while paused. */
  private syncSkipToFlossUi(): void {
    const button = this.$<HTMLButtonElement>('#btn-pacer-skip-to-floss');
    if (!button) return;
    const words = BrushCoachCopy.skipToFlossLabels(this.lang);
    const armed = this.skipToFlossArmedAtMs !== null;
    this.setText('#btn-pacer-skip-to-floss', armed ? words.tapAgain : `${words.floss} ›`);
    button.setAttribute('aria-label', armed ? words.tapAgain : words.floss);
    button.classList.toggle('armed', armed);
    button.hidden = this.clock.isPacerPaused();
  }

  private enterFlossBonus(): void {
    this.disarmSkipToFloss();
    this.announcedFlossLowerHalf = false;
    this.lastPipKey = '';
    this.clock.enterFlossBonus();
    this.callbacks.onPauseChanged?.(false);
    this.callbacks.onPlayCue('quadrant');
    this.voice.speak(BrushCoachCopy.spokenStageWord('floss', this.lang));
    this.render();
  }

  private enterMouthwashBonus(completedFloss: boolean): void {
    this.stopStageWait();
    this.completedFloss = completedFloss;
    this.lastAnnouncedMouthwashStep = 0;
    this.lastPipKey = '';
    this.slosh.resetMouthwashSession();
    this.gyro = GYRO_SLOSH_IDLE;
    this.clock.setPacerMouthwashDurationSec(mouthwashDurationSec(this.mouthwashStyle));
    this.clock.enterMouthwashBonus();
    this.callbacks.onPauseChanged?.(false);
    this.callbacks.onActiveQuadrantChanged(-1);
    this.callbacks.onPlayCue('quadrant');
    this.voice.speak(BrushCoachCopy.spokenStageWord('rinse', this.lang));
    this.bindMotion();
    this.render();
  }

  /**
   * Saves the brush and shows the summary. `exiting`: Exit to Hub with a brush worth keeping (see
   * `exitToHub`); the hub opens straight away, so the summary is not drawn and "Done" (which
   * leaving would cut off) is not spoken.
   */
  private completeSession(withFlossBonus: boolean, withMouthwashBonus: boolean, exiting = false): void {
    // Paid once: a Done or Skip let go as the timer ends the brush does not pay it again.
    if (this.view !== 'running') return;
    const nowMs = Date.now();
    // When the last stage that ran really ended. Normally just now, but the session clock keeps
    // going behind a hidden page or a locked phone (H04), so a brush left overnight ended hours ago;
    // and one finished from a waiting card (Skip, or the safety finish) ended when that stage did,
    // not at the tap. Read before stopPacer(), which forgets the step this is measured from.
    const endedAtMs =
      this.stageWait !== null ? this.lastStageEndedAtMs : nowMs - this.clock.getPacerOverflowSec() * 1000;
    this.stopStageWait();
    this.unbindMotion();
    this.clock.stopPacer();
    this.callbacks.onPauseChanged?.(false);
    this.callbacks.onActiveQuadrantChanged(-1);

    const rewardOptions = {
      withFlossBonus,
      withMouthwashBonus,
      fullBrush: this.fullBrush,
      rinseStepOff: !this.includeRinse,
    };
    // The one way a brush is paid (as a note left from an earlier visit is): on the day it really
    // ended, so a brush found finished the next morning does not use up one of today's two full
    // rewards; then its note is cleared and 'pacer:complete' goes out.
    const outcome = settleBrush(
      this.saveSys,
      this.bus,
      { sessionId: this.sessionId, ...rewardOptions, stageEndedAtMs: endedAtMs },
      nowMs
    );
    this.letGoOfBrushLock();
    this.rewardResult = outcome
      ? {
          ...outcome,
          withMouthwashBonus,
          multiplier: brushAlongMultiplier(withFlossBonus, brushAlongRinseCredit(rewardOptions)),
        }
      : null;

    // Saved all the same, but silent from a hidden page (the safety finish can run in a background
    // tab): no chime or "Done" from nowhere.
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (!hidden) this.callbacks.onPlayCue('complete');
    if (!hidden && !exiting) this.voice.speak(BrushCoachCopy.spokenStageWord('done', this.lang));
    this.view = 'summary';
    if (!exiting) this.render();
  }

  // ------------------------------------------------------------- the note of an unpaid brush

  /** Brushing is over (time ran out, or "Floss ›"): a Start card, floss or the rinse. */
  private brushingIsOver(): boolean {
    return this.stageWait !== null || this.clock.getPacerStage() !== 'brushing';
  }

  /** How long brushing lasted and when it ended, as brushing ends (before the clock moves on). */
  private latchBrushingEnd(): void {
    this.brushedSec = Math.min(this.clock.getPacerElapsedSec(), BRUSH_ALONG_TOTAL_SEC);
    this.brushingEndedAtMs = this.lastStageEndedAtMs;
  }

  /**
   * Notes this brush on the device now: on Pause, and from main.ts when the page is hidden or closed
   * or the Android app goes to the background, so a brush the page never finishes is paid at the
   * next start (`recoverPendingBrush`). Mid-brush only after BrushCheckpoint.minBrushedSec.
   */
  checkpointNow(): void {
    if (this.view !== 'running') return;
    if (this.brushingIsOver()) this.storePendingBrush();
    else this.checkpointBrushing(true);
  }

  /**
   * A brush still inside its 2 minutes, noted every BrushCheckpoint.intervalSec on the wall clock
   * once worth keeping; `force` writes at once. Its brushing counts as ending now, as a "good try",
   * or full when within the grace of the 2 minutes (native `checkpointBrushing`). Only the note is
   * written: the brush's own end stays open, so the stage's end replaces it.
   */
  private checkpointBrushing(force = false): void {
    if (this.view !== 'running' || this.brushingIsOver()) return;
    const brushedSec = Math.min(this.clock.getPacerElapsedSec(), BRUSH_ALONG_TOTAL_SEC);
    if (!BrushCheckpoint.isWorthKeeping(brushedSec)) return;
    const nowMs = Date.now();
    if (!force && !BrushCheckpoint.isDue(this.lastCheckpointWallSec, nowMs / 1000)) return;
    this.lastCheckpointWallSec = nowMs / 1000;
    writePendingBrush({
      sessionId: this.sessionId,
      brushedSec,
      brushingEndedAtMs: nowMs,
      stageEndedAtMs: nowMs,
      fullBrush: BrushCheckpoint.countsAsFull(brushedSec),
      flossDone: false,
      rinseStepOff: !this.includeRinse,
    });
  }

  /** The brush with its brushing done, as it would be paid now (native `storePendingBrush`). */
  private storePendingBrush(): void {
    writePendingBrush({
      sessionId: this.sessionId,
      brushedSec: this.brushedSec,
      brushingEndedAtMs: this.brushingEndedAtMs,
      stageEndedAtMs: this.lastStageEndedAtMs,
      fullBrush: this.fullBrush,
      flossDone: this.completedFloss,
      rinseStepOff: !this.includeRinse,
    });
  }

  /** The brush was paid or left: another tab's next start may pay a note again. */
  private letGoOfBrushLock(): void {
    this.releaseBrushLock?.();
    this.releaseBrushLock = null;
  }

  /**
   * The hub's banner after Exit to Hub saved the brush, as the native app words its toast. Leaving
   * saves once brushing is over (its 2 minutes, or skipped ahead to floss: a good try) or after
   * 20 s of brushing (a good try), and never counts the rinse.
   */
  private hubNoteForSavedBrush(): string | undefined {
    const r = this.rewardResult;
    if (!r) return undefined;
    if (!r.fullBrush) {
      return r.ionsAwarded > 0
        ? `🌱 Good try! +${r.ionsAwarded} F⁻ • Brush the whole 2 minutes to earn a Habit Stamp.`
        : '🌱 Good try! Brush the whole 2 minutes to earn a Habit Stamp.';
    }
    return `🦷 Fresh Mint Smooth Bask! +${r.ionsAwarded} F⁻${r.stampAwarded ? ' & +1 Habit Stamp!' : ''}`;
  }

  /** Re-speak the cue for wherever the timeline is now (after a language or voice change). */
  private speakCurrentCue(): void {
    // Between stages there is nothing to say: the card waits for a tap.
    if (this.view !== 'running' || this.clock.isPacerPaused() || this.stageWait !== null) return;
    const stage = this.clock.getPacerStage();
    if (stage === 'mouthwashBonus') {
      this.voice.speak(BrushCoachCopy.spokenStageWord('rinse', this.lang));
    } else if (stage === 'flossBonus') {
      this.voice.speak(BrushCoachCopy.spokenStageWord('floss', this.lang));
    } else {
      const phase = this.currentPhase();
      this.voice.speak(BrushCoachCopy.spokenQuadrantNumber(phase.quadrant, this.lang));
    }
  }

  // ------------------------------------------------------------- live DOM

  private formatClock(remSec: number): string {
    const s = Math.max(0, Math.ceil(remSec));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  private setText(sel: string, text: string): void {
    const el = this.$(sel);
    if (el && el.textContent !== text) el.textContent = text;
  }

  private updateLive(phase: BrushPhaseState): void {
    if (!this.container || this.view !== 'running') return;
    const paused = this.clock.isPacerPaused();
    const waiting = this.stageWait !== null;
    const elapsed = this.clock.getPacerElapsedSec();
    this.setText('#pacer-clock', this.formatClock(this.clock.getPacerStageEndSec() - elapsed));

    // 3-2-1 dots replace the sub-phase bar in the last three seconds. Neither shows between stages.
    const pips = this.$('#pacer-pips');
    const subbar = this.$('#pacer-subbar');
    const showPips = !paused && !waiting && phase.countdownPip !== null;
    if (pips) pips.hidden = !showPips;
    if (subbar) subbar.hidden = paused || waiting || showPips;
    if (showPips && pips) {
      pips.querySelectorAll<HTMLElement>('[data-pip]').forEach((dot) => {
        const step = Number(dot.dataset.pip);
        dot.classList.toggle('lit', step >= (phase.countdownPip ?? 0));
        dot.classList.toggle('now', step === phase.countdownPip);
      });
      this.setText('#pacer-pip-num', `${phase.countdownPip}…`);
    }
    const bar = this.$('#pacer-progress-bar');
    if (bar) {
      const fill = Math.min(1, Math.max(0, phase.phaseElapsedSec / Math.max(0.5, phase.phaseDurationSec)));
      bar.style.width = `${(fill * 100).toFixed(1)}%`;
    }

    this.updateCompass(phase);

    let liveText: string;
    if (this.stageWait !== null) {
      const start = BrushCoachCopy.stageStartLabels(this.lang);
      const ready = this.stageWait === 'floss' ? start.readyFloss : start.readyRinse;
      this.setText('#pacer-title', ready);
      liveText = ready;
    } else if (phase.stage === 'mouthwashBonus') {
      const hl = BrushCoachCopy.mouthwashHeadline(phase.mouthwashStepIndex, this.lang);
      this.setText('#pacer-title', hl.archTitle);
      this.setText('#pacer-action', hl.actionBadge);
      this.setText('#pacer-rule', hl.ruleTag);
      this.$('#pacer-rule')?.classList.toggle('final', phase.mouthwashStepIndex === 2);
      this.updateLevelBar(elapsed);
      liveText = `${hl.archTitle}. ${hl.actionBadge}. ${hl.ruleTag}`;
    } else if (phase.stage === 'flossBonus') {
      const hl = BrushCoachCopy.flossHeadline(phase.flossIsUpper, this.flossToolStyle, phase.flossStepIndex, this.lang);
      this.setText('#pacer-title', hl.archTitle);
      this.setText('#pacer-action', hl.actionBadge);
      // Announce the arch only: the per-gap steps change too fast to read out.
      liveText = hl.archTitle;
    } else {
      const badge = BrushCoachCopy.surfaceActionBadge(phase.surface, this.lang);
      const title = BrushCoachCopy.quadrantLabel(phase.quadrant, this.lang);
      // The step number is the one word the voice says for this quadrant.
      this.setText('#pacer-title', `${phase.quadrant + 1} · ${title}`);
      this.setText('#pacer-rule', badge.angleTag);
      this.setText('#pacer-action', badge.headline);
      this.setText('#pacer-action-icon', SURFACE_ICONS[phase.surface]);
      const action = this.$('#pacer-action');
      if (action) action.style.color = SURFACE_COLORS[phase.surface];
      liveText = `${title}. ${badge.headline}. ${badge.angleTag}`;
    }
    if (liveText !== this.lastLiveText) {
      this.lastLiveText = liveText;
      // The voice only says a number or one word, so screen readers always get the full line.
      this.setText('#pacer-live', liveText);
    }
  }

  private updateCompass(phase: BrushPhaseState): void {
    const svg = this.$<SVGSVGElement>('#pacer-compass-svg');
    if (!svg) return;
    const rinse = phase.stage === 'mouthwashBonus';
    const floss = phase.stage === 'flossBonus';
    const tiltLeft = rinse && this.gyro.isHandheld && this.gyro.sloshPosition < -0.18;
    const tiltRight = rinse && this.gyro.isHandheld && this.gyro.sloshPosition > 0.18;
    const patientRight = isPatientRightQuadrant(phase.quadrant);
    this.$('#pacer-side-left')?.classList.toggle('lit', rinse ? tiltLeft : !patientRight);
    this.$('#pacer-side-right')?.classList.toggle('lit', rinse ? tiltRight : patientRight);

    for (let q = 0; q < 4; q++) {
      const g = svg.querySelector<SVGGElement>(`[data-q="${q}"]`);
      if (!g) continue;
      const completed = (phase.completedQuadrantsMask & (1 << q)) !== 0;
      const active = rinse ? true : floss ? phase.flossIsUpper === isUpperQuadrant(q) : phase.quadrant === q;
      const preEcho = phase.stage === 'brushing' && phase.upcomingQuadrantIndex === q && phase.preEcho01 > 0.02;
      const state = rinse ? 'rinse' : active ? 'active' : completed ? 'done' : preEcho ? 'pre' : 'idle';
      if (g.dataset.state !== state) g.dataset.state = state;

      const core = g.querySelector<SVGPathElement>('.core');
      const rim = g.querySelector<SVGPathElement>('.rim');
      if (!core || !rim) continue;
      let rimScale = 0;
      let rimDash = '';
      if (rinse) {
        const boost = this.gyro.isHandheld
          ? Math.min(1, Math.max(0, isPatientRightQuadrant(q) ? this.gyro.sloshPosition : -this.gyro.sloshPosition))
          : 0.35;
        core.style.stroke = boost > 0.45 ? 'var(--gold)' : '#d9b3ff';
        g.style.setProperty('--halo-opacity', (0.32 + 0.52 * boost).toFixed(2));
        rimScale = 1.18;
        rimDash = phase.mouthwashStepIndex === 1 ? '3 2.5' : '';
        rim.style.opacity = (0.3 + 0.64 * Math.max(phase.mouthwashProgress01, boost * 0.85)).toFixed(2);
      } else if (active) {
        core.style.stroke = floss ? 'var(--gold)' : SURFACE_COLORS[phase.surface];
        g.style.removeProperty('--halo-opacity');
        if (!floss && phase.surface !== BrushSurface.chewingGrooves) {
          // Outer surface = rim outside the arch, inner surface = dashed rim inside it.
          rimScale = phase.surface === BrushSurface.outerCheek ? 1.18 : 0.78;
          rimDash = phase.surface === BrushSurface.innerTongue ? '3 2.5' : '';
          rim.style.opacity = '0.92';
        }
      } else {
        core.style.stroke = '';
        g.style.removeProperty('--halo-opacity');
        core.style.opacity = preEcho ? (0.3 + 0.55 * phase.preEcho01).toFixed(2) : '';
      }
      if (active || rinse) core.style.opacity = '';
      const rimKey = `${rimScale}`;
      if (rim.dataset.scale !== rimKey) {
        rim.dataset.scale = rimKey;
        rim.setAttribute('d', rimScale > 0 ? quadrantArcPath(q, rimScale) : '');
      }
      rim.style.display = rimScale > 0 ? '' : 'none';
      rim.style.strokeDasharray = rimDash;
    }
  }

  private updateLevelBar(elapsedSec: number): void {
    const bubble = this.$('#pacer-level-bubble');
    if (!bubble) return;
    // Resting on the counter: gentle automatic swish. In the hand: follow the real tilt. Under the
    // game's Reduce Motion (the in-app switch too, not just the system's) it rests in the middle (M11).
    const reduced = this.prefersReducedMotion();
    const handheld = this.gyro.isHandheld && !reduced;
    const display = reduced
      ? 0
      : handheld
        ? Math.max(-1, Math.min(1, this.gyro.sloshPosition))
        : Math.sin(elapsedSec * 3.2) * 0.68;
    bubble.style.setProperty('--slosh', display.toFixed(3));
    const bar = this.$('#pacer-level');
    bar?.classList.toggle('handheld', handheld);
    const sides: Array<[string, number, boolean]> = [
      ['#pacer-cheek-left', this.gyro.leftCheekCharge01, display < -0.22],
      ['#pacer-cheek-right', this.gyro.rightCheekCharge01, display > 0.22],
    ];
    for (const [sel, charge, lit] of sides) {
      const pill = this.$(sel);
      pill?.classList.toggle('lit', lit);
      pill?.classList.toggle('full', charge >= 0.95);
    }
    this.setText('#pacer-level-status', BrushCoachCopy.gyroSwishStatusLabel(handheld, this.lang));
    const count = this.$('#pacer-swish-count');
    if (count) {
      count.hidden = this.gyro.swishCount <= 0;
      this.setText('#pacer-swish-count', `×${this.gyro.swishCount}`);
    }
  }

  private syncMuteUi(): void {
    const b = this.$<HTMLButtonElement>('#btn-pacer-mute');
    if (!b) return;
    const muted = this.callbacks.isMuted?.() ?? false;
    b.textContent = muted ? '🔇' : '🔊';
    b.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }

  private syncVoiceUi(): void {
    const b = this.$<HTMLButtonElement>('#btn-pacer-voice');
    if (!b) return;
    const on = this.voice.isEnabled() && this.voice.isSupported();
    b.textContent = on ? '🗣️' : '🤐';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-label', on ? 'Voice Coach On' : 'Voice Coach Off');
    b.classList.toggle('is-off', !on);
  }

  private syncPauseUi(): void {
    const paused = this.clock.isPacerPaused();
    const button = this.$<HTMLButtonElement>('#btn-pacer-pause');
    if (button) {
      button.textContent = paused ? '▶' : '⏸';
      button.setAttribute('aria-pressed', String(paused));
      button.setAttribute('aria-label', paused ? 'Resume pacer (Space)' : 'Pause pacer (Space)');
    }
    const resume = this.$('#btn-pacer-resume');
    if (resume) resume.hidden = !paused;
    // Pausing lets go of a half-made skip to floss; the button hides until Resume.
    if (paused) this.disarmSkipToFloss();
    this.syncSkipToFlossUi();
    this.$('#pacer-card')?.classList.toggle('paused', paused);
    if (this.view === 'running') this.updateLive(this.currentPhase());
  }

  // ------------------------------------------------------------- render

  private buildMuteBtnHtml(): string {
    const muted = this.callbacks.isMuted?.() ?? false;
    return `<button type="button" id="btn-pacer-mute" class="btn btn-sm btn-icon" aria-label="Toggle Sound (M)" aria-pressed="${muted ? 'true' : 'false'}" title="Mute / Unmute (M)">${muted ? '🔇' : '🔊'}</button>`;
  }

  private bindMuteBtn(): void {
    this.$('#btn-pacer-mute')?.addEventListener('click', () => {
      this.callbacks.onToggleMute?.();
      this.syncMuteUi();
    });
  }

  private render(): void {
    if (!this.container) return;
    if (this.view === 'summary') {
      this.renderSummary();
      return;
    }
    this.renderRunning();
  }

  private compassHtml(): string {
    const arcs = [0, 1, 2, 3]
      .map((q) => {
        const d = quadrantArcPath(q);
        return `<g data-q="${q}" data-state="idle"><path class="halo" d="${d}"/><path class="core" d="${d}"/><path class="rim" d=""/></g>`;
      })
      .join('');
    return `
      <div class="pacer-compass" role="img" aria-label="Mirror Mouth Compass">
        <span id="pacer-side-left" class="pacer-side"></span>
        <svg id="pacer-compass-svg" viewBox="0 0 78 74" width="78" height="74" aria-hidden="true">
          <path class="face" d="M35 35L39 31L43 35"/>
          <path class="face" d="M34 40Q39 43.5 44 40"/>
          ${arcs}
        </svg>
        <span id="pacer-side-right" class="pacer-side"></span>
      </div>`;
  }

  /** Pick | String: on the floss stage, and on the card before it. */
  private flossToolChipsHtml(): string {
    return `
          <span class="pacer-chips" role="group" aria-label="Floss tool">
            <button type="button" class="pacer-chip" data-floss="flossPick" aria-pressed="${this.flossToolStyle === 'flossPick'}">Pick</button>
            <button type="button" class="pacer-chip" data-floss="stringFloss" aria-pressed="${this.flossToolStyle === 'stringFloss'}">String</button>
          </span>`;
  }

  /** 60s | 30s: on the rinse stage, and on the card before it. */
  private rinseLengthChipsHtml(): string {
    return `
          <span class="pacer-chips" role="group" aria-label="Rinse duration">
            <button type="button" class="pacer-chip" data-rinse="totalCare60s" aria-pressed="${this.mouthwashStyle === 'totalCare60s'}">60s</button>
            <button type="button" class="pacer-chip" data-rinse="quick30s" aria-pressed="${this.mouthwashStyle === 'quick30s'}">30s</button>
          </span>`;
  }

  private bannerHtml(stage: PacerStage): string {
    const buttons = BrushCoachCopy.actionButtonLabels(this.lang, !this.includeRinse);
    // The Ion amounts on Done / Skip are for the full 2-minute brush; after an early tap, or once
    // today's two full rewards are collected, they are left off (L01).
    const rewardDay =
      this.stageWait !== null ? brushRewardDay(new Date(this.lastStageEndedAtMs), new Date()) : new Date();
    const showAmounts = this.fullBrush && this.fullRewardLeftToday(rewardDay);
    const amount = (label: string): string => (showAmounts ? label : BrushCoachCopy.withoutIonAmount(label));
    if (this.stageWait !== null) {
      // Between stages: the headline, the button that starts the next stage, and that stage's own Skip.
      const start = BrushCoachCopy.stageStartLabels(this.lang);
      const floss = this.stageWait === 'floss';
      const skip = floss
        ? buttons.skipFloss
        : BrushCoachCopy.mouthwashButtonLabels(this.completedFloss, this.lang).skipRinse;
      return `
        <div class="pacer-row">
          <strong id="pacer-title" class="pacer-title"></strong>
          ${floss ? this.flossToolChipsHtml() : this.rinseLengthChipsHtml()}
        </div>
        <div class="pacer-actions">
          <button type="button" id="${floss ? 'btn-pacer-start-floss' : 'btn-pacer-start-rinse'}" class="btn btn-primary"></button>
          <button type="button" id="btn-pacer-skip-wait" class="btn"></button>
        </div>
        ${floss && !readIncludeRinse() ? '<p id="pacer-rinse-hint" class="pacer-hint">A grown-up can turn on the rinse in Settings.</p>' : ''}
        <template id="tpl-labels" data-start="${encodeURIComponent(floss ? start.startFloss : start.startRinse)}" data-skip="${encodeURIComponent(amount(skip))}"></template>`;
    }
    if (stage === 'mouthwashBonus') {
      const mw = BrushCoachCopy.mouthwashButtonLabels(this.completedFloss, this.lang);
      return `
        <div class="pacer-row">
          <strong id="pacer-title" class="pacer-title"></strong>
          ${this.rinseLengthChipsHtml()}
        </div>
        <div class="pacer-row">
          <span class="pacer-action-wrap"><span aria-hidden="true">💧</span> <span id="pacer-action" class="pacer-action"></span></span>
          <span id="pacer-rule" class="pacer-tag"></span>
        </div>
        <div id="pacer-level" class="pacer-level" aria-hidden="true">
          <div class="pacer-level-row">
            <span id="pacer-cheek-left" class="pacer-cheek"></span>
            <div class="pacer-level-track"><i></i><i></i><span id="pacer-level-bubble" class="pacer-level-bubble"></span></div>
            <span id="pacer-cheek-right" class="pacer-cheek"></span>
          </div>
          <div class="pacer-level-row pacer-level-foot">
            <span id="pacer-level-status"></span>
            <span id="pacer-swish-count" class="pacer-swish-count" hidden></span>
          </div>
        </div>
        <div class="pacer-actions">
          <button type="button" id="btn-pacer-done-rinse" class="btn btn-primary"></button>
          <button type="button" id="btn-pacer-skip-rinse" class="btn"></button>
        </div>
        <template id="tpl-labels" data-done="${encodeURIComponent(amount(mw.doneRinse))}" data-skip="${encodeURIComponent(amount(mw.skipRinse))}"></template>`;
    }
    if (stage === 'flossBonus') {
      const mw = BrushCoachCopy.mouthwashButtonLabels(true, this.lang);
      return `
        <div class="pacer-row">
          <strong id="pacer-title" class="pacer-title"></strong>
          ${this.flossToolChipsHtml()}
        </div>
        <div class="pacer-row">
          <span class="pacer-action-wrap"><span aria-hidden="true">✨</span> <span id="pacer-action" class="pacer-action"></span></span>
        </div>
        <div class="pacer-actions">
          ${this.includeRinse ? '<button type="button" id="btn-pacer-to-rinse" class="btn btn-primary"></button>' : ''}
          <button type="button" id="btn-pacer-done-floss" class="btn${this.includeRinse ? '' : ' btn-primary'}"></button>
          <button type="button" id="btn-pacer-skip-floss" class="btn"></button>
        </div>
        <template id="tpl-labels" data-rinse="${encodeURIComponent(mw.rinseJump)}" data-done="${encodeURIComponent(amount(buttons.doneFloss))}" data-skip="${encodeURIComponent(amount(buttons.skipFloss))}"></template>`;
    }
    // Floss waits for the whole 2 minutes, then for "Start Flossing". The one way ahead is the small
    // two-tap "Floss ›" button, which a stray touch cannot set off.
    return `
      <div class="pacer-row">
        <strong id="pacer-title" class="pacer-title"></strong>
        <span id="pacer-rule" class="pacer-tag"></span>
      </div>
      <div class="pacer-row">
        <span class="pacer-action-wrap"><span id="pacer-action-icon" aria-hidden="true"></span> <span id="pacer-action" class="pacer-action"></span></span>
        <button type="button" id="btn-pacer-skip-to-floss" class="pacer-chip pacer-skip-floss"></button>
      </div>`;
  }

  private renderRunning(): void {
    if (!this.container) return;
    const stage = this.clock.getPacerStage();
    this.renderedStage = stage;
    const waiting = this.stageWait !== null;
    const sides = BrushCoachCopy.mirrorSideLabels(this.lang);
    const langOptions = COACH_LANGUAGES.map((code) => {
      const info = COACH_LANGUAGE_INFO[code];
      // No flag emoji: Windows has no flag glyphs and shows them as bare letters ("us English").
      return `<option value="${code}"${code === this.lang ? ' selected' : ''}>${info.nativeName}</option>`;
    }).join('');

    this.container.innerHTML = `
      <div class="hub-top-bar glass-card ui-interactive row-between pacer-utility-bar">
        <button type="button" id="btn-pacer-exit" class="btn btn-sm btn-home" aria-label="Exit to Hub">${HOME_ICON_SVG}<span>Hub</span></button>
        <div class="row-wrap" style="flex-wrap:nowrap;flex-shrink:0;">
          <button type="button" id="btn-pacer-voice" class="btn btn-sm btn-icon" title="Voice coach on / off"></button>
          <select id="sel-pacer-lang" class="pacer-lang-select" aria-label="Coach language">${langOptions}</select>
          ${this.buildMuteBtnHtml()}
          ${waiting ? '' : '<button type="button" id="btn-pacer-pause" class="btn btn-sm btn-icon" title="Pause / Resume (Space)"></button>'}
        </div>
      </div>

      <div class="hub-center-callout"></div>

      <div id="pacer-card" class="cosmic-card glass-card ui-interactive pacer-card" data-stage="${stage}"${waiting ? ` data-wait="${this.stageWait}"` : ''}>
        <div class="pacer-head">
          ${this.compassHtml()}
          <div class="pacer-clock-col">
            <div id="pacer-clock" role="timer" title="Tap timer to Pause or Resume"></div>
            <div id="pacer-pips" class="pacer-pips" hidden aria-hidden="true">
              <i data-pip="3"></i><i data-pip="2"></i><i data-pip="1"></i><b id="pacer-pip-num"></b>
            </div>
            <div id="pacer-subbar" class="clean-progress-outer pacer-subbar" aria-hidden="true">
              <div id="pacer-progress-bar" class="clean-progress-inner" style="width:0%;"></div>
            </div>
            <button type="button" id="btn-pacer-resume" class="btn btn-sm pacer-resume" hidden>▶ TAP TO RESUME</button>
          </div>
        </div>
        <div class="pacer-banner">${this.bannerHtml(stage)}</div>
        <div id="pacer-live" class="sr-only" role="status" aria-live="polite"></div>
      </div>
    `;

    // Between stages the clock is not a pause button.
    if (waiting) this.$('#pacer-clock')?.removeAttribute('title');
    this.setText('#pacer-side-left', sides.left);
    this.setText('#pacer-side-right', sides.right);
    this.setText('#pacer-cheek-left', sides.left);
    this.setText('#pacer-cheek-right', sides.right);

    // Button labels come from the copy table; set as text so punctuation never becomes markup.
    const labels = this.$<HTMLTemplateElement>('#tpl-labels')?.dataset ?? {};
    const label = (key: string): string => decodeURIComponent(labels[key] ?? '');
    this.setText('#btn-pacer-to-rinse', `💧 ${label('rinse')}`);
    this.setText('#btn-pacer-done-floss', label('done'));
    this.setText('#btn-pacer-skip-floss', label('skip'));
    this.setText('#btn-pacer-done-rinse', `✔ ${label('done')}`);
    this.setText('#btn-pacer-skip-rinse', label('skip'));
    this.setText('#btn-pacer-start-floss', label('start'));
    this.setText('#btn-pacer-start-rinse', label('start'));
    this.setText('#btn-pacer-skip-wait', label('skip'));

    this.bindMuteBtn();
    this.$('#btn-pacer-exit')?.addEventListener('click', () => this.exitToHub());
    this.$('#btn-pacer-pause')?.addEventListener('click', () => this.togglePause());
    this.$('#btn-pacer-resume')?.addEventListener('click', () => this.togglePause());
    this.$('#pacer-clock')?.addEventListener('click', () => this.togglePause());

    this.$('#btn-pacer-voice')?.addEventListener('click', () => {
      this.voice.setEnabled(!this.voice.isEnabled());
      this.syncVoiceUi();
      this.lastLiveText = '';
      if (this.voice.isEnabled()) this.speakCurrentCue();
    });
    this.$<HTMLSelectElement>('#sel-pacer-lang')?.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
      if (!isCoachLanguage(value) || value === this.lang) return;
      this.voice.setLanguage(value);
      this.lastLiveText = '';
      this.render();
      this.speakCurrentCue();
    });

    this.$('#btn-pacer-to-rinse')?.addEventListener('click', () => this.enterMouthwashBonus(true));
    this.$('#btn-pacer-done-floss')?.addEventListener('click', () => this.completeSession(true, false));
    this.$('#btn-pacer-skip-floss')?.addEventListener('click', () => {
      // With the rinse step on, the rinse still waits for its own tap ("Start Rinse"). Asked again
      // now: a grown-up may have turned rinse off in another tab meanwhile (M06).
      this.includeRinse = readIncludeRinse();
      if (this.includeRinse) {
        this.completedFloss = false;
        this.holdAfterStage('rinse', false);
      } else {
        this.completeSession(false, false);
      }
    });
    this.$('#btn-pacer-skip-to-floss')?.addEventListener('click', () => this.tapSkipToFloss());
    this.$('#btn-pacer-start-floss')?.addEventListener('click', () => this.startFloss());
    this.$('#btn-pacer-start-rinse')?.addEventListener('click', () => this.startRinse());
    this.$('#btn-pacer-skip-wait')?.addEventListener('click', () => this.skipStageWait());
    this.$('#btn-pacer-done-rinse')?.addEventListener('click', () => this.completeSession(this.completedFloss, true));
    this.$('#btn-pacer-skip-rinse')?.addEventListener('click', () => this.completeSession(this.completedFloss, false));

    this.container.querySelectorAll<HTMLButtonElement>('[data-floss]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const style: FlossToolStyle = chip.dataset.floss === 'stringFloss' ? 'stringFloss' : 'flossPick';
        if (style === this.flossToolStyle) return;
        this.flossToolStyle = style;
        writePref(FLOSS_STYLE_KEY, style);
        this.render();
      });
    });
    this.container.querySelectorAll<HTMLButtonElement>('[data-rinse]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const style: MouthwashDurationStyle = chip.dataset.rinse === 'quick30s' ? 'quick30s' : 'totalCare60s';
        if (style === this.mouthwashStyle) return;
        this.mouthwashStyle = style;
        writePref(MOUTHWASH_STYLE_KEY, style);
        this.clock.setPacerMouthwashDurationSec(mouthwashDurationSec(style));
        this.render();
      });
    });

    this.syncVoiceUi();
    this.syncPauseUi();
    this.updateLive(this.currentPhase());
  }

  private renderSummary(): void {
    if (!this.container) return;
    this.renderedStage = null;
    const r = this.rewardResult;
    const rinse = r?.withMouthwashBonus ?? false;
    // Tapped ahead before the 2 minutes were up: a kind "good try" and a small tip, never a scolding.
    const goodTry = r !== null && !r.fullBrush;
    const banner = goodTry
      ? '🌱 GOOD TRY!'
      : rinse
        ? '💜 FLUORIDE RINSE SEAL COMPLETE!'
        : '🦷 100% MIRROR-SMOOTH BASK RESTORED!';
    // The bonus badge is a number joined to a label. The page translator knows the label but not
    // the joined line, so the label is put into the player's language here, before the two are joined.
    this.container.innerHTML = `
      <div class="hub-top-bar glass-card ui-interactive row-between">
        <strong style="color:#5eead4;">${banner}</strong>
        ${this.buildMuteBtnHtml()}
      </div>
      <div></div>
      <div class="cosmic-card glass-card ui-interactive" style="text-align:center;">
        <h2 style="margin:0 0 6px 0;font-size:1.18rem;">${goodTry ? 'Every brush helps!' : 'Fresh, Smooth, Fluoride-Strong Teeth!'}</h2>
        ${
          goodTry
            ? '<p style="margin:0 0 8px 0;font-size:0.9rem;font-weight:700;color:#fde68a;">Brush the whole 2 minutes to earn a Habit Stamp.</p>'
            : ''
        }
        <p style="margin:0 0 10px 0;font-size:0.82rem;color:#cbd5e1;">
          ${
            rinse
              ? 'Spit out completely. No water, food or drink for 30 minutes so the fluoride stays on your teeth.'
              : 'Spit out the extra foam, and don’t rinse with water right away — that keeps the fluoride on your teeth.'
          }
        </p>
        <div class="row-wrap" style="justify-content:center;margin-bottom:12px;">
          ${goodTry && (r?.ionsAwarded ?? 0) === 0 ? '' : `<span class="pill-badge">✦ +${r?.ionsAwarded ?? 0} Fluoride Ions</span>`}
          ${r?.slotType === 'full' && (r?.multiplier ?? 1) > 1 ? `<span class="pill-badge">×${r.multiplier} ${uiTranslator.t(r.multiplier >= 2 ? (rinse ? 'Floss + Rinse' : 'Floss Bonus') : 'Bonus Step')}</span>` : ''}
          ${r?.stampAwarded ? '<span class="pill-badge">🦷 +1 Permanent Habit Stamp</span>' : ''}
          ${r?.slotType === 'full' ? '<span class="pill-badge">📡 +1 Supply Beacon</span><span class="pill-badge">⚡ +1 Overdrive Run</span>' : ''}
          ${r?.slotType === 'capped' && !goodTry ? '<span class="pill-badge">Daily rewards already collected</span>' : ''}
        </div>
        <button type="button" id="btn-done-pacer" class="btn btn-home" style="width:100%;justify-content:center;" aria-label="Exit to Hub">
          ${HOME_ICON_SVG}<span>Bask in Smooth Teeth (Return to Hub) ✦</span>
        </button>

        <div id="pacer-charity-cta" class="charity-cta-strip" style="text-align:left;">
          <span class="charity-cta-copy">
            💛 <strong>Enjoying MouthLife?</strong> Support 501(c)(3) charitable dental care with <strong>${SMILE_ON_U_CHARITY.name}</strong>.
          </span>
          <div class="row-wrap">
            <a
              id="lnk-pacer-donate"
              class="btn btn-sm btn-charity-pill"
              href="${SMILE_ON_U_CHARITY.donateUrl}"
              target="_blank"
              rel="noopener noreferrer"
            >💛 Donate ↗</a>
            <a
              id="lnk-pacer-site"
              class="btn btn-sm"
              href="${SMILE_ON_U_CHARITY.websiteUrl}"
              target="_blank"
              rel="noopener noreferrer"
            >SmileOnU.org ↗</a>
          </div>
        </div>
      </div>
    `;

    this.bindMuteBtn();
    this.$('#btn-done-pacer')?.addEventListener('click', () => {
      this.voice.stop();
      this.callbacks.onExitToHub();
    });
    this.$<HTMLButtonElement>('#btn-done-pacer')?.focus();
  }
}
