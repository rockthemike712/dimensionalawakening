// Act I as a sequence: no arrow or counter after the crossing, the arrow
// only after the digest rule, the order Thin -> Corner -> Lamp -> room, the
// residue each region leaves on the player, the room absent until all three
// are done and present after, and Continue at both checkpoints.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE=(process.env.DA_BASE||'http://localhost:8901')+'/index.html';
const errors=[]; const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const page=await ctx.newPage();
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
const snap=()=>page.evaluate(()=>({pos:window.__DA.pos.map(v=>+v.toFixed(2)),region:window.__DA.region,arrow:window.__DA.arrow,counter:window.__DA.counterShown,
  digested:window.__DA.digested,next:window.__DA.next,actDone:window.__DA.actDone,residue:window.__DA.residue,
  prompt:{text:document.getElementById('prompt').textContent,on:document.getElementById('prompt').style.visibility==='visible'},
  regions:Object.fromEntries(window.__DA.regions.map(r=>[r.id,{built:r.built,done:r.done}]))}));
const check=(ok,msg)=>{if(!ok)errors.push(msg);};
// a save with the given regions finished; every value is the region's own save() shape
function saveWith({thin=false,corner=false,lamp=false}){
  return {crossed:true,seeds:3,awakened:.7,roomFold:0,pos:[3,0,0],place:'THE FIELD',s2:{done:0,round:0,arrived:false,active:false},
    visited:[thin&&'thin',corner&&'corner',lamp&&'lamp'].filter(Boolean),t:Date.now(),
    regions:{thin:{slotsPassed:thin?3:0,goalReached:thin,gapCrossed:thin,wallsPassed:[thin,thin,thin]},
             corner:{got1:corner,got2:corner},
             lamp:{dragU:lamp?1:0,swapped:lamp,finished:lamp,oldPos:lamp?[19,19]:null}}};
}
async function walk(ms){ await page.keyboard.down('ArrowUp'); await page.waitForTimeout(ms); await page.keyboard.up('ArrowUp'); }
// on-foot travel toward (tx,tz): 3D screen-relative keys (ArrowUp +x, ArrowDown -x,
// ArrowRight +z, ArrowLeft -z), bounded iterations of held bursts rather than a
// fixed-duration hold, since headless Chromium can run at a fraction of real speed.
const ALLKEYS=['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'];
async function driveOnFoot(tx,tz,{maxIter=60,holdMs=400,tol=.5}={}){
  let p=await page.evaluate(()=>window.__DA.pos);
  for(let i=0;i<maxIter;i++){
    p=await page.evaluate(()=>window.__DA.pos);
    const dx=tx-p[0], dz=tz-p[2];
    if(Math.abs(dx)<tol&&Math.abs(dz)<tol)break;
    const ks=[];
    if(dx>.3)ks.push('ArrowUp'); else if(dx<-.3)ks.push('ArrowDown');
    if(dz>.3)ks.push('ArrowRight'); else if(dz<-.3)ks.push('ArrowLeft');
    for(const k of ks)await page.keyboard.down(k);
    await page.waitForTimeout(holdMs);
    for(const k of ALLKEYS)await page.keyboard.up(k);
    console.log('  driveOnFoot step',i,'pos',p.map(v=>+v.toFixed(2)),'->target',tx,tz);
  }
  return await page.evaluate(()=>window.__DA.pos);
}
const norm180=(d)=>{d=((d%360)+540)%360-180;return d;};
async function arrowBearing(px,pz,label,tgt=[7,1,-16]){
  await page.evaluate(([x,z])=>window.__DA.setPos(x,z),[px,pz]);
  await page.waitForTimeout(500);
  const proj=await page.evaluate((t)=>window.__DA.project(t[0],t[1],t[2]),tgt);
  const rotStr=await page.evaluate(()=>document.getElementById('beaconArrow').style.transform);
  const dims=await page.evaluate(()=>({w:innerWidth,h:innerHeight}));
  const m=/rotate\(([-\d.]+)deg\)/.exec(rotStr);
  const rot=m?parseFloat(m[1]):NaN;
  const phi=Math.atan2(proj.y-dims.h*.42,proj.x-dims.w*.5)*180/Math.PI;
  const diff=norm180(rot-(phi-90));
  console.log('arrow bearing ('+label+'): proj='+JSON.stringify(proj)+' rot='+rot.toFixed(1)+' phi-90='+(phi-90).toFixed(1)+' diff='+diff.toFixed(1));
  return diff;
}

await page.goto(BASE,{waitUntil:'networkidle'}); await page.waitForTimeout(1200);
await page.evaluate(()=>window.__DA.clearSave());

// 1. straight after the crossing: nothing tells the player what to want
await page.evaluate(()=>window.__DA.jump3d()); await page.waitForTimeout(2500);
let s=await snap(); console.log('after the crossing:',JSON.stringify({arrow:s.arrow,counter:s.counter,digested:s.digested,prompt:s.prompt,next:s.next,room:s.regions.room}));
check(!s.arrow,'arrow shown before the digest rule'); check(!s.counter,'counter shown in the field'); check(!s.digested,'digested right after the crossing');
check(!s.prompt.on,'a prompt is up right after the crossing: '+s.prompt.text);
check(!s.regions.room.built,'the room exists before Act I is done');
check(s.next==='thin','first rung is not thin: '+s.next);

// 1b. digest is earned by walking, not faked by waiting: hold a direction
// (ArrowRight, +z in 3D — chosen so the player drifts along the open field at
// x~2.2, short of every region's own x0, instead of wandering into Thin,
// Corner or the Lamp and tripping their own arrow-suppression) for ~15s of
// wall-clock and confirm real distance was covered while digested stays
// false. Headless runs at 5-7fps so movement-per-second is far below
// real-time; measure the actual distance travelled rather than trusting the
// clock, and require it clear a comfortable floor (20 units) well short of
// the walked>140 rule.
const p0=await page.evaluate(()=>window.__DA.pos);
await page.keyboard.down('ArrowRight'); await page.waitForTimeout(15000); await page.keyboard.up('ArrowRight');
const p1=await page.evaluate(()=>window.__DA.pos);
const digestedMid=await page.evaluate(()=>window.__DA.digested);
const walkedDist=Math.hypot(p1[0]-p0[0],p1[2]-p0[2]);
console.log('digest-earn: pos',p0.map(v=>+v.toFixed(2)),'->',p1.map(v=>+v.toFixed(2)),'dist='+walkedDist.toFixed(2),'digested='+digestedMid);
check(walkedDist>=20,'held ArrowRight for 15s but moved only '+walkedDist.toFixed(2)+' units — test cannot trust the digest-earn check');
check(!digestedMid,'digested became true after 15s of holding a direction, before the walked>140 rule should fire (moved '+walkedDist.toFixed(2)+')');

// 2. digested: the arrow and the one prompt, pointing at Thin
await page.evaluate(()=>window.__DA.digest()); await page.waitForTimeout(900);
s=await snap(); console.log('digested:',JSON.stringify({arrow:s.arrow,prompt:s.prompt,next:s.next}));
check(s.arrow,'no arrow after digesting'); check(s.prompt.on&&s.prompt.text==='Follow the lights.','prompt after digesting: '+JSON.stringify(s.prompt));
check(s.next==='thin','arrow does not point at thin: '+s.next);

// 2b. arrow bearing: with the next rung pinned to Thin, the drawn rotation
// must actually point at Thin's entrance (7,0,-16), not just exist. Both
// spots sit outside every region's bounds (open field), so the arrow stays
// live. (2,-14) is roughly dead ahead of the entrance; (7,-8) is off to the
// side (same x, far side in z).
{
  const d1=await arrowBearing(2,-14,'dead ahead');
  check(Math.abs(d1)<=30,'arrow bearing off by '+d1.toFixed(1)+'deg from dead-ahead of Thin (2,-14)');
  const d2=await arrowBearing(7,-8,'off to the side');
  check(Math.abs(d2)<=30,'arrow bearing off by '+d2.toFixed(1)+'deg from the side-on approach to Thin (7,-8)');
}

// 3. inside an unfinished rung the arrow stands down and the prompt clears
await page.evaluate(()=>window.__DA.setPos(7.5,-14)); await page.waitForTimeout(900);
s=await snap(); console.log('inside thin:',JSON.stringify({region:s.region,arrow:s.arrow,prompt:s.prompt}));
check(s.region==='thin','not in thin at (7.5,-14): '+s.region); check(!s.arrow,'arrow shown inside unfinished thin');
check(!(s.prompt.on&&s.prompt.text==='Follow the lights.'),"'Follow the lights.' still up inside thin");
await page.evaluate(()=>window.__DA.setPos(3,-4)); await page.waitForTimeout(900);
s=await snap(); check(s.region===null&&s.arrow,'arrow did not come back in the field: '+JSON.stringify({region:s.region,arrow:s.arrow}));
// 3b. wandering into a LATER rung during free play (the Lamp is the nearest thing to the
// crossing) must not silence the only signpost: inside the Lamp with Thin still next, the
// arrow keeps pointing at Thin
await page.evaluate(()=>window.__DA.setPos(9,13.5)); await page.waitForTimeout(900);
s=await snap(); console.log('inside the lamp, next=thin:',JSON.stringify({region:s.region,arrow:s.arrow,next:s.next}));
check(s.region==='lamp','not in the lamp at (9,13.5): '+s.region); check(s.next==='thin','next is not thin inside the lamp: '+s.next);
check(s.arrow,'the arrow hid inside the Lamp while Thin was still the next rung');
await page.evaluate(()=>window.__DA.setPos(3,-4)); await page.waitForTimeout(600);

// 4. Thin done: the arrow moves to the Corner; the stride flattens now and then
check(await page.evaluate(d=>window.__DA.applySave(d),saveWith({thin:true})),'applySave(thin) refused');
await page.waitForTimeout(600); await page.evaluate(()=>window.__DA.setPos(3,-2));
s=await snap(); console.log('thin done:',JSON.stringify({next:s.next,actDone:s.actDone,room:s.regions.room,thin:s.regions.thin}));
check(s.regions.thin.done,'thin not done after load'); check(s.next==='corner','after thin the next rung is not corner: '+s.next);
check(!s.regions.room.built,'the room exists after only thin');
let pulses=0; for(let i=0;i<12;i++){ await walk(350); const r=await page.evaluate(()=>window.__DA.residue); if(r.flatPulse>0)pulses++; await page.waitForTimeout(60); }
console.log('thin residue: flat pulses seen',pulses); check(pulses>0,'no flatten-in-the-stride after thin');

// 4b. the transition to the Corner is walked, not teleported: from Thin's own
// goal, drive on foot (screen-relative keys, never setPos) toward the
// Corner's entrance and confirm the region actually changes.
await page.evaluate(()=>window.__DA.setPos(27.6,-16)); await page.waitForTimeout(300);
const cornerPos=await driveOnFoot(21.5,3,{maxIter:60,holdMs:400});
const regAfterCorner=await page.evaluate(()=>window.__DA.region);
console.log('on foot, Thin goal -> Corner: final pos',cornerPos.map(v=>+v.toFixed(2)),'region='+regAfterCorner);
check(regAfterCorner==='corner','walking on foot from Thin\'s goal never reached the Corner (final pos '+JSON.stringify(cornerPos.map(v=>+v.toFixed(2)))+')');

// 5. Corner done: the arrow moves to the Lamp; a second, mirrored shadow flickers
check(await page.evaluate(d=>window.__DA.applySave(d),saveWith({thin:true,corner:true})),'applySave(corner) refused');
await page.waitForTimeout(600); await page.evaluate(()=>window.__DA.setPos(3,-2));
s=await snap(); console.log('corner done:',JSON.stringify({next:s.next,actDone:s.actDone,room:s.regions.room}));
check(s.next==='lamp','after the corner the next rung is not lamp: '+s.next); check(!s.regions.room.built,'the room exists after thin+corner');
await page.evaluate(()=>{window.__mirrorSeen=false;(function f(){if(window.__DA.residue.mirror)window.__mirrorSeen=true;requestAnimationFrame(f);})();});
let mirror=false; for(let i=0;i<70&&!mirror;i++){ mirror=await page.evaluate(()=>window.__mirrorSeen); await page.waitForTimeout(200); }
console.log('corner residue: mirrored shadow seen',mirror); check(mirror,'no mirrored shadow flicker after the corner');
const shadowBefore=(await page.evaluate(()=>window.__DA.residue)).shadowHex; check(shadowBefore===0,'shadow already lightened before the lamp: '+shadowBefore.toString(16));

// 6. Lamp done: Act I is over; the room exists, the arrow points there, the shadow lightens
check(await page.evaluate(d=>window.__DA.applySave(d),saveWith({thin:true,corner:true,lamp:true})),'applySave(all) refused');
await page.waitForTimeout(1200); await page.evaluate(()=>window.__DA.setPos(14,0)); await page.waitForTimeout(900);
s=await snap(); console.log('act done:',JSON.stringify({actDone:s.actDone,next:s.next,arrow:s.arrow,room:s.regions.room,residue:s.residue}));
check(s.actDone,'actDone false with all three done'); check(s.regions.room.built,'the room did not appear when Act I finished');
check(s.residue.s2active,'the room is not active after Act I'); check(s.next==='room','arrow does not move on to the room: '+s.next); check(s.arrow,'no arrow to the room');
check(s.residue.shadowHex===0x16222e,'shadow not lightened after the lamp: '+s.residue.shadowHex.toString(16));
await page.screenshot({path:'shots/act1-room-present.png'});

// 6b. the way home is walked too: from the Lamp's far side, on foot (screen-
// relative keys, never setPos), north out of the Lamp's own bounds (z>11)
// then west, and confirm the crossing is reachable again.
await page.evaluate(()=>window.__DA.setPos(23.5,13.5)); await page.waitForTimeout(300);
const northPos=await driveOnFoot(23.5,5,{maxIter:60,holdMs:400});
console.log('on foot, lamp far side north:',northPos.map(v=>+v.toFixed(2)));
const homePos=await driveOnFoot(8,5,{maxIter:40,holdMs:400});
console.log('on foot, then west toward the crossing:',homePos.map(v=>+v.toFixed(2)));
check(homePos[0]<12,'walking on foot from the Lamp never got back west of x=12 (final pos '+JSON.stringify(homePos.map(v=>+v.toFixed(2)))+')');
check(homePos[2]>-7&&homePos[2]<7,'walking on foot from the Lamp did not land back near the crossing band (final pos '+JSON.stringify(homePos.map(v=>+v.toFixed(2)))+')');

// 7. Continue at checkpoint 2: reload, the room is there at once, nothing is half-built
await page.evaluate(()=>window.__DA.save()); await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(1200);
let cont=await page.evaluate(()=>{const d=window.__DA.loadSave();return d&&window.__DA.applySave(d);}); await page.waitForTimeout(900);
s=await snap(); console.log('continue (act done):',JSON.stringify({applied:cont,actDone:s.actDone,room:s.regions.room,s2:s.residue.s2active,rise:s.residue.rise}));
check(cont&&s.actDone&&s.regions.room.built&&s.residue.s2active,'Continue after Act I did not restore the room');
check(s.residue.rise===null,'the room is still rising on Continue');

// 8. Continue at checkpoint 1: a save straight after the crossing has no room and no arrow yet
await page.evaluate(()=>window.__DA.clearSave()); await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(1200);
await page.evaluate(()=>{window.__DA.jump3d();window.__DA.save();});
await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(1200);
cont=await page.evaluate(()=>{const d=window.__DA.loadSave();return d&&window.__DA.applySave(d);}); await page.waitForTimeout(1500);
s=await snap(); console.log('continue (crossed):',JSON.stringify({applied:cont,crossed:true,room:s.regions.room,next:s.next,arrow:s.arrow,counter:s.counter,actDone:s.actDone}));
check(cont,'Continue after the crossing refused'); check(!s.regions.room.built,'the room exists on a fresh Continue');
check(!s.actDone&&s.next==='thin','a fresh Continue does not start at thin'); check(!s.counter,'counter shown on Continue');

// 9. the room rises only when the crossing point is on screen
await page.evaluate(()=>window.__DA.setPos(24,19)); await page.waitForTimeout(400);
await page.evaluate(()=>window.__DA.s2start()); await page.waitForTimeout(500);
let r=await page.evaluate(()=>window.__DA.residue); console.log('room started out of view:',JSON.stringify(r));
check(r.s2active&&r.risePending&&r.rise===null,'the room rose while the crossing was off screen');
await page.evaluate(()=>window.__DA.setPos(0,0)); await page.waitForTimeout(700);
r=await page.evaluate(()=>window.__DA.residue); console.log('crossing in view:',JSON.stringify(r));
check(!r.risePending&&r.rise!==null,'the room did not rise once the crossing was on screen');

await ctx.close(); await browser.close();
if(errors.length){console.log('ERRORS');for(const e of errors)console.log(' - '+e);process.exit(1);}
console.log('ACT1 OK');
