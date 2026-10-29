import { FORMS, CARDS, ENCOUNTERS, EVENTS, DECK_MIN, DECK_MAX, createRun, activeDeck, enemyDeck, describeCard, editDeck, buyCard, sellCard, upgradeCard, upgradeAll, setSticker, startBattle, stepBattle, chooseDraft, chooseEncounter, chooseReward, serialize, restoreRun } from './rules.mjs?v=cartoon-4';
import { presentationTiming, impactBeats, impactTotals, cardPlayStatus, impactFeedback, targetImpactKind, TARGET_EFFECT_TEXTURES, targetEffectVisual } from './combat-presentation.mjs?v=closeup-7';
import { analyzeDeck } from './deck-analysis.mjs?v=cartoon-4';
import { cardArtClass } from './card-art.mjs?v=cartoon-4';
import { icon, decorateMenus } from './menu-icons.mjs?v=quiet-5';
import { cardSymbols, visibleCardActor } from './combat-ui.mjs?v=quiet-5';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'wild-oath:v5';
const LEGACY_SAVE_KEY = 'wild-oath:v4';
const PREF_KEY = 'wild-oath:settings:v1';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lifetime = new AbortController();
let state, hadSave = false, saveAvailable = true, soundEnabled = false, speed = 1;
let activeTab = 'deck', detail = null, presentedCard = null;
let mainTimer = null, toastTimer = null, audioContext = null, master = null, audioLoading = false;
let audioBuffers = {}, activeSources = new Set();
let lastJourneyChoiceAt = 0;
let targetEffectsWarmed=false;
const effectTimers = new Set();
const effectClasses = new WeakMap();
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
  document.querySelectorAll('.side-draw-pile,.active-card').forEach(node=>node.classList.remove('drawing','dealing','card-slam','is-playing'));
  for (const id of ['hero','enemy','battlefield']) $(id).classList.remove('hit','heavy-hit','hit-stop','casting','lunge','shake','shake-heavy','flash','morph','countering','reacting');
  delete $('battlefield').dataset.presentation; delete $('battlefield').dataset.caster; delete $('battlefield').dataset.beat;
}
function stopLoop() { clearTimeout(mainTimer); mainTimer = null; clearEffects(); presentedCard=null; if(state.battle)renderBattle(); }
function showDialog(id) { stopLoop(); stopAudio(); if (!$(id).open) $(id).showModal(); }
function closeDialog(id) {
  $(id).close();
  if(id==='card-dialog'&&$('links-dialog').open){showDeckLinks();$('links-dialog').querySelector('.analysis-close').focus({preventScroll:true});}
  if (!modalOpen()) resume();
}
function resume() {
  if (document.hidden || modalOpen()) return;
  if (soundEnabled) enableAudio();
  render();
  if (state.phase === 'battle') later(beginStep, 280 / speed);
  else showPhase();
}
function playClass(element, name, duration = 500) {
  let classes=effectClasses.get(element);
  if(!classes){classes=new Map();effectClasses.set(element,classes);}
  const token=Symbol(name);classes.set(name,token);
  element.classList.remove(name);void element.offsetWidth;element.classList.add(name);
  effectLater(()=>{if(classes.get(name)===token){element.classList.remove(name);classes.delete(name);}},duration);
}

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
  const sample={draw:'soft',slam:'shield',claw:'hit',counter:'heavy',heavy:'heavy',shield:'shield',form:'soft'}[kind];
  if(audioBuffers[sample]) {
    const source=audioContext.createBufferSource(),level=audioContext.createGain();
    source.buffer=audioBuffers[sample];source.playbackRate.value=kind==='heavy'?.78:kind==='slam'?.72:kind==='counter'?.9:1;
    level.gain.value={draw:.16,slam:.34,heavy:.9,counter:.75,shield:.65,form:.35}[kind]??.75;
    source.connect(level);level.connect(master);track(source);source.addEventListener('ended',()=>level.disconnect(),{once:true});source.start();
  }
  const voices={draw:[260,105,.075,.045,'triangle'],slam:[110,44,.13,.12,'triangle'],cast:[330,90,.13,.075,'triangle'],claw:[115,35,.18,.29,'sine'],heavy:[74,24,.26,.38,'sine'],counter:[185,45,.2,.26,'triangle'],shield:[720,210,.24,.13,'triangle'],heal:[520,840,.28,.10,'sine'],energy:[640,1040,.20,.10,'triangle'],form:[110,330,.42,.12,'triangle'],poison:[175,65,.24,.13,'triangle'],fire:[130,38,.22,.13,'sawtooth'],shock:[1040,130,.12,.1,'square']};
  const [from,to,duration,gain,wave]=voices[kind]||voices.heal,now=audioContext.currentTime;
  const layers=['heal','energy','form','shield'].includes(kind)?2:1;
  for(let i=0;i<layers;i++){
    const oscillator=audioContext.createOscillator(),envelope=audioContext.createGain(),at=now+i*.065;
    oscillator.type=wave;oscillator.frequency.setValueAtTime(from*(i?1.5:1)*strength,at);oscillator.frequency.exponentialRampToValueAtTime(to*(i?1.5:1),at+duration);
    envelope.gain.setValueAtTime(.001,at);envelope.gain.exponentialRampToValueAtTime(gain/(i+1),at+.008);envelope.gain.exponentialRampToValueAtTime(.001,at+duration);
    oscillator.connect(envelope);envelope.connect(master);track(oscillator);oscillator.start(at);oscillator.stop(at+duration+.015);
    oscillator.addEventListener('ended',()=>envelope.disconnect(),{once:true});
  }
}
function stopAudio() { for (const source of activeSources) { try { source.stop(); } catch {} } activeSources.clear(); if (audioContext?.state === 'running') audioContext.suspend().catch(() => {}); }

function cardMarkup(instance, { offer = null, displayedCharge = null } = {}) {
  const card = describeCard(instance);
  const cost = card.cost;
  const combat=displayedCharge!==null;
  const sticker=instance.sticker&&instance.sticker!=='none'?`<span class="card-sticker" title="${instance.sticker==='top'?'맨 앞 고정':'맨 뒤 고정'}">${icon(instance.sticker)}</span>`:'';
  const bubbles=combat?`<span class="charge-bubbles combat-charge" aria-label="충전 ${displayedCharge} / ${cost}">${Array.from({length:cost},(_,i)=>`<i class="${i<displayedCharge?'full':''}"></i>`).join('')}${!cost?icon('energy'):''}</span>`:'';
  return `<span class="card-cost" aria-label="기력 비용 ${cost}">${cost}</span>${sticker}<div class="card-art ${combat?'combat-card-art ':''}${cardArtClass(card)}"></div><strong class="card-name ${combat?'combat-card-name':''}">${card.name}</strong><span class="card-text">${symbolsMarkup(card)}</span><span class="card-bottom">${combat?bubbles:`<span class="card-tier" aria-label="${card.tier}등급">${'★'.repeat(card.tier)}</span>${card.form?`<span class="form-identity">${{wolf:'연타·추격',bear:'수호·반격',wyvern:'관통·흡수'}[card.form]}</span>`:''}${offer?`<span class="card-price ${state.gold<offer.price?'unaffordable':''}">${icon('coin')}${offer.price}</span>`:card.linkText?`<span class="card-link-mark" title="연계 효과 있음">${icon('support')}</span>`:''}`}</span>`;
}
function symbolsMarkup(card) {
  return `<span class="battle-symbols">${cardSymbols(card).map(item=>`<span class="effect-token kind-${item.icon}" role="img" aria-label="${item.label}" title="${item.label}">${icon(item.icon)}<b>${item.value}</b></span>`).join('')}</span>`;
}

function render() {
  $('game').dataset.phase = state.phase;
  $('game').dataset.form = state.battle?.player.form || 'wolf';
  $('camp-view').hidden = state.phase !== 'camp';
  $('draft-view').hidden = state.phase !== 'draft';
  $('explore-view').hidden = state.phase !== 'explore';
  $('battle-view').hidden = !['battle','reward','won','lost'].includes(state.phase);
  $('journey').innerHTML = ENCOUNTERS.map((encounter,index)=>`<span class="step ${index === state.stage ? 'current' : index < state.stage ? 'done' : ''}" data-number="${index+1}" ${index === state.stage ? 'aria-current="step"' : ''}><span>${encounter.subtitle}</span></span>`).join('');
  $('sound').setAttribute('aria-pressed', String(soundEnabled)); $('sound').setAttribute('aria-label', soundEnabled ? '효과음 끄기' : '효과음 켜기'); $('sound').dataset.uiIcon=soundEnabled?'sound':'muted';
  $('speed').innerHTML = `${icon('speed')}<span>×${speed}</span>`;
  $('save-warning').hidden = saveAvailable;
  $('pause-opponent').hidden = !state.opponent;
  if (state.phase === 'draft') renderDraft();
  else if (state.phase === 'explore') renderExplore();
  else if (state.phase === 'camp') renderCamp();
  else renderBattle();
  decorateMenus();
}
function renderDraft() {
  const draft = state.draft, starting = draft.kind === 'start';
  const roles = ['변신','공격','방어','기력','공격','회복','자유','자유'];
  $('draft-kicker').textContent = starting ? '첫 서약' : `${state.stage+1}번째 탐험`;
  $('draft-title').textContent = starting ? `${roles[draft.picked]} 카드를 골라요` : draft.title;
  $('draft-subtitle').textContent = '';
  $('draft-count').textContent = `${draft.picked} / ${draft.total}`;
  $('draft-dots').innerHTML = Array.from({length:draft.total},(_,i)=>`<i class="${i < draft.picked ? 'done' : i === draft.picked ? 'current' : ''}"></i>`).join('');
  $('draft-options').innerHTML = draft.offers.map(offer=>{
    const card = describeCard(offer);
    return `<button class="draft-option" data-draft-offer="${offer.uid}" data-type="${card.type}" aria-label="${card.name} 선택, 기력 ${card.cost}, ${card.tier}등급, ${card.text}${card.linkText ? `, 연계 ${card.linkText}` : ''}${card.form ? `, ${FORMS[card.form].detail}` : ''}">${cardMarkup(offer)}</button>`;
  }).join('');
  $('draft-deck-count').innerHTML = `${icon('deck')} ${state.collection.length}`;
  $('draft-preview').innerHTML = state.collection.map(instance=>`<span class="picked-card picked-art ${cardArtClass(CARDS[instance.id])}" role="img" aria-label="${CARDS[instance.id].name}" title="${CARDS[instance.id].name}"></span>`).join('');
  $('draft-preview').scrollLeft = $('draft-preview').scrollWidth;
  $('draft-note').textContent = state.collection.length>=36?'보관 한도 · 골드 +3':'';
}
function renderExplore() {
  $('explore-kicker').textContent = `${state.stage+1} / ${ENCOUNTERS.length}`;
  $('explore-title').textContent = state.stage === 0 ? '첫 발걸음은 어디로?' : '다음 길을 골라요';
  $('explore-subtitle').textContent = '';
  $('explore-supplies').innerHTML = `<span aria-label="생명 ${state.hp}">${icon('heart')}<b>${state.hp}</b></span><span aria-label="골드 ${state.gold}">${icon('coin')}<b>${state.gold}</b></span><span aria-label="덱 ${activeDeck(state).length}장">${icon('deck')}<b>${activeDeck(state).length}</b></span>`;
  $('explore-options').innerHTML = state.exploration.offers.map(offer=>{
    const event = EVENTS[offer.eventId];
    const cardRoom = Math.max(0,36-state.collection.length), converted = Math.max(0,event.total-cardRoom);
    const reward = converted ? `${event.total-converted ? `카드 ${event.total-converted}장 · ` : '보관 한도 · '}골드 +${converted*3}` : event.rewardLabel;
    return `<button class="encounter-option" data-encounter="${offer.uid}" data-event="${offer.eventId}" aria-label="${event.title}, ${event.description}, ${reward}, ${event.costLabel}"><span class="encounter-art art art-${event.art}"></span><span class="encounter-copy"><strong>${event.title}</strong><span class="encounter-reward">${reward}</span></span><span class="encounter-cost">${event.costLabel}</span></button>`;
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
  $('upgrade-all').hidden = activeTab === 'shop'||mergeCount===0;
  $('upgrade-all').disabled = mergeCount === 0;
  $('upgrade-count').textContent = `${mergeCount}`;
  $('upgrade-all').setAttribute('aria-label', mergeCount ? `일괄 합성 ${mergeCount}회, 덱과 보관함의 같은 카드를 최대 3등급까지 합성, 출전 ${DECK_MIN}장 유지` : '일괄 합성, 합성 가능한 카드 없음');
  const cards = activeTab === 'shop' ? state.shop : state.collection.filter(card => card.inDeck === (activeTab === 'deck'));
  const scroll = $('collection').scrollTop;
  $('collection').innerHTML = cards.length ? cards.map(card => {
    const info = describeCard(card);
    return `<button class="card" data-${activeTab === 'shop' ? 'offer' : 'owned'}="${card.uid}" data-type="${info.type}" aria-label="${info.name}, ${info.tier}등급, 기력 ${info.cost}, ${info.text}${info.linkText ? `, 연계 ${info.linkText}` : ''}${activeTab === 'shop' ? `, ${card.price} 골드` : card.sticker !== 'none' ? `, ${card.sticker === 'top' ? '앞장' : '뒷장'}` : ''}">${cardMarkup(card, { offer:activeTab === 'shop' ? card : null })}</button>`;
  }).join('') : `<div class="empty-collection">${activeTab === 'shop' ? '오늘의 상품을 모두 샀습니다' : '보관함이 비었습니다'}<small>${activeTab === 'shop' ? '다음 시련에서 새 상품이 들어옵니다' : '상점에서 새 카드를 찾아보세요'}</small></div>`;
  $('collection').scrollTop = scroll;
  $('next-enemy-name').textContent = encounter.name;
  $('next-enemy-info').innerHTML = `${icon('deck')} ${enemyDeck(state).length}`;
  $('launch').disabled = deck.length < DECK_MIN || deck.length > DECK_MAX;
}
function fighterStatus(fighter) {
  return [['shield','defense','보호막'],['poison','poison','맹독'],['burn','fire','화상'],['shock','shock','감전']].map(([key,symbol,label])=>`<span class="status-token ${key}" ${fighter[key]?'':'hidden'} role="img" aria-label="${label} ${fighter[key]||0}" title="${label}">${icon(symbol)}<b>${fighter[key]||0}</b></span>`).join('');
}
function renderHealth(battle) {
  for(const [actor,id] of [['player','hero'],['enemy','enemy']]){
    const fighter=battle[actor];
    $(`${id}-hp`).textContent=fighter.hp;$(`${id}-max`).textContent=` / ${fighter.maxHp}`;
    $(`${id}-health-fill`).style.width=`${fighter.hp/fighter.maxHp*100}%`;
  }
}
function renderBattle() {
  if (!state.battle) return;
  warmTargetEffects();
  const battle = state.battle, player = battle.player, enemy = battle.enemy;
  const owner=visibleCardActor(battle.actor,presentedCard);
  $('battle-stage').textContent = `${state.stage+1} / ${ENCOUNTERS.length}`;
  $('battle-turn').textContent = `${battle.turn}턴`;
  $('hero').dataset.active = String(owner === 'player');
  $('enemy').dataset.active = String(owner === 'enemy');
  for (const actor of ['player','enemy']) {
    $(`${actor}-lane`).dataset.active = String(owner === actor);
    $(`${actor}-lane`).dataset.form = battle[actor].form;
    $(`${actor}-turn-label`).textContent = owner===actor?(actor==='player'?'내 차례':'상대 차례'):'';
    $(`${actor}-form-rule`).textContent = FORMS[battle[actor].form].rule;
  }
  for (const actor of ['player','enemy']) {
    const fighter = battle[actor], id = actor === 'player' ? 'hero' : 'enemy';
    let focus = $(`${id}-focus`);
    if (!focus) {focus=document.createElement('span');focus.id=`${id}-focus`;focus.className='focus-tag';$(id).querySelector('.resource-row').append(focus);}
    focus.hidden=!fighter.focus;focus.innerHTML=`${icon('focus')}<b>${fighter.focus||0}</b>`;focus.setAttribute('aria-label',`집중 ${fighter.focus||0}`);
    $(id).querySelector('.portrait-ring').setAttribute('aria-label',`${actor==='player'?'내':'상대'} ${FORMS[fighter.form].name}, 능력 보기`);
  }
  $('hero-art').className = `portrait art art-${player.form}`;
  $('hero-name').textContent = FORMS[player.form].name; $('enemy-name').textContent = FORMS[enemy.form].name;
  $('enemy-name').title = enemy.name;
  $('enemy-art').className = `portrait art art-${enemy.form}`;
  for(const [actor,id] of [['player','hero'],['enemy','enemy']])if(battle[actor].form==='wolf'){
    const combo=document.createElement('span');combo.id=`${id}-combo`;combo.className='combo-tag';combo.innerHTML=`<b>${battle[actor].combo%3}/3</b>`;combo.setAttribute('aria-label',`추격까지 연타 ${battle[actor].combo%3} / 3`);$(`${id}-name`).append(combo);
  }
  renderHealth(battle);
  $('hero-status').innerHTML = fighterStatus(player); $('enemy-status').innerHTML = fighterStatus(enemy);
  $('hero-energy').textContent = player.energy; $('enemy-energy').textContent = enemy.energy;
  for(const [actor,id] of [['player','hero'],['enemy','enemy']]){
    const fighter=battle[actor];
    $(`${id}-deck`).innerHTML=`<span class="pile-count" title="뽑을 카드" aria-label="뽑을 카드 ${fighter.draw.length}">${icon('deck')}<b>${fighter.draw.length}</b></span><span class="pile-count" title="버림" aria-label="버린 카드 ${fighter.discard.length}">${icon('chest')}<b>${fighter.discard.length}</b></span>`;
  }
  for (const actor of ['player','enemy']) renderActive(presentedCard?.actor===actor?presentedCard:{actor,type:'waiting'});
}
function renderActive(event) {
  const slot = $(`${event.actor}-active-card`), owner = event.actor === 'player' ? '내' : '상대';
  slot.dataset.action = event.preview?'preview':event.type;
  slot.setAttribute('aria-hidden',String(event.type==='waiting'));
  slot.dataset.linked = String(Boolean(event.links?.some(link=>link.actor===event.actor)));
  if (event.type === 'waiting') {slot.replaceChildren();return;}
  if (!event.cardId) { slot.innerHTML = `<span class="await-card" role="img" aria-label="덱 재섞기">${icon('shuffle')}</span>`; return; }
  const info = { id:event.cardId, tier:event.tier || 1 };
  const card = describeCard(info);
  const status=cardPlayStatus(event);
  slot.innerHTML = `<button type="button" class="card" data-inspect-card="${card.id}" data-inspect-tier="${card.tier}" data-type="${card.type}" aria-label="${owner} 카드, ${card.name}, ${status}, 충전 ${event.charged||0}/${card.cost}. 효과 자세히 보기">${cardMarkup(info,{displayedCharge:event.charged||0})}</button>`;
}
function showCard(kind, uid) {
  if (state.phase !== 'camp') return;
  const instance = (kind === 'shop' ? state.shop : state.collection).find(card=>card.uid === uid);
  if (!instance) return;
  detail = { kind, uid };
  const card = describeCard(instance), shop = kind === 'shop';
  $('detail-overline').textContent = `${shop?'상점':instance.inDeck?'내 덱':'보관함'} · ${card.tier}등급`;
  $('detail-card').className = `detail-card ${cardArtClass(card)}`;
  $('detail-title').textContent = card.name;
  $('detail-text').textContent = `기력 ${card.cost} · ${card.text}${card.form ? `\n${FORMS[card.form].detail}` : ''}`;
  $('detail-link').hidden = !card.linkText;
  $('detail-link').innerHTML = card.linkText ? `<strong>카드 연계</strong><p>${card.linkText}</p><span>함께 쓰기 · ${card.linkPartners.map(id=>CARDS[id].name).join(' · ')}</span>` : '';
  $('detail-feedback')?.remove();
  if (shop) {
    $('detail-actions').innerHTML = `<button class="primary-button" data-action="buy" aria-label="구매, ${instance.price} 골드" ${state.gold < instance.price ? 'disabled' : ''}>${icon('shop')} 구매 ${icon('coin')}${instance.price}</button>`;
  } else {
    const twin = state.collection.filter(item=>item.uid !== uid && item.id === instance.id && item.tier === instance.tier).sort((a,b)=>Number(a.inDeck)-Number(b.inDeck))[0];
    const canMerge = instance.tier < 3 && twin && !(instance.inDeck && twin.inDeck && activeDeck(state).length <= DECK_MIN);
    const atMinimum=instance.inDeck&&activeDeck(state).length<=DECK_MIN;
    $('detail-actions').innerHTML = `<button class="primary-button" data-action="equip" aria-label="${instance.inDeck?'덱에서 빼기':'덱에 넣기'}" ${atMinimum?'disabled title="출전 덱 6장 유지"':''}>${icon(instance.inDeck?'remove':'plus')}${instance.inDeck?'덱 제외':'덱 편입'}</button>${canMerge?`<button class="secondary-button" data-action="upgrade" aria-label="같은 카드 두 장 합성">${icon('merge')}합성</button>`:''}<button class="secondary-button" data-action="sell" aria-label="판매, ${instance.tier} 골드 획득" ${atMinimum?'disabled title="출전 덱 6장 유지"':''}>${icon('sell')}${icon('coin')}+${instance.tier}</button>${instance.inDeck?`<div class="sticker-row" role="group" aria-label="덱 정렬">${[['top','맨 앞 고정'],['none','무작위'],['bottom','맨 뒤 고정']].map(([key,label])=>instance.sticker===key?`<span class="secondary-button order-current" role="img" aria-label="현재 정렬: ${label}" title="현재: ${label}">${icon(key==='none'?'shuffle':key)}</span>`:`<button class="secondary-button" data-action="sticker" data-sticker="${key}" aria-label="${label}" title="${label}">${icon(key==='none'?'shuffle':key)}</button>`).join('')}</div><span class="action-note">${instance.sticker==='top'?'맨 앞 고정':instance.sticker==='bottom'?'맨 뒤 고정':'무작위'} · 재섞을 때도 유지</span>`:''}`;
  }
  const feedback = document.createElement('p'); feedback.id = 'detail-feedback'; feedback.className = 'detail-feedback'; feedback.setAttribute('role','status'); $('detail-actions').after(feedback);
  showDialog('card-dialog');
  decorateMenus();
}
function inspectBattleCard(id,tier=1) {
  const card=describeCard({id,tier});if(!card)return;
  detail=null;
  $('detail-overline').textContent=`${tier}등급`;
  $('detail-card').className=`detail-card ${cardArtClass(card)}`;
  $('detail-title').textContent=card.name;
  $('detail-text').textContent=`기력 ${card.cost} · ${card.text}${card.form?`\n${FORMS[card.form].detail}`:''}`;
  $('detail-link').hidden=!card.linkText;
  $('detail-link').innerHTML=card.linkText?`<p>${card.linkText}</p>`:'';
  $('detail-actions').replaceChildren();$('detail-feedback')?.remove();
  showDialog('card-dialog');
}
function inspectForm(actor) {
  if(!state.battle)return;
  const form=state.battle[actor].form;
  detail=null;$('detail-overline').textContent=actor==='player'?'내 능력':'상대 능력';
  $('detail-card').className=`detail-card art art-${form}`;
  $('detail-title').textContent=FORMS[form].name;$('detail-text').textContent=FORMS[form].detail;
  $('detail-link').hidden=true;$('detail-actions').replaceChildren();$('detail-feedback')?.remove();showDialog('card-dialog');
}

function showDeckLinks() {
  if(state.phase!=='camp')return;
  const deck=activeDeck(state), ids=new Set(deck.map(card=>card.id));
  const analysis=analyzeDeck(deck,enemyDeck(state).length),roleNames={attack:'공격',shield:'보호막',heal:'회복',energy:'기력 공급',charge:'선충전'};
  const marked=card=>card?`${CARDS[card.id].name} ${'★'.repeat(card.tier)}`:'없음 · 무작위';
  $('deck-analysis').innerHTML=`<div class="deck-summary"><span>내 덱 <b>${analysis.size}장</b></span><span>평균 기력 <b>${analysis.averageCost.toFixed(1)}</b></span><span>${analysis.firstActor==='player'?'내가 선공':'상대 선공'}<b>${analysis.size} : ${analysis.opponentSize}장</b></span></div><h3>기력 비용</h3><div class="cost-curve" aria-label="기력 비용별 카드 수">${analysis.costs.map((count,index)=>`<div><span>${index===3?'3 이상':index} 기력</span><i style="--cost-fill:${count/Math.max(1,...analysis.costs)*100}%" aria-hidden="true"></i><b>${count}장</b></div>`).join('')}</div><p class="analysis-note">시작 기력 4 · 덱이 두꺼운 쪽 선공 · 동률이면 나</p><div class="deck-roles">${Object.entries(roleNames).map(([role,label])=>`<span>${label} <b>${analysis.roles[role]}장</b></span>`).join('')}</div><p class="analysis-note">한 카드가 여러 역할에 포함됩니다. 선충전은 다음 카드의 충전 칸을 채우며 기력을 늘리지 않습니다.</p><div class="deck-marks"><p><strong>앞장</strong><span>${marked(analysis.top)}</span></p><p><strong>뒷장</strong><span>${marked(analysis.bottom)}</span></p></div>`;
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
    return `<button type="button" class="opponent-card" data-inspect-card="${card.id}" data-inspect-tier="${card.tier}" aria-label="${card.name}, ${card.tier}등급, 기력 ${card.cost}. 효과 자세히 보기"><span class="${cardArtClass(card)}"></span><span><strong>${card.name} <small>${'★'.repeat(card.tier)}</small></strong>${symbolsMarkup(card)}</span></button>`;
  }).join('');
  showDialog('opponent-dialog');
}

function point(element) { const r = element.getBoundingClientRect(), f = $('battlefield').getBoundingClientRect(); return { x:r.left+r.width/2-f.left, y:r.top+r.height/2-f.top }; }
function fxNode(className, p, duration=800, extra='') {
  const node=document.createElement('i');node.className=className;
  node.style.cssText=`left:${p.x}px;top:${p.y}px;${extra}`;
  if($('effects').childElementCount>=56)$('effects').firstElementChild.remove();
  $('effects').append(node);effectLater(()=>node.remove(),duration);return node;
}
function floatText(text, id, kind='', index=0) {
  const p=point($(id).querySelector('.portrait-ring')), width=$('battlefield').clientWidth;
  p.x=Math.max(48,Math.min(width-48,p.x+18+(index%2)*6));p.y-=12+Math.floor(index/3)*12;
  const node=fxNode(`damage-float ${kind}`,p,1050);node.textContent=text;
}
function effectChip(text,id,kind,index=0) {
  const p=point($(id).querySelector('.portrait-ring')),width=$('battlefield').clientWidth;
  const slot=`${id}-${Math.min(index,1)}`;
  $('effects').querySelectorAll('.effect-chip').forEach(node=>{if(node.dataset.slot===slot)node.remove();});
  p.x=Math.max(40,Math.min(width-40,p.x+34));p.y-=16;
  const symbol={shield:'defense',burn:'fire',energy:'energy',charge:'charge',poison:'poison',shock:'shock'}[kind]||kind;
  const node=fxNode(`effect-chip kind-${kind}`,p,1050,`--chip-index:${Math.min(index,1)};`);node.dataset.slot=slot;node.setAttribute('aria-label',text);node.innerHTML=`${icon(symbol)}<b>${(text.match(/[+−]?\d+/g)||[]).join(' ')}</b>`;
}
function warmTargetEffects() {
  if(targetEffectsWarmed)return;
  targetEffectsWarmed=true;
  for(const name of TARGET_EFFECT_TEXTURES){
    const texture=new Image();texture.decoding='async';texture.src=`assets/kenney-effects/${name}.png`;
    if(texture.decode)texture.decode().catch(()=>{});
  }
}
function targetEffect(id,kind,tier='normal',role='impact') {
  const portrait=$(id).querySelector('.portrait-ring'),p=point(portrait),visual=targetEffectVisual(kind);
  const node=fxNode(`target-fx kind-${kind} tier-${tier} fx-${role}`,p,reducedMotion?440:370);
  node.dataset.fxTarget=id;node.dataset.fxKind=kind;
  const ratio=tier==='heavy'?1.24:tier==='linked'?1.14:1.06;
  node.style.setProperty('--fx-size',`${Math.round(Math.max(84,Math.min(160,portrait.offsetWidth*ratio)))}px`);
  node.style.setProperty('--fx-mask',`url('assets/kenney-effects/${visual.texture}.png')`);
  node.innerHTML=`<span class="fx-sprite fx-wave"></span><span class="fx-sprite fx-core"></span>${visual.emblem?`<span class="fx-emblem">${icon(visual.emblem)}</span>`:''}`;
}
function aura(id,kind) {targetEffect(id,kind,'normal','support');}
function impact(id,heavy,kind='claw',tier='normal',stopMs=0) {
  $(id).classList.remove(heavy?'hit':'heavy-hit');
  playClass($(id),heavy?'heavy-hit':'hit',(heavy?460:380)+stopMs);
  if(stopMs)playClass($(id),'hit-stop',stopMs);
  if(!reducedMotion)playClass($('battlefield'),heavy?'shake-heavy':'shake',heavy?320:240);
  targetEffect(id,kind,tier);
}
function landCard(actor) {
  const slot=$(`${actor}-active-card`);
  if(!reducedMotion){
    playClass(slot,'card-slam',180);
  }
  sound('slam');
}
function beginStep() {
  if(state.phase!=='battle'||modalOpen()||document.hidden)return;
  clearEffects();presentedCard=null;renderBattle();
  const actor=state.battle.actor,fighter=state.battle[actor],instance=fighter.draw[0],timing=presentationTiming(speed,reducedMotion);
  $('battlefield').dataset.caster=actor;$('battlefield').dataset.presentation='draw';
  $('battle-caption').classList.remove('has-link');$('battle-caption').classList.add('card-cast-title');
  if(!instance){presentedCard={actor,type:'shuffle'};renderActive(presentedCard);$('battle-caption').textContent=`${actor==='player'?'내':'상대'} 덱 재섞기`;later(resolveStep,timing.reveal);return;}
  const card=describeCard(instance),charged=Math.min(card.cost,instance.charge+fighter.energy),ready=charged>=card.cost;
  presentedCard={cardId:instance.id,tier:instance.tier,name:card.name,actor,charged,preview:true,ready};renderActive(presentedCard);
  $(`${actor}-active-card`).classList.add('is-playing');
  $('battle-caption').textContent=`${actor==='player'?'내':'상대'} ${card.name}, ${ready?'사용 준비':`충전 ${charged}/${card.cost}`}`;
  playClass($(`${actor}-draw-pile`),'drawing',timing.draw);sound('draw');
  later(()=>{
    $('battlefield').dataset.presentation='showcase';playClass($(`${actor}-active-card`),'dealing',300);
    later(()=>{
      $('battlefield').dataset.presentation='cast';
      if(ready){
        landCard(actor);
        later(()=>{
          playClass($(actor==='player'?'hero':'enemy'),'casting',340);
          // Keep a short anticipation beat; effects begin at the resolved recipient only.
          sound('cast');later(resolveStep,timing.travel);
        },timing.contact);
      } else {
        later(resolveStep,timing.travel);
      }
    },timing.reveal);
  },timing.draw);
}
function showImpactBeat(beat,event,health) {
  const targetId=beat.target==='player'?'hero':'enemy',sourceId=beat.actor==='player'?'hero':'enemy';
  const kind=targetImpactKind(beat,CARDS[event.cardId]);
  const feedback=impactFeedback(beat,reducedMotion),heavy=feedback.heavy;
  health[beat.target].hp=Math.max(0,health[beat.target].hp-beat.damage);
  if(beat.kind==='reaction')health[beat.actor].hp=Math.min(health[beat.actor].maxHp,health[beat.actor].hp+event.reactionHeal);
  renderHealth(health);
  $('battlefield').dataset.presentation='impact';$('battlefield').dataset.beat=String(beat.index+1);
  if(kind)impact(targetId,heavy,kind,feedback.tier,feedback.stopMs);
  if(!reducedMotion&&(beat.damage||beat.absorbed)){
    $('effects').querySelectorAll('.damage-float[data-damage-target]').forEach(node=>{if(node.dataset.damageTarget===targetId)node.remove();});
    if(beat.damage){floatText(`−${beat.damage}`,targetId,heavy?'critical':kind==='poison'?'poison':'',beat.index);$('effects').lastElementChild.dataset.damageTarget=targetId;}
    else if(beat.absorbed){floatText(`${beat.absorbed}`,targetId,'block',beat.index);$('effects').lastElementChild.dataset.damageTarget=targetId;}
    if(beat.damage&&beat.absorbed)effectChip(`보호막 −${beat.absorbed}`,targetId,'shield');
  }
  if(beat.kind==='counter')playClass($(sourceId),'countering',600);
  if(beat.kind==='burn')effectLater(()=>effectChip(`버림 화상 ${beat.rawDamage}`,targetId,'burn',1),0);
  if(beat.kind==='reaction'){
    playClass($(sourceId),'reacting',600);
    if(event.reactionHeal){aura(sourceId,'heal');floatText(`+${event.reactionHeal}`,sourceId,'heal');sound('heal');}
  }
  if(beat.damage||beat.absorbed)sound(beat.absorbed&&!beat.damage?'shield':heavy?'heavy':kind);
}
function resolveStep() {
  if(state.phase!=='battle'||modalOpen()||document.hidden)return;
  clearEffects();
  const before=state.battle,health={player:{hp:before.player.hp,maxHp:before.player.maxHp},enemy:{hp:before.enemy.hp,maxHp:before.enemy.maxHp}};
  const event=stepBattle(state),timing=presentationTiming(speed,reducedMotion);
  presentedCard=event;
  render();save();
  health[event.actor].hp=Math.min(health[event.actor].maxHp,health[event.actor].hp+event.heal);renderHealth(health);
  const sourceId=event.actor==='player'?'hero':'enemy',targetId=event.actor==='player'?'enemy':'hero';
  $('battlefield').dataset.caster=event.actor;$('battlefield').dataset.presentation='impact';
  $(`${event.actor}-active-card`).classList.add('is-playing');
  for(const side of ['player','enemy']){
    $(`${side}-lane`).dataset.active=String(side===event.actor);
    $(side==='player'?'hero':'enemy').dataset.active=String(side===event.actor);
    $(`${side}-turn-label`).textContent=side===event.actor?(side==='player'?'내 차례':'상대 차례'):'';
  }
  $('battle-turn').textContent=`${event.turn}턴`;
  const beats=impactBeats(event,timing.impactGap);
  for(const beat of beats)if(beat.delay)effectLater(()=>showImpactBeat(beat,event,health),beat.delay);else showImpactBeat(beat,event,health);
  if(reducedMotion)for(const total of impactTotals(beats)){
    const id=total.target==='player'?'hero':'enemy';
    if(total.damage)floatText(`−${total.damage}`,id,total.damage>=18?'critical':'');
    else if(total.absorbed)floatText(`${total.absorbed}`,id,'block');
    if(total.damage&&total.absorbed)effectChip(`보호막 −${total.absorbed}`,id,'shield');
  }
  const lastBeat=beats.at(-1)?.delay||0;
  const directSupport=event.type==='card';
  if(directSupport){
    let ownChip=0;
    if(event.cardType==='form'){aura(sourceId,'form');if(event.formBefore!==event.formAfter)playClass($(sourceId),'morph',800);sound('form');}
    if(event.shield){aura(sourceId,'shield');effectChip(`보호막 +${event.shield}`,sourceId,'shield',ownChip++);if(!beats.length)sound('shield');}
    if(event.heal){aura(sourceId,'heal');floatText(`+${event.heal}`,sourceId,'heal');if(!beats.length)sound('heal');}
    const supplied=event.energyGained-event.energyRecovered;
    if(supplied>0){aura(sourceId,'energy');effectChip(`기력 +${supplied}`,sourceId,'energy',ownChip++);if(!beats.length)sound('energy');}
    if(event.nextCharged){aura(sourceId,'charge');effectChip(`다음 충전 +${event.nextCharged}`,sourceId,'charge',ownChip++);}
    let targetChip=0;
    for(const [key,label] of [['poison','맹독'],['burn','화상'],['shock','감전']])if(event[key]){
      const statusKind={burn:'fire',shock:'shock',poison:'poison'}[key];
      if(!beats.some(beat=>beat.target===event.target&&beat.delay===0&&targetImpactKind(beat,CARDS[event.cardId])===statusKind))targetEffect(targetId,statusKind,'normal','status');
      effectChip(`${label} +${event[key]}`,targetId,key,targetChip++);
    }
  }
  const lead=event.links?.find(link=>link.kind==='form')||event.links?.[0];
  $('battle-caption').textContent=`${event.actor==='player'?'내':'상대'} ${event.name||'재섞기'}${event.type==='charge'?`, 충전 ${event.charged}/${event.cost}`:lead?`, ${lead.name}`:''}`;
  if(lead?.kind==='form')effectLater(()=>floatText(lead.name,lead.actor==='player'?'hero':'enemy','synergy'),lastBeat);
  const discardedBurn=beats.find(beat=>beat.kind==='burn');
  if(discardedBurn){
    const label=discardedBurn.damage?`버림 화상 −${discardedBurn.damage}`:`화상 방어 ${discardedBurn.absorbed}`;
    $('battle-caption').textContent+=` · ${label}`;
  }
  if(event.fatigue)$('battle-caption').textContent+=` · 피로 ${event.fatigue}`;
  const duration=lastBeat;
  effectLater(()=>{renderHealth(state.battle);$('battlefield').dataset.presentation='settle';presentedCard=null;for(const actor of ['player','enemy'])renderActive({actor,type:'waiting'});},duration+160);
  const hold=lead?.kind==='form'||event.cardType==='form'?timing.formSettle:timing.settle;
  later(state.phase==='battle'?beginStep:showPhase,duration+hold);
}
function showPhase() {
  if (document.hidden || modalOpen()) return;
  if (state.phase === 'reward') {
    $('rewards').innerHTML=state.rewards.map(reward=>{const card=describeCard(reward.cardId);return `<button class="reward" data-reward="${reward.id}" aria-label="${card.name} 선택, 기력 ${card.cost}, ${card.text}${card.linkText?`, ${card.linkText}`:''}"><span class="${cardArtClass(card)}"></span><span><strong>${card.name}</strong>${symbolsMarkup(card)}</span><span class="reward-cost" aria-label="기력 비용 ${card.cost}">${card.cost}</span></button>`;}).join('');
    $('reward-note').innerHTML=`${icon('coin')}+${state.collection.length>=36?9:6} ${icon('heart')}+18`;
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
  state=createRun(); activeTab='deck'; detail=null; presentedCard=null;
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
listen($('deck-combos'),'click',event=>{const button=event.target.closest('[data-link-card]');if(button)showCard('owned',button.dataset.linkCard);});
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
  closeDialog('card-dialog'); if(button.dataset.action==='buy'){activeTab='bench';renderCamp();toast('보관함에 추가했습니다. 덱에 넣어보세요.');}
});
listen($('launch'),'click',()=>{
  const result=startBattle(state);if(!result.ok)return toast(result.error);
  presentedCard=null;render();save();enableAudio();
  $('battle-caption').textContent=`${state.battle.actor==='player'?'내 덱':'상대 덱'}이 먼저 시작합니다`;
  later(beginStep,600/speed);
});
listen($('speed'),'click',()=>{speed=speed===1?2:speed===2?4:1;savePrefs();$('speed').innerHTML=`${icon('speed')}<span>×${speed}</span>`;});
listen($('battlefield'),'click',event=>{const card=event.target.closest('[data-inspect-card]'),form=event.target.closest('[data-inspect-form]');if(card)inspectBattleCard(card.dataset.inspectCard,Number(card.dataset.inspectTier));else if(form)inspectForm(form.dataset.inspectForm);});
listen($('opponent-cards'),'click',event=>{const card=event.target.closest('[data-inspect-card]');if(card)inspectBattleCard(card.dataset.inspectCard,Number(card.dataset.inspectTier));});
listen($('sound'),'click',()=>{const fighting=state.phase==='battle';if(fighting)stopLoop();soundEnabled=!soundEnabled;savePrefs();if(soundEnabled){void enableAudio();sound('soft');}else stopAudio();render();if(fighting)resume();});
listen($('help'),'click',()=>showDialog('help-dialog'));
listen($('inspect-opponent'),'click',showOpponent);
listen($('pause-opponent'),'click',()=>{$('pause-dialog').close();showOpponent();});
listen($('pause'),'click',()=>showDialog('pause-dialog'));
listen($('battle-pause'),'click',()=>showDialog('pause-dialog'));
listen($('begin'),'click',()=>closeDialog('welcome-dialog'));
listen($('restart'),'click',()=>{$('pause-dialog').close();showDialog('restart-dialog');});
listen($('confirm-restart'),'click',newRun);listen($('play-again'),'click',newRun);
listen($('rewards'),'click',event=>{const button=event.target.closest('[data-reward]');if(!button)return;const result=chooseReward(state,button.dataset.reward);if(!result.ok)return toast(result.error);$('reward-dialog').close();presentedCard=null;activeTab='deck';render();save();$('collection').scrollTop=0;toast(result.converted ? '보관 한도 · 골드 +9 · 생명 +18' : '새 카드 · 골드 +6 · 생명 +18');});
document.querySelectorAll('[data-close]').forEach(button=>listen(button,'click',()=>closeDialog(button.dataset.close)));
document.querySelectorAll('dialog').forEach(dialog=>listen(dialog,'cancel',event=>{event.preventDefault();if(['welcome-dialog','reward-dialog','result-dialog'].includes(dialog.id))return;closeDialog(dialog.id);}));
listen(document,'visibilitychange',()=>{if(document.hidden){stopLoop();stopAudio();save();}else if(!modalOpen())showDialog('pause-dialog');});
listen(window,'pagehide',event=>{stopLoop();stopAudio();save();clearTimeout(toastTimer);if(!event.persisted){lifetime.abort();audioContext?.close().catch(()=>{});}});
listen(window,'pageshow',event=>{if(event.persisted){render();if(!modalOpen())showDialog('pause-dialog');}});
render();save();
if(!hadSave)showDialog('welcome-dialog');else if(state.phase==='battle')showDialog('pause-dialog');else showPhase();
