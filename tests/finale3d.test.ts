import { describe, expect, it } from 'vitest';
import { CAMPAIGN_PIECES, ENDING_TIMES, FINALE_TIMES, FINALE_HOST_IDS } from '../src/config/cityFinale';
import { cityArtForHost } from '../src/config/citySkylines';
import {
  CAMERA_KEYS,
  burstSparks3D,
  burstWorld,
  emblemFractal,
  emblemFractalNodes,
  endingCamera3D,
  finale3DChecksum,
  finaleCamera3D,
  goldenMolarMesh,
  ledge3D,
  molarRootMesh,
  mountainColumns,
  mountainFront,
  MOUNTAIN_3D,
} from '../src/config/finale3d';

describe('3D finale maths', () => {
  it('runs the camera through its keys without jumps, and holds still with Reduce Motion', () => {
    expect(CAMERA_KEYS[0][0]).toBe(0);
    expect(CAMERA_KEYS[CAMERA_KEYS.length - 1][0]).toBe(FINALE_TIMES.end);
    let prev = finaleCamera3D(0, false).pos;
    for (let t = 0.02; t <= FINALE_TIMES.end; t += 0.02) {
      const pos = finaleCamera3D(t, false).pos;
      const step = Math.hypot(pos[0] - prev[0], pos[1] - prev[1], pos[2] - prev[2]);
      // the fastest move is the pull-back as the city blazes (7 to 8 s): eased, never a cut
      expect(step).toBeLessThan(1.5);
      prev = pos;
    }
    const still = new Set<string>();
    for (let t = 0; t <= FINALE_TIMES.end; t += 0.25) still.add(JSON.stringify(finaleCamera3D(t, true)));
    expect(still.size).toBe(3);
    for (let t = 0; t <= ENDING_TIMES.end; t += 0.5) {
      const shot = endingCamera3D(t, false);
      expect(shot.pos.every(Number.isFinite)).toBe(true);
    }
  });

  it('grows each city its own fractal sign, then folds it into the coin', () => {
    expect([0, 1, 2, 3, 4].map((i) => emblemFractalNodes(i).length)).toEqual([40, 259, 157, 156, 145]);
    for (let city = 0; city < CAMPAIGN_PIECES; city++) {
      expect(emblemFractal(city, FINALE_TIMES.emblemBurst - 0.01, false)).toHaveLength(0);
      const bloom = emblemFractal(city, FINALE_TIMES.emblemBurst + 1, false);
      expect(bloom.length).toBe(emblemFractalNodes(city).length);
      expect(emblemFractal(city, FINALE_TIMES.gatherEnd, false)).toHaveLength(0);
    }
  });

  it('splits every firework spark into a smaller burst partway through', () => {
    const plan = cityArtForHost('toronto')!.finale!;
    const burst = plan.bursts[0];
    const center = burstWorld(burst, 0);
    const early = burstSparks3D(burst, 0, burst.t + 0.9 + 0.3, plan.show, center);
    const late = burstSparks3D(burst, 0, burst.t + 0.9 + 1.5, plan.show, center);
    expect(early.every((s) => s.gen === 0)).toBe(true);
    expect(late.length).toBeGreaterThan(early.length);
    expect(late.every((s) => s.gen === 1)).toBe(true);
  });

  it('builds a closed molar crown, two roots, and a crystal mountain the ledges sit on', () => {
    for (const mesh of [goldenMolarMesh(), molarRootMesh(-1), molarRootMesh(1)]) {
      const vertices = mesh.positions.length / 3;
      expect(mesh.indices.length % 3).toBe(0);
      expect(Math.max(...mesh.indices)).toBeLessThan(vertices);
      expect(mesh.normals).toHaveLength(mesh.positions.length);
    }
    const columns = mountainColumns();
    expect(columns.length).toBeGreaterThan(300);
    expect(Math.max(...columns.map((c) => c.top))).toBeLessThanOrEqual(MOUNTAIN_3D.peakY);
    for (let i = -1; i <= CAMPAIGN_PIECES; i++) {
      const l = ledge3D(i);
      expect(l[2]).toBeCloseTo(mountainFront(l[0], l[1]) + 0.06, 9);
    }
  });

  it('gives each city a stable checksum (the native app compares against it)', () => {
    FINALE_HOST_IDS.forEach((host, i) => {
      const plan = cityArtForHost(host)!.finale!;
      const a = finale3DChecksum(plan.bursts, plan.show, i);
      expect(Number.isFinite(a)).toBe(true);
      expect(finale3DChecksum(plan.bursts, plan.show, i)).toBe(a);
    });
  });
});
