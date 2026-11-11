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

  it('never lowers monotonic brush stamps when importing an older save', () => {
    const a = freshSave();
    const oldCode = a.exportSyncCode();
    a.getSave().totalBrushStamps = 9;
    a.importSyncCode(oldCode);
    expect(a.getSave().totalBrushStamps).toBeGreaterThanOrEqual(9);
  });
});
