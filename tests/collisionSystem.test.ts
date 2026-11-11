import { describe, expect, it } from 'vitest';
import { FLOSS_ZIP_DURATION_SEC, PROBE_RADIUS } from '../src/config/gameConfig';
import {
  buildAlleyWalls,
  resolveCircleCollisions,
  segmentsIntersect2D,
  stepCapillaryZip,
  tryStartCapillaryZip,
} from '../src/engine/physics/CollisionSystem';
import { plaqueCityCartridge } from '../src/worlds/plaqueCityCartridge';

describe('CollisionSystem', () => {
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
