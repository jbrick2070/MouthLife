import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Sprint 4 of docs/beta-feedback-sprint-plan.md: the test diary in the browser and the Android app,
 * the twin of the native `TestDiary` / `AppDiagnostics`. Only a build made with VITE_TEST_BUILD=1
 * keeps one; in any other build every export does nothing and nothing is written.
 *
 * The module decides once, as it loads, whether this is a test build, so each test loads a fresh
 * copy after setting the variable. The page is a stand-in: storage in memory, and window and
 * document that only collect their listeners, which a test then fires by hand.
 */

const ROOT = join(__dirname, '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
const VERSION: string = JSON.parse(read('package.json')).version;

type Listener = (ev: Record<string, unknown>) => void;

/** An event target that only remembers its listeners; `fire` calls them. */
function fakeTarget<T extends object>(extra: T) {
  const listeners = new Map<string, Listener[]>();
  return Object.assign(extra, {
    listeners,
    addEventListener: (type: string, fn: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener: () => {},
    fire: (type: string, ev: Record<string, unknown> = {}) => {
      for (const fn of listeners.get(type) ?? []) fn(ev);
    },
  });
}

/** localStorage in memory, counting every write and removal. */
function memoryStorage() {
  const stored = new Map<string, string>();
  const counts = { writes: 0, removals: 0 };
  return {
    stored,
    counts,
    getItem: (key: string): string | null => stored.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      counts.writes += 1;
      stored.set(key, value);
    },
    removeItem: (key: string): void => {
      counts.removals += 1;
      stored.delete(key);
    },
    get length(): number {
      return stored.size;
    },
    key: (index: number): string | null => [...stored.keys()][index] ?? null,
  };
}

/** A page with its storage, shown (or hidden) as the test asks. */
function stubPage(storage = memoryStorage(), visible = true) {
  const win = fakeTarget({ localStorage: storage });
  const doc = fakeTarget({ visibilityState: visible ? 'visible' : 'hidden' });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
    maxTouchPoints: 5,
  });
  return { storage, win, doc };
}

/** A fresh copy of the diary, as a build with VITE_TEST_BUILD set to `flag` would load it. */
async function loadDiary(flag: string | undefined) {
  vi.stubEnv('VITE_TEST_BUILD', flag);
  vi.resetModules();
  return import('../src/engine/diagnostics/testDiary');
}

const lines = (text: string) => text.split('\n').filter((line) => line.length > 0);
const textOf = (line: string) => line.replace(/^\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} {2}/, '');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('the diary in a test build', () => {
  it('stamps each line as the app does and keeps one line per note', async () => {
    const { storage } = stubPage();
    const diary = await loadDiary('1');
    expect(diary.TEST_BUILD).toBe(true);
    diary.note('first\nsecond\r\nthird');
    diary.brushStage('floss');
    const kept = lines(storage.stored.get(diary.DIARY_KEY) ?? '');
    expect(kept).toHaveLength(2);
    expect(kept[0]).toMatch(/^\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} {2}first second {2}third$/);
    expect(textOf(kept[1])).toBe('brush: floss starts');
    expect(diary.lastNote()).toBe('brush: floss starts');
    expect(diary.diaryText()).toBe(storage.stored.get(diary.DIARY_KEY));
  });

  it('trims to the newest 250 lines once it passes 400', async () => {
    const { storage } = stubPage();
    const diary = await loadDiary('1');
    expect([diary.DIARY_KEEP_LINES, diary.DIARY_MAX_LINES]).toEqual([250, 400]);
    for (let i = 1; i <= 400; i++) diary.note(`line ${i}`);
    expect(lines(diary.diaryText())).toHaveLength(400);
    diary.note('line 401');
    const kept = lines(diary.diaryText());
    expect(kept).toHaveLength(250);
    expect(textOf(kept[0])).toBe('line 152');
    expect(textOf(kept[249])).toBe('line 401');
    // Then it grows back to 400 before the next trim.
    for (let i = 402; i <= 551; i++) diary.note(`line ${i}`);
    expect(lines(storage.stored.get(diary.DIARY_KEY) ?? '')).toHaveLength(400);
  });

  it('builds the screens’ lines itself, from values only', async () => {
    stubPage();
    const diary = await loadDiary('1');
    diary.screen('HUB', 'ARCADE', 'world_2');
    diary.screen('ARCADE', 'HUB', 'world_2');
    diary.brushPaused(true, 37.8);
    diary.brushStageEnded('brushing', 'floss');
    diary.brushFinished(false, true, false);
    diary.stagePause(true);
    diary.finaleStarts('city', 2);
    diary.unfinishedBrushPaid(45.2, false);
    expect(lines(diary.diaryText()).map(textOf)).toEqual([
      'screen HUB -> ARCADE world_2',
      'screen ARCADE -> HUB',
      'brush paused at 37 s',
      'brush: brushing ended, Start card for floss',
      'brush finished: good try, floss',
      'stage pause on',
      'finale starts (city, city 2)',
      'a brush the last run left unfinished is paid now: 45 s brushed, good try',
    ]);
  });

  it('opens each launch with a line that names the version, the build and the device', async () => {
    stubPage();
    const diary = await loadDiary('1');
    diary.startTestDiary();
    diary.startTestDiary();
    const kept = lines(diary.diaryText()).map(textOf);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatch(/^=== launch • MouthLife /);
    expect(kept[0]).toContain(`MouthLife ${VERSION} (test build, `);
    expect(kept[0]).toContain(' • browser • iPhone');
  });
});

describe('script errors', () => {
  it('notes message and file:line, the same one at most once in 5 s, and at most 20 a launch', async () => {
    const { win } = stubPage();
    const diary = await loadDiary('1');
    diary.startTestDiary();
    diary.screen('HUB', 'BRUSH_ALONG');
    const crash = { message: 'boom', filename: 'https://example.test/assets/index-abc.js?v=2', lineno: 12 };
    for (let i = 0; i < 50; i++) win.fire('error', crash);
    const errors = () => lines(diary.diaryText()).map(textOf).filter((t) => /^(error|unhandled rejection):/.test(t));
    expect(errors()).toEqual(['error: boom (index-abc.js:12) • last: screen HUB -> BRUSH_ALONG']);
    // An error line does not become what the game was last doing.
    expect(diary.lastNote()).toBe('screen HUB -> BRUSH_ALONG');

    const reason = new TypeError('x is undefined');
    reason.stack = 'TypeError: x is undefined\n    at step (https://example.test/assets/index-abc.js:88:5)';
    win.fire('unhandledrejection', { reason });
    expect(errors()[1]).toBe('unhandled rejection: TypeError: x is undefined (index-abc.js:88) • last: screen HUB -> BRUSH_ALONG');

    // Later than 5 s, the same error is noted again.
    const t0 = Date.now();
    diary.scriptError('error', 'later', 'a.js:1', t0);
    diary.scriptError('error', 'later', 'a.js:1', t0 + 4999);
    diary.scriptError('error', 'later', 'a.js:1', t0 + 5000);
    expect(errors().filter((t) => t.startsWith('error: later'))).toHaveLength(2);

    // A crash loop of ever-new messages stops at 20 lines in ten minutes...
    for (let i = 0; i < 40; i++) diary.scriptError('error', `loop ${i}`, '', t0 + i);
    expect(errors()).toHaveLength(diary.ERRORS_PER_WINDOW);
    // ...and a new error later in a long session is noted again.
    diary.scriptError('error', 'much later', 'b.js:2', t0 + diary.ERROR_WINDOW_MS + 1);
    expect(errors().some((t) => t.startsWith('error: much later'))).toBe(true);
  });

  it('leaves out what an error message quotes, and never throws on a strange rejection', async () => {
    const { win } = stubPage();
    const diary = await loadDiary('1');
    diary.startTestDiary();
    diary.scriptError('error', 'Unexpected token \'x\', "Jef\'s save" is not valid JSON', 'a.js:3');
    const text = diary.diaryText();
    expect(text).not.toContain('save');
    expect(text).toContain('Unexpected token "…", "…" is not valid JSON');
    expect(() => win.fire('unhandledrejection', { reason: Object.create(null) })).not.toThrow();
    expect(diary.diaryText()).toContain('unhandled rejection: (a value that cannot be shown)');
  });
});

describe('the mark of a run that ended on screen', () => {
  it('is set while shown, cleared on hidden and closed, and noticed at the next launch', async () => {
    const storage = memoryStorage();
    const { win, doc } = stubPage(storage);
    let diary = await loadDiary('1');
    diary.startTestDiary();
    expect(storage.stored.get(diary.FOREGROUND_KEY)).toBe(VERSION);

    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    expect(storage.stored.has(diary.FOREGROUND_KEY)).toBe(false);
    doc.visibilityState = 'visible';
    doc.fire('visibilitychange');
    expect(storage.stored.has(diary.FOREGROUND_KEY)).toBe(true);
    win.fire('pagehide');
    expect(storage.stored.has(diary.FOREGROUND_KEY)).toBe(false);
    expect(lines(diary.diaryText()).map(textOf).slice(1)).toEqual(['page hidden', 'page shown', 'page closing']);

    // Left in good order: the next launch says nothing about it.
    stubPage(storage);
    diary = await loadDiary('1');
    diary.startTestDiary();
    expect(diary.diaryText()).not.toContain('ended while it was on screen');

    // This run dies on screen (the mark stays); the next launch notes it, then marks itself.
    stubPage(storage);
    diary = await loadDiary('1');
    diary.startTestDiary();
    const last = lines(diary.diaryText()).map(textOf);
    expect(last.at(-2)).toMatch(/^=== launch/);
    expect(last.at(-1)).toBe(
      `the last run (version ${VERSION}) ended while it was on screen: a crash, or closed while frozen`
    );
    expect(storage.stored.get(diary.FOREGROUND_KEY)).toBe(VERSION);
  });

  it('is not set by a launch in a hidden page', async () => {
    const { storage } = stubPage(memoryStorage(), false);
    const diary = await loadDiary('1');
    diary.startTestDiary();
    expect(storage.stored.has(diary.FOREGROUND_KEY)).toBe(false);
  });
});

describe('a release build keeps nothing', () => {
  it.each([undefined, '', '0', 'true'])('with VITE_TEST_BUILD=%s every export does nothing and writes nothing', async (flag) => {
    const { storage, win, doc } = stubPage();
    storage.stored.set('mouthlife.diag.diary', 'left by a test build\n');
    const diary = await loadDiary(flag);
    expect(diary.TEST_BUILD).toBe(false);
    // Every export but Erase Save's sweep does nothing (that one is checked below).
    const fns = Object.entries(diary).filter(
      (e): e is [string, (...args: unknown[]) => unknown] => typeof e[1] === 'function' && e[0] !== 'clearDiary'
    );
    expect(fns.length).toBeGreaterThan(15);
    for (const [, fn] of fns) {
      const out = fn('HUB', 'ARCADE', 'world_1', 0);
      if (out instanceof Promise) expect(await out).toBe('failed');
      else expect(out === undefined || out === '').toBe(true);
    }
    expect(storage.counts).toEqual({ writes: 0, removals: 0 });
    expect(win.listeners.size + doc.listeners.size).toBe(0);
    expect(diary.shareButtonHtml()).toBe('');
    expect(diary.diaryText()).toBe('');
  });

  it('Erase Save in a release build still removes a diary an earlier test build left behind', async () => {
    const { storage } = stubPage();
    storage.stored.set('mouthlife.diag.diary', 'left by a test build\n');
    storage.stored.set('mouthlife.diag.foregroundBuild', '1.0.0');
    storage.stored.set('mouthlife_save_v2', '{}');
    const diary = await loadDiary(undefined);
    expect(diary.TEST_BUILD).toBe(false);
    diary.clearDiary();
    expect(storage.stored.has('mouthlife.diag.diary')).toBe(false);
    expect(storage.stored.has('mouthlife.diag.foregroundBuild')).toBe(false);
    expect(storage.stored.has('mouthlife_save_v2')).toBe(true);
    expect(storage.counts.writes).toBe(0);
  });

  it('decides once, at module level, so Vite can leave the diary out of a release build (source text)', () => {
    const src = read('src/engine/diagnostics/testDiary.ts');
    expect(src).toContain("export const TEST_BUILD: boolean = import.meta.env.VITE_TEST_BUILD === '1';");
    // Every exported function starts by returning when this is not a test build.
    const bodies = [...src.matchAll(/^export (?:async )?function (\w+)\([^)]*\)[^{]*\{\n([^\n]*)/gm)];
    expect(bodies.length).toBeGreaterThan(15);
    // ...except Erase Save's sweep, which only removes keys (see the test above).
    for (const [, name, firstLine] of bodies) {
      if (name === 'clearDiary') continue;
      expect(firstLine.trim(), name).toMatch(/^if \(!TEST_BUILD(\s*\|\|[^)]*)?\) return/);
    }
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.build).toBe('tsc --noEmit && vite build');
    expect(pkg.scripts['build:test']).toContain('VITE_TEST_BUILD=1 vite build');
  });
});

describe('sharing and Erase Save', () => {
  it('puts "Share test diary" and a TEST BUILD mark in the Sync sheet, untranslated', async () => {
    stubPage();
    const diary = await loadDiary('1');
    const html = diary.shareButtonHtml();
    expect(html).toMatch(/^<button type="button" class="btn btn-sm" data-share-test-diary data-no-translate>/);
    expect(html).toContain('Share test diary');
    expect(html).toMatch(/<span data-no-translate[^>]*>TEST BUILD<\/span>/);
    expect(html).not.toMatch(/<a\b|href=|https?:|mailto:/i);
    const hub = read('src/ui/CompanionHubOverlay.ts');
    expect(hub.indexOf('${diary.shareButtonHtml()}')).toBeGreaterThan(hub.indexOf('id="btn-reset-save"'));
    // Outside what the text extractor reads: the diary's English never reaches the translations.
    expect(read('scripts/i18n-extract.mjs')).not.toContain('src/engine/diagnostics');
  });

  it('copies to the clipboard in a browser without a share sheet', async () => {
    stubPage();
    const diary = await loadDiary('1');
    diary.note('a line');
    let copied = '';
    vi.stubGlobal('navigator', { userAgent: '', clipboard: { writeText: async (t: string) => void (copied = t) } });
    expect(await diary.shareDiary()).toBe('copied');
    expect(copied).toBe(diary.diaryText());
  });

  it('a share sheet closed by the tester is not followed by the clipboard', async () => {
    stubPage();
    const diary = await loadDiary('1');
    let copied = false;
    vi.stubGlobal('navigator', {
      userAgent: '',
      share: async () => {
        throw Object.assign(new Error('closed'), { name: 'AbortError' });
      },
      clipboard: { writeText: async () => void (copied = true) },
    });
    expect(await diary.shareDiary()).toBe('cancelled');
    expect(copied).toBe(false);
  });

  it('Erase Save empties the diary; the mark of this run comes straight back while it is on screen', async () => {
    const { storage } = stubPage();
    const diary = await loadDiary('1');
    const { SaveSystem } = await import('../src/engine/persistence/SaveSystem');
    const { EventBus } = await import('../src/engine/EventBus');
    diary.startTestDiary();
    storage.stored.set(diary.FOREGROUND_KEY, 'an older run');
    expect(storage.stored.has(diary.DIARY_KEY)).toBe(true);
    const sys = new SaveSystem(new EventBus(), storage);
    sys.load(Date.now());
    sys.resetToFreshSave();
    expect(storage.stored.has(diary.DIARY_KEY)).toBe(false);
    expect(diary.lastNote()).toBe('');
    // the old mark is gone, and this run, still on screen, is marked again (a crash now is noticed)
    expect(storage.stored.get(diary.FOREGROUND_KEY)).not.toBe('an older run');
    expect(storage.stored.has(diary.FOREGROUND_KEY)).toBe(true);
  });
});
