# Lens A — SPATIAL PSYCHEDELIA

Five ideas where the toy is space itself. Written against V7 (`index.html`):
sheet shader with vertex warp + 6 ripple slots, `foldedPoint()` / `roomFoldPoint()`
coordinate mirrors in JS, `dim` 0→1 driving camera/FOV/axes, screen-relative
`fwd`/`rgt` that already rotate 90° across the shift, canvas-texture screen,
d-pad + world-drag + hold-eye. None of these touch the two-gap room.

---

## A1 — The Short Way Around

**Verb:** Fold — but this time you pinch a wedge shut instead of a straight seam.

**First 10 seconds:** Two glowing edges meet at a point on the floor (a V, apex at
the origin, arms running out to the rim at 40° apart). You drag one arm toward the
other. The wedge between them narrows and the whole sheet buckles upward into a
shallow cone with you standing on it. The two arms touch and vanish into one line.

**The rule they discover:** "I closed a slice of the floor, so going around the
middle is shorter now."

**The impossible moment:** With the wedge shut you walk in a dead straight line —
never touching the d-pad's left or right — and after about 9 seconds you run into
your own glowing footprint trail from behind. Straight lines cross themselves.
Pinch a second and third wedge (total removed > 180°) and a straight walk closes
into a small loop you can't escape by going straight.

**The misunderstanding (later):** You think you deleted a slice of the world. Then
you unpinch on the far side and the wedge is still there — an orphan strip holding
the third light, which had "disappeared" when you first folded. Nothing was
removed; it just stopped being next to you. Adjacency, not existence, is what you
have been editing this whole time — including in the very first fold.

**Hidden math:** Deficit-angle cone; all Gaussian curvature concentrated at the
apex, and a geodesic self-intersects exactly when the cone angle drops below π.

**Composes with:** Fold. Same grab-and-pull gesture, one dimension of freedom
richer — a seam is a wedge of angle 0. Crossing the pinched seam while `dim` is
still 0 is the existing birth-of-depth trigger, so the cone can be the *second*
fold lesson, before the room.

**Phone controls:** Drag on the world = swing the free arm of the V (angle from
drag-x, same `seamGrab` raycast pattern, clamped 40°→0°). D-pad walks. Tap on the
apex = release the wedge back open.

**Build cost:** M (a day). Hardest: (1) intrinsic movement — keep the player in
unrolled (r, φ) and map to the 3D cone in a `conePoint()` beside `foldedPoint()`,
same trick the code already uses; (2) the footprint trail needs to persist and be
drawn in cone space, so it must live in the sheet shader as a texture, not as the
6-slot ripple array.

**Risk:** On a phone screen at the current near-orthographic 2D camera, a shallow
cone reads as "the floor got a bit lumpy" and the shortcut just feels like a bug.
The cone has to be steep enough (≥25° tilt) that the shortening is visible before
the player walks it.

---

## A2 — What You Watch Backs Away

**Verb:** Look — and the existing hold-to-close-eyes button.

**First 10 seconds:** A light sits maybe 6 m ahead down an empty hall. You walk at
it. The floor grid between you and it visibly spreads apart, line by line, and the
light stays exactly 6 m away. Back up two steps and the grid packs together and the
light lunges toward you.

**The rule they discover:** "Looking at it pushes it away. Close my eyes and I get
there."

**The impossible moment:** You hold the eye button, the screen goes dark, you walk
four seconds and let go — and you are standing past the light, with the hall you
came down now compressed to a stub behind you. The distance you covered blind is
longer than the hall was.

**The misunderstanding (later):** You assume walking-while-blind is what moves you.
Then you close your eyes and stand perfectly still for four seconds — and open them
somewhere else anyway. It was never your legs. The room only settles into a layout
at the moment you look, and each look picks a slightly different one; walking was
just a way of not noticing. Two lights held in view at once now can't both stay
put — glance between them and the room shuffles under you.

**Hidden math:** A conformal factor on the metric that grows with accumulated gaze
time on a target, e^{k·τ_gaze}; the space has no fixed distances, only distances
relative to an observer's attention history.

**Composes with:** Observe. Reuses the eye button from the two-gap room in a
totally different register — there it decided *what pattern* landed, here it
decides *where things are*. Fold also still works: the light is unreachable by
walking but a fold makes it adjacent, teaching "adjacency beats distance."

**Phone controls:** Nothing new. D-pad walks; hold the eye = eyes closed (the
existing `veil` + `setEyes()`); gaze is computed from whether the target is inside
a 25° cone around screen centre, which the fixed chase camera makes intuitive.

**Build cost:** S–M (hours to a day). Hardest: (1) the grid must visibly stretch,
which means feeding the sheet fragment shader a stretch centre + strength and
warping the `grid()` coordinate — cheap but needs to not shimmer; (2) tuning the
gaze rate so the child reads "it runs away" in one attempt, not "I am walking too
slowly."

**Risk:** Unreachable-goal mechanics are the classic way to make a player quit. The
eyes-closed escape must be discoverable within ~15 seconds of first frustration —
probably the light itself has to pulse in time with the eye button.

---

## A3 — The Doubling Door

**Verb:** Move — walk through a doorway.

**First 10 seconds:** A straight hall, 3 m wide, 22 m long, a lit doorway at each
end. You walk out of the far one and you are entering the near one again, mid-
stride, no cut. Everything is twice as tall as it was. Your steps cover half as
much floor.

**The rule they discover:** "Every time I go through, everything doubles."

**The impossible moment:** By the fourth pass the hairline grain in the floor —
the fine 0.25 grid that was texture — has become the walls of the hall. A crack in
the skirting board that was 20 cm at the start is now a 3 m doorway you can walk
into, and the thing you couldn't see inside it is a light. Look down the long axis
and you can see the hall nested inside itself, three depths at once.

**The misunderstanding (later):** You assume you are shrinking forever and there is
a bottom. Walk it eight times and the world snaps back to exactly the size it
started — 256× is 1×. Scale here is not a line with a small end, it is a ring you
have been walking around. Which means the "crack in the skirting board" you climbed
into is the hall you started in, and the giant hall above you is also it.

**Hidden math:** Space quotiented by a discrete similarity of ratio 2, closed at
2^8 — scale as a periodic coordinate rather than a magnitude.

**Composes with:** Fold. Fold the hall so the two doorways touch: now you can see
×1 and ×2 side by side through the same opening, which is the proof of the rule and
also the only way to hand an object between two scales.

**Phone controls:** D-pad only for the loop. Drag on the world folds the hall.
No new input.

**Build cost:** M (a day). Hardest: (1) do it by scaling the *player and camera*
(`player.scale`, `speed`, the camera `H`/`dist` terms), never the world — 1/256 is
fine for floats where a 256× world is not; (2) the seam has to be genuinely
invisible: the crossing must preserve screen-space position and camera yaw exactly,
which means teleporting at the doorway plane on the same frame the size changes.

**Risk:** Without something that only exists at one scale, the loop is a treadmill
with a size gimmick. The crack-that-becomes-a-door has to appear by loop 2 or the
player stops walking.

---

## A4 — Left Comes Back Right

**Verb:** Move — off one edge of the world and in the other.

**First 10 seconds:** A wide floor with a small companion spark that hovers a
half metre off your left side. You walk off the top edge and slide in at the bottom
edge without a cut. The spark is now on your right. Pressing left on the d-pad
sends you right.

**The rule they discover:** "The top and the bottom are the same edge, and going
through flips me. Going through twice puts me back."

**The impossible moment:** Standing near the seam you can see a copy of yourself
across it, walking mirrored — and when you fold the sheet, the fold physically
carries the top edge down onto the bottom edge and the two of you meet and merge.
The magic wrap turns out to be a piece of tape you can see.

**The misunderstanding (later):** There are now two routes to the same spot: wrap
around the edge, or cross the fold. Both land you on the same tile. Take one out
and the other back and you arrive exactly where you started — flipped. A round trip
that changes you, with no step of it having done anything strange. Then you find
the one object in the room that is unchanged by the flip and it is the only thing
you can carry through both ways.

**Hidden math:** Non-orientable quotient of the sheet (Klein bottle from the glued
pair of edges); the flip is the orientation-reversing holonomy of a loop that is
not null-homotopic, and the fold path and the wrap path sit in different homotopy
classes.

**Composes with:** Fold, structurally rather than decoratively — the fold is what
*explains* the wrap, and the two together are what produce the holonomy. Also
composes with the shift: swapping `fwd`/`rgt` handedness is exactly the axis
rotation the code already performs across `dim`, so the plumbing exists.

**Phone controls:** D-pad walks (and its left/right meaning silently swaps after an
odd number of wraps — same mechanism as the existing screen-relative axes). Drag
folds. Nothing new.

**Build cost:** S–M (hours to a day). Hardest: (1) the wrap must look continuous,
so the sheet shader has to draw the mirrored strip beyond each edge (`if(z>9){z-=18;
x=-x;}` in the fragment coordinate — nearly free) and the 22 pillars need mirrored
ghost copies near the seam; (2) making the handedness flip *legible* — the
companion spark, the swapped d-pad, and a one-sided mark on the player all have to
agree.

**Risk:** Inverted controls read as a bug, not a revelation. The spark jumping
sides must land first, in the same frame, or the player just thinks the game broke.

---

## A5 — The Room in the Stone

**Verb:** Zoom — tap the pebble and go in.

**First 10 seconds:** A pebble the size of a fist on the floor, faintly lit from
inside. Get close and you can see a tiny room in there, with a tiny lit floor. Tap
it. The camera dives into it, the world crossfades, and you are standing in a room
the same size as the one you left — with a pebble on its floor.

**The rule they discover:** "Where I walk in the small room, mountains grow in the
big one."

**The impossible moment:** You come out and your own short walk is a ridge of
terrain forty metres long, exactly the shape of your path, arcing across the gap
you couldn't cross earlier. You built a bridge by taking six steps somewhere else.

**The misunderstanding (later):** You assume in is down and out is up. On the third
descent the room you arrive in already has your ridge in it, and the pebble on its
floor is the room you started from. Containment is a ring of three, not a stack —
so a walk in the smallest room eventually raises a mountain under your own feet in
the largest, and near the end you can watch the floor deform *before* you have gone
down to cause it.

**Hidden math:** The containment relation is a 3-cycle rather than a well-founded
chain — a fixed point of "contains", with the level index living in Z/3.

**Composes with:** The dimensional shift and fold together. The descent reuses the
`dim` machinery (one scalar driving camera, FOV, fog, player form), and the ridge
you build at level N+1 is a fold-height field at level N — so a ridge can be pinched
by a fold, which lets you raise a wall you can then bring to you.

**Phone controls:** Tap the pebble to enter (same raycast pattern as the second
edge). D-pad walks. Hold the eye button while inside to see the outer room's
outline ghosted over the inner one — the only way to aim your walk deliberately.

**Build cost:** L (two to three days, honestly). Hardest: (1) a persistent trail
texture per level — same 2D-canvas-into-`CanvasTexture` pattern the screen already
uses, fed into the sheet vertex shader as a displacement map; (2) the descent and
ascent transitions with no loading cut, plus keeping three levels' worth of trail
state coherent when the cycle closes.

**Risk:** Cause and effect are separated by a scene transition, which is exactly
how you lose people. The first descent must be short, aimed (a single obvious
target on the outer floor), and the ridge must be visible in the first second back
out — otherwise "I walked around in a small room and nothing happened."
