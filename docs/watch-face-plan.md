# Apple Watch brushing face: improvement plan

## Final decisions (after the Astra review, 2026-11-19)

The draft below was reviewed by Astra. These are the decisions being built.

1. **Brush (item 1): built, corrected.**
   - The skipped molars happen only in Q1 and Q3; Q2 and Q4 do reach tooth 6.
   - The sweep comes from `phaseElapsedSec` in all twelve surfaces.
   - The brush glides only between neighbouring teeth. It jumps on a surface change, after a missed
     tick and with Reduce Motion.
2. **Countdown (item 2): built.** The digit follows `WatchRitual.crossing` exactly (new
   `WatchRitual.countdownDigit`): the last 3 s of each quarter (including 117-119 s before floss),
   both floss boundaries and the rinse end. It hides while paused, and the brush stays visible beside
   it.
3. **Camera (item 3): built, changed.**
   - The 2 s hold stays, because the face only updates on whole seconds.
   - The zoom-in takes 0.7 s.
   - The next-quarter hint is worked out from the current quarter (Q1-Q3), because
     `upcomingQuadrantIndex` lasts only 0.85 s. It is drawn fainter than the brush.
   - Tilt is 8°, to be judged on the wrist together with the 10° nod.
4. **Floss pick (item 4): built.**
   - `flossContactIndex` maps 0 to rear-right, 6 to centre and 12 to rear-left. The lower arch
     restarts at rear-right at 22.5 s, as on the phone.
   - In Always On, the arch not being flossed is dimmed.
5. **Rinse (item 5): built, still water first.** The teeth stay idle-coloured. One clear waterline in
   a new water colour is drawn, with gap marks on the middle step and an outline only in Always On.
6. **Compass and segmented bar (item 6): dropped.** The clock, "1/4" and the continuous bar stay.
7. **Teeth (item 7): built.** The molar depth goes to 0.82, checked by eye for space between the
   stroked teeth. The lit sheen and the inside dash weight are tuned after that.
8. **Paused control (item 8): built, changed.**
   - "…" gets a 44 pt touch target (it was 32 pt at 40 mm) and a quieter look.
   - While paused, the word pill becomes a Resume button (`togglePause`). "…" still opens the
     controls, so End stays reachable.
9. **Always On covers the whole running face (new): built.**
   - The bar, pill and button are drawn as outlines.
   - There is no 3-2-1 animation while dimmed.
   - After the wrist test (the watch dims quickly while a child brushes), the dimmed face keeps
     guiding: the brush and the floss pick keep stepping once a second (no glide), the 3-2-1
     shows (no pop), and the lit quarter is drawn in a bolder line.
10. **VoiceOver (new): built.** There is still one summary line for location, action and time. The
    Resume button reads its real action.

11. **Stage start (from the wrist test): built.** Floss used to "just start". Now each stage opens
    with a card for about 3 s showing "Brush", "Floss" or "Rinse" and its picture. The watch also
    speaks one word per change, like the phone's coach: "Brush" at the start, the quarter numbers,
    then "Floss", "Rinse" and "Done". The song dips while it speaks.
12. **Sonnet QA fixes: built.**
    - Audio is re-activated whenever a song starts, so it survives calls and Siri.
    - The brush and pick do not fade on identity changes, and the 3-2-1 pops in 0.2 s.
    - Camera padding is `u*0.10`, so the brush head is not clipped.
    - VoiceOver says "Pause" first while paused.
    - The face ticks on a 1 s `TimelineView`, so it keeps redrawing in Always On.
    - New tests: the camera stays inside the mouth, and the floss path runs right to left on screen.

Not done this pass: coalescing the mid-second floss-halfway update, and caching tooth geometry
between frames. Both are small, and can be revisited if the wrist shows any stutter.

State on `master` at `1cf5616`, worn on the owner's Series 9 (watchOS 27.2.1) on 2026-11-19. The owner's
verdict: "much better representation", "actually pretty good", but "I don't see a brush".

This plan merges a design review by the Antigravity agent (agy) with a check of every claim against
the code and the renders. Pictures of each face at 41 mm, from `WatchFaceRenderTests`, are in
[`docs/watch-captures/`](watch-captures/). **Note:** those renders do not show the 3D tilt, because
`ImageRenderer` skips `rotation3DEffect`. Judge the tilt on a real watch only.

Code: `native-apple/Sources/MouthLifeWatchUI/WatchFaces.swift` (faces),
`native-apple/MouthLifeWatch/` (runtime, taps, music), `native-apple/Sources/MouthLifeCore/Watch/`
(ritual timeline). Rules that hold throughout: [`AGENTS.md`](../AGENTS.md), and the watch rules at
the end of this file.

## What the face does now
- **Top row:** a clock and "1/4".
- **Mouth:** a dental chart seen from above, in mirror view (screen-right is the child's right). The
  camera is close on the quarter being brushed from 2 s into each 30 s quarter until 3 s before its
  end. The rest of the time it shows the whole mouth, tipped back 16° (`rotation3DEffect`), with a
  10° nod toward each new quarter.
- **Surfaces:** the quarter being brushed glows in its surface colour: gold for outside, violet for
  chewing, lavender for inside. A gold line, groove marks or a dashed line marks the surface.
- **Pacer:** a dot steps one tooth per second.
- **Countdown:** a big 3-2-1 shows before every 10 s surface change.
- **Bottom row:** a progress bar, one big word ("Outside") and a "…" button.
- **Taps and sound:** wrist taps at each change, and the phone's own song plays on the watch.

## Verified problems (checked in code)
1. **The pacer never reaches the back molars on chewing or inside.** `pacerStep` uses
   `Int(stageElapsed) % 12`, which drifts against the 10 s surfaces. Over seconds 10-16 it visits
   teeth 2,1,0,1,2,3,4; over seconds 20-26 it visits 4,3,2,1,0,1,2. Teeth 5 and 6 (the molars) are
   only reached on outside.
2. **The big 3-2-1 and the wrist disagree.** The 3-2-1 shows before every surface change
   (`phase.countdownPip`), but the wrist taps 3-2-1 only before a new quarter, the floss halfway or
   end, and the rinse end (`WatchRitual.crossing`). The pacer is also hidden whenever the 3-2-1
   shows, which is 3 of every 10 s.
3. **Floss is static.** The face shows 13 identical gold threads for 22.5 s per arch, even though
   `BrushPhaseState.flossContactIndex` (0-12) already tracks which gap is being flossed.
4. **In Always On, both floss arches look the same.** `drawQuarter` changes `fill` for the arch not
   being flossed but never its `line`, and Always On draws only lines.
5. **Rinse looks like chewing.** All teeth are drawn in `WatchLook.rinse`, which is the same violet
   as chewing. The middle step reads "Between teeth", and nothing shows liquid.
6. **The back molars overlap.** Their inner corners touch where the arch bends tightest. This is
   visible in `brush-chewing-dimmed-41mm.png`.
7. **The play icon doesn't resume.** When paused, "…" shows ▶, but tapping it opens the menu
   (`onMore`) instead of resuming.
8. **`ToothPicture` is unused.**

## The plan, in build order

### 1. A toothbrush instead of the dot, sweeping every tooth (fixes problem 1, answers "no brush")
- **What it is:** draw a small side-view brush in `MouthPacer`: a head about 1.3 teeth long, 3-4
  chunky bristle tufts, and a short neck stub pointing toward the front of the mouth. It lies along
  the arch (`Tooth.along`).
  - **Outside:** on the cheek side, bristles pointing inward.
  - **Inside:** on the tongue side, bristles pointing outward.
  - **Chewing:** across the tooth top, with bristle tips showing. Check this silhouette at 40 mm.
- **Sweep:** the step comes from `phase.phaseElapsedSec` (0 to under 10) as a triangle wave, giving
  teeth 0,1,2,3,4,5,6,5,4,3. Every surface reaches the molars. Move this into a pure static function
  with a unit test.
- **Motion:** the brush glides 0.3 s from tooth to tooth by making the step position part of
  `MouthPacer`'s `animatableData`, alongside `zoom`. There is no scrub wiggle and no per-second
  keyframe animation, to save battery. With Reduce Motion it jumps.
- **Always On:** one still brush, outline only, parked on tooth 3 and facing the surface. It is no
  longer hidden.
- **Framing:** camera padding goes from `u*0.07` to `u*0.10` so the head never clips.
  `ToothPicture` is deleted, keeping its bristle drawing if useful.

### 2. Show the 3-2-1 only when the wrist taps it, and keep the brush visible (fixes problem 2)
- Show the big number only in the last 3 s before a new quarter, the floss halfway and end, and the
  rinse end. Surface changes keep their click tap and the colour, word and brush-side change.
- The brush stays on screen during the 3-2-1, so children keep brushing to the end of the surface.

### 3. A calmer, more useful camera
- **Next-quarter hint:** while pulled back for a quarter's last 3-2-1, outline the next quarter
  (soft and dashed) so the pullback says "here next".
- **Timing:** pull back at 27 s as now, hold the whole mouth 1.5 s into the new quarter (now 2 s),
  and zoom in over 0.7 s (now 0.9 s).
- **Close-up limit:** capped at 2.0 (now 2.4). The computed close-up is about 1.7, so this only
  limits odd sizes.
- **Tilt:** cut from 16° to 8°, then confirm on the wrist that the lower front teeth stay clear of
  the progress bar. agy's claim that the tilt hits the bar was based on renders that cannot show
  the tilt. The owner liked the depth, so keep some.

### 4. Floss: a floss pick that steps gap to gap (fixes problems 3 and 4)
- **Pick:** a small Y-bow pick sits on gap `flossContactIndex` and steps every ~1.7 s.
- **Gaps:** the active gap is white, finished gaps are soft gold, and the rest are dim.
- **Framing:** the whole mouth stays in view, because an arch is too wide to zoom in on.
- **Mirror order:** confirm the step order is right-to-left in mirror terms against the phone's
  floss pacer.
- **Always On:** the arch not being flossed gets a dim line, and a still outline pick sits on the
  middle gap.

### 5. Rinse: liquid, not teeth (fixes problem 5)
- **Teeth:** they stay idle-coloured during the rinse.
- **Liquid:** a soft translucent wave (opacity about 0.3) inside the mouth, in the rinse colour,
  shifts left and right once a second, eased, with 3-4 bubbles. On "Between teeth", small bright
  dots appear in the gaps.
- **Always On:** a still wave outline.
- **Reduce Motion:** no shifting.

### 6. Wordless "where" and "how far"
- **Compass:** replace "1/4" with a mini mirror compass, about 24×18 pt and drawn without blur from
  `MirrorMouth.arc` geometry. The active quarter is in its surface colour, finished quarters are
  soft gold, the rest dim, and Always On shows outlines only. During floss and rinse the same slot
  shows the `FlossPick` or `RinseCup` icon.
- **Progress bar:** split it into segments: 4 for brushing, 2 for floss, 3 for rinse.
- **Fallback:** if the compass doesn't read at 40 mm, keep "1/4" there.

### 7. Cleaner teeth (fixes problem 6)
- **Molars:** cut their depth from 0.95 to about 0.82, or taper their tongue side, so no outlines
  touch.
- **Sheen:** lower the white top sheen on the lit quarter from 0.5 to about 0.3, so chewing reads
  richer violet and inside reads icy lavender.
- **Inside line:** thicken the dashed line to about 1.4× the mark width, as bold as the outside
  line.

### 8. A quieter "…" and an honest ▶ (fixes problem 7)
- **While running:** "…" gets a softer border (`WatchLook.idle`, 1.5 pt) and soft dots. The touch
  target stays the same size.
- **While paused:** ▶ resumes directly, with no menu.

## Left out on purpose
- A per-second scrub wiggle (keyframe animation every second). It adds battery cost and motion
  noise, and the glide in item 1 is enough.
- A word-pill pulse before surface changes. It adds clutter; the tap and colour change already
  carry it.

## Tests and checks for the build
- Render tests: add brush states at 40 mm and 49 mm (outside, chewing, inside, Always On), floss
  with the pick, rinse with the wave, and the compass.
- New unit test: the pacer sweep covers teeth 0-6 within every 10 s surface.
- Existing checks: `swift test`; the iOS, macOS and watchOS Release builds with
  `CODE_SIGNING_ALLOWED=NO`; then a signed install and a wrist test.
- Still open from the wrist test: does the song keep playing with the wrist down (self-care session,
  speaker)?

## Watch rules (do not break)
- **Layout and words:** mirror view, never flipped. Apple-simple: few words, one idea per screen.
  No taps needed while brushing except "…".
- **Tone and privacy:** non-punitive. Nothing leaves the app (no links, accounts or contact details).
- **Accessibility:** Always On shows outlines only, with no animation. Reduce Motion fades or jumps
  instead of moving.
- **Battery:** updates at most once a second plus short glides. No blur filters on the running face.
