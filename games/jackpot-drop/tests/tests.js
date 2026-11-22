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
  iron:[], warps:null, buckets:JD.bucketLayout(JD.STAGES[1], up()), mult:1,
  bucketKey:'center', springs:[], guide:null, rows:12, landY:596, h:640, maxFlight:720}, options);
const board = (stage, seed = 1, upgrades = up(), attempt = 0) => JD.buildBoard(stage - 1, upgrades, seed, attempt);
const range = (count, fn) => Array.from({length:count}, (_, i) => fn(i + 1));
const counts = b => [b.pegs.length,...['gold','bomb'].map(k => b.pegs.filter(p => p.type === k).length),
  b.gates.length,b.blocks.length,b.terrain.length,b.iron.length,b.warps ? b.warps.ins.length : 0];
function shot(b, angle, upgrades = up(), pick = {}) {
  const s = JD.createShot(b, angle, upgrades, pick);
  let steps = 1;
  while (!JD.stepShot(s)) if (++steps > 2000) throw new Error('비행 제한 2,000스텝 초과');
  return {s, steps, events:s.events, cells:s.balls.map(x => x.bucket)};
}
const queue = (g,...cmds) => cmds.forEach(cmd => g.queue(cmd));
const fire = (g,angle) => queue(g,{type:'aim',angle},{type:'fire'});
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
  fire(g,0);
  until(g,624,es);
  return {g,es};
}
const rack = ['iron','normal','normal'];
const ironRack = () => JD.newUpgrades(null,1);
const cardLevels = value => JD.CARD_IDS.map(id=>value[id]);
const makeGate = (id, kind, x, y) => ({id,kind,x,y,alive:true});
const makeBlock = (hp, kind = 'block', y = 240) => ({id:0,kind,hp,maxHp:hp,x:152,y,w:kind==='vault'?72:44,h:kind==='vault'?28:20,alive:true});
test('F01','보드 생성',eq => {
  const list = range(20, i => board(i));
  eq('핀·금·폭탄·게이트·블록·벽·쇠 벽·워프',[[102,8,3,0,0,2,0,0],[102,8,4,0,0,0,2,0],
    [98,9,4,2,0,1,0,0],[56,9,4,2,3,4,0,2],[130,14,7,3,4,0,2,0],[67,10,5,3,5,0,0,1],
    [62,12,5,4,3,0,1,0],[128,16,8,4,5,0,0,2],
    [80,11,5,4,2,4,0,0],[150,14,7,4,1,2,2,1],[88,12,6,3,5,0,1,0],[94,12,6,3,2,1,4,0],
    [79,11,5,3,1,2,0,3],[141,15,7,3,4,3,0,0],[94,12,6,5,1,0,0,0],[95,12,6,3,2,0,4,0],
    [89,12,6,2,2,1,0,2],[160,18,9,4,4,0,0,2],[149,16,8,6,1,0,2,0],[142,20,10,5,5,0,2,2]],list.map(counts));
  const funnel=(fromY,toY)=>[[0,fromY,136,toY],[360,fromY,224,toY]];
  eq('깨지지 않는 깔때기는 튜토리얼만',funnel(522,580),list[0].terrain);
  eq('다른 단계에는 깨지지 않는 바닥 V자 없음',true,list.slice(1).every(b=>b.terrain.every(seg=>
    ![...funnel(522,580),...funnel(884,964)].some(wall=>String(seg)===String(wall)))));
  const roof=(bottom,top)=>[[[64,bottom,180,top]],[[180,top,296,bottom]]];
  const longRoof=roof(968,928), plate=[[[4,536,112,576]]];
  eq('단계별 쇠 지붕·판·치마 좌표',[
    roof(584,544),longRoof,plate,longRoof,plate,
    [[[44,584,96,552]],[[96,552,148,584]],[[212,584,264,552]],[[264,552,316,584]]],
    [[[110,528,180,490]],[[180,490,250,528]],[[110,528,130,586]],[[250,528,230,586]]],
    longRoof,longRoof
  ],[2,5,7,10,11,12,16,19,20].map(stage=>list[stage-1].iron.map(group=>group.segs)));
  eq('쇠 벽마다 기울어진 선분 하나',true,list.every(b=>
    b.iron.every(group=>group.segs.length===1 && group.segs[0][1]!==group.segs[0][3])));
  const rows=[12,12,12,12,24,12,12,24,12,24,12,12,12,24,12,12,12,24,24,24];
  eq('단계별 보드 줄·착지선·높이·시간 제한',rows.map(n=>n===24?[24,980,1024,1440]:[12,596,640,720]),
    list.map(b=>fields(b,'rows','landY','h','maxFlight')));
  eq('단계별 벽 스프링 높이',rows.map((n,i)=>i===0?[]:n===24?[[380,450],[620,690]]:[[380,450]]),list.map(b=>b.springs));
  eq('튜토리얼 포 가이드',[[180,160],...Array(19).fill(null)],list.map(b=>b.guide));
  const fixed = [[4,45,63],[11,13,30,38,50,58,70,78]];
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
  eq('목표 점수',[3000,5200,5900,17000,19000,15000,8500,89000,41000,63000,58000,62000,61000,110000,
    79000,83000,87000,400000,140000,280000],JD.STAGES.map(s=>s.target));
  eq('단계에 고정 보상 필드 없음',true,JD.STAGES.every(s=>!('reward' in s)));
  eq('새로 생성한 워프 입구 상태',true,list.every(b=>!b.warps || b.warps.ins.every(entrance=>entrance.alive===true)));
  eq('새 보드에 주차 필드 없이 핀 접촉 초기화',true,list.every(b=>!('parked' in b) && b.pegs.every(p=>(p.touches||0)===0)));
  eq('시드 1~100 금고 파괴 수',0,range(100,seed => all(shot(board(8,seed),0).events,'block_broken')
    .some(e=>e.kind==='vault')).filter(Boolean).length);
  eq('같은 시드 보드 재생성',true,list.every((b,i)=>JSON.stringify(b)===JSON.stringify(board(i+1))));
  eq('같은 시드·도전번호의 재도전 보드도 동일',board(10,1,up(),2),board(10,1,up(),2));
});
test('F02','첫 발',eq => {
  const g=JD.createGame({seed:1}), es=g.drainEvents();
  eq('초기 노림 구간과 조준 각도',[{kind:'guide',x:180,y:160,center:0,lo:-8,hi:8},0],fields(g.snapshot(),'zone','angle'));
  fire(g,0);
  eq('1틱 상태','LAUNCH',until(g,1,es).state);
  eq('첫 발사',[1,1,0,true,['normal'],2],
    fields(one(es,'shot_fired'),'tick','stage','angle','perfect','balls','ballsLeft'));
  eq('발사 이벤트에 이전 세기와 스프링 없음',false,['power','spring','spin'].some(key=>key in one(es,'shot_fired')));
  eq('13틱 상태','FLIGHT',until(g,13,es).state);
  eq('포에서 진입: 틱·각도·PERFECT·콤보·구간·구슬',[13,0,true,1,'guide',['normal']],
    fields(one(es,'launch'),'tick','angle','perfect','tier','zone','balls'));
  until(g,'BANNER',es);
  eq('첫 적중: 틱·id·종류·원인·콤보·점수',[28,4,'bomb','ball',1,30],
    fields(one(es,'peg_hit'),'tick','id','pegType','cause','tier','pts'));
  eq('폭탄 틱·켜진 핀',[28,[3,5,11,12,13,14,21]],fields(one(es,'bomb_exploded'),'tick','lit'));
  eq('콤보 단계·순번',[[2,8],[3,16],[4,24]],all(es,'combo_up').map(e=>fields(e,'tier','n')));
  eq('깨진 핀·구슬 충돌·벽 충돌·벽 스프링 수',[9,0,4,0],
    ['peg_break','ball_hit','terrain_hit','wall_spring'].map(type=>all(es,type).length));
  eq('비행 종료 틱·t·핀·핀값·금·배수·칸 합·점수·콤보',[461,441,33,1035,6,7,5,36225,4],
    fields(one(es,'shot_finished'),'tick','t','hits','pts','golds','stageMult','bucketSum','score','tier'));
  eq('칸·정산 길이·종료 틱·단계 점수',[2,103,564,36225],
    [one(es,'ball_landed').bucket,one(es,'payout_done').tick-one(es,'shot_finished').tick,...fields(one(es,'payout_done'),'tick','stageScore')]);
});
test('F03','발 사이 카드, 아까운 실패와 상점',eq => {
  const g=JD.createGame({seed:1}), es=g.drainEvents();
  const initial=g.snapshot();
  const expected=[
    [-60,['ballGlass','ballBig','extra'],'ballGlass',2,['glass','normal']],
    [-45,['ballBig','goldPlus','fever'],'ballBig',1,['big']]
  ];
  for(const [angle,ids,id,ballsLeft,rackAfter] of expected) {
    fire(g,angle);
    const view=until(g,'CARD',es), offered=all(es,'cards_offered').at(-1), settled=all(es,'payout_done').at(-1);
    eq('정산과 같은 틱에 세 장 제시', [view.tick,view.tick,ids,false],
      [settled.tick,...fields(offered,'tick','ids','fixed')]);
    const picked=one(send(g,{type:'pick',index:0}),'card_picked');
    eq('선택 즉시 같은 단계에 적용', [id,1,'AIM',1,ballsLeft,rackAfter],
      [...fields(picked,'id','level'),...fields(g.snapshot(),'state','stage','ballsLeft','rack')]);
    if(id==='ballGlass') {
      const saved=g.saveState(), restored=JD.createGame({save:saved}).snapshot();
      eq('도전 중 저장은 카드와 소비 구슬 없이 같은 도전 재개',
        [{seed:1,stage:0,attempt:0},650,1,0,'AIM',initial.rack,cardLevels(initial.up)],
        [saved.campaign,saved.stageBest[0],...fields(restored,'stage','attempt','state','rack'),cardLevels(restored.up)]);
    }
  }
  fire(g,-45); until(g,'BANNER',es);
  const v=g.snapshot(), end=until(g,'SHOP',es);
  eq('발 점수·PERFECT·구슬',[[650,1150,1000],[false,false,false],[['normal'],['glass'],['big']]],
    [all(es,'shot_finished').map(e=>e.score),all(es,'shot_fired').map(e=>e.perfect),all(es,'shot_fired').map(e=>e.balls)]);
  eq('마지막 발에는 카드 없음',2,all(es,'cards_offered').length);
  eq('발마다 코인 획득량·잔액·사유',[[0,0,'shot'],[1,1,'shot'],[0,1,'shot']],
    all(es,'coins_earned').map(event=>fields(event,'amount','total','cause')));
  eq('배수·단계 점수·달성률·배너·배너 길이·상점',[2,2800,93,'SO CLOSE!',45,1,0,'SHOP'],
    [v.stageMult,v.stageScore,one(es,'stage_failed').ratio,v.banner.text,end.tick-v.tick,
      ...fields(one(es,'shop_opened'),'coins','attempt'),end.state]);
  eq('상점의 다섯 강화와 구매 가능 여부',[['mult',0,5,25,false],['value',0,5,15,false],['gold',0,5,15,false],
    ['ball',0,2,80,false],['blast',0,3,15,false]],end.shop.items.map(item=>fields(item,'id','level','max','cost','affordable')));
  eq('부족한 코인으로는 구매할 수 없음',[],all(send(g,{type:'buy',id:'value'}),'perk_bought'));
  const retried=send(g,{type:'retry'}), current=g.snapshot();
  eq('재도전 이벤트 및 다음 상태',[[1,1],[1,'TUTORIAL',3000,3,false,'campaign',1],['AIM',0,3,1,initial.rack]],
    [fields(one(retried,'stage_retry'),'stage','attempt'),fields(one(retried,'stage_started'),'stage','name','target','balls','endless','mode','attempt'),
      fields(current,'state','stageScore','ballsLeft','coins','rack')]);
  eq('재도전에서 카드 단계 모두 초기화',cardLevels(initial.up),cardLevels(current.up));
  eq('튜토리얼의 재도전 배치는 고정',initial.pegs,current.pegs);
});
test('F04','쇠 구슬 해금과 2단계',eq => {
  const {g,es}=tutorial(), clear=one(es,'stage_clear');
  eq('정산·클리어 틱·단계·단계 점수·남은 공·보너스·판 점수',[564,564,1,36225,2,600,36825],
    [one(es,'payout_done').tick,...fields(clear,'tick','stage','stageScore','ballsLeft','bonus'),g.snapshot().runScore]);
  eq('첫 클리어에는 금 핀 6코인과 첫 클리어 10코인 획득',[[6,6,'shot'],[10,16,'clear']],
    all(es,'coins_earned').map(event=>fields(event,'amount','total','cause')));
  eq('클리어와 같은 틱에 쇠 구슬 해금, 카드 제시 없음',[[564,'iron'],0],
    [fields(one(es,'ball_unlocked'),'tick','ball'),all(es,'cards_offered').length]);
  const v=g.snapshot();
  const stageStart=all(es,'stage_started').find(event=>event.stage===2)||{};
  eq('2단계는 클리어 배너 뒤 곧바로 조준',[624,2,'IRON LID',5200,3,false,'AIM'],
    [...fields(stageStart,'tick','stage','name','target','balls','endless'),v.state]);
  eq('랙·남은 랙·장전·구슬·힌트·쇠 벽·깨지지 않는 벽·줄·높이',
    [rack,rack,0,'iron',{ball:'iron'},[[true,1],[true,1]],[],12,640],
    [...fields(v,'fullRack','rack','slot','ball','hint'),v.iron.map(w=>[w.alive,w.segs.length]),...fields(v,'terrain','rows','boardH')]);
  eq('쇠 지붕 노림 구간과 벽 스프링',[['iron',122,564,-6.32],[[380,450]]],
    [[...fields(v.zone,'kind','x','y'),Number(v.zone.center.toFixed(2))],v.springs]);
  eq('스냅샷에 이전 발사대 세기와 여러 개 장전 없음',false,['power','lastPower','spring','load','loaded'].some(key=>key in v));
  const changed=send(g,{type:'pickBall',slot:1});
  const event=one(changed,'ball_picked');
  eq('일반 구슬 선택',[1,'normal',false,1,'normal'],[...fields(event,'slot','ball'),'loaded' in event,...fields(g.snapshot(),'slot','ball')]);
  send(g,{type:'pickBall',slot:2});
  eq('한 칸 장전 교체',2,g.snapshot().slot);
  send(g,{type:'loadAll'});
  eq('삭제된 모두 장전 명령 무시',2,g.snapshot().slot);
  eq('조준 중 카드 선택은 무시',0,all(send(g,{type:'pick',index:0}),'card_picked').length);
  eq('2단계는 카드 보너스 없이 시작',JD.CARD_IDS.map(()=>0),cardLevels(v.up));
});
test('F05','분열',eq => {
  const u=up({split:2}), v=shot(board(1,1,u),0,u);
  eq('공 수·칸·칸 합·핀·폭발·배수·점수·구슬 충돌 수',[3,[2,2,2],15,52,2,6,178650,3],
    [v.s.balls.length,v.cells,v.s.bucketSum,v.s.hits,all(v.events,'bomb_exploded').length,v.s.board.mult,v.s.score,all(v.events,'ball_hit').length]);
});
test('F06','카드 효과와 칸 배치',eq => {
  const line=[0,80,144,216,280,360];
  const cases=[
    ['goldPlus',[[22,'gold'],[69,'gold'],[77,'gold']],1,line,['normal','normal']],
    ['bombPlus',[[69,'bomb'],[77,'bomb']],1,line,['normal','normal']],
    ['fever',[],2,line,['normal','normal']],
    ['jackpot',[],1,[0,80,124,236,280,360],['normal','normal']],
    ['extra',[],1,line,['normal','normal','normal']],
    ['ballGlass',[],1,line,['glass','normal']],
    ['heavy',[],1,line,['normal','normal']],
    ['split',[],1,line,['normal','normal']]
  ];
  for(const [id,types,mult,buckets,balls] of cases) {
    const u=ironRack(), b=board(2,1,u), left=['normal','normal'];
    const previous=b.pegs.map(pin=>pin.type);
    JD.applyCard(u,id,b,left,JD.mulberry32(5));
    const changes=b.pegs.flatMap((pin,i)=>pin.type===previous[i]?[]:[[pin.id,pin.type]]);
    eq(id+' 즉시 적용·적용 카드 단계만 증가',[types,mult,buckets,balls,JD.CARD_IDS.map(key=>key===id?1:0)],
      [changes,b.mult,b.buckets.x,left,cardLevels(u)]);
  }
  const u=ironRack(), b=board(2,1,u), left=['normal','normal'], rnd=JD.mulberry32(5);
  JD.applyCard(u,'heavy',b,left,rnd);
  JD.applyCard(u,'bombPlus',b,left,rnd);
  const s=JD.createShot(b,30,u);
  eq('같은 보드의 핀 기본값·폭발 반경',[20,80],fields(s,'base','blastR'));
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
test('F07','카드 제시와 기본 랙',eq => {
  const u=ironRack(), rnd=JD.mulberry32(1000), two=['iron','normal'];
  eq('카드 열 종류와 카드 상한',[
    ['goldPlus','heavy','bombPlus','fever','jackpot','extra','split','ballGlass','ballBig','ballIron'],
    {jackpot:1,extra:2,split:2,ballGlass:1,ballBig:1,ballIron:1}], [JD.CARD_IDS,JD.CARD_CAP]);
  eq('시드 1에서 이어진 두 제시',[['ballGlass','ballBig','extra'],['ballBig','goldPlus','jackpot']],
    [JD.drawOffer(rnd,u,two),JD.drawOffer(rnd,u,two)]);
  eq('일반 구슬이 없으면 구슬 카드가 빠짐',['extra','jackpot','fever'],JD.drawOffer(JD.mulberry32(1000),u,['iron']));
  eq('상한 카드는 제외',['fever','bombPlus','heavy'],JD.drawOffer(JD.mulberry32(1000),up(JD.CARD_CAP),['normal']));
  const staged=ironRack(), b=board(2,1,staged), draw=JD.mulberry32(1000), left=staged.rack.slice();
  const offers=range(4,()=>{
    const offer=JD.drawOffer(draw,staged,left);
    JD.applyCard(staged,offer[0],b,left,draw);
    return offer;
  });
  eq('같은 난수 흐름의 순차 제시와 적용',[[['ballGlass','ballBig','extra'],['ballBig','goldPlus','fever'],
    ['bombPlus','goldPlus','extra'],['heavy','split','fever']],['iron','glass','big']], [offers,left]);
  eq('일반 구슬 유무에 관계없이 제시 카드 세 장이 서로 다름',true,range(100,seed=>JD.mulberry32(seed+999)).every(next=>
    [['iron'],['normal']].every(balls=>{
      const cards=JD.drawOffer(next,u,balls);
      return cards.length===3&&new Set(cards).size===3;
    })));
  eq('초기 강화 키와 동기화 함수 없음',
    [['goldPlus','heavy','bombPlus','fever','jackpot','extra','split','ballGlass','ballBig','ballIron','rack','perks'],'undefined'],
    [Object.keys(up()),typeof JD.syncPerks]);
  eq('1단계·2단계·추가 구슬 강화가 있는 무한 단계 기본 랙',[['normal','normal','normal'],rack,['iron','normal','normal','normal','normal']],
    [up().rack,u.rack,JD.newUpgrades({...JD.newPerks(),ball:2},20).rack]);
});
test('F08','정산 길이와 건너뛰기',eq => {
  eq('핀 0·9·28·30·33·34·61개 정산 틱',[70,97,126,130,103,104,131],[0,9,28,30,33,34,61].map(JD.payoutDuration));
  const g=JD.createGame({seed:1}), es=g.drainEvents(); fire(g,0);
  eq('정산 진입 경과·길이',[0,103],fields(until(g,'PAYOUT',es).payout,'elapsed','duration'));
  until(g,479,es);
  eq('480틱 skip 즉시 종료',[480,36225],fields(one(send(g,{type:'skip'}),'payout_done'),'tick','stageScore'));
});
test('F09','끼임과 시간 제한',eq => {
  const peg={id:7,x:300,y:400,type:'normal',lit:true,alive:true};
  const s=JD.createShot(blank({pegs:[peg]}),0,up());
  Object.assign(s.balls[0],{vx:0,vy:-0.22,slow:44}); JD.stepShot(s);
  eq('끼임 핀·생존·slow',[[7],false,0],[one(s.events,'stuck_clear').ids,peg.alive,s.balls[0].slow]);
  const v=shot(blank({maxFlight:5}),0);
  eq('보드별 시간 제한 t·칸·timeout',[5,0,true],[v.s.t,...fields(one(v.events,'ball_landed'),'bucket','timeout')]);
  eq('전역 시간 제한 필드 없음',false,'MAX_FLIGHT' in JD.CFG);
});
test('F10','밸런스 하네스',eq => {
  // A few aim trajectories diverge between Node and Chrome; the seed 1 scores still agree.
  const inNode=typeof process!=='undefined'&&Boolean(process.versions?.node);
  const aimClears=inNode?[200,145,116,68,38,23,15,5]:[200,145,115,67,38,24,15,5];
  [
    ['random',200,2,[199,114,96,47,21,9,4,2],4,[15100,5410,6320,17280,15010]],
    ['aim',200,5,aimClears,3,[6600,7050,6230,3315]],
    ['pro',20,20,[20,20,20,20,20,20,20,20],8,[36225,10250,22960,48440,22405,15800,25200,132165]]
  ].forEach(([policy,n,wins,clears,reached,points])=>{
    const runs=range(n,seed=>JD.simulateRun(seed,policy));
    eq(policy+' 완주·단계별 클리어 수',[wins,clears],
      [runs.filter(r=>r.won).length,range(8,i=>runs.filter(r=>r.reached>=i).length)]);
    eq(policy+' 시드 1 완주·도달·단계 점수',[reached===8,reached,points],
      [runs[0].won,runs[0].reached,runs[0].stages.map(s=>s.score)]);
    eq(policy+' 발당 구슬 하나',true,runs.every(run=>Object.values(run.picks).reduce((sum,count)=>sum+count,0)===run.shots));
    eq(policy+' 발사 선택 필드',['angle','ball'],Object.keys(JD.choosePick(board(1),policy,JD.mulberry32(1000),up(),['normal'],null)).sort());
  });
});

test('F15','게이트',eq => {
  const plus=()=>makeGate(0,'plus',152,240);
  const a=shot(blank({gates:[plus()]}),-8);
  eq('초록: 게이트 id·공 id·결과·공 수·칸·배수 합·스텝·게이트 생존·구슬 충돌',[0,0,'spawn',2,[1,2],7,56,false,0],
    [...fields(one(a.events,'gate_passed'),'id','ball','result'),a.s.balls.length,a.cells,a.s.bucketSum,a.steps,a.s.board.gates[0].alive,all(a.events,'ball_hit').length]);
  const glass=shot(blank({gates:[plus()]}),-8,up(),{ball:'glass'});
  eq('복제 공의 구슬 종류',['glass','glass'],glass.s.balls.map(ball=>ball.key));
  const b=shot(blank({gates:[plus(),makeGate(1,'minus',153,368)]}),-8);
  eq('빨강 제거: 공 id·결과·공 손실·남은 공 칸·배수 합·스텝',[1,'removed',true,1,2,56],
    [...fields(all(b.events,'gate_passed')[1]||{},'ball','result'),b.s.balls[1].lost,b.cells[0],b.s.bucketSum,b.steps]);
  const c=shot(blank({gates:[makeGate(0,'minus',160,368)]}),-8);
  eq('빨강 마지막 공 보호: 결과·칸·배수 합·스텝',['saved',[2],5,56],[one(c.events,'gate_passed').result,c.cells,c.s.bucketSum,c.steps]);
  const g=plus(), s=JD.createShot(blank({gates:[g]}),-8,up());
  s.balls.push(...range(5,()=>JD.newBall(152,239,0,1,'normal')));
  JD.passGate(s,s.balls[0],0,g);
  eq('초록 공 상한',['capped',6],[one(s.events,'gate_passed').result,s.balls.length]);
});
test('F16','HP 블록',eq => {
  const a=shot(blank({blocks:[makeBlock(2)]}),-8);
  eq('HP 2 피해·생존·핀값·배수·칸·점수·스텝',[[[1,'ball']],true,5,1,3,10,128],
    [all(a.events,'block_hit').map(e=>fields(e,'hp','cause')),a.s.board.blocks[0].alive,a.s.pts,a.s.board.mult,a.cells[0],a.s.score,a.steps]);
  const b=shot(blank({blocks:[makeBlock(1)]}),-8);
  eq('HP 1 보너스·핀값·금·배수·칸·점수·스텝·t',[20,25,1,2,3,100,131,128],
    [one(b.events,'block_broken').bonus,b.s.pts,b.s.golds,b.s.board.mult,b.cells[0],b.s.score,b.steps,b.s.t]);
  const c=shot(blank({blocks:[makeBlock(1,'vault')]}),-8);
  eq('금고 보너스·금·배수·점수',[20,3,4,200],[one(c.events,'block_broken').bonus,c.s.golds,c.s.board.mult,c.s.score]);
  const damaged=makeBlock(3,'block',250);
  const same=blank({pegs:[{id:0,x:173,y:200,type:'bomb',lit:false,alive:true}],blocks:[damaged]});
  const d=shot(same,-8);
  eq('폭발 후 HP·원인·블록 id·생존·핀값·칸·점수',[1,'blast',[0],true,35,4,35],
    [...fields(one(d.events,'block_hit'),'hp','cause'),one(d.events,'bomb_exploded').blocks,damaged.alive,d.s.pts,d.cells[0],d.s.score]);
  const hp=damaged.hp, e=shot(same,-8);
  eq('다음 발 시작 HP·피해 후 HP·원인·보너스·핀값·칸·점수',[1,0,'ball',60,65,3,260],
    [hp,...fields(one(e.events,'block_hit'),'hp','cause'),one(e.events,'block_broken').bonus,e.s.pts,e.cells[0],e.s.score]);
  const f=shot(blank({blocks:[makeBlock(4)]}),-8,up(),{ball:'iron'});
  eq('쇠 구슬 HP 4 한 번 피해·생존·핀값·칸·점수',[[2],true,5,3,10],
    [all(f.events,'block_hit').map(e=>e.hp),f.s.board.blocks[0].alive,f.s.pts,f.cells[0],f.s.score]);
});
test('F17','무한 모드',eq => {
  const defs=[20,21,22,31,32,43].map(JD.stageDef);
  eq('무한 단계의 지도와 목표',[
    ['CROSSFIRE',25000],['DEEP WELL',42000],['LOCKBOX',44000],['GRAND JACKPOT',584000],['CROSSFIRE',96000],['GRAND JACKPOT',2277000]],
    defs.map(s=>fields(s,'name','target')));
  eq('무한 모드·벽 스프링·고정 보상 필드 없음·긴 보드·반복 블록 HP',[true,[[380,450]],false,24,[5,5],[7,7],[16,10,10,10,10]],
    [defs[0].endless,defs[0].springs,'reward' in defs[0],defs[1].rows,...[0,4,5].map(i=>defs[i].blocks.map(b=>b[4]))]);
  eq('무한 지도 풀·목표 계수·증가율',[range(12,i=>i+7),0.6,1.12],[JD.ENDLESS_POOL,JD.ENDLESS_SCALE,JD.CFG.ENDLESS_GROWTH]);
  const run=JD.simulateEndless(2,'aim',{mult:3,value:4,gold:4,ball:1,blast:3},24);
  eq('시드 2 무한 클리어 수·실패 지도·점수·목표',[9,'VAULT DEEP',367125,666000],
    [run.reached,JD.stageDef(29).name,run.scores[9],JD.stageDef(29).target]);
  const g=JD.createGame({seed:1,endless:true}), es=g.drainEvents();
  eq('무한 1단계 시작 이벤트',[1,'CROSSFIRE',25000,3,true,'endless',0],
    fields(one(es,'stage_started'),'stage','name','target','balls','endless','mode','attempt'));
  eq('무한 기본 랙·코인',[rack,0],fields(g.snapshot(),'rack','coins'));
  for(let i=0;i<3;i++) {
    fire(g,-60);
    until(g,i<2?'CARD':'BANNER',es);
    if(i<2) es.push(...send(g,{type:'pick',index:0}));
  }
  const v=until(g,'RESULT',es);
  eq('무한 모드 실패는 결과 화면으로 이어짐',[false,0,1,0,'RESULT'],
    [...fields(one(es,'run_ended'),'won','reached','stageReached'),all(es,'shop_opened').length,v.state]);
});
test('F18','벽과 검수용 시작',eq => {
  eq('세로·사선 벽: 충돌·스텝·칸',[[1,56,2],[1,92,0]],
    [[152,200,152,300],[100,220,200,300]].map(w=>{
      const v=shot(blank({terrain:[w]}),-8);
      return [all(v.events,'terrain_hit').length,v.steps,v.cells[0]];
    }));
  const g=JD.createGame({seed:1,start:8}), h=JD.createGame({seed:1,start:2});
  eq('8단계 연습 시작',[8,'VAULT',89000,3,false,'campaign',0],
    fields(one(g.drainEvents(),'stage_started'),'stage','name','target','balls','endless','mode','attempt'));
  eq('8단계 핀·판 점수',[128,0],[g.snapshot().pegs.length,g.snapshot().runScore]);
  eq('2단계 지도·랙',['IRON LID',rack],fields(h.snapshot(),'stageName','fullRack'));
  eq('3단계 지도·랙',['CURVE',rack],fields(JD.createGame({seed:1,start:3}).snapshot(),'stageName','fullRack'));
  eq('20단계 연습 시작',[20,'GRAND JACKPOT',280000,24],fields(JD.createGame({seed:1,start:20}).snapshot(),'stage','stageName','target','rows'));
  eq('유효 범위 밖의 시작값은 1단계 일반 캠페인',true,[21,1,'x'].every(start=>{
    const v=JD.createGame({seed:1,start}).snapshot();
    return v.stage===1&&v.mode==='campaign'&&!v.practice;
  }));
});
test('F19','포·노림 구간·구슬·핀 깨짐',eq => {
  eq('포의 기준 수치',{x:180,y:40,speed:5,maxAngle:60,load:10,swing:60,dwell:10,zoneHalf:8,perfectTier:1,minHold:3},JD.CANNON);
  eq('예전 슈터 레인과 세기 API 제거',false,['SPRING','isPerfect'].some(key=>key in JD)||
    ['EXIT_X','EXIT_Y','EXIT_VY','POWER_MIN'].some(key=>key in JD.CFG));
  eq('10틱 장전 뒤 260틱 포 흔들기와 끝의 정지',[0,0,0,1,4,8,9,30,60,60,60,30,9,8,0,-30,-60,-60,-55,-20,0,1],
    [1,4,10,11,14,18,19,40,70,75,80,110,131,132,140,170,200,210,215,250,270,271].map(JD.aimAngle));
  eq('노림 구간 경계',[true,false],[8,8.01].map(angle=>JD.inZone({lo:-8,hi:8},angle)));
  eq('각도별 포의 발사 속도·구슬 종류',[[0,0,5,8,'normal'],[30,2.5,4.330,8,'normal'],
    [-60,-4.330,2.5,8,'normal'],[60,4.330,2.5,8,'normal'],[0,0,5,11,'big'] ],
    [[0],[30],[-60],[75],[0,{ball:'big'}]].map(([angle,pick])=>{
      const launched=JD.createShot(blank(),angle,up(),pick), ball=launched.balls[0];
      return [launched.angle,Number(ball.vx.toFixed(3)),Number(ball.vy.toFixed(3)),...fields(ball,'r','key')];
    }));
  eq('빈 보드의 JACKPOT 노림 구간',{kind:'jackpot',x:180,y:596,center:0,lo:-8,hi:8},JD.aimZone(blank()));
  const legacyPick=JD.createShot(blank(),0,up(),{balls:['normal','big','iron']});
  eq('포의 발사 위치',[180,40],fields(legacyPick.balls[0],'x','y'));
  eq('예전 여러 구슬 선택은 무시하고 대기 필드 없음',[['normal'],['normal'],false],
    [legacyPick.balls.map(ball=>ball.key),one(legacyPick.events,'launch').balls,'wait' in legacyPick.balls[0]]);
  const guide=['guide',180,160,0], block=['block',108,304,-15.26], vault=['vault',180,368,0];
  eq('시드 1의 쇠 구슬과 일반 구슬 노림 구간', [
    [guide,guide],[['iron',122,564,-6.32],['gold',126,448,-7.54]],[block,block],
    [['iron',58,556,-13.30],['block',180,368,0]],[vault,vault],
    [['iron',120,557,-6.62],['block',90,330,-17.24]]
  ],[1,2,4,7,8,16].map(stage=>['iron','normal'].map(ball=>{
    const zone=JD.aimZone(board(stage),ball);
    return [...fields(zone,'kind','x','y'),Number(zone.center.toFixed(2))];
  })));
  const curveShots=range(20,i=>shot(board(3),-63+6*i).cells);
  eq('CURVE 20가지 착지 칸·JACKPOT 수',['4 0 3 22 0 1 11 22 0 0 4 3 33 22 2 3 3 1 4 1',4],
    [curveShots.map(cells=>cells.join('')).join(' '),curveShots.filter(cells=>cells.includes(0)).length]);
  const a=shot(board(3),0);
  eq('CURVE 0° 점수·칸·핀',[3525,2,27],[a.s.score,a.cells[0],a.s.hits]);
  const c=shot(board(1),-10,up(),{ball:'glass'});
  eq('유리 파열 수·착지 칸·핀·점수·PERFECT',[1,[2,2,2],42,122850,false],
    [all(c.events,'ball_shatter').length,c.cells,c.s.hits,c.s.score,c.s.perfect]);
  const tutorialShot=shot(board(1),0);
  const broken=all(tutorialShot.events,'peg_break').map(event=>tutorialShot.s.board.pegs.find(peg=>peg.id===event.id));
  eq('깨진 핀은 두 번 충돌 후 더 이상 접촉하지 않음',[9,true],
    [broken.length,broken.every(peg=>!peg.alive && peg.touches===2)]);
  const peg={id:0,x:180,y:300,type:'normal',lit:false,alive:true};
  const uncontacted=JD.createShot(blank({pegs:[peg]}),0,up());
  JD.lightPeg(uncontacted,peg,'ball');
  eq('점등만으로 접촉 횟수를 늘리지 않음',0,peg.touches||0);
  const g=JD.createGame({seed:1});
  eq('대기 중에는 장전 경과가 0틱',[false,0],fields(g.snapshot(),'charging','chargeTicks'));
  const es=send(g,{type:'hold'});
  eq('1틱 장전 시작·경과·각도',[1,true,1,0],[one(es,'charge_started').tick,...fields(g.snapshot(),'charging','chargeTicks','angle')]);
  const loading=until(g,10,es), swinging=until(g,11,es);
  eq('10틱까지 고정되고 11틱부터 회전',[[10,0],[11,1]],
    [fields(loading,'chargeTicks','angle'),fields(swinging,'chargeTicks','angle')]);
  const outside=until(g,19,es), inside=until(g,132,es);
  eq('1틱과 132틱 PERFECT 구간에 진입하고 19틱에는 구간 밖',[[[1,'perfect'],[132,'perfect']],9,8],
    [all(es,'charge_zone').map(e=>fields(e,'tick','zone')),outside.angle,inside.angle]);
  const held=JD.createGame({seed:1}); queue(held,{type:'hold'}); until(held,14);
  const releases=send(held,{type:'release'});
  eq('발사하면 장전 경과 초기화',[false,0],fields(held.snapshot(),'charging','chargeTicks'));
  until(held,'PAYOUT',releases);
  eq('15틱 발사 각도·PERFECT·구슬·남은 공',[15,4,true,['normal'],2],
    fields(one(releases,'shot_fired'),'tick','angle','perfect','balls','ballsLeft'));
  eq('27틱 진입·335틱 종료·발 점수',[27,335,1860],[one(releases,'launch').tick,...fields(one(releases,'shot_finished'),'tick','score')]);
  const early=JD.createGame({seed:1}); queue(early,{type:'hold'}); until(early,5);
  eq('장전 중 6틱에 놓으면 0° 발사',[6,0,true],
    fields(one(send(early,{type:'release'}),'shot_fired'),'tick','angle','perfect'));
  const brief=JD.createGame({seed:1}); queue(brief,{type:'hold'}); until(brief,2);
  const cancel=send(brief,{type:'release'});
  eq('짧은 홀드 취소 틱·누른 틱 수·발사 수·남은 공·리셋',[3,2,0,3,0,0],
    [...fields(one(cancel,'charge_cancel'),'tick','ticks'),all(cancel,'shot_fired').length,...fields(brief.snapshot(),'ballsLeft','angle','chargeTicks')]);
  const guards=JD.createGame({seed:1,start:3});
  const obsolete=[{type:'pull',power:0.85},{type:'loadAll'},{type:'pickSpring',spring:'spin'}], pick={type:'pickBall',slot:1};
  eq('조준 중 예전 명령은 무시',[],send(guards,...obsolete).filter(e=>e.type!=='stage_started'&&e.type!=='run_started'));
  const during=send(guards,{type:'hold'},pick,...obsolete);
  eq('충전 중 구슬 변경과 삭제된 모두 장전 무시',['iron',0,0,0],
    [...fields(guards.snapshot(),'ball','slot'),all(during,'ball_picked').length,all(during,'spring_picked').length]);
  fire(guards,0); const before=until(guards,'LAUNCH');
  const ignored=send(guards,{type:'hold'},{type:'release'},{type:'aim',angle:45},{type:'fire'},pick,...obsolete);
  eq('AIM 외 입력 무시',[before.angle,before.ballsLeft,before.ball,before.slot,[]],
    [...fields(guards.snapshot(),'angle','ballsLeft','ball','slot'),
      ignored.filter(e=>['shot_fired','charge_started','charge_cancel','ball_picked','spring_picked'].includes(e.type))]);
  const original=JD.createGame({seed:1});
  fire(original,30);
  eq('원래 재현의 첫 발 30°는 3,100점으로 단계를 클리어',[3100,'clear'],
    [until(original,'BANNER').stageScore,original.snapshot().banner.kind]);
  const next=JD.createGame({seed:1});
  fire(next,-60); until(next,'CARD'); send(next,{type:'pick',index:0});
  eq('다음 AIM 각도와 직전 각도',[0,-60],fields(next.snapshot(),'angle','lastAngle'));
});
test('F20','기울어진 쇠 벽·워프·탄창',eq => {
  const upgrades=ironRack(), lid=board(2,1,upgrades);
  const centered=(b,ball)=>shot(b,JD.aimZone(b,ball).center,upgrades,{ball});
  eq('두 쇠 지붕 선분',[[[64,584,180,544]],[[180,544,296,584]]],lid.iron.map(group=>group.segs));
  const first=centered(lid,'iron');
  eq('쇠 구슬로 오른쪽 지붕만 파괴하고 JACKPOT 착지',[[1],[2],555,3,5,8325,417,414,[true,false]],
    [all(first.events,'iron_break').map(event=>event.id),first.cells,first.s.pts,lid.mult,
      first.s.bucketSum,first.s.score,first.steps,first.s.t,lid.iron.map(group=>group.alive)]);
  eq('지붕 파괴 후 같은 보드의 일반 구슬 두 발',[90,3000],['normal','normal'].map(ball=>centered(lid,ball).s.score));
  const lateBreak=board(2,1,upgrades);
  const lateScores=['normal','normal','iron'].map(ball=>centered(lateBreak,ball).s.score);
  eq('쇠 구슬을 마지막으로 쏘면 세 발 합계',5375,lateScores.reduce((sum,score)=>sum+score,0));
  const normalSweep=range(20,i=>shot(board(2),-63+6*i));
  eq('각도 20개에서 일반 구슬은 쇠 지붕에 닿아도 착지',[10,true],[
    normalSweep.filter(v=>all(v.events,'iron_hit').length>0).length,
    normalSweep.every(v=>v.cells.every(cell=>cell>=0) && all(v.events,'ball_parked').length===0)
  ]);
  eq('각도 20개에서 쇠 구슬 지붕 파괴 발수',15,
    range(20,i=>shot(board(2),-63+6*i,up(),{ball:'iron'})).filter(v=>all(v.events,'iron_break').length>0).length);
  eq('단일 쇠 벽 충돌·파괴 수·칸·스텝·생존',[[1,4,133,true],[1,2,59,false]],
    [['normal','iron_hit'],['iron','iron_break']].map(([ball,kind])=>{
      const wall={id:0,segs:[[100,240,220,260]],alive:true};
      const v=shot(blank({iron:[wall]}),-8,up(),{ball});
      return [all(v.events,kind).length,v.cells[0],v.steps,wall.alive];
    }));
  eq('주차 규칙·보드·공·득점 필드 제거',[false,false,false,false,false],
    [Object.keys(JD.CFG).some(key=>key.startsWith('PARK_') || ['IRON_FRICTION','E_PARKED'].includes(key)),
      'releaseParked' in JD,'parked' in lid,'parked' in first.s.balls[0],'bankIn' in first.s]);
  const warpBoard=blank({warps:{ins:[{x:152,y:240,alive:true}],outs:[{x:60,y:140},{x:300,y:140}],rnd:{s:7}}});
  const w=shot(warpBoard,-8);
  eq('단일 워프의 입구·출구·횟수·칸·스텝·t·입구 상태',[[0,0,60,140],1,0,90,86,false],
    [fields(one(w.events,'warp'),'from','to','ox','oy'),all(w.events,'warp').length,w.cells[0],w.steps,w.s.t,warpBoard.warps.ins[0].alive]);
  const nextWarp=shot(warpBoard,-8);
  eq('같은 보드 닫힌 입구와 두 번째 발',[0,[2],56],[all(nextWarp.events,'warp').length,nextWarp.cells,nextWarp.steps]);
  const warps=board(4).warps;
  eq('4단계 워프 시드·출구 번호',[2967,[0,0,2,1,0,0]],
    [warps.rnd.s,range(6,()=>Math.floor(JD.nextRand(warps.rnd)*warps.outs.length))]);
  const h=shot(board(4),-30);
  eq('4단계 첫 발 입구·출구·좌표·칸·점수·입구 상태',[[[1,0,324,140]],[4,4],13200,[true,false]],
    [all(h.events,'warp').map(event=>fields(event,'from','to','ox','oy')),h.cells,h.s.score,h.s.board.warps.ins.map(entrance=>entrance.alive)]);
  const g=JD.createGame({seed:1,start:2});
  const initial=g.snapshot();
  eq('2단계 초기 탄창·선택과 쇠 지붕 노림',[rack,0,'iron',122,564],
    [...fields(initial,'rack','slot'),...fields(initial.zone,'kind','x','y')]);
  send(g,{type:'pickBall',slot:1});
  eq('일반 구슬로 바꾸면 금 핀 노림',[1,'normal','gold',126,448],
    [...fields(g.snapshot(),'slot','ball'),...fields(g.snapshot().zone,'kind','x','y')]);
  send(g,{type:'pickBall',slot:0});
  eq('쇠 구슬로 돌아가면 같은 지붕 노림',[0,'iron',initial.zone],
    fields(g.snapshot(),'slot','ball','zone'));
  const events=[];
  fire(g,g.snapshot().zone.center);
  const flight=until(g,'FLIGHT',events);
  const payout=until(g,'PAYOUT',events);
  const clear=until(g,'BANNER',events);
  eq('게임에서 오른쪽 지붕 파괴·JACKPOT·클리어와 보너스',
    [[1],8325,5,2,8325,2,1040],
    [all(events,'iron_break').map(event=>event.id),...fields(one(events,'shot_finished'),'score','bucketSum'),
      ...fields(one(events,'stage_clear'),'stage','stageScore','ballsLeft','bonus')]);
  eq('스냅샷과 이벤트의 주차·저금 필드 제거',false,
    [initial,flight.shot,flight.balls[0],payout.payout,one(events,'shot_finished')]
      .some(obj=>['parked','bank','bankIn'].some(key=>key in obj)) ||
      events.some(event=>['ball_parked','parked_release'].includes(event.type)));
  const next=until(g,clear.tick+60,events);
  eq('클리어 뒤 카드 없이 3단계의 기본 랙',[0,3,'AIM',rack,rack,JD.CARD_IDS.map(()=>0)],
    [all(events,'cards_offered').length,...fields(next,'stage','state','fullRack','rack'),cardLevels(next.up)]);
});
test('F21','한 발 한 구슬과 공끼리 충돌',eq => {
  const u=ironRack();
  eq('여러 개 장전 상수와 강화 필드 없음',false,['LOAD_GAP','LOAD_MAX','LOAD_SPREAD'].some(key=>key in JD.CFG)||
    ['springLoad','load'].some(key=>key in u||key in JD.CARD_CAP||JD.CARD_IDS.includes(key)));
  const oldCard=ironRack(), oldLeft=oldCard.rack.slice();
  JD.applyCard(oldCard,'springLoad',board(3,1,oldCard),oldLeft,JD.mulberry32(1000));
  eq('지워진 카드로 랙이나 장전 능력이 바뀌지 않음',[rack,false],[oldLeft,'load' in oldCard]);
  const direct=JD.createShot(board(3,1,u),0,u,{balls:['normal','normal','iron']});
  eq('예전 선택 배열 대신 일반 구슬 하나로 시작',[['normal'],['normal']],
    [direct.balls.map(ball=>ball.key),one(direct.events,'launch').balls]);
  const split=up({split:2});
  eq('분열한 공끼리 여전히 부딪힘',3,all(shot(board(1,1,split),0,split).events,'ball_hit').length);
  const g=JD.createGame({seed:1,start:3});
  eq('3단계 기본 장전·구슬·힌트',[0,'iron',null],fields(g.snapshot(),'slot','ball','hint'));
  const pick=slot=>{send(g,{type:'pickBall',slot});return fields(g.snapshot(),'slot','ball');};
  eq('탄창 탭은 장전 구슬만 교체',[[1,'normal'],[0,'iron']],[1,0].map(pick));
  send(g,{type:'loadAll'});
  eq('삭제된 모두 장전 명령은 아무 효과 없음',[0,'iron'],fields(g.snapshot(),'slot','ball'));
  const ironEvents=[];
  fire(g,0); until(g,'LAUNCH',ironEvents);
  eq('0번의 장전 구슬은 쇠 구슬 한 개',[['iron'],2],fields(one(ironEvents,'shot_fired'),'balls','ballsLeft'));
  const normal=JD.createGame({seed:1,start:3});
  const normalEvents=[];
  queue(normal,{type:'pickBall',slot:1}); fire(normal,0); until(normal,'LAUNCH',normalEvents);
  eq('일반 구슬을 고르면 한 개만 발사 및 차감',[3,0,true,['normal'],2],
    fields(one(normalEvents,'shot_fired'),'stage','angle','perfect','balls','ballsLeft'));
  const flight=until(normal,'FLIGHT',normalEvents);
  eq('비행 시작 시 공 한 개와 대기 필드 없음',[['normal'],false],
    [flight.balls.map(ball=>ball.key),flight.balls.some(ball=>'wait' in ball)]);
  const contact=JD.createShot(blank(),0,u);
  contact.balls=[JD.newBall(100,100,2,0,'normal'),JD.newBall(115,100,0,0,'normal')];
  JD.ballContacts(contact);
  eq('동일 질량 공끼리 반발 계수 0.9',[0.1,1.9,0,1],
    [...contact.balls.map(ball=>Number(ball.vx.toFixed(1))),...fields(one(contact.events,'ball_hit'),'a','b')]);
});
test('F22','긴 보드와 워프 한 번',eq => {
  eq('24줄 고정 단계',[5,8,10,14,18,19,20],JD.STAGES.map((stage,index)=>stage.rows===24?index+1:0).filter(Boolean));
  eq('12줄과 24줄 보드 규격',[{rows:12,landY:596,h:640,maxFlight:720},{rows:24,landY:980,h:1024,maxFlight:1440}],
    [JD.boardSize({}),JD.boardSize({rows:24})]);
  const grid=JD.pegGrid(24);
  eq('24줄 핀 위치 수와 마지막 줄',[204,896],[grid.length,grid[grid.length-1].y]);
  const z=shot(board(5),0);
  eq('ZIGZAG 바닥 쇠 지붕 접촉 수·착지 칸·점수·핀값·스텝·t',[2,[0],2550,2550,1058,1050],
    [all(z.events,'iron_hit').length,z.cells,z.s.score,z.s.pts,z.steps,z.s.t]);
  const vault=shot(board(8),0);
  eq('VAULT 복제 구슬 착지 칸·점수·스텝과 워프',[[4,3],23175,927,[[1,1,96,560]]],
    [vault.s.balls.map(ball=>ball.bucket),vault.s.score,vault.steps,
      all(vault.events,'warp').map(event=>fields(event,'from','to','ox','oy'))]);
  eq('12줄 게이트는 긴 보드용 위치를 제외',true,range(20,i=>board(i)).filter(b=>b.rows===12)
    .every(b=>b.gates.every(gate=>![592,720,848].includes(gate.y))));
  eq('5단계의 세로 확장 게이트',['plus@72,720','minus@180,848'],z.s.board.gates.filter(gate=>gate.y>=592)
    .map(gate=>gate.kind+'@'+gate.x+','+gate.y));
  const previous=board(4);
  shot(previous,-30);
  eq('다음 단계와 재도전 보드의 워프 입구는 열려 있음',[[true,false],[true],[true,true]],
    [previous.warps.ins.map(entrance=>entrance.alive),board(6).warps.ins.map(entrance=>entrance.alive),
      board(4,1,up(),1).warps.ins.map(entrance=>entrance.alive)]);
  const springBoard=blank({springs:[[380,450]]});
  const spring=shot(springBoard,48), miss=shot(springBoard,-60);
  eq('스프링 높이에서만 벽 반동과 이벤트 발생',[[[0,'R',352,438.6]],1,93,0,0,64],
    [all(spring.events,'wall_spring').map(event=>[...fields(event,'ball','side','x'),Number(event.y.toFixed(1))]),
      spring.s.balls[0].bucket,spring.steps,all(miss.events,'wall_spring').length,miss.s.balls[0].bucket,miss.steps]);
  const cooldown=JD.createShot(springBoard,0,up()), ball=cooldown.balls[0];
  Object.assign(ball,{x:8,y:410,vx:-2,vy:1});
  eq('벽 반동 직후 12틱 재발동 금지',[true,12,false,1],
    [JD.wallSpring(cooldown,ball,0,'L'),ball.springCd,JD.wallSpring(cooldown,ball,0,'L'),all(cooldown.events,'wall_spring').length]);
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
  const u=JD.newUpgrades({mult:1,value:2,gold:1,ball:1,blast:1},1), b=board(2,1,u);
  const s=JD.createShot(b,0,u);
  eq('영구 강화가 랙·금 핀·배수·핀 값·폭발 반경에 적용',[['iron','normal','normal','normal'],10,2,20,76],
    [u.rack,b.pegs.filter(peg=>peg.type==='gold').length,b.mult,s.base,s.blastR]);
  const perks={...JD.newPerks(),ball:2};
  eq('새 도전에서 강화한 구슬 수를 단계별 랙에 반영',
    [Array(5).fill('normal'),['iron','normal','normal','normal','normal'],'undefined'],
    [JD.newUpgrades(perks,0).rack,JD.newUpgrades(perks,1).rack,typeof JD.syncPerks]);
  eq('금 핀 여섯 개를 켠 발은 6코인',6,JD.shotCoins(shot(board(1),0).s));
  eq('재도전 번호로 금 핀 배치와 워프 난수 변경',[[0,6,18,37],[3,7,43,49],2967,2980],
    [[0,1].map(attempt=>board(2,1,up(),attempt).pegs.filter(peg=>peg.type==='gold').slice(0,4).map(peg=>peg.id)),
      [0,1].map(attempt=>board(4,1,up(),attempt).warps.rnd.s)].flat());
});
test('F24','캠페인 하네스와 상점·지도 API',eq => {
  const total=values=>values.reduce((sum,value)=>sum+value,0);
  for(const [policy,count,expected] of [['aim',40,[40,32,37,41]],['random',20,[20,39,42,44]]]) {
    const runs=range(count,seed=>JD.simulateCampaign(seed,policy,30));
    const tries=runs.map(run=>total(run.tries)).sort((a,b)=>a-b);
    // ACCEPTANCE reports the lower middle observation when the sample size is even.
    const middle=count/2;
    eq(policy+' 20단계 클리어 수와 총 도전 수의 아래 중앙 관측값·90% 순위·최대',expected,
      [runs.filter(run=>run.cleared===20).length,tries[middle-1],tries[Math.ceil(count*0.9)-1],tries[count-1]]);
    if(policy==='aim') {
      const run=runs[0];
      eq('시드 1 캠페인 클리어·도전 수·누적 코인·잔액·강화·발·카드',
        [20,[1,1,1,3,1,1,2,1,4,3,2,2,1,1,1,2,1,1,1,7],588,83,{mult:3,value:4,gold:4,ball:0,blast:3},92,55],
        [run.cleared,run.tries,run.coins,run.wallet.coins,run.wallet.perks,run.shots,run.cards]);
    }
  }
  const campaign={seed:7,stage:3,attempt:2};
  const saved={coins:40,perks:JD.newPerks(),campaign:{...campaign,up:{...ironRack(),heavy:3,goldPlus:2,
    rack:['glass','big','normal'],load:3,springLoad:1}},
    cleared:3,endlessUnlocked:false};
  const original=JSON.parse(JSON.stringify(saved));
  const g=JD.createGame({seed:7,save:saved}), es=g.drainEvents();
  eq('저장된 4단계 도전 및 지갑 이어하기',[4,'HOURGLASS',17000,'campaign',2,40,rack],
    [...fields(one(es,'stage_started'),'stage','name','target','mode','attempt'),...fields(g.snapshot(),'coins','rack')]);
  eq('v3 저장의 이전 강화 객체를 무시하고 새 도전에서 카드 없이 시작',[ironRack(),campaign],
    [g.snapshot().up,g.saveState().campaign]);
  const opened=send(g,{type:'openMap'});
  eq('캠페인 지도 진행도와 잠금',['MAP',3,3,false,1],
    [g.snapshot().state,...fields(g.snapshot().map,'cleared','current','endlessUnlocked'),all(opened,'map_opened').length]);
  send(g,{type:'startEndless'});
  eq('잠긴 무한 모드는 시작할 수 없음','MAP',g.snapshot().state);
  send(g,{type:'continue'});
  eq('지도에서 같은 캠페인 도전 계속하기',['AIM',4,2],fields(g.snapshot(),'state','stage','attempt'));
  const finishShot=(game,angle,events=[])=>{
    fire(game,angle);
    until(game,'PAYOUT',events);
    events.push(...send(game,{type:'skip'}));
  };
  for(let i=0;i<3;i++) {
    finishShot(g,0);
    if(i<2) send(g,{type:'pick',index:0});
  }
  const shop=until(g,'SHOP');
  eq('4단계 재도전에 실패해 상점 진입',[9460,44,2],fields(shop,'stageScore','coins','attempt'));
  const bought=one(send(g,{type:'buy',id:'gold'}),'perk_bought');
  eq('구매 이벤트 및 적용된 강화',['gold',1,15,29,1],
    [...fields(bought,'id','level','cost','coins'),g.snapshot().perks.gold]);
  send(g,{type:'retry'});
  const retry=g.snapshot();
  eq('카드를 비우고 기본 랙과 구매한 강화로 새 배치에서 재도전',[4,3,rack,29,1,JD.CARD_IDS.map(()=>0),true],
    [...fields(retry,'stage','attempt','rack','coins'),
      retry.up.perks.gold,cardLevels(retry.up),
      JSON.stringify(retry.pegs)!==JSON.stringify(board(4,7,retry.up,2).pegs)]);
  eq('재도전은 같은 시드와 새 도전 번호로 보드를 만듦',board(4,7,retry.up,3).pegs,retry.pegs);
  eq('createGame은 전달된 저장 객체를 직접 수정하지 않음',original,saved);

  const unlock=JD.createGame({seed:4,save:{campaign:{seed:4,stage:7,attempt:0},cleared:7}}), unlockEvents=[];
  finishShot(unlock,-60,unlockEvents);
  const milestone=until(unlock,'BANNER',unlockEvents), cleared=one(unlockEvents,'stage_clear');
  const unlocked=one(unlockEvents,'endless_unlocked');
  eq('첫 8단계 클리어 직후 무한 해금',[8,353430,true,true,true,'unlock',true],
    [...fields(cleared,'stage','stageScore','firstClear'),cleared.tick===unlocked.tick,
      unlockEvents.indexOf(cleared)+1===unlockEvents.indexOf(unlocked),milestone.banner.kind,milestone.endlessUnlocked]);
  const afterUnlock=until(unlock,milestone.tick+90,unlockEvents);
  eq('해금 배너 90틱 뒤 새 단계가 카드 없이 시작',[9,'AIM',0],
    [...fields(afterUnlock,'stage','state'),all(unlockEvents,'cards_offered').length]);
  send(unlock,{type:'openMap'});
  eq('해금 뒤 지도에서 무한 모드가 열림',true,unlock.snapshot().map.endlessUnlocked);
  send(unlock,{type:'startEndless'});
  eq('열린 무한 모드를 새 판으로 시작',['AIM','endless',1,25000,rack],
    fields(unlock.snapshot(),'state','mode','stage','target','fullRack'));
  const endlessEvents=[];
  for(let i=0;i<3;i++) {
    finishShot(unlock,15,endlessEvents);
    if(i<2) endlessEvents.push(...send(unlock,{type:'pick',index:0}));
  }
  const firstClear=until(unlock,'BANNER',endlessEvents);
  until(unlock,firstClear.tick+60,endlessEvents);
  for(let i=0;i<3;i++) {
    finishShot(unlock,-60,endlessEvents);
    if(i<2) endlessEvents.push(...send(unlock,{type:'pick',index:2}));
  }
  const endlessResult=until(unlock,'RESULT',endlessEvents), endlessSave=unlock.saveState();
  eq('무한 기록은 클리어 수와 구분해 도달 단계로 저장',[1,2,2,2],
    [...fields(endlessResult.result,'reached','stageReached'),endlessResult.endlessBest,endlessSave.endlessBest]);
  const resumedCampaign=JD.createGame({save:endlessSave}).snapshot();
  eq('무한 도전 뒤의 저장은 캠페인 진도와 무한 최고 기록을 유지',['campaign',9,2],
    fields(resumedCampaign,'mode','stage','endlessBest'));

  const perks={mult:3,value:4,gold:4,ball:1,blast:3};
  const finale=JD.createGame({seed:1,save:{perks,campaign:{seed:1,stage:19,attempt:2},cleared:19,endlessUnlocked:true}});
  const lastEvents=[];
  finishShot(finale,45,lastEvents);
  const finalBanner=until(finale,'BANNER',lastEvents), finalClear=one(lastEvents,'stage_clear');
  const finish=until(finale,'MAP',lastEvents), allClear=one(lastEvents,'all_clear'), campaignClear=one(lastEvents,'campaign_clear');
  eq('20단계 클리어·완주 이벤트·배너·90틱·지도로 이어지고 카드 없음',[20,846400,true,true,'allclear',90,'MAP',20,0],
    [...fields(finalClear,'stage','stageScore'),finalClear.tick===allClear.tick,allClear.tick===campaignClear.tick,
      finalBanner.banner.kind,finish.tick-finalBanner.tick,finish.state,finish.map.cleared,all(lastEvents,'cards_offered').length]);
});
})(window.JD);
