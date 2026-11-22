import { HIBISCUS_EROSION_PH } from '../config/gameConfig';
import type { WorldCartridge } from '../engine/types';

/**
 * World 4 — Accra Coastal Marathon Arch & 1901–1945 Colorado Springs / Grand Rapids Fluoride Trail.
 * Honors West African *Salvadora persica* (Miswak) silica/fluoride chewing sticks and the discovery
 * that 1 ppm fluoride converts outer Hydroxyapatite (critical pH 5.5) into acid-resistant
 * Fluorapatite (critical pH 4.5).
 *
 * Signature challenge: tart spiced hibiscus *sobolo* washes hold erosion basins around pH 4.95 —
 * softening ordinary enamel against raw scrubbing, while Fluorapatite-infused bristles (from
 * Miswak-Saliva springs or Fluoride-Bicarb Surge) convert and polish right through the tart wash!
 */
/**
 * World 4 — Accra Coastal Arch. Layout: the shoreline. A long shore wall runs east-west: the beach
 * lies south of it, the lagoon north, and a jetty cuts a pocket off the lagoon's west end.
 * HYDRA-1 starts in the bottom-left corner. One gap leads NORTH from the beach into the pocket
 * (so the first zone can be finished first), the jetty's gap leads on into the lagoon, and a
 * second north-south gap at the far end leads back to the beach: a loop.
 */
export const fluorapatiteCoastCartridge: WorldCartridge = {
  id: 'world_4',
  title: 'Fluoride Coast',
  subtitle: 'Accra & Colorado Springs Arch • Honoring Miswak & the Fluoride Discovery',
  hostId: 'accra',
  historyNoteIds: ['1901_colorado_accra_miswak'],
  worldWidth: 64,
  worldDepth: 32,
  bChannelMode: 'localPh',
  parTimeSec: 315,
  basePellicleDensity: 0.48,
  baselinePh: 6.55,
  probeSpawn: { x: 7.5, z: 22.5 },
  erosionPulseIntervalSec: 14,
  challengeBlurb:
    'Tart hibiscus splashes turn the pools acid! Touch a Miswak spring or fire Surge to add fluoride. Fluoride enamel stands up to acid.',
  districts: [
    {
      id: 'accra_coastal_incisors',
      name: 'Labadi Beach Front Teeth',
      subtitle: 'Tart Splashes & Miswak Springs',
      bounds: { minX: 2.5, maxX: 24.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'miswak_fiber_contacts',
      name: 'Miswak Gaps',
      subtitle: 'Middle Gap Zip & Fluoride Armor',
      bounds: { minX: 24.0, maxX: 42.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'colorado_granite_molars',
      name: 'Pikes Peak Fluoride Molars',
      subtitle: 'Fluoride Shield Against Acid',
      bounds: { minX: 42.0, maxX: 61.5, minZ: 4.5, maxZ: 27.5 },
    },
  ],
  playableMaskBoxes: [
    { minX: 3.0, maxX: 24.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 24.0, maxX: 42.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 42.0, maxX: 61.0, minZ: 5.0, maxZ: 27.0 },
  ],
  wallBoxes: [
    // The shore wall (z≈16.5), east to west, in three pieces between its two gaps
    { minX: 2.5, maxX: 8.7, minZ: 15.09, maxZ: 17.91 },
    { minX: 15.3, maxX: 48.7, minZ: 15.09, maxZ: 17.91 },
    { minX: 55.3, maxX: 61.5, minZ: 15.09, maxZ: 17.91 },
    // The jetty (x≈24): from the north gum down to the shore wall, with one gap at z=10
    { minX: 22.59, maxX: 25.41, minZ: 4.5, maxZ: 6.7 },
    { minX: 22.59, maxX: 25.41, minZ: 13.3, maxZ: 15.2 },
  ],
  interdentalAlleys: [
    {
      id: 'alley_shore_west',
      endpointA: { x: 12.0, z: 14.7 },
      endpointB: { x: 12.0, z: 18.3 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_shore_west',
    },
    {
      id: 'alley_shore_east',
      endpointA: { x: 52.0, z: 14.7 },
      endpointB: { x: 52.0, z: 18.3 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_shore_east',
    },
    {
      id: 'alley_jetty',
      endpointA: { x: 22.2, z: 10.0 },
      endpointB: { x: 25.8, z: 10.0 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_jetty',
    },
  ],
  marginBands: [
    { a: { x: 4.5, z: 25.8 }, b: { x: 21.0, z: 25.8 }, radius: 1.15, initialDensity: 0.82 },
    // Molar grooves: one in the lagoon, one on the beach
    { a: { x: 46.5, z: 8.2 }, b: { x: 58.5, z: 8.2 }, radius: 1.2, initialDensity: 0.85 },
    { a: { x: 46.5, z: 24.2 }, b: { x: 58.5, z: 24.2 }, radius: 1.15, initialDensity: 0.85 },
  ],
  erosionZones: [
    { id: 'hibiscus_basin_d0', cx: 14.0, cz: 11.5, radius: 4.4, targetPh: HIBISCUS_EROSION_PH },
    { id: 'hibiscus_basin_d1', cx: 33.0, cz: 9.5, radius: 4.6, targetPh: HIBISCUS_EROSION_PH },
    { id: 'hibiscus_basin_d2_n', cx: 52.0, cz: 9.5, radius: 4.4, targetPh: HIBISCUS_EROSION_PH },
    { id: 'hibiscus_basin_d2_s', cx: 47.0, cz: 22.5, radius: 4.4, targetPh: HIBISCUS_EROSION_PH },
  ],
  heightCuspHills: [
    { cx: 12.0, cz: 10.0, radius: 7.0, height: 1.1 },
    { cx: 12.0, cz: 22.5, radius: 7.0, height: 1.1 },
    { cx: 29.5, cz: 9.5, radius: 5.2, height: 1.5 },
    { cx: 29.5, cz: 22.5, radius: 5.2, height: 1.5 },
    { cx: 37.5, cz: 9.5, radius: 5.2, height: 1.5 },
    { cx: 37.5, cz: 22.5, radius: 5.2, height: 1.5 },
    { cx: 48.0, cz: 9.5, radius: 5.8, height: 2.1 },
    { cx: 57.0, cz: 9.5, radius: 5.8, height: 2.1 },
    { cx: 48.0, cz: 22.5, radius: 5.8, height: 2.1 },
    { cx: 57.0, cz: 22.5, radius: 5.8, height: 2.1 },
  ],
  commensalSiteSpawns: [
    { id: 'accra_d0_1', pos: { x: 8.0, z: 8.5 }, districtIdx: 0 },
    { id: 'accra_d0_2', pos: { x: 18.0, z: 9.5 }, districtIdx: 0 },
    { id: 'accra_d0_3', pos: { x: 17.0, z: 23.0 }, districtIdx: 0 },
    { id: 'accra_d1_1', pos: { x: 28.5, z: 22.5 }, districtIdx: 1 },
    { id: 'accra_d1_2', pos: { x: 38.0, z: 21.0 }, districtIdx: 1 },
    { id: 'accra_d1_3', pos: { x: 37.5, z: 10.5 }, districtIdx: 1 },
    { id: 'accra_d2_1', pos: { x: 46.5, z: 11.0 }, districtIdx: 2 },
    { id: 'accra_d2_2', pos: { x: 57.5, z: 9.5 }, districtIdx: 2 },
    { id: 'accra_d2_3', pos: { x: 55.5, z: 23.5 }, districtIdx: 2 },
    { id: 'accra_d2_4', pos: { x: 57.0, z: 20.0 }, districtIdx: 2 },
  ],
  sucroseSpawns: [
    { id: 'sobolo_c1', pos: { x: 19.0, z: 12.5 }, districtIdx: 0 },
    { id: 'sobolo_c2', pos: { x: 29.5, z: 8.0 }, districtIdx: 1 },
    { id: 'sobolo_c3', pos: { x: 51.0, z: 24.5 }, districtIdx: 2 },
  ],
  biofilmBridges: [
    { id: 'bridge_shore_west', a: { x: 11.3, z: 16.5 }, b: { x: 12.7, z: 16.5 }, intact: true },
    { id: 'bridge_shore_east', a: { x: 51.3, z: 16.5 }, b: { x: 52.7, z: 16.5 }, intact: true },
    { id: 'bridge_jetty', a: { x: 24.0, z: 9.3 }, b: { x: 24.0, z: 10.7 }, intact: true },
  ],
  salivaSprings: [
    { x: 11.0, z: 20.5 },
    { x: 41.0, z: 8.0 },
    { x: 34.0, z: 23.5 },
    // in the pocket, beside its acid pool: the hint there says "touch a Miswak spring"
    { x: 10.5, z: 6.5 },
  ],
  beaconDropSlots: [
    { x: 6.0, z: 12.5 },
    { x: 24.5, z: 20.5 },
    { x: 41.5, z: 12.0 },
    { x: 54.0, z: 20.5 },
  ],
  palette: {
    enamelBaseHex: 0xfffaf2,
    pellicleSlimeHex: 0xf4a261,
    matureBiofilmHex: 0xc8553d,
    gingivaHex: 0xd95b72,
    skyTopHex: 0x1c0b1e,
    skyHorizonHex: 0x6b1d3a,
  },
};
