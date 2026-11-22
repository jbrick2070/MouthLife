import type { WorldCartridge } from '../engine/types';

/**
 * World 2 — New Orleans Evening Arch.
 * Honors Levi Spear Parmly's 1819 waxed-silk floss and Dr. Charles C. Bass's 1948 Tulane
 * 45° sulcus method. Signature `gumIrritation` challenge: tender gingival sulcus margins inflame
 * under heavy stationary scrubbing (coral flush → "tender" lockout) but clean beautifully with
 * gentle moving sweeps, while two staggered silk-contact dividers force Capillary Tether-Zips.
 *
 * Layout: the crescent. HYDRA-1 starts on the EAST side and travels west through three rooms: the
 * east divider's only gap is in the north, the west divider's is in the south, and a free-standing
 * ridge in the middle room bends the way between them into a curve.
 */
export const crescentSulcusCartridge: WorldCartridge = {
  id: 'world_2',
  title: 'Gumline Crescent',
  subtitle: 'New Orleans Evening Arch • Honoring 1819 Parmly & 1948 Bass',
  hostId: 'new_orleans',
  historyNoteIds: ['1819_1948_new_orleans'],
  worldWidth: 64,
  worldDepth: 32,
  bChannelMode: 'gumIrritation',
  parTimeSec: 300,
  basePellicleDensity: 0.5,
  baselinePh: 7.0,
  probeSpawn: { x: 56.5, z: 16.0 },
  probeSpawnFacingRad: Math.PI,
  challengeBlurb:
    'Sweep gently along the pink gumline. Scrubbing hard in one spot makes gums sore. Floss-zip the tight gaps!',
  districts: [
    {
      id: 'canine_sulcus_levee',
      name: 'Canine Gumline Bank',
      subtitle: 'Gentle 45° Bass Sweeps Along the Gumline',
      bounds: { minX: 2.5, maxX: 22.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'parmly_silk_row',
      name: 'Parmly Silk Contact Row',
      subtitle: 'Zig-Zag Gaps & Floss Zips',
      bounds: { minX: 22.0, maxX: 42.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'premolar_sulcus_bayou',
      name: 'Premolar Gumline Bayou',
      subtitle: 'Groove Cleaning & Sore Gum Edges',
      bounds: { minX: 42.0, maxX: 61.5, minZ: 4.5, maxZ: 27.5 },
    },
  ],
  playableMaskBoxes: [
    { minX: 3.0, maxX: 22.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 22.0, maxX: 42.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 42.0, maxX: 61.0, minZ: 5.0, maxZ: 27.0 },
  ],
  wallBoxes: [
    // East divider (x≈42), the first one met: its one silk contact is in the north, at z=10
    { minX: 40.59, maxX: 43.41, minZ: 4.5, maxZ: 6.7 },
    { minX: 40.59, maxX: 43.41, minZ: 13.3, maxZ: 27.5 },
    // West divider (x≈22): its one silk contact is in the south, at z=22
    { minX: 20.59, maxX: 23.41, minZ: 4.5, maxZ: 18.7 },
    { minX: 20.59, maxX: 23.41, minZ: 25.3, maxZ: 27.5 },
    // The crescent's ridge: stands free in the middle room, to be steered round
    { minX: 30.59, maxX: 33.41, minZ: 10.5, maxZ: 21.5 },
  ],
  interdentalAlleys: [
    {
      id: 'alley_silk_north',
      endpointA: { x: 40.2, z: 10.0 },
      endpointB: { x: 43.8, z: 10.0 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_silk_north',
    },
    {
      id: 'alley_silk_south',
      endpointA: { x: 20.2, z: 22.0 },
      endpointB: { x: 23.8, z: 22.0 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_silk_south',
    },
    {
      // A short crevice in the last (west) room: zip through it or steer round it
      id: 'alley_bayou_crevice',
      endpointA: { x: 10.3, z: 16.0 },
      endpointB: { x: 13.7, z: 16.0 },
      width: 0.9,
      wallThickness: 1.8,
      bridgeId: 'bridge_bayou',
    },
  ],
  marginBands: [
    // Premolar Bayou cruciform occlusal fissures
    { a: { x: 44.5, z: 16.0 }, b: { x: 59.0, z: 16.0 }, radius: 1.1, initialDensity: 0.84 },
    { a: { x: 53.0, z: 9.8 }, b: { x: 53.0, z: 22.2 }, radius: 1.1, initialDensity: 0.84 },
  ],
  sulcusBands: [
    // Tender gingival sulcus margins hugging the north & south gumlines
    { a: { x: 4.0, z: 26.2 }, b: { x: 21.0, z: 26.2 }, radius: 1.3, initialDensity: 0.82 },
    { a: { x: 4.0, z: 5.8 }, b: { x: 21.0, z: 5.8 }, radius: 1.2, initialDensity: 0.8 },
    { a: { x: 30.2, z: 26.2 }, b: { x: 33.8, z: 26.2 }, radius: 1.2, initialDensity: 0.8 },
    { a: { x: 43.0, z: 26.2 }, b: { x: 60.0, z: 26.2 }, radius: 1.3, initialDensity: 0.82 },
    { a: { x: 43.0, z: 5.8 }, b: { x: 60.0, z: 5.8 }, radius: 1.2, initialDensity: 0.8 },
  ],
  heightCuspHills: [
    // Pointed canine labial ridge
    { cx: 12.5, cz: 16.0, radius: 10.0, height: 1.5 },
    // Premolar cusps in the four corners of the middle room, and the ridge between them
    { cx: 26.8, cz: 10.0, radius: 4.6, height: 1.4 },
    { cx: 26.8, cz: 22.0, radius: 4.6, height: 1.4 },
    { cx: 32.0, cz: 12.5, radius: 3.8, height: 1.2 },
    { cx: 32.0, cz: 19.5, radius: 3.8, height: 1.2 },
    { cx: 37.2, cz: 10.0, radius: 4.6, height: 1.4 },
    { cx: 37.2, cz: 22.0, radius: 4.6, height: 1.4 },
    // Second premolar / molar cusps around the bayou basin
    { cx: 48.0, cz: 10.0, radius: 6.0, height: 2.0 },
    { cx: 56.5, cz: 10.0, radius: 6.0, height: 2.0 },
    { cx: 48.0, cz: 22.0, radius: 6.0, height: 2.0 },
    { cx: 56.5, cz: 22.0, radius: 6.0, height: 2.0 },
  ],
  commensalSiteSpawns: [
    { id: 'nola_d0_1', pos: { x: 9.0, z: 10.0 }, districtIdx: 0 },
    { id: 'nola_d0_2', pos: { x: 16.5, z: 21.5 }, districtIdx: 0 },
    { id: 'nola_d0_3', pos: { x: 17.5, z: 11.5 }, districtIdx: 0 },
    { id: 'nola_d1_1', pos: { x: 36.5, z: 8.0 }, districtIdx: 1 },
    { id: 'nola_d1_2', pos: { x: 27.0, z: 14.0 }, districtIdx: 1 },
    { id: 'nola_d1_3', pos: { x: 37.0, z: 23.0 }, districtIdx: 1 },
    { id: 'nola_d2_1', pos: { x: 48.0, z: 21.5 }, districtIdx: 2 },
    { id: 'nola_d2_2', pos: { x: 56.5, z: 9.0 }, districtIdx: 2 },
    { id: 'nola_d2_3', pos: { x: 57.0, z: 23.0 }, districtIdx: 2 },
    { id: 'nola_d2_4', pos: { x: 49.5, z: 12.5 }, districtIdx: 2 },
  ],
  sucroseSpawns: [
    { id: 'beignet_s1', pos: { x: 28.5, z: 24.0 }, districtIdx: 1 },
    { id: 'beignet_s2', pos: { x: 36.5, z: 15.5 }, districtIdx: 1 },
    { id: 'beignet_s3', pos: { x: 47.5, z: 17.0 }, districtIdx: 2 },
  ],
  biofilmBridges: [
    { id: 'bridge_silk_north', a: { x: 42.0, z: 9.3 }, b: { x: 42.0, z: 10.7 }, intact: true },
    { id: 'bridge_silk_south', a: { x: 22.0, z: 21.3 }, b: { x: 22.0, z: 22.7 }, intact: true },
    { id: 'bridge_bayou', a: { x: 12.0, z: 15.3 }, b: { x: 12.0, z: 16.7 }, intact: true },
  ],
  salivaSprings: [
    { x: 12.5, z: 21.5 },
    { x: 32.0, z: 7.5 },
    { x: 52.0, z: 10.5 },
  ],
  beaconDropSlots: [
    { x: 6.5, z: 13.0 },
    { x: 26.0, z: 20.5 },
    { x: 37.5, z: 12.0 },
    { x: 51.5, z: 20.0 },
  ],
  palette: {
    enamelBaseHex: 0xfff8f0,
    pellicleSlimeHex: 0xe8d27a,
    matureBiofilmHex: 0xb08a3a,
    gingivaHex: 0xe25d74,
    skyTopHex: 0x1a0c24,
    skyHorizonHex: 0x4b1d4f,
  },
};
