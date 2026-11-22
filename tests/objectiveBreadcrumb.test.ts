import { describe, expect, it } from 'vitest';
import {
  compactObjectiveBreadcrumb,
  computeObjectiveBreadcrumb,
  findWayfinderLabelY,
  placeWorldCallout,
  shouldShowDiveIntroToast,
  shouldHintFlossMiss,
  wayfinderLabelY,
  type ObjectiveInput,
} from '../src/ui/hudHelpers';

it('keeps a crowded landscape wayfinder clear of the Zip prompt and neighboring pills', () => {
  const anchor = { cx: 240, cy: 153, halfW: 35, halfH: 11 };
  const zip = { cx: 370, cy: 149, halfW: 150, halfH: 20 };
  const colony = { cx: 215, cy: 187, halfW: 32, halfH: 11 };
  expect(findWayfinderLabelY(anchor, 115, 240, [zip, colony])).toBe(214);
  expect(findWayfinderLabelY(anchor, 115, 210, [zip, colony])).toBeNull();
});

const base: ObjectiveInput = {
  mode: 'ARCADE',
  worldCleanRatio: 0.3,
  districtClean: [0.3, 0.3],
  sealed: [false, false],
  sitesLeftOpen: 3,
  domesRemaining: false,
  surgeReady: false,
};

describe('compactObjectiveBreadcrumb (the phone HUD line)', () => {
  it('keeps just the goal for the colony lines, which were cut off mid-word on phones', () => {
    expect(compactObjectiveBreadcrumb(base)).toBe('Restore 3 colonies');
    expect(compactObjectiveBreadcrumb({ ...base, sitesLeftOpen: 1 })).toBe('1 colony left — follow ➤');
  });
  it('leaves every other goal exactly as the full line', () => {
    const domes = { ...base, domesRemaining: true };
    expect(compactObjectiveBreadcrumb(domes)).toBe(computeObjectiveBreadcrumb(domes));
    const done = { ...base, sealed: [true, true] };
    expect(compactObjectiveBreadcrumb(done)).toBe(computeObjectiveBreadcrumb(done));
  });
});

describe('computeObjectiveBreadcrumb', () => {
  it('names the single remaining colony', () => {
    expect(computeObjectiveBreadcrumb({ ...base, sitesLeftOpen: 1 })).toContain('1 helper colony left');
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
    expect(computeObjectiveBreadcrumb({ ...base, domesRemaining: true })).toContain('Crack the dome');
    expect(computeObjectiveBreadcrumb({ ...base, sealed: [true, true] })).toContain('you did it');
  });
  it('gives a default scrub path and a Pulp Rescue percentage', () => {
    expect(computeObjectiveBreadcrumb({ ...base, sitesLeftOpen: 0 })).toContain('Scrub enamel');
    expect(computeObjectiveBreadcrumb({ ...base, mode: 'PULP_RESCUE', worldCleanRatio: 0.5 })).toContain('35%');
  });

  it('surfaces the active acid clock and rescue urgency without hiding EPS guidance', () => {
    expect(computeObjectiveBreadcrumb({ ...base, acidLockSec: 5.1 })).toContain('Acid clock 6s');
    expect(computeObjectiveBreadcrumb({ ...base, acidLockSec: 0, domesRemaining: true })).toContain('Crack the dome');
    expect(computeObjectiveBreadcrumb({ ...base, mode: 'PULP_RESCUE', worldCleanRatio: 0.5, rescueRemainingSec: 12.2 })).toContain('13s left');
  });

  it('keeps mobile objective breadcrumbs concise enough for narrow 2-line HUD strips', () => {
    expect(computeObjectiveBreadcrumb({ ...base, sitesLeftOpen: 10 }).length).toBeLessThanOrEqual(48);
    expect(computeObjectiveBreadcrumb({ ...base, domesRemaining: true }).length).toBeLessThanOrEqual(48);
  });

  it('clamps wayfinder labels between top HUD and bottom thumb deck', () => {
    expect(wayfinderLabelY(760, 56, 22, 718)).toBe(701);
    expect(wayfinderLabelY(20, 56, 22, 718)).toBe(71);
  });

  it('suppresses the competing frame-0 intro toast only on a new player first World 1 dive', () => {
    expect(shouldShowDiveIntroToast('ARCADE', 'world_1', false)).toBe(false);
    expect(shouldShowDiveIntroToast('ARCADE', 'world_1', true)).toBe(true);
    expect(shouldShowDiveIntroToast('ARCADE', 'world_2', false)).toBe(true);
    expect(shouldShowDiveIntroToast('PULP_RESCUE', 'pulp_rescue', false)).toBe(true);
  });
});

describe('Floss feedback & world callout placement', () => {
  it('only suggests moving closer when the cast did not zip, hit a target, crack armor, or sit under an active zip prompt', () => {
    expect(shouldHintFlossMiss(false, 0, 0, false)).toBe(true);
    expect(shouldHintFlossMiss(false, 0, 0, true)).toBe(false);
    expect(shouldHintFlossMiss(true, 0, 0, false)).toBe(false);
    expect(shouldHintFlossMiss(false, 1, 0, false)).toBe(false);
    expect(shouldHintFlossMiss(false, 0, 1, false)).toBe(false);
  });

  it('keeps floating world callouts clear of the top HUD, bottom thumb deck, horizontal edges, and zip/wayfinder pills', () => {
    const topClamped = placeWorldCallout({
      x: 10,
      bottomY: 40,
      width: 160,
      height: 28,
      viewportW: 390,
      hudBottom: 62,
      deckTop: 710,
    });
    expect(topClamped.x).toBeGreaterThanOrEqual(88);
    expect(topClamped.bottomY - 28).toBeGreaterThanOrEqual(68);

    const bottomClamped = placeWorldCallout({
      x: 388,
      bottomY: 790,
      width: 160,
      height: 28,
      viewportW: 390,
      hudBottom: 62,
      deckTop: 710,
    });
    expect(bottomClamped.x).toBeLessThanOrEqual(390 - 88);
    expect(bottomClamped.bottomY).toBeLessThanOrEqual(702);

    const dodged = placeWorldCallout({
      x: 195,
      bottomY: 414,
      width: 160,
      height: 28,
      viewportW: 390,
      hudBottom: 62,
      deckTop: 710,
      occupied: [{ cx: 195, cy: 400, halfW: 110, halfH: 20 }],
    });
    expect(Math.abs(dodged.bottomY - 14 - 400)).toBeGreaterThanOrEqual(20 + 14 + 4);
  });
});

describe('goal lines without keyboard hints (touch screens and the native app)', () => {
  const none = { ...base, sitesLeftOpen: 0 };
  it('are whole sentences of their own, never a keyed line with "[Q]" cut out', () => {
    expect(computeObjectiveBreadcrumb(none, false)).toBe('Scrub enamel → bring back colonies → Surge!');
    expect(computeObjectiveBreadcrumb({ ...none, surgeReady: true }, false)).toBe('Scrub enamel → fire Surge to seal!');
    expect(computeObjectiveBreadcrumb({ ...none, districtClean: [0.85, 0.85], surgeReady: true }, false)).toBe(
      'Almost clean! Fire Fluoride Surge to seal!'
    );
    expect(
      computeObjectiveBreadcrumb({ ...none, districtClean: [0.95, 0.85], sealed: [true, false], surgeReady: true }, false)
    ).toBe('Fire Fluoride Surge to seal final district!');
    expect(computeObjectiveBreadcrumb({ ...none, domesRemaining: true }, false)).toBe('🛡️ Crack the dome: Floss or Surge!');
  });

  it('never show a key, in the full line or the phone line', () => {
    const cases: ObjectiveInput[] = [
      none,
      { ...none, surgeReady: true },
      { ...none, domesRemaining: true },
      { ...none, districtClean: [0.85, 0.85], surgeReady: true },
      { ...base, sitesLeftOpen: 1 },
      { ...base, sitesLeftOpen: 7 },
    ];
    for (const inp of cases) {
      expect(computeObjectiveBreadcrumb(inp, false)).not.toMatch(/\[[A-Z]\]/);
      expect(compactObjectiveBreadcrumb(inp, false)).not.toMatch(/\[[A-Z]\]/);
    }
    // With keys (a computer) the lines are unchanged.
    expect(computeObjectiveBreadcrumb(none)).toBe('Scrub enamel → bring back colonies → Surge [Q]!');
  });

  it('the rescue line is one sentence with its numbers, so it translates whole', () => {
    const rescue: ObjectiveInput = { ...base, mode: 'PULP_RESCUE', worldCleanRatio: 0.73, rescueRemainingSec: 39.2 };
    expect(computeObjectiveBreadcrumb(rescue)).toBe('Pulp: 12% more • 40s left — scrub!');
    expect(computeObjectiveBreadcrumb({ ...rescue, rescueRemainingSec: undefined })).toBe('Pulp: 12% more — scrub!');
    expect(computeObjectiveBreadcrumb({ ...rescue, worldCleanRatio: 0.9 })).toBe('Patching… the pulp is safe!');
  });
});
