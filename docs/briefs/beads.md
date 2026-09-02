# Brief: BEADS (region id `beads`, a page region)

Pitch: `docs/ideation/E-feel.md` → "E5 — Beads". Critics: search "E5" in the
three `docs/ideation/critic-*.md` files. Contract: `docs/WORLD.md`. Read all
of it, and read `src/game.js` end to end, especially the 2D page (`PAGE`), the
fold (`fold`, `foldedPoint`, the vertex shader), the seed lights, and the
d-pad / pointer handling.

## Where

The 2D page, before the crossing: `page:true`, `bounds:PAGE`
(`x -11..-.45, z -8..8`), no entrance light (the core skips it for page
regions). Built at start; `update` runs while `!crossed`. After the crossing
the beads stay on the page as scenery (still simulated cheaply or frozen).

## The toy (first ten seconds)

~300 tiny glowing beads (one `InstancedMesh`, small spheres or flat discs,
additive) scattered on the page. Tilt the phone and they all roll together
with a soft granular hiss (short `blip`s at random high pitches, throttled to
a few per frame, gain by total speed) and ripple trails (`emitRipple` on the
densest cell, throttled to ~4/s). Tilt back: they slosh and overshoot.
Integrator: `v += g*dt; v *= .92^ (dt*60); p += v*dt`, bounce off the page
edges (`PAGE`), and do **not** cross the edge at `x=0` unless the sheet is
folded (see below). They must never touch the player's movement.

**Input.** `DeviceOrientationEvent` (beta/gamma), requested from the first
real tap on iOS 13+ (`DeviceOrientationEvent.requestPermission` inside a
user gesture — hook the existing pad `pointerdown`), calibrated to the
angle at grant time. **Fallback that is not second-class:** one-finger drag
on empty world (not on the seam grab, not on a reed) tilts a virtual tray
proportionally to the drag offset, springing back on release. Desktop gets
the drag. Never tilt the camera; only the field.

## The rule

The floor is not flat where it looks flat. Five dents (hidden Gaussian wells
of the potential) sit on the page. Beads pool in them. When ~40 beads sit in a
dent it fills: a ring of light rises there, a chord (`blip` ×3), a strong
ripple, and the dent stays lit. Three lit dents: every reed on the page rings
in sequence (use `ringLandmark`), the edge glows brighter for a few seconds
(`addAwake(.1)`), and the first light (`seedData[0]`) pulses harder. That is
the whole payoff for the page; it is a toy that foreshadows.

## The impossible moment

Fold the sheet (the player already can, after the first light) and tilt
toward the edge: the beads roll to the edge and arrive on the far, lifted
half **without crossing the middle** — they pour across the fold. Implement:
when `fold > .68` and a bead reaches `x ≈ 0` moving `+x`, teleport it to
`x = +.5` on the far side and let it keep rolling; draw beads on the far half
with `foldedPoint`. The far half is off the page's bounds; keep those beads
inside `x 0..11, |z|<8`.

## Controls

Tilt or drag. Nothing else. The pad must keep working exactly as before.
Do not add prompts. The only allowed text: none.

## HUD

None (the page shows LIGHTS). Persisting is not needed; `save()` may return
`{lit:n}` so Continue restores lit dents if you like.

## Test (`tests/beads.mjs`)

At 390×844 mobile: assert the instanced mesh exists with ≥ 250 beads
(`debug()` returns counts); simulate tilt by calling a debug setter
(`__DA.regions[i].state` cannot be set — expose `window.__DA_beads.tilt(x,z)`
from your module for tests only) and by dragging on empty world; assert the
mean bead position moves in the tilt direction; tilt toward a known dent
(expose dent positions in `debug()`) and assert it lights within 15 s; assert
the pad still moves the player (`__DA.moves` increments). Screenshots:
beads rolling, a lit dent, beads pouring across the fold.
