# MouthLife: next steps plan (2026-11-21)

**Status: built, not committed** (on top of `master` at `6045db4`). Sprints 0 to 3 are built in
both editions; sprint 4 is built except the word rewrites, which wait for the owner's marks on
`docs/word-check.md`; sprint 5's reviews are done and their findings fixed ("After the build" at
the end). Web 472 tests, native 116 tests, the iOS, macOS and watchOS Release builds are clean.
The owner asked for one plan covering the three open steps and a last QA pass, then for it to be
built. Rules that hold throughout: `AGENTS.md`
(both editions match, Apple-simple, non-punitive, nothing leaves the app, 8 languages).

## What the playtests told us (in our own words)

- The five cities feel alike after the first one.
- The first city should teach while the child plays, not before.
- On a phone the player cannot see how far each zone is; the brush could feel better.
- Grown-ups with an electric toothbrush do not see why they would use the 2-Min Brush.
- The words read older than the audience we name.

## What the code says today (checked)

- **All five cities share one shape.** World 64 × 32, start at (7.5, 16) on the left facing east,
  three zones side by side cut at x = 22 and x = 42, every floss gap running east-west.
  (`src/worlds/*Cartridge.ts`; Swift twin `MouthLifeCore/Worlds/WorldCartridges.swift`, written by
  hand, field order differs, **no test compares the two editions**.)
- **The engine already allows more.** Collision, floss zip, gap walls and the grid work for
  north-south gaps, other start points and other sizes. Fixed today: the camera always sits south
  looking north and the stick moves along world x/z (so the camera must not turn); the skyline sits
  on the north edge and its lights follow zones by x; a sealed zone's area is guessed from its
  neighbours (`isPointInSealedSector`), which only holds for one row of zones; the start heading is
  always east.
- **Teaching.** The first Dive opens How to Play first (both editions). In the stage the web has a
  goal line, one-time hints, callouts and direction pills; **the native stage has none of these**
  (`computeObjectiveBreadcrumb` exists in `HudHelpers.swift` but nothing calls it). First-time flags
  live outside the save, so Sync Codes are not touched by them.
- **Zone progress.** Web desktop: `D1 42%` pills. Web phone: the pills are hidden (pause card only).
  Native (not Duo): three seal dots, no per-zone progress, no "you are here".
- **Brush feel.** Native steers straight at the touch (the smoothing the web uses is defined but
  unused); the web has no vibration on phones; the clean chime runs at different rates (web every
  0.22 s, native 0.42 s after 7 cells).
- **Words.** The audience is written down once (`docs/tester-brief.md`: ages 5 to 10). 1,095
  on-screen strings; about 55 use lab words (pH, F⁻, Biophysical, Bio-Actuator, Crystallography,
  EPS, Brush-Along) on the play path.

## A. Every city gets its own shape

Kept: the camera, 64 × 32, zones as side-by-side rectangles along x (skyline lights and sealing
depend on it), and **city 1 exactly as it is** (it is the teaching city; 23 of the 26 How to Play
pictures show it).

Changed for cities 2 to 5: where you start, which way you travel, how wide each zone is, which way
the gaps run, and the wall plan.

| City | Start | Travel | Gaps | Wall plan |
|---|---|---|---|---|
| 1 Toronto | left, middle | west to east | east-west | as today |
| 2 New Orleans | right, middle | east to west | east-west, staggered | a crescent of offset walls |
| 3 Tokyo | centre | outward, both ways | **north-south** | a crossing: an east-west wall with up/down gaps |
| 4 Accra | bottom-left corner | along a shoreline | north-south and east-west | a long shore wall, lagoon above, beach below |
| 5 Orbit | top-right corner | round a ring | both | island walls you circle |

Work:

1. `probeSpawnFacingRad` (optional) on the cartridge, both editions, so a city can start facing its
   first zone.
2. New layouts in `src/worlds/*`, then the Swift twin by hand.
3. **A parity guard:** a small generator (like `scripts/skyline-native.ts`) writes a checksum of
   each cartridge's geometry into Swift; a Swift test compares. Cartridges can no longer drift.
4. Tests: update the ones that hardcode the old layout; make the full-clear sweeps read the
   cartridge; keep "every zone has skyline lights" and "every helper spot is inside its zone".
5. Guide pictures: retake only the dome picture if city 5's dome moves.

## B. Teach while playing, and show the zones on phones

1. **Zone bar (both editions, every phone).** The clean bar becomes three segments, one per zone:
   each fills as its zone gets clean, turns gold with a check when sealed, and the zone you are in
   is outlined. No words. Replaces the native seal dots; on the web phone it replaces the 3 px bar.
2. **A goal line on native.** Wire the existing `computeObjectiveBreadcrumb` into the stage HUD (one
   short line, the phone-short variant the web already has) and the pause card.
3. **First-city coach (both editions).** On a player's first play of city 1 the Dive goes straight
   in. The goal line gives one step at a time: move, sweep the film, wake a helper spot, floss
   through the gap, Scan, Surge, seal the zone. Each step ticks off from an event the game already
   sends, in any order; nothing pauses or blocks; a step the child already did is skipped; it never
   comes back after the first sealed zone. Flags stay outside the save (Sync Codes unchanged). On
   native this also needs the one-time hints and the direction pill the web has.
4. **Brush feel (small).** Native uses the steering smoothing the web has; the web gives a light
   vibration tick on Android when film comes off (never with Reduce Motion); both editions chime at
   the same rate.

## C. 2-Min Brush for every toothbrush, and the audience

1. **Any toothbrush.** One line on the one-time brush card, the How to Play brush card and the
   grown-ups' settings: any toothbrush works, electric too; MouthLife shows where to brush and for
   how long.
2. **Audience.** The owner names the age. Suggested: ages 6 to 12, younger with a grown-up. Written
   once in `AGENTS.md` so every later text is checked against it.
3. **Word check.** A list of every play-path string that reads above the audience, each with a
   plain rewrite (for example "Biophysical Actuator Lab" → "Upgrade Lab", "Brush-Along" → "2-Min
   Brush"). The Prologue and the history almanac keep their science; they get a plain first line.
   The owner sees the list before the strings change, since each change is 8 translations.

## D. Last QA pass

- Per step: `npx tsc --noEmit`, `npx vitest run`, `npm run build`, the i18n scripts when text
  changed, `swift test`, the iOS, macOS and watchOS Release builds.
- Per step: agy and Codex review the diff; their code claims are verified before use.
- Screens: headless, muted browser at phone sizes; the iPhone 18 Pro and iPhone Duo simulators
  (muted), in English, German and Japanese.
- A Sonnet QA pass, then the full review in two passes: web, then native.
- Nothing is committed until the owner says so.

## Sprints: order, code and design (after review)

Reviewed by Codex and twice by agy (2026-11-21; agy's full review is in
`kibitz-runs/2026-11-21-next-steps/agy.md`). Their code claims were checked before being taken.
What changed from the first draft: a groundwork step comes first; the Swift city file is generated
from the web's instead of guarded by a checksum; the coach is shorter and built around where city
1's first gap really is; all new text is translated once, in sprint 4; brush feel is smaller.

Every sprint ends the same way: both editions match, every check in section D is green, agy and
Codex have reviewed the diff, the owner gets a short report, and nothing is committed until the
owner says so.

### Sprint 0: groundwork (no change on screen)

1. **One source for the cities.** `scripts/cartridge-native.ts` writes
   `MouthLifeCore/Worlds/WorldCartridges.swift` from `src/worlds/*Cartridge.ts` (`--write`,
   `--check`). Checked first: its output equals today's hand-written file apart from two comments,
   so the editions agree today. A web test fails when the Swift file is stale (as
   `tests/citySkylines.test.ts` does for skylines).
2. **Tooth seams only at tooth-to-tooth walls.** `computeToothSeamsX` (`CartridgeMeshBuilder.ts`,
   `ProceduralMeshBuilder.swift`) takes the middle of every wall as a seam; a sideways wall would
   pinch the gum where there is no gap between teeth. Count only narrow dividers. Today's five
   cities must give exactly the same seams as before (tested).
3. **`probeSpawnFacingRad`** (optional, default 0): `types.ts`, `Types.swift`, the generator,
   `WorldSession.ts:197`, `WorldSession.swift:305`.
4. **Native gap marker points through the gap**, as the web's does
   (`MouthLifeSceneController.swift`, `EntityBatchRenderer.ts`).

### Sprint 1: see your progress (B1, B2)

- **Shared model, pure and tested twice.** `zoneIndexAt(x, z, districts)` (inside, else nearest)
  and `zoneBarModel(districtClean, sealed, hereIndex)` → one entry per zone: `fill` 0-1, `sealed`,
  `here`. Web `src/ui/hudHelpers.ts` (`tests/objectiveBreadcrumb.test.ts`), Swift
  `MouthLifeCore/Sim/HudHelpers.swift` (`MouthLifeCoreTests`), the same cases on both sides.
- **Web.** `TelemetryHudOverlay.ts`: the clean bar becomes one segment per zone (the rescue stage
  keeps one bar); desktop keeps its `D1 42%` pills. `main.css`: on phones the 3 px bar becomes the
  zone bar. Updated in the existing 10 Hz refresh, DOM touched only when a value changes.
- **Native.** `ArcadeHudView.swift`: `cleanGauge` draws the same segments instead of the dots and
  the single bar; the Duo's book page keeps its overall bar beside the zone chips; the Duo's stacked
  page gets the goal line too. The goal line reads the 20 Hz snapshot, never the live session
  (the render thread owns that): `computeObjectiveBreadcrumb(snapshot:cartridge:)` and a Swift
  `compactObjectiveBreadcrumb`. The pause card shows the full line.

### Sprint 2: the first city teaches (B3, B4)

- **A pure coach, twice.** `src/config/firstCityCoach.ts`, `MouthLifeCore/Config/FirstCityCoach.swift`,
  one set of test cases. City 1's first zone has no floss gap (the first is in zone 2), so:
  1. **Sweep the film** — done on `actuator:scrub` with newly cleaned cells (touch moves and brushes
     at once, so "move" is not its own step).
  2. **Wake a helper spot** — `site:restored`.
  3. **Try Scan** — `disclose:pulsed`; skipped if Surge fills first.
  4. **Fire Surge** — shown only once `surge:ready`; done on `rinse:surged`.
  5. **Seal the zone** — `district:sealed`.
  6. **Floss through the gap** — shown only near a gap mouth in zone 2; done on `floss:sliced` with
     `zipped`.
  Steps tick off in any order; nothing pauses or blocks. It ends after the first sealed zone and one
  zip, or when city 1 is finished, and never for a player who already finished city 1. The flag
  lives with today's hints (`mouthlife.hintsSeen`), so Sync Codes are untouched.
- **Where it shows.** The goal line; the button a step names pulses.
- **The first Dive** still opens How to Play first (the owner's call of November 2026); the coach
  then teaches in play. Going straight in is owner question 1 and is not built.
- **Native catches up with the web:** the one-time hints (same English keys, so the translations
  are shared), one direction pill from `computeWayfinder` carried on the snapshot, and city 1's
  intro toast held back for new players as the web does (`shouldShowDiveIntroToast`).
- **Brush feel.** Built: the native brush sound is fed the cells really cleaned, from a running
  count on the stage's snapshot. (It was estimated from the change in the clean percentage, which
  rounded to zero on nearly every frame, so the bite and the chime hardly ever sounded.) Measured,
  a sweep cleans about sixty cells a second, so the sound now takes three cells in a step as its
  full bite and chimes once per sixty cells: about one chime a second of real sweeping. **This is
  a change the owner should listen to on a device.** Not built, on
  the reviewers' advice, until the owner says what felt off: steering smoothing on native, one chime
  cadence for both editions (web 0.22 s, native 0.42 s), and phone vibration on the web.
- **Found on the way, fixed in both editions:** goal lines for touch screens are whole sentences
  without keyboard hints (cutting "[Q]" out of a translated line left Japanese starting
  mid-sentence), and the rescue countdown is one sentence, so it translates whole.

### Sprint 3: five different cities (A)

1. **Rules as tests, both editions:** the start is on the play area and clear of walls; every helper
   spot, sugar crystal and spring can be reached from the start (walking, with floss gaps counted
   as crossings); every zone has skyline lights; zones stay left to right; the outer bounds stay
   3/61/5/27 (`QAFixTests`).
2. **One city per commit** (2, 3, 4, 5): edit `src/worlds/*`, run the generator, fix that city's
   tests, play it once in a muted browser and in the simulator. agy's concrete layouts are the
   starting point:
   - **2 New Orleans:** start on the right facing west; two full north-south walls with one
     east-west gap each (high, then low) and a spur between them.
   - **3 Tokyo:** start bottom-centre facing up; one full east-west wall with three north-south
     gaps.
   - **4 Accra:** start bottom-left; a full east-west shore wall with two north-south gaps (one
     beside the start, into the pocket behind the jetty; one at the far end, into the lagoon) and a
     jetty with an east-west gap between pocket and lagoon: a loop. (First built as a one-way U
     trip; the review showed the starting zone could then only be finished last.)
   - **5 Orbit:** start top-right facing west; an open ring round a walled core, entered by a
     north-south gap in its north or south wall. (First built with east-west gaps too; they stood
     so close to the slime domes that a Floss cast there zipped through the gap instead of cutting
     the dome. A test now keeps every dome clear of every gap mouth.)
3. Retake the dome How to Play picture if city 5's dome moves.

### Sprint 4: the words (C1, C2, C3)

- The audience line goes into `AGENTS.md` and `docs/tester-brief.md`.
- **Any toothbrush** (C1): the one-time brush card (`brushIntroCard.ts`, native `BrushIntroCard`),
  the How to Play brush card (within its length limit) and the grown-ups' settings.
- `scripts/i18n-readability.mjs` (new, small): lists play-path strings with long or lab words, by
  source file, with a suggested plain rewrite. The owner approves the table.
- Then one translation run for everything new since sprint 1: `npm run i18n:extract`,
  `node scripts/i18n-translate.mjs <lang>` for the 7 other languages, stale keys pruned,
  `node scripts/i18n-native.mjs`.

### Sprint 5: last QA pass (D)

A Sonnet QA pass, then the full review: one pass over the web edition, one over the native edition
(each claim checked by a build or a simulator screenshot before it is acted on), then fixes.

## Questions for the owner

1. The first Dive opens How to Play today (your earlier call). With the coach, should the Dive go
   straight in? Suggested: yes; How to Play stays on Home's ? button.
2. The audience: ages 6 to 12?
3. Brush feel: what felt off? The three small changes in B4 are our best reading.
4. City 1 stays as it is. Agreed?

## After the build: what the reviews found (2026-11-21)

Each sprint's diff was reviewed by agy and Codex; the finished whole by a Sonnet QA pass and two
full passes, one over the web edition and one over the native edition. Every claim was checked
against the code, a test, a build or a screenshot before it was acted on; one was wrong (that the
Mac build would fail) and was dropped.

Fixed because of the reviews:

- Japanese goal lines started mid-sentence on phones, because "[Q]" was cut out of a translated
  line (an older bug on the web's phones too). Touch screens and the native app now use goal lines
  written without keys.
- City 5's domes beside gap mouths, and city 4's first zone finishable only last (above).
- Surge was shown as ready at 99.5% on the web, a moment before it would fire.
- On native: a stage's late events could reach the coach, the hints and the toasts after the stage
  was left; a Home toast could leave a stage toast stuck; the camera opened each stage on where the
  last stage's ship stood and panned across; the Duo's map drew no walls; three pills did not fit a
  phone in German; a touch that started on the goal line did not reach the tooth.
- The "sealed" check on the web's zone bar was 0.4 px wide; zones had no text for screen readers.
- The Tokyo and Accra skies were still cut at the old zone edges.

Left for the owner (not built):

1. The first Dive still opens How to Play first (question 1).
2. The audience (question 2), and the rewrites in `docs/word-check.md`.
3. Brush feel: the new native chime (above); steering smoothing on native; one chime cadence for
   both editions (the web chimes at most every 0.22 s on any cleaning).
4. Native shows the sore-gum and slime-dome reminders as a toast at most every 6 s; the web shows
   a one-time hint and a small callout on the tooth. The web also has callouts and toasts the
   native app does not (dome cracked, Miswak boost, sweet sip, Habit Beacon, floss zip).
5. In cities 3 to 5 the walls run across the zones, so a player who cleans room by room seals a
   first zone later than before (a test bot: 226 s, 144 s before the city 4 fix, 180 s; all four
   cities still finish under par).
6. The new text was machine-translated by the project's script; `node scripts/i18n-review.mjs
   <lang>` or a native speaker should read the 30 new lines per language.
7. Not checked on a device or by touch: the simulator on this Mac can launch and screenshot but
   not tap (that needs `xcode-select` pointed at Xcode, which takes the owner's password).
