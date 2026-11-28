/**
 * A brush the page never got to finish is kept, as in the native app (`AppCoordinator`:
 * `PendingBrush`, `checkpointBrushing`, `finishPendingBrush`). The brush screen writes a note to
 * the device while it runs; the next start pays it quietly, before Home shows. On Android the
 * system often ends a backgrounded app, so this matters most there.
 *
 * The note lives outside the save, under the native app's name, so Sync Codes are unchanged. Every
 * way a brush ends (finished, Home, a Start card left up, Done / Skip, the note paid at the next
 * start) is paid by `settleBrush`, the one place a brush is paid, once per brush.
 *
 * Every open tab shares `localStorage`, so the brush running in a tab holds the Web Lock
 * `mouthlife-brush` until it is paid or left. The next start pays a note only if it can take that
 * lock at once: a brush still running in another tab keeps its note. The browser lets go of the lock
 * when a tab closes or crashes, which is what lets a crashed brush be paid. Without Web Locks (old
 * browsers) the note is paid without asking.
 */
import * as diary from '../diagnostics/testDiary';
import type { EventBus } from '../EventBus';
import { HabitBank, brushRewardDay } from './HabitBank';
import type { SaveSystem } from './SaveSystem';

/** The native app's name for the same note (UserDefaults there). */
export const PENDING_BRUSH_KEY = 'mouthlife.pacer.pendingBrush';
/** The brushes paid lately, by session id, so none is ever paid twice. */
export const PAID_BRUSH_SESSIONS_KEY = 'mouthlife.pacer.paidBrushSessions';
/** How many paid brushes are remembered. */
export const PAID_BRUSH_SESSIONS_KEPT = 20;
/** The Web Lock held by the brush running in a tab. */
export const BRUSH_LOCK_NAME = 'mouthlife-brush';

/** A brush not yet paid: the native `PendingBrush`, with times in wall-clock milliseconds. */
export interface PendingBrush {
  sessionId: string;
  /** Seconds really brushed (at most the 2 minutes). */
  brushedSec: number;
  /** When brushing ended (or, mid-brush, when the note was written). */
  brushingEndedAtMs: number;
  /** When the last stage that ran ended: the brush is paid on that day. */
  stageEndedAtMs: number;
  fullBrush: boolean;
  flossDone: boolean;
  rinseStepOff: boolean;
}

// --------------------------------------------------------------- storage (never throws)

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: nothing outlives this visit.
  }
}

function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing stored to clear.
  }
}

/** The note, or null when there is none or it cannot be read. */
export function readPendingBrush(): PendingBrush | null {
  const raw = readKey(PENDING_BRUSH_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<PendingBrush> | null;
    if (
      !p ||
      typeof p.sessionId !== 'string' ||
      !p.sessionId ||
      p.sessionId.length > 64 ||
      typeof p.brushedSec !== 'number' ||
      !Number.isFinite(p.brushedSec) ||
      typeof p.brushingEndedAtMs !== 'number' ||
      typeof p.stageEndedAtMs !== 'number' ||
      typeof p.fullBrush !== 'boolean' ||
      typeof p.flossDone !== 'boolean' ||
      typeof p.rinseStepOff !== 'boolean'
    ) {
      return null;
    }
    return p as PendingBrush;
  } catch {
    return null;
  }
}

export function writePendingBrush(note: PendingBrush): void {
  writeKey(PENDING_BRUSH_KEY, JSON.stringify(note));
}

/** Clears the note; with `sessionId`, only if it is that brush's (another tab's stays). */
export function clearPendingBrush(sessionId?: string): void {
  if (sessionId !== undefined) {
    const raw = readKey(PENDING_BRUSH_KEY);
    if (raw === null) return;
    const note = readPendingBrush();
    if (note && note.sessionId !== sessionId) return;
  }
  removeKey(PENDING_BRUSH_KEY);
}

/** Brushes paid on this page, for when storage refuses to keep the list. */
const paidThisVisit = new Set<string>();

export function readPaidBrushSessions(): string[] {
  try {
    const list: unknown = JSON.parse(readKey(PAID_BRUSH_SESSIONS_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function wasBrushSessionPaid(sessionId: string): boolean {
  return paidThisVisit.has(sessionId) || readPaidBrushSessions().includes(sessionId);
}

function markBrushSessionPaid(sessionId: string): void {
  paidThisVisit.add(sessionId);
  const list = readPaidBrushSessions().filter((id) => id !== sessionId);
  list.push(sessionId);
  writeKey(PAID_BRUSH_SESSIONS_KEY, JSON.stringify(list.slice(-PAID_BRUSH_SESSIONS_KEPT)));
}

/**
 * Erase Save: the note and the list of paid brushes go with the save, at the reset itself, before
 * the fresh save is written (`SaveSystem.resetToFreshSave`).
 */
export function clearBrushNotes(): void {
  paidThisVisit.clear();
  removeKey(PENDING_BRUSH_KEY);
  removeKey(PAID_BRUSH_SESSIONS_KEY);
}

/** A new id for a brush (the native app's `pacerSessionId`). */
export function newBrushSessionId(): string {
  try {
    const id = globalThis.crypto?.randomUUID?.();
    if (id) return id;
  } catch {
    // Not a secure page: made up below.
  }
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// --------------------------------------------------------------- the one way a brush is paid

/** What a brush earns, as `HabitBank.completeBrushAlong` says. */
export type BrushSettlement = ReturnType<typeof HabitBank.completeBrushAlong>;

export interface SettleBrushInput {
  sessionId: string;
  withFlossBonus: boolean;
  withMouthwashBonus: boolean;
  fullBrush: boolean;
  rinseStepOff: boolean;
  /** When the last stage that ran ended: the reward day (`brushRewardDay`). */
  stageEndedAtMs: number;
}

let settling = false;

/**
 * Pays a brush: the same bank and save call the brush screen always made, on the day its last stage
 * ended, then 'pacer:complete'. The note is cleared only after the save is written, so a page that
 * dies in between still has it, and the list of paid brushes then keeps it from being paid twice.
 * Returns null, paying nothing, for a brush already paid (or while another payment is under way).
 */
export function settleBrush(
  saveSys: SaveSystem,
  bus: EventBus,
  brush: SettleBrushInput,
  nowMs = Date.now()
): BrushSettlement | null {
  if (settling) return null;
  if (wasBrushSessionPaid(brush.sessionId)) {
    clearPendingBrush(brush.sessionId);
    return null;
  }
  settling = true;
  try {
    const save = saveSys.getSave();
    const now = new Date(nowMs);
    const outcome = HabitBank.completeBrushAlong(save, {
      withFlossBonus: brush.withFlossBonus,
      withMouthwashBonus: brush.withMouthwashBonus,
      fullBrush: brush.fullBrush,
      rinseStepOff: brush.rinseStepOff,
      date: now,
      // Paid on the day it really ended, so a brush found the next morning does not use up one of
      // today's two full rewards.
      rewardDay: brushRewardDay(new Date(brush.stageEndedAtMs), now),
    });
    saveSys.save(save, nowMs);
    // This page may be an older copy in front of a newer save, which writes nothing: the reward
    // then lives only in memory and is gone at the next start. So the note stays and the brush is
    // not listed as paid; the copy that can write pays it at its next start (as recovery does).
    if (!saveSys.isPersistenceSuspended()) {
      markBrushSessionPaid(brush.sessionId);
      clearPendingBrush(brush.sessionId);
    }
    bus.emit('pacer:complete', {
      withFlossBonus: brush.withFlossBonus,
      withMouthwashBonus: brush.withMouthwashBonus,
      ionsAwarded: outcome.ionsAwarded,
      stampAwarded: outcome.stampAwarded,
    });
    return outcome;
  } finally {
    settling = false;
  }
}

// --------------------------------------------------------------- the lock and the next start

interface LockManagerLike {
  request(
    name: string,
    options: { mode?: 'exclusive' | 'shared'; ifAvailable?: boolean },
    callback: (lock: unknown) => unknown
  ): Promise<unknown>;
}

function brushLocks(): LockManagerLike | null {
  try {
    const locks = (globalThis.navigator as (Navigator & { locks?: LockManagerLike }) | undefined)?.locks;
    return locks && typeof locks.request === 'function' ? locks : null;
  } catch {
    return null;
  }
}

/**
 * The running brush takes the lock (it waits, if another tab holds it) and keeps it until the
 * returned function is called: when the brush is paid or left. Closing or crashing the tab lets go.
 */
export function holdBrushLock(): () => void {
  const locks = brushLocks();
  if (!locks) return () => {};
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    void locks.request(BRUSH_LOCK_NAME, { mode: 'exclusive' }, () => held).catch(() => {});
  } catch {
    // No lock today: the brush runs all the same.
  }
  return release;
}

/** The note as a brush to pay: brushing and, if it was finished, floss; never the rinse. */
function payNote(saveSys: SaveSystem, bus: EventBus, nowMs = Date.now()): BrushSettlement | null {
  // Read here, under the lock: an Erase Save or another tab may have changed it meanwhile.
  const note = readPendingBrush();
  if (!note) {
    clearPendingBrush();
    return null;
  }
  const paid = settleBrush(
    saveSys,
    bus,
    {
      sessionId: note.sessionId,
      withFlossBonus: note.flossDone,
      withMouthwashBonus: false,
      fullBrush: note.fullBrush,
      rinseStepOff: note.rinseStepOff,
      stageEndedAtMs: note.stageEndedAtMs,
    },
    nowMs
  );
  if (paid) diary.unfinishedBrushPaid(note.brushedSec, note.fullBrush);
  return paid;
}

/**
 * At the next start: a brush the last visit left unfinished (closed, or ended by the system, mid-
 * brush or on a Start card) is paid now, quietly, with what was done (native `finishPendingBrush`).
 * A brush still running in another tab holds the lock, and its note is left alone.
 */
export function recoverPendingBrush(saveSys: SaveSystem, bus: EventBus, nowMs?: number): Promise<BrushSettlement | null> {
  // Almost every start: no note, nothing to wait for.
  if (readKey(PENDING_BRUSH_KEY) === null) return Promise.resolve(null);
  // An older copy of the game in front of a newer save writes nothing: the note waits for a version
  // that can save the brush.
  if (saveSys.isPersistenceSuspended()) return Promise.resolve(null);
  const locks = brushLocks();
  try {
    if (locks) {
      return locks
        .request(BRUSH_LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, (lock) =>
          lock ? payNote(saveSys, bus, nowMs) : null
        )
        .then((paid) => (paid as BrushSettlement | null) ?? null)
        .catch(() => null);
    }
  } catch {
    // The browser refused to be asked: as without Web Locks.
  }
  return Promise.resolve(payNote(saveSys, bus, nowMs));
}
