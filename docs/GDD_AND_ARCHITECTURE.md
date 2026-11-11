# MouthLife: The Plaque Dimension — Game Design Document & Technical Architecture (v0)

## §1. Vision, Pillars & Non-Negotiable Invariants

**MouthLife: The Plaque Dimension** is a stylized-3D browser action-cleanup arcade adventure (`TypeScript` + `Vite` + `Three.js`) where players shrink to microscopic scale inside a surreal, living dental metropolis. Real-world dental habits fuel progression and unlock increasingly bizarre worlds, while active arcade gameplay teaches real preventive dentistry through physics, tool synergies, and spatial puzzles rather than lectures.

### §1.1 Core Design Pillars
1. **Mechanics Are the Lesson:** Every level encodes an authentic principle of oral biology (mechanical biofilm disruption, interdental reach, Stephan pH curve, salivary buffering, quorum-sensing mature biofilm) directly into tool interactions and environmental rules. Zero preachy popups or quiz gates.
2. **Tactile Cleanup Joy (PowerWash meets Zelda):** Top-down 3D action-adventure movement with deeply satisfying surface scrubbing, precision interdental slicing, tidal mouthwash surges, and trapped citizen rescues.
3. **Additive Habit Momentum (Anti-Punishment Invariant):** Missing a day, a week, or a month **never** resets counters, revokes upgrades, locks worlds, or triggers guilt messaging. Real-life brushing missions fill cumulative milestone banks and grant temporary empowerment buffs.
4. **Procedural Stylized 3D Toybox:** Crisp, colorful 3D molar cityscapes built from procedural/parametric geometry, custom shaders, and GPU instancing — running at 60 FPS in desktop/mobile browsers with zero external 3D asset pipeline blockers in Phase 1, while maintaining a clean scene/camera boundary for future WebXR exploration.

### §1.2 Scope Boundary: Phase 1 Vertical Slice vs. Future Campaign
- **In Scope for Phase 1 (First Playable Build):**
  - **Hub Screen ("The Bathroom Mirror Portal"):** Launch into Arcade Adventure or the 2-Minute *Brush-Along* Daily Mission, inspect cumulative Habit Bank milestones, and equip unlocked Toothbrush upgrades.
  - **Level 1 — Plaque City (Full Playable 3D Vertical Slice):** Three connected molar districts (*Incisor Plaza*, *Premolar Alley*, *First Molar Crown*), trapped Enamel Citizens, soft plaque turf, sticky interdental biofilm bridges, basic *Mutans Sprite* enemies, all **three core tools** (*Toothbrush*, *Floss Pick*, *Mouthwash*), district completion scoring, and the first unlockable Toothbrush upgrade (*Angled Bass Bristles*).
  - **2-Minute Brush-Along Mode:** Interactive 3D guided quadrant pacer (4 x 30s quadrants + optional 20s interdental bonus) with procedural Web Audio musical cues that rewards Fluoride Crystals and a *Remineralized Overdrive* buff for Arcade runs.
  - **Local Persistence:** Versioned `localStorage` save state with in-memory fallback.
- **Deferred Beyond Phase 1 (Designed in Campaign Arc §5, Excluded from Phase 1 Code):**
  - Playable Levels 2–5 (*The Gumline*, *Sugar Rush*, *The Acid Dimension*, *Biofilm Boss*).
  - Weekly rotating mutators, Monthly world/cosmetic drops, Endless procedural universe, and Optional WebXR Giant-Mouth VR mode.

---

## §2. Dual-Loop Gameplay Architecture

### §2.1 Loop A — Active Arcade Adventure (Playable Anytime)
Players control **Captain Bristle**, a microscopic dental ranger navigating a top-down/isometric 3D tooth cityscape (`~55°` pitched orthographic-feel perspective camera).
- **Core Objective in Plaque City:** Restore plaque-smothered districts to gleaming enamel health (`>= 90%` district cleanliness), sever interdental blockages, rescue trapped **Enamel Citizens**, and trigger a final **Mouthwash Remineralization Surge** to seal the district.
- **Session Length:** 3–6 minutes per arcade run, playable as many times per day as desired.

### §2.2 Loop B — 2-Minute "Brush-Along" Daily Mission (Real-World Habit Ritual)
Designed to sit beside the bathroom sink (or on desktop/phone) while the player physically brushes their teeth, without requiring two-handed controller input during the 2 minutes:
1. **One-Tap Start:** Player taps *"Start 2-Min Brush-Along"*.
2. **4-Quadrant Pacer (4 x 30s = 120s):** A giant stylized 3D dental arch highlights the active quadrant (*Upper Right -> Upper Left -> Lower Left -> Lower Right*) and surface angle (*Outer -> Chewing -> Inner*), showing animated microscopic helpers scrubbing alongside the player's real-life brushing rhythm. Distinct Web Audio chime chords mark each 30-second quadrant transition so the player doesn't even have to stare at the screen continuously.
3. **Optional 20s Interdental Bonus:** After 120s, an optional *"Floss Check!"* button lets players log/pace interdental cleaning for bonus Fluoride Crystals.
4. **Rewards & Zero-Loss Cadence:**
   - Awards **Fluoride Crystals** (permanent upgrade currency) + **+1 Cumulative Brush Stamp** toward world/upgrade milestones + **Remineralized Buff** (grants faster Mouthwash charge & wider Toothbrush scrub radius for the next 2 Arcade runs).
   - **Anti-Cheese / Healthy Cap:** Full Daily Mission bonus can be claimed up to **2 times per calendar day** (morning + night slots, spaced or unspaced, never penalized if 0 or 1). Extra Brush-Alongs in a single day still work as a timer and grant a small token tip without encouraging compulsive over-brushing.

---

## §3. The Three Core Tools & Dental Mechanics Mapping

Every tool in **Plaque City** has a distinct mechanical role grounded in real preventive dentistry:

| Tool | Input (Desktop / Touch) | Mechanical Behavior | Dental Principle Experienced |
|------|-------------------------|---------------------|------------------------------|
| **1. Toothbrush** (*Primary Scrub*) | `Left Click` / `Space` (hold & sweep) or Virtual Scrub Pad | Sweeps a forward/circular bristle arc (`radius 1.6u`). Cleans **Broad Enamel Plaque** (`DataTexture` alpha reduction) and knocks back *Mutans Sprites*. Scrubbing while moving clears `2.2x` faster than standing still holding attack. Physically collides with narrow **Interdental Alley** walls (`width < 1.2u`) — bristles cannot enter! | **Mechanical disruption & motion:** Brushing requires sweeping motion across broad surfaces, and toothbrush bristles physically cannot reach tight interdental contact points (~35–40% of tooth surface area). |
| **2. Floss Pick** (*Precision Interdental*) | `Right Click` / `E` (aim & zip-slice) | Fires/extends a taut micro-filament line (`length 3.8u`, `width 0.25u`) straight into narrow **Interdental Alleys** or across **Biofilm Tethers**. Instantly slices sticky interdental plaque bridges, dislodges wedged **Sugar Shards**, and pulls Captain Bristle through narrow interdental shortcuts. Inefficient on wide open plazas due to razor-thin width. | **Interdental necessity:** Only filament cleaning clears contact-point valleys and sub-crevice bridges between teeth. |
| **3. Mouthwash** (*Tidal Surge*) | `Q` / `Shift` (when Surge Meter == 100%) | Unleashes an expanding **Fluoride Rinse Wave** (`radius 9.0u` over `1.2s`). Instantly washes away *loosened* plaquesludge (`density <= 0.35`), neutralizes acid puddles, stuns *Mutans Sprites*, and applies a gleaming **Fluoride Seal** to clean enamel tiles (slowing re-soiling by `60%`). **Crucial rule:** Against *un-scrubbed thick plaque* (`density > 0.35`), the wave deals almost zero removal (`-0.05`) and shimmers off harmlessly. | **Rinse is an adjunct, not a replacement:** Mouthwash cannot penetrate or strip intact structural plaque biofilm; mechanical disruption (brush + floss) must break it up first, after which fluoride rinse flushes debris and remineralizes exposed enamel. |

### §3.1 First Unlockable Upgrade (Plaque City Reward)
- **Angled Bass Bristles (Tier 1 Toothbrush):** Unlocked at **3 Cumulative Brush Stamps** OR **Completing Plaque City with >= 90% Cleanliness**. Increases Toothbrush scrub efficiency along wall/gumline edges by `40%` and widens arc angle from `95°` to `130°`, teaching how angling bristles toward the gumline margin improves sulcus plaque removal.

---

## §4. Level 1 Design — Plaque City

### §4.1 Spatial Layout & Districts
Plaque City is a continuous 3D tooth-arch island (`64u x 32u` playable bounds) divided into three contiguous districts connected by **Interdental Alleys**:
1. **District 1 — Incisor Plaza (Tutorial & Broad Scrubbing):**
   - Wide, flat labial terrace covered in soft yellow-green **Pellicle Plaque**.
   - 3 trapped **Enamel Citizens** encased in gummy plaque domes (freed when surrounding `2.0u` radius drops below `15%` plaque density; freed citizens cheer and toss Mouthwash Surge orbs).
   - Teaches: Moving + sweeping with the Toothbrush clears plaque faster than stationary mashing.
2. **District 2 — Premolar Alley (Interdental Gate & Floss Mastery):**
   - Two narrow **Interdental Passages** (`width 0.9u`) flanked by sheer enamel cliffs blocked by **Biofilm Bridges** and wedged **Sugar Shards** spawning slow *Mutans Sprites*.
   - Captain Bristle's Toothbrush bounces off the narrow gap with a clear visual/audio deflection cue; switching/firing the **Floss Pick** slices right through the alley, clearing the hidden interdental plaque cache and opening a zip-path to rescue 3 alley-trapped Citizens.
3. **District 3 — First Molar Crown (Pit & Fissure Finale):**
   - Deep occlusal valleys (pits & fissures) where *Mutans Sprites* convert dropped sugar crumbs into sticky plaque puddles.
   - Players combine **Floss Pick** (slice Sugar Shards & interdental vents), **Toothbrush** (scrub thick fissure plaque below the `0.35` threshold), and **Mouthwash Surge** (flush loosened sludge + seal clean enamel with Fluoride shimmer) to hit `90%+` total city cleanliness and rescue the final 4 Enamel Citizens (10 total).

### §4.2 Enemies & Hazards in Plaque City (Non-Punitive Failure State)
- **Mutans Sprites:** Bouncy spherical bacteria that hop toward Sugar Shards and leave faint plaque trails (`+0.08 density/s` in `0.8u` radius). Knocked back and popped in 2 Toothbrush sweeps.
- **Acid Puddles:** Small fizzing amber pools dropped when Mutans eat sugar; slow player movement by `30%` (no player death/game-over screen!). Captain Bristle has a **Stamina / Gum Comfort** meter only for knockback recovery — players **cannot "die" and lose run progress**, preserving breezy arcade flow for all ages.

---

## §5. 5-World Campaign Roadmap & Progression System (Architectural Context)

While Phase 1 builds **Level 1 (Plaque City)** end-to-end, data schemas and world registries are structured to accommodate the full 5-world arc without refactoring:

| World | Name | Core Dental Principle | Signature Mechanic |
|-------|------|-----------------------|--------------------|
| **1** | **Plaque City** *(Phase 1 MVP)* | Broad brushing + interdental flossing + adjunct rinse | Scrub `DataTexture` turf, slice narrow alleys, Fluoride Surge finisher |
| **2** | **The Gumline** | Subgingival sulcus care & gentle C-shape pressure | Pressure-gauge corridor navigation; over-pressing irritates pink gum bridges |
| **3** | **Sugar Rush** | Stephan Curve: **frequency** of sugar hits > quantity | Each candy wave resets a global 20s Acid Sky timer; batching clears beats trickling |
| **4** | **The Acid Dimension** | Salivary pH buffering & softened-enamel protection | Activate Saliva Geysers to raise pH (`>= 5.5`) *before* scrubbing softened enamel |
| **5** | **Biofilm Boss** | Mature EPS matrix quorum-sensing & multi-step breakdown | Multi-phase boss: sever Floss anchors -> cut sugar supply -> scrub armor -> Rinse seal |

### §5.1 Progression Cadence (Zero-Decay Design)
- **Daily Missions (Phase 1):** Morning & Evening 2-Minute Brush-Along slots + 1 Daily Arcade Challenge (*e.g., "Clear Premolar Alley in under 45s"*).
- **Cumulative Milestone Track (Phase 1):** Stamps accumulate monotonically (`1, 3, 5, 10, 20...`) to unlock upgrades, brush trails, and future world keys. Missing days leaves the track untouched.
- **Post-Phase-1 Extensions:** Weekly challenge mutators, Monthly world/cosmetic packs, Procedural Endless Microscopic Universe, and Optional WebXR Giant-Mouth VR camera rig.

---

## §6. Technical Architecture Specification (`TypeScript` + `Vite` + `Three.js`)

### §6.1 Stack & Dependencies
- **Runtime & Bundler:** `Vite` (`^6.x`) + `TypeScript` (`^5.7`, strict mode enabled).
- **3D Rendering:** `three` (`^0.172.0`) + `@types/three` — zero heavy physics engines (custom deterministic 2D-on-3D-heightmap spatial grid + circle/segment collision keeps bundle `< 200 KB` gzipped after Three.js).
- **Audio:** Native **Web Audio API** procedural synth (`AudioEngine`) — zero external MP3/WAV asset dependencies; generates bubbly scrub noise, crisp floss string plucks, shimmering rinse chords, and 30s Brush-Along quadrant chimes.
- **UI Overlay:** Lightweight reactive DOM/CSS HUD layer (`src/ui/`) mounted over `<canvas>` for crisp typography, accessibility, touch controls, and zero-overhead menus.
- **Testing:** `Vitest` for deterministic simulation, plaque grid math, tool rules, and save-state/habit-bank unit tests.

### §6.2 Directory & Module Structure
```text
d:\MouthLife\
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── docs/
│   └── GDD_AND_ARCHITECTURE.md
└── src/
    ├── main.ts                      # App bootstrap, lifecycle, mode switching
    ├── config/
    │   ├── gameConfig.ts            # Tunable constants (radii, speeds, thresholds)
    │   └── worldRegistry.ts         # Level 1 definition + Worlds 2-5 metadata stubs
    ├── core/
    │   ├── EventBus.ts              # Strongly-typed pub/sub event bus
    │   ├── ClockController.ts       # Fixed-step simulation dt + wall-clock Brush timer
    │   └── InputManager.ts          # Keyboard/Mouse + Virtual Touch twin-action input
    ├── state/
    │   ├── SaveManager.ts           # Versioned localStorage + memory fallback
    │   └── HabitBank.ts             # Zero-loss stamp bank, 2x/day slot logic, buffs
    ├── sim/
    │   ├── PlaqueGrid.ts            # Float32Array density grid + Brush/Floss/Rinse ops
    │   ├── LevelLayout.ts           # Plaque City heightmap, walls, interdental alleys
    │   ├── Entities.ts              # Player, Citizens, Mutans Sprites, Sugar Shards
    │   └── Collision.ts             # Circle-AABB, tool-alley width check, segment-circle
    ├── render/
    │   ├── SceneManager.ts          # WebGLRenderer, lighting, camera rig (WebXR-ready)
    │   ├── PlaqueCityBuilder.ts     # Procedural 3D molars, gums, alleys, DataTexture shader
    │   ├── EntityRenderer.ts        # Captain Bristle mesh, InstancedMesh sprites/particles
    │   └── BrushAlongScene.ts       # 3D full-arch diorama & quadrant highlighter
    ├── audio/
    │   └── SoundEngine.ts           # Web Audio procedural SFX & quadrant pacer chimes
    └── ui/
        ├── HudOverlay.ts            # Cleanliness %, Surge meter, Citizen count, Tool hints
        ├── HubView.ts               # Mirror Portal menu, Upgrades, Stamp Milestones
        └── BrushAlongOverlay.ts     # 2-Min countdown, quadrant prompt, 20s Floss bonus
└── tests/
    ├── plaqueGrid.test.ts           # Verifies Brush vs Floss vs Mouthwash density rules
    ├── habitBank.test.ts            # Verifies zero-loss missed days & 2x/day healthy cap
    └── collision.test.ts            # Verifies Toothbrush blocked by <1.2u interdental alley
```

### §6.3 Core Data Models & Simulation Contracts

#### 1. Plaque Turf Representation (`PlaqueGrid.ts`)
- World bounds `[0..64] x [0..32]` mapped to a `256 x 128` grid (`0.25u` per cell = `32,768` cells).
- Backed by typed arrays for zero GC churn:
  - `density: Float32Array` (`0.0` = sparkling clean, `1.0` = thick mature plaque).
  - `flags: Uint8Array` bitmask:
    - `0x01` = `PAINTABLE` (playable tooth/alley surface vs void/wall)
    - `0x02` = `INTERDENTAL` (narrow alley cell: **ignores Toothbrush scrub**, cleared by **Floss Pick** or **Mouthwash if `density <= 0.35`**)
    - `0x04` = `FLUORIDE_SEALED` (reduces Mutans re-soiling rate by `60%`)
- Synced directly to a `THREE.DataTexture` (`RGBAFormat`, `UnsignedByteType`) only when dirty cells change during a tick, blended in custom tooth surface shader material.
- **District Cleanliness Metric:**
  `cleanliness = 1 - (sum(density[cell] for paintable cells in district) / count(paintable cells in district))`
  (or binary cell-clean threshold `density <= 0.10` — standardized across HUD and win checks: a cell counts as clean when `density <= 0.10`).

#### 2. Save State Schema (`SaveManager.ts`)
```ts
export interface MouthLifeSaveV1 {
  schemaVersion: 1;
  totalBrushStamps: number;          // Monotonic; NEVER decreases
  fluorideCrystals: number;          // Upgrade currency
  dailySlotsByDate: Record<string, number>; // YYYY-MM-DD (local) -> count (0..2 rewarded)
  remineralizedBuffRunsRemaining: number;   // Granted by Brush-Along
  unlockedUpgrades: string[];        // e.g. ['angled_bass_bristles']
  equippedBrushUpgrade: string | null;
  worldProgress: Record<string, {
    completed: boolean;
    bestCleanlinessPct: number;
    citizensRescuedMax: number;
  }>;
}
```

#### 3. Clock Separation (`ClockController.ts`)
- **Arcade Simulation:** Fixed-timestep accumulator (`FIXED_DT = 1 / 60`, frame delta clamped to `<= 0.1s` so backgrounding a browser tab never tunnels entities).
- **2-Minute Brush-Along Timer:** Driven by monotonic elapsed timestamp (`performance.now()`) while unpaused, plus `Screen Wake Lock API` (`navigator.wakeLock?.request('screen')` wrapped in `try/catch` progressive enhancement) so mobile screens don't dim mid-brushing!

### §6.4 WebGL & Browser Resilience
- **Audio Unlock:** `AudioContext` is instantiated lazily and `.resume()`d inside the first pointer/key gesture handler.
- **Storage Safety:** All `localStorage` reads/writes wrapped in `try/catch` + JSON schema validation; corrupt or unavailable storage falls back cleanly to an in-memory session store without crashing.
- **GPU Cleanup:** Switching between `ArcadeScene` and `BrushAlongScene` explicitly disposes transient geometries/materials/textures or reuses pooled `InstancedMesh` buffers to avoid WebGL memory leaks.

---

## §7. Verification & Acceptance Criteria (Phase 1 Build Gate)

1. **Automated Unit Tests (`npm test` via Vitest):**
   - `PlaqueGrid`: Toothbrush reduces non-interdental density, leaves `INTERDENTAL` cells untouched, and moving sweep removes `>2x` stationary scrub; Floss Pick clears `INTERDENTAL` cells along segment; Mouthwash clears cells with `density <= 0.35` + sets `FLUORIDE_SEALED`, while cells with `density > 0.35` lose `<= 0.05`.
   - `HabitBank`: Simulating 1-day, 7-day, and 60-day gaps between Brush-Alongs preserves `totalBrushStamps`, `fluorideCrystals`, and `unlockedUpgrades` with zero decay; 3rd Brush-Along on the same local `YYYY-MM-DD` does not over-award daily stamps.
   - `Collision`: Toothbrush scrub hitbox deflects against `< 1.2u` interdental walls while Floss Pick ray/segment passes through.
2. **Build & Bundle Check (`npm run build`):**
   - Zero TypeScript errors (`tsc --noEmit`), clean Vite production bundle.
3. **Interactive End-to-End Smoke Verification:**
   - Hub -> Launch Plaque City -> Clear Incisor Plaza (Toothbrush), slice Premolar Alley (Floss Pick), trigger Mouthwash Surge in First Molar Crown -> Rescue Citizens -> Unlock *Angled Bass Bristles* -> Run 2-Minute Brush-Along timer & verify quadrant transitions + buff persistence.
