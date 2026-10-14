export const SIZE = 5;
export function place(board, index, value) {
  if (!Number.isInteger(index) || index < 0 || index >= 25 || board[index] !== 0 || !board.includes(0)) return null;
  const next = board.slice();
  next[index] = value;
  let score = 0, merges = 0;
  while (true) {
    const group = [index], seen = new Set(group);
    for (let i = 0; i < group.length; i++) {
      const p = group[i], row = Math.floor(p / SIZE), col = p % SIZE;
      for (const q of [row > 0 ? p-SIZE : -1, row < SIZE-1 ? p+SIZE : -1, col > 0 ? p-1 : -1, col < SIZE-1 ? p+1 : -1]) {
        if (q >= 0 && !seen.has(q) && next[q] === next[index]) { seen.add(q); group.push(q); }
      }
    }
    if (group.length < 3) break;
    const level = next[index] + 1;
    group.forEach(p => { next[p] = 0; });
    next[index] = level;
    score += group.length * level * 10;
    merges++;
  }
  return {board:next,score,merges,over:!next.includes(0)};
}
export function random(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state,1664525)+1013904223) >>> 0; return state / 4294967296; };
}
