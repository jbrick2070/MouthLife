import { describe, expect, it } from 'vitest';
import { computeObjectiveBreadcrumb, type ObjectiveInput } from '../src/ui/hudHelpers';

const base: ObjectiveInput = {
  mode: 'ARCADE',
  worldCleanRatio: 0.3,
  districtClean: [0.3, 0.3],
  sealed: [false, false],
  sitesLeftOpen: 3,
  domesRemaining: false,
  surgeReady: false,
};

describe('computeObjectiveBreadcrumb', () => {
  it('names the single remaining colony', () => {
    expect(computeObjectiveBreadcrumb({ ...base, sitesLeftOpen: 1 })).toContain('1 Commensal Colony left');
  });
  it('counts multiple colonies', () => {
    expect(computeObjectiveBreadcrumb(base)).toContain('Restore 3');
  });
  it('prompts the Fluoride Surge when nearly clean and ready', () => {
    const msg = computeObjectiveBreadcrumb({
      ...base,
      sitesLeftOpen: 0,
      districtClean: [1, 0.85],
      sealed: [true, false],
      surgeReady: true,
    });
    expect(msg).toContain('Fluoride Surge');
    expect(msg).toContain('final district');
  });
  it('asks to sweep the weakest district when nearly clean and surge is not ready', () => {
    const msg = computeObjectiveBreadcrumb({ ...base, sitesLeftOpen: 0, districtClean: [0.84, 0.88] });
    expect(msg).toContain('D1');
  });
  it('prioritizes EPS domes and handles completion', () => {
    expect(computeObjectiveBreadcrumb({ ...base, domesRemaining: true })).toContain('EPS dome');
    expect(computeObjectiveBreadcrumb({ ...base, sealed: [true, true] })).toContain('complete');
  });
  it('gives a default scrub path and a Pulp Rescue percentage', () => {
    expect(computeObjectiveBreadcrumb({ ...base, sitesLeftOpen: 0 })).toContain('Scrub enamel');
    expect(computeObjectiveBreadcrumb({ ...base, mode: 'PULP_RESCUE', worldCleanRatio: 0.5 })).toContain('35%');
  });
});
