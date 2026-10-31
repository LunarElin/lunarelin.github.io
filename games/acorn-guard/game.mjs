import { HEROES, WORLD, RECRUIT_THRESHOLDS, SEASONS, DECORATIONS, seasonStatus, decorationCost, craftDecoration, cycleDecorationStyle, toggleDecoration, homeComfort, beginSpring, createGame, stepGame, xpForLevel, upgrade, upgradeCost, upgradeDefinitions, upgradeValue, recruitFriend, selectHero, useSkill, restartRun, loadProfile, saveProfile } from './rules.mjs?v=year-cycle-20261031-v1';
import { projectWorldVector, screenInputToWorld, createPoseMemory, actorPose, frameAt } from './motion.mjs';
import { seasonPalette, drawSeasonDetails, drawShelter, drawTrailCabin } from './season-render.mjs?v=year-cycle-20261031-v1';

const $ = selector => document.querySelector(selector);
const canvas = $('#world'), ctx = canvas.getContext('2d', { alpha: false });
const shell = $('#game'), overlay = $('#overlay'), dialog = $('#dialog');
const icon = (name, extra = '') => `<svg ${extra} aria-hidden="true"><use href="#i-${name}"/></svg>`;
const money = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.floor(n).toLocaleString();
let storage;
try { storage = window.localStorage; } catch { storage = { getItem: () => null, setItem: () => {} }; }
const profile = loadProfile(storage);
const state = createGame(profile);
const assets = { heroes: {}, resources: {}, icons: {}, tree: null, background: null, spark: null, seasonTrees: [], shelter: { room:null,cabin:null,decor:{} } };
const camera = { x: state.hero.x, y: state.hero.y };
let width = 390, height = 844, dpr = 1, playTop = 160, playHeight = 450, running = false;
let animationId = 0, lastTime = 0, uiTime = 0, saveTime = 0, lastEffect = 0;
let menu = 'start', previousFocus = null, toastTimer, sound = false, audio, giftClaimed = false;
let terrain, groundPattern, touch = null, assetsReady = false;
let visualSeason=seasonStatus(state).position, ambientTime=0, arrivalTime=0, sceneFade=0, shelterHits=[], selectedDecoration='nest', homeSignature='';
let palette=seasonPalette(visualSeason);
let runtimeManifest=null,assetRevision='year-cycle-20261031-v1',shelterPromise=null;
const atHome=()=>state.journey.phase==='home';
const stumps = [], coins = [], keys = new Set(), uiCache = new Map();
const poses = new Map();
const RESOURCE_NAMES={acorn:'도토리',wood:'목재',berries:'열매',bamboo:'대나무',grain:'곡식'};
const ENCOUNTERS={squirrel:0,...RECRUIT_THRESHOLDS};
const resourceIcon=id=>id==='berries'?'berries':id;
const member=()=>state.members[state.selectedHeroId];
const species=()=>HEROES.find(h=>h.id===state.selectedHeroId);
let hudMember=null, partySignature='';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lifecycle = new AbortController(), listen = { signal: lifecycle.signal };
let settings = {};
try { settings = JSON.parse(storage.getItem('acorn-guard:settings:v1') || '{}') || {}; } catch { /* Defaults remain usable. */ }
sound = settings.sound === true;
giftClaimed = settings.giftClaimed === true;

function saveSettings() {
  try { storage.setItem('acorn-guard:settings:v1', JSON.stringify({ sound, giftClaimed })); } catch { /* Optional settings. */ }
}
function persist() {
  const saved = saveProfile(storage, state);
  if (!saved) $('#announcer').textContent = '진행을 저장하지 못했습니다. 현재 플레이는 계속할 수 있습니다.';
  return saved;
}
function tone(frequency = 550, duration = .08, type = 'sine', volume = .025) {
  if (!sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const oscillator = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * .6, now + duration);
    gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(now + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch { /* Browsers without audio still play. */ }
}
function toast(mark, value, announcement = '') {
  const target = $('#reward-toast');
  target.innerHTML = `${icon(mark)}<strong>${value}</strong>`;
  target.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => target.classList.remove('show'), 2000);
  if (announcement) $('#announcer').textContent = announcement;
}
function setText(selector, value) {
  if (uiCache.get(selector) === String(value)) return;
  uiCache.set(selector, String(value)); $(selector).textContent = value;
}
function displayUpgrade(def,value){
  const number=Number.isInteger(value)?String(value):value.toFixed(1);
  return def.unit==='×'?`×${number}`:`${number}${def.unit||''}`;
}
function updatePartyBar(){
  const signature=state.recruited.join(',')+'|'+state.selectedHeroId+'|'+HEROES.map(h=>state.members[h.id].level).join(',');
  if(signature===partySignature)return;partySignature=signature;
  $('#party-bar').innerHTML=HEROES.map(h=>{
    const unlocked=state.recruited.includes(h.id),selected=h.id===state.selectedHeroId;
    return `<button class="party-member ${unlocked?'':'locked'} ${selected?'selected':''}" data-party="${h.id}" aria-label="${h.name}${unlocked?' 성장 보기':`, 수확 ${ENCOUNTERS[h.id]}회에 만남`}" aria-pressed="${selected}"><canvas data-hero="${h.id}" width="100" height="100"></canvas>${unlocked?`<span class="member-level">${state.members[h.id].level}</span>`:`<span class="party-lock">${icon('lock')}${ENCOUNTERS[h.id]}</span>`}</button>`;
  }).join('');
  $('#party-bar').querySelectorAll('canvas').forEach(c=>portrait(c,c.dataset.hero));
}
function updateHUD(){
  const selected=species(),growth=member();
  setText('#coins',money(state.coins));setText('#level',growth.level);setText('#materials',money(growth.materials));setText('#party-count',`${state.recruited.length}/5`);
  $('#material-icon').setAttribute('href',`#i-${resourceIcon(selected.resource)}`);
  $('.material-counter').setAttribute('aria-label',`${selected.name} ${RESOURCE_NAMES[selected.resource]} ${growth.materials}개, 동료 ${state.recruited.length}마리`);
  const season=seasonStatus(state),home=season.atHome&&arrivalTime<=0;
  shell.classList.toggle('home-mode',home);
  setText('#year',season.year);setText('#food',money(season.food));
  $('#year-fill').style.width=`${season.progress*100}%`;
  $('#stats-button').setAttribute('aria-label',`${season.year}년째 ${SEASONS[season.index].name}, 올해 모은 먹이 ${season.food}개, 겨울 집까지 ${Math.round(season.progress*100)}퍼센트`);
  document.querySelectorAll('[data-season]').forEach((el,index)=>{el.classList.toggle('current',index===season.index);el.classList.toggle('visited',index<season.index);});
  $('#home-tools').hidden=!home;
  $('#world').setAttribute('aria-label',home?'겨울 집. 가구를 누르거나 아래 꾸미기 버튼으로 모은 재료를 사용합니다.':'사계절 숲길에서 겨울나기 먹이를 모읍니다. 화면을 누르고 드래그하면 직접 이동합니다.');
  if(home)updateHomeTools();
  const xpMax=xpForLevel(growth.level);
  $('#xp-fill').style.width=`${Math.min(100,growth.xp/xpMax*100)}%`;
  $('.experience-track').setAttribute('aria-valuenow',Math.round(growth.xp/xpMax*100));
  const definitions=upgradeDefinitions(selected.id);
  document.querySelectorAll('.upgrade').forEach((button,index)=>{
    const def=definitions[index],cost=upgradeCost(state,def.key,selected.id),value=displayUpgrade(def,upgradeValue(state,def.key,selected.id));
    button.dataset.upgrade=def.key;
    button.querySelector('.upgrade-icon').setAttribute('href',`#i-${def.icon}`);
    const fields={'.upgrade-level':growth.upgrades[def.key]+1,'.upgrade-value':value,'.coin-price':cost?money(cost.coins):'✓','.material-price':cost?money(cost.amount):'✓'};
    for(const [selector,text] of Object.entries(fields)){const field=button.querySelector(selector);if(field.textContent!==String(text))field.textContent=text;}
    button.querySelector('.cost-material-icon').setAttribute('href',`#i-${resourceIcon(selected.resource)}`);
    const unavailable=!cost||cost.coins>state.coins||cost.amount>growth.materials;
    button.classList.toggle('unaffordable',unavailable);button.setAttribute('aria-disabled',String(unavailable));
    button.setAttribute('aria-label',`${selected.name} ${def.name} ${value}. ${def.description}. ${cost?`강화 비용 동전 ${cost.coins}, ${RESOURCE_NAMES[cost.resource]} ${cost.amount}개`:'최대 강화'}`);
  });
  if(hudMember!==selected.id){hudMember=selected.id;portrait($('#portrait'),selected.id);}
  updatePartyBar();
  const cooling=state.hero.skillCooldown>0;
  $('#skill-button').classList.toggle('cooling',cooling);$('#skill-button').setAttribute('aria-disabled',String(cooling));
  setText('#skill-time',cooling?Math.ceil(state.hero.skillCooldown):'');
  $('#auto-button').classList.toggle('active',state.autoMove);$('#auto-button').setAttribute('aria-pressed',String(state.autoMove));
  $('#auto-button').setAttribute('aria-label',state.autoMove?'자동 이동 끄기':'자동 이동 켜기');
  $('#gift-button').classList.toggle('claimed',giftClaimed);$('#gift-button').setAttribute('aria-label',giftClaimed?'원정 보급 수령 완료':'원정 보급 동전 100개 받기');
}
function resourceAmount(resource){const hero=HEROES.find(h=>h.resource===resource);return hero?state.members[hero.id].materials:0;}
function updateHomeTools(){
  const signature=selectedDecoration+'|'+JSON.stringify(state.homestead.decorations)+'|'+HEROES.map(h=>state.members[h.id].materials).join(',');
  if(signature===homeSignature)return;homeSignature=signature;
  const focusedDecoration=document.activeElement?.dataset?.decoration;
  const selected=DECORATIONS.find(d=>d.id===selectedDecoration),item=state.homestead.decorations[selectedDecoration],cost=decorationCost(state,selectedDecoration);
  $('#decor-tabs').innerHTML=DECORATIONS.map(d=>{const value=state.homestead.decorations[d.id];return `<button class="decor-tab ${d.id===selectedDecoration?'selected':''}" data-decoration="${d.id}" aria-label="${d.name} ${value.level}단계 선택" aria-pressed="${d.id===selectedDecoration}">${icon(d.icon)}<b>${value.level}</b></button>`;}).join('');
  $('#decor-preview').innerHTML=`${icon(selected.icon)}<strong>${item.level}/3</strong>`;
  $('#decor-cost').innerHTML=cost?Object.entries(cost).map(([resource,amount])=>`<span class="${resourceAmount(resource)<amount?'short':''}" aria-label="${RESOURCE_NAMES[resource]} ${resourceAmount(resource)}개 보유, ${amount}개 필요">${icon(resourceIcon(resource))}<b>${amount}</b></span>`).join(''):`<span>${icon('check')}</span>`;
  const craft=$('#craft-button'),affordable=!!cost&&Object.entries(cost).every(([resource,amount])=>resourceAmount(resource)>=amount);
  craft.classList.toggle('unaffordable',!affordable);craft.setAttribute('aria-disabled',String(!affordable));craft.setAttribute('aria-label',`${selected.name} ${item.level?'꾸미기 강화':'만들기'}. ${cost?Object.entries(cost).map(([r,n])=>`${RESOURCE_NAMES[r]} ${n}개`).join(', '):'최대 단계'}`);
  $('#style-button').disabled=item.level===0;$('#place-button').disabled=item.level===0;
  $('#style-button').setAttribute('aria-label',`${selected.name} 색상 바꾸기, 현재 ${item.style+1}번`);
  $('#place-button').setAttribute('aria-label',`${selected.name} ${item.placed?'치우기':'배치하기'}`);$('#place-button').setAttribute('aria-pressed',String(item.placed));
  setText('#comfort',homeComfort(state));
  $('#spring-button').setAttribute('aria-label',`${state.journey.year+1}년 봄으로 출발. 동료, 성장, 남은 재료와 집 꾸미기를 유지합니다.`);
  if(focusedDecoration)$('#decor-tabs').querySelector(`[data-decoration="${focusedDecoration}"]`)?.focus({preventScroll:true});
}

function ellipse(x, y, rx, ry, color, stroke) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}
function roundRect(x, y, w, h, r, fill, stroke, line = 2) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = line; ctx.stroke(); }
}
function seeded(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function makeTerrain() {
  const tile=document.createElement('canvas');tile.width=256;tile.height=256;
  const t=tile.getContext('2d');t.fillStyle='#cfd99a';t.fillRect(0,0,256,256);
  for(let i=0;i<80;i++){
    const x=seeded(i+9)*256,y=seeded(i+900)*256;
    t.strokeStyle=i%3?'#a4bb783b':'#b0c58333';t.lineWidth=2;t.beginPath();
    t.moveTo(x-3,y);t.lineTo(x-2,y-5);t.moveTo(x,y);t.lineTo(x+2,y-4);t.stroke();
  }
  terrain=tile;groundPattern=ctx.createPattern(assets.background||tile,'repeat');
}
function resize() {
  const box=shell.getBoundingClientRect();width=box.width;height=box.height;dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=true;
  playTop=Math.max(145,$('.wave-hud').getBoundingClientRect().bottom-box.top+12);
  playHeight=Math.max(140,height-$('.bottom-hud').getBoundingClientRect().height-playTop-12);
  if(height<481&&width>599){playTop=80;playHeight=height-100;}
  makeTerrain();draw();
}
function groundScale(){return width/690;}
function position(entity){
  const s=groundScale(),dx=entity.x-camera.x,dy=entity.y-camera.y;
  const projected=projectWorldVector(dx,dy);
  return {x:width*.5+projected.x*s,y:playTop+playHeight*.58+projected.y*s};
}
const spriteSize=()=>Math.max(53,width*.155);
function groundPath(y0,y1,drop=0){
  const points=[position({x:0,y:y0}),position({x:WORLD.width,y:y0}),position({x:WORLD.width,y:y1}),position({x:0,y:y1})];
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y+drop):ctx.moveTo(p.x,p.y+drop));ctx.closePath();
}
function drawCliff(edge,y0,y1,drop,raised=false){
  const knot=i=>i*170+(seeded(i+804)-.5)*74;
  const shift=i=>(seeded(i+499)-.5)*19;
  for(let i=Math.floor(y0/170)-1;i<Math.ceil(y1/170)+1;i++){
    const a=position({x:edge,y:knot(i)}),b=position({x:edge,y:knot(i+1)});
    const top=raised?-drop:0,bottom=raised?0:drop;
    ctx.beginPath();ctx.moveTo(a.x,a.y+top);ctx.lineTo(b.x,b.y+top);
    ctx.lineTo(b.x+shift(i+1),b.y+bottom);ctx.lineTo(a.x+shift(i),a.y+bottom);ctx.closePath();
    ctx.fillStyle=palette.cliffs[Math.floor(seeded(i+21)*3)];ctx.fill();
    ctx.strokeStyle='#583f21';ctx.lineWidth=2;ctx.stroke();
    const m={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    ctx.beginPath();ctx.moveTo(m.x,m.y+top+drop*.2);ctx.lineTo(m.x-4,m.y+top+drop*.5);
    ctx.lineTo(m.x+2,m.y+top+drop*.77);ctx.stroke();
    if(i%4===0)roundRect(m.x-8,m.y+top+drop*.56,18,5,3,palette.plateau);
  }
}
function drawGrassLip(edge,y0,y1,drop=0){
  const start=Math.floor(y0/40),end=Math.ceil(y1/40),points=[];
  for(let i=start;i<=end;i++){
    const p=position({x:edge,y:i*40});
    points.push({x:p.x,y:p.y+drop+2+seeded(i+edge+85)*5});
  }
  const a=position({x:edge,y:start*40}),b=position({x:edge,y:end*40});
  ctx.beginPath();ctx.moveTo(a.x,a.y+drop-5);ctx.lineTo(b.x,b.y+drop-5);
  for(let i=points.length-1;i>=0;i--)ctx.lineTo(points[i].x,points[i].y);
  ctx.closePath();ctx.fillStyle=drop?palette.plateau:palette.ground;ctx.fill();
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.lineJoin='round';ctx.strokeStyle='#583f21';ctx.lineWidth=2.5;ctx.stroke();
}
function drawBackground(){
  ctx.fillStyle=palette.background;ctx.fillRect(0,0,width,height);
  const y0=camera.y-2500,y1=camera.y+2500,drop=Math.max(48,width*.21);
  const back=[position({x:-2400,y:y0}),position({x:0,y:y0}),position({x:0,y:y1}),position({x:-2400,y:y1})];
  ctx.beginPath();back.forEach((p,i)=>i?ctx.lineTo(p.x,p.y-drop):ctx.moveTo(p.x,p.y-drop));ctx.closePath();ctx.fillStyle=palette.plateau;ctx.fill();
  // The same projected plane drives terrain, targets and the camera. The rim has real screen depth.
  groundPath(y0,y1,drop);ctx.fillStyle='#664a35';ctx.fill();
  drawCliff(WORLD.width,y0,y1,drop);
  const s=groundScale(),origin=position({x:0,y:0});
  ctx.save();groundPath(y0,y1);ctx.clip();
  ctx.transform(Math.SQRT1_2*s,.40558*s,-Math.SQRT1_2*s,.40558*s,origin.x,origin.y);
  ctx.fillStyle=palette.ground;ctx.fillRect(0,y0,WORLD.width,y1-y0);
  ctx.restore();
  ctx.save();groundPath(y0,y1);ctx.clip();drawSeasonDetails(ctx,{width,height,position:visualSeason,time:ambientTime,camera,groundScale:groundScale(),project:position,reduceMotion,worldWidth:WORLD.width});ctx.restore();
  // The far rim rises above the trail; its wall stays in front of the ground plane.
  drawCliff(0,y0,y1,drop,true);
  drawGrassLip(0,y0,y1,-drop);
  drawGrassLip(WORLD.width,y0,y1);
}
function acorn(x, y, size, rotation = 0, bright = false) {
  ctx.save();ctx.translate(x,y);ctx.rotate(rotation+Math.PI/2);
  ellipse(0,1,size*.38,size*.52,bright?'#efc870':'#d7ad65','#583f21');
  ellipse(0,-size*.28,size*.46,size*.24,'#a77a48','#583f21');
  ctx.strokeStyle='#583f21';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-size*.47);ctx.lineTo(2,-size*.65);ctx.stroke();
  ctx.restore();
}
function coversWorker(point,size){
  return state.workers.some(worker=>{const p=position(worker);return p.y<point.y+3&&p.y>point.y-size*.8&&Math.abs(p.x-point.x)<size*.4;});
}
function drawTree(tree,stump=false){
  const isTree=['oak','pine','golden'].includes(tree.kind);
  if(!isTree&&!stump){drawPatch(tree);return;}
  const p=position(tree),size=98*(tree.size||1)*width/390;
  if(p.x < -size || p.x > width+size || p.y < -size || p.y > height+size)return;
  ellipse(p.x,p.y+3,size*(stump?.48:.34),size*.105,'#4e56383b');
  const data=assets.tree;
  const action=stump?'stump':tree.hurtTimer>0?'hit':'idle';
  const animation=data?.animations?.[action];
  ctx.save();
  if(!stump&&coversWorker(p,size))ctx.globalAlpha=.58;
  const shake=reduceMotion||stump?0:tree.hurtTimer>0?Math.sin(tree.hurtTimer*80)*3:Math.sin(tree.animTime*2)*.35;
  ctx.translate(p.x+shake,p.y);
  if(data?.bitmap&&animation?.frames?.length){
    const time=action==='hit'?Math.max(0,.25-tree.hurtTimer):(tree.animTime||0);
    const frame=animation.frames[Math.min(animation.frames.length-1,Math.floor(time*(animation.fps||3))%animation.frames.length)];
    const scale=stump?(animation.renderScale||1):1;
    if(tree.kind==='golden')ctx.filter='sepia(.35) saturate(1.25)';
    const first=Math.min(3,Math.floor(visualSeason)),next=Math.min(3,first+1),blend=visualSeason-first;
    const covered=ctx.globalAlpha<1;
    const firstBitmap=assets.seasonTrees[covered&&blend>=.5?next:first]||data.bitmap,nextBitmap=assets.seasonTrees[next];
    const renderTree=bitmap=>ctx.drawImage(bitmap,frame.x,frame.y,frame.w,frame.h,-size*(data.anchor?.x??.5)*scale,-size*(data.anchor?.y??.92)*scale,size*scale,size*scale);
    renderTree(firstBitmap);
    if(nextBitmap&&next!==first&&blend>0&&!stump&&!covered){ctx.globalAlpha=blend;renderTree(nextBitmap);ctx.globalAlpha=1;}
    ctx.filter='none';
  }else{
    if(stump)roundRect(-13,-10,26,12,6,'#b58a5c','#583f21');
    else{roundRect(-7,-37,14,38,5,'#a47a51','#583f21');ellipse(0,-52,33,33,'#81a855','#583f21');ellipse(-15,-65,22,23,'#94b66c','#638245');ellipse(17,-57,23,25,'#7d9f53');}
  }
  ctx.restore();
  if(!stump&&(tree.hp<tree.maxHp||tree.id===state.targetId)){
    const barWidth=30*width/390,y=p.y-size*.85;
    roundRect(p.x-barWidth/2,y,barWidth,6,3,'#655337');
    roundRect(p.x-barWidth/2+1,y+1,Math.max(0,(barWidth-2)*tree.hp/tree.maxHp),4,2,'#9ecc72');
  }
  if(!stump&&tree.id===state.targetId){
    const radius=12*width/390;ctx.strokeStyle='#5b773c';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y-17,radius,radius*.7,0,0,7);ctx.stroke();
    ctx.beginPath();ctx.moveTo(p.x-radius-4,p.y-17);ctx.lineTo(p.x-radius+2,p.y-17);ctx.moveTo(p.x+radius-2,p.y-17);ctx.lineTo(p.x+radius+4,p.y-17);ctx.stroke();
  }
}
function drawPatch(node){
  const p=position(node),data=assets.resources[node.kind],sizes={berry:72,bamboo:92,grain:65},size=(sizes[node.kind]||72)*width/390;
  if(p.x<-size||p.x>width+size||p.y<-size||p.y>height+size)return;
  ellipse(p.x,p.y+2,size*.32,size*.11,'#4e56383b');
  ctx.save();if(coversWorker(p,size))ctx.globalAlpha=.58;
  const shake=reduceMotion?0:node.hurtTimer>0?Math.sin(node.hurtTimer*75)*2:0;
  if(data?.bitmap){const anchor=data.anchor||{x:.5,y:.9};ctx.drawImage(data.bitmap,p.x-size*anchor.x+shake,p.y-size*anchor.y,size,size);}
  else if(node.kind==='berry'){
    ellipse(p.x,p.y-18,24,21,'#7f9c59','#583f21');for(let i=0;i<6;i++)ellipse(p.x+(seeded(i+4)-.5)*35,p.y-12-seeded(i+10)*25,4,4,'#d87a64','#583f21');
  }else if(node.kind==='bamboo'){
    for(let i=0;i<3;i++){const x=p.x-15+i*13;roundRect(x,p.y-58-i%2*12,6,58+i%2*12,3,'#a1b86f','#583f21');for(let k=1;k<4;k++){ctx.strokeStyle='#6f874a';ctx.beginPath();ctx.moveTo(x,p.y-k*16);ctx.lineTo(x+6,p.y-k*16);ctx.stroke();}ellipse(x+8,p.y-35,10,4,'#819e55');}
  }else{for(let i=0;i<5;i++){const x=p.x-20+i*9;ctx.strokeStyle='#a38b54';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,p.y);ctx.lineTo(x+3,p.y-30-seeded(i)*14);ctx.stroke();ellipse(x+3,p.y-30-seeded(i)*14,4,9,'#e0bd72','#79613b');}}
  ctx.restore();
  if(node.hp<node.maxHp){roundRect(p.x-15,p.y-size*.8,30,5,3,'#655337');roundRect(p.x-14,p.y-size*.8+1,Math.max(0,28*node.hp/node.maxHp),3,2,'#c3d37c');}
}
function drawCoins(){
  for(const c of coins){
    const p=position(c),hero=position(state.hero),t=Math.max(0,Math.min(1,(c.age-.3)/.7));
    const x=p.x+(hero.x-p.x)*t,y=p.y-22+Math.sin(c.angle)*18*(1-t)+(hero.y-22-p.y)*t-Math.sin(t*Math.PI)*28;
    ellipse(x,y,4*(1-t*.3),5*(1-t*.3),'#f2ca6d','#8c683b');
  }
}
function animationFor(id, action, view = 'front') {
  const owner = assets.heroes[id];
  const hero = owner?.views?.[view] || owner?.views?.front || owner;
  if (!hero) return null;
  return { hero, animation: hero.animations?.[action] || hero.animations?.idle };
}
function drawHeroImage(target, id, x, y, size, action = 'idle', time = 0, view = 'front') {
  const data = animationFor(id, action, view);
  target.save();target.translate(x,y);
  if (data?.animation?.frames?.length) {
    const { hero, animation } = data;
    const f=frameAt(animation,time);
    const fw=f.w||f.width||hero.cellSize||128,fh=f.h||f.height||hero.cellSize||128;
    const rendered=size*(hero.renderScale||1)*(animation.renderScale||1);
    target.drawImage(animation.bitmap||hero.bitmap,f.x||0,f.y||0,fw,fh,-rendered*(hero.anchor?.x??.5),-rendered*(hero.anchor?.y??.93),rendered,rendered*fh/fw);
  } else if (data?.hero?.bitmap) {
    target.drawImage(data.hero.bitmap,-size/2,-size*.88,size,size);
  } else {
    // Original lightweight fallback keeps a failed image request playable.
    const colors={squirrel:'#c99b66',bear:'#b08c64',fox:'#cc8d58',redpanda:'#bc7957',sparrow:'#b49972'},color=colors[id]||colors.squirrel;
    target.strokeStyle='#583f21';target.lineWidth=size*.027;
    const oval=(px,py,rx,ry,fill)=>{target.beginPath();target.ellipse(px,py,rx,ry,0,0,7);target.fillStyle=fill;target.fill();target.stroke();};
    if(id==='squirrel'||id==='redpanda'||id==='fox')oval(-size*.29,-size*.38,size*.22,size*.3,color);
    oval(0,-size*.25,size*.2,size*.23,color);oval(0,-size*.52,size*.29,size*.27,color);
    oval(-size*.19,-size*.73,size*.085,size*.12,color);oval(size*.18,-size*.73,size*.085,size*.12,color);
    oval(size*.09,-size*.44,size*.21,size*.14,'#f3dcac');
    target.fillStyle='#583f21';target.beginPath();target.ellipse(-size*.06,-size*.56,size*.025,size*.04,0,0,7);target.ellipse(size*.18,-size*.56,size*.025,size*.04,0,0,7);target.fill();
    oval(-size*.1,-size*.06,size*.1,size*.04,'#886340');oval(size*.13,-size*.06,size*.1,size*.04,'#886340');
  }
  target.restore();
}
function portrait(target, id) {
  const c=target.getContext('2d');c.clearRect(0,0,target.width,target.height);
  drawHeroImage(c,id,target.width/2,target.height*.88,target.width*.98,'idle',0,'front');
}
function refreshPortraits(){
  portrait($('#portrait'),state.selectedHeroId);
  document.querySelectorAll('canvas[data-hero]').forEach(c=>portrait(c,c.dataset.hero));
}
function drawWorker(worker,npc=false){
  const p=position(worker),scale={bear:1.14,fox:1,redpanda:1,sparrow:.85,squirrel:1}[worker.id]||1,size=spriteSize()*scale;
  if(p.x<-size||p.x>width+size||p.y<-size||p.y>height+size)return;
  ellipse(p.x,p.y+3,size*.3,size*.1,'#4e563845');
  if(!poses.has(worker.id))poses.set(worker.id,createPoseMemory());
  const pose=npc?{view:'front',action:'idle'}:actorPose(worker,poses.get(worker.id),state.elapsed);
  const base=HEROES.find(h=>h.id===worker.id);
  const time=pose.action==='run'?(worker.travelled||0)/base.speed:pose.action==='idle'?(worker.animTime||0):pose.clock.seconds;
  // Foot placement and secondary movement come from the drawings, not whole-body offsets.
  drawHeroImage(ctx,worker.id,p.x,p.y,size,pose.action,time,pose.view);
  if(!npc&&worker.id==='squirrel'){ctx.beginPath();for(const side of [-1,1]){ctx.moveTo(p.x+side*size*.4,p.y-2);ctx.lineTo(p.x+side*size*.4,p.y+5);ctx.lineTo(p.x+side*size*.29,p.y+5);}ctx.strokeStyle='#fff3cf';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#5b773c';ctx.lineWidth=2;ctx.stroke();}
  if(npc){const bounce=reduceMotion?0:Math.sin(state.elapsed*4)*3;ctx.fillStyle='#fff0c7';ctx.strokeStyle='#725737';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y-size-14+bounce,14,0,7);ctx.fill();ctx.stroke();ctx.fillStyle='#d17c6c';ctx.font='900 20px Nunito';ctx.textAlign='center';ctx.fillText('♥',p.x,p.y-size-7+bounce);}
}
function drawEffects() {
  for(const e of state.effects){
    const p=position(e),progress=1-e.life/e.maxLife;ctx.save();ctx.globalAlpha=Math.min(1,e.life*3);
    if(e.type==='slam'){
      ctx.strokeStyle='#efd7a0';ctx.lineWidth=2*(1-progress)+.6;ctx.beginPath();ctx.ellipse(p.x,p.y-3,8+progress*25,3+progress*9,0,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle='#ad8053';ctx.lineWidth=3;
      for(let i=0;i<5;i++){const angle=i/5*Math.PI*2,x=p.x+Math.cos(angle)*(5+progress*24),y=p.y-8-Math.sin(progress*Math.PI)*13+Math.sin(angle)*progress*9;ctx.beginPath();ctx.moveTo(x-2,y-2);ctx.lineTo(x+2,y+1);ctx.stroke();}
    }else if(e.type==='pick'){
      for(let i=0;i<3;i++){const x=p.x+(i-1)*7*(1+progress),y=p.y-15-Math.sin(progress*Math.PI)*14+i*2;ellipse(x,y,2.7,2.7,'#d5755b','#7b5937');}
    }else if(e.type==='sweep'){
      ctx.strokeStyle='#f4f4c5';ctx.lineWidth=3*(1-progress)+.7;ctx.beginPath();ctx.ellipse(p.x,p.y-12,10+progress*24,5+progress*10,-.3,Math.PI*1.05,Math.PI*1.95);ctx.stroke();
      for(let i=0;i<4;i++)ellipse(p.x+(i-1.5)*8*progress,p.y-12-Math.sin(progress*Math.PI)*12-i,3,1.2,'#81a855');
    }else if(e.type==='peck'){
      for(let i=0;i<4;i++)ellipse(p.x+(i-1.5)*(4+progress*9),p.y-3-Math.sin(progress*Math.PI)*12-i%2*4,1.7,2.5,'#e4c67b','#8f7144');
    }else if(e.type==='material'){
      const image=assets.icons[e.resource],y=p.y-42-progress*25;
      if(image)ctx.drawImage(image,p.x-23,y-10,20,20);
      ctx.font='900 18px Nunito';ctx.textAlign='left';ctx.lineWidth=3;ctx.strokeStyle='#583f21';ctx.fillStyle='#fff3d2';
      ctx.strokeText(`+${e.amount}`,p.x-1,y+6);ctx.fillText(`+${e.amount}`,p.x-1,y+6);
    }else if(['damage','coin','wave'].includes(e.type)){
      if(e.type==='coin'&&e.amount<40){ctx.restore();continue;}
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 18px Nunito, sans-serif';ctx.lineWidth=3;ctx.strokeStyle='#583f21';ctx.fillStyle=e.color;
      const text=`${e.type==='coin'||e.type==='wave'?'+':''}${Math.round(e.amount)}`;
      ctx.strokeText(text,p.x,p.y-16-progress*25);ctx.fillText(text,p.x,p.y-16-progress*25);
    }else if(e.type==='level'){
      ctx.strokeStyle='#fff0b0';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(p.x,p.y,15+progress*40,8+progress*15,0,0,7);ctx.stroke();
      ctx.fillStyle='#f5d575';ctx.font='900 27px Nunito';ctx.textAlign='center';ctx.fillText(`✦ ${e.amount}`,p.x,p.y-55-progress*20);
    }else{
      const count=e.type==='burst'?12:7;
      for(let i=0;i<count;i++){const angle=i/count*Math.PI*2,r=(15+progress*35)*(e.type==='burst'?1.8:1);const x=p.x+Math.cos(angle)*r,y=p.y+Math.sin(angle)*r*.65-10;
        if(assets.spark){ctx.drawImage(assets.spark,x-5,y-5,10,10);}else ellipse(x,y,(1-progress)*3+1,(1-progress)*3+1,e.color);
      }
    }ctx.restore();
  }
}
function draw() {
  if(!terrain)return;
  palette=seasonPalette(visualSeason);
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  if(atHome()&&arrivalTime<=0){
    shelterHits=drawShelter(ctx,{width,height,top:playTop-8,bottom:height-$('.bottom-hud').getBoundingClientRect().height-5,time:ambientTime,state,assets,drawAnimal:(...args)=>drawHeroImage(ctx,...args),reduceMotion,selectedDecoration});
    if(sceneFade>0){ctx.save();ctx.globalAlpha=sceneFade/.6;ctx.fillStyle='#fff1d5';ctx.fillRect(0,0,width,height);ctx.restore();}
    return;
  }
  shelterHits=[];drawBackground();
  const approaching=state.journey.harvests>=90;
  const cabin=approaching?position({x:WORLD.width*.55,y:state.hero.y-140-Math.max(0,108-state.journey.harvests)*28}):null;
  stumps.forEach(stump=>drawTree(stump,true));
  const actors=[...state.targets.map(tree=>({depth:position(tree).y,tree})),...(arrivalTime>0?[]:state.workers.map(worker=>({depth:position(worker).y,worker})))];
  if(cabin)actors.push({depth:cabin.y,cabin});
  if(state.encounter)actors.push({depth:position(state.encounter).y,worker:{...state.encounter,animTime:state.elapsed,face:-1},npc:true});
  actors.sort((a,b)=>a.depth-b.depth).forEach(actor=>{
    if(actor.cabin){ctx.save();ctx.globalAlpha=Math.min(1,(state.journey.harvests-89)/8);drawTrailCabin(ctx,{x:actor.cabin.x,y:actor.cabin.y,size:168*width/390,assets});ctx.restore();}
    else if(actor.worker)drawWorker(actor.worker,actor.npc);else drawTree(actor.tree);
  });
  for(const projectile of state.projectiles){
    const point=position(projectile),tail=position({x:projectile.x-projectile.vx*.025,y:projectile.y-projectile.vy*.025});
    const age=1.4-projectile.life,progress=Math.min(1,age*Math.hypot(projectile.vx,projectile.vy)/(projectile.targetDistance||300));
    const lift=spriteSize()*.38+Math.sin(progress*Math.PI)*8;
    ellipse(point.x,point.y,3,1.4,'#4e563833');
    ctx.strokeStyle=projectile.skill?'#f4db91aa':'#ede2b573';ctx.lineWidth=projectile.skill?5:3;ctx.beginPath();ctx.moveTo(tail.x,tail.y-lift);ctx.lineTo(point.x,point.y-lift);ctx.stroke();
    const velocity=projectWorldVector(projectile.vx,projectile.vy);
    acorn(point.x,point.y-lift,projectile.skill?12:10,Math.atan2(velocity.y,velocity.x)+age*8,projectile.skill);
  }
  drawCoins();drawEffects();
  if(arrivalTime>0&&cabin){
    const progress=1-arrivalTime/2.4,ease=progress*progress*(3-2*progress);
    state.workers.forEach((worker,i)=>{const start=position(worker),end={x:cabin.x+(i-2)*4,y:cabin.y-8+i*2},x=start.x+(end.x-start.x)*ease,y=start.y+(end.y-start.y)*ease,view=Math.abs(end.x-start.x)>Math.abs(end.y-start.y)*1.2?(end.x>start.x?'right':'left'):'back';drawHeroImage(ctx,worker.id,x,y,spriteSize()*(1-ease*.24),'run',ambientTime,view);});
    if(progress>.72){ctx.save();ctx.globalAlpha=(progress-.72)/.28;ctx.fillStyle='#fff1d5';ctx.fillRect(0,0,width,height);ctx.restore();}
  }else if(sceneFade>0){ctx.save();ctx.globalAlpha=sceneFade/.6;ctx.fillStyle='#fff1d5';ctx.fillRect(0,0,width,height);ctx.restore();}
}

function clearInput(){keys.clear();touch=null;$('#dpad').classList.remove('active');$('#pad-knob').style.transform='';}
function openMenu(which){
  running=false;clearInput();persist();menu=which;
  if(overlay.hidden)previousFocus=document.activeElement;
  overlay.hidden=false;dialog.className=`dialog ${which==='start'?'start-dialog':which==='encounter'?'encounter-dialog':''}`;
  shell.querySelectorAll('.hud,.wave-hud,.side-actions,.field-controls,.bottom-hud').forEach(element=>element.inert=true);
  const close=['start','encounter','winter'].includes(which)?'':`<button class="close-dialog" data-action="resume" aria-label="${atHome()?'겨울 집':'숲'}으로 돌아가기">${icon('close')}</button>`;
  if(which==='start'){
    dialog.setAttribute('aria-label','도토리 원정대 시작');
    dialog.innerHTML=`<canvas class="splash-hero" data-hero="squirrel" width="240" height="240"></canvas><div class="splash-trail">${icon('paw')}<span></span>${icon('infinity')}<span></span>${icon('acorn','class="splash-acorn"')}</div><div class="splash-animals">${HEROES.map(h=>`<canvas class="${state.recruited.includes(h.id)?'':'unmet'}" data-hero="${h.id}" width="90" height="90"></canvas>`).join('')}</div><div class="dialog-actions"><button class="menu-action" data-action="roster" aria-label="동물 원정대">${icon('paw')}</button><button class="menu-action primary" data-action="resume" aria-label="게임 시작">${icon('play')}</button><button class="menu-action ${sound?'':'sound-off'}" data-action="sound" aria-label="효과음 ${sound?'끄기':'켜기'}">${icon('sound')}</button></div>`;
  }else if(which==='winter'){
    dialog.setAttribute('aria-label',`${state.journey.year}년 겨울 집에 도착했습니다. 모은 먹이 ${state.journey.food}개. 재료로 집을 꾸밀 수 있습니다.`);
    dialog.innerHTML=`<div class="winter-summary">${icon('snow')}${icon('home')}</div><div class="winter-summary">${icon('basket')}<strong>${money(state.journey.food)}</strong>${icon('heart')}</div><div class="winter-foods">${['acorn','berries','grain'].map(r=>`<span>${icon(resourceIcon(r))}<b>${money(state.journey.foodByType[r])}</b></span>`).join('')}</div><div class="dialog-actions"><button class="menu-action primary" data-action="resume" aria-label="겨울 집 꾸미기 시작">${icon('hammer')}</button></div>`;
    $('#announcer').textContent=`겨울 집에 도착했습니다. 모은 먹이는 ${state.journey.food}개입니다. 아래 가구를 골라 집을 꾸미고 꽃 버튼으로 다음 봄에 출발하세요.`;
    tone(570,.3,'triangle');
  }else if(which==='encounter'&&state.encounter){
    const friend=HEROES.find(h=>h.id===state.encounter.id);
    dialog.setAttribute('aria-label',`${friend.name} 친구를 만났습니다. ${friend.trait}. 동료로 맞이하기`);
    dialog.innerHTML=`<div class="dialog-header encounter-heart">${icon('heart')}</div><canvas class="splash-hero" data-hero="${friend.id}" width="240" height="240"></canvas><div class="friend-progress">${icon(resourceIcon(friend.resource))}<strong>${state.recruited.length} → ${state.recruited.length+1}</strong>${icon('paw')}</div><div class="dialog-actions"><button class="menu-action primary" data-action="recruit" aria-label="${friend.name} 동료로 맞이하기">${icon('heart')}</button></div>`;
    $('#announcer').textContent=`${friend.name} 친구를 만났습니다. 하트 버튼으로 함께할 수 있습니다.`;
    tone(880,.2);
  }else if(which==='roster'){
    dialog.setAttribute('aria-label','함께 채집하는 원정대와 동물별 성장');
    const selected=species();
    dialog.innerHTML=`${close}<div class="dialog-header">${icon('paw')}</div><div class="roster-grid">${HEROES.map(h=>{
      const unlocked=state.recruited.includes(h.id);
      return `<button class="animal-card ${unlocked?'':'locked'} ${h.id===state.selectedHeroId?'selected':''}" data-animal="${h.id}" aria-label="${h.name}${unlocked?`, ${h.trait}, 성장 보기`:`, 수확 ${ENCOUNTERS[h.id]}회에 만남`}" aria-pressed="${h.id===state.selectedHeroId}"><canvas data-hero="${h.id}" width="128" height="128"></canvas>${unlocked?`<span class="member-material">${icon(resourceIcon(h.resource))}${money(state.members[h.id].materials)}</span>`:`<span class="lock-badge">${icon('lock')}</span><span class="member-material">${Math.min(state.harvested,ENCOUNTERS[h.id])}/${ENCOUNTERS[h.id]}</span>`}</button>`;
    }).join('')}</div><div class="dialog-actions"><button class="menu-action" data-action="records" aria-label="원정 기록">${icon('crown')}</button><button class="menu-action primary" data-action="resume" aria-label="선택한 동물 성장 보기">${icon('up')}</button></div><span class="sr-only">${selected.name}: ${selected.trait}. 선택은 성장 대상을 바꾸며 동료들은 계속 함께 채집합니다.</span>`;
  }else if(which==='records'){
    dialog.setAttribute('aria-label','원정 기록');
    dialog.innerHTML=`${close}<div class="dialog-header">${icon('calendar')}</div><div class="record-grid"><div class="record-item" aria-label="현재 ${state.journey.year}년째">${icon('calendar')}<strong>${state.journey.year}</strong></div><div class="record-item" aria-label="전체 수확 ${state.harvested}">${icon('basket')}<strong>${money(state.harvested)}</strong></div><div class="record-item" aria-label="원정대 ${state.recruited.length}마리">${icon('paw')}<strong>${state.recruited.length}/5</strong></div><div class="record-item" aria-label="집의 포근함 ${homeComfort(state)}">${icon('home')}<strong>${homeComfort(state)}</strong></div></div><div class="year-record" aria-label="올해 모은 먹이 ${state.journey.food}개">${icon('basket')}<strong>${money(state.journey.food)}</strong>${icon('snow')}</div>`;
  }else{
    dialog.setAttribute('aria-label','일시 정지 및 설정');
    dialog.innerHTML=`${close}<div class="dialog-header">${icon('pause')}</div><canvas class="splash-hero" data-hero="squirrel" width="200" height="200"></canvas><div class="dialog-actions"><button class="menu-action ${sound?'':'sound-off'}" data-action="sound" aria-label="효과음 ${sound?'끄기':'켜기'}">${icon('sound')}</button><button class="menu-action primary" data-action="resume" aria-label="계속하기">${icon('play')}</button><a href="../../" class="menu-action" aria-label="홈페이지로 돌아가기">${icon('home')}</a></div><div class="dialog-actions"><button class="menu-action" data-action="restart" aria-label="숲길 다시 탐색, 동료와 성장 유지">${icon('restart')}</button></div>`;
  }
  refreshPortraits();updateHUD();
  requestAnimationFrame(()=>(dialog.querySelector('.primary')||dialog.querySelector('.animal-card.selected')||dialog.querySelector('button'))?.focus({preventScroll:true}));
}

function resume() {
  overlay.hidden=true;menu=null;running=true;lastTime=performance.now();clearInput();
  shell.querySelectorAll('.hud,.wave-hud,.side-actions,.field-controls,.bottom-hud').forEach(element=>element.inert=false);
  previousFocus?.focus?.({preventScroll:true});
  if(profile.offlineReward){toast('coin',`+${money(profile.offlineReward)}`,`자리 비운 동안 동전 ${profile.offlineReward}개를 받았습니다.`);profile.offlineReward=0;}
  tone(650,.12);persist();
}
overlay.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;
  const animal=event.target.closest('[data-animal]')?.dataset.animal;
  if(animal){if(!state.recruited.includes(animal)){toast('paw',`${Math.min(state.harvested,ENCOUNTERS[animal])}/${ENCOUNTERS[animal]}`,`수확 ${ENCOUNTERS[animal]}회 이후 숲에서 만날 수 있습니다.`);}else if(selectHero(state,animal)){tone(650,.12);openMenu('roster');refreshPortraits();persist();}return;}
  if(action==='resume')resume();
  if(action==='roster')openMenu('roster');
  if(action==='records')openMenu('records');
  if(action==='recruit'){const id=state.encounter?.id;if(id&&recruitFriend(state,id)){selectHero(state,id);partySignature='';refreshPortraits();updateHUD();persist();resume();toast('paw',`${state.recruited.length}/5`,`${HEROES.find(h=>h.id===id).name} 친구가 함께 채집합니다.`);}}
  if(action==='sound'){sound=!sound;saveSettings();tone(700,.12);openMenu(menu);}
  if(action==='restart'){restartRun(state);resetTrailView();updateHUD();resume();}
},listen);
overlay.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const focusable=[...dialog.querySelectorAll('button,a[href]')];const first=focusable[0],last=focusable.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
},listen);
$('#pause-button').addEventListener('click',()=>openMenu('pause'),listen);
$('#hero-button').addEventListener('click',()=>openMenu('roster'),listen);
$('#stats-button').addEventListener('click',()=>openMenu('records'),listen);
$('#auto-button').addEventListener('click',()=>{state.autoMove=!state.autoMove;clearInput();updateHUD();persist();tone(450);},listen);
$('#skill-button').addEventListener('click',()=>{if(running&&useSkill(state)){tone(250,.3,'triangle',.05);updateHUD();}},listen);
$('#gift-button').addEventListener('click',()=>{
  if(giftClaimed){toast('gift','✓','원정 보급을 이미 받았습니다.');return;}
  giftClaimed=true;state.coins+=100;persist();saveSettings();updateHUD();toast('coin','+100','원정 보급 동전 100개를 받았습니다.');tone(850,.2);
},listen);
$('#party-bar').addEventListener('click',event=>{
  const id=event.target.closest('[data-party]')?.dataset.party;if(!id)return;
  if(!state.recruited.includes(id)){toast('paw',`${Math.min(state.harvested,ENCOUNTERS[id])}/${ENCOUNTERS[id]}`,`${HEROES.find(h=>h.id===id).name}는 수확 ${ENCOUNTERS[id]}회 이후 만납니다.`);return;}
  if(selectHero(state,id)){updateHUD();refreshPortraits();persist();tone(600);}
},listen);
$('#decor-tabs').addEventListener('click',event=>{
  const id=event.target.closest('[data-decoration]')?.dataset.decoration;
  if(!id||!atHome())return;selectedDecoration=id;homeSignature='';updateHUD();draw();tone(570);
},listen);
$('#craft-button').addEventListener('click',()=>{
  if(craftDecoration(state,selectedDecoration)){homeSignature='';updateHUD();draw();persist();tone(790,.15);toast('heart',homeComfort(state),`${DECORATIONS.find(d=>d.id===selectedDecoration).name}를 꾸몄습니다.`);}
  else{const cost=decorationCost(state,selectedDecoration);const missing=cost&&Object.entries(cost).find(([r,n])=>resourceAmount(r)<n);toast(missing?resourceIcon(missing[0]):'check',missing?missing[1]:'✓',missing?`${RESOURCE_NAMES[missing[0]]} ${missing[1]}개가 필요합니다.`:'최대 꾸미기 단계입니다.');tone(170);}
},listen);
$('#style-button').addEventListener('click',()=>{if(cycleDecorationStyle(state,selectedDecoration)){updateHUD();draw();persist();tone(620);}},listen);
$('#place-button').addEventListener('click',()=>{if(toggleDecoration(state,selectedDecoration)){updateHUD();draw();persist();tone(490);}},listen);
$('#spring-button').addEventListener('click',()=>{
  if(!beginSpring(state))return;resetTrailView();visualSeason=0;sceneFade=.6;homeSignature='';updateHUD();resume();toast('flower',state.journey.year,`${state.journey.year}년 봄입니다. 함께 겨울나기 먹이를 모으러 떠납니다.`);
},listen);
$('.upgrades').addEventListener('click',event=>{
  const button=event.target.closest('[data-upgrade]');if(!button)return;
  if(upgrade(state,button.dataset.upgrade)){tone(850,.14);button.classList.remove('flash');void button.offsetWidth;button.classList.add('flash');persist();updateHUD();}
  else{const cost=upgradeCost(state,button.dataset.upgrade);const material=member().materials;toast(cost&&cost.amount>material?resourceIcon(cost.resource):'coin',cost?money(cost.amount>material?cost.amount:cost.coins):'✓',cost?`강화에 동전 ${cost.coins}개, ${RESOURCE_NAMES[cost.resource]} ${cost.amount}개가 필요합니다.`:'최대 강화 단계입니다.');tone(170);}
},listen);
canvas.addEventListener('pointerdown',event=>{
  if(!running||touch)return;
  if(atHome()){
    if(arrivalTime>0)return;
    const box=shell.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top;
    const hit=[...shelterHits].reverse().find(h=>x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h);
    if(hit){event.preventDefault();selectedDecoration=hit.id;homeSignature='';updateHUD();draw();tone(570);}
    return;
  }
  event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);
  const box=shell.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top;
  touch={id:event.pointerId,x,y,dx:0,dy:0};
  const pad=$('#dpad');pad.style.left=`${x}px`;pad.style.top=`${y}px`;pad.classList.add('active');
},listen);
canvas.addEventListener('pointermove',event=>{
  if(touch?.id!==event.pointerId)return;event.preventDefault();
  const box=shell.getBoundingClientRect(),dx=event.clientX-box.left-touch.x,dy=event.clientY-box.top-touch.y;
  const magnitude=Math.max(42,Math.hypot(dx,dy));touch.dx=dx/magnitude;touch.dy=dy/magnitude;
  $('#pad-knob').style.transform=`translate(${touch.dx*34}px,${touch.dy*34}px)`;
},listen);
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>{if(touch?.id===event.pointerId)clearInput();},listen);
window.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();overlay.hidden?openMenu('pause'):!['start','encounter','winter'].includes(menu)&&resume();return;}
  if(event.code==='Space'&&running&&!atHome()&&!event.target.closest('button,a')){event.preventDefault();if(useSkill(state))tone(250,.3,'triangle');}
  if(!atHome()&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(event.key)){if(running)event.preventDefault();keys.add(event.key.toLowerCase());}
},listen);
window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()),listen);
window.addEventListener('blur',()=>{clearInput();if(running)openMenu('pause');},listen);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){clearInput();if(running)openMenu('pause');audio?.suspend().catch(()=>{});cancelAnimationFrame(animationId);animationId=0;}
  else if(assetsReady&&!animationId){lastTime=performance.now();animationId=requestAnimationFrame(frame);}
},listen);
function input() {
  const value={x:0,y:0};
  if(touch){value.x=touch.dx;value.y=touch.dy;}
  if(keys.has('arrowleft')||keys.has('a'))value.x--;
  if(keys.has('arrowright')||keys.has('d'))value.x++;
  if(keys.has('arrowup')||keys.has('w'))value.y--;
  if(keys.has('arrowdown')||keys.has('s'))value.y++;
  return screenInputToWorld(value.x,value.y);
}
function resetTrailView(){
  camera.x=state.hero.x;camera.y=state.hero.y;stumps.length=0;coins.length=0;poses.clear();lastEffect=0;arrivalTime=0;clearInput();uiCache.clear();
}
function frame(time) {
  const dt=Math.min(.05,Math.max(0,(time-lastTime)/1000));lastTime=time;
  sceneFade=Math.max(0,sceneFade-dt);
  if(running){
    ambientTime+=dt;
    const wasHome=atHome();
    if(arrivalTime>0){
      arrivalTime=Math.max(0,arrivalTime-dt);
      if(arrivalTime===0){visualSeason=3;sceneFade=.6;homeSignature='';updateHUD();openMenu('winter');}
    }else if(!wasHome){
      stepGame(state,dt,input());
      if(atHome()){arrivalTime=reduceMotion?0.05:2.4;clearInput();ensureShelter();persist();}
    }
    visualSeason+=(seasonStatus(state).position-visualSeason)*(1-Math.exp(-dt*1.8));
    if(!atHome()){const smoothing=1-Math.exp(-dt*9);camera.x+=(state.hero.x-camera.x)*smoothing;camera.y+=(state.hero.y-camera.y)*smoothing;}
    if(state.journey.harvests>=84)ensureShelter();
    for(const c of coins)c.age+=dt;while(coins.length&&coins[0].age>1)coins.shift();
    for(let i=stumps.length-1;i>=0;i--)if(Math.abs(stumps[i].y-camera.y)>1400)stumps.splice(i,1);
    for(const effect of state.effects){
      if(effect.id<=lastEffect)continue;
      if(effect.type==='coin')tone(700+Math.min(effect.amount,100)*3,.05,'sine',.012);
      if(['chop','gather'].includes(effect.type)){
        tone(230,.1,'triangle',.025);
        if(effect.type==='chop'){stumps.push({x:effect.x,y:effect.y,animTime:0});if(stumps.length>50)stumps.shift();}
        for(let i=0;i<5&&coins.length<60;i++)coins.push({x:effect.x+(seeded(effect.id+i)-.5)*45,y:effect.y,age:0,angle:i*1.4});
      }
      lastEffect=Math.max(lastEffect,effect.id);
    }
    if(!atHome()&&state.encounter?.phase==='ready'&&menu!=='encounter')openMenu('encounter');
    saveTime+=dt;if(saveTime>=5){persist();saveTime=0;}
  }
  uiTime+=dt;const uiDue=uiTime>=.1;if(uiDue){updateHUD();uiTime=0;}
  if(running||uiDue)draw();animationId=requestAnimationFrame(frame);
}
async function loadBitmap(path) {
  const img=new Image();img.decoding='async';img.src=new URL(path,import.meta.url);await img.decode();return img;
}
const assetURL=name=>`assets/${name}?v=${encodeURIComponent(assetRevision)}`;
async function ensureShelter(){
  if(!runtimeManifest?.shelter)return;
  if(!shelterPromise){
    const shelter=runtimeManifest.shelter;
    shelterPromise=Promise.allSettled([
      ...['room','cabin'].map(id=>loadBitmap(assetURL(shelter[id].image)).then(bitmap=>assets.shelter[id]=bitmap)),
      ...Object.entries(shelter.decor).map(([id,data])=>loadBitmap(assetURL(data.image)).then(bitmap=>assets.shelter.decor[id]=bitmap)),
    ]).then(()=>draw());
  }
  return shelterPromise;
}
async function loadAssets() {
  try{
    const response=await fetch(new URL('assets/runtime-assets.json?v=year-cycle-20261031-v1',import.meta.url));
    if(!response.ok)throw new Error('asset manifest unavailable');
    const manifest=await response.json();runtimeManifest=manifest;assetRevision=manifest.artRevision||assetRevision;
    const imageURL=assetURL;
    async function loadView(data){
      const bitmap=await loadBitmap(imageURL(data.image)),animations={...data.animations};
      await Promise.allSettled(Object.entries(animations).map(async([action,animation])=>{if(animation.image&&animation.image!==data.image)animations[action]={...animation,bitmap:await loadBitmap(imageURL(animation.image))};}));
      return {...data,animations,bitmap};
    }
    const tasks=Object.entries(manifest.heroes||{}).map(async([id,data])=>{
      if(data.views){
        const loaded=await Promise.allSettled(Object.entries(data.views).map(async([view,entry])=>[view,await loadView(entry)]));
        const views=Object.fromEntries(loaded.filter(result=>result.status==='fulfilled').map(result=>result.value));
        const fallback=views.front||Object.values(views)[0];
        if(fallback)assets.heroes[id]={...data,...fallback,views};
      }else assets.heroes[id]=await loadView(data);
      refreshPortraits();
    });
    if(manifest.background)tasks.push(loadBitmap(imageURL(manifest.background)).then(img=>{assets.background=img;makeTerrain();}));
    if(manifest.tree)tasks.push(loadBitmap(imageURL(manifest.tree.image)).then(bitmap=>assets.tree={...manifest.tree,bitmap}));
    SEASONS.forEach((season,index)=>{const data=manifest.seasons?.[season.id];if(data)tasks.push(loadBitmap(imageURL(data.tree)).then(bitmap=>assets.seasonTrees[index]=bitmap));});
    for(const [kind,data] of Object.entries(manifest.resources||{}))tasks.push(loadBitmap(imageURL(data.image)).then(bitmap=>assets.resources[kind]={...data,bitmap}));
    if(manifest.spark)tasks.push(loadBitmap(imageURL(manifest.spark)).then(img=>assets.spark=img));
    await Promise.allSettled(tasks);
    if(atHome())await ensureShelter();
  }catch{ /* An offline image failure must not block core controls. */ }
  await Promise.allSettled(Object.keys(RESOURCE_NAMES).map(async id=>{
    const source=document.querySelector(`#i-${resourceIcon(id)}`);if(!source)return;
    const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#583f21" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><defs>${source.outerHTML}</defs><use href="#i-${resourceIcon(id)}"/></svg>`);await img.decode();assets.icons[id]=img;
  }));
  $('#load-indicator').hidden=true;refreshPortraits();draw();
}
const observer=new ResizeObserver(resize);observer.observe(shell);observer.observe($('.bottom-hud'));
window.addEventListener('pagehide',()=>{running=false;clearInput();persist();observer.disconnect();cancelAnimationFrame(animationId);animationId=0;clearTimeout(toastTimer);audio?.close().catch(()=>{});audio=null;},listen);
window.addEventListener('pageshow',event=>{if(event.persisted){observer.observe(shell);observer.observe($('.bottom-hud'));lastTime=performance.now();openMenu('pause');if(assetsReady&&!animationId)animationId=requestAnimationFrame(frame);}},listen);
resize();updateHUD();openMenu('start');
await loadAssets();assetsReady=true;lastTime=performance.now();if(!document.hidden&&!animationId)animationId=requestAnimationFrame(frame);
