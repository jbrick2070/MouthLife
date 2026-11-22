import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARTRIDGE_SWIFT_PATH, NATIVE_CAMPAIGN_WORLD_IDS, num, renderCartridgeSwift, renderStageSwift } from '../scripts/cartridge-native';
import { TOOTH_SEAM_GUM_REACH, TOOTH_SEAM_MAX_WALL_WIDTH, computeToothSeamsX } from '../src/engine/render/toothSeams';
import { EventBus } from '../src/engine/EventBus';
import { SaveSystem } from '../src/engine/persistence/SaveSystem';
import { WorldSession } from '../src/engine/sim/WorldSession';
import { plaqueCityCartridge } from '../src/worlds/plaqueCityCartridge';
import { pulpRescueCartridge } from '../src/worlds/pulpRescueCartridge';
import { PLAYABLE_CARTRIDGES } from '../src/worlds/worldRegistry';

describe('one source for the stages', () => {
  it('the native app carries the same stages (run npx vite-node scripts/cartridge-native.ts --write after changes)', () => {
    const onDisk = readFileSync(CARTRIDGE_SWIFT_PATH, 'utf8').replace(/\r\n/g, '\n');
    expect(onDisk).toBe(renderCartridgeSwift());
  });

  it('writes every stage in the registry', () => {
    const swift = renderCartridgeSwift();
    for (const id of Object.keys(PLAYABLE_CARTRIDGES)) expect(swift).toContain(`id: "${id}"`);
  });

  it('writes a start heading only for a stage that sets one', () => {
    const plain = renderStageSwift('demo', [], plaqueCityCartridge);
    expect(plain).not.toContain('probeSpawnFacingRad');
    const west = renderStageSwift('demo', [], { ...plaqueCityCartridge, probeSpawnFacingRad: Math.PI });
    expect(west).toContain('    probeSpawn: Vec2(x: 7.5, z: 16.0),\n    probeSpawnFacingRad: 3.141592653589793,\n    districts: [');
  });

  it('plays the campaign in the web’s order', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    const ids = /export const CAMPAIGN_WORLD_IDS = \[([^\]]+)\]/.exec(main)?.[1].match(/world_\d/g);
    expect(NATIVE_CAMPAIGN_WORLD_IDS).toEqual(ids);
  });

  it('refuses to drop a field it does not know, at any depth', () => {
    const withExtra = (patch: Partial<typeof plaqueCityCartridge>) => () => renderStageSwift('demo', [], { ...plaqueCityCartridge, ...patch });
    const zone = plaqueCityCartridge.districts[0];
    const gap = plaqueCityCartridge.interdentalAlleys[0];
    const spot = plaqueCityCartridge.commensalSiteSpawns[0];
    expect(withExtra({ districts: [{ ...zone, slope: 2 } as typeof zone] })).toThrow(/does not write "slope"/);
    expect(withExtra({ interdentalAlleys: [{ ...gap, curved: true } as typeof gap] })).toThrow(/does not write "curved"/);
    expect(withExtra({ commensalSiteSpawns: [{ ...spot, pos: { ...spot.pos, y: 1 } as typeof spot.pos }] })).toThrow(/does not write "y"/);
    expect(withExtra({ title: 'Bell\u0007 City' })).toThrow(/control character/);
    expect(withExtra({})).not.toThrow();
  });

  it('always writes a gap’s bridge, even when it has none (Swift gives it no default)', () => {
    const gap = plaqueCityCartridge.interdentalAlleys[0];
    const swift = renderStageSwift('demo', [], { ...plaqueCityCartridge, interdentalAlleys: [{ ...gap, bridgeId: null }] });
    expect(swift).toContain('            wallThickness: 2.95,\n            bridgeId: nil\n        )');
  });

  it('writes numbers Swift reads as Double', () => {
    expect(num(64)).toBe('64.0');
    expect(num(0.9)).toBe('0.9');
    expect(num(-1.5)).toBe('-1.5');
    expect(() => num(Number.NaN)).toThrow();
    expect(() => num(1e-9)).toThrow();
  });
});

describe('tooth seams', () => {
  it('every city keeps its seams: the zone boundaries and the tooth-to-tooth dividers', () => {
    // Written out, not worked out: a change to the rule or to a city must be made on purpose.
    const seams = (id: string) => computeToothSeamsX(PLAYABLE_CARTRIDGES[id]);
    expect(seams('world_1')).toEqual([22, 32, 42]);
    // City 2's two dividers stand on its zone boundaries; its ridge stands free, so it is no seam.
    expect(seams('world_2')).toEqual([22, 42]);
    // Cities 3 to 5 have sideways walls, a jetty on a zone boundary and a walled core: no extra seams.
    expect(seams('world_3')).toEqual([20, 44]);
    expect(seams('world_4')).toEqual([24, 42]);
    expect(seams('world_5')).toEqual([19, 45]);
    expect(computeToothSeamsX(pulpRescueCartridge)).toEqual([]);
  });

  it('a wall up to 3.5 wide that reaches the gum is a divider; a wider or free-standing one is not', () => {
    expect(TOOTH_SEAM_MAX_WALL_WIDTH).toBe(3.5);
    expect(TOOTH_SEAM_GUM_REACH).toBe(1);
    const tooth = [{ minX: 3, maxX: 61, minZ: 5, maxZ: 27 }];
    const wall = (maxX: number, minZ: number, maxZ: number) =>
      computeToothSeamsX({ districts: [], playableMaskBoxes: tooth, wallBoxes: [{ minX: 10, maxX, minZ, maxZ }] });
    expect(wall(13.5, 5, 15)).toEqual([11.8]);
    expect(wall(13.6, 5, 15)).toEqual([]);
    // from the far gum, and the one-unit reach
    expect(wall(13, 20, 27)).toEqual([11.5]);
    expect(wall(13, 6, 15)).toEqual([11.5]);
    expect(wall(13, 6.1, 25.9)).toEqual([]);
  });

  it('a sideways wall or an island is not a seam; a narrow divider is', () => {
    const base = { districts: plaqueCityCartridge.districts, playableMaskBoxes: plaqueCityCartridge.playableMaskBoxes };
    const sideways = { minX: 8, maxX: 50, minZ: 13, maxZ: 15.5 };
    const island = { minX: 21, maxX: 43, minZ: 10, maxZ: 22 };
    const spur = { minX: 30.6, maxX: 33.4, minZ: 11, maxZ: 21 };
    const divider = { minX: 10.6, maxX: 13.4, minZ: 5, maxZ: 15 };
    expect(computeToothSeamsX({ ...base, wallBoxes: [sideways, island, spur] })).toEqual([22, 42]);
    expect(computeToothSeamsX({ ...base, wallBoxes: [divider] })).toEqual([12, 22, 42]);
    expect(computeToothSeamsX({ districts: [], playableMaskBoxes: [], wallBoxes: [] })).toEqual([]);
  });
});

describe('where a stage starts', () => {
  it('HYDRA-1 faces east unless the stage says otherwise', () => {
    const save = new SaveSystem(new EventBus()).load(1_700_000_000_000);
    const east = new WorldSession(new EventBus());
    east.loadCartridge(plaqueCityCartridge, save, 'ARCADE');
    expect(east.probeFacingRad).toBe(0);
    const west = new WorldSession(new EventBus());
    west.loadCartridge({ ...plaqueCityCartridge, probeSpawnFacingRad: Math.PI }, save, 'ARCADE');
    expect(west.probeFacingRad).toBe(Math.PI);
  });
});
