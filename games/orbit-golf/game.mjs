import { OrbitScene } from './scene.mjs';
import { TRACK_LENGTH, UPGRADE_DEFS, newProfile, sanitizeProfile, cleanName, upgradeCost, buyUpgrade, newRun, stepRun, changeLane, collectRunGold, continueCost, canContinue, continueRun, settleRun } from './rules.mjs';

const $ = id => document.getElementById(id);
const KEY = 'orbit-golf:v1';
const PREVIEW = new URLSearchParams(location.search).get('preview') === '1';
const fmt = value => Math.floor(value).toLocaleString('ko-KR');
const aborter = new AbortController();
const on = (element,event,fn,options={}) => element.addEventListener(event,fn,{...options,signal:aborter.signal});
let profile=newProfile(), storageOK=true;
try { profile=sanitizeProfile(JSON.parse(PREVIEW?'null':localStorage.getItem(KEY)||'null')); } catch { storageOK=false; }
let run=null, mode='lobby', previousMode='lobby', charging=false, charge=0, power=0, seed=0;
let audio=null, audioEnabled=true, raf=0, last=0, hudTime=0, saveTime=0, toastLife=0, disposed=false;
let scene;
const BALL_NAMES=['기본 공','오로라 공','유성 공','성운 공','혜성 공','초신성 공'];
function prepareRun(powerValue) {
  const next=newRun(profile,powerValue,seed);
  next.previousBest=profile.rankings.find(r=>r.name.toLowerCase()===profile.name.toLowerCase())?.distance||0;
  const level=profile.upgrades.ball;
  const basicRange=(110+7*level)**2/(2*(3.15-.16*level));
  next.goalDistance=Math.max(360,Math.ceil(Math.min(next.previousBest+360,basicRange)/360)*360);
  return next;
}
function save() { if(PREVIEW)return;try { localStorage.setItem(KEY,JSON.stringify(profile)); storageOK=true; } catch { storageOK=false; } $('save-warning').hidden=storageOK; }
function refreshLobby(){
  $('gold').textContent=fmt(profile.gold);
  const best=profile.rankings[0];
  $('best').replaceChildren(document.createTextNode(`${fmt(best?.distance||0)} `),Object.assign(document.createElement('small'),{textContent:'m'}));
  if(document.activeElement!==$('pilot-name'))$('pilot-name').value=profile.name;
}
function visibleMode(){
  $('game').classList.toggle('is-playing',mode!=='lobby');
  $('lobby').hidden=mode!=='lobby';$('hud').hidden=mode==='lobby';
  $('launch-controls').hidden=mode!=='ready';$('drive-controls').hidden=mode!=='rolling';
  $('pause').hidden=mode!=='rolling';
}
function tone(kind='good'){
  if(!audioEnabled)return;
  try{
    audio ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audio.state==='suspended')audio.resume().catch(()=>{});
    const t=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();
    osc.type=kind==='danger'?'sawtooth':'sine';
    const frequencies={shot:[120,850],good:[600,1100],danger:[180,55],warp:[320,1600],stop:[260,120]};
    const [start,end]=frequencies[kind]||frequencies.good;
    osc.frequency.setValueAtTime(start,t);osc.frequency.exponentialRampToValueAtTime(end,t+.18);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.14,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+.24);
    osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+.25);osc.onended=()=>{osc.disconnect();gain.disconnect();};
    if(kind==='shot'||kind==='danger'){
      const hit=audio.createOscillator(),volume=audio.createGain();hit.type='triangle';hit.frequency.setValueAtTime(210,t);hit.frequency.exponentialRampToValueAtTime(38,t+.09);volume.gain.setValueAtTime(.25,t);volume.gain.exponentialRampToValueAtTime(.0001,t+.11);hit.connect(volume);volume.connect(audio.destination);hit.start(t);hit.stop(t+.12);hit.onended=()=>{hit.disconnect();volume.disconnect();};
    }
  }catch{/* Sound is optional; a blocked AudioContext must not interrupt play. */}
}
function toast(text,kind='good'){$('toast').textContent=text;$('toast').className=`toast visible${kind==='danger'?' bad':''}`;toastLife=2;}
function element(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
function button(text,className,action){const b=element('button',className,text);b.type='button';b.addEventListener('click',action);return b;}
function openPanel(title,content,type){
  $('panel-title').textContent=title;$('panel-content').replaceChildren(...content);$('panel').dataset.type=type;
  $('close-panel').hidden=type==='result'||type==='pause';
  if(!$('panel').open)$('panel').showModal();
}
function closePanel(){if($('panel').open)$('panel').close();}
function finalize(){if(run&&!run.finished&&run.phase!=='ready'){if(run.phase!=='stopped')run.phase='stopped';collectRunGold(profile,run);settleRun(profile,run);save();}refreshLobby();}
function lobby(){charging=false;finalize();closePanel();run=null;mode='lobby';scene.lastTrack=-1;visibleMode();refreshLobby();}
function ready(){
  finalize();closePanel();seed=crypto.getRandomValues(new Uint32Array(1))[0];
  run=prepareRun(.5);run.phase='ready';mode='ready';charging=false;charge=0;power=0;
  $('shot-title').textContent=run.tutorial?'첫 훈련 · 최대 75초':`${BALL_NAMES[profile.upgrades.ball]} · 목표 ${fmt(run.goalDistance)}m`;
  $('shoot').innerHTML='누르고 → 놓기 <span aria-hidden="true">⛳</span>';
  scene.lastTrack=-1;visibleMode();updateHUD();updatePower();
}
function updatePower(){
  $('power-fill').style.width=`${power*100}%`;$('power-needle').style.left=`${power*100}%`;
  document.querySelector('.power-meter').setAttribute('aria-valuenow',Math.round(power*100));
}
function chargeStart(e){if(mode!=='ready'||charging)return;if(e?.pointerId!==undefined)$('shoot').setPointerCapture(e.pointerId);charging=true;charge=0;power=.08;$('shot-title').textContent='초록에서 놓으면 완벽한 타격!';tone('good');}
function chargeCancel(){if(!charging)return;charging=false;power=0;updatePower();}
function launch(){if(mode!=='ready'||!charging)return;charging=false;const p=Math.max(.22,power),perfect=p>=.82&&p<=.96;run=prepareRun(perfect?1:p);power=0;mode='rolling';visibleMode();tone('shot');scene.burst();toast(run.tutorial?'첫 훈련 · 붉은 장애물을 피하세요':perfect?'퍼펙트 샷!':'쳇바퀴 진입!');updateHUD();}
function steer(delta){if(mode==='rolling'&&changeLane(run,delta)){tone('good');updateLanes();}}
function updateLanes(){document.querySelectorAll('.lane-indicator i').forEach((el,i)=>el.classList.toggle('active',i===run?.lane+1));}
function updateHUD(){
  if(!run)return;$('distance').textContent=fmt(run.distance);$('speed').textContent=fmt(run.speed);$('run-gold').textContent=fmt(run.earned);
  const remaining=Math.max(0,Math.ceil(run.durationLimit-run.elapsed));
  const compact=window.innerWidth<=600&&window.innerHeight<=680;
  $('track-label').textContent=compact?`${run.tutorial?'훈련':`${run.track+1}바퀴`} · ${remaining}초`:run.tutorial?'첫 훈련':`${run.track+1}바퀴`;$('pilot-label').textContent=run.name;
  $('run-goal').textContent=compact?`목표 ${fmt(run.goalDistance)}m`:`${run.tutorial?'훈련':'비행'} ${remaining}초 · 목표 ${fmt(run.goalDistance)}m`;
  $('orbit-fill').style.width=`${run.distance%TRACK_LENGTH/TRACK_LENGTH*100}%`;updateLanes();
  const next=run.events.find(e=>!e.used&&e.at>run.distance&&e.at-run.distance<Math.max(35,run.speed*1.4));
  const labels={comet:'☄ 혜성',alien:'♟ 우주인',trap:'▲ 함정',coins:'◆ 골드',boost:'» 가속',ufo:'✧ 우주선',hole:'⚑ 홀인원'};
  const lane=['왼쪽','중앙','오른쪽'];
  $('warning').hidden=!next||mode!=='rolling';if(next)$('warning').textContent=`${labels[next.type]} · ${lane[next.lane+1]} ${Math.ceil(next.at-run.distance)}m`;
  if(compact&&next&&mode==='rolling')$('run-goal').textContent=$('warning').textContent;
}
function stopped(){
  mode='stopped';collectRunGold(profile,run);
  if(run.tutorial)settleRun(profile,run);
  save();visibleMode();updateHUD();tone('stop');
  const distance=element('p','result-distance',fmt(run.distance));distance.append(element('small','',' m'));
  const summary=element('div','result-summary');summary.append(element('span','',`◆ +${fmt(run.earned)} G`),element('span','',`${run.track+1}바퀴`));
  const growth=element('p','growth-note',run.previousBest?run.distance>run.previousBest?`최고 기록 +${fmt(run.distance-run.previousBest)}m!`:`이전 최고 ${fmt(run.previousBest)}m · 강화하고 다시 도전`:'첫 기록 완성! 이제 장비를 성장시켜요.');
  const upgradeAction=()=>{finalize();run=null;mode='lobby';visibleMode();showUpgrades();};
  if(run.tutorial) {
    const reward=element('p','training-reward',`훈련 보상 +${fmt(run.trainingBonus)} G 포함`);
    const next=button('첫 강화하기','primary panel-action',upgradeAction);
    openPanel('첫 훈련 완료',[distance,summary,reward,growth,element('p','panel-intro','공을 강화하면 기본 비거리가 늘고 색상도 바뀌어요.'),next,button('기록 저장 · 대기실','text-button panel-action',lobby)],'result');
    return;
  }
  const can=canContinue(profile,run),used=run.continued;
  const again=button(used?'이어하기 사용 완료':`이어 달리기 · ${continueCost(run)} G`,'primary panel-action',()=>{
    if(continueRun(profile,run)){save();closePanel();mode='rolling';visibleMode();scene.burst();toast('같은 자리에서, 다시!');tone('shot');updateHUD();}
  });again.disabled=!can;
  const note=element('p','continue-note',run.stopReason==='time'?'120초 비행 완료 · 강화하고 다음 기록에 도전하세요.':used?'한 판에 한 번의 재출발을 사용했어요.':can?'멈춘 자리에서 재출발 · 한 판에 딱 한 번':`보유 ${fmt(profile.gold)} G · 이어 달리기에는 40 G 필요`);
  const retry=button('다시 타격','secondary',ready),upgrade=button('강화','secondary',upgradeAction);
  const row=element('div','result-secondary');row.append(retry,upgrade);
  const back=button('기록 저장 · 대기실','text-button panel-action',lobby);
  openPanel('이번 비행 완료',[distance,summary,growth,again,note,row,back],'result');
}
function pause(reason='잠시 쉬어가요'){
  if(mode!=='rolling'&&mode!=='ready')return;previousMode=mode;charging=false;power=0;updatePower();mode='paused';visibleMode();audio?.suspend().catch(()=>{});
  const resume=button('계속','primary panel-action',()=>{closePanel();mode=previousMode;visibleMode();if(audioEnabled)audio?.resume().catch(()=>{});last=performance.now();});
  const restart=button('재시작','secondary panel-action',ready),back=button('비행 마치기','text-button panel-action',lobby);
  openPanel(reason,[element('p','panel-intro','쉬는 동안 거리와 속도는 변하지 않아요.'),resume,restart,back],'pause');
}
function showUpgrades(){
  const children=[element('p','panel-intro','한 번의 강화가 다음 비행을 더 멀리.'),element('p','panel-gold',`보유 ◆ ${fmt(profile.gold)} G`)];
  for(const key of ['pilot','ball']){
    const def=UPGRADE_DEFS[key],level=profile.upgrades[key],cost=upgradeCost(profile,key);
    const card=element('div','upgrade-card'),title=element('div','upgrade-title');
    title.append(element('span','upgrade-icon',key==='pilot'?'♟':'◉'),document.createTextNode(def.label),element('small','',`Lv.${level} / ${def.maxLevel}`));
    const nextLevel=Math.min(level+1,5);
    const range=l=>(110+7*l)**2/(2*(3.15-.16*l));
    const improvement=Math.round((range(nextLevel)/range(level)-1)*100);
    const maxed=level===def.maxLevel;
    const desc=element('p','',key==='pilot'?maxed?`최고 단계 · 장애물 감속 ${level*8}% 감소`:`장애물 감속 ${level*8}% 감소 → ${nextLevel*8}%`:maxed?`${BALL_NAMES[level]} · 최고 단계\n출발 속도 +${level*7} · 마찰 감소`:`${BALL_NAMES[level]} → ${BALL_NAMES[nextLevel]}\n기본 비거리 약 +${improvement}% · 출발 속도 +7`);
    if(key==='ball')desc.append(element('small','range-note','방해 없는 풀샷 기준 · 공의 색상도 변화'));
    const buy=button(Number.isFinite(cost)?`강화 · ${fmt(cost)} G`:'최고 단계','primary',()=>{if(buyUpgrade(profile,key)){save();refreshLobby();tone('good');showUpgrades();}});
    buy.disabled=!Number.isFinite(cost)||profile.gold<cost;card.append(title,desc,buy);children.push(card);
  }
  children.push(button(profile.name?'다음 비행':'대기실','primary panel-action',()=>{if(profile.name)ready();else{closePanel();refreshLobby();}}));openPanel('장비 강화',children,'upgrades');
}
function showRanks(){
  const list=element('ol','rank-list');profile.rankings.forEach((r,i)=>{const row=element('li','rank-row');const score=element('b','',fmt(r.distance));score.append(element('small','',' m'));row.append(element('span','',`${i+1}`),element('strong','',r.name),score);list.append(row);});
  openPanel('궤도 랭킹',[element('p','panel-intro','이 기기의 TOP 10 · 이름별 최고 기록'),profile.rankings.length?list:element('p','empty','첫 번째 궤도 개척자가 되어보세요.'),button('확인','primary panel-action',closePanel)],'ranks');
}
function showHelp(){
  const list=element('ol','help-list');['공은 수직 쳇바퀴 안쪽을 달려요. 초록 구간에서 타격 버튼을 놓으면 퍼펙트 샷!','좌우 버튼으로 바퀴 폭의 3개 레인을 이동해요. PC는 ← → 또는 A · D, 타격은 스페이스.','첫 훈련은 최대 75초. 훈련 보상으로 강화한 뒤 다음 기록에 도전하세요.','8m마다 1골드. 일반 비행은 최대 120초이며 자연 정지 때 40골드로 한 번만 이어 달려요.','보통 회전은 같은 바퀴, 홀인원·우주선은 다른 쳇바퀴로 워프해요.'].forEach(t=>list.append(element('li','',t)));
  const key=element('div','event-key');['☄ 혜성 · 감속','♟ 우주인 · 감속','▲ 함정 · 큰 감속','» 가속 · 속도 회복','◆ 골드 · +12 G','⚑ 홀인원 · +20 G'].forEach(t=>key.append(element('span','',t)));
  openPanel('궤도 비행 안내',[list,key,button('준비 완료','primary panel-action',closePanel)],'help');
}
try { scene=new OrbitScene($('space')); } catch(error){$('load-error').hidden=false;console.error('Orbit Golf WebGL:',error);}
if(scene){
  refreshLobby();visibleMode();$('save-warning').hidden=storageOK;
  on($('name-form'),'submit',e=>{e.preventDefault();const name=cleanName($('pilot-name').value);if(!name){$('name-error').textContent='파일럿 이름을 입력해주세요.';$('pilot-name').focus();return;}profile.name=name;$('name-error').textContent='';save();ready();});
  on($('open-upgrades'),'click',showUpgrades);on($('open-ranks'),'click',showRanks);on($('open-help'),'click',showHelp);on($('close-panel'),'click',closePanel);
  on($('panel'),'cancel',e=>{if(['pause','result'].includes($('panel').dataset.type))e.preventDefault();});
  on($('sound'),'click',()=>{audioEnabled=!audioEnabled;$('sound').setAttribute('aria-pressed',audioEnabled);$('sound').setAttribute('aria-label',audioEnabled?'소리 끄기':'소리 켜기');$('sound').style.color=audioEnabled?'#d4ff72':'';if(audioEnabled)tone();else audio?.suspend().catch(()=>{});});
  on($('shoot'),'pointerdown',chargeStart);on($('shoot'),'pointerup',launch);on($('shoot'),'pointercancel',chargeCancel);on($('shoot'),'lostpointercapture',chargeCancel);on($('shoot'),'contextmenu',e=>e.preventDefault());
  on($('left'),'pointerdown',e=>{e.preventDefault();steer(-1);});on($('right'),'pointerdown',e=>{e.preventDefault();steer(1);});
  // Click also supports assistive technology and keyboard activation, without a duplicate pointer action.
  on($('left'),'click',e=>{if(e.detail===0)steer(-1);});on($('right'),'click',e=>{if(e.detail===0)steer(1);});
  on($('cancel-run'),'click',lobby);on($('pause'),'click',()=>pause());
  on(document,'keydown',e=>{if(e.target instanceof HTMLInputElement||$('panel').open)return;
    if(['ArrowLeft','ArrowRight',' ','a','A','d','D'].includes(e.key))e.preventDefault();
    if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')steer(-1);if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')steer(1);
    if(e.key===' '&&!e.repeat)chargeStart();if(e.key==='Escape')pause();
  });on(document,'keyup',e=>{if(e.key===' '&&charging){e.preventDefault();launch();}});
  let swipeStart=null;on($('space'),'pointerdown',e=>{swipeStart={x:e.clientX,y:e.clientY};});on($('space'),'pointerup',e=>{if(swipeStart&&Math.abs(e.clientX-swipeStart.x)>24&&Math.abs(e.clientY-swipeStart.y)<90)steer(e.clientX>swipeStart.x?1:-1);swipeStart=null;});
  on(window,'resize',()=>scene.resize());on(window,'blur',()=>{if(charging)chargeCancel();});
  on($('space'),'webglcontextlost',e=>{e.preventDefault();pause('3D 화면 복구 중');});
  on($('space'),'webglcontextrestored',()=>{scene.resize();toast('화면 복구 완료 · 계속을 누르세요');});
  on(document,'visibilitychange',()=>{if(document.hidden){pause('비행을 멈췄어요');if(raf)cancelAnimationFrame(raf);raf=0;collectAndSave();audio?.suspend().catch(()=>{});}else{last=performance.now();if(!raf&&!disposed)raf=requestAnimationFrame(frame);}});
  function collectAndSave(){if(run)collectRunGold(profile,run);save();}
  function frame(now){
    if(disposed)return;const dt=last?Math.max(0,(now-last)/1000):.016,visualDt=Math.min(dt,.05);last=now;
    if(charging){charge+=dt;power=1-Math.abs((charge%1.8)/.9-1);updatePower();}
    if(mode==='rolling'){
      const events=stepRun(run,profile,dt);for(const event of events){if(event.kind==='stop')continue;toast(event.text,event.kind);tone(event.kind);scene.burst(event.kind==='danger'?'bad':'good');if(event.kind==='warp'){$('warp-flash').classList.remove('flash');void $('warp-flash').offsetWidth;$('warp-flash').classList.add('flash');}}
      if(run.phase==='stopped')stopped();
      hudTime+=dt;saveTime+=dt;if(hudTime>.09){hudTime=0;updateHUD();}if(saveTime>1){saveTime=0;collectAndSave();}
    }
    if(toastLife>0){toastLife-=dt;if(toastLife<=0)$('toast').classList.remove('visible');}
    scene.render(visualDt,run,mode,power,profile.upgrades);raf=requestAnimationFrame(frame);
  }
  on(window,'pagehide',e=>{pause('비행을 멈췄어요');collectAndSave();cancelAnimationFrame(raf);raf=0;if(!e.persisted){finalize();disposed=true;scene.dispose();audio?.close().catch(()=>{});aborter.abort();}});
  on(window,'pageshow',e=>{if(e.persisted&&!disposed){scene.resize();last=performance.now();if(!raf)raf=requestAnimationFrame(frame);}});
  raf=requestAnimationFrame(frame);
}
