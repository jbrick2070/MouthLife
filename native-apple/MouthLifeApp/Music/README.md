# MouthLife Drop-In Suno Soundtrack & Live Earth Radio

Drop any `.m4a` (recommended AAC `160–256 kbps` for hardware-decoded zero-CPU playback on iPhone), `.mp3`, `.caf`, or `.wav` tracks directly into `MouthLifeApp/Music/` and rebuild `MouthLife`.

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
