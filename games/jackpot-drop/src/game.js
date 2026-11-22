(function (JD) {
  'use strict';

  function payoutSpacing(hits) {
    return Math.max(1, Math.min(3, Math.floor(60 / Math.max(1, hits))));
  }

  JD.payoutDuration = function (hits) {
    return hits * payoutSpacing(hits) + 70;
  };

  function copyRecords(items) {
    return items.map(item => Object.assign({}, item));
  }

  function integer(value, min, max, fallback = min) {
    if (!Number.isSafeInteger(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  function validSeed(value) {
    return Number.isSafeInteger(value) && value >= 1;
  }

  function perksFrom(source) {
    const perks = JD.newPerks();
    for (const id of JD.PERK_IDS) perks[id] = integer(source?.[id], 0, JD.PERKS[id].max);
    return perks;
  }

  function initialUpgrades(perks, stageIndex) {
    const up = JD.newUpgrades(perks);
    if (stageIndex > 0) JD.applyCard(up, 'ballIron');
    if (stageIndex > 1) JD.applyCard(up, 'springLoad');
    return up;
  }

  function copyUpgrades(up) {
    return { ...up, rack: up.rack.slice(), perks: { ...up.perks } };
  }

  function restoreUpgrades(raw, perks, stageIndex) {
    if (!raw || typeof raw !== 'object') return initialUpgrades(perks, stageIndex);
    const storedPerks = raw.perks ? perksFrom(raw.perks) : { ...perks };
    storedPerks.ball = Math.min(storedPerks.ball, perks.ball);
    const up = JD.newUpgrades(storedPerks);
    for (const id of [...JD.CARD_IDS, 'springLoad']) {
      const fixed = JD.STAGES.slice(0, Math.min(stageIndex, 2)).some(stage => stage.reward.includes(id));
      const level = integer(raw[id], fixed ? 1 : 0, JD.CARD_CAP[id] || JD.CFG.CAMPAIGN);
      for (let levelIndex = 0; levelIndex < level; levelIndex++) JD.applyCard(up, id);
    }
    if (raw.load === JD.CFG.LOAD_MAX) up.load = raw.load;
    const specialBalls = Object.keys(JD.CARD_BALL).reduce((total, id) => total + JD.CARD_CAP[id], 0);
    const rackLimit = Math.max(3, specialBalls) + JD.CARD_CAP.extra + perks.ball;
    if (Array.isArray(raw.rack) && raw.rack.length >= 3 && raw.rack.length <= rackLimit) {
      const rack = Array.from(raw.rack);
      if (rack.every(key => Object.prototype.hasOwnProperty.call(JD.BALLS, key))) {
        up.rack = rack;
        // A partially written save can have the new rack and the previous perk level.
        up.perks.ball = Math.max(up.perks.ball, perks.ball - (rackLimit - rack.length));
      }
    }
    JD.syncPerks(up, perks);
    return up;
  }

  JD.createGame = function (options) {
    const settings = options || {};
    const { CAMPAIGN: stageCount, ENDLESS_UNLOCK: unlockStage } = JD.CFG;
    const practiceStart = Number.isInteger(settings.start) && settings.start >= 2 && settings.start <= stageCount
      ? settings.start : null;
    const practice = practiceStart !== null || settings.endless === true;
    const source = practice ? {} : settings.save || {};
    const maxNumber = Number.MAX_SAFE_INTEGER;
    const startingSeed = validSeed(settings.seed) ? settings.seed : Math.floor(Math.random() * 1e9) + 1;
    const wallet = { coins: integer(source.coins, 0, maxNumber), perks: perksFrom(source.perks) };
    const savedCampaign = source.campaign || {};
    const savedStage = practiceStart === null
      ? (savedCampaign.stage <= stageCount ? integer(savedCampaign.stage, 0, stageCount) : 0) : practiceStart - 1;
    const campaign = {
      seed: validSeed(savedCampaign.seed) ? savedCampaign.seed : startingSeed,
      stage: savedStage,
      attempt: integer(savedCampaign.attempt, 0, maxNumber),
      up: restoreUpgrades(savedCampaign.up, wallet.perks, savedStage)
    };
    let cleared = integer(source.cleared, 0, stageCount);
    let endlessUnlocked = source.endlessUnlocked === true || cleared >= unlockStage;
    let endlessBest = integer(source.endlessBest, 0, maxNumber);
    let runSeedCursor = campaign.seed;
    const stageBest = Array.from({ length: stageCount }, (_, index) => integer(source.stageBest?.[index], 0, maxNumber));
    let tick = 0;
    let mode, seed, attempt, state, enteredTick, stageIndex, stage, stageStartedTick, board, pegById;
    let mapReturn;
    let up, offerRandom, offer, rackIndices, loaded;
    let power, chargeTicks, charging, enteredPerfect, lastPower;
    let launch, shot, crackedBall, hitPins, readyPayout, banner, result;
    let runScore, stageScore, runCoins, stageCoins;
    let biggestShot, jackpots, perfects, bestTier, pegsPopped, blocksBroken;
    let commands = [], events = [];

    function emit(type, detail) {
      events.push(Object.assign({ type, tick }, detail));
    }

    function enter(next) {
      state = next;
      enteredTick = tick;
    }

    function stageNumber() {
      return stageIndex + 1 - (mode === 'endless' ? stageCount : 0);
    }

    function nextSeed() {
      runSeedCursor = runSeedCursor < maxNumber ? runSeedCursor + 1 : 1;
      return runSeedCursor;
    }

    function resetCharge() {
      power = 0;
      chargeTicks = 0;
      charging = false;
      enteredPerfect = false;
    }

    function enterAim() {
      resetCharge();
      readyPayout = null;
      shot = null;
      loaded = [0];
      enter('AIM');
    }

    function startStage(announce = true) {
      stage = JD.stageDef(stageIndex);
      board = JD.buildBoard(stageIndex, up, seed, attempt);
      pegById = new Map(board.pegs.map(peg => [peg.id, peg]));
      stageStartedTick = tick;
      stageScore = stageCoins = 0;
      rackIndices = up.rack.map((ball, index) => index);
      offer = null;
      banner = null;
      enterAim();
      if (announce) emit('stage_started', {
        stage: stageNumber(), name: stage.name, target: stage.target,
        balls: rackIndices.length, endless: mode === 'endless', mode, attempt
      });
    }

    function startRun(nextMode, runSeed, nextStage, nextAttempt, nextUp) {
      mode = nextMode;
      seed = runSeed;
      stageIndex = nextStage;
      attempt = nextAttempt;
      up = nextUp;
      offerRandom = JD.mulberry32(seed + 999);
      if (mode === 'campaign' && !practice) {
        // Each cleared stage after the two fixed rewards uses one three-card offer.
        for (let draws = Math.max(0, stageIndex - 2) * 3; draws > 0; draws--) offerRandom();
      }
      runScore = runCoins = biggestShot = jackpots = perfects = bestTier = pegsPopped = blocksBroken = 0;
      result = null;
      launch = null;
      lastPower = null;
      mapReturn = null;
      emit('run_started', { seed });
    }

    function startCampaign() {
      const completed = campaign.stage === stageCount;
      startRun('campaign', campaign.seed, Math.min(campaign.stage, stageCount - 1), campaign.attempt, campaign.up);
      startStage(!completed);
      if (completed) openMap(false);
    }

    function startEndless(runSeed) {
      startRun('endless', runSeed, stageCount, 0, initialUpgrades(wallet.perks, stageCount));
      startStage();
    }

    function fire() {
      const balls = loaded.map(slot => up.rack[rackIndices[slot]]);
      const firedPower = Math.max(JD.CFG.POWER_MIN, power);
      const perfect = JD.isPerfect(firedPower);
      rackIndices = rackIndices.filter((_, slot) => !loaded.includes(slot));
      loaded = [];
      power = lastPower = firedPower;
      charging = false;
      launch = { power: firedPower, perfect, balls };
      hitPins = [];
      if (perfect) perfects++;
      enter('LAUNCH');
      emit('shot_fired', { stage: stageNumber(), ballsLeft: rackIndices.length, power: firedPower, perfect, balls: balls.slice() });
    }

    function startCharge() {
      if (charging) return;
      resetCharge();
      charging = true;
      emit('charge_started');
    }

    function chargeStep() {
      chargeTicks++;
      power = Math.min(1, chargeTicks / JD.SPRING.charge);
      if (!enteredPerfect && JD.isPerfect(power)) {
        enteredPerfect = true;
        emit('charge_zone', { zone: 'perfect' });
      }
    }

    function release() {
      if (!charging) return;
      if (power >= JD.CFG.POWER_MIN) fire();
      else {
        emit('charge_cancel', { power });
        resetCharge();
      }
    }

    function startFlight() {
      shot = JD.createShot(board, launch.power, up, launch);
      launch = null;
      crackedBall = -1;
      enter('FLIGHT');
    }

    function collectShotEvents() {
      for (const event of shot.events) {
        emit(event.type, event);
        switch (event.type) {
          case 'peg_hit': {
            const peg = pegById.get(event.id);
            hitPins.push({ id: peg.id, type: peg.type, x: peg.x, y: peg.y, tier: event.tier, removed: false });
            break;
          }
          case 'stuck_clear': {
            const removed = new Set(event.ids);
            for (const pin of hitPins) {
              if (removed.has(pin.id)) pin.removed = true;
            }
            break;
          }
          case 'bomb_exploded':
          case 'peg_break': {
            const pin = hitPins.find(hit => hit.id === event.id);
            if (pin) pin.removed = true;
            break;
          }
          case 'block_broken':
            blocksBroken++;
            break;
          case 'ball_crack':
            crackedBall = event.ball;
            break;
          case 'ball_landed':
            if (event.mult === 5) jackpots++;
            break;
        }
      }
      shot.events.length = 0;
    }

    function flightStep() {
      const finished = JD.stepShot(shot);
      collectShotEvents();
      if (!finished) return;
      const { score, pts, bankIn, golds, bucketSum, hits, t, tier } = shot;
      const parked = shot.balls.filter(ball => ball.parked).length;
      const mult = board.mult;
      biggestShot = Math.max(biggestShot, score);
      bestTier = Math.max(bestTier, tier);
      pegsPopped += hits;
      readyPayout = {
        duration: JD.payoutDuration(hits), spacing: payoutSpacing(hits),
        score, pts, bankIn, mult, bucketSum, hits, tier, pins: hitPins, coins: JD.shotCoins(shot),
        jackpot: shot.balls.some(ball => !ball.lost && shot.bucketMult[ball.bucket] === 5)
      };
      emit('shot_finished', { score, pts, bankIn, golds, stageMult: mult, bucketSum, hits, t, tier, parked });
      enter('PAYOUT');
    }

    function creditCoins(amount, cause) {
      wallet.coins = Math.min(maxNumber, wallet.coins + amount);
      stageCoins += amount;
      runCoins += amount;
      emit('coins_earned', { amount, total: wallet.coins, cause });
    }

    function finishPayout() {
      creditCoins(readyPayout.coins, 'shot');
      stageScore += readyPayout.score;
      runScore += readyPayout.score;
      if (mode === 'campaign') stageBest[stageIndex] = Math.max(stageBest[stageIndex], stageScore);
      readyPayout = null;
      shot = null;
      emit('payout_done', { stageScore });
      if (stageScore >= stage.target) {
        board.parked.length = 0;
        const number = stageNumber();
        const ballsLeft = rackIndices.length;
        const bonus = Math.round(stage.target / 10) * ballsLeft;
        const firstClear = mode === 'campaign' && number > cleared;
        const unlock = firstClear && number === unlockStage && !endlessUnlocked;
        const allClear = mode === 'campaign' && number === stageCount;
        const kind = allClear ? 'allclear' : unlock ? 'unlock' : 'clear';
        runScore += bonus;
        if (firstClear) cleared = number;
        emit('stage_clear', { stage: number, stageScore, ballsLeft, bonus, firstClear });
        if (unlock) {
          endlessUnlocked = true;
          emit('endless_unlocked');
        } else if (allClear) {
          campaign.stage = stageCount;
          campaign.attempt = 0;
          emit('all_clear', { runScore });
          emit('campaign_clear');
        }
        if (firstClear) creditCoins(JD.CFG.CLEAR_COINS, 'clear');
        banner = { kind, text: allClear ? 'CAMPAIGN CLEAR!' : unlock ? 'ENDLESS UNLOCKED' : 'STAGE CLEAR!', ratio: null };
        enter('BANNER');
      } else if (rackIndices.length > 0) {
        enterAim();
      } else {
        board.parked.length = 0;
        const ratio = Math.floor(stageScore * 100 / stage.target);
        banner = { kind: 'fail', ratio, text: ratio >= 80 ? 'SO CLOSE!' : 'OUT OF BALLS' };
        emit('stage_failed', { stage: stageNumber(), ratio });
        enter('BANNER');
      }
    }

    function openMap(canClose) {
      mapReturn = canClose ? { state, enteredTick, tick } : null;
      enter('MAP');
      emit('map_opened');
    }

    function finishBanner() {
      if (banner.kind === 'fail') {
        if (mode === 'campaign') {
          enter('SHOP');
          emit('shop_opened', { coins: wallet.coins, attempt });
        } else {
          const stageReached = stageNumber();
          const reached = stageReached - 1;
          result = {
            won: false, reached, stageReached, stageName: stage.name, ratio: banner.ratio,
            runScore, biggestShot, jackpots, perfects, bestTier, pegsPopped, blocksBroken,
            coins: runCoins, rack: up.rack.slice()
          };
          endlessBest = Math.max(endlessBest, stageReached);
          enter('RESULT');
          emit('run_ended', { won: false, reached, stageReached, runScore });
        }
      } else if (banner.kind === 'allclear') {
        openMap(false);
      } else {
        offer = JD.drawOffer(offerRandom, up, stageIndex);
        enter('CARD');
        emit('cards_offered', { ids: offer.slice(), fixed: !!stage.reward });
      }
      banner = null;
    }

    function pickCard(index) {
      if (!Number.isInteger(index) || index < 0 || index >= offer.length) return;
      const id = offer[index];
      JD.applyCard(up, id);
      emit('card_picked', { id, level: up[id] });
      stageIndex++;
      attempt = 0;
      if (mode === 'campaign') {
        campaign.stage = stageIndex;
        campaign.attempt = 0;
      }
      startStage();
    }

    function pickBall(slot) {
      if (charging || !Number.isInteger(slot) || slot < 0 || slot >= rackIndices.length) return;
      if (up.load === 1) {
        loaded = [slot];
      } else if (loaded.includes(slot)) {
        if (loaded.length === 1) return;
        loaded = loaded.filter(index => index !== slot);
      } else {
        if (loaded.length >= up.load) return;
        loaded.push(slot);
      }
      emit('ball_picked', { slot, ball: up.rack[rackIndices[slot]], loaded: loaded.slice() });
    }

    function handleAim(command) {
      switch (command.type) {
        case 'openMap':
          if (!charging) openMap(true);
          break;
        case 'hold':
          startCharge();
          break;
        case 'release':
          release();
          break;
        case 'pull':
          if (Number.isFinite(command.power)) {
            resetCharge();
            power = Math.max(0, Math.min(1, command.power));
          }
          break;
        case 'fire':
          fire();
          break;
        case 'pickBall':
          pickBall(command.slot);
          break;
        case 'loadAll':
          if (!charging && up.load > 1) loaded = rackIndices.slice(0, up.load).map((_, slot) => slot);
          break;
      }
    }

    function buyPerk(id) {
      if (!JD.PERK_IDS.includes(id)) return;
      const cost = JD.perkCost(id, wallet.perks[id]);
      if (!JD.buyPerk(wallet, id)) return;
      JD.syncPerks(up, wallet.perks);
      emit('perk_bought', { id, level: wallet.perks[id], cost, coins: wallet.coins });
    }

    function retryStage() {
      attempt = Math.min(maxNumber, attempt + 1);
      campaign.attempt = attempt;
      emit('stage_retry', { stage: stageNumber(), attempt });
      startStage();
    }

    function handleMap(command) {
      if (command.type === 'closeMap' && mapReturn) {
        state = mapReturn.state;
        enteredTick = mapReturn.enteredTick + tick - mapReturn.tick;
        mapReturn = null;
      } else if (command.type === 'continue' && campaign.stage < stageCount) {
        mapReturn = null;
        if (mode === 'campaign') startStage();
        else startCampaign();
      } else if (command.type === 'startEndless' && endlessUnlocked) {
        startEndless(nextSeed());
      }
    }

    function handleCommand(command) {
      if (command.type === 'newCampaign') {
        campaign.seed = nextSeed();
        campaign.stage = campaign.attempt = 0;
        campaign.up = JD.newUpgrades(wallet.perks);
        startCampaign();
      } else if (state === 'AIM') handleAim(command);
      else if (state === 'PAYOUT' && command.type === 'skip') finishPayout();
      else if (state === 'CARD' && command.type === 'pick') pickCard(command.index);
      else if (state === 'SHOP') {
        if (command.type === 'buy') buyPerk(command.id);
        else if (command.type === 'retry') retryStage();
      } else if (state === 'MAP') handleMap(command);
      else if (state === 'RESULT') {
        if (command.type === 'restart') startEndless(nextSeed());
        else if (command.type === 'openMap') openMap(true);
      }
    }

    function step() {
      tick++;
      const queued = commands;
      commands = [];
      queued.forEach(handleCommand);
      const elapsed = tick - enteredTick;
      if (state === 'AIM' && charging) chargeStep();
      if (state === 'LAUNCH' && elapsed >= JD.CFG.LAUNCH_TICKS) startFlight();
      if (state === 'FLIGHT') flightStep();
      else if (state === 'PAYOUT' && elapsed >= readyPayout.duration) finishPayout();
      else if (state === 'BANNER') {
        const duration = banner.kind === 'fail' ? 45 : banner.kind === 'clear' ? 60 : 90;
        if (elapsed >= duration) finishBanner();
      }
    }

    function shopSnapshot() {
      return {
        coins: wallet.coins,
        earned: stageCoins,
        ratio: Math.floor(stageScore * 100 / stage.target),
        items: JD.PERK_IDS.map(id => {
          const level = wallet.perks[id];
          const cost = JD.perkCost(id, level);
          return { id, level, max: JD.PERKS[id].max, cost, affordable: cost !== null && wallet.coins >= cost };
        })
      };
    }

    function mapSnapshot() {
      return {
        cleared, endlessUnlocked, endlessBest,
        current: campaign.stage === stageCount ? null : campaign.stage,
        stageBest: stageBest.slice(), canClose: !!mapReturn
      };
    }

    function saveState() {
      return {
        coins: wallet.coins,
        perks: { ...wallet.perks },
        campaign: { ...campaign, up: copyUpgrades(campaign.up) },
        cleared, stageBest: stageBest.slice(), endlessUnlocked, endlessBest,
        muted: source.muted === true
      };
    }

    function snapshot() {
      const elapsed = tick - enteredTick;
      const shownShot = state === 'FLIGHT' ? shot : null;
      const fullRack = up.rack.slice();
      const slot = loaded[0];
      return {
        tick, state, seed, stage: stageNumber(), stageIndex, stageName: stage.name, endless: mode === 'endless',
        stageStartedTick, stateElapsed: elapsed, practiceStart, practice, target: stage.target, stageScore, runScore,
        mode, attempt, coins: wallet.coins, perks: { ...wallet.perks }, cleared, endlessUnlocked, endlessBest,
        shop: state === 'SHOP' ? shopSnapshot() : null,
        map: state === 'MAP' ? mapSnapshot() : null,
        ballsLeft: rackIndices.length, power, charging, lastPower,
        perfect: JD.isPerfect(power), rack: rackIndices.map(index => fullRack[index]),
        fullRack, rackIndices: rackIndices.slice(), slot, loaded: loaded.slice(), load: up.load,
        rows: board.rows, landY: board.landY, boardH: board.h,
        hint: stage.hint ? Object.assign({}, stage.hint) : null,
        iron: board.iron.map(group => ({ id: group.id, alive: group.alive, segs: group.segs.map(segment => segment.slice()) })),
        parked: board.parked.map(({ x, y, r, ball, group, bank }) => ({ x, y, r, ball, group, bank })),
        bank: board.parked.reduce((total, ball) => total + ball.bank, 0),
        warps: board.warps ? { ins: copyRecords(board.warps.ins) } : null,
        ball: launch ? launch.balls[0] : shot ? shot.ballKeys[0] : fullRack[rackIndices[slot]] || null,
        launch: launch ? { elapsed: elapsed + 1, power: launch.power, perfect: launch.perfect, balls: launch.balls.slice() } : null,
        stageMult: board.mult,
        up: copyUpgrades(up),
        offer: offer ? offer.slice() : null,
        pegs: copyRecords(board.pegs),
        bumpers: copyRecords(board.bumpers),
        gates: copyRecords(board.gates),
        blocks: copyRecords(board.blocks),
        terrain: board.terrain.map(segment => segment.slice()),
        buckets: { x: board.buckets.x.slice(), mult: board.buckets.mult.slice() },
        balls: shot ? shot.balls.map(({ x, y, r, key, wait, done, lost, parked, bucket }, index) => ({
          x, y, r, key, wait, done, lost, parked, bucket, cracked: crackedBall === index
        })) : [],
        shot: shownShot ? {
          pts: shot.pts, hits: shot.hits, golds: shot.golds, t: shot.t,
          liveMult: board.mult + shot.golds, tier: shot.tier, perfect: shot.perfect,
          bankIn: shot.balls.reduce((total, ball) => total + (ball.bank || 0), 0),
          balls: shot.ballKeys.slice(),
          cracked: shot.cracked, shattered: shot.shattered, hitstop: shot.hitstop
        } : null,
        payout: readyPayout ? Object.assign({}, readyPayout, { elapsed, pins: copyRecords(readyPayout.pins) }) : null,
        banner: banner ? Object.assign({ elapsed }, banner) : null,
        result: result ? Object.assign({}, result, { rack: result.rack.slice() }) : null
      };
    }

    if (settings.endless === true) startEndless(startingSeed);
    else startCampaign();
    return {
      queue(command) {
        if (command && typeof command.type === 'string') commands.push(Object.assign({}, command));
      },
      step,
      snapshot,
      saveState,
      drainEvents() {
        const drained = events;
        events = [];
        return drained;
      },
      cancelInput() {
        commands = [];
        if (state === 'AIM') resetCharge();
      }
    };
  };
}(window.JD));
