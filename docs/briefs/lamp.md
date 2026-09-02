# Brief: LOWER THE LAMP (region id `lamp`)

Pitch: `docs/ideation/B-observer.md` → "B1 — Lower the Lamp". Critics: search
"B1" in the three `docs/ideation/critic-*.md` files. Contract:
`docs/WORLD.md`. Read all of it, and read `src/game.js` end to end, especially
the seam drag (`dragging2`, `clientY`), the eye button (`setEyes`, `veil`),
and the room's floor marker.

## Where

`bounds:{x0:4,x1:26,z0:11,z1:27}`, south of the room. `entrance` at
`(9,0,12.5)`. The player arrives walking "right" on the pad (toward `+z`).

## The place

A ledge with a hole of black across it: the hole spans `z 17..22` for the
full `x` range of the region (a dark rectangle with a luminous rim; the
universe grid does not show inside it — draw a black plane at `y=+.03`).
A lamp hangs at `(15, 6, 14)`: a glowing octahedron (reuse `makeLight`'s
core or your own) on a vertical line of light from the sky. Under the player
is a **shadow** you draw yourself: a dark disc with a faint bright edge at
`S = L + s(P - L)` with `s = L.y/(L.y - .26)` (the player's centre height),
projected to the floor. Clamp `s` to ±40 and hide the shadow when
`|L.y - .26| < .05`.

## The toy (first ten seconds)

Walk. The shadow walks a little further than you. Grab the lamp (hidden grab
box like `seam2Grab`) and drag vertically: the lamp slides down its line of
light (clamp `y` to `.15..6`), the shadow races outward. Ripples where the
shadow lands on every step; the lamp hums as it moves (`foldOsc`-style
`slide`). Players will scrub the lamp up and down for no reason. Make the
shadow read: big, dark, crisp edge, a faint bright rim that gets brighter as
it nears the hole's far lip.

## The rule

"The lower the lamp, the further my shadow goes." You cannot cross the hole
(`constrain` blocks entering `z 17..22`; walking in = soft thud, slide along
the rim). Lower the lamp until the shadow stands on the far side.

## The impossible moment

Hold the **eye** for ≥ 0.5 s while the shadow is on solid ground on the far
side: the veil goes black, three footsteps panned across (`blip` ×3 over
~1.2 s), and the camera **dollies** (not cuts) to the shadow's spot over
0.35 s under the veil; the player is now where the shadow was and the shadow
is where the player was. If the shadow is over the hole, refuse: soft thud,
shadow flashes red for 0.2 s. The eye button already exists (`#eye`); it is
shown in the room only, so `show` it via `eyeBtn.style.display='grid'` in
`onEnter` and hide it in `onLeave` if the room is not active. Do not break the
room's use of the eye: only intercept the hold while the player is inside
your bounds (check `regionAt`/your own inside flag in a `pointerdown`
listener on `#eye`, or poll `S2.eyes` in `update`).

Beyond the hole, a light (`makeLight`) at `(15,0,25)`. Reaching it sets `done()`.

## Later (optional, only if the above is solid)

Pull the lamp below `.26`: the shadow flips to the wrong side of everything
(negative `s`, clamped). Swapping then lands you behind the lamp. Skip if it
confuses the first rule.

## HUD

`hud(){return {label:'SHADOW', n:swaps, total:1}}` or similar; keep it honest.
`save()`/`load()` persist lamp height and done.

## Prompts

None for the toy. After 8 s at the rim with the lamp untouched:
`'Pull the lamp down.'` After the shadow is across and the eye untouched for
8 s: `'Close your eyes.'` Nothing else.

## Test (`tests/lamp.mjs`)

At 390×844: `jump3d()`, `setPos(15,13)`, walk toward `+z`, assert blocked at
the rim (`pos.z < 17.2`); project the lamp with `__DA.project`, drag it down,
assert `state.lampY < 1`; assert `state.shadowZ > 22.5`; press and hold the
eye (`page.mouse.down` on `#eye` for 700 ms), assert `pos.z > 22`; reach the
light, assert `done`. Save/reload/apply, assert restored. Screenshots: shadow
short, shadow across the hole, after the swap.
