import { describe, expect, it } from 'vitest';
import { pickReportPrimaryButtonId, sampleScoreReveal } from '../src/ui/MissionReportOverlay';

describe('Mission report keyboard start & score celebration', () => {
  it('focuses the next dive after a win, replay after a loss, hub when there is no next world', () => {
    expect(pickReportPrimaryButtonId({ won: true, mode: 'ARCADE', nextWorldId: 'world_2', nextWorldTitle: 'Crescent Sulcus' })).toBe('btn-report-next');
    expect(pickReportPrimaryButtonId({ won: false, mode: 'ARCADE', nextWorldId: 'world_2', nextWorldTitle: 'Crescent Sulcus' })).toBe('btn-report-replay');
    expect(pickReportPrimaryButtonId({ won: true, mode: 'PULP_RESCUE', nextWorldId: null, nextWorldTitle: null })).toBe('btn-report-hub');
  });

  it('eases score numbers monotonically from 0 to target and lands immediately under reduced motion', () => {
    expect(sampleScoreReveal(2450, 0, false)).toBe(0);
    const quarter = sampleScoreReveal(2450, 0.25, false);
    const half = sampleScoreReveal(2450, 0.5, false);
    expect(quarter).toBeGreaterThan(2450 * 0.25); // ease-out leads linear
    expect(half).toBeGreaterThan(quarter);
    expect(sampleScoreReveal(2450, 1, false)).toBe(2450);

    // Reduced motion renders the final score on frame 0 with zero count-up
    expect(sampleScoreReveal(2450, 0, true)).toBe(2450);
    expect(sampleScoreReveal(2450, 0.3, true)).toBe(2450);
  });
});
