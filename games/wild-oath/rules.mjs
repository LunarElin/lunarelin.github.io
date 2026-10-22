// Pure, serializable deckbuilding and automatic combat rules for Wild Oath.
export const FORMS = Object.freeze({
  druid: { name: '드루이드', color: '#b4d7bb', rule: '변신 카드가 나오면 모습과 규칙 변경', detail:'변신 카드가 발동하면 해당 모습의 고유 규칙이 이후 카드에 적용됩니다.', label: '자연' },
  wolf: { name: '늑대', color: '#9ccce7', rule: '기력 카드로 연타 유지 · 세 번째 공격 추격', detail:'연속 공격은 앞선 공격당 피해 +2, 최대 +4를 얻습니다. 기력 카드는 연타를 유지하며, 세 번째 공격 카드마다 피해 타격을 한 번 추가합니다. 추가 타격은 카드의 상태 이상이나 기력을 다시 발동하지 않습니다. 방어·회복·변신·충전 실패·재섞기는 연타를 끊습니다.', label: '연타 · 추격' },
  bear: { name: '곰', color: '#f3c87f', rule: '방어 +3 · 막은 공격에 반격', detail:'방어 카드의 보호막 +3, 공격 시 남은 보호막 4마다 피해 +1입니다. 상대 공격을 보호막으로 막으면 막은 양의 절반을 올림하여 최대 6 피해로 한 번 반격합니다. 관통 공격에는 반격하지 않으며, 반격이 다시 반격을 일으키지 않습니다.', label: '수호 · 반격' },
  wyvern: { name: '와이번', color: '#87edb9', rule: '공격 관통 · 독성 폭발로 생명 회복', detail:'공격이 보호막을 관통하고 공격 카드마다 맹독 2를 더합니다. 이미 맹독에 걸린 적에게 화상이나 감전을 거는 카드는 기존 맹독을 최대 4 소모하여 소모량의 두 배만큼 관통 반응 피해를 주고 소모량만큼 생명을 회복합니다. 폭발과 회복은 카드당 한 번이며, 회복은 최대 생명을 넘지 않습니다.', label: '관통 · 폭발 회복' },
});
const definitions = [
  ['claw', '야생의 발톱', 1, 'attack', 'wolf', { damage: 6 }, '피해 6', 3],
  ['bite', '대지 강타', 2, 'attack', 'bear', { damage: 11, shieldDamageBonus: 5 }, '피해 11', 4],
  ['bark', '나무껍질', 1, 'defense', 'forest', { shield: 9, focus: 2 }, '보호막 9', 3],
  ['mend', '숲의 숨결', 1, 'heal', 'druid', { heal: 6 }, '생명 6 회복', 3],
  ['sap', '생명의 수액', 0, 'energy', 'forest', { energy: 2 }, '기력 +2', 4],
  ['wolf', '달빛 늑대', 0, 'form', 'wolf', { form: 'wolf', energy: 1 }, '늑대 변신 · 기력 +1', 4],
  ['bear', '바위 곰', 0, 'form', 'bear', { form: 'bear', shield: 6 }, '곰 변신 · 보호막 6', 4],
  ['wyvern', '비취 와이번', 0, 'form', 'wyvern', { form: 'wyvern', poison: 2 }, '와이번 변신 · 맹독 2', 4],
  ['venom', '맹독 송곳니', 2, 'attack', 'wyvern', { damage: 4, poison: 4, poisonBonus: 3 }, '피해 4 · 맹독 4', 5],
  ['thorns', '불타는 가시', 2, 'defense', 'bear', { shield: 7, burn: 2 }, '보호막 7 · 화상 2', 5],
  ['storm', '폭풍의 씨앗', 2, 'attack', 'wyvern', { damage: 3, shock: 3, burnShockBonus: 3 }, '피해 3 · 감전 3', 5],
  ['pounce', '쌍발톱', 1, 'attack', 'wolf', { damage: 4, hits: 2, poisonHitBonus: 2 }, '피해 4 × 2', 5],
  ['ancient', '고대의 격노', 4, 'attack', 'bear', { damage: 24, focusMultiplier: 2 }, '피해 24 · 기력 충전 필요', 6],
  ['moonwell', '달빛 샘', 2, 'heal', 'druid', { heal: 8, energy: 1 }, '생명 8 회복 · 기력 +1', 5],
  ['frost', '서리 발톱', 1, 'attack', 'wolf', { damage: 5, shield: 3 }, '피해 5 · 보호막 3', 5],
  ['wildheart', '고목의 심장', 3, 'defense', 'druid', { shield: 12, heal: 5 }, '보호막 12 · 생명 5 회복', 6],
  ['ember', '잿불 가시', 1, 'attack', 'bear', { damage: 2, burn: 4 }, '', 4],
  ['nettle', '독쐐기풀', 1, 'attack', 'wyvern', { damage: 3, poison: 3 }, '', 4],
  ['static', '번개 가지', 1, 'attack', 'wyvern', { damage: 2, shock: 4 }, '', 4],
  ['harvest', '숲의 양분', 1, 'energy', 'forest', { energy: 3, heal: 2, shockEnergyBonus: 1 }, '', 5],
  ['sprout', '새싹 이슬', 0, 'heal', 'druid', { heal: 3 }, '', 3],
  ['hide', '굳은 가죽', 0, 'defense', 'bear', { shield: 4 }, '', 3],
  ['trample', '산사태', 3, 'attack', 'bear', { damage: 16, shield: 4 }, '', 6],
  ['talon', '바람 송곳', 2, 'attack', 'wyvern', { damage: 9, pierce: true }, '', 5],
  ['renewal', '생명의 고리', 2, 'heal', 'druid', { heal: 10, shield: 5 }, '', 5],
  ['kindle', '불씨 수액', 0, 'energy', 'forest', { energy: 1, burn: 2 }, '', 4],
  ['rally', '야생의 신호', 1, 'energy', 'wolf', { chargeNext: 2, focus: 4 }, '', 4],
  ['harry', '기력 사냥', 2, 'attack', 'wolf', { damage: 7, deenergize: 2 }, '', 5],
];
export const CARDS = Object.freeze(Object.fromEntries(definitions.map(([id,name,cost,type,art,effect,text,price]) => [id, { id,name,cost,type,art,text,price,...effect }])));
export const ENCOUNTERS = Object.freeze([
  { name: '가시숲 파수꾼', subtitle: '안개숲', hp: 70, art: 'enemy' },
  { name: '황혼의 사냥꾼', subtitle: '황혼의 길', hp: 70, art: 'enemy' },
  { name: '철갑 뿌리거인', subtitle: '뿌리 미궁', hp: 70, art: 'enemy' },
  { name: '타락한 숲지기', subtitle: '타락한 성소', hp: 70, art: 'enemy' },
  { name: '달그늘 군주', subtitle: '달그늘 성소', hp: 70, art: 'enemy' },
]);
export const DECK_MIN = 6;
export const DECK_MAX = 18;
export const EVENTS = Object.freeze({
  gift: {title:'정령의 선물',description:'정령이 건네는 세 장의 카드',art:'druid',rewardLabel:'1장 선택 · 1등급',costLabel:'무료',total:1,tier:1},
  thicket: {title:'가시덤불',description:'가시를 헤치고 얻는 선물',art:'forest',rewardLabel:'2번 선택 · 각 1장',costLabel:'생명 −6',total:2,tier:1},
  spring: {title:'숲의 샘',description:'지친 몸을 쉬어갈 곳',art:'forest',rewardLabel:'회복 12 · 골드 +3',costLabel:'무료',total:0,tier:1},
  merchant: {title:'떠돌이 상인',description:'골드로 얻는 강화 카드',art:'druid',rewardLabel:'1장 선택 · 2등급',costLabel:'골드 −4',total:1,tier:2},
});
const SHOP_POOL = Object.keys(CARDS);
const ARCHETYPES = ['wolf','bear','wyvern'];
const START_ROLES = ['form','attack','defense','energy','attack','heal','all','all'];
const fail = error => ({ ok: false, error });
const integer = (value, min = 0, max = 1000000) => Number.isInteger(value) && value >= min && value <= max;
function random(state) { state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0; return state.seed / 4294967296; }
function shuffled(state, cards) { const result = [...cards]; for (let i=result.length-1;i>0;i--) { const j=Math.floor(random(state)*(i+1)); [result[i],result[j]]=[result[j],result[i]]; } return result; }
function addOwned(state, id, inDeck = false, tier = 1) { const card = { uid: `c${state.nextUid++}`, id, tier, inDeck, sticker: 'none' }; state.collection.push(card); return card; }
function gainCard(state,id,tier=1) {
  if(state.collection.length>=36) {state.gold+=3;return {card:null,converted:true};}
  return {card:addOwned(state,id,activeDeck(state).length<DECK_MAX,tier),converted:false};
}
function draftPool(draft) {
  const role=draft.kind==='start'?START_ROLES[draft.picked]:'all';
  return SHOP_POOL.filter(id=>(role==='all'||CARDS[id].type===role)&&(role!=='attack'||CARDS[id].cost<=2)&&(role!=='energy'||CARDS[id].energy>0));
}
function newDraftOffers(state) {
  const draft=state.draft,context=draft.kind==='start'?'start':`event-${state.stage}`;
  return shuffled(state,draftPool(draft)).slice(0,3).map((id,index)=>({uid:`d-${context}-${draft.picked}-${index}`,id,tier:draft.tier}));
}
function eligibleEvents(state) {return Object.keys(EVENTS).filter(id=>id!=='thicket'||state.hp>6).filter(id=>id!=='merchant'||state.gold>=4);}
function enterExplore(state) {
  state.phase='explore';state.draft=null;state.battle=null;state.shop=[];state.opponent=null;
  state.exploration={stage:state.stage,offers:shuffled(state,eligibleEvents(state)).slice(0,2).map((eventId,index)=>({uid:`x${state.stage}-${index}`,eventId})),resolved:false,selectedUid:null};
}
function enterCamp(state) {state.phase='camp';state.draft=null;state.shop=newShop(state);state.opponent=newOpponent(state);}
function newShop(state) { return shuffled(state, SHOP_POOL).slice(0,3).map((id,index)=>({uid:`o${state.stage}-${index}`,id,price:CARDS[id].price})); }
function newOpponent(state) {
  const archetype=ARCHETYPES[(state.stage+Math.floor(random(state)*3))%3];
  const count=[8,10,11,12,14][state.stage], ids=[archetype,'claw','bark','sap','mend','bite'];
  const favored=SHOP_POOL.filter(id=>CARDS[id].art===archetype && CARDS[id].type!=='form');
  const pool=[...SHOP_POOL,...favored,...favored];
  while(ids.length<count) ids.push(pool[Math.floor(random(state)*pool.length)]);
  const deck=ids.map((id,index)=>({uid:`e${index+1}`,id,tier:1,inDeck:true,sticker:index===0?'top':'none'}));
  // These are ordinary card upgrades and sorting marks available to the player too.
  if(state.stage>=2) deck.at(-1).sticker='bottom';
  if(state.stage>=3) for(let index=1;index<=state.stage-2;index++) deck[index].tier=2;
  return {stage:state.stage,archetype,deck};
}
export function enemyDeck(state) { return state.opponent?.deck||[]; }
export function createRun(seed=Date.now()) {
  const state = { version: 5, seed: Number(seed)>>>0, phase: 'draft', stage: 0, gold: 10, hp: 70, maxHp: 70, nextUid: 1, collection: [], shop: [], opponent:null, rewards: [], battle: null, draft:{kind:'start',title:'첫 서약',picked:0,total:8,tier:1,offers:[]},exploration:null,stats: { cards: 0, damage: 0, blocked: 0, shifts: 0, victories: 0, turns: 0, shuffles: 0, charged: 0 } };
  state.draft.offers=newDraftOffers(state);return state;
}
export function activeDeck(state) { return state.collection.filter(card=>card.inDeck); }
export function chooseDraft(state,offerUid) {
  if(state.phase!=='draft'||!state.draft)return fail('지금은 카드를 선택할 수 없습니다.');
  const draft=state.draft,offer=draft.offers.find(item=>item.uid===offerUid);
  if(!offer)return fail('이미 지나간 카드 선택입니다.');
  const gained=gainCard(state,offer.id,offer.tier);draft.picked++;
  if(draft.picked===draft.total) {if(draft.kind==='start')enterExplore(state);else enterCamp(state);}
  else draft.offers=newDraftOffers(state);
  return {ok:true,...gained};
}
export function chooseEncounter(state,eventUid) {
  if(state.phase!=='explore'||!state.exploration||state.exploration.resolved)return fail('지금은 탐험을 선택할 수 없습니다.');
  const offer=state.exploration.offers.find(item=>item.uid===eventUid);
  if(!offer)return fail('알 수 없는 탐험입니다.');
  if(!eligibleEvents(state).includes(offer.eventId))return fail('탐험에 필요한 생명이나 금화가 부족합니다.');
  const event=EVENTS[offer.eventId];
  state.exploration.resolved=true;state.exploration.selectedUid=offer.uid;
  if(offer.eventId==='thicket')state.hp-=6;
  if(offer.eventId==='merchant')state.gold-=4;
  if(offer.eventId==='spring') {state.hp=Math.min(state.maxHp,state.hp+12);state.gold+=3;enterCamp(state);}
  else {state.phase='draft';state.draft={kind:'event',title:event.title,picked:0,total:event.total,tier:event.tier,offers:[]};state.draft.offers=newDraftOffers(state);}
  return {ok:true,eventId:offer.eventId};
}
export function describeCard(cardOrId) {
  const instance = typeof cardOrId==='string' ? {id:cardOrId,tier:1} : cardOrId;
  if (!instance || !Object.hasOwn(CARDS,instance.id)) return null;
  const base = CARDS[instance.id], tier = instance.tier || 1, scale = value => value ? value + Math.ceil(value * .5 * (tier-1)) : 0, resource = value => value ? value+tier-1 : 0;
  const card = { ...base, tier, damage:scale(base.damage), shield:scale(base.shield), heal:scale(base.heal), energy:resource(base.energy), poison:scale(base.poison), burn:scale(base.burn), shock:scale(base.shock), hits:base.hits || 1, chargeNext:resource(base.chargeNext), deenergize:resource(base.deenergize), focus:resource(base.focus), poisonHitBonus:resource(base.poisonHitBonus), shieldDamageBonus:base.shieldDamageBonus ? base.shieldDamageBonus+2*(tier-1) : 0, poisonBonus:resource(base.poisonBonus), burnShockBonus:resource(base.burnShockBonus), shockEnergyBonus:resource(base.shockEnergyBonus) };
  const parts = [];
  if (card.form) parts.push(`${FORMS[card.form].name} 변신`);
  if (card.damage) parts.push(`피해 ${card.damage}${card.hits>1?` × ${card.hits}`:''}`);
  if (card.shield) parts.push(`보호막 ${card.shield}`);
  if (card.heal) parts.push(`생명 ${card.heal} 회복`);
  if (card.energy) parts.push(`기력 +${card.energy}`);
  if (card.poison) parts.push(`맹독 ${card.poison}`);
  if (card.burn) parts.push(`화상 ${card.burn}`);
  if (card.shock) parts.push(`감전 ${card.shock}`);
  if (card.pierce) parts.push('보호막 관통');
  if (card.chargeNext) parts.push(`다음 카드 충전 +${card.chargeNext}`);
  if (card.deenergize) parts.push(`상대 기력 −${card.deenergize}`);
  const links = {
    bark: {linkText:`집중 +${card.focus}. 다음 성공한 공격의 첫 타격에 집중만큼 추가 피해를 줍니다. 집중은 최대 12까지 보관합니다.`,linkShort:`집중 +${card.focus}`,linkPartners:['bite','ancient']},
    rally: {linkText:`집중 +${card.focus}. 다음 성공한 공격의 첫 타격에 집중만큼 추가 피해를 줍니다. 집중은 최대 12까지 보관합니다.`,linkShort:`집중 +${card.focus}`,linkPartners:['ancient','pounce']},
    pounce: {linkText:`카드 사용 전 적에게 맹독이 있으면 각 타격의 피해 +${card.poisonHitBonus}.`,linkShort:`맹독이면 타격 +${card.poisonHitBonus}`,linkPartners:['nettle','venom']},
    bite: {linkText:`카드 사용 전 내 보호막이 8 이상이면 첫 타격의 피해 +${card.shieldDamageBonus}.`,linkShort:`보호막 8: 피해 +${card.shieldDamageBonus}`,linkPartners:['bark','hide']},
    venom: {linkText:`카드 사용 전 적에게 맹독이 있으면 맹독을 ${card.poisonBonus} 더 누적합니다.`,linkShort:`맹독이면 독 +${card.poisonBonus}`,linkPartners:['nettle','wyvern']},
    storm: {linkText:`카드 사용 전 적에게 화상이 있으면 감전을 ${card.burnShockBonus} 더 누적합니다.`,linkShort:`화상이면 감전 +${card.burnShockBonus}`,linkPartners:['ember','kindle']},
    harvest: {linkText:`카드 사용 전 적에게 감전이 있으면 기력을 ${card.shockEnergyBonus} 더 얻습니다.`,linkShort:`감전이면 기력 +${card.shockEnergyBonus}`,linkPartners:['storm','static']},
    ancient: {linkText:'보관한 집중을 두 배의 피해로 사용합니다. 집중 추가 피해는 첫 타격에 한 번만 적용합니다.',linkShort:'집중 피해 두 배',linkPartners:['rally','bark']},
  };
  return {...card,text:parts.join(' · '),linkText:'',linkShort:'',linkPartners:[],...links[card.id]};
}
function campOnly(state) { return state.phase==='camp'; }
export function editDeck(state, uid, active) {
  if (!campOnly(state)) return fail('전투 전 야영지에서 덱을 바꿀 수 있습니다.');
  if (typeof active!=='boolean') return fail('잘못된 덱 편집입니다.');
  const card=state.collection.find(item=>item.uid===uid); if(!card) return fail('소유하지 않은 카드입니다.');
  if(card.inDeck===active) return {ok:true};
  const count=activeDeck(state).length;
  if(active && count>=DECK_MAX) return fail(`덱은 최대 ${DECK_MAX}장입니다.`);
  if(!active && count<=DECK_MIN) return fail(`덱은 최소 ${DECK_MIN}장입니다.`);
  card.inDeck=active; if(!active) card.sticker='none'; return {ok:true};
}
export function buyCard(state, offerId) {
  if(!campOnly(state)) return fail('야영지에서 카드를 살 수 있습니다.');
  const index=state.shop.findIndex(offer=>offer.uid===offerId); if(index<0) return fail('이미 사라진 상품입니다.');
  const offer=state.shop[index]; if(state.gold<offer.price) return fail('금화가 부족합니다.');
  if(state.collection.length>=36) return fail('보관함이 가득 찼습니다. 카드를 판매하세요.');
  state.gold-=offer.price; const card=addOwned(state,offer.id); state.shop.splice(index,1); return {ok:true,card};
}
export function sellCard(state, uid) {
  if(!campOnly(state)) return fail('야영지에서 카드를 판매할 수 있습니다.');
  const index=state.collection.findIndex(card=>card.uid===uid); if(index<0) return fail('소유하지 않은 카드입니다.');
  const card=state.collection[index]; if(card.inDeck && activeDeck(state).length<=DECK_MIN) return fail(`출전 덱 ${DECK_MIN}장은 유지해야 합니다.`);
  const gold=card.tier; state.collection.splice(index,1); state.gold+=gold; return {ok:true,gold};
}
function mergePair(state,card,twin) {
  card.tier++; card.inDeck=card.inDeck||twin.inDeck;
  if(card.sticker==='none' && twin.sticker!=='none') card.sticker=twin.sticker;
  state.collection.splice(state.collection.indexOf(twin),1);return card;
}
export function upgradeCard(state, uid) {
  if(!campOnly(state)) return fail('야영지에서 카드를 합성할 수 있습니다.');
  const card=state.collection.find(item=>item.uid===uid); if(!card) return fail('소유하지 않은 카드입니다.');
  if(card.tier>=3) return fail('최대 등급입니다.');
  const twins=state.collection.filter(item=>item.uid!==uid && item.id===card.id && item.tier===card.tier);
  const twin=twins.find(item=>!item.inDeck)||twins[0]; if(!twin) return fail('같은 카드·같은 등급 2장이 필요합니다.');
  if(card.inDeck && twin.inDeck && activeDeck(state).length<=DECK_MIN) return fail(`합성 뒤에도 출전 덱 ${DECK_MIN}장을 유지해야 합니다.`);
  return {ok:true,card:mergePair(state,card,twin)};
}
export function upgradeAll(state) {
  if(!campOnly(state))return fail('야영지에서 카드를 합성할 수 있습니다.');
  let merged=0;const upgraded=new Set();
  while(true) {
    const deckSize=activeDeck(state).length,cards=[...state.collection].sort((a,b)=>Number(a.uid.slice(1))-Number(b.uid.slice(1)));let pair=null;
    for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++) {
      const a=cards[i],b=cards[j];
      if(a.id!==b.id||a.tier!==b.tier||a.tier>=3||(a.inDeck&&b.inDeck&&deckSize<=DECK_MIN)||(a.sticker!=='none'&&b.sticker!=='none'))continue;
      const priority=a.inDeck!==b.inDeck?0:a.inDeck?2:1;
      if(!pair||priority<pair.priority)pair={a,b,priority};
    }
    if(!pair)break;
    const rank=card=>card.sticker==='top'?0:card.sticker==='bottom'?1:card.inDeck?2:3;
    const [card,twin]=rank(pair.a)<=rank(pair.b)?[pair.a,pair.b]:[pair.b,pair.a];
    mergePair(state,card,twin);upgraded.add(card.uid);merged++;
  }
  return {ok:true,merged,upgraded:state.collection.filter(card=>upgraded.has(card.uid)).map(({uid,id,tier})=>({uid,id,tier}))};
}
export function setSticker(state, uid, sticker) {
  if(!campOnly(state)) return fail('야영지에서 정렬 표식을 바꿀 수 있습니다.');
  if(!['none','top','bottom'].includes(sticker)) return fail('알 수 없는 정렬 표식입니다.');
  const card=state.collection.find(item=>item.uid===uid); if(!card || !card.inDeck) return fail('출전 중인 카드에 표식을 붙이세요.');
  if(sticker!=='none') state.collection.forEach(item=>{if(item.sticker===sticker)item.sticker='none';});
  card.sticker=sticker; return {ok:true};
}
function ordered(state,cards) {
  const mixed=shuffled(state,cards);
  return [...mixed.filter(c=>c.sticker==='top'),...mixed.filter(c=>!c.sticker||c.sticker==='none'),...mixed.filter(c=>c.sticker==='bottom')];
}
function fighter(name,hp,draw) { return {name,hp,maxHp:70,shield:0,energy:4,form:'druid',poison:0,burn:0,shock:0,combo:0,focus:0,draw,discard:[]}; }
export function startBattle(state) {
  if(!campOnly(state)) return fail('이미 전투 중입니다.');
  const cards=activeDeck(state); if(cards.length<DECK_MIN || cards.length>DECK_MAX) return fail(`덱은 ${DECK_MIN}~${DECK_MAX}장이어야 합니다.`);
  const encounter=ENCOUNTERS[state.stage];
  const playerCards=cards.map(card=>({...card,charge:0}));
  const enemyCards=enemyDeck(state).map(card=>({...card,charge:0}));
  state.battle={turn:1,turnCard:0,actor:playerCards.length>=enemyCards.length?'player':'enemy',player:fighter('드루이드',state.hp,ordered(state,playerCards)),enemy:fighter(encounter.name,state.maxHp,ordered(state,enemyCards))};
  state.phase='battle'; state.rewards=[]; return {ok:true};
}
function hit(target,amount,{pierce=false,poison=false}={}) {
  amount=Math.max(0,amount); const absorbed= pierce ? 0 : Math.min(amount,poison?Math.ceil(target.shield/2):target.shield);
  const shieldLost=pierce?0:Math.min(target.shield,poison?amount*2:amount); target.shield-=shieldLost;
  const damage=Math.min(target.hp,amount-absorbed); target.hp-=damage; return {damage,absorbed,shieldLost};
}
function gainEnergy(fighter,target,amount,event) {
  if(!amount)return; const gain=Math.min(30-fighter.energy,amount); fighter.energy+=gain; event.energyGained+=gain;
  if(gain>0 && target.shock>0) { const result=hit(target,target.shock); event.shockDamage+=result.damage; event.shockAbsorbed+=result.shieldLost; target.shock=Math.max(0,target.shock-1); }
}
function finishBattle(state) {
  const {player,enemy}=state.battle;
  state.hp=player.hp;
  if(enemy.hp<=0 && player.hp>0) {
    state.stats.victories++;
    if(state.stage===ENCOUNTERS.length-1) {state.phase='won';state.gold+=10;}
    else {
      state.phase='reward';
      state.rewards=shuffled(state,SHOP_POOL).slice(0,3).map((cardId,index)=>({id:`r${state.stage}-${index}`,cardId,name:CARDS[cardId].name,text:describeCard(cardId).text}));
    }
    return 'victory';
  }
  if(player.hp<=0) { state.phase='lost'; return 'defeat'; }
  return null;
}
export function stepBattle(state) {
  if(state.phase!=='battle' || !state.battle) return {type:'idle'};
  const battle=state.battle, actor=battle.actor, other=actor==='player'?'enemy':'player', source=battle[actor], target=battle[other];
  const event={type:'card',actor,target:other,turn:battle.turn,turnCard:battle.turnCard,turnEnded:false,formBefore:source.form,formAfter:source.form,damage:0,rawDamage:0,absorbed:0,shield:0,heal:0,poison:0,burn:0,shock:0,energySpent:0,energyGained:0,energyRecovered:0,charged:0,cost:0,nextCharged:0,deenergized:0,poisonDamage:0,burnDamage:0,shockDamage:0,shockAbsorbed:0,focusGained:0,focusSpent:0,extraHits:0,counterDamage:0,counterAbsorbed:0,counterRawDamage:0,reactionDamage:0,reactionRawDamage:0,reactionConsumed:0,reactionHeal:0,links:[],fatigue:0,critical:false};
  const link=(name,text,kind='card',owner=actor)=>event.links.push({name,text,kind,actor:owner});
  if(!source.draw.length) {
    source.draw=ordered(state,source.discard); source.discard=[]; source.combo=0;
    event.type='shuffle'; event.turnEnded=true; state.stats.shuffles++;
    if(source.poison>0) { const result=hit(source,source.poison,{poison:true}); event.poisonDamage=result.damage; event.poisonAbsorbed=result.shieldLost; source.poison=Math.floor(source.poison/2); }
  } else {
    const instance=source.draw.shift(), card=describeCard(instance);
    Object.assign(event,{cardId:card.id,uid:instance.uid,name:card.name,cardType:card.type,cost:card.cost,tier:instance.tier,turnCard:++battle.turnCard});
    const needed=Math.max(0,card.cost-instance.charge), spend=Math.min(needed,source.energy);
    source.energy-=spend; instance.charge+=spend; event.energySpent=spend; event.charged=instance.charge;
    source.discard.push(instance);
    if(instance.charge<card.cost) {
      event.type='charge'; event.turnEnded=true; source.combo=0; state.stats.charged++;
      if(source.burn>0) { const result=hit(source,source.burn); event.burnDamage=result.damage; event.burnAbsorbed=result.shieldLost; source.burn--; }
    } else {
      instance.charge=0;
      const before={shield:source.shield,poison:target.poison,burn:target.burn,shock:target.shock,combo:source.combo};
      if(card.form) { if(source.form!==card.form && actor==='player') state.stats.shifts++; source.form=card.form; event.formAfter=source.form; }
      const attack=card.type==='attack';
      let damage=card.damage;
      if(attack && source.form==='wolf') damage+=Math.min(source.combo,2)*2;
      if(attack && source.form==='bear') damage+=Math.floor(source.shield/4);
      if(attack)source.combo++;
      else if(!(source.form==='wolf'&&card.type==='energy'))source.combo=0;
      if(attack&&source.form==='wolf'&&source.combo%3===0){event.extraHits=1;link('늑대 추격','추가 타격 1회','form');}
      if(card.poisonHitBonus&&before.poison>0){damage+=card.poisonHitBonus;link('맹독 사냥',`타격마다 피해 +${card.poisonHitBonus}`);}
      const shieldBonus=card.shieldDamageBonus&&before.shield>=8?card.shieldDamageBonus:0;
      if(shieldBonus)link('보호막 강타',`피해 +${shieldBonus}`);
      event.focusSpent=attack?source.focus:0;
      const focusBonus=event.focusSpent*(card.focusMultiplier||1);
      if(event.focusSpent){source.focus=0;link(card.focusMultiplier?'집중 강타':'집중 발동',`피해 +${focusBonus}`);}
      for(let i=0;i<card.hits+event.extraHits;i++) {
        const amount=damage+(i===0?shieldBonus+focusBonus:0);
        const result=hit(target,amount,{pierce:card.pierce||(attack&&source.form==='wyvern')});
        event.damage+=result.damage; event.absorbed+=result.shieldLost; event.rawDamage+=amount;
      }
      let shield=card.shield+(card.type==='defense'&&source.form==='bear'?3:0);
      event.shield=shield; source.shield+=shield;
      event.heal=Math.min(source.maxHp-source.hp,card.heal); source.hp+=event.heal;
      source.burn=Math.max(0,source.burn-Math.floor(event.heal/10));
      const poisonBonus=card.poisonBonus&&before.poison>0?card.poisonBonus:0;
      if(poisonBonus)link('맹독 증폭',`맹독 +${poisonBonus}`);
      event.poison=card.poison+poisonBonus+(attack&&source.form==='wyvern'?2:0); target.poison+=event.poison;
      event.burn=card.burn;target.burn+=card.burn;
      const shockBonus=card.burnShockBonus&&before.burn>0?card.burnShockBonus:0;
      if(shockBonus)link('화염 전도',`감전 +${shockBonus}`);
      event.shock=card.shock+shockBonus;target.shock+=event.shock;
      event.focusGained=Math.min(12-source.focus,card.focus);source.focus+=event.focusGained;
      if(event.focusGained)link('집중 준비',`집중 +${event.focusGained}`);
      event.deenergized=Math.min(target.energy,card.deenergize);target.energy-=event.deenergized;
      const next=source.draw[0];
      if(next && card.chargeNext) {event.nextCharged=Math.min(card.chargeNext,Math.max(0,CARDS[next.id].cost-next.charge));next.charge+=event.nextCharged;}
      const energyBonus=card.shockEnergyBonus&&before.shock>0?card.shockEnergyBonus:0;
      const actualEnergyBonus=Math.max(0,Math.min(30-source.energy,card.energy+energyBonus)-Math.min(30-source.energy,card.energy));
      gainEnergy(source,target,card.energy+energyBonus,event);
      if(actualEnergyBonus)link('감전 수확',`기력 +${actualEnergyBonus}`);
      if(source.form==='wyvern'&&before.poison>0&&(card.burn||card.shock)){
        event.reactionConsumed=Math.min(4,before.poison);target.poison-=event.reactionConsumed;
        event.reactionRawDamage=event.reactionConsumed*2;
        event.reactionDamage=hit(target,event.reactionRawDamage,{pierce:true}).damage;
        event.reactionHeal=source.hp>0?Math.min(source.maxHp-source.hp,event.reactionConsumed):0;
        source.hp+=event.reactionHeal;
        link('독성 폭발',`맹독 −${event.reactionConsumed} · 피해 ${event.reactionDamage}${event.reactionHeal?` · 회복 ${event.reactionHeal}`:''}`,'form');
      }
      if(attack&&target.form==='bear'&&event.absorbed>0&&source.hp>0&&target.hp>0){
        event.counterRawDamage=Math.min(6,Math.ceil(event.absorbed/2));
        const counter=hit(source,event.counterRawDamage);event.counterDamage=counter.damage;event.counterAbsorbed=counter.shieldLost;
        link('곰 반격',`반격 ${event.counterRawDamage}${event.counterAbsorbed?` · 보호막 피해 ${event.counterAbsorbed}`:` · 생명 피해 ${event.counterDamage}`}`,'form',other);
      }
      event.critical=attack&&(event.rawDamage>=18||event.extraHits>0||event.reactionDamage>=6);
      state.stats.cards++;
      // Successful cards share this turn's resource pool. A depleted pool or
      // exhausted draw pile ends the chain; reshuffling waits for the next turn.
      event.turnEnded=source.energy===0||source.draw.length===0;
    }
  }
  if(source.hp<=0 || target.hp<=0) event.turnEnded=true;
  if(event.turnEnded && source.hp>0 && target.hp>0) {const before=source.energy;gainEnergy(source,target,1,event);event.energyRecovered=source.energy-before;}
  if(event.turnEnded && source.hp>0 && target.hp>0 && battle.turn>40) {
    event.fatigue=Math.min(source.hp,Math.floor((battle.turn-41)/2)+1); source.hp-=event.fatigue;
  }
  if(event.turnEnded) state.stats.turns++;
  if(actor==='player') {state.stats.damage+=event.damage+event.shockDamage+event.reactionDamage;state.stats.blocked+=(event.poisonAbsorbed||0)+(event.burnAbsorbed||0)+event.counterAbsorbed;}
  else {state.stats.damage+=event.poisonDamage+event.burnDamage+event.counterDamage;state.stats.blocked+=event.absorbed+event.shockAbsorbed;}
  const outcome=finishBattle(state);
  if(outcome) event[outcome]=true;
  if(state.phase==='battle' && event.turnEnded) {battle.actor=other;battle.turn++;battle.turnCard=0;}
  event.nextActor=state.phase==='battle'?battle.actor:null;event.nextTurn=battle.turn;
  return event;
}
export function chooseReward(state,id) {
  if(state.phase!=='reward') return fail('지금은 보상을 선택할 수 없습니다.');
  const reward=state.rewards.find(item=>item.id===id);if(!reward)return fail('알 수 없는 보상입니다.');
  const gained=gainCard(state,reward.cardId);
  state.gold+=6;state.hp=Math.min(state.maxHp,state.hp+18);state.stage++;state.rewards=[];enterExplore(state);return {ok:true,...gained};
}
export function serialize(state) { return JSON.stringify(state); }
function validOwned(card) { return card&&/^c[1-9]\d{0,5}$/.test(card.uid)&&Object.hasOwn(CARDS,card.id)&&integer(card.tier,1,3)&&typeof card.inDeck==='boolean'&&['none','top','bottom'].includes(card.sticker)&&(!card.sticker||card.sticker==='none'||card.inDeck); }
function validFighter(body,maxHp) {
  if(!body||!integer(body.maxHp,1,1000)||body.maxHp!==maxHp||!integer(body.hp,0,maxHp)||!integer(body.shield,0,100000)||!integer(body.energy,0,30)||!Object.hasOwn(FORMS,body.form))return false;
  if(!['poison','burn','shock','combo'].every(key=>integer(body[key],0,100000))||!integer(body.focus,0,12)||!Array.isArray(body.draw)||!Array.isArray(body.discard))return false;
  const cards=[...body.draw,...body.discard];
  return cards.length>=DECK_MIN&&cards.length<=DECK_MAX&&new Set(cards.map(c=>c?.uid)).size===cards.length&&cards.every(c=>c&&typeof c.uid==='string'&&Object.hasOwn(CARDS,c.id)&&integer(c.tier,1,3)&&integer(c.charge,0,CARDS[c.id].cost)&&['none','top','bottom'].includes(c.sticker));
}
function validOpponent(opponent,stage) {
  if(!opponent||opponent.stage!==stage||!ARCHETYPES.includes(opponent.archetype)||!Array.isArray(opponent.deck)||opponent.deck.length<DECK_MIN||opponent.deck.length>DECK_MAX)return false;
  if(!opponent.deck.every((card,index)=>card&&card.uid===`e${index+1}`&&Object.hasOwn(CARDS,card.id)&&integer(card.tier,1,3)&&card.inDeck===true&&['none','top','bottom'].includes(card.sticker)))return false;
  return !['top','bottom'].some(sticker=>opponent.deck.filter(card=>card.sticker===sticker).length>1);
}
function validExploration(state) {
  const exploration=state.exploration;
  if(!exploration||exploration.stage!==state.stage||typeof exploration.resolved!=='boolean'||!Array.isArray(exploration.offers)||exploration.offers.length!==2)return false;
  if(!exploration.offers.every((offer,index)=>offer&&offer.uid===`x${state.stage}-${index}`&&Object.hasOwn(EVENTS,offer.eventId))||new Set(exploration.offers.map(offer=>offer.eventId)).size!==2)return false;
  return exploration.resolved?exploration.offers.some(offer=>offer.uid===exploration.selectedUid):exploration.selectedUid===null;
}
function validDraft(state) {
  const draft=state.draft;
  if(!draft||!['start','event'].includes(draft.kind)||!integer(draft.picked,0,7)||!integer(draft.total,1,8)||draft.picked>=draft.total||!Array.isArray(draft.offers)||draft.offers.length!==3)return false;
  if(draft.kind==='start') {
    if(state.stage!==0||draft.title!=='첫 서약'||draft.total!==8||draft.tier!==1||state.exploration!==null||state.collection.length!==draft.picked||state.nextUid!==draft.picked+1||state.gold!==10||state.hp!==70||Object.values(state.stats).some(value=>value!==0))return false;
    if(!state.collection.every((card,index)=>card.uid===`c${index+1}`&&card.tier===1&&card.inDeck&&card.sticker==='none'&&draftPool({kind:'start',picked:index}).includes(card.id)))return false;
  } else {
    if(!validExploration(state)||!state.exploration.resolved)return false;
    const selected=state.exploration.offers.find(offer=>offer.uid===state.exploration.selectedUid),event=EVENTS[selected.eventId];
    if(!event.total||draft.title!==event.title||draft.total!==event.total||draft.tier!==event.tier)return false;
  }
  const context=draft.kind==='start'?'start':`event-${state.stage}`,pool=draftPool(draft);
  return draft.offers.every((offer,index)=>offer&&offer.uid===`d-${context}-${draft.picked}-${index}`&&pool.includes(offer.id)&&offer.tier===draft.tier)&&new Set(draft.offers.map(offer=>offer.id)).size===3;
}
export function restoreRun(raw) {
  try {
    const state=typeof raw==='string'?JSON.parse(raw):JSON.parse(JSON.stringify(raw));
    if(state?.version===4){state.version=5;if(state.battle)for(const actor of ['player','enemy'])if(state.battle[actor])state.battle[actor].focus=0;}
    if(!state||state.version!==5||!['draft','explore','camp','battle','reward','won','lost'].includes(state.phase)||!integer(state.seed,0,4294967295)||!integer(state.stage,0,4)||!integer(state.gold,0,100000)||!integer(state.maxHp,70,70)||!integer(state.hp,0,state.maxHp)||!integer(state.nextUid,1,1000000))return null;
    const starting=state.phase==='draft'&&state.draft?.kind==='start',preCamp=['draft','explore'].includes(state.phase);
    if(!Array.isArray(state.collection)||state.collection.length<(starting?0:DECK_MIN)||state.collection.length>36||!state.collection.every(validOwned)||new Set(state.collection.map(c=>c.uid)).size!==state.collection.length)return null;
    if(state.collection.some(c=>Number(c.uid.slice(1))>=state.nextUid)||activeDeck(state).length<(starting?0:DECK_MIN)||activeDeck(state).length>DECK_MAX)return null;
    if(['top','bottom'].some(sticker=>state.collection.filter(c=>c.sticker===sticker).length>1))return null;
    if(!Array.isArray(state.shop)||state.shop.length>3||!state.shop.every(o=>o&&typeof o.uid==='string'&&new RegExp('^o'+state.stage+'-[0-2]$').test(o.uid)&&Object.hasOwn(CARDS,o.id)&&o.price===CARDS[o.id].price)||new Set(state.shop.map(o=>o.uid)).size!==state.shop.length||new Set(state.shop.map(o=>o.id)).size!==state.shop.length)return null;
    if(!Array.isArray(state.rewards)||!state.stats||!['cards','damage','blocked','shifts','victories','turns','shuffles','charged'].every(key=>integer(state.stats[key],0,1000000)))return null;
    if(state.stats.victories!==state.stage+(['reward','won'].includes(state.phase)?1:0))return null;
    if(state.phase==='draft'?!validDraft(state):state.draft!==null)return null;
    if(!starting&&!validExploration(state))return null;
    if(preCamp) {
      if(state.hp<=0||state.battle!==null||state.rewards.length||state.shop.length||state.opponent!==null)return null;
      if(state.phase==='explore'&&(state.exploration.resolved||!state.exploration.offers.every(offer=>eligibleEvents(state).includes(offer.eventId))))return null;
    } else if(!validOpponent(state.opponent,state.stage)||!state.exploration.resolved)return null;
    if(state.phase==='camp') {if(state.hp<=0||state.battle!==null||state.rewards.length)return null;}
    else if(!preCamp) {
      const battle=state.battle;
      if(!battle||!integer(battle.turn,1,10000)||!integer(battle.turnCard,0,DECK_MAX)||!['player','enemy'].includes(battle.actor)||!validFighter(battle.player,state.maxHp)||!validFighter(battle.enemy,state.maxHp)||battle.player.hp!==state.hp)return null;
      const pCards=[...battle.player.draw,...battle.player.discard], owned=activeDeck(state);
      if(pCards.length!==owned.length||!pCards.every(c=>owned.some(o=>o.uid===c.uid&&o.id===c.id&&o.tier===c.tier&&o.sticker===c.sticker)))return null;
      const enemyCards=[...battle.enemy.draw,...battle.enemy.discard];
      if(enemyCards.length!==enemyDeck(state).length||!enemyCards.every(card=>enemyDeck(state).some(original=>original.uid===card.uid&&original.id===card.id&&original.tier===card.tier&&original.sticker===card.sticker)))return null;
      if(state.phase==='battle'&&(battle.player.hp<=0||battle.enemy.hp<=0||state.rewards.length))return null;
      if(state.phase==='lost'&&(battle.player.hp!==0||state.rewards.length))return null;
      if(['reward','won'].includes(state.phase)&&(battle.player.hp<=0||battle.enemy.hp!==0))return null;
      if(state.phase==='won'&&(state.stage!==4||state.rewards.length))return null;
      if(state.phase==='reward'&&(state.stage===4||state.rewards.length!==3||!state.rewards.every((r,index)=>r&&r.id===`r${state.stage}-${index}`&&Object.hasOwn(CARDS,r.cardId))))return null;
    }
    if(state.phase!=='reward')state.rewards=[];
    else state.rewards=state.rewards.map(r=>({...r,name:CARDS[r.cardId].name,text:describeCard(r.cardId).text}));
    if(state.battle) {state.battle.player.name='드루이드';state.battle.enemy.name=ENCOUNTERS[state.stage].name;}
    return state;
  } catch {return null;}
}
