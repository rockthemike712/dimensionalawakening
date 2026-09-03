# The Corner — round 4 review

**Verdict: DO NOT SHIP.**

## What I actually reviewed

Round 3 is **not on `main`**. `main` (and this worktree's base, `30896f3`) still
carries the round-2 corner: no `lookBack`, no dead-end prompt, no dormant marker,
no `constrain`, entrance on the crossing. The round-3 work lives only on
`claude/game-idea-feedback-9s6ehf` (`0a67c7b` + `8ec0d08`). I served that
branch's tree (tip `3166fb6`) on `http://localhost:8905` and judged it. Anyone
testing `main` today is testing round 2 — that alone is worth fixing before the
owner looks again.

Suite: `DA_BASE=http://localhost:8905 node tests/corner.mjs` → **`CORNER OK`**
(green, ~6 min, no page errors). Green, and largely uninformative — see 9.

Screenshots (390×844, headless Chromium, `hasTouch`/`isMobile`) in
`/tmp/claude-0/-home-user-dimensionalawakening/6ba98dfd-5a27-548a-acc6-4c9ed56a43e0/scratchpad/corner-r4/`.
The `Move to the light.` pill visible in all of them is an artifact of
`__DA.jump3d()`, which skips `birthOfDepth`'s `setPrompt('')`; the real crossing
and `applySave()` both clear it. Not a finding.

Round-3 claims that do hold up: the grab tie-break by first drag direction,
the wrong-touch gating on rest (a clean A→B collect produces zero thuds), the
dormant cold marker, the marker size and latch gating, the dead-end prompt text
and timing, prompt/drag/fold cleanup on leave, save→Continue round-trip.

## Findings

### 1. blocker — the giant gold ring at the player's feet is still there; it is this region's own entrance light
`03-on-crossing.png`, `q-crossing-entrancering.png`, `14-deadend-prompt.png`.
Standing on the crossing, a gold hoop ~170 px across sits across the bottom of
the screen, over the prompt pill and between the d-pad arrows.
`__DA.project(24.5,0.5,0)` returns `(195,662)` — the exact centre of that hoop.
It is the region light for `entrance:new THREE.Vector3(24.5,0,CZ)`
(`src/regions/corner.js:366`), which the core keeps lit until `done()`
(`src/game.js:928-932`). Round 3 moved the entrance off the crossing by 2.5
units, which is *why* the ring is now a hoop around the player's feet instead of
around the X. This is the owner's photograph, unchanged.
**Smallest fix:** put the entrance at `x≈21.5` (5–6 units back, outside
`GRAB_R`, so the ring is small and behind you and the "thud if you pull from
here" rule teaches the walk in).

### 2. blocker — the B→A gate is delivered off-screen, and the look-back does not show it
Per-frame recording across a B→A latch (recorder in-page on `requestAnimationFrame`,
player at `(25.5,-2)`): gate 2's screen position runs
`(776,−168) → (478,36) → (109,44) → (−20,58) → (433,62) → (969,344)`. Exactly
**one** frame inside the 390×844 frame, at `y≈44 px` — the top edge, under the
title/HUD text — then it is gone; at rest it sits 2.5 screen-widths off the right
edge. The reason is geometric, not timing: `warp(31,0,6)` at order 1 is
`(21.74, 4.85, 0.90)`, i.e. 5.3 units *behind* the player and 4.85 up, and the
chase camera pitches ~38° down with a 70° fov, so at the plateau of the 180°
swing the gate is ~20° above the top of the frame. Yawing cannot fix a target
that is above the frame. `src/regions/corner.js:456`.
Screens `09-BA-lookback-400ms.png`, `10-BA-lookback-800ms.png`,
`11-BA-settled.png` (`sawLookback2` still `false` 2.4 s after the latch in that
run — nothing was shown).
**Smallest fix:** stop yawing and make the gate reachable by eye — hang the two
gate lights' beams *downward* (`userData.beam.position.y = -6`) so a column
joins the hovering gate to its ground marker, and/or draw the gate light at
`y = min(warp.y, 1.6)` while keeping its warped x/z. Then delete the `lookBack`
call; a 180° whip and back in 1.2 s with the finger still on the paper is worse
than nothing.

### 3. blocker — A→B collects itself; the arrival is never seen
The region teaches "stand on the crossing" (`GRAB_R`, the thud from far away),
and `warp(28,0,4)` at order 0 lands `(27.15, 4.10, −0.38)` — 0.41 units from the
X, inside `COLLECT_R` of anyone standing there. So the second edge's latch fires
`collect()` in the same frame, while the pointer is still down:
`17-B-middrag.png` (soup, 1/2) → `18-B-latch-moment.png` (2/2, paper already
sprung flat). The player never walks into the light and never sees the corner
land. `tests/corner.mjs` asserts this as the desired behaviour.
**Smallest fix:** `RAW1 = new THREE.Vector3(30,0,4)` — it lands 2.38 units from
the crossing (height 4.4), outside `COLLECT_R`, so the delivery is watched and
then walked into. (Verified by direct evaluation of `warp` at `fa=fb=1`.)

### 4. should-fix — the mirrored self does not mirror
`GHOST_R=1.7` clamps the reflection to 1.7 units from the player's *own* mapped
position (`src/regions/corner.js:425-427`), so for any position more than ~0.9
from the crossing the ghost is a fixed-offset tether that travels *with* the
player instead of opposite them — the one thing the brief asks it to do. It is
also hidden within 1.2 of either hinge (`:441`), which is exactly where both
gates are delivered, so it is invisible at the moment it is supposed to land on.
And the body lifts up to 1.1 while `ghostShadow` stays at `y=.02`, leaving the
shadow stranded a long way below the body: `s-ghost-crop.png` shows a white orb
on the crease and an unrelated dark ellipse well beneath it. `08-ghost-near.png`
at phone size: a second white dot.
**Smallest fix:** drop the clamp; draw the true reflection and hide it when it
projects outside the frame (`_projScratch.project(camera)` — the check already
exists a few lines down). Fade `ghostShadow.material.opacity` to 0 as the lift
rises instead of leaving it on the floor.

### 5. should-fix — the wrong-light thud fires *during* the correct collect
At order 1 the two gates sit 1.53 apart (`(23.24,0.6)` and `(21.74,0.9)`) with
`COLLECT_R=1.7`, so their discs overlap almost completely; any approach to gate 2
crosses gate 1's disc. A plain keyboard walk to gate 2 collected it with
`wrongTouches` going 0 → 1: the dull "wrong" blip and the chime land together.
`src/regions/corner.js:472-476`.
**Smallest fix:** suppress the wrong-light check when the live gate for the
current order is also within `COLLECT_R` (or when `d(correct) <= d(wrong)`).

### 6. should-fix — the hinge safety pushes the player onto the half that lifts
`const side = Math.sign(pos.x-CX) || Math.sign(prevX-CX) || 1`
(`src/regions/corner.js:502`, same at `:507`). A player standing exactly on the
X — where the beacon and the thud rule put them — gets `side=+1` and is pushed
*east*, onto the A half, and is then carried into the air by `mapPoint` as it
folds: `17-B-middrag.png`, a white ball floating in a cyan void with no ground.
That is a different version of the owner's "raised half passing through them".
**Smallest fix:** default the fallback to the near side (`|| -1` for both
hinges).

### 7. should-fix — both gate lights outshine the entrance from the field
`light1`/`light2` are built at module scope and added to `world` on import
(`:172`), and `animateGate(light1,t,!got1&&order===0)` leaves gate 1 fully active
— core, beam, point light — from the crossing onward, because `order` is 0 by
default and the player has not been anywhere near. Meanwhile the corner's
*entrance* light has no beam (it is not `nextRegion()` until Thin is done). So
the region advertises itself with the wrong light: `01-entrance-from-field.png`,
`02-inside-approaching.png` show a beamed gold light at `(28,4)` next to a
beamless hoop at `(24.5,0)`. This also contradicts ACT1's "only the next one has
its beam on".
**Smallest fix:** `animateGate(light1,t, !got1 && order===0 && curRegion===region)`
(same for gate 2).

### 8. should-fix — the delivered gate's ground marker is half-swallowed by the raised paper
`s-marker-crop.png` (3× zoom of the crease): the gold ring under gate 1 is
clipped by the raised half and reads as a black hole with a gold rim, not as a
place to stand. The marker sits at `y=.05` on ground that the A fold has taken
away, so the raised sheet depth-writes over its top half.
**Smallest fix:** `depthTest:false` (and a `renderOrder`) on the marker ring and
disc, or place the marker on the folded surface rather than on the vanished
ground.

### 9. should-fix (test) — the look-back assertion is a false pass
`sawLookback2` is set by **any** frame in which gate 2 projects inside the frame
while `order===1` (`src/regions/corner.js:463-467`), not only during the swing,
and `tests/corner.mjs` reads it after a `driveTo(27,0)` that itself walks the
gate into view. My run had the flag still `false` 2.4 s after the latch (states
in shots 09–11) — i.e. the swing showed nothing — and the same build passes.
**Smallest fix:** stamp the latch time in the region and only let the flag set
while `t - latchT < 1.2`; clear it on every fresh latch.

### 10. nit — the X does not read as an X
`02-inside-approaching.png`, `03-on-crossing.png`: edge B runs away up the
screen as a bright road, edge A is a faint horizontal smear washed out by the
patch's own cyan stripe along the same line
(`col += vec3(.1,.9,1.2)*exp(-abs(vPos.x)*2.2)…`, `:134`). The player also walks
in *along* edge B (`entrance` z = 0), so the crossing reads as one lit path with
a hoop on it. Two edges crossing is the whole premise.
**Smallest fix:** enter off the line (`entrance` z = ±3) and give the two bars
distinguishable brightness, or drop the `exp(-|vPos.x|)` stripe that duplicates
edge A.

### 11. nit — the dead-end timer is frame-time, not wall-time
`stuckT += dt` with `dt` clamped to `.1` in the core loop, so below 10 fps the
"10 s" prompt takes proportionally longer to appear — the exact case (a loaded
phone, a heavy double fold) where the player is most likely to be stuck. Use
`clock.elapsedTime` deltas.

## Bottom line

The round-3 list was implemented literally and, for the two items that mattered
(the gate you are supposed to see arrive, the ring in your face), it did not
change what the player sees. The region's own premise — *the corner comes to
you* — is currently either collected before it arrives (order A→B) or delivered
behind your head off-screen (order B→A). Fix 1, 2 and 3 and it is worth judging
again.
