export function presentationTiming(speed=1,reducedMotion=false) {
  if(reducedMotion)return {draw:0,reveal:320,travel:0,impactGap:0,settle:440,formSettle:700};
  const rate=[1,2,4].includes(speed)?speed:1;
  return {
    draw:Math.max(140,260/rate),
    reveal:Math.max(260,420/rate),
    travel:Math.max(180,280/rate),
    impactGap:160,
    settle:Math.max(380,620/rate),
    formSettle:Math.max(650,1050/rate),
  };
}

export function effectKind(card={}) {
  if(card.type==='form'||card.form)return 'form';
  if(card.type==='attack'&&card.damage>0){
    if(card.shock)return 'shock';
    if(card.burn)return 'fire';
    if(card.poison)return 'poison';
    return 'claw';
  }
  if(card.shield)return 'shield';
  if(card.heal)return 'heal';
  if(card.energy||card.chargeNext)return 'energy';
  return 'form';
}

export function impactBeats(event={},gap=160) {
  let impacts=event.impacts;
  if(!Array.isArray(impacts)){
    impacts=(event.strikes||[]).map(strike=>({kind:'strike',...strike}));
    if(event.reactionRawDamage>0)impacts.push({kind:'reaction',damage:event.reactionDamage,absorbed:0,rawDamage:event.reactionRawDamage});
    if(event.counterRawDamage>0)impacts.push({kind:'counter',damage:event.counterDamage,absorbed:event.counterAbsorbed,rawDamage:event.counterRawDamage});
  }
  const spacing=Number.isFinite(gap)?Math.max(0,gap):0;
  return impacts.map((impact,index)=>{
    const self=impact.kind==='fatigue',reversed=['counter','poison','burn'].includes(impact.kind);
    return {...impact,actor:self?event.actor:reversed?event.target:event.actor,target:self||reversed?event.actor:event.target,delay:index*spacing,index,total:impacts.length};
  });
}

export function impactTotals(beats=[]) {
  const totals=new Map();
  for(const beat of beats){
    let total=totals.get(beat.target);
    if(!total){total={target:beat.target,damage:0,absorbed:0};totals.set(beat.target,total);}
    total.damage+=beat.damage;total.absorbed+=beat.absorbed;
  }
  return [...totals.values()];
}
