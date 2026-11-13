import {
  BrushCoachCopy,
  BrushSurface,
  COACH_LANGUAGES,
  COACH_LANGUAGE_INFO,
  GYRO_SLOSH_IDLE,
  GyroSloshSim,
  evaluateBrushPhase,
  isCoachLanguage,
  isPatientRightQuadrant,
  isUpperQuadrant,
  mouthwashDurationSec,
  type BrushPhaseState,
  type CoachLanguage,
  type FlossToolStyle,
  type GyroSloshSnapshot,
  type MouthwashDurationStyle,
  type PacerStage,
} from '../config/brushCoach';
import { SMILE_ON_U_CHARITY } from '../config/charityInfo';
import { BRUSH_ALONG_FLOSS_BONUS_SEC, BRUSH_ALONG_TOTAL_SEC } from '../config/gameConfig';
import type { VoiceCoach } from '../engine/audio/VoiceCoach';
import type { ClockController } from '../engine/ClockController';
import { DisposerBag, type EventBus } from '../engine/EventBus';
import { HabitBank, brushAlongMultiplier } from '../engine/persistence/HabitBank';
import type { SaveSystem } from '../engine/persistence/SaveSystem';
import type { OverlayView } from '../engine/types';

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

export interface BrushAlongCallbacks {
  /** Active quadrant for the 3D arch highlight; -1 when none. */
  onActiveQuadrantChanged: (quadrantIdx: number) => void;
  onPlayCue: (kind: 'surface' | 'quadrant' | 'complete') => void;
  /** 3-2-1 anticipation tick before each switch. */
  onPlayPip?: (secondsLeft: number, isUpper: boolean) => void;
  /** Rinse sloshed across the mouth (tilt-driven, phones only). */
  onPlaySwish?: (pan: number, intensity01: number) => void;
  onExitToHub: () => void;
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
  private flossToolStyle: FlossToolStyle = 'flossPick';
  private mouthwashStyle: MouthwashDurationStyle = 'totalCare60s';

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

  private rewardResult: {
    ionsAwarded: number;
    stampAwarded: boolean;
    slotType: 'full' | 'tip' | 'capped';
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
    // The web reports the reaction to gravity in m/s²; the slosh model wants gravity in g.
    this.gyro = this.slosh.step({
      dt,
      gravityX: -(g.x ?? 0) / 9.81,
      gravityY: -(g.y ?? 0) / 9.81,
      rotationRateMag: rotMag,
      userAccelX: (e.acceleration?.x ?? 0) / 9.81,
      userAccelY: (e.acceleration?.y ?? 0) / 9.81,
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

  private prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private $<T extends Element = HTMLElement>(sel: string): T | null {
    return this.container?.querySelector<T>(sel) ?? null;
  }

  // ------------------------------------------------------------- lifecycle

  mount(root: HTMLElement): void {
    this.view = 'running';
    this.renderedStage = null;
    this.completedFloss = false;
    this.rewardResult = null;
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
        this.syncPauseUi();
      })
    );
    this.disposers.add(this.bus.on('pacer:tick', ({ elapsedSec, stage }) => this.onTick(elapsedSec, stage)));
    window.addEventListener('keydown', this.keyHandler);

    this.render();
    this.lastAnnouncedQuadrant = 0;
    this.lastAnnouncedSurface = 0;
    this.callbacks.onPlayCue('quadrant');
    this.voice.speak(BrushCoachCopy.spokenBrushCue(0, BrushSurface.outerCheek, this.lang));
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
    this.unbindMotion();
    this.voice.stop();
    this.clock.stopPacer();
    this.callbacks.onPauseChanged?.(false);
    this.callbacks.onActiveQuadrantChanged(-1);
    this.disposers.disposeAll();
    this.container?.remove();
    this.container = null;
  }

  private exitToHub(): void {
    this.voice.stop();
    this.clock.stopPacer();
    this.callbacks.onPauseChanged?.(false);
    this.callbacks.onActiveQuadrantChanged(-1);
    this.callbacks.onExitToHub();
  }

  private togglePause(): void {
    this.clock.setPacerPaused(!this.clock.isPacerPaused());
  }

  private bindMotion(): void {
    if (this.motionBound || typeof window.DeviceMotionEvent === 'undefined') return;
    this.motionBound = true;
    this.lastMotionMs = 0;
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
    if (this.view !== 'running') return;
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
        // Roll hands-free into the floss stage.
        this.enterFlossBonus();
        return;
      }
      const nearEnd = elapsedSec >= BRUSH_ALONG_TOTAL_SEC - 0.2;
      if (phase.quadrant !== this.lastAnnouncedQuadrant && !nearEnd) {
        this.lastAnnouncedQuadrant = phase.quadrant;
        this.lastAnnouncedSurface = phase.surface;
        this.callbacks.onActiveQuadrantChanged(phase.quadrant);
        this.callbacks.onPlayCue('quadrant');
        this.voice.speak(BrushCoachCopy.spokenBrushCue(phase.quadrant, phase.surface, this.lang));
      } else if (phase.surface !== this.lastAnnouncedSurface && !nearEnd) {
        this.lastAnnouncedSurface = phase.surface;
        this.callbacks.onPlayCue('surface');
        this.voice.speak(BrushCoachCopy.spokenBrushCue(phase.quadrant, phase.surface, this.lang));
      }
    } else if (stage === 'flossBonus') {
      const flossElapsed = elapsedSec - BRUSH_ALONG_TOTAL_SEC;
      if (!this.announcedFlossLowerHalf && flossElapsed >= BRUSH_ALONG_FLOSS_BONUS_SEC * 0.5) {
        this.announcedFlossLowerHalf = true;
        this.callbacks.onPlayCue('quadrant');
        this.voice.speak(BrushCoachCopy.spokenFlossLowerCue(this.lang));
      }
      this.callbacks.onActiveQuadrantChanged(phase.quadrant);
      if (elapsedSec >= flossEnd - 0.05) {
        // Roll hands-free into the fluoride rinse stage.
        this.enterMouthwashBonus(true);
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
        this.voice.speak(BrushCoachCopy.spokenMouthwashStepCue(phase.mouthwashStepIndex, this.lang));
      }
      if (elapsedSec >= cap - 0.05) {
        this.completeSession(this.completedFloss, true);
        return;
      }
    }

    this.updateLive(phase);
  }

  private enterFlossBonus(): void {
    this.announcedFlossLowerHalf = false;
    this.lastPipKey = '';
    this.clock.enterFlossBonus();
    this.callbacks.onPauseChanged?.(false);
    this.callbacks.onPlayCue('quadrant');
    this.voice.speak(BrushCoachCopy.spokenFlossStartCue(this.flossToolStyle, this.lang));
    this.render();
  }

  private enterMouthwashBonus(completedFloss: boolean): void {
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
    this.voice.speak(
      BrushCoachCopy.spokenMouthwashStartCue(Math.round(mouthwashDurationSec(this.mouthwashStyle)), this.lang)
    );
    this.bindMotion();
    this.render();
  }

  private completeSession(withFlossBonus: boolean, withMouthwashBonus: boolean): void {
    this.unbindMotion();
    this.clock.stopPacer();
    this.callbacks.onPauseChanged?.(false);
    this.callbacks.onActiveQuadrantChanged(-1);

    const save = this.saveSys.getSave();
    const outcome = HabitBank.completeBrushAlong(save, { withFlossBonus, withMouthwashBonus });
    this.saveSys.save(save);
    this.rewardResult = { ...outcome, withMouthwashBonus, multiplier: brushAlongMultiplier(withFlossBonus, withMouthwashBonus) };
    this.bus.emit('pacer:complete', {
      withFlossBonus,
      withMouthwashBonus,
      ionsAwarded: outcome.ionsAwarded,
      stampAwarded: outcome.stampAwarded,
    });

    this.callbacks.onPlayCue('complete');
    this.voice.speak(BrushCoachCopy.spokenSessionCompleteCue(withMouthwashBonus, this.lang));
    this.view = 'summary';
    this.render();
  }

  /** Re-speak the cue for wherever the timeline is now (after a language or voice change). */
  private speakCurrentCue(): void {
    if (this.view !== 'running' || this.clock.isPacerPaused()) return;
    const phase = this.currentPhase();
    if (phase.stage === 'mouthwashBonus') {
      this.voice.speak(
        phase.mouthwashStepIndex === 0
          ? BrushCoachCopy.spokenMouthwashStartCue(Math.round(this.clock.getPacerMouthwashDurationSec()), this.lang)
          : BrushCoachCopy.spokenMouthwashStepCue(phase.mouthwashStepIndex, this.lang)
      );
    } else if (phase.stage === 'flossBonus') {
      this.voice.speak(
        phase.flossIsUpper
          ? BrushCoachCopy.spokenFlossStartCue(this.flossToolStyle, this.lang)
          : BrushCoachCopy.spokenFlossLowerCue(this.lang)
      );
    } else {
      this.voice.speak(BrushCoachCopy.spokenBrushCue(phase.quadrant, phase.surface, this.lang));
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
    const elapsed = this.clock.getPacerElapsedSec();
    this.setText('#pacer-clock', this.formatClock(this.clock.getPacerStageEndSec() - elapsed));

    // 3-2-1 dots replace the sub-phase bar in the last three seconds.
    const pips = this.$('#pacer-pips');
    const subbar = this.$('#pacer-subbar');
    const showPips = !paused && phase.countdownPip !== null;
    if (pips) pips.hidden = !showPips;
    if (subbar) subbar.hidden = paused || showPips;
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
    if (phase.stage === 'mouthwashBonus') {
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
      this.setText('#pacer-title', title);
      this.setText('#pacer-rule', badge.angleTag);
      this.setText('#pacer-action', badge.headline);
      this.setText('#pacer-action-icon', SURFACE_ICONS[phase.surface]);
      const action = this.$('#pacer-action');
      if (action) action.style.color = SURFACE_COLORS[phase.surface];
      liveText = `${title}. ${badge.headline}. ${badge.angleTag}`;
    }
    if (liveText !== this.lastLiveText) {
      this.lastLiveText = liveText;
      // With the voice coach speaking, a screen reader repeating the same line would talk over it.
      this.setText('#pacer-live', this.voice.isEnabled() && this.voice.isSupported() ? '' : liveText);
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
    const handheld = this.gyro.isHandheld;
    // Resting on the counter: gentle automatic swish. In the hand: follow the real tilt.
    const display = handheld
      ? Math.max(-1, Math.min(1, this.gyro.sloshPosition))
      : this.prefersReducedMotion()
        ? 0
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

  private bannerHtml(stage: PacerStage): string {
    const buttons = BrushCoachCopy.actionButtonLabels(this.lang);
    if (stage === 'mouthwashBonus') {
      const mw = BrushCoachCopy.mouthwashButtonLabels(this.completedFloss, this.lang);
      return `
        <div class="pacer-row">
          <strong id="pacer-title" class="pacer-title"></strong>
          <span class="pacer-chips" role="group" aria-label="Rinse duration">
            <button type="button" class="pacer-chip" data-rinse="totalCare60s" aria-pressed="${this.mouthwashStyle === 'totalCare60s'}">60s</button>
            <button type="button" class="pacer-chip" data-rinse="quick30s" aria-pressed="${this.mouthwashStyle === 'quick30s'}">30s</button>
          </span>
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
        <template id="tpl-labels" data-done="${encodeURIComponent(mw.doneRinse)}" data-skip="${encodeURIComponent(mw.skipRinse)}"></template>`;
    }
    if (stage === 'flossBonus') {
      const mw = BrushCoachCopy.mouthwashButtonLabels(true, this.lang);
      return `
        <div class="pacer-row">
          <strong id="pacer-title" class="pacer-title"></strong>
          <span class="pacer-chips" role="group" aria-label="Floss tool">
            <button type="button" class="pacer-chip" data-floss="flossPick" aria-pressed="${this.flossToolStyle === 'flossPick'}">Pick</button>
            <button type="button" class="pacer-chip" data-floss="stringFloss" aria-pressed="${this.flossToolStyle === 'stringFloss'}">String</button>
          </span>
        </div>
        <div class="pacer-row">
          <span class="pacer-action-wrap"><span aria-hidden="true">✨</span> <span id="pacer-action" class="pacer-action"></span></span>
        </div>
        <div class="pacer-actions">
          <button type="button" id="btn-pacer-to-rinse" class="btn btn-primary"></button>
          <button type="button" id="btn-pacer-done-floss" class="btn"></button>
          <button type="button" id="btn-pacer-skip-floss" class="btn"></button>
        </div>
        <template id="tpl-labels" data-rinse="${encodeURIComponent(mw.rinseJump)}" data-done="${encodeURIComponent(buttons.doneFloss)}" data-skip="${encodeURIComponent(buttons.skipFloss)}"></template>`;
    }
    return `
      <div class="pacer-row">
        <strong id="pacer-title" class="pacer-title"></strong>
        <span id="pacer-rule" class="pacer-tag"></span>
      </div>
      <div class="pacer-row">
        <span class="pacer-action-wrap"><span id="pacer-action-icon" aria-hidden="true"></span> <span id="pacer-action" class="pacer-action"></span></span>
        <button type="button" id="btn-pacer-to-floss" class="btn btn-sm"></button>
      </div>
      <template id="tpl-labels" data-floss="${encodeURIComponent(buttons.flossJump)}"></template>`;
  }

  private renderRunning(): void {
    if (!this.container) return;
    const stage = this.clock.getPacerStage();
    this.renderedStage = stage;
    const sides = BrushCoachCopy.mirrorSideLabels(this.lang);
    const langOptions = COACH_LANGUAGES.map((code) => {
      const info = COACH_LANGUAGE_INFO[code];
      // No flag emoji: Windows has no flag glyphs and shows them as bare letters ("us English").
      return `<option value="${code}"${code === this.lang ? ' selected' : ''}>${info.nativeName}</option>`;
    }).join('');

    this.container.innerHTML = `
      <div class="hub-top-bar glass-card ui-interactive row-between pacer-utility-bar">
        <button type="button" id="btn-pacer-exit" class="btn btn-sm">← Hub</button>
        <div class="row-wrap" style="flex-wrap:nowrap;flex-shrink:0;">
          <button type="button" id="btn-pacer-voice" class="btn btn-sm btn-icon" title="Voice coach on / off"></button>
          <select id="sel-pacer-lang" class="pacer-lang-select" aria-label="Coach language">${langOptions}</select>
          ${this.buildMuteBtnHtml()}
          <button type="button" id="btn-pacer-pause" class="btn btn-sm btn-icon" title="Pause / Resume (Space)"></button>
        </div>
      </div>

      <div class="hub-center-callout"></div>

      <div id="pacer-card" class="cosmic-card glass-card ui-interactive pacer-card" data-stage="${stage}">
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

    this.setText('#pacer-side-left', sides.left);
    this.setText('#pacer-side-right', sides.right);
    this.setText('#pacer-cheek-left', sides.left);
    this.setText('#pacer-cheek-right', sides.right);

    // Button labels come from the copy table; set as text so punctuation never becomes markup.
    const labels = this.$<HTMLTemplateElement>('#tpl-labels')?.dataset ?? {};
    const label = (key: string): string => decodeURIComponent(labels[key] ?? '');
    this.setText('#btn-pacer-to-floss', `✨ ${label('floss')}`);
    this.setText('#btn-pacer-to-rinse', `💧 ${label('rinse')}`);
    this.setText('#btn-pacer-done-floss', label('done'));
    this.setText('#btn-pacer-skip-floss', label('skip'));
    this.setText('#btn-pacer-done-rinse', `✔ ${label('done')}`);
    this.setText('#btn-pacer-skip-rinse', label('skip'));

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

    this.$('#btn-pacer-to-floss')?.addEventListener('click', () => this.enterFlossBonus());
    this.$('#btn-pacer-to-rinse')?.addEventListener('click', () => this.enterMouthwashBonus(true));
    this.$('#btn-pacer-done-floss')?.addEventListener('click', () => this.completeSession(true, false));
    this.$('#btn-pacer-skip-floss')?.addEventListener('click', () => this.enterMouthwashBonus(false));
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
    this.container.innerHTML = `
      <div class="hub-top-bar glass-card ui-interactive row-between">
        <strong style="color:#5eead4;">${rinse ? '💜 FLUORIDE RINSE SEAL COMPLETE!' : '🦷 100% MIRROR-SMOOTH BASK RESTORED!'}</strong>
        ${this.buildMuteBtnHtml()}
      </div>
      <div></div>
      <div class="cosmic-card glass-card ui-interactive" style="text-align:center;">
        <h2 style="margin:0 0 6px 0;font-size:1.18rem;">Fresh, Smooth, Fluoride-Strong Teeth!</h2>
        <p style="margin:0 0 10px 0;font-size:0.82rem;color:#cbd5e1;">
          ${
            rinse
              ? 'Spit out completely. No water, food or drink for 30 minutes so the fluoride stays on your teeth.'
              : 'Spit out the extra foam, and don’t rinse with water right away — that keeps the fluoride on your teeth.'
          }
        </p>
        <div class="row-wrap" style="justify-content:center;margin-bottom:12px;">
          <span class="pill-badge">✦ +${r?.ionsAwarded ?? 0} Fluoride Ions</span>
          ${r?.slotType === 'full' && (r?.multiplier ?? 1) > 1 ? `<span class="pill-badge">×${r.multiplier} ${r.multiplier >= 2 ? 'Floss + Rinse' : 'Bonus Step'}</span>` : ''}
          ${r?.stampAwarded ? '<span class="pill-badge">🦷 +1 Permanent Habit Stamp</span>' : ''}
          ${r?.slotType === 'full' ? '<span class="pill-badge">📡 +1 Supply Beacon</span><span class="pill-badge">⚡ +1 Overdrive Run</span>' : ''}
          ${r?.slotType === 'capped' ? '<span class="pill-badge">Daily rewards already collected</span>' : ''}
        </div>
        <button type="button" id="btn-done-pacer" class="btn btn-primary" style="width:100%;">
          Bask in Smooth Teeth (Return to Hub) ✦
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
