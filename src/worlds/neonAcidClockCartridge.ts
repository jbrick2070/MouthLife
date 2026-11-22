import type { WorldCartridge } from '../engine/types';

/**
 * World 3 — Tokyo Studio Arch (with the 1940 Chicago lab).
 * Honors Dr. Robert M. Stephan's pH electrode measurements. Signature `localPh` challenge:
 * while any Sucrose "soda sip" crystal stands, a sweet sip fires every 22 s and the whole arch
 * plunges below the critical pH 5.5 line — brushing is acid-shielded until Salivary springs,
 * a Fluoride-Bicarb Surge, or shattering every crystal ends the acid clock.
 */
/**
 * World 3 — Tokyo Studio Arch. Layout: the crossing. One long wall runs east-west across all three
 * zones, so every zone has a north half and a south half; three floss gaps run NORTH-SOUTH through
 * it. HYDRA-1 starts bottom-centre, facing the wall.
 */
export const neonAcidClockCartridge: WorldCartridge = {
  id: 'world_3',
  title: 'Neon Acid Clock',
  subtitle: 'Tokyo Studio Arch • Honoring the 1940 Chicago Acid Clock',
  hostId: 'tokyo',
  historyNoteIds: ['1940_chicago_stephan'],
  worldWidth: 64,
  worldDepth: 32,
  bChannelMode: 'localPh',
  parTimeSec: 300,
  basePellicleDensity: 0.46,
  baselinePh: 6.9,
  probeSpawn: { x: 32.0, z: 21.5 },
  probeSpawnFacingRad: -Math.PI / 2,
  stephanSipIntervalSec: 22,
  challengeBlurb:
    'Every soda sip restarts the acid clock. Smash the sugar, hit Saliva springs, and fire Surge so it is safe to brush!',
  districts: [
    {
      id: 'shibuya_incisor_stage',
      name: 'Shibuya Front-Tooth Stage',
      subtitle: 'Broad Sweeps Between Sweet Sips',
      bounds: { minX: 2.5, maxX: 20.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'studio_mixing_contacts',
      name: 'Studio Desk Gaps',
      subtitle: 'Gap Zips & Soda Sips',
      bounds: { minX: 20.0, maxX: 44.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'chicago_molar_lab',
      name: 'Chicago Molar Acid Lab',
      subtitle: 'Acid Grooves & Saliva Buffer',
      bounds: { minX: 44.0, maxX: 61.5, minZ: 4.5, maxZ: 27.5 },
    },
  ],
  playableMaskBoxes: [
    { minX: 3.0, maxX: 20.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 20.0, maxX: 44.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 44.0, maxX: 61.0, minZ: 5.0, maxZ: 27.0 },
  ],
  wallBoxes: [
    // The crossing wall (z≈14.25), east to west, in four pieces between its three gaps
    { minX: 2.5, maxX: 8.7, minZ: 12.84, maxZ: 15.66 },
    { minX: 15.3, maxX: 28.7, minZ: 12.84, maxZ: 15.66 },
    { minX: 35.3, maxX: 48.7, minZ: 12.84, maxZ: 15.66 },
    { minX: 55.3, maxX: 61.5, minZ: 12.84, maxZ: 15.66 },
  ],
  interdentalAlleys: [
    {
      id: 'alley_crossing_west',
      endpointA: { x: 12.0, z: 12.45 },
      endpointB: { x: 12.0, z: 16.05 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_crossing_west',
    },
    {
      id: 'alley_crossing_centre',
      endpointA: { x: 32.0, z: 12.45 },
      endpointB: { x: 32.0, z: 16.05 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_crossing_centre',
    },
    {
      id: 'alley_crossing_east',
      endpointA: { x: 52.0, z: 12.45 },
      endpointB: { x: 52.0, z: 16.05 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_crossing_east',
    },
  ],
  marginBands: [
    { a: { x: 4.0, z: 26.2 }, b: { x: 18.5, z: 26.2 }, radius: 1.2, initialDensity: 0.82 },
    // Molar grooves either side of the crossing wall
    { a: { x: 47.5, z: 8.6 }, b: { x: 58.5, z: 8.6 }, radius: 1.2, initialDensity: 0.86 },
    { a: { x: 47.5, z: 21.4 }, b: { x: 58.5, z: 21.4 }, radius: 1.2, initialDensity: 0.86 },
  ],
  heightCuspHills: [
    { cx: 11.0, cz: 8.6, radius: 7.0, height: 1.0 },
    { cx: 11.0, cz: 21.4, radius: 8.0, height: 1.0 },
    { cx: 26.0, cz: 8.6, radius: 5.5, height: 1.5 },
    { cx: 26.0, cz: 21.4, radius: 5.5, height: 1.5 },
    { cx: 38.0, cz: 8.6, radius: 5.5, height: 1.5 },
    { cx: 38.0, cz: 21.4, radius: 5.5, height: 1.5 },
    { cx: 49.0, cz: 8.6, radius: 6.0, height: 2.2 },
    { cx: 57.5, cz: 8.6, radius: 6.0, height: 2.2 },
    { cx: 49.0, cz: 21.4, radius: 6.0, height: 2.2 },
    { cx: 57.5, cz: 21.4, radius: 6.0, height: 2.2 },
  ],
  commensalSiteSpawns: [
    { id: 'tokyo_d0_1', pos: { x: 8.0, z: 9.0 }, districtIdx: 0 },
    { id: 'tokyo_d0_2', pos: { x: 16.0, z: 22.5 }, districtIdx: 0 },
    { id: 'tokyo_d0_3', pos: { x: 6.5, z: 23.5 }, districtIdx: 0 },
    { id: 'tokyo_d1_1', pos: { x: 25.5, z: 8.5 }, districtIdx: 1 },
    { id: 'tokyo_d1_2', pos: { x: 39.0, z: 9.0 }, districtIdx: 1 },
    { id: 'tokyo_d1_3', pos: { x: 25.0, z: 22.5 }, districtIdx: 1 },
    { id: 'tokyo_d2_1', pos: { x: 48.5, z: 9.0 }, districtIdx: 2 },
    { id: 'tokyo_d2_2', pos: { x: 57.5, z: 9.5 }, districtIdx: 2 },
    { id: 'tokyo_d2_3', pos: { x: 48.0, z: 22.5 }, districtIdx: 2 },
    { id: 'tokyo_d2_4', pos: { x: 57.5, z: 21.5 }, districtIdx: 2 },
  ],
  sucroseSpawns: [
    { id: 'soda_sip_1', pos: { x: 17.0, z: 8.0 }, districtIdx: 0 },
    { id: 'soda_sip_2', pos: { x: 39.5, z: 22.5 }, districtIdx: 1 },
    { id: 'soda_sip_3', pos: { x: 33.0, z: 7.5 }, districtIdx: 1 },
    { id: 'soda_sip_4', pos: { x: 54.0, z: 23.5 }, districtIdx: 2 },
  ],
  biofilmBridges: [
    { id: 'bridge_crossing_west', a: { x: 11.3, z: 14.25 }, b: { x: 12.7, z: 14.25 }, intact: true },
    { id: 'bridge_crossing_centre', a: { x: 31.3, z: 14.25 }, b: { x: 32.7, z: 14.25 }, intact: true },
    { id: 'bridge_crossing_east', a: { x: 51.3, z: 14.25 }, b: { x: 52.7, z: 14.25 }, intact: true },
  ],
  salivaSprings: [
    { x: 10.0, z: 20.0 },
    { x: 27.0, z: 10.5 },
    { x: 41.0, z: 19.5 },
    { x: 53.0, z: 10.0 },
  ],
  beaconDropSlots: [
    { x: 5.5, z: 10.0 },
    { x: 26.5, z: 19.0 },
    { x: 38.5, z: 11.0 },
    { x: 53.0, z: 19.5 },
  ],
  palette: {
    enamelBaseHex: 0xf3f6ff,
    pellicleSlimeHex: 0xe7b4f2,
    matureBiofilmHex: 0xa45cc7,
    gingivaHex: 0xe8687e,
    skyTopHex: 0x07071f,
    skyHorizonHex: 0x2a0f4f,
  },
};
