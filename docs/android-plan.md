# MouthLife on Android, including foldables (plan, 2026-11-19)

The plan for the PC session. Nothing here is built yet. Read `AGENTS.md`, `docs/duo-plan.md` (the
two-screen layouts built for the iPhone Duo) and `docs/widget-plan.md` first.

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
3. **Offline and private:** the files load from the app, so the service worker (`public/sw.js`) is
   not registered inside the app (detect Capacitor in `src/main.ts`). Take the `INTERNET`
   permission out of the manifest if nothing needs it; the charity links open in the phone's
   browser after the grown-up gate (`src/ui/parentGate.ts`), which needs no permission.
4. **Phone behaviour:**
   - The back button pauses a stage (the same pause card as the house button), closes a sheet or How
     to Play, and never ends a brush by itself.
   - The screen stays awake during a brush (a keep-awake plugin if the web Wake Lock is not
     available in the WebView).
   - Sound starts after the first tap (WebView autoplay rules).
   - Haptics through `navigator.vibrate` or Capacitor Haptics.
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

- **The fold:** the Viewport Segments API (CSS `horizontal-viewport-segments` /
  `vertical-viewport-segments` media queries and `env(viewport-segment-*)`, JS
  `window.viewport.segments`) and the Device Posture API where the browser has them. If Android's
  WebView does not expose them, a small Capacitor plugin reads Jetpack WindowManager's
  `FoldingFeature` (its bounds, orientation and FLAT / HALF_OPENED state) and passes the fold's
  rectangle to the page.
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
   permission only when a grown-up turns reminders on.
2. **Home Screen widgets:** "Today" and "This week", as on the iPhone (`docs/widget-plan.md`, "v1 as
   built"): Jetpack Glance widgets reading a small JSON snapshot the app writes through a plugin,
   with the same fields and rules as `WidgetSnapshot` (the tooth's face from 5 AM to 5 AM, "Time to
   brush!", "Brush before bed", "Next · Tomorrow 7:30 AM", no "Good try", never "late"). Port the
   rules to Kotlin with the same test cases as `WidgetSnapshotTests`. A tap opens the 2-Minute
   Brush.
3. Wear OS: not planned.

## 6. Gaps against the iPhone today

The web edition has no whole-mouth brush overview, no reminders, no widgets and no watch. Phases 2
and 3 close the first three.

## 7. Risks

- Three.js in Android's WebView on low-end phones: test a mid-range device early; the quality
  setting already exists.
- Viewport Segments support inside the WebView (the plugin is the fallback).
- The Families policy review, and finding 12 testers for 14 days.
- Do not lose the upload key.
