// Reproducible natural campaigns, not browser playtests. Run from the repo root:
// node games/wild-oath/tests/balance-campaigns.mjs --seeds 100 --compare-baseline [--details]
import assert from 'node:assert/strict';
import {CARDS,activeDeck,createRun,chooseDraft,chooseEncounter,buyCard,editDeck,upgradeAll,setSticker,startBattle,stepBattle,chooseReward,serialize,restoreRun} from '../rules.mjs';

const args=process.argv.slice(2), countIndex=args.indexOf('--seeds');
const seedCount=countIndex<0?30:Number(args[countIndex+1]);
assert.ok(Number.isInteger(seedCount)&&seedCount>=1&&seedCount<=1000,'--seeds must be 1..1000');
const forms=['wolf','bear','wyvern'];
// The same policy is used for all three themes. Only card priorities differ.
const priorities={
  wolf:['wolf','pounce','harvest','sap','rally','claw','frost','kindle','nettle','mend','talon','renewal','bark','static','moonwell','venom','ember','harry','sprout','bite','hide','thorns','ancient','trample','wildheart'],
  bear:['bear','bark','bite','sap','rally','harvest','renewal','mend','hide','thorns','frost','ancient','pounce','claw','kindle','moonwell','trample','static','nettle','sprout','talon','venom','ember','harry','wildheart'],
  wyvern:['wyvern','kindle','nettle','static','harvest','ember','storm','sap','venom','mend','renewal','pounce','bark','moonwell','frost','talon','rally','claw','sprout','hide','thorns','bite','harry','ancient','trample','wildheart'],
};
const counts=()=>Object.fromEntries(forms.map(form=>[form,0]));
function score(form,id,tier=1) {
  const index=priorities[form].indexOf(id);
  return (index<0?-100:100-index*2)+17*(tier-1);
}
function ranked(form,cards,idKey='id') {
  return [...cards].sort((a,b)=>score(form,b[idKey],b.tier||1)-score(form,a[idKey],a.tier||1)||String(a.uid||a.id).localeCompare(String(b.uid||b.id)));
}
function best(form,cards,idKey='id'){return ranked(form,cards,idKey)[0];}
function valid(state,context,counters){
  const encoded=serialize(state),restored=restoreRun(encoded);
  assert.ok(restored,context);assert.equal(serialize(restored),encoded,context);counters.saves++;
}
function prepare(state,form) {
  // Buy only the first 18 priorities, in the same preference order used in drafts.
  for(const offer of ranked(form,state.shop)) {
    if(score(form,offer.id)<66||state.gold<offer.price||state.collection.length>=36)continue;
    if(CARDS[offer.id].type==='form'&&state.collection.some(c=>c.id===offer.id&&c.tier===3))continue;
    assert.equal(buyCard(state,offer.uid).ok,true);
  }
  assert.equal(upgradeAll(state).ok,true);
  const available=ranked(form,state.collection),chosen=[];
  const add=predicate=>{const card=available.find(c=>!chosen.includes(c)&&predicate(c));if(card)chosen.push(card);};
  add(c=>c.id===form);add(c=>CARDS[c.id].type==='heal');add(c=>CARDS[c.id].type==='defense');add(c=>CARDS[c.id].type==='energy'&&CARDS[c.id].energy>0);
  for(const card of available)if(chosen.length<10&&!chosen.includes(card)&&(CARDS[card.id].type!=='form'||!chosen.some(c=>CARDS[c.id].type==='form')))chosen.push(card);
  for(const card of available)if(chosen.length<6&&!chosen.includes(card))chosen.push(card);
  const desired=new Set(chosen.map(c=>c.uid));
  for(const card of chosen)if(!card.inDeck&&activeDeck(state).length<18)assert.equal(editDeck(state,card.uid,true).ok,true);
  for(const card of [...activeDeck(state)])if(!desired.has(card.uid)&&activeDeck(state).length>6)assert.equal(editDeck(state,card.uid,false).ok,true);
  for(const card of chosen)if(!card.inDeck)assert.equal(editDeck(state,card.uid,true).ok,true);
  for(const card of activeDeck(state))if(card.sticker!=='none')assert.equal(setSticker(state,card.uid,'none').ok,true);
  const shift=activeDeck(state).find(c=>c.id===form),heal=best(form,activeDeck(state).filter(c=>CARDS[c.id].type==='heal'));
  if(shift)assert.equal(setSticker(state,shift.uid,'top').ok,true);
  if(heal&&heal!==shift)assert.equal(setSticker(state,heal.uid,'bottom').ok,true);
}
export function campaign(seed,form,simulateStep=stepBattle) {
  const state=createRun(seed),counters={saves:0,replayed:0,events:0,reactionHeal:0,enemyReactionHeal:0},links={},formLinks=counts(),enemyFormLinks=counts(),fights=[];
  let decisions=0;
  while(!['won','lost'].includes(state.phase)) {
    assert.ok(++decisions<80,`${seed}/${form}: campaign did not terminate`);
    if(state.phase==='draft')assert.equal(chooseDraft(state,best(form,state.draft.offers).uid).ok,true);
    else if(state.phase==='explore') {
      const paths=state.exploration.offers;
      const order=state.hp<=58?['spring','gift','merchant','thicket']:['gift','spring','merchant','thicket'];
      const path=[...paths].sort((a,b)=>order.indexOf(a.eventId)-order.indexOf(b.eventId))[0];
      assert.equal(chooseEncounter(state,path.uid).ok,true);
    } else if(state.phase==='camp') {
      prepare(state,form);valid(state,`${seed}/${form}: prepared camp`,counters);
      const fight={stage:state.stage+1,startHp:state.hp,opponent:state.opponent.archetype,deck:activeDeck(state).map(c=>`${c.id}:${c.tier}`),events:0,links:{}};
      assert.equal(startBattle(state).ok,true);
      while(state.phase==='battle') {
        assert.ok(++fight.events<2000,`${seed}/${form}: battle did not terminate`);
        const replay=fight.events%11===0?restoreRun(serialize(state)):null,event=simulateStep(state);counters.events++;
        counters[event.actor==='player'?'reactionHeal':'enemyReactionHeal']+=event.reactionHeal||0;
        if(replay){assert.deepEqual(simulateStep(replay),event);assert.equal(serialize(replay),serialize(state));counters.replayed++;}
        valid(state,`${seed}/${form}: stage ${fight.stage}, step ${fight.events}`,counters);
        for(const link of event.links) {
          const key=`${link.actor}:${link.name}`;links[key]=(links[key]||0)+1;fight.links[key]=(fight.links[key]||0)+1;
          if(link.kind==='form') {
            const owner=link.actor===event.actor?event.formAfter:state.battle[link.actor].form;
            if(Object.hasOwn(formLinks,owner))(link.actor==='player'?formLinks:enemyFormLinks)[owner]++;
          }
        }
      }
      fight.endHp=state.hp;fight.victory=state.phase!=='lost';fights.push(fight);
    } else if(state.phase==='reward')assert.equal(chooseReward(state,best(form,state.rewards,'cardId').id).ok,true);
    else assert.fail(`Unexpected phase ${state.phase}`);
    valid(state,`${seed}/${form}: ${state.phase}`,counters);
  }
  return {seed,form,outcome:state.phase,victories:state.stats.victories,reached:state.stage+1,endHp:state.hp,...counters,formLinks,enemyFormLinks,links,fights};
}
export function summarize(runs) {
  return forms.map(form=>{
    const group=runs.filter(run=>run.form===form),wins=group.filter(run=>run.outcome==='won');
    const sum=key=>group.reduce((n,run)=>n+run[key],0),formsSum=key=>Object.fromEntries(forms.map(owner=>[owner,group.reduce((n,run)=>n+run[key][owner],0)]));
    return {form,runs:group.length,wins:wins.length,winPercent:Math.round(wins.length/group.length*1000)/10,meanVictories:sum('victories')/group.length,meanReached:sum('reached')/group.length,meanWinnerHp:wins.length?wins.reduce((n,run)=>n+run.endHp,0)/wins.length:0,lossStages:Object.fromEntries([1,2,3,4,5].map(stage=>[stage,group.filter(run=>run.outcome==='lost'&&run.reached===stage).length])),battles:group.reduce((n,run)=>n+run.fights.length,0),events:sum('events'),saveChecks:sum('saves'),resumeChecks:sum('replayed'),reactionHeal:sum('reactionHeal'),enemyReactionHeal:sum('enemyReactionHeal'),playerFormLinks:formsSum('formLinks'),enemyFormLinks:formsSum('enemyFormLinks')};
  });
}
async function loadBaselineStep() {
  // Test-only counterfactual: disable exactly the new recovery assignment in an
  // isolated module. Do not change damage, enemies, decisions or the source file.
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../rules.mjs',import.meta.url),'utf8');
  const recovery='event.reactionHeal=source.hp>0?Math.min(source.maxHp-source.hp,event.reactionConsumed):0;';
  assert.equal(source.split(recovery).length,2,'baseline expects exactly one reaction-healing assignment; update this test adapter if the rule changes');
  const baseline=source.replace(recovery,'event.reactionHeal=0;');
  return (await import(`data:text/javascript;base64,${Buffer.from(baseline).toString('base64')}`)).stepBattle;
}
function comparePaired(before,after) {
  const indexed=new Map(after.map(run=>[`${run.form}:${run.seed}`,run]));
  return forms.map(form=>{
    const pairs=before.filter(run=>run.form===form).map(run=>[run,indexed.get(`${form}:${run.seed}`)]);
    assert.ok(pairs.every(([,current])=>current),'every baseline run must have the same form/seed after run');
    const shared=pairs.filter(([old,current])=>old.outcome==='won'&&current.outcome==='won');
    return {form,gainedWins:pairs.filter(([old,current])=>old.outcome!=='won'&&current.outcome==='won').map(([old])=>old.seed),lostWins:pairs.filter(([old,current])=>old.outcome==='won'&&current.outcome!=='won').map(([old])=>old.seed),sharedWinners:shared.length,sharedWinnerHpBefore:shared.length?shared.reduce((n,[old])=>n+old.endHp,0)/shared.length:null,sharedWinnerHpAfter:shared.length?shared.reduce((n,[,current])=>n+current.endHp,0)/shared.length:null};
  });
}
const runs=[];
for(let seed=1;seed<=seedCount;seed++)for(const form of forms)runs.push(campaign(seed,form));
let comparison=null,baselineRuns=[];
if(args.includes('--compare-baseline')){
  const baselineStep=await loadBaselineStep();
  for(let seed=1;seed<=seedCount;seed++)for(const form of forms)baselineRuns.push(campaign(seed,form,baselineStep));
  comparison={baseline:'reaction healing disabled only; identical starting seeds and decision policy',summary:summarize(baselineRuns),paired:comparePaired(baselineRuns,runs)};
}
console.log(JSON.stringify({policy:'themed-priorities-v1; seeds 1..N; natural choices/API only; best 10 cards plus heal/defense/energy; own form top; heal bottom',seeds:seedCount,summary:summarize(runs),...(comparison?{comparison}:{}),...(args.includes('--details')?{runs,...(comparison?{baselineRuns}:{})}:{})},null,2));
