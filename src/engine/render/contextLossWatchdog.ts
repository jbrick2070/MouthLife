/**
 * Decides when a lost WebGL context has been gone too long. `lose()` starts the clock; a
 * `restore()` in time cancels it (a generation number makes a late timer from an earlier loss
 * harmless); a timeout, or `fail()` from elsewhere, is terminal: later losses and restores are
 * ignored until the page reloads.
 *
 * Only time with the page in view counts. A phone may drop the 3D picture while the game is in
 * the background and give it back only when the player returns, so a wait that ran out behind a
 * locked screen would put up the "graphics failed" card for a picture that was about to come
 * back. While the page is hidden no timer runs at all; `visibilityChanged()` starts a full wait
 * again when the page is shown and the picture is still missing.
 */
export class ContextLossWatchdog {
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lostNow = false;
  private failedNow = false;

  constructor(
    private readonly timeoutMs: number,
    private readonly onTimeout: () => void,
    /** True while the page cannot be seen (another tab, another app, a locked phone). */
    private readonly isHidden: () => boolean = () => false
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
    this.startWait();
  }

  /**
   * The page was hidden or shown. Hidden: the wait stops. Shown: if the picture is still lost, a
   * full wait starts from the beginning, however long the page was away.
   */
  visibilityChanged(): void {
    if (this.lostNow && !this.failedNow) this.startWait();
  }

  private startWait(): void {
    const generation = ++this.generation;
    this.clearTimer();
    if (this.isHidden()) return;
    this.timer = setTimeout(() => {
      if (generation !== this.generation || !this.lostNow || this.failedNow) return;
      this.timer = null;
      // A phone can freeze a page before telling it that it was hidden; the overdue timer then
      // runs as the page wakes. Do not give up here: being shown starts the wait again.
      if (this.isHidden()) return;
      this.failedNow = true;
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
