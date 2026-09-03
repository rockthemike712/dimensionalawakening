import * as THREE from 'three';
import {registerRegion, world, playerPos, velocity, curRegion, renderer, camera,
        emitRipple, blip, slide, chime, pulseFlash, setPrompt, refreshHud, makeLight,
        saveGame, ease, audio, S2, lookBack} from '../game.js';

// ---------------------------------------------------------------------------
// LOWER THE LAMP — the identity crack, the last rung of Act I. A slit cuts
// straight across the ledge, dead ahead (the camera always faces +x, so the
// slit runs the region's full screen-right extent and the far side sits
// further up-screen — never off to the side where the phone can't see it).
// A lamp hangs on a line of light; drag it down and your shadow races ahead
// of you, across the gap you cannot walk over. Close your eyes at the right
// moment and you and your shadow trade places.
// ---------------------------------------------------------------------------
// the lamp's fixed footprint sits well short of the rim — AHEAD of where the
// player stands to work it, not behind — so its low, dragged-down silhouette
// never grows tall enough on screen to sit over the pad (see LY_MIN below).
// Moved further west than the last revision (was 15.8) so the lamp-to-rim
// baseline (HOLE_X0-LX) is a full 3.5 units — the fourth-review fix that
// widens the whole swap window (item 3).
const LX=13.5, LZ=19;
const LY_MAX=4;                     // low enough that the core is on screen from the entrance
// the lamp's lowest resting height: lowered back toward CENTER_H (fourth
// review, item 3) so most of the shadow's reach comes from real projection
// geometry rather than a fudge factor — still a comfortable .24 above
// CENTER_H, nowhere near the geometric singularity, so the curve stays
// smooth through the drag instead of spiking only at the very end.
const LY_MIN=.5;
const CENTER_H=.26;                 // the player's centre height, once fully 3D
const HOLE_X0=17, HOLE_X1=22;       // the slit spans the region's full z range
const FAR_LIGHT=new THREE.Vector3(25,0,19);
const LAMP_COLOR=0xffcf6b, SHADOW_COLOR=0x58f5ff;
const LAMP_COLOR_C=new THREE.Color(LAMP_COLOR), SHADOW_COLOR_C=new THREE.Color(SHADOW_COLOR);

// the drag -> shadow mapping. u (drag distance, 0..1) drives lampY linearly;
// s (how far the shadow is thrown) is then read off the lamp's actual height
// with the real projection geometry: a point light at height Y throws a
// shadow of a thing at height CENTER_H out to s = Y/(Y-CENTER_H) times its
// distance from the light. Lowering LY_MIN (above) folds most of the reach
// into that real geometry; S_BOOST is what's left over — a smaller, honest
// top-up, ramped LINEARLY in u (not u^3, per item 3) so it adds throughout
// the whole pull instead of hiding in the last few percent of the drag.
const S_BOOST=4.0;
const DRAG_FULL_PX=120;                  // the whole gesture spends its length on
                                          // the reach, not just its last ~14px
const SWAP_MARGIN=.32;                   // how far past the far lip counts as "across" —
                                          // must clear the constrain block's own +.3 band
// west of the lamp the light-through-player line points backward (the
// shadow would be thrown behind the player) — instead hold it a short,
// fixed-ish distance ahead, growing a little with the drag (item 4)
const WEST_OFF_MIN=.6, WEST_OFF_MAX=1.6;

const raycaster=new THREE.Raycaster(), ndc=new THREE.Vector2();
const eyeBtnEl=()=>document.getElementById('eye');
// hoisted once (item 7 minor): the veil node itself, and its style object,
// so update() never re-queries the DOM or rebuilds a style string per frame
const veilEl=document.getElementById('veil');
const veilStyle=veilEl.style;
const setVeilOp=(region,v)=>{ if(region._veilCur!==v){ region._veilCur=v; veilStyle.opacity=v; } };
const freqForU=u=>THREE.MathUtils.mapLinear(u,0,1,520,150);
// fade to 0 over the last .5 units past a bound rather than pinning a decal
// at the wall; hoisted so update() never allocates a closure
const fadeAxis=(raw,lo,hi)=>raw<lo?THREE.MathUtils.clamp(1-(lo-raw)/.5,0,1):
                              raw>hi?THREE.MathUtils.clamp(1-(raw-hi)/.5,0,1):1;
// the widened swap window (item 3) routinely throws the raw x many units
// past the region's own east edge on the way to being clamped there — that
// overshoot is the reach doing its job, not the shadow wandering off the
// map, so only the low side fades on x; the far side is exactly where the
// shadow is supposed to be able to go now, and always stays fully visible
const fadeLow=(raw,lo)=>raw<lo?THREE.MathUtils.clamp(1-(lo-raw)/.5,0,1):1;

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
  // dead ahead of the entrance and lined up with the slit, so the lamp is in
  // frame the moment the player arrives (see item 1)
  entrance:new THREE.Vector3(8,0,19),

  // ---- state ----
  dragU:0, lampY:LY_MAX, lampTouched:false,
  dragging:false, dragStartClientY:0, dragStartU:0, lastHumU:0,
  shadowVisible:false, shadowPos:new THREE.Vector3(), lastRippleShadow:new THREE.Vector3(9999,0,9999),
  shadowFade:1,
  _redT:-99, _rimFlashNearT:-99, _rimFlashFarT:-99, _nextAttempt:0,
  swapped:false, finished:false,
  eyeHoldT:0, _holdRefused:false, veilDipT:-99, _veilCur:0,
  swapLock:false, swapT0:0, footIdx:-1, oldPos:new THREE.Vector3(), targetPos:new THREE.Vector3(),
  // the look-back no longer fires the instant the swap animation ends: it
  // waits behind the veil for the eye to actually let go (item 5)
  lookBackT:-99, echoShown:false, pendingLookBack:false, lookingBackNow:false,
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
    // the rails run from just short of the near lip all the way to the
    // region's east edge — the whole stretch where the slit could otherwise
    // be walked around (item 6), not just the hole's own narrow width
    const railMat=new THREE.MeshBasicMaterial({color:0xfff2c8,transparent:true,opacity:.8,blending:THREE.AdditiveBlending});
    const railX0=HOLE_X0-.5, railW=b.x1-railX0, railCX=(railX0+b.x1)/2;
    const railN=new THREE.Mesh(new THREE.BoxGeometry(railW,.3,.14),railMat.clone());
    railN.position.set(railCX,.16,b.z0); world.add(railN);
    const railS=new THREE.Mesh(new THREE.BoxGeometry(railW,.3,.14),railMat.clone());
    railS.position.set(railCX,.16,b.z1); world.add(railS);

    // the lamp: an octahedron core, breathing, on a vertical line of light
    // that pulses slowly downward — "pull me" without a word
    const BEAM_LEN=LY_MAX+2;
    const beamMat=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
      // uDim: 1 normally, pulled down while the camera is looking back at the
      // near side, so the lamp doesn't compete with the old self in that
      // shot (item 6)
      uniforms:{uTime:{value:0},uColor:{value:new THREE.Color(0xffdca0)},uDim:{value:1}},
      vertexShader:`varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform float uTime; uniform vec3 uColor; uniform float uDim; varying vec2 vUv;
        void main(){
          float trav=fract(uTime*.4-vUv.y);
          float band=exp(-pow((trav-.5)*9.0,2.0));
          vec3 col=uColor*(.22+band*1.7)*uDim;
          gl_FragColor=vec4(col,(.22+band*.55)*uDim);
        }`,
    });
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,BEAM_LEN,10),beamMat);
    beam.position.set(LX,BEAM_LEN/2,LZ); world.add(beam);
    beam.userData.baseLen=BEAM_LEN;   // rescaled every frame to run sky -> core (item 5)
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

    // the lingering question: a second, dimmer copy ahead on the far side,
    // seen only for a couple of seconds once the look-back has returned —
    // it fades on its own, never explained (item 8)
    const farEcho=new THREE.Mesh(new THREE.CircleGeometry(.42,28),
      new THREE.MeshBasicMaterial({color:0xeaffff,transparent:true,opacity:0,depthWrite:false}));
    farEcho.rotation.x=-Math.PI/2; farEcho.position.y=.02; farEcho.visible=false; world.add(farEcho);

    // beyond the slit: the goal
    const farLight=makeLight(FAR_LIGHT,LAMP_COLOR);

    Object.assign(this,{lampGroup,core,ring,halo,glow,grab,beam,beamMat,shadowGroup,shadowMat,rim,
      edgeNearMat:near.material,edgeFarMat:far.material,oldSelf,farEcho,far:farLight});
  },

  onEnter(first){
    eyeBtnEl().style.display='grid';
    if(first) emitRipple(this.entrance.x,this.entrance.z,.8,LAMP_COLOR_C);
  },
  onLeave(){
    eyeBtnEl().style.display='none';   // the room's own onEnter re-shows it there
    if(this.promptKind){setPrompt('');this.promptKind=null;}
    this.rimIdleT=0; this.eyeIdleT=0; this.eyeHoldT=0; this._nextAttempt=0; this._holdRefused=false;
    setVeilOp(this,S2.eyes?.87:0);   // hand the veil back to the eye button's own control
  },

  attemptSwap(t){
    const b=this.bounds;
    // only the shadow's z needs headroom off the region edge — its x is
    // already clamped to [b.x0,b.x1] in update(), and a wide swap window
    // (item 3) routinely clamps it flush to b.x1, which is the far side
    // itself, not a reason to refuse
    const insideMargin=this.shadowPos.z>b.z0+.6&&this.shadowPos.z<b.z1-.6;
    // the player must actually be standing on the near side — closing your
    // eyes from the far side (having sidestepped the fence, item 1) must
    // never trade you back onto yourself
    if(this.shadowVisible&&playerPos.x<HOLE_X0&&this.shadowPos.x>HOLE_X1+SWAP_MARGIN&&insideMargin){
      this.swapLock=true; this.swapT0=t; this.footIdx=-1;
      this.oldPos.copy(playerPos);
      this.targetPos.set(
        THREE.MathUtils.clamp(this.shadowPos.x,b.x0+.6,b.x1-.6),0,
        THREE.MathUtils.clamp(this.shadowPos.z,b.z0+.6,b.z1-.6));
      velocity.set(0,0,0);
      // left standing the moment you start to go: the camera glides away from
      // it during the dolly, and again in the look-back later. Grounded at
      // y=0 (was .3) so its disc and ring actually lie on the floor (item 6)
      this.oldSelf.position.set(this.oldPos.x,0,this.oldPos.z);
      this.oldSelf.visible=true;
    }else{
      blip(95,.16,.09,'sine'); this._redT=t;
      // flash the near lip: the shadow, held over the hole, hasn't crossed
      if(this.shadowPos.x<=HOLE_X1) this._rimFlashNearT=t; else this._rimFlashFarT=t;
      // one veil dip per refusal, not per .4s retry — see update()'s decay
      if(!this._holdRefused){ this._holdRefused=true; this.veilDipT=t; }
    }
  },

  _railBump(which,z){
    if(this._railFlag===which) return;
    this._railFlag=which; blip(90,.12,.07,'sine'); emitRipple(playerPos.x,z,.6,SHADOW_COLOR_C);
  },

  update(dt,t){
    if(!this.lampGroup) return;
    const insideMe=curRegion===this, b=this.bounds;

    // ---- the look-back: queued at the swap (see the swapLock block below)
    // but not fired until the eye actually lets go, or the veil is already
    // most of the way up — never at the swap instant itself (item 5) ----
    if(this.pendingLookBack&&(!S2.eyes||this._veilCur<.3)){
      this.pendingLookBack=false;
      lookBack(1.4); this.lookBackT=t; this.echoShown=false;
    }
    const lookingBack=this.lookBackT>0&&t-this.lookBackT<1.4;
    this.lookingBackNow=lookingBack;   // for debug() — lookBackT itself stays set well past the 1.4s window, through the echo

    // ---- the lamp: lampY driven linearly by the drag; s (the throw) read
    // off the real geometry, plus a small linear top-up (see S_BOOST above).
    // Dimmed while the look-back plays, so the lamp doesn't crowd the old
    // self out of the one shot it's actually seen in (item 6).
    const u=this.dragU;
    this.lampY=u<1e-4?LY_MAX:THREE.MathUtils.lerp(LY_MAX,LY_MIN,u);
    const sGeom=this.lampY/(this.lampY-CENTER_H);
    const boost=THREE.MathUtils.lerp(1,S_BOOST,u);
    const s=sGeom*boost;
    const dim=lookingBack?.12:1;
    this.lampGroup.position.set(LX,this.lampY,LZ);
    this.lampGroup.rotation.y=t*.6; this.ring.rotation.z=t*.35;
    this.halo.scale.setScalar(1+.22*Math.sin(t*1.3));
    this.halo.material.opacity=(.14+.10*(.5+.5*Math.sin(t*1.3)))*dim;
    this.core.material.emissiveIntensity=4*dim;
    this.ring.material.opacity=.6*dim;
    this.glow.intensity=26*dim;
    this.beamMat.uniforms.uTime.value=t;
    this.beamMat.uniforms.uDim.value=dim;
    // the beam runs from a fixed point in the sky down to wherever the core
    // now sits — it follows the lamp instead of staying stretched full-length
    if(this.beam){
      const top=LY_MAX+2, len=Math.max(.05,top-this.lampY);
      this.beam.scale.y=len/this.beam.userData.baseLen;
      this.beam.position.set(LX,this.lampY+len/2,LZ);
    }
    if(this.far){
      this.far.rotation.y=t*.5; this.far.position.y=.5+.1*Math.sin(t*2.1);
      const fu=this.far.userData;
      if(fu){ fu.beam.visible=!this.finished; fu.glow.visible=!this.finished; }   // item 10: dims, never fully out
    }
    this.edgeNearMat.color.setHex(t-this._rimFlashNearT<.2?0xff3050:0xfff2c8);
    this.edgeFarMat.color.setHex(t-this._rimFlashFarT<.2?0xff3050:0xfff2c8);

    if(!this.finished&&this.swapped&&insideMe&&Math.hypot(playerPos.x-FAR_LIGHT.x,playerPos.z-FAR_LIGHT.z)<.9){
      this.finished=true; pulseFlash(); chime();
      emitRipple(FAR_LIGHT.x,FAR_LIGHT.z,1.6,LAMP_COLOR_C);
      refreshHud(); saveGame();
    }

    // ---- the shadow: projected along x only, so the whole near rim works
    // the same way (item 2) — z simply follows the player, never lerped
    // toward the lamp's own z. Frozen once the swap has begun: the target
    // was already captured at that instant. West of the lamp the light-
    // through-player ray points backward, which used to throw the shadow
    // behind the player — instead it's held a short, fixed-ish distance
    // ahead, growing a little with the drag so it's never a dead prop (item 4).
    if(!this.swapped&&!this.swapLock){
      const rawX=playerPos.x<LX?playerPos.x+THREE.MathUtils.lerp(WEST_OFF_MIN,WEST_OFF_MAX,u)
                                :LX+s*(playerPos.x-LX);
      const rawZ=playerPos.z;
      this.shadowPos.set(THREE.MathUtils.clamp(rawX,b.x0,b.x1),0,THREE.MathUtils.clamp(rawZ,b.z0,b.z1));
      this.shadowVisible=true;
      this.shadowFade=Math.min(fadeLow(rawX,b.x0),fadeAxis(rawZ,b.z0,b.z1));
    }
    this.shadowGroup.visible=this.shadowVisible&&!this.swapped&&!this.swapLock&&insideMe;
    if(this.shadowGroup.visible){
      this.shadowGroup.position.set(this.shadowPos.x,.05,this.shadowPos.z);
      const stretch=THREE.MathUtils.clamp(1+(s-1)*.05,.9,1.7);
      this.shadowGroup.scale.setScalar(stretch);
      this.shadowMat.opacity=this.shadowFade;
      const prox=1-THREE.MathUtils.clamp(Math.abs(this.shadowPos.x-HOLE_X1)/6,0,1);
      const red=t-this._redT<.2;
      this.shadowMat.color.setHex(red?0xff3050:0xffffff);
      this.rim.material.color.setHex(red?0xff3050:SHADOW_COLOR);
      this.rim.material.opacity=(red?.8:.35+.55*prox)*this.shadowFade;
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
      }else{ this.eyeHoldT=0; this._nextAttempt=0; this._holdRefused=false; }
    }

    // ---- the veil: one continuous, decaying value out of update(), never a
    // setTimeout shorter than the CSS transition. A refusal dips it once
    // (see attemptSwap) and it eases back to whatever the eye button itself
    // wants (.87 held, 0 released) — holding through repeated .4s retries
    // never re-dips. While the look-back plays it is held down regardless of
    // eye state, so the camera's swing around the lamp is never actually
    // seen — the look-back plays behind the veil, not in front of it (item 5).
    if(insideMe&&!this.swapLock){
      if(lookingBack){
        setVeilOp(this,.9);
      }else{
        const base=S2.eyes?.87:0;
        const dipAge=t-this.veilDipT, dip=(dipAge>=0&&dipAge<.6)?(1-dipAge/.6)*.6:0;
        setVeilOp(this,Math.max(0,base-dip));
      }
    }

    if(this.swapLock){
      velocity.set(0,0,0);
      const dt2=t-this.swapT0;
      if(dt2<1.2){
        setVeilOp(this,.93);
        const idx=Math.min(2,Math.floor(dt2/.4));
        if(idx!==this.footIdx){
          this.footIdx=idx; blip(210-idx*20,.16,.09,'sine',(idx-1)*.7);
          const k=(idx+1)/4;
          emitRipple(THREE.MathUtils.lerp(this.oldPos.x,this.targetPos.x,k),
                     THREE.MathUtils.lerp(this.oldPos.z,this.targetPos.z,k),.5,SHADOW_COLOR_C);
        }
      }else if(dt2<1.55){
        setVeilOp(this,.55);   // the dolly: felt, not blacked out
        const k=ease((dt2-1.2)/.35);
        playerPos.set(THREE.MathUtils.lerp(this.oldPos.x,this.targetPos.x,k),0,
                       THREE.MathUtils.lerp(this.oldPos.z,this.targetPos.z,k));
      }else{
        playerPos.set(this.targetPos.x,0,this.targetPos.z);
        this.swapLock=false; this.swapped=true;
        setVeilOp(this,.9);   // stays down until the look-back actually plays (item 5)
        pulseFlash(); chime();
        emitRipple(this.targetPos.x,this.targetPos.z,1.5,LAMP_COLOR_C);
        emitRipple(this.oldPos.x,this.oldPos.z,1.2,SHADOW_COLOR_C);
        if(this.promptKind){setPrompt('');this.promptKind=null;}
        // the old self is only ever seen in the look-back — queued here, but
        // not fired until the eye actually releases (see the top of update()),
        // so it always plays hidden behind the veil, not at this instant
        this.pendingLookBack=true;
        refreshHud(); saveGame();
      }
    }

    // ---- item 8, continued: once the look-back has returned, a second,
    // dimmer copy lingers ahead on the far side for two seconds, then fades
    // for good — the question outlives the glance back ----
    if(this.lookBackT>0){
      const el=t-this.lookBackT;
      if(el>=1.4&&el<3.4){
        if(!this.echoShown){
          this.echoShown=true;
          const ex=THREE.MathUtils.clamp(this.targetPos.x+3,b.x0+.6,b.x1-.6);
          this.farEcho.position.set(ex,.02,this.targetPos.z);
          this.farEcho.visible=true;
        }
        this.farEcho.material.opacity=.3*(1-(el-1.4)/2);
      }else if(el>=3.4){
        this.farEcho.visible=false; this.lookBackT=-99;
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
    // this slice's x-domain only — everything here (fence included) leaves
    // a player outside [b.x0,b.x1] alone, so this never reaches into a
    // neighbouring region's own territory along x.
    if(pos.x<b.x0||pos.x>b.x1) return;

    // FENCE_Z_MARGIN bounds how far outside the ledge's own z-run the fence
    // below still reaches: wide enough to catch a player sidestepping the
    // rail ends close by (z=7.5, 9.6, 27.5 — the fourth review's exploit),
    // but not so wide it starts grabbing players deep in a neighbouring
    // region's own bounds (corner reaches only to z=9; thin starts at z=-11).
    const nearNorth=pos.z<b.z0+.3&&pos.z>b.z0-4, nearSouth=pos.z>b.z1-.3&&pos.z<b.z1+4;
    const outsideCorridor=nearNorth||nearSouth;
    const pastFenceLine=pos.x>HOLE_X0-.5;

    // ---- items 1 & 2: the fence itself. Before a swap, straying outside
    // the ledge's own z-corridor while past the near lip's threshold must
    // push x back toward the near side — with a thud and a ripple — never
    // snap z sideways from wherever the player actually is. This is the one
    // thing here that has to act regardless of curRegion: the exploit is
    // sidestepping in z well outside these bounds in the first place, which
    // is exactly where curRegion is already something else (or nothing). ----
    if(!this.swapped&&pastFenceLine&&outsideCorridor){
      pos.x=Math.min(pos.x,HOLE_X0-.5);
      if(vel.x>0)vel.x*=-.2;
      this._railBump(nearNorth?'n':'s',pos.z);
      return;
    }

    // everything below only ever touches the player once the core has
    // already decided they're standing in this region (item 2) — the fence
    // above is the one exception, since it has to reach players who aren't
    if(curRegion!==this){ this._railFlag=false; return; }

    // the slit itself: solid across the ledge's own z-range; nothing between
    // the lips is walkable, swapped or not
    if(pos.x>HOLE_X0-.3&&pos.x<HOLE_X1+.3){
      const fromNear=prevX<=(HOLE_X0+HOLE_X1)/2;
      if(fromNear){ pos.x=Math.min(pos.x,HOLE_X0-.3); if(vel.x>0)vel.x*=-.2; }
      else{ pos.x=Math.max(pos.x,HOLE_X1+.3); if(vel.x<0)vel.x*=-.2; }
      if(!this.blockedFlag){
        this.blockedFlag=true; blip(95,.13,.08,'sine');
        emitRipple(pos.x,pos.z,.7,SHADOW_COLOR_C);
      }
    }else this.blockedFlag=false;

    // past the swap, the near/far ends of the ledge are ordinary walls —
    // a plain z bounce, no reason to move x once already standing here
    if(pastFenceLine&&outsideCorridor){
      pos.z=THREE.MathUtils.clamp(pos.z,b.z0+.3,b.z1-.3);
      if(nearNorth&&vel.z<0)vel.z*=-.2;
      if(nearSouth&&vel.z>0)vel.z*=-.2;
      this._railBump(nearNorth?'n':'s',pos.z);
    }else this._railFlag=false;
  },

  done(){ return this.finished; },
  debug(){
    return {lampY:+this.lampY.toFixed(2), dragU:+this.dragU.toFixed(3),
      shadowX:+this.shadowPos.x.toFixed(2), shadowZ:+this.shadowPos.z.toFixed(2),
      shadowVisible:this.shadowGroup?this.shadowGroup.visible:false,
      shadowFade:+this.shadowFade.toFixed(2),
      shadowLen:this.shadowGroup?+this.shadowGroup.scale.x.toFixed(3):0,
      swapped:this.swapped, finished:this.finished, swapLock:this.swapLock,
      oldX:+this.oldPos.x.toFixed(2), oldZ:+this.oldPos.z.toFixed(2),
      oldSelfVisible:this.oldSelf?this.oldSelf.visible:false,
      oldSelfY:this.oldSelf?+this.oldSelf.position.y.toFixed(2):null,
      echoVisible:this.farEcho?this.farEcho.visible:false,
      farBeamOn:this.far?this.far.userData.beam.visible:null,
      farGlowOn:this.far?this.far.userData.glow.visible:null,
      lookingBack:!!this.lookingBackNow, pendingLookBack:this.pendingLookBack,
      lampDim:this.core?+this.core.material.emissiveIntensity.toFixed(2):null,
      veilCur:+this._veilCur.toFixed(2)};
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
        this.oldSelf.position.set(this.oldPos.x,0,this.oldPos.z);   // grounded (item 6)
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
