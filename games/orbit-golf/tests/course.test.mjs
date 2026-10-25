import test from 'node:test';
import assert from 'node:assert/strict';
import {courseSample,COURSE_WORLD_PER_METER} from '../course.mjs';

test('continuous course starts downhill, rises and falls gently, and descends overall',()=>{
  assert.equal(courseSample(0).height,0);assert.ok(courseSample(0).slope<-.18);
  let rising=false,falling=false;
  for(let s=-100;s<10000;s+=3.7){const p=courseSample(s);assert.ok(Number.isFinite(p.height));assert.ok(p.slope>=-.231&&p.slope<=.111);rising ||=p.slope>.05;falling ||=p.slope<-.15;}
  assert.ok(rising&&falling);assert.ok(courseSample(10000).height<courseSample(0).height-220);
});

test('terrain slope matches the exact drawn height derivative at section boundaries and distant coordinates',()=>{
  for(const s of [0,359.999,360,360.001,720,3510,3570,7200,1e7]){
    const epsilon=.01,derivative=(courseSample(s+epsilon).height-courseSample(s-epsilon).height)/(2*epsilon*COURSE_WORLD_PER_METER);
    assert.ok(Math.abs(derivative-courseSample(s).slope)<1e-6);
    const jump=courseSample(s+epsilon).height-courseSample(s-epsilon).height;assert.ok(Math.abs(jump)<.002);
  }
});
