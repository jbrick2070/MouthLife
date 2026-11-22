import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContextLossWatchdog } from '../src/engine/render/contextLossWatchdog';
import { graphicsCardHtml } from '../src/ui/graphicsFailureCard';

const root = join(__dirname, '..');

describe('ContextLossWatchdog', () => {
  afterEach(() => vi.useRealTimers());

  it('does nothing when the context comes back in time', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const w = new ContextLossWatchdog(10_000, onTimeout);
    w.lose();
    vi.advanceTimersByTime(9_000);
    expect(w.restore()).toBe(true);
    vi.advanceTimersByTime(5_000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(w.lost).toBe(false);
    expect(w.failed).toBe(false);
  });

  it('gives up once after 10 s, and then ignores a late restore and further losses', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const w = new ContextLossWatchdog(10_000, onTimeout);
    w.lose();
    vi.advanceTimersByTime(10_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(w.failed).toBe(true);
    expect(w.restore()).toBe(false);
    w.lose();
    vi.advanceTimersByTime(20_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('a timer from an earlier loss cannot fire after a restore and a new loss', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const w = new ContextLossWatchdog(10_000, onTimeout);
    w.lose();
    vi.advanceTimersByTime(8_000);
    w.restore();
    w.lose();
    vi.advanceTimersByTime(8_000); // 16 s after the first loss, 8 s after the second
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('stops waiting when the 3D fails another way', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const w = new ContextLossWatchdog(10_000, onTimeout);
    w.lose();
    w.fail();
    vi.advanceTimersByTime(20_000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(w.restore()).toBe(false);
  });
});

describe('ContextLossWatchdog: only time with the page in view counts', () => {
  afterEach(() => vi.useRealTimers());

  /** A page that can be hidden and shown, telling the watchdog each time as the browser does. */
  function page(startHidden = false) {
    const onTimeout = vi.fn();
    let hidden = startHidden;
    const w = new ContextLossWatchdog(10_000, onTimeout, () => hidden);
    const show = (): void => {
      hidden = false;
      w.visibilityChanged();
    };
    const hide = (): void => {
      hidden = true;
      w.visibilityChanged();
    };
    /** The page becomes hidden, but the watchdog has not been told yet. */
    const hideUnannounced = (): void => {
      hidden = true;
    };
    return { w, onTimeout, show, hide, hideUnannounced };
  }

  it('a picture lost behind a hidden page is not given up, however long the page is away', () => {
    vi.useFakeTimers();
    const { w, onTimeout, show } = page(true);
    w.lose(); // the phone drops the 3D picture in the background
    expect(vi.getTimerCount()).toBe(0); // no timer runs while hidden
    vi.advanceTimersByTime(600_000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(w.failed).toBe(false);
    expect(w.lost).toBe(true);
    // The player comes back and the picture returns two seconds later: it is accepted.
    show();
    vi.advanceTimersByTime(2_000);
    expect(w.restore()).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(w.lost).toBe(false);
  });

  it('a picture that never returns is given up a full 10 s after the page is shown again', () => {
    vi.useFakeTimers();
    const { w, onTimeout, show } = page(true);
    w.lose();
    vi.advanceTimersByTime(29_000);
    show();
    vi.advanceTimersByTime(9_999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(w.failed).toBe(true);
    expect(w.restore()).toBe(false);
  });

  it('hiding part-way through the wait stops it, and coming back starts a full wait again', () => {
    vi.useFakeTimers();
    const { w, onTimeout, show, hide } = page();
    w.lose();
    vi.advanceTimersByTime(8_000);
    hide();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);
    expect(onTimeout).not.toHaveBeenCalled();
    show();
    vi.advanceTimersByTime(9_999); // 8 s before + 9.999 s now: still not given up
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('an overdue timer that runs while the page is still hidden gives nothing up', () => {
    vi.useFakeTimers();
    const { w, onTimeout, show, hideUnannounced } = page();
    w.lose();
    hideUnannounced(); // the phone froze the page before telling it
    vi.advanceTimersByTime(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(w.failed).toBe(false);
    show();
    expect(w.restore()).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('with the page in view throughout nothing changes: 10 s, then the card', () => {
    vi.useFakeTimers();
    const { w, onTimeout } = page();
    w.lose();
    vi.advanceTimersByTime(9_999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(w.restore()).toBe(false);
  });

  it('hiding or showing starts nothing when no picture is lost, or once the 3D has failed', () => {
    vi.useFakeTimers();
    const { w, onTimeout, show, hide } = page();
    hide();
    show();
    expect(vi.getTimerCount()).toBe(0);
    w.lose();
    w.restore(); // back in time
    hide();
    show();
    expect(vi.getTimerCount()).toBe(0);
    w.lose();
    w.fail(); // a shader failed meanwhile: the card is already up
    hide();
    show();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('the scene asks the page whether it is hidden, and tells the watchdog when that changes', () => {
    const src = readFileSync(join(root, 'src/engine/render/SceneManager.ts'), 'utf8');
    const made = src.slice(src.indexOf('new ContextLossWatchdog('), src.indexOf('readonly enamelMat'));
    expect(made).toContain("() => document.visibilityState === 'hidden'");
    expect(src).toContain(
      "document.addEventListener('visibilitychange', () => this.lostWatchdog.visibilityChanged());"
    );
  });
});

describe('graphics failure card', () => {
  it('never tells the player they switched graphics off, and offers Reload only when terminal', () => {
    const unavailable = graphicsCardHtml('unavailable');
    const failed = graphicsCardHtml('failed');
    for (const html of [unavailable, failed]) {
      expect(html).toContain('3D Graphics Unavailable');
      expect(html).not.toContain('Turned Off');
    }
    expect(unavailable).toContain('hardware acceleration');
    expect(unavailable).not.toContain('Reload');
    expect(failed).toContain("This device's graphics can't run MouthLife.");
    expect(failed).toContain('Reload');
  });

  it('keeps the shader-failure test switch out of production builds', () => {
    const src = readFileSync(join(root, 'src/engine/render/SceneManager.ts'), 'utf8');
    const line = src.split('\n').find((l) => l.includes("'graphicsTest'"));
    expect(line).toBeDefined();
    expect(line).toContain('import.meta.env.DEV');
  });
});
