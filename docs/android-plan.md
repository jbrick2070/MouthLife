# MouthLife on Android, including foldables (plan, 2026-11-19)

The plan for the PC session. Nothing here is built yet. Read `AGENTS.md`, `docs/duo-plan.md` (the
two-screen layouts built for the iPhone Duo) and `docs/widget-plan.md` first. Reviewed by agy
("approve with changes"; its changes are folded in below and marked *agy*).

## 1. The decision

- **Build on the web edition, packaged with Capacitor.** The web edition (`src/`, TypeScript +
  Three.js) already plays the same game with the same rules and the same `ML2:` Sync Codes as the
  iPhone, so a save moves between an iPhone and an Android phone. Capacitor puts the built web
  files inside the Android app: it works offline and nothing leaves the device. A native Kotlin
  rewrite of the SceneKit game would take months and drift from the other two editions; it is not
  planned.
- **Capacitor rather than a Trusted Web Activity:** a TWA needs the game hosted on a website (and
  Digital Asset Links proving ownership), runs from that site, and has no room for native pieces.
  Capacitor bundles the files and lets us add the small native pieces below (back button, screen
  awake, the fold, reminders, widgets).
- **Store: Google Play.** The listing needs a public developer contact email. The owner agreed to
  use their own: **the owner types it into Play Console themselves.** It is never written in the
  repo, in either edition, in commit messages or in prompts to other AIs. The app itself still
  ships with no contact details (`AGENTS.md`: no email, `mailto:` or feedback form).
- **App id:** `org.mouthlife.plaque`, the same as on Apple devices.

## 2. What the owner does (accounts and forms)

**Status (2026-11-19):** the owner's personal Play Console account is created. It is waiting for
the one-time check with a real Android phone (Play Console app, signed in as the account owner;
an emulator does not count). The owner is getting a phone, which also serves as the real test
device below. Phase 1 can be built meanwhile.

1. **A Google Play developer account** (Play Console, personal account): a one-time fee, ID and
   phone checks. The Chrome Web Store developer account is separate and does not cover Play.
2. **A closed test:** new personal accounts need at least 12 testers opted in for 14 days in a
   row before Google reviews the app for production. Testers need an Android phone and a Google
   account.
3. **The listing's forms:**
   - the privacy policy link (`public/privacy.html`, hosted somewhere public, for example GitHub
     Pages for this repository)
   - Data safety: no data collected or shared
   - the content rating questionnaire
   - target audience: children, which puts the app under Google's Families policy (no ads, no
     tracking, no chat: nothing in MouthLife conflicts)
4. **Signing:** Play App Signing, with an upload key that the owner keeps and **backs up off the
   computer** (losing it means asking Google to reset it).

Current rules to re-check on the day (they change): new apps must target Android 16 (API 36);
the 12-tester, 14-day closed test; the Families policy.

## 3. Phase 1: the Android app

On the PC: Node 22, Android Studio with SDK 36, and emulators for a phone (Pixel), foldables
(Pixel Fold, Galaxy Z Fold, open flat and half open) and a tablet.

1. `npm i @capacitor/core @capacitor/android` and `npm i -D @capacitor/cli`; `npx cap init MouthLife
   org.mouthlife.plaque --web-dir dist`; `npx cap add android`. Each build: `npm run build && npx cap
   sync android`, then build and run from Android Studio. Commit the `android/` project.
2. **Settings:** `targetSdk 36`; edge to edge, with `viewport-fit=cover` so the existing
   `env(safe-area-inset-*)` CSS works; dark system bars; any orientation, as in
   `manifest.webmanifest`.
3. **Offline and private:**
   - The files load from the app, so the service worker (`public/sw.js`) is not registered inside
     the app: guard it in `src/main.ts` with `!Capacitor.isNativePlatform()` (the app's
     `https://localhost` origin would otherwise pass the current check). *agy*
   - Remove the merged `INTERNET` permission (`tools:node="remove"`); the app's own files need no
     network. *agy*
   - Charity links open in the phone's browser through an Android `ACTION_VIEW` intent after the
     grown-up gate (`src/ui/parentGate.ts` uses `window.open` today). The privacy page shows inside
     the app; its charity links go behind the gate too (Families policy), and its header names
     Android. *agy*
   - Hide or replace the save-file download (`btn-download-json` in `CompanionHubOverlay.ts`):
     WebView ignores `blob:` downloads. Sync Codes still work. *agy*
   - `android:allowBackup="false"` with data extraction rules, so Android's Auto Backup never copies
     the save off the device; keep Capacitor's scheme and hostname fixed so local storage is never
     orphaned by an update. *agy*
4. **Phone behaviour:**
   - **The voice coach needs a native plugin.** `src/engine/audio/VoiceCoach.ts` uses
     `window.speechSynthesis`, which Android's WebView does not have: wrap Android's
     `TextToSpeech` (ducking the music) in a small plugin, or the hands-free brush ("One" to
     "Four", "Floss", "Rinse", "Done") is silent. *agy*
   - The back button (Android 16's predictive back, `OnBackPressedCallback`) pauses a stage (the
     same pause card as the house button), closes a sheet or How to Play, and pauses a brush rather
     than ending it (today `Escape` in `BrushAlongOverlay.ts` goes Home). *agy*
   - The screen stays awake during a brush with the native `FLAG_KEEP_SCREEN_ON` (the web Wake Lock
     is unreliable in WebView). *agy*
   - Edge to edge: pass the system bar and cutout insets (`WindowInsetsCompat`) into CSS variables
     from the native side; `env(safe-area-inset-*)` alone is unreliable in WebView. *agy*
   - Sound: `mediaPlaybackRequiresUserGesture = false`; suspend the audio when the app goes to the
     background. The ~76 MB of music in `dist/music/` must not be compressed in the APK
     (`noCompress` m4a/mp3/ogg); test streaming and looping from Capacitor's local server early
     (a failure falls back to the synth silently). *agy*
   - Haptics through `navigator.vibrate` or Capacitor Haptics.
   - Performance: the quality ladder (`FPS_UPGRADE_THRESHOLD`, `QUALITY_ROLLING_FRAMES` in
     `src/config/gameConfig.ts`) may promote a 120 Hz phone to the top setting too eagerly; profile
     the CSS `backdrop-filter` blur and multisampling on mid-range Adreno and Mali GPUs. *agy*
5. **Saves:** the web edition's local storage persists in the app; Sync Codes are unchanged.
6. **Checks:** `npx tsc --noEmit`, `npx vitest run`, `npm run build`; the emulators above and one
   real mid-range phone (frame rate in a stage, audio, back button, airplane mode, rotation); the
   Play pre-launch report.

## 4. Phase 2: foldables (the Duo idea on Android)

The same three two-screen layouts as on the iPhone Duo (`docs/duo-plan.md`, "Built: two screens,
not a big iPad"), in the web edition, so they work in the Android app and in any browser on a
foldable:

- **City stage:** the 3D city and the stick on one page; the city map (the scrubber, districts dim
  to mint, a gold check when sealed, Scan's ring), the stage panel (clean %, a card per district,
  timer, multiplier) and Scan, Surge and Floss on the other. Half open: the map lies flat with the
  stick and buttons under it.
- **2-Minute Brush:** the 3D "how" with the timer and every button on one page, the whole mouth
  "where" on the other, taking no touches.
- **Home:** the companion and the sky on one page; the readouts, the five cities and the deck on
  the other.
- **Finales and the ending:** one big screen.

How:

- **The fold, inside the app: a Jetpack WindowManager plugin (required).** The web's Viewport
  Segments and Device Posture APIs report two segments only for a half-open or separating fold; an
  unfolded, flat Pixel Fold or Galaxy Z Fold reports one. So a small Capacitor plugin reads
  `WindowInfoTracker`'s `FoldingFeature` (bounds, orientation, FLAT / HALF_OPENED) and passes the
  fold's rectangle to the page. In a browser on a foldable, the web APIs give the half-open case.
  *agy*
- `MainActivity` handles `screenLayout|smallestScreenSize|orientation|screenSize|density` itself, so
  folding never recreates the activity and the WebGL context; `SceneManager.ts` and
  `InputManager.ts` size and raycast from the canvas's own rectangle, not
  `window.innerWidth/Height`. *agy*
- **Port the native rules as they are:** `DuoSplit` (pages at least 300 pt, a 24 pt clear band
  each side of the fold, the 3D page left or upright, finales whole), `StageMapView` (a 2D canvas
  fitted to the playable boxes, +x to the right and +z downward like the stage camera) and the
  stage panel; give the web edition the whole-mouth brush map it lacks today (native
  `BrushOverviewPanel` and `MouthMap`); one Three.js canvas that is never rebuilt, only resized.
  Reuse the native tests' cases (`DuoSplitTests`).
- **Parity:** the web edition then has layouts the iPad-only brush overview does not; decide whether
  the overview and the city map come to wide screens everywhere.

## 5. Phase 3: Android extras (optional, in this order)

1. **Brush reminders:** local notifications (Capacitor Local Notifications) on the plan already in
   `src/config/brushDays.ts` (the same rules as the iPhone), asking for Android 13's notification
   permission only when a grown-up turns reminders on. Inexact alarms only (Play rejects
   `USE_EXACT_ALARM` here), rescheduled after a restart (`BOOT_COMPLETED`) and beyond the 7 days
   ahead. *agy*
2. **Home Screen widgets:** "Today" and "This week", as on the iPhone (`docs/widget-plan.md`, "v1 as
   built"): Jetpack Glance widgets reading a small JSON snapshot the app writes through a plugin,
   with the same fields and rules as `WidgetSnapshot` (the tooth's face from 5 AM to 5 AM, "Time to
   brush!", "Brush before bed", "Next · Tomorrow 7:30 AM", no "Good try", never "late"). Port the
   rules to Kotlin with the same test cases as `WidgetSnapshotTests`. A tap opens the 2-Minute
   Brush (Today) or Home (This week), from a cold start and from `onNewIntent`. *agy*
   - Glance has no WidgetKit-style timeline: schedule refreshes at midnight, 5 AM, noon and the two
     brush times with WorkManager or inexact alarms, plus time and time-zone change receivers.
   - Glance has no Compose canvas: draw the tooth faces as vector drawables or a bitmap.
   - The web edition keeps the last brush and last full brush times outside the save (as the
     iPhone does), for the snapshot.
3. Wear OS: not planned.

## 6. Gaps against the iPhone today

The web edition has no whole-mouth brush overview, no reminders, no widgets and no watch. Phases 2
and 3 close the first three.

## 7. Risks

- Three.js in Android's WebView on low-end phones: test a mid-range device early; the quality
  setting already exists.
- Viewport Segments support inside the WebView (the plugin is the fallback).
- The Families policy review, and finding 12 testers for 14 days (who actually open the app during
  the test). Start the closed test as soon as Phase 1 works, and build Phases 2 and 3 meanwhile.
- Any native plugin library must be 16 KB page aligned for current Android. *agy*
- Do not lose the upload key.
