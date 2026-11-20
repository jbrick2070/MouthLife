import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickTutorialInputScheme } from '../src/config/tutorial';
import { shouldShowVirtualThumbPad } from '../src/ui/hudHelpers';

const ROOT = join(__dirname, '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

/** The body of the first `@media <query> {` block in a stylesheet. */
function mediaBlock(css: string, query: string): string {
  const head = `@media ${query} {`;
  const start = css.indexOf(head);
  expect(start, head).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = start + head.length - 1; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start + head.length, i);
  }
  throw new Error(`unclosed ${head}`);
}

describe('L04 Prologue heading fits every language', () => {
  it('lets the heading wrap instead of cutting it off, and keeps room for Mute and Skip', () => {
    const intro = read('src/ui/CosmicIntroOverlay.ts');
    const span = /<span class="cosmic-title" style="([^"]*)">✦ COSMIC ENAMEL<\/span>/.exec(intro);
    expect(span).not.toBeNull();
    const style = span![1];
    expect(style).not.toMatch(/white-space:\s*nowrap|text-overflow|overflow:\s*hidden/);
    expect(style).toMatch(/min-width:\s*0/);
    // The mute and Skip buttons never shrink, so a long title wraps beside them.
    expect(intro).toMatch(/<div class="row-wrap" style="flex-wrap:nowrap;flex-shrink:0;">\s*<button[^>]*id="btn-cosmic-mute"/);
  });
});

describe('L05 Steer OFF shows the thumbstick on a desktop', () => {
  it('asks for the pad with a mouse when Steer is off', () => {
    expect(shouldShowVirtualThumbPad({ pointerSteerEnabled: false, compactViewport: false, coarsePointer: false })).toBe(true);
    expect(shouldShowVirtualThumbPad({ pointerSteerEnabled: true, compactViewport: false, coarsePointer: false })).toBe(false);
  });

  it('lets the desktop stylesheet show the pad whenever the HUD asks, touch or not', () => {
    const desktop = mediaBlock(read('src/styles/main.css'), '(min-width: 640px) and (pointer: fine) and (hover: hover)');
    expect(desktop).toMatch(/\.thumb-deck:not\(\.pad-hidden\)\s*\{[^}]*display:\s*flex/);
    // Visibility follows the HUD's one decision (pad-hidden), not whether the screen was touched.
    expect(desktop).not.toContain('touch-capable');
    // The desktop button bar already has the actions, so the round touch buttons stay out.
    expect(desktop).toMatch(/\.thumb-deck \.actuator-cluster\s*\{[^}]*display:\s*none/);
  });

  it('still promises the pad that the stylesheet now shows', () => {
    expect(read('src/ui/TelemetryHudOverlay.ts')).toContain('Thumb Pad ON — steer with the bottom-left pad');
  });
});

describe('L12 How to Play uses the same input the game HUD sees', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('shows touch controls after a touch on a laptop that reports a fine pointer', () => {
    expect(pickTutorialInputScheme({ coarsePointer: false, touchSeen: true, gamepadConnected: false })).toBe('touch');
    expect(pickTutorialInputScheme({ coarsePointer: false, touchSeen: false, gamepadConnected: false })).toBe('keys');
    expect(pickTutorialInputScheme({ coarsePointer: true, touchSeen: false, gamepadConnected: false })).toBe('touch');
    // A controller in use keeps its own instructions.
    expect(pickTutorialInputScheme({ coarsePointer: false, touchSeen: true, gamepadConnected: true })).toBe('pad');
  });

  it('notices the first real touch anywhere on the page, but not a mouse', async () => {
    const listeners = new Map<string, (e: { pointerType: string }) => void>();
    vi.stubGlobal('window', {
      addEventListener: (type: string, fn: (e: { pointerType: string }) => void) => listeners.set(type, fn),
    });
    vi.resetModules();
    const { hasSeenTouch } = await import('../src/ui/touchSeen');
    expect(hasSeenTouch()).toBe(false);
    listeners.get('pointerdown')?.({ pointerType: 'mouse' });
    listeners.get('pointerdown')?.({ pointerType: 'pen' });
    expect(hasSeenTouch()).toBe(false);
    listeners.get('pointerdown')?.({ pointerType: 'touch' });
    expect(hasSeenTouch()).toBe(true);
  });

  it('is wired the same way as the HUD (coarse pointer or a touch seen)', () => {
    const hub = read('src/ui/CompanionHubOverlay.ts');
    expect(hub).toMatch(/pickTutorialInputScheme\(\{\s*coarsePointer,\s*touchSeen: hasSeenTouch\(\),/);
    expect(read('src/ui/TelemetryHudOverlay.ts')).toContain('this.input.isCoarsePointer() || this.input.hasSeenTouch()');
  });
});
