#!/usr/bin/env node
/**
 * Second-opinion review of a translation file, for when no native speaker is available.
 *
 *   node scripts/i18n-review.mjs es               review with a different model than the translator
 *   node scripts/i18n-review.mjs es --model <id>  pick the reviewing model (see `agy models`)
 *
 * 1. Automatic checks flag strings left in English, slots that changed, and labels that grew far
 *    longer than the English (they may not fit their button).
 * 2. A reviewer model reads every English/translation pair and returns fixes only for the ones
 *    that are wrong, unnatural, too hard for a 4th grader, inconsistent with the glossary, or too long.
 * 3. Fixes are validated (same slots, not empty) and saved. A report lists what changed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const NAMES = {
  es: 'Spanish (Latin American, neutral, informal "tú")',
  fr: 'French (informal "tu")',
  de: 'German (informal "du")',
  pt: 'Brazilian Portuguese ("você")',
  ja: 'Japanese (friendly です/ます, kanji a 4th grader knows)',
  zh: 'Simplified Chinese',
  ko: 'Korean (friendly 해요체)',
};
const CJK = new Set(['ja', 'zh', 'ko']);
// Words that are fine to leave in English.
const KEEP = /^(MouthLife|SmileOnU|HYDRA-1|Miswak|WASD|Esc|FDI|Palmer|Universal|pH|F⁻|OK|DNA|NASA|Skylab|Toronto|Tokyo|Accra|Chicago|Delft|ML2)$/;

const lang = process.argv[2];
const modelIdx = process.argv.indexOf('--model');
const model = modelIdx > 0 ? process.argv[modelIdx + 1] : 'claude-opus-5-5-high';
if (!NAMES[lang]) {
  console.error(`Usage: node scripts/i18n-review.mjs <${Object.keys(NAMES).join('|')}> [--model <id>]`);
  process.exit(2);
}

const work = join(tmpdir(), 'mouthlife-i18n');
mkdirSync(work, { recursive: true });
const localeDir = join(ROOT, 'src', 'i18n', 'locales');
const outPath = join(localeDir, `${lang}.json`);
const glossaryPath = join(localeDir, `${lang}.glossary.json`);
const reportPath = join(localeDir, `${lang}.review.md`);
const source = JSON.parse(readFileSync(join(ROOT, 'src', 'i18n', 'strings.en.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(outPath, 'utf8'));
const glossary = existsSync(glossaryPath) ? JSON.parse(readFileSync(glossaryPath, 'utf8')) : {};

const log = (m) => console.log(`[${lang} review] ${m}`);
const slots = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join(',');
const visibleLength = (s) => [...s.replace(/\{\d+\}/g, '00')].reduce((n, ch) => n + (/[　-鿿가-힯＀-￯]/.test(ch) ? 1.8 : 1), 0);

function flagsFor(en, tr) {
  const flags = [];
  if (tr === en && /[A-Za-z]{3,}/.test(en.replace(/\{\d+\}/g, '')) && !en.split(/\s+/).every((w) => KEEP.test(w.replace(/[^\w⁻-]/g, '')))) {
    flags.push('left in English');
  }
  if (CJK.has(lang)) {
    const latin = (tr.match(/[A-Za-z]{4,}/g) ?? []).filter((w) => !KEEP.test(w) && !en.includes(`[${w}]`));
    const allowed = latin.filter((w) => !new RegExp(`\\b${w}\\b`).test(en) || /^[A-Z]/.test(w) === false);
    if (allowed.length > 0) flags.push(`English words left: ${allowed.join(', ')}`);
  }
  if (en.length <= 32 && visibleLength(tr) > Math.max(12, visibleLength(en) * 1.7)) flags.push('much longer than the English');
  return flags;
}

function askAgy(prompt) {
  const res = spawnSync('agy', ['--model', model, '--print-timeout', '900s', '-p', prompt], {
    cwd: work,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (res.error) throw res.error;
  return `${res.stdout ?? ''}`;
}

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

const glossaryText = Object.entries(glossary).map(([en, tr]) => `  ${en} = ${tr}`).join('\n');
const rules = `You are a native ${NAMES[lang]} speaker reviewing the translation of MouthLife, a free game for
children and families that teaches tooth brushing, flossing and dental health. Nobody else will check
your work before children read it, so be careful.

For each numbered item you get the English, the current translation, and sometimes automatic warnings.
Fix a translation only if it is: wrong in meaning; ungrammatical or unnatural; too hard for a 9-10 year
old; inconsistent with the glossary below; partly left in English; or much longer than the English when
it is a short button or label. Keep every slot like {0} exactly once each, and keep emoji, symbols,
numbers, units, "F⁻", "pH", tooth numbers and keyboard keys ([E], [Q], (M), Esc, WASD) unchanged.
Keep these names in English: MouthLife, SmileOnU, HYDRA-1, Miswak, people's names. Some items are
pieces of a longer sentence; keep them as pieces with the same leading/trailing punctuation.

Glossary (always use these):
${glossaryText}

Reply with ONE JSON object containing ONLY the items you changed: number -> corrected translation.
If everything in a batch is fine, reply {}. No markdown, no comments.`;

const keys = source.filter((s) => s in catalog);
const autoFlags = Object.fromEntries(keys.map((k) => [k, flagsFor(k, catalog[k])]).filter(([, f]) => f.length));
log(`${keys.length} strings, ${Object.keys(autoFlags).length} with automatic warnings; reviewer model ${model}`);

const batches = [];
let cur = [];
let size = 0;
for (const k of keys) {
  const item = k.length + catalog[k].length + 40;
  if (size + item > 7000 && cur.length) {
    batches.push(cur);
    cur = [];
    size = 0;
  }
  cur.push(k);
  size += item;
}
if (cur.length) batches.push(cur);

const changes = [];
for (const [bi, batch] of batches.entries()) {
  const items = Object.fromEntries(
    batch.map((en, i) => [String(i + 1), autoFlags[en] ? { en, tr: catalog[en], warnings: autoFlags[en] } : { en, tr: catalog[en] }])
  );
  let fixes = null;
  for (let attempt = 0; attempt < 2 && !fixes; attempt++) {
    try {
      fixes = parseJsonObject(askAgy(`${rules}\n\nItems:\n${JSON.stringify(items, null, 1)}`));
    } catch (err) {
      log(`batch ${bi + 1} error: ${err.message}`);
    }
  }
  if (!fixes) {
    log(`batch ${bi + 1}/${batches.length}: no usable reply, kept as is`);
    continue;
  }
  let applied = 0;
  for (const [n, fixed] of Object.entries(fixes)) {
    const en = batch[Number(n) - 1];
    if (!en || typeof fixed !== 'string' || !fixed.trim() || slots(fixed) !== slots(en) || fixed === catalog[en]) continue;
    changes.push({ en, before: catalog[en], after: fixed });
    catalog[en] = fixed;
    applied++;
  }
  const ordered = Object.fromEntries(source.filter((s) => s in catalog).map((s) => [s, catalog[s]]));
  writeFileSync(outPath, JSON.stringify(ordered, null, 1) + '\n');
  log(`batch ${bi + 1}/${batches.length}: ${applied} fixes`);
}

const stillFlagged = keys.filter((k) => flagsFor(k, catalog[k]).length);
const md = [
  `# ${lang} translation review`,
  '',
  `Reviewer model: ${model}. ${changes.length} strings changed. ${stillFlagged.length} still carry an automatic warning (often harmless, e.g. names).`,
  '',
  '| English | Before | After |',
  '| --- | --- | --- |',
  ...changes.map((c) => `| ${c.en.replace(/\|/g, '\\|')} | ${c.before.replace(/\|/g, '\\|')} | ${c.after.replace(/\|/g, '\\|')} |`),
  '',
  '## Still flagged',
  '',
  ...stillFlagged.map((k) => `- ${k} → ${catalog[k]} (${flagsFor(k, catalog[k]).join('; ')})`),
  '',
].join('\n');
writeFileSync(reportPath, md);
log(`done: ${changes.length} fixes, report in src/i18n/locales/${lang}.review.md`);
