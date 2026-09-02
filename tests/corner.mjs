// The Corner Comes to You: two edges, order matters, the corner comes to
// whoever is standing on the crossing.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE=process.env.DA_BASE||'http://localhost:8901'; const errors=[];
const browser=await chromium.launch(); const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const page=await ctx.newPage();
page.on('pageerror',e=>errors.push('pageerror: '+e.message)); page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
await page.goto(BASE+'/index.html',{waitUntil:'networkidle'}); await page.waitForTimeout(800);
// consume the core's own one-time 'digested' trigger up front — it fires
// on 60s elapsed OR 40 units walked and posts its own one-time 'Follow the
// lights.' prompt, unrelated to anything under test here, and this test's
// own real running time (shared, loaded environment) is not reliably under
// 60s, so without this the two systems race for the prompt element.
await page.evaluate(()=>{window.__DA.jump3d();window.__DA.setPos(17,0);window.__DA.digest();}); await page.waitForTimeout(1200);
const st=()=>page.evaluate(()=>window.__DA.regions.find(r=>r.id==='corner'));
const ALL=['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'];
async function driveTo(tx,tz,ms=15000){const t0=Date.now();while(Date.now()-t0<ms){const p=await page.evaluate(()=>window.__DA.pos);const dx=tx-p[0],dz=tz-p[2];
  if(Math.abs(dx)<.4&&Math.abs(dz)<.4)break;const ks=[];if(dx>.3)ks.push('ArrowUp');else if(dx<-.3)ks.push('ArrowDown');if(dz>.3)ks.push('ArrowRight');else if(dz<-.3)ks.push('ArrowLeft');
  for(const k of ks)await page.keyboard.down(k);await page.waitForTimeout(150);for(const k of ALL)await page.keyboard.up(k);}}
// A: along z at x=27, draws horizontal on screen -> perpendicular drag is vertical (clientY), down = pull.
// B: along x at z=0, draws vertical on screen -> perpendicular drag is horizontal (clientX).
// Edge A's aim point tracks the player's own z (offset by 1, clear of the
// exact A/B tie at the crossing itself) so it never drifts to the edge of a
// 36-degree portrait frustum once the player is standing close to the
// crossing, as item 2 now requires for any grab at all; edge B's aim point
// sits on its own line (z=CZ=0, which every test position here is close to).
async function edgePoint(which){ const z=(await page.evaluate(()=>window.__DA.pos))[2]; return page.evaluate(([w,zz])=>window.__DA.project(w==='A'?27:24,1,w==='A'?zz+1:0),[which,z]); }
async function dragEdge(which){
  const p=await edgePoint(which);
  await page.mouse.move(p.x,p.y); await page.mouse.down();
  if(which==='A')await page.mouse.move(p.x,p.y+300,{steps:20}); else await page.mouse.move(p.x-260,p.y,{steps:20});
  await page.mouse.up(); await page.waitForTimeout(1500);
}
async function tapEdge(which){
  const p=await edgePoint(which);
  await page.mouse.move(p.x,p.y); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(200);
}
let s=await st(); console.log('arrived:',JSON.stringify(s));
if(!s||!s.built)errors.push('corner not built');

// item 2: pointer handlers gate on being in the region — a tap from inside
// the room must not fold or latch anything here.
await page.evaluate(()=>window.__DA.setPos(6,0)); await page.waitForTimeout(400);
await page.mouse.click(195,422); await page.waitForTimeout(400);
s=await st(); console.log('after tap from the room:',JSON.stringify(s.state));
if(s.state.foldA!==0||s.state.foldB!==0)errors.push('a tap from outside the region changed the corner: '+JSON.stringify(s.state));
await page.evaluate(()=>window.__DA.setPos(17,0)); await page.waitForTimeout(1000);

// item 2: a pull only does something within 4.5 units of the crossing — from
// ten units out (the old entrance's distance) it must do nothing at all.
{
  const before=await st();
  await dragEdge('A');
  const after=await st();
  console.log('grab attempt from ten units out:',JSON.stringify(after.state));
  if(after.state.foldA!==0||after.state.order!==before.state.order)
    errors.push('a pull from outside GRAB_R changed the corner: '+JSON.stringify(after.state));
}

// item 2: the entrance now sits ON the crossing — walk there.
await driveTo(27,0);
{ const p=await page.evaluate(()=>window.__DA.pos); const d=Math.hypot(p[0]-27,p[2]-0);
  console.log('pos at the entrance:',JSON.stringify(p));
  if(d>1)errors.push('walking to the entrance did not land on the crossing (d='+d.toFixed(2)+')'); }
await page.screenshot({path:'shots/corner-0-arrive.png'});

// item 5: the only real stuck state is both latched and far from the
// crossing — the old "wrong order" prompt could never actually happen. Do
// this now, before the rest of the walk here (grid teleports don't count,
// but every driveTo does) pushes total distance past the *core's own*,
// unrelated 40-unit "digested" threshold, which posts a one-time 'Follow
// the lights.' prompt of its own and would otherwise race this one.
// Latch B-first (order 1) at (24,-2), not the crossing itself: order 1's
// own gate sweeps as close as ~0.9 units from the crossing *mid-drag*
// (checked by sampling warp() over the whole fold range, not just its
// resting fa=fb=1 endpoint — the two hinges compound, so the gate's path
// arcs through the crossing's own COLLECT_R on the way there), which would
// auto-collect it right out from under this test; (24,-2) keeps clear of
// that arc the whole way through, same as the order-toggle test above.
await driveTo(24,-2);
await dragEdge('B'); await dragEdge('A');
s=await st(); if(s.state.foldA<.9||s.state.foldB<.9)errors.push('could not latch both folds for the prompt test: '+JSON.stringify(s.state));
if(s.state.got1||s.state.got2)errors.push('latching for the prompt test collected a gate by accident: '+JSON.stringify(s.state));
// (16,-3): still >6 from the crossing, and its straight-line approach from
// (24,-2) stays a safe ~2.7+ units clear of both (now stationary) gates.
await driveTo(16,-3);
await page.waitForTimeout(15500);
const promptText=await page.evaluate(()=>document.getElementById('prompt').textContent);
const promptVisible=await page.evaluate(()=>document.getElementById('prompt').style.visibility==='visible');
console.log('prompt after 15s idle, far from the crossing:',JSON.stringify({promptText,promptVisible}));
if(!promptVisible||promptText!=='Stand on the crossing.')errors.push('wrong or missing stuck prompt: '+JSON.stringify({promptText,promptVisible}));
await driveTo(24,-2); await page.waitForTimeout(700);
const promptVisible2=await page.evaluate(()=>document.getElementById('prompt').style.visibility==='visible');
if(promptVisible2)errors.push('the prompt did not clear once back near the crossing');
await tapEdge('B'); await tapEdge('A'); await page.waitForTimeout(1000);   // unfold before the rest of the tests

// item 1: the order flag must track the *actual* fold sequence, including a
// tap-off/tap-on toggle with the other edge still up. Do this off the
// crossing (still inside GRAB_R) so neither gate's own swept path — for
// either order, over the whole fold range including the spring's overshoot
// past 1 — ever passes within COLLECT_R of where we're standing; (24,-2)
// keeps a margin of ~2.2 units the whole way, checked by direct sampling of
// warp() along the fold sweep, well clear of a gate auto-collecting out
// from under this test the instant the newly-tapped edge crosses fold 0.9.
await driveTo(24,-2);
await dragEdge('A'); s=await st(); if(s.state.foldA<.9||s.state.order!==0)errors.push('edge A did not latch A-first: '+JSON.stringify(s.state));
await page.screenshot({path:'shots/corner-1-edgeA.png'});
await dragEdge('B'); s=await st(); console.log('both up, A first:',JSON.stringify(s.state));
if(s.state.foldB<.9||s.state.order!==0)errors.push('both up should still read order 0 (A first): '+JSON.stringify(s.state));
await tapEdge('A');   // tap off
s=await st(); if(s.state.order!==0)errors.push('turning an edge off must not change order: '+JSON.stringify(s.state));
await tapEdge('A');   // tap back on, with B still up — the newly raised edge is applied last, i.e. B first
s=await st(); console.log('after tap-off/tap-on A with B still up:',JSON.stringify(s.state));
if(s.state.order!==1)errors.push('re-raising A while B is still up must flip the order to B-first (1), got '+s.state.order);
await page.waitForTimeout(900);
s=await st(); console.log('settled after the toggle:',JSON.stringify(s.state));
if(!s.state.marker2On||s.state.marker1On)errors.push('the live marker did not follow the toggled order: '+JSON.stringify(s.state));
{ const l2=await page.evaluate(()=>window.__DA_corner.light(2));
  if(!Number.isFinite(l2.x)||!Number.isFinite(l2.z))errors.push('light 2 is not a finite warp() result after the toggle: '+JSON.stringify(l2)); }
// both folds up, order 1's gate visible ahead but not yet walked into.
await page.screenshot({path:'shots/corner-2-both-pulled.png'});

// item 4: the mirrored self — palette, lift, compression, and the hide-near-
// the-crossing rule — checked over a grid of player positions while both
// folds are latched (they still are, from the toggle above).
{
  const pts=[[16,-8],[16,8],[38,-8],[38,8],[27,-8],[27,8],[20,-8],[34,8],[18,-3],[36,3]];
  let offFrame=0;
  for(const [x,z] of pts){
    await page.evaluate(([xx,zz])=>window.__DA.setPos(xx,zz),[x,z]); await page.waitForTimeout(300);
    const g=await page.evaluate(()=>window.__DA_corner.ghost());
    if(g.visible){
      const pr=await page.evaluate(gg=>window.__DA.project(gg.x,gg.y,gg.z),g);
      if(pr.x<0||pr.x>390||pr.y<0||pr.y>844){offFrame++; console.log('ghost out of frame at',x,z,'->',pr);}
    }
  }
  if(offFrame>0)errors.push(offFrame+' of '+pts.length+' ghost positions projected outside the 390x844 frame');
  await page.evaluate(()=>window.__DA.setPos(24,-4)); await page.waitForTimeout(300);
  await page.screenshot({path:'shots/corner-3-ghost.png'});
  await page.evaluate(()=>window.__DA.setPos(27,0.4)); await page.waitForTimeout(300);
  const hiddenNearCrossing=await page.evaluate(()=>window.__DA_corner.ghost());
  if(hiddenNearCrossing.visible)errors.push('the mirrored self should hide within 1 unit of the crossing: '+JSON.stringify(hiddenNearCrossing));
}

// wrong light / correct light for this order (B first, A second) — the far
// gate for order 1 sits ~5.3 units out, so this doesn't auto-collect just by
// standing near the crossing, unlike order 0 below. The two order-1 gates
// (~1.6 units apart) sit close enough to each other that walking right onto
// the wrong one's exact coordinates would also land inside the correct
// one's own COLLECT_R — so approach it from the side facing away from the
// correct gate, close enough to trip the wrong-light check without also
// walking into the right one by accident.
await driveTo(27,0);
const wrongBefore=await page.evaluate(()=>window.__DA_corner.wrongTouches);
const l1wrong=await page.evaluate(()=>window.__DA_corner.light(1));
const l2peek=await page.evaluate(()=>window.__DA_corner.light(2));
{
  // walking there step-by-step (driveTo's bang-bang controller can overshoot
  // by close to a full step) risks sweeping through the correct gate's own
  // COLLECT_R along the way, on top of the two gates' own ~1.6-unit spacing
  // — so land on the approach point in one jump instead of stepping toward it.
  let ax=l1wrong.x-l2peek.x, az=l1wrong.z-l2peek.z; const alen=Math.hypot(ax,az)||1; ax/=alen; az/=alen;
  await page.evaluate(([xx,zz])=>window.__DA.setPos(xx,zz),[l1wrong.x+ax*1.0, l1wrong.z+az*1.0]);
  await page.waitForTimeout(600);
}
s=await st(); console.log('after walking to the wrong light (order 1):',JSON.stringify(s.state));
await page.screenshot({path:'shots/corner-4-wrong.png'});
const wrongAfter=await page.evaluate(()=>window.__DA_corner.wrongTouches);
if(s.state.got1)errors.push('the wrong light collected');
if(s.state.got2)errors.push('the correct light was collected by accident while testing the wrong one');
if(wrongAfter<=wrongBefore)errors.push('walking to the wrong light gave no feedback (wrongTouches unchanged)');
const l2=await page.evaluate(()=>window.__DA_corner.light(2));
await driveTo(l2.x,l2.z); await page.waitForTimeout(800);
s=await st(); console.log('after walking into the correct light (order 1):',JSON.stringify(s.state));
if(!s.state.got2)errors.push('light 2 (B->A) not collected');
if(s.state.foldA>.2||s.state.foldB>.2)errors.push('collecting did not spring the paper back open: '+JSON.stringify(s.state));

// items 2 + 6: order A->B, latched right at the crossing. Its own gate sits
// ~0.4 units out — well inside COLLECT_R — so simply finishing the second
// (B) drag collects it *while the pointer is still down*. That is exactly
// the "collecting mid-drag" bug: the drag must not half-restore afterward.
await driveTo(27,0);
s=await st(); if(s.state.foldA>.05||s.state.foldB>.05)errors.push('folds were not at rest before the A->B test: '+JSON.stringify(s.state));
await dragEdge('A'); s=await st(); if(s.state.foldA<.9||s.state.order!==0)errors.push('edge A did not latch fresh at the crossing: '+JSON.stringify(s.state));
{
  const p=await edgePoint('B');
  await page.mouse.move(p.x,p.y); await page.mouse.down();
  await page.mouse.move(p.x-260,p.y,{steps:20});
  const mid=await st();
  console.log('mid-drag B, pointer still down:',JSON.stringify(mid.state));
  await page.waitForTimeout(2000);   // hold, finger still down, well past the chime
  await page.mouse.up(); await page.waitForTimeout(700);
  s=await st(); console.log('after holding through the collect, then releasing:',JSON.stringify(s.state));
  if(!s.state.got1)errors.push('light 1 (A->B) was not collected mid-drag: '+JSON.stringify(s.state));
  if(s.state.foldA>.15||s.state.foldB>.15)errors.push('the paper stayed half-folded after a mid-drag collect: '+JSON.stringify(s.state));
}
if(!(await st()).done)errors.push('region not done after both lights');
await page.screenshot({path:'shots/corner-6-done.png'});

// item 3: ripples. A fresh footstep ripple must land under the player (not
// 27 units off), and pulling an edge sends rings along the actual hinge line.
await driveTo(27,3); await page.waitForTimeout(250);
await page.screenshot({path:'shots/corner-7-ripple-footstep.png'});
await driveTo(27,0);
await dragEdge('A'); await page.waitForTimeout(150);
await page.screenshot({path:'shots/corner-8-ripple-edgeA.png'});
await tapEdge('A'); await page.waitForTimeout(1000);   // tap it back off so the next phase starts clean

// leave-reset
await page.evaluate(()=>window.__DA.setPos(12,20)); await page.waitForTimeout(800);
s=await st(); console.log('after leaving:',JSON.stringify(s.state));
if(s.state.foldA!==0||s.state.foldB!==0)errors.push('leaving did not reset the folds: '+JSON.stringify(s.state));

// save / continue
await page.evaluate(()=>window.__DA.save()); await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(800); await page.tap('#resumeYes'); await page.waitForTimeout(800);
s=await st(); console.log('after continue:',JSON.stringify(s)); if(!s.done)errors.push('save did not restore done');

await browser.close();
if(errors.length){console.log('ERRORS');errors.forEach(e=>console.log(' - '+e));process.exit(1);} console.log('CORNER OK');
