import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultSave, mergeSaves } from '../src/engine/persistence/SaveSystem';
import { campaignStageNumber, shortCityName } from '../src/ui/hudHelpers';
import { HOST_CITIES } from '../src/config/hostsAndHistory';

const root = join(__dirname, '..');

describe('QA parity with the native app', () => {
  it('names the Dive city and its place in the campaign (native: testDiveLabelNamesTheCityAndItsPlace)', () => {
    expect(campaignStageNumber('world_1')).toBe(1);
    expect(campaignStageNumber('world_4')).toBe(4);
    expect(campaignStageNumber('pulp_rescue')).toBeNull();
    expect(shortCityName('Accra & Colorado Springs')).toBe('Accra');
    expect(shortCityName('Station Aurora (408 km LEO)')).toBe('Station Aurora');
    expect(shortCityName('Tokyo & Chicago')).toBe('Tokyo');
    expect(shortCityName('New Orleans')).toBe('New Orleans');
    for (const host of HOST_CITIES) expect(campaignStageNumber(host.worldId)).not.toBeNull();
  });

  it("keeps the code's tooth when restoring on a brand-new save (native: testPrologueRestoreKeepsTheCodesToothOnABrandNewSave)", () => {
    const fromOtherPhone = createDefaultSave(1_700_000_000_000);
    fromOtherPhone.companion.enamelShield = 41;
    fromOtherPhone.fluorideIons = 300;
    fromOtherPhone.hasSeenCosmicIntro = true;
    const fresh = createDefaultSave(1_700_000_900_000);
    fresh.fluorideIons = 5;
    const restored = mergeSaves(fresh, fromOtherPhone, true);
    expect(restored.companion.enamelShield).toBe(41);
    expect(restored.fluorideIons).toBe(300);
    expect(restored.hasSeenCosmicIntro).toBe(true);
    const merged = mergeSaves(fresh, fromOtherPhone);
    expect(merged.companion.enamelShield).toBe(fresh.companion.enamelShield);
    expect(merged.fluorideIons).toBe(300);
  });

  it('ends the Prologue with the same real-brush line as the native Prologue', () => {
    const web = readFileSync(join(root, 'src/ui/CosmicIntroOverlay.ts'), 'utf8');
    const swift = readFileSync(join(root, 'native-apple/MouthLifeApp/UI/CosmicIntroView.swift'), 'utf8');
    const webBodies = [...web.matchAll(/body: '([^']+)'/g)].map((m) => m[1]);
    const swiftBodies = [...swift.matchAll(/body: "([^"]+)"/g)].map((m) => m[1]);
    const lastWeb = webBodies[webBodies.length - 1];
    expect(lastWeb).toContain('Then time your real 2-minute brush at the sink.');
    expect(swiftBodies).toContain(lastWeb);
  });

  it('shows the same five hardness specimens as the native Prologue', () => {
    const web = readFileSync(join(root, 'src/ui/CosmicIntroOverlay.ts'), 'utf8');
    const swift = readFileSync(join(root, 'native-apple/Sources/MouthLifeCore/Config/MohsSpecimens.swift'), 'utf8');
    const block = web.slice(web.indexOf('const MOHS_SPECIMENS'), web.indexOf('];', web.indexOf('const MOHS_SPECIMENS')));
    const pick = (src: string, key: string, quote: string) =>
      [...src.matchAll(new RegExp(`\\b${key}: ${quote}([^${quote}]+)${quote}`, 'g'))].map((m) => m[1]);
    for (const key of ['hardness', 'name', 'shortName', 'formula', 'note']) {
      expect(pick(swift, key, '"'), key).toEqual(pick(block, key, "'"));
    }
  });
});
