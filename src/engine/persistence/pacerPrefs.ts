/**
 * Grown-up choices for the brushing timer. They live outside the save (like the floss tool and
 * rinse length), under the same names the native app uses.
 */

/** Whether the fluoride rinse step follows brushing and flossing. On unless a grown-up turns it off. */
export const INCLUDE_RINSE_KEY = 'mouthlife.pacer.includeRinse';

/** The last choice made on this page, for when storage is blocked. */
let thisVisit: boolean | null = null;

export function readIncludeRinse(): boolean {
  try {
    const stored = window.localStorage.getItem(INCLUDE_RINSE_KEY);
    return stored === null ? (thisVisit ?? true) : stored !== '0';
  } catch {
    return thisVisit ?? true;
  }
}

export function writeIncludeRinse(on: boolean): void {
  thisVisit = on;
  try {
    window.localStorage.setItem(INCLUDE_RINSE_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}
