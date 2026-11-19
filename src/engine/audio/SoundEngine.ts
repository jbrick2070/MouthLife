import type { AppMode } from '../types';
import { MusicSequencer } from './MusicSequencer';
import { MusicTrackDeck } from './MusicTrackDeck';
import type { BrushMusicStage } from './musicTracks';
import { BUNDLED_MUSIC_FILES } from 'virtual:bundled-music';
import {
  COSMIC_BEAT_BARS,
  DEFAULT_AUDIO_PREFS,
  THEMES,
  chordAtBar,
  chordMidis,
  harmonicSfxMidi,
  loadAudioPrefs,
  midiToFreq,
  PACER_TRANSPOSE,
  saveAudioPrefs,
  selectTheme,
  type AudioPrefs,
  type ChordDef,
  type ThemeDef,
  type ThemeId,
} from './musicTheory';
import {
  buildPinkNoise,
  buildReverbImpulse,
  celesta,
  marimba,
  playVoice,
  rhodes,
  softKick,
  type VoiceOut,
} from './SynthVoices';
import { resolveFinaleTrack, type FinaleNote } from '../../config/cityFinale';

const MASTER_GAIN = 0.85;
const MUSIC_SCALE = 0.55;
/** Bundled recordings are mastered already; same level the native app gives them. */
const TRACK_SCALE = 0.72;
/**
 * Theme keys are full MIDI notes (around G3), but the effect code was written as if they were
 * pitch classes, so every effect played three octaves too high (3-12 kHz, a hearing-test whine).
 * The shared pitch helper takes this back off, so "48" lands near G4 and "60" near G5.
 * Keep in step with `sfxOctaveDrop` in the native app.
 */
const SFX_OCTAVE_DROP = 36;
/** Brush-Along cue register (G4 after the drop). Keep in step with `pacerCueOctave` natively. */
const PACER_CUE_OCTAVE = 48;
/** Effects ring with less room sound than the music, so they stay short and clear. */
const SFX_REVERB_SCALE = 0.6;
const SFX_SCALE = 0.95;
/** About -8.4 dB, the same music duck the native app uses under spoken cues. */
const VOICE_DUCK_GAIN = 0.38;
/** A city's finale brings its own music: the game's music sinks right down underneath it. */
const FINALE_DUCK_GAIN = 0.12;
const FLOOR = 0.0001;

/** About +/-1 dB, so a cue heard many times never lands identically. Pitch stays in key. */
function sfxJitter(): number {
  return 0.89 + Math.random() * 0.23;
}

export interface ScrubState {
  active: boolean;
  probeSpeed: number;
  newlyCleaned: number;
  cleanRatio: number;
  brush?: 'bass' | 'hydro-sonic';
}

/**
 * Public audio facade. Music = lookahead sequencer (MusicSequencer + SynthVoices),
 * SFX = harmonically quantized plucks/bells + ASMR foam scrubbing, all through one
 * shared reverb + one shared tape delay, a gentle HP/LP master and a limiter.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private globalListenersBound = false;
  private gestureReceived = false;
  private prefs: AudioPrefs;
  onPrefsChanged: ((prefs: AudioPrefs) => void) | null = null;

  private masterGain: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private musicRevSend: GainNode | null = null;
  private musicDelSend: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private sfxRevSend: GainNode | null = null;
  private sfxDelSend: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private delaySend: GainNode | null = null;
  private delayL: DelayNode | null = null;
  private delayR: DelayNode | null = null;
  private noise: AudioBuffer | null = null;
  private seq: MusicSequencer | null = null;
  private musicOut: VoiceOut | null = null;
  private sfxOut: VoiceOut | null = null;
  private lastScrubChimeDeg = -1;

  // context for theme selection
  private currentMode: AppMode = 'COSMIC_INTRO';
  private worldId = 'world_1';
  private hubGlobe = false;
  private pulpZero = false;
  private paused = false;
  /** True while the voice coach is speaking: music sits about 8 dB lower so the words stay clear. */
  private voiceDucked = false;
  private finaleDucked = false;
  private finaleBus: GainNode | null = null;
  private finaleVoice: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private readonly finaleBuffers = new Map<string, Promise<AudioBuffer | null>>();
  /** Songs whose audio is decoded and ready to start this moment. */
  private readonly finaleDecoded = new Set<string>();
  /** Bumped on every start/stop, so a song that finishes loading late never starts out of turn. */
  private finaleToken = 0;
  private hidden = false;
  private urgency = false;
  private acidTension = false;
  private coda = false;
  private pacerQuadrant = 0;
  private cosmicBeat = 0;

  // ASMR scrub chain
  private scrubGain: GainNode | null = null;
  private scrubBp: BiquadFilterNode | null = null;
  private scrubShimBp: BiquadFilterNode | null = null;
  private scrubShimGain: GainNode | null = null;
  private scrubLfo: OscillatorNode | null = null;
  private scrubWasActive = false;

  private throttles = new Map<string, number>();

  /** Streams the bundled recordings; null until the audio graph exists. */
  private trackDeck: MusicTrackDeck | null = null;
  private trackBus: GainNode | null = null;
  /** Floss and rinse play their own recordings during Brush-Along. */
  private brushMusicStage: BrushMusicStage | null = null;

  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'> | null) {
    this.prefs = loadAudioPrefs(storage);
  }

  // ---------------------------------------------------------------- lifecycle

  bindGlobalUnlockListeners(): void {
    if (this.globalListenersBound || typeof window === 'undefined') return;
    this.globalListenersBound = true;
    const unlock = () => {
      this.gestureReceived = true;
      this.unlockOnGesture();
    };
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    window.addEventListener('touchstart', unlock, { capture: true, passive: true });
    window.addEventListener('mousedown', unlock, { capture: true, passive: true });
    window.addEventListener('click', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', unlock, { capture: true, passive: true });
    if (typeof document !== 'undefined') {
      this.hidden = document.visibilityState === 'hidden';
      document.addEventListener('visibilitychange', () => {
        this.hidden = document.visibilityState === 'hidden';
        if (!this.hidden && this.gestureReceived && this.ctx && this.isContextSuspendedOrInterrupted(this.ctx)) {
          this.ctx
            .resume()
            .then(() => this.applyPlaybackState())
            .catch(() => {});
        } else {
          this.applyPlaybackState();
        }
      });
    }
  }

  private isContextSuspendedOrInterrupted(ctx: AudioContext): boolean {
    const state = ctx.state as string;
    return state === 'suspended' || state === 'interrupted';
  }

  private hasUserActivation(): boolean {
    if (this.gestureReceived || this.ctx !== null) return true;
    if (typeof navigator !== 'undefined' && 'userActivation' in navigator) {
      const ua = (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation;
      if (ua && typeof ua.hasBeenActive === 'boolean') return ua.hasBeenActive;
    }
    return true;
  }

  unlockOnGesture(): void {
    if (typeof window === 'undefined') return;
    if (!this.hasUserActivation()) return;
    this.gestureReceived = true;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      try {
        this.ctx = new AudioCtx();
        this.ctx.addEventListener?.('statechange', () => this.applyPlaybackState());
        this.buildGraph();
      } catch {
        this.ctx = null;
        return;
      }
    }
    // Still inside the tap that got us here, which is what iOS needs to let the decks play later.
    this.trackDeck?.unlock();
    if (this.isContextSuspendedOrInterrupted(this.ctx)) {
      this.ctx
        .resume()
        .then(() => this.applyPlaybackState())
        .catch(() => {});
    } else {
      this.applyPlaybackState();
    }
  }

  private buildGraph(): void {
    const ctx = this.ctx!;
    // Master: musicBus/sfxBus -> master -> HP 30Hz -> LP 14kHz -> limiter -> out
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 20;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    const nyquist = Math.max(4000, ctx.sampleRate * 0.5 - 200);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(14000, nyquist);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 30;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.prefs.muted ? FLOOR : MASTER_GAIN;
    this.masterGain.connect(hp);
    hp.connect(lp);
    lp.connect(comp);
    comp.connect(ctx.destination);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = Math.min(18000, nyquist);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.prefs.musicVolume * MUSIC_SCALE;
    this.musicBus.connect(this.musicFilter);
    this.musicFilter.connect(this.masterGain);

    // Recorded tracks share the music filter (pause muffling) but have their own level.
    this.trackBus = ctx.createGain();
    this.trackBus.gain.value = 0;
    this.trackBus.connect(this.musicFilter);
    this.trackDeck = new MusicTrackDeck(ctx, this.trackBus, `${import.meta.env.BASE_URL}music/`, BUNDLED_MUSIC_FILES);
    this.trackDeck.onTrackFailed = () => this.applyPlaybackState();

    // A finale's own song: straight to the master, at the music level, never ducked by the finale.
    this.finaleBus = ctx.createGain();
    this.finaleBus.gain.value = this.prefs.muted ? 0 : this.prefs.musicVolume * TRACK_SCALE;
    this.finaleBus.connect(this.masterGain);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.prefs.sfxVolume * SFX_SCALE;
    this.sfxBus.connect(this.masterGain);

    // Shared algorithmic stereo reverb (one convolver)
    const conv = ctx.createConvolver();
    conv.buffer = buildReverbImpulse(ctx, 1.3);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    const revReturn = ctx.createGain();
    revReturn.gain.value = 0.55;
    this.reverbSend.connect(conv);
    conv.connect(revReturn);
    revReturn.connect(this.masterGain);

    // Shared warm ping-pong tape delay (lowpass in the feedback loop)
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 1;
    this.delayL = ctx.createDelay(1.5);
    this.delayR = ctx.createDelay(1.5);
    this.delayL.delayTime.value = 0.32;
    this.delayR.delayTime.value = 0.32;
    const fbLp = ctx.createBiquadFilter();
    fbLp.type = 'lowpass';
    fbLp.frequency.value = 2400;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const delRet = ctx.createGain();
    delRet.gain.value = 0.4;
    this.delaySend.connect(this.delayL);
    this.delayL.connect(fbLp);
    fbLp.connect(this.delayR);
    this.delayR.connect(fb);
    fb.connect(this.delayL);
    if (typeof ctx.createStereoPanner === 'function') {
      const pl = ctx.createStereoPanner();
      pl.pan.value = -0.7;
      const pr = ctx.createStereoPanner();
      pr.pan.value = 0.7;
      this.delayL.connect(pl);
      this.delayR.connect(pr);
      pl.connect(delRet);
      pr.connect(delRet);
    } else {
      this.delayL.connect(delRet);
      this.delayR.connect(delRet);
    }
    delRet.connect(this.masterGain);

    this.noise = buildPinkNoise(ctx, 3);
    const musicWetScale =
      this.prefs.musicVolume <= 0.001 ? 0 : this.prefs.musicVolume / DEFAULT_AUDIO_PREFS.musicVolume;
    this.musicRevSend = ctx.createGain();
    this.musicRevSend.gain.value = musicWetScale;
    this.musicRevSend.connect(this.reverbSend);
    this.musicDelSend = ctx.createGain();
    this.musicDelSend.gain.value = musicWetScale;
    this.musicDelSend.connect(this.delaySend);

    const sfxWetScale =
      this.prefs.sfxVolume <= 0.001 ? 0 : this.prefs.sfxVolume / DEFAULT_AUDIO_PREFS.sfxVolume;
    this.sfxRevSend = ctx.createGain();
    this.sfxRevSend.gain.value = sfxWetScale;
    this.sfxRevSend.connect(this.reverbSend);
    this.sfxDelSend = ctx.createGain();
    this.sfxDelSend.gain.value = sfxWetScale;
    this.sfxDelSend.connect(this.delaySend);

    this.musicOut = {
      ctx,
      dest: this.musicBus,
      reverb: this.musicRevSend,
      delay: this.musicDelSend,
      noise: this.noise,
    };
    this.sfxOut = {
      ctx,
      dest: this.sfxBus,
      reverb: this.sfxRevSend,
      delay: this.sfxDelSend,
      noise: this.noise,
    };

    this.seq = new MusicSequencer(ctx, this.musicOut);
    this.seq.onTempo = (stepSec) => {
      const dotted8 = stepSec * 3;
      const now = ctx.currentTime;
      this.delayL?.delayTime.setTargetAtTime(Math.min(1.4, dotted8), now, 0.1);
      this.delayR?.delayTime.setTargetAtTime(Math.min(1.4, dotted8), now, 0.1);
    };
    this.refreshTheme(true);

    this.buildScrubChain();
  }

  private buildScrubChain(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.scrubBp = ctx.createBiquadFilter();
    this.scrubBp.type = 'bandpass';
    this.scrubBp.frequency.value = 1200;
    this.scrubBp.Q.value = 0.9;
    this.scrubShimBp = ctx.createBiquadFilter();
    this.scrubShimBp.type = 'bandpass';
    this.scrubShimBp.frequency.value = 2600;
    this.scrubShimBp.Q.value = 0.8;
    this.scrubShimGain = ctx.createGain();
    this.scrubShimGain.gain.value = 0.15;
    this.scrubGain = ctx.createGain();
    this.scrubGain.gain.value = 0;
    // LFO-swept swish
    this.scrubLfo = ctx.createOscillator();
    this.scrubLfo.type = 'sine';
    this.scrubLfo.frequency.value = 2;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 420;
    this.scrubLfo.connect(lfoDepth);
    lfoDepth.connect(this.scrubBp.frequency);
    src.connect(this.scrubBp);
    src.connect(this.scrubShimBp);
    this.scrubBp.connect(this.scrubGain);
    this.scrubShimBp.connect(this.scrubShimGain);
    this.scrubShimGain.connect(this.scrubGain);
    this.scrubGain.connect(this.sfxBus!);
    const rv = ctx.createGain();
    rv.gain.value = 0.16;
    this.scrubGain.connect(rv);
    rv.connect(this.sfxRevSend!);
    src.start();
    this.scrubLfo.start();
  }

  // ------------------------------------------------------------------- state

  getAudioState(): string {
    if (this.prefs.muted) return 'muted';
    return this.ctx ? this.ctx.state : 'uninitialized';
  }

  getDebugInfo(): Record<string, unknown> {
    return {
      ctxState: this.ctx?.state ?? 'uninitialized',
      theme: this.seq?.theme.id ?? null,
      recordedTrack: this.trackDeck?.activeFile() ?? null,
      bundledTracks: BUNDLED_MUSIC_FILES.length,
      sequencerRunning: this.seq?.isRunning() ?? false,
      stepsScheduled: this.seq?.stepsScheduled ?? 0,
      muted: this.prefs.muted,
      musicVolume: this.prefs.musicVolume,
      sfxVolume: this.prefs.sfxVolume,
      paused: this.paused,
      hidden: this.hidden,
    };
  }

  /** Test/debug hook: pump the scheduler once. */
  pumpSequencer(): void {
    this.seq?.tick();
  }

  getPrefs(): AudioPrefs {
    return { ...this.prefs };
  }

  private persist(): void {
    saveAudioPrefs(this.prefs);
    this.onPrefsChanged?.({ ...this.prefs });
  }

  setMuted(muted: boolean): void {
    this.prefs.muted = muted;
    this.persist();
    if (!this.ctx || !this.masterGain) {
      if (!muted) this.unlockOnGesture();
      return;
    }
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(muted ? FLOOR : MASTER_GAIN, now, 0.04);
    if (muted) {
      this.scrubGain?.gain.setTargetAtTime(0, now, 0.03);
    } else {
      this.unlockOnGesture();
      this.applyPlaybackState();
      this.playUiTap();
    }
  }

  isMuted(): boolean {
    return this.prefs.muted;
  }

  setMusicVolume(v: number): void {
    this.prefs.musicVolume = Math.max(0, Math.min(1, v));
    this.persist();
    this.applyPlaybackState();
  }
  getMusicVolume(): number {
    return this.prefs.musicVolume;
  }
  setSfxVolume(v: number): void {
    this.prefs.sfxVolume = Math.max(0, Math.min(1, v));
    this.persist();
    if (this.ctx && this.sfxBus) {
      const now = this.ctx.currentTime;
      const silent = this.prefs.sfxVolume <= 0.001;
      this.sfxBus.gain.setTargetAtTime(silent ? 0 : this.prefs.sfxVolume * SFX_SCALE, now, 0.04);
      const wet = silent ? 0 : this.prefs.sfxVolume / DEFAULT_AUDIO_PREFS.sfxVolume;
      this.sfxRevSend?.gain.setTargetAtTime(wet, now, 0.04);
      this.sfxDelSend?.gain.setTargetAtTime(wet, now, 0.04);
      if (silent) this.scrubGain?.gain.setTargetAtTime(0, now, 0.03);
    }
  }
  getSfxVolume(): number {
    return this.prefs.sfxVolume;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.stopScrub();
    this.applyPlaybackState();
  }

  /** Lower the music under a spoken coaching cue, and bring it back afterwards. */
  setVoiceDucked(ducked: boolean): void {
    if (ducked === this.voiceDucked) return;
    this.voiceDucked = ducked;
    this.applyPlaybackState();
  }

  /** Sink the music while a city finale (or the ending) plays its own. */
  setFinaleDucked(ducked: boolean): void {
    if (ducked === this.finaleDucked) return;
    this.finaleDucked = ducked;
    this.applyPlaybackState();
  }

  /** True when the music folder has a song for a city's finale (0..4) or the ending (-1). */
  /** True when a finale's song is loaded and ready to play this moment (not merely bundled). */
  hasFinaleTrack(index: number): boolean {
    const file = resolveFinaleTrack(index, BUNDLED_MUSIC_FILES);
    return file !== null && this.finaleDecoded.has(file);
  }

  /** Starts loading a finale's song, so it is ready the moment the last zone seals. */
  preloadFinaleTrack(index: number): void {
    const file = resolveFinaleTrack(index, BUNDLED_MUSIC_FILES);
    if (file) void this.loadFinaleBuffer(file);
  }

  private loadFinaleBuffer(file: string): Promise<AudioBuffer | null> {
    let pending = this.finaleBuffers.get(file);
    if (!pending) {
      const ctx = this.ctx;
      pending = ctx
        ? fetch(`${import.meta.env.BASE_URL}music/${file}`)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
            .then((data) => ctx.decodeAudioData(data))
            .then((buf) => {
              this.finaleDecoded.add(file);
              return buf;
            })
            .catch(() => {
              // offline or a hiccup: forget the failure so the next preload tries again
              this.finaleBuffers.delete(file);
              return null;
            })
        : Promise.resolve(null);
      if (ctx) {
        this.finaleBuffers.set(file, pending);
        // keep at most two decoded songs (the coming finale and the ending), not all six
        while (this.finaleBuffers.size > 2) {
          const oldest = this.finaleBuffers.keys().next().value as string;
          this.finaleBuffers.delete(oldest);
          this.finaleDecoded.delete(oldest);
        }
      }
    }
    return pending;
  }

  /**
   * Plays a finale's song from `offsetSec` (where the show already is). If it is still loading it
   * starts as soon as it can, at the right place, so the music stays on the show's beats.
   */
  playFinaleTrack(index: number, offsetSec: number): void {
    this.stopFinaleTrack(0.25);
    const file = resolveFinaleTrack(index, BUNDLED_MUSIC_FILES);
    // only a song that is already loaded plays (the show decided on that when it began)
    if (!file || this.prefs.muted || !this.finaleDecoded.has(file)) return;
    this.unlockOnGesture();
    const token = ++this.finaleToken;
    const startedAt = performance.now() - offsetSec * 1000;
    void this.loadFinaleBuffer(file).then((buf) => {
      const ctx = this.ctx;
      if (!buf || !ctx || !this.finaleBus || token !== this.finaleToken) return;
      const offset = (performance.now() - startedAt) / 1000;
      if (offset >= buf.duration) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = 1;
      src.connect(gain);
      gain.connect(this.finaleBus);
      src.start(ctx.currentTime + 0.01, Math.max(0, offset));
      this.finaleVoice = { src, gain };
      src.onended = () => {
        if (this.finaleVoice?.src === src) {
          this.finaleVoice = null;
          this.applyPlaybackState();
        }
      };
      this.applyPlaybackState();
    });
  }

  /** Fades out whatever finale song is playing. */
  stopFinaleTrack(fadeSec = 0.6): void {
    this.finaleToken++;
    const voice = this.finaleVoice;
    this.finaleVoice = null;
    if (!voice || !this.ctx) return;
    const now = this.ctx.currentTime;
    voice.gain.gain.setTargetAtTime(0, now, Math.max(0.02, fadeSec / 4));
    try {
      voice.src.stop(now + fadeSec + 0.05);
    } catch {
      /* already stopped */
    }
    this.applyPlaybackState();
  }

  /** Bus gains/filter + scheduler on/off for pause + hidden-tab ducking (no backlog on resume). */
  private applyPlaybackState(): void {
    if (!this.ctx || !this.musicBus || !this.musicFilter || !this.seq) return;
    const now = this.ctx.currentTime;
    const themeMix = this.seq.theme.mixGain ?? 1;
    const silent = this.prefs.musicVolume <= 0.001;
    const themeId = this.seq.theme.id;
    const track = silent ? null : (this.trackDeck?.resolve(themeId, this.brushMusicStage) ?? null);
    const base = silent ? 0 : this.prefs.musicVolume * MUSIC_SCALE * themeMix;
    const wetBase = silent ? 0 : (this.prefs.musicVolume / DEFAULT_AUDIO_PREFS.musicVolume) * themeMix;
    if (this.hidden) {
      this.musicBus.gain.setTargetAtTime(FLOOR, now, 0.05);
      this.musicRevSend?.gain.setTargetAtTime(0, now, 0.05);
      this.musicDelSend?.gain.setTargetAtTime(0, now, 0.05);
      this.trackBus?.gain.setTargetAtTime(FLOOR, now, 0.05);
      // a finale song keeps its place (it plays on, silent) and is heard again in step on return
      this.finaleBus?.gain.setTargetAtTime(FLOOR, now, 0.05);
      this.trackDeck?.sync(track, false);
      this.seq.stop();
      this.stopScrub();
      return;
    }
    // A finale with its own song silences the game's music; one played by the synth only sinks it.
    const finaleDuck = this.finaleDucked ? (this.finaleVoice ? FLOOR : FINALE_DUCK_GAIN) : 1;
    const voiceDuck = (this.voiceDucked ? VOICE_DUCK_GAIN : 1) * finaleDuck;
    this.finaleBus?.gain.setTargetAtTime(
      this.hidden || this.prefs.muted ? FLOOR : Math.max(FLOOR, this.prefs.musicVolume * TRACK_SCALE),
      now,
      0.08
    );
    const dryTarget = silent ? 0 : Math.max(FLOOR, (this.paused ? base * 0.45 : base) * voiceDuck);
    const wetDuck = this.paused ? 0.3 : this.acidTension && this.seq.theme.id === 'world_3' ? 0.65 : 1;
    const wetTarget = silent ? 0 : wetBase * wetDuck * voiceDuck;
    this.musicBus.gain.setTargetAtTime(dryTarget, now, 0.12);
    this.musicRevSend?.gain.setTargetAtTime(wetTarget, now, 0.12);
    this.musicDelSend?.gain.setTargetAtTime(wetTarget, now, 0.12);
    const nyquist = Math.max(4000, this.ctx.sampleRate * 0.5 - 200);
    const cutoff = this.paused
      ? 700
      : this.acidTension && this.seq.theme.id === 'world_3'
        ? 2400
        : Math.min(18000, nyquist);
    this.musicFilter.frequency.setTargetAtTime(cutoff, now, 0.15);

    // Bundled recording for this theme: it plays, and the synth only tracks chords for the SFX.
    const wantMusic = this.ctx.state === 'running' && !this.prefs.muted && !silent;
    const acidDip = this.acidTension && themeId === 'world_3';
    const trackBase = track ? this.prefs.musicVolume * TRACK_SCALE : 0;
    const trackTarget = Math.max(
      FLOOR,
      (this.paused ? trackBase * 0.38 : acidDip ? trackBase * 0.82 : trackBase) * voiceDuck
    );
    this.trackBus?.gain.setTargetAtTime(trackTarget, now, 0.12);
    const trackLive = (this.trackDeck?.sync(track, wantMusic) ?? false) && wantMusic;
    this.seq.notesMuted = trackLive;
    if (wantMusic) {
      this.seq.start();
    } else if (silent) {
      this.seq.stop();
    }
  }

  // ------------------------------------------------------------ music control

  setAmbientMode(mode: AppMode): void {
    this.currentMode = mode;
    if (mode !== 'BRUSH_ALONG') {
      this.pacerQuadrant = 0;
      this.coda = false;
      this.brushMusicStage = null;
    }
    if (mode !== 'ARCADE' && mode !== 'PULP_RESCUE') {
      this.urgency = false;
      this.acidTension = false;
    }
    if (mode !== 'COSMIC_INTRO') this.cosmicBeat = 0;
    this.refreshTheme();
  }

  setWorldContext(worldId: string): void {
    this.worldId = worldId;
    this.refreshTheme();
  }

  setHubFocus(tab: 'companion' | 'globe' | string): void {
    this.hubGlobe = tab === 'globe';
    this.refreshTheme();
  }

  setPulpReadiness(pulpIntegrity: number): void {
    const z = pulpIntegrity <= 0;
    if (z !== this.pulpZero) {
      this.pulpZero = z;
      this.refreshTheme();
    }
  }

  setCosmicBeat(beat: number): void {
    this.cosmicBeat = beat;
    this.refreshOptions();
  }

  setPacerState(quadrantIdx: number, inFlossBonus: boolean, stage: BrushMusicStage | null = null): void {
    this.pacerQuadrant = Math.max(0, Math.min(3, quadrantIdx));
    this.coda = inFlossBonus;
    this.refreshOptions();
    if (stage !== this.brushMusicStage) {
      this.brushMusicStage = stage;
      this.applyPlaybackState();
    }
  }

  /** Last-20s Pulp Rescue urgency (gentle tempo/hat step-up, never shrill). */
  setUrgency(on: boolean): void {
    if (on === this.urgency) return;
    this.urgency = on;
    this.refreshOptions();
  }

  /** World 3: darken while the Stephan acid dip is active, bloom bright when buffered. */
  setAcidTension(on: boolean): void {
    if (on === this.acidTension) return;
    this.acidTension = on;
    this.refreshOptions();
    this.applyPlaybackState();
  }

  private refreshTheme(initial = false): void {
    if (!this.seq) return;
    const id: ThemeId = selectTheme({
      mode: this.currentMode,
      worldId: this.worldId,
      hubGlobe: this.hubGlobe,
      pulpZero: this.pulpZero,
    });
    this.seq.setTheme(id);
    this.refreshOptions();
    if (!initial) this.applyPlaybackState();
  }

  private refreshOptions(): void {
    if (!this.seq) return;
    const id = this.seq.theme.id;
    const o = this.seq.opts;
    o.transpose = id === 'brush_along' ? PACER_TRANSPOSE[this.pacerQuadrant] : 0;
    o.coda = id === 'brush_along' && this.coda;
    o.urgency = id === 'pulp' && this.urgency;
    o.intensity = this.acidTension && id === 'world_3' ? 0.85 : 1;
    const cosmicBar = COSMIC_BEAT_BARS[((this.cosmicBeat % 4) + 4) % 4] ?? 0;
    o.chordOverride = id === 'cosmic' ? chordAtBar(THEMES.cosmic, cosmicBar) : null;
    o.layers = {};
    if (id === 'brush_along') o.layers = { arp: this.coda || this.pacerQuadrant >= 2 };
    this.seq.setTempoScale(
      id === 'pulp' && this.urgency ? 1.1 : id === 'brush_along' && this.coda ? 1.14 : 1
    );
  }

  // -------------------------------------------------------- harmonic helpers

  getHarmony(): { theme: ThemeDef; chord: ChordDef } {
    const theme = this.seq?.theme ?? THEMES.hub;
    return { theme, chord: this.seq?.currentChord ?? theme.progressionA[0] };
  }

  /** In-key note for SFX: scale degree snapped to the current chord, in a comfortable register. */
  harmonicMidi(degree: number, octaveShift = 36): number {
    const { theme, chord } = this.getHarmony();
    return harmonicSfxMidi(theme, chord, degree, octaveShift - SFX_OCTAVE_DROP);
  }

  private throttle(key: string, gapSec: number): boolean {
    const now = this.ctx?.currentTime ?? 0;
    const last = this.throttles.get(key) ?? -999;
    if (now - last < gapSec) return false;
    this.throttles.set(key, now);
    return true;
  }

  /** Runs `fn(t)` once audio is live (resumes suspended contexts), skipping when muted or sfxVolume=0. */
  private run(fn: (out: VoiceOut, t: number) => void): void {
    if (this.prefs.muted || this.prefs.sfxVolume <= 0.001) return;
    this.unlockOnGesture();
    if (!this.ctx || !this.sfxOut) return;
    const go = () => {
      if (!this.ctx || !this.sfxOut || this.prefs.muted || this.prefs.sfxVolume <= 0.001) return;
      fn(this.sfxOut, this.ctx.currentTime + 0.01);
    };
    if (this.isContextSuspendedOrInterrupted(this.ctx)) this.ctx.resume().then(go).catch(() => {});
    else go();
  }

  // Low-level SFX primitives -------------------------------------------------

  private bell(out: VoiceOut, t: number, midi: number, vel = 0.7, pan = 0, send = 0.55): void {
    celesta(out, t, midiToFreq(midi), vel * sfxJitter(), pan, send * SFX_REVERB_SCALE, false, true);
  }

  private wood(out: VoiceOut, t: number, midi: number, vel = 0.7, pan = 0, send = 0.2): void {
    marimba(out, t, midiToFreq(midi), vel * sfxJitter(), pan, send * SFX_REVERB_SCALE, false, true);
  }

  private blip(out: VoiceOut, t: number, f0: number, f1: number, dur: number, peak: number, type: OscillatorType = 'sine', lpHz = 4000): void {
    const ctx = out.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lpHz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
    o.connect(lp);
    lp.connect(g);
    g.connect(out.dest);
    const s = ctx.createGain();
    s.gain.value = 0.15;
    g.connect(s);
    s.connect(out.reverb);
    o.start(t);
    o.stop(t + dur + 0.04);
  }

  private noiseSweep(out: VoiceOut, t: number, f0: number, f1: number, dur: number, peak: number, q = 1.2): void {
    const ctx = out.ctx;
    const s = ctx.createBufferSource();
    s.buffer = out.noise;
    s.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
    s.connect(bp);
    bp.connect(g);
    g.connect(out.dest);
    const r = ctx.createGain();
    r.gain.value = 0.2;
    g.connect(r);
    r.connect(out.reverb);
    s.start(t, Math.random() * 1.5, dur + 0.05);
    s.stop(t + dur + 0.06);
  }

  // ------------------------------------------------------------ UI / one-shots

  playUiTap(): void {
    if (!this.throttle('tap', 0.04)) return;
    this.run((o, t) => this.bell(o, t, this.harmonicMidi(2, 48), 0.5, 0, 0.3));
  }

  playMohsSpecimenTone(mohsIndex: number): void {
    const degs = [0, 1, 2, 3, 5];
    const i = Math.max(0, Math.min(4, mohsIndex));
    this.run((o, t) => {
      const m = this.harmonicMidi(degs[i], 48);
      this.bell(o, t, m, 0.75);
      if (i === 2) {
        this.bell(o, t + 0.07, m + 7, 0.55, -0.2);
        this.bell(o, t + 0.14, m + 12, 0.5, 0.2);
      }
    });
  }

  playTreatSnack(): void {
    this.run((o, t) => {
      this.wood(o, t, this.harmonicMidi(3, 48), 0.7, -0.2);
      this.wood(o, t + 0.09, this.harmonicMidi(5, 48), 0.65, 0.1);
      this.wood(o, t + 0.18, this.harmonicMidi(2, 60), 0.6, 0.25);
      this.noiseSweep(o, t, 1800, 2200, 0.18, 0.025, 0.8);
    });
  }

  playOrbitalDive(): void {
    this.run((o, t) => {
      // harp-like pentatonic sweep + soft air whoosh
      for (let i = 0; i < 5; i++) {
        this.bell(o, t + i * 0.07, this.harmonicMidi(i, 48), 0.5, (i - 2) * 0.15, 0.6);
      }
      this.noiseSweep(o, t, 500, 2400, 0.45, 0.04, 0.7);
    });
  }

  playCosmicBeatChime(beatIdx: number): void {
    this.run((o, t) => {
      const bar = COSMIC_BEAT_BARS[((beatIdx % 4) + 4) % 4] ?? 0;
      const chord = chordAtBar(THEMES.cosmic, bar);
      const ms = chordMidis(THEMES.cosmic, chord, 0, 24);
      ms.forEach((m, i) => this.bell(o, t + i * 0.09, m, 0.55, (i - 2) * 0.2, 0.7));
    });
  }

  playFlossSnap(targetsHit: number, zipped: boolean, ribbon = false): void {
    this.run((o, t) => {
      const m = this.harmonicMidi(targetsHit > 0 ? 3 : 1, 48);
      this.wood(o, t, m, 0.7);
      this.wood(o, t + 0.035, m + 7, 0.45);
      if (ribbon) this.noiseSweep(o, t, 2400, 1000, 0.16, 0.035, 1.5);
      if (zipped) {
        this.noiseSweep(o, t, 1200, 2200, 0.22, 0.035, 1.0);
        this.bell(o, t + 0.1, this.harmonicMidi(6, 48), 0.55);
      }
    });
  }

  playIonRinseWave(buffered = false): void {
    this.run((o, t) => {
      for (let i = 0; i < 5; i++) this.bell(o, t + i * 0.055, this.harmonicMidi(i, 48), 0.55, (i - 2) * 0.12, 0.65);
      this.noiseSweep(o, t, 900, 2200, 0.4, 0.035, 0.8);
      if (buffered) this.noiseSweep(o, t + 0.14, 2200, 720, 0.4, 0.055, 1.2);
    });
  }

  playDisclosePulse(): void {
    this.run((o, t) => {
      this.bell(o, t, this.harmonicMidi(2, 60), 0.6);
      this.bell(o, t + 0.1, this.harmonicMidi(4, 60), 0.5);
    });
  }

  playSiteRestored(): void {
    this.run((o, t) => {
      [0, 2, 4].forEach((d, i) => this.bell(o, t + i * 0.06, this.harmonicMidi(d, 60), 0.65, (i - 1) * 0.2));
    });
  }

  playDistrictSealed(): void {
    this.run((o, t) => {
      [0, 2, 4, 7].forEach((d, i) => {
        this.bell(o, t + i * 0.07, this.harmonicMidi(d, 60), 0.6, (i - 1.5) * 0.15, 0.7);
      });
      const { theme, chord } = this.getHarmony();
      chordMidis(theme, chord, 0, 12).slice(0, 3).forEach((m) => rhodes(o, t + 0.2, midiToFreq(m), 0.9, 0.55, 0, 0.5));
    });
  }

  playSmoothBaskSparkle(): void {
    this.run((o, t) => {
      [3, 4, 5, 7].forEach((d, i) => this.bell(o, t + i * 0.065, this.harmonicMidi(d, 60), 0.5, (i - 1.5) * 0.2, 0.7));
    });
  }

  /** Squeaky-clean glass-harp note: rising in-key pentatonic scale with shimmer partials. */
  playGlassHarpNote(step: number): void {
    if (!this.throttle('glass', 0.05)) return;
    this.run((o, t) => {
      const deg = Math.max(0, Math.min(11, step));
      const m = this.harmonicMidi(deg, 60);
      celesta(o, t, midiToFreq(m), 0.7, 0, 0.7 * SFX_REVERB_SCALE, true, true);
    });
  }

  /** Dull squishy thud when rubbing fuzzy, low-smoothness or sugar-splatted teeth. */
  playSquishThud(): void {
    if (!this.throttle('squish', 0.08)) return;
    this.run((o, t) => this.blip(o, t, 150, 70, 0.16, 0.2, 'sine', 600));
  }

  playSugarSplat(): void {
    this.run((o, t) => {
      this.blip(o, t, 380, 160, 0.12, 0.14, 'triangle', 1400);
      this.blip(o, t + 0.06, 240, 110, 0.14, 0.1, 'sine', 900);
      this.noiseSweep(o, t, 2000, 900, 0.1, 0.03, 0.9);
    });
  }

  playCrystalShatter(): void {
    this.run((o, t) => {
      [7, 9, 6, 11].forEach((d, i) => this.bell(o, t + i * 0.028, this.harmonicMidi(d, 60), 0.45, (i - 1.5) * 0.3, 0.6));
      this.noiseSweep(o, t, 2200, 1400, 0.1, 0.022, 0.7);
    });
  }

  /** Fizzy sweet-sip drop: the Stephan clock restarts. */
  playAcidSip(): void {
    this.run((o, t) => {
      this.noiseSweep(o, t, 1400, 2200, 0.22, 0.035, 0.9);
      this.wood(o, t, this.harmonicMidi(4, 48), 0.6);
      this.wood(o, t + 0.11, this.harmonicMidi(1, 48), 0.55);
    });
  }

  /** Warm low velvet thump for tender gingiva (throttled). */
  playGumTender(): void {
    if (!this.throttle('gum', 0.7)) return;
    this.run((o, t) => {
      this.blip(o, t, 130, 82, 0.28, 0.16, 'sine', 420);
      this.blip(o, t + 0.01, 196, 110, 0.2, 0.05, 'triangle', 500);
    });
  }

  /** Rubbery resonant boing for EPS dome deflection (throttled). */
  playEpsDeflect(): void {
    if (!this.throttle('eps', 0.5)) return;
    this.run((o, t) => this.boing(o, t, 210, 0.15));
  }

  private boing(out: VoiceOut, t: number, base: number, peak: number): void {
    const ctx = out.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 1.9, t + 0.06);
    osc.frequency.exponentialRampToValueAtTime(base * 1.15, t + 0.28);
    const vib = ctx.createOscillator();
    vib.frequency.value = 16;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(base * 0.12, t);
    vg.gain.exponentialRampToValueAtTime(1, t + 0.3);
    vib.connect(vg);
    vg.connect(osc.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.34);
    osc.connect(lp);
    lp.connect(g);
    g.connect(out.dest);
    const s = ctx.createGain();
    s.gain.value = 0.15;
    g.connect(s);
    s.connect(out.reverb);
    osc.start(t);
    vib.start(t);
    osc.stop(t + 0.4);
    vib.stop(t + 0.4);
  }

  playEpsCrack(): void {
    this.run((o, t) => {
      [5, 7, 9].forEach((d, i) => this.bell(o, t + i * 0.03, this.harmonicMidi(d, 60), 0.5, (i - 1) * 0.3));
      this.blip(o, t, 200, 90, 0.14, 0.1, 'sine', 500);
    });
  }

  playFluorapatiteInfuse(): void {
    this.run((o, t) => {
      [2, 4, 5, 7].forEach((d, i) => this.bell(o, t + i * 0.045, this.harmonicMidi(d, 60), 0.5, (i - 1.5) * 0.2, 0.7));
    });
  }

  playErosionWash(): void {
    this.run((o, t) => {
      this.noiseSweep(o, t, 900, 2600, 0.35, 0.035, 0.7);
      this.wood(o, t, this.harmonicMidi(3, 48), 0.5);
      this.wood(o, t + 0.1, this.harmonicMidi(1, 48), 0.45);
    });
  }

  /**
   * "3… 2… 1…" pickup before each switch: a rising triad, an octave higher for the upper teeth.
   * Soft kalimba taps, then one celesta note on "1". The theme key is already a full note
   * (around G3), so these offsets keep the pips between roughly 200 Hz and 600 Hz.
   */
  playPacerAnticipationPip(secondsLeft: number, isUpper: boolean): void {
    const s = Math.max(1, Math.min(3, Math.round(secondsLeft)));
    const degree = (3 - s) * 2; // 3s -> 0, 2s -> 2, 1s -> 4
    const octave = isUpper ? PACER_CUE_OCTAVE : PACER_CUE_OCTAVE - 12;
    this.run((o, t) => {
      const f = midiToFreq(this.harmonicMidi(degree, octave));
      if (s === 1) celesta(o, t, f, 0.42 * sfxJitter(), 0, 0.45 * SFX_REVERB_SCALE, false, true);
      else marimba(o, t, f, 0.32 * sfxJitter(), 0, 0.45 * SFX_REVERB_SCALE, true, true);
    });
  }

  /** Soft watery splash panned to the cheek the rinse just reached. */
  playMouthwashSwish(pan: number, intensity01: number): void {
    if (!this.throttle('mw-swish', 0.2)) return;
    const p = Math.max(-1, Math.min(1, pan));
    const k = Math.max(0, Math.min(1, intensity01));
    this.run((o, t) => {
      this.noiseSweep(o, t, 800, 2000, 0.16, 0.02 + 0.03 * k, 1.0);
      this.bell(o, t + 0.03, this.harmonicMidi(p > 0 ? 4 : 2, PACER_CUE_OCTAVE + 12), 0.22 + 0.2 * k, p, 0.6);
    });
  }

  playPacerCue(kind: 'surface' | 'quadrant' | 'complete'): void {
    // Every Brush-Along cue sits in the music's own register (roughly 400-700 Hz). They used
    // to be three to five octaves higher, up to 6 kHz, which sounded like a dog whistle.
    if (kind === 'surface') {
      this.run((o, t) => this.wood(o, t, this.harmonicMidi(3, PACER_CUE_OCTAVE), 0.45));
    } else if (kind === 'quadrant') {
      this.run((o, t) => {
        this.wood(o, t, this.harmonicMidi(2, PACER_CUE_OCTAVE), 0.55);
        this.bell(o, t + 0.08, this.harmonicMidi(5, PACER_CUE_OCTAVE), 0.45);
      });
    } else {
      this.playDistrictSealed();
    }
  }

  // ------------------------------------------------------------ new gameplay

  /** Fizzy sizzle + muted wooden marimba double-knock for acid lockout. */
  playAcidWarn(): void {
    if (!this.throttle('acid', 0.7)) return;
    this.run((o, t) => {
      this.noiseSweep(o, t, 1500, 2200, 0.12, 0.025, 1.0);
      const m = this.harmonicMidi(0, 48);
      marimba(o, t, midiToFreq(m), 0.45, -0.1, 0.1, false, true);
      marimba(o, t + 0.09, midiToFreq(m), 0.38, 0.1, 0.1, false, true);
    });
  }

  /** Bubbly aqua harp glissando when a Saliva Spring bursts. */
  playSalivaSpring(): void {
    this.run((o, t) => {
      for (let i = 0; i < 5; i++) this.bell(o, t + i * 0.045, this.harmonicMidi(i, 48), 0.45, (i - 2) * 0.15, 0.7);
      for (let i = 0; i < 3; i++) this.blip(o, t + i * 0.07, 400 + i * 120, 700 + i * 150, 0.05, 0.03);
    });
  }

  /** Playful jelly boing when HYDRA-1 bumps a Mutans slime. */
  playMutansBoing(): void {
    if (!this.throttle('mutans-boing', 0.3)) return;
    this.run((o, t) => this.boing(o, t, 260, 0.13));
  }

  playMutansPop(): void {
    if (!this.throttle('mutans-pop', 0.06)) return;
    this.run((o, t) => this.blip(o, t, 450 + Math.random() * 200, 900, 0.06, 0.1, 'sine', 2500));
  }

  /** Edge-triggered uplifting chime at 100% Fluoride Surge. */
  playSurgeReady(): void {
    this.run((o, t) => {
      [0, 2, 4, 7].forEach((d, i) => this.bell(o, t + i * 0.08, this.harmonicMidi(d, 60), 0.65, (i - 1.5) * 0.15, 0.7));
    });
  }

  /** Bright rising interval for synergy multiplier ranks (0=1.5x … 3=3.0x). */
  playSynergyRankUp(rankIdx: number): void {
    const r = Math.max(0, Math.min(3, rankIdx));
    this.run((o, t) => {
      const base = this.harmonicMidi(1 + r, 60);
      this.bell(o, t, base, 0.6);
      this.bell(o, t + 0.09, base + (r >= 2 ? 12 : 7), 0.65, 0.15);
      if (r >= 3) this.bell(o, t + 0.18, base + 16, 0.6, -0.15);
    });
  }

  /** Joyful chord fanfare on a win; warm reassuring stabilization cadence otherwise. */
  /**
   * Plays notes from a city finale's score (config/cityFinale.ts) right now. The same score drives
   * the native app's synth, so both editions sound alike.
   */
  playFinaleNotes(notes: readonly FinaleNote[]): void {
    if (notes.length === 0) return;
    this.run((o, t) => {
      for (const n of notes) {
        switch (n.voice) {
          case 'kick':
            softKick(o, t, n.vel);
            break;
          case 'whistle':
            this.noiseSweep(o, t, 900, 2200, n.dur, 0.05 * n.vel, 2.2);
            this.blip(o, t, 700, 1900, n.dur, 0.035 * n.vel, 'sine', 3000);
            break;
          case 'boom':
            this.blip(o, t, 150, 38, Math.min(0.9, n.dur), 0.42 * n.vel, 'sine', 400);
            this.noiseSweep(o, t, 1400, 160, n.dur, 0.12 * n.vel, 0.6);
            break;
          case 'sparkle':
            [24, 28, 31, 36, 40].forEach((iv, k) =>
              this.bell(o, t + k * 0.05, n.midi + iv, 0.32 * n.vel, (k - 2) * 0.25 + n.pan * 0.5, 0.6)
            );
            break;
          case 'whoosh':
            this.noiseSweep(o, t, 300, 2200, n.dur, 0.09 * n.vel, 0.7);
            break;
          default:
            playVoice(o, n.voice, t, n.midi, n.dur, n.vel, n.pan, n.voice === 'bass' ? 0 : 0.5 * SFX_REVERB_SCALE);
        }
      }
    });
  }

  playMissionEnd(won: boolean): void {
    this.run((o, t) => {
      const { theme } = this.getHarmony();
      const key = theme.keyRoot + 12;
      if (won) {
        const prog: number[][] = [
          [0, 4, 7, 11],
          [5, 9, 12, 16],
          [7, 11, 14, 17],
          [0, 4, 7, 11, 14],
        ];
        prog.forEach((c, bi) => {
          c.forEach((iv, i) => rhodes(o, t + bi * 0.28, midiToFreq(key + iv), 0.7, 0.6, (i - 2) * 0.12, 0.5));
        });
        [12, 16, 19, 24].forEach((iv, i) => this.bell(o, t + 0.84 + i * 0.07, key + iv, 0.55, (i - 1.5) * 0.2, 0.75));
      } else {
        const prog: number[][] = [
          [5, 9, 12, 16],
          [0, 4, 7, 11, 14],
        ];
        prog.forEach((c, bi) => {
          c.forEach((iv, i) => rhodes(o, t + bi * 0.55, midiToFreq(key + iv - 12), 1.1, 0.45, (i - 2) * 0.1, 0.55));
        });
      }
    });
  }

  // ------------------------------------------------------------ ASMR scrubbing

  /**
   * Single per-step update (60 Hz): pink-noise mint-foam swish with LFO-swept bandpass whose
   * rate/shimmer follow probe speed, soft micro-bubble pops, and in-key crystal chimes only
   * when cells were newly cleaned. No pitched sustained oscillators.
   */
  updateScrub(state: ScrubState): void {
    if (!this.ctx || !this.scrubGain || !this.scrubBp || !this.scrubLfo || !this.scrubShimGain) return;
    const now = this.ctx.currentTime;
    const live =
      state.active &&
      !this.prefs.muted &&
      this.prefs.sfxVolume > 0.001 &&
      !this.paused &&
      !this.hidden;
    if (!live) {
      if (this.scrubWasActive) {
        this.scrubGain.gain.setTargetAtTime(0, now, 0.05);
        this.scrubWasActive = false;
      }
      return;
    }
    this.scrubWasActive = true;
    const speed01 = Math.max(0, Math.min(1, state.probeSpeed / 7));
    const hydroSonic = state.brush === 'hydro-sonic';
    const brushTone = state.brush === 'bass' ? 720 : hydroSonic ? 1550 : 1000;
    this.scrubLfo.frequency.setTargetAtTime((hydroSonic ? 4.2 : 1.6) + speed01 * 5.5, now, 0.08);
    this.scrubBp.frequency.setTargetAtTime(brushTone + speed01 * 800 + state.cleanRatio * 500, now, 0.08);
    this.scrubShimGain.gain.setTargetAtTime(0.06 + speed01 * 0.18, now, 0.08);
    this.scrubGain.gain.setTargetAtTime(0.32 + speed01 * 0.38, now, 0.05);

    if (this.sfxOut) {
      // micro-bubble pops
      const rate = 3 + speed01 * 9;
      if (Math.random() < rate / 60) {
        const o = this.sfxOut;
        const f = 380 + Math.random() * 500;
        this.blip(o, now + 0.005, f, f * 1.4, 0.035, 0.018 + Math.random() * 0.012);
      }
      if (state.newlyCleaned > 0 && this.throttle('scrub-chime', 0.22)) {
        // Six low degrees keep the partials out of the 3-5 kHz band; never the same note twice.
        let deg = Math.floor(Math.random() * 6);
        if (deg === this.lastScrubChimeDeg) deg = Math.floor(Math.random() * 6);
        this.lastScrubChimeDeg = deg;
        this.bell(this.sfxOut, now + 0.01, this.harmonicMidi(deg, 60), 0.26, (Math.random() - 0.5) * 0.6, 0.7);
      }
    }
  }

  stopScrub(): void {
    this.updateScrub({ active: false, probeSpeed: 0, newlyCleaned: 0, cleanRatio: 0 });
    if (this.ctx && this.scrubGain) this.scrubGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    this.scrubWasActive = false;
  }
}
