You are reviewing a coding and architecture plan for MouthLife, a kids' tooth-brushing game with two editions that must match: a web edition (`src/`, `tests/`; TypeScript, Vite, Three.js) and a native Apple edition (`native-apple/`; Swift, SceneKit, SwiftUI). You are in the repository root.

Read `AGENTS.md`, then `docs/next-steps-plan.md`: the plan for the next five sprints. Check its claims against the code before you rely on them (for example `src/worlds/*.ts`, `native-apple/Sources/MouthLifeCore/Worlds/WorldCartridges.swift`, `src/ui/TelemetryHudOverlay.ts`, `src/ui/hudHelpers.ts`, `native-apple/MouthLifeApp/UI/ArcadeHudView.swift`, `native-apple/Sources/MouthLifeCore/Sim/HudHelpers.swift`, `src/engine/sim/WorldSession.ts`, `native-apple/Sources/MouthLifeCore/Sim/WorldSession.swift`, `scripts/skyline-native.ts`).

Do not change any source file, and do not run builds or tests. The only file you may write is your review:

`kibitz-runs/2026-11-21-next-steps/agy.md`

Write your thoughts there, in plain Markdown, most important point first, under these headings:

1. **Order.** Is the sprint order right? Give the order you would build in, one line of reasoning per sprint. Say what can be built side by side and what must not be (shared files).
2. **Organization.** How should each sprint be cut into commits so that after every commit both editions match and all checks are green?
3. **Architecture, sprint by sprint.** For each sprint: is the design right (the files, the pure functions shared by both editions, where state lives, what runs per frame)? Name a better shape where you see one, with file and function names.
4. **City shapes (sprint 3).** Are the "kept" constraints correct? Is each proposed layout buildable under them? Name anything in the code that would break. Suggest a concrete layout per city (start point, zone cuts, walls, gaps) if you have a better one.
5. **First-city coach (sprint 2).** Is the step list right for a young child? Which existing events and flags should drive each step?
6. **Missing, risky, or too big.** What the plan forgot, what is likely to go wrong, and what to cut or shrink.

House rules every suggestion must respect: Apple-simple (few words, one idea per screen, never block play), non-punitive, nothing leaves the app (no contact details, links or forms), 8 languages, the two editions match, and Sync Codes (`ML2:`) stay compatible.

Cite a file path (and line numbers when you can) for every claim about the code. Keep it under 1,200 words.
