import { SIZE, COLORS, MODES, GATES, ITEMS, ITEM_COSTS, createLevel, move, useItem, elevate, tick, continueRun, newProfile, restoreProfile, validRun, winReward, guide, copyState } from './rules.mjs';

const $ = id => document.getElementById(id);
const KEY = 'block-bloom:v1';
const itemColors = { hammer: '#ff99b2', freeze: '#8cdfff', hint: '#ffdd8d', undo: '#c1a1ff', magnet: '#8fe6bc' };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let profile = newProfile(), state, history = [], selected = null, armed = null, hint = null, modalKind = '', toastTimer, busy = false;
let activeTime = 0, lastClear = -100, combo = 0, feverUntil = 0, lastFrame = performance.now(), lastSave = 0, audio, storageWarning = false;
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved) {
    profile = restoreProfile(saved.profile);
    if (validRun(saved.run)) { state = saved.run; history = Array.isArray(saved.history) ? saved.history.filter(validRun).slice(-30) : []; }
  }
} catch { /* A private or unavailable store still allows a fresh game. */ }
if (!state) state = createLevel('classic', profile.levels.classic, seed());

function seed() { const values = new Uint32Array(1); crypto.getRandomValues(values); return values[0]; }
function localDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function snapshot(s) { return { ...copyState(s), plan: [] }; }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ profile, run: snapshot(state), history: history.map(snapshot) })); }
  catch { if (!storageWarning) { storageWarning = true; toast('이 브라우저에서는 저장할 수 없어요. 현재 게임은 계속 플레이할 수 있어요.'); } }
}
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2800); }
function colorStyle(color) { const c = COLORS[color]; return `--piece:${c.hex};--light:${c.light};--dark:${c.dark}`; }
function canAnimate() { return profile.motion && !reduced.matches; }
function syncPreferences() {
  document.body.classList.toggle('reduced-motion', !canAnimate()); document.body.dataset.skin = profile.skin;
  $('sound-toggle').textContent = profile.sound ? '♫' : '♪'; $('sound-toggle').setAttribute('aria-pressed', String(profile.sound));
  $('sound-toggle').setAttribute('aria-label', `효과음 ${profile.sound ? '켜짐' : '꺼짐'}`);
}
function sound(kind = 'move', strength = 1) {
  if (!profile.sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume();
    const start = audio.currentTime, out = audio.createGain(); out.gain.value = .13; out.connect(audio.destination);
    const tone = (frequency, delay, duration, type = 'sine', end = frequency) => {
      const osc = audio.createOscillator(), gain = audio.createGain(); osc.type = type; osc.frequency.setValueAtTime(frequency, start + delay);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20,end), start + delay + duration);
      gain.gain.setValueAtTime(.001, start + delay); gain.gain.linearRampToValueAtTime(.6, start + delay + .009); gain.gain.exponentialRampToValueAtTime(.001, start + delay + duration);
      osc.connect(gain); gain.connect(out); osc.start(start + delay); osc.stop(start + delay + duration + .02);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
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
    setTimeout(() => out.disconnect(), 1200);
  } catch { /* Sound is optional on browsers without Web Audio. */ }
}
function vibrate(strong = false) { if (profile.haptic && canAnimate()) try { navigator.vibrate?.(strong ? [16,12,25] : 8); } catch { /* Optional hardware. */ } }
function renderModes() {
  $('modes').innerHTML = Object.entries(MODES).map(([id,m]) => `<button class="mode-button ${state.mode===id?'active':''}" data-mode="${id}" aria-pressed="${state.mode===id}"><span class="mode-icon">${m.icon}</span><span><b>${m.name}</b><small>${m.en}</small></span><em>↗</em></button>`).join('');
}
function renderBlocks() {
  const focusedId = document.activeElement?.dataset?.block;
  $('blocks').innerHTML = state.blocks.map(b => {
    const c = COLORS[b.color], label = `${c.name} ${b.w}×${b.h} 블록${state.mode === 'merge' ? ' 숫자 '+2**b.rank : ''}${b.key?' 열쇠':''}${b.ice?' 얼음 '+b.ice+'겹':''}`;
    return `<button class="block ${selected===b.id?'selected':''} ${b.ice?'iced':''}" data-block="${b.id}" data-ice="${b.ice||0}" aria-label="${label}" aria-pressed="${selected===b.id}" style="${colorStyle(b.color)};--w:${b.w};--h:${b.h};left:${b.x/SIZE*100}%;top:${b.y/SIZE*100}%;width:${b.w/SIZE*100}%;height:${b.h/SIZE*100}%"><span class="block-body">${'<i class="stud"></i>'.repeat(b.w*b.h)}<span class="block-symbol ${state.mode==='merge'?'block-number':''} ${b.key?'block-key':''}">${state.mode==='merge'?2**b.rank:b.key?'⚿':c.symbol}</span></span></button>`;
  }).join('');
  if (focusedId && $('blocks').querySelector(`[data-block="${focusedId}"]`)) $('blocks').querySelector(`[data-block="${focusedId}"]`).focus({ preventScroll: true });
  $('gates').innerHTML = GATES.map(g=>`<div class="gate ${g.side} ${state.mode==='key'&&!state.unlocked.includes(g.color)?'locked':''}" style="${colorStyle(g.color)}" aria-label="${COLORS[g.color].name} ${g.side} 출구"><span>${g.side==='top'?'▴':g.side==='right'?'▸':g.side==='bottom'?'▾':'◂'}</span><span class="gate-lock">${state.mode==='key'&&!state.unlocked.includes(g.color)?'⚿':state.mode==='merge'?'4+':COLORS[g.color].symbol}</span></div>`).join('');
  $('platforms').innerHTML = state.mode==='factory' ? '<div class="platform">⇅</div><div class="platform second">⇅</div>' : '';
  renderHint();
}
function renderHint() {
  const b = hint && state.blocks.find(b=>b.id===hint.id), arrow = $('hint-arrow'); arrow.hidden = !b;
  if (b) { arrow.style.left = `${b.x / 6 * 100}%`; arrow.style.top = `${b.y / 6 * 100}%`; arrow.style.width = `${b.w/6*100}%`; arrow.style.height = `${b.h/6*100}%`; arrow.textContent = hint.dx>0?'➜':hint.dx<0?'⬅':hint.dy>0?'⬇':'⬆'; }
}
function renderItems() {
  $('items').innerHTML = Object.entries(ITEMS).map(([id,item])=>`<button class="item-button ${armed===id?'active':''} ${profile.items[id]?'':'empty'}" style="--item-color:${itemColors[id]}" data-item="${id}" aria-label="${item.name}, ${item.description}, 보유 ${profile.items[id]}개" aria-pressed="${armed===id}" title="${item.description}"><span class="item-icon">${item.icon}</span><b>${item.name}</b><small>${profile.items[id]||'+'}</small></button>`).join('');
}
function renderHud() {
  const seconds = Math.ceil(state.time); $('time').textContent = `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  $('timer').classList.toggle('urgent', seconds<=20 && state.frozen<=0); $('timer').classList.toggle('frozen', state.frozen>0);
  $('freeze-time').textContent = state.frozen>0 ? `❄ ${Math.ceil(state.frozen)}s` : '';
  $('cleared').textContent = `${state.removed} / ${state.total}`; $('score').textContent = state.score.toLocaleString('ko-KR');
  $('coins').textContent = profile.coins.toLocaleString('ko-KR'); $('progress').style.width = `${state.removed/state.total*100}%`;
  $('pass-stars').textContent = `${profile.stars} ★`; $('pass-progress').style.width = `${Math.min(100,profile.stars/18*100)}%`;
  const fever = activeTime < feverUntil;
  $('fever-progress').style.width = `${fever ? Math.max(0,(feverUntil-activeTime)/10*100) : Math.min(100,combo/5*100)}%`;
  $('combo-count').textContent = fever ? `FEVER · ${Math.ceil(feverUntil-activeTime)}s · SCORE ×2` : combo>0 ? `${combo} COMBO · KEEP IT GOING!` : 'NEXT BOOM IS YOURS.';
  document.body.classList.toggle('fever',fever); $('fever-banner').hidden = !fever;
}
function renderAux() {
  $('dock').hidden = state.mode!=='triple';
  if (state.mode==='triple') $('dock-slots').innerHTML = Array.from({length:7},(_,i)=>`<div class="dock-slot ${state.tray[i]?'filled':''} ${i===6&&state.tray.length>=5?'danger':''}" ${state.tray[i]?`style="${colorStyle(state.tray[i])}" data-symbol="${COLORS[state.tray[i]].symbol}"`:''}></div>`).join('');
  $('factory-bar').hidden = state.mode!=='factory'; $('queue-count').textContent = state.queue.length;
  $('queue-preview').innerHTML = state.queue.map(b=>`<i style="${colorStyle(b.color)}"></i>`).join('');
  $('daily-status').textContent = profile.daily===localDate() ? '오늘 선물 수령 완료 ✓' : '100 코인 받기 ↗';
}
function render() {
  const mode = MODES[state.mode]; $('mode-title').firstChild.textContent = mode.name+' '; $('mode-eyebrow').textContent = mode.en;
  $('level-badge').textContent = String(state.level).padStart(2,'0'); $('mode-description').textContent = mode.description;
  renderModes(); renderBlocks(); renderItems(); renderHud(); renderAux(); syncPreferences();
}

function addFX(element, duration) { const layer = $('fx-layer'); while (layer.childElementCount > 220) layer.firstElementChild.remove(); layer.append(element); setTimeout(()=>element.remove(),duration); }
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
  const word=document.createElement('b');word.className='fx-word';word.textContent=kind==='merge'?'MERGE!':kind==='triple'?'TRIPLE BLOOM!':kind==='thaw'?'CRACK!':`+${100*b.w*b.h*b.rank}`;
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
    if(combo>=5&&feverUntil<=activeTime) {feverUntil=activeTime+10;toast('BLOOM FEVER! 10초 동안 점수 2배');}
    const multiplier=activeTime<feverUntil?2:1;
    state.score+=(multiplier-1)*clears.reduce((sum,e)=>sum+(e.type==='merge'?250*e.block.rank:100*e.block.w*e.block.h*e.block.rank),0)+Math.max(0,combo-1)*25;
    for(const event of clears) burst(event.block,event.type,Math.min(8,combo));
    if(triple) burst({color:triple.color,x:2,y:4,w:2,h:1,rank:1},'triple',4);
    const label=$('combo-label');label.textContent=combo>=5?'BLOOM FEVER!':combo>=2?`${combo} COMBO!`:'';label.classList.remove('pop');void label.offsetWidth;if(label.textContent)label.classList.add('pop');
    setTimeout(()=>{label.textContent='';label.classList.remove('pop');},750);
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
  if(state.status==='won') {
    const reward=winReward(state,profile);state=reward.state;profile=reward.profile;save();renderHud();sound('win');celebration();
    setTimeout(()=>{if(state.status==='won')openModal('won');},600);
  } else if(state.status==='lost') {save();openModal('lost');}
}
function commit(result,{remember=true}={}) {
  if(!result.ok)return false;
  if(remember){history.push(snapshot(state));if(history.length>30)history.shift();}
  state=result.state;hint=null;armed=null;
  if(!state.blocks.some(b=>b.id===selected))selected=null;
  react(result.events);render();save();complete();return true;
}
function performMove(id,dx,dy) {
  if(busy||$('modal').open||state.status!=='playing')return;
  if(!commit(move(state,id,dx,dy))) {
    sound('blocked');const frame=$('board-frame');frame.classList.remove('blocked');void frame.offsetWidth;frame.classList.add('blocked');
    const b=state.blocks.find(b=>b.id===id);
    if(b?.ice)toast('얼음은 다른 블록이 탈출할 때 깨져요.');
    else if(state.mode==='merge'&&b?.rank===1)toast('같은 색 2를 합쳐 4부터 탈출할 수 있어요.');
    else if(state.mode==='key'&&b&&!b.key&&!state.unlocked.includes(b.color))toast('같은 색 열쇠 블록을 먼저 탈출시키세요.');
  }
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
  if(profile.items[id]<=0){toast(`${ITEMS[id].name}을 충전해 주세요.`);openModal('shop');return;}
  if(id==='hint') {
    if(busy)return;busy=true;$('instruction').textContent='길을 찾는 중…';
    setTimeout(()=>{
      try {
        const action=guide(state,5000);
        if(action){hint=action;selected=action.id;profile.items.hint--;renderBlocks();renderItems();save();toast('빛나는 화살표 방향으로 밀어보세요.');}
        else {toast('가까운 출구를 찾지 못했어요. 해머로 공간을 만들어 보세요. 아이템은 유지돼요.');}
      } finally {busy=false;$('instruction').textContent='블록을 드래그하거나 방향키로 이동하세요.';}
    },30);return;
  }
  if(id==='undo') {
    if(!history.length){toast('되돌릴 이동이 없어요.');return;}
    const old=history.pop();state={...old,time:state.time,frozen:state.frozen,continues:state.continues};profile.items.undo--;selected=null;hint=null;armed=null;combo=0;feverUntil=0;
    render();save();sound('move');toast('한 수 되돌렸어요. 남은 시간은 유지돼요.');return;
  }
  if(['hammer','magnet'].includes(id)&&selected===null){armed=armed===id?null:id;renderItems();toast(armed?`${ITEMS[id].name}: 사용할 블록을 선택하세요.`:'아이템 선택을 취소했어요.');return;}
  const result=useItem(state,id,selected);
  if(!result.ok){toast(id==='freeze'?'이미 시간이 멈춰 있어요.':'먼저 블록을 선택하세요.');return;}
  profile.items[id]--;commit(result);
  if(id==='freeze'){sound('freeze');toast('타임 프리즈! 20초 동안 시간이 멈춰요.');}
}
function newRun(mode=state.mode,level=profile.levels[mode],retry=false) {
  const oldSeed=state.seed;state=createLevel(mode,level,retry?oldSeed:seed());history=[];selected=null;armed=null;hint=null;combo=0;feverUntil=0;lastClear=-100;activeTime=0;busy=false;
  closeModal();$('fx-layer').replaceChildren();$('combo-label').textContent='';$('instruction').textContent=MODES[mode].goal;render();save();
}

function closeModal() {if($('modal').open)$('modal').close();modalKind='';lastFrame=performance.now();}
function modalHeading(eyebrow,title,copy='') {return `<p class="modal-eyebrow">${eyebrow}</p><h2 class="modal-title" id="modal-title">${title}</h2>${copy?`<p class="modal-copy">${copy}</p>`:''}`;}
function shopMarkup() {
  return modalHeading('BOOSTER LAB', '작은 도움, 큰 한 방.', `보유 코인 <b>${profile.coins.toLocaleString('ko-KR')} ✦</b>`) + '<p class="shop-intro">클리어와 데일리 보상으로 얻은 코인으로 충전하세요.</p>' +
    Object.entries(ITEMS).map(([id,item])=>`<div class="shop-row"><span class="shop-symbol" style="--item-color:${itemColors[id]}">${item.icon}</span><div><b>${item.name} <small>보유 ${profile.items[id]}개 · ${item.description}</small></b></div><button data-action="buy" data-value="${id}" ${profile.coins<ITEM_COSTS[id]?'disabled':''}>${ITEM_COSTS[id]} ✦</button></div>`).join('')+
    `<div class="shop-bundle"><h3>✧ 웰컴 스타터 팩</h3><p>150 코인 + 해머 2 + 프리즈 2 + 마그넷 1<br>번들 구성 체험 · 1회 무료 지급</p><button data-action="starter" ${profile.starter?'disabled':''}>${profile.starter?'수령 완료 ✓':'무료 데모 받기'}</button></div><button class="secondary" data-action="reward-demo" ${profile.daily===localDate()?'disabled':''}>보상형 광고 데모 · 오늘의 100 코인</button><button class="secondary" data-action="skin">${profile.aurora?`오로라 보드 ${profile.skin==='aurora'?'끄기':'적용'}`:'오로라 보드 꾸미기 · 400 ✦'}</button><span class="demo-label">결제와 광고 송출 없는 포트폴리오 데모입니다.<br>보상 데모와 데일리 보너스는 하루 1회 보상을 공유해요.</span>`;
}
function openModal(kind) {
  modalKind=kind;armed=null;renderItems();const content=$('modal-content');let html='';
  if(kind==='help') {
    html=modalHeading('A LITTLE PUSH, A BIG BLOOM', '한 수씩, 기분 좋게.', MODES[state.mode].description)+
      '<ol class="help-list"><li><b>01</b><span>블록을 <strong>드래그</strong>해서 움직여요. 클릭 후 <strong>방향키 / WASD / 화면 화살표</strong>로 한 칸씩 움직일 수도 있어요.</span></li><li><b>02</b><span>블록 전체 폭이 출구 안에 들어오도록 맞춘 뒤, <strong>같은 색 출구 바깥으로 한 번 더</strong> 밀어주세요. 색마다 ● ◆ ✦ ▲ 기호도 있어요.</span></li><li><b>03</b><span>해머·마그넷은 블록 선택 후 바로 사용! 아이템을 먼저 누른 뒤 블록을 골라도 돼요.</span></li><li><b>04</b><span>4초 이내 연속 탈출은 콤보. 5콤보부터 10초간 피버로 점수 2배! 제한 시간 안에 모두 탈출시키세요.</span></li></ol>'+
      (state.mode==='factory'?'<p class="modal-copy">승강기: 중앙 두 패드의 왼쪽 위 칸(x=2, y=2 또는 4)에 맞춘 블록을 선택하고 ⇅ 버튼 또는 Space를 누르세요. 목적지가 비어 있으면 중간 블록을 건너뛰어요. 생성기는 첫 보드가 빈 뒤 하나씩 공급해요.</p>':'')+
      '<button class="primary" data-action="resume">좋아요, 플레이!</button>';
  } else if(kind==='pause')html=modalHeading('TAKE A BREATH','잠깐 쉬어가요.','쉬는 동안 시간도 함께 멈춰요.')+'<div class="modal-art">Ⅱ</div><button class="primary" data-action="resume">계속 플레이</button><button class="secondary" data-action="restart-confirm">처음부터 다시</button>';
  else if(kind==='restart')html=modalHeading('ONE MORE TRY','이 보드를 다시 풀까요?','같은 배치로 처음부터 시작해요. 사용한 아이템은 돌아오지 않아요.')+'<button class="primary" data-action="restart-confirm">같은 보드 다시 시작</button><button class="secondary" data-action="resume">계속 플레이</button>';
  else if(kind==='switch')html=modalHeading('NEW PUZZLE, NEW MOOD','다른 모드로 이동할까요?','현재 보드는 종료하고 선택한 모드에서 새 게임을 시작해요. 코인과 아이템, 모드별 도달 레벨은 유지돼요.')+`<button class="primary" data-action="switch-confirm" data-value="${$('modal').dataset.nextMode}">모드 이동</button><button class="secondary" data-action="resume">현재 게임 계속</button>`;
  else if(kind==='shop')html=shopMarkup();
  else if(kind==='daily')html=modalHeading('A DAILY LITTLE GIFT','오늘도, 반가워요!','매일 100 코인을 받아 마음에 드는 부스터를 충전하세요.')+`<div class="modal-art">✧</div><button class="primary" data-action="daily" ${profile.daily===localDate()?'disabled':''}>${profile.daily===localDate()?'오늘 선물 수령 완료 ✓':'100 코인 받기 ✦'}</button><span class="demo-label">한국 시간 자정마다 새 선물 · 이 브라우저에 저장</span>`;
  else if(kind==='settings')html=modalHeading('YOUR KIND OF BLOOM','플레이 설정')+['sound','motion','haptic'].map(k=>`<div class="settings-row"><span>${{sound:'효과음',motion:'화면 흔들림 · 파티클',haptic:'진동 (지원 기기)'}[k]}</span><button data-action="setting" data-value="${k}" class="${profile[k]?'on':''}" aria-pressed="${profile[k]}">${profile[k]?'ON':'OFF'}</button></div>`).join('')+'<p class="modal-copy">기기의 동작 줄이기 설정도 자동으로 적용해요.<br>팝업과 다른 탭을 보는 동안 시간은 멈춰요.</p><button class="primary" data-action="resume">플레이로 돌아가기</button><a class="demo-label" href="design.html">게임 디자인 · 수익화 설계 노트 ↗</a>';
  else if(kind==='pass')html=modalHeading('BLOOM PASS · FREE TRACK','별이 모이면 선물이! ',`누적 ${profile.stars} ★ · 모든 모드의 클리어 별이 모여요.`)+[3,9,18].map((n,i)=>`<div class="pass-reward"><div><b>${n} ★ BLOOM ${i+1}</b><small>${[120,200,350][i]} 코인 + 마그넷 1개</small></div><button data-action="pass-claim" data-value="${n}" ${profile.stars<n||profile.pass.includes(n)?'disabled':''}>${profile.pass.includes(n)?'수령 완료':'받기'}</button></div>`).join('')+'<span class="demo-label">무료 누적 보상 트랙 · 현금 결제 없음</span>';
  else if(kind==='won')html=modalHeading('BEAUTIFULLY CLEARED!', '완벽한 블룸!')+`<div class="modal-stars">${'★'.repeat(state.earnedStars||1)}${'☆'.repeat(3-(state.earnedStars||1))}</div><p class="modal-copy" style="text-align:center">${MODES[state.mode].name} · LEVEL ${state.level}<br>남은 시간 65초 초과 ★★★ · 25초 초과 ★★</p><div class="result-grid"><div><b>${state.score.toLocaleString('ko-KR')}</b><small>SCORE</small></div><div><b>${state.moves}</b><small>MOVES</small></div><div><b>+${state.earnedCoins||0} ✦</b><small>COINS SAVED</small></div></div><button class="primary" data-action="next">다음 레벨 →</button><button class="secondary" data-action="pass">별 보상 보기 ✧</button>`;
  else if(kind==='lost') {
    const cost=120+state.continues*60;
    html=modalHeading('SO CLOSE. ONE MORE BLOOM?',state.reason==='tray'?'도크가 가득 찼어요.':'시간이 다 됐어요.',state.reason==='tray'?'도크를 비우고 45초를 더 받아 이어가세요.':'열어둔 길 그대로, 45초를 더 받아 이어가세요.')+`<div class="modal-art">↻</div><button class="primary" data-action="continue" ${state.continues>=2||profile.coins<cost?'disabled':''}>${state.continues>=2?'이어하기 2회 사용 완료':`이어하기 · ${cost} ✦`}</button><button class="secondary" data-action="restart-confirm">같은 보드 다시 도전</button><span class="demo-label">보유 ${profile.coins} 코인 · 이어하기는 한 판에 최대 2회</span>`;
  }
  content.innerHTML=html;if(!$('modal').open)$('modal').showModal();lastFrame=performance.now();
}
function claimDaily(){if(profile.daily===localDate())return;profile.coins+=100;profile.daily=localDate();save();renderHud();renderAux();toast('오늘의 100 코인을 받았어요!');}
function onAction(action,value) {
  if(action==='resume')closeModal();
  else if(action==='restart-confirm')newRun(state.mode,state.level,true);
  else if(action==='switch-confirm')newRun(value);
  else if(action==='next')newRun(state.mode,state.level+1);
  else if(action==='buy') {const cost=ITEM_COSTS[value];if(!cost||profile.coins<cost)return;profile.coins-=cost;profile.items[value]++;save();renderHud();renderItems();openModal('shop');toast(`${ITEMS[value].name} +1`);}
  else if(action==='starter'){if(profile.starter)return;profile.starter=true;profile.coins+=150;profile.items.hammer+=2;profile.items.freeze+=2;profile.items.magnet++;save();renderHud();renderItems();openModal('shop');toast('스타터 팩을 받았어요!');}
  else if(action==='daily'){claimDaily();openModal('daily');}
  else if(action==='reward-demo'){claimDaily();openModal('shop');}
  else if(action==='setting'){profile[value]=!profile[value];syncPreferences();save();openModal('settings');}
  else if(action==='pass')openModal('pass');
  else if(action==='pass-claim'){const n=Number(value);if(![3,9,18].includes(n)||profile.stars<n||profile.pass.includes(n))return;profile.pass.push(n);profile.coins+={3:120,9:200,18:350}[n];profile.items.magnet++;save();renderHud();renderItems();openModal('pass');toast('코인과 마그넷 선물이 도착했어요!');}
  else if(action==='continue'){const cost=120+state.continues*60;if(profile.coins<cost)return;const next=continueRun(state);if(!next)return;profile.coins-=cost;state=next;history=[];combo=0;feverUntil=0;closeModal();render();save();}
  else if(action==='skin'){if(!profile.aurora){if(profile.coins<400){toast('오로라 보드에는 400 코인이 필요해요.');return;}profile.coins-=400;profile.aurora=true;}profile.skin=profile.skin==='aurora'?'original':'aurora';syncPreferences();save();renderHud();openModal('shop');}
}

let drag=null;
$('blocks').addEventListener('pointerdown',event=>{
  const el=event.target.closest('[data-block]');if(!el||state.status!=='playing'||$('modal').open||busy)return;
  const id=Number(el.dataset.block);if(armed){selectBlock(id);return;}
  selected=id;hint=null;
  document.querySelectorAll('.block').forEach(b=>{b.classList.toggle('selected',Number(b.dataset.block)===id);b.setAttribute('aria-pressed',String(Number(b.dataset.block)===id));});renderHint();
  const b=state.blocks.find(b=>b.id===id);$('instruction').textContent=`${COLORS[b.color].name} 선택 · 드래그 또는 방향키로 이동`;
  drag={id,el,x:event.clientX,y:event.clientY,pointer:event.pointerId};el.setPointerCapture?.(event.pointerId);
});
$('blocks').addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointer)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(dx,dy)<8)return;
  const b=state.blocks.find(b=>b.id===drag.id);if(!b)return;
  const cell=$('board').clientWidth/6;
  // Live dragging follows the same collision rules as the committed move.
  let vx=0,vy=0;const horizontal=Math.abs(dx)>Math.abs(dy),delta=horizontal?dx:dy,sign=Math.sign(delta);
  const preview=move(state,b.id,horizontal?sign*6:0,horizontal?0:sign*6),landed=preview.state.blocks.find(other=>other.id===b.id);
  const allowed=!preview.ok?4:!landed?((horizontal?(sign>0?6-b.x-b.w:b.x):(sign>0?6-b.y-b.h:b.y))+.7)*cell:Math.abs(horizontal?landed.x-b.x:landed.y-b.y)*cell;
  const offset=sign*Math.min(Math.abs(delta),allowed);if(horizontal)vx=offset;else vy=offset;
  drag.el.classList.add('dragging');drag.el.style.transform=`translate(${vx}px,${vy}px)`;
});
function endDrag(event,cancel=false) {
  if(!drag||event.pointerId!==drag.pointer)return;const current=drag;drag=null;current.el.classList.remove('dragging');current.el.style.transform='';
  const dx=event.clientX-current.x,dy=event.clientY-current.y;
  if(cancel||Math.hypot(dx,dy)<14)return;
  const cell=$('board').clientWidth/6, horizontal=Math.abs(dx)>Math.abs(dy), distance=horizontal?dx:dy, steps=Math.min(6,Math.max(1,Math.round(Math.abs(distance)/cell)))*Math.sign(distance);
  performMove(current.id,horizontal?steps:0,horizontal?0:steps);
}
$('blocks').addEventListener('pointerup',event=>endDrag(event));$('blocks').addEventListener('pointercancel',event=>endDrag(event,true));
$('blocks').addEventListener('click',event=>{if(event.detail===0){const el=event.target.closest('[data-block]');if(el)selectBlock(Number(el.dataset.block));}});
$('modes').addEventListener('click',event=>{const button=event.target.closest('[data-mode]');if(!button||button.dataset.mode===state.mode)return;const mode=button.dataset.mode;if(state.moves>0&&state.status==='playing'){$('modal').dataset.nextMode=mode;openModal('switch');}else newRun(mode);});
$('items').addEventListener('click',event=>{const b=event.target.closest('[data-item]');if(b)activateItem(b.dataset.item);});
document.querySelectorAll('[data-direction]').forEach(button=>button.addEventListener('click',()=>{if(selected===null){toast('먼저 움직일 블록을 선택하세요.');return;}const [dx,dy]=button.dataset.direction.split(',').map(Number);performMove(selected,dx,dy);}));
document.addEventListener('keydown',event=>{
  if($('modal').open||event.ctrlKey||event.metaKey||event.altKey||event.target.matches('input,select,textarea'))return;
  const directions={ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]};
  if(directions[event.key]){event.preventDefault();if(selected===null){toast('블록을 먼저 선택하세요.');return;}performMove(selected,...directions[event.key]);}
  else if(event.code==='Space'&&state.mode==='factory'&&(!event.target.matches('button,a')||event.target.closest('[data-block]'))){event.preventDefault();commit(elevate(state,selected));}
});
$('lift').addEventListener('click',()=>{if(!commit(elevate(state,selected)))toast('중앙 패드 왼쪽 위에 블록을 맞추고 선택하세요. 도착 패드도 비어 있어야 해요.');});
$('modal-content').addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button&&!button.disabled)onAction(button.dataset.action,button.dataset.value);});
$('modal-close').addEventListener('click',closeModal);$('modal').addEventListener('cancel',()=>{modalKind='';lastFrame=performance.now();});$('modal').addEventListener('close',()=>{lastFrame=performance.now();});
for(const id of ['help','help-side'])$(id).addEventListener('click',()=>openModal('help'));
for(const id of ['shop-open','booster-shop'])$(id).addEventListener('click',()=>openModal('shop'));
$('settings-open').addEventListener('click',()=>openModal('settings'));
for(const id of ['pass-open','pass-mobile'])$(id).addEventListener('click',()=>openModal('pass'));
for(const id of ['daily-open','daily-mobile'])$(id).addEventListener('click',()=>openModal('daily'));
$('pause').addEventListener('click',()=>{if(state.status==='playing')openModal('pause');else openModal(state.status);});$('restart').addEventListener('click',()=>openModal('restart'));
$('sound-toggle').addEventListener('click',()=>{profile.sound=!profile.sound;syncPreferences();save();if(profile.sound)sound('move');});
reduced.addEventListener?.('change',syncPreferences);
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();if(document.hidden){drag=null;save();}});
window.addEventListener('pagehide',save);
setInterval(()=>{
  const now=performance.now(),dt=Math.min(1,(now-lastFrame)/1000);lastFrame=now;
  if(document.hidden||$('modal').open||busy||state.status!=='playing')return;
  activeTime+=dt;state=tick(state,dt);
  if(activeTime-lastClear>4&&activeTime>=feverUntil)combo=0;
  renderHud();if(now-lastSave>4000){save();lastSave=now;}
  if(state.status==='lost')complete();
},200);
render();save();
if(state.status==='won'){const result=winReward(state,profile);state=result.state;profile=result.profile;save();renderHud();openModal('won');}
else if(state.status==='lost')openModal('lost');
