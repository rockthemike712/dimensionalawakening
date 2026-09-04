// Records a silent ~11s clip of the BLOOM zone at phone size. Drives the
// player along a smooth spline (setPos each frame, which also carves the
// trail) so the motion is cinematic despite headless render speed.
//   node tools/record.mjs <outdir>
// Produces <outdir>/*.webm ; convert with ffmpeg (see the report).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync, readdirSync, renameSync } from 'fs';
const OUT = process.argv[2] || '/tmp/bloom-vid';
mkdirSync(OUT, { recursive: true });
const BASE = process.env.DA_BASE || 'http://localhost:8901';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  recordVideo: { dir: OUT, size: { width: 390, height: 844 } },
});
const page = await ctx.newPage();
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.evaluate(() => window.__DA.jump3d());
// hush the core's tutorial prompt for a clean recording
await page.evaluate(() => { const p = document.getElementById('prompt'); if (p) p.style.visibility = 'hidden'; });
const setPos = (x, z) => page.evaluate(([x, z]) => window.__DA.setPos(x, z), [x, z]);

// a spline through the arena: enter from the SW, sweep a big S carving a
// trench, drift among the blooms, settle near the centre.
const key = [
  [27, 11], [30, 14], [34, 17], [36, 21], [34, 24], [31, 25],
  [30, 21], [31, 17], [33, 15], [33, 18], [33, 18],
];
function sample(u) { // catmull-rom through key points
  const n = key.length - 1, s = Math.min(0.9999, Math.max(0, u)) * n, i = Math.floor(s), f = s - i;
  const p0 = key[Math.max(0, i - 1)], p1 = key[i], p2 = key[Math.min(n, i + 1)], p3 = key[Math.min(n, i + 2)];
  const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
  return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])];
}
await setPos(...sample(0));
await page.waitForTimeout(600);
const DUR = 10500, FR = 33, t0 = Date.now();
while (Date.now() - t0 < DUR) {
  const u = (Date.now() - t0) / DUR;
  const [x, z] = sample(u);
  await setPos(x, z);
  await page.waitForTimeout(FR);
}
await page.waitForTimeout(400);
await ctx.close(); // flush the video
await browser.close();
// name the produced file predictably
for (const f of readdirSync(OUT)) if (f.endsWith('.webm')) { renameSync(OUT + '/' + f, OUT + '/bloom.webm'); break; }
console.log('video at ' + OUT + '/bloom.webm');
