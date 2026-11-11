# MouthLife: The Plaque Dimension — Mobile-First Biophysical Arcade & Pocket Companion Spec

## §1. Vision, Tone & Non-Negotiable Invariants

**MouthLife: The Plaque Dimension** is an engine-first, **mobile-portrait-first (and desktop-widescreen-compatible) 3D Progressive Web App (`TypeScript` + `Vite` + `Three.js`)** uniting three deeply satisfying experiences into one seamless dental universe:
1. **The Sensory Joy of Daily Clean ("The Smooth Bask"):** A pocket **Tamagotchi + Cozy Idle 3D Tooth Companion** where brushing, flossing, and fluoride-rinsing transform rough matte pellicle into **glassy, mirror-wet pearlescent enamel** with breezy cool-mint airflow ribbons and crystalline chime harmonics — passively crystallizing salivary Fluoride Ions between brushings while protecting your Enamel -> Dentin -> Pulp layers from the **Dreaded Root Canal**.
2. **Progressive 3D Biophysical Arcade Across Real Cities, Real Dental History & Space:** Zooming out *Universe Sandbox* / *Powers of Ten* style to a luminous **3D Rotating Earth**, players visit diverse multi-racial human hosts in real cities anchored to **true milestones in dental history** — from **1498 Beijing & 1683 Delft** (birth of the bristle brush & Leeuwenhoek's first microscopic sighting of oral *"animalcules"*) to **New Orleans**, **Chicago/Tokyo**, **Colorado Springs/Accra**, and **Low-Earth Orbit**!
3. **Real Oral Science as Playful, Vibrant Mechanics:** Every tool and world runs on authentic oral biophysics (`pH 5.5` hydroxyapatite vs `pH 4.5` fluorapatite remineralization, Stephan sucrose-frequency curves, salivary `HCO₃⁻` buffering, quorum-sensing EPS biofilm) rendered in **bright, colorful, fizzy, tactile 3D graphics** — never sterile grey textbook diagrams or preachy popups.

### §1.1 Non-Negotiable Invariants
1. **Engine Base First, Worlds as Declarative Cartridges:** Phase 1A builds and unit-tests the complete reusable **MouthLife Core Engine (`src/engine/`)** first; Phase 1B mounts the Pocket Companion Hub, 2-Minute Sink Brush-Along, and `World 1: Plaque City` on top of that proven engine.
2. **Zero Missed-Day Punishment (`Saliva Stasis` & Monotonic Stamps):** Missing a real-world day, week, or month **never** resets Habit Stamps, revokes upgrades, or inflicts an offline Root Canal. Away from the app (`> 18h`), the Pocket Companion enters protective **Saliva Stasis** (resting at superficial, reversible *Morning Fuzz* with `100%` safe Enamel/Dentin/Pulp). Even in active play, reaching `0%` Pulp Integrity triggers an exciting, reversible **90s Pulp Rescue Scramble** — never save loss or permadeath.
3. **Mobile-First Ergonomics & Modest-GPU Mastery:** Designed first for `9:19.5` portrait phones held one-handed at the bathroom sink or on the couch (with full responsive expansion to desktop `WASD` + Mouse), running `< 25` draw calls on a single-pass analytical wet-enamel shader with zero shadow-map depth passes and zero runtime shader recompilations.
4. **IP Cleanliness:** Commercial titles such as *Brush Up* (*Budd*, by *GamesThatWork*) are proprietary despite NIH grant funding; zero copyrighted names, likenesses, or assets from third-party games are used.

### §1.2 Build Phasing
- **Phase 1A — Core Engine Base (`src/engine/` + `Vitest` Suite):** `OralSurfaceGrid`, `OralChemistrySim`, `CompanionArchSim` (Tamagotchi/Idle + Root Canal shield), `CollisionSystem` + `CapillaryTetherZip`, `ScoringEngine`, synchronous `SaveSystem` (`localStorage` + `ML2:` Sync Code + JSON file backup), `EnamelBiophysicsMaterial` + `OrbitalEarthBackdrop` + 3-tier `QualityGovernor`, procedural `SoundEngine`, `HostRegistry` & `DentalHistoryAlmanac`.
- **Phase 1B — Playable Vertical Slice (`Pocket Companion + Globe Hub` + `World 1: Plaque City` + `2-Min Brush-Along` + PWA Manifest):** Complete mobile/desktop playable slice with all 3 actuators (*Sonic Bristle*, *Polymer Floss*, *Fluoride-Bicarb Ion Rinse*) + *Erythrosine Scan*, *Smooth Bask* idle loop, regional meal feeding, *Pulp Rescue* event, and *Angled Bass Array* upgrade.
- **Phases 2–5 (Post-Slice Cartridges on Existing Engine):** Activate `Worlds 2–5`, *Universe Sandbox*-style `Micro-Cosmos Sandbox / Endless Mode` (live `pH`/Saliva/Sucrose/Fluoride sliders), and optional `WebXR` Giant-Mouth explorer.

---

## §2. Triple-Harmony Gameplay Loop (Pocket Idle + Sink Ritual + Global Arcade)

### §2.1 Loop A — Pocket Tamagotchi & Cozy Idle "Smooth Bask" (`CompanionArchSim.ts`)
Accessible immediately on launch (ideal for 15-second mobile check-ins):
- **4 Anatomical Vitality Layers:**
  1. **`smoothnessIndex` (`0..100`):** Visual & audio surface feel (`0–45` rough matte pellicle fuzz; `85–100` **Glassy-Smooth Fresh-Mint Bask** with mirror specular reflections, cool cyan interdental breeze ribbons, and crystalline glass-chime audio when dragging/rotating your 3D teeth!).
  2. **`enamelShield` (`0..100`) -> `dentinShield` (`0..100`) -> `pulpIntegrity` (`0..100`):** Real anatomical progression of demineralization!
- **Cozy Idle Salivary Remineralization:** Whenever `smoothnessIndex >= 85`, salivary `Ca²⁺ / PO₄³⁻ / F⁻` ions passively crystallize **`+6` Fluoride Ions per real hour** into a claimable **Mineral Reservoir** (capped at `72 Ions` / `12h`).
- **Regional Meal Feeding & Avoiding the Dreaded Root Canal:** Players can tap **"Enjoy Regional Treat"** (e.g., *Toronto Maple Espresso*, *New Orleans Beignet*, *Tokyo Melon Soda*, *Accra Hibiscus Sobolo*, *Orbital Berry Pack*) to earn `+20` instant Ions and unlock Historical Field Notes. Each treat coats the companion arch in sticky sucrose plaque (`smoothnessIndex -= 35`) and begins active in-session acid pressure (`enamelShield -> dentinShield -> pulpIntegrity`).
  - Cleaning via a quick Arcade run or 2-Minute Sink Brush-Along restores `100%` shields and returns the arch to **Smooth Bask**!
  - If a player stacks multiple treats without cleaning until `pulpIntegrity === 0`, **The Dreaded Root Canal Siren** triggers a playable **90s Pulp Rescue Scramble** (clear the deep molar fissure, neutralize acid, and seal dentin to save the tooth!).
  - **Offline `Saliva Stasis` Guarantee:** Offline wall-clock time (`now - lastActiveEpochMs`) **only** accrues positive Idle Remineralization Ions (up to `72`) and gently settles `smoothnessIndex` toward a floor of `45` (*Morning Fuzz*) over `18h` — offline elapsed time **never** reduces `enamelShield`, `dentinShield`, or `pulpIntegrity`!

### §2.2 Loop B — 2-Minute "Brush-Along" Sink Ritual
1. **One-Tap Sink Launch:** Elevates the shared 3D camera into **Arch Overwatch** with `navigator.wakeLock?.request('screen').catch(() => {})` keeping the mobile screen awake beside the sink.
2. **Unskippable `4 x 30s` Quadrant Pacer (`120s`):** Highlights *Upper Right -> Upper Left -> Lower Left -> Lower Right* (*Outer -> Chewing -> Inner* every `10s`) with sparkling mint foam animations and harmonic marimba chimes. Both `simClock` and `pacerClock` pause cleanly if `document.visibilityState === 'hidden'` (showing a *"Tap to Resume Brushing"* badge so backgrounding cannot skip the timer).
3. **Optional `20s` Interdental Floss Pacer:** Animated C-contour filament guide awarding `+25` bonus Fluoride Ions.
4. **Daily Rewards & Healthy Caps:**
   - **First 2 Completions per Local Calendar Day (`YYYY-MM-DD`):** Restore Companion Arch to `100%` **Glassy-Smooth Bask**, award `+50` **Fluoride Ions**, `+1` monotonic **Habit Stamp**, `4` **Ion Relay Beacons** (`pendingSupplyBeacons = Math.min(4, prev + 4)`), and **Fluorapatite Overdrive** (`remineralizedOverdriveRuns = Math.min(4, prev + 2)`).
   - **Courtesy Cap (3rd–5th Same-Day Runs):** Restores `Smooth Bask` and grants `+5` Ions (up to `3` tips/day; `0` Ions beyond `5` daily runs).

### §2.3 Loop C — Active 3D Biophysical Arcade Missions (Playable Anytime)
Players pilot **Micro-Probe `HYDRA-1`** across vibrant 3D tooth cityscapes (`55°` perspective camera with automatic portrait FOV widening on mobile):
- **Cleanliness Metric (`CLEAN_THRESHOLD = 0.10`):** Cell (`0.25u x 0.25u`) is **clean** at `density <= 0.10`, snapping from matte slime to wet-glossy pearlescent crystal. District/world cleanliness = `cleanPaintableCells / totalPaintableCells * 100` (`O(1)` incremental counters).
- **Commensal Nodes & Soft-Lock-Proof District Sealing:** Clearing `>= 85%` of `PAINTABLE` cells within `2.0u` of a smothered **Commensal *S. sanguinis* Node** reactivates it (`+30` Surge charge + bubbly alkaline mist). Reaching `>= 90%` district clean cells **and** reactivating all district Commensal Nodes triggers an automatic zero-cost **Fluorapatite Remineralization Wave** — polishing the last `<= 10%` specks, sealing the district (`FLUORIDE_SEALED`), opening breezy interdental mint currents, and unlocking the next zone.

---

## §3. Actuators, Upgrades & Mobile/Desktop Controls

*(All runtime constants are exported exclusively from `src/config/gameConfig.ts`.)*

### §3.1 Core Actuators & Diagnostic Scan

| Actuator / Scan | Mobile Portrait Input (Thumb Deck) | Desktop Input | Biophysical Behavior | Dental Principle |
|-----------------|------------------------------------|---------------|----------------------|------------------|
| **1. Sonic Bristle Array** | Drag anywhere on lower-center **Thumb Pad** to steer + auto-sweep Bristles (or toggle `Scrub` lock) | `WASD`/Arrows + `Left Click` or `Space` | Forward shear arc (`radius = 1.6u`, `arc = 95°`). Dynamic sweeping (`speed >= 1.5u/s`) clears `2.2x` faster (`0.95/s` vs `0.43/s`). **Immune on `INTERDENTAL` cells**; `PROBE_RADIUS = 0.65u` (`1.30u` diameter) cannot enter `< 1.20u` interproximal contacts. | Sweeping bristle motion shears surface plaque, while physical bristles miss ~35–40% interproximal contact area. |
| **2. Polymer Floss Filament** | Drag & release compact **Floss Vector Ring** (previews glowing cyan line; quick-tap auto-aims nearest alley/crystal within `4.0u`!) | `Right Click` or `E` toward cursor hit on plane `y = probe.y` | Fires `3.8u` taut filament (`halfWidth = 0.14u`, `0.35s` cd). Strips `INTERDENTAL` plaque (`-> 0.0`), severs snapping **EPS Biofilm Bridges**, fractures **Sucrose Crystals**, and triggers a `0.22s` **Capillary Tether-Zip** when fired within `22°` of an alley axis from `< 1.4u`. | Only taut interproximal filament shear clears tight contacts and severs glucan bridges between teeth. |
| **3. Fluoride-Bicarb Ion Rinse** | Large pulsing **`Mint Surge`** thumb button (lights up at `100%`) | `Q` or `Shift` at `surgeMeter >= 100` | Expanding `9.0u` **Turquoise Fluoride Wave** (`1.0s`). Flushes *disrupted* slurry (`density <= 0.35 -> 0.0`), neutralizes acid pools (`pH -> 7.0`), stuns *S. mutans* (`3.0s`), and applies `FLUORIDE_SEALED` (`criticalPh: 5.5 -> 4.5`, `-60%` re-soiling) on clean cells (`<= 0.10`). **Dense intact biofilm (`> 0.35`) loses only `0.04` density.** | Preventive mouthwash flushes disrupted debris, buffers pH, and forms fluorapatite — but cannot replace mechanical brushing & flossing. |
| **4. Erythrosine Bio-Scan** | Compact **`Dye Scan`** pill button (`6.0s` cd) | `Tab` or `R` (`6.0s` cd) | `18.0u` **Two-Tone Magenta Wave** (`3.5s`). Tints missed dirty cells (`> 0.10`) rose-pink (thin pellicle) to electric violet (thick margin/fissure biofilm). | Real disclosing dyes stain young vs mature plaque matrices so hidden pockets become unmistakable. |

### §3.2 Actuator Upgrade Registry (`src/config/upgrades.ts`)
*(Source of truth for unlock status is `save.unlockedUpgrades.includes(id)`; once unlocked via Stamps, World Clear, or Ions, UI marks it `OWNED` and disables purchase to prevent double-spend.)*
- **`angled_bass_array` *(Phase 1B — 3 Stamps, World 1 Clear, or 100 Ions)*:** Widens Bristle arc `95° -> 130°` and boosts `MARGIN_FISSURE` shear from `0.65x` to `0.65 * 1.45 = 0.9425x` of open-enamel rate.
- **`hydro_sonic_pulse` *(World 2 Tier — 6 Stamps or 250 Ions)*:** Cuts gingival `gumIrritation` buildup by `50%`.
- **`ptfe_ribbon_filament` *(World 3 Tier — 10 Stamps or 400 Ions)*:** Widens Floss `halfWidth` `0.14u -> 0.22u` and boosts Surge gain `+25%`.
- **`bicarb_buffer_jet` *(World 4 Tier — 15 Stamps or 600 Ions)*:** Ion Rinse locks zone `localPh >= 7.1` for `8.0s`.

---

## §4. Real Global Cities, Authentic Dental History & 5-World Campaign

Every stop on the 3D Earth Globe pairs a **diverse contemporary human host** with a **verified milestone in global dental history** (collected as illustrated *Historical Field Notes* in the Almanac):

| World ID | Modern Host & City (`Lat, Lon`) | Real Dental History Milestone Honored | `bChannelMode` & Biophysical Mechanics |
|----------|---------------------------------|---------------------------------------|----------------------------------------|
| **`world_1`** *(Phase 1B Built)* | **Maya Lin-Okafor** — Architect, **Toronto** (`43.65°N, 79.38°W`) | **1498 Beijing & 1683 Delft:** Ming Dynasty invention of the hog-bristle toothbrush (1498) + **Antonie van Leeuwenhoek** (1683, Delft) discovering living oral *"animalcules"* under his microscope and noting intact plaque shielded them from vinegar! | `bChannelMode: 'marginDensity'`. **3 Zones** (`64u x 32u`): *Incisor Terrace* (`0.50` pellicle + `0.85` `MARGIN_FISSURE`), *Premolar Contact Alleys* (`0.90u` `INTERDENTAL` gaps + elastic `BiofilmBridge`s), *First Molar Basin* (cruciform fissure + `SucroseCrystal`s + bouncy *S. mutans* cocci). **10 Commensal Sites** + **3 Salivary Springs**. |
| **`world_2`** *(Engine-Ready)* | **Marcus & Celine Beaumont** — Jazz Luthiers, **New Orleans** (`29.95°N, 90.07°W`) | **1819 & 1948 New Orleans:** **Levi Spear Parmly** pioneering waxed silk floss in New Orleans (1815–1819) + **Dr. Charles C. Bass** (Dean at Tulane University, 1948) developing the microscopic **45° Sulcus Brushing & Unwaxed Floss Method**! | `bChannelMode: 'gumIrritation'`. Uses `SULCUS` flag + `gumIrritation` (`0..1` coral blush). Heavy stationary scrubbing inflames papillae; sweeping 45° strokes & C-curved floss soothe tissue and award *Bass Precision* bonus. |
| **`world_3`** *(Engine-Ready)* | **Kenji Sato** — Synth Designer, **Chicago / Tokyo** (`41.88°N, 87.63°W` / `35.66°N, 139.70°E`) | **1940 Chicago:** **Dr. Robert M. Stephan** (Univ. of Illinois, Chicago) using micro-electrodes on human teeth to plot the **Stephan pH Curve**, proving frequent sugar sips trap enamel below `pH 5.5` for 20–40 minutes per hit! | `bChannelMode: 'localPh'`. Activates `stephanTimerSec` (`20.0s` acid window) + `oralPh` (`7.0 -> 4.8` on sucrose drop). Intercepting waves & converting enamel to `FLUORIDE_SEALED` (`criticalPh = 4.5`) prevents demineralization! |
| **`world_4`** *(Engine-Ready)* | **Dr. Amara Mensah** — Distance Runner, **Colorado Springs / Accra** (`38.83°N, 104.82°W` / `5.60°N, 0.19°W`) | **1901–1945 Fluoride Detective Story & Ancient *Miswak*:** **McKay, Churchill & Dean** discovering natural spring fluoride remineralizes hydroxyapatite into acid-resistant **fluorapatite**, paired with millennia-old African/Middle Eastern ***Salvadora persica* (Miswak)** mineral & saliva stimulation! | `bChannelMode: 'localPh'`. Spatial acid zones (`pH 4.2..7.4`); scrubbing unbuffered softened cells (`pH < criticalPh`) deals `0` removal and sparks abrasion warnings until players trigger **Salivary `HCO₃⁻` Springs** (`pH -> 7.1`) first! |
| **`world_5`** *(Engine-Ready)* | **Specialist Tariq Al-Mansoor** — **Houston / Station *Aurora* Orbit** (`29.55°N, 95.09°W` -> `408 km` LEO) | **1973 NASA *Skylab* & 1978 Costerton Biofilms:** NASA Johnson Space Center *Skylab* microgravity oral microbiome studies (1973) + **J.W. Costerton** (1978) defining quorum-sensing **EPS polymer biofilms**! | `bChannelMode: 'epsArmor'`. 3-phase *Quorum Dome* boss: sever 4 Floss tethers -> fracture Sucrose Conduits & fire Bicarb Springs -> shear exposed core `< 0.35` -> **Mint-Fluoride Ion Surge**! |
| **`sandbox`** *(Engine-Ready)* | **Micro-Cosmos Sandbox** — *Universe Sandbox* Mode | **Interactive Oral Biophysics Lab & Endless Arch:** Real-time sliders (`Saliva Flow`, `Sucrose Interval`, `Beverage pH`, `Fluoride ppm`) + seeded `mulberry32` endless sectors. | Dynamically switches `bChannelMode` by active inspection lens; feeds live sliders straight into `OralChemistrySim`. |

---

## §5. Scoring, Economy & Single-Source Persistence

### §5.1 4-Pillar Mastery Score & Grades (`ScoringEngine.ts`)
Evaluated out of `10,000` baseline (`80%` thoroughness & technique, `20%` par-time flow):
1. **Enamel Smoothness Restoration (`0..5,000`):** `Math.round(worldCleanRatio * 5000)`.
2. **Biophysical Technique (`0..2,500`):** Sweeping shear efficiency, interproximal filament slices, fluorapatite conversions, and gentle tissue/pH care.
3. **Commensal & Ecology Recovery (`0..1,500`):** `+120` per Commensal Site restored + `+50` per Sucrose hazard cleared (cap `1,500`).
4. **Par-Time Flow (`0..1,000`):** `1,000` within `parTimeSec` (`270s` in World 1), tapering linearly to `250` at `2 * parTimeSec`.
5. **Synergy Multiplier (`1.0x..3.0x`):** `+0.25x` when alternating *Bristle -> Floss -> Rinse*; cools `-0.15x/s` after `4.0s` idle without subtracting banked score.
- **Grades:** `C` (`< 5,500`), `B` (`5,500–7,199`), `A` (`7,200–8,499`), `S` (`8,500–9,399`), **`Fluorapatite Gold`** (`>= 9,400` + `100%` Sites Restored).

---

## §6. Technical Architecture Specification (`TypeScript` + `Vite` + `Three.js`)

### §6.1 Stack, PWA & Compiler Config
- **Dependencies:** `three@^0.174.0`, `@types/three@^0.174.0`, `vite@^6.2.0`, `typescript@^5.7.0`, `vitest@^3.0.0`.
- **Mobile PWA (`public/manifest.webmanifest` + `index.html`):** Standalone portrait-friendly installable web app with `viewport-fit=cover` and CSS `env(safe-area-inset-*)` thumb ergonomics.
- **`tsconfig.json`:** `"strict": true`, `"noUncheckedIndexedAccess": false`, `"target": "ES2022"`, `"moduleResolution": "bundler"`.

### §6.2 Engine-First Directory Layout
```text
d:\MouthLife\
├── index.html
├── public/
│   └── manifest.webmanifest             # Installable Mobile Portrait PWA manifest
├── package.json
├── tsconfig.json
├── vite.config.ts
├── docs/
│   └── GDD_AND_ARCHITECTURE.md
├── src/
│   ├── main.ts                          # 7-step deterministic bootstrap & AppMode FSM
│   ├── config/
│   │   ├── gameConfig.ts                # SINGLE AUTHORITATIVE source for all runtime constants
│   │   ├── upgrades.ts                  # UpgradeRegistry definitions
│   │   └── hostsAndHistory.ts           # Diverse global hosts, regional treats & Dental History notes
│   ├── engine/                          # REUSABLE CORE ENGINE (Phase 1A)
│   │   ├── types.ts                     # Pure TypeScript interfaces/types/enums ONLY (no consts)
│   │   ├── EventBus.ts                  # Typed AppEventMap pub/sub with disposer bag
│   │   ├── ClockController.ts           # 60Hz fixed-dt sim clock + visibility-safe pacer clock
│   │   ├── InputManager.ts              # Mobile one-hand Thumb Deck/Floss Ring + Desktop WASD/Mouse
│   │   ├── companion/
│   │   │   └── CompanionArchSim.ts      # Tamagotchi Smooth Bask, Idle Ions, Treats, Saliva Stasis
│   │   ├── surface/
│   │   │   ├── OralSurfaceGrid.ts       # Float32Array biofilm + Uint8Array flags + actuator ops
│   │   │   └── OralChemistrySim.ts      # Spatial/global pH, Stephan curve, HCO3-, gumIrritation
│   │   ├── physics/
│   │   │   └── CollisionSystem.ts       # Alley AABB builder, circle-AABB slide, Tether-Zip
│   │   ├── sim/
│   │   │   └── WorldSession.ts          # Cartridge-driven 60Hz arcade & Pulp-Rescue loop
│   │   ├── scoring/
│   │   │   └── ScoringEngine.ts         # 4-pillar score, Synergy multiplier, Mastery Grades
│   │   ├── persistence/
│   │   │   ├── SaveSystem.ts            # Sync localStorage + saveRevision + ML2 Base64URL + JSON
│   │   │   └── HabitBank.ts             # Monotonic stamps, local YYYY-MM-DD caps, Overdrive
│   │   ├── render/
│   │   │   ├── SceneManager.ts          # WebGLRenderer, Portrait/Desktop CameraRig, QualityGovernor
│   │   │   ├── OrbitalEarthBackdrop.ts  # Fresnel 3D Earth globe + historical city pins + starfield
│   │   │   ├── EnamelBiophysicsMaterial.ts # Glassy wet-enamel + smoothstep DataTexture GLSL
│   │   │   ├── CartridgeMeshBuilder.ts  # Procedural 3D tooth arch + baked vertex cavity AO
│   │   │   └── EntityBatchRenderer.ts   # HYDRA-1, mint breeze ribbons, ULTRA-preallocated InstancedMeshes
│   │   └── audio/
│   │       └── SoundEngine.ts           # Web Audio scrub-to-chime synth, mint breeze & pacer chords
│   ├── worlds/
│   │   ├── worldRegistry.ts             # Cartridge catalog (World 1 + Pulp Rescue + Worlds 2-5 specs)
│   │   └── plaqueCityCartridge.ts       # World 1 (Toronto / 1498 Beijing & 1683 Delft) cartridge
│   └── ui/                              # OverlayView-implementing responsive mobile/desktop UI
│       ├── CompanionHubOverlay.ts       # Pocket Arch Bask view, Treat feeder, Globe switcher, Sync modal
│       ├── TelemetryHudOverlay.ts       # Compact top bar + Mobile Bottom Thumb Deck / Desktop hints
│       ├── BrushAlongOverlay.ts         # 2-Min Arch Overwatch pacer + 20s Floss guide
│       └── MissionReportOverlay.ts      # Smoothness Bask orbit, 4-Pillar Grade, History Card unlock
└── tests/
    ├── oralSurfaceGrid.test.ts          # Shear rates, INTERDENTAL block, per-cell F- pH 5.5->4.5
    ├── oralChemistrySim.test.ts         # Stephan 20s curve, HCO3- buffering, gum inflammation
    ├── companionArch.test.ts            # Idle Ion cap (72), Treat pressure, >18h Saliva Stasis safety
    ├── collisionSystem.test.ts          # Derived alley AABBs, PROBE_RADIUS block, Tether-Zip
    ├── scoringEngine.test.ts            # 4-pillar math, Synergy multiplier, Fluorapatite Gold
    ├── saveAndHabit.test.ts             # v1->v2 migration, saveRevision, daily caps, ML2 roundtrip
    └── worldSession.test.ts             # Cartridge bake, Commensal restore, auto Remin Wave, Beacon pickup
```

### §6.3 GPU-Smart Vibrant Rendering & Bounded *Powers of Ten* Rig

1. **Bounded Theatrical *Powers of Ten* Frustum & Portrait-Adaptive FOV (`SceneManager.ts`):**
   - Single camera (`near = 0.5, far = 320` — zero 24-bit mobile depth-buffer Z-fighting!):
     - `earthGroup` (`OrbitalEarthBackdrop`, `radius = 18u`) sits at `(32, 110, 16)`.
     - `archGroup` (Pocket Companion / Arcade Molar Arch) occupies `[0..64] x [0..4.5] x [0..32]`.
   - During the `1.4s` zoom between Globe and Arch (`CameraRig.isTransitioning === true`), `InputManager` gates gameplay actions and swaps `earthGroup.visible <-> archGroup.visible` at `t = 0.55` behind a brief HUD aperture shimmer.
   - **Portrait Mobile FOV Scaling:** When `aspect = width / height < 1.0`, vertical FOV widens smoothly via `2 * atan(tan(baseFovRad / 2) / clamp(aspect, 0.52, 1.0))`, framing the full tooth zone cleanly above the mobile bottom Thumb Deck!

2. **Vibrant Glassy-Smooth `EnamelBiophysicsMaterial` (`ShaderMaterial`):**
   - **Derived `DataTexture` Size:** `texW = Math.round(cartridge.worldWidth / CELL_SIZE)`, `texH = Math.round(cartridge.worldDepth / CELL_SIZE)` (`256x128` for `64u x 32u` cartridges), `RGBAFormat`, `UnsignedByteType`, `LinearFilter`, `ClampToEdgeWrapping`, `flipY = false`.
   - **Continuous `0..255` Channels:** `R = biofilmDensity`, `G = fluorapatiteSeal` (iridescent mint-pearl luster), `B = biophysicsTint` (interpreted in GLSL via uniform `int uBChannelMode` matching `cartridge.bChannelMode`), `A = paintableMask`.
   - **Sensory "Rough -> Glassy Smooth" Shader Transition:** `float biofilmMask = smoothstep(0.09, 0.13, tex.r);` switches surface appearance sharply from matte textured yellow-lime pellicle (`biofilmMask ~ 1.0`) to **high-gloss wet pearlescent enamel** (`pow(max(dot(N, H), 0.0), 36.0) + skyMintFresnel`) as cells cross `<= 0.10`!

3. **Zero-Recompile `QualityGovernor` & `MAX_PARTICLES_ULTRA` Pre-Allocation:**
   - All `InstancedMesh` particle/foam/bubble/shadow pools in `EntityBatchRenderer` are allocated **once at `MAX_PARTICLES_ULTRA (400)` capacity** (`16 KB` matrix array). Tier switches (`low: 60`, `medium: 180`, `ultra: 400`, hysteresis `< 42 FPS` down / `> 57 FPS` up, `5.0s` cooldown, constants in `gameConfig.ts`) modify **only** `renderer.setPixelRatio()` and active emission/`mesh.count` — **zero buffer reallocations, zero shadow-map passes, zero shader recompiles**.
   - **Pre-Warm & Context Restore:** All materials, uniforms (including `uDiscloseStrength`), and a valid `256x128` `DataTexture` exist *before* `renderer.compile(scene, camera)` runs at boot AND inside the `webglcontextrestored` handler.

### §6.4 Canonical Wiring Contracts (`main.ts`, `EventBus.ts`, `OralSurfaceGrid.ts`, `SaveSystem.ts`)

#### 1. Deterministic 7-Step Bootstrap Sequence (`main.ts`)
1. Import static registries (`gameConfig`, `upgrades`, `hostsAndHistory`, `worldRegistry`) — synchronous module constants, zero lazy-import race.
2. `const save = SaveSystem.load()` — synchronous `localStorage` read + `migrateSave()` validation (unknown future upgrade/host IDs in imported `ML2:` strings are stripped from active `equippedUpgrades` without throwing while preserving numeric currencies/stamps).
3. `CompanionArchSim.reconcileOfflineElapsed(save, Date.now())` — accrues idle Smooth Bask Ions (`<= 72` cap) and applies safe `Saliva Stasis` floor (`smoothnessIndex >= 45`, zero shield damage).
4. `SceneManager.init(canvas, save.qualityPreference, urlQueryOverrides)` — initializes WebGL2 (with `{ antialias: false, powerPreference: 'default' }` fallback retry + DOM diagnostic card on total WebGL failure).
5. `WorldSession.loadCartridge(plaqueCityCartridge)` + `EntityBatchRenderer.initUltraPools()` + `SceneManager.prewarmShaders()` (`renderer.compile(scene, camera)`).
6. `SoundEngine.bindFirstGestureUnlock()` + mount initial `CompanionHubOverlay` (`AppMode = 'HUB'`).
7. `ClockController.start()` + bind `window.addEventListener('storage', ...)` for cross-tab `saveRevision` sync.

#### 2. Typed `AppEventMap` & Overlay Lifecycle (`src/engine/EventBus.ts`)
Every UI class implements `interface OverlayView { mount(container: HTMLElement): void; dispose(): void; }`. On `AppMode` change (`'HUB' | 'ARCADE' | 'PULP_RESCUE' | 'BRUSH_ALONG' | 'REPORT'`), `main.ts` invokes `currentOverlay.dispose()` *before* mounting the next overlay.

| Event Name | Publisher | Payload Shape | Subscribers |
|------------|-----------|---------------|-------------|
| `'mode:changed'` | `main.ts` | `{ from: AppMode; to: AppMode }` | `SceneManager`, `InputManager`, `SoundEngine` |
| `'actuator:scrub'` | `WorldSession` | `{ cleanRatio: number; newlyCleaned: number; acidWarn: boolean }` | `SoundEngine` (pitch-shifts scrub -> chime!), `EntityBatchRenderer`, `TelemetryHudOverlay` |
| `'floss:sliced'` | `WorldSession` | `{ from: Vec2; to: Vec2; bridgesCut: number; zipped: boolean }` | `ScoringEngine`, `SoundEngine`, `EntityBatchRenderer` |
| `'rinse:surged'` | `WorldSession` | `{ origin: Vec2; cellsSealed: number }` | `ScoringEngine`, `SoundEngine`, `EntityBatchRenderer` |
| `'site:restored'` | `WorldSession` | `{ siteId: string; pos: Vec2; districtIdx: number }` | `ScoringEngine` (`+120`), `SoundEngine`, `EntityBatchRenderer` |
| `'district:sealed'` | `WorldSession` | `{ districtIdx: number; worldCleanRatio: number }` | `SoundEngine`, `EntityBatchRenderer` (mint breeze!), `TelemetryHudOverlay` |
| `'beacon:collected'` | `WorldSession` | `{ beaconIndex: number; pos: Vec2 }` | `SaveSystem` (decrements `pendingSupplyBeacons` by `1` immediately!), `SoundEngine` |
| `'mission:complete'` | `WorldSession` | `{ worldId: string; breakdown: ScoreBreakdown; historyId: string }` | `SaveSystem` (commits score, ions, stamp, and decrements `remineralizedOverdriveRuns` by `1`), `CompanionArchSim`, `main.ts` |
| `'companion:updated'`| `CompanionArchSim` | `{ smoothness: number; pulpIntegrity: number; idleIons: number }` | `SaveSystem`, `CompanionHubOverlay`, `SceneManager` |
| `'pacer:tick'` | `ClockController` | `{ elapsedSec: number; quadrantIdx: number; surfaceIdx: number }` | `BrushAlongOverlay`, `SoundEngine`, `SceneManager` |
| `'quality:changed'` | `SceneManager` | `{ tier: 'low' | 'medium' | 'ultra'; fps: number }` | `EntityBatchRenderer`, `TelemetryHudOverlay` |
| `'webgl:restored'` | `SceneManager` | `{}` | `WorldSession` (`grid.textureDirty = true`), `EntityBatchRenderer`, `SceneManager.prewarmShaders()` |

#### 3. Single-Source Alley & Spatial `pH` Contracts (`OralSurfaceGrid.ts` & `CollisionSystem.ts`)
- **Single-Source Interdental Alleys:** `cartridge.interdentalAlleys[]` is the sole definition of narrow contacts; `CollisionSystem.buildAlleyWalls(cartridge)` generates flanking wall `AABB2D`s separated by `alley.width`, and `OralSurfaceGrid.bakeFromCartridge(cartridge)` stamps `CellFlag.INTERDENTAL` onto cells inside the exact `endpointA <-> endpointB` capsule.
- **Spatial `pH` Brush Signature:** `applyBrush(params: BrushApplyParams, chemistry: OralChemistrySim): ToolApplyResult` calls `chemistry.getCellPh(idx)` per cell and compares against `(flags[idx] & CellFlag.FLUORIDE_SEALED) ? CRITICAL_PH_FLUORAPATITE : CRITICAL_PH_HYDROXYAPATITE` (`4.5` vs `5.5`).

#### 4. Synchronous Save Schema (`SaveSystem.ts` — `localStorage` Primary + `saveRevision`)
```ts
export interface CompanionState {
  smoothnessIndex: number;       // 0..100 (>=85 = Smooth Bask idle ion generation)
  enamelShield: number;          // 0..100
  dentinShield: number;          // 0..100
  pulpIntegrity: number;         // 0..100 (0 triggers playable Pulp Rescue, never permadeath)
  unclaimedIdleIons: number;     // 0..72 (+6/hr while smoothnessIndex >= 85)
  lastEvaluatedEpochMs: number;
}

export interface MouthLifeSaveV2 {
  schemaVersion: 2;
  saveRevision: number;          // Monotonic +1 on every save write (cross-tab conflict guard)
  lastSavedEpochMs: number;
  playerProfile: { displayName: string; skinToneIndex: number; homeCityId: string };
  companion: CompanionState;
  totalBrushStamps: number;      // Monotonic >= 0; NEVER decreases
  fluorideIons: number;          // Spendable currency >= 0
  dailySlotsByDate: Record<string, { fullRewards: number; tips: number }>; // Local YYYY-MM-DD
  pendingSupplyBeacons: number;  // 0..4 (decremented per in-session 'beacon:collected')
  remineralizedOverdriveRuns: number; // 0..4 (decremented only on 'mission:complete')
  unlockedUpgrades: string[];
  equippedUpgrades: { brush: string | null; floss: string | null; rinse: string | null };
  unlockedHistoryNotes: string[]; // e.g. ['1498_beijing_brush', '1683_delft_leeuwenhoek']
  qualityPreference: 'auto' | 'low' | 'medium' | 'ultra';
  worlds: Record<string, WorldRecord>;
  sandboxBest: { bestScore: number; longestEquilibriumSec: number; lastSeed: number };
}
```

---

## §7. Verification & Acceptance Criteria

1. **Automated Engine Unit Tests (`npx vitest run` — Phase 1A Gate):**
   - `oralSurfaceGrid.test.ts`: Verifies `O(1)` clean counters, sweeping vs stationary shear, single-source `INTERDENTAL` brush block, Floss clearing, Ion Rinse `<= 0.35` slurry flush + `FLUORIDE_SEALED`, per-cell spatial `pH` check (`5.5` vs `4.5`), and `angled_bass_array` `0.65 * 1.45` margin formula.
   - `oralChemistrySim.test.ts`: Verifies Stephan `20s` pH drop/reset, `HCO₃⁻` spring buffering, and `gumIrritation` dynamics.
   - `companionArch.test.ts`: Verifies **Smooth Bask** (`smoothnessIndex >= 85`) accrues `+6 Ions/hr` up to `72` cap, feeding regional treats lowers shields toward `Pulp Rescue` without permadeath, and `> 18h` offline enters **Saliva Stasis** (`smoothnessIndex >= 45`, zero Enamel/Dentin/Pulp loss).
   - `collisionSystem.test.ts`: Verifies `buildAlleyWalls()` + `PROBE_RADIUS (0.65u)` block `< 1.20u` alleys and `Capillary Tether-Zip` interpolates endpoints in `0.22s`.
   - `scoringEngine.test.ts`: Verifies 4-pillar math, Synergy multiplier `3.0x` cap, and `Fluorapatite Gold` grade.
   - `saveAndHabit.test.ts`: Verifies `v1 -> v2` migration, unknown-ID forward-compat stripping, `saveRevision` monotonicity, 90-day missed-habit zero loss, per-pickup beacon vs completion-only Overdrive decrement, and `ML2:` UTF-8 Base64URL roundtrip.
   - `worldSession.test.ts`: Verifies *Plaque City* cartridge bake, Commensal reactivation (`>= 85%` local clean), and automatic Fluorapatite Remineralization Wave (`>= 90%` district clean + all district Sites restored).
2. **Build & PWA Gate (`npm run build`):**
   - `tsc --noEmit` exits `0`; Vite bundle builds cleanly with `manifest.webmanifest` intact.
3. **Mobile Portrait & Desktop Browser Smoke Check:**
   - Verify `390x844` portrait mobile viewport (Thumb Deck + Floss Ring + Portrait FOV + Smooth Bask companion rotation + Treat feeding + 2-Min Sink Brush-Along) AND `1280x800` desktop viewport (`WASD`/Mouse + 3D Earth Globe -> Toronto *Plaque City* clear -> Historical Field Note unlock), confirming `< 25` draw calls and zero tier-switch shader stutters.
