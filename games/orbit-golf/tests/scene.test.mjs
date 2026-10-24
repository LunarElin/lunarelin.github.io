import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.js';
import { OrbitScene, WHEEL_RADIUS, BALL_HEIGHT } from '../scene.mjs';
import { newProfile, newRun, eventPose, TRACK_WIDTH, SIDE_LIMIT } from '../rules.mjs';

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
function frame(scene,run,mode='rolling',dt=1/60){scene.render(dt,run,mode);return project(scene);}
const viewports=[[320,568],[320,844],[390,844],[1440,900]];

test('continuous x and airborne height map directly without snapping to lanes',()=>{
  const scene=harness(),run=runFixture();
  for(const s of [-13.2,0,53.7,180,381.4])for(const x of [-SIDE_LIMIT,-.43,.27,6.615,SIDE_LIMIT])for(const height of [0,2.7,6]) {
    const point=scene.position(s,x,BALL_HEIGHT+height);assert.equal(point.x,-x);
    assert.ok(Math.abs(Math.hypot(point.y,point.z)-(WHEEL_RADIUS-BALL_HEIGHT-height))<1e-8);
  }
  run.distance=500;run.s=157.4;run.x=1.73;run.height=3.2;frame(scene,run);
  assert.ok(scene.ball.position.distanceTo(scene.position(run.s,run.x,BALL_HEIGHT+run.height))<1e-8);
  const before=scene.ball.position.clone();run.s-=11.5;run.x=-.61;run.speed=-24;frame(scene,run);
  assert.equal(scene.distance,run.s);assert.equal(run.distance,500);assert.ok(before.distanceTo(scene.ball.position)>3);
});

test('chase framing retains the airborne ball around the whole wheel on mobile and desktop',()=>{
  for(const [width,height] of viewports) {
    const scene=harness(width,height),run=runFixture();run.speed=160;
    for(const air of [0,2.5,6,8])for(const x of [-SIDE_LIMIT,0,SIDE_LIMIT])for(let s=0;s<360;s+=10) {
      run.s=s;run.x=x;run.height=air;const point=frame(scene,run);
      assert.ok(Math.abs(point.x)<.8,'horizontal frame '+width+', x '+x+', air '+air);
      assert.ok(point.y>-.75&&point.y<.2,'vertical frame '+width+', air '+air+': '+point.y);
      const inward=new THREE.Vector3(0,Math.cos(s/360*Math.PI*2),-Math.sin(s/360*Math.PI*2));
      assert.ok(scene.camera.up.dot(inward)>.999999);
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
    assert.ok(rolling.y<-.25&&rolling.y>-.55);
  }
});

test('arbitrary left and right positions retain screen direction through a full loop',()=>{
  const scene=harness(),run=runFixture();
  for(let s=0;s<360;s+=15){const positions=[];for(const x of [-8.37,-2.63,1.49,8.64]){run.s=s;run.x=x;positions.push(frame(scene,run).x);}assert.ok(positions.every((x,i)=>i===0||x>positions[i-1]),'steering reverses at '+s);}
});

test('actual wheel geometry never occludes ground or airborne balls across four viewports',()=>{
  for(const [width,height] of viewports) {
    const scene=harness(width,height),run=runFixture();scene.buildTrack();const ray=new THREE.Raycaster();
    for(const x of [-SIDE_LIMIT,0,SIDE_LIMIT])for(const air of [0,3,7])for(let s=0;s<360;s+=15) {
      run.x=x;run.height=air;run.s=s;frame(scene,run);scene.track.updateMatrixWorld(true);
      const direction=scene.ball.position.clone().sub(scene.camera.position),front=direction.length()-1.05;ray.set(scene.camera.position,direction.normalize());
      assert.ok(!ray.intersectObject(scene.track,true).some(hit=>hit.distance<front-1e-6),'occlusion '+width+'x'+height+', s '+s+', x '+x+', air '+air);
    }
    scene.disposeObject(scene.track);
  }
});

test('static props share their collider poses across the expanded width',()=>{
  const scene=harness(),run=runFixture();run.s=20;
  run.events=['alien','punch','bumper','spring','trap'].map((type,i)=>({id:type,type,at:40+i*20,x:.43,radius:.9,height:1.05,phase:.7,used:false}));
  for(const elapsed of [0,.37,1.4,2.9]){run.elapsed=elapsed;frame(scene,run);for(const event of run.events){const mesh=scene.eventMeshes.get(event.id),pose=eventPose(event,elapsed);assert.ok(mesh.position.distanceTo(scene.position(pose.s,pose.x,pose.height))<1e-8);assert.ok(mesh.userData.visual.children.length>0);}}
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

test('the ball shows actual imposed spin without rotating while paused',()=>{
  const scene=harness(),run=runFixture();run.speed=30;run.vx=0;run.curveSpin=18;
  frame(scene,run,'rolling',.1);const angle=scene.ballBody.rotation.y;assert.ok(angle<-.5);
  frame(scene,run,'paused',1);assert.equal(scene.ballBody.rotation.y,angle);
  run.curveSpin=-18;frame(scene,run,'rolling',.1);assert.ok(Math.abs(scene.ballBody.rotation.y)<1e-8);
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

test('the approaching intact guardian remains ahead of the ball around the curved wheel',()=>{
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
  const moving=scene.eventMeshes.get('moving'),pose=eventPose(run.events[0],run.elapsed);assert.ok(moving.position.distanceTo(scene.position(pose.s,pose.x,pose.height))<1e-8);
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
    assert.equal(mesh.visible,true);assert.ok(mesh.position.distanceTo(scene.position(pose.s,pose.x,pose.height))<1e-8);
    assert.ok(visual.getWorldPosition(new THREE.Vector3()).distanceTo(scene.position(pose.s,pose.x,pose.height+event.height))<1e-8,'tumble pivot must remain at collider center');
    assert.ok(Math.abs(visual.rotation.x-pose.rx)<1e-8&&Math.abs(visual.rotation.y-pose.ry)<1e-8&&Math.abs(visual.rotation.z-pose.rz)<1e-8);
    event.body.s+=9;event.body.x-=.7;event.body.height+=.6;event.body.rx+=2;
  }
  frame(scene,run,'rolling',1.1);
  for(const event of run.events){const mesh=scene.eventMeshes.get(event.id),pose=eventPose(event,run.elapsed);assert.equal(mesh.visible,true,'physical lifetime must outlast short hit effect');assert.ok(mesh.position.distanceTo(scene.position(pose.s,pose.x,pose.height))<1e-8);}
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
  for(const event of run.events){const mesh=scene.eventMeshes.get(event.id),pose=eventPose(event,run.elapsed);assert.equal(mesh.userData.cue.parent,mesh);assert.ok(mesh.position.distanceTo(scene.position(pose.s,pose.x,pose.height))<1e-8);assert.equal(mesh.userData.cue.visible,true);}
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
  const expected=scene.position(55,5,3.05);scene.burst({type:'comet',eventId:'comet',s:run.s,x:run.x,height:0,kind:'chain',strength:1});
  assert.equal(scene.effects.length,6);assert.ok(scene.effects.every(effect=>effect.mesh.position.distanceTo(expected)<1e-8));
  const colors=new Set(scene.effects.map(effect=>effect.mesh.material.color.getHex()));assert.equal(colors.size,1);
});

test('object cues reflect the applied effect duration and remain attached while the object moves',()=>{
  const scene=harness(),run=runFixture();run.s=20;
  const alien={id:'curve',type:'alien',at:40,x:1,height:1.05,used:false,body:{active:true,wheel:0,s:40,x:1,height:1,rx:0,ry:0,rz:0,life:3}};
  run.events=[alien];frame(scene,run);scene.burst({type:'alien',eventId:alien.id,effect:'spin',effectDirection:1,effectDuration:1.5});
  alien.body.s+=7;alien.body.x+=2;alien.body.height+=.4;frame(scene,run,'rolling',.8);
  const mesh=scene.eventMeshes.get(alien.id),cue=mesh.userData.cue,pose=eventPose(alien,run.elapsed);
  assert.equal(cue.visible,true);assert.ok(mesh.position.distanceTo(scene.position(pose.s,pose.x,pose.height))<1e-8);assert.ok(cue.rotation.y<0);
  frame(scene,run,'rolling',.8);assert.equal(cue.visible,false);
});

test('the trail records actual sideways airborne and backwards paths and clears on warp',()=>{
  const scene=harness(),run=runFixture();for(let i=0;i<4;i++)scene.trail.push(new THREE.Mesh(new THREE.SphereGeometry(.2),new THREE.MeshBasicMaterial()));
  const path=[];for(const [s,x,air] of [[10,.5,0],[15,1.73,2],[12,-1.4,4]]){run.s=s;run.x=x;run.height=air;frame(scene,run);path.unshift(scene.ball.position.clone());}
  assert.ok(scene.trail[0].position.distanceTo(path[0])<1e-8);assert.ok(scene.trail[1].position.distanceTo(path[2])<1e-8);
  run.wheel=1;frame(scene,run);assert.equal(scene.trailHistory.length,1);assert.equal(scene.trail[1].material.opacity,0);
});

test('ready aim preview moves continuously and hides after launch',()=>{
  const scene=harness(),run=runFixture();scene.aimGuide=new THREE.Group();for(let i=0;i<8;i++)scene.aimGuide.add(new THREE.Object3D());scene.aimTip=scene.aimGuide.children[7];run.phase='ready';
  const ends=[];for(const aim of [-17.3,-.7,5.4,22.1]){run.aim=aim;frame(scene,run,'ready');ends.push(scene.aimTip.position.x);}assert.equal(scene.aimGuide.visible,true);assert.ok(ends.every((x,i)=>i===0||x<ends[i-1]));
  run.phase='rolling';frame(scene,run);assert.equal(scene.aimGuide.visible,false);
});

test('the open tread uses broad staggered plates and the lobby retains a complete wheel',()=>{
  for(const [width,height] of viewports) {
    const scene=harness(width,height);scene.buildTrack();scene.render(1/60,null,'lobby');scene.track.updateMatrixWorld(true);scene.camera.updateMatrixWorld(true);
    const tread=scene.track.getObjectByName('inner-tread');assert.equal(tread.geometry.type,'CylinderGeometry');assert.equal(tread.geometry.parameters.openEnded,true);assert.equal(tread.material.side,THREE.BackSide);
    assert.equal(tread.geometry.parameters.height,TRACK_WIDTH);assert.equal(TRACK_WIDTH,20);assert.equal(scene.track.getObjectByName('staggered-floor-plates').count,360);assert.ok(scene.camera.up.distanceTo(new THREE.Vector3(0,1,0))<1e-8);
    const vertex=new THREE.Vector3(),positions=tread.geometry.attributes.position;for(let i=0;i<positions.count;i++){vertex.fromBufferAttribute(positions,i).applyMatrix4(tread.matrixWorld).project(scene.camera);assert.ok(Math.abs(vertex.x)<=1&&Math.abs(vertex.y)<=1);}scene.disposeObject(scene.track);
  }
});

test('main and distant tread, side guards and rear frame all use the same expanded width',()=>{
  const scene=harness();scene.buildTrack();scene.buildSpace();
  for(const ring of scene.distantTracks){assert.equal(ring.children.find(child=>child.geometry.type==='CylinderGeometry').geometry.parameters.height,TRACK_WIDTH);const rims=ring.children.filter(child=>child.geometry.type==='TorusGeometry');assert.ok(rims.every(rim=>Math.abs(Math.abs(rim.position.x)-(TRACK_WIDTH/2+.1))<1e-8));}
  const guards=scene.track.children.filter(child=>child.geometry?.type==='RingGeometry'&&child.material===scene.guardMaterial);assert.equal(guards.length,2);assert.ok(guards.every(guard=>Math.abs(guard.position.x)===TRACK_WIDTH/2));
  const back=scene.track.children.filter(child=>child.geometry?.type==='BoxGeometry'&&child.geometry.parameters.height===WHEEL_RADIUS*2);assert.equal(back.length,3);assert.ok(back.every(spoke=>spoke.position.x===-TRACK_WIDTH/2-.5));scene.dispose();
});

test('reduced motion keeps the lens stable and graphics resources are released',()=>{
  const scene=harness(),run=runFixture();run.speed=180;scene.reducedMotion=true;for(let index=0;index<60;index++)frame(scene,run);assert.ok(Math.abs(scene.camera.fov-74)<.1);
  const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(1,1,1)]),line=new THREE.Line(geometry,new THREE.LineBasicMaterial());scene.scene.add(line);
  let released=false;geometry.addEventListener('dispose',()=>{released=true;});scene.dispose();assert.equal(released,true);assert.equal(scene.renderer.disposed,true);assert.equal(scene.abort,true);
});
