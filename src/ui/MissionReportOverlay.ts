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

export class MissionReportOverlay implements OverlayView {
  private disposers = new DisposerBag();
  private container: HTMLElement | null = null;

  constructor(
    private readonly report: MissionReportData,
    private readonly callbacks: {
      onReturnToHub: () => void;
      onReplay: () => void;
      onNextDive: (worldId: string) => void;
      isMuted?: () => boolean;
      onToggleMute?: () => void;
      bus?: EventBus;
    }
  ) {}

  private syncMuteUi(): void {
    const btn = this.container?.querySelector<HTMLButtonElement>('#btn-report-mute');
    if (!btn) return;
    const muted = this.callbacks.isMuted?.() ?? false;
    btn.textContent = muted ? '🔇' : '🔊';
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }

  mount(root: HTMLElement): void {
    this.container = document.createElement('div');
    this.container.className = 'hub-shell';
    root.appendChild(this.container);

    const { breakdown, won, mode } = this.report;
    const note = this.report.unlockedHistoryNoteId
      ? getHistoryNoteById(this.report.unlockedHistoryNoteId)
      : undefined;

    const headline = esc(buildReportHeadline(this.report));
    const upgrades = this.report.unlockedUpgradeNames ?? [];
    const nextDive =
      won && mode === 'ARCADE' && this.report.nextWorldId && this.report.nextWorldTitle
        ? `<button type="button" id="btn-report-next" class="btn btn-primary" style="grid-column:1 / -1;">Next Dive: ${esc(this.report.nextWorldTitle)} →</button>`
        : '';

    const gradeLabel =
      breakdown.grade === 'FLUORAPATITE_GOLD' ? '★ FLUORAPATITE GOLD' : `GRADE ${breakdown.grade}`;
    const muted = this.callbacks.isMuted?.() ?? false;

    this.container.innerHTML = `
      <div class="hub-top-bar glass-card ui-interactive row-between">
        <strong style="color:#5eead4;font-size:0.88rem;">🦷 CLINICAL MISSION REPORT</strong>
        <div class="row-wrap">
          <span class="pill-badge" style="border-color:#fbbf24;color:#fde68a;">${gradeLabel}</span>
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
        <h2 id="report-headline" style="margin:0 0 6px 0;font-size:1.1rem;color:#fff;">${headline}</h2>
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
            <strong style="font-size:0.84rem;color:#5eead4;">${breakdown.restorationPts}</strong>
          </div>
          <div class="mini-meter">
            <div class="mini-meter-label"><span>Technique</span></div>
            <strong style="font-size:0.84rem;color:#38bdf8;">${breakdown.techniquePts}</strong>
          </div>
          <div class="mini-meter">
            <div class="mini-meter-label"><span>Ecology</span></div>
            <strong style="font-size:0.84rem;color:#34d399;">${breakdown.ecologyPts}</strong>
          </div>
          <div class="mini-meter">
            <div class="mini-meter-label"><span>Par Time</span></div>
            <strong style="font-size:0.84rem;color:#fbbf24;">${breakdown.parTimePts}</strong>
          </div>
        </div>

        <div class="row-between" style="font-size:0.8rem;margin-bottom:8px;">
          <span>Total Score: <strong>${breakdown.totalScore}</strong> (${breakdown.cleanlinessPct}% Clean)</span>
          <span style="color:#99f6e4;font-weight:700;">
            ✦ +${mode === 'PULP_RESCUE' ? this.report.bonusRescueIons : breakdown.ionsEarned} Fluoride Ions
          </span>
        </div>

        ${
          note
            ? `<div style="background:rgba(4,16,28,0.78);border:1px solid rgba(45,212,191,0.35);border-radius:10px;padding:8px 10px;margin-bottom:10px;">
                <div style="font-size:0.7rem;color:#38bdf8;font-weight:700;">📜 HISTORICAL FIELD NOTE UNLOCKED • ${note.yearLabel}</div>
                <div style="font-size:0.82rem;font-weight:700;color:#fff;margin:2px 0;">${note.title}</div>
                <div style="font-size:0.74rem;color:#cbd5e1;">${note.enamelLesson}</div>
              </div>`
            : ''
        }

        <div class="hub-actions-primary">
          ${nextDive}
          <button type="button" id="btn-report-replay" class="btn">↻ Replay Stage</button>
          <button type="button" id="btn-report-hub" class="btn ${nextDive ? '' : 'btn-primary'}">Smooth Bask Hub →</button>
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
  }

  dispose(): void {
    this.disposers.disposeAll();
    this.container?.remove();
    this.container = null;
  }
}
