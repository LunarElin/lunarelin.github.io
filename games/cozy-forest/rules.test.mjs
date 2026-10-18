import test from 'node:test';
import assert from 'node:assert/strict';
import {ANIMALS,ITEMS,LESSONS,createGame,available,isOpen,pick,tick,validSave,random} from './rules.mjs';

function conserved(state) {
  const all=[...state.board,...state.tray],animals=all.filter(t=>!t.item);
  assert.equal(animals.length+state.saved,state.total);
  assert.equal(new Set(all.map(t=>t.id)).size,all.length);
  assert.ok(state.tray.every(t=>!t.item));
  for(let type=0;type<ANIMALS.length;type++) assert.equal(animals.filter(t=>t.type===type).length%3,0);
  if(state.status==='playing') assert.equal(all.filter(t=>t.item).length+state.itemsCollected,state.itemsTotal);
}
function solve(state) {
  let moves=0;
  while(state.status==='playing'&&moves++<300) {
    const id=state.solution.find(id=>state.board.some(t=>t.id===id));
    assert.equal(pick(state,id).ok,true,`blocked ${id} at stage ${state.level}`);conserved(state);
    assert.notEqual(state.status,'lost');
  }
  assert.equal(state.status,'won');assert.equal(state.saved,state.total);
}
function collect(state,item) {
  const tile=state.board.find(t=>t.item===item);assert.ok(tile);
  const result=pick(state,tile.id);assert.equal(result.ok,true);return result;
}
function fixture(ids=[]) {
  const state=createGame({level:20,seed:71});
  state.board=Array.from({length:24},(_,id)=>({id,type:Math.floor(id/3),x:id%6,y:Math.floor(id/6),z:0}));
  state.total=24;state.itemsTotal=1;state.board.push({id:24,type:null,item:'shuffle',x:0,y:0,z:6});
  state.solution=state.board.map(t=>t.id);
  for(const id of ids) pick(state,id);
  return state;
}
test('1,000 generated stages including real item effects have a legal winning route',()=>{
  for(let level=1;level<=1000;level++) {
    const state=createGame({level,seed:level*7919});assert.equal(validSave(state),true);
    assert.ok(state.board.some(t=>t.item));solve(state);
  }
  assert.deepEqual(createGame({seed:2026}),createGame({seed:2026}));
});
test('covered animal and item inputs, invalid ids, and post-game inputs never mutate state',()=>{
  const state=createGame({level:12,seed:6}),covered=state.board.find(t=>!isOpen(state.board,t));assert.ok(covered);
  const before=structuredClone(state);assert.equal(pick(state,covered.id).ok,false);assert.equal(pick(state,-1).ok,false);assert.deepEqual(state,before);
  const item=state.board.find(t=>t.item);const blocker={id:999,type:0,x:item.x,y:item.y,z:item.z+1};state.board.push(blocker);
  const blocked=structuredClone(state);assert.equal(pick(state,item.id).ok,false);assert.deepEqual(state,blocked);state.board.pop();
  solve(state);const won=structuredClone(state);assert.equal(pick(state,0).ok,false);assert.deepEqual(state,won);
});
test('third animal matches before capacity check; a full mixed tray loses',()=>{
  const state=fixture();state.board=state.board.filter(t=>!t.item);state.itemsTotal=0;
  for(const id of [0,1,3,4,6,7]) pick(state,id);
  assert.equal(state.tray.length,6);assert.equal(pick(state,2).match,true);assert.equal(state.status,'playing');assert.equal(state.tray.length,4);
  const full=fixture();for(const id of [1,2,3,4,6,7,9]) pick(full,id);
  assert.equal(full.status,'lost');conserved(full);
});
test('all five board items fire instantly without taking a basket slot',()=>{
  for(let lesson=1;lesson<LESSONS.length;lesson++) {
    const state=createGame({mode:'tutorial',lesson,seed:lesson+30}),item=LESSONS[lesson].item;
    const before={time:state.time,tray:state.tray.length,board:state.board.length};
    const result=collect(state,item);
    assert.equal(result.itemPickup,true);assert.equal(state.used[item],1);assert.equal(state.itemsCollected,1);conserved(state);
    if(item==='magnet') assert.equal(state.saved,3);
    if(item==='basket') {assert.equal(state.tray.length,0);assert.ok(state.board.length>before.board);}
    if(item==='shuffle') assert.equal(state.shuffles,1);
    if(item==='freeze') {const time=state.time;tick(state,1);assert.equal(state.time,time);assert.equal(state.frozen,14);}
    if(item==='fever') {assert.equal(state.fever,12);const time=state.time;tick(state,1);assert.equal(state.time,time);}
    assert.ok(state.tray.length<=before.tray);solve(state);
  }
});
test('empty rescue basket gives five seconds instead of wasting a board item',()=>{
  const state=createGame({mode:'tutorial',lesson:4,seed:8});
  const tray=state.tray.slice();state.tray=[];state.board.push(...tray.map(t=>({...t,z:8})));
  const item=state.board.find(t=>t.item);item.z=10;
  const time=state.time;assert.equal(collect(state,'basket').timeBonus,5);assert.equal(state.time,time+5);conserved(state);
});
test('shuffle prioritizes an existing pair with one slot; six singles free one slot',()=>{
  const pair=fixture([1,2,3,6,9,12]);collect(pair,'shuffle');
  assert.equal(pair.board.find(t=>t.id===pair.solution[0]).type,0);solve(pair);
  const singles=fixture([1,3,6,9,12,15]);const result=collect(singles,'shuffle');
  assert.equal(result.rescuedSlot,true);assert.equal(singles.tray.length,5);solve(singles);
});
test('150 shuffled boards after arbitrary selections still have a winning route',()=>{
  for(let seed=1;seed<=150;seed++) {
    const state=fixture(),rng=random(seed);state.seed=seed;
    for(let i=0;i<5;i++) {const open=available(state).filter(t=>!t.item);pick(state,open[Math.floor(rng()*open.length)].id);}
    collect(state,'shuffle');conserved(state);solve(state);
  }
});
test('four matches trigger fever, double scores accumulate, and time is protected',()=>{
  const state=fixture();state.board=state.board.filter(t=>!t.item);state.itemsTotal=0;
  for(let id=0;id<12;id++) pick(state,id);
  assert.equal(state.combo,4);assert.equal(state.fever,12);assert.equal(state.feverScore,0);
  let result;for(let id=12;id<15;id++) result=pick(state,id);
  assert.equal(result.multiplier,2);assert.equal(result.points,(300+4*60)*2);assert.equal(state.feverScore,result.points);assert.equal(result.timeBonus,2);
  const time=state.time;for(let i=0;i<12;i++) tick(state,1);assert.equal(state.fever,0);assert.equal(state.time,time);
  tick(state,1);assert.equal(state.time,time-1);assert.equal(state.combo,0);
  state.time=.5;tick(state,1);assert.equal(state.status,'lost');
});
test('school requires collecting its real board item even if all animals are rescued',()=>{
  const state=createGame({mode:'tutorial',lesson:3,seed:1}),item=state.board.find(t=>t.item);
  state.board=[item];state.tray=[];state.saved=state.total;
  assert.equal(state.status,'playing');collect(state,'freeze');assert.equal(state.status,'won');assert.equal(state.used.freeze,1);
  const calm=createGame({mode:'tutorial'});calm.time=.1;tick(calm,1);assert.equal(calm.time,60);assert.equal(calm.status,'playing');
});
test('six lessons are solvable and item tiles never alter animal totals',()=>{
  assert.equal(ITEMS.length,5);assert.equal(LESSONS.length,6);
  for(let lesson=0;lesson<LESSONS.length;lesson++) {const state=createGame({mode:'tutorial',lesson,seed:lesson+70});assert.equal(state.total,18);conserved(state);solve(state);if(lesson) assert.ok(state.used[LESSONS[lesson].item]);}
});
test('save validation accepts mixed boards and rejects corrupt tiles or legacy rounds',()=>{
  const state=createGame({level:10,seed:123});assert.equal(validSave(JSON.parse(JSON.stringify(state))),true);
  for(const changes of [{version:1},{time:NaN},{capacity:99},{board:null},{board:[null]},{tray:[null]},{solution:null},{mode:'bad'},{lesson:999},{score:-10},{used:{bogus:1}}]) assert.equal(validSave({...state,...changes}),false);
  const duplicate=structuredClone(state);duplicate.board[1].id=duplicate.board[0].id;assert.equal(validSave(duplicate),false);
  const badItem=structuredClone(state);badItem.board.find(t=>t.item).item='unknown';assert.equal(validSave(badItem),false);
});
