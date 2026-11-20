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

  JD.createGame = function (options) {
    const settings = options || {};
    let tick = 0;
    let seed = Number.isInteger(settings.seed) && settings.seed >= 1
      ? settings.seed : Math.floor(Math.random() * 1e9) + 1;
    let practiceStart = Number.isInteger(settings.start) && settings.start >= 2 && settings.start <= 8
      ? settings.start : null;
    let state, enteredTick, stageIndex, stage, stageStartedTick, board, pegById;
    let up, offerRandom, offer, rackIndices, slot, spring, spinDirection;
    let power, chargeTicks, charging, enteredPerfect, lastPower;
    let launch, shot, hitPins, readyPayout, banner, result;
    let runScore, stageScore;
    let biggestShot, jackpots, perfects, bestTier, pegsPopped, blocksBroken;
    let commands = [], events = [];

    function emit(type, detail) {
      events.push(Object.assign({ type, tick }, detail));
    }

    function enter(next) {
      state = next;
      enteredTick = tick;
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

    function startStage() {
      stage = JD.stageDef(stageIndex);
      board = JD.buildBoard(stageIndex, up, seed);
      pegById = new Map(board.pegs.map(peg => [peg.id, peg]));
      stageStartedTick = tick;
      stageScore = 0;
      rackIndices = up.rack.map((ball, index) => index);
      offer = null;
      banner = null;
      enterAim();
      emit('stage_started', {
        stage: stageIndex + 1, name: stage.name, target: stage.target,
        balls: rackIndices.length, endless: !!stage.endless
      });
    }

    function startRun() {
      up = JD.newUpgrades();
      if (practiceStart >= 2) JD.applyCard(up, 'ballIron');
      if (practiceStart >= 3) JD.applyCard(up, 'springSpin');
      offerRandom = JD.mulberry32(seed + 999);
      stageIndex = (practiceStart || 1) - 1;
      spring = 'standard';
      spinDirection = -1;
      runScore = biggestShot = jackpots = perfects = bestTier = pegsPopped = blocksBroken = 0;
      result = null;
      launch = null;
      lastPower = null;
      emit('run_started', { seed });
      startStage();
    }

    function selection() {
      return {
        ball: up.rack[rackIndices[slot]] || null,
        spring,
        spin: JD.SPRINGS[spring].spin ? spinDirection : 0
      };
    }

    function fire() {
      const picked = selection();
      const firedPower = Math.max(JD.CFG.POWER_MIN, power);
      const perfect = JD.isPerfect(firedPower, picked.spring);
      rackIndices.splice(slot, 1);
      power = lastPower = firedPower;
      charging = false;
      launch = Object.assign({ power: firedPower, perfect }, picked);
      hitPins = [];
      if (perfect) perfects++;
      enter('LAUNCH');
      emit('shot_fired', Object.assign({ stage: stageIndex + 1, ballsLeft: rackIndices.length }, launch));
    }

    function startCharge() {
      if (charging) return;
      resetCharge();
      charging = true;
      emit('charge_started');
    }

    function chargeStep() {
      chargeTicks++;
      power = Math.min(1, chargeTicks / JD.SPRINGS[spring].charge);
      if (!enteredPerfect && JD.isPerfect(power, spring)) {
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
          case 'bomb_exploded': {
            const pin = hitPins.find(hit => hit.id === event.id);
            if (pin) pin.removed = true;
            break;
          }
          case 'block_broken':
            blocksBroken++;
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
      const { score, pts, golds, bucketSum, hits, t, tier } = shot;
      const mult = board.mult;
      biggestShot = Math.max(biggestShot, score);
      bestTier = Math.max(bestTier, tier);
      pegsPopped += hits;
      readyPayout = {
        duration: JD.payoutDuration(hits), spacing: payoutSpacing(hits),
        score, pts, mult, bucketSum, hits, tier, pins: hitPins,
        jackpot: shot.balls.some(ball => !ball.lost && shot.bucketMult[ball.bucket] === 5)
      };
      emit('shot_finished', { score, pts, golds, stageMult: mult, bucketSum, hits, t, tier });
      enter('PAYOUT');
    }

    function finishPayout() {
      stageScore += readyPayout.score;
      runScore += readyPayout.score;
      readyPayout = null;
      shot = null;
      emit('payout_done', { stageScore });
      if (stageScore >= stage.target) {
        const stageNumber = stageIndex + 1;
        const ballsLeft = rackIndices.length;
        const bonus = Math.round(stage.target / 10) * ballsLeft;
        const allClear = stageNumber === JD.STAGES.length;
        runScore += bonus;
        emit('stage_clear', { stage: stageNumber, stageScore, ballsLeft, bonus });
        if (allClear) emit('all_clear', { runScore });
        banner = { kind: allClear ? 'allclear' : 'clear', text: allClear ? 'ALL CLEAR!' : 'STAGE CLEAR!', ratio: null };
        enter('BANNER');
      } else if (rackIndices.length > 0) {
        enterAim();
      } else {
        const ratio = Math.floor(stageScore * 100 / stage.target);
        banner = { kind: 'fail', ratio, text: ratio >= 80 ? 'SO CLOSE!' : 'OUT OF BALLS' };
        emit('stage_failed', { stage: stageIndex + 1, ratio });
        enter('BANNER');
      }
    }

    function finishBanner() {
      if (banner.kind === 'fail') {
        const reached = stageIndex;
        const won = reached >= JD.STAGES.length;
        const stageReached = reached + 1;
        result = {
          won, reached, stageReached, stageName: stage.name, ratio: banner.ratio,
          runScore, biggestShot, jackpots, perfects, bestTier, pegsPopped, blocksBroken,
          rack: up.rack.slice(), springs: up.springs.slice()
        };
        enter('RESULT');
        emit('run_ended', { won, reached, stageReached, runScore });
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
      startStage();
    }

    function handleAim(command) {
      switch (command.type) {
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
          if (!charging && Number.isInteger(command.slot) && command.slot >= 0 && command.slot < rackIndices.length) {
            slot = command.slot;
            emit('ball_picked', { slot, ball: up.rack[rackIndices[slot]] });
          }
          break;
        case 'pickSpring':
          if (!charging && up.springs.includes(command.spring)) {
            spring = command.spring;
            if (JD.SPRINGS[spring].spin && (command.spin === -1 || command.spin === 1)) spinDirection = command.spin;
            emit('spring_picked', { spring, spin: JD.SPRINGS[spring].spin ? spinDirection : 0 });
          }
          break;
      }
    }

    function handleCommand(command) {
      if (state === 'AIM') handleAim(command);
      else if (state === 'PAYOUT' && command.type === 'skip') finishPayout();
      else if (state === 'CARD' && command.type === 'pick') pickCard(command.index);
      else if (state === 'RESULT' && command.type === 'restart') {
        seed++;
        practiceStart = null;
        startRun();
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
        const duration = banner.kind === 'allclear' ? 90 : banner.kind === 'clear' ? 60 : 45;
        if (elapsed >= duration) finishBanner();
      }
    }

    function snapshot() {
      const pick = selection();
      const elapsed = tick - enteredTick;
      const shownShot = state === 'FLIGHT' ? shot : null;
      const fullRack = up.rack.slice();
      const springs = up.springs.slice();
      return {
        tick, state, seed, stage: stageIndex + 1, stageName: stage.name, endless: !!stage.endless,
        stageStartedTick, stateElapsed: elapsed, practiceStart, target: stage.target, stageScore, runScore,
        ballsLeft: rackIndices.length, power, charging, lastPower,
        perfect: JD.isPerfect(power, spring), rack: rackIndices.map(index => fullRack[index]),
        fullRack, rackIndices: rackIndices.slice(), slot, springs, spinDirection, pick,
        spring: Object.assign({ key: spring }, JD.SPRINGS[spring]),
        hint: stage.hint ? Object.assign({}, stage.hint) : null,
        iron: board.iron.map(group => ({ id: group.id, alive: group.alive, segs: group.segs.map(segment => segment.slice()) })),
        warps: board.warps ? { ins: copyRecords(board.warps.ins) } : null,
        ball: launch ? launch.ball : shot ? shot.ballKey : pick.ball,
        launch: launch ? Object.assign({ elapsed: elapsed + 1 }, launch) : null,
        stageMult: board.mult,
        up: Object.assign({}, up, { rack: fullRack.slice(), springs: springs.slice() }),
        offer: offer ? offer.slice() : null,
        pegs: copyRecords(board.pegs),
        bumpers: copyRecords(board.bumpers),
        gates: copyRecords(board.gates),
        blocks: copyRecords(board.blocks),
        terrain: board.terrain.map(segment => segment.slice()),
        buckets: { x: board.buckets.x.slice(), mult: board.buckets.mult.slice() },
        balls: shot ? shot.balls.map(({ x, y, r, done, lost, bucket }) => ({ x, y, r, done, lost, bucket })) : [],
        shot: shownShot ? {
          pts: shot.pts, hits: shot.hits, golds: shot.golds, t: shot.t,
          liveMult: board.mult + shot.golds, tier: shot.tier, perfect: shot.perfect,
          ball: shot.ballKey, spring: shot.springKey, spin: shot.spin,
          cracked: shot.cracked, shattered: shot.shattered, hitstop: shot.hitstop
        } : null,
        payout: readyPayout ? Object.assign({}, readyPayout, { elapsed, pins: copyRecords(readyPayout.pins) }) : null,
        banner: banner ? Object.assign({ elapsed }, banner) : null,
        result: result ? Object.assign({}, result, { rack: result.rack.slice(), springs: result.springs.slice() }) : null
      };
    }

    startRun();
    return {
      queue(command) {
        if (command && typeof command.type === 'string') commands.push(Object.assign({}, command));
      },
      step,
      snapshot,
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
