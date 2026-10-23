import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.js';
import { OrbitScene, WHEEL_RADIUS, BALL_HEIGHT } from '../scene.mjs';
import { newProfile, newRun } from '../rules.mjs';

// Exercise actual scene placement/camera math without claiming WebGL rendering QA.
function sceneHarness(width=390,height=844) {
  const scene=Object.create(OrbitScene.prototype);
  Object.assign(scene,{
    scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(width<650?60:47,width/height,.1,650),
    renderer:{render(){}},railMaterial:new THREE.MeshStandardMaterial(),
    models:{},track:new THREE.Group(),ball:new THREE.Group(),
    ballBody:new THREE.Mesh(new THREE.SphereGeometry(1.05),new THREE.MeshStandardMaterial()),
    shadow:new THREE.Group(),astronaut:new THREE.Group(),eventGroup:new THREE.Group(),
    eventMeshes:new Map(),trail:[],effects:[],previewEvents:[],lastTrack:-1,
    time:0,frame:0,impact:0,lane:0,look:new THREE.Vector3(),mobile:width<650,reducedMotion:true,
  });
  scene.ball.add(scene.ballBody);return scene;
}

test('the chase camera keeps a fast ball large and below center while following the local floor',()=>{
  for(const [width,height] of [[320,568],[320,844],[390,844],[1440,900]]) {
    const scene=sceneHarness(width,height),run=newRun(newProfile(),1,42);run.speed=185;
    for(let i=0;i<720;i++) {
      run.distance=i*185/60;run.track=Math.floor(run.distance/360);
      scene.render(1/60,run,'rolling');scene.camera.updateMatrixWorld();
      const projected=scene.ball.position.clone().project(scene.camera);
      assert.ok(Math.abs(projected.x)<.3,`ball x ${projected.x} at ${width}`);
      assert.ok(projected.y>-.7&&projected.y<-.2,`ball y ${projected.y} at ${width}`);
      const inward=scene.center.clone().sub(scene.ball.position);inward.x=0;inward.normalize();
      assert.ok(scene.camera.up.dot(inward)>.999999,'camera up must turn with the inner floor');
      const floor=scene.position(run.distance,run.lane,0).project(scene.camera);
      assert.ok(floor.y<projected.y,'the floor must remain below the ball on screen');
      if(width<650&&i>90) {
        const right=new THREE.Vector3().setFromMatrixColumn(scene.camera.matrixWorld,0);
        const edge=scene.ball.position.clone().addScaledVector(right,1.05).project(scene.camera);
        const diameter=Math.abs(edge.x-projected.x)*width;
        assert.ok(diameter>=30&&diameter<=70,`mobile ball diameter ${diameter}px at ${width}`);
      }
    }
    scene.disposeObject(scene.scene);
  }
});

test('logical left and right stay on the matching side of the screen throughout a loop',()=>{
  const scene=sceneHarness(),run=newRun(newProfile(),1,42);
  for(let distance=0;distance<360;distance+=5) {
    const screenX=[];
    for(const lane of [-1,0,1]) {
      run.distance=distance;run.lane=lane;scene.render(1/60,run,'rolling');scene.camera.updateMatrixWorld();
      assert.equal(scene.lane,lane);
      assert.ok(scene.ball.position.distanceTo(scene.position(distance,lane,BALL_HEIGHT))<1e-8);
      screenX.push(scene.ball.position.clone().project(scene.camera).x);
    }
    assert.ok(screenX[0]<screenX[1]&&screenX[1]<screenX[2],`steering reverses at ${distance}m`);
  }
});

test('starting a new run replaces lobby event references even on the same orbit',()=>{
  const scene=sceneHarness(),a={id:'same',at:90,lane:0,type:'trap',used:false};
  scene.syncEvents([a],0);const before=scene.eventMeshes.get('same');
  const b={...a,lane:1};scene.syncEvents([b],0);
  const after=scene.eventMeshes.get('same');assert.ok(after!==before);
  assert.equal(after.userData.event,b);assert.ok(after.position.distanceTo(scene.position(90,1))<1e-8);
});

test('next-orbit events are visible before crossing and passed events disappear',()=>{
  const scene=sceneHarness(),run=newRun(newProfile(),1,42);
  const future={id:'next',at:420,lane:0,type:'trap',used:false};
  const past={id:'past',at:260,lane:1,type:'coins',used:false};
  run.distance=350;run.events=[past,future];scene.render(1/60,run,'rolling');
  assert.equal(scene.eventMeshes.get('next').visible,true);
  assert.equal(scene.eventMeshes.get('past').visible,false);
  future.used=true;scene.render(1/60,run,'rolling');
  assert.equal(scene.eventMeshes.get('next').visible,false);
});

test('ordinary laps stay in the same wheel and only a warp moves to another wheel',()=>{
  const scene=sceneHarness(),run=newRun(newProfile(),1,42);
  scene.render(1/60,run,'rolling');const original=scene.track.position.clone();
  run.distance=378;run.track=1;scene.render(1/60,run,'rolling');
  assert.equal(scene.track.position.distanceTo(original),0);
  run.wheel=1;scene.render(1/60,run,'rolling');
  assert.ok(scene.track.position.distanceTo(original)>60);
  const local=scene.ball.position.clone().sub(scene.track.position);
  assert.ok(Math.abs(Math.hypot(local.y,local.z)-(WHEEL_RADIUS-BALL_HEIGHT))<1e-8);
  scene.camera.updateMatrixWorld();
  assert.ok(Math.abs(scene.ball.position.clone().project(scene.camera).x)<.94);
});

test('the ball climbs the vertical inner tread while steering changes only the cylinder axis',()=>{
  const scene=sceneHarness();
  const bottom=scene.position(0,0,0),side=scene.position(90,0,0),top=scene.position(180,0,0);
  assert.ok(Math.abs(bottom.y+WHEEL_RADIUS)<1e-8);
  assert.ok(Math.abs(side.y)<1e-8&&Math.abs(side.z-WHEEL_RADIUS)<1e-8);
  assert.ok(Math.abs(top.y-WHEEL_RADIUS)<1e-8);
  for(let distance=0;distance<360;distance+=5) {
    const middle=scene.position(distance,0,.85),left=scene.position(distance,-1,.85),right=scene.position(distance,1,.85);
    assert.equal(left.y,middle.y);assert.equal(right.z,middle.z);
    assert.equal(left.x,2.1);assert.equal(right.x,-2.1);
    assert.ok(Math.abs(Math.hypot(middle.y,middle.z)-(WHEEL_RADIUS-.85))<1e-8);
  }
});

test('obstacles stand toward the wheel center on the floor, walls and ceiling',()=>{
  const scene=sceneHarness();
  for(const at of [0,45,90,180,270]) {
    const obstacle=scene.createEvent({id:String(at),at,lane:0,type:'trap',used:false});
    const inward=obstacle.position.clone().negate().normalize();
    const up=new THREE.Vector3(0,1,0).applyQuaternion(obstacle.quaternion);
    assert.ok(up.dot(inward)>.999999);
  }
});

test('the playable surface is an open inward-facing cylinder rather than a flat annulus',()=>{
  const scene=sceneHarness();scene.buildTrack();
  const tread=scene.track.getObjectByName('inner-tread');
  assert.equal(tread.geometry.type,'CylinderGeometry');
  assert.equal(tread.geometry.parameters.openEnded,true);
  assert.equal(tread.material.side,THREE.BackSide);
  const positions=tread.geometry.getAttribute('position');
  for(let i=0;i<positions.count;i++) {
    assert.ok(Math.abs(positions.getX(i))<=4.201);
    assert.ok(Math.abs(Math.hypot(positions.getY(i),positions.getZ(i))-WHEEL_RADIUS)<.001);
  }
});

test('the wheel rim never hides the ball during a complete loop in any lane',()=>{
  for(const [width,height] of [[320,568],[320,844],[390,844],[1440,900]]) {
    const scene=sceneHarness(width,height),run=newRun(newProfile(),1,42);
    scene.buildTrack();
    const ray=new THREE.Raycaster();
    for(const lane of [-1,0,1])for(let distance=0;distance<360;distance+=5) {
      run.lane=lane;run.distance=distance;
      scene.render(1/60,run,'rolling');scene.track.updateMatrixWorld(true);
      const direction=scene.ball.position.clone().sub(scene.camera.position);
      const sphereFront=direction.length()-1.05;
      ray.set(scene.camera.position,direction.normalize());
      const blocker=ray.intersectObject(scene.track,true).find(hit=>hit.distance<sphereFront-1e-6);
      assert.ok(!blocker,`wheel blocks lane ${lane} at ${distance}m on ${width}x${height}`);
    }
    scene.disposeObject(scene.track);
  }
});

test('the lobby overview fits the complete wheel and keeps world up',()=>{
  for(const [width,height] of [[320,568],[320,844],[390,844],[1440,900]]) {
    const scene=sceneHarness(width,height);
    scene.buildTrack();scene.render(1/60,null,'lobby');
    scene.track.updateMatrixWorld(true);scene.camera.updateMatrixWorld(true);
    assert.ok(scene.camera.up.distanceTo(new THREE.Vector3(0,1,0))<1e-8);
    const vertex=new THREE.Vector3(),instance=new THREE.Matrix4(),world=new THREE.Matrix4();
    const checkVertices=(mesh,matrix)=>{
      const positions=mesh.geometry.getAttribute('position');
      for(let i=0;i<positions.count;i++) {
        vertex.fromBufferAttribute(positions,i).applyMatrix4(matrix).project(scene.camera);
        assert.ok(Math.abs(vertex.x)<=1&&Math.abs(vertex.y)<=1,
          `wheel clips at ${vertex.x},${vertex.y} on ${width}x${height}`);
      }
    };
    scene.track.traverse(mesh=>{
      if(!mesh.isMesh)return;
      if(mesh.isInstancedMesh)for(let i=0;i<mesh.count;i++) {
        mesh.getMatrixAt(i,instance);world.multiplyMatrices(mesh.matrixWorld,instance);
        checkVertices(mesh,world);
      }else checkVertices(mesh,mesh.matrixWorld);
    });
    scene.disposeObject(scene.track);
  }
});

test('the chase view exposes every lane of upcoming obstacles before they reach the ball',()=>{
  for(const [width,height] of [[320,568],[320,844],[390,844],[1440,900]]) {
    const scene=sceneHarness(width,height),run=newRun(newProfile(),1,42);
    for(let distance=0;distance<360;distance+=15)for(const lane of [-1,0,1]) {
      run.distance=distance;run.lane=lane;
      run.events=[-1,0,1].flatMap(eventLane=>[25,40,60].map(ahead=>({
        id:`${eventLane}:${ahead}`,at:distance+ahead,lane:eventLane,type:'trap',used:false,
      })));
      // Let the mode's lens settle; positions and steering still update in one frame.
      scene.render(.2,run,'rolling');scene.camera.updateMatrixWorld();
      for(const event of run.events) {
        const obstacle=scene.eventMeshes.get(event.id),projected=obstacle.position.clone().project(scene.camera);
        assert.ok(obstacle.visible,`upcoming obstacle hidden at ${event.at}m`);
        assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1&&projected.z>-1&&projected.z<1,
          `upcoming lane ${event.lane} clips at ${width}x${height}, distance ${distance}m`);
      }
    }
  }
});
