# CRITIC 3 — PRODUCER / TECH LEAD
## Lens: cost, risk, and what survives contact with an iPhone

**Ground truth I graded against (read the file, not the pitch):** `index.html` is 935 lines,
one module, importmap to a vendored Three.js. The camera is **100% derived** — `updateCamera()`
recomputes position, FOV, `up`, and the screen-relative `fwd`/`rgt` from `dim`, `portraitMode()`
and `playerPos` every frame; there is no yaw, no orbit, no offset. Collision is **three hardcoded
AABB-ish tests** inside `updatePlayer` — there is no collision system, no physics, no level
concept, no scene management; everything is module-scope globals. The fold exists **twice**: as a
vertex-shader hinge and as a partial CPU mirror `foldedPoint()` that only handles the x=0 hinge
and only rotates in x/y. There are **no render targets and no post-processing**. Canvas pointer
handling is a **single `dragging` boolean** with no pointerId tracking. `audio()` never calls
`AC.resume()`, so every audio idea is silent on iOS until one line is fixed. The 22 `landmarks`
pillars have **no collision at all** — you walk through them today.

Three things I weighted heavily and the authors mostly didn't:

1. **The camera and the d-pad are this project's scar tissue.** HANDOFF §18 is four rounds of
"movement still appeared nonfunctional." Any idea that gives the player camera control, or
inverts the d-pad, or makes movement feel broken *on purpose*, is reopening the wound that
nearly killed the prototype. That is not a two-hour refactor. That is a month of feel-tuning
and a real chance of never getting back to today's baseline.
2. **In 2D the camera is FOV 4, straight down.** That is effectively orthographic. Any idea
whose payoff is a height change, a slope, or a shallow curve is invisible in stage 1.
3. **The owner said stop over-investing in one area.** Four ideas want the eye button to carry
a third and fourth job. The eye button is already the slit room's mechanic.

---

SCORE|A1|4|6|5|3|18
SCORE|A2|3|6|3|3|15
SCORE|A3|6|7|8|5|26
SCORE|A4|3|5|3|4|15
SCORE|A5|3|8|4|1|16
SCORE|B1|7|7|8|8|30
SCORE|B2|6|8|6|4|24
SCORE|B3|4|6|6|4|20
SCORE|B4|4|5|6|6|21
SCORE|B5|4|8|5|3|20
SCORE|C1|5|6|4|6|21
SCORE|C2|4|6|4|4|18
SCORE|C3|6|6|5|6|23
SCORE|C4|6|7|6|6|25
SCORE|C5|4|4|5|3|16
SCORE|D1|3|6|6|4|19
SCORE|D2|7|8|7|8|30
SCORE|D3|6|6|7|2|21
SCORE|D4|6|8|7|9|30
SCORE|D5|4|9|5|3|21
SCORE|E1|6|5|5|5|21
SCORE|E2|7|6|7|8|28
SCORE|E3|6|6|7|7|26
SCORE|E4|4|5|3|3|15
SCORE|E5|8|6|8|6|28

---

# THE CRITIQUES

## A1 — The Short Way Around
**Claimed M (a day). Real cost: L.** The author prices "keep the player in unrolled (r,φ) and map
to a `conePoint()`" as a bullet point; that is rewriting `updatePlayer` to work in a non-Cartesian
chart while keeping a new shader branch bit-identical to a new CPU mirror — the file's existing
`foldedPoint()`/vertex-shader pair is already only *approximately* in sync and only survives
because the fold is one hinge in one plane. The bigger lie is the payoff: the impossible moment is
**nine seconds of holding one d-pad key in a straight line** waiting to bump a faint trail. That is
the least interactive event in all 25 ideas, and it is the climax. Cheap and good: the pinch is a
one-DOF generalisation of a gesture that already ships, and "a seam is a wedge of angle 0" is the
right way to think about it — steal that framing for D2 and throw the cone away.

## A2 — What You Watch Backs Away
**Claimed S–M. Real cost: M, and it should cost zero because it should not be built.** This game's
entire recorded history (§18) is the owner failing four times to prove that pressing a button moves
the player, on a phone, and then rebuilding the camera and the input to fix it. A2 proposes, as its
core mechanic, *making the player press forward and not arrive*. The escape hatch is undocumented
and undiscoverable — the author's own mitigation is "probably the light itself has to pulse in time
with the eye button," which is a hope. Also glossed: warping `grid()` in the fragment shader makes
the floor *look* stretched but does not move the light, so the metric has to reach collision, the
guide line, the beacon arrow and `foldedPoint()` or the player catches the lie the moment they
close their eyes and arrive.

## A3 — The Doubling Door
**Claimed M. Real cost: L — but the expensive part is not the part they costed.** Scaling the
player and camera is genuinely near-free here precisely *because* the camera is derived: change
`player.scale`, `speed` and the `H`/`dist` terms, move `playerPos`, and the camera follows on the
same frame with no seam. That is the one place this architecture pays a dividend and the author
found it. What they skipped: **there is no hall.** There is a 24×18 shader sheet, 22 random
cylinders and a two-gap wall. A 22m hall with a skirting board and a crack that becomes a door is
hand-authored geometry in JS literals with no level editor — and "the fine 0.25 grid becomes the
walls" is a *fragment shader term*, not geometry you can walk into, so that beat requires real
meshes at every scale. Legibility is the best in the pool: a child understands "everything got
bigger" instantly, and 256× = 1× is free.

## A4 — Left Comes Back Right
**Claimed S–M. The shader half is honest; the idea is still dead.** `if(z>9){z-=18;x=-x;}` in the
fragment is nearly free, and flipping `rgt`'s sign is one line in a function that already rotates
the axes 90° across `dim`. Two things the author didn't cost: the camera targets
`foldedPoint(playerPos)`, so the wrap frame snaps the view 16 units — you need a camera wrap
offset, which means touching the derived camera. And the payoff is **deliberately inverting the
d-pad**, in this project, after §18. The mitigation is a half-metre spark changing sides — on a
6-inch portrait screen, top-down at FOV 4, with a 0.42-radius disc player and thumbs over the
bottom corners, nobody sees that. Every playtester files it as "the controls broke."

## A5 — The Room in the Stone
**Claimed "L (two to three days, honestly)". Real cost: a week-plus, and it forks the file
permanently.** There is no such thing as a level in this codebase — `playerPos`, `seeds`, `S2`,
`landmarks` are module-scope globals with no lifecycle. A5 needs three coherent level states, a
persistent trail texture *per level* driving a vertex displacement, two seamless transitions, and
3-cycle bookkeeping when the containment closes. Calling that two to three days is the largest
scope lie in the document. The conceptual payload is genuinely top-three (containment as a
3-cycle, watching the floor deform *before* you go down to cause it) and the author correctly
names the killer risk — cause and effect separated by a scene transition — then does not solve it.
Park it as the game's act three and revisit when there is an act two.

## B1 — Lower the Lamp
**Claimed M. Real cost: S–M — this is the only estimate in the document that is conservative.**
Central projection is five lines. `pShadow` already exists as a mesh (detaching it from the
`player` group is two lines). The draggable lamp reuses the *exact* vertical-drag-on-a-hidden-grab-
box pattern the file already implements twice (`seamGrab`, `S2.seam2Grab`). And the eye-swap the
author wants to dolly over 0.35s is, in this architecture, **`playerPos.copy(shadowPos)` under the
existing veil** — the derived camera arrives for free on the same frame. Glossed over: there is no
hole in the floor today, so you need a rect discard in the sheet fragment shader plus one AABB
block test (both cheap), and the `s → ∞` guard when `|L.y − P.y| < 0.05`. This is a complete
wordless loop — pull lamp, shadow reaches, close eyes, arrive — with a toy at the front, an
impossible move in the middle, and HANDOFF §14's designated final reveal at the end, and it
touches nothing that currently works.

## B2 — The Second Shadow
**Claimed M/L. Real cost: L, and it is the single riskiest FIT in the pool.** The reveal is
superb — arguably the best in Lens B — and "drag the thing on the floor and the world swings" is
instantly discoverable. But the mechanic *is* free camera orbit as the primary interaction, on a
phone, in the project whose camera has been rebuilt four times. The author's own mitigations (clamp
yaw to ±110°, keep a screen-edge arrow so the player doesn't lose their body) are an admission that
the base interaction strands people. Also underpriced: the canvas pointerdown is one if-chain with
one `dragging` boolean and no pointerId tracking, so seam-grab vs shadow-grab vs empty-space needs a
real priority pass, and the manual offset has to survive the `dim` blend and the portrait/landscape
rig without a pop.

## B3 — Built Behind Your Back
**Claimed M. Split it: act one is S, act two is L.** The plank-building half is a timer, an array
and the existing veil — genuinely cheap. But it is "hold two buttons and wait four seconds in the
dark," which is a no-input dead zone, and the author then removes all tension by making falling
impossible. The half that carries the actual revelation ("unobserved means outside the frame, not
behind your eyelids") requires camera yaw — the shared prerequisite — plus a shrunk frustum with
0.3s per-plank hysteresis or the boundary planks strobe. And it is the third idea in a row asking
the eye button to mean something new, in a game where the eye button is already the slit room's
mechanic and the owner has said stop over-investing there.

## B4 — One Right Place
**Claimed S/M. Honest for act one, wrong for the rest.** Fourteen quads on rays from a point V,
plus a distance score and `blip()` sonification, is genuinely an afternoon in this file — no new
systems, no new input, d-pad only. Acts two and three need the camera to go where the body can't,
which is the camera refactor again. The fatal criterion is "worth doing twice": an anamorphic
puzzle is worth doing exactly once, and the second instance is a chore — the author's own risk
line ("pixel-hunting for a point in 3D on a small screen") is the review. Also, anamorphosis is a
well-known art trick, which puts it nearer the handoff's *decorative* column than its conceptual
one.

## B5 — Blink and Keep It
**Claimed L, admitted. The scoped S/M fallback is not a mechanic, it is a cutscene.** "One scripted
room, one scripted photograph, one hinge, three known objects that move" is a set piece — worth
exactly one play, and the owner asked for fun *worth doing twice*. The full version needs a general
fold transform applied to arbitrary world objects, which is precisely the machinery this file
deliberately avoids (`roomFoldPoint()` hardcodes one hinge and the "room" is rotated as one group,
`S2.far.rotation.z`), plus a `WebGLRenderTarget`, plus a second `dim`-class transition when the
author correctly notes the code has exactly one driven by a single global. And the image itself
fails on the target device: a 2.4 × 1.35 quad lying on the floor, seen from a chase camera at
FOV 70, is a small trapezoid of mush.

## C1 — Knock
**Claimed S. Real cost: S for the code, fatal for the device.** The audio-clock scheduling advice
is correct and the `emitRipple`/`blip` plumbing exists. Two mispricings: the flagship two-thumb
moment (grab the seam with one thumb, knock with the other) needs pointerId tracking the canvas
handler does not have — today a second pointerdown re-raycasts and clobbers `dragStartX`. And the
author writes, out loud, "hearing is the only way to find it and looking never is" — on an iPhone
whose ringer switch silences Web Audio entirely, held by a child in a room with other people. That
is not a mitigable risk, that is a black screen for a large share of players. The negative-delay
object that answers before you knock is a lovely payload trapped in an undeliverable channel.

## C2 — Shut
**Claimed M–L. Honest, and still not worth it.** The three-bucket noise mixer instead of twelve
panners is the best piece of audio engineering advice in the document and I'd steal it. But the
mechanic needs collision to *swap sets*, and there is no collision system to swap — there are three
hardcoded tests — plus a second room's worth of geometry hand-authored with no editor. Then the
author's own graceful-degradation fix (render the three gains as a brightness gradient on the veil)
quietly converts the whole idea into "walk toward the dark part of the screen," at which point the
synesthesia is gone and you have built an expensive fog-of-war. The "eye sticks shut" recovery is a
genuinely good mechanic and an admission that the base loop strands people.

## C3 — Where the Wobble Stops
**Claimed S–M. Honest, possibly generous — this is the cheapest real mechanic in Lens C.** Two
oscillators with `setTargetAtTime` driven by distance to two existing `landmarks`, plus one box that
appears when |Δf| < 1.5. No camera change, no input change, no collision change beyond a walkable
bridge. The author is right that beats are amplitude modulation and survive a tinny mono speaker
intact — that is the only defensible audio claim in the lens. Two problems they skip: **there is no
visual channel at all**, so a player with the phone muted has literally zero information and no
proposed fallback (a throb on the pillars at the beat rate would fix it and costs nothing); and
"walk until the hum stops" is a hot-and-cold hunt landing immediately after an interference room the
owner already asked to stop investing in. The three-pillars-merge-into-one-silhouette image is
strong and legible on a small screen.

## C4 — Tune
**Claimed M. Real cost: S–M for the code, M for the gesture problem they hand-waved.** The
engineering call is correct and cheap — one shared `ShaderMaterial` with a per-instance `aHue`, one
`uHue` uniform per frame, a JS `cos(Δh) > 0.7` collision test, and the 22 `landmarks` records
already have the right shape to carry a hue. Then: **vertical drag on the canvas is already taken**
(`dragging2`, the second seam), and horizontal drag is the fold. Discriminating a third meaning by
drag *angle*, with a thumb, is a designer's sentence, not a player's experience. The author's own
colourblind/daylight mitigation makes hue redundant with luminance and pitch, which reduces the
headline mechanic to a solid/ghost filter switch. What earns the score anyway: dragging a thumb and
watching the entire world change colour while objects thud into existence is *immediately*
psychedelic and *immediately* fun, which is verbatim the owner's brief, and the one-full-turn twist
is real holonomy reachable inside one gesture.

## C5 — Eight Steps
**Claimed M. Real cost: M, and the author pre-concedes the idea away in their own risk section.**
Fitting the tempo to the player's first eight steps instead of asking them to calibrate is genuinely
clever. But mobile Safari plus Bluetooth latency plus `e.timeStamp`-to-audio-clock mapping is a
minefield, and the author's escape hatch — widen to ±140ms, then never fail the tile, just detune
it — leaves a mechanic that is "tap roughly in time and the note sounds nicer." That is a garnish.
Worse, it deliberately punishes hold-to-move, which is the input decision the owner spent four
documented rounds arriving at (§18); re-litigating settled input to serve a rhythm minigame is
exactly backwards.

## D1 — The Second Point
**Claimed M. Honest, and the integration is the most professional in the document** — it ends by
placing the player at (-7, 0, -1), the literal value `playerPos` initialises to, so the current game
resumes on line one, and it reuses `updateCamera`'s single-parameter lerp and `camUp.lerp` rather
than inventing anything. And it should still not be built now. HANDOFF §27 is "make the first 30
seconds genuinely fun and completely obvious on an iPhone." D1 puts **sixty seconds of tapping a dot
in the dark, with two of four buttons visibly dead, in front of that.** The author's own risk line
is "1D is intrinsically boring" and the mitigation is a time cap — capping the length of a boring
thing does not make it a good thing. A child hands the phone back. Keep the timed-gap-in-a-rotating-
cross-section idea; it is the right seed for D5. Deploy it later, not first.

## D2 — The Corner Comes to You
**Claimed M. Real cost: M–L, and the author names the exact place the days go.** The shader already
runs two sequential hinges (`uFold` at x=0, `uFold2` at x=8.6); making the second perpendicular and
order-dependent is not hard. The tax is `foldedPoint()`: today it is three lines rotating in x/y
only, and it must become two ordered `Vector3` rotations that match a rewritten vertex shader
exactly — the file's known fragile joint, where drift shows up as the player collecting lights they
aren't touching. Legibility is the real risk and the author buries the fix: a doubly-folded plane at
FOV 70 with 22 pillars on it *is* soup, and "rim light it" is a hope — **the mirrored copy of your
own body arriving on top of you is the thing that reads at any resolution**, and it should be the
headline, not the mitigation. What wins: it is the only idea that deepens the mechanic that already
ships, using the gesture that already ships, with no camera change, no new input, no new system —
and "wrong order" is a puzzle a child solves by saying those two words, with non-commutativity as a
physical fact and zero notation.

## D3 — Turning the Door
**Claimed L, admitted. Real cost: L, and it is the wrong kind of L.** Four `WebGLRenderTarget`s
rendered from mirrored virtual cameras, with the 45° case sampling two of them, is a second render
path in a file that currently has none — and it doubles cost precisely at the moment (the blend) you
most want frame budget. Then collision in a room where two wall sets are simultaneously solid, in a
game with three hardcoded AABB tests. Then four authored rooms with no level editor. That is an
engine feature request from a solo developer iterating on an iPhone with no build step. It is also
the most-done non-Euclidean demo on the internet, which caps its TRIP below what the author thinks.
The "a window is understood in three seconds" claim is completely correct and is why this idea is
seductive.

## D4 — The Flat Places
**Claimed S–M. True — and it is the highest fun-per-hour idea in all 25.** Every visual it needs
already keys off `dim`: camera height, FOV, `up`, fog density, the disc/sphere crossfade, pillar
`scale.y`, player scale, and the d-pad's axis mapping. Making `dim` a lerped state instead of the
current one-shot `ease((t-dimT)/2.0)` is about five lines against the file's most load-bearing
variable — small work, real care. The unmentioned complication is the good news and the bad news:
`fwd`/`rgt` rotate 90° as `dim` falls, so the d-pad axes swing back *during* the collapse. Handled
well that is the most visceral part of the beat; ignored it is a control disaster, and the author
does not mention it at all. Everything else is right: taking keys off the pad is the strongest use
of an existing control I have seen proposed here, it needs zero new UI, zero new gesture, zero new
art, and it delivers HANDOFF §16 (failure as dimensional collapse) and then §29's "wait, I
misunderstood the rule" by turning the punishment into the tool.

## D5 — The Rising Cut
**Claimed L, admitted, with the best fallback in the document.** "Object + draggable plane +
outline + four snap heights + a ghost of the player's own recorded path inside each silhouette" is a
real one-day scope and the "that was me" does most of the emotional work for free. But even the
one-day version requires **lofting the object from the level floorplans** so specific heights
produce recognisable geometry — the author's answer is correct and is also the entire job, and the
levels available to loft from today are a shader sheet, a wall with two gaps, and a screen. TRIP is a
9 and I don't hand those out: "every place you have been is a slice of one object" is the handoff's
own final bullet, and it retroactively pays off D1. It is also the capstone of a game with no middle,
and building the capstone before act two is the standard indie death.

## E1 — Corners
**Claimed M. Real cost: M for the toy, L for the beat, and the author admits the second half is
scripted.** Barbell → triangle → tetrahedron is cheap geometry and the spin-drag reuses the existing
non-seam raycast path. But the mitigation for readability — "scale the player 2× and pull the camera
back 15% while spinning" — is a camera change that fires *during a drag*, which is a nausea
generator on a phone. The five-corner shadow, the entire conceptual payload, ships as "a scripted
2-second shadow event," i.e. a cutscene. And "a 3-corner player can lie flat and slide under the
crease, a 4-corner player can't" requires collision to know about player shape, which does not
exist. The spin toy itself is real fun and worth stealing into another idea.

## E2 — Octave
**Claimed S–M. Honest.** Quantising the 22 existing `landmarks` heights to a harmonic series is a
one-line change to a `Math.random()`; ringing on contact is the same distance test the seed
collection already runs; tapping at range is two lines extending the existing raycaster to
`landmarks[]`. The thing that lifts this above C1 and C3 is the **redundancy plan**: pitch is also
hue and also the speed of the band running up the pillar, so "same colour, half the height" is a
rule a muted child can execute silently — that is the difference between an audio mechanic and an
audio-*only* mechanic. Unmentioned: the pillars currently have no collision, so "brush one at
walking speed" needs contact detection over 22 objects (trivial) and forces a decision about whether
pillars are solid (not trivial for the world's legibility). Running a line through six reeds and
hearing a phrase is fun inside five seconds with no goal and no words, and the fifth-grows-a-new-
pillar twist is a genuinely surprising rule correction.

## E3 — Thin
**Claimed S–M. True, with one real caveat.** Like D4 this is `dim` reversed and localised, so the
visual half is nearly free. Unlike D4 it needs collision to actually change — a "while flat, ignore
the depth axis for blocking tests" branch plus a hand-placed slot and gap to prove it — which is
small but real in a file with no collision abstraction. The second column that deletes a *different*
axis (two rooms become one room, an already-collected light is sitting there uncollected) is a
sharper conceptual payload than D4's. **But D4 and E3 are the same idea** — local dimensional
collapse driven by the existing scalar — and only one should be built. D4 wins on legibility (keys
sliding off the pad beats the camera swinging up) and on cost (no collision work). The 0.3s squash
with 1.15 overshoot vs 1.5s cutscene note is exactly the right instinct.

## E4 — Two Turns
**Claimed M–L. Real cost: L, understated even with the hedge.** A tube along a spline with
per-segment roll and a parallel-transport frame solve, hand-written with no helper library, that
must read as *untwisting* on a thread three pixels wide on a 6-inch screen. The author correctly
states that the belt trick is famously hard to see — if it is hard to see when a physicist
demonstrates it with a real belt in your hands, it will not land on a phone. Then the payoff mirrors
the world, i.e. inverts the d-pad (see A4), and asks the player to notice "your shadow falls on the
wrong side" when `pShadow` is a black circle centred directly under the player with no directional
light to fall from — an unmentioned gap that invalidates one of the three stated legibility cues.

## E5 — Beads
**Claimed M. Real cost: M, honest, with one nasty bullet mispriced as a bullet.** The engineering
call is right — one `InstancedMesh`, a flat 2D integrator, a coarse settle grid — and 300 beads
holds 60fps on a phone. Two things: the beads must roll on the *folded* sheet for the flagship
moment, which means keeping them in unfolded coordinates and drawing them through `foldedPoint()`
exactly as `updateLandmarks()` already does (cheap, correct, unstated). And the iOS
`DeviceOrientationEvent.requestPermission()` dance fires on a user gesture — the game's first
gesture is currently a d-pad tap that also boots `audio()`, so you would put an iOS system dialog in
front of a player three seconds into a game whose entire failure history is players not knowing what
to do. Ship the drag-a-virtual-tray fallback as the *primary* and the sensor as a bonus, and this
becomes the single best answer to "it could be more fun": it is the only idea in 25 that is fun
before you understand anything, with no goal, no prompt, no counter and no words — and it can be
dropped onto the existing 2D sheet, which is the weak part of the game.

---

# TOP 5

1. **B1 — Lower the Lamp.** The only idea that delivers a toy, a legible impossible move, and the
   game's designated final reveal in one honestly-M package, and the derived camera makes the
   shadow-swap free instead of hard.
2. **D2 — The Corner Comes to You.** It deepens the mechanic that already ships using the gesture
   that already ships, and "you did it in the wrong order" is the best wordless puzzle in the pool.
3. **D4 — The Flat Places.** Highest fun-per-hour by a distance — it is the existing `dim` scalar
   run backwards, and losing d-pad keys is the strongest possible use of a control you already have.
4. **E5 — Beads.** The highest FUN and CLEAR scores in the document, fun before comprehension, and
   it fixes the weakest part of the current build (the 2D sheet before the fold).
5. **E2 — Octave.** The cheapest genuine toy here, and the only audio idea with a redundancy plan
   good enough to survive a muted iPhone.

---

# KILL LIST

- **A2 — What You Watch Backs Away.** Its core mechanic is "pressing forward doesn't work," in the
  one project on earth that has already lost weeks to that exact perception.
- **A4 — Left Comes Back Right.** Deliberately inverted d-pad, with a half-metre spark as the only
  tell, on a top-down FOV-4 portrait screen. Reads as a bug to 100% of players.
- **A5 — The Room in the Stone.** "Two to three days" for three level states, per-level trail
  textures, two seamless transitions and 3-cycle bookkeeping in a file with no concept of a level.
  Off by a factor of three or more.
- **C5 — Eight Steps.** The author's own risk section concedes it down to "tap roughly in time and
  the note is prettier," and it re-litigates the settled hold-to-move input decision to get there.
- **E4 — Two Turns.** A parallel-transport ribbon solve, hand-written, to communicate a phenomenon
  that is hard to see with a real belt in your hands — plus inverted controls and a shadow cue that
  the existing shadow physically cannot give.
- **D3 — Turning the Door** *(as specified)*. Four render targets and a second render path is an
  engine feature request from a solo dev with no build step; the walkable four-rooms-through-one-
  frame idea can come back when there is a renderer to hang it on.
- **B5 — Blink and Keep It** *(as specified)*. The full version needs general fold transforms this
  file deliberately avoids; the scoped version is a cutscene, and the owner asked for things worth
  doing twice.

---

# ONE THING I'D BUILD FIRST

**B1 — Lower the Lamp.** It is the only top idea that needs no camera rewrite, no collision system,
no new gesture, no audio, and no authored geometry beyond one hole. It reuses the grab-box drag
twice-implemented in this file, the existing `pShadow` mesh, and the existing veil — and because
`updateCamera` is derived, swapping into the shadow is literally moving `playerPos`. Toy in five
seconds, impossible move in twenty, and HANDOFF §14's ending built in.
