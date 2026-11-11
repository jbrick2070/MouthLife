import { describe, expect, it } from 'vitest';
import { sideLayoutFraming } from '../src/ui/hudHelpers';

describe('landscape side-layout framing', () => {
  it('shifts the arch into the free left column and backs the camera off', () => {
    const f = sideLayoutFraming(844, 390, 447);
    expect(f).not.toBeNull();
    expect(f!.shiftX).toBeLessThan(0);
    expect(f!.shiftX).toBeCloseTo(447 / 2 - 422, 5);
    expect(f!.dolly).toBeGreaterThan(1);
  });

  it('ignores portrait and bottom-deck layouts', () => {
    expect(sideLayoutFraming(390, 844, 120)).toBeNull();
    expect(sideLayoutFraming(1280, 800, 200)).toBeNull();
    expect(sideLayoutFraming(844, 390, 900)).toBeNull();
  });
});
