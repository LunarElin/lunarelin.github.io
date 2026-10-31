import { createGame, stepGame, setPaused, WORLD, UPGRADES, SKILLS, HUNT_ZONES, STAGES, FORMS, getStage, getCamp, isStageUnlocked, getFormOffer, buyFormUpgrade, normalizeProgress, exportProgress, getQuest, claimQuest, getUpgradeOffer, buyUpgrade, getSkillOffer, learnSkill, respawnAtCamp, selectWeapon } from './rules.mjs';
import { createRenderer } from './renderer.mjs';
import { createGameAudio } from './audio.mjs';
import { WEAPONS, activeWeapon, getWeaponAttack } from './equipment.mjs';

const $ = id => document.getElementById(id);
const lifetime = new AbortController();
const listen = (element, type, handler, options = {}) => element.addEventListener(type, handler, { ...options, signal: lifetime.signal });
const SAVE_KEY = 'grove-warden:v9';
let settings = { sound: true }, savedProgress = normalizeProgress(), storageFailed = false;
try {
  let saved;
  for (const key of [SAVE_KEY, 'grove-warden:v8', 'grove-warden:v7', 'grove-warden:v6', 'grove-warden:v5', 'grove-warden:v4', 'grove-warden:v3', 'grove-warden:v2']) {
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
let accumulator = 0, lastTime = performance.now(), lastPhase = '', lastHud = '', pauseKind = 'pause';
let savedRevision = state.revision, lastSaveAt = 0, helpOrigin = 'menu', growthCategory = 'stats', renderedGrowthCategory = '', lastGrowth = '', selectedForm = 'wolf';
function saveProgress(force = false) {
  if (!force && (state.revision === savedRevision || performance.now() - lastSaveAt < (storageFailed ? 2000 : 400))) return;
  lastSaveAt = performance.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ progress: exportProgress(state), sound: settings.sound }));
    savedRevision = state.revision; storageFailed = false;
  } catch { storageFailed = true; }
  updateSaveWarning();
}
function updateSaveWarning() {
  $('save-warning').hidden = !storageFailed;
  $('save-indicator').hidden = !storageFailed;
  $('pause-btn').setAttribute('aria-label', storageFailed ? '일시 정지, 저장할 수 없어요' : '일시 정지');
}

const audio = createGameAudio({ enabled: settings.sound });
const wakeAudio = () => audio.wake();
const sound = type => audio.play(type);

const shell = $('game-shell'), joystick = $('joystick'), knob = $('stick-knob');
const acknowledgedUIEvents = new WeakSet();
function pulse(id, kind = 'reward-pop') { $(id).classList.add(kind); }
for (const name of ['animationend', 'animationcancel']) listen(shell, name, e => {
  if (e.target instanceof Element) e.target.classList.remove('reward-pop', 'hurt-pop');
});
function presentEvent(event) {
  sound(event.type === 'melee-attack' ? event.weaponId === 'axe' ? 'bear-slam' : 'wolf-swipe'
    : event.type === 'shoot' && ['burst', 'spread', 'explosive'].includes(event.weaponStyle) ? `staff-${event.weaponStyle}` : event.type);
  if (event.type === 'player-hit') pulse('hp-value', 'hurt-pop');
  if (event.type === 'pickup') pulse('cargo-value');
  if (event.type === 'deposit') { pulse('gold-value'); pulse('cargo-value'); }
  if (event.type === 'level-up') {
    pulse('level-value'); pulse('hp-value'); pulse('xp-fill');
    const unlocked = FORMS.find(form => form.firstLevel === event.level);
    if (unlocked) pulse('growth-forms-btn');
  }
  if (event.type === 'kill' && event.bossId) pulse('quest-btn');
  if (event.type === 'field-discovery') sound('quest');
  if (event.type === 'field-chest') { sound('quest'); pulse('cargo-value'); }
  if (event.type === 'field-boon') { sound('upgrade'); pulse('hp-value'); }
  if (event.type === 'field-hazard' || event.type === 'staff-explosion') sound('burst');
  if (event.type === 'transform' && event.form !== 'druid') sound('transform');
  if (event.type === 'form-attack') sound(event.form === 'wolf' ? 'wolf-swipe' : event.form === 'bear' ? 'bear-slam' : 'dragon-fire');
  if (event.type === 'quest') { pulse('gold-value'); pulse('quest-btn'); }
  if (event.type === 'upgrade') { if (event.id === 'weapon') pulse('growth-weapons-btn'); else { pulse('growth-bank-value'); pulse('gold-value'); } }
}
function presentQueuedUIEvent() {
  const event = state.queuedEvents.at(-1);
  if (!event || !['upgrade', 'quest'].includes(event.type)) return;
  acknowledgedUIEvents.add(event); presentEvent(event);
}
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
function focusGame() { view?.canvas.focus({ preventScroll: true }); }
function startGame() {
  if (!ready || state.phase !== 'ready') return;
  clearInput(); wakeAudio(); state.phase = 'playing'; lastPhase = ''; accumulator = 0; lastTime = performance.now();
  $('help-menu').hidden = true; saveProgress(true); updateUI(); focusGame();
}
function pauseGame(kind = 'pause') {
  clearInput();
  if (setPaused(state, true)) {
    pauseKind = kind; accumulator = 0; saveProgress(true); audio.suspend(); updateUI();
  }
}
function openQuest() {
  if (!ready || state.phase !== 'playing' || !$('help-menu').hidden) return;
  pauseGame('quest');
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
const formPreviews = Object.fromEntries(FORMS.map(form => [form.id, form]));
const growthRows = new Map();
const weaponRows = new Map();
const formTabs = [...document.querySelectorAll('[data-form]')];
function formatAmount(value) {
  if (value < 10000) return String(value);
  const divisor = value >= 100000000 ? 100000000 : 10000, amount = value / divisor;
  const rounded = Number(amount.toFixed(amount >= 100 ? 0 : amount >= 10 ? 1 : 2));
  return divisor === 10000 && rounded >= 10000 ? '1억' : `${rounded}${divisor === 10000 ? '만' : '억'}`;
}
const formatSeconds = value => Number(value.toFixed(value < 1 ? 3 : 2));
function showAmount(id, value, label) {
  const element = $(id);
  element.textContent = formatAmount(value); element.setAttribute('aria-label', `${label} ${value}`); element.title = String(value);
}
function weaponIcon(definition) {
  const border = '#292537', light = '#f2e7c5', handle = '#b58b56';
  const body = definition.id === 'sword'
    ? `<path fill="${border}" d="M7 0h3v2h2v6h-2v2h3v2H9v4H6v-4H3v-2h3V3h1Z"/><path fill="currentColor" d="M8 1h1v2h2v4H9v2H7V4h1Z"/><path fill="${handle}" d="M4 10h8v1H4Zm3 2h1v3H7Z"/>`
    : definition.id === 'axe'
    ? `<path fill="${border}" d="M6 0h4v2h4v6h-4v8H6V9H1V2h5Z"/><path fill="currentColor" d="M2 3h4v5H2Zm8 0h3v4h-3Z"/><path fill="${handle}" d="M7 1h2v14H7Z"/>`
    : definition.id === 'spear'
    ? `<path fill="${border}" d="M7 0h2v1h1v2h1v3H9v10H6V6H4V3h1V1h2Z"/><path fill="currentColor" d="M7 1h1v1h1v3H6V3h1Z"/><path fill="${handle}" d="M7 6h1v9H7Z"/>`
    : `<path d="M7 1h6v2h2v5h-2v2h-3v5H6v-4H4V9h3V7H5V3h2Z" fill="${border}"/><path d="M8 2h4v2h2v3h-2v2H8V7H6V4h2Z" fill="currentColor"/><path d="M8 10h2v4H8Z" fill="${handle}"/><path d="M8 3h3v1H8ZM7 4h1v2H7Z" fill="${light}"/>`;
  return `<svg viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">${body}</svg>`;
}
function renderWeapons() {
  const selected = activeWeapon(state.progress).id;
  for (const definition of WEAPONS) {
    let row = weaponRows.get(definition.id);
    if (!row) {
      const card = document.createElement('article'); card.className = 'weapon-card';
      const heading = document.createElement('div'); heading.className = 'weapon-heading';
      const icon = document.createElement('span'); icon.className = 'weapon-icon'; icon.innerHTML = weaponIcon(definition);
      icon.style.color = `#${(definition.color ?? 0xd6d5c8).toString(16).padStart(6, '0')}`;
      const copy = document.createElement('div'), name = document.createElement('strong'), pattern = document.createElement('span');
      copy.append(name, pattern); heading.append(icon, copy);
      const values = document.createElement('p'); values.className = 'weapon-values';
      const tradeoff = document.createElement('p'); tradeoff.className = 'weapon-tradeoff';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'weapon-select';
      button.setAttribute('data-weapon', definition.id);
      card.append(heading, values, tradeoff, button); $('weapon-list').append(card);
      row = { card, name, pattern, values, tradeoff, button }; weaponRows.set(definition.id, row);
    }
    const attack = getWeaponAttack(definition.id, state.player), shots = (attack.burstCount ?? 1) * (attack.spreadAngles?.length ?? 1);
    const damage = formatAmount(Math.round(attack.damage));
    const damageLabel = attack.volleyHitLimit ? `${damage} · ${shots}방향` : `${damage}${shots > 1 ? `×${shots}` : ''}`;
    row.name.textContent = definition.name; row.pattern.textContent = `${definition.attackLabel ?? ''}${attack.groundOnly ? ' · 지면' : ''}`;
    row.values.textContent = `피해 ${damageLabel} · ${formatSeconds(attack.interval)}초\n거리 ${attack.range}m${attack.blastRadius ? ` · 폭발 ${attack.blastRadius}m` : ''}`;
    row.values.setAttribute('aria-label', `피해 ${Math.round(attack.damage)}, ${attack.attackType === 'projectile' ? `${shots}발, ` : ''}${formatSeconds(attack.interval)}초, 거리 ${attack.range}m${attack.groundOnly ? ', 지면 공격' : ''}`);
    row.tradeoff.textContent = [definition.targetLabel, definition.tradeoff].filter(Boolean).join('\n');
    row.tradeoff.hidden = !row.tradeoff.textContent;
    const equipped = selected === definition.id;
    row.card.classList.toggle('selected', equipped); row.button.setAttribute('aria-pressed', String(equipped));
    row.button.textContent = equipped ? '선택 중' : '선택';
    row.button.disabled = !state.inCamp || equipped;
    row.button.setAttribute('aria-label', `${definition.name} ${equipped ? '선택 중' : state.inCamp ? '무료 선택' : '거점에서 선택'}`);
  }
}
function updateNavigation() {
  const isGrowth = state.phase === 'paused' && pauseKind === 'growth';
  const enabled = ready && (state.phase === 'playing' || isGrowth) && $('help-menu').hidden;
  for (const button of growthButtons) {
    const category = button.dataset.growth;
    button.disabled = !enabled; button.setAttribute('aria-pressed', String(isGrowth && growthCategory === category));
    button.classList.toggle('current-form', category === 'forms' && state.player.form !== 'druid');
  }
}
function openGrowth(category = 'stats') {
  if (!['stats', 'druid', 'forms', 'weapons'].includes(category) || !ready || !$('help-menu').hidden) return;
  if (state.phase !== 'playing' && !(state.phase === 'paused' && pauseKind === 'growth')) return;
  clearInput(); growthCategory = category; lastGrowth = '';
  if (state.phase === 'playing') pauseGame('growth');
  else updateUI();
}
function buildGrowthRows() {
  const rowKey = `${growthCategory}:${selectedForm}`;
  if (renderedGrowthCategory === rowKey) return;
  $('growth-list').replaceChildren(); growthRows.clear();
  const form = growthCategory === 'forms' ? formPreviews[selectedForm] : null;
  const definitions = growthCategory === 'stats' ? UPGRADES : growthCategory === 'druid' ? SKILLS : form ? [form] : [];
  for (const definition of definitions) {
    const row = document.createElement('div'); row.className = 'upgrade-row';
    const copy = document.createElement('div'); copy.className = 'upgrade-copy';
    const title = document.createElement('strong'), detail = document.createElement('span'), condition = document.createElement('span');
    copy.append(title, detail, condition); row.append(copy);
    const buy = document.createElement('button'); buy.className = 'upgrade-buy'; buy.type = 'button'; row.append(buy);
    buy.dataset.category = growthCategory; buy.dataset.id = definition.id;
    if (form) {
      row.classList.add('form-growth-row'); copy.classList.add('form-growth-copy');
      condition.className = 'form-growth-condition';
      const emblem = $(`form-${form.id}-tab`).querySelector('svg').cloneNode(true); emblem.classList.add('form-emblem'); copy.prepend(emblem);
    }
    $('growth-list').append(row); growthRows.set(definition.id, { row, title, detail, condition, buy, definition });
  }
  renderedGrowthCategory = rowKey;
}
function renderGrowth() {
  if (state.phase !== 'paused' || pauseKind !== 'growth') return;
  const signature = [growthCategory, selectedForm, state.revision, state.player.level, state.progress.gold, state.inCamp].join(':');
  if (signature === lastGrowth) return;
  buildGrowthRows();
  const form = growthCategory === 'forms' ? formPreviews[selectedForm] : null;
  const weaponsPage = growthCategory === 'weapons';
  $('form-tabs').hidden = growthCategory !== 'forms';
  $('weapon-panel').hidden = !weaponsPage; $('growth-list').hidden = weaponsPage;
  $('growth-resources').hidden = weaponsPage;
  for (const tab of formTabs) {
    const definition = formPreviews[tab.dataset.form], unlocked = state.player.level >= definition.firstLevel;
    tab.setAttribute('aria-pressed', String(tab.dataset.form === selectedForm));
    tab.setAttribute('aria-label', `${definition.name} 성장 보기${unlocked ? '' : `, 레벨 ${definition.firstLevel} 자동 해금`}`);
    if (unlocked) tab.removeAttribute('data-unlock-level'); else tab.setAttribute('data-unlock-level', String(definition.firstLevel));
  }
  $('growth-title').textContent = { stats: '능력', druid: '기술', forms: '변신', weapons: '무기' }[growthCategory];
  showAmount('growth-bank-value', state.progress.gold, '보관 골드'); $('growth-level-value').textContent = `Lv.${state.player.level}`;
  $('growth-summary').textContent = weaponsPage ? '거점에서 무료로 선택해요.' : form
    ? `${form.description}\n${state.player.level >= form.firstLevel ? '상황에 맞춰 자동으로 변신해요.' : `Lv.${form.firstLevel}에 무료로 자동 해금돼요.`}`
    : `${growthCategory === 'druid' ? '기술은 자동 사용' : state.inCamp ? '골드로 영구 성장' : '거점에서 영구 성장'}\n성장 한도 100단계`;
  if (weaponsPage) { renderWeapons(); lastGrowth = signature; return; }
  for (const row of growthRows.values()) {
    if (form) {
      const offer = getFormOffer(state, form.id);
      row.title.textContent = `${form.name} · ${offer.unlocked ? `${offer.rank}/${form.maxLevel}` : `0/${form.maxLevel} · 미해금`}`;
      row.detail.className = 'form-combat-values';
      const damage = offer.unlocked ? offer.currentDamage : offer.nextDamage;
      const interval = offer.unlocked ? offer.currentInterval : offer.nextInterval;
      const range = offer.unlocked ? offer.currentRange : offer.nextRange;
      row.detail.textContent = `피해 ${formatAmount(Math.round(damage))}${offer.unlocked && offer.nextDamage !== null ? ` → ${formatAmount(offer.nextDamage)}` : ''}\n${form.id === 'bear' ? '광역 반경' : '공격 거리'} ${range}m · ${formatSeconds(interval)}초`;
      row.detail.setAttribute('aria-label', `피해 ${Math.round(damage)}${offer.unlocked && offer.nextDamage !== null ? `, 다음 ${offer.nextDamage}` : ''}, 거리 ${range}m, ${formatSeconds(interval)}초`);
      row.condition.textContent = !offer.unlocked ? `Lv.${form.firstLevel} 무료 해금` : offer.maxed ? '최대 100단계 · 영구 유지' : `다음 ${offer.rank + 1}/${form.maxLevel} · ${formatAmount(offer.cost)} 골드${state.inCamp ? '' : '\n거점에서 성장'}`;
      row.buy.textContent = !offer.unlocked ? `Lv.${form.firstLevel} 자동 해금` : offer.maxed ? '최대 단계' : `성장 ${formatAmount(offer.cost)} G`;
      row.buy.disabled = !offer.canBuy;
      row.buy.setAttribute('aria-label', !offer.unlocked ? `${form.name}, 레벨 ${form.firstLevel} 자동 해금` : `${form.name} 성장, ${offer.maxed ? '최대 100단계' : `다음 ${offer.rank + 1}단계, ${offer.cost} 골드`}`);
      row.row.classList.toggle('locked', !offer.unlocked);
      continue;
    }
    const offer = growthCategory === 'stats' ? getUpgradeOffer(state, row.definition.id) : getSkillOffer(state, row.definition.id);
    row.title.textContent = `${offer.name} · ${offer.level}/${row.definition.maxLevel}`;
    if (growthCategory === 'stats') {
      row.detail.className = 'stat-value';
      row.detail.textContent = `${formatAmount(offer.currentValue)}${offer.nextValue === null ? '' : ` → ${formatAmount(offer.nextValue)}`}`;
      row.detail.setAttribute('aria-label', `${offer.unit} ${offer.currentValue}${offer.nextValue === null ? '' : `, 다음 ${offer.nextValue}`}`);
    }
    else if (offer.id === 'owl') {
      row.detail.textContent = offer.level === 0
        ? `1마리 동행 · ${formatSeconds(offer.nextInterval)}초마다 유도탄`
        : `1마리 동행 · 유도탄 ${formatSeconds(offer.currentInterval)}${offer.nextInterval === null ? '' : ` → ${formatSeconds(offer.nextInterval)}`}초`;
      const damage = offer.level === 0 ? offer.nextDamage : offer.currentDamage;
      if (Number.isFinite(damage)) row.detail.textContent += ` · 피해 ${formatAmount(damage)}`;
      row.detail.setAttribute('aria-label', `부엉이 1마리 동행, 피해 ${damage}, ${formatSeconds(offer.currentInterval ?? offer.nextInterval)}초${offer.level && offer.nextInterval !== null ? `, 다음 ${formatSeconds(offer.nextInterval)}초` : ''}`);
    }
    else {
      row.detail.textContent = offer.level === 0
        ? `습득 후 ${formatSeconds(offer.nextInterval)}초마다 자동 덩굴 공격`
        : `${formatSeconds(offer.currentInterval)}초마다 자동 덩굴 공격${offer.nextInterval === null ? '' : ` · 다음 ${formatSeconds(offer.nextInterval)}초`}`;
      row.detail.setAttribute('aria-label', `${formatSeconds(offer.currentInterval ?? offer.nextInterval)}초마다 자동 덩굴 공격${offer.level && offer.nextInterval !== null ? `, 다음 ${formatSeconds(offer.nextInterval)}초` : ''}`);
    }
    row.condition.textContent = offer.maxed ? '최대 100단계 · 영구 유지' : `${formatAmount(offer.cost)} 골드${state.inCamp ? '' : ' · 거점에서 성장'}`;
    row.condition.setAttribute('aria-label', offer.maxed ? '최대 100단계 · 영구 유지' : `${offer.cost} 골드${state.inCamp ? '' : ', 거점에서 성장'}`);
    row.buy.textContent = offer.maxed ? '최대' : growthCategory === 'druid' && offer.level === 0 ? '습득' : '강화';
    row.buy.disabled = !state.inCamp || offer.locked || offer.maxed || state.progress.gold < offer.cost;
    row.buy.setAttribute('aria-label', `${offer.name}, ${offer.maxed ? '최대 100단계' : `${offer.cost} 골드`}`);
    row.row.classList.toggle('locked', offer.locked);
  }
  lastGrowth = signature;
}
for (const button of formTabs) listen(button, 'click', () => {
  if (state.phase !== 'paused' || pauseKind !== 'growth' || growthCategory !== 'forms') return;
  selectedForm = button.dataset.form; lastGrowth = ''; renderGrowth(); button.focus({ preventScroll: true });
});
listen($('weapon-list'), 'click', e => {
  const button = e.target instanceof Element ? e.target.closest('button[data-weapon]') : null;
  if (!button || button.disabled || !$('weapon-list').contains(button) || state.phase !== 'paused' || pauseKind !== 'growth' || growthCategory !== 'weapons') return;
  if (!selectWeapon(state, button.dataset.weapon)) return;
  wakeAudio(); presentQueuedUIEvent(); saveProgress(true); lastHud = ''; lastGrowth = ''; updateUI();
});
listen($('growth-list'), 'click', e => {
  const buy = e.target instanceof Element ? e.target.closest('button[data-category][data-id]') : null;
  if (!buy || buy.disabled || !$('growth-list').contains(buy) || state.phase !== 'paused' || pauseKind !== 'growth') return;
  const category = buy.dataset.category;
  const definitions = category === 'stats' ? UPGRADES : category === 'druid' ? SKILLS : FORMS;
  const definition = definitions.find(item => item.id === buy.dataset.id);
  if (!definition || category !== growthCategory) return;
  const purchased = category === 'stats' ? buyUpgrade(state, definition.id) : category === 'druid' ? learnSkill(state, definition.id) : buyFormUpgrade(state, definition.id);
  if (!purchased) return;
  wakeAudio(); presentQueuedUIEvent(); saveProgress(true); lastHud = ''; lastGrowth = ''; updateUI();
});
for (const button of growthButtons) listen(button, 'click', () => openGrowth(button.dataset.growth));
listen($('growth-close-btn'), 'click', resumeGame);
listen($('quest-btn'), 'click', openQuest);
listen($('quest-close-btn'), 'click', resumeGame);
listen($('start-btn'), 'click', startGame);
listen($('pause-btn'), 'click', () => pauseGame()); listen($('resume-btn'), 'click', resumeGame);
listen($('claim-btn'), 'click', () => {
  if (state.phase !== 'paused' || pauseKind !== 'quest') return;
  if (claimQuest(state)) {
    presentQueuedUIEvent(); saveProgress(true); lastHud = ''; updateUI();
    $('quest-close-btn').focus({ preventScroll: true });
  }
});
listen($('recover-btn'), 'click', () => {
  if (!respawnAtCamp(state)) return;
  clearInput(); wakeAudio(); saveProgress(true); lastPhase = ''; lastTime = performance.now(); accumulator = 0; updateUI(); focusGame();
});
listen($('sound-btn'), 'click', () => {
  settings.sound = !settings.sound; audio.setEnabled(settings.sound);
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
  knob.style.transform = `translate(${Math.round(stick.x * 12) * 2}px,${Math.round(stick.z * 12) * 2}px)`; refreshInput();
}
listen(shell, 'pointerdown', e => {
  if (!ready || state.phase !== 'playing' || joystickPointer !== null || e.isPrimary === false || (e.pointerType === 'mouse' && e.button !== 0)) return;
  if (e.target instanceof Element && e.target.closest('button,a,input,select,textarea,.overlay,.growth-nav,[role="button"]')) return;
  e.preventDefault(); joystickPointer = e.pointerId; stickOrigin = { x: e.clientX, y: e.clientY };
  const rect = shell.getBoundingClientRect(); joystick.style.left = `${Math.round((e.clientX - rect.left) / 2) * 2}px`; joystick.style.top = `${Math.round((e.clientY - rect.top) / 2) * 2}px`;
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
function questGuide(quest) {
  if (quest.done) return '';
  if (quest.complete) return '보상을 받으면 다음 의뢰가 열려요.';
  if (quest.id === 'attack' && state.inCamp) return '능력에서 공격을 강화하세요.';
  let target, label;
  if (quest.id === 'bank' && state.cargo === 0) { target = HUNT_ZONES.find(zone => zone.id === 'meadow-mushrooms'); label = target.name; }
  else if (quest.id === 'bank' || quest.id === 'attack') { target = getCamp(state); label = '거점'; }
  else {
    const zone = HUNT_ZONES.find(item => item.id === quest.zoneId);
    if (!zone) return '';
    if (!isStageUnlocked(state.progress, zone.stageId)) {
      const stage = STAGES.find(item => item.id === zone.stageId);
      return state.player.level < stage.firstLevel ? `Lv.${stage.firstLevel}에 ${stage.name} 개방` : '수문장 의뢰 보상으로 개방';
    }
    target = zone; label = zone.name;
  }
  const direction = directionTo(target);
  return `${direction.arrow} ${label} ${direction.distance}m`;
}
function updateUI() {
  const player = state.player, progress = state.progress, quest = getQuest(state), zone = HUNT_ZONES.find(item => item.id === state.huntZoneId);
  const stage = getStage(state), camp = getCamp(state), lowHealth = !state.inCamp && player.hp < player.maxHp * .28;
  shell.classList.toggle('game-paused', state.phase !== 'playing');
  const campDirection = directionTo(camp), compass = $('camp-direction');
  compass.hidden = !ready || state.inCamp || state.phase !== 'playing';
  if (compass.textContent !== campDirection.arrow) compass.textContent = campDirection.arrow;
  const campLabel = `${campDirection.arrow} 거점 ${campDirection.distance}m`;
  if (compass.getAttribute('aria-label') !== campLabel) compass.setAttribute('aria-label', campLabel);
  compass.classList.toggle('urgent', lowHealth || state.cargo >= player.capacity);
  const boss = !state.inCamp && state.enemies.find(enemy => enemy.type === 'boss' && enemy.hp > 0 && enemy.stageId === stage.id && Math.hypot(enemy.x - player.x, enemy.z - player.z) < 9);
  const bossPercent = boss ? Math.ceil(boss.hp / boss.maxHp * 100) : 0;
  const snapshot = [ready, state.phase, pauseKind, growthCategory, Math.ceil(player.hp), player.maxHp, player.level, player.xp, player.xpToNext, progress.gold, progress.questIndex, quest.current, state.cargo, player.capacity, state.inCamp, stage.id, state.huntZoneId, player.form, bossPercent, settings.sound, state.revision].join(':');
  if (snapshot !== lastHud) {
    showAmount('hp-value', Math.ceil(player.hp), '생명'); $('hp-fill').style.width = `${player.hp / player.maxHp * 100}%`;
    $('hp-fill').parentElement.classList.toggle('danger', lowHealth);
    $('level-value').textContent = `Lv.${player.level}`; showAmount('gold-value', progress.gold, '보관 골드');
    $('xp-value').textContent = `${Math.floor(player.xp)} / ${player.xpToNext}`;
    const xpPercent = Math.min(100, player.xp / player.xpToNext * 100);
    $('xp-fill').style.width = `${xpPercent}%`;
    $('xp-fill').parentElement.setAttribute('aria-valuenow', String(Math.floor(xpPercent)));
    $('xp-fill').parentElement.setAttribute('aria-valuetext', `경험치 ${Math.floor(player.xp)}, 다음 레벨 ${player.xpToNext}`);
    $('zone-value').textContent = state.inCamp ? `${stage.name} 거점` : zone ? `${zone.name} Lv.${zone.level}` : stage.name;
    const collectable = quest.complete && !quest.done;
    $('quest-btn').disabled = !ready || state.phase !== 'playing';
    $('quest-btn').classList.toggle('quest-ready', collectable);
    $('quest-btn').setAttribute('aria-label', collectable ? '의뢰 보상 받기' : '의뢰 보기');
    $('quest-badge').hidden = !collectable; $('quest-badge').textContent = collectable ? '!' : '';
    $('quest-title').textContent = quest.title;
    $('quest-count').textContent = quest.done ? '완료' : `${quest.current} / ${quest.target}`;
    const guide = questGuide(quest); $('quest-guide').textContent = guide; $('quest-guide').hidden = !guide;
    $('quest-reward').textContent = quest.done ? '' : `${formatAmount(quest.rewardGold)} 골드`;
    $('quest-reward').hidden = quest.done;
    $('claim-btn').hidden = !collectable;
    $('claim-btn').disabled = state.phase !== 'paused' || pauseKind !== 'quest' || !collectable;
    $('boss-track').hidden = !boss; $('boss-fill').style.width = `${bossPercent}%`; $('boss-track').setAttribute('aria-valuenow', String(bossPercent));
    $('cargo-value').textContent = `${formatAmount(state.cargo)} / ${formatAmount(player.capacity)}`;
    $('cargo-value').setAttribute('aria-label', `가방 ${state.cargo}, 한도 ${player.capacity}`);
    $('cargo-fill').style.width = `${state.cargo / player.capacity * 100}%`;
    $('cargo-value').parentElement.parentElement.classList.toggle('full', state.cargo >= player.capacity);
    $('pause-btn').disabled = state.phase !== 'playing';
    $('sound-btn').textContent = settings.sound ? '소리 켜짐' : '소리 꺼짐'; $('sound-btn').setAttribute('aria-pressed', String(settings.sound));
    updateNavigation(); lastHud = snapshot;
  }
  const phaseKey = `${state.phase}:${state.phase === 'paused' ? pauseKind : ''}`;
  if (phaseKey !== lastPhase) {
    for (const id of ['menu', 'pause-menu', 'growth-menu', 'quest-menu', 'down-menu']) $(id).hidden = true;
    if (state.phase === 'ready') $('menu').hidden = false;
    if (state.phase === 'paused') {
      const panel = pauseKind === 'growth' ? 'growth-menu' : pauseKind === 'quest' ? 'quest-menu' : 'pause-menu';
      const focus = pauseKind === 'growth' ? 'growth-close-btn' : pauseKind === 'quest' ? 'quest-close-btn' : 'resume-btn';
      $(panel).hidden = false; $(focus).focus({ preventScroll: true });
    }
    if (state.phase === 'down') {
      clearInput(); saveProgress(true); $('down-menu').hidden = false;
      $('down-stats').textContent = `레벨 ${player.level} · 보관 골드 ${formatAmount(progress.gold)}\n가방 ${formatAmount(state.cargo)}도 그대로 가져가요.`;
      $('down-stats').setAttribute('aria-label', `레벨 ${player.level}, 보관 골드 ${progress.gold}, 가방 ${state.cargo} 유지`); $('recover-btn').focus({ preventScroll: true });
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
  state.events = events;
  for (const event of events) {
    if (!acknowledgedUIEvents.has(event)) presentEvent(event);
  }
  updateUI(); saveProgress(); view?.draw(state, delta); state.events = [];
  frameId = requestAnimationFrame(animate);
}
listen(window, 'pagehide', e => {
  clearInput(); saveProgress(true); pauseGame(); cancelAnimationFrame(frameId); audio.suspend();
  if (!e.persisted) { stopped = true; lifetime.abort(); view?.dispose(); audio.dispose(); }
});
listen(window, 'pageshow', e => { if (e.persisted && !stopped) { cancelAnimationFrame(frameId); lastTime = performance.now(); frameId = requestAnimationFrame(animate); } });

$('start-btn').disabled = true; updateSaveWarning();
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
} catch (error) { console.error('숲을 준비하지 못했습니다.', error); $('load-status').textContent = '전투 화면을 열지 못했어요. 브라우저에서 다시 열어주세요.'; }
