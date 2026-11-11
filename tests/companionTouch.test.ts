import { describe, expect, it } from 'vitest';
import {
  CompanionArchSim,
  createInitialCompanionState,
  MINI_POLISH_SMOOTHNESS_PER_SPLAT,
} from '../src/engine/companion/CompanionArchSim';
import { CompanionTouchSystem, MAX_RIPPLES } from '../src/engine/companion/CompanionTouchSystem';

const ANCHORS = [
  { x: 30, y: 2, z: 22 },
  { x: 32, y: 2, z: 23 },
  { x: 34, y: 2, z: 22 },
  { x: 25, y: 2, z: 18 },
  { x: 39, y: 2, z: 18 },
];

describe('CompanionTouchSystem — touch-the-teeth Smooth Bask toy', () => {
  it('plays rising glass-harp notes on smooth teeth and a squishy thud on fuzzy teeth', () => {
    const touch = new CompanionTouchSystem();
    const down = touch.registerTouch({ x: 30, y: 2, z: 22 }, 'down', 1.0, 96);
    expect(down.sound).toBe('glass');
    expect(down.noteStep).toBe(0);
    expect(down.sparkle).toBe(true);

    const steps: number[] = [];
    let x = 30;
    let t = 1.0;
    for (let i = 0; i < 12; i++) {
      x += 0.2;
      t += 0.05;
      const fb = touch.registerTouch({ x, y: 2, z: 22 }, 'move', t, 96);
      if (fb.sound) steps.push(fb.noteStep);
    }
    expect(steps.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);

    // Pause > stroke reset → scale restarts; low smoothness → thud
    touch.endTouch();
    const fuzzy = touch.registerTouch({ x: 31, y: 2, z: 22 }, 'down', 5.0, 30);
    expect(fuzzy.sound).toBe('thud');
    expect(fuzzy.noteStep).toBe(0);
  });

  it('records specular ripples in a bounded ring buffer', () => {
    const touch = new CompanionTouchSystem();
    for (let i = 0; i < 9; i++) {
      touch.registerTouch({ x: 30 + i, y: 2, z: 22 }, 'down', i * 0.2, 90);
    }
    expect(touch.ripples.length).toBe(MAX_RIPPLES);
    expect(Math.max(...touch.ripples.map((r) => r.t))).toBeCloseTo(8 * 0.2);
  });

  it('Regional Treat splats sugar-plaque onto teeth that mini-polish strokes rub away', () => {
    const touch = new CompanionTouchSystem();
    const splats = touch.spawnTreatSplats(ANCHORS, 3, 1234);
    expect(splats.length).toBe(3);
    expect(touch.activeSplatCount).toBe(3);
    expect(new Set(splats.map((s) => `${s.x},${s.z}`)).size).toBe(3);

    // Splats pop in over ~0.35 s
    expect(touch.getRenderSplats()[0].amount).toBe(0);
    touch.step(0.4);
    expect(touch.getRenderSplats()[0].amount).toBeCloseTo(1, 5);

    // Rubbing on a splat sounds squishy until it's polished off
    const target = splats[0];
    let cleared = 0;
    let t = 0;
    const first = touch.registerTouch({ ...target }, 'down', t, 95);
    expect(first.onSplat).toBe(true);
    expect(first.sound).toBe('thud');
    for (let i = 0; i < 80 && cleared === 0; i++) {
      t += 0.04;
      const fb = touch.registerTouch({ x: target.x + Math.sin(i) * 0.6, y: target.y, z: target.z }, 'move', t, 95);
      cleared += fb.splatsCleared;
    }
    expect(cleared).toBe(1);
    expect(touch.activeSplatCount).toBe(2);
  });

  it('mini-polish restores a little smoothness but never touches shields (zero offline damage pillar)', () => {
    const state = createInitialCompanionState(0);
    state.smoothnessIndex = 40;
    state.enamelShield = 55;
    state.dentinShield = 100;
    state.pulpIntegrity = 100;
    const gained = CompanionArchSim.applyMiniPolish(state, 3, 1000);
    expect(gained).toBe(3 * MINI_POLISH_SMOOTHNESS_PER_SPLAT);
    expect(state.enamelShield).toBe(55);
    expect(CompanionArchSim.applyMiniPolish(state, 0)).toBe(0);

    state.smoothnessIndex = 99;
    CompanionArchSim.applyMiniPolish(state, 4);
    expect(state.smoothnessIndex).toBe(100);
  });
});
