# MouthLife Drop-In Suno Soundtrack & Live Earth Radio

Drop any `.m4a` (recommended AAC `160–256 kbps` for hardware-decoded zero-CPU playback on iPhone), `.mp3`, `.caf`, or `.wav` tracks directly into `MouthLifeApp/Music/` and rebuild `MouthLife`.

The web edition plays this same folder: `vite.config.ts` serves it as `music/` in dev and copies it into `dist/music/` on build, and `src/engine/audio/musicTracks.ts` resolves the same stems in the same order (browsers skip `.caf`). A theme with no file falls back to the procedural synth in both editions.

Brush-Along's floss and fluoride-rinse stages switch tracks: drop in `floss.m4a` and `rinse.m4a` (or `fluoride.m4a` / `mouthwash.m4a`) to give them dedicated music. Until then the floss plays `accra.m4a` and the rinse `aurora.m4a`.

`NativeSoundEngine` (`SunoStreamDeck`) automatically:
1. **Detects bundled tracks at runtime** using either friendly city names (`toronto.m4a`, `new_orleans.m4a`, `tokyo.m4a`, `accra.m4a`, `aurora.m4a`, `sanctuary.m4a`) or canonical IDs (`world_1.m4a`..`world_5.m4a`, `hub.m4a`).
2. **Powers Live Earth Radio**: tapping any unlocked city pill in the Hub (`Toronto`, `New Orleans`, `Tokyo & Chicago`, `Accra & Colorado Springs`, `Station Aurora`) spins 3D Earth to that city and crossfades (`850ms`) into its song — and keeps playing seamlessly without restarting when you launch **2-Min Brush** or **Dive Arch**! (Tap **Sanctuary** anytime to return to calm ambient, or tap the top **FM pill** mid-brush to flip stations with one wet thumb.)
3. **Drives 120Hz 3-Band Audio-Reactive Shaders**: pre-analyzes a 95th-percentile normalized `60Hz` `(bass, mid, high, beatPulse)` envelope in ~15ms on a background queue (`0%` real-time CPU) so enamel crystal glints, Earth night-city lights, polar aurora curtains, and micro-flora groove to every Suno song.
4. **Keeps Interactive SFX in Key**: puts the procedural synth music bus completely to sleep (`~0%` CPU) while keeping harmonic chord tracking active for glass-harp tooth notes, sonic-foam scrubs, and district chimes.

## Quick Test (Single Song)
To test **one** Suno song across the whole app right away, name it:
- `background.m4a` (or `background.mp3`) — used automatically for any station/scene that doesn't have its own dedicated file below.

## Supported Filenames, Keys & BPMs

| Preferred City Filename | Accepted Aliases | Station / Scene | Matched Key & Mode | Suggested BPM |
| :--- | :--- | :--- | :--- | :--- |
| `sanctuary.m4a` | `hub.m4a` | **Sanctuary** (`🌙 Sanctuary` pill in Hub) | **F Major Pentatonic** (`Fmaj9`) | `84 BPM` |
| `toronto.m4a` | `world_1.m4a` | **Toronto FM** — World 1 (Plaque City) | **C Lydian** (`Cmaj7` / `D`) | `112 BPM` |
| `new_orleans.m4a` | `nola.m4a`, `world_2.m4a` | **New Orleans FM** — World 2 (Sulcus Jazz) | **Bb Major Blues** (`Bbmaj6`) | `104 BPM` |
| `tokyo.m4a` | `tokyo_chicago.m4a`, `world_3.m4a` | **Tokyo FM** — World 3 (Stephan Neon) | **A Dorian** (`Am9` / `Fmaj7`) | `108 BPM` |
| `accra.m4a` | `world_4.m4a` | **Accra FM** — World 4 (Coastal Highlife) | **G Major Pentatonic** | `118 BPM` |
| `aurora.m4a` | `orbit.m4a`, `world_5.m4a` | **Aurora FM** — World 5 (408 km LEO) | **E Lydian** (`Emaj9`) | `80 BPM` |
| `brush_along.m4a` | `brush.m4a` | **2-Min Brush** (when `Sanctuary` is selected) | **G Major** (`Gmaj7`) | `108 BPM` |
| `cosmic.m4a` | `intro.m4a` | **Cosmic Intro** (Deep Time -> Living Arch) | **C Major Pentatonic** (`Cmaj9`) | `58 BPM` |
| `pulp.m4a` | `pulp_rescue.m4a`, `boss.m4a` | **Pulp Rescue** (90s Endodontic Scramble) | **E Minor Pentatonic** (`Em7`) | `128 BPM` |
| `report.m4a` | `victory.m4a` | **Mission Report** (Victory Lounge) | **D Major Pentatonic** (`Dmaj9`) | `76 BPM` |

## Finale Songs (optional): exact lengths, cue sheet and prompts

Each city's finale and the grand finale can have their own song. Drop them in this folder; both
editions pick them up. Without a file, the built-in synth score plays (it follows the same cues).

| File | Plays | Length | At 120 BPM, 4/4 |
| :--- | :--- | :--- | :--- |
| `finale_toronto.m4a` | Toronto's finale | **30.0 s** | 15 bars |
| `finale_new_orleans.m4a` | New Orleans' finale | **30.0 s** | 15 bars |
| `finale_tokyo.m4a` | Tokyo & Chicago's finale | **30.0 s** | 15 bars |
| `finale_accra.m4a` | Accra & Colorado's finale | **30.0 s** | 15 bars |
| `finale_aurora.m4a` | Station Aurora's finale | **30.0 s** | 15 bars (or 7½ bars of half time at 60) |
| `finale_ending.m4a` (or `grand_finale.m4a`) | The grand finale, after the fifth city | **60.0 s** | 30 bars |

Every cue sits on a beat of a **120 BPM grid**: one 4/4 bar = 2.0 s, one beat = 0.5 s. Write at
120 (or 60 half time) and every hit lands on the bar lines below. The song starts the instant
the last zone seals. Over a song the game still plays its own firework booms, whistles and
sparkles, so leave a little air for them. A song that runs long is faded out; one that runs
short simply stops. Skip jumps straight to the grand finale's song (or ends).

**City finale, 15 bars** (the same in every city; bar.beat, then seconds):

| Bar.beat | Time | What happens | Music |
| :--- | :--- | :--- | :--- |
| 1.1 | 0.0 | The game freezes and fades into the city at night | A breath: one held chord, no drums |
| 1.3 | 1.0 | The probe flies up | Lift-off swell |
| 2.2 – 4.2 | 2.5 – 6.5 | The lights come on left to right, a step every beat | A climbing line, one note per beat |
| **4.3** | **7.0** | **The whole city blazes** | **First big hit (a push into bar 5)** |
| 5.1 – 7.4 | 8.0 – 13.9 | The celebration; the host pops up to wave (5.4 – 7.3) | The city's theme, at its most triumphant |
| 7.4 | 13.5 | One last rocket goes up | One-beat riser |
| **8.1** | **14.0** | **It bursts into the city's sign** | **Hit** |
| 8.4 – 9.2 | 15.5 – 16.5 | The sparks gather into a coin | Suspense, thinning out |
| 9.3 – 9.4 | 17.0 – 17.9 | The probe rises to meet it | Sixteenth-note drum roll |
| **10.1** | **18.0** | **The probe holds the coin up** | **The fanfare: the biggest hit** |
| 10.4 | 19.5 | The Golden Molar appears | Glow |
| 11.3 | 21.0 | The piece clicks into place | Small accent |
| 12.1 | 22.0 | A mountain rises: a ledge per city, the molar on top | Awe, a new colour |
| **13.1** | **24.0** | **The probe hops up to its ledge** | **Accent** |
| (14.1) | (26.0) | (The city that completes the set reaches the summit) | (Only matters for the grand finale's hand-over) |
| **15.1 – 15.4** | **28.0 – 30.0** | **Lift off** | **Last chord on the downbeat of bar 15, and it must not resolve** (for example the V or a sus chord): there is more mountain to climb |

Any city can be the last one, so every city song should hang at the end. The grand finale is
where the music finally comes home.

**Grand finale, 30 bars:**

| Bar.beat | Time | What happens | Music |
| :--- | :--- | :--- | :--- |
| 1.1 | 0.0 | Night sky | Hush |
| 2.2, 2.4, 3.2, 3.4, 4.2 | 2.5, 3.5, 4.5, 5.5, 6.5 | The five pieces land, one per city | Five rising accents, every two beats |
| **5.1** | **8.0** | **The Golden Molar snaps together** | **The biggest hit of the game** |
| 5.1 – 6.4 | 8.0 – 11.9 | "The Golden Molar" | The triumphant theme, full |
| 7.1 – 26.4 | 12.0 – 51.9 | Credits, **4 bars per city**: Toronto 7–10, New Orleans 11–14, Tokyo & Chicago 15–18, Accra & Colorado 19–22, Station Aurora 23–26 | A medley: each city's groove and instruments for its 4 bars |
| **27.1** | **52.0** | Final scene: fireworks, the five signs circling the molar | Full reprise, a key change up |
| 28.1 / 28.4 | 54.0 / 55.5 | (Gold in every city) the molar smiles, then winks | A wink of a sound on 28.4 |
| **30.1** | **58.0** | Last chord | **Resolve home**, and let it ring |
| 30.4 | 59.4 – 60.0 | Fade to dark | Ring out |

### Music direction and prompts

Each finale is a victory version of that city's own song (same key family, same instruments),
played by a real band or orchestra, at 120 BPM so it locks to the cues. The prompts are written
for Suno: paste the **Style** line into the style box (Instrumental on) and the **Structure**
block into the lyrics box; then trim to the exact length in an editor.

**1. `finale_toronto.m4a` — "Morning Glass, Victory Lap" (C Lydian, 120 BPM, 30.0 s)**
- Harmony: C Lydian, built on Cmaj7 and D/C (the raised 4th, F#, is the sparkle). Climb in bars
  2–4 up the C major pentatonic; bars 5–7 on Cmaj7 – D/C – Em7 – D/C; fanfare in bar 10 on
  C – D – E – G over a Cmaj9; bars 12–14 move to Am9 – Fmaj7#11; end in bar 15 on **Gsus4**
  (unresolved).
- Real instruments: marimba and vibraphone carrying the melody, glockenspiel doubling it, Fender
  Rhodes chords, a string section, two French horns for the fanfare, upright bass, brushed snare
  and timpani for the hits.
- **Style:** `triumphant cinematic indie-orchestral, C Lydian, 120 BPM, live marimba and vibraphone melody, glockenspiel sparkle, warm Fender Rhodes, string section, French horn fanfare, upright bass, brushed snare, timpani hits, bright sunrise, joyful victory lap, instrumental`
- **Structure:** `[Intro: held Cmaj7, strings and Rhodes, 2 bars] [Build: marimba climbs one note per beat, 2 bars] [Hit] [Chorus: full band triumphant theme, 3 bars] [Riser] [Hit] [Breakdown: suspense, 2 bars] [Drum roll] [Horn fanfare, 2 bars] [Bridge: Am9 to Fmaj7#11, awe, 3 bars] [Ending: Gsus4 left hanging]`

**2. `finale_new_orleans.m4a` — "Second Line to the Summit" (B♭ major blues, 120 BPM swung, 30.0 s)**
- Harmony: B♭ blues, B♭7 – E♭7 – B♭7 – F7 shout chorus; fanfare in bar 10 as a trumpet shout on
  B♭ – C – D – F over B♭6/9; bars 12–14 a softer clarinet line over Gm7 – C7; end in bar 15 on
  **F7sus4** (unresolved).
- Real instruments: a New Orleans brass band: two trumpets, trombone, clarinet, tenor sax,
  sousaphone on the bass line, snare and bass drum playing a second-line beat, tambourine,
  Fender Rhodes comping. Swung sixteenths.
- **Style:** `New Orleans second-line brass band victory parade, B-flat major blues, 120 BPM swung, live trumpets trombone clarinet tenor sax, sousaphone bass, second-line snare and bass drum, tambourine, Rhodes comping, joyful Mardi Gras celebration, trumpet shout chorus, instrumental`
- **Structure:** `[Intro: one held horn chord, 2 bars] [Build: sousaphone and snare walk up, 2 bars] [Hit] [Shout chorus: full brass band, 3 bars] [Riser] [Hit] [Breakdown: clarinet alone, 2 bars] [Snare roll] [Trumpet fanfare, 2 bars] [Bridge: soft clarinet over Gm7 to C7, 3 bars] [Ending: F7sus4 held, unresolved]`

**3. `finale_tokyo.m4a` — "Neon to Daybreak" (A Dorian, 120 BPM, 30.0 s)**
- Harmony: A Dorian, Am9 – D9 (the major IV is the Dorian colour); fanfare in bar 10 on
  A – B – C – E over Fmaj7#11 resolving to Am9 for one bar; bars 12–14 Cmaj9 – Bm7♭5 (a nod to
  1940s Chicago jazz); end in bar 15 on **Esus4** (unresolved).
- Real instruments: Fender Rhodes and upright piano, alto sax and flugelhorn (Chicago jazz),
  koto glissandi and shakuhachi for Tokyo, taiko and shime-daiko for the big hits, a live funk
  drummer playing four on the floor, electric bass with a warm deep-house line.
- **Style:** `Tokyo meets Chicago jazz-house victory anthem, A Dorian, 120 BPM, live four-on-the-floor drums, warm electric bass, Fender Rhodes, upright piano, alto saxophone and flugelhorn melody, koto glissando, shakuhachi breath, taiko drum hits, neon city at dawn, triumphant, instrumental`
- **Structure:** `[Intro: Rhodes Am9, shakuhachi breath, 2 bars] [Build: koto climbs one note per beat, 2 bars] [Taiko hit] [Chorus: sax and flugelhorn theme over house groove, 3 bars] [Riser] [Taiko hit] [Breakdown: piano alone, 2 bars] [Drum roll] [Brass fanfare, 2 bars] [Bridge: Cmaj9 to Bm7b5, 3 bars] [Ending: Esus4 hanging]`

**4. `finale_accra.m4a` — "Black Star, High Peak" (G major pentatonic, 120 BPM, 30.0 s)**
- Harmony: G major, highlife cycle G – C – D – G; the bell pattern is the 12/8 Ewe gankogui line
  over 4/4; fanfare in bar 10 as horns on G – A – B – D over G6/9; bars 12–14 open up for the
  Rockies (Em7 – Cadd9, acoustic guitar and fiddle); end in bar 15 on **D7sus4** (unresolved).
- Real instruments: two interlocking clean electric highlife guitars, a horn section (trumpet
  and tenor sax), electric bass, kpanlogo drums and djembe, talking drum for the hits, gankogui
  bell and shekere; for the Colorado bars, acoustic guitar and fiddle.
- **Style:** `Ghanaian highlife victory celebration, G major pentatonic, 120 BPM, interlocking clean electric highlife guitars, trumpet and tenor sax horn section, warm electric bass, kpanlogo drums, djembe, talking drum hits, gankogui bell and shekere, bright and joyful, opening into a mountain sunrise with acoustic guitar and fiddle, instrumental`
- **Structure:** `[Intro: guitars and bell only, 2 bars] [Build: talking drum climbs, 2 bars] [Hit] [Chorus: full highlife band, horns lead, 3 bars] [Riser] [Talking drum hit] [Breakdown: bell and shekere, 2 bars] [Drum roll] [Horn fanfare, 2 bars] [Bridge: acoustic guitar and fiddle, wide open, Em7 to Cadd9, 3 bars] [Ending: D7sus4 hanging]`

**5. `finale_aurora.m4a` — "Overview" (E Lydian, 120 BPM or 60 half time, 30.0 s)**
- Harmony: E Lydian, Emaj9 – F#/E (the raised 4th, A#, is the weightless colour); fanfare in
  bar 10 as horns on E – F# – G# – B over Emaj9; bars 12–14 C#m9 – Amaj7#11 – F#; end in bar 15
  on **F#/E** (the Lydian II over the root), floating and unresolved.
- Real instruments: a full string orchestra (divisi), celesta, harp, glass harmonica, French horns
  and a trumpet for the fanfare, soft choir on "ah", timpani, and a gentle heartbeat bass drum.
- **Style:** `cinematic orchestral space awe, E Lydian, 120 BPM half-time feel, divisi string orchestra, celesta and harp, glass harmonica, soft choir ahs, French horn and trumpet fanfare, timpani, heartbeat bass drum, weightless sunrise over Earth, triumphant and tender, instrumental`
- **Structure:** `[Intro: glass harmonica and strings, held Emaj9, 2 bars] [Build: harp climbs one note per beat, 2 bars] [Timpani hit] [Theme: strings and choir soar, 3 bars] [Riser] [Hit] [Breakdown: celesta alone, 2 bars] [Timpani roll] [Horn and trumpet fanfare, 2 bars] [Bridge: C#m9 to Amaj7#11 to F#, 3 bars] [Ending: F# over E, floating, unresolved]`

**6. `finale_ending.m4a` — "The Golden Molar" (C → D → E major, 120 BPM, 60.0 s)**
- Harmony and key plan: bars 1–4 hush in C major as the pieces land (five rising accents on
  2.2, 2.4, 3.2, 3.4, 4.2); **bar 5, the snap: lift to D major**, full orchestra on the main
  theme (D – A/C# – Bm7 – G – A sus – A). Credits, bars 7–26, stay in D major but each 4 bars
  takes on a city's band and groove: Toronto (marimba, glockenspiel, horns), New Orleans (brass
  band second line), Tokyo & Chicago (Rhodes, alto sax, taiko), Accra & Colorado (highlife
  guitars, talking drum, fiddle), Station Aurora (celesta, harp, choir). **Bar 27: key change up
  to E major** for the final reprise with everyone playing; bar 28.4 a celesta and glockenspiel
  "wink"; **bar 30: resolve on E major (add 9)** and let it ring to 60.0.
- Real instruments: full symphony orchestra (strings, horns, trumpets, trombones, timpani,
  cymbals) plus each city's featured instruments in its credit.
- **Style:** `heroic orchestral grand finale medley, 120 BPM, starts hushed in C major, huge hit and lift to D major at 8 seconds, then four bars each of marimba and horns, New Orleans brass band, Rhodes with alto sax and taiko, highlife guitars with talking drum and fiddle, celesta harp and choir, final key change up to E major, full symphony orchestra, joyful triumphant resolution, instrumental`
- **Structure:** `[Intro: hush, five rising accents, 4 bars] [Huge hit: theme in D major, 2 bars] [Medley: Toronto 4 bars] [New Orleans brass band 4 bars] [Tokyo and Chicago 4 bars] [Accra highlife 4 bars] [Station Aurora 4 bars] [Key change to E major: final reprise, 2 bars] [Wink] [Final chord: E major add9, ring out]`

## Ready-to-Paste Suno Instrumental Prompts ("Solar Bio-Groove")

Toggle **Instrumental** ON in Suno so brushing cues and tactile tooth chimes stay crystal-clear:

1. **`sanctuary.m4a` (🌙 Sanctuary Ambient — Fmaj9, 84 BPM)**
   > `Warm sunlit morning sanctuary, lush Fmaj9 Rhodes electric piano, organic wooden kalimba plucks, soft brushed rim and subtle sub-bass warmth, crystalline water-drop overtones, soothing spa-grade lo-fi chillhop, 84 BPM, F major, clean spacious mix, instrumental`

2. **`toronto.m4a` (Toronto FM — Morning Glass & Cedar Bounce — C Lydian, 112 BPM)**
   > `Sunlit indie-electronic marimba and warm Rhodes groove, crisp morning espresso lounge bounce, sparkling C Lydian glass bell arpeggios, tight clean bassline and light shaker pocket, optimistic Nintendo-grade biotech polish, 112 BPM, C Lydian, instrumental`

3. **`new_orleans.m4a` (New Orleans FM — Velvet Brass & Rhodes Pocket — Bb Major, 104 BPM)**
   > `Warm swung New Orleans funk-jazz pocket, muted velvet horn stabs, soulful Rhodes comping, upright-meets-synth bass bounce, crisp second-line snare brush groove, joyful effortless swagger, 104 BPM, Bb major, clean audiophile mix, instrumental`

4. **`tokyo.m4a` (Tokyo FM — Shibuya-Kei & Deep-House Glow — A Dorian, 108 BPM)**
   > `Sleek Tokyo Shibuya-kei meets Chicago deep-house groove, silky A minor ninth chords, sparkling crystal synth bells, warm analog bass pulse, crisp four-on-the-floor brushed hats, midnight studio flow state, 108 BPM, A Dorian, instrumental`

5. **`accra.m4a` (Accra FM — Golden Coastal Highlife & Afro-Lounge — G Major, 118 BPM)**
   > `Uplifting modern Accra coastal highlife meets warm Afro-house lounge, bright clean palm-wine guitar plucks, thumb-piano kalimba, sunlit log-drum bass pocket, organic shakers, joyful marathon-sunrise energy, 118 BPM, G major, instrumental`

6. **`aurora.m4a` (Aurora FM — 408 km Orbital Sunrise — E Lydian, 80 BPM)**
   > `Weightless low-Earth-orbit ambient electronica, shimmering E Lydian aurora Borealis analog pads, crystalline celesta and glass-harp harmonics, gentle heartbeat sub-bass pulse, awe-inspiring overview-effect serenity, 80 BPM, E Lydian, instrumental`

## One-Line `.mp3` -> `.m4a` Hardware AAC Conversion (macOS)
Converting Suno `.mp3` downloads to `.m4a` halves app bundle size and uses Apple Silicon's dedicated hardware AAC decoder (`0%` CPU):
```bash
afconvert -f m4af -d aac -b 192000 ~/Downloads/suno_toronto.mp3 MouthLifeApp/Music/toronto.m4a
```

## Rights & Licence Record (fill in before App Store submission)

All 10 bundled tracks were generated with Suno by the project owner.

- **Suno plan:** Premier (monthly), a paid plan. Confirmed by the owner on 2026-11-13.
- **What that should cover:** Suno's terms give commercial-use rights for songs made while on a
  paid plan. Songs made on the free plan are not covered, and subscribing later does not change
  that. This summary is from memory, not legal advice: read Suno's current Terms of Service
  before release and keep a dated copy with the project.
- **Still to record:** the date each track was generated, to show it was made while the paid
  plan was active. Suno's library shows this per song.
- **Keep as proof:** a subscription receipt or invoice covering those dates, stored outside this
  public repository.

| File | Generated on (YYYY-MM-DD) | Made on the paid plan? |
| :--- | :--- | :--- |
| `sanctuary.m4a` | | |
| `toronto.m4a` | | |
| `new_orleans.m4a` | | |
| `tokyo.m4a` | | |
| `accra.m4a` | | |
| `aurora.m4a` | | |
| `brush_along.m4a` | | |
| `cosmic.m4a` | | |
| `pulp.m4a` | | |
| `report.m4a` | | |
