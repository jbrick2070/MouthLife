import { describe, expect, it } from 'vitest';
import {
  CompanionArchSim,
  createInitialCompanionState,
  PULP_RESCUE_STABILIZE_SMOOTHNESS_FLOOR,
  TREAT_SMOOTHNESS_FLOOR,
} from '../src/engine/companion/CompanionArchSim';
import { EventBus } from '../src/engine/EventBus';
import {
  SaveSystem,
  decodeSaveFromSyncCode,
  encodeSaveToSyncCode,
  truncateDisplayName,
} from '../src/engine/persistence/SaveSystem';
import { ScoringEngine } from '../src/engine/scoring/ScoringEngine';
import { PULP_RESCUE_STABILIZE_VALUE } from '../src/config/gameConfig';

// Rules that had drifted from native-apple/Sources/MouthLifeCore. The same save must earn the
// same grade and survive the same sync codes whichever edition opens it next.

describe('rules shared with the native app', () => {
  it('awards Fluorapatite Gold at 9,000+ only with 95% clean enamel and every site restored', () => {
    expect(ScoringEngine.computeGrade(9000, true, 0.95)).toBe('FLUORAPATITE_GOLD');
    expect(ScoringEngine.computeGrade(8999, true, 1.0)).toBe('S');
    expect(ScoringEngine.computeGrade(9600, true, 0.94)).toBe('S');
    expect(ScoringEngine.computeGrade(9600, false, 1.0)).toBe('S');
    expect(ScoringEngine.computeGrade(8500, false, 0.5)).toBe('S');
    expect(ScoringEngine.computeGrade(7200, true, 1.0)).toBe('A');
    expect(ScoringEngine.computeGrade(5500, true, 1.0)).toBe('B');
    expect(ScoringEngine.computeGrade(5499, true, 1.0)).toBe('C');
  });

  it('never lets treats drop smoothness below the floor', () => {
    const state = createInitialCompanionState(1_000);
    for (let i = 0; i < 6; i++) CompanionArchSim.feedRegionalTreat(state, 1_000 + i * 1_000);
    expect(state.smoothnessIndex).toBe(TREAT_SMOOTHNESS_FLOOR);
  });

  it('a timed-out Pulp Rescue only lifts values, never lowers what the player still had', () => {
    const state = createInitialCompanionState(1_000);
    state.smoothnessIndex = 20;
    state.enamelShield = 0;
    state.dentinShield = 80;
    state.pulpIntegrity = 0;
    CompanionArchSim.resolvePulpRescue(state, false, 2_000);
    expect(state.smoothnessIndex).toBe(PULP_RESCUE_STABILIZE_SMOOTHNESS_FLOOR);
    expect(state.enamelShield).toBe(PULP_RESCUE_STABILIZE_VALUE);
    expect(state.dentinShield).toBe(80);
    expect(state.pulpIntegrity).toBe(PULP_RESCUE_STABILIZE_VALUE);

    state.smoothnessIndex = 90;
    CompanionArchSim.resolvePulpRescue(state, false, 3_000);
    expect(state.smoothnessIndex).toBe(90);
  });
});

describe('sync codes accepted the way the native app accepts them', () => {
  function sampleCode(): { code: string; ions: number } {
    const sys = new SaveSystem(new EventBus());
    const save = sys.load(1_700_000_000_000);
    save.fluorideIons = 321;
    save.totalBrushStamps = 7;
    save.playerProfile.displayName = 'Ana';
    return { code: encodeSaveToSyncCode(save), ions: 321 };
  }

  it('imports a code that was line-wrapped, re-padded or converted to standard Base64', () => {
    const { code, ions } = sampleCode();
    const body = code.slice(4);

    const wrapped = `ML2:${body.slice(0, 20)}\n${body.slice(20, 50)} \t${body.slice(50)}\r\n`;
    expect(decodeSaveFromSyncCode(wrapped).fluorideIons).toBe(ions);

    const padded = `${code}${'='.repeat((4 - (body.length % 4)) % 4)}`;
    expect(decodeSaveFromSyncCode(padded).fluorideIons).toBe(ions);

    const standard = `ML2:${body.replace(/-/g, '+').replace(/_/g, '/')}`;
    expect(decodeSaveFromSyncCode(standard).totalBrushStamps).toBe(7);
  });

  it('still rejects junk: bad characters, padding in the middle, impossible lengths', () => {
    const { code } = sampleCode();
    const body = code.slice(4);
    expect(() => decodeSaveFromSyncCode(`ML2:${body.slice(0, 10)}=${body.slice(10)}`)).toThrow();
    expect(() => decodeSaveFromSyncCode(`ML2:${body.slice(0, 10)}*${body.slice(10)}`)).toThrow();
    expect(() => decodeSaveFromSyncCode('ML2:A')).toThrow();
    expect(() => decodeSaveFromSyncCode('ML2:   ')).toThrow();
    expect(() => decodeSaveFromSyncCode(`ML1:${body}`)).toThrow();
  });

  it('cuts long names by whole characters so an emoji is never split in half', () => {
    const name = `a${'😀'.repeat(30)}`;
    const cut = truncateDisplayName(name);
    expect(Array.from(cut).length).toBe(24);
    // No lone surrogate left behind: the string survives a UTF-8 round trip unchanged.
    expect(new TextDecoder().decode(new TextEncoder().encode(cut))).toBe(cut);
    expect(truncateDisplayName('Explorer')).toBe('Explorer');

    const sys = new SaveSystem(new EventBus());
    const save = sys.load(1_700_000_000_000);
    save.playerProfile.displayName = name;
    const decoded = decodeSaveFromSyncCode(encodeSaveToSyncCode(save));
    expect(decoded.playerProfile.displayName).toBe(cut);
  });
});
