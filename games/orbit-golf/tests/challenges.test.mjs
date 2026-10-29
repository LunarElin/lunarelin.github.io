import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, challengeDefinition, challengeEvents, createChallenge, updateChallenge } from '../challenges.mjs';
import { newProfile, newRun, stepRun } from '../rules.mjs';

function fixture(id) {
  const events = challengeEvents(id, 42), challenge = createChallenge(id, 42);
  events.find(event => event.id === challenge.launcherId).body = { chainId: 7 };
  return { challenge, events, elapsed: 1.5 };
}
function chain(run, targetIndex = 0, sourceId = run.challenge.launcherId, chainId = 7) {
  return { kind: 'chain', eventId: run.challenge.targetIds[targetIndex], sourceId, chainId };
}

test('three authored challenges have stable, separate definitions and existing event shapes', () => {
  assert.deepEqual(CHALLENGES.map(definition => definition.id), ['domino', 'cookie', 'bowling']);
  assert.deepEqual(CHALLENGES.map(definition => definition.trait), ['elastic', 'spin', 'heavy']);
  for (const definition of CHALLENGES) {
    for (const seed of [0, 1, 29, 42, 0xffffffff]) {
      const events = challengeEvents(definition.id, seed), state = createChallenge(definition.id, seed);
      assert.deepEqual(events, challengeEvents(definition.id, seed));
      assert.equal(events.filter(event => event.challengeRole === 'launcher').length, 1);
      assert.equal(events.filter(event => event.challengeRole === 'target').length, definition.required);
      assert.equal(new Set(events.map(event => event.id)).size, events.length);
      assert.ok(events.every(event => ['bumper', 'beast', 'cookie'].includes(event.type)));
      assert.ok(events.every(event => event.at >= 30 && event.at <= 80 && Math.abs(event.x) < 7.7));
      assert.ok(events.every(event => event.radius > 0 && event.height > 0 && event.seed === seed));
      assert.ok(events.every(event => event.used === false && event.hits === 0 && event.cooldown === 0));
      assert.deepEqual(JSON.parse(JSON.stringify(state)), state, 'challenge state remains plain save-compatible data');
    }
  }
  assert.notDeepEqual(challengeEvents('domino', 1), challengeEvents('domino', 42));
  assert.equal(challengeDefinition('unknown'), null);
  assert.equal(createChallenge('unknown', 1), null);
  assert.deepEqual(challengeEvents('unknown', 1), []);
});

test('event arrays and challenge progress do not leak between attempts', () => {
  const first = challengeEvents('domino', 42), second = challengeEvents('domino', 42);
  first[0].used = true;
  assert.equal(second[0].used, false);
  const state = createChallenge('domino', 42);
  state.hitTargetIds.push(state.targetIds[0]);
  assert.deepEqual(createChallenge('domino', 42).hitTargetIds, []);
});

test('direct ball hits, unrelated chains and mismatched physical sources never clear a target', () => {
  const run = fixture('domino');
  const feedback = [
    { ...chain(run), kind: 'bounce' },
    { ...chain(run), chainId: 8 },
    { ...chain(run), sourceId: 'unrelated' },
    { ...chain(run), eventId: 'not-a-target' },
  ];
  assert.equal(updateChallenge(run, feedback), false);
  assert.deepEqual(run.challenge.hitTargetIds, []);
  run.events.find(event => event.id === run.challenge.launcherId).body.chainId = 8;
  assert.equal(updateChallenge(run, [chain(run)]), false);
  assert.equal(updateChallenge(null, feedback), false);
});

test('domino and bowling require two unique physical targets and complete exactly once', () => {
  for (const id of ['domino', 'bowling']) {
    const run = fixture(id);
    assert.equal(updateChallenge(run, [chain(run), chain(run)]), false);
    assert.equal(run.challenge.hitTargetIds.length, 1);
    // A first target can carry the original impulse into the second target.
    const target = run.events.find(event => event.id === run.challenge.targetIds[0]);
    target.body = { chainId: 7 };
    assert.equal(updateChallenge(run, [chain(run, 1, target.id)]), true);
    assert.equal(run.challenge.completed, true);
    assert.equal(run.challenge.success, true);
    assert.equal(run.challenge.completedAt, 1.5);
    assert.equal(updateChallenge(run, [chain(run, 1, target.id)]), false);
  }
});

test('cookie only counts a real fragment belonging to this launcher and its impulse chain', () => {
  const run = fixture('cookie');
  assert.equal(updateChallenge(run, [chain(run)]), false, 'intact biscuit or ball is not a fragment');
  const unrelated = { id: 'other-cookie:crumb:0', type: 'cookie', fragment: true, body: { chainId: 7 } };
  run.events.push(unrelated);
  assert.equal(updateChallenge(run, [chain(run, 0, unrelated.id)]), false);
  const crumb = { id: `${run.challenge.launcherId}:crumb:0`, type: 'cookie', fragment: true, body: { chainId: 7 } };
  run.events.push(crumb);
  assert.equal(updateChallenge(run, [chain(run, 0, crumb.id)]), true);
  assert.deepEqual(run.challenge.hitTargetIds, run.challenge.targetIds);
});

function attempt(id, level, aim, seed = 42, power = 1) {
  const profile = { ...newProfile(), tutorialComplete: true, upgrades: { ball: level, pilot: level } };
  const run = newRun(profile, power, seed, aim, { challenge: id });
  const feedback = [];
  for (let i = 0; i < 2000 && run.phase === 'rolling'; i++) feedback.push(...stepRun(run, profile, .025));
  assert.equal(run.phase, 'stopped', `${id} must finish without input`);
  return { run, feedback };
}

test('authored puzzles can be solved through real physics at base and maximum equipment', () => {
  const layouts = [
    ['domino', 1, 14], ['domino', 29, -14], ['domino', 42, 14],
    ['cookie', 1, -12], ['cookie', 29, 12], ['cookie', 42, -12],
    ['bowling', 1, 3], ['bowling', 29, -3], ['bowling', 42, 2],
  ];
  for (const [id, seed, aim] of layouts) {
    let first;
    for (const level of [0, 5]) {
      const { run, feedback } = attempt(id, level, aim, seed);
      assert.equal(run.challenge.success, true, `${id}, seed ${seed}, Lv${level}, ${aim} degrees`);
      assert.equal(run.stopReason, 'challenge-success');
      assert.equal(run.challenge.hitTargetIds.length, challengeDefinition(id).required);
      assert.equal(run.earned, 0, 'normal distance income cannot turn a missed puzzle into progress');
      assert.ok(run.elapsed >= run.challenge.completedAt + 1.09, 'leave real-time room to see the chain result');
      const actualHits = feedback.filter(event => event.kind === 'chain' && run.challenge.hitTargetIds.includes(event.eventId));
      assert.equal(new Set(actualHits.map(event => event.eventId)).size, challengeDefinition(id).required);
      if (id === 'cookie') assert.ok(actualHits.every(event => event.sourceId.startsWith(`${run.challenge.launcherId}:crumb:`)));
      if (first) assert.equal(run.challenge.completedAt, first.challenge.completedAt, 'precision mode preserves the puzzle at maximum equipment');
      else first = run;
    }
  }
});

test('a straight full shot misses every seed-42 objective instead of auto-clearing all three', () => {
  for (const id of CHALLENGES.map(definition => definition.id)) {
    for (const level of [0, 5]) {
      const { run } = attempt(id, level, 0);
      assert.equal(run.challenge.success, false, `${id}, Lv${level}`);
      assert.equal(run.challenge.completed, false);
      assert.notEqual(run.stopReason, 'challenge-success');
    }
  }
});

test('integer-angle sweeps offer both successful and unsuccessful physical approaches', () => {
  for (const id of CHALLENGES.map(definition => definition.id)) {
    const outcomes = [];
    for (let aim = -24; aim <= 24; aim++) outcomes.push(attempt(id, 0, aim).run.challenge.success);
    assert.ok(outcomes.some(Boolean), `${id} has at least one reachable shot`);
    assert.ok(outcomes.some(success => !success), `${id} requires choosing the approach`);
  }
});

