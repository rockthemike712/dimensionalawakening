# Act I, the FORM pass

The visual pass the experience edit deferred (`docs/reviews/act1-experience-edit.md`).
The owner's reaction to the experience edit was that the game "looks almost
exactly the same", which was true and by design; this pass is the one that
changes how it looks, within the handoff's own rule: **the psychedelia
happens to the playable space, it does not replace it.** Early game is living,
shifting FORM. Sacred geometry only flickers as an almost-seen order.

## The references

Two clips and a moodboard from the owner. The first clip is a lattice whose
cells undulate and drift under a slow domain warp with thin iridescent
fringes on the cell edges, regions of it almost snapping regular and then
flowing again. The second is a soft luminous ring whose edge is a chromatic
fringe and whose shape melts and re-forms. They map straight onto this game:
the floor is a grid, and the player, the lights and the ripples are rings.
The palette stays the game's own dark navy and cyan; the references' rainbow
lives on the edges, never in the fills.

## The three edits, and the one carry-over

### 1. The sheet breathes (`src/game.js`, the sheet shaders)

The floor undulates and drifts under a slow planar warp (two sin/cos terms and
one value noise, continuous in time), faintly on the page and fully once
awake, which in real play is the whole field since three lights and the
crossing saturate awakening. The player's wake excites it locally. It holds
still while the sheet is being folded or the player is flattened, and stays
straight for three units either side of the seam so the edge always reads.
The grid lines carry a thin iridescent fringe, a cool and a warm side whose
hue drifts with the warp; the fills stay dark and cyan stays dominant. Every
eleven seconds or so a wave of coherence crosses the floor by position, the
lines settling straight and clean for a moment before the drift returns.

Two things were removed at review. The agent's first version raised the
floor as well as warping it, and the swell lifted the sheet over the shadows,
rails and markers that lie a few centimetres above it; the warp is planar
only now. And a stepped noise term popped every eight seconds; it is blended.

### 2. Forms morph (`src/game.js`, reeds, player, lights)

Small hooks on the existing materials rather than new material types, so the
regions that set a light ring's colour or opacity keep working. Each reed has
its own slow phase: height and girth breathe out of step, the tip drifts a
little on top of the brush spring, and a fresnel rim carries a slow hue drift
of its own while the body colour stays the note (colour is the note; the
Octave's rule is untouched). The player's sphere keeps its white core under a
thin iridescent rim and a barely-there surface wobble; the page's disc trades
its hard edge for a soft chromatic one; the player's ring and every light's
ring breathe around their circumference with a two-tone fringe on the lips.
Faint on the page, full once awake, calm while flat so Thin's overhead frames
stay clean. Programs are keyed by the values the hooks bake into their GLSL,
so materials with different settings never share a compile.

### 3. The room rises as structure (`src/game.js`, the room)

The previous two judges called the rise a pale slab. The slab was the
screen's opaque frame, seen from the field side during the camera's turn.
The rise is now staged over three seconds: posts on a spring, walls growing
up between them from the centre outward with their lit top edge riding up,
the screen and its frame unfolding from the floor at the back, the emitter
last. Every part grows from its own base, so the final pose is identical and
Continue snaps straight to it. The walls, posts and frame wear one material
that carries the floor's language: a dark translucent face with the breathing
cyan grid, a faint fringe on the lines and a fresnel glow on the silhouette.
The screen is translucent so that from the field side the structure reads
through it, and the turn fires from far enough back that the whole room fits
the frame. When the room appears the sheet's awakening bumps and a ring of
ripples runs out from the crossing across the whole field.

## What was deliberately not done

- **The Corner's ground patch.** The Corner draws its own sheet patch with a
  copy of the sheet shader so its two hinges can fold it, and that copy is
  untouched: inside the Corner the floor is still a plain grid while the
  world around it breathes. Porting the warp and fringe into that copy is a
  region change and belongs to the Corner's next revision.
- **Post-processing.** No bloom, no chromatic aberration, no kaleidoscope.
  Everything here is in the world's own shaders and tied to a rule
  (awakening, the wake, the fold, flatness, the coherence cycle).
- **PATTERN and STRUCTURE.** No synchronised repetition, no clean tessellation,
  no lattice revealed. The coherence wave is the only almost-order and it
  dissolves every time.
- **The 2D page's marks and beads.** Unchanged.

## Cost

Headless frame rate on the software renderer, state (3) of the brief, before
against after, per edit as measured by its implementer: the sheet about
eight percent, the forms about eight to ten percent under matched load, the
room about five percent. All within the fifteen percent budget the brief set.
A phone GPU will fare better than the software renderer on all three.

## Evidence

_(filled in from the final on-foot run of the merged tree)_
