# The universe: how a region is built

Read this before touching anything. It is the contract between the core
(`src/game.js`) and every place in the world (`src/regions/*.js`).

## The shape of the game

- **One sheet.** The whole universe is one plane, `WORLD = {x0:-40, x1:40,
  z0:-28, z1:28}`. The player starts on the small 2D *page* west of the edge
  at `x=0` (`PAGE`), folds the sheet, walks into the edge, and the world becomes
  3D. Everything east of the edge (`x > 1.4`) is walkable after that.
- **The room** (`x 1.4..11.8, z -8..8`) is the two-gap experiment. It is already
  built. Its walls only block inside its own z-range, so the player can walk
  around it into the rest of the universe at any time.
- **Reeds** (the pillars) are everywhere except inside region bounds. They ring
  and glue; leave them alone unless your region wants to use them.
- **Lights are the only signpost.** Every region gets one light at its
  `entrance` automatically. The screen-edge arrow points at the nearest
  unvisited region once the player leaves the room or finishes it. You do not
  need to explain where to go; you need to make the place worth arriving at.
- **`dim`** (0 → 1) is the dimensional shift. In 2D the camera is straight
  above with a 4° FOV; in 3D it sits behind the player. Regions live in 3D, so
  assume `dim === 1` inside your bounds unless you deliberately change it.
- **Input is screen-relative.** In 3D, "up" on the pad is `+x` and "right" is
  `+z`. Read `fwd` / `rgt` rather than hard-coding axes.

## Registering a region

```js
import * as THREE from 'three';
import {registerRegion, world, playerPos, velocity, dim, crossed, fwd, rgt,
        emitRipple, blip, slide, chime, pulseFlash, setPrompt, refreshHud,
        makeLight, makeHoldButton, foldedPoint, saveGame, planeMat, camera,
        clock, portraitMode, ease, addAwake, inBounds, landmarks, ringLandmark} from '../game.js';

registerRegion({
  id:'thin',                      // stable, lower-case; used in saves and tests
  name:'THIN',                    // HUD word, upper-case, one or two words
  bounds:{x0:4, x1:26, z0:-27, z1:-11},   // the walkable extent you own (no overlap with others)
  entrance:new THREE.Vector3(10,0,-12),   // where the light stands; inside bounds, on the side facing the room
  color:0x62ffff,                 // optional light colour
  build(){ /* create meshes once; add them to `world`. Called lazily, after the crossing. */ },
  update(dt,t){ /* every frame after build, even when the player is elsewhere */ },
  constrain(prevX,prevZ,pos,vel,dt){ /* optional: walls. Mutate pos/vel. Called after core clamps. */ },
  onEnter(first){ /* optional: player walked into bounds; `first` on the first time */ },
  onLeave(){},
  hud(){ return {label:'SLOTS', n:3, total:5}; },   // optional; the counter + diamond pips while inside
  done(){ return finished; },     // when true the entrance light goes out and the beacon moves on
  save(){ return {...}; },        // optional; JSON only. Called at every checkpoint
  load(d){ /* restore from save(); called after build() */ },
  debug(){ return {...}; },       // optional; exposed as window.__DA.regions[i].state for tests
});
```

Everything is optional except `id`, `name`, `bounds`, `entrance`.

### Region bounds already taken

| id | bounds | direction from the room |
|---|---|---|
| room | x 1.4..11.8, z -8..8 | — |
| thin | x 4..26, z -27..-11 | north (`-z`, "left" on the pad) |
| corner | x 15..39, z -9..9 | east (`+x`, "up" on the pad) |
| lamp | x 4..26, z 11..27 | south (`+z`, "right" on the pad) |
| beads | the 2D page, `x<0` | (a 2D-side toy; see its brief) |

Keep a 1.5-unit margin inside your bounds for reeds and walking.

## What the core gives you

- `world` — add your meshes here (it breathes with awakening; do not add to `scene`).
- `playerPos`, `velocity` — the player, in sheet coordinates (y is always 0).
  `foldedPoint(v)` maps sheet coordinates to world space (the first fold lifts
  `x>0` in 2D; in 3D the fold is flat, so it is the identity).
- `emitRipple(x,z,strength,color)` — a ring through the sheet. This is the
  world's touch language. Use it for every contact.
- `blip(freq,dur,gain,type,pan)`, `slide(f0,f1,dur,gain)`, `chime()` — sound.
  Every action gets a sound; keep gains ≤ .12. `pan` is -1..1 (use
  `(delta · rgt) / 6`).
- `pulseFlash()` — one inverted-colour frame. Use for the impossible moment
  only.
- `setPrompt(text)` — the pill. **Terse instructions only**, ≤ 6 words, no
  metaphor, no narration, no lore. `setPrompt('')` hides it. Prefer showing over
  telling; a prompt is a fallback after ~8 s of the player being stuck.
- `refreshHud()` — call when your `hud()` numbers change.
- `makeLight(pos,color)` — a light group (core, ring, beam, glow) for anything
  the player should walk to. Set `.visible` yourself.
- `makeHoldButton({id,label,svg,onDown,onUp})` — a round hold button in the
  eye's style, stacked above it. Returns `{el, show(bool), held, release()}`.
  Call `show(true)` in `onEnter`, `show(false)` in `onLeave`.
- `planeMat.uniforms` — `uAwake`, `uDim`, `uFold`, `uFold2`, `uRip[]`, `uRipC[]`.
  Do **not** edit the sheet shader; if your region needs a new sheet effect,
  say so in your report instead.
- `addAwake(k)` — increases the world's awakening (colour drift, moiré,
  exposure). Use sparingly at real milestones (≤ .15 each).
- `landmarks`, `ringLandmark(l,strength,dir,t)` — the reeds, if you want them.
- `saveGame()` — call after any milestone so Continue restores it.
- `flat`, `setFlat(v)`, `shape()` — local flattening. `setFlat(1)` squashes the
  player back to a disc, swings the camera overhead and collapses the reeds to
  lines **without changing which way the pad points** (up stays `+x`). Values
  above 1 (up to 1.4) are an overshoot squash of the disc. `shape()` is
  `dim*(1-flat)`; use it if you draw anything that should flatten with the
  player. Set it every frame while the player is in your region and put it back
  to 0 in `onLeave`.
- `mapPoint(p, src)` — optional region hook. When the player (or a light) is
  inside your bounds, the core passes the world-space point through it before
  drawing. Return a new `Vector3`. This is how a region folds its own ground:
  draw your own sheet patch (clone `planeMat`, add your uniforms, keep the
  fragment look) at `y=+.02` over the universe sheet, and make `mapPoint`
  agree with your vertex shader exactly.
- The **2D page** (`x<0`, before the crossing) is also a place: a region with
  `page:true` is built at start and updated while `!crossed`. Its `bounds`
  should be `PAGE`.

## Rules (from the owner; non-negotiable)

1. **No narration.** No "You were never moving through space." Prompts are
   instructions: "Hold to flatten." "Walk into the light." "Pull the edge."
2. **Phone first.** Portrait iPhone is the target. Everything must read at
   390×844 with a thumb on the pad. Test at that viewport.
3. **Micro-interactions in the world's language.** Ripples, springs with
   overshoot, text that condenses out of blur, sounds panned to where things
   are. Nothing that looks like a default Three.js demo.
4. **The math is never named.** No "fold", "quantum", "projection",
   "dimension", "topology" on screen.
5. **Fun before comprehension.** The first ten seconds in your region must be
   a toy: something the player does again for no reason. Rule, tool and
   revelation come after.
6. **A muted phone must still play.** Sound is redundant with colour, motion
   or shape, never the only channel.
7. **Legibility over spectacle.** If the player cannot tell what they did,
   it did not happen. The owner's history with this project is weeks lost to
   "movement appears nonfunctional"; never make the pad feel broken.

## Testing

- `bash tests/run.sh` runs every `tests/*.mjs` against `http://localhost:8901`
  (Playwright, headless Chromium at `/opt/node22/lib/node_modules/playwright`).
  It must stay green.
- Write `tests/<region>.mjs`. Use `window.__DA`:
  `pos, dim, crossed, region, regions (with your debug()), setPos(x,z), jump3d(),
  s2start(), s2round(n), save(), applySave(d), clearSave(), project(x,y,z),
  lm, rings, tps, tapLm(i)`. Add what you need to `debug()`.
- Drive with the keyboard: in 3D `ArrowUp` is `+x`, `ArrowRight` is `+z`
  (see `driveTo` in `tests/smoke.mjs`). Hold buttons are DOM elements; use
  `page.mouse.down()` over them.
- Take screenshots at 390×844 of your region's key moments and put them in
  your report.

## Deliverables for a region

1. `src/regions/<id>.js` — the region. One file. No edits to `src/game.js`
   unless a hook is truly missing (then keep the edit minimal and explain it).
2. One line in `src/regions/index.js`: `import './<id>.js';`
3. `tests/<id>.mjs` — a headless test that reaches the region, does the toy,
   completes the rule, and checks `done()` and save/load.
4. A short report: what the player does in the first ten seconds, what the
   rule is, what the impossible moment is, what you could not do and why,
   and the screenshots.
