import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { COLORS, createStage, sendShip, failStage, pathClear, upgradeChoices, emptyBuild } from '../rules.mjs';
const root=new URL('../',import.meta.url),KEY='neon-ark:v3';
const html=readFileSync(new URL('index.html',root),'utf8');
const source=['rules.mjs','art.mjs','game.mjs'].map(file=>readFileSync(new URL(file,root),'utf8').replace(/^import .+;\r?\n/gm,'').replace(/^export /gm,'')).join('\n');
const profile={best:1,bestScore:0,runs:1,sound:true,legacyBest:0};
function app(saved=null,{reduced=false,brokenStorage=false,legacy=null}={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://example.test/games/neon-ark/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 let now=0,next=0;const timers=new Map(),noop=()=>{};
 w.matchMedia=()=>({matches:reduced});w.setTimeout=(fn,ms=0)=>{const id=++next;timers.set(id,{fn,at:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){if(!this.open)return;this.removeAttribute('open');w.setTimeout(()=>this.dispatchEvent(new w.Event('close')),0);};
 w.AudioContext=class{state='running';currentTime=0;destination={};resume(){return Promise.resolve();}suspend(){return Promise.resolve();}createOscillator(){return{type:'',frequency:{setValueAtTime:noop},connect:noop,start:noop,stop:noop};}createGain(){return{gain:{setValueAtTime:noop,exponentialRampToValueAtTime:noop},connect:noop};}};
 if(saved)w.localStorage.setItem(KEY,typeof saved==='string'?saved:JSON.stringify(saved));if(legacy)w.localStorage.setItem('neon-ark:v2',JSON.stringify(legacy));
 if(brokenStorage)Object.defineProperty(w,'localStorage',{get(){throw Error('unavailable');}});
 w.eval(`${source}\nwindow.qa={get state(){return state},get profile(){return profile},get history(){return history},get settling(){return settling},get paused(){return paused}};`);
 const get=id=>w.document.getElementById(id),click=selector=>{const el=w.document.querySelector(selector);assert.ok(el,`missing ${selector}`);assert.notEqual(el.disabled,true,`disabled ${selector}`);if(typeof el.click==='function')el.click();else el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));};
 const advance=ms=>{const until=now+ms;while(true){const task=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!task)break;const[id,t]=task;now=t.at;timers.delete(id);t.fn();}now=until;};
 const solve=()=>{for(const id of [...w.qa.state.solution])if(w.qa.state.ships.some(s=>s.id===id)){click(`[data-ship="${id}"]`);advance(5000);}assert.equal(w.qa.state.status,'won');};
 return{w,get,click,advance,solve,errors,close:()=>dom.window.close()};
}
function completedWith(key){for(let seed=1;seed<100;seed++){const s=createStage(1,seed);for(const id of s.solution)sendShip(s,id);if(upgradeChoices(s).includes(key))return{profile,active:s};}throw Error('fixture');}
const jamPath=['s0','s7','s13','s14','s1','s3'];
const jam=a=>{for(const id of jamPath){a.click(`[data-ship="${id}"]`);a.advance(5000);}};

test('exploration has one planet per ship and no enemy HP, lasers, weapons, items or store',()=>{
 const a=app();try{assert.equal(a.get('board').children.length,30);assert.equal(a.get('survey-count').textContent,'0 / 9');assert.equal(a.get('deployed').textContent,'0 / 27명');assert.equal(a.get('enemy-hp'),null);assert.equal(a.w.document.querySelectorAll('.trooper-rifle,.laser-projectile,[data-module]').length,0);assert.equal(a.get('crew').children.length,6);assert.deepEqual(a.errors,[]);}finally{a.close();}
});
test('parking, three visible seats and departure play in order while the final result is already saved',()=>{
 const a=app({profile,active:createStage(1,1)});try{
  const id=a.w.qa.state.solution[0];a.click(`[data-ship="${id}"] .shuttle-body`);assert.equal(a.w.qa.state.launched,1);assert.equal(a.get('survey-count').textContent,'0 / 9');assert.equal(a.w.qa.settling,true);assert.equal(a.get('board').inert,true);
  const saved=JSON.parse(a.w.localStorage.getItem(KEY)).active;assert.equal(saved.launched,1);assert.equal(saved.queue.length,24);assert.equal(saved.ships.length,8);assert.equal(a.get('crew-count').textContent,'27');
  a.advance(239);assert.equal(a.get('docks').querySelector('[data-dock]'),null);a.advance(1);assert.equal(a.get('docks').querySelector('[data-dock="0"]').dataset.loaded,'0');assert.equal(a.get('docks').querySelectorAll('.shuttle-seat.filled').length,0);
  for(let loaded=1;loaded<=3;loaded++){a.advance(129);assert.equal(a.get('docks').querySelector('[data-dock="0"]').dataset.loaded,String(loaded-1));a.advance(1);const dock=a.get('docks').querySelector('[data-dock="0"]');assert.equal(dock.dataset.loaded,String(loaded));assert.equal(dock.querySelectorAll('.shuttle-seat.filled').length,loaded);assert.equal(dock.querySelector('b').textContent,`${loaded}/3`);assert.equal(a.get('crew-count').textContent,String(27-loaded));assert.equal(a.get('survey-count').textContent,'0 / 9');}
  assert.equal(a.get('docks').querySelector('[data-dock="0"]').classList.contains('full'),true);a.advance(119);assert.ok(a.get('docks').querySelector('[data-dock="0"]'));a.advance(1);assert.equal(a.get('docks').querySelector('[data-dock="0"]'),null);assert.ok(a.get('fx').querySelector('.survey-flight'));a.advance(419);assert.equal(a.get('survey-count').textContent,'0 / 9');a.advance(1);assert.equal(a.get('survey-count').textContent,'1 / 9');assert.equal(a.get('deployed').textContent,'3 / 27명');assert.equal(a.w.qa.settling,false);assert.equal(a.get('board').inert,false);a.advance(1500);assert.equal(a.get('fx').children.length,0);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});
test('all departures finish before clear rewards replace the puzzle',()=>{
 const a=app();try{const ids=[...a.w.qa.state.solution];for(const id of ids){a.click(`[data-ship="${id}"]`);if(a.w.qa.state.status==='won'){assert.equal(a.get('upgrade-choice').hidden,true);assert.equal(a.get('puzzle-area').hidden,false);}a.advance(5000);}assert.equal(a.get('survey-count').textContent,'9 / 9');assert.equal(a.get('deployed').textContent,'27 / 27명');assert.equal(a.get('upgrade-choice').hidden,false);assert.match(a.get('upgrade-choice').textContent,/셔틀 9대 출발/);assert.match(a.get('upgrade-choice').textContent,/27명 전원 수송/);assert.deepEqual(a.errors,[]);}finally{a.close();}
});
test('a real dock jam shows actual hull loss and cannot be undone or rewarded',()=>{
 const a=app({profile,active:createStage(3,1)});try{jam(a);assert.equal(a.w.qa.state.status,'failed');assert.equal(a.get('hull').textContent,'2 / 3');assert.equal(a.get('undo').disabled,true);assert.match(a.get('upgrade-choice').textContent,/도크 포화/);assert.equal(a.w.document.querySelectorAll('[data-upgrade]').length,0);assert.equal(a.get('puzzle-area').hidden,false);assert.ok(a.w.document.querySelector('[data-action="retry"]'));assert.deepEqual(a.errors,[]);}finally{a.close();}
});
test('reload and retry never refund damage or used recalls',()=>{
 const a=app({profile,active:createStage(3,1)});let saved;try{a.click('[data-ship="s0"]');a.advance(5000);a.click('#undo');jam(a);saved=a.w.localStorage.getItem(KEY);}finally{a.close();}
 const b=app(saved);try{assert.equal(b.w.qa.state.hull,2);assert.equal(b.w.qa.state.undoUsed,1);b.click('[data-action="retry"]');assert.equal(b.w.qa.state.hull,2);assert.equal(b.get('undo-output').textContent,'0 / 1회');assert.equal(b.w.qa.state.attempts,2);b.click('[data-ship="s0"]');assert.equal(b.get('undo').disabled,true);assert.deepEqual(b.errors,[]);}finally{b.close();}
});
test('voluntary reset explains and charges hull before offering a retry',()=>{
 const a=app();try{a.click('#restart');assert.match(a.get('modal-content').textContent,/3 → 2/);a.click('[data-action="abort"]');assert.equal(a.w.qa.state.status,'failed');assert.equal(a.w.qa.state.hull,2);a.click('[data-action="retry"]');assert.equal(a.w.qa.state.status,'playing');assert.equal(a.w.qa.state.hull,2);assert.equal(a.w.qa.state.moves,0);assert.deepEqual(a.errors,[]);}finally{a.close();}
});
test('three failed attempts end the run, with no retry or undo loophole',()=>{
 const a=app({profile,active:createStage(3,1)});try{for(let i=0;i<3;i++){jam(a);if(i<2)a.click('[data-action="retry"]');}assert.equal(a.w.qa.state.status,'lost');assert.equal(a.get('hull').textContent,'0 / 3');assert.equal(a.get('undo').disabled,true);assert.equal(a.get('restart').disabled,true);assert.equal(a.w.document.querySelector('[data-action="retry"]'),null);a.click('#upgrade-choice [data-action="new-run"]');assert.equal(a.w.qa.state.stage,1);assert.equal(a.w.qa.state.hull,3);assert.deepEqual(a.errors,[]);}finally{a.close();}
});
test('scan, recall, dock and armor descriptions preview exact effects and apply once',()=>{
 for(const[key,pattern]of [['scan',/앞 6명.*앞 9명/s],['recall',/항로당 1회.*항로당 2회/s],['dock',/3칸.*4칸/s],['armor',/선체 3\/3.*선체 4\/4/s]]){
 const a=app(completedWith(key));try{assert.equal(a.w.document.querySelector('[data-action="confirm-upgrade"]').disabled,true);a.click(`[data-upgrade="${key}"]`);assert.match(a.get('upgrade-detail').textContent,pattern);assert.ok(a.get('upgrade-detail').querySelector('.effect-example'));assert.equal(a.w.qa.state.build[key],0);const confirm=a.w.document.querySelector('[data-action="confirm-upgrade"]');confirm.click();confirm.click();assert.equal(a.w.qa.state.stage,2);assert.equal(a.w.qa.state.build[key],1);if(key==='scan')assert.equal(a.get('crew').children.length,9);if(key==='dock')assert.equal(a.get('docks').children.length,4);if(key==='recall')assert.equal(a.get('undo-output').textContent,'2 / 2회');assert.deepEqual(a.errors,[]);}finally{a.close();}
 }
});
test('selection and exact effects survive reload without rerolling or granting a reward',()=>{
 const a=app(completedWith('scan'));let saved;try{a.click('[data-upgrade="scan"]');saved=a.w.localStorage.getItem(KEY);}finally{a.close();}
 const b=app(saved);try{assert.match(b.get('upgrade-detail').textContent,/관측 배열/);assert.equal(b.w.qa.state.build.scan,0);b.click('[data-action="confirm-upgrade"]');assert.equal(b.w.qa.state.build.scan,1);}finally{b.close();}
});
test('v2 records remain separate and old active combat state is never treated as an exploration run',()=>{
 const legacy={profile:{best:8,bestScore:50000,sound:false},active:{version:2,stage:8,hp:100}};const a=app(null,{legacy});try{assert.equal(a.w.qa.state.version,3);assert.equal(a.w.qa.state.stage,1);assert.equal(a.w.qa.profile.legacyBest,8);assert.equal(a.w.qa.profile.best,1);assert.equal(a.w.qa.profile.sound,false);assert.ok(a.w.localStorage.getItem('neon-ark:v2'));assert.match(a.get('legacy-record').textContent,/8/);assert.deepEqual(a.errors,[]);}finally{a.close();}
});
test('reduced motion keeps exact exploration outcomes without particles or an input delay',()=>{
 const a=app(null,{reduced:true});try{a.solve();assert.equal(a.get('survey-count').textContent,'9 / 9');assert.equal(a.w.qa.settling,false);assert.equal(a.get('fx').children.length,0);assert.deepEqual(a.errors,[]);}finally{a.close();}
});
test('pause or hidden tab completes committed arrivals and clears queued visual work',()=>{
 const a=app({profile,active:createStage(1,1)});try{a.click(`[data-ship="${a.w.qa.state.solution[0]}"]`);a.click('#pause');assert.equal(a.w.qa.settling,false);assert.equal(a.get('survey-count').textContent,'1 / 9');const before=JSON.stringify(a.w.qa.state);a.w.document.querySelector('[data-ship]').click();assert.equal(JSON.stringify(a.w.qa.state),before);a.advance(3000);assert.equal(a.get('fx').children.length,0);a.click('[data-action="close"]');assert.deepEqual(a.errors,[]);}finally{a.close();}
});
test('final sector has an explicit ending and cannot generate a tenth sector',()=>{
 const a=app({profile,active:createStage(9,1)});try{a.solve();assert.match(a.get('upgrade-choice').textContent,/9개 항로/);assert.equal(a.w.document.querySelectorAll('[data-upgrade]').length,0);assert.ok(a.w.document.querySelector('#upgrade-choice [data-action="new-run"]'));assert.deepEqual(a.errors,[]);}finally{a.close();}
});
test('local sprites and upgrade icons exist, and storage failure does not prevent a full puzzle',()=>{
 for(const saved of [null,'{bad']){const a=app(saved,{brokenStorage:saved===null});try{a.solve();for(const img of a.w.document.querySelectorAll('img'))assert.ok(existsSync(new URL(img.getAttribute('src'),root)));assert.deepEqual(a.errors,[]);}finally{a.close();}}
});

test('mission menu pauses the board, finishes committed arrivals, and resumes without a cost',()=>{
 const a=app({profile,active:createStage(1,1)});try{
  a.click(`[data-ship="${a.w.qa.state.solution[0]}"]`);a.click('#menu');
  assert.equal(a.get('mission').open,true);assert.equal(a.get('modal').open,false);assert.equal(a.w.qa.paused,true);assert.equal(a.w.qa.settling,false);assert.equal(a.get('survey-count').textContent,'1 / 9');assert.equal(a.get('board').inert,true);
  const before=JSON.stringify(a.w.qa.state);a.w.document.querySelector('[data-ship]').click();a.advance(3000);assert.equal(JSON.stringify(a.w.qa.state),before);assert.equal(a.get('fx').children.length,0);
  a.click('#resume');a.advance(1);assert.equal(a.get('mission').open,false);assert.equal(a.w.qa.paused,false);assert.equal(a.get('board').inert,false);assert.equal(JSON.stringify(a.w.qa.state),before);
  a.click(`[data-ship="${a.w.qa.state.solution.find(id=>a.w.qa.state.ships.some(s=>s.id===id))}"]`);assert.equal(a.w.qa.state.moves,2);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('mission menu hands off to help, build and new-run dialogs without losing pause state',()=>{
 for(const selector of ['#help','[data-inspect="dock"]','#new-run']){
  const a=app({profile,active:createStage(3,1,{...emptyBuild(),dock:1})});try{
   a.click('#menu');a.click(selector);a.advance(1);
   assert.equal(a.get('mission').open,false);assert.equal(a.get('modal').open,true);assert.equal(a.w.document.querySelectorAll('dialog[open]').length,1);assert.equal(a.w.qa.paused,true);assert.equal(a.w.document.querySelector('.game-shell').classList.contains('paused'),true);assert.equal(a.get('board').inert,true);
   const before=JSON.stringify(a.w.qa.state);a.w.document.querySelector('[data-ship]').click();assert.equal(JSON.stringify(a.w.qa.state),before);
   a.click('#modal-close');a.advance(1);assert.equal(a.w.qa.paused,false);assert.equal(a.get('board').inert,false);assert.deepEqual(a.errors,[]);
  }finally{a.close();}
 }
});

test('hidden-tab and page restoration preserve progress, keep dialogs singular and clear effects',()=>{
 const a=app({profile,active:createStage(1,1)});try{
  a.click(`[data-ship="${a.w.qa.state.solution[0]}"]`);a.advance(100);
  Object.defineProperty(a.w.document,'hidden',{value:true,configurable:true});a.w.document.dispatchEvent(new a.w.Event('visibilitychange'));
  assert.equal(a.w.qa.settling,false);assert.equal(a.get('survey-count').textContent,'1 / 9');assert.equal(a.get('modal').open,true);assert.equal(a.w.qa.paused,true);assert.equal(a.get('fx').children.length,0);
  const saved=a.w.localStorage.getItem(KEY);a.w.dispatchEvent(new a.w.Event('pagehide'));Object.defineProperty(a.w.document,'hidden',{value:false,configurable:true});a.w.document.dispatchEvent(new a.w.Event('visibilitychange'));a.w.dispatchEvent(new a.w.Event('pageshow'));a.advance(3000);
  assert.equal(a.w.localStorage.getItem(KEY),saved);assert.equal(a.w.document.querySelectorAll('dialog[open]').length,1);assert.equal(a.get('fx').children.length,0);assert.equal(a.w.qa.state.hull,3);
  a.click('#modal-close');a.advance(1);a.click('#menu');Object.defineProperty(a.w.document,'hidden',{value:true,configurable:true});a.w.document.dispatchEvent(new a.w.Event('visibilitychange'));assert.equal(a.get('mission').open,true);assert.equal(a.get('modal').open,false);assert.equal(a.w.qa.paused,true);a.click('#mission-close');a.advance(1);assert.equal(a.w.qa.paused,false);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('failure board inspection never refunds hull or recall before a retry',()=>{
 const a=app({profile,active:createStage(3,1)});try{
  a.click('[data-ship="s0"]');a.advance(5000);a.click('#undo');jam(a);const before=JSON.stringify(a.w.qa.state);
  a.click('[data-action="inspect-failure"]');assert.equal(a.get('arena').classList.contains('inspect-failure'),true);assert.equal(a.get('docks').classList.contains('jammed'),true);assert.equal(a.get('board').inert,true);a.w.document.querySelector('[data-ship]').click();assert.equal(JSON.stringify(a.w.qa.state),before);assert.equal(a.get('undo').disabled,true);
  a.click('#restart');assert.equal(a.w.qa.state.status,'playing');assert.equal(a.w.qa.state.hull,2);assert.equal(a.w.qa.state.undoUsed,1);assert.equal(a.w.qa.state.attempts,2);assert.equal(a.get('arena').classList.contains('inspect-failure'),false);assert.equal(a.get('docks').classList.contains('jammed'),false);assert.equal(a.get('undo').disabled,true);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('five docks and fifteen visible explorers render a fully upgraded late-stage board',()=>{
 const a=app({profile,active:createStage(9,1,{dock:2,scan:3,recall:2,armor:1})});try{
  assert.equal(a.get('docks').children.length,5);assert.equal(a.get('docks').classList.contains('expanded'),true);assert.equal(a.get('crew').children.length,15);assert.equal(a.get('crew').classList.contains('extended'),true);assert.equal(a.get('queue-hidden').textContent,'+48');assert.equal(a.get('hull').textContent,'4 / 4');assert.equal(a.get('undo-output').textContent,'3 / 3회');assert.equal(a.get('board').children.length,30);assert.equal(a.w.document.querySelectorAll('[data-ship]').length,21);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('mixed boarding visibly follows the front queue across three docks before each departure',()=>{
 const active=createStage(3,1);sendShip(active,'s14');sendShip(active,'s13');const queue=[...active.queue];
 const a=app({profile,active});try{
  a.click('[data-ship="s12"]');assert.equal(a.w.qa.state.launched,3);assert.equal(a.get('crew-count').textContent,'45');
  let time=0;const at=ms=>{a.advance(ms-time);time=ms;};
  for(const[t,dock,loaded,remaining,arrivals]of [[370,2,1,44,0],[500,0,1,43,0],[630,0,2,42,0],[760,2,2,41,0],[890,0,3,40,0],[1560,1,1,39,1],[1690,2,3,38,1],[2360,1,2,37,2],[2490,1,3,36,2]]){
   at(t);const shuttle=a.get('docks').querySelector(`[data-dock="${dock}"]`);assert.ok(shuttle);assert.equal(shuttle.dataset.loaded,String(loaded));assert.equal(shuttle.querySelectorAll('.shuttle-seat.filled').length,loaded);assert.equal(a.get('crew-count').textContent,String(remaining));assert.equal(a.get('survey-count').textContent,`${arrivals} / 15`);
   const front=queue[queue.length-remaining];assert.equal(a.get('next-color').textContent,COLORS[front].name);assert.match(a.get('crew').firstElementChild.getAttribute('aria-label'),new RegExp(COLORS[front].name));
   for(const ship of active.ships.filter(s=>s.id!=='s12'))assert.equal(a.w.document.querySelector(`[data-ship="${ship.id}"]`).classList.contains('front-match'),ship.color===front);
  }
  at(3029);assert.equal(a.get('survey-count').textContent,'2 / 15');assert.equal(a.w.qa.settling,true);at(3030);assert.equal(a.get('survey-count').textContent,'3 / 15');assert.equal(a.get('deployed').textContent,'9 / 45명');assert.equal(a.get('docks').querySelectorAll('[data-dock]').length,0);assert.equal(a.w.qa.settling,false);assert.equal(a.get('crew-count').textContent,'36');assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('partial boarding updates the front-color guide and only unlocks recall after parking completes',()=>{
 const active=createStage(3,1),front=active.queue[0];const a=app({profile,active});try{
  a.click('[data-ship="s0"]');assert.equal(a.get('undo').disabled,true);assert.equal(a.w.qa.settling,true);const committed=JSON.stringify(a.w.qa.state);a.w.document.querySelector('[data-ship]').click();assert.equal(JSON.stringify(a.w.qa.state),committed);
  a.advance(239);assert.equal(a.get('undo').disabled,true);a.advance(1);assert.equal(a.get('docks').querySelector('[data-dock="0"]').dataset.loaded,'0');assert.equal(a.get('undo').disabled,true);a.advance(129);assert.equal(a.get('undo').disabled,true);a.advance(1);
  assert.equal(a.get('docks').querySelector('[data-dock="0"]').dataset.loaded,'1');assert.equal(a.w.qa.settling,false);assert.equal(a.get('undo').disabled,false);assert.notEqual(a.w.qa.state.queue[0],front);assert.equal(a.get('next-color').textContent,COLORS[a.w.qa.state.queue[0]].name);
  for(const ship of a.w.qa.state.ships)assert.equal(a.w.document.querySelector(`[data-ship="${ship.id}"]`).classList.contains('front-match'),ship.color===a.w.qa.state.queue[0]);
  a.click('#undo');assert.equal(a.w.qa.state.moves,0);assert.equal(a.w.qa.state.undoUsed,1);assert.equal(a.get('crew-count').textContent,'45');assert.equal(a.get('docks').querySelectorAll('[data-dock]').length,0);assert.equal(a.get('next-color').textContent,COLORS[front].name);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('reload during boarding restores the committed result without repeating passengers or launches',()=>{
 const a=app({profile,active:createStage(1,1)});let saved;try{
  a.click(`[data-ship="${a.w.qa.state.solution[0]}"]`);a.advance(500);assert.equal(a.get('docks').querySelector('[data-dock="0"]').dataset.loaded,'2');assert.equal(a.get('survey-count').textContent,'0 / 9');saved=a.w.localStorage.getItem(KEY);
 }finally{a.close();}
 const b=app(saved);try{assert.equal(b.get('survey-count').textContent,'1 / 9');assert.equal(b.get('crew-count').textContent,'24');assert.equal(b.get('docks').querySelector('[data-dock]'),null);assert.equal(b.w.qa.settling,false);b.advance(5000);assert.equal(b.w.qa.state.launched,1);b.solve();assert.equal(b.get('survey-count').textContent,'9 / 9');assert.equal(b.get('deployed').textContent,'27 / 27명');assert.deepEqual(b.errors,[]);}finally{b.close();}
});

test('interrupting a failing parking animation preserves its hull loss and spent recall on reload',()=>{
 for(const interrupt of ['pause','hidden']){
  const a=app({profile,active:createStage(3,1)});let saved;try{
   a.click('[data-ship="s0"]');a.advance(5000);a.click('#undo');for(const id of jamPath.slice(0,-1)){a.click(`[data-ship="${id}"]`);a.advance(5000);}a.click(`[data-ship="${jamPath.at(-1)}"]`);assert.equal(a.w.qa.state.status,'failed');assert.equal(a.w.qa.state.hull,2);assert.equal(a.w.qa.state.undoUsed,1);assert.equal(a.w.qa.settling,true);assert.equal(a.get('hull').textContent,'3 / 3');a.advance(100);
   if(interrupt==='pause')a.click('#pause');else{Object.defineProperty(a.w.document,'hidden',{value:true,configurable:true});a.w.document.dispatchEvent(new a.w.Event('visibilitychange'));}
   assert.equal(a.get('hull').textContent,'2 / 3');assert.equal(a.w.qa.settling,false);assert.equal(a.get('fx').children.length,0);a.advance(5000);assert.equal(a.w.qa.state.hull,2);saved=a.w.localStorage.getItem(KEY);assert.deepEqual(a.errors,[]);
  }finally{a.close();}
  const b=app(saved);try{assert.equal(b.w.qa.state.hull,2);assert.equal(b.w.qa.state.undoUsed,1);b.click('[data-action="retry"]');assert.equal(b.w.qa.state.hull,2);assert.equal(b.w.qa.state.undoUsed,1);assert.equal(b.get('undo').disabled,true);assert.deepEqual(b.errors,[]);}finally{b.close();}
 }
});

test('four direction glyphs, matching colors and clear paths agree with the actual puzzle rules',()=>{
 for(const stage of [1,3]){
  const a=app({profile,active:createStage(stage,1)});try{
   const seen=new Set();for(const ship of a.w.qa.state.ships){const el=a.w.document.querySelector(`[data-ship="${ship.id}"]`),open=pathClear(a.w.qa.state.ships,ship);seen.add(ship.dir);assert.ok(el.querySelector('.direction-glyph'));assert.equal(el.classList.contains(`heading-${ship.dir}`),true);assert.equal(el.style.getPropertyValue('--angle'),`${ship.dir*90}deg`);assert.match(el.getAttribute('aria-label'),new RegExp(['위','오른쪽','아래','왼쪽'][ship.dir]+' 방향'));assert.equal(el.classList.contains('can-exit'),open);assert.equal(el.classList.contains('blocked'),!open);assert.equal(el.classList.contains('front-match'),ship.color===a.w.qa.state.queue[0]);}
   if(stage===3)assert.equal(seen.size,4);else{const target=a.get('board').querySelector('.tutorial-target');assert.ok(target);assert.ok(target.classList.contains('front-match'));assert.ok(target.classList.contains('can-exit'));assert.equal(a.get('move-hint').textContent,`${COLORS[a.w.qa.state.queue[0]].name} 셔틀 터치`);}assert.deepEqual(a.errors,[]);
  }finally{a.close();}
 }
});

test('blocked shuttle input marks its nearest obstacle without spending a move or boarding anyone',()=>{
 const a=app({profile,active:createStage(3,1)});try{
  const ship=a.w.qa.state.ships.find(s=>!pathClear(a.w.qa.state.ships,s)),[dx,dy]=[[0,-1],[1,0],[0,1],[-1,0]][ship.dir];const blocker=a.w.qa.state.ships.filter(s=>s.id!==ship.id&&(dx?s.y===ship.y&&(s.x-ship.x)*dx>0:s.x===ship.x&&(s.y-ship.y)*dy>0)).sort((x,y)=>Math.abs(x.x-ship.x)+Math.abs(x.y-ship.y)-Math.abs(y.x-ship.x)-Math.abs(y.y-ship.y))[0];
  const before=JSON.stringify(a.w.qa.state);a.click(`[data-ship="${ship.id}"]`);assert.equal(JSON.stringify(a.w.qa.state),before);assert.ok(a.w.document.querySelector(`[data-ship="${blocker.id}"]`).classList.contains('obstacle'));assert.ok(a.get('fx').querySelector('.drive-route'));assert.equal(a.get('fx').querySelector('.park-flight'),null);assert.equal(a.w.qa.settling,false);assert.match(a.get('message').textContent,/앞이 막혔어요/);a.advance(1200);assert.equal(a.get('board').querySelector('.obstacle'),null);assert.equal(a.get('fx').children.length,0);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});
