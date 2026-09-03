import * as THREE from 'three';
import {
  registerRegion, world, playerPos, curRegion,
  emitRipple, blip, slide, chime, pulseFlash, setPrompt, refreshHud,
  makeLight, saveGame, clock, addAwake, flat, setFlat, makeLandmark, player,
  ease, ringLandmark
} from '../game.js';

// =====================================================================
// THIN — walk into a column of light, squash flat, fit through what a
// full-size body can't. The camera always looks down +x, so the corridor
// runs along +x (every wall stands face-on, a barrier straight ahead) —
// not along -z, which would only ever be seen in strafe. From the entrance
// the player takes a short walk north (-z) to the first column, which also
// doubles as the turn: from there the corridor runs east at a fixed z.
//
// Second-review layout (critic: REVISE). The whole corridor used to fit
// inside one held ArrowUp — HOLD_TIME (0.8s) carried ~5 units of flatness
// at walking speed, and every obstacle was within 2 units of the next, so
// the carry never lapsed. The fix is spacing, not the trigger radius:
// HOLD_TIME is now short (~0.25s, ~1.5 units of carry) and the two "slot"
// columns (A, B) sit far enough apart (>=6 units edge to edge) that a
// straight run genuinely loses its flatness between them — twice, so the
// player feels the pop-and-squash rhythm at least twice on the way through,
// not once at the door and once at the exit. Each slot's wall sits close
// behind its own column (0.4-0.8 past the edge) so the two are one gesture:
// squash, then immediately the wall opens under you.
//
// The gap is the odd one out on purpose. Column C (the one that flattens
// you for the gap) sits *off* the corridor's z-line entirely — its circle
// doesn't reach z=CZ at all — so a straight run through A/B never enters
// it, and the gap sits far enough past column B that the carry from B has
// long since drained. The first time anyone reaches the gap, they are at
// full size: they fall in, get put back on the near lip, and only then
// discover column C standing just off to the side, close enough to the lip
// that squashing there and stepping across actually crosses it flat.
//
// Third review (critic: REVISE). Everything above still stands; what
// failed was the region's edges:
//  - Two lanes ran around the whole corridor through the open field beside
//    it (north along z ~ -9.5..-11, south between the world clamp and
//    BOUNDS.z0) since a wall only ever blocks an x-crossing *inside*
//    bounds, and the open field beside the region is nobody's territory.
//    Sealed with real side walls (buildSideWall, below) along z=BOUNDS.z1 and
//    z=BOUNDS.z0, spanning x from wall A to just past the goal, plus a
//    hard z-clamp in `constrain` for the same x-span — checked *before*
//    the `curRegion!==REGION` guard, since the flank itself sits just
//    outside `bounds` and would never reach that guard's body otherwise.
//  - Standing on the goal unearned did nothing; it now refuses (dim
//    ripple, low blip, the core dips) once per approach, counted in
//    `debug().refusals`.
//  - The stuck-timer at a wall fired "Flatten first." even when the
//    player was already flat but simply misaligned with the slot; split
//    into two branches so a flat-but-off-slot player gets a lit-rail,
//    directional ripple instead of being told to do a thing already done.
//  - Column C moved from (22,-18.6) to (23.4,-18.4): from the put-back lip
//    (GAP_NEAR-.4 = 23.6) its centre now projects on-screen and a straight
//    ArrowLeft from the lip passes inside its radius. It flares for 2s
//    after every put-back.
//  - The gap's containment is now checked every frame a player is inside
//    its x-span, not only on the crossing frame, so stopping inside it at
//    full size (rather than running through it) still falls.
//  - The entrance moved to (7,-14): from there column A sits ahead and
//    only slightly aside, not directly lateral to a camera whose forward
//    vector carries almost no z-component.
// =====================================================================

const BOUNDS = { x0: 4, x1: 31, z0: -27, z1: -11 };
const CZ = -16;                        // the corridor's z once it turns east — every "slot" obstacle sits on this line

const PALE = 0xcdf6ff;                 // the column's colour; goal light shares it
const PALE_COL = new THREE.Color(PALE);
const FALL_COL = new THREE.Color(0xff6a5a);

// squash-and-pop spring: underdamped so it overshoots on the way up (~25%,
// peaks ~1.25) and undershoots on the way down (briefly negative) before
// settling in ~0.3s. Tune OMEGA for speed, ZETA for how much it overshoots.
// Left untouched by this revision — the fix is layout, not the spring.
const OMEGA = 30, ZETA = 0.4;

// Once the player leaves every column's reach, flatness is held for this
// long before the spring is allowed to release back toward 0. At walking
// speed (~6.2 u/s) this carries roughly 1.5 units past a column's edge —
// short enough that the ~6-unit gaps between columns below genuinely drain
// it, long enough that a wall sitting right behind its own column is still
// crossable on the same breath.
const HOLD_TIME = 0.25;

// Each column: standing within `r` of (x,z) sets the flatten target to 1.
// `r` is the drawn ring (`vr`) exactly — no blanket reach past the glow.
// Reach beyond the column comes only from HOLD_TIME above, not from the
// trigger radius, so a wall/gap must sit close enough that the player can
// carry the flatness there on foot. Radii are untouched by this revision
// ("fix the layout, not the radius") — only positions moved.
const COLS = [
  { x: 9, z: CZ, r: 1.5, vr: 1.5, mesh: null },      // A: the toy; also the turn. Edge at x=10.5.
  { x: 18.3, z: CZ, r: 1.5, vr: 1.5, mesh: null },   // B: 6.3 units past A's edge (near edge 16.8) — the carry drains crossing this stretch.
  // C: the gap's column. Off the corridor line — its edge (z=-16.9) never
  // reaches CZ (-16), so a straight run through A/B never triggers it. Third
  // review moved it from (22,-18.6): from the put-back lip (GAP_NEAR-.4 =
  // 23.6, on CZ) its old position projected off the left edge of the screen
  // (behind the camera's near-zero-z forward vector) and a straight ArrowLeft
  // from the lip missed its radius entirely. At (23.4,-18.4) — 0.2 units of
  // x from the lip, well inside r — it is on screen from the put-back point
  // and a straight ArrowLeft from the lip crosses right through it.
  { x: 23.4, z: -18.4, r: 1.5, vr: 1.5, mesh: null, isGapCol: true },
];

// Two thin walls crossing the corridor face-on (a plane at fixed x,
// spanning the region's full z-range), each with a slot at the corridor's
// z-line. Each wall sits 0.4-0.8 units past the column meant to flatten
// the player for it — close enough that clearing the column and reaching
// the wall is one continuous, still-flat motion.
const WALLS = [
  // stuckT/promptOn: the "flatten first" timer, only for a full-size player
  // parked at the slot. alignStuckT/hintOn/lastHint: a *separate* timer for
  // a player who is already flat but not lined up with the slot — third
  // review split these, since the old single timer told a flat player to
  // do the thing they'd already done (see the `update` wall loop below).
  { x: 11.0, slotZ: CZ, half: 0.75, passed: false, lastHit: -99, stuckT: 0, promptOn: false, alignStuckT: 0, hintOn: false, lastHint: -99, mesh: null },  // 0.5 past A's edge (10.5)
  { x: 20.3, slotZ: CZ, half: 0.75, passed: false, lastHit: -99, stuckT: 0, promptOn: false, alignStuckT: 0, hintOn: false, lastHint: -99, mesh: null },  // 0.5 past B's edge (19.8)
];

// The gap: a trench crossing the corridor, spanning the region's full z so
// it can be met (and crossed) off the CZ line, near column C. GAP_NEAR sits
// 4.2 units past column B's edge (19.8) — well outside any on-line column's
// carry — so a straight run down the corridor meets it at full size the
// first time. Column C's far edge (22+1.5=23.5) sits only 0.5 units short
// of it, so squashing in C and stepping across (even off-line) crosses it flat.
const GAP_NEAR = 24.0, GAP_FAR = 25.4;
const GOAL = new THREE.Vector3(27.6, 0, CZ);

// Sealing the corridor's flanks (item 1): a player standing just outside
// `bounds` to the north (z > BOUNDS.z1) or south (z < BOUNDS.z0) is free
// ground as far as any *other* region is concerned, so nothing there ever
// stopped a straight walk around the whole obstacle course. SEAL_X0/X1
// bound the stretch of the corridor this applies to — from wall A's own
// entrance margin to just past the goal — and are used for BOTH the drawn
// side walls (buildSideWall, below) and the constrain-time clamp, so the
// two always agree. SEAL_MARGIN caps how far outside BOUNDS.z0/z1 the
// clamp still reaches for: wide enough to catch a player walking the
// flank at realistic speed (well under one frame's travel), narrow enough
// to stay short of Corner's own bounds (z0=-9, two units north of z1=-11)
// so this never reaches into another region's territory.
const SEAL_X0 = WALLS[0].x - .5;         // 10.5 — wall A's entrance margin
const SEAL_X1 = GOAL.x + 2;              // 29.6 — just past the goal
const SEAL_LINES = [BOUNDS.z1, BOUNDS.z0];   // the two flank lines the seal blocks a crossing of

// hoisted: `for...of ['rimNear','rimFar']` was reallocating this array
// every in-region frame of the whole game.
const RIM_KEYS = ['rimNear', 'rimFar'];
const SIDE_KEYS = ['north', 'south'];

let slotsPassed = 0, goalReached = false, wallHits = 0, gapCrossed = false;
let flatRaw = 0, flatVel = 0, wasSquashed = false, holdT = 0;
let fallActive = false, fallT = 0, fallSide = 'near';
const fallPos = new THREE.Vector3();
let flareT = -99, flareSide = null;      // rim flare on put-back
let colCFlareT = -99;                    // column C's ring flare on put-back (item 4)
let extraBlipAt = -1;                    // game-time-scheduled overshoot tick
let goalLightGroup = null;
const hintQueue = [];                        // ripples scheduled along a wall (game time, no timers)
const DIM_COL = new THREE.Color(0x334455), HINT_COL = new THREE.Color(0xffffff);
let goalGutterT = -99;                   // the core dips for a moment on a refusal (item 2)
let refusals = 0, refusalActive = false; // once per approach, standing on the goal unearned
let lastSealHit = -99, sealHits = 0;     // item 1's thud+ripple, debounced
const gapMesh = {};
const sideWalls = { north: null, south: null };
let p3Cache = null;

// the sphere group is a child of `player` but not exported by the core;
// it's the only Group among player's children (the disc/ring/shadow are
// Meshes), so find it once and cache it rather than hard-coding an index.
function getP3() {
  if (!p3Cache) p3Cache = player.children.find(c => c.isGroup);
  return p3Cache;
}

// a private veil, independent of the eye button's — dims everything but
// what's self-luminous (the column, the slot, the player) while flat, and
// visibly drains during the carry: it starts fading the instant the player
// leaves a column's radius (tied to the hold timer), reaching zero exactly
// when the carry runs out, rather than staying pinned dark until the spring
// suddenly lets go. Inserted as #ui's FIRST child so the HUD and pad —
// appended after it — draw on top and stay legible and touchable while the
// veil is up.
const veilEl = document.createElement('div');
veilEl.id = 'thin-veil';
veilEl.style.cssText = 'position:absolute;inset:0;background:#02030a;opacity:0;pointer-events:none';
{ const ui = document.getElementById('ui'); ui.insertBefore(veilEl, ui.firstChild); }
let lastVeilRaw = -1;   // write only when the opacity actually moves — was toFixed()'d every in-region frame

function buildColumn(c) {
  const g = new THREE.Group();
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(c.vr, c.vr, 3.2, 28, 1, true),
    new THREE.MeshBasicMaterial({ color: PALE, transparent: true, opacity: .14, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.y = 1.6;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(c.vr, 40),
    new THREE.MeshBasicMaterial({ color: PALE, transparent: true, opacity: .24, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = .03;
  const ring = new THREE.Mesh(new THREE.RingGeometry(c.vr - .08, c.vr, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .5, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .04;
  const core = new THREE.PointLight(PALE, 9, 7); core.position.y = 1.1;
  g.add(glow, floor, ring, core);
  g.position.set(c.x, 0, c.z); world.add(g);
  c.mesh = { g, glow, floor, ring, core };
}

// A wall crosses the corridor face-on: a plane at fixed x, spanning z, with
// a slot cut into it at `slotZ`. Two thin rails flank the slot (rather than
// a marker plate across it) so the opening reads as open, not covered.
// Second review: at full size the panel was near-invisible (0x1a7fa0 @ .45
// over a near-black floor); it now reads as a real wall — brighter, less
// transparent, a bottom edge bar to match the top one, and vertical ribs
// every unit so the panel occludes the grid instead of washing over it.
function buildWall(w) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x49c8e8, transparent: true, opacity: .82, side: THREE.DoubleSide });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xd7fdff });
  const ribMat = new THREE.MeshBasicMaterial({ color: 0xeafeff, transparent: true, opacity: .85 });
  const segs = [[BOUNDS.z0, w.slotZ - w.half], [w.slotZ + w.half, BOUNDS.z1]];
  const ribZs = [];
  for (const [sz0, sz1] of segs) {
    const width = sz1 - sz0; if (width <= .02) continue;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(.22, 2.4, width), mat.clone());
    wall.position.set(w.x, 1.2, (sz0 + sz1) / 2); g.add(wall);
    const edgeTop = new THREE.Mesh(new THREE.BoxGeometry(.3, .06, width), edgeMat);
    edgeTop.position.set(w.x, 2.42, (sz0 + sz1) / 2); g.add(edgeTop);
    const edgeBot = new THREE.Mesh(new THREE.BoxGeometry(.3, .06, width), edgeMat);
    edgeBot.position.set(w.x, .03, (sz0 + sz1) / 2); g.add(edgeBot);
    // vertical ribs every ~1 unit so the panel reads as structure and
    // occludes the ground grid, instead of a flat colour wash over it —
    // collected and drawn as one InstancedMesh per wall (below) rather
    // than ~15 separate meshes each, which was measurably heavier on the
    // headless (SwiftShader) renderer this game's own tests run under.
    const first = Math.ceil(sz0);
    for (let z = first; z < sz1 - .1; z++) ribZs.push(z);
  }
  if (ribZs.length) {
    const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(.27, 2.44, .07), ribMat, ribZs.length);
    const m = new THREE.Matrix4();
    ribZs.forEach((z, i) => { m.makeTranslation(w.x, 1.2, z); ribs.setMatrixAt(i, m); });
    g.add(ribs);
  }
  const posts = [];
  const rails = [];
  const railMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const sz of [w.slotZ - w.half, w.slotZ + w.half]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 2.4, 8), new THREE.MeshBasicMaterial({ color: 0xdfffff, transparent: true, opacity: .6 })); posts.push(p);
    p.position.set(w.x, 1.2, sz); g.add(p);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.5, .04, .06), railMat.clone());
    rail.position.set(w.x, .04, sz); g.add(rail); rails.push(rail);
  }
  world.add(g); w.mesh = { g, rails, posts };
}

// A side wall closes one flank of the corridor: a low luminous rail at
// the floor plus a translucent panel above it, both spanning x from
// SEAL_X0 to SEAL_X1 at a fixed z (BOUNDS.z1 for the north flank,
// BOUNDS.z0 for the south one) — the exact span `constrain` also clamps
// against, so what's drawn and what's enforced never disagree.
function buildSideWall(zLine) {
  const g = new THREE.Group();
  const width = SEAL_X1 - SEAL_X0, midX = (SEAL_X0 + SEAL_X1) / 2;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(width, 1.2, .1),
    new THREE.MeshBasicMaterial({ color: 0x2b6f8a, transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false }));
  panel.position.set(midX, .95, zLine); g.add(panel);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(width, .1, .1),
    new THREE.MeshBasicMaterial({ color: 0xeafeff, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
  rail.position.set(midX, .08, zLine); g.add(rail);
  world.add(g);
  return { g, panel, rail };
}

function buildGap() {
  const midX = (GAP_NEAR + GAP_FAR) / 2, depth = Math.abs(GAP_FAR - GAP_NEAR);
  const zMid = (BOUNDS.z0 + BOUNDS.z1) / 2, zSpan = BOUNDS.z1 - BOUNDS.z0;
  const hole = new THREE.Mesh(new THREE.BoxGeometry(depth, .06, zSpan),
    new THREE.MeshBasicMaterial({ color: 0x01030a }));
  hole.position.set(midX, -.03, zMid); world.add(hole);
  const rim = (x) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.12, .05, zSpan),
      new THREE.MeshBasicMaterial({ color: PALE, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(x, .02, zMid); world.add(m); return m;
  };
  gapMesh.rimNear = rim(GAP_NEAR); gapMesh.rimFar = rim(GAP_FAR); gapMesh.hole = hole;
}

// Two reeds, close in x but far in z, that ring together when either is
// touched. `brushLandmarks()` in the core treats a truthy `.pair` as BOTH
// "ring together" AND "teleport the player to the other one on a fast
// approach" — the second half is a shortcut we do not want here (it would
// let a player skip the whole corridor). So the twins are linked with a
// private `_twin` field the core never looks at, and we ring the partner
// ourselves, watching each reed's `bandT` (set exactly once per ring) for
// a rising edge.
function buildTwins() {
  const a = makeLandmark(6.4, -15.4, 1.2), b = makeLandmark(6.0, -24.0, 1.2);
  a._twin = b; b._twin = a; a._seenT = -1; b._seenT = -1;
  TWINS.push(a, b);
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  twinThread = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .4 }));
  world.add(twinThread);
}
const TWINS = [];
let twinThread = null;
function updateTwins(t) {
  for (const l of TWINS) {
    if (l.bandT > l._seenT) {
      const o = l._twin;
      l._seenT = l.bandT; o._seenT = l.bandT;   // consume for both so this doesn't bounce back and forth
      const dir = new THREE.Vector3(o.x - l.x, 0, o.z - l.z);
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0); else dir.normalize();
      ringLandmark(o, .8, dir, t, true);        // fromPair=true: ring it, skip glue/grow logic
    }
  }
  if (twinThread && TWINS.length) {
    const [a, b] = TWINS;
    const arr = twinThread.geometry.attributes.position.array;
    arr[0] = a.pivot.position.x; arr[1] = a.pivot.position.y + .4; arr[2] = a.pivot.position.z;
    arr[3] = b.pivot.position.x; arr[4] = b.pivot.position.y + .4; arr[5] = b.pivot.position.z;
    twinThread.geometry.attributes.position.needsUpdate = true;
    twinThread.material.opacity = .28 + .12 * Math.sin(t * 3 + a.x);
  }
}

function animateCosmetics(t, inRegion) {
  const colCFlare = t - colCFlareT < 2 ? 1 - (t - colCFlareT) / 2 : 0;
  for (const c of COLS) {
    if (!c.mesh) continue;
    const near = inRegion && Math.hypot(playerPos.x - c.x, playerPos.z - c.z) < c.r * 1.3;
    const boost = near ? Math.max(0, Math.min(1, flatRaw)) : 0;
    c.mesh.ring.rotation.z = t * .6;
    c.mesh.glow.material.opacity = .1 + .08 * (.5 + .5 * Math.sin(t * 1.4 + c.z)) + boost * .35;
    c.mesh.floor.material.opacity = .2 + boost * .5;
    c.mesh.core.intensity = 7 + boost * 16;
    c.mesh.core.visible = inRegion;   // three live PointLights cost nothing to hide when nobody's looking
    // item 4: column C's ring flares bright for 2s after every put-back,
    // pointing the player at it without a prompt.
    if (c.isGapCol && colCFlare > 0) {
      c.mesh.ring.material.opacity = Math.min(1, .5 + colCFlare * .8);
      c.mesh.core.intensity = Math.max(c.mesh.core.intensity, 9 + colCFlare * 14);
    }
  }
  while (hintQueue.length && hintQueue[0].at <= t) { const h = hintQueue.shift(); emitRipple(h.x, h.z, h.strong ? 1.1 : .6, HINT_COL); }
  for (const w of WALLS) {
    if (!w.mesh) continue;
    // while a flat player is stuck off the slot, the slot itself is the brightest thing on the wall:
    // the rails run bright and fast and grow tall, the posts light up
    let op = w.passed ? .3 : .55 + .25 * Math.sin(t * 3.2);
    const hintK = w.hintOn ? .7 + .3 * Math.sin(t * 8) : 0;
    if (w.hintOn) op = .85 + .15 * Math.sin(t * 8);
    for (const r of w.mesh.rails) { r.material.opacity = op; r.scale.y = 1 + hintK * 6; r.position.y = .04 + hintK * .18; }
    if (w.mesh.posts) for (const pst of w.mesh.posts) pst.material.opacity = .6 + hintK * .4;
  }
  // the sealed flanks: a faint shimmer on the rail keeps them from looking like static geometry
  for (const key of SIDE_KEYS) {
    const sw = sideWalls[key]; if (!sw) continue;
    sw.rail.material.opacity = .6 + .2 * Math.sin(t * 1.6 + (key === 'north' ? 0 : Math.PI));
  }
  if (gapMesh.rimNear) {
    const k = Math.max(0, Math.min(1, flatRaw));
    const flare = t - flareT < .4 ? 1 - (t - flareT) / .4 : 0;
    // the gap loses its *width* while flat: shrink the hole's x-extent
    // (along the corridor) and the rims' thickness toward a hairline —
    // scaling .y did nothing from the overhead camera the player actually
    // sees this in.
    gapMesh.hole.scale.x = THREE.MathUtils.lerp(1, .05, k);
    for (const which of RIM_KEYS) {
      const r = gapMesh[which];
      let sx = THREE.MathUtils.lerp(1, .16, k), op = THREE.MathUtils.lerp(.8, .22, k);
      if (flare > 0 && which === (flareSide === 'far' ? 'rimFar' : 'rimNear')) { sx = Math.max(sx, 1 + flare * 1.6); op = Math.max(op, .8 + flare * .5); }
      r.scale.x = sx; r.material.opacity = Math.min(1, op);
    }
  }
}

function animateGoalLight(t, inRegion, earned) {
  if (!goalLightGroup) return;
  const u = goalLightGroup.userData;
  goalLightGroup.position.y = .5 + .12 * Math.sin(t * 2.1);
  goalLightGroup.rotation.y = t * .5;
  // item 2: an unearned refusal dips the core for a moment — the world's
  // way of saying "not yet" without a word.
  const gutter = t - goalGutterT < 1.0 ? 1 - (t - goalGutterT) / 1.0 : 0;
  if (u.ring) { u.ring.rotation.z = t * .25; u.ring.material.opacity = earned ? .65 : Math.max(.04, .2 - gutter * .16); }
  if (u.core) u.core.material.emissiveIntensity = earned ? 4 : Math.max(.25, 1.1 - gutter * .85);
  if (u.beam) { u.beam.visible = earned; if (earned) u.beam.material.opacity = .13 + .10 * (.5 + .5 * Math.sin(t * 3.2)); }
  if (u.glow) u.glow.visible = inRegion;   // another live PointLight — was lit everywhere, even outside the region
  goalLightGroup.visible = !goalReached;
}

// Falling in: sink the sphere through the floor and shrink it, smallest
// right at the reset. Only ever touches p3 (the sphere group), never
// player.scale, so nothing outside this region's own visual is affected.
function tweenFall(p3) {
  const k = Math.min(1, fallT / .6), e = ease(k);
  p3.position.y -= e * 1.1;
  p3.scale.multiplyScalar(Math.max(.05, 1 - e * .72));
}

// Explicit-Euler springs go unstable once dt gets anywhere near 1/omega — and
// this game's own headless test runs at ~10fps, dt~0.1s, right in that zone.
// Sub-stepping at a fixed, small dt keeps the integrator stable regardless of
// how coarse the caller's dt is (and how slow the device is).
const SPRING_SUBDT = 1 / 120;
function stepSpring(target, dt) {
  let remaining = Math.min(dt, .25); // guard against a huge stall (tab backgrounded, etc.)
  while (remaining > 1e-6) {
    const h = Math.min(SPRING_SUBDT, remaining);
    flatVel += (target - flatRaw) * OMEGA * OMEGA * h - 2 * ZETA * OMEGA * flatVel * h;
    flatRaw += flatVel * h;
    remaining -= h;
  }
}

const REGION = registerRegion({
  id: 'thin',
  name: 'THIN',
  bounds: BOUNDS,
  // item 6: the old entrance (9,-12.5) shares column A's own x — from
  // there column A sits directly to the *side*, not ahead, of a camera
  // whose forward vector carries almost no z-component (it looks down
  // +x, tilted only in y). Moved so column A is a couple of units ahead
  // in x as well as a little to the side: on screen from the first frame.
  entrance: new THREE.Vector3(7, 0, -14),
  color: PALE,

  build() {
    for (const c of COLS) buildColumn(c);
    for (const w of WALLS) buildWall(w);
    buildGap();
    sideWalls.north = buildSideWall(BOUNDS.z1);
    sideWalls.south = buildSideWall(BOUNDS.z0);
    goalLightGroup = makeLight(GOAL, PALE);
    buildTwins();
  },

  onEnter() { setPrompt(''); },   // start silent: clear whatever prompt carried over from elsewhere

  update(dt, t) {
    const inRegion = curRegion === REGION;
    const p3 = getP3();
    const earned = slotsPassed === WALLS.length && gapCrossed;

    animateCosmetics(t, inRegion);
    updateTwins(t);
    animateGoalLight(t, inRegion, earned);

    if (inRegion) {
      if (fallActive) tweenFall(p3);
      else if (flatRaw < 0) p3.scale.multiplyScalar(1 - flatRaw * 1.2);   // the spring's undershoot: a visible overshoot stretch, not a clamp
    }

    if (!inRegion) return; // only drive the shared `flat` value & gameplay while actually here

    let insideAny = false;
    for (const c of COLS) if (Math.hypot(playerPos.x - c.x, playerPos.z - c.z) < c.r) insideAny = true;
    // item 3: a player who arrived at a wall already flat (via a column)
    // and is now parked there off the slot must not decay out of flatness
    // just from being blocked — that would turn the new alignment hint
    // back into an unflattening-then-"Flatten first." loop. Sustaining
    // only applies once *already* reasonably flat (flatRaw>.5), so
    // approaching a wall at full size never flattens by proximity alone —
    // only a column does that.
    if (flatRaw > .5) for (const w of WALLS) { if (!w.passed && Math.abs(playerPos.x - w.x) < 1.1) { insideAny = true; break; } }
    holdT = insideAny ? HOLD_TIME : Math.max(0, holdT - dt);
    const target = (insideAny || holdT > 0) ? 1 : 0;
    stepSpring(target, dt);
    setFlat(flatRaw);

    const squashed = flatRaw > .5;
    if (squashed && !wasSquashed) {
      slide(220, 90, .18, .1); emitRipple(playerPos.x, playerPos.z, 1.1, PALE_COL);
      extraBlipAt = t + .09; // the overshoot's little extra tick, on game time (not wall-clock)
    } else if (!squashed && wasSquashed) {
      slide(130, 300, .16, .09); emitRipple(playerPos.x, playerPos.z, .9, PALE_COL);
    }
    wasSquashed = squashed;
    if (extraBlipAt > 0 && t >= extraBlipAt) { blip(760, .06, .045, 'sine'); extraBlipAt = -1; }

    // the veil: dark while squashed, but also a visible drain on the carry
    // itself — it starts lightening the instant the player leaves a
    // column's radius, in step with the hold timer, reaching zero exactly
    // when the carry runs dry (rather than staying pinned dark until the
    // spring lets go on its own).
    const carryFrac = insideAny ? 1 : (HOLD_TIME > 0 ? holdT / HOLD_TIME : 0);
    const vOpRaw = .35 * Math.max(0, Math.min(1, flatRaw)) * Math.max(0, Math.min(1, carryFrac));
    if (Math.abs(vOpRaw - lastVeilRaw) > .01) { lastVeilRaw = vOpRaw; veilEl.style.opacity = vOpRaw.toFixed(3); }

    // item 3: a player stuck at a wall is either not flat (needs telling)
    // or flat but off the slot (needs *showing*). The old single timer
    // fired "Flatten first." for both, which is wrong for the second case
    // — a flat player doesn't need to be told to do a thing they've
    // already done. The two are mutually exclusive branches on `flat`.
    for (const w of WALLS) {
      if (w.passed) { w.stuckT = 0; w.alignStuckT = 0; w.hintOn = false; continue; }
      const near = Math.abs(playerPos.x - w.x) < 1.1 && Math.abs(playerPos.z - w.slotZ) < 3.5;
      const aligned = Math.abs(playerPos.z - w.slotZ) < w.half;
      if (near && flat <= .8) {
        w.stuckT += dt; w.alignStuckT = 0; w.hintOn = false;
        if (w.stuckT > 8 && !w.promptOn) { w.promptOn = true; setPrompt('Flatten first.'); }
      } else if (near && flat > .8 && !aligned) {
        w.stuckT = 0;
        if (w.promptOn) { w.promptOn = false; setPrompt(''); }
        w.alignStuckT += dt;
        w.hintOn = w.alignStuckT > 1.5;
        // a ripple that walks along the wall toward the slot, repeated
        // while the player stays stuck — a direction, not a word.
        if (w.hintOn && t - w.lastHint > .9) {
          w.lastHint = t;
          // three rings stepping along the wall from the player to the slot, then one at the slot itself
          const dz = w.slotZ - playerPos.z;
          for (let k = 1; k <= 3; k++) { const zz = playerPos.z + dz * (k / 3); hintQueue.push({ x: w.x, z: zz, at: t + k * .12 }); }
          hintQueue.push({ x: w.x, z: w.slotZ, at: t + .5, strong: true });
          blip(520, .09, .05, 'sine', (playerPos.z - w.slotZ) / 6);
        }
      } else {
        if (w.promptOn) { w.promptOn = false; setPrompt(''); }
        w.stuckT = 0; w.alignStuckT = 0; w.hintOn = false;
      }
    }

    // the goal only completes once both slots and a genuine flat crossing
    // of the gap have happened — never on proximity alone. Approaching from
    // behind the far lip (walking around the region's edge instead of down
    // the corridor) never sets `gapCrossed`, so it can never finish the
    // region either; the corridor is the only real way in.
    if (!goalReached) {
      const d = Math.hypot(playerPos.x - GOAL.x, playerPos.z - GOAL.z);
      if (d < 1.0 && earned) {
        goalReached = true; chime(); addAwake(.12);
        emitRipple(GOAL.x, GOAL.z, 1.5, PALE_COL); saveGame(); refreshHud();
      } else if (d < 2.0 && !earned) {
        // item 2: standing on the unearned goal used to do nothing at
        // all. Now it refuses, once per approach (hysteresis on distance
        // so it doesn't re-fire every frame while standing still).
        if (!refusalActive) {
          refusalActive = true; refusals++;
          goalGutterT = t; blip(100, .22, .06, 'sine');
          emitRipple(GOAL.x, GOAL.z, .55, DIM_COL);
        }
      } else if (d > 2.6) {
        refusalActive = false;
      }
    }
  },

  constrain(prevX, prevZ, pos, vel, dt) {
    const t = clock.elapsedTime;

    // item 1: seal the corridor's flanks. This runs BEFORE the
    // `curRegion!==REGION` guard on purpose — the whole point of a flank
    // is that it sits just outside `bounds` (z past z1 to the north, or
    // past z0 to the south), so `curRegion` is never REGION out there and
    // the guard below would never see it. Only x matters for *where* this
    // applies (SEAL_X0..SEAL_X1, identical to the drawn side walls); the
    // clamp itself only fires within SEAL_MARGIN of the real edge, so it
    // can never reach into another region's bounds (Corner starts at
    // z0=-9, two units north of BOUNDS.z1=-11).
    // A wall, not a magnet: it only acts when the player's step actually
    // crosses the line, and it puts them back on the side they came from.
    // Standing beside it, or walking past it in the Corner, changes nothing.
    // ...and the half-unit strip just outside either line cannot be walked east into the sealed span
    if (prevX < SEAL_X0 && pos.x >= SEAL_X0 && (pos.z > BOUNDS.z1 && pos.z < BOUNDS.z1 + .6 || pos.z < BOUNDS.z0 && pos.z > BOUNDS.z0 - .6)) {
      pos.x = SEAL_X0 - .05; vel.x *= -.2;
      if (t - lastSealHit > .22) { lastSealHit = t; sealHits++; blip(150, .12, .08, 'triangle'); emitRipple(pos.x, pos.z, .8, PALE_COL); }
    }
    if (pos.x >= SEAL_X0 && pos.x <= SEAL_X1 && (prevX >= SEAL_X0 - .6 && prevX <= SEAL_X1 + .6)) {
      for (const zLine of SEAL_LINES) {
        const a = prevZ - zLine, b = pos.z - zLine;
        if (a * b < 0 || (b === 0 && a !== 0)) {
          pos.z = a > 0 ? zLine + .35 : zLine - .35; vel.z *= -.2;
          if (t - lastSealHit > .22) { lastSealHit = t; sealHits++; blip(150, .12, .08, 'triangle'); emitRipple(pos.x, pos.z, .8, PALE_COL); }
        }
      }
    }

    // Rules below stop dead at the region's own drawn extent — not a
    // padded approximation of it. Without this a player standing in the
    // open field between regions (e.g. z=-10, just past this region's
    // z1=-11) used to catch an invisible wall or fall through an
    // invisible hole that only ever existed *inside* Thin's bounds.
    if (curRegion !== REGION) return;
    if (pos.z < BOUNDS.z0 || pos.z > BOUNDS.z1) return;

    if (fallActive) {
      pos.copy(fallPos); vel.set(0, 0, 0);
      fallT += dt;
      if (fallT >= .6) {
        fallActive = false;
        pos.set(fallSide === 'near' ? GAP_NEAR - 1.0 : GAP_FAR + 1.0, 0, fallPos.z);
        vel.set(0, 0, 0);
        flareT = t; flareSide = fallSide; colCFlareT = t;
      }
      return;
    }

    // item 5: containment is checked every frame the player is inside the
    // gap's x-span, not only on the frame they crossed into it — a player
    // who *stops* inside it (rather than running through) must still fall
    // if they're full-size, not stand there in the hole.
    const insideGap = pos.x >= GAP_NEAR && pos.x <= GAP_FAR;
    if (insideGap) {
      if (flat > .8) {
        const wasOutsideGap = !(prevX >= GAP_NEAR && prevX <= GAP_FAR);
        if (wasOutsideGap) {
          pulseFlash(); emitRipple(pos.x, pos.z, 1.4, PALE_COL); slide(480, 760, .3, .07);
          gapCrossed = true;
        }
      } else {
        fallActive = true; fallT = 0; fallPos.copy(pos);
        // whichever lip this entered from, if it's a genuine crossing this
        // frame; otherwise (stopped inside, losing flatness in place) the
        // nearer lip to where they're actually standing.
        fallSide = prevX <= GAP_NEAR ? 'near' : prevX >= GAP_FAR ? 'far' : (pos.x <= (GAP_NEAR + GAP_FAR) / 2 ? 'near' : 'far');
        slide(300, 55, .5, .1); emitRipple(pos.x, pos.z, 1.3, FALL_COL);
        return;
      }
    }

    for (const w of WALLS) {
      const crossing = (prevX - w.x) * (pos.x - w.x) <= 0 && prevX !== pos.x && !(prevX === w.x && pos.x === w.x);
      if (!crossing) continue;
      const allowed = flat > .8 && Math.abs(pos.z - w.slotZ) < w.half;
      if (allowed) {
        if (!w.passed) {
          w.passed = true; slotsPassed++; refreshHud(); saveGame();
          blip(640, .14, .09, 'sine'); emitRipple(w.x, pos.z, 1.2, PALE_COL);
        }
      } else {
        pos.x = prevX; if (Math.abs(vel.x) > .05) vel.x *= -.2;
        if (t - w.lastHit > .22) { w.lastHit = t; wallHits++; blip(150, .12, .08, 'triangle'); emitRipple(pos.x, pos.z, .8, PALE_COL); }
      }
    }
  },

  onLeave() {
    setFlat(0); flatRaw = 0; flatVel = 0; wasSquashed = false; holdT = 0; extraBlipAt = -1;
    veilEl.style.opacity = '0'; lastVeilRaw = -1;
    const wePrompted = WALLS.some(w => w.promptOn);
    for (const w of WALLS) { w.stuckT = 0; w.promptOn = false; w.alignStuckT = 0; w.hintOn = false; }
    if (wePrompted) setPrompt('');
    refusalActive = false;
  },

  hud() { return { label: 'SLOTS', n: slotsPassed, total: WALLS.length }; },
  done() { return goalReached; },

  save() { return { slotsPassed, goalReached, gapCrossed, wallsPassed: WALLS.map(w => w.passed) }; },
  load(d) {
    slotsPassed = d.slotsPassed | 0;
    goalReached = !!d.goalReached;
    gapCrossed = !!d.gapCrossed;
    if (Array.isArray(d.wallsPassed)) WALLS.forEach((w, i) => { w.passed = !!d.wallsPassed[i]; });
    if (goalLightGroup) goalLightGroup.visible = !goalReached;
  },

  debug() {
    return {
      slotsPassed, total: WALLS.length, goalReached, gapCrossed, fallActive, wallHits,
      flat: +THREE.MathUtils.clamp(flatRaw, 0, 1.4).toFixed(2),
      holdT: +holdT.toFixed(2),
      cols: COLS.map(c => ({ x: c.x, z: c.z, r: c.r })),
      walls: WALLS.map(w => ({ x: w.x, slotZ: w.slotZ, half: w.half, passed: w.passed, hintOn: w.hintOn })),
      gap: { near: GAP_NEAR, far: GAP_FAR },
      goal: { x: GOAL.x, z: GOAL.z },
      refusals, sealHits,
      seal: { x0: SEAL_X0, x1: SEAL_X1, loZ: BOUNDS.z0 + .5, hiZ: BOUNDS.z1 - .5 },
      colCFlareOn: clock.elapsedTime - colCFlareT < 2,
    };
  },
});
