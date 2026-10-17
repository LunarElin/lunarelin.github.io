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
export const ITEMS = [
  {id:'magnet', name:'당근 자석', icon:'magnet', cost:35, desc:'바구니부터 같은 동물 3마리를 찾아 한 번에 구조해요.'},
  {id:'undo', name:'되돌림 잎사귀', icon:'undo', cost:15, desc:'가장 최근에 바구니에 담은 동물 1마리를 숲으로 돌려보내요.'},
  {id:'shuffle', name:'살랑 바람', icon:'shuffle', cost:20, desc:'남은 동물을 다시 섞어요. 바구니 속 동물의 짝부터 찾기 쉽게 배치해요.'},
  {id:'hint', name:'반딧불 힌트', icon:'hint', cost:10, desc:'지금 모으기 좋은, 가려지지 않은 동물들을 반짝이게 해요.'},
  {id:'hammer', name:'도토리 톡톡', icon:'hammer', cost:30, desc:'숲의 동물을 고르면 가려진 짝까지 같은 동물 3마리를 구조해요.'},
  {id:'freeze', name:'눈꽃 시계', icon:'freeze', cost:20, desc:'15초 동안 제한 시간이 줄어들지 않아요.'},
  {id:'slot', name:'넉넉 주머니', icon:'slot', cost:25, desc:'이번 스테이지의 바구니를 1칸 늘려요. 최대 10칸이에요.'},
  {id:'time', name:'꿀 한 스푼', icon:'time', cost:20, desc:'제한 시간을 30초 늘려요.'},
  {id:'basket', name:'구조 바구니', icon:'basket', cost:25, desc:'바구니의 동물을 최대 3마리 숲의 맨 위로 돌려보내요.'},
  {id:'fever', name:'별사탕', icon:'fever', cost:40, desc:'즉시 12초 피버! 점수 2배, 제한 시간 정지, 매칭마다 시간이 늘어요.'},
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
  const order=removalOrder(board,rng), counts=Array(ANIMALS.length).fill(0), queue=[];
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
  order.forEach((tile,i)=>{tile.type=queue[i];});
  return order.map(tile=>tile.id);
}
export function createGame({mode='endless',level=1,lesson=0,seed=Date.now()>>>0}={}) {
  const rng=random(seed), tutorial=mode==='tutorial';
  const count=tutorial ? 18 : Math.min(60,30+6*Math.floor((level-1)/2));
  const sizes=tutorial?[12,6,0]:{
    30:[18,9,3],36:[21,12,3],42:[24,12,6],48:[27,15,6],54:[30,15,9],60:[30,18,12],
  }[count];
  const board=[];
  sizes.forEach((size,z)=>{
    const cols=6-z,rows=5-z, positions=[];
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) positions.push({x:x+z*.5+.5,y:y+z*.5+.45,z});
    const chosen=positions.sort((a,b)=>Math.hypot(a.x-3,a.y-2.5)-Math.hypot(b.x-3,b.y-2.5)).slice(0,size);
    chosen.forEach(p=>board.push({...p,id:board.length,type:0}));
  });
  const kinds=tutorial?3:Math.min(8,4+Math.floor((level-1)/3));
  const types=Array.from({length:count/3},(_,i)=>i%kinds).flatMap(t=>[t,t,t]);
  const solution=assignTypes(board,[],types,rng);
  const state={version:1,mode,level,lesson,seed,board,tray:[],solution,total:count,saved:0,capacity:7,score:0,
    time:tutorial?120:Math.max(90,125-Math.floor(level/5)*3)+count,elapsed:0,combo:0,lastMatch:-100,
    charge:0,fever:0,frozen:0,status:'playing',history:[],used:{},shuffles:0,hints:[],target:null};
  // These lessons begin with a real tray selection, so their item works immediately.
  if(tutorial && ['undo','basket'].includes(LESSONS[lesson]?.item)) {
    const n=LESSONS[lesson].item==='basket'?2:1;
    for(let i=0;i<n;i++) { const tile=available(state)[0]; state.board.splice(state.board.indexOf(tile),1); state.tray.push(tile); state.history.push(tile.id); }
  }
  return state;
}
function finish(state) {
  state.hints=[];
  if(!state.board.length&&!state.tray.length) state.status='won';
  else if(state.tray.length>=state.capacity) state.status='lost';
}
function matched(state,type,tiles) {
  state.combo=state.elapsed-state.lastMatch<=6 ? state.combo+1:1;
  state.lastMatch=state.elapsed;
  const points=(300+Math.min(5,state.combo-1)*60)*(state.fever>0?2:1);
  state.score+=points; state.saved+=3;
  state.history=state.history.filter(id=>!tiles.some(tile=>tile.id===id));
  const wasFever=state.fever>0;
  if(wasFever) state.time+=2;
  else { state.charge=Math.min(100,state.charge+25); if(state.charge===100) {state.fever=12;state.charge=0;} }
  finish(state);
  return {ok:true,match:true,type,tiles,points,combo:state.combo,feverStarted:!wasFever&&state.fever>0};
}
export function pick(state,id) {
  if(state.status!=='playing') return {ok:false,reason:'ended'};
  const tile=state.board.find(t=>t.id===id);
  if(!tile || !isOpen(state.board,tile)) return {ok:false,reason:'covered'};
  state.board.splice(state.board.indexOf(tile),1); state.tray.push(tile); state.history.push(id);state.hints=[];
  const triple=state.tray.filter(t=>t.type===tile.type);
  if(triple.length>=3) {state.tray=state.tray.filter(t=>!triple.includes(t));return matched(state,tile.type,triple);}
  finish(state); return {ok:true,match:false,tile};
}
export function suggest(state) {
  const open=available(state), scored=Array.from({length:ANIMALS.length},(_,type)=>({type,
    tray:state.tray.filter(t=>t.type===type).length,tiles:open.filter(t=>t.type===type)})).filter(x=>x.tiles.length);
  scored.sort((a,b)=>Number(b.tray+b.tiles.length>=3)-Number(a.tray+a.tiles.length>=3)||b.tray-a.tray||b.tiles.length-a.tiles.length);
  return scored[0]?.tiles.slice(0,3-scored[0].tray).map(t=>t.id)||[];
}
function returnToBoard(state,tiles) {
  let z=Math.max(0,...state.board.map(t=>t.z))+1;
  tiles.forEach(tile=>{state.board.push({...tile,z:z++});});
  state.tray=state.tray.filter(t=>!tiles.includes(t));
  state.history=state.history.filter(id=>!tiles.some(t=>t.id===id));
}
export function useItem(state,id,targetId=null) {
  if(state.status!=='playing') return {ok:false,reason:'ended'};
  if(!ITEMS.some(item=>item.id===id)) return {ok:false,reason:'unknown'};
  let result={ok:true,item:id};
  if(id==='undo') {
    const tile=state.tray.find(t=>t.id===state.history.at(-1));
    if(!tile) return {ok:false,reason:'empty'};
    returnToBoard(state,[tile]);
  } else if(id==='basket') {
    if(!state.tray.length) return {ok:false,reason:'empty'};
    returnToBoard(state,state.tray.slice(-3));
  } else if(id==='slot') {
    if(state.capacity>=10) return {ok:false,reason:'max'};
    state.capacity++;
  } else if(id==='time') state.time+=30;
  else if(id==='freeze') state.frozen=Math.max(state.frozen,15);
  else if(id==='fever') {state.fever=12;state.charge=0;result.feverStarted=true;}
  else if(id==='hint') state.hints=suggest(state);
  else if(id==='shuffle') {
    if(!state.board.length) return {ok:false,reason:'empty'};
    if(state.tray.length===state.capacity-1&&state.tray.every(tile=>state.tray.filter(t=>t.type===tile.type).length===1)) return {ok:false,reason:'crowded'};
    state.solution=assignTypes(state.board,state.tray,state.board.map(t=>t.type),random(state.seed+(++state.shuffles)*7919));state.hints=[];
  } else if(id==='magnet'||id==='hammer') {
    let type;
    if(id==='hammer') {
      const target=state.board.find(t=>t.id===targetId);
      if(!target||!isOpen(state.board,target)) return {ok:false,reason:'target'};
      type=target.type;
    } else {
      const preferred=state.tray.at(-1)||available(state)[0];
      if(!preferred) return {ok:false,reason:'empty'};
      type=preferred.type;
    }
    const candidates=[...state.tray.filter(t=>t.type===type),...state.board.filter(t=>t.type===type).sort((a,b)=>b.z-a.z)];
    if(id==='hammer') {const target=state.board.find(t=>t.id===targetId); candidates.splice(candidates.indexOf(target),1);candidates.unshift(target);}
    const tiles=candidates.slice(0,3);
    if(tiles.length!==3) return {ok:false,reason:'empty'};
    state.board=state.board.filter(t=>!tiles.includes(t));state.tray=state.tray.filter(t=>!tiles.includes(t));
    result={...matched(state,type,tiles),item:id};
  }
  state.used[id]=(state.used[id]||0)+1;
  return result;
}
export function tick(state,dt) {
  if(state.status!=='playing'||!Number.isFinite(dt)||dt<=0) return;
  dt=Math.min(dt,1);state.elapsed+=dt;
  const protectedTime=Math.max(state.fever,state.frozen);
  state.time=Math.max(0,state.time-Math.max(0,dt-protectedTime));
  state.fever=Math.max(0,state.fever-dt);state.frozen=Math.max(0,state.frozen-dt);
  if(!state.fever&&state.elapsed-state.lastMatch>6) {state.combo=0;state.charge=Math.max(0,state.charge-dt*3);}
  if(state.time===0) {
    if(state.mode==='tutorial') state.time=60;
    else state.status='lost';
  }
}
export function validSave(state) {
  if(!state||state.version!==1||!['tutorial','endless'].includes(state.mode)||state.status!=='playing') return false;
  if(!Number.isInteger(state.level)||state.level<1||!Number.isInteger(state.lesson)||state.lesson<0||state.lesson>=LESSONS.length) return false;
  if(!Array.isArray(state.board)||!Array.isArray(state.tray)||state.board.length>60||state.tray.length>=state.capacity) return false;
  if(!Array.isArray(state.history)||!Array.isArray(state.hints)||!state.used||typeof state.used!=='object') return false;
  if(!['score','saved','total','time','elapsed','charge','combo','fever','frozen','seed','shuffles'].every(key=>Number.isFinite(state[key])&&state[key]>=0)) return false;
  if(!Number.isFinite(state.lastMatch)||!Number.isInteger(state.capacity)||state.capacity<7||state.capacity>10||state.time<=0) return false;
  const all=[...state.board,...state.tray];
  if(!all.every(t=>Number.isInteger(t.id)&&Number.isInteger(t.type)&&t.type>=0&&t.type<ANIMALS.length&&Number.isFinite(t.x)&&t.x>=0&&t.x<=6&&Number.isFinite(t.y)&&t.y>=0&&t.y<=5&&Number.isFinite(t.z)&&t.z>=0)) return false;
  return new Set(all.map(t=>t.id)).size===all.length&&all.length+state.saved===state.total&&ANIMALS.every((_,type)=>all.filter(t=>t.type===type).length%3===0);
}
