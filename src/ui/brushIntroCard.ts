/**
 * The one-time card before a device's first 2-Min Brush: it says plainly that the timer is for
 * brushing your real teeth, and pictures the tools the ritual will use. Its Start tap begins the
 * ritual exactly as the Home button does (so Safari's motion permission is still asked from a
 * tap); later brushes never see it. Native twin: `BrushIntroSheet` in `HubSheets.swift`.
 */
const guidePictures = import.meta.glob('../assets/guide/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function guide(name: string): string {
  return guidePictures[`../assets/guide/${name}.jpg`] ?? '';
}

export interface BrushIntroCardOptions {
  /** Whether the rinse step is on right now (the card pictures it only then). */
  includeRinse: boolean;
  /** Runs synchronously inside the Start tap. */
  onStart: () => void;
  onBack?: () => void;
}

let open: HTMLElement | null = null;

export function brushIntroCardHtml(includeRinse: boolean): string {
  const tool = (src: string, label: string) =>
    src
      ? `<figure class="brush-intro-tool"><img src="${src}" alt="" /><figcaption>${label}</figcaption></figure>`
      : `<figure class="brush-intro-tool"><figcaption>${label}</figcaption></figure>`;
  return `
    <div class="modal-backdrop brush-intro-card" role="dialog" aria-modal="true" aria-labelledby="brush-intro-title">
      <div class="modal-sheet" style="text-align:center;">
        <h2 id="brush-intro-title">Time Your Real Brush</h2>
        <p style="color:#cbd5e1;font-size:0.9rem;">Brush your real teeth at the sink for 2 minutes. Follow the glow, then floss and rinse.</p>
        <div class="brush-intro-tools">
          ${tool(guide('brush-1'), 'Toothbrush')}
          ${tool(guide('floss-1'), 'Floss pick')}
          ${includeRinse ? `<figure class="brush-intro-tool"><div class="brush-intro-drop" aria-hidden="true">💧</div><figcaption>Rinse</figcaption></figure>` : ''}
        </div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;">
          <button type="button" class="btn brush-intro-back">Back</button>
          <button type="button" class="btn btn-primary brush-intro-start">Start 2-Min Brush</button>
        </div>
      </div>
    </div>
  `;
}

/** Opens the card in its own layer above Home. Calling it again while it is open does nothing. */
export function showBrushIntroCard(opts: BrushIntroCardOptions): void {
  if (open || typeof document === 'undefined') return;
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '9000';
  host.innerHTML = brushIntroCardHtml(opts.includeRinse);
  document.body.appendChild(host);
  open = host;
  const close = () => {
    host.remove();
    if (open === host) open = null;
  };
  const start = host.querySelector<HTMLButtonElement>('.brush-intro-start');
  start?.addEventListener('click', () => {
    if (start.disabled) return;
    start.disabled = true; // one ritual per card, however fast the taps
    close();
    opts.onStart();
  });
  host.querySelector('.brush-intro-back')?.addEventListener('click', () => {
    close();
    opts.onBack?.();
  });
  start?.focus();
}

/** For tests only. */
export function closeBrushIntroCardForTest(): void {
  open?.remove();
  open = null;
}
