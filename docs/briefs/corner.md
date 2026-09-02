# Brief: THE CORNER COMES TO YOU (region id `corner`)

Pitch: `docs/ideation/D-dimensions.md` → "D2 — The Corner Comes to You".
Critics: search "D2" in the three `docs/ideation/critic-*.md` files.
Contract: `docs/WORLD.md`. Read all of it, and read `src/game.js` end to end,
especially the fold drag (`seamGrab`, `dragging`, `endDrag`), the sheet
vertex shader (`uFold`, `uFold2`), and `foldedPoint()`.

## Where

`bounds:{x0:15,x1:39,z0:-9,z1:9}`, east of the room. `entrance` at
`(16.5,0,0)`. The player arrives walking "up" on the pad (toward `+x`).

## Your own ground

You own a sheet patch covering your bounds: a `PlaneGeometry(24,18,120,90)`
at `y=+.02` centred on `(27,0,0)`, with a **clone of `planeMat`** whose
vertex shader adds two hinges of your own: edge A along `z` at `x=27`
(folds the far half `x>27` up and toward the player, exactly like the first
fold: `theta=uA*1.42`), and edge B along `x` at `z=0` (folds the half `z>0`
up and over, `theta=uB*1.42`). Apply them in the order given by a uniform
`uOrder` (0 = A then B, 1 = B then A). Keep the fragment shader identical to
the core's (copy it) so the patch looks like the same paper; add a rim light
on the doubly folded quarter (brighten where both hinges apply) and dim the
un-folded ground directly under it.

`mapPoint(p)` must apply the same two rotations in the same order on the CPU,
so the player and lights ride the fold exactly. Test that a light placed on
the far quarter renders where the folded ground is.

## The toy (first ten seconds)

Two glowing edges cross in an X, same look as the core's seam (`seamMat`,
halo, hidden grab box). Horizontal drag on edge A folds it (like the first
fold the player already knows); vertical drag on edge B folds it. Each latches
open or shut on release, tap toggles (copy the `endDrag` behaviour). Pulling
one edge is the fold the player already loves. Pulling both is the toy: the
far quarter swings up, over, and lands **on top of where the player stands**,
upside down. Ripples along both edges on every change, the fold hum
(`blip`/`slide`) as it moves.

## The impossible moment

The light at the far corner `(37,0,7)` (the region's own `makeLight`, not the
entrance) is now hovering right in front of the player. And a **mirrored copy
of the player** (a second sphere + shadow, drawn at `mapPoint` of the
player's mirror position through the fold) stands in the folded quarter,
moving mirror-image. Walking into the folded light collects it (ripple,
chime, `pulseFlash`) and unfolds the region.

## The rule (order matters)

Two lights, two gates. Fold A then B and the corner lands at one spot; fold B
then A and it lands elsewhere with opposite handedness. Place the first light
so that only order A→B brings it to the player, and a second light so that
only B→A does. `done()` when both are collected. The player discovers "I did
it in the wrong order" by undoing (tap an edge) and redoing. No words about
order. After 10 s of both edges pulled and no light in reach: prompt
`'Unfold. Pull the other one first.'` — the only prompt in the region.

## Legibility

A doubly folded plane from a low camera is soup. Non-negotiable: the folded
quarter has a bright rim, the ground under it dims hard, the mirrored player
is unmistakable, and the light that lands near you has its beam on. Take
screenshots at 390×844 at each fold state and look at them yourself.

## Controls

Existing gestures only: grab an edge and drag perpendicular to it; tap to
toggle. Make sure your grab boxes do not steal taps from the reeds outside
your bounds, and that the core's first-fold grab (`seamGrab` at x=0) is not
reachable here (it is far away; fine).

## HUD

`hud(){return {label:'CORNERS', n:collected, total:2}}`. `save()`/`load()`
persist collected lights and fold state (unfolded on load is fine).

## Test (`tests/corner.mjs`)

At 390×844: `jump3d()`, `setPos(17,0)`, project edge A's grab point with
`__DA.project`, drag horizontally, assert `state.foldA > .9`; drag edge B
vertically, assert `state.foldB > .9`; assert the first light's mapped
position is within 2 units of the player; walk into it, assert `collected=1`;
tap both edges off, fold in the other order, collect the second, assert
`done`. Save/reload/apply, assert restored. Screenshots at each state.
