// tests/harness.js — balance harness. Copy verbatim.
// policy: 'random' | 'aim' | 'pro'. One rnd stream: picks, power draws, card offer, card choice.
//   random: any ball, any charge.
//   aim:    follows the stage hint (fires the other balls first and the hinted ball last), tries for the PERFECT
//           band and lands near it (a first-time player who reads the stage intro).
//   pro:    test-fires every ball type left x 7 charges on a copy of the board
//           and keeps the best (a player who has learned the board and the tools). Points banked by a ball parked on an
//           iron wall count x5 if an iron ball is still left to release them.
JD.PRO_POWERS = [0.15, 0.3, 0.45, 0.6, 0.72, 0.84, 1.0];

// Returns { ball, power } for the next shot. left = ball types still in the rack this stage.
JD.choosePick = function (board, policy, rnd, up, left, hint) {
  if (policy !== 'pro') {
    var b = left[Math.floor(rnd() * left.length)];
    if (policy === 'aim' && hint && hint.ball) {
      // read the hint: gather the other balls first, fire the hinted ball last
      var others = left.filter(function (t) { return t !== hint.ball; });
      b = others.length ? others[Math.floor(rnd() * others.length)] : hint.ball;
    }
    var sp = JD.SPRING;
    var power = policy === 'random' ? 0.05 + 0.95 * rnd() : (sp.perfectLo + sp.perfectHi) / 2 + (rnd() - 0.5) * 0.24;
    return { ball: b, power: power };
  }
  var best = null, types = left.filter(function (t, i) { return left.indexOf(t) === i; });
  types.forEach(function (b) {
    for (var i = 0; i < JD.PRO_POWERS.length; i++) {
      var p = Math.min(1, JD.PRO_POWERS[i] + (rnd() - 0.5) * 0.04);
      var pick = { ball: b, power: p };
      var copy = JSON.parse(JSON.stringify(board)), shot = JD.createShot(copy, p, up, pick);
      while (!JD.stepShot(shot)) {}
      // value = this shot's score + what newly banked points will pay if an iron ball is still left to release them (x5)
      var rest = left.slice(); rest.splice(rest.indexOf(b), 1);
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
  var out = { seed: seed, won: false, reached: 0, stages: [], shots: 0, flightTicks: 0, cards: 0, perfects: 0, jackpots: 0, picks: {} };
  for (var s = 0; s <= last; s++) {
    var S = JD.stageDef(s), board = JD.buildBoard(s, up, seed), score = 0, left = up.rack.slice();
    while (left.length) {
      var pick = JD.choosePick(board, policy, rnd, up, left, S.hint);
      left.splice(left.indexOf(pick.ball), 1);
      var shot = JD.createShot(board, pick.power, up, pick);
      while (!JD.stepShot(shot)) {}
      score += shot.score; out.shots++; out.flightTicks += shot.t;
      if (shot.perfect) out.perfects++;
      if (shot.balls.some(function (b) { return !b.lost && shot.bucketMult[b.bucket] === 5; })) out.jackpots++;
      out.picks[pick.ball] = (out.picks[pick.ball] || 0) + 1;
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
