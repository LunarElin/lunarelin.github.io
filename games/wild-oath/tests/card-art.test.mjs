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
    assert.equal(art,card.id,'different effects never borrow another card picture');
    assert.ok(css.includes(`.illustration-${art}{--card-image:url('assets/cartoon-v4/cards/${art}.webp')}`));
    assert.ok(statSync(new URL(`../assets/cartoon-v4/cards/${art}.webp`,import.meta.url)).size>0);
  }
  assert.equal(used.size,25);
});

test('the active portrait and 2:1 action family match their manifest within the loading budget',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../assets/cartoon-v4/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.assets.length,25);let bytes=0;
  assert.equal(new Set(manifest.assets.map(asset=>asset.sha256)).size,25,'25 cards ship distinct image content');
  assert.deepEqual(manifest.portrait.size,[1152,768]);
  assert.deepEqual(manifest.portrait.grid,[3,2]);
  for(const asset of [manifest.portrait,...manifest.assets]){
    if(asset!==manifest.portrait)assert.deepEqual(asset.size,[320,160]);
    const data=readFileSync(new URL(`../assets/cartoon-v4/${asset.file}`,import.meta.url));
    assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');
    assert.equal(data.toString('ascii',12,16),'VP8 ','the opaque family is encoded as lossy WebP');
    assert.deepEqual([data.readUInt16LE(26)&0x3fff,data.readUInt16LE(28)&0x3fff],asset.size,'actual image dimensions match the slot');
    assert.equal(data.length,asset.bytes);bytes+=data.length;
    assert.equal(createHash('sha256').update(data).digest('hex'),asset.sha256);
  }
  assert.equal(bytes,manifest.total_bytes);
  assert.ok(bytes<550000,`active artwork budget: ${bytes} bytes`);
  assert.ok(manifest.card_bytes<350000);
  const css=readFileSync(new URL('../card-art.css',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(css.includes(".art{background-image:url('assets/cartoon-v4/portraits.webp')}"));
  assert.ok(html.includes('href="assets/cartoon-v4/portraits.webp" as="image"'));
  assert.ok(!css.includes('assets/cards-v2/'));
  assert.ok(!css.includes('assets/tavern-v3/'));
});
