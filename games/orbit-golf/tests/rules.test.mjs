import test from 'node:test';
import assert from 'node:assert/strict';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { courseSample } from '../course.mjs';
import {
  TRACK_LENGTH, TRACK_WIDTH, DISTANCE_PER_GOLD, SIDE_LIMIT, WORLD_PER_METER, MAX_PROP_BODIES, MAX_CHAIN_DEPTH,
  UPGRADE_DEFS, COLLISION_EFFECTS, TUTORIAL_DURATION, RUN_DURATION, MAX_GIMMICK_WAVES, lapConfig, guardianPower,
  newProfile, sanitizeProfile, cleanName, upgradeCost, buyUpgrade,
  generateTrack, eventX, eventPose, ballStats, newRun, steerRun, resolveEvent, stepRun,
  collectRunGold, canContinue, continueRun, settleRun,
} from '../rules.mjs';

const ordinary = level => ({ ...newProfile(), tutorialComplete: true, upgrades: { pilot: 0, ball: level } });
function finish(profile, seed = 1, power = 1, dt = .2, aim = 8) {
  const run = newRun(profile, power, seed, aim), types = new Set();
  for (let count = 0; run.phase === 'rolling' && count < 20000; count++)
    for (const event of stepRun(run, profile, dt)) types.add(event.type);
  assert.equal(run.phase, 'stopped', 'a shot must reach a result without player input');
  return { run, types };
}

test('profile input remains bounded and names are safe plain text', () => {
  const profile = sanitizeProfile({
    name: '  별\u0000골퍼<script>엄청나게긴이름  ', gold: Infinity,
    upgrades: { pilot: 99, ball: -5 }, rankings: [{ name: '', distance: 4 }, { name: '가짜', distance: NaN }],
  });
  assert.equal([...profile.name].length, 12);
  assert.ok(!profile.name.includes('<'));assert.equal(profile.gold, 0);
  assert.deepEqual(profile.upgrades, { pilot: 5, ball: 0 });assert.deepEqual(profile.rankings, []);
  assert.equal(cleanName(null), '');assert.deepEqual(sanitizeProfile(null), newProfile());
});
test('version-one migration preserves the existing wallet, upgrades and records', () => {
  const old = { version: 1, name: '기존 골퍼', gold: 345, upgrades: { pilot: 2, ball: 3 }, rankings: [{ name: '기존 골퍼', distance: 900 }] };
  const profile = sanitizeProfile(old);
  assert.equal(profile.tutorialComplete, false);assert.equal(profile.gold, 345);
  assert.deepEqual(profile.upgrades, old.upgrades);assert.equal(profile.rankings[0].distance, 900);
  assert.equal(sanitizeProfile({ ...old, tutorialComplete: 'true' }).tutorialComplete, false);
  assert.equal(sanitizeProfile({ ...old, tutorialComplete: true }).tutorialComplete, true);
});
test('purchases charge the displayed price and reject invalid, poor or maxed upgrades', () => {
  const profile = newProfile();
  assert.equal(upgradeCost(profile, 'pilot'), UPGRADE_DEFS.pilot.baseCost);
  assert.equal(buyUpgrade(profile, 'pilot'), false);profile.gold = 10000;
  const cost = upgradeCost(profile, 'ball');
  assert.equal(buyUpgrade(profile, 'ball'), true);assert.equal(profile.gold, 10000 - cost);
  assert.equal(profile.upgrades.ball, 1);assert.equal(buyUpgrade(profile, '__proto__'), false);
  profile.upgrades.ball = 5;assert.equal(upgradeCost(profile, 'ball'), Infinity);
  assert.equal(buyUpgrade(profile, 'ball'), false);
});
test('seeded encounters reproduce exactly while count, spacing, formations and large subjects change',()=>{
  assert.deepEqual(generateTrack(1,42),generateTrack(1,42));assert.notDeepEqual(generateTrack(1,42),generateTrack(1,43));
  const counts=new Set(),signatures=new Set(),subjects=new Set();let warps=0;
  for(let seed=1;seed<=100;seed++){
    const events=generateTrack(1,seed);counts.add(events.length);signatures.add(events.map(event=>event.type).join(','));
    assert.ok(events.length>=10&&events.length<=55);assert.equal(new Set(events.map(event=>event.id)).size,events.length);
    for(const event of events){assert.equal(Object.hasOwn(event,'lane'),false);assert.ok(Math.abs(event.x)<=7.7);assert.ok(event.at>360&&event.at<720);assert.ok(event.radius>0);if(['beast','giant-alien','cookie'].includes(event.type))subjects.add(event.type);}
    if(events.some(event=>['hole','ufo'].includes(event.type)))warps++;
  }
  assert.ok(counts.size>=8&&signatures.size>=90,'variety must change encounter structure, not just small offsets');
  assert.deepEqual([...subjects].sort(),['beast','cookie','giant-alien']);assert.ok(warps>0&&warps<100);
});

test('the opening introduces rebounds and a giant subject before hard hazards',()=>{
  const subjects=new Set(),sides=new Set(),positions=new Set();
  for(let seed=1;seed<=100;seed++){
    const events=generateTrack(0,seed),early=events.filter(event=>event.at<100),giant=events.find(event=>event.encounter);
    assert.ok(early.some(event=>event.type==='spring')&&early.some(event=>event.type==='bumper'));
    assert.ok(!early.some(event=>event.type==='trap'||event.type==='comet'));
    assert.ok(giant&&giant.at>=120&&giant.at<=180&&giant.radius>=2.25&&giant.radius<TRACK_WIDTH/2);subjects.add(giant.type);
    sides.add(Math.sign(giant.x));positions.add(giant.x);
  }
  assert.equal(subjects.size,3);assert.equal(sides.size,2);assert.ok(positions.size>90);
});

test('each section adds seeded formation choices and every fifth adds three without unbounded density',()=>{
  assert.equal(lapConfig(1).additions,0);const orders=new Set();
  for(let seed=1;seed<=30;seed++)orders.add(lapConfig(8,seed).activeWaves.map(w=>w.id).join(','));
  assert.ok(orders.size>=25,'every run must not unlock the same ordered pattern');
  for(let lap=2;lap<=80;lap++){
    const plan=lapConfig(lap,42),events=generateTrack(lap-1,42);
    assert.equal(plan.additions,lap%5===0?3:1);assert.equal(plan.newGimmicks.length,plan.additions);
    assert.ok(plan.activeWaves.length<=MAX_GIMMICK_WAVES&&events.length<=55);
    assert.ok(plan.newGimmicks.every(wave=>events.some(event=>event.gimmick===wave.id)));
    assert.equal(events.some(event=>event.type==='guardian'),lap%10===0);
    if(lap%10===0)assert.ok(events.filter(event=>event.type!=='guardian').every(event=>event.at<lap*TRACK_LENGTH-100));
  }
  for(const value of[Number.MAX_VALUE,-Infinity,Infinity,NaN]){const plan=lapConfig(value);assert.ok(Number.isFinite(plan.lap)&&Number.isFinite(plan.additions));assert.ok(plan.activeWaves.every(wave=>wave.id&&Number.isFinite(wave.tier)));}
});

test('the elevated second spring catches an airborne ball and launches another actual arc',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0);
  Object.assign(run,{s:100,distance:100,speed:70,rollSpeed:70,events:[],eventTrack:0});
  resolveEvent(run,{id:'ground-spring',type:'spring',at:100,x:0,direction:1},profile,{s:-1,x:0});
  run.events=[{id:'air-catch',type:'spring',at:120,x:0,elevation:3.2,airborne:true}];
  const feedback=[];for(let frame=0;frame<120;frame++)feedback.push(...stepRun(run,profile,1/120));
  assert.ok(feedback.some(event=>event.eventId==='air-catch'&&event.effect==='jump'));
  assert.equal(run.maxHeight,7.5,'second aerial contact must create a higher arc than the first jump alone');
});

test('a ground-level flying prop cannot falsely hit an elevated spring through a phantom vertical sweep',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0),source={id:'low-prop',type:'bumper',at:100,x:0,radius:.85,height:1.05};
  Object.assign(run,{speed:10,rollSpeed:10,events:[],eventTrack:0});
  source.body={s:100,x:0,height:0,vs:50,vx:0,vy:0,rx:0,ry:0,rz:0,wx:0,wy:0,wz:0,active:true,life:4.2,wheel:0,depth:1,chainId:1,impacts:0,contacts:{}};
  const target={id:'upper-spring',type:'spring',at:110,x:0,radius:.85,height:1.05,elevation:3.2,airborne:true};
  run.events=[source,target];stepRun(run,profile,.4);
  assert.equal(run.chainHits,0);assert.equal(target.body,undefined);
});

function guardianRun(profile,speed=100){
  const run=newRun(profile,1,42,0);
  Object.assign(run,{s:3558,distance:3558,speed,rollSpeed:speed,x:0,vx:0,height:0,vy:0,track:9,eventTrack:9,
    events:[8,9,10].flatMap(track=>generateTrack(track,42))});
  return run;
}
test('guardian power uses actual positive forward speed and upgraded mass rather than sideways motion or stored roll',()=>{
  const run=guardianRun(ordinary(0),170);assert.equal(guardianPower(run,ordinary(0)),170);
  run.vx=999;run.rollSpeed=999;run.speed=0;assert.equal(guardianPower(run,ordinary(5)),0);
  run.speed=-200;assert.equal(guardianPower(run,ordinary(5)),0);
  run.speed=100;assert.equal(guardianPower(run,ordinary(2)),140);
});
test('a weak shot cannot slip through the full width guardian while airborne or after repeated cooldown hits',()=>{
  const profile=ordinary(0),run=guardianRun(profile,100),guardian=run.events.find(event=>event.type==='guardian');
  Object.assign(run,{x:SIDE_LIMIT,vx:20,height:7.5,vy:0});Object.assign(guardian,{hits:99,cooldown:999});
  const feedback=stepRun(run,profile,.3);
  assert.ok(feedback.some(event=>event.kind==='guardian-block'&&!event.passed&&event.force<event.requiredForce));
  const hit=feedback.find(event=>event.kind==='guardian-block');
  assert.ok(hit.x>5&&hit.height>5,'wall contact effects must follow the real side and airborne height');
  assert.ok(Math.abs(hit.s-(guardian.at-guardian.depth/2/WORLD_PER_METER))<1e-8);
  assert.ok(run.s<guardian.at);assert.equal(guardian.used,false);assert.equal(guardian.broken,false);assert.equal(guardian.body,undefined);
  steerRun(run,1);
  for(let count=0;count<600&&run.phase==='rolling';count++){stepRun(run,profile,.1);assert.ok(run.s<guardian.at);}
  assert.equal(run.phase,'stopped');assert.equal(run.stopReason,'natural');assert.equal(run.guardiansBroken,0);
});
test('the force threshold distinguishes nearby weak and strong forward impacts without a prop launch',()=>{
  for(const [speed,passed] of [[169.9,false],[170.1,true]]){
    const profile=ordinary(0),run=guardianRun(profile,speed);run.s=3566;
    const feedback=stepRun(run,profile,1/120),hit=feedback.find(event=>event.type==='guardian');
    assert.equal(hit?.passed,passed);assert.equal(hit.kind,passed?'guardian-break':'guardian-block');
    assert.equal(run.guardiansBroken,passed?1:0);assert.equal(run.events.find(event=>event.type==='guardian').body,undefined);
  }
});
test('a powerful guardian break persists across cache eviction and continuation and pays only once',()=>{
  const profile=ordinary(2),run=guardianRun(profile,195),guardian=run.events.find(event=>event.type==='guardian');
  const feedback=stepRun(run,profile,.2),hit=feedback.find(event=>event.kind==='guardian-break');
  assert.ok(hit&&hit.force>=hit.requiredForce&&hit.passed);assert.ok(run.s>guardian.at);
  assert.equal(guardian.broken,true);assert.equal(run.guardiansBroken,1);assert.ok(run.consumed.has(guardian.id));
  const bonus=run.bonusGold;assert.equal(bonus,40);
  Object.assign(run,{s:20,rollSpeed:50,speed:50});stepRun(run,profile,1/120);
  assert.ok(!run.events.some(event=>event.id===guardian.id));
  Object.assign(run,{s:3520,rollSpeed:195,speed:195});stepRun(run,profile,1/120);
  assert.equal(run.events.find(event=>event.id===guardian.id).broken,true);
  run.phase='stopped';profile.gold=100;assert.equal(continueRun(profile,run),true);
  stepRun(run,profile,1);assert.equal(run.guardiansBroken,1);assert.equal(run.bonusGold,bonus);assert.ok(run.s>3570);
});
test('warps are clamped before the first unbroken guardian even outside the event cache',()=>{
  const profile=ordinary(0),run=guardianRun(profile,30);
  run.events=[];run.eventTrack=9;run.s=3560;
  resolveEvent(run,{id:'warp',type:'ufo',at:3560,x:0},profile);
  assert.ok(run.s<3570);assert.equal(run.guardiansBroken,0);assert.equal(run.consumed.has('guardian:10'),false);
  const blocked=stepRun(run,profile,1);assert.ok(blocked.some(event=>event.kind==='guardian-block'));
  assert.ok(run.s<3570);
  run.consumed.add('guardian:10');run.s=7160;run.speed=30;run.rollSpeed=30;
  resolveEvent(run,{id:'second-warp',type:'hole',at:7160,x:0},profile);
  assert.ok(run.s<7170);assert.equal(run.nextGuardianLap,20);
});

test('flying props reflect from an intact guardian and pass only after the ball has broken it',()=>{
  for(const broken of [false,true]){
    const profile=ordinary(0),run=guardianRun(profile,10);run.s=3500;
    const prop={id:'wall-prop',type:'bumper',at:3560,x:4,radius:1.15,height:1.05};
    prop.body={s:3560,x:4,height:5,vs:120,vx:0,vy:0,rx:0,ry:0,rz:0,wx:0,wy:0,wz:0,active:true,life:4.2,wheel:0,depth:1,chainId:1,impacts:0,contacts:{}};
    if(broken)run.consumed.add('guardian:10');run.events=[prop];
    stepRun(run,profile,.2);
    assert.equal(run.guardiansBroken,0);assert.equal(run.bonusGold,0);assert.equal(run.consumed.has('guardian:10'),broken);
    if(broken){assert.ok(prop.body.s>3570);assert.ok(prop.body.vs>0);}
    else {assert.ok(prop.body.s<3570);assert.ok(prop.body.vs<0);}
  }
});
test('moving prop positions are continuous, bounded and shared with rendering', () => {
  const alien = { type: 'alien', x: 0, phase: .2 };
  assert.notEqual(eventX(alien, 0), eventX(alien, .1));
  for (let time = 0; time < 10; time += .03) {
    assert.ok(Math.abs(eventX(alien, time)) <= 7.9);
    assert.ok(Math.abs(eventX({ type: 'punch', x: 7, phase: 1 }, time)) <= 7.9);
  }
});
test('power, continuous shot angle and ball upgrades change actual launch velocity', () => {
  const profile = ordinary(0), straight = newRun(profile, 1, 1, 0), angled = newRun(profile, 1, 1, 13.75);
  assert.equal(straight.speed, ballStats(profile).launchSpeed);
  assert.ok(newRun(profile, 0, 1).speed < straight.speed);
  assert.ok(angled.vx > 0 && angled.speed < straight.speed);
  assert.equal(angled.aim, 13.75);assert.equal(Object.hasOwn(angled, 'lane'), false);
  assert.ok(newRun(ordinary(1), 1, 1).rollSpeed > straight.rollSpeed * 1.3);
  assert.ok(ballStats(1).range > ballStats(0).range * 1.95);
});
test('spin applies force continuously rather than snapping to discrete positions', () => {
  const profile = ordinary(0), run = newRun(profile, 1, 1, 0);
  run.events = [];run.eventTrack = 0;
  assert.equal(steerRun(run, .37), true);
  stepRun(run, profile, .1);
  assert.ok(run.vx > 0);assert.ok(run.x > 0 && run.x < .2);
  assert.notEqual(run.x, -1);assert.notEqual(run.x, 0);assert.notEqual(run.x, 1);
  steerRun(run, 20);assert.equal(run.steer, 1);
  run.phase = 'stopped';assert.equal(steerRun(run, -1), false);
});

test('exhausted forward momentum ends naturally even with held spin and lateral or airborne motion',()=>{
  for(const dt of [1/60,.1,1])for(const axis of [-1,1]) {
    const profile=ordinary(0),run=newRun(profile,1,1,0);
    Object.assign(run,{speed:0,rollSpeed:0,vx:12,height:1,vy:3,events:[],eventTrack:0});
    steerRun(run,axis);
    for(let time=0;time<2&&run.phase==='rolling';time+=dt)stepRun(run,profile,dt);
    assert.equal(run.phase,'stopped','held lateral input must not prevent a forward stop');
    assert.equal(run.stopReason,'natural');assert.ok(run.elapsed<1);
    for(const key of ['speed','rollSpeed','vx','vy','steer'])assert.equal(run[key],0);
  }
});

test('a complete free shot ends naturally while spin is held instead of waiting for the duration cap',()=>{
  for(const dt of [1/60,.1])for(const axis of [-1,1]) {
    const profile=ordinary(0),run=newRun(profile,1,1,0);steerRun(run,axis);
    while(run.phase==='rolling'){
      run.events=[];run.eventTrack=run.track;stepRun(run,profile,dt);
    }
    assert.equal(run.stopReason,'natural');assert.ok(run.elapsed<35);
    assert.equal(run.steer,0);assert.equal(run.vx,0);
  }
});

test('steering and collider spin cannot add movement once the forward budget is empty',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0);
  Object.assign(run,{speed:0,rollSpeed:0,vx:0,height:0,vy:0,curveSpin:20,events:[],eventTrack:0});
  steerRun(run,1);stepRun(run,profile,.2);
  assert.equal(run.x,0);assert.equal(run.vx,0);assert.equal(run.s,0);assert.equal(run.rollSpeed,0);
});

test('ground contact ignores a stale rolling reserve instead of accelerating back to it',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0);
  Object.assign(run,{s:100,distance:100,speed:20,rollSpeed:300,events:[],eventTrack:0});
  stepRun(run,profile,.3);
  assert.ok(run.speed>0&&run.speed<20);
  assert.equal(run.rollSpeed,run.speed);
});

test('landing dissipates forward speed without restoring the pre-impact launch velocity',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0);
  Object.assign(run,{s:100,distance:100,speed:10,rollSpeed:300,height:.01,vy:-7,events:[],eventTrack:0});
  const feedback=stepRun(run,profile,1/120);
  assert.ok(feedback.some(event=>event.type==='landing'));
  assert.ok(run.speed>0&&run.speed<10);
  assert.equal(run.rollSpeed,run.speed);
});

test('braking remains lost velocity during the following second rather than springing back',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0);
  Object.assign(run,{s:100,distance:100,speed:70,rollSpeed:300,events:[],eventTrack:0});
  resolveEvent(run,{id:'brake',type:'trap',at:100,x:0},profile,{x:0,s:-1});
  const after=run.speed;
  assert.ok(after<18);
  for(let frame=0;frame<120;frame++){
    run.events=[];run.eventTrack=run.track;stepRun(run,profile,1/120);
    assert.ok(run.speed<=after);
    assert.equal(run.rollSpeed,Math.max(0,run.speed));
  }
});

test('a reflected ball keeps traveling backward until friction stops it',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0);
  Object.assign(run,{s:200,distance:200,speed:-30,rollSpeed:300,events:[],eventTrack:0});
  stepRun(run,profile,.5);
  assert.ok(run.s<190&&run.speed<0);
  assert.equal(run.rollSpeed,0);
});

test('passive stationary objects never multiply horizontal kinetic speed at any upgrade level',()=>{
  for(const level of [0,5])for(const type of ['bumper','spring','alien','comet','trap']){
    const profile=ordinary(level),run=newRun(profile,1,1,0);
    Object.assign(run,{speed:70,rollSpeed:300,vx:3});
    const before=Math.hypot(run.speed*WORLD_PER_METER,run.vx);
    resolveEvent(run,{id:type,type,at:100,x:0},profile,{x:.6,s:-.8});
    assert.ok(Math.hypot(run.speed*WORLD_PER_METER,run.vx)<=before+.000001,`${type}, level${level} created free motion`);
  }
});

test('a field of fresh passive bumpers cannot refill forward travel',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0);let before=run.speed;
  for(let index=0;index<30;index++){
    resolveEvent(run,{id:`passive-${index}`,type:'bumper',at:100,x:0},profile,{x:0,s:-1});
    assert.ok(run.speed<=before);before=run.speed;
  }
  assert.ok(run.speed<1);
});

test('moving prop contacts exchange finite mass impulses without manufacturing kinetic energy',()=>{
  for(const level of [0,2,5]){
    const profile=ordinary(level),run=newRun(profile,1,1,0),mass=1+level*2.8;
    Object.assign(run,{speed:0,rollSpeed:0,vx:0,vy:0});
    const event={id:'moving-energy',type:'bumper',direction:1,body:{active:true,vs:60,vx:0,vy:0}};
    const energy=()=>mass*((run.speed*WORLD_PER_METER)**2+run.vx**2)+1.1*((event.body.vs*WORLD_PER_METER)**2+event.body.vx**2);
    const before=energy();resolveEvent(run,event,profile,{x:0,s:1});
    assert.ok(run.speed>0&&event.body.vs<60);
    assert.ok(energy()<=before+1e-8,`level${level} contact created kinetic energy`);
  }
});

test('a passive hit budgets launched prop energy and its later rebound against the same ball',()=>{
  for(const level of [0,5])for(const type of ['bumper','comet']){
    const profile=ordinary(level),run=newRun(profile,1,1,0),mass=1+level*2.8,propMass=type==='comet'?1.4:1.1;
    Object.assign(run,{speed:70,rollSpeed:70,vx:3,vy:0});
    const initial=mass*((run.speed*WORLD_PER_METER)**2+run.vx**2),event={id:'rebound-energy',type,direction:1};
    const energy=()=>mass*((run.speed*WORLD_PER_METER)**2+run.vx**2)+propMass*((event.body.vs*WORLD_PER_METER)**2+event.body.vx**2);
    resolveEvent(run,event,profile,{x:.6,s:-.8});
    const launched=energy();assert.ok(launched<=initial+1e-8);
    run.elapsed=event.cooldown+.01;
    const ds=(run.speed-event.body.vs)*WORLD_PER_METER,dx=run.vx-event.body.vx,length=Math.hypot(ds,dx);
    resolveEvent(run,event,profile,{s:-ds/length,x:-dx/length});
    assert.ok(energy()<=launched+1e-8,'the returning prop may transfer energy once, without adding another launch reserve');
  }
});

test('explicit propulsion has diminishing thrust bounded by the equipped ball launch speed',()=>{
  for(const type of ['boost','punch']){
    const profile=ordinary(2),run=newRun(profile,1,1,0),limit=ballStats(profile).launchSpeed*1.25;
    run.speed=run.rollSpeed=30;
    for(let index=0;index<100;index++){
      resolveEvent(run,{id:`powered-${index}`,type,at:100,x:0},profile,{x:0,s:-1});
      assert.ok(run.speed<=limit+.000001);
    }
    assert.ok(run.speed>30);
  }
});

test('a warp preserves reduced travel instead of enforcing an unexplained minimum speed',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0);
  Object.assign(run,{speed:5,rollSpeed:300});
  resolveEvent(run,{id:'low-warp',type:'ufo',at:100,x:0},profile);
  assert.equal(run.speed,4.5);assert.equal(run.rollSpeed,4.5);
});

test('grounded slope force follows the rendered course and uphill loses more speed than downhill',()=>{
  const profile=ordinary(0),seed=83,positions=Array.from({length:1800},(_,index)=>index+1);
  const down=positions.find(s=>courseSample(s,seed).slope<-.15),up=positions.find(s=>courseSample(s,seed).slope>.07);
  assert.ok(down!==undefined&&up!==undefined);
  const changes=[];
  for(const s of [down,up]){
    const run=newRun(profile,1,seed,0);Object.assign(run,{s,distance:s,speed:30,rollSpeed:30,events:[],eventTrack:Math.floor(s/TRACK_LENGTH)});
    stepRun(run,profile,1/120);
    const expected=30+(-14*courseSample(s,seed).slope-ballStats(profile).drag)/120;
    assert.ok(Math.abs(run.speed-expected)<1e-8);changes.push(run.speed);
  }
  assert.ok(changes[0]>changes[1]);
});

test('giant encounters give separate belly arcs, directional tentacle spin and brittle cookie breaks',()=>{
  const profile=ordinary(0),results=new Map();
  for(const type of ['beast','giant-alien','cookie']){
    const run=newRun(profile,1,1,0),event={id:type,type,at:100,x:0,radius:2.4,height:2.2,direction:1};
    Object.assign(run,{s:100,distance:100,speed:70,rollSpeed:70,vx:0,events:[event],eventTrack:0});
    const feedback=resolveEvent(run,event,profile,{x:.6,s:-.8});
    assert.equal(feedback.text,'');assert.equal(feedback.effect,COLLISION_EFFECTS[type].effect);
    results.set(type,{run,event,feedback});
  }
  const beast=results.get('beast'),alien=results.get('giant-alien'),cookie=results.get('cookie');
  assert.equal(beast.run.vy,11);assert.ok(beast.run.speed>alien.run.speed+4&&beast.run.curveSpin===0);
  assert.equal(alien.run.curveSpin,28);assert.ok(alien.run.vx>beast.run.vx*2);assert.equal(alien.run.vy,5.5);
  assert.equal(cookie.feedback.kind,'cookie-break');assert.equal(cookie.run.vy,7.5);
  assert.ok(cookie.event.broken&&cookie.event.used&&!cookie.event.body.active);
  assert.equal(cookie.run.events.filter(event=>event.fragment&&event.body?.active).length,4);
  const left=newRun(profile,1,1,0);Object.assign(left,{speed:70,rollSpeed:70,vx:0});
  resolveEvent(left,{id:'left-tentacle',type:'giant-alien',direction:-1},profile,{x:-.6,s:-.8});
  assert.equal(left.curveSpin,-28);assert.ok(left.vx<0);
});

test('cookie fragments carry a finite shared energy budget, strike other props and reward only one break',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0);
  const cookie={id:'biscuit',type:'cookie',at:100,x:0,radius:2.25,height:2.1,direction:1};
  const target={id:'crumb-target',type:'bumper',at:113,x:-1,radius:1,height:1.05};
  Object.assign(run,{s:100,distance:100,speed:70,rollSpeed:70,vx:0,events:[cookie,target],eventTrack:0});
  resolveEvent(run,cookie,profile,{x:.1,s:-.995});
  const crumbs=run.events.filter(event=>event.fragment),budget=2*((cookie.body.vs*WORLD_PER_METER)**2+cookie.body.vx**2);
  const energy=crumbs.reduce((sum,event)=>sum+.5*((event.body.vs*WORLD_PER_METER)**2+event.body.vx**2),0);
  assert.equal(crumbs.length,4);assert.ok(energy<=budget+1e-9,'pieces must share the energy removed from their parent');
  assert.ok(crumbs.every(event=>event.skin==='crumb'&&event.radius===.55&&event.body.depth===2));
  assert.equal(run.bonusGold,18);assert.equal(resolveEvent(run,cookie,profile),null);
  assert.equal(resolveEvent(run,{...cookie,used:false,body:undefined},profile),null,'regenerated parent remains consumed');
  const piece=crumbs[0];run.elapsed=.2;
  resolveEvent(run,piece,profile,{x:1,s:0});assert.equal(run.bonusGold,18);
  assert.equal(run.events.filter(event=>event.fragment).length,4,'a crumb must never split recursively');
  Object.assign(run,{s:80,x:7,speed:10,rollSpeed:10});
  const feedback=[];for(let frame=0;frame<120;frame++)feedback.push(...stepRun(run,profile,1/120));
  assert.ok(feedback.some(event=>event.kind==='chain'&&event.eventId===target.id&&event.sourceId.includes(':crumb:')));
  assert.equal(run.bonusGold,18);assert.ok(run.events.filter(event=>event.body?.active).length<=MAX_PROP_BODIES);
});

test('cookie shattering respects the active body cap when the playfield is already crowded',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0),cookie={id:'crowded-cookie',type:'cookie',at:100,x:0};
  run.events=Array.from({length:MAX_PROP_BODIES},(_,index)=>({id:`crowd-${index}`,type:'bumper',body:{active:true,wheel:run.wheel}}));
  run.events.push(cookie);resolveEvent(run,cookie,profile,{s:-1,x:0});
  assert.equal(run.events.filter(event=>event.body?.active).length,MAX_PROP_BODIES);
  assert.equal(run.events.filter(event=>event.fragment).length,0);assert.equal(run.bonusGold,18);
  assert.ok(cookie.used&&cookie.broken);
});

test('a stopped upgraded ball cannot restart itself on the steepest descent or at the start boundary',()=>{
  const profile=ordinary(5);
  for(const s of [0,1,100,470]){
    const run=newRun(profile,1,1,0);Object.assign(run,{s,distance:s,speed:0,rollSpeed:500,events:[],eventTrack:Math.floor(s/TRACK_LENGTH)});
    steerRun(run,1);stepRun(run,profile,1);
    assert.equal(run.s,s);assert.equal(run.speed,0);assert.equal(run.rollSpeed,0);assert.equal(run.phase,'stopped');
  }
});

test('real forward or backward flight remains live and an external impulse resets the forward stall',()=>{
  const profile=ordinary(0);
  for(const speed of [-30,30]){
    const run=newRun(profile,1,1,0);
    Object.assign(run,{s:100,distance:100,speed,rollSpeed:0,height:2,vy:1,events:[],eventTrack:0});
    stepRun(run,profile,.2);assert.equal(run.phase,'rolling');assert.equal(run.restTime,0);
  }
  const run=newRun(profile,1,1,0);Object.assign(run,{speed:0,rollSpeed:0,restTime:.5,events:[],eventTrack:0});
  resolveEvent(run,{id:'refuel',type:'boost'},profile);
  assert.equal(run.restTime,0);assert.ok(run.rollSpeed>10);assert.equal(run.vy,0);
  stepRun(run,profile,1);assert.equal(run.phase,'rolling');assert.ok(run.s>10);
});

test('each collision object applies a distinct measurable movement effect without floating speech',()=>{
  const profile=ordinary(0),results=new Map();
  assert.ok(Object.isFrozen(COLLISION_EFFECTS));
  for(const type of ['bumper','spring','punch','alien','comet','trap','boost']){
    const run=newRun(profile,1,1,0);Object.assign(run,{speed:70,rollSpeed:70,vx:3,vy:0,curveSpin:2});
    const feedback=resolveEvent(run,{id:type,type,x:0,at:20,direction:1},profile,{x:.6,s:-.8});
    assert.equal(feedback.text,'');assert.equal(feedback.effect,COLLISION_EFFECTS[type].effect);
    assert.equal(feedback.effectDirection,1);assert.ok(Object.isFrozen(COLLISION_EFFECTS[type]));
    results.set(type,run);
  }
  const get=type=>results.get(type);
  assert.ok(get('punch').speed>get('bumper').speed&&get('bumper').speed<70,'a piston adds thrust while a passive bumper only redirects existing motion');
  assert.ok(get('spring').vy>=12&&get('spring').vy>get('punch').vy*2,'spring supplies the high arc');
  assert.ok(get('alien').curveSpin>8&&get('alien').curveSpin>get('comet').curveSpin,'alien supplies continuing lateral curvature');
  assert.ok(get('comet').speed<0&&get('comet').speed<get('bumper').speed,'comet supplies strong reflection');
  assert.ok(Math.abs(get('trap').speed)<70*.25&&Math.abs(get('trap').vx)<Math.abs(get('comet').vx),'friction trap removes forward and lateral energy');
  assert.ok(get('trap').slowTime>1&&get('boost').vy===0&&get('boost').speed>70,'boost stays flat while trap adds friction');
});

test('matched impacts remain visibly different over the following second of actual travel',()=>{
  const profile=ordinary(0),sample=(type,direction=1)=>{
    const run=newRun(profile,1,1,0);
    Object.assign(run,{s:100,distance:100,speed:70,rollSpeed:70,vx:0,vy:0,events:[],eventTrack:0});
    resolveEvent(run,{id:type,type,at:100,x:0,direction},profile,{x:0,s:-1});
    const frames=[];
    for(let frame=0;frame<120;frame++){
      // Observe the struck object's effect in isolation, without later objects or input.
      run.events=[];run.eventTrack=run.track;stepRun(run,profile,1/120);
      if(frame===35||frame===119)frames.push({s:run.s,x:run.x,height:run.height,vx:run.vx,curve:run.curveSpin});
    }
    return frames;
  };
  const bumper=sample('bumper'),spring=sample('spring'),punch=sample('punch'),alien=sample('alien'),comet=sample('comet'),trap=sample('trap');
  assert.ok(spring[0].height>3.3&&spring[1].height>4.5,'spring must produce a high sustained arc');
  assert.ok(punch.every(frame=>frame.height<.2),'piston thrust must stay close to the tread');
  assert.ok(punch[1].s>bumper[1].s+12,'piston must travel visibly farther forward than the elastic bumper');
  assert.ok(comet[0].s<90&&bumper[0].s>115,'a meteor reflects backward while the elastic bumper continues forward');
  assert.ok(trap[1].s<bumper[1].s-15&&Math.abs(trap[1].x)<.1,'brake removes travel instead of throwing the ball');
  assert.ok(alien[1].x>4&&alien[1].x>bumper[1].x+3&&alien[1].curve>4,'gyro continues curving rather than applying a one-frame knock');
  const reversed=sample('alien',-1);
  assert.ok(reversed[1].x< -4);assert.ok(Math.abs(alien[1].x+reversed[1].x)<1e-8,'gyro direction marks must match the physical curvature');
});

test('gyro feedback carries the applied curvature direction even against incoming lateral movement',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0);
  Object.assign(run,{x:-1,vx:3});
  const feedback=resolveEvent(run,{id:'gyro',type:'alien',x:0,at:20},profile,{x:0,s:-1});
  assert.ok(run.vx>0&&run.curveSpin<0,'the ball can initially drift against the new curvature');
  assert.equal(feedback.effectDirection,-1,'direction must describe the applied effect rather than the previous drift');
});

test('launched props carry passive momentum without repeating their intrinsic powered effect',()=>{
  const profile=ordinary(0);
  for(const type of ['bumper','spring','punch','alien','trap']){
    const run=newRun(profile,1,1,0),event={id:type,type,direction:1};
    resolveEvent(run,event,profile,{x:.6,s:-.8});
    run.elapsed=event.cooldown+.01;Object.assign(run,{speed:70,rollSpeed:70,vx:0,vy:0,curveSpin:0,slowTime:0});
    Object.assign(event.body,{vs:0,vx:0,vy:0});
    const feedback=resolveEvent(run,event,profile,{x:.6,s:-.8});
    assert.equal(feedback.powered,false);assert.ok(run.rollSpeed<70);
    assert.equal(run.curveSpin,0);assert.equal(run.slowTime,0);assert.ok(run.vy<=3);
  }
});

test('only incoming forward prop momentum can refill a depleted forward budget',()=>{
  const profile=ordinary(0);
  const collide=(vs,vx,normal)=>{
    const run=newRun(profile,1,1,0);Object.assign(run,{speed:0,rollSpeed:0,vx:0,vy:0,restTime:.5});
    const event={id:'moving',type:'punch',direction:1,body:{active:true,vs,vx,vy:0}};
    resolveEvent(run,event,profile,normal);return {run,event};
  };
  const lateral=collide(0,20,{x:1,s:0});
  assert.equal(lateral.run.rollSpeed,0);assert.equal(lateral.run.speed,0);
  assert.ok(Math.abs(lateral.event.body.vx)<20,'the carrier must lose energy after transfer');
  const backward=collide(-60,0,{x:0,s:-1});assert.equal(backward.run.rollSpeed,0);
  const forward=collide(60,0,{x:0,s:1});
  assert.ok(forward.run.rollSpeed>20&&forward.run.speed>0);assert.equal(forward.run.restTime,0);
  assert.ok(forward.event.body.vs<60,'forward momentum must be consumed rather than recycled');
});

test('the physical track is wider than twice the old cylinder and the ball freely crosses its former rails',()=>{
  assert.equal(TRACK_WIDTH,20);assert.ok(SIDE_LIMIT>8.8);
  const profile=ordinary(0),run=newRun(profile,1,1,0);run.events=[];run.eventTrack=0;
  steerRun(run,1);
  for(let i=0;i<100;i++){run.events=[];run.eventTrack=run.track;stepRun(run,profile,1/120);}
  assert.ok(run.x>1);
  for(let i=0;i<100;i++){run.events=[];run.eventTrack=run.track;stepRun(run,profile,1/120);}
  assert.ok(run.x>3.05&&run.x<SIDE_LIMIT);
});
test('side rails reflect lateral velocity and create an airborne cushion bounce', () => {
  const profile = ordinary(0), run = newRun(profile, 1, 1, 0);
  run.x = SIDE_LIMIT - .01;run.vx = 8;run.events = [];
  const feedback = stepRun(run, profile, .05);
  assert.ok(run.x <= SIDE_LIMIT);assert.ok(run.vx < 0);assert.ok(run.vy > 0 || run.height > 0);
  assert.ok(feedback.some(event => event.type === 'rail'));
});
test('a physical prop reflects the ball backwards and sideways and sends it into the air', () => {
  const profile = ordinary(0), run = newRun(profile, 1, 1, 0);
  const before = run.speed;
  const event = { id: 'impact', type: 'comet', x: 0, at: 20, direction: 1 };
  const feedback = resolveEvent(run, event, profile, { x: .6, s: -.8 });
  assert.ok(run.speed < 0 && run.speed < before);assert.ok(run.vx > 0);assert.ok(run.vy > 0);
  assert.equal(feedback.eventId, 'impact');assert.equal(feedback.kind, 'danger');
  assert.equal(run.collisions, 1);assert.equal(event.used, false);
  assert.equal(event.body.active,true);assert.ok(Math.abs(event.body.vs)>0&&Math.abs(event.body.vx)>0);
  stepRun(run, profile, .1);assert.ok(run.height > 0);
});
test('springs launch a real arc and floor contact bounces without restoring lost speed', () => {
  const profile = ordinary(0), run = newRun(profile, 1, 1, 0);
  run.events = [];
  resolveEvent(run, { id: 'spring', type: 'spring', direction: 1 }, profile, { x: 0, s: -1 });
  let landed = false;
  for (let frame = 0; frame < 240; frame++) {
    if (stepRun(run, profile, 1 / 120).some(event => event.type === 'landing')) landed = true;
  }
  assert.ok(run.maxHeight > 4.5);assert.ok(landed);assert.ok(run.speed > 0);
});
test('a slow rendering frame cannot tunnel through pickups or a collider', () => {
  const profile = ordinary(0), run = newRun(profile, 1, 1, 0);
  run.events = [
    { id: 'coin', type: 'coins', at: 10, x: 0, radius: .6, height: 1.05 },
    { id: 'rock', type: 'comet', at: 24, x: 0, radius: 1, height: 1.05, direction: 1 },
  ];
  const feedback = stepRun(run, profile, 1);
  assert.ok(feedback.some(event => event.type === 'coins'));
  assert.ok(feedback.some(event => event.type === 'comet'));
  assert.equal(run.bonusGold, 12);assert.ok(run.maxHeight > 0);
  assert.equal(profile.gold, 0);
  assert.equal(run.earned, Math.floor(run.distance / DISTANCE_PER_GOLD) + 12);
});
test('fixed-step physics agrees at 60fps, 10fps and one frame per second', () => {
  const profile = ordinary(1), runs = [newRun(profile, .83, 78), newRun(profile, .83, 78), newRun(profile, .83, 78)];
  for (let frame = 0; frame < 600; frame++) stepRun(runs[0], profile, 1 / 60);
  for (let frame = 0; frame < 100; frame++) stepRun(runs[1], profile, .1);
  for (let frame = 0; frame < 10; frame++) stepRun(runs[2], profile, 1);
  for (const run of runs.slice(1)) {
    for (const key of ['distance','s','speed','x','vx','height','vy','rollSpeed','elapsed'])
      assert.ok(Math.abs(run[key] - runs[0][key]) < 1e-7, `${key} changed with render rate`);
    assert.equal(run.earned, runs[0].earned);
  }
});
test('backward motion cannot erase distance rewards and colliders do not pay twice', () => {
  const profile = ordinary(0), run = newRun(profile, 1, 5);
  run.s = run.distance = 100;run.speed = -60;run.height = 2;run.vy = 0;run.events = [];
  stepRun(run, profile, .1);assert.ok(run.s < 100);assert.equal(run.distance, 100);
  const coin = { id: 'coin', type: 'coins' };
  assert.ok(resolveEvent(run, coin, profile));assert.equal(resolveEvent(run, coin, profile), null);
  assert.equal(run.bonusGold, 12);
});

test('collected rewards remain consumed after their static-track cache is evicted and regenerated',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0);
  const coin=run.events.find(event=>event.type==='coins'),id=coin.id;
  resolveEvent(run,coin,profile);assert.equal(run.bonusGold,12);
  run.s=run.distance=TRACK_LENGTH*4+10;run.height=5;
  stepRun(run,profile,1/120);assert.equal(run.events.some(event=>event.id===id),false);
  run.s=0;run.speed=0;run.rollSpeed=0;run.height=0;
  stepRun(run,profile,1/120);
  const regenerated=run.events.find(event=>event.id===id);
  assert.ok(regenerated&&regenerated.used);assert.equal(resolveEvent(run,regenerated,profile),null);
  assert.equal(run.bonusGold,12);assert.ok(run.consumed.has(id));
});
test('flying bumpers have a ball-contact cooldown and a finite collision count', () => {
  const profile = ordinary(0), run = newRun(profile, 1, 5, 0);
  const bumper = { id: 'bounce', type: 'bumper', direction: 1 };
  resolveEvent(run, bumper, profile);
  assert.equal(bumper.hits, 1);assert.equal(bumper.used, false);
  assert.ok(bumper.cooldown > run.elapsed);
  assert.equal(resolveEvent(run, bumper, profile), null);
  run.elapsed = bumper.cooldown + .01;
  resolveEvent(run, bumper, profile);
  assert.equal(bumper.hits, 2);assert.equal(bumper.used, false);
  run.elapsed=bumper.cooldown+.01;resolveEvent(run,bumper,profile);
  assert.equal(bumper.hits,3);assert.equal(bumper.body.active,true);
  assert.equal(resolveEvent(run, bumper, profile), null);
});

test('a ball launches a real four-body domino chain with shared physical poses',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0);
  const props=[20,28,36,44].map((at,index)=>({id:`domino:${index}`,type:'bumper',x:0,at,radius:1.05,height:1.05,direction:1}));
  run.events=props;run.eventTrack=0;const feedback=[];
  for(let frame=0;frame<180;frame++)feedback.push(...stepRun(run,profile,1/120));
  const chains=feedback.filter(event=>event.kind==='chain');
  assert.ok(chains.some(event=>event.sourceId==='domino:0'&&event.eventId==='domino:1'&&event.chainDepth===2));
  assert.ok(chains.some(event=>event.sourceId==='domino:1'&&event.eventId==='domino:2'&&event.chainDepth===3));
  assert.ok(chains.some(event=>event.sourceId==='domino:2'&&event.eventId==='domino:3'&&event.chainDepth===4));
  assert.ok(run.chainHits>=3&&run.maxChain>=4);
  for(const prop of props){
    assert.equal(prop.body.active,true);assert.notEqual(prop.body.s,prop.at);
    const pose=eventPose(prop,run.elapsed);
    for(const key of ['s','x','height','rx','ry','rz'])assert.equal(pose[key],prop.body[key]);
    assert.equal(eventX(prop,run.elapsed),prop.body.x);
  }
  assert.equal(run.bonusGold,0,'prop impacts must not manufacture pickup earnings');
});

test('a moving obstacle can return and physically hit the ball',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0);
  Object.assign(run,{s:50,distance:50,speed:0,rollSpeed:0,vx:0,x:0});
  const prop={id:'return',type:'comet',at:60,x:0,radius:1,height:1.05,direction:1,
    body:{active:true,wheel:0,s:60,x:0,height:0,vs:-80,vx:0,vy:0,rx:0,ry:0,rz:0,wx:1,wy:1,wz:1,life:4,depth:1,chainId:1,contacts:{},impacts:0}};
  run.events=[prop];run.eventTrack=0;
  const feedback=stepRun(run,profile,.2);
  assert.ok(feedback.some(event=>event.eventId==='return'));
  assert.ok(run.speed<0&&run.height>0,'the returning body must cause real backward and upward motion');
});

test('dynamic bodies have finite lifetimes, pair cooldowns and bounded active work',()=>{
  const profile=ordinary(2),run=newRun(profile,1,1,0),feedback=[];
  let first;
  for(let frame=0;frame<1200&&run.phase==='rolling';frame++){
    feedback.push(...stepRun(run,profile,1/120));
    const active=run.events.filter(event=>event.body?.active);
    assert.ok(active.length<=MAX_PROP_BODIES);assert.ok(run.maxChain<=MAX_CHAIN_DEPTH);
    first ||= active[0];
  }
  assert.ok(first);assert.equal(first.body.active,false);assert.equal(first.used,true);
  const times=new Map();
  for(const event of feedback.filter(event=>event.kind==='chain')){
    const key=[event.sourceId,event.eventId].sort().join('|');
    times.set(key,(times.get(key)||0)+1);
  }
  assert.ok(Math.max(...times.values())<15,'contact pairs must not fire every physics substep');
});

test('active flying props survive static-track cache changes and old-wheel bodies stop on warp',()=>{
  const profile=ordinary(0),run=newRun(profile,1,1,0);
  const prop=run.events[0];resolveEvent(run,prop,profile,{x:.1,s:-.99});
  prop.body.s=1100;run.s=run.distance=1090;
  stepRun(run,profile,1/120);
  assert.ok(run.events.includes(prop),'a physical prop must remain until its lifetime ends');
  resolveEvent(run,{id:'warp',type:'ufo'},profile);
  assert.equal(prop.body.active,false);assert.equal(prop.used,true);
});
test('holes and UFOs alone move to another physical wheel and preserve finite dynamics', () => {
  const profile = ordinary(0);
  for (const type of ['hole','ufo']) {
    const run = newRun(profile, .2, 5);run.s = run.distance = 88;
    const result = resolveEvent(run, { type }, profile);
    assert.equal(result.kind, 'warp');assert.equal(run.track, 1);assert.equal(run.wheel, 1);
    assert.ok(run.s >= TRACK_LENGTH && run.distance >= TRACK_LENGTH);
    assert.ok(run.height > 0 && Number.isFinite(run.speed));
  }
  for (const type of ['coins','boost','trap','comet','alien','bumper','spring','punch']) {
    const run = newRun(profile, 1, 5);resolveEvent(run, { type }, profile);
    assert.equal(run.wheel, 0);
  }
});
test('an ordinary full lap stays in the same wheel', () => {
  const profile = ordinary(0), run = newRun(profile, 1, 5, 0);
  run.s = run.distance = TRACK_LENGTH - 1;run.events = [];
  stepRun(run, profile, .1);
  assert.equal(run.track, 1);assert.equal(run.wheel, 0);
});
test('better suits preserve rolling momentum and heavier balls resist a prop impact', () => {
  const basic = ordinary(0), suit = ordinary(0), ball = ordinary(1);suit.upgrades.pilot = 5;
  const runs = [basic,suit,ball].map(p => newRun(p, 1, 77, 0));
  for (const run of runs) run.speed = run.rollSpeed = 100;
  for (let index = 0; index < runs.length; index++)
    resolveEvent(runs[index], { type: 'comet', direction: 1 }, [basic,suit,ball][index], { x: .6, s: -.8 });
  assert.ok(runs[1].rollSpeed > runs[0].rollSpeed);
  assert.ok(runs[2].speed > runs[0].speed);
});

test('higher upgraded balls retain a material speed advantage after dense repeated thrusts',()=>{
  const speeds=[];
  for(const level of [2,3]){
    const profile=ordinary(level),run=newRun(profile,1,1,0);
    for(let index=0;index<40;index++){
      Object.assign(run,{s:100,track:0,eventTrack:0,events:[]});
      resolveEvent(run,{id:`thrust-${index}`,type:'boost',at:100,x:0},profile);
      stepRun(run,profile,.05);
    }
    speeds.push(run.speed);
  }
  assert.ok(speeds[1]>speeds[0]*1.3,'a dense boost field must not flatten different ball upgrades to the same forward speed');
});
test('a free shot follows rolling friction and the actual course elevation within integration tolerance', () => {
  for (const level of [0,1]) {
    const profile = ordinary(level), run = newRun(profile, 1, 1, 0);
    run.nextGuardianLap=1000000; // This fixture measures only empty-course gravity and friction.
    while (run.phase === 'rolling') {
      run.events = [];run.eventTrack = run.track;stepRun(run, profile, 1 / 60);
    }
    const stats=ballStats(level),work=stats.drag*run.distance+14*(courseSample(run.distance,run.seed).height-courseSample(0,run.seed).height)/WORLD_PER_METER;
    assert.ok(Math.abs(work/(stats.launchSpeed**2/2)-1)<.005,'friction and signed elevation work must account for travel');
  }
});
test('100 paired seeds show a clear first upgrade and every later level increases the median', async t => {
  const medians = [], distances = [], calibration=[];
  const workers=new Set(),results=Array.from({length:6},()=>[]);
  const jobs=Array.from({length:6},(_,level)=>Array.from({length:4},(_,part)=>({level,seedStart:part*25+1,seedCount:25}))).flat();let nextJob=0;
  t.after(async()=>{await Promise.all([...workers].map(worker=>worker.terminate()));});
  const measure=job=>new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./balance-worker.mjs',import.meta.url),{workerData:job});workers.add(worker);let result;
    worker.on('message',message=>{
      if(message.type==='progress')console.log(`growth calibration: level ${message.level}, seeds ${message.seedStart}-${message.seed} complete, ${message.seconds}s`);
      else if(message.type==='result')result=message;
    });
    worker.once('error',reject);
    worker.once('exit',code=>{workers.delete(worker);if(code===0&&result)resolve(result);else reject(new Error(`level ${job.level}, seed ${job.seedStart}: calibration worker exited ${code} without results`));});
  });
  const consume=async()=>{while(nextJob<jobs.length){const job=jobs[nextJob++];results[job.level].push(await measure(job));}};
  await Promise.all(Array.from({length:Math.max(1,Math.min(6,availableParallelism()-2))},consume));
  for (let level=0;level<=5;level++) {
    const chunks=results[level].sort((a,b)=>a.seedStart-b.seedStart),values=chunks.flatMap(result=>result.values);
    const median=items=>[...items].sort((a,b)=>a-b)[49],times=chunks.flatMap(result=>result.times),chains=chunks.flatMap(result=>result.chains),depths=chunks.flatMap(result=>result.depths);
    assert.equal(values.length,100);assert.deepEqual(chunks.map(result=>result.seedStart),[1,26,51,76]);
    const row={level,distance:Math.round(median(values)),seconds:Number(median(times).toFixed(1)),chains:median(chains),depth:median(depths),
      timeCaps:chunks.reduce((total,result)=>total+result.capped,0),chainsPresent:chains.filter(value=>value>0).length};
    distances.push(values);
    medians.push([...values].sort((a,b) => a-b)[49]);
    calibration.push(row);
  }
  const paired = distances[0].map((value,index) => distances[1][index] / value).sort((a,b) => a-b);
  t.diagnostic(JSON.stringify({calibration,firstUpgrade:{p10:paired[9],median:paired[49],p90:paired[89],farther:paired.filter(value=>value>1).length,over145:paired.filter(value=>value>=1.45).length}}));
  for(let level=1;level<=5;level++)assert.ok(medians[level]>medians[level-1]*1.25,`upgrade ${level} lacks a material median gain`);
  assert.ok(paired[49] >= 1.8);
  assert.ok(paired.filter(ratio => ratio > 1).length >= 95);
  assert.ok(paired.filter(ratio => ratio >= 1.45).length >= 75);
});
test('an unsteered first shot produces autonomous rebounds, airborne motion and active chains', () => {
  const { run, types } = finish(ordinary(0), 2);
  assert.ok(run.collisions >= 5);assert.ok(run.maxHeight > .1);
  assert.ok(types.has('rail') && types.has('bumper') && types.has('landing'));
  assert.ok(run.chainHits>0&&run.maxChain>=2);
});
test('one paid continuation preserves exact physical position, score and remaining time', () => {
  const profile = ordinary(0);profile.gold = 12;
  const run = newRun(profile, 1, 3);
  Object.assign(run, { phase: 'stopped', s: 321.12345, distance: 500, x: .4567, height: 1.7, elapsed: 21, earned: 40 });
  const before = { s: run.s, distance: run.distance, x: run.x, height: run.height, elapsed: run.elapsed };
  assert.equal(canContinue(profile, run), true);assert.equal(continueRun(profile, run), true);
  assert.equal(profile.gold, 12);assert.equal(run.phase, 'rolling');assert.equal(run.continued, true);
  for (const key of Object.keys(before)) assert.equal(run[key], before[key]);
  run.phase = 'stopped';profile.gold = 9999;
  assert.equal(canContinue(profile, run), false);assert.equal(continueRun(profile, run), false);
  assert.equal(profile.gold, 9999);
});
test('an unaffordable continuation leaves all balances unchanged', () => {
  const profile = ordinary(0), run = newRun(profile, 0, 5);
  run.phase = 'stopped';run.earned = 39;
  assert.equal(continueRun(profile, run), false);assert.equal(profile.gold, 0);
  assert.equal(run.banked, 0);assert.equal(run.continued, false);
});
test('collection and final settlement remain idempotent across a continuation', () => {
  const profile = ordinary(0);profile.name = '별골퍼';
  const run = newRun(profile, 1, 5);
  assert.equal(settleRun(profile, run), false);run.phase = 'stopped';run.earned = 80;
  assert.equal(collectRunGold(profile, run), 80);assert.equal(collectRunGold(profile, run), 0);
  assert.equal(continueRun(profile, run), true);
  Object.assign(run, { phase: 'stopped', distance: 802, elapsed: 10, earned: 110 });
  assert.equal(settleRun(profile, run), true);assert.equal(profile.gold, 70);
  assert.equal(profile.rankings.length, 1);assert.equal(profile.rankings[0].distance, 802);
  assert.equal(settleRun(profile, run), false);assert.equal(collectRunGold(profile, run), 0);
});
test('rankings retain only personal bests and the top ten names', () => {
  const rows = Array.from({ length: 15 }, (_, index) => ({ name: `골퍼${index}`, distance: index * 100 }));
  rows.push({ name: '골퍼14', distance: 100 }, { name: 'GOLFER', distance: 999 }, { name: 'golfer', distance: 1 });
  const profile = sanitizeProfile({ rankings: rows });
  assert.equal(profile.rankings.length, 10);assert.equal(profile.rankings[0].distance, 1400);
  assert.equal(profile.rankings.filter(row => row.name.toLowerCase() === 'golfer').length, 1);
  assert.equal(profile.rankings.find(row => row.name.toLowerCase() === 'golfer').distance, 999);
});
test('invalid times and steering values cannot create motion or rewards', () => {
  const profile = ordinary(0), run = newRun(profile, NaN, 1);
  for (const dt of [0,-1,NaN,Infinity]) assert.deepEqual(stepRun(run, profile, dt), []);
  assert.equal(steerRun(run, NaN), false);assert.equal(run.s, 0);assert.equal(run.earned, 0);
  stepRun(run, profile, 60);assert.ok(Number.isFinite(run.s) && Number.isFinite(run.speed));
});
test('the first completed training awards one bonus and funds the first ball upgrade', () => {
  const profile = newProfile(), { run } = finish(profile, 12, 0);
  assert.equal(run.tutorial, true);assert.equal(canContinue(profile, run), false);
  assert.equal(settleRun(profile, run), true);assert.ok(run.trainingBonus >= 80);
  assert.ok(profile.gold >= upgradeCost(profile, 'ball'));assert.equal(profile.tutorialComplete, true);
  const gold = profile.gold;assert.equal(settleRun(profile, run), false);assert.equal(profile.gold, gold);
  assert.equal(newRun(profile, 0, 12).tutorial, false);
});
test('abandoning a moving tutorial grants only earned gold without completing training', () => {
  for (const elapsed of [.02,2]) {
    const profile = newProfile(), run = newRun(profile, 0, 12);
    stepRun(run, profile, elapsed);assert.equal(run.phase, 'rolling');
    const earned = run.earned;run.phase = 'stopped';
    assert.equal(settleRun(profile, run), true);assert.equal(profile.tutorialComplete, false);
    assert.equal(run.trainingBonus, 0);assert.equal(profile.gold, earned);
  }
});
test('cancelling before launch gives no record or training reward', () => {
  const profile = newProfile(), run = newRun(profile, 1, 12);run.phase = 'stopped';
  assert.equal(settleRun(profile, run), true);assert.equal(profile.tutorialComplete, false);
  assert.equal(profile.gold, 0);assert.deepEqual(profile.rankings, []);assert.equal(run.trainingBonus, 0);
});
test('training and normal shots enforce foreground time caps even with endless energy', () => {
  for (const completed of [false,true]) for (const dt of [1/60,.1,1]) {
    const profile = ordinary(0);profile.tutorialComplete = completed;
    const run = newRun(profile, 1, 21), limit = completed ? RUN_DURATION : TUTORIAL_DURATION;
    let calls = 0;
    while (run.phase === 'rolling' && calls++ < limit / dt + 3) {
      run.s=100;run.events=[];run.eventTrack=0;
      run.speed = run.rollSpeed = 185;stepRun(run, profile, dt);
    }
    assert.equal(run.phase, 'stopped');assert.equal(run.elapsed, limit);
    assert.equal(run.stopReason, 'time');assert.equal(canContinue(profile, run), false);
  }
});
