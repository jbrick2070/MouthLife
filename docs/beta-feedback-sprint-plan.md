# MouthLife: after the first outside beta test, for every edition (plan, 2026-11-28)

**Status (28 November):** Sprints 1 to 4 and 6 are done; Sprint 5 is done except the steps only
the owner can take (see "What is left" at the end). Written on top of `master` at `ff5c540` (build 4: the
iPhone, iPad, Watch, widgets and Mac apps, 166 native tests, 701 web tests, CI green). The owner
asked for one plan that carries what the first outside tester found to the Mac app, the browser
edition and the Android (Google Play) app, and that checks the camera moves and angles are alike
in all of them. Rules that hold throughout: `AGENTS.md` (both editions match, nothing leaves the
app, non-punitive, for kids and grown-ups, 8 languages).

## What the test told us (in our own words)

One paid tester, iPhone 12 Pro, iOS 26.5, TestFlight build 3, then build 4. Report and follow-up
answers, 27 and 28 November 2026.

- **The app stopped answering about three times** on build 3, while playing. The music went on.
  They waited until the phone locked itself; after reopening, the app worked again without a
  restart. They cannot say which screen. A long session on build 4 showed no freeze.
- **Everything they tried worked:** the first-launch cards, the Health question before the timer,
  "Not now" and the red heart that offers it again, the full 2 minutes, Start Flossing, the early
  two-tap "Floss ›", lock and resume, the brush in the Health app, all five cities (one with a
  perfect 10,000), all eight languages. No text was unclear.
- **They expected Skip on floss to go to the rinse.** It went Home. That is right: the rinse is
  off until a grown-up turns it on in Settings.
- **Never tried:** the Home Screen widget (they did not know what that was), the rinse card, Hub
  on the "Ready to floss?" card, the voice coach switch, reminders, How to Play. Nothing on a Mac,
  in a browser or on Android.
- **Their one piece of advice:** do not lose a brush the app never got to finish.

## What build 4 already changed (iPhone, iPad, Mac)

Built on 27 November, in `ff5c540`; `AGENTS.md` section 12 has the rules.

| Change | iPhone / iPad | Mac | Browser | Android |
|---|---|---|---|---|
| An interrupted brush is kept (`BrushCheckpoint`) | yes | yes | **no** | **no** |
| Sound engine no longer restarted every frame when it cannot start | yes | yes | not needed (1) | not needed (1) |
| Stage input behind one lock; mounting a stage cannot overlap its frame | yes | yes | not needed (2) | not needed (2) |
| Automatic picture quality | by heat and Low Power Mode | same, but anti-aliasing stays at 4x | already has its own (3) | same as browser |
| Test diary, watchdog, "Share test diary" | test builds | **development builds only** | **no** | **no** |

1. The browser plays through Web Audio; waking a suspended context does not block the page
   (`SoundEngine.ts:197-268`, `:904-913`).
2. A page has one thread; there is no render thread to race with.
3. `src/engine/render/qualityGovernor.ts` steps by measured frame rate, with the two November
   safeguards (Low Power Mode's 30 frames a second, and a level that proved too slow).

## What the code says today (checked)

- **The freeze has three explanations that fit. One is fixed, one is a gap we can see, one is
  unproven.** Codex and Antigravity each traced them on 28 November; their claims below were
  checked against the code. Both judge the first the best fit.
  1. *The main thread was stalled* by the sound engine being restarted on every frame. Fixed in
     build 4. The music is played by separate players (`NativeSoundEngine.swift`,
     `SunoStreamDeck`), so it would go on. It fits best: the tester describes the whole app not
     answering, and build 4 has not frozen.
  2. *A stage that starts paused, with no pause card.* The stage's pause has exactly one writer:
     the pause card's dimmer appearing and going (`ArcadeHudView.swift:188-193`, through
     `AppCoordinator.setArcadePaused`). Starting a stage, leaving one and mounting one never set
     it back. If the dimmer's "going" is ever missed while leaving a paused stage, the next
     stage draws and plays its music but does not move or take input, until a lock opens the
     pause card and Resume clears it. **The gap is real; whether it has ever happened is not
     known.**
  3. *Touches stopped counting.* The 3D view lets one finger drive the scene and ignores any new
     touch while that finger is "still down", and it keeps hold of the system's touch object to
     know (`MouthLife3DViewport.swift:62-108`). No sequence was found that leaves the finger
     marked as down (a second finger, a HUD control, a system gesture and a covered view all end
     or cancel it), and the HUD's buttons would still work if it did. But Apple says not to keep
     that object, and the view does not let go by itself when the app stops being active.
  - All three are cleared by a lock (leaving the screen opens the pause card, which resets held
    input: `ArcadeHudView.swift:242-244`), which is why the tester's "it worked again after
    reopening" does not choose between them. Build 4's diary shows the first (HANG lines);
    nothing yet writes a line for the other two.
  - On the Mac a lost mouse-up (a drag that ends in Mission Control, or under a finale) leaves
    the brush scrubbing until the next click (`MouthLife3DViewport.swift:160-191`).
- **The browser edition keeps nothing of a brush until it is finished.** No note on a Start card,
  none mid-brush (`BrushAlongOverlay.ts`: `completeSession` at `:645` is the only place a brush
  is paid; `visibilityHandler` at `:190` only checks the Start card's wait; "Leaving while
  brushing saves nothing", `:332`). The native app keeps both. On Android the system ends a
  backgrounded app often, so this matters most there.
- **The browser's finger rule lets go** on `pointercancel`, `lostpointercapture` and when the
  window loses focus (`InputManager.ts:258-269`, `:402-404`). Gaps, all seen in the code:
  losing focus clears steering but not the finger that turns the view (`orbitPointerId`, `:399`
  is its only release); the Floss ring's finger is released only by its own "lifted" handler,
  and taking hold of it is unguarded (`TelemetryHudOverlay.ts:866-881`); pausing, changing
  screen and the Android app going to the background (`main.ts:1116`) clear none of them. A
  page that is only hidden may get neither a cancel nor a loss of focus. Not tried on a phone.
- **The cameras were written twice, and only the finale's is checked.** The finale camera is one
  set of numbers with a checksum both editions test (`Finale3D`). The rest is separate code:
  the app in `MouthLifeSceneController.computeCameraTargets` and
  `ProceduralMeshBuilder.updatePacerCoaching`, the browser in `SceneManager.ts` and
  `brushCamera.ts` (which has its own tests, `tests/brushCamera.test.ts`; the app has none).
  Differences found so far:

  | | App | Browser |
  |---|---|---|
  | Home: how far a finger tilts the view | 0.18 to 0.82, resting 0.34 | 0.18 to 1.05, resting 0.42 |
  | Home: how far a finger turns it | 0.85 either way | no limit |
  | 2-Min Brush: finger turn / tilt | 0.85 / 0.45 | 1.25 / 0.85 |
  | 2-Min Brush: how fast the camera follows | 6.8 | 5.6 (2.4 under Reduce Motion) |
  | Other screens: how fast it follows | 7.5 | 6.5 |
  | Arrival: how far it turns | 0.75 | 0.75 |

  The brushing and flossing moves themselves (which way the camera swings for each quadrant
  and surface, the zoom-in at the start of each, each stop along the floss) were reworked in
  both editions in `b05897b` and have not been compared number for number. The browser works
  them out in one tested function (`brushCamera.ts`: `brushCameraAim`, `quadrantIntroZoom01`,
  `flossArchIntroZoom01`, `computeDetailedBrushCamera`); the app works them out inside the
  model builder (`ProceduralMeshBuilder.updatePacerCoaching`), untested.
- **Installed web apps only update when the cache name changes** (`public/sw.js:3`,
  `mouthlife-shell-v3`). Every push to `master` publishes the browser edition
  (`.github/workflows/deploy-pages.yml`).
- **Android is at `versionCode 1`, `versionName "1.0"`** (`android/app/build.gradle`), built from
  the browser edition with Capacitor, running on the owner's Pixel 8a, not yet in a Play test
  (`docs/android-plan.md`). The other editions say 1.0.0.

## The sprints

Each sprint ends with both test suites and the Release builds green, and its own commit.
Sprint 1 comes first: it holds the one gap we can see.

### Sprint 0: read what build 4 says (no code)

1. Xcode, Organizer, Crashes and Hangs, builds 3 and 4.
2. If a freeze happens on build 4: Settings, "Share test diary", and read it here.
3. A second tester through the same public link, for a quick pass on build 4.

*Done when:* we can say which explanation it was, or that it has not come back.

### Sprint 1: input that stops counting (every edition): done

The hard one. Codex and Antigravity both traced it first; no cause is certain, so the sprint
closes every door found open and makes the next freeze say what it was.

1. **One pause state for a stage.** Set where the pause card is opened and closed, not by a
   view appearing; and always off when a stage is mounted or left. A test starts a stage after a
   paused one.
2. **The owning finger, without holding the system's touch object.** Remember which finger it
   is; when a new touch begins, the owner counts only if it is still among the touches on the
   screen. Not a time limit: a finger resting still on a tooth sends nothing and must keep
   working.
3. **Let go when the app stops being active,** when the 3D view leaves its window and when a
   finale covers it: the finger on iPhone and iPad, the held mouse button on the Mac.
4. **Diary lines, each at most once per stage:** a new touch on the tooth refused because
   another is held (with that finger's state and age); the stage's pause going on and off; the
   sound engine about to start. With the HANG lines these tell the three explanations apart.
5. **Browser and Android:** one "let go of everything" (steering, turning the view, Floss,
   Surge, Scan, the pads), called when the page is hidden, the window loses focus, the stage is
   paused, the screen changes and the Android app goes to the background; taking hold of the
   Floss ring guarded. A test: finger down, page hidden with no cancel, next finger down works.
   Then on the Pixel 8a: hold a drag, go to the home screen, come back; nothing is still held.
6. The rule "which finger owns the scene" as plain data in `MouthLifeCore` with a test for each
   sequence above, and the browser's twin with the same cases.

*Done when:* the tests cover each sequence, twenty minutes of play writes none of the new diary
lines by mistake, the Pixel check passes, and both editions still play the same.

*Built (28 November):* all six steps; 177 native tests, 730 web tests, both Release builds.
The Pixel 8a check passed the same day (see Sprint 2).
Reviewed by Sonnet; its six findings fixed (the refused-touch line is now once per stage; a HUD
built anew says "not paused"; letting go tells the scene only when something was held; no new
owner under a finale on iPhone). The paused-then-new-stage check is a reading of the code, not a
running test (the coordinator has no test target). Found, not fixed: the browser's first city trips its own development warning,
33 draw calls against a budget of 25 (`SceneManager.ts:850`); it predates this sprint.

### Sprint 2: an interrupted brush is kept, in the browser and on Android: done

1. `src/config/brushCheckpoint.ts`, the twin of `BrushCheckpoint.swift`: the same 20 s and 10 s,
   the same "full only within the grace" rule, the same test cases on both sides.
2. The note itself, under the native app's name (`mouthlife.pacer.pendingBrush`): written every
   10 s while brushing, on Pause, and when the page is hidden or closed (`visibilitychange`,
   `pagehide`). Also written when a Start card comes up, which the browser lacks today.
3. Paid quietly at the next start, before Home shows; cleared when the brush finishes, when a
   new one starts and by Erase Save.
4. On the Pixel 8a: brush 30 seconds, swipe the app away, reopen. The brush is there as a
   "good try". Then the same on a Start card.
5. **Home in the middle of brushing gets kind words** (decision 1), in every edition: after 20
   seconds of brushing it is a "good try", with the words the early "Floss ›" already earns
   ("Good try! ... Brush the whole 2 minutes to earn a Habit Stamp."); under 20 seconds, nothing,
   as now. No new text to translate.
6. **A hint on the floss card** (decision 4), in every edition and on the watch if its card has
   room: while the rinse is off, one short line under Skip saying a grown-up can turn the rinse
   on in Settings. New text: all eight languages, through `npm run i18n:extract` and
   `scripts/i18n-native.mjs`.

7. **Uninstalling asks before it deletes the save** (the owner, 28 November: follow Android's
   standards and what the person means). Backups stay off, so the save never leaves the phone;
   the manifest's `hasFragileUserData` makes Android's own uninstall dialog offer "Keep app
   data" (Android 10 and later). Check on the Pixel: uninstall from Settings, the dialog asks.

*Done when:* the shared test cases pass on both sides, no path pays a brush twice, and the two
checks on the phone pass.

*Built (28 November):* steps 1 to 7, with Codex's design review folded in: one settlement path,
a browser lock held for the length of a brush (so a second tab never pays a brush that is still
running), and a list of paid brushes so none is paid twice. The watch's End under 20 seconds now
keeps nothing, like Home on the phone. 178 native tests, 766 web tests, both Release builds.
Reviewed by Sonnet; fixed: starting a brush or leaving under 20 seconds no longer erases another
tab's note, and a brush finished on an older copy of the page that cannot save keeps its note.
Checked on the Pixel 8a (28 November, with Sprint 1): killed 35 seconds into a brush, reopened,
paid as a "good try"; the uninstall dialog offers "Keep app data"; a finger held while leaving the
app leaves nothing held after Resume, and a new touch steers.

### Sprint 3: the camera, alike in every edition: done

Every camera, on every screen, and above all the whole of brushing and flossing: that is where
the camera moves most and where the two editions were last changed separately.

1. **The table, finished.** Screen by screen (arrival, Home, the 2-Min Brush, floss, the rinse,
   a city upright and sideways, the score, the finale): where the camera stands, where it looks,
   how wide, how fast it follows, how far a finger moves it. Read from both editions, with a
   picture pair of each from the same moment (the app's launch arguments and the browser's
   `scripts/guide-shots`).
2. **Brushing and flossing, moment by moment,** each as a row with a picture pair:
   - brushing: all 12 steps (4 quadrants, each outside, chewing and inside), the zoom-in as each
     quadrant starts, and the last three seconds of a step;
   - flossing: the upper arch, then the lower, every stop along the way, the zoom-in at the
     start of each arch, with the pick and with string;
   - the rinse: each swish step, and the tilt when the phone is held;
   - on every one of those: a finger turning the view and letting go (how far, and how it eases
     back), Pause, a Start card, and Reduce Motion.
3. **The app is the reference.** The owner, 28 November: the iPhone's camera "was working
   great", the Android one was updated to follow it and "may be pretty close", the iPhone "may
   be the better of the two, take your pick". So where a pair differs the browser follows the
   app. A browser value is kept only where its picture is plainly the better one, and the table
   says so.
4. **The brushing, flossing and rinse camera as a twin:** the app's moves lifted out of the
   model builder into `BrushCamera.swift` in `MouthLifeCore` without changing them, then
   `brushCamera.ts` brought to the same numbers, with the same test cases on both sides for
   every row of step 2, as the finale camera has.
5. **Home and the brush screen:** one set of finger limits, resting angles and follow speeds.
6. What must not change: screen-left is the patient's left (`AGENTS.md` 2.2), Reduce Motion
   fades and never flies, the stage camera never turns.
7. Android shows the browser's camera: check the pairs on the Pixel 8a and on a foldable, open
   and half open (`docs/duo-plan.md`).

*Done when:* the table has no difference nobody chose, the shared cases pass on both sides, and
the picture pairs match.

*Built (28 November):* `BrushCamera.swift` in `MouthLifeCore` and its twin `brushCamera.ts` hold
every camera's numbers (brushing, floss, rinse, Home, arrival, stage, score, field of view, follow
speeds, finger limits), with the same test cases on both sides, including the mirror rule. The
browser follows the app everywhere except the extras kept (the dive into a city, the stage's
shake, double-tap to recentre, its own framing around its panels); the app follows the browser
under Reduce Motion (straight on, slow) and stands still on Pause and Start cards. The score
screen in the browser now shows the city, as the app does, so its line about rubbing the teeth
is gone. Reviewed by Sonnet; fixed: the dive now ends exactly on the stage camera, the native
camera holds the moment Pause or a Start card comes up, and two tests that compared a value with
itself now test the hold. 199 native tests, 781 web tests, both Release builds. Not done: the
picture pairs. The camera numbers are checked by tests and, in the browser, by reading them back
from the running page; how the new framing looks (the score screen, Home further back, a
foldable at aspect 0.9) still wants a look on real screens. Left for the owner: the floss camera
swings back and forth at the middle three stops, in both editions.

### Sprint 4: see what a test build was doing, on every platform: done

The owner wants the editions alike here too (decision 2). Test builds only, everywhere: that is
the usual practice and what the privacy page promises. (Apple Health is the one thing only the
iPhone, iPad and Mac have; a diary line about it means nothing elsewhere.)

1. Mac: the test diary in TestFlight builds, once there is a sure way to tell a Mac TestFlight
   build from an App Store one.
2. Browser and Android: a diary twin kept in the page's own storage, only in a build made as a
   test build, with "Share test diary" in Settings. The public page and the Play release keep
   nothing; `tests/privacyNotice.test.ts` and the privacy page stay true.

*Done when:* a test build on each platform can hand over its diary, and a release build of each
has no diary code path that runs.

*Built (28 November):* designed with Antigravity's review. The Mac decides "test build" from its own
code signature, offline and at once (asking the App Store at launch can show a sign-in sheet); the
TestFlight marker it looks for is unverified until a TestFlight Mac build shows "Share test diary"
and an App Store one does not. MetricKit and the "ended on screen" mark now run on the Mac too.
The browser and Android keep the same diary (`src/engine/diagnostics/testDiary.ts`) only in a
build made with `npm run build:test`; the public page and a Play release carry no diary code (the
release bundle holds only the key prefix Erase Save uses to remove a diary an earlier test build
left on the same device). Android shares it through its own share sheet (a new `shareText` on the
app's plugin), falling back to the clipboard; a browser uses its share sheet, the clipboard or a
download. `npm run android:sync` refuses to copy a test build into the Android app (and
`android:sync:test` a release), since both builds write `dist/`. Reviewed by Sonnet; fixed: the
Android share can no longer crash the app or leave its button stuck, quoted text in error
messages is left out, a long session still notes a new error after its first twenty, and Erase
Save on screen marks the run again. 199 native tests, 799 web tests, both Release builds, the
Android code compiles. Known limit: in a browser with two tabs of the game open, the "ended on
screen" mark can be wrong (one key for the whole site); the Android app has one page.

### Sprint 5: put it on every edition: done, except the owner's steps

1. **Apple:** build 5 for the app, the watch app and the widgets; archive and upload the iPhone
   and Mac builds; add the iPhone build to "Friends and Family" with its "What to Test" note.
2. **Browser:** `mouthlife-shell-v4` in `public/sw.js`, then the push to `master` publishes it.
3. **Android:** `npm run build:test && npm run android:sync:test` for the Play closed test (it keeps
   the test diary), `npm run build && npm run android:sync` for a release (the sync refuses a test
   build), `versionCode 2`, the name left at "1.0"
   (decision 3), a signed bundle from Android Studio. The owner uploads it: the upload key, the listing forms
   and the 12 testers for 14 days are theirs (`docs/android-plan.md`).

*Done when:* TestFlight shows build 5 as Testing, the published page reports the new cache name,
and the Pixel 8a runs versionCode 2.

*Done (28 November):* build 5 committed and pushed (`9ffe73d`), which published the browser edition
with the cache renamed `mouthlife-shell-v4`. iPhone build 5 archived and uploaded to App Store
Connect; the Mac build 5 archived (its upload is retried after a dropped connection). The Android
test build (`npm run build:test && npm run android:sync:test`, versionCode 2) runs on the Pixel
8a, where "Share test diary" opens Android's share sheet with the diary.

### Sprint 6: the next test round: brief done

1. `docs/tester-brief.md`: the checks the first tester never reached, each with how to do it
   (adding the widget step by step, the rinse switch in Settings, Hub on the floss card, the
   voice coach, reminders, How to Play), and "Share test diary" after any freeze.
2. One tester each for the iPhone again, a Mac, a browser on a phone, and an Android phone.

*Done when:* every line of the brief has a pass, a fail or a "could not try" beside it.

*Written (28 November):* `docs/tester-brief.md`, checked against what was built: every edition,
how to get each, the checks the first tester never reached (the widgets step by step, the rinse,
Hub on the floss card, the voice coach, reminders, How to Play, the watch), the new build-5
checks, and where each edition keeps its test diary. The round itself waits for testers.

## How we work

- One design second opinion per topic before it is built (Opus, Codex or Antigravity); both
  Codex and Antigravity on a hard one (done for Sprint 1's tracing). Sonnet reads the finished
  code before a commit.
- Claims from another model are checked against the code before they change the plan.
- Before each commit, from `AGENTS.md` section 3: `swift test`, `npx vitest run`, and the iOS and
  macOS Release builds. On this Mac the Apple commands need
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.

## Decisions (the owner's answers, 28 November)

1. **Home in the middle of brushing:** "say something encouraging". So after 20 seconds it is a
   "good try" with its kind words, in every edition (Sprint 2, step 5).
2. **The test diary:** on every platform, for parity (Sprint 4). Test builds only.
3. **Version names:** "when we release it's 1.0; we aren't ready yet". No name changes now: only
   build numbers go up for test builds (Apple build 5, Android `versionCode 2`).
4. **Skip on floss goes Home when the rinse is off:** add a hint (Sprint 2, step 6).
5. **The camera:** the app is the reference; whoever builds Sprint 3 picks case by case. The
   full comparison (28 November) found 40 differences. The brushing and flossing angles already
   match number for number; the browser stands further back, lets a finger turn the view
   further, circles the wrong thing on the score screen and glides between screens. Picks: the
   browser follows the app almost everywhere. Kept from the browser: the dive from the Earth into
   a city, the stage's shake, double-tap to recentre, and its own framing around its panels. The
   app follows the browser in two places, both rules in `AGENTS.md`: under Reduce Motion the
   brushing camera stays straight on instead of swinging, and on Pause or a Start card it stands
   still. Left for the owner: the floss camera swings back and forth at the middle three stops,
   in both editions.
6. **After the sprints:** one more short test round before any store release. Android needs its
   12 testers for 14 days in any case. The browser edition publishes itself on every push.

## What is left (the owner's steps, 28 November)

1. **TestFlight:** add iPhone build 5 to "Friends and Family" with its "What to Test" note (needs
   App Store Connect signed in; Claude can do it once it is). Decide whether Mac testers get the
   Mac build (it is in the internal "Team" group only).
2. **Google Play:** sign the Android bundle with the upload key in Android Studio, set up the
   closed test (12 testers, 14 days), and upload the test build (`android/` holds it now). For a
   release later: `npm run build && npm run android:sync`, a fresh versionCode, a new signed
   bundle.
3. **Look at the new camera** on real screens: the browser's score screen and Home, and a
   foldable at about aspect 0.9.
4. **Decide the floss camera's back-and-forth** at the middle three stops (both editions).
5. **The Mac test diary's TestFlight check:** once a Mac TestFlight build is installed, "Share test
   diary" should show in its Settings (and not in an App Store build).
6. **Find testers** for the next round (`docs/tester-brief.md`).
