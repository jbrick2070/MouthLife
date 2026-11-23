# MouthLife improvement plan after the November 2026 playtest (draft v0)

Repository: MouthLife at 474e66a (web edition in `src/`, native Apple app in `native-apple/`). Read `AGENTS.md` for the house rules this plan must keep:
- web and native match
- Apple-simple
- hands-free once 2-Min Brush starts
- minimal voice
- non-punitive
- everything stays on the device
- 120 Hz zero-allocation loops
- eight languages

## What the playtest found (summarised in our words; the report itself stays private)

A paid tester played the web edition for one hour on four devices, following `docs/tester-brief.md`.

1. **Pixel 2, Android 9, Chrome:** the 3D world never appeared.
2. **Galaxy S22, Android 13, Chrome:** text overlapped near the start. The tester refers to it by the number "7.0".
3. **iPhone 16 Pro, Safari, and a Windows PC, Chrome:** no bugs.
4. **Impressions:**
   - At first the tester did not realise the 2-Min Brush is a real timer for brushing real teeth.
   - The tester doubted an adult would open an app to brush, especially one who already owns an electric brush with its own timer.
   - The city-cleaning controls felt tight, responsive and smooth on every device. The tester suggested the controls could carry a game of their own.
   - The cities were more fun than expected.
   - From the science words, the tester guessed an age of about 9 to 13. Our target is 5 to 10 (`docs/tester-brief.md`).
   - Music and graphics felt neutral.
   - The tester would expect the game to be free, which it is.

The tester also sent videos (one named "Old Android"). We do not have them yet.

## How we decide what is worth chasing

Chase what helps 5- to 10-year-olds and their parents and keeps the house rules. Do not reshape the game for adults, and do not add monetisation. Anything that changes the product's direction is an owner question.

## Workstream A: bugs

**A1. The hardness chips overlap on narrow phones.**
- **Likely cause:** the Prologue's second card shows five Mohs chips (`src/ui/CosmicIntroOverlay.ts:190-212`, styles `.mohs-bar` and `.mohs-item` in `src/styles/main.css:497-525` and `:1683-1693`). "7.0" is Quartz.
  - The bar is `grid-template-columns: repeat(5, 1fr)`. A `1fr` track has an automatic minimum, so unbreakable words grow their column.
  - The names include "Crystalline Quartz" and "Iron / Mild Steel" at 0.66rem, and translations are longer still.
  - At 360 CSS px (Galaxy S22) each chip gets about 64 px, so the names overflow into their neighbours.
- **Fix:**
  - Use `repeat(5, minmax(0, 1fr))`.
  - Give each chip a short display name (Gold, Iron, Enamel, Quartz, Diamond), with the full name staying in the detail line under the bar.
  - Allow wrapping (`overflow-wrap: anywhere`).
  - Check all eight languages at 320 and 360 px wide.
- **Native:** apply the same naming in the native Prologue wherever it shows the same chips.
- **Confirm the cause** against the tester's video before closing.

**A2. Weak or old phones show nothing.**
- **Today:** `SceneManager.initRenderer` (`src/engine/render/SceneManager.ts:261-281`) catches only a failure to create the renderer. `src/main.ts:112-124` then shows "3D Graphics Are Turned Off", which tells the player to turn on hardware acceleration. That advice is wrong on a phone whose GPU simply cannot cope. The message itself is translated (`src/i18n/locales/*.json`).
  - A phone that creates the renderer but fails to compile the shaders, or loses the context for good, gets a black screen.
- **Fix:**
  - Detect shader compile and link failures (`renderer.debug.onShaderError`) and a context that is lost and never restored.
  - Then show a plain, translated, non-punitive card: this device can't show the 3D world. Offer what still works.
  - Start weak devices on the lowest `QualityGovernor` tier.
  - Decide whether a 2D brushing timer can run without WebGL. That needs a check of what the web edition can draw without 3D.
- **Test:** without the device, use Chrome with WebGL disabled, and force a shader error in a test build.

## Workstream B: feedback worth chasing

**B1. Make it obvious the 2-Min Brush is real brushing.**
- **Today:** the only line saying so is in How to Play (`src/config/tutorial.ts:87`, "Brush your real teeth where the glow shows..."), which a first-time player may never open.
- **Wording:** the Home button and the first card of 2-Min Brush say plainly to brush your real teeth for two minutes, with a toothbrush picture.
- **Get-ready step:** add a short screen ("Get your toothbrush ready", then Start) before the clock runs. Start stays the last tap, so the ritual is still hands-free afterwards.
- **No new spoken sentences** (minimal voice rule): on-screen text only.
- **Scope:** both editions and all eight languages, plus a line in How to Play.

**B2. Words that fit 5- to 10-year-olds.**
- **Audit** the player-facing text on the main path (the Prologue, Home, 2-Min Brush and the first city) for reading level.
- **Lead with plain words** and keep the science as an extra ("Learn more"), for example "Quartz" before "Crystalline Quartz (SiO₂)".
- **Owner question:** how far to go, because the science is part of the game's identity.

**B3. Protect the controls.** They are the most praised part. Add no changes to them in this round, and note any regression risk in A1, A2 and B1.

## Not chasing now (questions for the owner)

- **Adults and electric toothbrushes:** the game is for children and parents. Should a parent-facing line explain why a child benefits even with an electric brush?
- **Price:** already free with no ads, which matches what the tester expected. No change.
- **Music and graphics:** they read as neutral. No change.
- **A separate arcade game** built on the city controls: an owner decision, outside this plan.

## Order and checks

1. A1, a small change, first.
2. Then B1, then A2, then B2.
3. Before each push:
   - **Web:** `npx tsc --noEmit`, `npx vitest run`, `npm run build`, plus `npm run i18n:extract` and `node scripts/i18n-native.mjs` when text changes.
   - **Native, on the Mac:** `swift test`, plus the iOS, macOS and watchOS Release builds.
4. **Screenshots:** the Prologue at 360 px in all eight languages.
5. **Next test round:** include an Android 9 or 10 phone, and a child aged 5 to 10 playing with a parent.
