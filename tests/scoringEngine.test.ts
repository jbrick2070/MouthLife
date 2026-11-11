import { describe, expect, it } from 'vitest';
import {
  SCORE_MIN_PARTIME_FLOOR,
  SYNERGY_MAX,
  SYNERGY_MIN,
} from '../src/config/gameConfig';
import { ScoringEngine } from '../src/engine/scoring/ScoringEngine';

describe('ScoringEngine', () => {
  it('climbs Synergy multiplier only on actuator alternation up to 3.0x and decays when idle', () => {
    const scoring = new ScoringEngine();
    expect(scoring.getSynergyMultiplier()).toBe(SYNERGY_MIN);

    // Repeating brush does not increment Synergy
    scoring.recordSweepingCellsCleaned(10, true);
    scoring.recordSweepingCellsCleaned(10, true);
    expect(scoring.getSynergyMultiplier()).toBe(1.0);

    // Alternating Brush -> Floss -> Rinse -> Brush climbs +0.25x per switch
    scoring.recordFlossSlice(1, 10);
    expect(scoring.getSynergyMultiplier()).toBeCloseTo(1.25, 3);
    scoring.recordIonRinseSeal(50);
    expect(scoring.getSynergyMultiplier()).toBeCloseTo(1.5, 3);

    for (let i = 0; i < 12; i++) {
      scoring.recordSweepingCellsCleaned(5, true);
      scoring.recordFlossSlice(1, 5);
    }
    expect(scoring.getSynergyMultiplier()).toBe(SYNERGY_MAX);

    // Idle > 4.0s decays back toward 1.0x
    scoring.step(20.0);
    expect(scoring.getSynergyMultiplier()).toBe(SYNERGY_MIN);
  });

  it('enforces the 250-pt par-time floor and requires allSitesRestored for FLUORAPATITE_GOLD', () => {
    const scoring = new ScoringEngine();
    for (let i = 0; i < 12; i++) {
      scoring.recordSweepingCellsCleaned(120, true);
      scoring.recordFlossSlice(2, 40);
      scoring.recordCommensalSiteRestored();
      scoring.recordSucroseCleared(1);
    }

    // Well past 2x parTimeSec -> parTimePts floors at 250
    const slowBreakdown = scoring.evaluateBreakdown({
      worldCleanRatio: 1.0,
      sitesTotal: 12,
      elapsedSec: 900,
      parTimeSec: 270,
    });
    expect(slowBreakdown.parTimePts).toBe(SCORE_MIN_PARTIME_FLOOR);

    // Fast 100% run with all 12 sites restored -> FLUORAPATITE_GOLD
    const goldBreakdown = scoring.evaluateBreakdown({
      worldCleanRatio: 1.0,
      sitesTotal: 12,
      elapsedSec: 180,
      parTimeSec: 270,
    });
    expect(goldBreakdown.totalScore).toBe(10000);
    expect(goldBreakdown.grade).toBe('FLUORAPATITE_GOLD');

    // Missing even 1 site caps grade at 'S' despite >= 9400 totalScore
    const missedSiteBreakdown = scoring.evaluateBreakdown({
      worldCleanRatio: 1.0,
      sitesTotal: 13,
      elapsedSec: 180,
      parTimeSec: 270,
    });
    expect(missedSiteBreakdown.totalScore).toBeGreaterThanOrEqual(9400);
    expect(missedSiteBreakdown.grade).toBe('S');
  });
});
