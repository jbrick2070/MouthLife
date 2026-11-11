import { DisposerBag } from '../engine/EventBus';
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
    title: 'Hydroxyapatite: Harder Than Iron, Halfway to Diamond',
    body: 'Tap any mineral below to compare: mature human tooth enamel is 96% hexagonal Hydroxyapatite crystal — ranking 5.0 on the Mohs scale, outranking pure gold (2.5) and structural iron (4.0)!',
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
    }
  ) {}

  mount(root: HTMLElement): void {
    this.beatIndex = 0;
    this.selectedMohsIdx = 2;
    this.container = document.createElement('div');
    this.container.className = 'hub-shell';
    root.appendChild(this.container);
    this.callbacks.onBeatChanged(0);
    this.render();
  }

  private render(): void {
    if (!this.container) return;
    const beat = COSMIC_BEATS[this.beatIndex];
    const isLast = this.beatIndex === COSMIC_BEATS.length - 1;
    const mohsActive = MOHS_SPECIMENS[this.selectedMohsIdx];

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
          >
            <div style="font-size:0.86rem;font-weight:800;color:${m.isEnamel ? '#5eead4' : '#e0f2fe'}">${m.hardness}</div>
            <div style="font-size:0.66rem;font-weight:600;margin-top:2px;">${m.name}</div>
          </button>
        `
        ).join('')}
      </div>
      <div style="font-size:0.76rem;color:#bae6fd;background:rgba(4,16,28,0.68);padding:7px 10px;border-radius:10px;border:1px solid rgba(56,189,248,0.24);">
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
      <div class="hub-top-bar glass-card ui-interactive row-between">
        <div class="row-wrap">
          <span style="font-weight:800;font-size:0.86rem;letter-spacing:0.03em;color:#5eead4;">✦ COSMIC ENAMEL ORIGINS</span>
          <span class="pill-badge">Drag 3D Crystal to Inspect</span>
        </div>
        <div class="row-wrap">
          <button type="button" id="btn-cosmic-mute" class="btn btn-sm" aria-label="Toggle Sound">
            ${this.callbacks.isMuted() ? '🔇' : '🔊'}
          </button>
          <button type="button" id="btn-skip-cosmic" class="btn btn-sm">Skip Intro →</button>
        </div>
      </div>

      <div class="hub-center-callout"></div>

      <div class="cosmic-card glass-card ui-interactive">
        <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.08em;color:#38bdf8;margin-bottom:4px;">
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

        <div class="row-between" style="margin-top:12px;">
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

    this.container.querySelectorAll<HTMLButtonElement>('[data-mohs-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedMohsIdx = Number(btn.dataset.mohsIdx ?? 2);
        this.callbacks.onMohsSelected?.(this.selectedMohsIdx);
        this.render();
      });
    });
  }

  dispose(): void {
    this.disposers.disposeAll();
    this.container?.remove();
    this.container = null;
  }
}
