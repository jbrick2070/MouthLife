import type { WorldCartridge } from '../engine/types';

/**
 * World 2 — New Orleans Evening Arch.
 * Honors Levi Spear Parmly's 1819 waxed-silk floss and Dr. Charles C. Bass's 1948 Tulane
 * 45° sulcus method. Signature `gumIrritation` challenge: tender gingival sulcus margins inflame
 * under heavy stationary scrubbing (coral flush → "tender" lockout) but clean beautifully with
 * gentle moving sweeps, while two staggered silk-contact dividers force Capillary Tether-Zips.
 */
export const crescentSulcusCartridge: WorldCartridge = {
  id: 'world_2',
  title: 'Crescent Sulcus',
  subtitle: 'New Orleans Evening Arch • Honoring 1819 Parmly & 1948 Bass',
  hostId: 'new_orleans',
  historyNoteIds: ['1819_1948_new_orleans'],
  worldWidth: 64,
  worldDepth: 32,
  bChannelMode: 'gumIrritation',
  parTimeSec: 300,
  basePellicleDensity: 0.5,
  baselinePh: 7.0,
  probeSpawn: { x: 7.5, z: 16.0 },
  challengeBlurb:
    'Gentle moving sweeps along the coral sulcus — heavy stationary scrubbing inflames tender gums. Silk-zip the staggered contacts!',
  districts: [
    {
      id: 'canine_sulcus_levee',
      name: 'Canine Sulcus Levee',
      subtitle: 'Gentle 45° Bass Sweeps Along the Gumline',
      bounds: { minX: 2.5, maxX: 22.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'parmly_silk_row',
      name: 'Parmly Silk Contact Row',
      subtitle: 'Staggered Interproximal Contacts & Capillary Zips',
      bounds: { minX: 22.0, maxX: 42.0, minZ: 4.5, maxZ: 27.5 },
    },
    {
      id: 'premolar_sulcus_bayou',
      name: 'Premolar Sulcus Bayou',
      subtitle: 'Fissure Disruption & Tender Cervical Margins',
      bounds: { minX: 42.0, maxX: 61.5, minZ: 4.5, maxZ: 27.5 },
    },
  ],
  playableMaskBoxes: [
    { minX: 3.0, maxX: 22.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 22.0, maxX: 42.0, minZ: 5.0, maxZ: 27.0 },
    { minX: 42.0, maxX: 61.0, minZ: 5.0, maxZ: 27.0 },
  ],
  wallBoxes: [
    // Contact Divider 1 (x≈28) — single north silk contact at z=9.5
    { minX: 26.59, maxX: 29.41, minZ: 4.5, maxZ: 6.1 },
    { minX: 26.59, maxX: 29.41, minZ: 12.9, maxZ: 27.5 },
    // Contact Divider 2 (x≈36) — single south silk contact at z=22.5
    { minX: 34.59, maxX: 37.41, minZ: 4.5, maxZ: 19.1 },
    { minX: 34.59, maxX: 37.41, minZ: 25.9, maxZ: 27.5 },
  ],
  interdentalAlleys: [
    {
      id: 'alley_silk_north',
      endpointA: { x: 26.2, z: 9.5 },
      endpointB: { x: 29.8, z: 9.5 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_silk_north',
    },
    {
      id: 'alley_silk_south',
      endpointA: { x: 34.2, z: 22.5 },
      endpointB: { x: 37.8, z: 22.5 },
      width: 0.9,
      wallThickness: 2.95,
      bridgeId: 'bridge_silk_south',
    },
    {
      id: 'alley_bayou_crevice',
      endpointA: { x: 47.2, z: 16.0 },
      endpointB: { x: 50.6, z: 16.0 },
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
    // Premolar buccal/lingual cusps either side of each silk contact
    { cx: 24.4, cz: 11.0, radius: 4.4, height: 1.4 },
    { cx: 24.4, cz: 21.0, radius: 4.4, height: 1.4 },
    { cx: 32.0, cz: 12.0, radius: 3.8, height: 1.2 },
    { cx: 32.0, cz: 20.0, radius: 3.8, height: 1.2 },
    { cx: 39.6, cz: 11.0, radius: 4.4, height: 1.4 },
    { cx: 39.6, cz: 21.0, radius: 4.4, height: 1.4 },
    // Second premolar / molar cusps around the bayou basin
    { cx: 47.0, cz: 10.0, radius: 6.0, height: 2.0 },
    { cx: 56.5, cz: 10.0, radius: 6.0, height: 2.0 },
    { cx: 47.0, cz: 22.0, radius: 6.0, height: 2.0 },
    { cx: 56.5, cz: 22.0, radius: 6.0, height: 2.0 },
  ],
  commensalSiteSpawns: [
    { id: 'nola_d0_1', pos: { x: 9.0, z: 11.0 }, districtIdx: 0 },
    { id: 'nola_d0_2', pos: { x: 15.0, z: 21.0 }, districtIdx: 0 },
    { id: 'nola_d0_3', pos: { x: 19.5, z: 14.0 }, districtIdx: 0 },
    { id: 'nola_d1_1', pos: { x: 24.5, z: 18.0 }, districtIdx: 1 },
    { id: 'nola_d1_2', pos: { x: 32.0, z: 16.0 }, districtIdx: 1 },
    { id: 'nola_d1_3', pos: { x: 39.5, z: 12.0 }, districtIdx: 1 },
    { id: 'nola_d2_1', pos: { x: 47.0, z: 10.0 }, districtIdx: 2 },
    { id: 'nola_d2_2', pos: { x: 56.0, z: 10.0 }, districtIdx: 2 },
    { id: 'nola_d2_3', pos: { x: 47.0, z: 22.0 }, districtIdx: 2 },
    { id: 'nola_d2_4', pos: { x: 56.0, z: 22.0 }, districtIdx: 2 },
  ],
  sucroseSpawns: [
    { id: 'beignet_s1', pos: { x: 24.5, z: 10.0 }, districtIdx: 1 },
    { id: 'beignet_s2', pos: { x: 39.5, z: 22.0 }, districtIdx: 1 },
    { id: 'beignet_s3', pos: { x: 54.5, z: 16.0 }, districtIdx: 2 },
  ],
  biofilmBridges: [
    { id: 'bridge_silk_north', a: { x: 28.0, z: 8.8 }, b: { x: 28.0, z: 10.2 }, intact: true },
    { id: 'bridge_silk_south', a: { x: 36.0, z: 21.8 }, b: { x: 36.0, z: 23.2 }, intact: true },
    { id: 'bridge_bayou', a: { x: 48.9, z: 15.3 }, b: { x: 48.9, z: 16.7 }, intact: true },
  ],
  salivaSprings: [
    { x: 12.5, z: 21.5 },
    { x: 32.0, z: 9.0 },
    { x: 52.0, z: 10.5 },
  ],
  beaconDropSlots: [
    { x: 11.0, z: 10.0 },
    { x: 24.0, z: 22.5 },
    { x: 32.0, z: 22.0 },
    { x: 51.0, z: 20.0 },
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
