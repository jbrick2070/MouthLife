import { describe, expect, it } from 'vitest';
import {
  CELL_SIZE,
  SALIVA_SPRING_PH_BOOST,
  STEPHAN_DROP_PH,
  STEPHAN_RECOVERY_SEC,
} from '../src/config/gameConfig';
import { OralChemistrySim } from '../src/engine/surface/OralChemistrySim';

describe('OralChemistrySim', () => {
  it('models the 1940 Stephan Curve 20s sucrose drop and resets timer on repeated hits', () => {
    const chem = new OralChemistrySim(16, 16, 7.0);
    expect(chem.getCellPh(0)).toBeCloseTo(7.0, 3);

    chem.triggerSucroseStephanHit();
    expect(chem.getStephanTimerSec()).toBeCloseTo(STEPHAN_RECOVERY_SEC, 3);
    expect(chem.getCellPh(0)).toBeCloseTo(STEPHAN_DROP_PH, 3);

    // Advance 10s -> halfway recovered
    chem.step(10.0);
    expect(chem.getCellPh(0)).toBeCloseTo((7.0 + STEPHAN_DROP_PH) * 0.5, 2);

    // Repeated sucrose sip resets the full 20s acid window!
    chem.triggerSucroseStephanHit();
    expect(chem.getStephanTimerSec()).toBeCloseTo(STEPHAN_RECOVERY_SEC, 3);
    expect(chem.getCellPh(0)).toBeCloseTo(STEPHAN_DROP_PH, 3);

    chem.step(20.0);
    expect(chem.getCellPh(0)).toBeCloseTo(7.0, 3);
  });

  it('buffers localized acid zones via Salivary Bicarbonate Springs and cools gum irritation', () => {
    const chem = new OralChemistrySim(16, 16, 7.0);
    const gx = Math.floor(8.0 / CELL_SIZE);
    const gz = Math.floor(8.0 / CELL_SIZE);
    const centerIdx = gz * chem.gridW + gx;

    chem.applyAcidZone(8.0, 8.0, 2.5, 4.7);
    expect(chem.getCellPh(centerIdx)).toBeCloseTo(4.7, 3);

    chem.triggerSalivaSpring(8.0, 8.0, 3.0);
    expect(chem.getCellPh(centerIdx)).toBeCloseTo(SALIVA_SPRING_PH_BOOST, 3);

    chem.addGumIrritation(8.0, 8.0, 2.0, 0.8);
    expect(chem.gumIrritation[centerIdx]).toBeCloseTo(0.8, 3);

    chem.step(4.0);
    expect(chem.gumIrritation[centerIdx]).toBeLessThan(0.4);
  });
});
