import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS,createRun,activeDeck,enemyDeck,chooseDraft,chooseEncounter,buyCard,editDeck,upgradeAll,setSticker,startBattle,stepBattle,chooseReward,serialize,restoreRun} from '../rules.mjs';

function resolveDraft(state) {
  while(state.phase==='draft')assert.equal(chooseDraft(state,state.draft.offers[0].uid).ok,true);
}
function resolveExploration(state) {
  const offer=state.exploration.offers.find(item=>item.eventId==='spring')||state.exploration.offers[0];
  assert.equal(chooseEncounter(state,offer.uid).ok,true);resolveDraft(state);
}
function camp(seed=1) {
  const state=createRun(seed);resolveDraft(state);resolveExploration(state);
  assert.equal(state.phase,'camp');return state;
}
const identity=card=>({uid:card.uid,id:card.id,tier:card.tier,sticker:card.sticker});
const identities=cards=>cards.map(identity).sort((a,b)=>a.uid.localeCompare(b.uid));
function assertZones(state,label='') {
  for(const actor of ['player','enemy']){
    const fighter=state.battle[actor],cards=[...fighter.draw,...fighter.discard];
    const original=actor==='player'?activeDeck(state):enemyDeck(state);
    assert.equal(new Set(cards.map(card=>card.uid)).size,cards.length,`${label}: ${actor} has one zone per UID`);
    assert.deepEqual(identities(cards),identities(original),`${label}: ${actor} preserves every original instance`);
  }
}

test('two copies with the same card id remain distinct instances across both zones',()=>{
  const state=camp(1),twins=activeDeck(state).filter(card=>card.id==='harry');
  assert.equal(twins.length,2);assert.notEqual(twins[0].uid,twins[1].uid);
  assert.equal(setSticker(state,twins[0].uid,'top').ok,true);
  assert.equal(startBattle(state).ok,true);assertZones(state);
  const played=stepBattle(state);assert.equal(played.uid,twins[0].uid);
  assert.equal(state.battle.player.discard.some(card=>card.uid===twins[0].uid),true);
  assert.equal(state.battle.player.draw.some(card=>card.uid===twins[1].uid),true);
  assertZones(state);assert.ok(restoreRun(serialize(state)));
});

test('six natural campaigns preserve the exact player and enemy instances after every action',()=>{
  let checkedActions=0,checkedBattles=0;
  for(const seed of [1,2,3,7,19,41]){
    const state=createRun(seed);let decisions=0;
    while(!['won','lost'].includes(state.phase)){
      assert.ok(++decisions<80,`seed ${seed}: finite campaign`);
      if(state.phase==='draft')resolveDraft(state);
      else if(state.phase==='explore')resolveExploration(state);
      else if(state.phase==='camp'){
        for(const offer of [...state.shop])if(state.gold>=offer.price&&['bark','mend','sap','pounce'].includes(offer.id)){
          const purchase=buyCard(state,offer.uid);assert.equal(purchase.ok,true);
          if(activeDeck(state).length<12)assert.equal(editDeck(state,purchase.card.uid,true).ok,true);
        }
        assert.equal(upgradeAll(state).ok,true);assert.equal(startBattle(state).ok,true);checkedBattles++;
        assertZones(state,`seed ${seed}, opening`);
        let actions=0;
        while(state.phase==='battle'){
          assert.ok(++actions<2000,`seed ${seed}: finite battle`);
          stepBattle(state);checkedActions++;
          assertZones(state,`seed ${seed}, action ${actions}`);
        }
      }else if(state.phase==='reward')assert.equal(chooseReward(state,state.rewards[0].id).ok,true);
      else assert.fail(`Unexpected phase ${state.phase}`);
    }
  }
  assert.ok(checkedBattles>=6);assert.ok(checkedActions>100);
});

test('save restoration rejects duplicate or missing instances and impossible charge values',()=>{
  const state=camp();assert.equal(startBattle(state).ok,true);assert.ok(restoreRun(serialize(state)));
  const corruptions=[
    s=>{s.battle.player.discard.push({...s.battle.player.draw[0]});},
    s=>{s.battle.player.draw.pop();},
    s=>{s.battle.enemy.draw[1].uid=s.battle.enemy.draw[0].uid;},
    s=>{s.battle.enemy.draw[0].uid='unknown-instance';},
    s=>{const card=s.battle.player.draw.find(card=>CARDS[card.id].cost>0);card.charge=CARDS[card.id].cost+1;},
    s=>{s.battle.enemy.draw[0].charge=-1;},
  ];
  for(const [index,corrupt] of corruptions.entries()){
    const broken=structuredClone(state);corrupt(broken);
    assert.equal(restoreRun(serialize(broken)),null,`corruption ${index} is rejected`);
  }
});

test('seeded reshuffles retain partial charge and restored saves produce the same next action',()=>{
  const state=camp();
  // Passive fixtures let the same high-cost card circulate without forcing HP or turns.
  state.collection.forEach((card,index)=>{card.id=index===0?'ancient':'bark';card.sticker=index===0?'top':'none';});
  state.opponent.deck.forEach(card=>{card.id='bark';});
  const copy=restoreRun(serialize(state));assert.ok(copy);
  assert.equal(startBattle(state).ok,true);assert.equal(startBattle(copy).ok,true);
  assert.deepEqual(state.battle.player.draw.map(card=>card.uid),copy.battle.player.draw.map(card=>card.uid));
  assert.equal(serialize(copy),serialize(state));
  const uid=activeDeck(state)[0].uid;let partial=0,shuffles=0,resumed=false;
  for(let action=0;action<600&&!resumed;action++){
    assert.equal(state.phase,'battle');const replay=restoreRun(serialize(state));assert.ok(replay);
    const event=stepBattle(state);assert.deepEqual(stepBattle(replay),event);
    assert.equal(serialize(replay),serialize(state),'RNG state and subsequent mutations survive restoration');
    assertZones(state,`partial-charge action ${action}`);
    if(event.actor!=='player')continue;
    if(event.type==='shuffle'){
      shuffles++;
      if(partial)assert.equal(state.battle.player.draw.find(card=>card.uid===uid).charge,partial);
    }
    if(event.uid!==uid)continue;
    if(event.type==='charge'){
      assert.ok(event.charged>0&&event.charged<CARDS.ancient.cost);partial=event.charged;
      assert.equal(state.battle.player.discard.find(card=>card.uid===uid).charge,partial);
    }else if(partial){
      assert.equal(event.energySpent,CARDS.ancient.cost-partial);
      assert.equal(state.battle.player.discard.find(card=>card.uid===uid).charge,0);resumed=true;
    }
  }
  assert.ok(partial>0,'fixture reaches a genuine incomplete charge');
  assert.ok(shuffles>=2,'the charged instance returns through reshuffling');
  assert.equal(resumed,true,'only the missing charge is paid on its later successful use');
});
