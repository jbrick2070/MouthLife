# Round 3 Judgment Log (Driver: Antigravity UI)

## Lane Status
- **Driver Anchor (`driver_anchor.md`):** Written prior to fan-out.
- **Claude Code (`claude.md`):** OK (`rc=0`, `sonnet` / `high`).
- **Codex:** Skipped via `--only claude` due to confirmed R1 ChatGPT usage-limit hold (`codex_quota_hold.md`) and explicit user instruction.

## Grounding & Synthesis Decisions

### Accepted Wiring & Integration Fixes (CONFIRMED against `r3/input.md`)
1. **Per-cell spatial `pH` sampling in `OralSurfaceGrid.applyBrush()`** (Anchor SHOULD-FIX #1 + Claude MUST-FIX #1 — **CONFIRMED**): Removed scalar `localPh` from `BrushApplyParams`; `applyBrush(params, chemistry)` now queries `chemistry.getCellPh(idx)` for every touched cell against `cellIsFluorideSealed ? 4.5 : 5.5`.
2. **Simplify browser persistence to single synchronous `localStorage` primary + `saveRevision` + cross-tab `storage` listener + `ML2:` / JSON export** (Anchor MUST-FIX #1 + Claude MUST-FIX #2, SHOULD-FIX #6 & CUT #1 — **CONFIRMED**): Cut redundant async `IndexedDB` dual-primary store (`MouthLifeSaveV2` is `< 4 KB`), completely eliminating async boot races, tab-close stale reads, and first-frame quality-tier flicker while keeping `saveRevision: number`, in-memory fallback, `ML2:` Base64URL Sync Code, and `.mouthlife.json` backup.
3. **Single authoritative constant module (`src/config/gameConfig.ts`) vs pure-type `src/engine/types.ts`** (Claude MUST-FIX #3 & SHOULD-FIX #7 — **CONFIRMED**): Moved all `export const` values exclusively to `src/config/gameConfig.ts`; kept `src/engine/types.ts` strictly runtime-free type/interface declarations.
4. **Declarative `WorldCartridge.bChannelMode` discriminator & derived `DataTexture` dimensions** (Claude MUST-FIX #4 & SHOULD-FIX #8 — **CONFIRMED**): Added `bChannelMode: 'marginDensity' | 'gumIrritation' | 'localPh' | 'epsArmor'` on `WorldCartridge` (mirrored to shader uniform `uBChannelMode`) and derived grid/texture size as `(worldWidth / CELL_SIZE) x (worldDepth / CELL_SIZE)`.
5. **Single-source generation of `InterdentalAlley` collision AABBs and `CellFlag.INTERDENTAL`** (Claude MUST-FIX #5 — **CONFIRMED**): `WorldCartridge` specifies `interdentalAlleys[]` once; `CollisionSystem.buildAlleyWalls(cartridge)` and `OralSurfaceGrid.bakeFromCartridge(cartridge)` both derive corridor AABBs and `INTERDENTAL` cell flags from `interdentalAlleys[]`.
6. **Bounded *Powers of Ten* frustum + transition input gating** (Anchor MUST-FIX #2 — **CONFIRMED**): Locked single camera frustum (`near = 0.5, far = 320`), placed `earthGroup` at `(32, 110, 16)` above `archGroup`, gated `InputManager` while `CameraRig.isTransitioning`, and swapped group visibility at `t = 0.55`.
7. **Deterministic bootstrap sequence, `AppEventMap` table, `OverlayView.dispose()` contract, and non-punitive Beacon/Overdrive consumption** (Anchor MUST-FIX #3, #4, SHOULD-FIX #2 + Claude MUST-FIX #6, #7, SHOULD-FIX #1, #2, #3, #4, #5 — **CONFIRMED**):
   - Added explicit 7-step synchronous boot sequence in `main.ts` (registries -> `SaveSystem.load()` -> `SceneManager` -> pre-allocated `MAX_PARTICLES_ULTRA` instanced buffers & dummy textures -> `renderer.compile()` -> `AppMode` mount -> `ClockController` start; plus `renderer.compile()` re-run on `webglcontextrestored`).
   - Added canonical `AppEventMap` table and `OverlayView` teardown rule.
   - Specified per-pickup decrement for `pendingSupplyBeacons` and `mission:complete`-only decrement for `remineralizedOverdriveRuns`.
   - Specified that both `simClock` and `pacerClock` pause on `document.visibilityState === 'hidden'` (preventing background-tab pacer bypass).
   - Trimmed `CameoRegistry` to a lean static `ADVISOR_PROFILES` constant table (`DR-7 PERI`) per Claude CUT #2.

### User-Directed Mobile, Historical & Cozy Idle Synthesis (Lead Driver Authority)
8. **Mobile-First Portrait PWA (`manifest.webmanifest` + Responsive Portrait FOV + Safe-Area Thumb Deck)**: Promoted mobile portrait (`9:19.5` one-handed thumb ergonomics) to primary layout alongside desktop widescreen expansion.
9. **Real Global Cities + Verified Dental History Field Notes + Vibrant Sensory Graphics**: Grounded all 5 campaign cities in real milestones of oral science (*1498 Beijing & 1683 Delft / Toronto*, *1819 Parmly & 1948 Bass in New Orleans*, *1940 Stephan in Chicago/Tokyo*, *1901 McKay/Dean Fluoride in Colorado Springs & Miswak in Accra*, *1973 NASA Skylab / Houston Orbit*), paired with vibrant glassy-smooth pearlescent shaders, breezy flossed airflow ribbons, and crystalline chime audio.
10. **Tamagotchi + Cozy Idle "Smooth Bask" Companion (`CompanionArchSim.ts` — Avoid the Dreaded Root Canal with Zero Offline Decay)**: Added a deterministic pocket Living Arch state machine (`smoothnessIndex`, `enamelShield`, `dentinShield`, `pulpIntegrity`) where freshly brushed/flossed/rinsed teeth enter **Smooth Bask** (passively crystallizing `+6 Fluoride Ions/hr` up to `72` cap), feeding regional meals creates fun active cleanup sessions before decay reaches the *Dreaded Root Canal* (triggering a playable *Emergency Pulp Rescue* rather than permadeath), and >18h offline automatically enters **Saliva Stasis** so real-life missed days never cause offline damage.
