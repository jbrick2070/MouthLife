import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MusicTrackDeck, preloadOpeningTrack } from '../src/engine/audio/MusicTrackDeck';

/** Just enough of an <audio> element to drive the deck: events, play/pause, and what was loaded. */
class FakeAudio extends EventTarget {
  loop = false;
  preload = '';
  paused = true;
  error: { code: number } | null = null;
  loads = 0;
  srcSets: string[] = [];
  private _src = '';
  get src(): string {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
    this.srcSets.push(v);
  }
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  load(): void {
    this.loads++;
  }
  fire(type: string): void {
    this.dispatchEvent(new Event(type));
  }
}

/**
 * An <audio> element as iOS Safari treats it: play() is allowed inside a real gesture, and ever
 * after once it has played inside one; otherwise it is refused (NotAllowedError) and stays paused.
 */
class GatedAudio extends FakeAudio {
  static inGesture = false;
  /** Leave play() outcomes pending until settle(), to test late results. */
  static deferred = false;
  static refusals = 0;
  static readonly all: GatedAudio[] = [];
  blessed = false;
  private pending: ((ok: boolean) => void)[] = [];
  constructor() {
    super();
    GatedAudio.all.push(this);
  }
  play(): Promise<void> {
    if (!GatedAudio.inGesture && !this.blessed) {
      GatedAudio.refusals++;
      return Promise.reject(Object.assign(new Error('not allowed'), { name: 'NotAllowedError' }));
    }
    this.paused = false;
    if (!GatedAudio.deferred) {
      this.blessed = true;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) =>
      this.pending.push((ok) => {
        if (ok) {
          this.blessed = true;
          resolve();
        } else {
          this.paused = true;
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }
      })
    );
  }
  settle(ok: boolean): void {
    for (const done of this.pending.splice(0)) done(ok);
  }
}

/** Lets pending promise callbacks run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function fakeCtx() {
  const param = () => ({ value: 0, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {} });
  return {
    currentTime: 0,
    createGain: () => ({ gain: param(), connect() {} }),
    createMediaElementSource: () => ({ connect() {} }),
  } as unknown as AudioContext;
}

const FILES = ['cosmic.m4a', 'sanctuary.m4a'];
const g = globalThis as Record<string, unknown>;
let savedAudio: unknown;

describe('music deck: preloaded opener and the synth hand-over', () => {
  beforeEach(() => {
    savedAudio = g.Audio;
    g.Audio = FakeAudio;
  });
  afterEach(() => {
    if (savedAudio === undefined) delete g.Audio;
    else g.Audio = savedAudio;
  });

  it('plays the preloaded opener without loading it again, and reports when it really sounds', () => {
    const pre = preloadOpeningTrack('/music/', 'cosmic.m4a')!;
    const el = pre.el as unknown as FakeAudio;
    expect(el.srcSets).toEqual(['/music/cosmic.m4a']); // downloading before the first tap
    const deck = new MusicTrackDeck(fakeCtx(), {} as AudioNode, '/music/', FILES, pre);
    let changes = 0;
    deck.onAudibleChanged = () => changes++;

    deck.unlock(); // the first tap: the opener is started too (silently), not swapped for the unlock clip
    expect(el.srcSets).toEqual(['/music/cosmic.m4a']);

    expect(deck.sync('cosmic.m4a', true)).toBe(true);
    expect(el.loads).toBe(0);
    expect(el.srcSets).toEqual(['/music/cosmic.m4a']);
    expect(deck.isAudible()).toBe(false); // asked to play, still buffering: the synth keeps going

    el.fire('playing');
    expect(deck.isAudible()).toBe(true);
    expect(changes).toBe(1);

    el.fire('waiting'); // out of buffer mid-song: the synth fills in
    expect(deck.isAudible()).toBe(false);
    expect(changes).toBe(2);
    el.fire('playing');
    expect(deck.isAudible()).toBe(true);
  });

  it('M22: a refused first touch leaves both decks eligible, and the next tap unlocks them for hands-free play', async () => {
    g.Audio = GatedAudio;
    GatedAudio.all.length = 0;
    const deck = new MusicTrackDeck(fakeCtx(), {} as AudioNode, '/music/', FILES);
    const [a, b] = GatedAudio.all;

    GatedAudio.inGesture = false; // iOS: a touch going down is not a gesture for media
    deck.unlock();
    await flush();
    expect(a.blessed || b.blessed).toBe(false);

    GatedAudio.inGesture = true; // the same tap lifting, or a click: a real gesture
    deck.unlock();
    await flush();
    expect(a.blessed && b.blessed).toBe(true);
    expect(a.paused && b.paused).toBe(true); // the silent clips stopped again
    GatedAudio.inGesture = false;

    // hands-free from here on: the brush's music, then the floss's on the other deck
    expect(deck.sync('cosmic.m4a', true)).toBe(true);
    await flush();
    const first = GatedAudio.all.find((el) => el.src.endsWith('cosmic.m4a'))!;
    expect(first.paused).toBe(false);
    const savedWindow = g.window;
    g.window = { setTimeout: () => 0 }; // the crossfade parks the old deck a moment later
    try {
      expect(deck.sync('sanctuary.m4a', true)).toBe(true);
    } finally {
      if (savedWindow === undefined) delete g.window;
      else g.window = savedWindow;
    }
    await flush();
    const second = GatedAudio.all.find((el) => el.src.endsWith('sanctuary.m4a'))!;
    expect(second).not.toBe(first);
    expect(second.paused).toBe(false);
    expect(GatedAudio.refusals).toBe(2); // only the first touch's two attempts were turned down
  });

  it('M22: a priming result that arrives after the deck changed source is ignored', async () => {
    g.Audio = GatedAudio;
    GatedAudio.all.length = 0;
    GatedAudio.inGesture = true;
    GatedAudio.deferred = true;
    try {
      const deck = new MusicTrackDeck(fakeCtx(), {} as AudioNode, '/music/', FILES);
      deck.unlock(); // both silent clips start, their outcomes still pending
      deck.sync('cosmic.m4a', true); // the music takes one deck over meanwhile
      const music = GatedAudio.all.find((el) => el.src.endsWith('cosmic.m4a'))!;
      music.settle(true); // the old silent-clip play finally resolves...
      await flush();
      expect(music.paused).toBe(false); // ...and does not pause the music now on that element
      for (const el of GatedAudio.all) el.settle(true);
      await flush();
      expect(music.paused).toBe(false);
    } finally {
      GatedAudio.deferred = false;
      GatedAudio.inGesture = false;
    }
  });

  it('does not adopt a preload that already failed, so that theme falls back to the synth', () => {
    const pre = preloadOpeningTrack('/music/', 'cosmic.m4a')!;
    (pre.el as unknown as FakeAudio).error = { code: 4 };
    const deck = new MusicTrackDeck(fakeCtx(), {} as AudioNode, '/music/', FILES, pre);
    expect(deck.resolve('cosmic')).not.toBe('cosmic.m4a');
  });
});
