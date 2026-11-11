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

  it('maps all 14 sculpted 3D Companion Arch crowns (0..13) from Right 2nd Molar to Left 2nd Molar', () => {
    const rightM2 = getCompanionCrownSummary(0);
    expect(rightM2.toothTypeLabel).toBe('Right 2nd Molar');
    expect(rightM2.upperTooth.universal).toBe(2);
    expect(rightM2.lowerTooth.universal).toBe(31);

    const rightC1 = getCompanionCrownSummary(6);
    expect(rightC1.toothTypeLabel).toBe('Right Central Incisor');
    expect(rightC1.upperTooth.universal).toBe(8);
    expect(rightC1.lowerTooth.universal).toBe(25);

    const leftC1 = getCompanionCrownSummary(7);
    expect(leftC1.toothTypeLabel).toBe('Left Central Incisor');
    expect(leftC1.upperTooth.universal).toBe(9);
    expect(leftC1.lowerTooth.universal).toBe(24);

    const leftM2 = getCompanionCrownSummary(13);
    expect(leftM2.toothTypeLabel).toBe('Left 2nd Molar');
    expect(leftM2.upperTooth.universal).toBe(15);
    expect(leftM2.lowerTooth.universal).toBe(18);
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
