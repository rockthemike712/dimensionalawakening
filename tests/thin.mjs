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
// for the gap — sits *off* the corridor's z-line entirely, so a straight
// run through A and B never triggers it; the gap is at x=24.0..25.4, and
// the goal at x=27.6. HOLD_TIME dropped from 0.8s to 0.25s so the carry
// drains between columns instead of lasting the whole corridor.
//
// Third-review layout (critic: REVISE). The rhythm/walls/gap/out-of-bounds
// fixes above all still pass; this round closes the region's edges:
//  - The entrance moved to (7,-14) so column A is on screen from the first
//    frame (item 6).
//  - Column C moved from (22,-18.6) to (23.4,-18.4) so it's on screen from
//    the put-back lip and a straight ArrowLeft from there crosses it
//    (item 4).
//  - Two open-field lanes that used to skirt the whole corridor (north
//    along z~-9.5..-11, south between the world clamp and BOUNDS.z0) are
//    now sealed (item 1); `debug().sealHits`/`debug().seal` expose the fix.
//  - Standing on the unearned goal now refuses, counted in
//    `debug().refusals` (item 2).
// See src/regions/thin.js for the full reasoning.
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

// Holds a single key (no diagonal aim) until `flat` clears `thresh` or
// `maxMs` elapses. Used for item 4: from the put-back lip, a *straight*
// ArrowLeft (pure -z) must pass inside column C's radius now that C sits
// at (23.4,-18.4), close in x to the lip (GAP_NEAR-.4 = 23.6).
async function holdUntilFlat(key, thresh = .8, maxMs = 6000) {
  await page.keyboard.down(key);
  const t0 = Date.now(); let d = await sample();
  while (Date.now() - t0 < maxMs) {
    d = await sample();
    if (d.flat >= thresh) break;
    await page.waitForTimeout(60);
  }
  await page.keyboard.up(key);
  await page.waitForTimeout(150);
  return d;
}

await page.evaluate(() => window.__DA.jump3d());
await setPos(7, -14);
await page.waitForTimeout(300);
if ((await DA('region')) !== 'thin') errors.push('did not land in the thin region at its entrance');
await page.screenshot({ path: shotDir + 'thin-00-entrance.png' });

// ---- item 6: from the entrance, column A must be the first thing seen —
// its world point projects inside the 390px-wide viewport, not off the
// left edge. ----
{
  const p = await page.evaluate(() => window.__DA.project(9, 0, -16));
  console.log('item 6 project(9,0,-16) from entrance: x=' + p.x.toFixed(1) + ' y=' + p.y.toFixed(1));
  if (p.x < 0 || p.x > 390) errors.push('column A does not project on screen from the entrance (x=' + p.x.toFixed(1) + ')');
}

// ---- item 2: standing on the unearned goal refuses, once per approach,
// counted in debug().refusals. Done here, before any slot/gap progress,
// so "unearned" is unambiguous. ----
{
  await setPos(27.6, -16); // the goal, exactly
  await page.waitForTimeout(250);
  let s = await thinState();
  const firstRefusals = s.refusals;
  console.log('refusal check: refusals after first approach=' + firstRefusals + ' done=' + (await thinDone()));
  if (firstRefusals < 1) errors.push('standing on the unearned goal did not register a refusal (refusals=' + firstRefusals + ')');
  if (await thinDone()) errors.push('the region finished by merely standing on the unearned goal');
  await page.screenshot({ path: shotDir + 'thin-goal-refuses.png' });
  await page.waitForTimeout(300);
  s = await thinState();
  if (s.refusals !== firstRefusals) errors.push('standing still on the unearned goal refused more than once (refusals=' + s.refusals + ')');
  // step well away (past the hysteresis band) and back: a fresh approach
  // refuses again. (27.6,-20), not (24,-16): the latter sits inside the
  // gap's own x-span (24.0..25.4) and, full-size, would fall in (item 5).
  await setPos(27.6, -20);
  await page.waitForTimeout(200);
  await setPos(27.6, -16);
  await page.waitForTimeout(250);
  s = await thinState();
  if (s.refusals <= firstRefusals) errors.push('a second approach to the unearned goal did not refuse again (refusals=' + s.refusals + ')');
}

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
// z=-16, and column C sits on z=-18.4 but far away in x), running east
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

// ---- item 2's own verify, revised for item 1's seal: rules must still
// stop dead at the region's drawn z-extent for the segment that is *not*
// sealed — west of wall A (x < SEAL_X0 = 10.5), z=-10 stays exactly as
// untouched as before. East of wall A that same z=-10 line is now
// deliberately sealed (item 1), so a run starting inside that span no
// longer sails through to x=26 free; it gets pulled back into bounds and
// registers a seal hit instead. ----
{
  await setPos(6, -10); // well west of SEAL_X0 (10.5) and of wall A (11.0)
  await page.waitForTimeout(120);
  // stop with a comfortable margin short of SEAL_X0 (10.5) — headless can
  // render a single low-fps frame over a unit long, and this sub-test's
  // whole point is that the seal has NOT fired yet on this side of it.
  const run = await walk('ArrowUp', { untilX: x => x >= 8.5, maxMs: 6000 });
  const s = await thinState();
  console.log('open-field run from (6,-10), west of the seal: x=' + run.x.toFixed(2) + ' sealHits=' + s.sealHits);
  if (run.x < 8.3) errors.push('an invisible wall stopped movement in the open field west of the seal at z=-10 (x=' + run.x.toFixed(2) + ')');
  if (s.fallActive) errors.push('fallActive was left true after an open-field run at z=-10');
  if (s.sealHits > 0) errors.push('the seal fired west of its own span (x<' + s.seal.x0 + ') — sealHits=' + s.sealHits);
}
{
  // z=-10 is open field between Thin and the Corner: the seal is a wall on the
  // line z=-11, never a pull. Walking east along z=-10 must be free and must
  // never enter the region.
  await setPos(20, -10);
  await page.waitForTimeout(120);
  const run = await walk('ArrowUp', { untilX: x => x >= 26.2, maxMs: 8000 });
  const s = await thinState(); const reg = await page.evaluate(() => window.__DA.region);
  console.log('open-field run along z=-10: x=' + run.x.toFixed(2) + ' z=' + run.z.toFixed(2) + ' region=' + reg + ' sealHits=' + s.sealHits);
  if (run.x < 26.0) errors.push('walking the open field at z=-10 was stopped (x=' + run.x.toFixed(2) + ')');
  if (run.z < -10.9) errors.push('the seal pulled the player inside from z=-10 (z=' + run.z.toFixed(2) + ')');
  if (reg === 'thin') errors.push('walking at z=-10 put the player inside Thin');
}

// ---- the two flank repros: a crossing of the line is blocked, from either side, with a thud and a ripple ----
{
  // north: from (27.6,-9.5) holding ArrowLeft (-z) toward the goal: stopped at the line, never inside
  await setPos(27.6, -9.5);
  await page.waitForTimeout(400);
  let pos = await sample(); const reg0 = await page.evaluate(() => window.__DA.region);
  if (Math.abs(pos.z + 9.5) > .05) errors.push('standing beside the flank moved the player (z=' + pos.z.toFixed(2) + ')');
  if (reg0 === 'thin') errors.push('standing at (27.6,-9.5) counted as inside Thin');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(3500);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(200);
  const s = await thinState();
  const done = await thinDone();
  pos = await sample(); const reg = await page.evaluate(() => window.__DA.region);
  console.log('north-flank repro: pos=(' + pos.x.toFixed(2) + ',' + pos.z.toFixed(2) + ') region=' + reg + ' slotsPassed=' + s.slotsPassed
    + ' gapCrossed=' + s.gapCrossed + ' sealHits=' + s.sealHits + ' done=' + done);
  if (pos.z < -11) errors.push('the north flank let the player cross the line (z=' + pos.z.toFixed(2) + ')');
  if (reg === 'thin') errors.push('the north-flank repro ended inside Thin');
  if (s.slotsPassed !== 0) errors.push('the north-flank repro advanced slotsPassed (' + s.slotsPassed + ')');
  if (done) errors.push('the region finished via the north-flank repro');
  if (s.sealHits <= 0) errors.push('the north-flank repro never registered a seal hit (sealHits=' + s.sealHits + ')');
  await page.screenshot({ path: shotDir + 'thin-north-flank-sealed.png' });
  // from inside the Corner, a step toward Thin is stopped at the line and the Corner keeps the player
  await setPos(20, -8.4);
  await page.waitForTimeout(300);
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(2000); await page.keyboard.up('ArrowLeft'); await page.waitForTimeout(200);
  pos = await sample(); const reg2 = await page.evaluate(() => window.__DA.region);
  console.log('from the Corner edge: pos=(' + pos.x.toFixed(2) + ',' + pos.z.toFixed(2) + ') region=' + reg2);
  if (pos.z < -11) errors.push('a step from the Corner crossed into Thin (z=' + pos.z.toFixed(2) + ')');
  if (reg2 === 'thin') errors.push('the Corner edge step ended inside Thin');
  await setPos(15, -11.3);
  await page.waitForTimeout(200);
  await page.screenshot({ path: shotDir + 'thin-north-flank-rail.png' });
}
{
  // south: setPos(9,-27.3) holding ArrowUp used to slide east between the
  // world clamp (-27.5) and BOUNDS.z0 (-27), past every wall's x-check.
  // Now the strip itself is stopped at the corridor's first wall: the seal
  // is a wall you cannot cross from either side, never a pull inside.
  await setPos(9, -27.3);
  await page.waitForTimeout(120);
  const run = await walk('ArrowUp', { untilX: x => x >= 30, maxMs: 8000 });
  const s = await thinState();
  const done = await thinDone();
  console.log('south-flank repro: x=' + run.x.toFixed(2) + ' z=' + run.z.toFixed(2) + ' sealHits=' + s.sealHits + ' wallHits=' + s.wallHits + ' done=' + done);
  if (run.x >= 12) errors.push('the south-flank repro was not blocked at wall A (reached x=' + run.x.toFixed(2) + ')');
  if (s.sealHits <= 0) errors.push('the south-flank repro never registered a seal hit (sealHits=' + s.sealHits + ')');
  if (run.z > -27) errors.push('the south strip pulled the player inside (z=' + run.z.toFixed(2) + ')');
  if (s.slotsPassed !== 0) errors.push('the south-flank repro advanced slotsPassed (' + s.slotsPassed + ')');
  if (done) errors.push('the region finished via the south-flank repro');
}

// ---- item 3: a flat player misaligned with the slot must never be told
// to flatten — the rails light and a ripple points toward the slot
// instead. setPos(9,-17.2) sits inside column A's radius (centre 9,-16,
// r=1.5) but off wall A's slot (|z-slotZ|=1.2 > half=.75). ----
{
  await setPos(9, -17.2);
  await page.waitForTimeout(150);
  const t0 = Date.now(); let flatNow = 0;
  while (Date.now() - t0 < 4000) {
    flatNow = await DA('flat');
    if (flatNow >= .95) break;
    await page.waitForTimeout(60);
  }
  console.log('item 3 setup: flat=' + flatNow.toFixed(2));
  if (flatNow < .9) errors.push('column A did not flatten the player for the item 3 setup (flat=' + flatNow.toFixed(2) + ')');

  await page.keyboard.down('ArrowUp');
  let sawFlatten = false, sawHint = false;
  const t1 = Date.now();
  while (Date.now() - t1 < 12000) {
    const promptTxt = await page.evaluate(() => document.getElementById('prompt').textContent);
    if (promptTxt === 'Flatten first.') sawFlatten = true;
    const s = await thinState();
    if (s.walls[0].hintOn) sawHint = true;
    if (!sawHint) await page.waitForTimeout(150); else await page.waitForTimeout(300);
  }
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(150);
  console.log('item 3: sawFlatten=' + sawFlatten + ' sawHint=' + sawHint);
  if (sawFlatten) errors.push('a flat, misaligned player was told to "Flatten first."');
  if (!sawHint) errors.push('a flat, misaligned player stuck at the wall never got the rail/ripple hint (hintOn)');
  await page.screenshot({ path: shotDir + 'thin-flat-misaligned-hint.png' });
}

// ---- item 5: the trench's containment is checked every frame, not only
// on the frame a player crosses into it. Teleport straight inside the
// gap's x-span at full size (off any column's reach) — even with zero
// velocity, standing there must still fall. ----
{
  // neutral stop first — away from every column and wall — so any
  // leftover flatness (item 3's wall-hint sustain keeps it elevated while
  // parked at a wall) fully settles to 0 before the actual teleport,
  // keeping this test unambiguous: full-size, then dropped into the gap.
  await setPos(9, -25);
  await page.waitForTimeout(500);
  await setPos(24.7, -20); // inside GAP_NEAR(24.0)..GAP_FAR(25.4), off the corridor's z-line
  await page.waitForTimeout(120);
  const flatOnDrop = await DA('flat');
  let fell = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) {
    const s = await thinState();
    if (s.fallActive) { fell = true; break; }
    await page.waitForTimeout(50);
  }
  console.log('item 5: flat-on-teleport=' + flatOnDrop.toFixed(2) + ' fell=' + fell);
  if (flatOnDrop > .3) errors.push('player was unexpectedly flat for the item 5 containment test (flat=' + flatOnDrop.toFixed(2) + ')');
  if (!fell) errors.push('stopping full-size inside the gap span did not trigger a fall (containment is not checked every frame)');
  await page.waitForTimeout(700); // let the fall resolve before moving on
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

// item 4: the put-back point itself — column C (23.4,-18.4) should be
// flaring right now, and on screen (it sits close in x to the put-back
// lip at GAP_NEAR-.4 = 23.6).
{
  const s = await thinState(); const pos = await sample();
  console.log('put-back point: pos=(' + pos.x.toFixed(2) + ',' + pos.z.toFixed(2) + ') colCFlareOn=' + s.colCFlareOn);
  if (!s.colCFlareOn) errors.push('column C did not flare after the put-back (colCFlareOn=' + s.colCFlareOn + ')');
  await page.screenshot({ path: shotDir + 'thin-put-back-column-c.png' });
}

// item 4's real check: a *straight* ArrowLeft (pure -z, no diagonal aim)
// from the put-back lip must pass inside column C's radius on its own —
// the old column (22,-18.6) needed a diagonal nudge to reach at all.
const nearC = await holdUntilFlat('ArrowLeft', .8, 6000);
await logSample('near-C');
if (nearC.flat < .8) errors.push('a straight ArrowLeft from the put-back lip did not reach column C (flat=' + nearC.flat.toFixed(2) + ')');
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
// lit and the beam is on, but not yet collected. 26.0, not GOAL_X()-3
// (24.6): the latter sits inside the gap's own x-span (24.0..25.4), and by
// this point flat has likely decayed — landing there full-size would fall
// in again (item 5), even though the crossing already happened.
function GOAL_X() { return 27.6; }
function CZ_Z() { return -16; }
if (!st.goalReached) {
  await nudgeToward(26.0, CZ_Z(), { thresh: 999, tol: .4, maxMs: 8000 });
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

// ---- the goal payoff, first pass: confirm the mechanism settles. The
// narrative run above reaches the goal through several generous, Node-side
// polling loops (each an `await page.evaluate(...)` round trip) — on this
// host, under whatever concurrent load other agents are putting on the
// shared CPU, a single such round trip has been observed to itself take
// multiple real seconds, which is longer than the entire ~2.75s look-back
// + sink cycle. By the time this loop's own polling notices `goalReached`,
// the look-back can already be over. That's a property of this specific
// detection method, not of the feature, so the strict "still sinking,
// wall B on screen" proof is redone below with a tighter, in-page detector
// — this first check only confirms the sink eventually settles. ----
{
  const t0 = Date.now(); let wr = (await thinState()).wallsRetired;
  while (Date.now() - t0 < 6000 && wr < .9) { await page.waitForTimeout(50); wr = (await thinState()).wallsRetired; }
  console.log('wallsRetired after the goal (Node-side poll): ' + wr);
  await page.screenshot({ path: shotDir + 'thin-goal-payoff-settled.png' });
  if (wr < .9) errors.push('wallsRetired did not reach ~1 within a bounded poll after the goal (wallsRetired=' + wr + ')');
}

// ---- the goal payoff, second pass: the actual look-back proof. Jumps
// straight to "one step short of the goal" via applySave (slots and the
// gap already earned, exactly like tests/act1.mjs's saveWith) so the whole
// slow corridor gauntlet above isn't repeated, then takes that last step
// and detects `goalReached` with `page.waitForFunction` — evaluated
// in-page on every animation frame by Playwright itself, not via a Node
// round trip per check — to react as close to the true moment as this
// host allows. Confirms: the walls are still visibly sinking sometime
// after the goal (wallsRaw>0, wallsRaw<1.3 i.e. not decayed away), wall B
// (normally behind the camera at the goal) is actually inside the 390x844
// frame while that's true, and it eventually settles. ----
{
  await page.evaluate(d => window.__DA.applySave(d), {
    crossed: true, seeds: 3, awakened: .7, roomFold: 0, pos: [26.6, 0, -16], place: 'THIN',
    s2: { done: 0, round: 0, arrived: false, active: false }, visited: ['thin'], t: Date.now(),
    regions: { thin: { slotsPassed: 2, goalReached: false, gapCrossed: true, wallsPassed: [true, true] } },
  });
  await page.waitForTimeout(200);

  await page.keyboard.down('ArrowUp');
  let reachedGoal = true;
  try {
    await page.waitForFunction(() => window.__DA.regions.find(r => r.id === 'thin').state.goalReached, { timeout: 8000, polling: 'raf' });
  } catch { reachedGoal = false; }
  if (!reachedGoal) errors.push('the dedicated look-back repro never reached the goal within a bounded poll');

  // wait past the point wallsRaw first ticks up to where the look-back's
  // camera turn has actually finished ramping in (~0.45s of its own turn,
  // see `sinceLook` in debug()) — catching the very first instant the
  // spring moves is too early: the camera itself hasn't rotated yet then.
  let sawMidSink = true, mid = null;
  try {
    await page.waitForFunction(() => { const s = window.__DA.regions.find(r => r.id === 'thin').state; return s.sinceLook >= .5; }, { timeout: 5000, polling: 'raf' });
    mid = await thinState();
  } catch { sawMidSink = false; }
  await page.keyboard.up('ArrowUp');

  const wallB = await page.evaluate(() => window.__DA.project(20.3, 1.2, -16));
  const onScreen = (p) => p.x >= 0 && p.x <= 390 && p.y >= 0 && p.y <= 844;
  console.log('look-back repro: sawMidSink=' + sawMidSink + ' mid=' + JSON.stringify(mid) + ' wallB=' + JSON.stringify(wallB));
  await page.screenshot({ path: shotDir + 'thin-goal-payoff-lookback.png' });

  if (!sawMidSink) errors.push('never caught the look-back mid-turn after the goal (sinceLook never reached .5 within a bounded poll)');
  else if (!onScreen(wallB)) errors.push('wall B was not in frame while the walls were still sinking (project=' + JSON.stringify(wallB) + ') — the look-back is not turning the camera in time with the sink');

  const t1 = Date.now(); let wr2 = (await thinState()).wallsRetired;
  while (Date.now() - t1 < 6000 && wr2 < .9) { await page.waitForTimeout(50); wr2 = (await thinState()).wallsRetired; }
  if (wr2 < .9) errors.push('the dedicated repro never settled (wallsRetired=' + wr2 + ')');

  // constrain must agree: walking back west through the corridor from the
  // goal must not be blocked by a wall or the gap that are no longer there.
  await setPos(GOAL_X(), CZ_Z());
  await page.waitForTimeout(200);
  const back = await walk('ArrowDown', { untilX: x => x <= 9.2, maxMs: 25000 }); // ArrowDown is -x in 3D
  console.log('walk back west after the goal: x=' + back.x.toFixed(2) + ' z=' + back.z.toFixed(2));
  if (back.x > 9.5) errors.push('could not walk back west through the retired corridor to x~9 (stopped at x=' + back.x.toFixed(2) + ', z=' + back.z.toFixed(2) + ')');
  await page.screenshot({ path: shotDir + 'thin-walkback.png' });
}

// ---- load(d): a Continue of an already-finished Thin must land fully
// retired immediately — no replayed look-back/sink, no walls left standing.
// Mirrors tests/act1.mjs's saveWith({thin:true}). ----
{
  const applied = await page.evaluate(d => window.__DA.applySave(d), {
    crossed: true, seeds: 3, awakened: .7, roomFold: 0, pos: [7, 0, -14], place: 'THIN',
    s2: { done: 0, round: 0, arrived: false, active: false }, visited: ['thin'], t: Date.now(),
    regions: { thin: { slotsPassed: 2, goalReached: true, gapCrossed: true, wallsPassed: [true, true] } },
  });
  if (!applied) errors.push('applySave(thin goalReached) was refused');
  await page.waitForTimeout(200);
  const s = await thinState();
  console.log('applySave(goalReached=true): wallsRetired=' + s.wallsRetired);
  if (s.wallsRetired !== 1) errors.push('a Continue of a finished Thin did not land fully retired (wallsRetired=' + s.wallsRetired + '), it should never replay the sink');
}

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
