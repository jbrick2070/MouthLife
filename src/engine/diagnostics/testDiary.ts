/**
 * The test diary, for the browser and the Android app: the twin of the native app's `TestDiary`
 * and `AppDiagnostics` (MouthLifeCore/Persistence/TestDiary.swift, MouthLifeApp/Sync/AppDiagnostics.swift).
 *
 * A short diary of what the game was doing, kept in this page's own storage, so a freeze or a crash
 * a tester meets leaves something to read ("it stopped answering on the brush screen, 40 s in"). It
 * holds no personal data: screens, brush stages, page and app events, script errors (message and
 * file:line only), the version and the kind of device. Nothing is ever sent anywhere; a tester
 * shares it themself with "Share test diary" in the Sync sheet, and Erase Save empties it.
 *
 * Test builds only: `npm run build:test`, which sets VITE_TEST_BUILD=1. In any other build
 * `TEST_BUILD` is the constant false, every export below returns at once, and Vite leaves out
 * everything behind it, so the public page and the Play release keep nothing (public/privacy.html).
 *
 * The lines are English, for testers, and are put together here rather than by the screens that
 * note them: the text extractor (scripts/i18n-extract.mjs) reads every sentence in src/ui,
 * src/main.ts and the other screen code as text to translate, and this folder is outside what it
 * reads. So a screen passes only values (`diary.screen(prev, next)`, `diary.brushStage('floss')`).
 * Never note anything per frame.
 */
import { isNativeAndroid, onNativeLifecycleChanged, shareNativeText } from '../nativePlatform';

/** Made with `npm run build:test`. A constant, so a release build drops everything behind it. */
export const TEST_BUILD: boolean = import.meta.env.VITE_TEST_BUILD === '1';

/** The diary itself: one line per note, oldest first. */
export const DIARY_KEY = 'mouthlife.diag.diary';
/** The mark of a run that is on screen (the native app's name for the same mark). */
export const FOREGROUND_KEY = 'mouthlife.diag.foregroundBuild';
/** Lines kept after the diary is trimmed, and the count at which it is trimmed (as on native). */
export const DIARY_KEEP_LINES = 250;
export const DIARY_MAX_LINES = 400;
/** The same error is noted at most once in this long, and at most this many errors per launch. */
export const ERROR_REPEAT_GAP_MS = 5000;
export const ERRORS_PER_WINDOW = 20;
/** The window ERRORS_PER_WINDOW counts over: a long session still notes a new error hours later. */
export const ERROR_WINDOW_MS = 10 * 60 * 1000;
/** The file a browser without sharing or a clipboard saves. */
export const DIARY_FILE_NAME = 'MouthLife-test-diary.txt';

const VERSION: string = import.meta.env.VITE_APP_VERSION ?? '?';
/** A line longer than this is cut: a runaway message must not fill the page's storage. */
const MAX_LINE_CHARS = 1000;

// --------------------------------------------------------------- storage (never throws)

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked: the diary simply keeps less.
  }
}

function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing stored to clear.
  }
}

// --------------------------------------------------------------- the diary

let lastText = '';

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** "MM-dd HH:mm:ss.SSS" in local time, as the native diary stamps its lines. */
function stamp(d: Date): string {
  return (
    `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  );
}

/**
 * Adds a line and trims the diary when it has grown past DIARY_MAX_LINES. `rememberAsLast: false`
 * is for lines that are not something the game is doing (an error): `lastNote` then still names
 * the screen or the brush stage.
 */
function append(text: string, rememberAsLast = true, now = new Date()): void {
  if (rememberAsLast) lastText = text;
  // One line per note, whatever the text holds.
  const flat = text.replace(/\r|\n/g, ' ').slice(0, MAX_LINE_CHARS);
  const stored = readKey(DIARY_KEY);
  let lines = stored ? stored.split('\n').filter((line) => line.length > 0) : [];
  lines.push(`${stamp(now)}  ${flat}`);
  if (lines.length > DIARY_MAX_LINES) lines = lines.slice(-DIARY_KEEP_LINES);
  writeKey(DIARY_KEY, lines.join('\n') + '\n');
}

/** Adds a line (for code outside the screens; screens use the named moments below). */
export function note(text: string, rememberAsLast = true): void {
  if (!TEST_BUILD) return;
  append(text, rememberAsLast);
}

/** The most recent line's text (without its time): what the game was last known to be doing. */
export function lastNote(): string {
  if (!TEST_BUILD) return '';
  return lastText;
}

/** The whole diary, oldest line first. */
export function diaryText(): string {
  if (!TEST_BUILD) return '';
  return readKey(DIARY_KEY) ?? '';
}

/** Every key the diary has ever used starts with this. */
const DIAGNOSTICS_KEY_PREFIX = 'mouthlife.diag.';

/**
 * Erase Save erases everything the game has kept: the diary and the mark of the last run. This one
 * also runs in a release build, which never writes a diary: a phone or browser that once ran a
 * test build of the game may still hold one, and "erase all saved data" must take it too. It only
 * removes keys, so the release build still keeps nothing.
 */
export function clearDiary(): void {
  lastText = '';
  try {
    const storage = window.localStorage;
    const doomed: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(DIAGNOSTICS_KEY_PREFIX)) doomed.push(key);
    }
    for (const key of doomed) storage.removeItem(key);
  } catch {
    // Storage blocked: there is nothing it could have kept.
  }
  // Erased while the game is on screen: the mark of this run comes straight back (test builds only).
  if (TEST_BUILD && started && pageIsVisible()) markOnScreen();
}

// --------------------------------------------------------------- moments (the app's crumbs)

/** A screen change (native "screen home -> brushAlong"); a stage names its city. */
export function screen(prev: string, next: string, stageId?: string): void {
  if (!TEST_BUILD) return;
  const onStage = next === 'ARCADE' || next === 'PULP_RESCUE';
  append(`screen ${prev} -> ${next}${onStage && stageId ? ` ${stageId}` : ''}`);
}

export function brushStarted(): void {
  if (!TEST_BUILD) return;
  append('brush started');
}

export function brushPaused(paused: boolean, elapsedSec: number): void {
  if (!TEST_BUILD) return;
  append(`brush ${paused ? 'paused' : 'resumed'} at ${Math.floor(elapsedSec)} s`);
}

/** A stage ran its time (or floss was skipped to the rinse card): a Start card waits. */
export function brushStageEnded(stage: string, next: string): void {
  if (!TEST_BUILD) return;
  append(`brush: ${stage} ended, Start card for ${next}`);
}

export function brushStage(stage: 'floss' | 'rinse'): void {
  if (!TEST_BUILD) return;
  append(`brush: ${stage} starts`);
}

/** Home in the middle of a brush, with the brush kept (it is paid next: `brushFinished`). */
export function brushLeftForHome(elapsedSec: number): void {
  if (!TEST_BUILD) return;
  append(`brush left for Home at ${Math.floor(elapsedSec)} s: kept`);
}

export function brushFinished(fullBrush: boolean, withFloss: boolean, withRinse: boolean): void {
  if (!TEST_BUILD) return;
  append(`brush finished: ${fullBrush ? 'full' : 'good try'}${withFloss ? ', floss' : ''}${withRinse ? ', rinse' : ''}`);
}

/** A brush the last visit never finished, paid quietly at this start (`recoverPendingBrush`). */
export function unfinishedBrushPaid(brushedSec: number, fullBrush: boolean): void {
  if (!TEST_BUILD) return;
  append(
    `a brush the last run left unfinished is paid now: ${Math.floor(brushedSec)} s brushed, ${fullBrush ? 'full' : 'good try'}`
  );
}

/** The stage's pause card went up or down. */
export function stagePause(paused: boolean): void {
  if (!TEST_BUILD) return;
  append(`stage pause ${paused ? 'on' : 'off'}`);
}

export function finaleStarts(kind: string, worldIndex: number): void {
  if (!TEST_BUILD) return;
  append(`finale starts (${kind}, city ${worldIndex})`);
}

export function finaleOver(): void {
  if (!TEST_BUILD) return;
  append('finale over');
}

// --------------------------------------------------------------- script errors

const errorLastAt = new Map<string, number>();
/** When the errors noted in the current window were noted (at most ERRORS_PER_WINDOW). */
const errorTimes: number[] = [];

/** The file's own name (no folders, no query) and the line, or "" when unknown. */
function where(file: string | undefined, line: number | undefined): string {
  const name = (file ?? '').split(/[?#]/)[0].split('/').pop() ?? '';
  if (!name) return '';
  return line ? `${name}:${line}` : name;
}

/** The first file:line an error's stack names. */
function whereInStack(stack: string | undefined): string {
  const m = /([\w.-]+\.m?[jt]sx?)(?:\?[^\s:)]*)?:(\d+)/.exec(stack ?? '');
  return m ? `${m[1]}:${m[2]}` : '';
}

/**
 * A script error or an unhandled promise rejection: its message and file:line only. Anything the
 * message quotes is left out (a parse error can quote a few characters of what it read, a name
 * from a save, say). The same line is noted at most once in ERROR_REPEAT_GAP_MS, and at most
 * ERRORS_PER_WINDOW in ERROR_WINDOW_MS, so an error thrown every frame cannot flood the page's
 * storage and a real one later in a long session is still noted.
 */
export function scriptError(kind: 'error' | 'unhandled rejection', message: string, at: string, nowMs = Date.now()): void {
  if (!TEST_BUILD) return;
  const brief = message
    .slice(0, 400)
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '"…"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  const text = `${kind}: ${brief || '(no message)'}${at ? ` (${at})` : ''}`;
  const last = errorLastAt.get(text);
  if (last !== undefined && nowMs - last < ERROR_REPEAT_GAP_MS) return;
  while (errorTimes.length > 0 && nowMs - errorTimes[0] >= ERROR_WINDOW_MS) errorTimes.shift();
  if (errorTimes.length >= ERRORS_PER_WINDOW) return;
  errorLastAt.set(text, nowMs);
  errorTimes.push(nowMs);
  append(lastText ? `${text} • last: ${lastText}` : text, false);
}

/** Whatever was thrown, as text, without ever throwing itself. */
function describeReason(reason: unknown): string {
  try {
    return String(reason);
  } catch {
    return '(a value that cannot be shown)';
  }
}

// --------------------------------------------------------------- the launch and the mark

/** iPhone, iPad, Android, Mac, Windows...: the device kind, from the browser's own description. */
function shortPlatform(userAgent: string, maxTouchPoints = 0): string {
  if (/iPhone|iPod/.test(userAgent)) return 'iPhone';
  // An iPad's Safari says "Macintosh", but a Mac has no touch screen.
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(userAgent)) return 'Android';
  if (/CrOS/.test(userAgent)) return 'ChromeOS';
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'Mac';
  if (/Linux/.test(userAgent)) return 'Linux';
  return 'other';
}

function pageIsVisible(): boolean {
  try {
    return document.visibilityState === 'visible';
  } catch {
    return false;
  }
}

/** Set while the game is on screen, taken away when it leaves in good order. */
/**
 * The mark is one key for the whole site, so in a browser with two tabs of the game open, one tab
 * leaving the screen clears it for both, and a tab opening while another shows the game notes a
 * "crash" that was not one. The Android app has a single page, where neither can happen.
 */
function markOnScreen(): void {
  writeKey(FOREGROUND_KEY, VERSION);
}

function clearOnScreenMark(): void {
  removeKey(FOREGROUND_KEY);
}

let started = false;

/**
 * Once, first thing at launch: the launch line, the mark the last run may have left, and the page's
 * own events (shown, hidden, closed, the Android app's background and foreground, script errors).
 */
export function startTestDiary(): void {
  if (!TEST_BUILD || started) return;
  started = true;
  let platform = 'other';
  try {
    platform = shortPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  } catch {
    // No navigator (never in a page).
  }
  append(
    `=== launch • MouthLife ${VERSION} (test build, ${import.meta.env.MODE}) • ` +
      `${isNativeAndroid() ? 'Android app' : 'browser'} • ${platform}`
  );
  // Still there means the last run never got to leave the screen: the tab or the app was killed
  // while in use (a crash, or closed while frozen). Leaving in good order takes it away.
  const previous = readKey(FOREGROUND_KEY);
  if (previous !== null) {
    removeKey(FOREGROUND_KEY);
    append(`the last run (version ${previous}) ended while it was on screen: a crash, or closed while frozen`);
  }
  if (pageIsVisible()) markOnScreen();

  try {
    document.addEventListener('visibilitychange', () => {
      if (pageIsVisible()) {
        markOnScreen();
        append('page shown');
      } else {
        clearOnScreenMark();
        append('page hidden');
      }
    });
    window.addEventListener('pagehide', () => {
      clearOnScreenMark();
      append('page closing');
    });
    // Back from the browser's page cache: on screen again without a new launch.
    window.addEventListener('pageshow', (ev) => {
      if (!ev.persisted) return;
      if (pageIsVisible()) markOnScreen();
      append('page back from the browser cache');
    });
    // The diary's own listeners must never throw: the browser would report that as a new error.
    window.addEventListener('error', (ev) => {
      try {
        scriptError('error', describeReason(ev.message ?? ''), where(ev.filename, ev.lineno));
      } catch {
        // Nothing to note it with.
      }
    });
    window.addEventListener('unhandledrejection', (ev) => {
      try {
        const reason: unknown = ev.reason;
        if (reason instanceof Error) {
          scriptError('unhandled rejection', `${reason.name}: ${reason.message}`, whereInStack(reason.stack));
        } else {
          scriptError('unhandled rejection', describeReason(reason), '');
        }
      } catch {
        // Nothing to note it with.
      }
    });
  } catch {
    // Not a page (never in a build).
  }
  onNativeLifecycleChanged((active) => {
    if (active) {
      markOnScreen();
      append('Android app active');
    } else {
      clearOnScreenMark();
      append('Android app in background');
    }
  });
}

// --------------------------------------------------------------- sharing

const SHARE_ATTR = 'data-share-test-diary';
const SHARE_LABEL = '🐞 Share test diary';
let shareTriggerInstalled = false;

/**
 * Hands the diary over: the Android app's own share sheet; a browser's share sheet; else the
 * clipboard; else a file download. Says how it went, for the button's few words of confirmation.
 */
export async function shareDiary(): Promise<'shared' | 'copied' | 'downloaded' | 'cancelled' | 'failed'> {
  if (!TEST_BUILD) return 'failed';
  const text = diaryText();
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  if (isNativeAndroid()) {
    // The Android app's own share sheet; if it cannot open one, the clipboard and a file below.
    if (await shareNativeText(text, 'MouthLife test diary')) return 'shared';
  } else if (typeof nav?.share === 'function') {
    try {
      await nav.share({ text });
      return 'shared';
    } catch (err) {
      // Closed by the tester: nothing else to do. Refused by the browser: the clipboard next.
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
    }
  }
  if (typeof nav?.clipboard?.writeText === 'function') {
    try {
      await nav.clipboard.writeText(text);
      return 'copied';
    } catch {
      // No clipboard for this page: a file instead.
    }
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = DIARY_FILE_NAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

/** One listener for the button (capture phase: the game's sheets stop click bubbling). */
function installShareTrigger(): void {
  if (shareTriggerInstalled || typeof document === 'undefined') return;
  shareTriggerInstalled = true;
  document.addEventListener(
    'click',
    (e) => {
      const button = (e.target as Element | null)?.closest?.(`[${SHARE_ATTR}]`) as HTMLButtonElement | null;
      if (!button || button.disabled) return;
      button.disabled = true;
      void shareDiary().then((result) => {
        const words =
          result === 'copied' ? 'Copied to the clipboard' : result === 'failed' ? 'Could not share' : '';
        button.disabled = false;
        if (!words) return;
        button.textContent = words;
        setTimeout(() => {
          if (button.isConnected) button.textContent = SHARE_LABEL;
        }, 2500);
      });
    },
    true
  );
}

/**
 * "Share test diary" and a small TEST BUILD mark, for the Sync sheet beside Erase Save; nothing at
 * all in a release build. English and left alone by the page translator, as on native.
 */
export function shareButtonHtml(): string {
  if (!TEST_BUILD) return '';
  installShareTrigger();
  return (
    `<button type="button" class="btn btn-sm" ${SHARE_ATTR} data-no-translate>${SHARE_LABEL}</button>` +
    '<span data-no-translate style="align-self:center;font-size:0.62rem;font-weight:700;letter-spacing:0.06em;color:#fbbf24;">TEST BUILD</span>'
  );
}
