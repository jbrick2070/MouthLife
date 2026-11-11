import { GUM_TENDER_THRESHOLD, SURGE_MAX } from '../config/gameConfig';
import { findNearestZipMouth, sampleTerrainHeight } from '../engine/physics/CollisionSystem';
import { DisposerBag, type EventBus } from '../engine/EventBus';
import type { InputManager } from '../engine/InputManager';
import type { SaveSystem } from '../engine/persistence/SaveSystem';
import type { SceneManager } from '../engine/render/SceneManager';
import type { WorldSession } from '../engine/sim/WorldSession';
import type { OverlayView, QualityTier, Vec2 } from '../engine/types';

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
  private cleanBarEl: HTMLElement | null = null;
  private cleanTextEl: HTMLElement | null = null;
  private phBadgeEl: HTMLElement | null = null;
  private sitesBadgeEl: HTMLElement | null = null;
  private scoreBadgeEl: HTMLElement | null = null;
  private districtRowEl: HTMLElement | null = null;
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
  private flossRingEl: HTMLElement | null = null;
  private flossDeskBtnEl: HTMLElement | null = null;
  private mechanicBadgeEl: HTMLElement | null = null;
  private steerBtnEl: HTMLButtonElement | null = null;
  private lastSynergy = 1;
  private acidCalloutCooldown = 0;
  private gumCalloutCooldown = 0;

  constructor(
    private readonly mode: 'ARCADE' | 'PULP_RESCUE',
    private readonly bus: EventBus,
    private readonly session: WorldSession,
    private readonly input: InputManager,
    private readonly sceneMgr: SceneManager,
    private readonly saveSys: SaveSystem,
    private readonly onExitToHub: () => void
  ) {}

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
        <div class="row-between">
          <div class="row-wrap">
            <strong style="font-size:0.84rem;color:#5eead4;">${titleLabel}</strong>
            <span id="hud-ph" class="pill-badge">pH 7.0 Neutral</span>
            <span id="hud-sites" class="pill-badge">Sites 0/${this.session.sites.length}</span>
            <span id="hud-mechanic" class="pill-badge" style="display:none;"></span>
          </div>
          <div class="row-wrap">
            <span id="hud-score" class="pill-badge">1.0x • 0 pts</span>
            <button type="button" id="btn-hud-quality" class="btn btn-sm" title="Cycle Modest-GPU Quality Tier">
              GPU: ${this.formatQualityLabel()}
            </button>
            <button type="button" id="btn-hud-steer" class="btn btn-sm" title="Toggle drag/click-to-steer on the 3D tooth surface">
              ${this.input.isPointerSteerEnabled() ? '🎯 Steer: ON' : '🎯 Steer: OFF'}
            </button>
            <button type="button" id="btn-hud-exit" class="btn btn-sm">← Hub</button>
          </div>
        </div>

        <div class="row-between">
          <span id="hud-clean-pct" style="font-size:0.78rem;font-weight:700;min-width:68px;">0% Clean</span>
          <div class="clean-progress-outer">
            <div id="hud-clean-bar" class="clean-progress-inner" style="width:0%;"></div>
          </div>
          <div id="hud-districts" class="row-wrap" style="font-size:0.72rem;"></div>
        </div>
      </div>

      <div id="hud-toast" class="hud-toast" style="opacity:0;"></div>

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
            <div class="row-wrap">
              <button type="button" id="btn-mob-scan" class="btn btn-sm">🔍 Dye Scan</button>
              <button type="button" id="btn-mob-surge" class="btn btn-sm">🌊 Surge 0%</button>
            </div>
            <div id="ring-floss" class="floss-ring" title="Tap or Drag Vector to Slice & Capillary Zip">
              <span>🧵 FLOSS</span>
              <span style="font-size:0.62rem;opacity:0.8;">TAP / AIM</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.cleanBarEl = this.container.querySelector('#hud-clean-bar');
    this.cleanTextEl = this.container.querySelector('#hud-clean-pct');
    this.phBadgeEl = this.container.querySelector('#hud-ph');
    this.sitesBadgeEl = this.container.querySelector('#hud-sites');
    this.scoreBadgeEl = this.container.querySelector('#hud-score');
    this.districtRowEl = this.container.querySelector('#hud-districts');
    this.surgeBtnEl = this.container.querySelector('#btn-mob-surge');
    this.surgeDeskBtnEl = this.container.querySelector('#btn-desk-surge');
    this.toastEl = this.container.querySelector('#hud-toast');
    this.qualityBtnEl = this.container.querySelector('#btn-hud-quality');
    this.flossRingEl = this.container.querySelector('#ring-floss');
    this.flossDeskBtnEl = this.container.querySelector('#btn-desk-floss');
    this.mechanicBadgeEl = this.container.querySelector('#hud-mechanic');
    this.steerBtnEl = this.container.querySelector('#btn-hud-steer');

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
    this.calloutLayer.appendChild(this.zipPromptEl);

    this.bindControls();
    this.bindBusEvents();
    this.refreshStats();
    this.lastSynergy = this.session.scoring.getSynergyMultiplier();

    const blurb = this.session.cartridge.challengeBlurb;
    if (blurb && this.mode === 'ARCADE') this.showToast(`🎯 ${blurb}`, 5.0);
  }

  /** Spawns a crisp floating callout anchored to a world position (rises & fades). */
  spawnCallout(text: string, pos: Vec2, tone: CalloutTone = 'mint', life = 1.25, yOffset = 1.6): void {
    const slot = this.callouts.find((c) => !c.active) ?? this.callouts.reduce((a, b) => (a.age > b.age ? a : b));
    const cart = this.session.cartridge;
    slot.active = true;
    slot.age = 0;
    slot.life = life;
    slot.wx = pos.x;
    slot.wz = pos.z;
    slot.wy = (cart ? sampleTerrainHeight(cart, pos.x, pos.z) : 0.5) + yOffset;
    slot.el.textContent = text;
    slot.el.className = `world-callout tone-${tone}`;
  }

  private tickCallouts(dt: number): void {
    for (const c of this.callouts) {
      if (!c.active) continue;
      c.age += dt;
      if (c.age >= c.life) {
        c.active = false;
        c.el.style.opacity = '0';
        continue;
      }
      const u = c.age / c.life;
      const sp = this.sceneMgr.worldToScreen(c.wx, c.wy + u * 1.1, c.wz);
      if (!sp.visible) {
        c.el.style.opacity = '0';
        continue;
      }
      const pop = u < 0.12 ? 0.7 + (u / 0.12) * 0.45 : 1.15 - Math.min(0.15, (u - 0.12) * 0.6);
      c.el.style.transform = `translate3d(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${pop.toFixed(3)})`;
      c.el.style.opacity = String(u > 0.7 ? Math.max(0, (1 - u) / 0.3) : 1);
    }
  }

  /** In-world contextual Zip prompt when HYDRA-1 approaches a 0.90u alley blocked to walking. */
  private tickZipPrompt(): void {
    if (!this.zipPromptEl) return;
    const cart = this.session.cartridge;
    const hint =
      !cart || this.session.probeZip
        ? null
        : findNearestZipMouth(this.session.probePos, cart.interdentalAlleys, cart.wallBoxes);
    const show = Boolean(hint && hint.blockedToWalking);
    if (hint && show) {
      const y = sampleTerrainHeight(cart, hint.entry.x, hint.entry.z) + 2.1;
      const sp = this.sceneMgr.worldToScreen(hint.entry.x, y, hint.entry.z);
      this.zipPromptEl.style.transform = `translate3d(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      this.zipPromptEl.style.opacity = sp.visible ? '1' : '0';
      this.zipPromptEl.classList.toggle('ready', hint.inZipRange);
    } else {
      this.zipPromptEl.style.opacity = '0';
    }
    const ready = Boolean(hint && hint.inZipRange);
    this.flossRingEl?.classList.toggle('zip-ready', ready);
    this.flossDeskBtnEl?.classList.toggle('zip-ready', ready);
  }

  private formatQualityLabel(): string {
    const pref = this.saveSys.getSave().qualityPreference;
    const active = this.sceneMgr.getActiveQualityTier().toUpperCase();
    return pref === 'auto' ? `AUTO(${active})` : pref.toUpperCase();
  }

  private bindControls(): void {
    if (!this.container) return;

    this.container.querySelector('#btn-hud-exit')?.addEventListener('click', () => {
      this.onExitToHub();
    });

    this.steerBtnEl?.addEventListener('click', () => {
      const next = !this.input.isPointerSteerEnabled();
      this.input.setPointerSteerEnabled(next);
      if (this.steerBtnEl) this.steerBtnEl.textContent = next ? '🎯 Steer: ON' : '🎯 Steer: OFF';
      this.showToast(
        next
          ? '🎯 Drag/Click-to-Steer ON — touch or hold the tooth surface to sweep HYDRA-1 there'
          : '🎯 Steer OFF — WASD / Thumb Pad movement, Click/Space scrubs in place'
      );
    });

    this.container.querySelector('#btn-hud-quality')?.addEventListener('click', () => {
      const order: Array<'auto' | QualityTier> = ['auto', 'low', 'medium', 'ultra'];
      const cur = this.saveSys.getSave().qualityPreference;
      const next = order[(order.indexOf(cur) + 1) % order.length];
      this.saveSys.setQualityPreference(next);
      this.sceneMgr.setQualityPreference(next);
      if (this.qualityBtnEl) {
        this.qualityBtnEl.textContent = `GPU: ${this.formatQualityLabel()}`;
      }
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

    // Mobile buttons
    this.container
      .querySelector('#btn-mob-surge')
      ?.addEventListener('click', () => this.input.triggerVirtualRinse());
    this.container
      .querySelector('#btn-mob-scan')
      ?.addEventListener('click', () => this.input.triggerVirtualDisclose());

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
    }

    // Right Polymer Floss Vector Slingshot Ring (tap = smart auto-aim; drag = directional filament!)
    const ring = this.container.querySelector<HTMLElement>('#ring-floss');
    if (ring) {
      let flossPid: number | null = null;
      let startX = 0;
      let startY = 0;

      ring.addEventListener('pointerdown', (e) => {
        flossPid = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        ring.setPointerCapture(e.pointerId);
        ring.style.borderColor = '#2dd4bf';
      });

      const releaseRing = (e: PointerEvent) => {
        if (e.pointerId !== flossPid) return;
        flossPid = null;
        ring.style.borderColor = 'rgba(103, 232, 249, 0.55)';
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const dist = Math.hypot(dx, dy);
        if (dist > 14) {
          this.input.triggerVirtualFloss({ x: dx / dist, z: dy / dist });
        } else {
          this.input.triggerVirtualFloss(null);
        }
      };

      ring.addEventListener('pointerup', releaseRing);
      ring.addEventListener('pointercancel', releaseRing);
    }
  }

  private bindBusEvents(): void {
    this.disposers.add(
      this.bus.on('site:restored', ({ pos, surgeDelta }) => {
        this.showToast('✨ Commensal S. sanguinis Colony Restored! (+30% Surge)');
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
        if (acidWarn && this.acidCalloutCooldown <= 0) {
          this.acidCalloutCooldown = 1.8;
          this.spawnCallout('pH < 5.5 Acid Shielded!', this.session.probePos, 'rose', 1.3);
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
      this.bus.on('stephan:sip', () => {
        this.showToast('🥤 Sweet Sip! Stephan Acid Clock restarted — pH < 5.5 for ~6s. Hit Saliva springs!', 3.2);
        this.spawnCallout('Sweet Sip! pH ↓ 4.8', this.session.probePos, 'gold', 1.5, 2.2);
      })
    );
    this.disposers.add(
      this.bus.on('stephan:buffered', ({ pos }) => {
        this.spawnCallout('Saliva Buffer! −7s Acid', pos, 'cyan', 1.3);
      })
    );
    this.disposers.add(
      this.bus.on('rinse:surged', ({ origin }) => {
        this.spawnCallout('Fluoride-Bicarb Surge!', origin, 'cyan', 1.4, 2.2);
      })
    );
    this.disposers.add(
      this.bus.on('district:sealed', ({ districtName }) => {
        this.showToast(`🌊 ${districtName} Sealed in Fluorapatite!`);
      })
    );
    this.disposers.add(
      this.bus.on('beacon:collected', () => {
        this.showToast('⚡ Habit Supply Beacon Collected! (+50% Surge)');
      })
    );
    this.disposers.add(
      this.bus.on('floss:sliced', ({ zipped, targetsHit, surgeDelta, to }) => {
        const surge = Math.round(surgeDelta);
        if (zipped) {
          this.showToast('🧵 Capillary Tether-Zip Across Interdental Contact!');
          this.spawnCallout(surge > 0 ? `Zipped! +${surge} Surge` : 'Zipped! Surge Full', to, 'cyan', 1.35);
        } else if (targetsHit > 0) {
          this.showToast(`🧵 Floss Severed ${targetsHit} Biofilm Target${targetsHit > 1 ? 's' : ''}!`);
          this.spawnCallout(`Severed ×${targetsHit}${surge > 0 ? ` +${surge} Surge` : ''}`, to, 'mint', 1.2);
        }
      })
    );
    this.disposers.add(
      this.bus.on('quality:changed', () => {
        if (this.qualityBtnEl) {
          this.qualityBtnEl.textContent = `GPU: ${this.formatQualityLabel()}`;
        }
      })
    );
  }

  showToast(msg: string, durationSec = 2.6): void {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.style.opacity = '1';
    this.toastTimerSec = durationSec;
  }

  tickHud(frameDt: number): void {
    this.acidCalloutCooldown = Math.max(0, this.acidCalloutCooldown - frameDt);
    this.gumCalloutCooldown = Math.max(0, this.gumCalloutCooldown - frameDt);

    // Synergy multiplier step-ups pop a floating callout over HYDRA-1
    const syn = this.session.scoring.getSynergyMultiplier();
    if (syn > this.lastSynergy + 1e-3) {
      this.spawnCallout(`${syn.toFixed(2)}x Synergy!`, this.session.probePos, 'gold', 1.3, 2.4);
    }
    this.lastSynergy = syn;

    this.tickCallouts(frameDt);
    this.tickZipPrompt();

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
    if (this.cleanTextEl) this.cleanTextEl.textContent = `${cleanPct}% Clean`;

    const avgPh = this.session.chemistry.getAveragePh();
    if (this.phBadgeEl) {
      this.phBadgeEl.textContent = `pH ${avgPh.toFixed(1)}`;
      this.phBadgeEl.style.borderColor = avgPh < 5.6 ? '#fb7185' : 'rgba(94, 234, 212, 0.25)';
      this.phBadgeEl.style.color = avgPh < 5.6 ? '#fecdd3' : '#f0f9ff';
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
      this.scoreBadgeEl.textContent = `${syn.toFixed(2)}x • ${preview.totalScore} pts`;
    }

    if (this.districtRowEl) {
      if (this.mode === 'PULP_RESCUE') {
        const rem = Math.ceil(this.session.getRemainingRescueSec());
        this.districtRowEl.innerHTML = `<span class="pill-badge" style="border-color:#fb7185;color:#fecdd3;">⏱️ ${rem}s Left (Target 85%)</span>`;
      } else {
        this.districtRowEl.innerHTML = this.session.cartridge.districts
          .map((_d, idx) => {
            const sealed = this.session.sealedDistricts[idx];
            const dPct = Math.round(this.session.grid.getDistrictCleanRatio(idx) * 100);
            return `<span class="pill-badge" style="border-color:${sealed ? '#2dd4bf' : 'rgba(148,184,204,0.22)'};color:${sealed ? '#99f6e4' : '#cbd5e1'};">
              ${sealed ? '✓' : `D${idx + 1}`} ${dPct}%
            </span>`;
          })
          .join('');
      }
    }

    // Signature biophysical challenge badge (World 2 sulcus / World 3 Stephan acid clock)
    if (this.mechanicBadgeEl) {
      if (this.session.hasStephanClock()) {
        const acidSec = this.session.chemistry.getStephanTimerSec();
        const nextSip = this.session.getStephanSipCountdown();
        this.mechanicBadgeEl.style.display = '';
        if (acidSec > 0) {
          this.mechanicBadgeEl.textContent = `🧪 Acid Clock ${Math.ceil(acidSec)}s`;
          this.mechanicBadgeEl.style.borderColor = '#fb7185';
          this.mechanicBadgeEl.style.color = '#fecdd3';
        } else {
          this.mechanicBadgeEl.textContent = nextSip > 0 ? `🥤 Next Sip ${Math.ceil(nextSip)}s` : '🥤 Sugar Cut Off!';
          this.mechanicBadgeEl.style.borderColor = nextSip > 0 ? '#fbbf24' : '#2dd4bf';
          this.mechanicBadgeEl.style.color = nextSip > 0 ? '#fde68a' : '#99f6e4';
        }
      } else if (this.session.hasSulcusCare()) {
        const gum = this.session.chemistry.getMaxGumIrritation();
        const pct = Math.round((gum / GUM_TENDER_THRESHOLD) * 100);
        this.mechanicBadgeEl.style.display = '';
        this.mechanicBadgeEl.textContent = gum >= GUM_TENDER_THRESHOLD ? '🩷 Gums Tender!' : `🩷 Gum ${Math.min(99, pct)}%`;
        this.mechanicBadgeEl.style.borderColor = gum >= GUM_TENDER_THRESHOLD * 0.7 ? '#fb7185' : 'rgba(94, 234, 212, 0.25)';
        this.mechanicBadgeEl.style.color = gum >= GUM_TENDER_THRESHOLD * 0.7 ? '#fecdd3' : '#f0f9ff';
      } else {
        this.mechanicBadgeEl.style.display = 'none';
      }
    }

    const surgePct = Math.round((this.session.surgeMeter / SURGE_MAX) * 100);
    const surgeReady = surgePct >= 100;
    if (this.surgeBtnEl) {
      this.surgeBtnEl.textContent = surgeReady ? '🌊 SURGE READY!' : `🌊 Surge ${surgePct}%`;
      this.surgeBtnEl.className = surgeReady ? 'btn btn-primary btn-sm' : 'btn btn-sm';
    }
    if (this.surgeDeskBtnEl) {
      this.surgeDeskBtnEl.textContent = surgeReady
        ? '🌊 FLUORIDE SURGE READY! [Q]'
        : `🌊 Fluoride Surge (${surgePct}%) [Q]`;
      this.surgeDeskBtnEl.className = surgeReady ? 'btn btn-primary btn-sm' : 'btn btn-sm';
    }
  }

  dispose(): void {
    this.disposers.disposeAll();
    this.calloutLayer?.remove();
    this.calloutLayer = null;
    this.callouts = [];
    this.container?.remove();
    this.container = null;
  }
}
