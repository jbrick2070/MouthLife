/** Pure HUD helpers (no DOM) so timers, wayfinders and hint persistence are unit-testable. */

export function formatClock(totalSec: number, pad = false): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${pad ? String(m).padStart(2, '0') : String(m)}:${String(r).padStart(2, '0')}`;
}

export interface TimerPillState {
  text: string;
  warn: boolean; // amber styling
}

/** Pulp Rescue: prominent countdown (amber < 25s). Arcade: elapsed / par. */
export function buildTimerPill(
  mode: 'ARCADE' | 'PULP_RESCUE',
  elapsedSec: number,
  parSec: number,
  remainingRescueSec: number
): TimerPillState {
  if (mode === 'PULP_RESCUE') {
    return { text: `⏱ ${formatClock(Math.ceil(remainingRescueSec), true)}`, warn: remainingRescueSec < 25 };
  }
  return {
    text: `⏱ ${formatClock(elapsedSec)} / ${formatClock(parSec)}`,
    warn: elapsedSec > parSec,
  };
}

export type WayfinderKind = 'site' | 'crystal' | 'dome';
export interface WayfinderTarget {
  x: number;
  z: number;
  kind: WayfinderKind;
}

export interface WayfinderInput {
  sites: Array<{ pos: { x: number; z: number }; districtIdx: number; restored: boolean }>;
  sealedDistricts: boolean[];
  crystals: Array<{ pos: { x: number; z: number }; intact: boolean }>;
  domes: Array<{ cx: number; cz: number }>;
  domesRemaining: boolean;
  scanActive: boolean;
  probe: { x: number; z: number };
}

/**
 * Remaining-objective wayfinders: unrestored Commensal Sites when < 3 remain in an unsealed
 * district, or everything (sites, crystals, EPS domes) while the Dye Bio-Scan is active.
 */
export function selectWayfinderTargets(inp: WayfinderInput, maxSlots: number): WayfinderTarget[] {
  const out: WayfinderTarget[] = [];
  const byDistrict = new Map<number, typeof inp.sites>();
  for (const s of inp.sites) {
    if (s.restored) continue;
    const arr = byDistrict.get(s.districtIdx) ?? [];
    arr.push(s);
    byDistrict.set(s.districtIdx, arr);
  }
  for (const [d, arr] of byDistrict) {
    const open = !inp.sealedDistricts[d];
    if (inp.scanActive || (open && arr.length < 3)) {
      for (const s of arr) out.push({ x: s.pos.x, z: s.pos.z, kind: 'site' });
    }
  }
  if (inp.scanActive) {
    for (const c of inp.crystals) if (c.intact) out.push({ x: c.pos.x, z: c.pos.z, kind: 'crystal' });
    if (inp.domesRemaining) for (const d of inp.domes) out.push({ x: d.cx, z: d.cz, kind: 'dome' });
  }
  out.sort(
    (a, b) =>
      Math.hypot(a.x - inp.probe.x, a.z - inp.probe.z) - Math.hypot(b.x - inp.probe.x, b.z - inp.probe.z)
  );
  return out.slice(0, maxSlots);
}

export interface ClampedPoint {
  x: number;
  y: number;
  onScreen: boolean;
  angleRad: number; // direction from screen centre toward the target
}

/** Clamps a projected point to the viewport edge (with margin), preserving direction. */
export function clampToScreen(x: number, y: number, w: number, h: number, margin: number, forceOff = false): ClampedPoint {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const angleRad = Math.atan2(dy, dx);
  const inside = x >= margin && x <= w - margin && y >= margin && y <= h - margin;
  if (inside && !forceOff) return { x, y, onScreen: true, angleRad };
  const hx = w / 2 - margin;
  const hy = h / 2 - margin;
  const sx = dx === 0 ? Infinity : hx / Math.abs(dx);
  const sy = dy === 0 ? Infinity : hy / Math.abs(dy);
  const k = Math.min(sx, sy);
  const kk = Number.isFinite(k) ? k : 0;
  return { x: cx + dx * kk, y: cy + dy * kk, onScreen: false, angleRad };
}

export const HINTS_STORAGE_KEY = 'mouthlife.hintsSeen';

type MiniStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function loadSeenHints(storage?: MiniStorage | null): Set<string> {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    const arr = JSON.parse(s?.getItem(HINTS_STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveSeenHints(seen: Set<string>, storage?: MiniStorage | null): void {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    s?.setItem(HINTS_STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    /* non-fatal */
  }
}

/** True when a keyboard event target is a text-entry control where single-letter shortcuts must not fire. */
export function isEditableEventTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown; type?: unknown };
  if (el.isContentEditable === true) return true;
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = typeof el.type === 'string' ? el.type.toLowerCase() : 'text';
    // Range sliders / checkboxes / buttons are not text-typing fields; text/search/etc. are.
    return type !== 'range' && type !== 'checkbox' && type !== 'radio' && type !== 'button';
  }
  return false;
}

/** Pure policy for the global `M` mute toggle across all screens. */
export function shouldHandleGlobalMuteKey(
  e: { key: string; repeat?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
  target: unknown
): boolean {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key !== 'm' && e.key !== 'M') return false;
  return !isEditableEventTarget(target);
}

/** True when a brand-new player enters the Smooth Bask Hub before any brush stamps or cleared dives. */
export function shouldShowHubWelcome(
  seenHints: ReadonlySet<string>,
  totalBrushStamps: number,
  world1Completed: boolean
): boolean {
  return !seenHints.has('hub_welcome') && totalBrushStamps === 0 && !world1Completed;
}

export interface ObjectiveInput {
  mode: 'ARCADE' | 'PULP_RESCUE';
  worldCleanRatio: number;
  districtClean: number[];
  sealed: boolean[];
  /** Unrestored Commensal sites located in districts that are not yet sealed. */
  sitesLeftOpen: number;
  domesRemaining: boolean;
  surgeReady: boolean;
  sealRatio?: number;
  rescueTargetRatio?: number;
}

/**
 * One-line, always-truthful breadcrumb naming the single next thing a stage still needs.
 * Pure + deterministic so it is unit-testable; never blocks gameplay (it only advises).
 */
export function computeObjectiveBreadcrumb(inp: ObjectiveInput): string {
  if (inp.mode === 'PULP_RESCUE') {
    const target = inp.rescueTargetRatio ?? 0.85;
    const left = Math.max(0, Math.ceil((target - inp.worldCleanRatio) * 100));
    return left > 0
      ? `Scrub the glowing plaque — about ${left}% more to stabilize the pulp!`
      : 'Stabilizing… the pulp is safe!';
  }
  const seal = inp.sealRatio ?? 0.9;
  const openIdx: number[] = [];
  inp.sealed.forEach((s, i) => {
    if (!s) openIdx.push(i);
  });
  if (inp.sealed.length > 0 && openIdx.length === 0) return '✨ Every district is sealed — mission complete!';
  if (inp.domesRemaining) return '🛡️ Crack the EPS dome with Floss [E] or a Fluoride Surge [Q]!';
  if (inp.sitesLeftOpen === 1) return '1 Commensal Colony left — follow the ➤ Colony arrow!';
  if (inp.sitesLeftOpen > 1) return `Restore ${inp.sitesLeftOpen} Commensal Colonies — scrub their glowing patches clean!`;
  const worst = openIdx.reduce(
    (best, i) => (inp.districtClean[i] < inp.districtClean[best] ? i : best),
    openIdx[0] ?? 0
  );
  const worstPct = Math.round((inp.districtClean[worst] ?? 0) * 100);
  const nearly = openIdx.every((i) => (inp.districtClean[i] ?? 0) >= seal - 0.12);
  if (nearly && inp.surgeReady) {
    return openIdx.length > 1
      ? 'Almost clean! Trigger 🌊 Fluoride Surge [Q] to seal the final districts!'
      : 'Almost clean! Trigger 🌊 Fluoride Surge [Q] to seal the final district!';
  }
  if (nearly) return `Almost clean! Sweep D${worst + 1} (${worstPct}%) to ${Math.round(seal * 100)}% to seal it!`;
  return inp.surgeReady
    ? 'Scrub enamel → press Surge [Q] to seal'
    : 'Scrub enamel → restore colonies → press Surge [Q] to seal';
}
