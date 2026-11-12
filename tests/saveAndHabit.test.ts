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

  it('resetToFreshSave cleanly restores a Day-1 profile for beta testing', () => {
    const bus = new EventBus();
    const sys = new SaveSystem(bus);
    const save = sys.load(1_700_000_000_000);
    save.totalBrushStamps = 9;
    save.fluorideIons = 420;
    save.playerProfile.displayName = 'Veteran';
    sys.save(save, 1_700_000_100_000);
    expect(sys.getSave().totalBrushStamps).toBe(9);

    const fresh = sys.resetToFreshSave(1_700_000_200_000);
    expect(fresh.totalBrushStamps).toBe(0);
    expect(fresh.fluorideIons).toBe(0);
    expect(fresh.playerProfile.displayName).toBe('Explorer');
    expect(fresh.worlds.world_1.unlocked).toBe(true);
    expect(fresh.worlds.world_2.unlocked).toBe(false);
  });

  it('unlocks subsequent campaign worlds sequentially on stage clear and reconciles offline + unlocks on sync import', () => {
    const bus = new EventBus();
    const sys = new SaveSystem(bus);
    sys.load(1_700_000_000_000);
    expect(sys.getSave().worlds.world_2.unlocked).toBe(false);
    expect(sys.getSave().worlds.world_5.unlocked).toBe(false);

    // Clearing World 1 unlocks World 2 immediately even with only 1 Habit Stamp (< 4 stamp milestone)
    sys.recordMissionCompletion({
      mode: 'ARCADE',
      worldId: 'world_1',
      won: true,
      breakdown: {
        restorationPts: 4800,
        techniquePts: 2000,
        ecologyPts: 1200,
        parTimePts: 900,
        totalScore: 8900,
        grade: 'S',
        cleanlinessPct: 96,
        sitesRestored: 10,
        sitesTotal: 10,
        elapsedSec: 190,
        ionsEarned: 89,
      },
      historyNoteIds: [],
      nowEpochMs: 1_700_000_010_000,
    });
    expect(sys.getSave().totalBrushStamps).toBe(1);
    expect(sys.getSave().worlds.world_2.unlocked).toBe(true);
    expect(sys.getSave().worlds.world_3.unlocked).toBe(false);

    // Exporting at t0 in Smooth Bask and importing 6 hours later reconciles idle ions + merged stamp auto-unlocks
    const src = new SaveSystem(new EventBus());
    const t0 = 1_700_000_000_000;
    const srcSave = src.load(t0);
    srcSave.companion.smoothnessIndex = 100;
    srcSave.companion.unclaimedIdleIons = 0;
    srcSave.companion.lastEvaluatedEpochMs = t0;
    src.save(srcSave, t0);
    const code = src.exportSyncCode();

    const dst = new SaveSystem(new EventBus());
    const dstSave = dst.load(t0);
    dstSave.totalBrushStamps = 8; // Enough to unlock World 3 (8 stamps) + Hydro-Sonic (6 stamps)
    dst.save(dstSave, t0);

    const sixHoursLater = t0 + 6 * 3_600_000;
    const merged = dst.importSyncCode(code, sixHoursLater);
    expect(merged.companion.unclaimedIdleIons).toBe(36); // 6h * 6 Ions/hr Smooth Bask
    expect(merged.worlds.world_3.unlocked).toBe(true);
    expect(merged.unlockedUpgrades).toContain('hydro_sonic_pulse');
  });
});
