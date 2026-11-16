/**
 * The How to Play guide: eight short cards, one idea each.
 *
 * Shared word for word with the native app (`native-apple/Sources/MouthLifeCore/Config/TutorialGuide.swift`),
 * so both editions teach the same thing and use the same translations. Change them together.
 */

export type TutorialPageId = 'home' | 'brush' | 'dive' | 'floss' | 'surge' | 'scan' | 'cities' | 'ready';

/** How the player is controlling the game right now. */
export type TutorialInputScheme = 'touch' | 'mouse' | 'keys' | 'pad';

export interface TutorialControlHint {
  /** Key or button names drawn as keycaps. Never translated. */
  keys?: readonly string[];
  label: string;
}

export interface TutorialPage {
  id: TutorialPageId;
  title: string;
  body: string;
  controls: Partial<Record<TutorialInputScheme, readonly TutorialControlHint[]>>;
}

const RUB_AND_TURN: readonly TutorialControlHint[] = [
  { label: 'Rub the teeth' },
  { label: 'Drag beside them to turn' },
];
const HANDS_FREE: readonly TutorialControlHint[] = [{ label: 'Hands-free: just follow along' }];
const DRAG_ON_TOOTH: readonly TutorialControlHint[] = [{ label: 'Drag on the tooth' }];
const PICK_A_CITY: readonly TutorialControlHint[] = [{ label: 'Pick a city on the Home screen' }];
const FIND_AGAIN: readonly TutorialControlHint[] = [{ label: 'Tap ? on Home to see this again' }];

export const TUTORIAL_PAGES: readonly TutorialPage[] = [
  {
    id: 'home',
    title: 'Welcome home',
    body: 'This is your mouth. Rub the teeth to polish them, then pick a game at the bottom.',
    controls: { touch: RUB_AND_TURN, mouse: RUB_AND_TURN, keys: RUB_AND_TURN, pad: RUB_AND_TURN },
  },
  {
    id: 'brush',
    title: '2-Min Brush',
    body: 'Brush your real teeth where the glow shows. A chime means move on. Floss and rinse come next.',
    controls: { touch: HANDS_FREE, mouse: HANDS_FREE, keys: HANDS_FREE, pad: HANDS_FREE },
  },
  {
    id: 'dive',
    title: 'Dive',
    body: 'Steer the tiny robot over a giant tooth and scrub off the plaque. Clean 90% to win.',
    controls: {
      touch: DRAG_ON_TOOTH,
      mouse: DRAG_ON_TOOTH,
      keys: [
        { keys: ['W', 'A', 'S', 'D'], label: 'Move' },
        { keys: ['Space'], label: 'Hold to scrub' },
      ],
      pad: [
        { keys: ['L-Stick'], label: 'Move' },
        { keys: ['A'], label: 'Hold to scrub' },
      ],
    },
  },
  {
    id: 'floss',
    title: 'Floss',
    body: 'Floss cleans the narrow gaps between teeth, where the brush can’t reach.',
    controls: {
      touch: [{ label: 'Double-tap, or tap FLOSS' }],
      mouse: [{ label: 'Double-click, or click FLOSS' }],
      keys: [{ keys: ['E'], label: 'or right-click' }],
      pad: [{ keys: ['X'], label: 'Fire floss' }],
    },
  },
  {
    id: 'surge',
    title: 'Fluoride Surge',
    body: 'Scrubbing fills the Surge meter. At 100%, fire a big wave that washes plaque and acid away.',
    controls: {
      touch: [{ label: 'Tap SURGE at 100%' }],
      mouse: [{ label: 'Click SURGE at 100%' }],
      keys: [{ keys: ['Q'], label: 'Fire at 100%' }],
      pad: [{ keys: ['Y'], label: 'Fire at 100%' }],
    },
  },
  {
    id: 'scan',
    title: 'Dye Scan',
    body: 'Pink dye shows the plaque you missed.',
    controls: {
      touch: [{ label: 'Tap SCAN' }],
      mouse: [{ label: 'Click SCAN' }],
      keys: [{ keys: ['R'], label: 'Show the dye' }],
      pad: [{ keys: ['B'], label: 'Show the dye' }],
    },
  },
  {
    id: 'cities',
    title: 'New cities',
    body: 'Each city has its own tooth and its own challenge. Win a dive, or earn Stamps with 2-Min Brush, to unlock the next one.',
    controls: { touch: PICK_A_CITY, mouse: PICK_A_CITY, keys: PICK_A_CITY, pad: PICK_A_CITY },
  },
  {
    id: 'ready',
    title: 'You’re ready',
    body: 'You can’t lose a tooth, so take your time. Not into the games? The brush, floss and rinse timer is fun on its own.',
    controls: { touch: FIND_AGAIN, mouse: FIND_AGAIN, keys: FIND_AGAIN, pad: FIND_AGAIN },
  },
];

/** Words on the guide's own buttons and on the Home screen offer. */
export const TUTORIAL_COPY = {
  buttonLabel: 'How to Play',
  skip: 'Skip',
  back: 'Back',
  next: 'Next',
  done: 'Done',
  replayDemo: 'Play the demo again',
  offerTitle: 'How to play',
  offerBody: 'A one-minute guide to the games and controls.',
  offerAccept: 'Show me',
  offerDecline: 'Not now',
} as const;

export function tutorialPageIndex(id: TutorialPageId): number {
  return Math.max(0, TUTORIAL_PAGES.findIndex((p) => p.id === id));
}

/** Control hints for one card. Unknown schemes fall back to touch, so a card is never blank by mistake. */
export function tutorialControlsFor(page: TutorialPage, scheme: TutorialInputScheme): readonly TutorialControlHint[] {
  return page.controls[scheme] ?? page.controls.touch ?? [];
}

/** A controller in use wins; otherwise fingers on a touch screen, keys on a desktop. */
export function pickTutorialInputScheme(env: { coarsePointer: boolean; gamepadConnected: boolean }): TutorialInputScheme {
  if (env.gamepadConnected) return 'pad';
  return env.coarsePointer ? 'touch' : 'keys';
}

// ---------------------------------------------------------------- when to offer it

/** The Home screen offers the guide on this many launches, then leaves it to the ? button. */
export const TUTORIAL_MAX_OFFERS = 3;

export interface TutorialProgress {
  /** Launches on which the offer has been shown. */
  offers: number;
  /** True once the player has opened the guide, from the offer or the ? button. */
  opened: boolean;
}

export const TUTORIAL_PROGRESS_START: Readonly<TutorialProgress> = Object.freeze({ offers: 0, opened: false });

export function shouldOfferTutorial(p: TutorialProgress): boolean {
  return !p.opened && p.offers < TUTORIAL_MAX_OFFERS;
}

export function recordTutorialOffered(p: TutorialProgress): TutorialProgress {
  return { ...p, offers: Math.min(TUTORIAL_MAX_OFFERS, p.offers + 1) };
}

export function recordTutorialOpened(p: TutorialProgress): TutorialProgress {
  return { ...p, opened: true };
}

export const TUTORIAL_STORAGE_KEY = 'mouthlife.tutorial';

type MiniStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): MiniStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadTutorialProgress(storage?: MiniStorage | null): TutorialProgress {
  try {
    const raw = JSON.parse((storage ?? defaultStorage())?.getItem(TUTORIAL_STORAGE_KEY) ?? 'null') as unknown;
    if (!raw || typeof raw !== 'object') return { ...TUTORIAL_PROGRESS_START };
    const rec = raw as Record<string, unknown>;
    const offers = typeof rec.offers === 'number' && Number.isFinite(rec.offers) ? rec.offers : 0;
    return {
      offers: Math.max(0, Math.min(TUTORIAL_MAX_OFFERS, Math.floor(offers))),
      opened: rec.opened === true,
    };
  } catch {
    return { ...TUTORIAL_PROGRESS_START };
  }
}

export function saveTutorialProgress(p: TutorialProgress, storage?: MiniStorage | null): void {
  try {
    (storage ?? defaultStorage())?.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: the offer simply shows again next time */
  }
}

/**
 * Decides, for one launch of the game, whether the Home screen shows the offer.
 * The offer counts once per launch, and goes away for that launch as soon as the player answers
 * it or starts a game.
 */
export class TutorialGate {
  private progress: TutorialProgress;
  private countedThisLaunch = false;
  private offerVisible = false;

  constructor(private readonly storage?: MiniStorage | null) {
    this.progress = loadTutorialProgress(storage);
  }

  /** Call each time the Home screen appears. */
  enterHome(): void {
    if (this.countedThisLaunch) return;
    this.countedThisLaunch = true;
    if (!shouldOfferTutorial(this.progress)) return;
    this.offerVisible = true;
    this.progress = recordTutorialOffered(this.progress);
    saveTutorialProgress(this.progress, this.storage);
  }

  isOfferVisible(): boolean {
    return this.offerVisible;
  }

  dismissOffer(): void {
    this.offerVisible = false;
  }

  /** The player opened the guide: never offer it again. */
  markOpened(): void {
    this.offerVisible = false;
    if (this.progress.opened) return;
    this.progress = recordTutorialOpened(this.progress);
    saveTutorialProgress(this.progress, this.storage);
  }

  getProgress(): TutorialProgress {
    return { ...this.progress };
  }
}
