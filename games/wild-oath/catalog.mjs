import { CARDS, FORMS, describeCard } from './rules.mjs';

const $ = id => document.getElementById(id);
const typeNames = { attack: '공격', defense: '방어', heal: '회복', energy: '기력', form: '변신', support: '지원' };
const cards = Object.values(CARDS);
const state = { tier: 1, query: '', type: 'all', cost: 'all' };
const lifetime = new AbortController();
const listen = (element, event, callback) => element.addEventListener(event, callback, { signal: lifetime.signal });
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const typeName = type => typeNames[type] || type;
const illustration = card => ['wolf','bear','wyvern','druid','forest','enemy'].includes(card.art) ? card.art : 'forest';
const searchText = text => text.toLocaleLowerCase('ko').replace(/\s+/g, '');

for (const type of new Set(cards.map(card => card.type))) {
  const option = node('option', '', typeName(type));
  option.value = type;
  $('type-filter').append(option);
}
for (const cost of [...new Set(cards.map(card => card.cost))].sort((a,b) => a-b)) {
  const option = node('option', '', `${cost} 기력`);
  option.value = String(cost);
  $('cost-filter').append(option);
}

function cardButton(card) {
  const button = node('button', 'catalog-card');
  button.type = 'button';
  button.dataset.cardId = card.id;
  button.dataset.type = card.type;
  const form = card.form ? FORMS[card.form] : null;
  button.setAttribute('aria-label', `${card.name}, 기력 ${card.cost}, ${state.tier}등급. ${card.text}.${card.linkText ? ` 연계: ${card.linkText}.` : ''}${form ? ` 고유 능력: ${form.detail || form.rule}.` : ''} 상세 보기`);
  button.append(node('span', 'card-cost', String(card.cost)));
  button.append(node('span', `card-art art art-${illustration(card)}`));
  button.append(node('strong', 'card-name', card.name));
  const effects = node('span', 'card-effects');
  for (const effect of card.text.split(' · ')) effects.append(node('span', '', effect));
  button.append(effects);
  if (card.linkShort || form) {
    const link = node('span', `card-link${form ? ' form-link' : ''}`);
    link.append(node('b', '', form ? '고유 능력' : '연계'), node('span', '', form ? form.rule : card.linkShort));
    button.append(link);
  }
  const footer = node('span', 'card-footer');
  footer.append(node('span', '', typeName(card.type)), node('span', 'card-stars', '★'.repeat(state.tier)));
  button.append(footer);
  return button;
}

function render() {
  const query = searchText(state.query);
  const filtered = cards.map(card => describeCard({ id: card.id, tier: state.tier })).filter(card =>
    (state.type === 'all' || card.type === state.type) &&
    (state.cost === 'all' || card.cost === Number(state.cost)) &&
    (!query || searchText(`${card.name} ${card.text} ${card.linkText || ''} ${card.linkShort || ''} ${(card.linkPartners || []).map(id=>CARDS[id]?.name || '').join(' ')} ${typeName(card.type)} ${card.form ? `${FORMS[card.form].rule} ${FORMS[card.form].detail || ''}` : ''}`).includes(query))
  );
  const fragment = document.createDocumentFragment();
  for (const card of filtered) fragment.append(cardButton(card));
  if (!filtered.length) {
    const empty = node('div', 'empty-list');
    empty.append(node('p', '', '찾는 카드가 없어요.'));
    const reset = node('button', 'done-button', '필터 초기화');
    reset.type = 'button';
    reset.dataset.reset = 'true';
    empty.append(reset);
    fragment.append(empty);
  }
  $('card-list').replaceChildren(fragment);
  $('card-count').textContent = `${filtered.length} / ${cards.length}종`;
  for (const button of document.querySelectorAll('[data-tier]')) button.setAttribute('aria-pressed', String(Number(button.dataset.tier) === state.tier));
}

function showCard(id) {
  if (!Object.hasOwn(CARDS, id)) return;
  const card = describeCard({ id, tier: state.tier });
  $('detail-name').textContent = card.name;
  $('detail-cost').textContent = card.cost;
  $('detail-kind').textContent = typeName(card.type);
  $('detail-tier').textContent = `${'★'.repeat(state.tier)} ${state.tier}등급 · 구매 ${card.price}골드`;
  $('detail-art').className = `detail-art art art-${illustration(card)}`;
  $('detail-effects').replaceChildren(...card.text.split(' · ').map(effect => node('li', '', effect)));
  $('detail-form').hidden = !card.form;
  $('detail-form').textContent = card.form ? `${FORMS[card.form].name} 고유 능력: ${FORMS[card.form].detail || FORMS[card.form].rule}` : '';
  const partners = (card.linkPartners || []).filter(partner=>Object.hasOwn(CARDS,partner));
  $('detail-link').hidden = !card.linkText && !partners.length;
  $('detail-link-text').textContent = card.linkText || '';
  $('detail-partners').hidden = !partners.length;
  $('detail-partners').replaceChildren(...partners.map(partner=>{
    const button = node('button', 'partner-card', CARDS[partner].name);
    button.type = 'button'; button.dataset.partner = partner;
    button.setAttribute('aria-label', `함께 쓰기 좋은 ${CARDS[partner].name} 살펴보기`);
    return button;
  }));
  const keywords = [];
  if (card.poison) keywords.push('맹독: 덱을 섞을 때 피해를 주고 절반으로 줄어듭니다. 보호막에는 두 배로 작용합니다.');
  if (card.burn) keywords.push('화상: 충전 부족으로 카드를 버릴 때 피해를 주고 1 줄어듭니다.');
  if (card.shock) keywords.push('감전: 상대가 기력을 얻을 때 피해를 주고 1 줄어듭니다.');
  if (card.pierce) keywords.push('관통: 이 카드의 공격 피해는 보호막을 무시합니다.');
  if (card.chargeNext) keywords.push('다음 카드 충전: 덱 맨 위 카드의 빈 충전 칸을 미리 채웁니다.');
  if (card.deenergize) keywords.push('기력 감소: 상대의 남은 기력을 줄여 이후 카드 사용을 늦춥니다.');
  if (card.linkText?.includes('집중')) keywords.push('집중: 최대 12까지 모이며 다음으로 발동하는 공격에 소모됩니다. 여러 번 타격하는 공격에도 한 번만 더합니다. 충전 실패로는 사라지지 않습니다.');
  $('detail-keywords').replaceChildren(...keywords.map(text => node('p', '', text)));
  const alreadyOpen = $('card-detail').open;
  if (!alreadyOpen) $('card-detail').showModal();
  $('card-detail').scrollTop = 0;
  if (alreadyOpen) $('detail-name').focus({preventScroll:true});
}

listen($('card-search'), 'input', event => { state.query = event.target.value; render(); $('card-list').scrollTop = 0; });
listen($('type-filter'), 'change', event => { state.type = event.target.value; render(); $('card-list').scrollTop = 0; });
listen($('cost-filter'), 'change', event => { state.cost = event.target.value; render(); $('card-list').scrollTop = 0; });
for (const button of document.querySelectorAll('[data-tier]')) listen(button, 'click', () => { state.tier = Number(button.dataset.tier); render(); });
listen($('card-list'), 'click', event => {
  const card = event.target.closest('[data-card-id]');
  if (card) showCard(card.dataset.cardId);
  if (event.target.closest('[data-reset]')) {
    Object.assign(state, { query: '', type: 'all', cost: 'all' });
    $('card-search').value = '';
    $('type-filter').value = 'all';
    $('cost-filter').value = 'all';
    render();
  }
});
for (const id of ['close-detail','done-detail']) listen($(id), 'click', () => $('card-detail').close());
listen($('card-detail'), 'click', event => {
  const partner = event.target.closest('[data-partner]');
  if (partner) { showCard(partner.dataset.partner); return; }
  if (event.target !== $('card-detail')) return;
  const rect = $('card-detail').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('card-detail').close();
});
window.addEventListener('pagehide', event => { if (!event.persisted) lifetime.abort(); });
render();
