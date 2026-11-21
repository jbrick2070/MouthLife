/**
 * Decides when a lost WebGL context has been gone too long. `lose()` starts the clock; a
 * `restore()` in time cancels it (a generation number makes a late timer from an earlier loss
 * harmless); a timeout, or `fail()` from elsewhere, is terminal: later losses and restores are
 * ignored until the page reloads.
 */
export class ContextLossWatchdog {
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lostNow = false;
  private failedNow = false;

  constructor(
    private readonly timeoutMs: number,
    private readonly onTimeout: () => void
  ) {}

  get lost(): boolean {
    return this.lostNow;
  }

  get failed(): boolean {
    return this.failedNow;
  }

  lose(): void {
    if (this.failedNow) return;
    this.lostNow = true;
    const generation = ++this.generation;
    this.clearTimer();
    this.timer = setTimeout(() => {
      if (generation !== this.generation || !this.lostNow || this.failedNow) return;
      this.failedNow = true;
      this.timer = null;
      this.onTimeout();
    }, this.timeoutMs);
  }

  /** Returns false when it is too late: the 3D has already been given up. */
  restore(): boolean {
    if (this.failedNow) return false;
    this.lostNow = false;
    this.generation++;
    this.clearTimer();
    return true;
  }

  /** The 3D failed some other way (a shader); stop waiting. */
  fail(): void {
    this.failedNow = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
