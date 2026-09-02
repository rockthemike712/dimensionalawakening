// LOWER THE LAMP — the identity crack, third revision. The entrance sits
// dead ahead of the slit (8,19) so the lamp is in frame on arrival; the
// shadow projects along x only, so the whole near rim throws it; lampY is
// linear in the drag; the lamp's footprint (LX=15.8) sits ahead of the rim
// so it never renders low enough to sit over the pad; the slit is fenced on
// both z edges the whole way to the far light; the veil dips once per
// refusal, never strobes; and the old self is glimpsed in a look-back after
// the swap, with a second, fading copy left ahead of the player.
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
async function holdEye(eyeBox,ms){
  await page.mouse.move(eyeBox.x,eyeBox.y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}
// the lamp's screen position, for grabbing it — LX=15.8 (item 4)
const lampScreenPos=()=>page.evaluate(()=>window.__DA.project(15.8,2,19));
async function dragLampBy(px){
  const sp=await lampScreenPos();
  await page.mouse.move(sp.x,sp.y);
  await page.mouse.down();
  const step=px<0?-1:1, n=Math.abs(px);
  for(let i=1;i<=n;i++){ await page.mouse.move(sp.x,sp.y+i*step,{steps:1}); await page.waitForTimeout(15); }
  await page.mouse.up();
  await page.waitForTimeout(150);
}
// headless can run well under 5fps, so a fixed short wait after setPos is
// not enough to guarantee even one animate() frame has landed (build() and
// the curRegion assignment both happen inside that loop) — poll instead
async function waitForLamp(ms=3000){
  const t0=Date.now();
  while(Date.now()-t0<ms){
    const ok=await page.evaluate(()=>window.__DA.region==='lamp');
    if(ok) return true;
    await page.waitForTimeout(60);
  }
  return false;
}
async function waitForSwap(eyeBox,ms=6000){
  const t0=Date.now();
  await page.mouse.move(eyeBox.x,eyeBox.y);
  await page.mouse.down();
  let st=await lampState();
  while(Date.now()-t0<ms&&!st.swapped){ await page.waitForTimeout(80); st=await lampState(); }
  await page.mouse.up();
  return st;
}

// ---- __DA must expose nothing new: it is a fixed set of core hooks, and
// this revision only ever touches src/regions/lamp.js ----
const daKeys=await page.evaluate(()=>Object.keys(window.__DA).sort());
const EXPECTED_DA=['actDone','applySave','arrow','clearSave','counterShown','crossed','dim','digest','digested',
  'flat','fold','grown','jump3d','lm','loadSave','moves','next','pos','project','region','regions','roomFold',
  'rings','s2','s2round','s2start','save','setPos','seeds','tapLm','tps','unlockRoom','_lm','_plane'].sort();
const extra=daKeys.filter(k=>!EXPECTED_DA.includes(k));
console.log('__DA keys:',daKeys.join(','));
if(extra.length) errors.push('window.__DA gained unexpected keys: '+extra.join(','));

// ---- the eye button follows the region, unconditionally, on enter/leave ----
await page.evaluate(()=>{window.__DA.jump3d();window.__DA.setPos(8,19);});
await page.waitForTimeout(250);   // let onEnter land
let eyeDisp=await page.$eval('#eye',el=>getComputedStyle(el).display);
console.log('eye display inside the lamp (entrance):',eyeDisp);
if(eyeDisp!=='grid') errors.push('eye should be display:grid at the entrance, got '+eyeDisp);
await page.evaluate(()=>{window.__DA.setPos(8,9);});   // south of the fenced ledge, out of bounds
await page.waitForTimeout(300);
eyeDisp=await page.$eval('#eye',el=>getComputedStyle(el).display);
console.log('eye display after leaving lamp bounds:',eyeDisp);
if(eyeDisp!=='none') errors.push('eye should be display:none after onLeave, got '+eyeDisp);
await page.evaluate(()=>{window.__DA.unlockRoom();window.__DA.setPos(5,0);});
await page.waitForTimeout(300);
eyeDisp=await page.$eval('#eye',el=>getComputedStyle(el).display);
console.log('eye display in the room:',eyeDisp);
if(eyeDisp!=='grid') errors.push('eye should be display:grid in the room, got '+eyeDisp);

// ---- before ANY swap has ever happened, teleporting straight to the far
// light must not lie about finishing the region (no invisible-wall bypass) ----
await page.evaluate(()=>{window.__DA.setPos(25,19);});
await page.waitForTimeout(400);
let st=await lampState();
if(st.finished||st.swapped) errors.push('BUG: finished/swapped became true without ever swapping');
if(await regionDone()) errors.push('BUG: done() lied — true without a swap');

// ---- item 1: the entrance is lined up with the slit. From (8,19) — the new
// entrance — the lamp is on screen, and stays on screen once blocked at the
// rim ----
await page.evaluate(()=>{window.__DA.setPos(8,19);});
await page.waitForTimeout(300);
let proj=await page.evaluate(()=>window.__DA.project(14,4,19));
console.log('item1 project(14,4,19) from the entrance:',proj);
if(!(proj.x>=0&&proj.x<=390&&proj.y>=0&&proj.y<=844)) errors.push('lamp area off-screen from the entrance: '+JSON.stringify(proj));
st=await lampState();
console.log('lamp on enter:',JSON.stringify(st));
await driveTo(20,19,8000);
await page.waitForTimeout(300);
let pos=await page.evaluate(()=>window.__DA.pos);
console.log('blocked at:',pos.map(v=>v.toFixed(2)));
if(pos[0]>=17.2) errors.push('did not block at the rim: x='+pos[0]);
await shot('rim');
proj=await page.evaluate(()=>window.__DA.project(14,4,19));
console.log('item1 project(14,4,19) at the rim:',proj);
if(!(proj.x>=0&&proj.x<=390&&proj.y>=0&&proj.y<=844)) errors.push('lamp area off-screen at the rim: '+JSON.stringify(proj));

st=await lampState();
console.log('shadow short (lamp high):',JSON.stringify(st));
if(!(st.shadowX<17)) errors.push('shadow should sit short of the slit while the lamp is high, got '+st.shadowX);

const nearLip=await page.evaluate(()=>window.__DA.project(17,.05,19));
const farLip=await page.evaluate(()=>window.__DA.project(22,.05,19));
const farLight=await page.evaluate(()=>window.__DA.project(25,0,19));
for(const [name,p] of Object.entries({nearLip,farLip,farLight})){
  if(!(p.x>=0&&p.x<=390&&p.y>=0&&p.y<=844)) errors.push(`${name} projects off-screen: ${JSON.stringify(p)}`);
}

// ---- item 3: lampY is linear in the drag, not hyperbolic. Sample u at
// .25/.5/.75/1 within a single continuous drag (nu depends only on total
// displacement from mousedown, so this is safe to sample mid-gesture) ----
await settle();
{
  const DRAG_FULL_PX=46, LY_MAX=4, LY_MIN=1.3;
  const sp=await lampScreenPos();
  await page.mouse.move(sp.x,sp.y);
  await page.mouse.down();
  const lerp=(a,b,t)=>a+(b-a)*t;
  for(const u of [.25,.5,.75,1]){
    await page.mouse.move(sp.x,sp.y+u*DRAG_FULL_PX,{steps:4});
    await page.waitForTimeout(90);
    const s=await lampState();
    const expected=lerp(LY_MAX,LY_MIN,u);
    console.log(`lampY at u=${u}: got ${s.lampY}, expected about ${expected.toFixed(2)}`);
    if(Math.abs(s.lampY-expected)>.15) errors.push(`lampY not linear at u=${u}: got ${s.lampY}, expected ~${expected.toFixed(2)}`);
  }
  await page.mouse.up();
  await page.waitForTimeout(150);
}

// ---- item 4: at full drag, from the rim, the lamp's lowest geometry stays
// well clear of the pad (never below screen y=620 on a 390x844 shot) ----
st=await lampState();
console.log('after full drag at the rim:',JSON.stringify(st));
if(!(st.lampY<=1.35)) errors.push('lamp did not come all the way down: lampY='+st.lampY);
if(!(st.shadowX>22.3)) errors.push('shadow did not reach the far side: shadowX='+st.shadowX);
if(!(st.shadowX<=22+1.5+1e-6)) errors.push('shadow overshot more than 1.5 past the far lip: '+st.shadowX);
if(st.shadowVisible!==true) errors.push('shadow should be visible at the across moment');
await shot('shadow-across');
const lampLow=await page.evaluate(ly=>window.__DA.project(15.8,ly-.6,19),st.lampY);
console.log('lowest lamp geometry projects at y=',lampLow.y);
if(lampLow.y>=620) errors.push('lamp geometry sinks into the pad band: y='+lampLow.y);

// ---- item 4, continued: the shadow never sits over the standing pad —
// its x is past the far lip, well ahead of where the player is standing ----
if(!(st.shadowX>pos[0]+3)) errors.push('shadow does not clear the player/pad by enough margin: shadowX='+st.shadowX+' playerX='+pos[0]);

// ---- pull the lamp back up, then a refusal: the shadow is short again,
// holding the eye should not swap ----
await page.evaluate(()=>window.__DA.setPos(9,19));
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

// ---- item 7: the veil dips once per refusal (never strobes on every .4s
// retry) and settles at .87 while the eye stays held over the hole ----
{
  await page.evaluate(()=>window.__DA.setPos(16.6,19));
  await page.waitForTimeout(150);
  const st2=await lampState();
  if(!(st2.shadowX<17)) errors.push('setup for the veil test should have the shadow short: '+st2.shadowX);
  await page.mouse.move(eyeBox.x,eyeBox.y);
  await page.mouse.down();
  const samples=[]; const t0=Date.now();
  while(Date.now()-t0<3000){
    const op=+(await page.$eval('#veil',el=>getComputedStyle(el).opacity));
    samples.push(op);
    await page.waitForTimeout(100);
  }
  await page.mouse.up();
  await page.waitForTimeout(200);
  console.log('veil samples over the hold:',samples.map(s=>s.toFixed(2)).join(' '));
  const dipped=samples.some(s=>s<.8);
  const settledTail=samples.slice(-3);
  const settled=settledTail.every(s=>Math.abs(s-.87)<.03);
  if(!dipped) errors.push('veil never dipped during the refusal hold');
  if(!settled) errors.push('veil did not settle back at .87: tail='+settledTail.map(s=>s.toFixed(2)));
  // it must not still be dipping near the very end of a 3s hold — one dip, not a strobe
  const lastDipIdx=samples.map((s,i)=>s<.8?i:-1).filter(i=>i>=0).pop();
  if(lastDipIdx!==undefined&&lastDipIdx>samples.length-4) errors.push('veil was still dipping near the end of the hold — looks like a strobe, not a single dip');
}

// ---- item 9: the shadow fades near a bound instead of sitting as a pinned
// decal. Teleport so the projected (unclamped) shadow lands just past the
// region's west edge, and check its opacity fades rather than snapping ----
{
  await page.evaluate(()=>window.__DA.setPos(14.36,19));
  await page.waitForTimeout(150);
  await dragLampBy(60); // the lamp was pulled back up for the refusal test — drag it fully down again
  const s=await lampState();
  console.log('near the west bound, fade should be partial:',JSON.stringify(s));
  if(!(s.shadowFade>.05&&s.shadowFade<.95)) errors.push('shadow should be partially faded near the bound, got fade='+s.shadowFade);
  await page.evaluate(()=>window.__DA.setPos(6,19));
  await page.waitForTimeout(200);
  const s2=await lampState();
  console.log('well past the west bound, fade should be ~0:',JSON.stringify(s2));
  if(!(s2.shadowFade<.05)) errors.push('shadow should be fully faded well past the bound, got fade='+s2.shadowFade);
}

// ---- item 2: the whole near rim works the same way — three positions
// along the near rim, each independently, all swap once pulled fully ----
for(const z of [13,19,25]){
  await ctx.close();
  ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  page=await ctx.newPage();
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  await page.goto(BASE+'/index.html',{waitUntil:'networkidle'});
  await page.waitForTimeout(800);
  await page.evaluate(()=>{window.__DA.jump3d();});
  // grab the lamp from where it's actually on screen (z=19, its own LZ),
  // then walk the rim to the target z with the drag already set — a player
  // cannot click a lamp that's projected off the side of the phone
  await page.evaluate(()=>window.__DA.setPos(16.6,19));
  const ready=await waitForLamp();
  if(!ready) errors.push(`region never became current at z=${z} before dragging`);
  await page.waitForTimeout(120);
  await dragLampBy(60); // well past DRAG_FULL_PX; dragU clamps to 1
  await page.evaluate((z)=>window.__DA.setPos(16.6,z),z);
  await page.waitForTimeout(150);
  const sBefore=await lampState();
  console.log(`near rim z=${z}, after full drag:`,JSON.stringify(sBefore));
  if(!(sBefore.shadowX>22.3)) errors.push(`shadow did not cross at z=${z}: shadowX=`+sBefore.shadowX);
  const eb=await eyeBoxOf();
  const after=await waitForSwap(eb,4000);
  console.log(`near rim z=${z}, after holding the eye:`,JSON.stringify(after));
  if(!after.swapped) errors.push(`did not swap at z=${z}`);
  const p=await page.evaluate(()=>window.__DA.pos);
  if(!(p[0]>17)) errors.push(`player not on the far side after swap at z=${z}: x=`+p[0]);
}

// ---- item 6: the slit cannot be walked around. From (16,19), north past
// the ledge's own z0, east well past the near lip's x, then south — x never
// exceeds 17 while z sits outside the fenced band [11.3,26.7] ----
{
  await ctx.close();
  ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  page=await ctx.newPage();
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  await page.goto(BASE+'/index.html',{waitUntil:'networkidle'});
  await page.waitForTimeout(800);
  await page.evaluate(()=>{window.__DA.jump3d();window.__DA.setPos(16,19);});
  await page.waitForTimeout(200);
  let violated=false, violation=null;
  const check=async()=>{
    const p=await page.evaluate(()=>window.__DA.pos);
    if(p[0]>17&&(p[2]<11.3-.01||p[2]>26.7+.01)){violated=true;violation=p;}
    return p;
  };
  let p;
  for(let i=0;i<20;i++){ p=await check(); if(p[2]<=9.9)break;
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(60); await page.keyboard.up('ArrowLeft'); await page.waitForTimeout(60); }
  console.log('item6 after north leg:',p);
  for(let i=0;i<40;i++){ p=await check(); if(p[0]>=24)break;
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(60); await page.keyboard.up('ArrowUp'); await page.waitForTimeout(60); }
  console.log('item6 after east leg:',p);
  for(let i=0;i<20;i++){ p=await check(); if(p[2]>=26)break;
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(60); await page.keyboard.up('ArrowRight'); await page.waitForTimeout(60); }
  console.log('item6 after south leg:',p);
  if(violated) errors.push('walked around the slit: x>17 with z out of [11.3,26.7] at '+JSON.stringify(violation));
}

// ---- item 8: the look-back and the lingering echo. Swap, then check the
// old self is on screen 0.6s after the swap completes; the far echo appears
// after the look-back returns and fades away on its own ----
{
  await ctx.close();
  ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  page=await ctx.newPage();
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  await page.goto(BASE+'/index.html',{waitUntil:'networkidle'});
  await page.waitForTimeout(800);
  await page.evaluate(()=>{window.__DA.jump3d();window.__DA.setPos(16.66,19);});
  await waitForLamp();
  await page.waitForTimeout(120);
  await dragLampBy(60);
  const eb=await eyeBoxOf();
  const swapped=await waitForSwap(eb,5000);
  if(!swapped.swapped) errors.push('setup for the look-back test did not swap');
  if(!swapped.oldSelfVisible) errors.push('the old self should be left standing, visible');
  console.log('swapped for look-back test:',JSON.stringify(swapped));

  // poll (state-driven, not wall-clock) until roughly 0.6s of game time has
  // passed since the swap, using the debug snapshot itself as the clock
  await page.waitForTimeout(600);
  const oldProj=await page.evaluate(o=>window.__DA.project(o.oldX,.3,o.oldZ),swapped);
  console.log('old-self projection ~0.6s after the swap:',oldProj);
  if(!(oldProj.x>=0&&oldProj.x<=390&&oldProj.y>=0&&oldProj.y<=844))
    errors.push('old self is not on screen 0.6s after the swap (no look-back): '+JSON.stringify(oldProj));
  await shot('lookback');

  // the echo: appears once the look-back has returned, then fades and hides
  // again — poll with a generous ceiling since headless clamps dt and can
  // lag real time
  let echoSeenOn=false, echoSeenOff=false;
  const t0=Date.now();
  while(Date.now()-t0<6000){
    const s=await lampState();
    if(s.echoVisible) echoSeenOn=true;
    if(echoSeenOn&&!s.echoVisible){ echoSeenOff=true; break; }
    await page.waitForTimeout(120);
  }
  console.log('echo seen on:',echoSeenOn,'then off:',echoSeenOff);
  if(!echoSeenOn) errors.push('the lingering echo never appeared after the look-back');
  if(!echoSeenOff) errors.push('the lingering echo never faded back out');

  // ---- item 10: the goal light drops to core+ring (beam+glow off) once
  // finished, never fully dark before that ----
  let s=await lampState();
  if(s.farBeamOn!==true||s.farGlowOn!==true) errors.push('the far light should still be lit before finishing: '+JSON.stringify(s));
  await driveTo(25,19,15000);
  await page.waitForTimeout(400);
  s=await lampState();
  console.log('at the far light:',JSON.stringify(s));
  if(!s.finished) errors.push('region did not finish after reaching the far light');
  if(!(await regionDone())) errors.push("done() did not report true");
  if(s.farBeamOn!==false||s.farGlowOn!==false) errors.push('the far light did not drop to core+ring on finishing: '+JSON.stringify(s));
  await shot('far-light');
}

// ---- retry the swap while the eye is held, not once per hold — needs a
// fresh, never-swapped page ----
await ctx.close();
ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
page=await ctx.newPage();
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
await page.goto(BASE+'/index.html',{waitUntil:'networkidle'});
await page.waitForTimeout(800);
await page.evaluate(()=>{window.__DA.jump3d();window.__DA.setPos(16.66,19);});
await waitForLamp();
await page.waitForTimeout(200);
await page.evaluate(()=>{document.getElementById('eye').dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,bubbles:true}));});
await page.waitForTimeout(600);   // at least one failed attempt while the shadow is still short
st=await lampState();
if(st.swapped) errors.push('should not have swapped: the shadow has not crossed yet');
await dragLampBy(60); // cross while the eye is (logically) still held
await page.waitForTimeout(1700); // several .4s retry windows, eye held throughout
st=await lampState();
await page.evaluate(()=>{document.getElementById('eye').dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true}));});
console.log('retry-while-held result:',JSON.stringify(st));
if(!st.swapped) errors.push('holding the eye through the crossing did not retry into a swap');

// ---- a second hold after the swap (shadow hidden) should not re-trigger ----
{
  const eb=await eyeBoxOf();
  await holdEye(eb,700);
  await page.waitForTimeout(1000);
  const p=await page.evaluate(()=>window.__DA.pos);
  if(p[0]<=17) errors.push('an unexpected second swap moved the player back: x='+p[0]);
}

// ---- a walk around the slit that never swaps must not complete the
// region, no matter how it's reached (teleport stands in for a physical
// detour) ----
await ctx.close();
ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
page=await ctx.newPage();
await page.goto(BASE+'/index.html',{waitUntil:'networkidle'});
await page.waitForTimeout(800);
await page.evaluate(()=>{window.__DA.jump3d();window.__DA.setPos(8,20);window.__DA.setPos(30,20);window.__DA.setPos(25,19);});
await page.waitForTimeout(400);
st=await lampState();
if(st.finished||st.swapped) errors.push('BUG: a walk around the slit finished the region without a swap');
if(await regionDone()) errors.push('BUG: done() lied after a walk-around');

// ---- save / reload / apply: restored, and Continue offers the lamp ----
await page.evaluate(()=>{window.__DA.setPos(16.66,19);});
await waitForLamp();
await page.waitForTimeout(200);
await dragLampBy(60);
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
