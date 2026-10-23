import * as THREE from './assets/vendor/three.module.js';
import { GLTFLoader } from './assets/vendor/GLTFLoader.js';

const TAU = Math.PI * 2;
export const WHEEL_RADIUS = 23;
export const BALL_HEIGHT = 1.08;
const R = WHEEL_RADIUS;
const LANE = 2.1;
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
    const seam = new THREE.Mesh(new THREE.TorusGeometry(1.055, .035, 6, 36), glow(0x8affda, .9)); seam.rotation.x = Math.PI / 2; this.ball.add(seam);
    const seam2 = seam.clone(); seam2.rotation.x = 0; this.ball.add(seam2);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(.78, 24), new THREE.MeshBasicMaterial({ color: 0x050e20, transparent: true, opacity: .6, depthWrite: false })); this.shadow.rotation.x = -Math.PI / 2; this.scene.add(this.shadow);
    this.trail = []; const trailGeometry = new THREE.SphereGeometry(.23, 8, 6);
    for (let i=0;i<16;i++) { const m = new THREE.Mesh(trailGeometry, new THREE.MeshBasicMaterial({color:0x81ffe2,transparent:true,opacity:0,depthWrite:false})); this.scene.add(m); this.trail.push(m); }
    this.effects = []; this.effectGeometry = new THREE.OctahedronGeometry(.14);
    this.eventGroup = new THREE.Group(); this.scene.add(this.eventGroup); this.eventMeshes = new Map();
    this.models = {}; this.loader = new GLTFLoader(); this.abort = false;
    this.astronaut = this.fallbackAstronaut(); this.scene.add(this.astronaut);
    this.loadModels();
    this.previewEvents=[{id:'preview1',at:72,lane:0,type:'hole'},{id:'preview2',at:48,lane:1,type:'coins'},{id:'preview3',at:105,lane:-1,type:'boost'},{id:'preview4',at:155,lane:0,type:'ufo'},{id:'preview5',at:215,lane:1,type:'comet'}];
    this.lane = 0; this.distance = 0; this.displayTrack = 0; this.lastTrack = -1; this.time = 0; this.impact = 0; this.frame = 0;
    this.look = new THREE.Vector3(); this.cameraTarget = new THREE.Vector3();
    this.resize();
  }
  resize() {
    const w=this.renderer.domElement.clientWidth,h=this.renderer.domElement.clientHeight;
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.mobile=w<650;
    this.camera.fov=this.mobile?60:47;this.camera.updateProjectionMatrix();
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
    this.cylinder(R,8.4,tread).name='inner-tread';
    this.cylinder(R+.6,8.4,mat(0x14283d,.55,.65)).name='outer-shell';
    for(const x of [-4.3,4.3]) {
      this.rim(R+.25,x,.38,mat(0x456476,.45,.65));
      this.rim(R-.1,x,.11,this.railMaterial);
      const edgeMaterial=mat(0x527886,.5,.55);edgeMaterial.side=THREE.DoubleSide;
      const face=this.mesh(new THREE.RingGeometry(R-.08,R+.65,96),edgeMaterial);
      face.rotation.y=Math.PI/2;face.position.x=x;
    }
    const instance=new THREE.Object3D();
    const ribs=new THREE.InstancedMesh(new THREE.BoxGeometry(8.15,.09,.2),mat(0x477d87,.7,.4),72);this.track.add(ribs);
    for(let i=0;i<72;i++) {
      const a=i/72*TAU;instance.position.set(0,-Math.cos(a)*(R-.04),Math.sin(a)*(R-.04));
      instance.rotation.set(-a,0,0);instance.updateMatrix();ribs.setMatrixAt(i,instance.matrix);
    }
    const dashes=new THREE.InstancedMesh(new THREE.BoxGeometry(.06,.04,.7),mat(0x91d9d2),144);this.track.add(dashes);
    let dashIndex=0;
    for(let i=0;i<72;i++)for(const x of [-1.05,1.05]) {
      const a=i/72*TAU;instance.position.set(x,-Math.cos(a)*(R-.1),Math.sin(a)*(R-.1));
      instance.rotation.set(-a,0,0);instance.updateMatrix();dashes.setMatrixAt(dashIndex++,instance.matrix);
    }
    // Rear spokes and a hub make the vertical hamster-wheel silhouette unmistakable.
    for(let i=0;i<3;i++) {
      const spoke=this.mesh(new THREE.BoxGeometry(.45,R*2,.48),mat(0x334e65,.6,.6));
      spoke.position.x=-4.7;spoke.rotation.x=i*Math.PI/3;
    }
    const hub=this.mesh(new THREE.CylinderGeometry(1.3,1.3,1.3,20),mat(0x9cb3bc,.35,.7));
    hub.rotation.z=Math.PI/2;hub.position.x=-4.7;
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
      this.cylinder(R,8.4,material,distant);
      for(const x of [-4.3,4.3])this.rim(R,x,.23,glow(j===1?0x9c7dff:0x51b4c9,.7),distant);
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
  position(distance,lane=0,height=.1) {
    const a=distance/360*TAU,r=R-height;
    return new THREE.Vector3(lane*LANE,-Math.cos(a)*r,Math.sin(a)*r).add(this.center||new THREE.Vector3());
  }
  createEvent(event) {
    const g=new THREE.Group(),type=event.type;
    const useModel=(name,scale)=>{if(!this.models[name])return false;const m=this.models[name].clone(true);m.scale.setScalar(scale);m.position.y=type==='comet'?1.1:.65;g.add(m);return true;};
    if(type==='coins'){for(let i=0;i<3;i++){const m=this.mesh(new THREE.TorusGeometry(.28,.085,6,12),glow(0xffcf65,.55),g);m.position.set(0,.65,-.55+i*.55);m.rotation.y=Math.PI/2;}}
    else if(type==='boost'){const pad=this.mesh(new THREE.BoxGeometry(1.65,.1,2.3),glow(0x8affbb,.6),g);pad.position.y=.12;for(let i=0;i<3;i++){for(const sign of [-1,1]){const arrow=this.mesh(new THREE.BoxGeometry(.5,.045,.12),glow(0xd8ffac,1),g);arrow.position.set(sign*.19,.2,(i-1)*.55);arrow.rotation.y=sign*.6;}}}
    else if(type==='trap'){const base=this.mesh(new THREE.BoxGeometry(1.7,.12,1.6),mat(0x633353),g);base.position.y=.1;for(let i=0;i<3;i++)for(let j=0;j<2;j++){const s=this.mesh(new THREE.ConeGeometry(.2,.65,4),glow(0xff8f9c,.35),g);s.position.set((i-1)*.5,.43,j*.65-.3);}}
    else if(type==='hole'){const hole=this.mesh(new THREE.CylinderGeometry(.65,.65,.05,28),new THREE.MeshBasicMaterial({color:0x020813}),g);hole.position.y=.06;const ring=this.mesh(new THREE.TorusGeometry(.69,.11,6,32),glow(0xd6ff7b,1.4),g);ring.rotation.x=Math.PI/2;ring.position.y=.1;const pole=this.mesh(new THREE.CylinderGeometry(.035,.035,2,6),mat(0xf0f6e4),g);pole.position.set(.72,1,0);const flag=this.mesh(new THREE.BoxGeometry(.8,.43,.035),glow(0xd5ff7c,.3),g);flag.position.set(1.1,1.75,0);}
    else if(type==='ufo'){const ring=this.mesh(new THREE.TorusGeometry(.9,.11,6,24),glow(0x8ef0ff,1.1),g);ring.position.y=1;if(this.models.craft_speederA){const craft=this.models.craft_speederA.clone(true);craft.scale.setScalar(1.05);craft.position.y=1.8;g.add(craft);}else{const disk=this.mesh(new THREE.CylinderGeometry(.9,.7,.22,20),mat(0x8fb2b9,.25,.7),g);disk.position.y=1.5;const dome=this.mesh(new THREE.SphereGeometry(.45,14,10,0,TAU,0,Math.PI/2),glow(0x8dffe1,.45),g);dome.position.y=1.63;}const beam=this.mesh(new THREE.ConeGeometry(.7,1.4,16,1,true),new THREE.MeshBasicMaterial({color:0x79ffe6,transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false}),g);beam.position.y=.75;}
    else if(type==='comet'){if(!useModel('meteor',2.9))this.mesh(new THREE.IcosahedronGeometry(.7,0),mat(0x9f8f88),g).position.y=.8;const tail=this.mesh(new THREE.ConeGeometry(.35,2.4,6),glow(0xffaa65,.8),g);tail.position.set(0,1.8,-.6);tail.rotation.x=-.6;}
    else if(type==='alien'){if(!useModel('alien',2.5)){const head=this.mesh(new THREE.SphereGeometry(.48,10,8),mat(0xb0dd7a),g);head.position.y=.8;}const aura=this.mesh(new THREE.TorusGeometry(.9,.04,4,24),glow(0xf2a0ff,.8),g);aura.rotation.x=Math.PI/2;aura.position.y=.08;}
    g.position.copy(this.position(event.at,event.lane));g.rotation.x=-event.at/360*TAU;g.userData={type,event};return g;
  }
  syncEvents(events,track) {
    if(this.lastTrack===track&&this.lastEvents===events)return;this.lastTrack=track;this.lastEvents=events;
    for(const m of this.eventMeshes.values()){this.eventGroup.remove(m);this.disposeObject(m,true);}this.eventMeshes.clear();
    for(const e of events){const m=this.createEvent(e);this.eventGroup.add(m);this.eventMeshes.set(e.id,m);}
    const c=THEMES[((track%THEMES.length)+THEMES.length)%THEMES.length];this.railMaterial.color.setHex(c);this.railMaterial.emissive.setHex(c);
  }
  burst(kind='good') {this.impact=kind==='bad'?1:.6;const color=kind==='bad'?0xff997d:0xcaff8b;for(let i=0;i<16;i++){const m=new THREE.Mesh(this.effectGeometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:1}));m.position.copy(this.ball.position);this.scene.add(m);this.effects.push({mesh:m,life:.7,v:new THREE.Vector3((Math.random()-.5)*7,2+Math.random()*5,(Math.random()-.5)*7)});}while(this.effects.length>64){const e=this.effects.shift();this.scene.remove(e.mesh);e.mesh.material.dispose();}}
  render(dt,run,mode='lobby',power=0,upgrades={pilot:0,ball:0}) {
    this.time+=dt;this.frame++;
    const active=run&&mode!=='lobby', rolling=active&&run.phase==='rolling'&&mode==='rolling';
    this.center ||= new THREE.Vector3();const orbit=active?(run.wheel||0)%CENTERS.length:0;
    const center=new THREE.Vector3().fromArray(CENTERS[orbit]);
    if(!this.center.equals(center))this.lastTrack=-1;
    this.center.copy(center);this.track.position.copy(this.center);this.distantTracks?.forEach((ring,index)=>{ring.visible=index!==orbit;});
    if(active){this.distance=run.distance;this.lane=run.lane;this.syncEvents(run.events,run.track);}
    else{this.distance=28;this.lane=0;this.syncEvents(this.previewEvents,0);}
    const a=this.distance/360*TAU,pos=this.position(this.distance,this.lane,BALL_HEIGHT);this.ball.position.copy(pos);
    this.ballBody.rotation.x-=rolling?run.speed*dt*.08:dt*.2;this.ball.rotation.set(-a,0,0);
    this.ball.scale.setScalar(1+power*.12);this.ballBody.material.color.setHex(BALL_COLORS[upgrades.ball||0]);
    this.shadow.position.copy(this.position(this.distance,this.lane,.045));this.shadow.rotation.set(-a-Math.PI/2,0,0);
    this.astronaut.visible=!rolling;this.astronaut.position.copy(this.position(this.distance-4,-.65,1.1));this.astronaut.rotation.set(-a,0,0);
    if(upgrades.pilot)this.astronaut.scale.setScalar(2.7+upgrades.pilot*.05);
    if(this.pilotLevel!==upgrades.pilot) {
      this.pilotLevel=upgrades.pilot;
      const body=this.astronaut.getObjectByName('body')||this.astronaut;
      body.traverse(part=>{if(part.isMesh&&!Array.isArray(part.material)&&part.material?.color)part.material.color.setHex(BALL_COLORS[upgrades.pilot||0]);});
    }
    // A fixed three-quarter view shows the ball climbing, crossing the ceiling and
    // descending inside the wheel. The camera never rolls with the ball.
    const fit=this.mobile?Math.max(1,1/this.camera.aspect/1.7):1;
    const target=this.center.clone().add(new THREE.Vector3((this.mobile?76:69)*fit,10,25));
    const look=this.center.clone().add(new THREE.Vector3(this.mobile?0:-8,this.mobile?2:1,this.mobile?0:8));
    if(active||this.frame<3){this.camera.position.copy(target);this.look.copy(look);}else{this.camera.position.lerp(target,Math.min(1,dt*4));this.look.lerp(look,Math.min(1,dt*4));}
    this.impact=Math.max(0,this.impact-dt*3);if(this.impact&&rolling&&!this.reducedMotion)this.camera.position.y+=Math.sin(this.time*92)*this.impact*.16;
    this.camera.up.set(0,1,0);this.camera.lookAt(this.look);const fov=this.mobile?60:47;
    this.camera.fov+=(fov-this.camera.fov)*Math.min(1,dt*5);this.camera.updateProjectionMatrix();
    for(let i=0;i<this.trail.length;i++){const t=this.trail[i];t.material.opacity=rolling?(.5-i*.028):0;t.material.color.setHex(BALL_COLORS[upgrades.ball||0]);t.position.copy(this.position(this.distance-i*1.1,this.lane,.82));t.scale.setScalar(1.6-i*.075);}
    for(const m of this.eventMeshes.values()) {
      const e=m.userData.event,ahead=e.at-this.distance;
      m.visible=!e.used&&(!active||(ahead>-.5&&ahead<360));
      if(e.type==='comet') {
        const drop=active?Math.max(0,Math.min(1,ahead/100))*8:0;
        m.children[0].rotation.y+=dt;m.children[0].position.y=1.1+drop;m.children[1].position.y=1.8+drop;
      }else if(e.type==='ufo'||e.type==='alien') {
        const hover=Math.sin(this.time*(e.type==='ufo'?2:3)+e.at)*.13;
        m.position.copy(this.position(e.at,e.lane,.1+hover));
      }else if(e.type==='coins')for(const c of m.children)c.rotation.y+=dt*2;
    }
    for(let i=this.effects.length-1;i>=0;i--){const e=this.effects[i];e.life-=dt;e.mesh.position.addScaledVector(e.v,dt);e.v.y-=dt*10;e.mesh.material.opacity=Math.max(0,e.life/.7);if(e.life<=0){this.scene.remove(e.mesh);e.mesh.material.dispose();this.effects.splice(i,1);}}
    this.renderer.render(this.scene,this.camera);
  }
  disposeObject(object,skipModels=false) {object.traverse(o=>{if(!o.isMesh)return;if(skipModels&&Object.values(this.models||{}).some(m=>{let yes=false;m.traverse(n=>{if(n.geometry===o.geometry)yes=true;});return yes;}))return;o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});}
  dispose(){this.abort=true;this.disposeObject(this.scene);for(const model of Object.values(this.models))this.disposeObject(model);this.effectGeometry.dispose();this.renderer.dispose();}
}
