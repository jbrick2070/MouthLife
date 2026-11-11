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
export const fluorapatiteCoastCartridge: WorldCartridge = {
  id: 'world_4',
  title: 'Fluorapatite Coast',
  subtitle: 'Accra & Colorado Springs Arch • Honoring Miswak & 1901–1945 F⁻ Discovery',
  hostId: 'accra',
  historyNoteIds: ['1901_colorado_accra_miswak'],
  worldWidth: 64,
  worldDepth: 32,
  bChannelMode: 'localPh',
  parTimeSec: 315,
  basePellicleDensity: 0.48,
  baselinePh: 6.55,
  probeSpawn: { x: 7.5, z: 16.0 },
  erosionPulseIntervalSec: 14,
  challengeBlurb:
    'Tart hibiscus washes drop basins to pH 4.95! Touch Miswak-Saliva springs or Surge F⁻ to convert enamel into Fluorapatite (safe down to pH 4.5).',
  districts: [
    {
      id: 'accra_coastal_incisors',
      name: 'Labadi Coastal Incisors',
      subtitle: 'Tart Sobolo Washes & Miswak Saliva Springs',
      bounds: { minX: 2.5, maxX: 22.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'miswak_fiber_contacts',
      name: 'Miswak Fiber Contacts',
      subtitle: 'Central Contact Zip & Fluorapatite Lattice Conversion',
      bounds: { minX: 22.0, maxX: 42.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'colorado_granite_molars',
      name: 'Pikes Peak Fluoride Molars',
      subtitle: '1 ppm Fluorapatite Shield Against Acid Erosion',
      bounds: { minX: 42.0, maxX: 61.5, minZ: 4.5, maxZ: 27.5 },
    },
  ],
  playableMaskBoxes: [
    { minX: 3.0, maxX: 22.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 22.0, maxX: 42.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 42.0, maxX: 61.0, minZ: 5.0, maxZ: 27.0 },
  ],
  wallBoxes: [
    // Divider 1 (x≈22) — central Miswak contact alley at z=16.0
    { minX: 20.59, maxX: 23.41, minZ: 4.5, maxZ: 12.6 },
    { minX: 20.59, maxX: 23.41, minZ: 19.4, maxZ: 27.5 },
    // Divider 2 (x≈42) — twin granite-spring contacts at z=10.5 and z=21.5
    { minX: 40.59, maxX: 43.41, minZ: 4.5, maxZ: 7.1 },
    { minX: 40.59, maxX: 43.41, minZ: 11.45, maxZ: 20.55 },
    { minX: 40.59, maxX: 43.41, minZ: 24.9, maxZ: 27.5 },
  ],
  interdentalAlleys: [
    {
      id: 'alley_coastal_central',
      endpointA: { x: 20.2, z: 16.0 },
      endpointB: { x: 23.8, z: 16.0 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_coastal_central',
    },
    {
      id: 'alley_granite_north',
      endpointA: { x: 40.2, z: 10.5 },
      endpointB: { x: 43.8, z: 10.5 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_granite_north',
    },
    {
      id: 'alley_granite_south',
      endpointA: { x: 40.2, z: 21.5 },
      endpointB: { x: 43.8, z: 21.5 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_granite_south',
    },
  ],
  marginBands: [
    { a: { x: 4.5, z: 25.8 }, b: { x: 19.0, z: 25.8 }, radius: 1.15, initialDensity: 0.82 },
    { a: { x: 46.5, z: 16.0 }, b: { x: 58.5, z: 16.0 }, radius: 1.2, initialDensity: 0.85 },
    { a: { x: 52.5, z: 9.5 }, b: { x: 52.5, z: 22.5 }, radius: 1.15, initialDensity: 0.85 },
  ],
  erosionZones: [
    { id: 'hibiscus_basin_d0', cx: 14.0, cz: 11.5, radius: 4.4, targetPh: HIBISCUS_EROSION_PH },
    { id: 'hibiscus_basin_d1', cx: 32.0, cz: 16.0, radius: 5.0, targetPh: HIBISCUS_EROSION_PH },
    { id: 'hibiscus_basin_d2_n', cx: 52.0, cz: 11.0, radius: 4.6, targetPh: HIBISCUS_EROSION_PH },
    { id: 'hibiscus_basin_d2_s', cx: 52.0, cz: 21.0, radius: 4.6, targetPh: HIBISCUS_EROSION_PH },
  ],
  heightCuspHills: [
    { cx: 12.0, cz: 16.0, radius: 10.5, height: 1.1 },
    { cx: 28.0, cz: 10.0, radius: 5.2, height: 1.5 },
    { cx: 28.0, cz: 22.0, radius: 5.2, height: 1.5 },
    { cx: 36.0, cz: 10.0, radius: 5.2, height: 1.5 },
    { cx: 36.0, cz: 22.0, radius: 5.2, height: 1.5 },
    { cx: 48.0, cz: 9.8, radius: 6.0, height: 2.1 },
    { cx: 57.0, cz: 9.8, radius: 6.0, height: 2.1 },
    { cx: 48.0, cz: 22.2, radius: 6.0, height: 2.1 },
    { cx: 57.0, cz: 22.2, radius: 6.0, height: 2.1 },
  ],
  commensalSiteSpawns: [
    { id: 'accra_d0_1', pos: { x: 8.5, z: 10.5 }, districtIdx: 0 },
    { id: 'accra_d0_2', pos: { x: 14.5, z: 11.5 }, districtIdx: 0 },
    { id: 'accra_d0_3', pos: { x: 15.5, z: 21.5 }, districtIdx: 0 },
    { id: 'accra_d1_1', pos: { x: 27.5, z: 20.5 }, districtIdx: 1 },
    { id: 'accra_d1_2', pos: { x: 32.0, z: 16.0 }, districtIdx: 1 },
    { id: 'accra_d1_3', pos: { x: 36.5, z: 10.5 }, districtIdx: 1 },
    { id: 'accra_d2_1', pos: { x: 48.5, z: 10.5 }, districtIdx: 2 },
    { id: 'accra_d2_2', pos: { x: 56.5, z: 10.5 }, districtIdx: 2 },
    { id: 'accra_d2_3', pos: { x: 48.5, z: 21.5 }, districtIdx: 2 },
    { id: 'accra_d2_4', pos: { x: 56.5, z: 21.5 }, districtIdx: 2 },
  ],
  sucroseSpawns: [
    { id: 'sobolo_c1', pos: { x: 16.5, z: 10.0 }, districtIdx: 0 },
    { id: 'sobolo_c2', pos: { x: 32.0, z: 9.5 }, districtIdx: 1 },
    { id: 'sobolo_c3', pos: { x: 55.5, z: 16.0 }, districtIdx: 2 },
  ],
  biofilmBridges: [
    { id: 'bridge_coastal_central', a: { x: 22.0, z: 15.3 }, b: { x: 22.0, z: 16.7 }, intact: true },
    { id: 'bridge_granite_north', a: { x: 42.0, z: 9.8 }, b: { x: 42.0, z: 11.2 }, intact: true },
    { id: 'bridge_granite_south', a: { x: 42.0, z: 20.8 }, b: { x: 42.0, z: 22.2 }, intact: true },
  ],
  salivaSprings: [
    { x: 11.0, z: 20.5 },
    { x: 27.5, z: 10.0 },
    { x: 36.5, z: 22.0 },
    { x: 48.0, z: 16.0 },
  ],
  beaconDropSlots: [
    { x: 11.5, z: 13.5 },
    { x: 28.0, z: 15.5 },
    { x: 36.0, z: 16.5 },
    { x: 53.5, z: 16.0 },
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
