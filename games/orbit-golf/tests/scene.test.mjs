import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.js';
import { OrbitScene, BALL_HEIGHT } from '../scene.mjs';
import { courseSample, coursePattern, COURSE_WORLD_PER_METER } from '../course.mjs';
import { newProfile, newRun, placeRun, eventPose, BALL_RADIUS, TRACK_WIDTH, SIDE_LIMIT } from '../rules.mjs';
import { CHALLENGES, challengeEvents, createChallenge } from '../challenges.mjs';

// Actual Three.js geometry, camera and animation math; no GPU/device claims.
function harness(width=390,height=844) {
  const scene=Object.create(OrbitScene.prototype);
  Object.assign(scene,{
    scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(width<650?70:60,width/height,.1,650),
    renderer:{render(){},dispose(){this.disposed=true;}},railMaterial:new THREE.MeshStandardMaterial(),
    models:{},track:new THREE.Group(),distantTracks:[],ball:new THREE.Group(),
    ballBody:new THREE.Mesh(new THREE.SphereGeometry(1.05),new THREE.MeshStandardMaterial()),
    shadow:new THREE.Mesh(new THREE.CircleGeometry(.78),new THREE.MeshBasicMaterial()),
    astronaut:new THREE.Group(),eventGroup:new THREE.Group(),eventMeshes:new Map(),
    trail:[],trailHistory:[],effects:[],hitAnimations:new Map(),effectGeometry:new THREE.OctahedronGeometry(.14),
    previewEvents:[],lastTrack:-1,time:0,frame:0,impact:0,x:0,look:new THREE.Vector3(),mobile:width<650,reducedMotion:true,
  });
  scene.ball.add(scene.ballBody);scene.scene.add(scene.track,scene.ball,scene.shadow,scene.eventGroup);return scene;
}
function runFixture(){const profile=newProfile();profile.tutorialComplete=true;const run=newRun(profile,1,42);run.events=[];return run;}
function project(scene,point=scene.ball.position){scene.camera.updateMatrixWorld();return point.clone().project(scene.camera);}
// These are deliberately posed scene fixtures, not simulated flights. Reposition
// them through the same explicit API as QA; temporal physics tests live in motion.test.
function frame(scene,run,mode='rolling',dt=1/60){
  placeRun(run,{s:run.s,x:run.x,height:run.height,vy:run.vy});
  for(const event of run.events){
    event.seed??=run.seed;
    if(event.body){const b=event.body;b.worldY=courseSample(b.s,run.seed).height+(event.height||1.05)+(b.height||0);b.worldVy=b.vy||0;}
  }
  scene.render(dt,run,mode);return project(scene);
}
function worldPoint(scene,s,x,worldY){return new THREE.Vector3(-x,worldY-scene.origin.height,s*COURSE_WORLD_PER_METER-scene.origin.forward);}
function posePosition(scene,pose,h=1.05){return Number.isFinite(pose.worldY)?worldPoint(scene,pose.s,pose.x,pose.worldY-h):scene.position(pose.s,pose.x,pose.height);}
const viewports=[[320,568],[320,844],[390,844],[1440,900]];

test('continuous x and airborne height map directly without snapping to lanes',()=>{
  const scene=harness(),run=runFixture();
  for(const s of [-13.2,0,53.7,180,381.4])for(const x of [-SIDE_LIMIT,-.43,.27,6.615,SIDE_LIMIT])for(const height of [0,2.7,6]) {
    const point=scene.position(s,x,BALL_HEIGHT+height);assert.equal(point.x,-x);
    const base=scene.position(s,x,0);assert.ok(Math.abs(point.distanceTo(base)-(BALL_HEIGHT+height))<1e-8);
    assert.ok(Math.abs(base.y-courseSample(s).height)<1e-8);assert.ok(Math.abs(base.z-s*COURSE_WORLD_PER_METER)<1e-8);
  }
  run.distance=500;run.s=157.4;run.x=1.73;run.height=3.2;frame(scene,run);
  assert.ok(scene.ball.position.distanceTo(worldPoint(scene,run.s,run.x,run.worldY))<1e-8);
  const before=scene.position(run.s,run.x,0);run.s-=11.5;run.x=-.61;run.speed=-24;frame(scene,run);
  assert.equal(scene.distance,run.s);assert.equal(run.distance,500);assert.ok(Math.abs(before.x-scene.ball.position.x)>2);
});

test('level chase framing retains the airborne ball across hills and distant sections on mobile and desktop',()=>{
  for(const [width,height] of viewports) {
    const scene=harness(width,height),run=runFixture();run.speed=160;
    for(const air of [0,2.5,6,8])for(const x of [-SIDE_LIMIT,0,SIDE_LIMIT])for(const s of [0,50,180,360,500,720,1300,3570,7200,10000000]) {
      run.s=s;run.x=x;run.height=air;const point=frame(scene,run);
      assert.ok(Math.abs(point.x)<.8,'horizontal frame '+width+', x '+x+', air '+air);
      assert.ok(point.y>-.75&&point.y<.2,'vertical frame '+width+', air '+air+': '+point.y);
      assert.ok(scene.camera.up.distanceTo(new THREE.Vector3(0,1,0))<1e-8);
      const right=new THREE.Vector3().setFromMatrixColumn(scene.camera.matrixWorld,0);assert.ok(Math.abs(right.y)<1e-8,'horizon must never roll on a hill');
      assert.ok(scene.camera.position.length()<60&&scene.ball.position.length()<15,'floating origin keeps distant sections near the camera');
      if(air===0&&x===0&&s===180){const right=new THREE.Vector3().setFromMatrixColumn(scene.camera.matrixWorld,0);const edge=project(scene,scene.ball.position.clone().addScaledVector(right,1.05));assert.ok(Math.abs(edge.x-point.x)*width>=30);}
    }
  }
});

test('ready mode clears mobile launch controls and transitions without a sudden camera jump',()=>{
  for(const [width,height] of [[320,568],[390,844]]) {
    const scene=harness(width,height),run=runFixture();run.phase='ready';scene.render(1/60,null,'lobby');
    let ready;for(let i=0;i<60;i++)ready=frame(scene,run,'ready');assert.ok(Math.abs(ready.y)<.15);
    const up=new THREE.Vector3().setFromMatrixColumn(scene.camera.matrixWorld,1),edge=project(scene,scene.ball.position.clone().addScaledVector(up,1.05));
    assert.ok((1-ready.y)*height/2+Math.abs(edge.y-ready.y)*height/2<height*.6);
    run.phase='rolling';let previous=ready,rolling;
    for(let i=0;i<60;i++){rolling=frame(scene,run);assert.ok(Math.abs(rolling.y-previous.y)<.1);previous=rolling;}
    assert.ok(rolling.y<-.06&&rolling.y>-.4);
  }
});

test('logical left and right positions retain screen direction independently of camera centering',()=>{
  const scene=harness(),run=runFixture();
  for(let s=0;s<360;s+=15){
    run.s=s;run.x=0;frame(scene,run);
    const positions=[-8.37,-2.63,1.49,8.64].map(x=>project(scene,worldPoint(scene,s,x,run.worldY)).x);
    assert.ok(positions.every((x,i)=>i===0||x>positions[i-1]),'steering reverses at '+s);
  }
});

test('actual generated floor and rails never occlude ground or airborne balls across four viewports',()=>{
  for(const [width,height] of viewports) {
    const scene=harness(width,height),run=runFixture();scene.buildTrack();const ray=new THREE.Raycaster();
    for(const x of [-SIDE_LIMIT,0,SIDE_LIMIT])for(const air of [0,3,7])for(const s of [0,120,360,540,720,1000,3570,10000000]) {
      run.x=x;run.height=air;run.s=s;frame(scene,run);scene.track.updateMatrixWorld(true);
      const direction=scene.ball.position.clone().sub(scene.camera.position),front=direction.length()-1.05;ray.set(scene.camera.position,direction.normalize());
      assert.ok(!ray.intersectObject(scene.track,true).some(hit=>hit.distance<front-1e-6&&!(hit.object.material?.transparent&&hit.object.material.opacity<.1)),'occlusion '+width+'x'+height+', s '+s+', x '+x+', air '+air);
    }
    scene.disposeObject(scene.track);
  }
});

test('static props share their collider poses across the expanded width',()=>{
  const scene=harness(),run=runFixture();run.s=20;
  run.events=['alien','punch','bumper','spring','trap'].map((type,i)=>({id:type,type,at:40+i*20,x:.43,radius:.9,height:1.05,phase:.7,used:false}));
  for(const elapsed of [0,.37,1.4,2.9]){run.elapsed=elapsed;frame(scene,run);for(const event of run.events){const mesh=scene.eventMeshes.get(event.id),pose=eventPose(event,elapsed);assert.ok(mesh.position.distanceTo(posePosition(scene,pose,event?.height||1.05))<1e-8);assert.ok(mesh.userData.visual.children.length>0);}}
});

test('adjacent track changes reuse shared event geometry and cues while disposing only departed objects',()=>{
  const scene=harness(),run=runFixture(),old={id:'old',type:'bumper',at:690,x:0},shared={id:'shared',type:'alien',at:735,x:1,direction:1},next={id:'next',type:'spring',at:780,x:-1};
  run.track=1;run.s=710;run.events=[old,shared];frame(scene,run);scene.burst({type:'alien',kind:'bounce',eventId:shared.id,effectDuration:1.8});frame(scene,run,'rolling',.1);
  const oldMesh=scene.eventMeshes.get(old.id),sharedMesh=scene.eventMeshes.get(shared.id),cue=sharedMesh.userData.cue,hit=scene.hitAnimations.get(shared.id),geometry=oldMesh.userData.visual.children[0].geometry;let disposed=0;geometry.addEventListener('dispose',()=>disposed++);
  run.track=2;run.s=730;run.events=[shared,next];frame(scene,run,'rolling',0);
  assert.equal(scene.eventMeshes.get(shared.id),sharedMesh);assert.equal(sharedMesh.userData.cue,cue);assert.equal(cue.visible,true);assert.equal(scene.hitAnimations.get(shared.id),hit,'an active shared cue must keep its elapsed reaction');
  assert.equal(scene.eventMeshes.has(old.id),false);assert.equal(oldMesh.parent,null);assert.equal(disposed,1);assert.equal(scene.eventMeshes.get(next.id).parent,scene.eventGroup);assert.equal(scene.eventGroup.children.length,2);
  const newReference={...shared,variant:2};run.events=[newReference,next];frame(scene,run,'rolling',0);assert.notEqual(scene.eventMeshes.get(shared.id),sharedMesh,'matching IDs from a new run or variant cannot reuse stale models');
  const beforeReset=scene.eventMeshes.get(shared.id),nextBefore=scene.eventMeshes.get(next.id);scene.lastTrack=-1;frame(scene,run,'rolling',0);
  assert.notEqual(scene.eventMeshes.get(shared.id),beforeReset);assert.notEqual(scene.eventMeshes.get(next.id),nextBefore,'an explicit model-load reset must still rebuild every event');assert.equal(scene.eventGroup.children.length,2);
});

test('obstacle silhouettes contain broad mechanical direction marks before contact',()=>{
  const scene=harness(320,568),run=runFixture();run.s=0;
  run.events=['bumper','spring','punch','alien','comet','trap','boost'].map(type=>({id:type,type,at:30,x:0,radius:.85,height:1.05,direction:1,used:false}));
  frame(scene,run);scene.scene.updateMatrixWorld(true);
  const object=type=>scene.eventMeshes.get(type).userData.visual;
  assert.equal(object('bumper').getObjectByName('rubber-ring').geometry.type,'TorusGeometry');
  assert.equal(object('spring').getObjectByName('compression-coil').geometry.type,'TubeGeometry');
  const up=object('spring').getObjectByName('up-arrow'),forward=object('punch').getObjectByName('forward-arrow');
  assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(up.quaternion).y>.99);
  assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(forward.quaternion).z>.99);
  const arrowBounds=new THREE.Box3().setFromObject(up),left=project(scene,arrowBounds.min),right=project(scene,arrowBounds.max);
  assert.ok(Math.abs(right.x-left.x)*320/2>=12,'jump symbol must occupy at least 12 CSS pixels at a near collision');
  assert.ok(object('alien').getObjectByName('curve-tip').position.x<0,'positive spin bends into local -X, which is screen right');
  assert.equal(object('comet').getObjectByName('reflection-facet').geometry.type,'IcosahedronGeometry');
  assert.equal(object('trap').children.filter(child=>child.name==='brake-bar').length,3);
  assert.equal(object('boost').children.filter(child=>child.name==='forward-arrow').length,3);
  for(const type of ['bumper','spring','punch','alien','comet','trap']) {
    const size=new THREE.Box3().setFromObject(object(type)).getSize(new THREE.Vector3());
    assert.ok(size.x>=1.2&&size.x<2.9,type+' must retain a substantial collider-sized silhouette');
  }
});

test('mobile chase cameras see the spring arrow head and coil through its open platform',()=>{
  for(const [width,height] of [[320,568],[390,844]])for(const ahead of [10,30,60])for(const elapsed of [0,.5,1]) {
    const scene=harness(width,height),run=runFixture();run.s=0;
    run.events=[{id:'jump',type:'spring',at:ahead,x:0,radius:.85,height:1.05,used:false}];
    frame(scene,run,'rolling',elapsed);scene.scene.updateMatrixWorld(true);scene.camera.updateMatrixWorld(true);
    const visual=scene.eventMeshes.get('jump').userData.visual,arrow=visual.getObjectByName('up-arrow'),cap=visual.getObjectByName('jump-platform'),coil=visual.getObjectByName('compression-coil');
    assert.equal(cap.geometry.type,'TorusGeometry','the jump platform must leave its coil visible');
    const ray=new THREE.Raycaster();
    for(const point of [[-.15,.2,.131],[.15,.2,.131],[0,.47,.131]]) {
      const target=arrow.localToWorld(new THREE.Vector3(...point)),ndc=project(scene,target);
      assert.ok(Math.abs(ndc.x)<1&&Math.abs(ndc.y)<1,'arrow head stays inside the chase frame');
      ray.set(scene.camera.position,target.clone().sub(scene.camera.position).normalize());
      const first=ray.intersectObject(visual,true)[0];
      assert.equal(first?.object,arrow,'jump platform must not cover the arrow head at '+width+'px, ahead '+ahead);
    }
    const positions=coil.geometry.attributes.position;let exposed=0;
    for(let index=0;index<positions.count;index+=12){const target=coil.localToWorld(new THREE.Vector3().fromBufferAttribute(positions,index));ray.set(scene.camera.position,target.clone().sub(scene.camera.position).normalize());if(ray.intersectObject(visual,true)[0]?.object===coil)exposed++;}
    assert.ok(exposed>=6,'multiple coil segments must remain visible below and through the platform');
  }
});

test('idle coil, piston and rotor demonstrate their action and stop powering once launched',()=>{
  const scene=harness(),run=runFixture();run.s=0;
  run.events=['spring','punch','alien'].map(type=>({id:type,type,at:30,x:0,radius:.85,height:1.05,direction:1,used:false}));
  frame(scene,run,'rolling',.1);
  const parts=type=>scene.eventMeshes.get(type).userData.mechanism;
  const before={cap:parts('spring').cap.position.y,piston:parts('punch').piston.position.z,rotor:parts('alien').rotor.rotation.y};
  frame(scene,run,'rolling',.2);
  assert.notEqual(parts('spring').cap.position.y,before.cap);assert.notEqual(parts('punch').piston.position.z,before.piston);assert.ok(parts('alien').rotor.rotation.y<before.rotor);
  const frozen=parts('alien').rotor.rotation.y;frame(scene,run,'paused',1);assert.equal(parts('alien').rotor.rotation.y,frozen);
  for(const event of run.events){event.used=true;event.body={active:true,wheel:0,s:35,x:1,height:2,rx:.5,ry:.7,rz:.2,life:3};}
  frame(scene,run,'rolling',.2);
  assert.equal(parts('alien').rotor.rotation.y,0);assert.equal(parts('punch').piston.position.z,0);assert.equal(parts('spring').coil.scale.y,1);
  for(const mesh of scene.eventMeshes.values()){assert.equal(mesh.userData.cue.visible,false);assert.equal(mesh.userData.visual.rotation.y,.7);}
});

test('both spin signs agree between the entry curve, rotating guide and physical screen direction',()=>{
  for(const direction of [-1,1]) {
    const scene=harness(),run=runFixture();run.s=0;run.events=[{id:'spin',type:'alien',at:30,x:0,height:1.05,radius:.85,direction,used:false}];
    frame(scene,run,'rolling',.01);const mesh=scene.eventMeshes.get('spin'),tip=mesh.userData.visual.getObjectByName('curve-tip');
    assert.ok(tip.position.x*direction<0);
    scene.burst({type:'alien',eventId:'spin',kind:'bounce',powered:true,effectDirection:direction,effectDuration:1.8});frame(scene,run,'rolling',.15);
    const turn=new THREE.Vector3(0,0,1).applyEuler(mesh.userData.cue.rotation);
    assert.ok(turn.x*direction<0,'cue must rotate from forward toward the real spin direction');
    frame(scene,run,'rolling',1.4);assert.equal(mesh.userData.cue.visible,true,'visual rotation should cover the applied 1.8 second effect');
    frame(scene,run,'rolling',.3);assert.equal(mesh.userData.cue.visible,false);
  }
});

test('the ball uses the physics quaternion without adding velocity-based render rotation',()=>{
  const scene=harness(),run=runFixture(),orientation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.4,.7,-.2));
  run.rotation=orientation.toArray();run.speed=30;run.vx=5;run.curveSpin=18;
  frame(scene,run,'rolling',.1);assert.ok(scene.ballBody.quaternion.angleTo(orientation)<1e-7);
  frame(scene,run,'paused',1);assert.ok(scene.ballBody.quaternion.angleTo(orientation)<1e-7);
  run.speed=-80;run.vx=-12;run.curveSpin=-18;frame(scene,run,'rolling',.1);
  assert.ok(scene.ballBody.quaternion.angleTo(orientation)<1e-7,'rendering cannot invent another rotation outside the simulation');
  assert.ok(scene.ball.quaternion.angleTo(new THREE.Quaternion())<1e-7,'the parent must not re-attach the airborne ball to terrain pitch');
});

const guardianFixture=()=>({id:'guardian:10',type:'guardian',at:3570,x:0,width:20,height:5,barrierHeight:10,radius:10,requiredForce:170,broken:false,used:false});
test('the guardian has a full-width armored silhouette and responds locally to insufficient impact',()=>{
  const scene=harness(),run=runFixture(),event=guardianFixture();run.s=3540;run.events=[event];frame(scene,run);scene.scene.updateMatrixWorld(true);
  const mesh=scene.eventMeshes.get(event.id),guardian=mesh.userData.mechanism.guardian,local=new THREE.Box3();
  mesh.traverse(part=>{const positions=part.geometry?.attributes.position;if(!positions)return;for(let i=0;i<positions.count;i++){const point=part.localToWorld(new THREE.Vector3().fromBufferAttribute(positions,i));local.expandByPoint(mesh.worldToLocal(point));}});
  assert.ok(local.min.x< -9.5&&local.max.x>9.5&&local.max.y>9.8,'the guardian must visually cover its physical width and height');
  assert.equal(guardian.eyes.length,2);assert.equal(mesh.userData.visual.getObjectsByProperty('name','guardian-fracture').length,6);
  scene.burst({type:'guardian',kind:'guardian-block',eventId:event.id,s:event.at,x:2,height:0,force:80,requiredForce:170});
  const contact=scene.position(event.at,2,BALL_HEIGHT);assert.ok(scene.effects.every(effect=>effect.mesh.position.distanceTo(contact)<1e-8),'shield sparks must start at the actual ball contact');
  frame(scene,run,'rolling',.2);assert.ok(guardian.halves.every(half=>half.position.z<0));assert.ok(guardian.eyes.every(material=>material.emissiveIntensity>1.5));
  const z=guardian.halves[0].position.z,life=scene.hitAnimations.get(event.id).life;frame(scene,run,'paused',1);assert.equal(guardian.halves[0].position.z,z);assert.equal(scene.hitAnimations.get(event.id).life,life);
  frame(scene,run,'rolling',1);assert.equal(event.broken,false);assert.ok(guardian.halves.every(half=>Math.abs(half.position.x)===5&&half.position.z===0));
});

test('a broken guardian leaves permanent open wreckage after its hit animation and cache rebuild',()=>{
  const scene=harness(),run=runFixture(),event=guardianFixture();run.s=event.at+5;run.events=[event];frame(scene,run);
  event.broken=true;event.used=true;scene.burst({type:'guardian',kind:'guardian-break',eventId:event.id,s:event.at,x:0,height:0,force:200,requiredForce:170});frame(scene,run,'rolling',.1);
  let mesh=scene.eventMeshes.get(event.id),guardian=mesh.userData.mechanism.guardian;assert.equal(mesh.visible,true);assert.ok(guardian.halves.every(half=>Math.abs(half.position.x)>16));
  const before=guardian.halves[0].position.clone();frame(scene,run,'paused',1);assert.ok(guardian.halves[0].position.equals(before));
  frame(scene,run,'rolling',2);assert.equal(scene.hitAnimations.has(event.id),false);assert.equal(mesh.visible,true);assert.ok(guardian.eyes.every(material=>material.emissiveIntensity<.1));
  run.events=[{...event}];scene.lastTrack=-1;frame(scene,run);mesh=scene.eventMeshes.get(event.id);guardian=mesh.userData.mechanism.guardian;
  assert.equal(mesh.visible,true);assert.ok(guardian.halves.every(half=>Math.abs(half.position.x)>17),'revisiting cannot close a previously broken gate');
  for(let i=0;i<12;i++)scene.burst({type:'guardian',kind:'guardian-break',eventId:event.id,s:event.at,x:0,height:0});assert.equal(scene.effects.length,48);
});

test('guardian armor sparks use the struck front face even when its event mesh exists',()=>{
  for(const kind of ['guardian-block','guardian-break']) {
    const scene=harness(),run=runFixture(),event=guardianFixture();event.depth=3.2;run.s=event.at-8;run.events=[event];frame(scene,run);
    const contactS=3566.014,contactX=6,contactHeight=3.998;
    scene.burst({type:'guardian',kind,eventId:event.id,s:contactS,x:contactX,height:contactHeight,force:kind==='guardian-break'?210:80,requiredForce:170});
    const actualContact=scene.position(contactS,contactX,BALL_HEIGHT+contactHeight),wrongCenter=scene.position(event.at,contactX,BALL_HEIGHT+contactHeight);
    assert.ok(actualContact.distanceTo(wrongCenter)>1,'the armor front must be measurably separate from its center');
    assert.ok(scene.effects.length>0&&scene.effects.every(effect=>effect.mesh.position.distanceTo(actualContact)<1e-8),'fragments must originate at feedback.s on the struck armor face');
  }
});

test('guardian break throws visible metallic armor chunks while block keeps small sparks',()=>{
  for(const [width,height] of [[320,568],[390,844]]) {
    const samples={};
    for(const kind of ['guardian-block','guardian-break']) {
      const scene=harness(width,height),run=runFixture(),event=guardianFixture();run.s=event.at-8;run.events=[event];frame(scene,run);
      scene.burst({type:'guardian',kind,eventId:event.id,s:3566.014,x:0,height:0});
      const effect=scene.effects[0],right=new THREE.Vector3().setFromMatrixColumn(scene.camera.matrixWorld,0),radius=.14*effect.scale;
      const left=project(scene,effect.mesh.position.clone().addScaledVector(right,-radius)),edge=project(scene,effect.mesh.position.clone().addScaledVector(right,radius));
      samples[kind]=Math.abs(edge.x-left.x)*width/2;
      if(kind==='guardian-break') {
        assert.ok(scene.effects.every(part=>part.mesh.material.isMeshStandardMaterial&&part.total<1),'broken armor must be shaded metal that clears within a second');
        assert.equal(new Set(scene.effects.map(part=>part.mesh.material.color.getHex())).size,2);
        const position=effect.mesh.position.clone(),angle=effect.mesh.rotation.clone(),life=effect.life;frame(scene,run,'paused',1);
        assert.ok(effect.mesh.position.equals(position));assert.ok(effect.mesh.rotation.equals(angle));assert.equal(effect.life,life);
        frame(scene,run,'rolling',.4);assert.equal(scene.effects.length,14);assert.notEqual(effect.mesh.rotation.x,angle.x);
        frame(scene,run,'rolling',.5);assert.equal(scene.effects.length,0,'large armor chunks must not linger across the chase view');
      } else assert.ok(scene.effects.every(part=>part.mesh.material.isMeshBasicMaterial));
      scene.dispose();
    }
    assert.ok(samples['guardian-break']>=6&&samples['guardian-break']>samples['guardian-block']*4,'armor pieces must be visibly larger than shield sparks on a real mobile projection');
  }
});

test('guardian wreckage never covers the chased ball across the full width and airborne height',()=>{
  for(const [width,height] of [[320,568],[390,844],[1280,720]])for(const offset of [-12,0,3,30])for(const x of [-SIDE_LIMIT,0,SIDE_LIMIT])for(const air of [0,7.5])for(const progress of [0,.3,1.7]) {
    const scene=harness(width,height),run=runFixture(),event=guardianFixture();event.broken=true;event.used=true;run.events=[event];run.s=event.at+offset;run.x=x;run.height=air;
    frame(scene,run,'rolling',0);scene.burst({type:'guardian',kind:'guardian-break',eventId:event.id,s:event.at,x,height:air});frame(scene,run,'rolling',progress);scene.scene.updateMatrixWorld(true);scene.camera.updateMatrixWorld(true);
    const mesh=scene.eventMeshes.get(event.id),ray=new THREE.Raycaster(),direction=scene.ball.position.clone().sub(scene.camera.position),front=direction.length()-1.05;
    ray.set(scene.camera.position,direction.normalize());assert.ok(!ray.intersectObject(mesh,true).some(hit=>hit.distance<front-1e-6),`guardian wreck occlusion ${width}px, offset ${offset}, x ${x}, air ${air}, progress ${progress}`);
    scene.dispose();
  }
});

test('the approaching intact guardian remains ahead of the chased ball on the descending course',()=>{
  for(const [width,height] of [[320,568],[390,844],[1280,720]])for(const ahead of [5,12,30,60,90,120,180])for(const x of [-SIDE_LIMIT,0,SIDE_LIMIT])for(const air of [0,7.5]) {
    const scene=harness(width,height),run=runFixture(),event=guardianFixture();run.events=[event];run.s=event.at-ahead;run.x=x;run.height=air;frame(scene,run);scene.scene.updateMatrixWorld(true);scene.camera.updateMatrixWorld(true);
    const mesh=scene.eventMeshes.get(event.id),direction=scene.ball.position.clone().sub(scene.camera.position),front=direction.length()-1.05,ray=new THREE.Raycaster();ray.set(scene.camera.position,direction.normalize());
    assert.ok(!ray.intersectObject(mesh,true).some(hit=>hit.distance<front),`intact guardian covers ball ${width}px, ahead ${ahead}, x ${x}, air ${air}`);scene.dispose();
  }
});

test('compound wave marks describe the actual object motion instead of inventing a second effect',()=>{
  const scene=harness(),run=runFixture();run.s=0;
  run.events=[
    {id:'moving',type:'bumper',at:30,x:0,gimmick:'sweep',motion:'sweep',amplitude:3.8,frequency:1.4},
    {id:'boost',type:'boost',at:45,x:0,gimmick:'boost-ramp'},
    {id:'piston',type:'punch',at:60,x:0,gimmick:'piston-bank'},
    {id:'recovery',type:'punch',at:75,x:0,gimmick:'brake-gauntlet'},
  ];frame(scene,run);run.elapsed=1;frame(scene,run);
  const moving=scene.eventMeshes.get('moving'),pose=eventPose(run.events[0],run.elapsed);assert.ok(moving.position.distanceTo(posePosition(scene,pose))<1e-8);
  for(const id of ['boost','piston'])for(const arrow of scene.eventMeshes.get(id).userData.mechanism.gimmick.children.filter(part=>part.geometry?.type==='ExtrudeGeometry'))assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(arrow.quaternion).z>.99,'propulsion arrows must remain forward');
  assert.equal(scene.eventMeshes.get('recovery').userData.mechanism.gimmick.children.length,0,'a recovery piston must not wear braking jaws');
});

test('flying props follow actual body position and orientation through a chain without cosmetic teleporting',()=>{
  const scene=harness(),run=runFixture();run.s=70;
  run.events=['alien','punch','bumper'].map((type,index)=>({id:type,type,at:80+index*5,x:0,height:1.05,used:true,body:{active:true,wheel:0,s:90+index*7,x:7-index*4,height:2+index,rx:.7+index,ry:1.3,rz:-.4,life:3}}));
  for(const event of run.events)scene.burst({kind:'chain',type:event.type,eventId:event.id,s:event.body.s,x:event.body.x,height:event.body.height,strength:1.3,chainDepth:3});
  frame(scene,run,'rolling',.2);scene.scene.updateMatrixWorld(true);
  for(const event of run.events){
    const mesh=scene.eventMeshes.get(event.id),pose=eventPose(event,run.elapsed),visual=mesh.userData.visual;
    assert.equal(mesh.visible,true);assert.ok(mesh.position.distanceTo(posePosition(scene,pose,event?.height||1.05))<1e-8);
    assert.ok(visual.getWorldPosition(new THREE.Vector3()).distanceTo(worldPoint(scene,pose.s,pose.x,pose.worldY))<1e-8,'tumble pivot must remain at collider center');
    assert.ok(Math.abs(visual.rotation.x-pose.rx)<1e-8&&Math.abs(visual.rotation.y-pose.ry)<1e-8&&Math.abs(visual.rotation.z-pose.rz)<1e-8);
    event.body.s+=9;event.body.x-=.7;event.body.height+=.6;event.body.rx+=2;
  }
  frame(scene,run,'rolling',1.1);
  for(const event of run.events){const mesh=scene.eventMeshes.get(event.id),pose=eventPose(event,run.elapsed);assert.equal(mesh.visible,true,'physical lifetime must outlast short hit effect');assert.ok(mesh.position.distanceTo(posePosition(scene,pose,event?.height||1.05))<1e-8);}
  run.events[0].body.active=false;frame(scene,run);assert.equal(scene.eventMeshes.get('alien').visible,false);
  run.events[1].body.wheel=1;frame(scene,run);assert.equal(scene.eventMeshes.get('punch').visible,false,'warped wheels must not inherit flying bodies');
});

test('contact deformation leaves the body collider center fixed while pistons and rubber react',()=>{
  const scene=harness(),run=runFixture();run.s=20;run.events=['punch','bumper','spring'].map((type,i)=>({id:type,type,at:30+i*10,x:0,used:false}));frame(scene,run);
  for(const event of run.events)scene.burst({type:event.type,eventId:event.id,strength:1});frame(scene,run,'rolling',.2);
  assert.ok(scene.eventMeshes.get('punch').userData.visual.scale.z>1.1);assert.ok(scene.eventMeshes.get('bumper').userData.visual.scale.y<.9);assert.ok(scene.eventMeshes.get('spring').userData.visual.scale.y<.8);
  for(const mesh of scene.eventMeshes.values()){assert.equal(mesh.userData.visual.position.z,0);assert.equal(mesh.userData.visual.position.x,0);assert.equal(mesh.userData.visual.position.y,mesh.userData.centerHeight);}
});

test('impact particles remain bounded, freeze while paused and expire promptly',()=>{
  const scene=harness(),run=runFixture();frame(scene,run);for(let i=0;i<12;i++)scene.burst({type:'comet',strength:1.4});assert.equal(scene.effects.length,48);
  const life=scene.effects[0].life;frame(scene,run,'paused',1);assert.equal(scene.effects[0].life,life);frame(scene,run,'rolling',1);assert.equal(scene.effects.length,0);
});

test('each mechanical effect has a distinct local cue without a generic chain shower',()=>{
  const scene=harness(),run=runFixture();run.s=20;
  run.events=['bumper','spring','punch','alien','trap','boost'].map((type,index)=>({id:type,type,at:30+index*6,x:index-2,height:1.05,radius:.9,used:false}));
  frame(scene,run);scene.squash=0;
  for(const event of run.events)scene.burst({kind:'bounce',powered:true,type:event.type,eventId:event.id,strength:1.2,effectDirection:-1});
  frame(scene,run,'rolling',.2);
  const cue=type=>scene.eventMeshes.get(type).userData.cue;
  assert.equal(scene.effects.length,0,'prop impulses must not emit a generic rainbow particle shower');
  assert.equal(cue('bumper').userData.kind,'impulse');assert.ok(cue('bumper').position.z>0);
  assert.equal(cue('spring').userData.kind,'lift');assert.ok(cue('spring').position.y>1.05);
  assert.equal(cue('punch').userData.kind,'thrust');assert.ok(cue('punch').scale.z>0);
  assert.equal(cue('alien').userData.kind,'spin');assert.ok(cue('alien').rotation.y>0);
  assert.equal(cue('trap').userData.kind,'damping');assert.equal(cue('trap').position.y,.1);
  assert.equal(cue('boost').userData.kind,'thrust');
  for(const event of run.events){const mesh=scene.eventMeshes.get(event.id),pose=eventPose(event,run.elapsed);assert.equal(mesh.userData.cue.parent,mesh);assert.ok(mesh.position.distanceTo(posePosition(scene,pose,event?.height||1.05))<1e-8);assert.equal(mesh.userData.cue.visible,true);}
  const opacity=cue('alien').userData.material.opacity;frame(scene,run,'paused',1);assert.equal(cue('alien').userData.material.opacity,opacity);
  frame(scene,run,'rolling',1);assert.ok(run.events.every(event=>!cue(event.type).visible));
});

test('passive chain and flying-body contacts retain deformation without implying a powered bonus',()=>{
  for(const feedback of [{kind:'chain'},{kind:'bounce',powered:false}]) {
    const scene=harness(),run=runFixture();run.s=20;
    run.events=['bumper','spring','punch','alien','trap','boost'].map((type,index)=>({id:type,type,at:30+index*6,x:0,height:1.05,radius:.9,used:false}));
    frame(scene,run);scene.squash=0;
    for(const event of run.events)scene.burst({...feedback,type:event.type,eventId:event.id,strength:1.2});
    frame(scene,run,'rolling',.2);
    assert.ok(run.events.every(event=>!scene.eventMeshes.get(event.id).userData.cue.visible));
    assert.ok(scene.eventMeshes.get('bumper').userData.visual.scale.y<.9);
    assert.ok(scene.eventMeshes.get('spring').userData.visual.scale.y<.8);
    assert.ok(scene.eventMeshes.get('punch').userData.visual.scale.z>1.1);
    if(feedback.kind==='chain')assert.equal(scene.squash,0,'remote contacts must not squash the ball');
  }
});

test('impact fragments originate on the struck object rather than on the remote ball',()=>{
  const scene=harness(),run=runFixture();run.s=20;run.x=-6;
  const event={id:'comet',type:'comet',at:50,x:4,height:1.05,used:false,body:{active:true,wheel:0,s:55,x:5,height:2,rx:.2,ry:1,rz:.4,life:3}};
  run.events=[event];frame(scene,run);
  const expected=worldPoint(scene,55,5,event.body.worldY);scene.burst({type:'comet',eventId:'comet',s:run.s,x:run.x,height:0,kind:'chain',strength:1});
  assert.equal(scene.effects.length,6);assert.ok(scene.effects.every(effect=>effect.mesh.position.distanceTo(expected)<1e-8));
  const colors=new Set(scene.effects.map(effect=>effect.mesh.material.color.getHex()));assert.equal(colors.size,1);
});

test('object cues reflect the applied effect duration and remain attached while the object moves',()=>{
  const scene=harness(),run=runFixture();run.s=20;
  const alien={id:'curve',type:'alien',at:40,x:1,height:1.05,used:false,body:{active:true,wheel:0,s:40,x:1,height:1,rx:0,ry:0,rz:0,life:3}};
  run.events=[alien];frame(scene,run);scene.burst({type:'alien',eventId:alien.id,effect:'spin',effectDirection:1,effectDuration:1.5});
  alien.body.s+=7;alien.body.x+=2;alien.body.height+=.4;frame(scene,run,'rolling',.8);
  const mesh=scene.eventMeshes.get(alien.id),cue=mesh.userData.cue,pose=eventPose(alien,run.elapsed);
  assert.equal(cue.visible,true);assert.ok(mesh.position.distanceTo(posePosition(scene,pose,alien.height))<1e-8);assert.ok(cue.rotation.y<0);
  frame(scene,run,'rolling',.8);assert.equal(cue.visible,false);
});

test('the trail records actual sideways airborne and backwards paths and clears on warp',()=>{
  const scene=harness(),run=runFixture();for(let i=0;i<4;i++)scene.trail.push(new THREE.Mesh(new THREE.SphereGeometry(.2),new THREE.MeshBasicMaterial()));
  const samples=[[10,.5,0],[15,1.73,2],[12,-1.4,4]];for(const [s,x,air]of samples){run.s=s;run.x=x;run.height=air;frame(scene,run,'rolling',.1);}const path=samples.toReversed().map(([s,x,air])=>{const terrain=courseSample(s,run.seed);return worldPoint(scene,s,x,terrain.height+BALL_RADIUS/terrain.normalY+air);});
  assert.ok(scene.trail[0].position.distanceTo(path[0])<1e-8);assert.ok(scene.trailHistory.some(point=>point.distanceTo(path[2])<1e-8),'the real previous path must remain in the trail');
  run.wheel=1;frame(scene,run);assert.equal(scene.trailHistory.length,1);assert.equal(scene.trail[1].material.opacity,0);
});

test('ready aim preview moves continuously and hides after launch',()=>{
  const scene=harness(),run=runFixture();scene.aimGuide=new THREE.Group();for(let i=0;i<8;i++)scene.aimGuide.add(new THREE.Object3D());scene.aimTip=scene.aimGuide.children[7];run.phase='ready';
  const ends=[];for(const aim of [-17.3,-.7,5.4,22.1]){run.aim=aim;frame(scene,run,'ready');ends.push(scene.aimTip.position.x);}assert.equal(scene.aimGuide.visible,true);assert.ok(ends.every((x,i)=>i===0||x<ends[i-1]));
  run.phase='rolling';frame(scene,run);assert.equal(scene.aimGuide.visible,false);
});

test('the endless corridor has continuous full-width floor and fixed geometry bounds',()=>{
  for(const [width,height] of viewports) {
    const scene=harness(width,height);scene.buildTrack();scene.render(1/60,null,'lobby');scene.track.updateMatrixWorld(true);scene.camera.updateMatrixWorld(true);
    const floor=scene.track.getObjectByName('continuous-course-floor'),positions=floor.geometry.attributes.position;assert.equal(TRACK_WIDTH,20);assert.equal(positions.count,290);assert.equal(scene.courseRails.count,288);assert.equal(scene.courseGuards.count,288);
    for(let i=0;i<positions.count;i+=2){assert.ok(Math.abs(positions.getX(i+1)-positions.getX(i)-TRACK_WIDTH)<1e-5);assert.equal(positions.getY(i),positions.getY(i+1));assert.equal(positions.getZ(i),positions.getZ(i+1));}
    const geometry=floor.geometry,run=runFixture();for(const s of [0,360,3570,10000000]){run.s=s;frame(scene,run);assert.equal(scene.courseFloor.geometry,geometry);assert.equal(scene.track.children.length,5);}
    assert.ok(scene.camera.up.distanceTo(new THREE.Vector3(0,1,0))<1e-8);scene.disposeObject(scene.track);
  }
});

test('wide rails, side guards and underside supports follow the same terrain frame',()=>{
  const scene=harness();scene.buildTrack();scene.buildSpace();
  const run=runFixture(),matrix=new THREE.Matrix4();run.s=1278;frame(scene,run);
  for(let i=0;i<scene.courseRails.count;i++){scene.courseRails.getMatrixAt(i,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix);assert.equal(Math.abs(p.x),TRACK_WIDTH/2);}
  assert.equal(scene.courseSupports.count,36);assert.equal(scene.courseGuards.material,scene.guardMaterial);assert.equal(scene.distantTracks.length,0);scene.dispose();
});

test('floating-origin shifts preserve fragment and trail world positions while floor panels are reused',()=>{
  const scene=harness(),run=runFixture();scene.buildTrack();run.s=1200;frame(scene,run);
  scene.burst({type:'comet',s:1205,x:2,height:1});const effect=scene.effects[0],before=effect.mesh.position.clone(),previousOrigin={...scene.origin},geometry=scene.courseFloor.geometry,vertexVersion=geometry.attributes.position.version,matrixVersion=scene.courseRails.instanceMatrix.version;
  run.s+=2;frame(scene,run,'rolling',0);
  const translation=new THREE.Vector3(0,previousOrigin.height-scene.origin.height,(previousOrigin.s-scene.origin.s)*COURSE_WORLD_PER_METER);
  assert.ok(effect.mesh.position.distanceTo(before.add(translation))<1e-8);assert.equal(scene.courseFloor.geometry,geometry);assert.equal(geometry.attributes.position.version,vertexVersion);assert.equal(scene.courseRails.instanceMatrix.version,matrixVersion,'cached ribbon and matrices must not regenerate between 8m boundaries');
  const local=scene.position(1210,0,-.025),floor=scene.courseFloor.geometry.attributes.position;scene.track.updateMatrixWorld(true);
  // Cached panels move with their origin even between 8m regeneration boundaries.
  const vertex=new THREE.Vector3(floor.getX(0),floor.getY(0),floor.getZ(0)).applyMatrix4(scene.track.matrixWorld),expected=scene.position(scene.courseStart,TRACK_WIDTH/2,-.025);
  assert.ok(vertex.distanceTo(expected)<1e-5);assert.ok(Number.isFinite(local.y));run.s+=8;frame(scene,run,'rolling',0);assert.ok(geometry.attributes.position.version>vertexVersion);assert.ok(scene.courseRails.instanceMatrix.version>matrixVersion);scene.dispose();
});

test('pausing freezes chase interpolation, lens, aim and scenery animation',()=>{
  const scene=harness(),run=runFixture();run.phase='ready';frame(scene,run,'ready');run.phase='rolling';frame(scene,run,'rolling',.01);
  const position=scene.camera.position.clone(),quaternion=scene.camera.quaternion.clone(),fov=scene.camera.fov,aim=scene.cameraAim,time=scene.time;
  for(let i=0;i<3;i++)frame(scene,run,'paused',1);
  assert.ok(scene.camera.position.equals(position));assert.ok(scene.camera.quaternion.equals(quaternion));assert.equal(scene.camera.fov,fov);assert.equal(scene.cameraAim,aim);assert.equal(scene.time,time);
});

test('reduced motion keeps the lens stable and graphics resources are released',()=>{
  const scene=harness(),run=runFixture();run.speed=180;scene.reducedMotion=true;for(let index=0;index<120;index++)frame(scene,run);assert.ok(Math.abs(scene.camera.fov-64)<.1);
  const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(1,1,1)]),line=new THREE.Line(geometry,new THREE.LineBasicMaterial());scene.scene.add(line);
  let released=false;geometry.addEventListener('dispose',()=>{released=true;});scene.dispose();assert.equal(released,true);assert.equal(scene.renderer.disposed,true);assert.equal(scene.abort,true);
});


test('new seeds regenerate the actual drawn hills without changing the straight forward axis',()=>{
  const scene=harness(),run=runFixture();scene.buildTrack();run.s=190;run.seed=17;frame(scene,run);
  const before=scene.courseFloor.geometry.attributes.position.array.slice(),version=scene.courseFloor.geometry.attributes.position.version;
  assert.equal(scene.courseSeed,17);run.seed=23;frame(scene,run);
  assert.equal(scene.courseSeed,23);assert.ok(scene.courseFloor.geometry.attributes.position.version>version);
  assert.notDeepEqual(scene.courseFloor.geometry.attributes.position.array,before);
  for(const s of[0,120,220,360,700,1800]){
    const p=scene.position(s,0,0),origin=courseSample(run.s,23),sample=courseSample(s,23);
    assert.ok(Math.abs(p.x)<1e-8);assert.ok(Math.abs(p.y-(sample.height-origin.height))<1e-8);
    assert.ok(Math.abs(p.z-(s-run.s)*COURSE_WORLD_PER_METER)<1e-8);assert.ok(sample.normalY>0);
  }
  scene.dispose();
});

test('giant encounter art follows the actual collider body while keeping a large readable silhouette',()=>{
  for(const[type,radius,height]of[['beast',2.6,2.3],['giant-alien',2.5,2.4],['cookie',2.25,2.1]]){
    const scene=harness(),run=runFixture(),event={id:type,type,at:110,x:0,radius,height,direction:1,phase:.7};
    run.s=80;run.events=[event];frame(scene,run);const mesh=scene.eventMeshes.get(type),art=mesh.userData.mechanism.encounter;
    assert.ok(art,'giants need actual shaped art rather than a generic old prop');
    mesh.updateMatrixWorld(true);const size=new THREE.Box3().setFromObject(mesh.userData.visual).getSize(new THREE.Vector3());
    assert.ok(size.x>3&&size.y>3,'large encounters must exceed the ball silhouette');
    event.body={active:true,wheel:run.wheel,s:118,x:2,height:1.3,rx:.4,ry:.7,rz:-.3,life:3};run.elapsed=.6;frame(scene,run);
    const pose=eventPose(event,run.elapsed);assert.ok(mesh.position.distanceTo(posePosition(scene,pose,event?.height||1.05))<1e-8);
    scene.burst({type,eventId:type,kind:'bounce',powered:true,effectDuration:.8});frame(scene,run,'rolling',.1);
    assert.ok(mesh.position.distanceTo(posePosition(scene,pose,event?.height||1.05))<1e-8,'reaction animation cannot teleport the collider');
    scene.dispose();
  }
});

test('every terrain archetype keeps the chased ball visible and the camera level across seeds and heights',()=>{
  for(const[width,height]of[[320,568],[390,844],[1440,900]]){
    const scene=harness(width,height),run=runFixture();scene.buildTrack();const ray=new THREE.Raycaster();
    for(const seed of[17,23,42])for(let track=0;track<8;track++)for(const part of[.2,.5,.8]){
      run.seed=seed;run.s=track*360+part*360;run.x=part===.5?SIDE_LIMIT:-SIDE_LIMIT;run.height=track%3;
      const p=frame(scene,run);assert.ok(Math.abs(p.x)<.8&&p.y>-.75&&p.y<.2);assert.ok(scene.camera.up.equals(new THREE.Vector3(0,1,0)));
      scene.track.updateMatrixWorld(true);const delta=scene.ball.position.clone().sub(scene.camera.position),front=delta.length()-1.05;
      ray.set(scene.camera.position,delta.normalize());assert.ok(!ray.intersectObject(scene.courseFloor,true).some(hit=>hit.distance<front-1e-5),'seeded hills must not cover the chased ball');
    }
    scene.dispose();
  }
});

test('macro crests and drops retain the ball and keep the chase camera above the actual road',()=>{
  for(const[width,height]of[[320,568],[390,844],[1440,900]]){
    const scene=harness(width,height),run=runFixture(),ray=new THREE.Raycaster();scene.buildTrack();
    let low=Infinity,high=-Infinity;
    for(const seed of[23,42])for(let s=1080;s<=2520;s+=16)for(const air of[0,6]){
      run.seed=seed;run.s=s;run.height=air;run.x=s%3===0?SIDE_LIMIT:0;
      // This grid poses unrelated heights; reset the follow offset rather than
      // treating each sample as a physically impossible instantaneous flight.
      scene.followRun=null;
      const point=frame(scene,run);scene.track.updateMatrixWorld(true);
      const delta=scene.ball.position.clone().sub(scene.camera.position),front=delta.length()-1.05;
      ray.set(scene.camera.position,delta.normalize());
      assert.ok(!ray.intersectObject(scene.courseFloor,true).some(hit=>hit.distance<front-1e-5),`hidden ball at ${seed}:${s}, air ${air}`);
      assert.ok(point.y>-.75&&point.y<.2&&Math.abs(point.x)<.8,'large hills must preserve the ball in frame');
      assert.equal(scene.camera.up.y,1);
      const behind=courseSample((scene.camera.position.z+scene.origin.forward)/COURSE_WORLD_PER_METER,seed).height-scene.origin.height;
      assert.ok(scene.camera.position.y-behind>=3.9,'the camera must remain above the road rather than skim its surface');
      const y=courseSample(s,seed).height;low=Math.min(low,y);high=Math.max(high,y);
    }
    assert.ok(high-low>20,'the fixture must actually exercise substantial elevation changes');scene.dispose();
  }
});

test('consumed tar remains a visible fixed puddle while an anvil follows its real moving body',()=>{
  const scene=harness(),run=runFixture(),anvil={id:'anvil',type:'anvil',at:55,x:-2,radius:1.8,height:1.6},tar={id:'tar',type:'tar',at:65,x:2,radius:2.35,height:.16};
  run.s=45;run.events=[anvil,tar];frame(scene,run);
  const originalTar=scene.eventMeshes.get('tar').position.clone();tar.used=true;
  anvil.body={active:true,wheel:run.wheel,s:59,x:-4,height:.3,rx:.12,ry:.2,rz:.1,life:3};
  scene.burst({type:'tar',eventId:'tar',kind:'hazard',effect:'sticky-brake',effectDuration:2.6});
  frame(scene,run,'rolling',.4);
  const puddle=scene.eventMeshes.get('tar');assert.equal(puddle.visible,true);assert.ok(puddle.position.equals(originalTar));
  assert.equal(puddle.userData.mechanism.encounter.visible,true);
  const pose=eventPose(anvil,run.elapsed);assert.ok(scene.eventMeshes.get('anvil').position.distanceTo(posePosition(scene,pose,anvil.height))<1e-8);
  scene.dispose();
});

test('authored challenge launchers and targets have distinct readable 3D marks on mobile and desktop',()=>{
  for(const[width,height]of[[320,568],[390,844],[1440,900]])for(const definition of CHALLENGES){
    const scene=harness(width,height),run=runFixture();run.s=18;run.challenge=createChallenge(definition.id,run.seed);run.events=challengeEvents(definition.id,run.seed);frame(scene,run,'ready');scene.scene.updateMatrixWorld(true);
    const launcher=scene.eventMeshes.get(run.challenge.launcherId).userData.mechanism.challenge;
    assert.ok(launcher.visible);assert.ok(launcher.getObjectByName('launcher-aim-ring'));assert.equal(launcher.getObjectByName('target-pin'),undefined);
    assert.equal(launcher.userData.material.color.getHex(),0xff945e);
    for(const id of run.challenge.targetIds){
      const mark=scene.eventMeshes.get(id).userData.mechanism.challenge,ring=mark.userData.ring;
      assert.ok(mark.visible);assert.ok(mark.getObjectByName('target-floor-ring'));assert.ok(mark.getObjectByName('target-pin'));assert.equal(mark.userData.material.color.getHex(),0xffd45c);
      assert.equal(mark.userData.check.visible,false);assert.equal(mark.getObjectByName('launcher-aim-ring'),undefined);
      const center=ring.getWorldPosition(new THREE.Vector3()),middle=project(scene,center),edge=project(scene,center.clone().add(new THREE.Vector3(.62,0,0)));
      assert.ok(Math.abs(middle.x)<.85&&middle.y>-.5&&middle.y<.9,'the raised target stays inside the chase viewport');
      assert.ok(Math.abs(edge.x-middle.x)*width>=6,'the target emblem must retain at least twelve CSS pixels of diameter at the authored approach');
    }
    const ordinary=scene.createEvent({id:'ordinary',type:'bumper',at:50,x:5});assert.equal(ordinary.userData.mechanism.challenge,null);scene.disposeObject(ordinary);scene.dispose();
  }
});

test('target success follows only the active challenge hit list, never direct hits or cosmetic chain cues',()=>{
  const scene=harness(),run=runFixture();run.challenge=createChallenge('domino',run.seed);run.events=challengeEvents('domino',run.seed);frame(scene,run);
  const id=run.challenge.targetIds[0],mark=scene.eventMeshes.get(id).userData.mechanism.challenge,target=run.events.find(event=>event.id===id);
  for(const kind of['bounce','chain']){target.hits++;scene.burst({type:target.type,eventId:id,kind,strength:1});frame(scene,run);assert.equal(mark.userData.success,false);assert.equal(mark.userData.material.color.getHex(),0xffd45c);}
  run.challenge.hitTargetIds.push(id);frame(scene,run);
  assert.equal(mark.userData.success,true);assert.equal(mark.userData.material.color.getHex(),0x83ffd2);assert.ok(mark.userData.check.visible);assert.equal(mark.userData.ring.visible,false);
  const other=scene.eventMeshes.get(run.challenge.targetIds[1]).userData.mechanism.challenge;assert.equal(other.userData.success,false);assert.equal(other.userData.material.color.getHex(),0xffd45c);
  run.challenge={...run.challenge,id:'another-challenge'};frame(scene,run);assert.equal(mark.visible,false);assert.equal(mark.userData.success,false);scene.dispose();
});

test('ball traits use one bounded procedural surface mesh and release resources when equipped or disposed',()=>{
  const scene=harness(),run=runFixture(),identities=new Set(),colors=new Set(),geometries=[],materials=[];
  for(const trait of['standard','heavy','elastic','spin']){
    run.trait=trait;scene.render(0,run,'ready',0,{ball:2,trait:'standard'});const mark=scene.ballMark;
    assert.equal(mark.userData.trait,trait);assert.equal(mark.parent,scene.ballBody);assert.equal(scene.ballBody.children.length,1);
    assert.ok(mark.geometry.attributes.position.count<=3600,'mobile marks stay below twelve hundred triangles');assert.equal(mark.material.map,null);
    identities.add(mark.geometry.attributes.position.count+':'+Array.from(mark.geometry.attributes.position.array.slice(0,12)).join(','));colors.add(scene.ballBody.material.color.getHex());
    const geometry=mark.geometry,material=mark.material;let geometryDisposals=0,materialDisposals=0;
    geometry.addEventListener('dispose',()=>geometryDisposals++);material.addEventListener('dispose',()=>materialDisposals++);
    geometries.push(()=>geometryDisposals);materials.push(()=>materialDisposals);
    if(trait==='heavy'){assert.ok(scene.ballBody.material.roughness>=.75);assert.ok(scene.ballBody.material.metalness>=.6);}
    scene.render(.1,run,'ready',0,{ball:3,trait:'standard'});assert.equal(scene.ballMark,mark,'upgrades recolor the existing mark without rebuilding it');
  }
  assert.equal(identities.size,4);assert.equal(colors.size,4);
  scene.render(0,null,'lobby',0,{ball:1,trait:'heavy'});assert.equal(scene.ballTrait,'heavy','the selected profile trait is visible before a run');scene.dispose();
  for(let i=0;i<geometries.length;i++){assert.equal(geometries[i](),1);assert.equal(materials[i](),1);}
});
