import test from 'node:test';
import assert from 'node:assert/strict';
import {ANIMALS,ITEMS,LESSONS,FEVER_SECONDS,FEVER_MAX,createGame,available,isOpen,pick,tick,validSave,random} from './rules.mjs';

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
    if(item==='fever') {assert.equal(state.fever,FEVER_SECONDS);const time=state.time;tick(state,1);assert.equal(state.time,time);}
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
  assert.equal(state.combo,4);assert.equal(state.fever,FEVER_SECONDS);assert.equal(state.feverScore,0);
  let result;for(let id=12;id<15;id++) result=pick(state,id);
  assert.equal(result.multiplier,2);assert.equal(result.points,(300+4*60)*2);assert.equal(state.feverScore,result.points);assert.equal(result.timeBonus,0);
  const time=state.time;for(let i=0;i<FEVER_SECONDS+2;i++) tick(state,1);assert.equal(state.fever,0);assert.equal(state.time,time);
  tick(state,1);assert.equal(state.time,time-1);assert.equal(state.combo,0);
  state.time=.5;tick(state,1);assert.equal(state.status,'lost');
});
test('school requires collecting its real board item even if all animals are rescued',()=>{
  const state=createGame({mode:'tutorial',lesson:3,seed:1}),item=state.board.find(t=>t.item);
  state.board=[item];state.tray=[];state.saved=state.total;
  assert.equal(state.status,'playing');collect(state,'freeze');assert.equal(state.status,'won');assert.equal(state.used.freeze,1);
  const calm=createGame({mode:'tutorial'});calm.time=.1;tick(calm,1);assert.equal(calm.time,60);assert.equal(calm.status,'playing');
});

test('late difficulty grows gradually and keeps a search-time floor',()=>{
  const stages=[1,4,7,10,13,16].map(level=>createGame({level,seed:81}));
  assert.deepEqual(stages.map(s=>s.total),[30,36,42,48,54,60]);
  assert.equal(new Set(createGame({level:13,seed:81}).board.filter(t=>!t.item).map(t=>t.type)).size,7);
  assert.equal(new Set(createGame({level:17,seed:81}).board.filter(t=>!t.item).map(t=>t.type)).size,8);
  assert.equal(createGame({level:20}).time,204);assert.equal(createGame({level:50}).time,197);
  assert.equal(createGame({level:1000}).time,197);
});

test('five basket animals reveal one existing rescue item without auto-using it',()=>{
  const s=fixture();s.board.find(t=>t.id===0).z=8;
  const item=s.board.find(t=>t.item);item.item='magnet';
  assert.equal(isOpen(s.board,item),false);
  for(const id of [1,3,6,9]) pick(s,id);
  assert.equal(isOpen(s.board,item),false);
  const before={score:s.score,total:s.total,items:s.itemsTotal,count:s.board.length};
  const result=pick(s,12);
  assert.equal(result.itemRevealed,'magnet');assert.equal(isOpen(s.board,item),true);
  assert.equal(s.solution[0],item.id);assert.equal(s.score,before.score);assert.equal(s.itemsCollected,0);
  assert.equal(s.itemsTotal,before.items);assert.equal(s.board.length,before.count-1);conserved(s);
  assert.equal(validSave(JSON.parse(JSON.stringify(s))),true);
  assert.equal(collect(s,'magnet').match,true);assert.equal(s.used.magnet,1);conserved(s);
  const open=fixture();for(const id of [1,3,6,9]) pick(open,id);
  assert.equal(pick(open,12).itemRevealed,null);
});

test('magnet clears a basket pair before the most recently selected singleton',()=>{
  const s=fixture([1,2,3]);s.board.find(t=>t.item).item='magnet';
  const result=collect(s,'magnet');assert.equal(result.type,0);assert.equal(s.tray.length,1);assert.equal(s.tray[0].type,1);conserved(s);
});

test('slow matches keep charge; fever extensions stop after six seconds',()=>{
  const s=fixture();s.board=s.board.filter(t=>!t.item);s.itemsTotal=0;
  for(let group=0;group<4;group++) {
    for(let i=0;i<3;i++) pick(s,group*3+i);
    if(group<3) {for(let second=0;second<12;second++) tick(s,1);assert.equal(s.charge,(group+1)*25);}
  }
  assert.equal(s.combo,1);assert.equal(s.fever,FEVER_SECONDS);
  let extension=0;
  for(let group=4;group<8;group++) for(let i=0;i<3;i++) {const result=pick(s,group*3+i);extension+=result.feverBonus||0;}
  assert.equal(extension,6);assert.equal(s.feverExtension,6);assert.equal(s.fever,22);
  const idle=fixture();idle.board=idle.board.filter(t=>!t.item);idle.itemsTotal=0;
  for(let id=0;id<12;id++) pick(idle,id);
  for(let i=0;i<9;i++) tick(idle,1);
  assert.equal(idle.combo,0);assert.equal(idle.fever,7);
});

test('star adds eight seconds during fever without erasing its score or extension budget',()=>{
  for(const [before,expected] of [[10,18],[23,FEVER_MAX]]) {
    const s=fixture();s.board.find(t=>t.item).item='fever';s.fever=before;s.feverScore=123;s.feverExtension=4;
    const result=collect(s,'fever');assert.equal(s.fever,expected);assert.equal(s.feverScore,323);
    assert.equal(s.feverExtension,4);assert.equal(result.feverBonus,expected-before);assert.ok(!result.feverStarted);conserved(s);
  }
});

test('snow clock waits through fever including fractional expiry',()=>{
  const s=fixture();s.fever=2.5;s.frozen=15;s.time=100;
  tick(s,1);tick(s,1);assert.equal(s.frozen,15);assert.equal(s.time,100);
  tick(s,1);assert.equal(s.fever,0);assert.equal(s.frozen,14.5);assert.equal(s.time,100);
  for(let i=0;i<14;i++) tick(s,1);
  tick(s,1);assert.equal(s.frozen,0);assert.equal(s.time,99.5);
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
  for(const changes of [{solution:[]},{solution:[1,1]},{total:0},{saved:.5},{fever:25},{charge:101},{itemsTotal:99}]) assert.equal(validSave({...state,...changes}),false);
  const empty={...state,board:[],tray:[],saved:state.total,itemsCollected:state.itemsTotal};assert.equal(validSave(empty),false);
  assert.equal(validSave({...state,used:{fever:1}}),false);
  const old=structuredClone(state);delete old.feverExtension;old.fever=12;assert.equal(validSave(old),true);
  assert.equal(validSave({...state,feverExtension:7}),false);
});
