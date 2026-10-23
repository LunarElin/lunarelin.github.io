import { THREE } from './asset-loader.mjs';

function palette(key, body, trim, clothUv, trimUv) {
  return Object.freeze({ key, body, trim, clothUv: Object.freeze(clothUv), trimUv: Object.freeze(trimUv) });
}

// UVs select existing Mini Dungeon colormap stripes: u, first v, v range.
// The source atlas and the source geometry remain shared and unchanged.
export const ACTOR_PALETTES = Object.freeze({
  player: palette('player', '#7045bd', '#f5dfbf', [.34375, .4, .075], [.46875, .55, .15]),
  customer: palette('customer', '#6289d2', '#5e75ca', [.09375, .285, .14], [.09375, .31, .14]),
  staff: palette('staff', '#e4ad3c', '#f5dfbf', [.71875, .55, .15], [.46875, .55, .15]),
  ally: palette('ally', '#389d7b', '#d6e8e2', [.59375, .55, .15], [.21875, .285, .14]),
  enemy: palette('enemy', '#cf534f', '#45454e', [.90625, .55, .15], [.46875, .775, .2]),
});

export function getActorPalette({ id = '', kind = '' } = {}) {
  if (id === 'player' || kind === 'player') return ACTOR_PALETTES.player;
  if (id.startsWith('c-')) return ACTOR_PALETTES.customer;
  if (id.startsWith('s-') || kind === 'staff') return ACTOR_PALETTES.staff;
  if (id.startsWith('e-') || kind === 'orc' || kind === 'soldier') return ACTOR_PALETTES.enemy;
  if (id.startsWith('d-')) return ACTOR_PALETTES.ally;
  return ACTOR_PALETTES.customer;
}

const installed = new WeakMap();
const PALETTE_VERTEX = `
#ifdef USE_MAP
uniform vec3 actorClothUv;
uniform vec3 actorTrimUv;
uniform bool actorOrcBody;
uniform bool actorHeadMesh;
uniform bool actorHeadTint;
vec2 actorAppearanceUv(vec2 sourceUv) {
  vec3 target;
  float startV;
  if (actorHeadMesh) {
    // Only the human customer's brown head-cover stripe becomes a blue hood.
    // Skin (u=.34375), face contrast (.46875), and eyes (.96875) stay intact.
    if (!actorHeadTint || actorOrcBody || abs(sourceUv.x - 0.21875) >= 0.0001) return sourceUv;
    target = actorClothUv; startV = 0.775;
  } else if (actorOrcBody) {
    if (abs(sourceUv.x - 0.09375) < 0.0001) {
      target = actorClothUv; startV = 0.525;
    } else if (abs(sourceUv.x - 0.46875) < 0.0001) {
      target = actorClothUv; startV = 0.775;
    } else { return sourceUv; }
  } else {
    if (abs(sourceUv.x - 0.21875) < 0.0001) {
      target = actorClothUv; startV = 0.775;
    } else if (abs(sourceUv.x - 0.59375) < 0.0001 || abs(sourceUv.x - 0.84375) < 0.0001) {
      target = actorTrimUv; startV = 0.775;
    } else { return sourceUv; }
  }
  float shade = clamp((sourceUv.y - startV) / 0.2, 0.0, 1.0);
  return vec2(target.x, target.y + shade * target.z);
}
#endif
`;

function applyMaterial(material, appearance, orc, head) {
  if (!material.map) return;
  let state = installed.get(material);
  if (head && appearance.key !== 'customer' && !state) return;
  if (!state) {
    state = {
      cloth: { value: new THREE.Vector3() },
      trim: { value: new THREE.Vector3() },
      orc: { value: orc },
      head: { value: head },
      headTint: { value: false },
    };
    const previousCompile = material.onBeforeCompile;
    const previousCacheKey = material.customProgramCacheKey();
    material.onBeforeCompile = function (shader, renderer) {
      previousCompile.call(this, shader, renderer);
      shader.uniforms.actorClothUv = state.cloth;
      shader.uniforms.actorTrimUv = state.trim;
      shader.uniforms.actorOrcBody = state.orc;
      shader.uniforms.actorHeadMesh = state.head;
      shader.uniforms.actorHeadTint = state.headTint;
      shader.vertexShader = shader.vertexShader
        .replace('#include <uv_pars_vertex>', `#include <uv_pars_vertex>\n${PALETTE_VERTEX}`)
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = actorAppearanceUv(vMapUv);\n#endif');
    };
    // Every role uses the same program; only these per-material uniforms vary.
    material.customProgramCacheKey = () => `${previousCacheKey}|runehaven-actor-palette-v2`;
    material.needsUpdate = true;
    installed.set(material, state);
  }
  state.cloth.value.fromArray(appearance.clothUv);
  state.trim.value.fromArray(appearance.trimUv);
  state.orc.value = orc;
  state.head.value = head;
  state.headTint.value = head && appearance.key === 'customer';
  material.userData.actorPalette = appearance.key;
}

/**
 * Apply once to a createAssetLibrary().load() result. That loader already owns
 * separate cloned materials for this actor. Only the body's atlas lookup is
 * changed. Customers also use a blue head cover; skin/face stripes, skeleton,
 * weapons and class accessories retain their original resources. The existing
 * actor material teardown is sufficient:
 * this helper creates no material, geometry, texture or additional draw call.
 */
export function applyActorAppearance(object, actor = {}) {
  const appearance = getActorPalette(actor);
  const orc = object.userData.assetKey === 'orc' || actor.kind === 'orc';
  object.traverse((node) => {
    if (!node.isMesh || !/^(body|head)[-_]?mesh(?:_\d+)?$/i.test(node.name)) return;
    const head = /^head/i.test(node.name);
    if (Array.isArray(node.material)) {
      for (const material of node.material) applyMaterial(material, appearance, orc, head);
    } else applyMaterial(node.material, appearance, orc, head);
  });
  return object;
}
