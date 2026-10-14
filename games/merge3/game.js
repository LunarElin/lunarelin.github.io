import {place, random} from './rules.mjs';
const $ = id => document.getElementById(id);
let board, score, turns, next, rng, log, started, best = 0;
try { best = Number(localStorage.getItem('merge3:v1:best')) || 0; } catch {}
const cells = Array.from({length:25}, (_,i) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.addEventListener('click', () => play(i));
  $('board').append(button);
  return button;
});
function draw() {
  cells.forEach((cell,i) => {
    cell.textContent = board[i] || '+';
    cell.dataset.level = board[i];
    cell.dataset.high = board[i] > 5;
    cell.classList.toggle('hint', turns === 0 && i === 12);
    cell.setAttribute('aria-label', `${Math.floor(i/5)+1}행 ${i%5+1}열: ${board[i] || '빈칸'}`);
  });
  $('score').textContent = score;
  $('best').textContent = best;
  $('next').textContent = next;
  $('session').textContent = `v1 · 시드 ${log.seed} · ${turns}턴 · 머지 ${log.moves.reduce((s,m)=>s+m.merges,0)}회`;
}
function restart() {
  const seed = Date.now() >>> 0;
  rng = random(seed);
  board = Array(25).fill(0);
  board[10] = board[11] = 1;
  score = turns = 0; next = 1; started = performance.now();
  log = {version:1,seed,config:{size:5,weights:{1:80,2:20},merge:'connected >=3, orthogonal, consume all',score:'group size × upgraded level × 10'},moves:[]};
  $('message').textContent = '밝게 표시된 빈칸에 1을 놓아 첫 머지를 만들어 보세요.';
  draw();
}
function play(index) {
  if (!board.includes(0)) return;
  const result = place(board,index,next);
  if (!result) { $('message').textContent = '숫자가 없는 빈칸을 선택해 주세요.'; return; }
  log.moves.push({index,value:next,merges:result.merges,elapsedMs:Math.round(performance.now()-started),board:result.board.slice()});
  board = result.board; score += result.score; turns++;
  if (score > best) { best = score; try { localStorage.setItem('merge3:v1:best',best); } catch {} }
  next = rng() < .8 ? 1 : 2;
  $('message').textContent = result.over ? '빈칸이 없어요! 새로 시작해서 기록에 도전하세요.' : result.merges ? `${result.merges > 1 ? result.merges+'연쇄! ' : '머지! '}+${result.score}점 · 다음 숫자를 놓아 보세요.` : '같은 숫자 근처에 놓아 셋을 연결해 보세요.';
  draw();
}
$('restart').addEventListener('click',restart);
$('download').addEventListener('click',()=>{
  const url = URL.createObjectURL(new Blob([JSON.stringify({...log,score,turns},null,2)],{type:'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = `merge3-${log.seed}.json`; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
restart();
