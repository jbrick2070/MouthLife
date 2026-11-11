import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/engine/EventBus';
import { HabitBank } from '../src/engine/persistence/HabitBank';
import {
  decodeSaveFromSyncCode,
  encodeSaveToSyncCode,
  migrateSave,
  SaveSystem,
} from '../src/engine/persistence/SaveSystem';

describe('SaveSystem & HabitBank', () => {
  it('migrates legacy MouthLifeSaveV1 fixtures and strips unknown registry IDs safely', () => {
    const v1Fixture = {
      schemaVersion: 1,
      saveRevision: 4,
      totalBrushStamps: 7,
      fluorideCrystals: 185,
      pendingSupplyBeacons: 3,
      remineralizedBuffRunsRemaining: 2,
      dailySlotsByDate: { '2026-11-10': 2 },
      unlockedUpgrades: ['angled_bass_bristles', 'unknown_alien_laser'],
      equippedBrushUpgrade: 'angled_bass_bristles',
      unlockedHistoryNotes: ['1498_beijing_1683_delft', 'fake_note_999'],
      worldProgress: {
        world_1: {
          completed: true,
          bestScore: 8920,
          bestCleanlinessPct: 98.4,
          citizensRescuedMax: 10,
        },
      },
    };

    const migrated = migrateSave(v1Fixture, 1_700_000_000_000);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.totalBrushStamps).toBe(7);
    expect(migrated.fluorideIons).toBe(185);
    expect(migrated.remineralizedOverdriveRuns).toBe(2);
    expect(migrated.unlockedUpgrades).toEqual(['angled_bass_array']);
    expect(migrated.equippedUpgrades.brush).toBe('angled_bass_array');
    expect(migrated.unlockedHistoryNotes).toContain('cosmic_hydroxyapatite');
    expect(migrated.unlockedHistoryNotes).toContain('1498_beijing_1683_delft');
    expect(migrated.unlockedHistoryNotes).not.toContain('fake_note_999');
    expect(migrated.worlds.world_1.completed).toBe(true);
    expect(migrated.worlds.world_1.sitesRestoredMax).toBe(10);
  });

  it('never decays Habit Stamps across 90 missed days and enforces 2 full + 3 courtesy daily caps', () => {
    const bus = new EventBus();
    const sys = new SaveSystem(bus);
    const save = sys.load(1_700_000_000_000);

    const day1 = new Date(2026, 5, 1, 8, 0, 0);
    const s1 = HabitBank.completeBrushAlong(save, { withFlossBonus: true, date: day1 });
    expect(s1.slotType).toBe('full');
    expect(s1.stampAwarded).toBe(true);
    expect(s1.ionsAwarded).toBe(75); // 50 + 25 Floss bonus

    const s2 = HabitBank.completeBrushAlong(save, { withFlossBonus: false, date: day1 });
    expect(s2.slotType).toBe('full');
    expect(s2.ionsAwarded).toBe(50);

    // Sessions 3..5 same day award courtesy tips (+5 Ions, no stamp inflation)
    for (let i = 0; i < 3; i++) {
      const tip = HabitBank.completeBrushAlong(save, { withFlossBonus: true, date: day1 });
      expect(tip.slotType).toBe('tip');
      expect(tip.stampAwarded).toBe(false);
      expect(tip.ionsAwarded).toBe(5);
    }

    // Session 6 same day is capped
    const s6 = HabitBank.completeBrushAlong(save, { withFlossBonus: true, date: day1 });
    expect(s6.slotType).toBe('capped');
    expect(s6.ionsAwarded).toBe(0);
    expect(save.totalBrushStamps).toBe(2);

    // 90 days later: zero stamp loss!
    const day91 = new Date(day1.getTime() + 90 * 86_400_000);
    sys.save(save, day91.getTime());
    expect(sys.getSave().totalBrushStamps).toBe(2);
  });

  it('decrements beacons per pickup, decrements Overdrive only on completed Arcade run, and roundtrips UTF-8 ML2 Sync Codes', () => {
    const bus = new EventBus();
    const sys = new SaveSystem(bus);
    const save = sys.load(1_700_000_000_000);
    save.playerProfile.displayName = 'Maya Lin-Okafor 🦷✨';
    save.pendingSupplyBeacons = 4;
    save.remineralizedOverdriveRuns = 2;
    sys.save(save);

    sys.consumeSingleSupplyBeacon();
    expect(sys.getSave().pendingSupplyBeacons).toBe(3);
    expect(sys.getSave().remineralizedOverdriveRuns).toBe(2);

    // Completed Arcade run decrements Overdrive by 1 and unlocks world_1 upgrade
    sys.recordMissionCompletion({
      mode: 'ARCADE',
      worldId: 'world_1',
      won: true,
      breakdown: {
        restorationPts: 5000,
        techniquePts: 2200,
        ecologyPts: 1200,
        parTimePts: 1000,
        totalScore: 9400,
        grade: 'FLUORAPATITE_GOLD',
        cleanlinessPct: 100,
        sitesRestored: 10,
        sitesTotal: 10,
        elapsedSec: 200,
        ionsEarned: 94,
      },
      historyNoteIds: ['1498_beijing_1683_delft'],
    });
    expect(sys.getSave().remineralizedOverdriveRuns).toBe(1);
    expect(sys.getSave().unlockedUpgrades).toContain('angled_bass_array');

    const code = encodeSaveToSyncCode(sys.getSave());
    expect(code.startsWith('ML2:')).toBe(true);
    const decoded = decodeSaveFromSyncCode(code);
    expect(decoded.playerProfile.displayName).toBe('Maya Lin-Okafor 🦷✨');
    expect(decoded.worlds.world_1.bestGrade).toBe('FLUORAPATITE_GOLD');

    expect(() => decodeSaveFromSyncCode('BAD_PREFIX:abc')).toThrow();
    expect(() => decodeSaveFromSyncCode('ML2:!!!not_base64!!!')).toThrow();
  });
});
