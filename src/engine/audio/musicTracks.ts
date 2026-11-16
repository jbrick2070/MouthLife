/**
 * Which bundled recording plays for each music theme. Pure so it can be unit-tested; the same
 * stems, in the same order, as the native app's SunoStreamDeck (see
 * native-apple/MouthLifeApp/Music/README.md), so one folder of tracks serves both editions.
 */
import type { ThemeId } from './musicTheory';

/** Extensions browsers can stream, best first. (`.caf` is iOS-only, so the web skips it.) */
export const MUSIC_TRACK_EXTENSIONS = ['m4a', 'mp3', 'aac', 'wav', 'ogg'] as const;

export const MUSIC_TRACK_CANDIDATES: Record<ThemeId, readonly string[]> = {
  world_1: ['world_1', 'toronto'],
  world_2: ['world_2', 'new_orleans', 'nola'],
  world_3: ['world_3', 'tokyo', 'tokyo_chicago', 'chicago'],
  world_4: ['world_4', 'accra', 'accra_colorado'],
  world_5: ['world_5', 'aurora', 'orbit_aurora', 'station_aurora', 'orbit'],
  hub: ['hub', 'sanctuary'],
  hub_globe: ['hub_globe', 'hub', 'sanctuary'],
  hub_ready: ['hub_ready', 'hub', 'sanctuary'],
  brush_along: ['brush_along', 'brush'],
  cosmic: ['cosmic', 'intro'],
  pulp: ['pulp', 'pulp_rescue', 'boss'],
  report: ['report', 'victory'],
};

/** Brush-Along stages after the two minutes of brushing, which get music of their own. */
export type BrushMusicStage = 'floss' | 'rinse';

/**
 * Tried first during the floss and rinse stages of Brush-Along. A dedicated `floss.*` or
 * `rinse.*` file wins; until one is added, Accra (bright highlife) carries the floss and Aurora
 * (calm sunrise) the fluoride rinse. Same list as the native SunoStreamDeck.
 */
export const BRUSH_STAGE_TRACK_CANDIDATES: Record<BrushMusicStage, readonly string[]> = {
  floss: ['floss', 'brush_floss', 'accra'],
  rinse: ['rinse', 'fluoride', 'mouthwash', 'brush_rinse', 'aurora'],
};

/** A `background.*` file covers any theme that has no file of its own, like the native app. */
export const MUSIC_FALLBACK_STEM = 'background';

function extensionRank(file: string): number {
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return -1;
  return (MUSIC_TRACK_EXTENSIONS as readonly string[]).indexOf(file.slice(dot + 1).toLowerCase());
}

/**
 * Picks the bundled recording for `themeId` out of `files` (bare file names), or null when the
 * procedural synth should play instead. Matching is by stem, case-insensitive.
 */
export function resolveMusicTrack(
  themeId: ThemeId,
  files: readonly string[],
  brushStage: BrushMusicStage | null = null
): string | null {
  if (files.length === 0) return null;
  const byStem = new Map<string, string>();
  for (const file of files) {
    const rank = extensionRank(file);
    if (rank < 0) continue;
    const stem = file.slice(0, file.lastIndexOf('.')).toLowerCase();
    const prev = byStem.get(stem);
    if (!prev || rank < extensionRank(prev)) byStem.set(stem, file);
  }
  const stageStems = themeId === 'brush_along' && brushStage ? BRUSH_STAGE_TRACK_CANDIDATES[brushStage] : [];
  for (const stem of [...stageStems, ...(MUSIC_TRACK_CANDIDATES[themeId] ?? []), MUSIC_FALLBACK_STEM]) {
    const hit = byStem.get(stem);
    if (hit) return hit;
  }
  return null;
}
