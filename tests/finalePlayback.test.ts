import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cityArtForHost } from '../src/config/citySkylines';
import {
  ENDING_TIMES,
  FINALE_EFFECT_VOICES,
  FINALE_HOST_IDS,
  FINALE_TIMES,
  checksumFinishes,
  type FinaleNote,
} from '../src/config/cityFinale';
import { ZOOM_TRANSITION_SEC } from '../src/config/gameConfig';
import { SoundEngine } from '../src/engine/audio/SoundEngine';
import { FinaleStage3D } from '../src/engine/render/FinaleStage3D';
import { SceneManager, cameraGlide01, diveProgress01 } from '../src/engine/render/SceneManager';
import { FinaleSoundtrack, finaleScore, holdModalFocus } from '../src/ui/CityFinaleOverlay';

const plans = FINALE_HOST_IDS.map((h) => cityArtForHost(h)!.finale!);
const CITY: number = FINALE_TIMES.end;
const TOTAL: number = CITY + ENDING_TIMES.end;
const g = globalThis as Record<string, unknown>;

type Call = ['city' | 'ending' | null, number];

function soundtrack(city: boolean, ending: boolean, cityLength = CITY, total = TOTAL) {
  const calls: Call[] = [];
  const st = new FinaleSoundtrack(cityLength, total, { city, ending }, (part, offset) => calls.push([part, offset]));
  return { st, calls };
}

const COMBOS = [
  [true, true],
  [true, false],
  [false, true],
  [false, false],
] as const;

describe('M15: the city hands over to the ending by the show clock, whatever songs are ready', () => {
  for (const [city, ending] of COMBOS) {
    const name = `city song ${city ? 'ready' : 'missing'}, ending song ${ending ? 'ready' : 'missing'}`;

    it(`${name}: natural hand-over, once`, () => {
      const { st, calls } = soundtrack(city, ending);
      st.begin();
      for (let t = 0; t < CITY; t += 1 / 60) st.update(t);
      expect(st.playing()).toBe(city ? 'city' : null);
      for (let t = CITY; t < TOTAL; t += 1 / 60) st.update(t);
      expect(st.playing()).toBe(ending ? 'ending' : null);
      const starts = calls.filter(([p]) => p !== null);
      expect(starts.filter(([p]) => p === 'city')).toHaveLength(city ? 1 : 0);
      expect(starts.filter(([p]) => p === 'ending')).toHaveLength(ending ? 1 : 0);
      // the city's song never runs on under the ending
      if (city) expect(calls.findIndex(([p]) => p === null || p === 'ending')).toBeGreaterThan(0);
      st.stop();
      expect(st.playing()).toBe(null);
    });

    it(`${name}: Skip in the city part starts the ending once, and the clock then crossing 30 s does not again`, () => {
      const { st, calls } = soundtrack(city, ending);
      st.begin();
      st.update(5);
      st.beginEnding(0);
      st.update(CITY + 0.01);
      st.update(CITY + 10);
      st.beginEnding(3);
      expect(calls.filter(([p]) => p === 'ending')).toEqual(ending ? [['ending', 0]] : []);
      expect(st.playing()).toBe(ending ? 'ending' : null);
    });

    it(`${name}: a late frame across the boundary seeks into the ending`, () => {
      const { st, calls } = soundtrack(city, ending);
      st.begin();
      st.update(29.5);
      st.update(31.25);
      expect(calls.filter(([p]) => p === 'ending')).toEqual(ending ? [['ending', 1.25]] : []);
    });

    it(`${name}: synth instruments go silent only under a song that is ready`, () => {
      const finishes = checksumFinishes(4);
      const notes = finaleScore({ plan: plans[4], worldIndex: 4 }, { plans, allGold: false }, finishes, false, { city, ending });
      const melodic = (n: FinaleNote) => !FINALE_EFFECT_VOICES.includes(n.voice);
      const cityNotes = notes.filter((n) => n.t < CITY);
      const endingNotes = notes.filter((n) => n.t >= CITY);
      expect(cityNotes.some(melodic)).toBe(!city);
      expect(endingNotes.some(melodic)).toBe(!ending);
      // effects play either way, so neither part is ever silent
      expect(cityNotes.length).toBeGreaterThan(0);
      expect(endingNotes.length).toBeGreaterThan(0);
      expect(Math.max(...notes.map((n) => n.t))).toBeLessThan(TOTAL);
    });
  }

  it('the ending replay alone starts its own song, and a single city never reaches for the ending', () => {
    const replay = soundtrack(false, true, 0, ENDING_TIMES.end);
    replay.st.begin();
    replay.st.update(40);
    expect(replay.calls).toEqual([['ending', 0]]);
    const single = soundtrack(true, true, CITY, CITY);
    single.st.begin();
    single.st.update(29.99);
    single.st.beginEnding(0);
    expect(single.calls).toEqual([['city', 0]]);
  });
});

/** Just enough of an element tree for the modal: parents, children, inert, focus. */
class FakeEl {
  inert = false;
  focused = 0;
  isConnected = true;
  id = '';
  readonly children: FakeEl[] = [];
  parentElement: FakeEl | null = null;
  constructor(readonly tagName: string) {}
  add(...kids: FakeEl[]): this {
    for (const k of kids) {
      k.parentElement = this;
      this.children.push(k);
    }
    return this;
  }
  focus(): void {
    this.focused++;
  }
}

describe('M17: the ending replay holds keyboard focus until it ends', () => {
  function page() {
    const html = new FakeEl('HTML');
    const head = new FakeEl('HEAD');
    const body = new FakeEl('BODY');
    const app = new FakeEl('DIV');
    const canvas = new FakeEl('CANVAS');
    const uiRoot = new FakeEl('DIV');
    const brush = new FakeEl('BUTTON');
    const molarBtn = new FakeEl('BUTTON');
    const script = new FakeEl('SCRIPT');
    const shell = new FakeEl('DIV');
    const skip = new FakeEl('BUTTON');
    html.add(head, body);
    uiRoot.add(brush, molarBtn);
    app.add(canvas, uiRoot);
    shell.add(skip);
    body.add(app, script, shell); // the replay is mounted on <body>, over Home
    return { html, head, body, app, uiRoot, brush, molarBtn, script, shell, skip };
  }
  const asEl = (e: FakeEl) => e as unknown as HTMLElement;

  it('makes Home inert, focuses the show, and gives focus back to the Golden Molar button after', () => {
    const p = page();
    const release = holdModalFocus(asEl(p.shell), asEl(p.molarBtn));
    expect(p.app.inert).toBe(true); // Home, its brush button and the 3D canvas are out of reach
    expect(p.shell.inert).toBe(false);
    expect(p.skip.inert).toBe(false);
    expect(p.head.inert).toBe(false); // nothing above <body> is touched
    expect(p.script.inert).toBe(false);
    expect(p.shell.focused).toBe(1);
    release();
    expect(p.app.inert).toBe(false);
    expect(p.molarBtn.focused).toBe(1);
    release(); // Skip, the end and a dispose may all call it: it undoes once
    expect(p.molarBtn.focused).toBe(1);
  });

  it('leaves alone what was inert already, and skips a trigger that has gone', () => {
    const p = page();
    const other = new FakeEl('DIV');
    other.inert = true;
    p.body.add(other);
    const release = holdModalFocus(asEl(p.shell), asEl(p.molarBtn));
    p.molarBtn.isConnected = false; // the menu redrew meanwhile (no id to find it again by)
    release();
    expect(other.inert).toBe(true);
    expect(p.molarBtn.focused).toBe(0);
  });

  it('for a city finale inside the game screen, walks up and inerts the canvas beside it', () => {
    const p = page();
    p.body.children.splice(p.body.children.indexOf(p.shell), 1);
    p.uiRoot.children.length = 0;
    p.uiRoot.add(p.shell);
    const release = holdModalFocus(asEl(p.shell), null);
    expect(p.app.children[0].inert).toBe(true); // the canvas
    expect(p.uiRoot.inert).toBe(false);
    expect(p.app.inert).toBe(false);
    release();
    expect(p.app.children[0].inert).toBe(false);
  });
});

describe('L08: the wormhole meshes are disposed with the 3D finale', () => {
  it('disposes the porcelain and gold teeth exactly once', () => {
    const porcelain = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 4);
    const gold = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 4);
    const disposed = { porcelain: 0, gold: 0 };
    porcelain.addEventListener('dispose', () => disposed.porcelain++);
    gold.addEventListener('dispose', () => disposed.gold++);
    const noop = { dispose() {} };
    const stage = Object.assign(Object.create(FinaleStage3D.prototype), {
      disposed: false,
      reliefs: new Map(),
      disposables: [],
      sparks: noop,
      streaks: noop,
      glow: noop,
      beads: noop,
      fractals: new Map(),
      mountain: new THREE.Group(),
      wormholePorcelain: porcelain,
      wormholeGold: gold,
      envTarget: null,
      env: null,
      renderer: null,
    }) as FinaleStage3D;
    stage.dispose();
    stage.dispose();
    expect(disposed).toEqual({ porcelain: 1, gold: 1 });
  });
});

describe('M10: Reduce Motion follows the system, live', () => {
  const saved = { window: g.window, localStorage: g.localStorage };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete g[k];
      else g[k] = v;
    }
  });

  function fakeSystem(reduce: boolean) {
    const listeners: ((e: { matches: boolean }) => void)[] = [];
    const mq = {
      matches: reduce,
      addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
    };
    g.window = { matchMedia: () => mq };
    return {
      set(next: boolean) {
        mq.matches = next;
        for (const fn of listeners) fn({ matches: next });
      },
      listeners,
    };
  }
  function store(value: string | null) {
    g.localStorage = { getItem: () => value, setItem: () => undefined };
  }

  it('starts on when the system asks, even if the in-app switch was saved off', () => {
    fakeSystem(true);
    store('0');
    expect(SceneManager.readInitialReducedMotion()).toBe(true);
  });

  it('otherwise keeps the in-app choice', () => {
    fakeSystem(false);
    store('1');
    expect(SceneManager.readInitialReducedMotion()).toBe(true);
    store('0');
    expect(SceneManager.readInitialReducedMotion()).toBe(false);
    store(null);
    expect(SceneManager.readInitialReducedMotion()).toBe(false);
  });

  it('switches with the system while the game runs, and every change goes out to the skyline and finale', () => {
    const system = fakeSystem(false);
    const emitted: boolean[] = [];
    const fake = {
      reducedMotion: false,
      setReducedMotion(reduced: boolean) {
        this.reducedMotion = reduced;
        emitted.push(reduced);
      },
    };
    (SceneManager.prototype as unknown as { followSystemReducedMotion(this: unknown): void }).followSystemReducedMotion.call(fake);
    expect(system.listeners).toHaveLength(1);
    system.set(true);
    expect(fake.reducedMotion).toBe(true);
    system.set(true); // no change, no event
    system.set(false);
    expect(fake.reducedMotion).toBe(false);
    expect(emitted).toEqual([true, false]);
  });
});

describe('Reduce Motion: the camera cuts to a new screen instead of flying there', () => {
  type Rig = {
    updateCameraRig(this: unknown, dt: number, nowSec: number, session: unknown, quadrant: number): void;
    syncStageVisibility(this: unknown): void;
  };
  const rig = SceneManager.prototype as unknown as Rig;
  const FRAME = 1 / 60;

  /** Just the parts of the scene the dive touches, with the Home screen showing. */
  function sceneAboutToDive(reducedMotion: boolean) {
    const arrived = vi.fn();
    const scene = {
      reducedMotion,
      currentMode: 'ARCADE',
      hubFocus: 'companion',
      cosmicBeat: 0,
      screenChanged: true,
      diveActive: false,
      diveElapsed: 0,
      diveSwapped: false,
      diveOnComplete: null as (() => void) | null,
      diveStartPos: new THREE.Vector3(),
      diveStartLook: new THREE.Vector3(),
      diveEndPos: new THREE.Vector3(),
      diveEndLook: new THREE.Vector3(),
      rigPos: new THREE.Vector3(32, 20, 40),
      currentLookAt: new THREE.Vector3(32, 2, 16),
      camera: new THREE.PerspectiveCamera(46, 1, 0.5, 320),
      companionArch: { group: { visible: true } },
      cartridgeStage: { group: { visible: true } },
      earthBackdrop: { rootGroup: { visible: false }, setCosmicIntroState: () => undefined },
      syncStageVisibility: rig.syncStageVisibility,
    };
    SceneManager.prototype.beginDiveTransition.call(scene as unknown as SceneManager, 10, 12, arrived);
    return { scene, arrived };
  }

  it('the flight into a city takes 1.35 s; under Reduce Motion it is over at once', () => {
    expect(diveProgress01(0, false)).toBe(0);
    expect(diveProgress01(ZOOM_TRANSITION_SEC / 2, false)).toBeCloseTo(0.5, 6);
    expect(diveProgress01(ZOOM_TRANSITION_SEC, false)).toBe(1);
    expect(diveProgress01(60, false)).toBe(1);
    expect(diveProgress01(0, true)).toBe(1);
    expect(diveProgress01(FRAME, true)).toBe(1);
    expect(diveProgress01(ZOOM_TRANSITION_SEC / 2, true)).toBe(1);
  });

  it('under Reduce Motion the first frame of the dive is already the city: stage in, Earth out, dive over', () => {
    const { scene, arrived } = sceneAboutToDive(true);
    // the dive has been asked for: until the next frame the Earth is what would be drawn
    expect(scene.diveActive).toBe(true);
    expect(scene.earthBackdrop.rootGroup.visible).toBe(true);
    expect(scene.cartridgeStage.group.visible).toBe(false);

    rig.updateCameraRig.call(scene, FRAME, 0, null, -1);

    expect(scene.diveActive).toBe(false);
    expect(SceneManager.prototype.isTransitioning.call(scene as unknown as SceneManager)).toBe(false);
    expect(arrived).toHaveBeenCalledTimes(1);
    expect(scene.cartridgeStage.group.visible).toBe(true);
    expect(scene.earthBackdrop.rootGroup.visible).toBe(false);
    expect(scene.companionArch.group.visible).toBe(false);
    // the camera stands where the flight would have ended, over the start of the stage
    expect(scene.camera.position.distanceTo(new THREE.Vector3(10, 18.5, 24.5))).toBeLessThan(1e-9);
    expect(scene.currentLookAt.distanceTo(new THREE.Vector3(10, 1.2, 10.8))).toBeLessThan(1e-9);
  });

  it('a frame of no length still cuts (the cut does not depend on the clock)', () => {
    const { scene, arrived } = sceneAboutToDive(true);
    rig.updateCameraRig.call(scene, 0, 0, null, -1);
    expect(scene.diveActive).toBe(false);
    expect(arrived).toHaveBeenCalledTimes(1);
  });

  it('without Reduce Motion the flight is unchanged: Earth first, the stage from 55%, done at 1.35 s', () => {
    const { scene, arrived } = sceneAboutToDive(false);
    rig.updateCameraRig.call(scene, FRAME, 0, null, -1);
    expect(scene.diveActive).toBe(true);
    expect(arrived).not.toHaveBeenCalled();
    expect(scene.earthBackdrop.rootGroup.visible).toBe(true);
    expect(scene.cartridgeStage.group.visible).toBe(false);
    expect(scene.camera.position.y).toBeGreaterThan(117); // still up at the Earth

    const wholeFlight = Math.round(ZOOM_TRANSITION_SEC * 60); // 81 frames at 60 a second
    let frames = 1;
    while (scene.diveActive && frames < 600) {
      rig.updateCameraRig.call(scene, FRAME, frames * FRAME, null, -1);
      frames++;
      if (frames === Math.floor(wholeFlight / 2)) {
        expect(scene.earthBackdrop.rootGroup.visible).toBe(true);
        expect(scene.cartridgeStage.group.visible).toBe(false);
      }
    }
    expect(arrived).toHaveBeenCalledTimes(1);
    expect(frames).toBeGreaterThanOrEqual(wholeFlight);
    expect(frames).toBeLessThanOrEqual(wholeFlight + 1);
    expect(scene.cartridgeStage.group.visible).toBe(true);
    expect(scene.earthBackdrop.rootGroup.visible).toBe(false);
  });

  it('a change of screen is a cut under Reduce Motion; inside a screen the camera still glides', () => {
    // another mode or the other Home tab, Reduce Motion on: all the way in one frame
    expect(cameraGlide01(FRAME, false, true, true)).toBe(1);
    expect(cameraGlide01(FRAME, true, true, true)).toBe(1);
    // same screen: the gentle follow stays, also under Reduce Motion (brushCamera.ts keeps "the
    // gentle slide toward the active teeth")
    const follow = 1 - Math.exp(-6.5 * FRAME);
    const brushing = 1 - Math.exp(-2.4 * FRAME);
    expect(cameraGlide01(FRAME, false, true, false)).toBeCloseTo(follow, 12);
    expect(cameraGlide01(FRAME, true, true, false)).toBeCloseTo(brushing, 12);
    // Reduce Motion off: the glide between screens is unchanged
    expect(cameraGlide01(FRAME, false, false, true)).toBeCloseTo(follow, 12);
    expect(cameraGlide01(FRAME, true, false, true)).toBeCloseTo(brushing, 12);
    expect(brushing).toBeLessThan(follow);
  });

  it('a new mode or the other Home tab marks the change; the same one again does not', () => {
    const scene = {
      currentMode: 'HUB',
      hubFocus: 'companion',
      screenChanged: false,
      cosmicYaw: 0,
      hubInsetTimer: 1,
      canvas: { classList: { toggle: () => undefined } },
      syncStageVisibility: () => undefined,
    };
    const as = scene as unknown as SceneManager;
    SceneManager.prototype.setMode.call(as, 'HUB');
    SceneManager.prototype.setHubFocus.call(as, 'companion');
    expect(scene.screenChanged).toBe(false);
    SceneManager.prototype.setHubFocus.call(as, 'globe');
    expect(scene.screenChanged).toBe(true);
    scene.screenChanged = false;
    SceneManager.prototype.setMode.call(as, 'BRUSH_ALONG');
    expect(scene.screenChanged).toBe(true);
  });

  it('the camera takes the change in on its next step: a cut to the globe, then gliding again', () => {
    // Home, on the globe tab, in a landscape window with no hub chrome to measure
    const scene = {
      reducedMotion: true,
      screenChanged: true,
      diveActive: false,
      currentMode: 'HUB',
      hubFocus: 'globe',
      hubSideFrac: 0,
      hubBandFrac: 1,
      baseFov: 46,
      measureHubBand: () => undefined,
      rigPos: new THREE.Vector3(32, 15, 36), // where the camera was, looking at the teeth
      currentLookAt: new THREE.Vector3(32, 1.05, 18.2),
      camera: new THREE.PerspectiveCamera(46, 16 / 9, 0.5, 320),
    };
    rig.updateCameraRig.call(scene, FRAME, 0, null, -1);
    // in front of the Earth at once (it hangs at y 110), not somewhere on the way up
    expect(scene.camera.position.distanceTo(new THREE.Vector3(32, 115.5, 65))).toBeLessThan(1e-9);
    expect(scene.screenChanged).toBe(false);

    // the same jump without Reduce Motion is a glide: one frame covers about a tenth of it
    const gliding = { ...scene, reducedMotion: false, screenChanged: true };
    gliding.rigPos = new THREE.Vector3(32, 15, 36);
    gliding.currentLookAt = new THREE.Vector3(32, 1.05, 18.2);
    gliding.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.5, 320);
    rig.updateCameraRig.call(gliding, FRAME, 0, null, -1);
    expect(gliding.camera.position.y).toBeGreaterThan(15);
    expect(gliding.camera.position.y).toBeLessThan(30);
    expect(gliding.screenChanged).toBe(false);
  });
});

describe('M16: Watch the Ending from Home gets its recording ready first', () => {
  const savedFetch = g.fetch;
  afterEach(() => {
    if (savedFetch === undefined) delete g.fetch;
    else g.fetch = savedFetch;
    vi.useRealTimers();
  });

  function memStore() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  }
  function engine(decode: () => Promise<unknown>) {
    const sound = new SoundEngine(memStore());
    (sound as unknown as { ctx: unknown }).ctx = { state: 'running', currentTime: 0, decodeAudioData: decode };
    return sound;
  }

  it('a cold page: the bundled ending decodes, then the replay knows it can play it', async () => {
    const fetches: string[] = [];
    g.fetch = (url: string) => {
      fetches.push(url);
      return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
    };
    const sound = engine(() => Promise.resolve({ duration: 60 }));
    expect(sound.hasFinaleTrack(-1)).toBe(false);
    await expect(sound.prepareFinaleTrack(-1, 1500)).resolves.toBe(true);
    expect(sound.hasFinaleTrack(-1)).toBe(true);
    expect(fetches).toHaveLength(1);
    expect(fetches[0]).toContain('finale_ending');
    await expect(sound.prepareFinaleTrack(-1, 1500)).resolves.toBe(true); // ready now: no second load
    expect(fetches).toHaveLength(1);
  });

  it('offline or broken: the synth plays the ending', async () => {
    g.fetch = () => Promise.reject(new Error('offline'));
    const sound = engine(() => Promise.resolve({ duration: 60 }));
    await expect(sound.prepareFinaleTrack(-1, 1500)).resolves.toBe(false);
    expect(sound.hasFinaleTrack(-1)).toBe(false);
  });

  it('slow: the replay waits no longer than its limit, and the song is kept for next time', async () => {
    vi.useFakeTimers();
    let finishDecode: (b: unknown) => void = () => undefined;
    g.fetch = () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
    const sound = engine(() => new Promise((r) => (finishDecode = r)));
    const ready = sound.prepareFinaleTrack(-1, 1500);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(ready).resolves.toBe(false);
    finishDecode({ duration: 60 });
    await vi.advanceTimersByTimeAsync(0);
    expect(sound.hasFinaleTrack(-1)).toBe(true);
  });

  it('before the first tap there is nothing to decode with: the song waits for that tap', () => {
    const sound = new SoundEngine(memStore());
    sound.preloadFinaleTrack(-1);
    expect((sound as unknown as { finaleWanted: Set<string> }).finaleWanted.size).toBe(1);
  });
});
