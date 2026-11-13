#!/usr/bin/env node
/**
 * Translates src/i18n/strings.en.json with the Antigravity CLI (`agy`).
 *
 *   node scripts/i18n-translate.mjs es            only strings that are missing from es.json
 *   node scripts/i18n-translate.mjs es --redo     translate everything again
 *
 * Output: src/i18n/locales/<lang>.json  ({ "English text": "translation" })
 *         src/i18n/locales/<lang>.glossary.json  (fixed words for game terms, made on the first run)
 *
 * agy runs in a scratch folder outside the repository and is only asked for text, never to edit
 * files. Every translation is checked before it is kept: same {0} slots, not empty.
 * Machine translations: have a native speaker review them before release.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const LANGS = {
  es: { name: 'Spanish (Latin American, neutral)', you: 'Use the informal "tú".' },
  fr: { name: 'French', you: 'Use the informal "tu".' },
  de: { name: 'German', you: 'Use the informal "du".' },
  pt: { name: 'Portuguese (Brazilian)', you: 'Use "você".' },
  ja: { name: 'Japanese', you: 'Use simple, friendly です/ます style. Use kanji a 4th grader knows; prefer hiragana otherwise.' },
  zh: { name: 'Chinese (Simplified)', you: 'Use simple, friendly words a 4th grader knows.' },
  ko: { name: 'Korean', you: 'Use friendly 해요체.' },
};

const GLOSSARY_TERMS = [
  'Fluoride Ions', 'Habit Stamps', 'Smooth Bask', 'Fluoride Surge', 'Surge', 'Floss Zip', 'Dye Scan',
  'Saliva Spring', 'Miswak Spring', 'slime dome', 'helper germs', 'Supply Beacon', 'Overdrive', 'Pulp Rescue',
  'Dive', 'Hub', 'Lab', 'Brush-Along', 'Sync Code', 'Fluoride Gold', 'Plaque City', 'Gumline Crescent',
  'Neon Acid Clock', 'Fluoride Coast', 'Slime Dome', 'enamel', 'dentin', 'pulp', 'plaque', 'gumline', 'floss',
  'molar', 'premolar', 'canine', 'incisor', 'acid clock', 'Safe Patch', 'zone', 'colony',
];

const BATCH_CHARS = 6500;
const lang = process.argv[2];
const fixOnly = process.argv.includes('--fix-only');
const redo = process.argv.includes('--redo');
if (!LANGS[lang]) {
  console.error(`Usage: node scripts/i18n-translate.mjs <${Object.keys(LANGS).join('|')}> [--redo]`);
  process.exit(2);
}

const work = join(tmpdir(), 'mouthlife-i18n');
mkdirSync(work, { recursive: true });
const localeDir = join(ROOT, 'src', 'i18n', 'locales');
mkdirSync(localeDir, { recursive: true });
const outPath = join(localeDir, `${lang}.json`);
const glossaryPath = join(localeDir, `${lang}.glossary.json`);
const source = JSON.parse(readFileSync(join(ROOT, 'src', 'i18n', 'strings.en.json'), 'utf8'));
const existing = !redo && existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {};

function log(msg) {
  console.log(`[${lang}] ${msg}`);
}

function askAgy(prompt) {
  const res = spawnSync('agy', ['--print-timeout', '600s', '-p', prompt], {
    cwd: work,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (res.error) throw res.error;
  return `${res.stdout ?? ''}`;
}

/** First balanced {...} JSON object in the reply. */
function parseJsonObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const slots = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join(',');

/**
 * Emoji and symbols that start the English (icons such as "🧑🏽‍🚀 " or "✦ ") must come through
 * exactly. Translators sometimes drop the invisible joiners inside combined emoji, which splits
 * one picture into two, so copy the English lead-in over the translation's.
 */
function repairLeadingSymbols(en, tr) {
  const lead = (str) => /^[^\p{L}\p{N}{]*/u.exec(str)?.[0] ?? '';
  const enLead = lead(en);
  const trLead = lead(tr);
  if (!/\p{Extended_Pictographic}|[✦★✓✕✨•↻←→▴▾]/u.test(enLead)) return tr;
  const strip = (x) => x.replace(/[‍️\s]/g, '');
  if (enLead === trLead || strip(enLead) !== strip(trLead)) return tr;
  return enLead + tr.slice(trLead.length);
}

function rules(glossary) {
  const g = glossary
    ? Object.entries(glossary).map(([en, tr]) => `  ${en} = ${tr}`).join('\n')
    : '  (none yet)';
  return `You are translating the on-screen text of MouthLife, a free game for children and families
that teaches tooth brushing, flossing and dental health. Translate from English to ${LANGS[lang].name}.

Rules:
1. Write for a 9-10 year old (4th grade): short, simple, friendly words. Keep about the same length as
   the English. Buttons and labels must stay short. ${LANGS[lang].you}
2. Keep every slot like {0} or {1} exactly, each once. You may move slots to fit the grammar.
3. Keep emoji, symbols (• → ✦ ★ ✓ ↗), numbers, units (mm, s, %, mL), "F⁻", "pH", tooth numbers (#19,
   FDI 11-48, Universal, Palmer) and keyboard keys ([E], [Q], [R], (M), Esc, WASD, Space) unchanged.
4. Do not translate: MouthLife, SmileOnU, HYDRA-1, Miswak, people's names. Use the usual local name
   for cities and countries.
5. If the English is in ALL CAPS, write the translation in capitals too (where the script has them).
   Some strings are pieces of a longer sentence (for example ", drops down to Lower Left"): translate
   them as pieces and keep their leading or trailing punctuation.
6. Always use these translations for game terms:
${g}
7. Reply with ONE JSON object that maps each number to its translation, and nothing else: no markdown
   fences, no comments.`;
}

function translateBatch(items, glossary) {
  const numbered = Object.fromEntries(items.map((s, i) => [String(i + 1), s]));
  const prompt = `${rules(glossary)}\n\nStrings:\n${JSON.stringify(numbered, null, 1)}`;
  const reply = askAgy(prompt);
  const obj = parseJsonObject(reply);
  const out = {};
  if (!obj) return out;
  items.forEach((en, i) => {
    const tr = obj[String(i + 1)];
    if (typeof tr === 'string' && tr.trim() && slots(tr) === slots(en)) out[en] = tr;
  });
  return out;
}

function saveOrdered(result) {
  const ordered = Object.fromEntries(
    source.filter((s) => s in result).map((s) => [s, repairLeadingSymbols(s, result[s])])
  );
  writeFileSync(outPath, JSON.stringify(ordered, null, 1) + '\n');
  return ordered;
}

if (fixOnly) {
  const fixed = saveOrdered(existing);
  log(`repaired and re-saved ${Object.keys(fixed).length} strings`);
  process.exit(0);
}

// 1. Glossary first, so every batch uses the same words for game terms.
let glossary = existsSync(glossaryPath) ? JSON.parse(readFileSync(glossaryPath, 'utf8')) : null;
if (!glossary || redo) {
  log('making glossary...');
  const prompt = `${rules(null)}

These are game terms. Choose one short, kid-friendly translation for each. Words like "Dive" (start a
level), "Hub" (home screen) and "Lab" (upgrade shop) are menu names. Reply with ONE JSON object mapping
each English term to its translation, and nothing else.

${JSON.stringify(GLOSSARY_TERMS)}`;
  for (let attempt = 0; attempt < 3 && !glossary; attempt++) glossary = parseJsonObject(askAgy(prompt));
  if (!glossary) throw new Error('agy did not return a glossary');
  writeFileSync(glossaryPath, JSON.stringify(glossary, null, 1) + '\n');
}

// 2. Batches of whatever is still missing, retried up to three rounds.
const result = { ...existing };
for (let round = 1; round <= 3; round++) {
  const missing = source.filter((s) => !(s in result));
  if (missing.length === 0) break;
  const batches = [];
  let cur = [];
  let size = 0;
  for (const s of missing) {
    if (size + s.length > BATCH_CHARS && cur.length) {
      batches.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(s);
    size += s.length + 8;
  }
  if (cur.length) batches.push(cur);
  log(`round ${round}: ${missing.length} strings in ${batches.length} batches`);
  for (const [bi, batch] of batches.entries()) {
    try {
      Object.assign(result, translateBatch(batch, glossary));
    } catch (err) {
      log(`batch ${bi + 1} failed: ${err.message}`);
    }
    // Save after every batch so a crash never loses finished work.
    const ordered = saveOrdered(result);
    log(`batch ${bi + 1}/${batches.length} done (${Object.keys(ordered).length}/${source.length})`);
  }
}
const left = source.filter((s) => !(s in result)).length;
log(left ? `finished with ${left} strings still in English` : 'finished: all strings translated');
