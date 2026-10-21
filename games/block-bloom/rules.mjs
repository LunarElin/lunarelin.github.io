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
  factory: { name: '블록 팩토리', en: 'BLOCK FACTORY', icon: '⚙', genre: '슬라이딩 × 추가 공급', description: '첫 보드를 비우면 생성기가 가동돼요. 새로 나오는 블록까지 탈출시키세요.', goal: '생성기 대기 블록까지 모두 탈출시키세요.' },
};
const GIMMICKS = ['key', 'ice', 'merge', 'triple', 'factory'];
const SAVED_GIMMICKS = [...GIMMICKS, 'lift']; // Accepted only to recover older saves.
const LEGACY_STAGES = { classic: 1, key: 2, ice: 3, merge: 4, triple: 5, factory: 7 };
const STAGES = [
  { title: '첫 번째 탈출', shortTitle: '컬러 탈출', gimmicks: [], introLabel: '기본 규칙', description: '블록을 밀어 같은 색 출구로 보내세요.', tips: ['블록을 누른 채 상하좌우로 움직이세요.', '블록 전체 폭을 출구에 맞춘 뒤 밖으로 밀어요.'] },
  { title: '열쇠가 여는 길', shortTitle: '열쇠와 잠금', gimmicks: ['key'], introLabel: '새 기믹', description: '열쇠 블록을 먼저 탈출시키면 같은 색 출구가 열려요.', tips: ['열쇠 표시가 있는 블록부터 보내세요.', '잠금이 풀리면 나머지 같은 색 블록도 탈출해요.'] },
  { title: '얼음을 녹이는 순서', shortTitle: '열쇠와 얼음', gimmicks: ['key', 'ice'], introLabel: '새 기믹', description: '다른 블록이 탈출할 때마다 얼음이 한 겹씩 깨져요.', tips: ['얼음 블록은 두 겹을 벗겨야 탈출해요.', '얼지 않은 블록 두 개를 먼저 보내세요.'] },
  { title: '두 개를 하나로', shortTitle: '숫자 합성', gimmicks: ['merge'], introLabel: '새 기믹', description: '같은 색 2를 밀어 합치면 4가 되고 출구를 통과해요.', tips: ['같은 색·숫자·모양의 블록끼리 맞추세요.', '맞닿은 채 반 칸만큼 더 밀면 합성돼요.', '숫자 2는 탈출할 수 없어요.'] },
  { title: '세 개씩 모으기', shortTitle: '트리플 수집', gimmicks: ['triple'], introLabel: '새 기믹', description: '탈출한 블록을 수집함에 모아 같은 색 세 개씩 없애세요.', tips: ['수집함은 일곱 칸이에요.', '같은 색 세 개를 모으면 빈칸이 생겨요.', '새 색을 늘리기 전에 모아 둔 색을 먼저 완성해요.'] },
  { title: '끝나지 않은 보드', shortTitle: '블록 생성기', gimmicks: ['factory'], introLabel: '새 기믹', description: '보드를 비우면 생성기의 대기 블록이 하나씩 등장해요.', tips: ['먼저 지금 보드의 블록을 모두 탈출시키세요.', '생성기에 남은 블록까지 모두 보내면 클리어예요.'] },
  { title: '생성기 한 번 더', shortTitle: '생성기 연습', gimmicks: ['factory'], introLabel: '기믹 복습', description: '출구 높이를 맞추고 생성기의 새 블록까지 보내세요.', tips: ['골드 블록을 아래로 밀어 출구에 맞추세요.', '보드를 비우면 대기 블록이 하나씩 나와요.', '새 블록까지 모두 보내면 클리어예요.'] },
  { title: '열쇠를 모아 세 개', shortTitle: '열쇠와 수집', gimmicks: ['triple', 'key'], introLabel: '새 조합', description: '열쇠로 출구를 연 뒤 같은 색 세 개를 수집하세요.', tips: ['각 색 열쇠 블록부터 탈출시키세요.', '열쇠 블록도 수집함의 같은 색 조합에 들어가요.', '일곱 칸이 차기 전에 세 개씩 완성하세요.'] },
  { title: '얼어붙은 숫자', shortTitle: '합성과 얼음', gimmicks: ['merge', 'ice'], introLabel: '새 조합', description: '숫자를 합치고 다른 블록을 탈출시켜 얼음을 깨세요.', tips: ['얼음이 있는 블록을 합쳐도 빙결은 남아요.', '다른 블록 두 개가 탈출하면 두 겹이 모두 깨져요.', '4 이상의 숫자와 얼음 없는 상태를 모두 갖춰야 탈출해요.'] },
  { title: '얼음 공장', shortTitle: '빙결 공장', gimmicks: ['factory', 'ice'], introLabel: '새 조합', description: '얼음을 녹여 보드를 비우고 생성기 블록까지 보내세요.', tips: ['먼저 얼지 않은 블록으로 얼음을 깨세요.', '빈 공간에 블록을 옮겨 출구까지 길을 만드세요.', '마지막 생성기 블록까지 탈출해야 끝나요.'] },
  { title: '세 가지 규칙', shortTitle: '열쇠·얼음·수집', gimmicks: ['triple', 'key', 'ice'], introLabel: '새 조합', description: '열쇠를 열고 얼음을 깨며 같은 색 세 개를 모으세요.', tips: ['열쇠 블록을 먼저 탈출시키세요.', '다른 블록이 탈출하면 얼음이 깨져요.', '수집함의 색을 보며 세 개씩 완성하세요.'] },
  { title: '잠긴 공장', shortTitle: '잠금 공장', gimmicks: ['factory', 'key'], introLabel: '새 조합', description: '출구의 잠금을 풀고 생성기의 추가 블록까지 탈출시키세요.', tips: ['초기 보드의 열쇠로 각 색 출구를 여세요.', '빈 공간을 남겨 다음 블록의 길을 만드세요.', '열어 둔 출구로 생성기 블록도 보낼 수 있어요.'] },
];
function stageNumber(number) { return Math.max(1, Math.min(9999, Math.floor(number) || 1)); }
function modeFor(gimmicks) { return ['merge', 'triple', 'factory', 'key', 'ice'].find(id => gimmicks.includes(id)) || 'classic'; }
function legacyGimmicks(mode) { return mode === 'classic' ? [] : [mode]; }
function withoutLift(gimmicks) { return gimmicks.filter(id => id !== 'lift'); }
function validGimmicks(value) {
  return Array.isArray(value) && value.length <= SAVED_GIMMICKS.length && new Set(value).size === value.length && value.every(id => SAVED_GIMMICKS.includes(id)) &&
    (!value.includes('lift') || value.includes('factory')) && !(value.includes('merge') && (value.includes('triple') || value.includes('factory'))) && !(value.includes('triple') && value.includes('factory'));
}
function sameGimmicks(a, b) { a=withoutLift(a);b=withoutLift(b);return a.length === b.length && a.every(id => b.includes(id)); }
export function hasGimmick(state, id) { return id !== 'lift' && (Array.isArray(state.gimmicks) ? state.gimmicks.includes(id) : legacyGimmicks(state.mode).includes(id)); }
export function stageInfo(number) {
  number = stageNumber(number);
  const index = number <= STAGES.length ? number - 1 : 7 + (number - 13) % 5, info = STAGES[index];
  return { ...info, number, gimmicks: [...info.gimmicks], tips: [...info.tips], introLabel: number > STAGES.length ? '응용 기믹' : info.introLabel };
}
export function runInfo(state) {
  if (state.stage && !state.campaignLegacy) return stageInfo(state.stage);
  const number = LEGACY_STAGES[state.mode] || 1, mode = MODES[state.mode] || MODES.classic;
  return { number, title: mode.name, shortTitle: mode.name, gimmicks: withoutLift(state.gimmicks || legacyGimmicks(state.mode)), introLabel: '진행 중 퍼즐', description: mode.description, tips: [mode.goal, '현재 보드를 마치면 스테이지 진행으로 이어져요.'] };
}
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
  return { ...s, blocks: s.blocks.map(b => ({ ...b })), tray: [...s.tray], reserve: [...(s.reserve || [])], queue: s.queue.map(b => ({ ...b })), unlocked: [...s.unlocked], ...(s.gimmicks ? { gimmicks: [...s.gimmicks] } : {}) };
}
export function boardKey(s) {
  return s.blocks.map(b => `${b.id}:${b.x},${b.y},${b.rank},${b.ice || 0},${b.key ? 1 : 0}`).sort().join('|') + '/' + s.tray.join(',') + '/' + (s.reserve || []).join(',') + '/' + s.unlocked.join(',') + '/' + s.queue.length + '/' + GIMMICKS.filter(id => hasGimmick(s, id)).join(',');
}
export function fits(s, block, x, y, ignore = block.id) {
  return x >= 0 && y >= 0 && x + block.w <= SIZE && y + block.h <= SIZE && !s.blocks.some(b => b.id !== ignore && x < b.x + b.w && x + block.w > b.x && y < b.y + b.h && y + block.h > b.y);
}
function gateFor(b, dx, dy) {
  return GATES.find(g => g.color === b.color && g.dx === dx && g.dy === dy &&
    (dx ? b.y >= g.start && b.y + b.h <= g.start + g.span : b.x >= g.start && b.x + b.w <= g.start + g.span));
}
function matchTriple(s, color) {
  if ([...s.tray, ...s.reserve].filter(c => c === color).length < 3) return false;
  let count = 3;
  s.reserve = s.reserve.filter(c => c !== color || count-- <= 0);
  s.tray = s.tray.filter(c => c !== color || count-- <= 0);
  return true;
}
function collect(s, b, events, bypass = false) {
  s.blocks = s.blocks.filter(other => other.id !== b.id);
  s.removed++;
  s.score += 100 * b.w * b.h * b.rank;
  if (b.key && !s.unlocked.includes(b.color)) { s.unlocked.push(b.color); events.push({ type: 'unlock', color: b.color }); }
  for (const other of s.blocks) if (other.ice > 0) { other.ice--; events.push({ type: 'thaw', block: { ...other } }); }
  events.push({ type: 'exit', block: { ...b }, bypass });
  if (hasGimmick(s, 'triple')) {
    s.tray.push(b.color);
    if (matchTriple(s, b.color)) {
      s.score += 450; events.push({ type: 'triple', color: b.color });
    }
  }
}
function settle(s, events) {
  if (hasGimmick(s, 'factory') && s.removed >= s.initial && s.queue.length && !s.blocks.length) {
    const b = s.queue.shift(); s.blocks.push(b); events.push({ type: 'spawn', block: { ...b } });
  }
  if (hasGimmick(s, 'triple') && s.tray.length >= 7) { s.status = 'lost'; s.reason = 'tray'; }
  else if (!s.blocks.length && !s.queue.length && !s.tray.length && !s.reserve.length) { s.status = 'won'; events.push({ type: 'win' }); }
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
      if (!gate || b.ice > 0 || (hasGimmick(next, 'key') && !b.key && !next.unlocked.includes(b.color)) || (hasGimmick(next, 'merge') && b.rank < 2)) break;
      collect(next, b, events); moved = true; break;
    }
    if (fits(next, b, x, y)) { b.x = x; b.y = y; moved = true; continue; }
    if (hasGimmick(next, 'merge') && merge) {
      const target = next.blocks.find(other => other.id !== b.id && other.x === x && other.y === y && other.w === b.w && other.h === b.h && other.color === b.color && other.rank === b.rank);
      if (target) {
        next.blocks = next.blocks.filter(other => other.id !== b.id); target.rank++;
        if (b.key) target.key = true;
        if (b.ice || target.ice) target.ice = Math.max(b.ice || 0, target.ice || 0);
        next.removed++; next.score += 250 * target.rank; events.push({ type: 'merge', block: { ...target } }); moved = true;
      }
    }
    break;
  }
  if (!moved) return { ok: false, state: s, events: [] };
  next.moves++; settle(next, events); advanceLesson(s, next, events, { id, dx, dy });
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
  return { version: 1, mode, level, seed, blocks: [], queue: [], tray: [], reserve: [], unlocked: [], total: 0, initial: 0, removed: 0, score: 0, moves: 0, time: mode === 'classic' && level === 1 ? 180 : 120 + Math.min(60, level * 3), frozen: 0, status: 'playing', reason: '', rewarded: false, continues: 0, plan: [] };
}
export function createLevel(mode = 'classic', level = 1, seed = Date.now(), options = {}) {
  if (!MODES[mode]) mode = 'classic';
  if (options.gimmicks !== undefined && !validGimmicks(options.gimmicks)) throw new RangeError('Unsupported gimmick combination');
  if (options.gimmicks) mode = modeFor(options.gimmicks);
  level = Math.max(1, Math.min(9999, Math.floor(level) || 1));
  const s = makeBase(mode, level, seed >>> 0), rng = random(seed), reverse = [], colorList = Object.keys(COLORS);
  if (options.gimmicks) s.gimmicks = withoutLift(options.gimmicks);
  if (hasGimmick(s, 'merge')) {
    s.blocks = [
      { id: 0, color: 'coral', x: 1, y: 0 }, { id: 1, color: 'coral', x: 1, y: 2 },
      { id: 2, color: 'blue', x: 5, y: 1 }, { id: 3, color: 'blue', x: 3, y: 1 },
      { id: 4, color: 'lime', x: 4, y: 5 }, { id: 5, color: 'lime', x: 4, y: 3 },
      { id: 6, color: 'gold', x: 0, y: 4 }, { id: 7, color: 'gold', x: 2, y: 4 },
    ].map(b => ({ ...b, w: 1, h: 1, rank: 1 }));
    s.blocks = s.blocks.slice(0, (options.recipe?.mergePairs ?? 4) * 2);
    rawShuffle(s, reverse, rng, options.recipe?.shuffle ?? (12 + Math.min(90, level * 5)));
    s.plan = [...reverse.reverse(), ...GATES.slice(0, options.recipe?.mergePairs ?? 4).flatMap((g, i) => [{ id: i * 2 + 1, dx: g.dx * 2, dy: g.dy * 2 }, { id: i * 2, dx: g.dx, dy: g.dy }])];
  } else {
    const count = options.recipe?.blockCount ?? (hasGimmick(s, 'triple') ? 12 : Math.min(12, 8 + Math.floor((level - 1) / 3)));
    for (let id = 0; id < count; id++) {
      const color = colorList[hasGimmick(s, 'triple') ? Math.floor(id / 3) : id % 4], gate = GATES.find(g => g.color === color);
      let b;
      for (let attempt = 0; attempt < 1500; attempt++) {
        const shapes = attempt > 100 || options.recipe?.singleCell ? [[1,1]] : options.recipe?.smallShapes || hasGimmick(s, 'triple') ? [[1,1],[1,2],[2,1]] : [[1,2],[2,1],[2,2]];
        const [w,h] = shapes[Math.floor(rng() * shapes.length)], across = gate.dx ? h : w;
        const slot = gate.start + Math.floor(rng() * (gate.span - across + 1));
        const x = gate.side === 'left' ? 0 : gate.side === 'right' ? SIZE - w : slot;
        const y = gate.side === 'top' ? 0 : gate.side === 'bottom' ? SIZE - h : slot;
        b = { id, color, x, y, w, h, rank: 1 };
        if (fits(s, b, x, y, -1)) break;
        b = null; rawShuffle(s, reverse, rng, 5);
      }
      if (!b) return createLevel(mode, level, (seed + 7919) >>> 0, options);
      s.blocks.push(b); reverse.push({ id, dx: gate.dx, dy: gate.dy });
      rawShuffle(s, reverse, rng, options.recipe?.insertShuffle ?? (3 + Math.min(10, level)));
    }
    rawShuffle(s, reverse, rng, options.recipe?.shuffle ?? (10 + Math.min(50, level * 3)));
    s.plan = reverse.reverse();
    if (hasGimmick(s, 'factory')) {
      s.queue = GATES.slice(0, options.recipe?.queueCount ?? 4).map((g,i) => ({ id: 100 + i, color: g.color, x: g.side === 'left' ? 0 : g.side === 'right' ? 5 : g.start + 1, y: g.side === 'top' ? 0 : g.side === 'bottom' ? 5 : g.start + 1, w: 1, h: 1, rank: 1 }));
      s.plan.push(...GATES.slice(0, options.recipe?.queueCount ?? 4).map((g,i) => ({ id: 100 + i, dx: g.dx, dy: g.dy })));
    }
  }
  if (hasGimmick(s, 'key')) for (const color of colorList) {
    const candidates = s.blocks.filter(b => b.color === color);
    if (candidates.length) (hasGimmick(s, 'merge') ? candidates[0] : candidates.at(-1)).key = true;
  }
  if (hasGimmick(s, 'ice')) for (const b of s.blocks) if (hasGimmick(s, 'merge') ? b.id >= s.blocks.length - 2 : b.id < 2) b.ice = 2;
  s.initial = s.blocks.length; s.total = s.initial + s.queue.length;
  return s;
}
const LESSONS = [
  [
    { blockId: 0, action: 'move', dx: 0, dy: -1, goal: 'exit', title: '같은 색으로', text: '빛나는 코랄 블록을 위 출구 밖으로 밀어요.' },
    { blockId: 1, action: 'move', dx: 1, dy: 0, goal: 'exit', title: '이번에는 오른쪽', text: '블루 블록을 오른쪽 출구 밖으로 밀어요.' },
  ],
  [
    { blockId: 0, action: 'move', dx: 0, dy: -1, goal: 'exit', title: '열쇠부터', text: '열쇠 블록을 위로 밀어 잠금을 열어요.' },
    { blockId: 1, action: 'move', dx: 0, dy: -3, goal: 'exit', title: '열린 길로', text: '같은 색 블록을 위로 밀어 탈출시켜요.' },
  ],
  [
    { blockId: 0, action: 'move', dx: 0, dy: -1, goal: 'exit', title: '얼음 한 겹', text: '코랄 열쇠를 위로 보내 얼음을 한 겹 깨요.' },
    { blockId: 1, action: 'move', dx: 1, dy: 0, goal: 'exit', title: '한 번 더', text: '블루 열쇠를 오른쪽으로 보내 남은 얼음을 깨요.' },
    { blockId: 2, action: 'move', dx: 0, dy: 1, goal: 'exit', title: '이제 탈출', text: '얼음이 녹은 라임 블록을 아래로 보내요.' },
  ],
  [
    { blockId: 1, targetId: 0, action: 'move', dx: 0, dy: -1, goal: 'merge', title: '2와 2를 합쳐요', text: '아래 2를 위 2에 맞대고 반 칸 더 밀어요.' },
    { blockId: 0, action: 'move', dx: 0, dy: -1, goal: 'exit', title: '4부터 탈출', text: '합쳐진 4를 위 출구 밖으로 밀어요.' },
  ],
  [
    { blockId: 0, action: 'move', dx: 0, dy: -1, goal: 'exit', title: '첫 번째 수집', text: '코랄 블록을 위로 보내 수집함에 모아요.' },
    { blockId: 1, action: 'move', dx: 0, dy: -1, goal: 'exit', title: '같은 색 하나 더', text: '두 번째 코랄 블록도 위로 보내요.' },
    { blockId: 2, action: 'move', dx: 0, dy: -1, goal: 'exit', title: '세 개가 모이면', text: '마지막 코랄을 보내 수집함을 비워요.' },
  ],
  [
    { blockId: 0, action: 'move', dx: 0, dy: -1, goal: 'exit', title: '보드를 비워요', text: '코랄 블록을 위로 보내요.' },
    { blockId: 1, action: 'move', dx: 1, dy: 0, goal: 'exit', title: '생성기 준비', text: '블루 블록을 보내면 새 블록이 등장해요.' },
    { blockId: 100, action: 'move', dx: 0, dy: 1, goal: 'exit', title: '새 블록도 탈출', text: '새로 나온 라임 블록을 아래로 보내요.' },
  ],
  [
    { blockId: 0, action: 'move', dx: 0, dy: 1, goal: 'align', title: '출구 높이 맞추기', text: '골드 블록을 아래로 밀어 출구 높이에 맞춰요.' },
    { blockId: 0, action: 'move', dx: -3, dy: 0, goal: 'exit', title: '맞춘 길로 탈출', text: '골드 블록을 왼쪽 출구 밖으로 밀어요.' },
  ],
];
export function lessonStep(s) {
  if (s.layoutVersion !== 2 || s.campaignLegacy || !Number.isInteger(s.stage) || s.stage < 1 || s.stage > LESSONS.length || s.status !== 'playing') return null;
  const steps = LESSONS[s.stage - 1], index = s.lessonIndex ?? 0, step = steps[index];
  return step ? { ...step, index, total: steps.length } : null;
}
function advanceLesson(before, next, events, action) {
  if (next.layoutVersion === 2 && !next.campaignLegacy && next.stage === 7 && next.lessonIndex === 1) {
    const gold = next.blocks.find(b => b.id === 0);
    // A single drag can reach the exit row and then reverse before release.
    if (gold && gold.y < 3) next.lessonIndex = 0;
  }
  const step = lessonStep(before);
  if (!step || action.id !== step.blockId || (action.action || 'move') !== step.action) return;
  const done = step.goal === 'align' ? next.blocks.some(b => b.id === step.blockId && b.y >= 3) :
    step.goal === 'merge' ? events.some(e => e.type === 'merge' && e.block.id === step.targetId && e.block.rank >= 2) :
    events.some(e => e.type === 'exit' && e.block.id === step.blockId && !e.bypass);
  if (done) next.lessonIndex = step.index + 1;
}
function teachingStage(number, seed) {
  const piece = (id, color, x, y, w = 1, h = 1, extra = {}) => ({ id, color, x, y, w, h, rank: 1, ...extra });
  const exit = (id, dx, dy) => ({ id, dx, dy });
  const layouts = [
    { blocks: [piece(0,'coral',0,0,2,1),piece(1,'blue',5,1,1,2)], plan: [exit(0,0,-1),exit(1,1,0)] },
    { blocks: [piece(0,'coral',1,0,1,1,{key:true}),piece(1,'coral',1,2,1,2),piece(2,'blue',5,1,1,2,{key:true})], plan: [exit(0,0,-1),exit(1,0,-3),exit(2,1,0)] },
    { blocks: [piece(0,'coral',0,0,2,1,{key:true}),piece(1,'blue',5,1,1,2,{key:true}),piece(2,'lime',4,5,1,1,{key:true,ice:2}),piece(3,'coral',1,2)], plan: [exit(0,0,-1),exit(1,1,0),exit(2,0,1),exit(3,0,-3)] },
    { blocks: [piece(0,'coral',1,0),piece(1,'coral',1,1),piece(2,'blue',5,1),piece(3,'blue',4,1)], plan: [exit(1,0,-1),exit(0,0,-1),exit(3,1,0),exit(2,1,0)] },
    { blocks: [piece(0,'coral',0,0),piece(1,'coral',1,0),piece(2,'coral',2,0),piece(3,'blue',5,0),piece(4,'blue',5,1),piece(5,'blue',5,2)], plan: [exit(0,0,-1),exit(1,0,-1),exit(2,0,-1),exit(3,1,0),exit(4,1,0),exit(5,1,0)] },
    { blocks: [piece(0,'coral',1,0,2,1),piece(1,'blue',5,1,1,2)], queue: [piece(100,'lime',4,5),piece(101,'gold',0,4)], plan: [exit(0,0,-1),exit(1,1,0),exit(100,0,1),exit(101,-1,0)] },
    { blocks: [piece(0,'gold',2,2),piece(1,'coral',1,0),piece(2,'blue',5,1,1,2)], queue: [piece(100,'lime',4,5),piece(101,'gold',0,4)], plan: [exit(0,0,1),exit(0,-3,0),exit(1,0,-1),exit(2,1,0),exit(100,0,1),exit(101,-1,0)] },
  ];
  const info = stageInfo(number), level = 1 + Math.floor((number - 1) / 5), layout = layouts[number - 1];
  return { ...makeBase(modeFor(info.gimmicks), level, seed >>> 0), ...layout, queue: layout.queue || [], gimmicks: info.gimmicks, initial: layout.blocks.length, total: layout.blocks.length + (layout.queue?.length || 0), time: 240 };
}
function shortenPlan(state) {
  // Removing an exact repeated board removes only detours, never a mechanic or prerequisite.
  let cursor = state; const path = [], keys = [boardKey(state)], seen = new Map([[keys[0], 0]]);
  for (const action of state.plan) {
    cursor = move(cursor, action.id, action.dx, action.dy).state;
    const key = boardKey(cursor), previous = seen.get(key);
    if (previous !== undefined) {
      for (const removed of keys.splice(previous + 1)) seen.delete(removed);
      path.length = previous;
    } else { path.push(action); keys.push(key); seen.set(key, path.length); }
  }
  return path;
}
export function createStage(number = 1, seed = Date.now(), { layoutVersion = 2 } = {}) {
  if (![1,2].includes(layoutVersion)) throw new RangeError('Unsupported stage layout version');
  const info = stageInfo(number), level = 1 + Math.floor((info.number - 1) / 5);
  if (layoutVersion === 1) return { ...createLevel(modeFor(info.gimmicks), level, seed, { gimmicks: info.gimmicks }), stage: info.number, started: false, layoutVersion: 1 };
  if (info.number <= 7) return { ...teachingStage(info.number, seed), stage: info.number, started: false, layoutVersion: 2, lessonIndex: 0 };
  const cycle = Math.max(0, Math.floor((info.number - 8) / 5)), index = 7 + (info.number - 8) % 5;
  const triple = info.gimmicks.includes('triple'), merge = info.gimmicks.includes('merge');
  const blockCount = triple ? Math.min(12, (index === 10 ? 9 : 6) + cycle * 3) : Math.min(12, (index === 11 ? 8 : 6) + cycle);
  const recipe = { blockCount, mergePairs: Math.min(4,3+cycle), queueCount: Math.min(4,2+cycle), insertShuffle: Math.min(5,1+Math.floor((info.number-8)/4)), shuffle: Math.min(50,4+(info.number-8)*2), smallShapes: info.number < 18, singleCell: info.number === 8 };
  let state, bestCost = Infinity;
  const budget = [30,30,40,45,50][info.number - 8], attempts = info.number <= 12 ? 24 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const candidate = createLevel(modeFor(info.gimmicks), level, (seed + attempt * 7919) >>> 0, { gimmicks: info.gimmicks, recipe });
    if (info.number <= 12) candidate.plan = shortenPlan(candidate);
    const cost = candidate.plan.reduce((total, action) => total + Math.abs(action.dx + action.dy), 0);
    if (cost < bestCost) { state = candidate; bestCost = cost; }
    if (cost <= budget) break;
  }
  return { ...state, seed: seed >>> 0, stage: info.number, started: false, layoutVersion: 2, time: info.number <= 12 ? 210 : 180 };
}
export function guide(s, limit = 16000) {
  const lesson = lessonStep(s);
  if (lesson && move(s, lesson.blockId, lesson.dx, lesson.dy).ok) return { id: lesson.blockId, dx: lesson.dx, dy: lesson.dy };
  // Replay the certified construction path first. It remains useful after arbitrary deviations.
  let cursor = s.stage && !s.campaignLegacy ? createStage(s.stage, s.seed, { layoutVersion: s.layoutVersion || 1 }) : createLevel(s.mode, s.level, s.seed, s.gimmicks ? { gimmicks: s.gimmicks } : {});
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
    const dock = [...node.s.tray, ...(node.s.reserve || [])];
    const blocks = [...node.s.blocks].sort((a,b) => dock.filter(c=>c===b.color).length - dock.filter(c=>c===a.color).length);
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
  // Compatibility for older module consumers. Removed mechanics never move a block.
  return { ok: false, state: s, events: [] };
}
export function tick(s, seconds) {
  if (s.status !== 'playing' || !Number.isFinite(seconds) || seconds <= 0 || lessonStep(s)) return s;
  const next = { ...s }, protectedTime = Math.min(s.frozen, seconds);
  next.frozen = Math.max(0, s.frozen - seconds); next.time = Math.max(0, s.time - (seconds - protectedTime));
  if (next.time <= 0) { next.status = 'lost'; next.reason = 'time'; }
  return next;
}
export function continueRun(s) {
  if (s.status !== 'lost' || s.continues >= 2) return null;
  const next = copyState(s); next.status = 'playing'; next.time += 45;
  next.reserve.push(...next.tray); next.tray = []; next.reason = ''; next.continues++;
  settle(next, []); return next;
}
export function migrateRun(s) {
  const next = copyState(s);
  if (next.gimmicks) next.gimmicks = withoutLift(next.gimmicks);
  delete next.liftDirection;
  next.plan = next.plan.map(action => action.action === 'lift' ? { id: action.id, dx: 0, dy: 2 } : { ...action });
  // Older continues discarded partial triples. Recover only missing remainders.
  if (hasGimmick(s, 'triple') && s.stage === undefined && s.continues > 0 && s.reserve === undefined) {
    for (const color of Object.keys(COLORS)) {
      const count = s.blocks.filter(b => b.color === color).length + s.tray.filter(c => c === color).length;
      next.reserve.push(...Array((3 - count % 3) % 3).fill(color));
      while (matchTriple(next, color)) { /* Already-complete legacy remainders need no new block. */ }
    }
  }
  if (!next.blocks.length && !next.queue.length) settle(next, []);
  if (s.started === undefined) next.started = true;
  return next;
}
export function migrateCampaignRun(s) {
  const next = migrateRun(s);
  if (s.stage !== undefined) return s.campaignLegacy ? next : { ...next, layoutVersion: s.layoutVersion || 1 };
  return { ...next, stage: LEGACY_STAGES[s.mode] || 1, gimmicks: legacyGimmicks(s.mode), campaignLegacy: true, started: false };
}
export function newProfile() {
  return { stage: 1, coins: 350, items: { hammer: 3, freeze: 3, hint: 5, undo: 5, magnet: 2 }, levels: Object.fromEntries(Object.keys(MODES).map(k=>[k,1])), wins: 0, stars: 0, best: 0, daily: '', starter: false, pass: [], sound: true, motion: true, haptic: true, skin: 'original', aurora: false };
}
export function winReward(s, profile) {
  if (s.status !== 'won' || s.rewarded) return { state: s, profile, coins: 0, stars: 0 };
  const stars = s.time > 65 ? 3 : s.time > 25 ? 2 : 1, coins = 70 + stars * 20;
  const next = { ...profile, coins: profile.coins + coins, wins: profile.wins + 1, stars: profile.stars + stars, best: Math.max(profile.best, s.score), levels: { ...profile.levels, [s.mode]: Math.max(profile.levels[s.mode], Math.min(9999, s.level + 1)) } };
  if (s.stage && !s.campaignLegacy) next.stage = Math.max(profile.stage || 1, Math.min(9999, s.stage + 1));
  return { state: { ...s, rewarded: true, earnedCoins: coins, earnedStars: stars }, profile: next, coins, stars };
}
export function restoreProfile(value) {
  const p = newProfile(); if (!value || typeof value !== 'object') return p;
  const integer = (v, max = 10000000) => Number.isInteger(v) && v >= 0 && v <= max;
  for (const key of ['coins','wins','stars','best']) if (integer(value[key])) p[key] = value[key];
  if (integer(value.stage, 9999) && value.stage > 0) p.stage = value.stage;
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
  if (s.gimmicks !== undefined && (!validGimmicks(s.gimmicks) || modeFor(s.gimmicks) !== s.mode)) return false;
  if (s.campaignLegacy !== undefined && typeof s.campaignLegacy !== 'boolean') return false;
  if (s.campaignLegacy && s.stage === undefined) return false;
  if (s.layoutVersion !== undefined && (!s.stage || s.campaignLegacy || ![1,2].includes(s.layoutVersion))) return false;
  if (s.lessonIndex !== undefined && (s.layoutVersion !== 2 || !Number.isInteger(s.stage) || !Number.isInteger(s.lessonIndex) || s.stage < 1 || s.stage > 7 || s.lessonIndex < 0 || s.lessonIndex > LESSONS[s.stage - 1].length)) return false;
  if (s.layoutVersion === 2 && s.stage <= 7 && s.lessonIndex === undefined) return false;
  if (s.stage !== undefined) {
    if (!Number.isInteger(s.stage) || s.stage < 1 || s.stage > 9999 || !Array.isArray(s.gimmicks) || !Array.isArray(s.reserve) || typeof s.started !== 'boolean') return false;
    const expected = s.campaignLegacy ? legacyGimmicks(s.mode) : stageInfo(s.stage).gimmicks;
    if (!sameGimmicks(s.gimmicks, expected) || (s.campaignLegacy ? s.stage !== LEGACY_STAGES[s.mode] : s.level !== 1 + Math.floor((s.stage - 1) / 5))) return false;
    if (!s.campaignLegacy && s.queue.length && !hasGimmick(s, 'factory')) return false;
  }
  for (const key of ['total','initial','removed','moves','score','continues']) if (!Number.isInteger(s[key]) || s[key] < 0) return false;
  if (s.continues > 2 || !Number.isFinite(s.time) || s.time < 0 || s.time > 600 || !Number.isFinite(s.frozen) || s.frozen < 0 || s.frozen > 20) return false;
  if (s.reserve !== undefined && (!Array.isArray(s.reserve) || s.reserve.length > 14 || s.reserve.some(c => !COLORS[c]) || (!hasGimmick(s, 'triple') && s.reserve.length))) return false;
  if (s.started !== undefined && typeof s.started !== 'boolean') return false;
  const blocks = [...s.blocks,...s.queue], ids = new Set();
  for (const b of blocks) {
    if (!b || !COLORS[b.color] || ![1,2].includes(b.w) || ![1,2].includes(b.h) || !Number.isInteger(b.x) || !Number.isInteger(b.y) || b.x < 0 || b.y < 0 || b.x + b.w > SIZE || b.y + b.h > SIZE || !Number.isInteger(b.id) || ids.has(b.id) || !Number.isInteger(b.rank) || b.rank < 1 || b.rank > 4 || (b.ice !== undefined && ![0,1,2].includes(b.ice))) return false;
    ids.add(b.id);
  }
  if (s.stage && !s.campaignLegacy && blocks.some(b => (b.key && !hasGimmick(s, 'key')) || (b.ice > 0 && !hasGimmick(s, 'ice')))) return false;
  if (s.blocks.some(b => !fits(s,b,b.x,b.y)) || s.tray.some(c=>!COLORS[c]) || s.unlocked.some(c=>!COLORS[c])) return false;
  if (s.removed + blocks.length !== s.total || s.total < 1 || s.total > 20 || s.initial > s.total || (!hasGimmick(s, 'triple') && s.tray.length)) return false;
  if (s.status === 'won' && (blocks.length || s.tray.length || s.reserve?.length)) return false;
  return s.plan.every(a => a && Number.isInteger(a.id) && Number.isInteger(a.dx) && Number.isInteger(a.dy) && (a.action === 'lift' ? hasGimmick(s,'factory') && a.dx === 0 && a.dy === 0 : a.action === undefined && (!a.dx !== !a.dy) && Math.abs(a.dx+a.dy) <= SIZE));
}
