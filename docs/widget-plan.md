# MouthLife widgets: draft plan (for design review)

Status on `master` at `071b3f6`: **MouthLife has no widgets yet.** No WidgetKit extension, no App
Group, no entitlements file. This is the draft for what to build; it is meant to be reviewed
before any code is written. Updated 2026-11-19 with the agy and Codex design reviews and the
iPhone Duo (sections at the end).

**Where the widgets go:** every iPhone and iPad (Home Screen, Lock Screen, StandBy on iPhone),
Apple HomeView if it accepts them, and both Home Screens of the iPhone Duo. One set of widgets for
all of them; the Duo needs no widget of its own.

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

Unverified, check on hardware before promising it: whether HomeView takes third-party small widgets
on its personal Home Screen and its household-wide Modular face (Codex says Apple confirms both;
Xcode 27.2 has no HomeView widget API, so they would be ordinary small widgets). With question 1's
suggestion, a household screen would only ever show the neutral tooth or nothing.

## iPhone Duo

Checked on the iPhone Duo simulator (screenshots in [`duo-captures/`](duo-captures/), plan in
[`duo-plan.md`](duo-plan.md)).

- **Same widgets, same sizes on both Home Screens.** The cover and the inner screen both use a
  4-column grid; a small widget is 2 × 2 icons on both (see `cover-homescreen.jpg` and
  `inner-homescreen-upright.jpg`; the inner screen held as a wide book was not captured, and the
  tiles are not exactly the same width, so render each family at both sizes). The cover's dock runs
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
