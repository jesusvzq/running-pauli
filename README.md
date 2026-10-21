# Running Pauli

A Chrome-dino-style endless runner: jump over beer bottles. From score 300 the ground also has big holes, wider than any jump, with a flying platform over each: jump onto the platform, then jump (or run) off the far end. Falling in ends the game. Mobile friendly (tap to jump), also plays with mouse click or Space / Up / W.

Vanilla HTML + JS + canvas. No dependencies and no build step.

## Run locally

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000>. (It must be served over http: the game uses ES modules, which browsers block on `file://`.)

### Try it on your phone

Same Wi-Fi as your computer:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
ipconfig getifaddr en0   # your computer's IP on macOS
```

Then open `http://<that-ip>:8000` on the phone.

## Tests

```sh
node --test
```

Covers the game logic in `logic.js`: jump physics, collisions, spawn spacing, speed cap, restart lockout, holes and platforms. It also includes a bot that plays 2 minutes on 20 seeds, to prove every bottle and hole layout can be cleared.

## Files

- `index.html`, `style.css`: page and layout
- `logic.js`: pure game rules (no DOM), covered by `logic.test.js`
- `game.js`: canvas drawing, input and the game loop

## Adding your friend's face

1. Put a square-ish photo in `assets/` (e.g. `assets/face.png`).
2. In `game.js`, set `FACE_SRC = 'assets/face.png'`.

The image is clipped to a circle and drawn as the character's head, replacing the placeholder smiley.

## Deploying to Vercel

It is a static site with `index.html` at the root, so it needs no configuration. Import the repo in Vercel, or run `npx vercel` from this folder.
