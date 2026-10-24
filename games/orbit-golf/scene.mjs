import * as THREE from './assets/vendor/three.module.js';
import { GLTFLoader } from './assets/vendor/GLTFLoader.js';
import { eventPose, TRACK_WIDTH } from './rules.mjs?v=20261024-devices2';

const TAU = Math.PI * 2;
export const WHEEL_RADIUS = 23;
export const BALL_HEIGHT = 1.08;
const R = WHEEL_RADIUS;
const HALF_WIDTH = TRACK_WIDTH / 2;
const MAX_EFFECTS = 48;
const THEMES = [0x64e8d6, 0xc29aff, 0xffb575, 0x9eff86];
const CENTERS = [[0,0,0],[-72,8,12],[62,-12,-45]];
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
    const seam = new THREE.Mesh(new THREE.TorusGeometry(1.055, .065, 6, 36), mat(0x183c59,.35,.35)); seam.rotation.x = Math.PI / 2; this.ballBody.add(seam);
    const seam2 = seam.clone(); seam2.rotation.x = 0; this.ballBody.add(seam2);
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
    this.previewEvents=[{id:'preview1',at:72,x:0,type:'bumper'},{id:'preview2',at:48,x:5,type:'coins'},{id:'preview3',at:82,x:-3.5,type:'alien'},{id:'preview4',at:92,x:2.2,type:'spring'},{id:'preview5',at:155,x:6,type:'punch'},{id:'preview6',at:215,x:-6,type:'alien'}];
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
  cylinder(radius,width,material,parent=this.track) {
    const geometry=new THREE.CylinderGeometry(radius,radius,width,96,1,true);
    geometry.rotateZ(Math.PI/2);
    return this.mesh(geometry,material,parent);
  }
  rim(radius,x,tube,material,parent=this.track) {
    const rim=this.mesh(new THREE.TorusGeometry(radius,tube,8,96),material,parent);
    rim.rotation.y=Math.PI/2;rim.position.x=x;return rim;
  }
  buildTrack() {
    // An open cylinder on its side: the ball runs on its inward-facing tread.
    const tread=mat(0x315c6c,.66,.35);tread.side=THREE.BackSide;
    this.cylinder(R,TRACK_WIDTH,tread).name='inner-tread';
    this.cylinder(R+.6,TRACK_WIDTH,mat(0x14283d,.55,.65)).name='outer-shell';
    for(const x of [-HALF_WIDTH-.1,HALF_WIDTH+.1]) {
      this.rim(R+.25,x,.38,mat(0x456476,.45,.65));
      this.rim(R-.1,x,.11,this.railMaterial);
      const edgeMaterial=mat(0x527886,.5,.55);edgeMaterial.side=THREE.DoubleSide;
      const face=this.mesh(new THREE.RingGeometry(R-.08,R+.65,96),edgeMaterial);
      face.rotation.y=Math.PI/2;face.position.x=x;
    }
    // The side cushions extend inward as a visible energy guard for airborne banks.
    this.guardMaterial=new THREE.MeshBasicMaterial({color:0x9dfff0,side:THREE.DoubleSide,transparent:true,opacity:.035,depthWrite:false});
    for(const x of [-HALF_WIDTH,HALF_WIDTH]) {
      const guard=this.mesh(new THREE.RingGeometry(R-9,R+.25,96),this.guardMaterial);guard.rotation.y=Math.PI/2;guard.position.x=x;
      for(let i=0;i<12;i++){const angle=i/12*TAU,post=this.mesh(new THREE.BoxGeometry(.055,8.8,.055),glow(0x5ef3de,.35));post.position.set(x,-Math.cos(angle)*(R-4.4),Math.sin(angle)*(R-4.4));post.rotation.x=-angle;}
    }
    const instance=new THREE.Object3D();
    const ribs=new THREE.InstancedMesh(new THREE.BoxGeometry(TRACK_WIDTH-.25,.09,.2),mat(0x477d87,.7,.4),72);this.track.add(ribs);
    for(let i=0;i<72;i++) {
      const a=i/72*TAU;instance.position.set(0,-Math.cos(a)*(R-.04),Math.sin(a)*(R-.04));
      instance.rotation.set(-a,0,0);instance.updateMatrix();ribs.setMatrixAt(i,instance.matrix);
    }
    // Broad, staggered floor plates replace the old three-lane markings.
    const columns=10,tileWidth=TRACK_WIDTH/columns;
    const plates=new THREE.InstancedMesh(new THREE.BoxGeometry(tileWidth-.08,.035,1.9),mat(0x467e87,.72,.25),36*columns);plates.name='staggered-floor-plates';this.track.add(plates);
    let plateIndex=0;
    for(let i=0;i<36;i++)for(let j=0;j<columns;j++) {
      const a=(i+(j%2)*.5)/36*TAU;instance.position.set((j-(columns-1)/2)*tileWidth,-Math.cos(a)*(R-.06),Math.sin(a)*(R-.06));
      instance.rotation.set(-a,0,0);instance.updateMatrix();plates.setMatrixAt(plateIndex++,instance.matrix);
    }
    // Rear spokes and a hub make the vertical hamster-wheel silhouette unmistakable.
    for(let i=0;i<3;i++) {
      const spoke=this.mesh(new THREE.BoxGeometry(.45,R*2,.48),mat(0x334e65,.6,.6));
      spoke.position.x=-HALF_WIDTH-.5;spoke.rotation.x=i*Math.PI/3;
    }
    const hub=this.mesh(new THREE.CylinderGeometry(1.3,1.3,1.3,20),mat(0x9cb3bc,.35,.7));
    hub.rotation.z=Math.PI/2;hub.position.x=-HALF_WIDTH-.5;
    for(let i=0;i<8;i++) {
      const a=i/8*TAU,pod=new THREE.Group();this.track.add(pod);
      pod.position.set(0,-Math.cos(a)*(R+1),Math.sin(a)*(R+1));pod.rotation.x=-a;
      this.mesh(new THREE.BoxGeometry(2.5,1.1,1.8),mat(0x466076),pod);
      const light=this.mesh(new THREE.BoxGeometry(1.8,.15,1),this.railMaterial,pod);light.position.y=-.58;
    }
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
    for(let j=0;j<CENTERS.length;j++) {
      const distant=new THREE.Group();distant.position.fromArray(CENTERS[j]);this.scene.add(distant);
      const material=mat(j===1?0x4d396a:0x234f61,.6,.6);material.side=THREE.DoubleSide;
      this.cylinder(R,TRACK_WIDTH,material,distant);
      for(const x of [-HALF_WIDTH-.1,HALF_WIDTH+.1])this.rim(R,x,.23,glow(j===1?0x9c7dff:0x51b4c9,.7),distant);
      this.distantTracks.push(distant);
    }
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
  position(distance,x=0,height=.1) {
    const a=distance/360*TAU,r=R-height;
    return new THREE.Vector3(-x,-Math.cos(a)*r,Math.sin(a)*r).add(this.center||new THREE.Vector3());
  }
  directionArrow(parent,color,size=1) {
    const shape=new THREE.Shape();shape.moveTo(-.16,-.5);shape.lineTo(.16,-.5);shape.lineTo(.16,.08);shape.lineTo(.42,.08);shape.lineTo(0,.55);shape.lineTo(-.42,.08);shape.lineTo(-.16,.08);shape.closePath();
    const arrow=this.mesh(new THREE.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:false}),glow(color,.55),parent);arrow.scale.setScalar(size);return arrow;
  }
  createEvent(event) {
    const g=new THREE.Group(),visual=new THREE.Group(),type=event.type,r=event.radius||.95,h=event.height||1.05,mechanism={};g.add(visual);
    const useModel=(name,scale)=>{if(!this.models[name])return false;const m=this.models[name].clone(true);m.scale.setScalar(scale);m.position.y=h;visual.add(m);return true;};
    const eyes=(y,z,spread=.35)=>{for(const sign of [-1,1]){const eye=this.mesh(new THREE.SphereGeometry(.25,12,8),mat(0xffffff,.35,0),visual);eye.position.set(sign*spread,y,z);const pupil=this.mesh(new THREE.SphereGeometry(.115,10,8),mat(0x111c35,.3,0),visual);pupil.position.set(sign*spread,y-.025,z-.2);}};
    if(type==='bumper') {
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
      const up=this.directionArrow(visual,0xf2ffff,1.2);up.name='up-arrow';up.position.set(0,1.94,-r*.9);up.rotation.y=Math.PI;
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
    // Rotate every flying object about its collider center, never its old floor anchor.
    for(const child of visual.children)child.position.y-=h;
    visual.position.y=h;
    if(mechanism.cap)mechanism.capRest=mechanism.cap.position.y;
    const pose=eventPose(event,0);g.position.copy(this.position(pose.s,pose.x,pose.height));g.rotation.x=-pose.s/360*TAU;
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
    if(this.lastTrack===track&&this.lastEvents===events)return;this.lastTrack=track;this.lastEvents=events;
    for(const m of this.eventMeshes.values()){this.eventGroup.remove(m);this.disposeObject(m,true);}this.eventMeshes.clear();
    for(const e of events){const m=this.createEvent(e);this.eventGroup.add(m);this.eventMeshes.set(e.id,m);}
    const c=THEMES[((track%THEMES.length)+THEMES.length)%THEMES.length];this.railMaterial.color.setHex(c);this.railMaterial.emissive.setHex(c);
  }
  burst(feedback={type:'shot',strength:1}) {
    if(typeof feedback==='string')feedback={type:feedback==='bad'?'comet':'shot',strength:1};
    const strength=Math.min(1.5,Math.max(.2,feedback.strength||1)),chain=feedback.kind==='chain';
    this.impact=Math.max(this.impact||0,strength*(chain?.12:.45));if(!chain)this.squash=Math.max(this.squash||0,strength*.7);
    if(feedback.type==='rail')this.railPulse=1;
    const duration=Math.max(.45,Math.min(1.8,feedback.effectDuration||.65));
    this.hitAnimations||=new Map();if(feedback.eventId)this.hitAnimations.set(feedback.eventId,{life:duration,total:duration,type:feedback.type,strength,effect:feedback.effect,direction:feedback.effectDirection,powered:feedback.kind!=='chain'&&feedback.powered!==false});
    const event=this.eventMeshes?.get(feedback.eventId)?.userData.event,pose=event?eventPose(event,this.runElapsed||0):null;
    const distance=pose?.s??(Number.isFinite(feedback.s)?feedback.s:this.distance||0),a=distance/360*TAU;
    const origin=pose?this.position(pose.s,pose.x,pose.height+(event.height||1.05)):
      Number.isFinite(feedback.s)?this.position(distance,feedback.x||0,BALL_HEIGHT+(feedback.height||0)):this.ball.position.clone();
    const color=feedback.type==='comet'?0xbba58d:0xc4d8df;
    const inward=new THREE.Vector3(0,Math.cos(a),-Math.sin(a)),forward=new THREE.Vector3(0,Math.sin(a),Math.cos(a));
    this.effectGeometry||=new THREE.OctahedronGeometry(.14);this.effects||=[];
    const count=feedback.type==='comet'?6:feedback.type==='landing'?4:feedback.type==='shot'?6:feedback.type==='rail'?3:0;
    for(let i=0;i<count;i++) {
      const mesh=new THREE.Mesh(this.effectGeometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7,depthWrite:false}));mesh.position.copy(origin);mesh.scale.setScalar(feedback.type==='comet'?1:.55);this.scene.add(mesh);
      const velocity=inward.clone().multiplyScalar(1+Math.random()*3*strength).addScaledVector(forward,(Math.random()-.5)*5*strength);velocity.x=(Math.random()-.5)*6*strength;
      this.effects.push({mesh,life:.45,total:.45,v:velocity,gravity:inward.clone().multiplyScalar(-10),opacity:.7,scale:feedback.type==='comet'?1:.55});
    }
    while(this.effects.length>MAX_EFFECTS){const effect=this.effects.shift();this.scene.remove(effect.mesh);effect.mesh.material.dispose();}
  }
  animateEvents(dt,run,active) {
    this.hitAnimations||=new Map();
    for(const [id,hit] of this.hitAnimations){hit.life-=dt;if(hit.life<=0)this.hitAnimations.delete(id);}
    for(const mesh of this.eventMeshes.values()) {
      const {event,visual,type,centerHeight,cue,mechanism}=mesh.userData,hit=this.hitAnimations.get(event.id),pose=eventPose(event,active?run.elapsed:this.time),ahead=pose.s-this.distance;
      const flying=Boolean(event.body?.active),sameWheel=!active||!event.body||event.body.wheel===run.wheel;
      mesh.visible=sameWheel&&(flying||!event.used||Boolean(hit)&&!event.body)&&(!active||(ahead>-65&&ahead<190));
      mesh.position.copy(this.position(pose.s,pose.x,pose.height));mesh.rotation.x=-pose.s/360*TAU;
      visual.position.set(0,centerHeight,0);visual.rotation.set(pose.rx||0,pose.ry||0,pose.rz||0);visual.scale.setScalar(1);
      cue.visible=Boolean(hit?.powered)&&Boolean(cue.userData.kind);cue.position.set(0,centerHeight,0);cue.rotation.set(0,0,0);cue.scale.setScalar(1);
      if(cue.userData.material)cue.userData.material.opacity=0;
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
    const animDt=mode==='paused'?0:dt;this.time+=animDt;this.frame++;
    const active=run&&mode!=='lobby', rolling=active&&run.phase==='rolling'&&mode==='rolling';
    this.center ||= new THREE.Vector3();const orbit=active?(run.wheel||0)%CENTERS.length:0;
    const center=new THREE.Vector3().fromArray(CENTERS[orbit]);
    if(!this.center.equals(center))this.lastTrack=-1;
    this.center.copy(center);this.track.position.copy(this.center);this.distantTracks?.forEach((ring,index)=>{ring.visible=index!==orbit;});
    if(active){this.distance=run.s;this.x=run.x;this.syncEvents(run.events,run.track);}
    else{this.distance=28;this.x=0;this.syncEvents(this.previewEvents,0);}
    this.runElapsed=active?run.elapsed:this.time;
    const airborne=active?run.height||0:0,speed=rolling?Math.abs(run.speed):0,a=this.distance/360*TAU;
    const pos=this.position(this.distance,this.x,BALL_HEIGHT+airborne);this.ball.position.copy(pos);
    this.ballBody.rotation.x-=rolling?run.speed*dt*.13:animDt*.2;this.ballBody.rotation.z-=rolling?(run.vx||0)*dt*.6:0;this.ballBody.rotation.y-=rolling?(run.curveSpin||0)*dt*.55:0;this.ball.rotation.set(-a,0,0);
    this.squash=Math.max(0,(this.squash||0)-animDt*5);const squash=Math.min(.22,this.squash*.15),stretch=Math.min(.16,Math.abs(run?.vy||0)*.008);
    this.ball.scale.set(1+power*.12+squash,1+power*.12-squash+stretch,1+power*.12+squash-stretch*.4);this.ballBody.material.color.setHex(BALL_COLORS[upgrades.ball||0]);
    if(this.ballBody.material.emissive){this.ballBody.material.emissive.setHex(BALL_COLORS[upgrades.ball||0]);this.ballBody.material.emissiveIntensity=Math.min(.35,(this.impact||0)*.2);}
    this.shadow.position.copy(this.position(this.distance,this.x,.045));this.shadow.rotation.set(-a-Math.PI/2,0,0);this.shadow.scale.setScalar(1+airborne*.12);if(this.shadow.material)this.shadow.material.opacity=Math.max(.12,.6-airborne*.05);
    this.ballLight?.position.copy(this.position(this.distance,this.x,BALL_HEIGHT+airborne+2));
    if(this.aimGuide){this.aimGuide.visible=mode==='ready';const angle=(run?.aim||0)*Math.PI/180;
      this.aimGuide.children.forEach((part,index)=>{const ahead=3+index*1.8,x=this.x+Math.tan(angle)*ahead*(TAU*R/360);part.position.copy(this.position(this.distance+ahead,x,.2));});
      const tipAngle=(this.distance+15.6)/360*TAU,tangent=new THREE.Vector3(-Math.sin(angle),Math.sin(tipAngle)*Math.cos(angle),Math.cos(tipAngle)*Math.cos(angle));this.aimTip.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tangent);
    }
    this.astronaut.visible=mode==='ready'||mode==='lobby';this.astronaut.position.copy(this.position(this.distance-4,-1.5,1.1));this.astronaut.rotation.set(-a,0,0);
    if(upgrades.pilot)this.astronaut.scale.setScalar(2.7+upgrades.pilot*.05);
    if(this.pilotLevel!==upgrades.pilot) {
      this.pilotLevel=upgrades.pilot;
      const body=this.astronaut.getObjectByName('body')||this.astronaut;
      body.traverse(part=>{if(part.isMesh&&!Array.isArray(part.material)&&part.material?.color)part.material.color.setHex(BALL_COLORS[upgrades.pilot||0]);});
    }
    // The chase frame travels with the ball; the wheel's inward normal is its up.
    // Keep the angular position exact so fast loops never outrun the camera.
    const aim=mode==='ready'?0:18;
    this.cameraAim??=aim;this.cameraAim+=(aim-this.cameraAim)*Math.min(1,dt*7);
    this.cameraX??=this.x;this.cameraX+=(this.x-this.cameraX)*Math.min(1,dt*10);this.cameraX=Math.max(this.x-.75,Math.min(this.x+.75,this.cameraX));
    const fit=this.mobile?Math.max(1,1/this.camera.aspect/1.7):1;
    const ready=mode==='ready',behind=ready?60:72,camHeight=ready?9:10;
    const target=active?this.position(this.distance-behind,this.cameraX*.9,camHeight+airborne*.55):this.center.clone().add(new THREE.Vector3((this.mobile?88:77)*fit,10,25));
    const look=active?this.position(this.distance+this.cameraAim,this.cameraX*.9,1+airborne*.85):this.center.clone().add(new THREE.Vector3(this.mobile?0:-8,this.mobile?2:1,this.mobile?0:8));
    if(active||this.frame<3){this.camera.position.copy(target);this.look.copy(look);}else{this.camera.position.lerp(target,Math.min(1,dt*4));this.look.lerp(look,Math.min(1,dt*4));}
    const up=active?new THREE.Vector3(0,Math.cos(a),-Math.sin(a)):new THREE.Vector3(0,1,0);
    this.impact=Math.max(0,(this.impact||0)-animDt*4);if(this.impact&&rolling&&!this.reducedMotion){this.camera.position.addScaledVector(up,Math.sin(this.time*92)*this.impact*.08);this.camera.position.x+=Math.cos(this.time*75)*this.impact*.03;}
    this.railPulse=Math.max(0,(this.railPulse||0)-animDt*4);if(this.guardMaterial)this.guardMaterial.opacity=.035+this.railPulse*.12;
    this.camera.up.copy(up);this.camera.lookAt(this.look);const fov=active?(this.mobile?(ready?70:74):(ready?60:62))+(this.reducedMotion?0:Math.min(9,speed*.055)):(this.mobile?60:47);
    this.camera.fov+=(fov-this.camera.fov)*Math.min(1,dt*5);this.camera.updateProjectionMatrix();
    this.trailHistory||=[];if(this.lastWheel!==orbit||!rolling)this.trailHistory.length=0;this.lastWheel=orbit;
    if(rolling){this.trailHistory.unshift(pos.clone());if(this.trailHistory.length>32)this.trailHistory.pop();}
    for(let i=0;i<this.trail.length;i++){const trail=this.trail[i],history=this.trailHistory[i*2];trail.material.opacity=rolling&&history?(.5-i*.028):0;trail.material.color.setHex(BALL_COLORS[upgrades.ball||0]);if(history)trail.position.copy(history);trail.scale.setScalar(1.6-i*.075);}
    if(this.streaks){const intensity=rolling&&!this.reducedMotion?Math.min(1,Math.max(0,(speed-28)/95)):0;this.streaks.material.opacity=intensity*.5;this.streaks.visible=intensity>0;
      const positions=this.streakGeometry.attributes.position;for(let i=0;i<36;i++){const s=this.distance+((i*17.73-this.time*speed*1.6)%95+95)%95-8,x=(i%2?1:-1)*(HALF_WIDTH+1+(i%7)*.9),h=3+(i%9)*1.2;const start=this.position(s,x,h),end=this.position(s+3+intensity*5,x,h);positions.setXYZ(i*2,start.x,start.y,start.z);positions.setXYZ(i*2+1,end.x,end.y,end.z);}positions.needsUpdate=true;
    }
    this.animateEvents(animDt,run,active);
    for(let i=this.effects.length-1;i>=0;i--){const effect=this.effects[i];effect.life-=animDt;effect.mesh.position.addScaledVector(effect.v,animDt);effect.v.addScaledVector(effect.gravity,animDt);effect.mesh.material.opacity=Math.max(0,effect.life/effect.total)*(effect.opacity||1);effect.mesh.scale.setScalar((effect.scale||1)*(1+(1-effect.life/effect.total)*.4));if(effect.life<=0){this.scene.remove(effect.mesh);effect.mesh.material.dispose();this.effects.splice(i,1);}}
    this.renderer.render(this.scene,this.camera);
  }
  disposeObject(object,skipModels=false) {object.traverse(o=>{if(!o.isMesh&&!o.isLine&&!o.isPoints)return;if(skipModels&&Object.values(this.models||{}).some(m=>{let yes=false;m.traverse(n=>{if(n.geometry===o.geometry)yes=true;});return yes;}))return;o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});}
  dispose(){this.abort=true;this.disposeObject(this.scene);for(const model of Object.values(this.models))this.disposeObject(model);this.effectGeometry.dispose();this.hitAnimations?.clear();if(this.trailHistory)this.trailHistory.length=0;this.effects.length=0;this.renderer.dispose();}
}
