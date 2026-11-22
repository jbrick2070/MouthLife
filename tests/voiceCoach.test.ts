import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VOICE_DUCK_RELEASE_MS, VoiceCoach } from '../src/engine/audio/VoiceCoach';

// The spoken brushing coach: it may only speak through a voice that is on the device, and the music
// it lowers under a cue must always come back up. Nothing here makes a sound: the browser's speech
// is a stand-in that records what it was asked to say.

interface FakeVoice {
  name: string;
  lang: string;
  localService: boolean;
}

interface FakeUtterance {
  text: string;
  lang: string;
  voice: FakeVoice | null;
  volume: number;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

/** Desktop Chrome's Google voices: spoken by a server, so not local. */
const GOOGLE_VOICES: FakeVoice[] = [
  { name: 'Google Deutsch', lang: 'de-DE', localService: false },
  { name: 'Google US English', lang: 'en-US', localService: false },
  { name: 'Google UK English Female', lang: 'en-GB', localService: false },
  { name: 'Google español', lang: 'es-ES', localService: false },
  { name: 'Google français', lang: 'fr-FR', localService: false },
  { name: 'Google 日本語', lang: 'ja-JP', localService: false },
  { name: 'Google 한국의', lang: 'ko-KR', localService: false },
  { name: 'Google português do Brasil', lang: 'pt-BR', localService: false },
  { name: 'Google 普通话（中国大陆）', lang: 'zh-CN', localService: false },
];
const OWN_ENGLISH: FakeVoice = { name: 'Computer voice, US English', lang: 'en-US', localService: true };

let voices: FakeVoice[];
let spoken: FakeUtterance[];
let cancels: number;
let resumes: number;
/** What the music was told, in order: true = lowered under a cue, false = back up. */
let duck: boolean[];

const g = globalThis as Record<string, unknown>;

function newCoach(): VoiceCoach {
  const coach = new VoiceCoach();
  coach.setLanguage('en');
  coach.onSpeakingChanged = (speaking) => duck.push(speaking);
  return coach;
}

/** True while the coach itself holds on to that cue. */
const holds = (coach: VoiceCoach, cue: FakeUtterance): boolean =>
  Object.values(coach as unknown as Record<string, unknown>).includes(cue);

beforeEach(() => {
  vi.useFakeTimers();
  voices = [OWN_ENGLISH, ...GOOGLE_VOICES];
  spoken = [];
  cancels = 0;
  resumes = 0;
  duck = [];
  const stored = new Map<string, string>();
  g.window = {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    },
    speechSynthesis: {
      getVoices: () => voices,
      cancel: () => void (cancels += 1),
      resume: () => void (resumes += 1),
      pause: () => {},
      // This stand-in never reports the end of a cue by itself: a test does, or nobody does.
      speak: (cue: FakeUtterance) => void spoken.push(cue),
    },
  };
  g.SpeechSynthesisUtterance = class implements FakeUtterance {
    lang = '';
    voice: FakeVoice | null = null;
    volume = 1;
    rate = 1;
    pitch = 1;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  };
});

afterEach(() => {
  delete g.window;
  delete g.SpeechSynthesisUtterance;
  vi.useRealTimers();
});

describe('the coach speaks only through a voice on this device', () => {
  it('uses the device’s own voice for the language', () => {
    const coach = newCoach();
    coach.speak('One');
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe('One');
    expect(spoken[0].lang).toBe('en-US');
    expect(spoken[0].voice).toBe(OWN_ENGLISH);
    expect(duck).toEqual([true]);
  });

  it('says nothing when the only voice for the language is not on the device', () => {
    const coach = newCoach();
    for (const language of ['ja', 'ko', 'zh', 'de', 'pt', 'es', 'fr'] as const) {
      coach.setLanguage(language);
      coach.speak('1');
      expect(spoken, language).toEqual([]);
    }
    // Nothing was said, so the music was never lowered, nothing else was cut off, and no timer waits.
    expect(duck).toEqual([]);
    expect(cancels).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(coach.hasVoiceForLanguage()).toBe(false);
    coach.setLanguage('en');
    expect(coach.hasVoiceForLanguage()).toBe(true);
  });

  it('prefers the device’s voice from another region to an exact-region voice that is not on the device', () => {
    const british: FakeVoice = { name: 'Computer voice, UK English', lang: 'en-GB', localService: true };
    voices = [...GOOGLE_VOICES, british];
    const coach = newCoach();
    coach.speak('One');
    expect(spoken[0].voice).toBe(british);
  });

  it('says nothing until the browser has listed its voices, instead of letting the browser choose', () => {
    voices = []; // Chromium fills the list a moment after start-up
    const coach = newCoach();
    coach.speak('One');
    expect(spoken).toEqual([]);
    expect(duck).toEqual([]);
    // Once the list is there, the next cue is spoken.
    voices = [OWN_ENGLISH, ...GOOGLE_VOICES];
    coach.speak('Two');
    expect(spoken.map((cue) => cue.text)).toEqual(['Two']);
    expect(spoken[0].voice).toBe(OWN_ENGLISH);
  });

  it('still says nothing when muted or switched off', () => {
    const coach = newCoach();
    coach.soundLevel = () => 0;
    coach.speak('One');
    coach.soundLevel = () => 1;
    coach.setEnabled(false);
    coach.speak('Two');
    expect(spoken).toEqual([]);
    expect(duck).toEqual([]);
  });
});

describe('the music always comes back up after a cue', () => {
  it('waits 5.5 seconds for a cue whose end is never reported, as the native app does', () => {
    expect(VOICE_DUCK_RELEASE_MS).toBe(5500);
    const coach = newCoach();
    coach.speak('One');
    expect(duck).toEqual([true]);
    vi.advanceTimersByTime(5499);
    expect(duck).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(duck).toEqual([true, false]);
    expect(vi.getTimerCount()).toBe(0);
    // An end reported late after all changes nothing more.
    spoken[0].onend?.();
    vi.advanceTimersByTime(60_000);
    expect(duck).toEqual([true, false]);
  });

  it('a lost cue does not keep the music down under the cues that follow', () => {
    const coach = newCoach();
    coach.speak('One'); // its end is never reported
    vi.advanceTimersByTime(3000);
    coach.speak('Two');
    spoken[1].onend?.();
    expect(duck).toEqual([true, true, false]);
    coach.speak('Three');
    spoken[2].onend?.();
    expect(duck).toEqual([true, true, false, true, false]);
    // No timer of an earlier cue is left to fire into a later one.
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(duck).toEqual([true, true, false, true, false]);
  });

  it('each cue gets its own 5.5 seconds', () => {
    const coach = newCoach();
    coach.speak('One');
    vi.advanceTimersByTime(5000);
    coach.speak('Two'); // replaces One half a second before One's time is up
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(500);
    expect(duck).toEqual([true, true]); // Two is still being spoken
    vi.advanceTimersByTime(4999);
    expect(duck).toEqual([true, true]);
    vi.advanceTimersByTime(1);
    expect(duck).toEqual([true, true, false]);
  });

  it('a cue that reports its end releases the music at once and leaves no timer', () => {
    const coach = newCoach();
    coach.speak('One');
    spoken[0].onend?.();
    expect(duck).toEqual([true, false]);
    expect(vi.getTimerCount()).toBe(0);
    // A cue that fails is over too.
    coach.speak('Two');
    spoken[1].onerror?.();
    expect(duck).toEqual([true, false, true, false]);
    // Reported twice (end after error) counts once.
    spoken[1].onend?.();
    vi.advanceTimersByTime(60_000);
    expect(duck).toEqual([true, false, true, false]);
  });

  it('the end of a cue that was replaced does not release the newer cue', () => {
    const coach = newCoach();
    coach.speak('One');
    coach.speak('Two');
    expect(cancels).toBe(2); // each cue cuts off the one before it
    spoken[0].onerror?.(); // the browser reports the cut-off cue
    expect(duck).toEqual([true, true]);
    spoken[1].onend?.();
    expect(duck).toEqual([true, true, false]);
  });

  it('holds on to the cue until it is over, then lets go of it', () => {
    const coach = newCoach();
    coach.speak('One');
    expect(holds(coach, spoken[0])).toBe(true);
    spoken[0].onend?.();
    expect(holds(coach, spoken[0])).toBe(false);

    coach.speak('Two');
    coach.speak('Three');
    expect(holds(coach, spoken[1])).toBe(false);
    expect(holds(coach, spoken[2])).toBe(true);
    vi.advanceTimersByTime(VOICE_DUCK_RELEASE_MS);
    expect(holds(coach, spoken[2])).toBe(false);

    coach.speak('Four');
    coach.stop();
    expect(holds(coach, spoken[3])).toBe(false);
  });

  it('stop() brings the music up, forgets the timer, and is quiet when nothing was being said', () => {
    const coach = newCoach();
    coach.stop();
    expect(duck).toEqual([]);
    coach.speak('One');
    coach.stop();
    expect(duck).toEqual([true, false]);
    expect(vi.getTimerCount()).toBe(0);
    // Speech left paused is resumed on the way out, as before (M07).
    expect(resumes).toBeGreaterThanOrEqual(2);
    spoken[0].onerror?.();
    vi.advanceTimersByTime(60_000);
    expect(duck).toEqual([true, false]);
    // Switching the coach off stops it the same way.
    coach.speak('Two');
    coach.setEnabled(false);
    expect(duck).toEqual([true, false, true, false]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
