/**
 * The camera's numbers (`brushCamera.ts`). Twin: `native-apple/Tests/MouthLifeCoreTests/BrushCameraTests.swift`
 * runs the same cases on the app's `BrushCamera.swift`, so both editions put the camera in the same
 * place. Change both test files together with both camera files. Two cases are the browser's alone:
 * the idle frame (the app has none) and "starts every quadrant zoomed out" (kept from the earlier web
 * tests; the app checks the same numbers through the brushing targets at each listed second).
 */
import { describe, expect, it } from 'vitest';
import {
  advanceCameraClock,
  arrivalCamera,
  arrivalOrbitDrag,
  brushCameraTarget,
  brushContactLocal,
  brushOrbitDrag,
  easeBackOffset,
  flossArchIntro01,
  flossCloseYaw,
  flossContactLocal,
  flossGapFrac,
  flossGapMotion,
  followFactor,
  followRate,
  fovDeg,
  HUB_CENTER,
  HUB_REST_PITCH,
  HUB_REST_YAW,
  hubCamera,
  hubOrbitDrag,
  idleBrushCameraTarget,
  isPortrait,
  orbitPosition,
  quadrantIntro01,
  reportCamera,
  stageCamera,
  type BrushCameraTarget,
  type Vec3,
  type VecXZ,
} from '../src/engine/render/brushCamera';
import { evaluateBrushPhase, type PacerStage } from '../src/config/brushCoach';

const TOL = 1e-4;

function close(actual: number, expected: number, what = ''): void {
  expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(TOL);
}

function closeVec(actual: Vec3, expected: Vec3, what = ''): void {
  close(actual.x, expected.x, `${what} x`);
  close(actual.y, expected.y, `${what} y`);
  close(actual.z, expected.z, `${what} z`);
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const outward = (baseYaw: number): VecXZ => ({ x: Math.sin(baseYaw), z: Math.cos(baseYaw) });

function target(
  elapsedSec: number,
  stage: PacerStage = 'brushing',
  opts: {
    reducedMotion?: boolean;
    clockSec?: number;
    contact?: Vec3 | null;
    outward?: VecXZ | null;
    handheld?: number;
    slosh?: number;
  } = {}
): BrushCameraTarget {
  return brushCameraTarget({
    phase: evaluateBrushPhase(elapsedSec, stage, 60),
    reducedMotion: opts.reducedMotion ?? false,
    clockSec: opts.clockSec ?? 0,
    contactLocal: opts.contact ?? null,
    flossOutwardXZ: opts.outward ?? null,
    rinseHandheld01: opts.handheld ?? 0,
    rinseSlosh: opts.slosh ?? 0,
  });
}

describe('intro envelopes', () => {
  it('opens each quadrant zoomed out, holds, then eases in', () => {
    close(quadrantIntro01(0, 0.0, false), 1);
    close(quadrantIntro01(0, 1.05, false), 1);
    close(quadrantIntro01(0, 1.475, false), 0.84375);
    close(quadrantIntro01(0, 1.9, false), 0.5);
    close(quadrantIntro01(0, 2.325, false), 0.15625);
    close(quadrantIntro01(0, 2.75, false), 0);
    // only the outside step opens zoomed out, and never under Reduce Motion
    expect(quadrantIntro01(1, 0.2, false)).toBe(0);
    expect(quadrantIntro01(2, 0.2, false)).toBe(0);
    expect(quadrantIntro01(0, 0.2, true)).toBe(0);
    // kept from the earlier web tests
    expect(quadrantIntro01(0, 0.9, false)).toBe(1);
    expect(quadrantIntro01(0, 3.0, false)).toBe(0);
  });

  it('opens each floss arch zoomed out, holds, then eases in', () => {
    close(flossArchIntro01(0.55, false), 1);
    close(flossArchIntro01(0.85, false), 0.84375);
    close(flossArchIntro01(1.15, false), 0.5);
    close(flossArchIntro01(1.75, false), 0);
    expect(flossArchIntro01(0.2, true)).toBe(0);
    expect(flossArchIntro01(0.2, false)).toBe(1);
    expect(flossArchIntro01(2.2, false)).toBe(0);
  });
});

describe('brushing, moment by moment', () => {
  it('aims at every listed second', () => {
    // [session second, yaw, pitch, portrait distance, landscape distance, zoom-out]
    const rows: Array<[number, number, number, number, number, number]> = [
      [0.0, 0.22, -0.04, 29.8, 22.4, 1], // Q0 outside, zoomed out
      [1.9, 0.4544, -0.095, 24.7, 18.6, 0.5], // Q0 outside, half way in
      [5.0, 0.54, -0.15, 19.6, 14.8, 0], // Q0 outside
      [15.0, 0.26, -0.72, 19.0, 14.2, 0], // Q0 chewing tops
      [25.0, -0.31, -0.58, 19.4, 14.6, 0], // Q0 inside
      [30.0, -0.22, -0.04, 29.8, 22.4, 1], // Q1 outside, zoomed out
      [35.0, -0.54, -0.15, 19.6, 14.8, 0],
      [45.0, -0.26, -0.72, 19.0, 14.2, 0],
      [55.0, 0.31, -0.58, 19.4, 14.6, 0],
      [60.0, -0.22, 0.08, 29.8, 22.4, 1], // Q2 outside, zoomed out
      [65.0, -0.54, 0.22, 19.6, 14.8, 0],
      [75.0, -0.26, 0.76, 19.0, 14.2, 0],
      [85.0, 0.31, 0.62, 19.4, 14.6, 0],
      [90.0, 0.22, 0.08, 29.8, 22.4, 1], // Q3 outside, zoomed out
      [95.0, 0.54, 0.22, 19.6, 14.8, 0],
      [105.0, 0.26, 0.76, 19.0, 14.2, 0],
      [115.0, -0.31, 0.62, 19.4, 14.6, 0],
      [10.0, 0.16, -0.72, 19.0, 14.2, 0], // Q0 chewing starts
      [19.999, 0.3598, -0.72, 19.0, 14.2, 0], // Q0 chewing ends
      [20.0, -0.48, -0.58, 19.4, 14.6, 0], // Q0 inside starts
      [9.999, 0.3005, -0.15, 19.6, 14.8, 0], // Q0 outside ends
      [120.0, -0.1403, 0.62, 19.4, 14.6, 0], // held at 2:00 (floss Start card)
    ];
    for (const [sec, yaw, pitch, distP, distL, intro] of rows) {
      const t = target(sec);
      close(t.yaw, yaw, `yaw at ${sec}`);
      close(t.pitch, pitch, `pitch at ${sec}`);
      close(t.distPortrait, distP, `portrait distance at ${sec}`);
      close(t.distLandscape, distL, `landscape distance at ${sec}`);
      close(t.intro01, intro, `zoom-out at ${sec}`);
    }
  });

  it('looks at the wide point zoomed out, and leans to the contact close up', () => {
    const contact = v(5, 1.6, 4);
    // zoomed out, the look is the wide point on the active side, whatever the contact
    closeVec(target(0.0, 'brushing', { contact }).lookLocal, v(1.35, 0.25, 0.8));
    closeVec(target(60.0, 'brushing', { contact }).lookLocal, v(-1.35, 3.05, 0.8));
    // close up: 62% of the way from the arch's middle to the contact
    closeVec(target(5.0, 'brushing', { contact }).lookLocal, v(3.1, 1.714, 2.822));
    closeVec(target(65.0, 'brushing', { contact }).lookLocal, v(3.1, 1.486, 2.822));
    // no contact: the arch's middle
    closeVec(target(5.0).lookLocal, v(0, 1.9, 0.9));
  });

  it('shows the opposite jaw only on the outside step', () => {
    const wide = target(0.0);
    expect(wide.upperJaw.visible).toBe(true);
    closeVec(wide.upperJaw.offset, v(0, 0, 0));
    expect(wide.lowerJaw.visible).toBe(true);
    closeVec(wide.lowerJaw.offset, v(0, -3.8, -0.45));
    close(wide.lowerJaw.opacity, 0.86);
    const near = target(5.0);
    closeVec(near.lowerJaw.offset, v(0, -3.8, -0.7));
    close(near.lowerJaw.opacity, 0.38);
    expect(target(15.0).lowerJaw.visible).toBe(false);
    expect(target(25.0).lowerJaw.visible).toBe(false);
    // lower quadrants: the upper jaw swings up out of the way
    const lower = target(65.0);
    expect(lower.lowerJaw.visible).toBe(true);
    closeVec(lower.upperJaw.offset, v(0, 3.8, -0.7));
    expect(target(75.0).upperJaw.visible).toBe(false);
  });

  it('starts every quadrant zoomed out on both jaws, then comes in close (kept from the earlier web tests)', () => {
    for (const q of [0, 1, 2, 3]) {
      const start = target(q * 30 + 0.2);
      const near = target(q * 30 + 4.0);
      expect(start.distPortrait).toBeGreaterThan(near.distPortrait + 8);
      expect(start.distLandscape).toBeGreaterThan(near.distLandscape + 6);
      expect(start.upperJaw.visible && start.lowerJaw.visible).toBe(true);
      expect(start.intro01).toBe(1);
      expect(near.intro01).toBe(0);
    }
    // steep signed pitches on the chewing tops and inside, opposite jaw hidden
    expect(target(15).pitch).toBeLessThan(-0.6);
    expect(target(105).pitch).toBeGreaterThan(0.6);
    expect(target(55).pitch).toBeLessThan(-0.5);
    expect(target(85).pitch).toBeGreaterThan(0.5);
  });
});

describe('floss', () => {
  it('turns at each gap about 24 degrees off the teeth', () => {
    close(flossCloseYaw(12, outward(1.605)), 0.92);
    close(flossCloseYaw(9, outward(0.6854)), 0.2654);
    close(flossCloseYaw(7, outward(0.2325)), -0.1875);
    close(flossCloseYaw(6, outward(1.0)), 0.38);
    close(flossCloseYaw(5, outward(-0.2325)), 0.1875);
    close(flossCloseYaw(0, outward(-1.605)), -0.92);
  });

  it('aims through both arches', () => {
    // upper arch opens zoomed out
    const start = target(120.0, 'flossBonus', { outward: outward(1.605) });
    close(start.yaw, 0.18);
    close(start.pitch, -0.06);
    close(start.distPortrait, 27.0);
    close(start.distLandscape, 20.6);
    close(start.intro01, 1);
    closeVec(start.lookLocal, v(1.1, 1.8, 0.9));
    // half way in on the first gap
    const half = target(121.15, 'flossBonus', { outward: outward(1.605) });
    close(half.yaw, 0.55);
    close(half.pitch, -0.16);
    close(half.distPortrait, 23.0);
    close(half.distLandscape, 17.5);
    close(half.intro01, 0.5);
    // gap 7|8 (the sixth stop)
    const mid = target(130.0, 'flossBonus', { outward: outward(0.2325) });
    close(mid.yaw, -0.1875);
    close(mid.pitch, -0.26);
    close(mid.distPortrait, 19.0);
    close(mid.distLandscape, 14.4);
    close(mid.intro01, 0);
    // the lower arch opens zoomed out again
    const lowerStart = target(142.5, 'flossBonus', { outward: outward(1.605) });
    close(lowerStart.yaw, 0.18);
    close(lowerStart.pitch, 0.1);
    close(lowerStart.distPortrait, 27.0);
    close(lowerStart.distLandscape, 20.6);
    close(lowerStart.intro01, 1);
    closeVec(lowerStart.lookLocal, v(1.1, 1.4, 0.9));
    // held at the end of floss (rinse Start card): the last gap, lower left
    const held = target(165.0, 'flossBonus', { outward: outward(-1.605) });
    close(held.yaw, -0.92);
    close(held.pitch, 0.3);
    close(held.distPortrait, 19.0);
    close(held.distLandscape, 14.4);
  });

  it('leans the look 68% of the way to the floss', () => {
    const contact = v(2, 2.5, 5);
    closeVec(target(130.0, 'flossBonus', { contact, outward: outward(0.2325) }).lookLocal, v(1.36, 2.292, 3.72));
    closeVec(target(150.0, 'flossBonus', { contact, outward: outward(0.2325) }).lookLocal, v(1.36, 2.132, 3.72));
  });

  it('opens the opposite jaw only while zoomed out', () => {
    const start = target(120.0, 'flossBonus');
    expect(start.lowerJaw.visible).toBe(true);
    closeVec(start.lowerJaw.offset, v(0, -3.8, -0.6));
    close(start.lowerJaw.opacity, 0.74);
    expect(target(130.0, 'flossBonus').lowerJaw.visible).toBe(false);
    expect(target(150.0, 'flossBonus').lowerJaw.visible).toBe(true);
    expect(target(150.0, 'flossBonus').upperJaw.visible).toBe(false);
    // kept from the earlier web tests: zoomed out well back from the close-up
    expect(target(120.2, 'flossBonus').distPortrait).toBeGreaterThan(target(123.0, 'flossBonus').distPortrait + 6);
  });

  it('moves through a gap in three parts, and the camera follows the same point as the app', () => {
    close(flossGapFrac(evaluateBrushPhase(130.0, 'flossBonus')), 0.77778);
    const slide = flossGapMotion(0.0375, 0.7, false);
    close(slide.depthIntoGap, -0.83918);
    close(slide.leanSide, 0);
    close(slide.sawZ, 0.15);
    expect(flossGapMotion(0.0375, 0.7, true).sawZ).toBe(0);
    const right = flossGapMotion(0.475, 0.7, false);
    close(right.depthIntoGap, 0.266);
    close(right.leanSide, 1);
    const left = flossGapMotion(0.776, 0.7, false);
    close(left.depthIntoGap, 0.266);
    close(left.leanSide, -1);
    const lift = flossGapMotion(0.951, 0.7, false);
    close(lift.depthIntoGap, -0.415);
    close(lift.leanSide, -0.5);
    close(lift.sawZ, 0);

    const motion = { depthIntoGap: 0.266, leanSide: 1, sawZ: 0.15 };
    const mid = v(1, 2, 3);
    const out = { x: 0.6, z: 0.8 };
    const along = { x: 0.8, z: -0.6 };
    closeVec(flossContactLocal(mid, out, along, true, motion), v(1.21, 2.266, 3.03));
    closeVec(flossContactLocal(mid, out, along, false, motion), v(1.21, 1.734, 3.03));
  });
});

describe('the contact the close-up follows while brushing', () => {
  const center = v(1, 2, 3);
  const out = { x: 0.6, z: 0.8 };
  const contact = (surface: number, upper = true, dist = 1, clock = 0, rm = false): Vec3 =>
    brushContactLocal(center, out, 0.5, 0.7, surface, upper, dist, clock, rm);

  it('sits on each surface as the app has it', () => {
    closeVec(contact(0), v(1.294, 2.346, 3.392));
    closeVec(contact(0, false), v(1.294, 1.814, 3.392));
    closeVec(contact(1), v(1, 1.286, 3));
    closeVec(contact(2, true, 5), v(0.712, 2.276, 2.616));
    // the scrub, a quarter turn in: along the arch, no lift
    closeVec(contact(0, true, 1, Math.PI / 18), v(1.502, 2.266, 3.236));
    // no scrub under Reduce Motion
    closeVec(contact(0, true, 1, Math.PI / 18, true), v(1.294, 2.266, 3.392));
  });
});

describe('rinse', () => {
  it('sways slowly, and a held phone swings it toward the rinse', () => {
    const still = target(170, 'mouthwashBonus');
    close(still.yaw, 0);
    close(still.pitch, 0.04);
    close(still.distPortrait, 21.4);
    close(still.distLandscape, 16.0);
    closeVec(still.lookLocal, v(0, 1.85, 1.1));
    close(target(200, 'mouthwashBonus', { clockSec: 3.0208 }).yaw, 0.16);
    close(target(200, 'mouthwashBonus', { clockSec: 3.0208, handheld: 1, slosh: 1 }).yaw, 0.156);
    close(target(220, 'mouthwashBonus', { clockSec: 0, handheld: 1, slosh: -1 }).yaw, -0.1);
    close(target(220, 'mouthwashBonus', { clockSec: 0, handheld: 0.5, slosh: 1 }).yaw, 0.05);
    // both jaws open a little
    closeVec(still.upperJaw.offset, v(0, 1.05, 0));
    closeVec(still.lowerJaw.offset, v(0, -0.55, 0));
    expect(still.upperJaw.visible && still.lowerJaw.visible).toBe(true);
    // Reduce Motion: no sway and no tilt
    expect(target(200, 'mouthwashBonus', { reducedMotion: true, clockSec: 3.0208 }).yaw).toBe(0);
    expect(target(200, 'mouthwashBonus', { reducedMotion: true, clockSec: 3.0208, handheld: 1, slosh: 1 }).yaw).toBe(0);
    expect(target(220, 'mouthwashBonus', { reducedMotion: true, handheld: 1, slosh: -1 }).yaw).toBe(0);
    // the three swish steps share one camera
    expect(target(190, 'mouthwashBonus', { clockSec: 2 })).toEqual(target(170, 'mouthwashBonus', { clockSec: 2 }));
    expect(target(210, 'mouthwashBonus', { clockSec: 2 })).toEqual(target(170, 'mouthwashBonus', { clockSec: 2 }));
  });
});

describe('Reduce Motion: straight on, never flying', () => {
  it('keeps brushing and floss straight on, further back, leaning a little to the contact', () => {
    const contact = v(5, 1.6, 4);
    const upper = target(5.0, 'brushing', { reducedMotion: true, contact });
    expect(upper.yaw).toBe(0);
    close(upper.pitch, -0.1);
    close(upper.distPortrait, 22.8);
    close(upper.distLandscape, 16.8);
    expect(upper.intro01).toBe(0);
    // a quarter of the way to the contact
    closeVec(upper.lookLocal, v(1.25, 1.825, 1.675));
    const lower = target(65.0, 'brushing', { reducedMotion: true, contact });
    expect(lower.yaw).toBe(0);
    close(lower.pitch, 0.2);
    // no zoom-out as a quadrant starts, and the opposite jaw stays dimmed
    const opening = target(0.0, 'brushing', { reducedMotion: true });
    expect(opening.yaw).toBe(0);
    close(opening.distPortrait, 22.8);
    close(opening.lowerJaw.opacity, 0.38);
    // every step looks the same way
    for (let sec = 0; sec < 120; sec += 2.5) {
      expect(target(sec, 'brushing', { reducedMotion: true }).yaw, `yaw at ${sec}`).toBe(0);
    }
    // floss: straight on, 28% of the way to the floss
    const floss = target(130.0, 'flossBonus', { reducedMotion: true, contact: v(2, 2.5, 5), outward: outward(0.2325) });
    expect(floss.yaw).toBe(0);
    close(floss.pitch, -0.14);
    close(floss.distPortrait, 22.0);
    close(floss.distLandscape, 16.0);
    closeVec(floss.lookLocal, v(0.56, 2.032, 2.12));
    close(target(150.0, 'flossBonus', { reducedMotion: true }).pitch, 0.18);
    expect(target(120.0, 'flossBonus', { reducedMotion: true }).intro01).toBe(0);
    // and a slow follow
    expect(followRate(true, true)).toBe(2.4);
  });
});

describe('Pause and a Start card: the picture stands still', () => {
  it('holds the look point while the clock is held', () => {
    const center = v(4, 1.5, 2);
    const out = { x: 0.6, z: 0.8 };
    const look = (clock: number, elapsed: number): Vec3 => {
      const contact = brushContactLocal(center, out, 0.5, 0.7, 0, true, 2, clock, false);
      return target(elapsed, 'brushing', { clockSec: clock, contact }).lookLocal;
    };
    // paused at 0:05 (or held at 2:00 on the floss Start card): the session clock stops and so does
    // the camera's, while frames keep coming
    let clock = 7.3;
    const before = look(clock, 5.0);
    for (let i = 0; i < 90; i++) {
      clock = advanceCameraClock(clock, 1 / 60, true);
      closeVec(look(clock, 5.0), before);
    }
    expect(clock).toBe(7.3);
    // running, the scrub moves the look point
    const running = advanceCameraClock(clock, 0.05, false);
    expect(Math.abs(running - 7.35)).toBeLessThan(1e-12);
    const after = look(running, 5.0);
    expect(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z)).toBeGreaterThan(1e-3);
    // the rinse's sway follows the same clock: held, it holds; running, it sways
    expect(target(200, 'mouthwashBonus', { clockSec: clock }).yaw).not.toBe(
      target(200, 'mouthwashBonus', { clockSec: clock + 0.5 }).yaw
    );
  });
});

describe("the bathroom mirror: the patient's right is screen-right", () => {
  it('for every quadrant and for floss', () => {
    // quadrants 0 (upper right) and 3 (lower right) are the patient's right: positive yaw and a look
    // point on +X; 1 and 2 are the left
    for (const q of [0, 1, 2, 3]) {
      const right = q === 0 || q === 3;
      const start = q * 30;
      const wide = target(start);
      expect(wide.yaw > 0, `zoomed-out yaw, quadrant ${q}`).toBe(right);
      expect(wide.lookLocal.x > 0, `zoomed-out look, quadrant ${q}`).toBe(right);
      expect(target(start + 5).yaw > 0, `outside, quadrant ${q}`).toBe(right);
      expect(target(start + 15).yaw > 0, `chewing tops, quadrant ${q}`).toBe(right);
      // the inside is seen from across the mouth
      expect(target(start + 25).yaw < 0, `inside, quadrant ${q}`).toBe(right);
    }
    // floss starts on the patient's right of each arch and ends on the left
    for (const archStart of [120.0, 142.5]) {
      const opening = target(archStart, 'flossBonus');
      expect(opening.yaw).toBeGreaterThan(0);
      expect(opening.lookLocal.x).toBeGreaterThan(0);
    }
    expect(flossCloseYaw(12, outward(1.605))).toBeGreaterThan(0);
    expect(flossCloseYaw(0, outward(-1.605))).toBeLessThan(0);
    expect(target(165.0, 'flossBonus', { outward: outward(-1.605) }).yaw).toBeLessThan(0);
    // the rinse swings toward the cheek the rinse went to: right cheek, screen-right
    expect(target(170, 'mouthwashBonus', { handheld: 1, slosh: 1 }).yaw).toBeGreaterThan(0);
  });
});

describe('the picture and the rig', () => {
  it('widens the field of view for a portrait picture', () => {
    close(fovDeg(0.4), 64.5);
    close(fovDeg(0.4615), 63.871);
    close(fovDeg(0.5), 62.1);
    close(fovDeg(0.75), 50.6);
    close(fovDeg(0.9), 46.0);
    close(fovDeg(1.6), 46.0);
    expect(isPortrait(0.849)).toBe(true);
    expect(isPortrait(0.85)).toBe(false);
  });

  it('orbits, eases back and follows', () => {
    closeVec(orbitPosition(v(0, 0, 0), 0.5, -0.15, 20), v(9.4808, -2.9888, 17.3546));
    close(easeBackOffset(0.85, 0.5), 0.28294);
    close(easeBackOffset(0.85, 1.0), 0.09418);
    close(followFactor(6.8, 1 / 60), 0.10715);
    expect(followRate(true, false)).toBe(6.8);
    expect(followRate(false, false)).toBe(7.5);
    expect(followRate(false, true)).toBe(7.5);
  });

  it('keeps a finger within its limits', () => {
    const far = brushOrbitDrag(0, 0, -1000, 1000);
    close(far.yaw, 0.85);
    close(far.pitch, 0.45);
    const near = brushOrbitDrag(0, 0, 100, -100);
    close(near.yaw, -0.55);
    close(near.pitch, -0.35);
    const hubFar = hubOrbitDrag(0, 0.34, -1000, 1000);
    close(hubFar.yaw, 0.85);
    close(hubFar.pitch, 0.82);
    const hubLow = hubOrbitDrag(0, 0.34, 1000, -1000);
    close(hubLow.yaw, -0.85);
    close(hubLow.pitch, 0.18);
    const hubStep = hubOrbitDrag(0, 0.34, 20, 20);
    close(hubStep.yaw, -0.11);
    close(hubStep.pitch, 0.41);
    close(arrivalOrbitDrag(0, -1000), 0.75);
    close(arrivalOrbitDrag(0, 100), -0.5);
  });
});

describe('the other screens', () => {
  it('frames Home', () => {
    const portrait = hubCamera(HUB_REST_YAW, HUB_REST_PITCH, true);
    closeVec(portrait.pos, v(32, 13.5723, 50.0106));
    closeVec(portrait.look, v(32, 3.2, 14.6));
    const landscape = hubCamera(0, 0.34, false);
    closeVec(landscape.pos, v(32, 8.7367, 36.3406));
    closeVec(landscape.look, v(32, 2.3, 14.6));
    // a held phone's tilt turns it a little
    closeVec(hubCamera(0, 0.34, false, 1, 1).pos, orbitPosition(HUB_CENTER, 0.085, 0.292, 22));
    // the web's own fit backs off along the same line
    closeVec(hubCamera(0, 0.34, false, 0, 0, 1.5).pos, orbitPosition(HUB_CENTER, 0, 0.34, 33));
  });

  it('frames each arrival beat', () => {
    const rows: Array<[number, boolean, Vec3, Vec3]> = [
      [0, true, v(32, 143.8, 36), v(32, 141.8, 16)],
      [0, false, v(32, 148.4, 31.5), v(32, 146.2, 16)],
      [1, true, v(32, 141.6, 39.7), v(32, 139.6, 18.2)],
      [1, false, v(32, 145.4, 33.2), v(32, 143.2, 18.2)],
      [2, true, v(32, 144.4, 33.5), v(32, 142.6, 16)],
      [2, false, v(32, 148.2, 29.5), v(32, 146.5, 16)],
      [3, true, v(32, 98.5, 90), v(32, 91.5, 16)],
      [3, false, v(32, 109, 64), v(32, 103.5, 16)],
    ];
    for (const [beat, portrait, pos, look] of rows) {
      const pose = arrivalCamera(beat, 0, portrait);
      closeVec(pose.pos, pos, `beat ${beat} ${portrait ? 'portrait' : 'landscape'} pos`);
      closeVec(pose.look, look, `beat ${beat} ${portrait ? 'portrait' : 'landscape'} look`);
    }
    // the hardness line-up only slides sideways when turned
    closeVec(arrivalCamera(1, 0.5, true).pos, v(36.6384, 141.6, 37.068));
  });

  it('frames a city stage and circles it on the score screen', () => {
    const upright = stageCamera(10, 12, true);
    closeVec(upright.pos, v(10, 24, 28));
    closeVec(upright.look, v(10, 0.6, 11));
    const sideways = stageCamera(10, 12, false);
    closeVec(sideways.pos, v(10, 18, 24.2));
    closeVec(sideways.look, v(10, 0.6, 11));

    const report = reportCamera(64, 32, 0, false);
    closeVec(report.pos, v(32, 24, 38));
    closeVec(report.look, v(32, 0.5, 16));
    closeVec(reportCamera(64, 32, 10, false).pos, v(49.7869, 24, 3.053));
    // Reduce Motion holds one angle
    const still = v(36.3707, 24, 37.5615);
    closeVec(reportCamera(64, 32, 0, true).pos, still);
    closeVec(reportCamera(64, 32, 99, true).pos, still);
    // the web's own fit backs off keeping the angle
    closeVec(reportCamera(64, 32, 0, false, 2).pos, v(32, 47.5, 60));
  });
});

describe('browser only (no Swift twin)', () => {
  it('keeps its idle frame before any stage runs', () => {
    const idle = idleBrushCameraTarget(4.0);
    expect(idle.yaw).toBe(0);
    close(idle.pitch, 0.12);
    close(idle.distPortrait, 26.5);
    close(idle.distLandscape, 19.5);
    expect(idle.upperJaw.visible && idle.lowerJaw.visible).toBe(true);
    close(idle.upperJaw.offset.y, 2.08);
    close(idle.lowerJaw.offset.y, -1.92);
  });
});
