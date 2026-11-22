// tests/harness.js — balance harness. Copy verbatim.
// policy: 'random' | 'aim' | 'pro'. One rnd stream: picks, angle draws, card offers and card choices.
//   random: fires any ball left in the rack at any cannon angle.
//   aim:    follows the stage hint and aims at the gold aim zone, missing by up to +-2 x zoneHalf degrees (a first-time
//           player who reads the stage intro). { ball }: fires the other balls first and the hinted ball last.
//   pro:    test-fires every ball type left at the zone centre and at -60, -50 ... 60 degrees on a copy of the board
//           and keeps the best (a player who has learned the board). Points banked by a ball parked on an iron wall
//           count x5 if an iron ball is still left to release them.
JD.PRO_ANGLES = [-60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60];

// Returns { ball, angle } for the next shot. left = ball types still in the rack this stage.
JD.choosePick = function (board, policy, rnd, up, left, hint) {
  var K = JD.CANNON;
  if (policy !== 'pro') {
    var pool = left.slice();
    if (policy === 'aim' && hint && hint.ball) {
      var others = pool.filter(function (t) { return t !== hint.ball; });
      pool = others.length ? others : [hint.ball];
    }
    var ball = pool[Math.floor(rnd() * pool.length)];
    var angle = policy === 'random' ? (rnd() * 2 - 1) * K.maxAngle : JD.aimZone(board).center + (rnd() * 2 - 1) * 2 * K.zoneHalf;
    return { ball: ball, angle: angle };
  }
  var best = null, types = left.filter(function (t, i) { return left.indexOf(t) === i; }).sort();
  var angles = [JD.aimZone(board).center].concat(JD.PRO_ANGLES);
  types.forEach(function (ball) {
    for (var i = 0; i < angles.length; i++) {
      var a = angles[i] + (i ? (rnd() - 0.5) * 2 : 0);
      var pick = { ball: ball, angle: a };
      var copy = JSON.parse(JSON.stringify(board)), shot = JD.createShot(copy, a, up, pick);
      while (!JD.stepShot(shot)) {}
      // value = this shot's score + what newly banked points will pay if an iron ball is still left to release them (x5)
      var rest = left.slice(); rest.splice(rest.indexOf(ball), 1);
      var banked = copy.parked.reduce(function (s, q) { return s + q.bank; }, 0) - board.parked.reduce(function (s, q) { return s + q.bank; }, 0);
      var value = shot.score + (rest.indexOf('iron') >= 0 ? banked * copy.mult * 5 : 0);
      if (!best || value > best.value) best = { pick: pick, value: value };
    }
  });
  return best.pick;
};
// Plays one attempt of stage index s from a fresh JD.newUpgrades(perks, s) (no cards) to the end or until the target is
// reached. After every shot that leaves the stage unfinished it draws a card offer from rnd and takes a random card
// (it works for the rest of this attempt only). Returns the attempt result.
JD.playStage = function (s, perks, seed, attempt, policy, rnd) {
  var S = JD.stageDef(s), up = JD.newUpgrades(perks, s), board = JD.buildBoard(s, up, seed, attempt), score = 0, left = up.rack.slice();
  var r = { score: 0, shots: 0, coins: 0, flightTicks: 0, perfects: 0, jackpots: 0, cards: 0, picks: {}, clear: false };
  while (left.length) {
    var pick = JD.choosePick(board, policy, rnd, up, left, S.hint);
    left.splice(left.indexOf(pick.ball), 1); r.picks[pick.ball] = (r.picks[pick.ball] || 0) + 1;
    var shot = JD.createShot(board, pick.angle, up, pick);
    while (!JD.stepShot(shot)) {}
    score += shot.score; r.shots++; r.flightTicks += shot.t; r.coins += JD.shotCoins(shot);
    if (shot.perfect) r.perfects++;
    if (shot.balls.some(function (b) { return !b.lost && !b.parked && shot.bucketMult[b.bucket] === 5; })) r.jackpots++;
    if (score >= S.target || !left.length) break;
    var offer = JD.drawOffer(rnd, up, left);
    JD.applyCard(up, offer[Math.floor(rnd() * offer.length)], board, left, rnd);
    r.cards++;
  }
  r.score = score; r.clear = score >= S.target;
  return r;
};

// One try per stage, no shop, no perks (a skill check): plays campaign stages 1..maxStages (default 8) in a row and
// stops at the first fail. won = cleared stage 8 (ENDLESS_UNLOCK) in one go. reached = number of stages cleared.
JD.simulateRun = function (seed, policy, maxStages) {
  var rnd = JD.mulberry32(seed + 999), last = (maxStages || JD.CFG.ENDLESS_UNLOCK) - 1;
  var out = { seed: seed, won: false, reached: 0, stages: [], shots: 0, flightTicks: 0, cards: 0, perfects: 0, jackpots: 0, picks: {} };
  for (var s = 0; s <= last; s++) {
    var r = JD.playStage(s, null, seed, 0, policy, rnd);
    out.shots += r.shots; out.flightTicks += r.flightTicks; out.cards += r.cards; out.perfects += r.perfects; out.jackpots += r.jackpots;
    for (var t in r.picks) out.picks[t] = (out.picks[t] || 0) + r.picks[t];
    out.stages.push({ score: r.score, used: r.shots, clear: r.clear });
    if (!r.clear) return out;
    out.reached = s + 1;
    if (s + 1 >= JD.CFG.ENDLESS_UNLOCK) out.won = true;
  }
  return out;
};
// Shop policy of the harness: keep buying the cheapest perk level the wallet can afford (ties in JD.PERK_IDS order).
JD.shopGreedy = function (wallet) {
  var bought = [];
  while (true) {
    var best = null;
    JD.PERK_IDS.forEach(function (id) {
      var c = JD.perkCost(id, wallet.perks[id]);
      if (c !== null && c <= wallet.coins && (!best || c < best.c)) best = { id: id, c: c };
    });
    if (!best) return bought;
    JD.buyPerk(wallet, best.id); bought.push(best.id);
  }
};

// CAMPAIGN: stages 1..20 with retries. A failed stage sends the player to the shop (JD.shopGreedy) and the same
// stage is retried with a new layout (attempt + 1). Cards never carry over: every attempt starts with none.
// maxTries caps attempts per stage. Returns per-stage attempts and how far the campaign got.
JD.simulateCampaign = function (seed, policy, maxTries) {
  var rnd = JD.mulberry32(seed + 999), wallet = { coins: 0, perks: JD.newPerks() };
  var out = { seed: seed, cleared: 0, tries: [], shots: 0, flightTicks: 0, cards: 0, coins: 0, perfects: 0, jackpots: 0,
    perksAt: [], scores: [] };
  for (var s = 0; s < JD.CFG.CAMPAIGN; s++) {
    var a = 0, r;
    while (true) {
      r = JD.playStage(s, wallet.perks, seed, a, policy, rnd);
      out.shots += r.shots; out.flightTicks += r.flightTicks; out.coins += r.coins; wallet.coins += r.coins;
      out.perfects += r.perfects; out.jackpots += r.jackpots; out.cards += r.cards;
      a++;
      if (r.clear || a >= (maxTries || 30)) break;
      JD.shopGreedy(wallet);
    }
    out.tries.push(a); out.scores.push(r.score);
    if (!r.clear) break;
    out.cleared = s + 1; wallet.coins += JD.CFG.CLEAR_COINS; out.coins += JD.CFG.CLEAR_COINS;
    out.perksAt.push(JD.PERK_IDS.map(function (id) { return wallet.perks[id]; }).join(''));
  }
  out.wallet = wallet;
  return out;
};

// ENDLESS: a separate run that starts at index 20 with the given perks (the rack has the iron ball). No retries:
// the run ends at the first failed stage. reached = endless stages cleared.
JD.simulateEndless = function (seed, policy, perks, maxStages) {
  var rnd = JD.mulberry32(seed + 999), out = { seed: seed, reached: 0, scores: [], coins: 0 };
  for (var k = 0; k < (maxStages || 12); k++) {
    var r = JD.playStage(JD.CFG.CAMPAIGN + k, perks, seed, 0, policy, rnd);
    out.scores.push(r.score); out.coins += r.coins;
    if (!r.clear) return out;
    out.reached = k + 1;
  }
  return out;
};
