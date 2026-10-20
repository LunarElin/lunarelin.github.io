import test from 'node:test';
import assert from 'node:assert/strict';
import { createStage, emptyBuild, buildStats, pathClear, sendShip, failStage, undoMove, clone, validState, UPGRADES, FINAL_STAGE, upgradeChoices, upgradePreview, chooseUpgrade, restartStage } from './rules.mjs';
const finish = state => { const launches=[];for(const id of state.solution)if(state.ships.some(s=>s.id===id)){const r=sendShip(state,id);assert.ok(r.ok);launches.push(...r.launches);}return launches; };
const jamPath=['s0','s7','s13','s14','s1','s3'];
const jam = state => {for(const id of jamPath)assert.ok(sendShip(state,id).ok);return state;};
function reward(key){for(let seed=1;seed<100;seed++){const s=createStage(1,seed);finish(s);if(upgradeChoices(s).includes(key))return s;}throw Error('fixture');}

test('630 generated puzzles remain solvable with three docks and conserve exactly three explorers per ship',()=>{
 for(let seed=1;seed<=70;seed++)for(let stage=1;stage<=9;stage++){
  const s=createStage(stage,seed);assert.ok(validState(s));let arrivals=0;
  for(const id of s.solution){const r=sendShip(s,id);assert.ok(r.ok);for(const launch of r.launches){arrivals++;assert.equal(launch.planet,arrivals);assert.equal(launch.crew,3);}assert.ok(validState(s));assert.equal(s.launched,arrivals);assert.equal(s.status==='failed'||s.status==='lost',false);}
  assert.equal(s.status,'won');assert.equal(arrivals,s.total);assert.equal(s.queue.length,0);assert.equal(s.hp,undefined);assert.equal(s.hull,3);
 }
});
test('mixed queues require temporary parking instead of one color group per launch',()=>{
 const s=createStage(3,1),before=clone(s),r=sendShip(s,'s0');assert.ok(r.ok);assert.equal(r.launches.length,0);assert.equal(s.docks[0].loaded,1);assert.notEqual(s.queue[0],s.docks[0].color);assert.ok(undoMove(s,before));
 assert.deepEqual(createStage(5,123),createStage(5,123));assert.notDeepEqual(createStage(5,123).ships,createStage(5,124).ships);
});
test('a blocked arrow does not spend a move or hull',()=>{
 const s=createStage(3,1),ship=s.ships.find(x=>!pathClear(s.ships,x)),before=clone(s);assert.equal(sendShip(s,ship.id).ok,false);assert.deepEqual(s,before);
});
test('wrong legal moves fill all docks, fail immediately and spend hull exactly once',()=>{
 const s=jam(createStage(3,1));assert.equal(s.status,'failed');assert.equal(s.hull,2);assert.equal(s.hullDamage,1);assert.equal(s.failureReason,'jam');assert.equal(s.score,0);assert.ok(validState(s));assert.ok(s.docks.every(Boolean));
 const snapshot=clone(s);assert.equal(sendShip(s,'s2').ok,false);assert.equal(failStage(s),false);assert.deepEqual(s,snapshot);assert.equal(chooseUpgrade(s,'armor'),null);assert.equal(undoMove(s,createStage(3,1)),null);
});
test('retry retains damage and consumed recall; the third failed attempt ends a base run',()=>{
 let s=createStage(3,1),before=clone(s);sendShip(s,'s0');s=undoMove(s,before);assert.equal(s.undoUsed,1);
 for(let lives=2;lives>=0;lives--){jam(s);assert.equal(s.hull,lives);assert.equal(s.status,lives?'failed':'lost');assert.ok(validState(s));if(lives){s=restartStage(s);assert.equal(s.hull,lives);assert.equal(s.undoUsed,1);assert.ok(validState(s));}else assert.equal(restartStage(s),null);}
});
test('voluntary abort has the same permanent hull cost; playing and cleared states cannot reset for free',()=>{
 const s=createStage(1,7);assert.equal(restartStage(s),null);assert.equal(failStage(s),true);assert.equal(s.hull,2);assert.equal(s.status,'failed');const retry=restartStage(s);assert.equal(retry.hull,2);assert.equal(retry.attempts,2);assert.equal(retry.score,0);assert.ok(validState(retry));finish(retry);assert.equal(restartStage(retry),null);assert.equal(failStage(retry),false);
});
test('undo consumes a permanent budget and cannot recall a launched exploration',()=>{
 const initial=createStage(3,1),s=clone(initial);sendShip(s,'s0');const restored=undoMove(s,initial);assert.ok(restored);assert.equal(restored.undoUsed,1);assert.equal(restored.moves,0);assert.equal(restored.queue.length,initial.queue.length);
 const again=clone(restored);sendShip(restored,'s0');assert.equal(undoMove(restored,again),null);
 const launched=createStage(1,1),before=clone(launched);assert.ok(sendShip(launched,launched.solution[0]).launches.length);assert.equal(undoMove(launched,before),null);
});
test('recall rank extends the actual budget and scan rank changes the actual queue forecast',()=>{
 const s=createStage(3,1,{...emptyBuild(),recall:2,scan:3});assert.equal(buildStats(s.build).undoLimit,3);assert.equal(buildStats(s.build).preview,15);
 let current=s;for(let i=0;i<3;i++){const before=clone(current);sendShip(current,'s0');current=undoMove(current,before);assert.ok(current);assert.equal(current.undoUsed,i+1);}const before=clone(current);sendShip(current,'s0');assert.equal(undoMove(current,before),null);
});
test('dock upgrade makes a previously fatal third parking survivable',()=>{
 const s=createStage(3,1,{...emptyBuild(),dock:1});for(const id of jamPath)sendShip(s,id);assert.equal(s.status,'playing');assert.equal(s.hull,3);assert.equal(s.docks.length,4);assert.equal(s.docks.filter(Boolean).length,3);assert.ok(validState(s));
});
test('rewards have real puzzle effects, exact previews and no damage bonuses',()=>{
 for(const key of Object.keys(UPGRADES)){const s=reward(key),preview=upgradePreview(s,key);assert.ok(preview.effect.length>20);assert.ok(preview.before);assert.ok(preview.after);assert.ok(preview.example.length>20);const old=clone(s),next=chooseUpgrade(s,key);assert.equal(next.build[key],1);assert.ok(validState(next));assert.deepEqual(s,old);}
 const damaged=reward('armor');damaged.hull=1;assert.equal(upgradePreview(damaged,'armor').after,'선체 2/4');assert.equal(chooseUpgrade(damaged,'armor').hull,2);
});
test('all nine sectors can be completed with cumulative rewards and a defined ending',()=>{
 let s=createStage(1,44),picks=0;
 while(true){finish(s);assert.equal(s.status,'won');assert.ok(validState(s));if(s.stage===FINAL_STAGE)break;const keys=upgradeChoices(s);assert.ok(keys.length>0);assert.equal(new Set(keys).size,keys.length);const next=chooseUpgrade(s,keys[0]);assert.equal(next.runScore,s.runScore+s.score);s=next;picks++;}
 assert.equal(picks,8);assert.deepEqual(upgradeChoices(s),[]);assert.equal(chooseUpgrade(s,'dock'),null);
});
test('candidate caps and forged, old or inconsistent saves are rejected',()=>{
 const build=Object.fromEntries(Object.entries(UPGRADES).map(([k,u])=>[k,u.max]));assert.deepEqual(upgradeChoices(createStage(4,1,build)),[]);
 const s=createStage(3,1);for(const mutate of [x=>x.version=2,x=>x.hull=99,x=>x.hull=0,x=>x.undoUsed=4,x=>x.hp=100,x=>x.queue.pop(),x=>x.stage=10,x=>x.ships.push(x.ships[0]),x=>x.status='won',x=>x.score=Infinity,x=>x.build.plasma=1,x=>x.ships[0].id='<img>',x=>x.moves=10]){const bad=clone(s);mutate(bad);assert.equal(validState(bad),false);}assert.equal(validState(null),false);
});

test('corrupt dock placeholders cannot restore a board that has no usable docking slot',()=>{
 for(const placeholder of [false,0,'']){
  const saved=createStage(1,1);saved.docks.fill(placeholder);
  assert.equal(validState(saved),false);
 }
 assert.ok(validState(JSON.parse(JSON.stringify(createStage(1,1)))));
});
