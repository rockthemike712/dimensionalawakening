import * as THREE from 'three';
import {registerRegion, world, playerPos, dim, crossed, emitRipple, blip, chime, slide,
        pulseFlash, setPrompt, refreshHud, makeLight, saveGame, planeMat, camera,
        clock, renderer, audio, curRegion, rgt} from '../game.js';

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
// through the crossing, and the entrance now sits ON the crossing (CX,CZ)
// too — so the corner comes to the player by construction, no matter which
// order they pull in: the A->B gate (RAW1) lands ~0.4 units from the
// crossing, the B->A gate (RAW2) ~5.3 units out (checked by direct
// computation of warp() at fa=fb=1 for each order).
const RAW1=new THREE.Vector3(28,0,4);   // order A->B gate (~0.4 from the crossing)
const RAW2=new THREE.Vector3(31,0,6);   // order B->A gate (~5.3 from the crossing)
const COLLECT_R=1.7;
const GRAB_R=4.5;                       // must stand this close to the crossing for a pull to do anything
const GHOST_R=1.7;                      // the mirrored self never strays farther (over ground) than this from where the camera is actually looking
const GHOST_YMAX=1.1;                   // ...nor rises higher than this above the ground

// ---------- fold state (springs, not plain eases: they overshoot on latch) ----------
let foldA=0, foldAT=0, aVel=0;
let foldB=0, foldBT=0, bVel=0;
let order=0;                     // 0 = A pulled first (A then B), 1 = B first (B then A)
let got1=false, got2=false, promptShown=false, stuckT=0;
let dragA=false, dragAY=0, dragAT0=0, dragAPid=null;
let dragB=false, dragBX=0, dragBT0=0, dragBPid=null;
let rippleCoolA=0, rippleCoolB=0, humCoolA=0, humCoolB=0;
let wrongNear1=false, wrongNear2=false, wrongTouches=0;

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
const _p1=new THREE.Vector3(), _p2=new THREE.Vector3(), _ghostMp=new THREE.Vector3(), _playerWarp=new THREE.Vector3();

// ---------- ground patch: a clone of the sheet look, two hinges of its own ----------
const geo=new THREE.PlaneGeometry(24,18,120,90); geo.rotateX(-Math.PI/2);
const MAX_RIP=6;
const mat=new THREE.ShaderMaterial({
  transparent:true, side:THREE.DoubleSide,
  uniforms:{uTime:{value:0},uA:{value:0},uB:{value:0},uOrder:{value:0},uFold:{value:0},
    uAwake:{value:0},uDim:{value:0},uCombo:{value:0},
    uRip:{value:planeMat.uniforms.uRip.value},        // shared ring buffer: emitRipple() reaches this patch too
    uRipC:{value:planeMat.uniforms.uRipC.value}},
  vertexShader:`
    uniform float uTime; uniform float uA; uniform float uB; uniform float uOrder; uniform float uAwake;
    uniform vec4 uRip[${MAX_RIP}]; uniform vec3 uRipC[${MAX_RIP}];
    varying vec3 vPos; varying float vRip; varying float vSide; varying vec3 vRipC; varying float vBoth; varying vec2 vWorld;
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
      vSide=step(0.0,position.x);
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
    uniform float uTime; uniform float uFold; uniform float uAwake; uniform float uDim; uniform float uCombo;
    varying vec3 vPos; varying float vRip; varying float vSide; varying vec3 vRipC; varying float vBoth; varying vec2 vWorld;
    float grid(float x,float s){float q=abs(fract(x/s-.5)-.5)/fwidth(x/s);return 1.-min(q,1.);}
    void main(){
      float g=max(grid(vPos.x,1.0),grid(vPos.z,1.0));
      float fine=max(grid(vPos.x,.25),grid(vPos.z,.25))*.18;
      vec3 a=vec3(.015,.055,.075); vec3 b=vec3(.02,.28,.34);
      // same paper: these four terms read world coordinates, like the core's sheet does,
      // so the hue does not drift apart across x=15 as the world awakens
      float pulse=.5+.5*sin(uTime*.7+vWorld.x*.3-vWorld.y*.22);
      vec3 col=mix(a,b,g*.48+fine)+vec3(.03,.13,.15)*pulse*uAwake;
      col+=vec3(.1,.9,1.2)*exp(-abs(vPos.x)*2.2)*(.35+uFold*.9);
      col*=1.0+.9*uFold*vSide*(1.0-uDim);
      col+=vRipC*.9;
      float m=sin(vWorld.x*6.0+uTime*.6)*sin(vWorld.y*6.0-uTime*.5);
      vec3 wrong=vec3(.55+.45*sin(uTime*.31+vWorld.y*.4),.35+.35*sin(uTime*.23+vWorld.x*.35+2.1),.7+.3*sin(uTime*.27+3.9));
      col+=wrong*smoothstep(.45,1.0,m)*.24*uAwake*(g*.9+fine+.25);
      float drift=uAwake*.45*(.5+.5*sin(uTime*.4+length(vWorld)*.35));
      col=mix(col,col.brg,drift);
      // a real rim on the doubly folded quarter: bright along its two crease
      // edges, not a flat tint across the whole face
      vec2 vFlat=vWorld-vec2(${CX.toFixed(1)},${CZ.toFixed(1)});
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
  const ring=new THREE.Mesh(new THREE.RingGeometry(.62,.8,48),
    new THREE.MeshBasicMaterial({color:COLOR,transparent:true,opacity:.8,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2;
  const disc=new THREE.Mesh(new THREE.CircleGeometry(.6,40),
    new THREE.MeshBasicMaterial({color:COLOR,transparent:true,opacity:.18,side:THREE.DoubleSide}));
  disc.rotation.x=-Math.PI/2;
  g.add(ring,disc); g.visible=false;
  return {g,ring,disc};
}
const marker1=makeGroundMarker(), marker2=makeGroundMarker();

// ---------- the mirrored player: reads as *you*, not as the gate — the
// player's own white-cyan palette, lifted clear of its own shadow ----------
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
  if(inA && (!inB || dA<=dB)){ dragA=true; dragAY=e.clientY; dragAT0=foldAT; dragAPid=e.pointerId; }
  else { dragB=true; dragBX=e.clientX; dragBT0=foldBT; dragBPid=e.pointerId; }
  try{renderer.domElement.setPointerCapture(e.pointerId);}catch(_){}
  audio(); emitRipple(CX,CZ,.7);
}
function onMove(e){
  if(!crossed || curRegion!==region) return;
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
  refreshHud(); chime(); pulseFlash();
  emitRipple(p.x,p.z,1.8,new THREE.Color(1,.85,.5));
  foldAT=0; foldBT=0;      // collecting it lets the paper spring back open
  saveGame();
}

// test hook: where a gate light is standing right now, after the folds
window.__DA_corner={
  light(n){const p=warp(n===1?RAW1.x:RAW2.x,0,n===1?RAW1.z:RAW2.z);return {x:+p.x.toFixed(2),y:+p.y.toFixed(2),z:+p.z.toFixed(2)};},
  ghost(){return {x:+ghost.position.x.toFixed(2),y:+ghost.position.y.toFixed(2),z:+ghost.position.z.toFixed(2),visible:ghost.visible};},
  get wrongTouches(){return wrongTouches;}
};
let region;
region = registerRegion({
  id:'corner', name:'CORNERS', color:COLOR,
  // the entrance sits ON the crossing itself, not at the bounds' edge — the
  // core's beacon walks the player onto the X before they ever pull, so
  // "stand on it" is the first thing they do here, not a rule found later.
  bounds:{x0:15,x1:39,z0:-9,z1:9}, entrance:new THREE.Vector3(CX,0,CZ),
  build(){
    world.add(patch,dimMesh,ghost,marker1.g,marker2.g);
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
    mat.uniforms.uA.value=fa; mat.uniforms.uB.value=fb; mat.uniforms.uOrder.value=order;
    mat.uniforms.uTime.value=t; mat.uniforms.uDim.value=dim; mat.uniforms.uCombo.value=combo;
    mat.uniforms.uFold.value=fa; mat.uniforms.uAwake.value=planeMat.uniforms.uAwake.value;
    dimMesh.material.opacity=.62*THREE.MathUtils.smoothstep(combo,.08,.55);

    const onA=foldAT>.5, onB=foldBT>.5;
    edgeA.mat.color.setHex(onA?0xffffff:0x60f7ff); edgeA.mat.opacity=onA?.95:.6+.3*Math.sin(t*3.1);
    edgeA.haloMat.opacity=onA?.3:.09+.06*Math.sin(t*2.2);
    edgeB.mat.color.setHex(onB?0xffffff:0x60f7ff); edgeB.mat.opacity=onB?.95:.6+.3*Math.sin(t*3.4);
    edgeB.haloMat.opacity=onB?.3:.09+.06*Math.sin(t*2.5);

    const p1=warp(RAW1.x,RAW1.y,RAW1.z,_p1), p2=warp(RAW2.x,RAW2.y,RAW2.z,_p2);
    light1.position.copy(p1); light2.position.copy(p2);
    animateGate(light1,t,!got1&&order===0); animateGate(light2,t,!got2&&order===1);

    marker1.g.visible=!got1&&order===0; marker1.g.position.set(p1.x,.05,p1.z);
    marker2.g.visible=!got2&&order===1; marker2.g.position.set(p2.x,.05,p2.z);
    marker1.ring.material.opacity=.55+.3*Math.sin(t*3); marker2.ring.material.opacity=.55+.3*Math.sin(t*3+1.7);

    // the mirrored player: a true point-reflection through the crossing
    // moves opposite the player — but the camera follows the player, not
    // the crossing, so a 1:1 reflection walks itself the *same* distance
    // out the other side and straight out of a 36-degree portrait frustum
    // the moment the player is more than a few units off the X (compressing
    // it toward the fixed crossing doesn't fix this either: the gap between
    // camera and ghost still grows without bound as the player wanders).
    // Warp the *true* reflection first — that's what makes it stand on the
    // actual tilted paper, folded quarter and all — then clamp the result
    // to within GHOST_R over the ground of where the *camera itself* is
    // actually looking: game.js aims the camera at foldedPoint(playerPos)
    // with its y forced to 0 (this same warp() applied to the player, x/z
    // only), so when the player stands in the doubly-folded quadrant their
    // own view swings across too. Clamping against raw playerPos ignores
    // that swing and the ghost drifts out of frame right along with it.
    // Height is capped on its own — the camera never tracks it either.
    const distX=Math.hypot(playerPos.x-CX,playerPos.z-CZ);
    const rp=warp(playerPos.x,playerPos.y,playerPos.z,_playerWarp);
    const raw=warp(2*CX-playerPos.x,0,2*CZ-playerPos.z,_ghostMp);
    let gdx=raw.x-rp.x, gdz=raw.z-rp.z;
    const glen=Math.hypot(gdx,gdz);
    if(glen>GHOST_R){ const sc=GHOST_R/glen; gdx*=sc; gdz*=sc; }
    ghost.position.set(rp.x+gdx, THREE.MathUtils.clamp(raw.y,0,GHOST_YMAX), rp.z+gdz);
    // hide it once the player is standing right on the crossing — reflected
    // through itself it would sit on top of the player, reading as nothing
    ghost.visible=crossed && Math.max(fa,fb)>.05 && !(got1&&got2) && distX>1;

    const latched = fa>.9 && fb>.9;
    const d1=Math.hypot(playerPos.x-p1.x,playerPos.z-p1.z);
    const d2=Math.hypot(playerPos.x-p2.x,playerPos.z-p2.z);
    if(!got1 && latched && order===0 && d1<COLLECT_R) collect(1,p1);
    if(!got2 && latched && order===1 && d2<COLLECT_R) collect(2,p2);
    // the wrong light answers with a dull blip, once per approach — "wrong
    // one" is learned by doing, no words about order
    const near1=d1<COLLECT_R, near2=d2<COLLECT_R;
    if(!got1 && order!==0 && near1){ if(!wrongNear1){wrongNear1=true;wrongTouches++;blip(150,.15,.08,'triangle');emitRipple(p1.x,p1.z,.7);} }
    else wrongNear1=false;
    if(!got2 && order!==1 && near2){ if(!wrongNear2){wrongNear2=true;wrongTouches++;blip(150,.15,.08,'triangle');emitRipple(p2.x,p2.z,.7);} }
    else wrongNear2=false;

    // every order always delivers *a* gate — there is no "wrong order" state
    // to warn about. The one real failure is folding it and then wandering:
    // both latched, standing more than 6 units off the X for 10 seconds.
    if(curRegion===region && latched && distX>6){
      stuckT += dt;
      if(stuckT>10 && !promptShown){ promptShown=true; setPrompt('Stand on the crossing.'); }
    } else { stuckT=0; if(promptShown){promptShown=false; setPrompt('');} }
  },
  onLeave(){
    if(promptShown){promptShown=false; setPrompt('');}
    if(dragA){ try{renderer.domElement.releasePointerCapture(dragAPid);}catch(_){} dragA=false; }
    if(dragB){ try{renderer.domElement.releasePointerCapture(dragBPid);}catch(_){} dragB=false; }
    foldAT=0; foldBT=0; foldA=0; foldB=0; aVel=0; bVel=0;
    ghost.visible=false;
  },
  hud(){ return {label:'CORNERS', n:(got1?1:0)+(got2?1:0), total:2}; },
  done(){ return got1 && got2; },
  mapPoint(p){ return warp(p.x,p.y,p.z,new THREE.Vector3()); },   // contract: must return a new Vector3
  save(){ return {got1,got2}; },
  load(d){
    got1=!!d.got1; got2=!!d.got2;
    if(got1) light1.visible=false; if(got2) light2.visible=false;
    refreshHud();
  },
  debug(){ return {foldA:+foldA.toFixed(2), foldB:+foldB.toFixed(2), order, got1, got2, wrongTouches,
    marker1On:marker1.g.visible, marker2On:marker2.g.visible}; }
});
