// THIN — walk into a column of light, squash flat, fit through a slot a
// full-size body can't, then walk flat straight over a gap that swallows
// you at full size. See docs/briefs/thin.md.
//
// The corridor turns: a short walk north (-z, ArrowLeft) from the entrance
// to the first column, then east (+x, ArrowUp) the rest of the way — every
// wall stands face-on to the camera, which always looks down +x. Headless
// Chromium can run this at a fraction of real speed, so movement is driven
// by polling live state (window.__DA) until a position/flat condition is
// met, with a generous timeout, rather than by a fixed-duration hold.
//
// Second-review layout (critic: REVISE). The corridor's obstacles moved:
// column A / wall A are unchanged (x=9 / x=11.0); column B is now at
// x=18.3 (wall B at x=20.3); column C — the one that flattens the player
// for the gap — sits *off* the corridor's z-line entirely, at (22,-18.6),
// so a straight run through A and B never triggers it; the gap is now at
// x=24.0..25.4, and the goal at x=27.6. HOLD_TIME dropped from 0.8s to
// 0.25s so the carry drains between columns instead of lasting the whole
// corridor. See src/regions/thin.js for the full reasoning.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto((process.env.DA_BASE || 'http://localhost:8901') + '/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const DA = (k) => page.evaluate(k => window.__DA[k], k);
const thinState = () => page.evaluate(() => window.__DA.regions.find(r => r.id === 'thin').state);
const thinDone = () => page.evaluate(() => window.__DA.regions.find(r => r.id === 'thin').done);
const setPos = (x, z) => page.evaluate(([x, z]) => window.__DA.setPos(x, z), [x, z]);
const sample = () => page.evaluate(() => ({ x: window.__DA.pos[0], z: window.__DA.pos[2], flat: window.__DA.flat }));
const shotDir = new URL('../shots/', import.meta.url).pathname;

// Holds `key` and polls live position/flat until `untilX`/`untilZ`/
// `untilFlatBelow` is satisfied, or `maxMs` elapses — whichever first.
// Returns the last sample plus the peak flat value seen along the way.
async function walk(key, { untilX = null, untilZ = null, untilFlatBelow = null, maxMs = 20000, pollMs = 45 } = {}) {
  await page.keyboard.down(key);
  const t0 = Date.now(); let peak = 0, d = { x: null, z: null, flat: 0 };
  while (Date.now() - t0 < maxMs) {
    d = await sample();
    peak = Math.max(peak, d.flat);
    if (untilX && untilX(d.x)) break;
    if (untilZ && untilZ(d.z)) break;
    if (untilFlatBelow != null && d.flat < untilFlatBelow) break;
    await page.waitForTimeout(pollMs);
  }
  await page.keyboard.up(key);
  await page.waitForTimeout(150);
  return { x: d.x, z: d.z, flat: d.flat, peak };
}

// A held key coasts a fair distance once released — the movement smoothing
// is sampled per animation frame, and headless Chromium runs at a fraction
// of real speed, so a single long hold overshoots a target by more than a
// frame at 60fps would. To land `z` on the corridor's exact line (needed
// before turning to cross a slot) pulse the key in short bursts instead,
// each followed by enough idle time for the coast to fully settle.
async function nudgeZ(targetZ, tol = 0.3, maxMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const z = await page.evaluate(() => window.__DA.pos[2]);
    if (Math.abs(z - targetZ) < tol) return z;
    const key = z > targetZ ? 'ArrowLeft' : 'ArrowRight'; // ArrowLeft -> -z, ArrowRight -> +z in 3D
    await page.keyboard.down(key);
    await page.waitForTimeout(70);
    await page.keyboard.up(key);
    await page.waitForTimeout(220); // let the coast fully settle before the next measurement
  }
  return await page.evaluate(() => window.__DA.pos[2]);
}

// Pulses diagonally toward (tx,tz) in short bursts until `flat` clears
// `thresh` or the player gets within `tol` of the target — used to reach
// column C, which sits off the corridor's z-line on purpose (item 1).
async function nudgeToward(tx, tz, { thresh = .8, tol = .3, maxMs = 8000 } = {}) {
  const t0 = Date.now();
  let d = await sample();
  while (Date.now() - t0 < maxMs) {
    d = await sample();
    if (d.flat >= thresh) return d;
    const dx = tx - d.x, dz = tz - d.z;
    if (Math.hypot(dx, dz) < tol) return d;
    const kx = dx > 0 ? 'ArrowUp' : 'ArrowDown';
    const kz = dz > 0 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(kx); await page.keyboard.down(kz);
    await page.waitForTimeout(90);
    await page.keyboard.up(kx); await page.keyboard.up(kz);
    await page.waitForTimeout(180);
  }
  return d;
}

await page.evaluate(() => window.__DA.jump3d());
await setPos(9, -12.5);
await page.waitForTimeout(300);
if ((await DA('region')) !== 'thin') errors.push('did not land in the thin region at its entrance');
await page.screenshot({ path: shotDir + 'thin-00-entrance.png' });

// ---- item 1 (twins): twin reeds must not skip the region. Run straight
// through both twins (they sit on x=6.4/6.0, well off the actual corridor)
// and confirm no core teleport (`tps`) and no slot/goal progress leaked
// from it. Done first, while slotsPassed/done are still at their initial
// state. ----
await setPos(6.4, -12);
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(4000);
await page.keyboard.up('ArrowLeft');
await page.waitForTimeout(200);
{
  const tps = await DA('tps');
  const st = await thinState();
  const done = await thinDone();
  console.log('twin bypass check: tps=' + tps + ' slotsPassed=' + st.slotsPassed + ' done=' + done);
  if (tps !== 0) errors.push('a reed teleport fired (tps=' + tps + '); twins must not use the core pair-teleport');
  if (st.slotsPassed !== 0 || done) errors.push('walking past the twins made region progress (slotsPassed=' + st.slotsPassed + ', done=' + done + ')');
}

// ---- item 4: the wall must read as a wall at full size. Screenshot from
// 0.8 units in front of wall A (x=11.0-0.8=10.2), off the corridor's z-line
// (z=-20) so nothing is flattening the player for this shot. ----
await setPos(10.2, -20);
await page.waitForTimeout(250);
await page.screenshot({ path: shotDir + 'thin-wallA-approach.png' });

// ---- item 1 (the gap, before the fall): the gap at full size, one step
// short of it, off the corridor's z-line so nothing here has flattened the
// player either. This is a snapshot only (setPos does not trip the
// crossing logic); the real fall is exercised for real further down. ----
await setPos(24.0 - 0.4, -20);
await page.waitForTimeout(250);
await page.screenshot({ path: shotDir + 'thin-gap-before-fall.png' });

// ---- item 2: a full-size straight run must actually hit a wall — off the
// corridor's z-line (z=-20), out of every column's reach (columns sit on
// z=-16, and column C sits on z=-18.6 but far away in x), running east
// into wall A (x=11.0) ----
await setPos(9, -20);
await page.waitForTimeout(150);
let r = await walk('ArrowUp', { untilX: x => x >= 10.85, maxMs: 6000 }); // unreachable if actually blocked
console.log('full size run into wall A (off column reach): x=' + r.x.toFixed(2) + ' flat=' + r.flat.toFixed(2));
if (r.x > 11.0 + 0.1) errors.push('wall A did not block a full-size, never-flattened player (crossed to x=' + r.x.toFixed(2) + ')');
if (r.flat > .3) errors.push('player was unexpectedly flat during the off-column wall test');
let st = await thinState();
if (st.wallHits <= 0) errors.push('wallHits did not register the block (wallHits=' + st.wallHits + ')');
if (st.slotsPassed !== 0) errors.push('slotsPassed advanced without ever passing a slot (' + st.slotsPassed + ')');

// ---- item 2's own verify: rules must stop dead at the region's drawn
// z-extent (z0..z1 = -27..-11), not a padded approximation of it. At
// z=-10 (just past z1, the open field toward the Corner) neither wall
// (x=11.0, x=20.3) nor the gap (x=24.0..25.4) should do anything at all —
// no thuds, no falling. ----
{
  await setPos(9.5, -10);
  await page.waitForTimeout(120);
  const run = await walk('ArrowUp', { untilX: x => x >= 26.2, maxMs: 15000 });
  const s = await thinState();
  console.log('open-field run from (9.5,-10): x=' + run.x.toFixed(2) + ' fallActive-ever-seen check follows');
  if (run.x < 26.0) errors.push('an invisible wall/hole stopped movement in the open field at z=-10 (x=' + run.x.toFixed(2) + ')');
  if (s.fallActive) errors.push('fallActive was left true after an open-field run at z=-10');
}
{
  await setPos(20, -10);
  await page.waitForTimeout(120);
  const run = await walk('ArrowUp', { untilX: x => x >= 26.2, maxMs: 12000 });
  const s = await thinState();
  console.log('open-field run from (20,-10): x=' + run.x.toFixed(2));
  if (run.x < 26.0) errors.push('an invisible wall/hole stopped movement in the open field at z=-10, second start (x=' + run.x.toFixed(2) + ')');
  if (s.fallActive) errors.push('fallActive was left true after the second open-field run at z=-10');
}

// ---- item 3: the goal must not be reachable from behind the far lip
// without ever passing the slots or crossing the gap. Old repro: spawn
// just south of the region (open field) directly beside the goal, walk
// straight in — slotsPassed stayed 0 and the region still finished. ----
{
  await setPos(27.6, -9.5); // due south of the goal (27.6,-16), just outside the region's z1=-11
  await page.waitForTimeout(120);
  await page.keyboard.down('ArrowLeft'); // -z, straight toward the goal
  await page.waitForTimeout(3500);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(200);
  const s = await thinState();
  const done = await thinDone();
  const pos = await sample();
  console.log('backdoor-goal check: pos=(' + pos.x.toFixed(2) + ',' + pos.z.toFixed(2) + ') slotsPassed=' + s.slotsPassed + ' gapCrossed=' + s.gapCrossed + ' done=' + done);
  if (s.slotsPassed !== 0) errors.push('the backdoor approach advanced slotsPassed (' + s.slotsPassed + ')');
  if (s.gapCrossed) errors.push('the backdoor approach set gapCrossed without ever crossing the gap');
  if (done) errors.push('the region finished via the backdoor approach, without the slots or the gap');
}

// ---- the toy: walk into the first column (also the turn), squash flat
// with a visible overshoot ----
await setPos(9, -12.5);
await page.waitForTimeout(150);
r = await walk('ArrowLeft', { untilZ: z => z <= -15.6, maxMs: 20000 });
console.log('column A: peak flat =', r.peak.toFixed(3), 'z=', r.z.toFixed(2));
if (r.peak < 1.05) errors.push('no visible overshoot entering the column (peak=' + r.peak.toFixed(2) + ')');
await page.waitForTimeout(250);
let f = await DA('flat');
if (f < .9) errors.push('flat did not settle above .9 standing in the column (flat=' + f.toFixed(2) + ')');
await page.screenshot({ path: shotDir + 'thin-01-flat-column.png' });

// walk back out toward the entrance — it should pop back down
r = await walk('ArrowRight', { untilFlatBelow: .05, maxMs: 20000 });
console.log('after leaving column A: flat =', r.flat.toFixed(3), 'z=', r.z.toFixed(2));
if (r.flat > .1) errors.push('flat did not settle back below .1 leaving the column (flat=' + r.flat.toFixed(2) + ')');

// =====================================================================
// item 1's verify run: hold forward from (9,-16) — column A's own spot —
// all the way to the goal, logging `flat` every poll. The corridor must
// no longer glide through in one breath: the carry has to lapse at least
// twice, the gap has to be met full-size the first time (a real fall),
// and only a deliberate step off-line into column C (the column nearest
// the gap) lets a second attempt cross it flat.
// =====================================================================
const flatLog = [];
async function logSample(tag) {
  const d = await sample(); const s = await thinState();
  flatLog.push({ tag, t: Date.now(), x: +d.x.toFixed(2), z: +d.z.toFixed(2), flat: +d.flat.toFixed(3), fallActive: s.fallActive, goalReached: s.goalReached });
  return { d, s };
}

await setPos(9, -16); // column A's own position: the run starts already flat
await page.waitForTimeout(150);
await logSample('start');

let fallSeenAt = -1, goalSeenAt = -1, shotSlot = false;
await page.keyboard.down('ArrowUp');
{
  const t0 = Date.now();
  while (Date.now() - t0 < 16000) {
    const { d, s } = await logSample('run1');
    // item deliverable: flat, framed by wall A's slot
    if (!shotSlot && d.flat >= .8 && Math.abs(d.x - 11.0) < .5) { shotSlot = true; await page.screenshot({ path: shotDir + 'thin-02-slot.png' }); }
    if (s.fallActive) { if (fallSeenAt < 0) fallSeenAt = Date.now(); await page.screenshot({ path: shotDir + 'thin-03-mid-fall.png' }); break; }
    await page.waitForTimeout(45);
  }
}
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(700); // let the 0.6s freeze finish and the reset land
await logSample('after-reset');

// step off-line toward column C (22,-18.6) — the column nearest the gap
const nearC = await nudgeToward(22, -18.6, { thresh: .8, tol: .3, maxMs: 8000 });
await logSample('near-C');
if (nearC.flat < .8) errors.push('column C did not flatten the player (flat=' + nearC.flat.toFixed(2) + ')');
await page.waitForTimeout(350); // let the squash spring settle near 1 before running at it

// run forward across the gap, off-line, while still flat — shoot the gap
// itself (not column C) the instant the crossing registers, while the
// player is still standing right on top of it and still flat
await page.keyboard.down('ArrowUp');
let shotGapFlat = false, shotGoalLit = false;
{
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    const { d, s } = await logSample('cross');
    if (!shotGapFlat && s.gapCrossed && d.x >= 24.6) { shotGapFlat = true; await page.screenshot({ path: shotDir + 'thin-04-gap-flat.png' }); }
    if (s.goalReached) { if (goalSeenAt < 0) goalSeenAt = Date.now(); break; }
    if (s.gapCrossed !== undefined && s.gapCrossed && d.x > 26.5) break;
    await page.waitForTimeout(45);
  }
}
await page.keyboard.up('ArrowUp');
st = await thinState();
console.log('after crossing off-line:', JSON.stringify(st));
if (!st.gapCrossed) errors.push('never crossed the gap while flat (gapCrossed=' + st.gapCrossed + ')');
if (st.slotsPassed < 2) errors.push('did not pass both slots on the way (slotsPassed=' + st.slotsPassed + ')');
if (!shotGapFlat) await page.screenshot({ path: shotDir + 'thin-04-gap-flat.png' }); // fallback, in case the crossing was already past by the first poll

// reorient onto the corridor's z-line, a few units short of the goal, and
// shoot it there: earned (both slots, a real gap crossing) so the light is
// lit and the beam is on, but not yet collected.
function GOAL_X() { return 27.6; }
function CZ_Z() { return -16; }
if (!st.goalReached) {
  await nudgeToward(GOAL_X() - 3, CZ_Z(), { thresh: 999, tol: .4, maxMs: 8000 });
  await logSample('short-of-goal');
  await page.waitForTimeout(200);
  await page.screenshot({ path: shotDir + 'thin-goal-lit.png' });

  // then close the last stretch
  await page.keyboard.down('ArrowUp');
  {
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const { s } = await logSample('to-goal');
      if (s.goalReached) { if (goalSeenAt < 0) goalSeenAt = Date.now(); break; }
      await page.waitForTimeout(45);
    }
  }
  await page.keyboard.up('ArrowUp');
}
await page.waitForTimeout(150);
await page.screenshot({ path: shotDir + 'thin-05-goal.png' });

st = await thinState();
const doneNow = await thinDone();
console.log('after the full run:', JSON.stringify(st), 'done=', doneNow);
if (!doneNow) errors.push('region not marked done after the full run reached the goal');

// ---- item 1's specific asserts: the carry must actually lapse, the fall
// must actually happen, and it must happen before the goal, not after ----
{
  let dips = 0, above = true;
  for (const e of flatLog) { if (e.flat >= .8) above = true; else if (above) { dips++; above = false; } }
  const fallEver = flatLog.some(e => e.fallActive);
  console.log('item 1 flat log: ' + flatLog.length + ' samples, dips-below-.8=' + dips + ', fallActive-ever=' + fallEver
    + ', wallHits=' + st.wallHits + ', fallSeenAt=' + fallSeenAt + ', goalSeenAt=' + goalSeenAt);
  if (dips < 2) errors.push('flat did not dip below .8 at least twice across the run (dips=' + dips + ')');
  if (!fallEver) errors.push('fallActive was never observed during the run (the gap was never met full-size)');
  if (st.wallHits <= 0) errors.push('wallHits is not >0 by the end of the run (wallHits=' + st.wallHits + ')');
  if (fallSeenAt < 0 || goalSeenAt < 0 || fallSeenAt >= goalSeenAt) errors.push('fallActive was not observed before goalReached (fallSeenAt=' + fallSeenAt + ', goalSeenAt=' + goalSeenAt + ')');
}

// ---- leaving the region resets the shared flat value, the veil and any
// prompt the region set. This checks only what Thin owns: it does not
// touch the prompt pill's own visibility, since the core may legitimately
// show its own 'Follow the lights.' once the player has digested — that
// is not a leak. ----
await setPos(35, 0); // well outside every region's bounds
await page.waitForTimeout(400);
{
  const flatNow = await DA('flat');
  const veilOp = await page.evaluate(() => getComputedStyle(document.getElementById('thin-veil')).opacity);
  const promptTxt = await page.evaluate(() => document.getElementById('prompt').textContent);
  console.log('after leaving: flat=' + flatNow + ' veilOpacity=' + veilOp + ' prompt="' + promptTxt + '"');
  if (flatNow !== 0) errors.push('flat did not reset to 0 after leaving the region (flat=' + flatNow + ')');
  if (Math.abs(parseFloat(veilOp)) > 0.001) errors.push('veil did not clear after leaving the region (opacity=' + veilOp + ')');
  if (promptTxt === 'Flatten first.') errors.push('the region\'s own "Flatten first." prompt was still showing after leaving');
}

// ---- save / real reload / tap Continue / restore ----
await page.evaluate(() => window.__DA.save());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const resumeVisible = await page.evaluate(() => getComputedStyle(document.getElementById('resume')).display !== 'none');
if (!resumeVisible) errors.push('resume prompt did not appear after reload with a saved game');
else {
  await page.click('#resumeYes');
  await page.waitForTimeout(600);
}
st = await thinState();
const doneAfter = await thinDone();
console.log('after reload + Continue:', JSON.stringify(st), 'done=', doneAfter);
if (st.slotsPassed < 2 || !doneAfter) errors.push('reload + Continue did not restore thin region progress');

await browser.close();
if (errors.length) { console.log('\nERRORS:'); errors.forEach(e => console.log(' - ' + e)); process.exit(1); }
console.log('\nTHIN OK');
