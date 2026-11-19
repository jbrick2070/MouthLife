# AGENTS.md — MouthLife AI Handoff & Engineering Guide

Welcome! This repository contains **MouthLife**, with active development focused on the **100% Native Apple 120Hz ProMotion App** in [`native-apple/`](native-apple/README.md).

## 1. Which Directory Should You Edit?

- **`native-apple/` (Primary Active Target — iOS / iPadOS / macOS):**
  - Pure Swift 6 + Metal + SceneKit + `AVAudioEngine` + `AVSpeechSynthesizer` + `CoreMotion` + `CoreHaptics` + `SwiftUI`.
  - **Strict Rule:** Keep `native-apple/` **100% native** — never introduce `WKWebView`, Capacitor, or JS bridges into the Apple app.
- **`src/` & `tests/` (Web / Offline PWA Reference Edition):**
  - TypeScript + Vite 6 + Three.js `r174`. Shares identical biophysics constants and byte-compatible `ML2:` Base64URL Sync Codes with `native-apple/`.

## 2. Key Architectural Invariants (`native-apple/`)

1. **Hands-Free Bathroom Mirror Priority (`BrushAlongView` & `BrushCoachSystem`):**
   - Once **2-Min Brush** starts, the entire 3-stage ritual (`2:00` Brushing `+50 F⁻` → `0:45` 3D Y-Bow Floss Pick `+25 F⁻` → `1:00` Fluoride Rinse `+25 F⁻` = `+100 F⁻`) must run **100% hands-free and eyes-optional** when the phone sits untouched on the bathroom counter.
   - **Keep the voice minimal:** this is a daily ritual, so the coach speaks only a quadrant number (`One`–`Four`) and one word per stage change (`Floss`, `Rinse`, `Done`). Earcons and the screen carry all technique detail; do not add spoken sentences.
   - Gyroscope interactions (`MotionTiltMonitor` + `GyroSloshSim`) auto-detect counter (`isHandheld == false`) vs. picked-up handheld tilt (`isHandheld == true`) and must always remain additive enhancements that honor `UIAccessibility.isReduceMotionEnabled`.
2. **Bathroom Mirror Spatial Alignment (Never Flip Left/Right!):**
   - Both the 2D `MirrorArchCompassView` and the 3D pacer camera match looking into a bathroom mirror: **Screen-Left = Patient Left (`Q2` Upper-Left, `Q3` Lower-Left)** and **Screen-Right = Patient Right (`Q1` Upper-Right, `Q4` Lower-Right)**.
3. **120Hz Zero-Allocation Render & Audio Discipline:**
   - Avoid per-frame heap allocations inside `MouthLifeSceneController.renderer(_:updateAtTime:)` (`120Hz`) and `RealtimeSynthKernel` (`AVAudioSourceNode` real-time audio thread).
   - Keep Metal uniform updates guarded by shadow-state checks in `EnamelShaders.swift` (`EnamelUniformShadow`), and preserve the packed `float4x4 waveMatrix` slot conventions documented in [`native-apple/README.md`](native-apple/README.md).
4. **Non-Punitive Design & 100% On-Device Privacy:**
   - Zero streak-loss shaming, `90-day` Saliva Stasis floor (`>= 45%` smoothness, zero offline shield damage), non-punitive `50%` Ca(OH)₂ Pulp Rescue timeout stabilization, `NSPrivacyTracking = false` in `PrivacyInfo.xcprivacy`, and external Safari-only links for `SmileOnU.org` and the further charities in `CharityInfo.moreCharities` (`CharityInfo.swift`; verify every link on the charity's own site before adding one). The owner chose to ship with no maker contact details: do not add an email address, a `mailto:` link or a feedback form to either edition.

5. **City Skylines Are Drawn Once, for Both Editions:**
   - Each stage's skyline is a small text drawing in `src/config/skylines/<hostId>.txt` (format documented in `src/config/citySkylineGeometry.ts`). The web reads it directly; the native app reads the generated `CitySkylineArt.swift`. After editing a drawing run `npx vite-node scripts/skyline-native.ts --write`, then the tests on both sides (they compare piece counts and checksums across editions).
   - Capital-letter shapes are scenery; lower-case shapes are lights, which follow the clean ratio of the district in front of them: skies (`g`) brighten smoothly, everything else switches on in four steps and goes to full when the district is sealed. Keep every district supplied with lights, and keep colours readable against the red gum and against that city's sky.
   - Motion (`~slide`, `~spin`, `~sway`, `~blink`) is decoration only: slow, small, never near the play field, and always at rest under Reduce Motion. Both editions compute it from the same `motionState` function; do not animate skyline pieces any other way.
   - Draw real places accurately (a second-pass review caught 1970s towers in "1940 Chicago", a sideways Ghana flag and the wrong bridge for New Orleans). Check a landmark's shape and date before adding it.
6. **One Sign for the Main Menu:**
   - Any button that returns to the Hub is the bright white pill with a house (`.btn-home` + `HOME_ICON_SVG` on web, `MLHomeButtonStyle` + `house.fill` on native). Do not style anything else that way.
7. **Every City Ends With the Same Finale, and Both Editions Play It Identically:**
   - Sealing a city's last zone plays its finale before the score (hush → rise → wave of light → blaze → show → the city's sign in sparks → the prize → the Golden Molar → the climb → liftoff, exactly **30 s**, Skip after 1.5 s); sealing the fifth city for the first time also plays the ending (molar assembles, credits roll through the five cities, gold in every city earns the winking-molar surprise; exactly **60 s**). Keep the beats the same in every city: players should learn the rhythm.
   - The climb shows how far up the mountain the campaign is (a ledge per city, the molar on the peak, "2 more to the top", the next city); its music hangs unresolved until the city that completes the set reaches the summit. Do not change the 30 s / 60 s lengths or the cue times casually: the owner composes finale songs to them (cue sheet in `native-apple/MouthLifeApp/Music/README.md`). A song in the music folder (`finale_<city>`, `finale_ending`) replaces the score's instruments; its effects still play.
   - All timing, positions, brightness and notes are pure functions in `src/config/cityFinale.ts` with a Swift twin in `CityFinale.swift`; the generator embeds a checksum of the whole show and the Swift tests compare it. Change both files together, run the generator, then both test suites. A city's sign (`@emblem`) and show settings (`@finale`: voice, show, host side, bursts) live in its drawing file.
   - The finale is filmed in 3D: `src/config/finale3d.ts` (Swift twin `Finale3D.swift`, checksum `expectedFinale3D`) lifts the 2D timeline into a world (camera path, 3D sparks that split, each city's fractal sign, the molar's crown and roots, the crystal-column mountain). The renderers are `src/engine/render/FinaleStage3D.ts` (Three.js, under the 2D canvas, which keeps only the host, the face and the fades; it falls back to the 2D show without WebGL) and `native-apple/MouthLifeApp/Render/CityFinaleScene.swift` (SceneKit; the sparks are projected into the 2D layer through `FinaleLens`). Change the 3D maths in both files and regenerate, as for the timeline.
   - The Golden Molar has five cusps, one per campaign city, finished pearl / silver / gold by the city's best grade (from the save; nothing new is stored, so Sync Codes are unchanged). It sits in the Home header on wide screens and floats beside the ? on phones; never let it widen the header past the screen.
   - Reduce Motion keeps every beat but fades instead of flying, sweeping or bursting.
8. **Apple Watch: Every Frame Shows Its Own Moment (lesson learned on the wrist, 2026-11-19):**
   - With the wrist down (Always On), watchOS renders the coming `TimelineView` frames ahead of time and plays them back once a second. A face built from live state, rather than from `context.date`, shows the same frame over and over and looks frozen, even though the app is still running. The brush, clock and countdown stopped exactly like that until the face drew `WatchController.ritual(at: context.date)` (`WatchRitual.projected(by:)`).
   - Keep every time-based watch view a function of the frame's date. Keep Always On guiding: the brush and the floss pick step once a second as outlines, with no glides or pops.
   - Find watch runtime problems with the on-watch diary (`MouthLifeWatch/WatchLog.swift`; copy it to the Mac with `xcrun devicectl device copy from ... --domain-type appDataContainer`), not by guessing. `xcrun devicectl device capture screenshot` shows the watch's screen.
   - The plan and decisions for the watch faces are in [`docs/watch-face-plan.md`](docs/watch-face-plan.md).

## 3. Verification Checklist Before Committing

```bash
# 1. Pure Swift engine, 8-language coach, 3-stage timeline & 120Hz gyro slosh tests (16/16)
cd native-apple && swift test

# 2. iOS Release compile & Metal shader verification (0 warnings, 0 errors)
xcodebuild -project MouthLife.xcodeproj -scheme MouthLife -configuration Release \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build

# 3. macOS Release compile verification (0 warnings, 0 errors)
xcodebuild -project MouthLife.xcodeproj -scheme MouthLife -configuration Release \
  -destination 'generic/platform=macOS' CODE_SIGNING_ALLOWED=NO build
```
