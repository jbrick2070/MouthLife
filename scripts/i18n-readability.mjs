#!/usr/bin/env node
/**
 * Lists on-screen text that reads older than MouthLife's audience, for the owner to review.
 *
 *   node scripts/i18n-readability.mjs            writes docs/word-check.md
 *   node scripts/i18n-readability.mjs --print    prints the counts only
 *
 * It reads src/i18n/strings.en.json (every English string the game can show), finds which source
 * files each string comes from, and flags the ones on the PLAY PATH (Home, the stage, the 2-Min
 * Brush, How to Play, the score) that use a lab word, a long word or a long sentence. The Prologue,
 * the history almanac and the tooth chart are science pages by design: they are counted, not listed.
 *
 * Nothing is changed. A rewrite is made in the source (the English text is the translation key),
 * then: npm run i18n:extract, node scripts/i18n-translate.mjs <lang>, node scripts/i18n-native.mjs.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const STRINGS = JSON.parse(readFileSync(join(ROOT, 'src', 'i18n', 'strings.en.json'), 'utf8'));

/** Where a string is shown. The first matching rule names the place. */
const PLACES = [
  ['The stage', /src\/ui\/(TelemetryHudOverlay|hudHelpers)\.ts$|src\/config\/firstCityCoach\.ts$|ArcadeHudView\.swift$|Sim\/HudHelpers\.swift$/],
  ['City names and zones', /src\/worlds\//],
  ['Home', /src\/ui\/CompanionHubOverlay\.ts$|CompanionHubView\.swift$|ProfileAndSettingsSheet\.swift$/],
  ['2-Min Brush', /src\/ui\/(BrushAlongOverlay|brushIntroCard)\.ts$|BrushAlongView\.swift$/],
  ['How to Play', /src\/config\/tutorial\.ts$|src\/ui\/TutorialOverlay\.ts$/],
  ['The score', /src\/ui\/MissionReportOverlay\.ts$|MissionReportView\.swift$/],
  ['Upgrades', /src\/config\/upgrades\.ts$|UpgradeLabSheet\.swift$/],
  ['Science pages', /src\/ui\/CosmicIntroOverlay\.ts$|src\/config\/(hostsAndHistory|dentalChart|charityInfo)\.ts$|HistoryAlmanacSheet\.swift$|DentalChartSheet\.swift$|CosmicIntroView\.swift$/],
];
const SCIENCE = 'Science pages';

/** Lab words, each with the plain word the game already uses elsewhere (empty: needs a decision). */
const LAB_WORDS = [
  [/\bBiophysical Actuator Lab\b/i, 'Upgrade Lab'],
  [/\bBio-Actuator Lab\b/i, 'Upgrade Lab'],
  [/\bBiophysic\w*/i, ''],
  [/\bActuator\w*/i, 'tool'],
  [/\bBrush-Along\b/i, '2-Min Brush'],
  [/F⁻/, 'fluoride'],
  [/\bpH\b/, 'acid level'],
  [/\bcolon(y|ies)\b/i, 'helper germs'],
  [/\bCommensal\w*/i, 'helper'],
  [/\bdistricts?\b/i, 'zone'],
  [/\bD\{?\d\}?\b/, 'Zone 1 / 2 / 3'],
  [/\bEPS\b/, 'slime'],
  [/\bSynergy\b/i, 'combo'],
  [/\bSucrose\b/i, 'sugar'],
  [/\bBio-Scan\b/i, 'Scan'],
  [/\bFluorapatite\b/i, 'fluoride enamel'],
  [/\bHydroxyapatite\b/i, 'plain enamel'],
  [/\bBicarb\w*/i, 'spit buffer'],
  [/\bsulcus\b/i, 'gumline'],
  [/\bbiofilm\b/i, 'slime'],
  [/\bpellicle\b/i, 'film'],
  [/\binterdental\b|\binterproximal\b/i, 'between teeth'],
  [/\bocclusal\b/i, 'chewing'],
  [/\bCrystallograph\w*/i, ''],
  [/\bMohs\b/i, ''],
  [/\bquorum\b/i, ''],
  [/\bStephan\b/, ''],
  [/\bOverdrive\b/i, ''],
  [/\bHydro-Sonic\b/i, ''],
  [/\btelemetry\b/i, ''],
];
const LONG_WORD = 12;
const LONG_SENTENCE = 16;

function listFiles(rel) {
  const abs = join(ROOT, rel);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return [];
  }
  if (st.isFile()) return [rel];
  return readdirSync(abs).flatMap((name) => (name === 'node_modules' ? [] : listFiles(`${rel}/${name}`)));
}
const SOURCES = [...listFiles('src/ui'), ...listFiles('src/config'), ...listFiles('src/worlds'), 'src/main.ts', ...listFiles('native-apple/MouthLifeApp'), ...listFiles('native-apple/Sources/MouthLifeCore')]
  .filter((f) => /\.(ts|swift)$/.test(f) && !/L10nCatalogs\.swift$|CitySkylineArt\.swift$|WorldCartridges\.swift$/.test(f))
  .map((f) => ({ file: f, text: readFileSync(join(ROOT, f), 'utf8') }));

/** The longest slot-free piece of a string, to look it up in the sources. */
function needle(s) {
  return s.split(/\{\d+\}/).sort((a, b) => b.length - a.length)[0].trim();
}

function placeOf(s) {
  const n = needle(s);
  if (n.length < 4) return null;
  const files = SOURCES.filter((src) => src.text.includes(n)).map((src) => src.file);
  for (const [place, rule] of PLACES) if (files.some((f) => rule.test(f))) return place;
  return files.length > 0 ? 'Other screens' : null;
}

function check(s) {
  const reasons = [];
  const plain = [];
  for (const [rule, swap] of LAB_WORDS) {
    const hit = rule.exec(s);
    if (!hit) continue;
    reasons.push(`"${hit[0]}"`);
    if (swap) plain.push(`${hit[0]} → ${swap}`);
  }
  const words = s.replace(/\{\d+\}/g, ' ').match(/[A-Za-z][A-Za-z’'-]*/g) ?? [];
  const long = [...new Set(words.filter((w) => w.replace(/[’'-]/g, '').length >= LONG_WORD))];
  for (const w of long) if (!reasons.some((r) => r.toLowerCase().includes(w.toLowerCase()))) reasons.push(`long word "${w}"`);
  const longest = Math.max(0, ...s.split(/[.!?•]\s/).map((part) => (part.match(/[A-Za-z][A-Za-z’'-]*/g) ?? []).length));
  if (longest > LONG_SENTENCE) reasons.push(`${longest} words in one sentence`);
  return { reasons, plain };
}

const rows = [];
const counts = new Map();
for (const s of STRINGS) {
  const { reasons, plain } = check(s);
  if (reasons.length === 0) continue;
  const place = placeOf(s) ?? 'Other screens';
  counts.set(place, (counts.get(place) ?? 0) + 1);
  if (place !== SCIENCE) rows.push({ place, s, reasons, plain });
}

const order = [...PLACES.map(([p]) => p), 'Other screens'];
rows.sort((a, b) => order.indexOf(a.place) - order.indexOf(b.place) || a.s.localeCompare(b.s));

const summary = order.filter((p) => counts.has(p)).map((p) => `${p}: ${counts.get(p)}`).join(' · ');
if (process.argv.includes('--print')) {
  console.log(`${STRINGS.length} strings; flagged: ${summary}`);
  process.exit(0);
}

const cell = (t) => t.replace(/\|/g, '\\|').replace(/\n/g, ' ');
let md = `# MouthLife word check (for the owner's review)

Made by \`node scripts/i18n-readability.mjs\` from the ${STRINGS.length} English strings the game can show.
It lists text on the play path that uses a lab word, a word of ${LONG_WORD} letters or more, or more than
${LONG_SENTENCE} words in one sentence. Nothing has been changed: mark the rows to rewrite, and each
approved rewrite is then made once in the source and translated into the other 7 languages.

Flagged, by place: ${summary}.

The science pages (the Prologue, the history almanac, the tooth chart: ${counts.get(SCIENCE) ?? 0} flagged strings) are
science on purpose and are not listed. Suggested for them: one plain first line each.

The "plain word" column only shows words the game already uses elsewhere; an empty cell needs a
decision.

`;
let last = '';
for (const r of rows) {
  if (r.place !== last) {
    md += `\n## ${r.place}\n\n| Text on screen | Why it is listed | Plain word |\n|---|---|---|\n`;
    last = r.place;
  }
  md += `| ${cell(r.s)} | ${cell(r.reasons.join(', '))} | ${cell(r.plain.join('; '))} |\n`;
}
writeFileSync(join(ROOT, 'docs', 'word-check.md'), md);
console.log(`Wrote docs/word-check.md: ${rows.length} rows. Flagged: ${summary}`);
