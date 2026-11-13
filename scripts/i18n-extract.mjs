#!/usr/bin/env node
/**
 * Collects every piece of English text the web game can show, so it can be translated.
 *
 *   node scripts/i18n-extract.mjs          writes src/i18n/strings.en.json
 *   node scripts/i18n-extract.mjs --check  fails if that file is out of date (for CI)
 *
 * The game translates the page by matching the text it renders against this list (see
 * src/i18n/uiTranslator.ts), so the keys here are exactly what appears on screen:
 *  - plain string literals that read like text
 *  - each text run and aria-label / title / placeholder / alt value inside HTML template strings,
 *    with every ${...} replaced by a numbered slot {0}, {1}, ...
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const OUT = join(ROOT, 'src', 'i18n', 'strings.en.json');

const SCAN = ['src/ui', 'src/config', 'src/worlds', 'src/main.ts', 'src/engine/sim', 'src/engine/persistence/SaveSystem.ts'];
// Already translated by hand in 8 languages (the spoken brushing coach and its on-screen labels).
const SKIP_FILES = new Set(['src/config/brushCoach.ts', 'src/config/gameConfig.ts']);

function listFiles(rel) {
  const abs = join(ROOT, rel);
  if (statSync(abs).isFile()) return [rel];
  return readdirSync(abs).flatMap((name) => listFiles(join(rel, name).replace(/\\/g, '/')));
}

// ---------------------------------------------------------------- tiny JS lexer

/** Yields { kind: 'str', value } for '…' / "…" and { kind: 'tpl', parts } for `…${expr}…`. */
function* lex(src, start = 0, end = src.length) {
  let i = start;
  let prevSignificant = '';
  const regexAllowedAfter = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
  while (i < end) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < end && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && n === '*') {
      const close = src.indexOf('*/', i + 2);
      i = close < 0 ? end : close + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let value = '';
      while (j < end && src[j] !== c) {
        if (src[j] === '\\') {
          value += unescapeChar(src[j + 1]);
          j += 2;
        } else {
          value += src[j++];
        }
      }
      yield { kind: 'str', value };
      i = j + 1;
      prevSignificant = 'x';
      continue;
    }
    if (c === '`') {
      const { parts, next } = readTemplate(src, i + 1, end);
      yield { kind: 'tpl', parts };
      for (const p of parts) if (p.expr !== undefined) yield* lex(p.exprSrc, 0, p.exprSrc.length);
      i = next;
      prevSignificant = 'x';
      continue;
    }
    if (c === '/' && regexAllowedAfter.has(prevSignificant)) {
      // Regular expression literal: skip it so quotes inside never start a string.
      let j = i + 1;
      let inClass = false;
      while (j < end && src[j] !== '\n') {
        if (src[j] === '\\') j += 2;
        else if (src[j] === '[') (inClass = true), j++;
        else if (src[j] === ']') (inClass = false), j++;
        else if (src[j] === '/' && !inClass) break;
        else j++;
      }
      i = j + 1;
      while (i < end && /[a-z]/i.test(src[i])) i++;
      prevSignificant = 'x';
      continue;
    }
    if (!/\s/.test(c)) {
      if (/[A-Za-z0-9_$)\].]/.test(c)) {
        // Words like `return` / `typeof` allow a regex after them.
        let j = i;
        while (j < end && /[A-Za-z0-9_$]/.test(src[j])) j++;
        const word = src.slice(i, j);
        if (word.length > 0) {
          prevSignificant = ['return', 'typeof', 'case', 'in', 'of'].includes(word) ? '' : 'x';
          i = j;
          continue;
        }
        prevSignificant = 'x';
      } else {
        prevSignificant = c;
      }
    }
    i++;
  }
}

function unescapeChar(ch) {
  return { n: '\n', t: '\t', r: '', '\\': '\\', "'": "'", '"': '"', '`': '`', $: '$' }[ch] ?? ch;
}

/** Reads a template literal body starting after the opening backtick. */
function readTemplate(src, start, end) {
  const parts = [];
  let text = '';
  let i = start;
  while (i < end) {
    const c = src[i];
    if (c === '\\') {
      text += unescapeChar(src[i + 1]);
      i += 2;
    } else if (c === '`') {
      parts.push({ text });
      return { parts, next: i + 1 };
    } else if (c === '$' && src[i + 1] === '{') {
      parts.push({ text });
      text = '';
      const exprStart = i + 2;
      let depth = 1;
      let j = exprStart;
      while (j < end && depth > 0) {
        const d = src[j];
        if (d === '`') {
          j = readTemplate(src, j + 1, end).next;
          continue;
        }
        if (d === "'" || d === '"') {
          j++;
          while (j < end && src[j] !== d) j += src[j] === '\\' ? 2 : 1;
          j++;
          continue;
        }
        if (d === '{') depth++;
        if (d === '}') depth--;
        j++;
      }
      parts.push({ expr: true, exprSrc: src.slice(exprStart, j - 1) });
      i = j;
    } else {
      text += c;
      i++;
    }
  }
  parts.push({ text });
  return { parts, next: end };
}

// ---------------------------------------------------------------- text runs

const SLOT = '\u0000';
const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

/** Text runs of a template (or plain string) with slots renumbered per run. */
function runsOf(flat) {
  const runs = [];
  const looksHtml = /<\/?[a-z][\s\S]*?>/i.test(flat);
  if (!looksHtml) {
    runs.push(flat);
  } else {
    const tagRe = /<[^>]*>/g;
    let last = 0;
    let m;
    while ((m = tagRe.exec(flat))) {
      runs.push(flat.slice(last, m.index));
      for (const attr of ATTRS) {
        const am = new RegExp(`${attr}="([^"]*)"`).exec(m[0]);
        if (am) runs.push(am[1]);
      }
      last = m.index + m[0].length;
    }
    runs.push(flat.slice(last));
  }
  return runs
    .map((r) => decodeEntities(r).replace(/\s+/g, ' ').trim())
    .map((r) => {
      let k = 0;
      return r.replace(new RegExp(SLOT, 'g'), () => `{${k++}}`);
    });
}

function isTextLike(s) {
  if (s.length < 2 || s.length > 1200) return false;
  if (!/[A-Za-z]{2,}/.test(s)) return false;
  if (/^\{\d+\}$/.test(s)) return false;
  if (/^(https?:|mailto:|data:|\.\.?\/|#|@|ML2)/.test(s)) return false;
  if (/=>|;\s*$|\bfunction\b|\brgba?\(|\bvar\(--|^[.#][\w-]+\s*\{|px\b|\b(querySelector|innerHTML)\b/.test(s)) return false;
  if (/[{}]/.test(s.replace(/\{\d+\}/g, ''))) return false;
  // CSS selectors and media queries, e.g. "button, a, input" or "(prefers-reduced-motion: reduce)".
  if (/^[\[(=]/.test(s) || /="/.test(s)) return false;
  if (/^[a-z]+(, ?[a-z\[\]="-]+)+$/.test(s)) return false;
  const tokens = s.split(' ');
  // CSS class lists such as "btn btn-sm hub-drawer-toggle".
  if (tokens.every((t) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(t)) && tokens.some((t) => t.includes('-'))) return false;
  if (tokens.length === 1) {
    // Single words: keep real labels (Lab, Molar, SCRUB), drop ids and code names.
    if (/[_./\\:]/.test(s)) return false;
    if (/^[a-z]/.test(s)) return false;
    if (/^[A-Z][a-z]+[A-Z]/.test(s)) return false; // CamelCase identifiers
  } else if (tokens.every((t) => /^[a-z][a-zA-Z0-9]*$/.test(t)) && tokens.length <= 2 && !/^[a-z]+ [a-z]+$/.test(s)) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------- main

const keys = new Set();
for (const rel of SCAN.flatMap(listFiles)) {
  if (!/\.(ts)$/.test(rel) || SKIP_FILES.has(rel) || rel.endsWith('.d.ts')) continue;
  const src = readFileSync(join(ROOT, rel), 'utf8');
  for (const tok of lex(src)) {
    let flat;
    if (tok.kind === 'str') flat = tok.value;
    else flat = tok.parts.map((p) => (p.expr ? SLOT : p.text)).join('');
    if (tok.kind === 'str' && /<\/?[a-z]/i.test(flat) === false) {
      const t = flat.replace(/\s+/g, ' ').trim();
      if (isTextLike(t)) keys.add(t);
      continue;
    }
    for (const run of runsOf(flat)) if (isTextLike(run)) keys.add(run);
  }
}

const sorted = [...keys].sort((a, b) => a.localeCompare(b, 'en'));
const json = JSON.stringify(sorted, null, 1) + '\n';
if (process.argv.includes('--check')) {
  const current = readFileSync(OUT, 'utf8');
  if (current !== json) {
    console.error('src/i18n/strings.en.json is out of date. Run: npm run i18n:extract');
    process.exit(1);
  }
  console.log(`strings.en.json is up to date (${sorted.length} strings).`);
} else {
  writeFileSync(OUT, json);
  console.log(`Wrote ${relative(ROOT, OUT)} with ${sorted.length} strings.`);
}
