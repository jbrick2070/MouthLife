import { SMILE_ON_U_CHARITY } from '../config/charityInfo';
import {
  BRUSH_ALONG_FLOSS_BONUS_SEC,
  BRUSH_ALONG_TOTAL_SEC,
} from '../config/gameConfig';
import type { ClockController } from '../engine/ClockController';
import { DisposerBag, type EventBus } from '../engine/EventBus';
import { HabitBank } from '../engine/persistence/HabitBank';
import type { SaveSystem } from '../engine/persistence/SaveSystem';
import type { OverlayView } from '../engine/types';

const QUADRANT_NAMES = [
  'Quadrant 1/4 • Upper Right (US #1–#8 • FDI 18–11)',
  'Quadrant 2/4 • Upper Left (US #9–#16 • FDI 21–28)',
  'Quadrant 3/4 • Lower Left (US #17–#24 • FDI 38–31)',
  'Quadrant 4/4 • Lower Right (US #25–#32 • FDI 41–48)',
];

const SURFACE_PROMPTS = [
  'Buccal / Facial (B/F) — Gentle 45° Bass sweep along outer cheek & lip gumline',
  'Occlusal / Incisal (O/I) — Short brisk strokes across chewing cusps & molar pits',
  'Lingual / Palatal (L/P) — Sweep inner tongue side & tilt vertically behind incisors',
];

export class BrushAlongOverlay implements OverlayView {
  private disposers = new DisposerBag();
  private container: HTMLElement | null = null;
  private stage: 'brushing' | 'choice' | 'flossing' | 'summary' = 'brushing';
  private lastQuad = -1;
  private lastSurf = -1;
  private rewardResult: {
    ionsAwarded: number;
    stampAwarded: boolean;
    slotType: 'full' | 'tip' | 'capped';
  } | null = null;
  private cueFlashTimer: number | null = null;
  private readonly keyHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.clock.stopPacer();
      this.callbacks.onPauseChanged?.(false);
      this.callbacks.onActiveQuadrantChanged(-1);
      this.callbacks.onExitToHub();
    }
  };

  constructor(
    private readonly bus: EventBus,
    private readonly clock: ClockController,
    private readonly saveSys: SaveSystem,
    private readonly callbacks: {
      onActiveQuadrantChanged: (quadrantIdx: number) => void;
      onPlayCue: (kind: 'surface' | 'quadrant' | 'complete') => void;
      onExitToHub: () => void;
      isMuted?: () => boolean;
      onToggleMute?: () => void;
      onPauseChanged?: (paused: boolean) => void;
    }
  ) {}

  private syncMuteUi(): void {
    const b = this.container?.querySelector<HTMLButtonElement>('#btn-pacer-mute');
    if (!b) return;
    const muted = this.callbacks.isMuted?.() ?? false;
    b.textContent = muted ? '🔇' : '🔊';
    b.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }

  private flashCueVisual(label: string): void {
    const card = this.container?.querySelector<HTMLElement>('#pacer-card');
    const cueEl = this.container?.querySelector<HTMLElement>('#pacer-visual-cue');
    if (cueEl) cueEl.textContent = label;
    card?.classList.add('pacer-cue-flash');
    if (this.cueFlashTimer !== null) window.clearTimeout(this.cueFlashTimer);
    this.cueFlashTimer = window.setTimeout(() => {
      card?.classList.remove('pacer-cue-flash');
      this.cueFlashTimer = null;
    }, 850);
  }

  mount(root: HTMLElement): void {
    this.stage = 'brushing';
    this.lastQuad = -1;
    this.lastSurf = -1;
    this.rewardResult = null;

    this.container = document.createElement('div');
    this.container.className = 'hub-shell';
    root.appendChild(this.container);

    this.clock.startPacer();
    this.callbacks.onActiveQuadrantChanged(0);
    this.disposers.add(this.bus.on('audio:changed', () => this.syncMuteUi()));
    this.disposers.add(
      this.bus.on('pacer:paused', ({ paused }) => {
        this.callbacks.onPauseChanged?.(paused);
        this.syncPauseUi(paused);
      })
    );
    window.addEventListener('keydown', this.keyHandler);

    this.disposers.add(
      this.bus.on('pacer:tick', ({ elapsedSec, quadrantIdx, surfaceIdx, inFlossBonus }) => {
        if (!inFlossBonus && this.stage === 'brushing') {
          if (quadrantIdx !== this.lastQuad) {
            if (this.lastQuad !== -1) {
              this.callbacks.onPlayCue('quadrant');
              this.flashCueVisual(`✨ Switch Quadrant → ${QUADRANT_NAMES[quadrantIdx] ?? ''}`);
            }
            this.lastQuad = quadrantIdx;
            this.callbacks.onActiveQuadrantChanged(quadrantIdx);
          } else if (surfaceIdx !== this.lastSurf) {
            if (this.lastSurf !== -1) {
              this.callbacks.onPlayCue('surface');
              this.flashCueVisual(`🪥 Next Surface (${surfaceIdx + 1}/3)`);
            }
            this.lastSurf = surfaceIdx;
          }

          if (elapsedSec >= BRUSH_ALONG_TOTAL_SEC - 1e-4) {
            this.clock.stopPacer();
            this.callbacks.onPauseChanged?.(false);
            this.callbacks.onPlayCue('complete');
            this.callbacks.onActiveQuadrantChanged(-1);
            this.stage = 'choice';
            this.render();
            return;
          }
          this.updateLiveTimerDom(BRUSH_ALONG_TOTAL_SEC - elapsedSec, quadrantIdx, surfaceIdx);
        } else if (inFlossBonus && this.stage === 'flossing') {
          if (elapsedSec >= BRUSH_ALONG_FLOSS_BONUS_SEC - 1e-4) {
            this.clock.stopPacer();
            this.callbacks.onPauseChanged?.(false);
            this.callbacks.onPlayCue('complete');
            this.finalizeHabitReward(true);
            return;
          }
          this.updateLiveTimerDom(BRUSH_ALONG_FLOSS_BONUS_SEC - elapsedSec, -1, -1);
        }
      })
    );

    this.render();
  }

  private finalizeHabitReward(withFlossBonus: boolean): void {
    const save = this.saveSys.getSave();
    this.rewardResult = HabitBank.completeBrushAlong(save, { withFlossBonus });
    this.saveSys.save(save);
    this.bus.emit('pacer:complete', {
      withFlossBonus,
      ionsAwarded: this.rewardResult.ionsAwarded,
      stampAwarded: this.rewardResult.stampAwarded,
    });
    this.stage = 'summary';
    this.render();
  }

  private formatClock(remSec: number): string {
    const s = Math.max(0, Math.ceil(remSec));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  private updateLiveTimerDom(remSec: number, quadIdx: number, surfIdx: number): void {
    if (!this.container) return;
    const tEl = this.container.querySelector('#pacer-clock');
    if (tEl) tEl.textContent = this.formatClock(remSec);

    if (quadIdx >= 0) {
      const qEl = this.container.querySelector('#pacer-quad');
      const sEl = this.container.querySelector('#pacer-surf');
      const stepEl = this.container.querySelector('#pacer-visual-cue');
      if (qEl) qEl.textContent = QUADRANT_NAMES[quadIdx] ?? QUADRANT_NAMES[0];
      if (sEl) sEl.textContent = SURFACE_PROMPTS[surfIdx] ?? SURFACE_PROMPTS[0];
      if (stepEl && !this.container.querySelector('#pacer-card')?.classList.contains('pacer-cue-flash')) {
        stepEl.textContent = `Quadrant ${quadIdx + 1}/4 • Surface ${surfIdx + 1}/3`;
      }
    }
    const totalSec = this.stage === 'flossing' ? BRUSH_ALONG_FLOSS_BONUS_SEC : BRUSH_ALONG_TOTAL_SEC;
    const pct = Math.max(0, Math.min(100, Math.round(((totalSec - remSec) / totalSec) * 100)));
    const barEl = this.container.querySelector<HTMLElement>('#pacer-progress-bar');
    if (barEl) barEl.style.width = `${pct}%`;

    const pauseBanner = this.container.querySelector<HTMLElement>('#pacer-paused-note');
    if (pauseBanner) {
      pauseBanner.style.display = this.clock.isPacerPaused() ? 'block' : 'none';
    }
  }

  private buildMuteBtnHtml(): string {
    const muted = this.callbacks.isMuted?.() ?? false;
    return `<button type="button" id="btn-pacer-mute" class="btn btn-sm btn-icon" aria-label="Toggle Sound (M)" aria-pressed="${muted ? 'true' : 'false'}" title="Mute / Unmute (M)">${muted ? '🔇' : '🔊'}</button>`;
  }

  private syncPauseUi(paused = this.clock.isPacerPaused()): void {
    const button = this.container?.querySelector<HTMLButtonElement>('#btn-pacer-pause');
    if (button) {
      button.textContent = paused ? '▶ Resume Pacer' : '⏸ Pause';
      button.setAttribute('aria-pressed', String(paused));
    }
    const note = this.container?.querySelector<HTMLElement>('#pacer-paused-note');
    if (note) note.style.display = paused ? 'block' : 'none';
  }

  private bindMuteBtn(): void {
    this.container?.querySelector('#btn-pacer-mute')?.addEventListener('click', () => {
      this.callbacks.onToggleMute?.();
      this.syncMuteUi();
    });
  }

  private render(): void {
    if (!this.container) return;

    if (this.stage === 'brushing' || this.stage === 'flossing') {
      const isFloss = this.stage === 'flossing';
      const initialSec = isFloss ? BRUSH_ALONG_FLOSS_BONUS_SEC : BRUSH_ALONG_TOTAL_SEC;
      this.container.innerHTML = `
        <div class="hub-top-bar glass-card ui-interactive row-between">
          <strong style="color:#5eead4;font-size:0.8rem;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${isFloss ? '🧵 20s FLOSS BONUS' : '🪥 2-MIN BRUSH-ALONG'}
          </strong>
          <div class="row-wrap" style="flex-wrap:nowrap;flex-shrink:0;">
            ${this.buildMuteBtnHtml()}
            <button type="button" id="btn-pacer-exit" class="btn btn-sm">← Exit</button>
          </div>
        </div>

        <div class="hub-center-callout">
          <div class="bask-floating-pill">
            Hands-Free Bathroom Pacer • No Missed-Day Penalties Ever
          </div>
        </div>

        <div id="pacer-card" class="cosmic-card glass-card ui-interactive" style="text-align:center;">
          <div id="pacer-visual-cue" role="status" aria-live="polite" class="pill-badge" style="margin-bottom:6px;">
            ${isFloss ? '20s Interdental Bonus' : 'Quadrant 1/4 • Surface 1/3'}
          </div>
          <div id="pacer-quad" style="font-size:0.78rem;font-weight:700;color:#38bdf8;">
            ${isFloss ? 'Mesial & Distal Contacts (M/D) • Hug Each Tooth (#1–#32) in a C-Shape' : QUADRANT_NAMES[0]}
          </div>
          <div id="pacer-clock" style="font-size:2.7rem;font-weight:800;letter-spacing:0.04em;margin:4px 0;color:#fff;font-variant-numeric:tabular-nums;">
            ${this.formatClock(initialSec - this.clock.getPacerElapsedSec())}
          </div>
          <div class="clean-progress-outer" style="margin:6px 0 8px 0;" aria-hidden="true">
            <div id="pacer-progress-bar" class="clean-progress-inner" style="width:0%;"></div>
          </div>
          <div id="pacer-surf" style="font-size:0.84rem;color:#ccfbf1;margin-bottom:10px;">
            ${isFloss ? 'Slide gently beneath the papilla without snapping!' : SURFACE_PROMPTS[0]}
          </div>
          <div id="pacer-paused-note" style="display:${this.clock.isPacerPaused() ? 'block' : 'none'};color:#fde68a;font-size:0.76rem;margin-bottom:8px;">
            ⏸️ Pacer paused — tap Resume when ready!
          </div>
          <div class="row-between" style="justify-content:center;gap:10px;">
            <button type="button" id="btn-pacer-pause" class="btn btn-primary" aria-pressed="${this.clock.isPacerPaused() ? 'true' : 'false'}">
              ${this.clock.isPacerPaused() ? '▶ Resume Pacer' : '⏸ Pause'}
            </button>
          </div>
        </div>
      `;

      this.bindMuteBtn();
      this.container.querySelector('#btn-pacer-exit')?.addEventListener('click', () => {
        this.clock.stopPacer();
        this.callbacks.onPauseChanged?.(false);
        this.callbacks.onActiveQuadrantChanged(-1);
        this.callbacks.onExitToHub();
      });

      this.container.querySelector('#btn-pacer-pause')?.addEventListener('click', () => {
        const nextPaused = !this.clock.isPacerPaused();
        this.clock.setPacerPaused(nextPaused);
        this.callbacks.onPauseChanged?.(nextPaused);
        this.syncPauseUi(nextPaused);
      });
      return;
    }

    if (this.stage === 'choice') {
      this.container.innerHTML = `
        <div class="hub-top-bar glass-card ui-interactive row-between">
          <strong style="color:#5eead4;">✨ 2-MINUTE BRUSH COMPLETE!</strong>
          ${this.buildMuteBtnHtml()}
        </div>
        <div></div>
        <div class="cosmic-card pacer-bottom-card glass-card ui-interactive" style="text-align:center;">
          <h2 style="margin:0 0 6px 0;font-size:1.15rem;">Enamel Polished! Add 20s C-Curve Flossing?</h2>
          <p style="margin:0 0 12px 0;font-size:0.82rem;color:#cbd5e1;">
            Spit out excess foam (don’t rinse away your protective fluoride!) — or run a quick 20-second interdental floss pass for +25 bonus Fluoride Ions!
          </p>
          <div class="hub-actions-primary">
            <button type="button" id="btn-claim-brush-only" class="btn">
              ✨ Claim Smooth Bask Now
            </button>
            <button type="button" id="btn-start-floss-bonus" class="btn btn-primary">
              🧵 +20s Floss Bonus (+25 Ions)
            </button>
          </div>
        </div>
      `;

      this.bindMuteBtn();
      this.container
        .querySelector('#btn-claim-brush-only')
        ?.addEventListener('click', () => this.finalizeHabitReward(false));
      this.container.querySelector('#btn-start-floss-bonus')?.addEventListener('click', () => {
        this.stage = 'flossing';
        this.clock.startFlossBonusPacer();
        this.render();
      });
      return;
    }

    // Summary Stage
    const r = this.rewardResult;
    this.container.innerHTML = `
      <div class="hub-top-bar glass-card ui-interactive row-between">
        <strong style="color:#5eead4;">🦷 100% MIRROR-SMOOTH BASK RESTORED!</strong>
        ${this.buildMuteBtnHtml()}
      </div>
      <div></div>
      <div class="cosmic-card glass-card ui-interactive" style="text-align:center;">
        <h2 style="margin:0 0 6px 0;font-size:1.18rem;">Fresh-Mint Fluorapatite Glow Active!</h2>
        <p style="margin:0 0 10px 0;font-size:0.82rem;color:#cbd5e1;">
          Your Companion teeth are 100% glassy-smooth, all shields are restored to 100%, and your arch is now crystallizing +6 Fluoride Ions/hr!
        </p>
        <div class="row-wrap" style="justify-content:center;margin-bottom:12px;">
          <span class="pill-badge">✦ +${r?.ionsAwarded ?? 0} Fluoride Ions</span>
          ${r?.stampAwarded ? '<span class="pill-badge">🦷 +1 Permanent Habit Stamp</span>' : ''}
          <span class="pill-badge">📡 Supply Beacons Topped Up</span>
          <span class="pill-badge">⚡ Fluorapatite Overdrive Ready</span>
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
    this.container.querySelector('#btn-done-pacer')?.addEventListener('click', () => {
      this.callbacks.onExitToHub();
    });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
    if (this.cueFlashTimer !== null) window.clearTimeout(this.cueFlashTimer);
    this.cueFlashTimer = null;
    this.clock.stopPacer();
    this.callbacks.onPauseChanged?.(false);
    this.callbacks.onActiveQuadrantChanged(-1);
    this.disposers.disposeAll();
    this.container?.remove();
    this.container = null;
  }
}
