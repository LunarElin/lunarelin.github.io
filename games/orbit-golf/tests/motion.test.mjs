import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.js';
import { OrbitScene } from '../scene.mjs';
import { courseSample, COURSE_WORLD_PER_METER as W } from '../course.mjs';
import { newProfile, newRun, placeRun, stepRun, BALL_RADIUS } from '../rules.mjs';

// Real scene/camera and real fixed-step rules. No GPU/device/FPS performance claim.
function sceneHarness() {
  const scene=Object.create(OrbitScene.prototype);
  Object.assign(scene,{
    scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(70,390/844,.1,650),
    renderer:{render(){},dispose(){}},railMaterial:new THREE.MeshStandardMaterial(),
    models:{},track:new THREE.Group(),distantTracks:[],ball:new THREE.Group(),
    ballBody:new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS),new THREE.MeshStandardMaterial()),
    shadow:new THREE.Mesh(new THREE.CircleGeometry(.78),new THREE.MeshBasicMaterial()),
    astronaut:new THREE.Group(),eventGroup:new THREE.Group(),eventMeshes:new Map(),
    trail:[],trailHistory:[],effects:[],hitAnimations:new Map(),effectGeometry:new THREE.OctahedronGeometry(.14),
    previewEvents:[],lastTrack:-1,time:0,frame:0,impact:0,x:0,look:new THREE.Vector3(),mobile:true,reducedMotion:true,
  });
  scene.ball.add(scene.ballBody);scene.scene.add(scene.track,scene.ball,scene.shadow,scene.eventGroup);
  return scene;
}
function flight() { const profile={...newProfile(),tutorialComplete:true};const run=newRun(profile,1,42,0);run.events=[];return{profile,run}; }
function setPose(run,{s=run.s,x=run.x,y=run.worldY,rotation=run.rotation}={}) {
  Object.assign(run,{s,x,worldY:y,previousS:s,previousX:x,previousWorldY:y,rotation,previousRotation:[...rotation],accumulator:0});
}
const near=(actual,expected,epsilon=1e-7)=>assert.ok(Math.abs(actual-expected)<epsilon,`${actual} != ${expected}`);

// The interpolation oracle is a midpoint in world space, not a sampled floor frame.
test('render interpolation blends world centres and freezes the last displayed pose while paused',()=>{
  const scene=sceneHarness(),{run}=flight();
  Object.assign(run,{previousS:80,s:100,previousX:-2,x:4,previousWorldY:40,worldY:50,accumulator:1/240});
  const pose=scene.readRunPose(run,'rolling');near(pose.s,90);near(pose.x,1);near(pose.worldY,45);
  run.s=500;run.x=8;run.worldY=100;run.accumulator=0;
  assert.deepEqual(scene.readRunPose(run,'paused'),pose,'pause must freeze the interpolated image, not snap to a newer physics pose');
  scene.dispose();
});

test('airborne centres and their shadows do not slide forward with terrain normals',()=>{
  const scene=sceneHarness(),{run}=flight();
  for(const seed of[17,42])for(const s of[100,1216,2288,4500]){
    run.seed=seed;setPose(run,{s,x:2.25,y:80});
    scene.render(1/60,run,'rolling');
    near(scene.ball.position.x,-2.25);near(scene.ball.position.z+scene.origin.forward,s*W);
    near(scene.ball.position.y+scene.origin.height,80);
    near(scene.shadow.position.x,scene.ball.position.x);near(scene.shadow.position.z,scene.ball.position.z);
    assert.ok(scene.shadow.position.y<scene.ball.position.y,'the shadow stays on the ground while the centre follows a world-space arc');
  }
  scene.dispose();
});

test('physics quaternion interpolation is the sole ball orientation and does not stretch with vertical speed',()=>{
  const scene=sceneHarness(),{run}=flight(),end=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);
  setPose(run,{s:1216,x:0,y:80,rotation:end.toArray()});run.previousRotation=[0,0,0,1];run.accumulator=1/240;
  run.vy=30;run.curveSpin=40;scene.render(.1,run,'rolling');
  const halfway=new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(),end,.5);
  assert.ok(scene.ballBody.quaternion.angleTo(halfway)<1e-7);assert.ok(scene.ball.quaternion.angleTo(new THREE.Quaternion())<1e-7);
  assert.ok(scene.ball.scale.distanceTo(new THREE.Vector3(1,1,1))<1e-8,'an ordinary airborne ball must not continuously stretch with vy');
  scene.dispose();
});

function renderAtRate(fps) {
  const scene=sceneHarness(),{run}=flight();
  setPose(run,{s:200,x:0,y:100});scene.render(0,run,'ready');
  for(let frame=1;frame<=fps;frame++){
    const t=frame/fps;setPose(run,{s:200+40*t,x:2*t,y:100+3*t});run.elapsed=t;
    scene.render(1/fps,run,'rolling');
  }
  scene.camera.updateMatrixWorld(true);
  return {scene,offset:scene.camera.position.clone().sub(scene.ball.position),look:scene.look.clone().sub(scene.ball.position),fov:scene.camera.fov,
    projected:scene.ball.position.clone().project(scene.camera),tail:scene.trailHistory.map(p=>p.clone().add(new THREE.Vector3(0,scene.origin.height,scene.origin.forward)))};
}

test('ten to 144 rendered frames per second give the same chase transition and half-second trail',()=>{
  const base=renderAtRate(60);
  for(const fps of[10,30,144]){
    const value=renderAtRate(fps);
    assert.ok(value.offset.distanceTo(base.offset)<1e-6,`chase offset depends on ${fps} fps`);
    assert.ok(value.look.distanceTo(base.look)<1e-6,`look lead depends on ${fps} fps`);
    near(value.fov,base.fov,1e-6);assert.ok(value.projected.distanceTo(base.projected)<1e-6);
    assert.equal(value.tail.length,32);assert.equal(value.tail.length,base.tail.length);
    for(let i=0;i<base.tail.length;i++)assert.ok(value.tail[i].distanceTo(base.tail[i])<1e-6,`trail ${i} depends on ${fps} fps`);
    value.scene.dispose();
  }
  base.scene.dispose();
});

test('speed loss changes speed-line length without teleporting the lines along the course',()=>{
  const scene=sceneHarness(),{run}=flight();scene.reducedMotion=false;
  scene.streakGeometry=new THREE.BufferGeometry();scene.streakGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(36*6),3));
  scene.streaks=new THREE.LineSegments(scene.streakGeometry,new THREE.LineBasicMaterial());scene.scene.add(scene.streaks);
  setPose(run,{s:200,x:0,y:100});run.speed=150;scene.render(.4,run,'rolling');const before=scene.streakGeometry.attributes.position.array.slice();
  run.speed=55;scene.render(.1,run,'rolling');const after=scene.streakGeometry.attributes.position.array;
  for(let i=0;i<36;i++)for(let axis=0;axis<3;axis++)near(after[i*6+axis],before[i*6+axis],1e-6);
  assert.notEqual(after[5],before[5],'the fixture must actually exercise a different line length');scene.dispose();
});

test('a rolling ball turns one revolution per circumference of actual surface travel',()=>{
  const{profile,run}=flight();run.speed=40;run.vx=0;placeRun(run,{s:0,x:0});run.events=[];run.eventTrack=run.track;run.nextGuardianLap=1000000;
  const circumference=2*Math.PI*BALL_RADIUS;let travel=0,turn=0,steps=0;
  while(travel<circumference&&steps++<500){
    const before={s:run.s,y:run.worldY,q:new THREE.Quaternion().fromArray(run.rotation)};
    stepRun(run,profile,1/120);run.events=[];run.eventTrack=run.track;
    travel+=Math.hypot((run.s-before.s)*W,run.worldY-before.y);
    turn+=before.q.angleTo(new THREE.Quaternion().fromArray(run.rotation));
  }
  assert.ok(steps<500);assert.ok(run.grounded);assert.ok(Math.abs(turn-travel/BALL_RADIUS)<.02,'rolling must not use an unrelated render-time rotation multiplier');
});

test('a large floating-origin translation preserves the ball framing and world centre',()=>{
  const scene=sceneHarness(),{run}=flight();let initial;
  for(const s of[100,10000100]){
    const y=courseSample(s,run.seed).height+100;setPose(run,{s,x:2,y});scene.render(0,run,'rolling');scene.camera.updateMatrixWorld(true);
    const point=scene.ball.position.clone().project(scene.camera);
    if(initial)assert.ok(point.distanceTo(initial)<1e-6);else initial=point;
    near(scene.ball.position.z+scene.origin.forward,s*W,1e-6);near(scene.ball.position.y+scene.origin.height,y,1e-6);
  }
  scene.dispose();
});

test('flying props use the same substep interpolation clock as the ball',()=>{
  const scene=sceneHarness(),{run}=flight();setPose(run,{s:100,x:0,y:12});
  run.previousS=96;run.previousX=-2;run.previousWorldY=8;run.accumulator=1/480;
  const event={id:'moving-anvil',type:'anvil',at:100,x:0,height:1.6,radius:1.8,seed:run.seed,
    body:{active:true,wheel:run.wheel,s:104,x:2,worldY:16,height:5,rx:1,ry:.8,rz:.4,
      previousS:100,previousX:0,previousWorldY:12,previousRx:0,previousRy:0,previousRz:0,life:3}};
  run.events=[event];scene.render(1/60,run,'rolling');
  const mesh=scene.eventMeshes.get(event.id);scene.scene.updateMatrixWorld(true);
  const center=new THREE.Vector3(0,event.height,0).applyMatrix4(mesh.matrixWorld);
  near(center.x,-.5);near(center.y+scene.origin.height,13);near(center.z+scene.origin.forward,101*W);
  near(mesh.userData.visual.rotation.x,.25);near(mesh.userData.visual.rotation.y,.2);scene.dispose();
});

function occlusionBox(scene,id,point,material=new THREE.MeshStandardMaterial(),geometry=new THREE.BoxGeometry(2,2,2)) {
  const root=new THREE.Group(),visual=new THREE.Group(),part=new THREE.Mesh(geometry,material);
  visual.add(part);root.add(visual);root.position.copy(point);
  root.userData={event:{id,radius:1},visual,centerHeight:1};scene.eventGroup.add(root);scene.eventMeshes.set(id,root);
  return {root,visual,part,material,geometry};
}

test('only a visible obstacle actually intersecting the camera-to-ball segment fades',()=>{
  const scene=sceneHarness();scene.camera.position.set(0,0,-20);scene.ball.position.set(0,0,0);
  const middle=occlusionBox(scene,'blocking',new THREE.Vector3(0,0,-10)),
    ahead=occlusionBox(scene,'ahead',new THREE.Vector3(0,0,5)),
    side=occlusionBox(scene,'side',new THREE.Vector3(5,0,-10)),
    behind=occlusionBox(scene,'behind',new THREE.Vector3(0,0,-25)),
    hollow=occlusionBox(scene,'bounds-only',new THREE.Vector3(0,0,-15));
  hollow.part.position.x=2.2; // Its collider sphere touches the ray; its actual art does not.
  scene.updateCameraOcclusion(true);
  assert.equal(middle.visual.userData.cameraFade.active,true);
  near(middle.part.material.opacity,.14);assert.equal(middle.part.material.depthWrite,false);
  for(const item of[ahead,side,behind,hollow])assert.equal(item.part.material,item.material);
  // A transparent render binding cannot make the next ray test blink clear.
  const clone=middle.part.material;scene.updateCameraOcclusion(true);assert.equal(middle.part.material,clone);
  middle.root.position.z=-20;scene.updateCameraOcclusion(true);
  assert.equal(middle.visual.userData.cameraFade.active,true,'front-sided art must still fade when it encloses the camera');
  middle.root.position.z=-10;
  middle.part.visible=false;scene.updateCameraOcclusion(true);assert.equal(middle.part.material,middle.material);
  middle.part.visible=true;middle.root.position.x=6;scene.updateCameraOcclusion(true);
  assert.equal(middle.visual.userData.cameraFade.active,false);assert.equal(middle.part.material,middle.material);
  assert.equal(middle.material.opacity,1);assert.equal(middle.material.transparent,false);assert.equal(middle.material.depthWrite,true);
  scene.dispose();
});

test('fading isolates shared model materials, restores bindings, and releases only its cached clones',()=>{
  const scene=sceneHarness();scene.camera.position.set(0,0,-20);scene.ball.position.set(0,0,0);
  const shared=new THREE.MeshStandardMaterial({transparent:true,opacity:.8,depthWrite:true}),geometry=new THREE.BoxGeometry(2,2,2),
    middle=occlusionBox(scene,'shared-blocker',new THREE.Vector3(0,0,-10),shared,geometry),
    side=occlusionBox(scene,'shared-side',new THREE.Vector3(5,0,-10),shared,geometry);
  // GLTF clones intentionally share geometry and materials with the cached source model.
  const source=new THREE.Group();source.add(new THREE.Mesh(geometry,shared));scene.models.shared=source;
  const sharedFaces=Array(6).fill(shared),extra=new THREE.Mesh(geometry,sharedFaces);middle.visual.add(extra);
  let cloneDisposals=0,sourceDisposals=0,geometryDisposals=0;
  shared.addEventListener('dispose',()=>sourceDisposals++);geometry.addEventListener('dispose',()=>geometryDisposals++);
  scene.updateCameraOcclusion(true);const faded=middle.part.material;faded.addEventListener('dispose',()=>cloneDisposals++);
  assert.notEqual(faded,shared);near(faded.opacity,.8*.14);assert.equal(side.part.material,shared);
  assert.equal(extra.material[0],faded);assert.equal(extra.material[1],faded);near(shared.opacity,.8);assert.equal(shared.depthWrite,true);
  shared.emissiveIntensity=2.4;scene.updateCameraOcclusion(true);near(faded.emissiveIntensity,2.4);
  scene.updateCameraOcclusion(false);assert.equal(middle.part.material,shared);assert.equal(extra.material,sharedFaces);
  scene.updateCameraOcclusion(true);assert.equal(middle.part.material,faded,'repeat occlusion reuses the event-local clone');
  scene.lastTrack=0;scene.lastEvents=[middle.root.userData.event,side.root.userData.event];scene.syncEvents([],0);
  assert.equal(cloneDisposals,1);assert.equal(sourceDisposals,0);assert.equal(geometryDisposals,0);
  assert.equal(middle.part.material,shared);assert.equal(middle.visual.userData.cameraFade,undefined);
  scene.dispose();
});

test('a flying giant alien fades at its displayed world centre, freezes on pause, and clears after an origin shift',()=>{
  const scene=sceneHarness(),{run}=flight();setPose(run,{s:165,x:0,y:100});
  const s=run.s-10/W,event={id:'occluding-alien',type:'giant-alien',at:s,x:0,height:2.4,radius:2.5,seed:run.seed,
    body:{active:true,wheel:run.wheel,s,x:0,worldY:103.25,height:5,rx:0,ry:0,rz:0,
      previousS:s,previousX:0,previousWorldY:103.25,previousRx:0,previousRy:0,previousRz:0,life:3}};
  run.events=[event];const physics=JSON.stringify(event.body);scene.render(0,run,'rolling');
  const visual=scene.eventMeshes.get(event.id).userData.visual;
  assert.equal(visual.userData.cameraFade?.active,true,'the actual alien body must intersect the chase view');
  assert.equal(JSON.stringify(event.body),physics,'visibility must never change physics state');
  const original=visual.userData.cameraFade.records.find(record=>record.mesh.name==='alien-pear-body');
  assert.ok(original);assert.notEqual(original.mesh.material,original.original);
  event.body.x=8;event.body.previousX=8;scene.render(.5,run,'paused');
  assert.equal(visual.userData.cameraFade.active,true,'a paused view keeps its material bindings frozen');
  scene.render(0,run,'rolling');assert.equal(visual.userData.cameraFade.active,false);assert.equal(original.mesh.material,original.original);
  const distant=10000165;setPose(run,{s:distant,x:0,y:100});
  Object.assign(event.body,{s:distant-10/W,previousS:distant-10/W,x:0,previousX:0});
  scene.render(0,run,'rolling');assert.equal(visual.userData.cameraFade.active,true,'a floating origin must preserve the camera-to-alien intersection');
  scene.dispose();
});
