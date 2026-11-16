import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TUTORIAL_COPY,
  TUTORIAL_MAX_OFFERS,
  TUTORIAL_PAGES,
  TUTORIAL_STORAGE_KEY,
  TutorialGate,
  loadTutorialProgress,
  pickTutorialInputScheme,
  recordTutorialOffered,
  recordTutorialOpened,
  shouldOfferTutorial,
  tutorialControlsFor,
  tutorialPageIndex,
  type TutorialInputScheme,
} from '../src/config/tutorial';
import { buildTutorialSceneSvg } from '../src/ui/TutorialOverlay';

const ROOT = join(__dirname, '..');

/** A tiny stand-in for localStorage. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('How to Play guide: the cards', () => {
  it('covers home, both games, every Dive control, the cities and a closing card, in that order', () => {
    expect(TUTORIAL_PAGES.map((p) => p.id)).toEqual([
      'home',
      'brush',
      'dive',
      'floss',
      'surge',
      'scan',
      'cities',
      'ready',
    ]);
    expect(tutorialPageIndex('surge')).toBe(4);
  });

  it('keeps every card short enough to read at a glance', () => {
    for (const page of TUTORIAL_PAGES) {
      expect(page.title.length, page.id).toBeLessThanOrEqual(18);
      expect(page.body.length, page.id).toBeLessThanOrEqual(125);
    }
  });

  it('tells every kind of player what to do on every card', () => {
    const schemes: TutorialInputScheme[] = ['touch', 'mouse', 'keys', 'pad'];
    for (const page of TUTORIAL_PAGES) {
      for (const scheme of schemes) {
        const hints = tutorialControlsFor(page, scheme);
        expect(hints.length, `${page.id}/${scheme}`).toBeGreaterThan(0);
        for (const h of hints) expect(h.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('names the real keys and buttons the game listens for', () => {
    const keysOn = (id: string, scheme: TutorialInputScheme) =>
      tutorialControlsFor(TUTORIAL_PAGES[tutorialPageIndex(id as never)], scheme).flatMap((h) => h.keys ?? []);
    expect(keysOn('dive', 'keys')).toEqual(['W', 'A', 'S', 'D', 'Space']);
    expect(keysOn('floss', 'keys')).toEqual(['E']);
    expect(keysOn('surge', 'keys')).toEqual(['Q']);
    expect(keysOn('scan', 'keys')).toEqual(['R']);
    // Controller layout from src/engine/GamepadInput.ts
    expect(keysOn('dive', 'pad')).toEqual(['L-Stick', 'A']);
    expect(keysOn('floss', 'pad')).toEqual(['X']);
    expect(keysOn('surge', 'pad')).toEqual(['Y']);
    expect(keysOn('scan', 'pad')).toEqual(['B']);
  });

  it('explains that new cities unlock by winning dives or earning Stamps', () => {
    const cities = TUTORIAL_PAGES[tutorialPageIndex('cities')];
    expect(cities.body).toMatch(/Win a dive/);
    expect(cities.body).toMatch(/Stamps/);
    expect(cities.body).toMatch(/unlock/);
  });

  it('ends by saying the brushing timer is worth using on its own, and where the guide lives', () => {
    const ready = TUTORIAL_PAGES[tutorialPageIndex('ready')];
    expect(ready.body).toMatch(/Not into the games\?/);
    expect(ready.body).toMatch(/brush, floss and rinse timer is fun on its own/);
    expect(tutorialControlsFor(ready, 'touch')[0].label).toBe('Tap ? on Home to see this again');
  });

  it('shows controller buttons when a controller is in use, otherwise touch or keys', () => {
    expect(pickTutorialInputScheme({ coarsePointer: true, gamepadConnected: false })).toBe('touch');
    expect(pickTutorialInputScheme({ coarsePointer: false, gamepadConnected: false })).toBe('keys');
    expect(pickTutorialInputScheme({ coarsePointer: true, gamepadConnected: true })).toBe('pad');
  });

  it('draws a demo for every card', () => {
    for (const page of TUTORIAL_PAGES) {
      const svg = buildTutorialSceneSvg(page.id);
      expect(svg).toContain(`tut-scene-${page.id}`);
      expect(svg).toContain('viewBox="0 0 320 180"');
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('undefined');
    }
  });

  it('lights the brushing quarters in the coach order: top right, top left, bottom left, bottom right', () => {
    const svg = buildTutorialSceneSvg('brush');
    const centre = (q: number) => {
      const xs: number[] = [];
      const ys: number[] = [];
      const re = new RegExp(`tut-q${q}" cx="([\\d.]+)" cy="([\\d.]+)"`, 'g');
      for (let m = re.exec(svg); m; m = re.exec(svg)) {
        xs.push(Number(m[1]));
        ys.push(Number(m[2]));
      }
      expect(xs.length).toBe(4);
      return { x: xs.reduce((a, b) => a + b) / 4, y: ys.reduce((a, b) => a + b) / 4 };
    };
    // Mirror view: the screen's right side is the player's right (quarter 1 starts there).
    expect(centre(1).x).toBeGreaterThan(160);
    expect(centre(1).y).toBeLessThan(86);
    expect(centre(2).x).toBeLessThan(160);
    expect(centre(2).y).toBeLessThan(86);
    expect(centre(3).x).toBeLessThan(160);
    expect(centre(3).y).toBeGreaterThan(86);
    expect(centre(4).x).toBeGreaterThan(160);
    expect(centre(4).y).toBeGreaterThan(86);
  });
});

describe('How to Play guide: when the Home screen offers it', () => {
  it('offers on the first three launches, then stops', () => {
    const storage = memoryStorage();
    const seen: boolean[] = [];
    for (let launch = 0; launch < 5; launch++) {
      const gate = new TutorialGate(storage);
      gate.enterHome();
      seen.push(gate.isOfferVisible());
    }
    expect(seen).toEqual([true, true, true, false, false]);
    expect(loadTutorialProgress(storage)).toEqual({ offers: TUTORIAL_MAX_OFFERS, opened: false });
  });

  it('counts one offer per launch, however often the Home screen comes back', () => {
    const storage = memoryStorage();
    const gate = new TutorialGate(storage);
    gate.enterHome();
    gate.enterHome();
    gate.enterHome();
    expect(gate.getProgress().offers).toBe(1);
  });

  it('puts the offer away for the launch once it is declined or a game starts', () => {
    const gate = new TutorialGate(memoryStorage());
    gate.enterHome();
    expect(gate.isOfferVisible()).toBe(true);
    gate.dismissOffer();
    gate.enterHome(); // back from a game
    expect(gate.isOfferVisible()).toBe(false);
  });

  it('never offers again once the guide has been opened, even from the ? button', () => {
    const storage = memoryStorage();
    const first = new TutorialGate(storage);
    first.enterHome();
    first.markOpened();
    expect(first.isOfferVisible()).toBe(false);

    const second = new TutorialGate(storage);
    second.enterHome();
    expect(second.isOfferVisible()).toBe(false);
    expect(second.getProgress()).toEqual({ offers: 1, opened: true });
  });

  it('keeps the rules as plain functions', () => {
    expect(shouldOfferTutorial({ offers: 0, opened: false })).toBe(true);
    expect(shouldOfferTutorial({ offers: 2, opened: false })).toBe(true);
    expect(shouldOfferTutorial({ offers: 3, opened: false })).toBe(false);
    expect(shouldOfferTutorial({ offers: 0, opened: true })).toBe(false);
    expect(recordTutorialOffered({ offers: 3, opened: false }).offers).toBe(3);
    expect(recordTutorialOpened({ offers: 1, opened: false })).toEqual({ offers: 1, opened: true });
  });

  it('starts fresh when the saved note is missing or damaged, and works with no storage at all', () => {
    expect(loadTutorialProgress(memoryStorage())).toEqual({ offers: 0, opened: false });
    expect(loadTutorialProgress(memoryStorage({ [TUTORIAL_STORAGE_KEY]: 'not json' }))).toEqual({ offers: 0, opened: false });
    expect(loadTutorialProgress(memoryStorage({ [TUTORIAL_STORAGE_KEY]: '{"offers":99,"opened":"yes"}' }))).toEqual({
      offers: TUTORIAL_MAX_OFFERS,
      opened: false,
    });
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const gate = new TutorialGate(broken);
    gate.enterHome();
    expect(gate.isOfferVisible()).toBe(true);
  });
});

describe('How to Play guide: same words in the native app', () => {
  const swift = readFileSync(
    join(ROOT, 'native-apple/Sources/MouthLifeCore/Config/TutorialGuide.swift'),
    'utf8'
  );
  const quoted = (s: string) => `"${s}"`;

  it('has the same cards in the same order', () => {
    const cases = Array.from(swift.matchAll(/^\s{4}case (\w+)$/gm)).map((m) => m[1]);
    const pageCases = cases.slice(0, TUTORIAL_PAGES.length);
    expect(pageCases).toEqual(TUTORIAL_PAGES.map((p) => p.id));
    const order = Array.from(swift.matchAll(/id: \.(\w+),/g)).map((m) => m[1]);
    expect(order).toEqual(TUTORIAL_PAGES.map((p) => p.id));
  });

  it('uses every title, sentence, control hint and button label word for word', () => {
    const missing: string[] = [];
    for (const page of TUTORIAL_PAGES) {
      for (const text of [page.title, page.body]) if (!swift.includes(quoted(text))) missing.push(text);
      for (const hints of Object.values(page.controls)) {
        for (const h of hints ?? []) {
          if (!swift.includes(quoted(h.label))) missing.push(h.label);
          for (const k of h.keys ?? []) if (!swift.includes(quoted(k))) missing.push(k);
        }
      }
    }
    for (const text of Object.values(TUTORIAL_COPY)) if (!swift.includes(quoted(text))) missing.push(text);
    expect(missing).toEqual([]);
  });

  it('offers the guide on the same number of launches', () => {
    expect(swift).toContain(`static let maxOffers = ${TUTORIAL_MAX_OFFERS}`);
  });
});

describe('No contact details in the game', () => {
  // The owner chose to ship without an email address or mail link, for the best store rating.
  const files = [
    'src/config/tutorial.ts',
    'src/ui/TutorialOverlay.ts',
    'native-apple/Sources/MouthLifeCore/Config/TutorialGuide.swift',
    'native-apple/MouthLifeApp/UI/TutorialView.swift',
  ];

  it('keeps the guide free of email addresses and links', () => {
    for (const rel of files) {
      const code = readFileSync(join(ROOT, rel), 'utf8');
      expect(code, rel).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
      expect(code, rel).not.toMatch(/mailto:|https?:|href=|openURL|Link\(/);
    }
  });

  it('has no Feedback page in either edition', () => {
    const hub = readFileSync(join(ROOT, 'src/ui/CompanionHubOverlay.ts'), 'utf8');
    expect(hub).not.toMatch(/btn-open-feedback|feedback-address/);
    const nativeHub = readFileSync(join(ROOT, 'native-apple/MouthLifeApp/UI/CompanionHubView.swift'), 'utf8');
    expect(nativeHub).not.toMatch(/case feedback|FeedbackSheet|FeedbackInfo/);
  });
});
