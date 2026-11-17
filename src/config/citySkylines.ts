/**
 * The drawing for each host city, ready for the renderer. The geometry rules live in
 * citySkylineGeometry.ts; the drawings themselves are the text files in ./skylines.
 */
import accraArt from './skylines/accra.txt?raw';
import newOrleansArt from './skylines/new_orleans.txt?raw';
import orbitAuroraArt from './skylines/orbit_aurora.txt?raw';
import tokyoArt from './skylines/tokyo.txt?raw';
import torontoArt from './skylines/toronto.txt?raw';
import { parseCityArt, type CityArt } from './citySkylineGeometry';

/** Raw drawings by host city id (WorldCartridge.hostId). */
export const CITY_SKYLINE_TEXT: Readonly<Record<string, string>> = {
  accra: accraArt,
  new_orleans: newOrleansArt,
  orbit_aurora: orbitAuroraArt,
  tokyo: tokyoArt,
  toronto: torontoArt,
};

const cache = new Map<string, CityArt>();

/** The skyline for a host city, or null for a host with no drawing. */
export function cityArtForHost(hostId: string): CityArt | null {
  const text = CITY_SKYLINE_TEXT[hostId];
  if (text === undefined) return null;
  let art = cache.get(hostId);
  if (!art) {
    art = parseCityArt(text);
    cache.set(hostId, art);
  }
  return art;
}
