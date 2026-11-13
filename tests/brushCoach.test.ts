import { describe, expect, it } from 'vitest';
import {
  BrushCoachCopy,
  BrushQuadrant,
  BrushSurface,
  COACH_LANGUAGES,
  GyroSloshSim,
  detectCoachLanguage,
  evaluateBrushPhase,
  mouthwashDurationSec,
  pacerStageEndSec,
} from '../src/config/brushCoach';
import {
  BRUSH_ALONG_FLOSS_BONUS_SEC,
  BRUSH_ALONG_MOUTHWASH_BONUS_SEC,
  BRUSH_ALONG_TOTAL_SEC,
} from '../src/config/gameConfig';
import { pickVoice } from '../src/engine/audio/VoiceCoach';
import { ClockController } from '../src/engine/ClockController';
import { EventBus } from '../src/engine/EventBus';
import { HabitBank } from '../src/engine/persistence/HabitBank';
import { SaveSystem } from '../src/engine/persistence/SaveSystem';

// These expectations mirror native-apple/Tests/MouthLifeCoreTests (BrushPhaseState, coach copy,
// mouthwash rewards, gyro slosh) so both editions stay on one timeline.

describe('3-stage Brush-Along timeline', () => {
  it('uses the native stage lengths: 2:00 brush, 0:45 floss, 1:00 or 0:30 rinse', () => {
    expect(BRUSH_ALONG_TOTAL_SEC).toBe(120);
    expect(BRUSH_ALONG_FLOSS_BONUS_SEC).toBe(45);
    expect(mouthwashDurationSec('totalCare60s')).toBe(60);
    expect(mouthwashDurationSec('quick30s')).toBe(30);
    expect(pacerStageEndSec('brushing', 60)).toBe(120);
    expect(pacerStageEndSec('flossBonus', 60)).toBe(165);
    expect(pacerStageEndSec('mouthwashBonus', 60)).toBe(225);
    expect(pacerStageEndSec('mouthwashBonus', 30)).toBe(195);
  });

  it('walks 4 quadrants x 3 surfaces in 10s steps and tracks finished quadrants', () => {
    const start = evaluateBrushPhase(0, 'brushing');
    expect(start.quadrant).toBe(BrushQuadrant.upperRight);
    expect(start.surface).toBe(BrushSurface.outerCheek);
    expect(start.phaseIndex12).toBe(0);
    expect(start.completedQuadrantsMask).toBe(0);

    const q2Chewing = evaluateBrushPhase(45, 'brushing');
    expect(q2Chewing.quadrant).toBe(BrushQuadrant.upperLeft);
    expect(q2Chewing.surface).toBe(BrushSurface.chewingGrooves);
    expect(q2Chewing.phaseIndex12).toBe(4);
    expect(q2Chewing.completedQuadrantsMask).toBe(0b0001);

    const last = evaluateBrushPhase(119.5, 'brushing');
    expect(last.quadrant).toBe(BrushQuadrant.lowerRight);
    expect(last.surface).toBe(BrushSurface.innerTongue);
    expect(last.phaseIndex12).toBe(11);
    expect(last.completedQuadrantsMask).toBe(0b0111);

    // Past the end it clamps to the final phase instead of wrapping.
    expect(evaluateBrushPhase(500, 'brushing').phaseIndex12).toBe(11);
    expect(evaluateBrushPhase(-5, 'brushing').phaseIndex12).toBe(0);
  });

  it('counts 3-2-1 in the last three seconds and pre-echoes the next quadrant', () => {
    expect(evaluateBrushPhase(6.9, 'brushing').countdownPip).toBeNull();
    expect(evaluateBrushPhase(7.2, 'brushing').countdownPip).toBe(3);
    expect(evaluateBrushPhase(8.2, 'brushing').countdownPip).toBe(2);
    expect(evaluateBrushPhase(9.2, 'brushing').countdownPip).toBe(1);
    expect(evaluateBrushPhase(9.97, 'brushing').countdownPip).toBeNull();

    // A surface change inside a quadrant does not announce a new quadrant.
    expect(evaluateBrushPhase(9.5, 'brushing').upcomingQuadrantIndex).toBe(-1);
    const edge = evaluateBrushPhase(29.5, 'brushing');
    expect(edge.upcomingQuadrantIndex).toBe(BrushQuadrant.upperLeft);
    expect(edge.preEcho01).toBeGreaterThan(0.3);
    // Nothing follows the last quadrant.
    expect(evaluateBrushPhase(119.5, 'brushing').upcomingQuadrantIndex).toBe(-1);
  });

  it('flosses the upper arch then the lower, 13 contacts each, right side first', () => {
    const first = evaluateBrushPhase(120, 'flossBonus');
    expect(first.flossIsUpper).toBe(true);
    expect(first.flossContactIndex).toBe(0);
    expect(first.flossStepIndex).toBe(0);
    expect(first.quadrant).toBe(BrushQuadrant.upperRight);
    expect(first.phaseIndex12).toBe(12);
    expect(first.completedQuadrantsMask).toBe(0b1111);

    const upperLeft = evaluateBrushPhase(120 + 20, 'flossBonus');
    expect(upperLeft.flossIsUpper).toBe(true);
    expect(upperLeft.quadrant).toBe(BrushQuadrant.upperLeft);

    const lower = evaluateBrushPhase(120 + 22.5 + 1, 'flossBonus');
    expect(lower.flossIsUpper).toBe(false);
    expect(lower.phaseIndex12).toBe(13);
    expect(lower.quadrant).toBe(BrushQuadrant.lowerRight);

    const lastContact = evaluateBrushPhase(120 + 44.9, 'flossBonus');
    expect(lastContact.flossContactIndex).toBe(12);
    expect(lastContact.flossStepIndex).toBe(2);
    expect(lastContact.quadrant).toBe(BrushQuadrant.lowerLeft);
  });

  it('splits the rinse into three equal steps for both durations', () => {
    for (const dur of [60, 30]) {
      const start = 165;
      expect(evaluateBrushPhase(start, 'mouthwashBonus', dur).mouthwashStepIndex).toBe(0);
      expect(evaluateBrushPhase(start + dur / 3 + 0.1, 'mouthwashBonus', dur).mouthwashStepIndex).toBe(1);
      const final = evaluateBrushPhase(start + dur - 0.2, 'mouthwashBonus', dur);
      expect(final.mouthwashStepIndex).toBe(2);
      expect(final.phaseIndex12).toBe(16);
      expect(final.mouthwashProgress01).toBeGreaterThan(0.98);
      expect(final.phaseDurationSec).toBeCloseTo(dur / 3, 6);
    }
    expect(BRUSH_ALONG_MOUTHWASH_BONUS_SEC).toBe(60);
  });
});

describe('ClockController pacer stages', () => {
  function runClock(): { clock: ClockController; ticks: Array<{ elapsedSec: number; stage: string }>; advance: (sec: number) => void } {
    const bus = new EventBus();
    const clock = new ClockController(bus);
    const ticks: Array<{ elapsedSec: number; stage: string }> = [];
    bus.on('pacer:tick', (t) => ticks.push({ elapsedSec: t.elapsedSec, stage: t.stage }));
    let nowMs = 0;
    clock.tickFrame(nowMs);
    const advance = (sec: number): void => {
      const frames = Math.round(sec * 60);
      for (let i = 0; i < frames; i++) {
        nowMs += 1000 / 60;
        clock.tickFrame(nowMs);
      }
    };
    return { clock, ticks, advance };
  }

  it('keeps one cumulative clock and stops at each stage end until told to move on', () => {
    const { clock, ticks, advance } = runClock();
    clock.startPacer();
    advance(125);
    expect(clock.getPacerElapsedSec()).toBe(120);
    expect(clock.getPacerStage()).toBe('brushing');

    clock.enterFlossBonus();
    expect(clock.getPacerElapsedSec()).toBe(120);
    advance(50);
    expect(clock.getPacerElapsedSec()).toBe(165);

    clock.enterMouthwashBonus();
    advance(70);
    expect(clock.getPacerElapsedSec()).toBe(225);
    expect(ticks.at(-1)).toEqual({ elapsedSec: 225, stage: 'mouthwashBonus' });
  });

  it('follows real time through a slow frame but never jumps more than half a second', () => {
    const bus = new EventBus();
    const clock = new ClockController(bus);
    clock.tickFrame(0);
    clock.startPacer();
    clock.tickFrame(300); // one 0.3s frame counts in full (the sim step would clamp it to 0.1s)
    expect(clock.getPacerElapsedSec()).toBeCloseTo(0.3, 6);
    clock.tickFrame(10_300); // a 10s stall counts as 0.5s
    expect(clock.getPacerElapsedSec()).toBeCloseTo(0.8, 6);
  });

  it('keeps the same fraction done when the rinse length is switched mid-rinse', () => {
    const { clock, advance } = runClock();
    clock.startPacer();
    clock.setPacerMouthwashDurationSec(60);
    clock.enterMouthwashBonus();
    advance(30); // halfway through 60s
    clock.setPacerMouthwashDurationSec(30);
    expect(clock.getPacerElapsedSec()).toBeCloseTo(165 + 15, 1);
    expect(clock.getPacerStageEndSec()).toBe(195);
  });

  it('skipping straight to the rinse starts it at the rinse offset', () => {
    const { clock } = runClock();
    clock.startPacer();
    clock.enterMouthwashBonus();
    expect(clock.getPacerElapsedSec()).toBe(165);
    expect(clock.getPacerStage()).toBe('mouthwashBonus');
    clock.stopPacer();
    expect(clock.isPacerActive()).toBe(false);
    expect(clock.getPacerStage()).toBe('brushing');
  });
});

describe('Brush-Along rewards with floss and rinse', () => {
  it('pays 50 + 25 floss + 25 rinse, and one beacon and one overdrive run per full reward', () => {
    const sys = new SaveSystem(new EventBus());
    const save = sys.load(1_700_000_000_000);
    const day = new Date(2026, 5, 1, 8, 0, 0);

    const full = HabitBank.completeBrushAlong(save, { withFlossBonus: true, withMouthwashBonus: true, date: day });
    expect(full.ionsAwarded).toBe(100);
    expect(full.stampAwarded).toBe(true);
    expect(save.pendingSupplyBeacons).toBe(1);
    expect(save.remineralizedOverdriveRuns).toBe(1);

    const rinseOnly = HabitBank.completeBrushAlong(save, { withFlossBonus: false, withMouthwashBonus: true, date: day });
    expect(rinseOnly.ionsAwarded).toBe(75);
    expect(save.pendingSupplyBeacons).toBe(2);
    expect(save.remineralizedOverdriveRuns).toBe(2);

    // Third session of the day is a courtesy tip whatever stages were done.
    const tip = HabitBank.completeBrushAlong(save, { withFlossBonus: true, withMouthwashBonus: true, date: day });
    expect(tip.slotType).toBe('tip');
    expect(tip.ionsAwarded).toBe(5);
    expect(save.pendingSupplyBeacons).toBe(2);
    expect(save.fluorideIons).toBe(180);
  });

  it('button labels promise exactly what the bank pays', () => {
    expect(BrushCoachCopy.actionButtonLabels('en')).toEqual({
      flossJump: 'Floss Pick',
      doneFloss: 'Done (+75 F⁻)',
      skipFloss: 'Skip (+50 F⁻)',
    });
    expect(BrushCoachCopy.mouthwashButtonLabels(true, 'en').doneRinse).toBe('Done (+100 F⁻)');
    expect(BrushCoachCopy.mouthwashButtonLabels(true, 'en').skipRinse).toBe('Skip (+75 F⁻)');
    expect(BrushCoachCopy.mouthwashButtonLabels(false, 'de').doneRinse).toBe('Fertig (+75 F⁻)');
    expect(BrushCoachCopy.mouthwashButtonLabels(false, 'ja').skipRinse).toBe('スキップ (+50 F⁻)');
  });
});

describe('8-language coach copy', () => {
  it('has every headline and spoken cue in every language', () => {
    for (const lang of COACH_LANGUAGES) {
      const sides = BrushCoachCopy.mirrorSideLabels(lang);
      expect(sides.left).not.toBe(sides.right);
      for (let q = 0; q < 4; q++) {
        expect(BrushCoachCopy.quadrantLabel(q, lang).length).toBeGreaterThan(0);
        for (let s = 0; s < 3; s++) {
          expect(BrushCoachCopy.spokenBrushCue(q, s, lang).length).toBeGreaterThan(0);
        }
      }
      for (let s = 0; s < 3; s++) {
        const badge = BrushCoachCopy.surfaceActionBadge(s, lang);
        expect(badge.headline.length).toBeGreaterThan(0);
        expect(badge.angleTag.length).toBeGreaterThan(0);
        const rinse = BrushCoachCopy.mouthwashHeadline(s, lang);
        expect(rinse.actionBadge.length).toBeGreaterThan(0);
        expect(rinse.ruleTag.length).toBeGreaterThan(0);
        const floss = BrushCoachCopy.flossHeadline(s !== 1, 'flossPick', s, lang);
        expect(floss.archTitle.length).toBeGreaterThan(0);
        expect(floss.actionBadge.length).toBeGreaterThan(0);
      }
      expect(BrushCoachCopy.spokenFlossStartCue('flossPick', lang).length).toBeGreaterThan(0);
      expect(BrushCoachCopy.spokenFlossLowerCue(lang).length).toBeGreaterThan(0);
      expect(BrushCoachCopy.spokenMouthwashStartCue(60, lang)).not.toBe(
        BrushCoachCopy.spokenMouthwashStartCue(30, lang)
      );
      expect(BrushCoachCopy.spokenMouthwashStepCue(1, lang)).not.toBe(BrushCoachCopy.spokenMouthwashStepCue(2, lang));
      expect(BrushCoachCopy.spokenSessionCompleteCue(true, lang)).not.toBe(
        BrushCoachCopy.spokenSessionCompleteCue(false, lang)
      );
      expect(BrushCoachCopy.hubStartBrushLabel(lang).length).toBeGreaterThan(0);
      expect(BrushCoachCopy.gyroSwishStatusLabel(true, lang)).not.toBe(BrushCoachCopy.gyroSwishStatusLabel(false, lang));
    }
  });

  it('keeps mirror sides right: quadrant names agree with the left/right labels', () => {
    expect(BrushCoachCopy.quadrantLabel(BrushQuadrant.upperRight, 'en')).toBe('TOP RIGHT');
    expect(BrushCoachCopy.quadrantLabel(BrushQuadrant.lowerLeft, 'en')).toBe('BOTTOM LEFT');
    expect(BrushCoachCopy.quadrantLabel(BrushQuadrant.upperLeft, 'de')).toBe('OBEN LINKS');
    expect(BrushCoachCopy.quadrantLabel(BrushQuadrant.lowerRight, 'ja')).toBe('右下');
    expect(BrushCoachCopy.spokenBrushCue(BrushQuadrant.upperLeft, BrushSurface.outerCheek, 'es')).toContain('izquierda');
    expect(BrushCoachCopy.spokenBrushCue(BrushQuadrant.lowerRight, BrushSurface.outerCheek, 'fr')).toContain('droite');
  });

  it('string floss changes the English coaching, pick mode steps through three moves', () => {
    expect(BrushCoachCopy.flossHeadline(true, 'stringFloss', 1, 'en')).toEqual({
      archTitle: 'STRING FLOSS • TOP TEETH',
      actionBadge: 'HUG BOTH SIDES IN A C-CURVE',
    });
    const steps = [0, 1, 2].map((i) => BrushCoachCopy.flossHeadline(false, 'flossPick', i, 'en').actionBadge);
    expect(new Set(steps).size).toBe(3);
    expect(BrushCoachCopy.spokenFlossStartCue('stringFloss', 'en')).not.toBe(
      BrushCoachCopy.spokenFlossStartCue('flossPick', 'en')
    );
  });

  it('picks the coach language from the browser list and falls back to English', () => {
    expect(detectCoachLanguage(['pt-BR', 'en-US'])).toBe('pt');
    expect(detectCoachLanguage(['it-IT', 'ko-KR'])).toBe('ko');
    expect(detectCoachLanguage(['ZH-Hant-TW'])).toBe('zh');
    expect(detectCoachLanguage(['it-IT'])).toBe('en');
    expect(detectCoachLanguage([])).toBe('en');
  });

  it('prefers an exact-locale voice, then the same language, and reports none when missing', () => {
    const voices = [
      { lang: 'en-GB', localService: true },
      { lang: 'es-ES', localService: false },
      { lang: 'es-MX', localService: false },
      { lang: 'pt_PT', localService: true },
    ];
    expect(pickVoice(voices, 'es-MX')).toBe(2);
    expect(pickVoice(voices, 'en-US')).toBe(0);
    expect(pickVoice(voices, 'pt-BR')).toBe(3);
    expect(pickVoice(voices, 'ja-JP')).toBe(-1);
  });
});

describe('rinse tilt slosh', () => {
  const still = {
    dt: 1 / 60,
    gravityX: 0,
    gravityY: -1,
    rotationRateMag: 0,
    userAccelX: 0,
    userAccelY: 0,
    sensorAvailable: true,
    reducedMotion: false,
  };

  it('stays idle on a counter, with no sensor, and under reduced motion', () => {
    const sim = new GyroSloshSim();
    let snap = sim.step(still);
    for (let i = 0; i < 600; i++) snap = sim.step(still);
    expect(snap.isHandheld).toBe(false);
    expect(snap.swishCount).toBe(0);
    expect(Math.abs(snap.sloshPosition)).toBeLessThan(0.01);

    const moving = { ...still, gravityX: 0.6, rotationRateMag: 1.2 };
    expect(new GyroSloshSim().step({ ...moving, sensorAvailable: false }).isHandheld).toBe(false);
    const calm = new GyroSloshSim();
    let reduced = calm.step({ ...moving, reducedMotion: true });
    for (let i = 0; i < 120; i++) reduced = calm.step({ ...moving, reducedMotion: true });
    expect(reduced.isHandheld).toBe(false);
    expect(reduced.sloshPosition).toBe(0);
  });

  it('wakes when picked up and counts cheek-to-cheek swishes', () => {
    const sim = new GyroSloshSim();
    let splashes = 0;
    let snap = sim.step(still);
    for (let i = 0; i < 60 * 8; i++) {
      const t = i / 60;
      const tilt = Math.sin(t * Math.PI) * 0.5; // one full left-right tilt every 2 seconds
      snap = sim.step({ ...still, gravityX: tilt, gravityY: -Math.sqrt(1 - tilt * tilt), rotationRateMag: 0.8 });
      if (snap.didTriggerSplash) splashes += 1;
    }
    expect(snap.isHandheld).toBe(true);
    expect(snap.swishCount).toBeGreaterThanOrEqual(6);
    expect(splashes).toBeGreaterThanOrEqual(snap.swishCount);
    expect(snap.leftCheekCharge01).toBeGreaterThan(0.2);
    expect(snap.rightCheekCharge01).toBeGreaterThan(0.2);
    expect(Math.abs(snap.sloshPosition)).toBeLessThanOrEqual(1);

    sim.resetMouthwashSession();
    expect(sim.step(still).swishCount).toBe(0);
  });
});
