import { describe, expect, it } from 'vitest';
import {
  BASS_UPGRADE_MARGIN_BOOST,
  BRUSH_BASE_ARC_RAD,
  BRUSH_MOVING_RATE,
  BRUSH_STATIONARY_RATE,
  CELL_SIZE,
  FLUORIDE_SEAL_RESOIL_MULT,
  MARGIN_BASE_PENALTY,
} from '../src/config/gameConfig';
import { OralChemistrySim } from '../src/engine/surface/OralChemistrySim';
import { OralSurfaceGrid } from '../src/engine/surface/OralSurfaceGrid';
import { CellFlag, type WorldCartridge } from '../src/engine/types';

function createTestCartridge(): WorldCartridge {
  return {
    id: 'test_world',
    title: 'Test Surface',
    subtitle: 'Unit Test Cartridge',
    hostId: 'toronto',
    historyNoteIds: [],
    worldWidth: 16,
    worldDepth: 16,
    bChannelMode: 'marginDensity',
    parTimeSec: 120,
    basePellicleDensity: 0.6,
    baselinePh: 7.0,
    probeSpawn: { x: 4, z: 8 },
    districts: [
      {
        id: 'd0',
        name: 'District Zero',
        subtitle: 'Test',
        bounds: { minX: 1, maxX: 15, minZ: 1, maxZ: 15 },
      },
    ],
    playableMaskBoxes: [{ minX: 1, maxX: 15, minZ: 1, maxZ: 15 }],
    wallBoxes: [],
    interdentalAlleys: [
      {
        id: 'alley_1',
        endpointA: { x: 8, z: 4 },
        endpointB: { x: 8, z: 12 },
        width: 0.9,
        wallThickness: 1.2,
        bridgeId: null,
      },
    ],
    marginBands: [
      {
        a: { x: 2, z: 13.5 },
        b: { x: 14, z: 13.5 },
        radius: 1.0,
        initialDensity: 0.85,
      },
    ],
    heightCuspHills: [],
    commensalSiteSpawns: [],
    sucroseSpawns: [],
    biofilmBridges: [],
    salivaSprings: [],
    beaconDropSlots: [],
    palette: {
      enamelBaseHex: 0xffffff,
      pellicleSlimeHex: 0xd9e35b,
      matureBiofilmHex: 0x9fb82c,
      gingivaHex: 0xe66c7e,
      skyTopHex: 0x051624,
      skyHorizonHex: 0x0f3b52,
    },
  };
}

describe('OralSurfaceGrid', () => {
  it('handles out-of-bounds actuator calls safely and tracks O(1) clean ratios', () => {
    const cart = createTestCartridge();
    const grid = new OralSurfaceGrid(cart.worldWidth, cart.worldDepth);
    const chem = new OralChemistrySim(cart.worldWidth, cart.worldDepth, 7.0);
    grid.bakeFromCartridge(cart);

    expect(grid.getWorldCleanRatio()).toBe(0);
    expect(grid.getDistrictCleanRatio(0)).toBe(0);

    // Out-of-bounds calls should not throw or corrupt state
    expect(() =>
      grid.applyBrush(
        {
          cx: -10,
          cz: 999,
          facingRad: 0,
          arcRad: BRUSH_BASE_ARC_RAD,
          radius: 3.0,
          removalPerSec: BRUSH_MOVING_RATE,
          dt: 0.5,
          hasBassUpgrade: false,
        },
        chem
      )
    ).not.toThrow();

    expect(() => grid.applyFlossSegment(-20, -20, 200, 200, 0.25)).not.toThrow();
    expect(grid.getWorldCleanRatio()).toBeGreaterThan(0);
  });

  it('cleans faster when sweeping in motion than grinding stationary', () => {
    const cart = createTestCartridge();
    const gMoving = new OralSurfaceGrid(cart.worldWidth, cart.worldDepth);
    const gStatic = new OralSurfaceGrid(cart.worldWidth, cart.worldDepth);
    const chem = new OralChemistrySim(cart.worldWidth, cart.worldDepth, 7.0);
    gMoving.bakeFromCartridge(cart);
    gStatic.bakeFromCartridge(cart);

    const resMove = gMoving.applyBrush(
      {
        cx: 4,
        cz: 6,
        facingRad: 0,
        arcRad: Math.PI,
        radius: 1.8,
        removalPerSec: BRUSH_MOVING_RATE,
        dt: 0.15,
        hasBassUpgrade: false,
      },
      chem
    );
    const resStat = gStatic.applyBrush(
      {
        cx: 4,
        cz: 6,
        facingRad: 0,
        arcRad: Math.PI,
        radius: 1.8,
        removalPerSec: BRUSH_STATIONARY_RATE,
        dt: 0.15,
        hasBassUpgrade: false,
      },
      chem
    );

    expect(resMove.densityRemovedTotal).toBeGreaterThan(resStat.densityRemovedTotal * 2.0);
  });

  it('protects INTERDENTAL alley cells from Sonic Brush while allowing Polymer Floss to clear them', () => {
    const cart = createTestCartridge();
    const grid = new OralSurfaceGrid(cart.worldWidth, cart.worldDepth);
    const chem = new OralChemistrySim(cart.worldWidth, cart.worldDepth, 7.0);
    grid.bakeFromCartridge(cart);

    const gx = Math.floor(8.0 / CELL_SIZE);
    const gz = Math.floor(8.0 / CELL_SIZE);
    const alleyCellIdx = gz * grid.gridW + gx;
    expect((grid.flags[alleyCellIdx] & CellFlag.INTERDENTAL) !== 0).toBe(true);
    const beforeBrush = grid.density[alleyCellIdx];

    grid.applyBrush(
      {
        cx: 8.0,
        cz: 8.0,
        facingRad: 0,
        arcRad: Math.PI * 2,
        radius: 2.5,
        removalPerSec: BRUSH_MOVING_RATE,
        dt: 1.0,
        hasBassUpgrade: true,
      },
      chem
    );
    expect(grid.density[alleyCellIdx]).toBeCloseTo(beforeBrush, 5);

    grid.applyFlossSegment(8.0, 4.0, 8.0, 12.0, 0.5);
    expect(grid.density[alleyCellIdx]).toBe(0);
  });

  it('flushes <= 0.35 slurry & seals Fluorapatite (0.4x re-soil) on Ion Rinse while shedding off thick biofilm', () => {
    const cart = createTestCartridge();
    const grid = new OralSurfaceGrid(cart.worldWidth, cart.worldDepth);
    const chem = new OralChemistrySim(cart.worldWidth, cart.worldDepth, 7.0);
    grid.bakeFromCartridge(cart);

    // Disrupt area around (4, 6) down to ~0.20 slurry, leave (12, 6) at 0.60 intact biofilm
    grid.applyBrush(
      {
        cx: 4,
        cz: 6,
        facingRad: 0,
        arcRad: Math.PI * 2,
        radius: 2.0,
        removalPerSec: 0.42,
        dt: 1.0,
        hasBassUpgrade: false,
      },
      chem
    );

    const disruptedIdx = Math.floor(6 / CELL_SIZE) * grid.gridW + Math.floor(4 / CELL_SIZE);
    const intactIdx = Math.floor(6 / CELL_SIZE) * grid.gridW + Math.floor(12 / CELL_SIZE);
    expect(grid.density[disruptedIdx]).toBeLessThanOrEqual(0.35);
    expect(grid.density[intactIdx]).toBeCloseTo(0.6, 3);

    grid.applyIonRinse(8, 6, 6.0, chem, false);

    expect(grid.density[disruptedIdx]).toBe(0);
    expect((grid.flags[disruptedIdx] & CellFlag.FLUORIDE_SEALED) !== 0).toBe(true);
    expect(grid.density[intactIdx]).toBeGreaterThan(0.5);
    expect((grid.flags[intactIdx] & CellFlag.FLUORIDE_SEALED) !== 0).toBe(false);

    // Compare re-soiling rate on sealed vs unsealed clean cell
    const unsealedIdx = Math.floor(3 / CELL_SIZE) * grid.gridW + Math.floor(12 / CELL_SIZE);
    grid.applyFlossSegment(11.5, 3.0, 12.5, 3.0, 0.5);
    expect(grid.density[unsealedIdx]).toBe(0);

    grid.depositPlaqueCircle(4, 6, 1.0, 0.5, 1.0);
    grid.depositPlaqueCircle(12, 3, 1.0, 0.5, 1.0);
    expect(grid.density[disruptedIdx]).toBeCloseTo(
      grid.density[unsealedIdx] * FLUORIDE_SEAL_RESOIL_MULT,
      4
    );
  });

  it('enforces per-cell critical pH (5.5 Hydroxyapatite vs 4.5 Fluorapatite) and 45-deg Bass margin boost', () => {
    const cart = createTestCartridge();
    const grid = new OralSurfaceGrid(cart.worldWidth, cart.worldDepth);
    const chem = new OralChemistrySim(cart.worldWidth, cart.worldDepth, 7.0);
    grid.bakeFromCartridge(cart);

    // Seal a patch around (4, 5), then re-deposit pellicle onto both (4, 5) and unsealed (4, 9)
    grid.applyFlossSegment(3.0, 5.0, 5.0, 5.0, 0.8);
    grid.applyIonRinse(4.0, 5.0, 1.2, chem, false);
    grid.depositPlaqueCircle(4.0, 5.0, 0.8, 1.0, 1.0);

    // Drop pH to 4.9 across both cells (below 5.5 Hydroxyapatite, above 4.5 Fluorapatite!)
    chem.applyAcidZone(4.0, 7.0, 4.0, 4.9);

    const sealedRes = grid.applyBrush(
      {
        cx: 4.0,
        cz: 5.0,
        facingRad: 0,
        arcRad: Math.PI * 2,
        radius: 0.7,
        removalPerSec: BRUSH_MOVING_RATE,
        dt: 0.5,
        hasBassUpgrade: false,
      },
      chem
    );
    expect(sealedRes.densityRemovedTotal).toBeGreaterThan(0);
    expect(sealedRes.acidAbrasionWarnings).toBe(0);

    const unsealedRes = grid.applyBrush(
      {
        cx: 4.0,
        cz: 9.0,
        facingRad: 0,
        arcRad: Math.PI * 2,
        radius: 0.7,
        removalPerSec: BRUSH_MOVING_RATE,
        dt: 0.5,
        hasBassUpgrade: false,
      },
      chem
    );
    expect(unsealedRes.densityRemovedTotal).toBe(0);
    expect(unsealedRes.acidAbrasionWarnings).toBeGreaterThan(0);

    // Verify Bass 45-degree upgrade boosts MARGIN_FISSURE scrubbing by 1.45x
    const gNoBass = new OralSurfaceGrid(cart.worldWidth, cart.worldDepth);
    const gBass = new OralSurfaceGrid(cart.worldWidth, cart.worldDepth);
    const neutralChem = new OralChemistrySim(cart.worldWidth, cart.worldDepth, 7.0);
    gNoBass.bakeFromCartridge(cart);
    gBass.bakeFromCartridge(cart);

    const rNoBass = gNoBass.applyBrush(
      {
        cx: 5.0,
        cz: 13.5,
        facingRad: 0,
        arcRad: Math.PI * 2,
        radius: 0.5,
        removalPerSec: 0.5,
        dt: 0.5,
        hasBassUpgrade: false,
      },
      neutralChem
    );
    const rBass = gBass.applyBrush(
      {
        cx: 5.0,
        cz: 13.5,
        facingRad: 0,
        arcRad: Math.PI * 2,
        radius: 0.5,
        removalPerSec: 0.5,
        dt: 0.5,
        hasBassUpgrade: true,
      },
      neutralChem
    );

    expect(rBass.densityRemovedTotal / rNoBass.densityRemovedTotal).toBeCloseTo(
      BASS_UPGRADE_MARGIN_BOOST,
      3
    );
    expect(MARGIN_BASE_PENALTY * BASS_UPGRADE_MARGIN_BOOST).toBeCloseTo(0.9425, 4);
  });

  it('bakes EPS_ARMOR domes (bChannel epsArmor), deflects raw brush, cracks via Floss/Rinse, and converts Fluorapatite', () => {
    const cart = {
      ...createTestCartridge(),
      bChannelMode: 'epsArmor' as const,
      epsDomes: [{ id: 'd1', cx: 12.0, cz: 8.0, radius: 1.8, initialDensity: 0.88 }],
    };
    const grid = new OralSurfaceGrid(cart.worldWidth, cart.worldDepth);
    const chem = new OralChemistrySim(cart.worldWidth, cart.worldDepth, 7.0);
    grid.bakeFromCartridge(cart);

    expect(grid.getInitialEpsArmorCount()).toBeGreaterThan(0);
    expect(grid.isEpsArmoredAt(12.0, 8.0)).toBe(true);
    expect(grid.syncRgbaBuffer(chem, 'epsArmor')).toBe(true);
    const domeIdx = Math.floor(8.0 / CELL_SIZE) * grid.gridW + Math.floor(12.0 / CELL_SIZE);
    expect(grid.rgbaBuffer[domeIdx * 4 + 2]).toBe(255);

    const deflectRes = grid.applyBrush(
      {
        cx: 12.0,
        cz: 8.0,
        facingRad: 0,
        arcRad: Math.PI * 2,
        radius: 1.0,
        removalPerSec: BRUSH_MOVING_RATE,
        dt: 0.5,
        hasBassUpgrade: false,
      },
      chem
    );
    expect(deflectRes.densityRemovedTotal).toBe(0);
    expect(deflectRes.epsDeflectWarnings).toBeGreaterThan(0);

    const crackRes = grid.applyFlossSegment(10.0, 8.0, 14.0, 8.0, 0.2, 2.0);
    expect(crackRes.epsCellsCracked).toBeGreaterThan(0);
    expect(grid.isEpsArmoredAt(12.0, 8.0)).toBe(false);
    expect(grid.syncRgbaBuffer(chem, 'epsArmor')).toBe(true);
    expect(grid.rgbaBuffer[domeIdx * 4 + 2]).toBe(0);

    // Fluorapatite-infused brush converts unsealed cells at pH 4.95 and scrubs without acid warnings
    chem.applyAcidZone(4.0, 8.0, 2.0, 4.95);
    const faRes = grid.applyBrush(
      {
        cx: 4.0,
        cz: 8.0,
        facingRad: 0,
        arcRad: Math.PI * 2,
        radius: 1.0,
        removalPerSec: BRUSH_MOVING_RATE,
        dt: 0.5,
        hasBassUpgrade: false,
        convertToFluorapatite: true,
      },
      chem
    );
    expect(faRes.fluorapatiteConverted).toBeGreaterThan(0);
    expect(faRes.acidAbrasionWarnings).toBe(0);
    expect(faRes.densityRemovedTotal).toBeGreaterThan(0);
    expect(grid.isFluorideSealedAt(4.0, 8.0)).toBe(true);
  });
});
