import { SMILE_ON_U_CHARITY } from '../config/charityInfo';
import {
  formatToothBadge,
  getCompanionCrownSummary,
  getToothByUniversal,
  QUADRANT_NUMBERING_META,
  TOOTH_SURFACES_GUIDE,
  type ToothNumberingSystem,
  buildSpotQuizQuestion,
  getToothLayer,
  judgeSpotQuizAnswer,
  TOOTH_CROSS_SECTION_LAYERS,
  type SpotQuizQuestion,
  type ToothLayerInfo,
} from '../config/dentalChart';
import { SMOOTH_BASK_THRESHOLD } from '../config/gameConfig';
import {
  getHistoryNoteById,
  getHostCityById,
  HISTORICAL_FIELD_NOTES,
  HOST_CITIES,
  REALISTIC_SKIN_TONES,
} from '../config/hostsAndHistory';
import { UPGRADE_CATALOG } from '../config/upgrades';
import { CompanionArchSim } from '../engine/companion/CompanionArchSim';
import { DisposerBag, type EventBus } from '../engine/EventBus';
import { truncateDisplayName, type SaveSystem } from '../engine/persistence/SaveSystem';
import type { HubCameraFocus } from '../engine/render/SceneManager';
import type { OverlayView } from '../engine/types';
import { getCartridgeById, isPlayableWorld } from '../worlds/worldRegistry';
import {
  bindBottomSheetSwipeClose,
  countAffordableLockedUpgrades,
  isCampaignWorldUnlocked,
  isCompactViewport,
  loadSeenHints,
  pickRecommendedDiveWorld,
  saveSeenHints,
  shouldShowHubWelcome,
} from './hudHelpers';

type ActiveModal = 'none' | 'profile' | 'lab' | 'history' | 'sync' | 'charity' | 'chart';

const FOCUSABLE_SEL =
  'a[href], button:not([disabled]), summary, input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class CompanionHubOverlay implements OverlayView {
  private disposers = new DisposerBag();
  private container: HTMLElement | null = null;
  private tab: HubCameraFocus = 'companion';
  private selectedCityId = 'toronto';
  private activeModal: ActiveModal = 'none';
  private statusBanner = '';
  private seenHints = loadSeenHints();
  private modalOpenerSelector: string | null = null;
  private chartSystem: ToothNumberingSystem = 'universal';
  private viewOffCenter = false;
  private chartTab: 'chart' | 'quiz' | 'anatomy' = 'chart';
  private quizTarget: SpotQuizQuestion | null = null;
  private quizStreak = 0;
  private quizBest = 0;
  private quizFeedback: { ok: boolean; text: string } | null = null;
  private selectedLayer: ToothLayerInfo['id'] = 'enamel';
  private selectedUniversalTooth = 3;
  private lastTouchedCrownIdx: number | null = null;
  private confirmResetPending = false;
  private mobileDrawerOpen = false;

  private keyHandler = (e: KeyboardEvent): void => {
    if (this.activeModal === 'none') return;
    if (e.key === 'Escape' && !e.repeat) {
      e.preventDefault();
      this.closeActiveModal();
      return;
    }
    if (e.key === 'Tab') {
      const sheet = this.container?.querySelector<HTMLElement>('.modal-sheet');
      if (!sheet) return;
      const items = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SEL));
      if (items.length === 0) return;
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
  };

  constructor(
    private readonly bus: EventBus,
    private readonly saveSys: SaveSystem,
    private readonly actions: {
      onTabChanged: (tab: HubCameraFocus, cityId: string) => void;
      onLaunchArcadeWorld: (worldId: string) => void;
      onLaunchPulpRescue: () => void;
      onLaunchBrushAlong: () => void;
      onReplayCosmicIntro: () => void;
      onPlaySparkleSfx: () => void;
      onPlayToothChime?: (step: number) => void;
      onHighlightCrown?: (toothIndex: number | null) => void;
      onResetCompanionView?: () => void;
      isCompanionViewOffCenter?: () => boolean;
      onPlayTreatSfx: () => void;
      onTreatSplat?: () => number;
      getSplatCount?: () => number;
      onPlayUiTap: () => void;
      isMuted: () => boolean;
      onToggleMute: () => void;
      getMusicVolume?: () => number;
      setMusicVolume?: (v: number) => void;
      getSfxVolume?: () => number;
      setSfxVolume?: (v: number) => void;
      isReducedMotion?: () => boolean;
      onToggleReducedMotion?: () => void;
    }
  ) {}

  mount(root: HTMLElement): void {
    const save = this.saveSys.getSave();
    CompanionArchSim.reconcileOfflineElapsed(save.companion, Date.now());
    this.selectedCityId = save.playerProfile.homeCityId || 'toronto';

    this.container = document.createElement('div');
    this.container.className = 'hub-shell companion-hub';
    root.appendChild(this.container);

    this.disposers.add(
      this.bus.on('save:updated', () => {
        if (this.activeModal === 'none') {
          this.render();
        }
      })
    );
    this.disposers.add(this.bus.on('audio:changed', () => this.syncMuteUi()));
    this.disposers.add(this.bus.on('motion:changed', () => this.syncReducedMotionUi()));
    window.addEventListener('keydown', this.keyHandler);

    this.actions.onTabChanged(this.tab, this.selectedCityId);
    this.render();
  }

  private dismissWelcome(): void {
    if (this.seenHints.has('hub_welcome')) return;
    this.seenHints.add('hub_welcome');
    saveSeenHints(this.seenHints);
  }

  private syncMuteUi(): void {
    if (!this.container) return;
    const muted = this.actions.isMuted();
    const topBtn = this.container.querySelector<HTMLButtonElement>('#btn-toggle-mute');
    if (topBtn) {
      topBtn.textContent = muted ? '🔇' : '🔊';
      topBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    }
    const modalBtn = this.container.querySelector<HTMLButtonElement>('#btn-modal-mute');
    if (modalBtn) {
      modalBtn.textContent = muted ? '🔇 Muted' : '🔊 On';
      modalBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
      modalBtn.classList.toggle('btn-primary', !muted);
    }
  }

  private syncReducedMotionUi(): void {
    const btn = this.container?.querySelector<HTMLButtonElement>('#btn-toggle-reduce-motion');
    if (!btn) return;
    const on = Boolean(this.actions.isReducedMotion?.());
    btn.textContent = on ? '✓ Reduced Shake: ON' : 'Reduced Shake: OFF';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('btn-primary', on);
  }

  private openModal(modal: Exclude<ActiveModal, 'none'>, openerSel: string): void {
    this.modalOpenerSelector = openerSel;
    this.activeModal = modal;
    this.render();
    this.container?.querySelector<HTMLElement>('#btn-close-modal')?.focus();
  }

  private closeActiveModal(): void {
    const closingModal = this.activeModal;
    if (closingModal === 'profile') {
      const inp = this.container?.querySelector<HTMLInputElement>('#inp-host-name');
      if (inp) {
        const save = this.saveSys.getSave();
        const cleaned = truncateDisplayName(inp.value.trim()) || save.playerProfile.displayName || 'Explorer';
        if (cleaned !== save.playerProfile.displayName) {
          save.playerProfile.displayName = cleaned;
          this.saveSys.save(save);
        }
      }
    }
    const opener = this.modalOpenerSelector;
    this.modalOpenerSelector = null;
    this.activeModal = 'none';
    this.confirmResetPending = false;
    if (closingModal === 'chart') {
      const sel = getToothByUniversal(this.selectedUniversalTooth);
      if (sel.companionArchIndex !== null) {
        this.lastTouchedCrownIdx = sel.companionArchIndex;
        this.actions.onHighlightCrown?.(sel.companionArchIndex);
      }
    }
    this.render();
    if (opener) this.container?.querySelector<HTMLElement>(opener)?.focus();
  }

  private refreshLabUpgrade(upgradeId: string): void {
    const scrollTop = this.container?.querySelector('.modal-sheet')?.scrollTop ?? 0;
    this.render();
    const sheet = this.container?.querySelector('.modal-sheet');
    if (sheet) sheet.scrollTop = scrollTop;
    const equipButton = sheet?.querySelector<HTMLButtonElement>(`[data-equip-id="${CSS.escape(upgradeId)}"]`);
    equipButton?.focus({ preventScroll: true });
    equipButton?.scrollIntoView({ block: 'nearest' });
  }

  /** Called when the player taps a city pin directly on the 3D Earth globe. */
  selectCityFromGlobe(cityId: string): void {
    if (this.tab !== 'globe') return;
    this.selectedCityId = cityId;
    this.actions.onPlayUiTap();
    this.actions.onTabChanged('globe', this.selectedCityId);
    this.render();
  }

  /** Re-render drops focus; put keyboard players back on the city they just picked. */
  private focusCityPill(cityId: string): void {
    const pill = this.container?.querySelector<HTMLElement>(`[data-city-id="${cityId}"]`);
    if (!pill) return;
    pill.focus({ preventScroll: true });
    pill.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }

  setStatusBanner(text: string): void {
    this.statusBanner = text;
    if (this.activeModal === 'none') this.render();
  }

  /** Collapses the mobile secondary drawer in O(1) without rebuilding DOM during active 3D touch/orbit. */
  private collapseMobileDrawerInPlace(): void {
    if (!this.mobileDrawerOpen) return;
    this.mobileDrawerOpen = false;
    const deck = this.container?.querySelector<HTMLElement>('.hub-bottom-deck');
    deck?.classList.remove('drawer-open');
    const toggle = this.container?.querySelector<HTMLButtonElement>('#btn-toggle-hub-drawer');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = this.tab === 'globe' ? '▴ Info' : '▴ More';
    }
  }

  /**
   * Live educational readout when the player taps or rubs a sculpted 3D crown on the Companion Arch.
   * Updates only the lightweight readout slot (`O(1)` when staying on the same crown) so rubbing never
   * interrupts pointer tracking or rebuilds the Hub DOM.
   */
  notifyToothTouched(toothIndex: number): void {
    if (this.tab !== 'companion' || this.activeModal !== 'none') return;
    this.collapseMobileDrawerInPlace();
    if (this.lastTouchedCrownIdx === toothIndex) return;
    this.lastTouchedCrownIdx = toothIndex;
    const summary = getCompanionCrownSummary(toothIndex);
    this.selectedUniversalTooth = summary.upperTooth.universal;

    const callout = this.container?.querySelector<HTMLElement>('.hub-center-callout');
    callout?.classList.add('has-tooth-readout');
    const slot = this.container?.querySelector<HTMLElement>('#hub-tooth-readout-slot');
    if (slot) {
      slot.innerHTML = this.buildTouchedCrownPillHtml();
      this.bindTouchedCrownPill();
    }
  }

  private buildTouchedCrownPillHtml(): string {
    if (this.tab !== 'companion') return '';
    const resetBtn = this.viewOffCenter
      ? `<div style="margin-top:6px;"><button type="button" id="btn-reset-view" class="btn btn-sm ui-interactive" aria-label="Reset 3D view to center">⟲ Reset View</button></div>`
      : '';
    if (this.lastTouchedCrownIdx === null) return resetBtn;
    const s = getCompanionCrownSummary(this.lastTouchedCrownIdx);
    return `${resetBtn}
      <div style="margin-top:6px;">
        <button
          type="button"
          id="btn-inspect-touched-tooth"
          class="btn btn-sm tooth-readout-pill ui-interactive"
          title="Open Interactive 32-Tooth Dental Chart on this tooth"
        >
          <span>🦷 <strong>${escapeHtml(s.toothTypeLabel)}</strong> • US #${s.upperTooth.universal}/#${s.lowerTooth.universal} • FDI ${s.upperTooth.fdi}/${s.lowerTooth.fdi}</span>
          <span style="color:#fde68a;font-weight:700;">Chart →</span>
        </button>
      </div>
    `;
  }

  /** Called when the 3D Companion view is orbited away from (or back to) its default framing. */
  setViewOffCenter(off: boolean): void {
    if (off) this.collapseMobileDrawerInPlace();
    if (this.viewOffCenter === off) return;
    this.viewOffCenter = off;
    if (this.tab !== 'companion' || this.activeModal !== 'none') return;
    const slot = this.container?.querySelector<HTMLElement>('#hub-tooth-readout-slot');
    if (slot) {
      slot.innerHTML = this.buildTouchedCrownPillHtml();
      this.bindTouchedCrownPill();
    }
  }

  private bindTouchedCrownPill(): void {
    this.container?.querySelector('#btn-reset-view')?.addEventListener('click', () => {
      this.actions.onPlayUiTap();
      this.actions.onResetCompanionView?.();
      this.setViewOffCenter(false);
    });
    this.container?.querySelector('#btn-inspect-touched-tooth')?.addEventListener('click', () => {
      this.actions.onPlayUiTap();
      this.openModal('chart', '#btn-open-chart');
    });
  }

  private rerenderModalKeepingScroll(focusSel: string): void {
    const prevScroll = this.container?.querySelector<HTMLElement>('.modal-sheet')?.scrollTop ?? 0;
    this.render();
    const nextSheet = this.container?.querySelector<HTMLElement>('.modal-sheet');
    if (nextSheet) nextSheet.scrollTop = prevScroll;
    this.container?.querySelector<HTMLElement>(focusSel)?.focus();
  }

  private render(): void {
    if (!this.container) return;
    const save = this.saveSys.getSave();
    const comp = save.companion;
    const skin =
      REALISTIC_SKIN_TONES[save.playerProfile.skinToneIndex] ?? REALISTIC_SKIN_TONES[3];
    const homeCity = getHostCityById(save.playerProfile.homeCityId);
    const activeCity = getHostCityById(this.selectedCityId);

    const needsPulpRescue = comp.pulpIntegrity <= 0;
    const inSmoothBask = comp.smoothnessIndex >= SMOOTH_BASK_THRESHOLD && !needsPulpRescue;

    const floatingStatusText = needsPulpRescue
      ? '🚨 Pulp Shield Breached! Scramble HYDRA-1 to Avoid the Dreaded Root Canal!'
      : inSmoothBask
        ? '✨ Mirror-Wet Smooth Bask Active • Crystallizing +6 Fluoride Ions/hr'
        : comp.enamelShield < 100
          ? '⚠️ Sticky Treat Acid Load Active • Brush-Along or Dive to Remineralize!'
          : '💧 Saliva Stasis Protected • Rub or Tap the 3D Teeth • Drag Gums to Orbit';

    const splatCount = this.actions.getSplatCount?.() ?? 0;
    const splatHint =
      this.tab === 'companion' && splatCount > 0
        ? `<div class="splat-hint-pill">🫧 Rub ${splatCount} sugar splat${splatCount > 1 ? 's' : ''} off the 3D teeth — or Brush-Along / Dive to clear!</div>`
        : '';
    const globeHint =
      this.tab === 'globe'
        ? `<div class="splat-hint-pill">🌍 Tap a glowing city pin on the 3D globe to pick your next dive</div>`
        : '';
    const welcomeTipHtml =
      this.tab === 'companion' &&
      shouldShowHubWelcome(this.seenHints, save.totalBrushStamps, Boolean(save.worlds.world_1?.completed))
        ? `
          <div id="hub-welcome-tip" class="welcome-tip-card ui-interactive" role="region" aria-label="First-Run Guide">
            <div class="welcome-tip-copy">
              <strong style="color:#5eead4;">👋 First Time?</strong>
              <span class="mob-hide"> Rub the 3D teeth to hear them chime, run a <strong>2-Min Sink Brush-Along</strong>, or tap <strong>Dive: Plaque City</strong>!</span>
              <span class="mob-only"> Rub 3D teeth to chime, run 2-Min Brush, or Dive!</span>
            </div>
            <button type="button" id="btn-dismiss-welcome" class="btn btn-sm btn-primary">Got it ✓</button>
          </div>
        `
        : '';
    const muted = this.actions.isMuted();
    const hasToothReadout = this.tab === 'companion' && this.lastTouchedCrownIdx !== null;
    const showStatusPill = !(splatHint && !needsPulpRescue) && !welcomeTipHtml && !(this.tab === 'globe' && globeHint);

    const bottomDeckHtml =
      this.tab === 'companion'
        ? this.buildCompanionDeckHtml()
        : this.buildGlobeCampaignDeckHtml(activeCity.id);

    this.container.innerHTML = `
      <div class="hub-top-bar glass-card ui-interactive">
        <div class="row-between hub-header-row-1">
          <button type="button" id="btn-open-profile" class="btn btn-sm hub-profile-btn" aria-label="Host Profile: ${escapeHtml(save.playerProfile.displayName)}" title="Customize Host & Skin Tone">
            <span style="width:14px;height:14px;border-radius:50%;background:${skin.hex};border:1px solid #fff;display:inline-block;flex-shrink:0;"></span>
            <span class="hub-profile-label">${escapeHtml(save.playerProfile.displayName)} • ${escapeHtml(homeCity.city)}</span>
          </button>

          <div class="row-wrap hub-currency-row">
            <span class="pill-badge" title="Fluoride Ions (Currency)">✦ <strong id="val-ions">${save.fluorideIons}</strong><span class="currency-lbl"> Ions</span></span>
            <span class="pill-badge" title="Monotonic Habit Stamps (Never lost on missed days!)">🦷 <strong id="val-stamps">${save.totalBrushStamps}</strong><span class="currency-lbl"> Stamps</span></span>
            <button
              type="button"
              id="btn-toggle-mute"
              class="btn btn-sm btn-icon"
              aria-label="Toggle Sound (M)"
              aria-pressed="${muted ? 'true' : 'false'}"
              title="Mute / Unmute (M)"
            >
              ${muted ? '🔇' : '🔊'}
            </button>
          </div>
        </div>

        <div class="row-between hub-header-row-2" style="margin-top:7px;">
          <div class="seg-tabs hub-mode-tabs" role="tablist" aria-label="Hub View">
            <button
              type="button"
              id="tab-companion"
              role="tab"
              aria-selected="${this.tab === 'companion' ? 'true' : 'false'}"
              class="seg-tab ${this.tab === 'companion' ? 'active' : ''}"
            >
              <span class="mob-hide">🦷 Smooth Bask</span><span class="mob-only">🦷 Bask</span>
            </button>
            <button
              type="button"
              id="tab-globe"
              role="tab"
              aria-selected="${this.tab === 'globe' ? 'true' : 'false'}"
              class="seg-tab ${this.tab === 'globe' ? 'active' : ''}"
            >
              <span class="mob-hide">🌍 Earth Campaign</span><span class="mob-only">🌍 Globe</span>
            </button>
          </div>
          <div class="hub-bonus-readout" style="font-size:0.72rem;color:var(--text-muted);">
            ${save.remineralizedOverdriveRuns > 0 ? `⚡ Overdrive (${save.remineralizedOverdriveRuns}) ` : ''}
            ${save.pendingSupplyBeacons > 0 ? `📡 Beacons (${save.pendingSupplyBeacons})` : ''}
          </div>
        </div>
      </div>

      <div class="hub-center-callout${hasToothReadout ? ' has-tooth-readout' : ''}">
        ${showStatusPill ? `<div class="bask-floating-pill">
          ${floatingStatusText}
        </div>` : ''}
        <div id="hub-tooth-readout-slot">${this.buildTouchedCrownPillHtml()}</div>
        ${splatHint}${globeHint}
        ${welcomeTipHtml}
        ${
          this.statusBanner
            ? `<div role="status" aria-live="polite" class="hub-status-banner">${escapeHtml(this.statusBanner)}</div>`
            : ''
        }
      </div>

      <div class="hub-bottom-deck glass-card ui-interactive${this.mobileDrawerOpen ? ' drawer-open' : ''}">
        ${bottomDeckHtml}
      </div>

      ${this.activeModal !== 'none' ? this.buildModalHtml() : ''}
    `;

    this.bindEvents();
  }

  private buildCompanionDeckHtml(): string {
    const save = this.saveSys.getSave();
    const comp = save.companion;
    const homeCity = getHostCityById(save.playerProfile.homeCityId);
    const treat = homeCity.signatureTreat;
    const needsPulpRescue = comp.pulpIntegrity <= 0;
    const fallbackHomeWorldId = isPlayableWorld(homeCity.worldId) ? homeCity.worldId : 'world_1';
    const divePick = pickRecommendedDiveWorld(save.worlds, fallbackHomeWorldId);
    const diveWorldId = isPlayableWorld(divePick.worldId) ? divePick.worldId : fallbackHomeWorldId;
    const diveWorldTitle = getCartridgeById(diveWorldId).title;
    const diveStageTag = divePick.stageNumber !== null ? `W${divePick.stageNumber}` : '';
    const affordableLabCount = countAffordableLockedUpgrades(
      save.fluorideIons,
      save.unlockedUpgrades,
      UPGRADE_CATALOG
    );

    const meters = [
      {
        label: 'Smooth',
        val: Math.round(comp.smoothnessIndex),
        color: comp.smoothnessIndex >= SMOOTH_BASK_THRESHOLD ? '#2dd4bf' : '#38bdf8',
      },
      { label: 'Enamel', val: Math.round(comp.enamelShield), color: '#67e8f9' },
      { label: 'Dentin', val: Math.round(comp.dentinShield), color: '#fbbf24' },
      {
        label: 'Pulp',
        val: Math.round(comp.pulpIntegrity),
        color: comp.pulpIntegrity <= 25 ? '#fb7185' : '#34d399',
      },
    ];

    const reservoirHtml =
      comp.unclaimedIdleIons > 0
        ? `<button type="button" id="btn-claim-reservoir" class="btn btn-gold btn-sm" style="width:100%;">
            ✨ Claim +${comp.unclaimedIdleIons} Smooth-Bask Crystallized Fluoride Ions
          </button>`
        : '';

    return `
      <div class="shield-grid">
        ${meters
          .map(
            (m) => `
          <div class="mini-meter">
            <div class="mini-meter-label">
              <span>${m.label}</span>
              <strong style="color:#fff;">${m.val}%</strong>
            </div>
            <div class="mini-meter-bar">
              <div class="mini-meter-fill" style="width:${m.val}%;background:${m.color};"></div>
            </div>
          </div>
        `
          )
          .join('')}
      </div>

      ${reservoirHtml}

      <div class="hub-actions-primary hub-dock-row">
        <button type="button" id="btn-start-brush-along" class="btn btn-primary">
          <span class="mob-hide">🪥 2 min Brush • Pick • Rinse</span><span class="mob-only">🪥 2m Brush</span>
        </button>
        ${
          needsPulpRescue
            ? `<button type="button" id="btn-launch-rescue" class="btn btn-danger">
                <span class="mob-hide">🚨 90s Pulp Rescue!</span><span class="mob-only">🚨 Rescue!</span>
              </button>`
            : `<button type="button" id="btn-launch-arcade" class="btn btn-primary" data-world-id="${diveWorldId}" title="Dive: ${escapeHtml(diveWorldTitle)}">
                <span class="mob-hide">🚀 Dive${diveStageTag ? ` (${diveStageTag})` : ''}: ${escapeHtml(diveWorldTitle)}</span><span class="mob-only">🚀 Dive${diveStageTag ? ` ${diveStageTag}` : ''}</span>
              </button>`
        }
        <button
          type="button"
          id="btn-toggle-hub-drawer"
          class="btn btn-sm hub-drawer-toggle${affordableLabCount > 0 && !this.mobileDrawerOpen ? ' has-badge' : ''}"
          aria-expanded="${this.mobileDrawerOpen ? 'true' : 'false'}"
          aria-label="Toggle Treats, Lab, Chart, and Sync Menu"
        >${this.mobileDrawerOpen ? '▾ Less' : affordableLabCount > 0 ? `▴ More • ${affordableLabCount}` : '▴ More'}</button>
      </div>

      <div class="hub-drawer-collapsible">
        <div class="row-between" style="flex-wrap:wrap;">
          <button type="button" id="btn-feed-treat" class="btn btn-sm" title="${escapeHtml(treat.phDropNote)}">
            ${treat.emoji} Treat: ${escapeHtml(treat.name)} (+20 Ions)
          </button>

          <div class="row-wrap">
            <button type="button" id="btn-open-lab" class="btn btn-sm${affordableLabCount > 0 ? ' btn-gold' : ''}">🔬 Lab${affordableLabCount > 0 ? ` (${affordableLabCount})` : ''}</button>
            <button type="button" id="btn-open-history" class="btn btn-sm">📜 History</button>
            <button type="button" id="btn-open-chart" class="btn btn-sm" title="Interactive 32-Tooth Dental Numbering Chart (Universal #1–32, FDI & Palmer)">🦷 Chart</button>
            <button type="button" id="btn-open-sync" class="btn btn-sm">☁️ Sync</button>
            <button type="button" id="btn-replay-cosmic" class="btn btn-sm" title="Replay Cosmic Enamel & Diamond Intro">✦ Cosmic</button>
            <button type="button" id="btn-open-charity" class="btn btn-sm btn-charity-pill" title="Enjoyed MouthLife? Support SmileOnU 501(c)(3) Charitable Dental Care">💛 SmileOnU</button>
          </div>
        </div>
      </div>
    `;
  }

  private buildGlobeCampaignDeckHtml(cityId: string): string {
    const save = this.saveSys.getSave();
    const city = getHostCityById(cityId);
    const rec = save.worlds[city.worldId];
    const hist = getHistoryNoteById(city.historyNoteId);
    const stampUnlocked = save.totalBrushStamps >= city.unlockStampsRequired;

    const campaignIds = ['world_1', 'world_2', 'world_3', 'world_4', 'world_5'];
    const cleared = campaignIds.filter((id) => save.worlds[id]?.completed).length;
    const isCityUnlocked = (c: (typeof HOST_CITIES)[number]): boolean =>
      isCampaignWorldUnlocked(c.worldId, save.worlds, save.totalBrushStamps, c.unlockStampsRequired, campaignIds);
    const worldUnlocked = isCityUnlocked(city);
    const stageIdx = campaignIds.indexOf(city.worldId);
    const prevWorldTitle =
      stageIdx > 0 && isPlayableWorld(campaignIds[stageIdx - 1])
        ? getCartridgeById(campaignIds[stageIdx - 1]).title
        : 'Previous World';
    const gradeBadge = (worldId: string): string => {
      const g = save.worlds[worldId]?.bestGrade;
      if (!g || g === 'NONE') return '';
      return ` <span class="grade-chip grade-${g}">${g === 'FLUORAPATITE_GOLD' ? '★ GOLD' : g}</span>`;
    };

    return `
      <div class="hub-drawer-collapsible globe-drawer-top">
        <div class="row-between" style="flex-wrap:wrap;">
          <div class="campaign-progress" id="campaign-progress" style="margin-bottom:0;">
            ${cleared}/5 Worlds Cleared • ${save.unlockedHistoryNotes.length}/${HISTORICAL_FIELD_NOTES.length} Field Notes • ${save.unlockedUpgrades.length}/${UPGRADE_CATALOG.length} Lab Upgrades${cleared >= campaignIds.length ? ' • 🛰️ Campaign Mastered!' : ''}
          </div>
          <div class="row-wrap">
            <button type="button" id="btn-open-chart" class="btn btn-sm" title="Interactive 32-Tooth Dental Numbering Chart">🦷 Chart</button>
            <button type="button" id="btn-open-charity" class="btn btn-sm btn-charity-pill" title="Enjoyed MouthLife? Support SmileOnU 501(c)(3) Global Dental Relief">💛 SmileOnU</button>
          </div>
        </div>
      </div>
      <div class="city-strip">
        ${HOST_CITIES.map((c) => {
          const unlockedPill = isCityUnlocked(c);
          return `
          <button
            type="button"
            class="city-pill ${c.id === city.id ? 'active' : ''}"
            data-city-id="${c.id}"
            aria-pressed="${c.id === city.id ? 'true' : 'false'}"
          >
            ${unlockedPill ? (c.isOrbital ? '🛰️' : '📍') : '🔒'} ${escapeHtml(c.city)}${gradeBadge(c.worldId)}
          </button>
        `;
        }).join('')}
      </div>

      <div class="hub-drawer-collapsible globe-story-card" style="background:rgba(4,16,28,0.68);border:1px solid rgba(94,234,212,0.2);border-radius:12px;padding:9px 11px;">
        <div class="row-between">
          <div class="row-wrap">
            <span style="width:14px;height:14px;border-radius:50%;background:${city.hostSkinToneHex};border:1px solid #fff;display:inline-block;"></span>
            <strong style="font-size:0.88rem;">${escapeHtml(city.hostName)}</strong>
            <span style="font-size:0.74rem;color:var(--text-muted);">• ${escapeHtml(city.hostRole)}</span>
          </div>
          <span class="pill-badge">${rec?.bestGrade && rec.bestGrade !== 'NONE' ? `Best: ${rec.bestGrade}` : worldUnlocked ? 'Unrated' : '🔒 Locked'}</span>
        </div>
        <p style="margin:5px 0;font-size:0.77rem;color:#cbd5e1;line-height:1.38;">
          ${escapeHtml(city.scenarioSummary)}
        </p>
        ${
          hist
            ? `<div style="font-size:0.72rem;color:#5eead4;">
                📜 <strong>${escapeHtml(hist.yearLabel)}:</strong> ${escapeHtml(hist.title)}
              </div>`
            : ''
        }
      </div>

      <div class="row-between globe-launch-row">
        <span class="globe-blurb-copy" style="font-size:0.74rem;color:var(--text-muted);">
          ${
            city.playableInSlice && isPlayableWorld(city.worldId) && worldUnlocked
              ? `<strong style="color:#5eead4;">${escapeHtml(getCartridgeById(city.worldId).title)}</strong><span class="mob-hide"> • ${escapeHtml(
                  getCartridgeById(city.worldId).challengeBlurb ?? '3 Districts • Brush + Floss Zip + Fluoride Surge'
                )}</span><span class="mob-only"> • ${escapeHtml(city.hostName)}</span>`
              : city.playableInSlice && isPlayableWorld(city.worldId)
                ? `<strong style="color:#fde68a;">🔒 ${escapeHtml(getCartridgeById(city.worldId).title)}</strong> • Clear ${escapeHtml(prevWorldTitle)} or ${city.unlockStampsRequired} Stamps (${save.totalBrushStamps}/${city.unlockStampsRequired})`
                : `<span class="mob-hide">Campaign Expansion Preview • </span>${stampUnlocked ? 'Milestone Reached!' : `Unlocks at ${city.unlockStampsRequired} Stamps`}`
          }
        </span>
        <div class="row-wrap" style="flex-wrap:nowrap;flex-shrink:0;">
          ${
            city.playableInSlice && isPlayableWorld(city.worldId) && worldUnlocked
              ? `<button type="button" id="btn-globe-dive" class="btn btn-primary">
                  <span class="mob-hide">🚀 Dive Into ${escapeHtml(city.city)} →</span><span class="mob-only">🚀 Dive →</span>
                </button>`
              : `<button type="button" id="btn-open-history" class="btn btn-sm">
                  <span class="mob-hide">📜 Read ${escapeHtml(city.city)} Dental History</span><span class="mob-only">📜 History</span>
                </button>`
          }
          <button
            type="button"
            id="btn-toggle-hub-drawer"
            class="btn btn-sm hub-drawer-toggle"
            aria-expanded="${this.mobileDrawerOpen ? 'true' : 'false'}"
            aria-label="Toggle City Story, Dental Chart, and Campaign Progress"
          >${this.mobileDrawerOpen ? '▾ Less' : '▴ Info'}</button>
        </div>
      </div>
    `;
  }

  private buildModalHtml(): string {
    const save = this.saveSys.getSave();

    if (this.activeModal === 'profile') {
      const reduced = Boolean(this.actions.isReducedMotion?.());
      const muted = this.actions.isMuted();
      return `
        <div class="modal-backdrop" id="modal-bg">
          <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="hub-modal-title" onclick="event.stopPropagation()">
            <div class="row-between modal-header-sticky" style="margin-bottom:10px;">
              <h3 id="hub-modal-title" style="margin:0;font-size:1rem;">🧑🏽‍🚀 Host Identity & Inclusive Skin Tone</h3>
              <button type="button" id="btn-close-modal" class="btn btn-sm" aria-label="Close Dialog">✕ Close</button>
            </div>
            <label for="inp-host-name" style="font-size:0.78rem;color:var(--text-muted);display:block;margin-bottom:4px;">Display Name</label>
            <input
              id="inp-host-name"
              type="text"
              maxlength="24"
              value="${escapeHtml(save.playerProfile.displayName)}"
              style="width:100%;padding:8px 10px;border-radius:10px;border:1px solid var(--glass-border);background:#041320;color:#fff;font-size:1rem;margin-bottom:10px;"
            />
            <div style="font-size:0.78rem;color:var(--text-muted);">Realistic Human Skin Tone (Fitzpatrick I–VI)</div>
            <div class="swatch-row">
              ${REALISTIC_SKIN_TONES.map(
                (t, idx) => `
                <button
                  type="button"
                  class="skin-swatch ${idx === save.playerProfile.skinToneIndex ? 'selected' : ''}"
                  style="background:${t.hex};"
                  title="${escapeHtml(t.label)}"
                  aria-label="${escapeHtml(t.label)}"
                  aria-pressed="${idx === save.playerProfile.skinToneIndex ? 'true' : 'false'}"
                  data-skin-idx="${idx}"
                ></button>
              `
              ).join('')}
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:8px;">Home City & Signature Regional Treat</div>
            <div class="row-wrap" style="margin-top:6px;">
              ${HOST_CITIES.map(
                (c) => `
                <button
                  type="button"
                  class="btn btn-sm ${c.id === save.playerProfile.homeCityId ? 'btn-primary' : ''}"
                  aria-pressed="${c.id === save.playerProfile.homeCityId ? 'true' : 'false'}"
                  data-home-city="${c.id}"
                >
                  ${c.signatureTreat.emoji} ${escapeHtml(c.city)}
                </button>
              `
              ).join('')}
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:10px;">Accessibility & Comfort</div>
            <div class="row-between" style="margin-top:6px;background:rgba(4,16,28,0.68);border:1px solid rgba(148,184,204,0.2);border-radius:10px;padding:8px 10px;">
              <span style="font-size:0.78rem;color:#e0f2fe;">Reduce Camera Shake & FOV Punch</span>
              <button
                type="button"
                id="btn-toggle-reduce-motion"
                aria-pressed="${reduced ? 'true' : 'false'}"
                class="btn btn-sm ${reduced ? 'btn-primary' : ''}"
              >
                ${reduced ? '✓ Reduced Shake: ON' : 'Reduced Shake: OFF'}
              </button>
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:10px;">Audio</div>
            <div style="margin-top:6px;background:rgba(4,16,28,0.68);border:1px solid rgba(148,184,204,0.2);border-radius:10px;padding:8px 10px;">
              <div class="row-between" style="margin-bottom:6px;">
                <span style="font-size:0.78rem;color:#e0f2fe;">Sound</span>
                <button
                  type="button"
                  id="btn-modal-mute"
                  aria-pressed="${muted ? 'true' : 'false'}"
                  class="btn btn-sm ${muted ? '' : 'btn-primary'}"
                >
                  ${muted ? '🔇 Muted' : '🔊 On'}
                </button>
              </div>
              <label class="audio-slider-row"><span>Music</span>
                <input type="range" id="rng-music" aria-label="Music Volume" min="0" max="100" value="${Math.round((this.actions.getMusicVolume?.() ?? 0.7) * 100)}" />
              </label>
              <label class="audio-slider-row"><span>SFX</span>
                <input type="range" id="rng-sfx" aria-label="SFX Volume" min="0" max="100" value="${Math.round((this.actions.getSfxVolume?.() ?? 0.85) * 100)}" />
              </label>
            </div>
            <div style="margin-top:14px;text-align:right;">
              <button type="button" id="btn-save-profile" class="btn btn-primary">Save Host Profile</button>
            </div>
          </div>
        </div>
      `;
    }

    if (this.activeModal === 'lab') {
      return `
        <div class="modal-backdrop" id="modal-bg">
          <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="hub-modal-title" onclick="event.stopPropagation()">
            <div class="row-between modal-header-sticky" style="margin-bottom:10px;">
              <h3 id="hub-modal-title" style="margin:0;font-size:1rem;">🔬 Biophysical Actuator Lab (${save.fluorideIons} Ions)</h3>
              <button type="button" id="btn-close-modal" class="btn btn-sm" aria-label="Close Dialog">✕ Close</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${UPGRADE_CATALOG.map((u) => {
                const unlocked = save.unlockedUpgrades.includes(u.id);
                const equipped = save.equippedUpgrades[u.slot] === u.id;
                const otherEquippedInSlot = Boolean(save.equippedUpgrades[u.slot]) && !equipped;
                const sharedSlot = UPGRADE_CATALOG.filter((x) => x.slot === u.slot).length > 1;
                const canAfford = save.fluorideIons >= u.ionCost;
                return `
                  <div style="background:rgba(4,16,28,0.8);border:1px solid ${equipped ? '#2dd4bf' : 'rgba(148,184,204,0.22)'};border-radius:12px;padding:10px;">
                    <div class="row-between">
                      <div>
                        <strong style="font-size:0.88rem;color:#fff;">${escapeHtml(u.name)}</strong>
                        <span class="pill-badge" style="margin-left:5px;">${u.slot.toUpperCase()}${sharedSlot ? ' • 1 ACTIVE' : ''}</span>
                      </div>
                      ${
                        unlocked
                          ? `<button type="button" class="btn btn-sm ${equipped ? 'btn-primary' : ''}" aria-pressed="${equipped ? 'true' : 'false'}" data-equip-id="${u.id}">
                              ${equipped ? '✓ Equipped' : otherEquippedInSlot ? `⇄ Swap ${u.slot[0].toUpperCase()}${u.slot.slice(1)}` : 'Equip'}
                            </button>`
                          : `<button type="button" class="btn btn-sm ${canAfford ? 'btn-gold' : ''}" data-buy-id="${u.id}" ${!canAfford ? 'disabled style="opacity:0.45;"' : ''}>
                              ${otherEquippedInSlot ? `Unlock & Equip (${u.ionCost} Ions)` : `Unlock (${u.ionCost} Ions)`}
                            </button>`
                      }
                    </div>
                    <div style="font-size:0.78rem;color:#bae6fd;margin-top:4px;">${escapeHtml(u.tagline)}</div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">${escapeHtml(u.scientificNote)}</div>
                    <div style="font-size:0.69rem;color:#5eead4;margin-top:4px;">
                      Free Auto-Unlock: ${u.stampUnlockThreshold} Habit Stamps or Clear ${u.worldClearUnlockId?.replace('_', ' ').toUpperCase()}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }

    if (this.activeModal === 'history') {
      return `
        <div class="modal-backdrop" id="modal-bg">
          <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="hub-modal-title" onclick="event.stopPropagation()">
            <div class="row-between modal-header-sticky" style="margin-bottom:10px;">
              <h3 id="hub-modal-title" style="margin:0;font-size:1rem;">📜 Global Dental History & Enamel Almanac</h3>
              <button type="button" id="btn-close-modal" class="btn btn-sm" aria-label="Close Dialog">✕ Close</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${HISTORICAL_FIELD_NOTES.map((n) => {
                const unlocked = save.unlockedHistoryNotes.includes(n.id);
                return `
                  <div style="background:rgba(4,16,28,0.82);border:1px solid ${unlocked ? 'rgba(45,212,191,0.4)' : 'rgba(148,184,204,0.18)'};border-radius:12px;padding:10px;">
                    <div class="row-between">
                      <span style="font-size:0.72rem;font-weight:700;color:#38bdf8;">${escapeHtml(n.yearLabel)} • ${escapeHtml(n.locationLabel)}</span>
                      <span class="pill-badge">${unlocked ? '✓ Discovered' : 'Preview Archive'}</span>
                    </div>
                    <div style="font-weight:700;font-size:0.88rem;margin:4px 0;color:#fff;">${escapeHtml(n.title)}</div>
                    <p style="margin:0 0 5px 0;font-size:0.77rem;color:#cbd5e1;line-height:1.4;">${escapeHtml(n.summary)}</p>
                    <div style="font-size:0.73rem;color:#99f6e4;"><strong>Biophysical Takeaway:</strong> ${escapeHtml(n.enamelLesson)}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }

    if (this.activeModal === 'chart') {
      return this.buildChartModalHtml();
    }

    if (this.activeModal === 'charity') {
      const c = SMILE_ON_U_CHARITY;
      return `
        <div class="modal-backdrop" id="modal-bg">
          <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="hub-modal-title" onclick="event.stopPropagation()">
            <div class="row-between modal-header-sticky" style="margin-bottom:10px;">
              <h3 id="hub-modal-title" style="margin:0;font-size:1rem;">💛 Enjoyed MouthLife? Support Real Smiles!</h3>
              <button type="button" id="btn-close-modal" class="btn btn-sm" aria-label="Close Dialog">✕ Close</button>
            </div>

            <div style="background:rgba(4,16,28,0.84);border:1px solid rgba(251,191,36,0.42);border-radius:12px;padding:11px 12px;margin-bottom:10px;">
              <div class="row-wrap" style="margin-bottom:6px;">
                <span class="pill-badge" style="border-color:rgba(251,191,36,0.55);color:#fde68a;">🦷 ${escapeHtml(c.name)}</span>
                <span class="pill-badge">${escapeHtml(c.legalStatus)}</span>
              </div>
              <div style="font-size:0.76rem;color:#5eead4;font-weight:700;margin-bottom:4px;">${escapeHtml(c.tagline)}</div>
              <p style="margin:0 0 10px 0;font-size:0.79rem;color:#e2e8f0;line-height:1.44;">
                ${escapeHtml(c.missionSummary)}
              </p>
              <div class="hub-actions-primary">
                <a
                  id="lnk-charity-donate"
                  class="btn btn-gold"
                  href="${escapeHtml(c.donateUrl)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  💛 Donate at SmileOnU.org ↗
                </a>
                <a
                  id="lnk-charity-site"
                  class="btn"
                  href="${escapeHtml(c.websiteUrl)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  🌐 Visit SmileOnU.org ↗
                </a>
              </div>
            </div>

            <div style="font-size:0.75rem;font-weight:700;color:#99f6e4;margin-bottom:6px;">🌍 Why Humanitarian Dental Care Matters</div>
            <div class="charity-stat-grid" style="margin-bottom:10px;">
              ${c.needHighlights
                .map(
                  (n) => `
                  <div class="mini-meter" style="padding:7px 8px;">
                    <strong style="display:block;font-size:0.82rem;color:#fde68a;margin-bottom:2px;">${escapeHtml(n.stat)}</strong>
                    <span style="font-size:0.69rem;color:#cbd5e1;line-height:1.3;display:block;">${escapeHtml(n.detail)}</span>
                  </div>
                `
                )
                .join('')}
            </div>

            <div style="font-size:0.75rem;font-weight:700;color:#99f6e4;margin-bottom:6px;">🏥 Core Charitable Programs</div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;">
              ${c.programs
                .map(
                  (p) => `
                  <div style="background:rgba(4,16,28,0.8);border:1px solid rgba(94,234,212,0.25);border-radius:12px;padding:9px 11px;">
                    <div class="row-between" style="flex-wrap:wrap;">
                      <div>
                        <strong style="font-size:0.85rem;color:#fff;">${p.emoji} ${escapeHtml(p.title)}</strong>
                        <div style="font-size:0.69rem;color:#38bdf8;font-weight:600;">${escapeHtml(p.regionLabel)}</div>
                      </div>
                      <a
                        class="btn btn-sm"
                        href="${escapeHtml(p.url)}"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Learn more about ${escapeHtml(p.title)} on SmileOnU.org"
                      >
                        Learn More ↗
                      </a>
                    </div>
                    <p style="margin:5px 0 0 0;font-size:0.75rem;color:#cbd5e1;line-height:1.38;">
                      ${escapeHtml(p.summary)}
                    </p>
                  </div>
                `
                )
                .join('')}
            </div>

            <div style="font-size:0.75rem;font-weight:700;color:#99f6e4;margin-bottom:6px;">🤝 Get Involved, Volunteer &amp; Reach Out</div>
            <div class="row-wrap" style="margin-bottom:8px;">
              ${c.involvementLinks
                .map(
                  (l) => `
                  <a
                    class="btn btn-sm"
                    href="${escapeHtml(l.url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ${escapeHtml(l.label)} ↗
                  </a>
                `
                )
                .join('')}
              <a
                class="btn btn-sm"
                href="${escapeHtml(c.contactMailto)}"
              >
                ✉️ ${escapeHtml(c.contactEmail)}
              </a>
            </div>

            <div class="row-wrap" style="margin-bottom:10px;">
              ${c.socialLinks
                .map(
                  (s) => `
                  <a
                    class="btn btn-sm"
                    href="${escapeHtml(s.url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    🔗 ${escapeHtml(s.label)} ↗
                  </a>
                `
                )
                .join('')}
            </div>

            <p style="margin:0;font-size:0.71rem;color:var(--text-muted);line-height:1.38;">
              ${escapeHtml(c.independenceNote)}
            </p>
          </div>
        </div>
      `;
    }

    // Sync Code Backup Modal
    const syncCode = this.saveSys.exportSyncCode();
    return `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="hub-modal-title" onclick="event.stopPropagation()">
          <div class="row-between modal-header-sticky" style="margin-bottom:10px;">
            <h3 id="hub-modal-title" style="margin:0;font-size:1rem;">☁️ Cross-Device Sync Code (Zero Sign-Up)</h3>
            <button type="button" id="btn-close-modal" class="btn btn-sm" aria-label="Close Dialog">✕ Close</button>
          </div>
          <p style="font-size:0.78rem;color:var(--text-muted);margin-top:0;">
            Copy your portable <code>ML2:</code> Sync Code or download a <code>.mouthlife.json</code> snapshot to carry Habit Stamps & Upgrades between phone and desktop.
          </p>
          <textarea
            id="txt-sync-export"
            aria-label="Exported ML2 Sync Code"
            readonly
            rows="3"
            style="width:100%;border-radius:10px;border:1px solid var(--glass-border);background:#041320;color:#99f6e4;font-size:1rem;padding:8px;"
          >${escapeHtml(syncCode)}</textarea>
          <div class="row-wrap" style="margin:8px 0 12px 0;">
            <button type="button" id="btn-copy-sync" class="btn btn-primary btn-sm">📋 Copy ML2 Code</button>
            <button type="button" id="btn-download-json" class="btn btn-sm">💾 Download .mouthlife.json</button>
            <button type="button" id="btn-copy-beta-diag" class="btn btn-sm" title="Copy device & performance snapshot for beta feedback">🩺 Copy Beta Report</button>
          </div>
          <label for="txt-sync-import" style="font-size:0.78rem;color:var(--text-muted);display:block;margin-bottom:4px;">Import ML2 Sync Code</label>
          <textarea
            id="txt-sync-import"
            placeholder="Paste ML2:... code here"
            rows="2"
            style="width:100%;border-radius:10px;border:1px solid var(--glass-border);background:#041320;color:#fff;font-size:1rem;padding:8px;"
          ></textarea>
          <div id="sync-import-status" role="alert" style="min-height:1.1em;margin-top:6px;font-size:0.76rem;color:#fca5a5;"></div>
          <div class="row-between" style="margin-top:10px;flex-wrap:wrap;gap:8px;border-top:1px solid rgba(94,234,212,0.16);padding-top:10px;">
            <div class="row-wrap" style="gap:6px;">
              <a href="./privacy.html" target="_blank" rel="noopener noreferrer" class="btn btn-sm">🔒 Privacy & Notice ↗</a>
              <button type="button" id="btn-reset-save" class="btn btn-sm" style="${this.confirmResetPending ? 'border-color:#fb7185;color:#fecdd3;' : ''}">
                ${this.confirmResetPending ? '⚠️ Tap Again to Confirm Reset' : '🔄 Reset Save Data'}
              </button>
            </div>
            <div class="row-wrap" style="gap:6px;">
              <button type="button" id="btn-paste-sync" class="btn btn-sm">📋 Paste</button>
              <button type="button" id="btn-apply-sync" class="btn btn-gold btn-sm">Import & Merge</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private buildQuizCardHtml(): string {
    if (!this.quizTarget) this.quizTarget = buildSpotQuizQuestion();
    const fb = this.quizFeedback;
    return `
      <div id="chart-quiz-card" style="background:rgba(4,16,28,0.88);border:1px solid rgba(251,191,36,0.5);border-radius:12px;padding:10px 12px;margin-bottom:10px;">
        <div class="row-between" style="flex-wrap:wrap;gap:6px;margin-bottom:5px;">
          <strong style="font-size:0.78rem;color:#fde68a;">🎯 Optional Practice • no timer, no pressure</strong>
          <span class="pill-badge">🔥 Streak <strong>${this.quizStreak}</strong> • Best <strong>${this.quizBest}</strong></span>
        </div>
        <div id="quiz-prompt" style="font-size:0.95rem;font-weight:700;color:#fff;margin-bottom:6px;">${escapeHtml(this.quizTarget.prompt)}</div>
        <div id="quiz-feedback" role="status" aria-live="polite" style="min-height:1.2em;font-size:0.76rem;color:${fb ? (fb.ok ? '#86efac' : '#fca5a5') : '#94a3b8'};margin-bottom:6px;">${escapeHtml(fb ? fb.text : 'Tap a tooth on the chart below to answer.')}</div>
        <button type="button" id="btn-quiz-next" class="btn btn-sm">⏭ Different tooth</button>
      </div>
    `;
  }

  private buildAnatomyHtml(): string {
    const sel = getToothLayer(this.selectedLayer);
    const fill = (id: ToothLayerInfo['id']) => getToothLayer(id).colorHex;
    const stroke = (id: ToothLayerInfo['id']) => (this.selectedLayer === id ? '#ffffff' : 'rgba(15,23,42,0.6)');
    const sw = (id: ToothLayerInfo['id']) => (this.selectedLayer === id ? 3 : 1.2);
    const shortName: Record<ToothLayerInfo['id'], string> = {
      enamel: 'Enamel',
      dentin: 'Dentin',
      pulp: 'Pulp',
      ligament: 'Sling',
    };
    return `
      <div id="anatomy-panel">
        <svg viewBox="0 0 200 250" role="img" aria-label="Tooth cross-section: enamel, dentin, pulp, and periodontal ligament with cementum" style="width:100%;max-width:230px;height:auto;display:block;margin:0 auto 8px auto;">
          <path d="M20 205 Q10 120 40 80 Q100 20 160 80 Q190 120 180 205 Z" fill="rgba(196,181,253,0.18)" stroke="${stroke('ligament')}" stroke-width="${sw('ligament')}" />
          <path d="M70 100 Q60 150 72 235 Q82 245 92 215 Q100 195 108 215 Q118 245 128 235 Q140 150 130 100 Z" fill="${fill('ligament')}" stroke="${stroke('ligament')}" stroke-width="${sw('ligament')}" />
          <path d="M60 30 Q100 8 140 30 Q158 70 134 108 Q120 140 118 195 Q112 215 106 195 L100 150 L94 195 Q88 215 82 195 Q80 140 66 108 Q42 70 60 30 Z" fill="${fill('dentin')}" stroke="${stroke('dentin')}" stroke-width="${sw('dentin')}" />
          <path d="M60 30 Q100 8 140 30 Q150 50 146 66 Q100 40 54 66 Q50 50 60 30 Z" fill="${fill('enamel')}" stroke="${stroke('enamel')}" stroke-width="${sw('enamel')}" />
          <path d="M82 60 Q100 48 118 60 Q124 90 108 112 Q104 150 102 200 L98 200 Q96 150 92 112 Q76 90 82 60 Z" fill="${fill('pulp')}" stroke="${stroke('pulp')}" stroke-width="${sw('pulp')}" />
        </svg>
        <div class="seg-tabs" role="tablist" aria-label="Tooth Layers" style="margin-bottom:8px;">
          ${TOOTH_CROSS_SECTION_LAYERS.map(
            (ly) =>
              `<button type="button" role="tab" data-layer="${ly.id}" aria-selected="${this.selectedLayer === ly.id ? 'true' : 'false'}" class="seg-tab ${this.selectedLayer === ly.id ? 'active' : ''}">${ly.emoji} ${shortName[ly.id]}</button>`
          ).join('')}
        </div>
        <div style="background:rgba(4,16,28,0.88);border:1px solid rgba(45,212,191,0.45);border-radius:12px;padding:10px 12px;">
          <div class="row-between" style="flex-wrap:wrap;gap:6px;margin-bottom:4px;">
            <strong style="font-size:0.92rem;color:#fff;">${sel.emoji} ${escapeHtml(sel.name)}</strong>
            ${sel.mineralPercent !== null ? `<span class="pill-badge">≈${sel.mineralPercent}% mineral</span>` : '<span class="pill-badge">Living tissue</span>'}
          </div>
          <div style="font-size:0.78rem;color:#5eead4;margin-bottom:4px;">${escapeHtml(sel.tagline)}</div>
          <p style="margin:0 0 4px 0;font-size:0.76rem;color:#e2e8f0;line-height:1.4;">${escapeHtml(sel.detail)}</p>
          <div style="font-size:0.73rem;color:#99f6e4;">🪥 <strong>Care Tip:</strong> ${escapeHtml(sel.careTip)}</div>
        </div>
      </div>
    `;
  }

  private buildChartModalHtml(): string {
    const sel = getToothByUniversal(this.selectedUniversalTooth);
    const shortPosTag: Record<number, string> = {
      1: 'CI',
      2: 'LI',
      3: 'C',
      4: '1P',
      5: '2P',
      6: '1M',
      7: '2M',
      8: '3M',
    };
    const catLabel: Record<string, string> = {
      incisor: 'Incisor (Cutting)',
      canine: 'Canine / Cuspid (Cornerstone)',
      premolar: 'Premolar / Bicuspid (Crushing)',
      molar: sel.isWisdomTooth ? '3rd Molar • Wisdom Tooth' : 'Molar (Heavy Grinding)',
    };

    const renderQuadBox = (qMeta: (typeof QUADRANT_NUMBERING_META)[number]) => {
      const rangeBadge =
        this.chartSystem === 'universal'
          ? qMeta.universalRange
          : this.chartSystem === 'fdi'
            ? qMeta.fdiRange
            : `Palmer ${qMeta.palmerSymbol}`;
      return `
        <div class="dental-quad-box">
          <div class="row-between" style="margin-bottom:5px;flex-wrap:wrap;gap:4px;">
            <strong style="font-size:0.73rem;color:#e0f2fe;">${escapeHtml(qMeta.title)}</strong>
            <span class="pill-badge" style="font-size:0.65rem;padding:2px 7px;">${escapeHtml(rangeBadge)}</span>
          </div>
          <div class="dental-quad-teeth">
            ${qMeta.chartOrderUniversal
              .map((uNum) => {
                const t = getToothByUniversal(uNum);
                const isSel = t.universal === sel.universal;
                const badge = formatToothBadge(t, this.chartSystem);
                return `
                  <button
                    type="button"
                    class="tooth-cell cat-${t.category} ${t.isWisdomTooth ? 'is-wisdom' : ''} ${isSel ? 'selected' : ''}"
                    data-tooth-num="${t.universal}"
                    aria-pressed="${isSel ? 'true' : 'false'}"
                    aria-label="${escapeHtml(t.clinicalName)} — US #${t.universal}, FDI ${t.fdi}, Palmer ${t.palmer}"
                    title="${escapeHtml(t.clinicalName)} (${escapeHtml(t.commonNickname)})"
                  >
                    <span class="tooth-cell-code">${escapeHtml(badge)}</span>
                    <span class="tooth-cell-role">${shortPosTag[t.positionFromMidline]}</span>
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    };

    // Clinical cross order: Top = Q1 (UR) | Q2 (UL); Bottom = Q4 (LR) | Q3 (LL) so Patient's Right stays on the left!
    const q1 = QUADRANT_NUMBERING_META[0];
    const q2 = QUADRANT_NUMBERING_META[1];
    const q3 = QUADRANT_NUMBERING_META[2];
    const q4 = QUADRANT_NUMBERING_META[3];

    return `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal-sheet modal-sheet-wide" role="dialog" aria-modal="true" aria-labelledby="hub-modal-title" onclick="event.stopPropagation()">
          <div class="row-between modal-header-sticky" style="margin-bottom:8px;">
            <h3 id="hub-modal-title" style="margin:0;font-size:1rem;">🦷 How Dentists Number Teeth (32-Tooth Chart)</h3>
            <button type="button" id="btn-close-modal" class="btn btn-sm" aria-label="Close Dialog">✕ Close</button>
          </div>

          <div class="seg-tabs" role="tablist" aria-label="Chart Sections" style="margin-bottom:8px;">
            ${(
              [
                ['chart', '🦷 Chart'],
                ['quiz', '🎯 Spot That Tooth!'],
                ['anatomy', '🔬 Inside a Tooth'],
              ] as const
            )
              .map(
                ([id, label]) => `<button type="button" role="tab" data-chart-tab="${id}" aria-selected="${this.chartTab === id ? 'true' : 'false'}" class="seg-tab ${this.chartTab === id ? 'active' : ''}">${label}</button>`
              )
              .join('')}
          </div>
          ${this.chartTab === 'anatomy' ? this.buildAnatomyHtml() : `
          <div class="row-between" style="flex-wrap:wrap;margin-bottom:8px;">
            <div class="seg-tabs" role="tablist" aria-label="Dental Numbering System">
              <button
                type="button"
                role="tab"
                data-num-sys="universal"
                aria-selected="${this.chartSystem === 'universal' ? 'true' : 'false'}"
                class="seg-tab ${this.chartSystem === 'universal' ? 'active' : ''}"
              >🇺🇸 US (#1–32)</button>
              <button
                type="button"
                role="tab"
                data-num-sys="fdi"
                aria-selected="${this.chartSystem === 'fdi' ? 'true' : 'false'}"
                class="seg-tab ${this.chartSystem === 'fdi' ? 'active' : ''}"
              >🌍 FDI (11–48)</button>
              <button
                type="button"
                role="tab"
                data-num-sys="palmer"
                aria-selected="${this.chartSystem === 'palmer' ? 'true' : 'false'}"
                class="seg-tab ${this.chartSystem === 'palmer' ? 'active' : ''}"
              >┼ Palmer</button>
            </div>
            <span style="font-size:0.71rem;color:var(--text-muted);">
              👀 Chart faces the patient: <strong>Patient’s Right</strong> is on the left!
            </span>
          </div>

          ${this.chartTab === 'quiz' ? this.buildQuizCardHtml() : ''}

          <div style="font-size:0.72rem;font-weight:700;color:#99f6e4;text-align:center;margin-bottom:4px;">
            ▲ UPPER ARCH (MAXILLARY) — Tap Any Tooth to Hear &amp; Inspect
          </div>
          <div class="dental-arch-cross">
            ${renderQuadBox(q1)}
            ${renderQuadBox(q2)}
          </div>

          <div class="dental-bite-divider">── Occlusal Bite Plane • Central Midline │ ──</div>

          <div class="dental-arch-cross" style="margin-bottom:4px;">
            ${renderQuadBox(q4)}
            ${renderQuadBox(q3)}
          </div>
          <div style="font-size:0.72rem;font-weight:700;color:#99f6e4;text-align:center;margin-bottom:8px;">
            ▼ LOWER ARCH (MANDIBULAR) — <span style="color:#67e8f9;">CI/LI Incisors</span> • <span style="color:#fde68a;">C Canine</span> • <span style="color:#93c5fd;">1P/2P Premolars</span> • <span style="color:#d8b4fe;">1M–3M Molars</span>
          </div>

          ${this.chartTab === 'chart' ? `
          <div id="chart-selected-card" style="background:rgba(4,16,28,0.88);border:1px solid rgba(45,212,191,0.45);border-radius:12px;padding:10px 12px;margin-bottom:8px;">
            <div class="row-between" style="flex-wrap:wrap;margin-bottom:5px;">
              <div>
                <strong id="chart-tooth-name" style="font-size:0.92rem;color:#fff;">${escapeHtml(sel.clinicalName)}</strong>
                <span style="font-size:0.75rem;color:#5eead4;margin-left:6px;">• ${escapeHtml(sel.commonNickname)}</span>
              </div>
              <span class="pill-badge">${escapeHtml(catLabel[sel.category])}</span>
            </div>
            <div class="row-wrap" style="margin-bottom:6px;">
              <span class="pill-badge" style="border-color:#fbbf24;color:#fde68a;">🇺🇸 US <strong>#${sel.universal}</strong></span>
              <span class="pill-badge" style="border-color:#38bdf8;color:#bae6fd;">🌍 FDI <strong>${escapeHtml(sel.fdi)}</strong> (“${escapeHtml(sel.fdiSpoken)}”)</span>
              <span class="pill-badge" style="border-color:#c084fc;color:#e9d5ff;">┼ Palmer <strong>${escapeHtml(sel.palmer)}</strong></span>
              <span class="pill-badge">Q${sel.quadrant} • Tooth ${sel.positionFromMidline} from Midline</span>
            </div>
            <p style="margin:0 0 4px 0;font-size:0.76rem;color:#e2e8f0;line-height:1.38;">
              ${escapeHtml(sel.anatomyFact)}
            </p>
            <div style="font-size:0.73rem;color:#99f6e4;line-height:1.35;">
              🪥 <strong>Care Tip:</strong> ${escapeHtml(sel.careTip)}
            </div>
          </div>

          <details class="report-lesson"${typeof window !== 'undefined' && isCompactViewport(window.innerWidth, window.innerHeight) ? '' : ' open'}>
            <summary>🎓 30-Second Numbering Decoder &amp; 5 Clinical Surfaces</summary>
            <div class="report-lesson-body">
              <div style="font-size:0.74rem;color:#cbd5e1;line-height:1.42;display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">
                <div>• <strong>🇺🇸 Universal (#1–#32):</strong> Starts at Upper Right Wisdom Tooth <strong>#1</strong>, sweeps across to Upper Left <strong>#16</strong>, drops down to Lower Left <strong>#17</strong>, and finishes at Lower Right <strong>#32</strong>. <em>(20 baby/primary teeth use letters <strong>A–T</strong> in the same clockwise loop!)</em></div>
                <div>• <strong>🌍 FDI Two-Digit (ISO 3950):</strong> Used across Canada, Europe &amp; WHO. First digit = Quadrant (<strong>1</strong>=UR, <strong>2</strong>=UL, <strong>3</strong>=LL, <strong>4</strong>=LR; baby teeth <strong>5–8</strong>). Second digit = Tooth from midline (<strong>1</strong>=Central Incisor … <strong>6</strong>=1st Molar … <strong>8</strong>=Wisdom Tooth).</div>
                <div>• <strong>┼ Palmer Brackets:</strong> Draws the cross of the mouth (<strong>┘ └ ┌ ┐</strong>) with <strong>1–8</strong> counting out from the front midline (<strong>A–E</strong> for baby teeth).</div>
              </div>
              <strong style="font-size:0.77rem;color:#fff;display:block;margin-bottom:4px;">🧭 The 5 Clinical Tooth Surfaces (Why Dentists Say “MOD on #19”)</strong>
              <div style="display:flex;flex-direction:column;gap:5px;">
                ${TOOTH_SURFACES_GUIDE.map(
                  (s) => `
                  <div style="font-size:0.73rem;color:#cbd5e1;line-height:1.35;">
                    <span class="pill-badge" style="font-size:0.66rem;padding:1px 7px;margin-right:4px;color:#5eead4;">${escapeHtml(s.code)}</span>
                    <strong style="color:#fff;">${escapeHtml(s.name)}:</strong> ${escapeHtml(s.whereItFaces)} <span style="color:#99f6e4;">(${escapeHtml(s.howToClean)})</span>
                  </div>
                `
                ).join('')}
              </div>
            </div>
          </details>
` : ''}
`}
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.container) return;
    const save = this.saveSys.getSave();

    this.bindTouchedCrownPill();

    this.container.querySelector('#btn-toggle-hub-drawer')?.addEventListener('click', () => {
      this.mobileDrawerOpen = !this.mobileDrawerOpen;
      this.actions.onPlayUiTap();
      this.render();
      this.container?.querySelector<HTMLElement>('#btn-toggle-hub-drawer')?.focus({ preventScroll: true });
    });

    this.container.querySelector('#btn-dismiss-welcome')?.addEventListener('click', () => {
      this.dismissWelcome();
      this.actions.onPlayUiTap();
      this.render();
    });

    this.container.querySelector('#tab-companion')?.addEventListener('click', () => {
      this.tab = 'companion';
      this.actions.onPlayUiTap();
      this.actions.onTabChanged('companion', this.selectedCityId);
      this.render();
    });

    this.container.querySelector('#tab-globe')?.addEventListener('click', () => {
      this.dismissWelcome();
      this.tab = 'globe';
      this.actions.onPlayUiTap();
      this.actions.onTabChanged('globe', this.selectedCityId);
      this.render();
    });

    this.container.querySelector('#btn-toggle-mute')?.addEventListener('click', () => {
      this.actions.onToggleMute();
      this.syncMuteUi();
    });

    this.container.querySelector('#btn-claim-reservoir')?.addEventListener('click', () => {
      const claimed = CompanionArchSim.claimIdleReservoir(save.companion);
      if (claimed > 0) {
        save.fluorideIons += claimed;
        this.saveSys.save(save);
        this.actions.onPlaySparkleSfx();
        this.statusBanner = `Crystallized +${claimed} Fluoride Ions from Smooth Bask!`;
        this.render();
      }
    });

    this.container.querySelector('#btn-start-brush-along')?.addEventListener('click', () => {
      this.dismissWelcome();
      this.actions.onLaunchBrushAlong();
    });

    this.container.querySelector<HTMLButtonElement>('#btn-launch-arcade')?.addEventListener('click', (e) => {
      this.dismissWelcome();
      const wid = (e.currentTarget as HTMLButtonElement).dataset.worldId ?? 'world_1';
      this.actions.onLaunchArcadeWorld(wid);
    });

    this.container.querySelector('#btn-globe-dive')?.addEventListener('click', () => {
      this.dismissWelcome();
      const city = getHostCityById(this.selectedCityId);
      const unlocked = isCampaignWorldUnlocked(
        city.worldId,
        save.worlds,
        save.totalBrushStamps,
        city.unlockStampsRequired
      );
      if (city.playableInSlice && isPlayableWorld(city.worldId) && unlocked) {
        this.actions.onLaunchArcadeWorld(city.worldId);
      }
    });

    this.container.querySelector('#btn-launch-rescue')?.addEventListener('click', () => {
      this.actions.onLaunchPulpRescue();
    });

    this.container.querySelector('#btn-feed-treat')?.addEventListener('click', () => {
      this.dismissWelcome();
      this.actions.onPlayTreatSfx();
      const homeCity = getHostCityById(save.playerProfile.homeCityId);
      const res = CompanionArchSim.feedRegionalTreat(save.companion, Date.now());
      save.fluorideIons += res.ionsGranted;
      this.actions.onTreatSplat?.();

      if (res.triggeredPulpRescue) {
        this.statusBanner =
          '🚨 Acid reached Pulp! Launch 90s Pulp Rescue to avoid the Dreaded Root Canal!';
      } else if (res.ionsGranted > 0) {
        this.statusBanner = `Enjoyed ${homeCity.signatureTreat.name}! +${res.ionsGranted} Ions (Smoothness ${Math.round(save.companion.smoothnessIndex)}%)`;
      } else {
        this.statusBanner = `Enjoyed ${homeCity.signatureTreat.name}! (Hourly Ion bonus 3/3 reached — watch acid load!)`;
      }
      this.saveSys.save(save);
      this.bus.emit('companion:updated', { state: save.companion });
      this.container?.querySelector<HTMLElement>('#btn-feed-treat')?.focus({ preventScroll: true });
    });

    this.container.querySelector('#btn-replay-cosmic')?.addEventListener('click', () => {
      this.actions.onReplayCosmicIntro();
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-city-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedCityId = btn.dataset.cityId ?? 'toronto';
        this.actions.onPlayUiTap();
        this.actions.onTabChanged('globe', this.selectedCityId);
        this.render();
        this.focusCityPill(this.selectedCityId);
      });
    });

    // Modal openers & closers
    this.container.querySelector('#btn-open-profile')?.addEventListener('click', () => {
      this.actions.onPlayUiTap();
      this.openModal('profile', '#btn-open-profile');
    });
    this.container.querySelector('#btn-open-lab')?.addEventListener('click', () => {
      this.actions.onPlayUiTap();
      this.openModal('lab', '#btn-open-lab');
    });
    this.container.querySelector('#btn-open-history')?.addEventListener('click', () => {
      this.actions.onPlayUiTap();
      this.openModal('history', '#btn-open-history');
    });
    this.container.querySelector('#btn-open-chart')?.addEventListener('click', () => {
      this.actions.onPlayUiTap();
      this.openModal('chart', '#btn-open-chart');
    });
    this.container.querySelector('#btn-open-sync')?.addEventListener('click', () => {
      this.actions.onPlayUiTap();
      this.openModal('sync', '#btn-open-sync');
    });
    this.container.querySelector('#btn-open-charity')?.addEventListener('click', () => {
      this.actions.onPlayUiTap();
      this.openModal('charity', '#btn-open-charity');
    });
    this.container.querySelectorAll<HTMLAnchorElement>('.modal-sheet a[href]').forEach((lnk) => {
      lnk.addEventListener('click', () => this.actions.onPlayUiTap());
    });

    // Interactive 32-Tooth Chart modal handlers
    this.container.querySelectorAll<HTMLButtonElement>('[data-num-sys]').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const sys = tabBtn.dataset.numSys as ToothNumberingSystem | undefined;
        if (!sys || sys === this.chartSystem) return;
        this.chartSystem = sys;
        this.actions.onPlayUiTap();
        this.rerenderModalKeepingScroll(`[data-num-sys="${sys}"]`);
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-chart-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.chartTab as 'chart' | 'quiz' | 'anatomy' | undefined;
        if (!id || id === this.chartTab) return;
        this.chartTab = id;
        this.actions.onPlayUiTap();
        this.rerenderModalKeepingScroll(`[data-chart-tab="${id}"]`);
      });
    });
    this.container.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach((b) => {
      b.addEventListener('click', () => {
        this.selectedLayer = (b.dataset.layer as ToothLayerInfo['id']) ?? 'enamel';
        this.actions.onPlayToothChime?.(['enamel', 'dentin', 'pulp', 'ligament'].indexOf(this.selectedLayer) * 2 + 2);
        this.rerenderModalKeepingScroll(`[data-layer="${this.selectedLayer}"]`);
      });
    });
    this.container.querySelector('#btn-quiz-next')?.addEventListener('click', () => {
      this.quizTarget = buildSpotQuizQuestion(Math.random, this.quizTarget?.targetUniversal);
      this.quizFeedback = null;
      this.actions.onPlayUiTap();
      this.rerenderModalKeepingScroll('#btn-quiz-next');
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-tooth-num]').forEach((toothBtn) => {
      toothBtn.addEventListener('click', () => {
        const num = Number(toothBtn.dataset.toothNum ?? 3);
        const t = getToothByUniversal(num);
        const step = (8 - t.positionFromMidline) + (t.arch === 'upper' ? 4 : 0);
        if (this.chartTab === 'quiz' && this.quizTarget) {
          const res = judgeSpotQuizAnswer(this.quizTarget.targetUniversal, num, this.quizStreak, this.quizBest);
          this.quizStreak = res.nextStreak;
          this.quizBest = res.bestStreak;
          this.quizFeedback = { ok: res.correct, text: res.message };
          if (res.correct) {
            this.actions.onPlayToothChime?.(step);
            this.actions.onPlayToothChime?.(step + 2);
            if (t.companionArchIndex !== null) this.actions.onHighlightCrown?.(t.companionArchIndex);
            this.quizTarget = buildSpotQuizQuestion(Math.random, num);
          } else {
            this.actions.onPlayUiTap();
          }
          this.rerenderModalKeepingScroll(`[data-tooth-num="${num}"]`);
          return;
        }
        this.selectedUniversalTooth = num;
        if (t.companionArchIndex !== null) {
          this.lastTouchedCrownIdx = t.companionArchIndex;
          this.actions.onHighlightCrown?.(t.companionArchIndex);
        }
        if (this.actions.onPlayToothChime) {
          this.actions.onPlayToothChime(step);
        } else {
          this.actions.onPlayUiTap();
        }
        this.rerenderModalKeepingScroll(`[data-tooth-num="${num}"]`);
      });
    });

    this.container.querySelector('#btn-close-modal')?.addEventListener('click', () => this.closeActiveModal());
    this.container.querySelector('#modal-bg')?.addEventListener('click', () => this.closeActiveModal());
    bindBottomSheetSwipeClose(
      this.container.querySelector<HTMLElement>('.modal-header-sticky'),
      this.container.querySelector<HTMLElement>('.modal-sheet'),
      () => this.closeActiveModal()
    );

    // Profile modal handlers
    const syncPendingName = () => {
      const inp = this.container?.querySelector<HTMLInputElement>('#inp-host-name');
      if (inp) {
        save.playerProfile.displayName = truncateDisplayName(inp.value.trim()) || save.playerProfile.displayName;
      }
    };
    this.container.querySelector<HTMLInputElement>('#inp-host-name')?.addEventListener('change', () => {
      syncPendingName();
      this.saveSys.save(save);
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-skin-idx]').forEach((sw) => {
      sw.addEventListener('click', () => {
        syncPendingName();
        save.playerProfile.skinToneIndex = Number(sw.dataset.skinIdx ?? 3);
        this.saveSys.save(save);
        this.render();
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-home-city]').forEach((b) => {
      b.addEventListener('click', () => {
        syncPendingName();
        save.playerProfile.homeCityId = b.dataset.homeCity ?? 'toronto';
        this.selectedCityId = save.playerProfile.homeCityId;
        this.saveSys.save(save);
        this.render();
      });
    });

    this.container.querySelector('#btn-toggle-reduce-motion')?.addEventListener('click', () => {
      syncPendingName();
      this.actions.onToggleReducedMotion?.();
      this.actions.onPlayUiTap();
      this.render();
    });

    this.container.querySelector('#btn-modal-mute')?.addEventListener('click', () => {
      this.actions.onToggleMute();
      this.syncMuteUi();
    });
    this.container.querySelector<HTMLInputElement>('#rng-music')?.addEventListener('input', (e) => {
      this.actions.setMusicVolume?.(Number((e.target as HTMLInputElement).value) / 100);
    });
    this.container.querySelector<HTMLInputElement>('#rng-sfx')?.addEventListener('input', (e) => {
      this.actions.setSfxVolume?.(Number((e.target as HTMLInputElement).value) / 100);
    });
    this.container.querySelector('#btn-save-profile')?.addEventListener('click', () => {
      const inp = this.container?.querySelector<HTMLInputElement>('#inp-host-name');
      const cleaned = truncateDisplayName(inp?.value.trim() ?? '') || 'Explorer';
      save.playerProfile.displayName = cleaned;
      this.saveSys.save(save);
      this.closeActiveModal();
    });

    // Upgrade Lab handlers
    this.container.querySelectorAll<HTMLButtonElement>('[data-buy-id]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.buyId;
        if (id && this.saveSys.purchaseUpgradeWithIons(id)) {
          this.actions.onPlaySparkleSfx();
          this.refreshLabUpgrade(id);
        }
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-equip-id]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.equipId;
        if (id && this.saveSys.equipUpgrade(id)) {
          this.refreshLabUpgrade(id);
        }
      });
    });

    // Sync Code handlers
    const showSyncInlineFeedback = (msg: string, ok = true) => {
      const status = this.container?.querySelector<HTMLElement>('#sync-import-status');
      if (status) {
        status.style.color = ok ? '#86efac' : '#fca5a5';
        status.textContent = msg;
      }
    };

    this.container.querySelector('#btn-copy-sync')?.addEventListener('click', (e) => {
      const code = this.saveSys.exportSyncCode();
      const exportArea = this.container?.querySelector<HTMLTextAreaElement>('#txt-sync-export');
      const btn = e.currentTarget as HTMLButtonElement | null;
      const fallbackSelectAndCopy = () => {
        if (exportArea) {
          exportArea.focus();
          exportArea.select();
          exportArea.setSelectionRange?.(0, code.length);
          try {
            document.execCommand?.('copy');
          } catch {
            // Selection remains highlighted for manual Copy on restricted WebViews
          }
        }
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(code).catch(() => fallbackSelectAndCopy());
      } else {
        fallbackSelectAndCopy();
      }
      if (btn) btn.textContent = '✓ Copied ML2 Code!';
      this.statusBanner = 'Copied ML2: Sync Code to clipboard!';
      showSyncInlineFeedback('✓ Copied ML2: Sync Code to clipboard!');
    });

    this.container.querySelector('#btn-paste-sync')?.addEventListener('click', () => {
      const txt = this.container?.querySelector<HTMLTextAreaElement>('#txt-sync-import');
      if (!txt) return;
      if (navigator.clipboard?.readText) {
        navigator.clipboard
          .readText()
          .then((clip) => {
            if (clip.trim()) {
              txt.value = clip.trim();
              showSyncInlineFeedback('✓ Pasted code — tap Import & Merge to apply.');
            } else {
              txt.focus();
              showSyncInlineFeedback('Clipboard looks empty — long-press in the box to paste.', false);
            }
          })
          .catch(() => {
            txt.focus();
            showSyncInlineFeedback('Long-press inside the import box above to paste your code.', false);
          });
      } else {
        txt.focus();
        showSyncInlineFeedback('Long-press inside the import box above to paste your code.', false);
      }
    });

    this.container.querySelector('#btn-download-json')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(this.saveSys.getSave(), null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backup.mouthlife.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    this.container.querySelector('#btn-copy-beta-diag')?.addEventListener('click', () => {
      const dbg = (window as unknown as {
        __MOUTHLIFE_DEBUG__?: {
          getDrawCalls?: () => number;
          getQualityTier?: () => string;
          getAudioState?: () => string;
        };
      }).__MOUTHLIFE_DEBUG__;
      const cleared = Object.entries(save.worlds)
        .filter(([, w]) => w.completed)
        .map(([id]) => id);
      const report = JSON.stringify({
        app: 'MouthLife v1.0-beta',
        ts: new Date().toISOString(),
        viewport:
          typeof window !== 'undefined'
            ? `${window.innerWidth}x${window.innerHeight}@${Number(window.devicePixelRatio || 1).toFixed(2)}x`
            : 'n/a',
        qualityTier: dbg?.getQualityTier?.() ?? save.qualityPreference,
        drawCalls: dbg?.getDrawCalls?.() ?? -1,
        audioState: dbg?.getAudioState?.() ?? 'unknown',
        stamps: save.totalBrushStamps,
        ions: save.fluorideIons,
        clearedWorlds: cleared,
        syncCode: this.saveSys.exportSyncCode(),
      });
      const exportArea = this.container?.querySelector<HTMLTextAreaElement>('#txt-sync-export');
      const fallbackCopy = () => {
        if (exportArea) {
          exportArea.value = report;
          exportArea.focus();
          exportArea.select();
          exportArea.setSelectionRange?.(0, report.length);
          try {
            document.execCommand?.('copy');
          } catch {
            // Leave selected for manual copy
          }
        }
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(report).catch(() => fallbackCopy());
      } else {
        fallbackCopy();
      }
      this.statusBanner = 'Copied Beta Diagnostic Report to clipboard!';
      showSyncInlineFeedback('✓ Copied Beta Diagnostic Report to clipboard!');
    });

    this.container.querySelector('#btn-reset-save')?.addEventListener('click', () => {
      if (!this.confirmResetPending) {
        this.confirmResetPending = true;
        this.actions.onPlayUiTap();
        this.render();
        return;
      }
      this.confirmResetPending = false;
      this.saveSys.resetToFreshSave();
      this.selectedCityId = 'toronto';
      this.statusBanner = 'Save data reset to a fresh Day-1 profile!';
      this.closeActiveModal();
    });

    this.container.querySelector('#btn-apply-sync')?.addEventListener('click', () => {
      const txt = this.container?.querySelector<HTMLTextAreaElement>('#txt-sync-import');
      const raw = txt?.value.trim() ?? '';
      try {
        this.saveSys.importSyncCode(raw);
        this.statusBanner = 'Sync Code imported & merged cleanly!';
        this.closeActiveModal();
      } catch (err) {
        // Keep the sheet open with the pasted text so the player can fix the code; progress is untouched.
        const status = this.container?.querySelector<HTMLElement>('#sync-import-status');
        if (status) {
          status.textContent =
            (err instanceof Error && err.message ? err.message : 'That Sync Code could not be read.') +
            ' Your current progress was not changed.';
        }
        txt?.focus();
      }
    });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
    this.disposers.disposeAll();
    this.container?.remove();
    this.container = null;
  }
}
