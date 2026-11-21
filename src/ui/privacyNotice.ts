/**
 * The privacy notice, inside the game: what MouthLife keeps, where, and what it never does.
 *
 * The words are the native app's (`PrivacyPolicyView` in ProfileAndSettingsSheet.swift), so both
 * editions say the same thing, and the page translator shows them in the player's language from the
 * shared translation files, which the game already has, so it works offline. The notice has no links:
 * charity pages open only from the Charity view, after the grown-up question.
 *
 * public/privacy.html keeps an English copy (names only, no links) for store listings.
 */
import { bindBottomSheetSwipeClose } from './hudHelpers';

export const PRIVACY_NOTICE_TITLE = 'Privacy Policy';
export const PRIVACY_NOTICE_BADGE = 'Zero Sign-Up • Zero Tracking • 100% On-Device';
export const PRIVACY_NOTICE_EFFECTIVE = 'Effective November 2026';
export const PRIVACY_NOTICE_DONE = 'Done';
/** The Sync sheet's button (native: a lock and "Privacy Policy"). */
export const PRIVACY_NOTICE_BUTTON_LABEL = '🔒 Privacy Policy';

/** Heading and text of each section, in the native app's order and words. */
export const PRIVACY_NOTICE_SECTIONS: readonly (readonly [heading: string, body: string])[] = [
  [
    'No personal data',
    'MouthLife does not collect, send, rent or sell any personal data, analytics, device identifiers, location or usage data. There are no accounts, no tracking and no advertising.',
  ],
  [
    'Everything stays on this device',
    'Progress, Habit Stamps and settings are saved only on this device. A Sync Code or backup file is made on the device, and only you can copy it to your other devices. You can erase all saved data at any time in Settings. On iPhone, a grown-up can choose to save each brush to Apple Health; MouthLife never reads health data.',
  ],
  [
    'Not medical advice',
    'MouthLife is an educational game and a 2-minute brushing timer. It is not a substitute for advice, diagnosis or treatment from a dentist. Ask a dentist or dental hygienist about your oral health.',
  ],
  [
    'Charity links',
    'The charity pages are optional and open only after a grown-up answers a question. MouthLife is not affiliated with these charities, takes no fee and never handles donations; each website has its own policies.',
  ],
];

const TRIGGER_ATTR = 'data-open-privacy-notice';
const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function escapeHtml(raw: string): string {
  return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The notice's markup: a title with a Done button, the sections, and the date. No links. */
export function buildPrivacyNoticeHtml(): string {
  const sections = PRIVACY_NOTICE_SECTIONS.map(
    ([heading, body]) => `
      <section style="margin:0 0 12px 0;">
        <h4 style="margin:0 0 4px 0;font-size:0.92rem;color:#ffffff;">${escapeHtml(heading)}</h4>
        <p style="margin:0;font-size:0.82rem;line-height:1.45;color:#cbd5e1;">${escapeHtml(body)}</p>
      </section>`
  ).join('');
  return `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="privacy-notice-title">
      <div class="row-between modal-header-sticky" style="margin-bottom:10px;">
        <h3 id="privacy-notice-title" style="margin:0;font-size:1rem;">${escapeHtml(PRIVACY_NOTICE_TITLE)}</h3>
        <button type="button" class="btn btn-sm btn-primary" data-privacy-done>${escapeHtml(PRIVACY_NOTICE_DONE)}</button>
      </div>
      <p style="margin:0 0 12px 0;font-size:0.76rem;font-weight:700;color:#5eead4;">${escapeHtml(PRIVACY_NOTICE_BADGE)}</p>
      ${sections}
      <p style="margin:0;font-size:0.7rem;color:#94a3b8;">${escapeHtml(PRIVACY_NOTICE_EFFECTIVE)}</p>
    </div>`;
}

let openShade: HTMLElement | null = null;

/** Shows the notice above everything; Done, Escape, a tap outside or a swipe down closes it. */
export function openPrivacyNotice(opener?: HTMLElement | null): void {
  if (openShade || typeof document === 'undefined') return;
  const shade = document.createElement('div');
  shade.className = 'modal-backdrop ui-interactive privacy-notice';
  // Above the game's own sheets (inside #ui-root), below the grown-up question.
  shade.style.zIndex = '150';
  shade.innerHTML = buildPrivacyNoticeHtml();
  const sheet = shade.querySelector<HTMLElement>('.modal-sheet');
  const done = shade.querySelector<HTMLButtonElement>('[data-privacy-done]');

  const close = (): void => {
    if (openShade !== shade) return;
    openShade = null;
    window.removeEventListener('keydown', onKey, true);
    shade.remove();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
  // Window, capture phase: runs before the Home screen's own keys, so Escape closes only this notice
  // and Tab stays inside it instead of jumping back to the sheet underneath.
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) close();
      return;
    }
    if (e.key !== 'Tab' || !sheet) return;
    e.stopPropagation();
    const items = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const atEdge = e.shiftKey ? active === first : active === last;
    if (!active || !sheet.contains(active) || atEdge) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  };

  shade.addEventListener('click', (e) => {
    if (e.target === shade) close();
  });
  done?.addEventListener('click', close);
  bindBottomSheetSwipeClose(shade.querySelector<HTMLElement>('.modal-header-sticky'), sheet, close);
  window.addEventListener('keydown', onKey, true);
  document.body.appendChild(shade);
  openShade = shade;
  done?.focus({ preventScroll: true });
}

let triggerInstalled = false;

/** One listener for every notice button (capture phase: the game's sheets stop click bubbling). */
function installTrigger(): void {
  if (triggerInstalled || typeof document === 'undefined') return;
  triggerInstalled = true;
  document.addEventListener(
    'click',
    (e) => {
      const button = (e.target as Element | null)?.closest?.(`[${TRIGGER_ATTR}]`) as HTMLElement | null;
      if (button) openPrivacyNotice(button);
    },
    true
  );
}

/** The button that opens the notice, for a screen's markup. */
export function privacyNoticeButtonHtml(): string {
  installTrigger();
  return `<button type="button" class="btn btn-sm" ${TRIGGER_ATTR}>${escapeHtml(PRIVACY_NOTICE_BUTTON_LABEL)}</button>`;
}
