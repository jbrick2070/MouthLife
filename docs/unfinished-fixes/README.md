# Unfinished fixes from the final QA pass (kept, not applied)

On 2026-11-22 the last QA pass sent eight fixers to work in separate copies of the repo. Five
finished and were checked; their work is in `master` (the "Last-pass web fixes" and "Last-pass
native fixes" commits). The session ran out of usage at 01:08 while the three below were still
working, so they stopped partway. **None of them was finished, tested or reviewed.** They are kept
here as patches so nothing is lost and nothing half-done ships.

Each patch is against commit `28579bd` (the code then). `master` has moved on, so expect conflicts.
To pick one up: make a branch, `git apply --3way docs/unfinished-fixes/<name>.patch`, read every
line, finish it, test it, then commit it and delete the patch from this folder.

| Patch | Meant to fix | Notes before reusing |
| :--- | :--- | :--- |
| `web-hub-text-erase-and-translations.patch` (20 files) | Web finding 1: Erase Save behind the grown-up question, clearing the kept save copies, seen flags, How to Play progress, rinse and reminder choices (the native app already has this in Settings). Web finding 16: text glued together from parts stays English in the other seven languages; tooth names in the quiz are translated as parts. Also the privacy page's sentence about where the erase is. | Ran the translation scripts part way. Its tooth left/right change is already in `master` (commit "now on the web too"); drop that hunk. |
| `web-service-worker-offline-update.patch` (2 files) | Web finding 3: after an update, an installed copy of the web game can open to a blank page offline, because the new page is stored before the scripts it names. The fix stores a page only once every script and style it names is cached. Adds `tests/serviceWorker.test.ts`, which loads the real `public/sw.js`. | Every installed copy runs `sw.js`, and a mistake cannot be undone from the page. Check every changed behaviour against today's worker, run the test, and try it offline in a real browser before shipping. |
| `native-stage-lock-play-again.patch` (1 file) | Native finding 7: after a city, "Play again" and "Next city" rebuild the stage on the main thread while SceneKit's render thread may still be reading it, a rare crash. The fix is one lock, held by the rebuild and only tried (never waited on) by the render thread. | A lock mistake here can freeze the app for good. Prove no path deadlocks (no `DispatchQueue.main.sync` or waits inside the locked region, no re-entry on the main thread), then try "Play again" many times on a device. |
