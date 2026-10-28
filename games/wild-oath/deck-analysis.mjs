import {describeCard} from './rules.mjs?v=cartoon-4';

// Preparation information only: these counts never consume resources or shuffle cards.
export function analyzeDeck(deck,opponentSize=null) {
  const cards=deck.map(describeCard),costs=[0,0,0,0],roles={attack:0,shield:0,heal:0,energy:0,charge:0};
  let totalCost=0;
  for(const card of cards){
    costs[Math.min(3,card.cost)]++;totalCost+=card.cost;
    if(card.type==='attack')roles.attack++;
    for(const [role,effect] of [['shield','shield'],['heal','heal'],['energy','energy'],['charge','chargeNext']])if(card[effect]>0)roles[role]++;
  }
  const marked=sticker=>{const card=deck.find(card=>card.sticker===sticker);return card?{uid:card.uid,id:card.id,tier:card.tier}:null;};
  const hasOpponent=Number.isInteger(opponentSize)&&opponentSize>0;
  return {size:deck.length,totalCost,averageCost:deck.length?totalCost/deck.length:0,costs,roles,top:marked('top'),bottom:marked('bottom'),opponentSize:hasOpponent?opponentSize:null,firstActor:hasOpponent?(deck.length>=opponentSize?'player':'enemy'):null};
}
