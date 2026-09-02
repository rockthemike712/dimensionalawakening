# E — MOMENT-TO-MOMENT FUN: toys, feel, and the player's body

Lens: things that are fun in the hand within ten seconds, that a player repeats
because it feels good, and that each hide one rule. Three of these live in the
weak part of the game (the 2D sheet, before the fold), two live after the room.
None touch the slit room.

Anchors in the current code they reuse: `emitRipple(x,z,s)` (6 ripple slots in
the sheet shader), the `landmarks[]` array of 22 pillars, the `dim` 0→1 driver,
`foldedPoint()`, the world-space pointer raycaster (currently only grabs seams),
the hold-to-close-eyes button, `blip()/chime()`.

---

## E1 — Corners

**Verb:** Touch. (Then drag to spin what you've become.)

**First 10 seconds:** On the far side of the room floor, a single bright corner
sits on the ground, humming, about the size of your own body. Walk into it and
it *snaps* onto you with a hard clack and a short elastic overshoot — you are no
longer a ball, you are a two-ended thing, a bright barbell about 1.6 units long.
Drag anywhere on the world with a thumb and you spin. Flick and you keep
spinning, and the ends throw ripples off the floor (`emitRipple` at each end
once per revolution). Ten seconds in, the player is spinning themselves for fun.

**The rule they discover:** Every corner I pick up gives me a new way to turn.

- 1 corner: a point. Dragging does nothing.
- 2 corners: a needle. Dragging spins it one way only.
- 3 corners: a triangle. Dragging spins it, and a hard flick *flips* it over —
  and on the flip its colour inverts and stays inverted until you flip it back.
- 4 corners: a tetrahedron. Now a drag can spin it in a way that is neither of
  the previous two, and the shape can no longer lie flat on the floor.

**The impossible moment:** With 4 corners, one particular drag direction rotates
the shape through itself: a corner travels *through* the middle of the body and
comes out the far side without passing an edge. Held at that angle for a second,
the shadow it casts on the floor has **five** corners, not four. The extra
shadow-corner sits under the camera.

**The misunderstanding (later):** The player believes they were collecting
corners. They were being assembled. The fifth corner in the shadow is the
observer — you are one vertex of a shape whose other vertex is the thing looking
at you, and the "impossible" rotation was ordinary all along, just seen from
inside. Playable consequence: the fifth corner can be grabbed and dragged, and
dragging it moves the camera as an object.

**Hidden math:** A k-simplex; each added vertex adds a dimension, and the
5-vertex simplex projected into 3D is what the shadow shows.

**Composes with:** Fold and dimension shift. A 3-corner (flat) player can lie
flat and slide *under* the fold crease, which a ball could never do. A 4-corner
player cannot lie flat, so the fold no longer lets them across — and when they
pull the seam anyway, the fold bends *them* (handoff §9: you were the thing
being folded). The eye button freezes the spin so the shape can be studied.

**Phone controls:** D-pad to walk into corners. One-finger drag on the world
(the existing `pointerdown`/`pointermove` raycaster path, when it does *not* hit
a seam) spins the body; drag distance → angle, release velocity → inertia with
a ~1.2 s decay. Hold the eye button → spin freezes, everything else keeps
moving.

**Build cost:** M (a day). Hardest parts: (1) making a spin drag feel good and
readable on a phone — the body has to be big on screen (scale the player group
~2× while spinning, pull the camera back 15%) and each corner has to click
audibly as it passes the near side, or the rotation is invisible; (2) the
5-corner shadow — a real 5-vertex projection is L-sized, so ship the beat as a
scripted 2-second shadow event first and only generalise if it lands.

**Risk:** Spinning a small object on a 6-inch screen reads as noise. If the
corners are not individually identifiable (distinct pitch per corner, distinct
size), the shape is a blob and the "new way to turn" rule never surfaces.

---

## E2 — Octave

**Verb:** Touch (brush past a pillar, or tap one at range).

**First 10 seconds:** The pillars already scattered across the sheet are now
reeds. Brush one at walking speed: it bends away from you like a struck reed,
rings a clean note, and a bright band runs up its length and off the top. Run a
line through six of them and you have played a phrase. Faster contact = louder
and brighter. There is no goal here and nothing is collected; the player does it
again because it sounds good.

**The rule they discover:** Tall ones sound low, short ones sound high.
(Pillar heights are quantised to 2.4 / 1.6 / 1.2 / 0.8 / 0.6 / 0.4 — the
harmonic series — instead of the current `0.5 + random*1.8`.)

**The impossible moment:** Ring a 2.4 pillar and a 1.2 pillar within one second
of each other. They flash white together, a thread of light snaps taut between
them across the whole sheet, and from then on they are **one pillar**: touching
either one bends and rings both, and walking into one puts you out of the other,
20 units away, mid-stride, still moving. Pitch decided adjacency; distance never
came into it.

**The misunderstanding (later):** The player learns "same note = same place."
Then they ring a 2.4 and a 1.6 (a fifth, not an octave) and instead of joining,
a **third pillar of height 0.8 grows out of the floor between them that was
never there**. The field is not a set of objects that can be glued — it is one
vibrating thing, and every pillar is one of its overtones. Walking through the
field is not travelling. It is plucking.

**Hidden math:** Integer frequency ratios; octave equivalence as a quotient
(identify f ~ 2f) — the teleport *is* the quotient topology, and the fifth
generates a new element of the group rather than collapsing one.

**Composes with:** Fold and observe. The fold makes two far places touch
through geometry; the octave makes two far places touch through pitch — the
game now has two different reasons for "near," and a puzzle can require either.
With eyes closed the ratios are much easier to hear than to see, so the eye
button becomes a *tool* for this toy, not just for the room.

**Phone controls:** D-pad to brush pillars with your body (contact radius ~0.9).
Tap a pillar on screen (existing raycaster, extended to the `landmarks[]`
meshes) to ring it at range — this is what lets a player pair two distant ones.
Hold the eye button to hear the field with no visuals.

**Build cost:** S–M (hours to most of a day). Hardest parts: (1) Web Audio
without mud — cap at 6 concurrent voices, steal the oldest, duck the `foldOsc`
drone while a ring is sounding; (2) making the glued pair legible — after
identification the two pillars must animate in perfect lockstep forever (one
transform, two draw positions) or the player will read the teleport as a bug.

**Risk:** On a phone speaker at low volume the ratio is inaudible and the whole
rule vanishes. Mitigation: pitch is also hue (low = deep blue, high = white) and
also the speed of the band running up the pillar, so an octave pair is visibly
the same colour at half the height.

---

## E3 — Thin

**Verb:** Walk in.

**First 10 seconds:** A pale column of light, about 3 units across, stands in
the floor of the space past the room. Walk into it: *thwump* — the player squashes
to a disc in about 0.3 s, the camera swings up overhead, the fog clears, colour
drops to two values, and every pillar around collapses to a line. Walk out the
other side and you pop back up with a spring overshoot. The player will walk in
and out five times in a row. It feels like a trampoline.

**The rule they discover:** In the light I'm flat, and flat me fits through the
slot. (A 0.15-unit slot in a wall, impassable at full size, is nothing to a disc.)

**The impossible moment:** While flat, walk straight over a gap in the floor
that you fell into a minute ago. The gap has no width in the flattened view, so
it is not there. And two pillars that stood far apart in depth are now printed
on top of each other — you can touch both at once, and both ring.

**The misunderstanding (later):** A second column looks identical but deletes a
*different* direction. Step in and nothing squashes — you still look 3D — but
two rooms you had visited separately are now the same room, and the light you
already collected is sitting here again, uncollected. It was never flattening
*you*. It deletes an axis of the world, and "up" was just the one the first
column happened to pick.

**Hidden math:** A projection with a kernel: which coordinate is annihilated is
a free choice of the matrix, and collapsing a coordinate identifies whole fibres
of the space into single points.

**Composes with:** The dimension shift itself — this is `dim` run backwards and
locally, so the birth of depth gets an inverse the player can hold in their hand.
And with fold: fold the sheet first, then flatten, and the fold's two halves
project onto each other, so crossing costs nothing. This is also the honest
answer to handoff §16 — failure is dimensional collapse, so make collapse a toy
the player chooses first, and it will be terrifying later when it happens to them.

**Phone controls:** None new. D-pad in, d-pad out. Hold the eye button while
flat and you *hear* the missing axis: a pitch that rises with the depth you can
no longer see, so you can find the gap you can't perceive.

**Build cost:** S–M. Hardest parts: (1) collision must actually change, not just
the camera — needs a real "while flat, ignore the depth axis for blocking tests"
branch in `updatePlayer`, and a hand-placed slot and gap to prove it; (2) the
transition curve — 0.3 s squash with a 1.15 overshoot is a toy, 1.5 s is a
cutscene, and the difference is the whole idea.

**Risk:** It reads as a camera gimmick. If nothing physically impossible is
enabled *while flat*, within the first two entries, there is no reason to step in
and the player walks past the column forever.

---

## E4 — Two Turns

**Verb:** Turn (drag to spin yourself in place).

**First 10 seconds:** A thin bright thread runs from the player back to the
first light they touched, sagging on the floor behind them and dragging as they
walk. Drag a thumb sideways on the world and the player spins in place; the
thread winds around them with a rising tone as it tightens. Flick and you keep
spinning. A child spins a top; this is a top with a string, and the string
remembers.

**The rule they discover:** Spinning once leaves a tangle. Spinning twice lets
it come out.

After one full turn, a visible corkscrew kink sits in the thread and **no amount
of walking will remove it** — loop the light, walk figure-eights, it stays.
After a second full turn in the same direction, walking one loop around the
light sweeps the thread clean and the kink vanishes with a chime. Every player
will test this twice to be sure.

**The impossible moment:** While one kink is in the thread, the world is
mirrored. Your shadow falls on the wrong side. The seam that was on your right
is on your left. The d-pad's own left arrow moves you right. Two turns and it
all comes back. You changed the world by turning around, and turning around
again did not undo it — turning around *twice* did.

**The misunderstanding (later):** Some things only work while you are mirrored —
a seam that will only be grabbed with an odd number of turns on you. So there
are two copies of the world and you have been living in one. Then, deeper: hold
the eye button while kinked and look at the thread. It has no kink. The kink was
never in the string.

**Hidden math:** SU(2) double-covers SO(3): a 2π rotation is not the identity,
4π is. The thread is a Dirac belt, and the mirror flip is the sign of the spinor.

**Composes with:** Fold and observe. Pull the seam while mirrored and the far
half of the sheet arrives *flipped* — the fold now pairs each place with its
reflection instead of with itself, which is a genuinely different fold from the
one the game already has, with no new geometry code. With eyes closed while
mirrored, the stereo pan of the landing sounds is reversed.

**Phone controls:** One-finger horizontal drag on the world where it does not
hit a seam = spin; ~110 px of drag per quarter turn, release velocity carries.
The existing seam drag keeps priority so nothing already built breaks. A twist
readout is the thread itself — no counter, no number.

**Build cost:** M–L (a day for the toy, more for the mirrored world). Hardest
parts: (1) the ribbon — a tube along a spline with per-segment roll that
visibly untwists when the player loops the anchor, which needs a small parallel-
transport frame solve, not just a rotated mesh; (2) the mirror state has to be
readable without any text, which means the world must be made deliberately
asymmetric first (shadow side, seam side, one off-centre landmark) or the flip
is invisible and reads as a bug.

**Risk:** The belt trick is famously hard to *see*. If the second turn's
untangling is not unmistakably caused by the second turn, the player files the
whole thing under "random glitchy thing that happened" and stops spinning.

---

## E5 — Beads

**Verb:** Tilt (the phone itself).

**First 10 seconds:** A few hundred tiny glowing beads lie scattered across the
sheet. Tilt the phone and they all roll, together, with a soft granular hiss and
little ripple trails (`emitRipple` on the densest cell, throttled). Tilt back and
they slosh the other way and overshoot. It is a tray of ball bearings. There is
no objective, no counter, and no prompt. It is the first thing in the game that
is fun before you understand anything.

**The rule they discover:** They roll downhill — and the floor is not flat where
it looks flat.

Tilt for a few seconds and the beads stop pooling evenly: they gather in five or
six places on a floor that looks perfectly level. Pour ~40 beads into one and it
fills, glows, and something opens. The player has been made to *survey* an
invisible landscape by pouring things across it.

**The impossible moment:** Fold the sheet, then tilt. The beads roll off the near
edge of the paper and arrive on the far half **without crossing the middle** —
they pour across the fold the way the player will later walk across it, before
the player has been told the fold does that. Tilt harder still and the player
starts to slide too. You are also a bead.

**The misunderstanding (later):** In a later space the beads pool at a spot with
no dent at all. Walk away and the pool follows you. The dent was never in the
floor: the beads have been rolling toward the observer the whole time, and every
"landscape" the player surveyed was their own presence. Tilting the phone did not
tilt the world.

**Hidden math:** Gradient descent on a hidden scalar field — the beads are
samplers, the pools are its minima; later the field's potential well is centred
on the camera, so the surveyor is the terrain.

**Composes with:** Fold, observe, and the dimension shift. Folding changes the
metric, so downhill changes and old pools drain into new ones. With eyes closed,
the click density tells you where the beads are collecting and therefore where a
dent is — hearing becomes a depth sense. After the shift to 3D, the same tilt
input stops being a floor slope and becomes the direction of gravity, which sets
up handoff §9's "gravity rotates while you don't."

**Phone controls:** `DeviceOrientationEvent` beta/gamma, requested from the
first real tap (iOS 13+ requires a user gesture) and calibrated to whatever
angle the phone is resting at when granted. Fallback on desktop or on refusal:
one-finger drag on empty world tilts a virtual tray, which is a fine toy on a
phone too. The eye button still works and is worth using here.

**Build cost:** M. Hardest parts: (1) the iOS permission dance plus calibration
plus a fallback that is not second-class — get this wrong and half of players
see a dead feature; (2) 300 beads at 60 fps on a phone means one `InstancedMesh`
with a flat 2D integrator (velocity += g*dt, damping 0.92, settle into a coarse
grid for the pooling test) — per-object `Object3D`s will not hold frame rate.

**Risk:** If tilting only rolls beads and nothing ever comes of it, it is a
screensaver. The first pool has to fill and *do something* within about fifteen
seconds of the first tilt. Second risk: never tilt the camera with the phone —
tilt only the field. Tilting the view will make people motion-sick in under a
minute.
