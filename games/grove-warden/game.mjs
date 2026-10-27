import { createGame, stepGame, setPaused, WORLD, UPGRADES, SKILLS, HUNT_ZONES, normalizeProgress, exportProgress, getQuest, claimQuest, getUpgradeOffer, buyUpgrade, getSkillOffer, learnSkill, respawnAtCamp } from './rules.mjs';
import { createRenderer } from './renderer.mjs';

const $ = id => document.getElementById(id);
const lifetime = new AbortController();
const listen = (element, type, handler, options = {}) => element.addEventListener(type, handler, { ...options, signal: lifetime.signal });
const SAVE_KEY = 'grove-warden:v4';
let settings = { sound: true }, savedProgress = normalizeProgress(), storageFailed = false;
try {
  let saved;
  for (const key of [SAVE_KEY, 'grove-warden:v3', 'grove-warden:v2']) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const candidate = JSON.parse(raw);
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) && candidate.progress && typeof candidate.progress === 'object' && !Array.isArray(candidate.progress)) { saved = candidate; break; }
      storageFailed = true;
    } catch { storageFailed = true; }
  }
  if (saved?.progress) savedProgress = normalizeProgress(saved.progress);
  if (typeof saved?.sound === 'boolean') settings.sound = saved.sound;
  if (!saved) {
    const legacy = JSON.parse(localStorage.getItem('grove-warden:v1'));
    if (typeof legacy?.sound === 'boolean') settings.sound = legacy.sound;
  }
} catch { storageFailed = true; }

let state = createGame((Date.now() ^ 73519) >>> 0, savedProgress), view, ready = false, stopped = false, frameId;
let accumulator = 0, lastTime = performance.now(), visualTime = 0, lastPhase = '', toastUntil = 0, lastHud = '', pauseKind = 'pause';
let savedRevision = state.revision, lastSaveAt = 0, helpOrigin = 'menu', growthCategory = 'stats', renderedGrowthCategory = '', lastGrowth = '';
function saveProgress(force = false) {
  if (!force && (state.revision === savedRevision || performance.now() - lastSaveAt < (storageFailed ? 2000 : 400))) return;
  lastSaveAt = performance.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ progress: exportProgress(state), sound: settings.sound }));
    savedRevision = state.revision; storageFailed = false;
  } catch { storageFailed = true; }
  $('save-warning').hidden = !storageFailed;
}

let audioContext, master;
const voices = new Set(), lastSound = new Map();
function wakeAudio() {
  if (!settings.sound) return;
  try {
    if (!audioContext) { audioContext = new (window.AudioContext || window.webkitAudioContext)(); master = audioContext.createGain(); master.gain.value = .13; master.connect(audioContext.destination); }
    audioContext.resume().catch(() => {});
  } catch { /* Silent play is supported. */ }
}
function sound(type) {
  if (!settings.sound || !audioContext || audioContext.state !== 'running' || voices.size >= 8) return;
  const now = audioContext.currentTime;
  if (now - (lastSound.get(type) ?? -10) < (type === 'hit' ? .09 : .14)) return;
  lastSound.set(type, now);
  const notes = { shoot: [620, 390, .065, 'sine'], 'owl-shoot': [710, 1020, .075, 'sine', .1], hit: [270, 160, .065, 'triangle'], 'player-hit': [140, 65, .19, 'triangle'], skill: [320, 800, .27, 'sine'], burst: [260, 110, .18, 'triangle'], upgrade: [540, 1080, .3, 'sine'], pickup: [760, 980, .09, 'sine'], deposit: [620, 1240, .3, 'sine'], quest: [660, 1320, .4, 'sine'], 'level-up': [480, 1440, .45, 'sine'], down: [230, 100, .45, 'triangle'] };
  const note = notes[type]; if (!note) return;
  const [start, end, duration, waveform, peak = .22] = note, oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
  oscillator.type = waveform; oscillator.frequency.setValueAtTime(start, now); oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
  gain.gain.setValueAtTime(.001, now); gain.gain.linearRampToValueAtTime(peak, now + .01); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  oscillator.connect(gain); gain.connect(master); voices.add(oscillator);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); voices.delete(oscillator); };
  oscillator.start(now); oscillator.stop(now + duration + .02);
}

const shell = $('game-shell'), joystick = $('joystick'), knob = $('stick-knob');
const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const input = { moveX: 0, moveZ: 0, manual: false }, keys = new Set();
let joystickPointer = null, stickOrigin = null, stick = { x: 0, z: 0 };
function refreshInput() {
  input.moveX = stick.x + (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  input.moveZ = stick.z + (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  input.manual = joystickPointer !== null || keys.size > 0;
}
function clearInput() {
  const pointer = joystickPointer;
  joystickPointer = null; stickOrigin = null; keys.clear(); stick = { x: 0, z: 0 };
  input.moveX = input.moveZ = 0; input.manual = false; joystick.hidden = true; knob.style.transform = '';
  if (pointer !== null && shell.hasPointerCapture(pointer)) shell.releasePointerCapture(pointer);
}
function toast(message, seconds = 2.7) { $('toast').textContent = message; toastUntil = performance.now() + seconds * 1000; }
function focusGame() { view?.canvas.focus({ preventScroll: true }); }
function startGame() {
  if (!ready || state.phase !== 'ready') return;
  clearInput(); wakeAudio(); state.phase = 'playing'; lastPhase = ''; accumulator = 0; lastTime = performance.now();
  $('help-menu').hidden = true; saveProgress(true); toast('이동은 직접 · 사거리 안의 적은 자동 공격', 4); updateUI(); focusGame();
}
function pauseGame(kind = 'pause') {
  clearInput();
  if (setPaused(state, true)) {
    pauseKind = kind; accumulator = 0; saveProgress(true); audioContext?.suspend().catch(() => {}); updateUI();
  }
}
function resumeGame() {
  clearInput();
  if (setPaused(state, false)) {
    pauseKind = 'pause'; wakeAudio(); accumulator = 0; lastTime = performance.now(); updateUI(); focusGame();
  }
}
function showHelp(origin) {
  clearInput(); helpOrigin = origin; $('help-menu').hidden = false; updateNavigation();
  const panel = $('help-menu').querySelector('.panel'); panel.scrollTop = 0; panel.tabIndex = -1; panel.focus({ preventScroll: true });
}

const growthButtons = [...document.querySelectorAll('[data-growth]')];
const formPreviews = {
  wolf: { name: '늑대', firstLevel: 4 },
  bear: { name: '곰', firstLevel: 8 },
  dragon: { name: '용', firstLevel: 12 },
};
const growthRows = new Map();
function updateNavigation() {
  const isGrowth = state.phase === 'paused' && pauseKind === 'growth';
  const enabled = ready && (state.phase === 'playing' || isGrowth) && $('help-menu').hidden;
  for (const button of growthButtons) {
    const category = button.dataset.growth, form = formPreviews[category];
    button.disabled = !enabled; button.setAttribute('aria-pressed', String(isGrowth && growthCategory === category));
    if (form && state.player.level < form.firstLevel) {
      button.dataset.unlockLevel = String(form.firstLevel);
      button.setAttribute('aria-label', `${form.name} 성장 미리보기, 레벨 ${form.firstLevel} 해금`);
    } else if (form) {
      button.removeAttribute('data-unlock-level'); button.setAttribute('aria-label', `${form.name} 성장 미리보기, 해금, 변신 준비 중`);
    }
  }
}
function openGrowth(category = 'stats') {
  if (!['stats', 'druid', ...Object.keys(formPreviews)].includes(category) || !ready || !$('help-menu').hidden) return;
  if (state.phase !== 'playing' && !(state.phase === 'paused' && pauseKind === 'growth')) return;
  clearInput(); growthCategory = category; lastGrowth = '';
  if (state.phase === 'playing') pauseGame('growth');
  else updateUI();
}
function buildGrowthRows() {
  if (renderedGrowthCategory === growthCategory) return;
  $('growth-list').replaceChildren(); growthRows.clear();
  const definitions = growthCategory === 'stats' ? UPGRADES : growthCategory === 'druid' ? SKILLS : [1, 2, 3].map(stage => ({ id: String(stage), stage }));
  for (const definition of definitions) {
    const row = document.createElement('div'); row.className = 'upgrade-row';
    const copy = document.createElement('div'); copy.className = 'upgrade-copy';
    const title = document.createElement('strong'), detail = document.createElement('span'), condition = document.createElement('span');
    copy.append(title, detail, condition); row.append(copy);
    let buy;
    if (!formPreviews[growthCategory]) {
      buy = document.createElement('button'); buy.className = 'upgrade-buy'; buy.type = 'button'; row.append(buy);
      buy.dataset.category = growthCategory; buy.dataset.id = definition.id;
    }
    $('growth-list').append(row); growthRows.set(definition.id, { row, title, detail, condition, buy, definition });
  }
  renderedGrowthCategory = growthCategory;
}
function renderGrowth() {
  if (state.phase !== 'paused' || pauseKind !== 'growth') return;
  const signature = [growthCategory, state.revision, state.player.level, state.progress.gold, state.inCamp].join(':');
  if (signature === lastGrowth) return;
  buildGrowthRows();
  const form = formPreviews[growthCategory];
  $('growth-title').textContent = growthCategory === 'stats' ? '능력치' : growthCategory === 'druid' ? '드루이드' : `${form.name} 성장`;
  $('growth-bank-value').textContent = state.progress.gold; $('growth-level-value').textContent = `Lv.${state.player.level}`;
  $('growth-summary').textContent = form
    ? `${state.player.level >= form.firstLevel ? '해금 · 변신 준비 중이에요.' : `Lv.${form.firstLevel}에 첫 단계가 열려요.`} 단계별 해금 조건을 확인하세요.`
    : `${state.inCamp ? '보관 골드로 영구 성장해요.' : '거점에서 성장할 수 있어요.'}${growthCategory === 'druid' ? ' 배운 기술은 전투 중 자동으로 사용해요.' : ' 필요한 레벨과 골드를 확인하세요.'}`;
  for (const row of growthRows.values()) {
    if (form) {
      const requiredLevel = form.firstLevel + (row.definition.stage - 1) * 3, unlocked = state.player.level >= requiredLevel;
      row.title.textContent = `${form.name} ${row.definition.stage}단계`;
      row.detail.textContent = `필요 Lv.${requiredLevel}`;
      row.condition.textContent = unlocked ? '해금 · 변신 준비 중' : `Lv.${requiredLevel}에 해금`;
      row.row.classList.toggle('locked', !unlocked); continue;
    }
    const offer = growthCategory === 'stats' ? getUpgradeOffer(state, row.definition.id) : getSkillOffer(state, row.definition.id);
    row.title.textContent = `${offer.name} · ${offer.level === 0 && growthCategory === 'druid' ? '미습득' : `${offer.level}단계`}`;
    if (growthCategory === 'stats') {
      row.detail.className = 'stat-value';
      row.detail.textContent = `${offer.currentValue}${offer.nextValue === null ? '' : ` → ${offer.nextValue}`}`;
      row.detail.setAttribute('aria-label', `${offer.unit} ${offer.currentValue}${offer.nextValue === null ? '' : `, 다음 ${offer.nextValue}`}`);
    }
    else if (offer.id === 'owl') {
      row.detail.textContent = offer.level === 0
        ? `1마리 동행 · ${offer.nextInterval}초마다 유도탄`
        : `1마리 동행 · 유도탄 ${offer.currentInterval}${offer.nextInterval === null ? '' : ` → ${offer.nextInterval}`}초`;
      const damage = offer.level === 0 ? offer.nextDamage : offer.currentDamage;
      if (Number.isFinite(damage)) row.detail.textContent += ` · 피해 ${damage}`;
    }
    else {
      row.detail.textContent = offer.level === 0
        ? `습득 후 ${offer.nextInterval}초마다 자동 덩굴 공격`
        : `${offer.currentInterval}초마다 자동 덩굴 공격${offer.nextInterval === null ? '' : ` · 다음 ${offer.nextInterval}초`}`;
    }
    row.condition.textContent = offer.maxed ? '최대 단계 · 영구 유지' : `필요 Lv.${offer.requiredLevel} · ${offer.cost} 골드`;
    row.buy.textContent = offer.maxed ? '최대' : `${offer.cost} G`;
    row.buy.disabled = !state.inCamp || offer.locked || offer.maxed || state.progress.gold < offer.cost;
    row.buy.setAttribute('aria-label', `${offer.name}, ${offer.maxed ? '최대 단계' : `필요 레벨 ${offer.requiredLevel}, ${offer.cost} 골드`}`);
    row.row.classList.toggle('locked', offer.locked);
  }
  lastGrowth = signature;
}
listen($('growth-list'), 'click', e => {
  const buy = e.target instanceof Element ? e.target.closest('button[data-category][data-id]') : null;
  if (!buy || buy.disabled || !$('growth-list').contains(buy) || state.phase !== 'paused' || pauseKind !== 'growth') return;
  const category = buy.dataset.category;
  const definitions = category === 'stats' ? UPGRADES : category === 'druid' ? SKILLS : [];
  const definition = definitions.find(item => item.id === buy.dataset.id);
  if (!definition || category !== growthCategory) return;
  const purchased = category === 'stats' ? buyUpgrade(state, definition.id) : learnSkill(state, definition.id);
  if (!purchased) return;
  wakeAudio(); sound('upgrade'); saveProgress(true); toast(`${definition.name} 성장 완료`); lastHud = ''; lastGrowth = ''; updateUI();
});
for (const button of growthButtons) listen(button, 'click', () => openGrowth(button.dataset.growth));
listen($('growth-close-btn'), 'click', resumeGame);
listen($('camp-btn'), 'click', () => openGrowth('stats'));
listen($('start-btn'), 'click', startGame);
listen($('pause-btn'), 'click', () => pauseGame()); listen($('resume-btn'), 'click', resumeGame);
listen($('claim-btn'), 'click', () => {
  const wasUnlocked = state.progress.unlockedDeep, reward = getQuest(state).rewardGold;
  if (claimQuest(state)) {
    sound('quest'); saveProgress(true); toast(!wasUnlocked && state.progress.unlockedDeep ? '깊은 숲으로 가는 길이 열렸어요!' : `의뢰 완료 · 보관 골드 +${reward}`);
    lastHud = ''; updateUI(); focusGame();
  }
});
listen($('recover-btn'), 'click', () => {
  if (!respawnAtCamp(state)) return;
  clearInput(); wakeAudio(); saveProgress(true); lastPhase = ''; lastTime = performance.now(); accumulator = 0; updateUI(); focusGame(); toast('모닥불에서 회복했어요 · 성장은 그대로');
});
listen($('sound-btn'), 'click', () => {
  settings.sound = !settings.sound; if (settings.sound) wakeAudio(); else audioContext?.suspend().catch(() => {});
  saveProgress(true); lastHud = ''; updateUI();
});
listen($('help-btn'), 'click', () => showHelp('menu'));
listen($('pause-help-btn'), 'click', () => showHelp('pause'));
listen($('close-help-btn'), 'click', () => { $('help-menu').hidden = true; updateNavigation(); $(helpOrigin === 'menu' ? 'help-btn' : 'pause-help-btn').focus({ preventScroll: true }); });
listen($('help-dismiss'), 'click', () => $('close-help-btn').click());

function moveStick(e) {
  if (e.pointerId !== joystickPointer || !stickOrigin) return;
  const dx = e.clientX - stickOrigin.x, dz = e.clientY - stickOrigin.y, length = Math.hypot(dx, dz), magnitude = Math.min(1, length / 24);
  stick = length < 4 ? { x: 0, z: 0 } : { x: dx / length * magnitude, z: dz / length * magnitude };
  knob.style.transform = `translate(${stick.x * 24}px,${stick.z * 24}px)`; refreshInput();
}
listen(shell, 'pointerdown', e => {
  if (!ready || state.phase !== 'playing' || joystickPointer !== null || e.isPrimary === false || (e.pointerType === 'mouse' && e.button !== 0)) return;
  if (e.target instanceof Element && e.target.closest('button,a,input,select,textarea,.overlay,.growth-nav,[role="button"]')) return;
  e.preventDefault(); joystickPointer = e.pointerId; stickOrigin = { x: e.clientX, y: e.clientY };
  const rect = shell.getBoundingClientRect(); joystick.style.left = `${e.clientX - rect.left}px`; joystick.style.top = `${e.clientY - rect.top}px`;
  joystick.hidden = false; shell.setPointerCapture(e.pointerId); moveStick(e);
});
listen(shell, 'pointermove', moveStick);
function releaseStick(e) {
  if (e.pointerId !== joystickPointer) return;
  const pointer = joystickPointer; joystickPointer = null; stickOrigin = null; stick = { x: 0, z: 0 };
  joystick.hidden = true; knob.style.transform = ''; refreshInput();
  if (shell.hasPointerCapture(pointer)) shell.releasePointerCapture(pointer);
}
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(shell, name, releaseStick);
listen(window, 'keydown', e => {
  if (!$('help-menu').hidden) { if (e.code === 'Escape') $('close-help-btn').click(); return; }
  if (e.code === 'Escape') {
    e.preventDefault(); if (state.phase === 'playing') pauseGame(); else if (state.phase === 'paused') resumeGame(); return;
  }
  if (state.phase !== 'playing') return;
  if (MOVEMENT_KEYS.has(e.code)) { e.preventDefault(); keys.add(e.code); refreshInput(); }
});
listen(window, 'keyup', e => { if (keys.delete(e.code)) refreshInput(); });
listen(window, 'blur', () => pauseGame());
listen(document, 'visibilitychange', () => { if (document.hidden) pauseGame(); });

function directionTo(target) {
  const dx = target.x - state.player.x, dz = target.z - state.player.z;
  const angle = (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2);
  return { arrow: ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][Math.round(angle / (Math.PI / 4)) % 8], distance: Math.ceil(Math.hypot(dx, dz)) };
}
function guideText(quest) {
  if (state.phase !== 'playing' || $('toast').textContent) return '';
  let target, label;
  if (state.player.hp < state.player.maxHp * .28 || state.cargo >= state.player.capacity || (quest.id === 'bank' && state.cargo > 0) || quest.id === 'attack') {
    return '';
  } else {
    if (state.huntZoneId || quest.complete && !quest.done) return '';
    let zone;
    if (quest.id === 'meadow-boss' || quest.id === 'deep-boss') zone = HUNT_ZONES.find(item => item.id === quest.id);
    else if (quest.id === 'deep') zone = HUNT_ZONES.filter(item => item.deep && item.type !== 'boss').sort((a, b) => Math.hypot(a.x - state.player.x, a.z - state.player.z) - Math.hypot(b.x - state.player.x, b.z - state.player.z))[0];
    else if (!quest.done) zone = HUNT_ZONES.find(item => item.id === 'meadow-mushrooms');
    else zone = HUNT_ZONES.filter(item => (!item.deep || state.progress.unlockedDeep) && item.type !== 'boss').sort((a, b) => Math.hypot(a.x - state.player.x, a.z - state.player.z) - Math.hypot(b.x - state.player.x, b.z - state.player.z))[0];
    if (!zone) return '';
    target = zone; label = zone.name;
  }
  const direction = directionTo(target);
  return `${direction.arrow} ${label} ${direction.distance}m`;
}
function updateUI() {
  const player = state.player, progress = state.progress, quest = getQuest(state), zone = HUNT_ZONES.find(item => item.id === state.huntZoneId), fighting = state.fightTargetId != null;
  const guide = guideText(quest); $('direction-guide').hidden = !guide;
  if ($('direction-guide').textContent !== guide) $('direction-guide').textContent = guide;
  const campDirection = directionTo(WORLD.camp);
  const campText = state.inCamp ? '안전 거점' : `${campDirection.arrow} 거점 ${campDirection.distance}m`;
  if ($('camp-direction').textContent !== campText) $('camp-direction').textContent = campText;
  const boss = state.enemies.find(enemy => enemy.type === 'boss' && enemy.hp > 0 && Math.hypot(enemy.x - player.x, enemy.z - player.z) < 9), bossPercent = boss ? Math.ceil(boss.hp / boss.maxHp * 100) : 0;
  const snapshot = [ready, state.phase, pauseKind, growthCategory, Math.ceil(player.hp), player.maxHp, player.level, player.xp, player.xpToNext, progress.gold, progress.questIndex, quest.current, state.cargo, player.capacity, state.inCamp, player.z < WORLD.gateZ, state.autoHunt, state.huntZoneId, fighting, input.manual, bossPercent, settings.sound, state.revision].join(':');
  if (snapshot !== lastHud) {
    $('hp-value').textContent = Math.ceil(player.hp); $('hp-fill').style.width = `${player.hp / player.maxHp * 100}%`;
    $('level-value').textContent = `Lv.${player.level}`; $('gold-value').textContent = progress.gold;
    $('xp-value').textContent = `${Math.floor(player.xp)} / ${player.xpToNext}`; $('xp-fill').style.width = `${Math.min(100, player.xp / player.xpToNext * 100)}%`;
    $('zone-value').textContent = state.inCamp ? '모닥불 거점' : zone ? `${zone.name} Lv.${zone.level}` : player.z < WORLD.gateZ ? '깊은 숲' : '바람 초원';
    $('quest-title').textContent = quest.title; $('quest-count').textContent = quest.done ? '완료' : `${quest.current} / ${quest.target}`;
    $('claim-btn').hidden = !quest.complete || quest.done; $('claim-btn').disabled = state.phase !== 'playing';
    $('boss-track').hidden = !boss; $('boss-fill').style.width = `${bossPercent}%`; $('boss-track').setAttribute('aria-valuenow', String(bossPercent));
    $('cargo-value').textContent = `가방 ${state.cargo} / ${player.capacity}`; $('cargo-fill').style.width = `${state.cargo / player.capacity * 100}%`;
    $('cargo-value').parentElement.parentElement.classList.toggle('full', state.cargo >= player.capacity);
    const species = { mushroom: '버섯', boar: '멧돼지', caster: '석상', boss: '수문장' };
    const lowHealth = !state.inCamp && player.hp < player.maxHp * .28;
    let status = '직접 이동';
    if (state.inCamp) status = '거점에서 회복';
    else if (lowHealth) status = '생명 위험';
    else if (state.cargo >= player.capacity) status = '가방 가득';
    else if (input.manual) status = fighting ? '자동 공격' : '직접 이동';
    else if (zone?.bossId && progress.bosses.includes(zone.bossId)) status = fighting ? '자동 공격' : '토벌 완료';
    else if (state.autoHunt && zone) status = `${species[zone.type]} 추적 사냥`;
    else if (fighting) status = '자동 공격';
    $('hunt-status').textContent = status;
    $('hunt-status').classList.toggle('danger', lowHealth); $('hp-fill').parentElement.classList.toggle('danger', lowHealth);
    $('camp-btn').hidden = !state.inCamp || state.phase !== 'playing'; $('pause-btn').disabled = state.phase !== 'playing';
    $('sound-btn').textContent = settings.sound ? '소리 켜짐' : '소리 꺼짐'; $('sound-btn').setAttribute('aria-pressed', String(settings.sound));
    updateNavigation(); lastHud = snapshot;
  }
  const phaseKey = `${state.phase}:${state.phase === 'paused' ? pauseKind : ''}`;
  if (phaseKey !== lastPhase) {
    for (const id of ['menu', 'pause-menu', 'growth-menu', 'down-menu']) $(id).hidden = true;
    if (state.phase === 'ready') $('menu').hidden = false;
    if (state.phase === 'paused') {
      const growing = pauseKind === 'growth'; $(growing ? 'growth-menu' : 'pause-menu').hidden = false;
      $(growing ? 'growth-close-btn' : 'resume-btn').focus({ preventScroll: true });
    }
    if (state.phase === 'down') {
      clearInput(); saveProgress(true); $('down-menu').hidden = false;
      $('down-stats').textContent = `레벨 ${player.level} · 보관 골드 ${progress.gold}\n가방 ${state.cargo}도 그대로 가져가요.`; $('recover-btn').focus({ preventScroll: true });
    }
    lastPhase = phaseKey;
  }
  renderGrowth();
}
function animate(now) {
  if (stopped) return;
  const delta = Math.max(0, Math.min(.1, (now - lastTime) / 1000)); lastTime = now;
  const events = [];
  if (state.phase === 'playing') {
    accumulator += delta; refreshInput();
    while (accumulator >= 1 / 60 && state.phase === 'playing') { stepGame(state, input, 1 / 60); accumulator -= 1 / 60; events.push(...state.events); }
  } else accumulator = 0;
  if (state.phase === 'playing' || state.phase === 'ready') visualTime += delta;
  state.events = events;
  for (const event of events) {
    sound(event.type);
    if (event.type === 'deposit') toast(`전리품 보관 +${event.amount} 골드 · 모닥불에서 회복`);
    if (event.type === 'level-up') toast(`레벨 ${event.level} · 더 강해졌어요!`);
    if (event.type === 'kill' && event.bossId) toast('수문장 토벌 · 의뢰 보상을 받으세요!');
  }
  if ($('toast').textContent && now > toastUntil) $('toast').textContent = '';
  updateUI(); saveProgress(); view?.draw(state, delta, visualTime); state.events = [];
  frameId = requestAnimationFrame(animate);
}
listen(window, 'pagehide', e => {
  clearInput(); saveProgress(true); pauseGame(); cancelAnimationFrame(frameId); audioContext?.suspend().catch(() => {});
  if (!e.persisted) { stopped = true; lifetime.abort(); view?.dispose(); audioContext?.close().catch(() => {}); }
});
listen(window, 'pageshow', e => { if (e.persisted && !stopped) { cancelAnimationFrame(frameId); lastTime = performance.now(); frameId = requestAnimationFrame(animate); } });

$('start-btn').disabled = true; $('save-warning').hidden = !storageFailed;
$('start-btn').textContent = savedProgress.xp > 0 || savedProgress.questIndex > 0 ? '계속 탐험' : '모험 시작';
updateUI();
try {
  view = await createRenderer($('viewport'));
  if (stopped) view.dispose();
  else {
    view.canvas.tabIndex = 0; ready = true; $('start-btn').disabled = false;
    $('load-status').textContent = savedProgress.xp > 0 ? `레벨 ${state.player.level} · 저장된 모험을 계속해요` : '전리품을 모아 거점을 키워보세요';
    cancelAnimationFrame(frameId); lastTime = performance.now(); frameId = requestAnimationFrame(animate);
  }
} catch (error) { console.error('숲을 준비하지 못했습니다.', error); $('load-status').textContent = '3D 화면을 열지 못했어요. 최신 브라우저에서 다시 열어주세요.'; }
