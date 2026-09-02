// The room (Act II): unlocked directly, then the four patterns, the second edge, the tap toggle.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const errors = [];
const browser = await chromium.launch();
async function testPage(url, opts, fn) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`[${url}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${url}] console: ${m.text()}`); });
  await page.goto(url, { waitUntil: 'networkidle' }); await fn(page); await ctx.close();
}
// ---- (test 0 and the mobile tap check live in smoke.mjs) ----
// ---- desktop: full loop across both dimensions ----
await testPage((process.env.DA_BASE||'http://localhost:8901')+'/index.html', { viewport:{width:1280,height:800} }, async page => {
  await page.waitForTimeout(1200);
  const state = () => page.evaluate(() => ({ p: window.__DA.pos, f: window.__DA.fold, s: window.__DA.seeds, dim: window.__DA.dim, crossed: window.__DA.crossed }));
  const s2 = () => page.evaluate(() => window.__DA.s2);
  const ALL=['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'];
  // screen-relative input: in 2D up=-z right=+x; in 3D up=+x right=+z
  async function driveTo(tx, tz, timeoutMs=15000){
    const t0=Date.now();
    while(Date.now()-t0<timeoutMs){
      const {p,dim}=await state(); const dx=tx-p[0], dz=tz-p[2];
      if(Math.abs(dx)<.35&&Math.abs(dz)<.35)break;
      const ks=[];
      if(dim>.5){ if(dx>.3)ks.push('ArrowUp'); else if(dx<-.3)ks.push('ArrowDown'); if(dz>.3)ks.push('ArrowRight'); else if(dz<-.3)ks.push('ArrowLeft'); }
      else { if(dx>.3)ks.push('ArrowRight'); else if(dx<-.3)ks.push('ArrowLeft'); if(dz>.3)ks.push('ArrowDown'); else if(dz<-.3)ks.push('ArrowUp'); }
      for(const k of ks)await page.keyboard.down(k); await page.waitForTimeout(180); for(const k of ALL)await page.keyboard.up(k);
    }
  }
  async function waitFor(pred, ms, label){ const t0=Date.now(); let q;
    while(Date.now()-t0<ms){ q=await s2(); if(pred(q))return q; await page.waitForTimeout(500);} 
    errors.push('S2: timeout waiting for '+label+' — last '+JSON.stringify(q)); return q; }

  await page.evaluate(()=>{window.__DA.jump3d();window.__DA.unlockRoom();window.__DA.setPos(3.5,-3);}); await page.waitForTimeout(1500);
  let st=await state(); let q=await s2(); console.log('ROOM: unlocked', JSON.stringify(q), 'region='+await page.evaluate(()=>window.__DA.region));
  if(!q.active){errors.push('room did not start');return;}
  await driveTo(5.4,0); q=await waitFor(x=>x.done>=1,30000,'round 1 (piles) watching'); console.log('S2 r1:',JSON.stringify(q));
  await page.waitForTimeout(9000); q=await s2(); console.log('S2 negative:',JSON.stringify(q));
  if(q.done>=2)errors.push('stripes solved while standing close');
  await driveTo(2.2,-6); q=await waitFor(x=>x.done>=2,50000,'round 2 (stripes) far'); console.log('S2 r2:',JSON.stringify(q));
  await driveTo(5.2,1.6); await driveTo(6.6,1.6); q=await waitFor(x=>x.done>=3,40000,'round 3 (one) blocking'); console.log('S2 r3:',JSON.stringify(q),'prompt='+await page.textContent('#prompt'));
  // ---- round 4 must NOT complete with the edge unpulled, even standing far / stripes ----
  await page.waitForTimeout(2000);
  await driveTo(2.3,-5.4); await page.waitForTimeout(14000); q=await s2(); console.log('S2 r4 negative (unpulled, far):',JSON.stringify(q));
  if(q.done>=4)errors.push('round 4 completed without pulling the edge');
  // ---- the second edge: pull it (drag down on it), it latches; round 4 needs it ----
  const sp=await page.evaluate(()=>window.__DA.project(8.6,0.05,0));
  console.log('seam2 on screen at', JSON.stringify(sp));
  await page.mouse.move(sp.x,sp.y); await page.mouse.down(); await page.mouse.move(sp.x,sp.y+300,{steps:20}); await page.mouse.up();
  await page.waitForTimeout(1500);
  const rf=await page.evaluate(()=>window.__DA.roomFold); console.log('roomFold after drag:',rf.toFixed(2));
  if(rf<.9)errors.push('second edge did not latch after drag (roomFold='+rf+')');
  await driveTo(2.3,-5.4); q=await waitFor(x=>x.done>=4,45000,'round 4 (narrow stripes) far + pulled'); console.log('S2 r4:',JSON.stringify(q),'prompt='+await page.textContent('#prompt'));
  // tap on the edge toggles it off, tap again toggles it on (re-project: the camera moved with the player)
  await page.waitForTimeout(2000); const sp2=await page.evaluate(()=>window.__DA.project(8.6,0.05,0)); console.log('seam2 now at',JSON.stringify(sp2));
  await page.mouse.click(sp2.x,sp2.y); await page.waitForTimeout(1200);
  const rf2=await page.evaluate(()=>window.__DA.roomFold); console.log('roomFold after tap (toggle off):',rf2.toFixed(2));
  if(rf2>.2)errors.push('tap on the edge did not toggle it off');
  await page.mouse.click(sp2.x,sp2.y); await page.waitForTimeout(1200);
  const rf3=await page.evaluate(()=>window.__DA.roomFold); console.log('roomFold after second tap (toggle on):',rf3.toFixed(2));
  if(rf3<.8)errors.push('second tap did not toggle the edge back on');
});
await browser.close();
if(errors.length){console.log('\nERRORS:');errors.forEach(e=>console.log(' - '+e));process.exit(1);}
console.log('\nROOM OK');
