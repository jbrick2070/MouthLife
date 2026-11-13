import type { UpgradeDef } from '../engine/types';

export const UPGRADE_CATALOG: readonly UpgradeDef[] = [
  {
    id: 'angled_bass_array',
    slot: 'brush',
    name: '45° Angled Bristles',
    tagline: 'Wider brush sweep. Cleans the gumline and grooves much better.',
    scientificNote:
      'Dr. Charles Bass showed in 1948 that tilting soft bristles 45° toward the gumline lifts off stubborn plaque.',
    stampUnlockThreshold: 3,
    worldClearUnlockId: 'world_1',
    ionCost: 100,
  },
  {
    id: 'hydro_sonic_pulse',
    slot: 'brush',
    name: 'Hydro-Sonic Bubbles',
    tagline: 'Longer brush reach, better groove cleaning, and half the gum pressure.',
    scientificNote:
      'Fast bristle shaking makes tiny bubbles. They clean a little past the bristle tips without hurting gums.',
    stampUnlockThreshold: 6,
    worldClearUnlockId: 'world_2',
    ionCost: 250,
  },
  {
    id: 'ptfe_ribbon_filament',
    slot: 'floss',
    name: 'Wide C-Shape Ribbon Floss',
    tagline: 'Floss cleans a wider path and charges Surge faster.',
    scientificNote:
      'Wrapping wide floss in a C-shape around each tooth cleans the whole side, and it doesn’t snap into the gum.',
    stampUnlockThreshold: 10,
    worldClearUnlockId: 'world_3',
    ionCost: 400,
  },
  {
    id: 'bicarb_buffer_jet',
    slot: 'rinse',
    name: 'Spit Buffer + Fluoride Boost',
    tagline: 'Rinse washes acid off nearby enamel.',
    scientificNote:
      'A buffer from your spit cancels germ acid. Then minerals and fluoride can rebuild the enamel.',
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
