/**
 * City skylines: flat vector scenery that stands along the far edge of every stage, drawn from the
 * city the stage is set in (Toronto's CN Tower, Tokyo's neon, the Earth under the space station).
 * Its lights (windows, neon, beacons) come on as the player cleans the district in front of them.
 *
 * The art for each city is a small text drawing (src/config/skylines/<city>.txt), one shape a line:
 *
 *   R x y w h #hex                       rectangle from its bottom-left corner
 *   P x1 y1 x2 y2 x3 y3 ... #hex         convex polygon
 *   C cx cy r #hex                       disc
 *   H cx cy r #hex                       dome (upper half disc)
 *   A cx cy r thick a0 a1 #hex           arc band, angles in degrees, counter-clockwise from east
 *   L x1 y1 x2 y2 thick #hex             line
 *   W x y cols rows w h gapX gapY #hex   grid of windows
 *   S cx cy r #hex                       five-point star
 *   N cx cy r pinch tilt #hex            crescent (pinch 0..1: higher is thinner; tilt in degrees)
 *
 * A capital letter is always shown; the same letter in lower case is a light. `@skyline` starts the
 * panorama (x runs 0..64 along the stage, y is height) and `@prop` the small roadside piece drawn
 * round its own base point. Lines starting with `;` are notes. Later lines sit in front.
 *
 * This file is the web half of a pair: native-apple/Sources/MouthLifeCore/Config/CitySkylines.swift
 * must build the same triangles (tests/citySkylines.test.ts and the Swift tests check it).
 */

export interface SkylinePiece {
  /** A light (window, neon, beacon) that brightens as its district gets clean. */
  light: boolean;
  /** 0xRRGGBB. */
  color: number;
  /** Paint order within its drawing: later pieces sit in front. */
  order: number;
  /** Middle of the piece along the horizon; decides which district lights it. */
  cx: number;
  /** Triangles as x,y pairs: six numbers per triangle. */
  tris: number[];
}

export interface CityArt {
  skyline: SkylinePiece[];
  prop: SkylinePiece[];
}

/** The panorama is drawn 64 units wide and centred on stages of any width. */
export const SKYLINE_ART_WIDTH = 64;

/** Where the panorama stands: just behind the far gum line, leaning back to face the camera. */
export const SKYLINE_PLACE = {
  baseZ: 2.2,
  baseY: -0.35,
  tiltRad: 0.5,
  /** Gap between paint layers, so later pieces win the depth test. */
  layerStep: 0.004,
} as const;

/** Roadside props: how far outside the stage's left and right edges, and where along its depth. */
export const SKYLINE_PROP_PLACE = {
  insetX: 0.6,
  baseY: -0.45,
  depthFractions: [0.3, 0.47, 0.64, 0.81],
} as const;

const DISC_SEGMENTS = 20;
const DOME_SEGMENTS = 12;
const CRESCENT_SEGMENTS = 14;
const ARC_STEP_DEG = 12;
const STAR_INNER = 0.42;

const ARG_COUNTS: Record<string, number | null> = { R: 4, P: null, C: 3, H: 3, A: 6, L: 5, W: 8, S: 3, N: 5 };

function fail(lineNo: number, why: string): never {
  throw new Error(`skyline art line ${lineNo}: ${why}`);
}

function rect(x: number, y: number, w: number, h: number): number[] {
  return [x, y, x + w, y, x + w, y + h, x, y, x + w, y + h, x, y + h];
}

function fan(points: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i + 1 < points.length / 2; i++) {
    out.push(points[0], points[1], points[i * 2], points[i * 2 + 1], points[i * 2 + 2], points[i * 2 + 3]);
  }
  return out;
}

function disc(cx: number, cy: number, r: number, sweepDeg: number, segments: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = ((sweepDeg * i) / segments) * (Math.PI / 180);
    const b = ((sweepDeg * (i + 1)) / segments) * (Math.PI / 180);
    out.push(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(b) * r, cy + Math.sin(b) * r);
  }
  return out;
}

function arcBand(cx: number, cy: number, r: number, thick: number, a0: number, a1: number): number[] {
  const segments = Math.max(2, Math.ceil(Math.abs(a1 - a0) / ARC_STEP_DEG));
  const inner = r - thick;
  const out: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (a0 + ((a1 - a0) * i) / segments) * (Math.PI / 180);
    const b = (a0 + ((a1 - a0) * (i + 1)) / segments) * (Math.PI / 180);
    const ax = Math.cos(a);
    const ay = Math.sin(a);
    const bx = Math.cos(b);
    const by = Math.sin(b);
    out.push(cx + ax * r, cy + ay * r, cx + bx * r, cy + by * r, cx + bx * inner, cy + by * inner);
    out.push(cx + ax * r, cy + ay * r, cx + bx * inner, cy + by * inner, cx + ax * inner, cy + ay * inner);
  }
  return out;
}

function thickLine(x1: number, y1: number, x2: number, y2: number, thick: number): number[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * thick * 0.5;
  const ny = (dx / len) * thick * 0.5;
  return [
    x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny,
    x1 + nx, y1 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny,
  ];
}

function star(cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  const point = (i: number): [number, number] => {
    const a = (90 + i * 36) * (Math.PI / 180);
    const rr = i % 2 === 0 ? r : r * STAR_INNER;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  };
  for (let i = 0; i < 10; i++) {
    const [ax, ay] = point(i);
    const [bx, by] = point(i + 1);
    out.push(cx, cy, ax, ay, bx, by);
  }
  return out;
}

function crescent(cx: number, cy: number, r: number, pinch: number, tiltDeg: number): number[] {
  const t = tiltDeg * (Math.PI / 180);
  const ct = Math.cos(t);
  const st = Math.sin(t);
  const at = (i: number, scaleX: number): [number, number] => {
    const a = (-90 + (180 * i) / CRESCENT_SEGMENTS) * (Math.PI / 180);
    const lx = Math.cos(a) * r * scaleX;
    const ly = Math.sin(a) * r;
    return [cx + lx * ct - ly * st, cy + lx * st + ly * ct];
  };
  const out: number[] = [];
  for (let i = 0; i < CRESCENT_SEGMENTS; i++) {
    const [ox0, oy0] = at(i, 1);
    const [ox1, oy1] = at(i + 1, 1);
    const [ix0, iy0] = at(i, pinch);
    const [ix1, iy1] = at(i + 1, pinch);
    out.push(ox0, oy0, ox1, oy1, ix1, iy1, ox0, oy0, ix1, iy1, ix0, iy0);
  }
  return out;
}

/** The triangle lists one drawing line makes (a window grid makes one list per window). */
function tessellate(op: string, n: number[]): number[][] {
  switch (op) {
    case 'R':
      return [rect(n[0], n[1], n[2], n[3])];
    case 'P':
      return [fan(n)];
    case 'C':
      return [disc(n[0], n[1], n[2], 360, DISC_SEGMENTS)];
    case 'H':
      return [disc(n[0], n[1], n[2], 180, DOME_SEGMENTS)];
    case 'A':
      return [arcBand(n[0], n[1], n[2], n[3], n[4], n[5])];
    case 'L':
      return [thickLine(n[0], n[1], n[2], n[3], n[4])];
    case 'W': {
      const out: number[][] = [];
      for (let row = 0; row < n[3]; row++) {
        for (let col = 0; col < n[2]; col++) {
          out.push(rect(n[0] + col * (n[4] + n[6]), n[1] + row * (n[5] + n[7]), n[4], n[5]));
        }
      }
      return out;
    }
    case 'S':
      return [star(n[0], n[1], n[2])];
    default:
      return [crescent(n[0], n[1], n[2], n[3], n[4])];
  }
}

function middleX(tris: number[]): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < tris.length; i += 2) {
    lo = Math.min(lo, tris[i]);
    hi = Math.max(hi, tris[i]);
  }
  return (lo + hi) * 0.5;
}

/** Reads one city's drawing. Throws on a line it does not understand, so a typo fails the tests. */
export function parseCityArt(text: string): CityArt {
  const art: CityArt = { skyline: [], prop: [] };
  let target = art.skyline;
  let order = 0;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith(';')) continue;
    if (line === '@skyline' || line === '@prop') {
      target = line === '@prop' ? art.prop : art.skyline;
      order = 0;
      continue;
    }
    const tokens = line.split(/\s+/);
    const op = tokens[0].toUpperCase();
    const hex = tokens[tokens.length - 1];
    const nums = tokens.slice(1, -1).map(Number);
    if (!(op in ARG_COUNTS) || tokens[0].length !== 1) fail(i + 1, `unknown shape "${tokens[0]}"`);
    if (!/^#[0-9a-f]{6}$/.test(hex)) fail(i + 1, `bad colour "${hex}"`);
    if (nums.some((v) => !Number.isFinite(v))) fail(i + 1, 'a number is not a number');
    const want = ARG_COUNTS[op];
    if (want === null ? nums.length < 6 || nums.length % 2 !== 0 : nums.length !== want) {
      fail(i + 1, `wrong number of values for ${op}`);
    }
    const light = tokens[0] !== op;
    const color = parseInt(hex.slice(1), 16);
    for (const tris of tessellate(op, nums)) {
      target.push({ light, color, order, cx: middleX(tris), tris });
    }
    order++;
  }
  return art;
}

/** World position of a panorama point (x along the horizon, y up the drawing). */
export function skylinePoint(x: number, y: number, order: number, worldWidth: number): [number, number, number] {
  const c = Math.cos(SKYLINE_PLACE.tiltRad);
  const s = Math.sin(SKYLINE_PLACE.tiltRad);
  const lift = order * SKYLINE_PLACE.layerStep;
  return [
    x + (worldWidth - SKYLINE_ART_WIDTH) * 0.5,
    SKYLINE_PLACE.baseY + y * c + lift * s,
    SKYLINE_PLACE.baseZ - y * s + lift * c,
  ];
}

/** World position of a prop point, for a prop standing at (anchorX, anchorZ). */
export function skylinePropPoint(
  x: number,
  y: number,
  order: number,
  anchorX: number,
  anchorZ: number
): [number, number, number] {
  const c = Math.cos(SKYLINE_PLACE.tiltRad);
  const s = Math.sin(SKYLINE_PLACE.tiltRad);
  const lift = order * SKYLINE_PLACE.layerStep;
  return [anchorX + x, SKYLINE_PROP_PLACE.baseY + y * c + lift * s, anchorZ - y * s + lift * c];
}

/** Where the roadside props stand: a row down each side of the stage. */
export function skylinePropAnchors(worldWidth: number, worldDepth: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const f of SKYLINE_PROP_PLACE.depthFractions) {
    out.push({ x: SKYLINE_PROP_PLACE.insetX, z: worldDepth * f });
    out.push({ x: worldWidth - SKYLINE_PROP_PLACE.insetX, z: worldDepth * f });
  }
  return out;
}

/** The district a world x belongs to: the one it is inside, else the nearest. */
export function skylineDistrictIndex(districts: readonly { bounds: { minX: number; maxX: number } }[], worldX: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < districts.length; i++) {
    const b = districts[i].bounds;
    const d = worldX < b.minX ? b.minX - worldX : worldX > b.maxX ? worldX - b.maxX : 0;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** How brightly a district's lights burn (0..1): a dim glow at first, full once it is sealed. */
export function skylineLightLevel(cleanRatio: number, sealed: boolean): number {
  if (sealed) return 1;
  const r = Math.max(0, Math.min(1, cleanRatio));
  return 0.14 + 0.46 * r * r;
}
