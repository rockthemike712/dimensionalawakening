# Act I, the experience edit

Judged from `8375336` (the canonical handoff SHA; `main` at the time), played
on foot at 390×844 (`hasTouch`, `isMobile`, `deviceScaleFactor:2`) with the
keyboard, `page.mouse` drags on the seam, the Corner's edges and the lamp,
and the DOM eye. `window.__DA.setPos` was used only to recover from walks
that timed out under a heavily loaded machine, and every use is listed in the
run's own log. Screenshots referenced here were taken by the run and looked
at, one by one, before any code was touched.

This is not a bug list. The directive for this pass was an *experience
edit*: label every beat, choose the three highest-leverage experiential
problems, fix only those, and prefer removing friction and sharpening causal
feedback over adding instructions. Nothing new was built: no region, no
mechanic, no system, no prompt.

## The beat map

Labels: **MAGIC** (instinctive whoa, urge to repeat), **WORK** (understood,
but executing instructions), **CONFUSION** (the rule cannot be inferred from
world feedback), **DEAD AIR** (nothing to be curious about), **OVERLOAD**
(spectacle or UI damages spatial comprehension).

| beat | label at `8375336` | why | after this pass |
|---|---|---|---|
| Title → first light | WORK | one clear nudge, the beads slosh, nothing to misunderstand | unchanged |
| Push into the edge, refused | WORK | the refusal reads; the prompt names the edge | unchanged |
| Grab and pull the edge | MAGIC | the far half visibly comes to you; latches at ~140 px of thumb travel | unchanged |
| The crossing | MAGIC, with an OVERLOAD frame | camera falls, disc becomes sphere, reeds extrude; but a flat grey card lay across the bottom third of the first frames, under the pad | the card is gone (edit 1) |
| Free play | DEAD AIR / CONFUSION | a dark grid, one light, reeds that do nothing until brushed; the nearest thing to the crossing is the Lamp, and inside it the only signpost went dark | the field answers you; the arrow keeps pointing (edit 1) |
| Walk to Thin, Thin's entrance | WORK | the entrance now faces the corridor (fixed in `8375336`) | unchanged |
| Column A: squash, slot | MAGIC | disc from overhead, letterbox slot, second wall, goal diamond: the act's best toy | unchanged |
| Column B, the gap, column C | WORK | the same toy, three times, with the gap as the one contradiction | unchanged |
| Thin's goal | DEAD AIR | the light goes out and the frame is empty floor and a counter; a black jagged shimmer under the player | the walls exhale and you turn to watch (edit 2) |
| Thin → Corner on foot | WORK | walkable since `8375336`; the arrow points the right way | asserted by the test now |
| The Corner: the X, pull A, pull B | MAGIC | the quarter of the world swings over you and puts a light down | unchanged |
| The mirrored self | CONFUSION → WORK | visible from the X since `8375336`, dimmer and cooler than you | unchanged |
| Gate 1 (A then B) | CONFUSION | the light rested with its ring clipped by the frame edge; the two orders differed in *whether* you could see the light, not *where* | in frame (edit 3) |
| Gate 2 (B then A) | MAGIC | lands in the middle of the frame with its marker under it | unchanged |
| Corner → Lamp | WORK | a walk with a correct arrow | unchanged |
| The Lamp: pull, walk, the shadow crosses | MAGIC | your shadow standing on the far side of a trench you cannot cross | unchanged |
| Hold the eye, the swap, the look-back | MAGIC | you are on the far side; something still, ring-lit, stands where you were | unchanged |
| The far light, act done | WORK | a short confirmation walk | unchanged |
| The room rises | OVERLOAD | it fires correctly, and from the Corner side it is a pale untextured mass across the lower frame (the previous judge’s finding 13) | unchanged; the next pass |

## The three strongest moments

1. **The Lamp's swap.** Eyes closed, three footsteps, and you open them on the
   far side of the trench with a dim, motionless copy of yourself standing
   where you were. No text, no explanation, and the question the whole act
   builds to is asked by an image.
2. **Column A in Thin.** A ball walks into a column of light and becomes a
   coin, seen from above, with a letterbox slot in front of it that only a
   coin fits. It is a toy before it is a rule, and players repeat it.
3. **The Corner's second pull.** The folded quarter swings over your head and
   sets a light down beside your feet. Done in the other order it lands
   somewhere else. Same two moves, different world.

## The three weakest moments (at `8375336`)

1. **The first frame of depth.** The crossing is the thesis made playable and
   its first frame had a flat grey card across the bottom third, with the pad
   on it.
2. **Free play.** The plan gives the player a minute to enjoy depth before the
   next contradiction, and the field gave them nothing to enjoy: a dark grid,
   one light, reeds that ignored them. The Lamp, the act's climax, is the
   nearest thing to the crossing, and a wanderer who entered it lost the arrow.
3. **Thin's goal.** The act's first rung ended on a blank: empty floor, a
   counter still reading `SLOTS 2 / 2`, and a shimmer of z-fighting geometry.

## Exactly what changed

### Edit 1: the crossing and the field (`src/game.js`)

- **The grey card** was the seam's wall of light, a 56×2.6 additive plane at
  x=0 drawn at 16% whenever the world is 3D. From the crossing point the
  camera is still 3.5 units west of it, so it lay across the frame between
  the seam and the player. It now fades in only once the camera is east of
  the seam: a wall you look back at, never one you look through.
- **The field answers a near player.** Reeds within three units lean off your
  path, blended toward your heading so walking parts them, and ease back
  through the same spring as a brush, a little brighter; no ring, no glue. The
  floor carries a shallow dimple trailing just behind your heading. Nothing
  else: no prompt, no objective, no counter, the digest rule untouched.
- **The arrow keeps pointing.** It used to stand down inside *any* unfinished
  Act I region; it now stands down only inside the rung it points at. Wander
  into the Lamp before Thin and the signpost survives.

### Edit 2: Thin's goal payoff (`src/regions/thin.js`)

A beat after the goal lands, the camera turns back down the corridor
(`lookBack`, the same hook the Lamp uses) and the slotted walls and the gap
sink into the floor on a slow underdamped spring while a ripple in the
region's colour runs back from the goal through each wall and one soft
descending tone plays. The disc pops once more. The counter goes. The
columns of light stay, so the squash is still a toy afterwards. Constrain
agrees with what is seen: nothing retired blocks. The gap's hole plate sat
coplanar with the floor and z-fought into the black shimmer; it is recessed.
A Continue with the goal taken restores the walls already sunk.

This is the visible counterpart of the rule `8375336` already applied in
code: *constraints disappear once the assumption they protect has been
learned.*

### Edit 3: the Corner's first gate (`src/regions/corner.js`)

Under the double hinge the reachable rest points for any raw position form a
narrow cone, and every point in it far enough from the settled standing spot
to keep the watch-then-walk-in guard sits in the same sideways band. The raw
point moves to the best point on that surface: the light and its ring are
fully in frame at a normal resting height, with the same margin outside the
collect radius. Dead centre is not reachable without either breaking the
approach guard or lifting the light out the top of the frame; the comment on
`RAW1` carries the derivation.

The rest point was only half of it. The Corner's entrance is on the +z side,
so a real player walks to the X from +z and parks a hair past hinge B's
line, and the hinge safety settled them on the *raised* half, from where the
delivered light projected at x≈12 px, clipped. That is the frame the judge
saw. While that light is still waiting, a parked player now settles on its
side of the hinge (the ground half, a 1.4-unit nudge with the same ripple),
so both parking sides give the same in-frame result.

### Tests

`tests/act1.mjs` now earns the digest instead of faking it, asserts the
arrow's drawn bearing against the projected target from two spots, walks
on foot from Thin's goal into the Corner and from the Lamp's far side back
to the crossing, and asserts the arrow stays up inside the Lamp while Thin
is next. Each new assertion was proven red against the mutation it guards.
`tests/thin.mjs` polls the retreat, catches the mid-turn frame in-page,
walks back through the retired corridor and checks the Continue state.
`tests/corner.mjs` projects gate 1 from the three standing spots the hinge
safety allows and asserts the band.

A note on the suite: several tests use fixed-duration holds and go red on a
loaded machine (five suites failed under a load average of 12 with three
headless browsers competing, and all pass alone). Green is only meaningful
from an idle run, and it is still not proof of experiential quality; that is
what the on-foot run is for.

### Removed or simplified

- The seam wall's constant 16% presence in 3D (it was invisible where it was
  meant to be seen and a wash where it was not).
- Thin's `SLOTS n / 2` counter after completion, and its walls and gap.
- The arrow's blanket suppression inside every unfinished region.
- The debug jump's leftover "TAP AN ARROW TO MOVE" hint.

## Deliberately not built

- **The room's rise.** The previous judge called it a pale slab at phone size.
  It was not re-judged in this pass because the act was not legitimately
  finished in one continuous run on the overloaded machine, and it is Act
  II's threshold; it stays on the list for the next pass, with staged rising
  (posts, then walls, then screen) as the obvious shape of the fix.
- **The Lamp before Thin.** The Lamp is the nearest region to the crossing and
  a wanderer can enter it first. The plan says nothing is hard-gated and the
  arrow now survives inside it, so the sequence still reads; moving the Lamp
  or gating it is a layout decision, not an experience edit.
- **The edge pull's thumb travel** (~140 px). It works within a 390 px frame;
  a latch-on-release would be a gesture change.
- **Any FORM-stage visual language beyond the field's answer to the player.**
  Breathing surfaces, morphing forms and almost-symmetries are the next pass,
  once the act reads as one authored awakening.
- **The page fade.** The previous judge proposed fading the page west of the
  seam once crossed. That was a misdiagnosis of the grey card (which was the
  seam wall), so the page was left alone.

## Evidence from a fresh phone-size run

One continuous session on the merged tree, on foot, 390×844, `hasTouch`,
`isMobile`, `deviceScaleFactor:2`, title to the risen room. Every rung was
earned in the fiction: the edge latched by drag alone (~140 px), the
crossing fired from walking into the pulled edge, Thin's goal was reached
after a real fall into the gap and a re-flatten at column C, both Corner
gates were walked into in both orders, the Lamp's swap fired on the eye
hold, and `actDone` flipped on the far light. One `setPos` in the whole run,
to reach a distant reed cluster for a screenshot after a bounded walk timed
out; no `jump3d`. Zero page or console errors. Frames are in
`docs/reviews/frames/act1-experience-edit/`.

| beat | wall-clock | what the run saw |
|---|---|---|
| Title → first light → edge refused | 0–15 s | as before |
| Pull the edge, the crossing | 34–54 s | latched at ~140 px; camera falls; **no card across the lower frame at +1 s or +4 s** (`after-crossing-1s.png`, against `before-crossing-1s.png`) |
| Free play | 54–163 s | digested at 52.9 s and 264 units of real wandering; reeds beside the player lean off the path (`after-field-reeds.png`); walked into the Lamp before Thin and the arrow stayed up, pointing at Thin (`after-lamp-before-thin-arrow.png`) |
| Thin | 185–263 s | column A squash, column B, a real fall, the put-back, column C flat, the gap crossed, the goal; counter gone at +0.5 s, the turn played (`wallsRaw` 1.04 → 0.99 → 1.01 across the look-back samples), corridor walked back to x≈9 and open (`after-thin-goal-lookback.png` is the suite's mid-turn frame; `after-thin-goal-settled.png` the run's) |
| Corner | 297–467 s | A then B, gate 1 in frame and walked into; unfold; B then A, gate 2 walked into; done (`after-corner-gate1.png`, and `after-corner-gate1-from-plus-z.png` from the +z parking spot the hinge fix covers, against `before-corner-gate1.png`) |
| Lamp | 503–544 s | lamp pulled, shadow across the slit, eye held, the swap, the look-back with the old self standing where you were, the far light (`lamp-swap.png`) |
| The room rises | 549–560 s | `actDone` true, the rise fired while walking back; from the Corner side it is still a pale untextured mass across the lower frame (`room-rise.png`), which is finding 13 of the previous judge, untouched by this pass |
| Total | 562 s | at headless speed, roughly 5–7 fps |

What the fresh run says about the ten exit criteria in the directive: a
clean run reaches the room without debug intervention (1); every signpost
pointed correctly, including from inside the wrong rung (2); no completed
region obstructed the player, and Thin's corridor walks back (3); the field
answers movement without a word (4); Thin's squash is still a toy after the
goal (5); the Corner's first light is in frame from both parking sides (6);
the swap is legible and eerie (7); the crossing, column A, the Corner's
second pull and the swap are 5–10 second clips (8); a fresh player's account
of the escalation was already confirmed by the previous judge and nothing
here names the math (9); the seam wall's constant presence, Thin's counter
and walls, the arrow's blanket suppression and the debug hint were removed
(10). The room's rise is the one thing still short of the bar, and it is
the next pass.
