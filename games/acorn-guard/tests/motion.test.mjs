import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_TIMING, VIEWS, projectWorldVector, screenInputToWorld, viewForScreenVector, viewForWorldVector,
  actionWindow, actionClock, createPoseMemory, actorPose, frameAt } from '../motion.mjs';

test('touch and keyboard diagonals follow their screen direction on the tilted ground', () => {
  for (const [x,y] of [[1,1],[-1,1],[.2,-.4],[0,-1],[1,0],[0,0]]) {
    const world=screenInputToWorld(x,y),screen=projectWorldVector(world.x,world.y);
    assert.ok(Math.hypot(world.x,world.y)<=1+1e-12);
    assert.ok(Math.abs(screen.x*y-screen.y*x)<1e-12);
    if(x||y)assert.ok(screen.x*x+screen.y*y>0);
    else assert.deepEqual(world,{x:0,y:0});
  }
});

test('actual world travel resolves to four independent screen-facing views', () => {
  for (const [x,y,view] of [[1,1,'front'],[-1,-1,'back'],[1,-1,'right'],[-1,1,'left']]) {
    assert.equal(viewForWorldVector(x,y),view);
  }
  assert.deepEqual(projectWorldVector(1,-1),{x:Math.SQRT2,y:0});
  assert.equal(new Set(VIEWS).size,4);
});

test('diagonal boundaries retain facing until the turn passes the hysteresis band', () => {
  const vector = degrees => [Math.cos(degrees*Math.PI/180),Math.sin(degrees*Math.PI/180)];
  assert.equal(viewForScreenVector(...vector(46),'right'),'right');
  assert.equal(viewForScreenVector(...vector(54),'right'),'right');
  assert.equal(viewForScreenVector(...vector(57),'right'),'front');
  assert.equal(viewForScreenVector(...vector(40),'front'),'front');
  assert.equal(viewForScreenVector(...vector(33),'front'),'right');
  assert.equal(viewForScreenVector(0,0,'back'),'back');
  assert.equal(viewForScreenVector(NaN,0,'left'),'left');
});

test('movement determines body facing even while a squirrel aims elsewhere', () => {
  const memory=createPoseMemory('front');
  const squirrel={id:'squirrel',moving:true,moveDX:-1,moveDY:-1,actionCount:1,actionStartedAt:10,actionDX:1,actionDY:-1,rate:2};
  const pose=actorPose(squirrel,memory,10.2);
  assert.equal(pose.view,'back');assert.equal(pose.action,'run');
  squirrel.moving=false;
  assert.equal(actorPose(squirrel,memory,11).view,'back');
});

test('harvesting locks target direction across contact, target removal and recovery', () => {
  const memory=createPoseMemory('front');
  const bear={id:'bear',moving:false,actionCount:1,actionStartedAt:3,actionDX:-1,actionDY:-1,rate:1};
  assert.equal(actorPose(bear,memory,3.1).view,'back');
  bear.actionDX=1;bear.actionDY=1;
  assert.equal(actorPose(bear,memory,3.5).view,'back');
  const idle=actorPose(bear,memory,3.7);
  assert.equal(idle.view,'back');assert.equal(idle.action,'idle');
  bear.moving=true;bear.moveDX=-1;bear.moveDY=1;
  assert.equal(actorPose(bear,memory,3.8).view,'left');
});

test('the same contact drawing is reached at all harvesting rates', () => {
  const animation={fps:10,loop:false,frames:Array.from({length:6},(_,index)=>({index,duration_ms:100}))};
  for(const rate of [1,1.9,2.2,6]) {
    const contact=actionWindow(rate)*ACTION_TIMING.contactRatio;
    const clock=actionClock(contact,0,rate);
    assert.equal(frameAt(animation,clock.seconds).index,3);
    assert.ok(Math.abs(clock.phase-.55)<1e-10);
    assert.equal(frameAt(animation,5).index,5);
  }
  assert.equal(frameAt({...animation,loop:true},.6).index,0);
});

test('an upgrade does not change the speed or target facing of an action already in progress', () => {
  const worker={id:'fox',moving:false,actionCount:1,actionStartedAt:1,actionRate:1.5,rate:6,actionDX:1,actionDY:1};
  const pose=actorPose(worker,createPoseMemory(),1.33);
  assert.equal(pose.view,'front');assert.ok(Math.abs(pose.clock.seconds-.33)<1e-8);
  worker.actionCancelled=true;
  assert.equal(actorPose(worker,createPoseMemory(),1.33).action,'idle');
});
