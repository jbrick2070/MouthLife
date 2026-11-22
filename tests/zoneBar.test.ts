import { describe, expect, it } from 'vitest';
import { DISTRICT_SEAL_CLEAN_RATIO } from '../src/config/gameConfig';
import { zoneBarModel, zoneIndexAt } from '../src/ui/hudHelpers';
import { plaqueCityCartridge } from '../src/worlds/plaqueCityCartridge';

// The same cases run in Swift (MouthLifeCoreTests.testZoneBar…), so both editions draw one bar.
describe('zoneIndexAt', () => {
  const zones = plaqueCityCartridge.districts;

  it('names the zone a point is inside', () => {
    expect(zoneIndexAt(7.5, 16, zones)).toBe(0);
    expect(zoneIndexAt(22.01, 16, zones)).toBe(1);
    expect(zoneIndexAt(50, 16, zones)).toBe(2);
  });

  it('gives a shared edge to the first zone, and a point off the tooth to the nearest', () => {
    expect(zoneIndexAt(22, 16, zones)).toBe(0);
    expect(zoneIndexAt(1, 16, zones)).toBe(0);
    expect(zoneIndexAt(32, 1, zones)).toBe(1);
    expect(zoneIndexAt(63, 30, zones)).toBe(2);
  });

  it('is -1 when a stage has no zones', () => {
    expect(zoneIndexAt(5, 5, [])).toBe(-1);
  });
});

describe('zoneBarModel', () => {
  it('fills each segment toward the share that seals its zone, and marks where HYDRA-1 is', () => {
    const bar = zoneBarModel([0.45, 0.9, 0.2], [false, false, false], 1, 0.9);
    expect(bar.map((s) => s.sealed)).toEqual([false, false, false]);
    expect(bar.map((s) => s.here)).toEqual([false, true, false]);
    expect(bar[0].fill).toBeCloseTo(0.5, 6);
    expect(bar[1].fill).toBe(1);
    expect(bar[2].fill).toBeCloseTo(0.2222222, 6);
  });

  it('a sealed zone is full, whatever its clean share reads', () => {
    const bar = zoneBarModel([0.5, 0.95], [true, false], -1, 0.9);
    expect(bar[0]).toEqual({ fill: 1, sealed: true, here: false });
    expect(bar[1]).toEqual({ fill: 1, sealed: false, here: false });
  });

  it('never leaves 0..1, and survives a bad number', () => {
    const bar = zoneBarModel([1.2, -0.1, Number.NaN], [false, false, false], 0, 0.9);
    expect(bar.map((s) => s.fill)).toEqual([1, 0, 0]);
  });

  it('uses the game’s seal share by default', () => {
    expect(DISTRICT_SEAL_CLEAN_RATIO).toBe(0.9);
    expect(zoneBarModel([0.45], [false], 0)[0].fill).toBeCloseTo(0.5, 6);
    expect(zoneBarModel([], [], 0)).toEqual([]);
  });
});
