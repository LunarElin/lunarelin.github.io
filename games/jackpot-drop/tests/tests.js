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
const board = (stage, seed = 1, upgrades = up(), attempt = 0) => JD.buildBoard(stage - 1, upgrades, seed, attempt);
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
const ironRack = () => {
  const upgrades=up();
  JD.applyCard(upgrades,'ballIron');
  return upgrades;
};
const makeGate = (id, kind, x, y) => ({id,kind,x,y,alive:true});
const makeBlock = (hp, kind = 'block', y = 240) => ({id:0,kind,hp,maxHp:hp,x:152,y,w:kind==='vault'?72:44,h:kind==='vault'?28:20,alive:true});
test('F01','보드 생성',eq => {
  const list = range(20, i => board(i));
  eq('핀·금·폭탄·게이트·블록·벽·쇠 벽·워프',[[102,8,3,0,0,2,0,0],[102,8,4,0,0,0,1,0],
    [98,9,4,2,0,1,0,0],[56,9,4,2,3,4,0,2],[130,14,7,3,4,0,1,0],[67,10,5,3,5,0,0,1],
    [62,12,5,4,3,0,1,0],[128,16,8,4,5,0,0,2],
    [80,11,5,4,2,4,0,0],[150,14,7,4,1,2,1,1],[88,12,6,3,5,0,1,0],[94,12,6,3,2,1,2,0],
    [79,11,5,3,1,2,0,3],[141,15,7,3,4,3,0,0],[94,12,6,5,1,0,0,0],[90,12,6,3,2,0,1,0],
    [89,12,6,2,2,1,0,2],[160,18,9,4,4,0,0,2],[149,16,8,6,1,0,1,0],[142,20,10,5,5,0,1,2]],list.map(counts));
  const funnel=(fromY,toY)=>[[0,fromY,136,toY],[360,fromY,224,toY]];
  eq('깨지지 않는 깔때기는 튜토리얼만',funnel(522,580),list[0].terrain);
  eq('다른 단계에는 깨지지 않는 바닥 V자 없음',true,list.slice(1).every(b=>b.terrain.every(seg=>
    ![...funnel(522,580),...funnel(884,964)].some(wall=>String(seg)===String(wall)))));
  eq('2·5·10·19·20단계에서는 같은 묶음에 V자와 철문',true,[2,5,10,19,20].every(stage=>{
    const b=list[stage-1], y=b.landY-16, fromY=stage===2?522:884;
    return JSON.stringify(b.iron[0].segs)===JSON.stringify([...funnel(fromY,y),[136,y,224,y]]);
  }));
  eq('12·16단계 쇠 벽 묶음별 선분 수',[[2,2],[5]],[12,16].map(stage=>list[stage-1].iron.map(group=>group.segs.length)));
  const rows=[12,12,12,12,24,12,12,24,12,24,12,12,12,24,12,12,12,24,24,24];
  eq('단계별 보드 줄·착지선·높이·시간 제한',rows.map(n=>n===24?[24,980,1024,1440]:[12,596,640,720]),
    list.map(b=>fields(b,'rows','landY','h','maxFlight')));
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
    list.slice(0,8).map(b => b.gates.map(g => g.kind+'@'+g.x+','+g.y)));
  eq('금고 종류·중심·HP',['vault',180,368,10,10],fields(list[7].blocks[0],'kind','x','y','hp','maxHp'));
  eq('×5 칸',[[2],[2],[0],[4],[2],[1,3],[0],[2],[1,3],[2],[0],[1,3],[4],[2],[0],[2],[1,3],[2],[2],[2]],list.map(b =>
    b.buckets.mult.map((m,i)=>m===5?i:-1).filter(i=>i>=0)));
  const ironHint={ball:'iron'};
  eq('힌트',[null,ironHint,null,null,ironHint,null,ironHint,null,null,ironHint,ironHint,ironHint,
    null,null,null,ironHint,null,null,ironHint,ironHint],JD.STAGES.map(s=>s.hint));
  eq('목표 점수',[3000,18000,4600,10000,62000,13000,11000,100000,84000,1030000,180000,280000,380000,600000,
    430000,2770000,650000,2000000,9710000,17130000],JD.STAGES.map(s=>s.target));
  eq('고정 보상',[['ballIron'],...Array(19).fill(null)],JD.STAGES.map(s=>s.reward));
  eq('새로 생성한 워프 입구 상태',true,list.every(b=>!b.warps || b.warps.ins.every(entrance=>entrance.alive===true)));
  eq('새 보드의 주차와 핀 접촉 초기화',true,list.every(b=>b.parked.length===0 && b.pegs.every(p=>(p.touches||0)===0)));
  eq('시드 1~100 금고 파괴 수',24,range(100,seed => all(shot(board(8,seed),0.85).events,'block_broken')
    .some(e=>e.kind==='vault')).filter(Boolean).length);
  eq('같은 시드 보드 재생성',true,list.every((b,i)=>JSON.stringify(b)===JSON.stringify(board(i+1))));
  eq('같은 시드·도전번호의 재도전 보드도 동일',board(10,1,up(),2),board(10,1,up(),2));
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
test('F03','아까운 실패와 상점',eq => {
  const g=JD.createGame({seed:1}), es=g.drainEvents();
  const initial=g.snapshot();
  [0.2,0.1,0.2].forEach((p,i)=>{ fire(g,p); until(g,'PAYOUT',es); until(g,i===2?'BANNER':'AIM',es); });
  const v=g.snapshot(), end=until(g,'SHOP',es);
  eq('발 점수·PERFECT',[[1550,150,1000],[false,false,false]],
    [all(es,'shot_finished').map(e=>e.score),all(es,'shot_fired').map(e=>e.perfect)]);
  eq('발마다 코인 획득량·잔액·사유',[[0,0,'shot'],[0,0,'shot'],[1,1,'shot']],
    all(es,'coins_earned').map(event=>fields(event,'amount','total','cause')));
  eq('배수·단계 점수·달성률·배너·배너 길이·상점',[2,2700,90,'SO CLOSE!',45,1,0,'SHOP'],
    [v.stageMult,v.stageScore,one(es,'stage_failed').ratio,v.banner.text,end.tick-v.tick,
      ...fields(one(es,'shop_opened'),'coins','attempt'),end.state]);
  eq('상점의 다섯 강화와 구매 가능 여부',[['mult',0,5,25,false],['value',0,5,15,false],['gold',0,5,15,false],
    ['ball',0,2,80,false],['blast',0,3,15,false]],end.shop.items.map(item=>fields(item,'id','level','max','cost','affordable')));
  eq('부족한 코인으로는 구매할 수 없음',[],all(send(g,{type:'buy',id:'value'}),'perk_bought'));
  const retried=send(g,{type:'retry'}), current=g.snapshot();
  eq('재도전 이벤트 및 다음 상태',[[1,1],[1,'TUTORIAL',3000,3,false,'campaign',1],['AIM',0,3,1]],
    [fields(one(retried,'stage_retry'),'stage','attempt'),fields(one(retried,'stage_started'),'stage','name','target','balls','endless','mode','attempt'),
      fields(current,'state','stageScore','ballsLeft','coins')]);
  eq('튜토리얼의 재도전 배치는 고정',initial.pegs,current.pegs);
});
test('F04','고정 보상과 2단계',eq => {
  const {g,es}=tutorial(), clear=one(es,'stage_clear');
  eq('정산·클리어 틱·단계·단계 점수·남은 공·보너스·판 점수',[554,554,1,22125,2,600,22725],
    [one(es,'payout_done').tick,...fields(clear,'tick','stage','stageScore','ballsLeft','bonus'),g.snapshot().runScore]);
  eq('첫 클리어에는 금 핀 4코인과 첫 클리어 10코인 획득',[[4,4,'shot'],[10,14,'clear']],
    all(es,'coins_earned').map(event=>fields(event,'amount','total','cause')));
  eq('고정 보상 제시',[614,['ballIron'],true],fields(one(es,'cards_offered'),'tick','ids','fixed'));
  const rejected=send(g,{type:'pick',index:1},{type:'pick',index:2});
  eq('범위 밖 카드 거부',['CARD',0],[g.snapshot().state,all(rejected,'card_picked').length]);
  const taken=send(g,{type:'pick',index:0}), v=g.snapshot();
  eq('카드 선택 id·레벨',['ballIron',1],fields(one(taken,'card_picked'),'id','level'));
  eq('2단계 시작',[2,'IRON LID',18000,3,false],fields(one(taken,'stage_started'),'stage','name','target','balls','endless'));
  eq('랙·남은 랙·장전·구슬·힌트·쇠 벽·깨지지 않는 벽·주차·저금·줄·높이',
    [rack,rack,0,'iron',{ball:'iron'},[[true,3]],[],[],0,12,640],
    [...fields(v,'fullRack','rack','slot','ball','hint'),v.iron.map(w=>[w.alive,w.segs.length]),...fields(v,'terrain','parked','bank','rows','boardH')]);
  eq('스냅샷에 스프링 선택과 여러 개 장전 없음',false,['springs','spring','load','loaded'].some(key=>key in v));
  const changed=send(g,{type:'pickBall',slot:1});
  const event=one(changed,'ball_picked');
  eq('일반 구슬 선택',[1,'normal',false,1,'normal'],[...fields(event,'slot','ball'),'loaded' in event,...fields(g.snapshot(),'slot','ball')]);
  send(g,{type:'pickBall',slot:2});
  eq('한 칸 장전 교체',2,g.snapshot().slot);
  send(g,{type:'loadAll'});
  eq('삭제된 모두 장전 명령 무시',2,g.snapshot().slot);
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
  eq('카드 11종과 여러 개 장전 카드 없음',[11,false,false],
    [JD.CARD_IDS.length,JD.CARD_IDS.includes('springLoad'),'springLoad' in JD.CARD_CAP]);
  eq('튜토리얼 고정 보상은 난수를 쓰지 않음',[['ballIron'],0],[JD.drawOffer(counted,u,0),calls]);
  eq('시드 1에서 이어진 두 제시',[['ballGlass','ballBig','split'],['ballBig','goldPlus','jackpot']],
    [JD.drawOffer(counted,u,1),JD.drawOffer(counted,u,2)]);
  eq('난수를 새로 시작한 시드 1·2의 단계번호 2 카드',[['ballGlass','ballBig','split'],['heavy','fever','goldPlus']],
    [JD.drawOffer(JD.mulberry32(1000),u,2),JD.drawOffer(JD.mulberry32(1001),u,2)]);
  eq('상한 7종 제외',[7,['fever','bombPlus','heavy']],
    [Object.keys(JD.CARD_CAP).length,JD.drawOffer(JD.mulberry32(1000),up(JD.CARD_CAP),2)]);
  const staged=up(), draw=JD.mulberry32(1000);
  const offers=range(4,i=>{
    const offer=JD.drawOffer(draw,staged,i-1);
    JD.applyCard(staged,offer[0]);
    return offer;
  });
  eq('순차 카드 제시와 적용 결과',[[['ballIron'],['ballGlass','ballBig','split'],['ballBig','goldPlus','jackpot'],['bombPlus','goldPlus','gate']],['iron','glass','big']],
    [offers,staged.rack]);
  eq('시드 1~100 단계 2~11 세 장 중복 없음',true,
    range(100,seed=>range(10,i=>JD.drawOffer(JD.mulberry32(seed+999),u,i))).every(
      entries=>entries.every(cards=>cards.length===3 && new Set(cards).size===3)));
  eq('초기 강화 키',['goldPlus','heavy','bombPlus','fever','jackpot','extra','split','gate','ballGlass','ballBig','ballIron','rack','perks'],Object.keys(u));
  JD.applyCard(u,'ballIron');
  eq('쇠 구슬 첫 적용',rack,u.rack.slice());
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
    ['random',200,19,[196,84,72,53,29,22,20,19],5,[19700,31200,16025,10080,83050,6540]],
    ['aim',200,61,[200,155,127,105,88,73,67,61],1,[19100,13700]],
    ['pro',20,17,[20,17,17,17,17,17,17,17],8,[18400,22200,11690,67230,472320,53550,17120,548100]]
  ].forEach(([policy,n,wins,clears,reached,points])=>{
    const runs=range(n,seed=>JD.simulateRun(seed,policy));
    eq(policy+' 완주·단계별 클리어 수',[wins,clears],
      [runs.filter(r=>r.won).length,range(8,i=>runs.filter(r=>r.reached>=i).length)]);
    eq(policy+' 시드 1 완주·도달·단계 점수',[reached===8,reached,points],
      [runs[0].won,runs[0].reached,runs[0].stages.map(s=>s.score)]);
    eq(policy+' 발당 구슬 하나',true,runs.every(run=>Object.values(run.picks).reduce((sum,count)=>sum+count,0)===run.shots));
    eq(policy+' 발사 선택 필드',['ball','power'],Object.keys(JD.choosePick(board(1),policy,JD.mulberry32(1000),up(),['normal'],null)).sort());
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
  const defs=[20,21,22,31,32,43].map(JD.stageDef);
  eq('무한 단계의 지도와 목표',[
    ['CROSSFIRE',17000],['DEEP WELL',231000],['LOCKBOX',45000],['GRAND JACKPOT',11918000],['CROSSFIRE',65000],['GRAND JACKPOT',46430000]],
    defs.map(s=>fields(s,'name','target')));
  eq('무한 모드·보상·긴 보드·반복 블록 HP',[true,null,24,[5,5],[7,7],[16,10,10,10,10]],
    [defs[0].endless,defs[0].reward,defs[1].rows,...[0,4,5].map(i=>defs[i].blocks.map(b=>b[4]))]);
  eq('무한 지도 풀·목표 계수·증가율',[range(12,i=>i+7),0.2,1.12],[JD.ENDLESS_POOL,JD.ENDLESS_SCALE,JD.CFG.ENDLESS_GROWTH]);
  const run=JD.simulateEndless(4,'aim',{mult:3,value:4,gold:4,ball:1,blast:3},24);
  eq('시드 4 무한 클리어 수·실패 지도·점수·목표',[4,'WARP MAZE',74420,120000],
    [run.reached,JD.stageDef(24).name,run.scores[4],JD.stageDef(24).target]);
  const g=JD.createGame({seed:1,endless:true}), es=g.drainEvents();
  eq('무한 1단계 시작 이벤트',[1,'CROSSFIRE',17000,3,true,'endless',0],
    fields(one(es,'stage_started'),'stage','name','target','balls','endless','mode','attempt'));
  eq('무한 기본 랙·코인',[rack,0],fields(g.snapshot(),'rack','coins'));
  for(let i=0;i<3;i++) {
    fire(g,0.05);
    until(g,'PAYOUT',es);
    until(g,i<2?'AIM':'BANNER',es);
  }
  const v=until(g,'RESULT',es);
  eq('무한 모드 실패는 결과 화면으로 이어짐',[false,0,1,0,'RESULT'],
    [...fields(one(es,'run_ended'),'won','reached','stageReached'),all(es,'shop_opened').length,v.state]);
});
test('F18','벽과 검수용 시작',eq => {
  eq('세로·사선 벽: 충돌·스텝·칸',[[1,70,4],[2,124,2]],
    [[152,200,152,300],[100,220,200,300]].map(w=>{
      const v=shot(blank({terrain:[w]}),0.5);
      return [all(v.events,'terrain_hit').length,v.steps,v.cells[0]];
    }));
  const g=JD.createGame({seed:1,start:8}), h=JD.createGame({seed:1,start:2});
  eq('8단계 연습 시작',[8,'VAULT',100000,3,false,'campaign',0],
    fields(one(g.drainEvents(),'stage_started'),'stage','name','target','balls','endless','mode','attempt'));
  eq('8단계 핀·판 점수',[128,0],[g.snapshot().pegs.length,g.snapshot().runScore]);
  eq('2단계 지도·랙',['IRON LID',rack],fields(h.snapshot(),'stageName','fullRack'));
  eq('3단계 지도·랙',['CURVE',rack],fields(JD.createGame({seed:1,start:3}).snapshot(),'stageName','fullRack'));
  eq('20단계 연습 시작',[20,'GRAND JACKPOT',17130000,24],fields(JD.createGame({seed:1,start:20}).snapshot(),'stage','stageName','target','rows'));
  eq('유효 범위 밖의 시작값은 1단계 일반 캠페인',true,[21,1,'x'].every(start=>{
    const v=JD.createGame({seed:1,start}).snapshot();
    return v.stage===1&&v.mode==='campaign'&&!v.practice;
  }));
});
test('F19','발사대·구슬·핀 깨짐',eq => {
  eq('PERFECT 경계',[false,true,true,false],[0.77,0.78,0.90,0.91].map(JD.isPerfect));
  eq('고정 스프링과 스핀 제외',[{vMin:1.5,vMax:9,perfectLo:0.78,perfectHi:0.90,perfectTier:1,charge:60},false,false],
    [JD.SPRING,'SPRINGS' in JD,'SPIN_KICK' in JD.CFG]);
  eq('세기별 세기·vx·PERFECT·콤보·반지름',[
    [0.05,-1.875,false,0,8,'normal'],[1,-9,false,0,8,'normal'],[0.85,-7.875,true,1,8,'normal'],[0.85,-7.875,true,1,11,'big']],
    [[0],[1],[0.85],[0.85,{ball:'big'}]].map(([p,k])=>{
        const s=JD.createShot(blank(),p,up(),k);
        return [s.power,Number(s.balls[0].vx.toFixed(6)),s.perfect,s.tier,...fields(s.balls[0],'r','key')];
      }));
  const legacyPick=JD.createShot(blank(),0.85,up(),{balls:['normal','big','iron']});
  eq('예전 여러 구슬 선택은 무시하고 대기 필드 없음',[['normal'],['normal'],false],
    [legacyPick.balls.map(ball=>ball.key),one(legacyPick.events,'launch').balls,'wait' in legacyPick.balls[0]]);
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
  eq('충전 중 구슬 변경과 삭제된 모두 장전 무시',['iron',0,0,0],
    [...fields(guards.snapshot(),'ball','slot'),all(during,'ball_picked').length,all(during,'spring_picked').length]);
  fire(guards,0.1); const before=until(guards,'LAUNCH');
  const ignored=send(guards,{type:'hold'},{type:'release'},{type:'pull',power:0.85},{type:'fire'},...tools);
  eq('AIM 외 입력 무시',[before.power,before.ballsLeft,before.ball,before.slot,[]],
    [...fields(guards.snapshot(),'power','ballsLeft','ball','slot'),
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
  const upgrades=ironRack(), lid=board(2,1,upgrades);
  const bankedShot=power=>{
    const v=shot(lid,power,upgrades);
    return [all(v.events,'ball_parked').length,v.s.score,v.s.pts,v.s.bucketSum,v.steps,lid.parked.map(ball=>ball.bank),lid.mult];
  };
  eq('첫 번째 일반 구슬의 주차·점수·핀값·칸 합·스텝·저금·배수',[1,0,530,0,594,[530],3],bankedShot(0.5));
  eq('두 번째 일반 구슬의 주차·점수·핀값·칸 합·스텝·저금·배수',[1,0,105,0,317,[530,105],5],bankedShot(0.85));
  const iron={ball:'iron'};
  const released=shot(lid,0.85,upgrades,iron);
  eq('철구 파괴·방출·착지·칸 합·핀값·저금·점수·스텝·t·주차·쇠 벽 묶음',[[0],[0,2],[2,2,3],12,0,635,38100,85,82,[],false,3],
    [all(released.events,'iron_break').map(event=>event.id),fields(one(released.events,'parked_release'),'group','count'),released.cells,
      released.s.bucketSum,released.s.pts,released.s.bankIn,released.s.score,released.steps,released.s.t,lid.parked,lid.iron[0].alive,lid.iron[0].segs.length]);
  const earlyBreak=board(2);
  eq('철구를 먼저 쏘면 세 발 모두 주차하지 않고 왼쪽 칸에 착지',[[290,[0],0],[255,[0],0],[135,[0],0]],
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
  eq('첫 일반 구슬 선택',[1,'normal'],fields(one(first,'ball_picked'),'slot','ball'));
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
  eq('3차 방출·점수·저금·칸 합·단계 종료·남은 구슬·보너스',[2,38100,635,12,2,38100,0,0],
    [one(third,'parked_release').count,...fields(one(third,'shot_finished'),'score','bankIn','bucketSum'),
      ...fields(one(third,'stage_clear'),'stage','stageScore','ballsLeft','bonus')]);
  eq('2단계 보상은 세 장',[['ballGlass','ballBig','split'],false],fields(one(third,'cards_offered'),'ids','fixed'));
  send(g,{type:'pick',index:2});
  eq('3단계 랙과 빈 주차',[3,rack,rack,[]],fields(g.snapshot(),'stage','fullRack','rack','parked'));
});
test('F21','한 발 한 구슬과 공끼리 충돌',eq => {
  const u=ironRack();
  eq('여러 개 장전 상수와 강화 필드 없음',false,['LOAD_GAP','LOAD_MAX','LOAD_SPREAD'].some(key=>key in JD.CFG)||
    ['springLoad','load'].some(key=>key in u||key in JD.CARD_CAP||JD.CARD_IDS.includes(key)));
  const oldCard=ironRack(); JD.applyCard(oldCard,'springLoad');
  eq('지워진 카드로 랙이나 장전 능력이 바뀌지 않음',[rack,false],[oldCard.rack,'load' in oldCard]);
  const direct=JD.createShot(board(3,1,u),0.84,u,{balls:['normal','normal','iron']});
  eq('예전 선택 배열 대신 일반 구슬 하나로 시작',[['normal'],['normal']],
    [direct.balls.map(ball=>ball.key),one(direct.events,'launch').balls]);
  const split=up({split:2});
  eq('분열한 공끼리 여전히 부딪힘',6,all(shot(board(1,1,split),0.85,split).events,'ball_hit').length);
  const g=JD.createGame({seed:1,start:3});
  eq('3단계 기본 장전·구슬·힌트',[0,'iron',null],fields(g.snapshot(),'slot','ball','hint'));
  const pick=slot=>{send(g,{type:'pickBall',slot});return fields(g.snapshot(),'slot','ball');};
  eq('탄창 탭은 장전 구슬만 교체',[[1,'normal'],[0,'iron']],[1,0].map(pick));
  send(g,{type:'loadAll'});
  eq('삭제된 모두 장전 명령은 아무 효과 없음',[0,'iron'],fields(g.snapshot(),'slot','ball'));
  const ironEvents=[];
  fire(g,0.84); until(g,'LAUNCH',ironEvents);
  eq('0번의 장전 구슬은 쇠 구슬 한 개',[['iron'],2],fields(one(ironEvents,'shot_fired'),'balls','ballsLeft'));
  const normal=JD.createGame({seed:1,start:3});
  const normalEvents=[];
  queue(normal,{type:'pickBall',slot:1}); fire(normal,0.84); until(normal,'LAUNCH',normalEvents);
  eq('일반 구슬을 고르면 한 개만 발사 및 차감',[3,0.84,true,['normal'],2],
    fields(one(normalEvents,'shot_fired'),'stage','power','perfect','balls','ballsLeft'));
  const flight=until(normal,'FLIGHT',normalEvents);
  eq('비행 시작 시 공 한 개와 대기 필드 없음',[['normal'],false],
    [flight.balls.map(ball=>ball.key),flight.balls.some(ball=>'wait' in ball)]);
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
  eq('24줄 고정 단계',[5,8,10,14,18,19,20],JD.STAGES.map((stage,index)=>stage.rows===24?index+1:0).filter(Boolean));
  eq('12줄과 24줄 보드 규격',[{rows:12,landY:596,h:640,maxFlight:720},{rows:24,landY:980,h:1024,maxFlight:1440}],
    [JD.boardSize({}),JD.boardSize({rows:24})]);
  const grid=JD.pegGrid(24);
  eq('24줄 핀 위치 수와 마지막 줄',[204,896],[grid.length,grid[grid.length-1].y]);
  const z=shot(board(5),0.85);
  eq('ZIGZAG V자 쇠 벽 위 주차 높이·점수·핀값·스텝·t',[[952],0,915,783,783],
    [z.s.board.parked.map(ball=>Math.round(ball.y)),z.s.score,z.s.pts,z.steps,z.s.t]);
  const vault=JD.createShot(board(8),0.85,up());
  let steps=0,maxY=0,done=false;
  while(!done&&steps<2000) {
    done=JD.stepShot(vault);
    steps++;
    maxY=Math.max(maxY,vault.balls[0].y);
  }
  eq('VAULT 착지 칸·점수·스텝·공의 최대 높이',[2,35375,853,983],
    [vault.balls[0].bucket,vault.score,steps,Math.round(maxY)]);
  eq('12줄 게이트는 긴 보드용 위치를 제외',true,range(20,i=>board(i)).filter(b=>b.rows===12)
    .every(b=>b.gates.every(gate=>![592,720,848].includes(gate.y))));
  eq('5단계의 세로 확장 게이트',['plus@72,720','minus@180,848'],z.s.board.gates.filter(gate=>gate.y>=592)
    .map(gate=>gate.kind+'@'+gate.x+','+gate.y));
  const previous=board(4);
  shot(previous,0.15);
  eq('다음 단계와 재도전 보드의 워프 입구는 열려 있음',[[true,false],[true],[true,true]],
    [previous.warps.ins.map(entrance=>entrance.alive),board(6).warps.ins.map(entrance=>entrance.alive),
      board(4,1,up(),1).warps.ins.map(entrance=>entrance.alive)]);
});
test('F23','코인과 강화',eq => {
  const ids=['mult','value','gold','ball','blast'];
  eq('강화 다섯 종류',ids,JD.PERK_IDS);
  eq('강화 비용과 상한',[[25,45,70,125,210,null],[15,25,40,60,100,null],[15,25,40,60,100,null],[80,175,null],[15,25,45,null]],
    ids.map(id=>range(JD.PERKS[id].max+1,n=>JD.perkCost(id,n-1))));
  const wallet={coins:100,perks:JD.newPerks()};
  // The listed gold costs are 15 then 25, so a balance of 75 becomes 60 then 35.
  eq('구매 결과와 차감 후 코인',[[true,75],[false,75],[true,60],[true,35],[false,35]],
    ['mult','ball','gold','gold','gold'].map(id=>[JD.buyPerk(wallet,id),wallet.coins]));
  eq('구매 후 강화 레벨',{mult:1,value:0,gold:2,ball:0,blast:0},wallet.perks);
  const u=JD.newUpgrades({mult:1,value:2,gold:1,ball:1,blast:1}), b=board(2,1,u);
  const s=JD.createShot(b,0.5,u);
  eq('영구 강화가 랙·금 핀·배수·핀 값·폭발 반경에 적용',[Array(4).fill('normal'),10,2,20,76],
    [u.rack,b.pegs.filter(peg=>peg.type==='gold').length,b.mult,s.base,s.blastR]);
  const synced=up();
  JD.syncPerks(synced,{mult:1,value:0,gold:0,ball:2,blast:0});
  eq('강화한 구슬 수를 랙에 반영',[Array(5).fill('normal'),2],[synced.rack,synced.perks.ball]);
  eq('금 핀 네 개를 켠 발은 4코인',4,JD.shotCoins(shot(board(1),0.85).s));
  eq('재도전 번호로 금 핀 배치와 워프 난수 변경',[[0,6,18,37],[3,7,43,49],2967,2980],
    [[0,1].map(attempt=>board(2,1,up(),attempt).pegs.filter(peg=>peg.type==='gold').slice(0,4).map(peg=>peg.id)),
      [0,1].map(attempt=>board(4,1,up(),attempt).warps.rnd.s)].flat());
});
test('F24','캠페인 하네스와 상점·지도 API',eq => {
  const total=values=>values.reduce((sum,value)=>sum+value,0);
  for(const [policy,count,expected] of [['aim',40,[40,28,29,39,43]],['random',20,[20,35,36,48,49]]]) {
    const runs=range(count,seed=>JD.simulateCampaign(seed,policy,30));
    const tries=runs.map(run=>total(run.tries)).sort((a,b)=>a-b);
    // ACCEPTANCE reports the lower middle observation when the sample size is even.
    const middle=count/2;
    eq(policy+' 20단계 클리어 수와 총 도전 수의 아래·위 중앙 관측값·상위 10% 시작·최대',expected,
      [runs.filter(run=>run.cleared===20).length,tries[middle-1],tries[middle],tries[count*0.9],tries[count-1]]);
    if(policy==='aim') {
      const run=runs[0];
      eq('시드 1 캠페인 클리어·도전 수·누적 코인·잔액·강화·발·카드',
        [20,[1,2,1,1,1,1,1,1,1,3,5,2,1,3,4,2,1,1,2,2],623,118,{mult:3,value:4,gold:4,ball:0,blast:3},110,19],
        [run.cleared,run.tries,run.coins,run.wallet.coins,run.wallet.perks,run.shots,run.cards]);
    }
  }
  const saved={coins:40,perks:JD.newPerks(),campaign:{seed:7,stage:3,attempt:2,up:{...ironRack(),load:3,springLoad:1}},
    cleared:3,endlessUnlocked:false};
  const original=JSON.parse(JSON.stringify(saved));
  const g=JD.createGame({seed:7,save:saved}), es=g.drainEvents();
  eq('저장된 4단계 도전 및 지갑 이어하기',[4,'HOURGLASS',10000,'campaign',2,40],
    [...fields(one(es,'stage_started'),'stage','name','target','mode','attempt'),g.snapshot().coins]);
  eq('v3 저장의 이전 장전 값만 무시하고 랙과 카드 유지',[ironRack(),ironRack()],
    [g.snapshot().up,g.saveState().campaign.up]);
  const opened=send(g,{type:'openMap'});
  eq('캠페인 지도 진행도와 잠금',['MAP',3,3,false,1],
    [g.snapshot().state,...fields(g.snapshot().map,'cleared','current','endlessUnlocked'),all(opened,'map_opened').length]);
  send(g,{type:'startEndless'});
  eq('잠긴 무한 모드는 시작할 수 없음','MAP',g.snapshot().state);
  send(g,{type:'continue'});
  eq('지도에서 같은 캠페인 도전 계속하기',['AIM',4,2],fields(g.snapshot(),'state','stage','attempt'));
  const finishShot=(game,power,events=[])=>{
    fire(game,power);
    until(game,'PAYOUT',events);
    events.push(...send(game,{type:'skip'}));
  };
  for(let i=0;i<3;i++) finishShot(g,0.1);
  const shop=until(g,'SHOP');
  eq('4단계 재도전에 실패해 상점 진입',[6420,44,2],fields(shop,'stageScore','coins','attempt'));
  const bought=one(send(g,{type:'buy',id:'gold'}),'perk_bought');
  eq('구매 이벤트 및 적용된 강화',['gold',1,15,29,1],
    [...fields(bought,'id','level','cost','coins'),g.snapshot().perks.gold]);
  send(g,{type:'retry'});
  const retry=g.snapshot();
  eq('카드·랙을 그대로 갖고 새 배치에서 재도전',[4,3,rack,29,true],
    [...fields(retry,'stage','attempt','rack','coins'),
      JSON.stringify(retry.pegs)!==JSON.stringify(board(4,7,retry.up,2).pegs)]);
  eq('재도전은 같은 시드와 새 도전 번호로 보드를 만듦',board(4,7,retry.up,3).pegs,retry.pegs);
  eq('createGame은 전달된 저장 객체를 직접 수정하지 않음',original,saved);

  const unlock=JD.createGame({seed:4,save:{campaign:{seed:4,stage:7,attempt:0,up:ironRack()},cleared:7}}), unlockEvents=[];
  finishShot(unlock,0.35,unlockEvents);
  const milestone=until(unlock,'BANNER',unlockEvents), cleared=one(unlockEvents,'stage_clear');
  const unlocked=one(unlockEvents,'endless_unlocked');
  eq('첫 8단계 클리어 직후 무한 해금',[8,270000,true,true,true,'unlock',true],
    [...fields(cleared,'stage','stageScore','firstClear'),cleared.tick===unlocked.tick,
      unlockEvents.indexOf(cleared)+1===unlockEvents.indexOf(unlocked),milestone.banner.kind,milestone.endlessUnlocked]);
  const reward=until(unlock,'CARD',unlockEvents);
  eq('해금 배너 90틱 뒤 보상',90,reward.tick-milestone.tick);
  send(unlock,{type:'pick',index:0});
  send(unlock,{type:'openMap'});
  eq('해금 뒤 지도에서 무한 모드가 열림',true,unlock.snapshot().map.endlessUnlocked);
  send(unlock,{type:'startEndless'});
  eq('열린 무한 모드를 새 판으로 시작',['AIM','endless',1,17000,rack],
    fields(unlock.snapshot(),'state','mode','stage','target','fullRack'));
  const endlessEvents=[];
  finishShot(unlock,0.8,endlessEvents);
  until(unlock,'CARD',endlessEvents);
  send(unlock,{type:'pick',index:0});
  for(let i=0;i<3;i++) finishShot(unlock,0.05,endlessEvents);
  const endlessResult=until(unlock,'RESULT',endlessEvents), endlessSave=unlock.saveState();
  eq('무한 기록은 클리어 수와 구분해 도달 단계로 저장',[1,2,2,2],
    [...fields(endlessResult.result,'reached','stageReached'),endlessResult.endlessBest,endlessSave.endlessBest]);
  const resumedCampaign=JD.createGame({save:endlessSave}).snapshot();
  eq('무한 도전 뒤의 저장은 캠페인 진도와 무한 최고 기록을 유지',['campaign',9,2],
    fields(resumedCampaign,'mode','stage','endlessBest'));

  // The winning stage-20 attempt from the canonical seed-1 aim campaign.
  const perks={mult:3,value:4,gold:4,ball:0,blast:3};
  const upgraded={...JD.newUpgrades(perks),goldPlus:1,heavy:3,fever:4,jackpot:1,extra:2,split:2,gate:2,
    ballGlass:1,ballBig:1,ballIron:2,rack:['iron','big','glass','iron','normal']};
  const finale=JD.createGame({seed:1,save:{perks,campaign:{seed:1,stage:19,attempt:1,up:upgraded},cleared:19,endlessUnlocked:true}});
  const lastEvents=[];
  for(const [ball,power] of [['big',0.8535484305024148],['normal',0.7490075081214309],
    ['glass',0.7653042532503606],['iron',0.7210734378173949]]) {
    queue(finale,{type:'pickBall',slot:finale.snapshot().rack.indexOf(ball)});
    finishShot(finale,power,lastEvents);
  }
  const finalBanner=until(finale,'BANNER',lastEvents), finalClear=one(lastEvents,'stage_clear');
  const finish=until(finale,'MAP',lastEvents), allClear=one(lastEvents,'all_clear'), campaignClear=one(lastEvents,'campaign_clear');
  eq('20단계 클리어·완주 이벤트·배너·90틱·지도·카드 없음',[20,20235072,true,true,'allclear',90,'MAP',20,0],
    [...fields(finalClear,'stage','stageScore'),finalClear.tick===allClear.tick,allClear.tick===campaignClear.tick,
      finalBanner.banner.kind,finish.tick-finalBanner.tick,finish.state,finish.map.cleared,all(lastEvents,'cards_offered').length]);
});
})(window.JD);
