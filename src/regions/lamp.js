import * as THREE from 'three';
import {registerRegion, world, playerPos, velocity, curRegion, renderer, camera,
        emitRipple, blip, slide, chime, pulseFlash, setPrompt, refreshHud, makeLight,
        saveGame, ease, audio, S2} from '../game.js';

// ---------------------------------------------------------------------------
// LOWER THE LAMP — a slit of black cuts the ledge in two. A lamp hangs on a
// line of light; drag it down and your shadow races across the gap you
// cannot walk over. Close your eyes at the right moment and you and your
// shadow trade places.
// ---------------------------------------------------------------------------
const LX=15, LZ=14;                 // the lamp's fixed footprint
const LY_MIN=.15, LY_MAX=6;
const CENTER_H=.26;                 // the player's centre height, once fully 3D
const HOLE_Z0=17, HOLE_Z1=22;       // the hole spans the region's full x range
const FAR_LIGHT=new THREE.Vector3(15,0,25);
const LAMP_COLOR=0xffcf6b, SHADOW_COLOR=0x58f5ff;

const raycaster=new THREE.Raycaster(), ndc=new THREE.Vector2();
const eyeBtnEl=()=>document.getElementById('eye');
const veilEl=()=>document.getElementById('veil');
const freqForY=y=>THREE.MathUtils.mapLinear(y,LY_MIN,LY_MAX,150,520);

const region=registerRegion({
  id:'lamp', name:'THE LAMP', color:LAMP_COLOR,
  bounds:{x0:4,x1:26,z0:11,z1:27},
  entrance:new THREE.Vector3(9,0,12.5),

  // ---- state ----
  lampY:LY_MAX, lampTouched:false,
  dragging:false, dragStartClientY:0, dragStartLampY:0, lastHumY:LY_MAX,
  shadowVisible:false, shadowPos:new THREE.Vector3(), lastS:1, _redT:-99,
  swapped:false, finished:false,
  eyeHoldT:0, attemptedThisHold:false,
  swapLock:false, swapT0:0, footIdx:-1, oldPos:new THREE.Vector3(), targetPos:new THREE.Vector3(),
  rimIdleT:0, eyeIdleT:0, promptKind:null,
  stepAccum:0, blockedFlag:false,

  build(){
    const {x0,x1}=this.bounds;
    // the hole: the universe grid does not show inside it
    const hole=new THREE.Mesh(new THREE.PlaneGeometry(x1-x0,HOLE_Z1-HOLE_Z0),
      new THREE.MeshBasicMaterial({color:0x000000}));
    hole.rotation.x=-Math.PI/2; hole.position.set((x0+x1)/2,.03,(HOLE_Z0+HOLE_Z1)/2);
    world.add(hole);
    // a luminous rim around it
    const rimMat=new THREE.MeshBasicMaterial({color:0xfff2c8,transparent:true,opacity:.85,blending:THREE.AdditiveBlending});
    const edgeN=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,.06,.16),rimMat.clone());
    edgeN.position.set((x0+x1)/2,.05,HOLE_Z0); world.add(edgeN);
    const edgeS=edgeN.clone(); edgeS.position.z=HOLE_Z1; world.add(edgeS);
    const edgeW=new THREE.Mesh(new THREE.BoxGeometry(.16,.06,HOLE_Z1-HOLE_Z0),rimMat.clone());
    edgeW.position.set(x0,.05,(HOLE_Z0+HOLE_Z1)/2); world.add(edgeW);
    const edgeE=edgeW.clone(); edgeE.position.x=x1; world.add(edgeE);

    // the lamp: an octahedron core on a vertical line of light from the sky
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,9,10),
      new THREE.MeshBasicMaterial({color:0xffdca0,transparent:true,opacity:.32,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    beam.position.set(LX,4.5,LZ); world.add(beam);
    const core=new THREE.Mesh(new THREE.OctahedronGeometry(.32,0),
      new THREE.MeshStandardMaterial({color:0xffffff,emissive:LAMP_COLOR,emissiveIntensity:4,roughness:.12}));
    core.scale.setScalar(1.4);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.52,.04,8,48),
      new THREE.MeshBasicMaterial({color:LAMP_COLOR,transparent:true,opacity:.6}));
    ring.rotation.x=Math.PI/2;
    const glow=new THREE.PointLight(LAMP_COLOR,26,12);
    const lampGroup=new THREE.Group(); lampGroup.add(core,ring,glow); world.add(lampGroup);
    const grab=new THREE.Mesh(new THREE.BoxGeometry(2.4,LY_MAX-LY_MIN+1.4,2.4),new THREE.MeshBasicMaterial({visible:false}));
    grab.position.set(LX,(LY_MAX+LY_MIN)/2,LZ); world.add(grab);

    // the shadow: a dark disc with a bright rim
    const disc=new THREE.Mesh(new THREE.CircleGeometry(1.05,40),
      new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.86}));
    disc.rotation.x=-Math.PI/2;
    const rim=new THREE.Mesh(new THREE.RingGeometry(.98,1.24,40),
      new THREE.MeshBasicMaterial({color:SHADOW_COLOR,transparent:true,opacity:.4,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
    rim.rotation.x=-Math.PI/2;
    const shadowGroup=new THREE.Group(); shadowGroup.add(disc,rim); shadowGroup.visible=false; world.add(shadowGroup);

    // beyond the hole: the goal
    const far=makeLight(FAR_LIGHT,LAMP_COLOR);

    Object.assign(this,{lampGroup,core,ring,glow,grab,shadowGroup,disc,rim,far});
  },

  onEnter(first){
    eyeBtnEl().style.display='grid';
    if(first) emitRipple(this.entrance.x,this.entrance.z,.8,new THREE.Color(LAMP_COLOR));
  },
  onLeave(){
    if(!S2.active) eyeBtnEl().style.display='none';
    if(this.promptKind){setPrompt('');this.promptKind=null;}
    this.rimIdleT=0; this.eyeIdleT=0; this.eyeHoldT=0; this.attemptedThisHold=false;
  },

  attemptSwap(t){
    if(this.shadowVisible && this.shadowPos.z>HOLE_Z1+.3 && this.shadowPos.z<=this.bounds.z1+1){
      this.swapLock=true; this.swapT0=t; this.footIdx=-1;
      this.oldPos.copy(playerPos);
      this.targetPos.set(
        THREE.MathUtils.clamp(this.shadowPos.x,this.bounds.x0+.6,this.bounds.x1-.6),0,
        THREE.MathUtils.clamp(this.shadowPos.z,HOLE_Z1+.6,this.bounds.z1-.6));
      velocity.set(0,0,0);
    }else{
      blip(95,.16,.09,'sine'); this._redT=t;
    }
  },

  update(dt,t){
    if(!this.lampGroup) return;
    const insideMe=curRegion===this;

    // ---- the lamp, its beam, the far light ----
    this.lampGroup.position.set(LX,this.lampY,LZ);
    this.lampGroup.rotation.y=t*.6; this.ring.rotation.z=t*.35;
    this.glow.position.y=0;
    if(this.far){
      this.far.rotation.y=t*.5; this.far.position.y=.5+.1*Math.sin(t*2.1);
    }
    if(!this.finished && insideMe && Math.hypot(playerPos.x-FAR_LIGHT.x,playerPos.z-FAR_LIGHT.z)<.9){
      this.finished=true; pulseFlash(); chime();
      emitRipple(FAR_LIGHT.x,FAR_LIGHT.z,1.6,new THREE.Color(LAMP_COLOR));
      refreshHud(); saveGame();
    }

    // ---- the shadow: S = L + s(P - L), s = L.y / (L.y - .26) ----
    if(!this.swapped){
      const Ly=this.lampY;
      if(Math.abs(Ly-CENTER_H)<.05){ this.shadowVisible=false; }
      else{
        let s=Ly/(Ly-CENTER_H); s=THREE.MathUtils.clamp(s,-40,40); this.lastS=s;
        this.shadowPos.set(LX+s*(playerPos.x-LX),0,LZ+s*(playerPos.z-LZ));
        this.shadowVisible=true;
      }
    }
    this.shadowGroup.visible=this.shadowVisible&&!this.swapped;
    if(this.shadowGroup.visible){
      this.shadowGroup.position.set(this.shadowPos.x,.03,this.shadowPos.z);
      const stretch=THREE.MathUtils.clamp(1+(Math.abs(this.lastS)-1)*.025,.9,1.6);
      this.shadowGroup.scale.setScalar(stretch);
      const prox=1-THREE.MathUtils.clamp(Math.abs(this.shadowPos.z-HOLE_Z1)/6,0,1);
      const red=t-this._redT<.2;
      this.disc.material.color.setHex(red?0xff3050:0x000000);
      this.rim.material.color.setHex(red?0xff3050:SHADOW_COLOR);
      this.rim.material.opacity=red?.8:.35+.55*prox;
    }

    // ---- footsteps: a ripple (and a quiet panned tick) where the shadow lands ----
    if(insideMe&&!this.swapLock){
      this.stepAccum+=velocity.length()*dt;
      if(this.stepAccum>.9){
        this.stepAccum=0;
        if(this.shadowGroup.visible){
          const pan=THREE.MathUtils.clamp((this.shadowPos.x-playerPos.x)/6,-1,1);
          emitRipple(this.shadowPos.x,this.shadowPos.z,.55,new THREE.Color(SHADOW_COLOR));
          blip(300,.05,.035,'sine',pan);
        }
      }
    }else this.stepAccum=0;

    // ---- the impossible moment: hold the eye ----
    if(insideMe&&!this.swapped&&!this.swapLock){
      if(S2.eyes){
        this.eyeHoldT+=dt;
        if(this.eyeHoldT>=.5&&!this.attemptedThisHold){ this.attemptedThisHold=true; this.attemptSwap(t); }
      }else{ this.eyeHoldT=0; this.attemptedThisHold=false; }
    }
    if(this.swapLock){
      veilEl().style.opacity='.95'; velocity.set(0,0,0);
      const dt2=t-this.swapT0;
      if(dt2<1.2){
        const idx=Math.min(2,Math.floor(dt2/.4));
        if(idx!==this.footIdx){ this.footIdx=idx; blip(210-idx*20,.16,.09,'sine',(idx-1)*.7); }
      }else if(dt2<1.55){
        const k=ease((dt2-1.2)/.35);
        playerPos.set(THREE.MathUtils.lerp(this.oldPos.x,this.targetPos.x,k),0,
                       THREE.MathUtils.lerp(this.oldPos.z,this.targetPos.z,k));
      }else{
        playerPos.set(this.targetPos.x,0,this.targetPos.z);
        this.swapLock=false; this.swapped=true;
        veilEl().style.opacity=S2.eyes?'.87':'0';
        pulseFlash(); chime();
        emitRipple(this.targetPos.x,this.targetPos.z,1.5,new THREE.Color(LAMP_COLOR));
        emitRipple(this.oldPos.x,this.oldPos.z,1.2,new THREE.Color(SHADOW_COLOR));
        if(this.promptKind){setPrompt('');this.promptKind=null;}
        refreshHud(); saveGame();
      }
    }

    // ---- prompts: fallback only, after the player has been stuck a while ----
    if(insideMe&&!this.swapped&&!this.swapLock){
      if(playerPos.z>15&&!this.lampTouched) this.rimIdleT+=dt; else this.rimIdleT=0;
      if(this.rimIdleT>8&&this.promptKind!=='pull'&&!this.lampTouched){ setPrompt('Pull the lamp down.'); this.promptKind='pull'; }
      if(this.lampTouched&&this.promptKind==='pull'){ setPrompt(''); this.promptKind=null; }
      const across=this.shadowGroup.visible&&this.shadowPos.z>HOLE_Z1+.3;
      if(across&&!S2.eyes) this.eyeIdleT+=dt; else this.eyeIdleT=0;
      if(this.eyeIdleT>8&&this.promptKind!=='close'){ setPrompt('Close your eyes.'); this.promptKind='close'; }
      if(S2.eyes&&this.promptKind==='close'){ setPrompt(''); this.promptKind=null; }
    }
  },

  constrain(prevX,prevZ,pos,vel){
    if(this.swapLock) return;
    if(pos.x<this.bounds.x0-.5||pos.x>this.bounds.x1+.5) return;
    // the rim is solid too: nothing between the lips is walkable
    if(pos.z>HOLE_Z0-.3&&pos.z<HOLE_Z1+.3){
      const fromNear=prevZ<=(HOLE_Z0+HOLE_Z1)/2;
      if(fromNear){ pos.z=Math.min(pos.z,HOLE_Z0-.3); if(vel.z>0)vel.z*=-.2; }
      else{ pos.z=Math.max(pos.z,HOLE_Z1+.3); if(vel.z<0)vel.z*=-.2; }
      if(!this.blockedFlag){
        this.blockedFlag=true; blip(95,.13,.08,'sine');
        emitRipple(pos.x,fromNear?HOLE_Z0-.3:HOLE_Z1+.3,.7);
      }
    }else this.blockedFlag=false;
  },

  hud(){ return {label:'SHADOW', n:this.swapped?1:0, total:1}; },
  done(){ return this.finished; },
  debug(){
    return {lampY:+this.lampY.toFixed(2), shadowX:+this.shadowPos.x.toFixed(2), shadowZ:+this.shadowPos.z.toFixed(2),
      shadowVisible:this.shadowGroup?this.shadowGroup.visible:false, swapped:this.swapped, finished:this.finished, swapLock:this.swapLock};
  },
  save(){ return {lampY:this.lampY, swapped:this.swapped, finished:this.finished}; },
  load(d){
    if(typeof d.lampY==='number') this.lampY=THREE.MathUtils.clamp(d.lampY,LY_MIN,LY_MAX);
    this.swapped=!!d.swapped; this.finished=!!d.finished;
    if(this.swapped) this.lampTouched=true;
  },
});

// ---- grab and drag the lamp along its line of light ----
renderer.domElement.addEventListener('pointerdown',e=>{
  if(!region.grab) return;
  ndc.set((e.clientX/innerWidth)*2-1,-(e.clientY/innerHeight)*2+1);
  raycaster.setFromCamera(ndc,camera);
  if(raycaster.intersectObject(region.grab).length>0){
    region.dragging=true; region.dragStartClientY=e.clientY; region.dragStartLampY=region.lampY; region.lastHumY=region.lampY;
    try{renderer.domElement.setPointerCapture(e.pointerId);}catch(_){}
    audio();
  }
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!region.dragging) return;
  const d=(e.clientY-region.dragStartClientY)/(innerHeight*.5);
  const ny=THREE.MathUtils.clamp(region.dragStartLampY-d*(LY_MAX-LY_MIN),LY_MIN,LY_MAX);
  if(Math.abs(ny-region.lampY)>1e-4){
    region.lampY=ny; region.lampTouched=true;
    if(Math.abs(ny-region.lastHumY)>.08){
      slide(freqForY(region.lastHumY),freqForY(ny),.14,.05); region.lastHumY=ny;
    }
  }
});
const endLampDrag=e=>{ if(region.dragging){ region.dragging=false; try{renderer.domElement.releasePointerCapture(e.pointerId);}catch(_){} } };
renderer.domElement.addEventListener('pointerup',endLampDrag);
renderer.domElement.addEventListener('pointercancel',endLampDrag);
