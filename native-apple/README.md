# MouthLife — Ground-Up Native 120Hz ProMotion Edition (`native-apple/`)

100% native Swift 6 + Metal + SceneKit + `AVAudioEngine` + `AVSpeechSynthesizer` + `CoreMotion` + `CoreHaptics` + `SwiftUI` for **iOS, iPadOS, and macOS** (`bundleID: org.mouthlife.plaque`). **Zero WebViews, zero JS wrappers.**

---

## 1. Build & Test Commands

```bash
cd native-apple

# Run all 15 deterministic MouthLifeCore XCTest suites (~0.7s)
swift test

# Build iOS Release (headless, no signing needed for CI check)
xcodebuild -project MouthLife.xcodeproj -scheme MouthLife -configuration Release \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build

# Build macOS Release (headless)
xcodebuild -project MouthLife.xcodeproj -scheme MouthLife -configuration Release \
  -destination 'generic/platform=macOS' CODE_SIGNING_ALLOWED=NO build

# Open in Xcode for Simulator or physical 120Hz ProMotion iPhone deployment
open MouthLife.xcodeproj
```

---

## 2. Module & File Map

### `Sources/MouthLifeCore/` (Pure Cross-Platform Swift Engine — Zero UIKit/AppKit Dependencies)
- **`Types.swift`** — Core models (`SaveDataV2`, `PacerStage`, `FlossToolStyle`, `MouthwashDurationStyle`, `WorldId`, `EventBus`, `WorldSessionSnapshot`).
- **`Config/GameConfig.swift`** — Tuning constants (`brushAlongTotalSec = 120`, `brushAlongFlossBonusSec = 45`, `brushAlongMouthwashBonusSec = 60`, `brushAlongMouthwashQuickSec = 30`, rewards `50 + 25 + 25 = 100 F⁻`, Stephan pH & Saliva Stasis floors).
- **`Config/BrushCoachSystem.swift`** —
  - `CoachLanguage` (8 languages: `en`, `es`, `fr`, `ja`, `zh`, `ko`, `pt`, `de` with system-locale auto-detection).
  - `BrushQuadrant` (`Q1` Upper-Right → `Q2` Upper-Left → `Q3` Lower-Left → `Q4` Lower-Right) & `BrushSurface` (`outerCheek`, `chewingGrooves`, `innerTongue`).
  - `BrushPhaseState`: deterministic timeline evaluator across `.brushing` (`12 × 10s`), `.flossBonus` (`45s` Upper → Lower), and `.mouthwashBonus` (`60s` or `30s` split into 3 equal swish sub-phases), including `countdownPip` (`3, 2, 1` in the final 3s) and `0.85s` quadrant `preEcho01`.
  - `BrushCoachCopy`: glanceable 3-foot mirror UI headlines, spoken voice cues, 30-minute post-rinse lock-in reminder, and gyro status badges in all 8 languages.
  - `GyroSloshSim` & `GyroSloshSnapshot`: deterministic 120Hz counter-vs-handheld motion classifier + shallow-water spring-damper mouthwash slosh physics (`sloshPosition`, `pumpPulse01`, `leftCheekCharge01`, `rightCheekCharge01`, `swishCount`, `didTriggerSplash`, `splashPan`, and drift-free `parallaxX`/`parallaxY`).
- **`Config/DentalChart.swift`, `CharityInfo.swift`, `HostsAndHistory.swift`, `UpgradeCatalog.swift`** — 32-tooth clinical atlas (`Universal #1–#32`, `FDI 11–48`, `Palmer` + Spot Quiz), `SmileOnU.org` 501(c)(3) external links, 5 Host Cities, and Biophysical Actuator upgrades.
- **`Surface/OralSurfaceGrid.swift` & `OralChemistrySim.swift`** — `256×128` (`128×128` Pulp Rescue) enamel surface grid, dirty sub-rectangle `RGBA8Unorm` packing (`SurfaceDirtyRect`), `O(1)` equilibrium chemistry fast-path, Stephan `20s` acid curve, Hydroxyapatite (`pH 5.5`) vs. Fluorapatite (`pH 4.5`), and 1948 Bass 45° sulcus care.
- **`Physics/CollisionSystem.swift`, `Scoring/ScoringEngine.swift`, `Sim/WorldSession.swift`, `Worlds/WorldCartridges.swift`** — Interdental alley walls, `0.22s` Capillary Tether-Zip, `10,000`-pt 4-pillar scoring (`250` Par Time floor), and `world_1`..`world_5` + `pulp_rescue`.
- **`Companion/CompanionArchSim.swift` & `CompanionTouchSystem.swift`** — `12h` Smooth Bask (`72 F⁻` reservoir), `90-day` Saliva Stasis (`>= 45%`), 14-crown pentatonic glass-harp rubbing, and zero-permadeath `50%` Ca(OH)₂ Pulp Rescue stabilization.
- **`Persistence/SaveSystem.swift` & `HabitBank.swift`** — `UserDefaults` + optional iCloud `NSUbiquitousKeyValueStore`, V1→V2 migration, daily `2 full + 3 courtesy tip` Brush-Along cap, and cross-platform `ML2:` Base64URL Sync Codes.

### `MouthLifeApp/Render/` (120Hz ProMotion Metal & SceneKit Pipeline)
- **`EnamelShaders.swift`** — Custom Metal `.geometry`, `.surface`, and `.fragment` shader modifiers + `< 0.02 ms` unified-memory `MTLTexture.replace` dirty-subrect uploader + shadow-state uniform guards.
  - **Packed `float4x4 waveMatrix` Uniform Convention on Enamel Materials:**
    - `waveMatrix[0]` (`row0`): `(discloseOriginX, discloseOriginZ, discloseRadius, discloseAlpha)`
    - `waveMatrix[1]` (`row1`): `(rinseOriginX, rinseOriginZ, rinseRadius, rinseStrength)` — **Note:** during `.mouthwashBonus` (`activeSurfaceIdx <= -2`), `rinseOriginX` carries `gyroSloshPosition` (`-1..+1`) and `rinseOriginZ` carries `gyroHandheldBlend01` (`0..1`) to tilt the Royal Amethyst meniscus across all 28 crowns without adding extra Metal buffer bindings.
    - `waveMatrix[2]` (`row2`): `(companionSmoothness, companionFluoride, isCompanionFlag, archSideNorm)` — where `archSideNorm = crownX / 8.2` (`-1..+1`) in Companion mode.
    - `waveMatrix[3]` (`row3`): `(pacerHighlight, audioBass, audioMid, audioHigh)`
    - `enamelTimeAndFlags`: `(timeSec, bChannelMode, discloseActive, activeSurfaceIdx)` — where `activeSurfaceIdx` is `0` (Outer Cheek), `1` (Chewing Grooves), `2` (Inner Tongue), `-1` (Floss Bonus), `-2` (Purple Mouthwash Bonus, with `abs(pacerHighlight)` carrying `0..1` fluorapatite seal progress), or `99` (non-pacer).
- **`ProceduralMeshBuilder.swift`** — Builds the 14-crown Upper + 14-crown Lower Companion arches, 3D sonic toothbrush + luminous 45° angle wedge, 3D Y-bow Floss Pick (`pacer_floss_pick`), 3D `10 mL` Purple Rinse cup + twin swirling Royal Amethyst ribbons + `24` effervescent `F⁻` bubbles (`pacer_mouthwash_rig`), 3D Orbital Earth + atmosphere/aurora, 5 Mohs specimens, and `HYDRA-1` arcade probe.
- **`MouthLifeSceneController.swift` & `MouthLife3DViewport.swift`** — `preferredFramesPerSecond = 120` (`CADisableMinimumFrameDurationOnPhone = true` in `Info.plist`), sub-frame `60Hz → 120Hz` interpolation, bathroom-mirror camera alignment (`Screen-Left = Patient Left`, `Screen-Right = Patient Right`), and 120Hz `MotionTiltMonitor` polling.

### `MouthLifeApp/Audio/` & `MouthLifeApp/Music/`
- **`NativeSoundEngine.swift`** —
  - `SunoStreamDeck`: dual-deck hardware AAC `.m4a` crossfader (`850ms`) bundling 10 mastered tracks in `MouthLifeApp/Music/` (`sanctuary`, `toronto`, `new_orleans`, `tokyo`, `accra`, `aurora`, `brush_along`, `cosmic`, `pulp`, `report`) with background 95th-percentile 3-band spectral envelope extraction (`60Hz`) and Live Earth Radio seamless station continuity.
  - `RealtimeSynthKernel`: lock-free 48-voice `AVAudioSourceNode` procedural synth + whisper-soft multi-textured sonic brushing bed, 4D quadrant/surface earcons, `3-2-1` anticipation kalimba/celesta pickups, floss-pick snap/squeak, and stereo-panned purple mouthwash swish splashes (`playMouthwashTiltSwish`).
  - `AVSpeechSynthesizer` Voice Coach: 8-language hands-free spoken guidance over `.playback` + `.mixWithOthers` with smooth `-8.4 dB` music ducking.
- **`MotionTiltMonitor.swift`** — Zero-permission 120Hz `CMMotionManager` pull monitor (`xArbitraryZVertical`, portrait/landscape gravity mapping, auto-paused on background or `Reduce Motion`, clean no-op on macOS).
- **`HapticsEngine.swift`** — `CoreHaptics` enamel smoothness textures, floss-pick contact clicks, and mouthwash liquid-wave + micro-bubble fizz (`playMouthwashTiltSplash`).

### `MouthLifeApp/UI/` & `AppCoordinator.swift`
- **`AppCoordinator.swift`** — `@MainActor @Observable` coordinator wiring `SaveSystem`, `MouthLifeSceneController`, `NativeSoundEngine`, `HapticsEngine`, wall-clock lock-resilient Brush-Along timer (`pacerStage`: `.brushing` → `.flossBonus` → `.mouthwashBonus`), `20Hz` + discrete-edge HUD throttling, and `UIApplication.shared.isIdleTimerDisabled = true` stay-awake during active sessions.
- **`UI/BrushAlongView.swift`** — 3-foot glanceable bathroom mirror HUD featuring `MirrorArchCompassView`, `MouthwashGyroLevelBar` (Cheek-to-Cheek Purple Spirit-Level Bubble Gauge), `[Pick | String]` & `[60s | 30s]` toggles, FM station pill, and 8-language selector.
- **`UI/CompanionHubView.swift`, `ArcadeHudView.swift`, `CosmicIntroView.swift`, `MissionReportView.swift`, & `UI/Sheets/*`** — Streamlined Liquid-Glass overlays keeping `65–88%` of the 120Hz 3D viewport unobstructed.
