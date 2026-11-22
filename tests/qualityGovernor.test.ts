import { describe, expect, it } from 'vitest';
import {
  QUALITY_GOVERNOR_COOLDOWN_SEC,
  QUALITY_LOWER_MIN_GAIN,
  QUALITY_RAISE_RETRY_MAX_SEC,
  QUALITY_RAISE_RETRY_MIN_SEC,
  QUALITY_RAISE_TRIAL_SEC,
  QUALITY_RECENT_FRAMES,
  QUALITY_ROLLING_FRAMES,
} from '../src/config/gameConfig';
import { SceneManager } from '../src/engine/render/SceneManager';
import {
  createQualityGovernor,
  governQuality,
  type QualityGovernorState,
} from '../src/engine/render/qualityGovernor';
import type { QualityTier } from '../src/engine/types';

/** A pretend device: how many frames a second it draws on a level, at a time, on a frame. */
type Device = (tier: QualityTier, sec: number, frame: number) => number;

interface Change {
  sec: number;
  to: QualityTier;
}

/** Plays `seconds` of frames through the governor, as SceneManager does once per drawn frame. */
function play(seconds: number, device: Device, start: QualityTier = 'medium') {
  const g = createQualityGovernor();
  let tier = start;
  let sec = 0;
  let frame = 0;
  const changes: Change[] = [];
  const secondsOn: Record<QualityTier, number> = { low: 0, medium: 0, ultra: 0 };
  while (sec < seconds) {
    const dt = 1 / device(tier, sec, frame++);
    sec += dt;
    secondsOn[tier] += dt;
    const next = governQuality(g, dt, tier, true);
    if (next !== null) {
      tier = next;
      changes.push({ sec, to: next });
    }
  }
  return { final: tier, changes, secondsOn, g };
}

const levels = (changes: Change[]): QualityTier[] => changes.map((c) => c.to);
const TEN_MINUTES = 600;

/** The same "random" numbers every run. */
function dice(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const slowPhone: Device = (tier) => (tier === 'low' ? 33 : tier === 'medium' ? 25 : 15);

describe('quality governor: a frame-rate cap is not a reason to lower the quality', () => {
  it('a steady 30 a second (iPhone Low Power Mode) ends on the level it started at, and stays', () => {
    for (const start of ['low', 'medium', 'ultra'] as const) {
      const r = play(TEN_MINUTES, () => 30, start);
      expect(r.final).toBe(start);
      // one look down the levels below, then never again
      expect(r.changes.length).toBeLessThanOrEqual(3);
      expect(r.changes.every((c) => c.sec < 20)).toBe(true);
      expect(r.secondsOn[start]).toBeGreaterThan(TEN_MINUTES - 15);
    }
    // the game starts on medium: one step down, found useless, one step back
    expect(levels(play(TEN_MINUTES, () => 30).changes)).toEqual(['low', 'medium']);
    // from ultra it looks at both lower levels before it is sure, then goes straight back
    expect(levels(play(TEN_MINUTES, () => 30, 'ultra').changes)).toEqual(['medium', 'low', 'ultra']);
  });

  it('other caps too: 40 a second is left alone after one look, 48 is never touched', () => {
    const forty = play(TEN_MINUTES, () => 40);
    expect(forty.final).toBe('medium');
    expect(levels(forty.changes)).toEqual(['low', 'medium']);
    expect(play(TEN_MINUTES, () => 48).changes).toEqual([]);
  });

  it('the cap lifted: the game climbs, without a dip on the way up', () => {
    const r = play(180, (_tier, sec) => (sec < 60 ? 30 : 60));
    expect(levels(r.changes)).toEqual(['low', 'medium', 'ultra']);
    expect(r.changes[2].sec).toBeGreaterThan(60);
    expect(r.changes[2].sec).toBeLessThan(65);
    expect(r.final).toBe('ultra');
  });

  it('a cap that comes and goes on ultra: back on ultra while it lasts, and after', () => {
    const r = play(180, (_tier, sec) => (sec < 30 || sec >= 90 ? 60 : 30));
    expect(levels(r.changes)).toEqual(['ultra', 'medium', 'low', 'ultra']);
    expect(r.changes[3].sec).toBeLessThan(45);
    expect(r.final).toBe('ultra');
  });

  it('a 30 a second that wobbles (28 to 32) is still seen as a cap', () => {
    const roll = dice(11);
    const r = play(TEN_MINUTES, () => 28 + roll() * 4);
    expect(r.final).toBe('medium');
    expect(levels(r.changes)).toEqual(['low', 'medium']);
  });

  it('a busy processor, where low is hardly faster than medium, keeps medium', () => {
    const r = play(120, (tier) => (tier === 'low' ? 26 : 25));
    expect(levels(r.changes)).toEqual(['low', 'medium']);
  });

  it('a rate that hovers round the 42 line on every level is tried once, not over and over', () => {
    const r = play(TEN_MINUTES, (_tier, sec) => (Math.floor(sec / 10) % 2 === 0 ? 44 : 40));
    expect(r.final).toBe('medium');
    expect(r.changes.length).toBe(2);
  });

  it('once the rate falls well below the one remembered, lowering is tried again and kept if it helps', () => {
    // capped at 30, then the picture itself gets too heavy for medium (20), while low still makes 30
    const r = play(300, (tier, sec) => (sec < 60 ? 30 : tier === 'low' ? 30 : 20));
    expect(levels(r.changes)).toEqual(['low', 'medium', 'low']);
    expect(r.final).toBe('low');
  });

  it('the memory does not outlive the cap: medium at 38 afterwards is lowered, since low makes 60', () => {
    const r = play(300, (tier, sec) => (sec < 60 ? 30 : tier === 'low' ? 60 : 38));
    expect(r.final).toBe('low');
    expect(r.secondsOn.low).toBeGreaterThan(200);
  });
});

describe('quality governor: no flipping between a level that is too slow and one that is fast enough', () => {
  it('60 on medium but 36 on ultra settles on medium: 8 changes in ten minutes, not 120', () => {
    const r = play(TEN_MINUTES, (tier) => (tier === 'ultra' ? 36 : 60));
    expect(r.final).toBe('medium');
    // ultra is tried four times (at the start, then after 1, 2 and 4 minutes), 5 s each
    const upAndDown: QualityTier[] = ['ultra', 'medium'];
    expect(levels(r.changes)).toEqual([...upAndDown, ...upAndDown, ...upAndDown, ...upAndDown]);
    expect(r.secondsOn.ultra).toBeLessThan(25);
    expect(r.secondsOn.low).toBe(0);
  });

  it('the wait doubles from a minute to ten minutes and then stays there', () => {
    const r = play(3600, (tier) => (tier === 'ultra' ? 36 : 60));
    const tries = r.changes.filter((c) => c.to === 'ultra').map((c) => c.sec);
    const fails = r.changes.filter((c) => c.to === 'medium').map((c) => c.sec);
    const waits = tries.slice(1).map((sec, i) => Math.round(sec - fails[i]));
    const m = QUALITY_RAISE_RETRY_MIN_SEC;
    const max = QUALITY_RAISE_RETRY_MAX_SEC;
    expect(waits.slice(0, 5)).toEqual([m, m * 2, m * 4, m * 8, max]);
    expect(waits.slice(5).every((w) => w === max)).toBe(true);
    expect(r.changes.length).toBeLessThanOrEqual(18);
    expect(r.final).toBe('medium');
  });

  it('the same one level down: 60 on low but 38 on medium settles on low', () => {
    const r = play(TEN_MINUTES, (tier) => (tier === 'low' ? 60 : tier === 'medium' ? 38 : 25));
    expect(r.final).toBe('low');
    expect(r.changes.length).toBeLessThanOrEqual(9);
    expect(r.secondsOn.low).toBeGreaterThan(TEN_MINUTES - 30);
  });

  it('a level that fails a little after its first check, not at it, is held back just the same', () => {
    // ultra wobbles either side of the line: 44 for ten seconds, 38 for ten seconds
    const wobblyUltra = (sec: number): number => (Math.floor(sec / 10) % 2 === 0 ? 44 : 38);
    const r = play(TEN_MINUTES, (tier, sec) => (tier === 'ultra' ? wobblyUltra(sec) : 60));
    expect(r.final).toBe('medium');
    expect(r.changes.length).toBeLessThanOrEqual(8);
    expect(r.secondsOn.medium).toBeGreaterThan(TEN_MINUTES - 60);
  });

  it('a noisy ultra (38 to 46) does not flip either', () => {
    const roll = dice(17);
    const r = play(TEN_MINUTES, (tier) => (tier === 'ultra' ? 38 + roll() * 8 : 60));
    expect(r.final).toBe('medium');
    expect(r.changes.length).toBeLessThanOrEqual(8);
  });

  it('a level that held for more than a minute and then fails is tried again at once, then held back', () => {
    // a heavy scene from 100 s on: ultra drops to 36
    const r = play(300, (tier, sec) => (tier === 'ultra' && sec >= 100 ? 36 : 60));
    expect(levels(r.changes).slice(0, 4)).toEqual(['ultra', 'medium', 'ultra', 'medium']);
    const [, down, up, downAgain] = r.changes;
    expect(up.sec - down.sec).toBeLessThan(QUALITY_GOVERNOR_COOLDOWN_SEC + 1);
    // the second failure came straight after a raise, so the next try waits a minute
    expect(r.changes[4].sec - downAgain.sec).toBeGreaterThanOrEqual(QUALITY_RAISE_RETRY_MIN_SEC);
    expect(QUALITY_RAISE_TRIAL_SEC).toBeGreaterThan(QUALITY_GOVERNOR_COOLDOWN_SEC);
  });
});

describe('quality governor: what must still work', () => {
  it('a genuinely slow device still ends on low', () => {
    const fromMedium = play(120, slowPhone);
    expect(levels(fromMedium.changes)).toEqual(['low']);
    expect(fromMedium.changes[0].sec).toBeLessThan(5);
    expect(levels(play(120, slowPhone, 'ultra').changes)).toEqual(['medium', 'low']);
  });

  it('a device that gets faster later climbs back', () => {
    const r = play(240, (tier, sec) => (sec >= 120 ? 60 : slowPhone(tier, sec, 0)));
    expect(levels(r.changes)).toEqual(['low', 'medium', 'ultra']);
    expect(r.changes[1].sec).toBeGreaterThan(120);
    expect(r.changes[2].sec).toBeLessThan(130);
    expect(r.final).toBe('ultra');
  });

  it('a fast device goes to ultra after three seconds and stays', () => {
    const r = play(120, () => 60);
    expect(levels(r.changes)).toEqual(['ultra']);
    expect(r.changes[0].sec).toBeGreaterThanOrEqual(3);
    expect(r.changes[0].sec).toBeLessThan(3.1);
  });

  it('between the two lines nothing moves: 50 on ultra stays ultra, and a 120 Hz screen at 70 is not lowered', () => {
    expect(levels(play(120, (tier) => (tier === 'ultra' ? 50 : 60)).changes)).toEqual(['ultra']);
    expect(levels(play(60, (tier) => (tier === 'ultra' ? 70 : 120)).changes)).toEqual(['ultra']);
  });

  it('a laptop where medium is no faster than ultra and only low helps reaches low, not stuck on ultra', () => {
    // medium and ultra draw the same number of dots on a screen like this; low draws fewer
    const laptop: Device = (tier) => (tier === 'ultra' ? 36 : tier === 'medium' ? 38 : 58);
    // a light Home screen first (60 everywhere), then a heavy stage
    const r = play(TEN_MINUTES, (tier, sec) => (sec < 30 ? 60 : laptop(tier, sec, 0)));
    expect(levels(r.changes).slice(0, 3)).toEqual(['ultra', 'medium', 'low']);
    expect(r.final).toBe('low');
    expect(r.secondsOn.low).toBeGreaterThan(500);
    expect(play(TEN_MINUTES, laptop).final).toBe('low');
  });

  it('a stutter while the game starts does not lower a fast phone', () => {
    const r = play(60, (_tier, sec, frame) => (sec < 2.5 && frame % 6 === 0 ? 10 : 60));
    expect(levels(r.changes)).toEqual(['ultra']);
  });

  it('a stall or a frame of no length is not counted', () => {
    const g = createQualityGovernor();
    for (const dt of [0, -1, 0.26, 5]) expect(governQuality(g, dt, 'medium', true)).toBeNull();
    expect(g.filled).toBe(0);
    expect(g.cooldownSec).toBe(3);
    expect(governQuality(g, 0.25, 'medium', true)).toBeNull();
    expect(g.filled).toBe(1);
  });
});

describe('quality governor: the record it keeps', () => {
  it('decides nothing for three seconds, nor before it has 90 frames', () => {
    const fast = play(2.9, () => 120);
    expect(fast.changes).toEqual([]);
    expect(fast.g.filled).toBe(QUALITY_ROLLING_FRAMES);
    const slow = play(5, () => 10); // 50 frames in five seconds
    expect(slow.changes).toEqual([]);
    expect(play(9.5, () => 10).final).toBe('low');
  });

  it('after a change it waits five seconds and judges the new level on its own frames', () => {
    const g = createQualityGovernor();
    let tier: QualityTier = 'medium';
    let sec = 0;
    const step = (fps: number): QualityTier | null => {
      sec += 1 / fps;
      return governQuality(g, 1 / fps, tier, true);
    };
    while (step(60) === null);
    tier = 'ultra';
    expect(g.filled).toBe(0);
    expect(g.cooldownSec).toBe(QUALITY_GOVERNOR_COOLDOWN_SEC);
    const raisedAt = sec;
    let next: QualityTier | null = null;
    while ((next = step(36)) === null);
    expect(next).toBe('medium');
    expect(sec - raisedAt).toBeGreaterThanOrEqual(QUALITY_GOVERNOR_COOLDOWN_SEC);
    expect(sec - raisedAt).toBeLessThan(QUALITY_GOVERNOR_COOLDOWN_SEC + 0.1);
    expect(g.fps).toBeCloseTo(36, 3);
  });

  it('remembers the rate lowering could not improve, within 15% either side', () => {
    const r = play(60, () => 30);
    expect(r.g.heldFps).toBeCloseTo(30, 3);
    expect(r.g.loweredFrom).toBeNull();
    // 26 is within 15% of 30: left alone. 25 is not: tried again.
    expect(QUALITY_LOWER_MIN_GAIN).toBe(0.15);
    expect(play(120, (_tier, sec) => (sec < 60 ? 30 : 26)).changes.length).toBe(2);
    expect(play(120, (_tier, sec) => (sec < 60 ? 30 : 25)).changes.length).toBeGreaterThan(2);
  });

  it('reads the rate before a lowering from the newest 30 frames', () => {
    const g = createQualityGovernor();
    // 60 a second until the last 39 frames, which are capped at 30: the 90-frame average has only
    // just fallen under 42, but the rate now is 30
    let next: QualityTier | null = null;
    for (let i = 0; i < 400 && next === null; i++) next = governQuality(g, 1 / 60, 'ultra', true);
    expect(next).toBeNull();
    let capped = 0;
    while ((next = governQuality(g, 1 / 30, 'ultra', true)) === null) capped++;
    expect(next).toBe('medium');
    expect(capped + 1).toBeGreaterThan(QUALITY_RECENT_FRAMES);
    expect(g.fps).toBeGreaterThan(41);
    expect(g.fpsBeforeLowering).toBeCloseTo(30, 3);
    expect(g.loweredFrom).toBe('ultra');
  });

  it('a level picked by hand is left alone, and the governor starts afresh when handed back', () => {
    const g = createQualityGovernor();
    for (let i = 0; i < 600; i++) expect(governQuality(g, 1 / 20, 'ultra', false)).toBeNull();
    expect(g.filled).toBe(0);
    // handed back: nothing for three seconds, then it acts on what it sees now
    let frames = 0;
    let next: QualityTier | null = null;
    while ((next = governQuality(g, 1 / 20, 'ultra', true)) === null) frames++;
    expect(next).toBe('medium');
    expect(frames).toBeGreaterThanOrEqual(QUALITY_ROLLING_FRAMES - 1);

    // picking by hand in the middle of a check forgets the check
    const h = play(4, () => 30).g;
    expect(h.loweredFrom).toBe('medium');
    governQuality(h, 1 / 30, 'ultra', false);
    expect(h.loweredFrom).toBeNull();
    expect(h.heldFps).toBe(0);
  });

  it('makes nothing new while it runs: the same record and the same array throughout', () => {
    const g = createQualityGovernor();
    const frames = g.frameSec;
    const keys = Object.keys(g).join();
    let tier: QualityTier = 'medium';
    for (let i = 0; i < 20_000; i++) {
      const next = governQuality(g, 1 / (tier === 'ultra' ? 36 : 60), tier, true);
      if (next !== null) {
        expect(typeof next).toBe('string');
        tier = next;
      }
    }
    expect(g.frameSec).toBe(frames);
    expect(g.frameSec.length).toBe(QUALITY_ROLLING_FRAMES);
    expect(Object.keys(g).join()).toBe(keys);
  });
});

describe('quality governor: wired into the scene', () => {
  type Stepper = { stepQualityGovernor(this: unknown, dt: number): void };
  const step = (SceneManager.prototype as unknown as Stepper).stepQualityGovernor;

  function scene(pref: 'auto' | QualityTier) {
    const applied: Array<{ tier: QualityTier; fps: number }> = [];
    const fake = {
      governor: createQualityGovernor() as QualityGovernorState,
      activeTier: 'medium' as QualityTier,
      qualityPref: pref,
      applyQualityTier(tier: QualityTier, fps: number) {
        this.activeTier = tier;
        applied.push({ tier, fps: Math.round(fps) });
      },
    };
    return { fake, applied };
  }

  it('each drawn frame goes to the governor, and its answer is applied with the frame rate', () => {
    const { fake, applied } = scene('auto');
    for (let sec = 0; sec < 20; sec += 1 / 30) step.call(fake, 1 / 30);
    // a 30 a second cap: down once, back once, and then left alone
    expect(applied).toEqual([
      { tier: 'low', fps: 30 },
      { tier: 'medium', fps: 30 },
    ]);
    expect(fake.activeTier).toBe('medium');
  });

  it('a level picked by hand is never changed', () => {
    const { fake, applied } = scene('ultra');
    for (let sec = 0; sec < 20; sec += 1 / 20) step.call(fake, 1 / 20);
    expect(applied).toEqual([]);
  });
});
