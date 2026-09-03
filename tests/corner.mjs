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
// occasionally, under this environment's headless timing, a single mouse
// down/move/up sequence doesn't register as a drag at all (the fold target
// comes back unchanged) — not a corner.js issue, a Playwright/input-timing
// flake. Verify the fold actually moved and retry once before giving up,
// rather than let a single dropped gesture fail the whole run.
async function dragEdgeOnce(which){
  const p=await edgePoint(which);
  await page.mouse.move(p.x,p.y); await page.waitForTimeout(120); await page.mouse.down(); await page.waitForTimeout(60);
  if(which==='A')await page.mouse.move(p.x,p.y+300,{steps:20}); else await page.mouse.move(p.x-260,p.y,{steps:20});
  await page.mouse.up(); await page.waitForTimeout(1500);
}
async function dragEdge(which,tries=3){
  const before=(await st()).state[which==='A'?'foldA':'foldB'];
  for(let i=0;i<tries;i++){
    await dragEdgeOnce(which);
    const after=(await st()).state[which==='A'?'foldA':'foldB'];
    if(Math.abs(after-before)>=.05) return;
    console.log('drag on edge',which,'did not register (fold stayed at',after,'), attempt',i+1,'of',tries);
  }
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
  await dragEdgeOnce('A');   // dragEdge() would retry this as "didn't register" — a no-op here is the whole point
  const after=await st();
  console.log('grab attempt from ten units out:',JSON.stringify(after.state));
  if(after.state.foldA!==0||after.state.order!==before.state.order)
    errors.push('a pull from outside GRAB_R changed the corner: '+JSON.stringify(after.state));
}

// walk to the crossing (the entrance itself now sits 5.5 units back along x
// and off the z=0 line — see finding 1/10 below — but the beacon still
// leads here, and this is the spot every drag actually needs).
await driveTo(27,0);
{ const p=await page.evaluate(()=>window.__DA.pos); const d=Math.hypot(p[0]-27,p[2]-0);
  console.log('pos at the crossing:',JSON.stringify(p));
  if(d>1)errors.push('walking to the crossing did not land on it (d='+d.toFixed(2)+')'); }
await page.screenshot({path:'shots/corner-0-arrive.png'});

// finding 1: standing on the crossing, the entrance light (now at
// (21.5,0,3), 5.5 units back and off the hinge lines) must read as small
// and behind the player, not a giant hoop across the bottom of the screen
// at their own feet. Not in the bottom third of a 390x844 frame — and in
// practice, since it's now behind the chase camera entirely from here, its
// raw projection lands far outside the frame altogether, which trivially
// satisfies "not in the bottom third" (a point outside [0,390] on x is not
// meaningfully "in" any third of the screen).
{
  const proj=await page.evaluate(()=>window.__DA.project(21.5,0.5,3));
  console.log('entrance projection standing on the crossing:',JSON.stringify(proj));
  const onscreenX = proj.x>=0 && proj.x<=390;
  if(onscreenX && proj.y>560) errors.push('the entrance ring reads in the bottom third of the screen from the crossing: '+JSON.stringify(proj));
}

// item 5: the grab tie-break at the crossing must not coin-flip on distance.
// A pointerdown exactly on the intersection followed by a clear vertical
// drag must always read as edge A — previously a pick this close to both
// lines was decided by whichever line happened to sit a hair nearer, so a
// vertical drag starting on a B pick could read as a tap and silently
// toggle B off instead of folding A.
{
  const p=await page.evaluate(()=>window.__DA.project(27,1,0));
  await page.mouse.move(p.x,p.y); await page.mouse.down();
  await page.mouse.move(p.x,p.y+300,{steps:20}); await page.mouse.up();
  await page.waitForTimeout(900);
  s=await st(); console.log('tie-break drag exactly on the intersection:',JSON.stringify(s.state));
  if(s.state.foldA<.9)errors.push('a vertical drag exactly on the intersection did not fold A: '+JSON.stringify(s.state));
  if(s.state.foldB>.1)errors.push('a vertical drag exactly on the intersection touched B: '+JSON.stringify(s.state));
  await tapEdge('A'); await page.waitForTimeout(1000);   // unfold before the rest of the tests
  s=await st(); if(s.state.foldA>.05||s.state.foldB>.05)errors.push('could not unfold after the tie-break test: '+JSON.stringify(s.state));
}

// finding 2: a fresh B->A latch, right from the taught standing spot (the
// crossing itself — GRAB_R's own safety, finding 6, settles a parked
// player to (26.3,-0.7)) — the B->A gate must be visible on screen for at
// least a full second afterward, with no camera swing (there is none: the
// old lookBack() call is gone, see corner.js). Sampled every real render
// frame via a page-side requestAnimationFrame recorder rather than sparse
// polling from here, which could straddle the whole window between two
// samples and miss a problem (this is finding 9's point, addressed at the
// root: since the fix is a *position* the camera already sees under a
// normal forward-facing view, not a swing timed against a latch, there is
// no flag to go stale — the recorder below is instantiated fresh every
// time this block runs, so "cleared on each fresh latch" holds by
// construction). Run twice (unfold, refold) to demonstrate that directly.
async function checkGateVisibleForASecond(label){
  const samples = await page.evaluate(async () => {
    const out = [];
    const t0 = performance.now();
    function frame(){
      const g = window.__DA_corner.gateRenderPos(2);
      const p = window.__DA.project(g.x, g.y, g.z);
      out.push({x:+p.x.toFixed(1), y:+p.y.toFixed(1)});
      if(performance.now()-t0 < 1250) requestAnimationFrame(frame);
    }
    return new Promise(res=>{ requestAnimationFrame(frame); setTimeout(()=>res(out), 1300); });
  });
  const inFrame = samples.filter(s=>s.x>=0&&s.x<=390&&s.y>=60&&s.y<=700);
  console.log(label,'gate2 on-screen frames:',inFrame.length,'/',samples.length,'first:',JSON.stringify(samples[0]));
  if(samples.length<5) errors.push(label+': too few frames captured to judge ('+samples.length+')');
  if(inFrame.length<samples.length) errors.push(label+': gate2 left the frame during the sustained-visibility window — '+inFrame.length+'/'+samples.length+' frames on-screen');
}
await page.evaluate(()=>window.__DA.setPos(27,0)); await page.waitForTimeout(300);
await dragEdge('B'); await dragEdge('A');
s=await st(); if(s.state.foldA<.9||s.state.foldB<.9||s.state.order!==1)errors.push('could not latch B->A fresh at the crossing: '+JSON.stringify(s.state));
await checkGateVisibleForASecond('fresh B->A latch');
await tapEdge('B'); await tapEdge('A'); await page.waitForTimeout(1000);   // unfold, then do it again — a second, independent fresh latch
await page.evaluate(()=>window.__DA.setPos(27,0)); await page.waitForTimeout(300);
await dragEdge('B'); await dragEdge('A');
s=await st(); if(s.state.foldA<.9||s.state.foldB<.9||s.state.order!==1)errors.push('could not re-latch B->A for the second visibility check: '+JSON.stringify(s.state));
await checkGateVisibleForASecond('second, independent B->A latch');
await tapEdge('B'); await tapEdge('A'); await page.waitForTimeout(1000);   // unfold before the rest of the tests
s=await st(); if(s.state.foldA>.05||s.state.foldB>.05)errors.push('could not unfold after the visibility checks: '+JSON.stringify(s.state));

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

// no camera swing here (finding 2 removed lookBack entirely) — just let the
// spring settle after the toggle.
await page.waitForTimeout(1900);
await page.screenshot({path:'shots/corner-1b-both-up-toggled.png'});

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
  // (27,-0.4), not (27,+0.4): parked here with both hinges latched, finding
  // 6's own hinge-safety (still gated on low velocity, so it applies to a
  // stationary player) settles this to (26.3,side*0.7) — and +0.7 on z
  // lands 1.63 units from gate 2's own, now much closer rest spot (finding
  // 3, GATE2_REST), inside COLLECT_R, collecting it by accident before the
  // deliberate approach below ever runs. -0.7 lands 1.92 units away, safe.
  await page.evaluate(()=>window.__DA.setPos(27,-0.4)); await page.waitForTimeout(300);
  const hiddenNearCrossing=await page.evaluate(()=>window.__DA_corner.ghost());
  if(hiddenNearCrossing.visible)errors.push('the mirrored self should hide within 1 unit of the crossing: '+JSON.stringify(hiddenNearCrossing));
  { const st2=await st(); if(st2.state.got2)errors.push('standing near the crossing to test ghost-hiding collected gate 2 by accident: '+JSON.stringify(st2.state)); }
}

// wrong light / correct light for this order (B first, A second) — gate 1
// (wrong, for order 1) and gate 2 (correct) both sit a couple of units from
// the crossing now (findings 2/3). Stay put at (24,-2) rather than walking
// back to the crossing here — that walk would pass close enough to gate 2's
// own delivered position (2.32 units from the crossing) to collect it in
// transit, before the test ever gets to its deliberate approach below.
//
// item 2 (converse): a live, uncollected gate for the current order must
// never trip the dead-end prompt, no matter how long the player lingers —
// only the *absence* of a live gate for the order should ever do that.
await page.waitForTimeout(11500);
{
  const promptVisible=await page.evaluate(()=>document.getElementById('prompt').style.visibility==='visible');
  if(promptVisible)errors.push('the dead-end prompt fired while gate 2 was still a live, uncollected target');
}

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
const wrongBeforeCorrect=await page.evaluate(()=>window.__DA_corner.wrongTouches);
await driveTo(l2.x,l2.z); await page.waitForTimeout(800);
s=await st(); console.log('after walking into the correct light (order 1):',JSON.stringify(s.state));
if(!s.state.got2)errors.push('light 2 (B->A) not collected');
if(s.state.foldA>.2||s.state.foldB>.2)errors.push('collecting did not spring the paper back open: '+JSON.stringify(s.state));
// walking straight into the *correct* light must never itself add a wrong
// touch, however close the two gates sit to one another at this order.
const wrongAfterCorrect=await page.evaluate(()=>window.__DA_corner.wrongTouches);
if(wrongAfterCorrect!==wrongBeforeCorrect)errors.push('walking into the correct B->A light added a wrong touch: '+wrongBeforeCorrect+' -> '+wrongAfterCorrect);

// item 3: the dormant marker — once one gate is collected, the *other*
// one's rest spot should read as present but cold, regardless of what the
// live order currently is.
{
  const dbg=(await st()).state;
  console.log('dormant marker after the first collect:',JSON.stringify(dbg));
  if(!dbg.dormantOn)errors.push('no dormant marker after collecting the first gate: '+JSON.stringify(dbg));
  await page.screenshot({path:'shots/corner-5-dormant.png'});
}

// item 2: the real dead end — pull B then A again, the same order already
// collected, and there is no live gate left for it: nothing will ever
// happen again until the player pulls the other one instead.
await driveTo(27,0); await page.waitForTimeout(1200);
await dragEdge('B'); await dragEdge('A');
s=await st(); console.log('re-latched B->A after it was already collected:',JSON.stringify(s.state));
if(s.state.foldA<.9||s.state.foldB<.9||s.state.order!==1)errors.push('could not re-latch B->A for the dead-end test: '+JSON.stringify(s.state));
if(s.state.got1||!s.state.got2)errors.push('unexpected collect state going into the dead-end test: '+JSON.stringify(s.state));
await page.waitForTimeout(11500);
{
  const promptText=await page.evaluate(()=>document.getElementById('prompt').textContent);
  const promptVisible=await page.evaluate(()=>document.getElementById('prompt').style.visibility==='visible');
  console.log('dead-end prompt after repeating the same order:',JSON.stringify({promptText,promptVisible}));
  if(!promptVisible||promptText!=='Pull the other one first.')errors.push('wrong or missing dead-end prompt: '+JSON.stringify({promptText,promptVisible}));
  await page.screenshot({path:'shots/corner-dead-end.png'});
}
await tapEdge('B'); await tapEdge('A'); await page.waitForTimeout(1000);   // unfold before the rest of the tests
{
  const promptVisible2=await page.evaluate(()=>document.getElementById('prompt').style.visibility==='visible');
  if(promptVisible2)errors.push('the dead-end prompt did not clear after unfolding');
  s=await st(); if(s.state.foldA>.05||s.state.foldB>.05)errors.push('could not unfold after the dead-end test: '+JSON.stringify(s.state));
}

// finding 3: order A->B, latched right at the crossing. Its gate used to
// sit ~0.4 units out — well inside COLLECT_R — so simply finishing the
// second (B) drag collected it *while the pointer was still down*, and the
// corner's arrival was never seen. Moved to 2.38 units out: the latch must
// NOT collect it — the delivery is watched, sitting there uncollected,
// marker lit — and it is collected only once the player actually walks in.
await driveTo(27,0);
s=await st(); if(s.state.foldA>.05||s.state.foldB>.05)errors.push('folds were not at rest before the A->B test: '+JSON.stringify(s.state));
const wrongBeforeClean=await page.evaluate(()=>window.__DA_corner.wrongTouches);
await dragEdge('A'); s=await st(); if(s.state.foldA<.9||s.state.order!==0)errors.push('edge A did not latch fresh at the crossing: '+JSON.stringify(s.state));
await dragEdge('B');
s=await st(); console.log('immediately after the A->B latch:',JSON.stringify(s.state));
if(s.state.foldA<.9||s.state.foldB<.9)errors.push('A->B did not fully latch: '+JSON.stringify(s.state));
if(s.state.got1)errors.push('the A->B gate collected itself at the latch instead of being walked into: '+JSON.stringify(s.state));
if(!s.state.marker1On)errors.push('the delivered A->B gate has no live marker to walk to: '+JSON.stringify(s.state));
await page.screenshot({path:'shots/corner-6a-AB-delivered-uncollected.png'});
{
  const g1=await page.evaluate(()=>window.__DA_corner.light(1));
  await driveTo(g1.x,g1.z); await page.waitForTimeout(600);
  s=await st(); console.log('after walking into the A->B gate:',JSON.stringify(s.state));
  if(!s.state.got1)errors.push('light 1 (A->B) was not collected on walking in: '+JSON.stringify(s.state));
  if(s.state.foldA>.15||s.state.foldB>.15)errors.push('the paper stayed half-folded after collecting: '+JSON.stringify(s.state));
}
const wrongAfterClean=await page.evaluate(()=>window.__DA_corner.wrongTouches);
console.log('wrongTouches across the clean A->B latch + walk-in:',wrongBeforeClean,'->',wrongAfterClean);
if(wrongAfterClean!==wrongBeforeClean)errors.push('a clean A->B latch and walk-in produced a wrong-touch blip: '+wrongBeforeClean+' -> '+wrongAfterClean);
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
