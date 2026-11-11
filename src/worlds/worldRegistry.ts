import type { WorldCartridge } from '../engine/types';
import { crescentSulcusCartridge } from './crescentSulcusCartridge';
import { fluorapatiteCoastCartridge } from './fluorapatiteCoastCartridge';
import { neonAcidClockCartridge } from './neonAcidClockCartridge';
import { orbitalBiofilmDomeCartridge } from './orbitalBiofilmDomeCartridge';
import { plaqueCityCartridge } from './plaqueCityCartridge';
import { pulpRescueCartridge } from './pulpRescueCartridge';

export const PLAYABLE_CARTRIDGES: Record<string, WorldCartridge> = {
  world_1: plaqueCityCartridge,
  world_2: crescentSulcusCartridge,
  world_3: neonAcidClockCartridge,
  world_4: fluorapatiteCoastCartridge,
  world_5: orbitalBiofilmDomeCartridge,
  pulp_rescue: pulpRescueCartridge,
};

export function isPlayableWorld(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(PLAYABLE_CARTRIDGES, id);
}

export function getCartridgeById(id: string): WorldCartridge {
  return PLAYABLE_CARTRIDGES[id] ?? plaqueCityCartridge;
}
