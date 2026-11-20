/**
 * Whether the screen has been touched since the page opened.
 *
 * A touch laptop (a Surface, say) often reports its trackpad as the main pointer, so
 * `(pointer: coarse)` is false there; the first real touch says it all. The game HUD reads the same
 * signal from `InputManager.hasSeenTouch()` (also watched from page start); this copy serves screens
 * that have no InputManager, such as the How to Play guide on Home, so both choose the same controls.
 */
let seen = false;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'touch') seen = true;
    },
    { capture: true, passive: true }
  );
}

export function hasSeenTouch(): boolean {
  return seen;
}
