# MouthLife: The Plaque Dimension — Game Design Document & Technical Architecture

## §1. Vision, Pillars & Non-Negotiable Invariants

**MouthLife: The Plaque Dimension** is a stylized-3D browser action-cleanup arcade adventure (`TypeScript` + `Vite` + `Three.js`) built by a single developer/agent workflow where players shrink to microscopic scale inside a surreal, living dental metropolis. Real-world dental habits fuel progression and physically empower arcade runs without punitive streak tracking, while active gameplay teaches authentic preventive dentistry through spatial physics and tool synergies rather than lectures.

### §1.1 Core Design Pillars
1. **Mechanics Are the Lesson:** Every world encodes real oral biology (mechanical biofilm disruption, interdental contact-point reach, disclosing-dye visualization, Stephan pH curve, salivary buffering, mature EPS biofilm) directly into gameplay rules. Zero preachy popups or quiz gates.
2. **Tactile Cleanup Joy (PowerWash meets Zelda):** Top-down 3D action-adventure movement with juicy bristle scrubbing, precision interdental zip-slicing, bioluminescent disclosing pulses, tidal mouthwash surges, and citizen rescues that bring a slimed tooth metropolis back to sparkling life.
3. **Additive Habit Momentum (Anti-Punishment Invariant):** Missing a day, a week, or a month **never** resets counters, revokes upgrades, locks worlds, or triggers guilt messaging. Real-life brushing missions fill monotonic cumulative milestone banks, air-drop supplies into Plaque City, and can be backed up/moved across devices (e.g., bathroom phone to desktop) via a zero-backend **Mirror Sync Code**.
4. **Unified Procedural 3D Toybox:** Colorful 3D molar cityscapes built from procedural geometry, custom GLSL/Three.js shader hooks, and `InstancedMesh` rendering — targeting 60 FPS on desktop and modern mobile browsers via adaptive DPR/particle quality scaling, with zero external 3D asset blockers in Phase 1.

### §1.2 Scope Boundary: Phase 1 Vertical Slice vs. Future Campaign
- **In Scope for Phase 1 (First Playable Build):**
  - **Hub Overlay ("The Bathroom Mirror Portal"):** Launch into Arcade Adventure or the 2-Minute *Brush-Along Expedition*, inspect cumulative Brush Stamp milestones, equip unlocked Toothbrush upgrades, and copy/paste a **Mirror Sync Code** backup.
  - **Level 1 — Plaque City (Full Playable 3D Vertical Slice):** Three contiguous molar districts (*Incisor Plaza*, *Premolar Alley*, *First Molar Crown*), 10 trapped **Enamel Citizens** + neighborhood **Saliva Fountains**, multi-density plaque turf (open pellicle vs stubborn gumline/fissure bands), sticky interdental **Biofilm Bridges**, **Sugar Shards**, bouncy **Mutans Sprites**, all **three core tools** (*Toothbrush*, *Floss Pick*, *Mouthwash*) + **Disclosing-Tablet Pulse**, district completion cascades, and the first unlockable upgrade (*Angled Bass Bristles*).
  - **2-Minute Brush-Along Expedition (Sink Ritual):** Hands-free 3D guided quadrant pacer (`4 x 30s` quadrants + optional `20s` animated C-curve Interdental Pacer) rendered via an **Orbital Arch Overwatch** camera mode over the live Plaque City scene, with procedural Web Audio marimba/chime cues, air-dropping **Fluoride Supply Beacons** and granting *Remineralized Overdrive* for Arcade runs.
  - **Local Persistence + Sync Code:** Versioned `localStorage` save state with in-memory fallback and Base64 JSON export/import.
- **Deferred Beyond Phase 1 (Architectural Context Only — Zero Phase 1 Implementation):**
  - Playable Worlds 2–5 (*The Gumline*, *Sugar Rush*, *The Acid Dimension*, *Biofilm Boss*).
  - Rotating Daily/Weekly arcade challenge mutators, Monthly cosmetic drops, Endless procedural universe, and WebXR Giant-Mouth VR mode (Phase 1 includes zero `navigator.xr` code; it only keeps simulation coordinates decoupled from the camera rig).

---

## §2. Dual-Loop Gameplay Architecture

### §2.1 Loop A — Active Arcade Adventure (Playable Anytime)
Players control **Captain Bristle**, a microscopic dental ranger navigating a continuous 3D tooth cityscape (`55°` pitched perspective camera with smooth follow damping).
- **Canonical Cleanliness Metric (`CLEAN_THRESHOLD = 0.10`):** Every playable surface texel (`PAINTABLE` flag) is **clean** when `density <= 0.10` and **plaque-coated** when `density > 0.10`. District and city cleanliness percentages equal `cleanPaintableCells / totalPaintableCells * 100`. Crossing `<= 0.10` snaps the surface shader to a gleaming enamel specular finish so visual state matches win math 1:1.
- **District Seal Condition (Soft-Lock Proof):** Reaching `>= 90%` clean cells in a district **and** rescuing all Enamel Citizens in that district automatically triggers a celebratory, zero-cost **District Remineralization Cascade** — flushing the remaining `<= 10%` stray specks, sealing the district's enamel, activating its **Saliva Fountain**, and lighting the archway to the next district.
- **Target Pacing:** Designed for ~3–6 minutes per full Plaque City run (tunable via `gameConfig.ts` scrub rates; verified during Phase 1 playtest).

### §2.2 Loop B — 2-Minute "Brush-Along" Expedition (Real-World Sink Ritual)
Built to run hands-free beside the bathroom sink while physically brushing, while feeling directly wired into the *MouthLife* universe rather than a generic timer:
1. **One-Tap Launch:** Tapping *"Start 2-Min Brush-Along"* smoothly elevates the unified 3D camera into **Orbital Arch Overwatch** above Plaque City.
2. **4-Quadrant Expedition (`4 x 30s = 120s`):** Holographic arch sectors highlight *Upper Right -> Upper Left -> Lower Left -> Lower Right* (cycling *Outer -> Chewing -> Inner* angle badges every 10s). As the timer runs, Captain Bristle's microscopic **Scout Crew** visibly parades across Plaque City, air-dropping up to **4 Fluoride Supply Beacons** into the city for the player's next Arcade run. Distinct procedural Web Audio chord progressions mark every 10s angle shift and 30s quadrant transition so glancing is optional.
3. **Optional 20s C-Curve Interdental Pacer:** At `120s`, players can claim rewards immediately OR tap *"20s Floss Expedition"* to run an animated C-curve interdental filament guide across interdental valleys for `+25` bonus Fluoride Crystals.
4. **Rewards & Healthy Cap (Zero Streak Loss):**
   - Awards **`+50` Fluoride Crystals**, **`+1` Cumulative Brush Stamp**, **4 pre-placed Supply Beacons** in the next Arcade run (each granting an instant `+50%` Surge burst when touched), and **Remineralized Overdrive** (`+25%` Toothbrush scrub width + start at `100%` Surge Meter for the next 2 Arcade runs).
   - **2x/Day Full Reward Cap:** Up to **2 full Expedition rewards per local calendar day (`YYYY-MM-DD`)** (morning + night slots, any hour). Additional Brush-Alongs on the same day still function as a full 3D pacer and grant a small `+5` Crystal courtesy tip without encouraging over-brushing. Missing days leaves all stamps, crystals, and unlocks untouched.

---

## §3. Tools, Abilities & Dental Science Mechanics

*(All numeric radii, durations, and rates below are baseline defaults centralized in `src/config/gameConfig.ts` for rapid playtest tuning.)*

### §3.1 The Three Core Tools + Disclosing Pulse

| Tool / Ability | Desktop Input | Touch Input | Mechanical Behavior | Dental Principle |
|----------------|---------------|-------------|---------------------|------------------|
| **1. Toothbrush** (*Broad Scrub*) | `Left Click` or `Space` (hold while moving `WASD`/Arrows) | Left-thumb joystick move + `Scrub` hold pad (or auto-scrub toggle) | Sweeps a forward semicircular bristle arc (`radius 1.6u`, `arc 95°`). Reduces plaque `density` on non-interdental `PAINTABLE` cells. Moving while scrubbing clears `2.2x` faster (`0.95/s` vs `0.43/s` stationary) to reward sweeping strokes. **Blocked by narrow Interdental Alleys (`width < 1.2u`)** with a tactile bristle-deflect animation & thud SFX. | Sweeping bristle motion disrupts surface plaque, but bristles physically cannot enter tight interdental contact points (~35–40% of tooth area). |
| **2. Floss Pick** (*Interdental Slice & Zip*) | `Right Click` or `E` aimed toward mouse ground-plane cursor (fallback: player facing vector) | Right-thumb **slingshot drag-pad** previews cyan filament ray; release fires | Extends a taut micro-filament (`length 3.8u`, `width 0.28u`, `0.35s` cooldown) straight through **Interdental Alleys** (`INTERDENTAL` cells). Instantly clears interdental plaque along the segment, severs **Biofilm Bridges**, shatters **Sugar Shards**, and zips Captain Bristle through open interdental shortcuts if fired down an alley channel. | Only interdental filament cleaning reaches contact-point crevices and severs interproximal biofilm bridges. |
| **3. Mouthwash** (*Fluoride Tidal Surge*) | `Q` or `Shift` when `surgeMeter >= 100` | Dedicated glowing `Surge` button (pulses at `100%`) | Unleashes an expanding **Fluoride Rinse Wave** (`radius 9.0u` over `1.0s`). Washes away *loosened* plaque (`density <= 0.35` -> `0.0`), clears **Acid Puddles**, stuns *Mutans Sprites* for `3.0s`, and applies `FLUORIDE_SEALED` (`60%` slower re-sliming) to clean cells (`density <= 0.10`). **Against intact thick plaque (`density > 0.35`), reduces density by only `0.04` with a harmless deflection shimmer.** | Mouthwash is an adjunct, not a substitute: antimicrobial/fluoride rinse cannot strip intact structural biofilm until brushing & flossing mechanically disrupt it. |
| **4. Disclosing Pulse** (*Plaque Dye Radar*) | `Tab` or `R` (`6.0s` cooldown) | Mini `Dye Radar` HUD button | Emits a bioluminescent **Erythrosine Magenta Wave** across `18.0u` for `3.5s`. Temporarily tints remaining dirty cells (`density > 0.10`) neon pink (`0.11–0.45` fresh pellicle) to deep electric violet (`> 0.45` mature margin/fissure biofilm), including hidden interdental caches. | Real disclosing tablets stain invisible plaque by thickness/maturity, revealing missed gumline margins and interdental pockets. |

### §3.2 Surge Meter Economy
- `surgeMeter` (`0..100`, clamped) charges continuously during Arcade play:
  - `+0.12` per `PAINTABLE` cell newly crossed below `CLEAN_THRESHOLD (0.10)`
  - `+15` per **Biofilm Bridge** or **Sugar Shard** severed with Floss Pick
  - `+30` per **Enamel Citizen** rescued (or `+50` when touching a Brush-Along **Fluoride Supply Beacon**)
- Because Mouthwash is a repeatable tactical power and District Sealing (§2.1) triggers automatically at `>= 90%` cleanliness + rescued Citizens, spending Mouthwash aggressively never soft-locks level completion.

### §3.3 Unlockable Phase 1 Upgrade
- **Angled Bass Bristles (`angled_bass_bristles`):** Unlocked automatically upon reaching **3 Cumulative Brush Stamps** OR **Completing Plaque City (`>= 90%` across all 3 districts)** (or purchasable in Hub for `100` Fluoride Crystals).
- **Mechanical Payoff:** Widens Toothbrush arc from `95°` to `130°` and boosts scrub removal rate on `MARGIN_FISSURE` cells (`0x08` flag along gumline walls and molar grooves) by `+45%`, tangibly demonstrating the 45° Bass sulcus brushing principle.

---

## §4. Level 1 World Design — Plaque City

### §4.1 Contiguous 3-District Tooth Arch (`64u x 32u`)
Plaque City is a single seamless 3D molar archipelago surrounded by stylized pink **Gingival Sea** waves and luminous **Saliva Rivers**:
1. **District 1 — Incisor Plaza (`x: 2..20`, Broad Scrubbing & Disclosing Intro):**
   - Open labial terrace coated in `0.50` density pellicle plaque with `0.85` density **Gumline Margin** bands (`MARGIN_FISSURE` flag) hugging the southern gingival parapet.
   - **3 Enamel Citizens** (*Ameloblast Sprites*) trapped in translucent gummy domes. Each Citizen's dome shatters when `>= 85%` of `PAINTABLE` cells within `2.0u` of that Citizen are clean (`density <= 0.10`). Freed Citizens toss a `+30` Surge orb and trot to the plaza's **Saliva Fountain**, sending pearlescent mist over the cusp.
2. **District 2 — Premolar Alley (`x: 20..40`, Interdental Gate & Floss Zip):**
   - Two narrow **Interdental Passages** (`width 0.9u`, marked `INTERDENTAL`) between towering twin premolar crowns, sealed by sticky **Biofilm Bridges** and **2 Sugar Shards**.
   - Toothbrush sweeps visibly deflect off the `0.9u` gap walls; firing the **Floss Pick** slices the Biofilm Bridges, strips the `INTERDENTAL` plaque channel, shatters Sugar Shards, and lets Captain Bristle zip between upper and lower terraces to rescue **3 Alley Citizens**.
3. **District 3 — First Molar Crown (`x: 40..62`, Occlusal Fissures & 3-Tool Finale):**
   - Sculpted 4-cusp molar plateau creased by a central cruciform **Occlusal Fissure** (`MARGIN_FISSURE` cells at `0.85` density), **2 peripheral Interdental Vents**, **3 Sugar Shards**, and **4 trapped Citizens**.
   - Players slice Sugar Shards & vents with **Floss Pick** to cut off *Mutans* spawns, scrub thick fissure plaque below `0.35` with **Toothbrush**, pop **Disclosing Pulse** to spot missed crevices, and unleash **Mouthwash Surge** to flush loosened `<= 0.35` sludge and seal clean cusps against re-sliming. Sealing all 3 districts completes Plaque City with a full-arch fireworks & remineralization fanfare.

### §4.2 Dynamic Arcade Ecology (Zero-Death Tension)
- **Sugar Shards:** Crystalline candy meteors wedged near crevices. Every `5.0s`, an intact Sugar Shard spawns a *Mutans Sprite* (up to a cap of `4` active Sprites per Shard, `14` global max). Shattered in `1` Floss Pick slice or `4` Toothbrush sweeps.
- **Mutans Sprites:** Bouncy spherical bacteria that hop across enamel, painting a `0.8u` trail of fresh plaque (`+0.12 density/s` on unsealed cells, reduced to `+0.048/s` on `FLUORIDE_SEALED` cells) and dropping **Acid Puddles** (`radius 1.2u`, `6.0s` lifetime, `-30%` player move speed; instantly neutralized by Mouthwash).
- **Slime-Boing Knockback (No Health Bar):** Touching a *Mutans Sprite* applies a playful `0.25s` elastic knockback velocity impulse with a rubbery boing SFX — **zero player HP bar, zero game-over screen**. The real stakes are **turf control**: leaving Sugar Shards intact lets *Mutans* re-slime unsealed clean enamel!

---

## §5. 5-World Campaign Roadmap (Extensibility Contract Only)

`src/config/worldRegistry.ts` defines a typed `WorldDefinition` array where World 1 is playable in Phase 1 and Worlds 2–5 appear in the Mirror Portal map as locked preview nodes showing their target Brush Stamp / Campaign milestones:

| World | Name | Unlock Milestone | Dental Principle | Signature Future Mechanic |
|-------|------|------------------|------------------|---------------------------|
| **1** | **Plaque City** *(Phase 1)* | Unlocked at Start | Broad scrub + interdental floss + adjunct fluoride rinse | Multi-density `PlaqueGrid`, narrow alleys, Disclosing Pulse, Surge seal |
| **2** | **The Gumline** *(Deferred)* | Complete World 1 + `4` Stamps | Gentle subgingival sulcus care & C-curve flossing | Gum Comfort pressure gauge; heavy scrubbing inflames pink sulcus bridges |
| **3** | **Sugar Rush** *(Deferred)* | Complete World 2 + `8` Stamps | Stephan Curve: sugar **frequency** > total quantity | Every candy hit restarts a 20s global Acid Rain window |
| **4** | **The Acid Dimension** *(Deferred)* | Complete World 3 + `14` Stamps | Salivary buffering (`pH >= 5.5`) before scrubbing softened enamel | Trigger Saliva Geysers to neutralize pH zones prior to brushing |
| **5** | **Biofilm Boss** *(Deferred)* | Complete World 4 + `20` Stamps | Mature quorum-sensing EPS biofilm matrix | Multi-phase boss: sever Floss anchors -> starve sugar -> scrub armor -> Rinse seal |

---

## §6. Technical Architecture Specification (`TypeScript` + `Vite` + `Three.js`)

### §6.1 Stack, Build & Performance Budget
- **Tooling:** `Vite ^6.2.0`, `TypeScript ^5.7.0` (`strict: true`, `noUncheckedIndexedAccess: true`), `Vitest ^3.0.0`.
- **3D Engine:** `three ^0.174.0` + `@types/three ^0.174.0` (standard `WebGLRenderer`, custom `MeshStandardMaterial.onBeforeCompile` plaque/disclosing shader injection — avoids fragile raw custom lighting shaders while keeping crisp PBR/toon enamel highlights).
- **Performance & Quality Scaling (`QualityTier`):**
  - `high` (default desktop): `pixelRatio = Math.min(window.devicePixelRatio, 2)`, `maxParticles = 400`, shadow map `1024x1024`.
  - `balanced` (auto-selected on coarse pointer/mobile or if rolling 90-frame FPS `< 45`, also user-toggleable in HUD): `pixelRatio = Math.min(window.devicePixelRatio, 1.25)`, `maxParticles = 150`, blob contact shadows instead of directional shadow map.
  - Draw call ceiling in Plaque City: `< 35` draw calls (1 terrain mesh + 1 gum sea mesh + `InstancedMesh` batches for Mutans, Citizens, Sugar Shards, Saliva particles, and Supply Beacons).

### §6.2 Directory & Module Layout
```text
d:\MouthLife\
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── docs/
│   └── GDD_AND_ARCHITECTURE.md
├── src/
│   ├── main.ts                      # Bootstrap, AppMode state machine, RAF loop
│   ├── config/
│   │   ├── gameConfig.ts            # All tunable radii, rates, thresholds, colors
│   │   └── worldRegistry.ts         # World 1 layout config + Worlds 2-5 preview metadata
│   ├── core/
│   │   ├── EventBus.ts              # Typed event emitter with scoped unsubscribe
│   │   ├── ClockController.ts       # Fixed-dt arcade accumulator + monotonic Brush timer
│   │   └── InputManager.ts          # WASD/Mouse raycast + Touch twin-pad/slingshot
│   ├── state/
│   │   ├── SaveManager.ts           # Versioned localStorage, fallback, Base64 Sync Code
│   │   └── HabitBank.ts             # Monotonic stamps, 2x/day local-date cap, Overdrive buff
│   ├── sim/
│   │   ├── PlaqueGrid.ts            # Float32Array density + Uint8Array flags + tool ops
│   │   ├── LevelLayout.ts           # Plaque City 3-district geometry bounds, walls, alleys
│   │   ├── ArcadeSim.ts             # Deterministic 60Hz tick: player, tools, enemies, citizens
│   │   └── Collision.ts             # Circle-AABB slide, alley width block, segment-circle
│   ├── render/
│   │   ├── SceneManager.ts          # Unified WebGLRenderer, CameraRig (Arcade + Overwatch), QualityTier
│   │   ├── PlaqueCityMesh.ts        # Procedural molar arch, DataTexture sync, Disclosing shader
│   │   └── EntityInstancer.ts       # Captain Bristle rig, Floss beam, Surge ring, InstancedMeshes
│   ├── audio/
│   │   └── SoundEngine.ts           # Lazy Web Audio synth: scrub noise, floss pluck, pacer chords
│   └── ui/
│       ├── HubOverlay.ts            # Mirror Portal menu, Upgrades, World Roadmap, Sync Code modal
│       ├── ArcadeHud.ts             # District %, Surge button, Disclosing button, Touch pads
│       └── BrushAlongHud.ts         # 2-Min quadrant ring, angle badge, 20s Floss pacer
└── tests/
    ├── plaqueGrid.test.ts           # Brush/Floss/Mouthwash/Disclosing/Cleanliness math
    ├── habitBank.test.ts            # Missed-day preservation, 2x/day cap, Sync Code roundtrip
    ├── collision.test.ts            # Toothbrush <1.2u alley block vs Floss segment pass-through
    └── arcadeSim.test.ts            # Citizen rescue at >=85% local clean & auto District Seal
```

### §6.3 Key Contracts, Coordinate Systems & Data Structures

#### 1. World & Grid Coordinate Contract
- **World Space:** Right-handed Three.js coordinates: `X in [0, 64]` (west-to-east across Incisor -> Premolar -> Molar), `Z in [0, 32]` (north-to-south), `Y = terrainHeight(x, z)` (`[0, 4.5]`). All gameplay collision and tool radii operate in 2D `(x, z)` top-down space projected onto `Y`.
- **Plaque Grid (`PlaqueGrid.ts`):** `GRID_W = 256`, `GRID_H = 128`, `CELL_SIZE = 0.25u` (`gx = Math.floor(x / 0.25)`, `gz = Math.floor(z / 0.25)`, `idx = gz * 256 + gx`).
- **Cell Arrays:**
  - `density: Float32Array(32768)` clamped `[0.0, 1.0]`.
  - `flags: Uint8Array(32768)` bitmask:
    - `0x01` `PAINTABLE` — valid enamel/alley surface included in cleanliness denominator
    - `0x02` `INTERDENTAL` — narrow alley cell; **immune to `applyBrush()`**, cleared by `applyFlossSegment()` (`-> 0.0`) and by `applyMouthwash()` when `density <= 0.35`
    - `0x04` `FLUORIDE_SEALED` — set by `applyMouthwash()` or District Cascade on cells with `density <= 0.10`; multiplies Mutans plaque deposition by `0.4`
    - `0x08` `MARGIN_FISSURE` — gumline border / occlusal groove cell; initialized at `0.85` density (`0.65x` base brush removal rate unless `angled_bass_bristles` is equipped, which boosts it by `+45%`)
  - `districtId: Uint8Array(32768)` (`0 = none`, `1 = Incisor Plaza`, `2 = Premolar Alley`, `3 = First Molar Crown`).
- **GPU Texture Sync:** `rgbaBuffer: Uint8Array(32768 * 4)` updated only over dirty bounding box `[minGx..maxGx, minGz..maxGz]` per frame (`R = density * 255`, `G = flags`, `B = districtSealState`, `A = 255`) -> `dataTexture.needsUpdate = true`. Zero per-frame TypedArray allocations.

#### 2. App Mode State Machine (`main.ts`)
`type AppMode = 'HUB' | 'ARCADE' | 'BRUSH_ALONG' | 'VICTORY_SUMMARY';`
- Transitions cleanly reset transient input holds (`InputManager.clearState()`), switch `CameraRig` preset (`'FOLLOW'` vs `'OVERWATCH'`), and toggle the active DOM HUD container while keeping the single `SceneManager` WebGL context alive throughout the session (plus `webglcontextlost` / `webglcontextrestored` event handlers that pause simulation and rebuild `dataTexture.needsUpdate = true`).

#### 3. Save Schema & Mirror Sync Code (`SaveManager.ts`)
```ts
export interface MouthLifeSaveV1 {
  schemaVersion: 1;
  totalBrushStamps: number;                 // Monotonic integer >= 0; NEVER decremented
  fluorideCrystals: number;                 // Non-negative integer >= 0
  dailySlotsByDate: Record<string, number>; // Local 'YYYY-MM-DD' -> rewarded count (0..2)
  pendingSupplyBeacons: number;             // 0..4 air-dropped into next Arcade run
  remineralizedOverdriveRuns: number;       // Remaining buffed Arcade runs >= 0
  unlockedUpgrades: string[];               // e.g. ['angled_bass_bristles']
  equippedBrushUpgrade: string | null;
  qualityPreference: 'auto' | 'high' | 'balanced';
  worldProgress: Record<string, {
    completed: boolean;
    bestCleanlinessPct: number;
    citizensRescuedMax: number;
  }>;
}
```
- **Local Date Key:** Computed via local calendar components (`getFullYear()`, `getMonth() + 1`, `getDate()`), never UTC `.toISOString()`, so evening brushing never rolls into tomorrow's date in western timezones. Prunes `dailySlotsByDate` keys older than 30 days on save to keep payload tiny while `totalBrushStamps` persists forever.
- **Mirror Sync Code:** `ML1:<base64url(JSON)>` with strict runtime type/range validation on import (`schemaVersion === 1`, finite non-negative integers, clamped fields) so malformed strings return a friendly UI error toast without mutating live state.

#### 4. Clock & Background-Tab Safety (`ClockController.ts`)
- **Arcade Tick:** `FIXED_DT = 1 / 60`. `frameDelta = Math.min((now - lastNow) / 1000, 0.1)` prevents physics explosion after tab switch.
- **Brush-Along Expedition Timer:** Tracks `elapsedActiveMs` using `performance.now()` deltas while `document.visibilityState === 'visible'` and unpaused (auto-pauses cleanly with a *"Tap to Resume Brushing"* banner if the phone locks or tab hides; requests `navigator.wakeLock?.request('screen')` inside `try/catch` when supported).

---

## §7. Verification & Phase 1 Build Gate

1. **Automated Unit Suite (`npx vitest run`):**
   - `plaqueGrid.test.ts`: Verifies binary cleanliness (`density <= 0.10`), moving vs stationary Toothbrush multiplier, `INTERDENTAL` immunity to Toothbrush, Floss Pick segment clearing, Mouthwash `0.35` threshold split + `FLUORIDE_SEALED` reduction, and `angled_bass_bristles` bonus on `MARGIN_FISSURE` cells.
   - `habitBank.test.ts`: Verifies `totalBrushStamps` and unlocks suffer zero loss across simulated 1-day, 14-day, and 90-day gaps; verifies local `YYYY-MM-DD` 2x/day reward cap + `+5` Crystal 3rd-run tip; verifies `ML1:` Mirror Sync Code export/import and corrupt-payload rejection.
   - `collision.test.ts`: Verifies player/Toothbrush deflection on `< 1.2u` interdental corridors and Floss Pick segment intersection with Biofilm Bridges and Sugar Shards.
   - `arcadeSim.test.ts`: Verifies Citizen rescue triggers at `>= 85%` clean cells in `2.0u` radius and automatic District Remineralization Cascade fires at `>= 90%` district clean + all district Citizens rescued even when `surgeMeter === 0`.
2. **Static & Production Build (`npm run build`):**
   - `tsc --noEmit` passes with zero errors; Vite production bundle builds cleanly.
3. **Interactive Browser & Pacing Smoke Check:**
   - Verify Hub -> Plaque City -> all 3 tools + Disclosing Pulse -> District 1/2/3 completion cascade -> Upgrade unlock -> 2-Minute Brush-Along Overwatch mode + audio chimes + Supply Beacon drop; verify full-run pacing sits comfortably in the `3–6 min` target window via `gameConfig.ts`.
