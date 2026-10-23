import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THREE, GLTFLoader } from '../asset-loader.mjs';
import { clone as cloneSkeleton } from '../vendor/SkeletonUtils.js';
import { ACTOR_PALETTES, applyActorAppearance, getActorPalette } from '../actor-appearance.mjs';

const sources = new Map();
async function source(kind) {
  if (!sources.has(kind)) sources.set(kind, (async () => {
    const bytes = readFileSync(new URL(`../assets/models/mini-dungeon/character-${kind}.glb`, import.meta.url));
    const jsonLength = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
    // Node has no image decoder. Keep the real mesh, skin and animation chunks,
    // replacing only image loading with a shared test Texture after parsing.
    for (const material of json.materials) delete material.pbrMetallicRoughness.baseColorTexture;
    const encoded = Buffer.from(JSON.stringify(json));
    const paddedLength = Math.ceil(encoded.length / 4) * 4;
    const binChunk = bytes.subarray(20 + jsonLength);
    const glb = Buffer.alloc(20 + paddedLength + binChunk.length, 0x20);
    bytes.copy(glb, 0, 0, 12);
    glb.writeUInt32LE(glb.length, 8);
    glb.writeUInt32LE(paddedLength, 12);
    glb.writeUInt32LE(0x4e4f534a, 16);
    encoded.copy(glb, 20);
    binChunk.copy(glb, 20 + paddedLength);
    const parsed = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
    const texture = new THREE.Texture();
    parsed.scene.traverse((node) => { if (node.isMesh) node.material.map = texture; });
    return { ...parsed, texture };
  })());
  return sources.get(kind);
}

after(async () => {
  for (const pending of sources.values()) {
    const parsed = await pending;
    const geometries = new Set(), materials = new Set();
    parsed.scene.traverse((node) => {
      if (node.isMesh) { geometries.add(node.geometry); materials.add(node.material); }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    parsed.texture.dispose();
  }
});

async function actor(t, kind = 'human') {
  const parsed = await source(kind);
  const object = cloneSkeleton(parsed.scene);
  object.userData.assetKey = kind;
  object.traverse((node) => { if (node.isMesh) node.material = node.material.clone(); });
  t.after(() => object.traverse((node) => { if (node.isMesh) node.material.dispose(); }));
  return { object, body: object.getObjectByName('body-mesh'), head: object.getObjectByName('head-mesh'), parsed };
}

function compile(material) {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  material.onBeforeCompile(shader, null);
  return shader;
}

test('player, customers, staff, allies and enemies have stable distinct palettes regardless of job accessories', () => {
  for (const kind of ['warrior', 'archer', 'mage']) {
    assert.equal(getActorPalette({ id: `c-${kind}`, kind }), ACTOR_PALETTES.customer);
    assert.equal(getActorPalette({ id: `d-${kind}`, kind }), ACTOR_PALETTES.ally);
  }
  assert.equal(getActorPalette({ id: 'player', kind: 'player' }), ACTOR_PALETTES.player);
  assert.equal(getActorPalette({ id: 's-1', kind: 'staff' }), ACTOR_PALETTES.staff);
  assert.equal(getActorPalette({ id: 'e-1', kind: 'orc' }), ACTOR_PALETTES.enemy);
  assert.equal(getActorPalette({ kind: 'soldier' }), ACTOR_PALETTES.enemy);
  assert.equal(new Set(Object.values(ACTOR_PALETTES).map(({ body }) => body)).size, 5);
  assert.ok(Object.isFrozen(ACTOR_PALETTES.player.clothUv));
});

test('actual human body gets role uniforms while head, shared geometry, atlas and skinning remain intact', async (t) => {
  const player = await actor(t), customer = await actor(t);
  assert.ok(player.body.isSkinnedMesh && player.head.isSkinnedMesh);
  const geometry = player.body.geometry, uv = geometry.getAttribute('uv');
  const uvBefore = [...uv.array], skeleton = player.body.skeleton;
  const headCompile = player.head.material.onBeforeCompile;
  const headMaterial = player.head.material;
  assert.equal(player.body.geometry, customer.body.geometry);
  assert.notEqual(player.body.material, customer.body.material);
  assert.equal(player.body.material.map, customer.body.material.map);
  assert.equal(applyActorAppearance(player.object, { id: 'player', kind: 'player' }), player.object);
  applyActorAppearance(customer.object, { id: 'c-1', kind: 'mage' });
  const playerShader = compile(player.body.material), customerShader = compile(customer.body.material);
  assert.deepEqual(playerShader.uniforms.actorClothUv.value.toArray(), ACTOR_PALETTES.player.clothUv);
  assert.deepEqual(playerShader.uniforms.actorTrimUv.value.toArray(), ACTOR_PALETTES.player.trimUv);
  assert.deepEqual(customerShader.uniforms.actorClothUv.value.toArray(), ACTOR_PALETTES.customer.clothUv);
  assert.equal(player.body.material.customProgramCacheKey(), customer.body.material.customProgramCacheKey());
  assert.equal(playerShader.vertexShader, customerShader.vertexShader);
  assert.equal(player.head.material, headMaterial);
  assert.equal(player.head.material.onBeforeCompile, headCompile);
  assert.equal(player.body.geometry, geometry);
  assert.equal(player.body.geometry.getAttribute('uv'), uv);
  assert.deepEqual([...uv.array], uvBefore);
  assert.equal(player.body.skeleton, skeleton);
  assert.equal(player.body.material.map, player.parsed.texture);
  assert.ok(geometry.getAttribute('skinIndex') && geometry.getAttribute('skinWeight'));
  assert.equal(player.object.getObjectByName('head-mesh').material.userData.actorPalette, undefined);
  assert.equal(player.object.getObjectByName('body-mesh').children.length, 0);
});

test('actual orc retains its green-skin stripe and original head with only the clothing shader installed', async (t) => {
  const { object, body, head } = await actor(t, 'orc');
  const uv = body.geometry.getAttribute('uv');
  let skinVertices = 0, clothingVertices = 0;
  for (let index = 0; index < uv.count; index++) {
    if (Math.abs(uv.getX(index) - .59375) < .0001) skinVertices++;
    if (Math.abs(uv.getX(index) - .09375) < .0001) clothingVertices++;
  }
  assert.ok(skinVertices > 0 && clothingVertices > uv.count / 2, 'real asset exposes distinct skin and clothing UVs');
  const headHook = head.material.onBeforeCompile, headMap = head.material.map;
  applyActorAppearance(object, { id: 'e-1', kind: 'orc' });
  const shader = compile(body.material);
  assert.equal(shader.uniforms.actorOrcBody.value, true);
  assert.deepEqual(shader.uniforms.actorClothUv.value.toArray(), ACTOR_PALETTES.enemy.clothUv);
  assert.equal(head.material.onBeforeCompile, headHook);
  assert.equal(head.material.map, headMap);
  assert.equal(body.geometry.getAttribute('uv'), uv);
  assert.ok(shader.vertexShader.includes('vMapUv = actorAppearanceUv(vMapUv);'));
  assert.equal(shader.fragmentShader, THREE.ShaderLib.standard.fragmentShader);
});

test('customers use a blue head cover across the majority of the real head surface while skin and face stripes stay separate', async (t) => {
  const { object, body, head } = await actor(t);
  const geometry = head.geometry, uv = geometry.getAttribute('uv'), positions = geometry.getAttribute('position');
  const originalUv = [...uv.array], headMaterial = head.material, texture = head.material.map;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let totalArea = 0, coverArea = 0, skinArea = 0;
  for (let index = 0; index < geometry.index.count; index += 3) {
    const ia = geometry.index.getX(index), ib = geometry.index.getX(index + 1), ic = geometry.index.getX(index + 2);
    a.fromBufferAttribute(positions, ia);
    b.fromBufferAttribute(positions, ib).sub(a);
    c.fromBufferAttribute(positions, ic).sub(a);
    const area = b.cross(c).length() / 2;
    totalArea += area;
    if (Math.abs(uv.getX(ia) - .21875) < .0001) coverArea += area;
    if (Math.abs(uv.getX(ia) - .34375) < .0001) skinArea += area;
  }
  assert.ok(coverArea / totalArea > .6, 'the cover is a substantial visible area, not a tiny accent');
  assert.ok(skinArea / totalArea > .3, 'the original separate skin surface is retained');
  applyActorAppearance(object, { id: 'c-2', kind: 'warrior' });
  const headShader = compile(head.material), bodyShader = compile(body.material);
  assert.equal(headShader.uniforms.actorHeadMesh.value, true);
  assert.equal(headShader.uniforms.actorHeadTint.value, true);
  assert.equal(headShader.uniforms.actorOrcBody.value, false);
  assert.equal(bodyShader.uniforms.actorHeadMesh.value, false);
  assert.equal(head.material.customProgramCacheKey(), body.material.customProgramCacheKey());
  assert.equal(headShader.vertexShader, bodyShader.vertexShader);
  assert.deepEqual(headShader.uniforms.actorClothUv.value.toArray(), ACTOR_PALETTES.customer.clothUv);
  assert.equal(ACTOR_PALETTES.customer.trimUv[0], ACTOR_PALETTES.customer.clothUv[0], 'shoulders use the same blue stripe');
  assert.equal(head.material, headMaterial);
  assert.equal(head.material.map, texture);
  assert.equal(head.geometry, geometry);
  assert.deepEqual([...uv.array], originalUv);
  applyActorAppearance(object, { id: 'd-2', kind: 'warrior' });
  assert.equal(compile(head.material).uniforms.actorHeadTint.value, false, 'the head tint belongs only to customers');
});

test('repeat application reuses hooks, uniforms and all owned/shared resources without extra meshes', async (t) => {
  const { object, body } = await actor(t);
  const meshCount = () => { let count = 0; object.traverse((node) => { if (node.isMesh) count++; }); return count; };
  const before = meshCount(), material = body.material, geometry = body.geometry, texture = body.material.map;
  applyActorAppearance(object, { id: 's-1', kind: 'staff' });
  const hook = material.onBeforeCompile, version = material.version;
  const uniforms = compile(material).uniforms;
  for (let index = 0; index < 10; index++) applyActorAppearance(object, { id: 's-1', kind: 'staff' });
  const repeated = compile(material);
  assert.equal(material.onBeforeCompile, hook);
  assert.equal(material.version, version);
  assert.equal(repeated.uniforms.actorClothUv, uniforms.actorClothUv);
  assert.equal(repeated.uniforms.actorTrimUv, uniforms.actorTrimUv);
  assert.equal(body.material, material);
  assert.equal(body.geometry, geometry);
  assert.equal(body.material.map, texture);
  assert.equal(meshCount(), before);
  assert.equal(repeated.vertexShader.split('vMapUv = actorAppearanceUv(vMapUv);').length - 1, 1);
});
