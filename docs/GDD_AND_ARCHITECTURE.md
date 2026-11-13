# MouthLife: The Plaque Dimension — Master Game Design & Engine Architecture Spec

> **Current rules (updated 2026-11-13; these override older numbers further down this document).**
> Both editions (`src/` and `native-apple/`) share them.
> - **Brush-Along:** `2:00` brush, then `0:45` floss, then `1:00` or `0:30` fluoride rinse (optional, age 6+).
> - **Fluoride Ions:** brushing is the main source. Base `50`; `x1.5` with floss or rinse; `x2` with both (`50 / 75 / 100`).
>   Each full reward also gives `+1` Habit Stamp, `+1` Supply Beacon and `+1` Overdrive run. Two full rewards a day, then three `5`-ion tips.
> - **Smaller sources:** treat `+5` (3 an hour), dive `5–25` by score (`score / 400`), Pulp Rescue win `+20`, Smooth Bask `6` an hour up to `72`.
> - **Gold grade:** score `>= 9,000`, at least `95%` clean, and every site restored.
> - **Treat floor:** smoothness never drops below `10`. A timed-out Pulp Rescue lifts smoothness to at least `65` and shields to at least `50`.
> - **World names:** Plaque City, Gumline Crescent, Neon Acid Clock, Fluoride Coast, Slime Dome.
> - **Wording:** on-screen text is written for a 4th-grade reader. `tests/rewardEconomy.test.ts` guards the reward balance and bans jargon in content tables.


## §1. Vision, Tone & Non-Negotiable Invariants

**MouthLife: The Plaque Dimension** is an engine-first, **mobile-portrait-first (and desktop-widescreen-compatible) 3D Progressive Web App (`TypeScript` + `Vite` + `Three.js`)** uniting three experiences into one cohesive biophysical dental adventure:
1. **The Daily Sensory Joy of Clean ("The Smooth Bask"):** A pocket **Tamagotchi + Cozy Idle 3D Tooth Companion** where brushing, flossing, and preventive fluoride-rinsing melt rough matte pellicle into **glassy, mirror-wet pearlescent enamel** with breezy cool-mint interdental airflow ribbons and crystalline chime harmonics — passively crystallizing salivary Fluoride Ions between brushings while shielding your **Enamel -> Dentin -> Pulp** anatomy from the **Dreaded Root Canal**.
2. **Progressive 3D Arcade Across Real Cities, Real Dental History & Space:** Zooming out *Universe Sandbox* / *Powers of Ten* style to a rotating **3D Earth in space**, players visit diverse multi-racial human hosts in real cities anchored to **verified milestones in global dental history** — from **1498 Beijing & 1683 Delft** (birth of the bristle toothbrush & Leeuwenhoek's first microscopic discovery of oral *"animalcules"*) to **New Orleans**, **Chicago/Tokyo**, **Colorado Springs/Accra**, and **Low-Earth Orbit**!
3. **Authentic Oral Biophysics as Vibrant, Tactile Gameplay:** Every actuator and world runs on real oral chemistry (`pH 5.5` hydroxyapatite vs `pH 4.5` fluorapatite remineralization, Stephan sucrose-frequency curves, salivary `HCO₃⁻` buffering, quorum-sensing EPS biofilm) rendered in **colorful, fizzy, luminous 3D graphics** — zero preachy lectures or quiz gates.

### §1.1 Non-Negotiable Invariants
1. **Engine Base First, Worlds as Declarative Cartridges:** Phase 1A builds and unit-tests the reusable **MouthLife Core Engine (`src/engine/`)** first; Phase 1B mounts the Pocket Companion Hub, 2-Minute Sink Brush-Along, `World 1: Plaque City`, and `Pulp Rescue` onto that engine.
2. **Zero Missed-Day Punishment (`Saliva Stasis` & Monotonic Stamps):** Missing a real-world day, week, or month **never** resets Habit Stamps, revokes upgrades, or causes offline decay. Offline elapsed time freezes `enamelShield`, `dentinShield`, and `pulpIntegrity` with **zero further shield loss** while gently settling surface shine to a safe, reversible *Morning Fuzz* floor (`smoothnessIndex >= 45`). Even in active play, reaching `pulpIntegrity === 0` triggers a playable, non-punitive **90s Pulp Rescue Scramble** — never permadeath or save loss.
3. **Mobile-First Ergonomics & Modest-GPU Mastery:** Built first for one-handed `9:19.5` portrait mobile play beside the bathroom sink or on the couch (expanding seamlessly to desktop `WASD` + Mouse), keeping `< 25` draw calls via a single-pass analytical wet-enamel shader, zero shadow-map depth passes, and zero runtime shader recompilations.
4. **IP Cleanliness:** Commercial games such as *Brush Up* (*Budd*, by *GamesThatWork*) are proprietary despite NIH grant funding; zero copyrighted names, designs, or assets from third-party titles are permitted.

### §1.2 Build Status (v1.0 Golden Master — Complete)
- **Core Engine (`src/engine/` + `23` Vitest Suites / `170` Tests):** `OralSurfaceGrid`, `OralChemistrySim`, `CompanionArchSim`, `CompanionTouchSystem`, `CollisionSystem` + `CapillaryTetherZip`, `ScoringEngine`, synchronous `SaveSystem` (`localStorage` + `ML2:` Sync Code + `.mouthlife.json` export/import), `EnamelBiophysicsMaterial` + `OrbitalEarthBackdrop` + 3-tier `QualityGovernor`, procedural `SoundEngine` + `musicTheory`, `hostsAndHistory`, `dentalChart` (all 32 adult teeth in Universal/FDI/Palmer + Spot Quiz + 4-layer cross-section), `charityInfo` (`SmileOnU` 501(c)(3)), and `upgrades`.
- **All 5 Earth-to-Orbit Campaign Worlds + 90s Pulp Rescue + 2-Min Sink Brush-Along + Cosmic Intro:** Fully playable across mobile portrait, mobile landscape, tablet, and desktop widescreen with offline PWA Service Worker (`public/sw.js`) and complete Mac/iOS porting handoff (`docs/MAC_AND_IOS_PORTING_SPEC.md`).

---

## §2. Triple-Harmony Gameplay Loop (Pocket Idle + Sink Ritual + Global Arcade)

### §2.1 Loop A — Pocket Tamagotchi & Cozy Idle "Smooth Bask" (`CompanionArchSim.ts`)
- **4 Anatomical Vitality Layers:**
  1. **`smoothnessIndex` (`0..100`):** `0–45` = matte pellicle fuzz; `85–100` = **Glassy-Smooth Fresh-Mint Bask** (mirror-wet pearlescent enamel, cyan interdental breeze ribbons, and glass-chime harmonics when dragging to inspect your 3D arch).
  2. **`enamelShield` (`0..100`) -> `dentinShield` (`0..100`) -> `pulpIntegrity` (`0..100`):** Anatomical cavity-depth shield protecting the nerve from the *Dreaded Root Canal*.
- **Deterministic Offline Curve & Idle Ion Reservoir (`lastEvaluatedEpochMs`):**
  - Let `elapsedHours = Math.max(0, (nowEpochMs - state.lastEvaluatedEpochMs) / 3_600_000)`.
  - **Two-Slope Smoothness Cooling:** While `smoothnessIndex > 85`, it cools at `-1.25 / hr` (taking a full `12.0h` to glide from `100 -> 85`). Once `<= 85` (hours `12..18`), it cools at `-6.67 / hr` down to a hard floor of `45.0` (*Saliva Stasis Morning Fuzz*).
  - **Idle Salivary Remineralization (`+6 Ions/hr` up to `72` cap):** Every hour spent with `smoothnessIndex >= 85` accrues `+6` Fluoride Ions into `unclaimedIdleIons` (`Math.min(72, unclaimedIdleIons + Math.floor(baskHours * 6))`), so a freshly cleaned `100%` arch reliably banks the full `72 Ions` over `12h` overnight rest!
  - **Offline Shield Freeze:** `reconcileOfflineElapsed()` **never** modifies `enamelShield`, `dentinShield`, or `pulpIntegrity` (zero offline shield loss).
- **Regional Meal Feeding & Active Root-Canal Prevention:**
  - Tapping **"Enjoy Regional Treat"** feeds the active Host a signature item (e.g., *Toronto Maple Espresso*, *New Orleans Beignet*, *Tokyo Melon Soda*, *Accra Hibiscus Sobolo*, *Orbital Berry Pack*), granting `+20` Fluoride Ions (up to `3` rewarded treats per rolling hour; `0` Ions on rapid spam) and unlocking regional lore.
  - **Deterministic Treat Acid Step:** Each treat sets `prevSmooth = state.smoothnessIndex`, updates `smoothnessIndex = Math.max(0, prevSmooth - 35)`, and if `smoothnessIndex < 50`, applies `45` **Acid Load Points** cascading sequentially: drains `enamelShield` first, spills any remainder into `dentinShield`, and spills any remaining remainder into `pulpIntegrity` (so ~6 uncleaned treats in a row predictably breach Enamel -> Dentin -> `pulpIntegrity === 0`).
  - **Non-Punitive `90s Pulp Rescue Scramble` (`AppMode = 'PULP_RESCUE'`):** Triggered immediately when `pulpIntegrity === 0`. Loads the compact `32u x 32u` single-molar `pulpRescueCartridge` with a `90s` countdown:
    - **Win (`>= 85%` clean within `90s`):** Saves the tooth from a Root Canal! Restores `smoothnessIndex = 100`, all three shields to `100`, and awards `+20` Rescue Fluoride Ions.
    - **Timeout (`< 85%` at `90s`):** Zero permadeath or lost progress — advisor `DR-7 PERI` applies an **Emergency Calcium-Hydroxide Dressing**, stabilizing `enamelShield = 50`, `dentinShield = 50`, `pulpIntegrity = 50`, `smoothnessIndex = 50` (`0` bonus Ions) and returning cleanly to Hub.

### §2.2 Loop B — 2-Minute "Brush-Along" Sink Ritual
1. **Arch Overwatch & WakeLock:** Smoothly elevates the shared 3D camera over the dental arch and calls `navigator.wakeLock?.request('screen').catch(() => {})`.
2. **Unskippable `4 x 30s` Quadrant Pacer (`120s`):** Highlights *Upper Right -> Upper Left -> Lower Left -> Lower Right* (*Buccal -> Occlusal -> Lingual* every `10s`) with sparkling foam visuals and harmonic synth chimes. Both `simClock` and `pacerClock` pause when `document.visibilityState === 'hidden'`.
3. **Optional `20s` Interdental Floss Pacer:** Animated C-contour filament guide awarding `+25` bonus Fluoride Ions.
4. **Daily Rewards & Healthy Caps:**
   - **First 2 Completions per Local Calendar Day (`YYYY-MM-DD`):** Restore `smoothnessIndex = 100` and all Companion shields to `100`, award `+50` **Fluoride Ions**, `+1` monotonic **Habit Stamp**, `4` **Ion Relay Beacons** (`pendingSupplyBeacons = Math.min(4, prev + 4)`), and **Fluorapatite Overdrive** (`remineralizedOverdriveRuns = Math.min(4, prev + 2)`).
   - **Courtesy Cap (3rd–5th Same-Day Runs):** Restores Companion `100%` Smooth Bask and grants `+5` Ions (up to `3` tips/day; `0` Ions beyond `5` daily runs).

### §2.3 Loop C — Active 3D Biophysical Arcade Missions
Players pilot **Micro-Probe `HYDRA-1`** across vibrant 3D tooth landscapes (`55°` camera with automatic portrait FOV widening on mobile):
- **Cleanliness Metric (`CLEAN_THRESHOLD = 0.10`):** A `PAINTABLE` cell (`0.25u x 0.25u`) is **clean** at `density <= 0.10`, snapping visually from matte pellicle to glossy pearlescent hydroxyapatite. Cleanliness % = `cleanPaintableCells / totalPaintableCells * 100` (`O(1)` incremental per-district counters).
- **Commensal Sites & Soft-Lock-Proof District Sealing:** Clearing `>= 85%` of `PAINTABLE` cells within `2.0u` of a smothered **Commensal *S. sanguinis* Site** reactivates it (`+30` Surge + alkaline mist). Reaching `>= 90%` district cleanliness **and** reactivating all district Sites triggers an automatic zero-cost **Fluorapatite Remineralization Wave** — clearing the remaining `<= 10%` specks, sealing the district (`FLUORIDE_SEALED`), restoring Companion shields to `100%` on world clear, and opening the next anatomical gate.

---

## §3. Actuators, Surge Economy & Upgrades

*(All runtime constants live exclusively in `src/config/gameConfig.ts`.)*

### §3.1 Core Actuators & Diagnostic Scan

| Actuator / Scan | Mobile Portrait Thumb Deck | Desktop Input | Biophysical Behavior | Dental Principle |
|-----------------|----------------------------|---------------|----------------------|------------------|
| **1. Sonic Bristle Array** | Drag lower-center **Thumb Pad** to move + auto-sweep Bristles | `WASD`/Arrows + `Left Click` or `Space` | Forward shear arc (`radius = 1.6u`, `arc = 95°`). Moving (`speed >= 1.5u/s`) shears `2.2x` faster (`0.95/s` vs `0.43/s`). **Skips `INTERDENTAL` cells**; `PROBE_RADIUS = 0.65u` (`1.30u` diameter) physically blocks `< 1.20u` alleys. | Sweeping bristles disrupt broad plaque, while physical bristles cannot enter tight interproximal contacts. |
| **2. Polymer Floss Filament** | Drag & release **Floss Vector Ring** (tap auto-aims nearest alley/crystal `< 4.0u`) | `Right Click` or `E` aimed at plane `y = probe.y` | Extends `3.8u` filament (`halfWidth = 0.14u`, `0.35s` cd). Clears `INTERDENTAL` cells (`-> 0.0`), severs **EPS Biofilm Bridges**, shatters **Sucrose Crystals**, and triggers a `0.22s` **Capillary Tether-Zip** if fired within `22°` of an open alley axis from `< 1.4u`. | Only taut interdental filaments clear contact crevices and sever interproximal glucan bridges. |
| **3. Fluoride-Bicarb Ion Rinse** | Pulsing **`Mint Surge`** thumb button (`surgeMeter >= 100`) | `Q` or `Shift` at `surgeMeter >= 100` | Consumes `100` `surgeMeter` to expand a `9.0u` **Turquoise Fluoride Wave** (`1.0s`). Flushes *disrupted* slurry (`density <= 0.35 -> 0.0`), buffers acid pools (`pH -> 7.0`), stuns *S. mutans* (`3.0s`), and sets `FLUORIDE_SEALED` (`criticalPh: 5.5 -> 4.5`, `-60%` re-soiling) on clean cells (`<= 0.10`). **Dense intact biofilm (`> 0.35`) loses only `0.04` density.** | Preventive mouthwash flushes disrupted debris, buffers pH, and forms fluorapatite — only *after* mechanical disruption. |
| **4. Erythrosine Bio-Scan** | **`Dye Scan`** pill button (`6.0s` cd) | `Tab` or `R` (`6.0s` cd) | `18.0u` **Two-Tone Magenta Wave** (`3.5s`). Tints dirty cells (`> 0.10`) rose-pink (`0.11–0.45` young pellicle) to electric violet (`> 0.45` mature margin/fissure matrix). | Clinical disclosing dyes differentially bind young vs mature plaque matrices. |

### §3.2 Surge Meter Economy (`surgeMeter: 0..100`)
- Starts at `0` (`100` when `remineralizedOverdriveRuns > 0`) and charges via `gameConfig.ts` constants:
  - `SURGE_PER_CLEANED_CELL = 0.12` per `PAINTABLE` cell newly crossed `<= 0.10` (tuned so cleaning ~500–600 cells + 2 targets yields ~1 full Surge per district)
  - `SURGE_PER_FLOSS_TARGET = 15` per `BiofilmBridge` severed or `SucroseCrystal` fractured with Floss (`* 1.25 = 18.75` when `ptfe_ribbon_filament` is equipped)
  - `SURGE_PER_SITE_RESTORED = 30` per Commensal Site reactivated
  - `SURGE_PER_BEACON = 50` per collected Brush-Along **Ion Relay Beacon**

### §3.3 Actuator Upgrade Registry (`src/config/upgrades.ts`)
- **Unlock Trigger Policy:** Crossing a Stamp or World-Clear threshold automatically appends the upgrade ID to `save.unlockedUpgrades` inside `SaveSystem` (emitting `'upgrade:unlocked'` with `costPaid: 0`); clicking *"Unlock with Ions"* in `CompanionHubOverlay` checks `!save.unlockedUpgrades.includes(id) && save.fluorideIons >= ionCost`, deducts `ionCost`, appends `id`, and emits `'upgrade:unlocked'`. Once in `unlockedUpgrades`, UI renders `OWNED / EQUIP` so double-spend is impossible.
- **`angled_bass_array` *(3 Stamps, World 1 Clear, or 100 Ions)*:** Widens Bristle arc `95° -> 130°` and boosts `MARGIN_FISSURE` shear `+45%` (`0.65 * 1.45 = 0.9425x` of open-enamel rate) + `-35%` sulcus irritation.
- **`hydro_sonic_pulse` *(6 Stamps, World 2 Clear, or 250 Ions)*:** Extends acoustic Bristle reach `+16%` (`115°` arc, `+30%` fissure shear across all worlds) and cuts gingival `gumIrritation` buildup by `50%`.
- **`ptfe_ribbon_filament` *(10 Stamps, World 3 Clear, or 400 Ions)*:** Widens Floss `halfWidth` `0.16u -> 0.24u` (`+50%`) and multiplies `SURGE_PER_FLOSS_TARGET` by `1.25x`.
- **`bicarb_buffer_jet` *(15 Stamps, World 4 Clear, or 600 Ions)*:** Ion Rinse buffers nearby enamel `localPh` to `7.2`.

---

## §4. Real Global Cities, Authentic Dental History & 5-World Campaign

| World ID | Modern Host & City (`Lat, Lon`) | Real Dental History Milestone Honored | `bChannelMode` & Biophysical Mechanics |
|----------|---------------------------------|---------------------------------------|----------------------------------------|
| **`world_1`** *(Built & Playable)* | **Maya Lin-Okafor** — Architect, **Toronto** (`43.65°N, 79.38°W`) | **1498 Beijing & 1683 Delft:** Ming Dynasty invention of the bristle toothbrush (1498) + **Antonie van Leeuwenhoek** (1683, Delft) discovering living oral *"animalcules"* and observing intact plaque shielded them from vinegar! | `'marginDensity'`. **3 Zones** (`64u x 32u`): *Incisor Terrace* (`0.50` pellicle + `0.85` `MARGIN_FISSURE`), *Premolar Contact Alleys* (`0.90u` `INTERDENTAL` gaps + `BiofilmBridge`s), *First Molar Basin* (cruciform fissure + `SucroseCrystal`s + *S. mutans*). **10 Commensal Sites** + **3 Salivary Springs**. |
| **`world_2`** *(Built & Playable)* | **Marcus & Celine Beaumont** — Luthiers, **New Orleans** (`29.95°N, 90.07°W`) | **1819 & 1948 New Orleans:** **Levi Spear Parmly** pioneering waxed silk floss (1819) + **Dr. Charles C. Bass** (Tulane Univ., 1948) developing the **45° Sulcus Brushing & Unwaxed Floss Method**! | `'gumIrritation'`. `SULCUS` flag + `gumIrritation` (`0..1` coral blush); sweeping 45° strokes & C-curved floss keep tissue calm. |
| **`world_3`** *(Built & Playable)* | **Kenji Sato** — Synth Designer, **Chicago / Tokyo** (`41.88°N, 87.63°W` / `35.66°N, 139.70°E`) | **1940 Chicago:** **Dr. Robert M. Stephan** (Univ. of Illinois) plotting the **Stephan pH Curve**, proving frequent sugar hits trap enamel below `pH 5.5` for 20–40 min per hit! | `'localPh'`. `stephanTimerSec` (`20.0s` acid window) + `oralPh` (`7.0 -> 4.8`); intercepting sugar waves & `FLUORIDE_SEALED` (`criticalPh = 4.5`) prevent demineralization. |
| **`world_4`** *(Built & Playable)* | **Dr. Amara Mensah** — Runner, **Colorado Springs / Accra** (`38.83°N, 104.82°W` / `5.60°N, 0.19°W`) | **1901–1945 Fluoride Discovery & Ancient *Miswak*:** **McKay, Churchill & Dean** uncovering natural spring **fluorapatite** remineralization + African/Middle Eastern ***Salvadora persica* (Miswak)** mineral & saliva care! | `'localPh'`. Spatial acid zones (`pH 4.2..7.4`); scrubbing softened cells (`pH < criticalPh`) deals `0` removal and triggers abrasion warnings until **Salivary `HCO₃⁻` Springs** buffer `pH >= 6.5`! |
| **`world_5`** *(Built & Playable)* | **Specialist Tariq Al-Mansoor** — **Houston / Station *Aurora* Orbit** (`29.55°N, 95.09°W` -> `408 km` LEO) | **1973 NASA *Skylab* & 1978 Costerton Biofilms:** NASA Johnson Space Center *Skylab* microgravity oral ecology studies + **J.W. Costerton** defining quorum-sensing **EPS polymer biofilms**! | `'epsArmor'`. 3-phase *Slime Dome* boss: sever 4 Floss tethers -> shatter Sucrose Conduits & fire Bicarb Springs -> shear core `< 0.35` -> **Mint-Fluoride Ion Surge**! |

---

## §5. Scoring & Mastery Grades (`ScoringEngine.ts`)

Evaluated out of `10,000` baseline (`80%` thoroughness & technique, `20%` par-time flow):
1. **Enamel Smoothness Restoration (`0..5,000`):** `Math.round(worldCleanRatio * 5000)`.
2. **Biophysical Technique (`0..2,500`):** Moving shear (`+15` per `10` cells), Floss slices (`+150` per bridge/crystal), Fluorapatite conversions (`+10` per sealed cell), tissue/pH preservation bonus (capped at `2,500`).
3. **Commensal & Ecology Recovery (`0..1,500`):** `+120` per Commensal Site restored + `+50` per Sucrose hazard cleared (capped at `1,500`).
4. **Par-Time Flow (`250..1,000`):** `1,000` when `elapsedSec <= parTimeSec` (`270s` in World 1), tapering linearly to a hard floor of `250` for all `elapsedSec >= 2 * parTimeSec`.
5. **Synergy Multiplier (`1.0x..3.0x`):** Increments `+0.25x` whenever a qualifying actuator action uses a *different* actuator type (`'brush' | 'floss' | 'rinse'`) than the previous qualifying action; decays `-0.15x/s` after `4.0s` idle without subtracting banked points.
- **Grades:** `C` (`< 5,500`), `B` (`5,500–7,199`), `A` (`7,200–8,499`), `S` (`8,500+`), **`Fluorapatite Gold`** (`>= 9,000` + `>= 95%` clean + `100%` Sites Restored).

---

## §6. Technical Architecture Specification (`TypeScript` + `Vite` + `Three.js`)

### §6.1 Stack, PWA & Compiler Config
- **Dependencies:** `three@^0.174.0`, `@types/three@^0.174.0`, `vite@^6.2.0`, `typescript@^5.7.0`, `vitest@^3.0.0`.
- **Mobile PWA (`public/manifest.webmanifest` + `index.html`):** Standalone portrait-friendly installable app with `viewport-fit=cover` and CSS `env(safe-area-inset-*)` thumb padding.
- **`tsconfig.json`:** `"strict": true`, `"noUncheckedIndexedAccess": false`, `"target": "ES2022"`, `"moduleResolution": "bundler"`. (`OralSurfaceGrid` guards all cell reads via `if (gx < 0 || gx >= gridW || gz < 0 || gz >= gridH) continue;` before computing `idx = gz * gridW + gx`.)

### §6.2 Engine-First Directory Layout
```text
d:\MouthLife\
├── index.html
├── public/
│   └── manifest.webmanifest               # Installable Mobile Portrait PWA manifest
├── package.json
├── tsconfig.json
├── vite.config.ts
├── docs/
│   └── GDD_AND_ARCHITECTURE.md
├── src/
│   ├── main.ts                            # 7-step deterministic bootstrap & AppMode FSM
│   ├── config/
│   │   ├── gameConfig.ts                  # SOLE AUTHORITATIVE export of all runtime constants
│   │   ├── upgrades.ts                    # UpgradeRegistry catalog
│   │   └── hostsAndHistory.ts             # Multi-racial hosts, treats, skin tones & History Notes
│   ├── engine/                            # REUSABLE CORE ENGINE (Phase 1A)
│   │   ├── types.ts                       # Pure TypeScript interfaces/types/enums ONLY
│   │   ├── EventBus.ts                    # Typed AppEventMap pub/sub with disposer bag
│   │   ├── ClockController.ts             # 60Hz fixed-dt sim clock + visibility-safe pacer clock
│   │   ├── InputManager.ts                # Mobile Thumb Deck/Floss Ring + Desktop WASD/Mouse
│   │   ├── companion/
│   │   │   └── CompanionArchSim.ts        # Two-slope Smooth Bask, Idle Ions, Treats, Saliva Stasis
│   │   ├── surface/
│   │   │   ├── OralSurfaceGrid.ts         # Float32Array biofilm + Uint8Array flags + actuator ops
│   │   │   └── OralChemistrySim.ts        # Spatial/global pH, Stephan curve, HCO3-, gumIrritation
│   │   ├── physics/
│   │   │   └── CollisionSystem.ts         # Alley AABB builder, circle-AABB slide, Tether-Zip
│   │   ├── sim/
│   │   │   └── WorldSession.ts            # Cartridge-driven 60Hz arcade & 90s Pulp-Rescue loop
│   │   ├── scoring/
│   │   │   └── ScoringEngine.ts           # 4-pillar score, Synergy multiplier, Mastery Grades
│   │   ├── persistence/
│   │   │   ├── SaveSystem.ts              # Sync localStorage + saveRevision + ML2 Base64URL + JSON
│   │   │   └── HabitBank.ts               # Monotonic stamps, local YYYY-MM-DD caps, Overdrive
│   │   ├── render/
│   │   │   ├── SceneManager.ts            # WebGLRenderer, Portrait/Desktop CameraRig, QualityGovernor
│   │   │   ├── OrbitalEarthBackdrop.ts    # Fresnel 3D Earth globe + historical city pins + starfield
│   │   │   ├── EnamelBiophysicsMaterial.ts# Glassy wet-enamel + smoothstep DataTexture GLSL
│   │   │   ├── CartridgeMeshBuilder.ts    # Procedural 3D tooth arch + baked vertex cavity AO
│   │   │   └── EntityBatchRenderer.ts     # HYDRA-1, mint breeze ribbons, ULTRA-allocated InstancedMeshes
│   │   └── audio/
│   │       └── SoundEngine.ts             # Web Audio scrub-to-chime synth, mint breeze & pacer chords
│   ├── worlds/
│   │   ├── worldRegistry.ts               # Cartridge catalog (World 1 + Pulp Rescue + Worlds 2-5 specs)
│   │   ├── plaqueCityCartridge.ts         # World 1 (Toronto / 1498 Beijing & 1683 Delft, 64u x 32u)
│   │   └── pulpRescueCartridge.ts         # Emergency Molar Pulp Rescue (32u x 32u, 90s scramble)
│   └── ui/                                # OverlayView-implementing responsive mobile/desktop UI
│       ├── CompanionHubOverlay.ts         # Pocket Arch Bask, Profile Drawer, Treats, Globe, Upgrades, Sync
│       ├── TelemetryHudOverlay.ts         # Compact top bar + Mobile Bottom Thumb Deck / Desktop hints
│       ├── BrushAlongOverlay.ts           # 2-Min Arch Overwatch pacer + 20s Floss guide
│       └── MissionReportOverlay.ts        # Smoothness Bask orbit, 4-Pillar Grade, History Note unlock
└── tests/
    ├── oralSurfaceGrid.test.ts            # Bounds safety, shear rates, INTERDENTAL block, spatial pH 5.5->4.5
    ├── oralChemistrySim.test.ts           # Stephan 20s curve, HCO3- buffering, gum inflammation
    ├── companionArch.test.ts              # Two-slope 72-Ion Bask, Treat cascade, Pulp Rescue win/timeout, Stasis
    ├── collisionSystem.test.ts            # Derived alley AABBs, PROBE_RADIUS block, Tether-Zip
    ├── scoringEngine.test.ts              # 4-pillar math, 250 par floor, Synergy alternation, Gold grade
    ├── saveAndHabit.test.ts               # V1 fixture migration, ID filtering, saveRevision, ML2 codec
    └── worldSession.test.ts               # Cartridge bake, Surge rates, Commensal restore, auto Remin Wave
```

### §6.3 GPU-Smart Vibrant Rendering & Bounded *Powers of Ten* Rig
1. **Bounded Theatrical Frustum & Portrait-Adaptive FOV (`SceneManager.ts`):**
   - Single camera (`near = 0.5, far = 320`): `earthGroup` (`radius = 18u`) at `(32, 110, 16)` above `archGroup` (`[0..64] x [0..4.5] x [0..32]`). During the `1.4s` zoom (`isTransitioning === true`), `InputManager` gates gameplay actions and swaps `earthGroup.visible <-> archGroup.visible` at `t = 0.55`.
   - **Portrait FOV Widening:** When `aspect < 1.0`, vertical FOV widens via `2 * atan(tan(baseFovRad / 2) / clamp(aspect, 0.52, 1.0))` so portrait phones frame the full zone cleanly above the bottom Thumb Deck.
2. **Vibrant Glassy-Smooth `EnamelBiophysicsMaterial` (`ShaderMaterial`):**
   - `texW = Math.round(cartridge.worldWidth / CELL_SIZE)`, `texH = Math.round(cartridge.worldDepth / CELL_SIZE)`, `RGBAFormat`, `UnsignedByteType`, `LinearFilter`, `ClampToEdgeWrapping`, `flipY = false`.
   - **Continuous `0..255` Channels:** `R = biofilmDensity`, `G = fluorapatiteSeal`, `B = biophysicsTint` (selected by `int uBChannelMode`), `A = paintableMask`.
   - **Rough-to-Glassy Shader Transition:** `float biofilmMask = smoothstep(0.09, 0.13, tex.r);` melts matte lime-yellow pellicle into high-gloss wet pearlescent enamel (`pow(max(dot(N, H), 0.0), 36.0) + mintFresnel`).
3. **Zero-Recompile `QualityGovernor` & `MAX_PARTICLES_ULTRA` Pre-Allocation:**
   - All `InstancedMesh` pools allocate once at `MAX_PARTICLES_ULTRA (400)`. Tier switches (`low: 60`, `medium: 180`, `ultra: 400`, hysteresis `< 42 FPS` down / `> 57 FPS` up, `5.0s` cooldown) adjust **only** `renderer.setPixelRatio()` and `mesh.count` — zero shadow maps, zero shader recompiles.
   - `SceneManager` allocates all materials, uniforms, and initial `DataTexture` before calling `this.prewarmShaders()` (`renderer.compile(scene, camera)`) at boot and directly inside its `webglcontextrestored` listener prior to emitting `'webgl:restored'`.

### §6.4 Bootstrap Sequence & Typed `AppEventMap`

#### 1. Deterministic 7-Step Bootstrap (`main.ts`)
1. Import static registries (`gameConfig`, `upgrades`, `hostsAndHistory`, `worldRegistry`).
2. `const save = SaveSystem.load()` — synchronous `localStorage` read + `migrateSave()` (new saves seed `playerProfile: { displayName: 'Explorer', skinToneIndex: 3, homeCityId: 'toronto' }`, customizable anytime via `CompanionHubOverlay`'s inline Profile Drawer).
3. `CompanionArchSim.reconcileOfflineElapsed(save.companion, Date.now())` + `SaveSystem.save(save)`.
4. `SceneManager.init(canvas, save.qualityPreference, urlQueryOverrides)`.
5. `WorldSession.loadCartridge(plaqueCityCartridge)` + `EntityBatchRenderer.initUltraPools()` + `SceneManager.prewarmShaders()`.
6. `SoundEngine.bindFirstGestureUnlock()` + mount `CompanionHubOverlay` (`AppMode = 'HUB'`).
7. `ClockController.start()` + bind `window.addEventListener('storage', ...)` for cross-tab `saveRevision` reconciliation.

#### 2. Canonical `AppEventMap` (`src/engine/EventBus.ts`)
Every overlay implements `interface OverlayView { mount(root: HTMLElement): void; dispose(): void; }`; `main.ts` invokes `activeOverlay.dispose()` before mounting the next overlay.

| Event Name | Publisher | Payload Shape | Subscribers |
|------------|-----------|---------------|-------------|
| `'mode:changed'` | `main.ts` | `{ from: AppMode; to: AppMode }` | `WorldSession` (pauses tick loop when leaving `'ARCADE' \| 'PULP_RESCUE'`), `SceneManager`, `InputManager`, `SoundEngine` |
| `'actuator:scrub'` | `WorldSession` | `{ cleanRatio: number; newlyCleaned: number; surgeDelta: number; acidWarn: boolean }` | `SoundEngine`, `EntityBatchRenderer`, `TelemetryHudOverlay` |
| `'floss:sliced'` | `WorldSession` | `{ from: Vec2; to: Vec2; targetsHit: number; surgeDelta: number; zipped: boolean }` | `ScoringEngine`, `SoundEngine`, `EntityBatchRenderer` |
| `'rinse:surged'` | `WorldSession` | `{ origin: Vec2; cellsSealed: number }` | `ScoringEngine`, `SoundEngine`, `EntityBatchRenderer` |
| `'site:restored'` | `WorldSession` | `{ siteId: string; pos: Vec2; districtIdx: number; surgeDelta: number }` | `ScoringEngine`, `SoundEngine`, `EntityBatchRenderer` |
| `'district:sealed'` | `WorldSession` | `{ districtIdx: number; worldCleanRatio: number }` | `SoundEngine`, `EntityBatchRenderer`, `TelemetryHudOverlay` |
| `'beacon:collected'` | `WorldSession` | `{ beaconIndex: number; pos: Vec2; surgeDelta: number }` | `SaveSystem` (`pendingSupplyBeacons = Math.max(0, prev - 1)`), `SoundEngine` |
| `'mission:complete'` | `WorldSession` | `{ mode: 'ARCADE' \| 'PULP_RESCUE'; worldId: string; won: boolean; breakdown: ScoreBreakdown }` | `SaveSystem` (awards Ions/Stamp, decrements `remineralizedOverdriveRuns` on `'ARCADE'`, checks auto-unlocks), `CompanionArchSim`, `main.ts` |
| `'upgrade:unlocked'` | `SaveSystem` / `CompanionHubOverlay` | `{ upgradeId: string; via: 'stamps' \| 'world_clear' \| 'ions'; costPaid: number }` | `SoundEngine`, `CompanionHubOverlay`, `TelemetryHudOverlay` |
| `'companion:updated'` | `CompanionArchSim` | `{ state: CompanionState }` | `SaveSystem`, `CompanionHubOverlay`, `SceneManager` |
| `'pacer:tick'` | `ClockController` | `{ elapsedSec: number; quadrantIdx: number; surfaceIdx: number }` | `BrushAlongOverlay`, `SoundEngine`, `SceneManager` |
| `'quality:changed'` | `SceneManager` | `{ tier: QualityTier; fps: number }` | `EntityBatchRenderer`, `TelemetryHudOverlay` |
| `'webgl:restored'` | `SceneManager` | `{}` | `WorldSession` (`grid.textureDirty = true`), `EntityBatchRenderer` (re-flags instance matrices; `SceneManager` runs `this.prewarmShaders()` internally first) |

### §6.5 Canonical TypeScript Interfaces (`src/engine/types.ts`)

```ts
export type AppMode = 'HUB' | 'ARCADE' | 'PULP_RESCUE' | 'BRUSH_ALONG' | 'REPORT';
export type QualityTier = 'low' | 'medium' | 'ultra';
export type BChannelMode = 'marginDensity' | 'gumIrritation' | 'localPh' | 'epsArmor';

export interface Vec2 { x: number; z: number; }
export interface AABB2D { minX: number; minZ: number; maxX: number; maxZ: number; }
export interface Capsule2D { a: Vec2; b: Vec2; radius: number; initialDensity: number; }
export interface HillDef { cx: number; cz: number; radius: number; height: number; }

export const enum CellFlag {
  NONE            = 0,
  PAINTABLE       = 1 << 0,
  INTERDENTAL     = 1 << 1,
  FLUORIDE_SEALED = 1 << 2,
  MARGIN_FISSURE  = 1 << 3,
  SULCUS          = 1 << 4,
  EPS_ARMOR       = 1 << 5,
}

export interface InterdentalAlleyDef {
  id: string;
  endpointA: Vec2;
  endpointB: Vec2;
  width: number;            // e.g. 0.90 (< 2 * PROBE_RADIUS = 1.30)
  wallThickness: number;    // Used by CollisionSystem.buildAlleyWalls()
  bridgeId: string | null;
}

export interface BridgeDef { id: string; a: Vec2; b: Vec2; intact: boolean; }
export interface DistrictDef { id: string; name: string; bounds: AABB2D; }

export interface WorldVisualPalette {
  enamelBaseHex: number;
  pellicleSlimeHex: number;
  matureBiofilmHex: number;
  gingivaHex: number;
  skyTopHex: number;
  skyHorizonHex: number;
}

export interface WorldCartridge {
  id: string;
  title: string;
  hostId: string;
  historyNoteIds: string[];
  worldWidth: number;
  worldDepth: number;
  bChannelMode: BChannelMode;
  parTimeSec: number;
  basePellicleDensity: number;
  baselinePh: number;
  probeSpawn: Vec2;
  districts: DistrictDef[];
  playableMaskBoxes: AABB2D[];
  wallBoxes: AABB2D[];
  interdentalAlleys: InterdentalAlleyDef[]; // Sole source for BOTH alley wall AABBs & INTERDENTAL cells
  marginBands: Capsule2D[];
  heightCuspHills: HillDef[];
  commensalSiteSpawns: Array<{ id: string; pos: Vec2; districtIdx: number }>;
  sucroseSpawns: Array<{ id: string; pos: Vec2; districtIdx: number }>;
  biofilmBridges: BridgeDef[];
  salivaSprings: Vec2[];
  beaconDropSlots: Vec2[];
  palette: WorldVisualPalette;
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
}

export interface ToolApplyResult {
  newlyCleanedCells: number;
  densityRemovedTotal: number;
  acidAbrasionWarnings: number;
}
```

### §6.6 Save Schema, Migration Fixture & UTF-8 Base64URL Codec (`SaveSystem.ts`)

```ts
export interface CompanionState {
  smoothnessIndex: number;          // 0..100
  enamelShield: number;             // 0..100
  dentinShield: number;             // 0..100
  pulpIntegrity: number;            // 0..100
  unclaimedIdleIons: number;        // 0..72
  recentTreatTimestampsMs: number[];// Rolling 1h window (<= 3 rewarded treats/hr)
  lastEvaluatedEpochMs: number;
}

export interface WorldRecord {
  unlocked: boolean;
  completed: boolean;
  timesCleared: number;
  bestScore: number;
  bestGrade: 'NONE' | 'C' | 'B' | 'A' | 'S' | 'FLUORAPATITE_GOLD';
  bestCleanlinessPct: number;
  sitesRestoredMax: number;
}

export interface MouthLifeSaveV2 {
  schemaVersion: 2;
  saveRevision: number;
  lastSavedEpochMs: number;
  playerProfile: { displayName: string; skinToneIndex: number; homeCityId: string };
  companion: CompanionState;
  totalBrushStamps: number;
  fluorideIons: number;
  dailySlotsByDate: Record<string, { fullRewards: number; tips: number }>;
  pendingSupplyBeacons: number;
  remineralizedOverdriveRuns: number;
  unlockedUpgrades: string[];
  equippedUpgrades: { brush: string | null; floss: string | null; rinse: string | null };
  unlockedHistoryNotes: string[];
  qualityPreference: 'auto' | QualityTier;
  worlds: Record<string, WorldRecord>;
}
```

- **Synthetic Legacy `MouthLifeSaveV1` Migration Rule (`migrateSave`):** Because `src/` is greenfield, `migrateSave(raw)` accepts both `schemaVersion: 2` payloads and legacy `schemaVersion: 1` synthetic fixtures (`{ schemaVersion: 1, totalBrushStamps, fluorideCrystals, dailySlotsByDate: Record<string, number>, remineralizedBuffRunsRemaining, unlockedUpgrades, equippedBrushUpgrade, worldProgress }`, matching the initial v0 design doc), mapping `fluorideCrystals -> fluorideIons`, `remineralizedBuffRunsRemaining -> remineralizedOverdriveRuns`, `equippedBrushUpgrade -> equippedUpgrades.brush`, converting numeric `dailySlotsByDate[d]` to `{ fullRewards: Math.min(2, n), tips: 0 }`, and hydrating missing `companion` (`smoothnessIndex: 90`, all shields `100`) and `playerProfile` defaults.
- **Registry ID Sanitization:** `migrateSave()` filters `unlockedUpgrades`, `equippedUpgrades.*`, `unlockedHistoryNotes`, and `playerProfile.homeCityId` against active static registry keys (`upgrades.ts` & `hostsAndHistory.ts`), safely discarding unknown IDs without throwing.
- **Exact `ML2:` UTF-8 Base64URL Codec (Zero Experimental APIs):**
  - **Encode:** `const bytes = new TextEncoder().encode(JSON.stringify(save)); let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]); return 'ML2:' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');`
  - **Decode:** Strip `'ML2:'`, replace `'-' -> '+'`, `'_' -> '/'`, pad `'='` to `len % 4 === 0`, run `atob()`, copy char codes to `Uint8Array`, decode via `new TextDecoder('utf-8', { fatal: true }).decode(bytes)`, `JSON.parse()`, and pass through `migrateSave()`.

---

## §7. Verification, Acceptance Criteria & Verify-at-Build Checklist

### §7.1 Automated Engine Unit Suite (`npx vitest run` — Phase 1A Gate)
- `oralSurfaceGrid.test.ts`: Bounds-guard safety, `O(1)` clean counters, sweeping vs stationary shear, single-source `INTERDENTAL` brush block, Floss clearing, Ion Rinse `<= 0.35` slurry flush + `FLUORIDE_SEALED`, per-cell spatial `pH` check (`5.5` vs `4.5`), and `angled_bass_array` `0.65 * 1.45` margin formula.
- `oralChemistrySim.test.ts`: Stephan `20s` pH drop/reset, `HCO₃⁻` spring buffering, and `gumIrritation` dynamics.
- `companionArch.test.ts`: Two-slope offline curve banking full `72 Ions` over `12h` rest from `smoothnessIndex = 100`, zero offline shield loss across 90-day `Saliva Stasis`, `3-treat/hr` reward cap, deterministic `45`-point treat shield cascade into `pulpIntegrity === 0`, and both `PULP_RESCUE` win (`+20` Ions, `100%` shields) and `90s` timeout (`50%` Calcium-Hydroxide stabilization, zero lost progress).
- `collisionSystem.test.ts`: `buildAlleyWalls()` + `PROBE_RADIUS (0.65u)` blocking `< 1.20u` alleys and `0.22s` `Capillary Tether-Zip` endpoint traversal.
- `scoringEngine.test.ts`: 4-pillar math, `250`-pt par-time floor beyond `2 * parTimeSec`, actuator-alternation Synergy multiplier (`3.0x` cap), and `Fluorapatite Gold` grade.
- `saveAndHabit.test.ts`: Synthetic `MouthLifeSaveV1 -> V2` migration, unknown-ID stripping across all ID arrays, `saveRevision` monotonicity, 90-day missed-habit zero loss, per-pickup beacon vs completion-only Overdrive decrement, and `ML2:` UTF-8 Base64URL roundtrip + corrupt-payload rejection.
- `worldSession.test.ts`: *Plaque City* cartridge bake, `surgeMeter` charging constants, Commensal reactivation (`>= 85%` local clean), automatic Fluorapatite Remineralization Wave (`>= 90%` district clean + all district Sites restored), and auto-unlock of `angled_bass_array` via `'upgrade:unlocked'`.

### §7.2 Build & PWA Gate (`npm run build`)
- `tsc --noEmit` exits `0`; Vite production build succeeds with `public/manifest.webmanifest` copied to `dist/`.

### §7.3 Interactive Mobile & Desktop Smoke Check
- Verify `390x844` mobile portrait viewport (Thumb Deck + Floss Ring + Portrait FOV + Companion Smooth Bask rotation + Treat feeding + Pulp Rescue + 2-Min Sink Brush-Along) and `1280x800` desktop viewport (`WASD`/Mouse + 3D Earth Globe -> Toronto *Plaque City* clear -> Historical Field Note unlock).

### §7.4 Verify-at-Build Checklist
1. Confirm `renderer.compile(scene, camera)` at boot and inside `webglcontextrestored` on the installed `three@^0.174.0` package produces zero visible first-frame shader-compile hitch.
2. Verify via unit and fuzz tests that no out-of-bounds `(x, z)` coordinate ever reaches `density[idx]` / `flags[idx]` with `"noUncheckedIndexedAccess": false`.
3. Confirm `SURGE_PER_CLEANED_CELL (0.12)` + `SURGE_PER_FLOSS_TARGET (15)` yields a ~1–2 Surge-per-district cadence during live World 1 playtesting and that full World 1 completion lands comfortably inside the `3–6 minute` (`parTimeSec = 270s`) target window.
4. Measure `renderer.info.render.calls < 25` across Hub, Plaque City, and Brush-Along Overwatch in both `low` and `ultra` tiers.
