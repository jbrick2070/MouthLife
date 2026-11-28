import { describe, expect, it } from 'vitest';
import { GlowPass } from '../src/engine/render/GlowPass';
import { PacerPropRig, flossContactTeeth, quadrantToothRange, sweep01 } from '../src/engine/render/PacerPropRig';

describe('Brush-Along 3D props follow the mirror convention', () => {
  it('sends the brush to the screen-right teeth for the patient-right quadrants', () => {
    // Tooth 0 is on screen-left, tooth 13 on screen-right; quadrants 0 and 3 are the patient's right.
    expect(quadrantToothRange(0)).toEqual({ from: 7, to: 13 });
    expect(quadrantToothRange(3)).toEqual({ from: 7, to: 13 });
    expect(quadrantToothRange(1)).toEqual({ from: 0, to: 6 });
    expect(quadrantToothRange(2)).toEqual({ from: 0, to: 6 });
  });

  it('walks floss contacts from the patient right to the left, one gap at a time', () => {
    expect(flossContactTeeth(0)).toEqual({ a: 12, b: 13 });
    expect(flossContactTeeth(6)).toEqual({ a: 6, b: 7 }); // the gap between the two front teeth
    expect(flossContactTeeth(12)).toEqual({ a: 0, b: 1 });
    expect(flossContactTeeth(99)).toEqual({ a: 0, b: 1 });
    expect(flossContactTeeth(-3)).toEqual({ a: 12, b: 13 });
  });

  it('sweeps smoothly there and back without jumping', () => {
    expect(sweep01(0, 8)).toBe(0);
    expect(sweep01(4, 8)).toBeCloseTo(1, 6);
    expect(sweep01(8, 8)).toBeCloseTo(0, 6);
    let prev = sweep01(0, 8);
    for (let t = 0.05; t <= 16; t += 0.05) {
      const v = sweep01(t, 8);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(Math.abs(v - prev)).toBeLessThan(0.03);
      prev = v;
    }
  });
});

describe('glow buffer stays small', () => {
  it('uses a quarter of the screen each way, and never more than 480 px wide', () => {
    expect(GlowPass.bufferSize(1280, 800)).toEqual({ w: 320, h: 200 });
    const big = GlowPass.bufferSize(3840, 2160);
    expect(big.w).toBe(480);
    expect(big.h).toBe(270);
    expect(GlowPass.bufferSize(40, 40)).toEqual({ w: 32, h: 32 });
  });
});

describe('the brush rig holds the camera still while paused or on a Start card', () => {
  const state = (paused: boolean) =>
    ({
      stage: 'brushing',
      quadrant: 0,
      surface: 0,
      flossIsUpper: true,
      flossContactIndex: 0,
      flossStepIndex: 0,
      mouthwashProgress01: 0,
      paused,
      phaseElapsedSec: 5,
      phaseDurationSec: 10,
    }) as const;

  it('its camera clock runs, stops while paused, and goes on from where it stopped', () => {
    const rig = new PacerPropRig();
    for (let i = 0; i < 30; i++) rig.update(1 / 60, state(false), []);
    const before = rig.cameraClockSec;
    expect(before).toBeCloseTo(0.5, 9);
    for (let i = 0; i < 90; i++) rig.update(1 / 60, state(true), []);
    expect(rig.cameraClockSec).toBe(before);
    rig.update(0.05, state(false), []);
    expect(rig.cameraClockSec).toBeCloseTo(before + 0.05, 9);
    rig.dispose();
  });
});
