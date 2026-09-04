// Final report frames for BLOOM. Writes the exact filenames the report
// references into docs/reviews/frames/bloom-prototype/. Prompt hidden for
// clean stills. node tools/frames.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'fs';
const OUT = new URL('../docs/reviews/frames/bloom-prototype/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.DA_BASE || 'http://localhost:8901';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
const setPos = (x, z) => page.evaluate(([x, z]) => window.__DA.setPos(x, z), [x, z]);
const hush = () => page.evaluate(() => { const p = document.getElementById('prompt'); if (p) p.style.visibility = 'hidden'; });
const shot = (n) => page.screenshot({ path: OUT + n + '.png' });
async function hold(keys, ms) { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of keys) await page.keyboard.up(k); await page.waitForTimeout(100); }

await page.evaluate(() => window.__DA.jump3d());
await page.waitForTimeout(400);
await hush();

// 00 — the plain field, for the before/after
await setPos(20, 0); await page.waitForTimeout(700); await hush(); await shot('00-field-baseline');

// 01 — arrival in the arena
await setPos(33, 18); await page.waitForTimeout(2400); await hush(); await shot('01-arrival');

// 05 — the rainbow bloom field (let forms morph a while)
await page.waitForTimeout(2600); await hush(); await shot('05-blooms');

// 07 — walk up among the blooms
await setPos(30, 18); await page.waitForTimeout(500);
await hold(['ArrowUp'], 1600); await hush(); await shot('07-among-blooms');

// T2 — a fresh crater under the avatar (stand and carve)
await setPos(33, 18); await page.waitForTimeout(1400); await hush(); await shot('T2-crater');

// T1 — a long carved trench: paint a line by stepping across the arena
await setPos(28, 11); await page.waitForTimeout(400);
for (let i = 0; i <= 40; i++) { const t = i / 40; await setPos(30 + Math.sin(t * 6.28) * 4, 11 + t * 15); await page.waitForTimeout(60); }
await setPos(28, 11); await page.waitForTimeout(500); await hush(); await shot('T1-long-trail');

console.log('frames written to ' + OUT);
await browser.close();
