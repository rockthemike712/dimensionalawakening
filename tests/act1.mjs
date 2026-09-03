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

await page.goto(BASE,{waitUntil:'networkidle'}); await page.waitForTimeout(1200);
await page.evaluate(()=>window.__DA.clearSave());

// 1. straight after the crossing: nothing tells the player what to want
await page.evaluate(()=>window.__DA.jump3d()); await page.waitForTimeout(2500);
let s=await snap(); console.log('after the crossing:',JSON.stringify({arrow:s.arrow,counter:s.counter,digested:s.digested,prompt:s.prompt,next:s.next,room:s.regions.room}));
check(!s.arrow,'arrow shown before the digest rule'); check(!s.counter,'counter shown in the field'); check(!s.digested,'digested right after the crossing');
check(!s.prompt.on,'a prompt is up right after the crossing: '+s.prompt.text);
check(!s.regions.room.built,'the room exists before Act I is done');
check(s.next==='thin','first rung is not thin: '+s.next);

// 2. digested: the arrow and the one prompt, pointing at Thin
await page.evaluate(()=>window.__DA.digest()); await page.waitForTimeout(900);
s=await snap(); console.log('digested:',JSON.stringify({arrow:s.arrow,prompt:s.prompt,next:s.next}));
check(s.arrow,'no arrow after digesting'); check(s.prompt.on&&s.prompt.text==='Follow the lights.','prompt after digesting: '+JSON.stringify(s.prompt));
check(s.next==='thin','arrow does not point at thin: '+s.next);

// 3. inside an unfinished rung the arrow stands down and the prompt clears
await page.evaluate(()=>window.__DA.setPos(7.5,-14)); await page.waitForTimeout(900);
s=await snap(); console.log('inside thin:',JSON.stringify({region:s.region,arrow:s.arrow,prompt:s.prompt}));
check(s.region==='thin','not in thin at (7.5,-14): '+s.region); check(!s.arrow,'arrow shown inside unfinished thin');
check(!(s.prompt.on&&s.prompt.text==='Follow the lights.'),"'Follow the lights.' still up inside thin");
await page.evaluate(()=>window.__DA.setPos(3,-4)); await page.waitForTimeout(900);
s=await snap(); check(s.region===null&&s.arrow,'arrow did not come back in the field: '+JSON.stringify({region:s.region,arrow:s.arrow}));

// 4. Thin done: the arrow moves to the Corner; the stride flattens now and then
check(await page.evaluate(d=>window.__DA.applySave(d),saveWith({thin:true})),'applySave(thin) refused');
await page.waitForTimeout(600); await page.evaluate(()=>window.__DA.setPos(3,-2));
s=await snap(); console.log('thin done:',JSON.stringify({next:s.next,actDone:s.actDone,room:s.regions.room,thin:s.regions.thin}));
check(s.regions.thin.done,'thin not done after load'); check(s.next==='corner','after thin the next rung is not corner: '+s.next);
check(!s.regions.room.built,'the room exists after only thin');
let pulses=0; for(let i=0;i<12;i++){ await walk(350); const r=await page.evaluate(()=>window.__DA.residue); if(r.flatPulse>0)pulses++; await page.waitForTimeout(60); }
console.log('thin residue: flat pulses seen',pulses); check(pulses>0,'no flatten-in-the-stride after thin');

// 5. Corner done: the arrow moves to the Lamp; a second, mirrored shadow flickers
check(await page.evaluate(d=>window.__DA.applySave(d),saveWith({thin:true,corner:true})),'applySave(corner) refused');
await page.waitForTimeout(600); await page.evaluate(()=>window.__DA.setPos(3,-2));
s=await snap(); console.log('corner done:',JSON.stringify({next:s.next,actDone:s.actDone,room:s.regions.room}));
check(s.next==='lamp','after the corner the next rung is not lamp: '+s.next); check(!s.regions.room.built,'the room exists after thin+corner');
let mirror=false; for(let i=0;i<50&&!mirror;i++){ mirror=(await page.evaluate(()=>window.__DA.residue)).mirror; await page.waitForTimeout(200); }
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

await ctx.close(); await browser.close();
if(errors.length){console.log('ERRORS');for(const e of errors)console.log(' - '+e);process.exit(1);}
console.log('ACT1 OK');
