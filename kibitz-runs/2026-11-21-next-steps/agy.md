# Review of `docs/next-steps-plan.md`

## 1. Order

The five-sprint order is nearly right, with **one fix**: move **C1 ("any toothbrush") from Sprint 1 to Sprint 4**. `tests/i18n.test.ts:68-78` runs `i18n-extract.mjs --check` and `i18n-native.mjs --check` every test pass, and Section D captures DE/JA screenshots per sprint; batching copy changes in Sprint 4 avoids double translation or English leaks.

1. **Sprint 1 (B1, B2):** Zone bar + native goal line; creates the HUD slot (`ArcadeHudView.swift:130-133`, `TelemetryHudOverlay.ts:369`) Sprint 2 needs.
2. **Sprint 2 (B3, B4):** First-city coach, native hints/wayfinder, brush feel; settles City 1 onboarding and `WorldSession` before layout work.
3. **Sprint 3 (A):** Five city layouts via `scripts/cartridge-native.ts` after `WorldSession` stabilizes.
4. **Sprint 4 (C1, C2, C3):** Audience rule, "any toothbrush" copy, readability pass, and one 8-language refresh.
5. **Sprint 5 (D):** Final QA pass over finished layouts, HUD, coach, and localized copy.

**Parallel:** Sprint 1 web HUD (`TelemetryHudOverlay.ts`, `main.css`) with native HUD (`ArcadeHudView.swift`, `RootContentView.swift`) once `zoneBarModel` tests lock; Sprint 2 audio/haptics with coach UI. **Serial (shared files):** Sprints 2 & 3 (`WorldSession.ts`/`.swift`), Sprint 3's cities (`WorldCartridges.swift`, `tests/multiCityCartridges.test.ts`), and any two copy commits (`strings.en.json`, `L10nCatalogs.swift`).

## 2. Organization

Every commit editing visible English must run `npm run i18n:extract` and `node scripts/i18n-native.mjs` (`tests/i18n.test.ts:68-78`).

- **Sprint 1 (2 commits):** (1) Pure `zoneBarModel`, `zoneIndexAt`, Swift `compactObjectiveBreadcrumb` + tests (`src/ui/hudHelpers.ts`, `HudHelpers.swift`, `tests/objectiveBreadcrumb.test.ts` — `tests/hudHelpers.test.ts` does not exist — and `MouthLifeCoreTests.swift`). (2) Web + native HUD wiring (`TelemetryHudOverlay.ts`, `main.css`, `ArcadeHudView.swift`, `RootContentView.swift`) + i18n refresh.
- **Sprint 2 (3 commits):** (1) Pure `FirstCityCoach` + tests (`src/config/firstCityCoach.ts`, `MouthLifeCore/Config/FirstCityCoach.swift`). (2) Coach UI, native hints/wayfinder, drop first-Dive How to Play gate (`CompanionHubOverlay.ts:218-225`, `AppCoordinator.swift:922-929`, update `tests/tutorial.test.ts:360-369`), translate new coach strings. (3) Brush feel (native steer smoothing, web vibration, unified chime).
- **Sprint 3 (7 commits):** (1) Commit `scripts/cartridge-native.ts`, regenerate `WorldCartridges.swift`, add freshness test (like `tests/citySkylines.test.ts:276-279`), fix `computeToothSeamsX` (`CartridgeMeshBuilder.ts:299-308`, `ProceduralMeshBuilder.swift:2739-2748`). (2) Add optional `probeSpawnFacingRad` (`types.ts`, `Types.swift`, `WorldSession.ts:197`, `WorldSession.swift:305`, `scripts/cartridge-native.ts`). (3) Port reachability tests (`tests/multiCityCartridges.test.ts:55-246`) to Swift; make sweeps read `playableBounds`. (4–7) One commit per city (2–5): edit `src/worlds/*.ts`, run `cartridge-native.ts --write`, update hardcoded tests, retake `slime-dome.jpg` if City 5's dome moves.
- **Sprint 4 (2 commits):** (1) Audience note (`AGENTS.md`, `docs/tester-brief.md`) + `scripts/i18n-readability.mjs` report. (2) Approved C1 + C3 rewrites, `i18n:extract`, 7-language translate + stale-key prune, `i18n-native.mjs`.
- **Sprint 5:** One paired commit per QA fix cluster.

## 3. Architecture, sprint by sprint

- **Sprint 1:** Pure `zoneBarModel` at 10 Hz (`TelemetryHudOverlay.ts:1114-1117`) / 20 Hz (`AppCoordinator.swift:159-170`) adds zero per-frame work; render 1 bar for Pulp Rescue. **Better native shape:** don't call `computeObjectiveBreadcrumb(for: WorldSession)` from SwiftUI (render thread mutates `WorldSession`). Add `computeObjectiveBreadcrumb(snapshot:cartridge:)` + `compactObjectiveBreadcrumb` in `HudHelpers.swift` reading `SessionSnapshot` only. Keep Duo `missionPanel` (`ArcadeHudView.swift:401-410`) on an overall bar so it doesn't duplicate `districtChip`s.
- **Sprint 2:**
  - **Move steer smoothing to input:** Web keeps `steerSmooth` in `InputManager.ts:553-563`. Put it in `MouthLifeSceneController.swift:848-857` (reset in `resetStageInput():435` and when `directTouchWorldPos == nil`) rather than `WorldSession.swift:518-522`, keeping sim tests deterministic.
  - **Fix native cell count before unifying chimes:** `AppCoordinator.swift:558-560` guesses `Int((deltaClean * 1400.0).rounded())` on an ~18k-cell grid (`CELL_SIZE = 0.25`, `gameConfig.ts:4`). Accumulate exact `newlyCleaned` from `.actuatorScrub` (as `src/main.ts:384-389` does), then share one rule in `SoundEngine.ts:1318` and `NativeSoundEngine.swift:2848`.
  - **Reuse existing Swift helpers:** `computeWayfinder(for:)` (`HudHelpers.swift:147-238`) and `hintsStorageKey`/`decodeSeenHints`/`encodeSeenHints` (`HudHelpers.swift:639-654`) already exist. Expose `wayfinder: WayfinderArrow?` on `SessionSnapshot` in `makeSnapshot()` (20 Hz, zero 120 Hz cost). Match `TelemetryHudOverlay.ts:877-920, 1081-1086, 1278-1291` English keys verbatim to share translations.
- **Sprint 3:** **Drop `CartridgeChecksums.swift` and manual Swift edits.** Untracked `scripts/cartridge-native.ts` already generates `WorldCartridges.swift` from `src/worlds/*Cartridge.ts` and throws on missing fields (lines 237–240); just add `probeSpawnFacingRad`.
- **Sprint 4:** `scripts/i18n-extract.mjs:250-351` already scans Swift. Tag strings by source file in `i18n-readability.mjs` to separate play-path UI from Almanac/Prologue science.
- **Sprint 5:** Confirm stale locale keys are pruned (`tests/i18n.test.ts:91` fails at `>= 25`).

## 4. City shapes (sprint 3)

**Kept constraints:** Camera, 64×32, bounds `3/61/5/27` (`QAFixTests.swift:43`, not 46; lines 46–47 check alley endpoints), and side-by-side X zones hold: `skylineDistrictIndex` (`citySkylineGeometry.ts:505-517`, `CitySkylineBuilder.swift:106-108`) maps lights by `worldX` (`<` tie-break starves stacked Z zones and fails `tests/citySkylines.test.ts:237-247`). Keep `districts[]` sorted left-to-right so Zone Bar, skyline, and `StageMapView` match. (`isPointInSealedSector`, `WorldSession.ts:1230-1239`, checks all 4 sides, though it fails on L-shapes.)

**What breaks:**
1. **`computeToothSeamsX` (`CartridgeMeshBuilder.ts:299-308`, `ProceduralMeshBuilder.swift:2739-2748`):** Uses `(w.minX + w.maxX) * 0.5` for *every* `wallBox`, carving false gum pinches for horizontal walls (Tokyo, Accra) and islands (Orbit). Restrict to vertical walls reaching gum edges (`maxZ-minZ > maxX-minX`, touching `z <= 5.5` or `z >= 26.5`).
2. **Tokyo spawn `(32, 16)`** collides with an E-W wall at `z = 16`.
3. **Orbit open islands** drop `walkRegionsHoldingTargets` (`tests/multiCityCartridges.test.ts:122, 231-233`) to `1`, making Floss Zip optional.
4. **N-S alleys:** `buildAlleyWalls` (`CollisionSystem.ts:79-97`) insets flanks by `0.5525u`; `tryStartCapillaryZip` (`CollisionSystem.ts:239-242`) rejects exits within `0.95*PROBE_RADIUS` of walls. Bridges must run **E-W** for `segmentsIntersect2D` (`tests/multiCityCartridges.test.ts:216`).
5. **Hardcoded tests:** `tests/multiCityCartridges.test.ts` (W2:337/373; W3:431/445; W4:497/512; W5:562/603/606; `WALK_REGIONS`:122) and `MouthLifeCoreTests.swift:117, 196`.

**Concrete layouts (`3..61 × 5..27`, left-to-right X zones):**
- **2 New Orleans (E→W):** Spawn `(56.5,16)` facing `π`; zones `2.5–21/21–43/43–61.5`; full N-S walls `x=41.5..44.3` (E-W gap `z=10`) and `x=20.5..23.3` (E-W gap `z=22`), plus spur `x=31..33.8, z=11..21`. `WALK_REGIONS=3`.
- **3 Tokyo (centre outward):** Spawn `(32,21.5)` facing `-π/2`; zones `2.5–20/20–44/44–61.5`; full E-W wall `z=13..15.5` (keeps `(10,16)`/`(16,16)` clear) with 3 N-S gaps (`z=12.4↔16.1`) at `x=12,32,52` + E-W bridges. `WALK_REGIONS=2`.
- **4 Accra (shoreline U-loop):** Spawn `(7.5,22.5)` facing `0`; zones `2.5–24/24–42/42–61.5`; full E-W shore wall `z=15.25..17.75` (N-S gaps `x=32,52`, `z=14.7↔18.3`) + N-S lagoon jetty `x=22.6..25.4, z=5..15.25` (E-W gap `z=10`). `WALK_REGIONS=3`.
- **5 Orbit (ring + walled core):** Spawn `(56,8.5)` facing `π`; zones `2.5–19/19–45/45–61.5`; open outer ring around hollow core (`x=21..43, z=10..22`, `wallThickness=1.8`) with 2 N-S gaps (`x=32`) and 2 E-W gaps (`z=16`). `WALK_REGIONS=2`.

## 5. First-city coach (sprint 2)

**Critical flaw:** City 1 District 0 (`x: 2.5..22`, `WorldCartridges.swift:17-73`) has **no floss gap** — the first gap (`alley_premolar_north`) is in District 1 at `x=30.2`. Prompting `floss` before `seal` and retiring on Zone 1 seal either strands a child in District 0 or retires before they see a gap. Also, Surge is disabled below 100 (`WorldSession.ts:607`, `ArcadeHudView.swift:574`), and touch moves + scrubs together (`MouthLifeSceneController.swift:852`).

**Better 6-step flow (2 beats, non-blocking):**
1. **Sweep film** (`move`+`sweep` merged): `actuator:scrub` with `newlyCleaned >= 4`.
2. **Wake a helper spot:** `site:restored`.
3. **Try Scan** (skip if Surge fills first): `disclose:pulsed` (pulse Scan).
4. **Fire Surge** (only after `surge:ready`; else show breadcrumb): `rinse:surged`.
5. **Seal Zone 1:** `district:sealed`.
6. **Floss a gap** (only when `findNearestZipMouth`/`nearestZipMouthHint` reports `blockedToWalking` in District 1): `floss:sliced` with `zipped: true`.

Retire after Zone 1 seals *and* one zip completes (or `world_1` completes), stored in `mouthlife.hintsSeen` (`hudHelpers.ts:189`, `HudHelpers.swift:639`), preserving `ML2:` Sync Codes. Gate native's frame-0 toast (`AppCoordinator.swift:840`) with `shouldShowDiveIntroToast` (`HudHelpers.swift:656-664`).

## 6. Missing, risky, or too big

- **Missing:** (1) Update `tests/tutorial.test.ts:360-369` (asserts first Dive opens How to Play). (2) Native C1 card is `BrushIntroCard` (`RootContentView.swift:447`, not `BrushIntroSheet`); settings live in `ProfileAndSettingsSheet.swift:191-215` and `CompanionHubOverlay.ts:926`; `tutorial.ts:87` has a 125-char test cap (`tests/tutorial.test.ts:65`, now 91) — tighten, don't append. (3) Sprint 4's ~55 rewrites trip `tests/i18n.test.ts:91` (`unknown < 25`) unless stale keys are pruned from `locales/*.json`. (4) Duo stacked mode (`ArcadeHudView.swift:241-248`) uses `topStrip` and needs the goal line.
- **Risky:** Guard web `navigator.vibrate(8)` with `'vibrate' in navigator && input.hasSeenTouch()` + `try/catch` (iOS Safari no-op, Chrome gesture gate). Watch DE/JA label overflow on phones in Sprint 4.
- **Cut/shrink:** Drop `CartridgeChecksums.swift` (use `scripts/cartridge-native.ts`). On native, show one compact `computeWayfinder` pill instead of porting web's multi-slot 3D-projected `tickWayfinders` (`TelemetryHudOverlay.ts:1446-1515`).
