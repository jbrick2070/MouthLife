import type { WorldCartridge } from '../engine/types';

/**
 * Compact 32u x 32u single-molar emergency cartridge for the 90s Pulp Rescue Scramble
 * ("Avoid the Dreaded Root Canal!" — zero permadeath on timeout).
 */
export const pulpRescueCartridge: WorldCartridge = {
  id: 'pulp_rescue',
  title: 'Emergency Pulp Rescue!',
  subtitle: 'Clean the Deep Groove & Seal It to Protect the Pulp!',
  hostId: 'toronto',
  historyNoteIds: [],
  worldWidth: 32,
  worldDepth: 32,
  bChannelMode: 'localPh',
  parTimeSec: 90,
  basePellicleDensity: 0.56,
  baselinePh: 6.4,
  probeSpawn: { x: 8.0, z: 16.0 },
  challengeBlurb:
    '90 seconds: hit Saliva Springs, smash Sugar Crystals, and clean 85% before time runs out. You can’t lose the tooth!',
  districts: [
    {
      id: 'deep_pulp_crown',
      name: 'Deep Tooth Bowl',
      subtitle: 'Smash Sugar, Stop Acid & Seal 85%!',
      bounds: { minX: 3.5, maxX: 28.5, minZ: 3.5, maxZ: 28.5 },
    },
  ],
  playableMaskBoxes: [{ minX: 4.0, maxX: 28.0, minZ: 4.0, maxZ: 28.0 }],
  wallBoxes: [],
  interdentalAlleys: [
    {
      id: 'rescue_fissure_vent',
      endpointA: { x: 14.2, z: 16.0 },
      endpointB: { x: 17.8, z: 16.0 },
      width: 0.9,
      wallThickness: 1.5,
      bridgeId: 'rescue_bridge',
    },
  ],
  marginBands: [
    { a: { x: 6, z: 16 }, b: { x: 26, z: 16 }, radius: 1.5, initialDensity: 0.88 },
    { a: { x: 16, z: 6 }, b: { x: 16, z: 26 }, radius: 1.5, initialDensity: 0.88 },
  ],
  heightCuspHills: [
    { cx: 9.5, cz: 9.5, radius: 6.5, height: 2.2 },
    { cx: 22.5, cz: 9.5, radius: 6.5, height: 2.2 },
    { cx: 9.5, cz: 22.5, radius: 6.5, height: 2.2 },
    { cx: 22.5, cz: 22.5, radius: 6.5, height: 2.2 },
  ],
  commensalSiteSpawns: [
    { id: 'rescue_site_1', pos: { x: 10.0, z: 10.0 }, districtIdx: 0 },
    { id: 'rescue_site_2', pos: { x: 22.0, z: 10.0 }, districtIdx: 0 },
    { id: 'rescue_site_3', pos: { x: 22.0, z: 22.0 }, districtIdx: 0 },
  ],
  sucroseSpawns: [
    { id: 'rescue_suc_1', pos: { x: 16.0, z: 10.0 }, districtIdx: 0 },
    { id: 'rescue_suc_2', pos: { x: 16.0, z: 22.0 }, districtIdx: 0 },
  ],
  biofilmBridges: [
    {
      id: 'rescue_bridge',
      a: { x: 16.0, z: 15.2 },
      b: { x: 16.0, z: 16.8 },
      intact: true,
    },
  ],
  salivaSprings: [
    { x: 10.0, z: 22.0 },
    { x: 24.0, z: 16.0 },
  ],
  beaconDropSlots: [{ x: 12.0, z: 16.0 }],
  palette: {
    enamelBaseHex: 0xfff5f0,
    pellicleSlimeHex: 0xe69d38,
    matureBiofilmHex: 0xc4512d,
    gingivaHex: 0xd94862,
    skyTopHex: 0x1f0812,
    skyHorizonHex: 0x4a1228,
  },
};
