# DIMENSIONAL AWAKENING

> **How many dimensions can you perceive?**

A game where the player never unlocks stronger abilities — they unlock richer
ways of perceiving reality. Progression is not weak → powerful; it is
unaware → perceptive, and eventually object → participant → observer → author
of the rules.

**North star:** Simple hands. Deep mathematics. Impossible perception.

The full concept document — gameplay philosophy, dimensional progression,
psychedelic design principles, trailer assets, and the prototype postmortem —
lives in [`docs/HANDOFF.md`](docs/HANDOFF.md).

## What's in this repo

| File | Purpose |
|---|---|
| [`index.html`](index.html) | The game shell (markup, CSS, import map). No build step |
| [`src/game.js`](src/game.js) | The core: sheet, fold, birth of depth, the room, reeds, save/continue, the region registry |
| [`src/regions/`](src/regions/) | Every other place in the universe, one file each. See [`docs/WORLD.md`](docs/WORLD.md) for the contract |
| [`tests/`](tests/) | Headless Playwright suite: `bash tests/run.sh` (add `PORT=8905` to run beside another checkout) |
| [`tools/bundle.py`](tools/bundle.py) | Builds the single-file artifact with esbuild (`python3 tools/bundle.py out.html`) |
| [`test0.html`](test0.html) | **Test 0** — minimal input diagnostic with no Three.js. Open this first on a phone to prove tap input works before debugging anything else |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | Complete design/concept handoff document |
| [`docs/prototype-v5-archive.html`](docs/prototype-v5-archive.html) | Archived V5 prototype (pre-fix, kept for reference) |

## Playing it

Once GitHub Pages is enabled (Settings → Pages → Source: **GitHub Actions**),
every push to `main` deploys automatically:

- `https://<user>.github.io/dimensionalawakening/test0.html` — input validation
- `https://<user>.github.io/dimensionalawakening/` — the game

Local: `python3 -m http.server 8000` in the repo root, then open
`http://localhost:8000`. (ES modules need a server; `file://` will not load.)

Progress is saved at every checkpoint. Reloading offers **Continue** (back in
3D, the room where you left it) or **Start over**.

**Controls:** WASD / arrow keys, or the on-screen pad (tap for a step, hold to
keep moving). After the first seed, drag the glowing cyan seam to fold space.
Walk through the pillars, or tap one, to ring it.

## The V7 vertical slice

Two dimensions, one crossing:

1. **2D — the sheet.** Seen straight from above. Move toward the light; the
   glowing edge will not let you pass.
2. **Fold.** Grab the edge and pull: the far half of the sheet lifts toward
   you and squeezes onto the edge — the far side is touching it.
3. **Birth of depth.** Walk into the edge. The camera falls out of the sky and
   lands behind you; the marks on the sheet extrude into pillars; you cast a
   shadow. *"You lifted the paper. Now you are standing on it."*
4. **3D — the room.** Follow two more lights, then something pours dots at a
   wall with two openings. A big screen at the back of the room shows where
   they land, and a ghost picture of the shape it wants. Paint it:
   two piles (stand close, watch) → stripes (step away, or hold the eye to
   close yours and *hear* them land) → one pile (stand in an opening and block
   it). Then a second edge: pull it and the screen folds closer, squeezing the
   picture — one more pattern needs it. The mathematics is never named.

A single variable, `dim` (0 → 1), drives the whole shift: camera height and
field of view, the player's disc-to-sphere crossfade, pillar extrusion, fog,
and even which way "up" on the d-pad points (screen-relative, so it stays
intuitive on both sides of the crossing).

### Design principles this build follows (see `docs/HANDOFF.md`)

- Simple hands: move, pull, walk into it, stand somewhere, close your eyes.
- The math is hidden: no "fold", "slit", "quantum", "interference" anywhere.
- Psychedelia grows from the mechanics — ripples from footsteps, colour that
  drifts as you awaken, a world that breathes — never painted on.
- UI speaks the world's language: ripple rings on key presses, text that
  condenses out of blur, diamond pips, an eye that squints shut.

## Testing protocol (per handoff §20)

1. Deploy. On an iPhone, open **`test0.html`** in Safari. Tap arrows; the dot
   must visibly move and the counter must increment. This isolates input from
   everything else.
2. Only after Test 0 passes, open **`index.html`** and play the slice.
3. File whatever breaks as an issue with a screenshot — camera, input, and
   fold problems are now separable.

## Roadmap

- [x] Validate Test 0 + V6 on iPhone Safari — done, input proven on a real phone
- [x] Juice the fold-crossing moment (camera rolls with the fold, FOV punch)
- [x] Psychedelia pass 1: touch ripples, impossible color, inverted flashes,
      breathing world (all tied to player actions, scaling with awakening)
- [x] **Stage 2: the two-gap wall** — an observation puzzle. Dots pour at a
      wall with two gaps; unwatched they land in stripes, watched (stand near,
      eyes open) they land in two piles; your body can block a gap; a
      hold-to-close-your-eyes button lets you *hear* what you can't see.
      Fill all three detector pads to finish. The math is never named.
- [x] **V7: the dimensional shift.** Crossing the fold is the birth of depth
      (2D → 3D); stage 2 lives in the 3D room with the pattern painted on a
      big screen you face
- [x] **Octave: the marks are reeds.** Every pillar is an overtone of one
      string (heights 2.4 1.6 1.2 .8 .6 .4 = A E A E A E). Walk through one or
      tap it: it sways, rings, and sends a ripple in its own colour across the
      sheet. Tall sounds low, short sounds high, same colour is the same note.
      Ring two of the same colour at different heights within a second and they
      flash white, a thread snaps taut between them, and they are one pillar:
      walk into either and you come out of the other, mid-stride. Ring two
      different colours instead and a new, shorter reed grows between them. No
      goal, no words; it is a toy that later becomes a second kind of "near"
- [ ] The subtle impossibility: a reflection somewhere it shouldn't be
- [x] **A second edge that composes with the first.** After the third pattern a
      new edge appears across the room; pull it and the far end (screen
      included) folds up toward you. The screen is closer, so the picture
      squeezes: one more pattern (narrow stripes) can only be painted with the
      edge pulled; a tap on the edge toggles it. Fold space to change what the
      lights do
- [x] **The universe.** The sheet is 80×56; the room is one region of it
      and you can walk around it; reeds fill the field; every region has an
      entrance light and the arrow points to the nearest one you have not
      visited; progress is saved and Continue skips the replay
- [ ] Regions in flight: Thin (north), The Corner Comes to You (east), Lower
      the Lamp (south), Beads (the 2D page) — see `docs/briefs/`
- [ ] Then: more dimensions, procedural worlds
