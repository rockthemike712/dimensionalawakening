// Visual harness for the BLOOM prototype. Usage: node tools/shot.mjs <outdir>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'fs';
const OUT = process.argv[2] || '/tmp/bloom-shots';
mkdirSync(OUT, { recursive: true });
const BASE = process.env.DA_BASE || 'http://localhost:8901';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
const setPos = (x, z) => page.evaluate(([x, z]) => window.__DA.setPos(x, z), [x, z]);
const info = async () => page.evaluate(() => {
  const b = window.__DA.regions.find(r => r.id === 'bloom');
  const pr = window.__DA.project(window.__DA.pos[0], 0.3, window.__DA.pos[2]);
  return { region: window.__DA.region, pos: window.__DA.pos.map(v => +v.toFixed(1)), scr: { x: pr.x | 0, y: pr.y | 0 }, bloom: b && b.state };
});
const shot = async (n) => { console.log(n, JSON.stringify(await info())); await page.screenshot({ path: OUT + '/' + n + '.png' }); };
async function hold(keys, ms) { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of keys) await page.keyboard.up(k); await page.waitForTimeout(120); }

await page.evaluate(() => window.__DA.jump3d());
await page.waitForTimeout(400);

await setPos(20, 0); await page.waitForTimeout(600); await shot('00-field-baseline');

// arrive at the arena centre
await setPos(33, 18); await page.waitForTimeout(2200); await shot('01-arrival');
await page.waitForTimeout(1400); await shot('02-t1');

// carve a tight loop that stays in frame, then look at the glowing trail
await hold(['ArrowRight'], 900);
await hold(['ArrowUp'], 900);
await hold(['ArrowLeft'], 900);
await hold(['ArrowDown'], 900);
await shot('03-after-loop');
await page.waitForTimeout(300);
await setPos(33, 18); await page.waitForTimeout(500); await shot('04-trail-from-centre');

// stand and watch the world keep mutating and the gouges slowly heal
await page.waitForTimeout(2200); await shot('05-t2');
await page.waitForTimeout(2600); await shot('06-t3');

// walk up among the blooms for a close-up of forms morphing / dividing
await setPos(30, 18); await page.waitForTimeout(600);
await hold(['ArrowUp'], 1500); await shot('07-among-blooms');
await page.waitForTimeout(1600); await shot('08-among-blooms-t2');

// the signature: carve a long trench across the arena, then look back down it
await setPos(28, 11); await page.waitForTimeout(600);
await hold(['ArrowRight'], 5000);          // walk the full width (+z), gouging as we go
await shot('09-long-trail-end');
await setPos(28, 11); await page.waitForTimeout(600);   // stand at the start and look down the glowing trench
await shot('10-long-trail-lookdown');

if (errs.length) { console.log('ERRORS:'); errs.forEach(e => console.log(' - ' + e)); }
await browser.close();
console.log('shots in ' + OUT);
