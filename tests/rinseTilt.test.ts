import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deviceMotionSign,
  motionGravityG,
  motionUserAccelG,
  type GyroSloshSnapshot,
} from '../src/config/brushCoach';
import { BrushAlongOverlay } from '../src/ui/BrushAlongOverlay';

/**
 * W11: the mouthwash tilt gauge must lean the way the phone leans, on iPhone and on Android.
 *
 * The two families of browser sign their motion numbers opposite ways. Lying flat, screen up:
 *   - iPhone and iPad (WebKit) pass Apple's numbers on: gravity reads -9.8 on z, towards the ground;
 *   - the web standard, which Android browsers follow, reads +9.8 on z: the push holding the phone up.
 *
 * A browser is taken for one of Apple's by the maker it names (`navigator.vendor`), not by the
 * question it asks before sharing motion: Chrome has that question too since version 152.
 *
 * These tests feed made-up readings in both signings. No test here can see a real sensor: that
 * the phones really sign their numbers this way still has to be checked on one iPhone and one
 * Android phone.
 */

const G = 9.81;
/** The maker every browser on an iPhone or iPad names (they are all built on Apple's engine). */
const APPLE_VENDOR = 'Apple Computer, Inc.';
/** The maker Chrome and its relatives name, on Android too. Firefox names nobody (''). */
const GOOGLE_VENDOR = 'Google Inc.';

type Signing = 'webkit' | 'standard';
const vendorOf = (signing: Signing): string => (signing === 'webkit' ? APPLE_VENDOR : GOOGLE_VENDOR);

/**
 * One motion reading as each browser would report it. `down` is gravity in g, pointing at the
 * ground, along the phone's own axes (x towards its right edge, y towards its top); `push` is how
 * the hand is speeding the phone up, in m/s².
 */
function reading(signing: Signing, down: { x: number; y: number }, push = { x: 0, y: 0 }) {
  // Apple's numbers: gravity towards the ground, and a push counted against its direction.
  const apple = {
    acceleration: { x: -push.x, y: -push.y },
    includingGravity: { x: down.x * G - push.x, y: down.y * G - push.y },
  };
  if (signing === 'webkit') return apple;
  // The standard reports the reverse of all of it.
  return {
    acceleration: { x: push.x, y: push.y },
    includingGravity: { x: -apple.includingGravity.x, y: -apple.includingGravity.y },
  };
}

/** Gravity along the phone's axes when it is held upright and its right edge is lowered by `deg`. */
function rightEdgeLowered(deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: Math.sin(a), y: -Math.cos(a) };
}

describe('which way round a browser reports tilt', () => {
  it('takes Apple’s signing for a browser built on Apple’s engine, the standard’s for any other', () => {
    expect(deviceMotionSign(APPLE_VENDOR)).toBe(1);
    expect(deviceMotionSign(GOOGLE_VENDOR)).toBe(-1);
    expect(deviceMotionSign('')).toBe(-1);
    expect(deviceMotionSign(undefined)).toBe(-1);
    expect(deviceMotionSign(null)).toBe(-1);
  });

  it.each(['webkit', 'standard'] as const)('%s signing: a lowered right edge reads as gravity to the right', (signing) => {
    const sign = deviceMotionSign(vendorOf(signing));
    const down = rightEdgeLowered(25);
    const r = reading(signing, down);
    expect(motionGravityG(sign, r.includingGravity.x, r.acceleration.x)).toBeCloseTo(down.x, 6);
    expect(motionGravityG(sign, r.includingGravity.y, r.acceleration.y)).toBeCloseTo(down.y, 6);
    expect(motionGravityG(sign, r.includingGravity.x, r.acceleration.x)).toBeGreaterThan(0.4);

    const left = reading(signing, rightEdgeLowered(-25));
    expect(motionGravityG(sign, left.includingGravity.x, left.acceleration.x)).toBeLessThan(-0.4);
  });

  it.each(['webkit', 'standard'] as const)('%s signing: a push of the hand is kept out of gravity', (signing) => {
    const sign = deviceMotionSign(vendorOf(signing));
    // held upright and still, then shoved to the right at 2 m/s²
    const r = reading(signing, { x: 0, y: -1 }, { x: 2, y: 0 });
    expect(motionGravityG(sign, r.includingGravity.x, r.acceleration.x)).toBeCloseTo(0, 6);
    expect(motionGravityG(sign, r.includingGravity.y, r.acceleration.y)).toBeCloseTo(-1, 6);
    // Signed as Apple's: the rinse lags behind a shove to the right, so it leans left.
    expect(motionUserAccelG(sign, r.acceleration.x)).toBeCloseTo(-2 / G, 6);
    expect(motionUserAccelG(sign, r.acceleration.y)).toBeCloseTo(0, 6);
  });
});

/**
 * The brush screen itself, in its rinse step, with a stand-in page: tilt starts the way the game
 * starts it, and the readings go to whatever listener the screen registered for them.
 */
function rinseScreen(signing: Signing) {
  let nowMs = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
  let listener: ((e: DeviceMotionEvent) => void) | null = null;
  vi.stubGlobal('document', { documentElement: { classList: { contains: () => false } } });
  vi.stubGlobal('navigator', { vendor: vendorOf(signing) });
  vi.stubGlobal('window', {
    // Both kinds of browser have the question to ask before reading motion (Chrome since 152), so
    // it is on both here: it must not be what decides the signing.
    DeviceMotionEvent: { requestPermission: async () => 'granted' },
    addEventListener: (type: string, cb: (e: DeviceMotionEvent) => void) => {
      if (type === 'devicemotion') listener = cb;
    },
    removeEventListener: () => {},
  });
  const swishPans: number[] = [];
  const clock = { getPacerStage: () => 'mouthwashBonus', isPacerPaused: () => false };
  const callbacks = { onPlaySwish: (pan: number) => swishPans.push(pan) };
  const overlay = new (BrushAlongOverlay as unknown as new (...args: unknown[]) => object)({}, clock, {}, {}, callbacks);
  const inside = overlay as unknown as { bindMotion(): void; gyro: GyroSloshSnapshot };
  inside.bindMotion();

  /** Eases from upright to the tilt over one second, then holds it for two. */
  const tilt = (deg: number): GyroSloshSnapshot => {
    for (let i = 0; i < 180; i++) {
      const u = Math.min(1, i / 60);
      const r = reading(signing, rightEdgeLowered(deg * u));
      nowMs += 1000 / 60;
      listener?.({
        accelerationIncludingGravity: { x: r.includingGravity.x, y: r.includingGravity.y, z: 0 },
        acceleration: { x: r.acceleration.x, y: r.acceleration.y, z: 0 },
        rotationRate: { alpha: 0, beta: 0, gamma: u < 1 ? deg : 2 },
      } as unknown as DeviceMotionEvent);
    }
    return inside.gyro;
  };
  return { tilt, swishPans, isListening: () => listener !== null };
}

describe('the rinse gauge on the brush screen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['webkit', 'standard'] as const)('%s signing: lowering the right edge sends the rinse to the right cheek', (signing) => {
    const screen = rinseScreen(signing);
    expect(screen.isListening()).toBe(true);
    const gyro = screen.tilt(25);
    expect(gyro.isHandheld).toBe(true);
    expect(gyro.sloshPosition).toBeGreaterThan(0.18);
    expect(gyro.rightCheekCharge01).toBeGreaterThan(gyro.leftCheekCharge01);
    // the swish is heard on the right too
    expect(screen.swishPans.length).toBeGreaterThan(0);
    expect(screen.swishPans.every((pan) => pan > 0)).toBe(true);
  });

  it.each(['webkit', 'standard'] as const)('%s signing: lowering the left edge sends it to the left cheek', (signing) => {
    const screen = rinseScreen(signing);
    const gyro = screen.tilt(-25);
    expect(gyro.sloshPosition).toBeLessThan(-0.18);
    expect(gyro.leftCheekCharge01).toBeGreaterThan(gyro.rightCheekCharge01);
    expect(screen.swishPans.every((pan) => pan < 0)).toBe(true);
  });
});
