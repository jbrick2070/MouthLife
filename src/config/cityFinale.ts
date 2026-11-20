/**
 * City finales: the show a city puts on when the player seals its last zone, and the Golden Molar
 * its pieces build.
 *
 * Every city ends the same way, so players learn the rhythm and look forward to it:
 *
 *   hush      the game freezes and fades into the city at night
 *   rise      the probe flies up out of the mouth
 *   wave      it sweeps across the skyline and every light comes on behind it
 *   blaze     the camera pulls back on the whole city, lit
 *   show      the city celebrates (fireworks, beads, neon, balloons or shooting stars) and its host
 *             pops up to say thank you
 *   emblem    one last rocket bursts into the city's sign, drawn in sparks
 *   gather    the sparks pull together into the city's piece of the Golden Molar
 *   prize     the probe rises to meet it and holds it up, to a fanfare
 *   molar     the piece clicks into its place in the Golden Molar, in pearl, silver or gold
 *   climb     a mountain rises with a ledge per city and the Golden Molar on its summit; the probe
 *             hops up to its new ledge ("2 more to the top") and the music stops on a chord that
 *             is not finished yet. The city that completes the set climbs all the way to the top.
 *   liftoff   the probe flies off, and the score follows
 *
 * Exact lengths, so a recorded song can be made to fit: a city's finale is 30 s, the ending 60 s,
 * and every cue sits on a 120 BPM grid (a 4/4 bar every 2 s): 15 bars a city, 30 for the ending.
 * A song dropped into the music folder (FINALE_TRACK_CANDIDATES) plays in place of the score's
 * instruments, starting the moment the last zone seals; the score's effects (booms, whistles,
 * sparkles) still play over it.
 *
 * A lower first molar has five cusps: one per city. The finish of each piece follows the city's best
 * grade, so a replay can turn a pearl piece silver or gold. Sealing all five plays the ending (see
 * ENDING_TIMES): the Golden Molar assembles, the cities roll by as credits, and gold in every city
 * earns a surprise.
 *
 * Everything here is a pure function of time, so both editions draw and play the same show. This
 * file is the web half of a pair: native-apple/Sources/MouthLifeCore/Config/CityFinale.swift must
 * give the same numbers (tests/cityFinale.test.ts and the Swift tests check it).
 */
import type {
  CityFinalePlan,
  FinaleBurst,
  FinaleInstrument,
  FinaleShow,
  SkylinePiece,
} from './citySkylineGeometry';

export type FinaleGrade = 'NONE' | 'C' | 'B' | 'A' | 'S' | 'FLUORAPATITE_GOLD';

// ------------------------------------------------------------------ timing

/** Seconds from the moment the last zone seals. */
export const FINALE_TIMES = {
  hushEnd: 1.0,
  riseEnd: 2.5,
  waveEnd: 7.0,
  /** The show starts here; a burst's `t` counts from this moment. */
  blazeEnd: 8.0,
  showEnd: 13.5,
  emblemBurst: 14.0,
  emblemEnd: 15.5,
  gatherEnd: 16.5,
  meet: 18.0,
  prizeEnd: 19.5,
  slot: 21.0,
  /** The molar moves to the top of the mountain as it rises. */
  molarEnd: 22.0,
  /** The probe lands on its new ledge. */
  climbHop: 24.0,
  /** ...and, for the city that completes the set, on the summit. */
  summitHop: 26.0,
  /** A ring of teeth opens in the sky: the wormhole to the next city (finale3d.ts draws it). */
  portalOpen: 26.0,
  /** The probe flies up into the ring as the camera lifts to it. */
  portalLift: 27.0,
  /** The probe goes in and the camera dives through the tunnel of teeth (with the whoosh). */
  dive: 28.0,
  /** The probe nods hello at the ring of teeth... */
  hello: 26.5,
  /** ...and its tiny double in the next city's sky nods back on these beats as we fly in. */
  helloBack: 28.5,
  climbEnd: 28.0,
  end: 30.0,
  /** The Skip button appears after this. */
  skipAfter: 1.5,
} as const;

/** The ending, played once all five cities are clean. Seconds from its start. */
export const ENDING_TIMES = {
  fadeEnd: 1.0,
  firstPiece: 1.5,
  pieceGap: 1.0,
  pieceFlight: 1.0,
  snap: 8.0,
  creditsStart: 12.0,
  creditSeconds: 8.0,
  finaleStart: 52.0,
  face: 54.0,
  wink: 55.5,
  end: 60.0,
  skipAfter: 1.0,
} as const;

/**
 * Songs for the finales, by file name without extension, from the shared music folder
 * (native-apple/MouthLifeApp/Music). First match wins; nothing falls back to another song.
 */
export const FINALE_TRACK_CANDIDATES: readonly (readonly string[])[] = [
  ['finale_toronto', 'finale_world_1'],
  ['finale_new_orleans', 'finale_nola', 'finale_world_2'],
  ['finale_tokyo', 'finale_tokyo_chicago', 'finale_world_3'],
  ['finale_accra', 'finale_accra_colorado', 'finale_world_4'],
  ['finale_aurora', 'finale_orbit', 'finale_world_5'],
];
export const ENDING_TRACK_CANDIDATES: readonly string[] = ['finale_ending', 'grand_finale', 'ending'];
/** Score voices that still play over a recorded song: the show's sound effects. */
export const FINALE_EFFECT_VOICES: readonly string[] = ['whistle', 'boom', 'sparkle', 'whoosh'];

/** The bundled song for a city's finale (index 0..4) or the ending (index -1), or null. */
export function resolveFinaleTrack(index: number, files: readonly string[]): string | null {
  const stems = index < 0 ? ENDING_TRACK_CANDIDATES : FINALE_TRACK_CANDIDATES[index] ?? [];
  const order = ['m4a', 'mp3', 'aac', 'wav', 'ogg'];
  for (const stem of stems) {
    const hits = files.filter((f) => {
      const dot = f.lastIndexOf('.');
      return dot > 0 && f.slice(0, dot).toLowerCase() === stem && order.includes(f.slice(dot + 1).toLowerCase());
    });
    if (hits.length) {
      return hits.sort((a, b) => order.indexOf(a.slice(a.lastIndexOf('.') + 1).toLowerCase()) - order.indexOf(b.slice(b.lastIndexOf('.') + 1).toLowerCase()))[0];
    }
  }
  return null;
}

export const CAMPAIGN_PIECES = 5;

/** The campaign's host cities in order (WorldCartridge.hostId of world_1 .. world_5): piece 0 .. 4. */
export const FINALE_HOST_IDS = ['toronto', 'new_orleans', 'tokyo', 'accra', 'orbit_aurora'] as const;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 0 at or before 0, 1 at or after 1, eased in between. */
export function smooth01(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}

function easeOutCubic(x: number): number {
  const u = 1 - clamp(x, 0, 1);
  return 1 - u * u * u;
}

function easeInCubic(x: number): number {
  const u = clamp(x, 0, 1);
  return u * u * u;
}

/** Overshoots a little before settling at 1: things that pop into place. */
function backOut(x: number): number {
  const u = clamp(x, 0, 1) - 1;
  return 1 + 2.7 * u * u * u + 1.7 * u * u;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * A repeatable number in [0, 1) for a pair of integers. Integer arithmetic only, so the Swift
 * edition gets exactly the same value.
 */
export function finaleHash(a: number, b: number): number {
  let h = (Math.imul(a, 0x27d4eb2d) ^ Math.imul((b + 0x9e3779b9) | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

// ------------------------------------------------------------------ the city at night, relit

const WAVE_FROM = -3;
const WAVE_TO = 67;

/** Where the wave of light has reached along the panorama (drawing units). */
export function finaleWaveX(t: number): number {
  const { riseEnd, waveEnd } = FINALE_TIMES;
  if (t <= riseEnd) return WAVE_FROM;
  if (t >= waveEnd) return WAVE_TO;
  return WAVE_FROM + ((WAVE_TO - WAVE_FROM) * (t - riseEnd)) / (waveEnd - riseEnd);
}

/** When the wave reaches a point of the panorama. With Reduce Motion the whole city fades up at once. */
export function finalePassTime(cx: number, reducedMotion: boolean): number {
  const { riseEnd, waveEnd } = FINALE_TIMES;
  if (reducedMotion) return riseEnd + 1.0;
  const c = clamp(cx, WAVE_FROM, WAVE_TO);
  return riseEnd + ((c - WAVE_FROM) / (WAVE_TO - WAVE_FROM)) * (waveEnd - riseEnd);
}

export type FinaleLayer = 'light' | 'scenery' | 'sky';

export interface FinaleTint {
  /** Multiplier on the piece's colour. */
  level: number;
  /** 0..1: how far to push the colour toward white (a light flaring as it comes on). */
  flash: number;
}

const NIGHT: Record<FinaleLayer, number> = { light: 0.06, scenery: 0.3, sky: 0.12 };
const RAMP: Record<FinaleLayer, number> = { light: 0.18, scenery: 0.7, sky: 1.2 };

/** How the city looks behind the stage while the prize and the molar take the front. */
export function finaleBackdropDim(t: number): number {
  return 1 - 0.35 * smooth01((t - 14.0) / 1.0);
}

/** Brightness of a panorama piece (by its middle `cx` and kind) during the finale. */
export function finaleCityTint(
  t: number,
  cx: number,
  layer: FinaleLayer,
  show: FinaleShow,
  reducedMotion: boolean
): FinaleTint {
  const age = t - finalePassTime(cx, reducedMotion);
  const ramp = RAMP[layer] * (reducedMotion ? 3 : 1);
  let level = age <= 0 ? NIGHT[layer] : NIGHT[layer] + (1 - NIGHT[layer]) * smooth01(age / ramp);
  let flash = 0;
  if (layer === 'light' && age > 0 && !reducedMotion) flash = 0.75 * Math.exp(-age / 0.16);
  const showT = t - FINALE_TIMES.blazeEnd;
  if (show === 'neon' && layer === 'light' && !reducedMotion && showT >= 0 && t < FINALE_TIMES.showEnd) {
    level *= 0.84 + 0.16 * Math.cos(Math.PI * 4 * showT);
  }
  level *= finaleBackdropDim(t);
  return { level, flash };
}

export interface FinaleCamera {
  /** Middle of the view along the panorama. */
  cx: number;
  /** How much of the panorama's width the view wants to show. */
  viewW: number;
}

/** The camera starts close on the west end, follows the wave, then pulls back on the whole city. */
export function finaleCamera(t: number, reducedMotion: boolean): FinaleCamera {
  const { riseEnd, waveEnd, blazeEnd } = FINALE_TIMES;
  if (reducedMotion) return { cx: 32, viewW: 64 };
  if (t < riseEnd) return { cx: 20, viewW: 40 };
  if (t < waveEnd) return { cx: clamp(finaleWaveX(t), 20, 44), viewW: 40 };
  const s = smooth01((t - waveEnd) / (blazeEnd - waveEnd));
  return { cx: lerp(44, 32, s), viewW: lerp(40, 64, s) };
}

// ------------------------------------------------------------------ the probe and the prize

/**
 * Two kinds of place. 'city' is in panorama drawing units. 'stage' is centred on the screen, in
 * units of half its shorter side, y up.
 */
export type FinaleSpace = 'city' | 'stage' | 'hidden';

export interface FinaleProbe {
  space: FinaleSpace;
  x: number;
  y: number;
  alpha: number;
}

/** How far ahead of the wave the probe flies. */
const PROBE_LEAD = 1.2;
export const PROBE_WAVE_Y = 6.8;
const RISE_P0 = { x: 32, y: -3 };
const RISE_P1 = { x: 20, y: 11 };
const RISE_P2 = { x: WAVE_FROM + PROBE_LEAD, y: PROBE_WAVE_Y };

function probeWaveY(t: number): number {
  return PROBE_WAVE_Y + 0.5 * Math.sin((Math.PI * 2 * (t - FINALE_TIMES.riseEnd)) / 1.6);
}
/** Where the probe hovers while the molar fills. */
export const PROBE_PARK = { x: 0, y: -0.78 };
/** The middle of the wormhole's ring of teeth, high over the mountain: the probe flies into it. */
export const PORTAL_STAGE = { x: 0, y: 1.6 };

/** One quick nod (0 up to 1 and back over 0.45 s) starting at `at`; none with Reduce Motion. */
export function finaleNod(t: number, at: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const s = (t - at) / 0.45;
  return s <= 0 || s >= 1 ? 0 : Math.sin(Math.PI * s);
}

/**
 * "A hug for you" at the very end (an idea from Codex Astra 6.2): once its face is on, the Golden
 * Molar opens its arms wide to the child, folds them into a hug on the wink, gives one gentle squeeze
 * with happy eyes, and hearts float up. With Reduce Motion the arms fade in already hugging.
 */
export function endingHug(
  t: number,
  reducedMotion: boolean
): { arms: number; open: number; fold: number; squeeze: number; happyEyes: boolean; hearts: number } {
  const E = ENDING_TIMES;
  if (reducedMotion) {
    return {
      arms: smooth01((t - (E.wink + 0.5)) / 0.8),
      open: 1,
      fold: 1,
      squeeze: 0,
      happyEyes: false,
      hearts: smooth01((t - (E.wink + 1.5)) / 0.8),
    };
  }
  return {
    arms: smooth01((t - (E.face + 0.2)) / 0.4),
    open: smooth01((t - (E.face + 0.2)) / 0.7),
    fold: smooth01((t - E.wink) / 0.7),
    squeeze: finaleNod(t, E.wink + 1.5, false),
    happyEyes: t >= E.wink + 0.8 && t < E.wink + 2.4,
    hearts: smooth01((t - (E.wink + 1.5)) / 0.4),
  };
}

/** How far the five city bubbles over the Golden Molar's pieces have faded in (grand finale, 0..1). */
export function endingCityBubbles(t: number): number {
  return smooth01((t - (ENDING_TIMES.finaleStart + 0.6)) / 0.8);
}

/** The tiny probe in the next city's sky nodding back, once on each of three beats as we fly in. */
export function finaleHelloBack(t: number, reducedMotion: boolean): number {
  let nod = 0;
  for (let k = 0; k < 3; k++) nod = Math.max(nod, finaleNod(t, FINALE_TIMES.helloBack + 0.5 * k, reducedMotion));
  return nod;
}

/**
 * The probe's path. `climbTo` is the ledge it climbs to (the city's campaign index); with
 * `summit` it goes on to the top of the mountain (the city that completes the set).
 */
export function finaleProbe(t: number, reducedMotion: boolean, climbTo = 0, summit = false): FinaleProbe {
  const T = FINALE_TIMES;
  if (reducedMotion) {
    if (t < T.gatherEnd || t >= T.end) return { space: 'hidden', x: 0, y: 0, alpha: 0 };
    if (t < T.molarEnd) {
      const fadeIn = smooth01((t - T.gatherEnd) / 0.6);
      const fadeOut = 1 - smooth01((t - (T.molarEnd - 0.4)) / 0.4);
      return { space: 'stage', x: 0, y: 0, alpha: fadeIn * fadeOut };
    }
    const at = finaleLedge(summit ? CAMPAIGN_PIECES : climbTo, t, true);
    const alpha = smooth01((t - T.molarEnd - 0.4) / 0.6) * (1 - smooth01((t - T.climbEnd) / 0.8));
    return { space: 'stage', x: at.x, y: at.y, alpha };
  }
  if (t < T.hushEnd) return { space: 'hidden', x: 0, y: 0, alpha: 0 };
  if (t < T.riseEnd) {
    const s = smooth01((t - T.hushEnd) / (T.riseEnd - T.hushEnd));
    const u = 1 - s;
    return {
      space: 'city',
      x: u * u * RISE_P0.x + 2 * u * s * RISE_P1.x + s * s * RISE_P2.x,
      y: u * u * RISE_P0.y + 2 * u * s * RISE_P1.y + s * s * RISE_P2.y,
      alpha: 1,
    };
  }
  if (t < T.waveEnd) return { space: 'city', x: finaleWaveX(t) + PROBE_LEAD, y: probeWaveY(t), alpha: 1 };
  if (t < T.waveEnd + 0.6) {
    const s = (t - T.waveEnd) / 0.6;
    return { space: 'city', x: lerp(WAVE_TO + PROBE_LEAD, 76, s), y: lerp(probeWaveY(T.waveEnd), 9, s), alpha: 1 };
  }
  if (t < T.gatherEnd) return { space: 'hidden', x: 0, y: 0, alpha: 0 };
  if (t < T.meet) {
    const s = easeOutCubic((t - T.gatherEnd) / (T.meet - T.gatherEnd));
    return { space: 'stage', x: 0, y: lerp(-1.4, 0, s), alpha: 1 };
  }
  const bob = 0.015 * Math.sin((Math.PI * 2 * t) / 1.1);
  if (t < T.prizeEnd) return { space: 'stage', x: 0, y: bob, alpha: 1 };
  if (t < T.molarEnd) {
    const s = smooth01((t - T.prizeEnd) / 0.8);
    return { space: 'stage', x: lerp(0, PROBE_PARK.x, s), y: lerp(0, PROBE_PARK.y, s) + bob, alpha: 1 };
  }
  if (t >= T.end) return { space: 'hidden', x: 0, y: 0, alpha: 0 };
  const climbAt = (time: number): { x: number; y: number } => {
    const from = finaleLedge(climbTo - 1, time, false);
    const to = finaleLedge(climbTo, time, false);
    const hopStart = T.climbHop - 0.8;
    if (time < hopStart) {
      const s = smooth01((time - T.molarEnd) / (hopStart - T.molarEnd));
      return { x: lerp(PROBE_PARK.x, from.x, s), y: lerp(PROBE_PARK.y, from.y, s) };
    }
    if (time < T.climbHop) {
      const s = (time - hopStart) / 0.8;
      const e = smooth01(s);
      return { x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e) + 0.22 * Math.sin(Math.PI * s) };
    }
    const summitStart = T.summitHop - 0.8;
    if (!summit || time < summitStart) return to;
    const top = finaleLedge(CAMPAIGN_PIECES, time, false);
    if (time < T.summitHop) {
      const s = (time - summitStart) / 0.8;
      const e = smooth01(s);
      return { x: lerp(to.x, top.x, e), y: lerp(to.y, top.y, e) + 0.22 * Math.sin(Math.PI * s) };
    }
    return top;
  };
  if (t < T.portalLift) {
    const p = climbAt(t);
    const hopping = (t >= T.climbHop - 0.8 && t < T.climbHop) || (summit && t >= T.summitHop - 0.8 && t < T.summitHop);
    return { space: 'stage', x: p.x, y: p.y + (hopping ? 0 : bob), alpha: 1 };
  }
  // up into the wormhole's ring of teeth, then in through it as the camera dives after it
  const start = climbAt(T.portalLift);
  if (t < T.dive) {
    const s = smooth01((t - T.portalLift) / (T.dive - T.portalLift));
    return {
      space: 'stage',
      x: lerp(start.x, PORTAL_STAGE.x, s) + 0.2 * Math.sin(Math.PI * s),
      y: lerp(start.y, PORTAL_STAGE.y, s),
      alpha: 1,
    };
  }
  const inside = 1 - smooth01((t - T.dive) / 0.3);
  if (inside <= 0) return { space: 'hidden', x: 0, y: 0, alpha: 0 };
  return { space: 'stage', x: PORTAL_STAGE.x, y: PORTAL_STAGE.y, alpha: inside };
}

// ------------------------------------------------------------------ the climb

/**
 * The mountain the cities climb, in stage units (before it rises into place): a ledge per city,
 * Toronto at the foot, and the Golden Molar on the peak.
 */
export const MOUNTAIN = {
  outline: [
    { x: -1.5, y: -1.1 },
    { x: -1.0, y: -0.62 },
    { x: -0.78, y: -0.66 },
    { x: -0.42, y: -0.2 },
    { x: -0.2, y: 0.22 },
    { x: 0, y: 0.5 },
    { x: 0.18, y: 0.26 },
    { x: 0.4, y: -0.02 },
    { x: 0.58, y: -0.1 },
    { x: 0.98, y: -0.62 },
    { x: 1.5, y: -1.1 },
  ],
  snow: [
    { x: -0.2, y: 0.22 },
    { x: 0, y: 0.5 },
    { x: 0.18, y: 0.26 },
    { x: 0.08, y: 0.31 },
    { x: 0, y: 0.25 },
    { x: -0.1, y: 0.3 },
  ],
  ledges: [
    { x: -0.6, y: -0.74 },
    { x: 0.52, y: -0.5 },
    { x: -0.36, y: -0.24 },
    { x: 0.3, y: 0.0 },
    { x: -0.12, y: 0.24 },
  ],
  /** Where the probe waits before the first city. */
  foot: { x: 0, y: -0.96 },
  /** Where the probe stands at the top, and where the molar sits above it. */
  summitStand: { x: 0, y: 0.46 },
  summit: { x: 0, y: 0.66 },
  /** How far below its place the mountain starts as it rises. */
  riseFrom: -1.9,
} as const;

/** The molar's size on the summit, relative to GOLDEN_MOLAR.scale. */
export const MOLAR_ON_SUMMIT = 0.34;

export function finaleMountain(t: number, reducedMotion: boolean): { alpha: number; dy: number } {
  const T = FINALE_TIMES;
  if (t < T.molarEnd) return { alpha: 0, dy: MOUNTAIN.riseFrom };
  const s = (t - T.molarEnd) / 0.8;
  if (reducedMotion) return { alpha: smooth01(s), dy: 0 };
  return { alpha: smooth01(s * 1.5), dy: MOUNTAIN.riseFrom * (1 - easeOutCubic(s)) };
}

/** A ledge's place as the mountain rises: -1 is the foot, 0..4 the cities, 5 the summit. */
export function finaleLedge(index: number, t: number, reducedMotion: boolean): { x: number; y: number } {
  const p = index < 0 ? MOUNTAIN.foot : index >= CAMPAIGN_PIECES ? MOUNTAIN.summitStand : MOUNTAIN.ledges[index];
  return { x: p.x, y: p.y + finaleMountain(t, reducedMotion).dy };
}

/** Radius of the city's piece while the probe holds it (stage units). */
export const PIECE_RADIUS = 0.2;
const PIECE_FORM = { x: 0, y: 0.42 };
const PIECE_HELD = { x: 0, y: 0.22 };

export interface FinalePiece {
  visible: boolean;
  x: number;
  y: number;
  /** Size relative to PIECE_RADIUS. */
  scale: number;
  /** Spin about its upright axis (radians): drawn as a coin turning, cos(spin) wide. */
  spin: number;
  /** 1 normally, more while it flares. */
  glow: number;
  alpha: number;
}

const NO_PIECE: FinalePiece = { visible: false, x: 0, y: 0, scale: 0, spin: 0, glow: 0, alpha: 0 };

/** The city's piece, from the moment the sparks pull together until it clicks into the molar. */
export function finalePiece(t: number, slotIndex: number, reducedMotion: boolean): FinalePiece {
  const T = FINALE_TIMES;
  if (t < T.emblemEnd || t >= T.slot) return NO_PIECE;
  const slot = finaleSlotPosition(slotIndex);
  const slotScale = (GOLDEN_MOLAR.cuspRadius * GOLDEN_MOLAR.scale) / PIECE_RADIUS;
  if (reducedMotion) {
    if (t < T.prizeEnd) {
      const a = smooth01((t - T.emblemEnd) / 0.8);
      return { visible: true, x: PIECE_HELD.x, y: PIECE_HELD.y, scale: 1, spin: 0, glow: 1, alpha: a };
    }
    const s = smooth01((t - T.prizeEnd) / (T.slot - T.prizeEnd));
    return { visible: true, x: slot.x, y: slot.y, scale: slotScale, spin: 0, glow: 1, alpha: s };
  }
  if (t < T.gatherEnd) {
    const s = (t - T.emblemEnd) / (T.gatherEnd - T.emblemEnd);
    const scale = s < 0.6 ? 0 : backOut((s - 0.6) / 0.4);
    return { visible: scale > 0, x: PIECE_FORM.x, y: PIECE_FORM.y, scale, spin: s * Math.PI * 10, glow: 1.4, alpha: 1 };
  }
  if (t < T.meet) {
    const s = (t - T.gatherEnd) / (T.meet - T.gatherEnd);
    const e = smooth01(s);
    return {
      visible: true,
      x: PIECE_FORM.x,
      y: lerp(PIECE_FORM.y, PIECE_HELD.y, e),
      scale: 1,
      spin: Math.PI * 4 * (1 - (1 - s) * (1 - s)),
      glow: 1.2,
      alpha: 1,
    };
  }
  const bob = 0.015 * Math.sin((Math.PI * 2 * t) / 1.1);
  if (t < T.prizeEnd) {
    const flare = Math.exp(-(t - T.meet) / 0.18);
    return { visible: true, x: PIECE_HELD.x, y: PIECE_HELD.y + bob, scale: 1 + 0.25 * flare, spin: 0, glow: 1 + 0.6 * flare, alpha: 1 };
  }
  const s = (t - T.prizeEnd) / (T.slot - T.prizeEnd);
  const e = smooth01(s);
  const u = 1 - e;
  const ctrl = { x: slot.x * 0.5, y: 0.62 };
  return {
    visible: true,
    x: u * u * PIECE_HELD.x + 2 * u * e * ctrl.x + e * e * slot.x,
    y: u * u * (PIECE_HELD.y + bob) + 2 * u * e * ctrl.y + e * e * slot.y,
    scale: lerp(1, slotScale, e),
    spin: Math.PI * 2 * e,
    glow: 1,
    alpha: 1,
  };
}

// ------------------------------------------------------------------ the Golden Molar

/**
 * A lower first molar seen from above: five cusps, one per city, in campaign order. Molar units run
 * about -1..1; `scale` turns them into stage units.
 */
export const GOLDEN_MOLAR = {
  center: { x: 0, y: -0.02 },
  scale: 0.5,
  cuspRadius: 0.29,
  /** Toronto, New Orleans, Tokyo & Chicago, Accra & Colorado, Station Aurora. */
  cusps: [
    { x: -0.56, y: -0.3 },
    { x: -0.44, y: 0.4 },
    { x: 0.06, y: -0.4 },
    { x: 0.36, y: 0.42 },
    { x: 0.7, y: -0.08 },
  ],
  /**
   * The crown's outline: a rounded block (`core`) with a round lobe of `lobeRadius` under each
   * cusp, so its edge bulges where the cusps are, like a real molar seen from above.
   */
  lobeRadius: 0.41,
  core: { x: -0.62, y: -0.4, w: 1.36, h: 0.82, r: 0.3 },
  /** Middle of the crown: where the face goes in the ending's surprise. */
  bodyCenter: { x: 0.06, y: 0.01 },
  /** The central groove that zig-zags between the cusps. */
  groove: [
    { x: -0.94, y: 0.04 },
    { x: -0.2, y: 0.05 },
    { x: 0.22, y: -0.02 },
    { x: 1.0, y: 0.06 },
  ],
} as const;

export type MolarFinish = 'empty' | 'pearl' | 'silver' | 'gold';

/** Light and dark colours of each finish, for a soft shine across a piece. */
export const MOLAR_FINISH_COLORS: Readonly<Record<MolarFinish, readonly [number, number]>> = {
  empty: [0x1e293b, 0x0f172a],
  pearl: [0xfff7ed, 0xd6d3d1],
  silver: [0xf8fafc, 0x94a3b8],
  gold: [0xfef3c7, 0xd97706],
};

export function molarFinishForGrade(grade: FinaleGrade | null | undefined, completed: boolean): MolarFinish {
  if (!completed) return 'empty';
  if (grade === 'FLUORAPATITE_GOLD') return 'gold';
  if (grade === 'A' || grade === 'S') return 'silver';
  return 'pearl';
}

/** Where a cusp sits on the stage (for the molar at its usual place and size). */
export function finaleSlotPosition(
  index: number,
  center: { x: number; y: number } = GOLDEN_MOLAR.center,
  scale: number = GOLDEN_MOLAR.scale
): { x: number; y: number } {
  const c = GOLDEN_MOLAR.cusps[clamp(Math.round(index), 0, CAMPAIGN_PIECES - 1)];
  return { x: center.x + c.x * scale, y: center.y + c.y * scale };
}

export interface FinaleMolar {
  alpha: number;
  /** Multiplier on GOLDEN_MOLAR.scale (it pops in a little small, then shrinks onto the summit). */
  scale: number;
  /** Where its centre is (stage units). */
  x: number;
  y: number;
}

export function finaleMolar(t: number, reducedMotion: boolean): FinaleMolar {
  const T = FINALE_TIMES;
  const c = GOLDEN_MOLAR.center;
  if (t < T.prizeEnd) return { alpha: 0, scale: 1, x: c.x, y: c.y };
  const s = (t - T.prizeEnd) / 0.5;
  const alpha = smooth01(s);
  const popped = reducedMotion ? 1 : lerp(0.85, 1, backOut(s));
  if (t < T.molarEnd) return { alpha, scale: popped, x: c.x, y: c.y };
  const top = MOUNTAIN.summit;
  if (reducedMotion) {
    if (t < T.molarEnd + 0.4) return { alpha: 1 - smooth01((t - T.molarEnd) / 0.4), scale: 1, x: c.x, y: c.y };
    return { alpha: smooth01((t - T.molarEnd - 0.4) / 0.4), scale: MOLAR_ON_SUMMIT, x: top.x, y: top.y };
  }
  const m = smooth01((t - T.molarEnd) / 0.8);
  return { alpha, scale: lerp(popped, MOLAR_ON_SUMMIT, m), x: lerp(c.x, top.x, m), y: lerp(c.y, top.y, m) };
}

/** How brightly the newly placed piece shines once it clicks in (a sweep of light across it). */
export function finaleSlotShine(t: number): number {
  const a = t - FINALE_TIMES.slot;
  if (a < 0) return 0;
  return Math.exp(-a / 0.5);
}

// ------------------------------------------------------------------ the emblem in sparks

/** The last rocket of the show bursts here (stage units) into the city's sign. */
export const FINALE_EMBLEM = { x: 0, y: 0.3, scale: 0.42, sparks: 120, rocketFromY: -1.3 } as const;

export interface EmblemTarget {
  x: number;
  y: number;
  color: number;
}

function luma(color: number): number {
  return (0.2126 * ((color >> 16) & 255) + 0.7152 * ((color >> 8) & 255) + 0.0722 * (color & 255)) / 255;
}

/** Points spread over the city's sign that the sparks fly to, each in its piece's colour. */
export function finaleEmblemTargets(emblem: readonly SkylinePiece[], count = FINALE_EMBLEM.sparks): EmblemTarget[] {
  const all: EmblemTarget[] = [];
  for (const piece of emblem) {
    // Dark parts of a sign (Ghana's black star) would vanish against the night: draw them in gold.
    const color = luma(piece.color) < 0.12 ? 0xfde047 : piece.color;
    const t = piece.tris;
    for (let i = 0; i + 5 < t.length; i += 6) {
      const cx = (t[i] + t[i + 2] + t[i + 4]) / 3;
      const cy = (t[i + 1] + t[i + 3] + t[i + 5]) / 3;
      all.push({ x: cx, y: cy, color });
      for (let v = 0; v < 3; v++) all.push({ x: (cx + t[i + v * 2]) * 0.5, y: (cy + t[i + v * 2 + 1]) * 0.5, color });
    }
  }
  if (all.length === 0) return [];
  const out: EmblemTarget[] = [];
  for (let k = 0; k < count; k++) out.push(all[Math.floor((k * all.length) / count)]);
  return out;
}

/** The rocket carrying the emblem up the middle of the screen, or null when it is not flying. */
export function finaleEmblemRocket(t: number): { x: number; y: number } | null {
  const from = FINALE_TIMES.showEnd;
  const to = FINALE_TIMES.emblemBurst;
  if (t < from || t >= to) return null;
  const s = easeOutCubic((t - from) / (to - from));
  return { x: FINALE_EMBLEM.x, y: lerp(FINALE_EMBLEM.rocketFromY, FINALE_EMBLEM.y, s) };
}

export interface FinaleSparkPoint {
  x: number;
  y: number;
  alpha: number;
}

/**
 * The sign itself, glowing, as the sparks settle on it: it fades in, holds, then shrinks into the
 * forming piece along with them. Scale is stage units per emblem unit.
 */
export function finaleEmblemShape(t: number): { x: number; y: number; scale: number; alpha: number } {
  const T = FINALE_TIMES;
  const gatherDone = T.emblemEnd + 0.6 * (T.gatherEnd - T.emblemEnd);
  if (t < T.emblemBurst + 0.45 || t >= gatherDone + 0.15) return { x: FINALE_EMBLEM.x, y: FINALE_EMBLEM.y, scale: FINALE_EMBLEM.scale, alpha: 0 };
  const appear = smooth01((t - (T.emblemBurst + 0.45)) / 0.45);
  if (t < T.emblemEnd) return { x: FINALE_EMBLEM.x, y: FINALE_EMBLEM.y, scale: FINALE_EMBLEM.scale, alpha: 0.9 * appear };
  const s = easeInCubic((t - T.emblemEnd) / (gatherDone - T.emblemEnd));
  return {
    x: lerp(FINALE_EMBLEM.x, PIECE_FORM.x, s),
    y: lerp(FINALE_EMBLEM.y, PIECE_FORM.y, s),
    scale: lerp(FINALE_EMBLEM.scale, PIECE_RADIUS * 0.62, s),
    alpha: 0.9 * (1 - smooth01((t - gatherDone) / 0.15)),
  };
}

/** One spark of the emblem burst: out to its place in the sign, a twinkling hold, then in to the piece. */
export function finaleEmblemSpark(target: EmblemTarget, i: number, t: number): FinaleSparkPoint | null {
  const T = FINALE_TIMES;
  const gatherDone = T.emblemEnd + 0.6 * (T.gatherEnd - T.emblemEnd);
  if (t < T.emblemBurst || t >= gatherDone) return null;
  const tx = FINALE_EMBLEM.x + target.x * FINALE_EMBLEM.scale;
  const ty = FINALE_EMBLEM.y + target.y * FINALE_EMBLEM.scale;
  if (t < T.emblemBurst + 0.8) {
    const s = (t - T.emblemBurst) / 0.8;
    const e = easeOutCubic(s);
    const curl = Math.sin(Math.PI * s) * 0.08 * (finaleHash(i, 31) - 0.5);
    const dx = tx - FINALE_EMBLEM.x;
    const dy = ty - FINALE_EMBLEM.y;
    return { x: FINALE_EMBLEM.x + dx * e - dy * curl, y: FINALE_EMBLEM.y + dy * e + dx * curl, alpha: 1 };
  }
  if (t < T.emblemEnd) return { x: tx, y: ty, alpha: 0.75 + 0.25 * Math.sin(t * 12 + i) };
  const s = easeInCubic((t - T.emblemEnd) / (gatherDone - T.emblemEnd));
  return { x: lerp(tx, PIECE_FORM.x, s), y: lerp(ty, PIECE_FORM.y, s), alpha: 1 };
}

// ------------------------------------------------------------------ the show

const BURST_SHAPE = {
  peony: { sparks: 40, radius: 3.4, gravity: 0.6, life: 1.8 },
  ring: { sparks: 30, radius: 3.9, gravity: 0.4, life: 1.6 },
  willow: { sparks: 26, radius: 3.0, gravity: 1.2, life: 2.6 },
} as const;

/** Seconds from launch to burst; in space a burst of starlight just appears. */
export function finaleBurstDelay(show: FinaleShow): number {
  return show === 'meteors' ? 0 : 0.9;
}

/** A rocket climbing to its burst (city space), or null. Space shows have none. */
export function finaleRocket(burst: FinaleBurst, showT: number, show: FinaleShow): { x: number; y: number } | null {
  const delay = finaleBurstDelay(show);
  if (delay === 0 || showT < burst.t || showT >= burst.t + delay) return null;
  const s = easeOutCubic((showT - burst.t) / delay);
  return { x: burst.x, y: lerp(0, burst.y, s) };
}

export interface FinaleSpark {
  x: number;
  y: number;
  /** Where it was a moment ago, for a short trail. */
  px: number;
  py: number;
  alpha: number;
  /** 0 = burst's first colour, 1 = its second. */
  mix: number;
}

function sparkAt(burst: FinaleBurst, b: number, i: number, age: number, scale: number, gravityOn: boolean): { x: number; y: number } {
  const shape = BURST_SHAPE[burst.kind];
  const jitter = burst.kind === 'ring' ? 0 : 0.55 * (finaleHash(i, b * 7 + 1) - 0.5);
  const angle = (Math.PI * 2 * i) / shape.sparks + jitter;
  const speed = burst.kind === 'ring' ? 1 : 0.55 + 0.45 * finaleHash(i, b * 7 + 2);
  const dist = shape.radius * speed * (1 - Math.exp(-3.2 * age)) * scale;
  const drop = gravityOn ? shape.gravity * age * age * scale : 0;
  return { x: burst.x + Math.cos(angle) * dist, y: burst.y + Math.sin(angle) * dist - drop };
}

/**
 * The sparks of burst number `b` (its index in the plan) `showT` seconds into the show. `scale`
 * shrinks the burst for stage-space shows.
 */
export function finaleBurstSparks(burst: FinaleBurst, b: number, showT: number, show: FinaleShow, scale = 1): FinaleSpark[] {
  const shape = BURST_SHAPE[burst.kind];
  const age = showT - burst.t - finaleBurstDelay(show);
  if (age < 0 || age >= shape.life) return [];
  const gravityOn = show !== 'meteors';
  const fade = 1 - (age / shape.life) * (age / shape.life);
  const mix = clamp((age / shape.life - 0.2) / 0.5, 0, 1);
  const out: FinaleSpark[] = [];
  for (let i = 0; i < shape.sparks; i++) {
    const p = sparkAt(burst, b, i, age, scale, gravityOn);
    const q = sparkAt(burst, b, i, Math.max(0, age - 0.16), scale, gravityOn);
    let alpha = fade;
    if (burst.kind === 'willow') alpha *= 0.65 + 0.35 * finaleHash(i, Math.floor(age * 20) + b * 101);
    out.push({ x: p.x, y: p.y, px: q.x, py: q.y, alpha, mix });
  }
  return out;
}

export interface FinaleBead {
  x: number;
  y: number;
  color: number;
}

const BEAD_COLORS = [0xa855f7, 0x22c55e, 0xeab308] as const;

/** Mardi Gras beads thrown up from the street (city space). */
export function finaleBeads(showT: number): FinaleBead[] {
  const out: FinaleBead[] = [];
  for (let j = 0; j < 54; j++) {
    const a = showT - j * 0.1;
    if (a < 0 || a > 2.4) continue;
    const x0 = 2 + 60 * finaleHash(j, 101);
    const vx = (finaleHash(j, 102) - 0.5) * 3;
    const vy = 7 + 2.5 * finaleHash(j, 103);
    const y = 0.2 + vy * a - 3.25 * a * a;
    if (y < -0.5) continue;
    out.push({ x: x0 + vx * a, y, color: BEAD_COLORS[j % 3] });
  }
  return out;
}

export interface FinaleBalloon {
  x: number;
  y: number;
  color: number;
  color2: number;
}

const BALLOONS = [
  { x: 9, color: 0xf43f5e, color2: 0xfde047 },
  { x: 21, color: 0x38bdf8, color2: 0xf8fafc },
  { x: 36, color: 0x22c55e, color2: 0xfbbf24 },
  { x: 49, color: 0xa855f7, color2: 0xf472b6 },
  { x: 61, color: 0xf97316, color2: 0x38bdf8 },
] as const;

/** Hot-air balloons rising over the city (city space); they keep drifting up after the show. */
export function finaleBalloons(showT: number): FinaleBalloon[] {
  const out: FinaleBalloon[] = [];
  BALLOONS.forEach((b, i) => {
    const a = showT - (0.15 + 0.55 * i);
    if (a < 0) return;
    out.push({ x: b.x + 0.35 * Math.sin(0.9 * a + i), y: -1.2 + 1.05 * a, color: b.color, color2: b.color2 });
  });
  return out;
}

export interface FinaleMeteor {
  x: number;
  y: number;
  tailX: number;
  tailY: number;
  alpha: number;
}

/** Shooting stars streaking across the sky (city space). */
export function finaleMeteors(showT: number): FinaleMeteor[] {
  const out: FinaleMeteor[] = [];
  const life = 0.75;
  for (let m = 0; m < 12; m++) {
    const a = showT - (0.42 * m + 0.3 * finaleHash(m, 201));
    if (a < 0 || a > life) continue;
    const x = 14 + 50 * finaleHash(m, 202) - 11 * a;
    const y = 8.2 + 3 * finaleHash(m, 203) - 4.6 * a;
    out.push({ x, y, tailX: x + 11 * 0.14, tailY: y + 4.6 * 0.14, alpha: Math.sin((Math.PI * a) / life) });
  }
  return out;
}

export interface FinaleHost {
  /** 0 hidden below the edge of the screen .. 1 fully up. */
  rise: number;
  /** Angle of the waving arm (radians). */
  wave: number;
}

const HOST_UP = 9.5;
const HOST_DOWN = 13.0;

/** The city's host pops up at the edge of the screen to wave and say thank you. */
export function finaleHost(t: number, reducedMotion: boolean): FinaleHost {
  const rise = smooth01((t - HOST_UP) / 0.5) * (1 - smooth01((t - HOST_DOWN) / 0.45));
  const wave = reducedMotion ? 0 : 0.5 * Math.sin(Math.PI * 2 * 1.6 * (t - HOST_UP));
  return { rise, wave };
}

/** When each line of text is on screen: [from, to) seconds. */
export const FINALE_TEXT = {
  bubble: [9.9, 12.9],
  city: [FINALE_TIMES.meet, FINALE_TIMES.molarEnd],
  molar: [FINALE_TIMES.slot, FINALE_TIMES.molarEnd],
  /** "2 more to the top" / "You made it to the top!", and the next city; gone before the dive. */
  climb: [FINALE_TIMES.climbHop, FINALE_TIMES.dive],
} as const;

/** How many cities are still to clean, and which comes next (campaign index, or -1). */
export function finaleClimbStatus(finishes: readonly MolarFinish[]): { left: number; next: number } {
  let left = 0;
  let next = -1;
  for (let i = 0; i < CAMPAIGN_PIECES; i++) {
    if ((finishes[i] ?? 'empty') === 'empty') {
      left++;
      if (next < 0) next = i;
    }
  }
  return { left, next };
}

export function finaleTextVisible(window: readonly [number, number], t: number): boolean {
  return t >= window[0] && t < window[1];
}

// ------------------------------------------------------------------ music

export type FinaleVoice = FinaleInstrument | 'bass' | 'kick' | 'whistle' | 'boom' | 'sparkle' | 'whoosh';

export interface FinaleNote {
  t: number;
  voice: FinaleVoice;
  midi: number;
  dur: number;
  vel: number;
  pan: number;
}

const PENTA = [0, 2, 4, 7, 9];

/** k-th note of the major pentatonic scale, in semitones above the tonic. */
function penta(k: number): number {
  return 12 * Math.floor(k / 5) + PENTA[((k % 5) + 5) % 5];
}

/** The city's party tune: 16 steps, null for a rest. Built on the city's tonic. */
const RIFF: readonly (number | null)[] = [0, null, 4, 7, 9, null, 7, 4, 7, null, 9, 12, 14, 12, 9, 7];
const STEP = 0.25;
const RIFF_START = 8.0;

function burstPan(x: number): number {
  return clamp((x - 32) / 40, -0.9, 0.9);
}

/** Every note of a city's finale, in time order. The same in both editions. */
export function finaleNotes(
  plan: CityFinalePlan,
  finishes: readonly MolarFinish[],
  slotIndex: number,
  reducedMotion: boolean
): FinaleNote[] {
  const T = FINALE_TIMES;
  const tonic = plan.tonic;
  const v = plan.voice;
  const finish = finishes[slotIndex] ?? 'pearl';
  const atTop = finaleClimbStatus(finishes).left === 0;
  const notes: FinaleNote[] = [];
  const add = (t: number, voice: FinaleVoice, midi: number, dur: number, vel: number, pan = 0): void => {
    notes.push({ t, voice, midi, dur, vel, pan });
  };

  // hush: a held chord as the game fades away
  add(0.05, 'pad', tonic - 12, 2.6, 0.32);
  add(0.05, 'pad', tonic - 5, 2.6, 0.22, -0.2);
  add(0.05, 'pad', tonic, 2.6, 0.2, 0.2);

  // rise
  if (!reducedMotion) add(T.hushEnd + 0.05, 'whoosh', tonic, 1.2, 0.5);
  for (let k = 0; k < 5; k++) add(T.hushEnd + 0.09 * k, 'bell', tonic + 12 + penta(k), 0.5, 0.42, -0.4 + 0.1 * k);

  // wave: one note per light-up step, climbing left to right with the probe
  for (let k = 0; k < 9; k++) {
    const t = T.riseEnd + 0.5 * k;
    const pan = reducedMotion ? 0 : -0.8 + (1.6 * k) / 8;
    add(t, v, tonic + penta(k), 0.6, 0.62, pan);
    if (k % 3 === 2) add(t, 'bell', tonic + 12 + penta(k), 0.5, 0.3, pan);
  }

  // blaze
  add(T.waveEnd, v, tonic, 1.6, 0.7, -0.2);
  add(T.waveEnd, v, tonic + 4, 1.6, 0.6);
  add(T.waveEnd, v, tonic + 7, 1.6, 0.6, 0.2);
  add(T.waveEnd, 'bell', tonic + 24, 1.4, 0.45);
  add(T.waveEnd, 'pad', tonic - 12, 2.0, 0.4);
  add(T.waveEnd, 'boom', tonic, 1.0, 0.6);

  // show: the city's party tune over a bouncing bass and a soft beat
  RIFF.forEach((step, i) => {
    if (step !== null) add(RIFF_START + i * STEP, v, tonic + 12 + step, 0.3, 0.5);
  });
  add(RIFF_START + RIFF.length * STEP, v, tonic + 12, 1.0, 0.55);
  add(RIFF_START + RIFF.length * STEP, 'bell', tonic + 24, 1.0, 0.35);
  for (let k = 0; k < 9; k++) {
    add(RIFF_START + k * 0.5, 'kick', tonic, 0.2, 0.32);
    add(RIFF_START + k * 0.5, 'bass', tonic - 24 + (k % 2 === 0 ? 0 : 7), 0.45, 0.5);
  }
  plan.bursts.forEach((burst) => {
    const at = T.blazeEnd + burst.t;
    const pan = burstPan(burst.x);
    if (plan.show === 'meteors') {
      add(at, 'bell', tonic + 12 + penta(Math.round(burst.y)), 0.9, 0.4, pan);
      add(at + 0.05, 'sparkle', tonic, 0.8, 0.35, pan);
    } else {
      add(at, 'whistle', tonic, 0.9, 0.32, pan);
      add(at + 0.9, 'boom', tonic, 1.2, 0.5, pan);
      add(at + 1.05, 'sparkle', tonic, 0.8, 0.3, pan);
    }
  });

  // the host says hello
  const hostPan = plan.hostSide === 'left' ? -0.6 : 0.6;
  add(HOST_UP + 0.1, 'kalimba', tonic + 19, 0.3, 0.5, hostPan);
  add(HOST_UP + 0.3, 'kalimba', tonic + 24, 0.5, 0.5, hostPan);

  // the emblem: rocket, burst, the sign glittering
  add(T.showEnd, 'whistle', tonic, 0.6, 0.35);
  add(T.emblemBurst, 'boom', tonic, 1.2, 0.6);
  for (let k = 0; k < 8; k++) add(T.emblemBurst + 0.05 + 0.07 * k, 'celesta', tonic + 24 + penta(k), 0.5, 0.38, -0.5 + k / 7);

  // gather, then a drum roll as the probe rises to meet the piece
  for (let k = 0; k < 7; k++) add(T.emblemEnd + 0.08 * k, 'bell', tonic + 36 - penta(k), 0.4, 0.3);
  add(T.emblemEnd + 0.8, 'sparkle', tonic, 0.8, 0.4);
  [17.0, 17.25, 17.5, 17.625, 17.75, 17.875].forEach((t, k) => add(t, 'kick', tonic, 0.18, 0.25 + 0.05 * k));

  // the fanfare: up to the tonic and hold
  const fan = [7, 9, 11, 12];
  fan.forEach((iv, k) => {
    const last = k === fan.length - 1;
    add(T.meet + 0.125 * k, v, tonic + iv, last ? 1.4 : 0.16, 0.8);
    add(T.meet + 0.125 * k, 'bell', tonic + 12 + iv, last ? 1.2 : 0.16, 0.4);
  });
  add(T.meet, 'boom', tonic, 1.0, 0.55);
  for (const iv of [0, 4, 7]) add(T.meet + 0.375, 'pad', tonic + iv, 2.2, 0.32);

  // the piece clicks into the molar
  add(T.slot, 'marimba', tonic + 12, 0.2, 0.7);
  add(T.slot + 0.05, 'bell', tonic + 19, 0.6, 0.5);
  if (finish === 'gold') {
    for (let k = 0; k < 8; k++) add(T.slot + 0.4 + 0.05 * k, 'celesta', tonic + 12 + penta(k), 0.4, 0.45);
    add(T.slot + 0.45, 'sparkle', tonic, 0.9, 0.45);
  } else if (finish === 'silver') {
    add(T.slot + 0.4, 'bell', tonic + 24, 0.6, 0.4);
    add(T.slot + 0.55, 'bell', tonic + 28, 0.6, 0.4);
  } else {
    add(T.slot + 0.4, 'bell', tonic + 24, 0.6, 0.38);
  }

  // the climb: the mountain rises, each ledge rings (cities already cleaned ring brightly)
  if (!reducedMotion) add(T.molarEnd + 0.05, 'whoosh', tonic, 0.9, 0.35);
  for (let k = 0; k < CAMPAIGN_PIECES; k++) {
    const earned = (finishes[k] ?? 'empty') !== 'empty' && k !== slotIndex;
    add(T.molarEnd + 0.25 + 0.125 * k, 'bell', tonic + 12 + penta(k), 0.45, earned ? 0.42 : 0.16, -0.5 + k * 0.25);
  }
  for (const iv of [0, 4, 7]) add(T.molarEnd + 0.25, 'pad', tonic - 12 + iv, 2.0, 0.22);
  // the hop up to the new ledge
  if (!reducedMotion) add(T.climbHop - 0.8, 'whoosh', tonic, 0.7, 0.3);
  add(T.climbHop - 0.5, v, tonic + 7, 0.3, 0.45);
  add(T.climbHop, 'kick', tonic, 0.2, 0.4);
  for (const iv of [7, 11, 14]) add(T.climbHop, v, tonic + iv, 0.9, 0.55);
  add(T.climbHop, 'bell', tonic + 19, 0.8, 0.4);

  if (atTop) {
    // the top: the whole climb resolves
    if (!reducedMotion) add(T.summitHop - 0.8, 'whoosh', tonic, 0.7, 0.35);
    add(T.summitHop, 'boom', tonic, 1.2, 0.6);
    [12, 16, 19, 24].forEach((iv, k) => add(T.summitHop + 0.1 * k, 'bell', tonic + iv, k === 3 ? 1.4 : 0.3, 0.5));
    for (const iv of [0, 4, 7, 12]) add(T.summitHop + 0.4, v, tonic + iv, 2.2, 0.6);
    add(T.summitHop + 0.4, 'pad', tonic - 12, 3.0, 0.4);
    add(T.summitHop + 0.5, 'sparkle', tonic, 0.9, 0.5);
  }

  // liftoff, on a chord that resolves only at the top; until then it hangs, not finished yet
  if (!reducedMotion) add(T.climbEnd + 0.05, 'whoosh', tonic, 1.0, 0.5);
  for (let k = 0; k < 6; k++) add(T.climbEnd + 0.1 + 0.07 * k, 'bell', tonic + 12 + penta(k), 0.5, 0.35);
  const lastChord = atTop ? [0, 4, 7, 11, 14] : [5, 7, 12, 14];
  for (const iv of lastChord) add(T.climbEnd, v, tonic + iv, 1.9, 0.5);
  add(T.climbEnd, 'pad', tonic - (atTop ? 12 : 5), 2.0, 0.35);

  return notes.sort((a, b) => a.t - b.t);
}

// ------------------------------------------------------------------ the ending

export interface EndingPiece {
  x: number;
  y: number;
  /** Size relative to the molar's cusps. */
  scale: number;
  spin: number;
  alpha: number;
  arrived: boolean;
}

/** How long the molar takes to fade out before, and back in after, each move with Reduce Motion. */
export const ENDING_MOLAR_SWAP = 0.6;

/**
 * Where the molar sits during each part of the ending (stage units) and how big it is. It glides
 * and shrinks up out of the way of the credits, then comes back for the last scene; with Reduce
 * Motion it never moves or grows: it fades out where it is just before each cut and fades back in
 * at its next spot just after.
 */
export function endingMolarPlace(t: number, reducedMotion = false): { x: number; y: number; scale: number; alpha: number } {
  const E = ENDING_TIMES;
  const big = { x: 0, y: 0.02, scale: GOLDEN_MOLAR.scale * 1.3 };
  const small = { x: 0, y: 0.66, scale: GOLDEN_MOLAR.scale * 0.5 };
  const alpha = smooth01((t - 0.4) / 0.6);
  if (reducedMotion) {
    const fadeOut = (cut: number): number => 1 - smooth01((t - (cut - ENDING_MOLAR_SWAP)) / ENDING_MOLAR_SWAP);
    const fadeIn = (cut: number): number => smooth01((t - cut) / ENDING_MOLAR_SWAP);
    if (t < E.creditsStart) return { ...big, alpha: alpha * fadeOut(E.creditsStart) };
    if (t < E.finaleStart) return { ...small, alpha: alpha * fadeIn(E.creditsStart) * fadeOut(E.finaleStart) };
    return { ...big, alpha: alpha * fadeIn(E.finaleStart) };
  }
  if (t < E.creditsStart - 0.6) return { ...big, alpha };
  if (t < E.creditsStart + 0.4) {
    const s = smooth01((t - (E.creditsStart - 0.6)) / 1.0);
    return { x: lerp(big.x, small.x, s), y: lerp(big.y, small.y, s), scale: lerp(big.scale, small.scale, s), alpha };
  }
  if (t < E.finaleStart) return { ...small, alpha };
  const s = smooth01((t - E.finaleStart) / 1.0);
  return { x: lerp(small.x, big.x, s), y: lerp(small.y, big.y, s), scale: lerp(small.scale, big.scale, s), alpha };
}

/** The five pieces flying in, one per city, during the ending's opening. */
export function endingPiece(i: number, t: number, reducedMotion: boolean): EndingPiece {
  const E = ENDING_TIMES;
  const place = endingMolarPlace(t, reducedMotion);
  const slot = finaleSlotPosition(i, place, place.scale);
  const start = E.firstPiece + i * E.pieceGap;
  const s = (t - start) / E.pieceFlight;
  if (s >= 1) return { x: slot.x, y: slot.y, scale: 1, spin: 0, alpha: 1, arrived: true };
  if (s < 0) return { x: slot.x, y: slot.y, scale: 1, spin: 0, alpha: 0, arrived: false };
  if (reducedMotion) return { x: slot.x, y: slot.y, scale: 1, spin: 0, alpha: smooth01(s), arrived: false };
  const angle = Math.PI / 2 + (Math.PI * 2 * i) / CAMPAIGN_PIECES;
  const e = easeOutCubic(s);
  return {
    x: lerp(Math.cos(angle) * 1.8, slot.x, e),
    y: lerp(Math.sin(angle) * 1.8, slot.y, e),
    scale: lerp(2.2, 1, e),
    spin: Math.PI * 4 * e,
    alpha: 1,
    arrived: false,
  };
}

/** Which city's credit is on screen and how visible it is; index -1 outside the credits. */
export function endingCredit(t: number): { index: number; alpha: number } {
  const E = ENDING_TIMES;
  const local = t - E.creditsStart;
  if (local < 0 || t >= E.finaleStart) return { index: -1, alpha: 0 };
  const index = Math.min(CAMPAIGN_PIECES - 1, Math.floor(local / E.creditSeconds));
  const within = local - index * E.creditSeconds;
  const alpha = smooth01(within / 0.6) * (1 - smooth01((within - (E.creditSeconds - 0.6)) / 0.6));
  return { index, alpha };
}

/** In the last scene each city's sign circles the finished molar. */
export function endingEmblemOrbit(i: number, t: number, reducedMotion: boolean): { x: number; y: number; alpha: number } {
  const E = ENDING_TIMES;
  const alpha = smooth01((t - E.finaleStart - 0.6) / 0.6);
  const spinT = reducedMotion ? 0 : t - E.finaleStart;
  const angle = Math.PI / 2 + (Math.PI * 2 * i) / CAMPAIGN_PIECES + 0.6 * spinT;
  return { x: Math.cos(angle) * 1.05, y: 0.05 + Math.sin(angle) * 0.82, alpha };
}

/** The molar smiles at everyone who finishes; gold in every city also earns the wink. */
export function endingFace(t: number, allGold: boolean): { alpha: number; wink: boolean } {
  const E = ENDING_TIMES;
  return { alpha: smooth01((t - E.face) / 0.5), wink: allGold && t >= E.wink && t < E.wink + 0.35 };
}

/** The ending's own fireworks, in stage space, round the finished molar. */
export const ENDING_BURSTS: readonly FinaleBurst[] = [
  { t: 0.3, x: -1.1, y: 0.55, kind: 'peony', color: 0xfde047, color2: 0xf97316 },
  { t: 0.9, x: 1.15, y: 0.7, kind: 'ring', color: 0x67e8f9, color2: 0xf8fafc },
  { t: 1.6, x: -0.7, y: 0.95, kind: 'willow', color: 0xfef3c7, color2: 0xf59e0b },
  { t: 2.3, x: 0.8, y: 1.0, kind: 'peony', color: 0xf472b6, color2: 0xfde047 },
  { t: 3.0, x: -1.25, y: 0.9, kind: 'ring', color: 0x4ade80, color2: 0xfde047 },
  { t: 3.7, x: 1.2, y: 0.4, kind: 'peony', color: 0xa78bfa, color2: 0xf8fafc },
  { t: 4.4, x: -0.4, y: 1.1, kind: 'ring', color: 0xfde047, color2: 0xf8fafc },
  { t: 5.0, x: 0.45, y: 1.15, kind: 'willow', color: 0xfef3c7, color2: 0xfbbf24 },
  { t: 5.6, x: -1.2, y: 0.35, kind: 'peony', color: 0xf87171, color2: 0xfde047 },
  { t: 6.2, x: 1.25, y: 0.9, kind: 'ring', color: 0x5eead4, color2: 0xfde047 },
];
/** Stage-space bursts are drawn this much smaller than city ones. */
export const ENDING_BURST_SCALE = 0.12;

export interface GoldDrop {
  x: number;
  y: number;
  alpha: number;
}

/** Glitter falling over the screen when every city is gold (stage space; x spread by `halfWidth`). */
export function endingGoldRain(t: number, halfWidth: number): GoldDrop[] {
  const start = ENDING_TIMES.face;
  if (t < start) return [];
  const out: GoldDrop[] = [];
  for (let k = 0; k < 60; k++) {
    const a = t - start - 0.05 * k;
    if (a < 0) continue;
    const fall = (a * (0.45 + 0.35 * finaleHash(k, 301))) % 2.6;
    out.push({
      x: (finaleHash(k, 302) * 2 - 1) * halfWidth + 0.05 * Math.sin(a * 3 + k),
      y: 1.3 - fall,
      alpha: 0.6 + 0.4 * Math.sin(a * 9 + k),
    });
  }
  return out;
}

/** The ending's notes. `plans` are the five cities in campaign order. */
export function endingNotes(plans: readonly CityFinalePlan[], allGold: boolean): FinaleNote[] {
  const E = ENDING_TIMES;
  const notes: FinaleNote[] = [];
  const add = (t: number, voice: FinaleVoice, midi: number, dur: number, vel: number, pan = 0): void => {
    notes.push({ t, voice, midi, dur, vel, pan });
  };
  const home = plans[0]?.tonic ?? 60;
  add(0.05, 'pad', home - 12, 3.0, 0.3);
  add(0.05, 'pad', home - 5, 3.0, 0.2);
  plans.forEach((plan, i) => {
    const at = E.firstPiece + i * E.pieceGap;
    add(at, 'whoosh', plan.tonic, 0.8, 0.3);
    add(at + E.pieceFlight, plan.voice, plan.tonic + 12, 0.5, 0.6);
    add(at + E.pieceFlight + 0.1, plan.voice, plan.tonic + 19, 0.7, 0.55);
  });
  // the molar snaps together
  add(E.snap, 'boom', home, 1.2, 0.65);
  [7, 9, 11, 12, 16, 19, 24].forEach((iv, k) => {
    const last = k === 6;
    add(E.snap + 0.13 * k, 'bell', home + 12 + iv, last ? 1.6 : 0.2, 0.5);
    add(E.snap + 0.13 * k, 'rhodes', home + iv, last ? 1.6 : 0.2, 0.6);
  });
  for (const iv of [0, 4, 7, 11]) add(E.snap + 0.9, 'pad', home + iv, 2.4, 0.3);
  // the credits: each city plays the start of its tune
  plans.forEach((plan, i) => {
    const at = E.creditsStart + i * E.creditSeconds;
    RIFF.forEach((step, k) => {
      if (step !== null) add(at + k * STEP, plan.voice, plan.tonic + 12 + step, 0.3, 0.45);
    });
    add(at + RIFF.length * STEP, plan.voice, plan.tonic + 12, 1.6, 0.45);
    add(at + RIFF.length * STEP, 'bell', plan.tonic + 24, 1.2, 0.3);
    for (let k = 0; k < 6; k++) add(at + k, 'bass', plan.tonic - 24 + (k % 2 === 0 ? 0 : 7), 0.8, 0.4);
  });
  // the last scene
  add(E.finaleStart, 'boom', home, 1.2, 0.55);
  for (const iv of [0, 4, 7, 12]) add(E.finaleStart + 0.1, 'rhodes', home + iv, 2.2, 0.5);
  ENDING_BURSTS.forEach((burst) => {
    const at = E.finaleStart + burst.t;
    add(at, 'whistle', home, 0.9, 0.28, clamp(burst.x / 1.4, -0.9, 0.9));
    add(at + 0.9, 'boom', home, 1.1, 0.45, clamp(burst.x / 1.4, -0.9, 0.9));
  });
  if (allGold) {
    for (let k = 0; k < 10; k++) add(E.face + 0.06 * k, 'celesta', home + 12 + penta(k), 0.5, 0.45);
    add(E.wink, 'sparkle', home, 0.9, 0.55);
    add(E.wink + 0.05, 'kalimba', home + 24, 0.4, 0.55);
    add(E.wink + 0.2, 'kalimba', home + 31, 0.6, 0.55);
  }
  for (const iv of [0, 4, 7, 11, 14]) add(E.end - 2.0, 'rhodes', home + iv, 1.9, 0.45);
  add(E.end - 2.0, 'pad', home - 12, 2.0, 0.35);
  return notes.sort((a, b) => a.t - b.t);
}

// ------------------------------------------------------------------ parity

function sumNotes(notes: readonly FinaleNote[]): number {
  let s = 0;
  for (const n of notes) s += n.t * 3 + n.midi * 0.7 + n.dur + n.vel * 5 + n.pan * 11 + n.voice.length;
  return s;
}

/** The finishes the checksum uses: every city up to `slotIndex` cleaned (gold, silver, pearl in turn). */
export function checksumFinishes(slotIndex: number): MolarFinish[] {
  const cycle: MolarFinish[] = ['gold', 'silver', 'pearl'];
  return Array.from({ length: CAMPAIGN_PIECES }, (_, i) => (i <= slotIndex ? cycle[i % 3] : 'empty'));
}

/**
 * One number that changes if any position, brightness or note of a city's finale changes. The
 * Swift edition computes the same (to a hundredth) from the same drawing.
 */
export function finaleChecksum(plan: CityFinalePlan, emblem: readonly SkylinePiece[], slotIndex: number, reducedMotion: boolean): number {
  let sum = 0;
  const layers: FinaleLayer[] = ['light', 'scenery', 'sky'];
  const targets = finaleEmblemTargets(emblem);
  // Cities up to this one cleaned (so the last one climbs to the top), the rest still to do.
  const finishes = checksumFinishes(slotIndex);
  const atTop = finaleClimbStatus(finishes).left === 0;
  for (let t = 0; t <= FINALE_TIMES.end; t += 0.37) {
    const probe = finaleProbe(t, reducedMotion, slotIndex, atTop);
    sum += probe.x * 1.1 + probe.y * 1.3 + probe.alpha;
    const piece = finalePiece(t, slotIndex, reducedMotion);
    sum += piece.x + piece.y * 1.7 + piece.scale + piece.spin * 0.1 + piece.glow + piece.alpha;
    const molar = finaleMolar(t, reducedMotion);
    sum += molar.alpha + molar.scale + molar.x * 0.7 + molar.y * 0.9;
    const mountain = finaleMountain(t, reducedMotion);
    sum += mountain.alpha + mountain.dy * 0.3;
    for (let i = -1; i <= CAMPAIGN_PIECES; i++) {
      const ledge = finaleLedge(i, t, reducedMotion);
      sum += ledge.x * 0.05 + ledge.y * 0.07;
    }
    const cam = finaleCamera(t, reducedMotion);
    sum += cam.cx * 0.01 + cam.viewW * 0.01;
    for (const cx of [-2, 10, 30, 50, 66]) {
      for (const layer of layers) {
        const tint = finaleCityTint(t, cx, layer, plan.show, reducedMotion);
        sum += tint.level + tint.flash;
      }
    }
    const showT = t - FINALE_TIMES.blazeEnd;
    plan.bursts.forEach((burst, b) => {
      const rocket = finaleRocket(burst, showT, plan.show);
      if (rocket) sum += rocket.y;
      for (const s of finaleBurstSparks(burst, b, showT, plan.show)) sum += s.x * 0.01 + s.y * 0.02 + s.alpha + s.mix;
    });
    for (const bead of finaleBeads(showT)) sum += bead.x * 0.01 + bead.y * 0.02;
    for (const balloon of finaleBalloons(showT)) sum += balloon.x * 0.01 + balloon.y * 0.02;
    for (const m of finaleMeteors(showT)) sum += m.x * 0.01 + m.y * 0.02 + m.alpha;
    const host = finaleHost(t, reducedMotion);
    sum += host.rise + host.wave;
    const rocket = finaleEmblemRocket(t);
    if (rocket) sum += rocket.y;
    const shape = finaleEmblemShape(t);
    sum += shape.x + shape.y * 1.3 + shape.scale + shape.alpha;
    targets.forEach((target, i) => {
      const spark = finaleEmblemSpark(target, i, t);
      if (spark) sum += spark.x + spark.y * 1.3 + spark.alpha;
    });
    sum += finaleSlotShine(t) + finaleBackdropDim(t);
  }
  for (const target of targets) sum += target.x * 0.5 + target.y * 0.25 + (target.color % 997) * 0.001;
  for (const finish of ['empty', 'pearl', 'silver', 'gold'] as const) {
    const withFinish = finishes.map((f, i) => (i === slotIndex ? finish : f));
    sum += sumNotes(finaleNotes(plan, withFinish, slotIndex, reducedMotion)) * 0.001;
  }
  const status = finaleClimbStatus(finishes);
  sum += status.left * 3 + status.next * 5;
  return Math.round(sum * 1000) / 1000;
}

/** The same for the ending. */
export function endingChecksum(plans: readonly CityFinalePlan[], allGold: boolean, reducedMotion: boolean): number {
  let sum = 0;
  for (let t = 0; t <= ENDING_TIMES.end; t += 0.41) {
    const place = endingMolarPlace(t, reducedMotion);
    sum += place.x + place.y * 1.3 + place.scale + place.alpha;
    for (let i = 0; i < CAMPAIGN_PIECES; i++) {
      const p = endingPiece(i, t, reducedMotion);
      sum += p.x + p.y * 1.7 + p.scale + p.spin * 0.1 + p.alpha + (p.arrived ? 1 : 0);
      const o = endingEmblemOrbit(i, t, reducedMotion);
      sum += o.x + o.y * 1.1 + o.alpha;
    }
    const credit = endingCredit(t);
    sum += credit.index + credit.alpha;
    const face = endingFace(t, allGold);
    sum += face.alpha + (face.wink ? 1 : 0);
    const showT = t - ENDING_TIMES.finaleStart;
    ENDING_BURSTS.forEach((burst, b) => {
      for (const s of finaleBurstSparks(burst, b, showT, 'fireworks', ENDING_BURST_SCALE)) sum += s.x + s.y * 2 + s.alpha;
    });
    for (const d of endingGoldRain(t, 1.6)) sum += d.x + d.y * 1.3 + d.alpha;
  }
  // the hug, finely, so every beat counts: arms out, the fold on the wink, the squeeze, the eyes, the hearts
  for (let t = ENDING_TIMES.face; t <= ENDING_TIMES.end; t += 0.1) {
    const hug = endingHug(t, reducedMotion);
    sum += hug.arms * 1.3 + hug.open * 1.7 + hug.fold * 1.9;
    sum += hug.squeeze * 2.3 + (hug.happyEyes ? 1 : 0) + hug.hearts * 2.9;
  }
  sum += sumNotes(endingNotes(plans, allGold)) * 0.001;
  return Math.round(sum * 1000) / 1000;
}
