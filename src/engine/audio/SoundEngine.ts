import type { AppMode } from '../types';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private muted = false;
  private globalListenersBound = false;
  private currentMode: AppMode = 'COSMIC_INTRO';

  // Continuous Sonic Scrub synth nodes
  private scrubGain: GainNode | null = null;
  private scrubFilter: BiquadFilterNode | null = null;
  private sonicHumOsc: OscillatorNode | null = null;
  private sonicHumGain: GainNode | null = null;
  private crystalBellOsc: OscillatorNode | null = null;
  private crystalBellGain: GainNode | null = null;
  private lastWarnTime = 0;

  // Gentle Ambient Pad nodes
  private ambOscA: OscillatorNode | null = null;
  private ambOscB: OscillatorNode | null = null;
  private ambFilter: BiquadFilterNode | null = null;
  private ambGain: GainNode | null = null;

  /**
   * Binds capture-phase listeners on window so clicking ANY HTML button, tab, or 3D canvas
   * unlocks Web Audio BEFORE the button's own click handler fires!
   */
  bindGlobalUnlockListeners(): void {
    if (this.globalListenersBound || typeof window === 'undefined') return;
    this.globalListenersBound = true;

    const unlock = () => {
      this.unlockOnGesture();
    };

    window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    window.addEventListener('touchstart', unlock, { capture: true, passive: true });
    window.addEventListener('mousedown', unlock, { capture: true, passive: true });
    window.addEventListener('click', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', unlock, { capture: true, passive: true });
  }

  unlockOnGesture(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      try {
        this.ctx = new AudioCtx();
        this.setupMasterChainAndLoops();
      } catch {
        return;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx
        .resume()
        .then(() => {
          this.syncAmbientPad();
        })
        .catch(() => {});
    } else {
      this.syncAmbientPad();
    }
  }

  getAudioState(): string {
    if (this.muted) return 'muted';
    return this.ctx ? this.ctx.state : 'uninitialized';
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(muted ? 0.0001 : 0.78, now, 0.04);
    if (muted && this.scrubGain) {
      this.scrubGain.gain.setTargetAtTime(0, now, 0.03);
      this.sonicHumGain?.gain.setTargetAtTime(0, now, 0.03);
      this.crystalBellGain?.gain.setTargetAtTime(0, now, 0.03);
    } else if (!muted) {
      this.unlockOnGesture();
      this.playUiTap();
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setAmbientMode(mode: AppMode): void {
    this.currentMode = mode;
    this.syncAmbientPad();
  }

  private setupMasterChainAndLoops(): void {
    if (!this.ctx) return;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.18;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0.0001 : 0.78;
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    // 1. Ambient Crystalline / Cosmic Pad (warm subtle atmosphere)
    this.ambOscA = this.ctx.createOscillator();
    this.ambOscB = this.ctx.createOscillator();
    this.ambOscA.type = 'sine';
    this.ambOscB.type = 'triangle';
    this.ambOscA.frequency.value = 196.0;
    this.ambOscB.frequency.value = 293.66;

    this.ambFilter = this.ctx.createBiquadFilter();
    this.ambFilter.type = 'lowpass';
    this.ambFilter.frequency.value = 620;

    this.ambGain = this.ctx.createGain();
    this.ambGain.gain.value = 0.0001;

    this.ambOscA.connect(this.ambFilter);
    this.ambOscB.connect(this.ambFilter);
    this.ambFilter.connect(this.ambGain);
    this.ambGain.connect(this.masterGain);
    this.ambOscA.start();
    this.ambOscB.start();

    // 2. Sonic Bristle Foam Noise + Sonic Hum + Glass-Harp Enamel Resonance
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = Math.floor(sampleRate * 1.5);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    this.scrubFilter = this.ctx.createBiquadFilter();
    this.scrubFilter.type = 'bandpass';
    this.scrubFilter.frequency.value = 1250;
    this.scrubFilter.Q.value = 1.9;

    this.scrubGain = this.ctx.createGain();
    this.scrubGain.gain.value = 0;

    whiteNoise.connect(this.scrubFilter);
    this.scrubFilter.connect(this.scrubGain);
    this.scrubGain.connect(this.masterGain);
    whiteNoise.start();

    // Authentic 260Hz Sonic Toothbrush Motor Hum
    this.sonicHumOsc = this.ctx.createOscillator();
    this.sonicHumOsc.type = 'triangle';
    this.sonicHumOsc.frequency.value = 262;
    this.sonicHumGain = this.ctx.createGain();
    this.sonicHumGain.gain.value = 0;
    this.sonicHumOsc.connect(this.sonicHumGain);
    this.sonicHumGain.connect(this.masterGain);
    this.sonicHumOsc.start();

    // Crystalline glass-harp harmonic shimmer layered as enamel becomes mirror-clean!
    this.crystalBellOsc = this.ctx.createOscillator();
    this.crystalBellOsc.type = 'sine';
    this.crystalBellOsc.frequency.value = 880;
    this.crystalBellGain = this.ctx.createGain();
    this.crystalBellGain.gain.value = 0;
    this.crystalBellOsc.connect(this.crystalBellGain);
    this.crystalBellGain.connect(this.masterGain);
    this.crystalBellOsc.start();

    this.syncAmbientPad();
  }

  private syncAmbientPad(): void {
    if (!this.ctx || !this.ambGain || !this.ambOscA || !this.ambOscB || !this.ambFilter) {
      return;
    }
    const now = this.ctx.currentTime;
    if (this.muted || this.ctx.state !== 'running') {
      this.ambGain.gain.setTargetAtTime(0.0001, now, 0.15);
      return;
    }

    if (this.currentMode === 'COSMIC_INTRO') {
      this.ambOscA.frequency.setTargetAtTime(130.81, now, 0.3); // C3 cosmic drone
      this.ambOscB.frequency.setTargetAtTime(196.0, now, 0.3); // G3 fifth
      this.ambFilter.frequency.setTargetAtTime(540, now, 0.3);
      this.ambGain.gain.setTargetAtTime(0.065, now, 0.4);
    } else if (this.currentMode === 'HUB' || this.currentMode === 'REPORT') {
      this.ambOscA.frequency.setTargetAtTime(261.63, now, 0.3); // Warm C4 Smooth Bask
      this.ambOscB.frequency.setTargetAtTime(329.63, now, 0.3); // E4 major shimmer
      this.ambFilter.frequency.setTargetAtTime(680, now, 0.3);
      this.ambGain.gain.setTargetAtTime(0.042, now, 0.4);
    } else if (this.currentMode === 'BRUSH_ALONG') {
      this.ambOscA.frequency.setTargetAtTime(220.0, now, 0.3);
      this.ambOscB.frequency.setTargetAtTime(329.63, now, 0.3);
      this.ambFilter.frequency.setTargetAtTime(600, now, 0.3);
      this.ambGain.gain.setTargetAtTime(0.045, now, 0.4);
    } else {
      // ARCADE / PULP_RESCUE subtle micro-arch hum
      this.ambOscA.frequency.setTargetAtTime(146.83, now, 0.3);
      this.ambOscB.frequency.setTargetAtTime(220.0, now, 0.3);
      this.ambFilter.frequency.setTargetAtTime(480, now, 0.3);
      this.ambGain.gain.setTargetAtTime(0.035, now, 0.4);
    }
  }

  updateScrubState(active: boolean, cleanRatio: number, acidWarn = false): void {
    if (!this.ctx || !this.scrubGain || !this.scrubFilter || this.muted) return;
    const now = this.ctx.currentTime;

    if (!active) {
      this.scrubGain.gain.setTargetAtTime(0, now, 0.04);
      this.sonicHumGain?.gain.setTargetAtTime(0, now, 0.04);
      this.crystalBellGain?.gain.setTargetAtTime(0, now, 0.04);
      return;
    }

    const clamped = Math.max(0, Math.min(1, cleanRatio));
    this.scrubFilter.frequency.setTargetAtTime(980 + clamped * 1750, now, 0.06);
    this.scrubGain.gain.setTargetAtTime(0.14, now, 0.03);

    if (this.sonicHumOsc && this.sonicHumGain) {
      this.sonicHumOsc.frequency.setTargetAtTime(255 + clamped * 35, now, 0.06);
      this.sonicHumGain.gain.setTargetAtTime(0.055, now, 0.03);
    }

    // Glassy hydroxyapatite resonance rises as tooth approaches 100% Smooth Bask!
    if (this.crystalBellOsc && this.crystalBellGain) {
      this.crystalBellOsc.frequency.setTargetAtTime(784 + clamped * 534, now, 0.08);
      this.crystalBellGain.gain.setTargetAtTime(0.025 + clamped * 0.065, now, 0.05);
    }

    if (acidWarn && now - this.lastWarnTime > 0.35) {
      this.lastWarnTime = now;
      this.playTone(210, 'sawtooth', 0.16, 0.14);
    }
  }

  private playTone(
    freq: number,
    type: OscillatorType,
    durationSec: number,
    peakGain = 0.18,
    delaySec = 0,
    endFreq?: number
  ): void {
    this.unlockOnGesture();
    if (!this.ctx || !this.masterGain || this.muted) return;

    const schedule = () => {
      if (!this.ctx || !this.masterGain || this.muted) return;
      const t0 = this.ctx.currentTime + delaySec;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (endFreq !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + durationSec);
      }

      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + durationSec + 0.03);
    };

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(schedule).catch(() => {});
    } else {
      schedule();
    }
  }

  playUiTap(): void {
    this.playTone(740, 'sine', 0.085, 0.11, 0, 980);
  }

  playMohsSpecimenTone(mohsIndex: number): void {
    // Ascending hardness scale: Gold (2.5) -> Iron (4.0) -> Enamel (5.0) -> Quartz (7.0) -> Diamond (10.0)
    const freqs = [329.63, 440.0, 587.33, 783.99, 1174.66];
    const f = freqs[Math.max(0, Math.min(freqs.length - 1, mohsIndex))];
    this.playTone(f, 'triangle', 0.34, 0.2, 0);
    if (mohsIndex === 2) {
      // Hero Tooth Enamel (Mohs 5.0) gets a sparkling crystalline fifth + octave!
      this.playTone(f * 1.5, 'sine', 0.42, 0.15, 0.05);
      this.playTone(f * 2.0, 'sine', 0.5, 0.12, 0.1);
    }
  }

  playTreatSnack(): void {
    // Playful crunchy pop + fizzy sugar-acid sparkle
    this.playTone(420, 'triangle', 0.12, 0.22, 0, 260);
    this.playTone(540, 'triangle', 0.14, 0.18, 0.09, 310);
    this.playTone(680, 'sine', 0.22, 0.14, 0.18, 340);
  }

  playOrbitalDive(): void {
    // Powers-of-Ten zoom chime & descending atmospheric sweep
    this.playTone(880, 'sine', 0.65, 0.16, 0, 220);
    this.playTone(523.25, 'triangle', 0.45, 0.15, 0.08);
    this.playTone(783.99, 'sine', 0.55, 0.15, 0.18);
    this.playTone(1046.5, 'sine', 0.65, 0.16, 0.32);
  }

  playCosmicBeatChime(beatIdx: number): void {
    const chords = [
      [261.63, 392.0, 523.25], // Supernova C5 fifths
      [293.66, 440.0, 659.25, 880.0], // Mohs 5.0 Crystalline D9
      [329.63, 493.88, 659.25, 987.77], // Fluorapatite Lock E5
      [261.63, 329.63, 392.0, 523.25, 783.99], // Earthrise Cmaj9
    ];
    const notes = chords[beatIdx % chords.length];
    notes.forEach((f, idx) => {
      this.playTone(f, 'triangle', 0.78, 0.15, idx * 0.075);
    });
  }

  playFlossSnap(targetsHit: number, zipped: boolean): void {
    const base = targetsHit > 0 ? 587.33 : 493.88;
    this.playTone(base, 'triangle', 0.2, 0.24, 0);
    this.playTone(base * 1.5, 'sine', 0.25, 0.18, 0.03);
    if (zipped) {
      this.playTone(880, 'sine', 0.26, 0.2, 0.05, 1320);
      this.playTone(1174.66, 'sine', 0.3, 0.18, 0.1);
    }
  }

  playIonRinseWave(): void {
    const notes = [392.0, 493.88, 587.33, 739.99, 987.77, 1174.66];
    notes.forEach((f, idx) => {
      this.playTone(f, 'triangle', 0.75, 0.17, idx * 0.055);
    });
  }

  playDisclosePulse(): void {
    this.playTone(659.25, 'sine', 0.3, 0.18, 0);
    this.playTone(987.77, 'triangle', 0.45, 0.16, 0.09);
  }

  playSiteRestored(): void {
    this.playTone(523.25, 'triangle', 0.28, 0.18, 0);
    this.playTone(659.25, 'sine', 0.32, 0.18, 0.06);
    this.playTone(1046.5, 'sine', 0.45, 0.2, 0.12);
  }

  playDistrictSealed(): void {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this.playTone(f, 'triangle', 0.7, 0.18, i * 0.07);
    });
  }

  playSmoothBaskSparkle(): void {
    [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => {
      this.playTone(f, 'sine', 0.58, 0.16, i * 0.065);
    });
  }

  /**
   * Squeaky-clean glass-harp note: rising major-pentatonic scale with soft bowed attack and
   * inharmonic shimmer partials (rubbing glassy Smooth Bask enamel).
   */
  playGlassHarpNote(step: number): void {
    this.unlockOnGesture();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const scale = [0, 2, 4, 7, 9];
    const octave = Math.floor(step / scale.length);
    const semis = scale[step % scale.length] + octave * 12;
    const f = 783.99 * Math.pow(2, Math.min(semis, 26) / 12);
    const schedule = () => {
      if (!this.ctx || !this.masterGain || this.muted) return;
      const t0 = this.ctx.currentTime;
      const partials: Array<[number, number]> = [
        [1, 0.11],
        [2.01, 0.04],
        [3.03, 0.02],
      ];
      for (const [mult, peak] of partials) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f * mult, t0);
        osc.frequency.linearRampToValueAtTime(f * mult * 1.003, t0 + 0.6);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(peak, t0 + 0.045);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.75);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t0);
        osc.stop(t0 + 0.8);
      }
    };
    if (this.ctx.state === 'suspended') this.ctx.resume().then(schedule).catch(() => {});
    else schedule();
  }

  /** Dull squishy thud when rubbing fuzzy, low-smoothness or sugar-splatted teeth. */
  playSquishThud(): void {
    this.playTone(150, 'sine', 0.16, 0.2, 0, 70);
    this.playTone(240, 'triangle', 0.09, 0.07, 0.01, 120);
  }

  /** Sticky sugar-plaque splat landing on the Companion teeth. */
  playSugarSplat(): void {
    this.playTone(320, 'triangle', 0.1, 0.16, 0, 140);
    this.playTone(210, 'sine', 0.14, 0.14, 0.06, 90);
    this.playTone(520, 'sine', 0.08, 0.06, 0.12, 300);
  }

  /** Bright crystalline shatter for Sucrose Crystal fracture. */
  playCrystalShatter(): void {
    [1567.98, 2093.0, 1318.5, 2637.0].forEach((f, i) => {
      this.playTone(f, 'triangle', 0.18, 0.09, i * 0.025, f * 0.7);
    });
    this.playTone(180, 'sine', 0.12, 0.12, 0, 90);
  }

  /** Fizzy sweet-sip acid drop: the Stephan clock restarts. */
  playAcidSip(): void {
    this.playTone(660, 'sine', 0.12, 0.12, 0, 880);
    this.playTone(440, 'sawtooth', 0.35, 0.06, 0.08, 220);
    this.playTone(330, 'triangle', 0.4, 0.1, 0.12, 196);
  }

  /** Soft warning when tender inflamed gingiva refuses heavy-handed scrubbing. */
  playGumTender(): void {
    this.playTone(392, 'sine', 0.14, 0.1, 0, 330);
    this.playTone(311.13, 'sine', 0.2, 0.08, 0.07, 262);
  }

  playPacerCue(kind: 'surface' | 'quadrant' | 'complete'): void {
    if (kind === 'surface') {
      this.playTone(587.33, 'triangle', 0.24, 0.18, 0);
    } else if (kind === 'quadrant') {
      this.playTone(523.25, 'triangle', 0.28, 0.2, 0);
      this.playTone(783.99, 'sine', 0.38, 0.2, 0.08);
    } else {
      this.playDistrictSealed();
    }
  }
}
