/**
 * The How to Play guide: twelve short cards, one idea each, illustrated with real pictures of the
 * game (`src/assets/guide/`, photographed from the running game).
 *
 * Shared word for word with the native app (`native-apple/Sources/MouthLifeCore/Config/TutorialGuide.swift`),
 * so both editions teach the same thing and use the same translations. Change them together.
 */

export type TutorialPageId =
  | 'home'
  | 'brush'
  | 'dive'
  | 'cleaner'
  | 'buttons'
  | 'floss'
  | 'surge'
  | 'scan'
  | 'enemies'
  | 'helpers'
  | 'cities'
  | 'ready';

/** How the player is controlling the game right now. */
export type TutorialInputScheme = 'touch' | 'mouse' | 'keys' | 'pad';

export interface TutorialControlHint {
  /** Key or button names drawn as keycaps. Never translated. */
  keys?: readonly string[];
  label: string;
}

/** One line of a field-guide card: a real close-up, its name, and what to do about it. */
export interface TutorialRow {
  /** Picture name in `src/assets/guide/` (no extension). */
  image: string;
  name: string;
  tip: string;
}

/** The on-screen controls a dive uses. */
export type TutorialButtonAction = 'move' | 'floss' | 'surge' | 'scan' | 'pause';

export interface TutorialButtonRow {
  action: TutorialButtonAction;
  name: string;
  tip: string;
}

export interface TutorialPage {
  id: TutorialPageId;
  title: string;
  body: string;
  controls: Partial<Record<TutorialInputScheme, readonly TutorialControlHint[]>>;
  /** Real pictures shown one after another, like a flipbook. None = a drawn picture. */
  frames: readonly string[];
  /** Field-guide rows (Troublemakers, Helpers). */
  rows?: readonly TutorialRow[];
  /** Control rows (Your controls). The picture for each depends on the device in use. */
  buttonRows?: readonly TutorialButtonRow[];
}

const RUB_AND_TURN: readonly TutorialControlHint[] = [
  { label: 'Rub the teeth' },
  { label: 'Drag beside them to turn' },
];
const HANDS_FREE: readonly TutorialControlHint[] = [{ label: 'Hands-free: just follow along' }];
const DRAG_ON_TOOTH: readonly TutorialControlHint[] = [{ label: 'Drag on the tooth' }];
const GOLD_GLOW: readonly TutorialControlHint[] = [{ label: 'It glows gold when Surge is ready' }];
const PICK_A_CITY: readonly TutorialControlHint[] = [{ label: 'Pick a city on the Home screen' }];
const FIND_AGAIN: readonly TutorialControlHint[] = [{ label: 'Tap ? on Home to see this again' }];

function all(hints: readonly TutorialControlHint[]): TutorialPage['controls'] {
  return { touch: hints, mouse: hints, keys: hints, pad: hints };
}

export const TUTORIAL_PAGES: readonly TutorialPage[] = [
  {
    id: 'home',
    title: 'Welcome home',
    body: 'This is your mouth. Rub the teeth to polish them, then pick a game at the bottom.',
    controls: all(RUB_AND_TURN),
    frames: ['home'],
  },
  {
    id: 'brush',
    title: '2-Min Brush',
    body: 'Brush your real teeth where the glow shows. A chime means move on. Floss and rinse come next.',
    controls: all(HANDS_FREE),
    frames: ['brush-1', 'brush-2'],
  },
  {
    id: 'dive',
    title: 'Dive',
    body: 'Steer the tiny ship over a giant tooth and scrub off the plaque. Clean 90% to win.',
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
    frames: ['dive-1', 'dive-2', 'dive-3'],
  },
  {
    id: 'cleaner',
    title: 'Meet HYDRA-1',
    body: 'Your tooth-cleaning ship. The brush on its nose scrubs, and its spools shoot floss through tight gaps.',
    controls: all(GOLD_GLOW),
    frames: ['cleaner'],
  },
  {
    id: 'buttons',
    title: 'Your controls',
    body: 'Four tools clean every tooth.',
    controls: {},
    frames: [],
    buttonRows: [
      { action: 'move', name: 'Move and scrub', tip: 'Steer the ship over the plaque.' },
      { action: 'floss', name: 'Floss', tip: 'Shoots thread through tight gaps.' },
      { action: 'surge', name: 'Surge', tip: 'A big wave. It fills as you scrub.' },
      { action: 'scan', name: 'Dye Scan', tip: 'Shows the plaque you missed.' },
      { action: 'pause', name: 'Pause', tip: 'Take a break any time.' },
    ],
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
    frames: ['floss-1', 'floss-2', 'floss-3'],
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
    frames: ['surge-1', 'surge-2', 'surge-3'],
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
    frames: ['scan-1', 'scan-2'],
  },
  {
    id: 'enemies',
    title: 'Troublemakers',
    body: 'Know them when you see them.',
    controls: {},
    frames: [],
    rows: [
      { image: 't-plaque', name: 'Plaque', tip: 'Sticky yellow film. Scrub it off.' },
      { image: 't-sugar', name: 'Sugar crystal', tip: 'It makes slimes. Floss shatters it.' },
      { image: 't-slime', name: 'Slime', tip: 'Leaves plaque and acid. Scrub or floss it.' },
      { image: 't-acid', name: 'Acid puddle', tip: 'Slows you down. Surge washes it away.' },
      { image: 't-dome', name: 'Slime dome', tip: 'Blocks the brush. Crack it with Floss or Surge.' },
    ],
  },
  {
    id: 'helpers',
    title: 'Helpers',
    body: 'Good things to look for.',
    controls: {},
    frames: [],
    rows: [
      { image: 't-helper-asleep', name: 'Sleeping helper germs', tip: 'Clean around them to wake them.' },
      { image: 't-helper-awake', name: 'Awake helper germs', tip: 'Wake them all to seal the zone.' },
      { image: 't-seal', name: 'Gold seal', tip: 'A gold edge means the zone is sealed.' },
      { image: 't-spring', name: 'Saliva spring', tip: 'Drive through it to wash acid away.' },
      { image: 't-beacon', name: 'Supply beacon', tip: 'Grab it for a Surge boost.' },
    ],
  },
  {
    id: 'cities',
    title: 'New cities',
    body: 'Each city has its own tooth and its own challenge. Win a dive, or earn Stamps with 2-Min Brush, to unlock the next one.',
    controls: all(PICK_A_CITY),
    frames: ['cities'],
  },
  {
    id: 'ready',
    title: 'You’re ready',
    body: 'You can’t lose a tooth, so take your time. Not into the games? The brush, floss and rinse timer is fun on its own.',
    controls: all(FIND_AGAIN),
    frames: [],
  },
];

/**
 * The key or controller button for each dive control. Touch and mouse players get a picture of
 * the real on-screen button instead.
 */
export const TUTORIAL_BUTTON_KEYS: Record<'keys' | 'pad', Record<TutorialButtonAction, readonly string[]>> = {
  keys: {
    move: ['W', 'A', 'S', 'D', 'Space'],
    floss: ['E'],
    surge: ['Q'],
    scan: ['R'],
    pause: ['Esc'],
  },
  pad: {
    move: ['L-Stick', 'A'],
    floss: ['X'],
    surge: ['Y'],
    scan: ['B'],
    pause: ['Start'],
  },
};

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

/** Every picture the guide uses, so a test can check each one is really in the project. */
export function tutorialImageNames(): string[] {
  const names = new Set<string>();
  for (const page of TUTORIAL_PAGES) {
    for (const f of page.frames) names.add(f);
    for (const r of page.rows ?? []) names.add(r.image);
  }
  return [...names];
}

export function tutorialPageIndex(id: TutorialPageId): number {
  return Math.max(0, TUTORIAL_PAGES.findIndex((p) => p.id === id));
}

/** Control hints for one card. Unknown schemes fall back to touch, so a card is never blank by mistake. */
export function tutorialControlsFor(page: TutorialPage, scheme: TutorialInputScheme): readonly TutorialControlHint[] {
  return page.controls[scheme] ?? page.controls.touch ?? [];
}

/**
 * A controller in use wins; otherwise fingers on a touch screen, keys on a desktop. A screen counts
 * as touch when it reports a coarse pointer or has been touched (a touch laptop reports its trackpad),
 * the same test the game HUD uses for its thumbstick and tips.
 */
export function pickTutorialInputScheme(env: {
  coarsePointer: boolean;
  /** The screen has been touched since the page opened. */
  touchSeen?: boolean;
  gamepadConnected: boolean;
}): TutorialInputScheme {
  if (env.gamepadConnected) return 'pad';
  return env.coarsePointer || env.touchSeen ? 'touch' : 'keys';
}

// ---------------------------------------------------------------- when to offer it

/** The Home screen offers the guide on this many launches, then leaves it to the ? button. */
export const TUTORIAL_MAX_OFFERS = 3;

/**
 * Raise this to offer the guide again to everyone, players who already saw or opened it included.
 * 2 (November 2026): the owner wanted the guide back in front of players. Native twin:
 * `TutorialGuide.edition`.
 */
export const TUTORIAL_EDITION = 2;

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
    // Progress from an earlier edition of the guide starts over, so the new one is offered again.
    const edition = typeof rec.edition === 'number' && Number.isFinite(rec.edition) ? rec.edition : 1;
    if (edition < TUTORIAL_EDITION) return { ...TUTORIAL_PROGRESS_START };
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
    (storage ?? defaultStorage())?.setItem(
      TUTORIAL_STORAGE_KEY,
      JSON.stringify({ offers: p.offers, opened: p.opened, edition: TUTORIAL_EDITION })
    );
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
