import {
  COACH_LANGUAGE_INFO,
  detectCoachLanguage,
  isCoachLanguage,
  type CoachLanguage,
} from '../../config/brushCoach';

const ENABLED_KEY = 'mouthlife.voiceCoach.enabled';
const LANGUAGE_KEY = 'mouthlife.voiceCoach.language';

function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the choice simply lasts for this visit.
  }
}

/**
 * If the browser never says a cue has ended, the music comes back up this long after the cue began
 * (a cue is one word). The native app uses the same 5.5 seconds.
 */
export const VOICE_DUCK_RELEASE_MS = 5500;

/**
 * Pick the voice that best fits a BCP-47 tag: exact locale first, then the same language. Only a
 * voice the browser marks as local is ever picked. Any other voice is spoken by a server, which
 * would be sent the coach's words, and the game promises that everything stays on this device.
 * Returns -1 when no local voice fits: the coach then says nothing.
 */
export function pickVoice(
  voices: readonly Pick<SpeechSynthesisVoice, 'lang' | 'localService'>[],
  bcp47: string
): number {
  const want = bcp47.toLowerCase().replace('_', '-');
  const wantLang = want.split('-')[0];
  let best = -1;
  let bestScore = 0;
  voices.forEach((v, i) => {
    // Not marked local (false, or not marked at all): never used, however well it fits.
    if (v.localService !== true) return;
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    let score = 0;
    if (lang === want) score = 2;
    else if (lang.split('-')[0] === wantLang) score = 1;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/**
 * Hands-free spoken brushing coach built on the browser's Web Speech API.
 * Silent where speech synthesis is missing, and where no voice on the device speaks the chosen
 * language. Preferences live outside the save (same choice as the native app, which keeps them in
 * UserDefaults).
 */
export class VoiceCoach {
  private enabled: boolean;
  private language: CoachLanguage;
  /**
   * The cue being spoken, held here until it ends. A browser can drop a cue that nothing holds on
   * to before it has finished, and then never says that it ended.
   */
  private current: SpeechSynthesisUtterance | null = null;
  /** Brings the music back up if the end of the cue is never reported. */
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  /** Called with true while a cue is being spoken, so music can duck under it. */
  onSpeakingChanged: ((speaking: boolean) => void) | null = null;
  /** Called after the language changes. The whole game uses this one language setting. */
  onLanguageChanged: ((language: CoachLanguage) => void) | null = null;
  /** The game's sound settings: speech is silent when muted and follows the effects volume (0..1). */
  soundLevel: (() => number) | null = null;

  constructor() {
    this.enabled = readPref(ENABLED_KEY) !== '0';
    const stored = readPref(LANGUAGE_KEY);
    this.language = isCoachLanguage(stored)
      ? stored
      : detectCoachLanguage(typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []);
    // Voices load asynchronously in Chromium; touching the list early warms it up.
    this.synth()?.getVoices();
  }

  private synth(): SpeechSynthesis | null {
    return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  }

  isSupported(): boolean {
    return this.synth() !== null;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    writePref(ENABLED_KEY, enabled ? '1' : '0');
    if (!enabled) this.stop();
  }

  getLanguage(): CoachLanguage {
    return this.language;
  }

  setLanguage(language: CoachLanguage): void {
    this.language = language;
    writePref(LANGUAGE_KEY, language);
    this.onLanguageChanged?.(language);
  }

  /** True when a voice on this device speaks the current language (false = the coach stays silent). */
  hasVoiceForLanguage(): boolean {
    const synth = this.synth();
    if (!synth) return false;
    return pickVoice(synth.getVoices(), COACH_LANGUAGE_INFO[this.language].bcp47VoiceCode) >= 0;
  }

  /** Speak one cue now, replacing any cue still being spoken. */
  speak(text: string): void {
    const synth = this.synth();
    const level = this.soundLevel ? this.soundLevel() : 1;
    if (!synth || !this.enabled || !text || level <= 0.001) return;
    const bcp47 = COACH_LANGUAGE_INFO[this.language].bcp47VoiceCode;
    const voices = synth.getVoices();
    const idx = pickVoice(voices, bcp47);
    // No voice on this device for the language: say nothing (the pacer's sounds still play). A cue
    // sent with only a language would let the browser choose the voice, and it may choose one that
    // is not on the device.
    if (idx < 0) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = Math.min(1, Math.max(0, level));
    utterance.lang = bcp47;
    utterance.voice = voices[idx];
    utterance.rate = 1.0;
    utterance.pitch = 1.03;

    const finish = (): void => this.settle(utterance);
    utterance.onend = finish;
    utterance.onerror = finish;

    synth.cancel();
    // A cue is spoken only while the ritual runs: if speech was left paused (Pause, then Home or a
    // jump to the next stage), resume it, or this and every later cue would wait silently (M07).
    synth.resume();
    this.clearReleaseTimer();
    this.current = utterance;
    // The end of a cue is not always reported (the system can cut speech off without a word). The
    // music must never stay lowered for that, so it comes back up by itself after a while.
    this.releaseTimer = setTimeout(finish, VOICE_DUCK_RELEASE_MS);
    this.onSpeakingChanged?.(true);
    synth.speak(utterance);
  }

  /** A cue ended, failed, or ran out of time: let go of it and bring the music back up. */
  private settle(utterance: SpeechSynthesisUtterance): void {
    // An earlier cue that a newer one replaced: the newer cue still keeps the music down.
    if (this.current !== utterance) return;
    this.current = null;
    this.clearReleaseTimer();
    this.onSpeakingChanged?.(false);
  }

  private clearReleaseTimer(): void {
    if (this.releaseTimer === null) return;
    clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
  }

  pause(): void {
    this.synth()?.pause();
  }

  resume(): void {
    this.synth()?.resume();
  }

  stop(): void {
    const synth = this.synth();
    synth?.cancel();
    // Leaving a paused ritual must not leave speech paused for the next one (M07).
    synth?.resume();
    this.clearReleaseTimer();
    if (this.current) {
      this.current = null;
      this.onSpeakingChanged?.(false);
    }
  }
}
