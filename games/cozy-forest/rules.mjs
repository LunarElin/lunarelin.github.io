export const ANIMALS = [
  {name:'토끼', color:'#f5b4bb', pale:'#ffe6e8'},
  {name:'여우', color:'#eca66c', pale:'#ffe5c9'},
  {name:'곰', color:'#b79778', pale:'#eee0ce'},
  {name:'고양이', color:'#b8a4d8', pale:'#eee5fc'},
  {name:'개구리', color:'#94bd7b', pale:'#e2efcf'},
  {name:'병아리', color:'#e5c56c', pale:'#fff1bf'},
  {name:'판다', color:'#98b6ba', pale:'#dfedef'},
  {name:'강아지', color:'#ceac8c', pale:'#f5e3d0'},
];
export const FEVER_SECONDS=16, FEVER_MAX=24, FEVER_EXTENSION_LIMIT=6;
export const ITEMS = [
  {id:'magnet', name:'당근 자석', icon:'magnet', color:'#e6a17c', desc:'보드에서 누르면 바구니에 가장 많이 쌓인 동물부터 3마리를 구조해요.', tip:'한 마리보다 두 마리 모인 짝을 먼저 구해요.'},
  {id:'shuffle', name:'살랑 바람', icon:'shuffle', color:'#91b8c4', desc:'보드에서 누르면 남은 동물을 다시 섞어요. 바구니의 쌍부터 찾기 쉽게 배치해요.', tip:'동물들이 가려져 막막할 때 도움이 돼요.'},
  {id:'freeze', name:'눈꽃 시계', icon:'freeze', color:'#9bc9dc', desc:'15초 동안 제한 시간을 멈춰요. 피버 중에는 피버가 끝난 뒤부터 사용돼요.', tip:'피버와 함께 눌러도 눈꽃 시간이 낭비되지 않아요.'},
  {id:'basket', name:'구조 바구니', icon:'basket', color:'#c7aa80', desc:'보드에서 누르면 바구니 속 동물을 최대 3마리 숲의 맨 위로 돌려보내요.', tip:'바구니가 비어 있으면 제한 시간 +5초!' },
  {id:'fever', name:'별사탕', icon:'fever', color:'#e9c16d', desc:'즉시 16초 피버! 진행 중에는 8초 연장해요. 남은 피버는 최대 24초예요.', tip:'피버는 점수 2배! 매칭으로 피버를 최대 6초 더 늘릴 수 있어요.'},
];
export const LESSONS = [
  {title:'처음 만난 숲', item:null, text:'가려지지 않은 동물을 톡! 같은 동물 3마리를 바구니에 모으면 집으로 돌아가요.'},
  ...ITEMS.map(item => ({title:item.name, item:item.id, text:item.desc})),
];
export function random(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function shuffled(values, rng) {
  const copy = values.slice();
  for (let i=copy.length-1;i>0;i--) { const j=Math.floor(rng()*(i+1)); [copy[i],copy[j]]=[copy[j],copy[i]]; }
  return copy;
}
export function isOpen(board, tile) {
  return !board.some(other => other.z > tile.z && Math.abs(other.x-tile.x)<.93 && Math.abs(other.y-tile.y)<.93);
}
export const available = state => state.board.filter(tile => isOpen(state.board,tile));
function removalOrder(board, rng) {
  const remaining=board.slice(), order=[];
  while (remaining.length) {
    const open=remaining.filter(tile=>isOpen(remaining,tile));
    const tile=open[Math.floor(rng()*open.length)];
    order.push(tile); remaining.splice(remaining.indexOf(tile),1);
  }
  return order;
}
function assignTypes(board, tray, types, rng) {
  const order=removalOrder(board,rng), animals=order.filter(tile=>!tile.item), counts=Array(ANIMALS.length).fill(0), queue=[];
  for (const type of types) counts[type]++;
  // Finish existing pairs before the generated sequence of complete triples.
  const priority=Array.from({length:counts.length},(_,type)=>type).sort((a,b)=>tray.filter(t=>t.type===b).length-tray.filter(t=>t.type===a).length);
  for (const type of priority) {
    const need=(3-tray.filter(t=>t.type===type).length%3)%3;
    for(let i=0;i<need;i++) { queue.push(type); counts[type]--; }
  }
  const groups=[];
  counts.forEach((count,type)=>{ for(let i=0;i<count/3;i++) groups.push(type); });
  for(const type of shuffled(groups,rng)) queue.push(type,type,type);
  animals.forEach((tile,i)=>{tile.type=queue[i];});
  return order.map(tile=>tile.id);
}
export function createGame({mode='endless',level=1,lesson=0,seed=Date.now()>>>0}={}) {
  const rng=random(seed), tutorial=mode==='tutorial';
  const count=tutorial ? 18 : Math.min(60,30+6*Math.floor((level-1)/3));
  const sizes=tutorial?[12,6,0]:{
    30:[18,9,3],36:[21,12,3],42:[24,12,6],48:[27,15,6],54:[30,15,9],60:[30,18,12],
  }[count];
  const board=[];
  sizes.forEach((size,z)=>{
    const cols=6-z,rows=5-z, positions=[];
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) positions.push({x:x+z*.5+.5,y:y+z*.5+.45,z:z*2});
    const chosen=positions.sort((a,b)=>Math.hypot(a.x-3,a.y-2.5)-Math.hypot(b.x-3,b.y-2.5)).slice(0,size);
    chosen.forEach(p=>board.push({...p,id:board.length,type:0}));
  });
  const kinds=tutorial?3:Math.min(8,4+Math.floor((level-1)/4));
  const types=Array.from({length:count/3},(_,i)=>i%kinds).flatMap(t=>[t,t,t]);
  const solution=assignTypes(board,[],types,rng);
  const state={version:2,mode,level,lesson,seed,board,tray:[],solution,total:count,saved:0,capacity:7,score:0,
    time:tutorial?120:Math.max(110,125-Math.floor(level/5)*2)+count+Math.max(0,count-42)*1.5,elapsed:0,combo:0,lastMatch:-100,
    charge:0,fever:0,feverExtension:0,feverScore:0,frozen:0,status:'playing',used:{},shuffles:0,itemsCollected:0,itemsTotal:0};
  if(tutorial && LESSONS[lesson]?.item==='basket') {
    for(const id of solution.slice(0,2)) {const tile=board.find(t=>t.id===id);board.splice(board.indexOf(tile),1);state.tray.push(tile);}
  }
  const itemIds=tutorial?(LESSONS[lesson].item?[LESSONS[lesson].item]:[]):shuffled(ITEMS,rng).slice(0,Math.min(5,3+Math.floor(level/4))).map(item=>item.id);
  const bases=shuffled(board.filter(tile=>tile.z===0),rng);
  itemIds.forEach((item,i)=>{const base=bases[i];board.push({id:count+i,type:null,item,x:base.x,y:base.y,z:i===0?6:(i%2?1:3)});});
  state.itemsTotal=itemIds.length;
  state.solution=assignTypes(board,state.tray,board.filter(tile=>!tile.item).map(tile=>tile.type),rng);
  return state;
}
function finish(state) {
  const learned=state.mode!=='tutorial'||!LESSONS[state.lesson].item||state.used[LESSONS[state.lesson].item]>0;
  if(!state.board.some(tile=>!tile.item)&&!state.tray.length&&learned) {state.status='won';state.board=[];}
  else if(state.tray.length>=state.capacity) state.status='lost';
}
function startFever(state) {
  state.fever=FEVER_SECONDS;state.feverExtension=0;state.feverScore=0;state.charge=0;
}
export function revealRescue(state) {
  if(state.status!=='playing'||state.tray.length<5) return null;
  const rescue=['magnet','basket','shuffle'],items=state.board.filter(t=>rescue.includes(t.item));
  if(items.some(t=>isOpen(state.board,t))) return null;
  const tile=rescue.map(id=>items.find(t=>t.item===id)).find(Boolean);
  if(!tile) return null;
  tile.z=Math.max(...state.board.map(t=>t.z))+1;tile.rescue=true;
  state.solution=[tile.id,...state.solution.filter(id=>id!==tile.id)];
  return tile.item;
}
function matched(state,type,tiles) {
  state.combo=state.elapsed-state.lastMatch<=8 ? state.combo+1:1;
  state.lastMatch=state.elapsed;
  const points=(300+Math.min(5,state.combo-1)*60)*(state.fever>0?2:1);
  state.score+=points; state.saved+=3;
  const wasFever=state.fever>0;
  let feverBonus=0;
  if(wasFever) {
    state.feverScore+=points;
    feverBonus=Math.min(2,FEVER_EXTENSION_LIMIT-(state.feverExtension||0),FEVER_MAX-state.fever);
    state.fever+=feverBonus;state.feverExtension=(state.feverExtension||0)+feverBonus;
  }
  else {state.charge=Math.min(100,state.charge+25);if(state.charge===100) startFever(state);}
  finish(state);
  return {ok:true,match:true,type,tiles,points,combo:state.combo,multiplier:wasFever?2:1,timeBonus:0,feverBonus,feverStarted:!wasFever&&state.fever>0};
}
export function pick(state,id) {
  if(state.status!=='playing') return {ok:false,reason:'ended'};
  const tile=state.board.find(t=>t.id===id);
  if(!tile || !isOpen(state.board,tile)) return {ok:false,reason:'covered'};
  if(tile.item) {
    state.board.splice(state.board.indexOf(tile),1);state.itemsCollected++;state.used[tile.item]=(state.used[tile.item]||0)+1;
    const bonus=state.fever>0?200:100;state.score+=bonus;if(state.fever>0) state.feverScore+=bonus;
    const result=activateItem(state,tile.item);finish(state);
    return {...result,ok:true,item:tile.item,itemPickup:true,points:(result.points||0)+bonus,tile,itemRevealed:revealRescue(state)};
  }
  state.board.splice(state.board.indexOf(tile),1); state.tray.push(tile);
  const triple=state.tray.filter(t=>t.type===tile.type);
  if(triple.length>=3) {state.tray=state.tray.filter(t=>!triple.includes(t));return matched(state,tile.type,triple);}
  finish(state); return {ok:true,match:false,tile,itemRevealed:revealRescue(state)};
}
function returnToBoard(state,tiles) {
  let z=Math.max(0,...state.board.map(t=>t.z))+1;
  tiles.forEach(tile=>{state.board.push({...tile,z:z++});});
  state.tray=state.tray.filter(t=>!tiles.includes(t));
  state.solution=[...tiles.map(tile=>tile.id).reverse(),...state.solution.filter(id=>!tiles.some(tile=>tile.id===id))];
}
function activateItem(state,id) {
  let result={ok:true,item:id};
  if(id==='basket') {
    if(state.tray.length) returnToBoard(state,state.tray.slice(-3));
    else {state.time+=5;result.timeBonus=5;}
  } else if(id==='freeze') state.frozen=Math.max(state.frozen,15);
  else if(id==='fever') {
    if(state.fever<=0) {startFever(state);result.feverStarted=true;}
    else {const before=state.fever;state.fever=Math.min(FEVER_MAX,state.fever+8);result.feverBonus=state.fever-before;}
  }
  else if(id==='shuffle') {
    if(state.tray.length===state.capacity-1&&state.tray.every(tile=>state.tray.filter(t=>t.type===tile.type).length===1)) {
      returnToBoard(state,state.tray.slice(-1));result.rescuedSlot=true;
    }
    state.solution=assignTypes(state.board,state.tray,state.board.filter(tile=>!tile.item).map(tile=>tile.type),random(state.seed+(++state.shuffles)*7919));
  } else if(id==='magnet') {
    const order=state.solution;
    const preferred=state.tray.slice().reverse().sort((a,b)=>state.tray.filter(t=>t.type===b.type).length-state.tray.filter(t=>t.type===a.type).length)[0]||state.board.find(t=>t.id===order.find(id=>state.board.some(t=>t.id===id&&!t.item)));
    if(!preferred) {state.time+=5;return {...result,timeBonus:5};}
    const type=preferred.type;
    const candidates=[...state.tray.filter(t=>t.type===type),...state.board.filter(t=>!t.item&&t.type===type).sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id))];
    const tiles=candidates.slice(0,3);
    if(tiles.length!==3) return result;
    state.board=state.board.filter(t=>!tiles.includes(t));state.tray=state.tray.filter(t=>!tiles.includes(t));
    result={...matched(state,type,tiles),item:id};
  }
  return result;
}
export function tick(state,dt) {
  if(state.status!=='playing'||!Number.isFinite(dt)||dt<=0) return;
  dt=Math.min(dt,1);state.elapsed+=dt;
  const feverTime=Math.min(dt,state.fever),freezeTime=Math.min(dt-feverTime,state.frozen);
  state.time=Math.max(0,state.time-(dt-feverTime-freezeTime));
  state.fever=Math.max(0,state.fever-feverTime);state.frozen=Math.max(0,state.frozen-freezeTime);
  if(state.elapsed-state.lastMatch>8) state.combo=0;
  if(state.time===0) {
    if(state.mode==='tutorial') state.time=60;
    else state.status='lost';
  }
}
export function validSave(state) {
  if(!state||state.version!==2||!['tutorial','endless'].includes(state.mode)||state.status!=='playing') return false;
  if(!Number.isInteger(state.level)||state.level<1||!Number.isInteger(state.lesson)||state.lesson<0||state.lesson>=LESSONS.length) return false;
  if(!Array.isArray(state.board)||!Array.isArray(state.tray)||!state.board.length||state.board.length>65||state.tray.length>=state.capacity) return false;
  if(!Array.isArray(state.solution)||!state.used||typeof state.used!=='object') return false;
  if(!['score','saved','total','time','elapsed','charge','combo','fever','feverScore','frozen','seed','shuffles','itemsCollected','itemsTotal'].every(key=>Number.isFinite(state[key])&&state[key]>=0)) return false;
  if(!Number.isFinite(state.lastMatch)||!Number.isInteger(state.capacity)||state.capacity<7||state.capacity>10||state.time<=0) return false;
  if(!['saved','total','combo','seed','shuffles','itemsCollected','itemsTotal'].every(key=>Number.isInteger(state[key]))) return false;
  if(state.total<=0||state.total>60||state.total%3||state.saved%3||state.itemsTotal>5||state.charge>100||state.fever>FEVER_MAX||state.frozen>15) return false;
  if(state.feverExtension!==undefined&&(!Number.isFinite(state.feverExtension)||state.feverExtension<0||state.feverExtension>FEVER_EXTENSION_LIMIT)) return false;
  if(!state.solution.every(Number.isInteger)||new Set(state.solution).size!==state.solution.length) return false;
  if(!state.board.every(t=>t&&state.solution.includes(t.id))) return false;
  const all=[...state.board,...state.tray];
  if(!all.every(t=>t&&Number.isInteger(t.id)&&(t.item?ITEMS.some(item=>item.id===t.item)&&t.type===null:Number.isInteger(t.type)&&t.type>=0&&t.type<ANIMALS.length)&&Number.isFinite(t.x)&&t.x>=0&&t.x<=6&&Number.isFinite(t.y)&&t.y>=0&&t.y<=5&&Number.isFinite(t.z)&&t.z>=0)) return false;
  if(state.tray.some(t=>t.item)||!Object.entries(state.used).every(([id,n])=>ITEMS.some(item=>item.id===id)&&Number.isInteger(n)&&n>=0)) return false;
  if(Object.values(state.used).reduce((sum,n)=>sum+n,0)!==state.itemsCollected) return false;
  return new Set(all.map(t=>t.id)).size===all.length&&all.filter(t=>!t.item).length+state.saved===state.total&&all.filter(t=>t.item).length+state.itemsCollected===state.itemsTotal&&ANIMALS.every((_,type)=>all.filter(t=>!t.item&&t.type===type).length%3===0);
}
