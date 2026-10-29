import * as THREE from './assets/vendor/three.module.js';
import { GLTFLoader } from './assets/vendor/GLTFLoader.js';
import { eventPose, TRACK_WIDTH, BALL_RADIUS } from './rules.mjs?v=20261029-chain3';
import { courseSample, COURSE_WORLD_PER_METER } from './course.mjs?v=20261029-chain3';

import { ENCOUNTER_ART_TYPES, createEncounterVisual, animateEncounterVisual } from './encounter-art.mjs?v=20261029-chain3';

const TAU = Math.PI * 2;
export const BALL_HEIGHT = BALL_RADIUS;
const HALF_WIDTH = TRACK_WIDTH / 2;
const COURSE_SEGMENTS = 144;
const COURSE_STEP = 8;
const MAX_EFFECTS = 48;
const THEMES = [0x64e8d6, 0xc29aff, 0xffb575, 0x9eff86];
const BALL_COLORS = [0xf6fbff,0x83ffe0,0xffda79,0xd4a1ff,0xffa3c0,0x9edcff];
const mat = (color, roughness = .5, metalness = .25) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const glow = (color, intensity = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: .35 });

export class OrbitScene {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
    this.renderer.setClearColor(0x090f26);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x090f26, .0024);
    this.camera = new THREE.PerspectiveCamera(47, 1, .1, 650);
    this.scene.add(new THREE.HemisphereLight(0xbfefff, 0x293150, 2.4));
    const sun = new THREE.DirectionalLight(0xffe4c5, 3.4); sun.position.set(-25, 40, 20); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x5ebdff, 2); rim.position.set(25, 5, -30); this.scene.add(rim);
    this.track = new THREE.Group(); this.scene.add(this.track);this.center=new THREE.Vector3();this.distantTracks=[];
    this.railMaterial = glow(THEMES[0], .9);
    this.buildTrack(); this.buildSpace();
    this.ball = new THREE.Group(); this.scene.add(this.ball);
    this.ballBody = new THREE.Mesh(new THREE.SphereGeometry(1.05, 22, 16), mat(0xf6fbff, .24, .25)); this.ball.add(this.ballBody);
    this.updateBallAppearance('standard',0);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(.78, 24), new THREE.MeshBasicMaterial({ color: 0x050e20, transparent: true, opacity: .6, depthWrite: false })); this.shadow.rotation.x = -Math.PI / 2; this.scene.add(this.shadow);
    this.trail = []; const trailGeometry = new THREE.SphereGeometry(.23, 8, 6);
    for (let i=0;i<16;i++) { const m = new THREE.Mesh(trailGeometry, new THREE.MeshBasicMaterial({color:0x81ffe2,transparent:true,opacity:0,depthWrite:false})); this.scene.add(m); this.trail.push(m); }
    this.effects = []; this.effectGeometry = new THREE.OctahedronGeometry(.14);this.hitAnimations=new Map();this.trailHistory=[];
    this.streakGeometry=new THREE.BufferGeometry();this.streakGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(36*6),3));
    this.streaks=new THREE.LineSegments(this.streakGeometry,new THREE.LineBasicMaterial({color:0xb9fff1,transparent:true,opacity:0,depthWrite:false}));this.streaks.frustumCulled=false;this.scene.add(this.streaks);
    this.ballLight=new THREE.PointLight(0x87ffe8,12,13,2);this.scene.add(this.ballLight);
    this.aimGuide=new THREE.Group();this.scene.add(this.aimGuide);const guideMaterial=glow(0xd4ff72,1.2);
    for(let i=0;i<7;i++)this.aimGuide.add(new THREE.Mesh(new THREE.SphereGeometry(.12+i*.012,8,6),guideMaterial));
    this.aimTip=new THREE.Mesh(new THREE.ConeGeometry(.3,.8,3),guideMaterial);this.aimGuide.add(this.aimTip);
    this.eventGroup = new THREE.Group(); this.scene.add(this.eventGroup); this.eventMeshes = new Map();
    this.models = {}; this.loader = new GLTFLoader(); this.abort = false;
    this.astronaut = this.fallbackAstronaut(); this.scene.add(this.astronaut);
    this.loadModels();
    this.previewEvents=[{id:'preview1',at:72,x:0,type:'bumper'},{id:'preview2',at:48,x:5,type:'coins'},{id:'preview-beast',at:100,x:1.7,type:'beast',radius:2.6,height:2.3,phase:.8,direction:1,skin:'hippo'},{id:'preview-cookie',at:174,x:-4,type:'cookie',radius:2.25,height:2.1,phase:0,direction:1},{id:'preview-alien',at:230,x:4,type:'giant-alien',radius:2.5,height:2.4,phase:1,direction:-1}];
    this.x = 0; this.distance = 0; this.lastTrack = -1; this.time = 0; this.impact = 0; this.frame = 0;
    this.look = new THREE.Vector3(); this.cameraTarget = new THREE.Vector3();
    this.resize();
  }
  resize() {
    const w=this.renderer.domElement.clientWidth,h=this.renderer.domElement.clientHeight;
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.mobile=w<650;
    this.camera.fov=this.mobile?70:60;this.camera.updateProjectionMatrix();
  }
  mesh(geometry, material, parent=this.track) { const m=new THREE.Mesh(geometry,material); parent.add(m); return m; }
  updateBallAppearance(requested='standard',level=0) {
    const trait=['heavy','elastic','spin'].includes(requested)?requested:'standard';
    if(this.ballTrait!==trait){
      if(this.ballMark){this.ballBody.remove(this.ballMark);this.disposeObject(this.ballMark);}
      // All surface marks are merged into one small mesh, follow the physics
      // quaternion, and never add their own time-based rotation or collision.
      const parts=[],ring=(radius,tube,rotation=0,angle=TAU,start=0)=>{
        const geometry=new THREE.TorusGeometry(radius,tube,5,angle===TAU?32:12,angle);
        geometry.rotateZ(start);if(rotation)geometry.rotateX(rotation);parts.push(geometry);
      };
      if(trait==='heavy'){ring(BALL_HEIGHT+.01,.09);ring(BALL_HEIGHT+.01,.09,Math.PI/2);}
      else if(trait==='elastic'){
        for(const rotation of[0,Math.PI/2])for(let i=0;i<4;i++)ring(BALL_HEIGHT+.016,.075,rotation,Math.PI*.36,i*Math.PI/2);
      }else if(trait==='spin'){
        const points=[];for(let i=0;i<=64;i++){const latitude=-1.22+i/64*2.44,angle=i/64*TAU*2.25,radius=BALL_HEIGHT+.025;points.push(new THREE.Vector3(Math.cos(latitude)*Math.cos(angle)*radius,Math.sin(latitude)*radius,Math.cos(latitude)*Math.sin(angle)*radius));}
        parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),64,.055,5,false));
      }else{ring(BALL_HEIGHT+.005,.055);ring(BALL_HEIGHT+.005,.055,Math.PI/2);}
      const positions=[],normals=[];
      for(const part of parts){const expanded=part.index?part.toNonIndexed():part;positions.push(...expanded.attributes.position.array);normals.push(...expanded.attributes.normal.array);if(expanded!==part)expanded.dispose();part.dispose();}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
      const color={standard:0x183c59,heavy:0x344352,elastic:0x176e59,spin:0x553889}[trait],material=mat(color,trait==='heavy'?.84:.4,trait==='heavy'?.72:.18);
      this.ballMark=new THREE.Mesh(geometry,material);this.ballMark.name=`ball-trait-${trait}`;this.ballMark.userData.trait=trait;this.ballBody.add(this.ballMark);this.ballTrait=trait;
    }
    if(this.ballLevel!==level||this.ballColorTrait!==trait){
      const color=new THREE.Color(BALL_COLORS[level]||BALL_COLORS[0]),tint={heavy:0x85919e,elastic:0xc4ffdf,spin:0xb7bbff}[trait];
      if(tint)color.lerp(new THREE.Color(tint),trait==='heavy'?.72:.55);
      this.ballColor=color;this.ballBody.material.color.copy(color);this.ballBody.material.roughness=trait==='heavy'?.8:trait==='elastic'?.34:.24;this.ballBody.material.metalness=trait==='heavy'?.62:.16;
      this.ballLevel=level;this.ballColorTrait=trait;
    }
    this.ballMark.material.emissive.copy(this.ballMark.material.color);this.ballMark.material.emissiveIntensity=trait==='heavy'?0:Math.min(.22,(this.impact||0)*(trait==='spin'?.2:.14));
  }
  buildTrack() {
    // Reuse a fixed ribbon and instanced panels as the forward corridor is generated.
    const geometry=new THREE.BufferGeometry(),positions=new Float32Array((COURSE_SEGMENTS+1)*2*3),indices=[];
    for(let i=0;i<COURSE_SEGMENTS;i++){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
    const floor=mat(0x315c6c,.66,.35);floor.side=THREE.DoubleSide;
    this.courseFloor=this.mesh(geometry,floor);this.courseFloor.name='continuous-course-floor';this.courseFloor.frustumCulled=false;
    this.courseRails=new THREE.InstancedMesh(new THREE.BoxGeometry(.4,.6,COURSE_STEP*COURSE_WORLD_PER_METER+.05),this.railMaterial,COURSE_SEGMENTS*2);this.courseRails.name='course-edge-rails';this.courseRails.frustumCulled=false;this.track.add(this.courseRails);
    this.guardMaterial=new THREE.MeshBasicMaterial({color:0x9dfff0,side:THREE.DoubleSide,transparent:true,opacity:.035,depthWrite:false});
    this.courseGuards=new THREE.InstancedMesh(new THREE.BoxGeometry(.035,8,COURSE_STEP*COURSE_WORLD_PER_METER),this.guardMaterial,COURSE_SEGMENTS*2);this.courseGuards.frustumCulled=false;this.track.add(this.courseGuards);
    this.courseRibs=new THREE.InstancedMesh(new THREE.BoxGeometry(TRACK_WIDTH-.45,.06,.12),mat(0x477d87,.7,.4),COURSE_SEGMENTS);this.courseRibs.name='transverse-floor-ribs';this.courseRibs.frustumCulled=false;this.track.add(this.courseRibs);
    this.courseSupports=new THREE.InstancedMesh(new THREE.BoxGeometry(TRACK_WIDTH+.8,1.2,.8),mat(0x14283d,.55,.65),Math.ceil(COURSE_SEGMENTS/4));this.courseSupports.frustumCulled=false;this.track.add(this.courseSupports);
    this.updateTrack(0);
  }
  updateTrack(distance) {
    if(!this.courseFloor)return;
    const start=Math.floor(distance/COURSE_STEP)*COURSE_STEP-96,origin=this.origin||{s:0,height:0,forward:0,lateral:0};
    if(this.courseStart===start){this.track.position.set(this.courseOriginLateral-origin.lateral,this.courseOriginHeight-origin.height,this.courseOriginForward-origin.forward);return;}
    this.courseStart=start;this.courseOrigin=origin.s;this.courseOriginHeight=origin.height;this.courseOriginForward=origin.forward;this.courseOriginLateral=origin.lateral;this.track.position.set(0,0,0);
    const vertices=this.courseFloor.geometry.attributes.position,instance=new THREE.Object3D();
    for(let i=0;i<=COURSE_SEGMENTS;i++) {
      const s=start+i*COURSE_STEP,p=this.position(s,0,-.025);
      vertices.setXYZ(i*2,p.x-HALF_WIDTH,p.y,p.z);vertices.setXYZ(i*2+1,p.x+HALF_WIDTH,p.y,p.z);
      if(i===COURSE_SEGMENTS)continue;
      const middle=s+COURSE_STEP/2,sample=this.sample(middle),pitch=-sample.pitch,edgeStart=this.position(s,0,.25),edgeEnd=this.position(s+COURSE_STEP,0,.25),edgeMid=edgeStart.clone().add(edgeEnd).multiplyScalar(.5),edgeLength=edgeStart.distanceTo(edgeEnd);
      for(const [side,x]of[-HALF_WIDTH,HALF_WIDTH].entries()) {
        instance.position.set(edgeMid.x-x,edgeMid.y,edgeMid.z);instance.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),edgeEnd.clone().sub(edgeStart).normalize());instance.scale.set(1,1,edgeLength/(COURSE_STEP*COURSE_WORLD_PER_METER));instance.updateMatrix();this.courseRails.setMatrixAt(i*2+side,instance.matrix);
        instance.position.copy(this.position(middle,x,4));instance.updateMatrix();this.courseGuards.setMatrixAt(i*2+side,instance.matrix);
      }
      instance.position.copy(this.position(s,0,.008));instance.rotation.set(-this.sample(s).pitch,0,0);instance.scale.set(1,1,1);instance.updateMatrix();this.courseRibs.setMatrixAt(i,instance.matrix);
      if(i%4===0){instance.position.copy(this.position(s,0,-.65));instance.updateMatrix();this.courseSupports.setMatrixAt(i/4,instance.matrix);}
    }
    vertices.needsUpdate=true;this.courseFloor.geometry.computeVertexNormals();
    for(const mesh of[this.courseRails,this.courseGuards,this.courseRibs,this.courseSupports])mesh.instanceMatrix.needsUpdate=true;
  }
  buildSpace() {
    const positions=[];let seed=3219;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<1300;i++){const a=random()*TAU,z=random()*2-1,r=130+random()*200;positions.push(Math.cos(a)*Math.sqrt(1-z*z)*r,z*r,Math.sin(a)*Math.sqrt(1-z*z)*r);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    this.stars=new THREE.Points(geo,new THREE.PointsMaterial({color:0xb8d8ff,size:.42,sizeAttenuation:true}));this.scene.add(this.stars);
    const planet=new THREE.Group();planet.position.set(-60,16,-85);this.scene.add(planet);
    this.mesh(new THREE.SphereGeometry(26,40,28),mat(0xc8794c,.95,0),planet);
    const bands=[[-9,24.2,.4],[-3,25.8,.6],[6,25.3,.3],[13,22.5,.4]];
    for(const [y,r,t] of bands){const band=this.mesh(new THREE.TorusGeometry(r,t,6,80),mat(0xe69b68,.9,0),planet);band.rotation.x=Math.PI/2;band.position.y=y;}
    const pr=this.mesh(new THREE.RingGeometry(32,42,100),new THREE.MeshBasicMaterial({color:0xa6adc6,side:THREE.DoubleSide,transparent:true,opacity:.22}),planet);pr.rotation.x=1.12;pr.rotation.y=.3;
    const moon=this.mesh(new THREE.IcosahedronGeometry(10,3),mat(0x597e9b,.9,0),this.scene);moon.position.set(65,30,-110);
    // Far scenery stays fixed in the chase frame, giving a quiet horizon reference.
    planet.position.set(-75,25,170);moon.position.set(72,48,230);
    this.saturn=planet;
  }
  fallbackAstronaut() {const g=new THREE.Group();const suit=mat(0xe3edf5);this.mesh(new THREE.CapsuleGeometry(.28,.45,4,10),suit,g).position.y=.6;const head=this.mesh(new THREE.SphereGeometry(.31,14,10),suit,g);head.position.y=1.15;const visor=this.mesh(new THREE.SphereGeometry(.245,14,10),mat(0x1c384c,.2,.6),g);visor.position.set(0,1.15,.16);g.scale.setScalar(1.5);return g;}
  async loadModels() {
    const names=['astronautA','alien','craft_speederA','meteor'];
    await Promise.allSettled(names.map(async name=>{
      const {scene}=await this.loader.loadAsync(`./assets/models/${name}.glb`);if(this.abort){this.disposeObject(scene);return;}
      const box=new THREE.Box3().setFromObject(scene),center=box.getCenter(new THREE.Vector3()); scene.position.sub(center);const wrapper=new THREE.Group();wrapper.add(scene);this.models[name]=wrapper;
      if(name==='astronautA'){this.scene.remove(this.astronaut);this.disposeObject(this.astronaut);this.astronaut=wrapper.clone();this.astronaut.scale.setScalar(2.7);this.scene.add(this.astronaut);this.pilotLevel=-1;}
      this.lastTrack=-1;
    }));
  }
  sample(distance) { return courseSample(distance,this.courseSeed??1); }
  worldPosition(distance,x,worldY) {
    const origin=this.origin||{height:0,forward:0};
    return new THREE.Vector3(-x,worldY-origin.height,distance*COURSE_WORLD_PER_METER-origin.forward);
  }
  readRunPose(run,mode) {
    if(mode==='paused'&&this.poseRun===run&&this.lastPose)return this.lastPose;
    const warped=this.lastWheel!==undefined&&this.lastWheel!==(run.wheel||0);
    const blend=mode==='rolling'&&!warped&&Number.isFinite(run.previousWorldY)?Math.max(0,Math.min(1,(run.accumulator||0)*120)):1;
    const mix=(a,b)=>Number.isFinite(a)?a+(b-a)*blend:b;
    const s=mix(run.previousS,run.s),x=mix(run.previousX,run.x);
    const currentY=Number.isFinite(run.worldY)?run.worldY:this.sample(run.s).height+BALL_HEIGHT+(run.height||0);
    const pose={s,x,worldY:mix(run.previousWorldY,currentY),blend};
    this.poseRun=run;this.lastPose=pose;return pose;
  }
  eventPosition(event,pose) {
    return Number.isFinite(pose.worldY)?this.worldPosition(pose.s,pose.x,pose.worldY-(event.height||1.05)):this.position(pose.s,pose.x,pose.height);
  }
  eventRenderPose(event,elapsed) {
    const pose=eventPose(event,elapsed),body=event.body;
    if(!body?.active||!Number.isFinite(body.previousWorldY))return pose;
    const blend=this.lastPose?.blend??1,mix=(before,now)=>Number.isFinite(before)?before+(now-before)*blend:now;
    const s=mix(body.previousS,pose.s),worldY=mix(body.previousWorldY,pose.worldY);
    return {...pose,s,x:mix(body.previousX,pose.x),worldY,centerS:s,centerY:worldY,
      rx:mix(body.previousRx,pose.rx),ry:mix(body.previousRy,pose.ry),rz:mix(body.previousRz,pose.rz)};
  }
  position(distance,x=0,height=.1) {
    const sample=this.sample(distance),origin=this.origin||{s:0,height:0,forward:0,lateral:0};
    return new THREE.Vector3(sample.lateral-origin.lateral-x,sample.height-origin.height+height*sample.normalY,sample.forward-origin.forward+height*sample.normalZ);
  }
  directionArrow(parent,color,size=1) {
    const shape=new THREE.Shape();shape.moveTo(-.16,-.5);shape.lineTo(.16,-.5);shape.lineTo(.16,.08);shape.lineTo(.42,.08);shape.lineTo(0,.55);shape.lineTo(-.42,.08);shape.lineTo(-.16,.08);shape.closePath();
    const arrow=this.mesh(new THREE.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:false}),glow(color,.55),parent);arrow.scale.setScalar(size);return arrow;
  }
  buildGuardian(visual,event,mechanism) {
    const width=event.width||TRACK_WIDTH,height=event.barrierHeight||10,halves=[],eyes=[];
    for(const sign of [-1,1]) {
      const half=new THREE.Group();half.name=sign<0?'guardian-left':'guardian-right';half.position.set(sign*width/4,height/2,0);visual.add(half);
      const armor=mat(0x61788c,.42,.65),edge=mat(0x253b52,.6,.7),accent=mat(0xba8745,.4,.7);
      const plate=this.mesh(new THREE.BoxGeometry(width/2-.05,height-.25,1.3),edge,half);plate.name='guardian-gate-panel';
      const chest=this.mesh(new THREE.BoxGeometry(width*.37,height*.54,1.1),armor,half);chest.position.set(-sign*.4,-.1,-.8);
      const arm=this.mesh(new THREE.BoxGeometry(width*.15,height*.47,2),armor,half);arm.position.set(sign*width*.16,-height*.13,-.6);arm.rotation.z=-sign*.08;
      const shoulder=this.mesh(new THREE.BoxGeometry(width*.2,height*.17,2.2),accent,half);shoulder.position.set(sign*width*.13,height*.28,-.4);
      const head=this.mesh(new THREE.BoxGeometry(width*.23,height*.22,1.8),armor,half);head.position.set(-sign*width*.13,height*.36,-.4);
      const eyeMaterial=glow(0xffbf58,1.5),eye=this.mesh(new THREE.BoxGeometry(width*.14,.3,.12),eyeMaterial,half);eye.name='guardian-eye';eye.position.set(-sign*width*.13,height*.37,-1.37);eyes.push(eyeMaterial);
      const brow=this.mesh(new THREE.BoxGeometry(width*.16,.35,1.95),edge,half);brow.position.set(-sign*width*.13,height*.42,-.45);brow.rotation.z=sign*.1;
      const foot=this.mesh(new THREE.BoxGeometry(width*.21,.6,2.4),accent,half);foot.position.set(sign*width*.08,-height*.46,-.2);
      for(let i=0;i<3;i++) {
        const crack=this.mesh(new THREE.BoxGeometry(.09,height*.2,.08),glow(0xffb74e,.75),half);crack.name='guardian-fracture';crack.position.set(-sign*(width*.2-.3)+(i%2)*sign*.18,-height*.25+i*height*.2,-1.38);crack.rotation.z=sign*(i%2?.4:-.25);
      }
      halves.push(half);
    }
    mechanism.guardian={halves,eyes,width,height};
  }
  buildGimmickMark(visual,event,r,h,mechanism) {
    const gimmick=event.gimmick||event.variant;if(!gimmick)return;
    const mark=new THREE.Group();mark.name='gimmick-mark';visual.add(mark);
    if(event.motion==='sweep') {
      const rail=this.mesh(new THREE.BoxGeometry(r*2,.12,.2),mat(0x86b9d0,.3,.65),mark);rail.position.set(0,.2,-r*.9);
      for(const sign of [-1,1]){const arrow=this.directionArrow(mark,0xb4edff,.6);arrow.rotation.z=sign*Math.PI/2;arrow.rotation.y=Math.PI;arrow.position.set(sign*r*.68,.42,-r*.98);}
    } else if(gimmick==='double-spring') {
      for(const sign of [-1,1]){const arrow=this.directionArrow(mark,0xa1efff,.6);arrow.rotation.y=Math.PI;arrow.position.set(sign*r*.7,h+1.35,-r*.9);}
    } else if(gimmick==='counter-spin') {
      const ring=this.mesh(new THREE.TorusGeometry(r*1.12,.08,5,24,Math.PI*1.6),glow(0xe0b6ff,.4),mark);ring.rotation.x=Math.PI/2;ring.position.y=h*.55;
    } else if(gimmick==='pinball') {
      for(const sign of [-1,1]){const pad=this.mesh(new THREE.BoxGeometry(.2,r*1.35,.4),mat(0xf0ce64,.3,.45),mark);pad.position.set(sign*r*.86,h,-r*.1);pad.rotation.z=sign*.4;}
    } else if(gimmick==='boost-ramp') {
      if(event.type==='boost')for(const sign of [-1,1]){const arrow=this.directionArrow(mark,0xb9ffd1,.6);arrow.rotation.x=Math.PI/2;arrow.position.set(sign*r*.75,.32,-.3);}
      else{const ring=this.mesh(new THREE.TorusGeometry(r*.98,.08,5,20),glow(0xb9ffd1,.35),mark);ring.rotation.x=Math.PI/2;ring.position.y=.14;}
    } else if(gimmick==='brake-gauntlet'&&event.type==='trap') {
      for(const sign of [-1,1]){const jaw=this.mesh(new THREE.BoxGeometry(.18,.8,r*1.8),mat(0xd478b5,.4,.35),mark);jaw.position.set(sign*r*.9,.5,0);}
    } else if(gimmick==='piston-bank') {
      for(const sign of [-1,1]){const arrow=this.directionArrow(mark,0xffd7a2,.6);arrow.rotation.x=Math.PI/2;arrow.position.set(sign*r*.75,h+.55,-r*.55);}
    }
    mechanism.gimmick=mark;
  }
  buildChallengeMark(visual,event,r,h) {
    const role=event.challengeRole;if(!['launcher','target'].includes(role))return null;
    const group=new THREE.Group();group.name=`challenge-${role}`;visual.add(group);
    const material=glow(role==='target'?0xffd45c:0xff945e,.24),add=(geometry,name)=>{const mesh=this.mesh(geometry,material,group);mesh.name=name;return mesh;};
    if(role==='launcher'){
      const ring=add(new THREE.TorusGeometry(r+.22,.09,5,32,TAU*.84),'launcher-aim-ring');ring.position.set(0,h,-r*.94);ring.rotation.z=TAU*.08;
      for(let i=0;i<4;i++){const a=i*Math.PI/2,tick=add(new THREE.BoxGeometry(.15,.42,.15),'launcher-aim-tick');tick.position.set(Math.sin(a)*(r+.25),h+Math.cos(a)*(r+.25),-r*.94);tick.rotation.z=-a;}
    }else{
      const base=add(new THREE.TorusGeometry(r+.3,.1,5,32),'target-floor-ring');base.rotation.x=-Math.PI/2;base.position.y=.12;
      // Bowling targets sit behind the hippo. Lift only their sight marks above
      // its head while the thin stem still points to the actual bumper below.
      const top=event.challengeId==='bowling'?Math.max(h+r+.9,6.9):h+r+.9,stem=top-h-.15;
      const pole=add(new THREE.CylinderGeometry(.065,.065,stem,6),'target-pin');pole.position.set(0,h+stem/2,0);
      const ring=add(new THREE.TorusGeometry(.62,.11,5,24),'target-bullseye');ring.position.set(0,top,-.09);
      const dot=add(new THREE.SphereGeometry(.18,8,5),'target-bullseye-dot');dot.position.set(0,top,-.09);
      const check=new THREE.Group();check.name='target-complete-check';check.position.set(0,top,-.09);check.visible=false;group.add(check);
      for(const[width,x,y,angle]of[[.5,-.21,-.03,-.7],[.9,.2,.1,.8]]){const stroke=new THREE.Mesh(new THREE.BoxGeometry(width,.16,.16),material);stroke.position.set(x,y,0);stroke.rotation.z=angle;check.add(stroke);}
      group.userData={material,base,ring,dot,check};
    }
    group.userData.material=material;group.userData.role=role;group.userData.success=false;return group;
  }
  updateChallengeMark(mesh,run,active) {
    const {event,mechanism}=mesh.userData,mark=mechanism.challenge;if(!mark)return;
    mark.visible=Boolean(active&&run.challenge&&run.challenge.id===event.challengeId);
    const success=mark.visible&&mark.userData.role==='target'&&Array.isArray(run.challenge.hitTargetIds)&&run.challenge.hitTargetIds.includes(event.id);
    if(mark.userData.success===success)return;
    mark.userData.success=success;const {material,base,ring,dot,check}=mark.userData;
    material.color.setHex(success?0x83ffd2:mark.userData.role==='target'?0xffd45c:0xff945e);material.emissive.copy(material.color);material.emissiveIntensity=success?.42:.24;
    if(check){check.visible=success;ring.visible=!success;dot.visible=!success;base.scale.setScalar(success?1.07:1);}
  }
  createEvent(event) {
    const g=new THREE.Group(),visual=new THREE.Group(),type=event.type,r=event.radius||.95,h=event.height||1.05,mechanism={};g.add(visual);
    const useModel=(name,scale)=>{if(!this.models[name])return false;const m=this.models[name].clone(true);m.scale.setScalar(scale);m.position.y=h;visual.add(m);return true;};
    const eyes=(y,z,spread=.35)=>{for(const sign of [-1,1]){const eye=this.mesh(new THREE.SphereGeometry(.25,12,8),mat(0xffffff,.35,0),visual);eye.position.set(sign*spread,y,z);const pupil=this.mesh(new THREE.SphereGeometry(.115,10,8),mat(0x111c35,.3,0),visual);pupil.position.set(sign*spread,y-.025,z-.2);}};
    if(ENCOUNTER_ART_TYPES.includes(type)) {
      const art=createEncounterVisual(event);visual.add(art);mechanism.encounter=art;
    } else if(type==='guardian') {
      this.buildGuardian(visual,event,mechanism);
    } else if(type==='bumper') {
      const body=this.mesh(new THREE.SphereGeometry(r*.88,16,12),mat(0xf8b93b,.28,.35),visual);body.name='elastic-shield';body.position.y=h;body.scale.z=.8;
      const belt=this.mesh(new THREE.TorusGeometry(r*.9,.19,7,24),mat(0x182b42,.8,.1),visual);belt.name='rubber-ring';belt.position.set(0,h,-r*.3);
      const face=this.mesh(new THREE.CylinderGeometry(r*.64,r*.75,.22,16),glow(0xffd66b,.32),visual);face.rotation.x=Math.PI/2;face.position.set(0,h,-r*.73);
      for(const sign of [-1,1]){const rib=this.mesh(new THREE.BoxGeometry(.14,r*.8,.12),mat(0x26394a),visual);rib.position.set(sign*r*.48,h,-r*.77);rib.rotation.z=sign*.35;}
      const base=this.mesh(new THREE.CylinderGeometry(r*.82,r,.2,16),mat(0x4b6176,.5,.65),visual);base.position.y=.12;
      mechanism.rubber=belt;
    } else if(type==='spring') {
      const points=[];for(let i=0;i<=48;i++){const a=i/48*TAU*3;points.push(new THREE.Vector3(Math.cos(a)*r*.57,.15+i/48*1.15,Math.sin(a)*r*.57));}
      const coil=this.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),48,.11,6,false),mat(0x80e4ff,.25,.75),visual);coil.name='compression-coil';
      const cap=this.mesh(new THREE.TorusGeometry(r*.78,.11,6,20),mat(0x80d8ef,.3,.65),visual);cap.name='jump-platform';cap.rotation.x=Math.PI/2;cap.position.y=1.42;
      const up=this.directionArrow(visual,0xf2ffff,1.5);up.name='up-arrow';up.position.set(0,1.94,-r*.9);up.rotation.y=Math.PI;
      const base=this.mesh(new THREE.CylinderGeometry(r,r,.17,16),mat(0x214e6e),visual);base.position.y=.1;
      mechanism.coil=coil;mechanism.cap=cap;
    } else if(type==='punch') {
      const housing=this.mesh(new THREE.BoxGeometry(r*1.6,r*1.15,r*.68),mat(0xb95525,.35,.5),visual);housing.name='piston-housing';housing.position.set(0,h,-r*.3);
      const piston=new THREE.Group();piston.name='forward-piston';piston.position.set(0,h,0);visual.add(piston);
      const rod=this.mesh(new THREE.CylinderGeometry(r*.27,r*.27,r*1.1,10),mat(0xbbd5d9,.24,.8),piston);rod.rotation.x=Math.PI/2;
      const head=this.mesh(new THREE.BoxGeometry(r*1.7,r*1.12,.28),mat(0xff983e,.25,.4),piston);head.position.z=r*.62;
      for(const sign of [-1,1]){const arrow=this.directionArrow(visual,0xffefb2,.82);arrow.name='forward-arrow';arrow.rotation.x=Math.PI/2;arrow.position.set(sign*r*.43,h+r*.62,-.12);}
      this.mesh(new THREE.BoxGeometry(r*1.8,.2,r*1.6),mat(0x3c4657),visual).position.y=.12;
      mechanism.piston=piston;
    } else if(type==='coins') {
      for(let i=0;i<3;i++){const m=this.mesh(new THREE.TorusGeometry(.36,.11,7,16),glow(0xffcf65,.8),visual);m.position.set(0,.9,-.7+i*.7);m.rotation.y=Math.PI/2;}
    } else if(type==='boost') {
      const pad=this.mesh(new THREE.BoxGeometry(2,.22,2.6),mat(0x185742,.45,.4),visual);pad.name='acceleration-pad';pad.position.y=.12;
      for(let i=0;i<3;i++){const arrow=this.directionArrow(visual,0x9dffb3,.8);arrow.name='forward-arrow';arrow.rotation.x=Math.PI/2;arrow.position.set(0,.28,(i-1)*.7);}
      for(const sign of [-1,1])this.mesh(new THREE.BoxGeometry(.13,.15,2.6),glow(0x79edac,.5),visual).position.set(sign*.98,.2,0);
    } else if(type==='trap') {
      const jelly=this.mesh(new THREE.SphereGeometry(r,16,10),new THREE.MeshStandardMaterial({color:0xdc59ad,roughness:.22,metalness:.05,transparent:true,opacity:.88}),visual);jelly.name='sticky-brake';jelly.scale.set(1,.42,1.15);jelly.position.y=.38;
      const plate=this.mesh(new THREE.BoxGeometry(r*2.12,.14,r*2.25),mat(0x5a254f),visual);plate.position.y=.1;
      for(let i=0;i<3;i++){const band=this.mesh(new THREE.BoxGeometry(r*1.75,.1,.19),glow(0xffb3dc,.25),visual);band.name='brake-bar';band.position.set(0,.64,(i-1)*r*.5);}
      for(const sign of [-1,1]){const jaw=this.mesh(new THREE.BoxGeometry(.16,.45,r*1.5),mat(0x873a73),visual);jaw.name='brake-jaw';jaw.position.set(sign*r*.95,.35,0);}
      mechanism.jelly=jelly;
    } else if(type==='hole') {
      this.mesh(new THREE.CylinderGeometry(.85,.85,.05,28),new THREE.MeshBasicMaterial({color:0x020813}),visual).position.y=.06;
      const ring=this.mesh(new THREE.TorusGeometry(.88,.13,7,32),glow(0xd6ff7b,1.4),visual);ring.rotation.x=Math.PI/2;ring.position.y=.1;
      this.mesh(new THREE.CylinderGeometry(.04,.04,2.5,7),mat(0xf0f6e4),visual).position.set(1,1.25,0);
      this.mesh(new THREE.BoxGeometry(.95,.5,.05),glow(0xd5ff7c,.3),visual).position.set(1.45,2.2,0);
    } else if(type==='ufo') {
      const ring=this.mesh(new THREE.TorusGeometry(1.1,.13,7,24),glow(0x8ef0ff,1.1),visual);ring.position.y=1;
      if(this.models.craft_speederA){const craft=this.models.craft_speederA.clone(true);craft.scale.setScalar(1.3);craft.position.y=2.25;visual.add(craft);}
      else{this.mesh(new THREE.CylinderGeometry(1.15,.85,.28,20),mat(0x8fb2b9,.25,.7),visual).position.y=2;this.mesh(new THREE.SphereGeometry(.6,14,10,0,TAU,0,Math.PI/2),glow(0x8dffe1,.45),visual).position.y=2.15;}
      const beam=this.mesh(new THREE.ConeGeometry(.95,1.8,16,1,true),new THREE.MeshBasicMaterial({color:0x79ffe6,transparent:true,opacity:.2,side:THREE.DoubleSide,depthWrite:false}),visual);beam.position.y=.95;
    } else if(type==='comet') {
      if(!useModel('meteor',3.1))this.mesh(new THREE.IcosahedronGeometry(r,1),mat(0xb49e86),visual).position.y=h;
      const facet=this.mesh(new THREE.IcosahedronGeometry(r*.83,0),mat(0x91aabc,.2,.85),visual);facet.name='reflection-facet';facet.position.set(0,h,-r*.35);facet.rotation.z=.35;
      const tail=this.mesh(new THREE.ConeGeometry(.32,1.5,6),glow(0xff8c64,.6),visual);tail.position.set(0,h+.68,.55);tail.rotation.x=.65;
      const rim=this.mesh(new THREE.TorusGeometry(r*.73,.075,5,12,Math.PI*1.35),glow(0xff9871,.45),visual);rim.name='reflection-rim';rim.position.set(0,h,-r*.64);
    } else if(type==='alien') {
      if(!useModel('alien',2.15)){this.mesh(new THREE.SphereGeometry(.5,12,8),mat(0xb0dd7a),visual).position.y=h;eyes(h+.1,-.43,.25);}
      const rotor=new THREE.Group();rotor.name='spin-rotor';rotor.position.y=h;visual.add(rotor);
      const ring=this.mesh(new THREE.TorusGeometry(r*.93,.12,6,24),glow(0xaf8dff,.5),rotor);ring.rotation.x=Math.PI/2;
      const direction=event.direction||1;
      for(let i=0;i<3;i++){const angle=i/3*TAU,fin=this.directionArrow(rotor,0xd4c4ff,.66);fin.name='spin-vane';fin.rotation.x=Math.PI/2;fin.rotation.z=angle+(direction<0?Math.PI:0);fin.position.set(Math.cos(angle)*r*.8,.12,Math.sin(angle)*r*.8);}
      const base=this.mesh(new THREE.CylinderGeometry(r*.6,r*.8,.3,12),mat(0x4d3e77),visual);base.position.y=.22;
      const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,.4,-r*.9),new THREE.Vector3(0,.4,r*.2),new THREE.Vector3(-direction*r*.72,.4,r*.65));
      const guide=this.mesh(new THREE.TubeGeometry(curve,12,.12,5,false),glow(0xd4c4ff,.35),visual);guide.name='curve-guide';
      const tip=this.mesh(new THREE.ConeGeometry(.24,.55,3),glow(0xd4c4ff,.35),visual);tip.name='curve-tip';tip.position.copy(curve.getPoint(1));tip.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),curve.getTangent(1));
      mechanism.rotor=rotor;
    }
    if(type!=='guardian')this.buildGimmickMark(visual,event,r,h,mechanism);
    mechanism.challenge=this.buildChallengeMark(visual,event,r,h);
    // Rotate every flying object about its collider center, never its old floor anchor.
    for(const child of visual.children)child.position.y-=h;
    visual.position.y=h;
    if(mechanism.cap)mechanism.capRest=mechanism.cap.position.y;
    const pose=eventPose(event,0);g.position.copy(this.eventPosition(event,pose));g.rotation.x=Number.isFinite(pose.worldY)?0:-this.sample(pose.s).pitch;
    const cue=this.createCue(type,r);cue.position.y=h;g.add(cue);
    g.userData={type,event,visual,centerHeight:h,cue,mechanism};return g;
  }
  createCue(type,radius=1) {
    const cue=new THREE.Group();cue.visible=false;
    if(!['bumper','spring','punch','alien','trap','boost'].includes(type)){cue.userData={kind:'',material:null};return cue;}
    const colors={bumper:0x79e3d4,spring:0xa8dfed,punch:0xf6be83,alien:0xb4a7ed,comet:0xb9a58e,trap:0x9794c9,boost:0x9adeb0};
    const material=new THREE.MeshBasicMaterial({color:colors[type]||0xc6d6df,transparent:true,opacity:0,depthWrite:false});
    const add=geometry=>this.mesh(geometry,material,cue);
    let kind='';
    if(type==='bumper') {kind='impulse';add(new THREE.TorusGeometry(radius*1.04,.11,6,24));}
    else if(type==='spring') {kind='lift';add(new THREE.TorusGeometry(radius*.8,.1,6,24)).rotation.x=Math.PI/2;}
    else if(type==='punch'||type==='boost') {
      kind='thrust';
      for(const x of [-.48,0,.48]){const line=add(new THREE.BoxGeometry(.11,.11,1.7));line.position.x=x;}
      const tip=add(new THREE.ConeGeometry(.24,.6,5));tip.rotation.x=Math.PI/2;tip.position.z=1.1;
    } else if(type==='alien') {
      kind='spin';const points=[];
      for(let i=0;i<=40;i++){const angle=i/40*TAU*1.5;points.push(new THREE.Vector3(Math.cos(angle)*(radius+.18),(i/40-.5)*1.3,Math.sin(angle)*(radius+.18)));}
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),40,.09,5,false));
    } else if(type==='trap') {kind='damping';for(const z of [-.45,0,.45]){const bar=add(new THREE.BoxGeometry(radius*2,.11,.18));bar.position.z=z;}}
    cue.userData={kind,material};return cue;
  }
  syncEvents(events,track) {
    if(this.lastTrack===track&&this.lastEvents===events)return;
    const rebuild=this.lastTrack===-1,incoming=new Map(events.map(event=>[event.id,event]));this.lastTrack=track;this.lastEvents=events;
    for(const [id,mesh] of this.eventMeshes)if(rebuild||incoming.get(id)!==mesh.userData.event){this.eventGroup.remove(mesh);this.disposeObject(mesh,true);this.eventMeshes.delete(id);}
    for(const event of events)if(!this.eventMeshes.has(event.id)){const mesh=this.createEvent(event);this.eventGroup.add(mesh);this.eventMeshes.set(event.id,mesh);}
    const c=THEMES[((track%THEMES.length)+THEMES.length)%THEMES.length];this.railMaterial.color.setHex(c);this.railMaterial.emissive.setHex(c);
  }
  fadeObstacle(visual,occluded) {
    let state=visual.userData.cameraFade;
    if(!state&&!occluded)return;
    if(!state){
      const clones=new Map(),records=[],originals=new Map();
      const clone=material=>{if(!clones.has(material))clones.set(material,material.clone());return clones.get(material);};
      visual.traverse(mesh=>{
        if(!mesh.material)return;
        const original=mesh.material,faded=Array.isArray(original)?original.map(clone):clone(original);
        records.push({mesh,original,faded});originals.set(mesh,original);
      });
      state={records,originals,clones:[...clones.values()],active:false};visual.userData.cameraFade=state;
    }
    for(const record of state.records){
      if(occluded){
        const sources=Array.isArray(record.original)?record.original:[record.original],faded=Array.isArray(record.faded)?record.faded:[record.faded];
        for(let i=0;i<sources.length;i++){
          // Keep material animation on its original references; only this event's
          // render bindings become transparent, including shared GLTF materials.
          faded[i].copy(sources[i]);faded[i].transparent=true;faded[i].opacity=sources[i].opacity*.14;faded[i].depthWrite=false;
        }
        record.mesh.material=record.faded;
      }else record.mesh.material=record.original;
    }
    state.active=occluded;
  }
  updateCameraOcclusion(active) {
    this.occlusionRay??=new THREE.Raycaster();this.occlusionReverseRay??=new THREE.Raycaster();this.occlusionDirection??=new THREE.Vector3();this.occlusionCenter??=new THREE.Vector3();this.occlusionClosest??=new THREE.Vector3();this.occlusionOffset??=new THREE.Vector3();
    const direction=this.occlusionDirection.copy(this.ball.position).sub(this.camera.position),length=direction.length();
    direction.multiplyScalar(1/Math.max(.001,length));this.occlusionRay.set(this.camera.position,direction);this.occlusionRay.far=Math.max(0,length-BALL_HEIGHT);
    this.occlusionReverseRay.set(this.ball.position,direction);this.occlusionReverseRay.ray.direction.negate();this.occlusionReverseRay.near=BALL_HEIGHT;this.occlusionReverseRay.far=length;
    this.eventGroup.updateMatrixWorld(true);
    for(const mesh of this.eventMeshes.values()){
      const {visual,event,centerHeight}=mesh.userData;let occluded=false;
      if(active&&mesh.visible&&visual.visible&&length>BALL_HEIGHT){
        visual.getWorldPosition(this.occlusionCenter);
        const along=this.occlusionOffset.copy(this.occlusionCenter).sub(this.camera.position).dot(direction),radius=Math.max(event.radius||1,centerHeight||1)*2;
        this.occlusionClosest.copy(this.camera.position).addScaledVector(direction,Math.max(0,Math.min(length,along)));
        if(along>-radius&&along<length+radius&&this.occlusionCenter.distanceToSquared(this.occlusionClosest)<radius*radius){
          const originals=visual.userData.cameraFade?.originals;
          const blocks=hit=>{
            for(let node=hit.object;node;node=node.parent){if(!node.visible)return false;if(node===visual)break;}
            const material=originals?.get(hit.object)||hit.object.material,faceMaterial=Array.isArray(material)?material[hit.face?.materialIndex||0]:material;
            return faceMaterial?.visible!==false&&(faceMaterial?.opacity??1)>.04;
          };
          // A front-sided mesh may surround the camera. The reverse segment
          // catches its entrance face without changing the art's material side.
          occluded=this.occlusionRay.intersectObject(visual,true).some(blocks)||this.occlusionReverseRay.intersectObject(visual,true).some(blocks);
        }
      }
      this.fadeObstacle(visual,occluded);
    }
  }
  releaseCameraFades(object) {
    object.traverse(node=>{
      const state=node.userData?.cameraFade;if(!state)return;
      for(const record of state.records)record.mesh.material=record.original;
      for(const material of state.clones)material.dispose();delete node.userData.cameraFade;
    });
  }
  burst(feedback={type:'shot',strength:1}) {
    if(typeof feedback==='string')feedback={type:feedback==='bad'?'comet':'shot',strength:1};
    const strength=Math.min(1.5,Math.max(.2,feedback.strength||1)),chain=feedback.kind==='chain';
    this.impact=Math.max(this.impact||0,strength*(chain?.08:.3));if(!chain&&['bounce','landing','hazard','guardian-block','guardian-break'].includes(feedback.kind))this.squash=Math.max(this.squash||0,strength*.4);
    if(feedback.type==='rail')this.railPulse=1;
    const duration=Math.max(.45,Math.min(1.8,feedback.kind==='guardian-break'?1.6:feedback.effectDuration||.65));
    this.hitAnimations||=new Map();if(feedback.eventId)this.hitAnimations.set(feedback.eventId,{life:duration,total:duration,type:feedback.type,kind:feedback.kind,strength,effect:feedback.effect,direction:feedback.effectDirection,powered:feedback.kind!=='chain'&&feedback.powered!==false});
    const event=this.eventMeshes?.get(feedback.eventId)?.userData.event,pose=event?eventPose(event,this.runElapsed||0):null;
    const distance=feedback.type==='guardian'&&Number.isFinite(feedback.s)?feedback.s:pose?.s??(Number.isFinite(feedback.s)?feedback.s:this.distance||0),sample=this.sample(distance);
    const recordedContact=Number.isFinite(feedback.contactS)&&Number.isFinite(feedback.contactX)&&Number.isFinite(feedback.contactY);
    const origin=feedback.type==='guardian'?this.position(distance,feedback.x||0,BALL_HEIGHT+(feedback.height||0)):recordedContact?this.worldPosition(feedback.contactS,feedback.contactX,feedback.contactY):pose?(Number.isFinite(pose.worldY)?this.worldPosition(pose.s,pose.x,pose.worldY):this.position(pose.s,pose.x,pose.height+(event.height||1.05))):
      Number.isFinite(feedback.s)?this.worldPosition(distance,feedback.x||0,Number.isFinite(feedback.worldY)?feedback.worldY:this.sample(distance).height+BALL_HEIGHT+(feedback.height||0)):this.ball.position.clone();
    const color=feedback.type==='anvil'?0xffb96b:feedback.type==='cookie'?0xdba965:feedback.type==='guardian'?0xe4b86e:feedback.type==='comet'?0xbba58d:0xc4d8df;
    const inward=new THREE.Vector3(0,sample.normalY,sample.normalZ),forward=new THREE.Vector3(sample.tangentX,sample.tangentY,sample.tangentZ);
    this.effectGeometry||=new THREE.OctahedronGeometry(.14);this.effects||=[];
    const cookieBreak=feedback.kind==='cookie-break',guardianBreak=feedback.kind==='guardian-break',count=feedback.type==='anvil'&&feedback.kind==='hazard'?5:cookieBreak?8:guardianBreak?14:feedback.kind==='guardian-block'?5:feedback.type==='comet'?6:feedback.type==='landing'?4:feedback.type==='shot'?6:feedback.type==='rail'?3:0;
    for(let i=0;i<count;i++) {
      const scale=guardianBreak?2.4:feedback.type==='comet'?1:.55,life=guardianBreak?.85:.45,opacity=guardianBreak?.95:.7;
      const material=guardianBreak?new THREE.MeshStandardMaterial({color:i%4===0?0xba8745:0x738b9c,roughness:.42,metalness:.65,transparent:true,opacity,depthWrite:false}):new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false});
      const mesh=new THREE.Mesh(this.effectGeometry,material);mesh.position.copy(origin);mesh.scale.setScalar(scale);if(guardianBreak)mesh.rotation.set(Math.random()*TAU,Math.random()*TAU,Math.random()*TAU);this.scene.add(mesh);
      const velocity=inward.clone().multiplyScalar(1+Math.random()*3*strength).addScaledVector(forward,(Math.random()-.5)*5*strength);velocity.x=(Math.random()-.5)*6*strength;
      this.effects.push({mesh,life,total:life,v:velocity,gravity:new THREE.Vector3(0,-10,0),opacity,scale,spin:guardianBreak?new THREE.Vector3(3+i*.2,2,4-i*.15):null});
    }
    while(this.effects.length>MAX_EFFECTS){const effect=this.effects.shift();this.scene.remove(effect.mesh);effect.mesh.material.dispose();}
  }
  animateEvents(dt,run,active) {
    this.hitAnimations||=new Map();
    for(const [id,hit] of this.hitAnimations){hit.life-=dt;if(hit.life<=0)this.hitAnimations.delete(id);}
    for(const mesh of this.eventMeshes.values()) {
      const {event,visual,type,centerHeight,cue,mechanism}=mesh.userData,hit=this.hitAnimations.get(event.id),pose=this.eventRenderPose(event,active?run.elapsed:this.time),ahead=pose.s-this.distance;
      this.updateChallengeMark(mesh,run,active);
      const flying=Boolean(event.body?.active),sameWheel=!active||!event.body||event.body.wheel===run.wheel;
      mesh.visible=sameWheel&&(type==='guardian'||type==='tar'||flying||!event.used||Boolean(hit)&&!event.body)&&(!active||(ahead>-65&&ahead<190));
      mesh.position.copy(this.eventPosition(event,pose));mesh.rotation.x=Number.isFinite(pose.worldY)?0:-this.sample(pose.s).pitch;
      visual.position.set(0,centerHeight,0);visual.rotation.set(pose.rx||0,pose.ry||0,pose.rz||0);visual.scale.setScalar(1);
      cue.visible=Boolean(hit?.powered)&&Boolean(cue.userData.kind);cue.position.set(0,centerHeight,0);cue.rotation.set(0,0,0);cue.scale.setScalar(1);
      if(cue.userData.material)cue.userData.material.opacity=0;
      if(mechanism.encounter)animateEncounterVisual(mechanism.encounter,event,active?run.elapsed:this.time,hit,dt);
      if(mechanism.guardian) {
        const guardian=mechanism.guardian,broken=Boolean(event.broken),progress=broken&&hit?.kind==='guardian-break'?1-hit.life/hit.total:1;
        const recoil=!broken&&hit?.kind==='guardian-block'?Math.sin((1-hit.life/hit.total)*Math.PI):0;
        guardian.halves.forEach((half,index)=>{
          const sign=index===0?-1:1;
          if(broken){half.position.set(sign*(guardian.width/2+6.5+progress*1.1),-centerHeight+1.3+(1-progress)*1.4,0);half.rotation.set(0,sign*.15,sign*(.35+progress*.8));half.scale.set(1,.25-progress*.03,1);}
          else{half.position.set(sign*guardian.width/4,guardian.height/2-centerHeight,-recoil*.24);half.rotation.set(0,0,0);half.scale.set(1,1,1+recoil*.05);}
        });
        guardian.eyes.forEach(material=>{material.emissiveIntensity=broken?.08:1.5+recoil*.8;});
        continue;
      }
      const wobble=Math.sin(this.time*3+event.at);
      if(mechanism.rotor)mechanism.rotor.rotation.y=flying?0:-this.time*(this.reducedMotion?.8:2.4)*(event.direction||1);
      if(mechanism.piston)mechanism.piston.position.z=flying?0:Math.sin(this.time*3+event.at)*.1;
      if(mechanism.coil){const compression=flying?1:.85+Math.sin(this.time*3+event.at)*.14;mechanism.coil.scale.y=compression;mechanism.cap.position.y=mechanism.capRest-(1-compression)*1.15;}
      if(mechanism.rubber)mechanism.rubber.scale.setScalar(flying?1:1+Math.sin(this.time*3+event.at)*.035);
      if(!flying){
        if(type==='ufo')visual.rotation.y+=this.time*.6;
        else if(type==='trap')visual.scale.set(1+wobble*.08,1-wobble*.12,1);
        else if(type==='coins')visual.rotation.y+=this.time*2;
      }
      if(!hit)continue;
      const progress=1-hit.life/hit.total,pulse=Math.sin(progress*Math.PI);
      const cueKind=cue.userData.kind;if(cue.userData.material)cue.userData.material.opacity=(1-progress)*.65;
      if(cueKind==='impulse'){cue.position.z=progress*2.1;cue.scale.setScalar(1+progress*.65);}
      else if(cueKind==='lift'){cue.position.y+=progress*2.1;cue.scale.setScalar(1+progress*.5);}
      else if(cueKind==='thrust'){cue.position.z=.4+progress*1.8;cue.scale.z=.7+progress*.8;}
      else if(cueKind==='spin'){cue.rotation.y=-progress*TAU*(hit.direction||event.direction||1);cue.scale.setScalar(1+pulse*.12);}
      else if(cueKind==='damping'){cue.position.y=.1;cue.scale.setScalar(1.2-progress*.4);}
      if(type==='spring')visual.scale.set(1+pulse*.22,1-pulse*.55,1+pulse*.22);
      else if(type==='punch')visual.scale.set(1+pulse*.2,1-pulse*.1,1+pulse*.4);
      else if(type==='bumper'||type==='trap')visual.scale.set(1+pulse*.3,1-pulse*.38,1+pulse*.3);
      else if(type==='coins')visual.scale.setScalar(1-progress*.8);
      if(hit.powered&&mechanism.piston)mechanism.piston.position.z=pulse*.6;
      if(hit.powered&&mechanism.coil){mechanism.coil.scale.y=1-pulse*.48;mechanism.cap.position.y=mechanism.capRest-pulse*.45;}
      if(mechanism.rubber)mechanism.rubber.scale.setScalar(1+pulse*.19);
    }
  }
  render(dt,run,mode='lobby',power=0,upgrades={pilot:0,ball:0}) {
    if(mode==='paused'&&this.lastPose&&this.poseRun===run){this.renderer.render(this.scene,this.camera);return;}
    const animDt=mode==='paused'?0:dt;this.time+=animDt;this.frame++;
    const active=run&&mode!=='lobby', rolling=active&&run.phase==='rolling'&&mode==='rolling';
    const nextSeed=active?run.seed:1;
    if(this.courseSeed!==nextSeed){this.courseSeed=nextSeed;this.courseStart=undefined;this.lastTrack=-1;this.trailHistory.length=0;this.lastTrailPoint=null;this.followRun=null;this.hitAnimations?.clear();for(const effect of this.effects){this.scene.remove(effect.mesh);effect.mesh.material.dispose();}this.effects.length=0;}
    const pose=active?this.readRunPose(run,mode):{s:28,x:0,worldY:this.sample(28).height+BALL_HEIGHT,blend:1};
    const orbit=active?run.wheel||0:0,newS=pose.s,newSample=this.sample(newS),newHeight=newSample.height;
    const oldOrigin=this.origin||{s:0,height:0,forward:0,lateral:0},shift=new THREE.Vector3(oldOrigin.lateral-newSample.lateral,oldOrigin.height-newHeight,oldOrigin.forward-newSample.forward);
    this.origin={s:newS,height:newHeight,forward:newSample.forward,lateral:newSample.lateral};
    // Historical paths and fragments share the same floating-origin translation.
    for(const point of this.trailHistory||[])point.add(shift);
    this.lastTrailPoint?.add(shift);
    for(const effect of this.effects)effect.mesh.position.add(shift);
    if(active){this.distance=pose.s;this.x=pose.x;this.syncEvents(run.events,run.track);}
    else{this.distance=28;this.x=0;this.syncEvents(this.previewEvents,0);}
    this.updateTrack(this.distance);
    this.runElapsed=active?run.elapsed:this.time;
    const airborne=Math.max(0,pose.worldY-newSample.height-BALL_HEIGHT),speed=rolling?Math.abs(run.speed):0,pitch=-newSample.pitch;
    const pos=this.worldPosition(this.distance,this.x,pose.worldY);this.ball.position.copy(pos);this.ball.quaternion.identity();
    if(active&&Array.isArray(run.rotation)){
      this.rotationTarget??=new THREE.Quaternion();this.rotationTarget.fromArray(run.rotation);
      this.ballBody.quaternion.fromArray(run.previousRotation||run.rotation).slerp(this.rotationTarget,pose.blend);
    }else if(!active)this.ballBody.rotation.y+=animDt*.12;
    this.squash=(this.squash||0)*Math.exp(-animDt*18);const squash=Math.min(.08,this.squash*.1);
    this.ball.scale.set(1+power*.06+squash,1+power*.06-squash*2,1+power*.06+squash);this.updateBallAppearance(active?run.trait||upgrades.trait:upgrades.trait,upgrades.ball||0);
    if(this.ballBody.material.emissive){this.ballBody.material.emissive.setHex(BALL_COLORS[upgrades.ball||0]);this.ballBody.material.emissiveIntensity=Math.min(.35,(this.impact||0)*.2);}
    this.shadow.position.copy(this.worldPosition(this.distance,this.x,newSample.height+.035));this.shadow.rotation.set(pitch-Math.PI/2,0,0);this.shadow.scale.setScalar(1+Math.min(.6,airborne*.012));if(this.shadow.material)this.shadow.material.opacity=.48*Math.exp(-airborne/18);
    this.ballLight?.position.copy(pos.clone().add(new THREE.Vector3(0,2,0)));
    if(this.aimGuide){this.aimGuide.visible=mode==='ready';const angle=(run?.aim||0)*Math.PI/180;
      this.aimGuide.children.forEach((part,index)=>{const ahead=3+index*1.8,x=this.x+Math.tan(angle)*ahead*COURSE_WORLD_PER_METER;part.position.copy(this.position(this.distance+ahead,x,.2));});
      const tipSample=this.sample(this.distance+15.6),tangent=new THREE.Vector3(tipSample.tangentX*Math.cos(angle)-Math.sin(angle),tipSample.tangentY*Math.cos(angle),tipSample.tangentZ*Math.cos(angle)).normalize();this.aimTip.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tangent);
    }
    this.astronaut.visible=mode==='ready'||mode==='lobby';this.astronaut.position.copy(this.position(this.distance-4,-1.5,1.1));this.astronaut.rotation.set(pitch,0,0);
    if(upgrades.pilot)this.astronaut.scale.setScalar(2.7+upgrades.pilot*.05);
    if(this.pilotLevel!==upgrades.pilot) {
      this.pilotLevel=upgrades.pilot;
      const body=this.astronaut.getObjectByName('body')||this.astronaut;
      body.traverse(part=>{if(part.isMesh&&!Array.isArray(part.material)&&part.material?.color)part.material.color.setHex(BALL_COLORS[upgrades.pilot||0]);});
    }
    // The ball owns translation; only the relative chase offset eases. Forward
    // travel therefore cannot outrun the camera, even during a fast launch.
    const ready=mode==='ready',aim=ready?0:18;
    this.cameraAim??=aim;this.cameraAim+=(aim-this.cameraAim)*(1-Math.exp(-animDt*6));
    this.cameraX=this.x;
    const fit=this.mobile?Math.max(1,1/this.camera.aspect/1.7):1;
    const offset=new THREE.Vector3(0,6.5,-20),lookOffset=new THREE.Vector3(active?Math.max(-.8,Math.min(.8,-(run.vx||0)*.035)):0,ready?.7:.8,ready?0:5);
    if(active){
      for(let step=1;step<=12;step++){
        const fraction=step/12,z=pos.z+offset.z*fraction;
        const floor=this.sample((z+this.origin.forward)/COURSE_WORLD_PER_METER).height-this.origin.height;
        offset.y=Math.max(offset.y,(floor+.25+3.75*fraction-pos.y)/fraction);
      }
      const reset=this.followRun!==run||this.lastWheel!==orbit||!this.chaseOffset;
      if(reset){this.chaseOffset=offset.clone();this.chaseLook=lookOffset.clone();}
      else{this.chaseOffset.lerp(offset,1-Math.exp(-animDt*6));this.chaseLook.lerp(lookOffset,1-Math.exp(-animDt*8));}
      this.followRun=run;
      this.camera.position.copy(pos).add(this.chaseOffset);this.look.copy(pos).add(this.chaseLook);
      // This is a safety projection, not the normal follow target. Broad, smooth
      // terrain keeps it inactive; it handles an exceptional crest or resize.
      for(let step=1;step<=12;step++){
        const fraction=step/12,z=pos.z+(this.camera.position.z-pos.z)*fraction;
        const floor=this.sample((z+this.origin.forward)/COURSE_WORLD_PER_METER).height-this.origin.height;
        this.camera.position.y=Math.max(this.camera.position.y,pos.y+(floor+.2-pos.y)/fraction);
      }
    }else{
      this.camera.position.set((this.mobile?34:32)*fit,26,-38);this.look.set(0,-1,27);this.followRun=null;this.chaseOffset=null;
    }
    const up=new THREE.Vector3(0,1,0);
    this.impact=Math.max(0,(this.impact||0)-animDt*4);
    this.railPulse=Math.max(0,(this.railPulse||0)-animDt*4);if(this.guardMaterial)this.guardMaterial.opacity=.035+this.railPulse*.12;
    this.camera.up.copy(up);this.camera.lookAt(this.look);const fov=active?(this.mobile?(ready?62:64):58)+(this.reducedMotion?0:Math.min(2,speed*COURSE_WORLD_PER_METER*.012)):(this.mobile?60:47);
    this.camera.fov+=(fov-this.camera.fov)*(1-Math.exp(-animDt*3.5));this.camera.updateProjectionMatrix();
    this.trailHistory||=[];
    const trailWarp=this.lastWheel!==orbit;
    if(trailWarp||!rolling){this.trailHistory.length=0;this.lastTrailPoint=pos.clone();this.trailRemainder=0;}
    this.lastWheel=orbit;
    if(rolling){
      if(trailWarp||!this.lastTrailPoint){this.lastTrailPoint=pos.clone();this.trailHistory.unshift(pos.clone());this.trailRemainder=0;}
      else if(animDt>0){
        const remainder=this.trailRemainder||0,samples=Math.floor((remainder+animDt)*60+1e-8);
        for(let index=Math.max(0,samples-32);index<samples;index++){
          const fraction=Math.max(0,Math.min(1,((index+1)/60-remainder)/animDt));
          this.trailHistory.unshift(this.lastTrailPoint.clone().lerp(pos,fraction));
        }
        this.trailRemainder=(remainder+animDt)-samples/60;
        this.lastTrailPoint.copy(pos);if(this.trailHistory.length>32)this.trailHistory.length=32;
      }
    }
    for(let i=0;i<this.trail.length;i++){const trail=this.trail[i],history=this.trailHistory[i*2];trail.material.opacity=rolling&&history&&!this.reducedMotion?(.38-i*.022):0;trail.material.color.copy(this.ballColor);if(history)trail.position.copy(history);trail.scale.setScalar(1.6-i*.075);}
    if(this.streaks){const intensity=rolling&&!this.reducedMotion?Math.min(1,Math.max(0,(speed*COURSE_WORLD_PER_METER-12)/70)):0;this.streaks.material.opacity=intensity*.18;this.streaks.visible=intensity>0;
      const positions=this.streakGeometry.attributes.position;for(let i=0;i<36;i++){const s=this.distance+((i*17.73-this.distance)%95+95)%95-8,x=(i%2?1:-1)*(HALF_WIDTH+1+(i%7)*.9),h=3+(i%9)*1.2;const start=this.position(s,x,h),end=this.position(s+3+intensity*5,x,h);positions.setXYZ(i*2,start.x,start.y,start.z);positions.setXYZ(i*2+1,end.x,end.y,end.z);}positions.needsUpdate=true;
    }
    this.animateEvents(animDt,run,active);
    this.updateCameraOcclusion(active);
    for(let i=this.effects.length-1;i>=0;i--){const effect=this.effects[i];effect.life-=animDt;effect.mesh.position.addScaledVector(effect.v,animDt);effect.v.addScaledVector(effect.gravity,animDt);if(effect.spin){effect.mesh.rotation.x+=effect.spin.x*animDt;effect.mesh.rotation.y+=effect.spin.y*animDt;effect.mesh.rotation.z+=effect.spin.z*animDt;}effect.mesh.material.opacity=Math.max(0,effect.life/effect.total)*(effect.opacity||1);effect.mesh.scale.setScalar((effect.scale||1)*(1+(1-effect.life/effect.total)*.4));if(effect.life<=0){this.scene.remove(effect.mesh);effect.mesh.material.dispose();this.effects.splice(i,1);}}
    this.renderer.render(this.scene,this.camera);
  }
  disposeObject(object,skipModels=false) {this.releaseCameraFades(object);const geometries=new Set(),materials=new Set();object.traverse(o=>{if(!o.isMesh&&!o.isLine&&!o.isPoints)return;if(skipModels&&Object.values(this.models||{}).some(m=>{let yes=false;m.traverse(n=>{if(n.geometry===o.geometry)yes=true;});return yes;}))return;if(o.geometry)geometries.add(o.geometry);for(const material of(Array.isArray(o.material)?o.material:[o.material]))if(material)materials.add(material);});for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();}
  dispose(){this.abort=true;this.disposeObject(this.scene);for(const model of Object.values(this.models))this.disposeObject(model);this.effectGeometry.dispose();this.hitAnimations?.clear();if(this.trailHistory)this.trailHistory.length=0;this.effects.length=0;this.renderer.dispose();}
}
