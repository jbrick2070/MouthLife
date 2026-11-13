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
   - Gyroscope interactions (`MotionTiltMonitor` + `GyroSloshSim`) auto-detect counter (`isHandheld == false`) vs. picked-up handheld tilt (`isHandheld == true`) and must always remain additive enhancements that honor `UIAccessibility.isReduceMotionEnabled`.
2. **Bathroom Mirror Spatial Alignment (Never Flip Left/Right!):**
   - Both the 2D `MirrorArchCompassView` and the 3D pacer camera match looking into a bathroom mirror: **Screen-Left = Patient Left (`Q2` Upper-Left, `Q3` Lower-Left)** and **Screen-Right = Patient Right (`Q1` Upper-Right, `Q4` Lower-Right)**.
3. **120Hz Zero-Allocation Render & Audio Discipline:**
   - Avoid per-frame heap allocations inside `MouthLifeSceneController.renderer(_:updateAtTime:)` (`120Hz`) and `RealtimeSynthKernel` (`AVAudioSourceNode` real-time audio thread).
   - Keep Metal uniform updates guarded by shadow-state checks in `EnamelShaders.swift` (`EnamelUniformShadow`), and preserve the packed `float4x4 waveMatrix` slot conventions documented in [`native-apple/README.md`](native-apple/README.md).
4. **Non-Punitive Design & 100% On-Device Privacy:**
   - Zero streak-loss shaming, `90-day` Saliva Stasis floor (`>= 45%` smoothness, zero offline shield damage), non-punitive `50%` Ca(OH)₂ Pulp Rescue timeout stabilization, `NSPrivacyTracking = false` in `PrivacyInfo.xcprivacy`, and external Safari-only links for `SmileOnU.org` (`CharityInfo.swift`).

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
