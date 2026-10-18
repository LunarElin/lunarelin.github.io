import {ANIMALS, ITEMS, LESSONS, createGame, isOpen, available, pick, tick, validSave} from './rules.mjs';
import {animal, icon, scenery} from './art.mjs';

const $=id=>document.getElementById(id);
const KEY='cozy-forest:v1';
const freshProfile=()=>({schoolVersion:2,best:0,level:1,coins:150,lessons:[],sound:true,haptics:true,welcomed:false});
let profile=freshProfile(),state,selectedItem=null,audioContext,toastTimer,saveClock=0,lastTick=performance.now(),resultTimer,lastAmbient=0,hadFever=false,updatedRound=false;
let storageAvailable=true;
try {
  const saved=JSON.parse(localStorage.getItem(KEY)||'null');
  if(saved?.profile) {
    const p=saved.profile;
    for(const key of ['best','coins']) if(Number.isFinite(p[key])&&p[key]>=0) profile[key]=Math.floor(p[key]);
    if(Number.isInteger(p.level)&&p.level>0) profile.level=p.level;
    const lessonMap=p.schoolVersion===2?[0,1,2,3,4,5]:[0,1,3,6,9,10];
    profile.lessons=lessonMap.map(i=>p.lessons?.[i]===true);
    for(const key of ['sound','haptics','welcomed']) if(typeof p[key]==='boolean') profile[key]=p[key];
  }
  if(validSave(saved?.active)) state=saved.active;
  else if(saved?.active?.version===1) updatedRound=true;
} catch {storageAvailable=false;}
const resumed=!!state;
state??=createGame({level:profile.level});
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

document.querySelectorAll('[data-icon]').forEach(el=>{el.outerHTML=icon(el.dataset.icon);});
$('scenery').innerHTML=scenery;
$('intro-animals').innerHTML=animal(1)+animal(0)+animal(2);
$('fever-stars').innerHTML=Array.from({length:12},(_,i)=>`<i style="--sx:${4+(i*29)%92}%;--sy:${8+(i*19)%83}%;--delay:${-i*.37}s;--duration:${2.3+(i%4)*.4}s">✦</i>`).join('');

function persist() {
  try {localStorage.setItem(KEY,JSON.stringify({profile,active:state.status==='playing'?state:null}));}
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
    const notes=kind==='fever-match'?[659,988,1319,1568]:kind==='match'?[523.25,659.25,783.99]:kind==='fever'?[392,523,659,784,1046,1568]:kind==='win'?[523,659,784,1046,1319]:kind==='item'?[440,660,880]:[350+state.tray.length*70];
    notes.forEach((frequency,i)=>{
      const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),start=audioContext.currentTime+i*.065;
      oscillator.type=kind==='tap'?'sine':'triangle';oscillator.frequency.setValueAtTime(frequency,start);
      if(kind==='tap') oscillator.frequency.exponentialRampToValueAtTime(frequency*1.4,start+.06);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(kind==='tap'?.05:.075,start+.008);gain.gain.exponentialRampToValueAtTime(.001,start+.32);
      oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(start);oscillator.stop(start+.35);
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
    const open=isOpen(state.board,tile),item=tile.item?ITEMS.find(item=>item.id===tile.item):null;
    const name=item?`${item.name} 아이템`:ANIMALS[tile.type].name,lessonItem=item&&requiredItem()===item.id&&!state.used[item.id];
    return `<button class="tile${open?'':' covered'}${item?' item-tile':''}${lessonItem?' hinted':''}" data-tile="${tile.id}" ${item?`data-board-item="${item.id}"`:''} style="--x:${tile.x};--y:${tile.y};--z:${tile.z+1};--rotate:${((tile.id*7)%5)-2}deg;${item?'--item-color:'+item.color:''}" aria-label="${name}${open?(item?' · 누르면 즉시 발동':' 선택'):' · 위의 타일부터 선택하세요'}" ${open?'':'disabled'} title="${name}${open?'':' · 다른 타일에 가려져 있어요'}">${item?`${icon(item.icon)}<span class="board-item-badge">아이템</span><i>✦</i>`:animal(tile.type)}</button>`;
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
  $('remaining').textContent=`${state.board.filter(t=>!t.item).length} friends · ${state.board.filter(t=>t.item).length} items`;
  $('board-caption').textContent='동물도, 아이템도! 가려지지 않은 타일을 톡';
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
  $('fever-clock').textContent=`${state.fever.toFixed(1)}s`;
  $('fever-earned').textContent=`+${state.feverScore.toLocaleString()}`;
  document.querySelector('.game-shell').classList.toggle('fever-finale',state.fever>0&&state.fever<=3);
  if(hadFever&&!state.fever) toast(`피버 피날레! 보너스 ${state.feverScore.toLocaleString()}점`);
  hadFever=state.fever>0;
}
function renderItems() {
  $('items').innerHTML=ITEMS.map(item=>`<article class="item-explainer${selectedItem===item.id?' selected':''}${requiredItem()===item.id&&!state.used[item.id]?' recommended':''}" data-item-info="${item.id}">${icon(item.icon)}<div><h3>${item.name}<small>${state.board.filter(t=>t.item===item.id).length?'보드에 있어요':state.used[item.id]?'✓ 발견':'숲에서 발견'}</small></h3><p>${item.desc}</p></div></article>`).join('');
  $('coins').textContent=profile.coins.toLocaleString();
}
function render() {
  $('stage-label').textContent=state.mode==='tutorial'?`FOREST SCHOOL · ${String(state.lesson+1).padStart(2,'0')} / ${LESSONS.length}`:`ENDLESS WALK · ${String(state.level).padStart(2,'0')}`;
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
    $('lesson-check').textContent=lessonReady()?'✓ 배웠어요':'보드에서 톡!';
  }
  renderBoard();renderHUD();renderItems();
}
function burst(rect,points=null,large=false,result=null) {
  if(reducedMotion||!rect) return;
  const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
  const fever=state.fever>0,colors=fever?['#ffcf57','#ff9eb7','#fff3ad','#b6a1ef','#a4e4d0']:['#edce77','#e7a58d','#b4cf87','#fff1ae','#c7afe0'];
  const count=large?85:fever?65:35;
  for(let i=0;i<count;i++) {
    const particle=document.createElement('i'),angle=Math.random()*Math.PI*2,distance=45+Math.random()*(large?240:fever?190:125);
    particle.className=`particle${i%4===0?' star-particle':''}`;particle.style.cssText=`--px:${x}px;--py:${y}px;--dx:${Math.cos(angle)*distance}px;--dy:${Math.sin(angle)*distance-25}px;--spin:${Math.random()*720}deg;--color:${colors[i%colors.length]};--size:${5+Math.random()*(fever?12:8)}px;--radius:${i%2?'50%':'2px'}`;
    $('effects').append(particle);setTimeout(()=>particle.remove(),1050);
  }
  const ring=document.createElement('i');ring.className=`shockwave${fever?' fever-ring':''}`;ring.style.cssText=`--px:${x}px;--py:${y}px;--ring-size:${fever?240:160}px`;$('effects').append(ring);setTimeout(()=>ring.remove(),800);
  if(points) {
    const pop=document.createElement('div');pop.className=`score-pop${fever?' fever-score':''}`;pop.style.cssText=`--px:${x}px;--py:${y-20}px`;
    pop.innerHTML=`<small>${result?.itemPickup?'ITEM GET!':result?.multiplier===2?'FEVER BONUS ×2':state.combo>1?state.combo+' COMBO!':'NICE MATCH!'}</small><b>+${points.toLocaleString()}</b>${result?.timeBonus?'<em>TIME +'+result.timeBonus+'s</em>':''}`;
    $('effects').append(pop);setTimeout(()=>pop.remove(),1300);
  }
  while($('effects').children.length>180) $('effects').firstElementChild.remove();
}
function feverAmbient() {
  if(reducedMotion) return;
  const rect=$('forest').getBoundingClientRect();
  for(let i=0;i<3;i++) {
    const spark=document.createElement('i');spark.className='fever-mote';spark.textContent='✦';
    spark.style.cssText=`left:${rect.left+Math.random()*rect.width}px;top:${rect.bottom-15}px;--rise:${rect.height*(.5+Math.random()*.4)}px;--drift:${Math.random()*100-50}px`;
    $('effects').append(spark);setTimeout(()=>spark.remove(),1800);
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
    sound(result.feverStarted?'fever':result.multiplier===2?'fever-match':'match');vibrate(result.multiplier===2?[30,25,50]:[20,20,30]);
    burst(rect||$('tray').getBoundingClientRect(),result.points,result.feverStarted,result);
    const shell=document.querySelector('.game-shell');shell.classList.remove('impact');void shell.offsetWidth;shell.classList.add('impact');
    const score=$('score');score.classList.remove('score-hit');void score.offsetWidth;score.classList.add('score-hit');
    if(result.multiplier===2) {const forest=$('forest');forest.classList.remove('fever-hit');void forest.offsetWidth;forest.classList.add('fever-hit');}
    setMessage(`${ANIMALS[result.type].name} 친구들이 집으로 돌아갔어요! +${result.points}점${result.combo>1?' · '+result.combo+'콤보':''}`);
  } else if(result.itemPickup) {sound('item');vibrate([15,15,25]);burst(rect,result.points,true,result);}
  else {
    sound();vibrate(9);
    if(!reducedMotion&&rect) {const ring=document.createElement('i');ring.className='tap-ring';ring.style.cssText=`left:${rect.left+rect.width/2}px;top:${rect.top+rect.height/2}px`;$('effects').append(ring);setTimeout(()=>ring.remove(),350);}
  }
  if(result.itemPickup) {
    selectedItem=result.item;
    renderItems();
    const item=ITEMS.find(item=>item.id===result.item);
    $('item-detail').innerHTML=`${icon(item.icon)}<p><b>${item.name} 발견!</b><br>${item.tip}</p>`;
    setMessage(`${item.name} 발동! +${result.points}점${result.timeBonus?' · 시간 +'+result.timeBonus+'초':''}`);
  }
  if(result.feverStarted) {
    const shell=document.querySelector('.game-shell');shell.classList.remove('impact');void shell.offsetWidth;shell.classList.add('impact');
    const flash=$('fever-flash');flash.classList.remove('show');void flash.offsetWidth;flash.classList.add('show');
    burst($('forest').getBoundingClientRect(),null,true);toast('FEVER TIME! 12초 동안 점수 2배 · 시간 정지');
  }
}
function handleResult(result,rect=null) {
  grantRewards();
  render();effects(result,rect);persist();
  if(state.status!=='playing') {
    clearTimeout(resultTimer);resultTimer=setTimeout(()=>endGame(),state.status==='won'?650:250);
  } else if(!lessonReady()&&!state.board.some(t=>!t.item)) setMessage('친구들은 모두 구조했어요! 보드에 남은 수업 아이템도 눌러보세요.');
  else if(state.tray.length>=state.capacity-2) setMessage('바구니가 좁아졌어요. 같은 친구를 모으거나 보드의 아이템을 찾아보세요.');
}
function playTile(id,el) {
  if($('modal').open||state.status!=='playing') return;
  const tile=state.board.find(t=>t.id===id);if(!tile) return;
  const rect=el.getBoundingClientRect(),result=pick(state,id);
  if(!result.ok) return;
  if(!tile.item) fly(tile,rect);
  if(!result.match&&!tile.item) setMessage(state.tray.length===1?'좋아요! 같은 동물 2마리를 더 찾아보세요.':'같은 동물 3마리가 모이면 바구니가 비워져요.');
  handleResult(result,result.match?$('tray').getBoundingClientRect():rect);
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
  $('modal-content').querySelector('h2')?.setAttribute('id','modal-title');
  modal.showModal();
  document.body.classList.add('effects-paused');
}
function closeModal() {$('modal').close();lastTick=performance.now();}
$('modal').addEventListener('cancel',event=>{if(state.status!=='playing') event.preventDefault();});
$('modal').addEventListener('close',()=>{lastTick=performance.now();document.body.classList.toggle('effects-paused',document.hidden);});

function begin({mode=state.mode,level=state.level,lesson=state.lesson,seed}={}) {
  clearTimeout(resultTimer);selectedItem=null;hadFever=false;
  state=createGame({mode,level,lesson,seed});closeModal();render();
  setMessage(mode==='tutorial'?'천천히, 같은 친구 3마리를 모아보세요.':'같은 동물 3마리를 모아 집으로 보내주세요.');
  profile.welcomed=true;persist();lastTick=performance.now();
  if(mode==='tutorial'&&requiredItem()) toast(`${state.lesson+1}교시 · ${LESSONS[state.lesson].title}을 사용해보세요.`);
}
function openWelcome() {
  showModal(`<p class="eyebrow">WELCOME TO COZY FOREST</p><div class="mascot trio">${animal(1)+animal(0)+animal(2)}</div><h2>잠깐, 숲에 쉬어갈까요?</h2><p>동물 친구 셋을 모아 집으로 보내주세요.<br>바구니가 가득 차기 전에, 톡 톡 톡!</p><button class="primary-button" data-action="resume">${resumed?'이어서 산책하기':'산책 시작하기'} ${icon('play')}</button><button class="secondary-button" data-action="school">처음이라면 · 숲속 학교</button><p class="tiny-note">설치 없이 · 터치와 클릭으로 · 기록은 자동 저장</p>`);
}
function openSchool() {
  showModal(`<p class="eyebrow">FOREST SCHOOL</p><h2>숲에서 배우는 작은 요령</h2><p>한 번에 하나씩, 직접 써보며 배워요.<br>보드에 나타나는 아이템을 직접 눌러 배워요.</p><div class="lesson-list">${LESSONS.map((lesson,i)=>`<button class="lesson-link" data-action="lesson" data-lesson="${i}">${icon(lesson.item||'leaf')}<b>${String(i+1).padStart(2,'0')} · ${lesson.title}</b><small>${profile.lessons[i]?'✓ 수료':'배우기 ↗'}</small></button>`).join('')}</div><button class="secondary-button" data-action="endless">끝없는 산책으로 가기</button>`);
}
function grantRewards() {
  if(state.status==='won'&&!state.rewarded) {
    state.rewarded=true;
    if(state.mode==='tutorial') {
      if(!profile.lessons[state.lesson]) {profile.coins+=10;profile.lessons[state.lesson]=true;}
    } else {
      profile.best=Math.max(profile.best,state.score);profile.level=Math.max(profile.level,state.level+1);
      state.reward=30+Math.min(30,Math.floor(state.score/1000)*5);profile.coins+=state.reward;
    }
  }
}
function endGame() {
  if(state.status==='playing') return;
  const won=state.status==='won';
  if(won&&!state.celebrated) {grantRewards();state.celebrated=true;render();persist();sound('win');burst($('forest').getBoundingClientRect(),null,true);}
  if(won&&state.mode==='tutorial') {
    const done=state.lesson===LESSONS.length-1;
    showModal(`<p class="eyebrow">FOREST SCHOOL · LESSON COMPLETE</p><div class="mascot">${animal(state.lesson%ANIMALS.length)}</div><h2>${done?'숲속 학교, 졸업!':'참 잘했어요!'}</h2><p>${done?'보드 아이템 5종을 모두 배웠어요.<br>이제 끝없는 숲으로 산책을 떠나볼까요?':`${LESSONS[state.lesson].title} 수업을 마쳤어요.<br>다음 수업에서도 새로운 요령을 배워봐요.`}</p><div class="modal-stats"><div><small>수료한 수업</small><b>${profile.lessons.filter(Boolean).length} / ${LESSONS.length}</b></div><div><small>이번 점수</small><b>${state.score.toLocaleString()}</b></div></div><button class="primary-button" data-action="${done?'endless':'next-lesson'}">${done?'끝없는 산책 시작':'다음 수업으로'} →</button><button class="secondary-button" data-action="school">수업 목록 보기</button>`,{closable:false});
  } else if(won) {
    showModal(`<p class="eyebrow">STAGE ${String(state.level).padStart(2,'0')} · ALL FRIENDS HOME</p><div class="mascot trio">${animal(0)+animal(1)+animal(4)}</div><h2>모두 집으로 돌아갔어요!</h2><p>당신 덕분에 숲이 한 뼘 더 포근해졌어요.<br>다음 오솔길에는 어떤 친구들이 기다릴까요?</p><div class="modal-stats"><div><small>산책 점수</small><b>${state.score.toLocaleString()}</b></div><div><small>도토리</small><b>+${state.reward}</b></div><div><small>남은 시간</small><b>${Math.ceil(state.time)}s</b></div></div><p class="tiny-note">숲에서 발견한 아이템 · ${state.itemsCollected}개</p><button class="primary-button" data-action="next-stage">다음 숲으로 · ${state.level+1} →</button><button class="secondary-button" data-action="retry">이 숲 다시 산책하기</button>`,{closable:false});
  } else {
    if(state.mode==='endless') {profile.best=Math.max(profile.best,state.score);persist();render();}
    showModal(`<p class="eyebrow">TAKE A BREATH, TRY AGAIN</p><div class="mascot">${animal(2)}</div><h2>${state.time<=0?'해가 저물었어요':'바구니가 가득 찼어요'}</h2><p>잠깐 숨을 고르고 다시 걸어볼까요?<br>${state.time<=0?'보드의 눈꽃 시계나 별사탕을 먼저 찾아보세요.':'바구니에 있는 친구의 짝을 먼저 찾아보세요.'}</p><div class="modal-stats"><div><small>산책 점수</small><b>${state.score.toLocaleString()}</b></div><div><small>돌아간 친구</small><b>${state.saved} / ${state.total}</b></div></div><button class="primary-button" data-action="retry">같은 숲에 다시 도전</button><button class="secondary-button" data-action="new-board">새로운 배치로 산책</button><button class="text-button" data-action="school">숲속 학교에서 요령 배우기 ↗</button>`,{closable:false});
  }
}
function openPause() {
  if(state.status!=='playing') return;
  persist();
  showModal(`<p class="eyebrow">A MOMENT OF REST</p><div class="mascot">${animal(3)}</div><h2>숲도 잠깐 쉬는 중</h2><p>시간은 멈춰 있어요.<br>준비되면 이어서 산책해요.</p><div class="settings-row"><span>숲의 효과음</span><button data-action="sound">${profile.sound?'켜짐':'꺼짐'}</button></div><div class="settings-row"><span>터치 진동 · 지원 기기</span><button data-action="haptics">${profile.haptics?'켜짐':'꺼짐'}</button></div><button class="primary-button" data-action="resume">이어서 산책하기 ${icon('play')}</button><button class="secondary-button" data-action="restart-menu">다시 시작하기</button><button class="text-button" data-action="school">숲속 학교 & 아이템 도감 ↗</button>`);
}
function openHelp() {
  showModal(`<p class="eyebrow">HOW TO WANDER</p><div class="mascot">${animal(0)}</div><h2>셋이 만나면, 포근해져요.</h2><ol class="rules-list"><li>위에 다른 타일이 없는 밝은 동물을 눌러요.</li><li>바구니에 같은 동물 3마리를 모으면 구조 성공!</li><li>보드의 아이템도 톡! 즉시 발동하며 바구니 칸을 쓰지 않아요. 우측에서 5종의 설명을 볼 수 있어요.</li><li>바구니 7칸이 가득 차거나 시간이 끝나면 다시 도전해요.</li><li>6초 안에 연속 매칭하면 콤보 점수가 올라요.</li><li>빠른 매칭 4번으로 12초 피버! 점수 2배, 시간 정지, 매칭할 때마다 시간 +2초. 보드 위에서 피버 누적 점수도 확인해요.</li><li>모든 친구를 구조하면 다음 숲과 도토리를 받아요.</li></ol><p class="tiny-note">시간은 도움말·수업 목록·다른 탭을 보는 동안 멈춰요.<br>키보드: Tab / 방향키로 타일 선택 · Enter로 담기 · Esc로 쉬기<br>소리는 오른쪽 위에서 켜고 끌 수 있어요.</p><button class="primary-button" data-action="resume">알겠어요, 산책할게요</button><button class="secondary-button" data-action="school">숲속 학교에서 직접 배우기</button>`);
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
  showModal(`<p class="eyebrow">ENDLESS WALK</p><div class="mascot">${animal(1)}</div><h2>끝없는 숲으로 떠나요</h2><p>현재 수업에서 나와 ${profile.level}번째 숲으로 떠나요.<br>수료한 수업과 모은 도토리는 그대로 남아 있어요.</p><button class="primary-button" data-action="endless">끝없는 산책 시작 →</button><button class="secondary-button" data-action="resume">이 수업 계속하기</button>`);
});
$('mobile-items').addEventListener('click',()=>{$('item-panel').scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'center'});toast('이곳은 아이템 설명이에요. 사용은 보드의 아이템을 눌러요.');});
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
 else if(action==='sound') {toggleSound();openPause();}
  else if(action==='haptics') {profile.haptics=!profile.haptics;persist();openPause();}
  else if(action==='restart-menu') showModal(`<p class="eyebrow">A FRESH WALK</p><h2>새로 산책해볼까요?</h2><p>현재 스테이지의 점수와 배치가 초기화돼요.<br>최고 기록과 모은 도토리는 유지돼요.</p><button class="primary-button" data-action="new-board">새로운 배치로 다시 시작</button><button class="secondary-button" data-action="resume">이어서 산책하기</button>`);
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('modal').open) {event.preventDefault();openPause();}});
document.addEventListener('visibilitychange',()=>{
  lastTick=performance.now();document.body.classList.toggle('effects-paused',document.hidden||$('modal').open);
  if(document.hidden) {persist();if(audioContext?.state==='running') audioContext.suspend();}
  else {if(profile.sound&&audioContext?.state==='suspended') audioContext.resume().catch(()=>{});}
});
window.addEventListener('pagehide',persist);
setInterval(()=>{
  const now=performance.now(),dt=Math.min(.5,(now-lastTick)/1000);lastTick=now;
  if(document.hidden||$('modal').open||state.status!=='playing') return;
  tick(state,dt);renderHUD();saveClock+=dt;
  if(state.fever>0&&now-lastAmbient>=500) {lastAmbient=now;feverAmbient();}
  if(saveClock>=5) {saveClock=0;persist();}
  if(state.status==='lost') endGame();
},100);
render();updateSound();
if(resumed||!profile.welcomed) openWelcome();
if(updatedRound) toast('보드 아이템 업데이트! 기록은 유지하고 현재 숲을 새 배치로 시작해요.');
persist();
