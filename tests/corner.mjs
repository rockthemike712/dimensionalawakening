// The Corner Comes to You: two edges, order matters, the far light lands near the player.
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
// A: along z at x=27, draws horizontal on screen -> perpendicular drag is vertical (clientY), down = pull.
// B: along x at z=0, draws vertical on screen -> perpendicular drag is horizontal (clientX).
async function dragEdge(which){
  const p=await page.evaluate(w=>window.__DA.project(w==='A'?27:24,1,w==='A'?-3:0),which);
  await page.mouse.move(p.x,p.y); await page.mouse.down();
  if(which==='A')await page.mouse.move(p.x,p.y+300,{steps:20}); else await page.mouse.move(p.x-260,p.y,{steps:20});
  await page.mouse.up(); await page.waitForTimeout(1500);
}
let s=await st(); console.log('arrived:',JSON.stringify(s));
if(!s||!s.built)errors.push('corner not built');
await page.screenshot({path:'shots/corner-0-flat.png'});

// item 1: pointer handlers gate on being in the region — a tap from inside
// the room must not fold or latch anything here.
await page.evaluate(()=>window.__DA.setPos(6,0)); await page.waitForTimeout(400);
await page.mouse.click(195,422); await page.waitForTimeout(400);
s=await st(); console.log('after tap from the room:',JSON.stringify(s.state));
if(s.state.foldA!==0||s.state.foldB!==0)errors.push('a tap from outside the region changed the corner: '+JSON.stringify(s.state));
await page.evaluate(()=>window.__DA.setPos(17,0)); await page.waitForTimeout(1000);

// item 2 / item 9: drag perpendicular to each line as drawn; mid-drag assertion.
{
  const p=await page.evaluate(()=>window.__DA.project(27,1,-3));
  await page.mouse.move(p.x,p.y); await page.mouse.down();
  await page.mouse.move(p.x,p.y+300,{steps:20});
  const mid=await st();
  console.log('mid-drag (before release):',JSON.stringify(mid.state));
  if(!(mid.state.foldA>0))errors.push('foldA did not rise mid-drag, before mouse.up(): '+mid.state.foldA);
  await page.mouse.up(); await page.waitForTimeout(1500);
}
s=await st(); console.log('after A:',JSON.stringify(s.state)); if(s.state.foldA<.9)errors.push('edge A did not latch: '+s.state.foldA);
await page.screenshot({path:'shots/corner-1-A.png'});
await dragEdge('B'); s=await st(); console.log('after A,B:',JSON.stringify(s.state)); if(s.state.foldB<.9)errors.push('edge B did not latch: '+s.state.foldB);
if(s.state.order!==0)errors.push('order should be A-first (0), got '+s.state.order);
await page.screenshot({path:'shots/corner-2-AB.png'});

// the first light should now be mapped near the player; walk into it.
// Note: edge A's hinge sits at world x=27, ten and a half units from the
// entrance's x=16.5 — a fold that applies A *first* can never bring a
// point's world-x closer than that (A's own rotation never touches z, so
// there is no cross term to borrow from), verified by brute-force search
// over the whole quarter. RAW2's B-first gate does not have this problem
// (edge B's hinge z=0 already equals the entrance's z), so it is held to
// the tighter bound below.
const l1=await page.evaluate(()=>window.__DA_corner?window.__DA_corner.light(1):null);
console.log('light 1 mapped to:',JSON.stringify(l1));
if(!l1)errors.push('no debug hook for the mapped light');
else{ const p=await page.evaluate(()=>window.__DA.pos); const d=Math.hypot(l1.x-p[0],l1.z-p[2]); console.log('distance to light 1:',d.toFixed(2));
  if(d>11.5)errors.push('light 1 did not come as close as the fold geometry allows (d='+d.toFixed(1)+')');
  if(l1.y<2)errors.push('light 1 should hang above the ground (y='+l1.y+')');
}
// walking to the *wrong* light (the B->A gate, under the current A->B fold)
// must not collect it, and must answer with a dull blip — learned by doing.
const wrongBefore=await page.evaluate(()=>window.__DA_corner.wrongTouches);
const l2wrong=await page.evaluate(()=>window.__DA_corner.light(2));
await driveTo(l2wrong.x,l2wrong.z); await page.waitForTimeout(600);
s=await st(); console.log('after walking to the wrong light:',JSON.stringify(s.state));
await page.screenshot({path:'shots/corner-3-wrong.png'});
const wrongAfter=await page.evaluate(()=>window.__DA_corner.wrongTouches);
if(s.state.got2)errors.push('the wrong light collected');
if(wrongAfter<=wrongBefore)errors.push('walking to the wrong light gave no feedback (wrongTouches unchanged)');
// now the right one
await driveTo(l1.x,l1.z); await page.waitForTimeout(800); s=await st(); console.log('after walking into it:',JSON.stringify(s.state)); if(!s.state.got1)errors.push('light 1 not collected');
await page.screenshot({path:'shots/corner-4-got1.png'});

// unfolded after collecting; now the other order: B then A
await page.waitForTimeout(1500); s=await st(); if(s.state.foldA>.2||s.state.foldB>.2)errors.push('did not unfold after collecting');
await driveTo(17,0); await dragEdge('B'); await dragEdge('A'); s=await st(); console.log('after B,A:',JSON.stringify(s.state));
if(s.state.order!==1)errors.push('order should be B-first (1), got '+s.state.order);
await page.screenshot({path:'shots/corner-5-BA.png'});
const l2=await page.evaluate(()=>window.__DA_corner?window.__DA_corner.light(2):null); console.log('light 2 mapped to:',JSON.stringify(l2));
if(l2){ const p=await page.evaluate(()=>window.__DA.pos); const d=Math.hypot(l2.x-p[0],l2.z-p[2]); console.log('distance to light 2:',d.toFixed(2));
  if(d>6)errors.push('light 2 (B->A) did not come within 6 units of the player (d='+d.toFixed(1)+')');
  await driveTo(l2.x,l2.z); await page.waitForTimeout(800); s=await st(); console.log('after walking into it:',JSON.stringify(s.state)); if(!s.done)errors.push('region not done after both lights'); }
await page.screenshot({path:'shots/corner-6-done.png'});

// item 6: leaving resets the folds
await dragEdge('A'); await dragEdge('B');
await page.evaluate(()=>window.__DA.setPos(12,20)); await page.waitForTimeout(800);
s=await st(); console.log('after leaving:',JSON.stringify(s.state));
if(s.state.foldA!==0||s.state.foldB!==0)errors.push('leaving did not reset the folds: '+JSON.stringify(s.state));

// save / continue
await page.evaluate(()=>window.__DA.save()); await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(800); await page.tap('#resumeYes'); await page.waitForTimeout(800);
s=await st(); console.log('after continue:',JSON.stringify(s)); if(!s.done)errors.push('save did not restore done');
await browser.close();
if(errors.length){console.log('ERRORS');errors.forEach(e=>console.log(' - '+e));process.exit(1);} console.log('CORNER OK');
