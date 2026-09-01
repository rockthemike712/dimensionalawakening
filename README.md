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
| [`index.html`](index.html) | **V7** — the current playable vertical slice: 2D sheet → fold → birth of depth → 3D room (Three.js, single file, no build step) |
| [`test0.html`](test0.html) | **Test 0** — minimal input diagnostic with no Three.js. Open this first on a phone to prove tap input works before debugging anything else |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | Complete design/concept handoff document |
| [`docs/prototype-v5-archive.html`](docs/prototype-v5-archive.html) | Archived V5 prototype (pre-fix, kept for reference) |

## Playing it

Once GitHub Pages is enabled (Settings → Pages → Source: **GitHub Actions**),
every push to `main` deploys automatically:

- `https://<user>.github.io/dimensionalawakening/test0.html` — input validation
- `https://<user>.github.io/dimensionalawakening/` — the game

Local: `python3 -m http.server 8000` in the repo root, then open
`http://localhost:8000`. (A plain `file://` open also works in most desktop
browsers since the only dependency is Three.js from a CDN.)

**Controls:** WASD / arrow keys, or the on-screen pad (tap for a step, hold to
keep moving). After the first seed, drag the glowing cyan seam to fold space.

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
   it). The mathematics is never named.

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
- [ ] The subtle impossibility: a reflection somewhere it shouldn't be
- [ ] A second fold seam that composes with the first (handoff §11)
- [ ] Then — and only then — TypeScript/Vite project structure, more
      dimensions, shaders, procedural worlds
