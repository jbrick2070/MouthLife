import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/engine/EventBus';
import { SaveSystem } from '../src/engine/persistence/SaveSystem';
import { WorldSession } from '../src/engine/sim/WorldSession';
import {
  AUDIO_PREFS_KEY,
  COSMIC_BEAT_BARS,
  DEFAULT_AUDIO_PREFS,
  THEMES,
  chordAtBar,
  chordMidis,
  chordPitchClasses,
  generateStep,
  harmonicSfxMidi,
  loadAudioPrefs,
  midiToFreq,
  sanitizeAudioPrefs,
  saveAudioPrefs,
  scaleMidi,
  selectTheme,
  snapToChord,
  synergyRankIndex,
  type ThemeId,
} from '../src/engine/audio/musicTheory';
import { SURGE_MAX } from '../src/config/gameConfig';
import {
  buildTimerPill,
  clampToScreen,
  wayfinderLabelY,
  formatClock,
  isEditableEventTarget,
  loadSeenHints,
  saveSeenHints,
  selectWayfinderTargets,
  shouldHandleGlobalMuteKey,
  shouldShowHubWelcome,
} from '../src/ui/hudHelpers';
import { buildReportHeadline } from '../src/ui/MissionReportOverlay';
import { plaqueCityCartridge } from '../src/worlds/plaqueCityCartridge';
import { getCartridgeById } from '../src/worlds/worldRegistry';

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe('music theory & theme selection', () => {
  it('maps every mode/world to a distinct themed soundtrack', () => {
    expect(selectTheme({ mode: 'COSMIC_INTRO' })).toBe('cosmic');
    expect(selectTheme({ mode: 'BRUSH_ALONG' })).toBe('brush_along');
    expect(selectTheme({ mode: 'REPORT' })).toBe('report');
    expect(selectTheme({ mode: 'PULP_RESCUE' })).toBe('pulp');
    expect(selectTheme({ mode: 'HUB' })).toBe('hub');
    expect(selectTheme({ mode: 'HUB', hubGlobe: true })).toBe('hub_globe');
    expect(selectTheme({ mode: 'HUB', pulpZero: true })).toBe('hub_ready');
    const worlds = ['world_1', 'world_2', 'world_3', 'world_4', 'world_5'].map((w) =>
      selectTheme({ mode: 'ARCADE', worldId: w })
    );
    expect(new Set(worlds).size).toBe(5);
    expect(worlds).toEqual(['world_1', 'world_2', 'world_3', 'world_4', 'world_5']);
  });

  it('scale math and chord snapping stay in key', () => {
    expect(scaleMidi([0, 2, 4, 7, 9], 60, 0)).toBe(60);
    expect(scaleMidi([0, 2, 4, 7, 9], 60, 5)).toBe(72);
    expect(scaleMidi([0, 2, 4, 7, 9], 60, -1)).toBe(57);
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
    const t = THEMES.hub;
    const pcs = chordPitchClasses(t, chordAtBar(t, 0));
    for (const deg of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const m = harmonicSfxMidi(t, chordAtBar(t, 0), deg, 36);
      expect(m).toBeGreaterThan(t.keyRoot + 30);
      expect(m).toBeLessThan(t.keyRoot + 70);
    }
    expect(pcs.has(snapToChord(61, pcs) % 12)).toBe(true);
  });

  it('every theme has 16 bars and valid 16-step patterns', () => {
    for (const id of Object.keys(THEMES) as ThemeId[]) {
      const t = THEMES[id];
      expect(t.progressionA.length).toBe(8);
      expect(t.progressionB.length).toBeGreaterThanOrEqual(8);
      for (const p of [t.bass, t.shaker, t.rim, t.kick, t.hat]) expect(p.length).toBe(16);
      expect(t.bpm).toBeGreaterThan(50);
      expect(t.bpm).toBeLessThan(140);
      if (t.mixGain !== undefined) {
        expect(t.mixGain).toBeGreaterThanOrEqual(0.5);
        expect(t.mixGain).toBeLessThanOrEqual(2.0);
      }
    }
  });

  it('COSMIC_BEAT_BARS gives each of the 4 Cosmic Intro beats a distinct chord', () => {
    expect(COSMIC_BEAT_BARS).toHaveLength(4);
    const roots = COSMIC_BEAT_BARS.map((bar) => chordAtBar(THEMES.cosmic, bar).root);
    expect(new Set(roots).size).toBe(4);
  });

  it('Brush-Along celesta arp layer blooms only when enabled (Q3–Q4 & Floss Bonus)', () => {
    const t = THEMES.brush_along;
    let earlyArp = 0;
    let lateArp = 0;
    for (let gs = 0; gs < 16; gs++) {
      earlyArp += generateStep(t, gs, { layers: { arp: false } }).notes.filter((n) => n.voice === 'celesta').length;
      lateArp += generateStep(t, gs, { layers: { arp: true } }).notes.filter((n) => n.voice === 'celesta').length;
    }
    expect(earlyArp).toBe(0);
    expect(lateArp).toBeGreaterThan(0);
  });

  it('generateStep is deterministic, finite and in a safe register', () => {
    for (const id of Object.keys(THEMES) as ThemeId[]) {
      const t = THEMES[id];
      let notes = 0;
      for (let gs = 0; gs < 16 * 16; gs++) {
        const a = generateStep(t, gs);
        const b = generateStep(t, gs);
        expect(a.notes.map((n) => n.midi)).toEqual(b.notes.map((n) => n.midi));
        for (const n of a.notes) {
          notes++;
          expect(Number.isFinite(n.midi)).toBe(true);
          expect(n.midi).toBeGreaterThan(24);
          expect(n.midi).toBeLessThan(110);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThan(1.3);
        }
      }
      expect(notes).toBeGreaterThan(40);
    }
  });

  it('A and B sections differ so loops stay fresh over minutes', () => {
    const t = THEMES.hub;
    const a = Array.from({ length: 16 * 8 }, (_, gs) => generateStep(t, gs).notes.map((n) => n.midi).join(','));
    const b = Array.from({ length: 16 * 8 }, (_, gs) => generateStep(t, gs + 16 * 8).notes.map((n) => n.midi).join(','));
    expect(a.join('|')).not.toBe(b.join('|'));
  });

  it('Brush-Along transposition evolves across quadrants & urgency adds hats', () => {
    const t = THEMES.brush_along;
    const q0 = generateStep(t, 0, { transpose: 0 }).notes.map((n) => n.midi);
    const q3 = generateStep(t, 0, { transpose: 7 }).notes.map((n) => n.midi);
    expect(q3).not.toEqual(q0);
    expect(q3[0] - q0[0]).toBe(7);
    const pulp = THEMES.pulp;
    const calm = generateStep(pulp, 6).drums.length;
    const urgent = generateStep(pulp, 6, { urgency: true }).drums.length;
    expect(urgent).toBeGreaterThanOrEqual(calm);
  });

  it('chordMidis builds voicings from chord tones', () => {
    const t = THEMES.hub;
    const ms = chordMidis(t, chordAtBar(t, 0), 0, 12);
    expect(ms[0]).toBe(t.keyRoot + 12);
    expect(ms.length).toBeGreaterThanOrEqual(4);
  });

  it('synergy ranks map 1.5x/2.0x/2.5x/3.0x', () => {
    expect(synergyRankIndex(1.0)).toBe(-1);
    expect(synergyRankIndex(1.5)).toBe(0);
    expect(synergyRankIndex(2.2)).toBe(1);
    expect(synergyRankIndex(2.5)).toBe(2);
    expect(synergyRankIndex(3.0)).toBe(3);
  });
});

describe('audio preference persistence', () => {
  it('round-trips {muted, musicVolume, sfxVolume} under mouthlife.audioPrefs', () => {
    expect(AUDIO_PREFS_KEY).toBe('mouthlife.audioPrefs');
    const st = memStore();
    expect(loadAudioPrefs(st)).toEqual(DEFAULT_AUDIO_PREFS);
    saveAudioPrefs({ muted: true, musicVolume: 0.3, sfxVolume: 0.1 }, st);
    expect(loadAudioPrefs(st)).toEqual({ muted: true, musicVolume: 0.3, sfxVolume: 0.1 });
  });
  it('sanitizes corrupt / out-of-range data and tolerates broken storage', () => {
    expect(sanitizeAudioPrefs({ muted: 'yes', musicVolume: 9, sfxVolume: -4 })).toEqual({
      muted: false,
      musicVolume: 1,
      sfxVolume: 0,
    });
    const bad = { getItem: () => '{not json', setItem: () => {} };
    expect(loadAudioPrefs(bad)).toEqual(DEFAULT_AUDIO_PREFS);
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadAudioPrefs(throwing)).toEqual(DEFAULT_AUDIO_PREFS);
    expect(() => saveAudioPrefs(DEFAULT_AUDIO_PREFS, throwing)).not.toThrow();
  });
});

describe('HUD helpers', () => {
  it('formats the pulp countdown and arcade par readout', () => {
    expect(formatClock(90, true)).toBe('01:30');
    expect(buildTimerPill('PULP_RESCUE', 0, 0, 90)).toEqual({ text: '⏱ 01:30', warn: false });
    expect(buildTimerPill('PULP_RESCUE', 70, 0, 20).warn).toBe(true);
    expect(buildTimerPill('ARCADE', 42, 135, 0)).toEqual({ text: '⏱ 0:42 / 2:15', warn: false });
  });

  it('wayfinders appear only when < 3 sites remain in an open district, or while scanning', () => {
    const site = (x: number, d: number, restored = false) => ({ pos: { x, z: 0 }, districtIdx: d, restored });
    const base = {
      sealedDistricts: [false, true],
      crystals: [{ pos: { x: 50, z: 0 }, intact: true }],
      domes: [{ cx: 60, cz: 0 }],
      domesRemaining: true,
      probe: { x: 0, z: 0 },
    };
    const many = selectWayfinderTargets(
      { ...base, sites: [site(1, 0), site(2, 0), site(3, 0)], scanActive: false },
      6
    );
    expect(many.length).toBe(0);
    const few = selectWayfinderTargets(
      { ...base, sites: [site(1, 0), site(2, 0), site(3, 0, true)], scanActive: false },
      6
    );
    expect(few.map((t) => t.x)).toEqual([1, 2]);
    const sealed = selectWayfinderTargets({ ...base, sites: [site(9, 1)], scanActive: false }, 6);
    expect(sealed.length).toBe(0);
    const scan = selectWayfinderTargets({ ...base, sites: [site(1, 0)], scanActive: true }, 6);
    expect(scan.map((t) => t.kind).sort()).toEqual(['crystal', 'dome', 'site']);
  });

  it('clamps off-screen targets to the viewport edge and keeps on-screen ones', () => {
    const on = clampToScreen(100, 100, 400, 800, 20);
    expect(on.onScreen).toBe(true);
    const off = clampToScreen(900, 400, 400, 800, 20);
    expect(off.onScreen).toBe(false);
    expect(off.x).toBeCloseTo(380, 3);
    expect(off.y).toBeCloseTo(400, 3);
  });

  it('keeps the whole wayfinder below HUDs of different heights', () => {
    expect(wayfinderLabelY(30, 62, 22)).toBe(77);
    expect(wayfinderLabelY(70, 220, 22)).toBe(235);
    expect(wayfinderLabelY(300, 62, 22)).toBe(300);
  });

  it('persists seen contextual hints', () => {
    const st = memStore();
    const s = loadSeenHints(st);
    s.add('alley');
    saveSeenHints(s, st);
    expect(loadSeenHints(st).has('alley')).toBe(true);
  });

  it('global M mute key ignores text inputs/textareas while allowing buttons and range sliders', () => {
    expect(isEditableEventTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isEditableEventTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditableEventTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isEditableEventTarget({ isContentEditable: true })).toBe(true);
    expect(isEditableEventTarget({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(isEditableEventTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isEditableEventTarget(null)).toBe(false);

    expect(shouldHandleGlobalMuteKey({ key: 'm' }, { tagName: 'BODY' })).toBe(true);
    expect(shouldHandleGlobalMuteKey({ key: 'M' }, { tagName: 'INPUT', type: 'range' })).toBe(true);
    expect(shouldHandleGlobalMuteKey({ key: 'M' }, { tagName: 'INPUT', type: 'text' })).toBe(false);
    expect(shouldHandleGlobalMuteKey({ key: 'm' }, { tagName: 'TEXTAREA' })).toBe(false);
    expect(shouldHandleGlobalMuteKey({ key: 'm', repeat: true }, { tagName: 'BODY' })).toBe(false);
    expect(shouldHandleGlobalMuteKey({ key: 'm', ctrlKey: true }, { tagName: 'BODY' })).toBe(false);
    expect(shouldHandleGlobalMuteKey({ key: 'p' }, { tagName: 'BODY' })).toBe(false);
  });

  it('shows first-run Hub welcome banner only before first stamp, first clear, or dismissal', () => {
    expect(shouldShowHubWelcome(new Set(), 0, false)).toBe(true);
    expect(shouldShowHubWelcome(new Set(['hub_welcome']), 0, false)).toBe(false);
    expect(shouldShowHubWelcome(new Set(), 1, false)).toBe(false);
    expect(shouldShowHubWelcome(new Set(), 0, true)).toBe(false);
  });

  it('every playable world and Pulp Rescue defines an onboarding challengeBlurb', () => {
    for (const id of ['world_1', 'world_2', 'world_3', 'world_4', 'world_5', 'pulp_rescue']) {
      const cart = getCartridgeById(id);
      expect(typeof cart.challengeBlurb).toBe('string');
      expect((cart.challengeBlurb ?? '').length).toBeGreaterThan(20);
    }
  });
});

describe('Mission report headline', () => {
  const base = {
    mode: 'ARCADE' as const,
    worldId: 'world_2',
    won: true,
    breakdown: {} as never,
    unlockedHistoryNoteId: null,
    bonusRescueIons: 0,
  };
  it('celebrates the actual cleared world instead of a hardcoded city', () => {
    const h = buildReportHeadline({ ...base, worldTitle: 'Crescent Sulcus', hostCityLabel: 'New Orleans' });
    expect(h).toContain('Crescent Sulcus');
    expect(h).toContain('New Orleans');
    expect(h).not.toContain('Plaque City');
  });
  it('keeps the Pulp Rescue wording', () => {
    expect(buildReportHeadline({ ...base, mode: 'PULP_RESCUE', won: false })).toContain('Stabilization');
  });
});

describe('new gameplay audio events', () => {
  it("emits 'surge:ready' exactly once when the surge meter reaches SURGE_MAX", () => {
    const bus = new EventBus();
    const saveSys = new SaveSystem(bus);
    saveSys.load(1_700_000_000_000);
    const session = new WorldSession(bus);
    session.loadCartridge(plaqueCityCartridge, saveSys.getSave(), 'ARCADE');
    let ready = 0;
    bus.on('surge:ready', () => ready++);
    session.addSurge(SURGE_MAX * 0.6);
    expect(ready).toBe(0);
    session.addSurge(SURGE_MAX * 0.6);
    expect(ready).toBe(1);
    session.addSurge(10);
    expect(ready).toBe(1);
  });

  it("emits 'spring:triggered' when HYDRA-1 reaches a Saliva Spring", () => {
    const bus = new EventBus();
    const saveSys = new SaveSystem(bus);
    saveSys.load(1_700_000_000_000);
    const session = new WorldSession(bus);
    session.loadCartridge(plaqueCityCartridge, saveSys.getSave(), 'ARCADE');
    let springs = 0;
    bus.on('spring:triggered', () => springs++);
    const sp = plaqueCityCartridge.salivaSprings[0];
    session.probePos = { x: sp.x, z: sp.z };
    session.step(1 / 60, {
      moveX: 0,
      moveZ: 0,
      scrubHeld: false,
      aimWorldPos: null,
      fireFlossRequested: false,
      fireRinseRequested: false,
      fireDiscloseRequested: false,
    });
    expect(springs).toBe(1);
  });
});
