# MouthLife Drop-In Suno Soundtrack Folder

Drop any `.m4a` (recommended AAC 160–256 kbps for hardware-decoded zero-CPU playback on iPhone), `.mp3`, `.caf`, or `.wav` tracks directly into this `MouthLifeApp/Music/` folder and rebuild `MouthLife`.

`NativeSoundEngine` (`SunoStreamDeck`) automatically detects bundled tracks at runtime, crossfades between scenes (`850ms` dual-deck crossfade), puts the procedural synth music bus completely to sleep (`~0%` CPU), and keeps real-time harmonic chord tracking active so glass-harp tooth notes, sonic-foam scrubs, and district chimes stay in key.

## Quick Test (Single Song)
If you want to test **one** Suno song across the whole app right away, name it:
- `background.m4a` (or `background.mp3`) — used automatically for any scene that doesn't have its own dedicated file below.

## Scene-Specific Filenames & Matched Keys / BPMs
Prompting Suno in the matching key lets interactive tooth chimes and combo flourishes harmonize naturally with your song:

| Filename | Scene / World | Matched Key & Mode | Suggested BPM | Vibe Prompt Ideas |
| :--- | :--- | :--- | :--- | :--- |
| `hub.m4a` | Companion Arch Hub (also covers Globe & Ready states unless `hub_globe.m4a` / `hub_ready.m4a` are added) | **F Major Pentatonic** (`Fmaj9`) | `84 BPM` | Warm cozy lo-fi Rhodes, kalimba, sunlit morning bathroom sanctuary, instrumental |
| `brush_along.m4a` | 2-Minute Daily Brush-Along Pacer | **G Major** (`Gmaj7`) | `108 BPM` | Uplifting marimba & warm synth groove, crisp shaker pulse, feel-good routine, instrumental |
| `cosmic.m4a` | Cosmic Intro (Deep Time -> Living Arch) | **C Major Pentatonic** (`Cmaj9`) | `58 BPM` | Ambient celestial glass bells, warm analog pad, weightless orbital sunrise, instrumental |
| `world_1.m4a` | World 1 — Plaque City (Toronto) | **C Lydian** (`Cmaj7` / `D`) | `112 BPM` | Bright arcade marimba & Rhodes, playful Nintendo-style biotech adventure, instrumental |
| `world_2.m4a` | World 2 — Biofilm Basin (New Orleans) | **Bb Major Blues** (`Bbmaj6`) | `104 BPM` | Swung brass/reed funk-jazz groove, warm Rhodes comping, vibrant bounce, instrumental |
| `world_3.m4a` | World 3 — Acid Caverns (Tokyo & Chicago) | **A Dorian** (`Am9` / `Fmaj7`) | `108 BPM` | Sleek Shibuya-kei synth-house & crystal bells, neon flow, instrumental |
| `world_4.m4a` | World 4 — Mineral Gardens (Accra & Lagos) | **G Major Pentatonic** | `118 BPM` | Joyful highlife kalimba, plucked guitar, warm percussion groove, instrumental |
| `world_5.m4a` | World 5 — Aurora Enamel (Reykjavik) | **E Lydian** (`Emaj9`) | `80 BPM` | Shimmering celesta & aurora synth pads, crystalline calm, instrumental |
| `pulp.m4a` | Pulp Rescue Boss / Emergency | **E Minor Pentatonic** (`Em7`) | `128 BPM` | Energetic arcade boss groove, driving bassline, heroic momentum, instrumental |
| `report.m4a` | Mission Report / Victory Summary | **D Major Pentatonic** (`Dmaj9`) | `76 BPM` | Cozy victory lounge Rhodes & soft celesta, relaxing reward screen, instrumental |

> **Tip:** Converting Suno `.mp3` downloads to `.m4a` on macOS takes one command and halves app bundle size while using Apple Silicon's dedicated hardware AAC decoder:
> ```bash
> afconvert -f m4af -d aac -b 192000 input.mp3 MouthLifeApp/Music/hub.m4a
> ```
