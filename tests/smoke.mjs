import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const errors = [];
const browser = await chromium.launch();
async function testPage(url, opts, fn) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`[${url}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${url}] console: ${m.text()}`); });
  await page.goto(url, { waitUntil: 'networkidle' }); await fn(page); await ctx.close();
}
// ---- Test 0 ----
await testPage((process.env.DA_BASE||'http://localhost:8901')+'/test0.html', { viewport:{width:390,height:844}, hasTouch:true, isMobile:true }, async page => {
  const before = await page.$eval('#player', el => el.getBoundingClientRect().left);
  let won=false; for (let i=0;i<4&&!won;i++){ await page.tap('#bR'); await page.waitForTimeout(250);
    won = await page.$eval('#win', el => getComputedStyle(el).display !== 'none'); }
  const after = await page.$eval('#player', el => el.getBoundingClientRect().left);
  console.log(`TEST0: player x ${before.toFixed(0)} -> ${after.toFixed(0)}, won=${won}`);
  if (after-before<50) errors.push('TEST0: player did not move visibly'); if(!won) errors.push('TEST0: goal not reached');
});
// ---- mobile taps ----
await testPage((process.env.DA_BASE||'http://localhost:8901')+'/index.html', { viewport:{width:390,height:844}, hasTouch:true, isMobile:true }, async page => {
  await page.waitForTimeout(1500);
  for (let i=0;i<3;i++){ await page.tap('#right'); await page.waitForTimeout(300); }
  const status = await page.textContent('#moveStatus'); console.log(`GAME mobile: moveStatus="${status}"`);
  if (!/MOVEMENT 3/.test(status)) errors.push('GAME: move counter wrong: '+status);
});
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

  await driveTo(-3,-1); let st=await state(); console.log('2D: light 1:', JSON.stringify(st));
  if(st.s<1){errors.push('light 1 not collected');return;}
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(2500); await page.keyboard.up('ArrowRight');
  st=await state(); console.log('2D: pushing on edge:', JSON.stringify(st));
  if(st.p[0]>0||st.crossed){errors.push('edge did not block');return;}
  // fold: seam projects just right of screen centre in the top-down view
  await page.mouse.move(660,400); await page.mouse.down(); await page.mouse.move(100,400,{steps:25}); await page.mouse.up();
  await page.waitForTimeout(1500); st=await state(); console.log('2D: after fold:', JSON.stringify(st));
  if(st.f<.68){errors.push('fold below threshold');return;}
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(2500); await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(2600); st=await state(); console.log('CROSS: birth of depth:', JSON.stringify(st));
  if(!st.crossed||st.dim<.95){errors.push('crossing did not shift dimension');return;}
  // ---- free play: two lights to wander to, no arrow, no counter, no prompt ----
  await page.waitForTimeout(2500);
  let fp=await page.evaluate(()=>({arrow:window.__DA.arrow,counter:window.__DA.counterShown,digested:window.__DA.digested,next:window.__DA.next,region:window.__DA.region,prompt:document.getElementById('prompt').style.visibility}));
  console.log('FREE PLAY:',JSON.stringify(fp));
  if(fp.arrow)errors.push('arrow shown right after the crossing'); if(fp.counter)errors.push('counter shown in the field'); if(fp.digested)errors.push('digested too early');
  if(fp.region==='room')errors.push('the room exists before Act I is done');
  await driveTo(8,6); await driveTo(13,-6); await page.waitForTimeout(1500);
  st=await state(); console.log('3D: lights:', JSON.stringify(st));
  if(st.s<3){errors.push('lights 2/3 not collected in 3D');return;}
  const s2now=await page.evaluate(()=>window.__DA.s2); if(s2now.active)errors.push('the room started on the third light');
  // ---- digested: the arrow points at Thin, the first rung ----
  await page.evaluate(()=>window.__DA.digest()); await page.waitForTimeout(800);
  fp=await page.evaluate(()=>({arrow:window.__DA.arrow,next:window.__DA.next,prompt:document.getElementById('prompt').textContent}));
  console.log('DIGESTED:',JSON.stringify(fp));
  if(!fp.arrow)errors.push('no arrow after digesting'); if(fp.next!=='thin')errors.push('next rung is not thin: '+fp.next);
  await driveTo(9,-12.5,25000); await page.waitForTimeout(800);
  const reg=await page.evaluate(()=>window.__DA.region); console.log('at the Thin entrance: region='+reg);
  if(reg!=='thin')errors.push('did not arrive in thin: '+reg);
});
await browser.close();
if(errors.length){console.log('\nERRORS:');errors.forEach(e=>console.log(' - '+e));process.exit(1);}
console.log('\nALL SMOKE TESTS PASSED');
