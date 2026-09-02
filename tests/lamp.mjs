// LOWER THE LAMP — the identity crack. The slit cuts straight across the
// ledge dead ahead (camera always +x); a lamp on a line of light throws your
// shadow further than you; drag it down until the shadow crosses; close
// your eyes to trade places with it.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const errors=[]; const browser=await chromium.launch();
const BASE=process.env.DA_BASE||'http://localhost:8901';
let ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
let page=await ctx.newPage();
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
await page.goto(BASE+'/index.html',{waitUntil:'networkidle'});
await page.waitForTimeout(800);

const shot=(name)=>page.screenshot({path:`shots/lamp-${name}.png`});
const lampState=()=>page.evaluate(()=>window.__DA.regions.find(r=>r.id==='lamp').state);
const regionDone=()=>page.evaluate(()=>window.__DA.regions.find(r=>r.id==='lamp').done);
const ALL=['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'];
async function driveTo(tx,tz,ms=12000){
  const t0=Date.now();
  while(Date.now()-t0<ms){
    const p=await page.evaluate(()=>window.__DA.pos);
    const dx=tx-p[0], dz=tz-p[2];
    if(Math.abs(dx)<.3&&Math.abs(dz)<.3)break;
    const ks=[];
    // in 3D: ArrowUp is +x, ArrowRight is +z
    if(dx>.25)ks.push('ArrowUp'); else if(dx<-.25)ks.push('ArrowDown');
    if(dz>.25)ks.push('ArrowRight'); else if(dz<-.25)ks.push('ArrowLeft');
    for(const k of ks)await page.keyboard.down(k);
    await page.waitForTimeout(120);
    for(const k of ALL)await page.keyboard.up(k);
  }
}
const settle=async()=>{ // kill residual drive-key velocity before a precision step
  await page.waitForTimeout(400);
  await page.evaluate(()=>window.__DA.setPos(window.__DA.pos[0],window.__DA.pos[2]));
  await page.waitForTimeout(80);
};
const eyeBoxOf=()=>page.$eval('#eye',el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
// hold the eye for `ms`, long enough to cover the .5s trigger delay plus the
// full 1.55s footsteps+dolly sequence when a swap is underway
async function holdEye(eyeBox,ms){
  await page.mouse.move(eyeBox.x,eyeBox.y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}
async function dragLampBy(px){
  const sp=await page.evaluate(()=>window.__DA.project(14,2,19));
  await page.mouse.move(sp.x,sp.y);
  await page.mouse.down();
  const step=px<0?-1:1, n=Math.abs(px);
  for(let i=1;i<=n;i++){ await page.mouse.move(sp.x,sp.y+i*step,{steps:1}); await page.waitForTimeout(15); }
  await page.mouse.up();
  await page.waitForTimeout(150);
}

// ---- item 7: the eye hides unconditionally on leaving, unrelated to the room ----
await page.evaluate(()=>{window.__DA.jump3d();window.__DA.setPos(9,12.5);window.__DA.setPos(9,9.5);});
await page.waitForTimeout(300);
let eyeDisp=await page.$eval('#eye',el=>getComputedStyle(el).display);
console.log('eye display after leaving lamp bounds:',eyeDisp);
if(eyeDisp!=='none') errors.push('eye should be display:none after onLeave, got '+eyeDisp);
await page.evaluate(()=>{window.__DA.unlockRoom();window.__DA.setPos(5,0);});
await page.waitForTimeout(300);
eyeDisp=await page.$eval('#eye',el=>getComputedStyle(el).display);
console.log('eye display in the room:',eyeDisp);
if(eyeDisp!=='grid') errors.push('eye should be display:grid in the room, got '+eyeDisp);

// ---- item 8: before ANY swap has ever happened, teleporting straight to the
// far light must not lie about finishing the region (no invisible-wall bypass) ----
await page.evaluate(()=>{window.__DA.setPos(25,19);});
await page.waitForTimeout(400);
let st=await lampState();
if(st.finished||st.swapped) errors.push('BUG: finished/swapped became true without ever swapping');
if(await regionDone()) errors.push('BUG: done() lied — true without a swap');

// ---- enter 3D, walk to the region, get blocked at the rim (now on x, not z) ----
await page.evaluate(()=>{window.__DA.setPos(9,12.5);});
await page.waitForTimeout(300);
st=await lampState();
console.log('lamp on enter:',JSON.stringify(st));
await driveTo(20,19,8000);
await page.waitForTimeout(300);
let pos=await page.evaluate(()=>window.__DA.pos);
console.log('blocked at:',pos.map(v=>v.toFixed(2)));
if(pos[0]>=17.2) errors.push('did not block at the rim: x='+pos[0]);
await shot('rim');

st=await lampState();
console.log('shadow short (lamp high):',JSON.stringify(st));
if(!(st.shadowX<17)) errors.push('shadow should sit short of the slit while the lamp is high, got '+st.shadowX);

// ---- item 1: from the rim, the near/far lips, the shadow's landing spot and
// the far light all project inside the phone screen ----
const proj=await page.evaluate(()=>({
  nearLip:window.__DA.project(17,.05,19), farLip:window.__DA.project(22,.05,19),
  lampCore:window.__DA.project(14,4,19), farLight:window.__DA.project(25,0,19),
  shadowLanding:window.__DA.project(23,.05,19),
}));
console.log('projections from the rim:',JSON.stringify(proj));
for(const [name,p] of Object.entries(proj)){
  if(!(p.x>=0&&p.x<=390&&p.y>=0&&p.y<=844)) errors.push(`${name} projects off-screen: ${JSON.stringify(p)}`);
}

// ---- grab the lamp, drag it down in small chunks: verify the shadow never
// races (average per-pixel move stays well under the 0.15 ceiling even under
// a slow/headless frame rate) and reaches the far side by ~46px ----
await settle();
{
  const sp=await page.evaluate(()=>window.__DA.project(14,2,19));
  await page.mouse.move(sp.x,sp.y);
  await page.mouse.down();
  let lastX=(await lampState()).shadowX, maxAvgDelta=0, crossedAtPx=null, px=0;
  const CHUNK=5;
  for(let i=0;i<11;i++){
    px+=CHUNK;
    await page.mouse.move(sp.x,sp.y+px,{steps:CHUNK});
    await page.waitForTimeout(90); // let at least one render frame land, even headless
    const s=await lampState();
    const perPx=Math.abs(s.shadowX-lastX)/CHUNK;
    maxAvgDelta=Math.max(maxAvgDelta,perPx);
    lastX=s.shadowX;
    if(crossedAtPx===null&&s.shadowX>22) crossedAtPx=px;
  }
  await page.mouse.up();
  await page.waitForTimeout(200);
  console.log('max avg per-pixel shadow delta:',maxAvgDelta.toFixed(4),'crossed to the far side by px:',crossedAtPx);
  if(maxAvgDelta>=0.15) errors.push('drag moved the shadow too fast per pixel: '+maxAvgDelta.toFixed(4));
  if(!(crossedAtPx&&crossedAtPx<=50)) errors.push('did not reach the far side within ~50px of drag, got '+crossedAtPx);
}
st=await lampState();
console.log('after dragging the lamp down:',JSON.stringify(st));
if(!(st.lampY<1)) errors.push('lamp did not come down: lampY='+st.lampY);
if(!(st.shadowX>22.3)) errors.push('shadow did not reach the far side: shadowX='+st.shadowX);
if(!(st.shadowX<=22+1.5+1e-6)) errors.push('shadow overshot more than 1.5 past the far lip: '+st.shadowX);
if(st.shadowVisible!==true) errors.push('shadow should be visible at the across moment');
await shot('shadow-across');

// ---- item 4: the shadow stays inside the region's bounds while walking it, lamp low ----
{
  const B={x0:4,x1:26,z0:11,z1:27};
  for(const [x,z] of [[4,11],[4,27],[26,11],[26,27],[10,15],[9,20]]){
    await page.evaluate(([x,z])=>window.__DA.setPos(x,z),[x,z]);
    await page.waitForTimeout(150);
    const s=await lampState();
    if(!(s.shadowX>=B.x0-.01&&s.shadowX<=B.x1+.01&&s.shadowZ>=B.z0-.01&&s.shadowZ<=B.z1+.01)){
      errors.push(`shadow left the region bounds at ${x},${z}: ${s.shadowX},${s.shadowZ}`);
    }
  }
}

// ---- pull the lamp back up (dragU -> 0), then a refusal: the shadow is
// short again, holding the eye should not swap, and the veil dips ----
await page.evaluate(()=>window.__DA.setPos(9,12.5));
await page.waitForTimeout(200);
await driveTo(16.6,19,8000);
await settle();
await dragLampBy(-60); // all the way back up
st=await lampState();
console.log('lamp back up:',JSON.stringify(st));
if(!(st.shadowX<17)) errors.push('lamp did not return the shadow short of the slit: '+st.shadowX);
const eyeBox=await eyeBoxOf();
await page.mouse.move(eyeBox.x,eyeBox.y);
await page.mouse.down();
await page.waitForTimeout(600); // past the .5s trigger, mid-refusal-flash
await shot('refusal');
await page.waitForTimeout(100);
await page.mouse.up();
await page.waitForTimeout(2200); // long enough that a wrongly-started swap would have finished
st=await lampState();
if(st.swapped||st.swapLock) errors.push('a refusal should never turn into a swap');

// ---- drag across again, then close your eyes: the swap happens under the veil ----
await page.evaluate(()=>window.__DA.setPos(16.66,19));
await page.waitForTimeout(100);
await dragLampBy(45);
st=await lampState();
const crossX=st.shadowX, crossZ=st.shadowZ;
console.log('shadow across, about to close eyes:',JSON.stringify(st));

await page.mouse.move(eyeBox.x,eyeBox.y);
await page.mouse.down();
await page.waitForTimeout(900); // trigger (.5s) + into the footsteps
await shot('mid-dolly-footsteps');
await page.waitForTimeout(750); // covers the .35s dolly and settles
await shot('mid-dolly');
await page.waitForTimeout(300);
await page.mouse.up();
await page.waitForTimeout(300);
pos=await page.evaluate(()=>window.__DA.pos);
st=await lampState();
console.log('after the swap:',JSON.stringify(st),'pos=',pos.map(v=>v.toFixed(2)));
if(!(pos[0]>17)) errors.push('player did not end up on the far side: x='+pos[0]);
if(!st.swapped) errors.push('region does not report swapped');
if(Math.abs(pos[0]-crossX)>=.6) errors.push('player x not within .6 of the shadow: '+pos[0]+' vs '+crossX);
if(Math.abs(pos[2]-crossZ)>=.6) errors.push('player z not within .6 of the shadow: '+pos[2]+' vs '+crossZ);
if(!st.oldSelfVisible) errors.push('the old you should be left standing, visible');
if(Math.abs(st.oldX-16.66)>1||Math.abs(st.oldZ-19)>1) errors.push('the old you is not where the player used to be');
await shot('after-swap');

// illustrative only: the fixed chase camera looks the way you're going, so the
// figure left behind (6+ units back) is only glimpsed receding during the
// dolly itself — this repositions just to document that it exists and stays
// put, then restores the real position so the rest of the test is unaffected
await page.evaluate(()=>window.__DA.setPos(15.5,19));
await page.waitForTimeout(150);
await shot('old-you-left-behind');
await page.evaluate((p)=>window.__DA.setPos(p[0],p[2]),pos);
await page.waitForTimeout(150);

// ---- a second hold (shadow hidden post-swap) should not re-trigger a swap ----
await holdEye(eyeBox,700);
await page.waitForTimeout(2200);
pos=await page.evaluate(()=>window.__DA.pos);
if(pos[0]<=17) errors.push('an unexpected second swap moved the player back: x='+pos[0]);

// ---- reach the light beyond the slit ----
await driveTo(25,19,15000);
await page.waitForTimeout(400);
st=await lampState();
console.log('at the far light:',JSON.stringify(st));
if(!st.finished) errors.push('region did not finish after reaching the far light');
if(!(await regionDone())) errors.push('done() did not report true');
await shot('far-light');

// ---- item 10: retry the swap while the eye is held, not once per hold —
// needs a fresh, never-swapped page ----
await ctx.close();
ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
page=await ctx.newPage();
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
await page.goto(BASE+'/index.html',{waitUntil:'networkidle'});
await page.waitForTimeout(800);
await page.evaluate(()=>{window.__DA.jump3d();window.__DA.setPos(16.66,19);});
await page.waitForTimeout(200);
await page.evaluate(()=>{document.getElementById('eye').dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,bubbles:true}));});
await page.waitForTimeout(600);   // at least one failed attempt while the shadow is still short
st=await lampState();
if(st.swapped) errors.push('should not have swapped: the shadow has not crossed yet');
await dragLampBy(45); // cross while the eye is (logically) still held
await page.waitForTimeout(1700); // several .4s retry windows, eye held throughout
st=await lampState();
await page.evaluate(()=>{document.getElementById('eye').dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true}));});
console.log('retry-while-held result:',JSON.stringify(st));
if(!st.swapped) errors.push('holding the eye through the crossing did not retry into a swap');

// ---- a walk around the slit that never swaps must not complete the region,
// no matter how it's reached (teleport stands in for a physical detour) ----
await ctx.close();
ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
page=await ctx.newPage();
await page.goto(BASE+'/index.html',{waitUntil:'networkidle'});
await page.waitForTimeout(800);
await page.evaluate(()=>{window.__DA.jump3d();window.__DA.setPos(9,20);window.__DA.setPos(30,20);window.__DA.setPos(25,19);});
await page.waitForTimeout(400);
st=await lampState();
if(st.finished||st.swapped) errors.push('BUG: a walk around the slit finished the region without a swap');
if(await regionDone()) errors.push('BUG: done() lied after a walk-around');

// ---- save / reload / apply: restored ----
await page.evaluate(()=>{window.__DA.setPos(16.66,19);});
await page.waitForTimeout(200);
await dragLampBy(45);
const eb2=await eyeBoxOf();
await holdEye(eb2,2100);
await page.waitForTimeout(300);
st=await lampState();
if(!st.swapped) errors.push('setup for the save test did not swap');
await page.evaluate(()=>window.__DA.save());
await page.reload({waitUntil:'networkidle'});
await page.waitForTimeout(800);
const shown=await page.$eval('#resume',e=>getComputedStyle(e).display);
if(shown==='none') errors.push('resume not offered after saving in the lamp region');
await page.tap('#resumeYes');
await page.waitForTimeout(700);
const restored=await lampState();
console.log('restored:',JSON.stringify(restored));
if(!restored.swapped) errors.push('save/load did not restore swapped');

await browser.close();
if(errors.length){console.log('\nERRORS:');errors.forEach(e=>console.log(' - '+e));process.exit(1);}
console.log('\nLAMP OK');
