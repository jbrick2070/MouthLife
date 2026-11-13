import {
  BRUSH_ALONG_BOTH_EXTRAS_MULT,
  BRUSH_ALONG_FULL_IONS,
  BRUSH_ALONG_ONE_EXTRA_MULT,
  BRUSH_ALONG_TIP_IONS,
  DAILY_COURTESY_TIP_CAP,
  DAILY_FULL_REWARD_CAP,
  MAX_OVERDRIVE_RUNS,
  MAX_SUPPLY_BEACONS,
} from '../../config/gameConfig';
import { CompanionArchSim } from '../companion/CompanionArchSim';
import type { MouthLifeSaveV2 } from '../types';

export function formatLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Fluoride Ions for one full brushing session. Brushing is the base reward; flossing and the
 * fluoride rinse multiply it: one of them x1.5, both x2 (50 / 75 / 100).
 */
export function brushAlongIons(withFloss: boolean, withMouthwash: boolean): number {
  const extras = (withFloss ? 1 : 0) + (withMouthwash ? 1 : 0);
  const mult = extras === 2 ? BRUSH_ALONG_BOTH_EXTRAS_MULT : extras === 1 ? BRUSH_ALONG_ONE_EXTRA_MULT : 1;
  return Math.round(BRUSH_ALONG_FULL_IONS * mult);
}

export function brushAlongMultiplier(withFloss: boolean, withMouthwash: boolean): number {
  return brushAlongIons(withFloss, withMouthwash) / BRUSH_ALONG_FULL_IONS;
}

export class HabitBank {
  /**
   * Records completion of a 2-Minute Sink Brush-Along session.
   * Never penalizes missed days; caps daily full rewards at 2 and courtesy tips at 3.
   * A full reward is 50 F-, +25 with the floss stage, +25 with the fluoride rinse stage (100 max),
   * plus one Habit Stamp, one Supply Beacon and one Overdrive run (same as the native app).
   */
  static completeBrushAlong(
    save: MouthLifeSaveV2,
    options: { withFlossBonus: boolean; withMouthwashBonus?: boolean; date?: Date }
  ): {
    ionsAwarded: number;
    stampAwarded: boolean;
    slotType: 'full' | 'tip' | 'capped';
  } {
    const now = options.date ?? new Date();
    const dateKey = formatLocalDateKey(now);
    const slot = save.dailySlotsByDate[dateKey] ?? { fullRewards: 0, tips: 0 };

    let ionsAwarded = 0;
    let stampAwarded = false;
    let slotType: 'full' | 'tip' | 'capped' = 'capped';

    if (slot.fullRewards < DAILY_FULL_REWARD_CAP) {
      slot.fullRewards += 1;
      slotType = 'full';
      stampAwarded = true;
      save.totalBrushStamps += 1;
      ionsAwarded = brushAlongIons(options.withFlossBonus, options.withMouthwashBonus ?? false);
      save.pendingSupplyBeacons = Math.min(
        MAX_SUPPLY_BEACONS,
        Math.max(0, save.pendingSupplyBeacons) + 1
      );
      save.remineralizedOverdriveRuns = Math.min(
        MAX_OVERDRIVE_RUNS,
        Math.max(0, save.remineralizedOverdriveRuns) + 1
      );
    } else if (slot.tips < DAILY_COURTESY_TIP_CAP) {
      slot.tips += 1;
      slotType = 'tip';
      ionsAwarded = BRUSH_ALONG_TIP_IONS;
    }

    save.fluorideIons += ionsAwarded;
    save.dailySlotsByDate[dateKey] = slot;
    CompanionArchSim.restoreFullSmoothBask(save.companion, now.getTime());

    HabitBank.pruneOldDailyLogs(save, now);
    return { ionsAwarded, stampAwarded, slotType };
  }

  static pruneOldDailyLogs(save: MouthLifeSaveV2, refDate = new Date()): void {
    const cutoffMs = refDate.getTime() - 35 * 86_400_000;
    for (const key of Object.keys(save.dailySlotsByDate)) {
      const parts = key.split('-').map(Number);
      if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
        const entryDate = new Date(parts[0], parts[1] - 1, parts[2]);
        if (entryDate.getTime() < cutoffMs) {
          delete save.dailySlotsByDate[key];
        }
      } else {
        delete save.dailySlotsByDate[key];
      }
    }
  }
}
