/**
 * Grown-up choices for the brushing timer. They live outside the save (like the floss tool and
 * rinse length), under the same names the native app uses.
 */

/**
 * Whether the fluoride rinse step follows brushing and flossing. It is for ages 6 and up, so it stays
 * off until a grown-up turns it on (behind the grown-up question).
 */
export const INCLUDE_RINSE_KEY = 'mouthlife.pacer.includeRinse';

/**
 * A choice made on this page that storage refused to keep. It wins over whatever storage still
 * holds for the rest of the visit, so a grown-up turning rinse off is obeyed at once even when the
 * old "on" can still be read (M06).
 */
let unsavedThisVisit: boolean | null = null;

export function readIncludeRinse(): boolean {
  if (unsavedThisVisit !== null) return unsavedThisVisit;
  try {
    return window.localStorage.getItem(INCLUDE_RINSE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Returns false when the choice could not be kept past this visit. */
export function writeIncludeRinse(on: boolean): boolean {
  try {
    window.localStorage.setItem(INCLUDE_RINSE_KEY, on ? '1' : '0');
    unsavedThisVisit = null;
    return true;
  } catch {
    unsavedThisVisit = on;
    return false;
  }
}

/**
 * Whether this device has shown the one-time "Time Your Real Brush" card before its first
 * 2-Min Brush. Device-local, outside the save and the Sync Code; Erase Save clears it. Where
 * storage is refused, the card shows once per visit instead. Native: the same key in UserDefaults.
 */
export const HAS_SEEN_BRUSH_INTRO_KEY = 'mouthlife.pacer.hasSeenIntro';
let brushIntroSeenThisVisit = false;

export function readHasSeenBrushIntro(): boolean {
  if (brushIntroSeenThisVisit) return true;
  try {
    return window.localStorage.getItem(HAS_SEEN_BRUSH_INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

export function markHasSeenBrushIntro(): void {
  brushIntroSeenThisVisit = true;
  try {
    window.localStorage.setItem(HAS_SEEN_BRUSH_INTRO_KEY, '1');
  } catch {
    // Kept for this visit only.
  }
}

export function clearHasSeenBrushIntro(): void {
  brushIntroSeenThisVisit = false;
  try {
    window.localStorage.removeItem(HAS_SEEN_BRUSH_INTRO_KEY);
  } catch {
    // Nothing stored to clear.
  }
}

/**
 * Brush reminders, set by a grown-up: on or off, and the morning and evening times (minutes after
 * midnight). The web edition can only remind while the page is open; the native app uses
 * notifications.
 */
export const REMINDERS_ON_KEY = 'mouthlife.reminders.on';
export const REMINDER_MORNING_KEY = 'mouthlife.reminders.morning';
export const REMINDER_EVENING_KEY = 'mouthlife.reminders.evening';

export interface ReminderPrefs {
  on: boolean;
  morning: number;
  evening: number;
}

const DEFAULT_REMINDERS: ReminderPrefs = { on: false, morning: 7 * 60 + 30, evening: 19 * 60 + 30 };
let remindersThisVisit: ReminderPrefs | null = null;

function readMinutes(key: string, fallback: number): number {
  const n = Number(window.localStorage.getItem(key));
  return window.localStorage.getItem(key) !== null && Number.isInteger(n) && n >= 0 && n < 1440 ? n : fallback;
}

export function readReminders(): ReminderPrefs {
  // A choice storage refused to keep wins for the rest of the visit (as for rinse, M06).
  if (remindersThisVisit) return { ...remindersThisVisit };
  try {
    const on = window.localStorage.getItem(REMINDERS_ON_KEY);
    return {
      on: on === '1',
      morning: readMinutes(REMINDER_MORNING_KEY, DEFAULT_REMINDERS.morning),
      evening: readMinutes(REMINDER_EVENING_KEY, DEFAULT_REMINDERS.evening),
    };
  } catch {
    return { ...(remindersThisVisit ?? DEFAULT_REMINDERS) };
  }
}

export function writeReminders(prefs: ReminderPrefs): void {
  try {
    window.localStorage.setItem(REMINDERS_ON_KEY, prefs.on ? '1' : '0');
    window.localStorage.setItem(REMINDER_MORNING_KEY, String(prefs.morning));
    window.localStorage.setItem(REMINDER_EVENING_KEY, String(prefs.evening));
    remindersThisVisit = null;
  } catch {
    // Storage blocked: the choice lasts for this visit only.
    remindersThisVisit = { ...prefs };
  }
}
