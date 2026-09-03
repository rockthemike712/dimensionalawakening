import * as THREE from 'three';
import {registerRegion, world, playerPos, dim, crossed, emitRipple, blip, chime, slide,
        pulseFlash, setPrompt, refreshHud, makeLight, saveGame, planeMat, camera,
        clock, renderer, audio, curRegion, rgt, fwd} from '../game.js';

// =====================================================================
// THE CORNER COMES TO YOU — two perpendicular hinges crossing in an X.
// Pull one: the far half lifts, exactly like the fold the player already
// knows. Pull both: the doubly-folded quarter swings up, over, and lands
// on top of wherever the player is standing. Order changes where it lands
// (SO(3) is not abelian) — that is the whole rule, taught by hand.
// =====================================================================

const CX=27, CZ=0, HALFW=12, HALFH=9, FOLD_MAX=1.42;
const COLOR=0xffcf6e;
// where the far-quarter lights stand on the flat paper. Both hinges pass
// through the crossing.
//
// The B->A gate (RAW2) is (28,0,2.5): it lands ~2.32 units out from the
// crossing at a modest height (1.36) — verified, by the chase camera's own
// view/projection math, to project inside the 390x844 frame with 78+ px of
// margin on every side, from every player position the fold safety can
// leave someone standing at, with no height cap or camera swing needed.
//
// The A->B gate (RAW1) is (29.6,0,1.15) — moved the same way (round 5,
// finding 4): it settles at ~1.52 height, ~2.40 units out from the crossing,
// with no rendered-height cap needed either (the old GATE_YCAP clamp, and
// the branch that used it, are gone — the CPU warp() and the GPU now agree
// on where this light actually is, per the brief's own test).
//
// Round 5's finding 1: moving the *rest point* farther from the crossing
// does NOT, on its own, guarantee every ordinary standing spot is outside
// COLLECT_R of it — both hinges compress height so steeply (FOLD_MAX is
// ~81 degrees) that any A->B rest point ends up in roughly the same
// negative-z pocket near the crossing, and some perfectly normal places to
// stand (e.g. (27.5,-1.5), 0.88 from this RAW1's rest point) are inside
// COLLECT_R of it no matter which RAW1 is chosen. That is what the `armed`
// flags below actually fix; moving RAW1 only buys the entrance-adjacent
// (27,0) spot its old, already-correct margin back (see finding 4) and
// gives the light a normal, comfortable resting depth instead of pitching
// almost on top of the camera.
const RAW1=new THREE.Vector3(29.6,0,1.15); // order A->B gate (~2.40 from the crossing, height ~1.52)
const RAW2=new THREE.Vector3(28,0,2.5);    // order B->A gate (~2.32 from the crossing, height ~1.36)
const COLLECT_R=1.7;
const GRAB_R=4.5;                       // must stand this close to the crossing (CX,CZ) for a pull to do anything
const GHOST_LAT_MAX=3;                  // finding 3 (round 5): the mirrored self's offset from the player, measured
                                         // along the camera's own right axis (`rgt`), is clamped to this many units —
                                         // it still moves opposite the player (a real reflection), it just cannot
                                         // walk itself sideways out of a 36-degree portrait frustum.
const GHOST_FWD_MAX=4;                  // ...and likewise along the camera's forward axis (`fwd`): a reflection's
                                         // depth offset from the player can grow just as large as its sideways one
                                         // (point-reflection splits the player's own distance from the crossing
                                         // between both axes), and a large depth swing alone pushes the point close
                                         // enough to the camera that ordinary perspective magnifies even a small
                                         // remaining sideways component off the side of the frame. Clamped the same
                                         // way, for the same reason — not toward a fixed point, just bounded.

// ---------- fold state (springs, not plain eases: they overshoot on latch) ----------
let foldA=0, foldAT=0, aVel=0;
let foldB=0, foldBT=0, bVel=0;
let order=0;                     // 0 = A pulled first (A then B), 1 = B first (B then A)
let got1=false, got2=false, promptShown=false, stuckT=0, stuckSince=-1;
// round 5, finding 1 (blocker): collection requires an approach. `armedN`
// only ever turns true while gate N is live (latched, right order, not yet
// collected) and the player is *outside* COLLECT_R of its rest point — so a
// player who was already standing inside that disc when the second edge
// latched cannot collect it by doing nothing; they have to step out and
// walk back in, same as anyone else. Reset to false the instant the gate
// stops being live (unlatched, order flipped, collected, or the region is
// left) so the next latch is judged fresh, on its own merits.
let armed1=false, armed2=false;
let dragA=false, dragAY=0, dragAT0=0, dragAPid=null;
let dragB=false, dragBX=0, dragBT0=0, dragBPid=null;
// a pointerdown that lands within GRAB_W of *both* lines (near the crossing
// itself) does not commit to an axis yet — it waits for the first real
// movement to say which line was meant, see onDown/onMove/onUp below.
let pending=false, pendingPid=null, pendingX=0, pendingY=0, pendingAT0=0, pendingBT0=0;
let rippleCoolA=0, rippleCoolB=0, humCoolA=0, humCoolB=0, hingeCoolA=0, hingeCoolB=0;
let wrongNear1=false, wrongNear2=false, wrongTouches=0, steppedFlag=false;
const _ghostProj=new THREE.Vector3();   // finding 4: on-screen test for the ghost's own projection
let _ghostDbg={};                       // round 5: diagnostic snapshot for the ghost() test hook

// the same two-hinge composition on the CPU as in the vertex shader below —
// order-dependent, and it must agree with the GPU exactly. Takes an
// out-param so the ~5-a-frame callers below never allocate.
function warp(x,y,z,out){
  out=out||new THREE.Vector3();
  let X=x-CX, Y=y||0, Z=z-CZ;
  const thA=Math.max(0,foldA)*FOLD_MAX, thB=Math.max(0,foldB)*FOLD_MAX;
  const stepA=()=>{ if(X>0){const c=Math.cos(thA),s=Math.sin(thA),x0=X,y0=Y; X=x0*c-y0*s; Y=x0*s+y0*c;} };
  const stepB=()=>{ if(Z>0){const c=Math.cos(thB),s=Math.sin(thB),z0=Z,y0=Y; Z=z0*c-y0*s; Y=z0*s+y0*c;} };
  if(order<0.5){stepA();stepB();}else{stepB();stepA();}
  return out.set(CX+X,Y,CZ+Z);
}
// module-scope scratch: warp()'s out-params, reused every frame
const _p1=new THREE.Vector3(), _p2=new THREE.Vector3(), _ghostMp=new THREE.Vector3();

// the fully-latched (fa=fb=1) landing spot for each gate, under its own
// fixed order — a constant, computed once, independent of the live fold
// state. Used for the dormant/cold marker (item 3): once one gate is
// collected, the *other* one's rest spot gets a permanent, dim presence
// even while the live folds don't currently match its order.
function restWarp(x,y,z,ord,out){
  let X=x-CX, Y=y||0, Z=z-CZ;
  const c=Math.cos(FOLD_MAX), s=Math.sin(FOLD_MAX);
  const stepA=()=>{ if(X>0){const x0=X,y0=Y; X=x0*c-y0*s; Y=x0*s+y0*c;} };
  const stepB=()=>{ if(Z>0){const z0=Z,y0=Y; Z=z0*c-y0*s; Y=z0*s+y0*c;} };
  if(ord<0.5){stepA();stepB();}else{stepB();stepA();}
  return out.set(CX+X,Y,CZ+Z);
}
const GATE1_REST=restWarp(RAW1.x,RAW1.y,RAW1.z,0,new THREE.Vector3());
const GATE2_REST=restWarp(RAW2.x,RAW2.y,RAW2.z,1,new THREE.Vector3());

// ---------- ground patch: a clone of the sheet look, two hinges of its own ----------
const geo=new THREE.PlaneGeometry(24,18,120,90); geo.rotateX(-Math.PI/2);
const MAX_RIP=6;
const mat=new THREE.ShaderMaterial({
  transparent:true, side:THREE.DoubleSide,
  uniforms:{uTime:{value:0},uA:{value:0},uB:{value:0},uOrder:{value:0},
    uAwake:{value:0},uDim:{value:0},uCombo:{value:0},
    uRip:{value:planeMat.uniforms.uRip.value},        // shared ring buffer: emitRipple() reaches this patch too
    uRipC:{value:planeMat.uniforms.uRipC.value}},
  vertexShader:`
    uniform float uTime; uniform float uA; uniform float uB; uniform float uOrder; uniform float uAwake;
    uniform vec4 uRip[${MAX_RIP}]; uniform vec3 uRipC[${MAX_RIP}];
    varying vec3 vPos; varying float vRip; varying float vSide; varying float vSideZ; varying vec3 vRipC; varying float vBoth; varying vec2 vWorld;
    void main(){
      vec3 p=position;
      vWorld=position.xz+vec2(${CX.toFixed(1)},${CZ.toFixed(1)});   // same paper: world coords, matching the core's sheet
      float rip=0.0; vec3 ripc=vec3(0.0);
      for(int i=0;i<${MAX_RIP};i++){
        float age=uTime-uRip[i].z;
        if(age>0.0&&age<3.0){
          // uRip carries world-space centers; this patch's own vertices are
          // local to (CX,CZ), so shift into world space before comparing —
          // otherwise every ring on this patch draws 27 units off (CX).
          float d=distance(vWorld,uRip[i].xy);
          float r=exp(-9.0*abs(d-age*3.4))*exp(-age*1.4)*uRip[i].w;
          rip+=r; ripc+=uRipC[i]*r;
        }
      }
      p.y+=rip*.22;
      // pre-fold side flags — computed from the flat 'position', before
      // either hinge rotates anything below, so they mark "which face this
      // vertex belongs to" (A-raised half / B-raised half) independent of
      // how steeply the fold has since tipped it.
      vSide=step(0.0,position.x);
      vSideZ=step(0.0,position.z);
      vBoth=step(0.0,position.x)*step(0.0,position.z);
      float thA=uA*1.42, thB=uB*1.42;
      if(uOrder<0.5){
        if(p.x>0.0){ float c=cos(thA),s=sin(thA),x0=p.x,y0=p.y; p.x=x0*c-y0*s; p.y=x0*s+y0*c; }
        if(p.z>0.0){ float c=cos(thB),s=sin(thB),z0=p.z,y0=p.y; p.z=z0*c-y0*s; p.y=z0*s+y0*c; }
      } else {
        if(p.z>0.0){ float c=cos(thB),s=sin(thB),z0=p.z,y0=p.y; p.z=z0*c-y0*s; p.y=z0*s+y0*c; }
        if(p.x>0.0){ float c=cos(thA),s=sin(thA),x0=p.x,y0=p.y; p.x=x0*c-y0*s; p.y=x0*s+y0*c; }
      }
      p.y+=sin(length(position.xz)*1.2-uTime*1.8)*.06*(.2+uAwake);
      vPos=p; vRip=rip; vRipC=ripc;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
    }`,
  fragmentShader:`
    uniform float uTime; uniform float uA; uniform float uB; uniform float uAwake; uniform float uDim; uniform float uCombo;
    varying vec3 vPos; varying float vRip; varying float vSide; varying float vSideZ; varying vec3 vRipC; varying float vBoth; varying vec2 vWorld;
    float grid(float x,float s){float q=abs(fract(x/s-.5)-.5)/fwidth(x/s);return 1.-min(q,1.);}
    void main(){
      float g=max(grid(vPos.x,1.0),grid(vPos.z,1.0));
      float fine=max(grid(vPos.x,.25),grid(vPos.z,.25))*.18;
      vec3 a=vec3(.015,.055,.075); vec3 b=vec3(.02,.28,.34);
      // same paper: these four terms read world coordinates, like the core's sheet does,
      // so the hue does not drift apart across x=15 as the world awakens
      float pulse=.5+.5*sin(uTime*.7+vWorld.x*.3-vWorld.y*.22);
      vec3 col=mix(a,b,g*.48+fine)+vec3(.03,.13,.15)*pulse*uAwake;
      // round 5, finding 2 (blocker): the crease glow reads off the
      // *pre-fold* flat coordinate (vFlat), not the post-fold vPos — vPos.x
      // shrinks toward 0 as the hinge rotates past ~45 degrees (cos(theta)),
      // which used to spread this same additive term over most of the
      // raised face instead of a narrow band at the actual hinge line.
      // Declared here, before first use, for both hinges' creases.
      vec2 vFlat=vWorld-vec2(${CX.toFixed(1)},${CZ.toFixed(1)});
      col+=vec3(.1,.9,1.2)*exp(-abs(vFlat.x)*2.2)*(.35+uA*.9);
      col+=vec3(.1,.9,1.2)*exp(-abs(vFlat.y)*2.2)*(.35+uB*.9);
      // ...and the raised faces are darkened, not left neutral (the old
      // '*(1.0-uDim)' factor was always multiplying by 1.0 inside the
      // region, since uDim is 1 here — dead code, per finding 2). A face
      // that has actually tipped up and away from the player should read
      // darker than the ground it lifted from; the doubly-folded quarter
      // (both vSide and vSideZ) darkens the most, which is also what makes
      // it read as a *different* surface at an angle instead of one glow.
      float darken=clamp(1.0-0.38*uA*vSide-0.38*uB*vSideZ,0.4,1.0);
      col*=darken;
      col+=vRipC*.9;
      float m=sin(vWorld.x*6.0+uTime*.6)*sin(vWorld.y*6.0-uTime*.5);
      vec3 wrong=vec3(.55+.45*sin(uTime*.31+vWorld.y*.4),.35+.35*sin(uTime*.23+vWorld.x*.35+2.1),.7+.3*sin(uTime*.27+3.9));
      col+=wrong*smoothstep(.45,1.0,m)*.24*uAwake*(g*.9+fine+.25);
      float drift=uAwake*.45*(.5+.5*sin(uTime*.4+length(vWorld)*.35));
      col=mix(col,col.brg,drift);
      // a real rim on the doubly folded quarter: bright along its two crease
      // edges, not a flat tint across the whole face
      float rimEdge=min(vFlat.x,vFlat.y);
      float rim=vBoth*exp(-max(rimEdge,0.0)*0.9);
      col+=vec3(1.0,.92,.55)*rim*uCombo*(0.6+0.4*sin(uTime*3.0));
      gl_FragColor=vec4(col,.94);
    }`
});
const patch=new THREE.Mesh(geo,mat); patch.position.set(CX,.02,CZ);
// the ground the folded quarter leaves behind: dims hard so "up there" and
// "down here" never get confused for the same place
const dimMesh=new THREE.Mesh(new THREE.PlaneGeometry(HALFW,HALFH),
  new THREE.MeshBasicMaterial({color:0x000005,transparent:true,opacity:0,depthWrite:false}));
dimMesh.rotation.x=-Math.PI/2; dimMesh.position.set(CX+HALFW/2,.006,CZ+HALFH/2);

// ---------- the two edges: same look as the core's seam ----------
function makeEdge(w,l,px,pz){
  const m=new THREE.MeshBasicMaterial({color:0x60f7ff,transparent:true,opacity:.9});
  const bar=new THREE.Mesh(new THREE.BoxGeometry(w,.06,l),m); bar.position.set(px,.05,pz);
  const halo=new THREE.Mesh(new THREE.BoxGeometry(w+.55,.02,l+.55),
    new THREE.MeshBasicMaterial({color:0x20d9ff,transparent:true,opacity:.14,blending:THREE.AdditiveBlending}));
  halo.position.set(px,.03,pz);
  return {bar,halo,mat:m,haloMat:halo.material};
}
const edgeA=makeEdge(.16,HALFH*2,CX,CZ);     // along z at x=27 — appears horizontal on screen, drag with clientY
const edgeB=makeEdge(HALFW*2,.16,CX,CZ);     // along x at z=0  — appears vertical on screen, drag with clientX
const GRAB_W=1.9;                            // how close to a line counts as "grabbed it"

// ---------- the two gate lights ----------
const light1=makeLight(RAW1,COLOR), light2=makeLight(RAW2,COLOR);
function animateGate(g,t,active){
  const u=g.userData;
  g.rotation.y=t*.6+u.t0; u.ring.rotation.z=t*.3+u.t0;
  u.core.visible=active;
  u.beam.visible=active; u.glow.visible=active;
  if(active){ u.ring.material.opacity=.65; u.beam.material.opacity=.14+.1*(.5+.5*Math.sin(t*3.4+u.t0)); }
  else u.ring.material.opacity=.2+.08*Math.sin(t*2+u.t0);        // the wrong one: a dim ring only
}

// ---------- ground markers under each active gate: the goal reads on the
// plane the player walks on, in the core's own floor-marker style ----------
function makeGroundMarker(){
  const g=new THREE.Group();
  // kept modest (about 1.1 across) — the gate lands close to the crossing
  // on delivery, right where the player is already standing, and the old
  // .8-radius ring read as huge parked directly at the player's own feet
  // finding 8: the marker sits at y=.05 on ground the raised half has
  // lifted away, so the sheet's own depth-write clips its top half into a
  // black hole with a gold rim. depthTest:false (and a renderOrder above
  // the patch) draws it on top regardless of what the folded paper is doing.
  const ring=new THREE.Mesh(new THREE.RingGeometry(.38,.55,48),
    new THREE.MeshBasicMaterial({color:COLOR,transparent:true,opacity:.8,side:THREE.DoubleSide,depthTest:false}));
  ring.rotation.x=-Math.PI/2; ring.renderOrder=6;
  const disc=new THREE.Mesh(new THREE.CircleGeometry(.42,40),
    new THREE.MeshBasicMaterial({color:COLOR,transparent:true,opacity:.18,side:THREE.DoubleSide,depthTest:false}));
  disc.rotation.x=-Math.PI/2; disc.renderOrder=5;
  g.add(ring,disc); g.visible=false;
  return {g,ring,disc};
}
const marker1=makeGroundMarker(), marker2=makeGroundMarker();

// ---------- the dormant marker: a cold, unmoving ring+disc at the *other*
// gate's rest spot, once the first one is collected — "there is another
// one, not lit for what you just did", read without a word ----------
function makeColdMarker(){
  const g=new THREE.Group();
  // same depthTest:false treatment as the live marker (finding 8) — cheap
  // insurance against the same clipping if it ever sits under a raised edge
  const ring=new THREE.Mesh(new THREE.RingGeometry(.62,.8,48),
    new THREE.MeshBasicMaterial({color:0x8fa6ad,transparent:true,opacity:.26,side:THREE.DoubleSide,depthTest:false}));
  ring.rotation.x=-Math.PI/2; ring.renderOrder=6;
  const disc=new THREE.Mesh(new THREE.CircleGeometry(.6,40),
    new THREE.MeshBasicMaterial({color:0x8fa6ad,transparent:true,opacity:.05,side:THREE.DoubleSide,depthTest:false}));
  disc.rotation.x=-Math.PI/2; disc.renderOrder=5;
  g.add(ring,disc); g.visible=false;
  return {g,ring,disc};
}
const dormant=makeColdMarker();
function updateDormant(){
  if(got1&&!got2){ dormant.g.visible=true; dormant.g.position.set(GATE2_REST.x,.05,GATE2_REST.z); }
  else if(got2&&!got1){ dormant.g.visible=true; dormant.g.position.set(GATE1_REST.x,.05,GATE1_REST.z); }
  else dormant.g.visible=false;
}

// ---------- the mirrored player: reads as *you*, not as the gate — the
// exact same core/halo materials as the player's own body (white-cyan
// icosahedron, additive halo), so it reads as a reflection of the player
// against the cyan paper rather than a third, unrelated thing. The group is
// positioned every frame (below) at the height of whatever surface it's
// actually standing on; these local offsets just keep the figure clear of
// its own shadow at the group's local ground plane. ----------
const ghostCore=new THREE.Mesh(new THREE.IcosahedronGeometry(.36,2),
  new THREE.MeshStandardMaterial({color:0xdfffff,emissive:0x49e9ff,emissiveIntensity:3,roughness:.18,metalness:.15}));
const ghostHalo=new THREE.Mesh(new THREE.SphereGeometry(.6,20,20),
  new THREE.MeshBasicMaterial({color:0x52f5ff,transparent:true,opacity:.075,blending:THREE.AdditiveBlending,depthWrite:false}));
ghostCore.position.y=.26; ghostHalo.position.y=.26;   // clear of the shadow at y=.02 — it was cutting the sphere at the equator
const ghostShadow=new THREE.Mesh(new THREE.CircleGeometry(.5,28),
  new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.3}));
ghostShadow.rotation.x=-Math.PI/2; ghostShadow.position.y=.02;
const ghost=new THREE.Group();
ghost.add(ghostCore,ghostHalo,ghostShadow); ghost.visible=false;

// ---------- input: grab an edge, drag perpendicular; tap toggles ----------
// Picking against thin, tall boxes gets ambiguous at a low camera angle (the
// ray can graze the far one first), so instead: drop the pointer ray onto the
// y=1 plane the bars sit on and measure perpendicular distance to each line —
// exactly matches what's visible, and ties break toward the closer line.
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
const groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-1);
function pickGround(e){
  ndc.set((e.clientX/innerWidth)*2-1,-(e.clientY/innerHeight)*2+1);
  ray.setFromCamera(ndc,camera);
  const pt=new THREE.Vector3();
  return ray.ray.intersectPlane(groundPlane,pt) ? pt : null;
}
function setTarget(which,val){
  const otherOn = which==='A' ? foldBT>.5 : foldAT>.5;
  // the newly raised edge is the one applied *last* — this must fire on
  // every raise, not only when the other edge happens to be down already,
  // or tapping an edge off and back on with the other still up leaves
  // `order` stale while the player has physically redone the sequence.
  if(val>.5) order = which==='A' ? (otherOn?1:0) : (otherOn?0:1);
  if(which==='A') foldAT=val; else foldBT=val;
  const rz = which==='A' ? [-6,0,6].map(z=>[CX,CZ+z]) : [-6,0,6].map(x=>[CX+x,CZ]);
  for(const [x,z] of rz) emitRipple(x,z,.9);
  const delta=new THREE.Vector3(CX-playerPos.x,0,CZ-playerPos.z);
  const pan=THREE.MathUtils.clamp(delta.dot(rgt)/6,-1,1);
  blip(val>.5?560:340,.24,.09,'sine',pan);
}
function onDown(e){
  if(!crossed || curRegion!==region) return;
  const pt=pickGround(e); if(!pt) return;
  const dA=Math.abs(pt.x-CX), dB=Math.abs(pt.z-CZ);
  const inA=dA<GRAB_W && Math.abs(pt.z-CZ)<HALFH+1, inB=dB<GRAB_W && Math.abs(pt.x-CX)<HALFW+1;
  if(!inA && !inB) return;
  // the corner does not fold from a distance — you have to be standing on
  // the crossing to pull it. Off the crossing, a grab does nothing but a
  // soft thud and a ripple at the X, so "stand on it" is learned by doing.
  if(Math.hypot(playerPos.x-CX,playerPos.z-CZ)>GRAB_R){
    blip(110,.16,.09,'sine'); emitRipple(CX,CZ,.5);
    return;
  }
  if(inA && inB){
    // dead center, within reach of both lines: a coin flip on distance alone
    // used to decide here, which reads a vertical drag on a B pick as a tap
    // (toggling B off) whenever it happened to land a hair closer to the A
    // line. Defer instead to the first real movement — see onMove.
    pending=true; pendingPid=e.pointerId; pendingX=e.clientX; pendingY=e.clientY;
    pendingAT0=foldAT; pendingBT0=foldBT;
  } else if(inA){ dragA=true; dragAY=e.clientY; dragAT0=foldAT; dragAPid=e.pointerId; }
  else { dragB=true; dragBX=e.clientX; dragBT0=foldBT; dragBPid=e.pointerId; }
  try{renderer.domElement.setPointerCapture(e.pointerId);}catch(_){}
  audio(); emitRipple(CX,CZ,.7);
}
function onMove(e){
  if(!crossed || curRegion!==region) return;
  if(pending){
    const dx=e.clientX-pendingX, dy=e.clientY-pendingY;
    if(Math.hypot(dx,dy)<6) return;   // not enough movement yet to read a direction
    pending=false;
    // dominant vertical motion means the horizontal line (A) was grabbed;
    // dominant horizontal motion means the vertical line (B) was grabbed —
    // the axis you drag perpendicular to is the one you meant to pull.
    if(Math.abs(dy)>=Math.abs(dx)){ dragA=true; dragAY=pendingY; dragAT0=pendingAT0; dragAPid=pendingPid; }
    else { dragB=true; dragBX=pendingX; dragBT0=pendingBT0; dragBPid=pendingPid; }
  }
  if(dragB){
    foldBT=THREE.MathUtils.clamp(dragBT0+(dragBX-e.clientX)/Math.max(innerWidth*.38,260),0,1);
    if(clock.elapsedTime-rippleCoolB>.14){rippleCoolB=clock.elapsedTime;emitRipple(CX+(Math.random()-.5)*16,CZ,.4);}
    if(clock.elapsedTime-humCoolB>.18){humCoolB=clock.elapsedTime;slide(220+foldBT*140,240+foldBT*140,.22,.05);}
    return;
  }
  if(dragA){
    foldAT=THREE.MathUtils.clamp(dragAT0+(e.clientY-dragAY)/(innerHeight*.28),0,1);
    if(clock.elapsedTime-rippleCoolA>.14){rippleCoolA=clock.elapsedTime;emitRipple(CX,CZ+(Math.random()-.5)*12,.4);}
    if(clock.elapsedTime-humCoolA>.18){humCoolA=clock.elapsedTime;slide(220+foldAT*140,240+foldAT*140,.22,.05);}
    return;
  }
}
function onUp(e){
  if(pending){
    // released before moving enough to read a direction — a true tap dead
    // center. No drag direction to go on, so fall back to whichever line
    // the pointer actually sat nearer, same as a tap anywhere else.
    pending=false;
    const pt=pickGround(e);
    const dA=pt?Math.abs(pt.x-CX):0, dB=pt?Math.abs(pt.z-CZ):Infinity;
    if(dA<=dB) setTarget('A', pendingAT0>.5?0:1); else setTarget('B', pendingBT0>.5?0:1);
    try{renderer.domElement.releasePointerCapture(e.pointerId);}catch(_){}
    return;
  }
  if(!(dragA||dragB)) return;
  if(dragB){
    dragB=false;
    const moved=Math.abs(e.clientX-dragBX)>14;
    setTarget('B', moved ? (foldBT>.5?1:0) : (dragBT0>.5?0:1));
    try{renderer.domElement.releasePointerCapture(e.pointerId);}catch(_){}
  }
  if(dragA){
    dragA=false;
    const moved=Math.abs(e.clientY-dragAY)>14;
    setTarget('A', moved ? (foldAT>.5?1:0) : (dragAT0>.5?0:1));
    try{renderer.domElement.releasePointerCapture(e.pointerId);}catch(_){}
  }
}

function collect(n,p){
  // a finger can still be down when the gate is reached mid-drag — clear the
  // drag state and let go of the pointer *before* zeroing the fold targets,
  // or the very next pointermove restores whichever edge is still held and
  // the paper only half-springs back open.
  if(dragA){ try{renderer.domElement.releasePointerCapture(dragAPid);}catch(_){} dragA=false; }
  if(dragB){ try{renderer.domElement.releasePointerCapture(dragBPid);}catch(_){} dragB=false; }
  if(n===1){got1=true; light1.visible=false;} else {got2=true; light2.visible=false;}
  refreshHud(); chime(); pulseFlash(); updateDormant();
  emitRipple(p.x,p.z,1.8,new THREE.Color(1,.85,.5));
  foldAT=0; foldBT=0;      // collecting it lets the paper spring back open
  saveGame();
}

// test hook: where a gate light is standing right now, after the folds
window.__DA_corner={
  light(n){const p=warp(n===1?RAW1.x:RAW2.x,0,n===1?RAW1.z:RAW2.z);return {x:+p.x.toFixed(2),y:+p.y.toFixed(2),z:+p.z.toFixed(2)};},
  // the actual rendered position of a gate light — round 5 removed the
  // GATE_YCAP clamp (finding 4), so this now always agrees with light(n);
  // kept as its own hook because tests already reach for it.
  gateRenderPos(n){const g=n===1?light1:light2; return {x:+g.position.x.toFixed(2),y:+g.position.y.toFixed(2),z:+g.position.z.toFixed(2)};},
  ghost(){return {x:+ghost.position.x.toFixed(2),y:+ghost.position.y.toFixed(2),z:+ghost.position.z.toFixed(2),visible:ghost.visible,
    shadowOpacity:+ghostShadow.material.opacity.toFixed(3), debug:_ghostDbg};},
  get wrongTouches(){return wrongTouches;}
};
let region;
region = registerRegion({
  id:'corner', name:'CORNERS', color:COLOR,
  // finding 1: the entrance used to sit just 2.5 units off the crossing —
  // still well inside GRAB_R, so its own core+ring (the region's one
  // permanently-lit signpost, kept on until done()) hovered right at the
  // player's feet the whole time they stood on the X to pull: a giant gold
  // hoop across the bottom of the screen, over the prompt pill and the
  // d-pad. Moved 5.5 units back along x (outside GRAB_R=4.5, so it reads as
  // small and behind the player once they've walked onto the crossing —
  // "the thud if you pull from here" rule teaches the last few steps of the
  // walk in) and, per finding 10, off the z=0 line too: entering *off* both
  // hinges is what makes them read as a crossing X on arrival, instead of
  // one lit path (edge B, which the old entrance walked straight down) with
  // a hoop parked on it.
  bounds:{x0:15,x1:39,z0:-9,z1:9}, entrance:new THREE.Vector3(21.5,0,3),
  build(){
    world.add(patch,dimMesh,ghost,marker1.g,marker2.g,dormant.g);
    world.add(edgeA.bar,edgeA.halo,edgeB.bar,edgeB.halo);
    light1.userData.t0=Math.random()*6; light2.userData.t0=Math.random()*6;
    renderer.domElement.addEventListener('pointerdown',onDown);
    renderer.domElement.addEventListener('pointermove',onMove);
    renderer.domElement.addEventListener('pointerup',onUp);
    renderer.domElement.addEventListener('pointercancel',onUp);
  },
  update(dt,t){
    // springy approach to the latch — slight overshoot, never a flat ease
    const K=70,D=10;
    aVel+=((foldAT-foldA)*K-aVel*D)*dt; foldA=THREE.MathUtils.clamp(foldA+aVel*dt,-.1,1.12);
    bVel+=((foldBT-foldB)*K-bVel*D)*dt; foldB=THREE.MathUtils.clamp(foldB+bVel*dt,-.1,1.12);
    const fa=Math.max(0,foldA), fb=Math.max(0,foldB), combo=fa*fb;
    const latched = fa>.9 && fb>.9;   // both edges up — the gate is actually delivered, not just one
    mat.uniforms.uA.value=fa; mat.uniforms.uB.value=fb; mat.uniforms.uOrder.value=order;
    mat.uniforms.uTime.value=t; mat.uniforms.uDim.value=dim; mat.uniforms.uCombo.value=combo;
    mat.uniforms.uAwake.value=planeMat.uniforms.uAwake.value;
    dimMesh.material.opacity=.62*THREE.MathUtils.smoothstep(combo,.08,.55);

    const onA=foldAT>.5, onB=foldBT>.5;
    edgeA.mat.color.setHex(onA?0xffffff:0x60f7ff); edgeA.mat.opacity=onA?.95:.6+.3*Math.sin(t*3.1);
    edgeA.haloMat.opacity=onA?.3:.09+.06*Math.sin(t*2.2);
    edgeB.mat.color.setHex(onB?0xffffff:0x60f7ff); edgeB.mat.opacity=onB?.95:.6+.3*Math.sin(t*3.4);
    edgeB.haloMat.opacity=onB?.3:.09+.06*Math.sin(t*2.5);

    const p1=warp(RAW1.x,RAW1.y,RAW1.z,_p1), p2=warp(RAW2.x,RAW2.y,RAW2.z,_p2);
    // round 5, finding 4: no height cap — RAW1 and RAW2 are both chosen to
    // settle at a normal, comfortable height and depth (see the constants'
    // comments up top), so the light is drawn exactly where the fold puts
    // it. The CPU warp() and the GPU vertex shader agree on this point
    // exactly, per the brief's own test.
    light1.position.copy(p1);
    light2.position.copy(p2);
    // finding 7: gated on curRegion too — without it, whichever gate is
    // "live" for the default order (0, A->B) stays fully lit — core, beam,
    // point light — from the moment the region builds, so the field sees a
    // beamed gate outshining the region's own (beamless, until Thin is
    // done) entrance light. A gate should only announce itself once the
    // player is actually here to act on it.
    animateGate(light1,t,!got1&&order===0&&curRegion===region);
    animateGate(light2,t,!got2&&order===1&&curRegion===region);

    // only once the gate is actually delivered (both edges latched) — with
    // only one edge up, the other's un-folded contribution leaves the gate
    // still mid-flight partway across the field, and the marker showing up
    // there read as a huge ring parked right at the player's own feet.
    marker1.g.visible=latched&&!got1&&order===0; marker1.g.position.set(p1.x,.05,p1.z);
    marker2.g.visible=latched&&!got2&&order===1; marker2.g.position.set(p2.x,.05,p2.z);
    marker1.ring.material.opacity=.55+.3*Math.sin(t*3); marker2.ring.material.opacity=.55+.3*Math.sin(t*3+1.7);

    // the mirrored self must actually move opposite the player — the true
    // point-reflection through the crossing, warped through the same fold
    // the player rides (so it stands on the actual tilted paper, folded
    // quarter and all). Round 5, finding 3 (blocker): a true reflection can
    // walk itself sideways out of a 36-degree portrait frustum the instant
    // the player is more than a couple of units off either hinge — every
    // position east of x=24 did exactly that. Rather than clamp it toward a
    // fixed point (which read as a tether riding *with* the player, the
    // opposite of the brief), clamp only its offset from the player along
    // the camera's own right axis (`rgt`) to GHOST_LAT_MAX: it still moves
    // opposite the player on every other axis — including straight toward
    // or away from the camera — it just cannot leave the frame sideways.
    const distX=Math.hypot(playerPos.x-CX,playerPos.z-CZ);
    let mx=2*CX-playerPos.x, mz=2*CZ-playerPos.z;
    let gdx=mx-playerPos.x, gdz=mz-playerPos.z;
    const lateral=gdx*rgt.x+gdz*rgt.z, forwardOff=gdx*fwd.x+gdz*fwd.z;
    const clampedLateral=THREE.MathUtils.clamp(lateral,-GHOST_LAT_MAX,GHOST_LAT_MAX);
    const clampedForward=THREE.MathUtils.clamp(forwardOff,-GHOST_FWD_MAX,GHOST_FWD_MAX);
    if(clampedLateral!==lateral||clampedForward!==forwardOff){
      const dLat=clampedLateral-lateral, dFwd=clampedForward-forwardOff;
      gdx+=rgt.x*dLat+fwd.x*dFwd; gdz+=rgt.z*dLat+fwd.z*dFwd;
      mx=playerPos.x+gdx; mz=playerPos.z+gdz;
    }
    const raw=warp(mx,0,mz,_ghostMp);
    // round 5, finding 3 (blocker): the whole group — figure *and* shadow —
    // now sits at the folded surface's own height (raw.y), because that
    // surface, not the original y=0 ground, is what the mirrored self is
    // actually standing on out on the doubly-folded quarter. The old code
    // pinned the group to y=0 and only lifted the figure locally, so the
    // shadow was drawn on ground the fold had already lifted away from
    // under it — a body floating with nothing beneath. The shadow is now a
    // fixed, un-fading disc right under the feet, on whatever surface that
    // is; it no longer needs to fade with height because it is never
    // floating clear of its own ground in the first place.
    ghost.position.set(raw.x, raw.y, raw.z);
    ghostShadow.material.opacity=.3;
    _ghostProj.set(raw.x,raw.y+.26,raw.z).project(camera);
    // finding 3: tightened from 1.08 — a point just past the true frustum
    // edge still reads as "visible" at that margin (checked: (24,-2)
    // projected to x=379 of 390 with nothing drawn there). .95 keeps a
    // reasonable safety margin without also counting the offscreen strip.
    const ghostOnScreen=_ghostProj.z<1 && Math.abs(_ghostProj.x)<.95 && Math.abs(_ghostProj.y)<.95;
    // hide it once the player is standing right on the crossing — reflected
    // through itself it would sit on top of the player, reading as nothing
    // — and hide it right on either hinge line too: a point on a hinge
    // reflects to another point on that same hinge, so up close the ghost
    // clamps onto the very line the raised half is drawn through and reads
    // as a glitch rather than a mirrored figure. Round 5, finding 3
    // (blocker): both gates' own rest points sit only ~0.4 units off ONE of
    // the two hinges (an intrinsic property of this warp — see the RAW1/RAW2
    // comments up top), which the old 1.2-unit hide band swallowed whole —
    // the ghost was hidden for the entire approach to, and the entire stand
    // at, either gate. HINGE_HIDE only needs to cover the genuinely
    // degenerate band right at zero offset; shrunk well under both gates'
    // own ~0.4-unit offset so the walk in, and standing at the gate, show it.
    const HINGE_HIDE=0.2;
    const nearHinge = Math.abs(playerPos.x-CX)<HINGE_HIDE || Math.abs(playerPos.z-CZ)<HINGE_HIDE;
    ghost.visible=crossed && Math.max(fa,fb)>.05 && !(got1&&got2) && distX>1 && !nearHinge && ghostOnScreen;
    _ghostDbg={distX:+distX.toFixed(2),nearHinge,onScreen:ghostOnScreen,
      ndc:{x:+_ghostProj.x.toFixed(2),y:+_ghostProj.y.toFixed(2),z:+_ghostProj.z.toFixed(2)},
      fa:+fa.toFixed(2),fb:+fb.toFixed(2)};

    // both edges settled at their target — as opposed to still springing
    // through the fold, when a gate's own path sweeps through COLLECT_R of
    // wherever the player happens to be standing on the way to latching
    const atRest = Math.abs(foldA-foldAT)<.02 && Math.abs(foldB-foldBT)<.02;
    // finding 3 (robustness): the collect check is against each gate's
    // fixed rest point (GATE1_REST/GATE2_REST, already computed above for
    // the dormant marker), not the live, still-animating p1/p2. The spring
    // overshoots to 1.12 before settling back to 1 (intentional: "never a
    // flat ease"), and even with `atRest` gated at a tight .02 this still
    // collected gate 1 mid-swing on a slow/irregular frame in about 1 of
    // every 3 runs under headless timing — the live position is simply too
    // sensitive to exactly which frame `atRest` first turns true. Checking
    // against the fixed rest point removes that timing dependence entirely,
    // and is valid exactly when it matters: GATE1_REST (built under order 0)
    // equals live p1 whenever order actually is 0 and the fold is fully
    // latched — precisely the condition collect(1) gates on.
    const restD1=Math.hypot(playerPos.x-GATE1_REST.x,playerPos.z-GATE1_REST.z);
    const restD2=Math.hypot(playerPos.x-GATE2_REST.x,playerPos.z-GATE2_REST.z);
    // round 5, finding 1 (blocker): collection requires an approach, not
    // just a radius. `armed1`/`armed2` only ever become true while the gate
    // is live (latched, this order, not yet collected) AND the player is
    // currently outside COLLECT_R of its rest point — which includes both
    // the instant the gate first becomes live (catching the case a player
    // was already outside when the second edge latched) and any later
    // moment they step back out after wandering closer. Collection only
    // fires on the frame the player is *armed and inside* — i.e. they were
    // observed outside at some point since the gate went live, and have
    // since walked in. A player who was already standing inside the disc
    // the moment the second edge latched is never armed by that alone; they
    // have to step out and walk back in, same as anyone approaching fresh.
    if(!got1 && latched && order===0){
      if(!armed1 && restD1>=COLLECT_R) armed1=true;
      if(armed1 && restD1<COLLECT_R) collect(1,p1);
    } else armed1=false;
    if(!got2 && latched && order===1){
      if(!armed2 && restD2>=COLLECT_R) armed2=true;
      if(armed2 && restD2<COLLECT_R) collect(2,p2);
    } else armed2=false;
    // finding 2 (continued): the old code swung the camera around with
    // lookBack() to catch the B->A gate's arrival, because at its old
    // position nothing else could bring it into frame. Repositioning RAW2
    // (above) makes it visible under the normal forward-facing camera with
    // no swing at all, so that call — and the flag that tried to verify it
    // actually worked — are gone rather than fixed: a 180-degree whip and
    // back in 1.2s with the finger still on the paper was worse than
    // nothing even when it succeeded (finding 9's false-pass was a symptom
    // of this, not a separate bug to patch around).
    //
    // the wrong light answers with a dull blip, once per approach — "wrong
    // one" is learned by doing, no words about order. Checked against the
    // *live* p1/p2 (unlike the collect check above): the wrong gate is
    // still a real, moving thing under whatever order is currently active,
    // and it's that visible position a wandering player can actually walk
    // into. Gated on the folds being at rest so a gate sweeping through
    // COLLECT_R mid-fold during a clean, correct pull never reads as a
    // wrong touch. finding 5: at order 1 the two gates sit close enough
    // that their COLLECT_R discs overlap almost completely, so a plain walk
    // to the *correct* gate crosses the wrong one's disc too — suppress the
    // wrong-light check whenever the live gate for the current order is at
    // least as close, or itself in reach. Moving RAW2 (above) also
    // surfaced a second case: its own live position under the *other*
    // order can swing close to right where a player is standing simply to
    // fold in the first place, before they've walked toward either gate —
    // `stepped` (parked players are always within GRAB_R, well under 1.5)
    // keeps that from ever reading as a wrong touch. Round 5: moving RAW1
    // (finding 4) put gate 1's own wrong-order position at only ~0.75 from
    // the crossing — *closer* than a parked player's own settled distance
    // (~0.99, via the hinge safety above), so an instantaneous distX>1.5
    // check can no longer tell "just parked to fold" from "deliberately
    // standing on the wrong gate" by distance alone; the two are closer
    // together than the threshold could ever separate. Made persistent
    // instead: once the player has stepped more than 1.5 from the crossing
    // at any point while this latch is up, `steppedFlag` stays true for the
    // rest of it — a real walk away from the fold spot and toward *anything*
    // sets it, so a subsequent direct approach to a nearby wrong gate still
    // reads correctly, while a player who has never left the fold spot still
    // doesn't get dinged the instant the second edge latches.
    if(!latched) steppedFlag=false; else if(distX>1.5) steppedFlag=true;
    const d1=Math.hypot(playerPos.x-p1.x,playerPos.z-p1.z);
    const d2=Math.hypot(playerPos.x-p2.x,playerPos.z-p2.z);
    const near1=d1<COLLECT_R, near2=d2<COLLECT_R;
    const stepped = steppedFlag;
    if(!got1 && order!==0 && near1 && atRest && stepped && !(near2||d2<=d1)){ if(!wrongNear1){wrongNear1=true;wrongTouches++;blip(150,.15,.08,'triangle');emitRipple(p1.x,p1.z,.7);} }
    else wrongNear1=false;
    if(!got2 && order!==1 && near2 && atRest && stepped && !(near1||d1<=d2)){ if(!wrongNear2){wrongNear2=true;wrongTouches++;blip(150,.15,.08,'triangle');emitRipple(p2.x,p2.z,.7);} }
    else wrongNear2=false;

    // the real dead end: fold both edges up again in an order already
    // collected (e.g. A->B again after gate 1) and there is no live gate
    // left to walk to for that order — nothing will ever happen until the
    // player unfolds and pulls the other one first. Judged on the *targets*
    // (foldAT/foldBT), not the springy fa/fb: the player's intent is "both
    // pulled", a stable, discrete fact, and doesn't need to wait out — or
    // survive — however long the spring takes to visually settle.
    const bothPulled = foldAT>.5 && foldBT>.5;
    const liveGateForOrder = order===0 ? !got1 : !got2;
    const deadEnd = bothPulled && !liveGateForOrder && !(got1&&got2);
    // finding 11: timed off `t` (clock.elapsedTime, real wall time) rather
    // than accumulating the frame `dt` — dt is clamped to .1 in the core
    // loop, so under a heavy load or a loaded phone (exactly when the
    // player is most likely to actually be stuck) accumulating it makes the
    // "10 s" prompt take proportionally longer than 10 real seconds to fire.
    if(curRegion===region && deadEnd){
      if(stuckSince<0) stuckSince=t;
      stuckT=t-stuckSince;
      if(stuckT>10 && !promptShown){ promptShown=true; setPrompt('Pull the other one first.'); }
    } else { stuckSince=-1; stuckT=0; if(promptShown){promptShown=false; setPrompt('');} }
  },
  constrain(prevX,prevZ,pos,vel){
    // once an edge is latched, the raised half is drawn right through
    // whatever stands exactly on its hinge line, and the mirrored self
    // clamps onto the same line — both read as a glitch. A soft push keeps
    // the player at least this far off the line, on whichever side they
    // already were, no thud (just a ripple, and only occasionally — not
    // every single frame the player leans on the line).
    //
    // finding 6: the fallback (both pos and prevX/Z sitting exactly on the
    // line — precisely what happens when the player is parked dead-center
    // on the crossing itself, which is the standing spot the region
    // *teaches*) must default to the near/ground side of the hinge, not the
    // far/raised one. The original `||1` fallback pushed toward the half
    // that lifts, carrying a player who stood still on the X straight up
    // as the fold went through. Ground half is the un-rotated side of each
    // hinge: x<CX for A, z<CZ for B — hence `||-1`.
    //
    // Also gated on low velocity, which the original did not do: without
    // it this is a wall, not a nudge — a player *actively walking across*
    // the line (say, from the A->B gate's ground quadrant over to the far
    // side to reach the B->A gate, which sits on the opposite side of
    // hinge B from where a fold gets pulled) would get shoved back to
    // whichever side they started on every single frame they're within
    // MARGIN, forever, since crossing the line always passes back through
    // it. Real players are never standing still there except in the exact
    // scenario this exists to fix: parked on the crossing while dragging
    // an edge, where velocity is already ~0. A player with real walking
    // speed passes straight through undisturbed.
    const MARGIN=.7, PARKED=1.5;
    if(Math.max(0,foldA)>.9 && Math.abs(pos.x-CX)<MARGIN && Math.abs(vel.x)<PARKED){
      const side=Math.sign(pos.x-CX)||Math.sign(prevX-CX)||-1;
      pos.x=CX+side*MARGIN; vel.x=0;
      if(clock.elapsedTime-hingeCoolA>.4){hingeCoolA=clock.elapsedTime; emitRipple(CX,pos.z,.4);}
    }
    if(Math.max(0,foldB)>.9 && Math.abs(pos.z-CZ)<MARGIN && Math.abs(vel.z)<PARKED){
      const side=Math.sign(pos.z-CZ)||Math.sign(prevZ-CZ)||-1;
      pos.z=CZ+side*MARGIN; vel.z=0;
      if(clock.elapsedTime-hingeCoolB>.4){hingeCoolB=clock.elapsedTime; emitRipple(pos.x,CZ,.4);}
    }
  },
  onLeave(){
    if(promptShown){promptShown=false; setPrompt('');}
    if(dragA){ try{renderer.domElement.releasePointerCapture(dragAPid);}catch(_){} dragA=false; }
    if(dragB){ try{renderer.domElement.releasePointerCapture(dragBPid);}catch(_){} dragB=false; }
    pending=false; stuckSince=-1; stuckT=0;
    foldAT=0; foldBT=0; foldA=0; foldB=0; aVel=0; bVel=0;
    armed1=false; armed2=false; steppedFlag=false;
    ghost.visible=false;
  },
  hud(){ return {label:'CORNERS', n:(got1?1:0)+(got2?1:0), total:2}; },
  done(){ return got1 && got2; },
  mapPoint(p){ return warp(p.x,p.y,p.z,new THREE.Vector3()); },   // contract: must return a new Vector3
  save(){ return {got1,got2}; },
  load(d){
    got1=!!d.got1; got2=!!d.got2;
    if(got1) light1.visible=false; if(got2) light2.visible=false;
    updateDormant(); refreshHud();
  },
  debug(){ return {foldA:+foldA.toFixed(2), foldB:+foldB.toFixed(2), order, got1, got2, wrongTouches, armed1, armed2,
    marker1On:marker1.g.visible, marker2On:marker2.g.visible, dormantOn:dormant.g.visible,
    promptShown, stuckT:+stuckT.toFixed(2)}; }
});
