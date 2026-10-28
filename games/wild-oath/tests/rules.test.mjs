import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS,FORMS,ENCOUNTERS,EVENTS,DECK_MIN,DECK_MAX,createRun,activeDeck,enemyDeck,describeCard,chooseDraft,chooseEncounter,editDeck,buyCard,sellCard,upgradeCard,upgradeAll,setSticker,startBattle,stepBattle,chooseReward,serialize,restoreRun} from '../rules.mjs';

const end = state => {let steps=0;while(state.phase==='battle'&&steps++<2000)stepBattle(state);assert.ok(steps<2000,'combat terminates');return steps;};
const instance = (id,index=0) => ({uid:`test-${index}`,id,tier:1,charge:0,sticker:'none'});
function explore(seed=1) {const s=createRun(seed);while(s.phase==='draft')assert.equal(chooseDraft(s,s.draft.offers[0].uid).ok,true);assert.equal(s.phase,'explore');return s;}
function resolveExplore(state,preferred='spring') {
  const offer=state.exploration.offers.find(offer=>offer.eventId===preferred)||state.exploration.offers[0];assert.equal(chooseEncounter(state,offer.uid).ok,true);
  while(state.phase==='draft')assert.equal(chooseDraft(state,state.draft.offers[0].uid).ok,true);
  assert.equal(state.phase,'camp');return state;
}
function camp(seed=1) {return resolveExplore(explore(seed));}
function fixture(seed=1) {
  const s=camp(seed);s.collection=[];s.nextUid=1;
  for(const [index,id] of ['claw','claw','bark','bark','bite','mend','sap','wolf','bear','wyvern','venom','thorns','pounce','storm'].entries())s.collection.push({uid:`c${s.nextUid++}`,id,tier:1,inDeck:index<10,sticker:'none'});
  return s;
}
function fresh(seed=1) {const s=fixture(seed);assert.equal(startBattle(s).ok,true);return s;}
function withEvent(id) {for(let seed=1;seed<=100;seed++){const s=explore(seed);if(s.exploration.offers.some(offer=>offer.eventId===id))return s;}assert.fail(`missing event ${id}`);}
function front(state,actor,id,patch={}) {
  const body=state.battle[actor],cards=[...body.draw,...body.discard];
  const card=cards.find(c=>c.id===id)||instance(id);
  body.draw=[card,...cards.filter(c=>c!==card)];body.discard=[];Object.assign(body,patch);state.battle.actor=actor;return card;
}
function sequence(state,actor,ids,patch={}) {const body=state.battle[actor];body.draw=ids.map(instance);body.discard=[];Object.assign(body,patch);state.battle.actor=actor;}
function forceWin(state) {state.battle.enemy.hp=1;state.battle.enemy.shield=0;front(state,'player','claw',{energy:4});assert.equal(stepBattle(state).victory,true);}

test('starting draft is seeded, has eight real choices and never grants a fixed deck or bench',()=>{
  const a=createRun(9),b=createRun(9);assert.equal(serialize(a),serialize(b));assert.equal(a.version,5);assert.equal(a.phase,'draft');assert.equal(a.collection.length,0);assert.equal(enemyDeck(a).length,0);
  const roles=['form','attack','defense','energy','attack','heal','all','all'];
  for(let pick=0;pick<8;pick++){
    assert.equal(a.draft.picked,pick);assert.equal(a.draft.total,8);assert.equal(a.draft.offers.length,3);assert.equal(new Set(a.draft.offers.map(offer=>offer.id)).size,3);
    for(const offer of a.draft.offers){assert.equal(offer.tier,1);if(roles[pick]!=='all')assert.equal(CARDS[offer.id].type,roles[pick]);if(roles[pick]==='attack')assert.ok(CARDS[offer.id].cost<=2);if(roles[pick]==='energy')assert.ok(CARDS[offer.id].energy>0);}
    const before=serialize(a),stale=a.draft.offers[0].uid;assert.equal(chooseDraft(a,'missing').ok,false);assert.equal(serialize(a),before);
    const restored=restoreRun(before);assert.ok(restored);assert.deepEqual(chooseDraft(restored,stale),chooseDraft(a,stale));assert.equal(serialize(restored),serialize(a));assert.equal(a.collection.length,pick+1);assert.ok(a.collection.every(card=>card.inDeck));
    const after=serialize(a);assert.equal(chooseDraft(a,stale).ok,false);assert.equal(serialize(a),after);
  }
  assert.equal(a.phase,'explore');assert.equal(a.draft,null);assert.equal(a.collection.length,8);assert.equal(a.shop.length,0);assert.equal(a.opponent,null);assert.ok(restoreRun(serialize(a)));
  const variations=new Set(Array.from({length:20},(_,seed)=>serialize(explore(seed).collection.map(card=>card.id))));assert.ok(variations.size>10);
});

test('exploration offers persist, are distinct and eligible, and always include a card growth route',()=>{
  const seen=new Set();
  for(let seed=0;seed<50;seed++){
    const s=explore(seed),before=serialize(s),restored=restoreRun(before);assert.ok(restored);assert.equal(serialize(restored),before);
    assert.equal(s.exploration.offers.length,2);assert.equal(new Set(s.exploration.offers.map(offer=>offer.eventId)).size,2);assert.ok(s.exploration.offers.some(offer=>EVENTS[offer.eventId].total>0));
    s.exploration.offers.forEach(offer=>seen.add(offer.eventId));assert.equal(chooseEncounter(s,'missing').ok,false);assert.equal(serialize(s),before);
  }
  assert.equal(seen.size,4);
});

test('each exploration cost and benefit resolves once, then creates the camp once',()=>{
  for(const id of Object.keys(EVENTS)){
    const s=withEvent(id),offer=s.exploration.offers.find(offer=>offer.eventId===id),event=EVENTS[id];s.hp=40;const hp=s.hp,gold=s.gold,count=s.collection.length;
    assert.equal(chooseEncounter(s,offer.uid).ok,true);assert.equal(s.exploration.resolved,true);assert.equal(s.exploration.selectedUid,offer.uid);
    assert.equal(s.hp,id==='thicket'?hp-6:id==='spring'?hp+12:hp);assert.equal(s.gold,id==='merchant'?gold-4:id==='spring'?gold+3:gold);
    const after=serialize(s);assert.equal(chooseEncounter(s,offer.uid).ok,false);assert.equal(serialize(s),after);assert.ok(restoreRun(after));
    for(let picked=0;picked<event.total;picked++){
      assert.equal(s.draft.picked,picked);assert.equal(s.draft.kind,'event');assert.equal(s.draft.tier,event.tier);
      const saved=restoreRun(serialize(s));assert.ok(saved);const uid=s.draft.offers[0].uid;assert.deepEqual(chooseDraft(saved,uid),chooseDraft(s,uid));assert.equal(serialize(saved),serialize(s));assert.equal(s.collection.at(-1).tier,event.tier);
    }
    assert.equal(s.phase,'camp');assert.equal(s.collection.length,count+event.total);assert.ok(s.collection.every(card=>card.inDeck));assert.equal(s.shop.length,3);assert.equal(enemyDeck(s).length,8);assert.ok(restoreRun(serialize(s)));
    const campSnapshot=serialize(s);assert.equal(chooseEncounter(s,offer.uid).ok,false);assert.equal(serialize(s),campSnapshot);
  }
});

test('draft and exploration lock camp actions and reject unaffordable event costs without mutation',()=>{
  for(const s of [createRun(3),explore(3)]){
    const before=serialize(s);for(const action of [()=>editDeck(s,'c1',false),()=>buyCard(s,'o0-0'),()=>sellCard(s,'c1'),()=>upgradeCard(s,'c1'),()=>setSticker(s,'c1','top'),()=>startBattle(s),()=>chooseReward(s,'r0-0')])assert.equal(action().ok,false);assert.equal(serialize(s),before);
  }
  for(const [id,patch] of [['thicket',{hp:6}],['merchant',{gold:3}]]){
    const s=withEvent(id);Object.assign(s,patch);const before=serialize(s);assert.equal(chooseEncounter(s,s.exploration.offers.find(offer=>offer.eventId===id).uid).ok,false);assert.equal(serialize(s),before);
  }
});

test('camp enforces deck bounds and preserves explicit bench choices',()=>{
  const a=fixture(9);
  const bench=a.collection.find(c=>!c.inDeck);assert.equal(editDeck(a,bench.uid,true).ok,true);
  for(const card of [...activeDeck(a)])if(activeDeck(a).length>DECK_MIN)assert.equal(editDeck(a,card.uid,false).ok,true);
  assert.equal(editDeck(a,activeDeck(a)[0].uid,false).ok,false);assert.equal(editDeck(a,'missing',true).ok,false);assert.equal(editDeck(a,bench.uid,'yes').ok,false);
  assert.equal(DECK_MAX,18);assert.ok(restoreRun(serialize(a)));
});

test('shop spends once, sales preserve minimum, and equal pairs upgrade',()=>{
  const s=fixture(3),offer=s.shop[0],gold=s.gold;assert.equal(buyCard(s,offer.uid).ok,true);assert.equal(s.gold,gold-offer.price);assert.equal(buyCard(s,offer.uid).ok,false);
  s.gold=0;assert.equal(buyCard(s,s.shop[0].uid).ok,false);
  const claw=s.collection.find(c=>c.id==='claw');assert.equal(upgradeCard(s,claw.uid).ok,true);assert.equal(claw.tier,2);assert.equal(describeCard(claw).damage,9);assert.equal(upgradeCard(s,claw.uid).ok,false);
  const inactive=s.collection.find(c=>!c.inDeck);assert.equal(sellCard(s,inactive.uid).ok,true);assert.equal(s.gold,inactive.tier);
  while(activeDeck(s).length>DECK_MIN)sellCard(s,activeDeck(s)[0].uid);
  assert.equal(sellCard(s,activeDeck(s)[0].uid).ok,false);assert.ok(restoreRun(serialize(s)));
});

test('merging at minimum consumes a bench twin before an active twin',()=>{
  const s=fixture(6);s.shop=[{uid:'o0-0',id:'claw',price:CARDS.claw.price}];assert.equal(buyCard(s,'o0-0').ok,true);const bench=s.collection.at(-1);
  for(const card of [...activeDeck(s)])if(card.id!=='claw'&&activeDeck(s).length>DECK_MIN)editDeck(s,card.uid,false);
  const claws=activeDeck(s).filter(card=>card.id==='claw');assert.equal(upgradeCard(s,claws[0].uid).ok,true);assert.equal(claws[0].tier,2);assert.equal(claws[1].tier,1);assert.equal(activeDeck(s).length,6);assert.equal(s.collection.some(c=>c.uid===bench.uid),false);assert.ok(restoreRun(serialize(s)));
});

function bulkFixture(cards) {
  const s=camp(21);s.nextUid=1;
  s.collection=cards.map(([id,tier=1,inDeck=true,sticker='none'])=>({uid:`c${s.nextUid++}`,id,tier,inDeck,sticker}));return s;
}
const bulkBase=()=>['bark','mend','sap','wolf','bear','wyvern'].map(id=>[id]);
test('bulk synthesis chains through rank three, preserves bench placement and saves its result',()=>{
  const s=bulkFixture([...bulkBase(),...Array.from({length:4},()=>['claw',1,false]),['bite',3,false],['bite',3,false]]);
  const before=serialize(s),preview=structuredClone(s),gold=s.gold,seed=s.seed,nextUid=s.nextUid;
  const expected=upgradeAll(preview);assert.equal(serialize(s),before);assert.equal(expected.merged,3);
  const result=upgradeAll(s);assert.deepEqual(result,expected);assert.equal(serialize(s),serialize(preview));
  assert.deepEqual(s.collection.filter(c=>c.id==='claw').map(c=>[c.tier,c.inDeck]),[[3,false]]);
  assert.deepEqual(result.upgraded,[{uid:'c7',id:'claw',tier:3}]);assert.equal(activeDeck(s).length,6);
  assert.equal(s.gold,gold);assert.equal(s.seed,seed);assert.equal(s.nextUid,nextUid);assert.ok(restoreRun(serialize(s)));
  const completed=serialize(s);assert.deepEqual(upgradeAll(s),{ok:true,merged:0,upgraded:[]});assert.equal(serialize(s),completed);
});
test('bulk synthesis keeps six active cards and uses bench pairs before reducing the deck',()=>{
  const s=bulkFixture([['claw'],['claw'],['claw'],['bark'],['mend'],['sap'],['wolf'],['claw',1,false],['bear',1,false]]);
  const result=upgradeAll(s);assert.equal(result.merged,2);assert.equal(activeDeck(s).length,6);
  assert.deepEqual(s.collection.filter(c=>c.id==='claw').map(c=>[c.tier,c.inDeck]),[[2,true],[2,true]]);
  assert.equal(s.collection.find(c=>c.id==='bear').inDeck,false);assert.ok(restoreRun(s));
  const blocked=serialize(s);assert.equal(upgradeAll(s).merged,0);assert.equal(serialize(s),blocked);
  const minimum=bulkFixture([['claw'],['claw'],['bark'],['bark'],['sap'],['wolf']]);
  const before=serialize(minimum);assert.equal(upgradeAll(minimum).merged,0);assert.equal(serialize(minimum),before);
});
test('bulk synthesis preserves marked identities and skips pairs with two sorting marks',()=>{
  const s=bulkFixture([['claw',1,true,'top'],['claw',1,true,'bottom'],['claw'],['bark'],['mend'],['sap'],['wolf']]);
  const result=upgradeAll(s);assert.equal(result.merged,1);assert.equal(s.collection.find(c=>c.uid==='c1').tier,2);
  assert.equal(s.collection.find(c=>c.uid==='c1').sticker,'top');assert.equal(s.collection.find(c=>c.uid==='c2').sticker,'bottom');assert.ok(restoreRun(s));
  const conflict=bulkFixture([['claw',1,true,'bottom'],['claw',1,true,'top'],['bark'],['mend'],['sap'],['wolf'],['bear']]);
  const before=serialize(conflict);assert.equal(upgradeAll(conflict).merged,0);assert.equal(serialize(conflict),before);assert.ok(restoreRun(conflict));
});
test('bulk synthesis rejects non-camp phases without altering progress',()=>{
  for(const s of [createRun(4),explore(4),fresh(4)]){
    const before=serialize(s);assert.equal(upgradeAll(s).ok,false);assert.equal(serialize(s),before);
  }
});

test('every card gains an actual effect on both upgrades, including resource-only cards',()=>{
  for(const id of Object.keys(CARDS)){
    const ranks=[1,2,3].map(tier=>describeCard({id,tier}));
    assert.notEqual(ranks[0].text,ranks[1].text,`${id} tier 2 benefit`);assert.notEqual(ranks[1].text,ranks[2].text,`${id} tier 3 benefit`);
  }
  assert.deepEqual([1,2,3].map(tier=>describeCard({id:'wolf',tier}).energy),[1,2,3]);
  assert.deepEqual([1,2,3].map(tier=>describeCard({id:'sap',tier}).energy),[2,3,4]);
  assert.deepEqual([1,2,3].map(tier=>describeCard({id:'rally',tier}).chargeNext),[2,3,4]);
});

test('sorting marks control opener and bottom and camp actions lock during combat',()=>{
  const s=fixture(5),wolf=s.collection.find(c=>c.id==='wolf'),bear=s.collection.find(c=>c.id==='bear');
  setSticker(s,wolf.uid,'top');setSticker(s,bear.uid,'bottom');startBattle(s);
  assert.equal(s.battle.player.draw[0].uid,wolf.uid);assert.equal(s.battle.player.draw.at(-1).uid,bear.uid);
  for(const action of [()=>editDeck(s,wolf.uid,false),()=>buyCard(s,s.shop[0].uid),()=>sellCard(s,wolf.uid),()=>upgradeCard(s,wolf.uid),()=>setSticker(s,wolf.uid,'none'),()=>startBattle(s)])assert.equal(action().ok,false);
  assert.ok(restoreRun(serialize(s)));
});

test('enemy decks are seeded from the entire shared pool and obey ordinary limits',()=>{
  const seen=new Set();
  for(let seed=1;seed<=300;seed++){
    const s=camp(seed),deck=enemyDeck(s);assert.ok(deck.length>=DECK_MIN&&deck.length<=DECK_MAX);
    for(const card of deck){assert.ok(CARDS[card.id]);seen.add(card.id);assert.ok(card.tier>=1&&card.tier<=3);}
    for(const mark of ['top','bottom'])assert.ok(deck.filter(c=>c.sticker===mark).length<=1);
    const before=serialize(deck);assert.ok(restoreRun(serialize(s)));startBattle(s);assert.equal(serialize(enemyDeck(s)),before);
    assert.equal(s.battle.enemy.maxHp,70);assert.equal(s.battle.enemy.hp,70);assert.equal(s.battle.enemy.shield,0);assert.equal(s.battle.enemy.form,'druid');assert.equal(s.battle.enemy.energy,4);
  }
  assert.equal(seen.size,Object.keys(CARDS).length,'every shared card can appear in an enemy deck');
});

test('larger deck starts and equal deck size favors player',()=>{
  const s=fixture(1);while(activeDeck(s).length>6)editDeck(s,activeDeck(s)[0].uid,false);startBattle(s);assert.equal(s.battle.actor,'enemy');
  const tie=fixture(2);while(activeDeck(tie).length>enemyDeck(tie).length)editDeck(tie,activeDeck(tie)[0].uid,false);startBattle(tie);assert.equal(tie.battle.actor,'player');
});

test('a turn plays four cost-one cards from four energy, never one card or the entire deck',()=>{
  const s=fresh();sequence(s,'player',['claw','claw','claw','claw','bite','bark'],{energy:4,form:'druid'});
  for(let i=1;i<=4;i++){
    const event=stepBattle(s);assert.equal(event.type,'card');assert.equal(event.turn,1);assert.equal(event.turnCard,i);assert.equal(event.damage,6);assert.equal(event.turnEnded,i===4);
    assert.equal(event.energyRecovered,i===4?1:0);assert.equal(s.battle.actor,i===4?'enemy':'player');
  }
  assert.equal(s.battle.turn,2);assert.equal(s.battle.player.energy,1);assert.equal(s.battle.player.draw.length,2);assert.equal(s.battle.enemy.hp,46);assert.equal(s.stats.turns,1);
});

test('partial charge is retained on discard and ends the turn, then only missing energy is paid',()=>{
  const s=fresh(),card=front(s,'player','ancient',{energy:2});
  const failed=stepBattle(s);assert.equal(failed.type,'charge');assert.equal(failed.charged,2);assert.equal(card.charge,2);assert.equal(failed.turnEnded,true);assert.equal(s.battle.player.energy,1);assert.equal(s.battle.enemy.hp,70);
  front(s,'player','ancient',{energy:2});const played=stepBattle(s);assert.equal(played.type,'card');assert.equal(played.damage,24);assert.equal(card.charge,0);assert.equal(played.energySpent,2);assert.equal(played.turnEnded,true);
});

test('free cards and energy cards extend a chain but depleted energy ends before the next free card',()=>{
  const s=fresh();sequence(s,'player',['wolf','sap','bear','bark','claw','mend'],{energy:4});
  for(const [id,energy] of [['wolf',5],['sap',7],['bear',7],['bark',6]]){const event=stepBattle(s);assert.equal(event.cardId,id);assert.equal(event.turnEnded,false);assert.equal(s.battle.player.energy,energy);assert.equal(s.battle.actor,'player');}
  sequence(s,'player',['claw','sprout','bark','claw','bark','mend'],{energy:1});const done=stepBattle(s);assert.equal(done.turnEnded,true);assert.equal(s.battle.player.draw[0].id,'sprout');assert.equal(s.battle.actor,'enemy');
});

test('emptying the deck ends the chain and reshuffle consumes the next whole own turn',()=>{
  const s=fresh();s.battle.player.discard=s.battle.player.draw.slice(1);s.battle.player.draw=s.battle.player.draw.slice(0,1);s.battle.player.energy=20;
  const last=stepBattle(s);assert.equal(last.turnEnded,true);assert.equal(s.battle.actor,'enemy');assert.equal(s.battle.player.draw.length,0);assert.equal(s.stats.shuffles,0);
  s.battle.actor='player';const energy=s.battle.player.energy,event=stepBattle(s);assert.equal(event.type,'shuffle');assert.equal(event.cardId,undefined);assert.equal(event.turnEnded,true);assert.equal(s.battle.player.draw.length,10);assert.equal(s.battle.player.discard.length,0);assert.equal(s.battle.player.energy,energy+1);assert.equal(s.battle.actor,'enemy');
});

test('wolf combo resets on defense and failed charge; bear scales shielding and attacks',()=>{
  const s=fresh();front(s,'player','claw',{energy:20,form:'wolf'});assert.equal(stepBattle(s).rawDamage,6);front(s,'player','claw',{energy:20});assert.equal(stepBattle(s).rawDamage,8);
  front(s,'player','hide',{energy:20});stepBattle(s);front(s,'player','claw',{energy:20});assert.equal(stepBattle(s).rawDamage,6);
  front(s,'player','ancient',{energy:0});assert.equal(stepBattle(s).type,'charge');assert.equal(s.battle.player.combo,0);
  const bear=fresh();front(bear,'player','bear',{energy:4});assert.equal(stepBattle(bear).shield,6);front(bear,'player','bark',{energy:4});assert.equal(stepBattle(bear).shield,12);front(bear,'player','claw',{energy:4});assert.equal(stepBattle(bear).rawDamage,12);assert.equal(bear.battle.player.shield,18);
});

test('wyvern pierces shields; poison triggers only on shuffle and then halves',()=>{
  const s=fresh();front(s,'player','wyvern',{energy:4});stepBattle(s);s.battle.enemy.shield=10;front(s,'player','claw',{energy:4});assert.equal(stepBattle(s).damage,6);assert.equal(s.battle.enemy.shield,10);assert.equal(s.battle.enemy.poison,4);
  s.battle.enemy.poison=7;s.battle.enemy.discard.push(...s.battle.enemy.draw);s.battle.enemy.draw=[];s.battle.actor='enemy';const hp=s.battle.enemy.hp,event=stepBattle(s);
  assert.equal(event.poisonAbsorbed,10);assert.equal(event.poisonDamage,2);assert.equal(s.battle.enemy.hp,hp-2);assert.equal(s.battle.enemy.poison,3);assert.equal(s.battle.enemy.shield,0);
});

test('successful, failed and free cards each trigger one discard burn on either side',()=>{
  for(const actor of ['player','enemy'])for(const [id,energy,type] of [['claw',4,'card'],['ancient',0,'charge'],['kindle',0,'card']]){
    const s=fresh();sequence(s,actor,[id,'bark','claw','mend','sap','bite'],{hp:50,burn:5,energy,shield:0,form:'druid'});
    const event=stepBattle(s),source=s.battle[actor];
    assert.equal(event.type,type,`${actor}/${id}`);assert.equal(event.burnDamage,5);assert.equal(event.burnAbsorbed,0);
    assert.equal(source.hp,45);assert.equal(source.burn,4);assert.equal(source.discard.length,1);
    assert.equal(event.impacts.filter(impact=>impact.kind==='burn').length,1);assert.equal(event.impacts.at(-1).kind,'burn');
    if(id==='kindle')assert.equal(event.energyGained,1,'free energy cards still resolve before their burn');
  }
});

test('discard burn follows healing, new shields, wyvern recovery and bear counters',()=>{
  for(const actor of ['player','enemy']){
    const other=actor==='player'?'enemy':'player';
    const healed=fresh();front(healed,actor,'renewal',{hp:40,burn:4,energy:4,shield:0,form:'druid'});
    const heal=stepBattle(healed);assert.equal(heal.heal,10);assert.equal(heal.shield,5);
    assert.equal(heal.burnDamage,0);assert.equal(heal.burnAbsorbed,3,'10 healing removes 1 burn before the new shield absorbs the remaining 3');
    assert.equal(healed.battle[actor].hp,50);assert.equal(healed.battle[actor].shield,2);assert.equal(healed.battle[actor].burn,2);
    const rescue=fresh();front(rescue,actor,'mend',{hp:2,burn:5,energy:4,shield:0,form:'druid'});
    const rescueEvent=stepBattle(rescue);assert.equal(rescueEvent.heal,6);assert.equal(rescueEvent.burnDamage,5);assert.equal(rescue.battle[actor].hp,3,'the card heals before its discard damage');
    const wyvern=fresh();front(wyvern,actor,'kindle',{hp:40,burn:5,energy:2,shield:0,form:'wyvern'});wyvern.battle[other].poison=4;
    const blast=stepBattle(wyvern);assert.equal(blast.reactionHeal,4);assert.equal(blast.burnDamage,5);assert.equal(wyvern.battle[actor].hp,39);
    assert.deepEqual(blast.impacts.map(impact=>impact.kind),['reaction','burn']);
    const countered=fresh();front(countered,actor,'claw',{hp:10,burn:4,energy:4,shield:0,form:'druid'});Object.assign(countered.battle[other],{form:'bear',shield:10});
    const counter=stepBattle(countered);assert.equal(counter.counterDamage,3);assert.equal(counter.burnDamage,4);assert.equal(countered.battle[actor].hp,3);
    assert.deepEqual(counter.impacts.map(impact=>impact.kind),['strike','counter','burn']);
  }
});

test('multi-hit pursuit burns once per card and does not bypass resource chain boundaries',()=>{
  for(const actor of ['player','enemy']){
    const combo=fresh();sequence(combo,actor,['pounce','sap','claw','bark','mend','bite'],{hp:50,burn:5,energy:4,shield:0,form:'wolf',combo:2});
    const hits=stepBattle(combo);assert.equal(hits.extraHits,1);assert.equal(hits.strikes.length,3);assert.equal(hits.burnDamage,5);assert.equal(combo.battle[actor].burn,4);
    assert.equal(hits.impacts.filter(impact=>impact.kind==='burn').length,1);assert.equal(hits.turnEnded,false);assert.equal(combo.battle.actor,actor);
    const depleted=fresh();sequence(depleted,actor,['claw','kindle','bark','claw','mend','bite'],{hp:50,burn:2,energy:1,shield:0,form:'druid'});
    const end=stepBattle(depleted);assert.equal(end.burnDamage,2);assert.equal(end.turnEnded,true);assert.equal(end.energyRecovered,1);
    assert.equal(depleted.battle[actor].draw[0].id,'kindle','the next free card still waits after the resource pool empties');assert.notEqual(depleted.battle.actor,actor);
  }
});

test('reshuffling without a card does not trigger burn and lethal burn caps damage before recovery',()=>{
  for(const actor of ['player','enemy']){
    const shuffled=fresh(),source=shuffled.battle[actor];source.discard.push(...source.draw);source.draw=[];Object.assign(source,{hp:40,burn:6,poison:0,energy:2});shuffled.battle.actor=actor;
    const shuffle=stepBattle(shuffled);assert.equal(shuffle.type,'shuffle');assert.equal(shuffle.burnDamage,0);assert.equal(source.burn,6);assert.equal(source.hp,40);
    assert.equal(shuffle.impacts.some(impact=>impact.kind==='burn'),false);
    const lethal=fresh();front(lethal,actor,'claw',{hp:4,burn:7,energy:4,shield:2,form:'druid'});
    const death=stepBattle(lethal);assert.equal(death.damage,6,'the successful card resolves before lethal discard damage');
    assert.equal(death.burnAbsorbed,2);assert.equal(death.burnDamage,4,'life damage cannot exceed remaining health');assert.equal(lethal.battle[actor].hp,0);
    assert.equal(death.energyRecovered,0);assert.equal(death.turnEnded,true);assert.equal(lethal.phase,actor==='player'?'lost':'reward');
    const mutual=fresh(),other=actor==='player'?'enemy':'player';front(mutual,actor,'claw',{hp:4,burn:7,energy:4,shield:2,form:'druid'});mutual.battle[other].hp=3;
    const trade=stepBattle(mutual);assert.equal(trade.damage,3);assert.equal(trade.burnDamage,4);assert.equal(mutual.battle[actor].hp,0);assert.equal(mutual.battle[other].hp,0);
    assert.equal(mutual.phase,'lost','simultaneous deaths preserve the existing player-defeat policy');assert.equal(trade.energyRecovered,0);
  }
});

test('a saved successful discard resumes after its burn without replaying damage or consuming a second stack',()=>{
  const s=fixture(11),cards=activeDeck(s);for(const card of cards)card.id='bark';cards[0].id='claw';
  assert.equal(setSticker(s,cards[0].uid,'top').ok,true);assert.equal(startBattle(s).ok,true);
  Object.assign(s.battle.player,{hp:50,burn:5,energy:4,shield:0,form:'druid'});
  const played=stepBattle(s);assert.equal(played.cardId,'claw');assert.equal(played.burnDamage,5);assert.equal(s.battle.player.hp,45);assert.equal(s.battle.player.burn,4);
  const restored=restoreRun(serialize(s));assert.ok(restored);assert.equal(restored.battle.player.hp,45);assert.equal(restored.battle.player.burn,4);
  const next=stepBattle(s),resumed=stepBattle(restored);assert.deepEqual(resumed,next);assert.equal(serialize(restored),serialize(s));
  assert.equal(next.cardId,'bark');assert.equal(next.burnDamage,0);assert.equal(next.burnAbsorbed,4);assert.equal(s.battle.player.hp,45);assert.equal(s.battle.player.burn,3);
});

test('shock fires on actual energy gains, with one recovery event per completed turn',()=>{
  const s=fresh();s.battle.enemy.shock=4;front(s,'player','sap',{energy:0});const gain=stepBattle(s);assert.equal(gain.energyGained,2);assert.equal(gain.energyRecovered,0);assert.equal(gain.shockDamage,4);assert.equal(s.battle.enemy.shock,3);
  front(s,'player','bite',{energy:2});const finish=stepBattle(s);assert.equal(finish.energyGained,1);assert.equal(finish.energyRecovered,1);assert.equal(finish.shockDamage,3);assert.equal(s.battle.enemy.shock,2);
});

test('next-card charging, ordinary piercing and resource denial resolve from shared card effects',()=>{
  const s=fresh();sequence(s,'player',['rally','ancient','bark','claw','bark','mend'],{energy:4});const signal=stepBattle(s);assert.equal(signal.nextCharged,2);assert.equal(s.battle.player.draw[0].charge,2);const attack=stepBattle(s);assert.equal(attack.energySpent,2);assert.equal(attack.rawDamage,32);
  front(s,'player','talon',{energy:4,form:'druid'});s.battle.enemy.shield=50;assert.equal(stepBattle(s).damage,9);assert.equal(s.battle.enemy.shield,50);
  front(s,'player','harry',{energy:4});s.battle.enemy.energy=1;const denial=stepBattle(s);assert.equal(denial.deenergized,1);assert.equal(s.battle.enemy.energy,0);
  sequence(s,'player',['rally','bark','bark','claw','bark','mend'],{energy:4});assert.equal(stepBattle(s).nextCharged,1,'precharge never exceeds target cost');
});

test('every card and every form use identical effects for player and enemy',()=>{
  for(const card of Object.keys(CARDS))for(const form of Object.keys(FORMS)){
    const events=[],sources=[],targets=[];
    for(const actor of ['player','enemy']){
      const s=fresh(11),other=actor==='player'?'enemy':'player';
      sequence(s,actor,[card,'bark','claw','bark','claw','mend'],{energy:5,hp:45,shield:7,form,poison:2,burn:3,shock:1,combo:2});
      sequence(s,other,['bark','claw','bark','claw','mend','bite'],{energy:4,hp:70,shield:8,form:'druid',poison:2,burn:3,shock:4,combo:0});s.battle.actor=actor;
      const event=stepBattle(s);for(const link of event.links)link.actor=link.actor===actor?'source':'target';delete event.actor;delete event.target;delete event.nextActor;events.push(event);
      const source=structuredClone(s.battle[actor]),target=structuredClone(s.battle[other]);delete source.name;delete target.name;sources.push(source);targets.push(target);
    }
    assert.deepEqual(events[0],events[1],`${card}/${form} event`);assert.deepEqual(sources[0],sources[1],`${card}/${form} source`);assert.deepEqual(targets[0],targets[1],`${card}/${form} target`);
  }
});

test('mid-turn saves resume the next draw without repeating energy or card effects',()=>{
  const s=fixture(12);setSticker(s,s.collection.find(c=>c.id==='wolf').uid,'top');startBattle(s);const first=stepBattle(s);assert.equal(first.turnEnded,false);assert.equal(s.battle.actor,'player');assert.equal(s.battle.turn,1);
  const restored=restoreRun(serialize(s));assert.ok(restored);assert.equal(serialize(restored),serialize(s));assert.deepEqual(stepBattle(restored),stepBattle(s));assert.equal(serialize(restored),serialize(s));
});

test('focus is capped, survives support and failed charge, and buffs only the first successful attack hit',()=>{
  const s=fresh();sequence(s,'player',['bark','rally','pounce','mend','claw','bite'],{energy:20,focus:0});
  assert.equal(stepBattle(s).focusGained,2);assert.equal(s.battle.player.focus,2);
  assert.equal(stepBattle(s).focusGained,4);assert.equal(s.battle.player.focus,6);
  const double=stepBattle(s);assert.equal(double.focusSpent,6);assert.equal(double.rawDamage,14);assert.equal(s.battle.player.focus,0);
  front(s,'player','bark',{energy:20,focus:11});assert.equal(stepBattle(s).focusGained,1);assert.equal(s.battle.player.focus,12);
  front(s,'player','mend',{energy:20});stepBattle(s);assert.equal(s.battle.player.focus,12);
  front(s,'player','wolf',{energy:20});stepBattle(s);assert.equal(s.battle.player.focus,12);
  front(s,'player','ancient',{energy:0});assert.equal(stepBattle(s).type,'charge');assert.equal(s.battle.player.focus,12);
  s.battle.player.discard.push(...s.battle.player.draw);s.battle.player.draw=[];s.battle.actor='player';assert.equal(stepBattle(s).type,'shuffle');assert.equal(s.battle.player.focus,12);
  front(s,'player','claw',{energy:20,form:'druid',combo:0});const attack=stepBattle(s);assert.equal(attack.rawDamage,18);assert.equal(attack.focusSpent,12);assert.equal(s.battle.player.focus,0);
});

test('linked cards test the state before their own effects and scale their conditional rewards',()=>{
  const scenarios=[
    ['pounce',{target:{poison:1}},'rawDamage',8,12,'맹독 사냥'],
    ['bite',{source:{shield:8}},'rawDamage',11,16,'보호막 강타'],
    ['venom',{target:{poison:1}},'poison',4,7,'맹독 증폭'],
    ['storm',{target:{burn:1}},'shock',3,6,'화염 전도'],
    ['harvest',{target:{shock:1}},'energyGained',3,4,'감전 수확'],
    ['ancient',{source:{focus:4}},'rawDamage',24,32,'집중 강타'],
  ];
  for(const [id,condition,key,plain,prepared,name] of scenarios){
    const events=[];
    for(const ready of [false,true]){
      const s=fresh();front(s,'player',id,{energy:10,focus:0,shield:0,combo:0,form:'druid',...(ready?condition.source:{})});Object.assign(s.battle.enemy,{poison:0,burn:0,shock:0,shield:0,...(ready?condition.target:{})});events.push(stepBattle(s));
    }
    assert.equal(events[0][key],plain,`${id} unprepared`);assert.equal(events[1][key],prepared,`${id} prepared`);
    assert.equal(events[0].links.some(link=>link.name===name),false);assert.equal(events[1].links.some(link=>link.name===name),true);
  }
  for(const id of ['bark','rally','pounce','bite','venom','storm','harvest','ancient']){
    const card=describeCard(id);assert.ok(card.linkText);assert.ok(card.linkShort);assert.equal(card.linkPartners.length,2);assert.ok(card.linkPartners.every(partner=>CARDS[partner]));
  }
  assert.deepEqual([1,2,3].map(tier=>describeCard({id:'pounce',tier}).poisonHitBonus),[2,3,4]);
  assert.deepEqual([1,2,3].map(tier=>describeCard({id:'bite',tier}).shieldDamageBonus),[5,7,9]);
  assert.deepEqual([1,2,3].map(tier=>describeCard({id:'bark',tier}).focus),[2,3,4]);
  const unchanged=fresh();front(unchanged,'player','venom',{energy:10});assert.equal(stepBattle(unchanged).poison,4,'venom cannot prime its own conditional bonus');
});

test('wolf keeps pursuit through energy cards and adds damage without repeating card status effects',()=>{
  const s=fresh();sequence(s,'player',['claw','sap','claw','storm','mend','bark'],{energy:20,form:'wolf',combo:0});
  assert.equal(stepBattle(s).rawDamage,6);assert.equal(s.battle.player.combo,1);
  const energy=stepBattle(s);assert.equal(energy.energyGained,2);assert.equal(s.battle.player.combo,1);
  assert.equal(stepBattle(s).rawDamage,8);assert.equal(s.battle.player.combo,2);
  const third=stepBattle(s);assert.equal(third.extraHits,1);assert.equal(third.rawDamage,14);assert.equal(third.shock,3);assert.equal(s.battle.enemy.shock,3);assert.equal(third.energySpent,2);assert.ok(third.links.some(link=>link.name==='늑대 추격'&&link.kind==='form'));
  stepBattle(s);assert.equal(s.battle.player.combo,0);
});

test('bear counters blocked attacks once per card, respects piercing and cannot retaliate after lethal damage',()=>{
  const s=fresh();front(s,'player','pounce',{energy:10,form:'bear',shield:10});s.battle.player.draw[0].tier=3;Object.assign(s.battle.enemy,{form:'bear',shield:100});
  const counter=stepBattle(s);assert.equal(counter.counterRawDamage,6);assert.equal(counter.counterDamage,0);assert.equal(counter.counterAbsorbed,6);assert.equal(counter.links.filter(link=>link.name==='곰 반격').length,1);assert.equal(counter.links.find(link=>link.name==='곰 반격').actor,'enemy');assert.equal(s.battle.player.shield,4);assert.equal(s.stats.blocked,6);
  const pierce=fresh();front(pierce,'player','talon',{energy:4});Object.assign(pierce.battle.enemy,{form:'bear',shield:10});assert.equal(stepBattle(pierce).counterDamage,0);assert.equal(pierce.battle.enemy.shield,10);
  const lethal=fresh();front(lethal,'player','claw',{energy:4});Object.assign(lethal.battle.enemy,{form:'bear',shield:2,hp:1});const death=stepBattle(lethal);assert.equal(death.counterRawDamage,0);assert.equal(death.victory,true);
  const defender=fresh();front(defender,'enemy','claw',{energy:4,shield:0});Object.assign(defender.battle.player,{form:'bear',shield:10});const response=stepBattle(defender);assert.equal(response.counterDamage,3);assert.equal(defender.stats.damage,3);assert.equal(defender.stats.blocked,6);
});

test('wyvern consumes only preexisting poison for one piercing reaction on burn or shock application',()=>{
  const s=fresh();front(s,'player','storm',{energy:4,form:'wyvern'});Object.assign(s.battle.enemy,{poison:5,burn:1,shield:30});
  const blast=stepBattle(s);assert.equal(blast.damage,3);assert.equal(blast.shock,6);assert.equal(blast.reactionConsumed,4);assert.equal(blast.reactionDamage,8);assert.equal(s.battle.enemy.hp,59);assert.equal(s.battle.enemy.poison,3);assert.equal(s.battle.enemy.shield,30);assert.equal(s.stats.damage,11);assert.equal(blast.links.filter(link=>link.name==='독성 폭발').length,1);
  const first=fresh();front(first,'player','storm',{energy:4,form:'wyvern'});const prime=stepBattle(first);assert.equal(prime.poison,2);assert.equal(prime.reactionConsumed,0);assert.equal(prime.reactionDamage,0);
  const energy=fresh();front(energy,'player','kindle',{energy:4,form:'wyvern'});Object.assign(energy.battle.enemy,{poison:3,shield:99});const fire=stepBattle(energy);assert.equal(fire.rawDamage,0);assert.equal(fire.reactionDamage,6);assert.equal(fire.reactionConsumed,3);assert.equal(energy.battle.enemy.poison,0);assert.equal(energy.battle.enemy.shield,99);
});

test('wyvern reaction restores only consumed poison once per card, with a maximum-health cap on either side',()=>{
  for(const actor of ['player','enemy'])for(const [hp,poison,expected] of [[40,7,4],[40,1,1],[69,7,1],[70,7,0],[40,0,0]]){
    const s=fresh(),other=actor==='player'?'enemy':'player';
    front(s,actor,'storm',{energy:4,form:'wyvern',hp});Object.assign(s.battle[other],{poison,burn:1,shield:30});
    const event=stepBattle(s);
    assert.equal(event.reactionHeal,expected,`${actor}: hp ${hp}, poison ${poison}`);
    assert.equal(s.battle[actor].hp,hp+expected);assert.equal(event.heal,0,'card healing remains separate');
    assert.equal(event.links.filter(link=>link.name==='독성 폭발').length,poison>0?1:0);
    assert.equal(event.reactionConsumed,Math.min(4,poison));
  }
  const support=fresh();front(support,'player','kindle',{energy:4,form:'wyvern',hp:40});support.battle.enemy.poison=3;
  const event=stepBattle(support);assert.equal(event.reactionHeal,3);assert.equal(event.heal,0);assert.equal(support.battle.player.hp,43);assert.equal(event.links.filter(link=>link.name==='독성 폭발').length,1);
  const missed=fresh();front(missed,'player','storm',{energy:0,form:'wyvern',hp:40});missed.battle.enemy.poison=4;
  assert.equal(stepBattle(missed).reactionHeal,0);assert.equal(missed.battle.player.hp,40,'failed charging never restores health');
});

test('reaction healing cannot revive a fighter that is already dead',()=>{
  for(const actor of ['player','enemy']){
    const s=fresh(),other=actor==='player'?'enemy':'player';front(s,actor,'kindle',{energy:4,form:'wyvern',hp:0});s.battle[other].poison=4;
    const event=stepBattle(s);assert.equal(event.reactionConsumed,4);assert.equal(event.reactionHeal,0);assert.equal(s.battle[actor].hp,0);
  }
});

test('prepared synergy conditions remain identical for every shared card and form on both sides',()=>{
  for(const card of Object.keys(CARDS))for(const form of Object.keys(FORMS)){
    const events=[],sources=[],targets=[];
    for(const actor of ['player','enemy']){
      const s=fresh(11),other=actor==='player'?'enemy':'player';
      sequence(s,actor,[card,'bark','claw','bark','claw','mend'],{energy:5,hp:45,shield:12,focus:6,form,poison:2,burn:3,shock:1,combo:2});
      sequence(s,other,['bark','claw','bark','claw','mend','bite'],{energy:4,hp:70,shield:25,focus:3,form:'bear',poison:4,burn:2,shock:3,combo:0});s.battle.actor=actor;
      const event=stepBattle(s);for(const link of event.links)link.actor=link.actor===actor?'source':'target';delete event.actor;delete event.target;delete event.nextActor;events.push(event);
      const source=structuredClone(s.battle[actor]),target=structuredClone(s.battle[other]);delete source.name;delete target.name;sources.push(source);targets.push(target);
    }
    assert.deepEqual(events[0],events[1],`${card}/${form} prepared event`);assert.deepEqual(sources[0],sources[1],`${card}/${form} prepared source`);assert.deepEqual(targets[0],targets[1],`${card}/${form} prepared target`);
  }
});

test('v4 draft, camp and mid-battle saves migrate to v5 without repeating progress or effects',()=>{
  const drafting=createRun(44);chooseDraft(drafting,drafting.draft.offers[0].uid);
  const fighting=fixture(44);startBattle(fighting);stepBattle(fighting);
  for(const current of [drafting,camp(44),fighting]){
    const legacy=structuredClone(current);legacy.version=4;if(legacy.battle)for(const actor of ['player','enemy'])delete legacy.battle[actor].focus;
    const raw=serialize(legacy),restored=restoreRun(raw),expected=structuredClone(legacy);expected.version=5;if(expected.battle)for(const actor of ['player','enemy'])expected.battle[actor].focus=0;
    assert.ok(restored);assert.equal(serialize(restored),serialize(expected));assert.equal(serialize(legacy),raw);assert.ok(restoreRun(serialize(restored)));
    if(restored.phase==='battle'){assert.deepEqual(stepBattle(restored),stepBattle(expected));assert.equal(serialize(restored),serialize(expected));}
  }
  for(const value of [undefined,-1,13,1.5,'4']){const invalid=fresh();invalid.battle.player.focus=value;assert.equal(restoreRun(invalid),null);}
});

test('save validation rejects old format, broken pools, altered battle snapshots and invalid charges',()=>{
  const s=fresh();for(const raw of ['',null,'{','{}',serialize({...s,version:3}),serialize({...s,hp:999})])assert.equal(restoreRun(raw),null);
  const cases=[state=>{state.battle.player.draw[0].charge=999;},state=>{state.battle.player.discard.push(state.battle.player.draw[0]);},state=>{state.battle.enemy.form='enemy';},state=>{state.opponent.deck[0].id='exclusive-enemy-card';},state=>{state.opponent.deck[1].sticker='top';},state=>{state.battle.enemy.draw[0].tier=3;},state=>{state.battle.turnCard=99;}];
  for(const corrupt of cases){const bad=structuredClone(s);corrupt(bad);assert.equal(restoreRun(bad),null);}
});

test('save validation rejects inconsistent choices and stale exploration snapshots',()=>{
  const draft=createRun(2);
  for(const corrupt of [s=>{s.draft.picked=1;},s=>{s.draft.offers[0].id='claw';},s=>{s.draft.offers[1].id=s.draft.offers[0].id;},s=>{s.draft.offers[0].uid='d-start-1-0';},s=>{s.draft.offers[0].tier=2;},s=>{s.gold=99;}]){const bad=structuredClone(draft);corrupt(bad);assert.equal(restoreRun(bad),null);}
  const exploring=explore(2);
  for(const corrupt of [s=>{s.exploration.stage=1;},s=>{s.exploration.resolved=true;},s=>{s.exploration.offers[0].eventId='unknown';},s=>{s.exploration.offers[1].eventId=s.exploration.offers[0].eventId;},s=>{s.exploration.selectedUid=s.exploration.offers[0].uid;},s=>{s.phase='camp';}]){const bad=structuredClone(exploring);corrupt(bad);assert.equal(restoreRun(bad),null);}
  const event=withEvent('merchant');chooseEncounter(event,event.exploration.offers.find(offer=>offer.eventId==='merchant').uid);assert.ok(restoreRun(event));event.draft.tier=1;assert.equal(restoreRun(event),null);
});

test('event and battle gains fill only available deck space and convert a full collection to gold',()=>{
  const s=withEvent('thicket');
  while(activeDeck(s).length<17)s.collection.push({uid:`c${s.nextUid++}`,id:'claw',tier:1,inDeck:true,sticker:'none'});
  const bench={uid:`c${s.nextUid++}`,id:'bark',tier:1,inDeck:false,sticker:'none'};s.collection.push(bench);
  chooseEncounter(s,s.exploration.offers.find(offer=>offer.eventId==='thicket').uid);
  chooseDraft(s,s.draft.offers[0].uid);assert.equal(activeDeck(s).length,18);assert.equal(s.collection.at(-1).inDeck,true);
  chooseDraft(s,s.draft.offers[0].uid);assert.equal(activeDeck(s).length,18);assert.equal(s.collection.at(-1).inDeck,false);assert.equal(bench.inDeck,false);assert.ok(restoreRun(s));
  startBattle(s);forceWin(s);const count=s.collection.length;chooseReward(s,s.rewards[0].id);assert.equal(s.collection.length,count+1);assert.equal(s.collection.at(-1).inDeck,false);assert.equal(activeDeck(s).length,18);assert.ok(restoreRun(s));
  const full=withEvent('gift');while(full.collection.length<36)full.collection.push({uid:`c${full.nextUid++}`,id:'claw',tier:1,inDeck:false,sticker:'none'});
  chooseEncounter(full,full.exploration.offers.find(offer=>offer.eventId==='gift').uid);const gold=full.gold;const result=chooseDraft(full,full.draft.offers[0].uid);assert.equal(result.converted,true);assert.equal(full.collection.length,36);assert.equal(full.gold,gold+3);assert.ok(restoreRun(full));
  startBattle(full);forceWin(full);const rewardGold=full.gold;assert.equal(chooseReward(full,full.rewards[0].id).converted,true);assert.equal(full.gold,rewardGold+9);assert.equal(full.collection.length,36);assert.ok(restoreRun(full));
});

test('victory rewards preserve the campaign and final victory ends the run',()=>{
  const s=fresh();
  for(let stage=0;stage<ENCOUNTERS.length;stage++){
    forceWin(s);assert.equal(s.phase,stage===4?'won':'reward');assert.ok(restoreRun(serialize(s)));assert.equal(stepBattle(s).type,'idle');
    if(stage<4){const count=s.collection.length,deckCount=activeDeck(s).length,gold=s.gold;s.hp=50;s.battle.player.hp=50;assert.equal(chooseReward(s,'bad').ok,false);assert.equal(chooseReward(s,s.rewards[0].id).ok,true);assert.equal(s.collection.length,count+1);assert.equal(s.collection.at(-1).inDeck,deckCount<DECK_MAX);assert.equal(s.gold,gold+6);assert.equal(s.hp,68);assert.equal(s.stage,stage+1);assert.equal(s.phase,'explore');assert.equal(s.opponent,null);assert.ok(restoreRun(serialize(s)));resolveExplore(s);assert.equal(s.opponent.stage,stage+1);startBattle(s);}
  }
  assert.equal(s.stats.victories,5);
});

test('fatigue occurs once on turn end and guarantees finite passive combat',()=>{
  const s=fresh();s.battle.turn=41;front(s,'player','claw',{energy:4,hp:2,shield:999});s.hp=2;assert.equal(stepBattle(s).fatigue,0);assert.equal(s.battle.player.hp,2);
  front(s,'player','claw',{energy:1});assert.equal(stepBattle(s).fatigue,1);assert.equal(s.battle.player.hp,1);
  s.battle.turn=43;front(s,'player','claw',{energy:1});assert.equal(stepBattle(s).fatigue,1);assert.equal(s.phase,'lost');assert.ok(restoreRun(serialize(s)));
  const passive=fresh();for(const actor of ['player','enemy'])sequence(passive,actor,Array(6).fill('bark'),{energy:4});assert.ok(end(passive)<400);
});

test('seeded strategic campaigns finish and serialize every combat step correctly',()=>{
  for(const seed of [1,2,3,7,19,41,101,999]){
    const s=createRun(seed);
    let turns=0;
    while(!['won','lost'].includes(s.phase)&&turns++<60){
      if(s.phase==='draft')chooseDraft(s,s.draft.offers[0].uid);
      else if(s.phase==='explore')resolveExplore(s);
      else if(s.phase==='camp'){
        for(const offer of [...s.shop])if(s.gold>=offer.price&&['pounce','venom','frost','bite','bark','mend','sap','harvest','nettle','static'].includes(offer.id)){buyCard(s,offer.uid);if(activeDeck(s).length<15)editDeck(s,s.collection.at(-1).uid,true);}
        for(const card of [...s.collection])if(card.inDeck&&activeDeck(s).length>7)upgradeCard(s,card.uid);
        startBattle(s);let steps=0;while(s.phase==='battle'&&steps++<2000){stepBattle(s);assert.ok(restoreRun(serialize(s)),`seed ${seed}, turn ${s.battle.turn}, card ${s.battle.turnCard}`);}assert.ok(steps<2000);
      } else {const reward=s.rewards.find(r=>CARDS[r.cardId].type==='attack')||s.rewards[0];chooseReward(s,reward.id);}
      assert.ok(restoreRun(serialize(s)),`seed ${seed}, ${s.phase}`);
    }
    assert.ok(['won','lost'].includes(s.phase));assert.ok(restoreRun(serialize(s)));
  }
});
