# BLOOM — an aggressive visual-experience prototype

One contained stretch of the free‑3D field where reality will not hold still.
Built on top of the existing world as a self‑contained region
(`src/regions/bloom.js`, one line in `src/regions/index.js`). **No edits to
`src/game.js`.** Thin, Corner, Lamp, the room, progression, saves, puzzles and
navigation are untouched.

This is not a puzzle. It is a place — a proof of feel. The owner asked for FORM
that is visually unstable, beautiful, fluid and constantly becoming something
else. That is what this zone does, to the playable world itself, not as a
screen overlay.

## Where it is / how to reach it

A clear rectangle east of Lamp and north of Corner: `x 26..39.5, z 9..27.5`.
There are no reeds inside it and it overlaps no other region. In normal play it
is discoverable after Act I as a landmark light to the north‑east; you walk in
and it comes alive. For the prototype it is reachable immediately from a fresh
session in the browser console:

```js
__DA.jump3d(); __DA.setPos(33, 18);   // stand in the middle of BLOOM
```

## The first ten seconds

You walk in and the ground **melts and re‑forms under your feet** — the grid
lines pour like liquid and pull back together, colour flows across the surface.
Rings of **forms bud, divide, melt and pour into other forms** around you; for a
beat they almost fall into a shared symmetry, then let go. Everything near you
**leans in and breathes**. And your own path is **cut into the world as glowing
magma trenches that stay** — the field remembers exactly where you walked and
only slowly closes the wounds. A person who has never seen the game asks *"what
is this."*

## What is actually happening (all in‑world geometry)

- **The ground is a real displaced surface you stand on.** A 150×190 patch with
  its own shader, drawn just above the universe sheet. A slow domain‑warp melts
  the grid horizontally (continuous — it flows, it never tears); a closed‑form
  swell + a heaving dome make depth and perspective bend; a breath halo centred
  on the player makes nearby ground inhale/exhale. `mapPoint` reproduces the
  swell in JS so the avatar rides the exact surface it sees.
- **Persistent player deformation.** A CPU heightfield (kept in lockstep with an
  8‑bit texture the shader samples) is stamped where you walk and heals on a
  ~13 s half‑life. The ground vertex shader sinks into it; the fragment paints a
  magenta→orange→white‑hot magma trench with a lit rim on the steep walls. You
  glide *over* your own gouges (never sunk into them) so the avatar stays the
  clearest thing on screen.
- **Morphing blooms.** One `InstancedMesh`, one draw call, ~37 forms on three
  concentric rings. Each morphs between an icosahedron and a knobby coral in its
  own vertex shader, buds/divides via a drifting radial‑lobe count, melts along
  its normal, and inhales/exhales when you come near. A coherence wave pulls
  every form's morph toward a common phase for a beat (the ring snaps toward
  rotational symmetry) then releases it. Their colour shifts as they morph, so a
  form *becomes* another form and reads as another colour on the way.

## Legibility (the non‑negotiable)

- The cyan **structural grid** survives on top of all the melt: the floor still
  reads as a floor.
- The **player + shadow** are the core's own, untouched, and always the
  brightest, clearest thing. The avatar is never sunk into a trench.
- Displacement is bounded and the walkable coordinate frame is rigid — the pad
  never feels broken. Movement, camera and navigation are exactly as before.
- The zone stays hidden until you are near (tight reveal during Act I, a
  landmark afterwards), so the sequence stays pristine and the effect blooms in
  as you approach rather than glowing on the horizon.

## The impossible moment

Walking the same ground twice: the world is already scarred by your first pass,
the grid pouring around a glowing canyon you cut a minute ago that is only now
healing shut.

## What I did not do, and why

- **No post‑processing / screen overlay.** The brief demanded the change happen
  to the playable world; every effect is real geometry, so a phone screen
  recording shows the world mutating, not a filter.
- **No true topological splitting** of the blooms (real divide‑and‑reconnect
  needs remeshing). The lobe‑budding + morph reads as dividing/reconnecting for
  a fraction of the cost and stays one draw call, which matters on a phone.
- **The global sheet shader is untouched** (per `docs/WORLD.md`). BLOOM draws
  its own ground patch and agrees with it in `mapPoint`, the sanctioned way.
- **No integration into the perception progression yet** — as asked, that
  decision is left for after this exists. Hooks are in place: it is a normal
  region with `done()`/`save()`/`load()`, currently kept out of the Act sequence.

## Tests

`tests/bloom.mjs` (headless, 390×844): the zone builds after the crossing and
does not throw; it stays hidden from across the field; walking in enters it and
the avatar stays readable on the surface; a walk carves a persistent
deformation that then heals; leaving hides it again; save/load restores it. The
rest of the suite stays green (progression, Thin/Corner/Lamp, room, saves).

Note: because BLOOM sits directly against Lamp's east edge, an early version
revealed the arena while the player was still inside Lamp, and its first-frame
shader compile hitch disturbed Lamp's timing-sensitive look-back test. Fixed by
(a) never revealing/rendering BLOOM while the player is attributed to another
region, and (b) pre-compiling BLOOM's shaders at build time so its first render
never stalls. Lamp is untouched and green with BLOOM loaded.

## Frames (390×844)

| before (plain field) | arrival | forms morphing |
|---|---|---|
| `frames/bloom-prototype/00-field-baseline.png` | `frames/bloom-prototype/01-arrival.png` | `frames/bloom-prototype/07-among-blooms.png` |

| carved glowing trench | crater under the avatar | rainbow bloom field |
|---|---|---|
| `frames/bloom-prototype/T1-long-trail.png` | `frames/bloom-prototype/T2-crater.png` | `frames/bloom-prototype/05-blooms.png` |

A silent ~10 s capture is in `tools/record.mjs` (writes a `.webm`).
