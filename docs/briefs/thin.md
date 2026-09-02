# Brief: THIN (region id `thin`)

Pitch: `docs/ideation/E-feel.md` → "E3 — Thin". Critics: search "E3" in
`docs/ideation/critic-1-feel.md`, `critic-2-math.md`, `critic-3-producer.md`.
Contract: `docs/WORLD.md`. Read all of it, and read `src/game.js` end to end.

## Where

`bounds:{x0:4,x1:26,z0:-27,z1:-11}`, north of the room. `entrance` at
`(9,0,-12.5)`. The player arrives walking "left" on the pad (toward `-z`).

## The toy (first ten seconds)

A pale column of light, ~3 units across, stands on the floor a few steps past
the entrance light. Walk into it and you squash flat: `setFlat()` driven by a
spring so the disc overshoots (flat peaks ~1.25 then settles at 1) in about
0.3 s, with a soft *thwump* (`slide(220,90,.18,.1)`), a ripple ring, and the
column brightening. The camera swings overhead (the core does this from
`flat`). Walk out and you pop back with the same overshoot. The player will
do this five times in a row. Make sure it feels like a trampoline: tune the
spring until the squash is snappy and the pop has a visible bounce.

Colour drops while flat: dim everything except the column, the slots, and the
player (e.g. a full-screen veil at ~.35 opacity, or set `renderer.toneMappingExposure`
lower while flat; put it back on exit).

## The rule

"Flat me fits through the slot." Two or three thin walls (height ~2.4) cross
the region, each with a 0.15-unit slot. A full-size player cannot pass a slot
(your `constrain` blocks the wall except at the slot, and blocks the slot
unless `flat > .8`). A disc slides through. The walls stand *inside* the
column's reach: the column is wide enough, or there are two columns, so the
player can be flat when they reach a slot. Design the layout so the first
slot is 2–3 steps from the first column.

## The impossible moment

Past the second slot there is a gap in the floor, 1.2 units wide, dark, with a
luminous rim. Full-size, walking into it drops you: the player sinks (scale
down + fall sound) and is put back on the near lip after 0.6 s (no death
screen, no words). Flat, the gap has no width: you walk straight over it (the
rim dims to a hairline while flat so the player *sees* it lose its width).
Beyond the gap, a light (`makeLight`) marks the goal; reaching it sets `done()`.

Also while flat: any two reeds within your bounds that are close in `x` but
far in `z` ring together when you touch one (use `ringLandmark` on both). Cheap,
optional, do it if time allows.

## Later (optional, only if everything above is solid)

A second, identical-looking column that deletes `x` instead of `y`: stepping
in does not squash you, but the world's reeds inside the region collapse along
`x` (scale their pivots' x toward the column's x). Skip if it muddies the
first rule.

## Controls

No new buttons. Pad only. `constrain` is where the slot and gap logic lives.
Never make the pad feel broken: when a wall blocks, slide along it, thud
softly, ripple at the contact point.

## HUD

`hud(){return {label:'SLOTS', n:slotsPassed, total:slotCount}}`; call
`refreshHud()` when it changes. `done()` when the goal light is reached.
`save()`/`load()` persist `slotsPassed`, `done`.

## Prompts

None for the toy. After 8 s stuck at a slot at full size: `'Flatten first.'`
Nothing else. Hide with `setPrompt('')` on leave.

## Test (`tests/thin.mjs`)

At 390×844 mobile: `jump3d()`, `setPos()` near the entrance, drive into the
column, assert `__DA.flat > .9` within 1 s and a peak above 1.05 (overshoot);
drive out, assert `flat < .1`; try a slot at full size, assert blocked; go
flat, pass it, assert `state.slotsPassed` increments; drop into the gap at
full size, assert the player is back on the near lip; cross it flat, reach
the goal, assert `done`. Then `save()`, reload, `applySave`, assert restored.
Screenshots: flat in the column, at a slot, over the gap.
