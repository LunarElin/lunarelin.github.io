import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

// This suite executes the shipped DOM controller and rules unchanged. Only the
// WebGL scene is replaced: layout, pixels, real touch hardware and GPU rendering
// require browser/device verification and are deliberately outside this suite.
const KEY = 'orbit-golf:v1';
const [html, gameSource, rulesSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../game.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../rules.mjs', import.meta.url), 'utf8'),
]);
const sceneSource = `
  export class OrbitScene {
    constructor() { globalThis.__testScene = this; this.bursts = 0; this.resizes = 0; this.disposed = false; }
    burst() { this.bursts++; }
    resize() { this.resizes++; }
    dispose() { this.disposed = true; }
    render(dt, run, mode, power, upgrades) {
      this.mode = mode; this.power = power;
      this.snapshot = run ? Object.fromEntries(
        ['distance','speed','earned','banked','lane','phase','track','continued','finished','name','elapsed','tutorial','trainingBonus','wheel','durationLimit'].map(key => [key,run[key]])
      ) : null;
    }
  }
`;

function profile(overrides = {}) {
  return { version: 1, name: '', gold: 0, upgrades: { pilot: 0, ball: 0 }, rankings: [], tutorialComplete: true, ...overrides };
}

async function game(t, { stored = JSON.stringify(profile()), blockRead = false, blockWrite = false, url = 'https://orbit-golf.test/games/orbit-golf/' } = {}) {
  const dom = new JSDOM(html, {
    url,
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
  let raw = stored;
  let now = 1000;
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
    value: values => { values.fill(0xffffffff); return values; },
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
  ]);
  const entry = new vm.SourceTextModule(gameSource, { context, identifier: 'game.mjs' });
  await entry.link(specifier => {
    assert.ok(modules.has(specifier), `Unexpected runtime import: ${specifier}`);
    return modules.get(specifier);
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
    window, document, $, tick, pointer, submit, launch, stop, visibility, panelButton, frames, errors, storageAccess,
    get scene() { return window.__testScene; },
    get raw() { return raw; },
    saved() { return raw === null ? null : JSON.parse(raw); },
  };
}

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
  assert.ok(app.scene.snapshot.speed > 100, 'Releasing in the sweet spot must give a full-power shot');
  assert.ok(app.scene.bursts > 0);
  pointer('left', 'pointerdown'); tick();
  assert.equal(app.scene.snapshot.lane, -1);
  $('left').dispatchEvent(new app.window.MouseEvent('click', { bubbles: true, detail: 1 }));
  pointer('right', 'pointerdown'); tick();
  assert.equal(app.scene.snapshot.lane, 0, 'A physical click must not duplicate the pointer steering');

  const first = app.stop();
  assert.equal(first.phase, 'stopped');
  assert.ok(first.distance > 0);
  assert.equal(app.saved().gold, 250 + first.earned);
  const paid = panelButton('이어 달리기');
  assert.equal(paid.disabled, false);
  paid.click();
  assert.equal(app.saved().gold, 250 + first.earned - 40);
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
  assert.ok(app.scene.snapshot.speed > 110, 'Purchased ball upgrade applies to the next shot');
  const reloaded = await game(t, { stored: app.raw });
  assert.equal(reloaded.$('pilot-name').value, '별파일럿');
  assert.equal(reloaded.saved().rankings.length, 1);
  assert.equal(reloaded.saved().upgrades.ball, 1);
  assert.equal(app.storageAccess.reads, 1);
  assert.ok(app.storageAccess.writes > 0, 'Normal gameplay must still use its persistent profile');
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
  assert.ok(app.scene.snapshot.speed > initialSpeed + 6, 'Preview purchases must affect the actual next shot');
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
  assert.equal(app.scene.snapshot.elapsed, before.elapsed, 'Paused wall time must not consume the active-play limit');
  app.panelButton('계속').click(); app.tick();
  assert.equal(app.scene.mode, 'rolling');
  assert.ok(app.scene.snapshot.distance > before.distance);
  assert.ok(app.scene.snapshot.distance - before.distance < 10, 'Hidden elapsed time must not advance the run on resume');
  app.$('pause').click();
  app.panelButton('비행 마치기').click();
  const settled = app.saved();
  assert.equal(settled.gold, app.scene.snapshot.earned);
  assert.equal(settled.rankings.length, 1);
});

test('a new zero-gold pilot finishes a short first run, buys a ball upgrade, and flies faster next round', async t => {
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
  assert.ok(app.scene.snapshot.speed > initialSpeed + 6,
    'The purchased ball must increase actual next-shot speed at the same charge');
  const second = app.stop();
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
  app.panelButton('다시 타격').click();
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
