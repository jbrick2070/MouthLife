import { describe, expect, it } from 'vitest';
import { FLOSS_ZIP_DURATION_SEC, PROBE_RADIUS } from '../src/config/gameConfig';
import {
  buildAlleyWalls,
  circleIntersectsAABB,
  moveCircleWithSlide,
  resolveCircleCollisions,
  segmentsIntersect2D,
  stepCapillaryZip,
  tryStartCapillaryZip,
} from '../src/engine/physics/CollisionSystem';
import { plaqueCityCartridge } from '../src/worlds/plaqueCityCartridge';

describe('CollisionSystem', () => {
  const ridge = { minX: 8, maxX: 8.25, minZ: 6, maxZ: 10 };

  it('retains tangential travel and clears the rounded end of a ridge', () => {
    const start = { x: 8 - PROBE_RADIUS, z: 9 };
    const result = moveCircleWithSlide(start, { x: 0.9, z: 3 }, PROBE_RADIUS, 20, 20, [ridge]);
    expect(result.x).toBeGreaterThan(start.x + 0.35);
    expect(result.z).toBeGreaterThanOrEqual(12 - 1e-6);
    expect(circleIntersectsAABB(result.x, result.z, PROBE_RADIUS, ridge)).toBe(false);
  });

  it('blocks a fast step through a thin ridge', () => {
    const result = moveCircleWithSlide({ x: 6, z: 8 }, { x: 4, z: 0 }, PROBE_RADIUS, 20, 20, [ridge]);
    expect(result.x).toBeCloseTo(8 - PROBE_RADIUS);
    expect(result.z).toBe(8);
  });

  it('blocks HYDRA-1 probe (radius 0.65u) from walking into 0.90u interdental alleys', () => {
    const walls = [
      ...plaqueCityCartridge.wallBoxes,
      ...buildAlleyWalls(plaqueCityCartridge),
    ];

    // Alley 'alley_premolar_north' runs East-West at z=10.5 from x=30.2 to x=33.8 with width 0.90u
    const resolved = resolveCircleCollisions(
      { x: 31.8, z: 10.5 },
      PROBE_RADIUS,
      plaqueCityCartridge.worldWidth,
      plaqueCityCartridge.worldDepth,
      walls
    );
    // Probe cannot remain centered inside the 0.90u channel between flanking walls
    const stayedInNarrowCenter =
      Math.abs(resolved.x - 31.8) < 0.2 && Math.abs(resolved.z - 10.5) < 0.1;
    expect(stayedInNarrowCenter).toBe(false);
  });

  it('initiates and completes a 0.22s Capillary Tether-Zip across an interdental alley', () => {
    const candidate = tryStartCapillaryZip(
      { x: 29.5, z: 10.5 },
      { x: 1, z: 0 },
      plaqueCityCartridge.interdentalAlleys,
      plaqueCityCartridge.wallBoxes
    );
    expect(candidate).not.toBeNull();
    expect(candidate!.alley.id).toBe('alley_premolar_north');

    const mid = stepCapillaryZip(candidate!.zip, FLOSS_ZIP_DURATION_SEC * 0.5);
    expect(mid.done).toBe(false);
    expect(mid.pos.x).toBeGreaterThan(30.0);
    expect(mid.pos.x).toBeLessThan(33.8);

    const end = stepCapillaryZip(candidate!.zip, FLOSS_ZIP_DURATION_SEC * 0.6);
    expect(end.done).toBe(true);
    expect(end.pos.x).toBeCloseTo(33.8, 3);
    expect(end.pos.z).toBeCloseTo(10.5, 3);
  });

  it('initiates Capillary Tether-Zips in both East and West directions across South and Molar alleys', () => {
    const cases = [
      { id: 'alley_premolar_south', probe: { x: 29.6, z: 21.5 }, aim: { x: 1, z: 0 }, destX: 33.8 },
      { id: 'alley_premolar_south', probe: { x: 34.4, z: 21.5 }, aim: { x: -1, z: 0 }, destX: 30.2 },
      { id: 'alley_molar_crevice', probe: { x: 42.6, z: 16.0 }, aim: { x: 1, z: 0 }, destX: 46.6 },
      { id: 'alley_molar_crevice', probe: { x: 47.2, z: 16.0 }, aim: { x: -1, z: 0 }, destX: 43.2 },
    ];
    for (const c of cases) {
      const candidate = tryStartCapillaryZip(
        c.probe,
        c.aim,
        plaqueCityCartridge.interdentalAlleys,
        plaqueCityCartridge.wallBoxes
      );
      expect(candidate).not.toBeNull();
      expect(candidate!.alley.id).toBe(c.id);
      expect(candidate!.zip.to.x).toBeCloseTo(c.destX, 3);
    }
  });

  it('selects the closest alley mouth when two mouths are within entry distance', () => {
    const customAlleys = [
      { id: 'farther', endpointA: { x: 10, z: 10 }, endpointB: { x: 14, z: 10 }, width: 0.9, wallThickness: 1.5, bridgeId: 'b1' },
      { id: 'closer', endpointA: { x: 9.2, z: 10.2 }, endpointB: { x: 13.2, z: 10.2 }, width: 0.9, wallThickness: 1.5, bridgeId: 'b2' },
    ];
    const picked = tryStartCapillaryZip({ x: 8.9, z: 10.15 }, { x: 1, z: 0 }, customAlleys, []);
    expect(picked?.alley.id).toBe('closer');
  });

  it('accurately detects 2D line segment intersections for Biofilm Bridges', () => {
    expect(
      segmentsIntersect2D(
        { x: 30, z: 10.5 },
        { x: 34, z: 10.5 },
        { x: 31.8, z: 9.8 },
        { x: 31.8, z: 11.2 }
      )
    ).toBe(true);

    expect(
      segmentsIntersect2D(
        { x: 10, z: 10 },
        { x: 12, z: 10 },
        { x: 31.8, z: 9.8 },
        { x: 31.8, z: 11.2 }
      )
    ).toBe(false);
  });
});
