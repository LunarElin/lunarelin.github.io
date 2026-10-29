// Authored, seed-owned collision puzzles. The existing rules own all physics.
export const CHALLENGES = Object.freeze([
  Object.freeze({ id: 'domino', label: '도미노', objective: '링을 밀어 표적 2개', trait: 'elastic', required: 2, arenaLength: 180 }),
  Object.freeze({ id: 'cookie', label: '과자 파쇄', objective: '과자 조각으로 표적 맞히기', trait: 'spin', required: 1, arenaLength: 180 }),
  Object.freeze({ id: 'bowling', label: '우주 볼링', objective: '동물을 날려 표적 2개', trait: 'heavy', required: 2, arenaLength: 180 }),
]);

const seedValue = seed => Number.isFinite(seed) ? seed >>> 0 : 1;
export function challengeDefinition(id) {
  return CHALLENGES.find(challenge => challenge.id === id) || null;
}

export function challengeEvents(id, seed = 1) {
  const definition = challengeDefinition(id);
  if (!definition) return [];
  seed = seedValue(seed);
  // Mirroring and a small shared displacement change the approach, while each
  // formation keeps its authored spacing and readable empty entry / run-out.
  let hash = Math.imul(seed ^ 0x4f1bbcdc, 0x45d9f3b) >>> 0;
  hash = (hash ^ hash >>> 16) >>> 0;
  const mirror = hash & 1 ? 1 : -1;
  const center = id === 'bowling' ? mirror * (1.1 + (hash >>> 16 & 255) / 255 * .45)
    : (id === 'cookie' ? -mirror : mirror) * (2.8 + (hash >>> 8 & 255) / 255 * .45);
  const event = (suffix, type, at, x, role, options = {}) => ({
    id: `challenge:${id}:${suffix}`, seed, at, x,
    type, radius: type === 'beast' ? 2.6 : type === 'cookie' ? 2.25 : 1.15,
    height: type === 'beast' ? 2.3 : type === 'cookie' ? 2.1 : 1.05,
    phase: 0, direction: mirror, used: false, hits: 0, cooldown: 0,
    challengeRole: role, challengeId: id, ...options,
  });
  if (id === 'domino') return [
    event('launcher', 'bumper', 36, center, 'launcher'),
    event('target:1', 'bumper', 56, center, 'target'),
    event('target:2', 'bumper', 76, center, 'target'),
  ];
  if (id === 'cookie') return [
    event('launcher', 'cookie', 40, center, 'launcher'),
    event('target:1', 'bumper', 65, center - mirror * .8, 'target', { elevation: 2.4 }),
  ];
  return [
    event('launcher', 'beast', 56, center, 'launcher', { skin: 'hippo', encounter: true }),
    event('target:1', 'bumper', 68, center - mirror * 1.8, 'target'),
    event('target:2', 'bumper', 71, center + mirror * 1.8, 'target'),
  ];
}

export function createChallenge(id, seed = 1) {
  const definition = challengeDefinition(id);
  if (!definition) return null;
  const events = challengeEvents(id, seed);
  return {
    id, seed: seedValue(seed), required: definition.required,
    launcherId: events.find(event => event.challengeRole === 'launcher').id,
    targetIds: events.filter(event => event.challengeRole === 'target').map(event => event.id),
    hitTargetIds: [], completed: false, success: false, completedAt: null,
  };
}

export function updateChallenge(run, feedback) {
  const state = run?.challenge, definition = challengeDefinition(state?.id);
  if (!definition || state.completed || !Array.isArray(feedback)) return false;
  const events = new Map((run.events || []).map(event => [event.id, event]));
  const launcher = events.get(state.launcherId), chainId = launcher?.body?.chainId;
  if (!Number.isInteger(chainId) || chainId <= 0) return false;
  const hits = new Set(state.hitTargetIds);
  for (const impact of feedback) {
    if (impact.kind !== 'chain' || impact.chainId !== chainId || !state.targetIds.includes(impact.eventId)) continue;
    const source = events.get(impact.sourceId), target = events.get(impact.eventId);
    if (!source || source.body?.chainId !== chainId || !target || target.challengeRole !== 'target' || target.challengeId !== state.id) continue;
    if (state.id === 'cookie' && (!source.fragment || source.type !== 'cookie' || !source.id.startsWith(`${state.launcherId}:crumb:`))) continue;
    hits.add(target.id);
  }
  state.hitTargetIds = [...hits];
  if (hits.size < definition.required) return false;
  state.completed = true;
  state.success = true;
  state.completedAt = run.elapsed;
  return true;
}
