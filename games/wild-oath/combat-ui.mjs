// Small, rule-derived view models. Numbers here describe cards; they never resolve effects.
export function cardSymbols(card) {
  const items=[];
  const add=(icon,label,value)=>items.push({icon,label,value:String(value)});
  if(card.form)add('form',`${card.form==='wolf'?'늑대':card.form==='bear'?'곰':'와이번'} 변신`,'');
  if(card.damage)add('attack',`피해 ${card.damage}${card.hits>1?`, ${card.hits}회`:''}`,`${card.damage}${card.hits>1?`×${card.hits}`:''}`);
  for(const [key,icon,label] of [['shield','defense','보호막'],['heal','heart','회복'],['energy','energy','기력'],['poison','poison','맹독'],['burn','fire','화상'],['shock','shock','감전'],['focus','focus','집중'],['chargeNext','charge','다음 카드 충전'],['deenergize','drain','상대 기력 감소']]){
    if(card[key])add(icon,`${label} ${card[key]}`,card[key]);
  }
  if(card.pierce)add('pierce','보호막 관통','');
  return items;
}

// The rules may have advanced to the next actor while the previous hit is still on screen.
export function visibleCardActor(battleActor,presentedCard=null) {
  return ['player','enemy'].includes(presentedCard?.actor)?presentedCard.actor:battleActor;
}
