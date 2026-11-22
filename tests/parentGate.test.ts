import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GATE_FIRST_FACTOR_MAX,
  GATE_FIRST_FACTOR_MIN,
  GATE_LOCK_SECONDS,
  GATE_SECOND_FACTOR_MAX,
  GATE_SECOND_FACTOR_MIN,
  drawGateQuestion,
  gateLockEnd,
  gateSecondsLeft,
} from '../src/ui/parentGate';

// The grown-up question: the sum, the four answers, the lock after a wrong answer, and every way a
// browser can open a link without a plain click. The native app's twin is ParentGate (the rules) and
// ParentGateView (the card); both editions must ask the same question.

/** The same numbers on every run (mulberry32), so "evenly spread" cannot fail by bad luck. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('the grown-up question: the sum and its four answers', () => {
  it('the sum is 12 to 19 times 3 to 9', () => {
    expect([GATE_FIRST_FACTOR_MIN, GATE_FIRST_FACTOR_MAX]).toEqual([12, 19]);
    expect([GATE_SECOND_FACTOR_MIN, GATE_SECOND_FACTOR_MAX]).toEqual([3, 9]);
    const random = seeded(1);
    const firsts = new Set<number>();
    const seconds = new Set<number>();
    for (let i = 0; i < 4000; i++) {
      const q = drawGateQuestion(random);
      expect(q.a).toBeGreaterThanOrEqual(12);
      expect(q.a).toBeLessThanOrEqual(19);
      expect(q.b).toBeGreaterThanOrEqual(3);
      expect(q.b).toBeLessThanOrEqual(9);
      expect(q.answer).toBe(q.a * q.b);
      firsts.add(q.a);
      seconds.add(q.b);
    }
    // Every number in both ranges comes up, the ends too.
    expect([...firsts].sort((x, y) => x - y)).toEqual([12, 13, 14, 15, 16, 17, 18, 19]);
    expect([...seconds].sort((x, y) => x - y)).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it('offers four different answers above zero, in rising order, the right one among them', () => {
    const random = seeded(2);
    for (let i = 0; i < 4000; i++) {
      const q = drawGateQuestion(random);
      expect(q.choices).toHaveLength(4);
      expect(new Set(q.choices).size).toBe(4);
      expect(q.choices).toEqual([...q.choices].sort((x, y) => x - y));
      expect(q.choices.every((n) => Number.isInteger(n) && n > 0)).toBe(true);
      expect(q.choices.filter((n) => n === q.answer)).toHaveLength(1);
      // A wrong answer is one `b` out, ten out, or both.
      for (const wrong of q.choices) {
        if (wrong !== q.answer) expect([q.b, 10, q.b + 10]).toContain(Math.abs(wrong - q.answer));
      }
    }
  });

  it('puts the right answer first, second, third and last equally often', () => {
    const random = seeded(3);
    const draws = 20_000;
    const places = [0, 0, 0, 0];
    for (let i = 0; i < draws; i++) {
      const q = drawGateQuestion(random);
      places[q.choices.indexOf(q.answer)] += 1;
    }
    // A quarter each, give or take a twentieth of that. (The old question's right answer was one of
    // the two middle buttons four times in five.)
    for (const count of places) {
      expect(Math.abs(count - draws / 4), JSON.stringify(places)).toBeLessThan((draws / 4) * 0.05);
    }
  });

  it('uses each of the six wrong answers as often as the next', () => {
    const random = seeded(4);
    const draws = 20_000;
    const used = new Map<string, number>();
    for (let i = 0; i < draws; i++) {
      const q = drawGateQuestion(random);
      for (const wrong of q.choices) {
        if (wrong === q.answer) continue;
        const gap = Math.abs(wrong - q.answer);
        const name = `${wrong < q.answer ? 'below' : 'above'} ${gap === q.b ? 'b' : gap === 10 ? 'ten' : 'both'}`;
        used.set(name, (used.get(name) ?? 0) + 1);
      }
    }
    expect([...used.keys()].sort()).toEqual(['above b', 'above both', 'above ten', 'below b', 'below both', 'below ten']);
    // Each of the six is on the card in half of the questions.
    for (const [name, count] of used) {
      expect(Math.abs(count - draws / 2), name).toBeLessThan((draws / 2) * 0.05);
    }
  });

  it('holds at both ends of the random numbers, and the same numbers give the same question', () => {
    // The lowest draw every time: 12 × 3, with the three wrong answers above it.
    expect(drawGateQuestion(() => 0)).toEqual({ a: 12, b: 3, answer: 36, choices: [36, 39, 46, 49] });
    // The highest: 19 × 9, with the three wrong answers below it. The smallest any answer can be
    // is 12 × 3 − 3 − 10 = 23, so none is ever zero or less.
    expect(drawGateQuestion(() => 0.999999)).toEqual({ a: 19, b: 9, answer: 171, choices: [152, 161, 162, 171] });
    // A source that wrongly returns 1 itself must not step outside the ranges.
    expect(drawGateQuestion(() => 1)).toEqual({ a: 19, b: 9, answer: 171, choices: [152, 161, 162, 171] });

    const one = seeded(5);
    const two = seeded(5);
    const other = seeded(6);
    const first = Array.from({ length: 50 }, () => drawGateQuestion(one));
    expect(Array.from({ length: 50 }, () => drawGateQuestion(two))).toEqual(first);
    expect(Array.from({ length: 50 }, () => drawGateQuestion(other))).not.toEqual(first);

    // The everyday entry point (Math.random) keeps the same rules.
    const q = drawGateQuestion();
    expect(q.a >= 12 && q.a <= 19 && q.b >= 3 && q.b <= 9).toBe(true);
    expect(q.choices).toHaveLength(4);
    expect(q.choices).toContain(q.a * q.b);
  });
});

describe('the grown-up question: the lock after a wrong answer', () => {
  it('lasts 30 seconds, counted on a clock that only runs forwards', () => {
    expect(GATE_LOCK_SECONDS).toBe(30);
    // A wrong answer 1000 seconds after the page opened (performance.now() is in milliseconds).
    const end = gateLockEnd(1_000_000);
    expect(end).toBe(1_030_000);
    // Rounded up: the countdown shows 30 first and 1 last.
    expect(gateSecondsLeft(end, 1_000_000)).toBe(30);
    expect(gateSecondsLeft(end, 1_000_250)).toBe(30);
    expect(gateSecondsLeft(end, 1_001_000)).toBe(29);
    expect(gateSecondsLeft(end, 1_028_500)).toBe(2);
    expect(gateSecondsLeft(end, 1_029_000)).toBe(1);
    expect(gateSecondsLeft(end, 1_029_750)).toBe(1);
    // Over at the end and ever after.
    expect(gateSecondsLeft(end, 1_030_000)).toBe(0);
    expect(gateSecondsLeft(end, 1_030_250)).toBe(0);
    expect(gateSecondsLeft(end, 86_400_000)).toBe(0);
  });

  it('no lock means no wait, and a wait is never longer than one lock', () => {
    expect(gateSecondsLeft(null, 0)).toBe(0);
    expect(gateSecondsLeft(null, 1_000_000)).toBe(0);
    // A time from before the lock was set cannot stretch it.
    expect(gateSecondsLeft(1_030_000, 0)).toBe(30);
    expect(gateSecondsLeft(Infinity, 1_000_000)).toBe(30);
    // A number that is not a time locks nothing.
    expect(gateSecondsLeft(NaN, 1_000_000)).toBe(0);
    expect(gateSecondsLeft(1_030_000, NaN)).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// The card and the page handlers. Tests run without a browser, so the page is a small stand-in: it
// builds elements from the card's own markup, records listeners and focus, and sends keys through
// the listeners in the order a real page does. Everything it runs is the game's own code.
// ---------------------------------------------------------------------------------------------

type Handler = (event: unknown) => void;

interface PageListener {
  target: 'document' | 'window';
  type: string;
  handler: Handler;
  capture: boolean;
}

const page = {
  listeners: [] as PageListener[],
  activeElement: null as FakeEl | null,
  appended: [] as FakeEl[],
  opened: [] as string[],
};

class FakeEl {
  readonly attrs = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly children: FakeEl[] = [];
  readonly listeners: { type: string; handler: Handler }[] = [];
  parent: FakeEl | null = null;
  className = '';
  hidden = false;
  disabled = false;
  removed = false;
  /** Every text the game wrote into this element, in order: a line said once is written once. */
  readonly written: string[] = [];
  private text = '';
  private html = '';

  constructor(readonly tag: string) {}

  get textContent(): string {
    return this.text;
  }
  set textContent(value: string) {
    this.text = value;
    this.written.push(value);
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  get innerHTML(): string {
    return this.html;
  }
  /** Turns the markup into elements: every tag, its attributes, its place inside the others, its text. */
  set innerHTML(html: string) {
    this.html = html;
    this.children.length = 0;
    const open: FakeEl[] = [this];
    const tags = /<(\/?)([a-z]+)((?:"[^"]*"|[^>"])*)>|([^<]+)/g;
    for (let m = tags.exec(html); m; m = tags.exec(html)) {
      const top = open[open.length - 1];
      if (m[4] !== undefined) {
        if (m[4].trim()) top.text += m[4].trim();
      } else if (m[1]) {
        open.pop();
      } else {
        const el = new FakeEl(m[2]);
        for (const attr of m[3].matchAll(/([a-z-]+)(?:="([^"]*)")?/g)) {
          el.attrs.set(attr[1], attr[2] ?? '');
          if (attr[1] === 'hidden') el.hidden = true;
          if (attr[1] === 'disabled') el.disabled = true;
          if (attr[1] === 'class') el.className = attr[2] ?? '';
        }
        el.parent = top;
        top.children.push(el);
        open.push(el);
      }
    }
  }

  /** The few kinds of selector the card uses. Anything else is an error, not a silent miss. */
  matches(selector: string): boolean {
    const attr = /^\[([a-z-]+)\]$/.exec(selector);
    if (attr) {
      const dataKey = attr[1].startsWith('data-')
        ? attr[1].slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
        : null;
      return this.attrs.has(attr[1]) || (dataKey !== null && dataKey in this.dataset);
    }
    if (selector === 'button:not([disabled])') return this.tag === 'button' && !this.disabled;
    if (/^[a-z]+$/.test(selector)) return this.tag === selector;
    throw new Error(`the stand-in page does not know the selector "${selector}"`);
  }

  querySelectorAll(selector: string): FakeEl[] {
    const found: FakeEl[] = [];
    for (const child of this.children) {
      if (child.matches(selector)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }

  querySelector(selector: string): FakeEl | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  closest(selector: string): FakeEl | null {
    for (let el: FakeEl | null = this; el; el = el.parent) {
      if (el.matches(selector)) return el;
    }
    return null;
  }

  contains(other: unknown): boolean {
    for (let el = other instanceof FakeEl ? other : null; el; el = el.parent) {
      if (el === this) return true;
    }
    return false;
  }

  addEventListener(type: string, handler: Handler): void {
    this.listeners.push({ type, handler });
  }

  removeEventListener(type: string, handler: Handler): void {
    const at = this.listeners.findIndex((l) => l.type === type && l.handler === handler);
    if (at >= 0) this.listeners.splice(at, 1);
  }

  remove(): void {
    this.removed = true;
  }

  focus(): void {
    page.activeElement = this;
  }

  /** A tap or click on this element, as the card's own listener receives it. */
  click(): void {
    for (let el: FakeEl | null = this; el; el = el.parent) {
      for (const l of [...el.listeners]) {
        if (l.type === 'click') l.handler({ target: this });
      }
    }
  }
}

interface FakeEvent {
  target?: unknown;
  key?: string;
  button?: number;
  shiftKey: boolean;
  repeat: boolean;
  defaultPrevented: boolean;
  propagationStopped: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

function fakeEvent(fields: Partial<FakeEvent> = {}): FakeEvent {
  return {
    shiftKey: false,
    repeat: false,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    ...fields,
  };
}

/**
 * Sends an event through the page's listeners in the order a real page runs them: window then
 * document on the way in (capture), document then window on the way back (bubble). Once a listener
 * stops the event, the objects further along never hear it.
 */
function dispatch(type: string, event: FakeEvent): FakeEvent {
  const journey = [
    ['window', true],
    ['document', true],
    ['document', false],
    ['window', false],
  ] as const;
  for (const [target, capture] of journey) {
    if (event.propagationStopped) break;
    for (const l of [...page.listeners]) {
      if (l.target === target && l.capture === capture && l.type === type) l.handler(event);
    }
  }
  return event;
}

const press = (key: string, more: Partial<FakeEvent> = {}): FakeEvent => dispatch('keydown', fakeEvent({ key, ...more }));

/** Something on the page a pointer can land on. It answers `closest` the way the real element would. */
function thing(kind: 'outside link' | 'own link' | 'picture' | 'picture in an outside link' | 'input' | 'textarea' | 'plain text') {
  const anchor =
    kind === 'outside link' || kind === 'picture in an outside link'
      ? { href: 'https://charity.example/donate' }
      : kind === 'own link'
        ? { href: 'https://play.example/MouthLife/privacy.html' }
        : null;
  const self = { kind };
  return Object.assign(self, {
    closest(selectors: string): unknown {
      for (const selector of selectors.split(',').map((s) => s.trim())) {
        if (selector === 'a[href]' && anchor) return anchor;
        if (selector === 'img' && kind.startsWith('picture')) return self;
        if (selector === kind) return self;
      }
      return null;
    },
  });
}

const g = globalThis as Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.resetModules();
  page.listeners = [];
  page.activeElement = null;
  page.appended = [];
  page.opened = [];
  const add = (target: 'document' | 'window') => (type: string, handler: Handler, options?: unknown) => {
    const capture = options === true || (typeof options === 'object' && options !== null && (options as { capture?: boolean }).capture === true);
    page.listeners.push({ target, type, handler, capture });
  };
  const remove = (target: 'document' | 'window') => (type: string, handler: Handler, options?: unknown) => {
    const capture = options === true || (typeof options === 'object' && options !== null && (options as { capture?: boolean }).capture === true);
    const at = page.listeners.findIndex((l) => l.target === target && l.type === type && l.handler === handler && l.capture === capture);
    if (at >= 0) page.listeners.splice(at, 1);
  };
  g.document = {
    addEventListener: add('document'),
    removeEventListener: remove('document'),
    createElement: (tag: string) => new FakeEl(tag),
    body: { appendChild: (el: FakeEl) => void page.appended.push(el) },
    get activeElement() {
      return page.activeElement;
    },
  };
  g.window = {
    addEventListener: add('window'),
    removeEventListener: remove('window'),
    location: { href: 'https://play.example/MouthLife/', origin: 'https://play.example' },
    open: (href: string) => void page.opened.push(href),
  };
});

afterEach(() => {
  delete g.document;
  delete g.window;
  vi.useRealTimers();
});

/** The parts of the card that is on the page now. */
function card() {
  const shade = page.appended[page.appended.length - 1];
  const part = (selector: string): FakeEl => {
    const el = shade.querySelector(selector);
    if (!el) throw new Error(`the card has no ${selector}`);
    return el;
  };
  const answers = shade.querySelectorAll('[data-answer]');
  return {
    shade,
    note: part('[data-gate-note]'),
    sum: part('[data-gate-sum]'),
    wait: part('[data-gate-wait]'),
    said: part('[data-gate-said]'),
    grid: part('[data-gate-answers]'),
    notNow: part('[data-close]'),
    answers,
    numbers: answers.map((b) => Number(b.dataset.answer)),
    labels: answers.map((b) => b.querySelector('span')?.textContent ?? ''),
    /** The right answer, worked out from the sum on the card the way a grown-up would. */
    rightAnswer(): number {
      const m = /^(\d+) × (\d+) = \?$/.exec(part('[data-gate-sum]').textContent);
      if (!m) throw new Error(`no sum on the card: "${part('[data-gate-sum]').textContent}"`);
      return Number(m[1]) * Number(m[2]);
    },
    tap(which: 'right' | 'wrong'): void {
      const right = this.rightAnswer();
      const button = answers.find((b) => (Number(b.dataset.answer) === right) === (which === 'right'));
      if (!button) throw new Error(`no ${which} answer on the card`);
      // The tap lands on the number inside the button, as a real one does.
      (button.querySelector('span') ?? button).click();
    },
  };
}

const keyListeners = () => page.listeners.filter((l) => l.type === 'keydown').map((l) => `${l.target}:${l.capture ? 'capture' : 'bubble'}`);

describe('the grown-up question: every way a browser opens a link', () => {
  async function install() {
    const gate = await import('../src/ui/parentGate');
    gate.installParentGate();
    return gate;
  }

  it('listens on the whole page for clicks, middle clicks, the browser menu and drags', async () => {
    await install();
    expect(page.listeners.map((l) => `${l.target}:${l.type}:${l.capture ? 'capture' : 'bubble'}`).sort()).toEqual([
      'document:auxclick:capture',
      'document:click:capture',
      'document:contextmenu:capture',
      'document:dragstart:capture',
    ]);
  });

  it('a click on an outside link is stopped and the question is asked first', async () => {
    await install();
    const e = dispatch('click', fakeEvent({ target: thing('outside link'), button: 0 }));
    expect(e.defaultPrevented).toBe(true);
    expect(e.propagationStopped).toBe(true);
    expect(page.appended).toHaveLength(1);
    expect(page.opened).toEqual([]);
    // The right answer opens the page the link pointed to, in a new tab that cannot reach back.
    card().tap('right');
    expect(page.opened).toEqual(['https://charity.example/donate']);

    // A link inside the game itself is left alone.
    const own = dispatch('click', fakeEvent({ target: thing('own link'), button: 0 }));
    expect(own.defaultPrevented).toBe(false);
    expect(page.appended).toHaveLength(1);
  });

  it('a middle click on an outside link is stopped and asks the question too', async () => {
    await install();
    const e = dispatch('auxclick', fakeEvent({ target: thing('outside link'), button: 1 }));
    expect(e.defaultPrevented).toBe(true);
    expect(e.propagationStopped).toBe(true);
    expect(page.appended).toHaveLength(1);
    expect(page.opened).toEqual([]);
    card().tap('right');
    expect(page.opened).toEqual(['https://charity.example/donate']);

    // Any other extra button on the link is stopped as well, without a question.
    const right = dispatch('auxclick', fakeEvent({ target: thing('outside link'), button: 2 }));
    expect(right.defaultPrevented).toBe(true);
    expect(page.appended).toHaveLength(1);

    // Away from outside links a middle click is none of the gate's business.
    for (const where of ['own link', 'plain text', 'picture'] as const) {
      const other = dispatch('auxclick', fakeEvent({ target: thing(where), button: 1 }));
      expect(other.defaultPrevented, where).toBe(false);
      expect(other.propagationStopped, where).toBe(false);
    }
    expect(page.appended).toHaveLength(1);
  });

  it('the browser menu is off everywhere but in text boxes, where it is how people paste', async () => {
    await install();
    for (const where of ['outside link', 'own link', 'picture', 'picture in an outside link', 'plain text'] as const) {
      expect(dispatch('contextmenu', fakeEvent({ target: thing(where), button: 2 })).defaultPrevented, where).toBe(true);
    }
    for (const where of ['input', 'textarea'] as const) {
      expect(dispatch('contextmenu', fakeEvent({ target: thing(where), button: 2 })).defaultPrevented, where).toBe(false);
    }
    // The menu never asks the question by itself.
    expect(page.appended).toHaveLength(0);
  });

  it('links and pictures cannot be dragged to the tab bar; text in a box still can be moved', async () => {
    await install();
    for (const where of ['outside link', 'own link', 'picture', 'picture in an outside link'] as const) {
      expect(dispatch('dragstart', fakeEvent({ target: thing(where) })).defaultPrevented, where).toBe(true);
    }
    for (const where of ['input', 'textarea', 'plain text'] as const) {
      expect(dispatch('dragstart', fakeEvent({ target: thing(where) })).defaultPrevented, where).toBe(false);
    }
    // An event with nothing under it (or on bare text, which has no `closest`) is harmless.
    for (const type of ['click', 'auxclick', 'contextmenu', 'dragstart']) {
      expect(() => dispatch(type, fakeEvent({ target: null }))).not.toThrow();
      expect(() => dispatch(type, fakeEvent({ target: {} }))).not.toThrow();
    }
  });
});

describe('the grown-up question: the card', () => {
  async function gate() {
    return import('../src/ui/parentGate');
  }

  it('shows a sum from the rules with its four answers, and starts on the first answer', async () => {
    const { askGrownUp } = await gate();
    let passed = 0;
    askGrownUp(() => void (passed += 1), 'Reminders are set by a grown-up.');
    const c = card();
    expect(c.shade.attrs.get('role')).toBe('dialog');
    expect(c.shade.attrs.get('aria-modal')).toBe('true');
    expect(c.shade.attrs.get('aria-label')).toBe('For grown-ups');
    expect(c.note.textContent).toBe('Reminders are set by a grown-up.');
    expect(c.note.hidden).toBe(false);

    const m = /^(\d+) × (\d+) = \?$/.exec(c.sum.textContent);
    expect(m, c.sum.textContent).not.toBeNull();
    const [a, b] = [Number(m?.[1]), Number(m?.[2])];
    expect(a >= 12 && a <= 19 && b >= 3 && b <= 9).toBe(true);
    expect(c.sum.hidden).toBe(false);
    expect(c.wait.hidden).toBe(true);
    expect(c.wait.textContent).toBe('');

    expect(c.numbers).toHaveLength(4);
    expect(c.numbers).toEqual([...c.numbers].sort((x, y) => x - y));
    expect(c.numbers).toContain(a * b);
    expect(c.labels).toEqual(c.numbers.map(String));
    expect(c.answers.every((button) => !button.disabled)).toBe(true);
    expect(c.grid.style.visibility ?? '').toBe('');
    expect(page.activeElement).toBe(c.answers[0]);
    expect(passed).toBe(0);
  });

  it('uses only words the game already has', async () => {
    const { askGrownUp } = await gate();
    askGrownUp(() => {});
    const c = card();
    const words = [c.shade, ...c.shade.querySelectorAll('div'), ...c.shade.querySelectorAll('button')]
      .map((el) => el.textContent)
      .filter((text) => /[A-Za-z]/.test(text));
    expect(words.sort()).toEqual(['For grown-ups', 'Not now']);
    // Without a note the note line stays hidden.
    expect(c.note.hidden).toBe(true);
  });

  it('the right answer passes once, closes the card and locks nothing', async () => {
    const { askGrownUp } = await gate();
    const opener = new FakeEl('button');
    page.activeElement = opener;
    let passed = 0;
    askGrownUp(() => void (passed += 1));
    const first = card();
    first.tap('right');
    expect(passed).toBe(1);
    expect(first.shade.removed).toBe(true);
    // Focus goes back to where it was.
    expect(page.activeElement).toBe(opener);

    askGrownUp(() => void (passed += 1));
    const second = card();
    expect(second.shade).not.toBe(first.shade);
    expect(second.wait.hidden).toBe(true);
    expect(second.sum.textContent).toMatch(/^\d+ × \d+ = \?$/);
  });

  it('"Not now", a tap outside the card and Escape close it without a pass or a lock', async () => {
    const { askGrownUp } = await gate();
    let passed = 0;
    const ask = () => {
      askGrownUp(() => void (passed += 1));
      return card();
    };
    const byButton = ask();
    byButton.notNow.click();
    expect(byButton.shade.removed).toBe(true);

    const byOutside = ask();
    expect(byOutside.shade).not.toBe(byButton.shade);
    byOutside.shade.click();
    expect(byOutside.shade.removed).toBe(true);

    const byEscape = ask();
    press('Escape');
    expect(byEscape.shade.removed).toBe(true);

    // A tap on the card itself, beside the buttons, does nothing.
    const still = ask();
    still.sum.click();
    still.grid.click();
    expect(still.shade.removed).toBe(false);
    expect(still.sum.textContent).toMatch(/^\d+ × \d+ = \?$/);
    expect(passed).toBe(0);
  });

  it('only one card is on the page at a time', async () => {
    const { askGrownUp } = await gate();
    let second = 0;
    askGrownUp(() => {});
    askGrownUp(() => void (second += 1));
    expect(page.appended).toHaveLength(1);
    card().tap('right');
    expect(second).toBe(0);
  });

  it('a wrong answer closes the card and locks the question for 30 seconds, for every use of it', async () => {
    const { askGrownUp } = await gate();
    let passed = 0;
    askGrownUp(() => void (passed += 1));
    const first = card();
    first.tap('wrong');
    expect(passed).toBe(0);
    expect(first.shade.removed).toBe(true);

    // Asked again at once, for something else: the same card, with an hourglass where the sum was.
    let rinse = 0;
    askGrownUp(() => void (rinse += 1), 'Only for brushers aged 6 and up.');
    const locked = card();
    expect(locked.shade.attrs.get('aria-label')).toBe('For grown-ups');
    expect(locked.note.textContent).toBe('Only for brushers aged 6 and up.');
    expect(locked.note.hidden).toBe(false);
    expect(locked.wait.hidden).toBe(false);
    expect(locked.wait.textContent).toBe('⏳ 30');
    // No sum and no answers anywhere on the card: nothing to tap, nothing to read out too early.
    expect(locked.sum.textContent).toBe('');
    expect(locked.grid.style.visibility).toBe('hidden');
    expect(locked.answers.every((button) => button.disabled)).toBe(true);
    expect(locked.answers.map((button) => button.dataset.answer)).toEqual(['', '', '', '']);
    expect(locked.labels).toEqual(['', '', '', '']);
    expect([locked.shade, ...locked.shade.querySelectorAll('div'), ...locked.shade.querySelectorAll('span')].some((el) => /\d+ × \d+/.test(el.textContent))).toBe(false);
    // "Not now" is where the keyboard starts, and a tap where an answer was does nothing.
    expect(page.activeElement).toBe(locked.notNow);
    locked.answers[0].click();
    (locked.answers[1].querySelector('span') ?? locked.answers[1]).click();
    expect(locked.shade.removed).toBe(false);
    expect(rinse).toBe(0);

    // "Not now" always works, and the lock stays for the next use.
    vi.advanceTimersByTime(10_000);
    expect(locked.wait.textContent).toBe('⏳ 20');
    locked.notNow.click();
    expect(locked.shade.removed).toBe(true);
    vi.advanceTimersByTime(5_000);
    askGrownUp(() => void (passed += 1));
    expect(card().wait.textContent).toBe('⏳ 15');
    expect(passed + rinse).toBe(0);
  });

  it('counts down once a second, then shows a new sum that can be answered', async () => {
    const { askGrownUp } = await gate();
    askGrownUp(() => {});
    card().tap('wrong');
    let passed = 0;
    askGrownUp(() => void (passed += 1));
    const c = card();
    const shown: string[] = [c.wait.textContent];
    for (let second = 1; second <= 29; second++) {
      vi.advanceTimersByTime(1000);
      shown.push(c.wait.textContent);
      expect(c.sum.textContent).toBe('');
      expect(c.answers.every((button) => button.disabled)).toBe(true);
    }
    expect(shown).toEqual(Array.from({ length: 30 }, (_, i) => `⏳ ${30 - i}`));
    // Each number was written once: nothing is rewritten between the seconds.
    expect(c.wait.written).toEqual(shown);

    vi.advanceTimersByTime(999);
    expect(c.wait.textContent).toBe('⏳ 1');
    expect(c.sum.textContent).toBe('');
    vi.advanceTimersByTime(1);
    // At 0: a new sum, its four answers, and no hourglass.
    expect(c.wait.hidden).toBe(true);
    expect(c.wait.textContent).toBe('');
    expect(c.sum.textContent).toMatch(/^\d+ × \d+ = \?$/);
    const numbers = c.answers.map((button) => Number(button.dataset.answer));
    expect(numbers).toEqual([...numbers].sort((x, y) => x - y));
    expect(numbers).toContain(c.rightAnswer());
    expect(c.answers.every((button) => !button.disabled)).toBe(true);
    expect(c.grid.style.visibility).toBe('');
    // The countdown has stopped: no timer is left running behind the question.
    expect(vi.getTimerCount()).toBe(0);
    // Focus is not moved under the grown-up's hands.
    expect(page.activeElement).toBe(c.notNow);

    c.tap('right');
    expect(passed).toBe(1);
    expect(c.shade.removed).toBe(true);
  });

  it('a screen reader is told the wait once and the new sum once, never every second', async () => {
    const { askGrownUp } = await gate();
    askGrownUp(() => {});
    card().tap('wrong');
    askGrownUp(() => {});
    const c = card();
    // The seconds tick in a timer, which is not read out by itself.
    expect(c.wait.attrs.get('role')).toBe('timer');
    expect(c.wait.attrs.get('aria-live')).toBe('off');
    // The line that is read out is on the page, still empty, before its text is set.
    expect(c.said.attrs.get('role')).toBe('status');
    expect(c.said.attrs.get('aria-live')).toBe('polite');
    expect(c.said.className).toBe('sr-only');
    expect(c.said.textContent).toBe('');
    expect(c.said.written).toEqual([]);
    vi.advanceTimersByTime(250);
    expect(c.said.textContent).toBe('⏳ 30');
    // It stays for two seconds, long enough to be read out, and is then taken away, so an old
    // number cannot be found there later.
    vi.advanceTimersByTime(1750);
    expect(c.said.textContent).toBe('⏳ 30');
    vi.advanceTimersByTime(250);
    expect(c.said.textContent).toBe('');
    vi.advanceTimersByTime(18_000);
    expect(c.wait.textContent).toBe('⏳ 10');
    expect(c.said.written).toEqual(['⏳ 30', '']);
    // The sum's own line is read out when its text appears. It stayed on the page, empty, all this
    // time: a line that only turns up together with its text is not read out.
    expect(c.sum.attrs.get('aria-live')).toBe('polite');
    expect(c.sum.hidden).toBe(false);
    expect(c.sum.written).toEqual(['']);
    vi.advanceTimersByTime(10_000);
    expect(c.sum.written).toHaveLength(2);
    expect(c.sum.textContent).toMatch(/^\d+ × \d+ = \?$/);
    // The wait was told once and never again.
    expect(c.said.written.filter((text) => text !== '')).toEqual(['⏳ 30']);
    expect(c.said.textContent).toBe('');
  });

  it('a wait shorter than two seconds leaves nothing behind for a screen reader either', async () => {
    const { askGrownUp } = await gate();
    askGrownUp(() => {});
    card().tap('wrong');
    vi.advanceTimersByTime(29_000);
    askGrownUp(() => {});
    const c = card();
    expect(c.wait.textContent).toBe('⏳ 1');
    vi.advanceTimersByTime(250);
    expect(c.said.textContent).toBe('⏳ 1');
    vi.advanceTimersByTime(750);
    expect(c.said.textContent).toBe('');
    expect(c.sum.textContent).toMatch(/^\d+ × \d+ = \?$/);
  });

  it('changing the date or time does not shorten the lock', async () => {
    const { askGrownUp } = await gate();
    askGrownUp(() => {});
    card().tap('wrong');
    vi.advanceTimersByTime(5_000);
    // The device's clock is set a year ahead, then ten years back.
    vi.setSystemTime(Date.now() + 365 * 86_400_000);
    askGrownUp(() => {});
    expect(card().wait.textContent).toBe('⏳ 25');
    card().notNow.click();
    vi.setSystemTime(Date.now() - 10 * 365 * 86_400_000);
    askGrownUp(() => {});
    expect(card().wait.textContent).toBe('⏳ 25');
    card().notNow.click();
    // Only waiting ends it.
    vi.advanceTimersByTime(25_000);
    askGrownUp(() => {});
    expect(card().wait.hidden).toBe(true);
    expect(card().sum.textContent).toMatch(/^\d+ × \d+ = \?$/);
  });

  it('a second wrong answer starts a new 30 seconds', async () => {
    const { askGrownUp } = await gate();
    askGrownUp(() => {});
    card().tap('wrong');
    vi.advanceTimersByTime(30_000);
    askGrownUp(() => {});
    card().tap('wrong');
    vi.advanceTimersByTime(12_000);
    askGrownUp(() => {});
    expect(card().wait.textContent).toBe('⏳ 18');
  });
});

describe('the grown-up question: keys stay inside it', () => {
  /** A sheet underneath, listening the way Home, the report and the brush screen do: window, bubble. */
  function sheetBehind() {
    const heard: string[] = [];
    const ownButton = new FakeEl('button');
    const handler: Handler = (event) => {
      const e = event as FakeEvent;
      heard.push(e.key ?? '');
      // What those screens do: Escape closes them, Tab pulls focus into their own sheet.
      if (e.key === 'Tab') {
        e.preventDefault();
        ownButton.focus();
      }
    };
    (g.window as { addEventListener: (type: string, handler: Handler) => void }).addEventListener('keydown', handler);
    return { heard, ownButton };
  }

  it('listens for keys on the window, before anything else, only while it is open', async () => {
    const { askGrownUp } = await import('../src/ui/parentGate');
    expect(keyListeners()).toEqual([]);
    askGrownUp(() => {});
    expect(keyListeners()).toEqual(['window:capture']);
    card().notNow.click();
    expect(keyListeners()).toEqual([]);
  });

  it('Escape closes the question and nothing behind it', async () => {
    const { askGrownUp } = await import('../src/ui/parentGate');
    const behind = sheetBehind();
    let passed = 0;
    askGrownUp(() => void (passed += 1));
    const c = card();
    // A key held down repeats: the repeats are kept from the sheet too, and close nothing twice.
    const held = press('Escape', { repeat: true });
    expect(held.defaultPrevented).toBe(true);
    expect(held.propagationStopped).toBe(true);
    expect(c.shade.removed).toBe(false);

    const esc = press('Escape');
    expect(esc.defaultPrevented).toBe(true);
    expect(esc.propagationStopped).toBe(true);
    expect(c.shade.removed).toBe(true);
    expect(behind.heard).toEqual([]);
    expect(passed).toBe(0);

    // With the question gone, the sheet hears its keys again.
    press('Escape');
    expect(behind.heard).toEqual(['Escape']);
  });

  it('Tab walks the four answers and "Not now", round and round, and never leaves', async () => {
    const { askGrownUp } = await import('../src/ui/parentGate');
    const behind = sheetBehind();
    askGrownUp(() => {});
    const c = card();
    const order = [...c.answers, c.notNow];
    expect(page.activeElement).toBe(order[0]);

    // In the middle the browser moves focus by itself: the key is kept from the sheet, not cancelled.
    const middle = press('Tab');
    expect(middle.propagationStopped).toBe(true);
    expect(middle.defaultPrevented).toBe(false);

    // On the last button, Tab goes round to the first; on the first, Shift+Tab goes to the last.
    page.activeElement = c.notNow;
    const wrap = press('Tab');
    expect(wrap.defaultPrevented).toBe(true);
    expect(page.activeElement).toBe(order[0]);
    const back = press('Tab', { shiftKey: true });
    expect(back.defaultPrevented).toBe(true);
    expect(page.activeElement).toBe(c.notNow);

    // Focus that got outside (a tap on the page behind) is pulled back in, either way round.
    page.activeElement = behind.ownButton;
    press('Tab');
    expect(page.activeElement).toBe(order[0]);
    page.activeElement = null;
    press('Tab', { shiftKey: true });
    expect(page.activeElement).toBe(c.notNow);

    expect(behind.heard).toEqual([]);
    expect(c.shade.removed).toBe(false);
  });

  it('while locked, Tab stays on "Not now": the hidden answers cannot be reached', async () => {
    const { askGrownUp } = await import('../src/ui/parentGate');
    const behind = sheetBehind();
    askGrownUp(() => {});
    card().tap('wrong');
    askGrownUp(() => {});
    const c = card();
    expect(page.activeElement).toBe(c.notNow);
    for (const shiftKey of [false, true]) {
      const e = press('Tab', { shiftKey });
      expect(e.defaultPrevented).toBe(true);
      expect(e.propagationStopped).toBe(true);
      expect(page.activeElement).toBe(c.notNow);
    }
    // When the wait is over the answers can be reached again.
    vi.advanceTimersByTime(30_000);
    press('Tab');
    expect(page.activeElement).toBe(c.answers[0]);
    expect(behind.heard).toEqual([]);
  });

  it('other keys are left alone', async () => {
    const { askGrownUp } = await import('../src/ui/parentGate');
    const behind = sheetBehind();
    askGrownUp(() => {});
    const e = press('m');
    expect(e.defaultPrevented).toBe(false);
    expect(e.propagationStopped).toBe(false);
    expect(behind.heard).toEqual(['m']);
  });

  it('closing leaves no listener and no timer behind, however it is closed', async () => {
    const { askGrownUp } = await import('../src/ui/parentGate');
    const ways: Record<string, () => void> = {
      'the right answer': () => card().tap('right'),
      '"Not now"': () => card().notNow.click(),
      'a tap outside': () => card().shade.click(),
      Escape: () => void press('Escape'),
      'a wrong answer': () => card().tap('wrong'),
      '"Not now" while locked': () => card().notNow.click(),
      'Escape while locked': () => void press('Escape'),
    };
    for (const [name, closeIt] of Object.entries(ways)) {
      askGrownUp(() => {});
      const c = card();
      expect(keyListeners(), name).toEqual(['window:capture']);
      expect(c.shade.listeners.map((l) => l.type), name).toEqual(['click']);
      closeIt();
      expect(c.shade.removed, name).toBe(true);
      expect(page.listeners, name).toEqual([]);
      expect(c.shade.listeners, name).toEqual([]);
      expect(vi.getTimerCount(), name).toBe(0);
    }
    // The last three ran with the question locked (a countdown was running each time).
    askGrownUp(() => {});
    expect(card().wait.hidden).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
  });
});
