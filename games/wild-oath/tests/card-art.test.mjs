import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CARDS,describeCard} from '../rules.mjs';
import {cardArtClass} from '../card-art.mjs';

test('all shared cards and upgrade tiers use an existing action illustration or their form portrait',()=>{
  const css=readFileSync(new URL('../card-art.css',import.meta.url),'utf8');
  const used=new Set();
  for(const card of Object.values(CARDS)){
    const expected=cardArtClass(describeCard(card.id));
    for(const tier of [1,2,3])assert.equal(cardArtClass(describeCard({id:card.id,tier})),expected);
    if(card.form){assert.equal(expected,`art art-${card.form}`);continue;}
    assert.match(expected,/^art card-illustration illustration-[a-z]+$/);
    const art=expected.split('illustration-')[1];used.add(art);
    assert.ok(css.includes(`.illustration-${art}{--card-image:url('assets/cards-v2/${art}.webp')}`));
    assert.ok(statSync(new URL(`../assets/cards-v2/${art}.webp`,import.meta.url)).size>0);
  }
  assert.equal(used.size,12);
  for(const [a,b] of [['claw','bark'],['sap','storm'],['mend','venom'],['claw','pounce']])assert.notEqual(cardArtClass(CARDS[a]),cardArtClass(CARDS[b]));
});

test('the shipped 2:1 illustration family matches its provenance manifest within the loading budget',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../assets/cards-v2/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.assets.length,12);let bytes=0;
  for(const asset of manifest.assets){
    assert.deepEqual(asset.size,[320,160]);
    const data=readFileSync(new URL(`../assets/cards-v2/${asset.file}`,import.meta.url));
    assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');
    assert.equal(data.length,asset.bytes);bytes+=data.length;
    assert.equal(createHash('sha256').update(data).digest('hex'),asset.sha256);
  }
  assert.ok(bytes<200000,`card artwork budget: ${bytes} bytes`);
});
