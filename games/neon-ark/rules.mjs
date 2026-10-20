export const SIZE = 6;
export const ROWS = 5;
export const FINAL_STAGE = 9;
export const COLORS = [
  { name: '시안', hex: '#55edff', symbol: '◆' },
  { name: '핑크', hex: '#ff70c6', symbol: '♥' },
  { name: '라임', hex: '#c5fb67', symbol: '✦' },
  { name: '오렌지', hex: '#ffb36b', symbol: '▲' },
];
export const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const UPGRADES = {
  dock: { name: '도크 확장', color: '#c5fb67', type: '정박 공간', max: 2, summary: '도크 +1칸', effect: '다른 색 탐사정을 보관할 도크가 한 칸 늘어납니다. 기본 3칸에서 최대 5칸입니다. 대기열 순서와 탐사정당 정원 3명은 바뀌지 않습니다.' },
  scan: { name: '관측 배열', color: '#55edff', type: '정보', max: 3, summary: '관측 +3명', effect: '탑승 대기열을 세 명 더 미리 봅니다. 기본 6명에서 최대 15명입니다. 현재 필요한 색과 뒤에 필요한 색을 함께 보고 도크를 계획할 수 있습니다.' },
  recall: { name: '긴급 회항', color: '#ff70c6', type: '판단 여유', max: 2, summary: '회항 +1회', effect: '아직 출항하지 않은 직전 이동의 되돌리기 한도가 한 회 늘어납니다. 기본 1회에서 최대 3회입니다. 도크 포화로 실패한 뒤에는 사용할 수 없고, 재시도·새로고침으로 사용 횟수가 회복되지 않습니다.' },
  armor: { name: '선체 보강', color: '#a69bff', type: '원정 생존', max: 3, summary: '최대·현재 선체 +1', effect: '최대 선체와 현재 선체를 각각 1 올립니다. 도크 포화나 탐사 중단의 비상 이탈은 선체를 1 소모합니다. 이미 잃은 선체를 전부 회복하지는 않습니다.' },
};
export const emptyBuild = () => Object.fromEntries(Object.keys(UPGRADES).map(key => [key, 0]));
export const clone = value => JSON.parse(JSON.stringify(value));
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
function random(seed) {
  let n = seed >>> 0;
  return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function buildStats(build) { return { docks: 3 + build.dock, maxHull: 3 + build.armor, undoLimit: 1 + build.recall, preview: 6 + build.scan * 3 }; }
export function pathClear(ships, ship) {
  const [dx, dy] = DIRECTIONS[ship.dir];
  for (let x = ship.x + dx, y = ship.y + dy; x >= 0 && x < SIZE && y >= 0 && y < ROWS; x += dx, y += dy) {
    if (ships.some(other => other.id !== ship.id && other.x === x && other.y === y)) return false;
  }
  return true;
}
export function createStage(stage = 1, seed = 104729, build = emptyBuild(), hull = buildStats(build).maxHull, runScore = 0) {
  const rng = random(seed + stage * 997), ships = [], count = Math.min(9 + (stage - 1) * 3, 21), colors = stage === 1 ? 3 : 4;
  const cells = Array.from({ length: SIZE * ROWS }, (_, i) => ({ x: i % SIZE, y: Math.floor(i / SIZE) }));
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  // Reverse insertion is a legal removal order. Each crew group needs at most three docks.
  cells.slice(0, count).sort((a, b) => b.y - a.y).forEach((cell, i) => {
    const directions = [0, 1, 2, 3].filter(dir => pathClear(ships, { ...cell, dir }));
    ships.push({ ...cell, dir: directions[Math.floor(rng() * directions.length)], id: `s${i}`, color: Math.floor(rng() * colors), loaded: 0 });
  });
  const solution = ships.map(ship => ship.id).reverse(), queue = [];
  for (let i = 0; i < count;) {
    const size = stage === 1 && i < 3 ? 1 : stage < 3 ? 2 : 3;
    const group = solution.slice(i, i + size).reverse().map(id => ships.find(ship => ship.id === id).color);
    // Crew for a later, possibly blocked ship comes first; earlier blockers must be parked.
    for (let seat = 0; seat < 3; seat++) queue.push(...group);
    i += group.length;
  }
  return { version: 3, stage, seed, ships, queue, docks: Array(buildStats(build).docks).fill(null), solution, build: clone(build), hull,
    combo: 0, launched: 0, total: count, moves: 0, score: 0, runScore, hullDamage: 0, undoUsed: 0, attempts: 1, failureReason: null, status: 'playing' };
}
export function isJammed(state) { return state.docks.every(Boolean); }
export function failStage(state, reason = 'abort') {
  if (state.status !== 'playing' || !['jam', 'abort'].includes(reason)) return false;
  state.hull--; state.hullDamage = 1; state.score = 0; state.failureReason = reason; state.status = state.hull ? 'failed' : 'lost'; return true;
}
export function dockAndLaunch(state) {
  const launches = [];
  while (state.queue.length) {
    const index = state.docks.findIndex(ship => ship && ship.color === state.queue[0]);
    if (index < 0) break;
    const ship = state.docks[index]; ship.loaded++; state.queue.shift();
    if (ship.loaded === 3) {
      state.combo++; state.launched++;
      const score = 1000 + Math.min(state.combo - 1, 4) * 100;
      state.score += score;
      launches.push({ dock: index, color: ship.color, planet: state.launched, crew: 3, combo: state.combo, score });
      state.docks[index] = null;
    }
  }
  if (state.launched === state.total) state.status = 'won';
  else if (isJammed(state)) failStage(state, 'jam');
  return launches;
}
export function sendShip(state, id) {
  if (state.status !== 'playing') return { ok: false, reason: '진행 중인 항로가 아닙니다.' };
  const ship = state.ships.find(ship => ship.id === id), slot = state.docks.indexOf(null);
  if (!ship) return { ok: false, reason: '탐사정을 선택하세요.' };
  if (slot < 0) return { ok: false, reason: '도크가 포화되어 탐사가 중단되었습니다.' };
  if (!pathClear(state.ships, ship)) return { ok: false, reason: '앞이 막혔어요.' };
  state.ships = state.ships.filter(other => other.id !== id); state.docks[slot] = { ...ship }; state.moves++;
  const launches = dockAndLaunch(state); if (!launches.length) state.combo = 0;
  return { ok: true, ship, slot, launches };
}
export function undoMove(state, previous) {
  if (state.status !== 'playing' || state.undoUsed >= buildStats(state.build).undoLimit || !validState(previous) || previous.status !== 'playing') return null;
  if (previous.stage !== state.stage || previous.seed !== state.seed || previous.attempts !== state.attempts || previous.hull !== state.hull || previous.launched !== state.launched || previous.score !== state.score || previous.runScore !== state.runScore || previous.moves !== state.moves - 1 || JSON.stringify(previous.build) !== JSON.stringify(state.build)) return null;
  const restored = clone(previous); restored.undoUsed = state.undoUsed + 1; return restored;
}
export function restartStage(state) {
  if (state.status !== 'failed') return null;
  const next = createStage(state.stage, state.seed, state.build, state.hull, state.runScore);
  next.undoUsed = state.undoUsed; next.attempts = state.attempts + 1; return next;
}
export function upgradeChoices(state) {
  if (state.stage >= FINAL_STAGE) return [];
  const keys = Object.keys(UPGRADES).filter(key => state.build[key] < UPGRADES[key].max), rng = random(state.seed + state.stage * 7919 + 41);
  for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
  return keys.slice(0, 3);
}
export function upgradePreview(state, key) {
  const upgrade = UPGRADES[key]; if (!upgrade) return null;
  const before = buildStats(state.build), after = buildStats({ ...state.build, [key]: state.build[key] + 1 });
  const values = { dock: [`${before.docks}칸`, `${after.docks}칸`], scan: [`앞 ${before.preview}명`, `앞 ${after.preview}명`], recall: [`항로당 ${before.undoLimit}회`, `항로당 ${after.undoLimit}회`], armor: [`선체 ${state.hull}/${before.maxHull}`, `선체 ${state.hull + 1}/${after.maxHull}`] };
  const examples = {
    dock: `다음 항로에서 ${after.docks}대까지 정박할 수 있습니다. 비워 둔 한 칸이 막힌 탐사정의 길을 여는 공간이 됩니다.`,
    scan: `기존에 보이지 않던 ${before.preview + 1}~${after.preview}번째 탐사대 색을 미리 확인합니다. 숨겨진 대기열은 바뀌지 않습니다.`,
    recall: `다음 항로는 되돌리기 ${after.undoLimit}회로 시작합니다. 출항·도크 포화·비상 이탈은 되돌리지 못합니다.`,
    armor: `선체가 ${state.hull}에서 ${state.hull + 1}로 회복됩니다. 비상 이탈 한 번을 더 견딥니다.`,
  };
  return { key, ...upgrade, rank: state.build[key] + 1, before: values[key][0], after: values[key][1], example: examples[key] };
}
export function chooseUpgrade(state, key) {
  if (state.status !== 'won' || !upgradeChoices(state).includes(key)) return null;
  return createStage(state.stage + 1, state.seed, { ...state.build, [key]: state.build[key] + 1 }, state.hull + (key === 'armor' ? 1 : 0), state.runScore + state.score);
}
export function validState(state) {
  if (!state || state.version !== 3 || !integer(state.stage, 1, FINAL_STAGE) || !integer(state.seed, 0, 1000000000) || !['playing', 'won', 'failed', 'lost'].includes(state.status)) return false;
  if (!state.build || Object.keys(state.build).length !== Object.keys(UPGRADES).length || Object.entries(UPGRADES).some(([key, upgrade]) => !integer(state.build[key], 0, upgrade.max))) return false;
  const stats = buildStats(state.build);
  if (!integer(state.hull, 0, stats.maxHull) || !Array.isArray(state.ships) || state.ships.length > 21 || !Array.isArray(state.docks) || state.docks.length !== stats.docks || !Array.isArray(state.queue) || state.queue.length > 63 || !Array.isArray(state.solution)) return false;
  if (state.docks.some(ship => ship !== null && (typeof ship !== 'object' || Array.isArray(ship)))) return false;
  const all = [...state.ships, ...state.docks.filter(Boolean)], ids = new Set(), cells = new Set();
  for (const ship of all) {
    if (!ship || !/^s\d{1,2}$/.test(ship.id) || ids.has(ship.id) || !integer(ship.color, 0, 3) || !integer(ship.dir, 0, 3) || !integer(ship.loaded, 0, 2) || !integer(ship.x, 0, 5) || !integer(ship.y, 0, 4)) return false;
    ids.add(ship.id);
  }
  for (const ship of state.ships) { const cell = ship.y * SIZE + ship.x; if (cells.has(cell) || ship.loaded !== 0) return false; cells.add(cell); }
  if (state.queue.some(c => !integer(c, 0, 3))) return false;
  for (let c = 0; c < 4; c++) if (state.queue.filter(v => v === c).length !== all.filter(s => s.color === c).reduce((n, s) => n + 3 - s.loaded, 0)) return false;
  if (state.solution.length !== state.total || new Set(state.solution).size !== state.solution.length || state.solution.some(id => typeof id !== 'string' || !/^s\d{1,2}$/.test(id)) || all.some(ship => !state.solution.includes(ship.id))) return false;
  if (['combo', 'launched', 'total', 'moves', 'score', 'runScore', 'undoUsed', 'attempts'].some(key => !integer(state[key], 0, 1000000000)) || state.attempts < 1 || state.undoUsed > stats.undoLimit || state.hp !== undefined) return false;
  const finished = all.length === 0 && state.queue.length === 0;
  if (state.total !== Math.min(9 + (state.stage - 1) * 3, 21) || all.length + state.launched !== state.total || state.moves !== state.total - state.ships.length || state.combo > state.launched) return false;
  if (['failed', 'lost'].includes(state.status) ? state.score !== 0 : state.score < state.launched * 1000 || state.score > state.launched * 1400) return false;
  if (state.status === 'playing') return !finished && !isJammed(state) && state.hull > 0 && state.hullDamage === 0 && state.failureReason === null;
  if (state.status === 'won') return finished && state.hull > 0 && state.hullDamage === 0 && state.failureReason === null;
  return !finished && state.hullDamage === 1 && ['jam', 'abort'].includes(state.failureReason) && (state.failureReason !== 'jam' || isJammed(state)) && (state.status === 'failed' ? state.hull > 0 : state.hull === 0);
}
