(function (JD) {
  'use strict';

  const canvas = document.getElementById('game');
  const pauseButton = document.getElementById('pause');
  const pauseMenu = document.getElementById('pause-menu');
  const pauseOptions = document.getElementById('pause-options');
  const resetOptions = document.getElementById('reset-options');
  const pauseTitle = document.getElementById('pause-title');
  const resumeButton = document.getElementById('resume');
  const mapButton = document.getElementById('open-map');
  const askReset = document.getElementById('ask-reset');
  const cancelReset = document.getElementById('cancel-reset');
  const soundButton = document.getElementById('sound');
  const soundLabel = document.getElementById('sound-label');
  const magazine = document.getElementById('magazine');
  const panel = document.getElementById('panel-controls');
  const specialCapacity = Object.keys(JD.CARD_BALL).reduce((sum,id)=>sum+JD.CARD_CAP[id],0);
  const magazineCapacity = Math.max(3,specialCapacity)+JD.CARD_CAP.extra+JD.PERKS.ball.max;
  const magazineButtons=Array.from({length:magazineCapacity},()=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='magazine-slot';
    button.hidden=true;
    magazine.append(button);
    return button;
  });
  const panelButtons = new Map();
  let panelState = null;
  const playDescription = canvas.getAttribute('aria-description');
  const balls = {
    normal: '기본 구슬',
    big: '큰 구슬',
    iron: '쇠 구슬',
    glass: '유리 구슬',
    wave: '물결 구슬'
  };
  const storageKey = 'jackpotDrop.v3';
  const query = new URLSearchParams(window.location.search);
  const positiveInteger = key => {
    const value = query.get(key);
    return /^\d+$/.test(value || '') && Number.isSafeInteger(Number(value)) ? Number(value) : undefined;
  };
  const stored = readSave();
  const game = JD.createGame({seed:positiveInteger('seed'),start:positiveInteger('start'),endless:query.get('endless')==='1',save:stored});
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const draw = JD.createRenderer(canvas);

  function readSave() {
    try { return JSON.parse(window.localStorage.getItem(storageKey)); }
    catch (_) { return null; }
  }

  function saveRecords() {
    if(s.practice) return;
    try { window.localStorage.setItem(storageKey,JSON.stringify({...game.saveState(),muted:ui.muted})); }
    catch (_) { /* Storage may be unavailable on a local page. */ }
  }

  let s=game.snapshot();
  const ui={
    focus:0,muted:!s.practice&&stored?.muted===true,newBest:false,age:0,
    paused:false,cameraY:0,panelFocus:null,panelShake:null,mapUnlock:false,
    stageAge:0,stateAge:0,stageFired:false,tutorialSeen:false,hintHidden:false,
    slowBlend:0,cardNotice:null,ironUnlockAge:null,reduced:media.matches
  };
  const audio=JD.createAudio ? JD.createAudio(ui.muted) : null;
  const fx=JD.createFx ? JD.createFx() : null;
  let slowFrames=0, slowPhase=false, slowActive=false;
  let prevTime=null, accumulator=0;
  let frameRequest=null, pageActive=true;
  let pendingMapUnlock=false;
  let pendingIronUnlock=false;

  function isInactive() {
    return document.hidden || !pageActive;
  }

  function isBlocked() {
    return isInactive() || ui.paused;
  }

  function updateMagazine() {
    magazine.hidden=ui.paused||s.state==='CARD'||s.state==='RESULT'||s.state==='SHOP'||s.state==='MAP';
    if(magazine.hidden) return;
    const slots=JD.UI.magazine(s);
    const equipmentEnabled=JD.UI.ballSelectionEnabled(s);
    const canSelect=s.state==='AIM'&&equipmentEnabled&&s.rack.length>1&&!s.charging;
    magazineButtons.forEach((button,index)=>{
      const entry=slots[index];
      button.hidden=!entry;
      if(!entry) return;
      button.disabled=!canSelect;
      button.dataset.slot=entry.slot;
      button.style.top=(entry.y-26)*100/640+'%';
      button.setAttribute('aria-label','구슬 '+(entry.slot+1)+': '+balls[s.rack[entry.slot]]);
      button.setAttribute('aria-pressed',String(equipmentEnabled&&entry.slot===s.slot));
    });
  }

  function panelEntries() {
    if(s.shop) {
      return [...s.shop.items.map((item,index)=>[item.id,JD.UI.shopPerks[index],
        `강화 ${JD.UI.perkNames[item.id]}, ${item.level}단계, ${item.cost===null?'최대 단계':item.cost+'코인'}`,item.affordable]),
      ['retry',JD.UI.shopRetry,`${s.stage}단계 재도전`,true]];
    }
    const map=s.map;
    if(!map) return [];
    return [...JD.UI.mapStages.map((rect,index)=>[index,rect,
      index===map.current?`${index+1}단계 이어하기`:index<map.cleared?`${index+1}단계 클리어`:`${index+1}단계 잠김`,index===map.current]),
    ['endless',JD.UI.mapEndless,map.endlessUnlocked?'무한 모드 시작':'무한 모드 잠김. 8단계를 넘기면 열립니다.',map.endlessUnlocked],
    ['close',JD.UI.mapClose,'스테이지 지도 닫기',map.canClose]];
  }

  function updatePanel() {
    const visible=s.state==='SHOP'||s.state==='MAP';
    panel.hidden=!visible;
    if(!visible) return;
    const entries=panelEntries();
    if(panelState!==s.state) {
      panelState=s.state;
      panel.setAttribute('aria-label',s.state==='SHOP'?'영구 강화 상점':'스테이지 지도');
      panel.replaceChildren();
      panelButtons.clear();
      for(const [id,rect] of entries) {
        const button=document.createElement('button');
        button.type='button';
        button.className='panel-hit';
        button.style.left=(rect.x+rect.w/2)*100/440+'%';
        button.style.top=`max(22px, ${(rect.y+rect.h/2)*100/640}%)`;
        button.style.width=rect.w*100/440+'%';
        button.style.height=rect.h*100/640+'%';
        button.addEventListener('click',()=>activatePanel(id));
        button.addEventListener('focus',()=>{
          if(button.getAttribute('aria-disabled')!=='true') ui.panelFocus=id;
        });
        panelButtons.set(id,button);
        panel.append(button);
      }
    }
    for(const [id,,label,enabled] of entries) {
      const button=panelButtons.get(id);
      button.setAttribute('aria-label',label);
      button.setAttribute('aria-disabled',String(!enabled));
      button.tabIndex=enabled?0:-1;
    }
  }

  function updateControls() {
    canvas.dataset.state=s.state;
    const labels={CARD:'이번 단계의 강화 카드',SHOP:'잭팟 드롭 강화 상점',MAP:'잭팟 드롭 스테이지 지도',RESULT:'잭팟 드롭 무한 모드 결과'};
    const descriptions={CARD:'이번 단계에 적용할 카드를 고릅니다. 방향키로 이동하고 Enter를 누르거나 숫자 1부터 3까지를 누릅니다.',
      SHOP:'숫자 1부터 5까지로 강화합니다. Enter, Space 또는 R로 재도전합니다.',
      MAP:'위아래 방향키로 고르고 Enter 또는 Space로 선택합니다. Esc로 지도를 닫습니다.',
      RESULT:'Space 또는 Enter로 다시 시작하고 G로 지도를 엽니다.'};
    canvas.setAttribute('aria-label',labels[s.state]||'잭팟 드롭 보드');
    canvas.setAttribute('aria-description',descriptions[s.state]||playDescription);
    updateMagazine();
    updatePanel();
  }

  function updateSound() {
    soundButton.setAttribute('aria-pressed',String(ui.muted));
    soundLabel.textContent=ui.muted?'소리 끔':'소리 켬';
  }

  function toggleMute() {
    ui.muted=!ui.muted;
    if(audio) {
      audio.mute(ui.muted);
      if(!ui.muted) audio.activate();
    }
    saveRecords();
    updateSound();
  }

  function cancelInput() {
    const wasCharging=s.charging;
    input.reset();
    game.cancelInput();
    s=game.snapshot();
    if(wasCharging) updateControls();
    if(audio&&audio.pause) audio.pause();
  }

  const input=JD.createInput(canvas,magazineButtons,{
    snapshot:()=>s,
    queue:cmd=>game.queue(cmd),
    focus:index=>{ui.focus=index;},
    focused:()=>ui.focus,
    activateAudio:()=>{if(audio) audio.activate();},
    toggleMute,
    cancel:cancelInput,
    isInactive,
    isPaused:()=>ui.paused,
    panelFocused:()=>ui.panelFocus,
    moveMapFocus,
    activatePanel
  });

  function handleEvents(events,before) {
    for(const e of events) {
      switch(e.type) {
        case 'run_started':
          ui.newBest=false;
          ui.cardNotice=null;
          ui.ironUnlockAge=null;
          pendingIronUnlock=false;
          updateSound();
          break;
        case 'stage_started':
          ui.stageAge=0;
          ui.stageFired=false;
          ui.hintHidden=false;
          ui.cardNotice=null;
          ui.ironUnlockAge=pendingIronUnlock&&e.mode==='campaign'&&e.stage===2?0:null;
          pendingIronUnlock=false;
          break;
        case 'charge_started':
          ui.hintHidden=true;
          break;
        case 'shot_fired':
          ui.stageFired=true;
          ui.tutorialSeen=true;
          ui.hintHidden=true;
          slowFrames=0;
          slowPhase=false;
          break;
        case 'card_picked':
          ui.cardNotice={event:e,before,age:0};
          break;
        case 'ball_unlocked':
          pendingIronUnlock=e.ball==='iron';
          break;
        case 'endless_unlocked':
          pendingMapUnlock=true;
          break;
        case 'run_ended':
          ui.newBest=!s.practice&&s.result.stageReached>before.endlessBest;
          break;
      }
    }
    if(events.some(e=>e.type==='payout_done'||e.type==='stage_started'||e.type==='perk_bought'||
        e.type==='run_ended'||e.type==='campaign_clear')) saveRecords();
    if(fx) fx.events(events,s,before,ui,audio);
    if(audio) for(const e of events) audio.event(e.type==='run_ended'?{...e,newBest:ui.newBest}:e,s);
  }

  handleEvents(game.drainEvents(),s);
  JD.updateCamera(s,ui);

  function gameStep() {
    const before=s;
    input.beforeStep();
    game.step();
    s=game.snapshot();
    const changed=s.state!==before.state;
    if(changed) {
      ui.stateAge=0;
      ui.panelShake=null;
      if(s.state==='CARD') ui.focus=0;
      if(s.state==='RESULT') ui.panelFocus='replay';
      if(s.state==='SHOP') ui.panelFocus='retry';
      if(s.state==='MAP') setMapFocus();
    }
    if(changed || s.charging!==before.charging || s.slot!==before.slot || s.state==='SHOP'&&s.coins!==before.coins ||
        s.rack.length!==before.rack.length) updateControls();
    if(changed&&(s.state==='SHOP'||s.state==='MAP'||s.state==='CARD'||s.state==='RESULT'||
        before.state==='SHOP'||before.state==='MAP'||before.state==='RESULT')) focusPlayfield();
    handleEvents(game.drainEvents(),before);
  }

  function nearJackpot() {
    if(s.state!=='FLIGHT') return false;
    const moving=s.balls.filter(ball=>!ball.done);
    if(moving.length!==1||moving[0].y<s.landY-76) return false;
    return s.buckets.mult.some((mult,i)=>mult===5&&moving[0].x>=s.buckets.x[i]-20&&moving[0].x<=s.buckets.x[i+1]+20);
  }

  function presentationTick(force) {
    ui.age++;
    ui.stageAge++;
    ui.stateAge++;
    if(ui.cardNotice) {
      const {event,age}=ui.cardNotice;
      if(age===27&&(JD.CARD_BALL[event.id]||event.id==='extra')&&audio) audio.event({type:'reward_ball_arrived'},s);
      if(++ui.cardNotice.age>44) ui.cardNotice=null;
    }
    if(ui.ironUnlockAge!==null) {
      if(++ui.ironUnlockAge===20&&audio) audio.event({type:'reward_ball_arrived'},s);
      if(ui.ironUnlockAge>=28) ui.ironUnlockAge=null;
    }
    if(ui.panelShake&&++ui.panelShake.age>=12) ui.panelShake=null;
    const fast=!force&&s.state==='FLIGHT'&&input.fast();
    slowActive=!fast&&slowFrames<40&&nearJackpot();
    if(slowActive) {
      if(audio&&slowFrames%20===0) audio.event({type:'slow_heartbeat'},s);
      slowFrames++;
      slowPhase=!slowPhase;
      if(force||slowPhase) gameStep();
    } else {
      slowPhase=false;
      gameStep();
      if(fast&&s.state==='FLIGHT') gameStep();
    }
    ui.slowBlend=Math.max(0,Math.min(1,ui.slowBlend+(slowActive?.125:-.125)));
    const demo=s.mode==='campaign'&&s.stage===1&&s.state==='AIM'&&!s.charging&&!ui.tutorialSeen;
    JD.updateCamera(s,ui);
    if(audio&&demo&&ui.age>=300&&(ui.age-300)%600===0) audio.event({type:'tutorial_nudge'},s);
    if(fx) fx.frame(s,ui,audio);
    if(audio) audio.frame(s,{slow:slowActive});
  }

  const tickMs=1000/60;
  function frame(time) {
    frameRequest=null;
    if(isBlocked()) return;
    if(prevTime!==null) accumulator+=Math.min(100,time-prevTime);
    prevTime=time;
    let advanced=false;
    while(accumulator+1e-7>=tickMs) {
      presentationTick(false);
      accumulator-=tickMs;
      advanced=true;
    }
    if(advanced) draw(s,ui,fx,ui.age);
    frameRequest=window.requestAnimationFrame(frame);
  }

  function syncLoop() {
    if(isBlocked()) {
      if(frameRequest!==null) window.cancelAnimationFrame(frameRequest);
      frameRequest=null;
      prevTime=null;
      accumulator=0;
      cancelInput();
    } else if(frameRequest===null) {
      frameRequest=window.requestAnimationFrame(frame);
    }
    if(pageActive&&!document.hidden) draw(s,ui,fx,ui.age);
  }

  function focusPlayfield() {
    const button=(s.state==='SHOP'||s.state==='MAP')&&panelButtons.get(ui.panelFocus);
    (button||canvas).focus({preventScroll:true});
  }

  function setMapFocus() {
    ui.panelFocus=s.map.current??(s.map.endlessUnlocked?'endless':'close');
    ui.mapUnlock=pendingMapUnlock;
    pendingMapUnlock=false;
  }

  function moveMapFocus(direction) {
    const map=s.map;
    if(!map) return;
    const options=[];
    if(map.current!==null) options.push(map.current);
    if(map.endlessUnlocked) options.push('endless');
    if(map.canClose) options.push('close');
    if(options.length===0) return;
    ui.panelFocus=options[(options.indexOf(ui.panelFocus)+direction+options.length)%options.length];
    focusPlayfield();
  }

  function activatePanel(id) {
    if(isBlocked()) return;
    if(audio) audio.activate();
    if(s.state==='SHOP') {
      if(id==='retry') game.queue({type:'retry'});
      else if(JD.PERK_IDS.includes(id)) game.queue({type:'buy',id});
    } else if(s.state==='MAP') {
      if(id==='close'&&s.map.canClose) game.queue({type:'closeMap'});
      else if(id==='endless'&&s.map.endlessUnlocked) game.queue({type:'startEndless'});
      else if(typeof id==='number'&&id===s.map.current) game.queue({type:'continue'});
      else if(id==='endless'||typeof id==='number') {
        if(id==='endless') ui.panelShake={target:id,age:0};
        if(audio) audio.event({type:'map_locked'},s);
      }
    } else if(s.state==='RESULT') {
      if(id==='replay') game.queue({type:'restart'});
      else if(id==='map') game.queue({type:'openMap'});
    }
  }

  function showReset(confirm) {
    pauseOptions.hidden=confirm;
    resetOptions.hidden=!confirm;
    pauseTitle.textContent=confirm?'캠페인 다시 시작':'일시 정지';
    if(confirm) pauseMenu.setAttribute('aria-describedby','reset-warning');
    else pauseMenu.removeAttribute('aria-describedby');
  }

  function openPause() {
    if(isBlocked()) return;
    showReset(false);
    ui.paused=true;
    canvas.setAttribute('data-paused','');
    pauseButton.setAttribute('aria-expanded','true');
    syncLoop();
    mapButton.disabled=s.state!=='AIM'&&s.state!=='RESULT';
    pauseMenu.showModal();
    resumeButton.focus();
  }

  function exitPause(command) {
    if(command) game.queue({type:command});
    pauseMenu.close();
  }

  pauseButton.addEventListener('click',openPause);
  resumeButton.addEventListener('click',()=>exitPause());
  mapButton.addEventListener('click',()=>exitPause('openMap'));
  askReset.addEventListener('click',()=>{showReset(true);cancelReset.focus();});
  cancelReset.addEventListener('click',()=>{showReset(false);askReset.focus();});
  document.getElementById('confirm-reset').addEventListener('click',()=>exitPause('newCampaign'));
  pauseMenu.addEventListener('cancel',event=>{
    if(!resetOptions.hidden) {
      event.preventDefault();
      showReset(false);
      askReset.focus();
    }
  });
  pauseMenu.addEventListener('close',()=>{
    ui.paused=false;
    canvas.removeAttribute('data-paused');
    pauseButton.setAttribute('aria-expanded','false');
    syncLoop();
    focusPlayfield();
  });
  soundButton.addEventListener('click',toggleMute);
  window.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!event.repeat&&!isBlocked()) {
      event.preventDefault();
      if(s.state==='MAP'&&s.map.canClose) game.queue({type:'closeMap'});
      else openPause();
    }
  });
  document.addEventListener('visibilitychange',syncLoop);
  window.addEventListener('pagehide',()=>{pageActive=false; syncLoop();});
  window.addEventListener('pageshow',()=>{pageActive=true; syncLoop();});
  window.addEventListener('resize',()=>draw(s,ui,fx,ui.age));
  window.addEventListener('blur',cancelInput);
  if(media.addEventListener) media.addEventListener('change',event=>{ui.reduced=event.matches;draw(s,ui,fx,ui.age);});

  if(query.get('debug')==='1') {
    window.JD_APP={
      game,
      get cameraY() { return ui.cameraY; },
      advance(n) {
        if(isBlocked()) return s;
        for(let i=0;i<n;i++) presentationTick(true);
        draw(s,ui,fx,ui.age);
        return s;
      }
    };
  }
  updateControls();
  if(s.state==='MAP') {
    setMapFocus();
    focusPlayfield();
  }
  syncLoop();
})(JD);
