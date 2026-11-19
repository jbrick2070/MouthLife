import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/engine/EventBus';
import { SaveSystem } from '../src/engine/persistence/SaveSystem';

function freshSave() {
  const sys = new SaveSystem(new EventBus());
  sys.load(1_700_000_000_000);
  return sys;
}

describe('Sync Code import resilience', () => {
  const bad: Array<[string, string]> = [
    ['empty', ''],
    ['whitespace', '   '],
    ['not base64', '%%%not-a-code%%%'],
    ['valid base64 but not JSON', btoa('hello world')],
    ['JSON of the wrong shape', btoa(JSON.stringify({ hello: 'world' }))],
    ['wrong schema version', btoa(JSON.stringify({ schemaVersion: 99, totalBrushStamps: 5 }))],
  ];

  for (const [label, code] of bad) {
    it(`rejects ${label} without touching existing progress`, () => {
      const sys = freshSave();
      const before = JSON.stringify(sys.getSave());
      expect(() => sys.importSyncCode(code)).toThrow();
      expect(JSON.stringify(sys.getSave())).toBe(before);
    });
  }

  it('rejects a truncated valid code', () => {
    const sys = freshSave();
    const code = sys.exportSyncCode();
    const before = JSON.stringify(sys.getSave());
    expect(() => sys.importSyncCode(code.slice(0, Math.floor(code.length / 2)))).toThrow();
    expect(JSON.stringify(sys.getSave())).toBe(before);
  });

  it('merges an older code without erasing newer progress', () => {
    const a = freshSave();
    const oldCode = a.exportSyncCode();
    const save = a.getSave();
    save.fluorideIons = 412;
    save.worlds.world_1 = { ...save.worlds.world_1, completed: true, timesCleared: 2, bestScore: 9900, bestGrade: 'S' };
    save.unlockedHistoryNotes = [...save.unlockedHistoryNotes, 'note_newer'];
    a.save(save, save.lastSavedEpochMs + 1000);
    const merged = a.importSyncCode(oldCode);
    expect(merged.fluorideIons).toBe(412);
    expect(merged.worlds.world_1.completed).toBe(true);
    expect(merged.worlds.world_1.bestScore).toBe(9900);
    expect(merged.worlds.world_1.bestGrade).toBe('S');
    expect(merged.unlockedHistoryNotes).toContain('note_newer');
  });

  it('never lowers monotonic brush stamps when importing an older save', () => {
    const a = freshSave();
    const oldCode = a.exportSyncCode();
    a.getSave().totalBrushStamps = 9;
    a.importSyncCode(oldCode);
    expect(a.getSave().totalBrushStamps).toBeGreaterThanOrEqual(9);
  });
});
