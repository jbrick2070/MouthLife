# MouthLife: The Plaque Dimension

A stylized-3D biophysical dental arcade adventure and daily **"Smooth Bask"** oral-care ritual — featuring **two complete implementations** in one repository:

1. **🍎 `native-apple/` — Primary 100% Native Swift + Metal 120Hz ProMotion App (iOS / iPadOS / macOS):** Zero WebViews, zero JS wrappers — pure Swift 6, custom Metal enamel/gingiva/Earth shaders, dual-deck hardware AAC Suno Live Earth Radio + 48-voice `AVAudioEngine` procedural DSP synth, 8-language hands-free `AVSpeechSynthesizer` mirror coach, `CoreMotion` 120Hz gyroscope liquid-slosh spirit-level physics, `CoreHaptics` enamel feedback, and Liquid-Glass `SwiftUI` overlays.
2. **🌐 `src/` — Cross-Platform Web / Offline PWA Edition (`TypeScript` + `Vite 6` + `Three.js r174`):** Runs in any desktop or mobile browser with byte-compatible `ML2:` Base64URL Sync Codes shared with `native-apple/`.

---

## 🍎 Quick Start — Native iOS / iPadOS / macOS (`native-apple/`)

```bash
cd native-apple

# 1. Run all 16 deterministic MouthLifeCore biophysics, coach & gyro unit tests
swift test

# 2. Open in Xcode (Simulator, Mac, or Physical 120Hz ProMotion iPhone)
open MouthLife.xcodeproj

# 3. Headless CLI Release Builds (iOS + macOS)
xcodebuild -project MouthLife.xcodeproj -scheme MouthLife -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project MouthLife.xcodeproj -scheme MouthLife -configuration Release -destination 'generic/platform=macOS' CODE_SIGNING_ALLOWED=NO build
```

See **[`native-apple/README.md`](native-apple/README.md)** and **[`AGENTS.md`](AGENTS.md)** for the full native Swift/Metal architecture map, shader uniform layout, audio/gyro pipelines, and AI coding-agent handoff notes.

---

## 🌐 Quick Start — Web / PWA (`src/`)

```bash
npm install
npm test          # Run all 184 Vitest unit tests
npm run dev       # Start local Vite dev server (http://localhost:5173)
npm run build     # Type-check & build production PWA bundle into dist/
```

---

## 🎮 Playable Modes & Features

- **🪥 3-Stage Hands-Free Bathroom Mirror Ritual (`native-apple/` and web, `+100 F⁻` Total):** *(The web edition has the same timeline, mirror compass, 8-language voice coach via the browser's speech synthesis, upper + lower arches, and rewards. The web edition also shows a guided 3D toothbrush, a floss pick and a purple rinse wash. Still native-only: the rinse cup model, the bundled music tracks, haptics and tilt slosh on desktop.)*
  1. **Stage 1 (`2:00` Brushing, `+50 F⁻`):** Hands-free, eyes-optional progression (`12 × 10s`: `Q1 → Q2 → Q3 → Q4`, `Outer 45° Gumline → Chewing Grooves → Inner Vertical`), body-locked **Mirror Arch Compass** (`Screen-Left = Patient Left`, `Screen-Right = Patient Right`), 3D **45° Bristle Angle Wedge**, **3-State Metal Enamel Awakening**, **8-Language Spoken Voice Coach** (`EN`, `ES`, `FR`, `JA`, `ZH`, `KO`, `PT`, `DE`) with `-8.4 dB` music ducking, and `3… 2… 1…` final 3-second musical anticipation.
  2. **Stage 2 (`0:45` 3D Y-Bow Floss Pick Bonus, `+25 F⁻`):** Animated 3D Y-bow floss pick (`Pick` / `String` toggle) demonstrating gentle wiggle-glide past contact points and two-wall C-hug sweeps across all 26 interdental gaps (Upper → Lower arch).
  3. **Stage 3 (`1:00` Fluoride Rinse, `+25 F⁻`):** Follows common fluoride-rinse label directions; optional, age 6+ (`10 mL`, `[60s | 30s]` toggle, 30-minute post-rinse no-water lock-in reminder) with a 3D `10 mL` pouring cup, swirling Royal Amethyst vortex + `24` `F⁻` bubbles, 28-crown purple-to-24k-gold Fluorapatite Metal shader seal, and **auto-detecting 120Hz `CoreMotion` Gyroscope Liquid Slosh + Cheek-to-Cheek Spirit-Level Bubble Gauge** when picked up during the swish!
- **✦ Cosmic Stardust & Mohs Hardness Intro** — Interactive 3D journey from stellar nucleosynthesis (`⁴⁰Ca`, `³¹P`) to hydroxyapatite (`Mohs 5`, harder than iron) vs. bacterial acid (`pH 5.5` vs. fluorapatite `pH 4.5`).
- **🦷 Smooth Bask Companion Hub & Live Earth Radio** — Interactive 14-crown 3D dental arch (rub teeth for crystalline glass-harp chimes + handheld wet-enamel specular glint), **10-Track Mastered AAC Suno Soundtrack** (`Sanctuary`, `Toronto`, `New Orleans`, `Tokyo`, `Accra`, `Aurora`, `Brush-Along`, `Cosmic`, `Pulp Rescue`, `Victory`) driving 3-band 120Hz audio-reactive shaders, **Interactive 32-Tooth Clinical Chart** (`ADA Universal #1–#32`, `ISO 3950 FDI 11–48`, `Palmer` + Spot Quiz + 4-layer Cross-Section), non-punitive **Saliva Stasis** (`>= 45%`), and portable `ML2:` sync codes.
- **🌍 5-World Earth-to-Orbit Arcade Campaign + 90s Pulp Rescue:**
  1. **`world_1` — Plaque City** *(Toronto • 1498 Beijing & 1683 Leeuwenhoek)* — Pellicle shear, interdental Floss Tether-Zips & molar fissures.
  2. **`world_2` — Gumline Crescent** *(New Orleans • 1819 Parmly & 1948 Dr. Charles Bass)* — Gentle moving 45° sulcus care vs. heavy stationary gum irritation.
  3. **`world_3` — Neon Acid Clock** *(Tokyo & Chicago • 1940 Dr. Robert Stephan)* — Repeating sweet-sip pH plunges below `5.5` & salivary bicarbonate buffering.
  4. **`world_4` — Fluoride Coast** *(Accra & Colorado Springs • Ancient Miswak & 1901–1945 Fluoride Discovery)* — Tart organic-acid basins & live enamel conversion into acid-defying fluorapatite (`pH 4.5` critical).
  5. **`world_5` — Slime Dome** *(Station Aurora, 408 km LEO • 1973 NASA Skylab & 1978 Costerton Biofilms)* — Zero-G quorum-sensing EPS polymer shields cracked via Floss shear & Fluoride-Bicarb Surge waves.
  6. **`pulp_rescue` — 90s Emergency Molar Scramble** — Fast non-punitive rescue when repeated treats breach Enamel → Dentin → Pulp (with a safe `50%` Calcium-Hydroxide stabilization floor on timeout).

---

## 🗂️ Repository Map

```text
MouthLife/
├── AGENTS.md                             # AI coding-agent orientation & architectural invariants
├── native-apple/                         # 🍎 100% Native Swift + Metal 120Hz ProMotion App (iOS/iPadOS/macOS)
│   ├── MouthLife.xcodeproj/              # Xcode project + shared MouthLife scheme (bundle ID: org.mouthlife.plaque)
│   ├── Package.swift                     # Pure SwiftPM package for MouthLifeCore + MouthLifeCoreTests
│   ├── Sources/MouthLifeCore/            # Deterministic Swift biophysics, 3-stage coach, GyroSloshSim & ML2: saves
│   ├── Tests/MouthLifeCoreTests/         # 15 XCTest suites (biophysics, subrect RGBA, 3-stage coach, gyro slosh)
│   └── MouthLifeApp/                     # AppCoordinator, Metal shaders, SceneKit 120Hz loop, Audio/Gyro & SwiftUI
│       ├── Audio/                        # NativeSoundEngine (Suno deck + 48-voice DSP + TTS), Haptics, MotionTiltMonitor
│       ├── Music/                        # 10 mastered hardware-AAC (.m4a) Suno tracks + prompt/alias guide
│       ├── Render/                       # EnamelShaders.swift, ProceduralMeshBuilder, MouthLifeSceneController
│       └── UI/                           # Liquid-Glass SwiftUI views (Hub, BrushAlong + Gyro Bar, Arcade, 6 Sheets)
├── docs/
│   ├── GDD_AND_ARCHITECTURE.md           # Biophysical & engine design specification
│   └── MAC_AND_IOS_PORTING_SPEC.md       # Native Swift + Capacitor porting blueprint
├── public/                               # Web PWA manifest, icons, privacy.html & offline sw.js
├── src/                                  # 🌐 TypeScript + Three.js Web/PWA edition
└── tests/                                # 25 Vitest suites (184 deterministic web tests)
```

---

## 💛 Enjoyed MouthLife? Support Real-World Smiles — [SmileOnU.org](https://smileonu.org/)

If you enjoyed playing **MouthLife**, please consider supporting [**SmileOnU**](https://smileonu.org/) — a U.S. **501(c)(3) public charity** founded in 2012 by BB Maboby that provides free, life-changing dental care, pain relief, oral health education, and reconstructive dental services to underserved children, adults, and communities across the United States and around the world.

- **Donate Directly:** [https://smileonu.org/donate/](https://smileonu.org/donate/)
- **Official Website:** [https://smileonu.org/](https://smileonu.org/)
- **Core Humanitarian Programs:**
  - **New Smile Program** *(U.S. hardship restorative care)* — [https://smileonu.org/new-smile-program/](https://smileonu.org/new-smile-program/)
  - **Mobile Dental Outreach** *(Southern California volunteer clinics & oral health education)* — [https://smileonu.org/mobile-dental-outreach/](https://smileonu.org/mobile-dental-outreach/)
  - **International Dental Clinics** *(Global relief & Baja, Mexico orphanage dental camps)* — [https://smileonu.org/international-dental-clinics/](https://smileonu.org/international-dental-clinics/)
- **Get Involved & Learn More:**
  - **Volunteer (Doctors, Hygienists, Assistants & Community Volunteers):** [https://smileonu.org/volunteer-application/](https://smileonu.org/volunteer-application/)
  - **Become a SmileOnU Partner Dentist:** [https://smileonu.org/become-a-smileonu-dentist/](https://smileonu.org/become-a-smileonu-dentist/)
  - **Message from the Founder:** [https://smileonu.org/message-from-the-founder/](https://smileonu.org/message-from-the-founder/)
  - **Board of Directors:** [https://smileonu.org/board-of-directors/](https://smileonu.org/board-of-directors/)
  - **Upcoming Clinics & CEUs for Charity:** [https://smileonu.org/upcoming-events/](https://smileonu.org/upcoming-events/)
  - **Contact:** `info@smileonu.org`

*(MouthLife is a free, independent dental arcade & brushing companion encouraging players who enjoy the game to support charitable dental relief directly at SmileOnU.org.)*
