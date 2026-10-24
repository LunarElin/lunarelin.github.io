import { OrbitScene } from './scene.mjs?v=20261024-chain1';
import { TRACK_LENGTH, UPGRADE_DEFS, newProfile, sanitizeProfile, cleanName, upgradeCost, buyUpgrade, ballStats, newRun, stepRun, steerRun, collectRunGold, continueCost, canContinue, continueRun, settleRun } from './rules.mjs?v=20261024-chain1';

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
let rollSound=null, rollGain=null, lastTone=-1, toastCooldown=0, lastHaptic=-1000;
const heldKeys=new Set();
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
let scene;
const BALL_NAMES=['기본 공','오로라 공','유성 공','성운 공','혜성 공','초신성 공'];
function prepareRun(powerValue) {
  const next=newRun(profile,powerValue,seed,Number($('aim-control').value));
  next.previousBest=profile.rankings.find(r=>r.name.toLowerCase()===profile.name.toLowerCase())?.distance||0;
  const stats=ballStats(profile);
  next.goalDistance=Math.max(360,Math.ceil(Math.min(next.previousBest+360,stats.range)/180)*180);
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
  if(mode!=='rolling'){resetSpin();$('game').style.setProperty('--speed','0');}
}
function tone(kind='good'){
  if(!audioEnabled)return;
  try{
    audio ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audio.state==='suspended')audio.resume().catch(()=>{});
    if(!rollSound){
      const buffer=audio.createBuffer(1,audio.sampleRate,audio.sampleRate),data=buffer.getChannelData(0);
      let smooth=0;for(let i=0;i<data.length;i++){smooth=(smooth+Math.random()*2-1)*.72;data[i]=smooth;}
      rollSound=audio.createBufferSource();rollSound.buffer=buffer;rollSound.loop=true;
      const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=900;
      rollGain=audio.createGain();rollGain.gain.value=0;rollSound.connect(filter);filter.connect(rollGain);rollGain.connect(audio.destination);rollSound.start();
    }
    if(audio.currentTime-lastTone<.065&&kind!=='shot')return;lastTone=audio.currentTime;
    const t=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();
    osc.type=['punch','comet','danger'].includes(kind)?'sawtooth':'triangle';
    const frequencies={shot:[160,40],good:[600,1100],danger:[180,55],warp:[320,1600],stop:[260,120],bumper:[420,120],spring:[140,980],punch:[110,42],alien:[550,180],trap:[80,380],comet:[160,44],landing:[220,65],rail:[680,210],coins:[880,1400],boost:[180,1200],ufo:[320,1600],hole:[800,1800]};
    const [start,end]=frequencies[kind]||frequencies.good;
    osc.frequency.setValueAtTime(start,t);osc.frequency.exponentialRampToValueAtTime(end,t+.18);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.14,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+.24);
    osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+.25);osc.onended=()=>{osc.disconnect();gain.disconnect();};
    if(['shot','punch','comet','danger','landing'].includes(kind)){
      const hit=audio.createOscillator(),volume=audio.createGain();hit.type='triangle';hit.frequency.setValueAtTime(210,t);hit.frequency.exponentialRampToValueAtTime(38,t+.09);volume.gain.setValueAtTime(.25,t);volume.gain.exponentialRampToValueAtTime(.0001,t+.11);hit.connect(volume);volume.connect(audio.destination);hit.start(t);hit.stop(t+.12);hit.onended=()=>{hit.disconnect();volume.disconnect();};
    }
  }catch{/* Sound is optional; a blocked AudioContext must not interrupt play. */}
}
function toast(text,kind='good'){$('toast').textContent=text;$('toast').className=`toast visible${kind==='danger'?' bad':kind==='chain'?' chain':''}`;toastLife=1.25;toastCooldown=.3;}
function impact(feedback){
  scene.burst(feedback);tone(feedback.type||feedback.kind);
  const now=performance.now();
  if(!reducedMotion&&feedback.strength>.6&&now-lastHaptic>90){navigator.vibrate?.(feedback.type==='shot'?24:12);lastHaptic=now;}
  let chainPeak=false;
  if(feedback.kind==='chain'&&run){
    if(run.displayChainId!==feedback.chainId||!Number.isFinite(run.displayChainDepth)){run.displayChainId=feedback.chainId;run.displayChainDepth=0;}
    chainPeak=feedback.chainDepth>run.displayChainDepth;
    run.displayChainDepth=Math.max(run.displayChainDepth,feedback.chainDepth||2);
    run.displayChainUntil=run.elapsed+2.4;
  }
  if(feedback.text&&(toastCooldown<=0||feedback.kind==='warp'||chainPeak))toast(feedback.text,feedback.kind);
}
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
  $('shot-title').textContent=run.tutorial?'초록에서 놓으면 · 쾅!':`${BALL_NAMES[profile.upgrades.ball]} · 한 방 더 멀리!`;
  $('shoot').innerHTML='길게 눌러 → 한 방! <span aria-hidden="true">⛳</span>';
  $('toast').classList.remove('visible');toastLife=0;toastCooldown=0;updateAim();
  scene.lastTrack=-1;visibleMode();updateHUD();updatePower();
}
function updatePower(){
  $('power-fill').style.width=`${power*100}%`;$('power-needle').style.left=`${power*100}%`;
  document.querySelector('.power-meter').setAttribute('aria-valuenow',Math.round(power*100));
}
function chargeStart(e){if(mode!=='ready'||charging)return;if(e?.pointerId!==undefined)$('shoot').setPointerCapture(e.pointerId);charging=true;charge=0;power=.08;$('shot-title').textContent='초록에서 놓으세요!';tone('good');}
function chargeCancel(){if(!charging)return;charging=false;power=0;updatePower();}
function launch(){
  if(mode!=='ready'||!charging)return;charging=false;const p=Math.max(.22,power),perfect=p>=.82&&p<=.96;
  run=prepareRun(perfect?1:p);power=0;mode='rolling';visibleMode();
  impact({type:'shot',kind:'good',strength:perfect?1.4:1,text:perfect?'완벽한 한 방!':'가자! 우주 당구공!'});
  $('shot-flash').classList.remove('bang');void $('shot-flash').offsetWidth;$('shot-flash').classList.add('bang');updateHUD();
}
function updateAim(){const aim=Number($('aim-control').value);$('aim-value').textContent=`${aim>0?'+':''}${aim}°`;if(mode==='ready'&&run)run.aim=aim;}
function setSpin(axis){if(mode!=='rolling')return;steerRun(run,axis);$('spin-control').value=String(axis);}
function resetSpin(){heldKeys.clear();if(run)steerRun(run,0);$('spin-control').value='0';}
function updateHUD(){
  if(!run)return;$('distance').textContent=fmt(run.distance);$('speed').textContent=fmt(Math.abs(run.speed));$('run-gold').textContent=fmt(run.earned);
  const remaining=Math.max(0,Math.ceil(run.durationLimit-run.elapsed));
  const compact=window.innerWidth<=600&&window.innerHeight<=680;
  $('track-label').textContent=compact?`${run.tutorial?'훈련':`${run.track+1}바퀴`} · ${remaining}초`:run.tutorial?'첫 훈련':`${run.track+1}바퀴`;$('pilot-label').textContent=run.name;
  $('run-goal').textContent=compact?`목표 ${fmt(run.goalDistance)}m`:`${run.tutorial?'훈련':'비행'} ${remaining}초 · 목표 ${fmt(run.goalDistance)}m`;
  $('orbit-fill').style.width=`${run.distance%TRACK_LENGTH/TRACK_LENGTH*100}%`;
  const stats=ballStats(profile),base=ballStats(0);
  $('growth-readout').textContent=`공 Lv.${profile.upgrades.ball} · 타격 추진력 ${Math.round(stats.launchSpeed/base.launchSpeed*100)}%`;
  const chainActive=run.displayChainDepth>=2&&run.elapsed<run.displayChainUntil;
  $('combo').hidden=mode!=='rolling'||(!chainActive&&(run.combo<2||run.elapsed-run.lastImpact>3.2));
  $('combo').classList.toggle('chain',chainActive);$('combo').textContent=chainActive?`${run.displayChainDepth}연쇄!`:`${run.combo||0}연속!`;
  $('warning').hidden=mode!=='rolling';
  $('warning').textContent=run.height>1.2?'뿅! 공중 비행':Math.abs(run.vx)>3?'데굴데굴 · 벽도 발사대!':`${run.collisions||0}번 충돌 · 더 멀리 튀어라!`;
  $('game').style.setProperty('--speed',mode==='rolling'?String(Math.min(1,Math.abs(run.speed)/150)):'0');
  if(run.previousBest&&!run.beatBest&&run.distance>run.previousBest){run.beatBest=true;toast(`지난 기록 돌파! +${fmt(run.distance-run.previousBest)}m`);}
}
function stopped(){
  mode='stopped';collectRunGold(profile,run);
  if(run.tutorial)settleRun(profile,run);
  save();visibleMode();updateHUD();tone('stop');
  const distance=element('p','result-distance',fmt(run.distance));distance.append(element('small','',' m'));
  const summary=element('div','result-summary');summary.append(element('span','',`◆ +${fmt(run.earned)} G`),element('span','',`${run.collisions||0}번 와장창!`));
  const chainSummary=element('p','chain-summary',run.chainHits?`장애물 ${fmt(run.chainHits)}번 연쇄 · 최대 ${run.maxChain}단계`:'');chainSummary.id='chain-summary';chainSummary.hidden=!run.chainHits;
  const growth=element('p','growth-note',run.previousBest?run.distance>run.previousBest?`최고 기록 +${fmt(run.distance-run.previousBest)}m!`:`이전 최고 ${fmt(run.previousBest)}m · 강화하고 다시 도전`:'첫 기록 완성! 이제 장비를 성장시켜요.');
  const upgradeAction=()=>{finalize();run=null;mode='lobby';visibleMode();showUpgrades();};
  if(run.tutorial) {
    const reward=element('p','training-reward',`훈련 보상 +${fmt(run.trainingBonus)} G 포함`);
    const next=button('첫 강화하기','primary panel-action',upgradeAction);
    openPanel('첫 훈련 완료',[distance,summary,chainSummary,reward,growth,element('p','panel-intro','공 강화 = 더 센 한 방 + 더 오래 구르기!'),next,button('기록 저장 · 대기실','text-button panel-action',lobby)],'result');
    return;
  }
  const can=canContinue(profile,run),used=run.continued;
  const again=button(used?'이어하기 사용 완료':`이어 달리기 · ${continueCost(run)} G`,'primary panel-action',()=>{
    if(continueRun(profile,run)){save();closePanel();mode='rolling';visibleMode();impact({type:'shot',kind:'good',strength:1,text:'같은 자리에서, 다시 쾅!'});updateHUD();}
  });again.disabled=!can;
  const note=element('p','continue-note',run.stopReason==='time'?'120초 비행 완료 · 강화하고 다음 기록에 도전하세요.':used?'한 판에 한 번의 재출발을 사용했어요.':can?'멈춘 자리에서 재출발 · 한 판에 딱 한 번':`보유 ${fmt(profile.gold)} G · 이어 달리기에는 40 G 필요`);
  const retry=button('다시 타격','secondary',ready),upgrade=button('강화','secondary',upgradeAction);
  const row=element('div','result-secondary');row.append(retry,upgrade);
  const back=button('기록 저장 · 대기실','text-button panel-action',lobby);
  openPanel('이번 비행 완료',[distance,summary,chainSummary,growth,again,note,row,back],'result');
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
    const current=ballStats(level),next=ballStats(nextLevel);
    const improvement=Math.round((next.range/current.range-1)*100);
    const maxed=level===def.maxLevel;
    const currentRebound=.74+level*.035+profile.upgrades.ball*.012;
    const rebound=Math.round(((currentRebound+.035)/currentRebound-1)*100);
    const desc=element('p','',key==='pilot'?maxed?'최고 단계 · 더 통통, 충돌 뒤에도 오래!':`충돌 뒤 힘을 더 오래 보존\n반발력 +${rebound}% · 우당탕 후 다시 전진` :maxed?`${BALL_NAMES[level]} · 최고 단계\n출발 추진력 ${fmt(current.launchSpeed)} · 낮은 마찰`:`${BALL_NAMES[level]} → ${BALL_NAMES[nextLevel]}\n기본 비거리 +${improvement}%\n${fmt(current.range)}m → ${fmt(next.range)}m`);
    if(key==='ball')desc.append(element('small','range-note','장애물 없는 직선 풀샷 기준 · 실제 충돌과 운에 따라 달라져요'));
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
  const list=element('ol','help-list');['발사각을 고르고 타격 버튼을 길게 눌러요. 초록에서 놓으면 퍼펙트 샷!','넓어진 쳇바퀴에서 공은 벽에 부딪혀 튀고, 떠올랐다가 다시 구릅니다. 조작하지 않아도 진행돼요.','맞은 장애물도 함께 날아가 다른 장애물을 밀칩니다. 외계인과 범퍼가 우당탕 연쇄 충돌!','원하면 아래 스핀을 드래그하거나 화면을 좌우로 문질러 살짝 회전시켜요. PC는 ← → 또는 A · D를 누르는 동안 스핀, 스페이스로 타격.','첫 훈련은 최대 75초. 보상으로 공을 강화하면 한 방의 세기와 구르는 거리가 함께 늘어요.','8m마다 1골드. 일반 비행은 최대 120초, 멈춘 곳에서 40골드로 한 번만 이어 달려요.','홀인원·우주선은 다른 쳇바퀴로 워프! 튀는 방향에 따라 뜻밖의 행운을 만나요.'].forEach(t=>list.append(element('li','',t)));
  const key=element('div','event-key');['◎ 고무 범퍼 · 팡!','♟ 외계인 · 데굴데굴','↟ 스프링 · 뿅!','✊ 펀치 · 한 방 더','☄ 혜성 · 우당탕','⚑ 홀인원 · 워프'].forEach(t=>key.append(element('span','',t)));
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
  on($('aim-control'),'input',updateAim);
  on($('spin-control'),'input',()=>setSpin(Number($('spin-control').value)));
  for(const event of ['pointerup','pointercancel','lostpointercapture','change'])on($('spin-control'),event,resetSpin);
  on($('cancel-run'),'click',lobby);on($('pause'),'click',()=>pause());
  on(document,'keydown',e=>{if((e.target instanceof HTMLInputElement&&!['range'].includes(e.target.type))||$('panel').open)return;
    if(mode==='ready'&&e.target===$('aim-control')&&['ArrowLeft','ArrowRight'].includes(e.key))return;
    if(['ArrowLeft','ArrowRight',' ','a','A','d','D'].includes(e.key))e.preventDefault();
    if(['ArrowLeft','a','A'].includes(e.key)){heldKeys.add('left');setSpin(-1);}
    if(['ArrowRight','d','D'].includes(e.key)){heldKeys.add('right');setSpin(1);}
    if(e.key===' '&&!e.repeat)chargeStart();if(e.key==='Escape')pause();
  });on(document,'keyup',e=>{
    if(e.key===' '&&charging){e.preventDefault();launch();}
    if(['ArrowLeft','a','A'].includes(e.key))heldKeys.delete('left');
    if(['ArrowRight','d','D'].includes(e.key))heldKeys.delete('right');
    if(['ArrowLeft','a','A','ArrowRight','d','D'].includes(e.key))setSpin((heldKeys.has('right')?1:0)-(heldKeys.has('left')?1:0));
  });
  let spinStart=null;
  on($('space'),'pointerdown',e=>{if(mode!=='rolling')return;spinStart=e.clientX;$('space').setPointerCapture(e.pointerId);});
  on($('space'),'pointermove',e=>{if(spinStart!==null)setSpin(Math.max(-1,Math.min(1,(e.clientX-spinStart)/85)));});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])on($('space'),event,()=>{spinStart=null;resetSpin();});
  on(window,'resize',()=>scene.resize());on(window,'blur',()=>{chargeCancel();spinStart=null;resetSpin();});
  on($('space'),'webglcontextlost',e=>{e.preventDefault();pause('3D 화면 복구 중');});
  on($('space'),'webglcontextrestored',()=>{scene.resize();toast('화면 복구 완료 · 계속을 누르세요');});
  on(document,'visibilitychange',()=>{if(document.hidden){pause('비행을 멈췄어요');if(raf)cancelAnimationFrame(raf);raf=0;collectAndSave();audio?.suspend().catch(()=>{});}else{last=performance.now();if(!raf&&!disposed)raf=requestAnimationFrame(frame);}});
  function collectAndSave(){if(run)collectRunGold(profile,run);save();}
  function frame(now){
    if(disposed)return;const dt=last?Math.max(0,(now-last)/1000):.016,visualDt=Math.min(dt,.05);last=now;
    if(charging){charge+=dt;power=1-Math.abs((charge%1.8)/.9-1);updatePower();}
    if(mode==='rolling'){
      const events=stepRun(run,profile,dt);for(const event of events){if(event.kind==='stop')continue;impact(event);if(event.kind==='warp'){$('warp-flash').classList.remove('flash');void $('warp-flash').offsetWidth;$('warp-flash').classList.add('flash');}}
      if(run.phase==='stopped')stopped();
      hudTime+=dt;saveTime+=dt;if(hudTime>.09){hudTime=0;updateHUD();}if(saveTime>1){saveTime=0;collectAndSave();}
    }
    if(toastLife>0){toastLife-=dt;if(toastLife<=0)$('toast').classList.remove('visible');}toastCooldown=Math.max(0,toastCooldown-dt);
    if(rollGain&&audio?.state==='running'){
      const loudness=mode==='rolling'?.035*Math.min(1,Math.abs(run.speed)/130)*(run.height>.3?.45:1):0;
      rollGain.gain.setTargetAtTime(audioEnabled?loudness:0,audio.currentTime,.08);
      rollSound.playbackRate.setTargetAtTime(mode==='rolling'?.6+Math.min(1.8,Math.abs(run.speed)/80):.6,audio.currentTime,.08);
    }
    scene.render(visualDt,run,mode,power,profile.upgrades);raf=requestAnimationFrame(frame);
  }
  on(window,'pagehide',e=>{pause('비행을 멈췄어요');collectAndSave();cancelAnimationFrame(raf);raf=0;if(!e.persisted){finalize();disposed=true;scene.dispose();rollSound?.stop();audio?.close().catch(()=>{});aborter.abort();}});
  on(window,'pageshow',e=>{if(e.persisted&&!disposed){scene.resize();last=performance.now();if(!raf)raf=requestAnimationFrame(frame);}});
  raf=requestAnimationFrame(frame);
}
