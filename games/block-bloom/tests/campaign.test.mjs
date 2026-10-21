import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, createLevel, createStage, stageInfo, runInfo, hasGimmick, boardKey, move, guide, elevate, useItem, continueRun, newProfile, restoreProfile, validRun, migrateCampaignRun, winReward, lessonStep, tick, copyState } from '../rules.mjs';

const curriculum = [[], ['key'], ['key','ice'], ['merge'], ['triple'], ['factory'], ['factory'], ['triple','key'], ['merge','ice'], ['factory','ice'], ['triple','key','ice'], ['factory','key']];
const block=(id,color,x,y,extra={})=>({id,color,x,y,w:1,h:1,rank:1,...extra});
function finish(state) {
  for (const action of state.plan) {
    assert.equal(action.action,undefined,'construction paths contain ordinary moves only');
    const before=boardKey(state),result=move(state,action.id,action.dx,action.dy);
    assert.ok(result.ok,`stage ${state.stage ?? state.mode}: ${JSON.stringify(action)}`);
    assert.equal(boardKey(state),before,'construction moves do not mutate the input');
    state=result.state;assert.ok(validRun(state),'each intermediate board remains saveable');
  }
  assert.equal(state.status,'won');return state;
}
function fixture(state,blocks,extra={}) {
  return {...state,blocks,queue:[],tray:[],reserve:[],unlocked:[],plan:[],total:blocks.length,initial:blocks.length,removed:0,moves:0,score:0,...extra};
}

test('the first twelve stages teach one new gimmick or verified combination before applications repeat',()=>{
  for(let number=1;number<=12;number++) {
    const info=stageInfo(number);assert.equal(info.number,number);assert.deepEqual(info.gimmicks,curriculum[number-1]);
    assert.ok(info.title&&info.shortTitle&&info.description);assert.ok(info.tips.length>=2&&info.tips.length<=3);
    assert.equal(info.introLabel,number===1?'기본 규칙':number===7?'기믹 복습':number<=6?'새 기믹':'새 조합');
  }
  assert.equal(new Set(Array.from({length:12},(_,i)=>stageInfo(i+1).title)).size,12);
  for(let number=13;number<=27;number++) {
    assert.deepEqual(stageInfo(number).gimmicks,curriculum[7+(number-13)%5]);
    assert.equal(stageInfo(number).introLabel,'응용 기믹');
  }
  const copied=stageInfo(3);copied.gimmicks.length=0;copied.tips.length=0;
  assert.deepEqual(stageInfo(3).gimmicks,['key','ice']);assert.equal(stageInfo(3).tips.length,2);
});

test('1,260 campaign boards have deterministic and complete legal construction solutions',()=>{
  for(let number=1;number<=27;number++)for(let i=0;i<(number<=12?80:20);i++) {
    const seed=(i*2719+number*391)>>>0,state=createStage(number,seed);
    assert.ok(validRun(state));assert.equal(state.started,false);assert.equal(state.stage,number);
    assert.deepEqual(state.gimmicks,stageInfo(number).gimmicks);
    assert.deepEqual(createStage(number,seed),state,'same stage and seed reproduce all mechanics');
    const won=finish(state);assert.equal(won.removed,won.total);assert.equal(won.blocks.length+won.queue.length+won.tray.length+won.reserve.length,0);
  }
  assert.ok(createStage(23,1).level>createStage(8,1).level,'application rounds increase generation difficulty');
});

test('hints replay each campaign recipe and terminate instead of following a legacy mode board',()=>{
  for(let number=1;number<=12;number++) {
    let state=createStage(number,59),steps=0;
    while(state.status==='playing'&&steps++<700) {
      const action=guide(state,3000);assert.ok(action,`stage ${number} has a legal hint`);
      assert.equal(action.action,undefined);const result=move(state,action.id,action.dx,action.dy);assert.ok(result.ok);state=result.state;
    }
    assert.equal(state.status,'won',`stage ${number} hint path terminates`);
  }
});

test('factory lessons and all generated stages use no elevator, including old explicit flags',()=>{
  const factory=createStage(6,1),practice=createStage(7,1),legacy=createLevel('factory',1,1);
  assert.equal(hasGimmick(factory,'factory'),true);assert.equal(hasGimmick(factory,'lift'),false);assert.equal(factory.queue.length,2);
  assert.equal(hasGimmick(practice,'factory'),true);assert.equal(hasGimmick(practice,'lift'),false);assert.equal(hasGimmick(legacy,'lift'),false);
  for(const state of [factory,practice,legacy,{...legacy,gimmicks:['factory','lift']}]) {
    const board=fixture(state,[block(0,'blue',2,2)]),result=elevate(board,0);
    assert.equal(result.ok,false);assert.equal(result.state,board);assert.equal(hasGimmick(state,'lift'),false);
  }
  for(const number of [7,10,12,15,17,20,22,100,9999]){const s=createStage(number,7);assert.ok(!s.gimmicks.includes('lift'));assert.ok(s.plan.every(a=>a.action===undefined));finish(s);}
});

test('compound generators attach keys and frost without freezing the first required clears',()=>{
  const keyIce=createStage(3,91),triple=createStage(11,91),merge=createStage(9,91),factory=createStage(10,91);
  assert.equal(keyIce.blocks.filter(b=>b.key).length,3);assert.deepEqual(keyIce.blocks.filter(b=>b.ice).map(b=>b.id),[2]);
  assert.equal(triple.blocks.filter(b=>b.key).length,3);
  for(const color of ['coral','blue','lime'])assert.equal(triple.blocks.filter(b=>b.color===color).length,3);
  assert.equal(triple.blocks.filter(b=>b.color==='gold').length,0);
  assert.deepEqual(merge.blocks.filter(b=>b.ice).map(b=>b.id),[4,5]);assert.equal(factory.queue.some(b=>b.ice),false);
  for(const state of [keyIce,triple,merge,factory])finish(state);
});

test('merging carries a consumed key and the stronger frost instead of erasing either prerequisite',()=>{
  let state=fixture(createLevel('merge',1,1,{gimmicks:['merge','key','ice']}),[
    block(0,'coral',1,0,{ice:1}),block(1,'coral',1,2,{key:true,ice:2}),
    block(2,'blue',5,1,{rank:2,key:true}),block(3,'gold',0,4,{rank:2,key:true}),
  ]);
  assert.ok(validRun(state));state=move(state,1,0,-2).state;
  const merged=state.blocks.find(b=>b.id===0);assert.equal(merged.rank,2);assert.equal(merged.key,true);assert.equal(merged.ice,2);
  assert.equal(move(state,0,0,-1).ok,false);
  state=move(state,2,1,0).state;assert.equal(state.blocks.find(b=>b.id===0).ice,1);
  state=move(state,3,-1,0).state;assert.equal(state.blocks.find(b=>b.id===0).ice,0);
  state=move(state,0,0,-1).state;assert.equal(state.status,'won');assert.ok(state.unlocked.includes('coral'));assert.ok(validRun(state));
});

test('triple key and frost boards preserve partial colors across continue and can still finish',()=>{
  let state=createStage(11,33,{layoutVersion:1});
  for(const id of [0,1,3,4,6,7,9])state=useItem(state,'hammer',id).state;
  assert.equal(state.status,'lost');assert.equal(state.tray.length,7);assert.ok(validRun(state));
  state=continueRun(state);assert.equal(state.reserve.length,7);assert.equal(state.tray.length,0);assert.ok(validRun(state));
  for(const id of [2,5,8,10,11]){state=useItem(state,'hammer',id).state;assert.ok(validRun(state));}
  assert.equal(state.status,'won');assert.equal(state.reserve.length,0);
});

test('legacy runs preserve their actual board mechanics and require an explanation only once',()=>{
  const expectedStage={classic:1,key:2,ice:3,merge:4,triple:5,factory:7};
  for(const mode of Object.keys(MODES)) {
    const old={...createLevel(mode,7,99),started:true,time:57.5,moves:11},before=JSON.stringify(old),migrated=migrateCampaignRun(old);
    assert.equal(JSON.stringify(old),before);assert.ok(validRun(migrated));assert.equal(migrated.stage,expectedStage[mode]);
    assert.equal(migrated.campaignLegacy,true);assert.equal(migrated.started,false);assert.equal(migrated.time,57.5);assert.equal(migrated.moves,11);
    assert.deepEqual(migrated.blocks,old.blocks);assert.deepEqual(migrated.queue,old.queue);assert.equal(runInfo(migrated).shortTitle,MODES[mode].name);
    assert.deepEqual(runInfo(migrated).gimmicks,mode==='classic'?[]:[mode]);
    migrated.started=true;assert.deepEqual(migrateCampaignRun(migrated),migrated,'reload does not force an acknowledged introduction again');
  }
  const modern={...createStage(11,12),started:true};assert.deepEqual(migrateCampaignRun(modern),modern);
});

test('legacy triple recovery runs before campaign wrapping and keeps the old continuation solvable',()=>{
  let old=createLevel('triple',1,22);for(const id of [0,1,3,4,6,7,9])old=useItem(old,'hammer',id).state;
  old={...old,status:'playing',continues:1,tray:[]};delete old.reserve;delete old.started;
  let state=migrateCampaignRun(old);assert.ok(validRun(state));assert.equal(state.reserve.length,7);assert.equal(state.started,false);
  for(const id of [2,5,8,10,11])state=useItem(state,'hammer',id).state;
  assert.equal(state.status,'won');assert.equal(state.campaignLegacy,true);
});

test('profile migration retains economy and preferences but never skips lessons from legacy wins or levels',()=>{
  const old={coins:812,wins:99,stars:44,levels:{classic:50,key:12},items:{hammer:8,hint:7},sound:false,motion:false,daily:'2026-10-21',starter:true};
  const profile=restoreProfile(old);assert.equal(profile.stage,1);assert.equal(profile.coins,812);assert.equal(profile.items.hammer,8);assert.equal(profile.items.hint,7);
  assert.equal(profile.wins,99);assert.equal(profile.levels.classic,50);assert.equal(profile.sound,false);assert.equal(profile.motion,false);assert.equal(profile.starter,true);
  for(const stage of [0,-1,1.5,10000,Infinity,'8'])assert.equal(restoreProfile({...old,stage}).stage,1);
  assert.equal(restoreProfile({...old,stage:23}).stage,23);
});

test('campaign rewards advance progress exactly once while old boards rejoin without advancing it',()=>{
  const won=finish(createStage(7,51)),first=winReward(won,newProfile());
  assert.equal(first.profile.stage,8);assert.equal(first.state.rewarded,true);assert.equal(first.profile.wins,1);
  const again=winReward(migrateCampaignRun(first.state),restoreProfile(first.profile));assert.equal(again.coins,0);assert.equal(again.profile.stage,8);assert.equal(again.profile.wins,1);
  const replay=winReward(finish(createStage(3,51)),{...newProfile(),stage:12});assert.equal(replay.profile.stage,12);
  const legacy=winReward(migrateCampaignRun(finish(createLevel('factory',1,51))),newProfile());assert.equal(legacy.profile.stage,1);assert.ok(legacy.coins>0);
  const repeated=winReward(migrateCampaignRun(legacy.state),legacy.profile);assert.equal(repeated.coins,0);assert.equal(repeated.profile.stage,1);
  const capped=winReward(finish(createStage(9999,1)),{...newProfile(),stage:9999});assert.equal(capped.profile.stage,9999);assert.ok(validRun(capped.state));
});

test('campaign saves reject mismatched recipes, unsafe combinations, malformed fields and invalid bounds',()=>{
  const stage=createStage(3,1);
  for(const corrupt of [
    {...stage,stage:0},{...stage,stage:10000},{...stage,stage:2},{...stage,level:2},{...stage,mode:'ice'},
    {...stage,gimmicks:['key']},{...stage,gimmicks:['key','ice','ice']},{...stage,gimmicks:['other']},
    {...stage,gimmicks:null},{...stage,campaignLegacy:'true'},{...stage,blocks:[null]},{...stage,reserve:undefined},{...stage,started:undefined},
    {...createStage(6,1),gimmicks:['factory','lift','ice']},{...migrateCampaignRun(createLevel('ice',1,1)),stage:2},
  ])assert.equal(validRun(corrupt),false,JSON.stringify(corrupt));
  for(const gimmicks of [['merge','triple'],['factory','triple'],['merge','factory'],['lift'],['unknown']])assert.throws(()=>createLevel('classic',1,1,{gimmicks}),RangeError);
  for(const mode of Object.keys(MODES))assert.ok(validRun(createLevel(mode,1,1)),'old saves remain accepted');
});


test('first lessons use sparse short boards and only real mechanic actions advance practice',()=>{
  const counts=[2,3,4,4,6,4,5],steps=[2,2,3,2,3,3,2];
  for(let stage=1;stage<=7;stage++) {
    let state=createStage(stage,771),completed=0;assert.equal(state.layoutVersion,2);assert.equal(state.lessonIndex,0);
    assert.equal(state.total,counts[stage-1]);assert.ok(state.plan.length<=6);assert.equal(state.time,240);
    assert.equal(lessonStep(state).total,steps[stage-1]);
    for(const action of state.plan) {
      const before=copyState(state),step=lessonStep(state);if(step)assert.equal(tick(state,60),state,'reading and practice do not consume time');
      if(step) {
        assert.equal(step.blockId,action.id);assert.equal(step.action,action.action||'move');assert.ok(step.text&&step.title);
        const invalid=move(state,999,1,0);assert.equal(invalid.state.lessonIndex,state.lessonIndex);
      }
      const result=move(state,action.id,action.dx,action.dy);assert.ok(result.ok);
      state=result.state;if(step){completed++;assert.equal(state.lessonIndex,completed);}
      assert.equal(before.lessonIndex,completed-(step?1:0),'practice progress never mutates input snapshots');
      assert.ok(validRun(state));
      if(completed===steps[stage-1]&&state.status==='playing')assert.ok(tick(state,1).time<state.time,'clock resumes for independent practice');
    }
    assert.equal(completed,steps[stage-1]);assert.equal(state.status,'won');assert.equal(lessonStep(state),null);
  }
});

test('early combinations increase density gradually and keep supply small before later applications',()=>{
  const totals=[6,6,8,9,10];
  for(let stage=8;stage<=12;stage++) {
    const state=createStage(stage,91);assert.equal(state.total,totals[stage-8]);assert.equal(state.time,210);assert.equal(lessonStep(state),null);
    assert.ok(state.blocks.every(b=>b.w*b.h<=2));if(hasGimmick(state,'factory'))assert.equal(state.queue.length,2);
  }
  assert.equal(createStage(13,91).total,9);assert.equal(createStage(14,91).total,8);assert.equal(createStage(15,91).queue.length,3);
  assert.equal(createStage(18,91).total,12);assert.equal(createStage(20,91).queue.length,4);
  for(const stage of [18,23,28,53,9999])assert.ok(createStage(stage,91).total<=16);
});

test('layout version one preserves old campaign boards and their original guide paths',()=>{
  for(let stage=1;stage<=12;stage++) {
    const info=stageInfo(stage),level=1+Math.floor((stage-1)/5),mode=['merge','triple','factory','key','ice'].find(id=>info.gimmicks.includes(id))||'classic';
    const legacy={...createLevel(mode,level,59,{gimmicks:info.gimmicks}),stage,started:true};
    const migrated=migrateCampaignRun(legacy),replay=createStage(stage,59,{layoutVersion:1});
    assert.equal(migrated.layoutVersion,1);assert.equal(lessonStep(migrated),null);assert.deepEqual(replay.blocks,legacy.blocks);assert.deepEqual(replay.queue,legacy.queue);assert.deepEqual(replay.plan,legacy.plan);
    assert.equal(boardKey(migrated),boardKey(legacy));assert.ok(validRun(migrated));assert.ok(guide(migrated,3000));finish(replay);
  }
  assert.throws(()=>createStage(1,1,{layoutVersion:3}),RangeError);
  for(const corrupt of [
    {...createStage(1,1),layoutVersion:0},{...createStage(1,1),layoutVersion:3},{...createStage(1,1),lessonIndex:-1},
    {...createStage(1,1),lessonIndex:3},{...createStage(1,1),lessonIndex:0.5},{...createStage(1,1),lessonIndex:undefined},
    {...createStage(8,1),lessonIndex:0},{...createStage(1,1),stage:undefined},
  ])assert.equal(validRun(corrupt),false);
});


test('first combinations keep short certified paths across 200 varied seeds and replay the selected candidate',()=>{
  const budgets=[30,30,40,45,50];
  for(let stage=8;stage<=12;stage++)for(let i=0;i<200;i++) {
    const seed=(i*2719+stage*391)>>>0,state=createStage(stage,seed),units=state.plan.reduce((total,a)=>total+Math.abs(a.dx+a.dy),0);
    assert.ok(units<=budgets[stage-8],`stage ${stage}, seed ${seed}: ${units} moves`);
    assert.equal(state.seed,seed,'selected candidates retain the input seed for save and guide reconstruction');
    assert.deepEqual(createStage(stage,seed),state);finish(state);
    if(stage===8)assert.ok(state.blocks.every(b=>b.w===1&&b.h===1),'first combination uses small, clearly separated pieces');
  }
});

test('old elevator practice and its completed snapshots migrate without resetting blocks, clock or progress',()=>{
  const fresh=createStage(7,513),old={...fresh,gimmicks:['factory','lift'],liftDirection:1,time:197,plan:[{id:0,action:'lift',dx:0,dy:0},...fresh.plan.slice(1)]};
  assert.ok(validRun(old),'older flags and construction action reach migration instead of discarding the save');
  const before=JSON.stringify(old),migrated=migrateCampaignRun(old);
  assert.equal(JSON.stringify(old),before);assert.deepEqual(migrated.blocks,old.blocks);assert.equal(migrated.time,197);assert.equal(migrated.lessonIndex,0);
  assert.deepEqual(migrated.gimmicks,['factory']);assert.equal(migrated.liftDirection,undefined);assert.ok(migrated.plan.every(a=>a.action===undefined));
  assert.equal(lessonStep(migrated).goal,'align');assert.equal(lessonStep(migrated).action,'move');finish(migrated);
  const afterLift={...old,blocks:old.blocks.map(b=>b.id===0?{...b,y:4}:b),lessonIndex:1,moves:1,plan:[]};
  const resumed=migrateCampaignRun(afterLift);assert.ok(validRun(resumed));assert.deepEqual(resumed.blocks,afterLift.blocks);assert.equal(resumed.lessonIndex,1);assert.equal(lessonStep(resumed).goal,'exit');
  assert.deepEqual(guide(resumed),{id:0,dx:-3,dy:0},'old post-lift coordinates still follow the current ordinary lesson');
  let guided=resumed,steps=0;while(guided.status==='playing'&&steps++<100){const action=guide(guided);assert.ok(action);const step=lessonStep(guided);if(step)assert.equal(action.id,step.blockId);guided=move(guided,action.id,action.dx,action.dy).state;}
  assert.equal(guided.status,'won','restored practice can finish entirely through ordinary guides');
  let cursor=move(resumed,0,-3,0).state;assert.equal(cursor.lessonIndex,2);
  for(const action of fresh.plan.slice(2))cursor=move(cursor,action.id,action.dx,action.dy).state;
  assert.equal(cursor.status,'won');
  const independent={...afterLift,blocks:afterLift.blocks.filter(b=>b.id!==0),removed:1,lessonIndex:2,score:100};
  const free=migrateCampaignRun(independent);assert.ok(validRun(free));assert.deepEqual(free.blocks,independent.blocks);assert.equal(lessonStep(free),null);assert.ok(guide(free));
  assert.deepEqual(migrateCampaignRun(migrated),migrated,'normalization is idempotent for run and undo snapshots');
});

test('reversing an alignment drag restores its vertical lesson before the next gesture',()=>{
  let state=createStage(7,17);state=move(state,0,0,2).state;assert.equal(state.lessonIndex,1);
  state=move(state,0,0,-3).state;assert.equal(state.blocks.find(b=>b.id===0).y,1);assert.equal(state.lessonIndex,0);assert.equal(lessonStep(state).goal,'align');
  const time=state.time;assert.equal(tick(state,60).time,time);
  state=move(state,0,0,2).state;assert.equal(state.blocks.find(b=>b.id===0).y,3);assert.equal(state.lessonIndex,1);
  state=move(state,0,-3,0).state;assert.equal(state.lessonIndex,2);assert.equal(lessonStep(state),null);
});

test('legacy factory saves keep an already moved board and use ordinary hints without teleporting through blockers',()=>{
  const old=fixture(createLevel('factory',1,59),[block(0,'blue',2,4),block(1,'gold',2,3)],{gimmicks:['factory','lift'],liftDirection:-1,time:73,started:true});
  assert.ok(validRun(old));let state=migrateCampaignRun(old);assert.deepEqual(state.blocks,old.blocks);assert.equal(state.time,73);assert.equal(hasGimmick(state,'lift'),false);
  assert.equal(elevate(state,0).ok,false);assert.equal(move(state,0,0,-1).ok,false,'intervening blocker stays solid');
  let count=0;while(state.status==='playing'&&count++<100){const action=guide(state,3000);assert.ok(action);assert.equal(action.action,undefined);const result=move(state,action.id,action.dx,action.dy);assert.ok(result.ok);state=result.state;}
  assert.equal(state.status,'won');
});
