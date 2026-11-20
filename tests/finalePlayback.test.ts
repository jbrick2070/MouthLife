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
import { SoundEngine } from '../src/engine/audio/SoundEngine';
import { FinaleStage3D } from '../src/engine/render/FinaleStage3D';
import { SceneManager } from '../src/engine/render/SceneManager';
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
