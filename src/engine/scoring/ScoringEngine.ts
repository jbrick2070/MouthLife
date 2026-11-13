import {
  DIVE_MAX_IONS,
  DIVE_MIN_IONS,
  SCORE_MAX_ECOLOGY,
  SCORE_MAX_PARTIME,
  SCORE_MAX_RESTORATION,
  SCORE_MAX_TECHNIQUE,
  SCORE_MIN_PARTIME_FLOOR,
  SYNERGY_DECAY_PER_SEC,
  SYNERGY_IDLE_DECAY_DELAY_SEC,
  SYNERGY_MAX,
  SYNERGY_MIN,
  SYNERGY_STEP,
} from '../../config/gameConfig';
import type { ActuatorKind, MasteryGrade, ScoreBreakdown } from '../types';

export const GOLD_GRADE_MIN_SCORE = 9000;
export const GOLD_GRADE_MIN_CLEAN_RATIO = 0.95;

export class ScoringEngine {
  private techniqueRawPts = 0;
  private sitesRestored = 0;
  private sucroseHazardsCleared = 0;
  private acidWarnings = 0;
  private synergyMultiplier = SYNERGY_MIN;
  private lastActuatorKind: ActuatorKind | null = null;
  private idleSinceLastActionSec = 0;

  reset(): void {
    this.techniqueRawPts = 0;
    this.sitesRestored = 0;
    this.sucroseHazardsCleared = 0;
    this.acidWarnings = 0;
    this.synergyMultiplier = SYNERGY_MIN;
    this.lastActuatorKind = null;
    this.idleSinceLastActionSec = 0;
  }

  getSynergyMultiplier(): number {
    return this.synergyMultiplier;
  }

  private registerActuatorUse(kind: ActuatorKind): void {
    if (this.lastActuatorKind !== null && this.lastActuatorKind !== kind) {
      this.synergyMultiplier = Math.min(SYNERGY_MAX, this.synergyMultiplier + SYNERGY_STEP);
    }
    this.lastActuatorKind = kind;
    this.idleSinceLastActionSec = 0;
  }

  recordSweepingCellsCleaned(cellCount: number, isMovingSweep: boolean): void {
    if (cellCount <= 0) return;
    this.registerActuatorUse('brush');
    const basePerCell = isMovingSweep ? 1.5 : 0.6;
    this.techniqueRawPts = Math.min(
      SCORE_MAX_TECHNIQUE,
      this.techniqueRawPts + cellCount * basePerCell * this.synergyMultiplier
    );
  }

  recordAcidAbrasionWarning(count = 1): void {
    this.acidWarnings += count;
  }

  recordFlossSlice(targetsHit: number, cellsCleaned: number): void {
    if (targetsHit <= 0 && cellsCleaned <= 0) return;
    this.registerActuatorUse('floss');
    const pts = (targetsHit * 150 + cellsCleaned * 1.8) * this.synergyMultiplier;
    this.techniqueRawPts = Math.min(SCORE_MAX_TECHNIQUE, this.techniqueRawPts + pts);
  }

  recordSucroseCleared(count = 1): void {
    this.sucroseHazardsCleared += count;
  }

  recordIonRinseSeal(cellsSealed: number): void {
    if (cellsSealed <= 0) return;
    this.registerActuatorUse('rinse');
    // Cap per-wave seal points so synergy stays balanced across 3 districts
    const wavePts = Math.min(450, cellsSealed * 0.8) * this.synergyMultiplier;
    this.techniqueRawPts = Math.min(SCORE_MAX_TECHNIQUE, this.techniqueRawPts + wavePts);
  }

  recordCommensalSiteRestored(): void {
    this.sitesRestored++;
  }

  step(dt: number): void {
    this.idleSinceLastActionSec += dt;
    if (
      this.idleSinceLastActionSec > SYNERGY_IDLE_DECAY_DELAY_SEC &&
      this.synergyMultiplier > SYNERGY_MIN
    ) {
      this.synergyMultiplier = Math.max(
        SYNERGY_MIN,
        this.synergyMultiplier - SYNERGY_DECAY_PER_SEC * dt
      );
    }
  }

  evaluateBreakdown(params: {
    worldCleanRatio: number;
    sitesTotal: number;
    elapsedSec: number;
    parTimeSec: number;
  }): ScoreBreakdown {
    const cleanClamped = Math.max(0, Math.min(1, params.worldCleanRatio));
    const restorationPts = Math.round(cleanClamped * SCORE_MAX_RESTORATION);

    const careBonus = this.acidWarnings === 0 ? 250 : Math.max(0, 250 - this.acidWarnings * 25);
    const techniquePts = Math.min(
      SCORE_MAX_TECHNIQUE,
      Math.round(this.techniqueRawPts + careBonus)
    );

    const ecologyPts = Math.min(
      SCORE_MAX_ECOLOGY,
      this.sitesRestored * 120 + this.sucroseHazardsCleared * 50
    );

    let parTimePts = SCORE_MAX_PARTIME;
    if (params.parTimeSec > 0 && params.elapsedSec > params.parTimeSec) {
      const overRatio = Math.min(
        1,
        (params.elapsedSec - params.parTimeSec) / params.parTimeSec
      );
      parTimePts = Math.round(
        SCORE_MAX_PARTIME - (SCORE_MAX_PARTIME - SCORE_MIN_PARTIME_FLOOR) * overRatio
      );
    }
    parTimePts = Math.max(SCORE_MIN_PARTIME_FLOOR, Math.min(SCORE_MAX_PARTIME, parTimePts));

    const totalScore = restorationPts + techniquePts + ecologyPts + parTimePts;
    const allSitesRestored =
      params.sitesTotal === 0 || this.sitesRestored >= params.sitesTotal;

    const grade = ScoringEngine.computeGrade(totalScore, allSitesRestored, cleanClamped);
    const ionsEarned = ScoringEngine.computeIonsEarned(totalScore);

    return {
      restorationPts,
      techniquePts,
      ecologyPts,
      parTimePts,
      totalScore,
      grade,
      cleanlinessPct: Math.round(cleanClamped * 1000) / 10,
      sitesRestored: this.sitesRestored,
      sitesTotal: params.sitesTotal,
      elapsedSec: Math.round(params.elapsedSec * 10) / 10,
      ionsEarned,
    };
  }

  /** Dives pay a little (5 to 25): brushing your real teeth is the main way to earn. */
  static computeIonsEarned(totalScore: number): number {
    return Math.max(DIVE_MIN_IONS, Math.min(DIVE_MAX_IONS, Math.round(totalScore / 400)));
  }

  /** Gold needs a 9,000+ score, at least 95% of the enamel clean, and every site restored. */
  static computeGrade(totalScore: number, allSitesRestored: boolean, cleanRatio = 1.0): MasteryGrade {
    if (
      totalScore >= GOLD_GRADE_MIN_SCORE &&
      cleanRatio >= GOLD_GRADE_MIN_CLEAN_RATIO &&
      allSitesRestored
    ) {
      return 'FLUORAPATITE_GOLD';
    }
    if (totalScore >= 8500) return 'S';
    if (totalScore >= 7200) return 'A';
    if (totalScore >= 5500) return 'B';
    return 'C';
  }
}
