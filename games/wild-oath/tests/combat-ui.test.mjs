import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS,createRun,chooseDraft,chooseEncounter,startBattle,stepBattle,describeCard} from '../rules.mjs';
import {cardSymbols,visibleCardActor} from '../combat-ui.mjs';

// Independent, player-facing expectations: three entries are the real tier 1/2/3 values.
// Conditional bonuses belong in the detail view, rather than these unconditional counters.
const expectedCards={
  claw:[['피해',[6,9,12]]],
  bite:[['피해',[11,17,22]]],
  bark:[['보호막',[9,14,18]],['집중',[2,3,4]]],
  mend:[['회복',[6,9,12]]],
  sap:[['기력',[2,3,4]]],
  wolf:[['늑대 변신',['','','']],['기력',[1,2,3]]],
  bear:[['곰 변신',['','','']],['보호막',[6,9,12]]],
  wyvern:[['와이번 변신',['','','']],['맹독',[2,3,4]]],
  venom:[['피해',[4,6,8]],['맹독',[4,6,8]]],
  thorns:[['보호막',[7,11,14]],['화상',[2,3,4]]],
  storm:[['피해',[3,5,6]],['감전',[3,5,6]]],
  pounce:[['피해',[4,6,8],2]],
  ancient:[['피해',[24,36,48]]],
  moonwell:[['회복',[8,12,16]],['기력',[1,2,3]]],
  frost:[['피해',[5,8,10]],['보호막',[3,5,6]]],
  wildheart:[['보호막',[12,18,24]],['회복',[5,8,10]]],
  ember:[['피해',[2,3,4]],['화상',[4,6,8]]],
  nettle:[['피해',[3,5,6]],['맹독',[3,5,6]]],
  static:[['피해',[2,3,4]],['감전',[4,6,8]]],
  harvest:[['회복',[2,3,4]],['기력',[3,4,5]]],
  sprout:[['회복',[3,5,6]]],
  hide:[['보호막',[4,6,8]]],
  trample:[['피해',[16,24,32]],['보호막',[4,6,8]]],
  talon:[['피해',[9,14,18]],['보호막 관통',['','','']]],
  renewal:[['보호막',[5,8,10]],['회복',[10,15,20]]],
  kindle:[['기력',[1,2,3]],['화상',[2,3,4]]],
  rally:[['집중',[4,5,6]],['다음 카드 충전',[2,3,4]]],
  harry:[['피해',[7,11,14]],['상대 기력 감소',[2,3,4]]],
};

function deepFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.values(value).forEach(deepFreeze);Object.freeze(value);
  }
  return value;
}

test('all 28 cards show the correct unconditional values and accessible labels at all three tiers',()=>{
  assert.deepEqual(Object.keys(expectedCards).sort(),Object.keys(CARDS).sort());
  for(const [id,expected] of Object.entries(expectedCards))for(const tier of [1,2,3]){
    const card=deepFreeze(describeCard({id,tier})),before=structuredClone(card);
    const symbols=cardSymbols(card);
    assert.deepEqual(symbols.map(({label,value})=>({label,value})),expected.map(([label,tiers,hits])=>({
      label:`${label}${tiers[tier-1]!==''?` ${tiers[tier-1]}`:''}${hits?`, ${hits}회`:''}`,
      value:`${tiers[tier-1]}${hits?`×${hits}`:''}`,
    })),`${id}, tier ${tier}`);
    assert.ok(symbols.every(symbol=>typeof symbol.icon==='string'&&symbol.icon.length>0),`${id}: every counter has a visual symbol`);
    assert.deepEqual(card,before,`${id}: showing a card does not change its rules or detail data`);
  }
});

test('multihit shows damage per hit and count, without claiming conditional or form bonus damage',()=>{
  for(const tier of [1,2,3]){
    const hits=cardSymbols(describeCard({id:'pounce',tier}));
    assert.equal(hits.length,1);
    assert.match(hits[0].value,/×2$/);
    assert.match(hits[0].label,/, 2회$/);
    // Focus multiplication, shield bonus, poison bonus, bonus shock and bonus energy
    // are conditional. Exact tables above deliberately exclude each of these extras.
    for(const id of ['ancient','bite','venom','storm','harvest']){
      assert.equal(cardSymbols(describeCard({id,tier})).length,expectedCards[id].length,id);
    }
  }
});

test('energy, next-card charge, enemy energy drain and piercing remain distinct affordances',()=>{
  const supplied=cardSymbols(describeCard('sap')).find(item=>item.label==='기력 2');
  const next=cardSymbols(describeCard('rally')).find(item=>item.label==='다음 카드 충전 2');
  const drain=cardSymbols(describeCard('harry')).find(item=>item.label==='상대 기력 감소 2');
  assert.ok(supplied&&next&&drain);
  assert.notEqual(next.icon,supplied.icon,'charging a card is not gaining spendable energy');
  assert.notEqual(drain.icon,supplied.icon,'enemy loss is not self energy gain');
  assert.equal(cardSymbols(describeCard('rally')).some(item=>item.label.startsWith('기력 ')),false);
  assert.deepEqual(cardSymbols(describeCard('talon')).find(item=>item.label==='보호막 관통'),{icon:'pierce',label:'보호막 관통',value:''});
  assert.equal(cardSymbols(describeCard('claw')).some(item=>item.icon==='pierce'),false,'wyvern can grant piercing later; the ordinary claw does not claim it unconditionally');
});

test('presentation ownership covers preview, insufficient charge, successful cards and shuffle on both sides',()=>{
  for(const actor of ['player','enemy'])for(const event of [
    {actor,cardId:'claw',preview:true,ready:true},
    {actor,cardId:'ancient',preview:true,ready:false},
    {actor,cardId:'ancient',type:'charge',turnEnded:true},
    {actor,cardId:'pounce',type:'card',turnEnded:false},
    {actor,type:'shuffle',turnEnded:true},
  ]){
    const next=actor==='player'?'enemy':'player',before=structuredClone(event);
    deepFreeze(event);
    assert.equal(visibleCardActor(next,event),actor,'the card in flight owns the lane even after the next turn has been committed');
    assert.deepEqual(event,before);
    assert.equal(visibleCardActor(next,null),next,'clearing the presentation hands the lane to the next rule actor');
  }
  assert.equal(visibleCardActor('player'),'player');
  assert.equal(visibleCardActor('enemy',{}),'enemy');
  assert.equal(visibleCardActor('player',{actor:'unknown'}),'player');
});

test('a real turn-ending rule event retains its actor during the final impact without replaying rules',()=>{
  const state=createRun(31);
  while(state.phase==='draft')chooseDraft(state,state.draft.offers[0].uid);
  chooseEncounter(state,state.exploration.offers[0].uid);
  while(state.phase==='draft')chooseDraft(state,state.draft.offers[0].uid);
  assert.equal(startBattle(state).ok,true);
  let observed=0;
  while(state.phase==='battle'&&observed<6){
    const event=stepBattle(state);
    if(!event.turnEnded||state.phase!=='battle')continue;
    assert.notEqual(event.actor,state.battle.actor,'the rule engine has already advanced its actor');
    const before=structuredClone(state);
    assert.equal(visibleCardActor(state.battle.actor,event),event.actor);
    assert.equal(visibleCardActor(state.battle.actor),state.battle.actor);
    assert.deepEqual(state,before,'presentation ownership is read-only');
    observed++;
  }
  assert.equal(observed,6,'exercise repeated natural turn handoffs');
});
