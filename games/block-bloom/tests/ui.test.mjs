import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createLevel, createStage, stageInfo, lessonStep, hasGimmick, newProfile, GATES, COLORS } from '../rules.mjs';

const root=new URL('../',import.meta.url),html=readFileSync(new URL('index.html',root),'utf8');
const source=['rules.mjs','drag.mjs','game.mjs'].map(file=>readFileSync(new URL(file,root),'utf8').replace(/^import .+;\r?\n/gm,'').replace(/^export /gm,'')).join('\n');
const KEY='block-bloom:v1';
function app(saved=null,{brokenStorage=false,reduced=false,ready=false,lessons=false}={}) {
  const errors=[],notes=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{url:'https://example.test/games/block-bloom/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
  let now=0,nextId=0;const timeouts=new Map(),intervals=new Map(),frames=new Map(),noop=()=>{};
  w.requestAnimationFrame=fn=>{const id=++nextId;frames.set(id,fn);return id;};w.cancelAnimationFrame=id=>frames.delete(id);
  function frame(){const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now);}
  w.matchMedia=()=>({matches:reduced,addEventListener:noop});w.performance.now=()=>now;
  w.setTimeout=(fn,ms=0)=>{const id=++nextId;timeouts.set(id,{fn,at:now+ms});return id;};w.clearTimeout=id=>timeouts.delete(id);
  w.setInterval=(fn,ms)=>{const id=++nextId;intervals.set(id,{fn,ms,next:now+ms});return id;};w.clearInterval=id=>intervals.delete(id);
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
  w.AudioContext=class{state='running';currentTime=0;destination={};resume(){return Promise.resolve();}createGain(){return{gain:{value:0,setValueAtTime:noop,linearRampToValueAtTime:noop,exponentialRampToValueAtTime:noop},connect:noop,disconnect:noop};}createOscillator(){return{type:'sine',frequency:{setValueAtTime:f=>notes.push(f),exponentialRampToValueAtTime:noop},connect:noop,disconnect:noop,start:noop,stop:noop};}};
  if(saved)w.localStorage.setItem(KEY,typeof saved==='string'?saved:JSON.stringify(saved));
  else if(!lessons&&!brokenStorage)w.localStorage.setItem(KEY,JSON.stringify({profile:newProfile(),run:createStage(1,123,{layoutVersion:1}),history:[]}));
  if(brokenStorage)Object.defineProperty(w,'localStorage',{get(){throw Error('storage blocked');}});
  w.eval(source+'\nwindow.__qa={get state(){return state},get profile(){return profile},get combo(){return combo},get feverUntil(){return feverUntil},get activeTime(){return activeTime},setState(s){state=s;history=[];render();},newRun:stage=>newRun(stage,false,true),resources:()=>({timers:effectTimers.size,sounds:oscillators.size,outputs:outputs.size})};');
  if(!ready&&w.document.querySelector('[data-action="start"]'))w.document.querySelector('[data-action="start"]').click();
  const get=id=>w.document.getElementById(id);
  function click(selector){const el=w.document.querySelector(selector);assert.ok(el,'missing '+selector);assert.equal(el.disabled,false,'disabled '+selector);el.click();}
  function advance(ms){const until=now+ms;while(now<until){now=Math.min(until,now+50);for(const item of intervals.values())if(now>=item.next){item.next=now+item.ms;item.fn();}for(const [id,item]of[...timeouts])if(now>=item.at){timeouts.delete(id);item.fn();}}}
  function solve(){const s=w.__qa.state,plan=(s.stage&&!s.campaignLegacy?createStage(s.stage,s.seed,{layoutVersion:s.layoutVersion||1}):createLevel(s.mode,s.level,s.seed)).plan;for(const action of plan){click(`[data-block="${action.id}"]`);if(action.action==='lift')click('#lift');else for(let i=0;i<Math.abs(action.dx+action.dy);i++)click(`[data-direction="${Math.sign(action.dx)},${Math.sign(action.dy)}"]`);}assert.equal(w.__qa.state.status,'won');advance(650);}
  function pointer(el,type,props={},paint=true){const event=new w.Event(type,{bubbles:true});Object.assign(event,{pointerId:1,button:0,clientX:40,clientY:40,...props});el.dispatchEvent(event);if(paint)frame();}
  return{dom,w,get,click,advance,solve,notes,errors,pointer,frame,frameCount:()=>frames.size,timerCount:()=>intervals.size,saved:()=>JSON.parse(w.localStorage.getItem(KEY)),close:()=>w.close()};
}

function dragBoard(a,blocks,mode='classic') {
  const s={...createLevel(mode,1,123),blocks,queue:[],tray:[],reserve:[],unlocked:[],plan:[],initial:blocks.length,total:blocks.length,moves:0,removed:0,score:0,started:true};
  a.w.__qa.setState(s);Object.defineProperty(a.get('board'),'clientWidth',{value:360,configurable:true});
  return a.w.document.querySelector(`[data-block="${blocks[0].id}"]`);
}
const piece=(id,x,y,color='blue',extra={})=>({id,x,y,color,w:1,h:1,rank:1,...extra});

test('tiny mouse and touch input follows immediately with one transform write per animation frame',()=>{
  const a=app();try{const b=dragBoard(a,[piece(0,1,1),piece(1,5,5)]);
    a.pointer(b,'pointerdown',{pointerType:'touch'});assert.equal(b.style.transform,'translate(0px,0px)');
    a.pointer(b,'pointermove',{clientX:41,clientY:41,pointerType:'touch'},false);
    a.pointer(b,'pointermove',{clientX:42,clientY:43,pointerType:'touch'},false);
    assert.equal(a.frameCount(),1);assert.equal(b.style.transform,'translate(0px,0px)');a.frame();assert.equal(b.style.transform,'translate(2px,3px)');
    a.pointer(b,'pointermove',{clientX:41,clientY:42});assert.equal(b.style.transform,'translate(1px,2px)');
    a.pointer(b,'pointermove',{clientX:44,clientY:45},false);a.pointer(b,'pointercancel',{},false);assert.equal(a.frameCount(),0);a.frame();assert.equal(b.style.transform,'');assert.equal(a.w.__qa.state.moves,0);
  }finally{a.close();}
});

test('moving beside an obstacle keeps fractional y when only pointer x changes',()=>{
  const a=app();try{const b=dragBoard(a,[piece(0,1,1),piece(1,2,1),piece(2,5,5)]);a.pointer(b,'pointerdown');
    for(const [clientX,clientY]of[[60,40],[60,60],[60,69],[60,70],[60,71],[60,80],[60,90],[61,90]])a.pointer(b,'pointermove',{clientX,clientY});
    assert.equal(b.style.transform,'translate(0px,50px)');a.pointer(b,'pointermove',{clientX:61,clientY:100});a.pointer(b,'pointermove',{clientX:62,clientY:100});assert.equal(b.style.transform,'translate(1px,60px)');
  }finally{a.close();}
});

test('coalesced pointer points preserve a turn, and pointerup flushes the final position before committing',()=>{
  const a=app();try{let b=dragBoard(a,[piece(0,1,1),piece(1,2,1),piece(2,5,5)]);a.pointer(b,'pointerdown');
    a.pointer(b,'pointermove',{clientX:100,clientY:100,getCoalescedEvents:()=>[{clientX:40,clientY:100},{clientX:100,clientY:100}]},false);
    assert.equal(a.frameCount(),1);a.frame();assert.equal(b.style.transform,'translate(60px,60px)');a.pointer(b,'pointerup',{clientX:100,clientY:100});assert.deepEqual([a.w.__qa.state.blocks[0].x,a.w.__qa.state.blocks[0].y],[2,2]);
    b=dragBoard(a,[piece(0,1,1),piece(1,5,5)]);a.pointer(b,'pointerdown');a.pointer(b,'pointermove',{clientX:60},false);a.pointer(b,'pointerup',{clientX:80},false);
    assert.equal(a.frameCount(),0);assert.equal(a.w.__qa.state.blocks[0].x,2);assert.equal(a.w.__qa.state.moves,1);a.frame();assert.equal(b.isConnected,false);
  }finally{a.close();}
});

test('release settles briefly; re-grabbing preserves its displayed position and pause cancels animation',()=>{
  const a=app();try{const animations=[];a.w.Element.prototype.animate=function(keyframes,options){const animation={cancelled:false,cancel(){this.cancelled=true;}};animations.push({keyframes,options,animation});return animation;};
    const b=dragBoard(a,[piece(0,1,1),piece(1,5,5)]);a.pointer(b,'pointerdown');a.pointer(b,'pointermove',{clientX:60});a.pointer(b,'pointerup',{clientX:60});
    assert.equal(animations.length,1);assert.ok(Math.abs(Number.parseFloat(animations[0].keyframes[0].transform.slice(10))-20)<.01);assert.equal(animations[0].options.duration,100);
    b.getBoundingClientRect=()=>({left:75,top:60});a.get('board').getBoundingClientRect=()=>({left:0,top:0});
    a.pointer(b,'pointerdown',{clientX:140,clientY:80});assert.equal(animations[0].animation.cancelled,true);assert.equal(b.style.transform,'translate(15px,0px)');
    a.pointer(b,'pointermove',{clientX:141,clientY:80});assert.equal(b.style.transform,'translate(16px,0px)');a.pointer(b,'pointerup',{clientX:141,clientY:80});assert.equal(animations.length,2);
    a.click('#pause');assert.equal(animations[1].animation.cancelled,true);assert.equal(a.frameCount(),0);
  }finally{a.close();}
  const quiet=app(null,{reduced:true});try{let animations=0;quiet.w.Element.prototype.animate=()=>{animations++;};const b=dragBoard(quiet,[piece(0,1,1),piece(1,5,5)]);quiet.pointer(b,'pointerdown');quiet.pointer(b,'pointerup',{clientX:60});assert.equal(animations,0);}finally{quiet.close();}
});

test('one held drag follows right, down, left and up, then undoes the entire path once',()=>{
  const a=app();try{const b=dragBoard(a,[piece(0,1,1),piece(1,5,5)]);
    a.pointer(b,'pointerdown');
    for(const [clientX,clientY]of[[160,40],[160,160],[100,160],[100,100]])a.pointer(b,'pointermove',{clientX,clientY});
    assert.equal(b.style.transform,'translate(60px,60px)');assert.equal(a.w.__qa.state.moves,0);
    a.advance(1000);const time=a.w.__qa.state.time;a.pointer(b,'pointerup',{clientX:100,clientY:100});
    assert.deepEqual([a.w.__qa.state.blocks[0].x,a.w.__qa.state.blocks[0].y],[2,2]);assert.equal(a.w.__qa.state.moves,1);assert.equal(a.w.__qa.state.time,time);
    assert.equal(a.saved().history.length,1);a.click('[data-item="undo"]');assert.deepEqual([a.w.__qa.state.blocks[0].x,a.w.__qa.state.blocks[0].y],[1,1]);assert.equal(a.w.__qa.state.time,time);
  }finally{a.close();}
});

test('drag follows both pointer axes, stops at obstacles and can turn around a corner',()=>{
  const a=app();try{let b=dragBoard(a,[piece(0,1,1),piece(1,5,5)]);
    a.pointer(b,'pointerdown');a.pointer(b,'pointermove',{clientX:58,clientY:58});assert.equal(b.style.transform,'translate(18px,18px)');a.pointer(b,'pointercancel');
    b=dragBoard(a,[piece(0,1,1),piece(1,2,1),piece(2,5,5)]);a.pointer(b,'pointerdown');
    a.pointer(b,'pointermove',{clientX:100,clientY:40});assert.equal(b.style.transform,'translate(0px,0px)');
    a.pointer(b,'pointermove',{clientX:100,clientY:100});a.pointer(b,'pointermove',{clientX:160,clientY:100});a.pointer(b,'pointerup',{clientX:160,clientY:100});
    assert.deepEqual([a.w.__qa.state.blocks[0].x,a.w.__qa.state.blocks[0].y],[2,2]);assert.equal(a.w.__qa.state.moves,1);
  }finally{a.close();}
});

test('drag returning to its start or cancellation spends no move and ignores other pointers',()=>{
  const a=app();try{const b=dragBoard(a,[piece(0,1,1),piece(1,5,5)]);
    a.pointer(b,'pointerdown');a.pointer(b,'pointermove',{clientX:160});a.pointer(b,'pointermove',{clientX:280,pointerId:2});a.pointer(b,'pointerup',{clientX:280,pointerId:2});
    assert.equal(b.style.transform,'translate(120px,0px)');a.pointer(b,'pointermove');a.pointer(b,'pointerup');assert.equal(a.w.__qa.state.moves,0);
    for(const cancel of ['pointercancel','lostpointercapture']){a.pointer(b,'pointerdown');a.pointer(b,'pointermove',{clientX:160,clientY:100});a.pointer(b,cancel);a.pointer(b,'pointerup',{clientX:160,clientY:100});assert.equal(a.w.__qa.state.moves,0);assert.equal(b.style.transform,'');}
    assert.equal(a.saved().history.length,0);
  }finally{a.close();}
});

test('a turn during drag reaches its matching exit and merge, while wrong gates stay blocked',()=>{
  for(const mode of ['classic','merge']){const a=app();try{
    const b=dragBoard(a,[piece(0,1,1,mode==='merge'?'coral':'blue'),piece(1,2,mode==='merge'?2:4,'coral'),piece(2,5,5)],mode);
    a.pointer(b,'pointerdown');a.pointer(b,'pointermove',{clientY:100});a.pointer(b,'pointermove',{clientX:mode==='merge'?100:400,clientY:100});
    assert.equal(a.w.__qa.state.blocks.some(b=>b.id===0),false);assert.equal(a.w.__qa.state.moves,1);assert.equal(a.saved().history.length,1);
    if(mode==='merge')assert.equal(a.w.__qa.state.blocks.find(b=>b.id===1).rank,2);else assert.equal(a.w.__qa.state.removed,1);
    a.pointer(b,'pointerup',{clientX:400,clientY:100});assert.equal(a.w.__qa.state.moves,1);
  }finally{a.close();}}
  const a=app();try{const b=dragBoard(a,[piece(0,0,1,'lime'),piece(1,5,5)]);a.pointer(b,'pointerdown');a.pointer(b,'pointermove',{clientX:-200});a.pointer(b,'pointerup',{clientX:-200});assert.equal(a.w.__qa.state.blocks[0].x,0);assert.equal(a.w.__qa.state.moves,0);}finally{a.close();}
});

test('fast diagonal drags cannot tunnel through a wall or cut an occupied corner',()=>{
  const a=app();try{let b=dragBoard(a,[piece(0,1,1),...Array.from({length:6},(_,y)=>piece(y+1,3,y,'coral'))]);
    a.pointer(b,'pointerdown');a.pointer(b,'pointermove',{clientX:2000,clientY:160});a.pointer(b,'pointerup',{clientX:2000,clientY:160});
    assert.equal(a.w.__qa.state.blocks[0].x,2);assert.equal(a.w.__qa.state.blocks[0].y,3);
    b=dragBoard(a,[piece(0,1,1),piece(1,2,1),piece(2,1,2)]);a.pointer(b,'pointerdown');a.pointer(b,'pointermove',{clientX:160,clientY:160});a.pointer(b,'pointerup',{clientX:160,clientY:160});
    assert.deepEqual([a.w.__qa.state.blocks[0].x,a.w.__qa.state.blocks[0].y],[1,1]);assert.equal(a.w.__qa.state.moves,0);
    b=dragBoard(a,[piece(0,1,1),piece(1,2,2)]);a.pointer(b,'pointerdown');a.pointer(b,'pointermove',{clientX:58,clientY:58});
    assert.equal(b.style.transform,'translate(18px,0px)');a.pointer(b,'pointercancel');
  }finally{a.close();}
});

test('items and keyboard input cancel a pending drag instead of later committing stale positions',()=>{
  const a=app();try{let b=dragBoard(a,[piece(0,1,1),piece(1,5,5)]);a.pointer(b,'pointerdown');a.pointer(b,'pointermove',{clientX:100});
    a.click('[data-item="freeze"]');a.pointer(b,'pointerup',{clientX:100});assert.equal(a.w.__qa.state.blocks[0].x,1);assert.equal(a.w.__qa.state.moves,0);assert.equal(a.w.__qa.state.frozen,20);
    b=a.w.document.querySelector('[data-block="0"]');a.pointer(b,'pointerdown');a.pointer(b,'pointermove',{clientX:100});b.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
    a.pointer(b,'pointerup',{clientX:100});assert.deepEqual([a.w.__qa.state.blocks[0].x,a.w.__qa.state.blocks[0].y],[1,2]);assert.equal(a.w.__qa.state.moves,1);
  }finally{a.close();}
});
test('twelve stages progress through real buttons, preview each next gimmick and wait for its explanation',()=>{
  const a=app(null,{lessons:true});try{
    assert.equal(a.get('mode-open'),null);assert.equal(a.w.document.querySelector('[data-mode]'),null);assert.equal(a.get('items').children.length,5);
    for(let stage=1;stage<=12;stage++){
      const s=a.w.__qa.state;assert.equal(s.stage,stage);assert.equal(s.started,true);assert.equal(a.get('stage-number').textContent,String(stage));
      assert.equal(a.get('dock').hidden,!hasGimmick(s,'triple'));assert.equal(a.get('factory-bar').hidden,!hasGimmick(s,'factory'));assert.equal(a.get('lift').hidden,!hasGimmick(s,'lift'));
      if(hasGimmick(s,'key'))assert.ok(a.get('blocks').querySelectorAll('.block-key').length);
      if(hasGimmick(s,'ice'))assert.ok(a.get('blocks').querySelectorAll('.iced').length);
      a.solve();assert.equal(a.get('modal').open,true);assert.match(a.get('modal-content').textContent,/클리어/);assert.ok(a.saved().run.rewarded);assert.equal(a.saved().profile.stage,stage+1);
      assert.match(a.w.document.querySelector('.next-stage').textContent,new RegExp(stageInfo(stage+1).shortTitle));
      a.click('[data-action="next"]');assert.equal(a.w.__qa.state.stage,stage+1);assert.equal(a.w.__qa.state.started,false);assert.equal(a.get('modal').dataset.kind,'ready');
      assert.equal(a.get('modal-title').textContent,stageInfo(stage+1).title);assert.equal(a.w.document.querySelector('.intro-description').textContent,stageInfo(stage+1).description);
      const time=a.w.__qa.state.time,moves=a.w.__qa.state.moves,items=JSON.stringify(a.w.__qa.profile.items);a.advance(5000);a.click('[data-block]');a.click('[data-direction="1,0"]');a.click('[data-item="hammer"]');
      assert.equal(a.w.__qa.state.time,time);assert.equal(a.w.__qa.state.moves,moves);assert.equal(JSON.stringify(a.w.__qa.profile.items),items);a.click('[data-action="start"]');
    }
    assert.equal(a.w.__qa.profile.wins,12);assert.match(stageInfo(13).introLabel,/응용/);assert.deepEqual(a.errors,[]);
  }finally{a.close();}
});
test('pause, modal and hidden page protect time; freeze consumes exactly one item',()=>{
  const a=app();try{
    const start=a.w.__qa.state.time;a.click('#pause');a.advance(5000);assert.equal(a.w.__qa.state.time,start);a.click('[data-action="resume"]');
    a.advance(1000);assert.ok(a.w.__qa.state.time<start);a.click('[data-item="freeze"]');assert.equal(a.w.__qa.profile.items.freeze,2);assert.equal(a.w.__qa.state.frozen,20);
    const frozen=a.w.__qa.state.time;a.advance(3000);assert.equal(a.w.__qa.state.time,frozen);a.click('[data-item="freeze"]');assert.equal(a.w.__qa.profile.items.freeze,2);
    Object.defineProperty(a.w.document,'hidden',{value:true,configurable:true});a.advance(30000);assert.equal(a.w.__qa.state.time,frozen);
  }finally{a.close();}
});
test('hammer can be armed first, undo restores the block but does not refund items, hint selects a legal direction',()=>{
  const a=app();try{
    const count=a.w.__qa.state.blocks.length;a.click('[data-item="hammer"]');a.click('[data-block="0"]');assert.equal(a.w.__qa.state.blocks.length,count-1);assert.equal(a.w.__qa.profile.items.hammer,2);
    a.click('[data-item="undo"]');assert.equal(a.w.__qa.state.blocks.length,count);assert.equal(a.w.__qa.profile.items.hammer,2);assert.equal(a.w.__qa.profile.items.undo,4);
    a.click('[data-item="hint"]');a.advance(50);assert.equal(a.get('hint-arrow').hidden,false);assert.equal(a.w.__qa.profile.items.hint,4);assert.equal(a.get('blocks').querySelectorAll('.selected').length,1);
    assert.ok(a.notes.length);assert.deepEqual(a.errors,[]);
  }finally{a.close();}
});
test('shop debits exact prices; bundle and shared daily reward cannot be claimed twice',()=>{
  const a=app();try{
    a.click('#shop-open');a.click('[data-action="buy"][data-value="magnet"]');assert.equal(a.w.__qa.profile.coins,190);assert.equal(a.w.__qa.profile.items.magnet,3);
    a.click('[data-action="starter"]');assert.equal(a.w.__qa.profile.coins,340);assert.equal(a.w.__qa.profile.items.magnet,4);assert.equal(a.w.document.querySelector('[data-action="starter"]').disabled,true);
    a.click('[data-action="reward-demo"]');assert.equal(a.w.__qa.profile.coins,440);assert.equal(a.w.document.querySelector('[data-action="reward-demo"]').disabled,true);
    a.click('#modal-close');a.click('#pause');a.click('#daily-open');assert.equal(a.w.document.querySelector('[data-action="daily"]').disabled,true);assert.equal(a.w.__qa.profile.coins,440);
  }finally{a.close();}
});
test('winning records coins before modal and reload neither duplicates rewards nor loses level progress',()=>{
  const a=app();let saved;try{a.solve();saved=a.saved();assert.equal(saved.profile.wins,1);assert.equal(saved.profile.levels.classic,2);assert.equal(saved.profile.coins,480);a.click('#modal-close');assert.equal(a.timerCount(),0,'closing a finished result must not restart a clock');a.click('#pause');a.click('[data-action="pass"]');a.click('[data-action="pass-claim"][data-value="3"]');assert.equal(a.w.__qa.profile.coins,600);}finally{a.close();}
  const b=app(saved);try{assert.equal(b.w.__qa.profile.coins,480);assert.equal(b.w.__qa.profile.wins,1);assert.equal(b.get('modal').open,true);b.click('[data-action="next"]');assert.equal(b.w.__qa.state.stage,2);assert.equal(b.w.__qa.state.started,false);}finally{b.close();}
});

test('help or shop during the clear animation still opens the result and next stage',()=>{
  for(const button of ['#help','#shop-open']){const a=app();try{
    a.w.__qa.setState({...a.w.__qa.state,blocks:[piece(0,0,0,'coral')],initial:1,total:1,queue:[],plan:[]});a.click('[data-block="0"]');a.click('[data-direction="0,-1"]');assert.equal(a.w.__qa.state.status,'won');
    a.click(button);a.advance(1000);assert.equal(a.get('modal').dataset.kind,'won');a.click('[data-action="next"]');assert.equal(a.w.__qa.state.stage,2);assert.equal(a.get('modal').dataset.kind,'ready');
  }finally{a.close();}}
});
test('loss recovery debits once, empties dock, and adds 45 seconds; fresh retry preserves spent inventory',()=>{
  const a=app();try{
    a.w.__qa.setState({...a.w.__qa.state,time:.1});a.advance(250);assert.equal(a.w.__qa.state.status,'lost');a.click('[data-action="continue"]');assert.equal(a.w.__qa.profile.coins,230);assert.equal(a.w.__qa.state.time,45);assert.equal(a.get('modal').open,false);
    a.click('[data-item="freeze"]');a.click('#pause');a.click('#restart');a.click('[data-action="restart-confirm"]');assert.equal(a.w.__qa.profile.items.freeze,2);assert.equal(a.w.__qa.state.continues,0);
  }finally{a.close();}
});
test('five consecutive exits activate fever and doubled scores; reduced motion suppresses particle layers',()=>{
  const a=app(null,{reduced:true});try{
    const base=a.w.__qa.state;const blocks=Array.from({length:6},(_,i)=>({id:i,color:i<3?'coral':'lime',x:i%3+(i<3?0:3),y:i<3?0:5,w:1,h:1,rank:1}));
    a.w.__qa.setState({...base,blocks,total:6,initial:6,queue:[],plan:[]});
    for(let i=0;i<5;i++){a.click(`[data-block="${i}"]`);a.click(`[data-direction="0,${i<3?-1:1}"]`);}
    assert.equal(a.w.__qa.combo,5);assert.ok(a.w.__qa.feverUntil>a.w.__qa.activeTime);assert.equal(a.get('fever-banner').hidden,false);assert.ok(a.w.__qa.state.score>500);assert.equal(a.get('fx-layer').querySelectorAll('.particle').length,0);
    a.advance(11000);assert.equal(a.get('fever-banner').hidden,true);
  }finally{a.close();}
});
test('corrupt or blocked storage starts a playable board and settings persist',()=>{
  for(const [saved,opts]of [['{bad',{}],[null,{brokenStorage:true}],[{run:{version:1,blocks:null},profile:{coins:-10}},{}]]){const a=app(saved,opts);try{assert.ok(a.w.__qa.state.blocks.length);assert.equal(a.w.__qa.profile.coins,350);assert.deepEqual(a.errors,[]);}finally{a.close();}}
  const a=app();let saved;try{a.click('#pause');a.click('#settings-open');a.click('[data-action="setting"][data-value="motion"]');assert.ok(a.w.document.body.classList.contains('reduced-motion'));a.click('[data-action="setting"][data-value="sound"]');saved=a.saved();}finally{a.close();}
  const b=app(saved);try{assert.equal(b.w.__qa.profile.sound,false);assert.equal(b.w.__qa.profile.motion,false);}finally{b.close();}
});
test('all local page assets and portfolio links resolve; original games remain linked',()=>{
  for(const page of ['index.html','design.html']){
    const text=readFileSync(new URL(page,root),'utf8');for(const match of text.matchAll(/(?:href|src)="([^"]+)"/g))if(!/^(https?:|#)/.test(match[1]))assert.ok(existsSync(new URL(match[1].split('?')[0].split('#')[0],new URL(page,root))),match[1]);
  }
  const home=readFileSync(new URL('../../index.html',root),'utf8');for(const game of ['block-bloom','merge3','cozy-forest'])assert.match(home,new RegExp('href="games/'+game+'/"'));
});
test('start is touch accessible and reading the ready screen consumes no time',()=>{
  const a=app(null,{ready:true});try{const time=a.w.__qa.state.time;assert.equal(a.get('modal').open,true);a.advance(12000);assert.equal(a.w.__qa.state.time,time);a.click('[data-action="start"]');assert.equal(a.get('modal').open,false);a.advance(1500);assert.ok(a.w.__qa.state.time<time);}finally{a.close();}
});

test('an unread stage briefing survives cancel, reload and tab restoration without spending time or items',()=>{
  const a=app();let saved;try{
    a.solve();a.click('[data-action="next"]');const time=a.w.__qa.state.time;
    a.get('modal').dispatchEvent(new a.w.Event('cancel',{cancelable:true}));a.click('#modal-close');assert.equal(a.get('modal').dataset.kind,'ready');
    a.w.dispatchEvent(new a.w.PageTransitionEvent('pagehide',{persisted:true}));a.w.dispatchEvent(new a.w.PageTransitionEvent('pageshow',{persisted:true}));a.advance(10000);
    assert.equal(a.w.__qa.state.time,time);assert.equal(a.timerCount(),0);saved=a.saved();assert.equal(saved.run.started,false);
  }finally{a.close();}
  const b=app(saved,{ready:true});try{
    assert.equal(b.w.__qa.state.stage,2);assert.equal(b.w.__qa.profile.wins,1);assert.equal(b.w.__qa.profile.coins,480);assert.equal(b.get('modal').dataset.kind,'ready');
    b.advance(12000);assert.equal(b.w.__qa.state.time,saved.run.time);b.click('[data-action="start"]');b.advance(1000);assert.equal(b.w.__qa.state.time,saved.run.time,'new lessons protect time after the briefing too');
    b.click('#pause');b.click('#restart');b.click('[data-action="restart-confirm"]');assert.equal(b.w.__qa.state.stage,2);assert.equal(b.w.__qa.state.seed,saved.run.seed);assert.equal(b.w.__qa.state.started,false);assert.equal(b.w.__qa.profile.stage,2);assert.equal(b.get('modal').dataset.kind,'ready');
  }finally{b.close();}
});

function practice(a){
  const step=lessonStep(a.w.__qa.state);assert.ok(step);a.click(`[data-block="${step.blockId}"]`);
  if(step.action==='lift')a.click('#lift');else for(let i=0;i<Math.abs(step.dx+step.dy);i++)a.click(`[data-direction="${Math.sign(step.dx)},${Math.sign(step.dy)}"]`);
}
function lessonApp(stage=1){return app({profile:{...newProfile(),stage},run:createStage(stage,731),history:[]},{lessons:true});}

test('every new mechanic highlights real steps and protects time, then releases independent play',()=>{
  for(let stage=1;stage<=7;stage++){const a=lessonApp(stage);try{
    let completed=0;const time=a.w.__qa.state.time;
    while(lessonStep(a.w.__qa.state)){
      const step=lessonStep(a.w.__qa.state);assert.equal(a.get('lesson-panel').hidden,false);assert.equal(a.get('items').hidden,true);assert.equal(a.get('lesson-count').textContent,`${step.index+1}/${step.total}`);assert.equal(a.get('lesson-text').textContent,step.text);
      assert.equal(a.w.document.querySelector('.lesson-target').dataset.block,String(step.blockId));assert.equal(a.get('time').textContent,'연습');assert.equal(a.timerCount(),0);
      a.advance(15000);assert.equal(a.w.__qa.state.time,time);assert.equal(a.w.__qa.activeTime,0);practice(a);completed++;
    }
    assert.ok(completed>=2&&completed<=3);assert.equal(a.get('lesson-panel').hidden,true);assert.equal(a.get('items').hidden,false);assert.equal(a.w.document.querySelector('.lesson-target'),null);
    if(a.w.__qa.state.status==='playing'){assert.equal(a.timerCount(),1);a.advance(1000);assert.ok(a.w.__qa.state.time>=time-1.01&&a.w.__qa.state.time<time);}
    else assert.equal(a.w.__qa.state.status,'won');assert.deepEqual(a.errors,[]);
  }finally{a.close();}}
});

test('practice blocks wrong pieces, keyboard axes and item spending; touch cancellation keeps progress',()=>{
  const a=lessonApp();try{
    const items=JSON.stringify(a.w.__qa.profile.items),moves=a.w.__qa.state.moves;Object.defineProperty(a.get('board'),'clientWidth',{value:360,configurable:true});
    a.click('[data-block="1"]');assert.equal(a.w.document.querySelector('.selected'),null);const wrong=a.w.document.querySelector('[data-block="1"]');a.pointer(wrong,'pointerdown',{pointerType:'touch'});a.pointer(wrong,'pointermove',{clientX:200});a.pointer(wrong,'pointerup',{clientX:200});assert.equal(a.w.__qa.state.moves,moves);
    a.click('[data-block="0"]');a.click('[data-direction="1,0"]');a.w.document.querySelector('[data-block="0"]').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(a.w.__qa.state.blocks[0].x,0);
    for(const id of ['hammer','magnet','hint','freeze','undo'])a.click(`[data-item="${id}"]`);a.advance(100);assert.equal(JSON.stringify(a.w.__qa.profile.items),items);
    const b=a.w.document.querySelector('[data-block="0"]');a.pointer(b,'pointerdown',{pointerType:'touch'});a.pointer(b,'pointermove',{clientX:160,clientY:20,pointerType:'touch'});assert.equal(b.style.transform,'translate(0px,-20px)');a.pointer(b,'pointercancel');
    assert.equal(a.w.__qa.state.lessonIndex,0);assert.equal(a.w.__qa.state.moves,moves);assert.equal(a.saved().history.length,0);assert.equal(b.style.transform,'');
    a.pointer(b,'pointerdown',{pointerType:'touch'});a.pointer(b,'pointermove',{clientY:-40,pointerType:'touch'});a.pointer(b,'pointerup',{clientY:-40,pointerType:'touch'});assert.equal(a.w.__qa.state.lessonIndex,1);assert.equal(a.w.__qa.state.removed,1);assert.equal(a.get('lesson-count').textContent,'2/2');
  }finally{a.close();}
});

test('partial practice survives reload and tab return; undo reopens the real step and retry resets it',()=>{
  const a=lessonApp(4);let saved;try{practice(a);assert.equal(a.w.__qa.state.lessonIndex,1);a.w.dispatchEvent(new a.w.PageTransitionEvent('pagehide',{persisted:true}));saved=a.saved();}finally{a.close();}
  const b=app(saved,{lessons:true});try{
    assert.equal(b.w.__qa.state.lessonIndex,1);assert.equal(b.get('lesson-panel').hidden,false);assert.equal(b.w.document.querySelector('.lesson-target').dataset.block,'0');b.w.dispatchEvent(new b.w.PageTransitionEvent('pageshow',{persisted:true}));b.advance(10000);assert.equal(b.w.__qa.state.time,saved.run.time);
    practice(b);assert.equal(b.w.__qa.state.lessonIndex,2);assert.equal(b.get('items').hidden,false);b.advance(1000);const time=b.w.__qa.state.time;b.click('[data-item="undo"]');assert.equal(b.w.__qa.state.lessonIndex,1);assert.equal(b.get('items').hidden,true);b.advance(5000);assert.equal(b.w.__qa.state.time,time);practice(b);assert.equal(b.timerCount(),1);
    b.click('#pause');b.click('#restart');b.click('[data-action="restart-confirm"]');assert.equal(b.w.__qa.state.layoutVersion,2);assert.equal(b.w.__qa.state.lessonIndex,0);assert.equal(b.w.__qa.state.seed,saved.run.seed);b.click('[data-action="start"]');assert.equal(b.get('lesson-count').textContent,'1/2');
  }finally{b.close();}
});

test('elevator practice requires selection and an actual lift; Space cannot bypass its next step',()=>{
  const a=lessonApp(7);try{
    a.click('#lift');assert.equal(a.w.__qa.state.lessonIndex,0);a.click('[data-block="1"]');a.click('#lift');assert.equal(a.w.__qa.state.lessonIndex,0);
    const block=a.w.document.querySelector('[data-block="0"]');a.pointer(block,'pointerdown',{pointerType:'touch'});a.pointer(block,'pointermove',{clientX:180,clientY:100,pointerType:'touch'});a.pointer(block,'pointerup',{clientX:180,clientY:100,pointerType:'touch'});assert.equal(a.w.__qa.state.blocks[0].y,2);assert.equal(a.w.__qa.state.moves,0);
    a.w.document.querySelector('[data-block="0"]').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));assert.equal(a.w.__qa.state.lessonIndex,1);assert.equal(a.w.__qa.state.blocks[0].y,4);assert.equal(a.w.__qa.state.moves,1);
    a.w.document.querySelector('[data-block="0"]').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));assert.equal(a.w.__qa.state.blocks[0].y,4);assert.equal(a.w.__qa.state.moves,1);practice(a);assert.equal(lessonStep(a.w.__qa.state),null);
  }finally{a.close();}
});

test('existing campaign layout and inventory survive reload and an identical retry without introducing a lesson',()=>{
  const run={...createStage(4,887,{layoutVersion:1}),started:true};delete run.layoutVersion;
  const a=app({profile:{...newProfile(),stage:4,coins:987},run,history:[]});try{
    assert.equal(a.w.__qa.state.layoutVersion,1);assert.equal(a.get('lesson-panel').hidden,true);assert.equal(JSON.stringify(a.w.__qa.state.blocks),JSON.stringify(run.blocks));assert.equal(a.w.__qa.profile.coins,987);
    a.click('#pause');a.click('#restart');a.click('[data-action="restart-confirm"]');assert.equal(a.w.__qa.state.layoutVersion,1);assert.equal(JSON.stringify(a.w.__qa.state.blocks),JSON.stringify(run.blocks));a.click('[data-action="start"]');assert.equal(a.get('lesson-panel').hidden,true);a.solve();
  }finally{a.close();}
});

test('legacy mode saves keep their board and economy, explain actual mechanics, then join stage one',()=>{
  const profile=newProfile();delete profile.stage;profile.coins=900;profile.wins=12;profile.levels.ice=7;
  const run={...createLevel('ice',7,5932),started:true,time:100};
  const a=app({run,profile,history:[run]},{ready:true});try{
    assert.equal(a.w.__qa.state.campaignLegacy,true);assert.equal(a.w.__qa.profile.stage,1);assert.equal(a.w.__qa.profile.coins,900);
    assert.equal(JSON.stringify(a.w.__qa.state.blocks),JSON.stringify(run.blocks));assert.match(a.get('stage-label').textContent,/이어서/);
    assert.equal(a.w.document.querySelector('[data-gimmick="key"]'),null);assert.equal(a.w.document.querySelector('[data-gimmick-art]').dataset.gimmickArt,'ice');
    a.advance(4000);assert.equal(a.w.__qa.state.time,100);a.click('[data-action="start"]');a.click('[data-item="undo"]');assert.equal(a.w.__qa.state.started,true);assert.equal(a.w.__qa.profile.items.undo,4);
    a.solve();assert.equal(a.w.__qa.profile.stage,1);assert.equal(a.w.__qa.profile.wins,13);const coins=a.w.__qa.profile.coins;
    a.click('[data-action="next"]');assert.equal(a.w.__qa.state.stage,1);assert.equal(a.w.__qa.state.campaignLegacy,undefined);assert.equal(a.w.__qa.state.started,false);assert.equal(a.w.__qa.profile.coins,coins);assert.deepEqual(a.errors,[]);
  }finally{a.close();}
});
test('visibility changes cancel pointer capture and reset dragged block transforms',()=>{
  const a=app();try{const b=a.w.document.querySelector('[data-block]');a.pointer(b,'pointerdown');a.pointer(b,'pointermove',{clientX:85});assert.ok(b.classList.contains('dragging'));const moves=a.w.__qa.state.moves;
    Object.defineProperty(a.w.document,'hidden',{value:true,configurable:true});a.w.document.dispatchEvent(new a.w.Event('visibilitychange'));assert.equal(b.style.transform,'');assert.equal(b.classList.contains('dragging'),false);assert.equal(a.timerCount(),0);
    Object.defineProperty(a.w.document,'hidden',{value:false,configurable:true});a.w.document.dispatchEvent(new a.w.Event('visibilitychange'));a.pointer(b,'pointerup',{clientX:85});assert.equal(a.w.__qa.state.moves,moves);assert.equal(a.timerCount(),1);
    a.pointer(b,'pointerdown');a.pointer(b,'pointermove',{clientX:90});a.w.dispatchEvent(new a.w.Event('resize'));assert.equal(b.style.transform,'');a.pointer(b,'pointerup',{clientX:90});assert.equal(a.w.__qa.state.moves,moves);
  }finally{a.close();}
});
test('bfcache restores one clock; final page exit releases timers, effects, audio and input listeners',()=>{
  const a=app();try{a.click('[data-block="0"]');a.click('[data-item="hammer"]');assert.ok(a.get('fx-layer').children.length);a.w.dispatchEvent(new a.w.PageTransitionEvent('pagehide',{persisted:true}));assert.equal(a.timerCount(),0);assert.equal(a.get('fx-layer').children.length,0);assert.deepEqual({...a.w.__qa.resources()},{timers:0,sounds:0,outputs:0});
    a.w.dispatchEvent(new a.w.PageTransitionEvent('pageshow',{persisted:true}));a.w.dispatchEvent(new a.w.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(a.timerCount(),1);const time=a.w.__qa.state.time;a.advance(1000);assert.ok(a.w.__qa.state.time<time);
    a.w.dispatchEvent(new a.w.PageTransitionEvent('pagehide',{persisted:false}));assert.equal(a.timerCount(),0);const frozen=a.w.__qa.state.time;a.advance(3000);assert.equal(a.w.__qa.state.time,frozen);assert.equal(a.w.__qa.resources().timers,0);
  }finally{a.close();}
});
test('long press explains an item without spending it and a new run cancels a pending hint',()=>{
  const a=app();try{const b=a.w.document.querySelector('[data-item="hammer"]');a.pointer(b,'pointerdown');a.advance(550);a.pointer(b,'pointerup');b.click();assert.equal(a.w.__qa.profile.items.hammer,3);assert.match(a.get('toast').textContent,/선택 블록/);
    a.click('[data-item="hint"]');a.w.__qa.newRun(4);a.advance(100);assert.equal(a.w.__qa.profile.items.hint,5);assert.equal(a.w.__qa.state.mode,'merge');assert.ok(a.get('hint-arrow').classList.contains('lesson-cue'));
  }finally{a.close();}
});
test('idle HUD ticks avoid rewriting unchanged numbers',()=>{
  const a=app();try{const observer=new a.w.MutationObserver(()=>{});observer.observe(a.w.document.querySelector('.hud'),{childList:true,subtree:true});a.advance(1000);const records=observer.takeRecords();assert.ok(records.length<=2,`${records.length} numeric rewrites`);assert.equal(records.filter(r=>r.target===a.get('coins')).length,0);observer.disconnect();}finally{a.close();}
});
