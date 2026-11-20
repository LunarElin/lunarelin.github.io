// Deterministic play policies for balance regression tests.
// policy: 'random' | 'aim' | 'pro'. One rnd stream: picks, power draws, card offer, card choice.
//   random: any ball, any spring (any spin side), any charge.
//   aim:    follows the stage hint (hinted ball and spring while it has them, otherwise any), tries for the PERFECT
//           band and lands near it (a first-time player who reads the stage intro).
//   pro:    test-fires every ball type left x every spring (both spin sides) x 7 charges on a copy of the board
//           and keeps the best (a player who has learned the board and the tools).
JD.PRO_POWERS = [0.15, 0.3, 0.45, 0.6, 0.72, 0.84, 1.0];

// All spring picks the player can make: [{ spring, spin }].
JD.springPicks = function (up) {
  var out = [];
  up.springs.forEach(function (k) {
    if (JD.SPRINGS[k].spin) { out.push({ spring: k, spin: -1 }); out.push({ spring: k, spin: 1 }); }
    else out.push({ spring: k, spin: 1 });
  });
  return out;
};

// Returns { ball, spring, spin, power } for the next shot. left = ball types still in the rack this stage.
JD.choosePick = function (board, policy, rnd, up, left, hint) {
  var springs = JD.springPicks(up);
  if (policy !== 'pro') {
    var b = left[Math.floor(rnd() * left.length)], s = springs[Math.floor(rnd() * springs.length)];
    if (policy === 'aim' && hint) {
      if (hint.ball && left.indexOf(hint.ball) >= 0) b = hint.ball;
      if (hint.spring && up.springs.indexOf(hint.spring) >= 0) s = { spring: hint.spring, spin: hint.spin || 1 };
    }
    var sp = JD.SPRINGS[s.spring];
    var power = policy === 'random' ? 0.05 + 0.95 * rnd() : (sp.perfectLo + sp.perfectHi) / 2 + (rnd() - 0.5) * 0.24;
    return { ball: b, spring: s.spring, spin: s.spin, power: power };
  }
  var best = null, types = left.filter(function (t, i) { return left.indexOf(t) === i; });
  types.forEach(function (b) {
    springs.forEach(function (s) {
      for (var i = 0; i < JD.PRO_POWERS.length; i++) {
        var p = Math.min(1, JD.PRO_POWERS[i] + (rnd() - 0.5) * 0.04);
        var pick = { ball: b, spring: s.spring, spin: s.spin, power: p };
        var shot = JD.createShot(JSON.parse(JSON.stringify(board)), p, up, pick);
        while (!JD.stepShot(shot)) {}
        if (!best || shot.score > best.score) best = { pick: pick, score: shot.score };
      }
    });
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
      var key = pick.ball + '/' + pick.spring; out.picks[key] = (out.picks[key] || 0) + 1;
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
