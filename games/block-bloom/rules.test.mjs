import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, GATES, createLevel, move, guide, fits, useItem, elevate, tick, continueRun, newProfile, restoreProfile, validRun, winReward, boardKey, migrateRun } from './rules.mjs';

const block = (id,color,x,y,w=1,h=1,extra={}) => ({id,color,x,y,w,h,rank:1,...extra});
function fixture(mode,blocks,extra={}) { return {...createLevel(mode,1,1),blocks,plan:[],queue:[],tray:[],unlocked:[],total:blocks.length,initial:blocks.length,removed:0,moves:0,score:0,...extra}; }

test('1,200 generated boards across all six modes have legal, complete construction solutions',()=>{
  for(const mode of Object.keys(MODES))for(let i=0;i<200;i++) {
    let s=createLevel(mode,1+i%75,(i*2719+391)>>>0);const start=JSON.stringify(s);
    assert.ok(validRun(s),mode+' '+i);assert.equal(JSON.stringify(createLevel(mode,s.level,s.seed)),start);
    for(const action of s.plan){const before=boardKey(s),r=move(s,action.id,action.dx,action.dy);assert.ok(r.ok,mode+' '+i+' '+JSON.stringify(action));assert.equal(boardKey(s),before,'pure input');s=r.state;assert.ok(validRun({...s,plan:[]}));}
    assert.equal(s.status,'won',mode+' '+i);assert.equal(s.removed,s.total);assert.equal(s.blocks.length+s.queue.length+s.tray.length,0);
  }
});
test('path collision, incorrect doors, gate width and malformed inputs cannot bypass the board',()=>{
  const s=fixture('classic',[block(1,'coral',0,2),block(2,'blue',0,0),block(3,'gold',3,4,2,2)]);
  assert.equal(move(s,1,0,-4).state.blocks.find(b=>b.id===1).y,1,'stops before occupied cell');
  assert.equal(move(s,2,0,-1).ok,false,'wrong color door');assert.equal(move(s,3,-6,0).state.blocks.find(b=>b.id===3),undefined,'fits correct gate');
  for(const args of [[99,1,0],[1,1,1],[1,0,0],[1,1.1,0],[1,NaN,0],[1,7,0]])assert.equal(move(s,...args).ok,false);
  const wide=fixture('classic',[block(1,'coral',2,0,2,1)]);assert.equal(move(wide,1,0,-1).ok,false,'piece must fit full gate span');
  assert.equal(fits(s,s.blocks[0],-1,2),false);assert.equal(move({...s,status:'won'},1,1,0).ok,false);
});
test('2048 merges equal colors and equal ranks; 2 cannot exit and 4 can',()=>{
  let s=fixture('merge',[block(0,'coral',1,0),block(1,'coral',1,2)]);
  assert.equal(move(s,0,0,-1).ok,false);let r=move(s,1,0,-2);assert.equal(r.events[0].type,'merge');s=r.state;
  assert.equal(s.blocks.length,1);assert.equal(s.blocks[0].rank,2);assert.equal(s.removed,1);s=move(s,0,0,-1).state;assert.equal(s.status,'won');
  const unlike=fixture('merge',[block(0,'coral',1,0),block(1,'blue',1,1)]);assert.equal(move(unlike,1,0,-1).ok,false);
  const unequal=fixture('merge',[block(0,'coral',1,0),block(1,'coral',1,1,1,1,{rank:2})]);assert.equal(move(unequal,1,0,-1).ok,false);
});
test('key precedence and two clear frost layers are enforced',()=>{
  let s=fixture('key',[block(0,'coral',0,0),block(1,'coral',2,0,1,1,{key:true})]);assert.equal(move(s,0,0,-1).ok,false);
  s=move(s,1,0,-1).state;assert.deepEqual(s.unlocked,['coral']);assert.equal(move(s,0,0,-1).state.status,'won');
  s=fixture('ice',[block(0,'coral',0,0,1,1,{ice:2}),block(1,'blue',5,0),block(2,'gold',0,5)]);assert.equal(move(s,0,0,-1).ok,false);
  s=move(s,1,1,0).state;assert.equal(s.blocks[0].ice,1);s=move(s,2,-1,0).state;assert.equal(s.blocks[0].ice,0);assert.equal(move(s,0,0,-1).state.status,'won');
});
test('dock matching happens before the seventh-slot overflow check',()=>{
  const s=fixture('triple',[block(0,'coral',0,0)],{tray:['blue','blue','gold','gold','coral','coral']});
  const r=move(s,0,0,-1);assert.equal(r.state.tray.length,4);assert.equal(r.state.status,'playing');assert.ok(r.events.some(e=>e.type==='triple'));
  const fail=move({...s,tray:['blue','blue','gold','gold','lime','lime']},0,0,-1).state;assert.equal(fail.status,'lost');assert.equal(fail.reason,'tray');
});
test('items respect targets, thaw and unlock; freeze only protects its actual duration',()=>{
  let s=fixture('key',[block(0,'coral',3,3,1,1,{key:true}),block(1,'coral',2,2),block(2,'blue',4,4)]);
  assert.equal(useItem(s,'hammer',999).ok,false);let r=useItem(s,'magnet',0);assert.equal(r.state.blocks.length,1);assert.deepEqual(r.state.unlocked,['coral']);
  s=useItem(s,'freeze').state;assert.equal(s.frozen,20);assert.equal(useItem(s,'freeze').ok,false);const time=s.time;
  s=tick(s,25);assert.equal(s.frozen,0);assert.equal(s.time,time-5);assert.equal(tick(s,-10),s);
  const fail=tick({...s,time:1},2);assert.equal(fail.status,'lost');assert.equal(useItem(fail,'hammer',0).ok,false);
});
test('factory generates all queued blocks and elevator validates landing space',()=>{
  let s=fixture('factory',[block(0,'coral',0,0)],{queue:[block(100,'blue',5,1)],total:2});
  let r=move(s,0,0,-1);assert.ok(r.events.some(e=>e.type==='spawn'));assert.equal(r.state.blocks[0].id,100);assert.equal(move(r.state,100,1,0).state.status,'won');
  s=fixture('factory',[block(0,'blue',2,2),block(1,'gold',2,3)]);r=elevate(s,0);assert.equal(r.ok,true);assert.equal(r.state.blocks[0].y,4,'passes intervening block');
  assert.equal(elevate(fixture('factory',[block(0,'blue',2,2),block(1,'gold',2,4)]),0).ok,false);assert.equal(elevate({...s,mode:'classic'},0).ok,false);
});
test('hint follows a terminating path instead of looping through repeated shuffle states',()=>{
  for(const mode of Object.keys(MODES)){
    let s=createLevel(mode,2,59);let steps=0;
    while(s.status==='playing'&&steps++<700){const action=guide(s,3000);assert.ok(action,mode);const r=move(s,action.id,action.dx,action.dy);assert.ok(r.ok);s=r.state;}
    assert.equal(s.status,'won',mode+' hint terminates');
  }
  const s=createLevel('classic',1,122),deviation=s.blocks.flatMap(b=>[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>move(s,b.id,dx,dy))).find(r=>r.ok);
  const h=guide(deviation.state,6000);assert.ok(h);assert.ok(move(deviation.state,h.id,h.dx,h.dy).ok);
});
test('win rewards persist once and continuing has a two-use limit',()=>{
  const won=fixture('classic',[],{status:'won',level:3,total:1,removed:1,time:100}),p=newProfile();
  const r=winReward(won,p);assert.equal(r.coins,130);assert.equal(r.stars,3);assert.equal(r.profile.levels.classic,4);assert.equal(p.coins,350);
  const duplicate=winReward(JSON.parse(JSON.stringify(r.state)),r.profile);assert.equal(duplicate.coins,0);assert.equal(duplicate.profile.coins,480);
  let lost=fixture('triple',[block(0,'blue',5,1)],{status:'lost',time:0,reason:'tray',tray:['coral','coral','gold','gold','lime','lime','blue']});
  let resumed=continueRun(lost);assert.equal(resumed.status,'playing');assert.equal(resumed.time,45);assert.equal(resumed.tray.length,0);
  resumed=continueRun({...resumed,status:'lost'});assert.equal(resumed.continues,2);assert.equal(continueRun({...resumed,status:'lost'}),null);
});
test('corrupt saves are rejected and profile values are bounded',()=>{
  const s=createLevel('classic',1,1);assert.ok(validRun(JSON.parse(JSON.stringify(s))));
  for(const corrupt of [{...s,blocks:[s.blocks[0],s.blocks[0]]},{...s,time:Infinity},{...s,total:99},{...s,mode:'other'},{...s,queue:null},{...s,plan:[{id:1,dx:2,dy:3}]}])assert.equal(validRun(corrupt),false);
  const p=restoreProfile({coins:-1,stars:Infinity,items:{hint:-10,hammer:2},levels:{classic:-4},sound:false,skin:'aurora',aurora:false});
  assert.equal(p.coins,350);assert.equal(p.items.hint,5);assert.equal(p.items.hammer,2);assert.equal(p.sound,false);assert.equal(p.skin,'original');
  assert.equal(boardKey(s),boardKey(JSON.parse(JSON.stringify(s))));
});
test('a full triple dock can continue and finish without losing partial colors',()=>{
  let s=createLevel('triple',1,33);
  for(const id of [0,1,3,4,6,7,9])s=useItem(s,'hammer',id).state;
  assert.equal(s.status,'lost');assert.equal(s.tray.length,7);
  s=continueRun(s);assert.equal(s.reserve.length,7);assert.equal(s.tray.length,0);assert.ok(validRun(s));
  for(const id of [2,5,8,10,11]){s=useItem(s,'hammer',id).state;assert.ok(validRun(s));}
  assert.equal(s.status,'won');assert.equal(s.reserve.length+s.tray.length,0);
});
test('older continued triple saves recover missing remainders without resetting coins or board',()=>{
  let old=createLevel('triple',1,22);for(const id of [0,1,3,4,6,7,9])old=useItem(old,'hammer',id).state;
  old={...old,status:'playing',continues:1,tray:[]};delete old.reserve;delete old.started;
  assert.ok(validRun(old));let restored=migrateRun(old);assert.equal(restored.blocks.length,5);assert.equal(restored.reserve.length,7);
  for(const id of [2,5,8,10,11])restored=useItem(restored,'hammer',id).state;
  assert.equal(restored.status,'won');assert.equal(restoreProfile({coins:123}).coins,123);
  const stranded={...old,blocks:[],removed:12,total:12,tray:['coral'],continues:1};
  assert.ok(validRun(stranded));assert.equal(migrateRun(stranded).status,'won','recovers an already empty legacy board');
});
