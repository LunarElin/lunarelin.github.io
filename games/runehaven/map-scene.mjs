// Regional scenery is built from local geometry; gameplay coordinates come from maps.mjs.
export function createMapScenery({ THREE, scene, box, cylinder, orb, mesh, ring, emptyGroup, material, geometries }) {
  const group = new THREE.Group(); scene.add(group);
  function decoration(item, region) {
    const g = new THREE.Group(); group.add(g);
    g.position.set(item.x, 0, item.z); g.rotation.y = item.rotation || 0; g.scale.setScalar(item.scale || 1);
    const color = item.color || region.accentColor;
    if (item.type === 'tree') {
      cylinder(.12, .18, .8, '#785d48', 0, .35, 0, g);
      const crown = mesh(new THREE.ConeGeometry(.72, 1.65, 7), color, g); crown.position.y = 1.4;
    } else if (item.type === 'crystal') {
      for (let i = 0; i < 3; i++) { const crystal = mesh(new THREE.OctahedronGeometry(.38, 0), color, g, { emissive: color, emissiveIntensity: .25 }); crystal.scale.y = 1.7 + i * .3; crystal.position.set((i - 1) * .35, .55 + i * .13, i % 2 * .18); crystal.rotation.z = (i - 1) * .2; }
      cylinder(.65, .8, .15, '#626879', 0, .03, 0, g, 7);
    } else if (item.type === 'mushroom') {
      for (let i = 0; i < 3; i++) { const x = (i - 1) * .45; cylinder(.1, .16, .65, '#e9d9c1', x, .3, 0, g); const cap = orb(.4, color, x, .75, 0, g); cap.scale.y = .6; orb(.065, '#f9efcf', x + .1, .95, .12, g); }
    } else if (item.type === 'rock') {
      const rock = mesh(new THREE.DodecahedronGeometry(.65, 0), color, g); rock.scale.set(1, .7, .8); rock.position.y = .25;
      orb(.26, '#abb49e', .58, .05, .28, g);
    } else if (item.type === 'pillar' || item.type === 'ruin') {
      box(.88, .2, .88, color, 0, .1, 0, g);
      cylinder(.24, .3, item.type === 'ruin' ? .85 : 1.7, color, 0, item.type === 'ruin' ? .58 : 1.02, 0, g, 8);
      box(.76, .2, .76, '#d8d1b7', 0, item.type === 'ruin' ? 1.1 : 1.95, 0, g);
    } else if (item.type === 'well') {
      const well = mesh(new THREE.TorusGeometry(.55, .16, 6, 12), color, g); well.rotation.x = Math.PI / 2; well.position.y = .35;
      cylinder(.46, .46, .03, '#70bdc9', 0, .28, 0, g);
      for (const x of [-.65, .65]) box(.1, 1.45, .1, '#8c6f55', x, .75, 0, g);
      box(1.7, .18, .9, '#88639c', 0, 1.55, 0, g);
    } else if (item.type === 'banner') {
      cylinder(.05, .05, 2, '#c4a879', 0, 1, 0, g, 6);
      box(.85, 1.1, .05, color, .35, 1.25, 0, g); orb(.11, '#f8d476', 0, 2.05, 0, g);
    }
  }
  function apply(region) {
    emptyGroup(group);
    scene.background.set(region.groundColor);
    box(14, .5, 13, region.wallColor, 0, -.34, .35, group);
    box(14.25, .16, 13.25, '#4c4856', 0, -.58, .35, group);
    const planks = region.floorPattern === 'planks';
    const columns = planks ? 7 : 14, rows = planks ? 26 : 13;
    const cellWidth = 14 / columns, cellDepth = 13 / rows;
    const tileGeometry = new THREE.BoxGeometry(cellWidth * .98, .11, cellDepth * .96); geometries.add(tileGeometry);
    const tiles = new THREE.InstancedMesh(tileGeometry, material('#ffffff'), columns * rows); tiles.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const base = new THREE.Color(region.floorColor), alternate = new THREE.Color(region.tileColor);
    for (let z = 0, i = 0; z < rows; z++) for (let x = 0; x < columns; x++, i++) {
      const dock = region.floorPattern === 'dock';
      matrix.compose(new THREE.Vector3(-7 + (x + .5) * cellWidth, -.05, -6.15 + (z + .5) * cellDepth), new THREE.Quaternion(), new THREE.Vector3(dock ? .99 : 1, 1, dock ? .84 : 1));
      tiles.setMatrixAt(i, matrix);
      const checker = region.floorPattern === 'checker' || region.floorPattern === 'royal-grid';
      tiles.setColorAt(i, checker ? ((x + z) % 2 ? base : alternate) : base.clone().lerp(alternate, ((x * 3 + z * 7) % 5) / 5));
    }
    group.add(tiles);
    box(14.2, .25, .2, region.wallColor, 0, .02, -6.08, group);
    box(.2, .25, 13, region.wallColor, -7.03, .02, .35, group);
    box(.2, .25, 13, region.wallColor, 7.03, .02, .35, group);
    box(14, 1.4, .22, region.wallColor, 0, .66, -5.95, group);
    for (const x of [-6.7, -3.35, 0, 3.35, 6.7]) box(.23, 1.9, .4, region.accentColor, x, .9, -5.92, group);
    box(14.2, .2, .4, region.accentColor, 0, 1.8, -5.95, group);
    for (const [index, feature] of (region.floorFeatures || []).entries()) {
      const height = .02 + index * .014;
      if (feature.type === 'circle') { const disc = mesh(new THREE.CircleGeometry(feature.radius || 1, 36), feature.color || region.accentColor, group); disc.rotation.x = -Math.PI / 2; disc.position.set(feature.x, height + .02, feature.z); const trim = ring(feature.radius || 1, '#ead9a6', feature.x, feature.z, .025, group); trim.position.y = height + .03; }
      else { const p = box(feature.width || 1, .025, feature.depth || 1, feature.color || region.accentColor, feature.x, height, feature.z, group); p.rotation.y = feature.rotation || 0; }
    }
    const laneColor = `#${new THREE.Color(region.floorColor).lerp(new THREE.Color(region.accentColor), .28).lerp(new THREE.Color('#ffffff'), .08).getHexString()}`;
    for (const x of [-1.2, 1.2]) {
      const strip = box(.07, .016, 7.4, laneColor, x, .125, 1.4, group);
      strip.name = 'central-walkway-edge'; strip.castShadow = false; strip.receiveShadow = false;
    }
    const stations = region.stations;
    const rugColors = { forge: '#b6785c', counter: '#c29757', alchemy: '#6a9b85', potionCounter: '#75a29d', inn: '#9277aa' };
    for (const [kind, p] of Object.entries(stations)) {
      if (kind === 'gate') continue;
      const w = kind === 'inn' ? 2.7 : kind === 'forge' || kind === 'alchemy' ? 2.8 : 2.6;
      const d = kind === 'inn' ? 1.7 : kind === 'forge' || kind === 'alchemy' ? 2 : 1.1;
      box(w + .1, .035, d + .1, '#ead09a', p.x, .045, p.z, group);
      box(w, .045, d, rugColors[kind], p.x, .065, p.z, group);
      box(w - .24, .05, .04, '#f5deb0', p.x, .08, p.z + d / 2 - .12, group);
    }
    box(2.8, .1, 2.2, region.tileColor, stations.gate.x, -.03, 7.4, group);
    for (const side of [-1, 1]) { const x = stations.gate.x + side * 1.65; box(.3, 1.3, .3, region.wallColor, x, .6, 6.65, group); orb(.22, region.accentColor, x, 1.42, 6.65, group, true); }
    for (const item of region.decorations || []) decoration(item, region);
  }
  return { apply, group };
}
