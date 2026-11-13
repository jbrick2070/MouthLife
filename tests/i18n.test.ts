import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatalogMatcher } from '../src/i18n/uiTranslator';

const ROOT = join(__dirname, '..');
const EN: string[] = JSON.parse(readFileSync(join(ROOT, 'src/i18n/strings.en.json'), 'utf8'));
const LOCALE_DIR = join(ROOT, 'src/i18n/locales');
const LOCALES = readdirSync(LOCALE_DIR).filter((f) => /^[a-z]{2}\.json$/.test(f));

const slots = (s: string): string => (s.match(/\{\d+\}/g) ?? []).sort().join(',');

describe('screen translator matching', () => {
  const matcher = new CatalogMatcher({
    'Save Player': 'Guardar jugador',
    'Restore {0} colonies — scrub glowing rings!': '¡Recupera {0} colonias: frota los anillos!',
    '{0} Treat: {1} (+{2} Ions)': '{0} Golosina: {1} (+{2} iones)',
    'Sites {0}/{1}': 'Sitios {0}/{1}',
    'Sites 0/{0}': 'Sitios 0/{0}',
    '{0}%': 'nunca',
    'Price: {0}': 'Precio: {0}',
    'Dive (W1): {0}': 'Inmersión (W1): {0}',
    'Plaque City': 'Ciudad Placa',
  });

  it('translates exact text and keeps surrounding spaces', () => {
    expect(matcher.translate('Save Player')).toBe('Guardar jugador');
    expect(matcher.translate('  Save   Player \n')).toBe('  Guardar jugador \n');
  });

  it('fills numbers and names into slots, in any order', () => {
    expect(matcher.translate('Restore 10 colonies — scrub glowing rings!')).toBe('¡Recupera 10 colonias: frota los anillos!');
    expect(matcher.translate('☕ Treat: Maple Oat Cortado (+5 Ions)')).toBe('☕ Golosina: Maple Oat Cortado (+5 iones)');
  });

  it('translates a known name inside a slot', () => {
    expect(matcher.translate('Dive (W1): Plaque City')).toBe('Inmersión (W1): Ciudad Placa');
    expect(matcher.translate('Dive (W1): Unknown Place')).toBe('Inmersión (W1): Unknown Place');
  });

  it('translates a known line that the screen prefixed with an icon', () => {
    expect(matcher.translate('🎯 Restore 10 colonies — scrub glowing rings!')).toBe('🎯 ¡Recupera 10 colonias: frota los anillos!');
    expect(matcher.translate('✓ Save Player')).toBe('✓ Guardar jugador');
    expect(matcher.translate('🎯 Unknown goal')).toBe('🎯 Unknown goal');
  });

  it('prefers the more specific pattern', () => {
    expect(matcher.translate('Sites 0/10')).toBe('Sitios 0/10');
    expect(matcher.translate('Sites 3/10')).toBe('Sitios 3/10');
  });

  it('ignores patterns with no real words, and text with no letters', () => {
    expect(matcher.translate('45%')).toBe('45%');
    expect(matcher.translate('0:15 / 4:30')).toBe('0:15 / 4:30');
  });

  it('never treats a dollar sign in the text as a replacement code', () => {
    expect(matcher.translate('Price: $5')).toBe('Precio: $5');
  });

  it('leaves unknown text in English', () => {
    expect(matcher.translate('Something new')).toBe('Something new');
  });
});

describe('string list and translation files', () => {
  it('is up to date with the text in the code (run npm run i18n:extract after changing on-screen text)', () => {
    const res = spawnSync(process.execPath, [join(ROOT, 'scripts/i18n-extract.mjs'), '--check'], { encoding: 'utf8' });
    expect(res.stderr).toBe('');
    expect(res.status).toBe(0);
  });

  it('native app catalogs match the translation files (run node scripts/i18n-native.mjs after changes)', () => {
    const res = spawnSync(process.execPath, [join(ROOT, 'scripts/i18n-native.mjs'), '--check'], { encoding: 'utf8' });
    expect(res.stderr).toBe('');
    expect(res.status).toBe(0);
  });

  it('has a non-trivial English list with no duplicates', () => {
    expect(EN.length).toBeGreaterThan(500);
    expect(new Set(EN).size).toBe(EN.length);
  });

  it.each(LOCALES)('%s only translates known strings and keeps every slot', (file) => {
    const catalog: Record<string, string> = JSON.parse(readFileSync(join(LOCALE_DIR, file), 'utf8'));
    const known = new Set(EN);
    const unknown = Object.keys(catalog).filter((k) => !known.has(k));
    // A few stale keys are harmless (they are never shown), but a large number means the file is from
    // an old string list: run the translate script again.
    expect(unknown.length).toBeLessThan(25);
    const badSlots = Object.entries(catalog).filter(([en, tr]) => slots(en) !== slots(tr));
    expect(badSlots).toEqual([]);
    const empty = Object.entries(catalog).filter(([, tr]) => !tr.trim());
    expect(empty).toEqual([]);
  });

  it.each(LOCALES)('%s covers nearly every string', (file) => {
    const catalog: Record<string, string> = JSON.parse(readFileSync(join(LOCALE_DIR, file), 'utf8'));
    const covered = EN.filter((s) => s in catalog).length;
    expect(covered / EN.length).toBeGreaterThan(0.95);
  });
});
