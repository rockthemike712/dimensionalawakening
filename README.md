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
| [`index.html`](index.html) | **Fold Prototype V6** — the current playable vertical slice (Three.js, single file, no build step) |
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

## The V6 vertical slice

The loop from the handoff, made real:

1. **Move** toward the beacon → collect the first seed.
2. A **wall of light** along the seam blocks the far half of the world.
3. **Grab the seam and pull** — the far half of the plane folds up and over.
4. Fold far enough and the two halves **touch**: walking into the seam carries
   you across space to the far side.
5. Collect the remaining seeds. *"You were never moving through space. You
   were changing what space meant."*

### Fixes over V5 (see handoff §18–19)

- **D-pad rebuilt on pointer events** — a tap gives an immediate, clearly
  visible movement impulse; holding keeps you moving. V5 used `onclick`,
  which was unreliable in embedded viewers and gave imperceptible steps.
- **Fold drag no longer hijacks every touch** — V5 started a fold drag on any
  canvas `pointerdown`, so stray touches silently bent the world. V6 raycasts
  against a fat invisible collider around the seam; you must actually grab it,
  and folding only unlocks after the first seed.
- **The seam is now a real obstacle** — V5's fold was optional decoration; in
  V6 you cannot reach seeds 2 and 3 without folding, which is the entire
  point of the mechanic.
- **Portrait camera frames player + objective together**, movement counter
  confirms input on screen, safe-area insets respected, double-tap zoom and
  scroll-bounce suppressed for iOS Safari.
- **Audio feedback** (Web Audio, unlocked on first gesture): movement blips, a
  collect chime, and a drone that deepens as you fold.

## Testing protocol (per handoff §20)

1. Deploy. On an iPhone, open **`test0.html`** in Safari. Tap arrows; the dot
   must visibly move and the counter must increment. This isolates input from
   everything else.
2. Only after Test 0 passes, open **`index.html`** and play the slice.
3. File whatever breaks as an issue with a screenshot — camera, input, and
   fold problems are now separable.

## Roadmap

- [ ] Validate Test 0 + V6 on iPhone Safari (the current milestone: *make the
      first 30 seconds genuinely fun and completely obvious on a phone*)
- [ ] Juice the fold-crossing moment (the "something impossible happened" beat)
- [ ] Second fold puzzle with no text (handoff §28, 2:30–3:30)
- [ ] The subtle impossibility: a reflection somewhere it shouldn't be
- [ ] Then — and only then — TypeScript/Vite project structure, more
      dimensions, shaders, procedural worlds
