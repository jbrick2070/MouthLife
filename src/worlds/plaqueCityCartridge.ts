import type { WorldCartridge } from '../engine/types';

export const plaqueCityCartridge: WorldCartridge = {
  id: 'world_1',
  title: 'Plaque City',
  subtitle: 'Toronto Morning Arch • Honoring 1498 Beijing & 1683 Delft',
  hostId: 'toronto',
  historyNoteIds: ['1498_beijing_1683_delft'],
  worldWidth: 64,
  worldDepth: 32,
  bChannelMode: 'marginDensity',
  parTimeSec: 270,
  basePellicleDensity: 0.48,
  baselinePh: 7.0,
  probeSpawn: { x: 7.5, z: 16.0 },
  challengeBlurb:
    'Sweep the morning film off all 3 zones, Floss-zip the narrow gaps, and fire Surge to seal the molar grooves!',
  districts: [
    {
      id: 'incisor_terrace',
      name: 'Front Teeth Terrace',
      subtitle: 'Wide Sweeps & the Gumline',
      bounds: { minX: 2.5, maxX: 22.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'premolar_contacts',
      name: 'Premolar Gap Alleys',
      subtitle: 'Floss & Floss Zip',
      bounds: { minX: 22.0, maxX: 42.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'first_molar_basin',
      name: 'First Molar Bowl',
      subtitle: 'Clean Grooves, Stop Sugar & Fire Surge',
      bounds: { minX: 42.0, maxX: 61.5, minZ: 4.5, maxZ: 27.5 },
    },
  ],
  playableMaskBoxes: [
    { minX: 3.0, maxX: 22.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 22.0, maxX: 42.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 42.0, maxX: 61.0, minZ: 5.0, maxZ: 27.0 },
  ],
  wallBoxes: [
    // Central Premolar Contact Divider between x=30.5..33.5 leaving North/South 0.90u alleys
    { minX: 30.59, maxX: 33.41, minZ: 11.45, maxZ: 20.55 },
    // Outer cusp pillars in Premolar Alley framing the two interproximal channels
    { minX: 30.59, maxX: 33.41, minZ: 4.5, maxZ: 7.1 },
    { minX: 30.59, maxX: 33.41, minZ: 24.9, maxZ: 27.5 },
  ],
  interdentalAlleys: [
    {
      id: 'alley_premolar_north',
      endpointA: { x: 30.2, z: 10.5 },
      endpointB: { x: 33.8, z: 10.5 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_north',
    },
    {
      id: 'alley_premolar_south',
      endpointA: { x: 30.2, z: 21.5 },
      endpointB: { x: 33.8, z: 21.5 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_south',
    },
    {
      id: 'alley_molar_crevice',
      endpointA: { x: 43.2, z: 16.0 },
      endpointB: { x: 46.6, z: 16.0 },
      width: 0.9,
      wallThickness: 1.8,
      bridgeId: 'bridge_molar',
    },
  ],
  marginBands: [
    // Southern & Northern Gingival Cervical Margins
    { a: { x: 4, z: 26.2 }, b: { x: 21, z: 26.2 }, radius: 1.35, initialDensity: 0.85 },
    { a: { x: 4, z: 5.8 }, b: { x: 21, z: 5.8 }, radius: 1.15, initialDensity: 0.8 },
    // First Molar Cruciform Occlusal Fissure (Pits & Fissures)
    { a: { x: 47.5, z: 16.0 }, b: { x: 58.5, z: 16.0 }, radius: 1.25, initialDensity: 0.86 },
    { a: { x: 53.0, z: 9.5 }, b: { x: 53.0, z: 22.5 }, radius: 1.25, initialDensity: 0.86 },
  ],
  heightCuspHills: [
    // Incisor gentle labial crown convexity
    { cx: 12.5, cz: 16.0, radius: 11.0, height: 1.1 },
    // Twin Premolar buccal & lingual cusps
    { cx: 26.2, cz: 9.0, radius: 5.5, height: 1.6 },
    { cx: 26.2, cz: 23.0, radius: 5.5, height: 1.6 },
    { cx: 37.8, cz: 9.0, radius: 5.5, height: 1.6 },
    { cx: 37.8, cz: 23.0, radius: 5.5, height: 1.6 },
    // First Molar 4 anatomical cusps surrounding a central occlusal basin
    { cx: 49.0, cz: 10.0, radius: 6.2, height: 2.1 },
    { cx: 57.5, cz: 10.0, radius: 6.2, height: 2.1 },
    { cx: 49.0, cz: 22.0, radius: 6.2, height: 2.1 },
    { cx: 57.5, cz: 22.0, radius: 6.2, height: 2.1 },
  ],
  commensalSiteSpawns: [
    // District 0: 3 sites
    { id: 'site_d0_1', pos: { x: 10.5, z: 10.0 }, districtIdx: 0 },
    { id: 'site_d0_2', pos: { x: 14.5, z: 22.5 }, districtIdx: 0 },
    { id: 'site_d0_3', pos: { x: 19.0, z: 14.5 }, districtIdx: 0 },
    // District 1: 3 sites (1 west, 2 east of interproximal alleys!)
    { id: 'site_d1_1', pos: { x: 26.0, z: 16.0 }, districtIdx: 1 },
    { id: 'site_d1_2', pos: { x: 37.5, z: 11.0 }, districtIdx: 1 },
    { id: 'site_d1_3', pos: { x: 37.5, z: 21.0 }, districtIdx: 1 },
    // District 2: 4 sites across First Molar cusps
    { id: 'site_d2_1', pos: { x: 49.0, z: 10.5 }, districtIdx: 2 },
    { id: 'site_d2_2', pos: { x: 57.5, z: 10.5 }, districtIdx: 2 },
    { id: 'site_d2_3', pos: { x: 49.0, z: 21.5 }, districtIdx: 2 },
    { id: 'site_d2_4', pos: { x: 57.5, z: 21.5 }, districtIdx: 2 },
  ],
  sucroseSpawns: [
    { id: 'sucrose_p1', pos: { x: 28.0, z: 10.5 }, districtIdx: 1 },
    { id: 'sucrose_p2', pos: { x: 36.2, z: 21.5 }, districtIdx: 1 },
    { id: 'sucrose_m1', pos: { x: 53.0, z: 16.0 }, districtIdx: 2 },
    { id: 'sucrose_m2', pos: { x: 58.2, z: 16.0 }, districtIdx: 2 },
  ],
  biofilmBridges: [
    {
      id: 'bridge_north',
      a: { x: 31.8, z: 9.8 },
      b: { x: 31.8, z: 11.2 },
      intact: true,
    },
    {
      id: 'bridge_south',
      a: { x: 31.8, z: 20.8 },
      b: { x: 31.8, z: 22.2 },
      intact: true,
    },
    {
      id: 'bridge_molar',
      a: { x: 44.9, z: 15.3 },
      b: { x: 44.9, z: 16.7 },
      intact: true,
    },
  ],
  salivaSprings: [
    { x: 13.0, z: 16.0 },
    { x: 38.5, z: 16.0 },
    { x: 53.0, z: 11.5 },
  ],
  beaconDropSlots: [
    { x: 12.0, z: 19.0 },
    { x: 26.5, z: 13.0 },
    { x: 38.0, z: 18.0 },
    { x: 51.0, z: 18.5 },
  ],
  palette: {
    enamelBaseHex: 0xf4fbff,
    pellicleSlimeHex: 0xd9e35b,
    matureBiofilmHex: 0x9fb82c,
    gingivaHex: 0xe66c7e,
    skyTopHex: 0x051624,
    skyHorizonHex: 0x0f3b52,
  },
};
