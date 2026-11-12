import { DisposerBag, type EventBus } from '../engine/EventBus';
import type { OverlayView } from '../engine/types';

interface MohsEntry {
  hardness: string;
  name: string;
  formula: string;
  note: string;
  isEnamel?: boolean;
}

const MOHS_SPECIMENS: readonly MohsEntry[] = [
  {
    hardness: '2.5',
    name: 'Pure Gold',
    formula: 'Au',
    note: 'Soft noble metal (Mohs 2.5): easily scratched by a copper coin — half the hardness of your tooth enamel!',
  },
  {
    hardness: '4.0',
    name: 'Iron / Mild Steel',
    formula: 'Fe',
    note: 'Structural iron & nails rank ~4.0–4.5 on the Mohs scale — human tooth enamel (5.0) is literally harder than iron!',
  },
  {
    hardness: '5.0',
    name: 'Tooth Enamel',
    formula: 'Ca₁₀(PO₄)₆(OH)₂',
    note: '96% pure crystalline Hydroxyapatite nanorods woven by ameloblasts — the hardest substance in the human body!',
    isEnamel: true,
  },
  {
    hardness: '7.0',
    name: 'Crystalline Quartz',
    formula: 'SiO₂',
    note: 'Silicate mineral (Mohs 7.0): harder than enamel, which is why abrasive silica pastes must be finely rounded.',
  },
  {
    hardness: '10.0',
    name: 'Diamond',
    formula: 'C (sp³)',
    note: 'Covalent carbon lattice (Mohs 10.0): nature’s hardest crystal — yet enamel reaches halfway up the Mohs scale!',
  },
];

interface BeatSpec {
  tag: string;
  title: string;
  body: string;
}

const COSMIC_BEATS: readonly BeatSpec[] = [
  {
    tag: 'PROLOGUE 1 / 4 • STELLAR NUCLEOSYNTHESIS',
    title: 'Your Smile Was Forged Inside Dying Stars',
    body: 'Billions of years before Earth existed, massive stars and supernovae fused Calcium (²⁰Ca), Phosphorus (¹⁵P), Oxygen (⁸O), and trace Fluoride (⁹F). Today, specialized ameloblast cells weave those exact cosmic atoms into living crystal.',
  },
  {
    tag: 'PROLOGUE 2 / 4 • ATOMIC CRYSTALLOGRAPHY',
    title: 'How Hard Is Tooth Enamel?',
    body: 'Enamel ranks 5. Compare the specimens.',
  },
  {
    tag: 'PROLOGUE 3 / 4 • THE BIOPHYSICAL PARADOX',
    title: 'Why Can Tiny Microbes Dissolve Crystal Harder Than Steel?',
    body: 'Mechanical hardness cannot stop acid chemistry! Below pH 5.5, bacterial lactic acid strips calcium & phosphate out of enamel — unless Fluoride (⁹F) locks into the lattice to form Fluorapatite (acid-shielded down to pH 4.5).',
  },
  {
    tag: 'PROLOGUE 4 / 4 • EARTHRISE TO MICRO-UNIVERSE',
    title: 'Welcome to MouthLife: The Plaque Dimension',
    body: 'Zoom from orbit into real human cities and dental history — bask in the mirror-smooth joy of clean brushed, flossed, and fluoride-sealed teeth daily, and guard against the Dreaded Root Canal!',
  },
];

/**
 * After the overlay re-renders, pick the control that should keep focus (pure, unit-testable).
 * Falls back to the beat's primary action when the previously focused control disappeared.
 */
export function resolveFocusSelector(
  prev: { id?: string; mohsIdx?: string },
  exists: (selector: string) => boolean
): string | null {
  const candidates: string[] = [];
  if (prev.mohsIdx !== undefined) candidates.push(`[data-mohs-idx="${prev.mohsIdx}"]`);
  if (prev.id) candidates.push(`#${prev.id}`);
  candidates.push('#btn-next-beat', '#btn-finish-cosmic');
  return candidates.find(exists) ?? null;
}

export class CosmicIntroOverlay implements OverlayView {
  private disposers = new DisposerBag();
  private beatIndex = 0;
  private selectedMohsIdx = 2; // Default highlight on Tooth Enamel (5.0)
  private container: HTMLElement | null = null;

  constructor(
    private readonly callbacks: {
      onBeatChanged: (beatIdx: number) => void;
      onMohsSelected?: (mohsIdx: number) => void;
      onFinishOrSkip: () => void;
      isMuted: () => boolean;
      onToggleMute: () => void;
      bus?: EventBus;
    }
  ) {}

  private keyHandler = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowRight') {
      if (this.beatIndex < COSMIC_BEATS.length - 1) {
        this.beatIndex++;
        this.callbacks.onBeatChanged(this.beatIndex);
        this.render();
      } else {
        this.callbacks.onFinishOrSkip();
      }
    } else if (e.key === 'ArrowLeft' && this.beatIndex > 0) {
      this.beatIndex--;
      this.callbacks.onBeatChanged(this.beatIndex);
      this.render();
    } else if (e.key === 'Escape') {
      this.callbacks.onFinishOrSkip();
    }
  };

  private syncMuteUi(): void {
    const btn = this.container?.querySelector<HTMLButtonElement>('#btn-cosmic-mute');
    if (!btn) return;
    const muted = this.callbacks.isMuted();
    btn.textContent = muted ? '🔇' : '🔊';
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }

  mount(root: HTMLElement): void {
    this.beatIndex = 0;
    this.selectedMohsIdx = 2;
    this.container = document.createElement('div');
    this.container.className = 'hub-shell cosmic-intro-shell';
    root.appendChild(this.container);
    window.addEventListener('keydown', this.keyHandler);
    if (this.callbacks.bus) {
      this.disposers.add(this.callbacks.bus.on('audio:changed', () => this.syncMuteUi()));
    }
    this.callbacks.onBeatChanged(0);
    this.renderMarkup();
    // Keyboard players start on the primary action instead of an unfocused page.
    requestAnimationFrame(() =>
      this.container?.querySelector<HTMLElement>('#btn-next-beat')?.focus({ preventScroll: true })
    );
  }

  private render(): void {
    if (!this.container) return;
    const prevEl = document.activeElement as HTMLElement | null;
    const hadFocus = !!prevEl && this.container.contains(prevEl);
    const prev = { id: prevEl?.id || undefined, mohsIdx: prevEl?.dataset?.mohsIdx };
    this.renderMarkup();
    if (hadFocus) {
      const sel = resolveFocusSelector(prev, (q) => !!this.container?.querySelector(q));
      if (sel) this.container.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
    }
  }

  private renderMarkup(): void {
    if (!this.container) return;
    const beat = COSMIC_BEATS[this.beatIndex];
    const isLast = this.beatIndex === COSMIC_BEATS.length - 1;
    const mohsActive = MOHS_SPECIMENS[this.selectedMohsIdx];
    this.container.classList.toggle('cosmic-mohs', this.beatIndex === 1);

    const mohsHtml =
      this.beatIndex === 1
        ? `
      <div class="mohs-bar">
        ${MOHS_SPECIMENS.map(
          (m, idx) => `
          <button
            type="button"
            class="mohs-item ${m.isEnamel ? 'enamel-hero' : ''} ${idx === this.selectedMohsIdx ? 'selected' : ''}"
            data-mohs-idx="${idx}"
            aria-pressed="${idx === this.selectedMohsIdx ? 'true' : 'false'}"
            aria-label="Mohs ${m.hardness} ${m.name}"
          >
            <div style="font-size:0.86rem;font-weight:800;color:${m.isEnamel ? '#5eead4' : '#e0f2fe'}">${m.hardness}</div>
            <div style="font-size:0.66rem;font-weight:600;margin-top:2px;">${m.name}</div>
          </button>
        `
        ).join('')}
      </div>
      <div id="mohs-detail" role="status" aria-live="polite" style="font-size:0.76rem;color:#bae6fd;background:rgba(4,16,28,0.68);padding:7px 10px;border-radius:10px;border:1px solid rgba(56,189,248,0.24);">
        <strong>${mohsActive.name} (${mohsActive.formula}):</strong> ${mohsActive.note}
      </div>
    `
        : '';

    const elementBadges =
      this.beatIndex === 0
        ? `
      <div class="row-wrap" style="margin-top:6px;">
        <span class="pill-badge" style="border-color:#fde68a;color:#fef08a;">²⁰Ca Calcium</span>
        <span class="pill-badge" style="border-color:#c084fc;color:#e9d5ff;">¹⁵P Phosphorus</span>
        <span class="pill-badge" style="border-color:#38bdf8;color:#bae6fd;">⁸O Oxygen</span>
        <span class="pill-badge" style="border-color:#2dd4bf;color:#99f6e4;">⁹F Fluoride</span>
      </div>
    `
        : this.beatIndex === 2
          ? `
      <div class="row-wrap" style="margin-top:6px;">
        <span class="pill-badge" style="border-color:#fb7185;color:#fecdd3;">Hydroxyapatite Critical: pH 5.5</span>
        <span class="pill-badge" style="border-color:#2dd4bf;color:#99f6e4;">⁹F Fluorapatite Shield: pH 4.5</span>
      </div>
    `
          : '';

    this.container.innerHTML = `
      <div class="hub-top-bar cosmic-top-bar glass-card ui-interactive row-between">
        <div class="row-wrap" style="min-width:0;flex-wrap:nowrap;">
          <span style="font-weight:800;font-size:0.84rem;letter-spacing:0.03em;color:#5eead4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">✦ COSMIC ENAMEL</span>
          <span class="pill-badge cosmic-inspect-badge">Drag 3D Crystal to Inspect</span>
        </div>
        <div class="row-wrap" style="flex-wrap:nowrap;flex-shrink:0;">
          <button
            type="button"
            id="btn-cosmic-mute"
            class="btn btn-sm btn-icon"
            aria-label="Toggle Sound (M)"
            aria-pressed="${this.callbacks.isMuted() ? 'true' : 'false'}"
            title="Mute / Unmute (M)"
          >
            ${this.callbacks.isMuted() ? '🔇' : '🔊'}
          </button>
          <button type="button" id="btn-skip-cosmic" class="btn btn-sm">Skip →</button>
        </div>
      </div>

      <div class="hub-center-callout"></div>

      <div class="cosmic-card glass-card ui-interactive">
        <div class="cosmic-beat-copy">
        <div class="cosmic-beat-tag" style="font-size:0.68rem;font-weight:700;letter-spacing:0.08em;color:#38bdf8;margin-bottom:4px;">
          ${beat.tag}
        </div>
        <h2 style="margin:0 0 6px 0;font-size:1.12rem;line-height:1.25;color:#ffffff;">
          ${beat.title}
        </h2>
        <p style="margin:0;font-size:0.83rem;line-height:1.45;color:#cbd5e1;">
          ${beat.body}
        </p>
        ${elementBadges}
        ${mohsHtml}
        </div>

        <div class="row-between cosmic-beat-actions" style="margin-top:12px;">
          <button
            type="button"
            id="btn-prev-beat"
            class="btn btn-sm"
            ${this.beatIndex === 0 ? 'disabled style="opacity:0.4;pointer-events:none;"' : ''}
          >
            ← Back
          </button>
          <div class="row-wrap">
            ${COSMIC_BEATS.map(
              (_, i) =>
                `<span style="width:8px;height:8px;border-radius:50%;background:${i === this.beatIndex ? '#2dd4bf' : 'rgba(255,255,255,0.22)'};display:inline-block;"></span>`
            ).join('')}
          </div>
          <button
            type="button"
            id="${isLast ? 'btn-finish-cosmic' : 'btn-next-beat'}"
            class="btn btn-primary"
          >
            ${isLast ? 'Enter MouthLife ✦' : 'Next Beat →'}
          </button>
        </div>
      </div>
    `;

    this.container.querySelector('#btn-cosmic-mute')?.addEventListener('click', () => {
      this.callbacks.onToggleMute();
      this.render();
    });

    this.container
      .querySelector('#btn-skip-cosmic')
      ?.addEventListener('click', () => this.callbacks.onFinishOrSkip());

    this.container.querySelector('#btn-prev-beat')?.addEventListener('click', () => {
      if (this.beatIndex > 0) {
        this.beatIndex--;
        this.callbacks.onBeatChanged(this.beatIndex);
        this.render();
      }
    });

    this.container.querySelector('#btn-next-beat')?.addEventListener('click', () => {
      if (this.beatIndex < COSMIC_BEATS.length - 1) {
        this.beatIndex++;
        this.callbacks.onBeatChanged(this.beatIndex);
        this.render();
      }
    });

    this.container
      .querySelector('#btn-finish-cosmic')
      ?.addEventListener('click', () => this.callbacks.onFinishOrSkip());

    const specimenButtons = this.container.querySelectorAll<HTMLButtonElement>('[data-mohs-idx]');
    const specimenDetail = this.container.querySelector('#mohs-detail');
    specimenButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedMohsIdx = Number(btn.dataset.mohsIdx ?? 2);
        this.callbacks.onMohsSelected?.(this.selectedMohsIdx);
        for (const specimen of specimenButtons) {
          const selected = specimen === btn;
          specimen.classList.toggle('selected', selected);
          specimen.setAttribute('aria-pressed', String(selected));
        }
        const mineral = MOHS_SPECIMENS[this.selectedMohsIdx];
        if (specimenDetail) {
          const name = document.createElement('strong');
          name.textContent = `${mineral.name} (${mineral.formula}):`;
          specimenDetail.replaceChildren(name, ` ${mineral.note}`);
        }
      });
    });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
    this.disposers.disposeAll();
    this.container?.remove();
    this.container = null;
  }
}
