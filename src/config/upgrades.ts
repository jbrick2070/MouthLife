import type { UpgradeDef } from '../engine/types';

export const UPGRADE_CATALOG: readonly UpgradeDef[] = [
  {
    id: 'angled_bass_array',
    slot: 'brush',
    name: '45° Angled Bass Bristle Array',
    tagline: 'Widens sweep arc (95° → 130°) & boosts gumline/fissure shear +45%.',
    scientificNote:
      'Pioneered by Dr. Charles C. Bass at Tulane University (1948): angling soft filaments 45° into the gingival margin disrupts stubborn cervical plaque.',
    stampUnlockThreshold: 3,
    worldClearUnlockId: 'world_1',
    ionCost: 100,
  },
  {
    id: 'hydro_sonic_pulse',
    slot: 'brush',
    name: 'Hydro-Sonic Acoustic Streaming',
    tagline: 'Reduces gingival sulcus pressure buildup by 50% while sweeping.',
    scientificNote:
      'High-frequency bristle oscillation creates micro-bubbles and fluid shear forces slightly beyond physical filament tips without abrading soft tissue.',
    stampUnlockThreshold: 6,
    worldClearUnlockId: 'world_2',
    ionCost: 250,
  },
  {
    id: 'ptfe_ribbon_filament',
    slot: 'floss',
    name: 'Woven C-Contour Ribbon Filament',
    tagline: 'Widens interproximal shear swath +50% & boosts Surge charge +25%.',
    scientificNote:
      'Wrapping broad filament in a C-shape around each proximal tooth contour clears the full convex contact area rather than snapping straight into the papilla.',
    stampUnlockThreshold: 10,
    worldClearUnlockId: 'world_3',
    ionCost: 400,
  },
  {
    id: 'bicarb_buffer_jet',
    slot: 'rinse',
    name: 'Salivary Bicarbonate + F⁻ Infusion',
    tagline: 'Ion Rinse immediately stabilizes acidic zones at pH 7.15 for 8s.',
    scientificNote:
      'Salivary bicarbonate (HCO₃⁻) neutralizes bacterial lactic acid so calcium, phosphate, and fluoride ions can re-precipitate into fluorapatite.',
    stampUnlockThreshold: 15,
    worldClearUnlockId: 'world_4',
    ionCost: 600,
  },
];

export const UPGRADE_IDS = new Set(UPGRADE_CATALOG.map((u) => u.id));

export function getUpgradeById(id: string | null | undefined): UpgradeDef | undefined {
  if (!id) return undefined;
  return UPGRADE_CATALOG.find((u) => u.id === id);
}
