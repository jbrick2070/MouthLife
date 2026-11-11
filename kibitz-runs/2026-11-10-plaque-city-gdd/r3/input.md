# MouthLife: The Plaque Dimension — Engine-First Biophysical Arcade GDD & Architecture

## §1. Vision, Tone & Non-Negotiable Invariants

**MouthLife: The Plaque Dimension** is an engine-first, grounded 3D biophysical arcade adventure (`TypeScript` + `Vite` + `Three.js`) inspired by the scale, scientific clarity, and cosmic beauty of ***Universe Sandbox*** and ***Powers of Ten***, fused with the immediate tactile cleanup satisfaction of ***PowerWash Simulator*** and twin-stick action games.

Instead of a goofy cartoon fairyland, *MouthLife* grounds oral biology in **real human lives across the globe — and into Low-Earth Orbit**. Every session zooms smoothly from a rotating **3D Earth in space** down to a **diverse human host in a real location** (Toronto, Mexico City, Tokyo, Accra, Orbital Research Station *Aurora*, or the player's own customizable location/avatar), into their **3D anatomical dental arch**, and down to the **100-micron crystalline hydroxyapatite landscape**, where bacterial colonies, sucrose pulses, bicarbonate buffers, and fluoride ions obey real oral chemistry while remaining effortless and joyful to play.

### §1.1 Core Design & Engineering Pillars
1. **Engine Base First, Worlds as Data Cartridges:** Phase 1A builds a complete, reusable **MouthLife Biophysical Engine (`src/engine/`)** modeling biofilm density, interdental shear, gingival pressure, Stephan-curve `pH`, salivary bicarbonate buffering, hydroxyapatite-to-fluorapatite conversion (`pH 5.5 -> 4.5`), mature EPS quorum matrices, scoring, saving, audio, and GPU scaling. Worlds 1–5 and Sandbox/Endless Mode mount onto this engine as declarative `WorldCartridge` definitions.
2. **Real Science Experienced as Fun Mechanics (*Universe Sandbox* Meets Arcade):** No lectures or trivia popups. Players feel real biophysical laws directly — watching `F⁻` ion rinses shift enamel's critical demineralization threshold from `pH 5.5` to `4.5`, seeing erythrosine disclosing waves illuminate hidden margin biofilm, and restoring beneficial commensal *S. sanguinis* sites choked by acidogenic *S. mutans*.
3. **Global, Multi-Racial Human Connection + Cosmic Scale:** A diverse cast of multi-racial human hosts across global cities and orbital space stations (plus a customizable player Host Profile with realistic melanin/undertone skin palettes and global home locations) grounds dental care as a universal human — and spacefaring — ritual.
4. **Additive Habit Momentum (Zero-Punishment Invariant):** Missing a day, week, or month **never** resets counters, decays enamel, revokes upgrades, or triggers guilt notifications. Cumulative Brush Stamps only move forward.
5. **GPU-Smart Beauty on Modest Hardware:** Single-pass analytical crystalline-enamel & Splatoon-style `smoothstep` `DataTexture` shaders, low-poly Fresnel orbital Earth globe, `InstancedMesh` batching, baked vertex AO, unified contact-shadow decals, and a hitch-free 3-tier (`low / medium / ultra`) frame-time governor run smoothly on Chromebooks, integrated Intel UHD laptops, and bathroom-sink phones as well as gaming PCs.

### §1.2 Build Phasing: Engine Base -> Vertical Slice -> Full Campaign
- **Phase 1A — MouthLife Core Engine Base (Built & Unit-Tested First):**
  - `OralSurfaceGrid` + `OralChemistrySim` (full 5-world biophysical rules), `CollisionSystem` + `FlossZip`, `WorldCartridge` loader, single-pass `EnamelBiophysicsMaterial` + Orbital Globe/Zoom rig + 3-tier `QualityGovernor`, 4-pillar `ScoringEngine`, layered `SaveSystem` (`IndexedDB` + `localStorage` mirror + `ML2:` Sync Code + migrations), procedural `SoundEngine`, `HostRegistry` (multi-racial/multi-location profiles), `CameoRegistry`, and complete Vitest suite.
- **Phase 1B — First Playable Cartridge (`World 1: Plaque City` + `Orbital Globe Hub` + `2-Min Brush-Along`):**
  - Interactive 3D **Orbital Earth & Host Selector Hub** (featuring diverse global hosts + customizable player profile), seamless *Powers of Ten* zoom into **World 1 (*Plaque City* — Host: Maya Lin-Okafor, Toronto)**, playable 3-district molar arch, all 3 physical micro-actuators (*Sonic Bristle*, *Polymer Floss*, *Fluoride-Bicarb Ion Rinse*) + *Erythrosine Disclosing Scan*, live biophysical HUD (`pH`, Mineral Flux, Cleanliness %), and live 3D *Arch Overwatch* 2-Minute Brush-Along.
- **Phases 2–5 (Post-Vertical-Slice Content Cartridges on the Same Engine):**
  - Activate playable `World 2 (Mexico City — The Gumline)`, `World 3 (Tokyo — Sugar Rush)`, `World 4 (Accra — The Acid Dimension)`, `World 5 (Low-Earth Orbit — Biofilm Boss)`, and interactive *Universe Sandbox*-style `Micro-Cosmos Sandbox / Endless Mode` (with real-time `pH` / Saliva / Sucrose / Fluoride sliders), plus optional `WebXR` scale-explorer rig.

---

## §2. Dual-Loop Gameplay Architecture

### §2.1 Loop A — Active 3D Biophysical Arcade (Playable Anytime)
Players pilot **Micro-Probe `HYDRA-1`**, a sub-millimeter precision dental rover navigating realistic crystalline 3D tooth topography (`55°` pitched perspective camera after zooming down from Earth orbit -> Host -> Dental Arch).
- **Canonical Cleanliness Metric (`CLEAN_THRESHOLD = 0.10`):** Every `PAINTABLE` surface cell (`0.25u x 0.25u`, where `1u ≈ 0.5 mm`) is **clean** when `density <= 0.10`. District and world cleanliness equal `cleanPaintableCells / totalPaintableCells * 100` via `O(1)` incremental per-district counters. Crossing `<= 0.10` reveals gleaming hexagonal hydroxyapatite prism specular highlights in the shader.
- **Restoring Enamel Sites & Commensal Nodes:** Instead of cartoon NPCs, each district contains key **Commensal Microflora & Enamel Prism Sites** (*Streptococcus sanguinis* alkaline-producing commensal nodes smothered under acidic biofilm domes). Clearing `>= 85%` of `PAINTABLE` cells within `2.0u` reactivates the site, releasing a `+30` **Ion Charge** pulse and boosting local salivary `Ca²⁺ / PO₄³⁻` remineralization!
- **Soft-Lock-Proof District Remineralization:** Reaching `>= 90%` clean cells in a district **and** reactivating all Commensal Sites in that district triggers an automatic, zero-cost **Fluorapatite Remineralization Wave** — clearing the last `<= 10%` stray residue, converting the district surface to `FLUORIDE_SEALED` (`criticalPh = 4.5`), activating local **Salivary Duct Springs**, and unlocking the next anatomical zone.

### §2.2 Loop B — 2-Minute "Brush-Along" Telemetry Ritual (Real-World Sink Companion)
Designed to run hands-free beside any bathroom sink around the world while physically brushing:
1. **Global Sync & Arch Overwatch:** Tapping *"Start 2-Min Brush-Along"* zooms from the player's selected **Global Location & Diverse Host Profile** into an illuminated **3D Anatomical Arch Overwatch** above the live tooth landscape (using the single shared `SceneManager`).
2. **Unskippable Real-Time 4-Quadrant Pacer (`4 x 30s = 120s`):** Highlights *Upper Right -> Upper Left -> Lower Left -> Lower Right* (cycling *Buccal/Outer -> Occlusal/Chewing -> Lingual/Inner* every `10s`) with warm ambient harmonic synth chimes (inspired by *Universe Sandbox* / Brian Eno scientific soundscapes). Each completed `30s` quadrant deploys an automated **Ion Relay Beacon** (up to `4`) onto the surface for the next Arcade run.
3. **Optional 20s Interdental Sweep Pacer:** At `120s`, players can claim rewards immediately or run a `20s` guided C-contour interdental filament pacer for `+25` bonus **Fluoride Ions** (upgrade currency).
4. **Reward Economy & Healthy Caps (Zero Streak Decay):**
   - **First 2 Completions per Local Calendar Day (`YYYY-MM-DD`):** Award `+50` **Fluoride Ions**, `+1` monotonic **Habit Stamp**, `4` deployed **Ion Relay Beacons** (`pendingSupplyBeacons = 4`), and **Fluorapatite Overdrive** (`remineralizedOverdriveRuns = Math.min(4, prev + 2)`, granting `+25%` Bristle sweep width and `100%` starting Ion Rinse charge).
   - **Courtesy Cap (3rd–5th Same-Day Runs):** Awards `+5` Ions up to `3` courtesy runs/day (`0` beyond `5` daily runs) to discourage compulsive over-brushing. Missing days never reduces stamps, unlocks, or mineral integrity.

---

## §3. Micro-Probe Actuators, Upgrades & Registry Systems

*(All baseline physics/chemistry constants are centralized in `src/config/gameConfig.ts`.)*

### §3.1 Core Actuators & Diagnostic Scan

| Actuator / Scan | Desktop Input | Touch Input | Biophysical Engine Behavior | Real Dental Science |
|-----------------|---------------|-------------|-----------------------------|---------------------|
| **1. Sonic Bristle Array** (*Mechanical Shear*) | `Left Click` or `Space` + `WASD`/Arrows | Left virtual thumbstick + `Scrub` hold/toggle | Sweeps forward shear arc (`radius = 1.6u`, `arc = 95°`). Calls `applyBrush()`. Dynamic sweeping (`speed >= 1.5u/s`) generates hydrodynamic shear clearing `2.2x` faster (`0.95/s` vs `0.43/s` stationary). **Cannot reach `INTERDENTAL` cells**; probe chassis (`PROBE_RADIUS = 0.65u`, diameter `1.30u`) physically cannot enter `< 1.20u` interproximal contacts. | Bristle shear disrupts surface biofilm pellicle, but physical bristle geometry misses ~35–40% of interproximal enamel. |
| **2. Polymer Floss Filament** (*Interproximal Shear & Tether*) | `Right Click` or `E` aimed at cursor hit on plane `y = probe.y` (fallback: probe heading) | Right-thumb **vector drag-pad** previews cyan laser filament; release fires | Extends high-tensile filament (`length = 3.8u`, `halfWidth = 0.14u`, `cooldown = 0.35s`). Calls `applyFlossSegment()` to strip `INTERDENTAL` biofilm (`-> 0.0`), sever **EPS Biofilm Bridges**, and fracture **Sucrose Crystals**. Firing within `22°` of an open `InterdentalAlley` axis from within `1.4u` of its entrance triggers a `0.22s` **Capillary Tether Zip** through the contact channel. | Only taut interproximal filament shear clears tight contact points and severs interdental glucan bridges. |
| **3. Fluoride-Bicarb Ion Rinse** (*Fluid Surge & Remineralization*) | `Q` or `Shift` when `surgeMeter >= 100` | Glowing `Ion Surge` HUD button | Expands `9.0u` **Fluoride-Bicarbonate Fluid Wave** (`1.0s`). Flushes *mechanically disrupted* slurry (`density <= 0.35` -> `0.0`), buffers **Lactic Acid Pools** (`localPh -> 7.0`), stuns *S. mutans* (`3.0s`), and converts clean hydroxyapatite (`density <= 0.10`) to **`FLUORIDE_SEALED` fluorapatite** (lowering critical demineralization `pH` from `5.5` to `4.5` and cutting re-colonization by `60%`). **Intact dense biofilm (`density > 0.35`) sheds fluid (`-0.04` only) via hydrophobic EPS shielding.** | Mouthwash cannot strip intact EPS structural biofilm alone; after mechanical disruption, `F⁻` + `HCO₃⁻` rinse flushes debris, buffers acid, and forms acid-resistant fluorapatite. |
| **4. Erythrosine Disclosing Scan** (*Optical Biofilm Dye*) | `Tab` or `R` (`6.0s` cooldown) | `Bio-Scan` HUD button | Emits an `18.0u` **Spectroscopic Disclosing Wave** (`3.5s` shader uniform). Highlights remaining `density > 0.10` biofilm in clinical rose-pink (`0.11–0.45` young pellicle) to deep ultraviolet-magenta (`> 0.45` mature margin/fissure matrix). | Clinical erythrosine/two-tone disclosing agents differentially bind young vs mature glucan plaque matrices. |

### §3.2 Actuator Upgrade Tree (`UpgradeRegistry`)
- **`angled_bass_array` *(Phase 1B Unlock — 3 Stamps, World 1 Clear, or 100 Ions)*:** Widens Sonic Bristle arc `95° -> 130°` and boosts `MARGIN_FISSURE` shear efficiency from `0.65x` to `0.65 * 1.45 = 0.9425x` of open-surface rate (45° Bass gingival-margin geometry).
- **`hydro_sonic_pulse` *(World 2 Tier — 6 Stamps or 250 Ions)*:** Acoustic micro-streaming cuts gingival `gumIrritation` accumulation by `50%` along sulcus walls.
- **`ptfe_ribbon_filament` *(World 3 Tier — 10 Stamps or 400 Ions)*:** Widens Floss shear swath `0.14u -> 0.22u` and boosts sucrose crystal fracture charge `+25%`.
- **`bicarb_buffer_jet` *(World 4 Tier — 15 Stamps or 600 Ions)*:** Ion Rinse wave immediately neutralizes acidic zones (`localPh -> 7.2`) for `8.0s`.

### §3.3 Multi-Racial Global `HostRegistry` & IP-Clean `CameoRegistry`
- **Global Human `HostRegistry` (`src/engine/hosts/HostRegistry.ts`):**
  - Stores diverse, respectful, realistic human profiles (`id`, `name`, `city`, `country`, `latLon: [number, number]` for 3D Earth globe pin placement, `skinToneHex` across Fitzpatrick I–VI realistic undertones, `occupation`, `oralEcologyBrief`), plus a **Custom Player Host Profile** (`customSkinToneIndex: 0..7`, `customRegionPin`, `displayName`) saved locally.
- **IP Cleanliness & `CameoRegistry` (`src/engine/cameos/CameoRegistry.ts`):**
  - Web verification confirmed the commercial game *Brush Up* (*Budd*, by *GamesThatWork*) is proprietary and copyrighted despite NIH SBIR funding. **Zero copyrighted names, designs, or assets from *Brush Up* or any closed-source project are permitted.**
  - `CameoRegistry` accepts only `'ORIGINAL' | 'CC0' | 'CC-BY-4.0' | 'MIT'` entries, shipping with an original NASA/clinical telemetry AI hologram (**`DR-7 "PERI"` Orbital Dental Telemetry Advisor**) and supporting optional verified open-source (`CC0`/`MIT`) probe skins.

---

## §4. Full 5-World Global/Space Campaign + *Universe Sandbox* Mode

Every campaign world links a **real human host & location on the 3D Earth/Orbit map** to a **real biophysical engine system** in `OralSurfaceGrid` + `OralChemistrySim`:

| World | Host, Location & Earth Coordinates | Real-Life Scenario & Biophysical Principle | Engine State Channels & Gameplay |
|-------|------------------------------------|--------------------------------------------|----------------------------------|
| **`world_1`** *(Phase 1B Built)* | **Maya Lin-Okafor** — Urban Architect, **Toronto, Canada** (`43.65°N, 79.38°W`) | **Overnight Pellicle & Interproximal Colonization:** Reduced nocturnal saliva lets *S. mutans* & pellicle coat broad enamel, premolar contacts, and molar fissures. | **3 Anatomical Zones** (`64u x 32u`): *Central Incisor Labial Plane* (`0.50` pellicle + `0.85` cervical `MARGIN_FISSURE`), *Premolar Contact Valley* (`0.90u` `INTERDENTAL` channels + `BiofilmBridge`s), *First Molar Occlusal Basin* (cruciform fissure + `SucroseCrystal`s + *S. mutans* cocci). **10 Commensal/Enamel Sites** + **3 Salivary Ducts**. |
| **`world_2`** *(Engine-Ready)* | **Carlos & Elena Rivera** — Night-Market Chefs, **Mexico City, Mexico** (`19.43°N, 99.13°W`) | **Gingival Sulcus Shear & Pressure:** Rushed heavy scrubbing inflames vascular gingival tissue while missing subgingival plaque. | Activates `SULCUS` flag + `gumIrritation` (`0..1` mapped to `DataTexture.B` vascular crimson). Stationary over-brushing or perpendicular filament snaps raise `gumIrritation` (`> 0.7` swells sulcus walls); sweeping 45° strokes & C-curved filament passes keep tissue calm and maximize *Clinical Precision* score. |
| **`world_3`** *(Engine-Ready)* | **Kenji Sato** — Audio Engineer, **Tokyo, Japan** (`35.66°N, 139.70°E`) | **The Stephan Curve (Sucrose Frequency):** Frequent sweet coffee sips keep plaque `pH < 5.5` continuously vs single-meal exposure. | Activates `stephanTimerSec` (`20.0s` decay window) + live `oralPh` (`7.0 -> 4.8` on sucrose contact). Each un-intercepted *Sucrose Droplet* resets the `20s` demineralization window, doubling *S. mutans* glucan synthesis. Intercepting waves & converting enamel to `FLUORIDE_SEALED` (`criticalPh = 4.5`) protects mineral density! |
| **`world_4`** *(Engine-Ready)* | **Dr. Amara Mensah** — Marathon Runner, **Accra, Ghana** (`5.60°N, 0.19°W`) | **Dietary Acid Erosion & Salivary Buffering:** Low-pH sports drinks (`pH 3.2`) + exercise dehydration soften surface hydroxyapatite. | Activates spatial `localPh` (`4.2..7.4` mapped to `DataTexture.B` amber demineralization). Scrubbing while `localPh < criticalPh` (`5.5` unsealed / `4.5` sealed) deals `0` biofilm removal and triggers **Softened Prism Abrasion** warnings. Players stimulate **Salivary Bicarbonate Springs** (`HCO₃⁻` wave -> `pH 7.1`) *before* scrubbing! |
| **`world_5`** *(Engine-Ready)* | **Specialist Tariq Al-Mansoor** — **Orbital Station *Aurora*, Low-Earth Orbit** (`408 km` altitude, Cupola Earthrise) | **Microgravity Mature Quorum Biofilm:** Fluid-tension shifts and constrained rinsing allow a multi-species **EPS Polymer Dome** to mature across a molar arch. | Activates `EPS_ARMOR` flag. 3-stage biophysical boss: **(1)** sever 4 interproximal *Glucan Tethers* with Polymer Floss, **(2)** fracture *Sucrose Conduits* + trigger *Bicarbonate Jets* to neutralize its `pH 4.4` lactic shield, **(3)** shear the exposed *Quorum Core* below `0.35` and lock fluorapatite stability with **Ion Rinse Surge**! |
| **`sandbox`** *(Engine-Ready)* | **Micro-Cosmos Sandbox** — *Universe Sandbox* Mode (Procedural Seed + Live Biophysics Sliders) | **Interactive Oral Ecosystem Simulation & Endless Survival:** Experiment with real parameters (`Saliva Flow mL/min`, `Sucrose Hit Interval`, `Beverage pH`, `Fluoride ppm`) or play seeded endless arches. | Deterministic `mulberry32(seed)` procedural tooth sectors + live parameter controls feeding directly into `OralChemistrySim` so players can watch real-time mineral equilibrium or test high-score survival! |

---

## §5. Unified Scoring, Economy & Persistence Architecture

### §5.1 4-Pillar Clinical Mastery Score & Ranks (`ScoringEngine.ts`)
Evaluated identically across all cartridges (`10,000` baseline scale), weighting **thoroughness and biophysical care (`80%`)** over speed (`20%`):

1. **Enamel Restoration (`0..5,000 pts`):** `Math.round(worldCleanRatio * 5000)`.
2. **Biophysical Technique (`0..2,500 pts`):**
   - Hydrodynamic sweeping shear (`+15` per `10` cells cleared while moving)
   - Interproximal filament precision (`+150` per EPS Bridge / Sucrose Crystal cleared with Floss)
   - Fluorapatite conversion (`+10` per clean cell converted to `FLUORIDE_SEALED`)
   - Tissue & Mineral preservation bonus (low `gumIrritation` in World 2; zero softened-enamel abrasion events in World 4).
3. **Microbiome & Site Recovery (`0..1,500 pts`):** `+120` per reactivated Commensal/Enamel Site + `+50` per neutralized Sucrose source (capped at `1,500`).
4. **Par-Time Efficiency (`0..1,000 pts`):** `1,000 pts` within `parTimeSec` (e.g., `270s` in World 1), tapering linearly to `250 pts` at `2 * parTimeSec` (never `0` on completion).
5. **Synergy Multiplier (`flowMultiplier: 1.0x .. 3.0x`):** Rises `+0.25x` when chaining *Bristle Shear -> Filament Slice -> Ion Rinse*; gently cools (`-0.15x/s` after `4.0s` idle) without ever deducting banked points.

- **Clinical Mastery Grades:** `C` (`< 5,500`), `B` (`5,500–7,199`), `A` (`7,200–8,499`), `S` (`8,500–9,399`), **`Fluorapatite Gold`** (`>= 9,400` + `100%` Commensal Sites Restored).

### §5.2 Dual-Currency Meta-Progression (Zero Decay)
- **Fluoride Ions (Spendable Upgrade Currency):** Earned from Arcade runs (`Math.round(totalScore / 100)`) and real-world 2-Minute Brush-Alongs (`+50` + `+25` interdental pacer).
- **Cumulative Habit Stamps (Monotonic Counter):** Earned from real-world Brush-Alongs (`+1` up to `2/day`) + `+1` First-Time Clear per World. Never decreases.

---

## §6. Technical Architecture Specification (`TypeScript` + `Vite` + `Three.js`)

### §6.1 Stack & Compiler Configuration
- **Packages:** `three@^0.174.0`, `@types/three@^0.174.0`, `vite@^6.2.0`, `typescript@^5.7.0`, `vitest@^3.0.0` (total gzipped bundle `< 190 KB`).
- **`tsconfig.json` Contract:** `"strict": true`, `"noUncheckedIndexedAccess": false`, `"target": "ES2022"`, `"moduleResolution": "bundler"` — keeps `Float32Array` / `Uint8Array` cell-loop reads typed cleanly as `number` with explicit bounds checks inside `OralSurfaceGrid`.

### §6.2 Engine-First Directory Structure
```text
d:\MouthLife\
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── docs/
│   └── GDD_AND_ARCHITECTURE.md
├── src/
│   ├── main.ts                              # Bootstrap, WebGL fallback, AppMode FSM
│   ├── config/
│   │   ├── gameConfig.ts                    # Biophysical constants, radii, rates, quality caps
│   │   └── upgrades.ts                      # UpgradeRegistry (Tier 1..4 actuator upgrades)
│   ├── engine/                              # REUSABLE BIOPHYSICAL GAME ENGINE (Phase 1A)
│   │   ├── types.ts                         # Vec2, Cartridge, Chemistry, Host, Save interfaces
│   │   ├── EventBus.ts                      # Typed pub/sub with disposer functions
│   │   ├── ClockController.ts               # 60Hz fixed-dt sim clock + unskippable pacer clock
│   │   ├── InputManager.ts                  # WASD/Mouse cusp-plane ray + Touch twin-pad/vector
│   │   ├── surface/
│   │   │   ├── OralSurfaceGrid.ts           # Float32Array biofilm + Uint8Array flags + actuator ops
│   │   │   └── OralChemistrySim.ts          # Stephan pH curve, HCO3- buffer, F- criticalPh, gum state
│   │   ├── physics/
│   │   │   └── CollisionSystem.ts           # Circle-AABB slide, <1.2u contact block, Tether-Zip
│   │   ├── sim/
│   │   │   └── WorldSession.ts              # Cartridge-driven 60Hz simulation & telemetry state
│   │   ├── scoring/
│   │   │   └── ScoringEngine.ts             # 4-pillar score, Synergy multiplier, Mastery Grades
│   │   ├── persistence/
│   │   │   ├── SaveSystem.ts                # IndexedDB + localStorage mirror + ML2 Base64URL + migrations
│   │   │   └── HabitBank.ts                 # Monotonic stamps, local YYYY-MM-DD caps, Overdrive
│   │   ├── hosts/
│   │   │   └── HostRegistry.ts              # Diverse global/orbital HostDefs + custom player profile
│   │   ├── cameos/
│   │   │   └── CameoRegistry.ts             # IP-clean original/open-license advisor & skin registry
│   │   ├── render/
│   │   │   ├── SceneManager.ts              # Unified WebGLRenderer, Powers-of-Ten CameraRig, QualityGovernor
│   │   │   ├── OrbitalEarthBackdrop.ts      # Lightweight Fresnel Earth globe + city pins + starfield
│   │   │   ├── EnamelBiophysicsMaterial.ts  # Single-pass crystalline hydroxyapatite + smoothstep DataTexture GLSL
│   │   │   ├── CartridgeMeshBuilder.ts      # Procedural anatomical molar arch + baked vertex cavity AO
│   │   │   └── EntityBatchRenderer.ts       # HYDRA-1 probe, filament beam, InstancedMesh cocci/nodes/shadows
│   │   └── audio/
│   │       └── SoundEngine.ts               # Web Audio cosmic-scientific synth SFX & pacer harmonics
│   ├── worlds/                              # PLUGGABLE WORLD CARTRIDGES
│   │   ├── worldRegistry.ts                 # Catalog (World 1 full + Worlds 2-5/Sandbox specs)
│   │   └── plaqueCityCartridge.ts           # Phase 1B World 1 (Toronto / Maya Lin-Okafor) cartridge
│   └── ui/                                  # SCIENTIFIC TELEMETRY & HUB DOM OVERLAYS
│       ├── HubGlobeOverlay.ts               # 3D Earth Host selector, Custom Profile, Upgrades, Sync modal
│       ├── TelemetryHudOverlay.ts           # Live pH / Mineral Flux / Clean %, Surge/Scan, Quality pill
│       ├── BrushAlongOverlay.ts             # 2-Min Arch Overwatch ring, quadrant/surface cues, 20s Floss
│       └── MissionReportOverlay.ts          # 4-Pillar clinical report, Grade, Fluorapatite summary
└── tests/
    ├── oralSurfaceGrid.test.ts              # Shear rates, INTERDENTAL block, F- pH 5.5->4.5 shift, counters
    ├── oralChemistrySim.test.ts             # Stephan 20s pH curve, HCO3- buffering, gum inflammation
    ├── collisionSystem.test.ts              # PROBE_RADIUS alley block, Capillary Tether-Zip, ray-segment
    ├── scoringEngine.test.ts                # 4-pillar bounds, Synergy multiplier, Fluorapatite Gold grade
    ├── saveAndHabit.test.ts                 # v1->v2 migration, 90d zero-loss, daily caps, ML2 roundtrip
    └── worldSession.test.ts                 # Cartridge bake, Commensal reactivation, auto Remin Wave
```

### §6.3 GPU-Smart Scientific Rendering (*Universe Sandbox* Clarity on Modest GPUs)

1. **Macro-to-Micro *Powers of Ten* Camera & Lightweight `OrbitalEarthBackdrop`:**
   - In `HUB` mode, the camera frames a crisp, low-poly **3D Earth in space** (`48x24` UV sphere + analytical 6-line `pow(1.0 - max(dot(N, V), 0.0), 3.2)` Rayleigh blue limb-glow shader + single `Points` starfield + glowing `InstancedMesh` host pins at Toronto, Mexico City, Tokyo, Accra, and an orbiting *Aurora* station icon — `< 4` draw calls, `< 0.2ms` GPU time!).
   - Selecting a mission triggers a `1.4s` smooth exponential *Powers of Ten* camera dive into the 3D anatomical molar landscape (cross-fading visibility cleanly with zero scene reallocation).

2. **Single-Pass Analytical `EnamelBiophysicsMaterial` (`ShaderMaterial` — Zero PBR Overhead, Zero Post-FX Bloom):**
   - **Vertex Shader:** Passes world `(x, z)`, normal, and pre-computed **Vertex Cavity Ambient Occlusion** (shading molar fissures and interproximal valleys at `0` per-pixel cost).
   - **Fragment Shader (Single `256x128` `RGBA8` `DataTexture` Fetch + Procedural Micro-Prism Sheen):**
     - `u = clamp(worldX / uWorldWidth, 0.0, 1.0)`, `v = clamp(worldZ / uWorldDepth, 0.0, 1.0)`, `flipY = false`, `LinearFilter`, `ClampToEdgeWrapping`.
     - **Continuous `0..255` Channels (Bilinear-Safe):**
       - `R`: `biofilmDensity` (`0..255`)
       - `G`: `fluorapatiteSeal` (`0..255` — crystalline cyan-white mineral luster)
       - `B`: `biophysicsTint` (`0..255` — cervical margin density in W1, gingival vascular blush in W2, acid demineralization amber in W3–W4, EPS polymer violet in W5)
       - `A`: `paintableMask` (`0..255`)
     - **Contour Magnification:** `float biofilmMask = smoothstep(0.09, 0.13, tex.r);` produces ultra-sharp organic colony borders from a tiny `128 KB` buffer.
     - **Hydroxyapatite Specular & Disclosing Scan:** Analytical Blinn wet-mineral specular + Fresnel rim + uniform-driven Erythrosine disclosing wave (`uDiscloseOrigin`, `uDiscloseRadius`, `uDiscloseStrength`).
   - **Upload Rule:** Single boolean `grid.textureDirty` uploads `rgbaBuffer` (`dataTexture.needsUpdate = true`) at most once per rendered frame.

3. **Unified Contact Shadows & Hitch-Free 3-Tier `QualityGovernor`:**
   - **No real-time shadow maps on any tier**; uses baked terrain vertex AO + 1 shared `InstancedMesh` contact-shadow batch so switching tiers never recompiles shaders.
   - `renderer.compile(scene, camera)` pre-warms GPU shaders during bootstrap.
   - **Tiers:** `low` (`DPR <= 0.9`, `60` particles, default on coarse pointer/mobile), `medium` (`DPR <= 1.5`, `180` particles, default desktop), `ultra` (`DPR <= 2.0`, `400` particles). Auto mode uses `90`-frame median FPS with hysteresis (`< 42 FPS` down, `> 57 FPS` up, `5.0s` cooldown). Total draw calls `< 25`.
   - **WebGL Resilience:** Fallback retry `{ antialias: false, powerPreference: 'default' }` + graceful DOM diagnostic if WebGL2 is unavailable; `webglcontextrestored` marks `dataTexture` and all `InstancedMesh.instanceMatrix` buffers `needsUpdate = true`.

### §6.4 Canonical Biophysical Simulation Contracts (`src/engine/types.ts` & `OralSurfaceGrid.ts`)

```ts
export interface Vec2 { x: number; z: number; }

export const CELL_SIZE = 0.25;
export const CLEAN_THRESHOLD = 0.10;
export const RINSE_SLURRY_THRESHOLD = 0.35;
export const PROBE_RADIUS = 0.65;                 // Diameter 1.30u > narrow <1.20u contacts
export const CRITICAL_PH_HYDROXYAPATITE = 5.5;    // Unsealed enamel demineralizes below 5.5
export const CRITICAL_PH_FLUORAPATITE = 4.5;      // FLUORIDE_SEALED enamel resists down to 4.5!

export const enum CellFlag {
  NONE            = 0,
  PAINTABLE       = 1 << 0,
  INTERDENTAL     = 1 << 1, // Immune to applyBrush(); cleared by applyFlossSegment()
  FLUORIDE_SEALED = 1 << 2, // Critical pH drops 5.5 -> 4.5; S. mutans re-deposition * 0.40
  MARGIN_FISSURE  = 1 << 3, // 0.65x brush shear (0.65 * 1.45 = 0.9425x with angled_bass_array)
  SULCUS          = 1 << 4, // Gingival sulcus pressure zone
  EPS_ARMOR       = 1 << 5, // Quorum polymer shield until interproximal tether severed
}

export interface BrushApplyParams {
  cx: number;
  cz: number;
  facingRad: number;
  arcRad: number;
  radius: number;
  removalPerSec: number;
  dt: number;
  hasBassUpgrade: boolean;
  localPh: number;          // Checked per-cell against 4.5 (if FLUORIDE_SEALED) else 5.5!
}

export interface ToolApplyResult {
  newlyCleanedCells: number;
  densityRemovedTotal: number;
  acidAbrasionWarnings: number; // Incremented if brushing unbuffered softened enamel (pH < criticalPh)
}
```
- **Authentic Fluorapatite Chemistry Rule in `applyBrush()`:** Each cell compares `p.localPh` against `cellIsFluorideSealed ? 4.5 : 5.5`. If `localPh < cellCriticalPh`, scrubbing that softened cell removes `0` biofilm and increments `acidAbrasionWarnings` — unified across Worlds 1–5 and Sandbox Mode!

### §6.5 Cartridge Geometry, Collision & Capillary Tether-Zip (`CollisionSystem.ts`)
- **`WorldCartridge` Single Source of Truth:** Defines `hostId`, `worldWidth`, `worldDepth`, `districts[]`, `wallBoxes: AABB2D[]`, `interdentalAlleys: InterdentalAlleyDef[]`, `marginBands: Capsule2D[]`, `heightCuspHills: HillDef[]`, `commensalSiteSpawns: Vec2[]`, `sucroseSpawns: Vec2[]`, `biofilmBridges: BridgeDef[]`, `salivaDucts: Vec2[]`, `beaconDropSlots: Vec2[]`, `parTimeSec: number`, `initialChemistry: ChemistryConfig`, and `palette: WorldVisualPalette`.
- **Shared Height Function:** `sampleTerrainHeight(cartridge, x, z): number` drives both terrain vertices and runtime entity Y coordinates.
- **Capillary Tether-Zip:** When Polymer Floss fires within `1.4u` of an `InterdentalAlley` endpoint aimed within `22°` of its channel axis, `applyFlossSegment()` clears the `INTERDENTAL` channel + severs any `BiofilmBridge`, and if the opposite endpoint (`PROBE_RADIUS`) is clear, `probe.zipState` interpolates endpoint-to-endpoint over `0.22s` (cubic ease-in-out) while suppressing wall collision.

### §6.6 Layered Save System & Host Profile Persistence (`SaveSystem.ts`)
- **Dual-Write Storage:** Async `IndexedDB` (`mouthlife_db` / `'saves'` / `'primary'`) + synchronous `localStorage` (`'mouthlife_save_v2'`) + in-memory fallback.
- **Pure Migration (`migrateSave`):** Losslessly upgrades prior schemas, clamps non-negative integers, validates IDs against `HostRegistry` / `UpgradeRegistry`, and prunes `dailySlotsByDate` entries older than 35 days.
- **Portable Sync (`ML2:<base64url>` + `.mouthlife.json`):** UTF-8 `TextEncoder` -> URL-safe Base64 string + downloadable JSON backup file.

```ts
export interface PlayerHostCustomization {
  displayName: string;
  skinToneIndex: number;    // 0..7 inclusive realistic melanin/undertone palette
  homeLocationId: string;   // e.g. 'toronto' | 'mexico_city' | 'tokyo' | 'accra' | 'orbit_aurora'
}

export interface MouthLifeSaveV2 {
  schemaVersion: 2;
  playerProfile: PlayerHostCustomization;
  totalBrushStamps: number;                 // Monotonic >= 0; NEVER decreases
  fluorideIons: number;                     // Spendable currency >= 0
  dailySlotsByDate: Record<string, { fullRewards: number; tips: number }>; // Local YYYY-MM-DD
  pendingSupplyBeacons: number;             // 0..4
  remineralizedOverdriveRuns: number;       // 0..4 (Math.min(4, prev + 2))
  unlockedUpgrades: string[];
  equippedUpgrades: { brush: string | null; floss: string | null; rinse: string | null };
  unlockedCameos: string[];                 // Default ['dr7_peri']
  qualityPreference: 'auto' | 'low' | 'medium' | 'ultra';
  worlds: Record<string, WorldRecord>;      // world_1 .. world_5
  sandboxBest: { bestScore: number; longestEquilibriumSec: number; lastSeed: number };
}
```

---

## §7. Verification & Acceptance Criteria

1. **Core Engine Automated Unit Suite (`npx vitest run` — Built First in Phase 1A):**
   - `oralSurfaceGrid.test.ts`: Verifies `O(1)` clean ratios, sweeping vs stationary shear, `INTERDENTAL` brush immunity, Floss segment clearing, Ion Rinse `<= 0.35` slurry flush + `FLUORIDE_SEALED` conversion, per-cell critical `pH` shift (`5.5` hydroxyapatite vs `4.5` fluorapatite!), and `angled_bass_array` `0.65 * 1.45` margin rate.
   - `oralChemistrySim.test.ts`: Verifies Stephan `20s` pH curve drop/reset on repeated sucrose hits, Salivary `HCO₃⁻` buffering (`pH -> 7.1`), and gingival `gumIrritation` dynamics.
   - `collisionSystem.test.ts`: Verifies `PROBE_RADIUS (0.65u)` blocks `< 1.20u` interproximal contacts while `Capillary Tether-Zip` traverses endpoints in `0.22s`.
   - `scoringEngine.test.ts`: Verifies 4-pillar score math, Synergy multiplier `3.0x` cap & non-destructive decay, and Mastery Grades through `Fluorapatite Gold`.
   - `saveAndHabit.test.ts`: Verifies `v1 -> v2` migration, `playerProfile` diversity settings persistence, zero loss across 90-day gaps, local `YYYY-MM-DD` 2x full + 3x courtesy caps, and `ML2:` UTF-8 Base64URL roundtrip + corrupt-payload rejection.
   - `worldSession.test.ts`: Verifies *Plaque City* cartridge baking, Commensal Site reactivation at `>= 85%` local clean ratio, and automatic zero-cost Fluorapatite Remineralization Wave at `>= 90%` district clean + all district Sites restored.
2. **Static & Production Bundle Gate (`npm run build`):**
   - `tsc --noEmit` exits `0`; Vite production bundle compiles cleanly.
3. **Interactive Browser & GPU Telemetry Smoke Check:**
   - Verify 3D Orbital Earth Hub -> diverse Host selector & Custom Host Profile -> *Powers of Ten* zoom into *Plaque City* -> live `pH` / Mineral Flux telemetry -> all 3 actuators + Erythrosine Disclosing Scan -> District 1/2/3 Fluorapatite Remineralization -> 2-Minute Arch Overwatch Brush-Along; verify `< 25` draw calls and hitch-free `low / medium / ultra` scaling.
