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
// the lamp's fixed footprint sits just short of the rim — AHEAD of where the
// player stands to work it, not behind — so its low, dragged-down silhouette
// never grows tall enough on screen to sit over the pad (see LY_MIN below).
// LX moved back east from the fourth revision's 13.5 (round-5 review, item
// 7): the lamp-to-rim baseline shrinks, but LY_MIN stays low (not lifted back
// toward .5) so the swap window (item 3, below) still has room to work with.
const LX=15.8, LZ=13.5;             // LZ (round-5 review, item 9): close to the
// region's near edge so the entrance light, the lamp and the far light all
// sit in the same up-screen column the player is already walking toward when
// they arrive from the room, instead of 8+ units off to the side
const LY_MAX=4;                     // low enough that the core is on screen from the entrance
// the lamp's lowest resting height: lowered back toward CENTER_H (fourth
// review, item 3) so most of the shadow's reach comes from real projection
// geometry rather than a fudge factor — still a comfortable .24 above
// CENTER_H, nowhere near the geometric singularity, so the curve stays
// smooth through the drag instead of spiking only at the very end. Raised
// off that toward 1.3 (round-5 review, item 7) so the dragged-down core's
// screen projection never sinks into the d-pad's band at the bottom of the
// phone — S_BOOST below is what makes up the difference in reach.
const LY_MIN=1.3;
const CENTER_H=.26;                 // the player's centre height, once fully 3D
const HOLE_X0=17, HOLE_X1=22;       // the slit spans the region's full z range
const FAR_LIGHT=new THREE.Vector3(25,0,LZ);
const LAMP_COLOR=0xffcf6b, SHADOW_COLOR=0x58f5ff;
const LAMP_COLOR_C=new THREE.Color(LAMP_COLOR), SHADOW_COLOR_C=new THREE.Color(SHADOW_COLOR);

// the drag -> shadow mapping. u (drag distance, 0..1) drives lampY linearly;
// s (how far the shadow is thrown) is then read off the lamp's actual height
// with the real projection geometry: a point light at height Y throws a
// shadow of a thing at height CENTER_H out to s = Y/(Y-CENTER_H) times its
// distance from the light. LY_MIN sitting higher than the fourth revision's
// .5 (round-5 review, item 7 — see above) shortens the lamp-to-player
// baseline and starves the pure-geometry throw, so S_BOOST is raised to
// compensate (was 4.0) — ramped LINEARLY in u (not u^3, per item 3) so it
// adds throughout the whole pull instead of hiding in the last few percent.
const S_BOOST=9.0;
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
const eyeLabelEl=()=>document.getElementById('eyeLabel');
// hoisted once (item 7 minor): the veil node itself, and its style object,
// so update() never re-queries the DOM or rebuilds a style string per frame
const veilEl=document.getElementById('veil');
const veilStyle=veilEl.style;
// round-5 review, item 3: no cache guard — setEyes() in the core writes
// veil.style.opacity directly, without touching _veilCur, so a guard here
// can go stale against it (an early eye release mid-swap would then measure
// as veiled while the DOM was actually clear, or the reverse). One style
// write per frame is free; _veilCur is still kept, since the pendingLookBack
// check below reads it.
const setVeilOp=(region,v)=>{ region._veilCur=v; veilStyle.opacity=v; };
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
  // right at the region's own near edge (round-5 review, item 9) — a player
  // still walking in from the room, well short of the ledge, needs the
  // smallest possible z-offset from wherever they are for this light to read
  // on a 36-degree phone FOV
  entrance:new THREE.Vector3(8,0,11.5),

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

    // the old you: after the swap, a bright still figure left facing the far
    // side — built from the player's own materials (white/cyan, never gold;
    // gold stays reserved for lights), just dimmer and still (round-5
    // review, item 6 — it used to be gold-emissive, indistinguishable from a
    // light already collected)
    const oldDisc=new THREE.Mesh(new THREE.CircleGeometry(.5,32),new THREE.MeshBasicMaterial({color:0xeaffff}));
    oldDisc.rotation.x=-Math.PI/2; oldDisc.position.y=.02;
    const oldCore=new THREE.Mesh(new THREE.IcosahedronGeometry(.32,1),
      new THREE.MeshStandardMaterial({color:0xdfffff,emissive:0x49e9ff,emissiveIntensity:1.6,roughness:.18,metalness:.15}));
    oldCore.position.y=.34;
    const oldRing=new THREE.Mesh(new THREE.RingGeometry(.55,.64,40),
      new THREE.MeshBasicMaterial({color:0x52f5ff,transparent:true,opacity:.4,side:THREE.DoubleSide}));
    oldRing.rotation.x=-Math.PI/2; oldRing.position.y=.03;
    const oldHalo=new THREE.Mesh(new THREE.SphereGeometry(.55,16,16),
      new THREE.MeshBasicMaterial({color:0x52f5ff,transparent:true,opacity:.06,blending:THREE.AdditiveBlending,depthWrite:false}));
    oldHalo.position.y=.34;
    const oldSelf=new THREE.Group(); oldSelf.add(oldDisc,oldCore,oldRing,oldHalo); oldSelf.visible=false; world.add(oldSelf);

    // the lingering question: a second, dimmer copy ahead on the far side,
    // seen only for a couple of seconds once the look-back has returned —
    // it fades on its own, never explained (item 8)
    const farEcho=new THREE.Mesh(new THREE.CircleGeometry(.42,28),
      new THREE.MeshBasicMaterial({color:0xeaffff,transparent:true,opacity:0,depthWrite:false}));
    farEcho.rotation.x=-Math.PI/2; farEcho.position.y=.02; farEcho.visible=false; world.add(farEcho);

    // beyond the slit: the goal
    const farLight=makeLight(FAR_LIGHT,LAMP_COLOR);

    Object.assign(this,{lampGroup,core,ring,halo,glow,grab,beam,beamMat,shadowGroup,shadowMat,rim,
      edgeNearMat:near.material,edgeFarMat:far.material,oldSelf,oldCore,farEcho,far:farLight});
  },

  onEnter(first){
    eyeBtnEl().style.display='grid';
    // the eye's first appearance anywhere in Act I needs its own affordance
    // (round-5 review, item 11) — the room shows this same label the same
    // way, but the room does not exist yet
    if(first){ emitRipple(this.entrance.x,this.entrance.z,.8,LAMP_COLOR_C); eyeLabelEl().style.display='block'; }
  },
  onLeave(){
    eyeBtnEl().style.display='none';   // the room's own onEnter re-shows it there
    eyeLabelEl().style.display='none';
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
      // land on the far side, not necessarily all the way out at wherever
      // the (now much longer-reaching, item 3) shadow's tip sits — capped a
      // few units past the far lip so there's still a walk to the light,
      // not an instant finish the moment the swap completes
      this.targetPos.set(
        THREE.MathUtils.clamp(Math.min(this.shadowPos.x,HOLE_X1+1.5),b.x0+.6,b.x1-.6),0,
        THREE.MathUtils.clamp(this.shadowPos.z,b.z0+.6,b.z1-.6));
      velocity.set(0,0,0);
      // left standing the moment you start to go: the camera glides away from
      // it during the dolly, and again in the look-back later. Grounded at
      // y=0 (was .3) so its disc and ring actually lie on the floor (item 6)
      this.oldSelf.position.set(this.oldPos.x,0,this.oldPos.z);
      this.oldSelf.visible=true;
    }else{
      this._redT=t;
      // flash the near lip: the shadow, held over the hole, hasn't crossed
      if(this.shadowPos.x<=HOLE_X1) this._rimFlashNearT=t; else this._rimFlashFarT=t;
      // one veil dip AND one thud per refusal, not one per .4s retry
      // (round-5 review, item 12 — the thud used to fire every retry even
      // though the veil dip was already correctly de-duplicated)
      if(!this._holdRefused){ this._holdRefused=true; this.veilDipT=t; blip(95,.16,.09,'sine'); }
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
      // clamp two units shy of the region's own edge, not right at it
      // (round-5 review, item 8) — the far light sits close to b.x1, and
      // parking the shadow right on top of it muddled "where I'll land" with
      // "the goal". The last stretch of drag still reads: the stretch/rim
      // below track the unclamped s, so scrubbing past this point keeps
      // visibly doing something, and fadeLow only ever looks at the low
      // (west) side, so this tighter clamp doesn't fade the shadow out.
      this.shadowPos.set(THREE.MathUtils.clamp(rawX,b.x0,b.x1-2),0,THREE.MathUtils.clamp(rawZ,b.z0,b.z1));
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

    // ---- the veil: one continuous value out of update(), written every
    // frame — never a cache that can go stale against the eye button's own
    // direct write (round-5 review, item 3). A refusal dips it once (see
    // attemptSwap) and it eases back to whatever the eye button itself wants
    // (.87 held, 0 released) — holding through repeated .4s retries never
    // re-dips. While the look-back is actually PLAYING, the veil now falls
    // through to that same base instead of being pinned at .9 (round-5
    // review, item 2): the whole point of queuing the look-back until the
    // eye releases (above) is that the reveal is then seen, not hidden
    // behind a veil that a stale .9 would put right back up.
    if(insideMe&&!this.swapLock){
      const base=lookingBack?0:(S2.eyes?.87:0);
      const dipAge=t-this.veilDipT, dip=(dipAge>=0&&dipAge<.6)?(1-dipAge/.6)*.6:0;
      setVeilOp(this,Math.max(0,base-dip));
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
        // held at .9, same as the footsteps (round-5 review, item 3): .55
        // read as "felt, not blacked out" but sat below the .8 floor this
        // beat needs to guarantee against an early eye release leaking
        // daylight mid-dolly — the reveal is saved entirely for the
        // look-back that follows, once the eye actually lets go
        setVeilOp(this,.9);
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
          // a small step ahead, and off to the side (round-5 review, item
          // 5) — a big push in x (the old +3) buries it in the far light's
          // own glow, since the light sits at the landing x too; splitting
          // the offset across both axes keeps it a couple of units clear of
          // the light while still reading as "a little further on", not
          // "next to me"
          const ex=THREE.MathUtils.clamp(this.targetPos.x+1.2,b.x0+.6,b.x1-.6);
          const ez=THREE.MathUtils.clamp(this.targetPos.z+2.5,b.z0+.6,b.z1-.6);
          this.farEcho.position.set(ex,.02,ez);
          this.farEcho.visible=true;
        }
        this.farEcho.material.opacity=.55*(1-(el-1.4)/2);
      }else if(el>=3.4){
        this.farEcho.visible=false; this.lookBackT=-99;
      }
    }

    // ---- prompts: fallback only, after the player has been stuck a while ----
    if(insideMe&&!this.swapped&&!this.swapLock){
      // gated on being inside the region and the lamp untouched, not on
      // having already walked most of the way to the rim (round-5 review,
      // item 13) — a player who stops right at the entrance is exactly who
      // this fallback is for
      if(!this.lampTouched) this.rimIdleT+=dt; else this.rimIdleT=0;
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
    // this slice's x-domain only — the fence below reaches players standing
    // in a neighbouring region's own z (that IS the point: the exploit is
    // walking around outside these bounds, exactly where curRegion is
    // already something else), but never outside this x-domain.
    if(pos.x<b.x0||pos.x>b.x1) return;

    // the fence (round-5 review, item 4): a two-sided WALL on z at the
    // ledge's own rails, past the near lip's threshold — never a shove on
    // x. The previous shape pushed x back toward the near side whenever a
    // player was simply standing outside the z-corridor while past the
    // fence line — which meant walking parallel to a rail (east along z=8,
    // x climbing past 16.5) got shoved sideways by 8+ units into the
    // Corner's own territory the instant x crossed the line, and reaching
    // into a neighbour's bounds like that was itself the bug. This version
    // only ever fires the instant a rail is actually crossed, in either
    // direction, and only ever touches z. It still has to act regardless of
    // curRegion, for the same reason as before.
    if(pos.x>HOLE_X0-.5){
      const z0=b.z0+.3, z1=b.z1-.3;
      if(prevZ<z0&&pos.z>=z0){ pos.z=z0-.1; if(vel.z>0)vel.z*=-.2; this._railBump('n',z0); }
      else if(prevZ>z0&&pos.z<=z0){ pos.z=z0+.1; if(vel.z<0)vel.z*=-.2; this._railBump('n',z0); }
      else if(prevZ>z1&&pos.z<=z1){ pos.z=z1+.1; if(vel.z<0)vel.z*=-.2; this._railBump('s',z1); }
      else if(prevZ<z1&&pos.z>=z1){ pos.z=z1-.1; if(vel.z>0)vel.z*=-.2; this._railBump('s',z1); }
      else this._railFlag=false;
    }else this._railFlag=false;

    // everything below only ever touches the player once the core has
    // already decided they're standing in this region — the fence above is
    // the one exception, since it has to reach players who aren't
    if(curRegion!==this) return;

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
      targetX:+this.targetPos.x.toFixed(2), targetZ:+this.targetPos.z.toFixed(2),
      oldSelfVisible:this.oldSelf?this.oldSelf.visible:false,
      oldSelfY:this.oldSelf?+this.oldSelf.position.y.toFixed(2):null,
      oldEmissiveHex:this.oldCore?this.oldCore.material.emissive.getHex():null,
      echoVisible:this.farEcho?this.farEcho.visible:false,
      echoX:this.farEcho?+this.farEcho.position.x.toFixed(2):null,
      echoZ:this.farEcho?+this.farEcho.position.z.toFixed(2):null,
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
