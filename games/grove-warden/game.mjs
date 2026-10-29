import { createGame, stepGame, setPaused, WORLD, UPGRADES, SKILLS, HUNT_ZONES, STAGES, FORMS, getStage, getCamp, isStageUnlocked, getFormOffer, buyFormUpgrade, normalizeProgress, exportProgress, getQuest, claimQuest, getUpgradeOffer, buyUpgrade, getSkillOffer, learnSkill, respawnAtCamp, equipmentAction } from './rules.mjs';
import { createRenderer } from './renderer.mjs';
import { createGameAudio } from './audio.mjs';
import { EQUIPMENT, getEquipmentOffer } from './equipment.mjs';

const $ = id => document.getElementById(id);
const lifetime = new AbortController();
const listen = (element, type, handler, options = {}) => element.addEventListener(type, handler, { ...options, signal: lifetime.signal });
const SAVE_KEY = 'grove-warden:v6';
let settings = { sound: true }, savedProgress = normalizeProgress(), storageFailed = false;
try {
  let saved;
  for (const key of [SAVE_KEY, 'grove-warden:v5', 'grove-warden:v4', 'grove-warden:v3', 'grove-warden:v2']) {
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
let savedRevision = state.revision, lastSaveAt = 0, helpOrigin = 'menu', growthCategory = 'stats', renderedGrowthCategory = '', lastGrowth = '', statsPage = 'stats';
function saveProgress(force = false) {
  if (!force && (state.revision === savedRevision || performance.now() - lastSaveAt < (storageFailed ? 2000 : 400))) return;
  lastSaveAt = performance.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ progress: exportProgress(state), sound: settings.sound }));
    savedRevision = state.revision; storageFailed = false;
  } catch { storageFailed = true; }
  $('save-warning').hidden = !storageFailed;
}

const audio = createGameAudio({ enabled: settings.sound });
const wakeAudio = () => audio.wake();
const sound = type => audio.play(type);

const shell = $('game-shell'), joystick = $('joystick'), knob = $('stick-knob');
const acknowledgedUIEvents = new WeakSet(), skillHudCache = new Map();
let rewardUntil = 0, rewardPriority = 0;
function pulse(id, kind = 'reward-pop') { $(id).classList.add(kind); }
for (const name of ['animationend', 'animationcancel']) listen(shell, name, e => {
  if (e.target instanceof Element) e.target.classList.remove('reward-pop', 'hurt-pop');
});
function showReward(title, detail, priority = 1) {
  if (visualTime < rewardUntil && priority < rewardPriority) return;
  const banner = $('reward-banner');
  $('toast').textContent = ''; $('direction-guide').hidden = true;
  banner.hidden = true;
  $('reward-title').textContent = title; $('reward-detail').textContent = detail;
  banner.classList.toggle('major', priority >= 3);
  // Only a reward event restarts this short animation, never the frame loop.
  void banner.offsetWidth;
  banner.hidden = false; rewardPriority = priority; rewardUntil = visualTime + 1.4;
}
function presentEvent(event) {
  sound(event.type);
  if (event.type === 'player-hit') pulse('hp-value', 'hurt-pop');
  if (event.type === 'pickup') pulse('cargo-value');
  if (event.type === 'deposit') {
    pulse('gold-value'); pulse('cargo-value');
    showReward(`보관 +${event.amount}`, '거점에서 강화하세요', 2);
  }
  if (event.type === 'level-up') {
    pulse('level-value'); pulse('hp-value'); pulse('xp-value');
    const unlocked = FORMS.find(form => form.firstLevel === event.level);
    showReward(`레벨 ${event.level}`, unlocked ? `${unlocked.name} 자동 변신 해금!` : '생명과 공격력 상승', 3);
  }
  if (event.type === 'kill' && event.bossId) {
    const quest = getQuest(state), zone = HUNT_ZONES.find(item => item.bossId === event.bossId);
    showReward('수문장 토벌', quest.id === zone?.id && quest.complete ? '의뢰 보상을 받으세요!' : `${zone?.respawnSeconds ?? 30}초 뒤 다시 나타나요`, 4);
  }
  if (event.type === 'gear-pickup') {
    const name = EQUIPMENT.find(item => item.id === event.equipmentId)?.name;
    sound('pickup');
    showReward(name ? `${name} +${event.copies}` : `두루마리 +${event.scrolls}`, '능력치 → 장비에서 성장하세요', 2);
  }
  if (event.type === 'field-discovery') toast(event.kind === 'chest' ? '보물상자 등장 · 직접 다가가세요' : '생명의 축복 등장 · 직접 다가가세요', 2.5);
  if (event.type === 'field-chest') {
    sound('quest'); showReward('보물상자 발견', `지팡이 +${event.copies} · 두루마리 +${event.scrolls}`, 3);
  }
  if (event.type === 'field-boon') { sound('upgrade'); showReward('생명의 축복', '15초간 생명을 회복해요', 2); }
  if (event.type === 'field-hazard') sound('burst');
  if (event.type === 'transform' && event.form !== 'druid') sound('transform');
  if (event.type === 'form-attack') sound(event.form === 'wolf' ? 'wolf-swipe' : event.form === 'bear' ? 'bear-slam' : 'dragon-fire');
  if (event.type === 'quest') {
    pulse('gold-value');
    showReward('의뢰 완료', `보관 골드 +${event.reward}`, 3);
  }
  if (event.type === 'upgrade') {
    const definition = [...UPGRADES, ...SKILLS].find(item => item.id === event.id);
    pulse('growth-bank-value'); pulse('gold-value');
    showReward(event.label ?? definition?.name ?? '성장 완료', '성장이 영구 적용됐어요', 2);
  }
  if (event.type === 'down') { $('reward-banner').hidden = true; rewardUntil = 0; }
}
function presentQueuedUIEvent() {
  const event = state.queuedEvents.at(-1);
  if (!event || !['upgrade', 'quest'].includes(event.type)) return;
  acknowledgedUIEvents.add(event); presentEvent(event);
}
function updateSkillHud() {
  const available = ['owl', 'roots'].some(id => state.progress.skills[id] > 0);
  const transformed = state.player.form !== 'druid';
  $('skill-status').hidden = !ready || !available || transformed || state.phase === 'ready' || state.phase === 'down';
  const form = FORMS.find(item => item.id === state.player.form);
  const formSignature = `${ready}:${state.phase}:${form?.id}:${state.player.formRank}:${state.player.formReason}`;
  if (skillHudCache.get('form') !== formSignature) {
    $('form-status').hidden = !ready || !form || state.phase === 'ready' || state.phase === 'down';
    $('form-name').textContent = form ? `${form.name} ${state.player.formRank}` : '';
    $('form-counter').textContent = form ? form.counterLabel : '';
    $('form-status').dataset.form = form?.id ?? 'druid';
    skillHudCache.set('form', formSignature);
  }
  for (const id of ['owl', 'roots']) {
    const learned = state.progress.skills[id] > 0;
    const cooldown = id === 'owl' ? state.owl.fireCd : state.player.skillCd;
    const duration = id === 'owl' ? state.owl.fireCooldown : state.player.skillCooldown;
    const resting = state.inCamp || state.phase === 'down';
    const casting = !resting && (id === 'roots' ? state.pendingSkills.length > 0 : cooldown > duration - .15);
    const readyToUse = !resting && cooldown <= 0;
    const label = resting ? (id === 'owl' ? '동행' : '대기') : casting ? '발동' : readyToUse ? '준비' : `${Math.ceil(cooldown * 10) / 10}초`;
    const fill = resting ? 100 : Math.round(Math.max(0, Math.min(1, 1 - cooldown / Math.max(.1, duration))) * 20) * 5;
    const signature = `${learned}:${label}:${fill}:${readyToUse}:${casting}`;
    if (skillHudCache.get(id) === signature) continue;
    const chip = $(`${id}-status`); chip.hidden = !learned;
    chip.classList.toggle('ready', readyToUse); chip.classList.toggle('casting', casting);
    $(`${id}-cooldown`).textContent = label; $(`${id}-cooldown-fill`).style.width = `${fill}%`;
    skillHudCache.set(id, signature);
  }
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
    pauseKind = kind; accumulator = 0; saveProgress(true); audio.suspend(); updateUI();
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
const formPreviews = Object.fromEntries(FORMS.map(form => [form.id, form]));
const growthRows = new Map();
const equipmentRows = new Map();
function renderEquipment() {
  $('equipment-scrolls').textContent = state.progress.gear.scrolls;
  for (const definition of EQUIPMENT) {
    let row = equipmentRows.get(definition.id);
    if (!row) {
      const card = document.createElement('article'); card.className = 'equipment-card';
      const heading = document.createElement('div'); heading.className = 'equipment-heading';
      const icon = document.createElement('span'); icon.className = 'equipment-icon';
      icon.innerHTML = '<svg viewBox="0 0 40 48" aria-hidden="true"><path d="m12 44 13-32m-7 17-6-7m11-4 8 1" fill="none" stroke="#d4a15c" stroke-width="5" stroke-linecap="round"/><path d="m24 3 9 8-8 10-8-8Z" fill="currentColor" stroke="#fff2c0" stroke-width="2"/><path d="m24 6 2 5-5 2" fill="none" stroke="#fff" stroke-width="2"/></svg>';
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
    row.details.textContent = offer.owned ? `${offer.tierName} · +${offer.level} · 보유 ${offer.copies}` : '미발견 · 필드와 보스 전리품';
    row.effect.textContent = `피해 +${offer.damage} · 생명 +${offer.health}`;
    row.next.textContent = offer.maxed ? '최대 강화' : `강화 후 피해 +${offer.nextDamage} · 생명 +${offer.nextHealth}`;
    const { equip, enhance, promote } = row.buttons;
    equip.label.textContent = offer.equipped ? '장착 중' : '장착'; equip.cost.textContent = '';
    enhance.label.textContent = offer.maxed ? '최대' : '강화';
    enhance.cost.textContent = offer.maxed ? '' : `${offer.enhanceCost}G · ${offer.scrollCost}장`;
    promote.label.textContent = offer.promotionMaxed ? '최대' : '승급';
    promote.cost.textContent = offer.promotionMaxed ? '' : `${offer.promoteCost}G · ${offer.promoteScrollCost}장`;
    equip.button.disabled = !state.inCamp || !offer.owned || offer.equipped;
    enhance.button.disabled = !state.inCamp || !offer.canEnhance;
    promote.button.disabled = !state.inCamp || !offer.canPromote;
    equip.button.setAttribute('aria-label', `${offer.name} ${offer.equipped ? '장착 중' : '장착'}`);
    enhance.button.setAttribute('aria-label', offer.maxed ? `${offer.name} 최대 강화` : `${offer.name} 강화, ${offer.enhanceCost} 골드와 두루마리 ${offer.scrollCost}장`);
    promote.button.setAttribute('aria-label', offer.promotionMaxed ? `${offer.name} 최고 등급` : `${offer.name} 승급, ${offer.promoteCost} 골드와 두루마리 ${offer.promoteScrollCost}장, 같은 장비 2개`);
    row.condition.textContent = !offer.owned ? definition.description
      : `${offer.maxed ? '최대 강화' : `강화 Lv.${offer.requiredLevel}`} · ${offer.promotionMaxed ? '최고 등급' : `승급 Lv.${offer.promoteRequiredLevel} · ${offer.copies >= 3 ? '장비 수량 충족' : `같은 장비 ${3 - offer.copies}개 더 필요`}`}`;
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
    let ranks;
    if (form) {
      row.classList.add('form-growth-row'); copy.classList.add('form-growth-copy');
      condition.className = 'form-growth-condition';
      const emblem = $(`growth-${form.id}-btn`).querySelector('svg').cloneNode(true); emblem.classList.add('form-emblem'); copy.prepend(emblem);
      ranks = document.createElement('ol'); ranks.className = 'form-ranks';
      for (let rank = 1; rank <= form.maxLevel; rank++) {
        const item = document.createElement('li'); item.append(document.createElement('span'), document.createElement('strong')); ranks.append(item);
      }
      row.append(ranks);
    }
    $('growth-list').append(row); growthRows.set(definition.id, { row, title, detail, condition, buy, definition, ranks });
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
  $('growth-bank-value').textContent = state.progress.gold; $('growth-level-value').textContent = `Lv.${state.player.level}`;
  $('growth-summary').textContent = form
    ? `${form.description}\n${state.player.level >= form.firstLevel ? '상황에 맞춰 자동으로 변신해요.' : `Lv.${form.firstLevel}에 무료로 자동 해금돼요.`}`
    : `${state.inCamp ? '보관 골드로 영구 성장해요.' : '거점에서 성장할 수 있어요.'}${growthCategory === 'druid' ? ' 배운 기술은 전투 중 자동으로 사용해요.' : ' 필요한 레벨과 골드를 확인하세요.'}`;
  if (equipmentPage) {
    $('growth-title').textContent = '장비';
    $('growth-summary').textContent = state.inCamp ? '하나를 장착해 피해와 생명을 높이세요.' : '장착과 성장은 거점에서 할 수 있어요.';
    renderEquipment(); lastGrowth = signature; return;
  }
  for (const row of growthRows.values()) {
    if (form) {
      const offer = getFormOffer(state, form.id);
      row.title.textContent = `${form.name} · ${offer.unlocked ? `${offer.rank}단계` : '미해금'}`;
      row.detail.className = 'form-combat-values';
      const damage = offer.unlocked ? offer.currentDamage : offer.nextDamage;
      const interval = offer.unlocked ? offer.currentInterval : offer.nextInterval;
      const range = offer.unlocked ? offer.currentRange : offer.nextRange;
      row.detail.textContent = `피해 ${Math.round(damage)} · ${interval}초\n${form.id === 'bear' ? '광역 반경' : '공격 거리'} ${range}m`;
      row.condition.textContent = !offer.unlocked ? `Lv.${form.firstLevel} 무료 해금` : offer.maxed ? '최대 단계 · 영구 유지' : `다음 Lv.${offer.requiredLevel} · ${offer.cost} 골드${state.inCamp ? '' : ' · 거점에서 성장'}`;
      row.buy.textContent = !offer.unlocked ? `Lv.${form.firstLevel} 자동 해금` : offer.maxed ? '최대 단계' : `성장 ${offer.cost} G`;
      row.buy.disabled = !offer.canBuy;
      row.buy.setAttribute('aria-label', !offer.unlocked ? `${form.name}, 레벨 ${form.firstLevel} 자동 해금` : `${form.name} 성장, ${offer.maxed ? '최대 단계' : `필요 레벨 ${offer.requiredLevel}, ${offer.cost} 골드`}`);
      row.row.classList.toggle('locked', !offer.unlocked);
      [...row.ranks.children].forEach((item, index) => {
        const rank = index + 1, required = form.firstLevel + index * 3;
        item.children[0].textContent = `${rank}단계 · Lv.${required}`;
        item.children[1].textContent = rank <= offer.rank ? '성장 완료' : rank === 1 ? '무료 해금' : '거점 성장';
        item.classList.toggle('complete', rank <= offer.rank);
      });
      continue;
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
listen($('camp-btn'), 'click', () => openGrowth('stats'));
listen($('start-btn'), 'click', startGame);
listen($('pause-btn'), 'click', () => pauseGame()); listen($('resume-btn'), 'click', resumeGame);
listen($('claim-btn'), 'click', () => {
  const previousStages = STAGES.filter(stage => isStageUnlocked(state.progress, stage.id)).map(stage => stage.id);
  if (claimQuest(state)) {
    presentQueuedUIEvent(); saveProgress(true);
    const opened = STAGES.find(stage => !previousStages.includes(stage.id) && isStageUnlocked(state.progress, stage.id));
    if (opened) toast(`${opened.name}으로 가는 길이 열렸어요!`);
    lastHud = ''; updateUI(); focusGame();
  }
});
listen($('recover-btn'), 'click', () => {
  if (!respawnAtCamp(state)) return;
  clearInput(); wakeAudio(); saveProgress(true); lastPhase = ''; lastTime = performance.now(); accumulator = 0; updateUI(); focusGame(); toast('모닥불에서 회복했어요 · 성장은 그대로');
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
  if (state.phase !== 'playing' || $('toast').textContent || !$('reward-banner').hidden) return '';
  const blocked = STAGES.find(stage => stage.id !== 'meadow' && !isStageUnlocked(state.progress, stage.id) && Math.abs(state.player.z - stage.maxZ) < 4);
  if (blocked) return state.player.level < blocked.firstLevel ? `Lv.${blocked.firstLevel}에 ${blocked.name} 개방` : '수문장 의뢰 보상으로 개방';
  let target, label;
  if (state.player.hp < state.player.maxHp * .28 || state.cargo >= state.player.capacity || (quest.id === 'bank' && state.cargo > 0) || quest.id === 'attack') {
    return '';
  } else {
    if (state.huntZoneId || quest.complete && !quest.done) return '';
    let zone;
    if (quest.zoneId) zone = HUNT_ZONES.find(item => item.id === quest.zoneId);
    else if (quest.id === 'meadow-boss' || quest.id === 'deep-boss') zone = HUNT_ZONES.find(item => item.id === quest.id);
    else if (quest.id === 'deep') zone = HUNT_ZONES.filter(item => item.deep && item.type !== 'boss').sort((a, b) => Math.hypot(a.x - state.player.x, a.z - state.player.z) - Math.hypot(b.x - state.player.x, b.z - state.player.z))[0];
    else if (!quest.done) zone = HUNT_ZONES.find(item => item.id === 'meadow-mushrooms');
    else zone = HUNT_ZONES.filter(item => isStageUnlocked(state.progress, item.stageId) && item.type !== 'boss').sort((a, b) => Math.hypot(a.x - state.player.x, a.z - state.player.z) - Math.hypot(b.x - state.player.x, b.z - state.player.z))[0];
    if (!zone) return '';
    if (!isStageUnlocked(state.progress, zone.stageId)) {
      const stage = STAGES.find(item => item.id === zone.stageId);
      if (stage) return state.player.level < stage.firstLevel ? `Lv.${stage.firstLevel}에 ${stage.name} 개방` : '수문장 의뢰 보상으로 개방';
    }
    target = zone; label = zone.name;
  }
  const direction = directionTo(target);
  return `${direction.arrow} ${label} ${direction.distance}m`;
}
function updateUI() {
  const player = state.player, progress = state.progress, quest = getQuest(state), zone = HUNT_ZONES.find(item => item.id === state.huntZoneId), fighting = state.fightTargetId != null;
  const stage = getStage(state), camp = getCamp(state);
  updateSkillHud(); shell.classList.toggle('game-paused', state.phase !== 'playing');
  const guide = guideText(quest); $('direction-guide').hidden = !guide;
  if ($('direction-guide').textContent !== guide) $('direction-guide').textContent = guide;
  const campDirection = directionTo(camp);
  const campText = state.inCamp ? '안전 거점' : `${campDirection.arrow} 거점 ${campDirection.distance}m`;
  if ($('camp-direction').textContent !== campText) $('camp-direction').textContent = campText;
  const boss = !state.inCamp && state.enemies.find(enemy => enemy.type === 'boss' && enemy.hp > 0 && enemy.stageId === stage.id && Math.hypot(enemy.x - player.x, enemy.z - player.z) < 9), bossPercent = boss ? Math.ceil(boss.hp / boss.maxHp * 100) : 0;
  const zoneBossAlive = zone?.bossId && state.enemies.some(enemy => enemy.zoneId === zone.id && enemy.hp > 0);
  const bossWait = zone?.bossId && !zoneBossAlive ? Math.ceil(state.spawners.find(item => item.zoneId === zone.id)?.remaining ?? 0) : -1;
  const boonSeconds = Math.max(0, Math.ceil(state.fieldEvents?.boon?.remaining ?? 0));
  const fieldWarning = state.fieldEvents?.hazards.some(hazard => hazard.phase === 'warning') ?? false;
  const snapshot = [ready, state.phase, pauseKind, growthCategory, Math.ceil(player.hp), player.maxHp, player.level, player.xp, player.xpToNext, progress.gold, progress.questIndex, quest.current, state.cargo, player.capacity, state.inCamp, stage.id, player.form, state.autoHunt, state.huntZoneId, fighting, input.manual, bossPercent, bossWait, boonSeconds, fieldWarning, settings.sound, state.revision].join(':');
  if (snapshot !== lastHud) {
    $('hp-value').textContent = Math.ceil(player.hp); $('hp-fill').style.width = `${player.hp / player.maxHp * 100}%`;
    $('level-value').textContent = `Lv.${player.level}`; $('gold-value').textContent = progress.gold;
    $('xp-value').textContent = `${Math.floor(player.xp)} / ${player.xpToNext}`; $('xp-fill').style.width = `${Math.min(100, player.xp / player.xpToNext * 100)}%`;
    $('zone-value').textContent = state.inCamp ? `${stage.name} 거점` : zone ? `${zone.name} Lv.${zone.level}` : stage.name;
    $('quest-title').textContent = quest.title; $('quest-count').textContent = quest.done ? '완료' : `${quest.current} / ${quest.target}`;
    $('claim-btn').hidden = !quest.complete || quest.done; $('claim-btn').disabled = state.phase !== 'playing';
    $('boss-track').hidden = !boss; $('boss-fill').style.width = `${bossPercent}%`; $('boss-track').setAttribute('aria-valuenow', String(bossPercent));
    $('cargo-value').textContent = `가방 ${state.cargo} / ${player.capacity}`; $('cargo-fill').style.width = `${state.cargo / player.capacity * 100}%`;
    $('cargo-value').parentElement.parentElement.classList.toggle('full', state.cargo >= player.capacity);
    const species = { mushroom: '버섯', boar: '멧돼지', caster: '석상', boss: '수문장', runner: '고속 몹', swarm: '군체', flyer: '공중 몹' };
    const lowHealth = !state.inCamp && player.hp < player.maxHp * .28;
    let status = '직접 이동';
    if (state.inCamp) status = '거점에서 회복';
    else if (lowHealth) status = '생명 위험';
    else if (bossWait >= 0) status = bossWait > 0 ? `재등장 ${bossWait}초` : '재등장 준비';
    else if (state.cargo >= player.capacity) status = '가방 가득';
    else if (input.manual) status = fighting ? '자동 공격' : '직접 이동';
    else if (state.autoHunt && zone) status = `${species[zone.type]} 추적 사냥`;
    else if (fighting) status = '자동 공격';
    $('hunt-status').textContent = status;
    $('hunt-status').classList.toggle('danger', lowHealth); $('hp-fill').parentElement.classList.toggle('danger', lowHealth);
    $('field-status').hidden = (!fieldWarning && boonSeconds <= 0) || state.phase === 'ready' || state.phase === 'down';
    $('field-status').textContent = fieldWarning ? '바닥 위험 · 이동!' : `생명 재생 ${boonSeconds}초`;
    $('field-status').classList.toggle('warning', fieldWarning);
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
    if (!acknowledgedUIEvents.has(event)) presentEvent(event);
  }
  if (!$('reward-banner').hidden && visualTime >= rewardUntil) $('reward-banner').hidden = true;
  if ($('toast').textContent && now > toastUntil) $('toast').textContent = '';
  updateUI(); saveProgress(); view?.draw(state, delta, visualTime); state.events = [];
  frameId = requestAnimationFrame(animate);
}
listen(window, 'pagehide', e => {
  clearInput(); saveProgress(true); pauseGame(); cancelAnimationFrame(frameId); audio.suspend();
  if (!e.persisted) { stopped = true; lifetime.abort(); view?.dispose(); audio.dispose(); }
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
