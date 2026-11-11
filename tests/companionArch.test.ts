import { describe, expect, it } from 'vitest';
import {
  IDLE_ION_RESERVOIR_CAP,
  PULP_RESCUE_STABILIZE_VALUE,
  PULP_RESCUE_WIN_IONS,
  STASIS_FLOOR_SMOOTHNESS,
  TREAT_ION_REWARD,
} from '../src/config/gameConfig';
import {
  CompanionArchSim,
  createInitialCompanionState,
} from '../src/engine/companion/CompanionArchSim';

describe('CompanionArchSim', () => {
  it('crystallizes exact 72 Fluoride Ions over a 12-hour Smooth Bask window from 100%', () => {
    const t0 = 1_700_000_000_000;
    const state = createInitialCompanionState(t0);
    CompanionArchSim.restoreFullSmoothBask(state, t0);
    state.unclaimedIdleIons = 0;

    const added = CompanionArchSim.reconcileOfflineElapsed(state, t0 + 12 * 3_600_000);
    expect(added).toBe(IDLE_ION_RESERVOIR_CAP);
    expect(state.unclaimedIdleIons).toBe(72);
    expect(state.smoothnessIndex).toBeCloseTo(85, 2);

    const claimed = CompanionArchSim.claimIdleReservoir(state);
    expect(claimed).toBe(72);
    expect(state.unclaimedIdleIons).toBe(0);
  });

  it('guarantees zero shield damage across a 90-day offline Saliva Stasis absence', () => {
    const t0 = 1_700_000_000_000;
    const state = createInitialCompanionState(t0);
    CompanionArchSim.restoreFullSmoothBask(state, t0);

    CompanionArchSim.reconcileOfflineElapsed(state, t0 + 90 * 24 * 3_600_000);
    expect(state.smoothnessIndex).toBe(STASIS_FLOOR_SMOOTHNESS);
    expect(state.enamelShield).toBe(100);
    expect(state.dentinShield).toBe(100);
    expect(state.pulpIntegrity).toBe(100);
  });

  it('caps treat Ion rewards at 3/hour and cascades 45-pt Acid Load into Pulp Rescue with zero permadeath', () => {
    const t0 = 1_700_000_000_000;
    const state = createInitialCompanionState(t0);
    CompanionArchSim.restoreFullSmoothBask(state, t0);

    // Treat 1: 100 -> 65 (>= 50, shields untouched), +20 Ions
    const r1 = CompanionArchSim.feedRegionalTreat(state, t0 + 1_000);
    expect(r1.ionsGranted).toBe(TREAT_ION_REWARD);
    expect(r1.triggeredPulpRescue).toBe(false);
    expect(state.enamelShield).toBe(100);

    // Treat 2: 65 -> 30 (< 50, enamel 100 -> 55), +20 Ions
    const r2 = CompanionArchSim.feedRegionalTreat(state, t0 + 2_000);
    expect(r2.ionsGranted).toBe(TREAT_ION_REWARD);
    expect(state.enamelShield).toBe(55);

    // Treat 3: 30 -> 0 (< 50, enamel 55 -> 10), +20 Ions
    const r3 = CompanionArchSim.feedRegionalTreat(state, t0 + 3_000);
    expect(r3.ionsGranted).toBe(TREAT_ION_REWARD);
    expect(state.enamelShield).toBe(10);

    // Treat 4 within same hour: 0 Ions (hourly reward cap), enamel 10->0 & dentin 100->65
    const r4 = CompanionArchSim.feedRegionalTreat(state, t0 + 4_000);
    expect(r4.ionsGranted).toBe(0);
    expect(state.enamelShield).toBe(0);
    expect(state.dentinShield).toBe(65);

    // Cascade remaining dentin & pulp down to 0
    CompanionArchSim.feedRegionalTreat(state, t0 + 5_000); // dentin 65 -> 20
    CompanionArchSim.feedRegionalTreat(state, t0 + 6_000); // dentin 20 -> 0, pulp 100 -> 75
    CompanionArchSim.feedRegionalTreat(state, t0 + 7_000); // pulp 75 -> 30
    const rFinal = CompanionArchSim.feedRegionalTreat(state, t0 + 8_000); // pulp 30 -> 0!
    expect(rFinal.triggeredPulpRescue).toBe(true);
    expect(state.pulpIntegrity).toBe(0);

    // Timeout outcome stabilizes at 50% (zero permadeath)
    const lossRes = CompanionArchSim.resolvePulpRescue(state, false, t0 + 99_000);
    expect(lossRes.ionsAwarded).toBe(0);
    expect(state.pulpIntegrity).toBe(PULP_RESCUE_STABILIZE_VALUE);
    expect(state.enamelShield).toBe(PULP_RESCUE_STABILIZE_VALUE);

    // Win outcome restores 100% Smooth Bask + 40 Ions
    const winRes = CompanionArchSim.resolvePulpRescue(state, true, t0 + 150_000);
    expect(winRes.ionsAwarded).toBe(PULP_RESCUE_WIN_IONS);
    expect(state.smoothnessIndex).toBe(100);
    expect(state.enamelShield).toBe(100);
    expect(state.pulpIntegrity).toBe(100);
  });
});
