/**
 * Draws a stage's layout as text, to design or check a city without running the game.
 *
 *   npx vite-node scripts/stage-map.ts --print            every city
 *   npx vite-node scripts/stage-map.ts --print world_3    one stage
 *
 * One character is one unit across and one unit deep (north at the top, as the camera sees it):
 *   #  wall          =  gap wall (beside a floss gap)     ~  gum          .  tooth
 *   |  zone boundary S  start     h  helper spot          x  sugar        o  spring   b  beacon
 *   1-9  the two ends of floss gap 1, 2, ...
 * Under the map: the walking regions (gum solid, no floss), and whether everything can be reached
 * by walking and flossing through the gaps.
 */
import { FLOSS_ZIP_ENTRY_DIST, PROBE_RADIUS } from '../src/config/gameConfig';
import { buildAlleyWalls, buildGumWalls, circleIntersectsAABB, tryStartCapillaryZip } from '../src/engine/physics/CollisionSystem';
import type { AABB2D, Vec2, WorldCartridge } from '../src/engine/types';
import { PLAYABLE_CARTRIDGES } from '../src/worlds/worldRegistry';

const inBox = (b: AABB2D, x: number, z: number) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;

export interface StageReport {
  map: string;
  /** Walking-only regions that hold a helper spot or sugar. */
  regionsWithTargets: number;
  /** Things that cannot be reached from the start by walking and flossing. */
  unreachable: string[];
}

export function describeStage(cart: WorldCartridge): StageReport {
  const alleyWalls = buildAlleyWalls(cart);
  const solid = [...cart.wallBoxes, ...alleyWalls, ...buildGumWalls(cart)];
  const step = 0.5;
  const nx = Math.floor(cart.worldWidth / step);
  const nz = Math.floor(cart.worldDepth / step);
  const walkable = (x: number, z: number) => !solid.some((w) => circleIntersectsAABB(x, z, PROBE_RADIUS, w));

  // Walking regions.
  const region = new Int32Array(nx * nz).fill(-1);
  let regions = 0;
  for (let k = 0; k < nx * nz; k++) {
    if (region[k] >= 0 || !walkable((k % nx) * step, Math.floor(k / nx) * step)) continue;
    const stack = [k];
    region[k] = regions;
    while (stack.length > 0) {
      const c = stack.pop()!;
      const ix = c % nx;
      const iz = Math.floor(c / nx);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const jx = ix + dx;
        const jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        const j = jz * nx + jx;
        if (region[j] >= 0 || !walkable(jx * step, jz * step)) continue;
        region[j] = regions;
        stack.push(j);
      }
    }
    regions++;
  }
  const regionAt = (p: Vec2) => region[Math.round(p.z / step) * nx + Math.round(p.x / step)] ?? -1;

  // Walk + floss reachability from the start.
  const seen = new Uint8Array(nx * nz);
  const queue: number[] = [];
  const push = (ix: number, iz: number) => {
    if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return;
    const k = iz * nx + ix;
    if (seen[k] || !walkable(ix * step, iz * step)) return;
    seen[k] = 1;
    queue.push(k);
  };
  push(Math.round(cart.probeSpawn.x / step), Math.round(cart.probeSpawn.z / step));
  while (queue.length > 0) {
    const k = queue.shift()!;
    const ix = k % nx;
    const iz = Math.floor(k / nx);
    push(ix + 1, iz);
    push(ix - 1, iz);
    push(ix, iz + 1);
    push(ix, iz - 1);
    const from = { x: ix * step, z: iz * step };
    for (const alley of cart.interdentalAlleys) {
      for (const [entry, exit] of [[alley.endpointA, alley.endpointB], [alley.endpointB, alley.endpointA]] as const) {
        if (Math.hypot(from.x - entry.x, from.z - entry.z) > FLOSS_ZIP_ENTRY_DIST) continue;
        if (!tryStartCapillaryZip(from, { x: exit.x - from.x, z: exit.z - from.z }, cart.interdentalAlleys, cart.wallBoxes)) continue;
        for (let r = 0; r <= 3; r++) {
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) push(Math.round(exit.x / step) + dx, Math.round(exit.z / step) + dz);
          }
        }
      }
    }
  }
  const reachable = (p: Vec2, tol = 1.5) => {
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        if (seen[iz * nx + ix] && Math.hypot(ix * step - p.x, iz * step - p.z) <= tol) return true;
      }
    }
    return false;
  };

  const things: Array<[string, Vec2, string]> = [
    ...cart.commensalSiteSpawns.map((s) => [s.id, s.pos, 'h'] as [string, Vec2, string]),
    ...cart.sucroseSpawns.map((s) => [s.id, s.pos, 'x'] as [string, Vec2, string]),
    ...cart.salivaSprings.map((p, i) => [`spring_${i}`, p, 'o'] as [string, Vec2, string]),
    ...cart.beaconDropSlots.map((p, i) => [`beacon_${i}`, p, 'b'] as [string, Vec2, string]),
  ];
  const unreachable = things.filter(([, p]) => !reachable(p)).map(([id]) => id);
  const targetRegions = new Set(
    [...cart.commensalSiteSpawns, ...cart.sucroseSpawns].map((t) => regionAt(t.pos)).filter((r) => r >= 0)
  );

  // The picture.
  const rows: string[] = [];
  for (let z = 0; z < cart.worldDepth; z++) {
    let row = '';
    for (let x = 0; x < cart.worldWidth; x++) {
      const cx = x + 0.5;
      const cz = z + 0.5;
      let ch = cart.playableMaskBoxes.some((b) => inBox(b, cx, cz)) ? '.' : '~';
      if (ch === '.' && cart.districts.slice(1).some((d) => Math.abs(d.bounds.minX - cx) <= 0.5)) ch = '|';
      if (alleyWalls.some((w) => inBox(w, cx, cz))) ch = '=';
      if (cart.wallBoxes.some((w) => inBox(w, cx, cz))) ch = '#';
      for (const [, p, mark] of things) if (Math.floor(p.x) === x && Math.floor(p.z) === z) ch = mark;
      cart.interdentalAlleys.forEach((a, i) => {
        for (const e of [a.endpointA, a.endpointB]) if (Math.floor(e.x) === x && Math.floor(e.z) === z) ch = String((i + 1) % 10);
      });
      if (Math.floor(cart.probeSpawn.x) === x && Math.floor(cart.probeSpawn.z) === z) ch = 'S';
      row += ch;
    }
    rows.push(`${String(z).padStart(2)} ${row}`);
  }
  const ruler = `   ${Array.from({ length: cart.worldWidth }, (_v, x) => (x % 10 === 0 ? String((x / 10) % 10) : ' ')).join('')}`;
  return { map: [ruler, ...rows].join('\n'), regionsWithTargets: targetRegions.size, unreachable };
}

// Runs only when asked to with --print, so a test can import this file safely.
if (process.argv.includes('--print')) {
  const only = process.argv.find((a) => PLAYABLE_CARTRIDGES[a] !== undefined);
  for (const cart of Object.values(PLAYABLE_CARTRIDGES)) {
    if (only && cart.id !== only) continue;
    const r = describeStage(cart);
    const facing = cart.probeSpawnFacingRad ?? 0;
    console.log(`\n${cart.id}  ${cart.title}  (${cart.worldWidth} x ${cart.worldDepth})  start ${cart.probeSpawn.x},${cart.probeSpawn.z} facing ${facing.toFixed(2)} rad`);
    console.log(r.map);
    console.log(
      `zones: ${cart.districts.map((d) => `${d.bounds.minX}-${d.bounds.maxX}`).join(' | ')}   ` +
        `helpers per zone: ${cart.districts.map((_d, i) => cart.commensalSiteSpawns.filter((s) => s.districtIdx === i).length).join('/')}`
    );
    console.log(`walking regions holding helpers or sugar: ${r.regionsWithTargets}`);
    console.log(r.unreachable.length === 0 ? 'everything can be reached (walk + floss)' : `CANNOT REACH: ${r.unreachable.join(', ')}`);
  }
}
