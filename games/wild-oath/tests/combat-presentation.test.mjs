import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,chooseDraft,chooseEncounter,chooseReward,startBattle,stepBattle,describeCard,serialize,restoreRun} from '../rules.mjs';
import {presentationTiming,effectKind,impactBeats,impactTotals} from '../combat-presentation.mjs';

function battle(seed=1) {
  const state=createRun(seed);
  while(state.phase==='draft')chooseDraft(state,state.draft.offers[0].uid);
  chooseEncounter(state,state.exploration.offers[0].uid);
  while(state.phase==='draft')chooseDraft(state,state.draft.offers[0].uid);
  assert.equal(startBattle(state).ok,true);
  return state;
}

function play(id,{actor='player',source={},target={}}={}) {
  const state=battle(),other=actor==='player'?'enemy':'player';
  state.battle.actor=actor;
  Object.assign(state.battle[actor],{energy:10,form:'druid',shield:0,focus:0,combo:0,...source});
  Object.assign(state.battle[other],{hp:70,form:'druid',shield:0,poison:0,burn:0,shock:0,...target});
  state.battle[actor].draw=[{uid:'presentation-card',id,tier:1,charge:0},...state.battle[actor].draw];
  const before=healthSnapshot(state.battle);
  return {state,before,event:stepBattle(state)};
}

function healthSnapshot(fighters) {
  return Object.fromEntries(['player','enemy'].map(actor=>[actor,{hp:fighters[actor].hp,maxHp:fighters[actor].maxHp}]));
}

function verifyHealthTimeline(before,event,state,label='') {
  const saved=serialize(state),shown=structuredClone(before);
  shown[event.actor].hp+=event.heal;
  for(const beat of impactBeats(event)){
    shown[beat.target].hp-=beat.damage;
    if(beat.kind==='reaction')shown[beat.actor].hp+=event.reactionHeal;
    for(const actor of ['player','enemy'])assert.ok(shown[actor].hp>=0&&shown[actor].hp<=shown[actor].maxHp,`${label}: ${beat.kind} ${actor} health bounds`);
  }
  assert.deepEqual(shown,healthSnapshot(state.battle),`${label}: sequential health equals the final rule state`);
  assert.equal(serialize(state),saved,`${label}: health presentation never changes rule state`);
}

test('every supported speed keeps a readable reveal, travel and impact interval',()=>{
  const expected=[
    [1,{draw:260,reveal:420,travel:280,impactGap:160,settle:620,formSettle:1050}],
    [2,{draw:140,reveal:260,travel:180,impactGap:160,settle:380,formSettle:650}],
    [4,{draw:140,reveal:260,travel:180,impactGap:160,settle:380,formSettle:650}],
  ];
  for(const [speed,timing] of expected){
    assert.deepEqual(presentationTiming(speed),timing);
    assert.ok(timing.draw>=140&&timing.reveal>=260&&timing.travel>=180);
    assert.ok(timing.impactGap>=160&&timing.settle>=380&&timing.formSettle>=650);
  }
  for(const invalid of [0,-1,3,8,Infinity,NaN,'2',null])assert.deepEqual(presentationTiming(invalid),presentationTiming(1));
});

test('reduced motion removes travel and stagger while keeping card and result readable',()=>{
  const reduced={draw:0,reveal:320,travel:0,impactGap:0,settle:440,formSettle:700};
  for(const speed of [1,2,4])assert.deepEqual(presentationTiming(speed,true),reduced);
  const beats=impactBeats({actor:'player',target:'enemy',strikes:[{damage:4,absorbed:0,rawDamage:4},{damage:4,absorbed:0,rawDamage:4}]},reduced.impactGap);
  assert.deepEqual(beats.map(beat=>beat.delay),[0,0]);
});

test('effect colors follow the card effect and preserve readable support priorities',()=>{
  for(const [id,kind] of [
    ['wolf','form'],['bear','form'],['wyvern','form'],
    ['claw','claw'],['talon','claw'],['pounce','claw'],
    ['storm','shock'],['static','shock'],['ember','fire'],['venom','poison'],
    ['bark','shield'],['thorns','shield'],['wildheart','shield'],
    ['mend','heal'],['moonwell','heal'],['harvest','heal'],
    ['sap','energy'],['kindle','energy'],['rally','energy'],
  ])assert.equal(effectKind(describeCard(id)),kind,id);
  assert.equal(effectKind({type:'attack',damage:1,shock:1,burn:1,poison:1}),'shock');
  assert.equal(effectKind({type:'attack',damage:1,burn:1,poison:1}),'fire');
});

test('two real strikes report separate shield absorption and capped lethal damage',()=>{
  for(const actor of ['player','enemy'])for(const [shield,hp,expected] of [
    [5,70,[{damage:0,absorbed:4,rawDamage:4},{damage:3,absorbed:1,rawDamage:4}]],
    [0,2,[{damage:2,absorbed:0,rawDamage:4},{damage:0,absorbed:0,rawDamage:4}]],
  ]){
    const {event}=play('pounce',{actor,target:{shield,hp}});
    assert.deepEqual(event.strikes,expected);
    for(const key of ['damage','absorbed','rawDamage'])assert.equal(event.strikes.reduce((sum,strike)=>sum+strike[key],0),event[key]);
    const beats=impactBeats(event,110);
    assert.equal(beats.length,2);assert.deepEqual(beats.map(beat=>beat.delay),[0,110]);
    assert.deepEqual(beats.map(beat=>beat.damage),expected.map(strike=>strike.damage));
    assert.ok(beats.every(beat=>beat.actor===actor&&beat.target===event.target&&beat.kind==='strike'&&beat.total===2));
  }
});

test('wolf pursuit is an extra real strike and concentration is included only in the first',()=>{
  const {event}=play('pounce',{source:{form:'wolf',combo:2,focus:3}});
  assert.equal(event.extraHits,1);
  assert.deepEqual(event.strikes,[{damage:11,absorbed:0,rawDamage:11},{damage:8,absorbed:0,rawDamage:8},{damage:8,absorbed:0,rawDamage:8}]);
  assert.equal(event.damage,27);assert.equal(event.rawDamage,27);
  assert.deepEqual(impactBeats(event,110).map(beat=>beat.delay),[0,110,220]);
});

test('reaction and counter follow ordinary strikes once and keep their actual owner',()=>{
  const reaction=play('storm',{source:{form:'wyvern'},target:{poison:4,shield:50}}).event;
  const reactionBeats=impactBeats(reaction,110);
  assert.deepEqual(reactionBeats.map(({kind,damage,absorbed,actor,target})=>({kind,damage,absorbed,actor,target})),[
    {kind:'strike',damage:3,absorbed:0,actor:'player',target:'enemy'},
    {kind:'reaction',damage:8,absorbed:0,actor:'player',target:'enemy'},
  ]);
  assert.equal(reaction.damage,3,'reaction damage is not included again in the ordinary strike');
  for(const actor of ['player','enemy']){
    const counter=play('pounce',{actor,source:{shield:2},target:{form:'bear',shield:10}}).event;
    const beats=impactBeats(counter,110),last=beats.at(-1);
    assert.deepEqual(beats.map(beat=>beat.kind),['strike','strike','counter']);
    assert.equal(last.actor,counter.target);assert.equal(last.target,counter.actor);
    assert.equal(last.damage,2);assert.equal(last.absorbed,2);assert.equal(last.rawDamage,4);
    assert.equal(last.delay,220);assert.equal(last.index,2);assert.equal(last.total,3);
  }
});

test('fully blocked and overkill effects are retained without inventing life damage',()=>{
  const blocked=play('claw',{source:{shield:8},target:{form:'bear',shield:10}}).event;
  const blockedBeats=impactBeats(blocked,110);
  assert.deepEqual(blockedBeats.map(beat=>[beat.damage,beat.absorbed,beat.rawDamage]),[[0,6,6],[0,3,3]]);
  const lethal=play('storm',{source:{form:'wyvern'},target:{hp:1,poison:4}}).event;
  assert.deepEqual(impactBeats(lethal).map(beat=>[beat.kind,beat.damage,beat.rawDamage]),[['strike',1,3],['reaction',0,8]]);
  const support=play('kindle',{source:{form:'wyvern'},target:{poison:3}}).event;
  assert.deepEqual(support.strikes,[]);assert.deepEqual(impactBeats(support).map(beat=>beat.kind),['reaction']);
  assert.deepEqual(play('bark').event.strikes,[]);
});

test('card energy shock resolves before poison reaction even when shock is lethal',()=>{
  for(const actor of ['player','enemy']){
    const {state,event}=play('kindle',{actor,source:{form:'wyvern',hp:40},target:{hp:3,poison:4,shock:5}});
    assert.deepEqual(event.impacts,[
      {kind:'shock',damage:3,absorbed:0,rawDamage:5},
      {kind:'reaction',damage:0,absorbed:0,rawDamage:8},
    ]);
    const beats=impactBeats(event,110);
    assert.deepEqual(beats.map(beat=>beat.kind),['shock','reaction']);
    assert.ok(beats.every(beat=>beat.actor===actor&&beat.target===event.target));
    assert.equal(event.shockDamage,3);assert.equal(event.reactionDamage,0);assert.equal(event.reactionHeal,4);
    assert.equal(state.battle[actor].hp,44);
    assert.deepEqual(event.strikes,[]);
  }
});

test('card energy and turn recovery create two distinct shocks around the reaction',()=>{
  const events=[];
  for(const actor of ['player','enemy']){
    const {event}=play('kindle',{actor,source:{form:'wyvern',energy:1,draw:[]},target:{poison:4,shock:5}});
    assert.deepEqual(event.impacts,[
      {kind:'shock',damage:5,absorbed:0,rawDamage:5},
      {kind:'reaction',damage:8,absorbed:0,rawDamage:8},
      {kind:'shock',damage:4,absorbed:0,rawDamage:4},
    ]);
    assert.equal(event.turnEnded,true);assert.equal(event.energyRecovered,1);assert.equal(event.shockDamage,9);
    const beats=impactBeats(event,110);
    assert.deepEqual(beats.map(beat=>beat.delay),[0,110,220]);
    assert.ok(beats.every(beat=>beat.actor===actor&&beat.target===event.target));
    events.push(event.impacts);
  }
  assert.deepEqual(events[0],events[1]);
});

test('shuffle poison, failed-charge burn and fatigue retain their self-damage targets',()=>{
  for(const actor of ['player','enemy']){
    const state=battle(),other=actor==='player'?'enemy':'player';
    state.battle.actor=actor;
    Object.assign(state.battle[actor],{draw:[],discard:[],poison:5,shield:6});
    const poison=stepBattle(state),poisonBeat=impactBeats(poison)[0];
    assert.deepEqual(poison.impacts,[{kind:'poison',damage:2,absorbed:6,rawDamage:5}]);
    assert.equal(poisonBeat.actor,other);assert.equal(poisonBeat.target,actor);
    const burning=battle();burning.battle.actor=actor;burning.battle.turn=41;
    Object.assign(burning.battle[actor],{draw:[{uid:'presentation-card',id:'claw',tier:1,charge:0}],discard:[],energy:0,burn:5,shield:3});
    burning.battle[other].shock=2;
    const event=stepBattle(burning),beats=impactBeats(event,110);
    assert.deepEqual(event.impacts,[
      {kind:'burn',damage:2,absorbed:3,rawDamage:5},
      {kind:'shock',damage:2,absorbed:0,rawDamage:2},
      {kind:'fatigue',damage:1,absorbed:0,rawDamage:1},
    ]);
    assert.deepEqual(beats.map(beat=>[beat.kind,beat.actor,beat.target]),[['burn',other,actor],['shock',actor,other],['fatigue',actor,actor]]);
  }
});

test('ordered diagnostic impacts preserve all existing damage and absorption aggregates',()=>{
  const fixtures=[
    play('pounce',{source:{shield:2,energy:1,draw:[]},target:{form:'bear',shield:10,shock:3}}).event,
    play('kindle',{source:{form:'wyvern',energy:1,draw:[]},target:{poison:4,shock:5,shield:2}}).event,
    play('pounce',{source:{form:'wolf',combo:2,focus:3},target:{shield:6,hp:3}}).event,
    play('claw',{source:{energy:0,burn:7,shield:2}}).event,
  ];
  const fields={strike:['damage','absorbed'],shock:['shockDamage','shockAbsorbed'],reaction:['reactionDamage',null],counter:['counterDamage','counterAbsorbed'],burn:['burnDamage','burnAbsorbed'],poison:['poisonDamage','poisonAbsorbed'],fatigue:['fatigue',null]};
  for(const event of fixtures)for(const [kind,[damageField,shieldField]] of Object.entries(fields)){
    const impacts=event.impacts.filter(impact=>impact.kind===kind);
    assert.equal(impacts.reduce((sum,impact)=>sum+impact.damage,0),event[damageField]||0,`${event.cardId}: ${damageField}`);
    if(shieldField)assert.equal(impacts.reduce((sum,impact)=>sum+impact.absorbed,0),event[shieldField]||0,`${event.cardId}: ${shieldField}`);
    assert.ok(impacts.every(impact=>Object.keys(impact).sort().join(',')==='absorbed,damage,kind,rawDamage'));
  }
  const ordinary=fixtures[0];
  assert.deepEqual(ordinary.impacts.map(impact=>impact.kind),['strike','strike','counter','shock']);
  assert.equal(impactBeats(ordinary).length,ordinary.impacts.length,'aggregate strike fallback is not repeated');
});

test('reduced-motion totals combine all real strikes, counters and status damage per target',()=>{
  const {event}=play('pounce',{source:{form:'wolf',combo:2,shield:2,energy:1,draw:[]},target:{form:'bear',shield:10,shock:3}});
  const beats=impactBeats(event,presentationTiming(4,true).impactGap);
  assert.deepEqual(beats.map(beat=>beat.kind),['strike','strike','strike','counter','shock']);
  assert.deepEqual(impactTotals(beats),[{target:'enemy',damage:17,absorbed:10},{target:'player',damage:3,absorbed:2}]);
  assert.equal(beats.every(beat=>beat.delay===0),true);
});

test('impact totals preserve shield-only results and never mutate the input beats',()=>{
  const {event}=play('claw',{source:{shield:8},target:{form:'bear',shield:10}});
  const beats=Object.freeze(impactBeats(event,0).map(beat=>Object.freeze(beat))),before=structuredClone(beats);
  const totals=impactTotals(beats);
  assert.deepEqual(totals,[{target:'enemy',damage:0,absorbed:6},{target:'player',damage:0,absorbed:3}]);
  assert.deepEqual(beats,before);
  totals[0].absorbed=999;assert.deepEqual(beats,before,'returned totals share no mutable records with the beats');
  assert.deepEqual(impactTotals([]),[]);
});

test('sequential health accounting matches multi-hit, counter, status and actual healing on both sides',()=>{
  const covered=new Set();
  for(const actor of ['player','enemy']){
    const fixtures=[
      play('pounce',{actor,target:{shield:5,hp:70}}),
      play('pounce',{actor,source:{form:'wolf',combo:2,focus:3},target:{hp:2}}),
      play('pounce',{actor,source:{shield:2,energy:1,draw:[]},target:{form:'bear',shield:10,shock:3}}),
      play('kindle',{actor,source:{form:'wyvern',hp:40,energy:1,draw:[]},target:{poison:4,shock:5}}),
      play('kindle',{actor,source:{form:'wyvern',hp:69},target:{hp:3,poison:4,shock:5}}),
      play('moonwell',{actor,source:{hp:65,energy:4,draw:[]},target:{shock:3}}),
      play('claw',{actor,source:{hp:2,energy:0,burn:5,shield:1}}),
    ];
    for(const [index,{before,event,state}] of fixtures.entries()){
      verifyHealthTimeline(before,event,state,`${actor} fixture ${index}`);
      for(const impact of event.impacts)covered.add(impact.kind);
      if(event.heal)covered.add('heal');if(event.reactionHeal)covered.add('reactionHeal');
    }
    const poisonState=battle(),other=actor==='player'?'enemy':'player';
    poisonState.battle.actor=actor;
    Object.assign(poisonState.battle[actor],{draw:[],discard:[],poison:5,shield:6});
    const poisonBefore=healthSnapshot(poisonState.battle),poisonEvent=stepBattle(poisonState);
    verifyHealthTimeline(poisonBefore,poisonEvent,poisonState,`${actor} shuffle poison`);covered.add('poison');
    const tired=battle();tired.battle.actor=actor;tired.battle.turn=43;
    Object.assign(tired.battle[actor],{hp:1,draw:[{uid:'presentation-card',id:'claw',tier:1,charge:0}],energy:1});
    Object.assign(tired.battle[other],{hp:70,shield:10,form:'druid'});
    const tiredBefore=healthSnapshot(tired.battle),tiredEvent=stepBattle(tired);
    verifyHealthTimeline(tiredBefore,tiredEvent,tired,`${actor} lethal fatigue`);covered.add('fatigue');
  }
  assert.deepEqual([...covered].sort(),['burn','counter','fatigue','heal','poison','reaction','reactionHeal','shock','strike']);
});

test('health presentation reaches the exact saved health after every step of eight natural campaigns',()=>{
  let combatSteps=0;
  for(const seed of [1,2,3,7,19,41,101,999]){
    const state=createRun(seed);let actions=0;
    while(!['won','lost'].includes(state.phase)&&actions++<3000){
      if(state.phase==='draft')chooseDraft(state,state.draft.offers[0].uid);
      else if(state.phase==='explore')chooseEncounter(state,state.exploration.offers[0].uid);
      else if(state.phase==='camp')startBattle(state);
      else if(state.phase==='reward')chooseReward(state,state.rewards[0].id);
      else {
        const before=healthSnapshot(state.battle),event=stepBattle(state);
        verifyHealthTimeline(before,event,state,`seed ${seed}, turn ${event.turn}, card ${event.turnCard}`);combatSteps++;
      }
    }
    assert.ok(['won','lost'].includes(state.phase),`seed ${seed} campaign finishes`);
  }
  assert.ok(combatSteps>200,'the comparison covers sustained natural combat');
});

test('presentation planning leaves battle, event and future rule results unchanged',()=>{
  const state=battle(14);
  for(let step=0;state.phase==='battle'&&step<40;step++){
    const event=stepBattle(state),saved=serialize(state),eventBefore=structuredClone(event);
    const timings=[1,2,4].map(speed=>presentationTiming(speed));
    for(const timing of timings)impactTotals(impactBeats(event,timing.impactGap));
    if(event.cardId)effectKind(describeCard(event.cardId));
    assert.equal(serialize(state),saved);assert.deepEqual(event,eventBefore);
    const restored=restoreRun(saved);assert.ok(restored);
    const next=structuredClone(state);
    assert.deepEqual(stepBattle(next),stepBattle(restored));assert.equal(serialize(next),serialize(restored));
  }
});
