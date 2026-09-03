# The Corner — round 5 review

**Verdict: DO NOT SHIP.**

Judged at `da06322` (Corner code = `79370bf` "Corner round 4" + its test commit),
served from this worktree on `http://localhost:8910`, headless Chromium,
390x844, `hasTouch`/`isMobile`. My screenshots are in
`/tmp/claude-0/-home-user-dimensionalawakening/6ba98dfd-5a27-548a-acc6-4c9ed56a43e0/scratchpad/r5/`
(paths below are relative to that directory).

The owner's three photographed complaints are gone. What is left is the region
itself. The one frame the whole thing exists for — both edges up, the corner
landed on top of you — is an unreadable wall of cyan with the HUD burned out of
it; the delivered gate still swallows itself at the latch from most of the spots
you can latch from; and the mirrored self is off-frame from every position east
of x=24, which is every position a player actually plays from.

Suite: `DA_BASE=http://localhost:8910 node tests/corner.mjs` → **RED** on the
first and only run. Tail at the end of this file.

## Findings

### 1. blocker — the A→B gate still collects itself at the latch; round 4's finding 3 is fixed only at the single spot the test stands on
`32-latch-275--15.png` (the frame right after the latch: paper already sprung
flat, `CORNERS 1 / 2`, no gate to walk to). Fresh region each time, `setPos` into
`GRAB_R`, park, tap edge A, tap edge B:

| standing spot | distance to the crossing | result at the latch |
|---|---|---|
| (27, 0) | 0 | `got1=false` — delivery watched, correct |
| (27.5, −1.5) | 1.6 | **`got1=true`** — collected on the latch frame |
| (28, −1) | 1.4 | **`got1=true`** — collected on the latch frame |

Both of those are ordinary places to stand: inside `GRAB_R=4.5`, on the near
ground, nothing telling the player they are wrong. `GATE1_REST` is
`(27.448, 4.398, −2.335)` and `COLLECT_R` is 1.7, so the entire disc of radius
1.7 around a point 2.0 units from the crossing is inside the pull zone
(`src/regions/corner.js:518-521`). Round 4's fix moved the gate 2.38 units out;
the parked player at (27,0) ends up 2.0 away after the hinge safety, i.e. the
whole guarantee is a 0.3-unit margin at one coordinate. Step one pace off the
X first and the corner's arrival is deleted again — the second drag's own latch
fires the chime, the flash and the spring-back while the finger is still down.
`tests/corner.mjs` only ever latches from `driveTo(27,0)`, so it cannot see this.

**Smallest fix:** make collection require an *approach*, not a radius. Latch a
flag when `latched` first turns true, recording whether the player was already
inside `COLLECT_R`; only `collect(n)` when the player was outside at that moment
and has since walked in. Four lines, and it removes the dependence on where the
gate happens to land.

### 2. blocker — the double fold is soup at phone size; the brief's non-negotiable is not met
`06-AB-latched.png`, `07-AB-settled.png`, `09-BA-latched.png`,
`10-BA-settled.png`, `26-dead-end.png`. With both edges up, 50–60% of the frame
is a flat, blown-out cyan-to-white gradient. There is no grid in it, no crease,
no sense of a sheet of paper; the `CORNERS 0 / 2` counter and its pips are
burned out and unreadable in every one of those shots; the gate light is a small
white diamond on a white field. `13-approach-gate.png` (standing 3 units south
of the crossing with both edges up) is a solid blue wall and nothing else — no
gate, no marker, no ground.

Two causes, both from copying the core sheet's *2D* fold shading into a fold
that happens in 3D:

- `src/regions/corner.js:165` — `col+=vec3(.1,.9,1.2)*exp(-abs(vPos.x)*2.2)*(.35+uFold*.9)`.
  `vPos` is the **post-fold** position, so after the A rotation `p.x = .149·X`
  and the "crease glow" spreads over the first ~3.4 world units of the raised
  half — which, seen from a chase camera two units away, is most of the screen.
  Additive `(0.13, 1.13, 1.5)` under ACES at exposure 1.36 clips to white.
- `src/regions/corner.js:166` — `col*=1.0+.9*uFold*vSide*(1.0-uDim)`. Inside the
  region `uDim` is 1, so the one term that was supposed to separate the raised
  half from the flat ground multiplies by exactly 1.0. The intended shape cue is
  dead code.

**Smallest fix:** move the `vFlat` line (`:175`) above `:165` and use the
pre-fold coordinate for the stripe — `exp(-abs(vFlat.x)*2.2)` — so it stays a
crease highlight on the hinge instead of a face wash; and drop the `(1.0-uDim)`
factor (or replace it with a darkening of the raised faces) so the fold reads as
two surfaces at an angle rather than one glow. Then re-shoot `07` and `26` and
look at them.

### 3. blocker — the mirrored self is never on screen from anywhere the player plays
Both edges latched, `__DA_corner.ghost().visible` sampled over the region on a
2-unit grid (90 positions, hinge lines excluded by the region's own rule):

- order A→B: visible at **18 / 90**, every one of them at `x ≤ 24`
- order B→A: visible at **9 / 90**, every one of them at `x ≤ 24`

Zero visible positions east of x=24. The crossing is x=27, both gates rest ~2
units from it, and `GRAB_R` keeps every fold within 4.5 of it — so at every
position from which the player pulls, watches the delivery, or walks into a
gate, the region's stated impossible moment is hidden. To see it at all you must
press *down* on the pad and back away 3–9 units, which is not a thing a player
does. `src/regions/corner.js:478-500`.

When it is on screen it is not legible either: `41-ghost-22--2.png` — the ghost
projects to (70,248) and reads as a faint blue-grey smudge in the cyan wash,
while the player's own body is a hard white ball. And `ghost().shadowOpacity` is
**0.000 in every sample I took**, because `raw.y` at the folded quarter is
always well above `GHOST_YMAX=1.1`, so `ghostLift` is permanently clamped and
the fade at `:490` permanently reaches full: the mirrored self has no shadow
ever, it is an orb hovering 1.36 above the floor. Round 4's finding 4 asked for
"fade the shadow as the body lifts"; what shipped is "no shadow".

**Smallest fix:** the reflection is geometrically correct and the 36° horizontal
frustum is what loses it, so clamp the reflected point's offset *along the
camera's right axis* (a few units) instead of not clamping at all — it still
moves opposite you, it just cannot leave the frame sideways. Give it a real
shadow on the surface it stands on, and give it the player's own white core so
it reads as *you* against cyan paper. Also tighten the on-screen test at `:492`
from `1.08` to `<0.95` — at 1.08 "visible" already includes off-frame (checked:
at (24,−2) the ghost was `visible:true` and projected to x=379 with nothing
drawn there, `42-ghost-crop.png`).

### 4. should-fix — the delivered gate light is drawn 2.8 units below the paper that carried it
`GATE_YCAP=1.6` clamps gate 1's rendered height while `warp()` puts it at
**4.40** (`src/regions/corner.js:450`, `:57`). Its ground marker meanwhile sits
at `y=.05` at the true x/z, on ground the A fold has taken away (which is why it
needed `depthTest:false`). So the region's own premise — the paper swings the
light down to you — is faked: the light is not where the fold put it, and the
CPU `warp()` no longer agrees with the GPU for the one object the brief names
("Test that a light placed on the far quarter renders where the folded ground
is"). The builder solved this properly for gate 2 by moving `RAW2` so it settles
at 1.36 with no cap at all; gate 1 got the cap instead.

**Smallest fix:** move `RAW1` the way `RAW2` was moved — a raw point whose
settled height is ≈1.5 and whose settled distance from the crossing is
comfortably outside `COLLECT_R` — then delete `GATE_YCAP` and the branch at
`:450-451`. (Finding 1 has to be fixed at the same time; a bigger settled
distance is not a substitute for it, but it helps.)

### 5. should-fix — the gold hoop is still around the player's feet, one region-length earlier
`03-at-entrance.png`: standing on the corner's entrance at (21.5,0,3) — which is
exactly where the beacon arrow sends the player — the entrance light's ring is a
gold hoop ~120 px across with the player's sphere inside it and the beam column
running up through the player. It is the owner's photograph again, moved from
the crossing to the doorway. It persists for the whole visit, because the core
keeps a region's entrance light lit until `done()` (`src/game.js:944`).

Round 4's fix (move the entrance back) removed it from the place the player
stands to *play*; it did not remove it from the place the player is told to walk
to. Not the corner's bug alone — every region has it — but the corner is where
it was photographed.

**Smallest fix (core, one line, `src/game.js:944`):**
`L.visible = crossed && !(r.done&&r.done()) && curRegion!==r;` — the signpost
goes out once you are standing in the place it points at.

### 6. should-fix (test) — the suite is red, and its retry loop turns a harness fault into a false product failure
One run, this head, nothing else touching the port:

```
 - could not re-latch B->A for the dead-end test: {"foldA":0,"foldB":0,...}
 - wrong or missing dead-end prompt: {"promptText":"","promptVisible":false}
exit=1
```

Upstream of both: six consecutive dropped gestures —
`drag on edge B did not register ... attempt 3 of 3`, then the same for A —
after the `driveTo(27,0)` that precedes the dead-end block. I could not
reproduce it by hand (same save state, same walk, `dragEdgeOnce('B')` latched
first try; `project(24,1,0)` is inside the viewport from every player x between
25 and 28), so it looks like the aim point in `edgePoint()`, which is a fixed
world point rather than a point on the *visible* part of the line, drifting to
somewhere unusable for whatever position `driveTo`'s bang-bang controller
happened to stop at. Either way: `dragEdge()`'s "retry up to 3 times and then
carry on silently" (`tests/corner.mjs:37-45`) converts a harness fault into an
assertion about the region, and the reported failure names the wrong thing. Aim
at a point on the line that is *known* to be on screen from the current camera
(project a few candidates along the hinge and pick one inside 40..800 px), and
fail loudly with "gesture never registered" rather than letting the next
assertion take the blame.

### 7. nit — `mapPoint` allocates a `Vector3` on every call, several times a frame
`src/regions/corner.js:629`. `foldedPoint()` runs for the player, the camera
target, each seed light and the guide line every frame, and each one that lands
in the corner's bounds allocates. The file's own comments claim "no per-frame
allocation". The contract (`WORLD.md`: "Return a new `Vector3`") forces it, so
the fix belongs in the core contract, not here — but the claim should stop being
made until it is true.

## Round-4 findings I confirmed fixed

(Round 4's 3 and 4 are **not** fixed — they are findings 1 and 3 above. Round 4's
1 is fixed where it was photographed but reappears at the entrance; see 5.)

1. **The entrance ring at the feet on the crossing** — `04-on-crossing.png`: no
   ring at all; `__DA.project(21.5,0.5,3)` from the crossing is `(626, 987)`,
   off-frame. (But see finding 5.)
2. **The B→A gate delivered off-screen, and the look-back** — `lookBack` is gone
   from the file. A page-side rAF recorder across a fresh B→A latch at the
   crossing: gate 2 on-screen for **79 / 79** post-latch frames, parked at
   (314,529); `10-BA-settled.png` shows it and its marker.
5. **The wrong-light thud during the correct collect** — a straight walk into
   gate 2 at order 1 took `wrongTouches` 0 → 0.
6. **The hinge safety pushing the player onto the half that lifts** —
   `05-A-only.png` / `40-A-only-crop.png`: a player parked on the X is settled
   to x=26.3, on the ground half, standing in front of the raised wall, not
   inside it. Walking across a latched hinge at speed passes through undisturbed
   (`|vel|<1.5` gate verified: 16 samples of a +z walk, no clamping).
7. **Gate lights outshining the entrance from the field** — `01-entrance-from-field.png`:
   from (12,1) the only lit thing is the corner's entrance light with its beam;
   both gates are dark.
8. **The marker clipped by the raised paper** — `06`/`10`: the gold ring reads
   whole on top of the fold.
9. **The false-pass look-back assertion** — removed with the feature.
10. **The entrance on the z=0 line** — moved to z=3; `04-on-crossing.png` reads
    as a cross, not one lit road.
11. **The dead-end timer** — wall-clock: the prompt appeared at `stuckT=10.47`,
    text `Pull the other one first.` (`26-dead-end.png`), and cleared the moment
    an edge was tapped off.

Also survived my attempts to break it: tap-toggle in both directions; pulling
the same edge twice (no-op, order unchanged); an L-shaped drag from dead centre
(commits to A, no double-fold); three fast opposite drags in a row (ends
correct); walking through a latched hinge at speed; leaving mid-fold (folds,
prompt, drag capture and ghost all reset); returning; `save()` → reload →
Continue restores `got1`. No page errors or console errors in any run.

## Suite tail

`DA_BASE=http://localhost:8910 node tests/corner.mjs`, one run, ~11 min:

```
drag on edge B did not register (fold stayed at 0 ), attempt 1 of 3
drag on edge B did not register (fold stayed at 0 ), attempt 2 of 3
drag on edge B did not register (fold stayed at 0 ), attempt 3 of 3
drag on edge A did not register (fold stayed at 0 ), attempt 1 of 3
drag on edge A did not register (fold stayed at 0 ), attempt 2 of 3
drag on edge A did not register (fold stayed at 0 ), attempt 3 of 3
re-latched B->A after it was already collected: {"foldA":0,"foldB":0,"order":1,"got1":false,"got2":true,...}
dead-end prompt after repeating the same order: {"promptText":"","promptVisible":false}
immediately after the A->B latch: {"foldA":1,"foldB":1,"order":0,"got1":false,"got2":true,"marker1On":true,...}
after walking into the A->B gate: {"foldA":0,"foldB":0,"order":0,"got1":true,"got2":true,...}
wrongTouches across the clean A->B latch + walk-in: 1 -> 1
after leaving: {"foldA":0,"foldB":0,...}
after continue: {"id":"corner","built":true,"visited":true,"done":true,...}
ERRORS
 - could not re-latch B->A for the dead-end test: {"foldA":0,"foldB":0,"order":1,"got1":false,"got2":true,...}
 - wrong or missing dead-end prompt: {"promptText":"","promptVisible":false}
exit=1
```

No page errors or console errors in the run, and none in any of my own dozen
browser sessions.
