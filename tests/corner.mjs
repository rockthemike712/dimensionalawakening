// The Corner Comes to You: two edges, order matters, the far light lands on you.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE=process.env.DA_BASE||'http://localhost:8901'; const errors=[];
const browser=await chromium.launch(); const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const page=await ctx.newPage();
page.on('pageerror',e=>errors.push('pageerror: '+e.message)); page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
await page.goto(BASE+'/index.html',{waitUntil:'networkidle'}); await page.waitForTimeout(800);
await page.evaluate(()=>{window.__DA.jump3d();window.__DA.setPos(17,0);}); await page.waitForTimeout(1200);
const st=()=>page.evaluate(()=>window.__DA.regions.find(r=>r.id==='corner'));
const ALL=['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'];
async function driveTo(tx,tz,ms=15000){const t0=Date.now();while(Date.now()-t0<ms){const p=await page.evaluate(()=>window.__DA.pos);const dx=tx-p[0],dz=tz-p[2];
  if(Math.abs(dx)<.4&&Math.abs(dz)<.4)break;const ks=[];if(dx>.3)ks.push('ArrowUp');else if(dx<-.3)ks.push('ArrowDown');if(dz>.3)ks.push('ArrowRight');else if(dz<-.3)ks.push('ArrowLeft');
  for(const k of ks)await page.keyboard.down(k);await page.waitForTimeout(150);for(const k of ALL)await page.keyboard.up(k);}}
async function dragEdge(which){ // A: along z at x=27 (drag horizontally); B: along x at z=0 (drag vertically)
  const p=await page.evaluate(w=>window.__DA.project(w==='A'?27:24,1,w==='A'?-3:0),which);
  await page.mouse.move(p.x,p.y); await page.mouse.down();
  if(which==='A')await page.mouse.move(p.x-260,p.y,{steps:20}); else await page.mouse.move(p.x,p.y+300,{steps:20});
  await page.mouse.up(); await page.waitForTimeout(1500);
}
let s=await st(); console.log('arrived:',JSON.stringify(s));
if(!s||!s.built)errors.push('corner not built');
await page.screenshot({path:'shots/corner-0-flat.png'});
await dragEdge('A'); s=await st(); console.log('after A:',JSON.stringify(s.state)); if(s.state.foldA<.9)errors.push('edge A did not latch: '+s.state.foldA);
await page.screenshot({path:'shots/corner-1-A.png'});
await dragEdge('B'); s=await st(); console.log('after A,B:',JSON.stringify(s.state)); if(s.state.foldB<.9)errors.push('edge B did not latch: '+s.state.foldB);
if(s.state.order!==0)errors.push('order should be A-first (0), got '+s.state.order);
await page.screenshot({path:'shots/corner-2-AB.png'});
// the first light should now be mapped near the player; walk into it
const l1=await page.evaluate(()=>window.__DA_corner?window.__DA_corner.light(1):null);
console.log('light 1 mapped to:',JSON.stringify(l1));
if(!l1)errors.push('no debug hook for the mapped light');
else{ const p=await page.evaluate(()=>window.__DA.pos); const d=Math.hypot(l1.x-p[0],l1.z-p[2]); console.log('distance to light 1:',d.toFixed(2)); if(d>6)errors.push('light 1 did not come near the player (d='+d.toFixed(1)+')');
  await driveTo(l1.x,l1.z); await page.waitForTimeout(800); s=await st(); console.log('after walking into it:',JSON.stringify(s.state)); if(!s.state.got1)errors.push('light 1 not collected'); }
await page.screenshot({path:'shots/corner-3-got1.png'});
// unfolded after collecting; now the other order: B then A
await page.waitForTimeout(1500); s=await st(); if(s.state.foldA>.2||s.state.foldB>.2)errors.push('did not unfold after collecting');
await driveTo(17,0); await dragEdge('B'); await dragEdge('A'); s=await st(); console.log('after B,A:',JSON.stringify(s.state));
if(s.state.order!==1)errors.push('order should be B-first (1), got '+s.state.order);
const l2=await page.evaluate(()=>window.__DA_corner?window.__DA_corner.light(2):null); console.log('light 2 mapped to:',JSON.stringify(l2));
if(l2){ await driveTo(l2.x,l2.z); await page.waitForTimeout(800); s=await st(); console.log('after walking into it:',JSON.stringify(s.state)); if(!s.done)errors.push('region not done after both lights'); }
await page.screenshot({path:'shots/corner-4-done.png'});
// save / continue
await page.evaluate(()=>window.__DA.save()); await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(800); await page.tap('#resumeYes'); await page.waitForTimeout(800);
s=await st(); console.log('after continue:',JSON.stringify(s)); if(!s.done)errors.push('save did not restore done');
await browser.close();
if(errors.length){console.log('ERRORS');errors.forEach(e=>console.log(' - '+e));process.exit(1);} console.log('CORNER OK');
