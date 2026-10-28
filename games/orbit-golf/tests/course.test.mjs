import test from 'node:test';
import assert from 'node:assert/strict';
import * as terrain from '../course.mjs';
const{courseSample,coursePattern,COURSE_WORLD_PER_METER:W,COURSE_SECTION_LENGTH:L}=terrain;

test('the entire course always runs straight forward and never inverts or produces a loop',()=>{
  assert.ok(!('loopAt'in terrain));assert.ok(!Object.keys(terrain).some(key=>key.startsWith('LOOP_')));
  for(const seed of[0,1,17,0xffffffff])for(let s=-100;s<20000;s+=11.3){
    const p=courseSample(s,seed);assert.equal(p.forward,s*W);assert.equal(p.lateral,0);assert.equal(p.tangentX,0);
    assert.ok(p.tangentZ>0&&p.normalY>0);assert.ok(Math.abs(p.pitch)<.78);assert.ok(!('loop'in p));
    assert.ok(Math.abs(Math.hypot(p.tangentY,p.tangentZ)-1)<1e-12);assert.ok(Math.abs(p.tangentY*p.normalY+p.tangentZ*p.normalZ)<1e-12);
  }
});

test('the seed owns reproducible profiles even after interleaved seeds and cache eviction',()=>{
  const positions=[0,35,150,359.99,360,600,1234,45000,10000000],expected=positions.map(s=>courseSample(s,4729));
  for(const seed of[1729,0,99,1,0xffffffff])for(let track=150;track<320;track++)courseSample(track*L+77,seed);
  assert.deepEqual(positions.toReversed().map(s=>courseSample(s,4729)).toReversed(),expected);
  assert.equal(courseSample(0,NaN).height,0);assert.ok(Number.isFinite(courseSample(NaN,Infinity).height));
});

test('seeded bags offer eight recognizably different profiles without adjacent repeats',()=>{
  for(const seed of[1,8,26,1000,0xffffffff]){
    const sequence=Array.from({length:160},(_,track)=>coursePattern(track,seed).id);
    for(let index=1;index<sequence.length;index++)assert.notEqual(sequence[index],sequence[index-1]);
    for(let bag=0;bag<20;bag++)assert.equal(new Set(sequence.slice(bag*8,bag*8+8)).size,8);
  }
  const signatures=Array.from({length:30},(_,seed)=>Array.from({length:9},(_,step)=>courseSample(40+step*40,seed).height.toFixed(4)).join(','));
  assert.equal(new Set(signatures).size,30,'different shots must not merely reuse the same road');
  const patterns=Array.from({length:16},(_,track)=>coursePattern(track,58));
  assert.ok(new Set(patterns.map(p=>p.amplitude.toFixed(3))).size>12);assert.ok(new Set(patterns.map(p=>p.breaks.join(','))).size>12);
});

test('all generated slopes remain bounded and each road has alternating climb, descent and rest beats',()=>{
  let up=0,down=0,quiet=0;
  for(let seed=0;seed<100;seed++)for(let track=0;track<16;track++)for(let step=0;step<=48;step++){
    const p=courseSample(track*L+L*step/48,seed);
    assert.ok(p.slope>=-.9500000001&&p.slope<=.8500000001,`${seed}/${track}: ${p.slope}`);
    up+=p.slope>.07;down+=p.slope<-.15;quiet+=Math.abs(p.slope)<.025;
  }
  assert.ok(up>3000&&down>3000&&quiet>3000);
  for(let seed=0;seed<100;seed++){
    assert.equal(courseSample(0,seed).height,0);
    for(let s=0;s<=60;s+=2)assert.ok(courseSample(s,seed).slope>-.13&&courseSample(s,seed).slope<.025,'early launch must be a gentle seeded introduction');
    const farHeight=courseSample(100*L,seed).height;
    assert.ok(farHeight>-176&&farHeight<-170,'the long-term drop must be gentle instead of continually feeding a steep descent');
  }
});

test('each eight-section sequence contains broad twenty-world-unit climbs and drops',()=>{
  for(let seed=0;seed<200;seed++)for(const bag of[0,1,11]){
    const patterns=Array.from({length:8},(_,slot)=>coursePattern(bag*8+slot,seed));
    for(const id of['crest','valley']){
      const pattern=patterns.find(pattern=>pattern.id===id),start=pattern.track*L;
      const heights=Array.from({length:145},(_,step)=>courseSample(start+step*L/144,seed).height);
      const span=Math.max(...heights)-Math.min(...heights);
      assert.ok(span>=20&&span<=35,`${seed}/${pattern.track}/${id}: height span ${span}`);
      assert.ok(pattern.rise>=20&&pattern.drop>=20,'a big hill must offer both a substantial climb and a substantial descent');
      assert.ok(Math.abs(pattern.verticalSpan-span)<.15,'the preview metadata must describe the actual road');
    }
  }
});

test('profile controls and section joins preserve height, slope and curvature without a terrain seam',()=>{
  for(const seed of[0,1,17,4729])for(const track of[0,1,2,7,8,19,27777]){
    const pattern=coursePattern(track,seed),boundaries=pattern.breaks.map(u=>(track+u)*L);
    for(const s of boundaries){
      const delta=1e-4,a=courseSample(s-delta,seed),b=courseSample(s+delta,seed);
      assert.ok(Math.abs(a.height-b.height)<delta*W*.65+1e-9);
      assert.ok(Math.abs(a.slope-b.slope)<1e-8);
      const ca=(courseSample(s-delta,seed).slope-courseSample(s-2*delta,seed).slope)/delta;
      const cb=(courseSample(s+2*delta,seed).slope-courseSample(s+delta,seed).slope)/delta;
      assert.ok(Math.abs(ca-cb)<2e-5);
    }
  }
});

test('drawn elevation derivative and physical gradient agree at arbitrary and distant positions',()=>{
  for(const seed of[0,1,17,4729])for(const s of[0,14.7,59,110,178.25,359.999,360,360.001,540,720,3510,3570,7200,1e7]){
    const delta=.01,p=courseSample(s,seed),a=courseSample(s-delta,seed),b=courseSample(s+delta,seed),measured=(b.height-a.height)/(2*delta*W);
    assert.ok(Number.isFinite(p.height));assert.ok(Math.abs(measured-p.gravitySlope)<1e-6,`${seed}/${s}: ${measured} != ${p.gravitySlope}`);
    assert.ok(Math.abs(p.tangentY/p.tangentZ-p.gravitySlope)<1e-12);
  }
});
