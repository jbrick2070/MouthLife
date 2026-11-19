# MouthLife widgets: draft plan (for design review)

Status on `master` at `932ab60`: **MouthLife has no widgets yet.** No WidgetKit extension, no App
Group, no entitlements file. This is the draft for what to build; it is meant to be reviewed
before any code is written.

## Why widgets
- The owner asked for iPhone widgets, and for them to be "good".
- Apple HomeView (on sale 2026-11-13, $299, 7-inch square screen) cannot run MouthLife itself. The
  one third-party route reported so far is small iPhone widgets on its Modular face (a claim from a
  personal blog, unconfirmed by Apple). Widgets are therefore also the closest way to be on
  HomeView. Design them so they still work with the background removed (StandBy style).

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
