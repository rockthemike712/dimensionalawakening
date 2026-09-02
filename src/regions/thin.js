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
// =====================================================================

const BOUNDS = { x0: 4, x1: 26, z0: -27, z1: -11 };
const CZ = -16;                        // the corridor's z once it turns east — every obstacle sits on this line
const PALE = 0xcdf6ff;                 // the column's colour; goal light shares it
const PALE_COL = new THREE.Color(PALE);
const FALL_COL = new THREE.Color(0xff6a5a);

// squash-and-pop spring: underdamped so it overshoots on the way up (~25%,
// peaks ~1.25) and undershoots on the way down (briefly negative) before
// settling in ~0.3s. Tune OMEGA for speed, ZETA for how much it overshoots.
const OMEGA = 30, ZETA = 0.4;
// once the player leaves every column's reach, flatness is held for this
// long before the spring is allowed to release back toward 0 — so a wall
// placed just past a column's glow is still crossable flat, but a wall
// placed well beyond any column is not: the player must carry the flatness
// out of the light, not just have stood near a column once.
const HOLD_TIME = 0.8;

// Each column: standing within `r` of (x,z) sets the flatten target to 1.
// `r` is the drawn ring (`vr`) exactly — no blanket reach past the glow.
// Reach beyond the column comes only from HOLD_TIME above, not from the
// trigger radius, so a wall/gap must sit close enough that the player can
// carry the flatness there on foot.
const COLS = [
  { x: 9, z: CZ, r: 1.5, vr: 1.5, mesh: null },   // the toy: a few steps north of the entrance; also the turn
  { x: 14, z: CZ, r: 1.5, vr: 1.5, mesh: null },  // reaches wall B
  { x: 19, z: CZ, r: 1.5, vr: 1.5, mesh: null },  // reaches the gap
];

// Two thin walls crossing the corridor face-on (a plane at fixed x,
// spanning the region's full z-range), each with a slot at the corridor's
// z-line. Each wall sits 0.4-0.8 units past the column meant to flatten
// the player for it.
const WALLS = [
  { x: 11.0, slotZ: CZ, half: 0.75, passed: false, lastHit: -99, stuckT: 0, promptOn: false, mesh: null },
  { x: 16.1, slotZ: CZ, half: 0.75, passed: false, lastHit: -99, stuckT: 0, promptOn: false, mesh: null },
];

// The gap: a 1.2-unit trench crossing the corridor, a strip across x now
// that the corridor runs east. NEAR is the lip closer to the entrance
// (smaller x); FAR is the far lip.
const GAP_NEAR = 21.0, GAP_FAR = 22.2;
const GOAL = new THREE.Vector3(24.5, 0, CZ);

let slotsPassed = 0, goalReached = false, wallHits = 0;
let flatRaw = 0, flatVel = 0, wasSquashed = false, holdT = 0;
let fallActive = false, fallT = 0, fallSide = 'near';
const fallPos = new THREE.Vector3();
let flareT = -99, flareSide = null;      // rim flare on put-back
let extraBlipAt = -1;                    // game-time-scheduled overshoot tick
let goalLightGroup = null;
const gapMesh = {};
let p3Cache = null;

// the sphere group is a child of `player` but not exported by the core;
// it's the only Group among player's children (the disc/ring/shadow are
// Meshes), so find it once and cache it rather than hard-coding an index.
function getP3() {
  if (!p3Cache) p3Cache = player.children.find(c => c.isGroup);
  return p3Cache;
}

// a private veil, independent of the eye button's — dims everything but
// what's self-luminous (the column, the slot, the player) while flat.
// Inserted as #ui's FIRST child so the HUD and pad — appended after it —
// draw on top and stay legible and touchable while the veil is up.
const veilEl = document.createElement('div');
veilEl.id = 'thin-veil';
veilEl.style.cssText = 'position:absolute;inset:0;background:#02030a;opacity:0;pointer-events:none';
{ const ui = document.getElementById('ui'); ui.insertBefore(veilEl, ui.firstChild); }
let lastVeilOp = '0';

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
function buildWall(w) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a7fa0, transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xaefcff });
  const segs = [[BOUNDS.z0, w.slotZ - w.half], [w.slotZ + w.half, BOUNDS.z1]];
  for (const [sz0, sz1] of segs) {
    const width = sz1 - sz0; if (width <= .02) continue;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(.22, 2.4, width), mat.clone());
    wall.position.set(w.x, 1.2, (sz0 + sz1) / 2); g.add(wall);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(.26, .05, width), edgeMat);
    edge.position.set(w.x, 2.42, (sz0 + sz1) / 2); g.add(edge);
  }
  const postMat = new THREE.MeshBasicMaterial({ color: 0xdfffff });
  const rails = [];
  const railMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const sz of [w.slotZ - w.half, w.slotZ + w.half]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 2.4, 8), postMat);
    p.position.set(w.x, 1.2, sz); g.add(p);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.5, .04, .06), railMat.clone());
    rail.position.set(w.x, .04, sz); g.add(rail); rails.push(rail);
  }
  world.add(g); w.mesh = { g, rails };
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
  for (const c of COLS) {
    if (!c.mesh) continue;
    const near = inRegion && Math.hypot(playerPos.x - c.x, playerPos.z - c.z) < c.r * 1.3;
    const boost = near ? Math.max(0, Math.min(1, flatRaw)) : 0;
    c.mesh.ring.rotation.z = t * .6;
    c.mesh.glow.material.opacity = .1 + .08 * (.5 + .5 * Math.sin(t * 1.4 + c.z)) + boost * .35;
    c.mesh.floor.material.opacity = .2 + boost * .5;
    c.mesh.core.intensity = 7 + boost * 16;
    c.mesh.core.visible = inRegion;   // three live PointLights cost nothing to hide when nobody's looking
  }
  for (const w of WALLS) {
    if (!w.mesh) continue;
    const op = w.passed ? .3 : .55 + .25 * Math.sin(t * 3.2);
    for (const r of w.mesh.rails) r.material.opacity = op;
  }
  if (gapMesh.rimNear) {
    const k = Math.max(0, Math.min(1, flatRaw));
    const flare = t - flareT < .4 ? 1 - (t - flareT) / .4 : 0;
    for (const which of ['rimNear', 'rimFar']) {
      const r = gapMesh[which];
      let sy = THREE.MathUtils.lerp(1, .16, k), op = THREE.MathUtils.lerp(.8, .22, k);
      if (flare > 0 && which === (flareSide === 'far' ? 'rimFar' : 'rimNear')) { sy = Math.max(sy, 1 + flare * 1.6); op = Math.max(op, .8 + flare * .5); }
      r.scale.y = sy; r.material.opacity = Math.min(1, op);
    }
  }
}

function animateGoalLight(t) {
  if (!goalLightGroup) return;
  const u = goalLightGroup.userData;
  goalLightGroup.position.y = .5 + .12 * Math.sin(t * 2.1);
  goalLightGroup.rotation.y = t * .5;
  if (u.ring) u.ring.rotation.z = t * .25;
  if (u.beam) u.beam.material.opacity = .13 + .10 * (.5 + .5 * Math.sin(t * 3.2));
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
  entrance: new THREE.Vector3(9, 0, -12.5),
  color: PALE,

  build() {
    for (const c of COLS) buildColumn(c);
    for (const w of WALLS) buildWall(w);
    buildGap();
    goalLightGroup = makeLight(GOAL, PALE);
    buildTwins();
  },

  onEnter() { setPrompt(''); },   // start silent: clear whatever prompt carried over from elsewhere

  update(dt, t) {
    const inRegion = curRegion === REGION;
    const p3 = getP3();

    animateCosmetics(t, inRegion);
    updateTwins(t);
    animateGoalLight(t);

    if (inRegion) {
      if (fallActive) tweenFall(p3);
      else if (flatRaw < 0) p3.scale.multiplyScalar(1 - flatRaw * 1.2);   // the spring's undershoot: a visible overshoot stretch, not a clamp
    }

    if (!inRegion) return; // only drive the shared `flat` value & gameplay while actually here

    let insideAny = false;
    for (const c of COLS) if (Math.hypot(playerPos.x - c.x, playerPos.z - c.z) < c.r) insideAny = true;
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

    const vOp = (.35 * Math.max(0, Math.min(1, flatRaw))).toFixed(3);
    if (vOp !== lastVeilOp) { veilEl.style.opacity = vOp; lastVeilOp = vOp; }

    for (const w of WALLS) {
      if (w.passed) { w.stuckT = 0; continue; }
      const near = Math.abs(playerPos.x - w.x) < 1.1 && Math.abs(playerPos.z - w.slotZ) < 3.5;
      if (near && flat <= .8) {
        w.stuckT += dt;
        if (w.stuckT > 8 && !w.promptOn) { w.promptOn = true; setPrompt('Flatten first.'); }
      } else {
        if (w.promptOn) { w.promptOn = false; setPrompt(''); }
        w.stuckT = 0;
      }
    }

    if (!goalReached) {
      const d = Math.hypot(playerPos.x - GOAL.x, playerPos.z - GOAL.z);
      if (d < 1.0) {
        goalReached = true; chime(); addAwake(.12);
        emitRipple(GOAL.x, GOAL.z, 1.5, PALE_COL); saveGame(); refreshHud();
      }
    }
  },

  constrain(prevX, prevZ, pos, vel, dt) {
    if (pos.x < BOUNDS.x0 - 2 || pos.x > BOUNDS.x1 + 2 || pos.z > BOUNDS.z1 + 2 || pos.z < BOUNDS.z0 - 2) return;
    const t = clock.elapsedTime;

    if (fallActive) {
      pos.copy(fallPos); vel.set(0, 0, 0);
      fallT += dt;
      if (fallT >= .6) {
        fallActive = false;
        pos.set(fallSide === 'near' ? GAP_NEAR - .4 : GAP_FAR + .4, 0, fallPos.z);
        vel.set(0, 0, 0);
        flareT = t; flareSide = fallSide;
      }
      return;
    }

    const wasOutsideGap = !(prevX >= GAP_NEAR && prevX <= GAP_FAR);
    const nowInsideGap = pos.x >= GAP_NEAR && pos.x <= GAP_FAR;
    if (nowInsideGap && wasOutsideGap) {
      if (flat > .8) {
        pulseFlash(); emitRipple(pos.x, pos.z, 1.4, PALE_COL); slide(480, 760, .3, .07);
      } else {
        fallActive = true; fallT = 0; fallPos.copy(pos);
        fallSide = prevX <= GAP_NEAR ? 'near' : 'far';
        slide(300, 55, .5, .1); emitRipple(pos.x, pos.z, 1.3, FALL_COL);
        return;
      }
    }

    for (const w of WALLS) {
      const crossing = (prevX - w.x) * (pos.x - w.x) < 0;
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
    veilEl.style.opacity = '0'; lastVeilOp = '0';
    const wePrompted = WALLS.some(w => w.promptOn);
    for (const w of WALLS) { w.stuckT = 0; w.promptOn = false; }
    if (wePrompted) setPrompt('');
  },

  hud() { return { label: 'SLOTS', n: slotsPassed, total: WALLS.length }; },
  done() { return goalReached; },

  save() { return { slotsPassed, goalReached, wallsPassed: WALLS.map(w => w.passed) }; },
  load(d) {
    slotsPassed = d.slotsPassed | 0;
    goalReached = !!d.goalReached;
    if (Array.isArray(d.wallsPassed)) WALLS.forEach((w, i) => { w.passed = !!d.wallsPassed[i]; });
    if (goalLightGroup) goalLightGroup.visible = !goalReached;
  },

  debug() {
    return {
      slotsPassed, total: WALLS.length, goalReached, fallActive, wallHits,
      flat: +THREE.MathUtils.clamp(flatRaw, 0, 1.4).toFixed(2),
      cols: COLS.map(c => ({ x: c.x, z: c.z, r: c.r })),
      walls: WALLS.map(w => ({ x: w.x, slotZ: w.slotZ, half: w.half, passed: w.passed })),
      gap: { near: GAP_NEAR, far: GAP_FAR },
      goal: { x: GOAL.x, z: GOAL.z },
    };
  },
});
