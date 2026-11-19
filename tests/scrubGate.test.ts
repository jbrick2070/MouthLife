import { describe, expect, it } from 'vitest';
import { scrubMayPlay, type ScrubGateState } from '../src/engine/audio/scrubGate';

const live: ScrubGateState = { mode: 'ARCADE', finale: false, paused: false, hidden: false, stageLive: true };

describe('brushing sound gate', () => {
  it('plays only while a stage is being played', () => {
    expect(scrubMayPlay(live)).toBe(true);
    expect(scrubMayPlay({ ...live, mode: 'PULP_RESCUE' })).toBe(true);
  });

  it('stops when the city ends, even on the same step the last zone is sealed', () => {
    expect(scrubMayPlay({ ...live, stageLive: false })).toBe(false);
    expect(scrubMayPlay({ ...live, finale: true })).toBe(false);
    expect(scrubMayPlay({ ...live, mode: 'REPORT' })).toBe(false);
  });

  it('stops when paused, hidden or back on the menu', () => {
    expect(scrubMayPlay({ ...live, paused: true })).toBe(false);
    expect(scrubMayPlay({ ...live, hidden: true })).toBe(false);
    for (const mode of ['HUB', 'COSMIC_INTRO', 'BRUSH_ALONG'] as const) {
      expect(scrubMayPlay({ ...live, mode })).toBe(false);
    }
  });
});
