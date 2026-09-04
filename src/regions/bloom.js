// BLOOM — one contained stretch of the field where reality will not hold still.
//
// This is not a puzzle. It is a place. Walk in and the ground melts and
// re-forms under your feet, forms bud and divide and pour into other forms,
// rings of them almost fall into symmetry and then let go, and everything
// near you leans in and breathes. Your own path is cut into the world as
// glowing trenches that stay — the field remembers where you walked, and
// only slowly closes the wounds.
//
// Everything here happens TO THE PLAYABLE WORLD, never as a screen overlay:
//   - the ground is a real displaced surface you stand on (mapPoint keeps the
//     avatar embedded in it), the melt/swell/crater are in its vertices;
//   - the blooms are real geometry morphing in their own vertex shader;
//   - the only fixed things are the cyan structural grid (so the floor stays
//     a floor) and the player + shadow (so the avatar stays the clearest
//     thing on screen). Legibility over spectacle — but here, only barely.
//
// No edits to src/game.js. It draws its own ground patch above the universe
// sheet and agrees with it in mapPoint, exactly as docs/WORLD.md describes.

import * as THREE from 'three';
import {registerRegion, world, scene, camera, renderer, playerPos, velocity, clock,
        addAwake, blip, emitRipple, actDone, curRegion} from '../game.js';

// ---- the arena: a clear rectangle east of Lamp / north of Corner ----
const B = {x0:26, x1:39.5, z0:9, z1:27.5};
const CX = (B.x0+B.x1)/2, CZ = (B.z0+B.z1)/2;         // centre: the blooms ring it
const ENTRANCE = new THREE.Vector3(28, 0, 12);

// ---- the surface, in closed form (must be identical in GLSL and in JS so
// the avatar rides exactly the ground it sees). No noise here: the noisy
// horizontal melt lives on the GPU only and never moves the walkable frame. ----
const SWELL = `
  float bloomSwell(vec2 p, float t){
    float s = 0.13*sin(p.x*0.6 + t*0.5)*cos(p.y*0.55 - t*0.42)
            + 0.09*sin((p.x+p.y)*0.4 - t*0.3);
    vec2 d = p - vec2(${CX.toFixed(3)}, ${CZ.toFixed(3)});
    float d2 = dot(d,d);
    // a gentle dome that itself heaves: depth and perspective bend a little
    float dome = -0.055*min(1.0, d2*0.02)*(0.6+0.4*sin(t*0.15));
    return s + dome;
  }`;
function swellJS(x,z,t){
  const s = 0.13*Math.sin(x*0.6+t*0.5)*Math.cos(z*0.55-t*0.42)
          + 0.09*Math.sin((x+z)*0.4 - t*0.3);
  const dx=x-CX, dz=z-CZ, d2=dx*dx+dz*dz;
  const dome = -0.055*Math.min(1, d2*0.02)*(0.6+0.4*Math.sin(t*0.15));
  return s + dome;
}
// edge mask: displacement (and the whole patch) fades to nothing at the
// arena border so the mutating zone bleeds into the ordinary field.
function edgeJS(x,z){
  const ex=Math.min(x-B.x0, B.x1-x), ez=Math.min(z-B.z0, B.z1-z);
  const e=Math.min(ex,ez); return e<=0?0:e>=2.5?1:(e/2.5)*(e/2.5)*(3-2*(e/2.5));
}

// ---- the field's memory: a heightfield the player carves and that heals
// slowly. Kept on the CPU (so mapPoint reads the exact same value the GPU
// draws) and uploaded to an 8-bit texture the ground shader samples. ----
const TW=100, TH=132;
const trail = new Float32Array(TW*TH);
const trailBytes = new Uint8Array(TW*TH*4);
let trailTex=null;
const CRATER=0.5;                          // how deep a full gouge sinks the ground
function trailAt(x,z){                      // bilinear sample of the CPU field
  let u=(x-B.x0)/(B.x1-B.x0), v=(z-B.z0)/(B.z1-B.z0);
  if(u<0||u>1||v<0||v>1)return 0;
  const fx=u*(TW-1), fy=v*(TH-1);
  const x0=Math.floor(fx), y0=Math.floor(fy), x1=Math.min(TW-1,x0+1), y1=Math.min(TH-1,y0+1);
  const tx=fx-x0, ty=fy-y0;
  const a=trail[y0*TW+x0], b=trail[y0*TW+x1], c=trail[y1*TW+x0], d=trail[y1*TW+x1];
  return (a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+d*tx)*ty;
}
function stamp(x,z,strength){
  const u=(x-B.x0)/(B.x1-B.x0), v=(z-B.z0)/(B.z1-B.z0);
  if(u<-0.05||u>1.05||v<-0.05||v>1.05)return;
  const cx=u*(TW-1), cy=v*(TH-1), R=6, s2=9.0;
  for(let j=-R;j<=R;j++)for(let i=-R;i<=R;i++){
    const px=Math.round(cx)+i, py=Math.round(cy)+j;
    if(px<0||px>=TW||py<0||py>=TH)continue;
    const g=Math.exp(-(i*i+j*j)/s2);
    const idx=py*TW+px;
    trail[idx]=Math.min(1, trail[idx]+strength*g);
  }
}

// =====================================================================
// the ground patch
// =====================================================================
let groundMat=null, ground=null;
function buildGround(){
  trailTex=new THREE.DataTexture(trailBytes,TW,TH,THREE.RGBAFormat,THREE.UnsignedByteType);
  trailTex.magFilter=THREE.LinearFilter; trailTex.minFilter=THREE.LinearFilter;
  trailTex.wrapS=trailTex.wrapT=THREE.ClampToEdgeWrapping; trailTex.needsUpdate=true;

  const geo=new THREE.PlaneGeometry(B.x1-B.x0, B.z1-B.z0, 150, 190);
  geo.rotateX(-Math.PI/2);
  geo.translate(CX, 0, CZ);

  groundMat=new THREE.ShaderMaterial({
    transparent:true, side:THREE.DoubleSide, depthWrite:false,
    uniforms:{
      uTime:{value:0}, uGate:{value:0}, uAwake:{value:0}, uCoh:{value:0},
      uTrail:{value:trailTex}, uBounds:{value:new THREE.Vector4(B.x0,B.z0,B.x1,B.z1)},
      uPlayer:{value:new THREE.Vector2(playerPos.x,playerPos.z)}
    },
    vertexShader:`
      uniform float uTime, uGate, uAwake;
      uniform sampler2D uTrail; uniform vec4 uBounds; uniform vec2 uPlayer;
      varying vec3 vP; varying vec2 vXZ; varying float vTrail; varying float vFlow; varying float vEdge; varying float vBreath;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
                   mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
      }
      float fbm(vec2 p){float a=0.5,s=0.0; for(int i=0;i<4;i++){s+=a*noise(p);p*=2.03;a*=0.5;} return s;}
      ${SWELL}
      void main(){
        vec2 xz=position.xz; vXZ=xz;
        vec2 uv=(xz-uBounds.xy)/(uBounds.zw-uBounds.xy);
        float tr=texture2D(uTrail, uv).r; vTrail=tr;
        // edge mask (before displacement) so the border stays put and blends
        vec2 ed=min(xz-uBounds.xy, uBounds.zw-xz);
        float em=smoothstep(0.0,2.5,min(ed.x,ed.y)); vEdge=em;
        float gate=uGate*em;
        // horizontal melt: a slow domain warp of the whole surface. The grid
        // lines pour and reconstitute; neighbours move together, so it flows,
        // it does not tear.
        float flow=fbm(xz*0.5 + vec2(uTime*0.05,-uTime*0.04)); vFlow=flow;
        vec2 w=vec2(fbm(xz*0.35 + flow*1.6 + uTime*0.06),
                    fbm(xz*0.35 - flow*1.6 - uTime*0.05*1.3))-0.5;
        vec3 p=position;
        p.x+=w.x*2.4*gate; p.z+=w.y*2.4*gate;
        // height: swell + a breath that leans in around the player + the crater
        float d=distance(xz,uPlayer);
        float breath=exp(-d*d*0.09)*sin(uTime*1.6); vBreath=breath;
        float s=bloomSwell(xz,uTime) + 0.14*breath;
        p.y=0.02 + gate*(s - tr*${CRATER.toFixed(3)});
        vP=p;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }`,
    fragmentShader:`
      precision highp float;
      uniform float uTime, uGate, uAwake, uCoh;
      varying vec3 vP; varying vec2 vXZ; varying float vTrail; varying float vFlow; varying float vEdge; varying float vBreath;
      float grid(float x,float s){float q=abs(fract(x/s-.5)-.5)/max(fwidth(x/s),1e-4);return 1.0-min(q,1.0);}
      vec3 pal(float t){return 0.5+0.5*cos(6.2831*(vec3(0.0,0.33,0.67)+t));}
      void main(){
        float g=max(grid(vP.x,1.0),grid(vP.z,1.0));
        float fine=max(grid(vP.x,0.25),grid(vP.z,0.25))*0.28;
        // the surface flows through colour with the same warp that melts it —
        // soft moving blobs of colour everywhere, brighter along the grid
        float hue=vFlow*0.55 + uTime*0.03 + length(vXZ-vec2(${CX.toFixed(2)},${CZ.toFixed(2)}))*0.03;
        vec3 flow=pal(hue);
        vec3 col=flow*(0.16 + 0.20*vFlow + 0.55*g + fine);
        // structural cyan grid on top: the floor stays a floor
        col+=vec3(0.15,0.85,1.05)*g*0.4;
        // almost-order: the coherence wave pulls the whole floor toward a
        // clean cyan lattice for a beat, then lets the colour bleed back
        col=mix(col, vec3(0.10,0.72,0.98)*(g*0.75+fine+0.18), uCoh*0.5);
        // the carved path: a burning trench that STAYS and burns through even
        // the coherence beat (added last). Magenta lip -> orange -> white-hot.
        float tr=vTrail;
        vec3 magma=mix(vec3(0.95,0.12,0.55), vec3(1.0,0.5,0.12), smoothstep(0.06,0.4,tr));  // magenta lip -> orange body
        magma=mix(magma, vec3(1.0,0.92,0.7), smoothstep(0.82,1.0,tr));                       // white only at the deepest core
        col+=magma*tr*(1.7+0.4*sin(uTime*3.0+vP.x*2.0));
        // the trench has walls: where the carved surface tips steeply, a hot rim
        float slope=clamp(fwidth(vP.y)*9.0,0.0,1.0);
        col+=vec3(1.0,0.62,0.22)*slope*smoothstep(0.05,0.4,tr)*1.4;
        col*=0.55+0.45*uGate;
        float a=clamp(0.30 + g*0.55 + fine + tr*1.1, 0.0, 0.98)*vEdge;
        gl_FragColor=vec4(col,a);
      }`
  });
  ground=new THREE.Mesh(geo, groundMat);
  ground.position.y=0.0; ground.frustumCulled=false;   // it fills the arena; never let it pop
  world.add(ground);
}

// =====================================================================
// the blooms: rings of forms that morph, bud, melt, breathe and
// almost-synchronise. One InstancedMesh, one draw call.
// =====================================================================
let blooms=null, bloomMat=null;
const RINGS=[{r:3.0,n:8},{r:5.0,n:12},{r:6.8,n:16}];
function buildBlooms(){
  const base=new THREE.IcosahedronGeometry(1,3);          // ~1280 verts, non-indexed
  const pos=base.attributes.position;
  const N=pos.count;
  // a second, clearly-different form for every vertex — a knobby coral —
  // so the morph is a transition into another shape, not a wobble.
  const tgt=new Float32Array(N*3);
  const v=new THREE.Vector3();
  for(let i=0;i<N;i++){
    v.fromBufferAttribute(pos,i);
    const n=v.clone().normalize();
    const phi=Math.atan2(n.z,n.x), theta=Math.acos(THREE.MathUtils.clamp(n.y,-1,1));
    const rt=0.5 + 0.9*Math.pow(Math.abs(Math.sin(3.0*phi)*Math.sin(2.0*theta+1.0)),0.6);
    tgt[i*3]=n.x*rt; tgt[i*3+1]=n.y*rt; tgt[i*3+2]=n.z*rt;
  }
  base.setAttribute('aTarget', new THREE.BufferAttribute(tgt,3));

  const count=RINGS.reduce((a,r)=>a+r.n,0)+1;
  const aSeed=new Float32Array(count), aScale=new Float32Array(count), aSpin=new Float32Array(count);
  const inst=new THREE.InstancedBufferGeometry();
  inst.index=base.index; inst.attributes.position=base.attributes.position;
  inst.attributes.normal=base.attributes.normal; inst.attributes.aTarget=base.attributes.aTarget;

  bloomMat=new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
    uniforms:{ uTime:{value:0}, uGate:{value:0}, uCoh:{value:0}, uAwake:{value:0},
      uPlayer:{value:new THREE.Vector2(playerPos.x,playerPos.z)} },
    vertexShader:`
      precision highp float;
      attribute vec3 aTarget; attribute float aSeed, aScale, aSpin;
      uniform float uTime, uGate, uCoh; uniform vec2 uPlayer;
      varying vec3 vN, vView; varying float vSeed, vMorph, vNear;
      mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c);}
      void main(){
        // where this bloom stands, in world coords (its own spin is about here)
        vec2 ic=vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        float nd=distance(ic,uPlayer);
        float near=exp(-nd*nd*0.05); vNear=near;
        // morph base<->coral. The coherence wave pulls every bloom's phase to
        // a common value: the ring falls into one shape (symmetry), then drifts.
        float indiv=0.5+0.5*sin(uTime*0.4 + aSeed*6.2831);
        float commun=0.5+0.5*sin(uTime*0.4);
        float m=mix(indiv, commun, uCoh); vMorph=m; vSeed=aSeed;
        vec3 pos=mix(position, aTarget, m);
        // budding / dividing: a radial lobe count that itself drifts
        float phi=atan(position.z, position.x);
        float lobes=3.0+2.0*sin(uTime*0.2+aSeed*3.0);
        pos*=1.0+0.20*sin(lobes*phi + uTime*0.8 + aSeed*4.0);
        // melt: a slow displacement along the normal
        vec3 nrm=normalize(position);
        pos+=nrm*0.13*sin(pos.x*3.0+pos.y*2.6+pos.z*3.4 + uTime*0.9 + aSeed);
        // breathe: own pulse, plus a hard inhale/exhale when the player is near
        float breath=1.0 + 0.10*sin(uTime*1.3+aSeed) + 0.45*near*sin(uTime*2.4);
        mat3 spin=rotY(uTime*aSpin + aSeed*6.2831);
        vec3 local=spin*(pos*aScale*breath*(0.35+0.65*uGate));
        vN=normalize(normalMatrix*mat3(instanceMatrix)*spin*nrm);
        vec4 mv=modelViewMatrix*instanceMatrix*vec4(local,1.0);
        vView=normalize(-mv.xyz);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`
      precision highp float;
      uniform float uTime, uGate; varying vec3 vN, vView; varying float vSeed, vMorph, vNear;
      vec3 pal(float t){return 0.5+0.5*cos(6.2831*(vec3(0.0,0.33,0.67)+t));}
      void main(){
        float fres=pow(1.0-max(dot(normalize(vN),normalize(vView)),0.0),1.9);
        // colour shifts as the form morphs — it becomes another form and reads
        // as another colour on the way
        vec3 rim=pal(uTime*0.05 + vSeed + vMorph*0.6);
        vec3 core=pal(uTime*0.03 + vSeed + 0.35)*0.35;
        vec3 col=core + rim*fres*1.5 + rim*vNear*0.25;
        float a=clamp(0.16 + fres*0.7 + vNear*0.15, 0.0, 0.8)*(0.4+0.6*uGate);
        gl_FragColor=vec4(col*(0.36+0.44*uGate), a);
      }`
  });

  blooms=new THREE.InstancedMesh(inst, bloomMat, count);
  blooms.frustumCulled=false;
  const mtx=new THREE.Matrix4(), q=new THREE.Quaternion(), scl=new THREE.Vector3(1,1,1), p=new THREE.Vector3();
  let idx=0;
  const put=(x,z,s,spin)=>{
    aSeed[idx]=Math.random(); aScale[idx]=s; aSpin[idx]=spin;
    p.set(x, 0.1+s*0.85, z);
    q.setFromAxisAngle(new THREE.Vector3(0,1,0), Math.random()*6.28);
    mtx.compose(p,q,scl); blooms.setMatrixAt(idx,mtx); idx++;
  };
  for(const ring of RINGS){
    for(let i=0;i<ring.n;i++){
      const a=(i/ring.n)*Math.PI*2 + ring.r*0.3;                 // evenly spaced: rings read as near-symmetric
      const jr=ring.r + (Math.random()-0.5)*0.5, ja=a+(Math.random()-0.5)*0.12;
      put(CX+Math.cos(ja)*jr, CZ+Math.sin(ja)*jr, 0.55+Math.random()*0.5, (Math.random()<0.5?1:-1)*(0.15+Math.random()*0.3));
    }
  }
  put(CX, CZ, 1.5, 0.12);                                         // a taller heart at the centre
  blooms.instanceMatrix.needsUpdate=true;
  inst.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed,1));
  inst.setAttribute('aScale', new THREE.InstancedBufferAttribute(aScale,1));
  inst.setAttribute('aSpin', new THREE.InstancedBufferAttribute(aSpin,1));
  world.add(blooms);
}

// =====================================================================
// region registration
// =====================================================================
let entered=false, gate=0, lastStep=0;
function coherence(t){ const s=Math.sin(t*(Math.PI*2/9)); return s<=0?0:Math.pow(s,4); }

registerRegion({
  id:'bloom', name:'BLOOM',
  bounds:B, entrance:ENTRANCE, color:0xc94fff,
  build(){ buildGround(); buildBlooms();
    // compile the two shaders now, while the meshes are still invisible, so the
    // first frame BLOOM is actually shown never stalls (a mid-play compile hitch
    // could otherwise disturb a timing-sensitive neighbour like the Lamp)
    try{ renderer.compile(scene, camera); }catch(e){} },
  update(dt,t){
    if(!groundMat)return;
    const px=playerPos.x, pz=playerPos.z;
    // the arena only exists to the eye when you are near it AND you are not
    // busy inside another place: BLOOM sits right against Lamp's east edge, so
    // it must never light up (or spend a frame rendering) while the player is
    // attributed to Lamp/Corner/the room — that would bleed into their beats.
    // Reality destabilises as you approach across the open field instead; the
    // reveal reach is tight during Act I and widens to a landmark afterwards.
    const inOther = curRegion && curRegion.id!=='bloom';
    const distC=Math.hypot(px-CX, pz-CZ);
    const show = !inOther && distC<(actDone()?30:12);
    ground.visible=blooms.visible=show;
    if(!show){ gate+=(0.0-gate)*(1-Math.pow(0.06,dt)); return; }
    const near = px>B.x0-9 && px<B.x1+9 && pz>B.z0-9 && pz<B.z1+9;
    // ease the arena to life when you are here; it stays alive (a place, not a
    // trick) but breathes quieter when you are gone
    const want = entered?1:(near?0.85:0.6);
    gate += (want-gate)*(1-Math.pow(0.06,dt));
    const coh=coherence(t);
    for(const u of [groundMat.uniforms, bloomMat.uniforms]){
      u.uTime.value=t; u.uGate.value=gate; u.uCoh.value=coh; u.uAwake&&(u.uAwake.value=0);
      u.uPlayer.value.set(px,pz);
    }
    // the field remembers the walk — only stamp/heal/upload while you are near
    if(near){
      const heal=Math.exp(-dt*0.055);                 // slow: gouges last ~13s
      for(let i=0;i<trail.length;i++){ let vv=trail[i]*heal; trail[i]=vv; trailBytes[i*4]=vv*255; }
      const sp=velocity.length();
      stamp(px,pz, Math.min(1.2, 0.8+sp*0.12)*dt*6.0);
      // re-pack the neighbourhood of the stamp into bytes (cheap; rest packed above)
      packRegion(px,pz);
      trailTex.needsUpdate=true;
      // a footfall in the world's own touch language, and a ring on the base sheet
      lastStep+=sp*dt;
      if(lastStep>1.3){ lastStep=0; emitRipple(px,pz,0.7); if(sp>0.5)blip(180+Math.random()*40,0.12,0.03,'sine'); }
    }
  },
  // the avatar rides the swell and glides OVER the trenches it cuts — never
  // sunk into them, so it stays the clearest, most legible thing on screen
  mapPoint(p, src){
    const t=clock.elapsedTime, em=edgeJS(src.x,src.z);
    const breath=Math.sin(t*1.6);          // player sits at the centre of its own breath halo
    const s=swellJS(src.x,src.z,t);
    p.y = 0.06 + gate*em*(0.55*s + 0.10*breath);
    return p;
  },
  onEnter(first){ if(!entered){entered=true; if(first){addAwake(0.12);} } },
  // the beacon light stays dark through Act I (kept out of the sequence), then
  // stands as an invitation until you have been, then goes out like the others
  done(){ return actDone() ? entered : true; },
  save(){ return {entered}; },
  load(d){ if(d&&d.entered){entered=true; gate=1;} },
  debug(){ let peak=0; for(let i=0;i<trail.length;i++)if(trail[i]>peak)peak=trail[i];
    return {entered, gate:+gate.toFixed(2), coh:+coherence(clock.elapsedTime).toFixed(2),
    visible:!!(ground&&ground.visible), trailPeak:+peak.toFixed(3),
    probe:+trailAt(28,12).toFixed(3),   // a fixed sample near the SW corner, for the heal test
    playerY:+(this.mapPoint(new THREE.Vector3(playerPos.x,0,playerPos.z),playerPos).y).toFixed(3)}; }
});

// re-pack a small window of the heightfield around (x,z) into the byte
// texture (the heal loop already packs everything each frame; this keeps the
// freshly-stamped crater crisp between packs even at low frame rates)
function packRegion(x,z){
  const u=(x-B.x0)/(B.x1-B.x0), v=(z-B.z0)/(B.z1-B.z0);
  const cx=Math.round(u*(TW-1)), cy=Math.round(v*(TH-1)), R=7;
  for(let j=-R;j<=R;j++)for(let i=-R;i<=R;i++){
    const px=cx+i, py=cy+j; if(px<0||px>=TW||py<0||py>=TH)continue;
    const idx=py*TW+px; trailBytes[idx*4]=trail[idx]*255;
  }
}
