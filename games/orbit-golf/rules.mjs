export const TRACK_LENGTH = 360;
export const DISTANCE_PER_GOLD = 8;
export const CONTINUE_COST = 40;
export const MAX_UPGRADE_LEVEL = 5;
export const TUTORIAL_DURATION = 75;
export const RUN_DURATION = 120;

export const UPGRADE_DEFS = Object.freeze({
  pilot: Object.freeze({
    label: '슈트', description: '장애물 감속 8% 감소', baseCost: 70, growth: 1.6, maxLevel: MAX_UPGRADE_LEVEL,
  }),
  ball: Object.freeze({
    label: '골프공', description: '출발 속도 +7 · 마찰 감소', baseCost: 90, growth: 1.65, maxLevel: MAX_UPGRADE_LEVEL,
  }),
});

const MAX_GOLD = 1_000_000_000;
const MAX_DISTANCE = 100_000_000;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const level = (profile, key) => Math.floor(clamp(finite(profile?.upgrades?.[key]), 0, MAX_UPGRADE_LEVEL));

export function cleanName(value) {
  if (typeof value !== 'string') return '';
  return [...value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim().replace(/\s+/g, ' ')].slice(0, 12).join('');
}

export function newProfile() {
  return { version: 1, name: '', gold: 0, upgrades: { pilot: 0, ball: 0 }, rankings: [], tutorialComplete: false };
}

function rankRows(rows) {
  const best = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const name = cleanName(row.name);
    const distance = Math.floor(clamp(finite(row.distance, -1), -1, MAX_DISTANCE));
    if (!name || distance < 0) continue;
    const date = typeof row.date === 'string' && Number.isFinite(Date.parse(row.date))
      ? new Date(row.date).toISOString() : '1970-01-01T00:00:00.000Z';
    const record = { name, distance, track: Math.floor(distance / TRACK_LENGTH) + 1, date };
    const key = name.toLowerCase();
    if (!best.has(key) || distance > best.get(key).distance) best.set(key, record);
  }
  return [...best.values()].sort((a, b) => b.distance - a.distance || a.date.localeCompare(b.date)).slice(0, 10);
}

export function sanitizeProfile(raw) {
  const profile = newProfile();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return profile;
  profile.name = cleanName(raw.name);
  profile.gold = Math.floor(clamp(finite(raw.gold), 0, MAX_GOLD));
  profile.upgrades.pilot = level(raw, 'pilot');
  profile.upgrades.ball = level(raw, 'ball');
  profile.rankings = rankRows(Array.isArray(raw.rankings) ? raw.rankings.slice(0, 200) : []);
  profile.tutorialComplete = raw.tutorialComplete === true;
  return profile;
}

export function upgradeCost(profile, key) {
  const def = Object.hasOwn(UPGRADE_DEFS, key) ? UPGRADE_DEFS[key] : null;
  if (!def || level(profile, key) >= def.maxLevel) return Infinity;
  return Math.round(def.baseCost * def.growth ** level(profile, key));
}

export function buyUpgrade(profile, key) {
  const cost = upgradeCost(profile, key);
  if (!Number.isFinite(cost) || finite(profile?.gold) < cost) return false;
  profile.gold -= cost;
  profile.upgrades[key] = level(profile, key) + 1;
  return true;
}

function randomFor(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function generateTrack(track, seed = 1) {
  track = Math.max(0, Math.floor(finite(track)));
  const random = randomFor((finite(seed, 1) ^ Math.imul(track + 1, 0x9E3779B1)) >>> 0);
  const special = random() < 0.25 ? (random() < 0.5 ? 'ufo' : 'hole') : 'coins';
  const types = ['comet', 'alien', 'trap', 'coins', 'boost', special];
  for (let index = types.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [types[index], types[other]] = [types[other], types[index]];
  }
  return types.map((type, index) => ({
    id: `${track}:${index}`,
    at: track * TRACK_LENGTH + 60 + index * 55 + Math.floor(random() * 9),
    lane: Math.floor(random() * 3) - 1,
    type,
    used: false,
  }));
}

function refreshEvents(run) {
  run.track = Math.floor(run.distance / TRACK_LENGTH);
  if (run.eventTrack === run.track) return;
  const old = new Map(run.events.map(event => [event.id, event]));
  run.events = [run.track, run.track + 1].flatMap(track => generateTrack(track, run.seed).map(event => old.get(event.id) ?? event));
  for (const event of run.events) if (event.at < run.distance - 0.00001) event.used = true;
  run.eventTrack = run.track;
}

function refreshEarnings(run) {
  run.earned = Math.floor(run.distance / DISTANCE_PER_GOLD) + run.bonusGold;
}

export function newRun(profile, power01, seed = Date.now()) {
  const power = clamp(finite(power01, 0.5), 0, 1);
  const run = {
    phase: 'rolling', name: cleanName(profile?.name) || '우주 골퍼',
    distance: 0, speed: 48 + power * 62 + level(profile, 'ball') * 7,
    lane: 0, targetLane: 0, track: 0, wheel: 0, continued: false, finished: false,
    earned: 0, banked: 0, bonusGold: 0, seed: finite(seed, 1) >>> 0,
    tutorial: !profile?.tutorialComplete, elapsed: 0, trainingBonus: 0,
    durationLimit: profile?.tutorialComplete ? RUN_DURATION : TUTORIAL_DURATION,
    eventTrack: -1, events: [],
  };
  refreshEvents(run);
  return run;
}

export function changeLane(run, delta) {
  if (run?.phase !== 'rolling' || !Number.isFinite(delta)) return false;
  const target = clamp(run.lane + Math.sign(delta), -1, 1);
  if (target === run.lane) return false;
  run.lane = target;
  run.targetLane = target;
  return true;
}

export function resolveEvent(run, event, profile) {
  if (!run || !event || run.phase !== 'rolling') return null;
  const protection = 1 - level(profile, 'pilot') * 0.08;
  const damage = (fraction, flat = 0) => {
    run.speed = Math.max(0, run.speed - (run.speed * fraction + flat) * protection);
  };
  let feedback;
  switch (event.type) {
    case 'comet':
      damage(0.3, 4);
      feedback = { text: '혜성 충돌!', kind: 'danger', type: 'comet' };
      break;
    case 'alien':
      damage(0.23, 3);
      feedback = { text: '우주인 방해!', kind: 'danger', type: 'alien' };
      break;
    case 'trap':
      damage(0.42, 5);
      feedback = { text: '중력 함정!', kind: 'danger', type: 'trap' };
      break;
    case 'boost':
      run.speed = Math.min(185, run.speed + 34);
      feedback = { text: '초가속!', kind: 'good', type: 'boost' };
      break;
    case 'coins':
      run.bonusGold += 12;
      feedback = { text: '+12 골드', kind: 'good', type: 'coins' };
      break;
    case 'ufo':
      run.distance = (Math.floor(run.distance / TRACK_LENGTH) + 1) * TRACK_LENGTH + 18;
      run.wheel += 1;
      run.speed = Math.max(run.speed, 65);
      feedback = { text: '우주선 워프!', kind: 'warp', type: 'ufo' };
      break;
    case 'hole':
      run.distance = (Math.floor(run.distance / TRACK_LENGTH) + 1) * TRACK_LENGTH + 12;
      run.wheel += 1;
      run.speed = Math.max(run.speed, 65);
      run.bonusGold += 20;
      feedback = { text: '홀인원! 다음 궤도', kind: 'warp', type: 'hole' };
      break;
    default:
      return null;
  }
  refreshEarnings(run);
  refreshEvents(run);
  return feedback;
}

export function stepRun(run, profile, dt) {
  const feedback = [];
  if (run?.phase !== 'rolling' || !Number.isFinite(dt) || dt <= 0) return feedback;
  let remaining = Math.min(dt, 60, Math.max(0, run.durationLimit - run.elapsed));
  const drag = 3.15 - level(profile, 'ball') * 0.16;
  refreshEvents(run);
  // Solve the time of each crossed event so slow frames cannot skip collisions.
  while (remaining > 0.000001 && run.phase === 'rolling') {
    const duration = Math.min(remaining, run.speed / drag);
    const travel = Math.max(0, run.speed * duration - 0.5 * drag * duration * duration);
    const event = run.events.find(candidate => !candidate.used && candidate.at >= run.distance - 0.00001);
    const gap = event ? Math.max(0, event.at - run.distance) : Infinity;
    if (event && gap <= travel + 0.00001) {
      const elapsed = gap === 0 ? 0 : 2 * gap / (run.speed + Math.sqrt(Math.max(0, run.speed * run.speed - 2 * drag * gap)));
      run.distance = event.at;
      run.speed = Math.max(0, run.speed - drag * elapsed);
      remaining = Math.max(0, remaining - elapsed);
      run.elapsed += elapsed;
      event.used = true;
      if (event.lane === run.lane) {
        const result = resolveEvent(run, event, profile);
        if (result) feedback.push(result);
      }
    } else {
      run.distance += travel;
      run.speed = Math.max(0, run.speed - drag * duration);
      remaining = Math.max(0, remaining - duration);
      run.elapsed += duration;
    }
    refreshEvents(run);
    refreshEarnings(run);
    if (run.speed < 0.00001 || run.distance >= MAX_DISTANCE) {
      run.speed = 0;
      run.phase = 'stopped';
      run.stopReason = 'natural';
      feedback.push({ text: '이번 비행 종료', kind: 'stop', type: 'stop' });
    }
  }
  if (run.phase === 'rolling' && run.elapsed >= run.durationLimit - 0.000001) {
    run.elapsed = run.durationLimit;
    run.speed = 0;
    run.phase = 'stopped';
    run.stopReason = 'time';
    feedback.push({ text: run.tutorial ? '훈련 비행 완료' : '비행 시간 종료', kind: 'stop', type: 'stop' });
  }
  return feedback;
}

export function collectRunGold(profile, run) {
  if (!profile || !run) return 0;
  const amount = Math.max(0, Math.floor(run.earned) - run.banked);
  profile.gold = Math.min(MAX_GOLD, profile.gold + amount);
  run.banked += amount;
  return amount;
}

export function continueCost() {
  return CONTINUE_COST;
}

export function canContinue(profile, run) {
  return Boolean(run && run.phase === 'stopped' && !run.finished && !run.continued && !run.tutorial
    && run.elapsed < run.durationLimit
    && profile.gold + Math.max(0, run.earned - run.banked) >= CONTINUE_COST);
}

export function continueRun(profile, run) {
  if (!canContinue(profile, run)) return false;
  collectRunGold(profile, run);
  profile.gold -= CONTINUE_COST;
  run.continued = true;
  run.phase = 'rolling';
  run.speed = 86 + level(profile, 'ball') * 7;
  return true;
}

export function settleRun(profile, run) {
  if (!profile || !run || run.finished || run.phase !== 'stopped') return false;
  if (run.distance <= 0) {
    run.finished = true;
    run.phase = 'ended';
    return true;
  }
  if (run.tutorial && !profile.tutorialComplete && run.distance > 0 && run.elapsed > 0
    && (run.stopReason === 'natural' || run.stopReason === 'time')) {
    run.trainingBonus = Math.max(80, 90 - run.earned);
    run.bonusGold += run.trainingBonus;
    run.earned += run.trainingBonus;
    profile.tutorialComplete = true;
  }
  collectRunGold(profile, run);
  profile.rankings = rankRows([...profile.rankings, {
    name: run.name, distance: run.distance, date: new Date().toISOString(),
  }]);
  run.finished = true;
  run.phase = 'ended';
  return true;
}
