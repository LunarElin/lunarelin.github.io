import {ANIMALS, ITEMS, LESSONS, createGame, isOpen, available, pick, useItem, tick, validSave} from './rules.mjs';
import {animal, icon, scenery} from './art.mjs';

const $=id=>document.getElementById(id);
const KEY='cozy-forest:v1';
const freshProfile=()=>({best:0,level:1,coins:150,inventory:Object.fromEntries(ITEMS.map(i=>[i.id,3])),lessons:[],sound:true,haptics:true,welcomed:false});
let profile=freshProfile(),state,selectedItem=null,audioContext,toastTimer,saveClock=0,lastTick=performance.now(),resultTimer;
let storageAvailable=true;
try {
  const saved=JSON.parse(localStorage.getItem(KEY)||'null');
  if(saved?.profile) {
    const p=saved.profile;
    for(const key of ['best','coins']) if(Number.isFinite(p[key])&&p[key]>=0) profile[key]=Math.floor(p[key]);
    if(Number.isInteger(p.level)&&p.level>0) profile.level=p.level;
    for(const item of ITEMS) if(Number.isInteger(p.inventory?.[item.id])&&p.inventory[item.id]>=0) profile.inventory[item.id]=p.inventory[item.id];
    profile.lessons=Array.from({length:LESSONS.length},(_,i)=>p.lessons?.[i]===true);
    for(const key of ['sound','haptics','welcomed']) if(typeof p[key]==='boolean') profile[key]=p[key];
  }
  if(validSave(saved?.active)) state=saved.active;
} catch {storageAvailable=false;}
const resumed=!!state;
state??=createGame({level:profile.level});
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

document.querySelectorAll('[data-icon]').forEach(el=>{el.outerHTML=icon(el.dataset.icon);});
$('scenery').innerHTML=scenery;
$('intro-animals').innerHTML=animal(1)+animal(0)+animal(2);

function persist() {
  try {localStorage.setItem(KEY,JSON.stringify({profile,active:state.status==='playing'?{...state,target:null}:null}));}
  catch {if(storageAvailable) toast('이 브라우저에서는 기록을 저장할 수 없어요. 플레이는 계속할 수 있어요.');storageAvailable=false;}
}
function toast(text) {
  $('toast').textContent=text;$('toast').classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2700);
}
function sound(kind='tap') {
  if(!profile.sound) return;
  try {
    audioContext??=new (window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==='suspended') audioContext.resume().catch(()=>{});
    const notes=kind==='match'?[523.25,659.25,783.99]:kind==='fever'?[523,659,784,1046]:kind==='win'?[523,659,784,1046,1319]:kind==='item'?[440,660]:kind==='error'?[160]:[350+state.tray.length*70];
    notes.forEach((frequency,i)=>{
      const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),start=audioContext.currentTime+i*.065;
      oscillator.type=kind==='tap'?'sine':'triangle';oscillator.frequency.setValueAtTime(frequency,start);
      if(kind==='tap') oscillator.frequency.exponentialRampToValueAtTime(frequency*1.4,start+.06);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.055,start+.008);gain.gain.exponentialRampToValueAtTime(.001,start+.23);
      oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(start);oscillator.stop(start+.25);
    });
  } catch { /* Audio is optional on browsers without Web Audio. */ }
}
function vibrate(pattern) {if(profile.haptics&&!reducedMotion&&navigator.vibrate) navigator.vibrate(pattern);}
function setMessage(text) {$('message').textContent=text;}
const requiredItem=()=>state.mode==='tutorial'?LESSONS[state.lesson].item:null;
const lessonReady=()=>!requiredItem()||state.used[requiredItem()]>0;

function renderBoard() {
  const focusedId=document.activeElement?.dataset?.tile;
  $('board').innerHTML=state.board.slice().sort((a,b)=>a.z-b.z).map(tile=>{
    const open=isOpen(state.board,tile),hinted=state.hints.includes(tile.id);
    return `<button class="tile${open?'':' covered'}${hinted?' hinted':''}${state.target&&open?' targeted':''}" data-tile="${tile.id}" style="--x:${tile.x};--y:${tile.y};--z:${tile.z+1};--rotate:${((tile.id*7)%5)-2}deg" aria-label="${ANIMALS[tile.type].name}${open?' 선택':' · 위의 동물부터 선택하세요'}" ${open?'':'disabled'} title="${ANIMALS[tile.type].name}${open?'':' · 다른 타일에 가려져 있어요'}">${animal(tile.type)}</button>`;
  }).join('');
  if(focusedId) {
    const next=$('board').querySelector(`[data-tile="${focusedId}"]:not(:disabled)`)||$('board').querySelector('.tile:not(:disabled)');
    next?.focus({preventScroll:true});
  }
  const ordered=state.tray.slice().sort((a,b)=>a.type-b.type);
  $('tray').style.setProperty('--slots',state.capacity);
  $('tray').innerHTML=Array.from({length:state.capacity},(_,i)=>`<div class="tray-slot${ordered[i]?' filled':''}" aria-label="${ordered[i]?ANIMALS[ordered[i].type].name:'빈칸'}">${ordered[i]?animal(ordered[i].type):''}</div>`).join('');
  $('tray').classList.toggle('danger',state.tray.length>=state.capacity-2);
  $('tray-count').textContent=`${state.tray.length} / ${state.capacity}`;
  $('remaining').textContent=`${state.board.length} friends`;
  $('board-caption').textContent=state.target?'반짝이는 동물을 골라 톡톡!':'가려지지 않은 동물을 찾아보세요';
}
function renderHUD() {
  const seconds=Math.ceil(state.time);
  $('timer').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  $('timer-box').classList.toggle('low',seconds<=20&&!state.fever&&!state.frozen);
  $('timer-effect').textContent=state.fever>0?'피버 · 시간 정지':state.frozen>0?`눈꽃 · ${Math.ceil(state.frozen)}초`:state.mode==='tutorial'?'천천히 배워요':'남은 시간';
  $('rescued').textContent=state.saved;$('total').textContent=state.total;
  $('rescue-progress').style.width=`${state.saved/state.total*100}%`;
  $('score').textContent=state.score.toLocaleString();
  $('combo').textContent=state.combo>1?`${state.combo} COMBO! ${state.fever>0?'× 2':''}`:'오늘도, 한 걸음씩';
  $('fever-label').textContent=state.fever>0?'FEVER · 점수 2배':'숲의 설렘';
  $('fever-count').textContent=state.fever>0?`${Math.ceil(state.fever)}s`:`${Math.floor(state.charge)}%`;
  $('fever-progress').style.width=`${state.fever>0?state.fever/12*100:state.charge}%`;
  document.querySelector('.game-shell').classList.toggle('is-fever',state.fever>0);
}
function renderItems() {
  $('items').innerHTML=ITEMS.map(item=>`<button class="item${selectedItem===item.id?' selected':''}${requiredItem()===item.id&&!state.used[item.id]?' recommended':''}${!profile.inventory[item.id]&&state.mode!=='tutorial'?' empty':''}" data-item="${item.id}" aria-label="${item.name} · ${state.mode==='tutorial'?'수업에서 무료':profile.inventory[item.id]+'개 보유'}" title="${item.desc}">${icon(item.icon)}<b>${item.name}</b><small>${state.mode==='tutorial'?'∞':profile.inventory[item.id]}</small></button>`).join('');
  $('coins').textContent=profile.coins.toLocaleString();
}
function render() {
  $('stage-label').textContent=state.mode==='tutorial'?`FOREST SCHOOL · ${String(state.lesson+1).padStart(2,'0')} / 11`:`ENDLESS WALK · ${String(state.level).padStart(2,'0')}`;
  const forests=['햇살 머무는 숲','도토리 오솔길','반딧불 정원','산들바람 언덕','달빛 호숫가','별이 쉬는 숲'];
  $('stage-title').textContent=state.mode==='tutorial'?LESSONS[state.lesson].title:forests[(state.level-1)%forests.length];
  $('best').textContent=profile.best.toLocaleString();$('best-level').textContent=String(profile.level).padStart(2,'0');
  for(const mode of ['endless','tutorial']) {const el=$(`${mode}-mode`);el.classList.toggle('active',state.mode===mode);el.setAttribute('aria-pressed',String(state.mode===mode));}
  $('lesson-banner').hidden=state.mode!=='tutorial';
  if(state.mode==='tutorial') {
    const lesson=LESSONS[state.lesson];
    $('lesson-icon').innerHTML=icon(lesson.item||'leaf');
    $('lesson-heading').textContent=`${state.lesson+1}교시 · ${lesson.title}`;
    $('lesson-text').textContent=lesson.text;
    $('lesson-check').textContent=lessonReady()?'✓ 배웠어요':'사용해봐요';
  }
  renderBoard();renderHUD();renderItems();
}
function burst(rect,points=null,large=false) {
  if(reducedMotion||!rect) return;
  const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
  const colors=['#ebcd7d','#d5ab93','#b4c890','#eee8b5','#c1b2d4'];
  const count=large?32:15;
  for(let i=0;i<count;i++) {
    const particle=document.createElement('i'),angle=Math.random()*Math.PI*2,distance=30+Math.random()*(large?150:80);
    particle.className='particle';particle.style.cssText=`--px:${x}px;--py:${y}px;--dx:${Math.cos(angle)*distance}px;--dy:${Math.sin(angle)*distance+20}px;--spin:${Math.random()*480}deg;--color:${colors[i%colors.length]};--size:${4+Math.random()*6}px;--radius:${i%2?'50%':'2px'}`;
    $('effects').append(particle);setTimeout(()=>particle.remove(),750);
  }
  if(points) {
    const pop=document.createElement('b');pop.className='score-pop';pop.style.cssText=`--px:${x}px;--py:${y}px`;pop.textContent=`+${points.toLocaleString()}`;
    $('effects').append(pop);setTimeout(()=>pop.remove(),1000);
  }
}
function fly(tile,rect) {
  if(reducedMotion||!rect) return;
  const target=$('tray').getBoundingClientRect(),el=document.createElement('div');
  el.className='flying-tile';el.style.cssText=`left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
  el.innerHTML=animal(tile.type);$('effects').append(el);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{el.style.transform=`translate(${target.left+target.width/2-rect.left-rect.width/2}px,${target.top-rect.top}px) scale(.8)`;el.style.opacity='.1';}));
  setTimeout(()=>el.remove(),280);
}
function effects(result,rect=null) {
  if(result.match) {
    sound(result.feverStarted?'fever':'match');vibrate([15,20,25]);
    burst(rect||$('tray').getBoundingClientRect(),result.points,result.feverStarted);
    const shell=document.querySelector('.game-shell');shell.classList.remove('impact');void shell.offsetWidth;shell.classList.add('impact');
    setMessage(`${ANIMALS[result.type].name} 친구들이 집으로 돌아갔어요! +${result.points}점${result.combo>1?' · '+result.combo+'콤보':''}`);
  } else if(result.item) {sound('item');vibrate(10);burst($('fever-progress').getBoundingClientRect());}
  else {sound();vibrate(7);}
  if(result.feverStarted) {
    const flash=$('fever-flash');flash.classList.remove('show');void flash.offsetWidth;flash.classList.add('show');
    toast('숲이 들썩들썩! 12초 피버 · 점수 2배');
  }
}
function handleResult(result,rect=null) {
  render();effects(result,rect);persist();
  if(state.status!=='playing') {
    clearTimeout(resultTimer);resultTimer=setTimeout(()=>endGame(),state.status==='won'?650:250);
  } else if(state.tray.length>=state.capacity-2) setMessage('바구니가 좁아졌어요. 같은 친구를 모으거나 아이템을 써보세요.');
}
function playTile(id,el) {
  if($('modal').open||state.status!=='playing') return;
  const tile=state.board.find(t=>t.id===id);if(!tile) return;
  if(state.target==='hammer') {activateItem('hammer',id);return;}
  // Each school lesson requires using its item before the last match.
  if(!lessonReady()&&state.board.length+state.tray.length===3&&state.tray.length===2) {
    toast('이번 수업의 아이템을 먼저 사용해봐요.');openItem(requiredItem());return;
  }
  const rect=el.getBoundingClientRect(),result=pick(state,id);
  if(!result.ok) return;
  fly(tile,rect);
  if(!result.match) setMessage(state.tray.length===1?'좋아요! 같은 동물 2마리를 더 찾아보세요.':'같은 동물 3마리가 모이면 바구니가 비워져요.');
  handleResult(result,result.match?$('tray').getBoundingClientRect():null);
}
$('board').addEventListener('click',event=>{const tile=event.target.closest('[data-tile]');if(tile) playTile(Number(tile.dataset.tile),tile);});
$('board').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
  const current=state.board.find(t=>t.id===Number(event.target.dataset.tile));if(!current) return;
  event.preventDefault();const dx=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0,dy=event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0;
  const candidates=available(state).filter(t=>(dx?(t.x-current.x)*dx:(t.y-current.y)*dy)>.1);
  candidates.sort((a,b)=>Math.hypot(a.x-current.x,a.y-current.y)+Math.abs(dx?a.y-current.y:a.x-current.x)*2-Math.hypot(b.x-current.x,b.y-current.y)-Math.abs(dx?b.y-current.y:b.x-current.x)*2);
  if(candidates[0]) $('board').querySelector(`[data-tile="${candidates[0].id}"]`)?.focus();
});

function showModal(content,{closable=true}={}) {
  const modal=$('modal');
  if(modal.open) modal.close();
  $('modal-content').innerHTML=`<div class="modal-body">${closable?`<button class="modal-close" data-action="close" aria-label="닫기">${icon('close')}</button>`:''}${content}</div>`;
  modal.showModal();
}
function closeModal() {$('modal').close();lastTick=performance.now();}
$('modal').addEventListener('cancel',event=>{if(state.status!=='playing') event.preventDefault();});
$('modal').addEventListener('close',()=>{lastTick=performance.now();});

function begin({mode=state.mode,level=state.level,lesson=state.lesson,seed}={}) {
  clearTimeout(resultTimer);selectedItem=null;
  state=createGame({mode,level,lesson,seed});closeModal();render();
  setMessage(mode==='tutorial'?'천천히, 같은 친구 3마리를 모아보세요.':'같은 동물 3마리를 모아 집으로 보내주세요.');
  profile.welcomed=true;persist();lastTick=performance.now();
  if(mode==='tutorial'&&requiredItem()) toast(`${state.lesson+1}교시 · ${LESSONS[state.lesson].title}을 사용해보세요.`);
}
function openWelcome() {
  showModal(`<p class="eyebrow">WELCOME TO COZY FOREST</p><div class="mascot trio">${animal(1)+animal(0)+animal(2)}</div><h2>잠깐, 숲에 쉬어갈까요?</h2><p>동물 친구 셋을 모아 집으로 보내주세요.<br>바구니가 가득 차기 전에, 톡 톡 톡!</p><button class="primary-button" data-action="resume">${resumed?'이어서 산책하기':'산책 시작하기'} ${icon('play')}</button><button class="secondary-button" data-action="school">처음이라면 · 숲속 학교</button><p class="tiny-note">설치 없이 · 터치와 클릭으로 · 기록은 자동 저장</p>`);
}
function openSchool() {
  showModal(`<p class="eyebrow">FOREST SCHOOL</p><h2>숲에서 배우는 작은 요령</h2><p>한 번에 하나씩, 직접 써보며 배워요.<br>수업에서는 모든 아이템을 무료로 사용할 수 있어요.</p><div class="lesson-list">${LESSONS.map((lesson,i)=>`<button class="lesson-link" data-action="lesson" data-lesson="${i}">${icon(lesson.item||'leaf')}<b>${String(i+1).padStart(2,'0')} · ${lesson.title}</b><small>${profile.lessons[i]?'✓ 수료':'배우기 ↗'}</small></button>`).join('')}</div><button class="secondary-button" data-action="endless">끝없는 산책으로 가기</button>`);
}
function itemPossible(id) {
  if(['undo','basket'].includes(id)&&!state.tray.length) return '바구니에 동물을 먼저 담아주세요.';
  if(id==='shuffle'&&state.tray.length===state.capacity-1&&state.tray.every(tile=>state.tray.filter(t=>t.type===tile.type).length===1)) return '빈칸이 하나이고 모두 다른 동물이에요. 자석이나 구조 바구니를 먼저 사용해요.';
  if(id==='slot'&&state.capacity>=10) return '바구니는 최대 10칸까지 늘릴 수 있어요.';
  if(state.status!=='playing') return '다음 산책에서 사용할 수 있어요.';
  return '';
}
function openItem(id) {
  const item=ITEMS.find(i=>i.id===id);if(!item) return;
  selectedItem=id;renderItems();
  $('item-detail').innerHTML=`${icon(item.icon)}<p>${item.desc}</p>`;
  const free=state.mode==='tutorial',quantity=profile.inventory[id],reason=itemPossible(id);
  showModal(`<p class="eyebrow">A LITTLE HELP · ${String(ITEMS.indexOf(item)+1).padStart(2,'0')}</p><div class="item-hero">${icon(item.icon)}</div><h2>${item.name}</h2><p>${item.desc}</p><div class="modal-stats"><div><small>${free?'수업에서 무료':'내 가방'}</small><b>${free?'∞':quantity}</b></div><div><small>보유 도토리</small><b>${profile.coins}</b></div></div>${reason?`<p class="tiny-note">${reason}</p>`:''}<button class="primary-button" data-action="use-item" data-item="${id}" ${reason||(!free&&!quantity)?'disabled':''}>${id==='hammer'?'동물 선택하기':'지금 사용하기'}${free?' · 수업 무료':''}</button>${free?'':`<button class="secondary-button" data-action="buy-item" data-item="${id}" ${profile.coins<item.cost?'disabled':''}>${icon('coin')} ${item.cost} 도토리 · 1개 채우기</button>`}<p class="tiny-note">도토리는 스테이지를 완료하면 모을 수 있어요.</p>`);
}
function activateItem(id,target=null) {
  if(state.mode!=='tutorial'&&!profile.inventory[id]) return;
  if(id==='hammer'&&target===null) {
    closeModal();state.target='hammer';render();
    $('message').innerHTML='톡톡 구조할 동물을 골라주세요. <button class="target-cancel" id="cancel-target">취소</button>';
    $('cancel-target').addEventListener('click',()=>{state.target=null;render();setMessage('다시 친구들을 모아볼까요?');});
    return;
  }
  const result=useItem(state,id,target);
  if(!result.ok) {toast(result.reason==='max'?'바구니는 최대 10칸이에요.':'지금은 쓸 수 없어요. 바구니에 동물을 담아보세요.');return;}
  state.target=null;
  if(state.mode!=='tutorial') profile.inventory[id]--;
  closeModal();setMessage(`${ITEMS.find(i=>i.id===id).name} 사용! ${id==='hint'?'반짝이는 동물을 찾아보세요.':'숲의 도움을 받았어요.'}`);
  handleResult(result);
}
$('items').addEventListener('click',event=>{const item=event.target.closest('[data-item]');if(item) openItem(item.dataset.item);});

function endGame() {
  if(state.status==='playing') return;
  const won=state.status==='won';
  if(won&&!state.rewarded) {
    state.rewarded=true;
    if(state.mode==='tutorial') {
      if(!profile.lessons[state.lesson]) {profile.coins+=10;profile.lessons[state.lesson]=true;}
    } else {
      profile.best=Math.max(profile.best,state.score);profile.level=Math.max(profile.level,state.level+1);
      state.reward=30+Math.min(30,Math.floor(state.score/1000)*5);profile.coins+=state.reward;
      const gift=ITEMS[(state.level-1)%ITEMS.length];profile.inventory[gift.id]++;state.gift=gift.id;
    }
    render();persist();sound('win');burst($('forest').getBoundingClientRect(),null,true);
  }
  if(won&&state.mode==='tutorial') {
    const done=state.lesson===LESSONS.length-1;
    showModal(`<p class="eyebrow">FOREST SCHOOL · LESSON COMPLETE</p><div class="mascot">${animal(state.lesson%ANIMALS.length)}</div><h2>${done?'숲속 학교, 졸업!':'참 잘했어요!'}</h2><p>${done?'아이템 10종을 모두 배웠어요.<br>이제 끝없는 숲으로 산책을 떠나볼까요?':`${LESSONS[state.lesson].title} 수업을 마쳤어요.<br>다음 수업에서도 새로운 요령을 배워봐요.`}</p><div class="modal-stats"><div><small>수료한 수업</small><b>${profile.lessons.filter(Boolean).length} / 11</b></div><div><small>이번 점수</small><b>${state.score.toLocaleString()}</b></div></div><button class="primary-button" data-action="${done?'endless':'next-lesson'}">${done?'끝없는 산책 시작':'다음 수업으로'} →</button><button class="secondary-button" data-action="school">수업 목록 보기</button>`,{closable:false});
  } else if(won) {
    showModal(`<p class="eyebrow">STAGE ${String(state.level).padStart(2,'0')} · ALL FRIENDS HOME</p><div class="mascot trio">${animal(0)+animal(1)+animal(4)}</div><h2>모두 집으로 돌아갔어요!</h2><p>당신 덕분에 숲이 한 뼘 더 포근해졌어요.<br>다음 오솔길에는 어떤 친구들이 기다릴까요?</p><div class="modal-stats"><div><small>산책 점수</small><b>${state.score.toLocaleString()}</b></div><div><small>도토리</small><b>+${state.reward}</b></div><div><small>남은 시간</small><b>${Math.ceil(state.time)}s</b></div></div><p class="tiny-note">선물 · ${ITEMS.find(i=>i.id===state.gift)?.name} 1개</p><button class="primary-button" data-action="next-stage">다음 숲으로 · ${state.level+1} →</button><button class="secondary-button" data-action="retry">이 숲 다시 산책하기</button>`,{closable:false});
  } else {
    if(state.mode==='endless') {profile.best=Math.max(profile.best,state.score);persist();render();}
    showModal(`<p class="eyebrow">TAKE A BREATH, TRY AGAIN</p><div class="mascot">${animal(2)}</div><h2>${state.time<=0?'해가 저물었어요':'바구니가 가득 찼어요'}</h2><p>잠깐 숨을 고르고 다시 걸어볼까요?<br>${state.time<=0?'눈꽃 시계나 꿀 한 스푼으로 시간을 벌어보세요.':'바구니에 있는 친구의 짝을 먼저 찾아보세요.'}</p><div class="modal-stats"><div><small>산책 점수</small><b>${state.score.toLocaleString()}</b></div><div><small>돌아간 친구</small><b>${state.saved} / ${state.total}</b></div></div><button class="primary-button" data-action="retry">같은 숲에 다시 도전</button><button class="secondary-button" data-action="new-board">새로운 배치로 산책</button><button class="text-button" data-action="school">숲속 학교에서 요령 배우기 ↗</button>`,{closable:false});
  }
}
function openPause() {
  if(state.status!=='playing') return;
  persist();
  showModal(`<p class="eyebrow">A MOMENT OF REST</p><div class="mascot">${animal(3)}</div><h2>숲도 잠깐 쉬는 중</h2><p>시간은 멈춰 있어요.<br>준비되면 이어서 산책해요.</p><div class="settings-row"><span>숲의 효과음</span><button data-action="sound">${profile.sound?'켜짐':'꺼짐'}</button></div><div class="settings-row"><span>터치 진동 · 지원 기기</span><button data-action="haptics">${profile.haptics?'켜짐':'꺼짐'}</button></div><button class="primary-button" data-action="resume">이어서 산책하기 ${icon('play')}</button><button class="secondary-button" data-action="restart-menu">다시 시작하기</button><button class="text-button" data-action="school">숲속 학교 & 아이템 도감 ↗</button>`);
}
function openHelp() {
  showModal(`<p class="eyebrow">HOW TO WANDER</p><div class="mascot">${animal(0)}</div><h2>셋이 만나면, 포근해져요.</h2><ol class="rules-list"><li>위에 다른 타일이 없는 밝은 동물을 눌러요.</li><li>바구니에 같은 동물 3마리를 모으면 구조 성공!</li><li>바구니 7칸이 가득 차거나 시간이 끝나면 다시 도전해요.</li><li>6초 안에 연속 매칭하면 콤보 점수가 올라요.</li><li>매칭 4번으로 12초 피버! 점수 2배, 시간 정지, 매칭할 때마다 제한 시간 +2초.</li><li>모든 친구를 구조하면 다음 숲과 도토리, 아이템 선물을 받아요.</li></ol><p class="tiny-note">시간은 도움말·아이템 창·다른 탭을 보는 동안 멈춰요.<br>키보드: Tab / 방향키로 동물 선택 · Enter로 담기 · Esc로 쉬기<br>소리는 오른쪽 위에서 켤 수 있어요.</p><button class="primary-button" data-action="resume">알겠어요, 산책할게요</button><button class="secondary-button" data-action="school">숲속 학교에서 직접 배우기</button>`);
}
function updateSound() {
  $('sound').innerHTML=icon(profile.sound?'sound':'mute');
  $('sound').setAttribute('aria-label',profile.sound?'소리 끄기':'소리 켜기');$('sound').setAttribute('aria-pressed',String(profile.sound));$('sound').title=profile.sound?'소리 끄기':'소리 켜기';
}
function toggleSound() {profile.sound=!profile.sound;updateSound();if(profile.sound) sound('item');persist();}
$('sound').addEventListener('click',toggleSound);$('help').addEventListener('click',openHelp);$('pause').addEventListener('click',openPause);
$('tutorial-mode').addEventListener('click',openSchool);$('mobile-lessons').addEventListener('click',openSchool);$('item-guide').addEventListener('click',openSchool);
$('endless-mode').addEventListener('click',()=>{
  if(state.mode==='endless') {openPause();return;}
  showModal(`<p class="eyebrow">ENDLESS WALK</p><div class="mascot">${animal(1)}</div><h2>끝없는 숲으로 떠나요</h2><p>현재 수업에서 나와 ${profile.level}번째 숲으로 떠나요.<br>수료한 수업과 아이템은 가방에 남아 있어요.</p><button class="primary-button" data-action="endless">끝없는 산책 시작 →</button><button class="secondary-button" data-action="resume">이 수업 계속하기</button>`);
});
$('mobile-items').addEventListener('click',()=>{$('item-panel').scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'center'});toast('가방에서 아이템을 골라보세요.');});
$('modal').addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button||button.disabled) return;
  const action=button.dataset.action;
  if(action==='close'||action==='resume') {
    if(state.status!=='playing') {endGame();return;}
    profile.welcomed=true;closeModal();persist();
  }
  else if(action==='school') openSchool();
  else if(action==='lesson') begin({mode:'tutorial',lesson:Number(button.dataset.lesson)});
  else if(action==='endless') begin({mode:'endless',level:profile.level});
  else if(action==='next-stage') begin({mode:'endless',level:state.level+1});
  else if(action==='next-lesson') begin({mode:'tutorial',lesson:state.lesson+1});
  else if(action==='retry') begin({seed:state.seed});
  else if(action==='new-board') begin();
  else if(action==='use-item') activateItem(button.dataset.item);
  else if(action==='buy-item') {
    const item=ITEMS.find(i=>i.id===button.dataset.item);
    if(profile.coins>=item.cost) {profile.coins-=item.cost;profile.inventory[item.id]++;sound('item');persist();renderItems();openItem(item.id);toast(`${item.name} 1개를 가방에 넣었어요.`);}
  } else if(action==='sound') {toggleSound();openPause();}
  else if(action==='haptics') {profile.haptics=!profile.haptics;persist();openPause();}
  else if(action==='restart-menu') showModal(`<p class="eyebrow">A FRESH WALK</p><h2>새로 산책해볼까요?</h2><p>현재 스테이지의 점수와 배치가 초기화돼요.<br>가방의 아이템과 도토리는 유지돼요.</p><button class="primary-button" data-action="new-board">새로운 배치로 다시 시작</button><button class="secondary-button" data-action="resume">이어서 산책하기</button>`);
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('modal').open) {event.preventDefault();openPause();}});
document.addEventListener('visibilitychange',()=>{
  lastTick=performance.now();
  if(document.hidden) {persist();if(audioContext?.state==='running') audioContext.suspend();}
  else {if(profile.sound&&audioContext?.state==='suspended') audioContext.resume().catch(()=>{});}
});
window.addEventListener('pagehide',persist);
setInterval(()=>{
  const now=performance.now(),dt=Math.min(.5,(now-lastTick)/1000);lastTick=now;
  if(document.hidden||$('modal').open||state.status!=='playing') return;
  tick(state,dt);renderHUD();saveClock+=dt;
  if(saveClock>=5) {saveClock=0;persist();}
  if(state.status==='lost') endGame();
},100);
render();updateSound();
if(resumed||!profile.welcomed) openWelcome();
persist();
