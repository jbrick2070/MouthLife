# MouthLife improvement plan after the November 2026 playtest (v1)

Repository: MouthLife at 474e66a (web edition in `src/`, native Apple app in `native-apple/`). The plan keeps the house rules in `AGENTS.md`:
- web and native match
- Apple-simple
- hands-free once 2-Min Brush starts
- minimal voice
- non-punitive
- everything stays on the device
- 120 Hz zero-allocation loops
- eight languages

## What the playtest found (in our words; the report stays private)

A paid tester played the web edition for an hour on four devices, following `docs/tester-brief.md` (target age 5 to 10).

1. **Pixel 2, Android 9, Chrome:** the 3D world never appeared.
2. **Galaxy S22, Android 13, Chrome:** text overlapped near the start; the tester calls it "7.0".
3. **iPhone 16 Pro, Safari, and a PC with Chrome:** no bugs.
4. **Impressions:**
   - At first the tester did not realise the 2-Min Brush times real brushing.
   - The controls felt tight and smooth on every device.
   - The cities were more fun than expected.
   - From the science words, the tester guessed an age of 9 to 13.
   - Music and graphics felt neutral.
   - The tester would expect the game to be free, which it is.

Videos came with the report (one is named "Old Android"); we do not have them yet.

**Worth chasing:** what helps 5- to 10-year-olds and their parents within the house rules. Anything that changes direction is an owner question.

## Step 0: evidence first

- Get the tester's videos.
- Confirm which screen overlapped and what the Pixel 2 showed.
- **Reproduce A2 locally, without telemetry:**
  - Chrome with WebGL disabled (`chrome://flags`, or `--disable-webgl`)
  - a test build that forces a shader compile error
  - a forced context loss (`WEBGL_lose_context`)
- A1 can start before the videos arrive, but can only close against them.

## A1. The hardness chips overlap on narrow phones

- **Evidence:**
  - The Prologue's second card shows five Mohs chips in `repeat(5, 1fr)` (`src/ui/CosmicIntroOverlay.ts:193-205`; `src/styles/main.css:497-515` and `:1683-1693`).
  - A `1fr` track grows with unbreakable words, so "Crystalline Quartz" (the 7.0 chip) and "Iron / Mild Steel" at 0.66rem spill into their neighbours at 360 CSS px.
- **Change (both editions):**
  - Add `shortName` beside `name`: Gold, Iron, Enamel, Quartz, Diamond. The fields are `MohsEntry` in `CosmicIntroOverlay.ts` and `MohsSpecimen` in `native-apple/Sources/MouthLifeCore/Config/MohsSpecimens.swift`.
  - Chips show `shortName`. The detail line under the bar keeps `name` and the formula. Accessibility labels keep the full name.
  - Extend `testMohsSpecimensMatchTheWeb` (`native-apple/Tests/MouthLifeCoreTests/QAFixTests.swift:149`) to check `shortName`.
  - Add the new strings to the eight locale files through `npm run i18n:extract` and `node scripts/i18n-native.mjs`.
- **Web layout:**
  - `grid-template-columns: repeat(5, minmax(0, 1fr))`.
  - A font size that may shrink a little on very narrow screens, never below the current two-line chip.
  - Keep the 40 to 44 px touch height.
- **Native layout:** unchanged unless native screenshots overlap. Check the narrowest iPhone with the longest language and large Dynamic Type.
- **Accepted when:**
  - no chip text overlaps or clips at 320 and 360 CSS px in any of the eight languages
  - native screenshots are clean
  - the tester's video matches this screen

## A2. Phones that cannot run the 3D show a black screen

- **Evidence:**
  - `SceneManager.initRenderer` (`src/engine/render/SceneManager.ts:261-281`) only catches a renderer that fails to be created. `src/main.ts:112-124` then shows "3D Graphics Are Turned Off" (translated) and stops.
  - A renderer that is created but fails to compile its shaders, or that loses its context for good, leaves a black screen.
  - The `QualityGovernor` (`SceneManager.ts:1183-1219`) adjusts only after 60 measured frames, so it cannot help at startup.
- **Supported floor:** browsers with WebGL 2. Three.js r174 has no WebGL 1 path. There is no 2D fallback.
- **States and what the player sees:**
  1. **No WebGL 2:** today's card, reworded so it does not claim the user switched graphics off. It says the 3D can't start and suggests turning on hardware acceleration or using a newer device.
  2. **Shaders fail to compile or link:** detect it with `renderer.debug.onShaderError`, plus an up-front `renderer.compile(scene, camera)` of the main scene before Home appears. Show a plain, translated, non-punitive card saying this device's graphics can't run MouthLife.
  3. **Brief context loss:** keep today's pause for the arcade. During 2-Min Brush the timer, earcons and voice keep running, and the 3D returns when the context is restored. This needs a check of `src/main.ts:420`, which today pauses only the arcade and Pulp Rescue.
  4. **Context never restored** within 10 s: show the card from state 2.
- **Native:** Metal on supported Apple devices does not hit this path. No native change.
- **Accepted when:** each of the four states is reproduced in step 0's local setup and shows its card or behaviour, and no state leaves a black screen.

## B1. Make it obvious that 2-Min Brush times real brushing

- **Evidence:**
  - Native's Prologue already says to time your real 2-minute brush at the sink (`native-apple/MouthLifeApp/UI/CosmicIntroView.swift:43`). The web Prologue never does.
  - Both tutorials have the real-teeth line (`src/config/tutorial.ts:87`, `TutorialGuide.swift:185`), but the tester need not open them.
  - The pacer starts the moment the overlay mounts (`src/ui/BrushAlongOverlay.ts:240`), so there is no time to set the phone down.
- **Changes:**
  1. **Parity:** give the web Prologue the same real-brush line as native, translated.
  2. **First use only:** before the first 2-Min Brush, show a card that says to brush your real teeth, with a picture of each tool the ritual will use: toothbrush, floss pick, and rinse only when that setting is on. Its Start button begins the ritual. Later brushes skip the card.
  3. **Every brush:** a 3-second automatic lead-in after the Home tap: a "set your phone down" picture, three earcon pips and no speech. Then Quadrant 1 begins. The daily ritual stays one tap and hands-free.
  4. **The Home button text stays short** ("🪥 2 min Brush • Pick • Rinse", or "🪥 2m Brush" on phones). Any clarification goes in a subtitle, not on the button.
- **Both editions and the watch:** the lead-in shifts the ritual's start, so change the web pacer, native `BrushCoachSystem` and `WatchRitual` together, and run the watch tests.
- **Accepted when:**
  - a first-time player sees the real-brush message before the clock runs, in both editions
  - the lead-in is identical on the web, native and the watch
  - a returning player still needs one tap

## B3. Protect the controls

The city controls are the most praised part.
- **Protected:** this round changes nothing in `src/engine/InputManager.ts` or the native steering code.
- **Must stay green:** `tests/inputAndLayoutReview.test.ts` and `tests/pointerSteer.test.ts`.

## Owner questions (not built this round)

1. **Wording for younger players:**
   - How far should the main path move toward plain words, given that the science is part of the game's identity?
   - What would trigger it? We suggest a child aged 5 to 10 playing with a parent, and only strings that child actually stumbles on.
   - The translations are machine-made (`README.md:49`), so fluent review is a separate cost.
2. **The lead-in:** confirm it for every brush, and confirm 3 s.
3. **The controls as a game of their own:** a separate product idea.

Unchanged by choice: the price (free, no ads), music and graphics, and adult users.

## Order and checks

- **Order:**
  1. Step 0
  2. A1
  3. A2 (after its states are reproduced)
  4. B1 (after the owner answers question 2)
- **Before every push:**
  - **Web:** `npx tsc --noEmit`, `npx vitest run`, `npm run build`, plus the two i18n scripts when text changes.
  - **Native, on the Mac:** `swift test`, plus the iOS, macOS and watchOS Release builds.
  - **Also for B1:** the watch ritual tests.
- **Screenshots:**
  - the Prologue at 320 and 360 px in all eight languages
  - the native Prologue on the smallest iPhone
- **Next test round:** an Android 9 or 10 phone, and a child aged 5 to 10 playing with a parent.
