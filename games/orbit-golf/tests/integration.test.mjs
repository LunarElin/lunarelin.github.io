import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { courseSample, coursePattern } from '../course.mjs';
import { ballStats } from '../rules.mjs';

// This suite executes the shipped DOM controller and rules unchanged. Only the
// WebGL scene is replaced: layout, pixels, real touch hardware and GPU rendering
// require browser/device verification and are deliberately outside this suite.
const KEY = 'orbit-golf:v1';
const [html, gameSource, rulesSource, courseSource, challengesSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../game.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../rules.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../course.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../challenges.mjs', import.meta.url), 'utf8'),
]);
const sceneSource = `
  export class OrbitScene {
    constructor() { globalThis.__testScene = this; this.bursts = 0; this.feedback = []; this.resizes = 0; this.disposed = false; }
    burst(event) { this.bursts++; this.feedback.push(event); }
    resize() { this.resizes++; }
    dispose() { this.disposed = true; }
    render(dt, run, mode, power, upgrades) {
      this.mode = mode; this.power = power; this.current = run;this.dt=dt;this.upgrades={...upgrades};
      this.snapshot = run ? Object.fromEntries(
        ['s','distance','x','vx','height','vy','worldY','worldVy','grounded','exhausted','speed','rollSpeed','steer','spin','curveSpin','restTime','stopReason','combo','collisions','maxHeight','chainHits','maxChain','lastChain','earned','banked','phase','track','continued','finished','name','elapsed','tutorial','trainingBonus','wheel','durationLimit','guardiansBroken','seed','aim','trait'].map(key => [key,run[key]])
      ) : null;
    }
  }
`;

function profile(overrides = {}) {
  return { version: 1, name: '', gold: 0, upgrades: { pilot: 0, ball: 0 }, rankings: [], tutorialComplete: true, ...overrides };
}
const rankingRecords=rows=>rows.map(({name,distance,date})=>({name,distance,date}));

async function game(t, { stored = JSON.stringify(profile()), blockRead = false, blockWrite = false, url = 'https://orbit-golf.test/games/orbit-golf/', seeds=[0xffffffff] } = {}) {
  const dom = new JSDOM(html, {
    url,
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
  const entryURL = new URL(document.querySelector('script[type="module"][src]').src);
  assert.equal(entryURL.pathname, '/games/orbit-golf/game.mjs');
  assert.ok(entryURL.searchParams.get('v'), 'The HTML entry must include a cache version');
  let raw = stored;
  let now = 1000;let seedIndex=0;
  let nextFrame = 0;
  let hidden = false;
  const frames = new Map();
  const errors = [];
  const storageAccess = { reads: 0, writes: 0 };
  window.console.error = (...args) => errors.push(args.join(' '));
  window.requestAnimationFrame = callback => { const id = ++nextFrame; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = id => frames.delete(id);
  Object.defineProperty(window.performance, 'now', { value: () => now });
  Object.defineProperty(document, 'hidden', { get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { get: () => hidden ? 'hidden' : 'visible' });
  Object.defineProperty(window.crypto, 'getRandomValues', {
    value: values => { values.fill(seeds[Math.min(seedIndex++,seeds.length-1)]); return values; },
  });
  Object.defineProperty(window, 'localStorage', { value: {
    getItem(key) { storageAccess.reads++; if (blockRead) throw new window.DOMException('Blocked', 'SecurityError'); return key === KEY ? raw : null; },
    setItem(key, value) { storageAccess.writes++; if (blockWrite) throw new window.DOMException('Full', 'QuotaExceededError'); if (key === KEY) raw = String(value); },
  } });
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  window.HTMLElement.prototype.setPointerCapture = function () {};
  window.HTMLElement.prototype.releasePointerCapture = function () {};
  const context = dom.getInternalVMContext();
  const modules = new Map([
    ['./scene.mjs', new vm.SourceTextModule(sceneSource, { context, identifier: 'scene-stub.mjs' })],
    ['./rules.mjs', new vm.SourceTextModule(rulesSource, { context, identifier: 'rules.mjs' })],
    ['./course.mjs', new vm.SourceTextModule(courseSource, { context, identifier: 'course.mjs' })],
    ['./challenges.mjs', new vm.SourceTextModule(challengesSource, { context, identifier: 'challenges.mjs' })],
  ]);
  const entry = new vm.SourceTextModule(gameSource, { context, identifier: 'game.mjs' });
  await entry.link(specifier => {
    const localSpecifier = specifier.startsWith('./') ? specifier.replace(/\?[^#]*/, '') : specifier;
    assert.ok(modules.has(localSpecifier), `Unexpected runtime import: ${specifier}`);
    if (['./scene.mjs','./rules.mjs','./course.mjs','./challenges.mjs'].includes(localSpecifier)) {
      assert.equal(new URL(specifier, entryURL).searchParams.get('v'), entryURL.searchParams.get('v'),
        'Runtime imports and HTML entry must share their cache version');
    }
    return modules.get(localSpecifier);
  });
  await entry.evaluate();
  const $ = id => document.getElementById(id);
  const panelButton = text => {
    const result = [...$('panel-content').querySelectorAll('button')].find(button => button.textContent.includes(text));
    assert.ok(result, `Missing panel action: ${text}`);
    return result;
  };
  const tick = (count = 1, milliseconds = 50) => {
    for (let index = 0; index < count; index++) {
      now += milliseconds;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(now);
    }
  };
  const pointer = (id, type, options = {}) => {
    const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, ...options });
    Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'touch' } });
    $(id).dispatchEvent(event);
  };
  const submit = name => {
    $('pilot-name').value = name;
    $('name-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  };
  const launch = (chargeFrames = 16) => {
    pointer('shoot', 'pointerdown'); tick(chargeFrames); pointer('shoot', 'pointerup'); tick();
    assert.equal($('drive-controls').hidden, false);
  };
  const input = (id, value) => {
    $(id).value = String(value);
    $(id).dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const stop = () => {
    let count = 0;
    while ((!$('panel').open || $('panel').dataset.type !== 'result') && count++ < 6000) tick();
    assert.ok(count < 6000, 'Deterministic run failed to stop within five simulation minutes');
    assert.equal($('panel').dataset.type, 'result');
    return { ...window.__testScene.snapshot };
  };
  const visibility = value => { hidden = value; document.dispatchEvent(new window.Event('visibilitychange')); };
  t.after(() => { dom.window.close(); });
  return {
    window, document, $, tick, pointer, input, submit, launch, stop, visibility, panelButton, frames, errors, storageAccess,
    get scene() { return window.__testScene; },
    place(run,pose) { return modules.get('./rules.mjs').namespace.placeRun(run,pose); },
    get raw() { return raw; },
    saved() { return raw === null ? null : JSON.parse(raw); },
  };
}

test('lap changes show the added mechanic and fifth-lap reinforcement in the live HUD',async t=>{
  const app=await game(t,{stored:JSON.stringify(profile({tutorialComplete:false}))});app.submit('구간 검증');app.launch();
  assert.match(app.$('track-label').textContent,/1구간/);
  const run=app.scene.current;
  Object.assign(run,{s:360,distance:360,eventTrack:-1,events:[]});app.place(run,{s:360});app.tick(3);
  assert.match(app.$('track-label').textContent,/2구간/);
  assert.match(app.$('growth-readout').textContent,new RegExp(coursePattern(1,run.seed).label));
  Object.assign(run,{s:1440,distance:1440,eventTrack:-1,events:[]});app.place(run,{s:1440});app.tick(3);
  assert.match(app.$('track-label').textContent,/5구간/);
  assert.match(app.$('growth-readout').textContent,/기믹 \+3/);
  assert.ok(app.$('growth-readout').classList.contains('milestone'));
});

test('a new course changes the seed while the same course recreates its original terrain',async t=>{
  const app=await game(t,{seeds:[17,23]});app.submit('새 길');app.input('aim-control',9);app.tick();
  const ready=app.scene.current,layout=ready.events.map(event=>[event.id,event.at,event.x]);app.launch();
  const first=app.scene.current;assert.equal(first.seed,17);
  assert.match(app.$('growth-readout').textContent,new RegExp(coursePattern(0,17).label));
  const heights=[90,180,270,540].map(s=>courseSample(s,first.seed).height);
  app.stop();const oldBody=first.events.find(event=>event.body)?.body;
  app.panelButton('같은 코스').click();app.tick();
  const reset=app.scene.current;assert.notEqual(reset,first);assert.equal(reset.phase,'ready');assert.equal(reset.s,0);assert.equal(reset.distance,0);assert.equal(reset.earned,0);
  assert.equal(Number(app.$('aim-control').value),9);assert.equal(reset.aim,9);
  assert.deepEqual(reset.events.map(event=>[event.id,event.at,event.x]),layout);
  assert.ok(reset.events.every(event=>!event.used&&!event.body),'a retry recreates untouched colliders, never the previous flight bodies');
  if(oldBody)assert.ok(reset.events.every(event=>event.body!==oldBody));app.launch();
  const repeated=app.scene.current;assert.equal(repeated.seed,17);assert.notEqual(repeated,first);
  assert.deepEqual([90,180,270,540].map(s=>courseSample(s,repeated.seed).height),heights);
  app.stop();app.panelButton('새 코스').click();app.launch();
  const second=app.scene.current;assert.equal(second.seed,23);
  assert.notDeepEqual([90,180,270,540].map(s=>courseSample(s,second.seed).height),heights);
  assert.match(app.$('growth-readout').textContent,new RegExp(coursePattern(0,23).label));
  assert.ok(!app.document.body.textContent.includes('360°'));
});

test('isolated giant previews use real generated encounters and distinct collision paths without touching storage',async t=>{
  for(const type of ['beast','giant-alien','cookie']){
    const app=await game(t,{url:`https://orbit-golf.test/games/orbit-golf/?preview=1&seed=42&encounter=${type}`});
    app.submit('거대 만남');app.tick();let run=app.scene.current;const target=run.events.find(event=>event.id===run.previewTargetId);
    assert.ok(target&&target.type===type);assert.equal(run.seed,42);assert.equal(app.$('speed').textContent,'0');
    assert.match(app.$('run-goal').textContent,/거대|제동 패드|충격 모루|타르 웅덩이/);app.launch();run=app.scene.current;
    let feedback;
    for(let count=0;count<180&&run.phase==='rolling'&&!feedback;count++){app.tick();feedback=app.scene.feedback.find(event=>event.eventId===target.id);}
    assert.ok(feedback,`the ${type} preview must collide using the shipped rules`);
    assert.ok(feedback.effect);assert.equal(app.$('toast').classList.contains('visible'),false);
    if(type==='cookie'){assert.equal(feedback.kind,'cookie-break');assert.ok(run.events.some(event=>event.fragment));}
    app.$('pause').click();const before={s:run.s,elapsed:run.elapsed,seed:run.seed};app.tick(20);
    for(const key of Object.keys(before))assert.equal(run[key],before[key]);app.panelButton('계속').click();
    assert.equal(app.storageAccess.reads,0);assert.equal(app.storageAccess.writes,0);assert.deepEqual(app.errors,[]);
  }
  const ignored=await game(t,{url:'https://orbit-golf.test/games/orbit-golf/?encounter=beast&seed=42'});
  ignored.submit('일반 비행');ignored.tick();assert.equal(ignored.scene.current.s,0);assert.equal(ignored.scene.current.seed,0xffffffff);
});

test('real hazard previews cause a visible sustained speed loss and pause without touching player saves',async t=>{
  for(const type of['anvil','tar']){
    const app=await game(t,{url:`https://orbit-golf.test/games/orbit-golf/?preview=1&seed=42&encounter=${type}`});
    app.submit('위험 테스트');app.tick();const ready=app.scene.current,targetId=ready.previewTargetId;
    assert.ok(ready.events.some(event=>event.id===targetId&&event.type===type));
    assert.equal(app.$('aim-control').value,'0');app.launch();const run=app.scene.current;
    let feedback;
    for(let tick=0;tick<250&&run.phase==='rolling'&&!feedback;tick++){app.tick();feedback=app.scene.feedback.find(event=>event.eventId===targetId&&event.kind==='hazard');}
    assert.ok(feedback,`${type} must be encountered with actual shipped placement and physics`);
    assert.ok(feedback.lostRatio>=.45,'the hazard must cause a material immediate speed loss');
    app.tick(2);assert.ok(app.$('speed').classList.contains('braking'));
    assert.ok(Math.abs(run.speed)<feedback.beforeSpeed*.8,'lost speed cannot immediately refill');
    app.$('pause').click();const before={s:run.s,elapsed:run.elapsed,speed:run.speed,brakeTime:run.brakeTime};app.tick(20);
    for(const key of Object.keys(before))assert.equal(run[key],before[key]);
    assert.equal(app.storageAccess.reads,0);assert.equal(app.storageAccess.writes,0);assert.deepEqual(app.errors,[]);
  }
});

test('hill previews use the real steep terrain with the same seed and normal run rules',async t=>{
  for(const kind of['climb','drop']){
    const app=await game(t,{url:`https://orbit-golf.test/games/orbit-golf/?preview=1&seed=42&encounter=${kind}`});
    app.submit('큰 고개');app.tick();const run=app.scene.current;
    assert.ok(courseSample(run.s+36,run.seed).slope*(kind==='climb'?1:-1)>.18);
    assert.ok(coursePattern(run.track,run.seed).verticalSpan>15);
    assert.equal(app.storageAccess.reads,0);assert.equal(app.storageAccess.writes,0);assert.deepEqual(app.errors,[]);
  }
});

test('the spring preview follows a real world-space jump and freezes it when paused',async t=>{
  const app=await game(t,{url:'https://orbit-golf.test/games/orbit-golf/?preview=1&seed=42&encounter=spring'});
  app.submit('포물선');app.tick();app.launch();const run=app.scene.current;
  let launched=false;
  for(let count=0;count<300&&run.phase==='rolling';count++){
    app.tick(1,1000/60);
    if(!run.grounded&&run.height>1.5){launched=true;break;}
  }
  assert.ok(launched,'an actual generated spring must launch a world-space flight');
  assert.ok(Number.isFinite(run.worldY)&&Number.isFinite(run.worldVy));
  app.$('pause').click();const before={worldY:run.worldY,worldVy:run.worldVy,s:run.s};app.tick(20);
  for(const key of Object.keys(before))assert.equal(run[key],before[key]);
  assert.equal(app.storageAccess.reads,0);assert.equal(app.storageAccess.writes,0);assert.deepEqual(app.errors,[]);
});

test('speed HUD follows actual motion and marks backward reflection rather than hidden launch energy',async t=>{
  const app=await game(t,{url:'https://orbit-golf.test/games/orbit-golf/?preview=1'});
  app.submit('속도 검증');
  assert.equal(app.$('speed').textContent,'0','a waiting ball must not show its planned launch velocity as actual speed');
  app.launch();
  const run=app.scene.current;
  Object.assign(run,{s:200,distance:200,speed:-34,rollSpeed:190,height:1,vy:-1,events:[],eventTrack:0});
  app.place(run,{s:200,height:1,vy:-1});
  app.tick(3);
  assert.equal(app.$('speed-label').textContent,'후진');
  assert.ok(Math.abs(Number(app.$('speed').textContent.replaceAll(',',''))-Math.abs(run.speed))<2);
  app.tick(12);
  assert.ok(run.speed<0,'landing cannot restore the old positive launch speed');
  Object.assign(run,{speed:12,rollSpeed:190,height:0,vy:0});app.place(run,{s:run.s});app.tick(3);
  assert.equal(app.$('speed-label').textContent,'속도');
  assert.ok(Number(app.$('speed').textContent)<13,'a small actual speed must remain small on screen');
});

test('isolated guardian previews use the real weak and strong impact paths without accessing user storage',async t=>{
  for(const strength of ['weak','strong']){
    const app=await game(t,{url:`https://orbit-golf.test/games/orbit-golf/?preview=1&encounter=guardian-${strength}`});
    app.submit('수문장 검증');app.tick();
    assert.equal(app.scene.current.track,9);
    assert.ok(app.scene.current.events.some(event=>event.type==='guardian'));
    assert.equal(app.$('orbit-fill').parentElement.getAttribute('aria-label'),'수문장 충돌 힘');
    assert.match(app.$('run-goal').textContent,strength==='strong'?/돌파 가능/:/힘 부족/);
    app.launch();app.tick(24);
    const feedback=app.scene.feedback.filter(event=>event.kind===`guardian-${strength==='strong'?'break':'block'}`);
    assert.ok(feedback.length>0,`${strength} encounter must resolve through real guardian physics`);
    assert.equal(app.scene.current.guardiansBroken,strength==='strong'?1:0);
    if(strength==='strong')assert.ok(feedback[0].force>=feedback[0].requiredForce);
    else assert.ok(app.scene.current.s<3570);
    app.stop();
    if(strength==='strong')assert.match(app.document.querySelector('.guardian-result')?.textContent||'',/수문장 .*체 돌파/);
    else assert.match(app.document.querySelector('.growth-note').textContent,/공 강화 후 재도전/);
    assert.equal(app.storageAccess.reads,0);assert.equal(app.storageAccess.writes,0);
    assert.equal(app.$('toast').classList.contains('visible'),false);
  }
  const ordinary=await game(t,{url:'https://orbit-golf.test/games/orbit-golf/?encounter=guardian-strong'});
  ordinary.submit('일반 비행');ordinary.tick();assert.equal(ordinary.scene.current.track,0);
});

test('name, touch shot, one paid continuation, banking, upgrades and ranking use the real controller', async t => {
  const app = await game(t, { stored: JSON.stringify(profile({ gold: 250 })) });
  const { $, pointer, tick, panelButton } = app;
  app.submit('   ');
  assert.equal($('lobby').hidden, false);
  assert.match($('name-error').textContent, /이름/);
  app.submit('  별<파일럿>  ');
  assert.equal(app.saved().name, '별파일럿');
  assert.equal($('pilot-label').textContent, '별파일럿');
  assert.equal($('launch-controls').hidden, false);

  pointer('shoot', 'pointerdown'); tick(5);
  assert.ok(Number(app.document.querySelector('.power-meter').getAttribute('aria-valuenow')) > 0);
  pointer('shoot', 'pointercancel');
  assert.equal(app.document.querySelector('.power-meter').getAttribute('aria-valuenow'), '0');
  pointer('shoot', 'pointerup');
  assert.equal($('drive-controls').hidden, true, 'Canceled charge must not launch');
  app.launch();
  const launchSpeed = app.scene.snapshot.speed;
  assert.ok(launchSpeed > 20, 'Releasing the charge must launch a moving physical ball');
  assert.ok(app.scene.bursts > 0);

  const first = app.stop();
  assert.equal(first.phase, 'stopped');
  assert.ok(first.distance > 0);
  assert.equal(app.saved().gold, 250 + first.earned);
  const paid = panelButton('이어 달리기');
  assert.equal(paid.disabled, false);
  paid.click();
  assert.equal(app.saved().gold, 250 + first.earned - 40);
  for (const key of ['s','x','height']) {
    assert.equal(app.scene.current[key], first[key], `Continuation must preserve the physical ${key} coordinate`);
  }
  paid.click();
  assert.equal(app.saved().gold, 250 + first.earned - 40, 'A duplicate continuation event must not charge twice');
  tick();
  assert.ok(app.scene.snapshot.distance >= first.distance, 'Continuation must resume at the stopped position');
  assert.equal(app.scene.snapshot.continued, true);
  const second = app.stop();
  assert.equal(panelButton('이어하기 사용 완료').disabled, true);
  panelButton('이어하기 사용 완료').dispatchEvent(new app.window.MouseEvent('click', { bubbles: true }));
  assert.equal($('panel').open, true, 'A second continuation is rejected even if an event is dispatched directly');
  const earnedBalance = 250 + second.earned - 40;
  assert.equal(app.saved().gold, earnedBalance);
  panelButton('기록 저장').click();
  assert.equal($('lobby').hidden, false);
  assert.equal(app.saved().gold, earnedBalance, 'Final settlement must not credit already banked gold again');
  assert.equal(app.saved().rankings.length, 1);
  assert.equal(app.saved().rankings[0].distance, Math.floor(second.distance));

  $('open-upgrades').click();
  const suit = [...$('panel-content').querySelectorAll('.upgrade-card button')][0];
  assert.match(suit.textContent, /70/);
  suit.click();
  assert.equal(app.saved().upgrades.pilot, 1);
  assert.equal(app.saved().gold, earnedBalance - 70);
  assert.match($('panel-content').querySelector('.upgrade-title').textContent, /Lv\.1/);
  [...$('panel-content').querySelectorAll('.upgrade-card button')][1].click();
  assert.equal(app.saved().upgrades.ball, 1);
  assert.equal(app.saved().gold, earnedBalance - 160);
  $('close-panel').click();
  $('open-ranks').click();
  assert.equal($('panel-content').querySelectorAll('.rank-row').length, 1);
  assert.equal($('panel-content').querySelector('.rank-row strong').textContent, '별파일럿');
  panelButton('확인').click();
  app.submit('별파일럿');
  app.launch();
  assert.equal(app.scene.snapshot.continued, false, 'A new round restores its own single continuation');
  assert.ok(app.scene.snapshot.speed > launchSpeed * 1.15, 'Purchased ball upgrade materially increases the next shot at the same charge');
  const reloaded = await game(t, { stored: app.raw });
  assert.equal(reloaded.$('pilot-name').value, '별파일럿');
  assert.equal(reloaded.saved().rankings.length, 1);
  assert.equal(reloaded.saved().upgrades.ball, 1);
  assert.equal(app.storageAccess.reads, 1);
  assert.ok(app.storageAccess.writes > 0, 'Normal gameplay must still use its persistent profile');
  assert.deepEqual(app.errors, []);
});

test('fractional aim and held spin control a continuous physical ball without lane snapping', async t => {
  const app = await game(t);
  app.submit('자유 스핀');
  app.input('aim-control', 13.5);
  app.launch();
  const angled = { ...app.scene.snapshot };
  const straight = await game(t);
  straight.submit('직선'); straight.input('aim-control', 0); straight.launch();
  assert.ok(Math.abs(angled.vx) > Math.abs(straight.scene.snapshot.vx) + .5,
    'A fractional aim must change lateral launch velocity rather than choose a lane');
  assert.ok(Math.abs(angled.x) > 0 && Math.abs(angled.x) < 3.2);
  assert.ok(Math.abs(angled.x - Math.round(angled.x)) > .0001, 'Ball position must remain continuous');
  assert.equal(app.$('left'), null);
  assert.equal(app.$('right'), null);
  app.pointer('spin-control', 'pointerdown');
  app.input('spin-control', .37); app.tick();
  assert.equal(app.scene.snapshot.steer, .37);
  app.pointer('spin-control', 'pointerup'); app.tick();
  assert.equal(app.scene.snapshot.steer, 0, 'Releasing spin must stop the applied steering force');
  assert.equal(Number(app.$('spin-control').value), 0);
  app.document.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  app.tick();
  assert.equal(app.scene.snapshot.steer, -1);
  app.document.dispatchEvent(new app.window.KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
  app.tick();
  assert.equal(app.scene.snapshot.steer, 0, 'Keyboard steering must also release continuously');
  app.pointer('space', 'pointerdown', { clientX: 100 });
  app.pointer('space', 'pointermove', { clientX: 140 }); app.tick();
  assert.ok(Math.abs(app.scene.snapshot.steer - 40 / 85) < .001,
    'A canvas drag must apply a proportional spin rather than a fixed sidestep');
  app.pointer('space', 'pointercancel'); app.tick();
  assert.equal(app.scene.snapshot.steer, 0, 'A cancelled touch must not leave spin stuck on');
  app.input('spin-control', -.6); app.tick();
  app.$('pause').click();
  assert.equal(app.scene.current.steer, 0, 'Pause must release every held steering source');
  assert.equal(Number(app.$('spin-control').value), 0);
  app.panelButton('계속').click(); app.tick();
  assert.equal(app.scene.snapshot.steer, 0);
  assert.deepEqual(app.errors, []);
});

test('holding spin cannot keep an exhausted forward shot alive and continuation clears the stopped input', async t => {
  const app = await game(t, { stored: JSON.stringify(profile({ gold: 200 })) });
  app.submit('전진 소진'); app.launch();
  const run = app.scene.current;
  Object.assign(run, {
    s: 100, distance: 100, speed: .25, rollSpeed: .2, vx: 7,
    height: 1.5, vy: 0, restTime: 0, accumulator: 0, events: [], eventTrack: 0,
  });
  app.place(run,{s:100,height:1.5,vy:0});
  app.input('spin-control', 1);
  assert.equal(run.steer, 1, 'The regression must keep the input held while lateral motion is still present');
  const beforeElapsed = run.elapsed;
  for (let frame = 0; frame < 80 && app.scene.mode === 'rolling'; frame++) app.tick();
  assert.equal(app.$('panel').dataset.type, 'result', 'Exhausted forward motion must end without waiting for a spin release');
  assert.equal(app.scene.snapshot.stopReason, 'natural');
  assert.ok(run.elapsed - beforeElapsed < 2, 'Lateral movement and height must not extend a stalled shot');
  assert.ok(run.elapsed < run.durationLimit - 5, 'The time cap is not the fix for exhausted forward motion');
  for (const key of ['speed','rollSpeed','vx','vy','steer']) assert.equal(run[key], 0, `${key} must be neutral at natural stop`);
  assert.equal(Number(app.$('spin-control').value), 0);
  const position = { s: run.s, x: run.x, height: run.height };
  const balance = app.saved().gold;
  app.panelButton('이어 달리기').click();
  for (const key of ['s','x','height']) assert.equal(run[key], position[key], 'Paid continuation must keep the actual stopped position');
  assert.ok(run.speed > 50 && run.rollSpeed > 50);
  assert.equal(run.restTime, 0);
  assert.equal(run.steer, 0);
  assert.equal(app.saved().gold, balance - 40);
  app.tick(5);
  assert.equal(app.scene.mode, 'rolling');
  assert.ok(app.scene.snapshot.elapsed > beforeElapsed);
  assert.deepEqual(app.errors, []);
});

test('a complete free shot still ends naturally while spin is held for the whole flight', async t => {
  const app = await game(t);
  app.submit('연속 스핀'); app.launch(); app.input('spin-control', 1);
  const run = app.scene.current;
  let heldFrames = 0;
  while (app.scene.mode === 'rolling' && heldFrames++ < 1000) {
    // Keep this input regression independent of random propulsion props, even after a lap.
    run.events = [];run.eventTrack = Math.max(0, Math.floor(run.s / 360));
    app.tick();
  }
  assert.equal(app.$('panel').dataset.type, 'result');
  assert.equal(app.scene.snapshot.stopReason, 'natural');
  assert.ok(run.elapsed < 50 && run.elapsed < run.durationLimit - 30,
    'Constant steering must not stretch an exhausted free shot to the normal time limit');
  assert.ok(run.distance > 100, 'The regression must exercise real travel before held steering spends the remaining forward energy');
  assert.equal(Number(app.$('spin-control').value), 0);
  assert.equal(run.steer, 0);
  assert.deepEqual(app.errors, []);
});

test('an unsteered shot ricochets and becomes airborne while collision feedback reaches the scene', async t => {
  const app = await game(t);
  app.submit('알아서 통통'); app.launch();
  let highest = app.scene.snapshot.height;
  let maxCollisions = app.scene.snapshot.collisions;
  for (let frame = 0; frame < 600 && app.scene.mode === 'rolling'; frame++) {
    app.tick();
    highest = Math.max(highest, app.scene.snapshot.height);
    maxCollisions = Math.max(maxCollisions, app.scene.snapshot.collisions);
    assert.equal(app.$('toast').classList.contains('visible'), false,
      'A collision must use the object effect rather than floating speech');
  }
  assert.ok(highest > .1, `The launched ball must actually leave the surface without an avoidance input (height ${highest})`);
  assert.ok(maxCollisions >= 2, 'An unsteered shot must physically ricochet more than once');
  assert.ok(app.scene.feedback.some(event => event && typeof event === 'object'
    && event.type !== 'shot' && event.type !== 'stop' && Number.isFinite(event.strength)
    && typeof event.effect === 'string'),
  'Collision impulses must reach the scene as structured impact feedback');
  assert.deepEqual(app.errors, []);
});

test('a launched obstacle creates physical chain feedback in the live HUD and final result', async t => {
  const app = await game(t);
  app.submit('우주 볼링'); app.launch();
  let chainHUD = false, pausedBody = false;
  for (let frame = 0; frame < 2400 && app.scene.mode === 'rolling'; frame++) {
    app.tick();
    chainHUD ||= !app.$('combo').hidden && /^연쇄 \d+$/.test(app.$('combo').textContent);
    assert.equal(app.$('toast').classList.contains('visible'), false,
      'Chain reactions must not produce a floating collision phrase');
    const body = app.scene.current.events.find(event => event.body?.active)?.body;
    if (body && !pausedBody) {
      const pose = () => JSON.stringify(['s','x','height','rx','ry','rz','vs','vx','vy'].map(key => body[key]));
      const before = pose();
      app.$('pause').click(); app.tick(20);
      assert.equal(pose(), before, 'Paused play must freeze knocked props as well as the ball');
      app.panelButton('계속').click(); app.tick(4);
      assert.notEqual(pose(), before, 'A launched prop must resume actual motion rather than a canned hit pose');
      pausedBody = true;
    }
  }
  const chains = app.scene.feedback.filter(event => event?.kind === 'chain');
  assert.ok(chains.length > 0, 'A deterministic unsteered shot must make a prop strike another prop');
  assert.ok(chains.some(event => event.sourceId && event.eventId && event.sourceId !== event.eventId
    && event.chainDepth >= 2 && ['s','x','height','strength'].every(key => Number.isFinite(event[key]))),
  'The scene must receive the source, struck prop, causal depth and actual impact pose');
  assert.ok(chainHUD, 'A real prop collision must be visible as chain feedback during play');
  assert.ok(pausedBody, 'The real controller must expose a moving obstacle during the shot');
  assert.equal(app.$('panel').dataset.type, 'result');
  assert.ok(app.scene.snapshot.chainHits >= chains.length);
  assert.ok(app.scene.snapshot.maxChain >= 2);
  assert.match(app.$('chain-summary').textContent, /연쇄/);
  assert.deepEqual(app.errors, []);
});

test('the widened track permits free continuous travel beyond the former side rails', async t => {
  const app = await game(t);
  app.submit('넓게 튀자'); app.input('aim-control', 24); app.launch();
  app.input('spin-control', 1);
  let widest = Math.abs(app.scene.snapshot.x);
  for (let frame = 0; frame < 180 && app.scene.mode === 'rolling'; frame++) {
    app.tick(); widest = Math.max(widest, Math.abs(app.scene.snapshot.x));
    assert.ok(Math.abs(app.scene.snapshot.x) <= 8.851, 'The ball must stay inside the widened physical rails');
  }
  app.pointer('spin-control', 'pointerup'); app.tick();
  assert.ok(widest > 3.6, `The ball must use space beyond the former 3.05m side rail (${widest}m)`);
  assert.equal(app.scene.snapshot.steer, 0);
  assert.deepEqual(app.errors, []);
});

test('preview plays and upgrades in memory without reading or writing the existing user save', async t => {
  const stored = JSON.stringify(profile({
    name: '실제 파일럿', gold: 9876, upgrades: { pilot: 4, ball: 5 },
    rankings: [{ name: '실제 파일럿', distance: 12345, date: '2026-10-24T00:00:00.000Z' }],
  }));
  const options = { stored, blockRead: true, blockWrite: true, url: 'https://orbit-golf.test/games/orbit-golf/?preview=1' };
  const app = await game(t, options);
  assert.equal(app.$('pilot-name').value, '');
  assert.equal(app.$('gold').textContent, '0');
  assert.equal(app.$('save-warning').hidden, true, 'Preview must not probe blocked storage and report a spurious failure');
  app.$('open-ranks').click();
  assert.equal(app.$('panel-content').querySelectorAll('.rank-row').length, 0);
  app.panelButton('확인').click();
  app.submit('미리보기'); app.launch();
  const initialSpeed = app.scene.snapshot.speed;
  assert.equal(app.scene.snapshot.tutorial, true);
  const first = app.stop();
  assert.ok(first.earned >= 90);
  assert.equal(first.finished, true);
  app.panelButton('첫 강화하기').click();
  assert.equal(Number(app.$('gold').textContent.replaceAll(',', '')), first.earned);
  const ball = [...app.$('panel-content').querySelectorAll('.upgrade-card button')][1];
  assert.equal(ball.disabled, false);
  ball.click();
  assert.equal(Number(app.$('gold').textContent.replaceAll(',', '')), first.earned - 90);
  assert.match([...app.$('panel-content').querySelectorAll('.upgrade-title')][1].textContent, /Lv\.1/);
  app.panelButton('다음 비행').click(); app.launch();
  assert.equal(app.scene.snapshot.tutorial, false, 'Preview keeps tutorial completion in RAM during this visit');
  assert.ok(app.scene.snapshot.speed > initialSpeed * 1.15, 'Preview purchases must materially affect the actual next shot');
  app.$('pause').click(); app.panelButton('비행 마치기').click();
  app.$('open-ranks').click();
  const rows = [...app.$('panel-content').querySelectorAll('.rank-row strong')];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].textContent, '미리보기');
  assert.equal(app.raw, stored, 'Preview must preserve the original serialized save byte for byte');
  assert.deepEqual(app.storageAccess, { reads: 0, writes: 0 });
  app.window.dispatchEvent(new app.window.PageTransitionEvent('pagehide', { persisted: false }));
  assert.deepEqual(app.storageAccess, { reads: 0, writes: 0 }, 'Background and exit saves must also skip storage');
  assert.equal(app.raw, stored);
  const reloaded = await game(t, options);
  assert.equal(reloaded.$('gold').textContent, '0');
  assert.equal(reloaded.$('pilot-name').value, '');
  assert.equal(reloaded.raw, stored);
  assert.deepEqual(reloaded.storageAccess, { reads: 0, writes: 0 });
  assert.deepEqual(app.errors, []);
});

test('visibility pause freezes progress, banks once, and resumes only through the visible action', async t => {
  const app = await game(t);
  app.submit('휴식 파일럿'); app.launch(); app.tick(20);
  const before = { ...app.scene.snapshot };
  app.visibility(true);
  assert.equal(app.$('panel').dataset.type, 'pause');
  assert.equal(app.frames.size, 0);
  const hiddenGold = app.saved().gold;
  app.visibility(true);
  assert.equal(app.saved().gold, hiddenGold, 'Repeated hidden notifications must not bank the same earnings twice');
  app.tick(1200);
  app.visibility(false); app.tick(40);
  assert.equal(app.scene.mode, 'paused');
  assert.equal(app.scene.snapshot.distance, before.distance);
  assert.equal(app.scene.snapshot.speed, before.speed);
  for (const key of ['s','x','vx','height','vy']) assert.equal(app.scene.snapshot[key], before[key]);
  assert.equal(app.scene.snapshot.elapsed, before.elapsed, 'Paused wall time must not consume the active-play limit');
  app.panelButton('계속').click(); app.tick();
  assert.equal(app.scene.mode, 'rolling');
  assert.ok(app.scene.snapshot.elapsed > before.elapsed, 'Resume must restart the physical simulation');
  assert.ok(['s','x','height'].some(key => app.scene.snapshot[key] !== before[key]),
    'A resumed ball must move even when a collision sends it backwards below its best distance');
  assert.ok(Math.abs(app.scene.snapshot.s - before.s) < 10, 'Hidden elapsed time must not jump the physical position');
  assert.ok(app.scene.snapshot.distance - before.distance < 10, 'Hidden elapsed time must not advance the run on resume');
  app.$('pause').click();
  app.panelButton('비행 마치기').click();
  const settled = app.saved();
  assert.equal(settled.gold, app.scene.snapshot.earned);
  assert.equal(settled.rankings.length, 1);
});

test('a new zero-gold pilot finishes training, upgrades the ball, and travels materially farther next round', async t => {
  const app = await game(t, { stored: null });
  assert.equal(app.$('gold').textContent, '0');
  app.submit('첫 우주인');
  assert.equal(app.saved().tutorialComplete, false);
  app.$('cancel-run').click();
  assert.equal(app.saved().gold, 0, 'Leaving before the first shot must not award a training grant');
  assert.equal(app.saved().tutorialComplete, false);
  assert.equal(app.saved().rankings.length, 0);
  app.submit('첫 우주인');
  app.launch();
  const initialSpeed = app.scene.snapshot.speed;
  assert.equal(app.scene.snapshot.tutorial, true);
  assert.equal(app.scene.snapshot.durationLimit, 75);
  const first = app.stop();
  assert.ok(first.elapsed > 0 && first.elapsed <= 75.000001,
    'The first flight must reach its result within 75 seconds of active play');
  assert.equal(first.finished, true, 'The tutorial result must settle its grant before showing upgrade actions');
  assert.equal(app.saved().tutorialComplete, true);
  assert.ok(app.saved().gold >= 90, 'A new player must afford the first ball upgrade immediately');
  assert.ok(first.trainingBonus >= 80);
  assert.ok(first.earned >= first.trainingBonus, 'First-flight earnings include the training grant');
  assert.equal(app.saved().gold, first.earned);
  assert.equal(app.saved().rankings.length, 1);
  assert.ok(![...app.$('panel-content').querySelectorAll('button')]
    .some(button => /이어 달리기/.test(button.textContent) && !button.disabled),
  'The first result must lead into growth without selling a continuation');

  const balance = app.saved().gold;
  const upgrade = app.panelButton('첫 강화하기');
  assert.ok(upgrade.classList.contains('primary'));
  upgrade.click();
  assert.equal(app.$('panel').dataset.type, 'upgrades');
  assert.equal(app.saved().gold, balance, 'Opening the shop must not settle the first-run grant twice');
  const ball = [...app.$('panel-content').querySelectorAll('.upgrade-card button')][1];
  assert.equal(ball.disabled, false);
  assert.match(ball.textContent, /90/);
  ball.click();
  assert.equal(app.saved().upgrades.ball, 1);
  assert.equal(app.saved().gold, balance - 90);
  assert.equal(app.saved().tutorialComplete, true);
  assert.match([...app.$('panel-content').querySelectorAll('.upgrade-title')][1].textContent, /Lv\.1/);
  app.panelButton('다음 비행').click();
  assert.equal(app.$('panel').open, false);
  assert.equal(app.$('launch-controls').hidden, false);
  app.launch();
  assert.equal(app.scene.snapshot.tutorial, false);
  assert.equal(app.scene.snapshot.durationLimit, 120);
  assert.ok(app.scene.snapshot.speed > initialSpeed * 1.15,
    'The purchased ball must materially increase actual next-shot speed at the same charge');
  const second = app.stop();
  assert.ok(second.distance > first.distance * 1.3,
    `The same seeded shot must travel visibly farther after its first upgrade (${first.distance} -> ${second.distance})`);
  app.panelButton('기록 저장').click();
  assert.equal(app.saved().gold, balance - 90 + second.earned,
    'Later rounds must not receive the first-flight grant again');
  assert.equal(second.trainingBonus, 0);
  const reloaded = await game(t, { stored: app.raw });
  reloaded.submit('첫 우주인'); reloaded.launch();
  assert.equal(reloaded.scene.snapshot.tutorial, false, 'Tutorial completion survives reloading');
  assert.equal(reloaded.saved().upgrades.ball, 1);
});

test('a legacy save without the tutorial flag retains its wallet and upgrades when onboarding starts', async t => {
  const legacy = profile({ name: '이전 파일럿', gold: 37, upgrades: { pilot: 2, ball: 1 } });
  delete legacy.tutorialComplete;
  const app = await game(t, { stored: JSON.stringify(legacy) });
  assert.equal(app.$('gold').textContent, '37');
  assert.equal(app.$('pilot-name').value, '이전 파일럿');
  app.submit('이전 파일럿'); app.launch();
  assert.equal(app.scene.snapshot.tutorial, true);
  assert.equal(app.saved().tutorialComplete, false);
  assert.equal(app.saved().gold, 37);
  assert.deepEqual(app.saved().upgrades, { pilot: 2, ball: 1 });
});

for (const frameMilliseconds of [100, 1000]) {
  test(`first flight respects real foreground time at ${1000 / frameMilliseconds} fps and excludes hidden time`, async t => {
    const app = await game(t, { stored: null });
    app.submit('느린 화면'); app.launch();
    const startElapsed = app.scene.snapshot.elapsed;
    app.tick(5, frameMilliseconds);
    assert.ok(Math.abs(app.scene.dt-frameMilliseconds/1000)<1e-9,'Rendering must receive the same foreground clock as physics');
    let activeMilliseconds = 5 * frameMilliseconds;
    assert.ok(Math.abs(app.scene.snapshot.elapsed - startElapsed - activeMilliseconds / 1000) < 0.000001,
      'Physics and the first-flight timer must use actual foreground delta at a low frame rate');
    const beforePause = { ...app.scene.snapshot };
    app.visibility(true); app.tick(120, 1000);
    app.visibility(false); app.tick(5, frameMilliseconds);
    assert.equal(app.scene.mode, 'paused');
    assert.equal(app.scene.snapshot.elapsed, beforePause.elapsed);
    assert.equal(app.scene.snapshot.distance, beforePause.distance);
    app.panelButton('계속').click();
    while ((!app.$('panel').open || app.$('panel').dataset.type !== 'result') && activeMilliseconds < 75000) {
      app.tick(1, frameMilliseconds);
      activeMilliseconds += frameMilliseconds;
    }
    assert.equal(app.$('panel').dataset.type, 'result', 'A low frame rate must not stretch the first flight beyond 75 foreground seconds');
    assert.ok(activeMilliseconds <= 75000);
    assert.ok(app.scene.snapshot.elapsed <= 75.000001);
    assert.equal(app.saved().tutorialComplete, true);
    assert.ok(app.saved().gold >= 90);
    assert.equal(app.panelButton('첫 강화하기').disabled, false);
  });
}

test('retry from the result settles the old round and creates a fresh shot without duplicate rewards', async t => {
  const app = await game(t);
  app.submit('재도전'); app.launch(4);
  const finished = app.stop();
  const balance = app.saved().gold;
  app.panelButton('같은 코스').click();
  assert.equal(app.$('panel').open, false);
  assert.equal(app.$('launch-controls').hidden, false);
  assert.equal(app.saved().gold, balance);
  assert.equal(app.saved().rankings[0].distance, Math.floor(finished.distance));
  app.tick();
  assert.equal(app.scene.snapshot.distance, 0);
  assert.equal(app.scene.snapshot.continued, false);
  app.$('cancel-run').click();
  assert.equal(app.saved().gold, balance);
  assert.equal(app.saved().rankings.length, 1);
});

test('malformed storage recovers to a playable profile and the next save contains valid data', async t => {
  const app = await game(t, { stored: '{broken JSON' });
  assert.equal(app.$('gold').textContent, '0');
  assert.equal(app.$('save-warning').hidden, false);
  app.submit('복구'); app.launch(4); app.stop(); app.panelButton('기록 저장').click();
  const saved = app.saved();
  assert.equal(saved.name, '복구');
  assert.ok(saved.gold > 0);
  assert.equal(saved.rankings.length, 1);
  assert.deepEqual(app.errors, []);
});

test('denied storage keeps names, round rewards and ranking usable in memory', async t => {
  const app = await game(t, { stored: null, blockRead: true, blockWrite: true });
  assert.equal(app.$('save-warning').hidden, false);
  app.submit('방문자'); app.launch(4);
  const stopped = app.stop();
  app.panelButton('기록 저장').click();
  assert.equal(app.raw, null);
  assert.equal(Number(app.$('gold').textContent.replaceAll(',', '')), stopped.earned);
  assert.equal(app.$('pilot-name').value, '방문자');
  app.$('open-ranks').click();
  assert.equal(app.$('panel-content').querySelector('.rank-row strong').textContent, '방문자');
  assert.deepEqual(app.errors, []);
});

test('a quota failure leaves an existing save intact and purchases remain bounded in memory', async t => {
  const stored = JSON.stringify(profile({ name: '저장공간', gold: 100 }));
  const app = await game(t, { stored, blockWrite: true });
  app.$('open-upgrades').click();
  app.$('panel-content').querySelector('.upgrade-card button').click();
  assert.equal(app.$('save-warning').hidden, false);
  assert.equal(app.raw, stored);
  assert.equal(app.$('gold').textContent, '30');
  const buttons = [...app.$('panel-content').querySelectorAll('.upgrade-card button')];
  assert.ok(buttons.every(button => button.disabled));
  buttons[0].dispatchEvent(new app.window.MouseEvent('click', { bubbles: true }));
  assert.equal(app.$('gold').textContent, '30');
});

test('ranking dialog renders at most ten personal bests as text in descending order', async t => {
  const rankings = Array.from({ length: 12 }, (_, index) => ({
    name: `파일럿${index}`, distance: index * 100, date: '2026-10-23T00:00:00.000Z',
  }));
  rankings.push({ name: '파일럿11', distance: 1, date: '2026-10-23T01:00:00.000Z' });
  rankings.push({ name: '<b>별</b>', distance: 2000, date: '2026-10-23T02:00:00.000Z' });
  const app = await game(t, { stored: JSON.stringify(profile({ rankings })) });
  app.$('open-ranks').click();
  const rows = [...app.$('panel-content').querySelectorAll('.rank-row')];
  assert.equal(rows.length, 10);
  assert.equal(rows[0].querySelector('strong').textContent, 'b별/b');
  assert.equal(rows[0].querySelector('strong').children.length, 0, 'Stored names are rendered as plain text');
  assert.equal(rows[1].querySelector('strong').textContent, '파일럿11');
  const scores = rows.map(row => Number(row.querySelector('b').firstChild.textContent.replaceAll(',', '')));
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});

test('challenge entry validates a name, preserves old v1 data and cancels preparation without a reward',async t=>{
  const rankings=[{name:'기존 파일럿',distance:1234,date:'2026-10-23T00:00:00.000Z'}],
    stored=JSON.stringify(profile({gold:537,upgrades:{ball:4,pilot:3},rankings})),app=await game(t,{stored,seeds:[17]});
  app.$('open-challenges').click();assert.equal(app.$('panel').open,false);assert.match(app.$('name-error').textContent,/이름/);assert.equal(app.raw,stored);
  app.$('pilot-name').value='연쇄 입장';app.$('open-challenges').click();
  assert.equal(app.$('panel').dataset.type,'challenges');assert.deepEqual([...app.document.querySelectorAll('[data-challenge]')].map(button=>button.dataset.challenge),['domino','cookie','bowling']);
  app.panelButton('공 특성').click();
  for(const id of['heavy','elastic','spin']){const choose=app.document.querySelector(`[data-trait="${id}"]`);assert.equal(choose.disabled,true);choose.dispatchEvent(new app.window.MouseEvent('click',{bubbles:true}));}
  assert.equal(app.saved().ballTrait,'standard');assert.equal(app.saved().gold,537);
  app.panelButton('연쇄 도전').click();app.document.querySelector('[data-challenge="domino"]').click();app.tick();
  assert.equal(app.scene.current.challenge.id,'domino');assert.equal(app.scene.current.durationLimit,35);assert.equal(app.scene.current.tutorial,false);
  app.$('cancel-run').click();assert.equal(app.$('lobby').hidden,false);
  const saved=app.saved();assert.equal(saved.gold,537);assert.deepEqual(saved.upgrades,{ball:4,pilot:3});assert.deepEqual(rankingRecords(saved.rankings),rankings);assert.deepEqual(saved.challengeWins,[]);assert.equal(saved.tutorialComplete,true);assert.deepEqual(app.errors,[]);
});

test('a real cookie-fragment chain settles sixty gold once, unlocks a free trait and retries the same authored course',async t=>{
  const rankings=[{name:'실제 연쇄',distance:9876,date:'2026-10-23T00:00:00.000Z'}],app=await game(t,{seeds:[42,23],stored:JSON.stringify(profile({name:'실제 연쇄',gold:500,upgrades:{ball:5,pilot:5},rankings}))});
  app.$('open-challenges').click();app.document.querySelector('[data-challenge="cookie"]').click();app.input('aim-control',-12);app.launch();
  const first=app.scene.current;
  for(let frames=0;frames<100&&!first.challenge.success;frames++)app.tick();
  assert.equal(first.challenge.success,true,'the shipped cookie layout and physics must complete without injecting success flags');
  const decisive=app.scene.feedback.find(event=>event.kind==='chain'&&first.challenge.targetIds.includes(event.eventId));
  assert.ok(decisive?.sourceId.startsWith(`${first.challenge.launcherId}:crumb:`));assert.ok(decisive.chainId>0);assert.ok(first.events.some(event=>event.id===decisive.sourceId&&event.fragment));
  app.tick(2);assert.match(app.$('run-goal').textContent,/연쇄 성공/);assert.equal(app.$('orbit-fill').parentElement.getAttribute('aria-valuenow'),'1');
  assert.equal(app.$('panel').open,false);assert.equal(app.saved().gold,500,'the observation interval must not pay before the result');
  app.$('pause').click();const elapsed=first.elapsed;app.tick(40);assert.equal(first.elapsed,elapsed);assert.equal(app.saved().gold,500);app.panelButton('계속').click();
  app.stop();assert.equal(first.stopReason,'challenge-success');assert.ok(first.elapsed-first.challenge.completedAt>=1.1);
  assert.equal(first.finished,true);assert.equal(app.saved().gold,560);assert.deepEqual(app.saved().challengeWins,['cookie']);assert.deepEqual(rankingRecords(app.saved().rankings),rankings);assert.equal(first.challengeAward.firstWin,true);assert.ok(first.challengeAward.unlocked.includes('spin'));
  assert.match(app.document.querySelector('.trait-unlock').textContent,/회전 공.*해금/);assert.ok(![...app.$('panel-content').querySelectorAll('button')].some(button=>/이어 달리기|이어하기/.test(button.textContent)),'challenge results must not sell a continuation');
  assert.equal(app.document.querySelector('.result-cause').textContent,'과자 조각 → 금색 표적');
  app.panelButton('공 특성 선택').click();assert.equal(app.$('panel').dataset.type,'traits');assert.equal(app.$('close-panel').hidden,false);app.$('close-panel').click();
  assert.equal(app.$('panel').open,true);assert.equal(app.$('panel').dataset.type,'result');assert.equal(app.saved().gold,560);
  app.panelButton('공 특성 선택').click();
  // Native dialog Escape emits cancel; JSDOM does not synthesize that keyboard behavior.
  const cancel=new app.window.Event('cancel',{cancelable:true});app.$('panel').dispatchEvent(cancel);
  assert.ok(cancel.defaultPrevented);assert.equal(app.$('panel').open,true);assert.equal(app.$('panel').dataset.type,'result');assert.equal(app.saved().gold,560);
  app.tick(10);assert.equal(app.saved().gold,560,'an open result must not pay repeatedly');
  app.panelButton('같은 코스').click();app.tick();const prepared=app.scene.current;
  assert.equal(prepared.seed,42);assert.equal(prepared.aim,-12);assert.equal(prepared.challenge.id,'cookie');assert.ok(prepared.events.every(event=>!event.used&&!event.body));assert.deepEqual(Array.from(prepared.challenge.hitTargetIds),[]);
  app.launch();const repeated=app.scene.current;app.stop();assert.notEqual(repeated,first);assert.equal(repeated.challenge.success,true);assert.equal(repeated.challengeAward.firstWin,false);assert.equal(app.saved().gold,560);assert.deepEqual(app.saved().challengeWins,['cookie']);
  app.panelButton('다른 과제').click();app.panelButton('공 특성').click();const choose=app.document.querySelector('[data-trait="spin"]');assert.equal(choose.disabled,false);choose.click();
  assert.equal(app.saved().ballTrait,'spin');assert.equal(app.saved().gold,560,'equipping an unlocked trait must be free');assert.equal(app.document.querySelector('[data-trait="spin"]').getAttribute('aria-pressed'),'true');
  app.panelButton('같은 코스').click();app.tick();assert.equal(app.scene.current.seed,42);assert.equal(app.scene.current.trait,'spin');assert.equal(app.scene.upgrades.trait,'spin');
  app.$('cancel-run').click();app.submit('실제 연쇄');app.tick();assert.equal(app.scene.current.seed,23);assert.equal(app.scene.current.challenge,undefined);assert.equal(app.scene.current.trait,'spin');assert.equal(app.saved().gold,560);assert.deepEqual(app.errors,[]);
});

test('failed and abandoned challenges grant no gold, unlock or distance-ranking entry',async t=>{
  const app=await game(t,{stored:JSON.stringify(profile({name:'실패도 연습',gold:300,upgrades:{ball:5,pilot:5}})),seeds:[42]});
  app.$('open-challenges').click();app.document.querySelector('[data-challenge="cookie"]').click();app.input('aim-control',24);app.launch(4);const failed=app.scene.current;app.stop();
  assert.equal(failed.challenge.success,false);assert.equal(failed.challengeAward.gold,0);assert.equal(app.saved().gold,300);assert.deepEqual(app.saved().challengeWins,[]);assert.deepEqual(app.saved().rankings,[]);
  app.panelButton('같은 코스').click();app.input('aim-control',-12);app.launch();const abandoned=app.scene.current;app.$('pause').click();app.panelButton('비행 마치기').click();
  assert.equal(abandoned.challenge.success,false);assert.equal(app.$('lobby').hidden,false);assert.equal(app.saved().gold,300);assert.deepEqual(app.saved().challengeWins,[]);assert.deepEqual(app.saved().rankings,[]);assert.deepEqual(app.errors,[]);
});

test('leaving during the real success observation interval preserves the earned win on pause-exit and pagehide',async t=>{
  for(const exit of['pause-exit','pagehide']){
    const app=await game(t,{stored:JSON.stringify(profile({name:'성공 즉시 보존',gold:1000,upgrades:{ball:5,pilot:5}})),seeds:[42]});
    app.$('open-challenges').click();app.document.querySelector('[data-challenge="cookie"]').click();app.input('aim-control',-12);app.launch();const run=app.scene.current;
    for(let frames=0;frames<100&&!run.challenge.success;frames++)app.tick();
    assert.ok(run.challenge.success);assert.equal(run.phase,'rolling');assert.ok(run.elapsed-run.challenge.completedAt<1.1);assert.equal(app.saved().gold,1000);
    if(exit==='pause-exit'){app.$('pause').click();app.panelButton('비행 마치기').click();assert.equal(app.$('lobby').hidden,false);}
    else app.window.dispatchEvent(new app.window.PageTransitionEvent('pagehide',{persisted:false}));
    assert.equal(run.finished,true);assert.equal(run.stopReason,'challenge-success');assert.equal(run.challengeAward.gold,60);assert.equal(app.saved().gold,1060);assert.deepEqual(app.saved().challengeWins,['cookie']);assert.deepEqual(app.saved().rankings,[]);
    app.window.dispatchEvent(new app.window.PageTransitionEvent('pagehide',{persisted:false}));assert.equal(app.saved().gold,1060,'repeated exit must not pay an already settled challenge twice');assert.deepEqual(app.errors,[]);
  }
});

test('the max-level upgrade panel describes the equipped heavy ball rather than the standard launch speed',async t=>{
  const app=await game(t,{stored:JSON.stringify(profile({name:'중량 장비',gold:765,upgrades:{ball:5,pilot:5},challengeWins:['bowling'],ballTrait:'heavy'}))});
  app.$('open-upgrades').click();const card=()=>[...app.$('panel-content').querySelectorAll('.upgrade-card')][1],heavy=ballStats(app.saved()),standard=ballStats(5);
  assert.notEqual(Math.floor(heavy.launchSpeed),Math.floor(standard.launchSpeed));assert.match(card().querySelector('p').textContent,/중량 공/);
  assert.ok(card().querySelector('p').textContent.includes(`출발 추진력 ${Math.floor(heavy.launchSpeed).toLocaleString('ko-KR')}`));assert.equal(card().querySelector('button').disabled,true);
  app.panelButton('공 특성 ·').click();app.document.querySelector('[data-trait="standard"]').click();app.$('close-panel').click();app.$('open-upgrades').click();
  assert.ok(card().querySelector('p').textContent.includes(`출발 추진력 ${Math.floor(standard.launchSpeed).toLocaleString('ko-KR')}`));assert.equal(app.saved().ballTrait,'standard');assert.equal(app.saved().gold,765);assert.deepEqual(app.errors,[]);
});

test('max-profile challenge preview unlocks in memory while ordinary preview parameters cannot alter a v1 save',async t=>{
  const stored=JSON.stringify(profile({name:'보존할 이름',gold:987,upgrades:{ball:2,pilot:1},rankings:[{name:'보존할 이름',distance:2345,date:'2026-10-23T00:00:00.000Z'}]}));
  const app=await game(t,{stored,blockRead:true,blockWrite:true,url:'https://orbit-golf.test/games/orbit-golf/?preview=1&profile=max&challenge=cookie&seed=42'});
  app.submit('미리보기 연쇄');app.input('aim-control',-12);app.launch();assert.equal(app.scene.current.challenge.id,'cookie');assert.equal(app.scene.upgrades.ball,5);assert.equal(app.scene.upgrades.pilot,5);app.stop();
  assert.equal(app.scene.current.challenge.success,true);assert.match(app.document.querySelector('.trait-unlock').textContent,/회전 공.*해금/);app.panelButton('공 특성 선택').click();app.document.querySelector('[data-trait="spin"]').click();app.panelButton('같은 코스').click();app.tick();assert.equal(app.scene.current.trait,'spin');
  app.window.dispatchEvent(new app.window.PageTransitionEvent('pagehide',{persisted:false}));assert.deepEqual(app.storageAccess,{reads:0,writes:0});assert.equal(app.raw,stored);assert.deepEqual(app.errors,[]);
  const ordinary=await game(t,{stored,seeds:[17],url:'https://orbit-golf.test/games/orbit-golf/?profile=max&challenge=cookie&seed=42&trait=spin'});ordinary.submit('보존할 이름');ordinary.tick();
  assert.equal(ordinary.scene.current.seed,17);assert.equal(ordinary.scene.current.challenge,undefined);assert.equal(ordinary.scene.current.trait,'standard');assert.equal(ordinary.scene.upgrades.ball,2);assert.equal(ordinary.scene.upgrades.pilot,1);assert.equal(ordinary.saved().gold,987);assert.deepEqual(rankingRecords(ordinary.saved().rankings),JSON.parse(stored).rankings);assert.deepEqual(ordinary.saved().challengeWins,[]);assert.deepEqual(ordinary.errors,[]);
});

test('pagehide saves once, disposes the scene, cancels the loop and removes input listeners', async t => {
  const app = await game(t);
  app.submit('마지막'); app.launch(4); app.tick(40);
  const snapshot = { ...app.scene.snapshot };
  app.window.dispatchEvent(new app.window.PageTransitionEvent('pagehide', { persisted: false }));
  assert.equal(app.scene.disposed, true);
  assert.equal(app.frames.size, 0);
  assert.equal(app.saved().gold, snapshot.earned);
  assert.equal(app.saved().rankings.length, 1);
  const once = app.raw;
  app.window.dispatchEvent(new app.window.PageTransitionEvent('pagehide', { persisted: false }));
  app.$('open-ranks').click();
  app.tick(30);
  assert.equal(app.raw, once);
  assert.equal(app.frames.size, 0);
});
