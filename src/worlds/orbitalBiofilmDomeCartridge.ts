import type { WorldCartridge } from '../engine/types';

/**
 * World 5 — Station Aurora (408 km Low-Earth Orbit).
 * Honors NASA's 1973 Skylab oral microbiology studies and J.W. Costerton's 1978 theory of
 * cooperative EPS-armored biofilms.
 *
 * Signature `epsArmor` challenge: in low-shear microgravity saliva, quorum-sensing EPS biofilm
 * domes encase key occlusal colonies and deflect raw Sonic Bristles. Players must fracture each
 * dome with a high-shear Polymer Floss slice or a Fluoride-Bicarb Surge wave before sweeping clean!
 */
/**
 * World 5 — Station Aurora. Layout: the ring. A walled core sits in the middle of the tooth and the
 * rest is one open ring round it. HYDRA-1 starts top-right and circles the ring; the core is
 * reached only by floss, through a north-south gap in its north wall or its south wall. The twin
 * slime domes are inside the core.
 *
 * Every dome stands well clear of the gap mouths: a Floss cast within reach of a mouth zips through
 * the gap, so a dome beside one could never be cut open from there.
 */
export const orbitalBiofilmDomeCartridge: WorldCartridge = {
  id: 'world_5',
  title: 'Slime Dome',
  subtitle: 'Station Aurora in Orbit • Honoring 1973 Skylab & 1978 Germ-Slime Science',
  hostId: 'orbit_aurora',
  historyNoteIds: ['1973_skylab_orbit'],
  worldWidth: 64,
  worldDepth: 32,
  bChannelMode: 'epsArmor',
  parTimeSec: 330,
  basePellicleDensity: 0.5,
  baselinePh: 6.85,
  probeSpawn: { x: 56.0, z: 8.5 },
  probeSpawnFacingRad: Math.PI,
  challengeBlurb:
    'In space, slime domes block the brush! Cut them open with Floss or blast them with Surge, then sweep clean.',
  districts: [
    {
      id: 'cupola_incisor_deck',
      name: 'Cupola Front-Tooth Deck',
      subtitle: 'First Slime Dome & Floss Cut',
      bounds: { minX: 2.5, maxX: 19.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'airlock_premolar_truss',
      name: 'Airlock Premolar Bridge',
      subtitle: 'Space Floss Zips & Twin Slime Domes',
      bounds: { minX: 19.0, maxX: 45.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'skylab_molar_bioreactor',
      name: 'Skylab Molar Lab',
      subtitle: 'Big Slime Dome & Surge Blast',
      bounds: { minX: 45.0, maxX: 61.5, minZ: 4.5, maxZ: 27.5 },
    },
  ],
  playableMaskBoxes: [
    { minX: 3.0, maxX: 19.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 19.0, maxX: 45.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 45.0, maxX: 61.0, minZ: 5.0, maxZ: 27.0 },
  ],
  wallBoxes: [
    // The core's north wall (z 9.8-12), either side of its gap at x=32
    { minX: 21.0, maxX: 28.7, minZ: 9.8, maxZ: 12.0 },
    { minX: 35.3, maxX: 43.0, minZ: 9.8, maxZ: 12.0 },
    // South wall (z 20-22.2)
    { minX: 21.0, maxX: 28.7, minZ: 20.0, maxZ: 22.2 },
    { minX: 35.3, maxX: 43.0, minZ: 20.0, maxZ: 22.2 },
    // West wall (x 21-23.2) and east wall (x 40.8-43): solid
    { minX: 21.0, maxX: 23.2, minZ: 9.8, maxZ: 22.2 },
    { minX: 40.8, maxX: 43.0, minZ: 9.8, maxZ: 22.2 },
  ],
  interdentalAlleys: [
    {
      id: 'alley_core_north',
      endpointA: { x: 32.0, z: 9.41 },
      endpointB: { x: 32.0, z: 12.39 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_core_north',
    },
    {
      id: 'alley_core_south',
      endpointA: { x: 32.0, z: 19.61 },
      endpointB: { x: 32.0, z: 22.59 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_core_south',
    },
  ],
  marginBands: [
    { a: { x: 4.5, z: 6.0 }, b: { x: 17.5, z: 6.0 }, radius: 1.15, initialDensity: 0.82 },
    { a: { x: 46.5, z: 25.8 }, b: { x: 59.5, z: 25.8 }, radius: 1.2, initialDensity: 0.85 },
    { a: { x: 47.5, z: 10.5 }, b: { x: 47.5, z: 22.5 }, radius: 1.2, initialDensity: 0.86 },
  ],
  epsDomes: [
    { id: 'dome_cupola_d0', cx: 15.5, cz: 16.0, radius: 3.1, initialDensity: 0.86 },
    // The twin domes, inside the core
    { id: 'dome_truss_d1_n', cx: 27.0, cz: 16.0, radius: 2.9, initialDensity: 0.86 },
    { id: 'dome_truss_d1_s', cx: 37.0, cz: 16.0, radius: 2.9, initialDensity: 0.86 },
    { id: 'dome_reactor_d2', cx: 55.0, cz: 16.0, radius: 3.6, initialDensity: 0.9 },
  ],
  heightCuspHills: [
    { cx: 11.5, cz: 16.0, radius: 10.0, height: 1.2 },
    // The ring north and south of the core
    { cx: 27.0, cz: 7.2, radius: 4.4, height: 1.2 },
    { cx: 37.0, cz: 7.2, radius: 4.4, height: 1.2 },
    { cx: 27.0, cz: 24.8, radius: 4.4, height: 1.2 },
    { cx: 37.0, cz: 24.8, radius: 4.4, height: 1.2 },
    // The core's floor
    { cx: 32.0, cz: 16.0, radius: 7.5, height: 1.5 },
    { cx: 52.0, cz: 9.8, radius: 6.2, height: 2.2 },
    { cx: 52.0, cz: 22.2, radius: 6.2, height: 2.2 },
    { cx: 58.0, cz: 16.0, radius: 5.5, height: 2.3 },
  ],
  commensalSiteSpawns: [
    { id: 'aurora_d0_1', pos: { x: 9.5, z: 9.5 }, districtIdx: 0 },
    { id: 'aurora_d0_2', pos: { x: 15.5, z: 16.0 }, districtIdx: 0 },
    { id: 'aurora_d0_3', pos: { x: 9.5, z: 23.0 }, districtIdx: 0 },
    { id: 'aurora_d1_1', pos: { x: 27.0, z: 16.0 }, districtIdx: 1 },
    { id: 'aurora_d1_2', pos: { x: 37.0, z: 16.0 }, districtIdx: 1 },
    { id: 'aurora_d1_3', pos: { x: 26.0, z: 7.2 }, districtIdx: 1 },
    { id: 'aurora_d2_1', pos: { x: 49.0, z: 8.0 }, districtIdx: 2 },
    { id: 'aurora_d2_2', pos: { x: 48.0, z: 24.0 }, districtIdx: 2 },
    { id: 'aurora_d2_3', pos: { x: 55.0, z: 16.0 }, districtIdx: 2 },
    { id: 'aurora_d2_4', pos: { x: 58.0, z: 24.0 }, districtIdx: 2 },
  ],
  sucroseSpawns: [
    { id: 'berry_bar_1', pos: { x: 7.5, z: 16.5 }, districtIdx: 0 },
    { id: 'berry_bar_2', pos: { x: 38.5, z: 25.0 }, districtIdx: 1 },
    { id: 'berry_bar_3', pos: { x: 32.0, z: 16.0 }, districtIdx: 1 },
    { id: 'berry_bar_4', pos: { x: 58.5, z: 20.5 }, districtIdx: 2 },
  ],
  biofilmBridges: [
    { id: 'bridge_core_north', a: { x: 31.3, z: 10.9 }, b: { x: 32.7, z: 10.9 }, intact: true },
    { id: 'bridge_core_south', a: { x: 31.3, z: 21.1 }, b: { x: 32.7, z: 21.1 }, intact: true },
  ],
  salivaSprings: [
    { x: 6.0, z: 20.5 },
    { x: 38.0, z: 7.0 },
    { x: 26.0, z: 25.0 },
    { x: 46.5, z: 13.5 },
  ],
  beaconDropSlots: [
    { x: 12.0, z: 8.0 },
    { x: 32.0, z: 13.4 },
    { x: 32.0, z: 25.0 },
    { x: 52.5, z: 23.0 },
  ],
  palette: {
    enamelBaseHex: 0xf2f9ff,
    pellicleSlimeHex: 0x6ee7b7,
    matureBiofilmHex: 0x059669,
    gingivaHex: 0xd9607b,
    skyTopHex: 0x030712,
    skyHorizonHex: 0x063940,
  },
};
