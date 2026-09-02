# Lens B — The Observer / Meta Layer

Five ideas. None of them touch the two-gap room. Coordinates use the existing world
scale (sheet is x −11..11, z −8..8; the first seam is x=0; the wall x=6.6; the screen
x=10.8). Existing code these lean on: `pShadow`, `setEyes()/veil`, `emitRipple()`,
`foldedPoint()`, the seam raycast-drag, `updateCamera()`, `blip(f,d,g,type,pan)`.

One shared prerequisite is called out honestly in three of the five: **the camera is
currently 100% derived** (`updateCamera` computes position from `dim`, `portraitMode()`
and `playerPos`, every frame). Any idea where the player influences the view needs a
`camYaw` / `camOffset` pair fed into that function. That refactor is a couple of hours
once, not per idea.

---

## B1 — Lower the Lamp

**Verb:** drag (a lamp up and down), then walk.

**First 10 seconds:** A flat ledge with a 5-unit hole of black in it (x = +3 to +8, full
width). One lamp hangs at (0, 6, −4) — a visible glowing octahedron on a line of light,
not an abstract light source. You walk. Under you is your shadow, a hair further from the
lamp than you are. You step; it steps slightly further. You can't cross the hole. You
grab the lamp and pull it down.

**The rule they discover:** "The lower the lamp, the further my shadow goes."

**The impossible moment:** At lamp height 0.35 your shadow is nearly four times further
from the lamp than you are — it is standing on the far side of the hole while you are
still on the near lip. You hold the eye button. Two seconds of black, three footsteps you
can hear panned to the right, and when you open your eyes you are on the far side. You
never walked across.

**The misunderstanding (later):** Pull the lamp *below your own head* (under y = 0.26) and
the shadow doesn't shrink — it races out past the far horizon and reappears coming in from
behind the lamp, on the wrong side of everything. Close your eyes at that instant and you
arrive at x = −11 having walked toward +11. Later still, you push the lamp all the way up
to find what's at the top of the light: nothing is there, and pushing the lamp higher
pushes the camera. The lamp was never casting you. You are the shadow; the camera is the
thing standing in the light.

**Hidden math:** Central projection from a point — shadow = L + s(P − L) with
s = L.y/(L.y − P.y); as L.y → P.y, s → ∞ and then flips sign. The player is walking the
real projective line and the wrap-around is the point at infinity.

**Composes with:** *fold* — the hole is too wide even at the lamp's limit, so you fold the
ledge first to shorten it, then throw the shadow; *observe* — the eye button is the swap,
so eyes-closed is no longer just "listen," it is "be the other one."

**Phone controls:** d-pad walks. Drag on the lamp mesh, vertically, sets its height (same
gesture and clamp shape as the existing `dragging2` / `clientY` seam drag). Hold the eye
button ≥0.5s to swap into the shadow; the swap is refused (soft thud, shadow flashes red-
shifted) if the shadow is over the hole.

**Build cost:** M. Hardest parts: (1) the swap must dolly, not cut — the camera has to
travel the 6–10 units over ~0.35s under the black veil or the player loses all orientation;
(2) guarding s when |L.y − P.y| < 0.05 — the shadow position blows up to ±1e6 and the
projection/ripple code must not follow it there.

**Risk:** The player treats the lamp as scenery and never touches it. Mitigation: the lamp
is the only draggable thing in the space and the shadow's edge is drawn brighter the closer
it gets to the hole's far lip.

---

## B2 — The Second Shadow

**Verb:** drag (something on the floor that shouldn't be there).

**First 10 seconds:** A room lit from straight above. You have a shadow. There is also a
second shadow — a slightly larger, softer ellipse about 4 units behind you and up-screen,
with nothing above it. It follows you exactly. A child notices it in about three seconds
and tries to walk onto it; walking onto it does nothing at all.

**The rule they discover:** "I can pick up the other shadow with my finger, and when I move
it the whole picture moves."

**The impossible moment:** You drag it 90° around yourself. The room swings. You are now
looking at your own glowing body from the side — and the second shadow is out there on the
floor, separate from you, with still nothing above it. The thing you were dragging is the
thing you were seeing with.

**The misunderstanding (later):** A wall with a vertical slot 0.18 wide. Your body is a
sphere of radius 0.36 and cannot fit. The second shadow slides straight through the slot,
and the d-pad now drives it. You are through; the body is on the other side. Then you press
the d-pad and the abandoned body *walks* — same inputs, bumping into the wall it can't pass.
It was never the thing you were moving. It was following the view the whole game.

**Hidden math:** The camera is an ordinary node in the scene graph, and the "player" was a
child of the view transform, not the other way round.

**Composes with:** *fold* — after detaching, the fold seam no longer hinges at x = 0; it
hinges at the camera's ground point, so where the world creases depends on where you are
looking from, and you fold different pairs of places together by first walking the camera
somewhere else. *Dimension shift* — the camera has no volume, which is exactly why the
0.18 slot works, and it is the first thing in the game with a lower dimension than you.

**Phone controls:** d-pad moves the body (before) / the camera (after). Drag on the second
shadow: horizontal = yaw around the body, vertical = camera height. Double-tap the second
shadow snaps it back behind you. No new buttons.

**Build cost:** M/L. Hardest parts: (1) `updateCamera` has to gain a manual yaw/height
offset that survives the `dim` blend and portrait/landscape rig without the player ever
seeing a pop; (2) raycast priority — the seam grab, the second shadow and empty space all
want the same pointerdown, so the shadow needs its own invisible grab box tested first and
a bigger hit radius in portrait.

**Risk:** On a 6-inch screen a freely-orbited camera loses the avatar and the player panics.
Mitigation: yaw is clamped to ±110° until the slot, and the body always keeps a screen-edge
arrow (the `beaconArrow` code already does this).

---

## B3 — Built Behind Your Back

**Verb:** look away (via the existing hold-to-close-eyes, then via turning).

**First 10 seconds:** A ledge ending at a 9-unit black gap. One plank of light juts out
over the void — one, no more. You walk to the end, there is nothing to do. You do the thing
the game already taught you: hold the eye. In the dark you hear *clack … clack … clack*,
each one panned slightly further right. You let go: four planks now, where there was one.

**The rule they discover:** "It builds itself while I'm not looking."

**The impossible moment:** You cross a bridge you have never seen. Eyes shut, d-pad held,
footsteps and plank-clacks in the dark, the bridge staying exactly one or two planks ahead
of you the whole way because it only grows while your eyes are closed. Opening your eyes
mid-way does not delete anything — it just stops the sound, and you are standing on air
that is now solid.

**The misunderstanding (later):** The last stretch will not build. You hold the eye for
thirty seconds and nothing happens, because those planks are underneath and immediately
around you, and "unobserved" was never about your eyelids. It's about being outside the
frame. The fix is to turn the camera until your own avatar slides off the edge of the
screen — and while you are off-camera, with your eyes wide open, the floor assembles under
your feet. The thing that had to stop looking was never you.

**Hidden math:** Existence is a predicate on frustum containment. Observation is a property
of the projection, not of the avatar.

**Composes with:** *observe* — this is the eye button's second act and it retroactively
reframes the first; *fold* — a fold can push a region out of frame, so folding becomes a way
to *unobserve* something, which is the first time the two verbs mean the same thing.

**Phone controls:** d-pad walks (works fine with eyes closed). Hold the eye button = eyes
shut. Drag on empty world space = pan/yaw the camera (the only new input, and it's needed
by B2 and B4 anyway).

**Build cost:** M. Hardest parts: (1) it needs camera yaw at all — see the shared
prerequisite; (2) frustum tests flicker viciously at the screen edge, so use a frustum
shrunk to ~0.85 plus 0.3s of hysteresis per plank, or a plank half-built at the boundary
will strobe.

**Risk:** Blind walking on a phone means repeated falls and the player blames the controls.
Mitigation: you cannot fall — walking off the last plank just stops you, with a low tone and
a ripple where your foot found nothing.

---

## B4 — One Right Place

**Verb:** move.

**First 10 seconds:** A wide dark floor with fourteen broken shards of light hanging at
heights 0.4 to 5.0, scattered between x = 2 and x = 14. Junk. You move; they swim past each
other at different speeds because they're at different depths. Two of them slide over each
other and hum. You move a bit more and the hum gets louder.

**The rule they discover:** "If I stand in the right place, the pieces make a picture."

**The impossible moment:** At the right spot the fourteen shards read as one clean shape —
and then it stops being a trick of the angle. Holding for a second, the shards *snap
together*, weld, and drop as a single solid object that stays solid when you walk around it
and look at it from behind. A thing that existed only in your view is now a thing in the
room.

**The misunderstanding (later):** The second set of shards cannot be aligned from anywhere
you can stand. The point of view they resolve from is 2.6 units up and 3 units behind the
back wall — not a place a body goes. It is a place the *camera* goes. The glowing ring on
the floor was never marking where your feet must be; it was marking where your eye must be,
and it always was — go back and check the first one. (The third set resolves only from a
point inside a solid pillar, which is what the fold is for.)

**Hidden math:** An anamorphic set is a fiber of the projection map — each shard is a free
point along a ray from the center of projection V, so the puzzle's solution is one point in
R³, not a shape in it.

**Composes with:** *fold* — folding moves V into reach, or brings a shard's ray somewhere it
can be seen from; *observe / camera* — V is the camera's eye, which is the cleanest possible
statement of the whole lens; *zoom* — a variant where the shards resolve only at one FOV.

**Phone controls:** d-pad only, for the first two. Later, drag on empty space to turn/raise
the camera (shared with B2/B3). Nothing else.

**Build cost:** S/M. Hardest parts: (1) generating the shards is trivial (pick 2D silhouette
points, cast rays from V, drop a quad at a random t on each) but making them read as *broken
pieces of one thing* rather than confetti needs the fragments to be slivers of one silhouette,
not primitives; (2) the alignment score must be sonified and visualised continuously —
pitch = 440·(1 + 1/(1 + d²)) plus per-shard glow — or it becomes a hot-and-cold hunt.

**Risk:** Pixel-hunting for a point in 3D on a small screen. The continuous convergence
feedback is not optional; without it this is a bad idea.

---

## B5 — Blink and Keep It

**Verb:** blink (a tap on the eye button — the button already exists, hold is already taken).

**First 10 seconds:** You're in a room. You tap the eye out of curiosity. White flash; a
rectangle of light — the exact frame you were just looking at — peels off the air, tips over,
and lands flat on the floor at your feet, 2.4 × 1.35 units, showing the room. It is
completely flat, it is lying on the ground, and it has a glowing edge down its middle. You
have seen that edge before, in the first thirty seconds of the game.

**The rule they discover:** "A blink drops a flat picture of what I saw, and I can fold it."

**The impossible moment:** You fold the picture — same drag, same seam, same feel as the
very first fold — so that the far wall in the picture touches the near floor in the picture.
Then you look up. The real far wall has swung down and is touching the real floor next to
you. You folded a photograph and the room obeyed.

**The misunderstanding (later):** Blink while standing on the folded, impossible ground, and
the picture that falls out is not this room. It is the flat grid sheet from the opening,
seen from straight above, with a small white disc on it. The sheet you spent the first two
minutes folding was a photograph. Something blinked.

**Hidden math:** The fold operator conjugated by the projection — folding the image and
pulling the result back onto the world. If the world is the image plane of some projection,
editing the image *is* editing the world.

**Composes with:** *fold* (literally the same seam-drag code, applied to a 2.4-unit quad),
*observe* (the capture is the eye button's third verb), *dimension shift* (the picture is a
2D sheet — stepping onto it is another birth of depth, and the camera falls out of the sky
again, into a room made of your own snapshot).

**Phone controls:** Tap the eye = blink/capture. Hold the eye = still closes your eyes,
unchanged. Drag the fallen picture's glowing edge = fold it. d-pad walks; walking onto the
picture enters it.

**Build cost:** L — be honest about this one. Hardest parts: (1) the render-to-texture is
cheap (one `WebGLRenderTarget`, one extra render on the blink), but deciding what "the real
world folds too" *means* is not: it needs the photo's hinge line mapped back into world
space and every object crossing it transformed, which is a general version of the machinery
`roomFoldPoint()` currently hardcodes for one wall; (2) entering the picture is a second
`dim` transition and the current code has exactly one, driven by a single global.
**Scoped S/M version:** one scripted room, one scripted photograph, one hinge, three known
objects that move — build that first and only generalise if the beat lands.

**Risk:** If folding the photo doesn't instantly move something enormous and obvious in the
real room, it reads as a UI gimmick and the whole revelation dies. The far wall must visibly
swing, in the same frame, with sound.
