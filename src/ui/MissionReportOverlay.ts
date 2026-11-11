import { SMILE_ON_U_CHARITY } from '../config/charityInfo';
import { getWorldDentalLesson } from '../config/dentalChart';
import { getHistoryNoteById } from '../config/hostsAndHistory';
import { DisposerBag, type EventBus } from '../engine/EventBus';
import type { OverlayView, ScoreBreakdown } from '../engine/types';

export interface MissionReportData {
  mode: 'ARCADE' | 'PULP_RESCUE';
  worldId: string;
  won: boolean;
  breakdown: ScoreBreakdown;
  unlockedHistoryNoteId: string | null;
  bonusRescueIons: number;
  worldTitle?: string;
  hostCityLabel?: string;
  newBest?: boolean;
  nextWorldId?: string | null;
  nextWorldTitle?: string | null;
  campaignMastered?: boolean;
  unlockedUpgradeNames?: string[];
}

const esc = (t: string): string =>
  t.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);

const REPORT_REVEAL_MS = 520;
const REPORT_FOCUSABLE_SEL =
  'button:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])';

/** Headline celebrating the actual cleared world (pure, unit-testable). */
export function buildReportHeadline(r: MissionReportData): string {
  if (r.mode === 'PULP_RESCUE') {
    return r.won
      ? '🎉 Pulp Rescued! Dreaded Root Canal Avoided!'
      : '🛡️ Calcium-Hydroxide Emergency Stabilization Applied';
  }
  if (!r.won) return '🌱 Dive Complete — Keep Remineralizing!';
  const place = r.hostCityLabel ? ` • ${r.hostCityLabel}` : '';
  return `✨ ${r.worldTitle ?? 'Plaque City'} Remineralized${place}! Smooth Bask Restored!`;
}

/** Which report button should receive keyboard focus first (pure, unit-testable). */
export function pickReportPrimaryButtonId(
  r: Pick<MissionReportData, 'won' | 'mode' | 'nextWorldId' | 'nextWorldTitle'>
): string {
  if (r.won && r.mode === 'ARCADE' && r.nextWorldId && r.nextWorldTitle) return 'btn-report-next';
  return r.won ? 'btn-report-hub' : 'btn-report-replay';
}

/** Ease-out cubic score reveal sampler; returns target immediately under reduced motion. */
export function sampleScoreReveal(target: number, progress01: number, reducedMotion: boolean): number {
  if (reducedMotion || progress01 >= 1) return Math.round(target);
  const u = Math.max(0, Math.min(1, progress01));
  const eased = 1 - Math.pow(1 - u, 3);
  return Math.round(target * eased);
}

export class MissionReportOverlay implements OverlayView {
  private disposers = new DisposerBag();
  private container: HTMLElement | null = null;
  private revealRafId: number | null = null;

  private readonly keyHandler = (e: KeyboardEvent): void => {
    if (!this.container) return;
    if (e.key === 'Escape') {
      const openLesson = this.container.querySelector<HTMLDetailsElement>('details.report-lesson[open]');
      e.preventDefault();
      if (openLesson) {
        openLesson.open = false;
        openLesson.querySelector<HTMLElement>('summary')?.focus();
      } else {
        this.callbacks.onReturnToHub();
      }
      return;
    }
    if (e.key === 'Tab') {
      const items = Array.from(this.container.querySelectorAll<HTMLElement>(REPORT_FOCUSABLE_SEL));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !this.container.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  constructor(
    private readonly report: MissionReportData,
    private readonly callbacks: {
      onReturnToHub: () => void;
      onReplay: () => void;
      onNextDive: (worldId: string) => void;
      isMuted?: () => boolean;
      onToggleMute?: () => void;
      isReducedMotion?: () => boolean;
      bus?: EventBus;
    }
  ) {}

  private isReducedMotionActive(): boolean {
    if (this.callbacks.isReducedMotion?.()) return true;
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('reduced-motion')) {
      return true;
    }
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  }

  private syncMuteUi(): void {
    const btn = this.container?.querySelector<HTMLButtonElement>('#btn-report-mute');
    if (!btn) return;
    const muted = this.callbacks.isMuted?.() ?? false;
    btn.textContent = muted ? '🔇' : '🔊';
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }

  mount(root: HTMLElement): void {
    this.container = document.createElement('div');
    this.container.className = 'hub-shell companion-hub';
    root.appendChild(this.container);

    const { breakdown, won, mode } = this.report;
    const note = this.report.unlockedHistoryNoteId
      ? getHistoryNoteById(this.report.unlockedHistoryNoteId)
      : undefined;
    const dentalLesson = getWorldDentalLesson(this.report.worldId, mode);

    const headline = esc(buildReportHeadline(this.report));
    const upgrades = this.report.unlockedUpgradeNames ?? [];
    const nextDive =
      won && mode === 'ARCADE' && this.report.nextWorldId && this.report.nextWorldTitle
        ? `<button type="button" id="btn-report-next" class="btn btn-primary" style="grid-column:1 / -1;">Next Dive: ${esc(this.report.nextWorldTitle)} →</button>`
        : '';

    const gradeLabel =
      breakdown.grade === 'FLUORAPATITE_GOLD' ? '★ FLUORAPATITE GOLD' : `GRADE ${breakdown.grade}`;
    const muted = this.callbacks.isMuted?.() ?? false;
    const reduced = this.isReducedMotionActive();
    const revealCls = reduced ? '' : ' report-grade-reveal';

    this.container.innerHTML = `
      <div class="hub-top-bar glass-card ui-interactive row-between">
        <strong style="color:#5eead4;font-size:0.86rem;">🦷 CLINICAL MISSION REPORT</strong>
        <div class="row-wrap" style="flex-wrap:nowrap;">
          <span id="report-grade-pill" class="pill-badge report-grade-pill grade-${esc(breakdown.grade)}${revealCls}" style="border-color:#fbbf24;color:#fde68a;">${gradeLabel}</span>
          <button
            type="button"
            id="btn-report-mute"
            class="btn btn-sm btn-icon"
            aria-label="Toggle Sound (M)"
            aria-pressed="${muted ? 'true' : 'false'}"
            title="Mute / Unmute (M)"
          >${muted ? '🔇' : '🔊'}</button>
        </div>
      </div>

      <div class="hub-center-callout">
        <div class="bask-floating-pill">
          Drag 3D Arch to Admire Fresh-Mint Glassy Enamel!
        </div>
      </div>

      <div class="cosmic-card glass-card ui-interactive">
        <h2 id="report-headline" tabindex="-1" style="margin:0 0 6px 0;font-size:1.1rem;color:#fff;">${headline}</h2>
        ${
          this.report.newBest
            ? '<div class="row-wrap" style="margin-bottom:6px;"><span id="pill-new-best" class="pill-badge" style="border-color:#fbbf24;color:#fde68a;">🏆 NEW BEST SCORE!</span></div>'
            : ''
        }
        ${
          this.report.campaignMastered
            ? '<div id="badge-campaign-mastery" class="pill-badge" style="border-color:#5eead4;color:#99f6e4;margin-bottom:6px;display:inline-block;">🛰️ EARTH-TO-ORBIT CAMPAIGN MASTERY — All 5 Worlds Remineralized!</div>'
            : ''
        }
        ${
          upgrades.length
            ? `<div id="report-upgrades" style="background:rgba(4,16,28,0.78);border:1px solid rgba(251,191,36,0.4);border-radius:10px;padding:7px 10px;margin-bottom:8px;font-size:0.76rem;color:#fde68a;">🔧 Lab Upgrade Unlocked: <strong>${upgrades.map(esc).join(', ')}</strong> — equip it in the Bio-Actuator Lab!</div>`
            : ''
        }

        <div class="shield-grid" style="margin:8px 0;">
          <div class="mini-meter">
            <div class="mini-meter-label"><span>Restoration</span></div>
            <strong id="report-pts-restoration" class="report-num" style="font-size:0.84rem;color:#5eead4;">${sampleScoreReveal(breakdown.restorationPts, 0, reduced)}</strong>
          </div>
          <div class="mini-meter">
            <div class="mini-meter-label"><span>Technique</span></div>
            <strong id="report-pts-technique" class="report-num" style="font-size:0.84rem;color:#38bdf8;">${sampleScoreReveal(breakdown.techniquePts, 0, reduced)}</strong>
          </div>
          <div class="mini-meter">
            <div class="mini-meter-label"><span>Ecology</span></div>
            <strong id="report-pts-ecology" class="report-num" style="font-size:0.84rem;color:#34d399;">${sampleScoreReveal(breakdown.ecologyPts, 0, reduced)}</strong>
          </div>
          <div class="mini-meter">
            <div class="mini-meter-label"><span>Par Time</span></div>
            <strong id="report-pts-partime" class="report-num" style="font-size:0.84rem;color:#fbbf24;">${sampleScoreReveal(breakdown.parTimePts, 0, reduced)}</strong>
          </div>
        </div>

        <div class="row-between" style="font-size:0.8rem;margin-bottom:8px;">
          <span>Total Score: <strong id="report-total-score" class="report-num">${sampleScoreReveal(breakdown.totalScore, 0, reduced)}</strong> (${breakdown.cleanlinessPct}% Clean)</span>
          <span style="color:#99f6e4;font-weight:700;">
            ✦ +${mode === 'PULP_RESCUE' ? this.report.bonusRescueIons : breakdown.ionsEarned} Fluoride Ions
          </span>
        </div>

        ${
          note
            ? `<details id="report-field-note" class="report-lesson">
                <summary>📜 Field note unlocked: ${esc(note.title)}</summary>
                <div class="report-lesson-body">
                  <div style="font-size:0.7rem;color:#38bdf8;font-weight:700;">${esc(note.yearLabel)} • ${esc(dentalLesson.focusTeethBadge)}</div>
                  <div style="font-size:0.76rem;color:#cbd5e1;margin-top:3px;">${esc(note.enamelLesson)}</div>
                </div>
              </details>`
            : `<details id="report-dental-lesson" class="report-lesson">
                <summary>🦷 Dental pearl: ${esc(dentalLesson.headline)}</summary>
                <div class="report-lesson-body">
                  <div style="font-size:0.7rem;color:#5eead4;font-weight:700;">${esc(dentalLesson.focusTeethBadge)}</div>
                  <div style="font-size:0.75rem;color:#cbd5e1;line-height:1.36;margin-top:3px;">${esc(dentalLesson.lesson)}</div>
                </div>
              </details>`
        }

        <div class="hub-actions-primary">
          ${nextDive}
          <button type="button" id="btn-report-replay" class="btn">↻ Replay Stage</button>
          <button type="button" id="btn-report-hub" class="btn ${nextDive ? '' : 'btn-primary'}">Smooth Bask Hub →</button>
        </div>

        <div id="report-charity-cta" class="charity-cta-strip">
          <span class="charity-cta-copy">
            💛 <strong>Enjoyed MouthLife?</strong> Help fund free 501(c)(3) dental relief through <strong>${esc(SMILE_ON_U_CHARITY.name)}</strong>.
          </span>
          <div class="row-wrap">
            <a
              id="lnk-report-donate"
              class="btn btn-sm btn-charity-pill"
              href="${esc(SMILE_ON_U_CHARITY.donateUrl)}"
              target="_blank"
              rel="noopener noreferrer"
            >💛 Donate ↗</a>
            <a
              id="lnk-report-site"
              class="btn btn-sm"
              href="${esc(SMILE_ON_U_CHARITY.websiteUrl)}"
              target="_blank"
              rel="noopener noreferrer"
            >SmileOnU.org ↗</a>
          </div>
        </div>
      </div>
    `;

    this.container.querySelector('#btn-report-mute')?.addEventListener('click', () => {
      this.callbacks.onToggleMute?.();
      this.syncMuteUi();
    });
    if (this.callbacks.bus) {
      this.disposers.add(this.callbacks.bus.on('audio:changed', () => this.syncMuteUi()));
    }
    this.container
      .querySelector('#btn-report-hub')
      ?.addEventListener('click', () => this.callbacks.onReturnToHub());
    this.container.querySelector('#btn-report-next')?.addEventListener('click', () => {
      if (this.report.nextWorldId) this.callbacks.onNextDive(this.report.nextWorldId);
    });
    this.container
      .querySelector('#btn-report-replay')
      ?.addEventListener('click', () => this.callbacks.onReplay());

    window.addEventListener('keydown', this.keyHandler);

    if (!reduced && typeof requestAnimationFrame === 'function') {
      this.startScoreReveal(breakdown);
    }

    requestAnimationFrame(() => {
      const primary = this.container?.querySelector<HTMLElement>(`#${pickReportPrimaryButtonId(this.report)}`);
      const button = primary?.getBoundingClientRect();
      const card = this.container?.querySelector('.cosmic-card')?.getBoundingClientRect();
      const primaryVisible = button && card && button.top >= card.top && button.bottom <= card.bottom;
      const target = primaryVisible ? primary : this.container?.querySelector<HTMLElement>('#report-headline');
      target?.focus({ preventScroll: true });
    });
  }

  private startScoreReveal(breakdown: ScoreBreakdown): void {
    const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const restEl = this.container?.querySelector<HTMLElement>('#report-pts-restoration');
    const techEl = this.container?.querySelector<HTMLElement>('#report-pts-technique');
    const ecoEl = this.container?.querySelector<HTMLElement>('#report-pts-ecology');
    const parEl = this.container?.querySelector<HTMLElement>('#report-pts-partime');
    const totEl = this.container?.querySelector<HTMLElement>('#report-total-score');

    const step = (nowMs: number) => {
      if (!this.container) return;
      const reducedNow = this.isReducedMotionActive();
      const progress = Math.min(1, Math.max(0, (nowMs - startMs) / REPORT_REVEAL_MS));
      if (restEl) restEl.textContent = String(sampleScoreReveal(breakdown.restorationPts, progress, reducedNow));
      if (techEl) techEl.textContent = String(sampleScoreReveal(breakdown.techniquePts, progress, reducedNow));
      if (ecoEl) ecoEl.textContent = String(sampleScoreReveal(breakdown.ecologyPts, progress, reducedNow));
      if (parEl) parEl.textContent = String(sampleScoreReveal(breakdown.parTimePts, progress, reducedNow));
      if (totEl) totEl.textContent = String(sampleScoreReveal(breakdown.totalScore, progress, reducedNow));
      if (progress < 1 && !reducedNow) {
        this.revealRafId = requestAnimationFrame(step);
      } else {
        this.revealRafId = null;
      }
    };
    this.revealRafId = requestAnimationFrame(step);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
    if (this.revealRafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.revealRafId);
      this.revealRafId = null;
    }
    this.disposers.disposeAll();
    this.container?.remove();
    this.container = null;
  }
}
