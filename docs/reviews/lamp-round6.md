# The Lamp, round 6 — critic's verdict

**DO NOT SHIP.**

Judged at 390×844, headless Chromium, `hasTouch/isMobile`, driven through
`window.__DA`, against `claude/game-idea-feedback-9s6ehf` @ `a447fdc`
("Lamp round 5 review, merged onto the round-4 head"). Screenshots are
absolute paths under
`/tmp/claude-0/-home-user-dimensionalawakening/6ba98dfd-5a27-548a-acc6-4c9ed56a43e0/scratchpad/r6/`
— written `SHOTS/` below.

`DA_BASE=http://localhost:8909 node tests/lamp.mjs` → **exit 1**, twice, on
consecutive runs. Tail:

```
item3: veil samples during swapLock: 0.93 0.93
well after swap, eye still held: {...,"pendingLookBack":true,...,"veilCur":0.87}
item2: look-back samples: [{"lookingBack":true,"op":0.0653831,"oldProj":{"x":398.5,"y":320.6},"ok":false},
                           {"lookingBack":true,"op":0,"oldProj":{"x":765.6,"y":602.6},"ok":false}]
item6: old self emissive hex: 49e9ff
item5: echo at 24.7 16 far light at { x: 25, z: 13.5 } distance 2.52
at the far light: {...,"finished":true,"farBeamOn":false,"farGlowOn":false,...}
item3 (early release): veil samples during swapLock: 0.93
restored: {...,"swapped":true,"finished":false,...}

ERRORS:
 - item2: never found a look-back moment with veil<.3 and the old self on screen
```

Ten of the thirteen round-5 findings are genuinely fixed (list at the end).
The three below that are not, plus what round 5 did not look at.

---

1. **BLOCKER — the suite is red.** `tests/lamp.mjs` exits 1 on its own branch,
   on both of two consecutive runs: the item-2 assertion never catches the
   look-back. This one is the test's fault, not the region's — the poll loop
   (tests/lamp.mjs:508-527) does three `page.evaluate` round-trips plus a
   `#veil` read per sample on a 5–7 fps page, so it lands **two** samples
   inside a 1.4 s window and both miss the 0.45–0.95 s yaw plateau
   (`oldProj.x` 398 then 765 — the old self swinging back out of frame). I
   verified the underlying behaviour is correct by hand: with the veil at 0
   and `lookingBack` true, `project(oldX,.34,oldZ)` = **(195, 276)** — dead
   centre of a 390-wide screen (`SHOTS/22-lookback-true-b.png`, captured by
   pinning `looking()` and `lookBackT` from the page). A red suite is still an
   automatic fail. *Fix:* move the pass condition inside the page — a `rAF`
   hook that sets a flag when `looking()` is at its peak, `#veil` computed
   opacity < .3 and the old self's NDC is in range — and assert the flag
   afterwards. Do not sample it from Node.

2. **BLOCKER — finishing the Lamp raises an invisible wall in the middle of
   the field and turns Act II's HUD on over empty ground.** Reaching the far
   light flips `finished` → `actDone()` → the room's `buildWhen` →
   `startStage2()` (src/game.js:685-697), which sets `S2.active=true`
   immediately while `s2Group.scale.y=.001`. From that frame on:
   src/game.js:890 blocks the player at `S2_SCRX+.6` = **11.4** for
   `|z|<7`; src/game.js:884-886 blocks the bar at 6.6; the room's `onEnter`
   (src/game.js:498) shows `#eye` and `#eyeLabel`; and its `hud()` puts
   `PATTERNS 0 / 4` in the corner. All of it with **nothing on screen**.
   Reproduced by walking, not teleporting: finish at (25,13.5), walk back
   west along `z≈1.5`, dead stop at `[11.44, 0, 1.50]` in open grid, HUD
   reading `3D · THE ROOM`, `PATTERNS 0 / 4`, the eye and "HOLD · CLOSE EYES"
   lit, and the player sphere flung down behind the d-pad by the room's own
   camera pull-back (`SHOTS/62-invisible-wall.png`; before:
   `SHOTS/61-before-invisible-wall.png`). The player can only reach the
   crossing by detouring to `|z|>7` (`SHOTS/63-round-the-room.png`), which
   nothing suggests. This is the owner's rule 7 verbatim — the pad stops
   working against a wall that is not there. Round 5's item 10 asked for the
   build to be held until the crossing is in sight; what shipped holds only
   the *geometry*. *Fix:* in src/game.js, gate the room's collision, HUD and
   eye on the rise having actually started — `S2.risePending` is already the
   flag: add `&&!S2.risePending` to lines 884 and 890, and to the room's
   `hud()` and `onEnter`.

3. **BLOCKER — the slit can be walked around at `x>26`, and the region then
   cannot be finished at all.** The fence's first line
   (src/regions/lamp.js:501) returns early for `pos.x>b.x1`, and the rail
   meshes stop at `b.x1` too (lamp.js:140-144), leaving open ground east of
   them. Walked, not teleported: east along `z=8` to `[26.79,0,8]`, south to
   `[27.04,0,13.64]`, then west — and the player is standing inside the
   region on the **far** side at `[24.68,0,12.38]`, HUD `3D · THE LAMP`, with
   the goal light an arm's length away and inert (`SHOTS/40-walkaround-on-far-light.png`;
   the rail visibly just ends beside the player in `SHOTS/37-south-from-corner.png`).
   `finished` correctly requires `swapped` (lamp.js:329) so there is no false
   completion — but that is worse for the player: the goal is reachable,
   touching it does nothing, walking back west is blocked at `x=22.32`
   (`SHOTS/41-far-side-blocked-west.png`), and the only exit is the way in.
   *Fix:* drop the `pos.x>b.x1` half of the early-out in lamp.js:501 (keep
   `pos.x<b.x0`) so the z-wall runs for every `pos.x>HOLE_X0-.5`, and extend
   `railW` east by the same amount so the rail the player can see matches the
   wall they can feel.

4. **SHOULD-FIX — the toy the brief asks for does not exist.** "Walk. The
   shadow walks a little further than you." Measured with the lamp untouched
   (`u=0`), stepping east along `z=13.5`: `x=14.5 → shadowX 15.10`,
   `15.0 → 15.60`, `15.5 → 16.10`, `15.7 → 16.30` — a **fixed** +0.60 decal
   that does not grow as you walk (the `WEST_OFF` branch, lamp.js:343) — and
   then east of the lamp `15.85 → 15.85`, `16.0 → 16.01`, `16.4 → 16.44`,
   `16.66 → 16.72`: a lead of **0.01–0.07 units**, i.e. none. `LY_MAX=4` with
   `CENTER_H=.26` gives `sGeom=1.07`, and the rim blocks at `x=16.7`, only
   0.86 units east of `LX`, so the projection has no baseline to work with
   anywhere the player can stand. On screen the shadow is a dark ellipse
   centred on the player's own feet at the entrance
   (`SHOTS/05-first-sight.png`) and at the rim (`SHOTS/07-at-rim.png`).
   Nothing happens in the first ten seconds until the lamp is dragged, and
   the region's premise is invisible until then. *Fix:* start the boost above
   1 — `const boost=THREE.MathUtils.lerp(2.6,S_BOOST,u)` at lamp.js:302 —
   so an untouched lamp already throws the shadow a body-length ahead, and
   the walk is the thing that reads first.

5. **SHOULD-FIX — the shadow snaps backwards as you step under the lamp.**
   The west branch and the projection branch (lamp.js:343-344) meet
   discontinuously at `x=LX`. At full drag: `x=15.79 → shadowX 17.39`,
   `x=15.85 → shadowX 16.36` — a **1.03-unit backward jump in one step** —
   then `16.0 → 18.05`, `16.2 → 20.30`, `16.4 → 22.55`. So the last stretch
   of walking makes the shadow lurch the wrong way and then race, in a region
   whose entire rule is "the shadow goes further than me".
   `SHOTS/31-fulldrag-x15p5.png` vs `SHOTS/30-fulldrag-x16.png`. *Fix:* blend
   the two branches over `x ∈ [LX-1.2, LX]` instead of switching at `LX`, so
   the curve is monotone through the crossover.

6. **SHOULD-FIX — the swap window is 0.3 units wide, and missing it says
   nothing useful.** At `u=1` the shadow clears `HOLE_X1+SWAP_MARGIN` only
   from `x>16.38`, and the rim blocks at `16.7`. From `x=16.2` — one small
   step back from the rim, a completely natural place to stand and drag —
   the shadow lands at **20.30, inside the hole**, and the hold refuses.
   The builder's claim ("clears from x 16.5..16.65") is true and is the whole
   of it. The refusal flashes the near lip red, which does not say "walk
   forward". *Fix:* the same change as 4 — a baseline boost widens the window
   backwards without touching `S_BOOST`'s top end.

7. **SHOULD-FIX — at the working spot the lamp, the shadow and the player
   stack into one blob.** At `x=16.0`, full drag (the refusal case above),
   the shadow ring projects to (195,425), the lamp core to (195,450) and the
   player to (195,500): three white/gold discs on the same screen column
   inside 75 px (`SHOTS/32-refusal.png`). At the rim the lamp **completely
   eclipses the player** (`SHOTS/09-full-drag.png` — the white blob in the
   gold ring is the lamp; the player sphere is behind it). Round 5's item 7
   is fixed as stated — the lowest geometry projects at `y≈522`, clear of the
   d-pad (`top:680`) and the eye (`top:708`) — but moving `LX` east to 15.8
   traded the pad collision for a collision with the player's own body.
   *Fix:* give the lamp its own screen column: `LZ = LZ - 2` (the shadow
   throw is x-only, so z is free) so it hangs beside the player instead of
   on top of them.

8. **SHOULD-FIX — the lingering echo is half off the right edge of the
   screen.** `targetPos + (1.2, 2.5)` = (24.7, 16) with the landing at
   (23.5, 13.5) puts it 2.5 units to screen-right, which at a ~36° horizontal
   FOV clips it on the viewport bezel: `SHOTS/54-echo.png`, the pale ellipse
   bisected by the right edge. Round-5's item 5 moved it out of the far
   light's glow and into the frame edge. *Fix:* `+1.2` in x, `±1.2` in z, and
   check `project()` lands inside 40..350 before showing it.

9. **SHOULD-FIX — the room now rises at arm's length, behind the d-pad.**
   `crossingInView` (src/game.js:700-702) only tests "on screen", and with
   the camera locked to `+x` and the detour of blocker 2 forcing the player
   round at `|z|>7`, the bar first satisfies it when the player is at
   `[6.01, 0, 1.38]` — **0.6 units from it**. The 2.4 s grow-from-the-floor
   beat then plays as a set of flat white bars along the bottom edge, mostly
   behind the controls (`SHOTS/71-rise-6.png`), and ends with the wall filling
   the frame and the player sphere drawn over the d-pad
   (`SHOTS/71-rise-7.png`). Round 5's item 10 was "the beat is never seen";
   this is "the beat is seen from inside it". *Fix:* add a minimum range to
   src/game.js:702 — `&&Math.hypot(playerPos.x-S2_BARX,playerPos.z)>10` —
   which, once blocker 2 lets the player walk in on the straight line from
   the Lamp, fires it while the crossing is still a landmark ahead.

10. **NIT — the lamp and the goal light are the same object.** Both are a
    gold-emissive polyhedron inside a gold torus with a beam from the sky
    (lamp.js:167-176 vs `makeLight`). At mid-drag they read as one small and
    one large copy of the same icon, 150 px apart
    (`SHOTS/08-mid-drag.png`). Round 5's item 6 fixed exactly this confusion
    for the old self; the lamp itself still has it. *Fix:* give the lamp a
    silhouette a light does not have — a shade, a cone, a crossbar — so "the
    thing I pull" and "the thing I walk to" are not the same shape.

11. **NIT — the lamp's core sits under the HUD on first sight.** From the
    entrance at `(8,13.5)` the core projects near `y≈75`, behind
    "DIMENSIONAL AWAKENING / 3D · THE LAMP" and the movement hint
    (`SHOTS/05-first-sight.png`). *Fix:* `LY_MAX` 4 → 3.2.

12. **NIT — holding the eye after the swap leaves the player in the dark
    indefinitely.** The look-back is correctly queued until release, but
    nothing times out: measured `veil 0.87`, `pendingLookBack true`, still
    true 2.5 s after `swapped` went true, with the eye held
    (`SHOTS/14-after-swap-held.png` is a black frame). A player who keeps
    their thumb down after the three footsteps — which the beat invites — sits
    on a black screen with no reason to let go. *Fix:* in lamp.js:288, also
    fire when `t-this.swapT0>2.5`, regardless of `S2.eyes`.

## Round-5 findings I confirmed fixed

- **1 (red suite / `EXPECTED_DA`)** — `'residue'` is in the list
  (tests/lamp.mjs:124); that error is gone.
- **2 (the crack behind a black screen)** — the veil falls through to `base`
  during the look-back (lamp.js:410). Measured `veil 0` with `lookingBack`
  true and the old self at (195, 276), centre frame:
  `SHOTS/22-lookback-true-b.png`. It reads as you — same white sphere and
  cyan halo as the player, dimmer and still.
- **3 (early eye release inverts the beat)** — the `setVeilOp` cache guard is
  gone (lamp.js:73). Releasing the eye the moment `swapLock` starts:
  veil `0.86 → 0.93 → 0.90` through the lock, then straight to `0.02` for the
  reveal. No daylight leak, no black look-back.
- **4 (the fence teleporting x)** — it is a two-sided z-wall now
  (lamp.js:514-521). Walking south at `x=25`: `x` unchanged at `25.00`,
  stopped at `z=11.18`. Walking east along `z=8`: reaches `x=26.09`
  unhindered (`SHOTS/36-z8-east.png`). `x` is never touched.
- **6 (the old self reading as a light)** — emissive `0x49e9ff`, ring
  `0x52f5ff`, grounded at `y=0`, restored the same way from a save.
- **7 (the lamp in the thumb zone)** — lowest geometry at `y≈522`; d-pad top
  680, eye top 708. Clear of both.
- **8 (the shadow riding the region edge / parking on the goal)** — clamps at
  `b.x1-2 = 24`, the light is at 25.
- **9 (nothing on screen on the approach)** — from `(7,8)`, three units short
  of the region, the slit and the far light are both in frame
  (`SHOTS/02-from-7-8.png`); by `(7,11)` the lamp's core is too
  (`SHOTS/03-from-7-11.png`).
- **11 (the eye's first appearance)** — `#eyeLabel` shows `block` on first
  entry and `none` on leave; "HOLD · CLOSE EYES" is legible under the button
  in every in-region shot.
- **12 (a thud per retry)** — the blip is gated on `!_holdRefused`
  (lamp.js:272). One dip over a 3 s hold: veil samples
  `0.82 0.53 0.87 0.87 …` and no further dip.
- **13 (the stuck prompt out of reach)** — standing still at the entrance
  `(8,13.5)`, "Pull the lamp down." appears after ~9 s
  (`SHOTS/06-stuck-prompt-entrance.png`).

Also verified clean: no `pageerror`/console errors in any run; no per-frame
allocation in `update()`; leaving the region restores `veil 0`, hides `#eye`
and `#eyeLabel` and clears the region's prompt; a teleport straight to the far
light without a swap does not set `finished`; save → reload → Continue
restores `swapped` and the grounded old self.

## Screenshots

`SHOTS/` = `/tmp/claude-0/-home-user-dimensionalawakening/6ba98dfd-5a27-548a-acc6-4c9ed56a43e0/scratchpad/r6/`

| moment | file |
|---|---|
| approach from the room, (7,4) / (7,8) / (7,11) | `01-from-7-4.png`, `02-from-7-8.png`, `03-from-7-11.png` |
| the entrance | `04-entrance.png`, `51-entrance-real.png` |
| first sight of the lamp and the shadow | `05-first-sight.png` |
| stuck prompt at the entrance | `06-stuck-prompt-entrance.png` |
| at the rim, lamp untouched | `07-at-rim.png` |
| mid-drag | `08-mid-drag.png` |
| full drag (pad / eye clearance; the lamp eclipsing the player) | `09-full-drag.png`, `52-full-drag-real.png` |
| the shadow across the hole | `10-shadow-across.png` |
| the eye held | `11-eye-held.png`, `53-eye-held.png` |
| the swap (footsteps, dolly) | `12-swap-footsteps.png`, `13-swap-dolly.png` |
| the eye still held after the swap (black) | `14-after-swap-held.png` |
| the look-back as shipped (headless misses the plateau) | `20-lb-00.png` … `20-lb-07.png` |
| the look-back plateau, pinned | `21-lookback-plateau-a.png`, `22-lookback-true-b.png` |
| the echo, clipped by the right edge | `54-echo.png` |
| the far light / done | `18-far-light-done.png`, `56-done.png` |
| shadow discontinuity at `x=LX` | `31-fulldrag-x15p5.png`, `30-fulldrag-x16.png` |
| refusal one step back from the rim (lamp/shadow/player stacked) | `32-refusal.png` |
| the walk-around east of the rail | `36-z8-east.png`, `37-south-from-corner.png`, `40-walkaround-on-far-light.png`, `41-far-side-blocked-west.png` |
| the early eye release | `42-early-release-a.png`, `42-early-release-b.png` |
| the invisible wall on the way back | `61-before-invisible-wall.png`, `62-invisible-wall.png`, `63-round-the-room.png` |
| the room rising, at arm's length | `71-rise-6.png`, `71-rise-7.png`, `72-room-risen.png` |
