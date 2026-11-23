VERDICT: no. The plan has a circular test order, incomplete shader-failure coverage, and no viable cross-background clock contract for the 3-second lead-in.

MUST-FIX BEFORE BUILD:
1. [Step 0 / A2 Tests] Step 0 requires `?graphicsTest=shaderError` before A2 creates it. The current startup path has no such hook (`src/main.ts:110-124`, `src/engine/render/SceneManager.ts:261-335`). Split Step 0 into baseline reproduction first, then add the DEV hook as A2.1 and reproduce `shaderFailed` afterward.

2. [B1 Changes 3-4] The proposed lead-in cannot catch up after a hidden/locked interval while leaving the timer untouched. Web catch-up only applies when `pacerActive` was already true (`src/engine/ClockController.ts:88-107`), while `startPacer()` always resets elapsed time to zero (`src/engine/ClockController.ts:110-117`). A throttled lead-in callback therefore starts late at 0:00. Record an absolute deadline, add `startPacer(initialElapsedSec = 0)`, and initialize it with `max(0, now - deadline)` on the callback or visibility return. Native can initialize `PacerSessionClock(rawSec:)` similarly (`native-apple/Sources/MouthLifeCore/Config/PacerSessionClock.swift:11-17`). Add hidden/background tests that cross the deadline.

3. [B1 Lead-in / Native] A presentation-only state is insufficient on native because entering `.brushAlong` immediately activates the 3D coaching rig, highlighting and foam from `pacerElapsedSec == 0` (`native-apple/MouthLifeApp/Render/MouthLifeSceneController.swift:323-335`, `:698-735`). Lifecycle code also treats every `.brushAlong` screen as an active ritual and restarts its timer/wake lock (`native-apple/MouthLifeApp/AppCoordinator.swift:1367-1376`, `:1397-1405`). Add an explicit coordinator/renderer state such as `intro`, `leadIn`, `running`; gate coaching, audio, timer restart and wake lock on `running`. Cancel the lead-in task in `returnToHub()`, which currently cancels only the pacer timer (`AppCoordinator.swift:873-881`).

4. [A2 Startup / During play] Warming only Home, Prologue and pacer does not validate all shaders. The pacer group is initially invisible (`src/engine/render/PacerPropRig.ts:106-109`), GlowPass uses a separate scene and three shader passes (`src/engine/render/GlowPass.ts:55-99`, `:131-164`), and cartridge shaders are introduced later through `mountCartridgeMesh()` (`src/engine/render/SceneManager.ts:400-412`). Preserve a separate mounted-cartridge validation step, explicitly exercise GlowPass, and keep the shader-error handler active for runtime first use or enumerate every shader family in warm-up.

5. [A2 Finale fallback] The claimed existing finale shader fallback is not real. `FinaleStage3D.ok` means only that `WebGLRenderer` was constructed (`src/engine/render/FinaleStage3D.ts:1208-1214`); compile errors are swallowed and drawing continues (`:1831-1838`). `CityFinaleOverlay` selects 3D solely from that flag (`src/ui/CityFinaleOverlay.ts:432-449`). Install the same shader-error latch in `FinaleStage3D`, render once offscreen, and set `ok == false` before attachment when validation fails.

6. [A2 During play] The failure event has no complete consumer contract. Today `main.ts` subscribes only to `webgl:lost` for arcade pause (`src/main.ts:418-424`), and `AppEventMap` defines only `webgl:lost/restored` (`src/engine/types.ts:470-471`). Define `webgl:failed` payload and terminal semantics, subscribe in `main.ts`, own one independently mounted modal there, and make its disposer idempotent. Emit `webgl:restored` only after successful validation; the current restore handler emits it immediately after `prewarmShaders()` (`SceneManager.ts:300-305`).

7. [A2 Restore] Rewarming while a ritual or mission is active must not mutate the live scene. Current warm-up temporarily changes scene visibility (`src/engine/render/SceneManager.ts:314-335`), and the proposed three-scene render adds camera/render-target state. Use isolated warm-up scenes or save and restore visibility, camera, render target, viewport, scissor and auto-clear in `finally`, including shader-failure paths.

8. [B1 The flag / Erase Save] The flag is outside the save, but the actual erase paths reset only save data. Web invokes `SaveSystem.resetToFreshSave()` directly (`src/ui/CompanionHubOverlay.ts:2006-2017`), and that method only replaces save storage (`src/engine/persistence/SaveSystem.ts:653-667`). Native’s reset method likewise knows nothing about app-level `UserDefaults` (`native-apple/Sources/MouthLifeCore/Persistence/SaveSystem.swift:851-863`). Add explicit read/mark/clear APIs in `pacerPrefs.ts`, call clear from the web erase handler, and add a coordinator-level native erase operation that clears the defaults key. Verify: identify or add the native Erase Save UI caller; none is wired in the reviewed app UI.

9. [B1 Entry points] Native `startBrushAlong()` currently performs navigation, starts cues, speaks and starts the timer in one method (`native-apple/MouthLifeApp/AppCoordinator.swift:1013-1045`). Split it into request/show-intro, commit/start-lead-in, and begin-running operations. Route Home and `openFromWidget()` through request (`AppCoordinator.swift:270-280`), but route `--mode=brushAlong` through the direct-running bypass (`AppCoordinator.swift:651-655`). [ASSUMPTION] For “Siri launch,” verify: name the AppIntent, shortcut, or URL route that invokes this same request path; the reviewed root exposes only `.onOpenURL` (`native-apple/MouthLifeApp/UI/RootContentView.swift:67-69`).

10. [A1 Views / Translations] “Bind `specimen.shortName`” is not enough on native: the current chip explicitly uses `L10n.t(specimen.name)` (`native-apple/MouthLifeApp/UI/CosmicIntroView.swift:188-200`). Require `Text(L10n.t(specimen.shortName))`; otherwise the new labels remain English while accessibility uses the translated full name.

SHOULD-FIX:
1. [B1 First use] Make commit idempotent and disable the Start button after its first activation. Otherwise rapid taps can schedule multiple lead-ins and permission calls. The motion request must remain synchronously inside that committing click because its API requires a tap (`src/engine/motionPermission.ts:1-16`).

2. [A2 During play] Do not classify a 10-second context-restore timeout as `shaderFailed`; those are different failures. Use a terminal reason such as `context-timeout | shader-failed`, while mapping both to the same generic player-facing card if desired.

3. [A1/B1 Translations] The translation command may finish successfully with missing strings (`scripts/i18n-translate.mjs:183-214`), while tests require only 95% catalog coverage (`tests/i18n.test.ts:98-102`). Add a check that every newly introduced A1/B1/card/error string exists in all seven locale files before generating `L10nCatalogs.swift`.

4. [B1 Gate / Order] Do not gate the independent web-Prologue parity sentence on approval of the 3-second lead-in. Split B1 into ungated copy parity and gated intro/lead-in work so owner question 2 blocks only the behavior it controls.

5. [Order and checks] Give the watch build an exact command and enforce it in CI. The shared `MouthLifeWatch` scheme exists (`native-apple/MouthLife.xcodeproj/xcshareddata/xcschemes/MouthLifeWatch.xcscheme:5-20`), but current native CI builds only iOS and macOS (`.github/workflows/native-apple.yml:49-64`). Add a `generic/platform=watchOS` Release build.

6. [A1 Web] Specify `overflow-wrap:anywhere` or equivalent on `.mohs-chip-name`; `minmax(0,1fr)` alone does not guarantee that a long translated single word fits. The existing chip has a 40px minimum width (`src/styles/main.css:497-515`).

OPTIONAL / NICE-TO-HAVE:
- [A1 Accepted when] Automate the 320/360px eight-language screenshot matrix; current tests do not exercise those viewport/language combinations.
- [A2 Tests] Test repeated loss → restore → loss sequences and terminal late restore, not only one stale timeout.
- [B1 Tests] Add cancellation tests both before and after the lead-in deadline and assert that neither path awards a reward.

CUT THESE (over-engineering):
1. [B1 First-use images] Do not create duplicate native toothbrush/floss assets. The Xcode project already bundles the shared `src/assets/guide` folder (`native-apple/MouthLife.xcodeproj/project.pbxproj:44`, `:138`), and native already loads those files through `TutorialGuideImages` (`native-apple/MouthLifeApp/UI/TutorialView.swift:351-387`). Reuse that loader or a small shared wrapper.
