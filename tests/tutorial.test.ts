import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TUTORIAL_BUTTON_KEYS,
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
  tutorialImageNames,
  tutorialPageIndex,
  type TutorialInputScheme,
  type TutorialPageId,
} from '../src/config/tutorial';
import {
  buildTutorialRowsHtml,
  buildTutorialStageHtml,
  isTutorialListPage,
  tutorialImageUrl,
} from '../src/ui/TutorialOverlay';

const ROOT = join(__dirname, '..');
const GUIDE_DIR = join(ROOT, 'src/assets/guide');
const page = (id: TutorialPageId) => TUTORIAL_PAGES[tutorialPageIndex(id)];

/** A tiny stand-in for localStorage. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('How to Play guide: the cards', () => {
  it('covers home, both games, the ship, the controls, every tool, the field guides, the cities and a close', () => {
    expect(TUTORIAL_PAGES.map((p) => p.id)).toEqual([
      'home',
      'brush',
      'dive',
      'cleaner',
      'buttons',
      'floss',
      'surge',
      'scan',
      'enemies',
      'helpers',
      'cities',
      'ready',
    ]);
    expect(tutorialPageIndex('surge')).toBe(6);
  });

  it('keeps every card short enough to read at a glance', () => {
    for (const p of TUTORIAL_PAGES) {
      expect(p.title.length, p.id).toBeLessThanOrEqual(18);
      expect(p.body.length, p.id).toBeLessThanOrEqual(125);
      for (const row of [...(p.rows ?? []), ...(p.buttonRows ?? [])]) {
        expect(row.name.length, row.name).toBeLessThanOrEqual(24);
        expect(row.tip.length, row.name).toBeLessThanOrEqual(50);
      }
    }
  });

  it('gives every picture card a hint for every kind of player', () => {
    const schemes: TutorialInputScheme[] = ['touch', 'mouse', 'keys', 'pad'];
    for (const p of TUTORIAL_PAGES) {
      if (isTutorialListPage(p)) continue;
      for (const scheme of schemes) {
        const hints = tutorialControlsFor(p, scheme);
        expect(hints.length, `${p.id}/${scheme}`).toBeGreaterThan(0);
        for (const h of hints) expect(h.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('names the real keys and buttons the game listens for', () => {
    const keysOn = (id: TutorialPageId, scheme: TutorialInputScheme) =>
      tutorialControlsFor(page(id), scheme).flatMap((h) => h.keys ?? []);
    expect(keysOn('dive', 'keys')).toEqual(['W', 'A', 'S', 'D', 'Space']);
    expect(keysOn('floss', 'keys')).toEqual(['E']);
    expect(keysOn('surge', 'keys')).toEqual(['Q']);
    expect(keysOn('scan', 'keys')).toEqual(['R']);
    // Controller layout from src/engine/GamepadInput.ts
    expect(keysOn('dive', 'pad')).toEqual(['L-Stick', 'A']);
    expect(keysOn('floss', 'pad')).toEqual(['X']);
    expect(keysOn('surge', 'pad')).toEqual(['Y']);
    expect(keysOn('scan', 'pad')).toEqual(['B']);
    // The controls card agrees with the tool cards.
    expect(TUTORIAL_BUTTON_KEYS.keys).toEqual({
      move: ['W', 'A', 'S', 'D', 'Space'],
      floss: ['E'],
      surge: ['Q'],
      scan: ['R'],
      pause: ['Esc'],
    });
    expect(TUTORIAL_BUTTON_KEYS.pad).toEqual({
      move: ['L-Stick', 'A'],
      floss: ['X'],
      surge: ['Y'],
      scan: ['B'],
      pause: ['Start'],
    });
  });

  it('explains that new cities unlock by winning dives or earning Stamps', () => {
    const cities = page('cities');
    expect(cities.body).toMatch(/Win a dive/);
    expect(cities.body).toMatch(/Stamps/);
    expect(cities.body).toMatch(/unlock/);
  });

  it('ends by saying the brushing timer is worth using on its own, and where the guide lives', () => {
    const ready = page('ready');
    expect(ready.body).toMatch(/Not into the games\?/);
    expect(ready.body).toMatch(/brush, floss and rinse timer is fun on its own/);
    expect(tutorialControlsFor(ready, 'touch')[0].label).toBe('Tap ? on Home to see this again');
  });

  it('shows controller buttons when a controller is in use, otherwise touch or keys', () => {
    expect(pickTutorialInputScheme({ coarsePointer: true, gamepadConnected: false })).toBe('touch');
    expect(pickTutorialInputScheme({ coarsePointer: false, gamepadConnected: false })).toBe('keys');
    expect(pickTutorialInputScheme({ coarsePointer: true, gamepadConnected: true })).toBe('pad');
  });
});

describe('How to Play guide: real pictures of the game', () => {
  it('has every picture the cards ask for, and nothing left over', () => {
    const wanted = tutorialImageNames().sort();
    expect(wanted.length).toBeGreaterThan(20);
    for (const name of wanted) {
      expect(existsSync(join(GUIDE_DIR, `${name}.jpg`)), name).toBe(true);
      expect(tutorialImageUrl(name), name).toBeTruthy();
    }
    const onDisk = readdirSync(GUIDE_DIR)
      .filter((f) => f.endsWith('.jpg'))
      .map((f) => f.replace(/\.jpg$/, ''))
      .sort();
    expect(onDisk).toEqual(wanted);
  });

  it('keeps the pictures small enough for phones and the offline cache', () => {
    let total = 0;
    for (const name of tutorialImageNames()) {
      const size = statSync(join(GUIDE_DIR, `${name}.jpg`)).size;
      expect(size, name).toBeLessThan(90_000);
      total += size;
    }
    expect(total).toBeLessThan(1_000_000);
  });

  it('shows the dive, each tool and the brushing timer as real game frames', () => {
    expect(page('home').frames).toEqual(['home']);
    expect(page('brush').frames).toEqual(['brush-1', 'brush-2']);
    expect(page('dive').frames).toEqual(['dive-1', 'dive-2', 'dive-3']);
    expect(page('cleaner').frames).toEqual(['cleaner']);
    expect(page('floss').frames).toEqual(['floss-1', 'floss-2', 'floss-3']);
    expect(page('surge').frames).toEqual(['surge-1', 'surge-2', 'surge-3']);
    expect(page('scan').frames).toEqual(['scan-1', 'scan-2']);
    expect(page('cities').frames).toEqual(['cities']);
    for (const id of ['dive', 'floss', 'surge', 'scan', 'brush'] as const) {
      const html = buildTutorialStageHtml(page(id));
      expect(html).toContain(`tut-flip-${page(id).frames.length}`);
      expect((html.match(/<img /g) ?? []).length).toBe(page(id).frames.length);
      // Exactly one frame is marked as the still picture for Reduced Motion.
      expect((html.match(/tut-still/g) ?? []).length).toBe(1);
    }
    expect(buildTutorialStageHtml(page('ready'))).toContain('<svg');
  });

  it('has a field guide to the troublemakers and one to the helpers', () => {
    expect(page('enemies').rows?.map((r) => r.name)).toEqual([
      'Plaque',
      'Sugar crystal',
      'Slime',
      'Acid puddle',
      'Slime dome',
    ]);
    expect(page('helpers').rows?.map((r) => r.name)).toEqual([
      'Sleeping helper germs',
      'Awake helper germs',
      'Gold seal',
      'Saliva spring',
      'Supply beacon',
    ]);
    const html = buildTutorialRowsHtml(page('enemies'), 'touch');
    expect((html.match(/<li /g) ?? []).length).toBe(5);
    expect((html.match(/<img /g) ?? []).length).toBe(5);
  });

  it('shows the controls as on-screen buttons for touch, and as keys for keyboard and controller', () => {
    const controls = page('buttons');
    expect(controls.buttonRows?.map((r) => r.action)).toEqual(['move', 'floss', 'surge', 'scan', 'pause']);
    const touch = buildTutorialRowsHtml(controls, 'touch');
    expect(touch).toContain('tut-btn-pad');
    expect(touch).not.toContain('<kbd');
    const keys = buildTutorialRowsHtml(controls, 'keys');
    expect(keys).toContain('>Space</kbd>');
    expect(keys).toContain('>Esc</kbd>');
    expect(keys).not.toContain('tut-btn-pad');
    const pad = buildTutorialRowsHtml(controls, 'pad');
    expect(pad).toContain('>L-Stick</kbd>');
    expect(pad).toContain('>Start</kbd>');
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

describe('How to Play guide: same words and pictures in the native app', () => {
  const swift = readFileSync(
    join(ROOT, 'native-apple/Sources/MouthLifeCore/Config/TutorialGuide.swift'),
    'utf8'
  );
  const quoted = (s: string) => `"${s}"`;

  it('has the same cards in the same order', () => {
    const cases = Array.from(swift.matchAll(/^\s{4}case (\w+)$/gm)).map((m) => m[1]);
    expect(cases.slice(0, TUTORIAL_PAGES.length)).toEqual(TUTORIAL_PAGES.map((p) => p.id));
    const order = Array.from(swift.matchAll(/^\s{12}id: \.(\w+),$/gm)).map((m) => m[1]);
    expect(order).toEqual(TUTORIAL_PAGES.map((p) => p.id));
  });

  it('uses every title, sentence, hint, row and button label word for word', () => {
    const missing: string[] = [];
    const need = (text: string) => {
      if (!swift.includes(quoted(text))) missing.push(text);
    };
    for (const p of TUTORIAL_PAGES) {
      need(p.title);
      need(p.body);
      for (const hints of Object.values(p.controls)) {
        for (const h of hints ?? []) {
          need(h.label);
          for (const k of h.keys ?? []) need(k);
        }
      }
      for (const row of [...(p.rows ?? []), ...(p.buttonRows ?? [])]) {
        need(row.name);
        need(row.tip);
      }
      for (const f of p.frames) need(f);
      for (const row of p.rows ?? []) need(row.image);
    }
    for (const byAction of Object.values(TUTORIAL_BUTTON_KEYS)) {
      for (const keys of Object.values(byAction)) for (const k of keys) need(k);
    }
    for (const text of Object.values(TUTORIAL_COPY)) need(text);
    expect(missing).toEqual([]);
  });

  it('offers the guide on the same number of launches', () => {
    expect(swift).toContain(`static let maxOffers = ${TUTORIAL_MAX_OFFERS}`);
  });

  it('bundles the same picture folder into the app', () => {
    const project = readFileSync(join(ROOT, 'native-apple/MouthLife.xcodeproj/project.pbxproj'), 'utf8');
    expect(project).toContain('path = ../src/assets/guide;');
    expect(project).toContain('/* guide in Resources */');
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
