import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACK_LENGTH, DISTANCE_PER_GOLD, UPGRADE_DEFS,
  newProfile, sanitizeProfile, cleanName, upgradeCost, buyUpgrade,
  generateTrack, newRun, changeLane, resolveEvent, stepRun,
  collectRunGold, canContinue, continueRun, settleRun,
} from '../rules.mjs';

test('profile input is bounded and names are safe plain text', () => {
  const profile = sanitizeProfile({
    name: '  별\u0000골퍼<script>엄청나게긴이름  ', gold: Infinity,
    upgrades: { pilot: 99, ball: -5 }, rankings: [{ name: '', distance: 4 }, { name: '가짜', distance: NaN }],
  });
  assert.equal([...profile.name].length, 12);
  assert.ok(!profile.name.includes('<'));
  assert.equal(profile.gold, 0);
  assert.deepEqual(profile.upgrades, { pilot: 5, ball: 0 });
  assert.deepEqual(profile.rankings, []);
  assert.equal(cleanName(null), '');
  assert.deepEqual(sanitizeProfile(null), newProfile());
});

test('upgrades charge the displayed cost and reject invalid, poor, or maxed purchases', () => {
  const profile = newProfile();
  assert.equal(upgradeCost(profile, 'pilot'), UPGRADE_DEFS.pilot.baseCost);
  assert.equal(buyUpgrade(profile, 'pilot'), false);
  profile.gold = 10000;
  const cost = upgradeCost(profile, 'ball');
  assert.equal(buyUpgrade(profile, 'ball'), true);
  assert.equal(profile.gold, 10000 - cost);
  assert.equal(profile.upgrades.ball, 1);
  assert.equal(buyUpgrade(profile, '__proto__'), false);
  profile.upgrades.ball = 5;
  assert.equal(upgradeCost(profile, 'ball'), Infinity);
  assert.equal(buyUpgrade(profile, 'ball'), false);
});

test('track events are seeded, ordered, and remain inside their track', () => {
  assert.deepEqual(generateTrack(3, 42), generateTrack(3, 42));
  assert.notDeepEqual(generateTrack(3, 42), generateTrack(3, 43));
  const events = generateTrack(3, 42);
  assert.equal(new Set(events.map(event => event.id)).size, events.length);
  for (let index = 0; index < events.length; index++) {
    assert.ok(events[index].at > 3 * TRACK_LENGTH && events[index].at < 4 * TRACK_LENGTH);
    assert.ok([-1, 0, 1].includes(events[index].lane));
    if (index) assert.ok(events[index].at > events[index - 1].at);
  }
});

test('every track has six spaced, diverse events with hazards and lucky rewards', () => {
  const hazards = new Set(['comet', 'alien', 'trap']);
  const rewards = new Set(['coins', 'boost', 'ufo', 'hole']);
  for (let seed = 0; seed < 80; seed++) {
    for (let track = 0; track < 3; track++) {
      const events = generateTrack(track, seed);
      assert.equal(events.length, 6);
      assert.equal(new Set(events.map(event => event.type)).size, 6);
      assert.ok(events.some(event => hazards.has(event.type)));
      assert.ok(events.some(event => rewards.has(event.type)));
      assert.ok(events.some(event => event.type === 'ufo' || event.type === 'hole'));
      assert.ok(events[0].at >= track * TRACK_LENGTH + 60);
      for (let index = 1; index < events.length; index++) {
        assert.ok(events[index].at - events[index - 1].at >= 47);
      }
    }
  }
});

test('lanes stay bounded and cannot move after stopping', () => {
  const run = newRun(newProfile(), 1, 1);
  assert.equal(changeLane(run, -1), true);
  assert.equal(run.lane, -1);
  assert.equal(changeLane(run, -1), false);
  changeLane(run, 1);
  changeLane(run, 1);
  assert.equal(run.lane, 1);
  assert.equal(run.targetLane, 1);
  run.phase = 'stopped';
  assert.equal(changeLane(run, -1), false);
});

test('large frame steps process every crossed collision instead of tunneling', () => {
  const profile = newProfile();
  const run = newRun(profile, 1, 12);
  run.events = [
    { id: 'test:1', at: 10, lane: 0, type: 'coins', used: false },
    { id: 'test:2', at: 20, lane: 0, type: 'trap', used: false },
    { id: 'test:3', at: 30, lane: -1, type: 'comet', used: false },
  ];
  const feedback = stepRun(run, profile, 1);
  assert.deepEqual(feedback.map(row => row.type), ['coins', 'trap']);
  assert.ok(run.events.every(event => event.used));
  assert.equal(run.bonusGold, 12);
  assert.ok(run.speed < 64);
  assert.equal(profile.gold, 0);
  assert.equal(run.earned, Math.floor(run.distance / DISTANCE_PER_GOLD) + 12);
});

test('physics and event outcomes agree across fast and slow rendering rates', () => {
  const profile = newProfile();
  const fast = newRun(profile, 0.83, 78);
  const slow = newRun(profile, 0.83, 78);
  for (let index = 0; index < 600; index++) stepRun(fast, profile, 1 / 60);
  for (let index = 0; index < 10; index++) stepRun(slow, profile, 1);
  assert.ok(Math.abs(fast.distance - slow.distance) < 0.0001);
  assert.ok(Math.abs(fast.speed - slow.speed) < 0.0001);
  assert.equal(fast.earned, slow.earned);
});

test('lucky holes and UFOs immediately jump to another track', () => {
  const profile = newProfile();
  for (const type of ['hole', 'ufo']) {
    const run = newRun(profile, 0.2, 5);
    run.distance = 88;
    const result = resolveEvent(run, { type }, profile);
    assert.equal(result.kind, 'warp');
    assert.equal(run.track, 1);
    assert.ok(run.distance >= TRACK_LENGTH);
    assert.ok(run.events.every(event => event.at > run.distance || event.used));
    assert.ok(run.speed >= 92);
  }
});

test('suit protection and ball upgrades improve actual gameplay', () => {
  const basic = newProfile();
  const improved = newProfile();
  improved.upgrades = { pilot: 5, ball: 5 };
  const basicRun = newRun(basic, 1, 77);
  const improvedRun = newRun(improved, 1, 77);
  assert.ok(improvedRun.speed > basicRun.speed);
  basicRun.speed = improvedRun.speed = 100;
  resolveEvent(basicRun, { type: 'trap' }, basic);
  resolveEvent(improvedRun, { type: 'trap' }, improved);
  assert.ok(improvedRun.speed > basicRun.speed);
});

test('one paid continuation preserves the exact stopped distance and lane', () => {
  const profile = newProfile();
  profile.gold = 12;
  const run = newRun(profile, 1, 3);
  run.phase = 'stopped';
  run.distance = 321.12345;
  run.lane = run.targetLane = -1;
  run.earned = 40;
  assert.equal(canContinue(profile, run), true);
  assert.equal(continueRun(profile, run), true);
  assert.equal(profile.gold, 12);
  assert.equal(run.distance, 321.12345);
  assert.equal(run.lane, -1);
  assert.equal(run.phase, 'rolling');
  assert.equal(run.continued, true);
  run.phase = 'stopped';
  profile.gold = 9999;
  assert.equal(canContinue(profile, run), false);
  assert.equal(continueRun(profile, run), false);
  assert.equal(profile.gold, 9999);
});

test('unaffordable continuation leaves wallet and state unchanged', () => {
  const profile = newProfile();
  const run = newRun(profile, 0, 5);
  run.phase = 'stopped';
  run.earned = 39;
  assert.equal(continueRun(profile, run), false);
  assert.equal(profile.gold, 0);
  assert.equal(run.banked, 0);
  assert.equal(run.continued, false);
});

test('gold collection and final settlement are idempotent, including after continuation', () => {
  const profile = newProfile();
  profile.name = '별골퍼';
  const run = newRun(profile, 1, 5);
  assert.equal(settleRun(profile, run), false);
  run.phase = 'stopped';
  run.earned = 80;
  assert.equal(collectRunGold(profile, run), 80);
  assert.equal(collectRunGold(profile, run), 0);
  assert.equal(continueRun(profile, run), true);
  run.phase = 'stopped';
  run.distance = 802;
  run.earned = 110;
  assert.equal(settleRun(profile, run), true);
  assert.equal(profile.gold, 70);
  assert.equal(profile.rankings.length, 1);
  assert.equal(profile.rankings[0].distance, 802);
  assert.equal(settleRun(profile, run), false);
  assert.equal(collectRunGold(profile, run), 0);
  assert.equal(profile.gold, 70);
});

test('rankings keep only each name’s best record and the top ten distances', () => {
  const rows = Array.from({ length: 15 }, (_, index) => ({ name: `골퍼${index}`, distance: index * 100 }));
  rows.push({ name: '골퍼14', distance: 100 }, { name: 'GOLFER', distance: 999 }, { name: 'golfer', distance: 1 });
  const profile = sanitizeProfile({ rankings: rows });
  assert.equal(profile.rankings.length, 10);
  assert.equal(profile.rankings[0].distance, 1400);
  assert.equal(profile.rankings.filter(row => row.name.toLowerCase() === 'golfer').length, 1);
  assert.equal(profile.rankings.find(row => row.name.toLowerCase() === 'golfer').distance, 999);
  assert.ok(profile.rankings.every(row => row.track === Math.floor(row.distance / TRACK_LENGTH) + 1));
});

test('invalid frame durations cannot move a run or create earnings', () => {
  const profile = newProfile();
  const run = newRun(profile, NaN, 1);
  for (const dt of [0, -1, NaN, Infinity]) assert.deepEqual(stepRun(run, profile, dt), []);
  assert.equal(run.distance, 0);
  assert.equal(run.earned, 0);
  stepRun(run, profile, 60);
  assert.ok(Number.isFinite(run.distance));
  assert.ok(Number.isFinite(run.speed));
});
