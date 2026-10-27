import test from 'node:test';
import assert from 'node:assert/strict';
import {courseSample,loopAt,COURSE_WORLD_PER_METER,LOOP_FIRST_START,LOOP_LENGTH,LOOP_INTERVAL} from '../course.mjs';

test('continuous course starts downhill, rises and falls gently, and descends overall',()=>{
  assert.equal(courseSample(0).height,0);assert.ok(courseSample(0).slope<-.18);
  let rising=false,falling=false;
  for(let s=-100;s<10000;s+=3.7){const p=courseSample(s);assert.ok(Number.isFinite(p.height));assert.ok(p.slope>=-.231&&p.slope<=.111);rising ||=p.slope>.05;falling ||=p.slope<-.15;}
  assert.ok(rising&&falling);assert.ok(courseSample(10000).height<courseSample(0).height-220);
});

test('terrain slope matches the exact drawn height derivative at section boundaries and distant coordinates',()=>{
  for(const s of [0,359.999,360,360.001,720,3510,3570,7200,1e7]){
    const epsilon=.01,derivative=(courseSample(s+epsilon).height-courseSample(s-epsilon).height)/(2*epsilon*COURSE_WORLD_PER_METER);
    assert.ok(Math.abs(derivative-courseSample(s).gravitySlope)<1e-6);
    const jump=courseSample(s+epsilon).height-courseSample(s-epsilon).height;assert.ok(Math.abs(jump)<2*epsilon*COURSE_WORLD_PER_METER*1.25);
  }
});


test('selected sections draw one continuous full vertical turn with finite orthonormal frames',()=>{
  assert.equal(loopAt(LOOP_FIRST_START-1),null);assert.equal(loopAt(LOOP_FIRST_START-30,65).progress,0);
  assert.equal(loopAt(LOOP_FIRST_START+LOOP_LENGTH+30,65).progress,1);
  for(const index of [0,1,2,15,5555]){
    const start=LOOP_FIRST_START+LOOP_INTERVAL*index;let previous,turn=0,backward=false,inverted=false;
    for(let i=0;i<=256;i++){
      const p=courseSample(start+LOOP_LENGTH*i/256),angle=Math.atan2(p.tangentY,p.tangentZ);
      assert.ok(p.loop);assert.equal(p.loop.index,index);assert.equal(p.loop.section,3+index*5);
      assert.ok(Math.abs(Math.hypot(p.tangentX,p.tangentY,p.tangentZ)-1)<1e-10);
      assert.ok(Math.abs(p.tangentY*p.normalY+p.tangentZ*p.normalZ)<1e-10);
      backward ||=p.tangentZ<-.7;inverted ||=p.normalY<-.9;
      if(previous!==undefined){let delta=angle-previous;while(delta>Math.PI)delta-=Math.PI*2;while(delta< -Math.PI)delta+=Math.PI*2;turn+=delta;}previous=angle;
    }
    assert.ok(turn>5.8&&turn<6.8,'the actual tangent must make one full turn');assert.ok(backward&&inverted);
  }
});

test('loop joins preserve position and tangent in both travel directions without a terrain seam',()=>{
  for(const index of [0,1,10,5555])for(const boundary of [LOOP_FIRST_START+index*LOOP_INTERVAL,LOOP_FIRST_START+index*LOOP_INTERVAL+LOOP_LENGTH]){
    const a=courseSample(boundary-1e-5),b=courseSample(boundary+1e-5);
    assert.ok(Math.hypot(a.height-b.height,a.forward-b.forward)<2e-5);
    assert.ok(a.tangentY*b.tangentY+a.tangentZ*b.tangentZ>.99999999);
  }
});

test('loop elevation work and drawn derivative agree through vertical and inverted sections',()=>{
  for(let i=1;i<128;i++){
    const s=LOOP_FIRST_START+LOOP_LENGTH*i/128,delta=.001,a=courseSample(s-delta),b=courseSample(s+delta),p=courseSample(s);
    assert.ok(Math.abs((b.height-a.height)/(2*delta*COURSE_WORLD_PER_METER)-p.gravitySlope)<1e-6);
    const dx=b.lateral-a.lateral,dy=b.height-a.height,dz=b.forward-a.forward,length=Math.hypot(dx,dy,dz);
    assert.ok(Math.abs(dx/length-p.tangentX)<1e-6);assert.ok(Math.abs(dy/length-p.tangentY)<1e-6);assert.ok(Math.abs(dz/length-p.tangentZ)<1e-6);
  }
});

test('three-dimensional loops keep the entire broad approach, turn and exit surfaces apart',()=>{
  for(let loop=0;loop<100;loop++){
    const points=Array.from({length:501},(_,i)=>courseSample(LOOP_FIRST_START+LOOP_INTERVAL*loop-150+(LOOP_LENGTH+300)*i/500));
    for(let a=0;a<=500;a++)for(let b=a+50;b<=500;b++){
      const dx=Math.max(0,Math.abs(points[a].lateral-points[b].lateral)-20),dy=points[a].height-points[b].height,dz=points[a].forward-points[b].forward;
      assert.ok(Math.hypot(dx,dy,dz)>4.5,'20-world-wide nonadjacent decks need room for the 2.1-world-diameter ball');
    }
  }
});
