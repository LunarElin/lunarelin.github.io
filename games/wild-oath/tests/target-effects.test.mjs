import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {createRun,chooseDraft,chooseEncounter,startBattle,stepBattle,describeCard,serialize} from '../rules.mjs';
import {impactBeats,targetImpactKind,TARGET_EFFECT_TEXTURES,targetEffectVisual} from '../combat-presentation.mjs';

function rgbaPng(bytes) {
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  let width,height;const compressed=[];
  for(let offset=8;offset<bytes.length;){
    const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length);
    if(type==='IHDR'){
      width=data.readUInt32BE(0);height=data.readUInt32BE(4);
      assert.equal(data[8],8,'8-bit channels');assert.equal(data[9],6,'real RGBA channels');assert.equal(data[12],0,'noninterlaced PNG');
    }
    if(type==='IDAT')compressed.push(data);
    offset+=length+12;
  }
  const raw=inflateSync(Buffer.concat(compressed)),stride=width*4,pixels=Buffer.alloc(stride*height);
  assert.equal(raw.length,(stride+1)*height);
  const paeth=(left,above,corner)=>{
    const p=left+above-corner,a=Math.abs(p-left),b=Math.abs(p-above),c=Math.abs(p-corner);
    return a<=b&&a<=c?left:b<=c?above:corner;
  };
  let cursor=0;
  for(let y=0;y<height;y++){
    const filter=raw[cursor++];assert.ok(filter<=4);
    for(let x=0;x<stride;x++){
      const index=y*stride+x,left=x>=4?pixels[index-4]:0,above=y?pixels[index-stride]:0,corner=y&&x>=4?pixels[index-stride-4]:0;
      const predictor=filter===1?left:filter===2?above:filter===3?Math.floor((left+above)/2):filter===4?paeth(left,above,corner):0;
      pixels[index]=(raw[cursor++]+predictor)&255;
    }
  }
  return {width,height,pixels};
}

function battle() {
  const state=createRun(41);
  while(state.phase==='draft')chooseDraft(state,state.draft.offers[0].uid);
  chooseEncounter(state,state.exploration.offers[0].uid);
  while(state.phase==='draft')chooseDraft(state,state.draft.offers[0].uid);
  assert.equal(startBattle(state).ok,true);
  return state;
}

function play(id,{actor='player',source={},target={},turn=1}={}) {
  const state=battle(),other=actor==='player'?'enemy':'player';
  state.battle.actor=actor;state.battle.turn=turn;
  Object.assign(state.battle[actor],{energy:10,form:'druid',shield:0,focus:0,combo:0,...source});
  Object.assign(state.battle[other],{hp:70,form:'druid',shield:0,poison:0,burn:0,shock:0,...target});
  state.battle[actor].draw=[{uid:'target-effect-card',id,tier:1,charge:0},...state.battle[actor].draw];
  const event=stepBattle(state);
  return {state,event,beats:impactBeats(event),card:describeCard(id)};
}

test('resolved attack types select distinct target effects on either side',()=>{
  for(const actor of ['player','enemy'])for(const [id,expected] of [['claw','claw'],['ember','fire'],['storm','shock'],['venom','poison']]){
    const {event,beats,card}=play(id,{actor});
    assert.equal(beats[0].target,event.target);
    assert.equal(targetImpactKind(beats[0],card),expected);
  }
});

test('target visuals use compact local textures with readable effect emblems',()=>{
  assert.deepEqual(TARGET_EFFECT_TEXTURES,['fire','ring','smoke','splash']);
  const expected={
    claw:{texture:'splash',emblem:'attack'},
    counter:{texture:'splash',emblem:'counter'},
    fire:{texture:'fire',emblem:null},
    poison:{texture:'splash',emblem:'poison'},
    shock:{texture:'smoke',emblem:'shock'},
    shield:{texture:'ring',emblem:'defense'},
    heal:{texture:'ring',emblem:'heal'},
    energy:{texture:'ring',emblem:'energy'},
    form:{texture:'smoke',emblem:'form'},
    charge:{texture:'ring',emblem:'charge'},
  };
  const used=new Set();
  for(const [kind,visual] of Object.entries(expected)){
    const actual=targetEffectVisual(kind);
    assert.deepEqual(actual,visual,kind);
    assert.ok(TARGET_EFFECT_TEXTURES.includes(actual.texture),`${kind} has a shipped texture`);
    assert.match(actual.texture,/^[a-z]+$/,'texture ids cannot include external URLs or paths');
    assert.ok(Object.isFrozen(actual),`${kind} cannot drift between warming and rendering`);
    assert.throws(()=>{actual.texture='scratch';},TypeError);
    assert.deepEqual(targetEffectVisual(kind),visual);
    used.add(actual.texture);
  }
  assert.deepEqual([...used].sort(),[...TARGET_EFFECT_TEXTURES].sort(),'the registry has no unused warmed images');
  assert.ok(Object.isFrozen(TARGET_EFFECT_TEXTURES));
  assert.throws(()=>TARGET_EFFECT_TEXTURES.push('flare'),TypeError);
});

test('target visuals use the same immutable fallback for unknown and inherited names',()=>{
  const fallback=targetEffectVisual('claw');
  for(const kind of [undefined,null,0,{},[],Symbol('unknown'),'unknown','constructor','__proto__','toString','../scratch','https://example.com/beam.png','data:image/png;base64,']){
    assert.equal(targetEffectVisual(kind),fallback);
  }
  for(const actor of ['player','enemy']){
    const {state,beats,card}=play('pounce',{actor,source:{form:'wolf',combo:2},target:{form:'bear',shield:10}}),saved=serialize(state);
    for(const beat of beats){
      const kind=targetImpactKind(beat,card);
      if(kind)assert.ok(TARGET_EFFECT_TEXTURES.includes(targetEffectVisual(kind).texture));
    }
    assert.equal(serialize(state),saved,'choosing visuals cannot alter the battle');
  }
});

test('fully blocked impacts use shield and capped lethal follow-up hits do not invent an effect',()=>{
  for(const actor of ['player','enemy']){
    const blocked=play('ancient',{actor,target:{shield:100}});
    assert.equal(blocked.beats[0].damage,0);assert.equal(blocked.beats[0].absorbed,24);
    assert.equal(targetImpactKind(blocked.beats[0],blocked.card),'shield');
    const lethal=play('pounce',{actor,target:{hp:2}});
    assert.equal(targetImpactKind(lethal.beats[0],lethal.card),'claw');
    assert.equal(lethal.beats[1].damage,0);assert.equal(lethal.beats[1].absorbed,0);
    assert.equal(targetImpactKind(lethal.beats[1],lethal.card),null);
    const reaction=play('storm',{actor,source:{form:'wyvern'},target:{hp:1,poison:4}});
    assert.equal(reaction.beats.at(-1).kind,'reaction');assert.equal(reaction.event.reactionRawDamage,8);
    assert.equal(targetImpactKind(reaction.beats.at(-1),reaction.card),null);
  }
  assert.equal(targetImpactKind(),null);
  assert.equal(targetImpactKind({kind:'strike',damage:0,absorbed:0,rawDamage:999}),null);
});

test('counter and poison reaction retain their real targets independently of card owner',()=>{
  for(const actor of ['player','enemy']){
    const counter=play('pounce',{actor,source:{shield:2},target:{form:'bear',shield:10}}),last=counter.beats.at(-1);
    assert.equal(last.kind,'counter');assert.equal(last.actor,counter.event.target);assert.equal(last.target,actor);
    assert.equal(targetImpactKind(last,counter.card),'counter');
    const reaction=play('storm',{actor,source:{form:'wyvern',hp:40},target:{poison:4}}),burst=reaction.beats.at(-1);
    assert.equal(burst.kind,'reaction');assert.equal(burst.actor,actor);assert.equal(burst.target,reaction.event.target);
    assert.equal(targetImpactKind(burst,reaction.card),'poison');
    const shieldCounter=play('claw',{actor,source:{shield:10},target:{form:'bear',shield:10}});
    assert.equal(shieldCounter.beats.at(-1).damage,0);
    assert.equal(targetImpactKind(shieldCounter.beats.at(-1),shieldCounter.card),'shield');
  }
});

test('discard burn and shuffle poison are effects at the original actor, not at the opponent',()=>{
  for(const actor of ['player','enemy']){
    const burned=play('ancient',{actor,source:{energy:0,burn:5,shield:3}}),burn=burned.beats[0];
    assert.equal(burned.event.type,'charge');assert.equal(burn.kind,'burn');assert.equal(burn.target,actor);
    assert.equal(targetImpactKind(burn,burned.card),'fire');
    const state=battle(),other=actor==='player'?'enemy':'player';state.battle.actor=actor;
    Object.assign(state.battle[actor],{draw:[],poison:5,shield:6});
    const poison=impactBeats(stepBattle(state))[0];
    assert.equal(poison.kind,'poison');assert.equal(poison.actor,other);assert.equal(poison.target,actor);
    assert.equal(targetImpactKind(poison),'poison');
  }
});

test('shock targets the resolved shocked fighter while fatigue stays with its own actor',()=>{
  for(const actor of ['player','enemy']){
    const {event,beats,card}=play('kindle',{actor,source:{energy:0},target:{shock:5}});
    const shock=beats.find(beat=>beat.kind==='shock');assert.ok(shock);
    assert.equal(shock.target,event.target);assert.equal(targetImpactKind(shock,card),'shock');
    const fatigue=play('claw',{actor,source:{energy:1,draw:[]},turn:43});
    const tired=fatigue.beats.at(-1);assert.equal(tired.kind,'fatigue');assert.equal(tired.target,actor);
    assert.equal(targetImpactKind(tired,fatigue.card),'claw');
  }
});

test('target planning leaves saved combat and future actions unchanged',()=>{
  for(const actor of ['player','enemy']){
    const {state,event,beats,card}=play('pounce',{actor,source:{form:'wolf',combo:2,shield:2},target:{form:'bear',shield:10}});
    const saved=serialize(state),original=structuredClone(event),frozenCard=Object.freeze(card),expected=stepBattle(structuredClone(state));
    for(const beat of beats)targetImpactKind(Object.freeze(beat),frozenCard);
    assert.equal(serialize(state),saved);assert.deepEqual(event,original);
    assert.deepEqual(stepBattle(structuredClone(state)),expected);
  }
});

test('the shipped Kenney effects are licensed local alpha masks within the image budget',async()=>{
  const root=new URL('../assets/kenney-effects/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
  assert.equal(manifest.source_url,'https://kenney.nl/assets/particle-pack');assert.equal(manifest.license,'CC0-1.0');
  const license=await readFile(new URL(manifest.license_file,root),'utf8');
  assert.match(license,/Kenney/);assert.match(license,/Creative Commons Zero, CC0/);assert.match(license,/creativecommons\.org\/publicdomain\/zero\/1\.0/);
  const expected=['fire','ring','smoke','splash'];
  assert.deepEqual(manifest.assets.map(asset=>asset.id).sort(),expected);
  assert.deepEqual((await readdir(root)).filter(file=>file.endsWith('.png')).sort(),expected.map(id=>`${id}.png`));
  let total=0;
  for(const asset of manifest.assets){
    assert.equal(asset.file,`${asset.id}.png`);assert.ok(!asset.file.includes('/'));assert.match(asset.source_path,/^PNG \(Transparent\)\//);
    const bytes=await readFile(new URL(asset.file,root)),image=rgbaPng(bytes);total+=bytes.length;
    assert.equal(bytes.length,asset.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
    assert.equal(image.width,256);assert.equal(image.height,256);assert.equal(asset.width,image.width);assert.equal(asset.height,image.height);
    assert.deepEqual(asset.pivot,[.5,.5]);
    let alphaMin=255,alphaMax=0,transparent=0,colored=false;
    for(let i=0;i<image.pixels.length;i+=4){
      const alpha=image.pixels[i+3];alphaMin=Math.min(alphaMin,alpha);alphaMax=Math.max(alphaMax,alpha);
      if(!alpha)transparent++;
      else if(image.pixels[i]!==255||image.pixels[i+1]!==255||image.pixels[i+2]!==255)colored=true;
    }
    assert.equal(alphaMin,0);assert.ok(alphaMax>0);assert.equal(alphaMin,asset.alpha_min);assert.equal(alphaMax,asset.alpha_max);
    assert.equal(transparent,asset.transparent_pixels);assert.equal(image.width*image.height-transparent,asset.nontransparent_pixels);
    assert.ok(transparent>0&&transparent<image.width*image.height);assert.equal(colored,false,'visible pixels are tintable white, not baked backgrounds');
  }
  assert.equal(total,manifest.total_image_bytes);assert.ok(manifest.budget_bytes<=75000);assert.ok(total<=manifest.budget_bytes);
});
