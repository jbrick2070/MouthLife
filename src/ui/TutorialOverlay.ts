import {
  TUTORIAL_COPY,
  TUTORIAL_PAGES,
  tutorialControlsFor,
  tutorialPageIndex,
  type TutorialInputScheme,
  type TutorialPageId,
} from '../config/tutorial';

/**
 * The How to Play guide: one card at a time, each with a small looping demo.
 * Tapping the demo plays it again with the game's own sound, so the player links the control
 * to what it does. The demos are drawn with plain shapes and CSS (see `.tut-*` in main.css) and
 * hold still when Reduced Motion is on.
 */
export interface TutorialOverlayOptions {
  scheme: TutorialInputScheme;
  startPageId?: TutorialPageId;
  /** Called once when the guide closes, by Done, Skip, Escape or a tap outside. */
  onClose: () => void;
  /** The player tapped a demo: play the matching game sound. */
  onDemoSound?: (pageId: TutorialPageId) => void;
  onUiTap?: () => void;
}

const FOCUSABLE_SEL = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------- demo scenes (320 x 180)

const ROBOT = `<circle class="tut-robot-glow" r="15"/><circle class="tut-robot-body" r="8.5"/>`;
const SPARKLE = 'M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8 Z';

function sparkle(x: number, y: number, n: number, scale = 1): string {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path class="tut-sparkle tut-sparkle-${n}" d="${SPARKLE}"/></g>`;
}

function sceneHome(): string {
  const teeth = [0, 1, 2, 3, 4, 5]
    .map((i) => `<rect class="tut-tooth" x="${55 + i * 36}" y="44" width="30" height="50" rx="10"/>`)
    .join('');
  return `
    <rect class="tut-gum" x="44" y="22" width="232" height="34" rx="17"/>
    ${teeth}
    ${sparkle(88, 34, 1)}${sparkle(160, 28, 2, 1.2)}${sparkle(232, 34, 3)}
    <circle class="tut-finger" cx="0" cy="0" r="13"/>
    <g class="tut-pill tut-pill-a"><rect x="62" y="124" width="92" height="36" rx="18"/><text x="108" y="149" text-anchor="middle">🪥</text></g>
    <g class="tut-pill tut-pill-b"><rect x="166" y="124" width="92" height="36" rx="18"/><text x="212" y="149" text-anchor="middle">🚀</text></g>
  `;
}

function sceneBrush(): string {
  // Sixteen teeth round an oval mouth, as seen in a bathroom mirror. The glow visits the four
  // quarters in the order the coach calls them: top right, top left, bottom left, bottom right.
  const quarterStartDeg = [-90, -180, 90, 0];
  let teeth = '';
  quarterStartDeg.forEach((start, q) => {
    for (let k = 0; k < 4; k++) {
      const deg = start + 11.25 + k * 22.5;
      const rad = (deg * Math.PI) / 180;
      const x = 160 + Math.cos(rad) * 78;
      const y = 86 + Math.sin(rad) * 58;
      teeth += `<circle class="tut-tooth tut-q tut-q${q + 1}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10.5"/>`;
    }
  });
  return `
    <ellipse class="tut-mouth" cx="160" cy="86" rx="78" ry="58"/>
    ${teeth}
    <text class="tut-emoji" x="160" y="98" text-anchor="middle">🪥</text>
    <text class="tut-note" x="196" y="70" text-anchor="middle">♪</text>
  `;
}

const DIVE_BLOBS: ReadonlyArray<readonly [number, number]> = [
  [108, 50],
  [156, 42],
  [206, 56],
  [192, 98],
  [124, 96],
];

function bigTooth(): string {
  return `
    <rect class="tut-tooth" x="70" y="14" width="180" height="118" rx="36"/>
    <path class="tut-groove" d="M112 74 Q160 58 208 74"/>
  `;
}

function sceneDive(): string {
  const blobs = DIVE_BLOBS.map(
    ([x, y], i) => `<ellipse class="tut-plaque tut-dive-blob-${i + 1}" cx="${x}" cy="${y}" rx="15" ry="11"/>`
  ).join('');
  return `
    ${bigTooth()}
    ${blobs}
    <g class="tut-robot tut-dive-robot">${ROBOT}</g>
    <rect class="tut-meter-track" x="84" y="150" width="130" height="9" rx="4.5"/>
    <rect class="tut-meter-fill tut-dive-progress" x="84" y="150" width="130" height="9" rx="4.5"/>
    <text class="tut-goal" x="224" y="159">90%</text>
  `;
}

function sceneFloss(): string {
  const dots = [104, 80, 56]
    .map((y, i) => `<circle class="tut-plaque tut-floss-dot-${i + 1}" cx="160" cy="${y}" r="5.5"/>`)
    .join('');
  return `
    <rect class="tut-tooth" x="70" y="26" width="83" height="106" rx="28"/>
    <rect class="tut-tooth" x="167" y="26" width="83" height="106" rx="28"/>
    ${dots}
    <rect class="tut-floss-line" x="158.5" y="16" width="3" height="134"/>
    ${sparkle(160, 20, 1, 1.1)}
    <g class="tut-robot tut-floss-robot">${ROBOT}</g>
  `;
}

const SURGE_BLOBS: ReadonlyArray<readonly [number, number]> = [
  [112, 62],
  [150, 50],
  [206, 64],
  [202, 110],
  [150, 122],
  [110, 104],
];

function sceneSurge(): string {
  const blobs = SURGE_BLOBS.map(
    ([x, y]) => `<ellipse class="tut-plaque tut-surge-blob" cx="${x}" cy="${y}" rx="13" ry="10"/>`
  ).join('');
  return `
    <rect class="tut-tooth" x="70" y="30" width="180" height="118" rx="36"/>
    ${blobs}
    <circle class="tut-surge-ring" cx="160" cy="88" r="12"/>
    <g class="tut-robot" transform="translate(160 88)">${ROBOT}</g>
    <rect class="tut-meter-track" x="100" y="8" width="120" height="10" rx="5"/>
    <rect class="tut-meter-fill tut-surge-meter" x="100" y="8" width="120" height="10" rx="5"/>
  `;
}

function sceneScan(): string {
  const blobs = DIVE_BLOBS.map(
    ([x, y], i) => `<ellipse class="tut-scan-blob tut-scan-blob-${i + 1}" cx="${x}" cy="${y + 18}" rx="15" ry="11"/>`
  ).join('');
  return `
    <rect class="tut-tooth" x="70" y="30" width="180" height="118" rx="36"/>
    ${blobs}
    <circle class="tut-scan-ring" cx="160" cy="92" r="12"/>
    <g class="tut-robot" transform="translate(160 92)">${ROBOT}</g>
  `;
}

/** Five cities: the first is open, the route reaches the others one by one. */
const CITY_PINS: ReadonlyArray<readonly [number, number]> = [
  [118, 66],
  [150, 98],
  [198, 84],
  [172, 118],
  [226, 36],
];

function sceneCities(): string {
  const route = CITY_PINS.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  const pins = CITY_PINS.map(
    ([x, y], i) => `<circle class="tut-city tut-city-${i + 1}" cx="${x}" cy="${y}" r="7"/>`
  ).join('');
  return `
    <circle class="tut-globe" cx="160" cy="92" r="72"/>
    <ellipse class="tut-land" cx="132" cy="70" rx="26" ry="16"/>
    <ellipse class="tut-land" cx="186" cy="96" rx="30" ry="18"/>
    <ellipse class="tut-land" cx="146" cy="126" rx="18" ry="10"/>
    <path class="tut-route" d="${route}" pathLength="100"/>
    ${pins}
  `;
}

function sceneReady(): string {
  return `
    <rect class="tut-tooth" x="131" y="94" width="22" height="46" rx="11"/>
    <rect class="tut-tooth" x="167" y="94" width="22" height="46" rx="11"/>
    <rect class="tut-tooth tut-happy" x="114" y="32" width="92" height="84" rx="34"/>
    <circle class="tut-eye" cx="143" cy="68" r="4.5"/>
    <circle class="tut-eye" cx="177" cy="68" r="4.5"/>
    <path class="tut-smile" d="M144 84 Q160 98 176 84"/>
    ${sparkle(84, 50, 1, 1.3)}${sparkle(238, 112, 2, 1.1)}${sparkle(92, 124, 3, 0.9)}
    <g class="tut-help-badge"><circle cx="240" cy="44" r="17"/><text x="240" y="52" text-anchor="middle">?</text></g>
  `;
}

const SCENES: Record<TutorialPageId, () => string> = {
  home: sceneHome,
  brush: sceneBrush,
  dive: sceneDive,
  floss: sceneFloss,
  surge: sceneSurge,
  scan: sceneScan,
  cities: sceneCities,
  ready: sceneReady,
};

export function buildTutorialSceneSvg(id: TutorialPageId): string {
  return `<svg class="tut-scene tut-scene-${id}" viewBox="0 0 320 180" aria-hidden="true" focusable="false">${SCENES[id]()}</svg>`;
}

// ---------------------------------------------------------------- the guide itself

export class TutorialOverlay {
  private backdrop: HTMLElement | null = null;
  private pageIdx: number;
  private closed = false;
  private swipeStart: { x: number; y: number; id: number } | null = null;
  private returnFocusTo: HTMLElement | null = null;
  /** A swipe that ends on the demo must not also count as a tap on it. */
  private ignoreDemoTapUntil = 0;

  private keyHandler = (e: KeyboardEvent): void => {
    if (!this.backdrop) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.go(-1);
    } else if (e.key === 'Tab') {
      const items = Array.from(this.backdrop.querySelectorAll<HTMLElement>(FOCUSABLE_SEL));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = !!active && this.backdrop.contains(active);
      if (e.shiftKey && (!inside || active === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  constructor(private readonly opts: TutorialOverlayOptions) {
    this.pageIdx = opts.startPageId ? tutorialPageIndex(opts.startPageId) : 0;
  }

  isOpen(): boolean {
    return this.backdrop !== null;
  }

  mount(root: HTMLElement): void {
    if (this.backdrop) return;
    this.returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'modal-backdrop tutorial-backdrop';
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });
    root.appendChild(this.backdrop);
    window.addEventListener('keydown', this.keyHandler, true);
    this.render();
  }

  /** Remove the guide without calling onClose (the screen under it is going away). */
  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler, true);
    this.backdrop?.remove();
    this.backdrop = null;
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    const back = this.returnFocusTo;
    this.dispose();
    this.opts.onClose();
    if (back?.isConnected) back.focus({ preventScroll: true });
  }

  private go(delta: number): void {
    const next = this.pageIdx + delta;
    if (next < 0) return;
    if (next >= TUTORIAL_PAGES.length) {
      this.close();
      return;
    }
    this.pageIdx = next;
    this.opts.onUiTap?.();
    this.render();
  }

  private replayDemo(): void {
    const stage = this.backdrop?.querySelector<HTMLElement>('#tutorial-stage');
    if (!stage || performance.now() < this.ignoreDemoTapUntil) return;
    const page = TUTORIAL_PAGES[this.pageIdx];
    // A fresh copy of the drawing starts every animation from the beginning.
    stage.innerHTML = buildTutorialSceneSvg(page.id);
    this.opts.onDemoSound?.(page.id);
  }

  private render(): void {
    if (!this.backdrop) return;
    const page = TUTORIAL_PAGES[this.pageIdx];
    const isFirst = this.pageIdx === 0;
    const isLast = this.pageIdx === TUTORIAL_PAGES.length - 1;
    const hints = tutorialControlsFor(page, this.opts.scheme);

    const hintsHtml = hints
      .map((h) => {
        const caps = (h.keys ?? [])
          .map((k) => `<kbd class="tutorial-key" data-no-translate>${escapeHtml(k)}</kbd>`)
          .join('');
        return `<span class="tutorial-hint">${caps}<span>${escapeHtml(h.label)}</span></span>`;
      })
      .join('');

    const dotsHtml = TUTORIAL_PAGES.map(
      (_, i) => `<span class="tutorial-dot${i === this.pageIdx ? ' active' : ''}"></span>`
    ).join('');

    this.backdrop.innerHTML = `
      <div class="tutorial-sheet" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" aria-describedby="tutorial-body">
        <div class="tutorial-top">
          <span class="tutorial-count" aria-hidden="true">${this.pageIdx + 1} / ${TUTORIAL_PAGES.length}</span>
          ${isLast ? '' : `<button type="button" id="btn-tutorial-skip" class="tutorial-skip">${TUTORIAL_COPY.skip}</button>`}
        </div>
        <button type="button" id="tutorial-stage" class="tutorial-stage" aria-label="${TUTORIAL_COPY.replayDemo}">
          ${buildTutorialSceneSvg(page.id)}
        </button>
        <div class="tutorial-copy" aria-live="polite">
          <h2 id="tutorial-title" class="tutorial-title">${escapeHtml(page.title)}</h2>
          <p id="tutorial-body" class="tutorial-body">${escapeHtml(page.body)}</p>
          <div class="tutorial-hints">${hintsHtml}</div>
        </div>
        <div class="tutorial-dots" aria-hidden="true">${dotsHtml}</div>
        <div class="tutorial-nav">
          <button type="button" id="btn-tutorial-back" class="btn tutorial-back" ${isFirst ? 'disabled' : ''}>${TUTORIAL_COPY.back}</button>
          <button type="button" id="btn-tutorial-next" class="btn btn-primary tutorial-next">${isLast ? TUTORIAL_COPY.done : TUTORIAL_COPY.next}</button>
        </div>
      </div>
    `;

    const sheet = this.backdrop.querySelector<HTMLElement>('.tutorial-sheet');
    this.backdrop.querySelector('#btn-tutorial-skip')?.addEventListener('click', () => this.close());
    this.backdrop.querySelector('#btn-tutorial-back')?.addEventListener('click', () => this.go(-1));
    this.backdrop.querySelector('#btn-tutorial-next')?.addEventListener('click', () => this.go(1));
    this.backdrop.querySelector('#tutorial-stage')?.addEventListener('click', () => this.replayDemo());

    // Swipe sideways to turn the page, like a photo album.
    sheet?.addEventListener('pointerdown', (e) => {
      this.swipeStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    sheet?.addEventListener('pointerup', (e) => {
      const s = this.swipeStart;
      this.swipeStart = null;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        this.ignoreDemoTapUntil = performance.now() + 400;
        this.go(dx < 0 ? 1 : -1);
      }
    });

    this.backdrop.querySelector<HTMLElement>('#btn-tutorial-next')?.focus({ preventScroll: true });
  }
}
