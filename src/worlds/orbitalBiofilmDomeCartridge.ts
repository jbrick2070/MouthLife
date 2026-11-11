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
export const orbitalBiofilmDomeCartridge: WorldCartridge = {
  id: 'world_5',
  title: 'Quorum Dome',
  subtitle: 'Station Aurora 408 km LEO • Honoring 1973 Skylab & 1978 Biofilm Theory',
  hostId: 'orbit_aurora',
  historyNoteIds: ['1973_skylab_orbit'],
  worldWidth: 64,
  worldDepth: 32,
  bChannelMode: 'epsArmor',
  parTimeSec: 330,
  basePellicleDensity: 0.5,
  baselinePh: 6.85,
  probeSpawn: { x: 7.5, z: 16.0 },
  challengeBlurb:
    'Zero-G quorum-sensing EPS domes deflect bristles! Slice domes open with Polymer Floss or blast them with Fluoride Surge, then sweep clean.',
  districts: [
    {
      id: 'cupola_incisor_deck',
      name: 'Cupola Incisor Deck',
      subtitle: 'First Quorum Dome & Polymer Floss Fracture',
      bounds: { minX: 2.5, maxX: 22.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'airlock_premolar_truss',
      name: 'Airlock Premolar Truss',
      subtitle: 'Zero-G Tether-Zips & Twin EPS Biofilm Domes',
      bounds: { minX: 22.0, maxX: 42.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'skylab_molar_bioreactor',
      name: 'Skylab Molar Bioreactor',
      subtitle: 'Fortress Quorum Dome & Fluoride Surge Breach',
      bounds: { minX: 42.0, maxX: 61.5, minZ: 4.5, maxZ: 27.5 },
    },
  ],
  playableMaskBoxes: [
    { minX: 3.0, maxX: 22.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 22.0, maxX: 42.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 42.0, maxX: 61.0, minZ: 5.0, maxZ: 27.0 },
  ],
  wallBoxes: [
    // Airlock Divider 1 (x≈25) — south zero-G tether airlock at z=21.0
    { minX: 23.59, maxX: 26.41, minZ: 4.5, maxZ: 17.6 },
    { minX: 23.59, maxX: 26.41, minZ: 24.4, maxZ: 27.5 },
    // Airlock Divider 2 (x≈39) — north zero-G tether airlock at z=11.0
    { minX: 37.59, maxX: 40.41, minZ: 4.5, maxZ: 7.6 },
    { minX: 37.59, maxX: 40.41, minZ: 14.4, maxZ: 27.5 },
  ],
  interdentalAlleys: [
    {
      id: 'alley_airlock_south',
      endpointA: { x: 23.2, z: 21.0 },
      endpointB: { x: 26.8, z: 21.0 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_airlock_south',
    },
    {
      id: 'alley_airlock_north',
      endpointA: { x: 37.2, z: 11.0 },
      endpointB: { x: 40.8, z: 11.0 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_airlock_north',
    },
    {
      id: 'alley_reactor_core',
      endpointA: { x: 48.3, z: 16.0 },
      endpointB: { x: 51.7, z: 16.0 },
      width: 0.9,
      wallThickness: 1.8,
      bridgeId: 'bridge_reactor_core',
    },
  ],
  marginBands: [
    { a: { x: 4.5, z: 6.0 }, b: { x: 20.5, z: 6.0 }, radius: 1.15, initialDensity: 0.82 },
    { a: { x: 44.5, z: 25.8 }, b: { x: 59.5, z: 25.8 }, radius: 1.2, initialDensity: 0.85 },
    { a: { x: 54.5, z: 9.5 }, b: { x: 54.5, z: 22.5 }, radius: 1.2, initialDensity: 0.86 },
  ],
  epsDomes: [
    { id: 'dome_cupola_d0', cx: 15.5, cz: 16.0, radius: 3.1, initialDensity: 0.86 },
    { id: 'dome_truss_d1_n', cx: 31.5, cz: 10.5, radius: 2.9, initialDensity: 0.86 },
    { id: 'dome_truss_d1_s', cx: 32.5, cz: 21.5, radius: 2.9, initialDensity: 0.86 },
    { id: 'dome_reactor_d2', cx: 55.0, cz: 16.0, radius: 3.6, initialDensity: 0.9 },
  ],
  heightCuspHills: [
    { cx: 12.5, cz: 16.0, radius: 10.5, height: 1.2 },
    { cx: 30.0, cz: 10.0, radius: 5.0, height: 1.5 },
    { cx: 30.0, cz: 22.0, radius: 5.0, height: 1.5 },
    { cx: 35.0, cz: 10.0, radius: 4.6, height: 1.4 },
    { cx: 35.0, cz: 22.0, radius: 4.6, height: 1.4 },
    { cx: 47.0, cz: 9.8, radius: 6.0, height: 2.2 },
    { cx: 57.5, cz: 9.8, radius: 6.2, height: 2.3 },
    { cx: 47.0, cz: 22.2, radius: 6.0, height: 2.2 },
    { cx: 57.5, cz: 22.2, radius: 6.2, height: 2.3 },
  ],
  commensalSiteSpawns: [
    { id: 'aurora_d0_1', pos: { x: 9.5, z: 10.5 }, districtIdx: 0 },
    { id: 'aurora_d0_2', pos: { x: 15.5, z: 16.0 }, districtIdx: 0 },
    { id: 'aurora_d0_3', pos: { x: 14.0, z: 22.5 }, districtIdx: 0 },
    { id: 'aurora_d1_1', pos: { x: 31.5, z: 10.5 }, districtIdx: 1 },
    { id: 'aurora_d1_2', pos: { x: 32.0, z: 16.0 }, districtIdx: 1 },
    { id: 'aurora_d1_3', pos: { x: 32.5, z: 21.5 }, districtIdx: 1 },
    { id: 'aurora_d2_1', pos: { x: 45.5, z: 10.5 }, districtIdx: 2 },
    { id: 'aurora_d2_2', pos: { x: 45.5, z: 21.5 }, districtIdx: 2 },
    { id: 'aurora_d2_3', pos: { x: 55.0, z: 16.0 }, districtIdx: 2 },
    { id: 'aurora_d2_4', pos: { x: 57.5, z: 10.5 }, districtIdx: 2 },
  ],
  sucroseSpawns: [
    { id: 'berry_bar_1', pos: { x: 18.5, z: 10.0 }, districtIdx: 0 },
    { id: 'berry_bar_2', pos: { x: 29.5, z: 22.0 }, districtIdx: 1 },
    { id: 'berry_bar_3', pos: { x: 34.5, z: 10.0 }, districtIdx: 1 },
    { id: 'berry_bar_4', pos: { x: 57.5, z: 21.5 }, districtIdx: 2 },
  ],
  biofilmBridges: [
    { id: 'bridge_airlock_south', a: { x: 25.0, z: 20.3 }, b: { x: 25.0, z: 21.7 }, intact: true },
    { id: 'bridge_airlock_north', a: { x: 39.0, z: 10.3 }, b: { x: 39.0, z: 11.7 }, intact: true },
    { id: 'bridge_reactor_core', a: { x: 50.0, z: 15.3 }, b: { x: 50.0, z: 16.7 }, intact: true },
  ],
  salivaSprings: [
    { x: 11.0, z: 21.0 },
    { x: 29.0, z: 14.0 },
    { x: 45.0, z: 16.0 },
    { x: 53.5, z: 10.0 },
  ],
  beaconDropSlots: [
    { x: 11.5, z: 12.5 },
    { x: 29.5, z: 19.0 },
    { x: 35.0, z: 16.0 },
    { x: 53.5, z: 22.0 },
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
