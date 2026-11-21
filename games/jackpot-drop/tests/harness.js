// tests/harness.js — balance harness. Copy verbatim.
// policy: 'random' | 'aim' | 'pro'. One rnd stream: picks, power draws, card offer, card choice.
//   random: loads a random number of balls (1..up.load), any balls, any charge.
//   aim:    follows the stage hint and tries for the PERFECT band, landing near it (a first-time player who reads the
//           stage intro). { load: 'all' }: loads every ball it can. { ball }: fires the other balls first (all of them
//           together when it can load several) and the hinted ball last. No hint: loads every ball it can.
//   pro:    test-fires every load it can make (1..up.load balls, iron balls last) x 7 charges on a copy of the board
//           and keeps the best (a player who has learned the board and the tools). Points banked by a ball parked on an
//           iron wall count x5 if an iron ball is still left to release them.
JD.PRO_POWERS = [0.15, 0.3, 0.45, 0.6, 0.72, 0.84, 1.0];

// Put iron balls at the back of a load (they leave the lane last).
JD.ironLast = function (keys) {
  return keys.filter(function (t) { return t !== 'iron'; }).concat(keys.filter(function (t) { return t === 'iron'; }));
};

// Every distinct load of 1..n balls from `left` (as sorted type lists, iron last).
JD.loadChoices = function (left, n) {
  var out = [], seen = {};
  (function walk(start, cur, pool) {
    if (cur.length) {
      var key = cur.slice().sort().join(',');
      if (!seen[key]) { seen[key] = true; out.push(JD.ironLast(cur.slice().sort())); }
    }
    if (cur.length >= n) return;
    for (var i = start; i < pool.length; i++) walk(i + 1, cur.concat([pool[i]]), pool);
  })(0, [], left.slice().sort());
  return out;
};

// Returns { balls, power } for the next shot. left = ball types still in the rack this stage.
JD.choosePick = function (board, policy, rnd, up, left, hint) {
  var n = Math.max(1, Math.min(up.load || 1, left.length));
  if (policy !== 'pro') {
    var pool = left.slice(), take = [];
    var count = policy === 'random' ? 1 + Math.floor(rnd() * n) : n;
    if (policy === 'aim' && hint && hint.ball) {
      var others = pool.filter(function (t) { return t !== hint.ball; });
      if (others.length) { pool = others; count = Math.min(n, others.length); }
      else { pool = [hint.ball]; count = 1; }
    }
    for (var c = 0; c < count && pool.length; c++) take.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    var sp = JD.SPRING;
    var power = policy === 'random' ? 0.05 + 0.95 * rnd() : (sp.perfectLo + sp.perfectHi) / 2 + (rnd() - 0.5) * 0.24;
    return { balls: JD.ironLast(take), power: power };
  }
  var best = null;
  JD.loadChoices(left, n).forEach(function (load) {
    for (var i = 0; i < JD.PRO_POWERS.length; i++) {
      var p = Math.min(1, JD.PRO_POWERS[i] + (rnd() - 0.5) * 0.04);
      var pick = { balls: load, power: p };
      var copy = JSON.parse(JSON.stringify(board)), shot = JD.createShot(copy, p, up, pick);
      while (!JD.stepShot(shot)) {}
      // value = this shot's score + what newly banked points will pay if an iron ball is still left to release them (x5)
      var rest = left.slice(); load.forEach(function (t) { rest.splice(rest.indexOf(t), 1); });
      var banked = copy.parked.reduce(function (s, q) { return s + q.bank; }, 0) - board.parked.reduce(function (s, q) { return s + q.bank; }, 0);
      var value = shot.score + (rest.indexOf('iron') >= 0 ? banked * copy.mult * 5 : 0);
      if (!best || value > best.value) best = { pick: pick, value: value };
    }
  });
  return best.pick;
};
// maxStages: how many stages to play at most (default 8 = the fixed run; larger values continue into ENDLESS).
// won = cleared stage 8. reached = number of stages cleared.
JD.simulateRun = function (seed, policy, maxStages) {
  var rnd = JD.mulberry32(seed + 999), up = JD.newUpgrades(), last = (maxStages || JD.STAGES.length) - 1;
  var out = { seed: seed, won: false, reached: 0, stages: [], shots: 0, flightTicks: 0, cards: 0, perfects: 0, jackpots: 0, picks: {}, loaded: 0 };
  for (var s = 0; s <= last; s++) {
    var S = JD.stageDef(s), board = JD.buildBoard(s, up, seed), score = 0, left = up.rack.slice();
    while (left.length) {
      var pick = JD.choosePick(board, policy, rnd, up, left, S.hint);
      pick.balls.forEach(function (t) { left.splice(left.indexOf(t), 1); out.picks[t] = (out.picks[t] || 0) + 1; });
      var shot = JD.createShot(board, pick.power, up, pick);
      while (!JD.stepShot(shot)) {}
      score += shot.score; out.shots++; out.flightTicks += shot.t; out.loaded += pick.balls.length;
      if (shot.perfect) out.perfects++;
      if (shot.balls.some(function (b) { return !b.lost && !b.parked && shot.bucketMult[b.bucket] === 5; })) out.jackpots++;
      if (score >= S.target) break;
    }
    var clear = score >= S.target;
    out.stages.push({ score: score, used: up.rack.length - left.length, clear: clear });
    if (!clear) return out;
    out.reached = s + 1;
    if (s + 1 >= JD.STAGES.length) out.won = true;
    if (s === last) return out;
    var offer = JD.drawOffer(rnd, up, s);
    JD.applyCard(up, offer[Math.floor(rnd() * offer.length)]);
    out.cards++;
  }
  return out;
};
