/**
 * Drop-in soundtrack for the web edition: streams the bundled recordings (the same files the
 * native app ships in native-apple/MouthLifeApp/Music) through two <audio> decks with an 850 ms
 * crossfade. Both decks feed the music chain, so the volume setting, pause muffling and voice
 * ducking still apply. A file that fails to load or decode is reported so the procedural synth
 * takes over for that theme, exactly as on a device without the track.
 */
import type { ThemeId } from './musicTheory';
import { resolveMusicTrack } from './musicTracks';

export const TRACK_CROSSFADE_SEC = 0.85;

/** 16 samples of 16-bit silence: lets one tap "unlock" both decks on iOS before a track is chosen. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRkQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

interface Deck {
  el: HTMLAudioElement;
  gain: GainNode;
  file: string | null;
}

export class MusicTrackDeck {
  private readonly decks: Deck[] = [];
  private active = -1;
  private readonly failed = new Set<string>();
  private unlocked = false;
  /** Fires after a file failed to load or decode, so the caller can fall back to the synth. */
  onTrackFailed: ((file: string) => void) | null = null;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    private readonly baseUrl: string,
    private readonly files: readonly string[]
  ) {
    if (typeof Audio === 'undefined' || files.length === 0) return;
    for (let i = 0; i < 2; i++) {
      const el = new Audio();
      el.loop = true;
      el.preload = 'auto';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      try {
        ctx.createMediaElementSource(el).connect(gain);
      } catch {
        this.decks.length = 0;
        return;
      }
      gain.connect(out);
      const deck: Deck = { el, gain, file: null };
      el.addEventListener('error', () => this.markFailed(deck));
      this.decks.push(deck);
    }
  }

  /** True when this build shipped recordings and the browser can route them through Web Audio. */
  hasTracks(): boolean {
    return this.decks.length === 2;
  }

  /** The recording that should play for this theme, or null when the synth should. */
  resolve(themeId: ThemeId): string | null {
    if (!this.hasTracks()) return null;
    return resolveMusicTrack(
      themeId,
      this.files.filter((f) => !this.failed.has(f))
    );
  }

  activeFile(): string | null {
    return this.decks[this.active]?.file ?? null;
  }

  /** Call synchronously inside a user gesture, so both decks may start later without another tap. */
  unlock(): void {
    if (this.unlocked || !this.hasTracks()) return;
    this.unlocked = true;
    for (const deck of this.decks) {
      if (deck.file !== null) continue;
      deck.el.src = SILENT_WAV;
      const p = deck.el.play();
      if (p) {
        p.then(() => {
          if (deck.file === null) deck.el.pause();
        }).catch(() => {});
      }
    }
  }

  /**
   * Moves playback to `file`, crossfading from whatever was playing, and starts or pauses it.
   * Returns true while a recording is the active music source.
   */
  sync(file: string | null, playing: boolean): boolean {
    if (!this.hasTracks()) return false;
    const now = this.ctx.currentTime;
    const tau = TRACK_CROSSFADE_SEC / 3;
    if (file === null) {
      for (const deck of this.decks) this.fadeOut(deck, now, tau);
      this.active = -1;
      return false;
    }
    let deck = this.decks[this.active];
    if (!deck || deck.file !== file) {
      const nextIdx = this.active === 0 ? 1 : 0;
      if (deck) this.fadeOut(deck, now, tau);
      deck = this.decks[nextIdx];
      deck.file = file;
      deck.el.src = this.baseUrl + encodeURIComponent(file);
      deck.el.load();
      deck.gain.gain.cancelScheduledValues(now);
      deck.gain.gain.setValueAtTime(0, now);
      this.active = nextIdx;
    }
    deck.gain.gain.cancelScheduledValues(now);
    if (playing) {
      deck.gain.gain.setTargetAtTime(1, now, tau);
      if (deck.el.paused) {
        const target = deck;
        const p = deck.el.play();
        if (p) {
          p.catch((err: unknown) => {
            // An autoplay refusal clears on the next tap (the engine re-syncs on every gesture);
            // a pause() cutting in is harmless; anything else means the file itself is bad.
            const name = (err as { name?: string } | null)?.name;
            if (name !== 'NotAllowedError' && name !== 'AbortError') this.markFailed(target);
          });
        }
      }
    } else {
      deck.gain.gain.setTargetAtTime(0, now, 0.1);
      if (!deck.el.paused) deck.el.pause();
    }
    return true;
  }

  private fadeOut(deck: Deck, now: number, tau: number): void {
    deck.gain.gain.cancelScheduledValues(now);
    deck.gain.gain.setTargetAtTime(0, now, tau);
    const file = deck.file;
    if (file === null || deck.el.paused) return;
    window.setTimeout(() => {
      // Still parked on the same file and no longer the active deck: stop streaming it.
      if (deck.file === file && this.decks[this.active] !== deck) deck.el.pause();
    }, TRACK_CROSSFADE_SEC * 1000 + 120);
  }

  private markFailed(deck: Deck): void {
    const file = deck.file;
    if (file === null || this.failed.has(file)) return;
    this.failed.add(file);
    deck.el.pause();
    deck.file = null;
    deck.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    if (this.decks[this.active] === deck) this.active = -1;
    this.onTrackFailed?.(file);
  }
}
