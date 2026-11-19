import { describe, expect, it } from 'vitest';
import {
  brushCount,
  brushWeek,
  clockToMinutes,
  DEFAULT_REMINDER_TIMES,
  dueReminder,
  minutesToClock,
  reminderPlan,
} from '../src/config/brushDays';

const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe('brush log', () => {
  it('shows the last seven days, oldest first, counting up to two full brushes a day', () => {
    const week = brushWeek(
      {
        '2026-11-19': { fullRewards: 1, tips: 0 },
        '2026-11-18': { fullRewards: 3, tips: 1 },
        '2026-11-13': { fullRewards: 2, tips: 0 },
        '2026-11-12': { fullRewards: 2, tips: 0 },
      },
      at(2026, 11, 19, 9)
    );
    expect(week.map((d) => d.dateKey)).toEqual([
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
    ]);
    expect(week.map((d) => d.full)).toEqual([2, 0, 0, 0, 0, 2, 1]);
    expect(week[5].tries).toBe(1);
    expect(week[6].isToday).toBe(true);
    expect(brushCount(week)).toBe(5);
  });

  it('crosses months and years', () => {
    const week = brushWeek({}, at(2027, 1, 2));
    expect(week[0].dateKey).toBe('2026-12-27');
    expect(week[6].dateKey).toBe('2027-01-02');
  });
});

describe('brush reminders', () => {
  const times = DEFAULT_REMINDER_TIMES; // 07:30 and 19:30

  it('plans each morning and evening for a week, skipping what has passed today', () => {
    const plan = reminderPlan(at(2026, 11, 19, 8, 0), times, 0);
    expect(plan[0]).toEqual({ at: at(2026, 11, 19, 19, 30), slot: 'evening' });
    expect(plan[1]).toEqual({ at: at(2026, 11, 20, 7, 30), slot: 'morning' });
    expect(plan).toHaveLength(13);
  });

  it('stays quiet today once that brush is done', () => {
    // brushed once early: no morning nudge, the evening one stays
    expect(reminderPlan(at(2026, 11, 19, 6, 0), times, 1).slice(0, 2).map((r) => r.slot)).toEqual(['evening', 'morning']);
    // brushed twice already: nothing more today
    expect(reminderPlan(at(2026, 11, 19, 6, 0), times, 2)[0]).toEqual({ at: at(2026, 11, 20, 7, 30), slot: 'morning' });
  });

  it('knows which reminder is due while the page is open', () => {
    expect(dueReminder(at(2026, 11, 19, 7, 0), times, 0)).toBeNull();
    expect(dueReminder(at(2026, 11, 19, 7, 30), times, 0)).toBe('morning');
    expect(dueReminder(at(2026, 11, 19, 9, 0), times, 1)).toBeNull();
    expect(dueReminder(at(2026, 11, 19, 20, 0), times, 1)).toBe('evening');
    expect(dueReminder(at(2026, 11, 19, 20, 0), times, 2)).toBeNull();
  });

  it('reads and writes clock times', () => {
    expect(minutesToClock(450)).toBe('07:30');
    expect(minutesToClock(1170)).toBe('19:30');
    expect(clockToMinutes('07:30')).toBe(450);
    expect(clockToMinutes('7:05')).toBe(425);
    expect(clockToMinutes('24:00')).toBeNull();
    expect(clockToMinutes('')).toBeNull();
  });
});
