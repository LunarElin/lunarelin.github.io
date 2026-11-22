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
// One try per stage, no shop (a skill check): plays campaign stages 1..maxStages (default 8) in a row and stops at the first fail.
// won = cleared stage 8 (ENDLESS_UNLOCK) in one go. reached = number of stages cleared.
JD.simulateRun = function (seed, policy, maxStages) {
  var rnd = JD.mulberry32(seed + 999), up = JD.newUpgrades(), last = (maxStages || JD.CFG.ENDLESS_UNLOCK) - 1;
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
    if (s + 1 >= JD.CFG.ENDLESS_UNLOCK) out.won = true;
    if (s === last) return out;
    var offer = JD.drawOffer(rnd, up, s);
    JD.applyCard(up, offer[Math.floor(rnd() * offer.length)]);
    out.cards++;
  }
  return out;
};

// Plays one stage (index s, attempt a) to the end or until the target is reached. Returns the stage result.
JD.playStage = function (s, up, seed, attempt, policy, rnd) {
  var S = JD.stageDef(s), board = JD.buildBoard(s, up, seed, attempt), score = 0, left = up.rack.slice();
  var r = { score: 0, shots: 0, coins: 0, flightTicks: 0, perfects: 0, jackpots: 0, loaded: 0, clear: false };
  while (left.length) {
    var pick = JD.choosePick(board, policy, rnd, up, left, S.hint);
    pick.balls.forEach(function (t) { left.splice(left.indexOf(t), 1); });
    var shot = JD.createShot(board, pick.power, up, pick);
    while (!JD.stepShot(shot)) {}
    score += shot.score; r.shots++; r.flightTicks += shot.t; r.loaded += pick.balls.length; r.coins += JD.shotCoins(shot);
    if (shot.perfect) r.perfects++;
    if (shot.balls.some(function (b) { return !b.lost && !b.parked && shot.bucketMult[b.bucket] === 5; })) r.jackpots++;
    if (score >= S.target) break;
  }
  r.score = score; r.clear = score >= S.target;
  return r;
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
// stage is retried with a new layout (attempt + 1), keeping the cards picked so far. maxTries caps attempts per stage.
// Returns per-stage attempts and how far the campaign got.
JD.simulateCampaign = function (seed, policy, maxTries) {
  var rnd = JD.mulberry32(seed + 999), wallet = { coins: 0, perks: JD.newPerks() }, up = JD.newUpgrades(wallet.perks);
  var out = { seed: seed, cleared: 0, tries: [], shots: 0, flightTicks: 0, cards: 0, coins: 0, perfects: 0, jackpots: 0, loaded: 0,
    perksAt: [], scores: [] };
  for (var s = 0; s < JD.CFG.CAMPAIGN; s++) {
    var a = 0, r;
    while (true) {
      JD.syncPerks(up, wallet.perks);
      r = JD.playStage(s, up, seed, a, policy, rnd);
      out.shots += r.shots; out.flightTicks += r.flightTicks; out.coins += r.coins; wallet.coins += r.coins;
      out.perfects += r.perfects; out.jackpots += r.jackpots; out.loaded += r.loaded;
      a++;
      if (r.clear || a >= (maxTries || 30)) break;
      JD.shopGreedy(wallet);
    }
    out.tries.push(a); out.scores.push(r.score);
    if (!r.clear) break;
    out.cleared = s + 1; wallet.coins += JD.CFG.CLEAR_COINS; out.coins += JD.CFG.CLEAR_COINS;
    out.perksAt.push(JD.PERK_IDS.map(function (id) { return wallet.perks[id]; }).join(''));
    if (s + 1 >= JD.CFG.CAMPAIGN) break;
    var offer = JD.drawOffer(rnd, up, s);
    JD.applyCard(up, offer[Math.floor(rnd() * offer.length)]);
    out.cards++;
  }
  out.wallet = wallet;
  return out;
};

// ENDLESS: a separate run that starts at index 20 with ballIron and springLoad already applied and the given perks.
// No retries: the run ends at the first failed stage. reached = endless stages cleared.
JD.simulateEndless = function (seed, policy, perks, maxStages) {
  var rnd = JD.mulberry32(seed + 999), up = JD.newUpgrades(perks), out = { seed: seed, reached: 0, scores: [], coins: 0 };
  JD.applyCard(up, 'ballIron'); JD.applyCard(up, 'springLoad');
  for (var k = 0; k < (maxStages || 12); k++) {
    var s = JD.CFG.CAMPAIGN + k, r = JD.playStage(s, up, seed, 0, policy, rnd);
    out.scores.push(r.score); out.coins += r.coins;
    if (!r.clear) return out;
    out.reached = k + 1;
    var offer = JD.drawOffer(rnd, up, s);
    JD.applyCard(up, offer[Math.floor(rnd() * offer.length)]);
  }
  return out;
};
