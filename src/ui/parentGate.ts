/**
 * Links that leave the game wait for a grown-up: a times-table question with four answers, which a
 * young child cannot answer yet. One handler on the page catches every outside link (charity pages,
 * donations), so no link can open straight from a child's tap. The same question guards turning on
 * the fluoride rinse step (ages 6 and up). The native app does the same in CharitySheet
 * (ParentGateView).
 */

let open = false;

function isOutside(a: HTMLAnchorElement): boolean {
  try {
    const url = new URL(a.href, window.location.href);
    return /^https?:$/.test(url.protocol) && url.origin !== window.location.origin;
  } catch {
    return false;
  }
}

function showGate(href: string): void {
  askGrownUp(() => window.open(href, '_blank', 'noopener,noreferrer'));
}

/**
 * Ask the grown-up question, then run `onPass` only after the right answer (a wrong answer or
 * "Not now" just closes it). `note` is an optional line saying what the grown-up agrees to.
 */
export function askGrownUp(onPass: () => void, note?: string): void {
  if (open) return;
  open = true;
  const a = 3 + Math.floor(Math.random() * 7);
  const b = 3 + Math.floor(Math.random() * 7);
  const answer = a * b;
  const choices = new Set<number>([answer]);
  while (choices.size < 4) {
    const near = answer + (Math.floor(Math.random() * 9) - 4) * (Math.random() < 0.5 ? 1 : a);
    if (near > 0 && near !== answer) choices.add(near);
  }
  const shuffled = [...choices].sort(() => Math.random() - 0.5);
  const returnFocus = document.activeElement as HTMLElement | null;

  const shade = document.createElement('div');
  shade.className = 'parent-gate ui-interactive';
  shade.setAttribute('role', 'dialog');
  shade.setAttribute('aria-modal', 'true');
  shade.setAttribute('aria-label', 'For grown-ups');
  shade.style.cssText =
    'position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(1,6,15,0.78);';
  shade.innerHTML = `
    <div style="background:#06182a;border:1px solid rgba(94,234,212,0.4);border-radius:18px;padding:18px;max-width:320px;width:100%;text-align:center;color:#e2e8f0;font-family:inherit;">
      <div style="font-weight:800;font-size:1.05rem;margin-bottom:4px;">For grown-ups</div>
      <div data-gate-note style="font-size:0.85rem;color:#94a3b8;margin-bottom:2px;" hidden></div>
      <div style="font-size:1.6rem;font-weight:800;margin:6px 0 12px;" aria-live="polite"><span data-no-translate>${a} × ${b} = ?</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        ${shuffled.map((n) => `<button type="button" class="btn" data-answer="${n}" style="min-height:48px;font-size:1.2rem;font-weight:800;"><span data-no-translate>${n}</span></button>`).join('')}
      </div>
      <button type="button" class="btn btn-sm" data-close>Not now</button>
    </div>`;
  const noteEl = shade.querySelector<HTMLElement>('[data-gate-note]');
  if (note && noteEl) {
    noteEl.textContent = note;
    noteEl.hidden = false;
  }
  document.body.appendChild(shade);

  const close = (): void => {
    open = false;
    shade.remove();
    document.removeEventListener('keydown', onKey, true);
    returnFocus?.focus?.();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  shade.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target === shade || target.closest('[data-close]')) {
      close();
      return;
    }
    const pick = target.closest<HTMLElement>('[data-answer]');
    if (!pick) return;
    const right = Number(pick.dataset.answer) === answer;
    close();
    if (right) onPass();
  });
  shade.querySelector<HTMLButtonElement>('[data-answer]')?.focus();
}

/** Catch every outside link on the page (once, at start-up). */
export function installParentGate(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || !isOutside(a)) return;
      e.preventDefault();
      e.stopPropagation();
      showGate(a.href);
    },
    true
  );
}
