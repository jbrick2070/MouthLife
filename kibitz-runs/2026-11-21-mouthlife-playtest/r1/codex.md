VERDICT: no — A2 has no diagnosed cause or defined degraded mode, B1 conflicts with the hands-free ritual, and B2 awaits an owner decision and target-age validation.

MUST-FIX BEFORE BUILD:

1. [A2 / What the playtest found] The proposed architecture is attached to an unconfirmed diagnosis. The missing 3D could result from renderer creation, shader compilation, permanent context loss, or something outside WebGL; the video is unavailable. The code confirms only that renderer-creation failure returns early and context loss merely emits events; it does not identify what happened on the Pixel 2 (src/engine/render/SceneManager.ts, src/main.ts). Add a diagnosis gate: obtain the video and exact browser/OS details, reproduce locally, and capture local console/WebGL capability results without telemetry. Do not approve shader- and context-specific work until one failure path is demonstrated.

2. [A2] “Offer what still works” and “decide whether a 2D brushing timer can run” leave the primary fallback undefined. The current no-WebGL path replaces the UI and returns, so none of the Home or Brush-Along navigation remains reachable (src/main.ts). Define before build: supported browser/GPU floor; whether unsupported devices get the complete DOM/audio brushing ritual, a retry path, or only an incompatibility notice; what happens after transient versus permanent context loss; and explicit acceptance criteria for each state. [ASSUMPTION] Verify that BrushAlongOverlay can operate safely without an initialized SceneManager before choosing the 2D-timer option.

3. [B1] The readiness step prepares only a toothbrush, but the stated invariant requires the entire brush → floss → optional rinse ritual to remain hands-free after Start (AGENTS.md). Both implementations proceed automatically into later stages (src/ui/BrushAlongOverlay.ts, native-apple/MouthLifeApp/AppCoordinator.swift). Make the pre-start screen prepare every enabled tool: toothbrush, floss tool, and rinse only when the grown-up-enabled age-6+ preference is on. Keep stage configuration and any permission request before the final Start tap.

4. [B1] The current-state claim is not accurate across editions, and the proposed new state is underspecified. Native already says “time your real 2-minute brush at the sink” in its Prologue (native-apple/MouthLifeApp/UI/CosmicIntroView.swift); both Home buttons already identify a two-minute brush (src/ui/CompanionHubOverlay.ts, native-apple/Sources/MouthLifeCore/Config/BrushCoachSystem.swift); and both current launch paths start the timer immediately rather than showing a “first card” (src/ui/BrushAlongOverlay.ts, native-apple/MouthLifeApp/AppCoordinator.swift). Replace “only line” with edition-specific findings and specify one shared flow: Home label → readiness screen → Start → uninterrupted ritual, including cancel, reminder entry, and return behavior.

5. [B2] The workstream is not actionable while “how far to go” remains an owner question. “Keep the science as an extra (‘Learn more’)” could introduce a new disclosure system across four surfaces, two editions, and eight languages, far beyond a copy audit. Obtain the owner’s decision first, define which terms are mandatory identity versus optional detail, and limit the first pass to named strings proven confusing in a target-age test.

6. [Order and checks] The plan verifies compilation, snapshots, and a later playtest, but defines no outcome that proves the two product problems were solved. Add pre-build acceptance criteria: no overlap at 320 and 360 CSS px in every language; an unsupported-device path that never leaves a blank screen; restored-context behavior; and target-age comprehension of “this times my real brushing” before the clock starts. Run the child-with-parent prototype test before broad B2 translation and native rollout, not only after every push.

SHOULD-FIX:

1. [A2] Separate unsupported WebGL, shader failure, transient context loss, permanent context loss, and low frame rate. They need different messages and recovery behavior. Current context-loss handling pauses only arcade and Pulp Rescue, while Brush-Along behavior is unspecified (src/main.ts). Preserve the eyes-optional audio timer during a brushing graphics failure unless product requirements explicitly say otherwise.

2. [A2] “Start weak devices on the lowest tier” assumes a reliable definition of “weak.” The existing governor starts at medium and changes tier from measured frame rate (src/engine/render/SceneManager.ts). Specify either low-for-all automatic startup or a concrete capability signal; do not leave device classification implicit. [ASSUMPTION] Verify that the low tier actually avoids the reproduced Pixel failure rather than merely reducing load after successful shader compilation.

3. [A1 / Screenshots] A1 requires checks at both 320 and 360 px, but the screenshot checklist names only 360 px and does not mention native. Add 320 px web captures and narrow native-device/Dynamic Type checks in all languages. The native layout is a separate SwiftUI HStack with scaling and two-line limits, not the CSS grid being fixed on web (native-apple/MouthLifeApp/UI/CosmicIntroView.swift).

4. [A1 / B2] Define parity at the data level. Web and native currently store separate Mohs records (src/ui/CosmicIntroOverlay.ts, native-apple/Sources/MouthLifeCore/Config/MohsSpecimens.swift). Specify identical short display labels, full detail labels, accessibility labels, and translation keys; “apply the same naming” is not a checkable acceptance rule.

5. [B2 / Order and checks] Eight-language child readability cannot be established by an English audit plus catalog generation. The repository states that translations are machine-generated and reviewed by another model rather than native speakers (README.md). [ASSUMPTION] Budget review by fluent speakers familiar with child-directed language, or explicitly limit the claim to English readability.

6. [B3] “Note any regression risk” is not a protection mechanism. Name the protected behavior and checks: no changes to steering/input modules, unchanged city-control latency, and existing input/layout tests remaining green (src/engine/InputManager.ts, tests/inputAndLayoutReview.test.ts, tests/pointerSteer.test.ts).

7. [Order and checks] Move A2 diagnosis ahead of B1. A blank first-run experience is a blocker; B1 is a comprehension improvement. A1 can remain first only if the video confirms the proposed cause immediately.

OPTIONAL / NICE-TO-HAVE:

- Add a one-page matrix mapping each observation to evidence, hypothesis, decision, supported editions, and acceptance test.
- Record a short moderated comprehension check before and after the B1 prototype without adding analytics.
- Preserve screenshots of the current Prologue and launch flow as visual baselines.

CUT THESE (scope / over-engineering):

1. [B1] Cut “plus a line in How to Play.” That exact real-teeth instruction already exists in both tutorial sources (src/config/tutorial.ts, native-apple/Sources/MouthLifeCore/Config/TutorialGuide.swift).

2. [B2] Cut the generic “Learn more” subsystem from this round. The Mohs screen already has a compact label plus selected-item detail in both editions; short labels can solve the observed problem without a new navigation pattern (src/ui/CosmicIntroOverlay.ts, native-apple/MouthLifeApp/UI/CosmicIntroView.swift).

3. [A1] Cut native layout remediation until it is reproduced on native. The reported overlap came from the web edition, and native uses a different layout implementation. Keep only the shared short-label/content parity change unless native screenshots fail.

4. [B2] Defer the broad Home, Brush-Along, and first-city rewrite until a 5- to 10-year-old with a parent identifies concrete failures. The current evidence is one non-target-age playtest impression, insufficient to justify rewriting the product voice across two editions and eight languages.

5. [Not chasing now] Remove the adult/electric-toothbrush question from this build plan. The decision rule explicitly excludes reshaping the product for adults, so this item has no effect on the approved work.
