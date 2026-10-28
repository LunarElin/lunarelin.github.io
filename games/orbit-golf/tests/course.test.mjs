import test from 'node:test';
import assert from 'node:assert/strict';
import * as terrain from '../course.mjs';
const{courseSample,coursePattern,COURSE_WORLD_PER_METER:W,COURSE_SECTION_LENGTH:L,COURSE_PHRASE_LENGTH:P}=terrain;

test('the entire course runs forward without a loop, inversion or wall-like pitch',()=>{
  assert.ok(!('loopAt'in terrain));assert.ok(!Object.keys(terrain).some(key=>key.startsWith('LOOP_')));
  for(const seed of[0,1,17,0xffffffff])for(let s=-100;s<20000;s+=11.3){
    const p=courseSample(s,seed);assert.equal(p.forward,s*W);assert.equal(p.lateral,0);assert.equal(p.tangentX,0);
    assert.ok(p.tangentZ>0&&p.normalY>0);assert.ok(Math.abs(p.pitch)<.35);assert.ok(!('loop'in p));
    assert.ok(Math.abs(Math.hypot(p.tangentY,p.tangentZ)-1)<1e-12);assert.ok(Math.abs(p.tangentY*p.normalY+p.tangentZ*p.normalZ)<1e-12);
  }
});

test('the seed owns reproducible height, slope and curvature after interleaved caches and eviction',()=>{
  const positions=[0,35,150,359.99,360,600,1234,45000,10000000],expected=positions.map(s=>courseSample(s,4729));
  for(const seed of[1729,0,99,1,0xffffffff])for(let track=150;track<600;track++)courseSample(track*L+77,seed);
  assert.deepEqual(positions.toReversed().map(s=>courseSample(s,4729)).toReversed(),expected);
  assert.equal(courseSample(0,NaN).height,0);assert.ok(Number.isFinite(courseSample(NaN,Infinity).height));
});

test('three event sections share one long terrain phrase while seeded bags vary all eight shapes',()=>{
  assert.equal(P,3*L);
  for(const seed of[1,8,26,1000,0xffffffff]){
    const sequence=Array.from({length:80},(_,phrase)=>coursePattern(phrase*3,seed).id);
    for(let index=1;index<sequence.length;index++)assert.notEqual(sequence[index],sequence[index-1]);
    for(let bag=0;bag<10;bag++)assert.equal(new Set(sequence.slice(bag*8,bag*8+8)).size,8);
    for(let phrase=0;phrase<16;phrase++)for(let part=0;part<3;part++){
      const pattern=coursePattern(phrase*3+part,seed);
      assert.equal(pattern.id,sequence[phrase]);assert.equal(pattern.length,L);assert.equal(pattern.macroStart,phrase*P);
      assert.equal(pattern.macroLength,P);assert.equal(pattern.macroPhase,part/3);
    }
  }
  const signatures=Array.from({length:30},(_,seed)=>Array.from({length:9},(_,step)=>courseSample(40+step*40,seed).height.toFixed(4)).join(','));
  assert.equal(new Set(signatures).size,30,'different shots must not merely reuse a road');
  const patterns=Array.from({length:16},(_,phrase)=>coursePattern(phrase*3,58));
  assert.ok(new Set(patterns.map(p=>p.amplitude.toFixed(3))).size>12);assert.ok(new Set(patterns.map(p=>p.breaks.join(','))).size>12);
});

test('broad hills bound slopes and curvature while retaining climbs, descents and quiet stretches',()=>{
  let up=0,down=0,quiet=0;
  for(let seed=0;seed<100;seed++)for(let phrase=0;phrase<16;phrase++)for(let step=0;step<=96;step++){
    const p=courseSample((phrase+step/96)*P,seed);
    assert.ok(p.slope>=-.3600000001&&p.slope<=.3400000001,`${seed}/${phrase}: ${p.slope}`);
    assert.ok(Math.abs(p.heightSecondDerivative)<=.00750000001,'no short-radius crest may silently throw a base-speed rolling ball');
    assert.ok(Math.abs(p.curvature)<=Math.abs(p.heightSecondDerivative)+1e-12);
    up+=p.slope>.07;down+=p.slope<-.10;quiet+=Math.abs(p.slope)<.025;
  }
  assert.ok(up>3000&&down>3000&&quiet>3000);
  for(let seed=0;seed<100;seed++){
    assert.equal(courseSample(0,seed).height,0);
    for(let s=0;s<=60;s+=2)assert.ok(courseSample(s,seed).slope>-.03&&courseSample(s,seed).slope<.025,'early launch must be a gentle seeded introduction');
    const farHeight=courseSample(100*P,seed).height,baseline=-.012*100*P*W;
    assert.ok(Math.abs(farHeight-baseline)<3.00001,'the long-term descent must stay small rather than feed a steep perpetual ramp');
  }
});

test('each eight-phrase bag contains tall climbs and valleys, and the opening already shows a visible hill',()=>{
  for(let seed=0;seed<200;seed++)for(const bag of[0,1,11]){
    const patterns=Array.from({length:8},(_,slot)=>coursePattern((bag*8+slot)*3,seed));
    for(const id of['crest','valley']){
      const pattern=patterns.find(pattern=>pattern.id===id),start=pattern.macroStart;
      const heights=Array.from({length:145},(_,step)=>courseSample(start+step*P/144,seed).height);
      const span=Math.max(...heights)-Math.min(...heights);
      assert.ok(span>=20&&span<=35,`${seed}/${pattern.phrase}/${id}: height span ${span}`);
      assert.ok(pattern.rise>=20&&pattern.drop>=20);
      assert.ok(Math.abs(pattern.verticalSpan-span)<.15,'metadata must describe the whole drawn phrase');
    }
    if(bag===0){
      const intro=Array.from({length:51},(_,step)=>courseSample(150+step*5,seed).height);
      assert.ok(Math.max(...intro)-Math.min(...intro)>=6,'the first 150–400m cannot be a visually flat runway');
    }
  }
});

test('control points and all event-section joins preserve C2 height, slope and curvature',()=>{
  for(const seed of[0,1,17,4729])for(const track of[0,1,2,7,8,19,27777]){
    const pattern=coursePattern(track,seed),boundaries=[...pattern.breaks.map(u=>pattern.macroStart+u*P),track*L,(track+1)*L];
    for(const s of boundaries){
      const delta=1e-4,a=courseSample(s-delta,seed),b=courseSample(s+delta,seed);
      assert.ok(Math.abs(a.height-b.height)<delta*W*.73+1e-8);
      assert.ok(Math.abs(a.slope-b.slope)<delta*W*.0151+1e-8);
      assert.ok(Math.abs(a.heightSecondDerivative-b.heightSecondDerivative)<1e-6);
    }
  }
});

test('analytic first and second world derivatives agree with arbitrary and distant samples',()=>{
  for(const seed of[0,1,17,4729])for(const s of[0,14.7,59,110,178.25,359.999,360,360.001,540,720,1080,3510,3570,7200,1e7]){
    const delta=.01,p=courseSample(s,seed),a=courseSample(s-delta,seed),b=courseSample(s+delta,seed);
    const measured=(b.height-a.height)/(2*delta*W),second=(b.slope-a.slope)/(2*delta*W);
    assert.ok(Number.isFinite(p.height));assert.ok(Math.abs(measured-p.gravitySlope)<1e-6,`${seed}/${s}: ${measured} != ${p.gravitySlope}`);
    assert.ok(Math.abs(second-p.heightSecondDerivative)<1e-6);
    assert.ok(Math.abs(p.curvature-p.heightSecondDerivative/(1+p.slope*p.slope)**1.5)<1e-12);
    assert.ok(Math.abs(p.tangentY/p.tangentZ-p.gravitySlope)<1e-12);
  }
});
