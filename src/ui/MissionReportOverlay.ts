import { getHistoryNoteById } from '../config/hostsAndHistory';
import type { OverlayView, ScoreBreakdown } from '../engine/types';

export interface MissionReportData {
  mode: 'ARCADE' | 'PULP_RESCUE';
  worldId: string;
  won: boolean;
  breakdown: ScoreBreakdown;
  unlockedHistoryNoteId: string | null;
  bonusRescueIons: number;
}

export class MissionReportOverlay implements OverlayView {
  private container: HTMLElement | null = null;

  constructor(
    private readonly report: MissionReportData,
    private readonly callbacks: {
      onReturnToHub: () => void;
      onReplay: () => void;
    }
  ) {}

  mount(root: HTMLElement): void {
    this.container = document.createElement('div');
    this.container.className = 'hub-shell';
    root.appendChild(this.container);

    const { breakdown, won, mode } = this.report;
    const note = this.report.unlockedHistoryNoteId
      ? getHistoryNoteById(this.report.unlockedHistoryNoteId)
      : undefined;

    const headline =
      mode === 'PULP_RESCUE'
        ? won
          ? '🎉 Pulp Rescued! Dreaded Root Canal Avoided!'
          : '🛡️ Calcium-Hydroxide Emergency Stabilization Applied'
        : '✨ Plaque City Remineralized! Smooth Bask Restored!';

    const gradeLabel =
      breakdown.grade === 'FLUORAPATITE_GOLD' ? '★ FLUORAPATITE GOLD' : `GRADE ${breakdown.grade}`;

    this.container.innerHTML = `
      <div class="hub-top-bar glass-card ui-interactive row-between">
        <strong style="color:#5eead4;font-size:0.88rem;">🦷 CLINICAL MISSION REPORT</strong>
        <span class="pill-badge" style="border-color:#fbbf24;color:#fde68a;">${gradeLabel}</span>
      </div>

      <div class="hub-center-callout">
        <div class="bask-floating-pill">
          Drag 3D Arch to Admire Fresh-Mint Glassy Enamel!
        </div>
      </div>

      <div class="cosmic-card glass-card ui-interactive">
        <h2 style="margin:0 0 6px 0;font-size:1.1rem;color:#fff;">${headline}</h2>

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
          <button type="button" id="btn-report-replay" class="btn">↻ Replay Stage</button>
          <button type="button" id="btn-report-hub" class="btn btn-primary">Smooth Bask Hub →</button>
        </div>
      </div>
    `;

    this.container
      .querySelector('#btn-report-hub')
      ?.addEventListener('click', () => this.callbacks.onReturnToHub());
    this.container
      .querySelector('#btn-report-replay')
      ?.addEventListener('click', () => this.callbacks.onReplay());
  }

  dispose(): void {
    this.container?.remove();
    this.container = null;
  }
}
