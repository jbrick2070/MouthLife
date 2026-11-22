/**
 * Links that leave the game wait for a grown-up: a sum with four answers, which a young child cannot
 * work out yet. Handlers on the page catch the ways a browser opens an outside link (charity pages,
 * donations): a tap or click, a middle click, the browser's own menu and a drag to the tab bar. So
 * none opens straight from a child's hand. The same question guards turning on the fluoride rinse
 * step (ages 6 and up) and the brush reminders.
 *
 * Three things keep a young child out. The sum is a two-digit number times a single digit. The right
 * answer is as often first, second, third or last, so no place is a better guess than another. And
 * a wrong answer locks the question for half a minute, so it cannot be tried again and again.
 *
 * The native app asks the same question (ParentGateView in CharitySheet) and has to follow the same
 * rules.
 */

/** The sum is `a × b`, with `a` from 12 to 19 and `b` from 3 to 9. */
export const GATE_FIRST_FACTOR_MIN = 12;
export const GATE_FIRST_FACTOR_MAX = 19;
export const GATE_SECOND_FACTOR_MIN = 3;
export const GATE_SECOND_FACTOR_MAX = 9;
/** How long a wrong answer locks the question, in seconds. */
export const GATE_LOCK_SECONDS = 30;
/**
 * How often the countdown on a locked card reads the clock, in milliseconds: four times a second,
 * so the number shown is never late and none is skipped.
 */
const COUNTDOWN_TICK_MS = 250;

/** One question: the sum and the four answers on the buttons. */
export interface GateQuestion {
  a: number;
  b: number;
  /** The right answer, `a × b`. */
  answer: number;
  /** The four answers in rising order. One of them is `answer`. */
  choices: number[];
}

/**
 * A whole number from `min` to `max`, each as likely as the next. `random` gives a number from 0 up
 * to, but not including, 1.
 */
function pickWhole(random: () => number, min: number, max: number): number {
  const count = max - min + 1;
  return min + Math.min(count - 1, Math.floor(random() * count));
}

/** `howMany` of the given numbers, picked at random without repeats. */
function pickSome(random: () => number, from: readonly number[], howMany: number): number[] {
  const left = from.slice();
  const picked: number[] = [];
  for (let i = 0; i < howMany; i++) {
    picked.push(left.splice(pickWhole(random, 0, left.length - 1), 1)[0]);
  }
  return picked;
}

/**
 * Draws a new question. `random` can be replaced in tests; the game uses Math.random.
 *
 * `rank` wrong answers are below the right one and the other `3 - rank` above it, and every rank
 * from 0 to 3 is as likely as the next, so the right answer is as often first, second, third or
 * last. The wrong answers lie close by: one `b` out, ten out, or both. The smallest of them is
 * 12 × 3 − 3 − 10 = 23, so all four are above zero, and since `b` is never 10 no two are the same.
 */
export function drawGateQuestion(random: () => number = Math.random): GateQuestion {
  const a = pickWhole(random, GATE_FIRST_FACTOR_MIN, GATE_FIRST_FACTOR_MAX);
  const b = pickWhole(random, GATE_SECOND_FACTOR_MIN, GATE_SECOND_FACTOR_MAX);
  const answer = a * b;
  const rank = pickWhole(random, 0, 3);
  const below = pickSome(random, [answer - b, answer - 10, answer - b - 10], rank);
  const above = pickSome(random, [answer + b, answer + 10, answer + b + 10], 3 - rank);
  const choices = [...below, answer, ...above].sort((x, y) => x - y);
  return { a, b, answer, choices };
}

/**
 * When a lock set by a wrong answer at `wrongAnswerAtMs` ends. Both are milliseconds on a clock that
 * only runs forwards (performance.now()), so changing the device's date or time cannot end a lock
 * early.
 */
export function gateLockEnd(wrongAnswerAtMs: number): number {
  return wrongAnswerAtMs + GATE_LOCK_SECONDS * 1000;
}

/**
 * Whole seconds of lock left at `nowMs`, rounded up, so the countdown shows 30 first and 1 last.
 * 0 means the question can be answered: no lock was set, or it is over. Never more than one full
 * lock.
 */
export function gateSecondsLeft(lockEndMs: number | null, nowMs: number): number {
  if (lockEndMs === null) return 0;
  const leftMs = lockEndMs - nowMs;
  // Written this way round so that a value that is not a number counts as "no lock".
  if (!(leftMs > 0)) return 0;
  return Math.ceil(Math.min(GATE_LOCK_SECONDS * 1000, leftMs) / 1000);
}

let open = false;
/**
 * When the lock set by the last wrong answer ends, on the performance.now() clock. One lock for
 * every use of the question (links, rinse, reminders), kept in memory only.
 */
let lockEndMs: number | null = null;

function isOutside(a: HTMLAnchorElement): boolean {
  try {
    const url = new URL(a.href, window.location.href);
    return /^https?:$/.test(url.protocol) && url.origin !== window.location.origin;
  } catch {
    return false;
  }
}

/** The outside link an event happened on, if any. */
function outsideLink(e: Event): HTMLAnchorElement | null {
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  return a && isOutside(a) ? a : null;
}

function showGate(href: string): void {
  askGrownUp(() => window.open(href, '_blank', 'noopener,noreferrer'));
}

/**
 * Ask the grown-up question, then run `onPass` only after the right answer. A wrong answer closes
 * it and locks it for half a minute; "Not now" just closes it. `note` is an optional line saying
 * what the grown-up agrees to.
 *
 * Opened while it is locked, the card shows an hourglass and the seconds left where the sum would
 * be, and no answers. When the wait is over a new sum appears and can be answered.
 */
export function askGrownUp(onPass: () => void, note?: string): void {
  if (open) return;
  open = true;
  const returnFocus = document.activeElement as HTMLElement | null;

  const shade = document.createElement('div');
  shade.className = 'parent-gate ui-interactive';
  shade.setAttribute('role', 'dialog');
  shade.setAttribute('aria-modal', 'true');
  shade.setAttribute('aria-label', 'For grown-ups');
  shade.style.cssText =
    'position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(1,6,15,0.78);';
  // The sum and the answers are filled in below, once it is known whether the question is locked.
  // The seconds tick in a timer, which a screen reader does not read out by itself; it is told the
  // wait once, in the line marked data-gate-said, and it is told the new sum when that appears.
  // The sum's line has a fixed height, so the taller hourglass does not make the card grow.
  const answerButton =
    '<button type="button" class="btn" data-answer style="min-height:48px;font-size:1.2rem;font-weight:800;"><span data-no-translate></span></button>';
  shade.innerHTML = `
    <div style="background:#06182a;border:1px solid rgba(94,234,212,0.4);border-radius:18px;padding:18px;max-width:320px;width:100%;text-align:center;color:#e2e8f0;font-family:inherit;">
      <div style="font-weight:800;font-size:1.05rem;margin-bottom:4px;">For grown-ups</div>
      <div data-gate-note style="font-size:0.85rem;color:#94a3b8;margin-bottom:2px;" hidden></div>
      <div style="font-size:1.6rem;font-weight:800;line-height:1.2;margin:6px 0 12px;">
        <div data-gate-sum data-no-translate aria-live="polite"></div>
        <div data-gate-wait data-no-translate role="timer" aria-live="off" style="font-variant-numeric:tabular-nums;" hidden></div>
      </div>
      <div data-gate-said data-no-translate class="sr-only" role="status" aria-live="polite"></div>
      <div data-gate-answers style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        ${answerButton.repeat(4)}
      </div>
      <button type="button" class="btn btn-sm" data-close>Not now</button>
    </div>`;
  const noteEl = shade.querySelector<HTMLElement>('[data-gate-note]');
  if (note && noteEl) {
    noteEl.textContent = note;
    noteEl.hidden = false;
  }
  const sumEl = shade.querySelector<HTMLElement>('[data-gate-sum]');
  const waitEl = shade.querySelector<HTMLElement>('[data-gate-wait]');
  const saidEl = shade.querySelector<HTMLElement>('[data-gate-said]');
  const answersEl = shade.querySelector<HTMLElement>('[data-gate-answers]');
  const answerButtons = Array.from(shade.querySelectorAll<HTMLButtonElement>('[data-answer]'));
  const closeButton = shade.querySelector<HTMLButtonElement>('[data-close]');

  /** The sum on the card. None while the question is locked: there is nothing to answer yet. */
  let question: GateQuestion | null = null;
  let shownSeconds = 0;
  let ticks = 0;
  let countdown: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  /** A new sum and its four answers. */
  const showQuestion = (): void => {
    const q = drawGateQuestion();
    question = q;
    if (waitEl) {
      waitEl.hidden = true;
      waitEl.textContent = '';
    }
    if (saidEl) saidEl.textContent = '';
    if (sumEl) sumEl.textContent = `${q.a} × ${q.b} = ?`;
    answerButtons.forEach((button, i) => {
      button.dataset.answer = String(q.choices[i]);
      const label = button.querySelector('span');
      if (label) label.textContent = String(q.choices[i]);
      button.disabled = false;
    });
    if (answersEl) answersEl.style.visibility = '';
  };

  /**
   * Locked: no sum and no answers anywhere on the card. The answers keep their place, so the card
   * does not jump when they come back, but they are not shown, cannot be chosen and are not read out.
   */
  const showLocked = (): void => {
    question = null;
    // The sum's line stays on the page, empty: a screen reader reads a line out when its text
    // changes, and only if the line was already there.
    if (sumEl) sumEl.textContent = '';
    if (waitEl) waitEl.hidden = false;
    answerButtons.forEach((button) => {
      button.dataset.answer = '';
      const label = button.querySelector('span');
      if (label) label.textContent = '';
      button.disabled = true;
    });
    if (answersEl) answersEl.style.visibility = 'hidden';
  };

  /** An hourglass and the whole seconds left: no words, so nothing to translate. */
  const showSecondsLeft = (seconds: number): void => {
    if (seconds === shownSeconds) return;
    shownSeconds = seconds;
    if (waitEl) waitEl.textContent = `⏳ ${seconds}`;
  };

  /** Counts the lock down. At 0 a new sum is drawn and can be answered. */
  const tick = (): void => {
    const seconds = gateSecondsLeft(lockEndMs, performance.now());
    if (seconds > 0) {
      showSecondsLeft(seconds);
      // A screen reader is told the wait once, not every second. Its line is filled on the first
      // tick (it has to be on the page before its text changes, or the change is not read out)
      // and emptied two seconds later, so that an old number is never found there.
      ticks += 1;
      if (saidEl && ticks === 1) saidEl.textContent = `⏳ ${seconds}`;
      if (saidEl && ticks === 1 + 2000 / COUNTDOWN_TICK_MS) saidEl.textContent = '';
      return;
    }
    if (countdown !== null) {
      clearInterval(countdown);
      countdown = null;
    }
    showQuestion();
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    open = false;
    if (countdown !== null) {
      clearInterval(countdown);
      countdown = null;
    }
    window.removeEventListener('keydown', onKey, true);
    shade.removeEventListener('click', onClick);
    shade.remove();
    returnFocus?.focus?.();
  };

  // Window, capture phase: runs before the keys of the sheet or screen underneath, so Escape closes
  // only this question and Tab stays inside it instead of walking into the sheet behind.
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) close();
      return;
    }
    if (e.key !== 'Tab') return;
    e.stopPropagation();
    // The buttons that can be chosen now: the four answers (not while locked) and "Not now".
    const items = Array.from(shade.querySelectorAll<HTMLElement>('button:not([disabled])'));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const atEdge = e.shiftKey ? active === first : active === last;
    if (!active || !shade.contains(active) || atEdge) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  };

  const onClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    if (target === shade || target.closest('[data-close]')) {
      close();
      return;
    }
    const pick = target.closest<HTMLElement>('[data-answer]');
    // No sum on the card (it is still locked): there is nothing to answer.
    if (!pick || !question) return;
    const right = Number(pick.dataset.answer) === question.answer;
    // A wrong answer locks the question wherever it is asked next.
    if (!right) lockEndMs = gateLockEnd(performance.now());
    close();
    if (right) onPass();
  };

  const secondsLeft = gateSecondsLeft(lockEndMs, performance.now());
  if (secondsLeft > 0) {
    showLocked();
    showSecondsLeft(secondsLeft);
    countdown = setInterval(tick, COUNTDOWN_TICK_MS);
  } else {
    showQuestion();
  }
  document.body.appendChild(shade);
  window.addEventListener('keydown', onKey, true);
  shade.addEventListener('click', onClick);
  // While locked, "Not now" is the one button that works, so that is where the keyboard starts.
  (secondsLeft > 0 ? closeButton : answerButtons[0])?.focus();
}

/**
 * Catch the ways an outside link can be opened from the page (once, at start-up). A plain tap or
 * click is not the only one: a browser also opens links from a middle click, from its own menu
 * (right click, or a long press on Android) and when a link is dragged to the tab bar. None of those
 * is a click.
 */
export function installParentGate(): void {
  if (typeof document === 'undefined') return;
  // A tap or click, also with Ctrl, Cmd or Shift held down.
  document.addEventListener(
    'click',
    (e) => {
      const a = outsideLink(e);
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      showGate(a.href);
    },
    true
  );
  // A middle click would open the link in a new tab: stop it, and ask the question instead.
  document.addEventListener(
    'auxclick',
    (e) => {
      const a = outsideLink(e);
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.button === 1) showGate(a.href);
    },
    true
  );
  // The browser's own menu offers "Open link in new tab" and more, so the game has none. A text box
  // keeps it, because that menu is how people paste a Sync Code.
  document.addEventListener(
    'contextmenu',
    (e) => {
      if ((e.target as Element | null)?.closest?.('input, textarea')) return;
      e.preventDefault();
    },
    true
  );
  // A link or a picture dragged to the tab bar opens there, so neither can be dragged.
  document.addEventListener(
    'dragstart',
    (e) => {
      if ((e.target as Element | null)?.closest?.('img, a[href]')) e.preventDefault();
    },
    true
  );
}
