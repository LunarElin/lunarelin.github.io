import { COURSE_WORLD_PER_METER, courseSample } from './course.mjs?v=20261028-wild1';

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
    label: '골프공', description: '타격 속도 +40% · 마찰 8% 감소', baseCost: 90, growth: 1.65, maxLevel: MAX_UPGRADE_LEVEL,
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

export const WORLD_PER_METER = COURSE_WORLD_PER_METER;
export const BALL_RADIUS = 1.05;
export const TRACK_WIDTH = 20;
export const SIDE_LIMIT = TRACK_WIDTH / 2 - BALL_RADIUS - .1;
export const MAX_PROP_BODIES = 18;
export const MAX_CHAIN_DEPTH = 6;
export const MAX_GIMMICK_WAVES = 8;
export const GUARDIAN_INTERVAL = 10;
const FIXED_DT = 1 / 120;
const GRAVITY = 19;
const SOLIDS = new Set(['bumper','alien','comet','punch','spring','trap','beast','giant-alien','cookie']);
const PROP_MASS = { bumper: 1.1, alien: .7, comet: 1.4, punch: .8, spring: .65, trap: .6, beast:2.4, 'giant-alien':1.8, cookie:2 };
const propMass=event=>event.fragment ? .5 : PROP_MASS[event.type]||1;
export const COLLISION_EFFECTS = Object.freeze({
  bumper: Object.freeze({ effect:'impact', label:'탄성 반발', restitution:.88, forward:0, lift:2.5, lateral:1 }),
  spring: Object.freeze({ effect:'jump', label:'수직 도약', restitution:.65, forward:0, lift:14.5, lateral:.5 }),
  punch: Object.freeze({ effect:'propulsion', label:'전진 추진', restitution:.72, forwardImpulse:24, lift:1.5, lateral:.5 }),
  alien: Object.freeze({ effect:'spin', label:'회전 부여', restitution:.74, forward:0, lift:1.8, lateral:2.5, curve:18, duration:1.8 }),
  comet: Object.freeze({ effect:'impact', label:'강한 반사', restitution:.98, forward:0, lift:5.5, lateral:2 }),
  trap: Object.freeze({ effect:'brake', label:'마찰 감속', restitution:.25, forward:0, lift:.35, lateral:0, duration:1.6 }),
  boost: Object.freeze({ effect:'propulsion', label:'전진 가속', forward:.15, lift:0 }),
  beast: Object.freeze({ effect:'belly', label:'배 반동', restitution:.96, forwardImpulse:18, lift:11, lateral:1, duration:.9 }),
  'giant-alien': Object.freeze({ effect:'toss', label:'촉수 회전 투척', restitution:.7, forwardImpulse:12, lift:5.5, lateral:6, curve:28, duration:2.4 }),
  cookie: Object.freeze({ effect:'shatter', label:'과자 파쇄', restitution:.58, forward:0, lift:7.5, lateral:.8, duration:.9 }),
});

export function ballStats(profileOrLevel = 0) {
  const value = typeof profileOrLevel === 'number' ? profileOrLevel : level(profileOrLevel, 'ball');
  const ballLevel = Math.floor(clamp(finite(value), 0, MAX_UPGRADE_LEVEL));
  const launchSpeed = 106 * 1.4 ** ballLevel;
  const drag = 4.3 * .92 ** ballLevel;
  return { level: ballLevel, launchSpeed, drag, range: launchSpeed ** 2 / (2 * drag), rangeGain: 1.4 ** 2 / .92 - 1 };
}

const GIMMICKS = Object.freeze([
  {id:'sweep',label:'이동 범퍼'}, {id:'double-spring',label:'공중 연속 도약'},
  {id:'counter-spin',label:'교차 회전'}, {id:'pinball',label:'반발 연쇄'},
  {id:'meteor-sweep',label:'횡단 혜성'}, {id:'boost-ramp',label:'가속 도약'},
  {id:'brake-gauntlet',label:'제동·재추진'}, {id:'piston-bank',label:'쌍 추진 포대'},
  {id:'belly-bowling',label:'동물 볼링'}, {id:'tentacle-sling',label:'촉수 투척'}, {id:'cookie-domino',label:'과자 도미노'},
]);
function gimmickAt(index,seed) {
  const cycle=Math.floor(index/GIMMICKS.length),bag=[...GIMMICKS],random=randomFor((finite(seed,1)^Math.imul(cycle+1,0x5bd1e995))>>>0);
  for(let at=bag.length-1;at>0;at--){const other=Math.floor(random()*(at+1));[bag[at],bag[other]]=[bag[other],bag[at]];}
  const base=bag[index%bag.length];return{...base,label:cycle?`${base.label} ${cycle+1}형`:base.label,index,tier:cycle};
}
export function lapConfig(lap = 1, seed = 1) {
  lap=Math.floor(clamp(finite(lap,1),1,Math.ceil(MAX_DISTANCE/TRACK_LENGTH)+1));
  const total=(lap-1)+Math.floor(lap/5)*2,previous=lap===1?0:(lap-2)+Math.floor((lap-1)/5)*2;
  const wave=index=>gimmickAt(index,seed);
  return {lap,tier:Math.floor((lap-1)/5),additions:total-previous,
    newGimmicks:Array.from({length:total-previous},(_,index)=>wave(previous+index)),
    activeWaves:Array.from({length:Math.min(MAX_GIMMICK_WAVES,total)},(_,index)=>wave(Math.max(0,total-MAX_GIMMICK_WAVES)+index)),
    guardian:lap%GUARDIAN_INTERVAL===0,requiredForce:170+Math.min(130,Math.max(0,Math.floor(lap/GUARDIAN_INTERVAL)-1)*24)};
}
export function guardianPower(run, profile) {return Math.max(0,finite(run?.speed))*(1+level(profile,'ball')*.2);}
function guardianEvent(lap) {
  return {id:`guardian:${lap}`,type:'guardian',at:lap*TRACK_LENGTH-30,x:0,width:TRACK_WIDTH,depth:3.2,height:5,barrierHeight:10,radius:TRACK_WIDTH/2,
    requiredForce:170+Math.min(130,Math.max(0,lap/GUARDIAN_INTERVAL-1)*24),broken:false,used:false,hits:0,cooldown:0};
}
function nextGuardian(run) {
  let lap=run.nextGuardianLap||GUARDIAN_INTERVAL;
  while(run.consumed.has(`guardian:${lap}`))lap+=GUARDIAN_INTERVAL;
  run.nextGuardianLap=lap;
  const id=`guardian:${lap}`;
  if(run.guardianGate?.id!==id)run.guardianGate=guardianEvent(lap);
  if(run.track>=lap-2&&run.track<=lap)run.guardianGate=run.events.find(event=>event.id===id)||run.guardianGate;
  return run.guardianGate;
}
function guardianContactS(event) {return event.at-(BALL_RADIUS+finite(event.depth,3.2)/2)/WORLD_PER_METER;}
function guardianDestination(run,destination) {
  const guardian=nextGuardian(run);
  return Math.min(destination,guardianContactS(guardian)-2);
}
function collideGuardian(run,profile,feedback) {
  const event=nextGuardian(run),contact=guardianContactS(event);
  if(run.s<contact)return;
  const force=guardianPower(run,profile);
  if(force>=event.requiredForce) {
    consumeEvent(run,event);event.broken=true;run.guardiansBroken=(run.guardiansBroken||0)+1;
    run.speed*=.76;run.rollSpeed=Math.max(0,run.speed);run.vx*=.75;run.curveSpin*=.6;run.vy=Math.max(run.vy,2);run.restTime=0;
    run.bonusGold+=40;refreshEarnings(run);
    feedback.push({...feedbackFor(run,'guardian','guardian-break',event,1.5),s:event.at-finite(event.depth,3.2)/2/WORLD_PER_METER,force,requiredForce:event.requiredForce,passed:true});
    nextGuardian(run);return;
  }
  run.s=contact;
  const contacts=run.guardianContacts||(run.guardianContacts=new Map());
  if((contacts.get(event.id)||-1)<=run.elapsed) {
    run.speed=-Math.abs(run.speed)*.35;run.rollSpeed=0;run.vx*=.5;run.curveSpin*=.35;run.vy=Math.max(run.vy,2.5);
    contacts.set(event.id,run.elapsed+.65);run.collisions++;run.lastImpact=run.elapsed;
    feedback.push({...feedbackFor(run,'guardian','guardian-block',event,1.2),s:event.at-finite(event.depth,3.2)/2/WORLD_PER_METER,force,requiredForce:event.requiredForce,passed:false});
  } else run.speed=Math.min(0,run.speed);
}

function giantType(track,seed) {
  const bag=['beast','giant-alien','cookie'],random=randomFor((finite(seed,1)^Math.imul(Math.floor(track/3)+1,0x27d4eb2d))>>>0);
  for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
  return bag[track%3];
}
export function generateTrack(track, seed = 1) {
  track=Math.max(0,Math.floor(finite(track)));
  const random=randomFor((finite(seed,1)^Math.imul(track+1,0x9E3779B1))>>>0),config=lapConfig(track+1,seed),base=track*TRACK_LENGTH;
  const events=[],types=['alien','spring','comet','punch','trap','bumper'];
  const add=(type,at,x,options={})=>{
    const giant=type==='beast'||type==='giant-alien'||type==='cookie';
    const radius=type==='beast'?2.6:type==='giant-alien'?2.5:type==='cookie'?2.25:type==='bumper'?1.15:type==='comet'?1.05:type==='coins'?.6:.85;
    const event={id:`${track}:${events.length}`,at,x:clamp(x,giant?-5.7:-7.7,giant?5.7:7.7),type,radius,
      height:type==='beast'?2.3:type==='giant-alien'?2.4:type==='cookie'?2.1:1.05,
      phase:random()*Math.PI*2,direction:random()<.5?-1:1,used:false,hits:0,cooldown:0,...options};
    if(type==='beast')event.skin=options.skin||(random()<.65?'hippo':'panda');
    if(type==='giant-alien')Object.assign(event,{motion:'sweep',amplitude:2.4,frequency:.65});
    events.push(event);return event;
  };
  // Variable-length clusters leave quiet gaps before a large encounter. A run seed
  // changes count, spacing, orientation and prop roles rather than only the x jitter.
  const count=3+Math.floor(random()*(config.activeWaves.length>6?2:3)),weights=Array.from({length:count},()=>.8+random()*2.2),sum=weights.reduce((a,b)=>a+b,0);
  const end=config.guardian?225:302,first=24+random()*17;let cursor=0;
  for(let cluster=0;cluster<count;cluster++){
    const at=base+first+(end-first)*cursor/sum;cursor+=weights[cluster];
    const x=cluster===0?1.7+random()*1.4:(random()-.5)*13.5,props=2+Math.floor(random()*2),spacing=5.5+random()*4.5;
    const formation=Math.floor(random()*4),intro=track===0&&cluster<2;
    for(let index=0;index<props;index++){
      let type=intro?['bumper','spring','punch'][index]:types[Math.floor(random()*types.length)];
      if(cluster===0&&index===0)type='bumper';
      if(!intro&&cluster===count-1&&index===0)type=random()<.5?'comet':'trap';
      const spread=formation===0?index*1.3:formation===1?-index*1.3:formation===2?(index%2?2:-2):0;
      add(type,at+index*spacing,x+spread+(random()-.5)*.8);
    }
    add(random()<.45?'boost':'coins',at+props*spacing+4,(random()-.5)*12);
  }
  const giantCount=track===0?1:random()<.2?0:random()<.82?1:2;
  for(let i=0;i<giantCount;i++){
    const type=giantType(track+i,seed),at=base+(track===0?126+random()*42:82+random()*(config.guardian?80:160))+i*36;
    const x=(random()-.5)*(track===0?7.2:9);
    add(type,at,x,{encounter:true});
    // Loose satellites can be hit by the tossed animal or biscuit pieces.
    add(random()<.5?'bumper':'spring',at+13+random()*5,x+(random()<.5?-1:1)*(2.1+random()));
  }
  add('coins',base+316+random()*17,(random()-.5)*13);
  add(random()<.24?(random()<.5?'ufo':'hole'):'boost',base+340+random()*12,(random()-.5)*13);
  const wavePositions=Array.from({length:config.activeWaves.length},()=>base+38+random()*(config.guardian?170:260)).sort((a,b)=>a-b);
  for(const [index,wave]of config.activeWaves.entries()){
    const at=wavePositions[index],x=(random()-.5)*9,sign=random()<.5?-1:1;
    const extra=(type,offset,side,options={})=>add(type,at+offset,side,{gimmick:wave.id,variant:wave.tier,...options});
    if(wave.id==='sweep'){extra('bumper',0,x,{motion:'sweep',amplitude:3.8,frequency:1.4+Math.min(.7,wave.tier*.1)});extra('boost',11,x);}
    else if(wave.id==='double-spring'){extra('spring',0,x);extra('spring',20,x,{elevation:3.2,airborne:true});}
    else if(wave.id==='counter-spin'){extra('alien',0,-2.3,{direction:sign});extra('alien',8,2.3,{direction:-sign});}
    else if(wave.id==='pinball'){extra('bumper',0,-2.2);extra('bumper',7,2.2);}
    else if(wave.id==='meteor-sweep'){extra('comet',0,x,{motion:'sweep',amplitude:3.6,frequency:1.7+Math.min(.6,wave.tier*.1)});extra('boost',12,x);}
    else if(wave.id==='boost-ramp'){extra('boost',0,x);extra('spring',12,x);}
    else if(wave.id==='brake-gauntlet'){extra('trap',0,x);extra('punch',9,x);}
    else if(wave.id==='belly-bowling'){extra('beast',0,x);extra('bumper',17,x+sign*2.8);}
    else if(wave.id==='tentacle-sling'){extra('giant-alien',0,x,{direction:sign});extra('spring',18,-x);}
    else if(wave.id==='cookie-domino'){extra('cookie',0,x);extra('bumper',16,x+sign*2.3);}
    else{extra('punch',0,-2.5);extra('punch',8,2.5);}
    if(wave.tier>=1)extra(random()<.5?'bumper':'boost',7+random()*7,-x);
    if(wave.tier>=2)extra(random()<.5?'spring':'punch',19+random()*7,sign*3);
  }
  if(config.guardian){
    for(let i=events.length-1;i>=0;i--)if(events[i].at>=base+TRACK_LENGTH-100)events.splice(i,1);
    events.push(guardianEvent(config.lap));
  }
  return events.sort((a,b)=>a.at-b.at);
}

function idleX(event, elapsed = 0) {
  const base = finite(event?.x);
  if(event?.motion==='sweep')return clamp(base+Math.sin(finite(elapsed)*finite(event.frequency,1.4)+finite(event.phase))*finite(event.amplitude,3.8),-7.9,7.9);
  if (event?.type === 'alien') return clamp(base+Math.sin(finite(elapsed)*1.5+finite(event.phase))*3.2,-7.9,7.9);
  if (event?.type === 'punch') return clamp(base+Math.sin(finite(elapsed)*2.8+finite(event.phase))*.8,-7.9,7.9);
  return clamp(base,-7.9,7.9);
}

// Rendering and collisions read the same body; height is lift above the static base.
export function eventPose(event, elapsed = 0) {
  if(event?.body) {
    const b=event.body;return {s:b.s,x:b.x,height:b.height,rx:b.rx,ry:b.ry,rz:b.rz};
  }
  return {s:finite(event?.at),x:idleX(event,elapsed),height:finite(event?.elevation),rx:0,ry:0,rz:0};
}
export function eventX(event, elapsed = 0) {
  return eventPose(event,elapsed).x;
}

function refreshEvents(run) {
  run.track = Math.max(0, Math.floor(run.s / TRACK_LENGTH));
  if (run.eventTrack === run.track) return;
  const old = new Map(run.events.map(event => [event.id, event]));
  run.events = [Math.max(0, run.track - 1), run.track, run.track + 1]
    .filter((value, index, all) => all.indexOf(value) === index)
    .flatMap(track => generateTrack(track, run.seed).map(event => old.get(event.id) ?? {...event,used:run.consumed.has(event.id),broken:event.type==='guardian'&&run.consumed.has(event.id)}));
  const ids=new Set(run.events.map(event=>event.id));
  for(const event of old.values())if(event.body?.active&&event.body.wheel===run.wheel&&!ids.has(event.id))run.events.push(event);
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
    height: 0, vy: 0, speed: Math.cos(angle) * velocity, rollSpeed: Math.cos(angle) * velocity,
    aim: angle * 180 / Math.PI, steer: 0, spin: 0, curveSpin:0, slowTime:0, combo: 0, collisions: 0, maxHeight: 0,
    chainHits:0,maxChain:0,lastChain:-10,nextChainId:0,consumed:new Set(),
    nextGuardianLap:10,guardiansBroken:0,guardianContacts:new Map(),
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
function feedbackFor(run, type, kind, event, strength = 1) {
  const effect=COLLISION_EFFECTS[type];
  return { type, text:'', kind, eventId: event?.id, x: run.x, s: run.s, height: run.height, strength, combo: run.combo,
    effect:effect?.effect, effectDirection:event?.direction||Math.sign(run.vx)||1, effectDuration:effect?.duration||.6 };
}
function consumeEvent(run,event){event.used=true;if(event.id!==undefined)run.consumed.add(event.id);}

function launchProp(run,event,velocity,chainId,depth) {
  if(event.body?.active)return event.body;
  if(run.events.filter(e=>e.body?.active&&e.body.wheel===run.wheel).length>=MAX_PROP_BODIES)return null;
  const pose=eventPose(event,run.elapsed),direction=event.direction||1;
  const body={
    s:pose.s,x:pose.x,height:Math.max(0,pose.height),rx:pose.rx,ry:pose.ry,rz:pose.rz,
    vs:clamp(velocity.s/WORLD_PER_METER,-240,360),vx:clamp(velocity.x,-42,42),vy:clamp(velocity.y,0,12),
    wx:direction*(4+Math.abs(velocity.s)*.1),wy:direction*2.5,wz:-direction*4,
    active:true,life:4.2,wheel:run.wheel,chainId,depth,impacts:0,contacts:{},
    previousS:pose.s,previousX:pose.x,previousHeight:Math.max(0,pose.height),
  };
  event.used=false;event.body=body;return body;
}

function breakCookie(run,event,feedback,sourceId) {
  if(event.type!=='cookie'||event.fragment||event.broken)return 0;
  const pose=eventPose(event,run.elapsed),body=event.body;
  const velocity={s:(body?.vs||0)*WORLD_PER_METER,x:body?.vx||0};
  const chainId=body?.chainId||++run.nextChainId,depth=Math.min(MAX_CHAIN_DEPTH,(body?.depth||0)+1);
  if(body)body.active=false;
  event.broken=true;consumeEvent(run,event);run.bonusGold+=18;
  const available=MAX_PROP_BODIES-run.events.filter(item=>item.body?.active&&item.body.wheel===run.wheel).length;
  const pieces=Array.from({length:Math.min(4,available)},(_,index)=>({
    id:`${event.id}:crumb:${index}`,type:'cookie',skin:'crumb',fragment:true,broken:true,
    at:pose.s+(index%2?1:-1),x:clamp(pose.x+(index-1.5)*.38,-8.8,8.8),radius:.55,height:.55,
    elevation:pose.height+.4,phase:event.phase||0,direction:event.direction||1,used:false,hits:0,cooldown:run.elapsed+.12,
  }));
  const velocities=pieces.map((_,index)=>({s:velocity.s*.8+(index%2?1.5:-1.5),x:velocity.x*.8+(index-1.5)*1.8,y:4.8+(index%2)}));
  const budget=propMass(event)*(velocity.s**2+velocity.x**2),cost=velocities.reduce((sum,value)=>sum+.5*(value.s**2+value.x**2),0);
  const scale=Math.min(1,Math.sqrt(budget/Math.max(.00001,cost)));
  run.events=[...run.events,...pieces];
  for(const [index,piece]of pieces.entries()){
    const value=velocities[index];value.s*=scale;value.x*=scale;
    launchProp(run,piece,value,chainId,depth);
  }
  refreshEarnings(run);
  feedback?.push({...feedbackFor(run,'cookie','cookie-break',event,1.3),sourceId,chainId,chainDepth:depth,crumbs:pieces.length,powered:true});
  return pieces.length;
}

function advanceProps(run,dt) {
  const guardian=nextGuardian(run);
  for(const event of run.events) {
    const body=event.body;if(!body?.active)continue;
    if(body.wheel!==run.wheel){body.active=false;consumeEvent(run,event);continue;}
    body.previousS=body.s;body.previousX=body.x;body.previousHeight=body.height;
    body.life-=dt;
    if(body.life<=0){body.active=false;consumeEvent(run,event);continue;}
    const damping=Math.exp(-dt*(body.height<=0?.8:.2));
    body.vs*=damping;body.vx*=damping;
    body.vy-=GRAVITY*dt;
    body.s+=body.vs*dt;body.x+=body.vx*dt;body.height+=body.vy*dt;
    if(body.height<0){body.height=0;body.vy=Math.abs(body.vy)>2.5?-body.vy*.32:0;}
    if(body.height>8){body.height=8;body.vy=Math.min(0,body.vy);}
    const limit=TRACK_WIDTH/2-finite(event.radius,.85)-.1;
    if(Math.abs(body.x)>limit){body.x=Math.sign(body.x)*limit;body.vx=-Math.sign(body.x)*Math.abs(body.vx)*.7;}
    const barrier=guardian.at-(finite(event.radius,.85)+finite(guardian.depth,3.2)/2)/WORLD_PER_METER;
    if(body.vs>0&&body.s>=barrier){body.s=barrier;body.vs=-Math.abs(body.vs)*.5;body.vx*=.8;body.vy=Math.max(body.vy,1.8);}
    body.rx+=body.wx*dt;body.ry+=body.wy*dt;body.rz+=body.wz*dt;
  }
}

function sweptContact(a0,a1,b0,b1,radius) {
  const sx=(a0.s-b0.s)*WORLD_PER_METER,xx=a0.x-b0.x,yy=a0.y-b0.y;
  const ds=((a1.s-a0.s)-(b1.s-b0.s))*WORLD_PER_METER,dx=(a1.x-a0.x)-(b1.x-b0.x),dy=(a1.y-a0.y)-(b1.y-b0.y);
  const speed2=ds*ds+dx*dx+dy*dy;
  const t=speed2?clamp(-(sx*ds+xx*dx+yy*dy)/speed2,0,1):0;
  const s=sx+ds*t,x=xx+dx*t,y=yy+dy*t,length=Math.hypot(s,x,y);
  if(length>radius)return null;
  return length>.0001?{s:s/length,x:x/length,y:y/length}:{s:-1,x:0,y:0};
}

function collideProps(run,feedback,dt) {
  const sources=run.events.filter(e=>e.body?.active&&e.body.wheel===run.wheel);
  const handled=new Set();
  for(const source of sources) {
    const a=source.body;if(a.impacts>=4)continue;
    for(const target of run.events) {
      if(source===target||!SOLIDS.has(target.type)||target.used||target.body?.wheel!==undefined&&target.body.wheel!==run.wheel)continue;
      if((a.contacts[target.id]||0)>run.elapsed)continue;
      const targetS=target.body?.s??finite(target.at);
      if(Math.abs((a.s-targetS)*WORLD_PER_METER)>8+Math.abs(a.vs*WORLD_PER_METER*dt))continue;
      const pair=source.id<target.id?`${source.id}|${target.id}`:`${target.id}|${source.id}`;
      if(handled.has(pair))continue;
      const pose=eventPose(target,run.elapsed),b=target.body?.active?target.body:null;
      const previous=b?{s:b.previousS,x:b.previousX,y:b.previousHeight+finite(target.height,1.05)}:
        {s:pose.s,x:idleX(target,run.elapsed-dt),y:finite(target.height,1.05)+pose.height};
      const normal=sweptContact(
        {s:a.previousS,x:a.previousX,y:a.previousHeight+finite(source.height,1.05)},
        {s:a.s,x:a.x,y:a.height+finite(source.height,1.05)},
        previous,{s:pose.s,x:pose.x,y:pose.height+finite(target.height,1.05)},
        finite(source.radius,.85)+finite(target.radius,.85));
      if(!normal)continue;
      const bv={s:b?b.vs*WORLD_PER_METER:0,x:b?b.vx:0,y:b?b.vy:0};
      const av={s:a.vs*WORLD_PER_METER,x:a.vx,y:a.vy};
      const dot=(av.s-bv.s)*normal.s+(av.x-bv.x)*normal.x+(av.y-bv.y)*normal.y;
      if(dot>=-.15)continue;
      handled.add(pair);a.contacts[target.id]=run.elapsed+.4;if(b)b.contacts[source.id]=run.elapsed+.4;
      const canMove=Boolean(b)||(a.depth<MAX_CHAIN_DEPTH&&sources.length<MAX_PROP_BODIES);
      const ia=1/propMass(source),ib=canMove?1/propMass(target):0;
      const impulse=-(1+.68)*dot/(ia+ib);
      a.vs=(av.s+normal.s*impulse*ia)/WORLD_PER_METER;
      a.vx=clamp(av.x+normal.x*impulse*ia,-42,42);a.vy=av.y+normal.y*impulse*ia;a.impacts++;
      if(!canMove)continue;
      const velocity={s:bv.s-normal.s*impulse*ib,x:bv.x-normal.x*impulse*ib,y:Math.max(3.1,bv.y-normal.y*impulse*ib)};
      const depth=Math.min(MAX_CHAIN_DEPTH,a.depth+1);
      const body=b||launchProp(run,target,velocity,a.chainId,depth);
      if(!body)continue;
      if(b){body.vs=clamp(velocity.s/WORLD_PER_METER,-240,360);body.vx=clamp(velocity.x,-42,42);body.vy=Math.min(12,velocity.y);}
      body.contacts[source.id]=run.elapsed+.4;body.wz+=normal.x*3;
      target.cooldown=Math.max(target.cooldown||0,run.elapsed+.12);
      run.chainHits++;run.maxChain=Math.max(run.maxChain,depth);run.lastChain=run.elapsed;
      feedback.push({type:target.type,kind:'chain',text:'',eventId:target.id,sourceId:source.id,
        chainDepth:depth,chainId:a.chainId,s:pose.s,x:pose.x,height:pose.height,strength:Math.min(1.4,.7+Math.abs(dot)*.02),
        effect:COLLISION_EFFECTS[target.type].effect,effectDirection:Math.sign(velocity.x)||target.direction||1,effectDuration:COLLISION_EFFECTS[target.type].duration||.6});
      if(target.type==='cookie'&&!target.fragment)breakCookie(run,target,feedback,source.id);
      if(a.impacts>=4)break;
    }
  }
}

export function resolveEvent(run, event, profile, normal) {
  if (!run || !event || run.phase !== 'rolling' || event.used || run.consumed.has(event.id) || (event.cooldown || 0) > run.elapsed || SOLIDS.has(event.type)&&(event.hits||0)>=3) return null;
  const type = event.type, ballLevel = level(profile, 'ball'), pilotLevel = level(profile, 'pilot');
  const topSpeed = ballStats(profile).launchSpeed * 1.25;
  const side = event.direction || (eventX(event, run.elapsed) < run.x ? 1 : -1);
  if (type === 'coins') {
    consumeEvent(run,event);run.bonusGold += 12;refreshEarnings(run);
    return feedbackFor(run, type, 'good', event, .4);
  }
  if (type === 'ufo' || type === 'hole') {
    consumeEvent(run,event);
    run.s = guardianDestination(run,(Math.floor(Math.max(0, run.s) / TRACK_LENGTH) + 1) * TRACK_LENGTH + 12);
    run.wheel++;run.height = type === 'ufo' ? 2.2 : 1.2;run.vy = 4;
    for(const prop of run.events)if(prop.body?.active){prop.body.active=false;consumeEvent(run,prop);}
    run.speed *= .9;run.rollSpeed = Math.max(0,run.speed);
    run.restTime=0;
    if (type === 'hole') run.bonusGold += 20;
    refreshEarnings(run);refreshEvents(run);
    return feedbackFor(run, type, 'warp', event, 1.4);
  }
  if (type === 'boost') {
    consumeEvent(run,event);const boost = ballStats(profile).launchSpeed*COLLISION_EFFECTS.boost.forward;
    run.speed += boost*clamp(1-Math.max(0,run.speed)/topSpeed,0,1);
    run.rollSpeed = Math.max(0,run.speed);
    run.restTime=0;
    refreshEarnings(run);
    return feedbackFor(run, type, 'good', event, .9);
  }
  const effect=event.fragment?{...COLLISION_EFFECTS.cookie,restitution:.7,lift:.6,lateral:.3}:COLLISION_EFFECTS[type];
  if (!effect) return null;
  const incoming={s:run.speed*WORLD_PER_METER,x:run.vx,y:run.vy},wasMoving=Boolean(event.body?.active);
  event.hits = (event.hits || 0) + 1;
  event.cooldown = run.elapsed + .4;
  run.combo = run.elapsed - run.lastImpact < 3.2 ? run.combo + 1 : 1;
  run.lastImpact = run.elapsed;run.collisions++;
  const nx = normal?.x ?? side * .75, ns = normal?.s ?? -.66;
  let vx = run.vx, forward = run.speed * WORLD_PER_METER;
  const propVx=wasMoving?event.body.vx:0,propVs=wasMoving?event.body.vs*WORLD_PER_METER:0;
  const dot = (vx-propVx) * nx + (forward-propVs) * ns;
  const restitution = Math.min(.98,effect.restitution + pilotLevel * .012);
  const yieldRatio=type==='comet'?1:type==='bumper'?.12:type==='alien'?.18:type==='spring'?.04:type==='beast'?.08:type==='giant-alien'?.1:type==='cookie'?.03:0;
  const ballMass=1+ballLevel*2.8+pilotLevel*.08,bodyMass=propMass(event);
  const transfer = yieldRatio / ballMass;
  let bodyImpulse=0;
  if (dot < 0) {
    if(wasMoving){
      bodyImpulse=-(1+restitution)*dot/(1/ballMass+1/bodyMass);
      vx+=nx*bodyImpulse/ballMass;forward+=ns*bodyImpulse/ballMass;
    }else{vx -= (1 + restitution) * transfer * dot * nx;forward -= (1 + restitution) * transfer * dot * ns;}
  }
  if(!wasMoving){
    // A passive collision can redirect existing travel, but never refill a hidden motor.
    const retention=Math.min(.99,.85+pilotLevel*.018+ballLevel*.12);
    const limit=Math.hypot(incoming.s,incoming.x)*retention;
    vx+=(side*effect.lateral);
    const scale=Math.min(1,limit/Math.max(.00001,Math.hypot(forward,vx)));
    forward*=scale;vx*=scale;
  }
  run.speed = forward / WORLD_PER_METER;
  run.vx = clamp(vx, -23, 23);
  run.vy = Math.max(run.vy, wasMoving?Math.min(3,Math.abs(dot)*.12):effect.lift);
  if(!wasMoving&&effect.forwardImpulse){
    const gain=(effect.forwardImpulse+ballLevel*3)*clamp(1-Math.max(0,run.speed)/topSpeed,0,1);
    run.speed+=gain;
  }
  if(!wasMoving&&(type==='alien'||type==='giant-alien'))run.curveSpin=side*effect.curve;
  if(!wasMoving&&type==='trap'){
    run.speed*=Math.min(.85,.25+ballLevel*.16+pilotLevel*.01);run.vx*=.12;run.curveSpin*=.1;run.slowTime=effect.duration;
  }
  run.rollSpeed=Math.max(0,run.speed);
  if(Math.abs(run.speed)>=2)run.restTime=0;
  if(!wasMoving) {
    const chainId=++run.nextChainId;
    const velocity={s:Math.abs(incoming.s)*.82*-ns,x:incoming.x*.55-nx*Math.max(2,Math.abs(incoming.s)*.55),y:4.2};
    const removed=Math.max(0,incoming.s**2+incoming.x**2-(run.speed*WORLD_PER_METER)**2-run.vx**2);
    const available=Math.sqrt(ballMass*removed/bodyMass),scale=Math.min(1,available/Math.max(.00001,Math.hypot(velocity.s,velocity.x)));
    velocity.s*=scale;velocity.x*=scale;
    launchProp(run,event,velocity,chainId,1);
  } else {
    event.body.vs=(propVs-ns*bodyImpulse/bodyMass)*.98/WORLD_PER_METER;
    event.body.vx=(propVx-nx*bodyImpulse/bodyMass)*.98;event.body.vy=Math.max(0,event.body.vy*.78);
  }
  refreshEarnings(run);
  if(type==='cookie'&&!event.fragment&&!event.broken){
    const crumbs=breakCookie(run,event);
    return {...feedbackFor(run,type,'cookie-break',event,1.3),crumbs,effectDirection:side,powered:true};
  }
  return {...feedbackFor(run, type, type === 'comet' ? 'danger' : 'bounce', event, type === 'spring' ? 1.5 : 1.1),effectDirection:side,powered:!wasMoving};
}

function physicsStep(run, profile, dt, feedback) {
  const stats=ballStats(profile),terrain=courseSample(run.s,run.seed),grounded=run.height<=.0001&&run.vy<=0;
  const previousS = run.s, previousX = run.x, previousHeight = run.height;
  // speed is the actual signed travel velocity. rollSpeed mirrors positive travel
  // for the existing HUD/steering contract; it never restores lost velocity.
  run.slowTime=Math.max(0,run.slowTime-dt);
  if (grounded) {
    if(Math.abs(run.speed)>.05){
      const sign=Math.sign(run.speed),slope=terrain.gravitySlope??terrain.slope;
      const acceleration=-14*slope-sign*stats.drag*(run.slowTime>0?1.9:1);
      const next=run.speed+acceleration*dt;
      run.speed=Math.sign(next)===sign?next:0;
    }else run.speed=0;
    run.vx *= Math.exp(-dt * .32);
  } else run.speed *= Math.exp(-dt * .012);
  run.rollSpeed=Math.max(0,run.speed);
  const steeringEnergy=clamp(run.rollSpeed/24,0,1);
  run.curveSpin*=Math.exp(-dt*1.1);
  run.vx += (run.steer*6.5+run.curveSpin)*steeringEnergy*dt;
  if(steeringEnergy<.15)run.vx*=Math.exp(-dt*3*(1-steeringEnergy));
  run.vx = clamp(run.vx, -23, 23);
  run.s += run.speed * dt;
  run.x += run.vx * dt;
  run.vy-=GRAVITY*dt;
  run.height += run.vy * dt;
  if (run.height <= 0) {
    const landing = -run.vy;run.height = 0;
    if (!grounded && landing > 3.5) {
      run.vy = landing > 6 ? landing * .28 : 0;
      run.speed *= .98;
      if (run.elapsed - run.lastLanding > .25) {
        feedback.push(feedbackFor(run, 'landing', 'landing', null, Math.min(1, landing / 12)));
        run.lastLanding = run.elapsed;
      }
    } else run.vy = 0;
  }
  if (run.height > 7.5) {run.height = 7.5;run.vy = Math.min(0, run.vy);}
  run.maxHeight = Math.max(run.maxHeight, run.height);
  if (Math.abs(run.x) > SIDE_LIMIT) {
    const sign = Math.sign(run.x);run.x = sign * SIDE_LIMIT;run.vx = -sign * Math.abs(run.vx) * .82;
    run.speed *= .985;run.vy = Math.max(run.vy, Math.min(4, Math.abs(run.vx) * .22));
    if (run.elapsed - run.lastRail > .32 && Math.abs(run.vx) > 1) {
      run.collisions++;feedback.push(feedbackFor(run, 'rail', 'bounce', null, Math.min(1, Math.abs(run.vx) / 12)));
      run.lastRail = run.elapsed;
    }
  }
  // A guardian is a fixed full-width plane; unlike props it never loses collision
  // because of an event cooldown, airborne height, side position or hit count.
  collideGuardian(run,profile,feedback);
  advanceProps(run,dt);
  // Substeps cap travel below a ball diameter; segment tests also catch a glancing pass.
  for (const event of run.events) {
    if (event.used || (event.cooldown || 0) > run.elapsed || event.body?.wheel!==undefined&&event.body.wheel!==run.wheel) continue;
    const body=event.body?.active?event.body:null,eventS=event.body?.s??finite(event.at);
    if(Math.abs((eventS-previousS)*WORLD_PER_METER)>6+Math.abs((run.s-previousS)*WORLD_PER_METER)+Math.abs(body?.vs||0)*dt*WORLD_PER_METER)continue;
    const pose=eventPose(event,run.elapsed);
    const normal=sweptContact(
      {s:previousS,x:previousX,y:BALL_RADIUS+previousHeight},
      {s:run.s,x:run.x,y:BALL_RADIUS+run.height},
      body?{s:body.previousS,x:body.previousX,y:finite(event.height,1.05)+body.previousHeight}:
        {s:pose.s,x:idleX(event,run.elapsed-dt),y:finite(event.height,1.05)+pose.height},
      {s:pose.s,x:pose.x,y:finite(event.height,1.05)+pose.height},BALL_RADIUS+finite(event.radius,.85));
    if(!normal)continue;
    const approaching=(run.vx-(body?.vx||0))*normal.x+(run.speed-(body?.vs||0))*WORLD_PER_METER*normal.s+(run.vy-(body?.vy||0))*normal.y;
    if(SOLIDS.has(event.type)&&approaching>=-.1)continue;
    // Pads and pickups require low contact; other props can be cleared with a high bounce.
    if (!body&&!event.airborne&&['spring', 'trap', 'boost', 'hole'].includes(event.type) && run.height > 1.1) continue;
    const result = resolveEvent(run, event, profile, normal);
    if (result) feedback.push(result);
    if (result?.kind === 'warp') break;
  }
  collideProps(run,feedback,dt);
  if (run.s < 0) {run.s = 0;run.speed = Math.max(0,run.speed);}
  run.rollSpeed=Math.max(0,run.speed);
  run.spin += Math.hypot(run.speed * WORLD_PER_METER, run.vx) * dt / BALL_RADIUS;
  run.elapsed = Math.min(run.durationLimit, run.elapsed + dt);
  refreshEarnings(run);refreshEvents(run);
  if (Math.abs(run.speed) < 1.4) run.restTime += dt;
  else run.restTime = 0;
  if (run.restTime >= .55 || run.distance >= MAX_DISTANCE) {
    run.speed = 0;run.rollSpeed = 0;run.vx = 0;run.vy = 0;run.height = 0;run.steer=0;run.curveSpin=0;run.slowTime=0;
    run.phase = 'stopped';run.stopReason = 'natural';
    feedback.push(feedbackFor(run, 'stop', 'stop'));
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
    run.elapsed = run.durationLimit;run.speed = 0;run.rollSpeed = 0;run.vx = 0;run.vy = 0;run.steer=0;run.curveSpin=0;run.slowTime=0;
    run.phase = 'stopped';run.stopReason = 'time';
    feedback.push(feedbackFor(run, 'stop', 'stop'));
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
  run.rollSpeed = run.speed;run.steer = 0;run.curveSpin=0;run.slowTime=0;run.restTime = 0;run.accumulator = 0;
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
