// LOWER THE LAMP: drag the lamp down its line of light, watch the shadow race
// across the hole, close your eyes at the right moment to trade places with it.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const errors=[]; const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const page=await ctx.newPage();
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
await page.goto((process.env.DA_BASE||'http://localhost:8901')+'/index.html',{waitUntil:'networkidle'});
await page.waitForTimeout(800);

const shot=(name)=>page.screenshot({path:`shots/lamp-${name}.png`});
const lampState=()=>page.evaluate(()=>window.__DA.regions.find(r=>r.id==='lamp').state);
const ALL=['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'];
async function driveTo(tx,tz,ms=12000){
  const t0=Date.now();
  while(Date.now()-t0<ms){
    const p=await page.evaluate(()=>window.__DA.pos);
    const dx=tx-p[0], dz=tz-p[2];
    if(Math.abs(dx)<.35&&Math.abs(dz)<.35)break;
    const ks=[];
    // in 3D: ArrowUp is +x, ArrowRight is +z
    if(dx>.3)ks.push('ArrowUp'); else if(dx<-.3)ks.push('ArrowDown');
    if(dz>.3)ks.push('ArrowRight'); else if(dz<-.3)ks.push('ArrowLeft');
    for(const k of ks)await page.keyboard.down(k);
    await page.waitForTimeout(150);
    for(const k of ALL)await page.keyboard.up(k);
  }
}

// ---- enter 3D, walk to the region, get blocked at the rim ----
await page.evaluate(()=>{window.__DA.jump3d();window.__DA.setPos(10,13);});
await page.waitForTimeout(300);
let st=await lampState();
console.log('lamp on enter:',JSON.stringify(st));
await page.keyboard.down('ArrowRight'); // +z, "toward the hole"
await page.waitForTimeout(3500);
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(300);
let pos=await page.evaluate(()=>window.__DA.pos);
console.log('blocked at:',pos.map(v=>v.toFixed(2)));
if(pos[2]>=17.2) errors.push('did not block at the rim: z='+pos[2]);
await shot('rim');

st=await lampState();
console.log('shadow short (lamp high):',JSON.stringify(st));
if(!(st.shadowZ<17)) errors.push('shadow should sit short of the hole while the lamp is high, got '+st.shadowZ);

// ---- grab the lamp, drag it down the line of light ----
// The grab box spans the whole vertical column, so any on-screen point along
// it works even when the lamp itself (near the top of its range) is off the
// top of a portrait screen — that is exactly what makes it grabbable at all.
let sp=await page.evaluate(()=>window.__DA.project(15,0.5,14));
await page.mouse.move(sp.x,sp.y);
await page.mouse.down();
let y=sp.y;
for(let i=0;i<50;i++){
  y+=14;
  await page.mouse.move(sp.x,y,{steps:2});
  await page.waitForTimeout(60);
  st=await lampState();
  if(st.shadowZ>22.5) break;
}
await page.mouse.up();
await page.waitForTimeout(300);
st=await lampState();
console.log('after dragging the lamp down:',JSON.stringify(st));
if(!(st.lampY<1)) errors.push('lamp did not come down: lampY='+st.lampY);
if(!(st.shadowZ>22.5)) errors.push('shadow did not reach the far side: shadowZ='+st.shadowZ);
await shot('shadow-across');

// ---- close your eyes: hold the eye button, the swap happens under the veil ----
const eyeBox=await page.$eval('#eye',el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
await page.mouse.move(eyeBox.x,eyeBox.y);
await page.mouse.down();
await page.waitForTimeout(700);
await page.mouse.up();
await page.waitForTimeout(2200); // footsteps (~1.2s) + the dolly (~0.35s) + margin
pos=await page.evaluate(()=>window.__DA.pos);
st=await lampState();
console.log('after the swap:',JSON.stringify(st),'pos=',pos.map(v=>v.toFixed(2)));
if(!(pos[2]>22)) errors.push('player did not end up on the far side: z='+pos[2]);
if(!st.swapped) errors.push('region does not report swapped');
await shot('after-swap');

// ---- a refusal: holding the eye again (shadow hidden post-swap) should not re-trigger ----
await page.mouse.move(eyeBox.x,eyeBox.y);
await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
await page.waitForTimeout(2200);
pos=await page.evaluate(()=>window.__DA.pos);
if(pos[2]<=22) errors.push('an unexpected second swap moved the player back: z='+pos[2]);

// ---- reach the light beyond the hole ----
await driveTo(15,25,15000);
await page.waitForTimeout(400);
st=await lampState();
console.log('at the far light:',JSON.stringify(st));
if(!st.finished) errors.push('region did not finish after reaching the far light');
const regionDone=await page.evaluate(()=>window.__DA.regions.find(r=>r.id==='lamp').done);
if(!regionDone) errors.push('done() did not report true');

// ---- save / reload / apply: restored ----
await page.evaluate(()=>window.__DA.save());
await page.reload({waitUntil:'networkidle'});
await page.waitForTimeout(800);
const shown=await page.$eval('#resume',e=>getComputedStyle(e).display);
if(shown==='none') errors.push('resume not offered after saving in the lamp region');
await page.tap('#resumeYes');
await page.waitForTimeout(700);
const restored=await lampState();
const restoredDone=await page.evaluate(()=>window.__DA.regions.find(r=>r.id==='lamp').done);
console.log('restored:',JSON.stringify(restored),'done=',restoredDone);
if(!restored.swapped) errors.push('save/load did not restore swapped');
if(!restoredDone) errors.push('save/load did not restore done()');

await browser.close();
if(errors.length){console.log('\nERRORS:');errors.forEach(e=>console.log(' - '+e));process.exit(1);}
console.log('\nLAMP OK');
