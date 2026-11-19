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
 *   G x y w h #bottom #top               rectangle shaded from one colour at its foot to another at
 *                                        its top (skies; a black top melts into the night)
 *
 * A capital letter is always shown; the same letter in lower case is a light. `@skyline` starts the
 * panorama (x runs 0..64 along the stage, y is height) and `@prop` the small roadside piece drawn
 * round its own base point. Lines starting with `;` are notes. Later lines sit in front.
 *
 * In the panorama, shapes between a motion line and `~end` move together:
 *
 *   ~slide dx period                     glide dx along the horizon and back, once per period (s)
 *   ~spin cx cy period                   turn about a point, one turn per period (negative: clockwise)
 *   ~sway cx cy degrees period           rock about a point, that far each way
 *   ~blink period duty                   its lights flash: on for `duty` (0..1) of each period
 *
 * Motion is decoration only. With Reduce Motion on, everything rests in its drawn place and blinking
 * lights stay on.
 *
 * `@emblem` draws the city's sign (Toronto's maple leaf, Ghana's black star) round 0,0, about one unit
 * each way. It is stamped on the city's piece of the Golden Molar and burst into the sky in sparks.
 *
 * `@finale` sets up the show the city puts on when it is cleaned (see config/cityFinale.ts), one
 * setting a line:
 *
 *   voice rhodes 60                      the city's instrument and the note its tunes start from (MIDI)
 *   show fireworks                       what fills the sky: fireworks, beads, neon, balloons or meteors
 *   host left                            which side the city's host pops up on to wave
 *   burst t x y peony #hex #hex          a firework t seconds into the show, bursting over (x, y):
 *                                        peony, ring or willow, fading from the first colour to the second
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
  /** For a shaded rectangle: the colour at its top (`color` is the colour at its foot). */
  topColor: number | null;
  /** 0 for a piece that stays put, else 1 + the index of its motion in `CityArt.motions`. */
  group: number;
}

export type SkylineMotionKind = 'slide' | 'spin' | 'sway' | 'blink';

export interface SkylineMotion {
  kind: SkylineMotionKind;
  /** slide: [dx, period]. spin: [cx, cy, period]. sway: [cx, cy, degrees, period]. blink: [period, duty]. */
  args: number[];
}

export interface CityArt {
  skyline: SkylinePiece[];
  prop: SkylinePiece[];
  /** How the panorama's moving groups move; a piece points at one through `group`. */
  motions: SkylineMotion[];
  /** The city's sign, drawn round 0,0 about one unit each way. */
  emblem: SkylinePiece[];
  /** The show the city puts on when it is cleaned; null for a drawing without one. */
  finale: CityFinalePlan | null;
}

/** Instruments both editions' synths can play. */
export const FINALE_VOICES = ['rhodes', 'marimba', 'kalimba', 'celesta', 'bell', 'pad', 'reed', 'pluck'] as const;
export type FinaleInstrument = (typeof FINALE_VOICES)[number];
export const FINALE_SHOWS = ['fireworks', 'beads', 'neon', 'balloons', 'meteors'] as const;
export type FinaleShow = (typeof FINALE_SHOWS)[number];
export const FINALE_BURST_KINDS = ['peony', 'ring', 'willow'] as const;
export type FinaleBurstKind = (typeof FINALE_BURST_KINDS)[number];

export interface FinaleBurst {
  /** Seconds into the show when the rocket goes up (it bursts a moment later). */
  t: number;
  x: number;
  y: number;
  kind: FinaleBurstKind;
  color: number;
  color2: number;
}

export interface CityFinalePlan {
  voice: FinaleInstrument;
  /** MIDI note the city's tunes are built on. */
  tonic: number;
  show: FinaleShow;
  hostSide: 'left' | 'right';
  bursts: FinaleBurst[];
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

const ARG_COUNTS: Record<string, number | null> = { R: 4, P: null, C: 3, H: 3, A: 6, L: 5, W: 8, S: 3, N: 5, G: 4 };
const MOTION_ARG_COUNTS: Record<SkylineMotionKind, number> = { slide: 2, spin: 3, sway: 4, blink: 2 };

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
    case 'G':
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

/** The longest a finale's show runs, in seconds; a burst must go up inside it. */
export const FINALE_SHOW_SECONDS = 5.5;

const HEX = /^#[0-9a-f]{6}$/;

function readFinaleLine(plan: Partial<CityFinalePlan> & { bursts: FinaleBurst[] }, tokens: string[], lineNo: number): void {
  const num = (s: string): number => {
    const v = Number(s);
    if (!Number.isFinite(v)) fail(lineNo, 'a number is not a number');
    return v;
  };
  const once = (key: keyof CityFinalePlan): void => {
    if (plan[key] !== undefined) fail(lineNo, `"${key}" is set twice`);
  };
  switch (tokens[0]) {
    case 'voice':
      once('voice');
      if (tokens.length !== 3 || !(FINALE_VOICES as readonly string[]).includes(tokens[1])) fail(lineNo, 'voice needs an instrument and a note');
      plan.voice = tokens[1] as FinaleInstrument;
      plan.tonic = num(tokens[2]);
      if (plan.tonic < 36 || plan.tonic > 84) fail(lineNo, 'the note is out of range');
      return;
    case 'show':
      once('show');
      if (tokens.length !== 2 || !(FINALE_SHOWS as readonly string[]).includes(tokens[1])) fail(lineNo, 'unknown show');
      plan.show = tokens[1] as FinaleShow;
      return;
    case 'host':
      once('hostSide');
      if (tokens.length !== 2 || (tokens[1] !== 'left' && tokens[1] !== 'right')) fail(lineNo, 'host is left or right');
      plan.hostSide = tokens[1];
      return;
    case 'burst': {
      if (tokens.length !== 7) fail(lineNo, 'wrong number of values for burst');
      const kind = tokens[4];
      if (!(FINALE_BURST_KINDS as readonly string[]).includes(kind)) fail(lineNo, `unknown burst "${kind}"`);
      if (!HEX.test(tokens[5]) || !HEX.test(tokens[6])) fail(lineNo, 'bad colour');
      const t = num(tokens[1]);
      if (t < 0 || t > FINALE_SHOW_SECONDS) fail(lineNo, 'a burst must go up during the show');
      plan.bursts.push({
        t,
        x: num(tokens[2]),
        y: num(tokens[3]),
        kind: kind as FinaleBurstKind,
        color: parseInt(tokens[5].slice(1), 16),
        color2: parseInt(tokens[6].slice(1), 16),
      });
      return;
    }
    default:
      fail(lineNo, `unknown finale setting "${tokens[0]}"`);
  }
}

/** Reads one city's drawing. Throws on a line it does not understand, so a typo fails the tests. */
export function parseCityArt(text: string): CityArt {
  const art: CityArt = { skyline: [], prop: [], motions: [], emblem: [], finale: null };
  let target = art.skyline;
  type Section = 'skyline' | 'prop' | 'emblem' | 'finale';
  let section = 'skyline' as Section;
  let finale: (Partial<CityFinalePlan> & { bursts: FinaleBurst[] }) | null = null;
  let order = 0;
  let group = 0;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith(';')) continue;
    if (line === '@skyline' || line === '@prop' || line === '@emblem' || line === '@finale') {
      if (group !== 0) fail(i + 1, 'a motion is still open (missing ~end)');
      section = line.slice(1) as Section;
      target = section === 'prop' ? art.prop : section === 'emblem' ? art.emblem : art.skyline;
      if (section === 'finale') {
        if (finale) fail(i + 1, 'only one @finale');
        finale = { bursts: [] };
      }
      order = 0;
      continue;
    }
    const tokens = line.split(/\s+/);
    if (section === 'finale') {
      readFinaleLine(finale!, tokens, i + 1);
      continue;
    }
    if (tokens[0].startsWith('~')) {
      if (tokens[0] === '~end') {
        if (group === 0 || tokens.length !== 1) fail(i + 1, '~end without a motion to end');
        group = 0;
        continue;
      }
      const kind = tokens[0].slice(1) as SkylineMotionKind;
      if (!(kind in MOTION_ARG_COUNTS)) fail(i + 1, `unknown motion "${tokens[0]}"`);
      if (target !== art.skyline) fail(i + 1, 'only the panorama can move');
      if (group !== 0) fail(i + 1, 'motions cannot be nested');
      const args = tokens.slice(1).map(Number);
      if (args.length !== MOTION_ARG_COUNTS[kind]) fail(i + 1, `wrong number of values for ${tokens[0]}`);
      if (args.some((v) => !Number.isFinite(v))) fail(i + 1, 'a number is not a number');
      if (args[args.length - (kind === 'blink' ? 2 : 1)] === 0) fail(i + 1, 'a period cannot be zero');
      art.motions.push({ kind, args });
      group = art.motions.length;
      continue;
    }
    const op = tokens[0].toUpperCase();
    if (!(op in ARG_COUNTS) || tokens[0].length !== 1) fail(i + 1, `unknown shape "${tokens[0]}"`);
    const colours = op === 'G' ? 2 : 1;
    const hexes = tokens.slice(-colours);
    const nums = tokens.slice(1, -colours).map(Number);
    for (const hex of hexes) if (!/^#[0-9a-f]{6}$/.test(hex)) fail(i + 1, `bad colour "${hex}"`);
    if (nums.some((v) => !Number.isFinite(v))) fail(i + 1, 'a number is not a number');
    const want = ARG_COUNTS[op];
    if (want === null ? nums.length < 6 || nums.length % 2 !== 0 : nums.length !== want) {
      fail(i + 1, `wrong number of values for ${op}`);
    }
    const light = tokens[0] !== op;
    const color = parseInt(hexes[0].slice(1), 16);
    const topColor = colours === 2 ? parseInt(hexes[1].slice(1), 16) : null;
    for (const tris of tessellate(op, nums)) {
      target.push({ light, color, order, cx: middleX(tris), tris, topColor, group });
    }
    order++;
  }
  if (group !== 0) fail(lines.length, 'a motion is still open (missing ~end)');
  if (finale) {
    const f: Partial<CityFinalePlan> & { bursts: FinaleBurst[] } = finale;
    if (f.voice === undefined || f.tonic === undefined || f.show === undefined || f.hostSide === undefined) {
      fail(lines.length, '@finale needs voice, show and host');
    }
    art.finale = { voice: f.voice, tonic: f.tonic, show: f.show, hostSide: f.hostSide, bursts: f.bursts };
  }
  return art;
}

/** Where a moving group is at a moment: how far it has slid, turned, and how bright its lights are. */
export interface SkylineMotionState {
  /** Along the horizon, in drawing units. */
  dx: number;
  /** About the motion's pivot, counter-clockwise as drawn. */
  angleRad: number;
  /** 0..1 multiplier on the group's lights. */
  glow: number;
}

/** Brightness of a blinking light while it is off: a faint ember, never fully dark. */
export const SKYLINE_BLINK_OFF = 0.18;

/**
 * The state of a motion `timeSec` into the stage. Pass null for Reduce Motion: everything rests in
 * its drawn place and blinking lights stay on.
 */
export function skylineMotionState(motion: SkylineMotion, timeSec: number | null): SkylineMotionState {
  const state: SkylineMotionState = { dx: 0, angleRad: 0, glow: 1 };
  if (timeSec === null) return state;
  const a = motion.args;
  const turn = Math.PI * 2;
  switch (motion.kind) {
    case 'slide':
      state.dx = a[0] * 0.5 * (1 - Math.cos((turn * timeSec) / a[1]));
      break;
    case 'spin':
      state.angleRad = ((timeSec / a[2]) % 1) * turn;
      break;
    case 'sway':
      state.angleRad = a[2] * (Math.PI / 180) * Math.sin((turn * timeSec) / a[3]);
      break;
    default: {
      const phase = timeSec / a[0] - Math.floor(timeSec / a[0]);
      state.glow = phase < a[1] ? 1 : SKYLINE_BLINK_OFF;
    }
  }
  return state;
}

/** The point a motion turns about (spin, sway), in drawing units; null for motions with no pivot. */
export function skylineMotionPivot(motion: SkylineMotion): { x: number; y: number } | null {
  return motion.kind === 'spin' || motion.kind === 'sway' ? { x: motion.args[0], y: motion.args[1] } : null;
}

/** Lowest and highest y of a piece: a shaded rectangle runs from `color` at the first to `topColor` at the second. */
export function skylinePieceSpanY(piece: SkylinePiece): { minY: number; maxY: number } {
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < piece.tris.length; i += 2) {
    minY = Math.min(minY, piece.tris[i]);
    maxY = Math.max(maxY, piece.tris[i]);
  }
  return { minY, maxY };
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

export interface SkylinePropAnchor {
  x: number;
  z: number;
  /** Props on the east side are drawn flipped left-to-right, so both rows face the stage. */
  mirrored: boolean;
}

/** Where the roadside props stand: a row down each side of the stage. */
export function skylinePropAnchors(worldWidth: number, worldDepth: number): SkylinePropAnchor[] {
  const out: SkylinePropAnchor[] = [];
  for (const f of SKYLINE_PROP_PLACE.depthFractions) {
    out.push({ x: SKYLINE_PROP_PLACE.insetX, z: worldDepth * f, mirrored: false });
    out.push({ x: worldWidth - SKYLINE_PROP_PLACE.insetX, z: worldDepth * f, mirrored: true });
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

/**
 * How brightly a district's sky and moving lights burn (0..1): a dim glow at first, rising smoothly
 * as it gets clean, full once it is sealed.
 */
export function skylineLightLevel(cleanRatio: number, sealed: boolean): number {
  if (sealed) return 1;
  const r = Math.max(0, Math.min(1, cleanRatio));
  return 0.14 + 0.46 * r * r;
}

/**
 * Windows, signs and lamps do not fade up together: each belongs to one of a few steps, and a step
 * switches on when its district passes that step's share of clean. The town lights up a few windows
 * at a time, then blazes when the district is sealed.
 */
export const SKYLINE_LIGHT_STEPS = 4;
/** Brightness of a stepped light that is off, and of one that is on before its district is sealed. */
export const SKYLINE_STEP_OFF = 0.14;
export const SKYLINE_STEP_ON = 0.82;
/** The last step switches on at this clean ratio; the others are spread evenly below it. */
export const SKYLINE_STEP_SPAN = 0.72;

/** The step a light belongs to, from its place in the drawing. */
export function skylineLightStep(pieceIndex: number): number {
  return pieceIndex % SKYLINE_LIGHT_STEPS;
}

/** The step a roadside prop's lights belong to: the lamps come on in pairs, far end first. */
export function skylinePropStep(anchorIndex: number): number {
  return Math.floor(anchorIndex / 2) % SKYLINE_LIGHT_STEPS;
}

/** How brightly a stepped light burns (0..1). */
export function skylineStepLevel(cleanRatio: number, sealed: boolean, step: number): number {
  if (sealed) return 1;
  const threshold = ((step + 1) / SKYLINE_LIGHT_STEPS) * SKYLINE_STEP_SPAN;
  return cleanRatio >= threshold ? SKYLINE_STEP_ON : SKYLINE_STEP_OFF;
}
