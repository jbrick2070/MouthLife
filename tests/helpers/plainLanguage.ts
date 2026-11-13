import {
  ADULT_TEETH_BY_UNIVERSAL,
  QUADRANT_NUMBERING_META,
  TOOTH_CROSS_SECTION_LAYERS,
  TOOTH_SURFACES_GUIDE,
  WORLD_DENTAL_LESSONS,
} from '../../src/config/dentalChart';
import { HISTORICAL_FIELD_NOTES, HOST_CITIES } from '../../src/config/hostsAndHistory';
import { UPGRADE_CATALOG } from '../../src/config/upgrades';
import { PLAYABLE_CARTRIDGES } from '../../src/worlds/worldRegistry';

/** Every sentence-like string inside a content table (ids, colours and numbers are skipped). */
function collectText(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    if (value.length > 12 && value.includes(' ')) out.add(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectText(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectText(v, out);
  }
}

const all = new Set<string>();
for (const table of [
  ADULT_TEETH_BY_UNIVERSAL,
  QUADRANT_NUMBERING_META,
  TOOTH_CROSS_SECTION_LAYERS,
  TOOTH_SURFACES_GUIDE,
  WORLD_DENTAL_LESSONS,
  HISTORICAL_FIELD_NOTES,
  HOST_CITIES,
  UPGRADE_CATALOG,
  PLAYABLE_CARTRIDGES,
]) {
  collectText(table, all);
}

/** All lesson, tip, history, upgrade and world text shown to players. */
export const DENTAL_CHART_CONTENT_FOR_TESTS: readonly string[] = [...all];
