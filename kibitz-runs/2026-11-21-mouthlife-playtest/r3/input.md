# MouthLife improvement plan after the November 2026 playtest (v2)

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

Videos came with the report (one is named "Old Android"); we do not have them yet.

**Worth chasing:** what helps 5- to 10-year-olds and their parents within the house rules. Changes of direction are owner questions.

## Step 0: evidence first

- Get the tester's videos.
- Confirm which screen overlapped and what the Pixel 2 showed.
- **Reproduce A2 locally, without telemetry:**
  - Chrome launched with `--disable-webgl`, for the `unavailable` state
  - the dev-only shader switch below, for the `shaderFailed` state
  - `WEBGL_lose_context`, for context loss. If the extension is missing, say so and skip that check.
- A1 can start before the videos arrive, but can only close against them.

## A1. The hardness chips overlap on narrow phones

- **Evidence:**
  - Five Mohs chips sit in `repeat(5, 1fr)` (`src/ui/CosmicIntroOverlay.ts:193-205`, `src/styles/main.css:497-515`).
  - The names, such as "Crystalline Quartz" (the 7.0 chip), use an inline `font-size:0.66rem` (`CosmicIntroOverlay.ts:204`), and a `1fr` track grows with unbreakable words.
- **Data (both editions):**
  - Add `shortName` to `MohsEntry` (`CosmicIntroOverlay.ts`) and `MohsSpecimen` (`native-apple/Sources/MouthLifeCore/Config/MohsSpecimens.swift`), with explicit values in all five entries: Gold, Iron, Enamel, Quartz, Diamond.
  - `name` and the formula stay for the detail line and the accessibility label.
- **Views:**
  - **Web:** chips render `shortName`. Replace the inline styles with a `mohs-chip-name` class. Set `grid-template-columns: repeat(5, minmax(0, 1fr))` and a 320 px rule that shrinks the font to no less than 0.58rem, with at most two lines and no overflow. Keep the 40 to 44 px touch height.
  - **Native:** `CosmicIntroView.swift:195` binds `specimen.shortName`, and the accessibility label at `:214` keeps `name`. The geometry is unchanged unless native screenshots overlap.
- **Tests:**
  - Add `shortName` to the key list in `tests/qaParity.test.ts:44`.
  - Add the expected short names to `testMohsSpecimensMatchTheWeb` (`QAFixTests.swift:149`).
- **Translations:**
  1. `npm run i18n:extract`
  2. `npm run i18n:translate -- <lang>` for es, fr, de, pt, ja, zh and ko, then review each result
  3. `node scripts/i18n-native.mjs`, which regenerates `L10nCatalogs.swift`

  `tests/i18n.test.ts` must stay green.
- **Accepted when:**
  - no chip text overlaps or clips at 320 and 360 CSS px in any of the eight languages
  - the narrowest iPhone, at the largest standard Dynamic Type size, is clean in the longest language
  - the tester's video matches this screen

## A2. Phones that cannot run the 3D show a black screen

- **Evidence:**
  - `SceneManager.initRenderer` (`src/engine/render/SceneManager.ts:261-281`) only catches a renderer that fails to be created. `src/main.ts:112-124` then shows "3D Graphics Are Turned Off" and stops.
  - Shader errors in three r174 are checked on first use while drawing (`node_modules/three/src/renderers/webgl/WebGLProgram.js:916-934`), so today's `prewarmShaders()` compile (`SceneManager.ts:311`) never sees them.
  - The `QualityGovernor` acts only after 60 frames.
- **Supported floor:** browsers with WebGL 2. Three r174 has no WebGL 1 path. There is no 2D fallback.
- **Startup:**
  1. Install a latch on `renderer.debug.onShaderError` before warming the shaders.
  2. Warm them by compiling, then rendering the startup scenes once into a small offscreen render target: the Home arch, the Prologue backdrop and the pacer rig.
  3. `SceneManager` exposes `graphicsState`: `ready`, `unavailable` or `shaderFailed`.
  4. `main.ts` checks it before building any overlay.
  5. The finale's own renderer keeps its existing 2D fallback (`FinaleStage3D.ts:1308`).
- **What the player sees:**
  - **`unavailable`:** today's card, reworded so it does not say the user switched graphics off. It says the 3D can't start and suggests turning on hardware acceleration or using a newer device.
  - **`shaderFailed`:** a plain, translated, non-punitive card saying this device's graphics can't run MouthLife. Program details go to the console only.
- **During play:**
  - `SceneManager` owns a 10-second watchdog, started on `webglcontextlost` and cancelled by a generation token when the context is restored.
  - A restore re-runs the warm-up. `webgl:restored` is emitted only if it succeeds; otherwise it emits a new typed `webgl:failed` event (added beside the existing graphics events in `src/engine/types.ts`).
  - On a timeout or a failed restore, the `shaderFailed` card opens in its own modal layer. Mounted overlays are not wiped.
  - The arcade and Pulp Rescue keep today's pause (`src/main.ts:420`).
  - 2-Min Brush keeps its timer, earcons and voice running to the end of the ritual under the card, because it is eyes-optional.
  - A restore that arrives after the card is shown is ignored until reload.
- **Native:** Metal on supported Apple devices does not hit this path. No change.
- **Tests:**
  - A dev-only switch (`?graphicsTest=shaderError`, compiled in only when `import.meta.env.DEV`) adds an invalid `ShaderMaterial` to the startup scene.
  - Pure unit tests cover the watchdog: restored before 10 s, a timeout, a failed restore, and a stale timeout after a restore.
- **Accepted when:** each state is reproduced with step 0's setup, and no path leaves a black screen.

## B1. Make it obvious that 2-Min Brush times real brushing

- **Evidence:**
  - Native's Prologue says to time your real 2-minute brush at the sink (`native-apple/MouthLifeApp/UI/CosmicIntroView.swift:43`). The web Prologue has no such line.
  - The tutorials have the line (`src/config/tutorial.ts:87`, `TutorialGuide.swift:185`).
  - The pacer starts the moment the overlay mounts (`src/ui/BrushAlongOverlay.ts:240`, `AppCoordinator.swift:1013`).

**Changes:**
1. **Parity:** give the web Prologue native's real-brush line, translated with the workflow in A1.
2. **First use:**
   - Before the first 2-Min Brush on a device, show a card that says to brush your real teeth. It pictures the toothbrush and floss pick from `src/assets/guide/` (and native's matching images), plus a drop symbol for rinse when the rinse setting is on at that moment.
   - Its Start button commits the ritual.
   - **The flag:** `mouthlife.pacer.hasSeenIntro` sits in `src/engine/persistence/pacerPrefs.ts` (using its storage fallback) and in native `UserDefaults`. It is set on Start and cleared by Erase Save. It is not in the Sync Code. Where storage is unavailable, the card shows once per session.
3. **Lead-in, a presentation state only:**
   - After the committing tap, the web overlay and the native `BrushAlongView` show "set your phone down" for 3 s, with three pips and no speech. Then they start the pacer and the coach exactly as today.
   - The timer, `PacerStage`, `BrushCoachSystem`, `WatchRitual`, rewards and `brushedSec` are untouched. The 3D pacer stays idle during the lead-in.
   - If the page is hidden or the phone locked during the lead-in, the ritual still starts at 3 s and catches up as it does today.
   - Leaving during the lead-in cancels its timers and pips (in `dispose()`), and gives no reward.
4. **Entry points:**

   | Entry point | First use | Later |
   |---|---|---|
   | Home tap (web and native) | card, then lead-in | lead-in |
   | Native widget, deep link or Siri launch | card, then lead-in | lead-in |
   | Watch Start | no change: the watch is worn and starts at once | no change |
   | Test launch arguments | start at once, as today | start at once |

   The web motion-permission request moves from the Home callback (`src/main.ts:780`) to the committing tap: the card's Start on first use, otherwise the Home tap.
5. **The Home button is unchanged.**

**Accepted when:**
- a first-time player sees the real-brush message before the clock runs, in both editions
- a returning player taps once
- the lead-in behaves the same on the web and native
- every existing pacer, coach and watch test is unchanged and green
- new tests cover lead-in cancellation and the first-use flag

**Gate:** the owner approves the lead-in (question 2) first.

## B3. Protect the controls

This round changes nothing in `src/engine/InputManager.ts` or the native steering code. `tests/inputAndLayoutReview.test.ts` and `tests/pointerSteer.test.ts` must stay green.

## Owner questions (not built this round)

1. **Wording for younger players:**
   - How far should the main path move toward plain words?
   - Our suggestion: act only on strings that a child aged 5 to 10, playing with a parent, actually stumbles on.
   - The translations are machine-made (`README.md:49`), so fluent review is a separate cost.
2. **The lead-in:** confirm 3 s, for every brush on phones and computers.
3. **The controls as a game of their own:** a separate product idea.

Unchanged by choice: the price (free, no ads), music and graphics, and adult users.

## Order and checks

- **Order:**
  1. Step 0
  2. A1
  3. A2
  4. B1, once question 2 is answered
- **Before every push:**
  - **Web:** `npx vitest run` (which includes `qaParity`, `i18n`, input and layout tests) and `npm run build` (which runs `tsc`).
  - **Native, on the Mac:** `swift test`, plus the iOS, macOS and watchOS Release builds. Use the `MouthLife` and `MouthLifeWatch` schemes with `CODE_SIGNING_ALLOWED=NO`.
- **Screenshots:**
  - the web Prologue at 320 and 360 px in all eight languages
  - the native Prologue on the smallest iPhone at the largest standard Dynamic Type size
- **Next test round:** an Android 9 or 10 phone, and a child aged 5 to 10 playing with a parent for a week.
