(function (JD) {
'use strict';

JD.acceptanceCases = [];
function test(id, title, run) {
  JD.acceptanceCases.push({ id, title, run });
}

const fields = (value, ...keys) => keys.map(key => value[key]);
const all = (events, type) => events.filter(e => e.type === type);
const one = (events, type) => all(events, type)[0] || {};
const up = (options) => Object.assign(JD.newUpgrades(), options);
const blank = (options) => Object.assign({pegs:[], bumpers:[], gates:[], blocks:[], terrain:[],
  iron:[], warps:null, parked:[], buckets:JD.bucketLayout(JD.STAGES[1], up()), mult:1,
  rows:12, landY:596, h:640, maxFlight:720}, options);
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
const multiLoad = () => {
  const upgrades=up();
  JD.applyCard(upgrades,'ballIron');
  JD.applyCard(upgrades,'springLoad');
  return upgrades;
};
const makeGate = (id, kind, x, y) => ({id,kind,x,y,alive:true});
const makeBlock = (hp, kind = 'block', y = 240) => ({id:0,kind,hp,maxHp:hp,x:152,y,w:kind==='vault'?72:44,h:kind==='vault'?28:20,alive:true});
test('F01','보드 생성',eq => {
  const list = range(8, i => board(i));
  eq('핀·금·폭탄·게이트·블록·벽·쇠 벽·워프',[[102,8,3,0,0,2,0,0],[102,8,4,0,0,2,1,0],
    [98,9,4,2,0,1,0,0],[56,9,4,2,3,4,0,2],[130,14,7,3,4,2,1,0],[67,10,5,3,5,0,0,1],
    [62,12,5,4,3,0,1,0],[128,16,8,4,5,0,0,2]],list.map(counts));
  eq('1·5·8단계 보드 줄·착지선·높이·시간 제한',[[12,596,640,720],[24,980,1024,1440],[24,980,1024,1440]],
    [0,4,7].map(index=>fields(list[index],'rows','landY','h','maxFlight')));
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
    ['plus@72,464','plus@72,720','minus@180,848'],['plus@180,240','plus@72,240','minus@180,368'],
    ['plus@288,240','plus@72,368','minus@180,464','minus@72,464'],['plus@72,720','plus@288,848','plus@72,368','minus@288,720']],
    list.map(b => b.gates.map(g => g.kind+'@'+g.x+','+g.y)));
  eq('금고 종류·중심·HP',['vault',180,368,10,10],fields(list[7].blocks[0],'kind','x','y','hp','maxHp'));
  eq('×5 칸',[[2],[2],[0],[4],[2],[1,3],[0],[2]],list.map(b =>
    b.buckets.mult.map((m,i)=>m===5?i:-1).filter(i=>i>=0)));
  eq('힌트',[null,{ball:'iron'},{load:'all'},null,{ball:'iron'},null,{ball:'iron'},null],JD.STAGES.map(s=>s.hint));
  eq('목표 점수',[3000,35000,25000,30000,120000,60000,20000,400000],JD.STAGES.map(s=>s.target));
  eq('고정 보상',[['ballIron'],['springLoad'],null,null,null,null,null,null],JD.STAGES.map(s=>s.reward));
  eq('새로 생성한 워프 입구 상태',true,list.every(b=>!b.warps || b.warps.ins.every(entrance=>entrance.alive===true)));
  eq('새 보드의 주차와 핀 접촉 초기화',true,list.every(b=>b.parked.length===0 && b.pegs.every(p=>(p.touches||0)===0)));
  eq('시드 1~100 금고 파괴 수',24,range(100,seed => all(shot(board(8,seed),0.85).events,'block_broken')
    .some(e=>e.kind==='vault')).filter(Boolean).length);
  eq('같은 시드 보드 재생성',true,list.every((b,i)=>JSON.stringify(b)===JSON.stringify(board(i+1))));
});
test('F02','첫 발',eq => {
  const g=JD.createGame({seed:1}), es=g.drainEvents(); fire(g,0.85);
  eq('1틱 상태','LAUNCH',until(g,1,es).state);
  eq('첫 발사',[1,1,0.85,true,['normal'],2],
    fields(one(es,'shot_fired'),'tick','stage','power','perfect','balls','ballsLeft'));
  eq('발사 이벤트에 스프링과 스핀 없음',false,['spring','spin'].some(key=>key in one(es,'shot_fired')));
  eq('13틱 상태','FLIGHT',until(g,13,es).state);
  eq('레인 진입: 틱·세기·PERFECT·콤보·구슬',[13,0.85,true,1,['normal']],fields(one(es,'launch'),'tick','power','perfect','tier','balls'));
  until(g,'BANNER',es);
  eq('첫 적중: 틱·id·종류·원인·콤보·점수',[38,3,'bomb','ball',1,30],
    fields(one(es,'peg_hit'),'tick','id','pegType','cause','tier','pts'));
  eq('폭탄 틱·핀 수',[38,7],[one(es,'bomb_exploded').tick,(one(es,'bomb_exploded').lit||[]).length]);
  eq('콤보 단계·순번',[[2,8],[3,16],[4,24]],all(es,'combo_up').map(e=>fields(e,'tier','n')));
  eq('비행 중 깨진 핀·구슬끼리 충돌 수',[9,0],[all(es,'peg_break').length,all(es,'ball_hit').length]);
  eq('비행 종료: 틱·t·핀·핀값·저금·금·배수·칸 합·점수·콤보·주차',[424,404,30,885,0,4,5,5,22125,4,0],
    fields(one(es,'shot_finished'),'tick','t','hits','pts','bankIn','golds','stageMult','bucketSum','score','tier','parked'));
  eq('칸·정산 길이·종료 틱·단계 점수',[2,130,554,22125],
    [one(es,'ball_landed').bucket,one(es,'payout_done').tick-one(es,'shot_finished').tick,...fields(one(es,'payout_done'),'tick','stageScore')]);
});
test('F03','아까운 실패',eq => {
  const g=JD.createGame({seed:1}), es=g.drainEvents();
  [0.2,0.1,0.2].forEach((p,i)=>{ fire(g,p); until(g,'PAYOUT',es); until(g,i===2?'BANNER':'AIM',es); });
  const v=g.snapshot(), end=until(g,'RESULT',es);
  eq('발 점수·PERFECT',[[1550,150,1000],[false,false,false]],
    [all(es,'shot_finished').map(e=>e.score),all(es,'shot_fired').map(e=>e.perfect)]);
  eq('배수·단계 점수·달성률·배너·배너 길이',[2,2700,90,'SO CLOSE!',45],
    [v.stageMult,v.stageScore,one(es,'stage_failed').ratio,v.banner.text,end.tick-v.tick]);
  eq('완주·클리어 수·도달 단계·지도·PERFECT 횟수',[false,0,1,'TUTORIAL',0],
    fields(end.result,'won','reached','stageReached','stageName','perfects'));
});
test('F04','고정 보상과 2단계',eq => {
  const {g,es}=tutorial(), clear=one(es,'stage_clear');
  eq('정산·클리어 틱·단계·단계 점수·남은 공·보너스·판 점수',[554,554,1,22125,2,600,22725],
    [one(es,'payout_done').tick,...fields(clear,'tick','stage','stageScore','ballsLeft','bonus'),g.snapshot().runScore]);
  eq('고정 보상 제시',[614,['ballIron'],true],fields(one(es,'cards_offered'),'tick','ids','fixed'));
  const rejected=send(g,{type:'pick',index:1},{type:'pick',index:2});
  eq('범위 밖 카드 거부',['CARD',0],[g.snapshot().state,all(rejected,'card_picked').length]);
  const taken=send(g,{type:'pick',index:0}), v=g.snapshot();
  eq('카드 선택 id·레벨',['ballIron',1],fields(one(taken,'card_picked'),'id','level'));
  eq('2단계 시작',[2,'IRON LID',35000,3,false],fields(one(taken,'stage_started'),'stage','name','target','balls','endless'));
  eq('랙·남은 랙·장전·구슬·힌트·쇠 벽·주차·저금·줄·높이',[rack,rack,0,[0],1,'iron',{ball:'iron'},[true],[],0,12,640],
    [...fields(v,'fullRack','rack','slot','loaded','load','ball','hint'),v.iron.map(w=>w.alive),...fields(v,'parked','bank','rows','boardH')]);
  eq('스냅샷에 스프링 선택 없음',false,['springs','spring'].some(key=>key in v));
  const changed=send(g,{type:'pickBall',slot:1});
  eq('일반 구슬 선택',[1,'normal',[1],'normal'],[...fields(one(changed,'ball_picked'),'slot','ball','loaded'),g.snapshot().ball]);
  send(g,{type:'pickBall',slot:2});
  eq('한 칸 장전 교체',[2],g.snapshot().loaded);
  send(g,{type:'loadAll'});
  eq('한 칸 장전의 모두 장전 무시',[2],g.snapshot().loaded);
  const exact=tutorial().g;
  eq('정상 선택 틱',615,one(send(exact,{type:'pick',index:0}),'card_picked').tick);
});
test('F05','분열',eq => {
  const u=up({split:2}), v=shot(board(1,1,u),0.85,u);
  eq('공 수·칸·칸 합·핀·폭발·배수·점수·구슬 충돌 수',[3,[2,1,2],12,67,2,8,262560,6],
    [v.s.balls.length,v.cells,v.s.bucketSum,v.s.hits,all(v.events,'bomb_exploded').length,v.s.board.mult,v.s.score,all(v.events,'ball_hit').length]);
});
test('F06','강화 수치와 칸 배치',eq => {
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
test('F07','카드 제시와 적용',eq => {
  const u=up(), next=JD.mulberry32(1000); let calls=0;
  const counted=()=>{ calls++; return next(); };
  eq('무작위 카드 11종과 고정 장전 카드 제외',[11,false],[JD.CARD_IDS.length,JD.CARD_IDS.includes('springLoad')]);
  eq('고정 보상·난수 사용',[['ballIron'],['springLoad'],0],[JD.drawOffer(counted,u,0),JD.drawOffer(counted,u,1),calls]);
  eq('시드 1·2 세 장',[['ballGlass','ballBig','split'],['heavy','fever','goldPlus']],
    [JD.drawOffer(counted,u,2),JD.drawOffer(JD.mulberry32(1001),u,2)]);
  eq('상한 8종 제외',[8,['fever','bombPlus','heavy']],
    [Object.keys(JD.CARD_CAP).length,JD.drawOffer(JD.mulberry32(1000),up(JD.CARD_CAP),2)]);
  const staged=up(), draw=JD.mulberry32(1000);
  const offers=range(4,i=>{
    const offer=JD.drawOffer(draw,staged,i-1);
    JD.applyCard(staged,offer[0]);
    return offer;
  });
  eq('순차 카드 제시와 적용 결과',[[['ballIron'],['springLoad'],['ballGlass','ballBig','split'],['ballBig','goldPlus','jackpot']],['iron','glass','big'],3],
    [offers,staged.rack,staged.load]);
  eq('시드 1~100 단계 3~12 세 장 중복 없음',true,
    range(100,seed=>range(10,i=>JD.drawOffer(JD.mulberry32(seed+999),u,i+1))).every(
      entries=>entries.every(cards=>cards.length===3 && new Set(cards).size===3)));
  eq('초기 한 칸 장전',1,u.load);
  JD.applyCard(u,'ballIron');
  eq('쇠 구슬 첫 적용',rack,u.rack.slice());
  JD.applyCard(u,'springLoad');
  eq('MULTI LOAD 적용',[3,rack],[u.load,u.rack.slice()]);
  ['ballGlass','ballBig','ballIron','extra'].forEach(id=>JD.applyCard(u,id));
  eq('카드 적용 후 랙·스프링 필드 없음',[['iron','glass','big','iron','normal'],false],[u.rack,'springs' in u]);
});
test('F08','정산 길이와 건너뛰기',eq => {
  eq('핀 0·9·28·30·34·61개 정산 틱',[70,97,126,130,104,131],[0,9,28,30,34,61].map(JD.payoutDuration));
  const g=JD.createGame({seed:1}), es=g.drainEvents(); fire(g,0.85);
  eq('정산 진입 경과·길이',[0,130],fields(until(g,'PAYOUT',es).payout,'elapsed','duration'));
  until(g,449,es);
  eq('450틱 skip 즉시 종료',[450,22125],fields(one(send(g,{type:'skip'}),'payout_done'),'tick','stageScore'));
});
test('F09','끼임과 시간 제한',eq => {
  const peg={id:7,x:300,y:400,type:'normal',lit:true,alive:true};
  const s=JD.createShot(blank({pegs:[peg]}),0.5,up());
  Object.assign(s.balls[0],{vx:0,vy:-0.22,slow:44}); JD.stepShot(s);
  eq('끼임 핀·생존·slow',[[7],false,0],[one(s.events,'stuck_clear').ids,peg.alive,s.balls[0].slow]);
  const v=shot(blank({maxFlight:5}),0.5);
  eq('보드별 시간 제한 t·칸·timeout',[5,0,true],[v.s.t,...fields(one(v.events,'ball_landed'),'bucket','timeout')]);
  eq('전역 시간 제한 필드 없음',false,'MAX_FLIGHT' in JD.CFG);
});
test('F10','밸런스 하네스',eq => {
  [
    ['random',200,2,[199,85,39,18,8,4,2,2],1,[6480,31400],1.18],
    ['aim',200,38,[200,164,129,98,80,59,46,38],8,[19100,63750,81750,49560,1233630,489600,123900,955395],1.65],
    ['pro',20,17,[20,17,17,17,17,17,17,17],8,[18400,73750,88410,182820,1036800,136800,289680,1432505],2.08]
  ].forEach(([policy,n,wins,clears,reached,points,meanLoad])=>{
    const runs=range(n,seed=>JD.simulateRun(seed,policy));
    eq(policy+' 완주·단계별 클리어 수',[wins,clears],
      [runs.filter(r=>r.won).length,range(8,i=>runs.filter(r=>r.reached>=i).length)]);
    eq(policy+' 시드 1 완주·도달·단계 점수',[reached===8,reached,points],
      [runs[0].won,runs[0].reached,runs[0].stages.map(s=>s.score)]);
    const loads=runs.reduce((total,run)=>total+run.loaded,0);
    const shots=runs.reduce((total,run)=>total+run.shots,0);
    eq(policy+' 발당 장전한 공 수',meanLoad,Number((loads/shots).toFixed(2)));
  });
});

test('F15','게이트',eq => {
  const plus=()=>makeGate(0,'plus',152,240), minus=(id=0)=>makeGate(id,'minus',84,368);
  const a=shot(blank({gates:[plus()]}),0.5);
  eq('초록: 게이트 id·공 id·결과·공 수·칸·배수 합·스텝·게이트 생존·구슬 충돌',[0,0,'spawn',2,[0,4],2,71,false,0],
    [...fields(one(a.events,'gate_passed'),'id','ball','result'),a.s.balls.length,a.cells,a.s.bucketSum,a.steps,a.s.board.gates[0].alive,all(a.events,'ball_hit').length]);
  const glass=shot(blank({gates:[plus()]}),0.5,up(),{ball:'glass'});
  eq('복제 공의 구슬 종류',['glass','glass'],glass.s.balls.map(ball=>ball.key));
  const b=shot(blank({gates:[plus(),minus(1)]}),0.5);
  eq('빨강 제거: 공 id·결과·공 손실·남은 공 칸·배수 합·스텝',[0,'removed',true,4,1,70],
    [...fields(all(b.events,'gate_passed')[1]||{},'ball','result'),b.s.balls[0].lost,b.cells[1],b.s.bucketSum,b.steps]);
  const c=shot(blank({gates:[minus()]}),0.5);
  eq('빨강 마지막 공 보호: 결과·칸·배수 합·스텝',['saved',[0],1,71],[one(c.events,'gate_passed').result,c.cells,c.s.bucketSum,c.steps]);
  const g=plus(), s=JD.createShot(blank({gates:[g]}),0.5,up());
  s.balls.push(...range(5,()=>JD.newBall(152,239,0,1,'normal')));
  JD.passGate(s,s.balls[0],0,g);
  eq('초록 공 상한',['capped',6],[one(s.events,'gate_passed').result,s.balls.length]);
});
test('F16','HP 블록',eq => {
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
  eq('쇠 구슬 HP 4 피해 순서·보너스·핀값·금·배수·칸·점수',[[2,0],80,90,1,2,2,900],
    [all(f.events,'block_hit').map(e=>e.hp),one(f.events,'block_broken').bonus,f.s.pts,f.s.golds,f.s.board.mult,f.cells[0],f.s.score]);
});
test('F17','무한 모드',eq => {
  const defs=[8,9,10,11].map(JD.stageDef);
  eq('지도·목표·블록 HP·칸 배치',[
    ['BOWL',560000,[7,7,7,7,7],'twin'],['RING',784000,[6,8,6],'left'],
    ['VAULT',1098000,[12,8,8,8,8],'center'],['BOWL',1537000,[9,9,9,9,9],'twin']],
    defs.map(s=>[s.name,s.target,s.blocks.map(b=>b[4]),s.buckets]));
  eq('9단계 무한 모드·워프·고정 보상, 10단계 쇠 벽·힌트',[true,true,null,1,{ball:'iron'}],
    [defs[0].endless,!!defs[0].warps,defs[0].reward,defs[1].iron.length,defs[1].hint]);
  eq('9단계 시드 1 보드',[67,10,5,3,5,0,0,1],counts(board(9)));
  eq('무한 모드 금고 보드는 24줄',24,defs[2].rows);
  const pro=JD.simulateRun(1,'pro',20);
  eq('숙련 시드 1 완주·도달·9단계 점수·9단계 클리어',[true,8,535260,false],
    [pro.won,pro.reached,pro.stages[8].score,pro.stages[8].clear]);
  const g=JD.createGame({seed:4,start:8}), es=g.drainEvents();
  eq('시드 4 연습 8 시작 랙·장전 상한·줄·높이',[rack,3,24,1024],fields(g.snapshot(),'fullRack','load','rows','boardH'));
  queue(g,...[1,0,2,0].map(slot=>({type:'pickBall',slot})));
  fire(g,0.85); until(g,'CARD',es);
  eq('8단계 발사 구슬·점수·금고 파괴·워프',[['normal','normal','iron'],545160,1,1],
    [one(es,'shot_fired').balls,one(es,'shot_finished').score,
      all(es,'block_broken').filter(e=>e.kind==='vault').length,all(es,'warp').length]);
  const c=one(es,'stage_clear'), a=one(es,'all_clear'), p=one(es,'payout_done'), o=one(es,'cards_offered');
  eq('정산→클리어→ALL CLEAR 같은 틱·단계·점수·남은 공·보너스',[true,true,8,545160,0,0],
    [p.tick===c.tick && c.tick===a.tick, es.indexOf(p)<es.indexOf(c) && es.indexOf(c)+1===es.indexOf(a),
      ...fields(c,'stage','stageScore','ballsLeft','bonus')]);
  eq('무한 카드 전 배너 길이·카드',[90,['fever','bombPlus','ballIron'],false],[o.tick-c.tick,o.ids,o.fixed]);
  const taken=send(g,{type:'pick',index:0});
  eq('9단계 시작',[9,'BOWL',560000,3,true],fields(one(taken,'stage_started'),'stage','name','target','balls','endless'));
});
test('F18','벽과 검수용 시작',eq => {
  eq('세로·사선 벽: 충돌·스텝·칸',[[1,70,4],[2,124,2]],
    [[152,200,152,300],[100,220,200,300]].map(w=>{
      const v=shot(blank({terrain:[w]}),0.5);
      return [all(v.events,'terrain_hit').length,v.steps,v.cells[0]];
    }));
  const g=JD.createGame({seed:1,start:8}), h=JD.createGame({seed:1,start:2});
  eq('8단계 연습 시작',[8,'VAULT',400000,3,false],fields(one(g.drainEvents(),'stage_started'),'stage','name','target','balls','endless'));
  eq('8단계 핀·판 점수',[128,0],[g.snapshot().pegs.length,g.snapshot().runScore]);
  eq('2단계 지도·랙·장전 상한',['IRON LID',rack,1],fields(h.snapshot(),'stageName','fullRack','load'));
  eq('3단계 지도·랙·장전 상한',['CURVE',rack,3],fields(JD.createGame({seed:1,start:3}).snapshot(),'stageName','fullRack','load'));
});
test('F19','발사대·구슬·핀 깨짐',eq => {
  eq('PERFECT 경계',[false,true,true,false],[0.77,0.78,0.90,0.91].map(JD.isPerfect));
  eq('고정 스프링과 스핀 제외',[{vMin:1.5,vMax:9,perfectLo:0.78,perfectHi:0.90,perfectTier:1,charge:60},false,false],
    [JD.SPRING,'SPRINGS' in JD,'SPIN_KICK' in JD.CFG]);
  eq('세기별 세기·vx·PERFECT·콤보·반지름',[
    [0.05,-1.875,false,0,8],[1,-9,false,0,8],[0.85,-7.875,true,1,8],[0.5,-5.25,false,0,11]],
    [[0],[1],[0.85],[0.5,{ball:'big'}]].map(([p,k])=>{
        const s=JD.createShot(blank(),p,up(),k);
        return [s.power,Number(s.balls[0].vx.toFixed(6)),s.perfect,s.tier,s.balls[0].r];
      }));
  const picks={balls:['normal','big','iron']};
  const launch=(u)=>JD.createShot(blank(),0.85,u,picks).balls.map(b=>[Number(b.vx.toFixed(3)),...fields(b,'r','wait','key')]);
  eq('한 칸 장전 상한',[[-7.875,8,0,'normal']],launch(up()));
  eq('세 칸 장전의 속도·반지름·대기·종류',[[-7.875,8,0,'normal'],[-7.402,11,8,'big'],[-6.93,8,16,'iron']],launch(multiLoad()));
  const curveShots=range(20,i=>shot(board(3),i/20).cells);
  eq('CURVE 20가지 착지 칸·JACKPOT 수',['4 4 33 33 33 3 0 4 4 4 4 0 3 0 32 4 0 3 0 4',5],
    [curveShots.map(cells=>cells.join('')).join(' '),curveShots.filter(cells=>cells.includes(0)).length]);
  const a=shot(board(3),0.85);
  eq('CURVE 0.85 점수·칸·핀',[3075,0,12],[a.s.score,a.cells[0],a.s.hits]);
  const u=up(); JD.applyCard(u,'ballGlass');
  const c=shot(board(1,1,u),0.88,u,{ball:'glass'});
  eq('유리 파열 수·착지 칸·핀·점수',[[2],[2,2,2],47,182175],
    [all(c.events,'ball_shatter').map(e=>e.count),c.cells,c.s.hits,c.s.score]);
  const tutorialShot=shot(board(1),0.85);
  const broken=all(tutorialShot.events,'peg_break').map(event=>tutorialShot.s.board.pegs.find(peg=>peg.id===event.id));
  eq('깨진 핀은 두 번 충돌 후 더 이상 접촉하지 않음',[9,true],
    [broken.length,broken.every(peg=>!peg.alive && peg.touches===2)]);
  const peg={id:0,x:180,y:300,type:'normal',lit:false,alive:true};
  const uncontacted=JD.createShot(blank({pegs:[peg]}),0.5,up());
  JD.lightPeg(uncontacted,peg,'ball');
  eq('점등만으로 접촉 횟수를 늘리지 않음',0,peg.touches||0);
  const g=JD.createGame({seed:1}), es=send(g,{type:'hold'});
  eq('1틱 충전 시작·충전·세기',[1,true,1/60],[one(es,'charge_started').tick,...fields(g.snapshot(),'charging','power')]);
  const sixty=until(g,60,es), later=until(g,70,es);
  eq('47틱 PERFECT·60틱 이후 100% 유지',[[47,'perfect'],1,1],
    [fields(one(es,'charge_zone'),'tick','zone'),sixty.power,later.power]);
  const held=JD.createGame({seed:1}); queue(held,{type:'hold'}); until(held,51);
  const releases=send(held,{type:'release'});
  until(held,'PAYOUT',releases);
  eq('52틱 홀드 발사 세기·PERFECT·구슬·남은 공',[52,0.85,true,['normal'],2],
    fields(one(releases,'shot_fired'),'tick','power','perfect','balls','ballsLeft'));
  eq('64틱 진입·475틱 종료·발 점수',[64,475,22125],[one(releases,'launch').tick,...fields(one(releases,'shot_finished'),'tick','score')]);
  const brief=JD.createGame({seed:1}); queue(brief,{type:'hold'}); until(brief,2);
  const cancel=send(brief,{type:'release'});
  eq('짧은 홀드 취소 틱·세기·발사 수·남은 공·리셋',[3,2/60,0,3,0],
    [...fields(one(cancel,'charge_cancel'),'tick','power'),all(cancel,'shot_fired').length,...fields(brief.snapshot(),'ballsLeft','power')]);
  const guards=JD.createGame({seed:1,start:3});
  const tools=[{type:'pickBall',slot:1},{type:'loadAll'},{type:'pickSpring',spring:'spin',spin:1}];
  eq('대기 상태 스프링 선택은 무시',[],all(send(guards,tools[2]),'spring_picked'));
  const during=send(guards,{type:'hold'},...tools);
  eq('충전 중 구슬 변경·모두 장전 무시',['iron',[0],0,0],
    [...fields(guards.snapshot(),'ball','loaded'),all(during,'ball_picked').length,all(during,'spring_picked').length]);
  fire(guards,0.1); const before=until(guards,'LAUNCH');
  const ignored=send(guards,{type:'hold'},{type:'release'},{type:'pull',power:0.85},{type:'fire'},...tools);
  eq('AIM 외 입력 무시',[before.power,before.ballsLeft,before.ball,before.loaded,[]],
    [...fields(guards.snapshot(),'power','ballsLeft','ball','loaded'),
      ignored.filter(e=>['shot_fired','charge_started','charge_cancel','ball_picked','spring_picked'].includes(e.type))]);
  const original=JD.createGame({seed:1});
  fire(original,0.1);
  eq('원래 재현의 첫 발 0.1은 3,150점으로 카드를 엶',[3150,'CARD'],fields(until(original,'CARD'),'stageScore','state'));
  // Use the first two F03 shots to reach AIM after a 0.1 shot.
  const next=JD.createGame({seed:1});
  for (const power of [0.2,0.1]) {
    fire(next,power);
    until(next,'PAYOUT');
    eq('다음 AIM 세기·직전 세기',[0,power],fields(until(next,'AIM'),'power','lastPower'));
  }
});
test('F20','철문·주차·저금·워프·탄창',eq => {
  const upgrades=multiLoad(), lid=board(2,1,upgrades);
  const bankedShot=power=>{
    const v=shot(lid,power,upgrades);
    return [all(v.events,'ball_parked').length,v.s.score,v.s.pts,v.s.bucketSum,v.steps,lid.parked.map(ball=>ball.bank),lid.mult];
  };
  eq('첫 번째 일반 구슬의 주차·점수·핀값·칸 합·스텝·저금·배수',[1,0,530,0,610,[530],3],bankedShot(0.5));
  eq('두 번째 일반 구슬의 주차·점수·핀값·칸 합·스텝·저금·배수',[1,0,105,0,313,[530,105],5],bankedShot(0.85));
  const iron={ball:'iron'};
  const released=shot(lid,0.85,upgrades,iron);
  eq('철구 파괴·방출·착지·칸 합·핀값·저금·점수·스텝·주차·철문',[[0],[0,2],[2,2,2],15,15,635,48750,131,[],false],
    [all(released.events,'iron_break').map(event=>event.id),fields(one(released.events,'parked_release'),'group','count'),released.cells,
      released.s.bucketSum,released.s.pts,released.s.bankIn,released.s.score,released.steps,lid.parked,lid.iron[0].alive]);
  const earlyBreak=board(2);
  eq('철구부터 쏘면 세 발 모두 잭팟에 착지하고 주차하지 않음',[[1650,[2],0],[1500,[2],0],[1350,[2],0]],
    [[0.85,iron],[0.5,{}],[0.85,{}]].map(([power,pick])=>{
      const v=shot(earlyBreak,power,up(),pick);
      return [v.s.score,v.cells,all(v.events,'ball_parked').length];
    }));
  eq('세기 20개에서 일반은 주차, 쇠는 철문 파괴',[20,20],[['normal','ball_parked'],['iron','iron_break']].map(([ball,kind])=>
    range(20,i=>shot(board(2),i/20,up(),{ball}).events.some(event=>event.type===kind)).filter(Boolean).length));
  eq('단일 쇠 벽 충돌·파괴 수·주차·칸·스텝·생존',[[1,0,2,114,true],[1,0,0,74,false]],
    [['normal','iron_hit'],['iron','iron_break']].map(([ball,kind])=>{
      const wall={id:0,segs:[[100,250,220,250]],alive:true};
      const v=shot(blank({iron:[wall]}),0.5,up(),{ball});
      return [all(v.events,kind).length,all(v.events,'ball_parked').length,v.cells[0],v.steps,wall.alive];
    }));
  const warpBoard=blank({warps:{ins:[{x:152,y:240,alive:true}],outs:[{x:60,y:140},{x:300,y:140}],rnd:{s:7}}});
  const w=shot(warpBoard,0.5);
  eq('단일 워프의 입구·출구·횟수·칸·스텝·t·입구 상태',[[0,0,60,140],1,0,102,98,false],
    [fields(one(w.events,'warp'),'from','to','ox','oy'),all(w.events,'warp').length,w.cells[0],w.steps,w.s.t,warpBoard.warps.ins[0].alive]);
  const nextWarp=shot(warpBoard,0.5);
  eq('같은 보드 닫힌 입구와 두 번째 발',[0,[0],71],[all(nextWarp.events,'warp').length,nextWarp.cells,nextWarp.steps]);
  const warps=board(4).warps;
  eq('4단계 워프 시드·출구 번호',[2967,[0,0,2,1,0,0]],
    [warps.rnd.s,range(6,()=>Math.floor(JD.nextRand(warps.rnd)*warps.outs.length))]);
  const h=shot(board(4),0.15);
  eq('4단계 첫 발 입구·출구·좌표·칸·점수·입구 상태',[[[1,0,324,140]],[4,4],35350,[true,false]],
    [all(h.events,'warp').map(event=>fields(event,'from','to','ox','oy')),h.cells,h.s.score,h.s.board.warps.ins.map(entrance=>entrance.alive)]);
  const g=JD.createGame({seed:1,start:2});
  eq('2단계 초기 탄창·선택',[rack,0],fields(g.snapshot(),'rack','slot'));
  const first=send(g,{type:'pickBall',slot:1},{type:'pull',power:0.5},{type:'fire'});
  eq('첫 일반 구슬 선택',[1,'normal',[1]],fields(one(first,'ball_picked'),'slot','ball','loaded'));
  until(g,'PAYOUT',first); const firstAim=until(g,'AIM',first);
  eq('1차 주차 점수·핀값·주차와 2발 남은 탄창',[0,530,1,[530],530,['iron','normal'],0,2],
    [...fields(one(first,'shot_finished'),'score','pts','parked'),firstAim.parked.map(ball=>ball.bank),...fields(firstAim,'bank','rack','slot','ballsLeft')]);
  queue(g,{type:'pickBall',slot:1}); fire(g,0.85);
  const second=[];
  until(g,'PAYOUT',second); const secondAim=until(g,'AIM',second);
  eq('2차 주차 점수·주차·저금·탄창',[0,1,635,['iron']],
    [...fields(one(second,'shot_finished'),'score','parked'),...fields(secondAim,'bank','rack')]);
  fire(g,0.85);
  const third=[];
  until(g,'CARD',third);
  eq('3차 방출·점수·저금·칸 합·단계 종료·남은 구슬·보너스',[2,48750,635,15,2,48750,0,0],
    [one(third,'parked_release').count,...fields(one(third,'shot_finished'),'score','bankIn','bucketSum'),
      ...fields(one(third,'stage_clear'),'stage','stageScore','ballsLeft','bonus')]);
  eq('2단계 고정 보상',[['springLoad'],true],fields(one(third,'cards_offered'),'ids','fixed'));
  send(g,{type:'pick',index:0});
  eq('3단계 랙·장전 상한과 빈 주차',[3,rack,rack,3,[]],fields(g.snapshot(),'stage','fullRack','rack','load','parked'));
});
test('F21','MULTI LOAD와 공끼리 충돌',eq => {
  const u=multiLoad(), selection={balls:['normal','normal','iron']};
  const together=seed=>shot(board(3,seed,u),0.84,u,selection);
  const separate=seed=>{
    const b=board(3,seed,u);
    return [[0.8,'normal'],[0.84,'normal'],[0.88,'iron']].map(([power,ball])=>shot(b,power,u,{ball}).s.score);
  };
  const single=together(1);
  eq('세 구슬 진입 세기·PERFECT·콤보·발사 순서',[0.84,true,1,selection.balls],fields(one(single.events,'launch'),'power','perfect','tier','balls'));
  eq('공 수·칸·칸 배수·핀값·금·단계 배수·핀·점수·스텝·t·구슬 충돌',
    [4,[2,3,1,2],6,1935,7,8,51,92880,394,390,5],
    [single.s.balls.length,single.cells,single.s.bucketSum,single.s.pts,single.s.golds,single.s.board.mult,
      single.s.hits,single.s.score,single.steps,single.s.t,all(single.events,'ball_hit').length]);
  eq('한 보드에서 한 공씩 세 발 점수',[30,17025,270],separate(1));
  const stats=points=>{
    const ordered=points.slice().sort((a,b)=>a-b);
    // ACCEPTANCE reports the upper middle score as its median for 20 seeds.
    return [ordered[0],ordered[10],ordered[19],points.filter(score=>score>=25000).length];
  };
  eq('시드 1~20 묶음의 최저·위쪽 중앙·최고·목표 도달 수',[18720,55520,124200,17],stats(range(20,seed=>together(seed).s.score)));
  eq('시드 1~20 한 공씩 발사의 최저·위쪽 중앙·최고·목표 도달 수',[1715,9795,35760,1],
    stats(range(20,seed=>separate(seed).reduce((sum,score)=>sum+score,0))));
  const launched=JD.createShot(blank(),0.84,u,selection);
  eq('발사 사이의 대기 틱',[0,8,16],launched.balls.map(ball=>ball.wait));
  let waitingUntouched=true;
  for(let frame=1;frame<=15;frame++) {
    JD.stepShot(launched);
    const waiting=launched.balls.filter(ball=>ball.wait>0);
    waitingUntouched=waitingUntouched&&waiting.every(ball=>ball.x===352&&ball.y===60&&!ball.done);
  }
  eq('대기 중 좌표와 착지 상태 유지, 충돌 없음',[true,0,0],
    [waitingUntouched,all(launched.events,'ball_hit').length,all(launched.events,'ball_landed').length]);
  const g=JD.createGame({seed:1,start:3}), es=g.drainEvents();
  eq('3단계 기본 장전 순서와 힌트',[3,[0],{load:'all'}],fields(g.snapshot(),'load','loaded','hint'));
  const pick=slot=>{send(g,{type:'pickBall',slot});return g.snapshot().loaded;};
  eq('탄창 장전 추가·삭제, 마지막 한 공 유지',[[0,1],[1],[1],[1,2],[1,2,0]],[1,0,1,2,0].map(pick));
  send(g,{type:'loadAll'});
  eq('모두 장전은 탄창 순서',[0,1,2],g.snapshot().loaded);
  pick(0); pick(0);
  eq('쇠 구슬을 마지막으로 다시 장전',[1,2,0],g.snapshot().loaded);
  fire(g,0.84); until(g,'BANNER',es);
  eq('장전한 세 구슬 발사 및 차감',[3,0.84,true,selection.balls,0],fields(one(es,'shot_fired'),'stage','power','perfect','balls','ballsLeft'));
  eq('묶음 발 점수와 3단계 클리어',[92880,3,92880,0,0],
    [one(es,'shot_finished').score,...fields(one(es,'stage_clear'),'stage','stageScore','ballsLeft','bonus')]);
  const contact=JD.createShot(blank(),0.5,u);
  contact.balls=[JD.newBall(100,100,2,0,'normal'),JD.newBall(115,100,0,0,'normal')];
  JD.ballContacts(contact);
  eq('동일 질량 공끼리 반발 계수 0.9',[0.1,1.9,0,1],
    [...contact.balls.map(ball=>Number(ball.vx.toFixed(1))),...fields(one(contact.events,'ball_hit'),'a','b')]);
  const parked={x:115,y:100,r:8,ball:'normal',group:0,bank:635};
  const iron={id:0,segs:[[90,130,140,130]],alive:true};
  const pile=JD.createShot(blank({parked:[parked],iron:[iron]}),0.5,u);
  pile.balls=[JD.newBall(100,100,2,0,'normal')];
  JD.ballContacts(pile);
  eq('주차한 공은 고정되고 날아온 공만 0.3 반발',[115,100,-0.6,0],
    [parked.x,parked.y,Number(pile.balls[0].vx.toFixed(1)),pile.balls[0].parkTouch]);
  pile.balls=[JD.newBall(100,100,2,0,'iron')];
  JD.ballContacts(pile);
  eq('쇠 공이 주차 더미로 철문을 깨고 저금을 방출',['pile',false,1,0,635],
    [one(pile.events,'iron_break').via,iron.alive,one(pile.events,'parked_release').count,pile.board.parked.length,pile.balls[1].bank]);
});
test('F22','긴 보드와 워프 한 번',eq => {
  eq('24줄 고정 단계',[5,8],JD.STAGES.map((stage,index)=>stage.rows===24?index+1:0).filter(Boolean));
  eq('12줄과 24줄 보드 규격',[{rows:12,landY:596,h:640,maxFlight:720},{rows:24,landY:980,h:1024,maxFlight:1440}],
    [JD.boardSize({}),JD.boardSize({rows:24})]);
  const grid=JD.pegGrid(24);
  eq('24줄 핀 위치 수와 마지막 줄',[204,896],[grid.length,grid[grid.length-1].y]);
  const z=shot(board(5),0.85);
  eq('ZIGZAG 철문 높이·주차·점수·스텝·t',[964,1,0,875,871],
    [z.s.board.iron[0].segs[0][1],z.s.board.parked.length,z.s.score,z.steps,z.s.t]);
  const vault=JD.createShot(board(8),0.85,up());
  let steps=0,maxY=0,done=false;
  while(!done&&steps<2000) {
    done=JD.stepShot(vault);
    steps++;
    maxY=Math.max(maxY,vault.balls[0].y);
  }
  eq('VAULT 착지 칸·점수·스텝·공의 최대 높이',[2,35375,853,983],
    [vault.balls[0].bucket,vault.score,steps,Math.round(maxY)]);
  eq('12줄 게이트는 긴 보드용 위치를 제외',true,range(8,i=>board(i)).filter(b=>b.rows===12)
    .every(b=>b.gates.every(gate=>![592,720,848].includes(gate.y))));
  eq('5단계의 세로 확장 게이트',['plus@72,720','minus@180,848'],z.s.board.gates.filter(gate=>gate.y>=592)
    .map(gate=>gate.kind+'@'+gate.x+','+gate.y));
  const previous=board(4);
  shot(previous,0.15);
  eq('워프는 이전 보드에서 닫히고 다음 워프 보드에서 열린 채 생성',[[true,false],[true]],
    [previous.warps.ins.map(entrance=>entrance.alive),board(6).warps.ins.map(entrance=>entrance.alive)]);
});
})(window.JD);
