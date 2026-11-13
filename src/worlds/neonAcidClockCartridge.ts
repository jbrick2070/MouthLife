import type { WorldCartridge } from '../engine/types';

/**
 * World 3 — Tokyo Studio Arch (with the 1940 Chicago lab).
 * Honors Dr. Robert M. Stephan's pH electrode measurements. Signature `localPh` challenge:
 * while any Sucrose "soda sip" crystal stands, a sweet sip fires every 22 s and the whole arch
 * plunges below the critical pH 5.5 line — brushing is acid-shielded until Salivary springs,
 * a Fluoride-Bicarb Surge, or shattering every crystal ends the acid clock.
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
  probeSpawn: { x: 7.5, z: 16.0 },
  stephanSipIntervalSec: 22,
  challengeBlurb:
    'Every soda sip restarts the acid clock. Smash the sugar, hit Saliva springs, and fire Surge so it is safe to brush!',
  districts: [
    {
      id: 'shibuya_incisor_stage',
      name: 'Shibuya Front-Tooth Stage',
      subtitle: 'Broad Sweeps Between Sweet Sips',
      bounds: { minX: 2.5, maxX: 22.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'studio_mixing_contacts',
      name: 'Studio Desk Gaps',
      subtitle: 'Gap Zips & Soda Sips',
      bounds: { minX: 22.0, maxX: 42.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'chicago_molar_lab',
      name: 'Chicago Molar Acid Lab',
      subtitle: 'Acid Grooves & Saliva Buffer',
      bounds: { minX: 42.0, maxX: 61.5, minZ: 4.5, maxZ: 27.5 },
    },
  ],
  playableMaskBoxes: [
    { minX: 3.0, maxX: 22.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 22.0, maxX: 42.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 42.0, maxX: 61.0, minZ: 5.0, maxZ: 27.0 },
  ],
  wallBoxes: [
    { minX: 30.59, maxX: 33.41, minZ: 11.45, maxZ: 20.55 },
    { minX: 30.59, maxX: 33.41, minZ: 4.5, maxZ: 7.1 },
    { minX: 30.59, maxX: 33.41, minZ: 24.9, maxZ: 27.5 },
  ],
  interdentalAlleys: [
    {
      id: 'alley_mixdesk_north',
      endpointA: { x: 30.2, z: 10.5 },
      endpointB: { x: 33.8, z: 10.5 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_mix_north',
    },
    {
      id: 'alley_mixdesk_south',
      endpointA: { x: 30.2, z: 21.5 },
      endpointB: { x: 33.8, z: 21.5 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_mix_south',
    },
    {
      id: 'alley_lab_crevice',
      endpointA: { x: 43.2, z: 16.0 },
      endpointB: { x: 46.6, z: 16.0 },
      width: 0.9,
      wallThickness: 1.8,
      bridgeId: 'bridge_lab',
    },
  ],
  marginBands: [
    { a: { x: 4.0, z: 26.2 }, b: { x: 21.0, z: 26.2 }, radius: 1.2, initialDensity: 0.82 },
    { a: { x: 47.5, z: 16.0 }, b: { x: 58.5, z: 16.0 }, radius: 1.2, initialDensity: 0.86 },
    { a: { x: 53.0, z: 9.5 }, b: { x: 53.0, z: 22.5 }, radius: 1.2, initialDensity: 0.86 },
  ],
  heightCuspHills: [
    { cx: 12.5, cz: 16.0, radius: 11.0, height: 1.0 },
    { cx: 26.2, cz: 9.0, radius: 5.5, height: 1.5 },
    { cx: 26.2, cz: 23.0, radius: 5.5, height: 1.5 },
    { cx: 37.8, cz: 9.0, radius: 5.5, height: 1.5 },
    { cx: 37.8, cz: 23.0, radius: 5.5, height: 1.5 },
    { cx: 49.0, cz: 10.0, radius: 6.2, height: 2.2 },
    { cx: 57.5, cz: 10.0, radius: 6.2, height: 2.2 },
    { cx: 49.0, cz: 22.0, radius: 6.2, height: 2.2 },
    { cx: 57.5, cz: 22.0, radius: 6.2, height: 2.2 },
  ],
  commensalSiteSpawns: [
    { id: 'tokyo_d0_1', pos: { x: 8.0, z: 10.0 }, districtIdx: 0 },
    { id: 'tokyo_d0_2', pos: { x: 12.0, z: 22.0 }, districtIdx: 0 },
    { id: 'tokyo_d0_3', pos: { x: 19.0, z: 16.0 }, districtIdx: 0 },
    { id: 'tokyo_d1_1', pos: { x: 26.0, z: 16.0 }, districtIdx: 1 },
    { id: 'tokyo_d1_2', pos: { x: 37.5, z: 16.0 }, districtIdx: 1 },
    { id: 'tokyo_d1_3', pos: { x: 26.5, z: 7.5 }, districtIdx: 1 },
    { id: 'tokyo_d2_1', pos: { x: 49.0, z: 10.5 }, districtIdx: 2 },
    { id: 'tokyo_d2_2', pos: { x: 57.5, z: 10.5 }, districtIdx: 2 },
    { id: 'tokyo_d2_3', pos: { x: 49.0, z: 21.5 }, districtIdx: 2 },
    { id: 'tokyo_d2_4', pos: { x: 57.5, z: 21.5 }, districtIdx: 2 },
  ],
  sucroseSpawns: [
    { id: 'soda_sip_1', pos: { x: 17.0, z: 9.0 }, districtIdx: 0 },
    { id: 'soda_sip_2', pos: { x: 27.0, z: 22.0 }, districtIdx: 1 },
    { id: 'soda_sip_3', pos: { x: 37.0, z: 10.0 }, districtIdx: 1 },
    { id: 'soda_sip_4', pos: { x: 55.0, z: 16.0 }, districtIdx: 2 },
  ],
  biofilmBridges: [
    { id: 'bridge_mix_north', a: { x: 31.8, z: 9.8 }, b: { x: 31.8, z: 11.2 }, intact: true },
    { id: 'bridge_mix_south', a: { x: 31.8, z: 20.8 }, b: { x: 31.8, z: 22.2 }, intact: true },
    { id: 'bridge_lab', a: { x: 44.9, z: 15.3 }, b: { x: 44.9, z: 16.7 }, intact: true },
  ],
  salivaSprings: [
    { x: 10.0, z: 20.0 },
    { x: 27.0, z: 11.0 },
    { x: 37.5, z: 21.0 },
    { x: 50.5, z: 16.0 },
  ],
  beaconDropSlots: [
    { x: 13.0, z: 13.0 },
    { x: 26.0, z: 19.5 },
    { x: 38.5, z: 13.0 },
    { x: 53.0, z: 20.0 },
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
