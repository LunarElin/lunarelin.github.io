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

test('contact deformation leaves the body collider center fixed while gloves and rubber react',()=>{
  const scene=harness(),run=runFixture();run.s=20;run.events=['punch','bumper','spring'].map((type,i)=>({id:type,type,at:30+i*10,x:0,used:false}));frame(scene,run);
  for(const event of run.events)scene.burst({type:event.type,eventId:event.id,strength:1});frame(scene,run,'rolling',.2);
  assert.ok(scene.eventMeshes.get('punch').userData.visual.scale.z>1.1);assert.ok(scene.eventMeshes.get('bumper').userData.visual.scale.y<.9);assert.ok(scene.eventMeshes.get('spring').userData.visual.scale.y<.8);
  for(const mesh of scene.eventMeshes.values()){assert.equal(mesh.userData.visual.position.z,0);assert.equal(mesh.userData.visual.position.x,0);assert.equal(mesh.userData.visual.position.y,mesh.userData.centerHeight);}
});

test('impact particles remain bounded, freeze while paused and expire promptly',()=>{
  const scene=harness(),run=runFixture();frame(scene,run);for(let i=0;i<10;i++)scene.burst({type:'punch',strength:1.4});assert.equal(scene.effects.length,80);
  const life=scene.effects[0].life;frame(scene,run,'paused',1);assert.equal(scene.effects[0].life,life);frame(scene,run,'rolling',1);assert.equal(scene.effects.length,0);
});

test('secondary collisions create colorful bounded shock rings without squashing the remote ball',()=>{
  const scene=harness(),run=runFixture();frame(scene,run);scene.squash=0;
  for(let index=0;index<8;index++)scene.burst({kind:'chain',type:'bumper',s:30+index,x:4,height:1,strength:1.4,chainDepth:4});
  assert.equal(scene.effects.length,80);assert.equal(scene.squash,0);assert.ok(scene.effects.some(effect=>effect.ring));
  const colors=new Set(scene.effects.filter(effect=>!effect.ring).map(effect=>effect.mesh.material.color.getHex()));assert.ok(colors.size>=3);
  frame(scene,run,'rolling',1);assert.equal(scene.effects.length,0);
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
