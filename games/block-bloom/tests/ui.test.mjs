import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createLevel, GATES, COLORS } from '../rules.mjs';

const root=new URL('../',import.meta.url),html=readFileSync(new URL('index.html',root),'utf8');
const source=['rules.mjs','game.mjs'].map(file=>readFileSync(new URL(file,root),'utf8').replace(/^import .+;\r?\n/gm,'').replace(/^export /gm,'')).join('\n');
const KEY='block-bloom:v1';
function app(saved=null,{brokenStorage=false,reduced=false,ready=false}={}) {
  const errors=[],notes=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{url:'https://example.test/games/block-bloom/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
  let now=0,nextId=0;const timeouts=new Map(),intervals=new Map(),noop=()=>{};
  w.matchMedia=()=>({matches:reduced,addEventListener:noop});w.performance.now=()=>now;
  w.setTimeout=(fn,ms=0)=>{const id=++nextId;timeouts.set(id,{fn,at:now+ms});return id;};w.clearTimeout=id=>timeouts.delete(id);
  w.setInterval=(fn,ms)=>{const id=++nextId;intervals.set(id,{fn,ms,next:now+ms});return id;};w.clearInterval=id=>intervals.delete(id);
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
  w.AudioContext=class{state='running';currentTime=0;destination={};resume(){return Promise.resolve();}createGain(){return{gain:{value:0,setValueAtTime:noop,linearRampToValueAtTime:noop,exponentialRampToValueAtTime:noop},connect:noop,disconnect:noop};}createOscillator(){return{type:'sine',frequency:{setValueAtTime:f=>notes.push(f),exponentialRampToValueAtTime:noop},connect:noop,disconnect:noop,start:noop,stop:noop};}};
  if(saved)w.localStorage.setItem(KEY,typeof saved==='string'?saved:JSON.stringify(saved));
  if(brokenStorage)Object.defineProperty(w,'localStorage',{get(){throw Error('storage blocked');}});
  w.eval(source+'\nwindow.__qa={get state(){return state},get profile(){return profile},get combo(){return combo},get feverUntil(){return feverUntil},get activeTime(){return activeTime},setState(s){state=s;history=[];render();},newRun:(mode,level)=>newRun(mode,level,false,true),resources:()=>({timers:effectTimers.size,sounds:oscillators.size,outputs:outputs.size})};');
  if(!ready&&w.document.querySelector('[data-action="start"]'))w.document.querySelector('[data-action="start"]').click();
  const get=id=>w.document.getElementById(id);
  function click(selector){const el=w.document.querySelector(selector);assert.ok(el,'missing '+selector);assert.equal(el.disabled,false,'disabled '+selector);el.click();}
  function advance(ms){const until=now+ms;while(now<until){now=Math.min(until,now+50);for(const item of intervals.values())if(now>=item.next){item.next=now+item.ms;item.fn();}for(const [id,item]of[...timeouts])if(now>=item.at){timeouts.delete(id);item.fn();}}}
  function solve(){const s=w.__qa.state,plan=createLevel(s.mode,s.level,s.seed).plan;for(const action of plan){click(`[data-block="${action.id}"]`);for(let i=0;i<Math.abs(action.dx+action.dy);i++)click(`[data-direction="${Math.sign(action.dx)},${Math.sign(action.dy)}"]`);}assert.equal(w.__qa.state.status,'won');advance(650);}
  function pointer(el,type,props={}){const event=new w.Event(type,{bubbles:true});Object.assign(event,{pointerId:1,button:0,clientX:40,clientY:40,...props});el.dispatchEvent(event);}
  return{dom,w,get,click,advance,solve,notes,errors,pointer,timerCount:()=>intervals.size,saved:()=>JSON.parse(w.localStorage.getItem(KEY)),close:()=>w.close()};
}
test('all six modes load, display their mechanics and complete through actual block and direction buttons',()=>{
  const a=app();try{
    a.click('#mode-open');assert.equal(a.get('modes').children.length,6);a.click('[data-action="resume"]');assert.equal(a.get('items').children.length,5);
    for(const mode of ['classic','triple','merge','key','ice','factory']){
      a.w.__qa.newRun(mode,1);assert.equal(a.get('dock').hidden,mode!=='triple');assert.equal(a.get('factory-bar').hidden,mode!=='factory');
      if(mode==='key')assert.equal(a.get('blocks').querySelectorAll('.block-key').length,4);
      if(mode==='ice')assert.equal(a.get('blocks').querySelectorAll('.iced').length,2);
      a.solve();assert.equal(a.get('modal').open,true);assert.match(a.get('modal-content').textContent,/완벽한 블룸/);assert.ok(a.saved().run.rewarded);
    }
    assert.equal(a.w.__qa.profile.wins,6);assert.deepEqual(a.errors,[]);
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
  const a=app();let saved;try{a.solve();saved=a.saved();assert.equal(saved.profile.wins,1);assert.equal(saved.profile.levels.classic,2);assert.equal(saved.profile.coins,480);a.click('[data-action="pass"]');a.click('[data-action="pass-claim"][data-value="3"]');assert.equal(a.w.__qa.profile.coins,600);}finally{a.close();}
  const b=app(saved);try{assert.equal(b.w.__qa.profile.coins,480);assert.equal(b.w.__qa.profile.wins,1);assert.equal(b.get('modal').open,true);b.click('[data-action="next"]');assert.equal(b.w.__qa.state.level,2);}finally{b.close();}
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
    a.click('[data-item="hint"]');a.w.__qa.newRun('merge',1);a.advance(100);assert.equal(a.w.__qa.profile.items.hint,5);assert.equal(a.w.__qa.state.mode,'merge');assert.equal(a.get('hint-arrow').hidden,true);
  }finally{a.close();}
});
test('idle HUD ticks avoid rewriting unchanged numbers',()=>{
  const a=app();try{const observer=new a.w.MutationObserver(()=>{});observer.observe(a.w.document.querySelector('.hud'),{childList:true,subtree:true});a.advance(1000);const records=observer.takeRecords();assert.ok(records.length<=2,`${records.length} numeric rewrites`);assert.equal(records.filter(r=>r.target===a.get('coins')).length,0);observer.disconnect();}finally{a.close();}
});
