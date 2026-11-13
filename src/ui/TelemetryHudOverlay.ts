import { getWorldDentalLesson } from '../config/dentalChart';
import { GUM_TENDER_THRESHOLD, SURGE_MAX } from '../config/gameConfig';
import { findNearestZipMouth, sampleTerrainHeight } from '../engine/physics/CollisionSystem';
import { DisposerBag, type EventBus } from '../engine/EventBus';
import type { InputManager } from '../engine/InputManager';
import type { SaveSystem } from '../engine/persistence/SaveSystem';
import type { SceneManager } from '../engine/render/SceneManager';
import type { WorldSession } from '../engine/sim/WorldSession';
import type { OverlayView, QualityTier, Vec2 } from '../engine/types';
import {
  bindBottomSheetSwipeClose,
  buildTimerPill,
  clampToScreen,
  compactToastText,
  formatZipPromptText,
  isCompactViewport,
  isEditableEventTarget,
  computeObjectiveBreadcrumb,
  placeWorldCallout,
  shouldHintFlossMiss,
  shouldShowVirtualThumbPad,
  loadSeenHints,
  saveSeenHints,
  selectWayfinderTargets,
  shouldShowDiveIntroToast,
  findWayfinderLabelY,
  type ScreenBox,
  type WayfinderKind,
} from './hudHelpers';

const FOCUSABLE_SEL =
  'button:not([disabled]), summary, input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface HudAudioControls {
  isMuted: () => boolean;
  toggleMute: () => void;
  getMusicVolume: () => number;
  setMusicVolume: (v: number) => void;
  getSfxVolume: () => number;
  setSfxVolume: (v: number) => void;
  setPaused: (p: boolean) => void;
  isReducedMotion: () => boolean;
  toggleReducedMotion: () => void;
  restartDive: () => void;
}

const MAX_WAYFINDERS = 6;
const WAYFINDER_ICON: Record<WayfinderKind, string> = { site: '📍 Colony', crystal: '💎 Crystal', dome: '🛡️ Dome' };

type CalloutTone = 'mint' | 'gold' | 'rose' | 'violet' | 'cyan';

interface WorldCallout {
  el: HTMLElement;
  wx: number;
  wy: number;
  wz: number;
  age: number;
  life: number;
  active: boolean;
}

const MAX_CALLOUTS = 10;
export const ZIP_PROMPT_TEXT = 'Press E / Right-Click / Tap Floss to Zip!';

export class TelemetryHudOverlay implements OverlayView {
  private disposers = new DisposerBag();
  private container: HTMLElement | null = null;

  // Cached DOM refs for zero-GC 10Hz HUD updates
  private cleanOuterEl: HTMLElement | null = null;
  private cleanBarEl: HTMLElement | null = null;
  private cleanTextEl: HTMLElement | null = null;
  private phBadgeEl: HTMLElement | null = null;
  private sitesBadgeEl: HTMLElement | null = null;
  private scoreBadgeEl: HTMLElement | null = null;
  private districtRowEl: HTMLElement | null = null;
  private scanBtnEl: HTMLButtonElement | null = null;
  private scanDeskBtnEl: HTMLButtonElement | null = null;
  private surgeBtnEl: HTMLButtonElement | null = null;
  private surgeDeskBtnEl: HTMLButtonElement | null = null;
  private toastEl: HTMLElement | null = null;
  private qualityBtnEl: HTMLButtonElement | null = null;

  private toastTimerSec = 0;
  private hudAccumSec = 0;

  // Floating 3D→2D world callouts & contextual Zip prompt
  private calloutLayer: HTMLElement | null = null;
  private callouts: WorldCallout[] = [];
  private zipPromptEl: HTMLElement | null = null;
  private zipScreenBox = { cx: 0, cy: 0, halfW: 0, halfH: 0, active: false };
  private frameOccupiedBoxes: ScreenBox[] = [];
  private steerHaloEl: HTMLElement | null = null;
  private flossRingEl: HTMLElement | null = null;
  private flossDeskBtnEl: HTMLElement | null = null;
  private thumbDeckEl: HTMLElement | null = null;
  private mechanicBadgeEl: HTMLElement | null = null;
  private steerBtnEl: HTMLButtonElement | null = null;
  private lastSynergy = 1;
  private acidCalloutCooldown = 0;
  private gumCalloutCooldown = 0;
  private epsCalloutCooldown = 0;
  private mutansCalloutCooldown = 0;
  private mutansPopCalloutCooldown = 0;
  private onboardingElapsed = 0;

  // Pause / audio / timer / wayfinders / hints
  private paused = false;
  private pauseSheetEl: HTMLElement | null = null;
  private pauseBtnEl: HTMLButtonElement | null = null;
  private muteBtnEl: HTMLButtonElement | null = null;
  private lastFocusedBeforePause: HTMLElement | null = null;
  private timerEl: HTMLElement | null = null;
  private wayfinders: Array<{ el: HTMLElement; kind: WayfinderKind }> = [];
  private seenHints = loadSeenHints();
  private usedFloss = false;
  private usedSurge = false;
  private lastSurgeReady = false;
  private keyHandler = (e: KeyboardEvent): void => {
    if (this.paused && e.key === 'Tab' && this.pauseSheetEl) {
      const sheet = this.pauseSheetEl.querySelector<HTMLElement>('.modal-sheet');
      if (sheet) {
        const items = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SEL));
        if (items.length > 0) {
          const first = items[0];
          const last = items[items.length - 1];
          const active = document.activeElement as HTMLElement | null;
          if (e.shiftKey) {
            if (!active || !sheet.contains(active) || active === first) {
              e.preventDefault();
              last.focus();
            }
          } else if (!active || !sheet.contains(active) || active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
      return;
    }
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.setPaused(!this.paused);
    } else if ((e.key === 'p' || e.key === 'P') && !isEditableEventTarget(e.target)) {
      this.setPaused(!this.paused);
    }
  };
  private visibilityHandler = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && !this.paused) {
      this.setPaused(true);
    }
  };
  /** Alt-tab or clicking another window: pause so timers and hazards never run unattended. */
  private blurHandler = (): void => {
    if (!this.paused) this.setPaused(true);
  };
  /**
   * A mouse click leaves keyboard focus on the HUD button, so the next Space press would press that
   * button again instead of scrubbing. Drop focus after mouse clicks only (keyboard users keep it).
   */
  private clickFocusHandler = (e: MouseEvent): void => {
    if (e.detail === 0) return;
    const target = e.target instanceof Element ? e.target.closest('button') : null;
    if (target && !target.closest('[role="dialog"]') && document.activeElement === target) {
      (target as HTMLElement).blur();
    }
  };
  private resizeHandler = (): void => {
    this.syncThumbPadVisibility();
  };

  private isCompactScreen(): boolean {
    if (typeof window === 'undefined') return false;
    return isCompactViewport(window.innerWidth, window.innerHeight);
  }

  private syncThumbPadVisibility(): void {
    if (!this.thumbDeckEl) return;
    const showPad = shouldShowVirtualThumbPad({
      pointerSteerEnabled: this.input.isPointerSteerEnabled(),
      compactViewport: this.isCompactScreen(),
    });
    this.thumbDeckEl.classList.toggle('pad-hidden', !showPad);
  }

  constructor(
    private readonly mode: 'ARCADE' | 'PULP_RESCUE',
    private readonly bus: EventBus,
    private readonly session: WorldSession,
    private readonly input: InputManager,
    private readonly sceneMgr: SceneManager,
    private readonly saveSys: SaveSystem,
    private readonly onExitToHub: () => void,
    private readonly audio?: HudAudioControls
  ) {}

  isPaused(): boolean {
    return this.paused;
  }

  setPaused(p: boolean): void {
    if (p === this.paused) return;
    if (p) {
      this.lastFocusedBeforePause =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    this.paused = p;
    this.audio?.setPaused(p);
    this.pauseBtnEl?.setAttribute('aria-expanded', p ? 'true' : 'false');
    if (this.pauseSheetEl) this.pauseSheetEl.style.display = p ? '' : 'none';
    if (p) {
      this.input.setVirtualMove(0, 0, false);
      this.input.setVirtualScrubHeld(false);
      if (this.audio && this.pauseSheetEl) {
        const mus = this.pauseSheetEl.querySelector<HTMLInputElement>('#pause-music');
        const sfx = this.pauseSheetEl.querySelector<HTMLInputElement>('#pause-sfx');
        if (mus) mus.value = String(Math.round(this.audio.getMusicVolume() * 100));
        if (sfx) sfx.value = String(Math.round(this.audio.getSfxVolume() * 100));
      }
      this.syncMuteLabels();
      this.syncMotionLabels();
      this.refreshStats();
      const objective = this.container?.querySelector('#hud-objective')?.textContent;
      const pauseObjective = this.pauseSheetEl?.querySelector('#pause-objective');
      if (pauseObjective) pauseObjective.textContent = objective ?? '';
      this.pauseSheetEl?.querySelector<HTMLElement>('#btn-pause-resume')?.focus();
    } else {
      if (this.lastFocusedBeforePause && this.lastFocusedBeforePause.isConnected) {
        this.lastFocusedBeforePause.focus();
      }
      this.lastFocusedBeforePause = null;
    }
  }

  private toggleMuteUi(): void {
    this.audio?.toggleMute();
    this.syncMuteLabels();
  }

  private syncMuteLabels(): void {
    const muted = this.audio?.isMuted() ?? false;
    if (this.muteBtnEl) {
      this.muteBtnEl.textContent = muted ? '🔇' : '🔊';
      this.muteBtnEl.setAttribute('aria-pressed', muted ? 'true' : 'false');
    }
    const sheetMute = this.container?.querySelector<HTMLButtonElement>('#btn-pause-mute');
    if (sheetMute) {
      sheetMute.textContent = muted ? '🔇 Muted' : '🔊 Sound On';
      sheetMute.setAttribute('aria-pressed', muted ? 'true' : 'false');
      sheetMute.classList.toggle('btn-primary', !muted);
    }
  }

  private syncMotionLabels(): void {
    const on = this.audio?.isReducedMotion() ?? this.sceneMgr.isReducedMotion();
    const sheetShake = this.container?.querySelector<HTMLButtonElement>('#btn-pause-shake');
    if (sheetShake) {
      sheetShake.textContent = on ? '✓ Reduced Shake: ON' : 'Reduced Shake: OFF';
      sheetShake.setAttribute('aria-pressed', on ? 'true' : 'false');
      sheetShake.classList.toggle('btn-primary', on);
    }
  }

  private maybeHint(key: string, msg: string): void {
    if (this.seenHints.has(key)) return;
    this.seenHints.add(key);
    saveSeenHints(this.seenHints);
    this.showToast(msg, 4.2);
  }

  mount(root: HTMLElement): void {
    this.container = document.createElement('div');
    this.container.className = 'hub-shell';
    root.appendChild(this.container);

    const titleLabel =
      this.mode === 'PULP_RESCUE'
        ? '🚨 PULP RESCUE SCRAMBLE'
        : `🦷 ${this.session.cartridge.title.toUpperCase()}`;

    this.container.innerHTML = `
      <div class="hud-top glass-card ui-interactive">
        <div class="row-between hud-top-row">
          <div class="row-wrap hud-telemetry-pills">
            <strong class="hud-world-title">${titleLabel}</strong>
            <span id="hud-ph" class="pill-badge">✓ pH 7.0</span>
            <span id="hud-sites" class="pill-badge">Sites 0/${this.session.sites.length}</span>
            <span id="hud-mechanic" class="pill-badge" style="display:none;"></span>
            <span id="hud-timer" class="pill-badge hud-timer-pill">⏱ 0:00</span>
          </div>
          <div class="row-wrap hud-action-pills">
            <span id="hud-score" class="pill-badge">1.0x • 0</span>
            <button type="button" id="btn-hud-quality" class="btn btn-sm" aria-label="Change Graphics Quality" title="Change Graphics Quality (slower devices)">
              ${this.formatQualityLabel()}
            </button>
            <button
              type="button"
              id="btn-hud-steer"
              class="btn btn-sm"
              aria-pressed="${this.input.isPointerSteerEnabled() ? 'true' : 'false'}"
              title="Turn drag-to-steer on or off"
            >
              ${this.input.isPointerSteerEnabled() ? '🎯 Steer: ON' : '🎯 Steer: OFF'}
            </button>
            <button
              type="button"
              id="btn-hud-mute"
              class="btn btn-sm btn-icon"
              aria-label="Toggle Sound (M)"
              aria-pressed="${(this.audio?.isMuted() ?? false) ? 'true' : 'false'}"
              title="Mute / Unmute (M)"
            >${this.audio?.isMuted() ? '🔇' : '🔊'}</button>
            <button
              type="button"
              id="btn-hud-pause"
              class="btn btn-sm btn-icon"
              aria-label="Pause Game (Esc or P)"
              aria-expanded="false"
              title="Pause (Esc / P)"
            >⏸</button>
            <button type="button" id="btn-hud-exit" class="btn btn-sm" aria-label="Exit to Smooth Bask Hub">← Hub</button>
          </div>
        </div>

        <div class="row-between hud-progress-row">
          <span id="hud-clean-pct" style="font-size:0.78rem;font-weight:700;min-width:64px;">0% Clean</span>
          <div
            id="hud-clean-progress"
            class="clean-progress-outer"
            role="progressbar"
            aria-label="Enamel Cleanliness"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="0"
          >
            <div id="hud-clean-bar" class="clean-progress-inner" style="width:0%;"></div>
          </div>
          <div id="hud-districts" class="row-wrap" style="font-size:0.72rem;"></div>
        </div>
        <div id="hud-objective" class="hud-objective" role="status" aria-live="off"></div>
      </div>

      <div id="hud-toast" class="hud-toast" role="status" aria-live="polite" style="opacity:0;"></div>

      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="desktop-hotkey-bar glass-card ui-interactive">
          <span class="pill-badge">WASD + Click/Space: Sonic Scrub</span>
          <button type="button" id="btn-desk-floss" class="btn btn-sm">🧵 Floss & Zip [Right-Click / E]</button>
          <button type="button" id="btn-desk-surge" class="btn btn-sm">🌊 Fluoride Surge (0%) [Q]</button>
          <button type="button" id="btn-desk-scan" class="btn btn-sm">🔍 Dye Bio-Scan [R]</button>
        </div>

        <div class="thumb-deck">
          <div id="pad-move" class="virtual-pad ui-interactive" aria-label="Move and Scrub Pad">
            <div id="pad-knob" class="virtual-knob">SCRUB</div>
          </div>

          <div class="actuator-cluster ui-interactive">
            <div class="row-wrap actuator-secondary-row">
              <button type="button" id="btn-mob-scan" class="btn btn-sm">🔍 Dye Scan</button>
              <button type="button" id="btn-mob-surge" class="btn btn-sm">🌊 Surge 0%</button>
            </div>
            <button
              type="button"
              id="ring-floss"
              class="floss-ring"
              aria-label="Floss and Floss Zip"
              title="Tap or drag to aim Floss"
            >
              <span>🧵 FLOSS</span>
              <span class="floss-sub" style="font-size:0.62rem;opacity:0.8;">TAP / AIM</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.cleanOuterEl = this.container.querySelector('#hud-clean-progress');
    this.cleanBarEl = this.container.querySelector('#hud-clean-bar');
    this.cleanTextEl = this.container.querySelector('#hud-clean-pct');
    this.phBadgeEl = this.container.querySelector('#hud-ph');
    this.sitesBadgeEl = this.container.querySelector('#hud-sites');
    this.scoreBadgeEl = this.container.querySelector('#hud-score');
    this.districtRowEl = this.container.querySelector('#hud-districts');
    this.scanBtnEl = this.container.querySelector('#btn-mob-scan');
    this.scanDeskBtnEl = this.container.querySelector('#btn-desk-scan');
    this.surgeBtnEl = this.container.querySelector('#btn-mob-surge');
    this.surgeDeskBtnEl = this.container.querySelector('#btn-desk-surge');
    this.toastEl = this.container.querySelector('#hud-toast');
    this.qualityBtnEl = this.container.querySelector('#btn-hud-quality');
    this.flossRingEl = this.container.querySelector('#ring-floss');
    this.flossDeskBtnEl = this.container.querySelector('#btn-desk-floss');
    this.thumbDeckEl = this.container.querySelector('.thumb-deck');
    this.mechanicBadgeEl = this.container.querySelector('#hud-mechanic');
    this.steerBtnEl = this.container.querySelector('#btn-hud-steer');
    this.muteBtnEl = this.container.querySelector('#btn-hud-mute');
    this.pauseBtnEl = this.container.querySelector('#btn-hud-pause');
    this.timerEl = this.container.querySelector('#hud-timer');
    this.syncThumbPadVisibility();
    this.buildPauseSheet();
    window.addEventListener('keydown', this.keyHandler);
    window.addEventListener('resize', this.resizeHandler);
    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('blur', this.blurHandler);
    this.container.addEventListener('click', this.clickFocusHandler);

    // Callout layer sits above the canvas but outside the flex HUD flow
    this.calloutLayer = document.createElement('div');
    this.calloutLayer.className = 'callout-layer';
    root.appendChild(this.calloutLayer);
    for (let i = 0; i < MAX_CALLOUTS; i++) {
      const el = document.createElement('div');
      el.className = 'world-callout';
      el.style.opacity = '0';
      this.calloutLayer.appendChild(el);
      this.callouts.push({ el, wx: 0, wy: 0, wz: 0, age: 0, life: 1, active: false });
    }
    this.zipPromptEl = document.createElement('div');
    this.zipPromptEl.className = 'zip-prompt';
    this.zipPromptEl.textContent = ZIP_PROMPT_TEXT;
    this.zipPromptEl.style.opacity = '0';
    this.zipPromptEl.setAttribute('role', 'button');
    this.zipPromptEl.setAttribute('aria-label', 'Zip floss through the gap between teeth');
    this.zipPromptEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.input.triggerVirtualFloss(null);
    });
    this.calloutLayer.appendChild(this.zipPromptEl);
    this.steerHaloEl = document.createElement('div');
    this.steerHaloEl.className = 'steer-halo';
    this.calloutLayer.appendChild(this.steerHaloEl);
    for (let i = 0; i < MAX_WAYFINDERS; i++) {
      const el = document.createElement('div');
      el.className = 'wayfinder-pill';
      el.style.opacity = '0';
      this.calloutLayer.appendChild(el);
      this.wayfinders.push({ el, kind: 'site' });
    }

    this.bindControls();
    this.bindBusEvents();
    this.refreshStats();
    this.lastSynergy = this.session.scoring.getSynergyMultiplier();

    const blurb = this.session.cartridge.challengeBlurb;
    const world1Done = Boolean(this.saveSys.getSave().worlds.world_1?.completed);
    if (blurb && shouldShowDiveIntroToast(this.mode, this.session.cartridge.id, world1Done)) {
      this.showToast(`🎯 ${blurb}`, 4.2);
    }
  }

  /** Spawns a crisp floating callout anchored to a world position (rises & fades). */
  spawnCallout(text: string, pos: Vec2, tone: CalloutTone = 'mint', life = 1.25, yOffset = 1.6): void {
    const compact = this.isCompactScreen();
    const displayMsg = compactToastText(text, compact);
    const slot =
      this.callouts.find((c) => c.active && c.el.textContent === displayMsg) ??
      this.callouts.find((c) => !c.active) ??
      this.callouts.reduce((a, b) => (a.age > b.age ? a : b));
    const cart = this.session.cartridge;
    slot.active = true;
    slot.age = 0;
    slot.life = compact ? Math.min(life, 1.05) : life;
    slot.wx = pos.x;
    slot.wz = pos.z;
    slot.wy = (cart ? sampleTerrainHeight(cart, pos.x, pos.z) : 0.5) + yOffset;
    slot.el.textContent = displayMsg;
    slot.el.className = `world-callout tone-${tone}`;
  }

  private tickCallouts(dt: number): void {
    const reduced = this.sceneMgr.isReducedMotion();
    const w = Math.max(1, window.innerWidth);
    const hudBottom = this.measureTopClearanceBottom();
    const deckTop = this.measureBottomDeckTop();
    const calloutBoxes: ScreenBox[] = [...this.frameOccupiedBoxes];

    for (const c of this.callouts) {
      if (!c.active) continue;
      if (this.paused) {
        c.el.style.opacity = '0';
        continue;
      }
      c.age += dt;
      if (c.age >= c.life) {
        c.active = false;
        c.el.style.opacity = '0';
        continue;
      }
      const u = c.age / c.life;
      const lift = reduced ? u * 0.15 : u * 1.1;
      const sp = this.sceneMgr.worldToScreen(c.wx, c.wy + lift, c.wz);
      if (!sp.visible) {
        c.el.style.opacity = '0';
        continue;
      }
      const pillW = c.el.offsetWidth || 168;
      const pillH = c.el.offsetHeight || 28;
      const placed = placeWorldCallout({
        x: sp.x,
        bottomY: sp.y,
        width: pillW,
        height: pillH,
        viewportW: w,
        hudBottom,
        deckTop,
        occupied: calloutBoxes,
      });
      calloutBoxes.push({
        cx: placed.x,
        cy: placed.bottomY - pillH * 0.5,
        halfW: pillW * 0.5,
        halfH: pillH * 0.5,
      });
      const pop = reduced
        ? 1.0
        : u < 0.12
          ? 0.85 + (u / 0.12) * 0.23
          : 1.08 - Math.min(0.08, (u - 0.12) * 0.4);
      c.el.style.transform = `translate3d(${placed.x.toFixed(1)}px, ${placed.bottomY.toFixed(1)}px, 0) translate(-50%, -100%) scale(${pop.toFixed(3)})`;
      c.el.style.opacity = String(u > 0.7 ? Math.max(0, (1 - u) / 0.3) : 1);
    }
  }

  /** Subtle world-anchored scrub halo where the player is pointing (zero draw calls, DOM only). */
  private tickSteerHalo(): void {
    const el = this.steerHaloEl;
    if (!el) return;
    const t = this.paused ? null : this.input.getSteerTarget();
    if (!t) {
      el.classList.remove('on');
      return;
    }
    const y = sampleTerrainHeight(this.session.cartridge, t.x, t.z) + 0.2;
    const sp = this.sceneMgr.worldToScreen(t.x, y, t.z);
    if (!sp.visible) {
      el.classList.remove('on');
      return;
    }
    el.style.transform = `translate3d(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px, 0)`;
    el.classList.add('on');
  }

  private measureTopClearanceBottom(): number {
    let bottom = this.container?.querySelector('.hud-top')?.getBoundingClientRect().bottom ?? 0;
    if (this.toastTimerSec > 0 && this.toastEl) {
      const tr = this.toastEl.getBoundingClientRect();
      if (tr.height > 0 && tr.bottom < window.innerHeight * 0.45) {
        bottom = Math.max(bottom, tr.bottom);
      }
    }
    return bottom;
  }

  private measureBottomDeckTop(): number {
    const h = Math.max(1, window.innerHeight);
    let deckTop = h;
    for (const sel of ['.thumb-deck', '.desktop-hotkey-bar']) {
      const el = this.container?.querySelector<HTMLElement>(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.top > h * 0.45) {
        deckTop = Math.min(deckTop, r.top);
      }
    }
    return deckTop;
  }

  /** In-world contextual Zip prompt when HYDRA-1 approaches a 0.90u alley blocked to walking. */
  private tickZipPrompt(): void {
    if (!this.zipPromptEl) return;
    const cart = this.session.cartridge;
    const hint =
      !cart || this.session.probeZip || this.paused
        ? null
        : findNearestZipMouth(this.session.probePos, cart.interdentalAlleys, cart.wallBoxes);
    const show = Boolean(hint && hint.blockedToWalking);
    if (hint && show) {
      const compact = this.isCompactScreen();
      const wantText = formatZipPromptText(hint.inZipRange, compact, ZIP_PROMPT_TEXT);
      if (this.zipPromptEl.textContent !== wantText) {
        this.zipPromptEl.textContent = wantText;
      }
      const y = sampleTerrainHeight(cart, hint.entry.x, hint.entry.z) + 2.1;
      const sp = this.sceneMgr.worldToScreen(hint.entry.x, y, hint.entry.z);
      const w = Math.max(1, window.innerWidth);
      const hudBottom = this.measureTopClearanceBottom();
      const deckTop = this.measureBottomDeckTop();
      const promptW = this.zipPromptEl.offsetWidth || 240;
      const promptH = this.zipPromptEl.offsetHeight || 40;
      const halfW = Math.min(w * 0.46, promptW * 0.5);
      const clampedX = Math.max(halfW + 8, Math.min(w - halfW - 8, sp.x));
      const minBottomY = hudBottom + promptH + 8;
      const maxBottomY = Math.max(minBottomY, deckTop - 8);
      const clampedY = Math.max(minBottomY, Math.min(maxBottomY, sp.y));
      this.zipPromptEl.style.transform = `translate3d(${clampedX.toFixed(1)}px, ${clampedY.toFixed(1)}px, 0) translate(-50%, -100%)`;
      this.zipPromptEl.style.opacity = sp.visible ? '1' : '0';
      this.zipPromptEl.style.pointerEvents = sp.visible && hint.inZipRange ? 'auto' : 'none';
      this.zipPromptEl.classList.toggle('ready', hint.inZipRange);
      this.zipScreenBox = {
        cx: clampedX,
        cy: clampedY - promptH * 0.5,
        halfW: promptW * 0.5,
        halfH: promptH * 0.5,
        active: sp.visible,
      };
    } else {
      this.zipPromptEl.style.opacity = '0';
      this.zipPromptEl.style.pointerEvents = 'none';
      this.zipPromptEl.classList.remove('ready');
      this.zipScreenBox.active = false;
    }
    const ready = Boolean(hint && hint.inZipRange);
    this.flossRingEl?.classList.toggle('zip-ready', ready);
    this.flossDeskBtnEl?.classList.toggle('zip-ready', ready);
  }

  private formatQualityLabel(): string {
    const pref = this.saveSys.getSave().qualityPreference;
    const shortTier = (t: QualityTier) =>
      t === 'medium' ? 'MED' : t === 'ultra' ? 'ULT' : 'LOW';
    return pref === 'auto'
      ? `AUTO:${shortTier(this.sceneMgr.getActiveQualityTier())}`
      : `GPU:${shortTier(pref)}`;
  }

  private bindControls(): void {
    if (!this.container) return;

    this.container.querySelector('#btn-hud-exit')?.addEventListener('click', () => {
      this.onExitToHub();
    });
    this.muteBtnEl?.addEventListener('click', () => this.toggleMuteUi());
    this.container
      .querySelector('#btn-hud-pause')
      ?.addEventListener('click', () => this.setPaused(true));

    this.steerBtnEl?.addEventListener('click', () => {
      const next = !this.input.isPointerSteerEnabled();
      this.input.setPointerSteerEnabled(next);
      this.syncThumbPadVisibility();
      const label = next ? '🎯 Steer: ON' : '🎯 Steer: OFF';
      if (this.steerBtnEl) {
        this.steerBtnEl.textContent = label;
        this.steerBtnEl.setAttribute('aria-pressed', next ? 'true' : 'false');
      }
      const pauseSteer = this.container?.querySelector<HTMLButtonElement>('#btn-pause-steer');
      if (pauseSteer) {
        pauseSteer.textContent = label;
        pauseSteer.setAttribute('aria-pressed', next ? 'true' : 'false');
        pauseSteer.classList.toggle('btn-primary', next);
      }
      this.showToast(
        next
          ? '🎯 Touch Steer ON — drag on the tooth to scrub'
          : '🕹️ Thumb Pad ON — steer with the bottom-left pad'
      );
    });

    this.container.querySelector('#btn-hud-quality')?.addEventListener('click', () => {
      const order: Array<'auto' | QualityTier> = ['auto', 'low', 'medium', 'ultra'];
      const cur = this.saveSys.getSave().qualityPreference;
      const next = order[(order.indexOf(cur) + 1) % order.length];
      this.saveSys.setQualityPreference(next);
      this.sceneMgr.setQualityPreference(next);
      if (this.qualityBtnEl) {
        this.qualityBtnEl.textContent = this.formatQualityLabel();
      }
      const sheetQuality = this.container?.querySelector('#btn-pause-quality');
      if (sheetQuality) sheetQuality.textContent = this.formatQualityLabel();
    });

    // Desktop clickable buttons
    this.container
      .querySelector('#btn-desk-floss')
      ?.addEventListener('click', () => this.input.triggerVirtualFloss(null));
    this.container
      .querySelector('#btn-desk-surge')
      ?.addEventListener('click', () => this.input.triggerVirtualRinse());
    this.container
      .querySelector('#btn-desk-scan')
      ?.addEventListener('click', () => this.input.triggerVirtualDisclose());

    // Mobile buttons (respond immediately on multi-touch pointerdown as well as click/keyboard)
    const mobSurge = this.container.querySelector('#btn-mob-surge');
    mobSurge?.addEventListener('pointerdown', (e) => {
      if ((e as PointerEvent).pointerType !== 'mouse') {
        e.preventDefault();
        this.input.triggerVirtualRinse();
      }
    });
    mobSurge?.addEventListener('click', () => this.input.triggerVirtualRinse());

    const mobScan = this.container.querySelector('#btn-mob-scan');
    mobScan?.addEventListener('pointerdown', (e) => {
      if ((e as PointerEvent).pointerType !== 'mouse') {
        e.preventDefault();
        this.input.triggerVirtualDisclose();
      }
    });
    mobScan?.addEventListener('click', () => this.input.triggerVirtualDisclose());

    // Left Virtual Scrub & Sweep Thumb Pad
    const pad = this.container.querySelector<HTMLElement>('#pad-move');
    const knob = this.container.querySelector<HTMLElement>('#pad-knob');
    if (pad && knob) {
      let activePid: number | null = null;
      const maxR = 38;

      const updatePad = (clientX: number, clientY: number) => {
        const rect = pad.getBoundingClientRect();
        const cx = rect.left + rect.width * 0.5;
        const cy = rect.top + rect.height * 0.5;
        let dx = clientX - cx;
        let dy = clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > maxR) {
          dx = (dx / dist) * maxR;
          dy = (dy / dist) * maxR;
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.input.setVirtualMove(dx / maxR, dy / maxR, true);
      };

      pad.addEventListener('pointerdown', (e) => {
        if (activePid !== null || e.button !== 0) return;
        activePid = e.pointerId;
        pad.setPointerCapture(e.pointerId);
        updatePad(e.clientX, e.clientY);
        this.input.setVirtualScrubHeld(true);
      });
      pad.addEventListener('pointermove', (e) => {
        if (e.pointerId === activePid) updatePad(e.clientX, e.clientY);
      });
      const releasePad = (e: PointerEvent) => {
        if (e.pointerId !== activePid) return;
        activePid = null;
        knob.style.transform = 'translate(0px, 0px)';
        this.input.setVirtualMove(0, 0, false);
      };
      pad.addEventListener('pointerup', releasePad);
      pad.addEventListener('pointercancel', releasePad);
      pad.addEventListener('lostpointercapture', releasePad);
    }

    // Right Polymer Floss Vector Slingshot Ring (tap = smart auto-aim; drag = directional filament!)
    const ring = this.container.querySelector<HTMLButtonElement>('#ring-floss');
    if (ring) {
      let flossPid: number | null = null;
      let startX = 0;
      let startY = 0;

      ring.addEventListener('pointerdown', (e) => {
        if (flossPid !== null || e.button !== 0) return;
        flossPid = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        ring.setPointerCapture(e.pointerId);
        ring.style.borderColor = '#2dd4bf';
      });

      const clearRing = (e: PointerEvent): boolean => {
        if (e.pointerId !== flossPid) return false;
        flossPid = null;
        ring.style.removeProperty('border-color');
        return true;
      };

      ring.addEventListener('pointerup', (e) => {
        if (!clearRing(e)) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const dist = Math.hypot(dx, dy);
        if (dist > 14) {
          this.input.triggerVirtualFloss({ x: dx / dist, z: dy / dist });
        } else {
          this.input.triggerVirtualFloss(null);
        }
      });
      ring.addEventListener('pointercancel', clearRing);
      ring.addEventListener('lostpointercapture', clearRing);
      ring.addEventListener('click', (e) => {
        // Pointer releases already carry an aim vector. Keyboard and assistive activation use smart aim.
        if (e.detail === 0) this.input.triggerVirtualFloss(null);
      });
    }
  }

  private bindBusEvents(): void {
    this.disposers.add(this.bus.on('audio:changed', () => this.syncMuteLabels()));
    this.disposers.add(this.bus.on('motion:changed', () => this.syncMotionLabels()));
    this.disposers.add(
      this.bus.on('surge:ready', () => {
        this.spawnCallout('🌊 Surge Ready! [Q]', this.session.probePos, 'cyan', 1.45, 2.3);
      })
    );
    this.disposers.add(
      this.bus.on('spring:triggered', () => {
        if (!this.session.hasStephanClock() && !this.session.hasErosionChallenge()) {
          this.spawnCallout('💧 Saliva Spring!', this.session.probePos, 'cyan', 1.25, 1.8);
        }
      })
    );
    this.disposers.add(
      this.bus.on('mutans:bumped', () => {
        if (this.mutansCalloutCooldown <= 0) {
          this.mutansCalloutCooldown = 1.5;
          this.spawnCallout('🦠 Slime Boing!', this.session.probePos, 'gold', 1.05, 1.7);
        }
      })
    );
    this.disposers.add(
      this.bus.on('mutans:popped', ({ pos, via }) => {
        if (via !== 'seal' && this.mutansPopCalloutCooldown <= 0) {
          this.mutansPopCalloutCooldown = 0.6;
          this.spawnCallout('🦠 Cavity germ popped!', pos, 'mint', 1.05, 1.5);
        }
      })
    );
    this.disposers.add(
      this.bus.on('floss:sliced', () => {
        this.usedFloss = true;
      })
    );
    this.disposers.add(
      this.bus.on('rinse:surged', () => {
        this.usedSurge = true;
      })
    );
    this.disposers.add(
      this.bus.on('gum:tender', () =>
        this.maybeHint('sulcus', '🩷 Sore gums! Sweep gently. Don’t press in one spot.')
      )
    );
    this.disposers.add(
      this.bus.on('eps:deflected', () => {
        if (!this.usedFloss && !this.usedSurge) {
          this.maybeHint('eps', '🛡️ Slime dome blocks the brush! Crack it with Floss (E) or Surge (Q).');
        }
      })
    );
    this.disposers.add(
      this.bus.on('site:restored', ({ pos, surgeDelta }) => {
        if (!this.seenHints.has('first_colony')) {
          this.seenHints.add('first_colony');
          saveSeenHints(this.seenHints);
          this.showToast('✨ Helper germs are back! Clean glowing rings to charge 🌊 Surge (+30%)', 3.4);
        } else {
          this.showToast('✨ Helper germs are back! (+30% Surge)', 2.2);
        }
        this.spawnCallout(`Colony Restored! +${Math.round(surgeDelta)} Surge`, pos, 'mint', 1.5);
      })
    );
    this.disposers.add(
      this.bus.on('sucrose:shattered', ({ pos }) => {
        this.spawnCallout('Crystal Shattered!', pos, 'violet', 1.1);
      })
    );
    this.disposers.add(
      this.bus.on('actuator:scrub', ({ acidWarn }) => {
        if (acidWarn) {
          this.maybeHint(
            this.session.hasErosionChallenge() ? 'acid_erosion' : 'acid',
            this.session.hasErosionChallenge()
              ? '🌺 Acid pool! Touch a Miswak Spring or fire Surge [Q] to add fluoride.'
              : '⚠️ Acid attack! Wait it out, or hit a Saliva Spring.'
          );
        }
        if (acidWarn && this.acidCalloutCooldown <= 0) {
          this.acidCalloutCooldown = 1.8;
          this.spawnCallout(
            this.session.hasErosionChallenge()
              ? '🌺 Acid! Touch Miswak Spring'
              : 'Acid! Touch Saliva Spring',
            this.session.probePos,
            'rose',
            1.35
          );
        }
      })
    );
    this.disposers.add(
      this.bus.on('gum:tender', ({ pos }) => {
        if (this.gumCalloutCooldown <= 0) {
          this.gumCalloutCooldown = 1.6;
          this.spawnCallout('Tender Gums! Sweep Gently ↔', pos, 'rose', 1.4);
        }
      })
    );
    this.disposers.add(
      this.bus.on('eps:deflected', ({ pos }) => {
        if (this.epsCalloutCooldown <= 0) {
          this.epsCalloutCooldown = 1.6;
          this.spawnCallout('🛡️ Slime dome! Cut it with Floss!', pos, 'violet', 1.35);
        }
      })
    );
    this.disposers.add(
      this.bus.on('eps:cracked', ({ pos, via }) => {
        this.showToast(
          via === 'rinse'
            ? '💥 Surge broke the dome — scrub clean!'
            : '💥 Floss cracked the dome — scrub clean!',
          2.8
        );
        if (via === 'rinse') {
          this.spawnCallout('💥 Dome cracked!', pos, 'mint', 1.35);
        }
      })
    );
    this.disposers.add(
      this.bus.on('fluorapatite:infused', ({ pos, durationSec }) => {
        this.showToast(
          `💎 Miswak + fluoride boost (${Math.round(durationSec)}s)! Your brush now adds fluoride armor!`,
          3.0
        );
        this.spawnCallout('💎 F⁻ Infused! pH 4.5 Safe', pos, 'cyan', 1.45);
      })
    );
    this.disposers.add(
      this.bus.on('erosion:wash', () => {
        this.showToast('🌺 Hibiscus splash! Open pools turned acid.', 2.8);
        this.spawnCallout('🌺 Hibiscus acid', this.session.probePos, 'gold', 1.35, 2.1);
      })
    );
    this.disposers.add(
      this.bus.on('stephan:sip', () => {
        this.showToast('🥤 Sweet sip! The acid clock restarted. Hit a Saliva Spring!', 3.2);
        this.spawnCallout('Sweet Sip! pH ↓ 4.8', this.session.probePos, 'gold', 1.5, 2.2);
      })
    );
    this.disposers.add(
      this.bus.on('stephan:buffered', ({ pos }) => {
        this.spawnCallout('Saliva helps! −7s acid', pos, 'cyan', 1.3);
      })
    );
    this.disposers.add(
      this.bus.on('rinse:surged', ({ origin }) => {
        this.spawnCallout('Fluoride-Bicarb Surge!', origin, 'cyan', 1.4, 2.2);
      })
    );
    this.disposers.add(
      this.bus.on('district:sealed', ({ districtName }) => {
        this.showToast(`🌊 ${districtName} sealed with fluoride!`);
      })
    );
    this.disposers.add(
      this.bus.on('beacon:collected', () => {
        this.showToast('⚡ Habit Beacon! (+50% Surge)');
      })
    );
    this.disposers.add(
      this.bus.on('floss:sliced', ({ zipped, targetsHit, surgeDelta, to, epsCellsCracked }) => {
        const surge = Math.round(surgeDelta);
        if (zipped) {
          this.showToast(
            epsCellsCracked > 0
              ? '💥 Floss Zip cracked the slime dome!'
              : '🧵 Floss Zip between the teeth!'
          );
          this.spawnCallout(surge > 0 ? `Zipped! +${surge} Surge` : 'Zipped! Surge Full', to, 'cyan', 1.35);
        } else if (epsCellsCracked > 0) {
          const extra = targetsHit > 0 ? ` +×${targetsHit}` : '';
          this.spawnCallout(
            `💥 Dome cracked!${extra}${surge > 0 ? ` +${surge} Surge` : ''}`,
            to,
            'mint',
            1.35
          );
        } else if (targetsHit > 0) {
          this.showToast(`🧵 Floss cut ${targetsHit} plaque bridge${targetsHit > 1 ? 's' : ''}!`);
          this.spawnCallout(`Severed ×${targetsHit}${surge > 0 ? ` +${surge} Surge` : ''}`, to, 'mint', 1.2);
        } else if (shouldHintFlossMiss(zipped, targetsHit, epsCellsCracked, this.zipScreenBox.active)) {
          this.spawnCallout('No hit — aim at gem or alley', this.session.probePos, 'cyan', 1.35);
        }
      })
    );
    this.disposers.add(
      this.bus.on('quality:changed', () => {
        if (this.qualityBtnEl) {
          this.qualityBtnEl.textContent = this.formatQualityLabel();
        }
      })
    );
  }

  showToast(msg: string, durationSec = 2.6): void {
    if (!this.toastEl) return;
    if (!msg || durationSec <= 0) {
      this.toastEl.style.opacity = '0';
      this.toastTimerSec = 0;
      return;
    }
    const compact = this.isCompactScreen();
    this.toastEl.textContent = compactToastText(msg, compact);
    this.toastEl.style.opacity = '1';
    this.toastTimerSec = compact ? Math.min(durationSec, 2.35) : durationSec;
  }

  tickHud(frameDt: number): void {
    this.acidCalloutCooldown = Math.max(0, this.acidCalloutCooldown - frameDt);
    this.gumCalloutCooldown = Math.max(0, this.gumCalloutCooldown - frameDt);
    this.epsCalloutCooldown = Math.max(0, this.epsCalloutCooldown - frameDt);
    this.mutansCalloutCooldown = Math.max(0, this.mutansCalloutCooldown - frameDt);
    this.mutansPopCalloutCooldown = Math.max(0, this.mutansPopCalloutCooldown - frameDt);

    if (!this.paused && !this.seenHints.has('first_dive') && this.mode === 'ARCADE') {
      this.onboardingElapsed += frameDt;
      if (this.onboardingElapsed >= 5.3) {
        if (this.session.grid.getWorldCleanRatio() < 0.05) {
          this.maybeHint(
            'first_dive',
            '🕹️ Drag on the tooth (or WASD + Space) to scrub • E / 🧵 Floss cleans the narrow gaps!'
          );
        } else {
          this.seenHints.add('first_dive');
          saveSeenHints(this.seenHints);
        }
      }
    }

    // Synergy multiplier step-ups pop a floating callout over HYDRA-1
    const syn = this.session.scoring.getSynergyMultiplier();
    if (syn > this.lastSynergy + 1e-3) {
      this.spawnCallout(`${syn.toFixed(2)}x Synergy!`, this.session.probePos, 'gold', 1.3, 2.4);
    }
    this.lastSynergy = syn;

    this.tickZipPrompt();
    this.tickSteerHalo();
    this.tickWayfinders();
    this.tickCallouts(frameDt);

    if (this.toastTimerSec > 0) {
      this.toastTimerSec -= frameDt;
      if (this.toastTimerSec <= 0 && this.toastEl) {
        this.toastEl.style.opacity = '0';
      }
    }

    this.hudAccumSec += frameDt;
    if (this.hudAccumSec >= 0.1) {
      this.hudAccumSec = 0;
      this.refreshStats();
    }
  }

  private refreshStats(): void {
    const cleanPct = Math.round(this.session.grid.getWorldCleanRatio() * 100);
    if (this.cleanBarEl) this.cleanBarEl.style.width = `${cleanPct}%`;
    if (this.cleanOuterEl) this.cleanOuterEl.setAttribute('aria-valuenow', String(cleanPct));
    if (this.cleanTextEl) this.cleanTextEl.textContent = `${cleanPct}% Clean`;

    const avgPh = this.session.chemistry.getAveragePh();
    if (this.phBadgeEl) {
      const acidic = avgPh < 5.6;
      this.phBadgeEl.textContent = `${acidic ? '⚠️' : '✓'} pH ${avgPh.toFixed(1)}`;
      // Colorblind-safe amber-orange warning vs sky-cyan neutral
      this.phBadgeEl.style.borderColor = acidic ? '#f59e0b' : 'rgba(56, 189, 248, 0.35)';
      this.phBadgeEl.style.color = acidic ? '#fde68a' : '#e0f2fe';
    }

    const restored = this.session.sites.filter((s) => s.restored).length;
    if (this.sitesBadgeEl) {
      this.sitesBadgeEl.textContent = `Sites ${restored}/${this.session.sites.length}`;
    }

    const syn = this.session.scoring.getSynergyMultiplier();
    const preview = this.session.scoring.evaluateBreakdown({
      worldCleanRatio: this.session.grid.getWorldCleanRatio(),
      sitesTotal: this.session.sites.length,
      elapsedSec: this.session.getElapsedSec(),
      parTimeSec: this.session.cartridge.parTimeSec,
    });
    if (this.scoreBadgeEl) {
      this.scoreBadgeEl.textContent = `${syn.toFixed(2)}x • ${preview.totalScore}`;
    }

    if (this.districtRowEl) {
      if (this.mode === 'PULP_RESCUE') {
        const rem = Math.ceil(this.session.getRemainingRescueSec());
        this.districtRowEl.innerHTML = `<span class="pill-badge" style="border-color:#f59e0b;color:#fde68a;">⏱️ ${rem}s Left (Target 85%)</span>`;
      } else {
        this.districtRowEl.innerHTML = this.session.cartridge.districts
          .map((_d, idx) => {
            const sealed = this.session.sealedDistricts[idx];
            const dPct = Math.round(this.session.grid.getDistrictCleanRatio(idx) * 100);
            return `<span class="pill-badge" style="border-color:${sealed ? '#38bdf8' : 'rgba(148,184,204,0.22)'};color:${sealed ? '#bae6fd' : '#cbd5e1'};">
              ${sealed ? '✓' : `D${idx + 1}`} ${dPct}%
            </span>`;
          })
          .join('');
      }
    }

    // Signature biophysical challenge badge (Worlds 2–5, colorblind-safe icons + high-contrast palette)
    if (this.mechanicBadgeEl) {
      if (this.session.hasStephanClock()) {
        const acidSec = this.session.chemistry.getStephanTimerSec();
        const nextSip = this.session.getStephanSipCountdown();
        this.mechanicBadgeEl.style.display = '';
        if (acidSec > 0) {
          this.mechanicBadgeEl.textContent = `⚠️ Acid Clock ${Math.ceil(acidSec)}s`;
          this.mechanicBadgeEl.style.borderColor = '#f59e0b';
          this.mechanicBadgeEl.style.color = '#fde68a';
        } else {
          this.mechanicBadgeEl.textContent =
            nextSip > 0 ? `🥤 Next Sip ${Math.ceil(nextSip)}s` : '✓ Sugar Cut Off!';
          this.mechanicBadgeEl.style.borderColor = nextSip > 0 ? '#c084fc' : '#38bdf8';
          this.mechanicBadgeEl.style.color = nextSip > 0 ? '#e9d5ff' : '#bae6fd';
        }
      } else if (this.session.hasSulcusCare()) {
        const gum = this.session.chemistry.getMaxGumIrritation();
        const pct = Math.round((gum / GUM_TENDER_THRESHOLD) * 100);
        const warn = gum >= GUM_TENDER_THRESHOLD * 0.7;
        this.mechanicBadgeEl.style.display = '';
        this.mechanicBadgeEl.textContent =
          gum >= GUM_TENDER_THRESHOLD ? '⚠️ Gums Tender!' : `🩷 Gum ${Math.min(99, pct)}%`;
        this.mechanicBadgeEl.style.borderColor = warn ? '#f59e0b' : 'rgba(56, 189, 248, 0.35)';
        this.mechanicBadgeEl.style.color = warn ? '#fde68a' : '#e0f2fe';
      } else if (this.session.hasErosionChallenge()) {
        const infSec = this.session.getFluorapatiteInfusionSec();
        const faPct = Math.round(this.session.grid.getFluorapatiteRatio() * 100);
        this.mechanicBadgeEl.style.display = '';
        if (infSec > 0) {
          this.mechanicBadgeEl.textContent = `💎 F⁻ ${Math.ceil(infSec)}s • ${faPct}%`;
          this.mechanicBadgeEl.style.borderColor = '#38bdf8';
          this.mechanicBadgeEl.style.color = '#bae6fd';
        } else {
          this.mechanicBadgeEl.textContent = `🌺 Hibiscus • 💎 ${faPct}%`;
          this.mechanicBadgeEl.style.borderColor = '#f59e0b';
          this.mechanicBadgeEl.style.color = '#fde68a';
        }
      } else if (this.session.hasEpsDomes()) {
        const epsPct = Math.round(this.session.grid.getEpsArmorRemainingRatio() * 100);
        this.mechanicBadgeEl.style.display = '';
        if (epsPct > 0) {
          this.mechanicBadgeEl.textContent = `🛡️ Slime dome ${epsPct}%`;
          this.mechanicBadgeEl.style.borderColor = '#c084fc';
          this.mechanicBadgeEl.style.color = '#e9d5ff';
        } else {
          this.mechanicBadgeEl.textContent = '✓ Domes Cracked!';
          this.mechanicBadgeEl.style.borderColor = '#38bdf8';
          this.mechanicBadgeEl.style.color = '#bae6fd';
        }
      } else {
        this.mechanicBadgeEl.style.display = 'none';
      }
    }

    if (this.timerEl) {
      const pill = buildTimerPill(
        this.mode,
        this.session.getElapsedSec(),
        this.session.cartridge.parTimeSec,
        this.session.getRemainingRescueSec()
      );
      this.timerEl.textContent = pill.text;
      this.timerEl.style.borderColor = pill.warn ? '#f59e0b' : 'rgba(56, 189, 248, 0.35)';
      this.timerEl.style.color = pill.warn ? '#fde68a' : '#e0f2fe';
    }

    const surgePct = Math.round((this.session.surgeMeter / SURGE_MAX) * 100);
    const surgeReady = surgePct >= 100;
    const objEl = this.container?.querySelector<HTMLElement>('#hud-objective');
    if (objEl) {
      const sealedArr = this.session.sealedDistricts;
      const msg = computeObjectiveBreadcrumb({
        mode: this.mode === 'PULP_RESCUE' ? 'PULP_RESCUE' : 'ARCADE',
        worldCleanRatio: this.session.grid.getWorldCleanRatio(),
        districtClean: this.session.cartridge.districts.map((_d, i) => this.session.grid.getDistrictCleanRatio(i)),
        sealed: this.session.cartridge.districts.map((_d, i) => Boolean(sealedArr[i])),
        sitesLeftOpen: this.session.sites.filter((st) => !st.restored && !sealedArr[st.districtIdx]).length,
        domesRemaining: this.session.hasEpsDomes() && this.session.grid.getEpsArmorRemainingRatio() > 0,
        surgeReady,
        acidLockSec: this.session.hasStephanClock() ? this.session.chemistry.getStephanTimerSec() : 0,
        rescueRemainingSec: this.mode === 'PULP_RESCUE' ? this.session.getRemainingRescueSec() : undefined,
      });
      const full = compactToastText(`🎯 ${msg}`, this.isCompactScreen());
      if (objEl.textContent !== full) objEl.textContent = full;
    }
    const scanSec = Math.ceil(Math.max(0, this.session.discloseActiveRemaining));
    const scanOn = scanSec > 0;
    if (this.scanBtnEl) {
      this.scanBtnEl.textContent = scanOn ? `🔍 ${scanSec}s` : '🔍 Dye Scan';
      this.scanBtnEl.classList.toggle('scan-active', scanOn);
      this.scanBtnEl.setAttribute('aria-pressed', scanOn ? 'true' : 'false');
    }
    if (this.scanDeskBtnEl) {
      this.scanDeskBtnEl.textContent = scanOn
        ? `🔍 Dye Bio-Scan (${scanSec}s) [R]`
        : '🔍 Dye Bio-Scan [R]';
      this.scanDeskBtnEl.classList.toggle('scan-active', scanOn);
      this.scanDeskBtnEl.setAttribute('aria-pressed', scanOn ? 'true' : 'false');
    }
    if (scanOn) {
      this.maybeHint(
        'two_tone_dye',
        '🔍 Dye shows plaque: pink = new and thin • purple = old and thick. Scrub purple first!'
      );
    }
    if (surgeReady && !this.lastSurgeReady && !this.usedSurge) {
      this.maybeHint('surge', '🌊 Surge is full! Press Q or tap Surge to blast a fluoride wave.');
    }
    this.lastSurgeReady = surgeReady;
    if (this.surgeBtnEl) {
      const compact = this.isCompactScreen();
      this.surgeBtnEl.textContent = surgeReady
        ? compact
          ? '🌊 SURGE!'
          : '🌊 SURGE READY!'
        : compact
          ? `🌊 ${surgePct}%`
          : `🌊 Surge ${surgePct}%`;
      this.surgeBtnEl.style.setProperty('--surge-pct', `${surgePct}%`);
      this.surgeBtnEl.className = surgeReady ? 'btn btn-primary btn-sm surge-meter-btn surge-ready' : 'btn btn-sm surge-meter-btn';
    }
    if (this.surgeDeskBtnEl) {
      this.surgeDeskBtnEl.textContent = surgeReady
        ? '🌊 FLUORIDE SURGE READY! [Q]'
        : `🌊 Fluoride Surge (${surgePct}%) [Q]`;
      this.surgeDeskBtnEl.style.setProperty('--surge-pct', `${surgePct}%`);
      this.surgeDeskBtnEl.className = surgeReady ? 'btn btn-primary btn-sm surge-meter-btn surge-ready' : 'btn btn-sm surge-meter-btn';
    }

    const pauseSummary = this.pauseSheetEl?.querySelector<HTMLElement>('#pause-telemetry-summary');
    if (pauseSummary) {
      const acidic = avgPh < 5.6;
      const distBadges =
        this.mode === 'PULP_RESCUE'
          ? `<span class="pill-badge" style="border-color:#f59e0b;color:#fde68a;">Target 85% (${cleanPct}%)</span>`
          : this.session.cartridge.districts
              .map((_d, idx) => {
                const sealed = this.session.sealedDistricts[idx];
                const dPct = Math.round(this.session.grid.getDistrictCleanRatio(idx) * 100);
                return `<span class="pill-badge" style="border-color:${sealed ? '#38bdf8' : 'rgba(148,184,204,0.22)'};color:${sealed ? '#bae6fd' : '#cbd5e1'};">${sealed ? '✓' : `D${idx + 1}`} ${dPct}%</span>`;
              })
              .join('');
      pauseSummary.innerHTML = `
        <span class="pill-badge">Sites ${restored}/${this.session.sites.length}</span>
        <span class="pill-badge" style="border-color:${acidic ? '#f59e0b' : 'rgba(56,189,248,0.35)'};color:${acidic ? '#fde68a' : '#e0f2fe'};">${acidic ? '⚠️' : '✓'} pH ${avgPh.toFixed(1)}</span>
        ${distBadges}
        ${this.mechanicBadgeEl && this.mechanicBadgeEl.style.display !== 'none' ? `<span class="pill-badge">${this.mechanicBadgeEl.textContent}</span>` : ''}
        ${this.mode === 'PULP_RESCUE' ? `<span class="pill-badge">⏱ ${Math.ceil(this.session.getRemainingRescueSec())}s left</span>` : ''}
        <span class="pill-badge">${syn.toFixed(2)}x • ${preview.totalScore}</span>
      `;
    }
  }

  private buildPauseSheet(): void {
    if (!this.container || !this.audio) return;
    const a = this.audio;
    const tip =
      this.mode === 'PULP_RESCUE'
        ? 'Clean the pulp room to 85% before time runs out. If time runs out, the tooth gets a safe patch. You never lose it.'
        : this.session.cartridge.challengeBlurb ??
          'Scrub the enamel to 100%, bring back all the helper germs, and seal each zone with fluoride.';
    const dentalLesson = getWorldDentalLesson(this.session.cartridge.id, this.mode);
    const escTxt = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const muted = a.isMuted();
    const reduced = a.isReducedMotion();
    const steer = this.input.isPointerSteerEnabled();
    const openLessonAttr = this.isCompactScreen() ? '' : ' open';
    const sheet = document.createElement('div');
    sheet.className = 'modal-backdrop ui-interactive';
    sheet.id = 'hud-pause-sheet';
    sheet.style.display = 'none';
    sheet.innerHTML = `
      <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="pause-sheet-title">
        <div class="row-between modal-header-sticky" style="margin-bottom:6px;">
          <h3 id="pause-sheet-title" style="margin:0;font-size:0.96rem;">⏸ Paused</h3>
          <div class="row-wrap">
            <button type="button" id="btn-pause-resume" class="btn btn-sm btn-primary">▶ Resume</button>
            <button type="button" id="btn-pause-resume-x" class="btn btn-sm btn-icon" aria-label="Resume Game">✕</button>
          </div>
        </div>
        <p id="pause-objective" class="pause-objective"></p>
        <div id="pause-telemetry-summary" class="row-wrap" style="margin:0 0 6px 0;gap:5px;"></div>
        <div class="row-wrap pause-primary-actions" style="margin:0 0 6px 0;gap:6px;">
          <button type="button" id="btn-pause-restart" class="btn btn-sm">↻ Restart Dive</button>
          <button type="button" id="btn-pause-exit" class="btn btn-sm">← Exit to Hub</button>
          <button type="button" id="btn-pause-mute" aria-pressed="${muted ? 'true' : 'false'}" class="btn btn-sm ${muted ? '' : 'btn-primary'}">${muted ? '🔇 Muted' : '🔊 Sound On'}</button>
          <button type="button" id="btn-pause-steer" aria-pressed="${steer ? 'true' : 'false'}" class="btn btn-sm ${steer ? 'btn-primary' : ''}">${steer ? '🎯 Steer: ON' : '🎯 Steer: OFF'}</button>
        </div>
        <div class="audio-block pause-audio-grid" style="margin-bottom:6px;">
          <label class="audio-slider-row"><span>Music</span>
            <input type="range" id="pause-music" aria-label="Music Volume" min="0" max="100" value="${Math.round(a.getMusicVolume() * 100)}" />
          </label>
          <label class="audio-slider-row"><span>SFX</span>
            <input type="range" id="pause-sfx" aria-label="SFX Volume" min="0" max="100" value="${Math.round(a.getSfxVolume() * 100)}" />
          </label>
        </div>
        <div class="row-wrap" style="margin:0 0 6px 0;gap:6px;">
          <button type="button" id="btn-pause-shake" aria-pressed="${reduced ? 'true' : 'false'}" class="btn btn-sm ${reduced ? 'btn-primary' : ''}">${reduced ? '✓ Reduced Shake: ON' : 'Reduced Shake: OFF'}</button>
          <button type="button" id="btn-pause-quality" class="btn btn-sm" aria-label="Change Graphics Quality">${this.formatQualityLabel()}</button>
        </div>
        <details id="pause-dental-lesson" class="report-lesson"${openLessonAttr}>
          <summary>🦷 ${escTxt(dentalLesson.headline)} • ${escTxt(dentalLesson.focusTeethBadge)}</summary>
          <div class="report-lesson-body">
            <div id="pause-tip" style="font-size:0.73rem;color:#99f6e4;margin-bottom:4px;">🎯 ${escTxt(tip)}</div>
            <div style="font-size:0.73rem;color:#cbd5e1;line-height:1.36;">${escTxt(dentalLesson.lesson)}</div>
          </div>
        </details>
      </div>`;
    this.container.appendChild(sheet);
    this.pauseSheetEl = sheet;
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) this.setPaused(false);
    });
    const q = <T extends HTMLElement>(sel: string) => sheet.querySelector<T>(sel);
    bindBottomSheetSwipeClose(
      q<HTMLElement>('.modal-header-sticky'),
      q<HTMLElement>('.modal-sheet'),
      () => this.setPaused(false)
    );
    q('#btn-pause-resume')?.addEventListener('click', () => this.setPaused(false));
    q('#btn-pause-resume-x')?.addEventListener('click', () => this.setPaused(false));
    q('#btn-pause-exit')?.addEventListener('click', () => {
      this.setPaused(false);
      this.onExitToHub();
    });
    q('#btn-pause-restart')?.addEventListener('click', () => {
      this.setPaused(false);
      a.restartDive();
    });
    q('#btn-pause-mute')?.addEventListener('click', () => this.toggleMuteUi());
    q('#btn-pause-quality')?.addEventListener('click', () => this.qualityBtnEl?.click());
    q<HTMLInputElement>('#pause-music')?.addEventListener('input', (e) =>
      a.setMusicVolume(Number((e.target as HTMLInputElement).value) / 100)
    );
    q<HTMLInputElement>('#pause-sfx')?.addEventListener('input', (e) =>
      a.setSfxVolume(Number((e.target as HTMLInputElement).value) / 100)
    );
    q('#btn-pause-shake')?.addEventListener('click', () => {
      a.toggleReducedMotion();
      this.syncMotionLabels();
    });
    q('#btn-pause-steer')?.addEventListener('click', (e) => {
      const next = !this.input.isPointerSteerEnabled();
      this.input.setPointerSteerEnabled(next);
      this.syncThumbPadVisibility();
      const label = next ? '🎯 Steer: ON' : '🎯 Steer: OFF';
      const b = e.currentTarget as HTMLElement;
      b.textContent = label;
      b.setAttribute('aria-pressed', next ? 'true' : 'false');
      b.classList.toggle('btn-primary', next);
      if (this.steerBtnEl) {
        this.steerBtnEl.textContent = label;
        this.steerBtnEl.setAttribute('aria-pressed', next ? 'true' : 'false');
      }
    });
  }

  /** Pooled DOM wayfinders (zero draw calls): edge-clamped pills toward remaining objectives. */
  private tickWayfinders(): void {
    const cart = this.session.cartridge;
    const scanActive = this.session.discloseActiveRemaining > 0;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const maxSlots = isCompactViewport(w, h) ? 3 : MAX_WAYFINDERS;
    const targets = selectWayfinderTargets(
      {
        sites: this.session.sites,
        sealedDistricts: this.session.sealedDistricts,
        crystals: this.session.sucroseCrystals,
        domes: cart.epsDomes ?? [],
        domesRemaining: this.session.hasEpsDomes() && this.session.grid.getEpsArmorRemainingRatio() > 0,
        scanActive,
        probe: this.session.probePos,
      },
      maxSlots
    );
    const hudBottom = this.measureTopClearanceBottom();
    const deckTop = this.measureBottomDeckTop();
    const occupied: ScreenBox[] = [];
    if (this.zipScreenBox.active) {
      occupied.push(this.zipScreenBox);
    }
    for (let i = 0; i < this.wayfinders.length; i++) {
      const slot = this.wayfinders[i];
      const t = targets[i];
      if (!t || this.paused) {
        slot.el.style.opacity = '0';
        continue;
      }
      const y = sampleTerrainHeight(cart, t.x, t.z) + 1.4;
      const sp = this.sceneMgr.worldToScreen(t.x, y, t.z);
      // Behind the camera projects mirrored; flip so the arrow still points the right way
      const px = sp.visible ? sp.x : w - sp.x;
      const py = sp.visible ? sp.y : h - sp.y;
      // keep clear of the top HUD and bottom thumb deck
      const c = clampToScreen(px, py, w, h, 54, !sp.visible);
      const deg = (c.angleRad * 180) / Math.PI;
      if (slot.kind !== t.kind || !slot.el.firstChild) {
        slot.kind = t.kind;
        slot.el.innerHTML = `<span class="wf-arrow">➤</span><span class="wf-label">${WAYFINDER_ICON[t.kind]}</span>`;
      }
      slot.el.classList.toggle('wf-edge', !c.onScreen);
      const arrow = slot.el.firstChild as HTMLElement | null;
      if (arrow) {
        arrow.style.display = c.onScreen ? 'none' : '';
        arrow.style.transform = `rotate(${deg.toFixed(0)}deg)`;
      }
      const pillW = slot.el.offsetWidth || 84;
      const pillH = slot.el.offsetHeight || 22;
      const halfW = Math.min(w * 0.45, pillW * 0.5);
      const halfH = pillH * 0.5;
      const clampedX = Math.max(halfW + 6, Math.min(w - halfW - 6, c.x));
      const labelY = findWayfinderLabelY(
        { cx: clampedX, cy: c.onScreen ? c.y - 18 : c.y, halfW, halfH },
        hudBottom,
        deckTop,
        occupied
      );
      if (labelY === null) {
        slot.el.style.opacity = '0';
        continue;
      }
      occupied.push({ cx: clampedX, cy: labelY, halfW, halfH });
      slot.el.style.transform = `translate3d(${clampedX.toFixed(1)}px, ${labelY.toFixed(1)}px, 0) translate(-50%, -50%)`;
      slot.el.style.opacity = '1';
    }
    this.frameOccupiedBoxes = occupied;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
    window.removeEventListener('resize', this.resizeHandler);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    window.removeEventListener('blur', this.blurHandler);
    if (this.paused) this.audio?.setPaused(false);
    this.disposers.disposeAll();
    this.calloutLayer?.remove();
    this.calloutLayer = null;
    this.callouts = [];
    this.container?.remove();
    this.container = null;
  }
}
