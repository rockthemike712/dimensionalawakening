// LOWER THE LAMP — the identity crack, fourth revision. The entrance sits
// dead ahead of the slit (8,19) so the lamp is in frame on arrival; the lamp
// moved west (LX=13.5) so its whole grab range sits east of it (no more
// backward-thrown shadow for a player standing where they'd naturally stand);
// LY_MIN dropped toward CENTER_H so most of the wide swap window comes from
// real projection geometry, with a small linear (not cubic) top-up on top;
// DRAG_FULL_PX is 120 so the reach isn't packed into the last few px; west of
// the lamp the shadow holds a short offset ahead instead of being thrown
// behind; the fence against walking around the slit pushes x, not z, and
// only inside its own bounds does anything else move the player sideways;
// the look-back queues at the swap but only plays once the eye actually lets
// go, behind the veil; and the lamp itself dims out of that one shot.
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
// walk in +x only (ArrowUp), regardless of where that leaves z — used for the
// fence tests below, where z is deliberately left wherever it starts
async function walkEast(steps=60,ms=55){
  for(let i=0;i<steps;i++){
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(ms); await page.keyboard.up('ArrowUp'); await page.waitForTimeout(20);
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
// the lamp's screen position, for grabbing it — LX=13.5 (moved west, item 3)
const lampScreenPos=()=>page.evaluate(()=>window.__DA.project(13.5,2,19));
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
async function freshPage(){
  await ctx.close();
  ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  page=await ctx.newPage();
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  await page.goto(BASE+'/index.html',{waitUntil:'networkidle'});
  await page.waitForTimeout(800);
}

// ---- __DA must expose nothing new: it is a fixed set of core hooks, and
// this revision only ever touches src/regions/lamp.js ----
const daKeys=await page.evaluate(()=>Object.keys(window.__DA).sort());
const EXPECTED_DA=['actDone','applySave','arrow','clearSave','counterShown','crossed','dim','digest','digested',
  'flat','fold','grown','jump3d','lm','loadSave','moves','next','pos','project','region','regions','residue','roomFold',
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

// ---- the entrance is lined up with the slit. From (8,19) — the lamp is on
// screen, and stays on screen once blocked at the rim ----
await page.evaluate(()=>{window.__DA.setPos(8,19);});
await page.waitForTimeout(300);
let proj=await page.evaluate(()=>window.__DA.project(14,4,19));
console.log('project(14,4,19) from the entrance:',proj);
if(!(proj.x>=0&&proj.x<=390&&proj.y>=0&&proj.y<=844)) errors.push('lamp area off-screen from the entrance: '+JSON.stringify(proj));
st=await lampState();
console.log('lamp on enter:',JSON.stringify(st));
await shot('rim-before-touch');   // the shadow sits short of the slit, ahead of the player
await driveTo(20,19,8000);
await page.waitForTimeout(300);
let pos=await page.evaluate(()=>window.__DA.pos);
console.log('blocked at:',pos.map(v=>v.toFixed(2)));
if(pos[0]>=17.2) errors.push('did not block at the rim: x='+pos[0]);
await shot('rim');
proj=await page.evaluate(()=>window.__DA.project(14,4,19));
console.log('project(14,4,19) at the rim:',proj);
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

// ---- item 3: lampY is linear in the drag, not hyperbolic — sample u at
// .25/.5/.75/1 within a single continuous drag (nu depends only on total
// displacement from mousedown, so this is safe to sample mid-gesture) ----
await settle();
{
  const DRAG_FULL_PX=120, LY_MAX=4, LY_MIN=.5;
  const sp=await lampScreenPos();
  await page.mouse.move(sp.x,sp.y);
  await page.mouse.down();
  const lerp=(a,b,t)=>a+(b-a)*t;
  for(const u of [.25,.5,.75,1]){
    await page.mouse.move(sp.x,sp.y+u*DRAG_FULL_PX,{steps:6});
    await page.waitForTimeout(90);
    const s=await lampState();
    const expected=lerp(LY_MAX,LY_MIN,u);
    console.log(`lampY at u=${u}: got ${s.lampY}, expected about ${expected.toFixed(2)}`);
    if(Math.abs(s.lampY-expected)>.15) errors.push(`lampY not linear at u=${u}: got ${s.lampY}, expected ~${expected.toFixed(2)}`);
  }
  await page.mouse.up();
  await page.waitForTimeout(150);
}

// ---- item 3: the drag-curve check. Raise DRAG_FULL_PX to ~120 so the reach
// isn't packed into the last ~14px of thumb travel — sample the shadow's x
// well before the very end of a fresh drag and confirm real, visible
// progress has already happened by then (not "nothing, then everything") ----
{
  await page.evaluate(()=>window.__DA.setPos(15.7,19));
  await page.waitForTimeout(150);
  await dragLampBy(-150);   // the previous check left dragU at 1 — start this one fresh at 0
  const sp=await lampScreenPos();
  await page.mouse.move(sp.x,sp.y);
  await page.mouse.down();
  await page.mouse.move(sp.x,sp.y,{steps:1});
  await page.waitForTimeout(80);
  const atStart=(await lampState()).shadowX;
  await page.mouse.move(sp.x,sp.y+106,{steps:12});   // 120-14: everything short of the last 14px
  await page.waitForTimeout(90);
  const atShortOfEnd=(await lampState()).shadowX;
  await page.mouse.move(sp.x,sp.y+120,{steps:4});
  await page.waitForTimeout(90);
  const atEnd=(await lampState()).shadowX;
  await page.mouse.up();
  await page.waitForTimeout(150);
  console.log(`drag curve: start=${atStart.toFixed(2)} shortOfEnd=${atShortOfEnd.toFixed(2)} end=${atEnd.toFixed(2)}`);
  const wholeMove=atEnd-atStart, beforeTail=atShortOfEnd-atStart;
  if(!(beforeTail>wholeMove*0.4)) errors.push(`the shadow's reach is packed into the last 14px of the drag: only ${(beforeTail/wholeMove*100).toFixed(0)}% happened before it (start=${atStart} shortOfEnd=${atShortOfEnd} end=${atEnd})`);
}

// ---- item 3: the widened swap window. With dragU=1, shadowX clears the far
// lip by SWAP_MARGIN for every player x across the whole grab range, not
// just a 0.06-unit sliver ----
{
  const SWAP_TARGET=22+.32;
  for(const px of [14.7,15.7,16.7]){
    await page.evaluate((x)=>window.__DA.setPos(x,19),px);
    await page.waitForTimeout(150);
    await dragLampBy(130);   // well past DRAG_FULL_PX=120; dragU clamps to 1
    const s=await lampState();
    console.log(`swap window at x=${px}: dragU=${s.dragU} shadowX=${s.shadowX} shadowFade=${s.shadowFade}`);
    if(s.dragU<0.999) errors.push(`dragU did not reach 1 at x=${px}: ${s.dragU}`);
    if(!(s.shadowX>SWAP_TARGET)) errors.push(`shadow did not clear the far lip at x=${px}: shadowX=${s.shadowX}`);
    if(!(s.shadowFade>0.95)) errors.push(`shadow should stay fully visible on the far reach at x=${px}, got fade=${s.shadowFade}`);
    await dragLampBy(-130);   // back up for the next sample
  }
}
await page.evaluate(()=>window.__DA.setPos(16.6,19));
await page.waitForTimeout(150);
await dragLampBy(130);
await shot('full-drag');

// ---- item 4: at full drag, from the rim, the shadow sits well ahead of the
// player and the pad — never over the standing d-pad or eye button ----
st=await lampState();
console.log('after full drag at the rim:',JSON.stringify(st));
if(!(st.lampY<=0.55)) errors.push('lamp did not come all the way down: lampY='+st.lampY);
if(!(st.shadowX>22.3)) errors.push('shadow did not reach the far side: shadowX='+st.shadowX);
if(st.shadowVisible!==true) errors.push('shadow should be visible at the across moment');
pos=await page.evaluate(()=>window.__DA.pos);
if(!(st.shadowX>pos[0]+3)) errors.push('shadow does not clear the player/pad by enough margin: shadowX='+st.shadowX+' playerX='+pos[0]);
const lampLow=await page.evaluate(ly=>window.__DA.project(13.5,ly-.6,19),st.lampY);
const dpadRect=await page.$eval('#dpad',el=>el.getBoundingClientRect());
const eyeRect=await page.$eval('#eye',el=>el.getBoundingClientRect());
const overPad=lampLow.x>=dpadRect.left&&lampLow.x<=dpadRect.right&&lampLow.y>=dpadRect.top&&lampLow.y<=dpadRect.bottom;
const overEye=lampLow.x>=eyeRect.left&&lampLow.x<=eyeRect.right&&lampLow.y>=eyeRect.top&&lampLow.y<=eyeRect.bottom;
console.log('lowest lamp geometry projects at',lampLow,'dpad',dpadRect,'eye',eyeRect);
if(overPad||overEye) errors.push('the dragged-down lamp overlaps a control: '+JSON.stringify({lampLow,overPad,overEye}));

// ---- item 4: west of the lamp, the shadow holds a short, growing offset
// ahead of the player instead of being thrown behind it ----
{
  for(const px of [13,14,15]){
    await freshPage();
    await page.evaluate(()=>{window.__DA.jump3d();});
    await page.evaluate((x)=>window.__DA.setPos(x,19),px);
    await page.waitForTimeout(150);
    const s0=await lampState();
    const sp=await lampScreenPos();
    await page.mouse.move(sp.x,sp.y);
    await page.mouse.down();
    await page.mouse.move(sp.x,sp.y+130,{steps:20});
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(100);
    const s1=await lampState();
    console.log(`west-of-lamp x=${px}: u0 shadowX=${s0.shadowX} len=${s0.shadowLen} | u1 shadowX=${s1.shadowX} len=${s1.shadowLen}`);
    if(!s0.shadowVisible||!s1.shadowVisible) errors.push(`shadow not visible west of the lamp at x=${px}`);
    if(!(s0.shadowX>px)) errors.push(`shadow thrown behind the player at x=${px}, u=0: shadowX=${s0.shadowX}`);
    if(!(s1.shadowX>px)) errors.push(`shadow thrown behind the player at x=${px}, u=1: shadowX=${s1.shadowX}`);
    if(!(s1.shadowLen>s0.shadowLen)) errors.push(`shadow did not grow with the drag west of the lamp at x=${px}: u0 len=${s0.shadowLen}, u1 len=${s1.shadowLen}`);
  }
}

// ---- pull the lamp back up, then a refusal: the shadow is short again,
// holding the eye should not swap ----
await freshPage();
await page.evaluate(()=>{window.__DA.jump3d();window.__DA.setPos(9,19);});
await page.waitForTimeout(200);
await driveTo(16.6,19,8000);
await settle();
st=await lampState();
console.log('lamp untouched, shadow should already be short:',JSON.stringify(st));
if(!(st.shadowX<17)) errors.push('lamp did not start with the shadow short of the slit: '+st.shadowX);
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

// ---- the veil dips once per refusal (never strobes on every .4s retry)
// and settles at .87 while the eye stays held over the hole ----
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

// ---- items 1 & 2: the act can no longer be finished without the lamp. For
// each start z, walk straight east (never touching z) and check x never
// crosses HOLE_X0 while unswapped; then an eye hold at that spot refuses,
// and done() never lies ----
for(const z of [7.5,9.6,27.5]){
  await freshPage();
  await page.evaluate((z)=>{window.__DA.jump3d();window.__DA.setPos(14,z);},z);
  await page.waitForTimeout(150);
  let maxX=-Infinity, violated=false;
  const HOLE_X0=17;
  for(let i=0;i<70;i++){
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(55); await page.keyboard.up('ArrowUp'); await page.waitForTimeout(20);
    const p=await page.evaluate(()=>window.__DA.pos);
    maxX=Math.max(maxX,p[0]);
    const s=await lampState();
    if(!s.swapped&&p[0]>HOLE_X0){ violated=true; break; }
    if(p[0]>=23.9)break;
  }
  const p=await page.evaluate(()=>window.__DA.pos);
  console.log(`fence z=${z}: final pos=[${p[0].toFixed(2)},${p[2].toFixed(2)}] maxX=${maxX.toFixed(2)}`);
  if(violated) errors.push(`walked past HOLE_X0 without swapping, start z=${z}: pos=${JSON.stringify(p)}`);
  if(maxX>17) errors.push(`x exceeded HOLE_X0 at start z=${z}: maxX=${maxX}`);
  // an eye hold here must refuse — the shadow was never thrown across
  const eb=await eyeBoxOf();
  await page.mouse.move(eb.x,eb.y);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const st2=await lampState();
  if(st2.swapped) errors.push(`an eye hold swapped without ever crossing, start z=${z}`);
  if(await regionDone()) errors.push(`done() lied after the fence walk, start z=${z}`);
}
await shot('far-fence-refusal');

// ---- the look-back and the lingering echo, plus item 5: it plays behind
// the veil, queued on release rather than at the swap instant, and item 6:
// the lamp dims out of that one frame while the old self stays grounded ----
{
  await freshPage();
  await page.evaluate(()=>{window.__DA.jump3d();window.__DA.setPos(16.66,19);});
  await waitForLamp();
  await page.waitForTimeout(120);
  await dragLampBy(130);
  const eb=await eyeBoxOf();
  await page.mouse.move(eb.x,eb.y);
  await page.mouse.down();
  const t0=Date.now();
  let swapped=await lampState();
  while(Date.now()-t0<6000&&!swapped.swapped){ await page.waitForTimeout(80); swapped=await lampState(); }
  if(!swapped.swapped) errors.push('setup for the look-back test did not swap');
  if(!swapped.oldSelfVisible) errors.push('the old self should be left standing, visible');
  if(swapped.oldSelfY!==0) errors.push('the old self should be grounded at y=0, got y='+swapped.oldSelfY);
  console.log('swapped for look-back test:',JSON.stringify(swapped));

  // item 5: hold on through the swap and 3s beyond — the look-back must NOT
  // have fired yet, since the eye is still held (queued, not played)
  await page.waitForTimeout(3000);
  let held=await lampState();
  console.log('3s after swap, eye still held:',JSON.stringify(held));
  if(held.lookingBack) errors.push('the look-back fired while the eye was still held — it should wait for release');
  if(!held.pendingLookBack) errors.push('the look-back should be queued (pendingLookBack) while the eye is held');
  const veilStillHeld=+(await page.$eval('#veil',el=>getComputedStyle(el).opacity));
  if(veilStillHeld<0.7) errors.push('veil dropped while the eye was still held: '+veilStillHeld);

  // release: the look-back should fire now, and play hidden behind the veil.
  // Headless can render only a couple of frames across the 1.4s window, so
  // poll several samples through it rather than trusting one fixed instant.
  await page.mouse.up();
  let s=await lampState(), sawLookingBack=false, onScreenSample=null, dimSample=null, veilDuring=null;
  const relT0=Date.now();
  while(Date.now()-relT0<1300){
    s=await lampState();
    if(s.lookingBack){
      sawLookingBack=true;
      const p=await page.evaluate(o=>window.__DA.project(o.oldX,.3,o.oldZ),s);
      if(dimSample===null) dimSample=s.lampDim;
      if(veilDuring===null) veilDuring=+(await page.$eval('#veil',el=>getComputedStyle(el).opacity));
      if(!onScreenSample&&p.x>=0&&p.x<=390&&p.y>=0&&p.y<=844){ onScreenSample=p; await shot('lookback'); }
    }
    await page.waitForTimeout(90);
  }
  console.log('look-back window: sawLookingBack=',sawLookingBack,'onScreenSample=',onScreenSample,'dimSample=',dimSample,'veilDuring=',veilDuring);
  if(!sawLookingBack) errors.push('the look-back did not fire on release');
  if(!(veilDuring>=0.7)) errors.push('the look-back is not playing behind the veil: opacity='+veilDuring);
  if(!onScreenSample) errors.push('old self was never on screen during the look-back window (no look-back)');
  // item 6: the lamp itself should be dimmed well out of this shot
  if(!(dimSample<1)) errors.push('the lamp was not dimmed during the look-back: lampDim='+dimSample);

  // the echo: appears once the look-back has returned, then fades and hides
  // again — poll with a generous ceiling since headless clamps dt and can
  // lag real time
  let echoSeenOn=false, echoSeenOff=false;
  const t1=Date.now();
  while(Date.now()-t1<6000){
    s=await lampState();
    if(s.echoVisible) echoSeenOn=true;
    if(echoSeenOn&&!s.echoVisible){ echoSeenOff=true; break; }
    await page.waitForTimeout(120);
  }
  console.log('echo seen on:',echoSeenOn,'then off:',echoSeenOff);
  if(!echoSeenOn) errors.push('the lingering echo never appeared after the look-back');
  if(!echoSeenOff) errors.push('the lingering echo never faded back out');
  s=await lampState();
  if(s.lampDim<1) errors.push('the lamp should be back to full brightness once the look-back has ended: lampDim='+s.lampDim);

  // the far light should still be lit before finishing, drop to core+ring
  // (beam+glow off) once finished, never fully dark before that
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
await freshPage();
await page.evaluate(()=>{window.__DA.jump3d();window.__DA.setPos(16.66,19);});
await waitForLamp();
await page.waitForTimeout(200);
await page.evaluate(()=>{document.getElementById('eye').dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,bubbles:true}));});
await page.waitForTimeout(600);   // at least one failed attempt while the shadow is still short
st=await lampState();
if(st.swapped) errors.push('should not have swapped: the shadow has not crossed yet');
await dragLampBy(130); // cross while the eye is (logically) still held
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
await freshPage();
await page.evaluate(()=>{window.__DA.jump3d();window.__DA.setPos(8,20);window.__DA.setPos(30,20);window.__DA.setPos(25,19);});
await page.waitForTimeout(400);
st=await lampState();
if(st.finished||st.swapped) errors.push('BUG: a walk around the slit finished the region without a swap');
if(await regionDone()) errors.push('BUG: done() lied after a walk-around');

// ---- save / reload / apply: restored, and Continue offers the lamp ----
await page.evaluate(()=>{window.__DA.setPos(16.66,19);});
await waitForLamp();
await page.waitForTimeout(200);
await dragLampBy(130);
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
if(restored.oldSelfY!==0) errors.push('save/load did not restore the old self grounded at y=0, got y='+restored.oldSelfY);

await browser.close();
if(errors.length){console.log('\nERRORS:');errors.forEach(e=>console.log(' - '+e));process.exit(1);}
console.log('\nLAMP OK');
