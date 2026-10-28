import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDeck} from '../deck-analysis.mjs';
import {createRun,chooseDraft,chooseEncounter,activeDeck,enemyDeck,startBattle,serialize} from '../rules.mjs';

const deckOf=ids=>ids.map((id,index)=>({uid:`c${index+1}`,id,tier:index%3+1,inDeck:true,sticker:'none'}));

test('cost distribution counts individual copies and includes all expensive cards',()=>{
  const deck=deckOf(['wolf','sap','rally','frost','moonwell','wildheart','ancient','hide','kindle','renewal','frost']);
  const result=analyzeDeck(deck,12);
  assert.equal(result.size,11);
  assert.deepEqual(result.costs,[4,3,2,2]);
  assert.equal(result.totalCost,14);
  assert.equal(result.averageCost,14/11);
});

test('roles use actual effects and keep energy supply distinct from next-card charging',()=>{
  const result=analyzeDeck(deckOf(['wolf','sap','rally','frost','moonwell','wildheart','ancient','hide','kindle','renewal']));
  assert.deepEqual(result.roles,{attack:2,shield:4,heal:3,energy:4,charge:1});
  assert.deepEqual(analyzeDeck(deckOf(['rally'])).roles,{attack:0,shield:0,heal:0,energy:0,charge:1});
});

test('sorting information preserves the marked upgraded copy without exposing mutable state',()=>{
  const deck=deckOf(['claw','claw','mend']);deck[1].sticker='top';deck[2].sticker='bottom';
  const saved=JSON.stringify(deck),result=analyzeDeck(deck,3);
  assert.deepEqual(result.top,{uid:'c2',id:'claw',tier:2});
  assert.deepEqual(result.bottom,{uid:'c3',id:'mend',tier:3});
  result.top.id='ancient';result.costs[0]=99;
  assert.equal(JSON.stringify(deck),saved);
});

test('initiative matches real battles and equal deck sizes favor the player',()=>{
  const state=createRun(41);
  while(state.phase==='draft')chooseDraft(state,state.draft.offers[0].uid);
  chooseEncounter(state,state.exploration.offers[0].uid);
  while(state.phase==='draft')chooseDraft(state,state.draft.offers[0].uid);
  const before=serialize(state),analysis=analyzeDeck(activeDeck(state),enemyDeck(state).length);
  assert.equal(serialize(state),before);
  startBattle(state);assert.equal(analysis.firstActor,state.battle.actor);
  const deck=deckOf(['claw','mend','bark','sap','wolf','ancient']);
  assert.equal(analyzeDeck(deck,6).firstActor,'player');
  assert.equal(analyzeDeck(deck,7).firstActor,'enemy');
  assert.equal(analyzeDeck(deck,5).firstActor,'player');
});

test('empty and unmarked decks have explicit zero counts without NaN or invented initiative',()=>{
  const empty=analyzeDeck([]);
  assert.equal(empty.averageCost,0);assert.deepEqual(empty.costs,[0,0,0,0]);
  assert.equal(empty.top,null);assert.equal(empty.bottom,null);assert.equal(empty.firstActor,null);
  const deck=analyzeDeck(deckOf(['claw','claw']));
  assert.equal(deck.top,null);assert.equal(deck.bottom,null);assert.equal(deck.opponentSize,null);
});
