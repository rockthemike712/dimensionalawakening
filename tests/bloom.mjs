// BLOOM — the visual-experience zone east of Lamp. Not a puzzle: this test
// only guarantees the prototype is reachable, does not throw, keeps the
// avatar readable (on the surface, never sunk), remembers the walk as a
// persistent deformation that then heals, stays hidden from afar so Act I is
// untouched, and survives save/load. See src/regions/bloom.js.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto((process.env.DA_BASE || 'http://localhost:8901') + '/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

const setPos = (x, z) => page.evaluate(([x, z]) => window.__DA.setPos(x, z), [x, z]);
const st = () => page.evaluate(() => window.__DA.regions.find(r => r.id === 'bloom').state);
const region = () => page.evaluate(() => window.__DA.region);
const check = (c, m) => { if (!c) errors.push(m); };

await page.evaluate(() => window.__DA.jump3d());
await page.waitForTimeout(400);

// ---- the arena is built after the crossing, but invisible from across the
// field: Act I is not to be disturbed by a glow on the horizon. ----
await setPos(6, -14);            // far away, over by Thin
await page.waitForTimeout(400);
{
  const s = await st();
  check(s !== undefined, 'the bloom region did not build after the crossing');
  check(s && s.visible === false, 'the arena is visible from across the field (should hide until near): ' + JSON.stringify(s));
}

// ---- walk in: it becomes the current region, comes alive, and the avatar
// rides ON the surface (a readable, positive height — never sunk). ----
await setPos(33, 18);
await page.waitForTimeout(1200);
check((await region()) === 'bloom', 'standing in the arena did not enter the bloom region');
{
  const s = await st();
  check(s.visible === true, 'the arena did not become visible when entered');
  check(s.gate > 0.6, 'the arena did not come alive on arrival (gate=' + s.gate + ')');
  check(s.entered === true, 'entering did not set entered');
  check(s.playerY > -0.05, 'the avatar sank below the surface — it must stay readable on top (playerY=' + s.playerY + ')');
  check(s.playerY < 0.6, 'the avatar floated implausibly high above the surface (playerY=' + s.playerY + ')');
}

// ---- the field remembers the walk: carve a trench and the trail rises. The
// probe samples a fixed point near the SW corner (28,12). ----
await setPos(28, 12);
await page.waitForTimeout(300);
// carve through the probe point, then on across the arena (each frame stamps)
for (let i = 0; i <= 24; i++) { await setPos(28 + i * 0.45, 12 + i * 0.5); await page.waitForTimeout(45); }
await page.waitForTimeout(200);
{
  const s = await st();
  console.log('carved: trailPeak=' + s.trailPeak + ' probe=' + s.probe);
  check(s.trailPeak > 0.5, 'walking did not carve a persistent deformation (trailPeak=' + s.trailPeak + ')');
  check(s.probe > 0.4, 'the carved path did not register at the probe point (probe=' + s.probe + ')');
}

// ---- and it heals: stand at the FAR end (still in the arena, so the heal
// keeps running) and the probe point we walked away from decays. ----
await setPos(38, 24);
const before = (await st()).probe;
await page.waitForTimeout(6000);
const after = (await st()).probe;
console.log('probe heal: ' + before + ' -> ' + after);
check(after < before - 0.05, 'the carved trail did not heal over time (probe ' + before + ' -> ' + after + ')');

// ---- leaving the arena: it goes quiet and hides again when far. ----
await setPos(10, 0);             // back into the Corner's neighbourhood, far from bloom
await page.waitForTimeout(600);
check((await region()) !== 'bloom', 'still counted as inside bloom after walking well away');
{
  const s = await st();
  check(s.visible === false, 'the arena stayed visible after walking far away (visible=' + s.visible + ')');
}

// ---- save / load: entered persists (its beacon behaves on Continue). ----
{
  const saved = await page.evaluate(() => { window.__DA.save(); return window.__DA.loadSave(); });
  check(saved && saved.regions && saved.regions.bloom && saved.regions.bloom.entered === true,
    'the bloom region did not save its entered flag');
  const applied = await page.evaluate(d => window.__DA.applySave(d), {
    crossed: true, seeds: 3, awakened: 0.7, roomFold: 0, pos: [33, 0, 18], place: 'BLOOM',
    s2: { done: 0, round: 0, arrived: false, active: false }, visited: ['bloom'], t: Date.now(),
    regions: { bloom: { entered: true } },
  });
  check(applied, 'applySave with a bloom save was refused');
  await page.waitForTimeout(300);
  const s = await st();
  check(s.entered === true, 'Continue did not restore the bloom entered flag');
}

await browser.close();
if (errors.length) { console.log('\nERRORS:'); errors.forEach(e => console.log(' - ' + e)); process.exit(1); }
console.log('\nBLOOM OK');
