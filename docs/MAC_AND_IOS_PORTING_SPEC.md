# MouthLife: Mac & iPhone (iOS / macOS) Porting Blueprint

This document is the authoritative handoff guide for building **MouthLife: The Plaque Dimension** on **macOS (Xcode)** for **iPhone, iPad, and Mac** — either as a **fast Capacitor native wrapper** or as a **ground-up native Swift (`SwiftUI` + `SceneKit`/`Metal` + `AVAudioEngine` + `CoreHaptics`)** application.

- **Canonical Source of Truth:** The TypeScript codebase in `src/` and its `170` unit tests in `tests/` (`npm test`) represent the **v1.0 Golden Master** simulation, chemistry, progression, dental reference chart, and UI rules.
- **Design & Biophysics Spec:** [`docs/GDD_AND_ARCHITECTURE.md`](./GDD_AND_ARCHITECTURE.md)

---

## 1. Choosing Your Mac Porting Path

| Criteria | Path A: Ionic Capacitor Wrapper (`WKWebView`) | Path B: Ground-Up Native Swift (`SwiftUI` + `SceneKit`/`Metal`) |
|----------|-----------------------------------------------|-----------------------------------------------------------------|
| **Time to Xcode / iPhone** | **~15–30 minutes** | Multi-phase native build (ideal for an AI coding agent on Mac) |
| **Code Reuse** | **100%** of `src/` (`Three.js` WebGL2 + Web Audio + CSS HUD) | Ports pure deterministic TS logic (`src/config/`, `src/engine/`, `src/worlds/`) 1:1 into Swift structs/classes |
| **Performance & Battery** | 60 FPS on modern iPhones (`< 25` draw calls, single-pass shader) | **120 Hz ProMotion**, native Metal shader pipeline, lowest thermal/battery draw |
| **Apple Platform Polish** | Optional Capacitor plugins for haptics & notifications | Native **`CoreHaptics`** (rough plaque vs. glassy enamel feel), **SwiftUI** liquid-glass sheets, **iCloud `NSUbiquitousKeyValueStore`**, **WidgetKit / Apple Watch** 2-min sink pacer |

> **Recommendation:** If you want to test on your physical iPhone **today**, run **Path A** in 15 minutes (even on a free Personal Team Apple ID via USB cable before paying the \$99/year Apple Developer fee). If you are tasking a Mac AI coding agent to build a flagship native iOS/macOS app from the ground up, point it directly at **Section 3 (Path B Blueprint)** below!

---

## 2. Path A — Fast Native iPhone Build via Capacitor (15 Minutes on Mac)

```bash
git clone https://github.com/jbrick2070/MouthLife.git
cd MouthLife
npm install
npm test && npm run build

# Add Capacitor iOS wrapper (run on your Mac with Xcode installed)
npm install @capacitor/core @capacitor/ios
npm install -D @capacitor/cli
npx cap init "MouthLife" "org.mouthlife.plaque" --web-dir dist
npx cap add ios
npm run build && npx cap sync ios
npx cap open ios
```

### Xcode Signing & Device Run Checklist (Path A)
1. In Xcode, select the **`App`** target → **Signing & Capabilities** → choose your **Team** (a free Apple ID works for local USB iPhone testing; the **\$99/year Apple Developer Program** is only required for TestFlight and App Store distribution).
2. Set **Deployment Target** to `iOS 16.0+` and enable **Portrait** + **Landscape Left/Right** orientations.
3. All mobile safe-area insets (`env(safe-area-inset-*)`), touch pointer steering, iOS Web Audio `interrupted` recovery (`src/engine/audio/SoundEngine.ts`), WebGL context-loss restoration (`src/engine/render/SceneManager.ts`), and `pagehide` save flushing (`src/main.ts`) are **already built into the web bundle**.
4. *(Note)* In `src/main.ts`, the Service Worker (`./sw.js`) automatically skips registration on `capacitor://` schemes because Capacitor serves `dist/` directly from local native bundle storage.

---

## 3. Path B — Ground-Up Native Swift Architecture Blueprint (iOS & macOS)

Because MouthLife was engineered with **strict separation between pure deterministic simulation (`src/config/`, `src/engine/`, `src/worlds/`) and browser DOM/WebGL adapters**, a Mac coding agent can port the entire game cleanly into native Swift (`iOS 17+` / `macOS 14+`) without guessing any math or level coordinates.

### 3.1 Recommended Xcode Target & Module Layout
Create a multiplatform SwiftUI Xcode project (`MouthLife.xcodeproj`, iOS + macOS) organized into four clean layers:

| TypeScript Source (`src/`) | Native Swift Equivalent | Notes |
|----------------------------|-------------------------|-------|
| `src/config/gameConfig.ts` | `Core/Config/GameConfig.swift` | Copy all numeric constants verbatim (`CELL_SIZE = 0.25`, `PROBE_RADIUS = 0.65`, `SMOOTH_BASK_THRESHOLD = 85`, etc.). |
| `src/config/upgrades.ts` | `Core/Config/UpgradeCatalog.swift` | 4 upgrades (`angled_bass_array`, `hydro_sonic_pulse`, `ptfe_ribbon_filament`, `bicarb_buffer_jet`). Note `brush` slot holds 1 active mode (`Bass` vs `Hydro-Sonic`). |
| `src/config/hostsAndHistory.ts` | `Core/Config/HostsAndHistory.swift` | 8 Fitzpatrick skin tones, 6 historical notes, 5 global/orbital host cities & regional treats. |
| `src/config/dentalChart.ts` | `Core/Config/DentalChart.swift` | All 32 adult permanent teeth across **ADA Universal (`#1–#32`)**, **ISO 3950 FDI (`11–48`)**, and **Palmer (`┘ └ ┌ ┐`)**, plus 5 clinical surfaces (`M, O/I, D, B/F, L/P`), Tooth Spot Quiz, and 4-layer cross-section anatomy. |
| `src/config/charityInfo.ts` | `Core/Config/CharityInfo.swift` | **SmileOnU** 501(c)(3) info & external Safari URLs (see §4 App Review rules!). |
| `src/engine/surface/OralSurfaceGrid.ts` | `Core/Surface/OralSurfaceGrid.swift` | `ContiguousArray<Float>` (`density`) + `ContiguousArray<UInt8>` (`CellFlag` bitmask) + `O(1)` incremental clean counters per district + `RGBA8Unorm` texture buffer upload. |
| `src/engine/surface/OralChemistrySim.ts` | `Core/Surface/OralChemistrySim.swift` | Per-cell `localPh`, `gumIrritation`, 1940 Stephan Curve `20s` recovery clock, and salivary `HCO₃⁻` buffering. |
| `src/engine/physics/CollisionSystem.ts` | `Core/Physics/CollisionSystem.swift` | `sampleTerrainHeight`, single-source `buildAlleyWalls` from `interdentalAlleys`, circle-vs-AABB slide, `tryStartCapillaryZip`, and `findNearestZipMouth`. |
| `src/engine/sim/WorldSession.ts` | `Core/Sim/WorldSession.swift` | Fixed `60 Hz` (`dt = 1/60`) simulation step, 3 actuators + disclosing scan, `S. mutans` cocci & sucrose spawners, commensal site restoration, soft-lock-proof district sealing (`>= 90%` clean + all district sites restored). |
| `src/engine/scoring/ScoringEngine.ts` | `Core/Scoring/ScoringEngine.swift` | `10,000`-pt 4-pillar breakdown (`5,000` Restoration + `2,500` Technique + `1,500` Ecology + `250..1,000` Par Time), `1.0x..3.0x` actuator-alternation Synergy, `Fluorapatite Gold` grade (`>= 9,000` + `>= 95%` clean + all sites). |
| `src/engine/companion/CompanionArchSim.ts` | `Core/Companion/CompanionArchSim.swift` | Two-slope offline Smooth Bask cooling (`-1.25/hr` above `85`, `-6.67/hr` to `45` Saliva Stasis floor, **zero offline shield loss**), `+6 Ions/hr` up to `72`, treat acid cascade, `90s` Pulp Rescue win/timeout (`50%` Ca(OH)₂ stabilization). |
| `src/engine/persistence/SaveSystem.ts` & `HabitBank.ts` | `Core/Persistence/SaveSystem.swift` | `Codable` `MouthLifeSaveV2` stored in `UserDefaults` (+ optional `NSUbiquitousKeyValueStore` iCloud sync) **plus full `ML2:` Base64URL Sync Code import/export compatibility**! |
| `src/worlds/*.ts` (6 cartridges) | `Worlds/*.swift` | Port all 6 declarative `WorldCartridge` definitions verbatim (`world_1`..`world_5` + `pulp_rescue`). |
| `src/engine/render/*.ts` | `Render/` (`SceneKit` + `SCNShaderModifier` or `Metal`) | Procedural 14-crown Companion Arch, 3D Orbital Earth + Mohs Hardness Showcase, single-pass wet-enamel biophysics shader, and instanced `HYDRA-1` / `S. mutans` / foam / ribbon batches. |
| `src/engine/audio/*.ts` | `Audio/SoundEngine.swift` (`AVAudioEngine` + `CoreHaptics`) | Procedural synthesizer (`AVAudioSourceNode`) + iOS **`CHHapticEngine`** tactile enamel feedback! |
| `src/ui/*.ts` | `UI/` (`SwiftUI` overlays & `.sheet` detents) | Native `.presentationDetents([.medium, .large])` sheets for Lab, History, 32-Tooth Chart, Profile, Charity & Sync; ultra-clean floating HUD pills leaving `65–88%` open 3D playfield. |

---

### 3.2 Critical Simulation & Shader Details Not to Miss

1. **Exact `OralSurfaceGrid` RGBA Texture Contract (`EnamelBiophysicsMaterial.ts`):**
   - Grid resolution: `gridW = Int(round(worldWidth / 0.25))`, `gridH = Int(round(worldDepth / 0.25))` (`256 x 128` for `64u x 32u` campaign stages; `128 x 128` for `32u x 32u` Pulp Rescue).
   - `RGBA8Unorm` texture uploaded only when `textureDirty == true`:
     - **`R` (`0..255`):** `biofilmDensity` (`0.0..1.0`). Cells with `density <= 0.10` (`CLEAN_THRESHOLD`) snap smoothly (`smoothstep`) from matte lime-yellow pellicle to high-gloss wet pearlescent hydroxyapatite (`pow(N·H, 36)` + cyan mint Fresnel rim).
     - **`G` (`0..255`):** `fluorapatiteSeal` (`CellFlag.FLUORIDE_SEALED` -> `255`), adding turquoise crystalline sheen and lowering critical demineralization pH from `5.5` to `4.5`.
     - **`B` (`0..255`):** Context-sensitive biophysical channel selected by `cartridge.bChannelMode`:
       - `0` (`marginDensity` — World 1 & Pulp Rescue): cervical/fissure thickness cue
       - `1` (`gumIrritation` — World 2 *Gumline Crescent*): tender coral gingival blush (`0..1`)
       - `2` (`localPh` — World 3 *Neon Acid Clock* & World 4 *Fluoride Coast*): acidic amber-violet demineralization warning when `pH < 5.5`
       - `3` (`epsArmor` — World 5 *Slime Dome*): iridescent quorum-sensing polymer shield that deflects Sonic Bristles until cracked by Floss (`E`) or Fluoride Surge (`Q`)
     - **`A` (`0..255`):** `paintableMask` (`255` inside `PAINTABLE` enamel, `0` on gingiva).

2. **All 5 Campaign Worlds + Pulp Rescue Progression Rules (`SaveSystem.ts`):**
   - `world_1` (*Plaque City* — Toronto, Maya Lin-Okafor): Always unlocked. Unlocks `angled_bass_array` (`3` Stamps or W1 clear).
   - `world_2` (*Gumline Crescent* — New Orleans, Marcus & Celine Beaumont): Unlocks on **W1 clear OR `4` Habit Stamps**. Signature mechanic: `sulcusBands` (`gumIrritation` on heavy stationary scrubbing; gentle moving sweeps stay calm). Unlocks `hydro_sonic_pulse` (`6` Stamps or W2 clear — grants `+16%` brush reach, `115°` arc, `+30%` fissure shear globally + `-50%` sulcus pressure).
   - `world_3` (*Neon Acid Clock* — Tokyo & Chicago, Kenji Sato): Unlocks on **W2 clear OR `8` Habit Stamps**. Signature mechanic: 1940 Stephan Curve `stephanSipIntervalSec` plunging pH below `5.5` until sucrose crystals are shattered or buffered via Salivary Springs. Unlocks `ptfe_ribbon_filament` (`10` Stamps or W3 clear).
   - `world_4` (*Fluoride Coast* — Accra & Colorado Springs, Dr. Amara Mensah): Unlocks on **W3 clear OR `14` Habit Stamps**. Signature mechanic: tart hibiscus `erosionZones` (`pH ~4.95`) + Miswak/Fluoride springs that infuse bristles to convert hydroxyapatite (`pH 5.5` critical) into acid-defying **fluorapatite** (`pH 4.5` critical). Unlocks `bicarb_buffer_jet` (`15` Stamps or W4 clear).
   - `world_5` (*Slime Dome* — Station Aurora 408 km LEO, Specialist Tariq Al-Mansoor): Unlocks on **W4 clear OR `20` Habit Stamps**. Signature mechanic: zero-G `epsDomes` requiring Floss shear or Fluoride Surge to fracture before Sonic Bristles can clean beneath.
   - `pulp_rescue` (*Emergency Molar Scramble*): `32u x 32u`, `90s` timer triggered when repeated uncleaned treats drain `enamelShield -> dentinShield -> pulpIntegrity == 0`. Never punitive: timeout stabilizes all shields & smoothness at `50%` via Calcium-Hydroxide dressing.

3. **Cross-Platform `ML2:` Save Sync Compatibility:**
   - Keep the exact JSON field names of `MouthLifeSaveV2` (`src/engine/types.ts` & `src/engine/persistence/SaveSystem.ts`).
   - Encode: `"ML2:" + base64url(utf8(json))` (replacing `+` → `-`, `/` → `_`, stripping trailing `=`).
   - That way, players can copy an `ML2:` code from the web version and paste it straight into the native iPhone/Mac app!

4. **Native iOS Superpower — `CoreHaptics` Enamel Texture:**
   - When rubbing the 3D Companion Arch (`CompanionTouchSystem.ts`) or scrubbing in Arcade:
     - Map `smoothnessIndex` (`0..100`) to `CHHapticEventParameter(parameterID: .hapticSharpness, value: Float(smoothness / 100))` and inverse roughness intensity so dirty pellicle feels subtly gritty while `100%` Smooth Bask feels like **silky, glassy crystal chimes** under your thumb!

---

## 4. Apple App Store Review Checklist (`$99/yr` Developer Account)

1. **Guideline 3.2.1(vi) — Non-Profit Charity Donations (`SmileOnU`):**
   - Never process donations via In-App Purchase or embedded `WKWebView` forms. Always open `https://smileonu.org/donate/` and `https://smileonu.org/` externally in **Safari** (`Link(destination:)` in SwiftUI or `UIApplication.shared.open(url)`), clearly stating SmileOnU is an independent U.S. 501(c)(3) public charity (`src/config/charityInfo.ts`).
2. **Guideline 5.1.1 — Privacy Manifest (`PrivacyInfo.xcprivacy`):**
   - `NSPrivacyTracking = false`, `NSPrivacyCollectedDataTypes = []` (100% on-device storage, zero analytics, zero sign-up).
   - Declare `NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1` (storing local game save data).
   - Host `public/privacy.html` (already included in this repo, e.g. via GitHub Pages `https://jbrick2070.github.io/MouthLife/privacy.html`) as your App Store Connect Privacy Policy URL.
3. **Guideline 1.4.1 — Wellness / Educational Framing:**
   - Keep MouthLife categorized under **Games (Action / Family)** or **Education**, noting in the About/Privacy screen that the 2-Minute Sink Brush-Along and 32-Tooth Chart are educational oral-hygiene companions and not a substitute for professional dental care.
4. **Idle Timer During 2-Minute Sink Brush-Along:**
   - Set `UIApplication.shared.isIdleTimerDisabled = true` on `BRUSH_ALONG` entry and restore `false` on exit/pause (the native iOS equivalent of `ClockController.ts`'s Wake Lock).

---

## 5. Ready-to-Paste Prompt for Your Mac AI Coding Agent

Once you clone `https://github.com/jbrick2070/MouthLife.git` on your Mac, paste this into your Mac AI coding agent:

```text
Read README.md, docs/MAC_AND_IOS_PORTING_SPEC.md, and docs/GDD_AND_ARCHITECTURE.md first, then inspect src/ and tests/.
Run `npm install && npm test` to see all 170 passing unit tests that define the exact Golden Master behavior of MouthLife: The Plaque Dimension.

I want to build a ground-up native Swift universal app (iPhone + iPad + Mac, iOS 17+ / macOS 14+) in a `native-apple/` folder using SwiftUI, SceneKit/Metal, AVAudioEngine, and CoreHaptics:
1. Phase 1: Port the pure deterministic engine (`GameConfig`, `UpgradeCatalog`, `HostsAndHistory`, `DentalChart`, `OralSurfaceGrid`, `OralChemistrySim`, `CollisionSystem`, `ScoringEngine`, `CompanionArchSim`, `SaveSystem` with `ML2:` sync-code compatibility, and all 6 `WorldCartridge` definitions) into a Swift package with Swift Testing / XCTest parity against `tests/`.
2. Phase 2: Build the single-pass wet-enamel biophysics 3D renderer (`SceneKit` + Metal shader modifier / `MTKView`), 14-crown interactive Companion Arch, 3D Orbital Earth + Mohs Showcase, and instanced `HYDRA-1` + `S. mutans` + foam/ribbon FX.
3. Phase 3: Wire `AVAudioEngine` procedural synthesis + `CoreHaptics` enamel-smoothness feedback, plus streamlined mobile-first SwiftUI overlays (Cosmic Intro, Smooth Bask Hub & Globe, 2-Min Sink Brush-Along with `isIdleTimerDisabled`, Arcade HUD with direct touch steering, Mission Report, Interactive 32-Tooth Chart, and Safari-external SmileOnU charity links).
```
