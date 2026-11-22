import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COACH_DONE_HINT_KEY,
  COACH_LINES,
  COACH_STEP_ORDER,
  coachAdvance,
  coachApplies,
  coachCurrentStep,
  coachFinished,
  newCoachState,
  type CoachEvent,
  type CoachState,
} from '../src/config/firstCityCoach';
import { plaqueCityCartridge } from '../src/worlds/plaqueCityCartridge';

const calm = { surgeReady: false, nearGap: false };
const play = (events: CoachEvent[], from: CoachState = newCoachState()) => events.reduce(coachAdvance, from);

// The same cases run in Swift (FirstCityCoachTests), so both editions coach the same way.
describe('first-city coach', () => {
  it('starts by asking for a sweep, and a touch is not a sweep', () => {
    expect(coachCurrentStep(newCoachState(), calm)).toBe('sweep');
    const touched = play([{ type: 'scrub', newlyCleaned: 3 }]);
    expect(coachCurrentStep(touched, calm)).toBe('sweep');
    const swept = play([{ type: 'scrub', newlyCleaned: 1 }], touched);
    expect(swept.done.sweep).toBe(true);
    expect(coachCurrentStep(swept, calm)).toBe('helper');
  });

  it('walks a first zone in order: sweep, helper, Scan, seal', () => {
    let s = play([{ type: 'scrub', newlyCleaned: 9 }]);
    expect(coachCurrentStep(s, calm)).toBe('helper');
    s = play([{ type: 'helperRestored' }], s);
    expect(coachCurrentStep(s, calm)).toBe('scan');
    s = play([{ type: 'scanPulsed' }], s);
    expect(coachCurrentStep(s, calm)).toBe('seal');
    s = play([{ type: 'zoneSealed' }], s);
    // After the first seal the coach waits quietly for a gap.
    expect(coachCurrentStep(s, calm)).toBeNull();
    expect(coachFinished(s)).toBe(false);
  });

  it('teaches Surge only once it is full, and then skips Scan', () => {
    let s = play([{ type: 'scrub', newlyCleaned: 9 }, { type: 'helperRestored' }]);
    expect(coachCurrentStep(s, { surgeReady: true, nearGap: false })).toBe('surge');
    s = play([{ type: 'surgeFired' }], s);
    expect(coachCurrentStep(s, calm)).toBe('seal');
    expect(coachCurrentStep(s, { surgeReady: true, nearGap: false })).toBe('seal');
  });

  it('teaches Floss at a gap, wherever the player is in the list', () => {
    const swept = play([{ type: 'scrub', newlyCleaned: 9 }]);
    expect(coachCurrentStep(swept, { surgeReady: false, nearGap: true })).toBe('floss');
    expect(coachCurrentStep(newCoachState(), { surgeReady: false, nearGap: true })).toBe('sweep');
    const sealed = play([{ type: 'helperRestored' }, { type: 'zoneSealed' }], swept);
    expect(coachCurrentStep(sealed, { surgeReady: true, nearGap: true })).toBe('floss');
    const zipped = play([{ type: 'zipped' }], sealed);
    expect(coachFinished(zipped)).toBe(true);
    expect(coachCurrentStep(zipped, { surgeReady: true, nearGap: true })).toBeNull();
  });

  it('ticks things off in any order and never un-ticks them', () => {
    const early = play([{ type: 'zipped' }, { type: 'surgeFired' }, { type: 'scanPulsed' }]);
    expect(early.done).toMatchObject({ floss: true, surge: true, scan: true, sweep: false });
    expect(coachCurrentStep(early, { surgeReady: true, nearGap: true })).toBe('sweep');
    const later = play([{ type: 'scrub', newlyCleaned: 4 }, { type: 'helperRestored' }, { type: 'zoneSealed' }], early);
    expect(coachFinished(later)).toBe(true);
    expect(play([{ type: 'scrub', newlyCleaned: 50 }, { type: 'zipped' }], later)).toEqual(later);
  });

  it('ignores bad numbers', () => {
    const s = play([{ type: 'scrub', newlyCleaned: Number.NaN }, { type: 'scrub', newlyCleaned: -5 }]);
    expect(s).toEqual(newCoachState());
  });

  it('is for a new player in city 1 only, once per device', () => {
    const none = new Set<string>();
    expect(coachApplies('world_1', 'ARCADE', false, none)).toBe(true);
    expect(coachApplies('world_1', 'ARCADE', true, none)).toBe(false);
    expect(coachApplies('world_2', 'ARCADE', false, none)).toBe(false);
    expect(coachApplies('world_1', 'PULP_RESCUE', false, none)).toBe(false);
    expect(coachApplies('world_1', 'ARCADE', false, new Set([COACH_DONE_HINT_KEY]))).toBe(false);
  });

  it('has a short line for every step that fits a phone’s one-line HUD', () => {
    for (const id of COACH_STEP_ORDER) {
      expect(COACH_LINES[id].short.length, id).toBeLessThanOrEqual(21);
      expect(COACH_LINES[id].full.length, id).toBeLessThanOrEqual(48);
    }
  });

  it('is translated in all seven other languages, short enough for a phone’s goal line', () => {
    // On a phone the coach's line has the par timer's room: two lines of about 20 Latin letters,
    // or about 10 of the wider Chinese, Japanese and Korean characters.
    const wide = new Set(['ja', 'zh', 'ko']);
    for (const lang of ['es', 'fr', 'de', 'pt', 'ja', 'zh', 'ko']) {
      const catalog: Record<string, string> = JSON.parse(readFileSync(`src/i18n/locales/${lang}.json`, 'utf8'));
      for (const id of COACH_STEP_ORDER) {
        for (const english of [COACH_LINES[id].short, COACH_LINES[id].full]) {
          expect(catalog[english], `${lang}: ${english}`).toBeTruthy();
        }
        expect([...catalog[COACH_LINES[id].short]].length, `${lang}: ${id}`).toBeLessThanOrEqual(wide.has(lang) ? 18 : 36);
      }
    }
  });

  it('says the same words in the native app, so both editions share one translation', () => {
    const swift = readFileSync('native-apple/Sources/MouthLifeCore/Config/FirstCityCoach.swift', 'utf8');
    for (const id of COACH_STEP_ORDER) {
      expect(swift, id).toContain(`case .${id}: return short ? ${JSON.stringify(COACH_LINES[id].short)} : ${JSON.stringify(COACH_LINES[id].full)}`);
    }
    expect(swift).toContain(`public static let doneHintKey = "${COACH_DONE_HINT_KEY}"`);
  });

  it('matches city 1: its first zone has helper spots but no floss gap', () => {
    const zone1 = plaqueCityCartridge.districts[0].bounds;
    expect(plaqueCityCartridge.commensalSiteSpawns.some((s) => s.districtIdx === 0)).toBe(true);
    for (const alley of plaqueCityCartridge.interdentalAlleys) {
      expect(Math.min(alley.endpointA.x, alley.endpointB.x)).toBeGreaterThan(zone1.maxX);
    }
  });
});
