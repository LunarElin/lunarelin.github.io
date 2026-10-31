// Broad color blocks keep customers, cargo and work points easy to read.
export function createMapScenery({ THREE, scene, box, cylinder, orb, mesh, emptyGroup }) {
  const group = new THREE.Group(); group.name = 'shop-scenery'; scene.add(group);
  function decoration(item, region) {
    const g = new THREE.Group(); g.name = 'regional-silhouette'; group.add(g);
    g.position.set(Math.sign(item.x) * (region.dimensions.width / 2 + 1), 0, item.z * 1.45);
    g.rotation.y = item.rotation || 0; g.scale.setScalar(item.scale || 1);
    const color = `#${new THREE.Color(item.color || region.accentColor).multiplyScalar(.72).getHexString()}`;
    if (item.type === 'tree') {
      cylinder(.12, .16, .8, '#684b2c', 0, .35, 0, g);
      const crown = orb(.72, color, 0, 1.35, 0, g); crown.scale.y = 1.1;
    } else if (item.type === 'crystal') {
      const crystal = mesh(new THREE.OctahedronGeometry(.5, 0), color, g);
      crystal.scale.y = 1.6; crystal.position.y = .65;
    } else if (item.type === 'mushroom') {
      cylinder(.14, .18, .65, '#f1e5cc', 0, .3, 0, g);
      const cap = orb(.6, color, 0, .75, 0, g); cap.scale.y = .55;
    } else if (item.type === 'rock') {
      const rock = mesh(new THREE.DodecahedronGeometry(.65, 0), color, g);
      rock.scale.set(1, .7, .8); rock.position.y = .25;
    } else if (item.type === 'pillar' || item.type === 'ruin') {
      cylinder(.3, .3, item.type === 'ruin' ? .9 : 1.7, color, 0, item.type === 'ruin' ? .45 : .85, 0, g, 6);
    } else if (item.type === 'well') {
      cylinder(.65, .65, .5, color, 0, .25, 0, g, 8);
      cylinder(.48, .48, .02, '#168ab7', 0, .51, 0, g, 8);
    } else if (item.type === 'banner') {
      cylinder(.05, .05, 1.8, '#694b2e', 0, .9, 0, g, 6);
      box(.8, 1, .05, color, .35, 1.25, 0, g);
    }
  }
  function apply(region) {
    emptyGroup(group);
    scene.background?.set(new THREE.Color(region.groundColor).multiplyScalar(.72));
    const floorColor = `#${new THREE.Color(region.floorColor).lerp(new THREE.Color('#97998a'), .55).getHexString()}`;
    const wallColor = `#${new THREE.Color(region.wallColor).multiplyScalar(.38).getHexString()}`;
    const { width, depth } = region.dimensions;
    box(width, .3, depth, wallColor, 0, -.23, 0, group);
    const floor = box(width, .12, depth, floorColor, 0, -.055, 0, group); floor.name = 'shop-solid-floor';
    const featureColor = (color) => `#${new THREE.Color(color || region.accentColor).lerp(new THREE.Color(floorColor), .65).getHexString()}`;
    for (const [index, feature] of (region.floorFeatures || []).slice(0, 2).entries()) {
      const height = .012 + index * .012;
      if (feature.type === 'circle') {
        const disc = mesh(new THREE.CircleGeometry(feature.radius || 1, 24), featureColor(feature.color), group);
        disc.rotation.x = -Math.PI / 2; disc.position.set(feature.x, height, feature.z);
      } else {
        const patch = box(feature.width || 1, .012, feature.depth || 1, featureColor(feature.color), feature.x, height, feature.z, group);
        patch.rotation.y = feature.rotation || 0;
      }
    }
    box(width + .2, .5, .2, wallColor, 0, .2, -depth / 2 + .1, group);
    for (const side of [-1, 1]) box(.2, .2, depth, wallColor, side * (width / 2 + .03), .05, 0, group);
    const laneColor = '#766d52';
    const stations = region.stations, fork = { x: stations.gate.x, z: stations.gate.z - 1.25 };
    for (const key of ['counter', 'potionCounter']) {
      const target = stations[key], dx = target.x - fork.x, dz = target.z + .95 - fork.z;
      const path = box(Math.hypot(dx, dz), .018, .12, laneColor, (fork.x + target.x) / 2, .05, (fork.z + target.z + .95) / 2, group);
      path.name = 'customer-branch-line'; path.rotation.y = -Math.atan2(dz, dx); path.castShadow = false;
    }
    const rugColors = { forge: '#6d6655', counter: '#7a7765', alchemy: '#617462', potionCounter: '#65766b', inn: '#817153' };
    for (const [kind, p] of Object.entries(stations)) {
      if (kind === 'gate') continue;
      const w = kind === 'inn' ? 2.7 : kind === 'forge' || kind === 'alchemy' ? 2.8 : 2.6;
      const d = kind === 'inn' ? 1.7 : kind === 'forge' || kind === 'alchemy' ? 2 : 1.1;
      const pad = box(w, .035, d, rugColors[kind], p.x, .035, p.z, group); pad.name = 'work-area-color';
    }
    const entry = box(3.4, .08, 18.8, floorColor, stations.gate.x, -.035, stations.gate.z + 9, group); entry.name = 'shop-entry-path';
    const decorations = region.decorations || [];
    if (decorations.length) {
      const first = decorations[0];
      const second = decorations.find((item) => Math.sign(item.x) !== Math.sign(first.x) && item.type !== first.type)
        || decorations.find((item) => Math.sign(item.x) !== Math.sign(first.x));
      for (const item of [first, second].filter(Boolean)) decoration(item, region);
    }
  }
  return { apply, group };
}
