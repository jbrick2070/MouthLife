/**
 * The card shown when the 3D picture cannot be drawn: either no WebGL 2 renderer could be made,
 * or (terminal for this page load) a shader failed or the context never came back. Plain,
 * translated and non-punitive; the details go to the console only.
 */
export type GraphicsCardKind = 'unavailable' | 'failed';

export function graphicsCardHtml(kind: GraphicsCardKind): string {
  const body =
    kind === 'unavailable'
      ? 'MouthLife needs 3D graphics. Check that hardware acceleration is on in your browser, or try a newer device.'
      : "This device's graphics can't run MouthLife.";
  return `
    <div class="modal-backdrop graphics-failure-card" role="alertdialog" aria-modal="true" aria-labelledby="graphics-card-title">
      <div class="modal-sheet" style="text-align:center;">
        <h2 id="graphics-card-title">3D Graphics Unavailable</h2>
        <p style="color:#cbd5e1;font-size:0.88rem;">${body}</p>
        ${kind === 'failed' ? '<button type="button" class="btn-primary graphics-card-reload">Reload</button>' : ''}
      </div>
    </div>
  `;
}

let mounted: HTMLElement | null = null;

/**
 * Shows the terminal card in its own layer above the game, without touching what is mounted
 * underneath (a running 2-Min Brush keeps its timer, chimes and voice). Safe to call repeatedly.
 */
export function mountGraphicsFailureCard(): void {
  if (mounted || typeof document === 'undefined') return;
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '10000';
  host.innerHTML = graphicsCardHtml('failed');
  document.body.appendChild(host);
  mounted = host;
  const reload = host.querySelector<HTMLButtonElement>('.graphics-card-reload');
  reload?.addEventListener('click', () => window.location.reload());
  reload?.focus();
}

/** For tests only. */
export function unmountGraphicsFailureCardForTest(): void {
  mounted?.remove();
  mounted = null;
}
