import test from 'node:test';
import assert from 'node:assert/strict';
import {ANIMALS,ITEMS,LESSONS,createGame,available,isOpen,pick,useItem,tick,validSave,random} from './rules.mjs';

function conserved(state) {
  const all=[...state.board,...state.tray];
  assert.equal(all.length+state.saved,state.total);
  assert.equal(new Set(all.map(t=>t.id)).size,all.length);
  for(let type=0;type<ANIMALS.length;type++) assert.equal(all.filter(t=>t.type===type).length%3,0);
}
function solve(state,order=state.solution) {
  for(const id of order) {
    if(!state.board.some(t=>t.id===id)) continue;
    assert.equal(pick(state,id).ok,true,`blocked tile ${id} at level ${state.level}`);conserved(state);
    assert.notEqual(state.status,'lost');
  }
  assert.equal(state.status,'won');assert.equal(state.saved,state.total);
}
test('1,000 generated stages have a complete legal solution; seeds reproduce',()=>{
  for(let level=1;level<=1000;level++) {
    const state=createGame({level,seed:level*7919});assert.equal(validSave(state),true);solve(state);
  }
  assert.deepEqual(createGame({seed:2026}),createGame({seed:2026}));
});
test('covered, missing and post-game selections never mutate a game',()=>{
  const state=createGame({seed:7}),covered=state.board.find(t=>!isOpen(state.board,t));assert.ok(covered);
  const before=structuredClone(state);assert.equal(pick(state,covered.id).ok,false);assert.equal(pick(state,-1).ok,false);assert.deepEqual(state,before);
  solve(state);const won=structuredClone(state);assert.equal(pick(state,0).ok,false);assert.deepEqual(state,won);
});
test('third animal clears before capacity is checked; a full mixed tray loses',()=>{
  const state=createGame({seed:9});state.board=Array.from({length:9},(_,id)=>({id,type:Math.floor(id/3),x:id%6,y:Math.floor(id/6),z:0}));state.total=9;
  state.capacity=7;
  for(const id of [0,1,3,4,6,7]) assert.equal(pick(state,id).ok,true);
  assert.equal(state.tray.length,6);assert.equal(pick(state,2).match,true);assert.equal(state.status,'playing');assert.equal(state.tray.length,4);
  const full=createGame({seed:8});full.board=Array.from({length:12},(_,id)=>({id,type:Math.floor(id/3),x:id%6,y:Math.floor(id/6),z:0}));full.total=12;
  for(const id of [0,1,3,4,6,7,9]) pick(full,id);
  assert.equal(full.status,'lost');conserved(full);
});
test('all ten items work and preserve animal counts',()=>{
  for(const item of ITEMS) {
    const state=createGame({seed:12});
    if(['undo','basket','shuffle','magnet'].includes(item.id)) pick(state,available(state)[0].id);
    const before={time:state.time,capacity:state.capacity,board:state.board.length,tray:state.tray.length};
    const result=useItem(state,item.id,item.id==='hammer'?available(state)[0].id:null);
    assert.equal(result.ok,true,item.id);assert.equal(state.used[item.id],1);conserved(state);
    if(item.id==='undo'||item.id==='basket') {assert.equal(state.tray.length,0);assert.ok(state.board.length>before.board);}
    if(item.id==='magnet'||item.id==='hammer') assert.equal(state.saved,3);
    if(item.id==='time') assert.equal(state.time,before.time+30);
    if(item.id==='slot') assert.equal(state.capacity,before.capacity+1);
    if(item.id==='freeze') {const time=state.time;tick(state,1);assert.equal(state.time,time);assert.equal(state.frozen,14);}
    if(item.id==='fever') {assert.equal(state.fever,12);const time=state.time;tick(state,1);assert.equal(state.time,time);}
    if(item.id==='hint') assert.ok(state.hints.length&&state.hints.every(id=>available(state).some(t=>t.id===id)));
    if(item.id==='shuffle') solve(state);
  }
});
test('invalid item use consumes nothing and slot capacity stops at ten',()=>{
  const state=createGame({seed:4}),before=structuredClone(state);
  for(const item of ['undo','basket','unknown','hammer']) assert.equal(useItem(state,item).ok,false);
  assert.deepEqual(state,before);
  for(let i=0;i<3;i++) assert.equal(useItem(state,'slot').ok,true);
  assert.equal(useItem(state,'slot').ok,false);assert.equal(state.capacity,10);assert.equal(state.used.slot,3);
});
test('four quick matches trigger fever; combo, double points, freeze and expiry',()=>{
  const state=createGame({level:5,seed:1});
  for(const id of state.solution.slice(0,12)) pick(state,id);
  assert.equal(state.combo,4);assert.equal(state.fever,12);assert.equal(state.charge,0);
  let result;for(const id of state.solution.slice(12,15)) result=pick(state,id);
  assert.equal(result.points,(300+4*60)*2);
  const time=state.time;for(let i=0;i<12;i++) tick(state,1);assert.equal(state.fever,0);assert.equal(state.time,time);
  tick(state,1);assert.equal(state.time,time-1);assert.equal(state.combo,0);
  state.time=.5;tick(state,1);assert.equal(state.status,'lost');
  const tutorial=createGame({mode:'tutorial'});tutorial.time=.5;tick(tutorial,1);assert.equal(tutorial.status,'playing');assert.equal(tutorial.time,60);
});
test('all eleven school lessons can use their item and finish',()=>{
  for(let lesson=0;lesson<LESSONS.length;lesson++) {
    const state=createGame({mode:'tutorial',lesson,seed:lesson+80});
    const item=LESSONS[lesson].item;
    if(item) assert.equal(useItem(state,item,item==='hammer'?available(state)[0].id:null).ok,true,item);
    conserved(state);
    // Rebuild a guaranteed legal route after effects that change the board or tray.
    if(state.status==='playing') {assert.equal(useItem(state,'shuffle').ok,true);solve(state);}
  }
});
test('shuffle with arbitrary tray contents still has a safe winning route',()=>{
  for(let seed=1;seed<=150;seed++) {
    const state=createGame({level:20,seed}),rng=random(seed);
    for(let i=0;i<5&&state.status==='playing';i++) {const open=available(state);pick(state,open[Math.floor(rng()*open.length)].id);}
    assert.equal(state.status,'playing');assert.equal(useItem(state,'shuffle').ok,true);conserved(state);solve(state);
  }
});
test('save validation rejects malformed and duplicate tiles',()=>{
  const state=createGame({seed:123});assert.equal(validSave(JSON.parse(JSON.stringify(state))),true);
  for(const changes of [{time:NaN},{capacity:99},{board:null},{history:null},{mode:'bad'},{lesson:999},{score:-10},{used:null}]) assert.equal(validSave({...state,...changes}),false);
  const duplicate=structuredClone(state);duplicate.board[1].id=duplicate.board[0].id;assert.equal(validSave(duplicate),false);
});
test('shuffle prioritizes an existing pair with only one free slot; singles require a rescue item',()=>{
  function fixture(ids) {
    const state=createGame({level:20,seed:71});state.board=Array.from({length:24},(_,id)=>({id,type:Math.floor(id/3),x:id%6,y:Math.floor(id/6),z:0}));state.total=24;
    for(const id of ids) pick(state,id);
    return state;
  }
  const pair=fixture([0,3,6,9,12,13]);assert.equal(useItem(pair,'shuffle').ok,true);
  assert.equal(pair.board.find(t=>t.id===pair.solution[0]).type,4);solve(pair);
  const singles=fixture([0,3,6,9,12,15]),before=structuredClone(singles);
  assert.equal(useItem(singles,'shuffle').reason,'crowded');assert.deepEqual(singles,before);
  assert.equal(useItem(singles,'magnet').ok,true);assert.equal(useItem(singles,'shuffle').ok,true);solve(singles);
});
