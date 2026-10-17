import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {JSDOM,VirtualConsole}=createRequire(import.meta.url)(process.env.COZY_FOREST_JSDOM||'jsdom');
const root=new URL('../',import.meta.url);
const source=['rules.mjs','art.mjs','game.mjs'].map(file=>readFileSync(new URL(file,root),'utf8').replace(/^import .+;\r?\n/gm,'').replace(/^export /gm,'')).join('\n');
const html=readFileSync(new URL('index.html',root),'utf8');
const css=readFileSync(new URL('styles.css',root),'utf8');
const KEY='cozy-forest:v1';
function app(saved=null,{brokenStorage=false}={}) {
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM(html,{url:'https://example.test/games/cozy-forest/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const {window:w}=dom;let now=0,nextId=0;
  const timeouts=new Map(),intervals=new Map();
  w.matchMedia=()=>({matches:true});w.performance.now=()=>now;
  w.setTimeout=(fn,ms=0)=>{const id=++nextId;timeouts.set(id,{fn,at:now+ms});return id;};
  w.clearTimeout=id=>timeouts.delete(id);w.setInterval=(fn,ms)=>{const id=++nextId;intervals.set(id,{fn,ms,next:now+ms});return id;};
  w.clearInterval=id=>intervals.delete(id);
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  const style=w.document.createElement('style');style.textContent=css;w.document.head.append(style);
  if(saved) w.localStorage.setItem(KEY,typeof saved==='string'?saved:JSON.stringify(saved));
  if(brokenStorage) Object.defineProperty(w,'localStorage',{get(){throw Error('storage unavailable');}});
  w.eval(`${source}\nwindow.__qa={get state(){return state},get profile(){return profile}};`);
  const get=id=>w.document.getElementById(id);
  function click(selector) {const element=w.document.querySelector(selector);assert.ok(element,`missing ${selector}`);assert.equal(element.disabled,false,`disabled ${selector}`);element.click();}
  function advance(ms) {
    const until=now+ms;
    while(now<until) {
      now=Math.min(until,now+100);
      for(const item of intervals.values()) if(now>=item.next) {item.next=now+item.ms;item.fn();}
      for(const [id,item] of [...timeouts]) if(now>=item.at) {timeouts.delete(id);item.fn();}
    }
  }
  function use(id) {click(`#items [data-item="${id}"]`);click('[data-action="use-item"]');if(id==='hammer') click('#board .tile:not(:disabled)');}
  function solve() {
    for(const id of [...w.__qa.state.solution]) {const tile=w.document.querySelector(`[data-tile="${id}"]`);if(tile) {assert.equal(tile.disabled,false);tile.click();}}
    assert.equal(w.__qa.state.status,'won');advance(800);
  }
  return {dom,w,get,click,advance,use,solve,errors,close:()=>dom.window.close()};
}
test('welcome, single input, purchase, pause, sound and resume are connected',()=>{
  const a=app();try {
    assert.equal(a.get('modal').open,true);assert.equal(a.get('board').querySelectorAll('.tile').length,30);
    const time=a.w.__qa.state.time;a.advance(3000);assert.equal(a.w.__qa.state.time,time);
    a.click('[data-action="resume"]');a.advance(1000);assert.ok(a.w.__qa.state.time<time);
    a.click('#board .tile:not(:disabled)');assert.equal(a.w.__qa.state.tray.length,1);
    a.click('#items [data-item="magnet"]');const paused=a.w.__qa.state.time;a.advance(1000);assert.equal(a.w.__qa.state.time,paused);
    a.click('[data-action="buy-item"]');assert.equal(a.w.__qa.profile.coins,115);assert.equal(a.w.__qa.profile.inventory.magnet,4);
    a.click('[data-action="use-item"]');assert.equal(a.w.__qa.state.saved,3);assert.equal(a.w.__qa.profile.inventory.magnet,3);
    a.click('#pause');a.click('[data-action="sound"]');assert.equal(a.get('sound').getAttribute('aria-pressed'),'false');
    a.click('[data-action="sound"]');assert.equal(a.get('sound').getAttribute('aria-pressed'),'true');
    a.click('[data-action="resume"]');assert.equal(a.get('modal').open,false);assert.deepEqual(a.errors,[]);
  }finally {a.close();}
});
test('clearing a stage awards coins and an item once and unlocks the next stage',()=>{
  const a=app();try {
    a.click('[data-action="resume"]');a.solve();
    assert.equal(a.w.__qa.profile.level,2);assert.ok(a.w.__qa.profile.coins>=180);assert.equal(a.w.__qa.profile.inventory.magnet,4);
    assert.match(a.get('modal-content').textContent,/모두 집으로/);const coins=a.w.__qa.profile.coins;
    a.click('#help');a.click('[data-action="resume"]');assert.equal(a.w.__qa.profile.coins,coins);
    a.click('[data-action="next-stage"]');assert.equal(a.w.__qa.state.level,2);assert.equal(a.get('modal').open,false);
  }finally {a.close();}
});
test('all ten item lessons require actual use, finish, and record graduation',()=>{
  const a=app();try {
    a.click('[data-action="school"]');a.click('[data-lesson="0"]');a.solve();
    for(let lesson=1;lesson<=10;lesson++) {
      a.click('[data-action="next-lesson"]');
      assert.equal(a.w.__qa.state.lesson,lesson);
      const item=a.get('items').querySelector('.recommended').dataset.item;
      a.use(item);assert.equal(a.w.__qa.state.used[item],1);assert.equal(a.get('lesson-check').textContent,'✓ 배웠어요');
      a.use('shuffle');a.solve();
    }
    assert.match(a.get('modal-content').textContent,/졸업/);assert.equal(a.w.__qa.profile.lessons.filter(Boolean).length,11);
    assert.equal(a.w.__qa.profile.coins,260);assert.ok(Object.values(a.w.__qa.profile.inventory).every(quantity=>quantity===3));
    a.click('[data-action="endless"]');assert.equal(a.w.__qa.state.mode,'endless');assert.deepEqual(a.errors,[]);
  }finally {a.close();}
});
test('lesson completion is gated until the required item is used',()=>{
  const a=app();try {
    a.click('[data-action="school"]');a.click('[data-lesson="4"]');
    const order=[...a.w.__qa.state.solution];
    for(const id of order) a.click(`[data-tile="${id}"]`);
    assert.equal(a.w.__qa.state.status,'playing');assert.equal(a.w.__qa.state.tray.length,2);assert.equal(a.get('modal').open,true);
    a.click('[data-action="use-item"]');assert.equal(a.w.__qa.state.used.hint,1);
    a.click('#board .tile:not(:disabled)');a.advance(800);assert.equal(a.w.__qa.profile.lessons[4],true);
  }finally {a.close();}
});
test('refresh restores board, tray, wallet and remaining time; hammer target resets',()=>{
  const a=app();let saved;try {
    a.click('[data-action="resume"]');a.click('#board .tile:not(:disabled)');a.use('time');
    a.click('#items [data-item="hammer"]');a.click('[data-action="use-item"]');
    a.w.dispatchEvent(new a.w.Event('pagehide'));saved=a.w.localStorage.getItem(KEY);
  }finally {a.close();}
  const b=app(saved);try {
    const p=JSON.parse(saved);assert.equal(b.w.__qa.state.board.length,p.active.board.length);assert.equal(b.w.__qa.state.tray.length,1);
    assert.equal(b.w.__qa.state.time,p.active.time);assert.equal(b.w.__qa.state.target,null);assert.equal(b.w.__qa.profile.inventory.time,2);
    assert.match(b.get('modal-content').textContent,/이어서 산책/);assert.deepEqual(b.errors,[]);
  }finally {b.close();}
});
test('bad or denied storage does not prevent starting or playing',()=>{
  for(const options of [{saved:'{bad json'},{brokenStorage:true}]) {
    const a=app(options.saved,options);try {a.click('[data-action="resume"]');a.click('#board .tile:not(:disabled)');assert.equal(a.w.__qa.state.tray.length,1);assert.deepEqual(a.errors,[]);}finally {a.close();}
  }
});
test('timer pauses in help and hidden tabs; timeout and retry preserve the stage',()=>{
  const a=app();try {
    a.click('[data-action="resume"]');a.click('#help');const time=a.w.__qa.state.time;a.advance(5000);assert.equal(a.w.__qa.state.time,time);
    a.click('[data-action="resume"]');Object.defineProperty(a.w.document,'hidden',{value:true,configurable:true});a.advance(5000);assert.equal(a.w.__qa.state.time,time);
    Object.defineProperty(a.w.document,'hidden',{value:false,configurable:true});a.w.__qa.state.time=.05;a.advance(200);
    assert.equal(a.w.__qa.state.status,'lost');assert.match(a.get('modal-content').textContent,/해가 저물었어요/);
    a.click('#help');a.click('[data-action="close"]');assert.match(a.get('modal-content').textContent,/다시 도전/);
    const seed=a.w.__qa.state.seed;a.click('[data-action="retry"]');assert.equal(a.w.__qa.state.seed,seed);assert.equal(a.w.__qa.state.status,'playing');assert.deepEqual(a.errors,[]);
  }finally {a.close();}
});
test('all local HTML assets resolve, the homepage includes both games, and SVG art parses',()=>{
  for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if(match[1]==='./'||match[1]==='../../') continue;
    assert.ok(readFileSync(new URL(match[1],root)).length);
  }
  const home=readFileSync(new URL('../../index.html',root),'utf8');assert.match(home,/href="games\/merge3\/"/);assert.match(home,/href="games\/cozy-forest\/"/);
  const a=app();try {
    const parser=new a.w.DOMParser();
    for(const svg of a.w.document.querySelectorAll('svg')) {const xml=parser.parseFromString(svg.outerHTML,'image/svg+xml');assert.equal(xml.querySelector('parsererror'),null);}
    for(const el of a.w.document.querySelectorAll('[id]')) assert.equal(a.w.document.querySelectorAll(`[id="${el.id}"]`).length,1,el.id);
  }finally {a.close();}
});
