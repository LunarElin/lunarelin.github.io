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

  function copyUpgrades(up) {
    return { ...up, rack: up.rack.slice(), perks: { ...up.perks } };
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
      attempt: integer(savedCampaign.attempt, 0, maxNumber)
    };
    let cleared = integer(source.cleared, 0, stageCount);
    let endlessUnlocked = source.endlessUnlocked === true || cleared >= unlockStage;
    let endlessBest = integer(source.endlessBest, 0, maxNumber);
    let runSeedCursor = campaign.seed;
    const stageBest = Array.from({ length: stageCount }, (_, index) => integer(source.stageBest?.[index], 0, maxNumber));
    let tick = 0;
    let mode, seed, attempt, state, enteredTick, stageIndex, stage, stageStartedTick, board, pegById;
    let mapReturn;
    let up, left, fullRack, rackIndices, slot, offer;
    let campaignRandom, offerRandom;
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
      slot = 0;
      enter('AIM');
    }

    function startStage(announce = true) {
      stage = JD.stageDef(stageIndex);
      up = JD.newUpgrades(wallet.perks, stageIndex);
      board = JD.buildBoard(stageIndex, up, seed, attempt);
      pegById = new Map(board.pegs.map(peg => [peg.id, peg]));
      stageStartedTick = tick;
      stageScore = stageCoins = 0;
      left = up.rack.slice();
      fullRack = left.slice();
      rackIndices = left.map((ball, index) => index);
      offer = null;
      banner = null;
      enterAim();
      if (announce) emit('stage_started', {
        stage: stageNumber(), name: stage.name, target: stage.target,
        balls: left.length, endless: mode === 'endless', mode, attempt
      });
    }

    function startRun(nextMode, runSeed, nextStage, nextAttempt) {
      mode = nextMode;
      seed = runSeed;
      stageIndex = nextStage;
      attempt = nextAttempt;
      if (mode === 'campaign') {
        campaignRandom ||= JD.mulberry32(seed + 999);
        offerRandom = campaignRandom;
      } else offerRandom = JD.mulberry32(seed + 999);
      runScore = runCoins = biggestShot = jackpots = perfects = bestTier = pegsPopped = blocksBroken = 0;
      result = null;
      launch = null;
      lastPower = null;
      mapReturn = null;
      emit('run_started', { seed });
    }

    function startCampaign() {
      const completed = campaign.stage === stageCount;
      startRun('campaign', campaign.seed, Math.min(campaign.stage, stageCount - 1), campaign.attempt);
      startStage(!completed);
      if (completed) openMap(false);
    }

    function startEndless(runSeed) {
      startRun('endless', runSeed, stageCount, 0);
      startStage();
    }

    function fire() {
      const ball = left[slot];
      const firedPower = Math.max(JD.CFG.POWER_MIN, power);
      const perfect = JD.isPerfect(firedPower);
      left.splice(slot, 1);
      rackIndices.splice(slot, 1);
      slot = undefined;
      power = lastPower = firedPower;
      charging = false;
      launch = { power: firedPower, perfect, ball };
      hitPins = [];
      if (perfect) perfects++;
      enter('LAUNCH');
      emit('shot_fired', { stage: stageNumber(), ballsLeft: left.length, power: firedPower, perfect, balls: [ball] });
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
        const ballsLeft = left.length;
        const bonus = Math.round(stage.target / 10) * ballsLeft;
        const firstClear = mode === 'campaign' && number > cleared;
        const unlock = firstClear && number === unlockStage && !endlessUnlocked;
        const allClear = mode === 'campaign' && number === stageCount;
        const kind = allClear ? 'allclear' : unlock ? 'unlock' : 'clear';
        runScore += bonus;
        if (firstClear) cleared = number;
        if (mode === 'campaign') {
          campaign.stage = stageIndex + 1;
          campaign.attempt = 0;
        }
        emit('stage_clear', { stage: number, stageScore, ballsLeft, bonus, firstClear });
        const newBall = mode === 'campaign' && number === 1 ? 'iron' : null;
        if (newBall) emit('ball_unlocked', { ball: newBall });
        if (unlock) {
          endlessUnlocked = true;
          emit('endless_unlocked');
        } else if (allClear) {
          emit('all_clear', { runScore });
          emit('campaign_clear');
        }
        if (firstClear) creditCoins(JD.CFG.CLEAR_COINS, 'clear');
        banner = { kind, text: allClear ? 'CAMPAIGN CLEAR!' : unlock ? 'ENDLESS UNLOCKED' : 'STAGE CLEAR!', ratio: null, newBall };
        enter('BANNER');
      } else if (left.length > 0) {
        offer = JD.drawOffer(offerRandom, up, left);
        enter('CARD');
        emit('cards_offered', { ids: offer.slice(), fixed: false });
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
        up = JD.newUpgrades(wallet.perks, stageIndex);
        if (mode === 'campaign') {
          enter('SHOP');
          emit('shop_opened', { coins: wallet.coins, attempt });
        } else {
          const stageReached = stageNumber();
          const reached = stageReached - 1;
          result = {
            won: false, reached, stageReached, stageName: stage.name, ratio: banner.ratio,
            runScore, biggestShot, jackpots, perfects, bestTier, pegsPopped, blocksBroken,
            coins: runCoins, rack: fullRack.slice()
          };
          endlessBest = Math.max(endlessBest, stageReached);
          enter('RESULT');
          emit('run_ended', { won: false, reached, stageReached, runScore });
        }
      } else if (banner.kind === 'allclear') {
        up = JD.newUpgrades(wallet.perks, stageIndex);
        openMap(false);
      } else {
        stageIndex++;
        attempt = 0;
        startStage();
      }
      banner = null;
    }

    function pickCard(index) {
      if (!Number.isInteger(index) || index < 0 || index >= offer.length) return;
      const id = offer[index];
      JD.applyCard(up, id, board, left, offerRandom);
      // Keep the displayed slots stable after a shot or a temporary ball upgrade.
      if (left.length > rackIndices.length) rackIndices.push(fullRack.length);
      left.forEach((ball, index) => { fullRack[rackIndices[index]] = ball; });
      emit('card_picked', { id, level: up[id] });
      offer = null;
      enterAim();
    }

    function pickBall(index) {
      if (charging || !Number.isInteger(index) || index < 0 || index >= left.length) return;
      slot = index;
      emit('ball_picked', { slot, ball: left[slot] });
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
      }
    }

    function buyPerk(id) {
      if (!JD.PERK_IDS.includes(id)) return;
      const cost = JD.perkCost(id, wallet.perks[id]);
      if (!JD.buyPerk(wallet, id)) return;
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
        campaignRandom = null;
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
        campaign: { ...campaign },
        cleared, stageBest: stageBest.slice(), endlessUnlocked, endlessBest,
        muted: source.muted === true
      };
    }

    function snapshot() {
      const elapsed = tick - enteredTick;
      const shownShot = state === 'FLIGHT' ? shot : null;
      return {
        tick, state, seed, stage: stageNumber(), stageIndex, stageName: stage.name, endless: mode === 'endless',
        stageStartedTick, stateElapsed: elapsed, practiceStart, practice, target: stage.target, stageScore, runScore,
        mode, attempt, coins: wallet.coins, perks: { ...wallet.perks }, cleared, endlessUnlocked, endlessBest,
        shop: state === 'SHOP' ? shopSnapshot() : null,
        map: state === 'MAP' ? mapSnapshot() : null,
        ballsLeft: left.length, power, charging, lastPower,
        perfect: JD.isPerfect(power), rack: left.slice(),
        fullRack: fullRack.slice(), rackIndices: rackIndices.slice(), slot,
        rows: board.rows, landY: board.landY, boardH: board.h,
        hint: stage.hint ? Object.assign({}, stage.hint) : null,
        iron: board.iron.map(group => ({ id: group.id, alive: group.alive, segs: group.segs.map(segment => segment.slice()) })),
        parked: board.parked.map(({ x, y, r, ball, group, bank }) => ({ x, y, r, ball, group, bank })),
        bank: board.parked.reduce((total, ball) => total + ball.bank, 0),
        warps: board.warps ? { ins: copyRecords(board.warps.ins) } : null,
        ball: launch ? launch.ball : shot ? shot.ballKeys[0] : left[slot] || null,
        launch: launch ? { elapsed: elapsed + 1, power: launch.power, perfect: launch.perfect, balls: [launch.ball] } : null,
        stageMult: board.mult,
        up: copyUpgrades(up),
        offer: offer ? offer.slice() : null,
        pegs: copyRecords(board.pegs),
        bumpers: copyRecords(board.bumpers),
        gates: copyRecords(board.gates),
        blocks: copyRecords(board.blocks),
        terrain: board.terrain.map(segment => segment.slice()),
        buckets: { x: board.buckets.x.slice(), mult: board.buckets.mult.slice() },
        balls: shot ? shot.balls.map(({ x, y, r, key, done, lost, parked, bucket }, index) => ({
          x, y, r, key, done, lost, parked, bucket, cracked: crackedBall === index
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
