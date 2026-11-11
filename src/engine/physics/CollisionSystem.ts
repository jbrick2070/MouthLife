import {
  FLOSS_ZIP_DURATION_SEC,
  FLOSS_ZIP_ENTRY_DIST,
  FLOSS_ZIP_MAX_ANGLE_RAD,
  PROBE_RADIUS,
  ZIP_PROMPT_RADIUS,
} from '../../config/gameConfig';
import type {
  AABB2D,
  HillDef,
  InterdentalAlleyDef,
  ProbeZipState,
  Vec2,
  WorldCartridge,
} from '../types';

export function sampleTerrainHeight(cartridge: WorldCartridge, x: number, z: number): number {
  return sampleHillsHeight(cartridge.heightCuspHills, x, z);
}

export function sampleHillsHeight(hills: readonly HillDef[], x: number, z: number): number {
  let y = 0.25;
  for (const h of hills) {
    const dx = x - h.cx;
    const dz = z - h.cz;
    const dSq = dx * dx + dz * dz;
    const rSq = h.radius * h.radius;
    if (dSq < rSq) {
      const t = 1 - dSq / rSq;
      y += h.height * t * t;
    }
  }
  return y;
}

/**
 * Single-source derivation of flanking collision AABB walls from cartridge.interdentalAlleys[].
 * Supports axis-aligned north-south or east-west interproximal alleys.
 */
export function buildAlleyWalls(cartridge: WorldCartridge): AABB2D[] {
  const result: AABB2D[] = [];
  for (const alley of cartridge.interdentalAlleys) {
    const dx = Math.abs(alley.endpointB.x - alley.endpointA.x);
    const dz = Math.abs(alley.endpointB.z - alley.endpointA.z);
    const halfGap = alley.width * 0.5;
    const thick = alley.wallThickness;

    if (dz >= dx) {
      // North-South alley centered around X
      const cx = (alley.endpointA.x + alley.endpointB.x) * 0.5;
      const minZ = Math.min(alley.endpointA.z, alley.endpointB.z) + PROBE_RADIUS * 0.85;
      const maxZ = Math.max(alley.endpointA.z, alley.endpointB.z) - PROBE_RADIUS * 0.85;
      if (maxZ > minZ) {
        result.push({
          minX: cx - halfGap - thick,
          maxX: cx - halfGap,
          minZ,
          maxZ,
        });
        result.push({
          minX: cx + halfGap,
          maxX: cx + halfGap + thick,
          minZ,
          maxZ,
        });
      }
    } else {
      // East-West alley centered around Z
      const cz = (alley.endpointA.z + alley.endpointB.z) * 0.5;
      const minX = Math.min(alley.endpointA.x, alley.endpointB.x) + PROBE_RADIUS * 0.85;
      const maxX = Math.max(alley.endpointA.x, alley.endpointB.x) - PROBE_RADIUS * 0.85;
      if (maxX > minX) {
        result.push({
          minX,
          maxX,
          minZ: cz - halfGap - thick,
          maxZ: cz - halfGap,
        });
        result.push({
          minX,
          maxX,
          minZ: cz + halfGap,
          maxZ: cz + halfGap + thick,
        });
      }
    }
  }
  return result;
}

export function circleIntersectsAABB(
  cx: number,
  cz: number,
  radius: number,
  box: AABB2D
): boolean {
  const closestX = Math.max(box.minX, Math.min(cx, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(cz, box.maxZ));
  const dx = cx - closestX;
  const dz = cz - closestZ;
  return dx * dx + dz * dz < radius * radius - 1e-7;
}

export function resolveCircleCollisions(
  pos: Vec2,
  radius: number,
  worldWidth: number,
  worldDepth: number,
  walls: readonly AABB2D[]
): Vec2 {
  let x = Math.max(radius + 0.5, Math.min(worldWidth - radius - 0.5, pos.x));
  let z = Math.max(radius + 0.5, Math.min(worldDepth - radius - 0.5, pos.z));

  for (let pass = 0; pass < 3; pass++) {
    for (const box of walls) {
      const closestX = Math.max(box.minX, Math.min(x, box.maxX));
      const closestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
      const dx = x - closestX;
      const dz = z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          x += (dx / dist) * push;
          z += (dz / dist) * push;
        } else {
          // Center inside AABB: push out via nearest edge
          const penLeft = Math.abs(x - box.minX);
          const penRight = Math.abs(box.maxX - x);
          const penTop = Math.abs(z - box.minZ);
          const penBottom = Math.abs(box.maxZ - z);
          const minPen = Math.min(penLeft, penRight, penTop, penBottom);
          if (minPen === penLeft) x = box.minX - radius;
          else if (minPen === penRight) x = box.maxX + radius;
          else if (minPen === penTop) z = box.minZ - radius;
          else z = box.maxZ + radius;
        }
      }
    }
  }

  x = Math.max(radius + 0.5, Math.min(worldWidth - radius - 0.5, x));
  z = Math.max(radius + 0.5, Math.min(worldDepth - radius - 0.5, z));
  return { x, z };
}

/** Small steps let the circle follow the rounded ends of ridges without crossing a wall. */
export function moveCircleWithSlide(
  pos: Vec2,
  delta: Vec2,
  radius: number,
  worldWidth: number,
  worldDepth: number,
  walls: readonly AABB2D[]
): Vec2 {
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / (radius * 0.12)));
  const dx = delta.x / steps;
  const dz = delta.z / steps;
  let next = pos;
  for (let i = 0; i < steps; i++) {
    next = resolveCircleCollisions(
      { x: next.x + dx, z: next.z + dz }, radius, worldWidth, worldDepth, walls
    );
  }
  return next;
}

export function tryStartCapillaryZip(
  probePos: Vec2,
  aimDir: Vec2,
  alleys: readonly InterdentalAlleyDef[],
  allWalls: readonly AABB2D[],
  maxAngleRad: number = FLOSS_ZIP_MAX_ANGLE_RAD,
  entryDist: number = FLOSS_ZIP_ENTRY_DIST
): { zip: ProbeZipState; alley: InterdentalAlleyDef } | null {
  const aimLen = Math.hypot(aimDir.x, aimDir.z);
  if (aimLen < 1e-5) return null;
  const ax = aimDir.x / aimLen;
  const az = aimDir.z / aimLen;
  const cosLimit = Math.cos(maxAngleRad);

  let best: { zip: ProbeZipState; alley: InterdentalAlleyDef } | null = null;
  let bestDist = Infinity;

  for (const alley of alleys) {
    const pairs: Array<[Vec2, Vec2]> = [
      [alley.endpointA, alley.endpointB],
      [alley.endpointB, alley.endpointA],
    ];
    for (const [startEp, endEp] of pairs) {
      const distToEntry = Math.hypot(probePos.x - startEp.x, probePos.z - startEp.z);
      if (distToEntry > entryDist || distToEntry >= bestDist) continue;

      const distToExit = Math.hypot(probePos.x - endEp.x, probePos.z - endEp.z);
      if (distToExit < distToEntry) continue;

      const vx = endEp.x - startEp.x;
      const vz = endEp.z - startEp.z;
      const vLen = Math.hypot(vx, vz);
      if (vLen < 1e-5) continue;

      const dot = (vx / vLen) * ax + (vz / vLen) * az;
      if (dot < cosLimit) continue;

      // Confirm destination circle is clear of solid walls
      const blocked = allWalls.some((w) =>
        circleIntersectsAABB(endEp.x, endEp.z, PROBE_RADIUS * 0.95, w)
      );
      if (blocked) continue;

      bestDist = distToEntry;
      best = {
        alley,
        zip: {
          from: { x: probePos.x, z: probePos.z },
          to: { x: endEp.x, z: endEp.z },
          elapsed: 0,
          duration: FLOSS_ZIP_DURATION_SEC,
        },
      };
    }
  }

  return best;
}

export interface ZipMouthHint {
  alley: InterdentalAlleyDef;
  entry: Vec2;
  exit: Vec2;
  distToEntry: number;
  /** True when HYDRA-1 is already inside FLOSS_ZIP_ENTRY_DIST and a Floss fire would zip. */
  inZipRange: boolean;
  /** True when the alley is narrower than the HYDRA-1 hull, i.e. blocked to walking. */
  blockedToWalking: boolean;
}

/**
 * Finds the nearest interdental alley mouth around HYDRA-1 for the contextual Zip prompt & 3D reticle.
 * Only reports mouths whose far exit is clear of solid walls (the same rule tryStartCapillaryZip uses).
 */
export function findNearestZipMouth(
  probePos: Vec2,
  alleys: readonly InterdentalAlleyDef[],
  solidWalls: readonly AABB2D[],
  maxDist = ZIP_PROMPT_RADIUS
): ZipMouthHint | null {
  let best: ZipMouthHint | null = null;
  for (const alley of alleys) {
    const pairs: Array<[Vec2, Vec2]> = [
      [alley.endpointA, alley.endpointB],
      [alley.endpointB, alley.endpointA],
    ];
    for (const [entry, exit] of pairs) {
      const d = Math.hypot(probePos.x - entry.x, probePos.z - entry.z);
      if (d > maxDist) continue;
      // Only the mouth on HYDRA-1's side counts (closer than the far exit)
      const dExit = Math.hypot(probePos.x - exit.x, probePos.z - exit.z);
      if (dExit < d) continue;
      if (best && d >= best.distToEntry) continue;
      const blockedExit = solidWalls.some((w) =>
        circleIntersectsAABB(exit.x, exit.z, PROBE_RADIUS * 0.95, w)
      );
      if (blockedExit) continue;
      best = {
        alley,
        entry,
        exit,
        distToEntry: d,
        inZipRange: d <= FLOSS_ZIP_ENTRY_DIST,
        blockedToWalking: alley.width < PROBE_RADIUS * 2,
      };
    }
  }
  return best;
}

export function stepCapillaryZip(
  zip: ProbeZipState,
  dt: number
): { pos: Vec2; done: boolean } {
  zip.elapsed = Math.min(zip.duration, zip.elapsed + dt);
  const u = zip.duration > 0 ? zip.elapsed / zip.duration : 1;
  // Cubic ease-in-out
  const ease = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  return {
    pos: {
      x: zip.from.x + (zip.to.x - zip.from.x) * ease,
      z: zip.from.z + (zip.to.z - zip.from.z) * ease,
    },
    done: zip.elapsed >= zip.duration - 1e-6,
  };
}

function ccw(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  return (cz - az) * (bx - ax) - (bz - az) * (cx - ax);
}

export function segmentsIntersect2D(
  a0: Vec2,
  a1: Vec2,
  b0: Vec2,
  b1: Vec2
): boolean {
  const d1 = ccw(b0.x, b0.z, b1.x, b1.z, a0.x, a0.z);
  const d2 = ccw(b0.x, b0.z, b1.x, b1.z, a1.x, a1.z);
  const d3 = ccw(a0.x, a0.z, a1.x, a1.z, b0.x, b0.z);
  const d4 = ccw(a0.x, a0.z, a1.x, a1.z, b1.x, b1.z);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}
