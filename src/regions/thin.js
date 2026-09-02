import * as THREE from 'three';
import {
  registerRegion, world, playerPos, curRegion,
  emitRipple, blip, slide, chime, pulseFlash, setPrompt, refreshHud,
  makeLight, saveGame, clock, addAwake, flat, setFlat, makeLandmark, player
} from '../game.js';

// =====================================================================
// THIN — walk into a column of light, squash flat, fit through what a
// full-size body can't. The corridor runs due north (-z) from the
// entrance, fixed at x=9 the whole way, so a phone player only ever has
// to hold one direction: everything else is timing the flatten.
// =====================================================================

const BOUNDS = { x0: 4, x1: 26, z0: -27, z1: -11 };
const CX = 9;                          // the corridor's x — every obstacle sits on this line
const PALE = 0xcdf6ff;                 // the column's colour; goal light shares it
const PALE_COL = new THREE.Color(PALE);
const FALL_COL = new THREE.Color(0xff6a5a);

// squash-and-pop spring: underdamped so it overshoots (~25%, peaks ~1.25)
// and settles in ~0.3s. Tune OMEGA for speed, ZETA for how much it overshoots.
const OMEGA = 30, ZETA = 0.4;

// Each column: standing within `r` of (x,z) sets the flatten target to 1.
// `r` deliberately reaches a little past the visible glow (`vr`) so the wall
// or gap just beyond it is still inside reach while flat — "the column is
// wide enough" per the brief — but only just past it (a ~0.3 buffer past
// the obstacle), so the columns don't bleed into each other's territory.
const COLS = [
  { x: CX, z: -14.6, r: 1.9, vr: 1.5, mesh: null },  // the toy, a few steps past the entrance; reaches wall A
  { x: CX, z: -18.5, r: 1.8, vr: 1.5, mesh: null },  // reaches wall B
  { x: CX, z: -21.6, r: 2.3, vr: 1.5, mesh: null },  // reaches the gap (stands before it, not on it)
];

// Two thin walls, each with a 0.15-unit slot on the corridor line.
const WALLS = [
  { z: -16.2, slotX: CX, half: 0.075, passed: false, lastHit: -99, stuckT: 0, promptOn: false, mesh: null },
  { z: -20.0, slotX: CX, half: 0.075, passed: false, lastHit: -99, stuckT: 0, promptOn: false, mesh: null },
];

// The gap: a 1.2-unit trench across the whole corridor. NEAR is the lip
// closer to the entrance (less negative z); FAR is the far lip.
const GAP_NEAR = -22.4, GAP_FAR = -23.6;
const GOAL = new THREE.Vector3(CX, 0, -25.4);

let slotsPassed = 0, goalReached = false;
let flatRaw = 0, flatVel = 0, wasSquashed = false;
let fallActive = false, fallT = 0, fallSide = 'near';
const fallPos = new THREE.Vector3();
let goalLightGroup = null;
const gapMesh = {};

// a private veil, independent of the eye button's — dims everything but
// what's self-luminous (the column, the slot posts, the player) while flat
const veilEl = document.createElement('div');
veilEl.style.cssText = 'position:absolute;inset:0;background:#02030a;opacity:0;pointer-events:none';
document.getElementById('ui').appendChild(veilEl);

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

function buildWall(w) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a7fa0, transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xaefcff });
  const segs = [[BOUNDS.x0, w.slotX - w.half], [w.slotX + w.half, BOUNDS.x1]];
  for (const [sx0, sx1] of segs) {
    const width = sx1 - sx0; if (width <= .02) continue;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, 2.4, .22), mat.clone());
    wall.position.set((sx0 + sx1) / 2, 1.2, w.z); g.add(wall);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(width, .05, .26), edgeMat);
    edge.position.set((sx0 + sx1) / 2, 2.42, w.z); g.add(edge);
  }
  const postMat = new THREE.MeshBasicMaterial({ color: 0xdfffff });
  for (const sx of [w.slotX - w.half, w.slotX + w.half]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.4, 8), postMat);
    p.position.set(sx, 1.2, w.z); g.add(p);
  }
  const marker = new THREE.Mesh(new THREE.BoxGeometry(w.half * 2 + .02, 2.6, .06),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
  marker.position.set(w.slotX, 1.3, w.z); g.add(marker);
  world.add(g); w.mesh = { g, marker };
}

function buildGap() {
  const midZ = (GAP_NEAR + GAP_FAR) / 2, depth = Math.abs(GAP_NEAR - GAP_FAR);
  const hole = new THREE.Mesh(new THREE.BoxGeometry(BOUNDS.x1 - BOUNDS.x0, .06, depth),
    new THREE.MeshBasicMaterial({ color: 0x01030a }));
  hole.position.set((BOUNDS.x0 + BOUNDS.x1) / 2, -.03, midZ); world.add(hole);
  const rim = (z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(BOUNDS.x1 - BOUNDS.x0, .05, .12),
      new THREE.MeshBasicMaterial({ color: PALE, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set((BOUNDS.x0 + BOUNDS.x1) / 2, .02, z); world.add(m); return m;
  };
  gapMesh.rimNear = rim(GAP_NEAR); gapMesh.rimFar = rim(GAP_FAR); gapMesh.hole = hole;
}

// two reeds, close in x but far in z, permanently paired: touching one
// (walking past it — brushLandmarks() is generic core behaviour) rings
// both. Cheap taste of "flatten deletes an axis and far becomes near".
function buildTwins() {
  const a = makeLandmark(6.4, -15.4, 1.2), b = makeLandmark(6.0, -24.0, 1.2);
  a.pair = b; b.pair = a;
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  a.thread = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .45 }));
  a.thread.userData.t0 = clock.elapsedTime - 10; // already faded in, no flash at build time
  world.add(a.thread);
}

function animateCosmetics(t) {
  for (const c of COLS) {
    if (!c.mesh) continue;
    const near = Math.hypot(playerPos.x - c.x, playerPos.z - c.z) < c.r * 1.3;
    const boost = near ? Math.max(0, Math.min(1, flatRaw)) : 0;
    c.mesh.ring.rotation.z = t * .6;
    c.mesh.glow.material.opacity = .1 + .08 * (.5 + .5 * Math.sin(t * 1.4 + c.z)) + boost * .35;
    c.mesh.floor.material.opacity = .2 + boost * .5;
    c.mesh.core.intensity = 7 + boost * 16;
  }
  for (const w of WALLS) {
    if (!w.mesh) continue;
    w.mesh.marker.material.opacity = w.passed ? .3 : .55 + .25 * Math.sin(t * 3.2);
  }
  if (gapMesh.rimNear) {
    const k = Math.max(0, Math.min(1, flatRaw));
    for (const r of [gapMesh.rimNear, gapMesh.rimFar]) {
      r.scale.y = THREE.MathUtils.lerp(1, .16, k);
      r.material.opacity = THREE.MathUtils.lerp(.8, .22, k);
    }
  }
}

function tweenFall() {
  const k = Math.min(1, fallT / .6);
  player.scale.setScalar(Math.max(.05, 1 - Math.sin(Math.PI * k) * .72));
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

  update(dt, t) {
    animateCosmetics(t);
    if (fallActive) tweenFall();
    else if (player.scale.x !== 1) player.scale.setScalar(1);

    if (curRegion !== REGION) return; // only drive the shared `flat` value while actually here

    let insideAny = false;
    for (const c of COLS) if (Math.hypot(playerPos.x - c.x, playerPos.z - c.z) < c.r) insideAny = true;
    const target = insideAny ? 1 : 0;
    stepSpring(target, dt);
    setFlat(flatRaw);

    const squashed = flatRaw > .5;
    if (squashed && !wasSquashed) {
      slide(220, 90, .18, .1); emitRipple(playerPos.x, playerPos.z, 1.1, PALE_COL);
      setTimeout(() => blip(760, .06, .045, 'sine'), 90); // the overshoot's little extra tick
    } else if (!squashed && wasSquashed) {
      slide(130, 300, .16, .09); emitRipple(playerPos.x, playerPos.z, .9, PALE_COL);
    }
    wasSquashed = squashed;
    veilEl.style.opacity = (.35 * Math.max(0, Math.min(1, flatRaw))).toFixed(3);

    for (const w of WALLS) {
      if (w.passed) { w.stuckT = 0; continue; }
      const near = Math.abs(playerPos.z - w.z) < 1.1 && Math.abs(playerPos.x - w.slotX) < 3.5;
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
    if (goalLightGroup) goalLightGroup.visible = !goalReached;
  },

  constrain(prevX, prevZ, pos, vel, dt) {
    if (pos.x < BOUNDS.x0 - 2 || pos.x > BOUNDS.x1 + 2 || pos.z > BOUNDS.z1 + 2 || pos.z < BOUNDS.z0 - 2) return;
    const t = clock.elapsedTime;

    if (fallActive) {
      pos.copy(fallPos); vel.set(0, 0, 0);
      fallT += dt;
      if (fallT >= .6) {
        fallActive = false;
        pos.set(fallPos.x, 0, fallSide === 'near' ? GAP_NEAR + .4 : GAP_FAR - .4);
        vel.set(0, 0, 0);
      }
      return;
    }

    const wasOutsideGap = !(prevZ <= GAP_NEAR && prevZ >= GAP_FAR);
    const nowInsideGap = pos.z <= GAP_NEAR && pos.z >= GAP_FAR;
    if (nowInsideGap && wasOutsideGap) {
      if (flat > .8) {
        pulseFlash(); emitRipple(pos.x, pos.z, 1.4, PALE_COL); slide(480, 760, .3, .07);
      } else {
        fallActive = true; fallT = 0; fallPos.copy(pos);
        fallSide = prevZ >= GAP_NEAR ? 'near' : 'far';
        slide(300, 55, .5, .1); emitRipple(pos.x, pos.z, 1.3, FALL_COL);
        return;
      }
    }

    for (const w of WALLS) {
      const crossing = (prevZ - w.z) * (pos.z - w.z) < 0;
      if (!crossing) continue;
      const allowed = flat > .8 && Math.abs(pos.x - w.slotX) < w.half;
      if (allowed) {
        if (!w.passed) {
          w.passed = true; slotsPassed++; refreshHud(); saveGame();
          blip(640, .14, .09, 'sine'); emitRipple(pos.x, w.z, 1.2, PALE_COL);
        }
      } else {
        pos.z = prevZ; if (Math.abs(vel.z) > .05) vel.z *= -.2;
        if (t - w.lastHit > .22) { w.lastHit = t; blip(150, .12, .08, 'triangle'); emitRipple(pos.x, pos.z, .8, PALE_COL); }
      }
    }
  },

  onLeave() {
    setFlat(0); flatRaw = 0; flatVel = 0; wasSquashed = false;
    veilEl.style.opacity = 0; setPrompt('');
    for (const w of WALLS) { w.stuckT = 0; if (w.promptOn) w.promptOn = false; }
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
      slotsPassed, total: WALLS.length, goalReached, flat: +flatRaw.toFixed(2), fallActive,
      cols: COLS.map(c => ({ x: c.x, z: c.z, r: c.r })),
      walls: WALLS.map(w => ({ z: w.z, slotX: w.slotX, half: w.half, passed: w.passed })),
      gap: { near: GAP_NEAR, far: GAP_FAR },
      goal: { x: GOAL.x, z: GOAL.z },
    };
  },
});
