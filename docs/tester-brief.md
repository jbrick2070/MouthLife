# MouthLife: tester brief (round 2: every edition)

Thank you for testing MouthLife. Please read this first; it takes five minutes.

## What it is

MouthLife is a 3D game and a daily 2-minute tooth-brushing timer, for kids and grown-ups alike.
It is free, has no ads, no accounts and no tracking, and keeps everything on the device.

It comes as an app for iPhone, iPad and Mac, as a page in any browser (which can be installed to
the Home Screen), and as an Android app. This round covers all of them.

## Getting it

| Device | How |
|---|---|
| iPhone or iPad | TestFlight: https://testflight.apple.com/join/3XMxSuYu (install the TestFlight app first) |
| Mac | TestFlight for Mac, with an invitation we send you |
| Any browser | https://jbrick2070.github.io/MouthLife/ |
| Android phone | Google Play test, with an invitation we send you (Google asks for a Google account) |

Please tell us exactly which devices, system versions and browsers you used, and the build
number (in TestFlight it shows beside the version, for example "1.0.0 (5)").

## If you have 1 hour

1. **Your main phone (25 min):** the first screens, then Home, then one whole 2-Minute Brush
   with floss. Then the three new checks under "New in this build".
2. **A city stage (15 min):** thumbstick, touching the teeth to steer, Floss, Scan, pause, and
   finishing the city if you can.
3. **A second device (15 min):** the same 2-Minute Brush and a few minutes of a city.
4. **Write-up (5 min):** the results table below, filled in, and your top bugs.

## New in this build (please try each)

1. **A brush that was interrupted is kept.** Start the 2-Minute Brush, wait at least 30 seconds,
   then close the app completely (from the app switcher, or close the browser tab). Open it
   again: you should get a "good try" for the seconds you brushed. On iPhone and Mac, the seconds
   also appear in Health, Browse, Other Data, Toothbrushing.
2. **Leaving early is a "good try".** Start the 2-Minute Brush, wait at least 20 seconds, then tap
   the white Home button: you should see a few kind words, not nothing.
3. **The rinse hint.** With the rinse turned off (it starts off), finish brushing: the floss card
   should say the rinse can be turned on in Settings.
4. **If the app ever stops answering:** wait a moment, then close it and open it again, open
   Settings and tap "Share test diary" near the bottom (under Erase Save), and send us that file.
   It says which screen the app was on and holds no personal details.

## What to test (about 2 hours in all)

Start fresh if you can (a new install, or a private browser window) so you see the first-run
experience.

1. **The first screens:** read the story cards, tap the hardness chips, drag to turn the crystal,
   then "Dive into Your Arch".
2. **Home:** rub the teeth (they play notes), drag the sky to turn it, pick a city, open How to
   Play (the round ? button).
3. **The 2-Minute Brush,** at least once on a phone, all the way through:
   - the first time, the question about Apple Health before the timer starts (iPhone, iPad, Mac);
     try "Not now" once, then the small red heart on the brush screen to bring it back;
   - pause and resume; lock the phone halfway and come back (the time keeps going);
   - the small "Floss ›" button: tap it, then tap again within 3 seconds;
   - on the "Ready to floss?" card try each of Start Flossing, Skip and Hub;
   - the voice coach: turn it off and on with the speaker button;
   - **the rinse:** in Settings turn on "💧 Fluoride Rinse Step" (a grown-up question may appear),
     brush again, and check a "Ready to rinse?" card waits after floss.
4. **A city stage (Dive):** steer with the thumbstick and by touching the teeth; lift your thumb
   mid-drive (it should stop); drive into the pink gum walls (you should not get through); Floss
   (tap, and drag the ring to aim), Zip through a narrow gap, Scan and Surge; pause; finish a
   city (the show should play, then the score). Try more than one city.
5. **iPhone and iPad only:**
   - **Home Screen widgets:** touch and hold an empty spot on the Home Screen until the icons
     jiggle, tap Edit (or +) at the top, search for MouthLife, and add "Today" and "This week".
     After a brush, check they update. Also try adding "MouthLife" to the Lock Screen.
   - **Reminders:** in Settings, "⏰ Brush Reminders": turn them on and check one arrives.
   - **Apple Watch,** if you have one: the watch app should appear; try a brush there.
6. **Mac only:** steer with the mouse (click a tooth and drag); right-click to floss; check the
   hints say "click" (not "touch"); resize the window.
7. **Browser and Android:** "Add to Home Screen", open it from the icon, then turn on airplane
   mode and play again.
8. **Languages:** in Settings switch to Spanish, French, German and Japanese; look for words that
   are cut off or run over buttons.
9. **Sync Code:** in Settings, copy your Sync Code on one device and restore it on another; your
   progress should come across.
10. **Feel:** is it smooth? Does the device get hot? Is anything confusing or frustrating?

## Results table (please send this back)

One row per check above, with **pass**, **fail** or **could not try**, and a note for every
fail. For each bug: the device and system, steps to reproduce, what you expected, what happened,
how bad it is (blocker, major, minor, polish), and a screenshot or short screen recording.

Then a short summary: what worked well, what did not, and your impressions.

## Please do not

- Post reviews or ratings of MouthLife anywhere (store reviews tied to a paid test break the
  stores' rules).
- Include anyone's personal details in recordings or notes.
