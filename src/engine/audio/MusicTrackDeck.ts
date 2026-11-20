/**
 * Drop-in soundtrack for the web edition: streams the bundled recordings (the same files the
 * native app ships in native-apple/MouthLifeApp/Music) through two <audio> decks with an 850 ms
 * crossfade. Both decks feed the music chain, so the volume setting, pause muffling and voice
 * ducking still apply. A file that fails to load or decode is reported so the procedural synth
 * takes over for that theme, exactly as on a device without the track.
 */
import type { ThemeId } from './musicTheory';
import { resolveMusicTrack, type BrushMusicStage } from './musicTracks';

export const TRACK_CROSSFADE_SEC = 0.85;

/** 16 samples of 16-bit silence: lets one tap "unlock" both decks on iOS before a track is chosen. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRkQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

interface Deck {
  el: HTMLAudioElement;
  gain: GainNode;
  file: string | null;
  /** The recording has actually started sounding (its first `playing` event since `file` was set). */
  audible: boolean;
  /** A play() inside a tap went through, so iOS lets this element start later with no tap. */
  primed: boolean;
  /** The priming attempt still waiting on play() (0 when none); a newer attempt or source makes it stale. */
  priming: number;
}

/** An opening recording that started downloading before the first tap (see `preloadOpeningTrack`). */
export interface PreloadedTrack {
  el: HTMLAudioElement;
  file: string;
}

/**
 * Starts downloading the first recording the player will hear, at page load, so it is ready by
 * the first tap (browsers allow no sound before one). The element is handed to the deck later.
 */
export function preloadOpeningTrack(baseUrl: string, file: string): PreloadedTrack | null {
  if (typeof Audio === 'undefined') return null;
  const el = new Audio();
  el.loop = true;
  el.preload = 'auto';
  el.src = baseUrl + encodeURIComponent(file);
  return { el, file };
}

export class MusicTrackDeck {
  private readonly decks: Deck[] = [];
  private active = -1;
  private readonly failed = new Set<string>();
  private primeSeq = 0;
  /** What the last sync() asked of the active deck: playing, or held. */
  private wantPlaying = false;
  /** Fires after a file failed to load or decode, so the caller can fall back to the synth. */
  onTrackFailed: ((file: string) => void) | null = null;
  /** Fires when the active recording starts sounding, so the synth can hand over to it. */
  onAudibleChanged: (() => void) | null = null;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    private readonly baseUrl: string,
    private readonly files: readonly string[],
    preloaded: PreloadedTrack | null = null
  ) {
    if (typeof Audio === 'undefined' || files.length === 0) return;
    for (let i = 0; i < 2; i++) {
      // A preload that already failed (offline, say) is not adopted: the synth plays that theme.
      if (i === 0 && preloaded?.el.error) this.failed.add(preloaded.file);
      const early =
        i === 0 && preloaded && !preloaded.el.error && files.includes(preloaded.file) ? preloaded : null;
      const el = early?.el ?? new Audio();
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
      const deck: Deck = { el, gain, file: early?.file ?? null, audible: false, primed: false, priming: 0 };
      el.addEventListener('error', () => this.markFailed(deck));
      el.addEventListener('playing', () => {
        // The silent unlock clip plays with no file set: that is not music.
        if (deck.file === null || deck.audible) return;
        deck.audible = true;
        if (this.decks[this.active] === deck) this.onAudibleChanged?.();
      });
      // Out of buffered audio mid-song (a slow connection): the synth fills in until it plays again.
      el.addEventListener('waiting', () => {
        if (!deck.audible) return;
        deck.audible = false;
        if (this.decks[this.active] === deck) this.onAudibleChanged?.();
      });
      this.decks.push(deck);
    }
  }

  /** True when this build shipped recordings and the browser can route them through Web Audio. */
  hasTracks(): boolean {
    return this.decks.length === 2;
  }

  /** The recording that should play for this theme, or null when the synth should. */
  resolve(themeId: ThemeId, brushStage: BrushMusicStage | null = null): string | null {
    if (!this.hasTracks()) return null;
    return resolveMusicTrack(
      themeId,
      this.files.filter((f) => !this.failed.has(f)),
      brushStage
    );
  }

  activeFile(): string | null {
    return this.decks[this.active]?.file ?? null;
  }

  /** True once the active recording is really sounding (not still buffering after a tap). */
  isAudible(): boolean {
    return this.decks[this.active]?.audible ?? false;
  }

  /**
   * Call synchronously inside every user gesture, so both decks may start later without another
   * tap. Each element counts as unlocked only once a play() of it really went through: one that was
   * refused (iOS turns down a touchstart, say) tries again on the next gesture.
   */
  unlock(): void {
    if (!this.hasTracks()) return;
    for (const deck of this.decks) {
      if (deck.primed || deck.priming !== 0) continue;
      const opener = deck.file !== null;
      if (opener && !deck.el.paused) {
        deck.primed = true; // already playing, so already allowed
        continue;
      }
      // The preloaded opener starts inside this tap too (its gain is still 0, so it is silent), or
      // iOS may refuse to play it later; sync() keeps it going if it is the one wanted. An empty
      // deck plays a silent clip instead.
      if (!opener) deck.el.src = SILENT_WAV;
      const token = ++this.primeSeq;
      const p = deck.el.play();
      if (!p) {
        deck.primed = true; // an old browser with no promise: nothing to wait for
        continue;
      }
      deck.priming = token;
      p.then(
        () => {
          if (deck.priming !== token) return; // stale: the deck has moved on to another source
          deck.priming = 0;
          deck.primed = true;
          const wanted = deck.file !== null && this.decks[this.active] === deck && this.wantPlaying;
          if (!wanted) deck.el.pause();
        },
        (err: unknown) => {
          if (deck.priming !== token) return;
          deck.priming = 0;
          // Refused (or cut short): this element stays eligible for the next gesture. Anything else
          // (a clip this browser cannot play) would only fail again, so it is not retried.
          const name = (err as { name?: string } | null)?.name;
          if (name !== 'NotAllowedError' && name !== 'AbortError') deck.primed = true;
        }
      );
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
    this.wantPlaying = file !== null && playing;
    if (file === null) {
      for (const deck of this.decks) this.fadeOut(deck, now, tau);
      this.active = -1;
      return false;
    }
    let deck = this.decks[this.active];
    if (!deck || deck.file !== file) {
      // A deck that already holds this file (the preloaded opener) plays it without reloading.
      const holding = this.decks.findIndex((d, i) => i !== this.active && d.file === file);
      const free = this.decks.findIndex((d, i) => i !== this.active && d.file === null);
      const nextIdx = holding >= 0 ? holding : free >= 0 && this.active < 0 ? free : this.active === 0 ? 1 : 0;
      if (deck) this.fadeOut(deck, now, tau);
      deck = this.decks[nextIdx];
      if (deck.file !== file) {
        deck.file = file;
        deck.audible = false;
        // a priming play() still pending belonged to the old source: its outcome no longer counts
        deck.priming = 0;
        deck.el.src = this.baseUrl + encodeURIComponent(file);
        deck.el.load();
      }
      deck.gain.gain.cancelScheduledValues(now);
      deck.gain.gain.setValueAtTime(0, now);
      this.active = nextIdx;
    }
    deck.gain.gain.cancelScheduledValues(now);
    if (playing) {
      deck.gain.gain.setTargetAtTime(1, now, tau);
      if (deck.el.paused) {
        const target = deck;
        // Resuming a paused deck: it counts as sounding again only once it really plays.
        deck.audible = false;
        const p = deck.el.play();
        if (p) {
          p.then(
            () => {
              // it played, so this element is allowed to start again later without a tap
              target.primed = true;
            },
            (err: unknown) => {
              // An autoplay refusal clears on the next tap (the engine re-syncs and re-primes on
              // every gesture); a pause() cutting in is harmless; anything else means the file is bad.
              const name = (err as { name?: string } | null)?.name;
              if (name !== 'NotAllowedError' && name !== 'AbortError') this.markFailed(target);
            }
          );
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
    deck.audible = false;
    deck.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    if (this.decks[this.active] === deck) this.active = -1;
    this.onTrackFailed?.(file);
  }
}
