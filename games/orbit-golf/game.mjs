import { OrbitScene } from './scene.mjs?v=20261029-risk2';
import { TRACK_LENGTH, UPGRADE_DEFS, newProfile, sanitizeProfile, cleanName, upgradeCost, buyUpgrade, ballStats, lapConfig, guardianPower, generateTrack, newRun, stepRun, steerRun, collectRunGold, continueCost, canContinue, continueRun, settleRun } from './rules.mjs?v=20261029-risk2';

import { coursePattern, courseSample } from './course.mjs?v=20261029-risk2';

const $ = id => document.getElementById(id);
const KEY = 'orbit-golf:v1';
const pageParams = new URLSearchParams(location.search);
const PREVIEW = pageParams.get('preview') === '1';
const GIANT_TYPES=['beast','giant-alien','cookie'];
const ENCOUNTER_NAMES={beast:'거대 동물','giant-alien':'거대 외계인',cookie:'거대 과자'};
const HAZARD_NAMES={anvil:'충격 모루',tar:'타르 웅덩이',trap:'제동 패드'};
const PREVIEW_TYPES=[...GIANT_TYPES,'anvil','tar'];
const seedParam=Number(pageParams.get('seed'));
const previewSeed=PREVIEW&&pageParams.has('seed')&&Number.isSafeInteger(seedParam)&&seedParam>=0&&seedParam<=0xffffffff?seedParam:null;
const previewEncounter = PREVIEW && ['guardian-weak','guardian-strong','climb','drop',...PREVIEW_TYPES].includes(pageParams.get('encounter')) ? pageParams.get('encounter') : '';
const fmt = value => Math.floor(value).toLocaleString('ko-KR');
const aborter = new AbortController();
const on = (element,event,fn,options={}) => element.addEventListener(event,fn,{...options,signal:aborter.signal});
let profile=newProfile(), storageOK=true;
try { profile=sanitizeProfile(JSON.parse(PREVIEW?'null':localStorage.getItem(KEY)||'null')); } catch { storageOK=false; }
if(previewEncounter){profile.tutorialComplete=true;profile.upgrades.ball=previewEncounter==='guardian-weak'?0:previewEncounter==='guardian-strong'?2:1;}
let run=null, mode='lobby', previousMode='lobby', charging=false, charge=0, power=0, seed=0;
let audio=null, audioEnabled=true, raf=0, last=0, hudTime=0, saveTime=0, toastLife=0, disposed=false;
let rollSound=null, rollGain=null, lastTone=-1, lastHaptic=-1000;
const heldKeys=new Set();
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
let scene;
const BALL_NAMES=['기본 공','오로라 공','유성 공','성운 공','혜성 공','초신성 공'];
function prepareRun(powerValue) {
  const next=newRun(profile,powerValue,seed,Number($('aim-control').value));
  next.previousBest=profile.rankings.find(r=>r.name.toLowerCase()===profile.name.toLowerCase())?.distance||0;
  const stats=ballStats(profile);
  next.goalDistance=Math.max(360,Math.ceil(Math.min(next.previousBest+360,stats.range)/180)*180);
  if(previewEncounter.startsWith('guardian-')){
    next.s=10*TRACK_LENGTH-90;next.distance=next.s;next.track=9;next.eventTrack=9;next.goalDistance=10*TRACK_LENGTH;
    next.events=[8,9,10].flatMap(track=>generateTrack(track,seed));
  }else if(PREVIEW_TYPES.includes(previewEncounter)){
    let target;
    for(let track=0;track<12&&!target;track++)target=generateTrack(track,seed).find(event=>event.type===previewEncounter&&!event.fragment);
    if(target){
      next.s=Math.max(0,target.at-(GIANT_TYPES.includes(previewEncounter)?18:36));next.distance=next.s;next.x=target.x;next.track=Math.floor(next.s/TRACK_LENGTH);next.eventTrack=next.track;
      next.goalDistance=Math.ceil((target.at+180)/TRACK_LENGTH)*TRACK_LENGTH;next.previewTargetId=target.id;
      next.events=[next.track-1,next.track,next.track+1].filter(track=>track>=0).flatMap(track=>generateTrack(track,seed));
    }
  }else if(['climb','drop'].includes(previewEncounter)){
    let target=80,steepness=0;
    for(let at=80;at<8*TRACK_LENGTH;at+=8){const slope=courseSample(at,seed).slope*(previewEncounter==='climb'?1:-1);if(slope>steepness){steepness=slope;target=at;}}
    next.s=Math.max(0,target-36);next.distance=next.s;next.track=Math.floor(next.s/TRACK_LENGTH);next.eventTrack=next.track;
    next.goalDistance=(next.track+2)*TRACK_LENGTH;
    next.events=[next.track-1,next.track,next.track+1].filter(track=>track>=0).flatMap(track=>generateTrack(track,seed));
  }
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
    osc.type=['anvil','punch','comet','danger','guardian-block','guardian-break'].includes(kind)?'sawtooth':'triangle';
    const frequencies={anvil:[95,28],tar:[75,38],beast:[90,42],'giant-alien':[330,95],cookie:[520,80],shot:[160,40],good:[600,1100],danger:[180,55],warp:[320,1600],stop:[260,120],bumper:[420,120],spring:[140,980],punch:[110,42],alien:[550,180],trap:[80,380],comet:[160,44],landing:[220,65],rail:[680,210],coins:[880,1400],boost:[180,1200],ufo:[320,1600],hole:[800,1800]};
    frequencies['guardian-block']=[140,45];frequencies['guardian-break']=[380,65];
    const [start,end]=frequencies[kind]||frequencies.good;
    osc.frequency.setValueAtTime(start,t);osc.frequency.exponentialRampToValueAtTime(end,t+.18);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.14,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+.24);
    osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+.25);osc.onended=()=>{osc.disconnect();gain.disconnect();};
    if(['shot','punch','comet','danger','landing','guardian-block','guardian-break'].includes(kind)){
      const hit=audio.createOscillator(),volume=audio.createGain();hit.type='triangle';hit.frequency.setValueAtTime(210,t);hit.frequency.exponentialRampToValueAtTime(38,t+.09);volume.gain.setValueAtTime(.25,t);volume.gain.exponentialRampToValueAtTime(.0001,t+.11);hit.connect(volume);volume.connect(audio.destination);hit.start(t);hit.stop(t+.12);hit.onended=()=>{hit.disconnect();volume.disconnect();};
    }
  }catch{/* Sound is optional; a blocked AudioContext must not interrupt play. */}
}
function toast(text){$('toast').textContent=text;$('toast').className='notice visible';toastLife=2;}
function impact(feedback){
  scene.burst(feedback);tone(feedback.kind?.startsWith('guardian-')?feedback.kind:feedback.type||feedback.kind);
  if(run&&feedback.kind?.startsWith('guardian-'))run.guardianFeedback={...feedback,until:run.elapsed+1.8};
  const now=performance.now();
  if(!reducedMotion&&feedback.strength>.6&&now-lastHaptic>90){navigator.vibrate?.(feedback.type==='shot'?24:12);lastHaptic=now;}
  if(feedback.kind==='chain'&&run){
    if(run.displayChainId!==feedback.chainId||!Number.isFinite(run.displayChainDepth)){run.displayChainId=feedback.chainId;run.displayChainDepth=0;}
    run.displayChainDepth=Math.max(run.displayChainDepth,feedback.chainDepth||2);
    run.displayChainUntil=run.elapsed+2.4;
  }
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
  finalize();closePanel();seed=previewSeed??crypto.getRandomValues(new Uint32Array(1))[0];
  if(previewEncounter&&!previewEncounter.startsWith('guardian-'))$('aim-control').value='0';
  run=prepareRun(.5);run.phase='ready';mode='ready';charging=false;charge=0;power=0;
  $('shot-title').textContent=run.tutorial?'초록 구간에서 놓으세요':`${BALL_NAMES[profile.upgrades.ball]} · 목표 ${fmt(run.goalDistance)}m`;
  $('shoot').textContent='누르고 → 타격';
  $('toast').classList.remove('visible');toastLife=0;updateAim();
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
  impact({type:'shot',kind:'good',strength:perfect?1.4:1});updateHUD();
}
function updateAim(){const aim=Number($('aim-control').value);$('aim-value').textContent=`${aim>0?'+':''}${aim}°`;if(mode==='ready'&&run)run.aim=aim;}
function setSpin(axis){if(mode!=='rolling')return;steerRun(run,axis);$('spin-control').value=String(axis);}
function resetSpin(){heldKeys.clear();if(run)steerRun(run,0);$('spin-control').value='0';}
function updateHUD(){
  if(!run)return;$('distance').textContent=fmt(run.distance);$('speed').textContent=run.phase==='ready'?'0':fmt(Math.abs(run.speed));$('speed-label').textContent=run.speed < -2 ? '후진' : '속도';$('run-gold').textContent=fmt(run.earned);
  const remaining=Math.max(0,Math.ceil(run.durationLimit-run.elapsed));
  const compact=window.innerWidth<=600&&window.innerHeight<=680;
  $('track-label').textContent=compact?`${run.track+1}구간 · ${remaining}초`:`${run.track+1}구간${run.tutorial?' · 훈련':''}`;$('pilot-label').textContent=run.name;
  $('run-goal').textContent=compact?`목표 ${fmt(run.goalDistance)}m`:`${run.tutorial?'훈련':'비행'} ${remaining}초 · 목표 ${fmt(run.goalDistance)}m`;
  $('orbit-fill').style.width=`${run.distance%TRACK_LENGTH/TRACK_LENGTH*100}%`;
  const stats=ballStats(profile),base=ballStats(0);
  const lap=lapConfig(run.track+1,run.seed);
  const terrain=coursePattern(run.track,run.seed);
  const featureText=`${terrain.label}${lap.additions>1?` · 기믹 +${lap.additions}`:''}`;
  $('growth-readout').textContent=mode==='rolling'?featureText:`공 Lv.${profile.upgrades.ball} · 타격 추진력 ${Math.round(stats.launchSpeed/base.launchSpeed*100)}%`;
  $('growth-readout').classList.toggle('milestone',mode==='rolling'&&lap.additions>1);
  const guardian=run.events.find(event=>event.type==='guardian'&&!event.broken&&!event.used&&event.at-run.s>=-3&&event.at-run.s<175);
  const giant=run.events.find(event=>GIANT_TYPES.includes(event.type)&&!event.fragment&&!event.used&&!event.body?.active&&event.at-run.s>=-4&&event.at-run.s<125);
  const hazard=run.events.find(event=>Object.hasOwn(HAZARD_NAMES,event.type)&&!event.used&&!event.body?.active&&event.at-run.s>=-4&&event.at-run.s<150);
  const braking=run.phase==='rolling'&&(run.brakeTime>0||run.slowTime>0);
  $('speed').classList.toggle('braking',braking);
  const recentBlock=run.guardianFeedback?.kind==='guardian-block'&&run.elapsed<run.guardianFeedback.until;
  const force=recentBlock?run.guardianFeedback.force:guardianPower(run,profile),progress=$('orbit-fill').parentElement;
  $('growth-readout').classList.toggle('guardian-force',Boolean(guardian));
  $('run-goal').classList.toggle('force-short',Boolean(guardian)&&force<guardian.requiredForce);
  progress.classList.toggle('guardian-power',Boolean(guardian));progress.classList.toggle('can-break',Boolean(guardian)&&force>=guardian.requiredForce);
  progress.setAttribute('role','progressbar');progress.setAttribute('aria-valuemin','0');
  progress.setAttribute('aria-label',guardian?'수문장 충돌 힘':'구간 진행');
  progress.setAttribute('aria-valuemax',String(guardian?guardian.requiredForce:TRACK_LENGTH));
  progress.setAttribute('aria-valuenow',String(guardian?Math.min(force,guardian.requiredForce):run.distance%TRACK_LENGTH));
  if(guardian){
    $('growth-readout').classList.remove('milestone');
    $('run-goal').textContent=`수문장 · ${force>=guardian.requiredForce?'돌파 가능':'힘 부족'}`;
    $('growth-readout').textContent=`충격 ${fmt(force)} / 필요 ${fmt(guardian.requiredForce)}`;
    $('orbit-fill').style.width=`${Math.min(100,force/guardian.requiredForce*100)}%`;
  }else if(hazard&&(!giant||hazard.at<giant.at)){$('run-goal').textContent=`${HAZARD_NAMES[hazard.type]} · ${Math.max(0,Math.ceil(hazard.at-run.s))}m 앞`;
  }else if(giant){$('run-goal').textContent=`${ENCOUNTER_NAMES[giant.type]} · ${Math.max(0,Math.ceil(giant.at-run.s))}m 앞`;
  }else if(run.guardianFeedback?.passed&&run.elapsed<run.guardianFeedback.until)$('run-goal').textContent='수문장 돌파';
  const chainActive=run.displayChainDepth>=2&&run.elapsed<run.displayChainUntil;
  $('combo').hidden=mode!=='rolling'||(!chainActive&&(run.combo<2||run.elapsed-run.lastImpact>3.2));
  $('combo').textContent=chainActive?`연쇄 ${run.displayChainDepth}`:`연속 충돌 ${run.combo||0}`;
  $('game').style.setProperty('--speed',mode==='rolling'?String(Math.min(1,Math.abs(run.speed)/150)):'0');
}
function stopped(){
  mode='stopped';collectRunGold(profile,run);
  if(run.tutorial)settleRun(profile,run);
  save();visibleMode();updateHUD();tone('stop');
  const distance=element('p','result-distance',fmt(run.distance));distance.append(element('small','',' m'));
  const summary=element('div','result-summary');summary.append(element('span','',`◆ +${fmt(run.earned)} G`),element('span','',`충돌 ${fmt(run.collisions||0)}회`));
  const chainSummary=element('p','chain-summary',run.chainHits?`장애물 ${fmt(run.chainHits)}번 연쇄 · 최대 ${run.maxChain}단계`:'');chainSummary.id='chain-summary';chainSummary.hidden=!run.chainHits;
  if(run.guardiansBroken)chainSummary.append(element('span','guardian-result',`수문장 ${fmt(run.guardiansBroken)}체 돌파`));
  if(run.guardiansBroken)chainSummary.hidden=false;
  const growth=element('p','growth-note',run.guardianFeedback?.passed===false?'충격 부족 · 공 강화 후 재도전':run.previousBest?run.distance>run.previousBest?`최고 기록 ${fmt(run.distance-run.previousBest)}m 경신`:`이전 최고 ${fmt(run.previousBest)}m · 강화 후 재도전`:'첫 비행 완료 · 공을 강화하세요.');
  const upgradeAction=()=>{finalize();run=null;mode='lobby';visibleMode();showUpgrades();};
  if(run.tutorial) {
    const reward=element('p','training-reward',`훈련 보상 +${fmt(run.trainingBonus)} G 포함`);
    const next=button('첫 강화하기','primary panel-action',upgradeAction);
    openPanel('첫 훈련 완료',[distance,summary,chainSummary,reward,growth,element('p','panel-intro','공 강화로 타격 추진력과 비거리가 증가합니다.'),next,button('기록 저장 · 대기실','text-button panel-action',lobby)],'result');
    return;
  }
  const can=canContinue(profile,run),used=run.continued;
  const again=button(used?'이어하기 사용 완료':`이어 달리기 · ${continueCost(run)} G`,'primary panel-action',()=>{
    if(continueRun(profile,run)){save();closePanel();mode='rolling';visibleMode();impact({type:'shot',kind:'good',strength:1});updateHUD();}
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
    const desc=element('p','',key==='pilot'?maxed?'최고 단계 · 충돌 에너지 보존 및 반발 강화':'충돌 추진력 손실 감소\n반발 강화' :maxed?`${BALL_NAMES[level]} · 최고 단계\n출발 추진력 ${fmt(current.launchSpeed)} · 낮은 마찰`:`${BALL_NAMES[level]} → ${BALL_NAMES[nextLevel]}\n기본 비거리 +${improvement}%\n${fmt(current.range)}m → ${fmt(next.range)}m`);
    if(key==='ball')desc.append(element('small','range-note','장애물 없는 평지 풀샷 기준 · 실제 충돌과 운에 따라 달라져요'));
    const buy=button(Number.isFinite(cost)?`강화 · ${fmt(cost)} G`:'최고 단계','primary',()=>{if(buyUpgrade(profile,key)){save();refreshLobby();tone('good');showUpgrades();}});
    buy.disabled=!Number.isFinite(cost)||profile.gold<cost;card.append(title,desc,buy);children.push(card);
  }
  children.push(button(profile.name?'다음 비행':'대기실','primary panel-action',()=>{if(profile.name)ready();else{closePanel();refreshLobby();}}));openPanel('장비 강화',children,'upgrades');
}
function showRanks(){
  const list=element('ol','rank-list');profile.rankings.forEach((r,i)=>{const row=element('li','rank-row');const score=element('b','',fmt(r.distance));score.append(element('small','',' m'));row.append(element('span','',`${i+1}`),element('strong','',r.name),score);list.append(row);});
  openPanel('궤도 랭킹',[element('p','panel-intro','이 기기의 TOP 10 · 이름별 최고 기록'),profile.rankings.length?list:element('p','empty','아직 기록이 없습니다.'),button('확인','primary panel-action',closePanel)],'ranks');
}
function showHelp(){
  const list=element('ol','help-list');['발사각을 정하고 타격 버튼을 길게 누른 뒤 초록 구간에서 놓으세요.','360m 구간을 지나면 새로운 배치 기믹이 추가됩니다. 5·10·15번째 구간처럼 5구간마다 한 번에 3개가 추가됩니다.','10번째 구간 끝에는 거대한 수문장이 길을 막습니다. 화면의 충격이 필요 힘 이상이면 부수고 통과하며 40G를 얻습니다. 공을 강화하면 같은 속도에서도 충격이 커집니다. 이후 수문장은 10구간마다 나타납니다.','매 판 새로운 직선 코스가 펼쳐집니다. 긴 내리막·언덕·골짜기·연속 고개·평탄한 쉼터가 다른 높이와 순서로 이어집니다. 카메라는 뒤에서 공을 따라가며 수평을 유지합니다.','거대 동물의 몸통은 공을 크게 튀겨 내고, 외계인 촉수는 옆으로 던져 회전을 줍니다. 커다란 과자는 부서져 조각들이 다른 물체와 연쇄 충돌합니다.','충격 모루는 속도를 크게 빼앗고, 검은 타르는 즉시 감속한 뒤에도 마찰이 남습니다. 위험 직후에는 추진 효과가 잠시 억제되어 속도가 저절로 복구되지 않습니다.','높은 고개를 오를 때는 실제 속도를 잃고, 깊은 내리막에서는 중력으로 가속합니다. 360도 루프 없이 큰 높낮이의 길이 이어집니다.','마찰과 오르막은 속도를 줄이고 내리막은 가속을 돕습니다. 주황 추진기와 초록 패드에 닿으면 가속합니다. 충돌과 착지 뒤 속도가 자동으로 복구되지 않습니다.','공과 장애물은 서로 충돌하며 반사·점프·연쇄 이동합니다. 물체마다 공에 주는 효과가 다릅니다.','스핀은 남은 전진 에너지 안에서만 방향을 바꿉니다. 전진할 힘이 소진되면 스핀을 누르고 있어도 비행이 끝납니다.','스핀 슬라이더나 화면 드래그로 방향을 조절하세요. PC는 ← → 또는 A · D를 누르는 동안 스핀, 스페이스로 타격합니다.','첫 훈련은 최대 75초입니다. 보상으로 공을 강화하면 추진력과 비거리가 증가합니다.','8m마다 1골드. 일반 비행은 최대 120초이며 자연 정지 후 40골드로 한 번만 이어갈 수 있습니다.','홀과 우주선을 이용하면 다른 트랙으로 이동합니다. 수문장이 남아 있으면 그 앞에서 내려옵니다.'].forEach(t=>list.append(element('li','',t)));
  const key=element('div','event-key');[
    ['넓은 금속 모루','큰 충격 손실 · 낮은 반동'],['검은 웅덩이','즉시 감속 · 지속 마찰'],['거대 동물','몸통 반발 · 높은 도약'],['거대 외계인','촉수 횡충격 · 강한 회전'],['거대 과자','파괴 · 조각 연쇄'],['완충 링','낮고 강하게 반발'],['코일 · 위 화살표','높이 뛰어오르기'],
    ['피스톤 · 전진 화살표','앞으로 강하게 추진'],['회전날 · 곡선 화살표','표시 방향으로 휘기'],
    ['각진 혜성','충돌 면을 따라 반사'],['가로 제동 띠','속도와 스핀 감소'],
    ['연속 전진 화살표','추진력 회복'],['홀 · 우주선','다른 트랙으로 이동'],['거대한 갑옷 문','충격이 충분하면 파괴']
  ].forEach(([shape,effect])=>{const entry=element('div','');entry.append(element('b','',shape),element('span','',effect));key.append(entry);});
  openPanel('조작과 장치',[element('p','panel-intro','장치의 모양과 화살표가 충돌 효과를 알려줍니다.'),key,list,button('준비 완료','primary panel-action',closePanel)],'help');
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
    if(toastLife>0){toastLife-=dt;if(toastLife<=0)$('toast').classList.remove('visible');}
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
