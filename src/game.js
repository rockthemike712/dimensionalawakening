import * as THREE from 'three';

// =====================================================================
// DIMENSIONAL AWAKENING — the core (see docs/WORLD.md for the region API)
// Stage 1 is a flat sheet seen straight from above (2D). Folding lifts the
// far half of the sheet toward you. Crossing the fold is the birth of depth:
// the camera falls out of the sky and lands behind you, the world extrudes,
// and you are standing on the paper (3D). Beyond the edge the sheet is a
// universe: the room with two openings is one region of it; other regions
// register themselves through registerRegion() and live in src/regions/.
// One variable, `dim` (0 -> 1), drives the whole shift.
// =====================================================================

// ---------- renderer / scene ----------
export const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0x030611,0);
export const camera=new THREE.PerspectiveCamera(4,innerWidth/innerHeight,.1,900);
export const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.15;
document.body.appendChild(renderer.domElement);
export const clock=new THREE.Clock();
export const world=new THREE.Group(); scene.add(world);
export function portraitMode(){return innerHeight>innerWidth*1.15;}
export const ease=k=>k<=0?0:k>=1?1:k*k*(3-2*k);

// ---------- state ----------
export const FOLD_OPEN=0.68;
export let fold=0, foldTarget=0;
let dragging=false, dragStartX=0, dragStartFold=0;
export const playerPos=new THREE.Vector3(-7,0,-1);
export const velocity=new THREE.Vector3();
export let seeds=0, awakened=0, moveCount=0;
export let crossed=false, dimT=-99, dim=0;     // the dimensional shift
let ripIdx=0, moveAccum=0;
export const keys={};
export const held={x:0,z:0};
export const fwd=new THREE.Vector3(0,0,-1), rgt=new THREE.Vector3(1,0,0); // screen-relative axes
// the universe: one sheet. The 2D page is the small area west of the edge;
// everything east of it is walkable once you have crossed.
export const WORLD={x0:-40,x1:40,z0:-28,z1:28};
export const PAGE={x0:-11,x1:-.45,z0:-8,z1:8};
export function setFoldTarget(v){foldTarget=THREE.MathUtils.clamp(v,0,1);}
// local flattening (0..1): a region can squash the view and the player back toward
// 2D without changing which way the pad points. Shapes/camera pitch use dim*(1-flat).
export let flat=0;
export function setFlat(v){flat=THREE.MathUtils.clamp(v,0,1.4);}
export const shape=()=>dim*(1-Math.min(1,flat));
export function addAwake(k){awakened=Math.min(1,awakened+k);planeMat.uniforms.uAwake.value=awakened;}

// ---------- regions: the universe is a set of places that register themselves ----------
export const regions=[];
export let curRegion=null;
export function registerRegion(r){r.built=!r.build;r.visited=false;regions.push(r);return r;}
export function regionAt(x,z){return regions.find(r=>r.bounds&&r.built&&(crossed?!r.page:r.page)&&x>=r.bounds.x0&&x<=r.bounds.x1&&z>=r.bounds.z0&&z<=r.bounds.z1)||null;}
// Act I is three rungs in order; the room is Act II and does not exist until they are done
export const ACT1=['thin','corner','lamp'];
const byId=id=>regions.find(r=>r.id===id);
export function actDone(){return ACT1.every(id=>{const r=byId(id);return r&&r.done&&r.done();});}
export function residue(id){const r=byId(id);return !!(r&&r.done&&r.done());}
let walked=0, digestedAt=-1;                     // free play after the crossing: no signposts until digested
export function digested(){return crossed&&digestedAt>=0;}
export function inBounds(b,x,z,m=0){return x>=b.x0-m&&x<=b.x1+m&&z>=b.z0-m&&z<=b.z1+m;}
function buildRegion(r){if(r.built)return;r.built=true;try{r.build&&r.build();}catch(e){console.error('region '+r.id+' build failed',e);}}

const promptEl=document.getElementById('prompt');
const countEl=document.getElementById('count');
const flashEl=document.getElementById('flash');
const dpadEl=document.getElementById('dpad');
const beaconArrow=document.getElementById('beaconArrow');
const moveStatus=document.getElementById('moveStatus');
const dimLabel=document.getElementById('dimLabel');
const pipsEl=document.getElementById('pips');

// ---------- audio ----------
let AC=null, foldOsc=null, foldGain=null;
export function audio(){
  if(AC) return AC;
  try{
    AC=new (window.AudioContext||window.webkitAudioContext)();
    foldOsc=AC.createOscillator(); foldGain=AC.createGain();
    foldOsc.type='sine'; foldOsc.frequency.value=52; foldGain.gain.value=0;
    foldOsc.connect(foldGain).connect(AC.destination); foldOsc.start();
  }catch(e){}
  return AC;
}
export function blip(freq,dur=.09,gain=.12,type='triangle',pan=0){
  const ac=audio(); if(!ac) return;
  const o=ac.createOscillator(), g=ac.createGain();
  o.type=type; o.frequency.value=freq;
  g.gain.setValueAtTime(gain,ac.currentTime);
  g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+dur);
  let tail=g;
  if(pan&&ac.createStereoPanner){const p=ac.createStereoPanner();p.pan.value=THREE.MathUtils.clamp(pan,-1,1);g.connect(p);tail=p;}
  o.connect(g); tail.connect(ac.destination); o.start(); o.stop(ac.currentTime+dur);
}
export function slide(f0,f1,dur=.28,gain=.1){
  const ac=audio(); if(!ac) return;
  const o=ac.createOscillator(), g=ac.createGain(); o.type='sine';
  o.frequency.setValueAtTime(f0,ac.currentTime); o.frequency.exponentialRampToValueAtTime(f1,ac.currentTime+dur);
  g.gain.setValueAtTime(gain,ac.currentTime); g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+dur+.1);
  o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime+dur+.12);
}
export function chime(){[523,659,784,1046].forEach((f,i)=>setTimeout(()=>blip(f,.35,.09,'sine'),i*70));}
function depthChord(){[130,196,262,330,392,523].forEach((f,i)=>setTimeout(()=>blip(f,1.6,.07,'sine'),i*140));}

// ---------- UI helpers ----------
export function setPrompt(t){promptEl.style.visibility=t?'visible':'hidden';if(promptEl.textContent===t)return;
  promptEl.classList.add('swap');
  setTimeout(()=>{promptEl.textContent=t;promptEl.classList.remove('swap')},220);}
export function setPips(n,total){
  if(total!==undefined){while(pipsEl.children.length<total)pipsEl.appendChild(document.createElement('i'));
    while(pipsEl.children.length>total)pipsEl.removeChild(pipsEl.lastChild);}
  [...pipsEl.children].forEach((el,i)=>el.classList.toggle('lit',i<n));}
export function refreshHud(){
  const h=curRegion&&curRegion.hud?curRegion.hud():null;
  if(h){countEl.textContent=`${h.label} ${h.n} / ${h.total}`; setPips(h.n,h.total); countEl.style.opacity=.68; pipsEl.style.opacity=1;}
  else{countEl.style.opacity=0; pipsEl.style.opacity=0;}       // no counter tells the player what to want
}
export function pulseFlash(){flashEl.style.opacity=.5;setTimeout(()=>flashEl.style.opacity=0,90)}

// ---------- starfield ----------
{
  const n=1400, pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){const r=40+Math.random()*120,a=Math.random()*Math.PI*2,b=Math.acos(2*Math.random()-1);
    pos[i*3]=Math.sin(b)*Math.cos(a)*r;pos[i*3+1]=Math.cos(b)*r*.7;pos[i*3+2]=Math.sin(b)*Math.sin(a)*r;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const stars=new THREE.Points(g,new THREE.PointsMaterial({color:0x78dfff,size:.42,transparent:true,opacity:.62,depthWrite:false}));
  scene.add(stars); scene.userData.stars=stars;
}

// ---------- the sheet ----------
// the sheet near the edge is fine (ripples need it); the rest of the universe is
// the same sheet at half density with a hole under the fine part (overlapping by .5)
const planeGeo=new THREE.PlaneGeometry(24,18,120,90); planeGeo.rotateX(-Math.PI/2);
function outerSheet(){   // 4x4 chunks so the far ones are frustum-culled
  const out=[], CX=4, CZ=4, W=(WORLD.x1-WORLD.x0)/CX, H=(WORLD.z1-WORLD.z0)/CZ;
  for(let cz=0;cz<CZ;cz++)for(let cx=0;cx<CX;cx++){
    const x0=WORLD.x0+cx*W, z0=WORLD.z0+cz*H, nx=Math.round(W*2), nz=Math.round(H*2), pos=[], idx=[];
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++)pos.push(x0+i*.5,0,z0+j*.5);
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
      const x=x0+(i+.5)*.5, z=z0+(j+.5)*.5; if(Math.abs(x)<11.5&&Math.abs(z)<8.5)continue;
      const a=j*(nx+1)+i, b=a+1, c=a+nx+1, d=c+1; idx.push(a,c,b,b,c,d);
    }
    if(!idx.length)continue;
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setIndex(idx); g.computeBoundingSphere();
    g.boundingSphere.radius+=Math.max(0,x0+W);      // the fold lifts x>0 vertices by up to their x: keep them inside the culling sphere
    out.push(g);
  }
  return out;
}
const MAX_RIP=6;
export const planeMat=new THREE.ShaderMaterial({
  transparent:true, side:THREE.DoubleSide,
  uniforms:{uTime:{value:0},uFold:{value:0},uFold2:{value:0},uAwake:{value:0},uDim:{value:0},uWorld:{value:new THREE.Vector2(WORLD.x1,WORLD.z1)},
    uRip:{value:Array.from({length:MAX_RIP},()=>new THREE.Vector4(0,0,-99,0))},
    uRipC:{value:Array.from({length:MAX_RIP},()=>new THREE.Vector3(.2,1,1.1))}},
  vertexShader:`
    uniform float uTime; uniform float uFold; uniform float uFold2; uniform float uAwake;
    uniform vec4 uRip[${MAX_RIP}]; uniform vec3 uRipC[${MAX_RIP}];
    varying vec3 vPos; varying float vSide; varying vec2 vXZ; varying vec3 vRipC;
    void main(){
      vec3 p=position; vXZ=position.xz;
      float theta=uFold*1.42;
      float rip=0.0; vec3 ripc=vec3(0.0);
      for(int i=0;i<${MAX_RIP};i++){
        float age=uTime-uRip[i].z;
        if(age>0.0&&age<3.0){
          float d=distance(position.xz,uRip[i].xy);
          float r=exp(-9.0*abs(d-age*3.4))*exp(-age*1.4)*uRip[i].w;
          rip+=r; ripc+=uRipC[i]*r;
        }
      }
      vRipC=ripc;
      p.y+=rip*.22;
      vSide=step(0.0,position.x);
      if(p.x>0.0){ float x=p.x; p.x=cos(theta)*x; p.y+=sin(theta)*x; }
      // the room's second edge only folds the room's own floor (masked in z and x)
      float t2=uFold2*.62*(1.0-smoothstep(6.5,8.5,abs(position.z)))*(1.0-smoothstep(11.5,12.5,position.x));
      if(p.x>8.6){ float x=p.x-8.6; float y=p.y; p.x=8.6+cos(t2)*x-sin(t2)*y; p.y=sin(t2)*x+cos(t2)*y; }
      p.y+=sin(length(position.xz)*1.2-uTime*1.8)*.06*(.2+uAwake);
      vPos=p;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
    }`,
  fragmentShader:`
    uniform float uTime; uniform float uFold; uniform float uAwake; uniform float uDim; uniform vec2 uWorld;
    uniform vec4 uRip[${MAX_RIP}]; uniform vec3 uRipC[${MAX_RIP}];
    varying vec3 vPos; varying float vSide; varying vec2 vXZ; varying vec3 vRipC;
    float grid(float x,float s){float q=abs(fract(x/s-.5)-.5)/fwidth(x/s);return 1.-min(q,1.);}
    void main(){
      float g=max(grid(vPos.x,1.0),grid(vPos.z,1.0));
      float fine=max(grid(vPos.x,.25),grid(vPos.z,.25))*.18;
      vec3 a=vec3(.015,.055,.075); vec3 b=vec3(.02,.28,.34);
      float pulse=.5+.5*sin(uTime*.7+vPos.x*.3-vPos.z*.22);
      vec3 col=mix(a,b,g*.48+fine)+vec3(.03,.13,.15)*pulse*uAwake;
      // the edge of the paper is always luminous; folding makes the lifted
      // half brighter (it is coming toward you)
      col+=vec3(.1,.9,1.2)*exp(-abs(vPos.x)*2.2)*(.35+uFold*.9);
      col*=1.0+.9*uFold*vSide*(1.0-uDim);
      // ripples are coloured per pixel on the coarse outer sheet so they stay crisp;
      // the fine sheet near the edge gets the same colour from its vertices
      #ifdef PIXRIP
      vec3 ripc=vec3(0.0);
      for(int i=0;i<${MAX_RIP};i++){
        float age=uTime-uRip[i].z;
        if(age>0.0&&age<3.0){ float d=distance(vXZ,uRip[i].xy); ripc+=uRipC[i]*exp(-9.0*abs(d-age*3.4))*exp(-age*1.4)*uRip[i].w; }
      }
      col+=ripc*.9;
      #else
      col+=vRipC*.9;
      #endif
      // the paper has a luminous border all the way round, like the edge at x=0
      float ed=max(min(uWorld.x-abs(vXZ.x),uWorld.y-abs(vXZ.y)),0.0);
      col+=vec3(.1,.9,1.2)*exp(-ed*1.4)*.55;
      float m=sin(vPos.x*6.0+uTime*.6)*sin(vPos.z*6.0-uTime*.5);
      vec3 wrong=vec3(.55+.45*sin(uTime*.31+vPos.z*.4),.35+.35*sin(uTime*.23+vPos.x*.35+2.1),.7+.3*sin(uTime*.27+3.9));
      col+=wrong*smoothstep(.45,1.0,m)*.24*uAwake*(g*.9+fine+.25);
      float drift=uAwake*.45*(.5+.5*sin(uTime*.4+length(vPos.xz)*.35));
      col=mix(col,col.brg,drift);
      gl_FragColor=vec4(col,.94);
    }`
});
const sheetMesh=new THREE.Mesh(planeGeo,planeMat); world.add(sheetMesh);
const outerMat=planeMat.clone(); outerMat.defines={PIXRIP:1}; outerMat.uniforms=planeMat.uniforms;   // same uniforms object: one update feeds both
for(const g of outerSheet()){const m=new THREE.Mesh(g,outerMat); m.position.y=-.04; world.add(m);}
export function emitRipple(x,z,s=1,c=null){
  planeMat.uniforms.uRip.value[ripIdx].set(x,z,clock.elapsedTime,s);
  if(c)planeMat.uniforms.uRipC.value[ripIdx].set(c.r*1.1,c.g*1.1,c.b*1.1);else planeMat.uniforms.uRipC.value[ripIdx].set(.2,1,1.1);
  ripIdx=(ripIdx+1)%MAX_RIP;
}

// ---------- the edge (seam): a glowing line on the sheet; a wall of light in 3D ----------
const seamMat=new THREE.MeshBasicMaterial({color:0x60f7ff,transparent:true,opacity:.9});
const seam=new THREE.Mesh(new THREE.BoxGeometry(.16,.06,56),seamMat);seam.position.y=.05;world.add(seam);
const seamHalo=new THREE.Mesh(new THREE.BoxGeometry(.7,.02,56),
  new THREE.MeshBasicMaterial({color:0x20d9ff,transparent:true,opacity:.14,blending:THREE.AdditiveBlending}));
seamHalo.position.y=.03;world.add(seamHalo);
const seamWall=new THREE.Mesh(new THREE.PlaneGeometry(56,2.6),
  new THREE.MeshBasicMaterial({color:0x2ee9ff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false}));
seamWall.rotation.y=Math.PI/2; seamWall.position.y=1.3; world.add(seamWall);
const seamGrab=new THREE.Mesh(new THREE.BoxGeometry(3.4,5,56),new THREE.MeshBasicMaterial({visible:false}));
seamGrab.position.y=1; world.add(seamGrab);

// ---------- player: a flat disc in 2D, a sphere in 3D ----------
const pDisc=new THREE.Mesh(new THREE.CircleGeometry(.42,40),new THREE.MeshBasicMaterial({color:0xeaffff}));
pDisc.rotation.x=-Math.PI/2;pDisc.position.y=.08;
const pRing=new THREE.Mesh(new THREE.RingGeometry(.55,.66,48),
  new THREE.MeshBasicMaterial({color:0x52f5ff,transparent:true,opacity:.55,side:THREE.DoubleSide}));
pRing.rotation.x=-Math.PI/2;pRing.position.y=.07;
const pCore=new THREE.Mesh(new THREE.IcosahedronGeometry(.36,2),
  new THREE.MeshStandardMaterial({color:0xdfffff,emissive:0x49e9ff,emissiveIntensity:3,roughness:.18,metalness:.15}));
const pHalo=new THREE.Mesh(new THREE.SphereGeometry(.6,24,24),
  new THREE.MeshBasicMaterial({color:0x52f5ff,transparent:true,opacity:.075,blending:THREE.AdditiveBlending,depthWrite:false}));
const pShadow2=new THREE.Mesh(new THREE.CircleGeometry(.5,32),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.22}));
pShadow2.rotation.x=-Math.PI/2; pShadow2.visible=false;
const pShadow=new THREE.Mesh(new THREE.CircleGeometry(.5,32),
  new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0}));
pShadow.rotation.x=-Math.PI/2;pShadow.position.y=.02;
const p3=new THREE.Group();p3.add(pCore,pHalo);
export const player=new THREE.Group();player.add(pDisc,pRing,p3,pShadow,pShadow2);world.add(player);

scene.add(new THREE.HemisphereLight(0x8ceeff,0x04040c,1.3));
const point=new THREE.PointLight(0x66f5ff,20,18);point.position.set(-4,6,2);scene.add(point);

// ---------- the lights ----------
// L1 teaches movement. L2/L3 are beyond the edge — reachable only through the fold.
const seedData=[
 {p:new THREE.Vector3(-3,0,-1)},
 {p:new THREE.Vector3(8,0,6)},
 {p:new THREE.Vector3(13,0,-6)}
];
const seedMeshes=[], beams=[], glows=[];
// a light: the game's one signpost. Regions get one at their entrance.
export function makeLight(pos,color=0x62ffff){
 const g=new THREE.Group();
 const core=new THREE.Mesh(new THREE.OctahedronGeometry(.28,0),
   new THREE.MeshStandardMaterial({color:0xffffff,emissive:color,emissiveIntensity:4,roughness:.1}));
 core.scale.setScalar(1.65);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.58,.035,8,64),
   new THREE.MeshBasicMaterial({color,transparent:true,opacity:.65}));
 ring.rotation.x=Math.PI/2; ring.scale.setScalar(1.35); g.add(core,ring);
 const beam=new THREE.Mesh(new THREE.CylinderGeometry(.12,.38,12,24,1,true),
   new THREE.MeshBasicMaterial({color,transparent:true,opacity:.18,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
 beam.position.y=5.9; g.add(beam);
 const glow=new THREE.PointLight(color,34,14);glow.position.y=1.4;g.add(glow);
 g.position.copy(pos);g.position.y=.5;world.add(g);
 g.userData={core,ring,beam,glow,t0:Math.random()*7};
 return g;
}
seedData.forEach((s,i)=>{
 const g=makeLight(s.p); beams.push(g.userData.beam); glows.push(g.userData.glow); seedMeshes.push(g);
});
const regionLights=[];
function animateLight(g,t,active,dimv=dim){
 const u=g.userData;
 g.position.y=.5*dimv+.12*Math.sin(t*2.1+u.t0); g.rotation.y=t*(.5+u.t0*.05); u.ring.rotation.z=t*(.25+u.t0*.03);
 u.core.scale.y=1.65*THREE.MathUtils.lerp(.35,1,dimv);
 u.beam.visible=active&&dimv>.2; u.glow.visible=active;
 if(active)u.beam.material.opacity=.13+.10*(.5+.5*Math.sin(t*3.2+u.t0));
}
function currentTarget(){for(let i=0;i<seedData.length;i++)if(!seedData[i].taken)return i;return -1;}
const guideLine=new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(1,0,0)]),
  new THREE.LineDashedMaterial({color:0x73faff,transparent:true,opacity:.72,dashSize:.35,gapSize:.22}));
guideLine.computeLineDistances();world.add(guideLine);

// ---------- landmarks: reeds. Tall ones sound low, short ones high. ----------
// Heights are the harmonic series of 2.4, so every pillar is an overtone of the
// same string: 2.4 1.6 1.2 .8 .6 .4  ->  A2 E3 A3 E4 A4 E5. Same colour = same
// note. Same colour, half the height = the octave. Brush one and it bends and
// rings; ring two octaves within a second and they become one pillar.
const LM_H=[2.4,1.6,1.2,.8,.6,.4];
const LM_COL={A:new THREE.Color(0x2ee8ff),E:new THREE.Color(0xff4fd8)};
const lmNote=h=>(Math.round(h*10)%3===0)?'A':'E';        // 2.4 1.2 .6 -> A ; 1.6 .8 .4 -> E
const lmFreq=h=>110*2.4/h;
export const landmarks=[]; let lastRing={l:null,t:-99}, tpCool=-99, ringCount=0, tpCount=0, grownCount=0;
function lmBlocked(x,z){
  if(Math.abs(x)<1.6) return true;              // the edge itself
  if(x>0&&Math.abs(z)<1.2&&x<4) return true;     // where the player lands after the crossing
  return false;
}
const LM_GEO={}, LM_BAND={}, WHITE=new THREE.Color(1,1,1), _lp=new THREE.Vector3();
export function makeLandmark(x,z,h,grow=false){
 const note=lmNote(h), col=LM_COL[note];
 const key=h.toFixed(2);
 if(!LM_GEO[key]){const g=new THREE.CylinderGeometry(.09,.1+h*.07,h,6); g.translate(0,h/2,0); LM_GEO[key]=g; LM_BAND[key]=new THREE.TorusGeometry(.16+h*.07,.035,6,14);}
 const m=new THREE.Mesh(LM_GEO[key],new THREE.MeshStandardMaterial({color:col.clone().multiplyScalar(.28),
   emissive:col.clone().multiplyScalar(.55),emissiveIntensity:1,roughness:.72,metalness:.3}));
 const band=new THREE.Mesh(LM_BAND[key],
   new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,depthWrite:false}));
 band.rotation.x=Math.PI/2; band.visible=false;
 const pivot=new THREE.Group(); pivot.add(m,band); world.add(pivot);
 const l={pivot,m,band,x,z,h,note,col,freq:lmFreq(h),bx:0,bz:0,bvx:0,bvz:0,ring:0,white:0,bandT:-99,
   inside:false,pair:null,thread:null,grow:grow?0:1};
 landmarks.push(l); return l;
}
{ // the first three reeds on each side of the edge always hold an octave and a fifth
  const seed={left:[2.4,1.2,1.6],right:[2.4,1.2,1.6]};
  for(let i=0;i<40;i++){
    const x=-10+Math.random()*22,z=-8+Math.random()*16;
    if(lmBlocked(x,z)) continue;
    if(landmarks.some(l=>Math.hypot(l.x-x,l.z-z)<1.3)) continue;
    if(seedData.some(sd=>Math.hypot(sd.p.x-x,sd.p.z-z)<1.6)) continue;
    const side=x<0?'left':'right';
    const h=seed[side].length?seed[side].shift():LM_H[Math.floor(Math.random()*LM_H.length)];
    makeLandmark(x,z,h);
  }
}
// the wide field: reeds across the whole universe, keeping out of every region
function spreadReeds(){
  // stands of reeds, so a straight walk always meets something; one note family
  // per stand, so an octave pair is always within a few steps
  const stands=[]; let tries=0;
  while(stands.length<18&&tries++<600){
    const x=3+Math.random()*(WORLD.x1-5), z=WORLD.z0+3+Math.random()*(WORLD.z1-WORLD.z0-6);
    if(Math.abs(x)<13&&Math.abs(z)<10)continue;                       // the near field is already seeded
    if(regions.some(r=>r.bounds&&!r.page&&inBounds(r.bounds,x,z,3)))continue;
    if(stands.some(q=>Math.hypot(q.x-x,q.z-z)<6.5))continue;
    stands.push({x,z});
  }
  for(const q of stands){
    const n=5+Math.floor(Math.random()*4), fam=Math.random()<.5?[2.4,1.2,.6]:[1.6,.8,.4];
    for(let k=0;k<n;k++){
      const a=Math.random()*Math.PI*2, r=.8+Math.random()*3.2, x=q.x+Math.cos(a)*r, z=q.z+Math.sin(a)*r;
      if(x<WORLD.x0+1.5||x>WORLD.x1-1.5||z<WORLD.z0+1.5||z>WORLD.z1-1.5)continue;
      if(regions.some(r=>r.bounds&&!r.page&&inBounds(r.bounds,x,z,1.5)))continue;
      if(landmarks.some(l=>Math.hypot(l.x-x,l.z-z)<1.1))continue;
      makeLandmark(x,z,Math.random()<.75?fam[Math.floor(Math.random()*3)]:LM_H[Math.floor(Math.random()*6)]);
    }
  }
}
const lmReachable=l=>crossed?l.x>1.4:l.x<0;
export function ringLandmark(l,strength,dir,t,fromPair=false){
 l.ring=1; l.bandT=t; l.bvx+=dir.x*5*(.4+strength*.6); l.bvz+=dir.z*5*(.4+strength*.6);
 const d=new THREE.Vector3(l.x-playerPos.x,0,l.z-playerPos.z), pan=d.dot(rgt)/6;
 blip(l.freq,.7,.05+strength*.09,'sine',pan); blip(l.freq*2,.3,.012+strength*.02,'triangle',pan);
 emitRipple(l.x,l.z,.5+strength*.5,l.col);
 if(fromPair) return;
 ringCount++;
 if(l.pair) ringLandmark(l.pair,strength,dir,t,true);
 const prev=lastRing; lastRing={l,t};
 if(!prev.l||prev.l===l||prev.l===l.pair||t-prev.t>1.0) return;
 if(!lmReachable(l)||!lmReachable(prev.l)) return;
 if(prev.l.note===l.note){ if(Math.abs(prev.l.h-l.h)>1e-3&&!l.pair&&!prev.l.pair) glueLandmarks(prev.l,l,t); }
 else growBetween(prev.l,l,t);
}
function glueLandmarks(a,b,t){
 a.pair=b; b.pair=a; a.white=b.white=1;
 const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
 a.thread=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:1}));
 a.thread.userData.t0=t; world.add(a.thread);
 emitRipple(a.x,a.z,1.4,a.col); emitRipple(b.x,b.z,1.4,b.col); pulseFlash();
 blip(a.freq,1.2,.08,'sine'); blip(b.freq,1.2,.08,'sine'); setTimeout(()=>blip(Math.max(a.freq,b.freq)*2,.5,.05,'sine'),120);
}
function growBetween(a,b,t){
 const ua=Math.round(a.h*5), ub=Math.round(b.h*5);                 // heights in units of .2
 const gcd=(p,q)=>q?gcd(q,p%q):p; const h=Math.max(.4,gcd(ua,ub)/5);
 a.white=b.white=.6;
 if(grownCount>=8) return;
 let x,z,ok=false;                                   // somewhere on the line between them, not on top of anything
 for(const f of [.5,.4,.6,.3,.7,.25,.75]){ x=a.x+(b.x-a.x)*f; z=a.z+(b.z-a.z)*f;
   if(!lmBlocked(x,z)&&!landmarks.some(l=>Math.hypot(l.x-x,l.z-z)<.9)){ok=true;break;} }
 if(!ok) return;
 const l=makeLandmark(x,z,h,true); grownCount++;
 emitRipple(x,z,1.2,l.col); setTimeout(()=>{blip(l.freq,1.4,.1,'sine');blip(l.freq*2,.5,.03,'triangle')},250);
}
const lmUp=new THREE.Vector3();
function updateLandmarks(dt,t){
 const th=fold*1.42; lmUp.set(-Math.sin(th),Math.cos(th),0);
 const sy=THREE.MathUtils.lerp(.04,1,shape());
 for(const l of landmarks){
   // spring back after a brush
   l.bvx+=(-l.bx*28-l.bvx*3.5)*dt; l.bvz+=(-l.bz*28-l.bvz*3.5)*dt; l.bx+=l.bvx*dt; l.bz+=l.bvz*dt;
   if(l.grow<1)l.grow=Math.min(1,l.grow+dt*1.3);
   const ge=l.grow<1?1-Math.pow(1-l.grow,2)*Math.cos(l.grow*9):1;
   l.ring=Math.max(0,l.ring-dt*2.2); l.white=Math.max(0,l.white-dt*1.6);
   if(l.x<=0)l.pivot.position.set(l.x,0,l.z); else l.pivot.position.copy(foldedPoint(_lp.set(l.x,0,l.z)));
   l.pivot.rotation.z=l.x<=0?0:th;
   const sink=l.sunk?1-ease((t-l.sinkT)/1.6):0; l.pivot.visible=sink<1;
   l.m.scale.y=Math.max(.001,sy*ge*(1-sink)); l.m.scale.x=l.m.scale.z=1+l.ring*.12*(1-dim)+(1-ge)*.4;
   l.m.rotation.x=l.bz*.55*dim; l.m.rotation.z=-l.bx*.55*dim;
   const lit=l.ring>0||l.white>0;
   if(lit||l.lit){l.m.material.emissiveIntensity=1+l.ring*2.6+l.white*3;l.m.material.emissive.copy(l.col).multiplyScalar(.55).lerp(WHITE,l.white);l.lit=lit;}
   const bf=(t-l.bandT)*2.6/Math.max(.4,l.h);
   if(bf>=0&&bf<1&&dim>.3){l.band.visible=true;l.band.position.y=bf*l.h*sy;l.band.material.opacity=(1-bf)*.9*dim;}
   else l.band.visible=false;
   if(l.thread){
     const b=l.pair, pa=l.pivot.position.clone().addScaledVector(l.x<=0?DIR_UP:lmUp,l.h*sy), pb=b.pivot.position.clone().addScaledVector(b.x<=0?DIR_UP:lmUp,b.h*sy);
     const arr=l.thread.geometry.attributes.position.array; arr[0]=pa.x;arr[1]=pa.y;arr[2]=pa.z;arr[3]=pb.x;arr[4]=pb.y;arr[5]=pb.z;
     l.thread.geometry.attributes.position.needsUpdate=true;
     const age=t-l.thread.userData.t0; l.thread.material.opacity=age<.5?1:.3+.15*Math.sin(t*4+l.x);
   }
 }
}
// walking through a reed brushes it. Walking into half of a glued pair puts you out of the other half.
function brushLandmarks(dt,t){
 const sp=velocity.length();
 for(const l of landmarks){
   if(l.sunk)continue;
   const dx=l.x-playerPos.x, dz=l.z-playerPos.z, d=Math.hypot(dx,dz), inside=d<.9;
   if(inside&&!l.inside){
     const dir=d>1e-3?new THREE.Vector3(dx/d,0,dz/d):new THREE.Vector3(1,0,0);
     ringLandmark(l,Math.min(1,sp/5),dir,t);
     if(l.pair&&sp>1.5&&t-tpCool>.8&&lmReachable(l.pair)&&velocity.dot(dir)>sp*.6){
       const o=l.pair, vd=velocity.clone().normalize();
       playerPos.set(o.x,0,o.z).addScaledVector(vd,.95); o.inside=true; tpCool=t; tpCount++;
       emitRipple(l.x,l.z,1.2,l.col); emitRipple(o.x,o.z,1.2,o.col); pulseFlash(); slide(l.freq,o.freq,.26,.12);
       o.ring=1; o.bvx+=vd.x*4; o.bvz+=vd.z*4;
     }
   }
   l.inside=inside;
 }
}
function tapLandmark(){
 const hit=raycaster.intersectObjects(landmarks.filter(l=>!l.sunk).map(l=>l.m))[0]; if(!hit) return false;
 const l=landmarks.find(q=>q.m===hit.object); if(!l) return false;
 const dir=new THREE.Vector3(l.x-playerPos.x,0,l.z-playerPos.z); if(dir.lengthSq()<1e-4)dir.set(1,0,0); dir.normalize();
 audio(); ringLandmark(l,1,dir,clock.elapsedTime); return true;
}

export function foldedPoint(src){
  const p=src.clone();
  if(p.x>0){const th=fold*1.42,x=p.x;p.x=Math.cos(th)*x;p.y+=Math.sin(th)*x;}
  if(crossed){const r=regionAt(src.x,src.z);if(r&&r.built&&r.mapPoint)return r.mapPoint(p,src);}
  return p;
}

// ---------- STAGE 2: the two-gap wall, in the 3D room ----------
export const S2={
  active:false,eyes:false,done:0,round:0,spawnT:0,startT:0,roundT:0,
  match:0,hold:0,hinted:false,arrived:false,eyeUsed:false,lastBlk:0,
  celebT:-99,morphT:-99,prevTarget:null,markerPos:new THREE.Vector3(5.2,0,0),nearPrev:false,toneT:0,
  dots:[],bins:[],gapPads:[],center:new THREE.Vector3(6.6,0,0)
};
const S2_EMIT=new THREE.Vector3(3.0,0,0), S2_BARX=6.6, S2_SCRX=10.8;
const S2_GAPZ=1.6, S2_GAPHW=.9, S2_BAND=1.7, S2_K=Math.PI/3.4, S2_WATCH_R=4.6;
const S2_SEAM2X=8.6, S2_NR=4, SQF=.45;   // the second edge; five patterns; squeeze when fully pulled
let roomFold=0, roomFoldTarget=0, dragging2=false, drag2StartY=0, drag2Start=0;
const sq=()=>1-(1-SQF)*roomFold;        // pulling the far end closer squeezes the picture
function roomFoldPoint(v){
  const th=roomFold*.62; if(v.x<=S2_SEAM2X)return v.clone();
  const x=v.x-S2_SEAM2X, y=v.y;
  return new THREE.Vector3(S2_SEAM2X+Math.cos(th)*x-Math.sin(th)*y,Math.sin(th)*x+Math.cos(th)*y,v.z);
}
const S2_HOLD=1.4, S2_THRESH=.58, S2_NB=40, S2_HALF=5;
const inRoom=()=>!!(curRegion&&curRegion.id==='room');
registerRegion({id:'room',name:'THE ROOM',bounds:{x0:1.4,x1:11.8,z0:-8,z1:8},key:262,
  buildWhen:()=>actDone(), build(){startStage2();},
  hud:()=>S2.active?{label:'PATTERNS',n:S2.done,total:S2_NR}:null,
  onEnter(){if(S2.active){eyeBtn.style.display='grid';if(!S2.eyeUsed)eyeLabel.style.display='block';}},
  onLeave(){eyeBtn.style.display='none';eyeLabel.style.display='none';if(S2.active){S2.marker.visible=false;setPrompt('');}},
  done:()=>S2.done>=S2_NR});
const s2Group=new THREE.Group(); s2Group.visible=false; world.add(s2Group);
const eyeBtn=document.getElementById('eye'), veil=document.getElementById('veil'), eyeLabel=document.getElementById('eyeLabel');
const gpdf=(z,mu,s)=>Math.exp(-(z-mu)*(z-mu)/(2*s*s));
const S2_ROUNDS=[
  {profile:z=>gpdf(z,S2_BAND,.5)+gpdf(z,-S2_BAND,.5),
   intro:'Make this shape on the screen.',
   hint:'Stand on the marker. Watch.'},
  {profile:z=>Math.pow(Math.cos(S2_K*z),2)*Math.exp(-z*z/20.5),
   intro:'Now this shape.',
   hint:'Stand on the far marker. Or close your eyes.'},
  {profile:z=>gpdf(z,-S2_BAND,.9),
   intro:'One more.',
   hint:'Stand in the opening.'},
  {profile:z=>Math.pow(Math.cos(S2_K*z/SQF),2)*Math.exp(-(z/SQF)*(z/SQF)/20.5),
   intro:'Last one.',thresh:.7,needFold:true,
   hint:()=>roomFold<.5?'Tap the glowing line behind the wall.':'Stand on the far marker. Or close your eyes.'}
];
function gauss(mu,sig){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();
  return mu+sig*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function sampleFringe(){
  for(let i=0;i<60;i++){
    const z=-S2_HALF+2*S2_HALF*Math.random();
    if(Math.random()<Math.pow(Math.cos(S2_K*z),2)*Math.exp(-z*z/20.5))return z;
  }
  return 0;
}
function s2Spot(){
  const kind=['watch','far','gap','far'][S2.round];
  if(kind==='watch')return new THREE.Vector3(5.2,0,0);
  if(kind==='far')return new THREE.Vector3(2.3,0,playerPos.z>=0?5.4:-5.4);
  return new THREE.Vector3(S2_BARX,0,playerPos.z>=0?S2_GAPZ:-S2_GAPZ);
}
function s2OnSpot(){
  if(S2.round===2)return s2BlockedGap()!==0;
  const sp=s2Spot();return Math.hypot(playerPos.x-sp.x,playerPos.z-sp.z)<1.5;
}
function s2NearSlits(){return Math.hypot(playerPos.x-S2_BARX,playerPos.z)<S2_WATCH_R;}
function s2BlockedGap(){
  if(Math.abs(playerPos.x-S2_BARX)>=1.0)return 0;
  if(Math.abs(playerPos.z-S2_GAPZ)<S2_GAPHW+.35)return 1;
  if(Math.abs(playerPos.z+S2_GAPZ)<S2_GAPHW+.35)return -1;
  return 0;
}

// the screen: a canvas texture. Landings splat and fade; the target is a
// ghost picture drawn underneath; a progress bar fills along the bottom.
const SCR_W=640, SCR_H=256;
const splatCv=document.createElement('canvas'); splatCv.width=SCR_W; splatCv.height=SCR_H;
const scrCv=document.createElement('canvas'); scrCv.width=SCR_W; scrCv.height=SCR_H;
const splatCtx=splatCv.getContext('2d'), scrCtx=scrCv.getContext('2d');
const scrTex=new THREE.CanvasTexture(scrCv); scrTex.colorSpace=THREE.SRGBColorSpace;
const SCR_BASE=SCR_H-10, SCR_TOP=SCR_H*.8;
function splat(z,strength=1){
  const bi=Math.floor((z+S2_HALF)/(2*S2_HALF)*S2_NB);
  let mx=0;for(const b of S2.bins)mx=Math.max(mx,b.n);
  const h=(bi>=0&&bi<S2_NB&&mx>0)?SCR_TOP*(S2.bins[bi].n/mx):0;
  const u=(z+S2_HALF)/(2*S2_HALF)*SCR_W, v=SCR_BASE-h;
  const r=14*strength;
  const g=splatCtx.createRadialGradient(u,v,0,u,v,r);
  g.addColorStop(0,'rgba(230,255,255,.95)');g.addColorStop(.4,'rgba(120,240,255,.5)');g.addColorStop(1,'rgba(60,200,255,0)');
  splatCtx.globalCompositeOperation='lighter';splatCtx.fillStyle=g;
  splatCtx.beginPath();splatCtx.arc(u,v,r,0,Math.PI*2);splatCtx.fill();
}
function drawScreen(dt,t){
  splatCtx.globalCompositeOperation='destination-out';
  splatCtx.fillStyle=`rgba(0,0,0,${1-Math.exp(-dt*.7)})`;
  splatCtx.fillRect(0,0,SCR_W,SCR_H);
  scrCtx.globalCompositeOperation='source-over';
  scrCtx.fillStyle='#04101a';scrCtx.fillRect(0,0,SCR_W,SCR_H);
  if(S2.target&&(S2.done<S2_NR||t-S2.celebT<1.4)){
    const prog=Math.min(1,S2.hold/S2_HOLD), bw=SCR_W/S2_NB;
    const mk=ease((t-S2.morphT)/1.1), tgt=S2.target.map((v,i)=>THREE.MathUtils.lerp(S2.prevTarget?S2.prevTarget[i]:v,v,mk));
    let mx=0;for(const b of S2.bins)mx=Math.max(mx,b.n);
    // your shape: filled bars piling up from the floor of the screen
    scrCtx.fillStyle=`rgba(70,220,255,${.4+.4*S2.match})`;
    for(let i=0;i<S2_NB;i++){
      const h=mx>0?SCR_TOP*(S2.bins[i].n/mx):0;
      if(h>0)scrCtx.fillRect(i*bw+2,SCR_BASE-h,bw-4,h);
    }
    // the shape it wants: one outline, turning white as your fill sits inside it
    scrCtx.lineWidth=6;
    scrCtx.strokeStyle=`rgba(${160+95*prog|0},255,255,${.6+.35*S2.match+.15*prog*Math.sin(t*9)})`;
    scrCtx.beginPath();scrCtx.moveTo(0,SCR_BASE);
    for(let i=0;i<S2_NB;i++){const h=SCR_TOP*tgt[i];scrCtx.lineTo(i*bw,SCR_BASE-h);scrCtx.lineTo((i+1)*bw,SCR_BASE-h);}
    scrCtx.lineTo(SCR_W,SCR_BASE);scrCtx.stroke();
    scrCtx.fillStyle='rgba(255,255,255,.9)';
    scrCtx.fillRect(0,SCR_H-7,SCR_W*prog,7);
    // the beat: the finished shape flashes white and a sweep runs across it
    const c=(t-S2.celebT)/1.4;
    if(c>=0&&c<1){
      scrCtx.strokeStyle='rgba(255,255,255,.95)';scrCtx.lineWidth=9;scrCtx.stroke();
      scrCtx.fillStyle=`rgba(255,255,255,${.7*(1-c)})`;scrCtx.fillRect(c*SCR_W-30,0,60,SCR_H);
    }
  }
  scrCtx.globalCompositeOperation='lighter';
  scrCtx.drawImage(splatCv,0,0);
  scrTex.needsUpdate=true;
}

function buildStage2(){
  // the wall with two openings, at eye level in the room
  const wallMat=new THREE.MeshBasicMaterial({color:0x1a9fbf,transparent:true,opacity:.5,depthWrite:false});
  const edgeMat=new THREE.MeshBasicMaterial({color:0xaefcff});
  const segs=[[-7,-S2_GAPZ-S2_GAPHW],[-S2_GAPZ+S2_GAPHW,S2_GAPZ-S2_GAPHW],[S2_GAPZ+S2_GAPHW,7]];
  for(const [z0,z1] of segs){
    const w=new THREE.Mesh(new THREE.BoxGeometry(.24,2.4,z1-z0),wallMat.clone());
    w.position.set(S2_BARX,1.2,(z0+z1)/2);s2Group.add(w);
    const e=new THREE.Mesh(new THREE.BoxGeometry(.28,.05,z1-z0),edgeMat);
    e.position.set(S2_BARX,2.42,(z0+z1)/2);s2Group.add(e);
  }
  const postMat=new THREE.MeshBasicMaterial({color:0xdfffff});
  for(const z of [-S2_GAPZ-S2_GAPHW,-S2_GAPZ+S2_GAPHW,S2_GAPZ-S2_GAPHW,S2_GAPZ+S2_GAPHW]){
    const p=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,2.6,8),postMat);
    p.position.set(S2_BARX,1.3,z);s2Group.add(p);
  }
  for(const g of [1,-1]){
    const pad=new THREE.Mesh(new THREE.BoxGeometry(1.9,.08,S2_GAPHW*2-.1),
      new THREE.MeshBasicMaterial({color:0x8ffcff,transparent:true,opacity:.45}));
    pad.position.set(S2_BARX,.04,g*S2_GAPZ);
    s2Group.add(pad);S2.gapPads.push({m:pad,g});
  }
  // the standing marker: a ring on the floor; the guide line leads here
  const mk=new THREE.Group();
  const mkRing=new THREE.Mesh(new THREE.RingGeometry(.62,.8,48),
    new THREE.MeshBasicMaterial({color:0xaefcff,transparent:true,opacity:.8,side:THREE.DoubleSide}));
  mkRing.rotation.x=-Math.PI/2;
  const mkDisc=new THREE.Mesh(new THREE.CircleGeometry(.6,40),
    new THREE.MeshBasicMaterial({color:0x52f5ff,transparent:true,opacity:.18,side:THREE.DoubleSide}));
  mkDisc.rotation.x=-Math.PI/2;
  mk.add(mkRing,mkDisc);mk.position.y=.06;s2Group.add(mk);S2.marker=mk;S2.mkRing=mkRing;S2.mkDisc=mkDisc;
  // emitter
  const em=new THREE.Mesh(new THREE.OctahedronGeometry(.34,0),
    new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x55ffff,emissiveIntensity:4,roughness:.1}));
  em.position.set(S2_EMIT.x,.8,S2_EMIT.z);s2Group.add(em);S2.emitter=em;
  const el=new THREE.PointLight(0x6cffff,20,9);el.position.copy(em.position);s2Group.add(el);
  // the screen at the back of the room, facing the player
  const far=new THREE.Group();far.position.set(S2_SEAM2X,0,0);s2Group.add(far);S2.far=far;
  const scr=new THREE.Mesh(new THREE.PlaneGeometry(2*S2_HALF+1,4.4),
    new THREE.MeshBasicMaterial({map:scrTex,transparent:false}));
  scr.rotation.y=-Math.PI/2;scr.position.set(S2_SCRX-S2_SEAM2X,2.3,0);far.add(scr);
  const frame=new THREE.Mesh(new THREE.BoxGeometry(.12,4.7,2*S2_HALF+1.3),new THREE.MeshBasicMaterial({color:0x8ffcff}));
  frame.position.set(S2_SCRX+.1-S2_SEAM2X,2.3,0);far.add(frame);
  const scrLight=new THREE.PointLight(0x6cffff,12,10);scrLight.position.set(S2_SCRX-1.5-S2_SEAM2X,2.5,0);far.add(scrLight);
  // the second edge: same look as the first; appears after the third pattern
  const s2seam=new THREE.Mesh(new THREE.BoxGeometry(.16,.06,14),new THREE.MeshBasicMaterial({color:0x60f7ff,transparent:true,opacity:.9}));
  s2seam.position.set(S2_SEAM2X,.05,0);s2Group.add(s2seam);S2.seam2=s2seam;
  const s2halo=new THREE.Mesh(new THREE.BoxGeometry(.9,.02,14),new THREE.MeshBasicMaterial({color:0x20d9ff,transparent:true,opacity:.14,blending:THREE.AdditiveBlending}));
  s2halo.position.set(S2_SEAM2X,.03,0);s2Group.add(s2halo);S2.seam2Halo=s2halo;
  const s2curtain=new THREE.Mesh(new THREE.PlaneGeometry(14,2.9),
    new THREE.MeshBasicMaterial({color:0x2ee9ff,transparent:true,opacity:.13,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false}));
  s2curtain.rotation.y=Math.PI/2;s2curtain.position.set(S2_SEAM2X,1.45,0);s2Group.add(s2curtain);S2.seam2Curtain=s2curtain;
  const s2rail=new THREE.Mesh(new THREE.BoxGeometry(.14,.1,14),new THREE.MeshBasicMaterial({color:0x8ffcff,transparent:true,opacity:.9}));
  s2rail.position.set(S2_SEAM2X,2.9,0);s2Group.add(s2rail);S2.seam2Rail=s2rail;
  const s2grab=new THREE.Mesh(new THREE.BoxGeometry(3.6,4.2,14),new THREE.MeshBasicMaterial({visible:false}));
  s2grab.position.set(S2_SEAM2X,1.6,0);s2Group.add(s2grab);S2.seam2Grab=s2grab;
  s2seam.visible=s2halo.visible=s2curtain.visible=s2rail.visible=false;
  // histogram bins (for matching; the visual is the screen)
  for(let i=0;i<S2_NB;i++)S2.bins.push({z:-S2_HALF+(i+.5)*(2*S2_HALF/S2_NB),n:0});
  // dot pool
  const dotGeo=new THREE.SphereGeometry(.11,8,8);
  for(let i=0;i<24;i++){
    const m=new THREE.Mesh(dotGeo,new THREE.MeshBasicMaterial({color:0xbffcff,transparent:true,opacity:.95}));
    m.visible=false;s2Group.add(m);
    S2.dots.push({m,on:false,mode:'',t:0,gapZ:0,landZ:0,waveAt:0});
  }
}
function s2Reset(){
  for(const b of S2.bins)b.n=0;
  splatCtx.globalCompositeOperation='source-over';splatCtx.clearRect(0,0,SCR_W,SCR_H);
  S2.match=0;S2.hold=0;
}
export function s2SetRound(r){
  S2.round=r;S2.roundT=clock.elapsedTime;S2.hold=0;S2.hinted=false;
  S2.prevTarget=S2.target||null;S2.morphT=clock.elapsedTime;
  if(r===3&&S2.seam2&&!S2.seam2.visible){
    S2.seam2.visible=S2.seam2Halo.visible=S2.seam2Curtain.visible=S2.seam2Rail.visible=true;
    for(let z=-6;z<=6;z+=3)emitRipple(S2_SEAM2X,z,1.2);
    blip(392,.5,.1,'sine');setTimeout(()=>blip(523,.6,.1,'sine'),160);
  }
  const R=S2_ROUNDS[r];
  let mx=0;const tp=S2.bins.map(b=>{const v=R.profile(b.z);mx=Math.max(mx,v);return v;});
  S2.target=tp.map(v=>v/mx);
  if(S2.arrived)setPrompt(R.intro);
}
export function startStage2(){
  if(S2.active)return;
  buildStage2();
  S2.active=true;S2.startT=clock.elapsedTime;s2Group.visible=true;
  const room=byId('room'); if(room)room.built=true;
  for(const l of landmarks)if(inBounds(room.bounds,l.x,l.z,.6)&&!l.sunk){l.sunk=true;l.sinkT=clock.elapsedTime;}   // the reeds it rises through sink
  if(inRoom()){eyeBtn.style.display='grid';eyeLabel.style.display='block';}
  s2SetRound(0);refreshHud();
  // it rises out of the floor where the player first stood on the paper
  S2.riseT=clock.elapsedTime; s2Group.scale.y=.001;
  for(let z=-6;z<=6;z+=2)setTimeout(()=>emitRipple(S2_BARX,z,1.3),Math.abs(z)*90);
  depthChord();
  if(!inRoom())setPrompt('');
}
function s2Hit(z){
  const bi=Math.floor((z+S2_HALF)/(2*S2_HALF)*S2_NB);
  if(bi>=0&&bi<S2_NB)S2.bins[bi].n=Math.min(S2.bins[bi].n+1,26);
  splat(z);
  blip(420+Math.abs(z)*60,.12,S2.eyes?.14:.06,'sine',z/S2_HALF);
}
function s2RoundDone(){
  S2.done++;refreshHud();saveGame();
  S2.celebT=clock.elapsedTime;S2.hold=0;S2.match=0;
  pulseFlash();chime();
  for(let i=0;i<S2_NB;i+=6)emitRipple(S2_SCRX-.5,S2.bins[i].z,.5);
  emitRipple(S2.markerPos.x,S2.markerPos.z,1.4);
  if(S2.done>=S2_NR){
    setTimeout(()=>setPrompt(''),1400);
  }else setTimeout(()=>{s2Reset();s2SetRound(S2.done);},1400);
}
function updateStage2(dt,t){
  if(!S2.active)return;
  if(S2.riseT!==undefined){const k=ease((t-S2.riseT)/2.4); s2Group.scale.y=Math.max(.001,k*(1+.18*Math.sin(k*Math.PI)*(1-k))); if(k>=1){s2Group.scale.y=1;S2.riseT=undefined;}}
  S2.emitter.rotation.y=t*1.1;S2.emitter.position.y=.8+.1*Math.sin(t*2.3);
  if(!S2.arrived&&S2.riseT===undefined&&Math.hypot(playerPos.x-S2_BARX,playerPos.z)<6){
    S2.arrived=true;S2.roundT=t;setPrompt(S2_ROUNDS[S2.round].intro);
    eyeBtn.style.display='grid';if(!S2.eyeUsed)eyeLabel.style.display='block';
  }
  S2.spawnT-=dt;
  if(inRoom()&&S2.spawnT<=0&&t-S2.celebT>=1.4){
    S2.spawnT=.06;
    const d=S2.dots.find(d=>!d.on);
    if(d){
      const blocked=s2BlockedGap(), watched=!S2.eyes&&s2NearSlits();
      if(blocked!==0){d.mode='particle';const open=-blocked;d.gapZ=open*S2_GAPZ;d.landZ=gauss(open*S2_BAND,.9)*sq();}
      else if(watched){d.mode='particle';const g=Math.random()<.5?1:-1;d.gapZ=g*S2_GAPZ;d.landZ=gauss(g*S2_BAND,.5)*sq();}
      else{d.mode='wave';d.gapZ=0;d.landZ=sampleFringe()*sq();}
      d.on=true;d.t=0;d.waveAt=0;d.m.visible=true;d.m.material.opacity=.95;
      d.m.position.set(S2_EMIT.x,.8,S2_EMIT.z+gauss(0,.15));
    }
  }
  for(const d of S2.dots){
    if(!d.on)continue;
    d.t+=dt;
    const A=.5,B=.55;
    if(d.t<A){
      const k=d.t/A;
      d.m.position.x=THREE.MathUtils.lerp(S2_EMIT.x,S2_BARX,k);
      d.m.position.z=THREE.MathUtils.lerp(S2_EMIT.z,d.gapZ,k);
      d.m.position.y=.8+Math.sin(k*Math.PI)*.3;
    }else if(d.mode==='wave'){
      if(!d.waveAt){d.waveAt=t;d.m.visible=false;emitRipple(S2_BARX,S2_GAPZ,.4);emitRipple(S2_BARX,-S2_GAPZ,.4);}
      if(t-d.waveAt>.5){s2Hit(d.landZ);d.on=false;}
    }else if(d.t<A+B){
      const k=(d.t-A)/B;
      const end=roomFoldPoint(new THREE.Vector3(S2_SCRX-.15,2.3,d.landZ));
      d.m.position.x=THREE.MathUtils.lerp(S2_BARX,end.x,k);
      d.m.position.z=THREE.MathUtils.lerp(d.gapZ,end.z,k);
      d.m.position.y=THREE.MathUtils.lerp(.8,end.y,k);
    }else{s2Hit(d.landZ);d.on=false;d.m.visible=false;}
  }
  let total=0;
  for(const b of S2.bins){b.n*=Math.exp(-dt*.4);total+=b.n;}
  if(S2.done<S2_NR&&inRoom()){
    const sp=s2Spot(), on=s2OnSpot();
    S2.markerPos.lerp(sp,1-Math.pow(.03,dt));
    S2.marker.visible=true;S2.marker.position.x=S2.markerPos.x;S2.marker.position.z=S2.markerPos.z;
    S2.marker.scale.setScalar(on?1.15:1+.08*Math.sin(t*4));
    S2.mkRing.material.opacity=on?1:.55+.3*(.5+.5*Math.sin(t*4));
    S2.mkDisc.material.opacity=on?.5:.14;
    S2.mkRing.material.color.setHex(on?0xffffff:0xaefcff);
  }else S2.marker.visible=false;
  const nearNow=s2NearSlits();
  if(nearNow!==S2.nearPrev){S2.nearPrev=nearNow;if(S2.arrived&&S2.done<S2_NR)blip(nearNow?523:330,.3,.07,'sine');}
  const blk=s2BlockedGap();
  for(const gp of S2.gapPads){
    const inIt=blk===gp.g;
    const guide=S2.round===2&&S2.done<S2_NR?.35*(.5+.5*Math.sin(t*4.5)):.06*(.5+.5*Math.sin(t*2));
    gp.m.material.opacity=inIt?.95:.35+guide;
    gp.m.material.color.setHex(inIt?0xffffff:0x8ffcff);
  }
  if(blk!==S2.lastBlk){
    S2.lastBlk=blk;
    if(blk!==0){blip(660,.18,.1,'sine');emitRipple(S2_BARX,blk*S2_GAPZ,.9);
      if(S2.round===2&&S2.done<S2_NR)setPrompt('Blocked.');}
  }
  drawScreen(dt,t);
  if(S2.done>=S2_NR||t-S2.celebT<1.4||!inRoom())return;
  let m=0;
  if(total>14){
    let tsum=0;for(const v of S2.target)tsum+=v;
    let l1=0;S2.bins.forEach((b,i)=>{l1+=Math.abs(b.n/total-S2.target[i]/tsum);});
    m=Math.max(0,1-l1*.5);
  }
  S2.match+=(m-S2.match)*(1-Math.pow(.05,dt));
  const RR=S2_ROUNDS[S2.round], okNow=S2.match>(RR.thresh||S2_THRESH)&&(!RR.needFold||roomFold>.5);
  S2.hold=okNow?S2.hold+dt:Math.max(0,S2.hold-dt*1.5);
  if(S2.hold>0&&okNow){S2.toneT-=dt;if(S2.toneT<=0){S2.toneT=.26;blip(440+560*Math.min(1,S2.hold/S2_HOLD),.1,.05,'triangle');}}
  if(S2.hold>=S2_HOLD)s2RoundDone();
  if(S2.arrived&&!S2.hinted&&t-S2.roundT>8&&S2.hold/S2_HOLD<.3){S2.hinted=true;const h=S2_ROUNDS[S2.round].hint;setPrompt(typeof h==='function'?h():h);}
}
function setEyes(c){
  S2.eyes=c;veil.style.opacity=c?.87:0;eyeBtn.classList.toggle('held',c);
  if(c&&S2.active&&!S2.eyeUsed){S2.eyeUsed=true;eyeLabel.style.opacity=0;}
}
eyeBtn.addEventListener('pointerdown',e=>{e.preventDefault();setEyes(true);audio();});
eyeBtn.addEventListener('pointerup',()=>setEyes(false));
eyeBtn.addEventListener('pointercancel',()=>setEyes(false));
eyeBtn.addEventListener('contextmenu',e=>e.preventDefault());

// ---------- lights: collect ----------
function collectSeed(i){
 if(seedData[i].taken)return;
 seedData[i].taken=true; seeds++; refreshHud();
 seedMeshes[i].visible=false; pulseFlash(); chime();
 emitRipple(seedData[i].p.x,seedData[i].p.z,1.7);
 awakened=Math.min(1,awakened+.25); planeMat.uniforms.uAwake.value=awakened;
 if(seeds===1){
   moveStatus.style.opacity=0; foldTarget=.15;
   setPrompt('Grab the glowing edge. Pull.');
 }
 if(seeds>=2)saveGame();
}

// ---------- the crossing: birth of depth ----------
function birthOfDepth(t){
  crossed=true; dimT=t;
  playerPos.x=2.2; playerPos.z*=-.72; velocity.multiplyScalar(.3);
  pulseFlash(); depthChord();
  emitRipple(playerPos.x,playerPos.z,1.6);
  awakened=Math.min(1,awakened+.3); planeMat.uniforms.uAwake.value=awakened;
  setPrompt('');
  walked=0; digestedAt=-1;
  setTimeout(()=>{foldTarget=0;},1500);          // the sheet settles flat beneath you
  dimLabel.textContent='3D'; dimLabel.style.letterSpacing='.6em';
  setTimeout(()=>dimLabel.style.letterSpacing='.3em',1200);
  saveGame();
}

// ---------- movement (screen-relative: the camera decides what "up" means) ----------
const _pdir=new THREE.Vector3(), _ga=new THREE.Vector3(), _gb=new THREE.Vector3();
let steps=0, flatPulse=0, mirrorT=0, lampResidue=false;
function guideTo(a,b){
  const arr=guideLine.geometry.attributes.position.array; arr[0]=a.x;arr[1]=a.y;arr[2]=a.z;arr[3]=b.x;arr[4]=b.y;arr[5]=b.z;
  guideLine.geometry.attributes.position.needsUpdate=true;
  const ld=guideLine.geometry.attributes.lineDistance; if(ld){ld.array[0]=0;ld.array[1]=a.distanceTo(b);ld.needsUpdate=true;}
  guideLine.visible=true;
}
function updatePlayer(dt,t){
 let dx=(keys['KeyD']||keys['ArrowRight']?1:0)-(keys['KeyA']||keys['ArrowLeft']?1:0)+held.x;
 let dz=(keys['KeyS']||keys['ArrowDown']?1:0)-(keys['KeyW']||keys['ArrowUp']?1:0)+held.z;
 dx=THREE.MathUtils.clamp(dx,-1,1); dz=THREE.MathUtils.clamp(dz,-1,1);
 const dir=_pdir.set(0,0,0).addScaledVector(rgt,dx).addScaledVector(fwd,-dz);
 if(dir.lengthSq()>0)dir.normalize();
 const speed=(portraitMode()?6.2:4.8)*(1+awakened*.12);
 velocity.lerp(dir.multiplyScalar(speed),1-Math.pow(.001,dt));
 const prevX=playerPos.x;
 playerPos.addScaledVector(velocity,dt);
 const prevZ=playerPos.z-velocity.z*dt;
 if(!crossed){playerPos.x=THREE.MathUtils.clamp(playerPos.x,PAGE.x0,11);playerPos.z=THREE.MathUtils.clamp(playerPos.z,PAGE.z0,PAGE.z1);}
 else{playerPos.x=THREE.MathUtils.clamp(playerPos.x,WORLD.x0+.5,WORLD.x1-.5);playerPos.z=THREE.MathUtils.clamp(playerPos.z,WORLD.z0+.5,WORLD.z1-.5);}

 if(!crossed){
   const crossedLine=Math.sign(prevX)!==Math.sign(playerPos.x)&&Math.abs(prevX)>1e-4;
   if(crossedLine||Math.abs(playerPos.x)<.34){
     if(fold>FOLD_OPEN&&velocity.x>.2){ birthOfDepth(t); }
     else{
       playerPos.x=Math.min(playerPos.x,-.45);
       if(Math.abs(velocity.x)>1)velocity.x*=-.25;
       if(seeds>=1&&fold<FOLD_OPEN)setPrompt('Grab the glowing edge. Pull.');
     }
   }
 }else{
   // in 3D the edge behind you is a wall of light; you do not go back
   if(playerPos.x<1.4){playerPos.x=1.4;velocity.x=Math.abs(velocity.x)*.3;}
 }
 // stage 2 wall: solid except at the two openings
 if(S2.active&&Math.abs(playerPos.z)<7&&(prevX-S2_BARX)*(playerPos.x-S2_BARX)<0){
   const inGap=Math.abs(playerPos.z-S2_GAPZ)<S2_GAPHW||Math.abs(playerPos.z+S2_GAPZ)<S2_GAPHW;
   if(!inGap){playerPos.x=prevX<S2_BARX?S2_BARX-.4:S2_BARX+.4;velocity.x*=-.25;}
 }
 // the far end of the room (edge, screen) is solid; you walk around it
 if(S2.active&&Math.abs(playerPos.z)<7&&prevX<=S2_SEAM2X-.3&&playerPos.x>S2_SEAM2X-.3){playerPos.x=S2_SEAM2X-.3;velocity.x*=-.25;}
 if(S2.active&&Math.abs(playerPos.z)<7&&prevX>=S2_SCRX+.6&&playerPos.x<S2_SCRX+.6){playerPos.x=S2_SCRX+.6;velocity.x*=-.25;}
 for(const r of regions)if(r.built&&r.constrain)r.constrain(prevX,prevZ,playerPos,velocity,dt);
 const here=regionAt(playerPos.x,playerPos.z);
 if(here!==curRegion){
   if(curRegion&&curRegion.onLeave)curRegion.onLeave();
   curRegion=here; if(!here&&crossed)saveGame();
   if(here){const first=!here.visited;here.visited=true;if(t-dimT>2.5)arrive(here,first);if(here.onEnter)here.onEnter(first);saveGame();}
   else if(crossed){dimLabel.textContent='3D';}
   refreshHud();
 }
 brushLandmarks(dt,t);
 moveAccum+=velocity.length()*dt;
 if(moveAccum>1.1){emitRipple(playerPos.x,playerPos.z,.9);moveAccum=0;steps++;
   if(residue('thin')&&!(curRegion&&curRegion.id==='thin')&&steps%5===0)flatPulse=1;}   // after Thin: a flicker of flatness in the stride
 if(crossed){walked+=velocity.length()*dt; if(digestedAt<0&&(t-dimT>60||walked>40)){digestedAt=t;setPrompt(nextRegion()?'Follow the lights.':'');}}
 flatPulse=Math.max(0,flatPulse-dt*3.2);

 const rp=foldedPoint(playerPos);player.position.copy(rp);
 const sh=shape()*(1-flatPulse*.7), squash=Math.max(0,flat-1);   // flat>1 is the overshoot of a squash; flatPulse is Thin's residue
 pDisc.scale.setScalar(Math.max(.001,(1-sh)*(1+squash*.6))); pRing.scale.setScalar(Math.max(.001,(1-sh)*(1+squash*.6)));
 p3.scale.setScalar(Math.max(.001,sh)); p3.position.y=.26*sh;
 pShadow.material.opacity=.3*sh;
 // after the Corner: now and then a second, mirrored shadow; after the Lamp: the shadow is no longer quite black
 if(residue('corner')){mirrorT-=dt; if(mirrorT<-.18)mirrorT=3+Math.random()*4; pShadow2.visible=mirrorT<0; pShadow2.position.set(-.9,.02,.6);}
 else pShadow2.visible=false;
 if(!lampResidue&&residue('lamp')){lampResidue=true;pShadow.material.color.setHex(0x16222e);addAwake(.2);}
 player.scale.setScalar(THREE.MathUtils.lerp(portraitMode()?1.5:1,1,sh));
 p3.rotation.y+=dt*(.7+awakened*1.8);
 pHalo.scale.setScalar(1+.08*Math.sin(performance.now()*.004));
}

function updateSeeds(t){
 const ct=currentTarget();
 if(ct>=0&&!crossed){
   const a=foldedPoint(playerPos); a.y+=.18;
   const b=foldedPoint(seedData[ct].p); b.y+=.18;
   guideTo(a,b);
 }else if(S2.active&&S2.done<S2_NR&&inRoom()&&!s2OnSpot()){
   const sp=s2Spot();
   const a=foldedPoint(playerPos); a.y+=.18;
   guideTo(a,_gb.set(sp.x,.18,sp.z));
 }else guideLine.visible=false;
 seedMeshes.forEach((g,i)=>{
   if(seedData[i].taken)return;
   const rp=foldedPoint(seedData[i].p);g.position.copy(rp);
   animateLight(g,t,crossed?true:i===ct); g.position.y+=rp.y;
   if(foldedPoint(playerPos).distanceTo(g.position)<.85)collectSeed(i);
 });
 const next=crossed?nextRegion():null;
 for(const L of regionLights){
   const r=L.userData.region;
   L.visible=crossed&&!(r.done&&r.done());
   if(L.visible)animateLight(L,t,r===next);
 }
}

// ---------- d-pad ----------
function bindPad(id,ax,val){
  const b=document.getElementById(id);
  const press=e=>{
    e.preventDefault();
    if(b.setPointerCapture&&e.pointerId!==undefined)try{b.setPointerCapture(e.pointerId)}catch(_){}
    held[ax]=val; b.classList.add('held');
    b.classList.remove('pulse');void b.offsetWidth;b.classList.add('pulse');
    dpadEl.style.transform=`perspective(320px) rotateX(${ax==='z'?-val*7:0}deg) rotateY(${ax==='x'?val*7:0}deg)`;
    if(ax==='x')velocity.addScaledVector(rgt,val*10); else velocity.addScaledVector(fwd,-val*10);
    emitRipple(playerPos.x,playerPos.z,1.15);
    moveCount++;
    if(moveCount<=6){moveStatus.textContent='MOVEMENT '+moveCount+' ✓';
      moveStatus.classList.remove('tick');void moveStatus.offsetWidth;moveStatus.classList.add('tick');}
    else moveStatus.style.opacity=0;
    blip(340+moveCount*22,.06,.07); audio();
  };
  const release=()=>{held[ax]=0;b.classList.remove('held');if(!held.x&&!held.z)dpadEl.style.transform='';};
  b.addEventListener('pointerdown',press);
  b.addEventListener('pointerup',release);
  b.addEventListener('pointercancel',release);
  b.addEventListener('lostpointercapture',release);
  b.addEventListener('contextmenu',e=>e.preventDefault());
}
bindPad('up','z',-1);bindPad('down','z',1);bindPad('left','x',-1);bindPad('right','x',1);
addEventListener('keydown',e=>{keys[e.code]=true;audio();
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();});
addEventListener('keyup',e=>keys[e.code]=false);

// ---------- fold drag: grab the edge ----------
const raycaster=new THREE.Raycaster(), ndc=new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown',e=>{
  ndc.set((e.clientX/innerWidth)*2-1,-(e.clientY/innerHeight)*2+1);
  raycaster.setFromCamera(ndc,camera);
  if(crossed){
    if(S2.active&&S2.seam2&&S2.seam2.visible&&raycaster.intersectObject(S2.seam2Grab).length>0){
      dragging2=true;drag2StartY=e.clientY;drag2Start=roomFoldTarget;
      renderer.domElement.setPointerCapture(e.pointerId);audio();return;
    }
  }else if(seeds>=1&&raycaster.intersectObject(seamGrab).length>0){
    dragging=true;dragStartX=e.clientX;dragStartFold=foldTarget;
    renderer.domElement.setPointerCapture(e.pointerId);audio();return;
  }
  tapLandmark();   // a reed at range: ring it
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(dragging2){roomFoldTarget=THREE.MathUtils.clamp(drag2Start+(e.clientY-drag2StartY)/(innerHeight*.28),0,1);return;}
  if(!dragging)return;
  const delta=(dragStartX-e.clientX)/Math.max(innerWidth*.38,260);
  foldTarget=THREE.MathUtils.clamp(dragStartFold+delta,0,1);
  if(foldTarget>.35&&fold<FOLD_OPEN)setPrompt('Keep pulling.');
  if(foldTarget>FOLD_OPEN)setPrompt('Walk into the edge.');
});
const endDrag=e=>{
  if(dragging2){dragging2=false;
    const moved=Math.abs(e.clientY-drag2StartY)>14;
    const latch=moved?(roomFoldTarget>.5?1:0):(drag2Start>.5?0:1);   // tap = toggle
    if(latch!==(drag2Start>.5?1:0)){blip(latch?660:330,.35,.1,'sine');for(let z=-6;z<=6;z+=3)emitRipple(S2_SEAM2X,z,.8);}
    roomFoldTarget=latch;try{renderer.domElement.releasePointerCapture(e.pointerId)}catch(_){}}
  if(dragging){dragging=false;try{renderer.domElement.releasePointerCapture(e.pointerId)}catch(_){}}};
renderer.domElement.addEventListener('pointerup',endDrag);
renderer.domElement.addEventListener('pointercancel',endDrag);

// ---------- the camera: straight down in 2D, behind you in 3D ----------
const camUp=new THREE.Vector3(), camDir=new THREE.Vector3(), camTarget=new THREE.Vector3(), _dir3=new THREE.Vector3();
const DIR_UP=new THREE.Vector3(0,1,0);
function updateCamera(t){
  const e=dim, sh=shape(), por=portraitMode();
  // screen-relative axes rotate 90 degrees across the shift: up = -z in 2D, +x in 3D
  const yaw=e*Math.PI/2;
  fwd.set(Math.sin(yaw),0,-Math.cos(yaw)); rgt.set(Math.cos(yaw),0,Math.sin(yaw));
  const fov=THREE.MathUtils.lerp(4,por?70:60,sh);
  const H=THREE.MathUtils.lerp(por?20:17,por?13:11,sh);
  const dist=H/(2*Math.tan(THREE.MathUtils.degToRad(fov)/2));
  // what to look at
  const pr=foldedPoint(playerPos);
  if(!crossed&&seeds===0){camTarget.copy(playerPos).lerp(seedData[0].p,.5);camTarget.y=0;}
  else{camTarget.copy(pr);camTarget.y=0;}
  const room=inRoom();
  if(sh>0){camTarget.addScaledVector(fwd,(room?4.2:1.6)*sh);camTarget.y+=(room?1.1:.3)*sh;}
  const wob=awakened*.22*e;
  camTarget.x+=Math.sin(t*.27)*wob;camTarget.z+=Math.cos(t*.21)*wob;
  // where to stand: straight above (2D) sliding down to behind-and-above (3D)
  const dir3=_dir3.set(0,0,0).addScaledVector(fwd,-1).addScaledVector(DIR_UP,room?(por?.62:.5):(por?.78:.6)).normalize();
  camDir.copy(DIR_UP).lerp(dir3,sh).normalize();
  camera.position.copy(camTarget).addScaledVector(camDir,dist);
  camUp.copy(fwd).lerp(DIR_UP,sh).normalize();
  camera.up.copy(camUp);
  camera.fov=fov;camera.updateProjectionMatrix();
  camera.lookAt(camTarget);
  scene.fog.density=.03*sh;
}

// ---------- main loop ----------
function animate(){
 requestAnimationFrame(animate);
 const dt=Math.min(clock.getDelta(),.1),t=clock.elapsedTime;
 dim=crossed?ease((t-dimT)/2.0):0;
 fold+=(foldTarget-fold)*(1-Math.pow(.0001,dt));
 roomFold+=(roomFoldTarget-roomFold)*(1-Math.pow(.0005,dt));
 planeMat.uniforms.uTime.value=t;planeMat.uniforms.uFold.value=fold;planeMat.uniforms.uFold2.value=roomFold;planeMat.uniforms.uDim.value=dim;
 if(S2.far)S2.far.rotation.z=roomFold*.62;
 if(S2.seam2&&S2.seam2.visible){
   const on=roomFoldTarget>.5;
   S2.seam2.material.color.setHex(on?0xffffff:0x60f7ff);
   S2.seam2.material.opacity=on?.95:.62+.3*Math.sin(t*3.1);
   S2.seam2Halo.material.opacity=on?.28:.09+.06*Math.sin(t*2.2);
   S2.seam2Rail.material.color.setHex(on?0xffffff:0x8ffcff);
   S2.seam2Rail.material.opacity=on?1:.55+.4*(.5+.5*Math.sin(t*3.1));
   S2.seam2Curtain.material.opacity=on?.2:.09+.07*(.5+.5*Math.sin(t*3.1));
   if(on!==S2.pulledPrev){S2.pulledPrev=on;
     if(on&&S2.active&&S2.done<S2_NR&&S2.round===3)setPrompt('Now stand on the far marker.');}
 }
 seamMat.opacity=.62+.3*Math.sin(t*3.1);
 seamHalo.material.opacity=.09+.06*Math.sin(t*2.2);
 seamWall.material.opacity=.16*dim;
 if(foldGain)foldGain.gain.value=(fold+roomFold)*.06;
 if(foldOsc)foldOsc.frequency.value=52+fold*40;
 updateCamera(t);
 updatePlayer(dt,t);updateSeeds(t);updateLandmarks(dt,t);updateStage2(dt,t);
 for(const r of regions){
   if(!r.built&&(crossed||r.page)&&(!r.buildWhen||r.buildWhen()))buildRegion(r);
   if(r.built&&r.update){try{r.update(dt,t);}catch(e){if(!r._err){r._err=true;console.error('region '+r.id+' update failed',e);}}}
 }
 if(crossed&&t-lastAutoSave>10){lastAutoSave=t;saveGame();}
 renderer.toneMappingExposure=1.15+awakened*.3;
 scene.userData.stars.material.opacity=.42+.3*awakened;
 scene.userData.stars.rotation.y=t*.005*(1+awakened*3);
 scene.userData.stars.rotation.x=Math.sin(t*.05)*.3*awakened;
 world.scale.setScalar(1+.02*Math.sin(t*.7)*awakened);
 // beacon arrow toward the current light (or the apparatus)
 const ct=currentTarget();
 let arrowTo=null;
 if(!crossed&&ct>=0)arrowTo=foldedPoint(seedData[ct].p);
 else if(S2.active&&S2.riseT===undefined&&!S2.arrived)arrowTo=S2.center.clone();
 else if(S2.active&&S2.done<S2_NR&&S2.round===3&&roomFold<.5&&curRegion&&curRegion.id==='room')arrowTo=new THREE.Vector3(S2_SEAM2X,1.6,playerPos.z*.4);
 else if(digested()&&!(S2.active&&inRoom()&&S2.done<S2_NR)){
   const next=nextRegion(); if(next&&next!==curRegion&&next.entrance)arrowTo=next.entrance.clone();
 }
 if(arrowTo){
   beaconArrow.style.opacity=1;
   const bp=arrowTo;bp.y+=1.0;bp.project(camera);
   const sx=(bp.x*.5+.5)*innerWidth, sy=(-bp.y*.5+.5)*innerHeight;
   const ang=Math.atan2(sy-innerHeight*.42,sx-innerWidth*.5)*180/Math.PI+90;
   beaconArrow.style.left=Math.max(42,Math.min(innerWidth-42,sx))+'px';
   beaconArrow.style.top=Math.max(105,Math.min(innerHeight-200,sy))+'px';
   beaconArrow.style.transform='translate(-50%,-50%) rotate('+ang+'deg)';
 }else beaconArrow.style.opacity=0;
 fitViewport();
 renderer.render(scene,camera);
}
function nextRegion(){        // the next rung of the act, in order; never the nearest
  for(const id of ACT1){const r=byId(id); if(r&&r.built&&!(r.done&&r.done()))return r;}
  return null;
}

// ---------- save / continue ----------
const SAVE_KEY='da.save.v1';
export function saveGame(){
  if(!crossed)return;                 // a fresh page must never overwrite a real save
  try{
    const d={crossed,seeds,awakened,roomFold:roomFoldTarget,pos:playerPos.toArray(),place:curRegion?curRegion.name:'THE FIELD',
      s2:{done:S2.done,round:S2.round,arrived:S2.arrived,active:S2.active},
      visited:regions.filter(r=>r.visited).map(r=>r.id),regions:{},t:Date.now()};
    for(const r of regions)if(r.save){try{d.regions[r.id]=r.save();}catch(e){}}
    localStorage.setItem(SAVE_KEY,JSON.stringify(d));
  }catch(e){}
}
export function loadSave(){try{return JSON.parse(localStorage.getItem(SAVE_KEY)||'null');}catch(e){return null;}}
export function clearSave(){try{localStorage.removeItem(SAVE_KEY);}catch(e){}}
export function applySave(d){
  if(!d||!d.crossed)return false;
  seeds=Math.min(3,d.seeds|0); if(d.s2&&d.s2.active)seeds=3;
  for(let i=0;i<seeds;i++){seedData[i].taken=true;seedMeshes[i].visible=false;}
  awakened=typeof d.awakened==='number'?d.awakened:Math.min(1,seeds*.25+.3);planeMat.uniforms.uAwake.value=awakened;
  crossed=true;dimT=-99;foldTarget=0;fold=0;dimLabel.textContent='3D';moveStatus.style.opacity=0;
  playerPos.set(2.2,0,-.5);
  for(const r of regions){if(r.id!=='room')buildRegion(r);if(d.visited&&d.visited.includes(r.id))r.visited=true;}
  for(const r of regions)if(r.id!=='room'&&r.load&&d.regions&&d.regions[r.id]){try{r.load(d.regions[r.id]);}catch(e){console.error(e);}}
  if(actDone()||(d.s2&&d.s2.active)){startStage2();S2.riseT=undefined;s2Group.scale.y=1;S2.arrived=!!d.s2.arrived;S2.done=Math.min(S2_NR,d.s2.done|0);
    if(S2.done<S2_NR)s2SetRound(Math.min(S2_NR-1,Math.max(S2.done,d.s2.round|0)));else{S2.marker&&(S2.marker.visible=false);}}
  digestedAt=0; walked=0;
  if(d.pos&&d.pos[0]>1.4)playerPos.set(d.pos[0],0,d.pos[2]);
  if(S2.active&&S2.seam2&&S2.seam2.visible&&d.roomFold>.5){roomFoldTarget=1;roomFold=1;}
  velocity.set(0,0,0);refreshHud();setPrompt('');
  return true;
}
const resumeEl=document.getElementById('resume');
function offerResume(){
  const d=loadSave(); if(!d||!d.crossed){resumeEl.style.display='none';return;}
  resumeEl.style.display='flex'; resumeEl.querySelector('.rt').textContent=d.place||'THE FIELD';
  const go=(cont)=>{resumeEl.classList.add('gone');setTimeout(()=>resumeEl.style.display='none',500);
    audio(); if(cont){applySave(d);pulseFlash();depthChord();}else{clearSave();} };
  document.getElementById('resumeYes').onclick=()=>go(true);
  document.getElementById('resumeNo').onclick=()=>go(false);
}

// arriving somewhere: the place says its name the way the title did, the
// ground answers, and a chord in the region's own key (first time only)
function arrive(r,first){
  if(!crossed)return;
  dimLabel.textContent='3D \u00b7 '+r.name; dimLabel.style.letterSpacing='.6em';
  setTimeout(()=>dimLabel.style.letterSpacing='.3em',900);
  if(!first)return;
  const e=(r.entrance||playerPos).clone(); for(let k=0;k<3;k++)setTimeout(()=>emitRipple(e.x,e.z,1.1),k*160);
  const base=r.key||220; [1,1.5,2].forEach((m,i)=>setTimeout(()=>blip(base*m,.9,.06,'sine'),i*110));
}

// ---------- hold buttons for regions (the eye is the model) ----------
let holdSlots=0;
export function makeHoldButton({id,label,svg,onDown,onUp}){
  const ui=document.getElementById('ui');
  const b=document.createElement('button'); b.type='button'; b.id=id; b.className='hbtn'; b.setAttribute('aria-label',label);
  b.innerHTML=svg||'<span style="font:700 18px system-ui">'+label[0]+'</span>';
  const slot=++holdSlots, bottom=`calc(max(14px,env(safe-area-inset-bottom)) + ${64+slot*76}px)`;
  b.style.bottom=bottom; b.style.display='none';
  const lab=document.createElement('div'); lab.className='hlabel'; lab.textContent='hold · '+label.toLowerCase();
  lab.style.bottom=`calc(max(14px,env(safe-area-inset-bottom)) + ${44+slot*76}px)`; lab.style.display='none';
  ui.appendChild(b); ui.appendChild(lab);
  let held=false;
  const down=e=>{e.preventDefault();if(held)return;held=true;b.classList.add('held');audio();lab.style.opacity=0;onDown&&onDown();};
  const up=()=>{if(!held)return;held=false;b.classList.remove('held');onUp&&onUp();};
  b.addEventListener('pointerdown',down);b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('lostpointercapture',up);
  b.addEventListener('contextmenu',e=>e.preventDefault());
  return {el:b,label:lab,show(v=true){b.style.display=v?'grid':'none';lab.style.display=v?'block':'none';},get held(){return held;},release:up};
}

// ---------- start ----------
let started=false, lastAutoSave=0;
export function start(){
  if(started)return; started=true;
  spreadReeds();
  for(const r of regions){
    if(r.entrance&&!r.page){const L=makeLight(r.entrance,r.color||0x62ffff);L.userData.region=r;L.visible=false;regionLights.push(L);}
  }
  refreshHud(); offerResume();
  animate();
}
let lastW=innerWidth, lastH=innerHeight;
function fitViewport(){
  const w=Math.max(1,innerWidth), h=Math.max(1,innerHeight); if(w===lastW&&h===lastH)return;
  lastW=w; lastH=h; camera.aspect=w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h);
}
addEventListener('resize',fitViewport);
addEventListener('orientationchange',()=>setTimeout(fitViewport,120));
if(window.visualViewport)visualViewport.addEventListener('resize',fitViewport);

// read-only state hook for automated smoke tests
window.__DA={get pos(){return playerPos.toArray()},get fold(){return fold},get seeds(){return seeds},get moves(){return moveCount},
  get dim(){return dim},get crossed(){return crossed},get roomFold(){return roomFold},
  get lm(){return landmarks.map(l=>({x:+l.x.toFixed(2),z:+l.z.toFixed(2),h:l.h,note:l.note,ring:+l.ring.toFixed(2),bend:+Math.hypot(l.bx,l.bz).toFixed(2),pair:l.pair?landmarks.indexOf(l.pair):-1,grow:+l.grow.toFixed(2)}))},
  get rings(){return ringCount},get tps(){return tpCount},get grown(){return grownCount},
  tapLm(i){const l=landmarks[i];ringLandmark(l,1,new THREE.Vector3(l.x-playerPos.x,0,l.z-playerPos.z).normalize(),clock.elapsedTime);},
  project(x,y,z){const v=new THREE.Vector3(x,y,z).project(camera);return {x:(v.x*.5+.5)*innerWidth,y:(-v.y*.5+.5)*innerHeight};},
  get s2(){let tot=0;for(const b of S2.bins)tot+=b.n;return {active:S2.active,done:S2.done,round:S2.round,match:+S2.match.toFixed(2),hold:+S2.hold.toFixed(1),eyes:S2.eyes,blk:s2BlockedGap(),near:s2NearSlits(),total:+tot.toFixed(1),peak:S2.bins.length?S2.bins.reduce((a,b)=>b.n>a.n?b:a).z.toFixed(2):null}},
  s2start:startStage2,s2round:s2SetRound,
  get region(){return curRegion?curRegion.id:null},
  get regions(){return regions.map(r=>({id:r.id,built:r.built,visited:r.visited,done:!!(r.done&&r.done()),state:r.debug?r.debug():undefined}))},
  save:saveGame,loadSave,applySave,clearSave,
  get actDone(){return actDone()},get digested(){return digested()},get next(){const n=nextRegion();return n?n.id:null},
  get arrow(){return beaconArrow.style.opacity==='1'},get counterShown(){return countEl.style.opacity!=='0'},
  digest(){digestedAt=clock.elapsedTime;},unlockRoom(){startStage2();S2.riseT=undefined;s2Group.scale.y=1;},
  setPos(x,z){playerPos.set(x,0,z);velocity.set(0,0,0);},
  get _lm(){return landmarks},get _plane(){return sheetMesh},get flat(){return flat},
  jump3d(){if(!crossed){crossed=true;dimT=clock.elapsedTime-2.5;walked=0;digestedAt=-1;foldTarget=0;playerPos.set(2.2,0,-.5);dimLabel.textContent='3D';}}};
