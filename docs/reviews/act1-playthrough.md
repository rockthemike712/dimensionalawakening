# Act I, end to end — the critic's playthrough

**Verdict: DO NOT SHIP.**

Judged at `144d272` ("Corner round 5: approach-required collection, fold shading,
mirror clamp"), served from this worktree on `http://localhost:8913`, headless
Chromium at 390×844, `hasTouch`/`isMobile`, `deviceScaleFactor:2`, driven with
the on-screen pad, `page.mouse` drags and the DOM eye button; `window.__DA` only
to skip repetition or recover from a drop. Every screenshot below is mine and I
looked at all of them. They live in

```
/tmp/claude-0/-home-user-dimensionalawakening/6ba98dfd-5a27-548a-acc6-4c9ed56a43e0/scratchpad/pt/
```

written `SHOTS/` from here on.

The act does not finish. Two of its three transitions are walled off — you
cannot walk from Thin to the Corner along the line the game points you down,
and after the Lamp's swap (the climax, and Checkpoint 2) you are sealed on the
far side of the slit for the rest of the game and can never reach the room the
act exists to raise. The one signpost the world has, the beacon arrow, points
exactly 180° away from where it means for the whole act. Individually the three
regions are in much better shape than their last reviews; the *sequence* is
broken in three places, and it is the sequence this review was called to judge.

---

## What a fresh player comes out saying

Played as written, with the walls patched around, the ladder is real and it does
escalate. In a player's own words, after fifteen minutes:

> "I was a dot on a sheet of paper. There was a light, I walked to it, and then
> there was an edge I couldn't get past — so I grabbed the edge and *pulled the
> far side over to me*, and walked into it. Everything stood up. I was a ball,
> the smudges were pillars, there was a sky.
>
> Then up north there's a light that squashes me into a coin, and there are
> walls with letterbox slots in them that a ball can't fit through but a coin
> can. So being a ball isn't just what I am — it's a setting.
>
> East there's a cross on the floor. If I stand on it I can pull one line up,
> then the other, and the whole corner of the world folds over the top of me and
> puts a light down next to my feet. Pull them the other way round and the light
> lands somewhere else. Same two moves, different world. There's no one right
> arrangement.
>
> South there's a lamp on a wire. Drag it down and my shadow gets long — and
> then my shadow is standing on the far side of a trench I can't cross. I close
> my eyes for three steps and when I open them **I'm the one on the far side**,
> and there's something standing back where I was."

That is the escalation the plan asked for — flat → depth → being 3D is a state →
space has no single arrangement → which one is me? — and by beat 4 the player is
asking the question without a word of narration. Nothing on screen names the
mathematics; no prompt is over six words; the counter is gone outside regions.
That part of the plan has landed.

What they will *actually* say at `144d272`, unpatched, is the above with three
holes in it: "then I got stuck against a rail for two minutes and went round the
back", "I never worked out what the arrow wanted, it always pointed away from
things", and "after the shadow thing I couldn't go anywhere at all, so I closed
the tab."

---

## Findings, worst first

### 1. blocker — after the swap you are sealed in the Lamp's far pen forever; the act cannot be finished

`SHOTS/93-trapped.png`. Finish the Lamp (the swap puts you at x≈23.5, the far
light at (25,13.5) finishes the act) and then try to go home. From a Continue at
Checkpoint 2 I drove at thirteen different targets, north, south, east and back
west:

| aimed at | ended at |
|---|---|
| (25, 9) | (24.83, **11.46**) |
| (30, 5) | (30.02, **11.45**) |
| (35, 5) | (35.09, **11.45**) |
| (24, 28) | (26.05, **26.21**) |
| (35, 27) | (34.91, **26.56**) |
| (20, 13.5) / (16, 13.5) / (5, 13.5) | (**22.35**, 13.7) |

The pen is x ∈ [22.35, 39.5], z ∈ [11.44, 26.56], and there is no way out of it.
Cause: `src/regions/lamp.js:583-596` — the two-sided rail fence fires for **any**
`pos.x > HOLE_X0-.5` (16.5) with `pos.x >= b.x0`, deliberately with no upper x
bound (round-6 item 3), so z can never cross 11.3 or 26.7 anywhere east of 16.5
in the entire world; and `src/regions/lamp.js:609-618`, the slit, refuses a
westward crossing from the far side (`pos.x = Math.max(pos.x, HOLE_X1+.3)`).
North is fenced, south is fenced, west is the slit, east is the world wall. The
arrow says `next: room` and the room is real (`built:true`, `s2active:true`) and
unreachable.

The rails are drawn (`src/regions/lamp.js:171-176` runs them out to x=40), so this
is not an invisible wall and the pad never feels broken — it feels like a fenced
yard you have been left in on purpose, which for the last two minutes of Act I is
arguably worse. The state is otherwise sane on Continue
(`SHOTS/92-continue-act-done.png`: `actDone:true`, room built,
`risePending:false`, shadow residue `0x16222e`) — it faithfully restores you into
the pen.

**Smallest fix:** open the fence once the act's business on the far side is
done. In `constrain`, gate the rail block on `!this.finished` (and gate the
slit's westward refusal the same way): `if(pos.x>HOLE_X0-.5 && !this.finished)`.
The fence exists to stop a player sidestepping the slit *before* the swap; after
`finished` it has nothing left to protect. Verify: Continue at Checkpoint 2,
walk north out of z=11 and west to the crossing.

### 2. blocker — the beacon arrow points 180° away from its target, all act long

`SHOTS/100-arrow-ahead.png`, `SHOTS/101-arrow-left.png`,
`SHOTS/34-arrow-to-corner.png`, `SHOTS/39-thin-exit-sealed.png`,
`SHOTS/132-risen.png`. Measured with the next region pinned to Thin
(entrance (7,0,−14)):

| standing | target projects to | arrow points | should point |
|---|---|---|---|
| (2, −14) — target dead ahead | (192, 289) — top of screen | **87° (down)** | 267° (up) |
| (7, −8) — target off-screen left | (−284, 464) | **347° (right)** | 167° (left) |

`src/game.js:1093-1095`: the glyph is `&#8595;` (a *down* arrow), and
`ang = atan2(sy-h*.42, sx-w*.5)*180/PI + 90`. A down-glyph rotated by θ points at
screen angle 90+θ, so pointing at φ requires θ = φ − 90. The `+90` is a sign
error and every arrow in the game is reversed. The clamped screen *position* is
right, which makes it worse: the arrow correctly parks on the left edge and then
points back into the middle of the screen.

This is the world's only signpost ("Lights are the only signpost", WORLD.md), and
it is what a lost player looks at. When the target is on screen the error hides —
the arrow is drawn on top of the light and a down-glyph over a light reads as a
marker (`SHOTS/100-arrow-ahead.png`) — which is presumably how it survived. Every
time the target is off screen, which is most of the act, it is unmistakable: in
`SHOTS/39-thin-exit-sealed.png` the player is pinned against Thin's north rail
with the Corner beyond it to the right and the arrow points left; in
`SHOTS/34-arrow-to-corner.png` it is parked on the right edge pointing back into
the middle; in `SHOTS/132-risen.png` the room is dead ahead and the arrow points
down.

**Smallest fix:** `src/game.js:1093` → `...*180/Math.PI-90;`. Verify with the
probe above: target ahead ⇒ rotation ≈ 180 (glyph up).

### 3. blocker — the free-play beat lasts about seven seconds, not a minute

`SHOTS/07-crossing-1s.png` — one second after the crossing the prompt already
reads "Follow the lights." and the arrow is up. The digest rule
(`src/game.js:908`) is `t-dimT>60 || walked>40`, and `walked` accumulates
`|velocity|·dt` at the portrait speed of 6.2 u/s (`src/game.js:865`): **40 units
is 6.5 seconds of holding the pad.** Nobody spends 60 seconds in the field
without walking, so the `walked>40` arm always wins first and the 4:00–6:00
"enjoy depth" beat in the plan — the one beat the whole re-sequencing was for —
does not exist in a real playthrough. My own run digested before I had left the
crossing point.

**Smallest fix:** raise the distance arm to something a wanderer actually covers,
e.g. `walked>140` (≈23 s of continuous walking), or drop the arm entirely and
keep the 60 s timer. One number, `src/game.js:908`.

### 4. blocker — you cannot walk from Thin to the Corner; the exit is a sealed rail with no gate

`SHOTS/39-thin-exit-sealed.png`, `SHOTS/34-arrow-to-corner.png`. Thin's goal is
(27.6, −16). The Corner is north (+z). Thin's flank seal
(`src/regions/thin.js:571-579`) blocks every crossing of z = −11 for
x ∈ [10.5, 29.6] and puts you back at z = −11.35. I spent **61 seconds** of pad
input bouncing off it (`sealHits` climbing, the same ripple over and over) before
routing east to x = 30.4 and round the end of the wall. On screen the seal is a
hairline translucent rail seen edge-on — it does not read as a wall you must walk
around, it reads as a scuff on the floor, and the (reversed) arrow points west
along it.

The seal is right to exist — it stopped the round-3 lane exploit — but it should
not survive the region it protects.

**Smallest fix:** stop sealing a finished region: in `constrain`, wrap the seal
block in `if(!goalReached)`. A player who has taken the goal has nothing left to
skip. (If the seal must stay, shorten `SEAL_X1` to just past the last wall,
x≈21, so the corridor's east end opens onto the Corner.) Verify: reach the goal,
hold north, arrive in the Corner.

### 5. should-fix — "Pull the lamp down." is shown from a spot where the lamp is off the left edge of the screen

Probe at z = 13.5, measuring `project(15.8, 2, LAMP_LZ)`:

| player x | lamp on screen | prompt |
|---|---|---|
| 13 | (78, 285) | "Pull the lamp down." |
| 15 | (45, 361) | "Pull the lamp down." |
| 16 | (20, 412) | "Pull the lamp down." |
| **16.6** (the near lip, where the fence parks you) | **(−1, 448)** | "Pull the lamp down." |

`SHOTS/61b-lamp-at-lip.png` — the prompt is up and there is no lamp in the frame.
The lip is where the far light's beam leads you, where the slit stops you and
where the region's own prompt fires; it is also the one place you cannot do what
the prompt says. It cost me a whole failed run (`SHOTS/63b-lamp-pulled.png`: drag
at the lip, `dragU` still 0). Conversely, from where the lamp *is* grabbable
(x≈13.5) the drag works first time and the shadow then reaches across the slit
once you walk east — so the region is fine; the ordering is a trap.

`tests/lamp.mjs` already prints this and does not assert on it — its own log line
reads `project(lamp) at the rim: { x: -21.88, y: 338.26 }` — so the region's test
watches the lamp leave the screen and passes.

**Smallest fix:** suppress the prompt when the lamp is not on screen — in the
prompt branch (`src/regions/lamp.js:556-562`) require the lamp's projected x to
be inside the frame; or move `LX`/`LAMP_LZ` so the lamp still projects on-screen
from the lip. Verify with the probe table above.

### 6. should-fix — the mirrored self is hidden at the only place you can fold from

`SHOTS/104-ghost-on-crossing.png`. The Corner only folds within `GRAB_R` of the
crossing and teaches you to stand *on* it; standing there, `distX = 0.99` and
`ghost.visible=false` (`src/regions/corner.js:554`, `distX>1`). The mirrored you
appears only if you happen to step a pace off afterwards — and from three of the
six ordinary spots I tried it is then off-frame:

| standing | ghost |
|---|---|
| (27, 0) — on the X, where you pull | hidden (`distX` 0.99) |
| (28.4, 0) / (27, 1.6) / (25.5, 0) | visible |
| (27, −1.6) / (29, 1.5) / (24.5, −1.5) | off screen (ndc.x 1.04, −1.74, 0.87) |

So the plan's "a mirrored you stands on the folded quarter" is a coin flip, and
when it does show (`SHOTS/105-ghost-27-1.6.png`) it is the same white sphere with
the same halo as the player, in a frame that is 60% untextured folded plane — I
could not tell which sphere was me.

**Smallest fix:** drop the `distX>1` gate to `distX>0.45` (it exists only to stop
the ghost sitting *on* the player; 0.45 is past the player's own radius), and
give the ghost a visible difference from the player — invert its shading or drop
its emissive, so the double reads as a double and not as a render of you twice.

### 7. should-fix — flatness never drains while you hug an unpassed wall's x, anywhere in the region

Entering column A at (8.2, −15.4) and holding up-left, I walked to (10.9, −26.8)
— eleven units, the full length of the region — with `flat` pinned at 1 the whole
way. `src/regions/thin.js:469`:

```js
if (flatRaw > .5) for (const w of WALLS) { if (!w.passed && Math.abs(playerPos.x - w.x) < 1.1) { insideAny = true; break; } }
```

has no z test, so anywhere in the 16-unit z-span of the region within 1.1 of
x = 11 sustains flatness indefinitely. The `HOLD_TIME` carry, the 6-unit column
spacing and the whole squash-pop-squash rhythm the revision was rebuilt around
are bypassed by walking along the wall. (Down the corridor proper it drains
correctly: 1, 1, 0, 0, 0 across x 10.1 → 15.7.)

**Smallest fix:** add the same z window the alignment hint already uses eight
lines below — `&& Math.abs(playerPos.z - w.slotZ) < 3.5`.

### 8. should-fix — Thin's entrance does not say what Thin is

`SHOTS/23-thin-entrance.png`. Arriving at (6.8, −13.6) the frame is four pale
glass slabs at four angles and two grey circles on the floor; the column of light
is a sliver at the top-left corner and the first slot is not visible. I could not
tell from this frame that there is a corridor, a slot, or anything to walk into —
and the entrance light has (correctly) gone out because I am inside the bounds.
Two steps later it is one of the best frames in the game
(`SHOTS/24-thin-squashA.png`: wall face-on, slot dead centre, second wall behind
it, goal diamond beyond) — the region reads from x≈9, not from its own entrance.

**Smallest fix:** move `entrance` from (7, −14) onto the corridor line, e.g.
(7, −16), so arrival faces straight down the corridor at column A and wall 0
instead of across the side seals.

### 9. should-fix — the delivered gate in the A→B order lands at the very edge of the frame

`SHOTS/44-corner-AB-landed.png`: gate 1 projects to x = **36 px** of 390, its ring
clipped by the screen edge, while the B→A gate lands comfortably at
(335, 621) with its ground marker under it (`SHOTS/48-corner-BA-landed.png`).
Round 5 called this and it is better than it was, but 36 px is not "the corner
comes to you", it is "something happened in the corner of your eye". The
asymmetry also undercuts the rule: the two orders are supposed to differ in
*where*, not in *whether you can see it*.

**Smallest fix:** move `RAW1` a little further along +z so its rest point sits
nearer the screen's middle third from the standing spots the fold safety allows,
and re-run the corner test's on-screen-frames check for gate 1 as it already does
for gate 2.

### 10. nit — the crossing's first frame has a hard grey band across the near ground

`SHOTS/07-crossing-1s.png`, `SHOTS/09-freeplay-a.png`: a straight-edged tonal step
runs the full width of the frame at the player's feet, with a flat grey wash below
it, for the first several seconds after the crossing. It is the page half of the
sheet under the 3D lighting, but at 390 px it reads as a untextured card laid over
the floor in the single most important frame of the game. It is gone once you walk
east (`SHOTS/11-freeplay-light3.png`).

**Smallest fix:** fade the sheet's west half toward the fog colour for `x<0` once
`crossed`, so the ground behind you falls away instead of ending in a line.

### 11. nit — the goal of Thin has no payoff frame

`SHOTS/32-thin-goal.png`, taken 1.5 s after `goalReached`: the light has gone out
(correct) and what is left is empty floor, the same `SLOTS 2 / 2` counter and a
reversed arrow. Every other rung of the act ends on an image; this one ends on a
blank.

### 12. nit — the edge pull needs ~200 px of leftward travel on a 390 px screen

`src/game.js:999`: `delta = (dragStartX - clientX) / max(innerWidth*.38, 260)`, and
`FOLD_OPEN` needs ~0.7, i.e. ~182 px. The seam projects at x ≈ 217
(`SHOTS/04-edge-blocked.png`), which leaves 217 px of room — it works, but a thumb
that grabs the seam a little right of centre runs out of screen before the fold
latches. Divide by `min(innerWidth*.38, 150)` on phones, or latch on release above
0.5 the way the Corner's edges already do.

### 13. nit — the room's rise is a pale untextured slab at phone size

`SHOTS/131-rise-07.png`: mid-rise the room is a flat, featureless light-grey
rectangle across the horizon with the (reversed) arrow drawn on top of it. The
beat fires correctly — `risePending` holds until the crossing is in view, then
`riseT` runs the 2.4 s spring, and the room is walkable afterwards
(`SHOTS/122-room-risen.png`, region `room`, `PATTERNS 0 / 4`) — but as a "a
structure stands where I began" moment it currently has no structure in it, just
a card.

---

## What is right, and worth protecting

- **No narration anywhere.** Every prompt in Act I is an instruction of five
  words or fewer: "Move to the light.", "Grab the glowing edge. Pull.", "Keep
  pulling.", "Walk into the edge.", "Follow the lights.", "Flatten first.",
  "Pull the other one first.", "Pull the lamp down.", "Close your eyes." No
  "fold", "dimension", "projection", "quantum" reaches the screen.
- **The counter is gone outside regions** (`countOp` 0 in the field, 0.68 only
  inside a region with a `hud()`), and `PLACES n / 4` is dead.
- **Entrance lights go out when you stand inside** (`src/game.js:940-944`,
  observed at Thin and the Lamp) and only the next rung keeps its beam.
- **The residues all fire.** Thin's stride-flatten shows up in the field
  (`flatPulse` 0.68 and 0.36 in walking samples, `SHOTS/131-rise-05.png`), the
  Corner's mirrored shadow flickers 2 frames in 40 of sampling, and the Lamp
  bumps awakening and lifts the player's shadow to `0x16222e`.
- **Continue at Checkpoint 1 is clean**: the card says THE FIELD, restores
  (11.8, −5.6) in the field with 3 lights, no counter, next = thin
  (`SHOTS/20-continue-1-offer.png`, `SHOTS/21-continue-1-restored.png`).
- **The pad never felt broken.** Every stop I hit was a drawn wall or rail that
  answered with a ripple and a low thud, not a snap, a teleport or a silent
  clamp — including the two that trap you (findings 1 and 4). Across the ~40
  frames I looked at closely I saw nothing large clip through the player; the
  worst is the Corner's folded quarter, which correctly passes *over* you.
- **Five frames are genuinely good at 390×844**: `SHOTS/06-pulled.png` (the far
  half brought near, with the far lights suddenly at arm's length),
  `SHOTS/24-thin-squashA.png` (the corridor: wall, slot, second wall, goal),
  `SHOTS/142-thin-in-column.png` (a disc, seen from overhead, and a letterbox slot
  it fits), `SHOTS/60-lamp-entrance.png` (the lamp on its wire, the trench, your
  own shadow already stretched out ahead of you) and `SHOTS/82-shadow-crosses.png`
  (your shadow standing on the far side of a trench you cannot cross). None of
  them look like a Three.js demo.

## Suite

**Green, all eight files** (`DA_BASE=http://localhost:8913`, run one at a time):
`act1` OK, `corner` OK, `lamp` exit 0, `octave` exit 0, `room` exit 0, `save`
exit 0, `smoke` exit 0, `thin` OK. Round 6's red lamp suite is fixed.

That is the problem. A green suite and an unfinishable act mean the tests are
measuring the wrong thing, and the gaps are specific and fixable:

- `act1.mjs` calls `__DA.digest()` rather than earning the digest, so finding 3
  (the free-play beat lasting 6 s) is invisible to it. *Add:* cross, hold one
  direction, assert `digested` is still false after 15 s of walking.
- Every test moves between regions with `setPos`, never on foot, so findings 1
  and 4 — both transitions sealed — cannot be caught. *Add to `act1.mjs`:* after
  `thin.done`, `driveTo` the Corner's entrance and assert you arrive; after the
  act is done, `driveTo` the crossing and assert `pos.x < 12`.
- The arrow is only ever asserted through `__DA.arrow` (its opacity) and
  `__DA.next` (its target id), never its direction — finding 2. *Add:* project
  the target, compute the screen bearing from (50%, 42%), and assert the drawn
  rotation is within 30° of `bearing − 90`.
- `lamp.mjs` prints the lamp's off-screen projection at the rim and asserts
  nothing about it — finding 5. *Add:* assert the lamp projects inside the frame
  wherever "Pull the lamp down." is shown.
- `thin.mjs` never walks the wall line off-slot, so the flatness leak (finding 7)
  survives. *Add:* flatten at column A, walk to z = −25 along x = 11, assert
  `flat` has drained.

## Beats, timed

Wall-clock is my own headless run at 5–7 fps with scripted pad input, so it is an
upper bound; the "real" column is what I think a thumb on a 60 fps phone costs.

| beat | mine | real | read? |
|---|---|---|---|
| Title → first light | 42 s | ~25 s | yes |
| Push into the edge, get refused | 5 s | ~5 s | yes |
| Find and pull the edge | 21 s | ~20 s | yes — but the edge is off-screen when the prompt names it |
| The crossing | 1 s | 1 s | yes (grey band, finding 10) |
| Free play | **7 s** | **7 s** | **no — finding 3** |
| Walk to Thin | 9 s | ~15 s | yes |
| Thin entrance | 3 s | — | **no — finding 8** |
| Column A: squash + slot 1 | 33 s | ~30 s | yes, the best toy in the act |
| Column B + slot 2 | 32 s | ~25 s | yes |
| The gap, at full size | 33 s | ~20 s | yes |
| Column C, cross flat | 37 s | ~30 s | partly — C is half off the left edge |
| The goal | 7 s | 5 s | weakly — finding 11 |
| Thin → Corner | **61 s and failed** | ∞ | **no — finding 4** |
| Corner entrance + the thud | 24 s | ~15 s | yes |
| Stand on the X | 9 s | 5 s | yes |
| Pull A | 15 s | ~10 s | yes |
| Pull B — the corner lands on you | 15 s | ~8 s | yes, dark but readable |
| The mirrored self | — | — | **no — finding 6** |
| Walk into gate 1 (A→B) | 11 s | ~10 s | marginal — finding 9 |
| The other order, gate 2 (B→A) | 40 s | ~25 s | yes, clearly a different place |
| Corner → Lamp | 34 s | ~25 s | yes |
| Lamp entrance | 3 s | — | yes |
| Pull the lamp down | 60 s (one failed run) | ~20 s | **trap — finding 5** |
| The shadow across the slit | 4 s | ~5 s | yes, the act's best frame |
| Hold the eye, the swap | 7 s | ~6 s | yes |
| The look-back / the old self | — | ~2 s | unverifiable at 5 fps; `lookBackConfirmed` true, `oldSelfVisible` true |
| The far light, act done | 6 s | 5 s | yes |
| Walk back to the crossing | **failed** | ∞ | **no — finding 1** |
| The room rising | (forced with `setPos`) | — | fires correctly, looks like a card — finding 13 |

## Verdict, restated

Three regions that mostly work, wired together by a spine that is cut in two
places and signposted by an arrow that points the wrong way. Findings 1–4 are all
one-to-four-line fixes and none of them touch a region's design; fix those four
and this becomes SHIP WITH FIXES on 5–9. Until then a player cannot finish Act I,
so: **DO NOT SHIP.**
