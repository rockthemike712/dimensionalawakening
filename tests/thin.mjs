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
const shotDir = new URL('../shots/', import.meta.url).pathname;

// Holds `key` and polls live position/flat until `untilX`/`untilZ`/
// `untilFlatBelow` is satisfied, or `maxMs` elapses — whichever first.
// Returns the last sample plus the peak flat value seen along the way.
async function walk(key, { untilX = null, untilZ = null, untilFlatBelow = null, maxMs = 20000, pollMs = 45 } = {}) {
  await page.keyboard.down(key);
  const t0 = Date.now(); let peak = 0, d = { x: null, z: null, flat: 0 };
  while (Date.now() - t0 < maxMs) {
    d = await page.evaluate(() => ({ x: window.__DA.pos[0], z: window.__DA.pos[2], flat: window.__DA.flat }));
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

await page.evaluate(() => window.__DA.jump3d());
await setPos(9, -12.5);
await page.waitForTimeout(300);
if ((await DA('region')) !== 'thin') errors.push('did not land in the thin region at its entrance');
await page.screenshot({ path: shotDir + 'thin-00-entrance.png' });

// ---- item 1: twin reeds must not skip the region. Run straight through
// both twins (they sit on x=6.4/6.0, well off the actual corridor) and
// confirm no core teleport (`tps`) and no slot/goal progress leaked from
// it. Done first, while slotsPassed/done are still at their initial state. ----
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

// ---- item 2: a full-size straight run must actually hit a wall — off the
// corridor's z-line (z=-20), out of every column's reach (columns sit on
// z=-16, r=1.5), running east into wall A (x=11.0) ----
await setPos(9, -20);
await page.waitForTimeout(150);
let r = await walk('ArrowUp', { untilX: x => x >= 10.85, maxMs: 6000 }); // unreachable if actually blocked
console.log('full size run into wall A (off column reach): x=' + r.x.toFixed(2) + ' flat=' + r.flat.toFixed(2));
if (r.x > 11.0 + 0.1) errors.push('wall A did not block a full-size, never-flattened player (crossed to x=' + r.x.toFixed(2) + ')');
if (r.flat > .3) errors.push('player was unexpectedly flat during the off-column wall test');
let st = await thinState();
if (st.wallHits <= 0) errors.push('wallHits did not register the block (wallHits=' + st.wallHits + ')');
if (st.slotsPassed !== 0) errors.push('slotsPassed advanced without ever passing a slot (' + st.slotsPassed + ')');

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

// ---- go flat via the column, pass both slots for real ----
await setPos(9, -12.5);
await page.waitForTimeout(150);
r = await walk('ArrowLeft', { untilZ: z => z <= -14.6, maxMs: 20000 }); // most of the way north
const turnZ = await nudgeZ(-16, 0.3); // then settle exactly onto the corridor's line before turning east
console.log('at the turn: z=' + turnZ.toFixed(2) + ' flat=' + (await DA('flat')).toFixed(2));
r = await walk('ArrowUp', { untilX: x => x >= 10.6, maxMs: 20000 }); // approach wall A's opening
await page.screenshot({ path: shotDir + 'thin-02-slot.png' }); // the disc, flat, framed by wall A's slot
r = await walk('ArrowUp', { untilX: x => x >= 17.0, maxMs: 30000 }); // on through column B and wall B
st = await thinState();
console.log('after both slots:', JSON.stringify(st), 'x=', r.x.toFixed(2));
if (st.slotsPassed < 2) errors.push('did not pass both slots (slotsPassed=' + st.slotsPassed + ')');
if (!st.walls[0].passed || !st.walls[1].passed) errors.push('wall debug state not marked passed: ' + JSON.stringify(st.walls));

// ---- the impossible moment: falls in at full size (off the column line,
// so the approach is never flat; positioned past both walls already, since
// walking there at full size would just be blocked by them again) ----
await setPos(18, -20);
// flatness from the slot crossing just above decays on a hold timer, not
// instantly on teleport — wait it out so this approach is genuinely full-size
{ const t0 = Date.now(); while (Date.now() - t0 < 3000 && (await DA('flat')) > .05) await page.waitForTimeout(100); }
// held manually (not via walk()) and released the instant the fall is
// observed — the freeze during the 0.6s fall holds position regardless of
// input, but still holding "forward" after the reset would just walk
// straight back into the gap and fall again
await page.keyboard.down('ArrowUp');
{
  const t0 = Date.now(); let sawFall = false;
  while (Date.now() - t0 < 9000) {
    const s = await thinState();
    if (s.fallActive) { sawFall = true; await page.screenshot({ path: shotDir + 'thin-03-gap-fallback.png' }); break; }
    await page.waitForTimeout(40);
  }
  if (!sawFall) errors.push('never observed fallActive while falling into the gap at full size');
}
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(900); // let the 0.6s freeze finish and the reset land, untouched
const posAfterFall = await page.evaluate(() => window.__DA.pos);
console.log('fell into the gap at full size, ended at x=' + posAfterFall[0].toFixed(2));
if (posAfterFall[0] > 21.0 - 0.1) errors.push('player was not put back on the near lip of the gap (x=' + posAfterFall[0].toFixed(2) + ')');
if (posAfterFall[0] < 21.0 - 0.7) errors.push('player did not actually fall in (x=' + posAfterFall[0].toFixed(2) + ')');

// ---- crosses the same gap with no trouble while flat ----
await setPos(19, -16); // column C
await page.waitForTimeout(800);
f = await DA('flat');
console.log('flat standing in column C:', f.toFixed(2));
if (f < .8) errors.push('column C did not flatten the player before the gap');
r = await walk('ArrowUp', { untilX: x => x >= 21.6, maxMs: 20000 }); // into the (hairline, while flat) gap itself
await page.screenshot({ path: shotDir + 'thin-04-gap-flat.png' });
r = await walk('ArrowUp', { untilX: x => x >= 22.5, maxMs: 20000 }); // on across the gap
console.log('past the gap, at x=' + r.x.toFixed(2));
if (r.x < 22.2) errors.push('did not cross the gap while flat (x=' + r.x.toFixed(2) + ')');

// ---- reach the goal ----
r = await walk('ArrowUp', { untilX: x => x >= 24.5, maxMs: 20000 });
const done = await thinDone();
console.log('done:', done, 'x=', r.x.toFixed(2));
if (!done) errors.push('region not marked done after reaching the goal light');
await page.screenshot({ path: shotDir + 'thin-05-goal.png' });

// ---- leaving the region resets the shared flat value, the veil and any
// prompt the region set ----
await setPos(35, 0); // well outside every region's bounds
await page.waitForTimeout(400);
{
  const flatNow = await DA('flat');
  const veilOp = await page.evaluate(() => getComputedStyle(document.getElementById('thin-veil')).opacity);
  // the core may show its own 'Follow the lights.' once the player has digested; only the region's prompt must be gone
  const promptTxt = await page.evaluate(() => { const e=document.getElementById('prompt'); return getComputedStyle(e).visibility==='hidden'?'':e.textContent; });
  const promptVis = promptTxt==='' || promptTxt==='Follow the lights.' ? 'hidden' : 'visible';
  console.log('after leaving: flat=' + flatNow + ' veilOpacity=' + veilOp + ' prompt="' + promptTxt + '"');
  if (flatNow !== 0) errors.push('flat did not reset to 0 after leaving the region (flat=' + flatNow + ')');
  if (Math.abs(parseFloat(veilOp)) > 0.001) errors.push('veil did not clear after leaving the region (opacity=' + veilOp + ')');
  if (promptVis !== 'hidden') errors.push('prompt still visible after leaving the region');
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
