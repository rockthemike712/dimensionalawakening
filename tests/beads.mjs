// BEADS: the 2D-page toy. Tilt (via a debug setter) and drag both roll the
// beads; they pool in a hidden dent and light it; the pad and the seam-drag
// keep working exactly as before; a lit dent survives save/load.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const SHOTS = '/home/user/dimensionalawakening/.claude/worktrees/agent-abb21a4e9b1c41c38/shots';

await page.goto((process.env.DA_BASE || 'http://localhost:8901') + '/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const beadsState = () => page.evaluate(() => window.__DA.regions.find(r => r.id === 'beads').state);

// ---- the toy exists: one InstancedMesh, ~300 beads ----
let st = await beadsState();
console.log('initial beads state:', JSON.stringify(st));
if (!st || st.count < 250) errors.push('beads: fewer than 250 beads (' + (st && st.count) + ')');
if (!st || st.dents.length < 3) errors.push('beads: dent positions not exposed in debug()');

await page.screenshot({ path: SHOTS + '/1-beads-scattered.png' });

// ---- debug tilt: the mean position moves in the tilt direction ----
const before = await beadsState();
await page.evaluate(() => window.__DA_beads.tilt(1, 0));
await page.waitForTimeout(2500);
const afterTiltX = await beadsState();
console.log('tilt(+x): meanX', before.meanX, '->', afterTiltX.meanX);
if (afterTiltX.meanX <= before.meanX + .2) errors.push('beads: tilt(1,0) did not move the mean position in +x');
await page.screenshot({ path: SHOTS + '/2-beads-rolling.png' });

await page.evaluate(() => window.__DA_beads.tilt(0, -1));
await page.waitForTimeout(2500);
const afterTiltZ = await beadsState();
console.log('tilt(0,-1): meanZ', afterTiltX.meanZ, '->', afterTiltZ.meanZ);
if (afterTiltZ.meanZ >= afterTiltX.meanZ - .2) errors.push('beads: tilt(0,-1) did not move the mean position in -z');

// clear the debug override and let the drag-fallback take over
await page.evaluate(() => window.__DA_beads.tilt(null, null));
await page.waitForTimeout(600);

// ---- drag on empty world tilts too, and doesn't touch a reed or the seam ----
const lm = await page.evaluate(() => window.__DA.lm);
const pageReeds = lm.filter(l => l.x < 0);
function farEnough(x, z) { if (x > -1.2) return false; for (const l of pageReeds) if (Math.hypot(l.x - x, l.z - z) < 2) return false; return true; }
let spotX = -9, spotZ = -3;
outer: for (let x = -9.5; x < -1.5; x += .5) for (let z = -7; z < 7; z += .5) if (farEnough(x, z)) { spotX = x; spotZ = z; break outer; }
const sp = await page.evaluate(([x, z]) => window.__DA.project(x, .1, z), [spotX, spotZ]);
const beforeDrag = await beadsState();
await page.mouse.move(sp.x, sp.y);
await page.mouse.down();
await page.mouse.move(sp.x + 130, sp.y - 130, { steps: 15 });
await page.waitForTimeout(700);
const duringDrag = await beadsState();
await page.mouse.up();
console.log('drag empty-world: mean', JSON.stringify([beforeDrag.meanX, beforeDrag.meanZ]), '->', JSON.stringify([duringDrag.meanX, duringDrag.meanZ]));
if (duringDrag.meanX <= beforeDrag.meanX + .1 || duringDrag.meanZ >= beforeDrag.meanZ - .1)
  errors.push('beads: drag-on-empty-world did not tilt the tray toward the drag direction');
await page.waitForTimeout(500);

// a reed tap still rings while the drag handler is live
const reed = pageReeds[0];
const rp = await page.evaluate(([x, z]) => window.__DA.project(x, .3, z), [reed.x, reed.z]);
const rings0 = await page.evaluate(() => window.__DA.rings);
await page.mouse.click(rp.x, rp.y);
await page.waitForTimeout(300);
const rings1 = await page.evaluate(() => window.__DA.rings);
if (rings1 <= rings0) errors.push('beads: a reed tap no longer rings the reed (the drag fallback is stealing it)');

// ---- the pad still moves the player, untouched ----
const movesBefore = await page.evaluate(() => window.__DA.moves);
await page.tap('#right');
await page.waitForTimeout(200);
const movesAfter = await page.evaluate(() => window.__DA.moves);
if (movesAfter <= movesBefore) errors.push('beads: the d-pad no longer moves the player');

// ---- the seam is still grabbable: collect light 1, drag the seam, fold opens ----
await page.evaluate(() => window.__DA.setPos(-3, -1));
await page.waitForTimeout(400);
if ((await page.evaluate(() => window.__DA.seeds)) < 1) errors.push('beads: light 1 was not collectable (unrelated regression?)');
const seamPos = await page.evaluate(() => window.__DA.project(0, .05, 0));
await page.mouse.move(seamPos.x, seamPos.y);
await page.mouse.down();
await page.mouse.move(seamPos.x - 260, seamPos.y, { steps: 25 });
await page.mouse.up();
await page.waitForTimeout(800);
const fold = await page.evaluate(() => window.__DA.fold);
console.log('fold after dragging the seam:', fold);
if (fold < .68) errors.push('beads: the drag fallback stole the seam grab (fold=' + fold + ')');

// ---- the impossible moment: tilt toward the open seam, a bead pours across ----
await page.evaluate(() => window.__DA_beads.tilt(1, 0));
let poured = false;
for (let i = 0; i < 15 && !poured; i++) {
  await page.waitForTimeout(1000);
  const s = await beadsState();
  if (s.poured) poured = true;
}
console.log('poured across the fold?', poured);
if (!poured) errors.push('beads: no bead poured across the open fold');
await page.screenshot({ path: SHOTS + '/3-beads-pouring.png' });

// ---- tilt toward a known dent: it lights (generous wall-clock budget; headless runs slow) ----
await page.evaluate(() => window.__DA_beads.tilt(0, 0));
let lit = false, litIdx = -1;
for (let i = 0; i < 60 && !lit; i++) {
  const s = await beadsState();
  const target = s.dents.findIndex(d => !d.lit);
  if (target < 0) { lit = true; litIdx = -1; break; }
  const dx = s.dents[target].x - s.meanX, dz = s.dents[target].z - s.meanZ;
  const len = Math.hypot(dx, dz) || 1;
  await page.evaluate(([x, z]) => window.__DA_beads.tilt(x, z), [dx / len, dz / len]);
  await page.waitForTimeout(1500);
  const s2 = await beadsState();
  if (s2.lit > s.lit) { lit = true; litIdx = target; }
}
st = await beadsState();
console.log('dent lit?', lit, JSON.stringify(st));
if (!lit) errors.push('beads: steering toward a known dent never lit it');
await page.screenshot({ path: SHOTS + '/4-beads-lit-dent.png' });

// ---- save / load: a lit dent survives a reload through Continue ----
await page.evaluate(() => { window.__DA.jump3d(); window.__DA.save(); });
await page.waitForTimeout(300);
const litBeforeReload = (await beadsState()).lit;
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.evaluate(() => window.__DA.applySave(Object.assign(window.__DA.loadSave()||{}, {crossed:true})));   // Continue is only offered once crossed; force it here
await page.waitForTimeout(500);
const afterLoad = await beadsState();
console.log('lit before reload / after load:', litBeforeReload, afterLoad.lit);
if (afterLoad.lit < litBeforeReload) errors.push('beads: a lit dent did not survive save/load');

await browser.close();
if (errors.length) { console.log('\nERRORS:'); errors.forEach(e => console.log(' - ' + e)); process.exit(1); }
console.log('\nBEADS OK');
