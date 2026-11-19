/**
 * Plays a city's finale (see config/cityFinale.ts) over the frozen game, and the ending once every
 * city is clean. Everything is drawn on one canvas from the shared timeline; the few words on screen
 * are ordinary page text, so the translator picks them up.
 *
 * The native app draws the same show in native-apple/MouthLifeApp/UI/CityFinaleView.swift.
 */
import { cityArtForHost } from '../config/citySkylines';
import {
  skylineMotionPivot,
  skylineMotionState,
  skylinePieceSpanY,
  type CityArt,
  type CityFinalePlan,
  type SkylinePiece,
} from '../config/citySkylineGeometry';
import {
  CAMPAIGN_PIECES,
  ENDING_BURSTS,
  ENDING_BURST_SCALE,
  ENDING_TIMES,
  FINALE_EFFECT_VOICES,
  FINALE_EMBLEM,
  FINALE_TEXT,
  FINALE_TIMES,
  GOLDEN_MOLAR,
  MOUNTAIN,
  MOLAR_FINISH_COLORS,
  PIECE_RADIUS,
  endingCredit,
  endingEmblemOrbit,
  endingFace,
  endingGoldRain,
  endingMolarPlace,
  endingNotes,
  endingPiece,
  finaleBackdropDim,
  finaleBalloons,
  finaleBeads,
  finaleBurstSparks,
  finaleCamera,
  finaleCityTint,
  finaleClimbStatus,
  finaleEmblemRocket,
  finaleEmblemShape,
  finaleEmblemSpark,
  finaleEmblemTargets,
  finaleHost,
  finaleMeteors,
  finaleMolar,
  finaleMountain,
  finaleNotes,
  finalePassTime,
  finalePiece,
  finaleProbe,
  finaleRocket,
  finaleSlotShine,
  finaleTextVisible,
  smooth01,
  type EmblemTarget,
  type FinaleLayer,
  type FinaleNote,
  type MolarFinish,
} from '../config/cityFinale';
import { HOST_CITIES } from '../config/hostsAndHistory';
import { getCartridgeById } from '../worlds/worldRegistry';
import type { OverlayView } from '../engine/types';

/** The five campaign cities, in order. */
export const FINALE_WORLD_IDS = ['world_1', 'world_2', 'world_3', 'world_4', 'world_5'] as const;

export interface CityFinaleOptions {
  /** 'city': one city's finale. 'ending': the ending alone. 'city+ending': the last city, then the ending. */
  kind: 'city' | 'ending' | 'city+ending';
  /** Campaign index (0..4) of the city just cleaned; ignored for 'ending'. */
  worldIndex: number;
  /** Each campaign piece's finish once this clear is counted. */
  finishes: readonly MolarFinish[];
  reducedMotion: boolean;
  /** Notes whose time has come; play them now. */
  onNotes: (notes: readonly FinaleNote[]) => void;
  /** True once the show fully covers the game (the 3D scene can stop drawing), false as it uncovers. */
  onCovered?: (covered: boolean) => void;
  /**
   * A part of the show starts (or, with null, everything stops): play its song from `offsetSec`.
   * 'city' is the cleaned city's song, 'ending' the grand finale's.
   */
  onTrack?: (part: 'city' | 'ending' | null, offsetSec: number) => void;
  /** Whether a recorded song exists for a part; then only the score's sound effects play over it. */
  hasTrack?: (part: 'city' | 'ending') => boolean;
  onDone: () => void;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function rgb(hex: number): Rgb {
  return { r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
}

function css(c: Rgb, level = 1, flash = 0, alpha = 1): string {
  const f = (v: number): number => Math.round(255 * Math.min(1, v * level + (1 - Math.min(1, v * level)) * flash));
  return alpha >= 1 ? `rgb(${f(c.r)},${f(c.g)},${f(c.b)})` : `rgba(${f(c.r)},${f(c.g)},${f(c.b)},${alpha.toFixed(3)})`;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

function trianglesPath(path: Path2D, tris: readonly number[]): void {
  for (let i = 0; i + 5 < tris.length; i += 6) {
    path.moveTo(tris[i], tris[i + 1]);
    path.lineTo(tris[i + 2], tris[i + 3]);
    path.lineTo(tris[i + 4], tris[i + 5]);
    path.closePath();
  }
}

/** One drawing line's worth of shapes, filled in one go (so neighbouring triangles never show seams). */
interface Run {
  path: Path2D;
  layer: FinaleLayer;
  cx: number;
  color: Rgb;
  top: Rgb | null;
  minY: number;
  maxY: number;
  /** 0 = still, else 1 + motion index. */
  group: number;
}

function buildRuns(pieces: readonly SkylinePiece[]): Run[] {
  const runs: Run[] = [];
  let current: Run | null = null;
  let currentOrder = -1;
  let lo = 0;
  let hi = 0;
  for (const piece of pieces) {
    if (!current || piece.order !== currentOrder || piece.group !== current.group) {
      if (current) current.cx = (lo + hi) / 2;
      const span = skylinePieceSpanY(piece);
      current = {
        path: new Path2D(),
        layer: !piece.light ? 'scenery' : piece.topColor !== null ? 'sky' : 'light',
        cx: piece.cx,
        color: rgb(piece.color),
        top: piece.topColor !== null ? rgb(piece.topColor) : null,
        minY: span.minY,
        maxY: span.maxY,
        group: piece.group,
      };
      currentOrder = piece.order;
      lo = Infinity;
      hi = -Infinity;
      runs.push(current);
    }
    trianglesPath(current.path, piece.tris);
    for (let i = 0; i < piece.tris.length; i += 2) {
      lo = Math.min(lo, piece.tris[i]);
      hi = Math.max(hi, piece.tris[i]);
    }
  }
  if (current) current.cx = (lo + hi) / 2;
  return runs;
}

interface CityInfo {
  worldId: string;
  art: CityArt;
  plan: CityFinalePlan;
  runs: Run[];
  emblem: Run[];
  targets: EmblemTarget[];
  cityName: string;
  hostName: string;
  hostRole: string;
  skin: Rgb;
  accent: Rgb;
  people: number;
}

const cityCache = new Map<string, CityInfo>();

function cityInfo(worldId: string): CityInfo | null {
  const cached = cityCache.get(worldId);
  if (cached) return cached;
  const cart = getCartridgeById(worldId);
  const art = cityArtForHost(cart.hostId);
  const host = HOST_CITIES.find((h) => h.worldId === worldId);
  if (!art || !art.finale || !host) return null;
  const info: CityInfo = {
    worldId,
    art,
    plan: art.finale,
    runs: buildRuns(art.skyline),
    emblem: buildRuns(art.emblem),
    targets: finaleEmblemTargets(art.emblem),
    cityName: host.city.replace(/\s*\(.*\)\s*$/, ''),
    hostName: host.hostName,
    hostRole: host.hostRole,
    skin: rgb(parseInt(host.hostSkinToneHex.slice(1), 16)),
    accent: rgb(parseInt(host.hostAccentHex.slice(1), 16)),
    people: host.hostName.includes('&') ? 2 : 1,
  };
  cityCache.set(worldId, info);
  return info;
}

const FINISH_LABEL: Record<MolarFinish, string> = {
  empty: '',
  pearl: 'Pearl piece',
  silver: 'Silver piece',
  gold: 'Gold piece',
};

export class CityFinaleOverlay implements OverlayView {
  private shell: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private startMs = 0;
  private lastT = -1;
  private covered = false;
  private finished = false;
  /** Time of the city part's end, where the ending (if any) begins. */
  private readonly cityLength: number;
  private readonly total: number;
  private readonly city: CityInfo | null;
  private readonly cities: (CityInfo | null)[];
  private readonly notes: FinaleNote[];
  private noteIdx = 0;
  private readonly allGold: boolean;
  /** Every city is clean once this one is: the probe climbs to the top. */
  private readonly atTop: boolean;
  private readonly climbLeft: number;
  private readonly nextCity: number;
  /** Which part's song is playing ('city' until the ending starts). */
  private trackPart: 'city' | 'ending' | null = null;
  private readonly stars: { x: number; y: number; r: number; p: number }[] = [];
  private readonly textEls = new Map<string, HTMLElement>();
  private w = 0;
  private h = 0;
  private dpr = 1;

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' || e.key === ' ') {
      if (this.elapsed() < this.skipAfter()) return;
      e.preventDefault();
      this.skip();
    }
  };

  constructor(private readonly opts: CityFinaleOptions) {
    this.cities = FINALE_WORLD_IDS.map((id) => cityInfo(id));
    const hasCity = opts.kind !== 'ending';
    this.city = hasCity ? this.cities[Math.max(0, Math.min(CAMPAIGN_PIECES - 1, opts.worldIndex))] : null;
    this.cityLength = this.city ? FINALE_TIMES.end : 0;
    const hasEnding = opts.kind !== 'city';
    this.total = this.cityLength + (hasEnding ? ENDING_TIMES.end : 0);
    this.allGold = opts.finishes.length === CAMPAIGN_PIECES && opts.finishes.every((f) => f === 'gold');
    const notes: FinaleNote[] = [];
    // With a recorded song for a part, only the score's sound effects play over it.
    const effectsOnly = (part: 'city' | 'ending') => (note: FinaleNote) =>
      !opts.hasTrack?.(part) || FINALE_EFFECT_VOICES.includes(note.voice);
    if (this.city) {
      notes.push(...finaleNotes(this.city.plan, opts.finishes, opts.worldIndex, opts.reducedMotion).filter(effectsOnly('city')));
    }
    if (hasEnding) {
      const plans = this.cities.map((c) => c?.plan).filter((p): p is CityFinalePlan => Boolean(p));
      for (const n of endingNotes(plans, this.allGold).filter(effectsOnly('ending'))) notes.push({ ...n, t: n.t + this.cityLength });
    }
    const status = finaleClimbStatus(opts.finishes);
    this.atTop = status.left === 0;
    this.climbLeft = status.left;
    this.nextCity = status.next;
    this.notes = notes.sort((a, b) => a.t - b.t);
    for (let i = 0; i < 110; i++) {
      // Fixed pattern, so the sky is the same every time.
      const a = Math.sin(i * 12.9898) * 43758.5453;
      const b = Math.sin(i * 78.233) * 12543.1234;
      this.stars.push({ x: a - Math.floor(a), y: b - Math.floor(b), r: 0.6 + ((i * 7) % 5) * 0.25, p: i * 1.7 });
    }
  }

  mount(root: HTMLElement): void {
    const shell = document.createElement('div');
    shell.className = 'finale-shell ui-interactive';
    shell.tabIndex = -1;
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.setAttribute('aria-label', this.city ? this.city.cityName : 'The Golden Molar');
    const finish = this.city ? this.opts.finishes[this.opts.worldIndex] ?? 'pearl' : 'pearl';
    const pieces = this.opts.finishes.filter((f) => f !== 'empty').length;
    const city = this.city;
    const nextName = !this.atTop && this.nextCity >= 0 ? this.cities[this.nextCity]?.cityName ?? '' : '';
    shell.innerHTML = `
      <canvas class="finale-canvas" aria-hidden="true"></canvas>
      <div class="finale-text finale-top">
        <div class="finale-line finale-city" data-text="city">${city ? escapeHtml(city.cityName) : ''}</div>
        <div class="finale-line finale-sub" data-text="molar">Golden Molar: ${pieces} of 5</div>
        <div class="finale-line finale-badge finale-badge-${finish}" data-text="badge">${finish === 'gold' ? '★ ' : ''}${FINISH_LABEL[finish]}</div>
        <div class="finale-line finale-ending-title" data-text="endingTitle">The Golden Molar</div>
      </div>
      <div class="finale-line finale-bubble" data-text="bubble">Thank you!</div>
      <div class="finale-text finale-credit" data-text="credit">
        <div class="finale-credit-city"></div>
        <div class="finale-credit-host"><span class="finale-credit-name" data-no-translate></span> • <span class="finale-credit-role"></span></div>
      </div>
      <div class="finale-text finale-bottom">
        <div class="finale-line finale-climb" data-text="climb">${this.atTop ? 'You made it to the top!' : this.climbLeft === 1 ? 'One more to the top!' : `${this.climbLeft} more to the top`}</div>
        <div class="finale-line finale-next" data-text="next">${nextName ? `Next stop: ${escapeHtml(nextName)}` : ''}</div>
        <div class="finale-line finale-thanks" data-text="thanks">Thanks for playing!</div>
        <div class="finale-line finale-perfect" data-text="perfect">Perfect smile!</div>
        <div class="finale-line finale-hint" data-text="hint">Get gold in every city for a surprise.</div>
      </div>
      <button type="button" class="btn btn-sm finale-skip" aria-label="Skip">Skip ›</button>
    `;
    root.appendChild(shell);
    this.shell = shell;
    this.canvas = shell.querySelector('canvas');
    this.ctx = this.canvas?.getContext('2d') ?? null;
    shell.querySelectorAll<HTMLElement>('[data-text]').forEach((el) => this.textEls.set(el.dataset.text as string, el));
    shell.querySelector<HTMLButtonElement>('.finale-skip')?.addEventListener('click', () => this.skip());
    window.addEventListener('keydown', this.onKey, true);
    this.startMs = performance.now();
    this.startTrack(this.city ? 'city' : 'ending', 0);
    this.shell.focus?.();
    const frame = (): void => {
      this.raf = requestAnimationFrame(frame);
      this.tick();
    };
    this.raf = requestAnimationFrame(frame);
  }

  dispose(): void {
    if (this.trackPart) this.opts.onTrack?.(null, 0);
    this.trackPart = null;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    if (this.covered) this.opts.onCovered?.(false);
    this.covered = false;
    this.shell?.remove();
    this.shell = null;
  }

  private startTrack(part: 'city' | 'ending', offsetSec: number): void {
    if (this.trackPart === part) return;
    this.trackPart = part;
    this.opts.onTrack?.(part, offsetSec);
  }

  private elapsed(): number {
    return (performance.now() - this.startMs) / 1000;
  }

  private skipAfter(): number {
    const t = this.elapsed();
    return t < this.cityLength ? FINALE_TIMES.skipAfter : this.cityLength + ENDING_TIMES.skipAfter;
  }

  /** Skip jumps over the city's show to the ending, if there is one; otherwise ends. */
  private skip(): void {
    const t = this.elapsed();
    if (this.city && t < this.cityLength - 0.5 && this.total > this.cityLength) {
      this.startMs = performance.now() - this.cityLength * 1000;
      this.startTrack('ending', 0);
      this.lastT = this.cityLength;
      while (this.noteIdx < this.notes.length && this.notes[this.noteIdx].t < this.cityLength) this.noteIdx++;
      return;
    }
    this.finish();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    cancelAnimationFrame(this.raf);
    this.opts.onDone();
  }

  private tick(): void {
    const t = this.elapsed();
    if (t >= this.total) {
      this.finish();
      return;
    }
    // Notes whose moment has come (none are replayed after a skip).
    const due: FinaleNote[] = [];
    // After a stall (a hidden tab) only the last moment's notes play, never a pile-up.
    const recent = Math.max(this.lastT - 0.05, t - 0.25);
    while (this.noteIdx < this.notes.length && this.notes[this.noteIdx].t <= t) {
      if (this.notes[this.noteIdx].t >= recent) due.push(this.notes[this.noteIdx]);
      this.noteIdx++;
    }
    if (due.length) this.opts.onNotes(due);
    if (this.trackPart === 'city' && this.total > this.cityLength && t >= this.cityLength) this.startTrack('ending', t - this.cityLength);
    this.lastT = t;

    const cover = this.coverAlpha(t);
    const isCovered = cover >= 0.999;
    if (isCovered !== this.covered) {
      this.covered = isCovered;
      this.opts.onCovered?.(isCovered);
    }
    const skipBtn = this.shell?.querySelector<HTMLElement>('.finale-skip');
    skipBtn?.classList.toggle('show', t >= this.skipAfter());

    this.resize();
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas!.width, this.canvas!.height);
    ctx.globalAlpha = 1;
    if (this.canvas) this.canvas.style.opacity = cover.toFixed(3);
    if (this.city && t < this.cityLength) this.drawCityFinale(ctx, t);
    else this.drawEnding(ctx, t - this.cityLength);
    this.updateText(t);
  }

  /** How much the show covers the game: fades in at the start, out at the very end. */
  private coverAlpha(t: number): number {
    return smooth01(t / (this.city ? FINALE_TIMES.hushEnd - 0.2 : ENDING_TIMES.fadeEnd));
  }

  private resize(): void {
    const c = this.canvas;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    if (w !== this.w || h !== this.h || dpr !== this.dpr) {
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
  }

  // ---------------------------------------------------------------- spaces

  /** Half the shorter side of the screen, in CSS pixels: one stage unit. */
  private get unit(): number {
    return Math.min(this.w, this.h) / 2;
  }

  private stageX(x: number): number {
    return this.w / 2 + x * this.unit;
  }

  private stageY(y: number): number {
    return this.h / 2 - y * this.unit;
  }

  private cityScale(viewW: number): number {
    return Math.max(this.w / viewW, this.h / 34);
  }

  /** Screen mapping for the panorama: drawing units → CSS pixels. */
  private cityView(cx: number, viewW: number): { s: number; ox: number; oy: number } {
    const s = this.cityScale(viewW);
    const halfVisible = this.w / s / 2;
    const center = halfVisible >= 32 ? 32 : Math.max(halfVisible - 2, Math.min(66 - halfVisible, cx));
    return { s, ox: this.w / 2 - center * s, oy: this.h * 0.84 };
  }

  // ---------------------------------------------------------------- shared painting

  private paintSky(ctx: CanvasRenderingContext2D, t: number, alpha = 1): void {
    const d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#01030c');
    g.addColorStop(0.62, '#08122b');
    g.addColorStop(0.84, '#101d3d');
    g.addColorStop(1, '#030712');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    for (const s of this.stars) {
      const tw = this.opts.reducedMotion ? 0.8 : 0.55 + 0.45 * Math.sin(t * 1.7 + s.p);
      ctx.globalAlpha = alpha * tw * 0.85;
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(s.x * this.w, s.y * this.h * 0.8, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  /** Draws a city's panorama. `tintAt(run)` gives each run's brightness; `motionTime(run)` its motion clock. */
  private paintCity(
    ctx: CanvasRenderingContext2D,
    city: CityInfo,
    view: { s: number; ox: number; oy: number },
    tintAt: (run: Run) => { level: number; flash: number },
    motionTime: (run: Run) => number | null
  ): void {
    const d = this.dpr;
    // the ground below the skyline
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const ground = ctx.createLinearGradient(0, view.oy, 0, this.h);
    ground.addColorStop(0, '#0b1324');
    ground.addColorStop(1, '#020617');
    ctx.fillStyle = ground;
    ctx.fillRect(0, view.oy, this.w, this.h - view.oy);

    const motions = city.art.motions;
    for (const run of city.runs) {
      const tint = tintAt(run);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.translate(view.ox, view.oy);
      let glow = 1;
      if (run.group > 0) {
        const motion = motions[run.group - 1];
        const state = skylineMotionState(motion, motionTime(run));
        const pivot = skylineMotionPivot(motion);
        glow = state.glow;
        const px = pivot?.x ?? 0;
        const py = pivot?.y ?? 0;
        ctx.translate((px + state.dx) * view.s, -py * view.s);
        ctx.rotate(-state.angleRad);
        ctx.scale(view.s, -view.s);
        ctx.translate(-px, -py);
      } else {
        ctx.scale(view.s, -view.s);
      }
      const level = run.layer === 'scenery' ? tint.level : tint.level * glow;
      if (run.top) {
        // A black top melts into the night sky behind instead of ending in a hard edge.
        const blackTop = run.top.r + run.top.g + run.top.b < 0.02;
        const g = ctx.createLinearGradient(0, run.minY, 0, run.maxY);
        g.addColorStop(0, css(run.color, level, tint.flash));
        g.addColorStop(1, blackTop ? 'rgba(0,0,0,0)' : css(run.top, level, tint.flash));
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = css(run.color, level, run.layer === 'light' ? tint.flash : 0);
      }
      ctx.fill(run.path);
    }
  }

  /** The city's sign, centred on (sx, sy) in CSS pixels, `radius` pixels for one emblem unit. */
  private paintEmblem(ctx: CanvasRenderingContext2D, city: CityInfo, sx: number, sy: number, radius: number, widthScale = 1, alpha = 1): void {
    const d = this.dpr;
    ctx.globalAlpha = alpha;
    for (const run of city.emblem) {
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.translate(sx, sy);
      ctx.scale(radius * widthScale, -radius);
      ctx.fillStyle = css(run.color);
      ctx.fill(run.path);
    }
    ctx.globalAlpha = 1;
  }

  /** A round piece of the molar in its finish, with the city's sign on it. */
  private paintPiece(
    ctx: CanvasRenderingContext2D,
    city: CityInfo | null,
    finish: MolarFinish,
    sx: number,
    sy: number,
    radius: number,
    spin = 0,
    alpha = 1,
    shine = 0
  ): void {
    const d = this.dpr;
    const width = Math.cos(spin);
    const front = width >= 0;
    const wx = Math.max(0.04, Math.abs(width));
    const [light, dark] = MOLAR_FINISH_COLORS[finish];
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(wx, 1);
    const g = ctx.createRadialGradient(-radius * 0.35, -radius * 0.4, radius * 0.1, 0, 0, radius);
    g.addColorStop(0, css(rgb(light)));
    g.addColorStop(1, css(rgb(dark)));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius * 0.08);
    ctx.strokeStyle = finish === 'gold' ? '#fbbf24' : finish === 'silver' ? '#cbd5e1' : '#e7e5e4';
    ctx.stroke();
    if (shine > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${(0.75 * shine).toFixed(3)})`;
      ctx.fill();
    }
    ctx.restore();
    if (front && city) this.paintEmblem(ctx, city, sx, sy, radius * 0.62, wx, alpha);
    ctx.globalAlpha = 1;
  }

  private paintGlow(ctx: CanvasRenderingContext2D, sx: number, sy: number, radius: number, color: string, alpha: number): void {
    if (alpha <= 0.01) return;
    const d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }

  /** The golden molar at a stage position; `placed` says which cusps are filled right now. */
  private paintMolar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    scale: number,
    alpha: number,
    placed: (i: number) => MolarFinish,
    shineIndex = -1,
    shine = 0,
    bodyFinish: MolarFinish = 'empty'
  ): void {
    if (alpha <= 0.01) return;
    const d = this.dpr;
    const u = this.unit;
    const px = (x: number): number => this.stageX(cx + x * scale);
    const py = (y: number): number => this.stageY(cy + y * scale);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalAlpha = alpha;
    // crown: a rounded block with a lobe under each cusp, outlined in gold
    const k = scale * u;
    const crownPath = (grow: number): void => {
      const c = GOLDEN_MOLAR.core;
      ctx.beginPath();
      ctx.roundRect(px(c.x) - grow * k, py(c.y + c.h) - grow * k, (c.w + grow * 2) * k, (c.h + grow * 2) * k, (c.r + grow) * k);
      for (const cusp of GOLDEN_MOLAR.cusps) {
        ctx.moveTo(px(cusp.x) + (GOLDEN_MOLAR.lobeRadius + grow) * k, py(cusp.y));
        ctx.arc(px(cusp.x), py(cusp.y), (GOLDEN_MOLAR.lobeRadius + grow) * k, 0, Math.PI * 2);
      }
    };
    crownPath(0.05);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    crownPath(0);
    const bx = px(GOLDEN_MOLAR.bodyCenter.x);
    const by = py(GOLDEN_MOLAR.bodyCenter.y);
    if (bodyFinish === 'empty') {
      ctx.fillStyle = '#0f172a';
    } else {
      const [light, dark] = MOLAR_FINISH_COLORS[bodyFinish];
      const g = ctx.createRadialGradient(bx - k * 0.35, by - k * 0.35, k * 0.1, bx, by, k * 1.2);
      g.addColorStop(0, css(rgb(light)));
      g.addColorStop(1, css(rgb(dark)));
      ctx.fillStyle = g;
    }
    ctx.fill();
    // groove
    ctx.beginPath();
    GOLDEN_MOLAR.groove.forEach((p, i) => (i === 0 ? ctx.moveTo(px(p.x), py(p.y)) : ctx.lineTo(px(p.x), py(p.y))));
    ctx.lineWidth = Math.max(1, u * scale * 0.025);
    ctx.strokeStyle = 'rgba(148,163,184,0.55)';
    ctx.stroke();
    // cusps
    const r = GOLDEN_MOLAR.cuspRadius * scale * u;
    GOLDEN_MOLAR.cusps.forEach((c, i) => {
      const finish = placed(i);
      const sx = px(c.x);
      const sy = py(c.y);
      if (finish === 'empty') {
        ctx.setTransform(d, 0, 0, d, 0, 0);
        ctx.globalAlpha = alpha * 0.7;
        ctx.setLineDash([Math.max(2, r * 0.18), Math.max(2, r * 0.14)]);
        ctx.beginPath();
        ctx.arc(sx, sy, r * 0.92, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(1, r * 0.07);
        ctx.strokeStyle = 'rgba(226,232,240,0.6)';
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = alpha;
      } else {
        this.paintPiece(ctx, this.cities[i], finish, sx, sy, r, 0, alpha, i === shineIndex ? shine : 0);
      }
    });
    ctx.globalAlpha = 1;
  }

  private paintProbe(ctx: CanvasRenderingContext2D, sx: number, sy: number, radius: number, alpha: number, t: number): void {
    if (alpha <= 0.01) return;
    this.paintGlow(ctx, sx, sy, radius * 3.2, 'rgba(94,234,212,0.55)', alpha);
    const d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalAlpha = alpha;
    // bristle tuft
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = Math.max(1, radius * 0.16);
    ctx.lineCap = 'round';
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(sx + k * radius * 0.3, sy + radius * 0.7);
      ctx.lineTo(sx + k * radius * 0.42, sy + radius * 1.25 + Math.sin(t * 20 + k) * radius * 0.06);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(sx - radius * 0.3, sy - radius * 0.35, radius * 0.1, sx, sy, radius);
    g.addColorStop(0, '#ccfbf1');
    g.addColorStop(0.45, '#2dd4bf');
    g.addColorStop(1, '#0f766e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius * 0.14);
    ctx.strokeStyle = '#a7f3d0';
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(sx + radius * 0.28, sy - radius * 0.12, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** One spark: a faint halo, a short streak and a bright core. Drawn with additive light, so they glow. */
  private paintSpark(ctx: CanvasRenderingContext2D, x: number, y: number, px: number, py: number, color: string, size: number, alpha: number): void {
    if (alpha <= 0.01) return;
    ctx.globalAlpha = alpha * 0.22;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A host (or two) popping up at the bottom edge to wave. */
  private paintHost(ctx: CanvasRenderingContext2D, city: CityInfo, side: 'left' | 'right', rise: number, wave: number): { x: number; y: number } | null {
    if (rise <= 0.01) return null;
    const d = this.dpr;
    const u = this.unit;
    const halfW = this.w / 2 / u;
    const halfH = this.h / 2 / u;
    const baseX = side === 'left' ? -halfW + 0.42 : halfW - 0.42;
    const baseY = -halfH - (1 - rise) * 0.8;
    let head: { x: number; y: number } | null = null;
    for (let p = 0; p < city.people; p++) {
      const x = baseX + (side === 'left' ? 1 : -1) * p * 0.34;
      const scale = p === 0 ? 1 : 0.9;
      const sx = this.stageX(x);
      const footY = this.stageY(baseY);
      const s = u * scale;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      // body
      ctx.fillStyle = css(city.accent);
      ctx.beginPath();
      ctx.roundRect(sx - 0.16 * s, footY - 0.42 * s, 0.32 * s, 0.46 * s, 0.08 * s);
      ctx.fill();
      // the arm down
      ctx.strokeStyle = css(city.skin);
      ctx.lineCap = 'round';
      ctx.lineWidth = 0.07 * s;
      const shoulderY = footY - 0.36 * s;
      const away = side === 'left' ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(sx + away * 0.15 * s, shoulderY);
      ctx.lineTo(sx + away * 0.2 * s, shoulderY + 0.24 * s);
      ctx.stroke();
      // the waving arm (towards the middle of the screen)
      const toward = -away;
      const a = -1.15 + (p === 0 ? wave : -wave * 0.8);
      const hx = sx + toward * 0.15 * s + toward * Math.cos(a) * 0.28 * s;
      const hy = shoulderY + Math.sin(a) * 0.28 * s;
      ctx.beginPath();
      ctx.moveTo(sx + toward * 0.15 * s, shoulderY);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.fillStyle = css(city.skin);
      ctx.beginPath();
      ctx.arc(hx, hy, 0.05 * s, 0, Math.PI * 2);
      ctx.fill();
      // head, hair, face
      const headY = footY - 0.56 * s;
      ctx.beginPath();
      ctx.arc(sx, headY, 0.13 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.arc(sx, headY - 0.02 * s, 0.135 * s, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(sx - 0.045 * s, headY + 0.02 * s, 0.016 * s, 0, Math.PI * 2);
      ctx.arc(sx + 0.045 * s, headY + 0.02 * s, 0.016 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 0.018 * s;
      ctx.beginPath();
      ctx.arc(sx, headY + 0.045 * s, 0.05 * s, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      if (p === 0) head = { x: sx, y: headY - 0.2 * s };
    }
    return head;
  }

  // ---------------------------------------------------------------- the city finale

  private drawCityFinale(ctx: CanvasRenderingContext2D, t: number): void {
    const city = this.city!;
    const rm = this.opts.reducedMotion;
    const plan = city.plan;
    const T = FINALE_TIMES;
    this.paintSky(ctx, t);
    const cam = finaleCamera(t, rm);
    const view = this.cityView(cam.cx, cam.viewW);
    const showT = t - T.blazeEnd;
    this.paintCity(
      ctx,
      city,
      view,
      (run) => finaleCityTint(t, run.cx, run.layer, plan.show, rm),
      (run) => {
        if (rm) return null;
        const pass = finalePassTime(run.cx, false);
        return t > pass ? t - pass : null;
      }
    );

    const d = this.dpr;
    const toX = (x: number): number => view.ox + x * view.s;
    const toY = (y: number): number => view.oy - y * view.s;
    const dim = finaleBackdropDim(t);

    // the show (city space)
    this.paintShow(ctx, city, view, showT, rm ? 0 : dim, rm);

    // the mountain the cities climb
    this.paintMountain(ctx, t);

    // the probe, with a short trail (in front of the molar once it lifts off from the summit)
    const drawProbe = (): void => {
      const probe = finaleProbe(t, rm, this.opts.worldIndex, this.atTop);
      if (probe.space !== 'hidden') {
        const toScreen = (p: { space: string; x: number; y: number }): { x: number; y: number } =>
          p.space === 'city' ? { x: toX(p.x), y: toY(p.y) } : { x: this.stageX(p.x), y: this.stageY(p.y) };
        const radius = probe.space === 'city' ? 0.42 * view.s : 0.075 * this.unit;
        if (!rm) {
          ctx.setTransform(d, 0, 0, d, 0, 0);
          for (let k = 8; k >= 1; k--) {
            const past = finaleProbe(t - k * 0.035, rm, this.opts.worldIndex, this.atTop);
            if (past.space !== probe.space) continue;
            const p = toScreen(past);
            ctx.globalAlpha = 0.5 * (1 - k / 9);
            ctx.fillStyle = '#5eead4';
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius * (0.6 - k * 0.04), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        const p = toScreen(probe);
        this.paintProbe(ctx, p.x, p.y, radius, probe.alpha, t);
      }
    };
    if (t < T.climbEnd) drawProbe();

    // the host
    const host = finaleHost(t, rm);
    const head = this.paintHost(ctx, city, plan.hostSide, host.rise, host.wave);
    const bubble = this.textEls.get('bubble');
    if (bubble && head) {
      bubble.style.left = `${head.x}px`;
      bubble.style.top = `${head.y}px`;
      bubble.classList.toggle('finale-bubble-right', plan.hostSide === 'right');
    }

    // the emblem rocket and its sparks
    const rocket = finaleEmblemRocket(t);
    if (rocket && !rm) this.paintGlow(ctx, this.stageX(rocket.x), this.stageY(rocket.y), 0.06 * this.unit, 'rgba(254,243,199,0.95)', 1);
    if (t >= T.emblemBurst && t < T.gatherEnd) {
      const shape = finaleEmblemShape(t);
      if (shape.alpha > 0.01) {
        const sx = this.stageX(rm ? FINALE_EMBLEM.x : shape.x);
        const sy = this.stageY(rm ? FINALE_EMBLEM.y : shape.y);
        const r = (rm ? FINALE_EMBLEM.scale : shape.scale) * this.unit;
        this.paintGlow(ctx, sx, sy, r * 1.7, 'rgba(255,251,235,0.4)', shape.alpha);
        this.paintEmblem(ctx, city, sx, sy, r, 1, shape.alpha);
      }
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.lineCap = 'round';
      if (!rm) {
        ctx.globalCompositeOperation = 'lighter';
        city.targets.forEach((target, i) => {
          const s = finaleEmblemSpark(target, i, t);
          if (!s) return;
          const x = this.stageX(s.x);
          const y = this.stageY(s.y);
          this.paintSpark(ctx, x, y, x, y, css(rgb(target.color)), Math.max(1.6, 0.0085 * this.unit), s.alpha);
        });
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    }

    // the molar
    const molar = finaleMolar(t, rm);
    const finish = this.opts.finishes[this.opts.worldIndex] ?? 'pearl';
    if (molar.alpha > 0) {
      this.paintGlow(ctx, this.stageX(molar.x), this.stageY(molar.y), 1.1 * molar.scale * this.unit, 'rgba(253,230,138,0.22)', molar.alpha);
      this.paintMolar(
        ctx,
        molar.x,
        molar.y,
        GOLDEN_MOLAR.scale * molar.scale,
        molar.alpha,
        (i) => (i === this.opts.worldIndex ? (t >= T.slot ? finish : 'empty') : this.opts.finishes[i] ?? 'empty'),
        this.opts.worldIndex,
        finaleSlotShine(t)
      );
    }

    // the piece (stage space)
    const piece = finalePiece(t, this.opts.worldIndex, rm);
    if (piece.visible) {
      const sx = this.stageX(piece.x);
      const sy = this.stageY(piece.y);
      const r = PIECE_RADIUS * piece.scale * this.unit;
      const held = t >= T.meet && t < T.prizeEnd;
      if (held && !rm) this.paintRays(ctx, sx, sy, r * 3.2, t);
      this.paintGlow(ctx, sx, sy, r * 2.6 * piece.glow, finish === 'gold' ? 'rgba(253,224,71,0.7)' : 'rgba(226,232,240,0.6)', piece.alpha);
      this.paintPiece(ctx, city, finish, sx, sy, r, piece.spin, piece.alpha);
    }

    if (t >= T.climbEnd) drawProbe();

    // the flash as the probe takes the piece, and a fade to light at the end
    const flash = t >= T.meet && !rm ? Math.exp(-(t - T.meet) / 0.12) * 0.7 : 0;
    const toLight = this.total > this.cityLength ? 0 : smooth01((t - (T.end - 0.8)) / 0.8);
    const toDark = this.total > this.cityLength ? smooth01((t - (T.end - 0.8)) / 0.8) : 0;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    if (flash > 0.01) {
      ctx.globalAlpha = flash;
      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (toLight > 0.01) {
      ctx.globalAlpha = toLight;
      ctx.fillStyle = '#e6fffa';
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (toDark > 0.01) {
      ctx.globalAlpha = toDark;
      ctx.fillStyle = '#01030c';
      ctx.fillRect(0, 0, this.w, this.h);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The mountain the campaign climbs: a ledge per city with its coin once cleaned, a path that
   * turns gold as far as the player has climbed, and the Golden Molar waiting on the peak.
   */
  private paintMountain(ctx: CanvasRenderingContext2D, t: number): void {
    const rm = this.opts.reducedMotion;
    const m = finaleMountain(t, rm);
    if (m.alpha <= 0.01) return;
    const d = this.dpr;
    const T = FINALE_TIMES;
    const X = (x: number): number => this.stageX(x);
    const Y = (y: number): number => this.stageY(y + m.dy);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalAlpha = m.alpha;
    // the goal glows on the peak; at the top it blazes
    const blaze = this.atTop && t >= T.summitHop ? Math.min(1, 0.6 + Math.exp(-(t - T.summitHop) / 0.5)) : 0.35 + (rm ? 0 : 0.1 * Math.sin(t * 3));
    this.paintGlow(ctx, X(MOUNTAIN.summit.x), Y(MOUNTAIN.summit.y), (this.atTop && t >= T.summitHop ? 0.9 : 0.5) * this.unit, 'rgba(253,230,138,0.55)', m.alpha * blaze);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalAlpha = m.alpha;
    ctx.beginPath();
    MOUNTAIN.outline.forEach((p, i) => (i === 0 ? ctx.moveTo(X(p.x), Y(p.y)) : ctx.lineTo(X(p.x), Y(p.y))));
    ctx.closePath();
    const body = ctx.createLinearGradient(0, Y(0.5), 0, Y(-1.1));
    body.addColorStop(0, '#5b6b8c');
    body.addColorStop(0.45, '#26324d');
    body.addColorStop(1, '#0b1222');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, this.unit * 0.008);
    ctx.strokeStyle = 'rgba(203,213,225,0.45)';
    ctx.stroke();
    ctx.beginPath();
    MOUNTAIN.snow.forEach((p, i) => (i === 0 ? ctx.moveTo(X(p.x), Y(p.y)) : ctx.lineTo(X(p.x), Y(p.y))));
    ctx.closePath();
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();

    // the path: gold as far as the player has climbed
    const here = this.opts.worldIndex;
    const earned = (i: number): boolean =>
      i === here ? t >= T.climbHop : (this.opts.finishes[i] ?? 'empty') !== 'empty';
    const stops = [MOUNTAIN.foot, ...MOUNTAIN.ledges, MOUNTAIN.summitStand];
    ctx.lineCap = 'round';
    for (let k = 0; k + 1 < stops.length; k++) {
      const done = k < CAMPAIGN_PIECES ? earned(k) : this.atTop && t >= T.summitHop;
      ctx.setLineDash(done ? [] : [Math.max(2, this.unit * 0.012), Math.max(3, this.unit * 0.02)]);
      ctx.lineWidth = Math.max(2, this.unit * (done ? 0.014 : 0.009));
      ctx.strokeStyle = done ? '#fbbf24' : 'rgba(226,232,240,0.45)';
      ctx.beginPath();
      ctx.moveTo(X(stops[k].x), Y(stops[k].y));
      ctx.lineTo(X(stops[k + 1].x), Y(stops[k + 1].y));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // the ledges, each with its city's coin beside it once that city is clean
    const coinR = 0.072 * this.unit;
    MOUNTAIN.ledges.forEach((p, i) => {
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalAlpha = m.alpha;
      ctx.fillStyle = earned(i) ? '#fde68a' : '#475569';
      ctx.beginPath();
      ctx.ellipse(X(p.x), Y(p.y) + this.unit * 0.075, this.unit * 0.1, this.unit * 0.025, 0, 0, Math.PI * 2);
      ctx.fill();
      const side = p.x < 0 ? -1 : 1;
      const cx = X(p.x + side * 0.17);
      const cy = Y(p.y + 0.02);
      if (earned(i)) {
        const pop = i === here ? (rm ? 1 : backOutPop((t - T.climbHop) / 0.35)) : 1;
        this.paintPiece(ctx, this.cities[i], this.opts.finishes[i] ?? 'pearl', cx, cy, coinR * pop, 0, m.alpha);
      } else {
        ctx.setLineDash([Math.max(2, coinR * 0.25), Math.max(2, coinR * 0.2)]);
        ctx.lineWidth = Math.max(1, coinR * 0.12);
        ctx.strokeStyle = 'rgba(226,232,240,0.5)';
        ctx.beginPath();
        ctx.arc(cx, cy, coinR * 0.9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    ctx.globalAlpha = 1;
  }

  /** A city's celebration over its skyline: fireworks and its own special (beads, balloons, shooting stars). */
  private paintShow(ctx: CanvasRenderingContext2D, city: CityInfo, view: { s: number; ox: number; oy: number }, showT: number, dim: number, rm: boolean): void {
    const d = this.dpr;
    const plan = city.plan;
    const toX = (x: number): number => view.ox + x * view.s;
    const toY = (y: number): number => view.oy - y * view.s;
  if (showT >= 0) {
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.lineCap = 'round';
      if (plan.show === 'beads') {
        for (const bead of finaleBeads(showT)) {
          ctx.globalAlpha = dim;
          ctx.fillStyle = css(rgb(bead.color));
          ctx.beginPath();
          ctx.arc(toX(bead.x), toY(bead.y), Math.max(2, 0.17 * view.s), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath();
          ctx.arc(toX(bead.x) - 0.05 * view.s, toY(bead.y) - 0.05 * view.s, Math.max(1, 0.05 * view.s), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (plan.show === 'balloons') {
        for (const b of finaleBalloons(showT)) {
          const bx = toX(b.x);
          const by = toY(b.y);
          const r = 0.75 * view.s;
          ctx.globalAlpha = dim;
          ctx.fillStyle = css(rgb(b.color));
          ctx.beginPath();
          ctx.arc(bx, by, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = css(rgb(b.color2));
          ctx.beginPath();
          ctx.ellipse(bx, by, r * 0.36, r, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = Math.max(1, 0.04 * view.s);
          ctx.beginPath();
          ctx.moveTo(bx - r * 0.45, by + r * 0.85);
          ctx.lineTo(bx - r * 0.25, by + r * 1.45);
          ctx.moveTo(bx + r * 0.45, by + r * 0.85);
          ctx.lineTo(bx + r * 0.25, by + r * 1.45);
          ctx.stroke();
          ctx.fillStyle = '#8b5e34';
          ctx.fillRect(bx - r * 0.3, by + r * 1.45, r * 0.6, r * 0.38);
        }
      }
      if (plan.show === 'meteors') {
        for (const m of finaleMeteors(showT)) {
          const g = ctx.createLinearGradient(toX(m.tailX), toY(m.tailY), toX(m.x), toY(m.y));
          g.addColorStop(0, 'rgba(255,255,255,0)');
          g.addColorStop(1, `rgba(255,255,255,${m.alpha.toFixed(3)})`);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = g;
          ctx.lineWidth = Math.max(1.5, 0.08 * view.s);
          ctx.beginPath();
          ctx.moveTo(toX(m.tailX), toY(m.tailY));
          ctx.lineTo(toX(m.x), toY(m.y));
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      plan.bursts.forEach((burst, b) => {
        const rocket = finaleRocket(burst, showT, plan.show);
        if (rocket && !rm) {
          this.paintGlow(ctx, toX(rocket.x), toY(rocket.y), 0.6 * view.s, 'rgba(254,243,199,0.9)', 1);
          ctx.setTransform(d, 0, 0, d, 0, 0);
          ctx.lineCap = 'round';
        }
        if (rm) return;
        const c1 = rgb(burst.color);
        const c2 = rgb(burst.color2);
        for (const s of finaleBurstSparks(burst, b, showT, plan.show)) {
          this.paintSpark(ctx, toX(s.x), toY(s.y), toX(s.px), toY(s.py), css(mixRgb(c1, c2, s.mix)), Math.max(1.6, 0.075 * view.s), s.alpha * dim);
        }
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  private paintRays(ctx: CanvasRenderingContext2D, sx: number, sy: number, radius: number, t: number): void {
    const d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(t * 0.6);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#fde68a';
    for (let k = 0; k < 12; k++) {
      ctx.rotate((Math.PI * 2) / 12);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(radius, -radius * 0.09);
      ctx.lineTo(radius, radius * 0.09);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- the ending

  private drawEnding(ctx: CanvasRenderingContext2D, t: number): void {
    const E = ENDING_TIMES;
    const rm = this.opts.reducedMotion;
    const d = this.dpr;
    this.paintSky(ctx, t);
    const credit = endingCredit(t);
    if (credit.index >= 0) {
      const city = this.cities[credit.index];
      if (city) {
        const within = t - E.creditsStart - credit.index * E.creditSeconds;
        const view = this.cityView(rm ? 32 : 29 + within * 1.5, 64);
        this.paintCity(ctx, city, view, () => ({ level: credit.alpha, flash: 0 }), () => (rm ? null : t));
        // each city's own celebration plays again under its credit
        this.paintShow(ctx, city, view, within - 0.6, rm ? 0 : credit.alpha, rm);
        const host = this.paintHost(ctx, city, city.plan.hostSide, credit.alpha, rm ? 0 : 0.5 * Math.sin(Math.PI * 2 * 1.4 * t));
        void host;
      }
    }

    const place = endingMolarPlace(t);
    const snapped = t >= E.snap;
    const bodyFinish: MolarFinish = snapped ? (this.allGold ? 'gold' : 'pearl') : 'empty';
    if (place.alpha > 0) {
      this.paintGlow(ctx, this.stageX(place.x), this.stageY(place.y), place.scale * 2.2 * this.unit, 'rgba(253,230,138,0.25)', place.alpha * (snapped ? 1 : 0.5));
      this.paintMolar(
        ctx,
        place.x,
        place.y,
        place.scale,
        place.alpha,
        (i) => (endingPiece(i, t, rm).arrived ? this.opts.finishes[i] ?? 'pearl' : 'empty'),
        -1,
        0,
        bodyFinish
      );
    }
    // pieces in flight
    for (let i = 0; i < CAMPAIGN_PIECES; i++) {
      const p = endingPiece(i, t, rm);
      if (p.arrived || p.alpha <= 0) continue;
      const r = GOLDEN_MOLAR.cuspRadius * place.scale * p.scale * this.unit;
      this.paintGlow(ctx, this.stageX(p.x), this.stageY(p.y), r * 2.4, 'rgba(253,230,138,0.6)', p.alpha);
      this.paintPiece(ctx, this.cities[i], this.opts.finishes[i] ?? 'pearl', this.stageX(p.x), this.stageY(p.y), r, p.spin, p.alpha);
    }

    // the last scene: signs circling, fireworks, and the surprise
    if (t >= E.finaleStart) {
      const showT = t - E.finaleStart;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.lineCap = 'round';
      if (!rm) {
        ctx.globalCompositeOperation = 'lighter';
        ENDING_BURSTS.forEach((burst, b) => {
          const c1 = rgb(burst.color);
          const c2 = rgb(burst.color2);
          for (const s of finaleBurstSparks(burst, b, showT, 'fireworks', ENDING_BURST_SCALE)) {
            this.paintSpark(ctx, this.stageX(s.x), this.stageY(s.y), this.stageX(s.px), this.stageY(s.py), css(mixRgb(c1, c2, s.mix)), Math.max(1.5, 0.011 * this.unit), s.alpha);
          }
        });
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      for (let i = 0; i < CAMPAIGN_PIECES; i++) {
        const o = endingEmblemOrbit(i, t, rm);
        const city = this.cities[i];
        if (!city || o.alpha <= 0) continue;
        this.paintGlow(ctx, this.stageX(o.x), this.stageY(o.y), 0.2 * this.unit, 'rgba(253,230,138,0.45)', o.alpha);
        this.paintEmblem(ctx, city, this.stageX(o.x), this.stageY(o.y), 0.11 * this.unit, 1, o.alpha);
      }
      if (this.allGold) {
        const face = endingFace(t);
        if (face.alpha > 0) this.paintFace(ctx, place.x, place.y, place.scale, face.alpha, face.wink);
        if (!rm) {
          ctx.setTransform(d, 0, 0, d, 0, 0);
          for (const drop of endingGoldRain(t, this.w / 2 / this.unit)) {
            ctx.globalAlpha = drop.alpha;
            ctx.fillStyle = '#fde047';
            ctx.fillRect(this.stageX(drop.x), this.stageY(drop.y), 3, 3);
          }
          ctx.globalAlpha = 1;
        }
      }
    }

    const snapFlash = t >= E.snap && !rm ? Math.exp(-(t - E.snap) / 0.15) * 0.75 : 0;
    const fadeOut = smooth01((t - (E.end - 0.6)) / 0.6);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    if (snapFlash > 0.01) {
      ctx.globalAlpha = snapFlash;
      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (fadeOut > 0.01) {
      ctx.globalAlpha = fadeOut;
      ctx.fillStyle = '#01030c';
      ctx.fillRect(0, 0, this.w, this.h);
    }
    ctx.globalAlpha = 1;
  }

  private paintFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, alpha: number, wink: boolean): void {
    const d = this.dpr;
    const u = this.unit * scale;
    const x = this.stageX(cx + GOLDEN_MOLAR.bodyCenter.x * scale);
    const y = this.stageY(cy + GOLDEN_MOLAR.bodyCenter.y * scale);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#422006';
    ctx.strokeStyle = '#422006';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, u * 0.06);
    const eye = (ex: number, closed: boolean): void => {
      if (closed) {
        ctx.beginPath();
        ctx.arc(ex, y - u * 0.04, u * 0.11, 1.15 * Math.PI, 1.85 * Math.PI);
        ctx.stroke();
        return;
      }
      ctx.fillStyle = '#fffbeb';
      ctx.beginPath();
      ctx.ellipse(ex, y - u * 0.08, u * 0.12, u * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#422006';
      ctx.beginPath();
      ctx.arc(ex + u * 0.02, y - u * 0.06, u * 0.065, 0, Math.PI * 2);
      ctx.fill();
    };
    ctx.lineWidth = Math.max(2, u * 0.045);
    eye(x - u * 0.3, false);
    eye(x + u * 0.3, wink);
    ctx.lineWidth = Math.max(2, u * 0.06);
    // smile
    ctx.beginPath();
    ctx.arc(x, y + u * 0.05, u * 0.3, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // rosy cheeks
    ctx.fillStyle = 'rgba(251,113,133,0.45)';
    ctx.beginPath();
    ctx.arc(x - u * 0.5, y + u * 0.12, u * 0.09, 0, Math.PI * 2);
    ctx.arc(x + u * 0.5, y + u * 0.12, u * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- words

  private updateText(t: number): void {
    const show = (key: string, on: boolean): void => {
      this.textEls.get(key)?.classList.toggle('show', on);
    };
    if (this.city && t < this.cityLength) {
      show('city', finaleTextVisible(FINALE_TEXT.city, t));
      show('molar', finaleTextVisible(FINALE_TEXT.molar, t));
      show('badge', finaleTextVisible(FINALE_TEXT.molar, t - 0.3));
      show('bubble', finaleTextVisible(FINALE_TEXT.bubble, t));
      show('climb', finaleTextVisible(FINALE_TEXT.climb, t));
      show('next', finaleTextVisible(FINALE_TEXT.climb, t - 0.5));
      for (const k of ['endingTitle', 'credit', 'thanks', 'perfect', 'hint']) show(k, false);
      return;
    }
    const e = t - this.cityLength;
    const E = ENDING_TIMES;
    for (const k of ['city', 'molar', 'badge', 'bubble', 'climb', 'next']) show(k, false);
    show('endingTitle', e >= E.snap && e < E.creditsStart - 0.3);
    const credit = endingCredit(e);
    const creditEl = this.textEls.get('credit');
    if (creditEl) {
      const city = credit.index >= 0 ? this.cities[credit.index] : null;
      creditEl.classList.toggle('show', Boolean(city) && credit.alpha > 0.3);
      if (city && creditEl.dataset.index !== String(credit.index)) {
        creditEl.dataset.index = String(credit.index);
        creditEl.querySelector('.finale-credit-city')!.textContent = city.cityName;
        creditEl.querySelector('.finale-credit-name')!.textContent = city.hostName;
        creditEl.querySelector('.finale-credit-role')!.textContent = city.hostRole;
      }
      // just under the small molar at the top (on a tall phone that is lower than 30% down)
      creditEl.style.top = `${Math.max(this.h * 0.3, this.stageY(0.44) + 8)}px`;
    }
    show('thanks', e >= E.finaleStart + 0.8 && e < E.end - 0.5);
    show('perfect', this.allGold && e >= E.face + 0.3 && e < E.end - 0.5);
    show('hint', !this.allGold && e >= E.face + 0.5 && e < E.end - 0.5);
  }
}

/** 0 → 1 with a small overshoot, for a coin popping into place. */
function backOutPop(x: number): number {
  const u = Math.max(0, Math.min(1, x)) - 1;
  return 1 + 2.7 * u * u * u + 1.7 * u * u;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** The small Golden Molar on the main menu, as inline SVG: each cusp in its finish. */
export function goldenMolarIconSvg(finishes: readonly MolarFinish[], size = 22): string {
  const s = 10; // molar units → SVG units
  const cx = 13.4;
  const cy = 12;
  const color = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;
  const cusps = GOLDEN_MOLAR.cusps
    .map((c, i) => {
      const f = finishes[i] ?? 'empty';
      const x = (cx + c.x * s).toFixed(2);
      const y = (cy - c.y * s).toFixed(2);
      const r = (GOLDEN_MOLAR.cuspRadius * s).toFixed(2);
      return f === 'empty'
        ? `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="rgba(226,232,240,0.55)" stroke-width="0.9" stroke-dasharray="1.6 1.2"/>`
        : `<circle cx="${x}" cy="${y}" r="${r}" fill="${color(MOLAR_FINISH_COLORS[f][0])}" stroke="${color(MOLAR_FINISH_COLORS[f][1])}" stroke-width="0.9"/>`;
    })
    .join('');
  const core = GOLDEN_MOLAR.core;
  const crown = (grow: number, fill: string): string =>
    `<rect x="${(cx + (core.x - grow) * s).toFixed(2)}" y="${(cy - (core.y + core.h + grow) * s).toFixed(2)}" width="${((core.w + grow * 2) * s).toFixed(2)}" height="${((core.h + grow * 2) * s).toFixed(2)}" rx="${((core.r + grow) * s).toFixed(2)}" fill="${fill}"/>` +
    GOLDEN_MOLAR.cusps
      .map((c) => `<circle cx="${(cx + c.x * s).toFixed(2)}" cy="${(cy - c.y * s).toFixed(2)}" r="${((GOLDEN_MOLAR.lobeRadius + grow) * s).toFixed(2)}" fill="${fill}"/>`)
      .join('');
  return `<svg class="molar-ico" viewBox="0 0 28 24" width="${Math.round((size * 28) / 24)}" height="${size}" aria-hidden="true" focusable="false">
    ${crown(0.09, '#fbbf24')}${crown(0, '#0f172a')}
    ${cusps}
  </svg>`;
}
