# NEW DIMENSIONAL BEATS — D1..D5

Lens: the progression itself. What comes before the 2D sheet, what comes after
the 3D room, how folds compose, and what failure means. The existing 2D→3D
crossing (`birthOfDepth`, the `dim` 0→1 lerp) is untouched — everything here
attaches before it, after it, or underneath it.

Shared architectural note that all five lean on: `index.html` already routes the
entire dimensional shift through **one scalar** (`dim`, 0→1) that drives camera
height, FOV, camera `up`, the disc→sphere crossfade, pillar `scale.y`, fog
density, and which way the d-pad's "up" points. Generalise that scalar to a
continuous **`D`** where `D=0` is the point, `D=1` the line, `D=2` the sheet
(today's opening), `D=3` the room (today's ending). Current code becomes the
segment `D: 2→3`. Every idea below is a move along that same axis, so nothing
needs a second camera system.

---

## D1 — The Second Point

**Verb:** Move. (And, for ten seconds, only *press* — with nothing to move.)

**First 10 seconds:** Black. One white dot dead centre, breathing. FOV 4, the
existing telephoto look, so there is no perspective and no sense of space at
all. The d-pad is there but its four keys are at 0.12 opacity. Tap any key: the
dot flashes and throws a ripple ring outward, and about 0.7 s later something
flashes back out of the dark to the right, off-screen-far (x=+9). Tap again:
the reply comes from x=+5, and sooner. Tap a third time: it arrives at x=+1.2
and stays — a second dot. A line draws itself between the two. LEFT and RIGHT
brighten to full; UP and DOWN stay dead.

**The rule they discover:** "There's something else out there, and I can go to
it."

**The impossible moment:** On the line you meet a wall — a bright segment at
x=+3.4 you cannot pass. But it *breathes*: over a 4-second cycle it widens to
1.8 units, narrows, and for about 0.6 s it is **completely gone**, then comes
back. You slip through the gap in time, not in space. Three more objects on the
line do the same thing on different periods: one pulses, one splits into two
segments and rejoins, one slides sideways while shrinking. Then the last light,
and the camera pitches up from 0° to 90° over 2.5 s: the line unrolls outward
into the sheet, the grid growing from z=0 outward like paper being unrolled from
a rod. The "wall" is a slowly rotating rectangle, and one of its corners sweeps
across the line you were living on. The thing that split in two was a
V-shape crossing. Nothing was appearing or disappearing. You were seeing edges.

**The misunderstanding (later):** The rule you learn in 1D is "wait for the gap."
The rule that is actually true is "you are seeing a slice." D5 collects this
debt: the sheet you are now standing on is also a slice, and so is the room after
it, and something is rotating through *those* too. The 1D wall taught the
grammar of the entire endgame in forty-five seconds with no words.

**Hidden math:** A 1-dimensional subspace of R² intersected with rotating convex
polygons — the level is the fibre `{y=0}` of the plane you're about to inherit.

**Composes with:** The dimension shift. It *is* the dimension shift, run twice
more at the low end: `D: 0→1` (the echo arriving) and `D: 1→2` (the camera
pitch-up). Reuse `updateCamera`'s single-parameter lerp and the sheet shader's
`uAwake`; add `uReveal` so the grid fades in radially from z=0. Ends by placing
the player at (-7, 0, -1) — the exact position `playerPos` is initialised to
today — so the current game resumes verbatim on line one.

**Phone controls:** 0D — any of the four d-pad keys, three taps. 1D — LEFT and
RIGHT only; UP/DOWN are visibly dimmed and inert (this is the first time the
player is told a dimension is missing, and it will matter in D4). No drag, no
eye button yet; they arrive later so their arrival means something.

**Build cost:** M (a day). Hardest parts: (1) making 1D legible on a phone — a
literal one-pixel row is a terrible image, so it needs a thin luminous band with
vertical falloff plus a faint reflection beneath, and the "breathing" segments
need generous minimum widths (never below 0.25 units except during the
intentional zero); (2) the pitch-up transition — the player must stay anchored
under the thumb while the camera's `up` vector swings, or it reads as a bug.
Steal the existing `camUp.lerp` code exactly.

**Risk:** 1D is intrinsically boring and the player quits in the first minute.
Hard cap: 0D under 12 seconds, 1D under 50, exactly one puzzle (the timed gap),
and the wall's cycle short enough (4 s) that a distracted player sees the gap
twice before they even try to walk into it.

---

## D2 — The Corner Comes to You

**Verb:** Fold — twice, on two edges that cross.

**First 10 seconds:** Somewhere after the birth of depth, on open sheet, two
glowing edges run across the world and cross in an X: the familiar one along
z (at x=0, already in the code) and a new one along x (at z=0). The player has
already pulled one edge in their life. They pull this new one: the half of the
world in front of them tips up and toward them, same as before. Nothing new yet.
Then they pull the other. The quarter where the two folds overlap does something
neither fold did alone — it swings up, over, and comes down **on top of where
they are standing**, upside down and backwards.

**The rule they discover:** "If I fold it twice, the far corner lands on me."

**The impossible moment:** The doubly folded quarter now occupies the same
ground you do. Two places are one place. The light that was at (+8, +6) — the
farthest thing in the world, four fold-lengths away — is now hovering a metre
from your face. And there is a *you* there: your own body, folded over with the
corner, standing where you stand, moving mirror-image to you. Push LEFT and it
goes left in the world but appears to go right, because it arrived through an
odd number of reflections. Walking into it is the next crossing.

**The misunderstanding (later):** The player's working rule is "two folds bring
the corner here." It's wrong in a specific, discoverable way: **the order
matters.** Pull the z-edge then the x-edge and the corner lands at one spot;
unfold both, pull the x-edge then the z-edge, and the corner lands somewhere
else entirely, with the opposite handedness. Build one gate that only accepts a
corner arriving in a particular orientation, and the solution is not "fold
harder" — it's "undo and do the same two things in the other sequence." A child
says "I did it in the wrong order." A math major sees that rotations about
intersecting axes do not commute, stated as a physical fact with zero notation.

**Hidden math:** Composition in SO(3) is non-abelian; two folds about
perpendicular hinges compose to a single rotation about a diagonal axis.

**Composes with:** Fold, directly — it is the fold mechanic composed with
itself. The shader already applies two sequential hinge rotations (`uFold` at
x=0 and `uFold2` at x=8.6); this replaces the second, parallel hinge with a
perpendicular one and adds a fold-order uniform. It also composes with the
dimension shift: a doubly folded plane is unreadable from the 2D top-down
camera, so this beat can only exist *after* the birth of depth — the fold
mechanic gets deeper because the player got a dimension, not because they got
an upgrade.

**Phone controls:** Same grab-and-drag as today, unchanged: raycast against a
hidden `seamGrab` box, drag perpendicular to the seam. Horizontal drag folds the
z-edge, vertical drag folds the x-edge (matching how each hinge moves on
screen). Tap an already-pulled edge to release it, as `endDrag` already does for
the second seam. D-pad to walk into the corner.

**Build cost:** M (a day). Hardest parts: (1) `foldedPoint()` and the vertex
shader must agree *exactly* now that the transform is order-dependent and truly
3D — the CPU version currently only rotates in the x/y pair; it becomes two
`Vector3` rotations applied in a stored order, and any drift shows up as the
player collecting a light they aren't touching; (2) legibility — a
doubly-folded plane seen from a low camera is visual soup, so the folded quarter
needs a distinct rim light and the un-folded ground under it needs to dim.

**Risk:** The player can't tell what is on top of what and reads the whole thing
as graphical corruption. Mitigation: fold the *second* edge slowly and only
after the first is fully committed, and let the mirrored copy of the player be
the thing the eye locks onto — a body is readable even when the geometry isn't.

---

## D3 — Turning the Door

**Verb:** Turn.

**First 10 seconds:** After the room, a small bare chamber. In the middle of it
stands a door frame with nothing attached to it — a rectangle of light you can
walk all the way around. Through it you can see a *different* room: warmer,
different floor, a shape moving in it. Walk behind the frame and you see the
chamber you're actually in, normal, through an empty rectangle. So: a window.
Understood in three seconds, by anybody.

**The rule they discover:** "If I spin the door, it goes somewhere else."

**The impossible moment:** Turning a window in place should show you the *side*
of the same room. It doesn't. At 90° there is a different room behind it. At
180°, a third. At 270°, a fourth. Full circle, back to the first. Four rooms
through one rectangle, and the rectangle never moved. Walk through at 0°, walk
back through at 90°, and you come home **mirrored** — your d-pad's left and
right have traded, and your shadow falls on the wrong side.

**The misunderstanding (later):** The player's rule is "there are four rooms and
the door picks one." Then they stop the frame at 45° — a detent the game never
pointed at — and walk through into a room that is *both*: the two floors
interpenetrating, both sets of walls present at half opacity, both solid. Not a
fifth room. A place between two rooms, on a continuum. There were never four
rooms; there is one thing, and the frame's angle chooses where you cut it. And
the last turn of the screw: **turn the frame with your eyes closed** (hold the
existing eye button through the rotation) and when you open them you are not in
any single room — you get the blend, at whatever angle, because nothing decided
which one it was. The observation mechanic the player learned in the 3D room
turns out to govern space itself, without one word of explanation and without
touching that room.

**Hidden math:** Rotation in one 2-plane of R⁴ selects a hyperplane; the four
"rooms" are four axis-aligned slices of a single object, and 45° is the diagonal
slice nobody built.

**Composes with:** Observe (the hold-to-close-eyes button, which is already
built and already means "unobserved things don't commit to one outcome") and
fold (the frame's angle is a fold of the connection graph rather than of the
sheet — same verb, applied to relationships instead of paper, which is exactly
the handoff's "higher dimensions = manipulate the rules connecting objects").

**Phone controls:** Drag horizontally anywhere on the frame — same
`raycaster.intersectObject(grabBox)` pattern as the seams. Drag maps to angle at
about 180° per screen width, with soft detents and a blip at 0/45/90/135/…
D-pad walks through. Eye button held during the drag suppresses the commit.

**Build cost:** L — honestly days, not a day. Hardest parts: (1) the portal
view: a `WebGLRenderTarget` per destination rendered from a virtual camera
mirrored about the frame plane, mapped onto the frame quad, with the 45° case
sampling two targets and mixing by angle — standard Three.js, but it is a second
render path and it costs frame budget on a phone (cap targets at 512×512 and
render them every other frame); (2) collision in the blended room, where two
wall sets are simultaneously solid; (3) the through-walk with no loading seam —
the destination has to be in the scene graph already, just hidden.

**Risk:** It reads as a television showing four channels rather than four
places. The whole idea dies unless the player physically walks through within
the first twenty seconds, so the first room's light should be visibly on the
*other* side and unreachable any other way.

---

## D4 — The Flat Places

**Verb:** Move — and then discover you can't.

**First 10 seconds:** In the 3D world, a patch of floor about 5 units across
that looks slightly wrong: the grid on it is finer, the pillars inside it are
short and getting shorter, and your own shadow, when you step in, is sharper
than it should be. Nothing warns you. You walk in because it's on the way.

**The rule they discover:** "In there, I lose a direction."

**The impossible moment:** Three seconds inside and the world starts running
backwards down the dimension axis. `dim` falls 1 → 0 over about 2.5 s: the
camera lifts back into the sky, the pillars sink into flat marks, colour drains
to a single hue, your sphere collapses into a disc. And — the part that lands
like a punch — **UP and DOWN fade off the d-pad and stop working.** They visibly
flatten and slide into the pad's edge. You are on a line. Stay another 3 s and
LEFT and RIGHT go too. Now you are a point that can only pulse. You are not
dead. You are just less.

**The misunderstanding (later):** For an hour this is the failure state — the
thing you avoid, the thing that takes your buttons. Then you meet a slot in a
wall that a body cannot fit through, with a flat patch conveniently in front of
it, and the player realises **they can choose to collapse.** A 2D thing passes
through a 1D gap. Failure was a verb the whole time. From that point the flat
patches stop being hazards and become tools, and the game has quietly taught
that "fewer dimensions" and "worse" are not the same word.

**Hidden math:** Dimension as degrees of freedom; a lower-dimensional embedding
satisfies boundary constraints its higher-dimensional parent cannot.

**Composes with:** The dimension shift (this is literally `dim` played in
reverse — nearly free, given every visual already keys off it) and observe. The
escape uses the eye button: collapsed, the only input still alive is *hold to
close your eyes*, and with them closed a panned tone tells you which way the
edge of the flat region is. Release when the tone is centred and you re-inflate:
`dim` runs 0 → 1, the buttons return one at a time with a rising chime, colour
floods back. A child's version of the rule: "if I go flat, close my eyes and
listen."

**Phone controls:** No new input at all. The d-pad *loses* keys — the strongest
possible use of an existing control. The eye button, already built as
hold-to-close, becomes the escape. Nothing to teach.

**Build cost:** S–M (hours to a day). Hardest parts: (1) selling the loss of
buttons as the world doing it rather than a crash or lag — the key must animate
into the pad edge over ~0.4 s with a descending tone, never just stop
responding; (2) the audio direction-finding has to survive a phone speaker in a
loud room, so back it with a visual: the eyes-closed veil is not black but
carries a faint one-sided gradient, so the sound is confirmation, not the only
channel.

**Risk:** Taking control away is the fastest way to make a player put the phone
down. Numbers must be forgiving: 3 s of grace before the first loss, a visible
tell on the floor before that, the escape solvable in under 2 s, and nothing
lost permanently — you always re-inflate at the edge of the patch you walked
into.

---

## D5 — The Rising Cut

**Verb:** Zoom / raise — drag a plane of light up and down.

**First 10 seconds:** A dark chamber, one object hanging in the middle of it:
faceted, luminous, slowly turning, and completely unreadable as anything. On the
floor is a horizontal sheet of light, waist-high, that you can grab and drag
upward. Where the sheet passes through the object, a bright outline appears on
it. Drag the sheet; the outline changes shape. That's the whole tutorial.

**The rule they discover:** "Move the light up and the shape draws different
pictures."

**The impossible moment:** At a specific height the outline is not abstract. It
is a rectangle with a bright line down its middle — the sheet, with its seam,
seen from above, exactly as the player's very first screen looked. Higher: a
wall with two gaps in it and a screen at the back. Higher again: a single line
with three beads on it. **Every place they have been is a horizontal slice of
the one object in this room**, and the player recognises them without being
told, because they lived in them.

**The misunderstanding (later):** You can step *onto* the plane. Standing in a
slice, you are back in that level at full size, walls and all — and you can keep
dragging while standing in it. The room morphs continuously around you: walls
slide, the two gaps drift together and merge into one, the screen tilts. Between
any two levels are heights nobody designed, half-formed rooms with a doorway
that is mid-way through becoming a pillar. And at the very top the cut shrinks
to a single point — 0D, one dot in the dark, where the game began. The rule was
never "the levels are slices of an object." It's that there is no bottom or top
level, only a continuum, and the "levels" were the four heights someone chose to
stop at.

**Hidden math:** The game is a foliation — each level is the preimage of a
height under one signed distance field, and the campaign is a path through the
leaf space.

**Composes with:** All three. Dimension shift (this is the reveal that the
`D` axis and the height of the cut are the same axis). Fold — a fold performed
inside a slice is visibly a fold of the whole object, so folding at one height
changes the outline at another. Observe — with eyes closed the cut does not
commit, and reopening at an in-between height gives you the unfinished room.
It also pays off **D1** exactly: the 1D player already learned to read
cross-sections of things they couldn't see, forty minutes earlier.

**Phone controls:** Drag vertically anywhere on the light plane — the same
grab-and-drag as the seams, mapped to height at roughly one level per 0.28 ×
screen height, matching the existing `dragging2` sensitivity. Tap the plane to
snap to the nearest authored height. D-pad to walk once you're standing in a
slice.

**Build cost:** L (days). This is a capstone, not a day's work. Hardest parts:
(1) authoring the object so specific heights genuinely produce recognisable
level geometry — the only sane approach is to invert it and *loft* the object
from the levels, taking each level's floorplan as a keyframe cross-section and
interpolating between them, so the levels are the object by construction rather
than by luck; (2) collision against a continuously morphing cut, which realistically
means the walkable version only exists at snapped heights in v1.
**One-day version that still lands the revelation:** don't let the player walk
in the slice. Object + draggable plane + outline + four snap heights, with a
faint ghost of the player's own recorded path drawn inside each silhouette. The
"that was me" is what does the work, and it costs nothing.

---

### Suggested order in the game

D1 (before everything) → *existing 2D sheet* → *existing fold* → *existing birth
of depth* → D2 (fold composed, only legible now that depth exists) → *existing
room* → D4 (failure introduced as loss of a dimension) → D3 (first true
higher-dimensional impossibility) → D4's inversion (collapse as a tool) →
D5 (it was one object).

D1 and D5 are the same idea at the two ends of the game: cross-sections. D2 and
D3 are the same verb (compose two transformations, order matters) applied to
paper and then to rooms. D4 is the only one that costs the player anything, and
it exists so that D5's shrink-to-a-point at the top of the object reads as a
homecoming rather than a graph.
