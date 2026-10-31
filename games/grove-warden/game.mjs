import { createGame, stepGame, setPaused, WORLD, UPGRADES, SKILLS, HUNT_ZONES, STAGES, FORMS, getStage, getCamp, isStageUnlocked, getFormOffer, buyFormUpgrade, normalizeProgress, exportProgress, getQuest, claimQuest, getUpgradeOffer, buyUpgrade, getSkillOffer, learnSkill, respawnAtCamp, equipmentAction } from './rules.mjs';
import { createRenderer } from './renderer.mjs';
import { createGameAudio } from './audio.mjs';
import { EQUIPMENT, TIERS, EQUIPMENT_MAX_LEVEL, EQUIPMENT_MAX_TIER, getEquipmentOffer, getStaffAttack } from './equipment.mjs';

const $ = id => document.getElementById(id);
const lifetime = new AbortController();
const listen = (element, type, handler, options = {}) => element.addEventListener(type, handler, { ...options, signal: lifetime.signal });
const SAVE_KEY = 'grove-warden:v8';
let settings = { sound: true }, savedProgress = normalizeProgress(), storageFailed = false;
try {
  let saved;
  for (const key of [SAVE_KEY, 'grove-warden:v7', 'grove-warden:v6', 'grove-warden:v5', 'grove-warden:v4', 'grove-warden:v3', 'grove-warden:v2']) {
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
let savedRevision = state.revision, lastSaveAt = 0, helpOrigin = 'menu', growthCategory = 'stats', renderedGrowthCategory = '', lastGrowth = '', statsPage = 'stats';
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
  sound(event.type === 'shoot' && ['burst', 'spread', 'explosive'].includes(event.weaponStyle) ? `staff-${event.weaponStyle}` : event.type);
  if (event.type === 'player-hit') pulse('hp-value', 'hurt-pop');
  if (event.type === 'pickup') pulse('cargo-value');
  if (event.type === 'deposit') { pulse('gold-value'); pulse('cargo-value'); }
  if (event.type === 'level-up') {
    pulse('level-value'); pulse('hp-value'); pulse('xp-fill');
    const unlocked = FORMS.find(form => form.firstLevel === event.level);
    if (unlocked) pulse(`growth-${unlocked.id}-btn`);
  }
  if (event.type === 'kill' && event.bossId) pulse('quest-btn');
  if (event.type === 'gear-pickup') { sound('pickup'); pulse('growth-stats-btn'); }
  if (event.type === 'field-discovery') sound('quest');
  if (event.type === 'field-chest') { sound('quest'); pulse('growth-stats-btn'); }
  if (event.type === 'field-boon') { sound('upgrade'); pulse('hp-value'); }
  if (event.type === 'field-hazard' || event.type === 'staff-explosion') sound('burst');
  if (event.type === 'transform' && event.form !== 'druid') sound('transform');
  if (event.type === 'form-attack') sound(event.form === 'wolf' ? 'wolf-swipe' : event.form === 'bear' ? 'bear-slam' : 'dragon-fire');
  if (event.type === 'quest') { pulse('gold-value'); pulse('quest-btn'); }
  if (event.type === 'upgrade') { pulse('growth-bank-value'); pulse('gold-value'); }
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
const equipmentRows = new Map();
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
function renderEquipment() {
  showAmount('equipment-scrolls', state.progress.gear.scrolls, '강화 두루마리');
  for (const definition of EQUIPMENT) {
    let row = equipmentRows.get(definition.id);
    if (!row) {
      const card = document.createElement('article'); card.className = 'equipment-card';
      const heading = document.createElement('div'); heading.className = 'equipment-heading';
      const icon = document.createElement('span'); icon.className = 'equipment-icon';
      icon.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path d="M7 1h6v2h2v5h-2v2h-3v5H6v-4H4V9h3V7H5V3h2Z" fill="#292537"/><path d="M8 2h4v2h2v3h-2v2H8V7H6V4h2Z" fill="currentColor"/><path d="M8 10h2v4H8Z" fill="#b58b56"/><path d="M8 3h3v1H8ZM7 4h1v2H7Z" fill="#f2e7c5"/></svg>';
      icon.style.color = `#${definition.color.toString(16).padStart(6, '0')}`;
      const name = document.createElement('strong'), details = document.createElement('span');
      const title = document.createElement('div'); title.append(name, details); heading.append(icon, title);
      const effect = document.createElement('p'); effect.className = 'equipment-effect';
      const next = document.createElement('p'); next.className = 'equipment-next';
      const actions = document.createElement('div'); actions.className = 'equipment-actions';
      const buttons = {};
      for (const action of ['equip', 'enhance', 'promote']) {
        const button = document.createElement('button'); button.type = 'button';
        button.dataset.equipmentId = definition.id; button.dataset.equipmentAction = action;
        const label = document.createElement('span'), cost = document.createElement('small');
        button.append(label, cost); actions.append(button); buttons[action] = { button, label, cost };
      }
      const condition = document.createElement('p'); condition.className = 'equipment-condition';
      card.append(heading, effect, next, actions, condition); $('equipment-list').append(card);
      row = { card, name, details, effect, next, condition, buttons }; equipmentRows.set(definition.id, row);
    }
    const offer = getEquipmentOffer(state.progress, definition.id);
    row.card.classList.toggle('equipped', offer.equipped); row.card.classList.toggle('undiscovered', !offer.owned);
    row.name.textContent = offer.name;
    row.details.textContent = offer.owned ? `${offer.attackLabel} · ${TIERS[Math.min(3, offer.tier)]}\n강화 ${offer.level}/${EQUIPMENT_MAX_LEVEL}\n승급 ${offer.tier}/${EQUIPMENT_MAX_TIER}\n보유 ${offer.copies}개` : `${offer.attackLabel} · 기본형 무료`;
    const attack = getStaffAttack(definition.id, { attackDamage: state.player.attackDamage - state.player.gearDamage + offer.damage, damageMult: state.player.damageMult });
    const shots = attack.burstCount * attack.spreadAngles.length;
    const damageLabel = attack.volleyHitLimit ? `${formatAmount(Math.round(attack.damage))} · ${shots}방향${attack.pierce ? ' 관통' : ''}` : `${formatAmount(Math.round(attack.damage))}${shots > 1 ? `×${shots}` : ''}`;
    row.effect.textContent = `피해 ${damageLabel} · ${attack.interval}초 · ${attack.blastRadius ? `폭발 ${attack.blastRadius}m` : `${attack.range}m`}`;
    row.effect.setAttribute('aria-label', `피해 ${Math.round(attack.damage)}, ${shots}발, ${attack.interval}초, 거리 ${attack.range}m`);
    row.next.textContent = `${definition.targetLabel} · ${definition.tradeoff}\n${offer.maxed ? `최대 · 피해 +${offer.damage} · 생명 +${offer.health}` : `보너스 피해 +${offer.damage}→+${offer.nextDamage}\n생명 +${offer.health}→+${offer.nextHealth}`}`;
    const { equip, enhance, promote } = row.buttons;
    equip.label.textContent = !offer.owned ? '무료 받기' : offer.equipped ? '장착 중' : '장착'; equip.cost.textContent = '';
    equip.button.dataset.equipmentAction = offer.owned ? 'equip' : 'unlock';
    enhance.label.textContent = offer.maxed ? '최대' : '강화';
    enhance.cost.textContent = offer.maxed ? '' : `${formatAmount(offer.enhanceCost)}G\n두루마리 ${offer.scrollCost}장`;
    promote.label.textContent = offer.promotionMaxed ? '최대' : '승급';
    promote.cost.textContent = offer.promotionMaxed ? '' : `${formatAmount(offer.promoteCost)}G\n두루마리 ${offer.promoteScrollCost}장\n장비 ${offer.promoteCopies}개`;
    equip.button.disabled = !state.inCamp || offer.equipped;
    enhance.button.disabled = !state.inCamp || !offer.canEnhance;
    promote.button.disabled = !state.inCamp || !offer.canPromote;
    equip.button.setAttribute('aria-label', `${offer.name} ${!offer.owned ? '기본형 무료 받기와 장착' : offer.equipped ? '장착 중' : '장착'}`);
    enhance.button.setAttribute('aria-label', offer.maxed ? `${offer.name} 최대 강화` : `${offer.name} 강화, ${offer.enhanceCost} 골드와 두루마리 ${offer.scrollCost}장`);
    promote.button.setAttribute('aria-label', offer.promotionMaxed ? `${offer.name} 최고 등급` : `${offer.name} 승급, ${offer.promoteCost} 골드와 두루마리 ${offer.promoteScrollCost}장, 같은 장비 2개`);
    const condition = !offer.owned ? definition.description
      : `${offer.maxed ? '최대 강화' : `강화 ${offer.level}/${EQUIPMENT_MAX_LEVEL}`} · ${offer.promotionMaxed ? '최고 등급' : `승급 ${offer.tier}/${EQUIPMENT_MAX_TIER}`}\n${offer.promotionMaxed ? '' : offer.copies >= 3 ? '장비 수량 충족' : `같은 장비 ${3 - offer.copies}개 더 필요`}`;
    row.condition.textContent = state.inCamp ? condition : `거점에서 선택·성장\n${condition}`;
  }
}
function updateNavigation() {
  const isGrowth = state.phase === 'paused' && pauseKind === 'growth';
  const enabled = ready && (state.phase === 'playing' || isGrowth) && $('help-menu').hidden;
  for (const button of growthButtons) {
    const category = button.dataset.growth, form = formPreviews[category];
    button.disabled = !enabled; button.setAttribute('aria-pressed', String(isGrowth && growthCategory === category));
    button.classList.toggle('current-form', category === state.player.form && state.player.form !== 'druid');
    if (form && state.player.level < form.firstLevel) {
      button.dataset.unlockLevel = String(form.firstLevel);
      button.setAttribute('aria-label', `${form.name} 성장, 레벨 ${form.firstLevel} 자동 해금`);
    } else if (form) {
      button.removeAttribute('data-unlock-level'); button.setAttribute('aria-label', `${form.name} 성장, 자동 변신 해금`);
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
  const form = formPreviews[growthCategory];
  const definitions = growthCategory === 'stats' ? UPGRADES : growthCategory === 'druid' ? SKILLS : [form];
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
      const emblem = $(`growth-${form.id}-btn`).querySelector('svg').cloneNode(true); emblem.classList.add('form-emblem'); copy.prepend(emblem);
    }
    $('growth-list').append(row); growthRows.set(definition.id, { row, title, detail, condition, buy, definition });
  }
  renderedGrowthCategory = growthCategory;
}
function renderGrowth() {
  if (state.phase !== 'paused' || pauseKind !== 'growth') return;
  const signature = [growthCategory, statsPage, state.revision, state.player.level, state.progress.gold, state.inCamp].join(':');
  if (signature === lastGrowth) return;
  buildGrowthRows();
  const form = formPreviews[growthCategory];
  const equipmentPage = growthCategory === 'stats' && statsPage === 'equipment';
  $('stats-pages').hidden = growthCategory !== 'stats';
  $('equipment-panel').hidden = !equipmentPage; $('growth-list').hidden = equipmentPage;
  $('growth-summary').hidden = equipmentPage;
  for (const button of $('stats-pages').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.statsPage === statsPage));
  $('growth-title').textContent = growthCategory === 'stats' ? '능력치' : growthCategory === 'druid' ? '드루이드' : `${form.name} 성장`;
  showAmount('growth-bank-value', state.progress.gold, '보관 골드'); $('growth-level-value').textContent = `Lv.${state.player.level}`;
  $('growth-summary').textContent = form
    ? `${form.description}\n${state.player.level >= form.firstLevel ? form.id === 'wolf' ? '초원의 질주 초원에서 바로 써보세요.' : '상황에 맞춰 자동으로 변신해요.' : `Lv.${form.firstLevel}에 무료로 자동 해금돼요.`}`
    : `${growthCategory === 'druid' ? '기술은 자동 사용' : state.inCamp ? '골드로 영구 성장' : '거점에서 영구 성장'}\n성장 한도 100단계`;
  if (equipmentPage) {
    $('growth-title').textContent = '장비';
    $('growth-summary').textContent = state.inCamp ? '하나를 장착해 피해와 생명을 높이세요.' : '장착과 성장은 거점에서 할 수 있어요.';
    renderEquipment(); lastGrowth = signature; return;
  }
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
listen($('stats-pages'), 'click', e => {
  const button = e.target instanceof Element ? e.target.closest('button[data-stats-page]') : null;
  if (!button || state.phase !== 'paused' || pauseKind !== 'growth' || growthCategory !== 'stats') return;
  statsPage = button.dataset.statsPage; lastGrowth = ''; renderGrowth();
});
listen($('equipment-list'), 'click', e => {
  const button = e.target instanceof Element ? e.target.closest('button[data-equipment-action]') : null;
  if (!button || button.disabled || state.phase !== 'paused' || pauseKind !== 'growth') return;
  if (!equipmentAction(state, button.dataset.equipmentId, button.dataset.equipmentAction)) return;
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
  if (quest.id === 'attack' && state.inCamp) return '능력치에서 지팡이를 강화하세요.';
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
