#!/usr/bin/env node
/**
 * Copies the web build into the Android app (`npx cap sync android`), after checking which kind of
 * build `dist/` holds, so a test build can never end up in a Play release by accident.
 *
 *   npm run build      && npm run android:sync        a release (refuses a test build in dist/)
 *   npm run build:test && npm run android:sync:test   a test build for the Play closed test
 *
 * `npm run build` and `npm run build:test` both write `dist/`, and the Android copy of it is not
 * kept in git, so nothing else would show which one went in. A test build carries the test diary's
 * share button (`data-share-test-diary`); a release build has no trace of it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const ASSETS = join(ROOT, 'dist', 'assets');
const wantTest = process.argv.includes('--test');

if (!existsSync(ASSETS)) {
  console.error('dist/ has no build. Run `npm run build` (release) or `npm run build:test` first.');
  process.exit(1);
}

const isTestBuild = readdirSync(ASSETS)
  .filter((name) => name.endsWith('.js'))
  .some((name) => readFileSync(join(ASSETS, name), 'utf8').includes('data-share-test-diary'));

if (isTestBuild && !wantTest) {
  console.error('dist/ holds a TEST build (it keeps a test diary). Run `npm run build` for a release,');
  console.error('or `npm run android:sync:test` if a test build is what you want in the Android app.');
  process.exit(1);
}
if (!isTestBuild && wantTest) {
  console.error('dist/ holds a release build. Run `npm run build:test` first for a test build.');
  process.exit(1);
}

console.log(`dist/ holds a ${isTestBuild ? 'TEST' : 'release'} build: copying it into the Android app.`);
const result = spawnSync('npx', ['cap', 'sync', 'android'], { cwd: ROOT, stdio: 'inherit' });
process.exit(result.status ?? 1);
