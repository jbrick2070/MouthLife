import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearHasSeenBrushIntro,
  HAS_SEEN_BRUSH_INTRO_KEY,
  markHasSeenBrushIntro,
  readHasSeenBrushIntro,
} from '../src/engine/persistence/pacerPrefs';
import { brushIntroCardHtml } from '../src/ui/brushIntroCard';

/** A tiny localStorage stand-in (the test environment has no DOM). */
function fakeStorage(refuse = false): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => {
      if (refuse) throw new Error('blocked');
      return data.get(k) ?? null;
    },
    setItem: (k, v) => {
      if (refuse) throw new Error('blocked');
      data.set(k, String(v));
    },
    removeItem: (k) => {
      if (refuse) throw new Error('blocked');
      data.delete(k);
    },
  };
}

const g = globalThis as unknown as { window?: { localStorage: Storage } };
let saved: typeof g.window;

describe('the one-time "Time Your Real Brush" card', () => {
  beforeEach(() => {
    saved = g.window;
  });
  afterEach(() => {
    clearHasSeenBrushIntro();
    g.window = saved;
  });

  it('is shown until marked, and Erase Save (clear) brings it back', () => {
    g.window = { localStorage: fakeStorage() };
    clearHasSeenBrushIntro();
    expect(readHasSeenBrushIntro()).toBe(false);
    markHasSeenBrushIntro();
    expect(readHasSeenBrushIntro()).toBe(true);
    expect(g.window.localStorage.getItem(HAS_SEEN_BRUSH_INTRO_KEY)).toBe('1');
    clearHasSeenBrushIntro();
    expect(readHasSeenBrushIntro()).toBe(false);
  });

  it('where storage is refused, it is shown once per visit', () => {
    g.window = { localStorage: fakeStorage(true) };
    clearHasSeenBrushIntro();
    expect(readHasSeenBrushIntro()).toBe(false);
    markHasSeenBrushIntro();
    expect(readHasSeenBrushIntro()).toBe(true);
  });

  it('says it is real brushing, and pictures rinse only when rinse is on', () => {
    expect(brushIntroCardHtml(false)).toContain('Brush your real teeth at the sink for 2 minutes.');
    expect(brushIntroCardHtml(false)).toContain('Start 2-Min Brush');
    // A grown-up with an electric toothbrush should see at once that the timer is for them too.
    expect(brushIntroCardHtml(false)).toContain('Any toothbrush works, electric too.');
    expect(brushIntroCardHtml(false)).not.toContain('>Rinse<');
    expect(brushIntroCardHtml(true)).toContain('>Rinse<');
  });
});
