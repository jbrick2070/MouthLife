import { describe, expect, it } from 'vitest';
import { ClockController, FIXED_DT } from '../src/engine/ClockController';
import { EventBus } from '../src/engine/EventBus';
import { SaveSystem } from '../src/engine/persistence/SaveSystem';
import { WorldSession, type SessionInputCommand } from '../src/engine/sim/WorldSession';
import { plaqueCityCartridge } from '../src/worlds/plaqueCityCartridge';

const MOVE_RIGHT: SessionInputCommand = {
  moveX: 1,
  moveZ: 0,
  scrubHeld: false,
  aimWorldPos: null,
  fireFlossRequested: false,
  fireRinseRequested: false,
  fireDiscloseRequested: false,
};

function startedSession(): WorldSession {
  const bus = new EventBus();
  const saveSys = new SaveSystem(bus);
  saveSys.load(1_700_000_000_000);
  const session = new WorldSession(bus);
  session.loadCartridge(plaqueCityCartridge, saveSys.getSave(), 'ARCADE');
  return session;
}

describe('probe drawing between sim steps (high refresh-rate displays)', () => {
  it('draws the probe part-way between the last two steps and then restores the true pose', () => {
    const session = startedSession();
    for (let i = 0; i < 20; i++) session.step(FIXED_DT, MOVE_RIGHT);
    const before = session.probePos.x;
    session.step(FIXED_DT, MOVE_RIGHT);
    const after = session.probePos.x;
    expect(after).toBeGreaterThan(before);

    session.beginRenderInterpolation(0.25);
    expect(session.probePos.x).toBeCloseTo(before + (after - before) * 0.25, 6);
    session.endRenderInterpolation();
    expect(session.probePos.x).toBe(after);

    session.beginRenderInterpolation(1);
    expect(session.probePos.x).toBe(after);
    session.endRenderInterpolation();
  });

  it('does not slide a teleported or long-idle probe', () => {
    const session = startedSession();
    for (let i = 0; i < 5; i++) session.step(FIXED_DT, MOVE_RIGHT);
    const settled = session.probePos.x;

    // Many frames with no sim step (paused): the probe holds still at its true position.
    for (let frame = 0; frame < 30; frame++) {
      session.beginRenderInterpolation((frame % 4) / 4);
      if (frame > 8) expect(session.probePos.x).toBe(settled);
      session.endRenderInterpolation();
    }

    // A jump across the map between two steps is shown where it is, not blended.
    session.step(FIXED_DT, { ...MOVE_RIGHT, moveX: 0 });
    session.probePos = { x: session.probePos.x + 12, z: session.probePos.z };
    session.beginRenderInterpolation(0.5);
    expect(session.probePos.x).toBeCloseTo(settled + 12, 3);
    session.endRenderInterpolation();
  });

  it('the clock reports how far each frame sits between sim steps', () => {
    const clock = new ClockController(new EventBus());
    const alphas: number[] = [];
    let steps = 0;
    clock.setCallbacks(
      () => {
        steps += 1;
      },
      (_dt, _now, alpha) => alphas.push(alpha)
    );
    clock.tickFrame(0);
    // 240 Hz frames: one sim step every fourth frame, alpha climbing in between.
    for (let i = 1; i <= 8; i++) clock.tickFrame((i * 1000) / 240);
    expect(steps).toBe(2);
    expect(alphas.length).toBe(9);
    for (const a of alphas) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1.0001);
    }
    expect(alphas[1]).toBeCloseTo(0.25, 2);
    expect(alphas[2]).toBeCloseTo(0.5, 2);
    expect(alphas[3]).toBeCloseTo(0.75, 2);
    expect(alphas[4]).toBeLessThan(0.05);
  });
});
