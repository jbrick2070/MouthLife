/**
 * iPhone Safari lets a page read the phone's tilt only after asking, and the ask must come from a
 * tap (M21). The rinse's tilt gauge is an extra: whatever the answer, or with no motion sensor at
 * all, the timed ritual runs on and the gauge shows its resting swish.
 */
type MotionEventWithPermission = { requestPermission?: () => Promise<'granted' | 'denied' | string> };

/** Asks once per tap, only where the browser needs asking. Must be called inside a tap handler. */
export function requestMotionPermissionIfNeeded(): void {
  const DME = (globalThis as { DeviceMotionEvent?: MotionEventWithPermission }).DeviceMotionEvent;
  if (!DME || typeof DME.requestPermission !== 'function') return;
  try {
    void DME.requestPermission().catch(() => {});
  } catch {
    // Not asked (not a tap, or blocked): the gauge keeps its resting swish.
  }
}
