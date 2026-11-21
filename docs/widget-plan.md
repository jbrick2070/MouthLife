# MouthLife widgets: draft plan (for design review)

Status on `master` at `071b3f6`: **MouthLife has no widgets yet.** No WidgetKit extension, no App
Group, no entitlements file. This is the draft for what to build; it is meant to be reviewed
before any code is written. Updated 2026-11-19 with the agy and Codex design reviews, the iPhone
Duo, and the owner's widget strategy for HomeView, iPhone and Android (sections at the end; the
"Owner's strategy" section is the most recent and wins where sections differ).

**Where the widgets go:** every iPhone and iPad (Home Screen, Lock Screen, StandBy on iPhone),
Apple HomeView (small widgets only, confirmed by Apple), and both Home Screens of the iPhone Duo.
One set of widgets for all of them; the Duo needs no widget of its own. Android is a separate,
later decision (see the strategy section).

## Why widgets
- The owner asked for iPhone widgets, and for them to be "good".
- Apple HomeView (on sale 2026-11-13, $299, 7-inch square screen) cannot run MouthLife itself. Its
  only third-party surface is iPhone widgets of the **small** family. Apple's widget guidelines
  (updated 2026-10-13) list HomeView only for the small family: on each household member's own Home
  Screen and on the household's one shared Modular face, where the widget is shown larger, with
  its background removed, and tinted red in low light. So the small widget must work on its own.

## What data a widget can show (already in the app)
- `BrushDays` (`native-apple/Sources/MouthLifeCore/Config/BrushDays.swift`): per day, full 2-minute
  brushes (0-2, the goal per day) and shorter "good try" brushes. `BrushDays.week(...)` gives the
  last 7 days, today last. The app's "This week" strip is `BrushWeekStrip` in
  `native-apple/MouthLifeApp/UI/Sheets/ProfileAndSettingsSheet.swift` (a column of two mint circles
  per day, today outlined).
- Reminder times (morning 07:30, evening 19:30 by default) and the coach language (8 languages).
- Habit Stamps and fluoride (F⁻) are in the save, but are not widget material at first.

## Proposed widgets
1. **Today (small):** two big mint rings for the two brushes of the day (morning, evening), filled
   when done, with one word: "Brush!" before the first brush, nothing scolding afterwards, and a smile
   when both are done. Tap opens the app.
2. **This week (medium):** the same seven columns as the app's strip, today outlined, with a short
   title. Tap opens the app.
3. **Lock Screen:** circular (two dots or a 0-2 gauge), rectangular ("Brushed today 1/2" with the
   dots) and inline ("🦷 1/2").
4. **StandBy / HomeView Modular face:** the small Today widget with a removable background
   (`containerBackground(for: .widget)`), big shapes, high contrast, readable from a counter.
5. *Later, only if wanted:* an App Intent button "Start brush" that opens straight into the 2-minute
   brush; a Live Activity during a phone brush (the watch app already covers the wrist).

## Behaviour
- The widget reads a small JSON snapshot that the app writes into an **App Group** container
  (`group.org.mouthlife.plaque`): per date, full brushes and tries (the last 14 days), plus the
  language and reminder times. Nothing leaves the device. No network, no analytics.
- The widget works out "today" itself from the snapshot, so it rolls over at midnight even if the
  app was not opened. Timeline entries at midnight and at the two reminder times.
- The app asks WidgetKit to reload whenever a brush is paid (including a brush that came from the
  Apple Watch).
- Non-punitive, as everywhere in MouthLife: an empty day is an empty circle, never red, never
  "you missed". No streak counter that can be lost.
- Apple-simple: very few words, one idea per widget, the 8 coach languages from a small table like
  `WatchCopy`.
- Accessibility: VoiceOver says "Brushes today: 1 of 2"; no information by colour alone; Reduce
  Motion irrelevant (widgets are static).

## Build notes and risks
- New app-extension target in `MouthLife.xcodeproj` (hand-edited project file, like the watch
  target), embedded in the iPhone app, sharing `MouthLifeCore` for `BrushDays`.
- Entitlements: App Group on the app and the widget. **The App Group must be registered with the
  developer account.** Automatic signing can do that for a paid Apple Developer Program account; it is
  not certain for a free personal team. Test with a signed device build before pushing anything the
  phone build depends on.
- The Mac build must keep working (the widget is iOS only, like the watch app).
- Tests: the snapshot's encode/decode, the "today" rollover, the timeline entries, the week from
  counts, and renders of each family at the standard sizes.

## Questions for the design review
See `~/MouthLife-build-logs/agy-widget-prompt.md` (the prompt that goes with this file).

## Review results (agy and Codex, 2026-11-19)

Both reviewers read this plan and the code (read-only). Where they agree, the plan adopts it (this
replaces the matching points in "Proposed widgets" above):

- **Look:** the watch's purple-and-gold smile, not plain mint rings. Before a brush: two outline
  marks and a calm face; one full brush: one mark filled; both: all filled, gold, "Done!".
- **Words:** one or two words, from `WatchCopy` where they exist ("Good try!", "Done!"). Before the
  first brush "Ready?" (not a nagging "Brush!"); a short brush gets a small sparkle and "Good try!",
  never an empty or failed look. "Ready?", "Open MouthLife" and the VoiceOver line ("Brushes today:
  1 of 2") are new and need all 8 languages.
- **What counts as a good try:** `HabitBank` pays a third full brush as a tip too, so "tries" are not
  always short brushes. Show the sparkle only when there are tries and fewer than two full brushes;
  two full brushes always win.
- **No morning/evening labels:** the save keeps counts per day (`DailySlotLog`: full brushes and
  tries), not times, so a sun and moon would claim more than the app knows.
- **A tap opens the app** (Home, with 2-Min Brush in reach). It never starts the brush by itself: a
  bumped phone must not start music, a timer or a log entry. A "Start brush" App Intent can come
  later, if ever.
- **Timeline:** entries at each local midnight for a week; reminder times change nothing on screen,
  so they need no entries. Reload from one place after every save change: a phone brush
  (`completeBrushAlongSession`), a watch brush, a Sync Code import (also the Prologue's restore) and
  a language change (and an erase, once Settings offers one; today only `SaveSystem.resetToFreshSave`
  exists). Test daylight-saving changes, travel and a watch result arriving the next day.
- **Shared code:** the watch colours (`WatchLook`) are internal to `MouthLifeWatchUI` and must be
  made public to share; `BrushWeekStrip` makes a `DateFormatter` while drawing, which a widget
  should cache.
- **Data:** a small anonymous snapshot in the App Group: 7-14 days of counts and tries, and the
  language. No name, no city, no other settings. Excluded from backups (the save itself is backed up
  already).
- **StandBy and HomeView:** the small widget works with its background removed, with big shapes and
  states told apart by shape (outline / sparkle / filled), not by colour alone; filled parts marked
  `.widgetAccentable()` for tinted and Night modes.
- **Gallery and first run:** the gallery preview shows a friendly "1 of 2"; with no snapshot yet the
  widget says "Open MouthLife" instead of looking like an empty day.

Where they disagree, the owner decides:

1. **Lock Screen, StandBy, HomeView and privacy.** In the second review both reviewers moved to the
   careful side: a locked phone, StandBy or a household screen should not show a child's routine to
   anyone passing (two filled marks say "brushed twice" even without a name; a home with two
   children makes it worse). A widget cannot tell whether it is on HomeView. Suggested: progress only
   on the Home Screen (small Today, medium This week, with `.privacySensitive()`); on the Lock Screen
   a single circular widget with the neutral tooth (VoiceOver: "Open MouthLife"); the rectangular
   and inline families cut. If the owner wants progress on the Lock Screen, mark it
   `.privacySensitive()` so the system can hide it while locked.
2. **One widget or two.** agy puts today's smile beside the week strip in one medium widget; Codex
   keeps a small "Today" for the child and a medium "This week" for the grown-up. Suggested: both
   families (small Today, medium This week); a family adds one view, not a new feature.

HomeView facts: confirmed by Apple's guidelines since the reviews (small family only; personal Home
Screens and one shared Modular face; background removed, larger, red-tinted in low light). Xcode 27.2
still has no HomeView API, simulator or widget location, so a widget cannot tell it is on HomeView.
Still unverified: what a tap on our widget does on HomeView (Apple documents nothing; never depend on
it), and whether iPhone Live Activities appear there (Apple's Live Activities guidelines do not list
HomeView).

## iPhone Duo

Checked on the iPhone Duo simulator (screenshots in [`duo-captures/`](duo-captures/), plan in
[`duo-plan.md`](duo-plan.md)).

- **Same widgets, same sizes on both Home Screens.** The cover and the inner screen both use a
  4-column grid; a small widget is 2 × 2 icons on both (see `cover-homescreen.jpg` and
  `inner-homescreen-upright.jpg`). Held as a wide book, the inner Home Screen shows two pages of
  icons side by side, and the widgets sit on them like on any page (`book-widget.jpg`; the cover:
  `cover-widget.jpg`). The tiles are not exactly the same width, so each family is rendered at both
  sizes. The cover's dock runs
  down its right edge, which does not affect widgets. No Duo-only widget and no Duo-only size.
- **Cover Home Screen** (the screen in hand most of the day): the small **Today** smile is the best
  fit; two small widgets sit side by side there, as Apple's own do.
- **Inner Home Screen** (unfolded, a grown-up's look at the week): the medium **This week** strip;
  the large size is not needed.
- **Lock Screen:** whatever is decided above for all iPhones (suggested: the neutral tooth); on a
  folded Duo it is the cover's Lock Screen people see most (`cover-lockscreen.jpg`, nothing from
  MouthLife today).
- **StandBy:** unverified on the Duo (it needs a charging phone on its side; which screen shows it
  when folded is not known). The small widget without background covers it either way.
- **Live Activity of a running brush, folded or locked:** **not in the first release** (both
  reviewers agree). Folded is already handled: the app keeps running on the cover screen, timer,
  voice and 3D intact (verified). Locked: today the brush pauses and resumes on unlock, so a Live
  Activity would only show a paused timer, and it would put a child's session on paired screens. It
  becomes worth building only if the owner chooses background audio (duo-plan question 2).
  If built: one compact view (quadrant ring, time left, one stage word), no name, gone at "Done" and
  quietly gone if a brush is stopped (no "you stopped" message); `ActivityKit`; check how it looks
  beside the cover's corner camera (`isDynamicIslandLimitedInWidth`, iOS 27, reports the width).
- **Languages:** widget words come from `WatchCopy` (one or two words). Check German and French in
  the small family and in the circular Lock Screen family, cover and inner, with large text.
- **Non-punitive everywhere:** an empty day is an empty outline; no streak, no red, no "missed".

## Owner's strategy (HomeView, iPhone, Android), merged 2026-11-19

The owner's widget strategy notes (private, summarised here in our own words) were checked against
the code, the Xcode 27.2 SDK and Apple's guidelines. Every WidgetKit call they name exists in the SDK
(`containerBackground(for:)`, `containerBackgroundRemovable`, `showsWidgetContainerBackground`,
`widgetRenderingMode`, `widgetAccentable`, `widgetAccentedRenderingMode`, `privacySensitive`,
`disfavoredLocations`, `ControlWidget` / `StaticControlConfiguration`, `LiveActivityIntent`). The
files they name exist (`BrushDays.swift`, `BrushWeekStrip`, `PhoneWatchBridge.swift`,
`BrushReminderScheduler.swift`, `DesignSystem.swift`, `WatchFaces.swift`, `src/config/brushDays.ts`).

### Adopted

- **The small "Today" widget is the flagship.** It alone covers the iPhone Home Screen, StandBy and
  HomeView (both its personal and its shared screens), so it must say everything by itself; the
  medium week strip is a bonus for the iPhone and iPad Home Screen only.
- **Four states, told apart by shape, readable across a room by a child who cannot read yet:**
  nothing yet = two calm outlines ("Ready"); a short brush = a warm dashed half-glow with a small
  sparkle ("Good try"); one full brush = one solid gold mark; two = both gold with a sparkle arc
  ("All shine!", new string). The word is hidden when the background is removed. Same purple and
  gold as the watch.
- **Rendering rules:**
  - the purple background goes in `.containerBackground(for: .widget)` and stays removable (never
    `.containerBackgroundRemovable(false)`, which would keep the widget out of StandBy and HomeView);
  - when `showsWidgetContainerBackground` is false (StandBy, HomeView's Modular face), the marks grow,
    their strokes get thicker (about 3 → 5 pt) and the word goes;
  - in the accented rendering mode (tinted and clear Home Screens) only finished marks and the
    good-try glow are `.widgetAccentable()`, so done and not-yet stay apart in one tint; any image
    gets `.widgetAccentedRenderingMode(...)` so it does not turn into a white block;
  - round, calm shapes only (no crosses, triangles or exclamation marks), so the red night tint
    still reads as a night-light, not an alarm.
- **Privacy by omission:** no name, age, picture or text about the child on any widget; only
  anonymous marks. This holds on every surface, because a widget cannot know where it is shown.
  Putting the small widget on HomeView's shared face is then a grown-up's choice, not a leak.
- **Taps open Home, never start the brush,** and no "mark as done" button (it would skip the
  brushing). Interactive App Intents are kept for a later Live Activity's pause, if ever.
- **Week strip** with one-letter weekdays from the system (`veryShortWeekdaySymbols`), so no
  language truncates; today in a ring.
- **Shared data:** the app and the widget extension in the same team, with one App Group; the watch
  bridge (`PhoneWatchBridge`) writes the snapshot and reloads widgets when a watch brush arrives.

### Changed

- **Sun and moon tokens:** the notes put a morning sun on the left and an evening moon on the right.
  The save keeps only counts per day (`DailySlotLog.fullRewards` / `.tips`), not times, so a child
  who brushes first at night would see the morning sun fill. Plan: two identical marks that fill left
  to right. Sun and moon would need brush times in the save, which changes the Sync Code shared with
  the web (`ML2:`), so it is an owner question (below).
- **Timeline:** one entry per local midnight, refreshed with `.atEnd`. The notes' extra entries at
  reminder times only matter with a sun and a moon; without them nothing changes at 07:30 or 19:30.
- **Lock Screen "next brush" rectangle** ("Morning", "Bedtime" beside two small marks): not planned.
  It could be worked out from the reminder times and today's count (`BrushDays.plan`), but it shows
  a child's routine on a locked screen and repeats the reminder notifications the app already has
  (`BrushReminderScheduler`).
- **Live Activity with Pause and Finish buttons:** still deferred (see the iPhone Duo section and
  `duo-plan.md`): today the brush pauses when the phone locks, and Apple does not list HomeView for
  Live Activities.

### New, small, optional

- **Control Center launcher** (`ControlWidget` with `StaticControlConfiguration`, iOS 18+, the app
  targets iOS 17 so it is guarded): a brush symbol and one word, "Brush", that opens Home and never
  starts the timer. Also usable from the Lock Screen corners and the Action Button. Stateless, so no
  privacy question.

### Android (separate decision, after the Apple widgets)

- **A web app cannot make an Android widget** (per the sources in the notes; not re-checked here).
  Chrome and Edge give installed web apps no Home or
  Lock Screen widgets on Android (Edge's widget support is Windows-only), and Google's smart displays
  (Nest Hub) take no third-party widgets at all.
- **What it would take:** a small Android app that wraps the web edition (a Trusted Web Activity,
  made with Bubblewrap) plus a native Jetpack Glance widget, shown on Android Home Screens, the new
  Android 16 Lock Screen widget page and a docked Pixel Tablet. Same four states, same privacy.
- **Costs and corrections:**
  - A fourth code base (Kotlin) and a first Play Store app, with Google's Families policy and data
    safety form for a children's app.
  - The wrapper must prove it owns the website with a Digital Asset Links file at the site's
    **root** (`/.well-known/assetlinks.json`). The web edition is a GitHub Pages project site with no
    custom domain, whose root it does not control: it would need the owner's user site or a custom
    domain, or the wrapper bundles the web files offline (a plain WebView instead of Chrome).
  - The widget cannot read the web app's storage. The notes pass the day's counts through a custom
    link (`mouthlife://...`); a link would visibly leave the page. Chrome's message channel between
    a Trusted Web Activity and its app (`PostMessage`, AndroidX Browser) can do it without leaving;
    to be verified. Pass only the day's counts, not a whole Sync Code.
  - Android 15 grays out a force-stopped app's widgets until the app is opened again; opening the
    app from the Lock Screen asks for unlock first (good for a family phone).
- Web and native must match: this would be the web edition's first store app and first widget, so
  it needs the owner's go-ahead as its own project.

### Build order (suggested)

1. App Group, the snapshot, small **Today** (Home Screen, StandBy, HomeView), medium **This week**.
2. The Lock Screen circular widget, once the privacy question is decided, and the Control Center
   launcher.
3. Later, only with the owner's go-ahead: the Live Activity (with background audio), then Android.

### Questions for the owner (strategy)

1. **Sun and moon,** with brush times added to the save and the Sync Code (both editions), or two
   identical marks (no save change)? Suggested: two identical marks.
2. **Lock Screen:** neutral tooth, or anonymous progress marked `.privacySensitive()`? (Note that
   Apple's redaction on the Lock Screen depends on the user's settings.)
3. **The "next brush" rectangle on the Lock Screen:** skip (suggested) or build?
4. **Android:** a separate project after the Apple widgets, or not at all?

## v1 update: the owner's review of the first build (2026-11-19)

The owner looked at the first renders and changed the brief. These points replace the matching
decisions below:

- **Today shows "when did you last brush"** ("Last brush · 7:42 AM", "Yesterday 8:05 PM") and one
  line about what comes next: **"Time to brush!"** when a brush is due (no full brush yet and the
  morning time has passed, or one and the evening time has passed), **"Brush before bed · 7:30 PM"**
  after the first brush, **"All done today!"** after both, otherwise **"Next · 7:30 AM"**. "Due" is
  never "late": no red, no count of missed brushes.
- **Teeth, not circles:** a tooth character that is calm before the first brush, happy after one and
  smiling with sparkles at the end of a day with both brushes (agy's design, below).
- **No "Good try"** on the widgets ("what's that?"): they show full 2-minute brushes only; a short
  brush still moves "Last brush".
- **A tap on Today or the Lock Screen tooth starts the 2-Minute Brush** (from Home, or from a
  returning player's Prologue; a brush or a city stage in progress is never interrupted, and a
  first-time player still sees the Prologue). This week opens Home.
- **The last brush time** is kept on the device for the widget only (not in the save or the Sync
  Code, which stay unchanged); the brush times come from the grown-up's reminder times (07:30 and
  19:30 unless changed), whether or not reminders are switched on. The timeline adds entries at
  those times so "next" moves on by itself.
- Privacy: the Today widget now shows times, on the Home Screen, StandBy and, if a grown-up puts it
  there, HomeView's shared face; still no name or other detail. The Lock Screen stays the neutral
  tooth.

## v1: decided and being built (2026-11-19)

The owner asked for the best plan to be decided here and built. Decisions, with the reviewers'
agreement (agy confirmed each; Codex confirmed the design before the build):

1. **Widgets in v1:** **Today** (small: iPhone and iPad Home Screen, StandBy, HomeView), **This week**
   (medium: iPhone and iPad Home Screen), and a **Lock Screen** circular widget. Not in v1: inline and
   rectangular Lock Screen widgets, the Control Center launcher (it needs the project's first App
   Intent; v1.1 if wanted), the Live Activity, Android.
2. **Two identical marks**, filled left to right; no sun and moon; the save and the Sync Code stay as
   they are.
3. **Four states:** two calm outlines with "Ready"; a dashed half-glow with a sparkle and "Good try!"
   (only when there are tries and fewer than two full brushes; with one full brush the second mark
   shows the glow); one gold mark; two gold marks with a sparkle arc and "Done!". The word is hidden
   when the background is removed (StandBy, HomeView's shared face). No snapshot yet: a tooth and
   "Open MouthLife".
4. **Lock Screen: the neutral tooth** (a launcher, no progress). iOS shows Lock Screen widgets while
   locked unless the user turns that off, so `.privacySensitive()` alone would not hide progress.
5. **Words** in a small 8-language table (`WidgetCopy`, like `WatchCopy`), reusing the watch's
   "Good try!" and "Done!"; weekday letters from a calendar in the coach language.
6. **Data:** an anonymous JSON snapshot in the App Group `group.org.mouthlife.plaque` (14 days of
   counts and tries, the coach language), written from one place, whenever the coordinator's save
   changes, and widgets reloaded only when the snapshot changes. The widget works out "today"
   itself; timeline entries at each midnight for a week, `.atEnd`.
7. **A tap opens the app:** a returning player on the Prologue goes straight Home; a brush or a stage
   in progress is never interrupted; nothing starts by itself.
8. **Signing:** this Apple account is a free personal team (its profiles last 7 days), which cannot
   use App Groups. So the App Group is switched on for the simulator, and for devices only when the
   build setting `MOUTHLIFE_DEVICE_ENTITLEMENTS` points at the entitlements file (after joining the
   Apple Developer Program). Until then the phone build keeps working and its widgets show the tooth
   and "Open MouthLife".
   The app itself has its own entitlements file (`MouthLifeApp/MouthLifeApp.entitlements`: the App
   Group plus HealthKit, which a free team cannot use either), switched on for devices by
   `MOUTHLIFE_APP_DEVICE_ENTITLEMENTS`. Until then the Apple Health switch turns itself back off.
9. **Rendering:** removable purple background; bigger marks and thicker strokes without background;
   only finished marks accented; `.widgetAccentedRenderingMode` guarded for iOS 18; round shapes
   only, calm under the red night tint.
10. **Android:** not in this round. Planned since in `docs/android-plan.md`: the web edition packaged
    for Google Play (the owner will enter their own contact email in Play Console), with widgets as
    an optional third phase.

## v1 as built (2026-11-19)

Built, checked on the iPhone and Duo simulators, and reviewed (agy's full QA pass, Sonnet's QA
passes). What changed from the decisions above, in the owner's own words where given:

- **Today** (small): the tooth of the day on the left; on the right "Last brush" with the time
  (the day too when it was not today: "Yesterday", a weekday; left out after a week) and two small
  teeth counting today's full brushes. One line underneath: **"Time to brush!"** (gold) when the
  morning time has passed with no brush; **"Brush before bed"** (gold, a moon) when the evening time
  has passed with fewer than two; **"Before bed · 7:30 PM"** after the first brush;
  **"All done today!"** after both; otherwise **"Next · 7:30 AM"**. After a bedtime brush alone the
  day's brushing is over: **"Next · Tomorrow 7:30 AM"**, never "brush again". A tap starts the
  2-Minute Brush.
- **The tooth's face follows the day** (the owner's rule, in line with the advice to brush in the
  morning and before bed): neutral when the day starts at 5 AM; smiling after a morning brush
  until noon (after a later first brush, until the evening time); "meh" (relaxed lids, a flat
  mouth, never sad) while the next brush waits; **happy** after the bedtime brush or both brushes,
  until 5 AM. The happy tooth is the gold molar with the face of the game's ending (big eyes with a
  shine, a wide smile, pink cheeks) and sparkles. It holds a toothbrush while a brush is due, and is
  never gold then. The face follows full 2-minute brushes only; a short brush still moves "Last
  brush".
- **Without background** (StandBy, HomeView's shared face): the big tooth and the two small teeth,
  no words. **Tinted and clear Home Screens:** the tooth is drawn as an outline with an outlined
  face, so it keeps its expression in one colour.
- **This week** (medium): seven columns of two small teeth, today ringed; a tap opens Home.
  **Lock Screen:** the neutral tooth, starting the 2-Minute Brush; one timeline entry, no schedule.
- **Data:** the snapshot also carries the last brush and last full brush times (kept on the device
  only, outside the save and the Sync Code) and the grown-up's two times, put in order if set the
  wrong way round. It is excluded from backups, written only when it changes, with one WidgetKit
  reload per brush. Timeline entries: now, then each midnight, 5 AM, noon and the two brush times
  for a week; a new time zone or a clock change reloads them. A bedtime brush just after midnight
  still counts for the evening before (the tooth's day runs from 5 AM to 5 AM).
- **Words and times** follow the coach language, like the rest of the widget ("19:30" with a
  Spanish coach). On the smallest iPhone the "Last brush" label wraps rather than shrinks.
- **The gallery** shows a happy day (both brushes done) in the device's language.
- **Free developer team:** on a device the widgets show the tooth and "Open MouthLife" until the
  App Group is switched on (`MOUTHLIFE_DEVICE_ENTITLEMENTS`, after joining the Apple Developer
  Program). On the simulator everything works.
