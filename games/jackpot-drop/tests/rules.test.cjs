'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { compileFunction } = require('node:vm');

function runScript(path, parameter, value) {
  const source = readFileSync(path, 'utf8');
  compileFunction(source, [parameter], { filename: path })(value);
}

// Match the classic browser scripts' shared window.JD without changing Node globals.
const browserWindow = {};
runScript(join(__dirname, '../src/rules.js'), 'window', browserWindow);
runScript(join(__dirname, '../src/game.js'), 'window', browserWindow);
const JD = browserWindow.JD;
runScript(join(__dirname, 'balance.js'), 'JD', JD);

function ruleTest(name, check) {
  test(name, () => {
    check((label, expected, actual) => assert.deepStrictEqual(actual, expected, label));
  });
}

const fields = (value, ...keys) => keys.map(key => value[key]);
const all = (events, type) => events.filter(e => e.type === type);
const one = (events, type) => all(events, type)[0] || {};
const up = (options) => Object.assign(JD.newUpgrades(), options);
const blank = (options) => Object.assign({pegs:[], bumpers:[], gates:[], blocks:[], terrain:[],
  iron:[], warps:null, buckets:JD.bucketLayout(JD.STAGES[1], up()), mult:1}, options);
const board = (stage, seed = 1, upgrades = up()) => JD.buildBoard(stage - 1, upgrades, seed);
const range = (count, fn) => Array.from({length:count}, (_, i) => fn(i + 1));
const counts = b => [b.pegs.length,...['gold','bomb'].map(k => b.pegs.filter(p => p.type === k).length),
  b.gates.length,b.blocks.length,b.terrain.length,b.iron.length,b.warps ? b.warps.ins.length : 0];
function shot(b, power, upgrades = up(), pick = {}) {
  const s = JD.createShot(b, power, upgrades, pick);
  let steps = 1;
  while (!JD.stepShot(s)) if (++steps > 2000) throw new Error('비행 제한 2,000스텝 초과');
  return {s, steps, events:s.events, cells:s.balls.map(x => x.bucket)};
}
const queue = (g,...cmds) => cmds.forEach(cmd => g.queue(cmd));
const fire = (g,power) => queue(g,{type:'pull',power},{type:'fire'});
function until(g, goal, es = []) {
  for (let i = 0; i < 3000; i++) {
    const v = g.snapshot();
    if (typeof goal === 'string' ? v.state === goal : v.tick === goal) return v;
    g.step();
    es.push(...g.drainEvents());
  }
  throw new Error('3,000틱 뒤에도 ' + goal + '에 도달하지 않음');
}
function send(g,...commands) { queue(g,...commands); g.step(); return g.drainEvents(); }
function tutorial() {
  const g = JD.createGame({seed:1}), es = g.drainEvents();
  fire(g,0.85);
  until(g,'CARD',es);
  return {g,es};
}
const rack = ['iron','normal','normal'];
const spin = ['standard','spin'];
const makeGate = (id, kind, x, y) => ({id,kind,x,y,alive:true});
const makeBlock = (hp, kind = 'block', y = 240) => ({id:0,kind,hp,maxHp:hp,x:152,y,w:kind==='vault'?72:44,h:kind==='vault'?28:20,alive:true});
ruleTest('보드 생성',eq => {
  const list = range(8, i => board(i));
  eq('핀·금·폭탄·게이트·블록·벽·쇠 벽·워프',[[102,8,3,0,0,2,0,0],[102,8,4,0,0,2,1,0],
    [98,9,4,2,0,1,0,0],[56,9,4,2,3,4,0,2],[65,10,5,2,2,2,1,0],[67,10,5,3,5,0,0,1],
    [62,12,5,4,3,0,1,0],[74,12,6,3,3,0,0,2]],list.map(counts));
  const fixed = [[3,45,63],[11,13,30,38,50,58,70,78]];
  eq('시드 1·5 고정 폭탄·금 핀',[fixed,fixed],[list[0],board(1,5)].map(b =>
    ['bomb','gold'].map(k => b.pegs.filter(p => p.type === k).map(p => p.id))));
  eq('벽 17px 또는 워프 22px 미만인 핀',0,list.reduce((sum,b) => {
    const segments = b.terrain.concat(...b.iron.map(group => group.segs));
    const holes = b.warps ? b.warps.ins.concat(b.warps.outs) : [];
    return sum + b.pegs.filter(p => segments.some(w => JD.segPoint(p.x,p.y,w).d < 17) ||
      holes.some(h => Math.hypot(p.x-h.x,p.y-h.y) < 22)).length;
  },0));
  eq('게이트 위치',[[],[],['plus@180,464','minus@288,464'],['plus@180,368','minus@288,464'],
    ['plus@72,464','minus@180,464'],['plus@180,240','plus@72,240','minus@180,368'],
    ['plus@288,240','plus@72,368','minus@180,464','minus@72,464'],['plus@72,368','plus@180,464','minus@288,240']],
    list.map(b => b.gates.map(g => g.kind+'@'+g.x+','+g.y)));
  eq('금고 종류·중심·HP',['vault',180,368,10,10],fields(list[7].blocks[0],'kind','x','y','hp','maxHp'));
  eq('×5 칸',[[2],[2],[0],[4],[2],[1,3],[0],[2]],list.map(b =>
    b.buckets.mult.map((m,i)=>m===5?i:-1).filter(i=>i>=0)));
  eq('힌트',[null,{ball:'iron'},{spring:'spin',spin:-1},null,{ball:'iron'},null,
    {ball:'iron',spring:'spin',spin:-1},null],JD.STAGES.map(s=>s.hint));
  eq('시드 1~100 금고 파괴 수',5,range(100,seed => all(shot(board(8,seed),0.85).events,'block_broken')
    .some(e=>e.kind==='vault')).filter(Boolean).length);
  eq('같은 시드 보드 재생성',true,list.every((b,i)=>JSON.stringify(b)===JSON.stringify(board(i+1))));
});
ruleTest('첫 발',eq => {
  const g=JD.createGame({seed:1}), es=g.drainEvents(); fire(g,0.85);
  eq('1틱 상태','LAUNCH',until(g,1,es).state);
  eq('첫 발사',[1,1,0.85,true,'normal','standard',0,2],
    fields(one(es,'shot_fired'),'tick','stage','power','perfect','ball','spring','spin','ballsLeft'));
  eq('13틱 상태','FLIGHT',until(g,13,es).state);
  eq('레인 진입: 틱·PERFECT·콤보',[13,true,1],fields(one(es,'launch'),'tick','perfect','tier'));
  until(g,'BANNER',es);
  eq('첫 적중: 틱·id·종류·원인·콤보·점수',[38,3,'bomb','ball',1,30],
    fields(one(es,'peg_hit'),'tick','id','pegType','cause','tier','pts'));
  eq('폭탄 틱·핀 수',[38,7],[one(es,'bomb_exploded').tick,(one(es,'bomb_exploded').lit||[]).length]);
  eq('콤보 단계·순번',[[2,8],[3,16],[4,24]],all(es,'combo_up').map(e=>fields(e,'tier','n')));
  eq('비행 종료: 틱·t·핀·핀값·금·배수·칸 합·점수·콤보',[611,591,34,1085,5,6,5,32550,4],
    fields(one(es,'shot_finished'),'tick','t','hits','pts','golds','stageMult','bucketSum','score','tier'));
  eq('칸·정산 틱·단계 점수',[2,715,32550],[one(es,'ball_landed').bucket,...fields(one(es,'payout_done'),'tick','stageScore')]);
});
ruleTest('아까운 실패',eq => {
  const g=JD.createGame({seed:1}), es=g.drainEvents();
  [0.1,0.1,0.6].forEach((p,i)=>{ fire(g,p); until(g,'PAYOUT',es); until(g,i===2?'BANNER':'AIM',es); });
  const v=g.snapshot(), end=until(g,'RESULT',es);
  eq('발 점수·칸·PERFECT',[[575,600,1750],[2,2,2],[false,false,false]],
    [all(es,'shot_finished').map(e=>e.score),all(es,'ball_landed').map(e=>e.bucket),all(es,'shot_fired').map(e=>e.perfect)]);
  eq('배수·단계 점수·달성률·배너·배너 길이',[2,2925,97,'SO CLOSE!',45],
    [v.stageMult,v.stageScore,one(es,'stage_failed').ratio,v.banner.text,end.tick-v.tick]);
  eq('완주·클리어 수·도달 단계·지도·PERFECT 횟수',[false,0,1,'TUTORIAL',0],
    fields(end.result,'won','reached','stageReached','stageName','perfects'));
});
ruleTest('고정 보상과 2단계',eq => {
  const {g,es}=tutorial(), clear=one(es,'stage_clear');
  eq('정산·클리어 틱·단계·단계 점수·남은 공·보너스·판 점수',[715,715,1,32550,2,600,33150],
    [one(es,'payout_done').tick,...fields(clear,'tick','stage','stageScore','ballsLeft','bonus'),g.snapshot().runScore]);
  eq('고정 보상 제시',[775,['ballIron'],true],fields(one(es,'cards_offered'),'tick','ids','fixed'));
  const rejected=send(g,{type:'pick',index:1},{type:'pick',index:2});
  eq('범위 밖 카드 거부',['CARD',0],[g.snapshot().state,all(rejected,'card_picked').length]);
  const taken=send(g,{type:'pick',index:0}), v=g.snapshot();
  eq('카드 선택 id·레벨',['ballIron',1],fields(one(taken,'card_picked'),'id','level'));
  eq('2단계 시작',[2,'IRON LID',6000,3,false],fields(one(taken,'stage_started'),'stage','name','target','balls','endless'));
  eq('랙·남은 랙·선택·구슬·스프링·힌트·쇠 벽',[rack,rack,0,'iron',['standard'],{ball:'iron'},[true]],
    [v.fullRack,v.rack,v.slot,v.pick.ball,v.springs,v.hint,v.iron.map(w=>w.alive)]);
  const changed=send(g,{type:'pickBall',slot:1});
  eq('일반 구슬 선택',[1,'normal','normal'],[...fields(one(changed,'ball_picked'),'slot','ball'),g.snapshot().pick.ball]);
  const exact=tutorial().g;
  eq('정상 선택 틱',776,one(send(exact,{type:'pick',index:0}),'card_picked').tick);
});
ruleTest('분열',eq => {
  const u=up({split:2}), v=shot(board(1,1,u),0.85,u);
  eq('공 수·칸·칸 합·핀·폭발·배수·점수',[3,[2,2,2],15,55,2,7,224175],
    [v.s.balls.length,v.cells,v.s.bucketSum,v.s.hits,all(v.events,'bomb_exploded').length,v.s.board.mult,v.s.score]);
});
ruleTest('강화 수치와 칸 배치',eq => {
  const b=board(2,1,up({goldPlus:1,bombPlus:1,fever:1}));
  eq('핀·금·폭탄·초기 배수',[102,11,6,2],[...counts(b).slice(0,3),b.mult]);
  eq('초록 게이트',[['plus',288,240]],board(2,1,up({gate:1})).gates.map(g=>fields(g,'kind','x','y')));
  const s=JD.createShot(blank(),0.5,up({heavy:1}));
  JD.lightPeg(s,{id:7,type:'normal',lit:false},'ball');
  eq('콤보 0 RICH PEGS',[0,20],[s.tier,s.pts]);
  const radii=[0,1,2,3].map(bombPlus=>JD.createShot(blank(),0.5,up({bombPlus})).blastR);
  eq('BIG BANG 반경 증가',[16,16,16],radii.slice(1).map((r,i)=>r-radii[i]));
  const layout=(buckets,jackpot=0)=>JD.bucketLayout({buckets},up({jackpot}));
  const at=(b,x)=>b.mult[b.x.findIndex(edge=>edge>x)-1];
  eq('지정 x 칸 배수',[2,5,5,1,5,5,1,5],[at(layout('center'),130),at(layout('center',1),130),
    at(layout('left'),40),at(layout('left'),140),at(layout('right'),320),...[100,180,250].map(x=>at(layout('twin'),x))]);
  eq('WIDE 경계',[[0,80,124,236,280,360],[0,92,136,208,280,360],[0,80,152,224,268,360],[0,44,148,212,316,360]],
    ['center','left','right','twin'].map(x=>layout(x,1).x));
});
ruleTest('카드 제시와 적용',eq => {
  const u=up(), next=JD.mulberry32(1000); let calls=0;
  const counted=()=>{ calls++; return next(); };
  eq('고정 보상·난수 사용',[['ballIron'],['springSpin'],0],[JD.drawOffer(counted,u,0),JD.drawOffer(counted,u,1),calls]);
  eq('시드 1·2 세 장',[['ballIron','ballBig','gate'],['heavy','jackpot','bombPlus']],
    [JD.drawOffer(counted,u,2),JD.drawOffer(JD.mulberry32(1001),u,2)]);
  eq('상한 10종 제외',[10,['fever','bombPlus','heavy']],
    [Object.keys(JD.CARD_CAP).length,JD.drawOffer(JD.mulberry32(1000),up(JD.CARD_CAP),2)]);
  eq('시드 1~100 단계 3~12 세 장·중복 없음·스핀 없음',true,
    range(100,seed=>range(10,i=>JD.drawOffer(JD.mulberry32(seed+999),u,i+1))).every(
      entries=>entries.every(cards=>cards.length===3 && new Set(cards).size===3 && !cards.includes('springSpin'))));
  JD.applyCard(u,'ballIron');
  eq('쇠 구슬 첫 적용',rack,u.rack.slice());
  ['springSpin','ballGlass','ballBig','ballIron','extra'].forEach(id=>JD.applyCard(u,id));
  eq('카드 적용 후 랙·스프링',[['iron','glass','big','iron','normal'],spin],[u.rack,u.springs]);
});
ruleTest('정산 길이와 건너뛰기',eq => {
  eq('핀 0·9·28·34·61개 정산 틱',[70,97,126,104,131],[0,9,28,34,61].map(JD.payoutDuration));
  const g=JD.createGame({seed:1}), es=g.drainEvents(); fire(g,0.85);
  eq('정산 진입 경과·길이',[0,104],fields(until(g,'PAYOUT',es).payout,'elapsed','duration'));
  until(g,649,es);
  eq('650틱 skip 즉시 종료',[650,32550],fields(one(send(g,{type:'skip'}),'payout_done'),'tick','stageScore'));
});
ruleTest('끼임과 시간 제한',eq => {
  const peg={id:7,x:300,y:400,type:'normal',lit:true,alive:true};
  const s=JD.createShot(blank({pegs:[peg]}),0.5,up());
  Object.assign(s.balls[0],{vx:0,vy:-0.22,slow:44}); JD.stepShot(s);
  eq('끼임 핀·생존·slow',[[7],false,0],[one(s.events,'stuck_clear').ids,peg.alive,s.balls[0].slow]);
  const saved=JD.CFG.MAX_FLIGHT;
  try {
    JD.CFG.MAX_FLIGHT=5;
    const v=shot(blank(),0.5);
    eq('시간 제한 t·칸·timeout',[5,0,true],[v.s.t,...fields(one(v.events,'ball_landed'),'bucket','timeout')]);
  } finally { JD.CFG.MAX_FLIGHT=saved; }
  eq('시간 제한 복구',720,JD.CFG.MAX_FLIGHT);
});
ruleTest('밸런스 하네스',eq => {
  [
    ['random',200,13,[199,139,75,56,44,28,17,13],2,[5825,7500,5495]],
    ['aim',200,28,[200,183,124,81,71,50,37,28],2,[4650,6550,5500]],
    ['pro',20,20,[20,20,20,20,20,20,20,20],8,[24250,8800,18525,40230,41200,73200,34125,67000]]
  ].forEach(([policy,n,wins,clears,reached,points])=>{
    const runs=range(n,seed=>JD.simulateRun(seed,policy));
    eq(policy+' 완주·단계별 클리어 수',[wins,clears],
      [runs.filter(r=>r.won).length,range(8,i=>runs.filter(r=>r.reached>=i).length)]);
    eq(policy+' 시드 1 완주·도달·단계 점수',[reached===8,reached,points],
      [runs[0].won,runs[0].reached,runs[0].stages.map(s=>s.score)]);
  });
});

ruleTest('게이트',eq => {
  const plus=()=>makeGate(0,'plus',152,240), minus=(id=0)=>makeGate(id,'minus',84,368);
  const a=shot(blank({gates:[plus()]}),0.5);
  eq('초록: 게이트 id·공 id·결과·공 수·칸·배수 합·스텝·게이트 생존',[0,0,'spawn',2,[0,4],2,71,false],
    [...fields(one(a.events,'gate_passed'),'id','ball','result'),a.s.balls.length,a.cells,a.s.bucketSum,a.steps,a.s.board.gates[0].alive]);
  const b=shot(blank({gates:[plus(),minus(1)]}),0.5);
  eq('빨강 제거: 공 id·결과·공 손실·남은 공 칸·배수 합',[0,'removed',true,4,1],
    [...fields(all(b.events,'gate_passed')[1]||{},'ball','result'),b.s.balls[0].lost,b.cells[1],b.s.bucketSum]);
  const c=shot(blank({gates:[minus()]}),0.5);
  eq('빨강 마지막 공 보호: 결과·칸·배수 합',['saved',[0],1],[one(c.events,'gate_passed').result,c.cells,c.s.bucketSum]);
  const g=plus(), s=JD.createShot(blank({gates:[g]}),0.5,up());
  s.balls.push(...range(5,()=>JD.newBall(152,239,0,1,8)));
  JD.passGate(s,s.balls[0],0,g);
  eq('초록 공 상한',['capped',6],[one(s.events,'gate_passed').result,s.balls.length]);
});
ruleTest('HP 블록',eq => {
  const a=shot(blank({blocks:[makeBlock(2)]}),0.5);
  eq('HP 2 피해·파괴·보너스',[[[1,'ball'],[0,'ball']],'block',40],
    [all(a.events,'block_hit').map(e=>fields(e,'hp','cause')),...fields(one(a.events,'block_broken'),'kind','bonus')]);
  eq('HP 2 핀값·금·배수·칸·점수·스텝·t',[50,1,2,2,500,157,154],
    [a.s.pts,a.s.golds,a.s.board.mult,a.cells[0],a.s.score,a.steps,a.s.t]);
  const b=shot(blank({blocks:[makeBlock(1)]}),0.5);
  eq('HP 1 보너스·핀값·금·배수·칸·점수',[20,25,1,2,3,100],
    [one(b.events,'block_broken').bonus,b.s.pts,b.s.golds,b.s.board.mult,b.cells[0],b.s.score]);
  const c=shot(blank({blocks:[makeBlock(1,'vault')]}),0.5);
  eq('금고 보너스·금·배수·점수',[20,3,4,200],[one(c.events,'block_broken').bonus,c.s.golds,c.s.board.mult,c.s.score]);
  const damaged=makeBlock(3,'block',250);
  const same=blank({pegs:[{id:0,x:173,y:200,type:'bomb',lit:false,alive:true}],blocks:[damaged]});
  const d=shot(same,0.5);
  eq('폭발 후 HP·원인·블록 id·생존·핀값·칸·점수',[1,'blast',[0],true,30,1,60],
    [...fields(one(d.events,'block_hit'),'hp','cause'),one(d.events,'bomb_exploded').blocks,damaged.alive,d.s.pts,d.cells[0],d.s.score]);
  const hp=damaged.hp, e=shot(same,0.5);
  eq('다음 발 시작 HP·피해 후 HP·원인·보너스·핀값·칸·점수',[1,0,'ball',60,65,3,260],
    [hp,...fields(one(e.events,'block_hit'),'hp','cause'),one(e.events,'block_broken').bonus,e.s.pts,e.cells[0],e.s.score]);
  const f=shot(blank({blocks:[makeBlock(4)]}),0.5,up(),{ball:'iron'});
  eq('쇠 구슬 HP 4 피해 순서',[2,0],all(f.events,'block_hit').map(e=>e.hp));
});
ruleTest('무한 모드',eq => {
  const defs=[8,9,10,11].map(JD.stageDef);
  eq('지도·목표·블록 HP·칸 배치',[
    ['BOWL',50000,[7,7,7,7,7],'twin'],['RING',71000,[6,8,6],'left'],
    ['VAULT',99000,[12,8,8],'center'],['BOWL',138000,[9,9,9,9,9],'twin']],
    defs.map(s=>[s.name,s.target,s.blocks.map(b=>b[4]),s.buckets]));
  eq('9단계 무한 모드·워프·고정 보상, 10단계 쇠 벽·힌트',[true,true,null,1,{ball:'iron',spring:'spin',spin:-1}],
    [defs[0].endless,!!defs[0].warps,defs[0].reward,defs[1].iron.length,defs[1].hint]);
  eq('9단계 시드 1 보드',[67,10,5,3,5,0,0,1],counts(board(9)));
  const pro=JD.simulateRun(1,'pro',20);
  eq('숙련 시드 1 완주·도달·9단계 점수·10단계 점수·10단계 클리어',[true,9,111150,57950,false],
    [pro.won,pro.reached,pro.stages[8].score,pro.stages[9].score,pro.stages[9].clear]);
  const g=JD.createGame({seed:2,start:8}), es=g.drainEvents();
  eq('시드 2 연습 8 시작 랙·스프링',[rack,spin],fields(g.snapshot(),'fullRack','springs'));
  queue(g,{type:'pickBall',slot:1}); fire(g,1); until(g,'CARD',es);
  eq('8단계 발사 구슬·스프링·점수·금고 파괴·워프',['normal','standard',47320,1,1],
    [...fields(one(es,'shot_fired'),'ball','spring'),one(es,'shot_finished').score,
      all(es,'block_broken').filter(e=>e.kind==='vault').length,all(es,'warp').length]);
  const c=one(es,'stage_clear'), a=one(es,'all_clear'), p=one(es,'payout_done'), o=one(es,'cards_offered');
  eq('정산→클리어→ALL CLEAR 같은 틱·단계·점수·남은 공·보너스',[true,true,8,47320,2,7200],
    [p.tick===c.tick && c.tick===a.tick, es.indexOf(p)<es.indexOf(c) && es.indexOf(c)+1===es.indexOf(a),
      ...fields(c,'stage','stageScore','ballsLeft','bonus')]);
  eq('무한 카드 전 배너 길이·카드',[90,['heavy','jackpot','bombPlus'],false],[o.tick-c.tick,o.ids,o.fixed]);
  const taken=send(g,{type:'pick',index:0});
  eq('9단계 시작',[9,'BOWL',50000,3,true],fields(one(taken,'stage_started'),'stage','name','target','balls','endless'));
});
ruleTest('벽과 검수용 시작',eq => {
  eq('세로·사선 벽: 충돌·스텝·칸',[[1,70,4],[2,124,2]],
    [[152,200,152,300],[100,220,200,300]].map(w=>{
      const v=shot(blank({terrain:[w]}),0.5);
      return [all(v.events,'terrain_hit').length,v.steps,v.cells[0]];
    }));
  const g=JD.createGame({seed:1,start:8}), h=JD.createGame({seed:1,start:2});
  eq('8단계 연습 시작',[8,'VAULT',36000,3,false],fields(one(g.drainEvents(),'stage_started'),'stage','name','target','balls','endless'));
  eq('8단계 핀·판 점수',[74,0],[g.snapshot().pegs.length,g.snapshot().runScore]);
  eq('2단계 지도·랙·스프링',['IRON LID',rack,['standard']],fields(h.snapshot(),'stageName','fullRack','springs'));
});
ruleTest('발사대·스프링·구슬',eq => {
  eq('스프링별 PERFECT 경계',[[false,true,true,false],[false,true,true],[false,true,false]],
    [['standard',0.77,0.78,0.90,0.91],['soft',0.65,0.66,0.92],['stiff',0.85,0.86,0.93]].map(
      ([key,...pp])=>pp.map(p=>JD.isPerfect(p,key))));
  eq('발사 도구와 세기별 세기·vx·PERFECT·콤보·스핀·반지름',[
    [0.05,-1.875,false,0,0,8],[1,-9,false,0,0,8],[0.85,-7.875,true,1,0,8],
    [0.85,-7.875,true,1,-1,8],[0.85,-7.875,true,1,1,8],[0.85,-7.875,true,1,0,8],
    [1,-7.5,false,0,0,8],[0.88,-9.92,true,2,0,8],[0.5,-5.25,false,0,0,11]],
    [[0],[1],[0.85],[0.85,{spring:'spin',spin:-1}],[0.85,{spring:'spin'}],[0.85,{spring:'standard',spin:-1}],
      [1,{spring:'soft'}],[0.88,{spring:'stiff'}],[0.5,{ball:'big'}]].map(([p,k])=>{
        const s=JD.createShot(blank(),p,up(),k);
        return [s.power,Number(s.balls[0].vx.toFixed(6)),s.perfect,s.tier,s.spin,s.balls[0].r];
      }));
  const left={spring:'spin',spin:-1}, right={spring:'spin',spin:1};
  const parts=[{},left,right].map(k=>range(20,i=>shot(board(3),i/20,up(),k).cells[0]).join(''));
  eq('CURVE 20가지 착지 칸·JACKPOT 수',[['44242202403040440304','11000002200000000004','44444444444440444404'],[6,15,2]],
    [parts,parts.map(p=>Array.from(p).filter(n=>n==='0').length)]);
  const a=shot(board(3),0.85), b=shot(board(3),0.85,up(),left);
  eq('CURVE 0.85 무스핀·왼쪽 점수·칸·왼쪽 핀',[2475,0,300,0,4],[a.s.score,a.cells[0],b.s.score,b.cells[0],b.s.hits]);
  const u=up(); JD.applyCard(u,'ballGlass');
  const c=shot(board(1,1,u),0.88,u,{ball:'glass'});
  eq('유리 파열 수·착지 칸·핀·점수',[[2],[2,2,2],44,117750],
    [all(c.events,'ball_shatter').map(e=>e.count),c.cells,c.s.hits,c.s.score]);
  const g=JD.createGame({seed:1}), es=send(g,{type:'hold'});
  eq('1틱 충전 시작·충전·세기',[1,true,1/60],[one(es,'charge_started').tick,...fields(g.snapshot(),'charging','power')]);
  const sixty=until(g,60,es), later=until(g,70,es);
  eq('47틱 PERFECT·60틱 이후 100% 유지',[[47,'perfect'],1,1],
    [fields(one(es,'charge_zone'),'tick','zone'),sixty.power,later.power]);
  const held=JD.createGame({seed:1}); queue(held,{type:'hold'}); until(held,51);
  const releases=send(held,{type:'release'});
  until(held,'PAYOUT',releases);
  eq('52틱 홀드 발사 세기·PERFECT·구슬·남은 공',[52,0.85,true,'normal',2],
    fields(one(releases,'shot_fired'),'tick','power','perfect','ball','ballsLeft'));
  eq('64틱 진입·662틱 종료·발 점수',[64,662,32550],[one(releases,'launch').tick,...fields(one(releases,'shot_finished'),'tick','score')]);
  const brief=JD.createGame({seed:1}); queue(brief,{type:'hold'}); until(brief,2);
  const cancel=send(brief,{type:'release'});
  eq('짧은 홀드 취소 틱·세기·발사 수·남은 공·리셋',[3,2/60,0,3,0],
    [...fields(one(cancel,'charge_cancel'),'tick','power'),all(cancel,'shot_fired').length,...fields(brief.snapshot(),'ballsLeft','power')]);
  const guards=JD.createGame({seed:1,start:3});
  const tools=[{type:'pickBall',slot:1},{type:'pickSpring',spring:'spin',spin:1}];
  const during=send(guards,{type:'hold'},...tools);
  eq('충전 중 도구 변경 무시',['iron','standard',0,0],
    [...fields(guards.snapshot().pick,'ball','spring'),all(during,'ball_picked').length,all(during,'spring_picked').length]);
  fire(guards,0.1); const before=until(guards,'LAUNCH');
  const ignored=send(guards,{type:'hold'},{type:'release'},{type:'pull',power:0.85},{type:'fire'},...tools);
  eq('AIM 외 입력 무시',[before.power,before.ballsLeft,before.pick,[]],
    [...fields(guards.snapshot(),'power','ballsLeft','pick'),
      ignored.filter(e=>['shot_fired','charge_started','charge_cancel','ball_picked','spring_picked'].includes(e.type))]);
  const next=JD.createGame({seed:1}); fire(next,0.1); until(next,'PAYOUT');
  eq('다음 AIM 세기·직전 세기',[0,0.1],fields(until(next,'AIM'),'power','lastPower'));
});
ruleTest('쇠 벽·워프·랙',eq => {
  const lid=board(2), a=shot(lid,0.85), alive=lid.iron[0].alive;
  const b=shot(lid,0.85,up(),{ball:'iron'}), gone=lid.iron[0].alive;
  const c=shot(lid,0.85);
  eq('연속 일반·쇠·일반: 충돌·파괴·칸·점수·스텝·벽 생존',[10,0,1300,true,[0],2,2625,147,false,0,1,300],
    [all(a.events,'iron_hit').length,a.cells[0],a.s.score,alive,all(b.events,'iron_break').map(e=>e.id),
      b.cells[0],b.s.score,b.steps,gone,all(c.events,'iron_hit').length,c.cells[0],c.s.score]);
  eq('세기 20개 일반·쇠 JACKPOT 횟수',[0,18],['normal','iron'].map(ball=>
    range(20,i=>shot(board(2),i/20,up(),{ball}).cells[0]).filter(cell=>cell===2).length));
  eq('단일 쇠 벽 충돌·파괴 수·칸·스텝·생존',[[2,2,190,true],[1,0,74,false]],
    [['normal','iron_hit'],['iron','iron_break']].map(([ball,kind])=>{
      const wall={id:0,segs:[[100,250,220,250]],alive:true};
      const v=shot(blank({iron:[wall]}),0.5,up(),{ball});
      return [all(v.events,kind).length,v.cells[0],v.steps,wall.alive];
    }));
  const w=shot(blank({warps:{ins:[{x:152,y:240}],outs:[{x:60,y:140},{x:300,y:140}],rnd:{s:7}}}),0.5);
  eq('단일 워프: 출구·횟수·착지 x≈60·칸·스텝·t',[[0,60,140],1,true,0,102,98],
    [fields(one(w.events,'warp'),'to','ox','oy'),all(w.events,'warp').length,Math.abs(w.s.balls[0].x-60)<3,w.cells[0],w.steps,w.s.t]);
  const warps=board(4).warps;
  eq('4단계 워프 시드·출구 번호',[2967,[0,0,2,1,0,0]],
    [warps.rnd.s,range(6,()=>Math.floor(JD.nextRand(warps.rnd)*warps.outs.length))]);
  const h=shot(board(4),0.15);
  eq('4단계 첫 발 입구·출구·좌표·칸·점수',[0,0,324,140,4,6625],
    [...fields(one(h.events,'warp'),'from','to','ox','oy'),h.cells[0],h.s.score]);
  const {g}=tutorial(); send(g,{type:'pick',index:0}); queue(g,{type:'pickBall',slot:0}); fire(g,0.85);
  until(g,'PAYOUT'); const aim=until(g,'AIM');
  eq('쇠 구슬 소모 후 랙·다음 선택',[['normal','normal'],0,'normal'],[aim.rack,aim.slot,aim.pick.ball]);
  const copy=board(2);
  shot(copy,0.85,up(),{ball:'iron'});
  const power=range(20,i=>i/20).find(p=>shot(JSON.parse(JSON.stringify(copy)),p).s.score>=6000-aim.stageScore);
  if (power===undefined) throw new Error('2단계 클리어 후보 없음');
  fire(g,power); until(g,'CARD'); send(g,{type:'pick',index:0});
  eq('3단계 랙과 스프링',[3,rack,rack,spin],fields(g.snapshot(),'stage','fullRack','rack','springs'));
});
