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
  MOUNTAIN,
  PORTAL_STAGE,
  checksumFinishes,
  finaleClimbStatus,
  finaleLedge,
  resolveFinaleTrack,
  type MolarFinish,
  ENDING_MOLAR_SWAP,
  endingChecksum,
  endingCredit,
  endingFace,
  endingHug,
  endingMolarPlace,
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
    const order = [T.hushEnd, T.riseEnd, T.waveEnd, T.blazeEnd, T.showEnd, T.emblemBurst, T.emblemEnd, T.gatherEnd, T.meet, T.prizeEnd, T.slot, T.molarEnd, T.climbHop, T.summitHop, T.climbEnd, T.end];
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
    const withFinish = (finish: MolarFinish): MolarFinish[] => checksumFinishes(i).map((f, k) => (k === i ? finish : f));
    for (const finish of ['pearl', 'silver', 'gold'] as const) {
      const notes = finaleNotes(plans[i], withFinish(finish), i, false);
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
    expect(finaleNotes(plans[i], withFinish('gold'), i, false).length).toBeGreaterThan(finaleNotes(plans[i], withFinish('pearl'), i, false).length);
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

  it('M11: with Reduce Motion the molar never glides or grows, it fades out and back in at each cut', () => {
    const E = ENDING_TIMES;
    const big = endingMolarPlace(5, true);
    const small = endingMolarPlace(30, true);
    expect(small.y).toBeGreaterThan(big.y);
    expect(small.scale).toBeLessThan(big.scale);
    // every frame is exactly one of the two resting poses
    for (let t = 0; t <= E.end; t += 1 / 60) {
      const p = endingMolarPlace(t, true);
      const atRest = (q: typeof big) => p.x === q.x && p.y === q.y && p.scale === q.scale;
      expect(atRest(big) || atRest(small), `t=${t.toFixed(3)}`).toBe(true);
    }
    // gone at each cut, back to full after it
    for (const cut of [E.creditsStart, E.finaleStart]) {
      expect(endingMolarPlace(cut - ENDING_MOLAR_SWAP - 0.01, true).alpha).toBe(1);
      expect(endingMolarPlace(cut - 0.3, true).alpha).toBeCloseTo(0.5, 5);
      expect(endingMolarPlace(cut - 1e-9, true).alpha).toBeLessThan(1e-6);
      expect(endingMolarPlace(cut, true).alpha).toBe(0);
      expect(endingMolarPlace(cut + 0.3, true).alpha).toBeCloseTo(0.5, 5);
      expect(endingMolarPlace(cut + ENDING_MOLAR_SWAP, true).alpha).toBe(1);
    }
    expect(endingMolarPlace(E.creditsStart - 0.1, true).y).toBe(big.y);
    expect(endingMolarPlace(E.creditsStart + 0.1, true).y).toBe(small.y);
    expect(endingMolarPlace(E.finaleStart - 0.1, true).y).toBe(small.y);
    expect(endingMolarPlace(E.finaleStart + 0.1, true).y).toBe(big.y);
    // without Reduce Motion it still glides between the two
    const mid = endingMolarPlace(E.creditsStart - 0.1, false);
    expect(mid.y).toBeGreaterThan(big.y);
    expect(mid.y).toBeLessThan(small.y);
    expect(mid.alpha).toBe(1);
    // the pieces sit in the molar's sockets wherever it rests
    expect(endingPiece(0, E.creditsStart + 0.1, true).y).toBeGreaterThan(endingPiece(0, E.creditsStart - 0.1, true).y);
  });

  it('L02: the molar smiles at every finisher, but only all gold earns the wink', () => {
    const at = ENDING_TIMES.wink + 0.1;
    expect(endingFace(at, true)).toEqual({ alpha: 1, wink: true });
    expect(endingFace(at, false)).toEqual({ alpha: 1, wink: false });
    expect(endingFace(ENDING_TIMES.wink + 0.5, true).wink).toBe(false);
    expect(endingFace(ENDING_TIMES.face - 0.1, true).alpha).toBe(0);
    // four gold and one pearl: still the hug, no wink
    expect(endingHug(at + 0.6, false).fold).toBe(1);
  });

  it('L03: the hug runs its beats (open, fold on the wink, squeeze, happy eyes, hearts), and still with Reduce Motion', () => {
    const E = ENDING_TIMES;
    expect(endingHug(E.face, false).arms).toBe(0);
    expect(endingHug(E.face + 0.4, false).arms).toBeCloseTo(0.5, 5);
    expect(endingHug(E.face + 0.7, false).arms).toBe(1);
    expect(endingHug(E.face + 1.0, false).open).toBe(1);
    expect(endingHug(E.wink, false).fold).toBe(0);
    expect(endingHug(E.wink + 0.35, false).fold).toBeCloseTo(0.5, 5);
    expect(endingHug(E.wink + 0.8, false).fold).toBe(1);
    expect(endingHug(E.wink + 1.5, false).squeeze).toBe(0);
    expect(endingHug(E.wink + 1.5 + 0.225, false).squeeze).toBeCloseTo(1, 5);
    expect(endingHug(E.wink + 0.79, false).happyEyes).toBe(false);
    expect(endingHug(E.wink + 0.8, false).happyEyes).toBe(true);
    expect(endingHug(E.wink + 2.4, false).happyEyes).toBe(false);
    expect(endingHug(E.wink + 1.5, false).hearts).toBe(0);
    expect(endingHug(E.wink + 1.7, false).hearts).toBeCloseTo(0.5, 5);
    expect(endingHug(E.wink + 2.0, false).hearts).toBe(1);
    const rm = endingHug(E.wink + 0.9, true);
    expect(rm.arms).toBeCloseTo(0.5, 5);
    expect([rm.open, rm.fold, rm.squeeze, rm.happyEyes]).toEqual([1, 1, 0, false]);
    for (let t = E.face; t <= E.end; t += 0.05) expect(endingHug(t, true).squeeze).toBe(0);
    expect(endingHug(E.wink + 1.9, true).hearts).toBeCloseTo(0.5, 5);
  });

  it('L03: the ending checksum tells gold from mixed and Reduce Motion from full motion', () => {
    const gold = endingChecksum(plans, true, false);
    expect(endingChecksum(plans, false, false)).not.toBe(gold);
    expect(endingChecksum(plans, true, true)).not.toBe(gold);
    expect(endingChecksum(plans, false, true)).not.toBe(endingChecksum(plans, true, true));
  });
});

describe('the climb', () => {
  it('puts every cue on a 120 BPM beat, so songs can be written to the bar', () => {
    for (const v of Object.values(FINALE_TIMES)) expect((v * 2) % 1).toBe(0);
    for (const k of ['snap', 'creditsStart', 'creditSeconds', 'finaleStart', 'face', 'wink', 'end'] as const) expect((ENDING_TIMES[k] * 2) % 1).toBe(0);
  });

  it('runs exactly 30 s a city and 60 s for the ending, so songs can be made to fit', () => {
    expect(FINALE_TIMES.end).toBe(30);
    expect(ENDING_TIMES.end).toBe(60);
    expect(ENDING_TIMES.creditsStart + 5 * ENDING_TIMES.creditSeconds).toBe(ENDING_TIMES.finaleStart);
  });

  it('puts the probe on its own ledge, and only the city that completes the set on the summit', () => {
    for (let i = 0; i < CAMPAIGN_PIECES; i++) {
      const p = finaleProbe(FINALE_TIMES.portalLift - 0.01, false, i, false);
      const ledge = finaleLedge(i, FINALE_TIMES.portalLift - 0.01, false);
      expect(Math.hypot(p.x - ledge.x, p.y - ledge.y)).toBeLessThan(0.03);
    }
    const top = finaleProbe(FINALE_TIMES.portalLift - 0.01, false, 4, true);
    expect(Math.hypot(top.x - MOUNTAIN.summitStand.x, top.y - MOUNTAIN.summitStand.y)).toBeLessThan(0.03);
    // then it flies up into the wormhole's ring and goes in as the camera dives
    const atRing = finaleProbe(FINALE_TIMES.dive - 0.01, false, 2, false);
    expect(Math.hypot(atRing.x - PORTAL_STAGE.x, atRing.y - PORTAL_STAGE.y)).toBeLessThan(0.03);
    expect(finaleProbe(FINALE_TIMES.dive + 0.4, false, 2, false).space).toBe('hidden');
    // the ledges climb upward
    for (let i = 1; i < CAMPAIGN_PIECES; i++) expect(MOUNTAIN.ledges[i].y).toBeGreaterThan(MOUNTAIN.ledges[i - 1].y);
  });

  it('counts the cities still to clean and names the next one', () => {
    expect(finaleClimbStatus(['gold', 'pearl', 'empty', 'silver', 'empty'])).toEqual({ left: 2, next: 2 });
    expect(finaleClimbStatus(['gold', 'gold', 'gold', 'gold', 'gold'])).toEqual({ left: 0, next: -1 });
  });

  it('ends on the home chord only at the top; until then the music hangs', () => {
    const lastChord = (finishes: MolarFinish[], slot: number) =>
      finaleNotes(plans[slot], finishes, slot, false).filter((n) => Math.abs(n.t - FINALE_TIMES.climbEnd) < 1e-9 && n.voice === plans[slot].voice);
    const tonic = (slot: number) => plans[slot].tonic;
    const midway = lastChord(checksumFinishes(2), 2);
    expect(midway.some((n) => n.midi === tonic(2))).toBe(false);
    const top = lastChord(checksumFinishes(4), 4);
    expect(top.some((n) => n.midi === tonic(4))).toBe(true);
  });

  it('finds a finale song by name and never borrows another song', () => {
    const files = ['toronto.m4a', 'background.m4a', 'finale_toronto.mp3', 'finale_toronto.m4a', 'grand_finale.mp3'];
    expect(resolveFinaleTrack(0, files)).toBe('finale_toronto.m4a');
    expect(resolveFinaleTrack(1, files)).toBeNull();
    expect(resolveFinaleTrack(-1, files)).toBe('grand_finale.mp3');
    expect(resolveFinaleTrack(-1, ['finale_ending.wav', 'grand_finale.m4a'])).toBe('finale_ending.wav');
  });
});
