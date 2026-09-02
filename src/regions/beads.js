import * as THREE from 'three';
import {registerRegion, world, camera, clock, renderer, landmarks, ringLandmark,
        emitRipple, blip, pulseFlash, addAwake, saveGame, foldedPoint,
        PAGE, FOLD_OPEN, crossed, fold} from '../game.js';

// =====================================================================
// BEADS — the 2D page toy. ~300 tiny glowing beads roll on tilt, pool in
// five hidden dents, and (after the first fold) pour across the seam
// without crossing the middle. One InstancedMesh, a flat typed-array
// integrator, no per-bead Object3D. See docs/briefs/beads.md.
// =====================================================================

const N = 300;
const BEAD_Y = 0.045;
const NEAR_X = PAGE.x1;      // -.45: the page-side edge of the seam gap
const FAR_X = 0.5;           // where a poured bead reappears on the far half
const XMIN = PAGE.x0, XMAXFAR = 10.4, ZMIN = PAGE.z0, ZMAX = PAGE.z1;
const TILT_G = 7.5;
const SIGMA = 1.4, SIGMA2 = SIGMA * SIGMA, WELL_A = 6.5;
const FILL_R = 1.25, FILL_R2 = FILL_R * FILL_R, FILL_COUNT = 36;
const BASE_COLOR = new THREE.Color(0xbdf3ff);
const LIT_COLOR = new THREE.Color(0xffffff);
const FAR_COLOR = new THREE.Color(0xffe39b);

// five hidden Gaussian wells — the floor is not flat where it looks flat
const DENTS = [
  { x: -9.4, z: -5.4 },
  { x: -9.0, z: 5.2 },
  { x: -2.0, z: 6.0 },
  { x: -2.0, z: -6.0 },
  { x: -5.7, z: 2.6 },
];

const px = new Float32Array(N), pz = new Float32Array(N);
const vx = new Float32Array(N), vz = new Float32Array(N);
for (let i = 0; i < N; i++) {
  px[i] = THREE.MathUtils.lerp(PAGE.x0 + .6, PAGE.x1 - .6, Math.random());
  pz[i] = THREE.MathUtils.lerp(PAGE.z0 + .6, PAGE.z1 - .6, Math.random());
}

let mesh = null;
const dummy = new THREE.Object3D();
const _scr = new THREE.Vector3();

// ---- input: device tilt (iOS/Android sensor) + drag-to-tilt fallback ----
let devTiltX = 0, devTiltZ = 0, devActive = false, baseBeta = null, baseGamma = null;
function onOrient(e) {
  if (e.beta == null || e.gamma == null) return;
  if (baseBeta === null) { baseBeta = e.beta; baseGamma = e.gamma; }
  devTiltX = THREE.MathUtils.clamp((e.gamma - baseGamma) / 28, -1.4, 1.4);
  devTiltZ = THREE.MathUtils.clamp(-(e.beta - baseBeta) / 28, -1.4, 1.4);
  devActive = true;
}
const dpadEl = document.getElementById('dpad');
if (dpadEl) dpadEl.addEventListener('pointerdown', () => {
  if (typeof DeviceOrientationEvent === 'undefined') return;
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(state => {
      if (state === 'granted') addEventListener('deviceorientation', onOrient);
    }).catch(() => {});
  } else addEventListener('deviceorientation', onOrient);
}, { once: true });

let dragActive = false, dragStartX = 0, dragStartY = 0, dragTiltX = 0, dragTiltZ = 0;
const DRAG_SCALE = 130;
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
function hitsReed(cx, cy) {
  _ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  return _ray.intersectObjects(landmarks.map(l => l.m)).length > 0;
}
renderer.domElement.addEventListener('pointerdown', e => {
  if (crossed) return;                                            // page toy only
  if (renderer.domElement.hasPointerCapture(e.pointerId)) return;  // the core already grabbed this pointer (the seam)
  if (hitsReed(e.clientX, e.clientY)) return;                      // let a reed tap ring instead
  dragActive = true; dragStartX = e.clientX; dragStartY = e.clientY;
}, { passive: true });
renderer.domElement.addEventListener('pointermove', e => {
  if (!dragActive) return;
  // screen-relative: drag right -> beads roll right (+x); drag up -> beads roll up-screen (-z)
  dragTiltX = THREE.MathUtils.clamp((e.clientX - dragStartX) / DRAG_SCALE, -1.4, 1.4);
  dragTiltZ = THREE.MathUtils.clamp((e.clientY - dragStartY) / DRAG_SCALE, -1.4, 1.4);
}, { passive: true });
const endDrag = () => { dragActive = false; };
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

let debugTiltX = null, debugTiltZ = null;
window.__DA_beads = {
  tilt(x, z) { debugTiltX = x; debugTiltZ = z; },
  get count() { return N; },
};

// ---- state ----
let dents = DENTS.map(d => ({ ...d, lit: false, light: null }));
let cascadeDone = false, pouredEver = false, frozen = false, lastCounts = [];
let hissCool = 0, rippleCool = 0;
let meanX = 0, meanZ = 0;
const GRID_W = 6, GRID_H = 8;
const gridN = new Int32Array(GRID_W * GRID_H);
const cellW = (PAGE.x1 - PAGE.x0) / GRID_W, cellH = (PAGE.z1 - PAGE.z0) / GRID_H;

function igniteDent(d, silent) {
  if (d.lit) return;
  d.lit = true;
  if (!d.light) d.light = makeDentLight(d);
  d.light.visible = true;
  if (!silent) {
    emitRipple(d.x, d.z, 1.6, LIT_COLOR);
    [660, 880, 1100].forEach((f, k) => setTimeout(() => blip(f, .4, .09, 'sine'), k * 90));
  }
}
function makeDentLight(d) {
  // a small light group, in the world's own style — hidden until the dent fills
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(.22, 0),
    new THREE.MeshBasicMaterial({ color: 0xdfffff, transparent: true, opacity: .95 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.46, .03, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: .7 }));
  ring.rotation.x = Math.PI / 2;
  g.add(core, ring); g.userData = { core, ring };
  g.position.set(d.x, BEAD_Y, d.z); g.visible = false;
  world.add(g);
  return g;
}
function maybeCascade(t) {
  if (cascadeDone) return;
  if (dents.filter(d => d.lit).length < 3) return;
  cascadeDone = true;
  addAwake(.1);
  const pageReeds = landmarks.filter(l => l.x < 0);
  pageReeds.forEach((l, i) => setTimeout(() => ringLandmark(l, 1, new THREE.Vector3(1, 0, 0), clock.elapsedTime), i * 70));
  setTimeout(() => emitRipple(-3, -1, 1.9, new THREE.Color(0xdfffff)), pageReeds.length * 70 + 150);
  saveGame();
}

function simulate(dt, t) {
  gridN.fill(0);
  let sumX = 0, sumZ = 0, speedSum = 0;
  const tiltX = debugTiltX !== null ? debugTiltX : (dragTiltX + (devActive ? devTiltX : 0));
  const tiltZ = debugTiltZ !== null ? debugTiltZ : (dragTiltZ + (devActive ? devTiltZ : 0));
  const damp = Math.pow(.92, dt * 60);
  const openBridge = fold > FOLD_OPEN;
  const dentCounts = dents.map(() => 0);
  for (let i = 0; i < N; i++) {
    let axi = tiltX * TILT_G, azi = tiltZ * TILT_G, eMax = 0;
    const xi = px[i], zi = pz[i];
    if (xi < 0) {
      for (let k = 0; k < dents.length; k++) {
        const ddx = xi - dents[k].x, ddz = zi - dents[k].z;
        const d2 = ddx * ddx + ddz * ddz;
        const e = Math.exp(-d2 / (2 * SIGMA2));
        const f = -WELL_A * e / SIGMA2;
        axi += f * ddx; azi += f * ddz;
        if (e > eMax) eMax = e;
        if (d2 < FILL_R2) dentCounts[k]++;
      }
    }
    vx[i] += axi * dt; vz[i] += azi * dt;
    vx[i] *= damp; vz[i] *= damp;
    // a dent is a real dimple: deep inside one, extra friction bleeds speed
    // off fast, so a rolling bead settles there instead of swinging through
    if (eMax > .5) { const kd = Math.pow(.06, eMax * dt * 30); vx[i] *= kd; vz[i] *= kd; }
    px[i] += vx[i] * dt; pz[i] += vz[i] * dt;
    // z edges bounce
    if (pz[i] < ZMIN) { pz[i] = ZMIN; vz[i] *= -.55; }
    else if (pz[i] > ZMAX) { pz[i] = ZMAX; vz[i] *= -.55; }
    // x: outer edges bounce; the seam at the middle bounces unless folded open
    if (px[i] < XMIN) { px[i] = XMIN; vx[i] *= -.55; }
    else if (px[i] > XMAXFAR) { px[i] = XMAXFAR; vx[i] *= -.55; }
    else if (px[i] < 0 && px[i] > NEAR_X && vx[i] > 0) {
      if (openBridge) { px[i] = FAR_X; if (!pouredEver) { pouredEver = true; pulseFlash(); addAwake(.08); } }
      else { px[i] = NEAR_X; vx[i] *= -.55; }
    } else if (px[i] >= 0 && px[i] < FAR_X && vx[i] < 0) {
      if (openBridge) px[i] = NEAR_X;
      else { px[i] = FAR_X; vx[i] *= -.55; }
    }
    sumX += px[i]; sumZ += pz[i];
    speedSum += Math.hypot(vx[i], vz[i]);
    if (px[i] < 0) {
      const gx = Math.min(GRID_W - 1, Math.max(0, ((px[i] - PAGE.x0) / cellW) | 0));
      const gz = Math.min(GRID_H - 1, Math.max(0, ((pz[i] - PAGE.z0) / cellH) | 0));
      gridN[gz * GRID_W + gx]++;
    }
  }
  meanX = sumX / N; meanZ = sumZ / N;
  lastCounts = dentCounts;
  dents.forEach((d, k) => { if (!d.lit && dentCounts[k] >= FILL_COUNT) igniteDent(d, false); });
  maybeCascade(t);

  // granular hiss: a few short high blips a second, gain by total speed
  hissCool -= dt;
  const activity = Math.min(1, speedSum / (N * .35));
  if (activity > .025 && hissCool <= 0) {
    hissCool = .05 + Math.random() * .05;
    const k = 1 + (Math.random() < activity ? 1 : 0);
    for (let i = 0; i < k; i++)
      blip(1700 + Math.random() * 1700, .022 + Math.random() * .02, Math.min(.045, .012 + activity * .045), 'triangle', (Math.random() * 2 - 1) * .7);
  }
  // ripple trail on the densest cell, throttled to ~4/s
  rippleCool -= dt;
  if (rippleCool <= 0) {
    rippleCool = .25;
    let best = -1, bi = -1;
    for (let c = 0; c < gridN.length; c++) if (gridN[c] > best) { best = gridN[c]; bi = c; }
    if (best >= 4) {
      const gx = bi % GRID_W, gz = (bi / GRID_W) | 0;
      const rx = PAGE.x0 + (gx + .5) * cellW, rz = PAGE.z0 + (gz + .5) * cellH;
      emitRipple(rx, rz, Math.min(1.3, .25 + best * .045));
    }
  }
  if (!dragActive) {
    const decay = 1 - Math.pow(.001, dt);
    dragTiltX += (0 - dragTiltX) * decay;
    dragTiltZ += (0 - dragTiltZ) * decay;
  }
}

function renderInstances() {
  for (let i = 0; i < N; i++) {
    let wx, wy = BEAD_Y, wz, tint = BASE_COLOR;
    if (px[i] < 0) {
      wx = px[i]; wz = pz[i];
      for (const d of dents) if (d.lit && (px[i] - d.x) ** 2 + (pz[i] - d.z) ** 2 < 1.5 ** 2) { tint = LIT_COLOR; break; }
    } else {
      const fp = foldedPoint(_scr.set(px[i], 0, pz[i]));
      wx = fp.x; wz = fp.z; wy = fp.y + BEAD_Y; tint = FAR_COLOR;
    }
    dummy.position.set(wx, wy, wz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, tint);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function animateDentLights(t) {
  for (const d of dents) {
    if (!d.lit || !d.light) continue;
    d.light.rotation.y = t * .6;
    d.light.userData.ring.rotation.z = t * .3;
    d.light.position.y = BEAD_Y + .1 + .07 * Math.sin(t * 2 + d.x);
  }
}

registerRegion({
  id: 'beads',
  name: 'BEADS',
  page: true,
  bounds: PAGE,
  entrance: new THREE.Vector3(-3, 0, -1),
  build() {
    const geo = new THREE.IcosahedronGeometry(.13, 1);   // the 2D camera shows ~20 units across a phone: a bead has to be ~5px to read
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: .92,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    mesh = new THREE.InstancedMesh(geo, mat, N);
    world.add(mesh);
    renderInstances();
  },
  update(dt, t) {
    if (crossed) {
      if (!frozen) {
        frozen = true;
        renderInstances();   // one last pass, then the page beads sit as scenery
      }
      animateDentLights(t);
      return;
    }
    simulate(Math.min(dt, .05), t);
    renderInstances();
    animateDentLights(t);
  },
  save() { return { lit: dents.map(d => d.lit) }; },
  load(d) {
    if (!d || !d.lit) return;
    d.lit.forEach((v, i) => { if (v && dents[i]) igniteDent(dents[i], true); });
    if (dents.filter(x => x.lit).length >= 3) cascadeDone = true;
  },
  debug() {
    return {
      count: N,
      lit: dents.filter(d => d.lit).length,
      dents: dents.map(d => ({ x: d.x, z: d.z, lit: d.lit })),
      meanX: +meanX.toFixed(3), meanZ: +meanZ.toFixed(3),
      poured: pouredEver, frozen, counts: lastCounts,
    };
  },
});
