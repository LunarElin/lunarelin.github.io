(function (JD) {
  'use strict';

  const canvas = document.getElementById('game');
  const homeLink = document.querySelector('.top-controls a');
  const pauseButton = document.getElementById('pause');
  const soundButton = document.getElementById('sound');
  const soundLabel = document.getElementById('sound-label');
  const magazine = document.getElementById('magazine');
  const magazineButtons = Array.from(magazine.querySelectorAll('button'));
  const playDescription = canvas.getAttribute('aria-description');
  const balls = {
    normal: '기본 구슬',
    big: '큰 구슬',
    iron: '쇠 구슬',
    glass: '유리 구슬'
  };
  const storageKey = 'jackpotDrop.v2';
  const query = new URLSearchParams(window.location.search);
  const positiveInteger = key => {
    const value = query.get(key);
    return /^\d+$/.test(value || '') && Number.isSafeInteger(Number(value)) ? Number(value) : undefined;
  };
  const game = JD.createGame({seed:positiveInteger('seed'),start:positiveInteger('start')});
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const draw = JD.createRenderer(canvas);

  function readRecords() {
    const result={best:0,bestStage:0,runs:0,muted:false};
    try {
      const data=JSON.parse(window.localStorage.getItem(storageKey));
      if(data && typeof data==='object') {
        ['best','bestStage','runs'].forEach(key=>{
          if(Number.isFinite(data[key])&&data[key]>=0) result[key]=data[key];
        });
        result.muted=data.muted===true;
      }
    } catch (_) { /* The current session can still keep a record. */ }
    return result;
  }

  const saved=readRecords();
  function saveRecords() {
    try { window.localStorage.setItem(storageKey,JSON.stringify(saved)); }
    catch (_) { /* Storage may be unavailable on a local page. */ }
  }

  let s=game.snapshot();
  const ui={
    saved,focus:0,muted:saved.muted,newBest:false,newBestStage:false,age:0,
    paused:false,pauseFocus:0,magazineFocus:null,cameraY:0,
    stageAge:0,stateAge:0,stageFired:false,tutorialSeen:false,hintHidden:false,
    demoPower:0,demoRecoil:0,slowBlend:0,cardNotice:null,reduced:media.matches
  };
  const audio=JD.createAudio ? JD.createAudio(ui.muted) : null;
  const fx=JD.createFx ? JD.createFx() : null;
  let slowFrames=0, slowPhase=false, slowActive=false;
  let prevTime=null, accumulator=0;
  let frameRequest=null, pageActive=true;

  function isInactive() {
    return document.hidden || !pageActive;
  }

  function isBlocked() {
    return isInactive() || ui.paused;
  }

  function updateMagazine() {
    magazine.hidden=ui.paused||s.state==='CARD'||s.state==='RESULT';
    if(magazine.hidden) return;
    const slots=JD.UI.magazine(s);
    const canSelect=s.state==='AIM'&&s.stage>1&&s.rack.length>1&&!s.charging;
    magazineButtons.forEach((button,index)=>{
      const entry=slots[index];
      button.hidden=!entry;
      if(!entry) return;
      button.disabled=!canSelect;
      button.dataset.slot=entry.slot;
      button.style.top=(entry.y-26)*100/640+'%';
      button.setAttribute('aria-label','구슬 '+(entry.slot+1)+': '+balls[s.rack[entry.slot]]);
      button.setAttribute('aria-pressed',String(s.stage>1&&s.loaded.includes(entry.slot)));
    });
  }

  function updateControls() {
    canvas.dataset.state=s.state;
    const result=s.state==='RESULT';
    canvas.setAttribute('aria-label',ui.paused?'일시 정지. '+JD.UI.pauseButtons[ui.pauseFocus].label:
      result?'잭팟 드롭 결과. 다시 하기':'잭팟 드롭 보드');
    canvas.setAttribute('aria-description',ui.paused?'방향키 또는 탭으로 고르고 Space나 Enter로 선택합니다. Esc를 누르면 계속합니다.':
      result?'Space 또는 Enter로 다시 시작합니다.':s.load>1?
        playDescription+' 방향키로 탄창의 구슬에 초점을 두고 A로 장전하거나 뺍니다. L로 최대 세 개를 장전합니다.':playDescription);
    updateMagazine();
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
    if(!s.practiceStart) { saved.muted=ui.muted; saveRecords(); }
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
    focusMagazine:slot=>{ui.magazineFocus=slot;},
    magazineFocused:()=>ui.magazineFocus,
    activateAudio:()=>{if(audio) audio.activate();},
    toggleMute,
    cancel:cancelInput,
    isInactive,
    isPaused:()=>ui.paused,
    pauseFocused:()=>ui.pauseFocus,
    focusPause,
    choosePause
  });

  function handleEvents(events,before) {
    for(const e of events) {
      switch(e.type) {
        case 'run_started':
          ui.newBest=false;
          ui.newBestStage=false;
          ui.cardNotice=null;
          ui.muted=saved.muted;
          if(audio) audio.mute(ui.muted);
          updateSound();
          break;
        case 'stage_started':
          ui.stageAge=0;
          ui.stageFired=false;
          ui.hintHidden=false;
          ui.magazineFocus=null;
          break;
        case 'charge_started':
          ui.hintHidden=true;
          break;
        case 'shot_fired':
          ui.stageFired=true;
          ui.tutorialSeen=true;
          ui.hintHidden=true;
          ui.magazineFocus=null;
          slowFrames=0;
          slowPhase=false;
          break;
        case 'card_picked':
          ui.cardNotice={event:e,before,age:0};
          break;
        case 'run_ended':
          if(!s.practiceStart) {
            ui.newBest=s.result.runScore>saved.best;
            ui.newBestStage=s.result.stageReached>saved.bestStage;
            saved.best=Math.max(s.result.runScore,saved.best);
            saved.bestStage=Math.max(s.result.stageReached,saved.bestStage);
            saved.runs++;
            saveRecords();
          }
          break;
      }
    }
    if(fx) fx.events(events,s,before,ui,audio);
    if(audio) for(const e of events) audio.event(e,s);
  }

  handleEvents(game.drainEvents(),s);
  JD.updateCamera(s,ui);

  function gameStep() {
    const before=s;
    game.step();
    s=game.snapshot();
    if(s.state!==before.state) {
      ui.stateAge=0;
      if(s.state==='CARD'||s.state==='RESULT') ui.focus=0;
    }
    const loadedChanged=s.loaded.length!==before.loaded.length||s.loaded.some((slot,index)=>slot!==before.loaded[index]);
    if(s.state!==before.state || s.charging!==before.charging || loadedChanged ||
        s.rack.length!==before.rack.length) updateControls();
    if(s.state!==before.state && (s.state==='CARD'||s.state==='RESULT')) canvas.focus({preventScroll:true});
    const events=game.drainEvents();
    if(before.state==='FLIGHT'&&s.balls.some((ball,index)=>ball.wait===0&&before.balls[index]?.wait>0)) {
      events.push({type:'lane_released'});
    }
    handleEvents(events,before);
  }

  function nearJackpot() {
    if(s.state!=='FLIGHT') return false;
    const moving=s.balls.filter(ball=>!ball.done&&ball.wait<=0);
    if(moving.length!==1||moving[0].y<s.landY-76||s.balls.some(ball=>ball.wait>0)) return false;
    return s.buckets.mult.some((mult,i)=>mult===5&&moving[0].x>=s.buckets.x[i]-20&&moving[0].x<=s.buckets.x[i+1]+20);
  }

  function presentationTick(force) {
    ui.age++;
    ui.stageAge++;
    ui.stateAge++;
    if(ui.cardNotice&&++ui.cardNotice.age>44) ui.cardNotice=null;
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
    const demo=s.stage===1&&s.state==='AIM'&&!s.charging&&!ui.tutorialSeen;
    const cycle=(ui.age+12)%90;
    ui.demoPower=demo&&cycle>=6&&cycle<60 ? (cycle-6)/54*.84 : 0;
    ui.demoRecoil=demo&&cycle>=60&&cycle<78 ? -10*Math.cos((cycle-60)*.9)*Math.pow(.75,cycle-60) : 0;
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

  function focusPause(index) {
    ui.pauseFocus=index;
    canvas.setAttribute('aria-label','일시 정지. '+JD.UI.pauseButtons[index].label);
    draw(s,ui,fx,ui.age);
  }

  function togglePause() {
    if(isInactive()) return;
    ui.paused=!ui.paused;
    ui.pauseFocus=0;
    canvas.toggleAttribute('data-paused',ui.paused);
    pauseButton.setAttribute('aria-expanded',String(ui.paused));
    pauseButton.setAttribute('aria-label',ui.paused?'계속':'일시 정지');
    updateControls();
    syncLoop();
    canvas.focus({preventScroll:true});
  }

  function choosePause(index) {
    if(index===0) togglePause();
    else if(index===1) window.location.replace(window.location.protocol==='file:'?'./index.html':'./');
    else if(index===2) window.location.href=homeLink.href;
  }

  pauseButton.addEventListener('click',togglePause);
  soundButton.addEventListener('click',toggleMute);
  window.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!event.repeat&&!isInactive()) {
      event.preventDefault();
      togglePause();
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
  syncLoop();
})(JD);
