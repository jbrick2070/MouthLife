import { describe, expect, it } from 'vitest';
import {
  ADULT_TEETH_BY_UNIVERSAL,
  formatToothBadge,
  getCompanionCrownSummary,
  getToothByFdi,
  getToothByUniversal,
  getWorldDentalLesson,
  QUADRANT_NUMBERING_META,
  TOOTH_SURFACES_GUIDE,
} from '../src/config/dentalChart';
import { quadrantToothRange } from '../src/engine/render/PacerPropRig';

describe('Clinical 32-tooth numbering & dental education reference', () => {
  it('defines all 32 permanent teeth with unique Universal, FDI, and Palmer codes', () => {
    expect(ADULT_TEETH_BY_UNIVERSAL).toHaveLength(32);
    const universals = new Set(ADULT_TEETH_BY_UNIVERSAL.map((t) => t.universal));
    const fdis = new Set(ADULT_TEETH_BY_UNIVERSAL.map((t) => t.fdi));
    const palmers = new Set(ADULT_TEETH_BY_UNIVERSAL.map((t) => t.palmer));
    expect(universals.size).toBe(32);
    expect(fdis.size).toBe(32);
    expect(palmers.size).toBe(32);
  });

  it('matches textbook Universal <-> FDI <-> Palmer clinical landmarks', () => {
    const urWisdom = getToothByUniversal(1);
    expect(urWisdom.fdi).toBe('18');
    expect(urWisdom.palmer).toBe('8┘');
    expect(urWisdom.isWisdomTooth).toBe(true);
    expect(urWisdom.companionArchIndex).toBeNull();

    const urFirstMolar = getToothByUniversal(3);
    expect(urFirstMolar.clinicalName).toBe('Upper Right 1st Molar');
    expect(urFirstMolar.fdi).toBe('16');
    expect(urFirstMolar.fdiSpoken).toBe('one-six');
    expect(urFirstMolar.palmer).toBe('6┘');

    const urCentral = getToothByUniversal(8);
    expect(urCentral.fdi).toBe('11');
    expect(urCentral.palmer).toBe('1┘');

    const ulCentral = getToothByUniversal(9);
    expect(ulCentral.fdi).toBe('21');
    expect(ulCentral.palmer).toBe('└1');

    const ulWisdom = getToothByUniversal(16);
    expect(ulWisdom.fdi).toBe('28');
    expect(ulWisdom.palmer).toBe('└8');

    const llWisdom = getToothByUniversal(17);
    expect(llWisdom.fdi).toBe('38');
    expect(llWisdom.palmer).toBe('┌8');

    const llFirstMolar = getToothByUniversal(19);
    expect(llFirstMolar.fdi).toBe('36');
    expect(llFirstMolar.palmer).toBe('┌6');
    expect(getToothByFdi('36')?.universal).toBe(19);

    const lrCentral = getToothByUniversal(25);
    expect(lrCentral.fdi).toBe('41');
    expect(lrCentral.palmer).toBe('1┐');

    const lrWisdom = getToothByUniversal(32);
    expect(lrWisdom.fdi).toBe('48');
    expect(lrWisdom.palmer).toBe('8┐');

    expect(formatToothBadge(urFirstMolar, 'universal')).toBe('#3');
    expect(formatToothBadge(urFirstMolar, 'fdi')).toBe('16');
    expect(formatToothBadge(urFirstMolar, 'palmer')).toBe('6┘');
  });

  // The mouth on screen is a mirror: crown 0, the leftmost on screen, is the player's own left.
  it('maps all 14 sculpted 3D Companion Arch crowns (0..13) from Left 2nd Molar to Right 2nd Molar', () => {
    const leftM2 = getCompanionCrownSummary(0);
    expect(leftM2.toothTypeLabel).toBe('Left 2nd Molar');
    expect(leftM2.upperTooth.universal).toBe(15);
    expect(leftM2.lowerTooth.universal).toBe(18);

    const leftC1 = getCompanionCrownSummary(6);
    expect(leftC1.toothTypeLabel).toBe('Left Central Incisor');
    expect(leftC1.upperTooth.universal).toBe(9);
    expect(leftC1.lowerTooth.universal).toBe(24);

    const rightC1 = getCompanionCrownSummary(7);
    expect(rightC1.toothTypeLabel).toBe('Right Central Incisor');
    expect(rightC1.upperTooth.universal).toBe(8);
    expect(rightC1.lowerTooth.universal).toBe(25);

    const rightM2 = getCompanionCrownSummary(13);
    expect(rightM2.toothTypeLabel).toBe('Right 2nd Molar');
    expect(rightM2.upperTooth.universal).toBe(2);
    expect(rightM2.lowerTooth.universal).toBe(31);
  });

  it('names every crown by the side the 2-minute brush lights for it', () => {
    // The brush lights crowns 7..13 for the player's right quadrants (upper-right 0, lower-right 3)
    // and crowns 0..6 for the left ones. Home must call the same crowns Right and Left.
    for (const [quadrant, side, fdiUpper, fdiLower] of [
      [0, 'Right', '1', '4'],
      [3, 'Right', '1', '4'],
      [1, 'Left', '2', '3'],
      [2, 'Left', '2', '3'],
    ] as const) {
      const { from, to } = quadrantToothRange(quadrant);
      for (let crown = from; crown <= to; crown++) {
        const s = getCompanionCrownSummary(crown);
        expect(s.sideLabel, `crown ${crown}`).toBe(side);
        expect(s.upperTooth.fdi[0], `crown ${crown} upper`).toBe(fdiUpper);
        expect(s.lowerTooth.fdi[0], `crown ${crown} lower`).toBe(fdiLower);
      }
    }
  });

  it('covers all 4 quadrants, 5 tooth surfaces, and tailored per-world dentistry lessons', () => {
    const allQuadTeeth = QUADRANT_NUMBERING_META.flatMap((q) => q.chartOrderUniversal);
    expect(allQuadTeeth).toHaveLength(32);
    expect(new Set(allQuadTeeth).size).toBe(32);
    expect(TOOTH_SURFACES_GUIDE).toHaveLength(5);

    const ids = ['world_1', 'world_2', 'world_3', 'world_4', 'world_5'];
    const headlines = new Set(ids.map((id) => getWorldDentalLesson(id, 'ARCADE').headline));
    expect(headlines.size).toBe(5);
    expect(getWorldDentalLesson('pulp_rescue', 'PULP_RESCUE').id).toBe('pulp_rescue');
  });
});

import {
  buildSpotQuizQuestion,
  judgeSpotQuizAnswer,
  TOOTH_CROSS_SECTION_LAYERS,
  getToothLayer,
} from '../src/config/dentalChart';

describe('Spot That Tooth! quiz & cross-section', () => {
  it('builds deterministic prompts that always name a valid tooth', () => {
    for (let i = 0; i < 40; i++) {
      let seed = i * 0.0237;
      const q = buildSpotQuizQuestion(() => (seed = (seed + 0.6180339) % 1));
      expect(q.targetUniversal).toBeGreaterThanOrEqual(1);
      expect(q.targetUniversal).toBeLessThanOrEqual(32);
      expect(q.prompt.length).toBeGreaterThan(5);
    }
  });

  it('never repeats the previous target when asked to avoid it', () => {
    const q = buildSpotQuizQuestion(() => 0.0, 1);
    expect(q.targetUniversal).not.toBe(1);
  });

  it('judges answers with a gentle streak and a monotonic best streak', () => {
    const hit = judgeSpotQuizAnswer(19, 19, 2, 2);
    expect(hit.correct).toBe(true);
    expect(hit.nextStreak).toBe(3);
    expect(hit.bestStreak).toBe(3);
    const miss = judgeSpotQuizAnswer(19, 6, 3, 3);
    expect(miss.correct).toBe(false);
    expect(miss.nextStreak).toBe(0);
    expect(miss.bestStreak).toBe(3);
  });

  it('describes four cross-section layers with the documented mineral levels', () => {
    expect(TOOTH_CROSS_SECTION_LAYERS.map((l) => l.id)).toEqual(['enamel', 'dentin', 'pulp', 'ligament']);
    expect(getToothLayer('enamel').mineralPercent).toBe(96);
    expect(getToothLayer('dentin').mineralPercent).toBe(70);
  });
});
