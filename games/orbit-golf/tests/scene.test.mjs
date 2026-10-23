import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.js';
import { OrbitScene } from '../scene.mjs';
import { newProfile, newRun } from '../rules.mjs';

// Exercise actual scene placement/camera math without claiming WebGL rendering QA.
function sceneHarness(width=390,height=844) {
  const scene=Object.create(OrbitScene.prototype);
  Object.assign(scene,{
    scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(47,width/height,.1,650),
    renderer:{render(){}},railMaterial:new THREE.MeshStandardMaterial(),
    models:{},track:new THREE.Group(),ball:new THREE.Group(),
    ballBody:new THREE.Mesh(new THREE.SphereGeometry(.52),new THREE.MeshStandardMaterial()),
    shadow:new THREE.Group(),astronaut:new THREE.Group(),eventGroup:new THREE.Group(),
    eventMeshes:new Map(),trail:[],effects:[],previewEvents:[],lastTrack:-1,
    time:0,frame:0,impact:0,lane:0,look:new THREE.Vector3(),mobile:width<650,reducedMotion:true,
  });
  scene.ball.add(scene.ballBody);return scene;
}

test('fast orbital camera keeps the ball framed through many complete rotations',()=>{
  for(const [width,height] of [[320,640],[390,844],[1440,900]]) {
    const scene=sceneHarness(width,height),run=newRun(newProfile(),1,42);run.speed=185;
    for(let i=0;i<720;i++) {
      run.distance=i*185/60;run.track=Math.floor(run.distance/360);
      scene.render(1/60,run,'rolling');scene.camera.updateMatrixWorld();
      const projected=scene.ball.position.clone().project(scene.camera);
      assert.ok(Math.abs(projected.x)<.94,`ball x ${projected.x} at ${width}`);
      assert.ok(projected.y>-.85&&projected.y<.6,`ball y ${projected.y} at ${width}`);
    }
    scene.disposeObject(scene.scene);
  }
});

test('logical lanes and visible ball positions agree on the first steering frame',()=>{
  const scene=sceneHarness(),run=newRun(newProfile(),1,42);
  for(const lane of [-1,1,0]) {
    run.lane=lane;scene.render(1/60,run,'rolling');
    assert.equal(scene.lane,lane);
    assert.ok(scene.ball.position.distanceTo(scene.position(run.distance,lane,.57))<1e-8);
  }
});

test('starting a new run replaces lobby event references even on the same orbit',()=>{
  const scene=sceneHarness(),a={id:'same',at:90,lane:0,type:'trap',used:false};
  scene.syncEvents([a],0);const before=scene.eventMeshes.get('same');
  const b={...a,lane:1};scene.syncEvents([b],0);
  const after=scene.eventMeshes.get('same');assert.notEqual(after,before);
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

test('a new orbit moves the board, ball and camera together to another space track',()=>{
  const scene=sceneHarness(),run=newRun(newProfile(),1,42);
  scene.render(1/60,run,'rolling');const original=scene.track.position.clone();
  run.distance=378;run.track=1;scene.render(1/60,run,'rolling');
  assert.ok(scene.track.position.distanceTo(original)>60);
  assert.ok(Math.abs(scene.ball.position.clone().sub(scene.track.position).setY(0).length()-23)<1e-8);
  assert.ok(scene.camera.position.distanceTo(scene.ball.position)<40);
});
