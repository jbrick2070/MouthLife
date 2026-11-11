ROUND 4 ANCHOR REVIEW (Driver: Antigravity UI)
Target: kibitz-runs/2026-11-10-plaque-city-gdd/r4/input.md

VERDICT: yes-with-fixes — Architecture, wiring, mobile-first layout, and historical/biophysical worlds are tightly aligned; three R3-introduced numeric/edge-case ambiguities in `CompanionArchSim` and `PULP_RESCUE` plus an explicit Verify-at-Build checklist remain to lock convergence.

MUST-FIX BEFORE BUILD:
1. [§2.1, §6.4 item 4] Offline `smoothnessIndex` decay vs `72 Ions / 12h` Smooth Bask accrual conflict (CONFIRMED against r4/input.md): §2.1 states Idle Ions accrue at `+6/hr` "whenever `smoothnessIndex >= 85`" up to `72 Ions / 12h`, while also stating offline time settles `smoothnessIndex` to `45` over `18h`. Under uniform linear decay (`100 -> 45` in `18h` = `-3.06/hr`), `smoothnessIndex` drops below `85` after `4.9h`, making `72 Ions` unreachable from a `12h` rest. Fix: Define deterministic two-slope offline curve in `CompanionArchSim`: `smoothnessIndex` cools gently at `-1.25/hr` during the first `12h` (`100 -> 85`, preserving the full `12h * 6 = 72 Ion` Fluorapatite Bask window) and `-6.67/hr` across hours `12..18` down to the `45` *Saliva Stasis* floor.
2. [§2.1, §6.2, §6.4 item 2] Incomplete numeric rules for Regional Treat shield cascade and `PULP_RESCUE` timeout outcome (CONFIRMED against r4/input.md): R3 added Regional Treats reducing `smoothnessIndex -= 35` and cascading `enamelShield -> dentinShield -> pulpIntegrity -> 90s Pulp Rescue Scramble`, without specifying the exact shield damage per treat or what happens if the `90s` rescue timer expires (which could violate §1.1.2 Zero-Punishment if treated as failure/loss). Fix: Specify exact deterministic treat step (each treat sets `smoothnessIndex = Math.max(0, prev - 35)` and applies `45` acid-load points cascading through `enamelShield`, `dentinShield`, then `pulpIntegrity` whenever `smoothnessIndex < 50`, plus a `3-treat/hour` Ion reward cooldown to prevent instant infinite `+20 Ion` spam!) and define `PULP_RESCUE` timeout as a non-punitive **Emergency Calcium-Hydroxide Stabilization** (`pulpIntegrity -> 50`, `enamelShield -> 50`, `0` bonus Ions, zero lost progress), while winning (`>= 85%` clean within `90s` on the `32u x 32u` single-molar rescue cartridge) awards `+40` Rescue Ions and `100%` Smooth Bask.

SHOULD-FIX:
1. [§6.4 item 4, §7.1] Greenfield `MouthLifeSaveV2` naming artifact (CONFIRMED against r4/input.md): Repo has zero existing `src/` code, so naming the initial shipped schema `V2` is an artifact of doc-iteration history. Keep `schemaVersion: 2` only if intentionally reserving `1` for legacy test fixtures, OR explicitly note `v1` fixture shape in `saveAndHabit.test.ts` so the test author knows exact `v1` input fields (`fluorideCrystals` -> `fluorideIons`, missing `companion` hydrated with defaults). Fix: Explicitly document the `v1` legacy test fixture fields in §6.4.4 so `saveAndHabit.test.ts` is 100% unambiguous.
2. [§7] Explicit `VERIFY-AT-BUILD` checklist consolidation (CONFIRMED against r4/input.md): Gather earlier unverifiable runtime checks into a dedicated §7.4 checklist.

OPTIONAL / NICE-TO-HAVE:
- None.

CUT THESE:
- None — plan is lean and build-ready once the two Companion/Pulp-Rescue formulas above are locked.

VERIFY-AT-BUILD CHECKLIST:
1. Confirm installed `three` (`^0.174.0`) WebGL2 shader compilation & `renderer.compile(scene, camera)` behavior both at boot and inside `webglcontextrestored`.
2. Measure `renderer.info.render.calls < 25` across Hub, Plaque City, and Brush-Along Overwatch in both `low` and `ultra` tiers.
3. Playtest World 1 (*Plaque City*) end-to-end completion time against the `3–6 minute` (`parTimeSec = 270s`) target and tune `gameConfig.ts` scrub rates if needed.
4. Verify mobile portrait (`390x844`) safe-area Thumb Deck + Portrait FOV framing alongside desktop (`1280x800`) `WASD`/Mouse raycast alignment on raised molar cusps.
