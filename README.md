# MouthLife: The Plaque Dimension

A progressive stylized-3D biophysical dental arcade adventure and daily **"Smooth Bask"** oral-care companion (`TypeScript` + `Vite 6` + `Three.js r174`), where real dental-care habits and microscopic enamel-restoration missions unlock five global-to-orbital worlds — with **zero punitive streak tracking**, **zero sign-up**, and **100% on-device privacy**.

---

## 🚀 Quick Start (Mac, Windows, or Linux)

```bash
git clone https://github.com/jbrick2070/MouthLife.git
cd MouthLife
npm install

# Run all 137 engine, cartridge, chemistry, audio & UX unit tests
npm test

# Start local dev server (http://localhost:5173)
npm run dev

# Type-check & build production offline-capable PWA bundle into dist/
npm run build
```

---

## 🍎 Porting to iPhone, iPad & Mac (Xcode Handoff Ready)

Pointing a Mac or an AI coding agent at this repository? Start with these two specs:
- **🍎 [Mac & iOS Native Porting Blueprint (`docs/MAC_AND_IOS_PORTING_SPEC.md`)](docs/MAC_AND_IOS_PORTING_SPEC.md)** — Covers **both** the 15-minute **Ionic Capacitor Xcode wrapper** and a **ground-up native Swift (`SwiftUI` + `SceneKit`/`Metal` + `AVAudioEngine` + `CoreHaptics`)** module-by-module architecture map, `ML2:` cross-platform save compatibility, Apple App Store Review checklist, and a ready-to-paste Mac agent kickoff prompt.
- **🧬 [Master Game Design & Engine Architecture Spec (`docs/GDD_AND_ARCHITECTURE.md`)](docs/GDD_AND_ARCHITECTURE.md)** — Complete biophysics formulas, `OralSurfaceGrid` RGBA shader channel spec, 4-pillar scoring math, Saliva Stasis curves, and event bus contracts.

---

## 🎮 Playable Modes & Features (v1.0 Golden Master)

- **✦ Cosmic Stardust & Mohs Hardness Intro** — Interactive 3D journey from stellar nucleosynthesis (`²⁰Ca`, `¹⁵P`) to hydroxyapatite (`Mohs 5.0`, harder than steel) vs. bacterial acid (`pH 5.5` vs. fluorapatite `pH 4.5`).
- **🦷 Smooth Bask Companion Hub** — Interactive 14-crown 3D dental arch (rub teeth for crystalline glass-harp chimes + live tooth identification), **Interactive 32-Tooth Clinical Chart** (`ADA Universal #1–#32`, `ISO 3950 FDI 11–48`, `Palmer` + Spot Quiz + 4-layer SVG Tooth Anatomy), regional treats, non-punitive **Saliva Stasis** offline protection, **Biophysical Actuator Lab**, **Global Dental History Almanac**, and portable `ML2:` sync codes.
- **🪥 2-Minute Sink Brush-Along (+20s C-Curve Floss Bonus)** — Wake-Lock-protected quadrant/surface pacer teaching clinical quadrants (`Q1–Q4`) and surfaces (`B/F`, `O/I`, `L/P`, `M/D`) while banking monotonic Habit Stamps, Fluoride Ions, Supply Beacons, and Overdrive charges.
- **🌍 5-World Earth-to-Orbit Arcade Campaign + 90s Pulp Rescue:**
  1. **`world_1` — Plaque City** *(Toronto • 1498 Beijing & 1683 Leeuwenhoek)* — Pellicle shear, interdental Floss Tether-Zips & molar fissures.
  2. **`world_2` — Crescent Sulcus** *(New Orleans • 1819 Parmly & 1948 Dr. Charles Bass)* — Gentle moving 45° sulcus care vs. heavy stationary gum irritation.
  3. **`world_3` — Neon Acid Clock** *(Tokyo & Chicago • 1940 Dr. Robert Stephan)* — Repeating sweet-sip pH plunges below `5.5` & salivary bicarbonate buffering.
  4. **`world_4` — Fluorapatite Coast** *(Accra & Colorado Springs • Ancient Miswak & 1901–1945 Fluoride Discovery)* — Tart organic-acid basins & live enamel conversion into acid-defying fluorapatite (`pH 4.5` critical).
  5. **`world_5` — Quorum Dome** *(Station Aurora, 408 km LEO • 1973 NASA Skylab & 1978 Costerton Biofilms)* — Zero-G quorum-sensing EPS polymer shields cracked via Floss shear & Fluoride-Bicarb Surge waves.
  6. **`pulp_rescue` — 90s Emergency Molar Scramble** — Fast non-punitive rescue when repeated treats breach Enamel → Dentin → Pulp (with a safe `50%` Calcium-Hydroxide stabilization floor on timeout).
- **📱 Streamlined Mobile-First Viewport & Offline PWA** — Compact floating pills + swipe-to-dismiss bottom sheets (`60–88%` open 3D viewport on portrait & landscape phones), direct touch-on-tooth steering, and offline Service Worker caching (`public/sw.js`).

---

## 🗂️ Repository Map

```text
MouthLife/
├── docs/
│   ├── GDD_AND_ARCHITECTURE.md       # Biophysical & engine design specification
│   └── MAC_AND_IOS_PORTING_SPEC.md   # Capacitor + Native Swift (iOS/macOS) porting blueprint
├── public/                           # PWA manifest, icons, privacy.html & offline sw.js
├── src/
│   ├── main.ts                       # Deterministic bootstrap, mode router & lifecycle hooks
│   ├── config/                       # Constants, upgrades, hosts/history, 32-tooth chart, charity
│   ├── engine/
│   │   ├── audio/                    # Procedural Web Audio synthesizer & musical theory
│   │   ├── companion/                # Smooth Bask offline curve, treats & touch chime system
│   │   ├── persistence/              # SaveSystem (V1->V2 migration + ML2: sync codes) & HabitBank
│   │   ├── physics/                  # Cusp heightfield, derived alley walls & Capillary Tether-Zip
│   │   ├── render/                   # Three.js single-pass EnamelBiophysicsMaterial & 3D Earth
│   │   ├── scoring/                  # 10,000-pt 4-pillar scoring & actuator Synergy multiplier
│   │   ├── sim/                      # 60Hz WorldSession simulation across all cartridges
│   │   └── surface/                  # OralSurfaceGrid (256x128 RGBA) & OralChemistrySim (pH/sulcus)
│   ├── worlds/                       # 5 Earth-to-Orbit campaign cartridges + 90s Pulp Rescue
│   └── ui/                           # Mobile-first overlays, bottom sheets & pure HUD helpers
└── tests/                            # 19 Vitest suites (137 deterministic tests)
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
