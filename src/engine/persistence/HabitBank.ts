import {
  BRUSH_ALONG_FLOSS_IONS,
  BRUSH_ALONG_FULL_IONS,
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

export class HabitBank {
  /**
   * Records completion of a 2-Minute Sink Brush-Along session.
   * Never penalizes missed days; caps daily full rewards at 2 and courtesy tips at 3.
   */
  static completeBrushAlong(
    save: MouthLifeSaveV2,
    options: { withFlossBonus: boolean; date?: Date }
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
      ionsAwarded =
        BRUSH_ALONG_FULL_IONS + (options.withFlossBonus ? BRUSH_ALONG_FLOSS_IONS : 0);
      save.pendingSupplyBeacons = Math.min(
        MAX_SUPPLY_BEACONS,
        save.pendingSupplyBeacons + 4
      );
      save.remineralizedOverdriveRuns = Math.min(
        MAX_OVERDRIVE_RUNS,
        save.remineralizedOverdriveRuns + 2
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
