# MouthLife — Ground-Up Native iOS / iPadOS / macOS Edition (`native-apple/`)

Zero WebViews, zero wrappers — 100% native Swift, Metal shaders, real-time procedural `AVAudioEngine` DSP synthesis, `CoreHaptics` enamel biophysics feedback, and `SwiftUI` liquid-glass overlays running at **120Hz ProMotion** on iPhone and iPad.

## Architecture

- **`Package.swift` & `Sources/MouthLifeCore/`** — Pure deterministic Swift biophysics & persistence engine:
  - `Surface/OralSurfaceGrid.swift` & `OralChemistrySim.swift`: `256×128` (`128×128` Pulp Rescue) enamel surface grid, Stephan `20s` acid curve, critical `pH 5.5` (Hydroxyapatite) vs `pH 4.5` (Fluorapatite), 1948 Bass 45° sulcus care, Quorum-Sensing EPS dome armor, and dirty-only `RGBA8Unorm` texture packing.
  - `Physics/CollisionSystem.swift` & `Scoring/ScoringEngine.swift`: Interdental alley collision walls, `0.22s` Capillary Tether-Zip, and 4-pillar `10,000`-pt mastery scoring (`250` Par Time floor, `FLUORAPATITE_GOLD`).
  - `Companion/CompanionArchSim.swift` & `CompanionTouchSystem.swift`: Two-slope `12h` Smooth Bask (`72 F⁻` reservoir), `90-day` Saliva Stasis (`>= 45%`, zero offline shield loss), 14-crown pentatonic glass-harp rubbing, and zero-permadeath Pulp Rescue.
  - `Persistence/SaveSystem.swift` & `HabitBank.swift`: `UserDefaults` + optional `NSUbiquitousKeyValueStore`, V1→V2 sanitizer, daily `2 full + 3 tip` Brush-Along cap, and byte-compatible cross-platform `ML2:` Base64URL Sync Codes.
  - `Config/DentalChart.swift` & `CharityInfo.swift`: Interactive 32-Tooth Atlas (Universal `#1–#32`, ISO FDI `11–48`, Palmer), Spot Quiz, 4-Layer Cross-Section, and external Safari-only `SmileOnU.org` 501(c)(3) charity links.
- **`MouthLifeApp/Render/`** — Native 120Hz ProMotion Metal / SceneKit Renderer:
  - `EnamelShaders.swift`: Custom Metal `.geometry` / `.surface` / `.fragment` shaders + `< 0.02 ms` Apple Silicon unified-memory `MTLTexture` (`storageMode = .shared`) surface uploader.
  - `ProceduralMeshBuilder.swift`: Anatomical 14-crown Companion Arch, scalloped interdental papillae, 3D Orbital Earth + 5 Host City beacons + `Station Aurora`, 5 Mohs Hardness Specimens, `HYDRA-1` micro-probe, and `S. mutans` cocci.
  - `MouthLifeSceneController.swift` & `MouthLife3DViewport.swift`: `preferredFramesPerSecond = 120` + `CADisableMinimumFrameDurationOnPhone = true` + sub-frame `60Hz → 120Hz` pose interpolation (`alpha = accumulator / fixedDt`).
- **`MouthLifeApp/Audio/`** — Zero-asset Procedural Synth & Tactile Biophysics:
  - `NativeSoundEngine.swift`: Lock-free 48-voice `AVAudioSourceNode` polyphonic DSP synthesizer (FM Rhodes, Kalimba, Marimba, Celesta, Glass-Harp, Sub Bass, Pad, ASMR Sonic Scrub) + `AVAudioSession` `.ambient` mix & interruption recovery.
  - `HapticsEngine.swift`: `CoreHaptics` mapping `smoothnessIndex` (`0..100`) to gritty plaque vs silky Smooth Bask enamel feel.
- **`MouthLifeApp/UI/`** — Mobile-first Liquid-Glass `SwiftUI` HUD & `.presentationDetents([.medium, .large])` sheets.

## Quick Start

### 1. Run Pure Engine Unit Tests
```bash
cd native-apple
swift test
```

### 2. Open in Xcode (Simulator or Physical 120Hz ProMotion iPhone)
```bash
open native-apple/MouthLife.xcodeproj
```
1. Select the **MouthLife** scheme at the top of Xcode.
2. For a physical iPhone via USB/Wi-Fi, select the `MouthLife` target → **Signing & Capabilities** → choose your personal Apple ID **Team** (and customize Bundle Identifier if desired).
3. Press **Cmd+R** to build and run at 120Hz!
