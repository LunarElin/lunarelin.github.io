(function (JD) {
  'use strict';

  const canvas = document.getElementById('game');
  const pauseButton = document.getElementById('pause');
  const soundButton = document.getElementById('sound');
  const soundLabel = document.getElementById('sound-label');
  const actionButton = document.getElementById('action');
  const magazine = document.getElementById('magazine');
  const magazineButtons = Array.from(magazine.querySelectorAll('button'));
  const replayButton = document.getElementById('replay');
  const pauseMenu = document.getElementById('pause-menu');
  const actions = {
    AIM: ['발사', '누르고 떼서 발사'],
    FLIGHT: ['빨리 보기', '누르는 동안 구슬을 빠르게'],
    PAYOUT: ['건너뛰기', '점수 계산 건너뛰기']
  };
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
    stageAge:0,stateAge:0,stageFired:false,tutorialSeen:false,hintHidden:false,
    demoPower:0,demoRecoil:0,slowBlend:0,cardNotice:null,reduced:media.matches
  };
  const audio=JD.createAudio ? JD.createAudio(ui.muted) : null;
  const fx=JD.createFx ? JD.createFx() : null;
  let slowFrames=0, slowPhase=false, slowActive=false;
  let prevTime=null, accumulator=0;
  let frameRequest=null, pageActive=true;

  function isBlocked() {
    return document.hidden || !pageActive || pauseMenu.open;
  }

  function updateMagazine() {
    magazine.hidden=s.state==='CARD'||s.state==='RESULT';
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
      button.setAttribute('aria-pressed',String(s.stage>1&&entry.slot===s.slot));
    });
  }

  function updateControls() {
    const action=actions[s.state];
    canvas.dataset.state=s.state;
    actionButton.hidden=!action;
    if(action) {
      actionButton.dataset.mode=s.state;
      actionButton.textContent=action[0];
      actionButton.setAttribute('aria-label',action[1]);
    }
    actionButton.classList.toggle('is-charging',s.charging);
    replayButton.hidden=s.state!=='RESULT';
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

  const input=JD.createInput(canvas,actionButton,magazineButtons,{
    snapshot:()=>s,
    queue:cmd=>game.queue(cmd),
    focus:index=>{ui.focus=index;},
    focused:()=>ui.focus,
    activateAudio:()=>{if(audio) audio.activate();},
    toggleMute,
    cancel:cancelInput,
    isBlocked
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

  function gameStep() {
    const before=s;
    game.step();
    s=game.snapshot();
    if(s.state!==before.state) {
      ui.stateAge=0;
      if(s.state==='CARD'||s.state==='RESULT') ui.focus=0;
    }
    if(s.state!==before.state || s.charging!==before.charging || s.slot!==before.slot ||
        s.rack.length!==before.rack.length) updateControls();
    if(s.state!==before.state && s.state==='CARD') canvas.focus({preventScroll:true});
    if(s.state!==before.state && s.state==='RESULT') replayButton.focus({preventScroll:true});
    handleEvents(game.drainEvents(),before);
  }

  function nearJackpot() {
    if(s.state!=='FLIGHT') return false;
    const moving=s.balls.filter(ball=>!ball.done);
    if(moving.length!==1||moving[0].y<520) return false;
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

  function openPause() {
    if(isBlocked()) return;
    pauseMenu.showModal();
    syncLoop();
  }

  pauseButton.addEventListener('click',openPause);
  soundButton.addEventListener('click',toggleMute);
  replayButton.addEventListener('click',()=>{
    if(isBlocked()||s.state!=='RESULT') return;
    if(audio) audio.activate();
    game.queue({type:'restart'});
    canvas.focus({preventScroll:true});
  });
  document.getElementById('resume').addEventListener('click',()=>pauseMenu.close());
  document.getElementById('restart').addEventListener('click',()=>{
    window.location.replace(window.location.protocol==='file:'?'./index.html':'./');
  });
  pauseMenu.addEventListener('close',syncLoop);
  window.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!event.repeat&&!isBlocked()) {
      event.preventDefault();
      openPause();
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
