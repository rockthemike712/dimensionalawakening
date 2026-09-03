# The Lamp, round 5 — critic's verdict

**DO NOT SHIP.**

Judged at 390×844, headless Chromium, `hasTouch/isMobile`, driven through
`window.__DA`, against `claude/game-idea-feedback-9s6ehf` @ `3166fb6` (the
round-4 head; `main` @ `30896f3` does not contain round 4). Screenshots are
absolute paths under
`/tmp/claude-0/-home-user-dimensionalawakening/6ba98dfd-5a27-548a-acc6-4c9ed56a43e0/scratchpad/shots/`
— written `SHOTS/` below.

`DA_BASE=http://localhost:8906 node tests/lamp.mjs` → **exit 1**. Tail:

```
fence z=7.5: final pos=[16.46,7.50] maxX=16.49
fence z=9.6: final pos=[16.47,9.60] maxX=16.49
fence z=27.5: final pos=[16.49,27.50] maxX=16.50
look-back window: sawLookingBack= true ... dimSample= 0.48 veilDuring= 0.894755
at the far light: {...,"finished":true,"farBeamOn":false,"farGlowOn":false,...}
restored: {...,"swapped":true,"finished":false,...}
ERRORS:
 - window.__DA gained unexpected keys: residue
```

The region's own assertions pass. Everything below is what the test does not
look at.

---

1. **BLOCKER — the suite is red.** `tests/lamp.mjs` exits 1 on the branch it
   was written for: `EXPECTED_DA` (tests/lamp.mjs:105-107) predates the
   `residue` getter added in the same series (src/game.js:1200), so the lamp's
   own test fails on a hook it does not use. A red suite is an automatic fail
   regardless of the rest. *Fix:* add `'residue'` to `EXPECTED_DA`.

2. **BLOCKER — the identity crack happens behind a black screen.** The whole
   point of the region ("something stands where you were") is only ever shown
   in the 1.4 s `lookBack`, and lamp.js:371-372 pins the veil at `.9` for
   exactly that window. `SHOTS/13-lookback-0.png`, `13-lookback-1.png`: at the
   peak of the swing the screen is ~90 % black; the old self is not visible,
   the lamp is a smudge. The test measured the same thing and asserted it as
   correct (`veilDuring= 0.894755`). After the look-back the camera is locked
   facing `+x` again and the old self is west, behind the player, forever
   unseen — I confirmed it is well framed with the veil hidden
   (`SHOTS/30-lb-01.png`: the old self and the player side by side, centre
   frame), so the shot exists and is thrown away. *Fix:* in lamp.js:371-372,
   do not force the veil during `lookingBack` — fall through to `base`
   (0 once the eye is released); the element's own `transition:opacity .35s`
   (index.html:65) then wipes the veil off the reveal instead of over it.

3. **BLOCKER — releasing the eye mid-swap inverts the whole beat.**
   `setVeilOp` (lamp.js:59) skips the DOM write when its cached `_veilCur`
   already equals the requested value, but `setEyes()` in the core writes
   `veil.style.opacity` directly (src/game.js:797) without touching that cache.
   Let go of the eye during the 1.55 s `swapLock` — the natural instinct after
   the three footsteps — and the veil drops to 0 while the region still
   believes it is at `.93`: measured `veil:0.033 / veilCur:0.93` and
   `veil:0.21 / veilCur:0.55` (`SHOTS/43-earlyrelease-0.png` — the "eyes
   closed" beat playing in full daylight, `43-earlyrelease-1.png` — the dolly
   visible). Then the post-swap `setVeilOp(this,.9)` (lamp.js:400) *does*
   differ from the cache, so the screen goes black **after** the swap and the
   look-back plays in the dark. Exactly backwards. *Fix:* drop the guard —
   `const setVeilOp=(region,v)=>{ region._veilCur=v; veilStyle.opacity=v; };`
   (one style write per frame is free; `_veilCur` is still needed for the
   `pendingLookBack` test at lamp.js:259).

4. **BLOCKER — the fence teleports the player 8.5 units and walls off the
   Corner.** lamp.js:456/467 pushes `pos.x` back to `HOLE_X0-.5` for *anyone*
   with `x∈[4,26]` and `z∈(7,11.3)∪(26.7,31)`, from either side, with no
   check that they were crossing the line. Two reproductions, both in normal
   play:
   - Walking south (`ArrowRight`) at `x=25` from the open field: `[25,5.3] →
     [16.5,7.07]` in one step — an 8.5-unit sideways snap while standing in
     the Corner (`SHOTS/40-driftA-before.png`, `41-driftA-after.png`).
   - Walking east (`ArrowUp`) toward the Corner along `z=8`: hard stop at
     `x=16.5` with the HUD reading `3D · CORNERS`, `CORNERS 0 / 2`, nothing on
     screen in front of the player (`SHOTS/42-blocked-at-z8.png`). The rails
     that are supposed to explain the fence are drawn at `z=11` and `z=27`
     (lamp.js:124-128), 3 units away and off-frame at this FOV.
   This is the owner's "movement appears nonfunctional" failure, in another
   region's bounds, before the player has ever seen the Lamp. The builder
   flagged the bounds overlap but not that it is a teleport. The test only
   ever walks east from `x=14` (tests/lamp.mjs:334-351), so it cannot see
   either case. *Fix:* make the fence a wall on `z`, not a shove on `x` —
   for `pos.x>HOLE_X0-.5`, block crossing `b.z0`/`b.z1` in either direction
   (`if(prevZ<=b.z0&&pos.z>b.z0) pos.z=b.z0-.1`, and the mirror at `b.z1`)
   and never touch `pos.x`. That is the rail the player can already see, it
   closes the walk-around from both sides, and it stops reaching into
   `corner`'s territory.

5. **SHOULD-FIX — the "lingering question" echo lands on top of the goal
   light.** lamp.js:421 places `farEcho` at `targetPos.x+3` = 26.5, clamped to
   25.4, with the far light at `(25,0,19)`; at `.3` opacity it is invisible
   inside the light's glow. Nothing appears in `SHOTS/13-lookback-3.png`,
   `-4`, `-5` (the whole 2 s window) except the far light. *Fix:* put the echo
   somewhere it is not eaten — e.g. `targetPos.z ± 2.5` at the landing `x` —
   and raise its opacity, or drop it and rely on finding 2's restored
   look-back.

6. **SHOULD-FIX — the old self does not read as *you*.** It is a gold-emissive
   icosahedron in a gold ring (lamp.js:179-183); the far light is a
   gold-emissive octahedron in a gold ring. Side by side in
   `SHOTS/30-lb-01.png` and `SHOTS/30-lb-02.png` they are the same object to a
   phone player — "a light I already collected", not "me, left behind". The
   player is a cool white sphere with a cyan halo. *Fix:* build the old self
   out of the player's own materials (white/cyan sphere + halo + the shadow
   ring), dimmer and still; keep gold for lights only.

7. **SHOULD-FIX — at full drag the lamp is a white slab in the thumb zone.**
   The builder's item 1, confirmed and worse than "vertical band only": at
   `u=1` the core+ring spans roughly x 130-260, y 645-775
   (`SHOTS/06-full-drag.png`, `07-full-drag-released.png`) — clear of the
   `↑` key by ~15 px, clear of the eye, but sitting behind the prompt pill and
   reading as a piece of UI rather than a lamp on a wire. LY_MIN was dropped
   to `.5` (lamp.js:28) to widen the swap window, which is what pushed it
   there. *Fix:* keep `LY_MIN` and move the lamp further up-screen instead —
   `LX` a couple of units east (13.5 → 15) shortens the on-screen fall while
   keeping the lamp-to-rim baseline; verify the ring's bottom stays above
   y≈620.

8. **SHOULD-FIX — the last fifth of the drag does nothing.** The shadow's raw
   `x` is clamped to `b.x1=26` (lamp.js:317); at the rim it reaches 26 at
   `u≈0.79` and then stops dead (`26.00` at `u=1`, and `24.75` just short of
   the end, per the test's own "drag curve" line). The most-earned part of the
   gesture has no feedback, and the shadow parks exactly on the far light
   (`SHOTS/06-full-drag.png`: the shadow ring is the ellipse around the goal
   diamond), which muddles "that is where I will land" with "that is the
   light". *Fix:* clamp the shadow to `b.x1-2` (out of the light) and let the
   last stretch of `u` show in the disc's stretch/rim rather than in `x`.

9. **SHOULD-FIX — nothing of the region is on screen while you approach it.**
   Horizontal FOV at 390×844 is ~36°, and the entrance light, the lamp and the
   far light all sit at `z=19` (lamp.js:89, `LZ=19`, `FAR_LIGHT`), 8+ units to
   the *side* of anyone walking in from the room. `SHOTS/50-field-toward-lamp.png`
   (from `(7,4)`): empty grid, no light, no lamp. `SHOTS/51-field-edge-of-lamp.png`
   (from `(7,10.5)`): the black slit appears, still no light. The region only
   composes once you are standing on `z≈19` (`SHOTS/20-entrance-real-act.png`,
   which is a good frame). *Fix:* the shadow throw is x-only, so `z` is free —
   move the entrance light, `LZ` and the far light to `z≈13.5` so the whole
   region stands in one up-screen column from where the player arrives.

10. **SHOULD-FIX — Act II's opening beat is spent off-screen.** Reaching the
    far light sets `finished`, which flips `actDone()` and builds the room in
    the same frame: measured `residue.rise = 22.33` (the 2.4 s grow-from-the-
    floor animation) while the player stands at `(24.9,19)` facing `+x`, 23
    units away with the room behind them. By the time they walk back it is
    over (`SHOTS/23-room-rise-a.png`: already fully risen, `PATTERNS 0 / 4`).
    `room.built:true`, `residue.s2active:true`, `shadowHex:0x16222E` all
    correct — the beat simply is never seen. Fix belongs in
    `src/game.js:495-501` (the room's `buildWhen`), not lamp.js: hold the
    build until the player is within sight of the crossing point.

11. **NIT — the eye's first appearance in the game has no affordance.** With
    the room demoted to Act II, the Lamp is the only place in Act I that shows
    `#eye` (grep: no other region touches it), and `onEnter` (lamp.js:201-202)
    shows the button but not `#eyeLabel`; the label is still room-only
    (src/game.js:499). A new round button appears in the corner with nothing
    saying it is a hold, and the fallback prompt is 8 s away. *Fix:* show
    `#eyeLabel` in `onEnter` on first entry and hide it in `onLeave` (the room
    already does exactly this).

12. **NIT — a held refusal thuds every 0.4 s forever.** `attemptSwap`
    (lamp.js:239) fires `blip(95,...)` on every retry while the eye is held,
    and the retry loop (lamp.js:356-359) never stops. The one veil dip is
    correctly de-duplicated by `_holdRefused`; the sound is not. *Fix:* gate
    the blip on `!this._holdRefused` too.

13. **NIT — the "stuck" prompt cannot reach a stuck player.**
    `'Pull the lamp down.'` needs `playerPos.x>HOLE_X0-3` (=14, lamp.js:433);
    a player who stops at the entrance (`x=8`) and never walks east — the exact
    person the fallback is for — waits forever. *Fix:* drop the gate to
    `x>LX-3`, or to "inside the region and the lamp untouched".

## What is right

The refusal reads (`SHOTS/52-refusal-1.png`: the near lip flashes red through
the dipping veil), the eye's held state is unambiguous
(`SHOTS/09-eye-held.png`), the swap lands you on the far side with a walk left
to the light, no narration or forbidden vocabulary appears anywhere on screen,
both prompts are ≤4-word instructions, the counter stays hidden, and the
residue (`shadowHex 0x16222E`, awakening bump) applies. None of that survives
findings 2-4.

## Screenshots

`SHOTS/` = `/tmp/claude-0/-home-user-dimensionalawakening/6ba98dfd-5a27-548a-acc6-4c9ed56a43e0/scratchpad/shots/`

| moment | file |
|---|---|
| entrance from the field | `50-field-toward-lamp.png`, `51-field-edge-of-lamp.png`, `01-approach-field.png` |
| first sight of the lamp and the shadow | `02-first-sight.png`, `20-entrance-real-act.png`, `03-entrance-lamp-shadow.png` |
| at the rim, lamp untouched | `04-at-rim.png` |
| mid-drag | `05-mid-drag.png` |
| full drag (pad / eye clearance) | `06-full-drag.png`, `07-full-drag-released.png` |
| the shadow across the hole | `08-shadow-across.png` |
| the eye held (veil) | `09-eye-held.png` |
| refusal (shadow short) | `52-refusal-1.png` |
| the swap | `10-swap-footsteps.png`, `11-swap-dolly.png`, `12-after-swap-held.png` |
| the look-back frame (as shipped) | `13-lookback-0.png`, `13-lookback-1.png` |
| the look-back with the veil removed (diagnostic) | `30-lb-01.png` |
| the far light / done | `16-approach-far-light.png`, `17-far-light-done.png`, `22-far-light-done.png` |
| the field after done() | `23-room-rise-a.png`, `25-room-risen.png` |
| the fence bugs | `40-driftA-before.png`, `41-driftA-after.png`, `42-blocked-at-z8.png` |
| the eye released mid-swap | `43-earlyrelease-0.png`, `43-earlyrelease-1.png` |
