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
  pickSupplyBeaconTint,
} from '../src/engine/render/landmarkContrast';
import { getCartridgeById, PLAYABLE_CARTRIDGES } from '../src/worlds/worldRegistry';

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

  it('gives the supply beacon a colour that stands out from plaque and clean enamel in every world', () => {
    // It used to be this fixed yellow, which all but vanished on yellow plaque (contrast 1.06).
    const OLD_YELLOW = 0xfde047;
    for (const id of ['world_1', 'world_2', 'world_3', 'world_4', 'world_5', 'pulp_rescue']) {
      const palette = getCartridgeById(id).palette;
      const tint = pickSupplyBeaconTint(palette);
      for (const surface of [palette.pellicleSlimeHex, palette.matureBiofilmHex, palette.enamelBaseHex]) {
        expect(
          isVisuallySeparated(tint, surface, 1.45, 0.35),
          `${id} beacon 0x${tint.toString(16)} vs surface 0x${surface.toString(16)}`
        ).toBe(true);
      }
      // Plaque is what a beacon sits on most.
      expect(contrastRatio(tint, palette.pellicleSlimeHex), id).toBeGreaterThan(2.4);
      expect(contrastRatio(tint, palette.pellicleSlimeHex), id).toBeGreaterThan(
        contrastRatio(OLD_YELLOW, palette.pellicleSlimeHex)
      );
      // A pickup is never the colour of another landmark.
      const peers = [
        pickSpringTint(palette),
        pickAcidPoolTint(palette),
        pickColonyRestoredTint(palette),
        pickColonyBeaconTint(palette),
        pickSucroseTint(palette),
      ];
      expect(peers, id).not.toContain(tint);
    }
  });

  it('picks these beacon colours (the native app uses the same rule)', () => {
    const pick = (id: string) => pickSupplyBeaconTint(getCartridgeById(id).palette);
    expect(pick('world_1')).toBe(0xdb2777);
    expect(pick('world_2')).toBe(0xdb2777);
    expect(pick('world_3')).toBe(0x0f766e);
    expect(pick('world_4')).toBe(0x7c3aed);
    expect(pick('world_5')).toBe(0xc2410c);
    expect(pick('pulp_rescue')).toBe(0x7c3aed);
  });
});
