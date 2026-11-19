/**
 * The city finale in 3D: where everything stands in the world, how the camera moves, and the
 * shapes that both editions build (the Golden Molar's crown, the mountain), all as pure functions.
 *
 * The show's timing and its 2D layout live in cityFinale.ts and stay the source of truth: this file
 * lifts them into a world with depth. Three layers give the parallax as the camera moves:
 *
 *   far    a sky dome (gradient, stars, an aurora the renderer draws with noise)
 *   middle the city's skyline as a cut-paper relief, bent gently round the viewer
 *   near   the stage in front of the city, where the coin, the molar and the mountain appear
 *
 * The Golden Molar is a real tooth (a crown with five cusps and two roots) and the mountain a spire
 * of hexagonal crystal columns, like the rods enamel is made of.
 *
 * Fireworks are 3D, and each spark splits once into a smaller burst. Each city's sign blooms into
 * a fractal of itself (a maple tree of maple leaves, a rosette of fleurs-de-lis, clocks within a
 * clock, stars on the points of a star, a galaxy of moons) before it folds into the coin.
 *
 * Units: world units, y up, the camera looks toward -z. The skyline's drawing units are world
 * units. The Swift twin is native-apple/Sources/MouthLifeCore/Config/Finale3D.swift; the
 * generator embeds a checksum of everything here and the Swift tests compare.
 */
import {
  CAMPAIGN_PIECES,
  ENDING_TIMES,
  FINALE_TIMES,
  GOLDEN_MOLAR,
  MOUNTAIN,
  PORTAL_STAGE,
  finaleHash,
  smooth01,
} from './cityFinale';
import type { FinaleBurst, FinaleShow } from './citySkylineGeometry';

export type Vec3 = [number, number, number];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInCubic(x: number): number {
  const u = clamp(x, 0, 1);
  return u * u * u;
}

function backOut(x: number): number {
  const u = clamp(x, 0, 1) - 1;
  return 1 + 2.7 * u * u * u + 1.7 * u * u;
}

// ------------------------------------------------------------------ placing things in the world

/** The skyline bends round the viewer on a circle this big, so its ends sit further back. */
export const SKYLINE_BEND_RADIUS = 70;
/** Each drawing line stands this much in front of the one before it (a cut-paper relief). */
export const RELIEF_STEP = 0.018;
/** How deep each cut-out piece is. */
export const RELIEF_DEPTH = 0.22;

/**
 * A skyline point (drawing units, x 0..64) in the world, `order` lines from the back; `back` pushes
 * it behind its piece's face (for the sides of a cut-out).
 */
export function skylineWorld(x: number, y: number, order: number, back = 0): Vec3 {
  const a = (x - 32) / SKYLINE_BEND_RADIUS;
  const z = order * RELIEF_STEP - back;
  return [Math.sin(a) * (SKYLINE_BEND_RADIUS + z), y, (Math.cos(a) - 1) * SKYLINE_BEND_RADIUS + z * Math.cos(a)];
}

/** The skyline's facing at a point: the angle it is turned about the vertical axis. */
export function skylineAngle(x: number): number {
  return (x - 32) / SKYLINE_BEND_RADIUS;
}

/** The stage in front of the city: the 2D stage units of cityFinale.ts on an upright plane. */
export const STAGE = { origin: [0, 9, 10] as Vec3, unit: 5.5 } as const;

export function stageWorld(u: number, v: number, depth = 0): Vec3 {
  return [STAGE.origin[0] + u * STAGE.unit, STAGE.origin[1] + v * STAGE.unit, STAGE.origin[2] + depth];
}

/** Where a firework bursts: over its spot in the skyline, some in front of the city, some behind. */
export function burstWorld(burst: FinaleBurst, b: number): Vec3 {
  const p = skylineWorld(burst.x, burst.y, 0);
  return [p[0], p[1], p[2] - 3 + 6 * finaleHash(b, 77)];
}

/** Where each city's sign blooms: high over the middle of the city. */
export const EMBLEM_WORLD = { center: [0, 15, 2] as Vec3, unit: 3.4 } as const;

// ------------------------------------------------------------------ the dental wormhole to the next city

/**
 * The end of every city's finale: a ring of teeth pops open in the sky over the mountain, the probe
 * flies up into it and the camera dives after it, down a tunnel of turning rings of teeth. At the
 * far end a round window shows the next city, and that city's sky holds another little ring with
 * the city after it inside, and so on: a recursive dental wormhole from one city to the next.
 * The renderers draw the teeth in 3D and the window (a picture of the next city) in 2D.
 */
export const WORMHOLE = {
  /** The tunnel runs up and away from the viewer at 45 degrees, into the sky. */
  axis: [0, Math.SQRT1_2, -Math.SQRT1_2] as Vec3,
  /** How far in front of the ring the camera waits before it dives. */
  approach: 13,
  /** The ring of teeth's radius (world units), and each tunnel ring's share of it. */
  radius: 2.0,
  ringShrink: 0.025,
  teeth: 12,
  /** Tunnel rings behind the first, and the gap between them. */
  rings: 8,
  spacing: 2.2,
  /** The window onto the next city sits one gap past the last ring. */
  windowRadius: 1.75,
  /** A tooth's size: the tooth mesh is about two molar units tall. */
  toothScale: 0.34,
} as const;

/** The middle of the ring of teeth (world units), where the probe flies in. */
export function wormholeCenter(): Vec3 {
  return stageWorld(PORTAL_STAGE.x, PORTAL_STAGE.y, 0.45);
}

function alongWormhole(p: Vec3, d: number): Vec3 {
  const a = WORMHOLE.axis;
  return [p[0] + a[0] * d, p[1] + a[1] * d, p[2] + a[2] * d];
}

/** How far down the tunnel the window onto the next city is. */
export function wormholeWindowDistance(): number {
  return (WORMHOLE.rings + 1) * WORMHOLE.spacing;
}

/** The camera's view of the ring just before the dive: straight down the tunnel. */
function wormholeFrame(): CameraShot {
  const c = wormholeCenter();
  return { pos: alongWormhole(c, -WORMHOLE.approach), target: c, fov: 46 };
}

export interface WormholeTooth {
  pos: Vec3;
  /** Unit vector from the tooth toward the tunnel's middle: the crown points this way. */
  inward: Vec3;
  /** Unit vector along the ring: the tooth's roots spread this way. */
  tangent: Vec3;
  /** Includes the pop-in (renderers scale the tooth mesh by it; 0 hides the tooth). */
  scale: number;
  /** Every third tooth is gold, the rest porcelain. */
  gold: boolean;
  /** 0 at the mouth of the tunnel, 1 at its far end: renderers tint toward the next city by it. */
  depth: number;
  /** Which ring: 0 the mouth, then the tunnel's rings, and the last one round the window. */
  ring: number;
}

/**
 * Every tooth of the wormhole at time t. The first ring's teeth pop in one after another as it
 * opens; the tunnel's rings fade in behind it, each turning the other way from its neighbours and
 * a little twisted from the last, so the tunnel spirals. With Reduce Motion only the first ring
 * shows, still, fading in.
 */
export function wormholeTeeth(t: number, reducedMotion: boolean): WormholeTooth[] {
  const T = FINALE_TIMES;
  const W = WORMHOLE;
  if (t < T.portalOpen || t >= T.end) return [];
  const center = wormholeCenter();
  const a = W.axis;
  // a right-handed frame across the tunnel: e1 sideways, e2 = axis x e1
  const e1: Vec3 = [1, 0, 0];
  const e2: Vec3 = [a[1] * e1[2] - a[2] * e1[1], a[2] * e1[0] - a[0] * e1[2], a[0] * e1[1] - a[1] * e1[0]];
  const out: WormholeTooth[] = [];
  // the tunnel's rings, then one more round the window itself, framing the next city to the end
  const rings = reducedMotion ? 0 : W.rings + 1;
  for (let k = 0; k <= rings; k++) {
    const ringFade = k === 0 ? 1 : smooth01((t - (T.portalOpen + 0.6 + 0.08 * k)) / 0.5);
    if (ringFade <= 0) continue;
    const middle = alongWormhole(center, k * W.spacing);
    const turn = reducedMotion ? 0 : (k % 2 === 0 ? 1 : -1) * 0.8 * (t - T.portalOpen) + k * 0.26;
    const frame = k === W.rings + 1;
    const radius = frame ? W.windowRadius + 0.35 : W.radius * (1 - W.ringShrink * k);
    for (let j = 0; j < W.teeth; j++) {
      let grow = ringFade;
      if (k === 0) {
        grow = reducedMotion
          ? smooth01((t - T.portalOpen) / 0.6)
          : backOut((t - (T.portalOpen + j / W.teeth)) / 0.3);
        if (grow <= 0) continue;
      }
      const th = turn + (j / W.teeth) * Math.PI * 2;
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      const radial: Vec3 = [cs * e1[0] + sn * e2[0], cs * e1[1] + sn * e2[1], cs * e1[2] + sn * e2[2]];
      out.push({
        pos: [middle[0] + radial[0] * radius, middle[1] + radial[1] * radius, middle[2] + radial[2] * radius],
        inward: [-radial[0], -radial[1], -radial[2]],
        tangent: [-sn * e1[0] + cs * e2[0], -sn * e1[1] + cs * e2[1], -sn * e1[2] + cs * e2[2]],
        scale: W.toothScale * grow * (1 - W.ringShrink * Math.min(k, W.rings)),
        gold: (j + k) % 3 === 0,
        depth: Math.min(1, k / Math.max(1, W.rings)),
        ring: k,
      });
    }
  }
  return out;
}

/**
 * The round window onto the next city: where it is in the world and how big. Before the dive it is
 * the bright end of the tunnel seen through the ring; as the camera arrives it fills the screen.
 * With Reduce Motion it sits still inside the ring and `fill` (0..1) cross-fades the next city up to
 * full screen instead.
 */
export function wormholeWindow(t: number, reducedMotion: boolean): { center: Vec3; radius: number; alpha: number; fill: number } | null {
  const T = FINALE_TIMES;
  const appear = T.portalOpen + 0.5;
  if (t < appear || t >= T.end) return null;
  const alpha = smooth01((t - appear) / 0.5);
  if (reducedMotion) {
    return { center: wormholeCenter(), radius: WORMHOLE.radius * 0.8, alpha, fill: smooth01((t - (T.dive + 0.5)) / 1.0) };
  }
  return { center: alongWormhole(wormholeCenter(), wormholeWindowDistance()), radius: WORMHOLE.windowRadius, alpha, fill: 0 };
}

/**
 * The tooth the wormhole is built from: the Golden Molar's crown and roots at low detail, centred on
 * its middle (molar units, crown toward +z, roots spreading along x).
 */
export function wormholeToothMesh(): MeshData {
  const parts = [goldenMolarMesh(24, 6), molarRootMesh(-1, 8, 5), molarRootMesh(1, 8, 5)];
  const o = GOLDEN_MOLAR.bodyCenter;
  const mesh: MeshData = { positions: [], normals: [], indices: [] };
  for (const part of parts) {
    const base = mesh.positions.length / 3;
    for (let i = 0; i < part.positions.length; i += 3) {
      mesh.positions.push(part.positions[i] - o.x, part.positions[i + 1] - o.y, part.positions[i + 2] + 0.6);
    }
    mesh.normals.push(...part.normals);
    for (const idx of part.indices) mesh.indices.push(base + idx);
  }
  return mesh;
}

// ------------------------------------------------------------------ the camera

export interface CameraShot {
  pos: Vec3;
  target: Vec3;
  /** Vertical field of view in degrees, for a 16:9 view (renderers widen it on tall screens). */
  fov: number;
}

/** The camera's path: [time, position, target, fov]. A Catmull-Rom curve runs through them. */
export const CAMERA_KEYS: readonly (readonly [number, Vec3, Vec3, number])[] = [
  [0.0, [0, 30, 70], [0, 4, 0], 48],
  [1.0, [-8, 20, 52], [-10, 5, 0], 48],
  [2.5, [-30, 6, 24], [-24, 6, 0], 46],
  [7.0, [26, 7, 22], [28, 6, 0], 46],
  [8.0, [6, 8, 46], [0, 11, 0], 48],
  [10.5, [-18, 7, 42], [0, 12, 0], 48],
  [13.0, [12, 8, 43], [0, 12, 0], 48],
  [14.0, [0, 10, 32], [0, 15, 2], 50],
  [16.5, [0, 12, 30], [0, 12, 6], 46],
  [18.0, [3, 11.5, 21], [0, 10.4, 10], 42],
  [19.5, [-4, 10.5, 22], [0, 9.8, 10], 44],
  [21.0, [5, 11, 23], [0, 9, 10], 44],
  [22.0, [0, 10, 31], [0, 9, 10], 46],
  [24.0, [-7, 9.5, 31], [0, 8.5, 10], 46],
  [26.0, [6, 12.5, 31], [0, 10.5, 10], 46],
  [28.0, [0, 12, 32], [0, 11, 10], 46],
  [30.0, [0, 9, 31], [0, 22, 10], 50],
];

/** With Reduce Motion the camera holds still and simply cuts between four framings. */
const STILL_SHOTS: readonly [number, CameraShot][] = [
  [0, { pos: [0, 9, 46], target: [0, 11, 0], fov: 48 }],
  [FINALE_TIMES.showEnd, { pos: [0, 10, 32], target: [0, 15, 2], fov: 50 }],
  [FINALE_TIMES.gatherEnd, { pos: [0, 10, 25], target: [0, 9.5, 10], fov: 46 }],
  [FINALE_TIMES.portalOpen, wormholeFrame()],
];

/**
 * One coordinate of the camera between keys 1 and 2: a Hermite curve whose speed at each key is
 * taken over the time either side of it, so the camera glides through keys without stopping
 * (it eases only at the very first and last). Keys 0 and 3 are the neighbours.
 */
function glide(p0: number, p1: number, p2: number, p3: number, t0: number, t1: number, t2: number, t3: number, first: boolean, last: boolean, s: number): number {
  const dt = t2 - t1;
  const m1 = first ? 0 : ((p2 - p0) / (t2 - t0)) * dt;
  const m2 = last ? 0 : ((p3 - p1) / (t3 - t1)) * dt;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p1 + (s3 - 2 * s2 + s) * m1 + (3 * s2 - 2 * s3) * p2 + (s3 - s2) * m2;
}

export function finaleCamera3D(t: number, reducedMotion: boolean): CameraShot {
  if (reducedMotion) {
    let shot = STILL_SHOTS[0][1];
    for (const [at, s] of STILL_SHOTS) if (t >= at) shot = s;
    return { pos: [...shot.pos] as Vec3, target: [...shot.target] as Vec3, fov: shot.fov };
  }
  const keyed = keyedCamera(t);
  const T = FINALE_TIMES;
  if (t < T.portalOpen) return keyed;
  const frame = wormholeFrame();
  if (t < T.dive) {
    // lift from the mountain up to the ring of teeth opening in the sky
    const k = smooth01((t - T.portalOpen) / (T.dive - T.portalOpen));
    return {
      pos: [lerp(keyed.pos[0], frame.pos[0], k), lerp(keyed.pos[1], frame.pos[1], k), lerp(keyed.pos[2], frame.pos[2], k)],
      target: [
        lerp(keyed.target[0], frame.target[0], k),
        lerp(keyed.target[1], frame.target[1], k),
        lerp(keyed.target[2], frame.target[2], k),
      ],
      fov: lerp(keyed.fov, frame.fov, k),
    };
  }
  // the dive: in through the ring and down the tunnel, arriving at the next city's window at the end
  const s = clamp((t - T.dive) / (T.end - T.dive), 0, 1);
  const pos = alongWormhole(frame.pos, (WORMHOLE.approach + wormholeWindowDistance()) * smooth01(s));
  return { pos, target: alongWormhole(pos, WORMHOLE.approach), fov: frame.fov + 12 * Math.sin(Math.PI * s) };
}

function keyedCamera(t: number): CameraShot {
  const keys = CAMERA_KEYS;
  const last = keys.length - 1;
  if (t <= keys[0][0]) return { pos: [...keys[0][1]] as Vec3, target: [...keys[0][2]] as Vec3, fov: keys[0][3] };
  if (t >= keys[last][0]) return { pos: [...keys[last][1]] as Vec3, target: [...keys[last][2]] as Vec3, fov: keys[last][3] };
  let i = 0;
  while (i < last - 1 && t >= keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)];
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k3 = keys[Math.min(last, i + 2)];
  const s = (t - k1[0]) / (k2[0] - k1[0]);
  const first = i === 0;
  const end = i + 1 === last;
  const pos: Vec3 = [0, 0, 0];
  const target: Vec3 = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    pos[c] = glide(k0[1][c], k1[1][c], k2[1][c], k3[1][c], k0[0], k1[0], k2[0], k3[0], first, end, s);
    target[c] = glide(k0[2][c], k1[2][c], k2[2][c], k3[2][c], k0[0], k1[0], k2[0], k3[0], first, end, s);
  }
  return { pos, target, fov: lerp(k1[3], k2[3], smooth01(s)) };
}

/**
 * The grand finale's camera: in close on the molar as it assembles, round it as it snaps, a slow
 * orbit of each city during its credit, then back to the finished molar.
 */
export function endingCamera3D(t: number, reducedMotion: boolean): CameraShot {
  const E = ENDING_TIMES_3D;
  const m = STAGE.origin;
  if (t < E.creditsStart || t >= E.finaleStart) {
    const local = t < E.creditsStart ? t : t - E.finaleStart;
    const a = reducedMotion ? 0 : t < E.creditsStart ? Math.max(0, local - E.snap) * 0.12 : Math.sin(local * 0.35) * 0.32;
    // with Reduce Motion the camera holds its distance too
    const r = reducedMotion ? 13 : t < E.creditsStart ? lerp(15, 13, smooth01(local / E.snap)) : 15;
    // looking a little below the molar's middle, so it sits above the words at the bottom
    return {
      pos: [m[0] + Math.sin(a) * r, m[1] + 0.2, m[2] + Math.cos(a) * r],
      target: [m[0], m[1] - 1.2, m[2]],
      fov: 46,
    };
  }
  const local = t - E.creditsStart;
  const within = clamp(local - Math.floor(local / E.creditSeconds) * E.creditSeconds, 0, E.creditSeconds);
  const a = reducedMotion ? 0 : -0.35 + (0.7 * within) / E.creditSeconds;
  return { pos: [Math.sin(a) * 40, 8, Math.cos(a) * 40], target: [0, 9.5, 0], fov: 48 };
}

const ENDING_TIMES_3D = ENDING_TIMES;

// ------------------------------------------------------------------ 3D fireworks, each spark splitting once

const SHAPE_3D = {
  peony: { sparks: 40, radius: 7.0, gravity: 1.1, life: 1.9, split: 0.55, children: 5, childRadius: 1.8 },
  ring: { sparks: 34, radius: 8.0, gravity: 0.8, life: 1.7, split: 0.6, children: 4, childRadius: 1.5 },
  willow: { sparks: 28, radius: 6.2, gravity: 2.2, life: 2.7, split: 0.5, children: 6, childRadius: 1.9 },
} as const;

const GOLDEN_ANGLE = 2.399963229728653;

export interface Spark3D {
  x: number;
  y: number;
  z: number;
  /** Where the spark was a moment ago, for a stretched streak. */
  px: number;
  py: number;
  pz: number;
  /** 0 = burst's first colour, 1 = its second. */
  mix: number;
  alpha: number;
  /** 0 for a first spark, 1 for one of the smaller sparks it split into. */
  gen: number;
}

/** The direction of spark `i` of `n`: spread evenly over a sphere, or round a tilted ring. */
function sparkDirection(kind: FinaleBurst['kind'], i: number, n: number, b: number): Vec3 {
  if (kind === 'ring') {
    const a = (Math.PI * 2 * i) / n;
    const tilt = (finaleHash(b, 91) - 0.5) * 1.2;
    const x = Math.cos(a);
    const y = Math.sin(a);
    return [x, y * Math.cos(tilt), y * Math.sin(tilt)];
  }
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = i * GOLDEN_ANGLE + finaleHash(b, 92) * Math.PI * 2;
  return [r * Math.cos(phi), y, r * Math.sin(phi)];
}

/**
 * Burst number `b` `showT` seconds into the show, in world units round `center`. At `split` of its
 * life every spark bursts again into a few smaller sparks: a firework made of fireworks.
 */
export function burstSparks3D(burst: FinaleBurst, b: number, showT: number, show: FinaleShow, center: Vec3, scale = 1): Spark3D[] {
  const shape = SHAPE_3D[burst.kind];
  const delay = show === 'meteors' ? 0 : 0.9;
  const age = showT - burst.t - delay;
  if (age < 0 || age >= shape.life) return [];
  const gravity = show === 'meteors' ? 0 : shape.gravity;
  const splitAt = shape.split * shape.life;
  const lag = burst.kind === 'willow' ? 0.16 : 0.095;
  const childLag = burst.kind === 'willow' ? 0.11 : 0.075;
  const out: Spark3D[] = [];
  const reach = (speed: number, a: number, radius: number): number => radius * speed * (1 - Math.exp(-3.2 * a)) * scale;
  for (let i = 0; i < shape.sparks; i++) {
    const d = sparkDirection(burst.kind, i, shape.sparks, b);
    const speed = burst.kind === 'ring' ? 1 : 0.6 + 0.4 * finaleHash(i, b * 7 + 2);
    const a = Math.min(age, splitAt);
    const dist = reach(speed, a, shape.radius);
    const drop = gravity * a * a * scale;
    const sx = center[0] + d[0] * dist;
    const sy = center[1] + d[1] * dist - drop;
    const sz = center[2] + d[2] * dist;
    if (age < splitAt) {
      const pa = Math.max(0, age - lag);
      const pdist = reach(speed, pa, shape.radius);
      const pdrop = gravity * pa * pa * scale;
      const fade = 1 - (age / shape.life) * 0.4;
      out.push({
        x: sx,
        y: sy,
        z: sz,
        px: center[0] + d[0] * pdist,
        py: center[1] + d[1] * pdist - pdrop,
        pz: center[2] + d[2] * pdist,
        mix: clamp(age / splitAt, 0, 1) * 0.5,
        alpha: fade,
        gen: 0,
      });
      continue;
    }
    // the split: a small burst from where the spark had got to
    const ca = age - splitAt;
    const cl = shape.life - splitAt;
    const pca = Math.max(0, ca - childLag);
    const fade = 1 - (ca / cl) * (ca / cl);
    for (let c = 0; c < shape.children; c++) {
      const cd = sparkDirection('peony', c, shape.children, b * 31 + i);
      const cdist = reach(1, ca, shape.childRadius);
      const cdrop = gravity * (a + ca) * (a + ca) * scale - drop;
      const pcdist = reach(1, pca, shape.childRadius);
      const pcdrop = gravity * (a + pca) * (a + pca) * scale - drop;
      out.push({
        x: sx + cd[0] * cdist,
        y: sy + cd[1] * cdist - cdrop,
        z: sz + cd[2] * cdist,
        px: sx + cd[0] * pcdist,
        py: sy + cd[1] * pcdist - pcdrop,
        pz: sz + cd[2] * pcdist,
        mix: 0.5 + 0.5 * clamp(ca / cl, 0, 1),
        alpha: fade,
        gen: 1,
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------ each city's sign, as a fractal of itself

export interface EmblemInstance {
  x: number;
  y: number;
  z: number;
  /** Turn in the sign's own plane (radians). */
  roll: number;
  /** Turn about the vertical axis (radians): the fractal revolves in 3D. */
  yaw: number;
  scale: number;
  alpha: number;
  /** 0 for the sign itself, 1, 2, ... for each smaller copy. */
  level: number;
  /** 0..1 brief flash right as this copy pops into place (0 under Reduce Motion). */
  glint: number;
}

interface Node {
  x: number;
  y: number;
  z: number;
  roll: number;
  scale: number;
  level: number;
}

/**
 * The fractal's resting shape, in emblem units round its centre: each city grows its own way.
 *   0 Toronto       a maple tree: each leaf grows three smaller leaves above it
 *   1 New Orleans   a rosette: six fleurs-de-lis round each one, like iron lace
 *   2 Tokyo         clocks within a clock: twelve small dials round each dial
 *   3 Accra         a star on every point of the star
 *   4 Station Aurora a galaxy: moons spiralling out on the golden angle
 */
export function emblemFractalNodes(cityIndex: number): Node[] {
  const nodes: Node[] = [];
  if (cityIndex === 4) {
    nodes.push({ x: 0, y: 0, z: 0, roll: 0, scale: 1, level: 0 });
    for (let k = 1; k <= 144; k++) {
      const r = 0.55 * Math.sqrt(k);
      const a = k * GOLDEN_ANGLE;
      nodes.push({
        x: r * Math.cos(a),
        y: r * Math.sin(a) * 0.62,
        z: r * Math.sin(a) * 0.35,
        roll: a,
        scale: 0.2 * (1 - k / 220),
        level: 1 + Math.floor(k / 48),
      });
    }
    return nodes;
  }
  const rules = [
    { children: 3, spread: 0.78, dist: 1.25, shrink: 0.56, levels: 4, ring: false, start: -1.6, startScale: 1.1 },
    { children: 6, spread: 0, dist: 1.55, shrink: 0.4, levels: 4, ring: true, start: 0, startScale: 1 },
    { children: 12, spread: 0, dist: 1.35, shrink: 0.24, levels: 3, ring: true, start: 0, startScale: 1 },
    { children: 5, spread: 0, dist: 1.15, shrink: 0.42, levels: 4, ring: true, start: 0, startScale: 1 },
  ][cityIndex] ?? { children: 5, spread: 0, dist: 1.15, shrink: 0.42, levels: 3, ring: true, start: 0, startScale: 1 };
  const grow = (n: Node): void => {
    nodes.push(n);
    if (n.level + 1 >= rules.levels) return;
    for (let c = 0; c < rules.children; c++) {
      const angle = rules.ring
        ? n.roll + Math.PI / 2 + (Math.PI * 2 * c) / rules.children + (cityIndex === 2 ? 0 : n.level * 0.4)
        : n.roll + Math.PI / 2 + (c - (rules.children - 1) / 2) * rules.spread;
      const d = rules.dist * n.scale;
      grow({
        x: n.x + Math.cos(angle) * d,
        y: n.y + Math.sin(angle) * d,
        z: n.z + (n.level % 2 === 0 ? 0.12 : -0.12) * n.scale,
        roll: rules.ring ? angle - Math.PI / 2 : angle - Math.PI / 2,
        scale: n.scale * rules.shrink,
        level: n.level + 1,
      });
    }
  };
  grow({ x: 0, y: rules.start, z: 0, roll: 0, scale: rules.startScale, level: 0 });
  return nodes;
}

const nodeCache = new Map<number, Node[]>();

function cachedNodes(cityIndex: number): Node[] {
  let n = nodeCache.get(cityIndex);
  if (!n) {
    n = emblemFractalNodes(cityIndex);
    nodeCache.set(cityIndex, n);
  }
  return n;
}

/** Where the coin forms after the sparks gather (world units). */
export function coinFormWorld(): Vec3 {
  return stageWorld(0, 0.42, 0.4);
}

/**
 * The fractal sign at time t, in world units: the levels pop out one after another from the
 * emblem burst, the whole thing revolves, then everything folds into the coin.
 */
export function emblemFractal(cityIndex: number, t: number, reducedMotion: boolean): EmblemInstance[] {
  const T = FINALE_TIMES;
  const gatherDone = T.emblemEnd + 0.6 * (T.gatherEnd - T.emblemEnd);
  if (t < T.emblemBurst || t >= gatherDone) return [];
  const nodes = cachedNodes(cityIndex);
  const c = EMBLEM_WORLD.center;
  const u = EMBLEM_WORLD.unit;
  const spin = reducedMotion ? 0 : (t - T.emblemBurst) * 0.9;
  const coin = coinFormWorld();
  const out: EmblemInstance[] = [];
  nodes.forEach((n, i) => {
    const appearAt = T.emblemBurst + (reducedMotion ? 0.3 : 0.18 * n.level + 0.08 * finaleHash(i, 61));
    const grow = reducedMotion ? smooth01((t - appearAt) / 0.4) : backOut((t - appearAt) / 0.35);
    if (grow <= 0) return;
    const cs = Math.cos(spin);
    const sn = Math.sin(spin);
    // turned by +spin about the vertical, the same way each copy is turned (yaw), so the whole
    // fractal revolves as one sculpture
    // a hair of depth each, so overlapping copies never flicker against each other
    const nz = n.z + (finaleHash(i, 63) - 0.5) * 0.03;
    let x = c[0] + (n.x * cs + nz * sn) * u;
    let y = c[1] + n.y * u;
    let z = c[2] + (nz * cs - n.x * sn) * u;
    let scale = n.scale * u * grow;
    let alpha = reducedMotion ? grow : 1;
    if (t >= T.emblemEnd) {
      const g = (t - T.emblemEnd) / (gatherDone - T.emblemEnd);
      if (reducedMotion) {
        alpha *= 1 - smooth01(g);
      } else {
        const e = easeInCubic(g + 0.15 * finaleHash(i, 62) * (1 - g));
        x = lerp(x, coin[0], e);
        y = lerp(y, coin[1], e);
        z = lerp(z, coin[2], e);
        scale *= 1 - e;
      }
    }
    const age = t - appearAt;
    const glint = reducedMotion || age <= 0 ? 0 : smooth01(age / 0.08) * Math.exp(-Math.max(0, age - 0.05) / 0.18);
    const gear = cityIndex === 2 && !reducedMotion ? (n.level % 2 === 0 ? 1 : -1.6) * (t - T.emblemBurst) * 1.4 : 0;
    out.push({ x, y, z, roll: n.roll + gear, yaw: spin, scale, alpha, level: n.level, glint });
  });
  return out;
}

// ------------------------------------------------------------------ the Golden Molar's crown, as a mesh

export interface MeshData {
  positions: number[];
  normals: number[];
  indices: number[];
}

/** A smooth union of two distances, so the crown's lobes melt into one rounded outline. */
function smoothMin(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
}

/** Signed distance (molar units) to the crown's outline: negative inside. */
export function molarOutlineDistance(x: number, y: number): number {
  const c = GOLDEN_MOLAR.core;
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  const qx = Math.abs(x - cx) - (c.w / 2 - c.r);
  const qy = Math.abs(y - cy) - (c.h / 2 - c.r);
  let d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - c.r;
  for (const p of GOLDEN_MOLAR.cusps) d = smoothMin(d, Math.hypot(x - p.x, y - p.y) - GOLDEN_MOLAR.lobeRadius, 0.16);
  return d;
}

/** The crown's height above its rim at a point inside the outline: five low cusps with grooves between. */
export function molarHeight(x: number, y: number): number {
  let h = 0;
  for (const p of GOLDEN_MOLAR.cusps) {
    const d = Math.hypot(x - p.x, y - p.y) / 0.5;
    if (d < 1) h = Math.max(h, 0.17 * (1 - d * d));
  }
  let groove = Infinity;
  const g = GOLDEN_MOLAR.groove;
  for (let i = 0; i + 1 < g.length; i++) {
    const ax = g[i].x;
    const ay = g[i].y;
    const bx = g[i + 1].x - ax;
    const by = g[i + 1].y - ay;
    const s = clamp(((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by), 0, 1);
    groove = Math.min(groove, Math.hypot(x - ax - bx * s, y - ay - by * s));
  }
  return 0.16 + h - 0.05 * Math.exp(-(groove / 0.06) * (groove / 0.06));
}

/** How far the outline is from the crown's middle in direction `a` (molar units). */
export function molarOutlineRadius(a: number): number {
  const o = GOLDEN_MOLAR.bodyCenter;
  let lo = 0;
  let hi = 2.5;
  for (let k = 0; k < 28; k++) {
    const mid = (lo + hi) / 2;
    if (molarOutlineDistance(o.x + Math.cos(a) * mid, o.y + Math.sin(a) * mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function pushNormals(mesh: MeshData): void {
  const p = mesh.positions;
  const n = new Array<number>(p.length).fill(0);
  const idx = mesh.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;
    const ux = p[b] - p[a];
    const uy = p[b + 1] - p[a + 1];
    const uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a];
    const vy = p[c + 1] - p[a + 1];
    const vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) {
      n[k] += nx;
      n[k + 1] += ny;
      n[k + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const len = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= len;
    n[i + 1] /= len;
    n[i + 2] /= len;
  }
  mesh.normals = n;
}

/**
 * The Golden Molar's crown as a closed mesh in molar units: x, y across the chewing surface (as in
 * GOLDEN_MOLAR), z up out of it. The top follows the cusps and grooves; the sides bulge a little
 * and narrow toward the root, like a real crown.
 */
export function goldenMolarMesh(segments = 72, rings = 14): MeshData {
  const mesh: MeshData = { positions: [], normals: [], indices: [] };
  const o = GOLDEN_MOLAR.bodyCenter;
  const radii: number[] = [];
  for (let s = 0; s < segments; s++) radii.push(molarOutlineRadius((Math.PI * 2 * s) / segments));
  // top: one middle vertex, then rings out to the rim
  mesh.positions.push(o.x, o.y, molarHeight(o.x, o.y));
  for (let r = 1; r <= rings; r++) {
    const f = r / rings;
    for (let s = 0; s < segments; s++) {
      const a = (Math.PI * 2 * s) / segments;
      const rr = radii[s] * f;
      const x = o.x + Math.cos(a) * rr;
      const y = o.y + Math.sin(a) * rr;
      const edge = smooth01((1 - f) / 0.14);
      mesh.positions.push(x, y, molarHeight(x, y) * edge + (1 - edge) * 0.05);
    }
  }
  // sides: from the rim down, bulging then narrowing to the root
  const sideSteps = [
    { down: 0.12, out: 1.02 },
    { down: 0.3, out: 1.0 },
    { down: 0.52, out: 0.9 },
    { down: 0.74, out: 0.74 },
  ];
  for (const step of sideSteps) {
    for (let s = 0; s < segments; s++) {
      const a = (Math.PI * 2 * s) / segments;
      const rr = radii[s] * step.out;
      mesh.positions.push(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr, 0.05 - step.down);
    }
  }
  const rowCount = rings + sideSteps.length;
  for (let s = 0; s < segments; s++) mesh.indices.push(0, 1 + s, 1 + ((s + 1) % segments));
  for (let row = 0; row + 1 < rowCount; row++) {
    for (let s = 0; s < segments; s++) {
      const a = 1 + row * segments + s;
      const b = 1 + row * segments + ((s + 1) % segments);
      const c = 1 + (row + 1) * segments + s;
      const d = 1 + (row + 1) * segments + ((s + 1) % segments);
      mesh.indices.push(a, c, b, b, c, d);
    }
  }
  // the flat bottom gets its own copy of the lowest ring, so the sides keep a crisp edge
  const lastRow = 1 + (rowCount - 1) * segments;
  const capRow = mesh.positions.length / 3;
  for (let s = 0; s < segments; s++) {
    const k = (lastRow + s) * 3;
    mesh.positions.push(mesh.positions[k], mesh.positions[k + 1], mesh.positions[k + 2]);
  }
  const centreBottom = mesh.positions.length / 3;
  mesh.positions.push(o.x, o.y, 0.05 - 0.74);
  for (let s = 0; s < segments; s++) mesh.indices.push(centreBottom, capRow + ((s + 1) % segments), capRow + s);
  pushNormals(mesh);
  return mesh;
}

/**
 * In the grand finale's last scene each city floats in a little bubble over its own piece, so the
 * Golden Molar holds every place the child cleaned. The bubbles fan out from the crown's middle like
 * a crown of their own: how far out (times the cusp's distance), how high (molar units, up out of
 * the crown) and how big (in cusp radii).
 */
export const CUSP_BUBBLE = { spread: 1.6, lift: 0.45, radius: 0.62 } as const;

export function cuspBubbleLocal(index: number): Vec3 {
  const top = molarCuspTop(index);
  const o = GOLDEN_MOLAR.bodyCenter;
  return [o.x + (top[0] - o.x) * CUSP_BUBBLE.spread, o.y + (top[1] - o.y) * CUSP_BUBBLE.spread, top[2] + CUSP_BUBBLE.lift];
}

/** Where a cusp's top is on the crown (molar units), for setting a coin into it. */
export function molarCuspTop(index: number): Vec3 {
  const p = GOLDEN_MOLAR.cusps[clamp(index, 0, CAMPAIGN_PIECES - 1)];
  return [p.x, p.y, molarHeight(p.x, p.y)];
}

/**
 * One of the molar's two roots (side -1 or 1) in molar units: a tube that leaves the underside of
 * the crown, bows outward and tapers to a rounded tip, so the Golden Molar reads as a real tooth.
 */
export function molarRootMesh(side: number, segments = 18, rings = 12): MeshData {
  const mesh: MeshData = { positions: [], normals: [], indices: [] };
  const o = GOLDEN_MOLAR.bodyCenter;
  const s = side < 0 ? -1 : 1;
  const p0: Vec3 = [o.x + s * 0.32, o.y, -0.5];
  const p1: Vec3 = [o.x + s * 0.62, o.y, -1.05];
  const p2: Vec3 = [o.x + s * 0.4, o.y, -1.62];
  for (let r = 0; r <= rings; r++) {
    const u = r / rings;
    const a = (1 - u) * (1 - u);
    const b = 2 * (1 - u) * u;
    const c = u * u;
    const cx = a * p0[0] + b * p1[0] + c * p2[0];
    const cy = a * p0[1] + b * p1[1] + c * p2[1];
    const cz = a * p0[2] + b * p1[2] + c * p2[2];
    const radius = lerp(0.36, 0.05, Math.pow(u, 1.4)) * (r === rings ? 0.2 : 1);
    for (let k = 0; k < segments; k++) {
      const t = (Math.PI * 2 * k) / segments;
      mesh.positions.push(cx + Math.cos(t) * radius, cy + Math.sin(t) * radius * 0.8, cz);
    }
  }
  const tip = mesh.positions.length / 3;
  mesh.positions.push(p2[0], p2[1], p2[2] - 0.04);
  for (let r = 0; r < rings; r++) {
    for (let k = 0; k < segments; k++) {
      const a = r * segments + k;
      const b = r * segments + ((k + 1) % segments);
      const c = (r + 1) * segments + k;
      const d = (r + 1) * segments + ((k + 1) % segments);
      mesh.indices.push(a, c, b, b, c, d);
    }
  }
  const last = rings * segments;
  for (let k = 0; k < segments; k++) mesh.indices.push(last + k, tip, last + ((k + 1) % segments));
  pushNormals(mesh);
  return mesh;
}

// ------------------------------------------------------------------ the mountain: a spire of crystal columns

/** Smooth value noise from the shared hash, 0..1. */
function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number): number => finaleHash(a * 73 + seed, b * 151 + seed * 7);
  return lerp(lerp(h(ix, iy), h(ix + 1, iy), ux), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), ux), uy);
}

/** Ridged noise: sharp crests where the value noise folds over, three octaves. */
function ridged(x: number, y: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 3; o++) {
    sum += amp * (1 - Math.abs(valueNoise(x * f, y * f, o + 1) * 2 - 1));
    f *= 2.1;
    amp *= 0.5;
  }
  return sum;
}

/** The mountain's height above the stage floor (stage units) and how far out its foot reaches. */
export const MOUNTAIN_3D = { peakY: 0.5, footY: -1.1, footRadius: 1.45, depthScale: 0.7 } as const;

/** The mountain's radius at a height (stage units) in direction `a`, ridged so it looks like rock. */
export function mountainRadius(y: number, a: number): number {
  const f = clamp((y - MOUNTAIN_3D.footY) / (MOUNTAIN_3D.peakY - MOUNTAIN_3D.footY), 0, 1);
  const base = MOUNTAIN_3D.footRadius * Math.pow(1 - f, 0.85);
  // sampled round a circle, so the ridges join up where the angle wraps
  return base * (0.86 + 0.28 * ridged(Math.cos(a) * 1.6, Math.sin(a) * 1.6 + f * 3.2));
}

/** How far in front of the stage plane the mountain's face is at stage point (u, v). */
export function mountainFront(u: number, v: number): number {
  // the radius depends on the direction, which depends on the depth: settle it in a few steps
  let a = Math.PI / 2;
  let z = 0;
  for (let k = 0; k < 4; k++) {
    const r = mountainRadius(v, a);
    z = Math.sqrt(Math.max(0, r * r - u * u));
    a = Math.atan2(z, u);
  }
  return z * MOUNTAIN_3D.depthScale;
}

/** One hexagonal crystal column of the mountain (stage units): its middle, top and width. */
export interface MountainColumn {
  x: number;
  z: number;
  /** Height of its flat top. */
  top: number;
  /** Corner radius of the hexagon. */
  radius: number;
  /** 0 at the foot, 1 at the peak: renderers colour by it. */
  height: number;
}

/** The mountain's column spacing (stage units): enamel is made of hexagonal rods like these. */
export const MOUNTAIN_COLUMN_STEP = 0.1;

/**
 * The mountain as a spire of hexagonal crystal columns packed on a hex grid, like basalt columns or
 * the rods enamel is made of: each column rises to the mountain's height where it stands, a little
 * lower or higher at random, so the slopes step like a giant's staircase.
 */
export function mountainColumns(): MountainColumn[] {
  const out: MountainColumn[] = [];
  const step = MOUNTAIN_COLUMN_STEP;
  const reach = Math.ceil((MOUNTAIN_3D.footRadius * 1.2) / step);
  const span = MOUNTAIN_3D.peakY - MOUNTAIN_3D.footY;
  for (let row = -reach; row <= reach; row++) {
    for (let col = -reach; col <= reach; col++) {
      const x = (col + (row & 1 ? 0.5 : 0)) * step;
      const z = row * step * 0.866;
      const a = Math.atan2(z / MOUNTAIN_3D.depthScale, x);
      const rho = Math.hypot(x, z / MOUNTAIN_3D.depthScale);
      if (rho > mountainRadius(MOUNTAIN_3D.footY, a)) continue;
      // the height where the mountain's radius in this direction comes in to this column
      let lo: number = MOUNTAIN_3D.footY;
      let hi: number = MOUNTAIN_3D.peakY;
      for (let k = 0; k < 18; k++) {
        const mid = (lo + hi) / 2;
        if (mountainRadius(mid, a) > rho) lo = mid;
        else hi = mid;
      }
      const jitter = (finaleHash(row + 40, col + 40) - 0.5) * 0.05;
      const top = Math.min(MOUNTAIN_3D.peakY, lo + jitter);
      out.push({ x, z, top, radius: step * 0.56, height: clamp((top - MOUNTAIN_3D.footY) / span, 0, 1) });
    }
  }
  return out;
}

/** A ledge (or the foot, or the summit) on the mountain's face, in stage units with depth. */
export function ledge3D(index: number): Vec3 {
  const p = index < 0 ? MOUNTAIN.foot : index >= CAMPAIGN_PIECES ? MOUNTAIN.summitStand : MOUNTAIN.ledges[index];
  return [p.x, p.y, mountainFront(p.x, p.y) + 0.06];
}

// ------------------------------------------------------------------ parity

function sumMesh(m: MeshData): number {
  let s = 0;
  for (let i = 0; i < m.positions.length; i++) s += m.positions[i] * ((i % 3) + 1) * 0.01;
  for (let i = 0; i < m.normals.length; i++) s += m.normals[i] * 0.003;
  for (let i = 0; i < m.indices.length; i += 7) s += m.indices[i] * 0.0001;
  return s;
}

/** One number over everything in this file, matched by the Swift twin. */
export function finale3DChecksum(bursts: readonly FinaleBurst[], show: FinaleShow, cityIndex: number): number {
  let sum = 0;
  for (let t = 0; t <= FINALE_TIMES.end; t += 0.29) {
    for (const rm of [false, true]) {
      const cam = finaleCamera3D(t, rm);
      sum += cam.pos[0] * 0.1 + cam.pos[1] * 0.2 + cam.pos[2] * 0.03 + cam.target[0] * 0.05 + cam.target[1] * 0.07 + cam.fov * 0.01;
      for (const e of emblemFractal(cityIndex, t, rm)) sum += e.x * 0.01 + e.y * 0.02 + e.z * 0.03 + e.roll * 0.001 + e.scale + e.alpha + e.glint * 0.1;
      for (const w of wormholeTeeth(t, rm)) {
        sum += w.pos[0] * 0.01 + w.pos[1] * 0.02 + w.pos[2] * 0.03 + w.inward[1] * 0.04 + w.tangent[2] * 0.05 + w.scale + (w.gold ? 0.1 : 0) + w.depth * 0.2;
      }
      const win = wormholeWindow(t, rm);
      if (win) sum += win.center[0] * 0.1 + win.center[1] * 0.2 + win.center[2] * 0.3 + win.radius + win.alpha + win.fill * 2;
    }
    const showT = t - FINALE_TIMES.blazeEnd;
    bursts.forEach((burst, b) => {
      for (const s of burstSparks3D(burst, b, showT, show, burstWorld(burst, b))) {
        sum += s.x * 0.003 + s.y * 0.005 + s.z * 0.007 + s.px * 0.002 + s.py * 0.004 + s.pz * 0.006 + s.alpha + s.mix + s.gen;
      }
    });
  }
  for (let t = 0; t <= ENDING_TIMES.end; t += 0.53) {
    for (const rm of [false, true]) {
      const cam = endingCamera3D(t, rm);
      sum += cam.pos[0] * 0.1 + cam.pos[1] * 0.2 + cam.pos[2] * 0.03 + cam.target[1] * 0.07 + cam.fov * 0.01;
    }
  }
  for (const x of [0, 10, 32, 50, 64]) {
    const p = skylineWorld(x, 3, 12);
    sum += p[0] + p[1] + p[2];
  }
  sum += sumMesh(goldenMolarMesh());
  sum += sumMesh(molarRootMesh(-1)) + sumMesh(molarRootMesh(1)) * 2;
  sum += sumMesh(wormholeToothMesh()) * 3;
  for (const c of mountainColumns()) sum += c.x * 0.01 + c.z * 0.02 + c.top * 0.03 + c.radius + c.height * 0.001;
  for (let i = -1; i <= CAMPAIGN_PIECES; i++) {
    const l = ledge3D(i);
    sum += l[0] + l[1] * 2 + l[2] * 3;
  }
  for (let i = 0; i < CAMPAIGN_PIECES; i++) {
    const c = molarCuspTop(i);
    sum += c[2] * 10;
  }
  return Math.round(sum * 1000) / 1000;
}
