import { describe, expect, it } from 'vitest';
import { MUSIC_TRACK_CANDIDATES, resolveMusicTrack } from '../src/engine/audio/musicTracks';
import { THEMES, type ThemeId } from '../src/engine/audio/musicTheory';

/** The ten recordings the native app ships today. */
const SHIPPED = [
  'accra.m4a',
  'aurora.m4a',
  'brush_along.m4a',
  'cosmic.m4a',
  'new_orleans.m4a',
  'pulp.m4a',
  'report.m4a',
  'sanctuary.m4a',
  'tokyo.m4a',
  'toronto.m4a',
];

describe('bundled soundtrack resolution (matches the native SunoStreamDeck)', () => {
  it('has a candidate list for every theme', () => {
    for (const id of Object.keys(THEMES) as ThemeId[]) {
      expect(MUSIC_TRACK_CANDIDATES[id].length).toBeGreaterThan(0);
    }
  });

  it('maps every theme to one of the shipped recordings', () => {
    expect(resolveMusicTrack('brush_along', SHIPPED)).toBe('brush_along.m4a');
    expect(resolveMusicTrack('hub', SHIPPED)).toBe('sanctuary.m4a');
    expect(resolveMusicTrack('hub_globe', SHIPPED)).toBe('sanctuary.m4a');
    expect(resolveMusicTrack('hub_ready', SHIPPED)).toBe('sanctuary.m4a');
    expect(resolveMusicTrack('world_1', SHIPPED)).toBe('toronto.m4a');
    expect(resolveMusicTrack('world_2', SHIPPED)).toBe('new_orleans.m4a');
    expect(resolveMusicTrack('world_3', SHIPPED)).toBe('tokyo.m4a');
    expect(resolveMusicTrack('world_4', SHIPPED)).toBe('accra.m4a');
    expect(resolveMusicTrack('world_5', SHIPPED)).toBe('aurora.m4a');
    expect(resolveMusicTrack('cosmic', SHIPPED)).toBe('cosmic.m4a');
    expect(resolveMusicTrack('pulp', SHIPPED)).toBe('pulp.m4a');
    expect(resolveMusicTrack('report', SHIPPED)).toBe('report.m4a');
  });

  it('prefers canonical ids over friendly names and m4a over mp3', () => {
    expect(resolveMusicTrack('world_1', ['toronto.m4a', 'world_1.mp3'])).toBe('world_1.mp3');
    expect(resolveMusicTrack('world_1', ['toronto.mp3', 'toronto.m4a'])).toBe('toronto.m4a');
    expect(resolveMusicTrack('brush_along', ['Brush.MP3'])).toBe('Brush.MP3');
  });

  it('falls back to background.* and otherwise hands the theme to the synth', () => {
    expect(resolveMusicTrack('pulp', ['background.m4a', 'toronto.m4a'])).toBe('background.m4a');
    expect(resolveMusicTrack('pulp', ['toronto.m4a'])).toBeNull();
    expect(resolveMusicTrack('pulp', [])).toBeNull();
    expect(resolveMusicTrack('pulp', ['pulp.caf', 'notes.txt'])).toBeNull();
  });
});
