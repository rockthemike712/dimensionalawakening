// THIN — walk into a column of light, squash flat, fit through a 0.15-unit
// slot a full-size body can't, then walk flat straight over a gap that
// swallows you at full size. See docs/briefs/thin.md.
//
// Every obstacle sits on the fixed corridor line x=9, so movement here only
// ever needs one axis (ArrowLeft/ArrowRight, which move z in 3D) — no drift
// to correct for. Headless Chromium can run this at a fraction of real
// speed, so movement is driven by polling live state (window.__DA) until a
// position/flat condition is met, with a generous timeout, rather than by
// a fixed-duration hold.
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

// Holds `key` and polls live position/flat until `untilZ(z)` or
// `untilFlatBelow` is satisfied, or `maxMs` elapses — whichever first.
// Returns the last sample plus the peak flat value seen along the way.
async function walk(key, { untilZ = null, untilFlatBelow = null, maxMs = 20000, pollMs = 45 } = {}) {
  await page.keyboard.down(key);
  const t0 = Date.now(); let peak = 0, d = { z: null, flat: 0 };
  while (Date.now() - t0 < maxMs) {
    d = await page.evaluate(() => ({ z: window.__DA.pos[2], flat: window.__DA.flat }));
    peak = Math.max(peak, d.flat);
    if (untilZ && untilZ(d.z)) break;
    if (untilFlatBelow != null && d.flat < untilFlatBelow) break;
    await page.waitForTimeout(pollMs);
  }
  await page.keyboard.up(key);
  await page.waitForTimeout(150);
  return { z: d.z, flat: d.flat, peak };
}

await page.evaluate(() => window.__DA.jump3d());
await setPos(9, -12.5);
await page.waitForTimeout(300);
if ((await DA('region')) !== 'thin') errors.push('did not land in the thin region at its entrance');

// ---- the toy: walk into the first column, squash flat with a visible overshoot ----
let r = await walk('ArrowLeft', { untilZ: z => z <= -15.3, maxMs: 20000 }); // entrance -> past column A's centre
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

// ---- the rule: a full-size player cannot pass a slot ----
// off the corridor line (x=15), well outside every column's reach
await setPos(15, -15.0);
await page.waitForTimeout(150);
r = await walk('ArrowLeft', { untilZ: z => z <= -16.6, maxMs: 4000 }); // unreachable if blocked; proves the block
console.log('full size at wall A (off-slot): z=' + r.z.toFixed(2) + ' flat=' + r.flat.toFixed(2));
if (r.z < -16.2 - 0.1) errors.push('wall A did not block a full-size player (crossed to z=' + r.z.toFixed(2) + ')');
if (r.flat > .3) errors.push('player was unexpectedly flat during the off-slot block test');
await page.screenshot({ path: shotDir + 'thin-02-slot-blocked.png' });

// ---- go flat via the column, pass both slots for real ----
await setPos(9, -12.5);
await page.waitForTimeout(150);
r = await walk('ArrowLeft', { untilZ: z => z <= -20.6, maxMs: 30000 }); // through column A, wall A, column B, past wall B
let st = await thinState();
console.log('after both slots:', JSON.stringify(st), 'z=', r.z.toFixed(2));
if (st.slotsPassed < 2) errors.push('did not pass both slots (slotsPassed=' + st.slotsPassed + ')');
if (!st.walls[0].passed || !st.walls[1].passed) errors.push('wall debug state not marked passed: ' + JSON.stringify(st.walls));

// ---- the impossible moment: falls in at full size ----
await setPos(15, -22.0); // off the corridor, before the gap, full size
await page.waitForTimeout(150);
r = await walk('ArrowLeft', { untilZ: z => z <= -23.2, maxMs: 10000 }); // unreachable if it actually falls and resets
console.log('fell into the gap at full size, ended at z=' + r.z.toFixed(2));
await page.screenshot({ path: shotDir + 'thin-03-gap-fallback.png' });
if (r.z < -22.4 - 0.15) errors.push('player was not put back on the near lip of the gap (z=' + r.z.toFixed(2) + ')');
if (r.z > -22.4 + 0.6) errors.push('player did not actually fall in (z=' + r.z.toFixed(2) + ')');

// ---- crosses the same gap with no trouble while flat ----
await setPos(9, -21.6); // column C
await page.waitForTimeout(800);
f = await DA('flat');
console.log('flat standing in column C:', f.toFixed(2));
if (f < .8) errors.push('column C did not flatten the player before the gap');
await page.screenshot({ path: shotDir + 'thin-04-gap-flat.png' });
r = await walk('ArrowLeft', { untilZ: z => z <= -24.2, maxMs: 20000 }); // straight across the gap
console.log('past the gap, at z=' + r.z.toFixed(2));
if (r.z > -23.6) errors.push('did not cross the gap while flat (z=' + r.z.toFixed(2) + ')');

// ---- reach the goal ----
r = await walk('ArrowLeft', { untilZ: z => z <= -25.4, maxMs: 20000 });
const done = await thinDone();
console.log('done:', done, 'z=', r.z.toFixed(2));
if (!done) errors.push('region not marked done after reaching the goal light');
await page.screenshot({ path: shotDir + 'thin-05-goal.png' });

// ---- save / reload / restore ----
await page.evaluate(() => window.__DA.save());
const saved = await page.evaluate(() => window.__DA.loadSave());
console.log('saved thin state:', JSON.stringify(saved.regions.thin));
await page.evaluate(d => { window.__DA.clearSave(); window.__DA.applySave(d); }, saved);
await page.waitForTimeout(300);
st = await thinState();
const doneAfter = await thinDone();
console.log('after applySave:', JSON.stringify(st), 'done=', doneAfter);
if (st.slotsPassed < 2 || !doneAfter) errors.push('save/load did not restore thin region progress');

await browser.close();
if (errors.length) { console.log('\nERRORS:'); errors.forEach(e => console.log(' - ' + e)); process.exit(1); }
console.log('\nTHIN OK');
