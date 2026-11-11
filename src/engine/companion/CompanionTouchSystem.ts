/**
 * Direct touch-the-teeth "Smooth Bask" toy interactivity for the Companion Arch (HUB & REPORT).
 *
 * Pure, render-agnostic logic so it can be unit tested: callers feed raycast hits on the 3D crowns
 * and receive feedback (glass-harp note vs squishy thud, sparkle, splats polished). Rendering reads
 * `ripples` and `splats` to drive shader uniforms; sound/particles are fired by the caller.
 */

export interface TouchHit {
  x: number;
  y: number;
  z: number;
}

export interface SugarSplat extends TouchHit {
  /** Remaining sugar-plaque coverage 0..1 (polished down by rub strokes). */
  amount: number;
  /** Splat-in animation 0..1 (pops in over ~0.35 s). */
  grow: number;
}

export interface TouchRipple extends TouchHit {
  /** Scene clock time the ripple started (seconds). */
  t: number;
}

export interface TouchFeedback {
  sound: 'glass' | 'thud' | null;
  /** Rising glass-harp scale step (0 = first note of a stroke). */
  noteStep: number;
  sparkle: boolean;
  onSplat: boolean;
  splatsCleared: number;
}

export const GLASS_HARP_SMOOTHNESS = 50;
export const MAX_SPLATS = 6;
export const MAX_RIPPLES = 4;
const NOTE_SPACING_U = 0.55;
const NOTE_MIN_INTERVAL_SEC = 0.075;
const STROKE_RESET_SEC = 0.9;
const SPLAT_POLISH_RADIUS = 1.35;
const POLISH_PER_UNIT = 0.32;
const POLISH_PER_TAP = 0.14;
const RIPPLE_SPACING_U = 0.9;

export class CompanionTouchSystem {
  readonly splats: SugarSplat[] = [];
  readonly ripples: TouchRipple[] = [];

  private rippleCursor = 0;
  private lastHit: TouchHit | null = null;
  private distSinceNote = 0;
  private distSinceRipple = 0;
  private noteStep = 0;
  private lastNoteSec = -99;
  private totalCleared = 0;

  get activeSplatCount(): number {
    return this.splats.length;
  }

  get splatsClearedTotal(): number {
    return this.totalCleared;
  }

  /** Splats localized sticky sugar-plaque onto up to `count` tooth anchor points. */
  spawnTreatSplats(anchors: readonly TouchHit[], count = 3, seed = Date.now()): SugarSplat[] {
    const added: SugarSplat[] = [];
    if (anchors.length === 0) return added;
    let r = (Math.abs(Math.floor(seed)) % 2147483647) || 1;
    const rand = () => {
      r = (r * 48271) % 2147483647;
      return r / 2147483647;
    };
    const used = new Set<number>();
    for (let i = 0; i < Math.min(count, anchors.length); i++) {
      let idx = Math.floor(rand() * anchors.length);
      for (let tries = 0; tries < anchors.length && used.has(idx); tries++) idx = (idx + 1) % anchors.length;
      used.add(idx);
      const a = anchors[idx];
      const splat: SugarSplat = { x: a.x, y: a.y, z: a.z, amount: 1, grow: 0 };
      if (this.splats.length >= MAX_SPLATS) this.splats.shift();
      this.splats.push(splat);
      added.push(splat);
    }
    return added;
  }

  /** Effective (animated) splat coverage for shader upload. */
  getRenderSplats(): Array<TouchHit & { amount: number }> {
    return this.splats.map((s) => {
      const pop = s.grow < 1 ? Math.sin(s.grow * Math.PI * 0.5) * (1 + 0.25 * Math.sin(s.grow * Math.PI)) : 1;
      return { x: s.x, y: s.y, z: s.z, amount: s.amount * pop };
    });
  }

  /**
   * Registers a pointer touch / rub sample on the crowns.
   * @param phase 'down' for a fresh tap, 'move' for rubbing continuation.
   */
  registerTouch(hit: TouchHit, phase: 'down' | 'move', nowSec: number, smoothness: number): TouchFeedback {
    const feedback: TouchFeedback = { sound: null, noteStep: 0, sparkle: false, onSplat: false, splatsCleared: 0 };

    let travelled = 0;
    if (phase === 'move' && this.lastHit) {
      travelled = Math.hypot(hit.x - this.lastHit.x, hit.y - this.lastHit.y, hit.z - this.lastHit.z);
      // Ignore teleports between distant crowns (pointer slid off and back on)
      if (travelled > 3) travelled = 0;
    }
    this.lastHit = { ...hit };

    if (nowSec - this.lastNoteSec > STROKE_RESET_SEC) this.noteStep = 0;

    // Mini-polish strokes scrub nearby sugar splats
    const polish = phase === 'down' ? POLISH_PER_TAP : travelled * POLISH_PER_UNIT;
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const s = this.splats[i];
      const d = Math.hypot(hit.x - s.x, hit.y - s.y, hit.z - s.z);
      if (d > SPLAT_POLISH_RADIUS) continue;
      feedback.onSplat = true;
      s.amount -= polish * (1 - 0.5 * (d / SPLAT_POLISH_RADIUS));
      if (s.amount <= 0.04) {
        this.splats.splice(i, 1);
        feedback.splatsCleared++;
        this.totalCleared++;
      }
    }

    // Specular ripple + note cadence
    this.distSinceNote += travelled;
    this.distSinceRipple += travelled;
    const wantsNote =
      (phase === 'down' || this.distSinceNote >= NOTE_SPACING_U) &&
      nowSec - this.lastNoteSec >= NOTE_MIN_INTERVAL_SEC;

    if (phase === 'down' || this.distSinceRipple >= RIPPLE_SPACING_U) {
      this.distSinceRipple = 0;
      this.ripples[this.rippleCursor] = { x: hit.x, y: hit.y, z: hit.z, t: nowSec };
      this.rippleCursor = (this.rippleCursor + 1) % MAX_RIPPLES;
    }

    if (wantsNote) {
      this.distSinceNote = 0;
      this.lastNoteSec = nowSec;
      const glassy = smoothness >= GLASS_HARP_SMOOTHNESS && !feedback.onSplat;
      feedback.sound = glassy ? 'glass' : 'thud';
      feedback.noteStep = this.noteStep;
      feedback.sparkle = glassy || feedback.splatsCleared > 0;
      this.noteStep = Math.min(this.noteStep + 1, 15);
    } else if (feedback.splatsCleared > 0) {
      feedback.sparkle = true;
    }

    return feedback;
  }

  endTouch(): void {
    this.lastHit = null;
    this.distSinceNote = 0;
    this.distSinceRipple = 0;
  }

  step(dt: number): void {
    for (const s of this.splats) {
      if (s.grow < 1) s.grow = Math.min(1, s.grow + dt / 0.35);
    }
  }

  clearAll(): void {
    this.splats.length = 0;
    this.endTouch();
  }
}
