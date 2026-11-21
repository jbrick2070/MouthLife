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
