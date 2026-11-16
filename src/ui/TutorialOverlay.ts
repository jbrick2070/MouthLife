import {
  TUTORIAL_BUTTON_KEYS,
  TUTORIAL_COPY,
  TUTORIAL_PAGES,
  tutorialControlsFor,
  tutorialPageIndex,
  type TutorialButtonAction,
  type TutorialInputScheme,
  type TutorialPage,
  type TutorialPageId,
} from '../config/tutorial';

/**
 * The How to Play guide: one card at a time.
 *
 * Most cards show real pictures of the game, photographed from the running game and played one
 * after another like a flipbook (`src/assets/guide/`). Two cards are field guides: a real close-up
 * of each thing on the tooth, its name, and what to do about it. One card shows the controls for
 * the device in use. Tapping a flipbook plays it again with that control's own game sound, and
 * Reduced Motion holds every picture still.
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

/** Picture name (no extension) to the address the page can load it from. */
const IMAGE_URLS: Record<string, string> = (() => {
  const found = import.meta.glob('../assets/guide/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<
    string,
    string
  >;
  const byName: Record<string, string> = {};
  for (const [path, url] of Object.entries(found)) {
    const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.jpg$/, '');
    byName[name] = url;
  }
  return byName;
})();

export function tutorialImageUrl(name: string): string | undefined {
  return IMAGE_URLS[name];
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------- pictures

/** Real game frames stacked on top of each other; CSS shows them in turn. */
function flipbookHtml(frames: readonly string[]): string {
  const n = Math.min(frames.length, 3);
  // With motion off, the middle frame is the one that shows the action itself.
  const still = n >= 3 ? 1 : n - 1;
  const imgs = frames
    .slice(0, n)
    .map((name, i) => {
      const url = tutorialImageUrl(name) ?? '';
      return `<img class="tut-frame tut-frame-${i + 1}${i === still ? ' tut-still' : ''}" src="${escapeHtml(url)}" alt="" draggable="false" decoding="async">`;
    })
    .join('');
  return `<span class="tut-flipbook tut-flip-${n}">${imgs}</span>`;
}

const SPARKLE = 'M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8 Z';

function sparkle(x: number, y: number, n: number, scale = 1): string {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path class="tut-sparkle tut-sparkle-${n}" d="${SPARKLE}"/></g>`;
}

/** The closing card is the one drawing: a happy tooth, and the ? that brings the guide back. */
function readySceneSvg(): string {
  return `<svg class="tut-scene tut-scene-ready" viewBox="0 0 320 180" aria-hidden="true" focusable="false">
    <rect class="tut-tooth" x="131" y="94" width="22" height="46" rx="11"/>
    <rect class="tut-tooth" x="167" y="94" width="22" height="46" rx="11"/>
    <rect class="tut-tooth" x="114" y="32" width="92" height="84" rx="34"/>
    <circle class="tut-eye" cx="143" cy="68" r="4.5"/>
    <circle class="tut-eye" cx="177" cy="68" r="4.5"/>
    <path class="tut-smile" d="M144 84 Q160 98 176 84"/>
    ${sparkle(84, 50, 1, 1.3)}${sparkle(238, 112, 2, 1.1)}${sparkle(92, 124, 3, 0.9)}
    <g class="tut-help-badge"><circle cx="240" cy="44" r="17"/><text x="240" y="52" text-anchor="middle">?</text></g>
  </svg>`;
}

/** What fills the picture area of a flipbook or drawing card. */
export function buildTutorialStageHtml(page: TutorialPage): string {
  return page.frames.length > 0 ? flipbookHtml(page.frames) : readySceneSvg();
}

// ---------------------------------------------------------------- field guides and controls

function keycapsHtml(keys: readonly string[]): string {
  return keys.map((k) => `<kbd class="tutorial-key" data-no-translate>${escapeHtml(k)}</kbd>`).join('');
}

/** A small copy of the real on-screen button, for players who tap or click. */
function buttonReplicaHtml(action: TutorialButtonAction): string {
  if (action === 'move') return '<span class="tut-btn tut-btn-pad"><span class="tut-btn-knob"></span></span>';
  if (action === 'floss') return '<span class="tut-btn tut-btn-floss">🧵</span>';
  if (action === 'surge') return '<span class="tut-btn tut-btn-pill">🌊</span>';
  if (action === 'scan') return '<span class="tut-btn tut-btn-pill">🔍</span>';
  return '<span class="tut-btn tut-btn-pill">⏸</span>';
}

function rowsHtml(page: TutorialPage, scheme: TutorialInputScheme): string {
  if (page.buttonRows) {
    const keys = scheme === 'keys' || scheme === 'pad' ? TUTORIAL_BUTTON_KEYS[scheme] : null;
    return page.buttonRows
      .map((row) => {
        const picture = keys
          ? `<span class="tutorial-row-keys">${keycapsHtml(keys[row.action])}</span>`
          : `<span class="tutorial-row-pic">${buttonReplicaHtml(row.action)}</span>`;
        return `<li class="tutorial-row${keys ? ' tutorial-row-keyed' : ''}">${picture}<span class="tutorial-row-text"><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.tip)}</span></span></li>`;
      })
      .join('');
  }
  return (page.rows ?? [])
    .map((row) => {
      const url = tutorialImageUrl(row.image) ?? '';
      return `<li class="tutorial-row"><span class="tutorial-row-pic"><img class="tutorial-thumb" src="${escapeHtml(url)}" alt="" draggable="false" decoding="async"></span><span class="tutorial-row-text"><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.tip)}</span></span></li>`;
    })
    .join('');
}

/** True for the cards that are a list (field guides, controls) rather than one big picture. */
export function isTutorialListPage(page: TutorialPage): boolean {
  return Boolean(page.rows || page.buttonRows);
}

export function buildTutorialRowsHtml(page: TutorialPage, scheme: TutorialInputScheme): string {
  return rowsHtml(page, scheme);
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
    // A fresh copy of the pictures starts the flipbook from its first frame.
    stage.innerHTML = buildTutorialStageHtml(page);
    this.opts.onDemoSound?.(page.id);
  }

  private render(): void {
    if (!this.backdrop) return;
    const page = TUTORIAL_PAGES[this.pageIdx];
    const isFirst = this.pageIdx === 0;
    const isLast = this.pageIdx === TUTORIAL_PAGES.length - 1;
    const isList = isTutorialListPage(page);
    const hints = tutorialControlsFor(page, this.opts.scheme);

    const hintsHtml = hints
      .map((h) => `<span class="tutorial-hint">${keycapsHtml(h.keys ?? [])}<span>${escapeHtml(h.label)}</span></span>`)
      .join('');

    const dotsHtml = TUTORIAL_PAGES.map(
      (_, i) => `<span class="tutorial-dot${i === this.pageIdx ? ' active' : ''}"></span>`
    ).join('');

    const pictureHtml = isList
      ? `<ul class="tutorial-rows">${rowsHtml(page, this.opts.scheme)}</ul>`
      : `<button type="button" id="tutorial-stage" class="tutorial-stage" aria-label="${TUTORIAL_COPY.replayDemo}">
          ${buildTutorialStageHtml(page)}
        </button>`;

    this.backdrop.innerHTML = `
      <div class="tutorial-sheet${isList ? ' tutorial-sheet-list' : ''}" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" aria-describedby="tutorial-body">
        <div class="tutorial-top">
          <span class="tutorial-count" aria-hidden="true">${this.pageIdx + 1} / ${TUTORIAL_PAGES.length}</span>
          ${isLast ? '' : `<button type="button" id="btn-tutorial-skip" class="tutorial-skip">${TUTORIAL_COPY.skip}</button>`}
        </div>
        ${isList ? '' : pictureHtml}
        <div class="tutorial-copy" aria-live="polite">
          <h2 id="tutorial-title" class="tutorial-title">${escapeHtml(page.title)}</h2>
          <p id="tutorial-body" class="tutorial-body">${escapeHtml(page.body)}</p>
          ${isList ? '' : `<div class="tutorial-hints">${hintsHtml}</div>`}
        </div>
        ${isList ? pictureHtml : ''}
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
