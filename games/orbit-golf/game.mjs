import { OrbitScene } from './scene.mjs';
import { TRACK_LENGTH, UPGRADE_DEFS, newProfile, sanitizeProfile, cleanName, upgradeCost, buyUpgrade, newRun, stepRun, changeLane, collectRunGold, continueCost, canContinue, continueRun, settleRun } from './rules.mjs';

const $ = id => document.getElementById(id);
const KEY = 'orbit-golf:v1';
const fmt = value => Math.floor(value).toLocaleString('ko-KR');
const aborter = new AbortController();
const on = (element,event,fn,options={}) => element.addEventListener(event,fn,{...options,signal:aborter.signal});
let profile=newProfile(), storageOK=true;
try { profile=sanitizeProfile(JSON.parse(localStorage.getItem(KEY)||'null')); } catch { storageOK=false; }
let run=null, mode='lobby', previousMode='lobby', charging=false, charge=0, power=0, seed=0;
let audio=null, audioEnabled=true, raf=0, last=0, hudTime=0, saveTime=0, toastLife=0, disposed=false;
let scene;
function save() { try { localStorage.setItem(KEY,JSON.stringify(profile)); storageOK=true; } catch { storageOK=false; } $('save-warning').hidden=storageOK; }
function refreshLobby(){
  $('gold').textContent=fmt(profile.gold);
  const best=profile.rankings[0];
  $('best').replaceChildren(document.createTextNode(`${fmt(best?.distance||0)} `),Object.assign(document.createElement('small'),{textContent:'m'}));
  if(document.activeElement!==$('pilot-name'))$('pilot-name').value=profile.name;
}
function visibleMode(){
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
  run=newRun(profile,.5,seed);run.phase='ready';mode='ready';charging=false;charge=0;power=0;
  $('shot-title').textContent='첫 타를 준비하세요';
  $('shoot').innerHTML='누르고 → 놓기 <span aria-hidden="true">⛳</span>';
  scene.lastTrack=-1;visibleMode();updateHUD();updatePower();
}
function updatePower(){
  $('power-fill').style.width=`${power*100}%`;$('power-needle').style.left=`${power*100}%`;
  document.querySelector('.power-meter').setAttribute('aria-valuenow',Math.round(power*100));
}
function chargeStart(e){if(mode!=='ready'||charging)return;if(e?.pointerId!==undefined)$('shoot').setPointerCapture(e.pointerId);charging=true;charge=0;power=.08;$('shot-title').textContent='초록에서 놓으면 완벽한 타격!';tone('good');}
function chargeCancel(){if(!charging)return;charging=false;power=0;updatePower();}
function launch(){if(mode!=='ready'||!charging)return;charging=false;const p=Math.max(.22,power),perfect=p>=.82&&p<=.96;run=newRun(profile,perfect?1:p,seed);power=0;mode='rolling';visibleMode();tone('shot');scene.burst();toast(perfect?'퍼펙트 샷!':'궤도 진입!');updateHUD();}
function steer(delta){if(mode==='rolling'&&changeLane(run,delta)){tone('good');updateLanes();}}
function updateLanes(){document.querySelectorAll('.lane-indicator i').forEach((el,i)=>el.classList.toggle('active',i===run?.lane+1));}
function updateHUD(){
  if(!run)return;$('distance').textContent=fmt(run.distance);$('speed').textContent=fmt(run.speed);$('run-gold').textContent=fmt(run.earned);
  $('track-label').textContent=`제${run.track+1}궤도`;$('pilot-label').textContent=run.name;
  $('orbit-fill').style.width=`${run.distance%TRACK_LENGTH/TRACK_LENGTH*100}%`;updateLanes();
  const next=run.events.find(e=>!e.used&&e.at>run.distance&&e.at-run.distance<Math.max(35,run.speed*1.4));
  const labels={comet:'☄ 혜성',alien:'♟ 우주인',trap:'▲ 함정',coins:'◆ 골드',boost:'» 가속',ufo:'✧ 우주선',hole:'⚑ 홀인원'};
  const lane=['왼쪽','중앙','오른쪽'];
  $('warning').hidden=!next||mode!=='rolling';if(next)$('warning').textContent=`${labels[next.type]} · ${lane[next.lane+1]} ${Math.ceil(next.at-run.distance)}m`;
}
function stopped(){
  mode='stopped';collectRunGold(profile,run);save();visibleMode();updateHUD();tone('stop');
  const distance=element('p','result-distance',fmt(run.distance));distance.append(element('small','',' m'));
  const summary=element('div','result-summary');summary.append(element('span','',`◆ +${fmt(run.earned)} G`),element('span','',`제${run.track+1}궤도`));
  const can=canContinue(profile,run),used=run.continued;
  const again=button(used?'이어하기 사용 완료':`이어 달리기 · ${continueCost(run)} G`,'primary panel-action',()=>{
    if(continueRun(profile,run)){save();closePanel();mode='rolling';visibleMode();scene.burst();toast('같은 자리에서, 다시!');tone('shot');updateHUD();}
  });again.disabled=!can;
  const note=element('p','continue-note',used?'한 판에 한 번의 재출발을 사용했어요.':can?'멈춘 자리에서 재출발 · 한 판에 딱 한 번':`보유 ${fmt(profile.gold)} G · 이어 달리기에는 40 G 필요`);
  const retry=button('다시 타격','secondary',ready),upgrade=button('강화','secondary',()=>{finalize();run=null;mode='lobby';visibleMode();showUpgrades();});
  const row=element('div','result-secondary');row.append(retry,upgrade);
  const back=button('기록 저장 · 대기실','text-button panel-action',lobby);
  openPanel('이번 비행 완료',[distance,summary,again,note,row,back],'result');
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
    const desc=element('p','',key==='pilot'?`장애물 감속 ${level*8}% 감소 → ${Math.min(level+1,5)*8}%`:`출발 속도 +${level*7} → +${Math.min(level+1,5)*7} · 마찰 감소`);
    const buy=button(Number.isFinite(cost)?`강화 · ${fmt(cost)} G`:'최고 단계','primary',()=>{if(buyUpgrade(profile,key)){save();refreshLobby();tone('good');showUpgrades();}});
    buy.disabled=!Number.isFinite(cost)||profile.gold<cost;card.append(title,desc,buy);children.push(card);
  }
  children.push(button('계속 준비하기','text-button panel-action',()=>{closePanel();refreshLobby();}));openPanel('장비 강화',children,'upgrades');
}
function showRanks(){
  const list=element('ol','rank-list');profile.rankings.forEach((r,i)=>{const row=element('li','rank-row');const score=element('b','',fmt(r.distance));score.append(element('small','',' m'));row.append(element('span','',`${i+1}`),element('strong','',r.name),score);list.append(row);});
  openPanel('궤도 랭킹',[element('p','panel-intro','이 기기의 TOP 10 · 이름별 최고 기록'),profile.rankings.length?list:element('p','empty','첫 번째 궤도 개척자가 되어보세요.'),button('확인','primary panel-action',closePanel)],'ranks');
}
function showHelp(){
  const list=element('ol','help-list');['버튼을 누르고, 초록 구간에서 놓으면 퍼펙트 샷! 짧게 눌러도 출발해요.','좌우 버튼으로 3개 레인을 이동해요. PC는 ← → 또는 A · D, 타격은 스페이스.','8m마다 1골드. 멈추면 강화하거나 40골드로 한 번만 이어 달려요.','홀과 우주선이 있는 레인을 타면 다음 궤도로 즉시 워프!'].forEach(t=>list.append(element('li','',t)));
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
    if(disposed)return;const dt=last?Math.min((now-last)/1000,.05):.016;last=now;
    if(charging){charge+=dt;power=1-Math.abs((charge%1.8)/.9-1);updatePower();}
    if(mode==='rolling'){
      const oldTrack=run.track,events=stepRun(run,profile,dt);for(const event of events){if(event.kind==='stop')continue;toast(event.text,event.kind);tone(event.kind);scene.burst(event.kind==='danger'?'bad':'good');if(event.kind==='warp'){$('warp-flash').classList.remove('flash');void $('warp-flash').offsetWidth;$('warp-flash').classList.add('flash');}}
      if(run.track!==oldTrack&&!events.some(e=>e.kind==='warp')){toast(`제${run.track+1}궤도 진입!`,'warp');tone('warp');$('warp-flash').classList.remove('flash');void $('warp-flash').offsetWidth;$('warp-flash').classList.add('flash');}
      if(run.phase==='stopped')stopped();
      hudTime+=dt;saveTime+=dt;if(hudTime>.09){hudTime=0;updateHUD();}if(saveTime>1){saveTime=0;collectAndSave();}
    }
    if(toastLife>0){toastLife-=dt;if(toastLife<=0)$('toast').classList.remove('visible');}
    scene.render(dt,run,mode,power,profile.upgrades);raf=requestAnimationFrame(frame);
  }
  on(window,'pagehide',e=>{pause('비행을 멈췄어요');collectAndSave();cancelAnimationFrame(raf);raf=0;if(!e.persisted){finalize();disposed=true;scene.dispose();audio?.close().catch(()=>{});aborter.abort();}});
  on(window,'pageshow',e=>{if(e.persisted&&!disposed){scene.resize();last=performance.now();if(!raf)raf=requestAnimationFrame(frame);}});
  raf=requestAnimationFrame(frame);
}
