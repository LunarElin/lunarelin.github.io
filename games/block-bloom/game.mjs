import { SIZE, COLORS, GATES, ITEMS, ITEM_COSTS, createLevel, createStage, stageInfo, runInfo, hasGimmick, migrateCampaignRun, move, useItem, elevate, tick, continueRun, newProfile, restoreProfile, validRun, winReward, guide, copyState } from './rules.mjs?v=3';
import { createDrag, dragBy } from './drag.mjs?v=2';

const $ = id => document.getElementById(id);
const KEY = 'block-bloom:v1';
const itemColors = { hammer: '#ff99b2', freeze: '#8cdfff', hint: '#ffdd8d', undo: '#c1a1ff', magnet: '#8fe6bc' };
const shortItems = { hammer: '해머', freeze: '빙결', hint: '힌트', undo: '되돌림', magnet: '자석' };
const effectTimers = new Set(), oscillators = new Set(), outputs = new Set();
const lifecycle = new AbortController();
let timerId = null, runEpoch = 0, disposed = false, boardObserver, settleAnimation = null;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let profile = newProfile(), state, history = [], selected = null, armed = null, hint = null, modalKind = '', toastTimer, busy = false;
let activeTime = 0, lastClear = -100, combo = 0, feverUntil = 0, lastFrame = performance.now(), lastSave = 0, audio, storageWarning = false;
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved) {
    profile = restoreProfile(saved.profile);
    if (validRun(saved.run)) {
      state = migrateCampaignRun(saved.run);
      history = Array.isArray(saved.history) ? saved.history.filter(validRun).map(migrateCampaignRun).filter(s=>s.stage===state.stage&&s.mode===state.mode&&s.level===state.level&&s.seed===state.seed).slice(-30) : [];
    }
  }
} catch { /* A private or unavailable store still allows a fresh game. */ }
if (!state) state = createStage(profile.stage, seed());

function later(fn, ms) { const id = window.setTimeout(() => { effectTimers.delete(id); if (!disposed) fn(); }, ms); effectTimers.add(id); return id; }
function cancelLater(id) { clearTimeout(id); effectTimers.delete(id); }
function stopAudio() {
  for (const osc of oscillators) { try { osc.stop(); osc.disconnect(); } catch {} }
  oscillators.clear(); for (const out of outputs) { try { out.disconnect(); } catch {} } outputs.clear();
  if (audio?.state === 'running') void audio.suspend?.().catch(() => {});
}
function clearEffects() {
  cancelSettle();
  for (const id of effectTimers) clearTimeout(id); effectTimers.clear(); busy = false;
  $('fx-layer').replaceChildren(); $('combo-label').textContent = ''; $('toast').hidden = true;
  $('board-frame').classList.remove('impact','blocked');
}
function layoutBoard() { const el = $('board-stage'), size = Math.floor(Math.min(el.clientWidth, el.clientHeight - 10, 440)); if (size > 0) el.style.setProperty('--board-size', `${size}px`); }
function setText(id, value) { const el = $(id); if (el && el.textContent !== String(value)) el.textContent = value; }
function listen(target, name, fn) { target.addEventListener(name, fn, { signal: lifecycle.signal }); }

function seed() { const values = new Uint32Array(1); crypto.getRandomValues(values); return values[0]; }
function localDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function snapshot(s) { return { ...copyState(s), plan: [] }; }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ profile, run: snapshot(state), history: history.map(snapshot) })); }
  catch { if (!storageWarning) { storageWarning = true; toast('이 브라우저에서는 저장할 수 없어요. 현재 게임은 계속 플레이할 수 있어요.'); } }
}
function toast(message) { cancelLater(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = later(() => { $('toast').hidden = true; }, 2800); }
function colorStyle(color) { const c = COLORS[color]; return `--piece:${c.hex};--light:${c.light};--dark:${c.dark}`; }
function canAnimate() { return profile.motion && !reduced.matches; }
function syncPreferences() {
  document.body.classList.toggle('reduced-motion', !canAnimate()); document.body.dataset.skin = profile.skin;
  if (!canAnimate()) cancelSettle();
}
function sound(kind = 'move', strength = 1) {
  if (!profile.sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    const start = audio.currentTime, out = audio.createGain(); out.gain.value = .13; out.connect(audio.destination); outputs.add(out);
    const tone = (frequency, delay, duration, type = 'sine', end = frequency) => {
      const osc = audio.createOscillator(), gain = audio.createGain(); osc.type = type; osc.frequency.setValueAtTime(frequency, start + delay);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20,end), start + delay + duration);
      gain.gain.setValueAtTime(.001, start + delay); gain.gain.linearRampToValueAtTime(.6, start + delay + .009); gain.gain.exponentialRampToValueAtTime(.001, start + delay + duration);
      osc.connect(gain); gain.connect(out); oscillators.add(osc); osc.start(start + delay); osc.stop(start + delay + duration + .02);
      osc.onended = () => { oscillators.delete(osc); osc.disconnect(); gain.disconnect(); };
    };
    if (kind === 'move') tone(220, 0, .06, 'sine', 140);
    else if (kind === 'blocked') tone(95, 0, .09, 'triangle', 65);
    else if (kind === 'win') [523,659,784,1047,1319].forEach((f,i)=>tone(f, i * .09, .35,'triangle'));
    else if (kind === 'freeze') { tone(1300,0,.45,'sine',500); tone(1700,.07,.4,'sine',850); }
    else {
      tone(110 + strength * 8,0,.17,'triangle',38);
      const base = 440 * 2 ** (Math.min(combo,12) / 12);
      [1,1.25,1.5].forEach((n,i)=>tone(base*n, .02+i*.035, .22,'sine',base*n*1.2));
      if (kind === 'merge' || kind === 'triple') tone(1400,.06,.25,'triangle',700);
    }
    later(() => { out.disconnect(); outputs.delete(out); }, 1200);
  } catch { /* Sound is optional on browsers without Web Audio. */ }
}
function vibrate(strong = false) { if (profile.haptic && canAnimate()) try { navigator.vibrate?.(strong ? [16,12,25] : 8); } catch { /* Optional hardware. */ } }
const gimmickNames={key:'열쇠',ice:'얼음',merge:'합성',triple:'수집함',factory:'생성기',lift:'승강기'};
function gimmickTags(info){return `<div class="gimmick-tags">${(info.gimmicks.length?info.gimmicks:['classic']).map(id=>`<span>${gimmickNames[id]||'색상 탈출'}</span>`).join('')}</div>`;}
function gimmickArt(info){
  const tile=(color,text)=>`<span class="intro-piece" style="${colorStyle(color)}">${text}</span>`,sign=text=>`<span class="intro-sign">${text}</span>`;
  const focus=info.gimmicks.at(-1)||'classic';let art;
  if(focus==='merge')art=tile('coral','2')+sign('+')+tile('coral','2')+sign('→')+tile('coral','4');
  else if(focus==='key')art=tile('gold','<i class="intro-key"></i>')+sign('→')+'<span class="intro-exit gold-exit">✓</span>';
  else if(focus==='ice')art=tile('blue','❄₂')+sign('←')+'<span class="intro-count">탈출<b>2번</b></span>';
  else if(focus==='triple')art='<span class="intro-match">'+tile('coral','●').repeat(3)+'</span>'+sign('→')+'<span class="intro-spark">✦</span>';
  else if(focus==='factory')art='<span class="intro-machine">⚙</span>'+sign('→')+tile('blue','◆');
  else if(focus==='lift')art='<span class="intro-platform">'+tile('lime','✦')+'</span>'+sign('⇄')+'<span class="intro-platform empty-pad">⇅</span>';
  else art=tile('coral','●')+sign('→')+'<span class="intro-exit coral-exit">▴</span>';
  return `<div class="gimmick-art" data-gimmick-art="${focus}" aria-hidden="true">${art}</div>`;
}
function stageIntroMarkup(ready){
  const info=runInfo(state),heading=state.campaignLegacy?'이어서 플레이':`스테이지 ${state.stage}`;
  return `<div class="stage-intro"><div class="intro-scroll"><p class="intro-stage">${heading}</p><h2 class="intro-title" id="modal-title">${info.title}</h2><span class="intro-badge">${ready?state.campaignLegacy?'진행 중인 퍼즐':info.introLabel:'이번 기믹'}</span>${gimmickTags(info)}${gimmickArt(info)}<p class="intro-description">${info.description}</p><ul class="intro-tips">${info.tips.map(tip=>`<li>${tip}</li>`).join('')}</ul></div><div class="intro-actions">${ready?'<a class="icon-button" href="../../" aria-label="포트폴리오로"><img src="assets/icons/home.png" alt="" width="24" height="24"></a>':'<button class="secondary intro-controls" data-action="controls">조작</button>'}<button class="primary" autofocus data-action="${ready?'start':'resume'}">${ready?'시작':'계속'}</button></div></div>`;
}
function nextStageNumber(){return state.campaignLegacy?profile.stage:Math.min(9999,state.stage+1);}
function renderBlocks() {
  const focusedId = document.activeElement?.dataset?.block;
  $('blocks').innerHTML = state.blocks.map(b => {
    const c = COLORS[b.color], label = `${c.name} ${b.w}×${b.h} 블록${hasGimmick(state,'merge') ? ' 숫자 '+2**b.rank : ''}${b.key?' 열쇠':''}${b.ice?' 얼음 '+b.ice+'겹':''}`;
    return `<button class="block ${selected===b.id?'selected':''} ${b.ice?'iced':''}" data-block="${b.id}" data-ice="${b.ice||0}" aria-label="${label}" aria-pressed="${selected===b.id}" style="${colorStyle(b.color)};--w:${b.w};--h:${b.h};left:${b.x/SIZE*100}%;top:${b.y/SIZE*100}%;width:${b.w/SIZE*100}%;height:${b.h/SIZE*100}%"><span class="block-body">${'<i class="stud"></i>'.repeat(b.w*b.h)}<span class="block-symbol ${hasGimmick(state,'merge')?'block-number':''} ${b.key?'block-key':''}">${hasGimmick(state,'merge')?2**b.rank:b.key?'⚿':c.symbol}</span></span></button>`;
  }).join('');
  if (focusedId && $('blocks').querySelector(`[data-block="${focusedId}"]`)) $('blocks').querySelector(`[data-block="${focusedId}"]`).focus({ preventScroll: true });
  $('gates').innerHTML = GATES.map(g=>`<div class="gate ${g.side} ${hasGimmick(state,'key')&&!state.unlocked.includes(g.color)?'locked':''}" style="${colorStyle(g.color)}" aria-label="${COLORS[g.color].name} ${g.side} 출구"><span>${g.side==='top'?'▴':g.side==='right'?'▸':g.side==='bottom'?'▾':'◂'}</span><span class="gate-lock">${hasGimmick(state,'key')&&!state.unlocked.includes(g.color)?'⚿':hasGimmick(state,'merge')?'4+':COLORS[g.color].symbol}</span></div>`).join('');
  $('platforms').innerHTML = hasGimmick(state,'lift') ? '<div class="platform">⇅</div><div class="platform second">⇅</div>' : '';
  renderHint();
}
function renderHint() {
  const b = hint && state.blocks.find(b=>b.id===hint.id), arrow = $('hint-arrow'); arrow.hidden = !b;
  if (b) { arrow.style.left = `${b.x / 6 * 100}%`; arrow.style.top = `${b.y / 6 * 100}%`; arrow.style.width = `${b.w/6*100}%`; arrow.style.height = `${b.h/6*100}%`; arrow.textContent = hint.dx>0?'➜':hint.dx<0?'⬅':hint.dy>0?'⬇':'⬆'; }
}
function renderItems() {
  $('items').innerHTML = Object.entries(ITEMS).map(([id,item])=>`<button class="item-button ${armed===id?'active':''} ${profile.items[id]?'':'empty'}" style="--item-color:${itemColors[id]}" data-item="${id}" aria-label="${item.name}, ${item.description}, 보유 ${profile.items[id]}개" aria-pressed="${armed===id}" title="${item.description}"><span class="item-icon">${id==='undo'?'<img src="assets/icons/return.png" alt="" width="24" height="24">':item.icon}</span><b>${shortItems[id]}</b><small>${profile.items[id]||'+'}</small></button>`).join('');
}
function renderHud() {
  const seconds = Math.ceil(state.time); setText('time', `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`);
  $('timer').classList.toggle('urgent', seconds<=20 && state.frozen<=0); $('timer').classList.toggle('frozen', state.frozen>0);
  setText('freeze-time', state.frozen>0 ? `❄ ${Math.ceil(state.frozen)}` : '');
  setText('cleared', `${state.removed} / ${state.total}`); setText('coins', profile.coins.toLocaleString('ko-KR'));
  const fever = activeTime < feverUntil;
  setText('combo-count', fever ? `피버 ${Math.ceil(feverUntil-activeTime)}초` : combo>1 ? `${combo}연속!` : '');
  document.body.classList.toggle('fever',fever); $('fever-banner').hidden = !fever;
}
function renderAux() {
  $('dock').hidden = !hasGimmick(state,'triple');
  setText('reserve-count', state.reserve?.length ? `구조 ${state.reserve.length}` : '수집');
  if (hasGimmick(state,'triple')) $('dock-slots').innerHTML = Array.from({length:7},(_,i)=>`<div class="dock-slot ${state.tray[i]?'filled':''} ${i===6&&state.tray.length>=5?'danger':''}" ${state.tray[i]?`style="${colorStyle(state.tray[i])}" data-symbol="${COLORS[state.tray[i]].symbol}"`:''}></div>`).join('');
  $('factory-bar').hidden = !hasGimmick(state,'factory'); $('lift').hidden = !hasGimmick(state,'lift'); setText('queue-count', state.queue.length);
  $('queue-preview').innerHTML = state.queue.map(b=>`<i style="${colorStyle(b.color)}"></i>`).join('');
}
function render() {
  const info=runInfo(state);setText('stage-label',state.campaignLegacy?'이어서':'스테이지');setText('stage-number',state.campaignLegacy?'↻':state.stage);setText('stage-name',info.shortTitle);
  $('stage-display').setAttribute('aria-label',state.campaignLegacy?`이어서 ${info.title}`:`스테이지 ${state.stage} ${info.title}`);
  renderBlocks(); renderItems(); renderHud(); renderAux(); syncPreferences(); layoutBoard();
}

function addFX(element, duration) { const layer = $('fx-layer'); while (layer.childElementCount >= 180) layer.firstElementChild.remove(); layer.append(element); later(()=>element.remove(),duration); }
function burst(b, kind = 'exit', strength = 1) {
  const boardRect = $('board').getBoundingClientRect(), stageRect = $('board-stage').getBoundingClientRect();
  const cell = boardRect.width/6, x = boardRect.left-stageRect.left+(b.x+b.w/2)*cell, y = boardRect.top-stageRect.top+(b.y+b.h/2)*cell;
  const color = COLORS[b.color].hex;
  if (canAnimate()) {
    const count = Math.min(58,24+strength*4);
    for (let i=0;i<count;i++) {
      const angle = Math.random()*Math.PI*2, distance = 24+Math.random()*(75+strength*9), size = 3+Math.random()*7, p = document.createElement('i'); p.className='particle';
      p.style.cssText=`--color:${i%4===0?'#fff6d9':color};left:${x}px;top:${y}px;width:${size}px;height:${size}px;--dx:${Math.cos(angle)*distance}px;--dy:${Math.sin(angle)*distance+35}px;--spin:${Math.random()*720-360}deg;--duration:${.4+Math.random()*.5}s`;
      if (i%5===0) p.style.borderRadius='50%'; addFX(p,1000);
    }
    const ring=document.createElement('i');ring.className='ring';ring.style.cssText=`left:${x}px;top:${y}px;--color:${color};transform:translate(-50%,-50%)`;addFX(ring,650);
    if (kind==='exit') {
      const g=GATES.find(g=>g.color===b.color), ghost=document.createElement('i');ghost.className='exit-ghost';
      ghost.style.cssText=`${colorStyle(b.color)};left:${x-b.w*cell/2+3}px;top:${y-b.h*cell/2+3}px;width:${b.w*cell-6}px;height:${b.h*cell-8}px;--dx:${g.dx*100}px;--dy:${g.dy*100}px`;addFX(ghost,300);
    }
    const frame=$('board-frame');frame.classList.remove('impact');void frame.offsetWidth;frame.classList.add('impact');
  }
  const word=document.createElement('b');word.className='fx-word';word.textContent=kind==='merge'?'합성!':kind==='triple'?'트리플!':kind==='thaw'?'얼음 파괴!':`+${100*b.w*b.h*b.rank}`;
  word.style.cssText=`left:${x}px;top:${y}px;--color:${color}`;addFX(word,900);
}
function celebration() {
  if (!canAnimate()) return;
  const width=$('board-stage').clientWidth;
  for(let i=0;i<80;i++) {
    const p=document.createElement('i');p.className='particle';p.style.cssText=`--color:${Object.values(COLORS)[i%4].hex};left:${width/2}px;top:110px;width:6px;height:11px;--dx:${(Math.random()-.5)*width*1.4}px;--dy:${Math.random()*400-170}px;--spin:${Math.random()*1000}deg;--duration:${.8+Math.random()*.7}s`;addFX(p,1600);
  }
}
function react(events) {
  const clears=events.filter(e=>['exit','merge'].includes(e.type)), triple=events.find(e=>e.type==='triple');
  if(clears.length) {
    combo=activeTime-lastClear<=4?combo+clears.length:clears.length;lastClear=activeTime;
    if(combo>=5&&feverUntil<=activeTime) {feverUntil=activeTime+10;toast('피버! 10초 동안 점수 2배');}
    const multiplier=activeTime<feverUntil?2:1;
    state.score+=(multiplier-1)*clears.reduce((sum,e)=>sum+(e.type==='merge'?250*e.block.rank:100*e.block.w*e.block.h*e.block.rank),0)+Math.max(0,combo-1)*25;
    for(const event of clears) burst(event.block,event.type,Math.min(8,combo));
    if(triple) burst({color:triple.color,x:2,y:4,w:2,h:1,rank:1},'triple',4);
    const label=$('combo-label');label.textContent=combo>=5?'블룸 피버!':combo>=2?`${combo}연속!`:'';label.classList.remove('pop');void label.offsetWidth;if(label.textContent)label.classList.add('pop');
    later(()=>{label.textContent='';label.classList.remove('pop');},750);
    sound(triple?'triple':clears.some(e=>e.type==='merge')?'merge':'exit',combo);vibrate(combo>=3);
  } else if(events.some(e=>e.type==='lift')){sound('merge');toast('승강기 이동! 막힌 칸을 건너뛰었어요.');}
  else sound('move');
  for(const event of events) {
    if(event.type==='unlock')toast(`${COLORS[event.color].name} 출구 잠금 해제!`);
    if(event.type==='thaw'&&event.block.ice===0)burst(event.block,'thaw',2);
    if(event.type==='spawn')toast(`생성기 가동! ${COLORS[event.block.color].name} 블록 등장`);
  }
}
function complete() {
  if(state.status!=='playing')stopClock();
  if(state.status==='won') {
    const reward=winReward(state,profile);state=reward.state;profile=reward.profile;save();renderHud();sound('win');celebration();
    const epoch = runEpoch; later(()=>{if(epoch===runEpoch&&state.status==='won')openModal('won');},600);
  } else if(state.status==='lost') {save();openModal('lost');}
}
function commit(result,{remember=true}={}) {
  if(!result.ok)return false;
  cancelDrag();cancelSettle();
  if(remember){history.push(snapshot(state));if(history.length>30)history.shift();}
  state=result.state;hint=null;armed=null;
  if(!state.blocks.some(b=>b.id===selected))selected=null;
  react(result.events);render();save();complete();return true;
}
function performMove(id,dx,dy) {
  if(busy||$('modal').open||state.status!=='playing'||state.started===false)return;
  if(!commit(move(state,id,dx,dy)))blockedMove(id);
}
function blockedMove(id) {
  sound('blocked');const frame=$('board-frame');frame.classList.remove('blocked');void frame.offsetWidth;frame.classList.add('blocked');
  const b=state.blocks.find(b=>b.id===id);
  if(b?.ice)toast('얼음은 다른 블록이 탈출할 때 깨져요.');
  else if(hasGimmick(state,'merge')&&b?.rank===1)toast('같은 색 2를 합쳐 4부터 탈출할 수 있어요.');
  else if(hasGimmick(state,'key')&&b&&!b.key&&!state.unlocked.includes(b.color))toast('같은 색 열쇠 블록을 먼저 탈출시키세요.');
}
function selectBlock(id) {
  if(state.status!=='playing'||$('modal').open)return;
  selected=id;
  const b=state.blocks.find(b=>b.id===id);if(!b)return;
  if(armed){activateItem(armed);return;}
  $('instruction').textContent=`${COLORS[b.color].name} 선택 · 드래그 또는 방향키로 이동`;
  renderBlocks();
}
function activateItem(id) {
  if(state.status!=='playing'||$('modal').open)return;
  cancelDrag();
  if(profile.items[id]<=0){toast(`${ITEMS[id].name}을 충전해 주세요.`);openModal('shop');return;}
  if(id==='hint') {
    if(busy)return;busy=true;$('instruction').textContent='길을 찾는 중…'; const epoch = runEpoch;
    later(()=>{
      if(epoch!==runEpoch)return;
      try {
        const action=guide(state,5000);
        if(action){hint=action;selected=action.id;profile.items.hint--;renderBlocks();renderItems();save();toast('빛나는 화살표 방향으로 밀어보세요.');}
        else {toast('가까운 출구를 찾지 못했어요. 해머로 공간을 만들어 보세요. 아이템은 유지돼요.');}
      } finally {busy=false;$('instruction').textContent='블록을 드래그하거나 방향키로 이동하세요.';}
    },30);return;
  }
  if(id==='undo') {
    if(!history.length){toast('되돌릴 이동이 없어요.');return;}
    const old=history.pop();state={...old,time:state.time,frozen:state.frozen,continues:state.continues,started:state.started};profile.items.undo--;selected=null;hint=null;armed=null;combo=0;feverUntil=0;
    render();save();sound('move');toast('한 수 되돌렸어요. 남은 시간은 유지돼요.');return;
  }
  if(['hammer','magnet'].includes(id)&&selected===null){armed=armed===id?null:id;renderItems();toast(armed?`${ITEMS[id].name}: 사용할 블록을 선택하세요.`:'아이템 선택을 취소했어요.');return;}
  const result=useItem(state,id,selected);
  if(!result.ok){toast(id==='freeze'?'이미 시간이 멈춰 있어요.':'먼저 블록을 선택하세요.');return;}
  profile.items[id]--;commit(result,{remember:id!=='freeze'});
  if(id==='freeze'){sound('freeze');toast('타임 프리즈! 20초 동안 시간이 멈춰요.');}
}
function newRun(stage=profile.stage,retry=false,autoStart=false) {
  runEpoch++; clearEffects(); cancelDrag(); stopAudio();
  const previous=state,next=retry&&previous.campaignLegacy?migrateCampaignRun(createLevel(previous.mode,previous.level,previous.seed)):createStage(stage,retry?previous.seed:seed());
  state={...next,started:autoStart};history=[];selected=null;armed=null;hint=null;combo=0;feverUntil=0;lastClear=-100;activeTime=0;busy=false;
  closeModal();$('instruction').textContent=runInfo(state).description;render();save();if(!autoStart)openModal('ready');
}

function closeModal() {if($('modal').open)$('modal').close();modalKind='';lastFrame=performance.now();document.body.classList.toggle('paused',document.hidden);if(!document.hidden)startClock();}
function modalHeading(eyebrow,title,copy='') {return `<h2 class="modal-title" id="modal-title">${title}</h2>${copy?`<p class="modal-copy">${copy}</p>`:''}`;}
function shopMarkup() {
  return modalHeading('BOOSTER LAB', '작은 도움, 큰 한 방.', `보유 코인 <b>${profile.coins.toLocaleString('ko-KR')} ✦</b>`) + '<p class="shop-intro">클리어와 데일리 보상으로 얻은 코인으로 충전하세요.</p>' +
    Object.entries(ITEMS).map(([id,item])=>`<div class="shop-row"><span class="shop-symbol" style="--item-color:${itemColors[id]}">${item.icon}</span><div><b>${item.name} <small>보유 ${profile.items[id]}개 · ${item.description}</small></b></div><button data-action="buy" data-value="${id}" ${profile.coins<ITEM_COSTS[id]?'disabled':''}>${ITEM_COSTS[id]} ✦</button></div>`).join('')+
    `<div class="shop-bundle"><h3>✧ 웰컴 스타터 팩</h3><p>150 코인 + 해머 2 + 프리즈 2 + 마그넷 1<br>번들 구성 체험 · 1회 무료 지급</p><button data-action="starter" ${profile.starter?'disabled':''}>${profile.starter?'수령 완료 ✓':'무료 데모 받기'}</button></div><button class="secondary" data-action="reward-demo" ${profile.daily===localDate()?'disabled':''}>보상형 광고 데모 · 오늘의 100 코인</button><button class="secondary" data-action="skin">${profile.aurora?`오로라 보드 ${profile.skin==='aurora'?'끄기':'적용'}`:'오로라 보드 꾸미기 · 400 ✦'}</button><span class="demo-label">결제와 광고 송출 없는 포트폴리오 데모입니다.<br>보상 데모와 데일리 보너스는 하루 1회 보상을 공유해요.</span>`;
}
function settingLabel(k){return (k==='sound'?'<img src="assets/icons/'+(profile[k]?'audioOn':'audioOff')+'.png" alt="" width="20" height="20">':' ')+(profile[k]?'켬':'끔');}
function openModal(kind) {
  stopClock(); cancelDrag(); clearEffects(); stopAudio();
  const previousKind=modalKind;modalKind=kind;armed=null;document.body.classList.add('paused');renderItems();let html='';
  if(kind==='ready'||kind==='help') html=stageIntroMarkup(kind==='ready');
  else if(kind==='controls') html=modalHeading('','플레이 방법')+'<ol class="help-list"><li><b>1</b><span>블록을 누른 채 상하좌우로 움직이세요. 손을 떼지 않고 방향을 바꿀 수 있어요. 화면 화살표나 방향키로도 이동할 수 있어요.</span></li><li><b>2</b><span>블록 전체 폭을 같은 색 출구에 맞추고, 바깥으로 한 번 더 밀어주세요.</span></li><li><b>3</b><span>해머와 자석은 블록을 고른 뒤 사용해요. 아이템을 먼저 누르고 블록을 골라도 돼요. 효과와 개수는 길게 누르거나 상점에서 확인하세요.</span></li><li><b>4</b><span>4초 안에 연속 탈출! 5연속부터 10초간 피버로 점수가 2배예요.</span></li></ol>'+'<button class="secondary" data-action="help">이번 기믹</button><button class="primary" data-action="resume">계속</button>';
  else if(kind==='pause') html=modalHeading('','쉬는 중',`점수 ${state.score.toLocaleString('ko-KR')} · 시간도 멈췄어요.`)+'<button class="primary" data-action="resume">계속</button><div class="modal-actions"><button class="secondary" id="restart" data-action="restart">다시</button><button class="secondary" id="settings-open" data-action="settings"><img src="assets/icons/gear.png" alt="" width="22" height="22">설정</button><button class="secondary" id="daily-open" data-action="daily-open">매일 선물</button><button class="secondary" id="pass-open" data-action="pass"><img src="assets/icons/star.png" alt="" width="22" height="22">별 보상</button></div><button class="secondary" data-action="help">이번 기믹</button><a class="secondary" href="../../"><img src="assets/icons/home.png" alt="" width="22" height="22">나가기</a>';
  else if(kind==='restart') html=modalHeading('','다시 시작할까요?','같은 배치로 돌아가요. 사용한 아이템은 돌아오지 않아요.')+'<button class="primary" data-action="restart-confirm">다시</button><button class="secondary" data-action="resume">계속</button>';
  else if(kind==='shop') html=shopMarkup();
  else if(kind==='daily') html=modalHeading('','매일 선물','오늘의 100 코인으로 아이템을 충전하세요.')+`<div class="modal-art">✧</div><button class="primary" data-action="daily" ${profile.daily===localDate()?'disabled':''}>${profile.daily===localDate()?'오늘 수령 완료':'100 코인 받기'}</button><span class="demo-label">한국 시간 자정에 새 선물</span>`;
  else if(kind==='settings') html=modalHeading('','설정')+['sound','motion','haptic'].map(k=>`<div class="settings-row"><span>${{sound:'효과음',motion:'화면 효과',haptic:'진동'}[k]}</span><button data-action="setting" data-value="${k}" class="${profile[k]?'on':''}" aria-pressed="${profile[k]}">${settingLabel(k)}</button></div>`).join('')+'<p class="modal-copy">기기의 동작 줄이기 설정을 따르며, 다른 탭을 보면 시간과 효과가 멈춰요. 진동은 지원 기기에서 작동해요.</p><button class="primary" data-action="resume">계속</button><a class="demo-label" href="design.html">제작 · 수익화 설계 노트</a><span class="demo-label">포트폴리오 데모 · 실제 결제·광고 없음</span>';
  else if(kind==='pass') html=modalHeading('','별 보상',`모은 별 ${profile.stars} ★ · 스테이지의 별을 모아요.`)+[3,9,18].map((n,i)=>`<div class="pass-reward"><div><b>${n} ★</b><small>${[120,200,350][i]} 코인 · 자석 1</small></div><button data-action="pass-claim" data-value="${n}" ${profile.stars<n||profile.pass.includes(n)?'disabled':''}>${profile.pass.includes(n)?'완료':'받기'}</button></div>`).join('')+'<span class="demo-label">무료 누적 보상</span>';
  else if(kind==='won') {
    const next=stageInfo(nextStageNumber());
    html=modalHeading('',state.campaignLegacy?'퍼즐 클리어!':`스테이지 ${state.stage} 클리어!`)+`<div class="modal-stars">${'★'.repeat(state.earnedStars||1)}${'☆'.repeat(3-(state.earnedStars||1))}</div><div class="result-grid"><div><b>${state.score.toLocaleString('ko-KR')}</b><small>점수</small></div><div><b>${state.moves}</b><small>이동</small></div><div><b>+${state.earnedCoins||0}</b><small>코인 저장</small></div></div><div class="next-stage"><span>${next.introLabel}</span><b>다음 ${next.number} · ${next.shortTitle}</b></div><button class="primary" data-action="next">다음 스테이지</button><button class="secondary" data-action="pass">별 보상</button>`;
  }
  else if(kind==='lost') {const cost=120+state.continues*60;html=modalHeading('',state.reason==='tray'?'수집함이 찼어요':'시간이 다 됐어요',state.reason==='tray'?'수집 블록을 구조함에 보관하고, 45초 더 이어가요. 구조한 블록도 같은 색과 계속 매칭돼요.':'열어둔 길 그대로 45초 더 이어가세요.')+`<button class="primary" data-action="continue" ${state.continues>=2||profile.coins<cost?'disabled':''}>${state.continues>=2?'이어하기 모두 사용':`계속 · ${cost} 코인`}</button><button class="secondary" data-action="restart-confirm">다시</button><span class="demo-label">보유 ${profile.coins} 코인 · 최대 2회</span>`;}
  if(kind==='won'||kind==='lost')html+='<a class="secondary" href="../../">나가기</a>';
  $('modal').dataset.kind=kind;$('modal-content').innerHTML=html;if(previousKind!==kind)$('modal').scrollTop=0;$('modal-close').hidden=kind==='ready';
  if(!$('modal').open)$('modal').showModal();lastFrame=performance.now();
}
function claimDaily(){if(profile.daily===localDate())return;profile.coins+=100;profile.daily=localDate();save();renderHud();renderAux();toast('오늘의 100 코인을 받았어요!');}
function onAction(action,value) {
  if(action==='start'){if(state.started!==false||state.status!=='playing'||modalKind!=='ready')return;state.started=true;closeModal();save();}
  else if(action==='resume'){if(state.started===false)openModal('ready');else closeModal();}
  else if(['help','controls','settings','shop','restart'].includes(action))openModal(action);
  else if(action==='daily-open')openModal('daily');
  else if(action==='restart-confirm')newRun(state.stage,true);
  else if(action==='next'){if(state.status==='won')newRun(nextStageNumber());}
  else if(action==='buy') {const cost=ITEM_COSTS[value];if(!cost||profile.coins<cost)return;profile.coins-=cost;profile.items[value]++;save();renderHud();renderItems();openModal('shop');toast(`${ITEMS[value].name} +1`);}
  else if(action==='starter'){if(profile.starter)return;profile.starter=true;profile.coins+=150;profile.items.hammer+=2;profile.items.freeze+=2;profile.items.magnet++;save();renderHud();renderItems();openModal('shop');toast('스타터 팩을 받았어요!');}
  else if(action==='daily'){claimDaily();openModal('daily');}
  else if(action==='reward-demo'){claimDaily();openModal('shop');}
  else if(action==='setting'){profile[value]=!profile[value];syncPreferences();save();openModal('settings');}
  else if(action==='pass')openModal('pass');
  else if(action==='pass-claim'){const n=Number(value);if(![3,9,18].includes(n)||profile.stars<n||profile.pass.includes(n))return;profile.pass.push(n);profile.coins+={3:120,9:200,18:350}[n];profile.items.magnet++;save();renderHud();renderItems();openModal('pass');toast('코인과 마그넷 선물이 도착했어요!');}
  else if(action==='continue'){const cost=120+state.continues*60;if(profile.coins<cost)return;const next=continueRun(state);if(!next)return;profile.coins-=cost;state=next;history=[];combo=0;feverUntil=0;closeModal();render();save();if(state.status==='won')complete();else if(state.started===false)openModal('ready');}
  else if(action==='skin'){if(!profile.aurora){if(profile.coins<400){toast('오로라 보드에는 400 코인이 필요해요.');return;}profile.coins-=400;profile.aurora=true;}profile.skin=profile.skin==='aurora'?'original':'aurora';syncPreferences();save();renderHud();openModal('shop');}
}

let drag=null,itemPress=null,suppressItemClick=false;
function cancelSettle(){const current=settleAnimation;settleAnimation=null;current?.animation.cancel();}
function cancelDrag(){if(!drag)return;const current=drag;drag=null;if(current.frame!==null)cancelAnimationFrame(current.frame);current.el.classList.remove('dragging');current.el.style.transform='';try{if(current.el.hasPointerCapture?.(current.pointer))current.el.releasePointerCapture(current.pointer);}catch{}}
function paintDrag(current){
  const vx=Math.round((current.path.x-current.path.origin.x)*current.cell*100)/100,vy=Math.round((current.path.y-current.path.origin.y)*current.cell*100)/100;
  current.el.style.transform=`translate(${vx}px,${vy}px)`;
}
function queueDragFrame(){
  const current=drag;if(current.frame!==null)return;
  current.frame=requestAnimationFrame(()=>{current.frame=null;if(drag===current)paintDrag(current);});
}
listen($('blocks'),'pointerdown',event=>{
  const el=event.target.closest('[data-block]');if(!el||event.button>0||drag||state.status!=='playing'||state.started===false||$('modal').open||busy)return;
  const id=Number(el.dataset.block);if(armed){selectBlock(id);return;}
  selected=id;hint=null;
  $('blocks').querySelectorAll('.block').forEach(b=>{b.classList.toggle('selected',Number(b.dataset.block)===id);b.setAttribute('aria-pressed',String(Number(b.dataset.block)===id));});renderHint();
  const path=createDrag(state,id),cell=$('board').clientWidth/SIZE;
  // Re-grabbing a settling block starts at the position currently under the pointer.
  if(settleAnimation?.el===el&&cell>0){const rect=el.getBoundingClientRect(),board=$('board').getBoundingClientRect();path.x=(rect.left-board.left)/cell;path.y=(rect.top-board.top)/cell;}
  cancelSettle();setText('instruction',`${COLORS[path.origin.color].name} 선택`);
  drag={id,el,x:event.clientX,y:event.clientY,pointer:event.pointerId,path,cell,frame:null};el.setPointerCapture?.(event.pointerId);
  paintDrag(drag);
});
function settleBlock(current){
  const block=state.blocks.find(b=>b.id===current.id),el=$('blocks').querySelector(`[data-block="${current.id}"]`);
  if(!block||!el?.animate||!canAnimate())return;
  const x=(current.path.x-block.x)*current.cell,y=(current.path.y-block.y)*current.cell;
  if(Math.hypot(x,y)<.1)return;
  const animation=el.animate([{transform:`translate(${x}px,${y}px)`},{transform:'translate(0px,0px)'}],{duration:100,easing:'cubic-bezier(.2,.8,.2,1)'});
  settleAnimation={el,animation};animation.onfinish=()=>{if(settleAnimation?.animation===animation)settleAnimation=null;};
}
function finishDrag(){
  const current=drag,path=current.path,b=path.state.blocks.find(b=>b.id===current.id);cancelDrag();
  if(!b||b.x!==path.origin.x||b.y!==path.origin.y) {
    // A whole pointer path is one undoable move; never restore the clock from its preview.
    commit({ok:true,state:{...path.state,moves:state.moves+1,time:state.time,frozen:state.frozen},events:path.events});
  } else if(path.blocked)blockedMove(current.id);
  settleBlock(current);
}
function updateDrag(event){
  if(!drag||event.pointerId!==drag.pointer)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
  if(!dx&&!dy)return;
  drag.el.classList.add('dragging');if(drag.cell<=0)return;
  dragBy(drag.path,dx/drag.cell,dy/drag.cell);
  drag.x=event.clientX;drag.y=event.clientY;
  if(drag.path.terminal){finishDrag();return;}queueDragFrame();
}
listen($('blocks'),'pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointer)return;
  for(const point of event.getCoalescedEvents?.()||[]) {if(!drag)break;updateDrag({pointerId:event.pointerId,clientX:point.clientX,clientY:point.clientY});}
  updateDrag(event);
});
function endDrag(event,cancel=false){
  if(!drag||event.pointerId!==drag.pointer)return;
  if(cancel){cancelDrag();return;}updateDrag(event);if(drag)finishDrag();
}
listen($('blocks'),'pointerup',event=>endDrag(event));listen($('blocks'),'pointercancel',event=>endDrag(event,true));listen($('blocks'),'lostpointercapture',event=>{if(drag?.pointer===event.pointerId)cancelDrag();});
listen($('blocks'),'click',event=>{if(event.detail===0){const el=event.target.closest('[data-block]');if(el)selectBlock(Number(el.dataset.block));}});
listen($('items'),'pointerdown',event=>{
  const b=event.target.closest('[data-item]');if(!b)return;suppressItemClick=false;
  itemPress={x:event.clientX,y:event.clientY,timer:later(()=>{suppressItemClick=true;const id=b.dataset.item;toast(`${ITEMS[id].description} · ${profile.items[id]}개`);},500)};
});
function cancelItemPress(){if(itemPress)cancelLater(itemPress.timer);itemPress=null;}
listen($('items'),'pointermove',event=>{if(itemPress&&Math.hypot(event.clientX-itemPress.x,event.clientY-itemPress.y)>10)cancelItemPress();});
listen($('items'),'pointerup',cancelItemPress);listen($('items'),'pointercancel',()=>{cancelItemPress();suppressItemClick=false;});
listen($('items'),'contextmenu',event=>event.preventDefault());
listen($('items'),'click',event=>{if(suppressItemClick){suppressItemClick=false;return;}const b=event.target.closest('[data-item]');if(b)activateItem(b.dataset.item);});
for(const button of document.querySelectorAll('[data-direction]'))listen(button,'click',()=>{if(selected===null){toast('블록을 먼저 선택하세요');return;}const [dx,dy]=button.dataset.direction.split(',').map(Number);performMove(selected,dx,dy);});
listen(document,'keydown',event=>{
  if($('modal').open||event.ctrlKey||event.metaKey||event.altKey||event.target.matches('input,select,textarea'))return;
  const directions={ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]};
  if(directions[event.key]){event.preventDefault();if(selected===null){toast('블록을 먼저 선택하세요');return;}performMove(selected,...directions[event.key]);}
  else if(event.code==='Space'&&hasGimmick(state,'lift')&&(!event.target.matches('button,a')||event.target.closest('[data-block]'))){event.preventDefault();commit(elevate(state,selected));}
});
listen($('lift'),'click',()=>{if(!commit(elevate(state,selected)))toast('발판 왼쪽 위에 블록을 맞춰 선택하세요. 도착 칸도 비워주세요.');});
listen($('modal-content'),'click',event=>{
  const b=event.target.closest('[data-action]');if(b&&!b.disabled)onAction(b.dataset.action,b.dataset.value);
});
listen($('modal-close'),'click',()=>{if(state.started===false)openModal('ready');else closeModal();});
listen($('modal'),'cancel',event=>{event.preventDefault();if(state.started===false)openModal('ready');else closeModal();});
listen($('modal'),'close',()=>{lastFrame=performance.now();if(!document.hidden)startClock();});
listen($('help'),'click',()=>openModal(state.status!=='playing'?state.status:state.started===false?'ready':'help'));listen($('shop-open'),'click',()=>openModal(state.status!=='playing'?state.status:'shop'));
listen($('pause'),'click',()=>openModal(state.status!=='playing'?state.status:state.started===false?'ready':'pause'));
reduced.addEventListener?.('change',syncPreferences,{signal:lifecycle.signal});
function viewportChanged(){cancelDrag();cancelSettle();layoutBoard();}
listen(window,'resize',viewportChanged);if(window.visualViewport)listen(window.visualViewport,'resize',viewportChanged);
if(window.ResizeObserver){boardObserver=new ResizeObserver(layoutBoard);boardObserver.observe($('board-stage'));}
function stopClock(){if(timerId!==null){clearInterval(timerId);timerId=null;}}
function startClock(){if(!disposed&&timerId===null&&state.status==='playing'&&state.started!==false&&!$('modal').open){lastFrame=performance.now();timerId=setInterval(clockTick,200);}}
function clockTick(){
  const now=performance.now(),dt=Math.max(0,(now-lastFrame)/1000);lastFrame=now;
  if(document.hidden||$('modal').open||busy||state.status!=='playing'||state.started===false)return;
  activeTime+=dt;state=tick(state,dt);
  if(activeTime-lastClear>4&&activeTime>=feverUntil)combo=0;
  renderHud();if(now-lastSave>4000){save();lastSave=now;}if(state.status==='lost')complete();
}
listen(document,'visibilitychange',()=>{
  lastFrame=performance.now();cancelDrag();cancelItemPress();
  document.body.classList.toggle('paused',document.hidden||$('modal').open);if(document.hidden){stopClock();clearEffects();stopAudio();save();}
  else{layoutBoard();if(state.status!=='playing'&&!$('modal').open)openModal(state.status);else if(!$('modal').open)startClock();}
});
listen(window,'pagehide',event=>{
  save();stopClock();cancelDrag();cancelItemPress();clearEffects();stopAudio();
  if(!event.persisted){disposed=true;boardObserver?.disconnect();lifecycle.abort();if(audio?.close)void audio.close().catch(()=>{});audio=null;}
});
listen(window,'pageshow',()=>{lastFrame=performance.now();layoutBoard();if(!document.hidden&&!$('modal').open)startClock();});
render();save();
if(state.status==='won'){const result=winReward(state,profile);state=result.state;profile=result.profile;save();renderHud();openModal('won');}
else if(state.status==='lost')openModal('lost');
else if(state.started===false)openModal('ready');
else startClock();
