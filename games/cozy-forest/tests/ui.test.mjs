import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {JSDOM,VirtualConsole}=createRequire(import.meta.url)(process.env.COZY_FOREST_JSDOM||'jsdom');
const root=new URL('../',import.meta.url);
const source=['rules.mjs','art.mjs','game.mjs'].map(file=>readFileSync(new URL(file,root),'utf8').replace(/^import .+;\r?\n/gm,'').replace(/^export /gm,'')).join('\n');
const html=readFileSync(new URL('index.html',root),'utf8'),css=readFileSync(new URL('styles.css',root),'utf8');
const KEY='cozy-forest:v1';
function app(saved=null,{brokenStorage=false,reduced=true}={}) {
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{url:'https://example.test/games/cozy-forest/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const {window:w}=dom;let now=0,nextId=0;const timeouts=new Map(),intervals=new Map(),notes=[];
  w.matchMedia=()=>({matches:reduced});w.performance.now=()=>now;
  w.setTimeout=(fn,ms=0)=>{const id=++nextId;timeouts.set(id,{fn,at:now+ms});return id;};w.clearTimeout=id=>timeouts.delete(id);
  w.setInterval=(fn,ms)=>{const id=++nextId;intervals.set(id,{fn,ms,next:now+ms});return id;};w.clearInterval=id=>intervals.delete(id);
  w.requestAnimationFrame=fn=>w.setTimeout(()=>fn(now),16);w.cancelAnimationFrame=w.clearTimeout;
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  const noop=()=>{};
  w.AudioContext=class {state='running';currentTime=0;destination={};resume(){this.state='running';return Promise.resolve();}suspend(){this.state='suspended';return Promise.resolve();}createOscillator(){return {frequency:{setValueAtTime:f=>notes.push(f),exponentialRampToValueAtTime:noop},connect:noop,start:noop,stop:noop};}createGain(){return {gain:{setValueAtTime:noop,linearRampToValueAtTime:noop,exponentialRampToValueAtTime:noop},connect:noop};}};
  const style=w.document.createElement('style');style.textContent=css;w.document.head.append(style);
  if(saved) w.localStorage.setItem(KEY,typeof saved==='string'?saved:JSON.stringify(saved));
  if(brokenStorage) Object.defineProperty(w,'localStorage',{get(){throw Error('storage unavailable');}});
  w.eval(`${source}\nwindow.__qa={get state(){return state},get profile(){return profile}};`);
  const get=id=>w.document.getElementById(id);
  function click(selector) {const el=w.document.querySelector(selector);assert.ok(el,`missing ${selector}`);assert.notEqual(el.disabled,true,`disabled ${selector}`);el.click();}
  function advance(ms) {
    const until=now+ms;
    while(now<until) {now=Math.min(until,now+100);for(const item of intervals.values()) if(now>=item.next) {item.next=now+item.ms;item.fn();}for(const [id,item] of [...timeouts]) if(now>=item.at) {timeouts.delete(id);item.fn();}}
  }
  function solve({showResult=true}={}) {
    let moves=0;while(w.__qa.state.status==='playing'&&moves++<300) {const id=w.__qa.state.solution.find(id=>w.__qa.state.board.some(t=>t.id===id));click(`[data-tile="${id}"]`);}
    assert.equal(w.__qa.state.status,'won');if(showResult) advance(800);
  }
  function lesson(index) {click('#tutorial-mode');click(`[data-lesson="${index}"]`);}
  return {dom,w,get,click,advance,solve,lesson,notes,errors,close:()=>dom.window.close()};
}
test('items stay on the board; the guide opens separately without activation buttons',()=>{
  const a=app();try {
    assert.equal(a.get('modal').open,true);assert.equal(a.get('board').querySelectorAll('.item-tile').length,3);
    a.click('[data-action="resume"]');a.click('#mobile-items');
    assert.equal(a.get('items').querySelectorAll('.item-explainer').length,5);assert.equal(a.get('items').querySelectorAll('button').length,0);
    assert.equal(a.w.document.querySelector('[data-action="buy-item"]'),null);
    a.click('[data-action="resume"]');a.lesson(3);
    const tray=a.w.__qa.state.tray.length;a.click('[data-board-item="freeze"]');
    assert.equal(a.w.__qa.state.frozen,15);assert.equal(a.w.__qa.state.tray.length,tray);assert.equal(a.get('modal').open,false);
    assert.equal(a.w.__qa.state.used.freeze,1);a.click('#mobile-items');assert.ok(a.get('items').querySelector('[data-item-info="freeze"]').classList.contains('selected'));assert.deepEqual(a.errors,[]);
  }finally {a.close();}
});
test('all six school lessons collect their board item, finish and record graduation',()=>{
  const a=app();try {
    a.click('[data-action="school"]');a.click('[data-lesson="0"]');a.solve();
    for(let lesson=1;lesson<6;lesson++) {a.click('[data-action="next-lesson"]');assert.equal(a.w.__qa.state.lesson,lesson);a.solve();assert.equal(a.w.__qa.state.itemsCollected,1);}
    assert.match(a.get('modal-content').textContent,/졸업/);assert.equal(a.w.__qa.profile.lessons.filter(Boolean).length,6);assert.equal(a.w.__qa.profile.coins,210);
    a.click('[data-action="endless"]');assert.equal(a.w.__qa.state.mode,'endless');assert.deepEqual(a.errors,[]);
  }finally {a.close();}
});
test('stage reward is granted once and survives reload before the result animation ends',()=>{
  const a=app();let saved;try {
    a.click('[data-action="resume"]');a.solve({showResult:false});
    assert.equal(a.w.__qa.profile.level,2);assert.ok(a.w.__qa.profile.coins>=180);saved=a.w.localStorage.getItem(KEY);
    const coins=a.w.__qa.profile.coins;a.advance(800);a.click('#help');a.click('[data-action="resume"]');assert.equal(a.w.__qa.profile.coins,coins);
    a.click('[data-action="next-stage"]');assert.equal(a.w.__qa.state.level,2);
  }finally {a.close();}
  const b=app(saved);try {assert.equal(b.w.__qa.profile.level,2);assert.ok(b.w.__qa.profile.coins>=180);assert.equal(b.w.__qa.state.level,2);}finally {b.close();}
});
test('refresh restores discovered items, remaining board, basket and fever score',()=>{
  const a=app();let saved;try {
    a.click('[data-action="resume"]');a.lesson(5);a.click('[data-board-item="fever"]');a.click('#board .tile:not(:disabled):not(.item-tile)');
    a.w.dispatchEvent(new a.w.Event('pagehide'));saved=a.w.localStorage.getItem(KEY);
  }finally {a.close();}
  const b=app(saved);try {
    const active=JSON.parse(saved).active;assert.equal(b.w.__qa.state.board.length,active.board.length);assert.equal(b.w.__qa.state.tray.length,1);
    assert.equal(b.w.__qa.state.fever,12);assert.equal(b.w.__qa.state.used.fever,1);assert.equal(b.get('modal').open,true);assert.match(b.get('modal-content').textContent,/이어서 산책/);assert.deepEqual(b.errors,[]);
  }finally {b.close();}
});
test('legacy profile keeps records and maps school lessons; invalid storage still plays',()=>{
  const legacy={profile:{best:9999,level:7,coins:432,lessons:Array(11).fill(true),sound:false,welcomed:true},active:{version:1}};
  const a=app(legacy);try {assert.equal(a.w.__qa.profile.best,9999);assert.equal(a.w.__qa.profile.coins,432);assert.equal(a.w.__qa.profile.lessons.filter(Boolean).length,6);assert.equal(a.w.__qa.state.version,2);assert.equal(a.w.__qa.state.level,7);assert.equal(a.w.__qa.profile.inventory,undefined);}finally {a.close();}
  for(const options of [{saved:'{bad json'},{brokenStorage:true}]) {const b=app(options.saved,options);try {b.click('[data-action="resume"]');b.click('#board .tile:not(:disabled):not(.item-tile)');assert.equal(b.w.__qa.state.tray.length,1);assert.deepEqual(b.errors,[]);}finally {b.close();}}
});
test('normal match has a shockwave and larger score pop; fever persists between actions',()=>{
  const a=app(null,{reduced:false});try {
    a.click('[data-action="resume"]');a.lesson(5);a.click('[data-board-item="fever"]');
    assert.ok(a.w.document.querySelector('.game-shell').classList.contains('is-fever'));assert.ok(a.get('fever-flash').classList.contains('show'));
    a.advance(600);assert.ok(a.get('effects').querySelector('.fever-mote'));assert.match(a.get('fever-clock').textContent,/11\./);
    for(let i=0;i<3;i++) {const id=a.w.__qa.state.solution.find(id=>a.w.__qa.state.board.some(t=>t.id===id));a.click(`[data-tile="${id}"]`);}
    assert.ok(a.get('effects').querySelector('.fever-ring'));assert.match(a.get('effects').querySelector('.score-pop:last-of-type')?.textContent||a.get('effects').textContent,/피버 보너스 ×2/);
    assert.ok(a.w.__qa.state.feverScore>0);assert.equal(a.get('fever-earned').textContent,`+${a.w.__qa.state.feverScore.toLocaleString()}`);assert.ok(a.get('forest').classList.contains('fever-hit'));assert.ok(a.notes.includes(1319));
    a.advance(600);const before=a.w.__qa.state.fever;a.click('#pause');a.advance(3000);assert.equal(a.w.__qa.state.fever,before);assert.ok(a.w.document.body.classList.contains('effects-paused'));
    a.click('[data-action="resume"]');a.advance(13000);assert.equal(a.w.__qa.state.fever,0);assert.equal(a.w.document.querySelector('.game-shell').classList.contains('is-fever'),false);assert.ok(a.get('effects').children.length<5);assert.deepEqual(a.errors,[]);
  }finally {a.close();}
});
test('reduced motion disables burst and ambient nodes while preserving fever information',()=>{
  const a=app();try {a.click('[data-action="resume"]');a.lesson(5);a.click('[data-board-item="fever"]');a.advance(700);assert.equal(a.get('effects').children.length,0);assert.ok(a.w.document.querySelector('.game-shell').classList.contains('is-fever'));assert.match(a.get('fever-label').textContent,/2倍|2배/);assert.deepEqual(a.errors,[]);}finally {a.close();}
});
test('rapid clicks do not duplicate item pickups and effect nodes are bounded and cleaned',()=>{
  const a=app(null,{reduced:false});try {
    a.click('[data-action="resume"]');a.lesson(5);const old=a.w.document.querySelector('[data-board-item="fever"]');old.click();old.click();
    assert.equal(a.w.__qa.state.used.fever,1);assert.equal(a.w.__qa.state.itemsCollected,1);
    a.solve({showResult:false});assert.ok(a.get('effects').children.length<=112);a.advance(2200);assert.equal(a.get('effects').children.length,0);assert.deepEqual(a.errors,[]);
  }finally {a.close();}
});
test('timer and effects pause in modals or hidden tabs; timeout and retry are connected',()=>{
  const a=app();try {
    a.click('[data-action="resume"]');a.click('#help');const time=a.w.__qa.state.time;a.advance(5000);assert.equal(a.w.__qa.state.time,time);
    a.click('[data-action="resume"]');Object.defineProperty(a.w.document,'hidden',{value:true,configurable:true});a.w.document.dispatchEvent(new a.w.Event('visibilitychange'));a.advance(5000);assert.equal(a.w.__qa.state.time,time);
    Object.defineProperty(a.w.document,'hidden',{value:false,configurable:true});a.w.document.dispatchEvent(new a.w.Event('visibilitychange'));assert.equal(a.get('modal').open,true);a.click('[data-action="resume"]');a.w.__qa.state.time=.05;a.advance(200);
    assert.match(a.get('modal-content').textContent,/해가 저물었어요/);const seed=a.w.__qa.state.seed;a.click('[data-action="retry"]');assert.equal(a.w.__qa.state.seed,seed);assert.equal(a.w.__qa.state.status,'playing');assert.deepEqual(a.errors,[]);
  }finally {a.close();}
});
test('page cache return cleans effects, pauses play and restarts exactly one timer',()=>{
  const a=app(null,{reduced:false});try {
    a.click('[data-action="resume"]');a.lesson(5);a.click('[data-board-item="fever"]');
    assert.ok(a.get('effects').children.length>0);
    const event=new a.w.Event('pagehide');Object.defineProperty(event,'persisted',{value:true});a.w.dispatchEvent(event);
    const time=a.w.__qa.state.fever;assert.equal(a.get('effects').children.length,0);a.advance(3000);assert.equal(a.w.__qa.state.fever,time);
    const show=new a.w.Event('pageshow');Object.defineProperty(show,'persisted',{value:true});a.w.dispatchEvent(show);a.w.dispatchEvent(show);
    assert.equal(a.get('modal').open,true);a.advance(1000);assert.equal(a.w.__qa.state.fever,time);
    a.click('[data-action="resume"]');a.advance(1000);assert.ok(Math.abs(a.w.__qa.state.fever-(time-1))<.01);assert.deepEqual(a.errors,[]);
  }finally {a.close();}
});

test('an unfinished endless score is saved as a record before refresh',()=>{
  const a=app();let saved;try {
    a.click('[data-action="resume"]');
    while(a.w.__qa.state.saved===0) {const id=a.w.__qa.state.solution.find(id=>a.w.__qa.state.board.some(t=>t.id===id));a.click(`[data-tile="${id}"]`);}
    saved=a.w.localStorage.getItem(KEY);assert.equal(JSON.parse(saved).profile.best,a.w.__qa.state.score);
  }finally {a.close();}
  const b=app(saved);try {assert.ok(b.w.__qa.profile.best>0);assert.equal(b.w.__qa.profile.best,b.w.__qa.state.score);assert.deepEqual(b.errors,[]);}finally {b.close();}
});

test('local links and SVG parse; edited prompts preserve intent and copy works',async()=>{
  const promptHtml=readFileSync(new URL('prompts.html',root),'utf8');
  for(const document of [html,promptHtml]) for(const match of document.matchAll(/(?:src|href)="([^"]+)"/g)) {if(['./','../../'].includes(match[1])||match[1].startsWith('#')) continue;assert.ok(readFileSync(new URL(match[1],root)).length);}
  assert.match(source,/href="prompts\.html/);assert.match(source,/href="\.\.\/\.\.\/"/);
  const a=app();try {const parser=new a.w.DOMParser();for(const svg of a.w.document.querySelectorAll('svg')) assert.equal(parser.parseFromString(svg.outerHTML,'image/svg+xml').querySelector('parsererror'),null);}finally {a.close();}
  const dom=new JSDOM(promptHtml,{url:'https://example.test/prompts.html',runScripts:'outside-only'}),w=dom.window;let copied='';
  try {
    Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}}});w.eval(readFileSync(new URL('prompts.js',root),'utf8'));
    const original=w.document.getElementById('original-prompt').textContent;assert.equal(original.split('\n').length,6);assert.match(original,/HTML5.*모바일/);assert.match(original,/아이템을 약 10종/);assert.match(original,/PD의 판단/);assert.match(original,/완성될 때까지/);
    assert.match(w.document.querySelector('.prompt-intro').textContent,/의도는 유지.*정리본/);assert.match(w.document.getElementById('testing-prompt').textContent,/직접 테스트.*Git에 커밋/);assert.doesNotMatch(promptHtml,/자게|판위|과장 되게|원문 복사|3머지처럼|해줘|네가/);
    w.document.querySelector('[data-copy="original-prompt"]').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(copied,original);assert.match(w.document.getElementById('copy-status').textContent,/복사했어요/);
    w.navigator.clipboard.writeText=async()=>{throw Error('denied');};w.document.querySelector('[data-copy="fever-prompt"]').click();await new Promise(resolve=>setImmediate(resolve));assert.match(w.document.getElementById('copy-status').textContent,/직접 복사/);assert.match(w.getSelection().toString(),/피버 진행/);
  }finally {dom.window.close();}
});
