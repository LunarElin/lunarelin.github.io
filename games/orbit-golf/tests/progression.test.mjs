import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_TRAITS, CHALLENGE_DURATION, CHALLENGE_REWARD, WORLD_PER_METER,
  newProfile, sanitizeProfile, availableTraits, selectBallTrait, ballStats,
  buyUpgrade, newRun, placeRun, stepRun, steerRun, resolveEvent,
  collectRunGold, canContinue, continueRun, settleRun,
} from '../rules.mjs';

const upgraded = () => ({...newProfile(),name:'시험',tutorialComplete:true,upgrades:{ball:5,pilot:0},challengeWins:['domino','cookie','bowling']});
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-8,`${message}: ${a} / ${b}`);
function successFixture(profile,id='domino') {
  const run=newRun(profile,1,42,12,{challenge:id});
  run.challenge.success=true;run.challenge.completed=true;run.challenge.completedAt=.5;
  run.challenge.hitTargetIds=[...run.challenge.targetIds];run.elapsed=1.6;
  run.phase='stopped';run.stopReason='challenge-success';return run;
}

test('v1 saves preserve earned equipment, money and rankings while new progression defaults safely',()=>{
  const raw={version:1,name:'기존',gold:1234,upgrades:{ball:4,pilot:3},rankings:[{name:'기존',distance:900,date:'2026-10-29'}],tutorialComplete:true};
  const profile=sanitizeProfile(raw);
  assert.equal(profile.gold,1234);assert.deepEqual(profile.upgrades,raw.upgrades);
  assert.equal(profile.rankings[0].distance,900);assert.equal(profile.tutorialComplete,true);
  assert.deepEqual(profile.challengeWins,[]);assert.equal(profile.ballTrait,'standard');
});

test('save sanitation accepts only known unique wins and rejects unknown or locked traits',()=>{
  for(const invalid of ['__proto__','toString','unknown',null,3]){
    const profile=sanitizeProfile({...upgraded(),ballTrait:invalid,challengeWins:['domino','domino','cookie','unknown',null,3]});
    assert.deepEqual(profile.challengeWins,['domino','cookie']);assert.equal(profile.ballTrait,'standard');
  }
  assert.equal(sanitizeProfile({...upgraded(),ballTrait:'heavy',challengeWins:[]}).ballTrait,'standard');
  assert.equal(sanitizeProfile({...upgraded(),ballTrait:'heavy'}).ballTrait,'heavy');
  assert.equal(sanitizeProfile({...upgraded(),ballTrait:'heavy',upgrades:{ball:4,pilot:0}}).ballTrait,'standard');
});

test('an early medal is retained and unlocks its trait after the fifth ball upgrade',()=>{
  const profile={...newProfile(),gold:1000,upgrades:{ball:4,pilot:0},challengeWins:['bowling']};
  assert.deepEqual(availableTraits(profile),['standard']);assert.equal(selectBallTrait(profile,'heavy'),false);
  assert.equal(buyUpgrade(profile,'ball'),true);assert.deepEqual(availableTraits(profile),['standard','heavy']);
  const gold=profile.gold;assert.equal(selectBallTrait(profile,'heavy'),true);assert.equal(profile.gold,gold);
  assert.equal(selectBallTrait(profile,'elastic'),false);assert.equal(profile.ballTrait,'heavy');
  assert.equal(selectBallTrait(profile,'standard'),true);assert.equal(profile.gold,gold);
});

test('the original standard launch and drag coefficients are unchanged at every level',()=>{
  for(let level=0;level<=5;level++){
    const expected=76*1.32**level*(level===3?1.08:1),stats=ballStats(level);
    close(stats.launchSpeed,expected,'launch');close(stats.drag,1.8*.72**level,'rolling resistance');
    close(stats.airDrag,.018*.72**level,'air resistance');close(stats.range,expected**2/(2*stats.drag),'flat range');
    assert.equal(stats.trait,'standard');
  }
  const profile=upgraded();selectBallTrait(profile,'elastic');
  assert.ok(ballStats(profile).launchSpeed<ballStats(5).launchSpeed);
  assert.equal(ballStats(5).trait,'standard');
});

test('trait selection snapshots each shot and does not change a ball already in flight',()=>{
  const profile=upgraded();selectBallTrait(profile,'elastic');const run=newRun(profile,1,42,0);
  assert.equal(run.trait,'elastic');const initial=run.speed;placeRun(run,{s:0,height:20});selectBallTrait(profile,'heavy');
  run.events=[];run.eventTrack=0;stepRun(run,profile,1/120);
  assert.equal(run.trait,'elastic');assert.ok(run.speed<initial);assert.ok(run.speed>ballStats(profile).launchSpeed);
});

test('heavy balls push through a passive heavy object while elastic balls rebound more without adding energy',()=>{
  const values={};
  for(const id of Object.keys(BALL_TRAITS)){
    const profile=upgraded();selectBallTrait(profile,id);const run=newRun(profile,1,1,0);
    run.speed=80;run.vx=0;placeRun(run,{s:0});
    const event={id:`comet:${id}`,type:'comet',at:20,x:0,radius:1.05,height:1.05};
    const mass=70*BALL_TRAITS[id].mass,before=.5*mass*((80*WORLD_PER_METER)**2+run.worldVy**2);
    run.events=[event];resolveEvent(run,event,profile,{s:-1,x:0,y:0});
    const after=.5*mass*((run.speed*WORLD_PER_METER)**2+run.vx**2+run.worldVy**2)
      +.5*12*((event.body.vs*WORLD_PER_METER)**2+event.body.vx**2+event.body.worldVy**2);
    assert.ok(after<=before+1e-6,id);values[id]=run.speed;
  }
  assert.ok(values.heavy>values.standard);assert.ok(values.elastic<values.standard);
});

test('elastic side-wall reactions are measurably larger than standard reactions',()=>{
  const reaction={};
  for(const id of ['standard','elastic']){
    const profile=upgraded();selectBallTrait(profile,id);const run=newRun(profile,1,1,0);
    run.events=[];run.eventTrack=0;run.speed=50;run.vx=8;placeRun(run,{s:5,x:8.84});
    stepRun(run,profile,.025);reaction[id]=Math.abs(run.vx);
  }
  assert.ok(reaction.elastic>reaction.standard*1.2);
});

test('the spin trait changes continuous steering while keeping the horizontal energy budget finite',()=>{
  const values={};
  for(const id of ['standard','spin']){
    const profile=upgraded();selectBallTrait(profile,id);const run=newRun(profile,1,1,0);
    run.events=[];run.eventTrack=0;run.speed=80;run.vx=0;placeRun(run,{s:0,height:20});
    steerRun(run,1);stepRun(run,profile,.2);values[id]=run.vx;
    assert.ok((run.speed*WORLD_PER_METER)**2+run.vx**2<=(80*WORLD_PER_METER)**2+1e-8);
  }
  assert.ok(values.spin>values.standard*1.6);
});

test('all traits still exhaust when forward momentum is gone despite held spin',()=>{
  for(const id of Object.keys(BALL_TRAITS)){
    const profile=upgraded();selectBallTrait(profile,id);const run=newRun(profile,1,1,0);
    run.events=[];run.eventTrack=0;run.speed=0;run.vx=18;placeRun(run,{s:0,height:8});
    for(let tick=0;tick<600&&run.phase==='rolling';tick++){steerRun(run,1);stepRun(run,profile,1/120);}
    assert.equal(run.phase,'stopped',id);assert.equal(run.speed,0);assert.equal(run.vx,0);assert.equal(run.distance,0);
  }
});

test('challenge precision equipment is equal across upgrade levels and keeps authored objects on section changes',()=>{
  const profiles=[newProfile(),upgraded()];const runs=profiles.map(profile=>newRun(profile,1,42,0,{challenge:'domino'}));
  for(const run of runs){assert.equal(run.speed,84);assert.equal(run.durationLimit,CHALLENGE_DURATION);assert.equal(run.tutorial,false);}
  const ids=runs[0].events.map(event=>event.id);runs[0].speed=50;placeRun(runs[0],{s:370});stepRun(runs[0],profiles[0],1/120);
  assert.deepEqual(runs[0].events.map(event=>event.id),ids);assert.ok(!runs[0].events.some(event=>event.type==='guardian'));
  const normal=newRun(profiles[0],1,42,0,{challenge:'unknown'});assert.equal(normal.challenge,undefined);assert.equal(normal.tutorial,true);
});

test('failed and abandoned challenges pay nothing, cannot continue and do not consume training or distance records',()=>{
  for(const abandoned of [false,true]){
    const profile={...newProfile(),gold:100};const run=newRun(profile,1,42,0,{challenge:'domino'});
    if(!abandoned)while(run.phase==='rolling')stepRun(run,profile,.2);else run.phase='stopped';
    assert.equal(run.challenge.success,false);assert.equal(collectRunGold(profile,run),0);
    assert.equal(canContinue(profile,run),false);assert.equal(continueRun(profile,run),false);assert.equal(settleRun(profile,run),true);
    assert.equal(profile.gold,100);assert.deepEqual(profile.challengeWins,[]);assert.deepEqual(profile.rankings,[]);assert.equal(profile.tutorialComplete,false);
    assert.deepEqual(run.challengeAward,{firstWin:false,gold:0,unlocked:[]});
  }
});

test('first challenge victories pay once and preserve normal rankings while repeat victories pay zero',()=>{
  const profile={...newProfile(),gold:10,rankings:[{name:'기존',distance:900,track:3,date:'2026-10-29'}]};
  const first=successFixture(profile);assert.equal(settleRun(profile,first),true);
  assert.equal(profile.gold,10+CHALLENGE_REWARD);assert.deepEqual(profile.challengeWins,['domino']);assert.equal(profile.tutorialComplete,false);
  assert.equal(profile.rankings[0].distance,900);assert.equal(first.earned,CHALLENGE_REWARD);
  assert.deepEqual(first.challengeAward,{firstWin:true,gold:CHALLENGE_REWARD,unlocked:[]});
  assert.equal(settleRun(profile,first),false);assert.equal(collectRunGold(profile,first),0);
  const repeat=successFixture(profile);settleRun(profile,repeat);assert.equal(profile.gold,70);assert.equal(repeat.earned,0);
  assert.deepEqual(repeat.challengeAward,{firstWin:false,gold:0,unlocked:[]});
});

test('winning a challenge at max ball level reports its newly unlocked trait and does not auto-equip it',()=>{
  const profile={...upgraded(),challengeWins:[]};const run=successFixture(profile,'bowling');settleRun(profile,run);
  assert.deepEqual(run.challengeAward.unlocked,['heavy']);assert.equal(profile.ballTrait,'standard');
  assert.equal(selectBallTrait(profile,'heavy'),true);
});

test('success celebration continues world motion for a moment and then freezes the current pose without snapping to the floor',()=>{
  const profile=newProfile(),run=newRun(profile,1,1,0,{challenge:'domino'});run.events=[];
  run.challenge.success=true;run.challenge.completed=true;run.challenge.completedAt=0;
  placeRun(run,{s:0,height:20,vy:5});const firstY=run.worldY;
  stepRun(run,profile,.5);assert.equal(run.phase,'rolling');assert.notEqual(run.worldY,firstY);
  stepRun(run,profile,.7);assert.equal(run.phase,'stopped');assert.equal(run.stopReason,'challenge-success');
  assert.ok(run.height>10);assert.ok(run.elapsed>=1.1&&run.elapsed<1.12);assert.equal(run.speed,0);
});

test('a victory just before the challenge time cap still settles successfully',()=>{
  const profile=newProfile(),run=newRun(profile,1,1,0,{challenge:'domino'});run.events=[];
  run.elapsed=34.5;run.challenge.success=true;run.challenge.completed=true;run.challenge.completedAt=34.5;
  placeRun(run,{s:0,height:20});stepRun(run,profile,1);
  assert.equal(run.elapsed,35);assert.equal(run.stopReason,'challenge-success');settleRun(profile,run);assert.equal(profile.gold,60);
});

test('a spent ball leaves already launched prop motion alive until the challenge has been judged',()=>{
  const profile=newProfile(),run=newRun(profile,1,1,0,{challenge:'domino'}),launcher=run.events[0];
  resolveEvent(run,launcher,profile,{s:-1,x:0,y:0});run.speed=0;run.vx=0;placeRun(run,{s:0});
  stepRun(run,profile,.7);assert.equal(run.phase,'rolling');assert.ok(launcher.body?.active);assert.ok(launcher.body.s>launcher.at);
  for(let tick=0;tick<180&&run.phase==='rolling';tick++)stepRun(run,profile,.1);
  assert.equal(run.phase,'stopped');assert.ok(run.elapsed<=35);
});

test('all three authored victories travel through real prop collisions into one-time saved rewards',()=>{
  for(const [id,aim]of [['domino',14],['cookie',-12],['bowling',2]]){
    const profile=newProfile(),run=newRun(profile,1,42,aim,{challenge:id}),feedback=[];
    while(run.phase==='rolling')feedback.push(...stepRun(run,profile,.1));
    assert.equal(run.challenge.success,true,id);assert.equal(run.stopReason,'challenge-success',id);
    assert.equal(run.challenge.hitTargetIds.length,run.challenge.required,id);
    const targetHit=feedback.find(event=>event.kind==='chain'&&run.challenge.hitTargetIds.includes(event.eventId));
    const source=run.events.find(event=>event.id===targetHit?.sourceId);
    assert.ok(source?.body&&Number.isFinite(source.body.worldY),`${id} has an actual moving source`);
    assert.ok(run.lastDecisiveImpact?.sourceId,id);assert.equal(run.earned,0);
    assert.equal(settleRun(profile,run),true);assert.equal(profile.gold,60,id);
    assert.deepEqual(profile.challengeWins,[id]);assert.deepEqual(profile.rankings,[]);assert.equal(profile.tutorialComplete,false);
  }
});
