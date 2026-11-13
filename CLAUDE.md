# CLAUDE.md — MouthLife Repository Guide

Read **[`AGENTS.md`](AGENTS.md)** and **[`native-apple/README.md`](native-apple/README.md)** first.

- **Primary Active App (`native-apple/`):** 100% native Swift 6 + Metal + SceneKit + `AVAudioEngine` + `AVSpeechSynthesizer` + `CoreMotion` + `CoreHaptics` + `SwiftUI` 120Hz ProMotion app for iOS, iPadOS, and macOS (`bundleID: org.mouthlife.plaque`, zero WebViews).
- **Web / Offline PWA Reference (`src/` & `tests/`):** TypeScript + Vite 6 + Three.js `r174` sharing byte-compatible `ML2:` Base64URL Sync Codes with `native-apple/`.

## Quick Verification (`native-apple/`)

```bash
cd native-apple
swift test
xcodebuild -project MouthLife.xcodeproj -scheme MouthLife -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project MouthLife.xcodeproj -scheme MouthLife -configuration Release -destination 'generic/platform=macOS' CODE_SIGNING_ALLOWED=NO build
```
