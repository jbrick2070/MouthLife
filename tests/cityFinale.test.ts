import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cityArtForHost } from '../src/config/citySkylines';
import { FINALE_SHOW_SECONDS, parseCityArt } from '../src/config/citySkylineGeometry';
import {
  CAMPAIGN_PIECES,
  ENDING_TIMES,
  FINALE_HOST_IDS,
  FINALE_TIMES,
  GOLDEN_MOLAR,
  endingCredit,
  endingNotes,
  endingPiece,
  finaleBurstSparks,
  finaleCityTint,
  finaleEmblemTargets,
  finaleHash,
  finaleNotes,
  finalePassTime,
  finalePiece,
  finaleProbe,
  finaleSlotPosition,
  molarFinishForGrade,
} from '../src/config/cityFinale';
import { getCartridgeById } from '../src/worlds/worldRegistry';

const ROOT = join(__dirname, '..');
const plans = FINALE_HOST_IDS.map((h) => cityArtForHost(h)!.finale!);

describe('city finale drawings', () => {
  it('lists the campaign host cities in campaign order', () => {
    FINALE_HOST_IDS.forEach((host, i) => expect(getCartridgeById(`world_${i + 1}`).hostId).toBe(host));
  });

  it.each(FINALE_HOST_IDS)('%s has a sign and a show', (host) => {
    const art = cityArtForHost(host)!;
    expect(art.emblem.length).toBeGreaterThan(3);
    // the sign is drawn round 0,0, about one unit each way
    for (const piece of art.emblem) for (const v of piece.tris) expect(Math.abs(v)).toBeLessThanOrEqual(1.05);
    const plan = art.finale!;
    expect(plan.bursts.length).toBeGreaterThanOrEqual(5);
    for (const b of plan.bursts) {
      expect(b.t).toBeGreaterThanOrEqual(0);
      expect(b.t).toBeLessThanOrEqual(FINALE_SHOW_SECONDS);
      expect(b.x).toBeGreaterThanOrEqual(-2);
      expect(b.x).toBeLessThanOrEqual(66);
    }
    expect(finaleEmblemTargets(art.emblem)).toHaveLength(120);
  });

  it('rejects a finale it cannot read', () => {
    const base = '@skyline\nR 0 0 1 1 #ffffff\n@finale\nvoice rhodes 60\nshow fireworks\nhost left\n';
    expect(parseCityArt(base).finale?.voice).toBe('rhodes');
    expect(() => parseCityArt(base + 'burst 9 10 10 peony #ffffff #000000\n')).toThrow(/during the show/);
    expect(() => parseCityArt(base + 'burst 1 10 10 rocket #ffffff #000000\n')).toThrow(/unknown burst/);
    expect(() => parseCityArt(base + 'sparkle 1\n')).toThrow(/unknown finale setting/);
    expect(() => parseCityArt(base + 'voice bell 60\n')).toThrow(/set twice/);
    expect(() => parseCityArt('@finale\nvoice rhodes 60\nshow fireworks\n')).toThrow(/needs voice, show and host/);
    expect(() => parseCityArt('@finale\nvoice tuba 60\nshow fireworks\nhost left\n')).toThrow(/voice/);
    expect(() => parseCityArt('@emblem\n~spin 0 0 4\nC 0 0 1 #ffffff\n~end\n')).toThrow(/only the panorama/);
  });

  it('generated Swift matches the drawings and finales (run npx vite-node scripts/skyline-native.ts --write)', () => {
    const res = spawnSync('npx', ['vite-node', 'scripts/skyline-native.ts', '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    expect(res.status, res.stderr || res.stdout).toBe(0);
  });
});

describe('city finale timeline', () => {
  it('runs its beats in order', () => {
    const T = FINALE_TIMES;
    const order = [T.hushEnd, T.riseEnd, T.waveEnd, T.blazeEnd, T.showEnd, T.emblemBurst, T.emblemEnd, T.gatherEnd, T.meet, T.prizeEnd, T.slot, T.molarEnd, T.end];
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
    expect(T.blazeEnd + FINALE_SHOW_SECONDS).toBeLessThanOrEqual(T.showEnd);
  });

  it('lights the city left to right, or all at once with Reduce Motion', () => {
    expect(finalePassTime(0, false)).toBeLessThan(finalePassTime(64, false));
    expect(finalePassTime(0, true)).toBe(finalePassTime(64, true));
    const before = finaleCityTint(2.0, 30, 'light', 'fireworks', false);
    const after = finaleCityTint(FINALE_TIMES.blazeEnd, 30, 'light', 'fireworks', false);
    expect(before.level).toBeLessThan(0.1);
    expect(after.level).toBeGreaterThan(0.95);
    expect(finaleCityTint(5, 30, 'light', 'fireworks', true).flash).toBe(0);
  });

  it('never jumps the probe within one kind of space', () => {
    let prev = finaleProbe(0, false);
    for (let t = 1 / 60; t < FINALE_TIMES.end; t += 1 / 60) {
      const p = finaleProbe(t, false);
      if (p.space === prev.space && p.space !== 'hidden') {
        const limit = p.space === 'city' ? 0.9 : 0.08;
        expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(limit);
      }
      prev = p;
    }
  });

  it('lands the piece in its own cusp of the molar', () => {
    for (let i = 0; i < CAMPAIGN_PIECES; i++) {
      const justBefore = finalePiece(FINALE_TIMES.slot - 1e-6, i, false);
      const slot = finaleSlotPosition(i);
      expect(justBefore.x).toBeCloseTo(slot.x, 3);
      expect(justBefore.y).toBeCloseTo(slot.y, 3);
      expect(finalePiece(FINALE_TIMES.slot, i, false).visible).toBe(false);
    }
  });

  it('keeps the molar cusps apart', () => {
    const c = GOLDEN_MOLAR.cusps;
    for (let i = 0; i < c.length; i++) {
      for (let j = i + 1; j < c.length; j++) {
        expect(Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y)).toBeGreaterThanOrEqual(GOLDEN_MOLAR.cuspRadius * 2 - 0.01);
      }
    }
  });

  it('gives each grade a finish, and nothing for a city not yet cleaned', () => {
    expect(molarFinishForGrade('FLUORAPATITE_GOLD', true)).toBe('gold');
    expect(molarFinishForGrade('S', true)).toBe('silver');
    expect(molarFinishForGrade('A', true)).toBe('silver');
    expect(molarFinishForGrade('B', true)).toBe('pearl');
    expect(molarFinishForGrade('NONE', true)).toBe('pearl');
    expect(molarFinishForGrade('FLUORAPATITE_GOLD', false)).toBe('empty');
  });

  it('bursts a firework only after its rocket goes up, and lets it fade', () => {
    const burst = plans[0].bursts[0];
    expect(finaleBurstSparks(burst, 0, burst.t + 0.5, 'fireworks')).toHaveLength(0);
    expect(finaleBurstSparks(burst, 0, burst.t + 1.0, 'fireworks').length).toBeGreaterThan(10);
    expect(finaleBurstSparks(burst, 0, burst.t + 0.1, 'meteors').length).toBeGreaterThan(10);
    expect(finaleBurstSparks(burst, 0, burst.t + 10, 'fireworks')).toHaveLength(0);
  });

  it('has a repeatable hash in [0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      const h = finaleHash(i, i * 7 + 3);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      expect(finaleHash(i, i * 7 + 3)).toBe(h);
    }
    expect(finaleHash(1, 2)).not.toBe(finaleHash(2, 1));
  });
});

describe('city finale music', () => {
  const voices = new Set(['rhodes', 'marimba', 'kalimba', 'celesta', 'bell', 'pad', 'reed', 'pluck', 'bass', 'kick', 'whistle', 'boom', 'sparkle', 'whoosh']);

  it.each(FINALE_HOST_IDS.map((h, i) => [h, i] as const))('%s plays a sorted score inside the show', (_host, i) => {
    for (const finish of ['pearl', 'silver', 'gold'] as const) {
      const notes = finaleNotes(plans[i], finish, false);
      for (let k = 1; k < notes.length; k++) expect(notes[k].t).toBeGreaterThanOrEqual(notes[k - 1].t);
      for (const n of notes) {
        expect(voices.has(n.voice)).toBe(true);
        expect(n.t).toBeGreaterThanOrEqual(0);
        expect(n.t).toBeLessThan(FINALE_TIMES.end);
        expect(Math.abs(n.pan)).toBeLessThanOrEqual(1);
        expect(n.midi).toBeGreaterThan(20);
        expect(n.midi).toBeLessThan(110);
      }
    }
    // gold earns a few more notes than pearl
    expect(finaleNotes(plans[i], 'gold', false).length).toBeGreaterThan(finaleNotes(plans[i], 'pearl', false).length);
  });

  it('plays the ending inside its length, with the surprise only for all gold', () => {
    const gold = endingNotes(plans, true);
    const mixed = endingNotes(plans, false);
    expect(gold.length).toBeGreaterThan(mixed.length);
    for (const n of gold) expect(n.t).toBeLessThan(ENDING_TIMES.end);
  });
});

describe('the ending', () => {
  it('flies every piece in before the molar snaps together', () => {
    for (let i = 0; i < CAMPAIGN_PIECES; i++) {
      expect(endingPiece(i, ENDING_TIMES.snap, false).arrived).toBe(true);
      expect(endingPiece(i, 0.5, false).alpha).toBe(0);
    }
  });

  it('rolls a credit for each city in turn', () => {
    const seen = new Set<number>();
    for (let t = ENDING_TIMES.creditsStart; t < ENDING_TIMES.finaleStart; t += 0.25) seen.add(endingCredit(t).index);
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(endingCredit(ENDING_TIMES.finaleStart + 1).index).toBe(-1);
  });
});
