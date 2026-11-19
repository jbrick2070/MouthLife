/**
 * Grown-up choices for the brushing timer. They live outside the save (like the floss tool and
 * rinse length), under the same names the native app uses.
 */

/**
 * Whether the fluoride rinse step follows brushing and flossing. It is for ages 6 and up, so it stays
 * off until a grown-up turns it on (behind the grown-up question).
 */
export const INCLUDE_RINSE_KEY = 'mouthlife.pacer.includeRinse';

/** The last choice made on this page, for when storage is blocked. */
let thisVisit: boolean | null = null;

export function readIncludeRinse(): boolean {
  try {
    const stored = window.localStorage.getItem(INCLUDE_RINSE_KEY);
    return stored === null ? (thisVisit ?? false) : stored === '1';
  } catch {
    return thisVisit ?? false;
  }
}

export function writeIncludeRinse(on: boolean): void {
  thisVisit = on;
  try {
    window.localStorage.setItem(INCLUDE_RINSE_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the choice lasts for this visit only.
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
  try {
    const on = window.localStorage.getItem(REMINDERS_ON_KEY);
    if (on === null && remindersThisVisit) return { ...remindersThisVisit };
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
  remindersThisVisit = { ...prefs };
  try {
    window.localStorage.setItem(REMINDERS_ON_KEY, prefs.on ? '1' : '0');
    window.localStorage.setItem(REMINDER_MORNING_KEY, String(prefs.morning));
    window.localStorage.setItem(REMINDER_EVENING_KEY, String(prefs.evening));
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}
