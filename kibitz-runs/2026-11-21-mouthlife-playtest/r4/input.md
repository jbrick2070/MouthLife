# MouthLife improvement plan after the November 2026 playtest (v3)

Repository: MouthLife at 474e66a (web edition in `src/`, native Apple app in `native-apple/`). The plan keeps the house rules in `AGENTS.md`:
- web and native match
- Apple-simple
- hands-free once 2-Min Brush starts
- minimal voice
- non-punitive
- everything stays on the device
- 120 Hz zero-allocation loops
- English plus seven translated languages

## What the playtest found (in our words; the report stays private)

A paid tester played the web edition for an hour on four devices, following `docs/tester-brief.md` (target age 5 to 10).

1. **Pixel 2, Android 9, Chrome:** the 3D world never appeared.
2. **Galaxy S22, Android 13, Chrome:** text overlapped near the start; the tester calls it "7.0".
3. **iPhone 16 Pro, Safari, and a PC with Chrome:** no bugs.
4. **Impressions:**
   - At first the tester did not realise the 2-Min Brush times real brushing.
   - The controls felt tight and smooth.
   - The cities were more fun than expected.
   - From the science words, the tester guessed an age of 9 to 13.
   - Music and graphics felt neutral.
   - The tester would expect the game to be free, which it is.

The videos have not arrived yet (one is named "Old Android").

**Worth chasing:** what helps 5- to 10-year-olds and their parents within the house rules. Changes of direction are owner questions.

## Step 0: evidence (no telemetry)

- Get the videos, and confirm the overlapping screen and what the Pixel 2 showed.
- **Baseline today's behaviour:**
  - Chrome launched with `--disable-webgl`
  - a forced context loss through `WEBGL_lose_context`. If the extension is missing, record that and skip the check.
- The shader-failure reproduction is A2's acceptance test, because its switch is built in A2.

## A1. The hardness chips overlap on narrow phones

- **Evidence:**
  - Five chips sit in `repeat(5, 1fr)` (`src/ui/CosmicIntroOverlay.ts:193-205`, `src/styles/main.css:497-515`).
  - The names, such as "Crystalline Quartz" (the 7.0 chip), use an inline `font-size:0.66rem` (`:204`), and `1fr` tracks grow with unbreakable words.
- **Data:** add `shortName` beside `name` with explicit values (Gold, Iron, Enamel, Quartz, Diamond) in:
  - `MohsEntry` (`CosmicIntroOverlay.ts`)
  - `MohsSpecimen` (`native-apple/Sources/MouthLifeCore/Config/MohsSpecimens.swift`)

  The detail line and the accessibility labels keep `name`.
- **Web:**
  - Chips render `shortName` in a new `mohs-chip-name` class, replacing the inline styles.
  - `grid-template-columns: repeat(5, minmax(0, 1fr))`.
  - At 320 px, shrink to no less than 0.58rem, with at most two lines and `overflow-wrap: anywhere` as a last resort.
  - Keep the 40 to 44 px touch height.
- **Native:** `CosmicIntroView.swift:195` becomes `Text(L10n.t(specimen.shortName))`, and the accessibility label (`:214`) keeps `L10n.t(specimen.name)`. The geometry is unchanged unless native screenshots overlap.
- **Tests:**
  - add `shortName` to the key list in `tests/qaParity.test.ts:44`
  - add the expected short names to `native-apple/Tests/MouthLifeCoreTests/QAFixTests.swift:149`
- **One commit:** the web and native halves land together, because `qaParity` reads the Swift source.
- **Accepted when:**
  - no chip text overlaps or clips at 320 and 360 CSS px in any of the eight languages
  - the narrowest iPhone at the largest standard Dynamic Type size is clean in the longest language
  - the tester's video matches

## A2. Phones that cannot run the 3D show a black screen

- **Evidence:**
  - Only a renderer that fails to be created is caught (`src/engine/render/SceneManager.ts:261-281`, `src/main.ts:112-124`).
  - Three r174 checks shaders on first use while drawing (`node_modules/three/src/renderers/webgl/WebGLProgram.js:916-934`), so the existing `prewarmShaders()` compile (`SceneManager.ts:311`) never sees errors.
  - The finale swallows its compile errors (`FinaleStage3D.ts:1831-1838`).
- **Supported floor:** WebGL 2. Three r174 has no WebGL 1 path. There is no 2D fallback.

**A2.1, the latch and the startup check:**
1. `SceneManager` installs `renderer.debug.onShaderError` once, before any warm-up, and keeps it for the whole session. It records the first failure.
2. **Startup warm-up**, run before any overlay mounts, while nothing is on screen:
   - compile, then draw the startup scene once to the canvas
   - turn off frustum culling for that draw, make the pacer group visible briefly, and render `GlowPass` once
   - restore culling, visibility, the camera and the render state in a `finally` block
3. `SceneManager.graphicsState` is `ready`, `unavailable` or `shaderFailed`. `main.ts` checks it before building anything.
4. `FinaleStage3D` installs the same latch and draws once offscreen when it attaches. A failure sets its `ok` to false, so `CityFinaleOverlay` uses its 2D show (`CityFinaleOverlay.ts:432-449`).
5. A dev-only switch (`?graphicsTest=shaderError`, compiled in only when `import.meta.env.DEV`) adds an invalid `ShaderMaterial` to the startup scene.

**A2.2, during play:**
- **The event:** `src/engine/types.ts` gains `'webgl:failed': { reason: 'compile' | 'context-timeout' }`.
- **Who emits it:** `SceneManager` emits it when the latch fires at any time (for example, a cartridge's shaders when they are mounted), or when its 10-second watchdog runs out.
  - The watchdog starts on `webglcontextlost`. A generation token cancels it on `webglcontextrestored`.
  - `SceneManager` skips its own per-frame work while the context is lost. Three already returns early (`WebGLRenderer.js:1149`).
  - `webgl:restored` is emitted only after the first normal frame after a restore passes without a latched error.
- **Who listens:** `main.ts` subscribes once. It mounts a single card in its own layer above `uiRoot`, with an idempotent disposer, and never wipes `uiRoot`.
  - A restore that arrives after the card is shown is ignored until reload.
  - The arcade and Pulp Rescue keep today's pause (`main.ts:420`).
  - 2-Min Brush keeps its timer, earcons and voice to the end under the card.

**Cards (translated):**
- **`unavailable`:** reworded so it does not say the user switched graphics off. It says the 3D can't start, and suggests hardware acceleration or a newer device.
- **Both failure reasons:** one plain, non-punitive card saying this device's graphics can't run MouthLife. Details go to the console only.

**Native:** Metal on supported devices does not hit this path. No change.

**Tests:**
- pure tests of the watchdog: restored in time, a timeout, a failed restore, a stale timeout, and repeated loss
- the dev switch, which shows the card at startup
- a forced loss, which keeps a running 2-Min Brush going

**Accepted when:** no reproduced path leaves a black screen.

## B1a. Say it's real brushing (no owner decision needed)

- **Parity:** the web Prologue's third beat (`src/ui/CosmicIntroOverlay.ts:77`) adopts native's exact text (`native-apple/MouthLifeApp/UI/CosmicIntroView.swift:43`), which ends with timing your real 2-minute brush at the sink.
- **No new translations:** that string is already extracted and translated (`src/i18n/strings.en.json:930`).
- **Accepted when:** the web and native beats match word for word in all eight languages.

## B1b. First-use card and lead-in (waits for owner question 2)

**States (web and native):** `intro` (first use only), then `leadIn` (3 s), then `running`.
- Coaching, highlights, foam, cues, speech, the pacer timer and its restart, and the wake lock run only in `running`.
- **Web:** the work moves out of the `BrushAlongOverlay` constructor (`:240-260`) into `beginRunning()`.
- **Native:** `startBrushAlong()` (`AppCoordinator.swift:1013-1045`) is split into `requestBrushAlong()`, `commitBrushAlong()` and `beginRunning()`. The lifecycle hooks (`:1367-1405`) and `MouthLifeSceneController` coaching (`:323-335`, `:698-735`) are gated on `running`. `returnToHub()` (`:873-881`) cancels the lead-in.

**Lead-in timing:**
- The commit records an absolute deadline (`Date.now() + 3000` on the web, a monotonic deadline on native).
- `beginRunning()` calls `startPacer(initialElapsedSec)` with `max(0, now − deadline)`. On native this is `PacerSessionClock(rawSec:)`.
- It runs on the timer callback, or on return from hidden or locked if the deadline has passed. A hidden lead-in therefore never restarts at 0:00.
- The lead-in never counts toward `brushedSec`, rewards or the 2:00 clock.
- The 3D pacer stays idle during it, with three pips, a "set your phone down" picture and no speech.

**The commit tap:**
- It runs only once, and Start is disabled after the first tap.
- It synchronously requests motion permission (the web callback is passed in from `main.ts`, replacing the Home-tap request at `main.ts:780`) and, on web Safari, warms speech synthesis.

**First-use card:**
- It says to brush your real teeth, with the toothbrush and floss pick from `src/assets/guide/` (native reuses `TutorialGuideImages`, `TutorialView.swift:351-387`) and a drop symbol for rinse when the setting is on at that moment.
- **The flag:** `pacerPrefs.ts` gains `readHasSeenIntro`, `markHasSeenIntro` and `clearHasSeenIntro` (key `mouthlife.pacer.hasSeenIntro`). Native uses the same key in `UserDefaults`.
- It is set on commit.
- The web Erase Save handler (`CompanionHubOverlay.ts:2006-2017`) calls `clearHasSeenIntro`. Native has no Erase Save control today, so there is nothing to wire.
- It is not in the Sync Code. Where storage is unavailable, the card shows once per session.

**Entry points:**

| Entry point | First use | Later |
|---|---|---|
| Home tap (web and native) | intro, then lead-in | lead-in |
| Native widget (`openFromWidget`, `AppCoordinator.swift:270-280`) and `.onOpenURL` routes | intro, then lead-in | lead-in |
| Watch Start | unchanged: the watch is worn | unchanged |
| `--mode=brushAlong` test argument (`AppCoordinator.swift:651-655`) | straight to `running` | straight to `running` |

The Home button is unchanged.

**Tests:**
- every existing pacer, coach and watch test stays green
- new tests cover:
  - deadline catch-up across a hidden interval
  - cancelling before and after the deadline, with no reward either way
  - double taps
  - the flag's read, mark and clear

**Accepted when:** a first-time player sees the message before the clock runs, a returning player taps once, and the web and native match.

## B3. Protect the controls

Nothing changes in `src/engine/InputManager.ts` or the native steering code. `tests/inputAndLayoutReview.test.ts` and `tests/pointerSteer.test.ts` stay green.

## Translations, for every item that adds text

1. `npm run i18n:extract`
2. `npm run i18n:translate -- <lang>` for es, fr, de, pt, ja, zh and ko, reviewing each
3. a check that every new string exists in all seven locales, because the translator can finish with gaps and the test only needs 95% coverage
4. `node scripts/i18n-native.mjs`

`tests/i18n.test.ts` stays green.

## Who builds what

- **The PC** runs the web checks. **The Mac** builds and checks native.
- Other sessions push to master on the same day: pull and rebase before every push.
- **Commit pairs:**
  - **A1:** one commit, built on the Mac, because of the parity test.
  - **A2:** web only.
  - **B1a:** web only. Native already has the text.
  - **B1b:** one commit per edition, back to back, with the native commit first so the web never runs ahead of native.

## Owner questions (not built this round)

1. **Wording for younger players:** how far should the main path move toward plain words? We suggest acting only on strings a child aged 5 to 10, playing with a parent, actually stumbles on. The translations are machine-made (`README.md:49`).
2. **The lead-in:** confirm 3 s for every brush on phones and computers. This gates B1b.
3. **The controls as a game of their own:** a separate idea.

Unchanged by choice: the price (free, no ads), music and graphics, and adult users.

## Order and checks

- **Order:**
  1. Step 0
  2. A1 and B1a, which are small
  3. A2
  4. B1b, after question 2
- **Before every push:**
  - **Web:** `npx vitest run` and `npm run build`.
  - **Native, on the Mac:** `swift test`, plus Release builds with `CODE_SIGNING_ALLOWED=NO` for iOS and macOS (scheme `MouthLife`) and watchOS (scheme `MouthLifeWatch`, `-destination 'generic/platform=watchOS'`).
  - **CI:** add the watchOS build to `.github/workflows/native-apple.yml`.
- **Screenshots:**
  - the web Prologue at 320 and 360 px in eight languages
  - the native Prologue on the smallest iPhone at the largest standard Dynamic Type size
- **Next test round:** an Android 9 or 10 phone, and a child aged 5 to 10 playing with a parent for a week.
