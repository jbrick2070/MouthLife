/**
 * The brush log ("This week") and the grown-up brush reminders: which days had brushes, and when to
 * give a gentle nudge. Pure, so the web and the native app (BrushDays.swift) share the same rules.
 * Never a scolding: a missed day is simply an empty day.
 */

/** Full 2-minute brushes a day that count toward the goal (morning and evening). */
export const BRUSH_GOAL_PER_DAY = 2;

/** What the save keeps for each day (see HabitBank). */
export interface DailySlots {
  fullRewards: number;
  tips: number;
}

/** One day in the log. */
export interface BrushDay {
  dateKey: string;
  date: Date;
  /** Full 2-minute brushes, at most the goal. */
  full: number;
  /** Shorter brushes ("good try"). */
  tries: number;
  isToday: boolean;
}

export function dateKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The last `days` days, oldest first, today last. */
export function brushWeek(slots: Record<string, DailySlots>, today = new Date(), days = 7): BrushDay[] {
  const out: BrushDay[] = [];
  for (let back = days - 1; back >= 0; back--) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back, 12);
    const key = dateKeyOf(date);
    const slot = slots[key];
    out.push({
      dateKey: key,
      date,
      full: Math.min(BRUSH_GOAL_PER_DAY, Math.max(0, slot?.fullRewards ?? 0)),
      tries: Math.max(0, slot?.tips ?? 0),
      isToday: back === 0,
    });
  }
  return out;
}

/** Full brushes in those days (each day counts up to the goal). */
export function brushCount(week: readonly BrushDay[]): number {
  return week.reduce((n, d) => n + d.full, 0);
}

export type ReminderSlot = 'morning' | 'evening';

/** Reminder times, in minutes after midnight (local time). */
export interface ReminderTimes {
  morning: number;
  evening: number;
}

export const DEFAULT_REMINDER_TIMES: ReminderTimes = { morning: 7 * 60 + 30, evening: 19 * 60 + 30 };

/**
 * How many days ahead the native app schedules reminders: a month, so a family that has not opened
 * the app for a while is still nudged (it plans them afresh whenever it opens). Two a day makes at
 * most 60 waiting at once, under the 64 an iPhone keeps for one app.
 */
export const REMINDER_DAYS_AHEAD = 30;

/** The words of each reminder. */
export const REMINDER_TEXT: Record<ReminderSlot, string> = {
  morning: 'Time to brush! 🦷',
  evening: 'Time to brush before bed! 🌙',
};

/**
 * Whether a reminder at this slot is still wanted today: the morning one only if nothing is brushed
 * yet today, the evening one only while today's brushes are not all done.
 */
export function reminderWanted(slot: ReminderSlot, fullToday: number): boolean {
  return slot === 'morning' ? fullToday < 1 : fullToday < BRUSH_GOAL_PER_DAY;
}

/**
 * The two times in order. Settings lets them be set either way round; the earlier one is the
 * morning brush and the later one the evening brush, everywhere (M19). Native twin:
 * `BrushDays.orderedTimes`.
 */
export function orderedReminderTimes(times: ReminderTimes): ReminderTimes {
  return { morning: Math.min(times.morning, times.evening), evening: Math.max(times.morning, times.evening) };
}

/**
 * The reminders to schedule from `now`: each morning and evening for the next days, leaving out
 * today's when the time has passed or that brush is already done.
 */
export function reminderPlan(
  now: Date,
  timesAsSet: ReminderTimes,
  fullToday: number,
  days = REMINDER_DAYS_AHEAD
): { at: Date; slot: ReminderSlot }[] {
  const times = orderedReminderTimes(timesAsSet);
  const out: { at: Date; slot: ReminderSlot }[] = [];
  for (let day = 0; day < days; day++) {
    for (const slot of ['morning', 'evening'] as const) {
      const minutes = times[slot];
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, Math.floor(minutes / 60), minutes % 60);
      if (at.getTime() <= now.getTime()) continue;
      if (day === 0 && !reminderWanted(slot, fullToday)) continue;
      out.push({ at, slot });
    }
  }
  return out;
}

/**
 * The reminder due right now, for a page that can only remind while it is open: the evening one once
 * its time has come, else the morning one; none when that brush is done.
 */
export function dueReminder(now: Date, timesAsSet: ReminderTimes, fullToday: number): ReminderSlot | null {
  const times = orderedReminderTimes(timesAsSet);
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= times.evening) return reminderWanted('evening', fullToday) ? 'evening' : null;
  if (minutes >= times.morning) return reminderWanted('morning', fullToday) ? 'morning' : null;
  return null;
}

/** "07:30" ⇄ 450. */
export function minutesToClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function clockToMinutes(clock: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
