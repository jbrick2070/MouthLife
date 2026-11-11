# MouthLife polish pass 3

The starting point was the dirty working tree over `d4d4a62`. The baseline had 121 tests across 19 files. The pass ended with 123 passing tests, a successful production build, and a clean `git diff --check`.

| Check | Before | After |
| --- | --- | --- |
| Tab from Pause | [Focus stays on Pause](before-keyboard-arcade.png) | [Focus moves to Dye Scan](after-keyboard-arcade.png) |
| Mohs beat at 740×360 | [Specimens hidden by the card](before-mohs-740x360.png) | [Specimens, selection and navigation visible](after-mohs-740x360.png) |
| Globe at 740×360 | [Globe crosses the instruction banner](before-globe-740x360.png) | [Globe fits below the banner](after-globe-740x360.png) |
| Upgrade Lab | [Focus lost after Equip](before-lab-equipped-390x844.png) | [Equipped button keeps focus](after-lab-equipped-390x844.png) |
| Companion treat | [Banners cover crowns](before-companion-treat-390x844.png) | [Treat targets are visible and reachable](after-companion-treat-390x844.png) |
| Report entry at 740×360 | [Next Dive is focused below the scroll pane](before-report-entry-740x360.png) | [The visible heading receives focus](after-report-entry-740x360.png) |
| World 5 during Dye Scan | [Pills overlap Zip](before-world_5-landscape-740x360.png) | [Zip and wayfinders occupy separate space](after-world_5-landscape-740x360.png) |

Chrome 156 ran headless on Windows through Playwright with ANGLE Direct3D 11 on the NVIDIA GeForce RTX 5080 Laptop GPU. CDP dispatched simultaneous touch contacts through Chrome's input pipeline. It also changed the emulated device orientation and applied deuteranopia, protanopia and achromatopsia. Physical touch hardware and assistive technology were outside this run.

The arcade stress check loaded each cartridge through `window.__MOUTHLIFE_DEBUG__.launchStage`, sampled every frame through the dive, then positioned the probe at an alley mouth. It enabled held scrub and foam, Dye Scan, the rinse wave, a Floss filament, shatter shards, a particle burst, the Zip reticle, an acid pool, a supply beacon and mutans in the same run. In Ultra at 844×390, every cartridge peaked at 24 calls. Dive peaked at 16 for `world_2` and 15 for the other cartridges. Intro peaked at 11 on portrait Mohs. Companion peaked at 3 with treat particles, globe at 5, Brush-Along at 2, and Report at 2.

See [render measurements](measurements.json), [layout checks](layout-checks.json) and [touch and upgrade audio traces](touch-upgrade-checks.json). The upgrade audio trace verifies what the running Web Audio graph received. Listening tests on phone speakers remain open.
