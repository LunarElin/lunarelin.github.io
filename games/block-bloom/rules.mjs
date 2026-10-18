export const SIZE = 6;
export const COLORS = {
  coral: { name: '코랄', symbol: '●', hex: '#ff6079', light: '#ff9b9f', dark: '#ba284b' },
  blue: { name: '블루', symbol: '◆', hex: '#38b9ff', light: '#8ce1ff', dark: '#1267c1' },
  lime: { name: '라임', symbol: '✦', hex: '#a2e640', light: '#ddff85', dark: '#4d971e' },
  gold: { name: '골드', symbol: '▲', hex: '#ffc83b', light: '#ffeb8a', dark: '#cc8416' },
};
export const MODES = {
  classic: { name: '컬러 탈출', en: 'COLOR ESCAPE', icon: '↗', genre: '슬라이딩 × 색상 정렬', description: '블록을 밀어 같은 색 출구로 보내세요. 길을 여는 순서가 핵심!', goal: '모든 블록을 같은 색 출구로 탈출시키세요.' },
  triple: { name: '트리플 도크', en: 'TRIPLE DOCK', icon: '≋', genre: '슬라이딩 × 트리플 매치', description: '탈출한 블록은 7칸 도크에 쌓여요. 같은 색 3개를 모아 터뜨리세요.', goal: '도크가 차기 전에 같은 색 3개씩 수집하세요.' },
  merge: { name: '머지 2048', en: 'MERGE LAB', icon: '²', genre: '슬라이딩 × 2048 합성', description: '같은 색·숫자 블록끼리 밀어 합성! 숫자 4 이상만 출구를 통과해요.', goal: '같은 2를 밀어 4로 합친 뒤 탈출시키세요.' },
  key: { name: '키 & 락', en: 'KEY & LOCK', icon: '⚿', genre: '슬라이딩 × 열쇠 퍼즐', description: '열쇠 블록을 먼저 탈출시켜 같은 색 출구의 잠금을 해제하세요.', goal: '각 색의 열쇠 블록으로 출구를 먼저 여세요.' },
  ice: { name: '아이스 브레이크', en: 'ICE BREAKER', icon: '❄', genre: '슬라이딩 × 빙결 해제', description: '다른 블록이 탈출할 때마다 얼음이 깨져요. 두 겹을 벗겨 탈출!', goal: '다른 블록 2개를 탈출시켜 얼음을 깨세요.' },
  factory: { name: '블록 팩토리', en: 'BLOCK FACTORY', icon: '⚙', genre: '슬라이딩 × 생산·승강기', description: '첫 보드를 비우면 생성기가 가동돼요. 중앙 승강기로 막힌 길을 건너세요.', goal: '생성기 대기 블록까지 탈출! 승강기는 두 패드 사이를 이동해요.' },
};
export const GATES = [
  { color: 'coral', side: 'top', start: 0, span: 3, dx: 0, dy: -1 },
  { color: 'blue', side: 'right', start: 0, span: 3, dx: 1, dy: 0 },
  { color: 'lime', side: 'bottom', start: 3, span: 3, dx: 0, dy: 1 },
  { color: 'gold', side: 'left', start: 3, span: 3, dx: -1, dy: 0 },
];
export const ITEM_COSTS = { hammer: 90, freeze: 60, hint: 40, undo: 35, magnet: 160 };
export const ITEMS = {
  hammer: { name: '로켓 해머', icon: '↟', description: '선택 블록을 즉시 탈출' },
  freeze: { name: '타임 프리즈', icon: '❄', description: '20초 동안 타이머 정지' },
  hint: { name: '가이드 빔', icon: '☀', description: '다음 이동 방향 표시' },
  undo: { name: '리와인드', icon: '↶', description: '직전 이동 되돌리기' },
  magnet: { name: '컬러 마그넷', icon: '◉', description: '선택한 색을 모두 탈출' },
};

export function random(seed) {
  let n = seed >>> 0;
  return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function copyState(s) {
  return { ...s, blocks: s.blocks.map(b => ({ ...b })), tray: [...s.tray], queue: s.queue.map(b => ({ ...b })), unlocked: [...s.unlocked] };
}
export function boardKey(s) {
  return s.blocks.map(b => `${b.id}:${b.x},${b.y},${b.rank},${b.ice || 0}`).sort().join('|') + '/' + s.tray.join(',') + '/' + s.unlocked.join(',') + '/' + s.queue.length;
}
export function fits(s, block, x, y, ignore = block.id) {
  return x >= 0 && y >= 0 && x + block.w <= SIZE && y + block.h <= SIZE && !s.blocks.some(b => b.id !== ignore && x < b.x + b.w && x + block.w > b.x && y < b.y + b.h && y + block.h > b.y);
}
function gateFor(b, dx, dy) {
  return GATES.find(g => g.color === b.color && g.dx === dx && g.dy === dy &&
    (dx ? b.y >= g.start && b.y + b.h <= g.start + g.span : b.x >= g.start && b.x + b.w <= g.start + g.span));
}
function collect(s, b, events, bypass = false) {
  s.blocks = s.blocks.filter(other => other.id !== b.id);
  s.removed++;
  s.score += 100 * b.w * b.h * b.rank;
  if (b.key && !s.unlocked.includes(b.color)) { s.unlocked.push(b.color); events.push({ type: 'unlock', color: b.color }); }
  for (const other of s.blocks) if (other.ice > 0) { other.ice--; events.push({ type: 'thaw', block: { ...other } }); }
  events.push({ type: 'exit', block: { ...b }, bypass });
  if (s.mode === 'triple') {
    s.tray.push(b.color);
    if (s.tray.filter(c => c === b.color).length >= 3) {
      let n = 3; s.tray = s.tray.filter(c => c !== b.color || n-- <= 0);
      s.score += 450; events.push({ type: 'triple', color: b.color });
    }
  }
}
function settle(s, events) {
  if (s.mode === 'factory' && s.removed >= s.initial && s.queue.length && !s.blocks.length) {
    const b = s.queue.shift(); s.blocks.push(b); events.push({ type: 'spawn', block: { ...b } });
  }
  if (s.mode === 'triple' && s.tray.length >= 7) { s.status = 'lost'; s.reason = 'tray'; }
  else if (!s.blocks.length && !s.queue.length && !s.tray.length) { s.status = 'won'; events.push({ type: 'win' }); }
}
export function move(s, id, dx, dy, { merge = true } = {}) {
  if (s.status !== 'playing' || !Number.isInteger(dx) || !Number.isInteger(dy) || (!dx === !dy) || Math.abs(dx + dy) > SIZE) return { ok: false, state: s, events: [] };
  const next = copyState(s), b = next.blocks.find(b => b.id === id), events = [];
  if (!b) return { ok: false, state: s, events };
  const sx = Math.sign(dx), sy = Math.sign(dy), steps = Math.abs(dx + dy);
  let moved = false;
  for (let i = 0; i < steps; i++) {
    const x = b.x + sx, y = b.y + sy;
    if (x < 0 || y < 0 || x + b.w > SIZE || y + b.h > SIZE) {
      const gate = gateFor(b, sx, sy);
      if (!gate || b.ice > 0 || (next.mode === 'key' && !b.key && !next.unlocked.includes(b.color)) || (next.mode === 'merge' && b.rank < 2)) break;
      collect(next, b, events); moved = true; break;
    }
    if (fits(next, b, x, y)) { b.x = x; b.y = y; moved = true; continue; }
    if (next.mode === 'merge' && merge) {
      const target = next.blocks.find(other => other.id !== b.id && other.x === x && other.y === y && other.w === b.w && other.h === b.h && other.color === b.color && other.rank === b.rank);
      if (target) {
        next.blocks = next.blocks.filter(other => other.id !== b.id); target.rank++;
        next.removed++; next.score += 250 * target.rank; events.push({ type: 'merge', block: { ...target } }); moved = true;
      }
    }
    break;
  }
  if (!moved) return { ok: false, state: s, events: [] };
  next.moves++; settle(next, events);
  return { ok: true, state: next, events };
}

function rawShuffle(s, history, rng, count) {
  for (let i = 0; i < count; i++) {
    const options = [];
    for (const b of s.blocks) for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if (fits(s, b, b.x + dx, b.y + dy)) options.push({ id: b.id, dx, dy });
    if (!options.length) break;
    const action = options[Math.floor(rng() * options.length)];
    const b = s.blocks.find(b => b.id === action.id); b.x += action.dx; b.y += action.dy;
    history.push({ ...action, dx: -action.dx, dy: -action.dy });
  }
}
function makeBase(mode, level, seed) {
  return { version: 1, mode, level, seed, blocks: [], queue: [], tray: [], unlocked: [], total: 0, initial: 0, removed: 0, score: 0, moves: 0, time: mode === 'classic' && level === 1 ? 180 : 120 + Math.min(60, level * 3), frozen: 0, status: 'playing', reason: '', rewarded: false, continues: 0, liftDirection: 1, plan: [] };
}
export function createLevel(mode = 'classic', level = 1, seed = Date.now()) {
  if (!MODES[mode]) mode = 'classic';
  level = Math.max(1, Math.min(9999, Math.floor(level) || 1));
  const s = makeBase(mode, level, seed >>> 0), rng = random(seed), reverse = [], colorList = Object.keys(COLORS);
  if (mode === 'merge') {
    s.blocks = [
      { id: 0, color: 'coral', x: 1, y: 0 }, { id: 1, color: 'coral', x: 1, y: 2 },
      { id: 2, color: 'blue', x: 5, y: 1 }, { id: 3, color: 'blue', x: 3, y: 1 },
      { id: 4, color: 'lime', x: 4, y: 5 }, { id: 5, color: 'lime', x: 4, y: 3 },
      { id: 6, color: 'gold', x: 0, y: 4 }, { id: 7, color: 'gold', x: 2, y: 4 },
    ].map(b => ({ ...b, w: 1, h: 1, rank: 1 }));
    rawShuffle(s, reverse, rng, 12 + Math.min(90, level * 5));
    s.plan = [...reverse.reverse(), ...GATES.flatMap((g, i) => [{ id: i * 2 + 1, dx: g.dx * 2, dy: g.dy * 2 }, { id: i * 2, dx: g.dx, dy: g.dy }])];
  } else {
    const count = mode === 'triple' ? 12 : Math.min(12, 8 + Math.floor((level - 1) / 3));
    for (let id = 0; id < count; id++) {
      const color = colorList[mode === 'triple' ? Math.floor(id / 3) : id % 4], gate = GATES.find(g => g.color === color);
      let b;
      for (let attempt = 0; attempt < 1500; attempt++) {
        const shapes = attempt > 100 ? [[1,1]] : mode === 'triple' ? [[1,1],[1,2],[2,1]] : [[1,2],[2,1],[2,2]];
        const [w,h] = shapes[Math.floor(rng() * shapes.length)], across = gate.dx ? h : w;
        const slot = gate.start + Math.floor(rng() * (gate.span - across + 1));
        const x = gate.side === 'left' ? 0 : gate.side === 'right' ? SIZE - w : slot;
        const y = gate.side === 'top' ? 0 : gate.side === 'bottom' ? SIZE - h : slot;
        b = { id, color, x, y, w, h, rank: 1 };
        if (fits(s, b, x, y, -1)) break;
        b = null; rawShuffle(s, reverse, rng, 5);
      }
      if (!b) return createLevel(mode, level, (seed + 7919) >>> 0);
      s.blocks.push(b); reverse.push({ id, dx: gate.dx, dy: gate.dy });
      rawShuffle(s, reverse, rng, 3 + Math.min(10, level));
    }
    rawShuffle(s, reverse, rng, 10 + Math.min(50, level * 3));
    s.plan = reverse.reverse();
    if (mode === 'key') for (const color of colorList) s.blocks.filter(b => b.color === color).at(-1).key = true;
    if (mode === 'ice') for (const b of s.blocks) if (b.id < 2) b.ice = 2;
    if (mode === 'factory') {
      s.queue = GATES.map((g,i) => ({ id: 100 + i, color: g.color, x: g.side === 'left' ? 0 : g.side === 'right' ? 5 : g.start + 1, y: g.side === 'top' ? 0 : g.side === 'bottom' ? 5 : g.start + 1, w: 1, h: 1, rank: 1 }));
      s.plan.push(...GATES.map((g,i) => ({ id: 100 + i, dx: g.dx, dy: g.dy })));
    }
  }
  s.initial = s.blocks.length; s.total = s.initial + s.queue.length;
  return s;
}
export function guide(s, limit = 16000) {
  // Replay the certified construction path first. It remains useful after arbitrary deviations.
  let cursor = createLevel(s.mode, s.level, s.seed);
  const wanted = boardKey(s); let recommended = null;
  for (const action of cursor.plan) {
    if (boardKey(cursor) === wanted && move(s, action.id, action.dx, action.dy).ok) recommended = action;
    const result = move(cursor, action.id, action.dx, action.dy); if (!result.ok) break; cursor = result.state;
  }
  if (recommended) return recommended;
  const queue = [{ s, first: null }], seen = new Set([wanted]);
  for (let at = 0; at < queue.length && at < limit; at++) {
    const node = queue[at];
    // Prefer colors already in the dock to avoid filling its last slot with a new color.
    const blocks = [...node.s.blocks].sort((a,b) => node.s.tray.filter(c=>c===b.color).length - node.s.tray.filter(c=>c===a.color).length);
    for (const b of blocks) for (const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const result = move(node.s, b.id, dx, dy); if (!result.ok || result.state.status === 'lost') continue;
      const first = node.first || { id: b.id, dx, dy };
      if (result.events.some(e => ['exit','merge'].includes(e.type))) return first;
      const key = boardKey(result.state); if (!seen.has(key)) { seen.add(key); queue.push({ s: result.state, first }); }
      if (queue.length >= limit) break;
    }
    if (queue.length >= limit) break;
  }
  return null;
}
export function useItem(s, item, selected) {
  if (s.status !== 'playing') return { ok: false, state: s, events: [] };
  const next = copyState(s), events = [];
  if (item === 'freeze') { if (s.frozen > 0) return { ok: false, state: s, events }; next.frozen = 20; }
  else if (item === 'hammer' || item === 'magnet') {
    const b = next.blocks.find(b => b.id === selected); if (!b) return { ok: false, state: s, events };
    const targets = item === 'hammer' ? [b] : next.blocks.filter(other => other.color === b.color);
    for (const target of targets) collect(next, target, events, true);
    settle(next, events);
  } else return { ok: false, state: s, events };
  return { ok: true, state: next, events };
}
export function elevate(s, id) {
  const b = s.blocks.find(b => b.id === id);
  if (s.status !== 'playing' || s.mode !== 'factory' || !b || b.x !== 2 || ![2,4].includes(b.y) || b.w > 2 || b.h > 2) return { ok: false, state: s, events: [] };
  const y = b.y === 2 ? 4 : 2;
  if (!fits(s, b, b.x, y)) return { ok: false, state: s, events: [] };
  const next = copyState(s), target = next.blocks.find(b=>b.id===id); target.y = y; next.moves++;
  return { ok: true, state: next, events: [{ type: 'lift', block: { ...target } }] };
}
export function tick(s, seconds) {
  if (s.status !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return s;
  const next = copyState(s), protectedTime = Math.min(s.frozen, seconds);
  next.frozen = Math.max(0, s.frozen - seconds); next.time = Math.max(0, s.time - (seconds - protectedTime));
  if (next.time <= 0) { next.status = 'lost'; next.reason = 'time'; }
  return next;
}
export function continueRun(s) {
  if (s.status !== 'lost' || s.continues >= 2) return null;
  const next = copyState(s); next.status = 'playing'; next.time += 45; next.tray = []; next.reason = ''; next.continues++; return next;
}
export function newProfile() {
  return { coins: 350, items: { hammer: 3, freeze: 3, hint: 5, undo: 5, magnet: 2 }, levels: Object.fromEntries(Object.keys(MODES).map(k=>[k,1])), wins: 0, stars: 0, best: 0, daily: '', starter: false, pass: [], sound: true, motion: true, haptic: true, skin: 'original', aurora: false };
}
export function winReward(s, profile) {
  if (s.status !== 'won' || s.rewarded) return { state: s, profile, coins: 0, stars: 0 };
  const stars = s.time > 65 ? 3 : s.time > 25 ? 2 : 1, coins = 70 + stars * 20;
  const next = { ...profile, coins: profile.coins + coins, wins: profile.wins + 1, stars: profile.stars + stars, best: Math.max(profile.best, s.score), levels: { ...profile.levels, [s.mode]: Math.max(profile.levels[s.mode], s.level + 1) } };
  return { state: { ...s, rewarded: true, earnedCoins: coins, earnedStars: stars }, profile: next, coins, stars };
}
export function restoreProfile(value) {
  const p = newProfile(); if (!value || typeof value !== 'object') return p;
  const integer = (v, max = 10000000) => Number.isInteger(v) && v >= 0 && v <= max;
  for (const key of ['coins','wins','stars','best']) if (integer(value[key])) p[key] = value[key];
  for (const key of Object.keys(ITEMS)) if (integer(value.items?.[key],9999)) p.items[key] = value.items[key];
  for (const key of Object.keys(MODES)) if (integer(value.levels?.[key],9999) && value.levels[key] > 0) p.levels[key] = value.levels[key];
  for (const key of ['sound','motion','haptic','starter','aurora']) if (typeof value[key] === 'boolean') p[key] = value[key];
  if (typeof value.daily === 'string') p.daily = value.daily.slice(0,10);
  if (Array.isArray(value.pass)) p.pass = value.pass.filter(n=>[3,9,18].includes(n));
  if (value.skin === 'aurora' && p.aurora) p.skin = 'aurora';
  return p;
}
export function validRun(s) {
  if (!s || s.version !== 1 || !MODES[s.mode] || !Number.isInteger(s.level) || s.level < 1 || s.level > 9999 || !Number.isInteger(s.seed) || !['playing','won','lost'].includes(s.status) || !Array.isArray(s.blocks) || s.blocks.length > 20 || !Array.isArray(s.queue) || s.queue.length > 4 || !Array.isArray(s.tray) || s.tray.length > 7 || !Array.isArray(s.unlocked) || !Array.isArray(s.plan) || s.plan.length > 20000) return false;
  for (const key of ['total','initial','removed','moves','score','continues']) if (!Number.isInteger(s[key]) || s[key] < 0) return false;
  if (s.continues > 2 || !Number.isFinite(s.time) || s.time < 0 || s.time > 600 || !Number.isFinite(s.frozen) || s.frozen < 0 || s.frozen > 20) return false;
  const blocks = [...s.blocks,...s.queue], ids = new Set();
  for (const b of blocks) {
    if (!b || !COLORS[b.color] || ![1,2].includes(b.w) || ![1,2].includes(b.h) || !Number.isInteger(b.x) || !Number.isInteger(b.y) || b.x < 0 || b.y < 0 || b.x + b.w > SIZE || b.y + b.h > SIZE || !Number.isInteger(b.id) || ids.has(b.id) || !Number.isInteger(b.rank) || b.rank < 1 || b.rank > 4 || (b.ice !== undefined && ![0,1,2].includes(b.ice))) return false;
    ids.add(b.id);
  }
  if (s.blocks.some(b => !fits(s,b,b.x,b.y)) || s.tray.some(c=>!COLORS[c]) || s.unlocked.some(c=>!COLORS[c])) return false;
  if (s.removed + blocks.length !== s.total || s.total < 1 || s.total > 20 || s.initial > s.total || (s.mode !== 'triple' && s.tray.length)) return false;
  if (s.status === 'won' && (blocks.length || s.tray.length)) return false;
  return s.plan.every(a => a && Number.isInteger(a.id) && Number.isInteger(a.dx) && Number.isInteger(a.dy) && (!a.dx !== !a.dy) && Math.abs(a.dx+a.dy) <= SIZE);
}
