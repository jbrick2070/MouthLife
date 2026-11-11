import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  hueDistance,
  isVisuallySeparated,
  pickAcidPoolTint,
  pickAcidWashTint,
  pickAlleyReticleTint,
  pickBridgeTint,
  pickColonyBeaconTint,
  pickColonyRestoredTint,
  pickEpsDomeTint,
  pickSpringTint,
  pickSucroseTint,
  pickSulcusTint,
} from '../src/engine/render/landmarkContrast';
import { PLAYABLE_CARTRIDGES } from '../src/worlds/worldRegistry';

describe('landmark contrast across all world palettes', () => {
  it('computes WCAG contrast and suppresses neutral white hue artifacts', () => {
    expect(contrastRatio(0x000000, 0xffffff)).toBeCloseTo(21, 0);
    expect(hueDistance(0xffffff, 0xd8b4fe)).toBe(0);
  });

  it('separates sucrose crystals, colony beacons, bridges, acid washes, and EPS domes from both plaque shades in every world', () => {
    const pickers = [
      ['sucrose', pickSucroseTint],
      ['colonyBeacon', pickColonyBeaconTint],
      ['bridge', pickBridgeTint],
      ['acidWash', pickAcidWashTint],
      ['epsDome', pickEpsDomeTint],
    ] as const;

    for (const [id, cart] of Object.entries(PLAYABLE_CARTRIDGES)) {
      for (const [label, pick] of pickers) {
        const tint = pick(cart.palette);
        for (const plaque of [cart.palette.pellicleSlimeHex, cart.palette.matureBiofilmHex]) {
          expect(
            isVisuallySeparated(tint, plaque, 1.45, 0.35),
            `${id} ${label} 0x${tint.toString(16)} vs plaque 0x${plaque.toString(16)}`
          ).toBe(true);
        }
      }
    }
  });

  it('separates restored colonies, saliva springs, acid pools, alley mouths, and sulcus bands from plaque AND clean enamel in every world', () => {
    const dualSurfacePickers = [
      ['colonyRestored', pickColonyRestoredTint],
      ['spring', pickSpringTint],
      ['acidPool', pickAcidPoolTint],
      ['alleyMouth', pickAlleyReticleTint],
      ['sulcusBand', pickSulcusTint],
    ] as const;

    for (const [id, cart] of Object.entries(PLAYABLE_CARTRIDGES)) {
      const surfaces = [
        cart.palette.pellicleSlimeHex,
        cart.palette.matureBiofilmHex,
        cart.palette.enamelBaseHex,
      ];
      for (const [label, pick] of dualSurfacePickers) {
        const tint = pick(cart.palette);
        for (const surface of surfaces) {
          expect(
            isVisuallySeparated(tint, surface, 1.45, 0.35),
            `${id} ${label} 0x${tint.toString(16)} vs surface 0x${surface.toString(16)} (contrast=${contrastRatio(tint, surface).toFixed(2)}, hue=${hueDistance(tint, surface).toFixed(2)})`
          ).toBe(true);
        }
      }
    }
  });

  it('moves off pink on the lilac Neon Acid Clock plaque and off orange on Citadel of Erosion', () => {
    expect(pickSucroseTint(PLAYABLE_CARTRIDGES.world_3.palette)).not.toBe(0xf9a8d4);
    const w4Wash = pickAcidWashTint(PLAYABLE_CARTRIDGES.world_4.palette);
    expect(hueDistance(w4Wash, PLAYABLE_CARTRIDGES.world_4.palette.pellicleSlimeHex)).toBeGreaterThanOrEqual(0.35);
    expect(hueDistance(w4Wash, PLAYABLE_CARTRIDGES.world_4.palette.matureBiofilmHex)).toBeGreaterThanOrEqual(0.35);
  });

  it('differentiates World 4 hibiscus acid washes from World 5 EPS polymer domes and World 2 sulcus bands', () => {
    const w4Acid = pickAcidWashTint(PLAYABLE_CARTRIDGES.world_4.palette);
    const w5Eps = pickEpsDomeTint(PLAYABLE_CARTRIDGES.world_5.palette);
    expect(isVisuallySeparated(w4Acid, w5Eps, 1.6, 0.25)).toBe(true);

    const w2Sulcus = pickSulcusTint(PLAYABLE_CARTRIDGES.world_2.palette);
    expect(contrastRatio(w2Sulcus, PLAYABLE_CARTRIDGES.world_2.palette.pellicleSlimeHex)).toBeGreaterThan(2.0);
  });
});
