import { FORMS, CARDS, ENCOUNTERS, EVENTS, DECK_MIN, DECK_MAX, createRun, activeDeck, enemyDeck, describeCard, editDeck, buyCard, sellCard, upgradeCard, upgradeAll, setSticker, startBattle, stepBattle, chooseDraft, chooseEncounter, chooseReward, serialize, restoreRun } from './rules.mjs';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'wild-oath:v5';
const LEGACY_SAVE_KEY = 'wild-oath:v4';
const PREF_KEY = 'wild-oath:settings:v1';
const typeNames = { attack: '공격', defense: '방어', heal: '회복', energy: '기력', form: '변신' };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lifetime = new AbortController();
let state, hadSave = false, saveAvailable = true, soundEnabled = false, speed = 1;
let activeTab = 'deck', detail = null, lastCards = {player:null,enemy:null}, history = [];
let mainTimer = null, toastTimer = null, audioContext = null, master = null, audioLoading = false;
let audioBuffers = {}, activeSources = new Set();
let lastJourneyChoiceAt = 0;
const effectTimers = new Set();
try {
  state = restoreRun(localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(LEGACY_SAVE_KEY));
  hadSave = Boolean(state);
  try { const prefs = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); soundEnabled = prefs.sound === true; speed = [1,2,4].includes(prefs.speed) ? prefs.speed : 1; } catch {}
} catch { saveAvailable = false; }
state ||= createRun();

function listen(element, type, callback) { element.addEventListener(type, callback, { signal: lifetime.signal }); }
function save() {
  try { localStorage.setItem(SAVE_KEY, serialize(state)); } catch { saveAvailable = false; }
  $('save-warning').hidden = saveAvailable;
}
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify({ sound: soundEnabled, speed })); } catch {} }
function later(callback, delay) { clearTimeout(mainTimer); mainTimer = setTimeout(() => { mainTimer = null; callback(); }, delay); }
function effectLater(callback, delay) { const timer = setTimeout(() => { effectTimers.delete(timer); callback(); }, delay); effectTimers.add(timer); }
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2200); }
function modalOpen() { return Boolean(document.querySelector('dialog[open]')); }
function clearEffects() {
  for (const timer of effectTimers) clearTimeout(timer);
  effectTimers.clear(); $('effects').replaceChildren();
  document.querySelectorAll('.flying-card').forEach(node => node.remove());
  document.querySelectorAll('.side-draw-pile,.active-card').forEach(node=>node.classList.remove('drawing','dealing'));
  for (const id of ['hero','enemy','battlefield']) $(id).classList.remove('hit','lunge','shake','shake-heavy','flash','morph','countering','reacting');
}
function stopLoop() { clearTimeout(mainTimer); mainTimer = null; clearEffects(); }
function showDialog(id) { stopLoop(); stopAudio(); if (!$(id).open) $(id).showModal(); }
function closeDialog(id) { $(id).close(); if (!modalOpen()) resume(); }
function resume() {
  if (document.hidden || modalOpen()) return;
  if (soundEnabled) enableAudio();
  render();
  if (state.phase === 'battle') later(beginStep, 280 / speed);
  else showPhase();
}
function playClass(element, name, duration = 500) { element.classList.remove(name); void element.offsetWidth; element.classList.add(name); effectLater(() => element.classList.remove(name), duration); }

async function enableAudio() {
  if (!soundEnabled) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!audioContext) { audioContext = new Audio(); master = audioContext.createGain(); master.gain.value = .35; master.connect(audioContext.destination); }
    if (audioContext.state === 'suspended') await audioContext.resume();
    if (!audioLoading) {
      audioLoading = true;
      const files = { hit:'impactPunch_medium_000.ogg',heavy:'impactPunch_heavy_000.ogg',shield:'impactPlate_heavy_000.ogg',soft:'impactSoft_heavy_000.ogg' };
      await Promise.allSettled(Object.entries(files).map(async ([key,file]) => {
        const response = await fetch(`assets/${file}`, { signal:lifetime.signal });
        if (response.ok) audioBuffers[key] = await audioContext.decodeAudioData(await response.arrayBuffer());
      }));
    }
  } catch { /* Codec or audio failure does not stop the battle. */ }
}
function track(source) { activeSources.add(source); source.onended = () => { activeSources.delete(source); source.disconnect(); }; }
function sound(kind, strength = 1) {
  if (!soundEnabled || !audioContext || audioContext.state !== 'running' || document.hidden) return;
  if (audioBuffers[kind]) { const source = audioContext.createBufferSource(); source.buffer = audioBuffers[kind]; source.playbackRate.value = kind === 'heavy' ? .83 : 1; source.connect(master); track(source); source.start(); }
  const now = audioContext.currentTime, oscillator = audioContext.createOscillator(), envelope = audioContext.createGain();
  oscillator.type = kind === 'shield' ? 'triangle' : 'sine';
  oscillator.frequency.setValueAtTime(kind === 'soft' ? 420 : 125 * strength, now);
  oscillator.frequency.exponentialRampToValueAtTime(kind === 'soft' ? 700 : 38, now + .16);
  envelope.gain.setValueAtTime(.001, now); envelope.gain.exponentialRampToValueAtTime(kind === 'soft' ? .13 : .45, now + .008); envelope.gain.exponentialRampToValueAtTime(.001, now + .22);
  oscillator.connect(envelope); envelope.connect(master); track(oscillator); oscillator.start(now); oscillator.stop(now + .24);
  oscillator.addEventListener('ended', () => envelope.disconnect(), { once:true });
}
function stopAudio() { for (const source of activeSources) { try { source.stop(); } catch {} } activeSources.clear(); if (audioContext?.state === 'running') audioContext.suspend().catch(() => {}); }

function cardMarkup(instance, { offer = null, displayedCharge = null } = {}) {
  const card = describeCard(instance);
  const cost = card.cost;
  const typeLabel = card.form ? FORMS[card.form].label : card.linkShort ? '연계' : typeNames[card.type];
  const linkHint = card.linkShort || (card.form ? {wolf:'세 번째 공격 추격',bear:'막은 공격에 반격',wyvern:'독성 폭발 · 생명 흡수'}[card.form] : '');
  const cardLines = card.text.split(' · ').filter(line=>!card.form || !line.endsWith(' 변신'));
  const sticker = instance.sticker && instance.sticker !== 'none' ? `<span class="card-sticker">${instance.sticker === 'top' ? '앞장' : '뒷장'}</span>` : '';
  const bubbles = displayedCharge !== null ? `<span class="charge-bubbles" aria-label="충전 ${displayedCharge} / ${cost}">${Array.from({length:cost},(_,i)=>`<i class="${i < displayedCharge ? 'full' : ''}"></i>`).join('')}${!cost ? '<small>즉시 발동</small>' : ''}</span>` : '';
  return `<span class="card-cost">${cost}</span>${sticker}<div class="card-art art art-${card.art}"></div><strong class="card-name">${card.name}</strong><span class="card-text">${cardLines.join('\n')}${linkHint ? `<span class="card-link-hint">↳ ${linkHint}</span>` : ''}</span><span class="card-bottom">${displayedCharge !== null ? bubbles : `<span class="card-tier">${'★'.repeat(card.tier)}</span>${offer ? `<span class="card-price ${state.gold < offer.price ? 'unaffordable' : ''}">${offer.price} 골드</span>` : `<span>${typeLabel}</span>`}`}</span>`;
}

function render() {
  $('game').dataset.phase = state.phase;
  $('game').dataset.form = state.battle?.player.form || 'wolf';
  $('camp-view').hidden = state.phase !== 'camp';
  $('draft-view').hidden = state.phase !== 'draft';
  $('explore-view').hidden = state.phase !== 'explore';
  $('battle-view').hidden = !['battle','reward','won','lost'].includes(state.phase);
  $('journey').innerHTML = ENCOUNTERS.map((encounter,index)=>`<span class="step ${index === state.stage ? 'current' : index < state.stage ? 'done' : ''}" data-number="${index+1}" ${index === state.stage ? 'aria-current="step"' : ''}><span>${encounter.subtitle}</span></span>`).join('');
  $('sound').setAttribute('aria-pressed', String(soundEnabled)); $('sound').setAttribute('aria-label', soundEnabled ? '효과음 끄기' : '효과음 켜기'); $('sound').textContent = soundEnabled ? '♫' : '♪';
  $('speed').textContent = `속도 ×${speed}`;
  $('save-warning').hidden = saveAvailable;
  $('pause-opponent').hidden = !state.opponent;
  if (state.phase === 'draft') renderDraft();
  else if (state.phase === 'explore') renderExplore();
  else if (state.phase === 'camp') renderCamp();
  else renderBattle();
}
function renderDraft() {
  const draft = state.draft, starting = draft.kind === 'start';
  const roles = ['변신','공격','방어','기력','공격','회복','자유','자유'];
  $('draft-kicker').textContent = starting ? '첫 서약 · 시작 덱 만들기' : `${state.stage+1}번째 탐험 · ${draft.title}`;
  $('draft-title').textContent = starting ? `${roles[draft.picked]} 카드를 골라요` : draft.title;
  $('draft-subtitle').textContent = starting ? '매번 다른 세 장 중 한 장을 선택' : `세 장 중 한 장 · ${draft.tier}등급 카드`;
  $('draft-count').textContent = `${draft.picked} / ${draft.total}장 선택`;
  $('draft-dots').innerHTML = Array.from({length:draft.total},(_,i)=>`<i class="${i < draft.picked ? 'done' : i === draft.picked ? 'current' : ''}"></i>`).join('');
  $('draft-options').innerHTML = draft.offers.map(offer=>{
    const card = describeCard(offer);
    return `<button class="draft-option" data-draft-offer="${offer.uid}" data-type="${card.type}" aria-label="${card.name} 선택, 기력 ${card.cost}, ${card.tier}등급, ${card.text}${card.linkText ? `, 연계 ${card.linkText}` : ''}${card.form ? `, ${FORMS[card.form].detail}` : ''}">${cardMarkup(offer)}</button>`;
  }).join('');
  $('draft-deck-count').textContent = `모은 카드 ${state.collection.length}장`;
  $('draft-preview').innerHTML = state.collection.length ? state.collection.map(instance=>`<span class="picked-card">${CARDS[instance.id].name}</span>`).join('') : '<span class="picked-card">첫 카드부터 직접 선택해요</span>';
  $('draft-preview').scrollLeft = $('draft-preview').scrollWidth;
  $('draft-note').textContent = starting ? '8장을 고르면 숲의 탐험이 시작됩니다' : state.collection.length >= 36 ? '전체 보관 한도 · 선택 카드 대신 골드 +3' : activeDeck(state).length < DECK_MAX ? '획득 카드는 바로 내 덱에 들어갑니다' : '출전 덱이 가득 차면 보관함에 들어갑니다';
}
function renderExplore() {
  $('explore-kicker').textContent = `${state.stage+1} / ${ENCOUNTERS.length} 시련 · 숲의 갈림길`;
  $('explore-title').textContent = state.stage === 0 ? '첫 발걸음은 어디로?' : '다음 길을 골라요';
  $('explore-subtitle').textContent = '한 곳을 탐험한 뒤 전투를 준비합니다';
  $('explore-supplies').innerHTML = `<span>생명 <b>${state.hp}</b></span><span>골드 <b>${state.gold}</b></span><span>내 덱 <b>${activeDeck(state).length}장</b></span>`;
  $('explore-options').innerHTML = state.exploration.offers.map(offer=>{
    const event = EVENTS[offer.eventId];
    const cardRoom = Math.max(0,36-state.collection.length), converted = Math.max(0,event.total-cardRoom);
    const reward = converted ? `${event.total-converted ? `카드 ${event.total-converted}장 · ` : '보관 한도 · '}골드 +${converted*3}` : event.rewardLabel;
    return `<button class="encounter-option" data-encounter="${offer.uid}" data-event="${offer.eventId}" aria-label="${event.title}, ${event.description}, ${reward}, ${event.costLabel}"><span class="encounter-art art art-${event.art}"></span><span class="encounter-copy"><strong>${event.title}</strong><span class="description">${event.description}</span><span class="encounter-reward">${reward}</span></span><span class="encounter-cost">${event.costLabel}</span></button>`;
  }).join('');
}
function renderCamp() {
  const deck = activeDeck(state), encounter = ENCOUNTERS[state.stage];
  $('camp-stage').textContent = `${state.stage+1} / ${ENCOUNTERS.length} 시련 · ${encounter.subtitle}`;
  $('camp-hp').textContent = state.hp; $('gold').textContent = state.gold;
  $('deck-size').textContent = deck.length; $('bench-size').textContent = state.collection.length - deck.length;
  for (const tab of document.querySelectorAll('[data-tab]')) tab.setAttribute('aria-selected', String(tab.dataset.tab === activeTab));
  $('collection').setAttribute('aria-labelledby', `tab-${activeTab}`);
  $('collection-hint').textContent = activeTab === 'shop' ? '구매 → 보관함' : activeTab === 'bench' ? '눌러서 덱에 편입' : '눌러서 카드 관리';
  $('deck-limit').textContent = activeTab === 'shop' ? '전투마다 새 상품' : `${DECK_MIN}~${DECK_MAX}장`;
  const mergeCount = upgradeAll(structuredClone(state)).merged || 0;
  $('upgrade-all').hidden = activeTab === 'shop';
  $('upgrade-all').disabled = mergeCount === 0;
  $('upgrade-count').textContent = `${mergeCount}회`;
  $('upgrade-all').setAttribute('aria-label', mergeCount ? `일괄 합성 ${mergeCount}회, 덱과 보관함의 같은 카드를 최대 3등급까지 합성, 출전 ${DECK_MIN}장 유지` : '일괄 합성, 합성 가능한 카드 없음');
  const cards = activeTab === 'shop' ? state.shop : state.collection.filter(card => card.inDeck === (activeTab === 'deck'));
  const scroll = $('collection').scrollTop;
  $('collection').innerHTML = cards.length ? cards.map(card => {
    const info = describeCard(card);
    return `<button class="card" data-${activeTab === 'shop' ? 'offer' : 'owned'}="${card.uid}" data-type="${info.type}" aria-label="${info.name}, ${info.tier}등급, 기력 ${info.cost}, ${info.text}${info.linkText ? `, 연계 ${info.linkText}` : ''}${activeTab === 'shop' ? `, ${card.price} 골드` : card.sticker !== 'none' ? `, ${card.sticker === 'top' ? '앞장' : '뒷장'}` : ''}">${cardMarkup(card, { offer:activeTab === 'shop' ? card : null })}</button>`;
  }).join('') : `<div class="empty-collection">${activeTab === 'shop' ? '오늘의 상품을 모두 샀습니다' : '보관함이 비었습니다'}<small>${activeTab === 'shop' ? '다음 시련에서 새 상품이 들어옵니다' : '상점에서 새 카드를 찾아보세요'}</small></div>`;
  $('collection').scrollTop = scroll;
  $('next-enemy-name').textContent = encounter.name;
  $('next-enemy-info').textContent = `덱 ${enemyDeck(state).length}장 · 살펴보기 ›`;
  $('launch').disabled = deck.length < DECK_MIN || deck.length > DECK_MAX;
}
function fighterStatus(fighter) {
  return `${fighter.shield ? `<span>보호막 ${fighter.shield}</span>` : ''}${fighter.poison ? `<span class="poison">맹독 ${fighter.poison}</span>` : ''}${fighter.burn ? `<span class="burn">화상 ${fighter.burn}</span>` : ''}${fighter.shock ? `<span class="shock">감전 ${fighter.shock}</span>` : ''}`;
}
function renderBattle() {
  if (!state.battle) return;
  const battle = state.battle, player = battle.player, enemy = battle.enemy;
  $('battle-stage').textContent = `${state.stage+1} / ${ENCOUNTERS.length} · ${ENCOUNTERS[state.stage].subtitle}`;
  $('battle-turn').textContent = `${battle.turn}턴 · ${battle.actor === 'player' ? '내' : '상대'} 차례`;
  $('hero').dataset.active = String(battle.actor === 'player');
  $('enemy').dataset.active = String(battle.actor === 'enemy');
  for (const actor of ['player','enemy']) {
    $(`${actor}-lane`).dataset.active = String(battle.actor === actor && state.phase === 'battle');
    $(`${actor}-lane`).dataset.form = battle[actor].form;
    $(`${actor}-turn-label`).textContent = battle.actor === actor && state.phase === 'battle' ? '내 차례' : '대기';
    $(`${actor}-form-rule`).textContent = FORMS[battle[actor].form].rule;
  }
  if (battle.actor === 'enemy' && state.phase === 'battle') $('enemy-turn-label').textContent = '상대 차례';
  for (const actor of ['player','enemy']) {
    const fighter = battle[actor], id = actor === 'player' ? 'hero' : 'enemy';
    if (fighter.form === 'wolf') $(`${actor}-turn-label`).textContent += ` · 연타 ${fighter.combo%3}/3`;
    let focus = $(`${id}-focus`);
    if (!focus) {focus=document.createElement('span');focus.id=`${id}-focus`;focus.className='focus-tag';$(id).querySelector('.resource-row').append(focus);}
    focus.hidden=!fighter.focus;focus.textContent=`집중 ${fighter.focus || 0}`;
  }
  $('hero-art').className = `portrait art art-${player.form}`;
  $('hero-name').textContent = FORMS[player.form].name; $('enemy-name').textContent = FORMS[enemy.form].name;
  $('enemy-name').title = enemy.name;
  $('enemy-art').className = `portrait art art-${enemy.form}`;
  $('hero-hp').textContent = player.hp; $('hero-max').textContent = ` / ${player.maxHp}`;
  $('enemy-hp').textContent = enemy.hp; $('enemy-max').textContent = ` / ${enemy.maxHp}`;
  $('hero-health-fill').style.width = `${player.hp/player.maxHp*100}%`; $('enemy-health-fill').style.width = `${enemy.hp/enemy.maxHp*100}%`;
  $('hero-status').innerHTML = fighterStatus(player); $('enemy-status').innerHTML = fighterStatus(enemy);
  $('hero-energy').textContent = player.energy; $('enemy-energy').textContent = enemy.energy;
  $('hero-deck').textContent = `덱 ${player.draw.length}\n버림 ${player.discard.length}`;
  $('enemy-deck').textContent = `덱 ${enemy.draw.length}\n버림 ${enemy.discard.length}`;
  $('history').innerHTML = history.slice(-4).map(event=>{
    const lead=event.links?.find(link=>link.kind==='form')||event.links?.[0],owner=lead?.actor||event.actor,art=lead?.name==='곰 반격'?'bear':event.cardId?CARDS[event.cardId].art:null;
    return `<span class="history-item ${owner === 'enemy' ? 'enemy-action' : ''} ${event.type === 'charge' ? 'charge' : ''} ${lead ? 'linked-action' : ''}" title="${event.name || '재섞기'}${event.links?.length ? ` · ${event.links.map(link=>`${link.name}: ${link.text}`).join(' · ')}` : ''}">${art ? `<i class="art art-${art}"></i>` : ''}<span><small>${event.turn}턴 ${owner === 'player' ? '나' : '적'}</small>${event.type === 'shuffle' ? '재섞기' : event.type === 'charge' ? '충전·버림' : lead ? lead.name : event.name}</span></span>`;
  }).join('');
  for (const actor of ['player','enemy']) renderActive(lastCards[actor] || {actor,type:'waiting'});
}
function renderActive(event) {
  const slot = $(`${event.actor}-active-card`), owner = event.actor === 'player' ? '내' : '상대';
  slot.dataset.action = event.type;
  slot.dataset.linked = String(Boolean(event.links?.some(link=>link.actor===event.actor)));
  if (event.type === 'waiting') {slot.innerHTML = `<span class="await-card">${owner} 카드<br>사용 대기</span>`;return;}
  if (!event.cardId) { slot.innerHTML = '<span class="await-card"><img class="shuffle-icon" src="assets/kenney-pop/repeat.svg" alt=""><br>덱 재섞기<br><small>한 턴 휴식</small></span>'; return; }
  const info = { id:event.cardId, tier:event.tier || 1 };
  const card = describeCard(info);
  slot.innerHTML = `<div class="card" data-type="${card.type}" aria-label="${owner} 카드, ${event.name || card.name}, ${event.type === 'charge' ? '충전 부족으로 버림' : '자동 발동'}, 충전 ${event.charged || 0}/${card.cost}">${cardMarkup(info,{displayedCharge:event.charged || 0})}</div>`;
}
function showCard(kind, uid) {
  if (state.phase !== 'camp') return;
  const instance = (kind === 'shop' ? state.shop : state.collection).find(card=>card.uid === uid);
  if (!instance) return;
  detail = { kind, uid };
  const card = describeCard(instance), shop = kind === 'shop';
  $('detail-overline').textContent = shop ? `FOREST MARKET · ${instance.price} 골드` : `${instance.inDeck ? 'MY DECK' : 'COLLECTION'} · ${card.tier}등급`;
  $('detail-card').className = `detail-card art art-${card.art}`;
  $('detail-title').textContent = card.name;
  $('detail-text').textContent = `기력 ${card.cost} · ${card.text}${card.form ? `\n${FORMS[card.form].detail}` : ''}`;
  $('detail-link').hidden = !card.linkText;
  $('detail-link').innerHTML = card.linkText ? `<strong>카드 연계</strong><p>${card.linkText}</p><span>함께 쓰기 · ${card.linkPartners.map(id=>CARDS[id].name).join(' · ')}</span>` : '';
  $('detail-feedback')?.remove();
  if (shop) {
    $('detail-actions').innerHTML = `<button class="primary-button" data-action="buy" ${state.gold < instance.price ? 'disabled' : ''}>구매 · ${instance.price} 골드</button><span class="action-note">보관함에 들어옵니다 · 보유 ${state.gold} 골드</span>`;
  } else {
    const twin = state.collection.filter(item=>item.uid !== uid && item.id === instance.id && item.tier === instance.tier).sort((a,b)=>Number(a.inDeck)-Number(b.inDeck))[0];
    const canMerge = instance.tier < 3 && twin && !(instance.inDeck && twin.inDeck && activeDeck(state).length <= DECK_MIN);
    $('detail-actions').innerHTML = `<button class="primary-button" data-action="equip">${instance.inDeck ? '덱에서 빼기' : '덱에 넣기'}</button><button class="secondary-button" data-action="upgrade" ${canMerge ? '' : 'disabled'}>합성 · 2장 → 1장</button><button class="secondary-button" data-action="sell">판매 · +${instance.tier} 골드</button>${instance.inDeck ? `<div class="sticker-row">${[['top','앞장'],['none','기본'],['bottom','뒷장']].map(([key,label])=>`<button class="secondary-button" data-action="sticker" data-sticker="${key}" aria-pressed="${instance.sticker === key}">${label}</button>`).join('')}</div><span class="action-note">앞장·뒷장은 덱마다 한 장씩 · 재섞을 때도 적용</span>` : '<span class="action-note">덱에 편입한 뒤 정렬 스티커를 붙일 수 있습니다</span>'}`;
  }
  const feedback = document.createElement('p'); feedback.id = 'detail-feedback'; feedback.className = 'detail-feedback'; feedback.setAttribute('role','status'); $('detail-actions').after(feedback);
  showDialog('card-dialog');
}

function showDeckLinks() {
  if(state.phase!=='camp')return;
  const deck=activeDeck(state), ids=new Set(deck.map(card=>card.id));
  const forms=[...new Set(deck.map(card=>CARDS[card.id].form).filter(Boolean))];
  $('deck-forms').innerHTML=forms.length ? forms.map(form=>`<article class="form-guide"><span class="art art-${form}"></span><div><strong>${FORMS[form].name} · ${FORMS[form].label}</strong><p>${FORMS[form].detail}</p></div></article>`).join('') : '<p>변신 카드를 넣으면 고유 규칙이 열립니다.</p>';
  const cards=[...new Map(deck.map(card=>[`${card.id}-${card.tier}`,card])).values()].filter(card=>describeCard(card).linkText);
  $('deck-combos').innerHTML=cards.length ? cards.map(instance=>{
    const card=describeCard(instance);
    return `<article class="deck-combo"><button data-link-card="${instance.uid}">${card.name} ${'★'.repeat(card.tier)} ›</button><p>${card.linkText}</p><div class="combo-partners">${card.linkPartners.map(id=>`<span class="${ids.has(id)?'in-deck':''}">${ids.has(id)?'내 덱 · ':'추천 · '}${CARDS[id].name}</span>`).join('')}</div></article>`;
  }).join('') : '<p>상점과 탐험에서 ‘연계’ 카드를 찾아보세요.</p>';
  showDialog('links-dialog');
}
function showOpponent() {
  if (!state.opponent) return;
  const cards = enemyDeck(state);
  $('opponent-title').textContent = ENCOUNTERS[state.stage].name;
  $('opponent-info').textContent = `생명 ${ENCOUNTERS[state.stage].hp} · ${cards.length}장 · 드루이드로 시작`;
  $('opponent-cards').innerHTML = cards.map(instance => {
    const card = describeCard(instance);
    return `<div class="opponent-card"><span class="art art-${card.art}"></span><span><strong>${card.name} <small>${'★'.repeat(card.tier)}${instance.sticker === 'top' ? ' · 앞장' : instance.sticker === 'bottom' ? ' · 뒷장' : ''}</small></strong><span>기력 ${card.cost} · ${card.text}${card.linkText ? `<br>연계 · ${card.linkText}` : ''}${card.form ? `<br>${FORMS[card.form].rule}` : ''}</span></span></div>`;
  }).join('');
  showDialog('opponent-dialog');
}

function point(element) { const r = element.getBoundingClientRect(), f = $('battlefield').getBoundingClientRect(); return { x:r.left+r.width/2-f.left, y:r.top+r.height/2-f.top }; }
function floatText(text, id, kind = '') {
  const p = point($(id).querySelector('.portrait-ring')), node = document.createElement('span');
  node.className = `damage-float ${kind}`; node.textContent = text; node.style.left = `${p.x}px`; node.style.top = `${p.y}px`; $('effects').append(node); effectLater(()=>node.remove(),900);
}
function impact(id, heavy, form = 'enemy') {
  playClass($(id),'hit'); playClass($('battlefield'),heavy ? 'shake-heavy' : 'shake'); playClass($('battlefield'),'flash');
  if (reducedMotion) return;
  const p = point($(id).querySelector('.portrait-ring'));
  for (const className of ['slash','impact-ring']) { const n = document.createElement('i'); n.className = `${className} ${form}`; n.style.left = `${p.x}px`; n.style.top = `${p.y}px`; $('effects').append(n); effectLater(()=>n.remove(),500); }
  for (let i=0;i<(heavy?10:6);i++) { const n=document.createElement('i'), angle=i/8*Math.PI*2, distance=30+(i%4)*16; n.className=`spark ${form}`; n.style.cssText=`left:${p.x}px;top:${p.y}px;--sx:${Math.cos(angle)*distance}px;--sy:${Math.sin(angle)*distance}px`; $('effects').append(n); effectLater(()=>n.remove(),550); }
}
function flyCard(instance, actor, fromDeck = false) {
  if (reducedMotion) return;
  const target = actor === 'player' ? 'enemy' : 'hero';
  const origin=(fromDeck?$(`${actor}-draw-pile`).querySelector('.card-back'):$(`${actor}-active-card`)).getBoundingClientRect();
  const dest=(fromDeck?$(`${actor}-active-card`):$(target).querySelector('.portrait-ring')).getBoundingClientRect(), card=describeCard(instance), node=document.createElement('div');
  node.className=`flying-card ${fromDeck?'dealt-card':'attack-flight'} art art-${card.art}`;
  node.dataset.owner=actor;
  node.style.cssText=`left:${origin.x+origin.width/2}px;top:${origin.y+origin.height/2}px;--dx:${dest.x+dest.width/2-origin.x-origin.width/2}px;--dy:${dest.y+dest.height/2-origin.y-origin.height/2}px`;
  const duration=Math.max(70,(fromDeck?220:260)/speed);
  node.style.animationDuration=`${duration}ms`;
  node.innerHTML=`<span>${card.name}</span>`; document.body.append(node); effectLater(()=>node.remove(),duration+20);
}
function beginStep() {
  if (state.phase !== 'battle' || modalOpen() || document.hidden) return;
  $('battle-caption').classList.remove('has-link');
  const actor=state.battle.actor, fighter=state.battle[actor], instance=fighter.draw[0];
  if (instance) {
    const card=describeCard(instance), charged=Math.min(card.cost,instance.charge+fighter.energy);
    renderActive({cardId:instance.id,tier:instance.tier,name:card.name,actor,charged});
    $(`${actor}-turn-label`).textContent = `${(state.battle.turnCard || 0)+1}장째${fighter.form==='wolf' ? ` · 연타 ${fighter.combo%3}/3` : ''}`;
    $('battle-caption').textContent=`${actor === 'player' ? '내' : '상대'} 기력 ${fighter.energy} · ${card.name}`;
    const dealTime=reducedMotion?30:Math.max(70,220/speed);
    playClass($(`${actor}-draw-pile`),'drawing',dealTime);
    flyCard(instance,actor,true);
    later(()=>{
      if (state.phase !== 'battle' || modalOpen() || document.hidden) return;
      if (card.type === 'attack' && charged >= card.cost) flyCard(instance,actor);
      playClass($(`${actor}-active-card`),'dealing',Math.max(90,260/speed));
      later(resolveStep,reducedMotion?30:Math.max(90,260/speed));
    },dealTime);
    return;
  } else {
    renderActive({actor}); $('battle-caption').textContent=`${actor === 'player' ? '내' : '상대'} 덱 재섞기 · 한 턴 휴식`;
  }
  later(resolveStep, reducedMotion ? 50 : Math.max(90,260/speed));
}
function resolveStep() {
  if (state.phase !== 'battle' || modalOpen() || document.hidden) return;
  clearEffects();
  const before=structuredClone(state.battle), event=stepBattle(state);
  lastCards[event.actor]=event; history.push(event); if(history.length>5)history.shift();
  render(); save();
  const sourceId=event.actor === 'player' ? 'hero' : 'enemy', targetId=event.actor === 'player' ? 'enemy' : 'hero';
  for (const [actor,id] of [['player','hero'],['enemy','enemy']]) {
    const old=before[actor], current=state.battle[actor], lost=old.hp-current.hp;
    if (lost>0) { floatText(`−${lost}`,id,event.poisonDamage && actor===event.actor ? 'poison' : event.critical ? 'critical' : ''); impact(id,event.critical||lost>=16,current.form); }
    else if (current.hp>old.hp) floatText(`+${current.hp-old.hp}`,id,'heal');
  }
  if (event.type === 'card') {
    if (event.rawDamage && !event.damage) { floatText('방어',targetId,'block'); impact(targetId,false,event.formAfter); }
    if (event.shield && !event.rawDamage) floatText(`+${event.shield}`,sourceId,'block');
    if (event.formBefore !== event.formAfter) { playClass($(sourceId),'morph'); sound('soft'); }
    else sound(event.critical ? 'heavy' : event.rawDamage ? 'hit' : event.shield ? 'shield' : 'soft');
    $('battle-caption').textContent=`${event.actor === 'player' ? '내' : '상대'} · ${event.name}${event.damage ? ` · 피해 ${event.damage}` : event.shield ? ` · 보호막 +${event.shield}` : ''}${event.poison ? ` · 맹독 +${event.poison}` : ''}`;
  } else if (event.type === 'charge') {
    $('battle-caption').textContent=`${event.actor === 'player' ? '내' : '상대'} · ${event.name} 충전 ${event.charged}/${event.cost} · 버림`;
  } else $('battle-caption').textContent=`${event.actor === 'player' ? '내' : '상대'} 재섞기 · 한 턴 휴식${event.poisonDamage ? ` · 맹독 피해 ${event.poisonDamage}` : ''}`;
  $('battle-caption').classList.toggle('has-link',Boolean(event.links?.length));
  if(event.links?.length) {
    const lead=event.links.find(link=>link.kind==='form')||event.links[0];
    $('battle-caption').innerHTML=`<strong class="link-caption">${lead.actor==='player'?'내':'상대'} ${lead.name}</strong><span class="link-caption-detail">${lead.kind==='form' ? lead.text : `${event.name} · ${lead.text}`}</span>`;
    if(lead.kind==='form')floatText(lead.name,lead.actor==='player'?'hero':'enemy','synergy');
    if(event.extraHits) {flyCard({id:event.cardId,tier:event.tier},event.actor);effectLater(()=>impact(targetId,false,'wolf'),Math.max(60,130/speed));}
    if(event.counterRawDamage) {playClass($(targetId),'countering',600);if(event.counterAbsorbed&&!event.counterDamage){floatText(`반격 ${event.counterAbsorbed}`,sourceId,'block');impact(sourceId,false,'bear');}}
    if(event.reactionRawDamage) {playClass($(sourceId),'reacting',600);sound('heavy');}
  } else if (state.phase === 'battle') $('battle-caption').textContent += event.turnEnded ? ' · 턴 종료' : ' · 연속 사용';
  if (event.fatigue) $('battle-caption').textContent += ` · 피로 ${event.fatigue}`;
  if (state.phase === 'battle') {const formLink=event.links?.some(link=>link.kind==='form');later(beginStep,Math.max(formLink?650:150,(formLink?1450:event.critical?1060:event.turnEnded?900:600)/speed));}
  else later(showPhase,750);
}
function showPhase() {
  if (document.hidden || modalOpen()) return;
  if (state.phase === 'reward') {
    $('rewards').innerHTML=state.rewards.map(reward=>{ const card=describeCard(reward.cardId); return `<button class="reward" data-reward="${reward.id}"><span class="art art-${card.art}"></span><span><strong>${card.name}</strong><small>기력 ${card.cost} · ${card.text}</small>${card.linkShort || card.form ? `<small class="reward-link">↳ ${card.linkShort || FORMS[card.form].rule}</small>` : ''}</span><span class="arrow">›</span></button>`; }).join('');
    $('reward-note').textContent=state.collection.length>=36?'보관 한도 · 골드 +9 · 생명 +18':'카드 1장 · 골드 +6 · 생명 +18';
    showDialog('reward-dialog');
  } else if (state.phase === 'won' || state.phase === 'lost') {
    const won=state.phase==='won';
    $('result-overline').textContent=won?'THE WILD IS YOURS':'THE WILD REMEMBERS'; $('result-title').textContent=won?'서약의 완성':'숲에 잠들다';
    $('result-description').textContent=won?'다섯 시련을 모두 넘었습니다.':'다른 카드 조합으로 다시 도전하세요.';
    $('result-stats').innerHTML=`<span>넘은 시련<b>${state.stats.victories} / ${ENCOUNTERS.length}</b></span><span>자동 변신<b>${state.stats.shifts}</b></span><span>총 피해<b>${state.stats.damage}</b></span>`;
    showDialog('result-dialog');
  }
}
function newRun() {
  stopLoop(); document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  clearTimeout(toastTimer); $('toast').classList.remove('visible'); $('toast').textContent='';
  state=createRun(); activeTab='deck'; detail=null; lastCards={player:null,enemy:null}; history=[];
  lastJourneyChoiceAt=0;
  $('collection').scrollTop=0;
  render(); save(); if(soundEnabled)enableAudio();
}

function acceptJourneyChoice() {
  const now = performance.now();
  if (modalOpen() || now-lastJourneyChoiceAt < 240) return false;
  lastJourneyChoiceAt=now;
  return true;
}
listen($('draft-options'),'click',event=>{
  const button=event.target.closest('[data-draft-offer]');
  if(!button || !acceptJourneyChoice()) return;
  const offer=state.draft?.offers.find(card=>card.uid===button.dataset.draftOffer);
  if(!offer)return;
  const result=chooseDraft(state,offer.uid);
  if(!result.ok)return toast(result.error);
  render();save();sound('soft');
  if(result.converted)toast('전체 보관 한도 · 골드 +3');
  else if(state.phase==='camp')toast('카드 획득 · 전투를 준비하세요');
});
listen($('explore-options'),'click',event=>{
  const button=event.target.closest('[data-encounter]');
  if(!button || !acceptJourneyChoice())return;
  const result=chooseEncounter(state,button.dataset.encounter);
  if(!result.ok)return toast(result.error);
  activeTab='deck';render();save();sound('soft');
  if(state.phase==='camp')toast('생명 +12 · 골드 +3');
});
document.querySelectorAll('[data-tab]').forEach(button=>listen(button,'click',()=>{activeTab=button.dataset.tab;$('collection').scrollTop=0;renderCamp();}));
listen($('collection'),'click',event=>{const button=event.target.closest('[data-owned],[data-offer]');if(button)showCard(button.dataset.offer?'shop':'owned',button.dataset.offer||button.dataset.owned);});
listen($('deck-links'),'click',showDeckLinks);
listen($('deck-combos'),'click',event=>{const button=event.target.closest('[data-link-card]');if(!button)return;$('links-dialog').close();showCard('owned',button.dataset.linkCard);});
listen($('upgrade-all'),'click',()=>{
  const result=upgradeAll(state);
  if(!result.ok)return toast(result.error);
  if(!result.merged)return;
  renderCamp();save();sound('soft');
  playClass($('upgrade-all'),'merged',550);
  toast(`${result.merged}회 합성 완료 · 덱 ${activeDeck(state).length}장`);
});
listen($('detail-actions'),'click',event=>{
  const button=event.target.closest('[data-action]');if(!button||!detail)return;
  const card=state.collection.find(item=>item.uid===detail.uid); let result;
  if(button.dataset.action==='buy')result=buyCard(state,detail.uid);
  if(button.dataset.action==='equip'&&card)result=editDeck(state,detail.uid,!card.inDeck);
  if(button.dataset.action==='sell')result=sellCard(state,detail.uid);
  if(button.dataset.action==='upgrade')result=upgradeCard(state,detail.uid);
  if(button.dataset.action==='sticker')result=setSticker(state,detail.uid,button.dataset.sticker);
  if(!result?.ok){$('detail-feedback').textContent=result?.error||'카드를 찾을 수 없습니다.';return;}
  save();renderCamp();
  if(['upgrade','sticker'].includes(button.dataset.action)){showCard('owned',detail.uid);return;}
  $('card-dialog').close(); if(button.dataset.action==='buy'){activeTab='bench';renderCamp();toast('보관함에 추가했습니다. 덱에 넣어보세요.');}
});
listen($('launch'),'click',()=>{
  const result=startBattle(state);if(!result.ok)return toast(result.error);
  lastCards={player:null,enemy:null};history=[];render();save();enableAudio();
  $('battle-caption').textContent=`${state.battle.actor==='player'?'내 덱':'상대 덱'}이 먼저 시작합니다`;
  later(beginStep,600/speed);
});
listen($('speed'),'click',()=>{speed=speed===1?2:speed===2?4:1;savePrefs();$('speed').textContent=`속도 ×${speed}`;});
listen($('sound'),'click',async()=>{soundEnabled=!soundEnabled;savePrefs();if(soundEnabled){await enableAudio();sound('soft');}else stopAudio();render();});
listen($('help'),'click',()=>showDialog('help-dialog'));
listen($('inspect-opponent'),'click',showOpponent);
listen($('pause-opponent'),'click',()=>{$('pause-dialog').close();showOpponent();});
listen($('pause'),'click',()=>showDialog('pause-dialog'));
listen($('battle-pause'),'click',()=>showDialog('pause-dialog'));
listen($('begin'),'click',()=>closeDialog('welcome-dialog'));
listen($('restart'),'click',()=>{$('pause-dialog').close();showDialog('restart-dialog');});
listen($('confirm-restart'),'click',newRun);listen($('play-again'),'click',newRun);
listen($('rewards'),'click',event=>{const button=event.target.closest('[data-reward]');if(!button)return;const result=chooseReward(state,button.dataset.reward);if(!result.ok)return toast(result.error);$('reward-dialog').close();lastCards={player:null,enemy:null};history=[];activeTab='deck';render();save();$('collection').scrollTop=0;toast(result.converted ? '보관 한도 · 골드 +9 · 생명 +18' : '새 카드 · 골드 +6 · 생명 +18');});
document.querySelectorAll('[data-close]').forEach(button=>listen(button,'click',()=>closeDialog(button.dataset.close)));
document.querySelectorAll('dialog').forEach(dialog=>listen(dialog,'cancel',event=>{event.preventDefault();if(['welcome-dialog','reward-dialog','result-dialog'].includes(dialog.id))return;closeDialog(dialog.id);}));
listen(document,'visibilitychange',()=>{if(document.hidden){stopLoop();stopAudio();save();}else if(!modalOpen())showDialog('pause-dialog');});
listen(window,'pagehide',event=>{stopLoop();stopAudio();save();clearTimeout(toastTimer);if(!event.persisted){lifetime.abort();audioContext?.close().catch(()=>{});}});
listen(window,'pageshow',event=>{if(event.persisted){render();if(!modalOpen())showDialog('pause-dialog');}});
render();save();
if(!hadSave)showDialog('welcome-dialog');else if(state.phase==='battle')showDialog('pause-dialog');else showPhase();
