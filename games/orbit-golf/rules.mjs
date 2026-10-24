export const TRACK_LENGTH = 360;
export const DISTANCE_PER_GOLD = 8;
export const CONTINUE_COST = 40;
export const MAX_UPGRADE_LEVEL = 5;
export const TUTORIAL_DURATION = 75;
export const RUN_DURATION = 120;

export const UPGRADE_DEFS = Object.freeze({
  pilot: Object.freeze({
    label: '슈트', description: '충돌 추진 보존 +1.8% · 반발 강화', baseCost: 70, growth: 1.6, maxLevel: MAX_UPGRADE_LEVEL,
  }),
  ball: Object.freeze({
    label: '골프공', description: '타격 속도 +35% · 마찰 8% 감소', baseCost: 90, growth: 1.65, maxLevel: MAX_UPGRADE_LEVEL,
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

export const WORLD_PER_METER = Math.PI * 2 * 23 / TRACK_LENGTH;
export const BALL_RADIUS = 1.05;
export const SIDE_LIMIT = 3.05;
const FIXED_DT = 1 / 120;
const GRAVITY = 19;

export function ballStats(profileOrLevel = 0) {
  const value = typeof profileOrLevel === 'number' ? profileOrLevel : level(profileOrLevel, 'ball');
  const ballLevel = Math.floor(clamp(finite(value), 0, MAX_UPGRADE_LEVEL));
  const launchSpeed = 106 * 1.35 ** ballLevel;
  const drag = 3.4 * .92 ** ballLevel;
  return { level: ballLevel, launchSpeed, drag, range: launchSpeed ** 2 / (2 * drag), rangeGain: 1.35 ** 2 / .92 - 1 };
}

export function generateTrack(track, seed = 1) {
  track = Math.max(0, Math.floor(finite(track)));
  const random = randomFor((finite(seed, 1) ^ Math.imul(track + 1, 0x9E3779B1)) >>> 0);
  const special = random() < .28 ? (random() < .5 ? 'ufo' : 'hole') : 'coins';
  const types = ['bumper', 'alien', 'spring', 'comet', 'punch', 'trap', 'coins', 'boost', 'bumper', special];
  for (let index = types.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [types[index], types[other]] = [types[other], types[index]];
  }
  return types.map((type, index) => ({
    id: `${track}:${index}`, at: track * TRACK_LENGTH + 32 + index * 33 + random() * 8,
    x: (random() - .5) * 4.3, type,
    radius: type === 'bumper' ? 1.15 : type === 'comet' ? 1.05 : type === 'coins' ? .6 : .85,
    height: 1.05, phase: random() * Math.PI * 2,
    direction: random() < .5 ? -1 : 1, used: false, hits: 0, cooldown: 0,
  }));
}

// The renderer uses this same pose, so moving props have no separate collision lane.
export function eventX(event, elapsed = 0) {
  const base = finite(event?.x);
  if (event?.type === 'alien') return Math.sin(finite(elapsed) * 1.9 + finite(event.phase)) * 2.35;
  if (event?.type === 'punch') return clamp(base + Math.sin(finite(elapsed) * 2.8 + finite(event.phase)) * .8, -2.7, 2.7);
  return clamp(base, -2.7, 2.7);
}

function refreshEvents(run) {
  run.track = Math.max(0, Math.floor(run.s / TRACK_LENGTH));
  if (run.eventTrack === run.track) return;
  const old = new Map(run.events.map(event => [event.id, event]));
  run.events = [Math.max(0, run.track - 1), run.track, run.track + 1]
    .filter((value, index, all) => all.indexOf(value) === index)
    .flatMap(track => generateTrack(track, run.seed).map(event => old.get(event.id) ?? event));
  run.eventTrack = run.track;
}
function refreshEarnings(run) {
  run.distance = Math.min(MAX_DISTANCE, Math.max(run.distance, run.s, 0));
  run.earned = Math.floor(run.distance / DISTANCE_PER_GOLD) + run.bonusGold;
}

export function newRun(profile, power01, seed = Date.now(), aim = 8) {
  const power = clamp(finite(power01, .5), 0, 1), stats = ballStats(profile);
  const angle = clamp(finite(aim, 8), -24, 24) * Math.PI / 180;
  const velocity = stats.launchSpeed * (.57 + .43 * power);
  const run = {
    phase: 'rolling', name: cleanName(profile?.name) || '우주 골퍼',
    s: 0, distance: 0, x: 0, vx: Math.sin(angle) * velocity * WORLD_PER_METER,
    height: 0, vy: 0, speed: Math.cos(angle) * velocity, rollSpeed: velocity,
    aim: angle * 180 / Math.PI, steer: 0, spin: 0, combo: 0, collisions: 0, maxHeight: 0,
    lastImpact: -10, lastRail: -10, lastLanding: -10, accumulator: 0, restTime: 0,
    track: 0, wheel: 0, continued: false, finished: false,
    earned: 0, banked: 0, bonusGold: 0, seed: finite(seed, 1) >>> 0,
    tutorial: !profile?.tutorialComplete, elapsed: 0, trainingBonus: 0,
    durationLimit: profile?.tutorialComplete ? RUN_DURATION : TUTORIAL_DURATION,
    eventTrack: -1, events: [],
  };
  refreshEvents(run);
  return run;
}
export function steerRun(run, axis) {
  if (run?.phase !== 'rolling' || !Number.isFinite(axis)) return false;
  run.steer = clamp(axis, -1, 1);
  return true;
}
function feedbackFor(run, type, text, kind, event, strength = 1) {
  return { type, text, kind, eventId: event?.id, x: run.x, s: run.s, height: run.height, strength, combo: run.combo };
}

export function resolveEvent(run, event, profile, normal) {
  if (!run || !event || run.phase !== 'rolling' || event.used || (event.cooldown || 0) > run.elapsed) return null;
  const type = event.type, ballLevel = level(profile, 'ball'), pilotLevel = level(profile, 'pilot');
  const topSpeed = Math.max(340, ballStats(profile).launchSpeed * 1.35);
  const side = event.direction || (eventX(event, run.elapsed) < run.x ? 1 : -1);
  if (type === 'coins') {
    event.used = true;run.bonusGold += 12;refreshEarnings(run);
    return feedbackFor(run, type, '+12 골드! 우주 용돈!', 'good', event, .4);
  }
  if (type === 'ufo' || type === 'hole') {
    event.used = true;
    run.s = (Math.floor(Math.max(0, run.s) / TRACK_LENGTH) + 1) * TRACK_LENGTH + 12;
    run.wheel++;run.height = type === 'ufo' ? 2.2 : 1.2;run.vy = 4;
    run.speed = Math.max(run.rollSpeed * .8, 48);run.rollSpeed = Math.max(run.rollSpeed, run.speed);
    if (type === 'hole') run.bonusGold += 20;
    refreshEarnings(run);refreshEvents(run);
    return feedbackFor(run, type, type === 'ufo' ? '납치인 줄? 무료 택시!' : '어? 들어갔네?! 홀인원!', 'warp', event, 1.4);
  }
  if (type === 'boost') {
    event.used = true;const boost = 16 + ballLevel * 3;
    run.speed = Math.min(topSpeed, Math.max(run.speed, run.rollSpeed) + boost);
    run.rollSpeed = Math.max(run.rollSpeed, run.speed);
    run.vy = Math.max(run.vy, 2.4);
    refreshEarnings(run);
    return feedbackFor(run, type, '로켓 방귀! 슈우웅!', 'good', event, .9);
  }
  const messages = {
    bumper: '말랑 행성: 뿌잉!', spring: '스프링 택배! 발사!',
    punch: '우주 복싱! 한 방 더!', alien: '외계인: 내 도시락!!',
    comet: '혜성아, 비켜! 꽈당!', trap: '우주 젤리! 철푸덕!',
  };
  if (!messages[type]) return null;
  event.hits = (event.hits || 0) + 1;
  event.used = type !== 'bumper' || event.hits >= 2;
  event.cooldown = run.elapsed + 1.4;
  run.combo = run.elapsed - run.lastImpact < 3.2 ? run.combo + 1 : 1;
  run.lastImpact = run.elapsed;run.collisions++;
  const nx = normal?.x ?? side * .75, ns = normal?.s ?? -.66;
  let vx = run.vx, forward = run.speed * WORLD_PER_METER;
  const dot = vx * nx + forward * ns;
  const restitution = .74 + pilotLevel * .035 + ballLevel * .012;
  const transfer = 1 / (1 + ballLevel * .12);
  if (dot < 0) {vx -= (1 + restitution) * transfer * dot * nx;forward -= (1 + restitution) * transfer * dot * ns;}
  const retention = .85 + pilotLevel * .018 + ballLevel * .08;
  run.rollSpeed *= Math.min(.98, retention);
  run.speed = clamp(forward / WORLD_PER_METER, -topSpeed * .55, topSpeed);
  run.vx = clamp(vx + side * (type === 'punch' ? 7 : 2), -23, 23);
  const launch = type === 'spring' ? 11 : type === 'trap' ? 6 : type === 'punch' ? 8 : 5.5;
  run.vy = Math.max(run.vy, launch);
  if (type === 'spring' || type === 'punch') {
    run.rollSpeed = Math.min(topSpeed, run.rollSpeed + (type === 'spring' ? 8 : 5));
  }
  refreshEarnings(run);
  return feedbackFor(run, type, messages[type], type === 'comet' ? 'danger' : 'bounce', event, type === 'spring' ? 1.5 : 1.1);
}

function physicsStep(run, profile, dt, feedback) {
  const stats = ballStats(profile), grounded = run.height <= .0001 && run.vy <= 0;
  const previousS = run.s, previousX = run.x, previousHeight = run.height;
  // Angular rolling momentum remains after a hit; contact converts spin back to travel.
  run.rollSpeed = Math.max(0, run.rollSpeed - stats.drag * dt);
  if (grounded) {
    run.speed += (run.rollSpeed - run.speed) * Math.min(1, dt * 7);
    run.vx *= Math.exp(-dt * .32);
  } else run.speed *= Math.exp(-dt * .012);
  run.vx += run.steer * 6.5 * dt;
  run.vx = clamp(run.vx, -23, 23);
  run.s += run.speed * dt;
  run.x += run.vx * dt;
  run.vy -= GRAVITY * dt;
  run.height += run.vy * dt;
  if (run.height <= 0) {
    const landing = -run.vy;run.height = 0;
    if (!grounded && landing > 3.5) {
      run.vy = landing > 6 ? landing * .28 : 0;
      run.speed += (run.rollSpeed - run.speed) * .55;
      if (run.elapsed - run.lastLanding > .25) {
        feedback.push(feedbackFor(run, 'landing', landing > 9 ? '쿵! 착지 성공!' : '통통!', 'landing', null, Math.min(1, landing / 12)));
        run.lastLanding = run.elapsed;
      }
    } else run.vy = 0;
  }
  if (run.height > 7.5) {run.height = 7.5;run.vy = Math.min(0, run.vy);}
  run.maxHeight = Math.max(run.maxHeight, run.height);
  if (Math.abs(run.x) > SIDE_LIMIT) {
    const sign = Math.sign(run.x);run.x = sign * SIDE_LIMIT;run.vx = -sign * Math.abs(run.vx) * .82;
    run.rollSpeed *= .985;run.vy = Math.max(run.vy, Math.min(4, Math.abs(run.vx) * .22));
    if (run.elapsed - run.lastRail > .32 && Math.abs(run.vx) > 1) {
      run.collisions++;feedback.push(feedbackFor(run, 'rail', '쿠션 샷! 통!', 'bounce', null, Math.min(1, Math.abs(run.vx) / 12)));
      run.lastRail = run.elapsed;
    }
  }
  // Substeps cap travel below a ball diameter; segment tests also catch a glancing pass.
  for (const event of run.events) {
    if (event.used || (event.cooldown || 0) > run.elapsed) continue;
    const ds = (run.s - previousS) * WORLD_PER_METER, dx = run.x - previousX;
    const ox = eventX(event, run.elapsed), os = (event.at - previousS) * WORLD_PER_METER;
    if (Math.abs(os) > 5 + Math.abs(ds)) continue;
    const length2 = ds * ds + dx * dx;
    const t = length2 ? clamp(((ox - previousX) * dx + os * ds) / length2, 0, 1) : 0;
    const cx = previousX + dx * t, cs = previousS + (run.s - previousS) * t;
    const nx = cx - ox, ns = (cs - event.at) * WORLD_PER_METER;
    const vertical = BALL_RADIUS + previousHeight + (run.height - previousHeight) * t - finite(event.height, 1.05);
    const radius = BALL_RADIUS + finite(event.radius, .85);
    if (nx * nx + ns * ns + vertical * vertical > radius * radius) continue;
    // Pads and pickups require low contact; other props can be cleared with a high bounce.
    if (['spring', 'trap', 'boost', 'hole'].includes(event.type) && run.height > 1.1) continue;
    const length = Math.hypot(nx, ns);
    const normal = length > .001 ? { x: nx / length, s: ns / length } : { x: event.direction * .7 || .7, s: -.714 };
    const result = resolveEvent(run, event, profile, normal);
    if (result) feedback.push(result);
    if (result?.kind === 'warp') break;
  }
  if (run.s < 0) {run.s = 0;run.speed = Math.max(0, run.rollSpeed * .5);}
  run.spin += Math.hypot(run.speed * WORLD_PER_METER, run.vx) * dt / BALL_RADIUS;
  run.elapsed = Math.min(run.durationLimit, run.elapsed + dt);
  refreshEarnings(run);refreshEvents(run);
  if (run.rollSpeed < 1.4 && Math.abs(run.speed) < 2 && run.height < .12 && Math.abs(run.vx) < 1.2) run.restTime += dt;
  else run.restTime = 0;
  if (run.restTime >= .55 || run.distance >= MAX_DISTANCE) {
    run.speed = 0;run.rollSpeed = 0;run.vx = 0;run.vy = 0;run.height = 0;
    run.phase = 'stopped';run.stopReason = 'natural';
    feedback.push(feedbackFor(run, 'stop', '이번 비행 종료', 'stop'));
  }
}

export function stepRun(run, profile, dt) {
  const feedback = [];
  if (run?.phase !== 'rolling' || !Number.isFinite(dt) || dt <= 0) return feedback;
  run.accumulator += Math.min(dt, 120);
  while (run.accumulator >= FIXED_DT - 1e-9 && run.phase === 'rolling' && run.elapsed < run.durationLimit - 1e-9) {
    run.accumulator -= FIXED_DT;
    physicsStep(run, profile, Math.min(FIXED_DT, run.durationLimit - run.elapsed), feedback);
  }
  if (run.phase === 'rolling' && run.elapsed >= run.durationLimit - 1e-9) {
    run.elapsed = run.durationLimit;run.speed = 0;run.rollSpeed = 0;run.vx = 0;run.vy = 0;
    run.phase = 'stopped';run.stopReason = 'time';
    feedback.push(feedbackFor(run, 'stop', run.tutorial ? '훈련 비행 완료' : '비행 시간 종료', 'stop'));
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
  run.speed = ballStats(profile).launchSpeed * .82;
  run.rollSpeed = run.speed;run.steer = 0;run.restTime = 0;run.accumulator = 0;
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
