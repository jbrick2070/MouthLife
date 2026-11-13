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
 * Pick the installed voice that best fits a BCP-47 tag: exact locale first, then the same
 * language, preferring a local (offline) voice at each step. Null lets the browser decide.
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
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    let score = 0;
    if (lang === want) score = 4;
    else if (lang.split('-')[0] === wantLang) score = 2;
    if (score > 0 && v.localService) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/**
 * Hands-free spoken brushing coach built on the browser's Web Speech API.
 * Silent no-op where speech synthesis is missing. Preferences live outside the save
 * (same choice as the native app, which keeps them in UserDefaults).
 */
export class VoiceCoach {
  private enabled: boolean;
  private language: CoachLanguage;
  private speakingCount = 0;
  /** Called with true while a cue is being spoken, so music can duck under it. */
  onSpeakingChanged: ((speaking: boolean) => void) | null = null;
  /** Called after the language changes. The whole game uses this one language setting. */
  onLanguageChanged: ((language: CoachLanguage) => void) | null = null;

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

  /** True when a voice for the current language is installed (false = the browser falls back). */
  hasVoiceForLanguage(): boolean {
    const synth = this.synth();
    if (!synth) return false;
    return pickVoice(synth.getVoices(), COACH_LANGUAGE_INFO[this.language].bcp47VoiceCode) >= 0;
  }

  /** Speak one cue now, replacing any cue still being spoken. */
  speak(text: string): void {
    const synth = this.synth();
    if (!synth || !this.enabled || !text) return;
    const bcp47 = COACH_LANGUAGE_INFO[this.language].bcp47VoiceCode;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = bcp47;
    const voices = synth.getVoices();
    const idx = pickVoice(voices, bcp47);
    if (idx >= 0) utterance.voice = voices[idx];
    utterance.rate = 1.0;
    utterance.pitch = 1.03;

    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      this.speakingCount = Math.max(0, this.speakingCount - 1);
      if (this.speakingCount === 0) this.onSpeakingChanged?.(false);
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    synth.cancel();
    this.speakingCount += 1;
    this.onSpeakingChanged?.(true);
    synth.speak(utterance);
  }

  pause(): void {
    this.synth()?.pause();
  }

  resume(): void {
    this.synth()?.resume();
  }

  stop(): void {
    this.synth()?.cancel();
    if (this.speakingCount !== 0) {
      this.speakingCount = 0;
      this.onSpeakingChanged?.(false);
    }
  }
}
