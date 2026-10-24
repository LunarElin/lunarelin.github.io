import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACK_LENGTH, TRACK_WIDTH, DISTANCE_PER_GOLD, SIDE_LIMIT, WORLD_PER_METER, MAX_PROP_BODIES, MAX_CHAIN_DEPTH,
  UPGRADE_DEFS, TUTORIAL_DURATION, RUN_DURATION,
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
test('seeded tracks scatter continuous moving colliders with no lane field', () => {
  assert.deepEqual(generateTrack(3, 42), generateTrack(3, 42));
  assert.notDeepEqual(generateTrack(3, 42), generateTrack(3, 43));
  let warps = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const events = generateTrack(3, seed);
    assert.equal(events.length, 22);
    assert.equal(new Set(events.map(event => event.id)).size, events.length);
    assert.ok(events.some(event => !Number.isInteger(event.x)));
    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      assert.equal(Object.hasOwn(event, 'lane'), false);
      assert.ok(Math.abs(event.x) <= 7.7 && event.radius > 0);
      assert.ok(event.at > 3 * TRACK_LENGTH && event.at < 4 * TRACK_LENGTH);
      if (index) assert.ok(event.at > events[index - 1].at);
    }
    assert.ok(['bumper','spring','punch','alien','comet','trap','coins','boost'].every(type => events.some(e => e.type === type)));
    assert.ok(events.filter((event,index)=>index&&event.at-events[index-1].at<10).length>=10,'nearby props must support physical chains');
    if (events.some(e => ['hole','ufo'].includes(e.type))) warps++;
  }
  assert.ok(warps > 0 && warps < 80);
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
test('springs launch a real arc and floor contact bounces, then restores rolling momentum', () => {
  const profile = ordinary(0), run = newRun(profile, 1, 1, 0);
  run.events = [];
  resolveEvent(run, { id: 'spring', type: 'spring', direction: 1 }, profile, { x: .8, s: -.6 });
  let landed = false;
  for (let frame = 0; frame < 240; frame++) {
    if (stepRun(run, profile, 1 / 120).some(event => event.type === 'landing')) landed = true;
  }
  assert.ok(run.maxHeight > 2.5);assert.ok(landed);assert.ok(run.speed > 0);
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
test('a free shot agrees with the unobstructed reference within integration tolerance', () => {
  for (const level of [0,1]) {
    const profile = ordinary(level), run = newRun(profile, 1, 1, 0);
    while (run.phase === 'rolling') {
      run.events = [];run.eventTrack = run.track;stepRun(run, profile, 1 / 60);
    }
    assert.ok(Math.abs(run.distance / ballStats(level).range - 1) < .025);
  }
});
test('100 paired seeds show a clear first upgrade and every later level increases the median', () => {
  const medians = [], distances = [];
  for (let level = 0; level <= 5; level++) {
    const profile = ordinary(level), values = [];
    for (let seed = 1; seed <= 100; seed++) {
      const { run } = finish(profile, seed);
      values.push(run.distance);assert.ok(run.elapsed <= RUN_DURATION);
    }
    distances.push(values);
    medians.push([...values].sort((a,b) => a-b)[49]);
    if (level) assert.ok(medians[level] > medians[level-1] * 1.25, `upgrade ${level} lacks a material median gain`);
  }
  const paired = distances[0].map((value,index) => distances[1][index] / value).sort((a,b) => a-b);
  assert.ok(paired[49] >= 1.8);
  assert.ok(paired.filter(ratio => ratio > 1).length >= 95);
  assert.ok(paired.filter(ratio => ratio >= 1.45).length >= 75);
});
test('an unsteered first shot produces autonomous ricochets and comic collision situations', () => {
  const { run, types } = finish(ordinary(0), 0xffffffff);
  assert.ok(run.collisions >= 5);assert.ok(run.maxHeight > 1);
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
      run.speed = run.rollSpeed = 185;stepRun(run, profile, dt);
    }
    assert.equal(run.phase, 'stopped');assert.equal(run.elapsed, limit);
    assert.equal(run.stopReason, 'time');assert.equal(canContinue(profile, run), false);
  }
});
