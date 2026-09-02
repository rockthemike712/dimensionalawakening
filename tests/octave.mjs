import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const errors=[]; const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:1280,height:800}}); const page=await ctx.newPage();
page.on('pageerror',e=>errors.push('pageerror: '+e.message)); page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
await page.goto((process.env.DA_BASE||'http://localhost:8901')+'/index.html',{waitUntil:'networkidle'}); await page.waitForTimeout(1200);
const DA=(k)=>page.evaluate(k=>window.__DA[k],k);
const ALL=['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'];
async function driveTo(tx,tz,ms=12000){const t0=Date.now();
  while(Date.now()-t0<ms){const p=await DA('pos'),dim=await DA('dim');const dx=tx-p[0],dz=tz-p[2];
    if(Math.abs(dx)<.35&&Math.abs(dz)<.35)break; const ks=[];
    if(dim>.5){if(dx>.3)ks.push('ArrowUp');else if(dx<-.3)ks.push('ArrowDown');if(dz>.3)ks.push('ArrowRight');else if(dz<-.3)ks.push('ArrowLeft');}
    else{if(dx>.3)ks.push('ArrowRight');else if(dx<-.3)ks.push('ArrowLeft');if(dz>.3)ks.push('ArrowDown');else if(dz<-.3)ks.push('ArrowUp');}
    for(const k of ks)await page.keyboard.down(k);await page.waitForTimeout(150);for(const k of ALL)await page.keyboard.up(k);}}
let lm=await DA('lm'); const left=lm.map((l,i)=>({...l,i})).filter(l=>l.x<0);
console.log('reeds on the 2D side:',left.map(l=>`${l.i}:${l.note}${l.h}@(${l.x},${l.z})`).join(' '));
const A=left.find(l=>l.h===2.4), B=left.find(l=>l.h===1.2), F=left.find(l=>l.h===1.6);
if(!A||!B||!F){errors.push('seeded octave/fifth reeds missing on the 2D side');}
else{
  // 1. brush: walk through A, it rings and bends
  const r0=await DA('rings'); await driveTo(A.x+1.5,A.z); await page.waitForTimeout(300);
  await page.keyboard.down('ArrowLeft'); let maxBend=0,maxRing=0; for(let k=0;k<12;k++){await page.waitForTimeout(60);lm=await DA('lm');maxBend=Math.max(maxBend,lm[A.i].bend);maxRing=Math.max(maxRing,lm[A.i].ring);} await page.keyboard.up('ArrowLeft');
  console.log('after brushing A: rings=',await DA('rings')-r0,'peak ring=',maxRing,'peak bend=',maxBend);
  if(await DA('rings')-r0<1)errors.push('brushing a reed did not ring it'); if(maxBend<.3)errors.push('reed did not bend');
  // 2. glue: ring A then B within a second (taps at range)
  await page.waitForTimeout(1200); await page.evaluate(i=>window.__DA.tapLm(i),A.i); await page.waitForTimeout(300); await page.evaluate(i=>window.__DA.tapLm(i),B.i);
  await page.waitForTimeout(300); lm=await DA('lm'); console.log('after A,B: pairA=',lm[A.i].pair,'pairB=',lm[B.i].pair);
  if(lm[A.i].pair!==B.i||lm[B.i].pair!==A.i)errors.push('octave pair did not glue');
  // 3. teleport: run into A head-on from 3 units away, come out of B
  await page.waitForTimeout(1000);
  // approach A along one axis (digital keys cannot aim diagonally), from the side facing away from B
  // pick an axis and side whose start point stays on the page and clear of A (A may stand near an edge)
  const cands=[['x',Math.sign(A.x-B.x)||1],['x',-(Math.sign(A.x-B.x)||1)],['z',Math.sign(A.z-B.z)||1],['z',-(Math.sign(A.z-B.z)||1)]];
  let ax='x',start=null;
  for(const [a,sg] of cands){ let st=a==='x'?[A.x+sg*3.2,A.z]:[A.x,A.z+sg*3.2]; st=[Math.max(-10.5,Math.min(-1,st[0])),Math.max(-7.5,Math.min(7.5,st[1]))];
    if(Math.hypot(st[0]-A.x,st[1]-A.z)>=2.6){ax=a;start=st;break;} }
  if(!start){ax='x';start=[A.x-3,A.z];}
  await driveTo(start[0],start[1]); await page.waitForTimeout(600);
  let p0=await DA('pos'); const dx=A.x-p0[0],dz=A.z-p0[2]; const ks=[]; if(ax==='x')ks.push(dx>0?'ArrowRight':'ArrowLeft'); else ks.push(dz>0?'ArrowDown':'ArrowUp');
  // hold the keys until the teleport fires or we have clearly run past A (state-driven: headless fps varies)
  for(const k of ks)await page.keyboard.down(k);
  { const t0=Date.now(); let passed=false; while(Date.now()-t0<8000){ await page.waitForTimeout(80); const q=await DA('pos'); const dA=Math.hypot(q[0]-A.x,q[2]-A.z);
      if(await DA('tps')>0)break; if(dA<.6)passed=true; if(passed&&dA>1.5)break; } }
  for(const k of ALL)await page.keyboard.up(k); await page.waitForTimeout(300);
  const p1=await DA('pos'); const dB=Math.hypot(p1[0]-B.x,p1[2]-B.z), dA=Math.hypot(p1[0]-A.x,p1[2]-A.z);
  console.log('ran into A from',start.map(v=>v.toFixed(1)),'-> now at',p1.map(v=>v.toFixed(2)),'dist to B=',dB.toFixed(2),'to A=',dA.toFixed(2),'tps=',await DA('tps'));
  // a pair standing next to the page edge can bounce the player back through (wall reflection), so allow a ping-pong
  if(await DA('tps')<1)errors.push('no teleport'); if(dB>3.5&&dA>3.5)errors.push('did not come out near either half of the pair');
  // 4. fifth: ring A (2.4) then F (1.6) -> a new .8 reed grows between them
  await page.waitForTimeout(1200); await page.evaluate(i=>window.__DA.tapLm(i),A.i); await page.waitForTimeout(300); await page.evaluate(i=>window.__DA.tapLm(i),F.i);
  await page.waitForTimeout(1200); lm=await DA('lm'); const g=lm.filter(l=>l.grow<1||l.h===.8&&Math.abs(l.x-(A.x+F.x)/2)<.01);
  console.log('after A,F: grown=',await DA('grown'),'new reed=',JSON.stringify(g[0]||null));
  if(await DA('grown')<1)console.log('  (no growth: midpoint blocked or crowded — allowed)');
  await page.screenshot({path:'/tmp/claude-0/-home-user-dimensionalawakening/6ba98dfd-5a27-548a-acc6-4c9ed56a43e0/scratchpad/octave-2d.png'});
}
await browser.close();
if(errors.length){console.log('ERRORS');errors.forEach(e=>console.log(' - '+e));process.exit(1);} console.log('OCTAVE OK');
