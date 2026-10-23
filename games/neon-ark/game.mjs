import { SIZE, ROWS, FINAL_STAGE, COLORS, UPGRADES, buildStats, pathClear, createStage, clone, sendShip, failStage, undoMove, upgradeChoices, upgradePreview, chooseUpgrade, restartStage, validState } from './rules.mjs';
import { SCENE_ART, shipArt, directionArt, upgradeArt } from './art.mjs';

const $ = id => document.getElementById(id), KEY = 'neon-ark:v3';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const names = ['푸른 궤도', '프리즘 성운', '미지의 성계'];
let profile = { best: 1, bestScore: 0, runs: 1, sound: true, legacyBest: 0 }, state, history = [], selectedUpgrade = null, paused = false, audio, migrated = false, settling = false;
const effectTimers = new Set(), launchTimers = new Set();
const bounded = (v, fallback, max) => Number.isSafeInteger(v) && v >= 0 && v <= max ? v : fallback;
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  const legacy = !saved ? JSON.parse(localStorage.getItem('neon-ark:v2') || localStorage.getItem('neon-ark:v1')) : null;
  const stored = saved?.profile;
  if (stored) profile = { best: Math.max(1, bounded(stored.best, 1, FINAL_STAGE)), bestScore: bounded(stored.bestScore, 0, 1000000000), runs: Math.max(1, bounded(stored.runs, 1, 100000)), sound: typeof stored.sound === 'boolean' ? stored.sound : true, legacyBest: bounded(stored.legacyBest, 0, 100000) };
  else if (legacy?.profile) { profile.sound = legacy.profile.sound !== false; profile.legacyBest = bounded(legacy.profile.best, 0, 100000); migrated = true; }
  // Failed attempts forfeit provisional score while retaining hull loss and recall usage.
  if (saved?.active?.version === 3 && ['failed', 'lost'].includes(saved.active.status)) saved.active.score = 0;
  if (validState(saved?.active)) {
    state = saved.active;
    if (Array.isArray(saved.history) && saved.history.length === 1 && undoMove(state, saved.history[0])) history = saved.history;
    if (state.status === 'won' && upgradeChoices(state).includes(saved.selectedUpgrade)) selectedUpgrade = saved.selectedUpgrade;
  }
} catch { /* Storage is optional. */ }
if (!state) state = createStage(1, Math.floor(Math.random() * 1000000000));
let displayedSurvey = state.launched, visualState = null;
function save() { try { localStorage.setItem(KEY, JSON.stringify({ profile, active: state, history, selectedUpgrade })); } catch { /* Session play remains available. */ } }
function later(fn, ms, effects = false) {
  const pool = effects ? effectTimers : launchTimers;
  const timer = setTimeout(() => { pool.delete(timer); fn(); }, ms); pool.add(timer); return timer;
}
function clearEffects() {
  for (const id of [...effectTimers, ...launchTimers]) clearTimeout(id);
  effectTimers.clear(); launchTimers.clear(); $('fx').replaceChildren();
  const wasSettling = settling; settling = false; visualState = null; displayedSurvey = state.launched;
  $('arena').classList.remove('evacuating'); $('planet').classList.remove('scanning'); $('hit-label').classList.remove('show');
  if (wasSettling) render();
}
function tone(type) {
  if (!profile.sound) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return;
    audio ||= new Audio(); if (audio.state === 'suspended') audio.resume().catch(() => {});
    const notes = type === 'launch' ? [523, 784, 1046] : type === 'win' ? [523, 659, 784, 1046] : type === 'blocked' ? [160, 100, 60] : [440, 587];
    notes.forEach((frequency, i) => {
      const osc = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime + i * .055;
      osc.type = type === 'blocked' ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.045, start + .008); gain.gain.exponentialRampToValueAtTime(.0001, start + .18);
      osc.connect(gain); gain.connect(audio.destination); osc.start(start); osc.stop(start + .2);
      osc.onended = () => { osc.disconnect?.(); gain.disconnect?.(); };
    });
  } catch { /* Audio is optional. */ }
}
function message(text, warning = false) { $('message').textContent = text; $('message').classList.toggle('warning', warning); }
function canPlay() { return state.status === 'playing' && !paused && !settling && !$('modal').open && !$('mission').open; }
function currentEffect(key) {
  const stats = buildStats(state.build);
  return { dock: `정박 도크 ${stats.docks}칸`, scan: `관측 ${stats.preview}명`, recall: `회항 ${stats.undoLimit}회`, armor: `최대 선체 ${stats.maxHull}` }[key];
}
function renderMission() {
  $('survey-count').textContent = `${displayedSurvey} / ${state.total}`;
  $('survey-bar').style.width = `${displayedSurvey / state.total * 100}%`;
  $('deployed').textContent = `${displayedSurvey * 3} / ${state.total * 3}명`;
  $('planet-label').textContent = displayedSurvey === state.total ? '수송 완료' : '목적지';
  $('planet').style.setProperty('--planet-hue', `${displayedSurvey * 43 % 180}deg`);
  $('planet-sprite').style.rotate = `${displayedSurvey * 37}deg`;
}
function renderCrew(view) {
  const stats = buildStats(view.build), front = COLORS[view.queue[0]];
  $('crew-count').textContent = view.queue.length;
  $('next-color').textContent = front?.name || '완료';
  $('next-color').style.color = front?.hex || '#c7fa78';
  $('crew').innerHTML = view.queue.slice(0, stats.preview).map((c, i) => `<span class="explorer ${i === 0 ? 'queue-front' : ''}" style="--color:${COLORS[c].hex}" aria-label="${i === 0 ? '맨 앞 · ' : ''}${COLORS[c].name} ${COLORS[c].symbol} 탐사대"><span>${COLORS[c].symbol}</span></span>`).join('');
  $('crew').classList.toggle('extended', Math.min(view.queue.length, stats.preview) > 8);
  document.querySelector('.game-shell').classList.toggle('long-queue', Math.min(view.queue.length, stats.preview) > 8);
  $('queue-hidden').textContent = view.queue.length > stats.preview ? `+${view.queue.length - stats.preview}` : '끝';
  $('queue-forecast').textContent = `맨 앞 ${front?.name || ''}부터 · 다음 ${Math.min(view.queue.length, stats.preview)}명`;
  updateGuide(view);
}
function updateGuide(view) {
  const front = view.queue[0], teaching = view.stage === 1 && view.moves < 3;
  const target = teaching ? view.ships.find(s => s.color === front && pathClear(view.ships, s)) : null;
  for (const button of $('board').querySelectorAll('[data-ship]')) {
    const ship = view.ships.find(s => s.id === button.dataset.ship);
    button.classList.toggle('front-match', ship?.color === front);
    button.classList.toggle('tutorial-target', target?.id === ship?.id && !!ship);
  }
  $('move-hint').textContent = target ? `${COLORS[front].name} 셔틀 터치` : '화살표 쪽으로 출차';
}
function renderDocks(view) {
  const stats = buildStats(view.build), free = view.docks.filter(s => !s).length;
  $('docks').style.setProperty('--dock-count', stats.docks);
  $('docks').classList.toggle('expanded', stats.docks > 3);
  $('docks').innerHTML = view.docks.map((ship, i) => ship ? `<button class="dock ${ship.loaded === 3 ? 'full' : ''}" data-dock="${i}" data-loaded="${ship.loaded}" style="--color:${COLORS[ship.color].hex}" aria-label="도크 ${i + 1}, ${COLORS[ship.color].name}, ${ship.loaded}/3명 탑승">${shipArt(COLORS[ship.color].hex, ship.loaded)}<span class="dock-symbol" aria-hidden="true">${COLORS[ship.color].symbol}</span><span class="dock-info"><b>${ship.loaded}/3</b><span class="pips">${[0, 1, 2].map(n => `<i class="${n < ship.loaded ? 'filled' : ''}"></i>`).join('')}</span></span></button>` : `<div class="dock empty" aria-label="빈 도크 ${i + 1}"><span>빈칸</span></div>`).join('');
  $('docks').classList.toggle('jammed', view.failureReason === 'jam');
  $('dock-free').classList.toggle('last-slot', free <= 1);
  $('dock-free').textContent = `빈칸 ${free}`;
  $('dock-warning').hidden = free !== 1 || view.status !== 'playing';
}
function renderBoard(view) {
  const tiles = [], front = view.queue[0];
  const teaching = view.stage === 1 && view.moves < 3;
  const target = teaching ? view.ships.find(s => s.color === front && pathClear(view.ships, s)) : null;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < SIZE; x++) {
    const ship = view.ships.find(s => s.x === x && s.y === y);
    if (!ship) { tiles.push('<div class="cell blank" aria-hidden="true"></div>'); continue; }
    const c = COLORS[ship.color], open = pathClear(view.ships, ship);
    tiles.push(`<button class="cell ship heading-${ship.dir} ${open ? 'can-exit' : 'blocked'} ${ship.color === front ? 'front-match' : ''} ${target?.id === ship.id ? 'tutorial-target' : ''}" data-ship="${ship.id}" style="--color:${c.hex};--angle:${ship.dir * 90}deg" aria-label="${c.name} ${c.symbol} 셔틀, ${['위', '오른쪽', '아래', '왼쪽'][ship.dir]} 방향, ${x + 1}열 ${y + 1}행, ${open ? '출차 가능' : '앞이 막힘'}">${shipArt(c.hex)}<span class="ship-symbol">${c.symbol}</span><span class="ship-direction" aria-hidden="true">${directionArt()}</span></button>`);
  }
  $('board').innerHTML = tiles.join(''); $('board').inert = !canPlay();
  $('ships-left').textContent = String(view.ships.length).padStart(2, '0');
  $('move-hint').textContent = target ? `${COLORS[front].name} 셔틀 터치` : '화살표 쪽으로 출차';
}
function render() {
  const focusedShip = document.activeElement?.closest?.('[data-ship]')?.dataset.ship;
  const view = visualState || state, stats = buildStats(state.build), phase = Math.floor((state.stage - 1) / 3), free = view.docks.filter(s => !s).length;
  $('sector-label').textContent = `항로 ${state.stage}/9`; $('sector-name').textContent = names[phase];
  $('best-stage').textContent = String(profile.best).padStart(2, '0');
  $('legacy-record').textContent = profile.legacyBest ? `이전 기록 · 항로 ${profile.legacyBest}` : '';
  $('route').innerHTML = names.map((name, i) => `<div class="route-step ${i === phase ? 'active' : ''}"><i>${i + 1}</i><div><b>${name}</b><small>SECTOR ${i * 3 + 1}—${i * 3 + 3}</small></div></div>`).join('');
  $('hull').textContent = `${view.hull} / ${stats.maxHull}`;
  $('hull-pips').innerHTML = Array.from({ length: stats.maxHull }, (_, i) => `<i class="${i < view.hull ? 'intact' : ''}">⬡</i>`).join('');
  $('hull-pips').setAttribute('aria-label', `현재 선체 ${view.hull}, 최대 ${stats.maxHull}`);
  $('undo-output').textContent = `${stats.undoLimit - state.undoUsed} / ${stats.undoLimit}회`;
  $('preview-output').textContent = `앞 ${stats.preview}명`;
  $('dock-capacity').textContent = `${free}/${stats.docks}칸`; $('run-score').textContent = (state.runScore + state.score).toLocaleString();
  $('upgrade-count').textContent = Object.values(state.build).reduce((a, b) => a + b, 0);
  const active = Object.entries(state.build).filter(([, rank]) => rank > 0);
  $('build-list').innerHTML = active.length ? active.map(([key, rank]) => `<button class="build-entry" data-inspect="${key}" style="--color:${UPGRADES[key].color}" aria-label="${UPGRADES[key].name} 레벨 ${rank} 효과 보기"><i>${upgradeArt(key)}</i><span><b>${UPGRADES[key].name} <em>LV.${rank}</em></b><small>${currentEffect(key)}</small></span><span>ⓘ</span></button>`).join('') : '<p class="empty-build">클리어 보상</p>';
  const image = phase === 1 ? SCENE_ART.planetPurple : SCENE_ART.planetCyan;
  if ($('planet-sprite').getAttribute('src') !== image) $('planet-sprite').src = image;
  $('combo').textContent = `×${state.combo}`; $('combo').classList.toggle('hot', state.combo >= 2);
  document.querySelector('.game-shell').classList.toggle('fever', state.combo >= 3);
  $('chain-label').textContent = '점수 보너스';
  renderCrew(view); renderDocks(view);
  $('score').textContent = state.score.toLocaleString();
  $('undo').textContent = `↶ 회항 ${stats.undoLimit - state.undoUsed}`;
  $('undo').disabled = !canPlay() || !history.length || state.undoUsed >= stats.undoLimit;
  $('restart').disabled = settling || state.status === 'won' || state.status === 'lost';
  $('restart').textContent = state.status === 'failed' ? '↻ 재도전' : '귀환 −1';
  $('restart').setAttribute('aria-label', state.status === 'failed' ? '남은 선체로 같은 항로 재도전' : '탐사 중단 · 선체 1 소모');
  $('sound').textContent = profile.sound ? '효과음 켜짐' : '효과음 꺼짐'; $('sound').setAttribute('aria-pressed', String(profile.sound)); $('sound').setAttribute('aria-label', profile.sound ? '효과음 끄기' : '효과음 켜기');
  $('risk-label').textContent = ['failed', 'lost'].includes(state.status) ? '선체 −1 · 회항 불가' : '도크 포화 · 선체 −1';
  renderBoard(view);
  if (state.status === 'playing') $('arena').classList.remove('inspect-failure');
  $('puzzle-area').hidden = state.status === 'won' && !settling;
  renderMission(); renderChoice();
  if (focusedShip && canPlay()) ($('board').querySelector(`[data-ship="${focusedShip}"]`) || $('board').querySelector('.ship'))?.focus({ preventScroll: true });
}
function renderChoice() {
  const choice = $('upgrade-choice'); choice.hidden = state.status === 'playing' || settling; if (choice.hidden) return;
  choice.classList.toggle('failure-choice', state.status === 'failed' || state.status === 'lost');
  if (state.status === 'failed' || state.status === 'lost') {
    choice.innerHTML = `<div class="choice-heading failure-heading"><span>선체 −1</span><h2>${state.failureReason === 'jam' ? '도크 포화' : '긴급 귀환'}</h2><p>남은 선체 <b>${state.hull}</b> · 회항 불가<br>항로 점수 포기 · 보상 없음</p></div>${state.status === 'failed' ? '<button class="failure-peek" data-action="inspect-failure">보드</button><button class="primary confirm-upgrade" data-action="retry">재도전</button>' : '<button class="primary confirm-upgrade" data-action="new-run">다시 시작</button>'}`; return;
  }
  if (state.stage === FINAL_STAGE) {
    choice.innerHTML = `<div class="choice-heading"><span>원정 완료</span><h2>수송 성공!</h2><p>9개 항로 완주<br>점수 ${(state.runScore + state.score).toLocaleString()} · 선체 ${state.hull}</p></div><button class="primary confirm-upgrade" data-action="new-run">새 원정</button>`; return;
  }
  const selected = selectedUpgrade ? upgradePreview(state, selectedUpgrade) : null;
  choice.innerHTML = `<div class="choice-heading"><span>전원 탑승!</span><h2>강화 선택</h2><p>셔틀 ${state.total}대 출발<br>${state.total * 3}명 전원 수송</p></div><div class="upgrade-cards" role="group" aria-label="클리어 보상 강화 선택">${upgradeChoices(state).map(key => { const u = upgradePreview(state, key); return `<button class="upgrade-card ${selectedUpgrade === key ? 'selected' : ''}" data-upgrade="${key}" style="--color:${u.color}" aria-pressed="${selectedUpgrade === key}"><span class="upgrade-type">Lv.${u.rank}</span><i>${upgradeArt(key)}</i><b>${u.name}</b><small>${u.summary}</small><span class="upgrade-values">${u.before}<strong>→ ${u.after}</strong></span></button>`; }).join('')}</div><div id="upgrade-detail" class="upgrade-detail" aria-live="polite">${selected ? `<span class="detail-label">선택 · Lv.${selected.rank}</span><h3>${selected.name}</h3><p>${selected.effect}</p><div class="effect-comparison"><span>현재 <b>${selected.before}</b></span><i>→</i><span>강화 후 <b>${selected.after}</b></span></div><p class="effect-example">${selected.example}</p><small>다음 항로부터 · 원정 동안 유지</small>` : '<span class="detail-label">효과 미리보기</span><h3>강화를 고르세요.</h3><p>카드를 누르면 효과를 볼 수 있어요.</p>'}</div><button class="primary confirm-upgrade" data-action="confirm-upgrade" ${selected ? '' : 'disabled'}>${selected ? '강화하기' : '강화를 선택하세요'}</button>`;
}
function point(el) { const a = $('arena').getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left + r.width / 2 - a.left, y: r.top + r.height / 2 - a.top }; }
function fxNode(className, x, y, color) {
  const node = document.createElement('i'); node.className = className; node.style.left = `${x}px`; node.style.top = `${y}px`; node.style.setProperty('--color', color);
  if ($('fx').children.length >= 100) $('fx').firstElementChild.remove();
  $('fx').append(node); later(() => node.remove(), 1000, true); return node;
}
function surveyFX(launch, arrived = () => {}) {
  const from = launch.origin, to = point($('planet')), color = COLORS[launch.color].hex, dx = to.x - from.x, dy = to.y - from.y;
  tone('launch');
  const path = fxNode('departure-path', from.x, from.y, color); path.style.width = `${Math.hypot(dx, dy)}px`; path.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  const flight = fxNode('survey-flight', from.x, from.y, color); flight.innerHTML = shipArt(color, 3);
  flight.style.setProperty('--dx', `${dx}px`); flight.style.setProperty('--dy', `${dy}px`); flight.style.setProperty('--heading', `${Math.atan2(dy, dx) + Math.PI / 2}rad`);
  later(() => {
    displayedSurvey = Math.max(displayedSurvey, launch.planet); renderMission();
    fxNode('survey-ring', to.x, to.y, color);
    for (let i = 0; i < 12; i++) { const spark = fxNode('survey-spark', to.x, to.y, color), angle = i * Math.PI / 6; spark.style.setProperty('--dx', `${Math.cos(angle) * 65}px`); spark.style.setProperty('--dy', `${Math.sin(angle) * 65}px`); }
    const pop = fxNode('survey-pop', to.x, to.y + 24, color); pop.textContent = '3명 수송!';
    $('planet').classList.add('scanning'); later(() => $('planet').classList.remove('scanning'), 550, true);
    arrived();
  }, 420);
}
function directionFeedback(ship, button, blocked = false) {
  const from = point(button), grid = $('board').getBoundingClientRect();
  const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][ship.dir];
  const inFront = state.ships.filter(s => s.id !== ship.id && (dx ? s.y === ship.y && (s.x - ship.x) * dx > 0 : s.x === ship.x && (s.y - ship.y) * dy > 0));
  const blocker = inFront.sort((a, b) => Math.abs(a.x - ship.x) + Math.abs(a.y - ship.y) - Math.abs(b.x - ship.x) - Math.abs(b.y - ship.y))[0];
  const steps = blocked && blocker ? Math.abs(blocker.x - ship.x) + Math.abs(blocker.y - ship.y) : dx ? dx > 0 ? SIZE - ship.x : ship.x + 1 : dy > 0 ? ROWS - ship.y : ship.y + 1;
  const end = { x: from.x + dx * steps * grid.width / SIZE, y: from.y + dy * steps * grid.height / ROWS };
  if (!reduced) {
    const ray = fxNode('drive-route', from.x, from.y, blocked ? '#ff9a8b' : '#edffff');
    ray.style.width = `${Math.hypot(end.x - from.x, end.y - from.y)}px`; ray.style.transform = `rotate(${ship.dir * 90 - 90}deg)`;
    if (blocker) { const obstacle = $('board').querySelector(`[data-ship="${blocker.id}"]`); obstacle?.classList.add('obstacle'); later(() => obstacle?.classList.remove('obstacle'), 850, true); }
  }
  return { from, exit: end };
}
function replayMove(before, result, route) {
  visualState = clone(before);
  const finish = () => {
    settling = false; visualState = null; displayedSurvey = state.launched; render(); statusMessage();
    if (['failed', 'lost'].includes(state.status)) damageFX();
    else if (state.status === 'won') tone('win');
    (state.status === 'playing' ? $('board').querySelector('.tutorial-target, .front-match.can-exit, .can-exit') : $('upgrade-choice').querySelector('button'))?.focus({ preventScroll: true });
  };
  const next = index => {
    const event = result.events[index]; if (!event) { finish(); return; }
    const color = COLORS[event.color].hex;
    if (event.type === 'dock') {
      const to = point($('docks').children[event.dock]), flight = fxNode('park-flight', route.from.x, route.from.y, color);
      flight.innerHTML = shipArt(color); flight.style.setProperty('--dx', `${to.x - route.from.x}px`); flight.style.setProperty('--dy', `${to.y - route.from.y}px`);
      flight.style.setProperty('--ex', `${route.exit.x - route.from.x}px`); flight.style.setProperty('--ey', `${route.exit.y - route.from.y}px`); flight.style.setProperty('--angle', `${event.dir * 90}deg`);
      visualState.ships = visualState.ships.filter(s => s.id !== event.shipId); renderBoard(visualState);
      message('화살표 쪽으로 출차');
      later(() => { flight.remove(); visualState.docks[event.dock] = { ...result.ship }; renderDocks(visualState); next(index + 1); }, 240);
    } else if (event.type === 'board') {
      const person = $('crew').firstElementChild, dock = $('docks').children[event.dock];
      const from = person ? point(person) : point($('crew')), seat = dock.querySelector(`[data-seat="${event.loaded - 1}"]`), to = point(seat || dock);
      const passenger = fxNode('boarding-flight', from.x, from.y, color); passenger.innerHTML = person?.outerHTML || '';
      passenger.style.setProperty('--dx', `${to.x - from.x}px`); passenger.style.setProperty('--dy', `${to.y - from.y}px`); person?.classList.add('boarding-away');
      message(`${COLORS[event.color].name} 탑승 · ${event.loaded}/3`); tone('board');
      later(() => { passenger.remove(); visualState.queue.shift(); visualState.docks[event.dock].loaded = event.loaded; renderCrew(visualState); renderDocks(visualState); next(index + 1); }, 130);
    } else {
      message('3/3 만석! 출발');
      later(() => {
        const origin = point($('docks').children[event.dock]); visualState.docks[event.dock] = null; renderDocks(visualState);
        surveyFX({ ...event, origin }, () => { visualState.launched = event.planet; next(index + 1); });
      }, 120);
    }
  };
  render(); next(0);
}
function damageFX() {
  tone('blocked'); if (reduced) return;
  $('arena').classList.add('evacuating'); $('hit-label').textContent = '비상 이탈 · 선체 −1'; $('hit-label').classList.add('show');
  later(() => { $('arena').classList.remove('evacuating'); $('hit-label').classList.remove('show'); }, 700, true);
}
function statusMessage() {
  if (state.status === 'failed' || state.status === 'lost') message(state.status === 'lost' ? '원정 종료 · 선체 0' : `${state.failureReason === 'jam' ? '탑승장 포화' : '긴급 귀환'} · 선체 ${state.hull}`, true);
  else if (state.status === 'won') message(state.stage === FINAL_STAGE ? '수송 성공!' : '전원 탑승 · 강화 선택');
  else if (state.docks.filter(s => !s).length === 1) message('빈칸 1 · 포화 시 선체 −1', true);
  else message(`앞줄 ${COLORS[state.queue[0]].name} → 같은 색 셔틀`);
}
function activateShip(id, button) {
  if (!canPlay()) return;
  const before = clone(state), result = sendShip(state, id);
  if (!result.ok) { const ship = before.ships.find(s => s.id === id); if (ship) directionFeedback(ship, button, true); message('앞이 막혔어요 · 막는 셔틀부터', true); tone('blocked'); if (!reduced) button.animate?.([{ translate: '-3px' }, { translate: '3px' }, { translate: '0' }], { duration: 130 }); return; }
  const route = directionFeedback(result.ship, button);
  history = !result.launches.length && state.status === 'playing' ? [before] : [];
  selectedUpgrade = null; profile.best = Math.max(profile.best, state.stage);
  if (state.status === 'won') profile.bestScore = Math.max(profile.bestScore, state.runScore + state.score);
  settling = !reduced; displayedSurvey = settling ? before.launched : state.launched;
  save();
  if (settling) replayMove(before, result, route);
  else { render(); statusMessage(); if (['failed', 'lost'].includes(state.status)) damageFX(); }
}
function showModal(title, content, actions = [{ text: '계속', action: 'close', primary: true }]) {
  if ($('mission').open) $('mission').close();
  clearEffects(); paused = true; document.querySelector('.game-shell').classList.add('paused'); audio?.suspend?.().catch(() => {});
  $('modal-content').innerHTML = `<p class="eyebrow">안내</p><h2 id="modal-title">${title}</h2>${content}<div class="dialog-actions">${actions.map(a => `<button class="${a.primary ? 'primary' : 'secondary'}" data-action="${a.action}">${a.text}</button>`).join('')}</div>`;
  if (!$('modal').open) $('modal').showModal();
}
function syncPause() { paused = $('modal').open || $('mission').open; document.querySelector('.game-shell').classList.toggle('paused', paused); render(); }
function closeModal() { if ($('modal').open) $('modal').close(); syncPause(); }
function closeMission() { if ($('mission').open) $('mission').close(); }
function showMission() {
  clearEffects(); paused = true; document.querySelector('.game-shell').classList.add('paused'); audio?.suspend?.().catch(() => {}); render();
  if (!$('mission').open) $('mission').showModal();
}
function newRun() {
  clearEffects(); closeModal(); history = []; selectedUpgrade = null; profile.runs++;
  state = createStage(1, Math.floor(Math.random() * 1000000000)); displayedSurvey = 0; save(); render(); statusMessage();
}
function retry() { const next = restartStage(state); if (!next) return; clearEffects(); state = next; history = []; displayedSurvey = 0; save(); render(); message(`재도전 · 선체 ${state.hull}`); }
$('board').addEventListener('click', e => { const ship = e.target.closest('[data-ship]'); if (ship) activateShip(ship.dataset.ship, ship); });
$('docks').addEventListener('click', e => { if (canPlay() && e.target.closest('[data-dock]')) showModal('탑승 대기', '<p>대기열 맨 앞부터 같은 색 탐사정에 탑승합니다.</p><p><b>3명 탑승 → 행성 1개 조사</b></p><p>도크가 모두 차면 선체 −1. 앞을 막는 탐사정부터 계획해 보관하세요.</p>'); });
$('upgrade-choice').addEventListener('click', e => {
  if (paused || settling || $('modal').open) return;
  const card = e.target.closest('[data-upgrade]'), action = e.target.closest('[data-action]')?.dataset.action;
  if (card && state.status === 'won' && upgradeChoices(state).includes(card.dataset.upgrade)) {
    selectedUpgrade = card.dataset.upgrade; save(); renderChoice();
    $('upgrade-choice').querySelector(`[data-upgrade="${selectedUpgrade}"]`)?.focus({ preventScroll: true });
    $('upgrade-detail').scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); return;
  }
  if (action === 'confirm-upgrade') {
    const next = chooseUpgrade(state, selectedUpgrade); if (!next) return;
    const name = UPGRADES[selectedUpgrade].name; clearEffects(); state = next; selectedUpgrade = null; history = []; displayedSurvey = 0; profile.best = Math.max(profile.best, state.stage); save(); render(); message(`${name} 강화!`);
  } else if (action === 'inspect-failure') $('arena').classList.add('inspect-failure');
  else if (action === 'retry') retry();
  else if (action === 'new-run') newRun();
});
$('build-list').addEventListener('click', e => { const key = e.target.closest('[data-inspect]')?.dataset.inspect; if (!key || !state.build[key]) return; showModal(`${UPGRADES[key].name} · LV.${state.build[key]}`, `<p><strong>현재 효과: ${currentEffect(key)}</strong></p><p>${UPGRADES[key].effect}</p><p class="note">이번 원정 동안 누적 유지됩니다.</p>`); });
$('undo').addEventListener('click', () => {
  if (!canPlay()) return; const previous = undoMove(state, history[0]); if (!previous) return;
  clearEffects(); state = previous; history = []; displayedSurvey = state.launched; save(); render(); message(`회항 완료 · 남음 ${buildStats(state.build).undoLimit - state.undoUsed}`);
});
$('restart').addEventListener('click', () => {
  if (state.status === 'failed') { retry(); return; } if (!canPlay()) return;
  showModal('긴급 귀환', `<p>이번 조사 · 점수 포기</p><p class="cost-preview">선체 <strong>${state.hull} → ${state.hull - 1}</strong></p><p>${state.hull === 1 ? '원정 종료' : '같은 항로 재도전 가능'}<br>쓴 회항 횟수 유지</p>`, [{ text: '계속', action: 'close' }, { text: '귀환 −1', action: 'abort', primary: true }]);
});
$('new-run').addEventListener('click', () => showModal('새 원정', '<p>항로 1 · 선체 3 · 강화 초기화<br>기록은 보관합니다.</p>', [{ text: '계속 탐사', action: 'close' }, { text: '시작', action: 'new-run', primary: true }]));
$('pause').addEventListener('click', () => showModal('일시 정지', '<p>준비되면 이어가세요.</p>'));
$('menu').addEventListener('click', showMission);
$('mission-close').addEventListener('click', closeMission);
$('resume').addEventListener('click', closeMission);
$('mission').addEventListener('close', syncPause);
$('help').addEventListener('click', () => showModal('모두 태우세요!', '<ol><li><b>앞줄 색 확인</b><br>대기열 맨 앞 사람부터 탑니다.</li><li><b>같은 색 셔틀 터치</b><br>화살표 쪽이 비어야 나옵니다. 막혀 있으면 앞의 셔틀부터 빼세요.</li><li><b>3명 만석 → 출발</b><br>탑승장에 도착하면 자동 탑승. 빈자리를 다시 쓸 수 있어요.</li></ol><p><b>탑승장 포화 → 선체 −1</b><br>선체 0이면 원정 종료. 귀환도 선체 1을 씁니다.</p><p class="note">회항: 직전 정박만 취소 · 기본 1회.<br>출발·실패 취소 불가. 재도전해도 쓴 횟수 유지.<br>클리어마다 강화 하나 · 총 9항로.</p>'));
$('sound').addEventListener('click', () => { profile.sound = !profile.sound; if (!profile.sound) audio?.suspend?.().catch(() => {}); save(); render(); });
$('modal-close').addEventListener('click', closeModal);
$('modal').addEventListener('close', syncPause);
$('modal').addEventListener('click', e => {
  if (!$('modal').open) return; const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'close') closeModal();
  else if (action === 'abort' && state.status === 'playing') { clearEffects(); failStage(state); history = []; closeModal(); save(); render(); statusMessage(); damageFX(); }
  else if (action === 'new-run') newRun();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); clearEffects(); audio?.suspend?.().catch(() => {}); if (!$('modal').open && !$('mission').open) showModal('일시 정지', '<p>진행 상황을 저장했어요.</p>'); } });
window.addEventListener('pagehide', () => { save(); clearEffects(); audio?.suspend?.().catch(() => {}); });
render(); save(); statusMessage();
if (migrated) message('새 탐사 시작 · 이전 기록 보관');
