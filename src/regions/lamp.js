import * as THREE from 'three';
import {registerRegion, world, playerPos, velocity, curRegion, renderer, camera,
        emitRipple, blip, slide, chime, pulseFlash, setPrompt, refreshHud, makeLight,
        saveGame, ease, audio, S2} from '../game.js';

// ---------------------------------------------------------------------------
// LOWER THE LAMP — the identity crack, the last rung of Act I. A slit cuts
// straight across the ledge, dead ahead (the camera always faces +x, so the
// slit runs the region's full screen-right extent and the far side sits
// further up-screen — never off to the side where the phone can't see it).
// A lamp hangs on a line of light; drag it down and your shadow races ahead
// of you, across the gap you cannot walk over. Close your eyes at the right
// moment and you and your shadow trade places.
// ---------------------------------------------------------------------------
const LX=14, LZ=19;                 // the lamp's fixed footprint (near side, on the approach)
const LY_MAX=4;                     // low enough that the core is on screen from the entrance
const CENTER_H=.26;                 // the player's centre height, once fully 3D
const HOLE_X0=17, HOLE_X1=22;       // the slit spans the region's full z range
const FAR_LIGHT=new THREE.Vector3(25,0,19);
const LAMP_COLOR=0xffcf6b, SHADOW_COLOR=0x58f5ff;
const LAMP_COLOR_C=new THREE.Color(LAMP_COLOR), SHADOW_COLOR_C=new THREE.Color(SHADOW_COLOR);

// the drag→shadow mapping: s never explodes. u is drag distance in [0,1];
// s rises linearly from 1 (shadow at your feet) to S_MAX (shadow thrown its
// furthest). S_MAX is picked so that, dragged fully while standing at the
// near lip, the shadow lands at most 1.5 units past the far lip.
const S_MAX=3.45;
const LY_MIN=CENTER_H*S_MAX/(S_MAX-1);   // the lamp's lowest resting height (~.37)
const DRAG_FULL_PX=46;                   // ~40px of drag: near lip to across
const SWAP_MARGIN=.15;                   // how far past the far lip counts as "across"

const raycaster=new THREE.Raycaster(), ndc=new THREE.Vector2();
const eyeBtnEl=()=>document.getElementById('eye');
const veilEl=()=>document.getElementById('veil');
const freqForU=u=>THREE.MathUtils.mapLinear(u,0,1,520,150);

// a soft radial-falloff shadow, made once (no per-frame allocation)
function makeShadowTexture(){
  const c=document.createElement('canvas'); c.width=128; c.height=128;
  const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(0,0,0,.95)'); g.addColorStop(.5,'rgba(0,0,0,.8)');
  g.addColorStop(.82,'rgba(0,0,0,.32)'); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,128,128);
  const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace; return tex;
}
const SHADOW_TEX=makeShadowTexture();

const region=registerRegion({
  id:'lamp', name:'THE LAMP', color:LAMP_COLOR,
  bounds:{x0:4,x1:26,z0:11,z1:27},
  entrance:new THREE.Vector3(9,0,12.5),

  // ---- state ----
  dragU:0, lampY:LY_MAX, lampTouched:false,
  dragging:false, dragStartClientY:0, dragStartU:0, lastHumU:0,
  shadowVisible:false, shadowPos:new THREE.Vector3(), lastRippleShadow:new THREE.Vector3(9999,0,9999),
  _redT:-99, _rimFlashNearT:-99, _rimFlashFarT:-99, _nextAttempt:0,
  swapped:false, finished:false,
  eyeHoldT:0,
  swapLock:false, swapT0:0, footIdx:-1, oldPos:new THREE.Vector3(), targetPos:new THREE.Vector3(),
  rimIdleT:0, eyeIdleT:0, promptKind:null,
  stepAccum:0, blockedFlag:false, _railFlag:false,

  build(){
    const b=this.bounds;
    // the slit: the universe grid does not show inside it
    const hole=new THREE.Mesh(new THREE.PlaneGeometry(HOLE_X1-HOLE_X0,b.z1-b.z0),
      new THREE.MeshBasicMaterial({color:0x000000}));
    hole.rotation.x=-Math.PI/2; hole.position.set((HOLE_X0+HOLE_X1)/2,.02,(b.z0+b.z1)/2);
    world.add(hole);
    // the luminous rim: near/far lips run the full width of the ledge; two
    // low rails fence the slit's ends so it cannot be walked around
    const rimMat=new THREE.MeshBasicMaterial({color:0xfff2c8,transparent:true,opacity:.85,blending:THREE.AdditiveBlending});
    const near=new THREE.Mesh(new THREE.BoxGeometry(.16,.06,b.z1-b.z0),rimMat.clone());
    near.position.set(HOLE_X0,.05,(b.z0+b.z1)/2); world.add(near);
    const far=new THREE.Mesh(new THREE.BoxGeometry(.16,.06,b.z1-b.z0),rimMat.clone());
    far.position.set(HOLE_X1,.05,(b.z0+b.z1)/2); world.add(far);
    const railMat=new THREE.MeshBasicMaterial({color:0xfff2c8,transparent:true,opacity:.8,blending:THREE.AdditiveBlending});
    const railN=new THREE.Mesh(new THREE.BoxGeometry(HOLE_X1-HOLE_X0+.3,.3,.14),railMat.clone());
    railN.position.set((HOLE_X0+HOLE_X1)/2,.16,b.z0); world.add(railN);
    const railS=new THREE.Mesh(new THREE.BoxGeometry(HOLE_X1-HOLE_X0+.3,.3,.14),railMat.clone());
    railS.position.set((HOLE_X0+HOLE_X1)/2,.16,b.z1); world.add(railS);

    // the lamp: an octahedron core, breathing, on a vertical line of light
    // that pulses slowly downward — "pull me" without a word
    const BEAM_LEN=LY_MAX+2;
    const beamMat=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
      uniforms:{uTime:{value:0},uColor:{value:new THREE.Color(0xffdca0)}},
      vertexShader:`varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          float trav=fract(uTime*.4-vUv.y);
          float band=exp(-pow((trav-.5)*9.0,2.0));
          vec3 col=uColor*(.22+band*1.7);
          gl_FragColor=vec4(col,.22+band*.55);
        }`,
    });
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,BEAM_LEN,10),beamMat);
    beam.position.set(LX,BEAM_LEN/2,LZ); world.add(beam);
    const core=new THREE.Mesh(new THREE.OctahedronGeometry(.32,0),
      new THREE.MeshStandardMaterial({color:0xffffff,emissive:LAMP_COLOR,emissiveIntensity:4,roughness:.12}));
    core.scale.setScalar(1.4);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.52,.04,8,48),
      new THREE.MeshBasicMaterial({color:LAMP_COLOR,transparent:true,opacity:.6}));
    ring.rotation.x=Math.PI/2;
    const halo=new THREE.Mesh(new THREE.SphereGeometry(.55,16,16),
      new THREE.MeshBasicMaterial({color:LAMP_COLOR,transparent:true,opacity:.16,blending:THREE.AdditiveBlending,depthWrite:false}));
    const glow=new THREE.PointLight(LAMP_COLOR,26,12);
    const lampGroup=new THREE.Group(); lampGroup.add(core,ring,halo,glow); world.add(lampGroup);
    const grabH=LY_MAX-LY_MIN+1.4;
    const grab=new THREE.Mesh(new THREE.BoxGeometry(2.4,grabH,2.4),new THREE.MeshBasicMaterial({visible:false}));
    grab.position.set(LX,(LY_MAX+LY_MIN)/2,LZ); world.add(grab);

    // the shadow: a soft radial disc with a bright rim, pinned to the ledge
    const shadowMat=new THREE.MeshBasicMaterial({map:SHADOW_TEX,transparent:true,depthWrite:false,
      polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4,side:THREE.DoubleSide});
    const shadowPlane=new THREE.Mesh(new THREE.PlaneGeometry(2.6,2.6),shadowMat);
    shadowPlane.rotation.x=-Math.PI/2;
    const rim=new THREE.Mesh(new THREE.RingGeometry(1.05,1.32,40),
      new THREE.MeshBasicMaterial({color:SHADOW_COLOR,transparent:true,opacity:.4,blending:THREE.AdditiveBlending,
        side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
    rim.rotation.x=-Math.PI/2;
    const shadowGroup=new THREE.Group(); shadowGroup.add(shadowPlane,rim); shadowGroup.visible=false; world.add(shadowGroup);

    // the old you: after the swap, a bright still figure left facing the far side
    const oldDisc=new THREE.Mesh(new THREE.CircleGeometry(.5,32),new THREE.MeshBasicMaterial({color:0xeaffff}));
    oldDisc.rotation.x=-Math.PI/2; oldDisc.position.y=.02;
    const oldCore=new THREE.Mesh(new THREE.IcosahedronGeometry(.32,1),
      new THREE.MeshStandardMaterial({color:0xffffff,emissive:LAMP_COLOR,emissiveIntensity:2.6,roughness:.2}));
    oldCore.position.y=.34;
    const oldRing=new THREE.Mesh(new THREE.RingGeometry(.55,.64,40),
      new THREE.MeshBasicMaterial({color:0xdfffff,transparent:true,opacity:.5,side:THREE.DoubleSide}));
    oldRing.rotation.x=-Math.PI/2; oldRing.position.y=.03;
    const oldSelf=new THREE.Group(); oldSelf.add(oldDisc,oldCore,oldRing); oldSelf.visible=false; world.add(oldSelf);

    // beyond the slit: the goal
    const farLight=makeLight(FAR_LIGHT,LAMP_COLOR);

    Object.assign(this,{lampGroup,core,ring,halo,glow,grab,beamMat,shadowGroup,shadowMat,rim,
      edgeNearMat:near.material,edgeFarMat:far.material,oldSelf,far:farLight});
  },

  onEnter(first){
    eyeBtnEl().style.display='grid';
    if(first) emitRipple(this.entrance.x,this.entrance.z,.8,LAMP_COLOR_C);
  },
  onLeave(){
    eyeBtnEl().style.display='none';   // the room's own onEnter re-shows it there
    if(this.promptKind){setPrompt('');this.promptKind=null;}
    this.rimIdleT=0; this.eyeIdleT=0; this.eyeHoldT=0; this._nextAttempt=0;
  },

  attemptSwap(t){
    const b=this.bounds;
    const insideMargin=this.shadowPos.x>b.x0+.6&&this.shadowPos.x<b.x1-.6&&
                        this.shadowPos.z>b.z0+.6&&this.shadowPos.z<b.z1-.6;
    if(this.shadowVisible&&this.shadowPos.x>HOLE_X1+SWAP_MARGIN&&insideMargin){
      this.swapLock=true; this.swapT0=t; this.footIdx=-1;
      this.oldPos.copy(playerPos);
      this.targetPos.set(
        THREE.MathUtils.clamp(this.shadowPos.x,b.x0+.6,b.x1-.6),0,
        THREE.MathUtils.clamp(this.shadowPos.z,b.z0+.6,b.z1-.6));
      velocity.set(0,0,0);
      // left standing the moment you start to go: the camera glides away from
      // it during the dolly, the one place it's actually seen
      this.oldSelf.position.set(this.oldPos.x,.3,this.oldPos.z);
      this.oldSelf.visible=true;
    }else{
      blip(95,.16,.09,'sine'); this._redT=t;
      // flash the rim nearest wherever the shadow actually sits
      if(this.shadowPos.x<=HOLE_X1) this._rimFlashNearT=t; else this._rimFlashFarT=t;
      veilEl().style.opacity='.25';
      setTimeout(()=>{ if(!this.swapLock) veilEl().style.opacity=S2.eyes?'.87':'0'; },300);
    }
  },

  _railBump(which,z){
    if(this._railFlag===which) return;
    this._railFlag=which; blip(90,.12,.07,'sine'); emitRipple(playerPos.x,z,.6,SHADOW_COLOR_C);
  },

  update(dt,t){
    if(!this.lampGroup) return;
    const insideMe=curRegion===this, b=this.bounds;

    // ---- the lamp: driven by the drag, never by an exploding formula ----
    const s=1+this.dragU*(S_MAX-1);
    this.lampY=this.dragU<1e-4?LY_MAX:THREE.MathUtils.clamp(CENTER_H*s/(s-1),LY_MIN,LY_MAX);
    this.lampGroup.position.set(LX,this.lampY,LZ);
    this.lampGroup.rotation.y=t*.6; this.ring.rotation.z=t*.35;
    this.halo.scale.setScalar(1+.22*Math.sin(t*1.3));
    this.halo.material.opacity=.14+.10*(.5+.5*Math.sin(t*1.3));
    this.beamMat.uniforms.uTime.value=t;
    if(this.far){ this.far.rotation.y=t*.5; this.far.position.y=.5+.1*Math.sin(t*2.1); }
    this.edgeNearMat.color.setHex(t-this._rimFlashNearT<.2?0xff3050:0xfff2c8);
    this.edgeFarMat.color.setHex(t-this._rimFlashFarT<.2?0xff3050:0xfff2c8);

    if(!this.finished&&this.swapped&&insideMe&&Math.hypot(playerPos.x-FAR_LIGHT.x,playerPos.z-FAR_LIGHT.z)<.9){
      this.finished=true; pulseFlash(); chime();
      emitRipple(FAR_LIGHT.x,FAR_LIGHT.z,1.6,LAMP_COLOR_C);
      refreshHud(); saveGame();
    }

    // ---- the shadow: S = L + s(P - L), s driven by the drag, clamped to the ledge ----
    // frozen once the swap has begun: the target was already captured at that instant
    if(!this.swapped&&!this.swapLock){
      const rawX=LX+s*(playerPos.x-LX), rawZ=LZ+s*(playerPos.z-LZ);
      this.shadowPos.set(THREE.MathUtils.clamp(rawX,b.x0,b.x1),0,THREE.MathUtils.clamp(rawZ,b.z0,b.z1));
      this.shadowVisible=true;
    }
    this.shadowGroup.visible=this.shadowVisible&&!this.swapped&&!this.swapLock&&insideMe;
    if(this.shadowGroup.visible){
      this.shadowGroup.position.set(this.shadowPos.x,.05,this.shadowPos.z);
      const stretch=THREE.MathUtils.clamp(1+(s-1)*.05,.9,1.7);
      this.shadowGroup.scale.setScalar(stretch);
      const prox=1-THREE.MathUtils.clamp(Math.abs(this.shadowPos.x-HOLE_X1)/6,0,1);
      const red=t-this._redT<.2;
      this.shadowMat.color.setHex(red?0xff3050:0xffffff);
      this.rim.material.color.setHex(red?0xff3050:SHADOW_COLOR);
      this.rim.material.opacity=red?.8:.35+.55*prox;
    }

    // ---- ripples while scrubbing: the world's language, sound off or on ----
    if(this.dragging&&this.shadowGroup.visible&&this.shadowPos.distanceTo(this.lastRippleShadow)>.6){
      const pan=THREE.MathUtils.clamp((this.shadowPos.z-playerPos.z)/6,-1,1);
      emitRipple(this.shadowPos.x,this.shadowPos.z,.5,SHADOW_COLOR_C);
      blip(300,.05,.03,'sine',pan);
      this.lastRippleShadow.copy(this.shadowPos);
    }

    // ---- footsteps: a ripple (and a quiet panned tick) where the shadow lands ----
    if(insideMe&&!this.swapLock){
      this.stepAccum+=velocity.length()*dt;
      if(this.stepAccum>.9){
        this.stepAccum=0;
        if(this.shadowGroup.visible){
          const pan=THREE.MathUtils.clamp((this.shadowPos.z-playerPos.z)/6,-1,1);
          emitRipple(this.shadowPos.x,this.shadowPos.z,.55,SHADOW_COLOR_C);
          blip(300,.05,.035,'sine',pan);
        }
      }
    }else this.stepAccum=0;

    // ---- the impossible moment: hold the eye; retried every .4s while held ----
    if(insideMe&&!this.swapped&&!this.swapLock){
      if(S2.eyes){
        this.eyeHoldT+=dt;
        if(this.eyeHoldT>=.5&&t>=this._nextAttempt){ this._nextAttempt=t+.4; this.attemptSwap(t); }
      }else{ this.eyeHoldT=0; this._nextAttempt=0; }
    }
    if(this.swapLock){
      velocity.set(0,0,0);
      const dt2=t-this.swapT0;
      if(dt2<1.2){
        veilEl().style.opacity='.93';
        const idx=Math.min(2,Math.floor(dt2/.4));
        if(idx!==this.footIdx){
          this.footIdx=idx; blip(210-idx*20,.16,.09,'sine',(idx-1)*.7);
          const k=(idx+1)/4;
          emitRipple(THREE.MathUtils.lerp(this.oldPos.x,this.targetPos.x,k),
                     THREE.MathUtils.lerp(this.oldPos.z,this.targetPos.z,k),.5,SHADOW_COLOR_C);
        }
      }else if(dt2<1.55){
        veilEl().style.opacity='.55';   // the dolly: felt, not blacked out
        const k=ease((dt2-1.2)/.35);
        playerPos.set(THREE.MathUtils.lerp(this.oldPos.x,this.targetPos.x,k),0,
                       THREE.MathUtils.lerp(this.oldPos.z,this.targetPos.z,k));
      }else{
        playerPos.set(this.targetPos.x,0,this.targetPos.z);
        this.swapLock=false; this.swapped=true;
        veilEl().style.opacity=S2.eyes?'.93':'0';   // held the reveal until the eye lets go
        pulseFlash(); chime();
        emitRipple(this.targetPos.x,this.targetPos.z,1.5,LAMP_COLOR_C);
        emitRipple(this.oldPos.x,this.oldPos.z,1.2,SHADOW_COLOR_C);
        if(this.promptKind){setPrompt('');this.promptKind=null;}
        refreshHud(); saveGame();
      }
    }

    // ---- prompts: fallback only, after the player has been stuck a while ----
    if(insideMe&&!this.swapped&&!this.swapLock){
      if(playerPos.x>HOLE_X0-3&&!this.lampTouched) this.rimIdleT+=dt; else this.rimIdleT=0;
      if(this.rimIdleT>8&&this.promptKind!=='pull'&&!this.lampTouched){ setPrompt('Pull the lamp down.'); this.promptKind='pull'; }
      if(this.lampTouched&&this.promptKind==='pull'){ setPrompt(''); this.promptKind=null; }
      const across=this.shadowGroup.visible&&this.shadowPos.x>HOLE_X1+SWAP_MARGIN;
      if(across&&!S2.eyes) this.eyeIdleT+=dt; else this.eyeIdleT=0;
      if(this.eyeIdleT>8&&this.promptKind!=='close'){ setPrompt('Close your eyes.'); this.promptKind='close'; }
      if(S2.eyes&&this.promptKind==='close'){ setPrompt(''); this.promptKind=null; }
    }
  },

  constrain(prevX,prevZ,pos,vel){
    if(this.swapLock) return;
    const b=this.bounds;
    // ends at the bounds exactly: outside this rectangle the lamp owns nothing
    if(pos.x<b.x0||pos.x>b.x1||pos.z<b.z0-.8||pos.z>b.z1+.8) return;

    // the slit: solid across the ledge's full width; nothing between the lips is walkable
    if(pos.x>HOLE_X0-.3&&pos.x<HOLE_X1+.3){
      const fromNear=prevX<=(HOLE_X0+HOLE_X1)/2;
      if(fromNear){ pos.x=Math.min(pos.x,HOLE_X0-.3); if(vel.x>0)vel.x*=-.2; }
      else{ pos.x=Math.max(pos.x,HOLE_X1+.3); if(vel.x<0)vel.x*=-.2; }
      if(!this.blockedFlag){
        this.blockedFlag=true; blip(95,.13,.08,'sine');
        emitRipple(pos.x,pos.z,.7,SHADOW_COLOR_C);
      }
    }else this.blockedFlag=false;

    // the slit's two ends are fenced (the rail): it cannot be walked around
    if(pos.x>HOLE_X0-.5&&pos.x<HOLE_X1+.5){
      if(pos.z<b.z0+.3){ pos.z=Math.max(pos.z,b.z0+.3); if(vel.z<0)vel.z*=-.2; this._railBump('n',b.z0+.3); }
      else if(pos.z>b.z1-.3){ pos.z=Math.min(pos.z,b.z1-.3); if(vel.z>0)vel.z*=-.2; this._railBump('s',b.z1-.3); }
      else this._railFlag=false;
    }else this._railFlag=false;
  },

  done(){ return this.finished; },
  debug(){
    return {lampY:+this.lampY.toFixed(2), dragU:+this.dragU.toFixed(3),
      shadowX:+this.shadowPos.x.toFixed(2), shadowZ:+this.shadowPos.z.toFixed(2),
      shadowVisible:this.shadowGroup?this.shadowGroup.visible:false,
      swapped:this.swapped, finished:this.finished, swapLock:this.swapLock,
      oldX:+this.oldPos.x.toFixed(2), oldZ:+this.oldPos.z.toFixed(2),
      oldSelfVisible:this.oldSelf?this.oldSelf.visible:false};
  },
  save(){ return {dragU:this.dragU, swapped:this.swapped, finished:this.finished,
    oldPos:this.swapped?[this.oldPos.x,this.oldPos.z]:null}; },
  load(d){
    if(typeof d.dragU==='number') this.dragU=THREE.MathUtils.clamp(d.dragU,0,1);
    this.swapped=!!d.swapped; this.finished=!!d.finished;
    if(this.swapped){
      this.lampTouched=true;
      if(Array.isArray(d.oldPos)){
        this.oldPos.set(d.oldPos[0],0,d.oldPos[1]);
        this.oldSelf.position.set(this.oldPos.x,.3,this.oldPos.z);
        this.oldSelf.visible=true;
      }
    }
  },
});

// ---- grab and drag the lamp along its line of light ----
renderer.domElement.addEventListener('pointerdown',e=>{
  if(curRegion!==region||!region.grab) return;
  ndc.set((e.clientX/innerWidth)*2-1,-(e.clientY/innerHeight)*2+1);
  raycaster.setFromCamera(ndc,camera);
  if(raycaster.intersectObject(region.grab).length>0){
    region.dragging=true; region.dragStartClientY=e.clientY; region.dragStartU=region.dragU; region.lastHumU=region.dragU;
    try{renderer.domElement.setPointerCapture(e.pointerId);}catch(_){}
    audio();
  }
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!region.dragging) return;
  const nu=THREE.MathUtils.clamp(region.dragStartU+(e.clientY-region.dragStartClientY)/DRAG_FULL_PX,0,1);
  if(Math.abs(nu-region.dragU)>1e-5){
    region.dragU=nu; region.lampTouched=true;
    if(Math.abs(nu-region.lastHumU)>.03){
      slide(freqForU(region.lastHumU),freqForU(nu),.12,.045); region.lastHumU=nu;
    }
  }
});
const endLampDrag=e=>{ if(region.dragging){ region.dragging=false; try{renderer.domElement.releasePointerCapture(e.pointerId);}catch(_){} } };
renderer.domElement.addEventListener('pointerup',endLampDrag);
renderer.domElement.addEventListener('pointercancel',endLampDrag);
