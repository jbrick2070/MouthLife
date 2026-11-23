VERDICT: build-ready as-is? no — B1b is simultaneously deferred and scheduled, A2 does not guarantee a runtime finale fallback or stop terminally failed rendering, and the lead-in state contract remains ambiguous.

MUST-FIX BEFORE BUILD:

1. [B1b / Owner questions / Order and checks] B1b is listed under “Owner questions (not built this round)” but also appears in commit pairs and build order. Fix by either removing B1b from this build or recording approval of “3 seconds before every phone/computer brush” and relabeling question 2 as resolved.

2. [A2.1 / A2.2] The finale fallback works only if `stage.ok` is false during construction; `CityFinaleOverlay` checks it once and then always calls the 3D renderer (`src/ui/CityFinaleOverlay.ts:432-449`, `:558-568`). Additional city reliefs are created lazily during ending credits (`src/engine/render/FinaleStage3D.ts:1842-1862`, `:2460-2469`), so a later shader failure cannot select the 2D show. Add a terminal failure callback or per-frame `ok` check that disposes the 3D stage and continues the 2D show at the same timeline position. Clarify “no 2D fallback” as “no main-game 2D fallback”; the finale explicitly retains one.

3. [A2.2] A runtime shader failure shows a card but does not explicitly stop renderer work. The render loop calls `SceneManager.renderFrame()` continuously (`src/main.ts:932-968`), whose current guard checks only `webglAvailable` (`src/engine/render/SceneManager.ts:530-532`). Define a terminal graphics state for compile failure and context timeout; after emitting one idempotent `webgl:failed`, all subsequent scene updates/renders must return immediately, including after a late restore.

4. [B1b States / Web] The proposed `intro → leadIn → running` state list omits the existing `summary` state, and the cited startup work is in `BrushAlongOverlay.mount()`, not its constructor (`src/ui/BrushAlongOverlay.ts:104-108`, `:216-250`). Define a separate start phase alongside the existing `running | summary` view, or specify the complete state machine including `summary`. State exactly when the overlay/native `.brushAlong` mode mounts, where the intro is rendered, and which transition owns cancellation.

5. [B1b Lead-in timing] Late hidden/locked return is underspecified. `initialElapsedSec` can place the ritual partway through brushing or beyond a stage boundary, but the plan does not say whether `beginRunning()` announces Q1, the current phase, or multiple catch-up cues. Define exact 3/2/1 visual-pip boundaries and require one current-phase cue only after catch-up. Test a short overrun and an overrun crossing 120 seconds. Existing clocks carry stage overflow (`src/engine/ClockController.ts:110-140`, `native-apple/Sources/MouthLifeCore/Config/PacerSessionClock.swift:42-65`).

6. [B1b Commit tap] The plan drops the current condition around motion permission. Today it is requested only when rinse is enabled and Reduce Motion is off (`src/main.ts:780-784`); `requestMotionPermissionIfNeeded()` must remain inside a tap (`src/engine/motionPermission.ts:1-16`). Preserve that exact condition at commit to avoid unnecessary sensor prompts.

7. [B1a] The citation and acceptance scope are wrong. `src/ui/CosmicIntroOverlay.ts:77` is the fourth beat’s tag; the body to replace is at `:79`. Native’s matching body is at `native-apple/MouthLifeApp/UI/CosmicIntroView.swift:43`, but the titles and kickers differ. Specify “fourth beat body matches” rather than “beats match word for word,” and add a source-parity assertion for that body.

8. [Step 0 / A1 Accepted when] The required tester videos have not arrived, yet A1 cannot close until “the tester’s video matches.” Define this as a hard pre-build gate, or allow implementation now but prohibit production closure until the video confirms the reported screen. Do not leave acceptance impossible to execute.

SHOULD-FIX:

1. [A1 Web / Native] “Keep the 40 to 44 px touch height” can be read as a maximum and conflict with two-line translations. Current web CSS specifies a 44 px minimum (`src/styles/main.css:497-515`), while native content uses a 40-point minimum plus padding (`native-apple/MouthLifeApp/UI/CosmicIntroView.swift:188-213`). State minimum hit-target sizes and explicitly allow growth.

2. [A2.1 Startup warm-up] Drawing “to the canvas” regresses the prior offscreen requirement and may expose the validation frame before UI mounts. [ASSUMPTION] Use a temporary render target or keep the canvas hidden until validation completes. Enumerate render target, viewport, scissor, clear state, camera, visibility and culling among the state restored in `finally`.

3. [B1b Commit tap] “Warms speech synthesis” is not an executable contract; `VoiceCoach` currently only touches `getVoices()` during construction (`src/engine/audio/VoiceCoach.ts:68-80`). [ASSUMPTION] If Safari requires gesture-time priming, name a silent `VoiceCoach.prime()` behavior that cannot add spoken words, and verify the first delayed quadrant cue on iPhone Safari.

4. [Screenshots / Native checks] Replace “smallest iPhone,” “largest standard Dynamic Type,” and “longest language” with an exact logical width/device, Dynamic Type category, and locale. Otherwise two implementors can legitimately run different acceptance matrices.

5. [Order and checks / CI] Specify the complete watchOS CI command and configuration. The current workflow builds only Debug iOS Simulator and Debug macOS (`.github/workflows/native-apple.yml:49-64`); “add the watchOS build” does not say whether CI must match the required Release generic-device build.

OPTIONAL / NICE-TO-HAVE:

- [A2 Cards] Give the terminal card modal focus/inert behavior and a Reload action; otherwise keyboard focus may remain in the obscured UI.
- [A1 Screenshots] Automate the 320/360-by-eight-language web matrix.
- [B1b Tests] Add a full first-use-to-summary UI test so the new preparation phase cannot strand or remove the existing summary.

CUT THESE:

1. [A2.1] Cut the explicit `renderer.compile()` before the validation draw. The real draw is required to exercise shader use; the current compile-only warm-up is precisely the path being replaced (`src/engine/render/SceneManager.ts:314-335`).

2. [B1b] Unless the owner explicitly requires it, cut the three-second lead-in while retaining the first-use real-brushing card. The Prologue copy plus one-time Start card solves the observed comprehension problem without dual-platform deadline, background, cue and lifecycle machinery.

3. [Who builds what] Cut branch-rebase and commit-order choreography from the product plan. Keep only atomic parity requirements and required checks; repository coordination does not define product behavior.

VERIFY-AT-BUILD checklist:

- [ ] Verify: obtain the tester videos and confirm the reported overlap is the Mohs screen and what the Pixel 2 displayed.
- [ ] Verify: launch Chrome with `--disable-webgl`; the translated unavailable card appears and no blank canvas remains.
- [ ] Verify: `?graphicsTest=shaderError` triggers the startup failure card in development, and the production bundle contains neither the switch nor invalid shader.
- [ ] Verify: force `WEBGL_lose_context`; test restore before 10 seconds, timeout, failed restore, stale timeout, repeated loss, and ignored late restore.
- [ ] Verify: during forced loss, Arcade/Pulp Rescue pause while a running 2-Min Brush keeps its clock, earcons and minimal voice.
- [ ] Verify: inject a failure on first cartridge shader use; exactly one terminal event/card occurs and per-frame renderer work stops.
- [ ] Verify: inject finale failures both at attachment and on a lazily created credit-city relief; the 2D show continues at the same timestamp.
- [ ] Verify: first-use, returning-use, storage-unavailable, web Erase Save, native widget/URL, and `--mode=brushAlong` routes follow the finalized transition table. The current native test argument directly calls `startBrushAlong()` (`native-apple/MouthLifeApp/AppCoordinator.swift:651-655`).
- [ ] Verify: hidden/locked lead-in catch-up on web and native excludes the three-second lead-in from rewards, announces only the current phase, and handles stage-crossing overruns.
- [ ] Verify: on iPhone Safari, the commit tap preserves conditional motion permission and the delayed first voice cue actually plays.
- [ ] Verify: every new key exists in all seven locale catalogs and regenerated `L10nCatalogs.swift`; `tests/i18n.test.ts` currently permits up to 5% missing coverage.
- [ ] Verify: A1 passes the exact 320/360 web matrix and the newly specified native device/Dynamic Type/locale matrix without clipping.
- [ ] Verify: web tests/build, Swift tests, Release iOS/macOS/watchOS builds, and the added watchOS CI job all succeed.
