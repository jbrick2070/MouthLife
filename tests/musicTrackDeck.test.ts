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

  it('does not adopt a preload that already failed, so that theme falls back to the synth', () => {
    const pre = preloadOpeningTrack('/music/', 'cosmic.m4a')!;
    (pre.el as unknown as FakeAudio).error = { code: 4 };
    const deck = new MusicTrackDeck(fakeCtx(), {} as AudioNode, '/music/', FILES, pre);
    expect(deck.resolve('cosmic')).not.toBe('cosmic.m4a');
  });
});
