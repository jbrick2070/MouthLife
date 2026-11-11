import type { WorldCartridge } from '../engine/types';
import { crescentSulcusCartridge } from './crescentSulcusCartridge';
import { neonAcidClockCartridge } from './neonAcidClockCartridge';
import { plaqueCityCartridge } from './plaqueCityCartridge';
import { pulpRescueCartridge } from './pulpRescueCartridge';

export const PLAYABLE_CARTRIDGES: Record<string, WorldCartridge> = {
  world_1: plaqueCityCartridge,
  world_2: crescentSulcusCartridge,
  world_3: neonAcidClockCartridge,
  pulp_rescue: pulpRescueCartridge,
};

export function isPlayableWorld(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(PLAYABLE_CARTRIDGES, id);
}

export function getCartridgeById(id: string): WorldCartridge {
  return PLAYABLE_CARTRIDGES[id] ?? plaqueCityCartridge;
}
