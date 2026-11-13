import { describe, expect, it } from 'vitest';
import { DENTAL_CHART_CONTENT_FOR_TESTS } from './helpers/plainLanguage';
import {
  BRUSH_ALONG_FULL_IONS,
  DIVE_MAX_IONS,
  DIVE_MIN_IONS,
  PULP_RESCUE_WIN_IONS,
  TREAT_ION_REWARD,
  TREAT_MAX_REWARDED_PER_HOUR,
} from '../src/config/gameConfig';
import { brushAlongIons, brushAlongMultiplier } from '../src/engine/persistence/HabitBank';
import { ScoringEngine } from '../src/engine/scoring/ScoringEngine';

describe('brushing is the main way to earn Fluoride Ions', () => {
  it('pays the base for brushing, x1.5 with one extra step and x2 with floss and rinse', () => {
    expect(brushAlongIons(false, false)).toBe(50);
    expect(brushAlongIons(true, false)).toBe(75);
    expect(brushAlongIons(false, true)).toBe(75);
    expect(brushAlongIons(true, true)).toBe(100);
    expect(brushAlongMultiplier(false, false)).toBe(1);
    expect(brushAlongMultiplier(true, false)).toBe(1.5);
    expect(brushAlongMultiplier(true, true)).toBe(2);
  });

  it('a whole hour of treats pays less than one plain brush', () => {
    expect(TREAT_ION_REWARD * TREAT_MAX_REWARDED_PER_HOUR).toBeLessThan(BRUSH_ALONG_FULL_IONS);
  });

  it('a perfect dive pays at most half of one plain brush, and a poor one still pays a little', () => {
    expect(ScoringEngine.computeIonsEarned(10_000)).toBe(DIVE_MAX_IONS);
    expect(DIVE_MAX_IONS).toBeLessThanOrEqual(BRUSH_ALONG_FULL_IONS / 2);
    expect(ScoringEngine.computeIonsEarned(0)).toBe(DIVE_MIN_IONS);
    expect(ScoringEngine.computeIonsEarned(6_000)).toBe(15);
  });

  it('winning a Pulp Rescue pays less than a plain brush', () => {
    expect(PULP_RESCUE_WIN_IONS).toBeLessThan(BRUSH_ALONG_FULL_IONS);
  });
});

describe('on-screen text stays in plain words', () => {
  // Words a 4th grader would not know. Proper names of people (e.g. Dr. Stephan) are allowed.
  const HARD_WORDS =
    /hydroxyapatite|fluorapatite|commensal|interdental|interproximal|sulcus|biofilms? act|pellicle|\bEPS\b|quorum|sucrose|remineral|demineral|capillary|occlusal groove|gingiv|cervical|fissure|bicarbonate|endodont|permadeath|nanorod|ameloblast|lattice|monotonic|mastication|filament/i;

  it('has no jargon in lessons, tips, history notes, upgrades or world text', () => {
    expect(DENTAL_CHART_CONTENT_FOR_TESTS.length).toBeGreaterThan(150);
    const offenders = DENTAL_CHART_CONTENT_FOR_TESTS.filter((text) => HARD_WORDS.test(text));
    expect(offenders).toEqual([]);
  });

  it('keeps lessons short enough to leave the 3D view open', () => {
    const tooLong = DENTAL_CHART_CONTENT_FOR_TESTS.filter((text) => text.split(/\s+/).length > 75);
    expect(tooLong).toEqual([]);
  });
});
