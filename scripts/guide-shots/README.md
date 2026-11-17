# Retaking the How to Play pictures

The guide shows real pictures of the game (`src/assets/guide/`, also bundled into the native app as
the `guide` folder). They are photographed from the running web game by these scripts, so they can
be retaken whenever the game's look changes (a new ship colour, a new enemy, and so on).

Nothing here is part of the game. It needs Node 22 or newer and Google Chrome.

```bash
# 1. The game, served locally (leave it running). Do not edit anything under src/ during the run:
#    the dev server reloads the page and the run stops early.
npm run dev
```

```bash
# 2. A helper that writes the photographed frames to a scratch folder (it prints where).
#    Never point it at src/: each new file there reloads the page and ends the run after one picture.
node scripts/guide-shots/save-server.mjs
```

```bash
# 3. A hidden, muted Chrome with its own empty profile, so it starts as a brand-new player
chrome --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/mouthlife-shots --window-size=1280,800 --mute-audio --enable-gpu --no-first-run http://localhost:5173/
```

```bash
# 4. Stage and photograph everything (about two minutes). It prints the picture count: 26.
node scripts/guide-shots/cdp-eval.mjs --dpr=2 --w=1280 --h=720 --reload --timeout=170 scripts/guide-shots/lib.js scripts/guide-shots/shots.js
```

5. Look at `contact-sheet.jpg` in the system temp folder, then copy the 26 pictures from the scratch
   folder into `src/assets/guide/`.

What the files do:

- `lib.js` freezes the game and gives helpers to place the ship, step the simulation by hand, zoom
  the camera, and grab the picture straight after it is drawn.
- `shots.js` stages each picture: 16 frames for the cards (640 x 360) and 10 close-ups for the field
  guides (240 x 240).
- `save-server.mjs` receives the pictures from the page and writes them to disk.
- `cdp-eval.mjs` runs the two scripts inside the hidden Chrome. If it prints `undefined`, the page
  was reloaded mid-run: check nothing under `src/` changed, then run it again.

`tests/tutorial.test.ts` checks that every picture the cards ask for exists, that nothing is left
over, and that the set stays under 1 MB.

If a card gains or loses a picture, update `src/config/tutorial.ts` and
`native-apple/Sources/MouthLifeCore/Config/TutorialGuide.swift` together.
