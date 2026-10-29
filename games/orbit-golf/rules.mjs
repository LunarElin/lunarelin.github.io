import { COURSE_WORLD_PER_METER, courseSample } from './course.mjs?v=20261029-chain2';
import { CHALLENGES, challengeDefinition, challengeEvents, createChallenge, updateChallenge } from './challenges.mjs?v=20261029-chain2';

export const TRACK_LENGTH = 360;
export const DISTANCE_PER_GOLD = 8;
export const CONTINUE_COST = 40;
export const MAX_UPGRADE_LEVEL = 5;
export const TUTORIAL_DURATION = 75;
export const RUN_DURATION = 120;
export const CHALLENGE_DURATION = 35;
export const CHALLENGE_REWARD = 60;

export const BALL_TRAITS = Object.freeze({
  standard: Object.freeze({id:'standard',label:'기본 공',description:'균형 잡힌 직진과 반발',challengeId:null,launch:1,mass:1,drag:1,restitution:1,steer:1}),
  heavy: Object.freeze({id:'heavy',label:'중량 공',description:'물체를 강하게 밀기 · 출발 속도와 회전 감소',challengeId:'bowling',launch:.88,mass:1.5,drag:1.12,restitution:.9,steer:.85}),
  elastic: Object.freeze({id:'elastic',label:'탄성 공',description:'벽과 바닥에서 크게 반발 · 가벼운 질량과 짧은 직진',challengeId:'domino',launch:.94,mass:.65,drag:1.08,restitution:1.25,steer:1}),
  spin: Object.freeze({id:'spin',label:'회전 공',description:'강한 스핀 조절 · 출발 속도 감소',challengeId:'cookie',launch:.92,mass:.9,drag:1.08,restitution:1,steer:1.75}),
});

export const UPGRADE_DEFS = Object.freeze({
  pilot: Object.freeze({
    label: '슈트', description: '충돌 추진 보존 +1.8% · 반발 강화', baseCost: 70, growth: 1.6, maxLevel: MAX_UPGRADE_LEVEL,
  }),
  ball: Object.freeze({
    label: '골프공', description: '단계별 타격 위력 · 마찰 감소', baseCost: 90, growth: 1.65, maxLevel: MAX_UPGRADE_LEVEL,
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
  return { version: 1, name: '', gold: 0, upgrades: { pilot: 0, ball: 0 }, rankings: [], tutorialComplete: false, challengeWins:[], ballTrait:'standard' };
}

export function availableTraits(profile) {
  return Object.keys(BALL_TRAITS).filter(id=>id==='standard'||level(profile,'ball')===MAX_UPGRADE_LEVEL&&Array.isArray(profile?.challengeWins)&&profile.challengeWins.includes(BALL_TRAITS[id].challengeId));
}
export function selectBallTrait(profile,id) {
  if(!profile||!Object.hasOwn(BALL_TRAITS,id)||!availableTraits(profile).includes(id))return false;
  profile.ballTrait=id;return true;
}
function equippedTrait(profile) {return availableTraits(profile).includes(profile?.ballTrait)?profile.ballTrait:'standard';}
function runTrait(run) {return Object.hasOwn(BALL_TRAITS,run?.trait)?BALL_TRAITS[run.trait]:BALL_TRAITS.standard;}

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
  const known=new Set(CHALLENGES.map(challenge=>challenge.id));
  profile.challengeWins=Array.isArray(raw.challengeWins)?[...new Set(raw.challengeWins.slice(0,100).filter(id=>typeof id==='string'&&known.has(id)))]:[];
  profile.ballTrait=equippedTrait({...profile,ballTrait:raw.ballTrait});
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
const AIR_DRAG = .018;
const SOLIDS = new Set(['bumper','alien','comet','punch','spring','trap','beast','giant-alien','cookie','anvil']);
const PROP_MASS = { bumper: 1.1, alien: .7, comet: 12, punch: .8, spring: .65, trap: .6, beast:2.4, 'giant-alien':1.8, cookie:2, anvil:8 };
const propMass=event=>event.fragment ? .5 : PROP_MASS[event.type]||1;
const BRAKE_RETENTION=Object.freeze({anvil:Object.freeze([.30,.40,.45,.50,.52,.52]),tar:Object.freeze([.16,.26,.30,.38,.39,.40]),trap:Object.freeze([.25,.45,.50,.57,.59,.60])});
export const COLLISION_EFFECTS = Object.freeze({
  bumper: Object.freeze({ effect:'impact', label:'탄성 반발', restitution:.88, forward:0, lift:2.5, lateral:1 }),
  spring: Object.freeze({ effect:'jump', label:'수직 도약', restitution:.65, forward:0, lift:14.5, lateral:.5 }),
  punch: Object.freeze({ effect:'propulsion', label:'전진 추진', restitution:.72, forwardImpulse:24, lift:1.5, lateral:.5 }),
  alien: Object.freeze({ effect:'spin', label:'회전 부여', restitution:.74, forward:0, lift:1.8, lateral:2.5, curve:18, duration:1.8 }),
  comet: Object.freeze({ effect:'impact', label:'강한 반사', restitution:.98, forward:0, lift:5.5, lateral:2 }),
  trap: Object.freeze({ effect:'brake', label:'마찰 감속', restitution:.25, forward:0, lift:.35, lateral:0, duration:1.6 }),
  boost: Object.freeze({ effect:'propulsion', label:'전진 가속', forward:.15, lift:0 }),
  beast: Object.freeze({ effect:'belly', label:'배 반동', restitution:.96, forwardImpulse:10, lift:11, lateral:1, duration:.9 }),
  'giant-alien': Object.freeze({ effect:'toss', label:'촉수 회전 투척', restitution:.7, forwardImpulse:5, lift:5.5, lateral:6, curve:28, duration:2.4 }),
  cookie: Object.freeze({ effect:'shatter', label:'과자 파쇄', restitution:.58, forward:0, lift:7.5, lateral:.8, duration:.9 }),
  anvil: Object.freeze({ effect:'heavy-brake', label:'중량 충격', restitution:.12, forward:0, lift:2.1, lateral:1.5, duration:1.1 }),
  tar: Object.freeze({ effect:'sticky-brake', label:'점성 제동', restitution:0, forward:0, lift:0, lateral:0, duration:2.6 }),
});

export function ballStats(profileOrLevel = 0) {
  const value = typeof profileOrLevel === 'number' ? profileOrLevel : level(profileOrLevel, 'ball');
  const ballLevel = Math.floor(clamp(finite(value), 0, MAX_UPGRADE_LEVEL));
  return statsAt(ballLevel,typeof profileOrLevel==='number'?'standard':equippedTrait(profileOrLevel));
}
function statsAt(ballLevel,traitId='standard') {
  const trait=BALL_TRAITS[traitId]||BALL_TRAITS.standard;
  const launchAt=stage=>76*1.32**stage*(stage===3?1.08:1);
  const launchSpeed=launchAt(ballLevel)*trait.launch;
  const drag = 1.8 * .72 ** ballLevel*trait.drag;
  return { level: ballLevel,trait:trait.id,launchSpeed,drag,range:launchSpeed**2/(2*drag),airDrag:AIR_DRAG*.72**ballLevel*trait.drag,rangeGain:ballLevel<MAX_UPGRADE_LEVEL?launchAt(ballLevel+1)**2/(1.8*.72**(ballLevel+1))/(launchAt(ballLevel)**2/(1.8*.72**ballLevel))-1:0 };
}
function runStats(run,profile){
  const trait=runTrait(run);
  if(run?.challenge)return {level:0,trait:trait.id,launchSpeed:84*trait.launch,drag:1.8*trait.drag,airDrag:AIR_DRAG*trait.drag};
  return statsAt(level(profile,'ball'),trait.id);
}

const GIMMICKS = Object.freeze([
  {id:'sweep',label:'이동 범퍼'}, {id:'double-spring',label:'공중 연속 도약'},
  {id:'counter-spin',label:'교차 회전'}, {id:'pinball',label:'반발 연쇄'},
  {id:'meteor-sweep',label:'횡단 혜성'}, {id:'boost-ramp',label:'가속 도약'},
  {id:'brake-gauntlet',label:'중량 제동'}, {id:'piston-bank',label:'쌍 추진 포대'},
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
    run.speed*=.76;run.rollSpeed=Math.max(0,run.speed);run.vx*=.75;run.curveSpin*=.6;run.worldVy=Math.max(run.worldVy,2);run.grounded=false;run.restTime=0;
    run.bonusGold+=40;refreshEarnings(run);
    feedback.push({...feedbackFor(run,'guardian','guardian-break',event,1.5),s:event.at-finite(event.depth,3.2)/2/WORLD_PER_METER,force,requiredForce:event.requiredForce,passed:true});
    nextGuardian(run);return;
  }
  run.s=contact;
  const contacts=run.guardianContacts||(run.guardianContacts=new Map());
  if((contacts.get(event.id)||-1)<=run.elapsed) {
    run.speed=-Math.abs(run.speed)*.35;run.rollSpeed=0;run.vx*=.5;run.curveSpin*=.35;run.worldVy=Math.max(run.worldVy,2.5);run.grounded=false;
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
    const radius=type==='anvil'?1.8:type==='tar'?2.35:type==='beast'?2.6:type==='giant-alien'?2.5:type==='cookie'?2.25:type==='bumper'?1.15:type==='comet'?1.05:type==='coins'?.6:.85;
    const event={id:`${track}:${events.length}`,seed:finite(seed,1)>>>0,at,x:clamp(x,giant?-5.7:-7.7,giant?5.7:7.7),type,radius,
      height:type==='anvil'?1.6:type==='tar'?.16:type==='beast'?2.3:type==='giant-alien'?2.4:type==='cookie'?2.1:1.05,
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
    else if(wave.id==='brake-gauntlet'){extra('trap',0,x);extra('anvil',26,-x);}
    else if(wave.id==='belly-bowling'){extra('beast',0,x);extra('bumper',17,x+sign*2.8);}
    else if(wave.id==='tentacle-sling'){extra('giant-alien',0,x,{direction:sign});extra('spring',18,-x);}
    else if(wave.id==='cookie-domino'){extra('cookie',0,x);extra('bumper',16,x+sign*2.3);}
    else{extra('punch',0,-2.5);extra('punch',8,2.5);}
    if(wave.tier>=1)extra(random()<.5?'bumper':'boost',7+random()*7,-x);
    if(wave.tier>=2)extra(random()<.5?'spring':'punch',19+random()*7,sign*3);
  }
  // Braking encounters occupy one side of the wide course and leave a clear
  // run-out. A boost directly behind a hazard would erase its consequence.
  const risks=[];
  const riskCount=track===0?1:1+(random()<.28?1:0);
  for(let index=0;index<riskCount;index++){
    const desired=base+(track===0?210+random()*65:104+random()*(config.guardian?76:130))+index*74;
    const maximum=base+(config.guardian?252:340),minimum=base+(track===0?205:90);
    const candidates=Array.from({length:Math.floor(maximum-minimum)+1},(_,offset)=>minimum+offset)
      .filter(at=>risks.every(risk=>Math.abs(risk.at-at)>54)&&!events.some(event=>event.gimmick&&['boost','punch'].includes(event.type)&&event.at>=at&&event.at-at<48))
      .sort((a,b)=>Math.abs(a-desired)-Math.abs(b-desired));
    if(!candidates.length)continue;
    const at=candidates[0];
    const type=random()<.5?'anvil':'tar',x=(random()<.5?-1:1)*(2+random()*3.5);
    risks.push(add(type,at,x,{hazard:true}));
  }
  for(const event of events)if(event.type==='trap'||event.type==='anvil')risks.push(event);
  // Keep a piston formation's actual thrust props, but relocate any piston out
  // of *all* braking run-outs. Auxiliary boost pads can simply be omitted.
  for(const event of events){
    if(event.type!=='punch'||!event.gimmick||!risks.some(risk=>event.at>=risk.at&&event.at-risk.at<48))continue;
    const candidates=Array.from({length:Math.max(1,Math.floor(event.at-base-3))},(_,offset)=>base+4+offset)
      .filter(at=>!risks.some(risk=>at>=risk.at&&at-risk.at<48)&&!events.some(other=>other!==event&&other.type==='punch'&&other.gimmick===event.gimmick&&Math.abs(other.at-at)<6))
      .sort((a,b)=>Math.abs(a-event.at)-Math.abs(b-event.at));
    if(candidates.length)event.at=candidates[0];
  }
  for(let index=events.length-1;index>=0;index--){
    const event=events[index];
    if(['boost','punch','ufo','hole'].includes(event.type)&&risks.some(risk=>event.at>=risk.at&&event.at-risk.at<48))events.splice(index,1);
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
export function eventPose(event, elapsed = 0, seed=event?.seed??1) {
  if(event?.body) {
    const b=event.body,centerY=Number.isFinite(b.worldY)?b.worldY:floorCenter(b.s,seed,finite(event.height,1.05)).y+finite(b.height);return {s:b.s,x:b.x,height:b.height,worldY:centerY,worldVy:finite(b.worldVy,finite(b.vy)),centerS:b.s,centerY,rx:b.rx,ry:b.ry,rz:b.rz};
  }
  const s=finite(event?.at),height=finite(event?.elevation),terrain=courseSample(s,seed),h=finite(event?.height,1.05)+height;
  return {s,x:idleX(event,elapsed),height,centerS:s+h*terrain.normalZ/WORLD_PER_METER,centerY:terrain.height+h*terrain.normalY,rx:0,ry:0,rz:0};
}
export function eventX(event, elapsed = 0) {
  return eventPose(event,elapsed).x;
}

function refreshEvents(run) {
  run.track = Math.max(0, Math.floor(run.s / TRACK_LENGTH));
  if(run.challenge)return;
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
  run.earned = run.challenge?0:Math.floor(run.distance / DISTANCE_PER_GOLD) + run.bonusGold;
}

function floorCenter(s,seed,radius=BALL_RADIUS){const terrain=courseSample(s,seed);return {terrain,y:terrain.height+radius/terrain.normalY};}
function publishPose(run){
  const {terrain,y}=floorCenter(run.s,run.seed);
  run.height=Math.max(0,run.worldY-y);run.vy=run.worldVy-terrain.slope*run.speed*WORLD_PER_METER;
  run.rollSpeed=Math.max(0,run.speed);run.maxHeight=Math.max(run.maxHeight||0,run.height);
}
export function placeRun(run,{s=run.s,x=run.x,height=0,vy=0}={}){
  if(!run)return run;
  run.s=finite(s,run.s);run.x=finite(x,run.x);
  const {terrain,y}=floorCenter(run.s,run.seed);
  run.worldY=y+Math.max(0,finite(height));run.worldVy=terrain.slope*run.speed*WORLD_PER_METER+finite(vy);
  run.grounded=height<=.0001&&vy<=.0001;run.exhausted=false;
  publishPose(run);run.previousS=run.s;run.previousX=run.x;run.previousWorldY=run.worldY;
  run.rotation??=[0,0,0,1];run.previousRotation=[...run.rotation];run.angularVelocity??={x:0,y:0,z:0};
  return run;
}
function integrateRotation(run,dt,terrain){
  const omega=run.angularVelocity;
  if(run.grounded){
    omega.x=(terrain.normalY*run.speed*WORLD_PER_METER-terrain.normalZ*run.worldVy)/BALL_RADIUS;
    omega.y=-terrain.normalZ*run.vx/BALL_RADIUS;omega.z=terrain.normalY*run.vx/BALL_RADIUS;
  }else {const damping=Math.exp(-dt*.03);omega.x*=damping;omega.y*=damping;omega.z*=damping;}
  const magnitude=Math.hypot(omega.x,omega.y,omega.z);if(magnitude<1e-9)return;
  const half=magnitude*dt*.5,s=Math.sin(half)/magnitude,dx=omega.x*s,dy=omega.y*s,dz=omega.z*s,dw=Math.cos(half),[x,y,z,w]=run.rotation;
  const next=[dw*x+dx*w+dy*z-dz*y,dw*y-dx*z+dy*w+dz*x,dw*z+dx*y-dy*x+dz*w,dw*w-dx*x-dy*y-dz*z],n=Math.hypot(...next);
  run.rotation=next.map(value=>value/n);
}

export function newRun(profile, power01, seed = Date.now(), aim = 8, options = {}) {
  const challenge=createChallenge(options?.challenge,seed);
  const power = clamp(finite(power01, .5), 0, 1),trait=equippedTrait(profile),stats=runStats({trait,challenge},profile);
  const angle = clamp(finite(aim, 8), -24, 24) * Math.PI / 180;
  const velocity = stats.launchSpeed * (.57 + .43 * power);
  const run = {
    phase: 'rolling', name: cleanName(profile?.name) || '우주 골퍼',trait:stats.trait,
    s: 0, distance: 0, x: 0, vx: Math.sin(angle) * velocity * WORLD_PER_METER,
    height: 0, vy: 0, speed: Math.cos(angle) * velocity, rollSpeed: Math.cos(angle) * velocity,
    aim: angle * 180 / Math.PI, steer: 0, spin: 0, curveSpin:0, slowTime:0, slowFactor:1.9, brakeTime:0, combo: 0, collisions: 0, maxHeight: 0,
    chainHits:0,maxChain:0,lastChain:-10,nextChainId:0,consumed:new Set(),
    nextGuardianLap:10,guardiansBroken:0,guardianContacts:new Map(),
    lastImpact: -10, lastRail: -10, lastLanding: -10, accumulator: 0, restTime: 0,
    track: 0, wheel: 0, continued: false, finished: false,
    earned: 0, banked: 0, bonusGold: 0, seed: finite(seed, 1) >>> 0,
    tutorial: !profile?.tutorialComplete, elapsed: 0, trainingBonus: 0,
    durationLimit: profile?.tutorialComplete ? RUN_DURATION : TUTORIAL_DURATION,
    eventTrack: -1, events: [],
  };
  if(challenge){run.challenge=challenge;run.challenge.arenaEnd=challengeDefinition(challenge.id)?.arenaLength||180;run.durationLimit=CHALLENGE_DURATION;run.tutorial=false;run.events=challengeEvents(challenge.id,run.seed);}
  placeRun(run,{s:0,x:0});refreshEvents(run);
  return run;
}
export function steerRun(run, axis) {
  if (run?.phase !== 'rolling' || !Number.isFinite(axis)) return false;
  run.steer = clamp(axis, -1, 1);
  return true;
}
function feedbackFor(run, type, kind, event, strength = 1) {
  const effect=COLLISION_EFFECTS[type],contact=event?eventPose(event,run.elapsed,run.seed):{centerS:run.s,centerY:run.worldY,x:run.x};
  return { contactS:contact.centerS,contactX:contact.x,contactY:contact.centerY,type, text:'', kind, eventId: event?.id, x: run.x, s: run.s, height: run.height, strength, combo: run.combo,
    effect:effect?.effect, effectDirection:event?.direction||Math.sign(run.vx)||1, effectDuration:effect?.duration||.6 };
}
function consumeEvent(run,event){event.used=true;if(event.id!==undefined)run.consumed.add(event.id);}
function hazardImpact(run,event,before){
  const after=Math.abs(run.speed),lostRatio=clamp(1-after/Math.max(.0001,before),0,1);
  run.hazardFeedback={type:event.type,until:run.elapsed+1.8,before,after,ratio:lostRatio};
  run.lastDecisiveImpact={type:event.type,eventId:event.id,at:run.elapsed,beforeSpeed:before,afterSpeed:after,lostRatio};
  return {...feedbackFor(run,event.type,'hazard',event,1.3),beforeSpeed:before,afterSpeed:after,lostRatio,powered:true};
}

function launchProp(run,event,velocity,chainId,depth) {
  if(event.body?.active)return event.body;
  if(run.events.filter(e=>e.body?.active&&e.body.wheel===run.wheel).length>=MAX_PROP_BODIES)return null;
  const pose=eventPose(event,run.elapsed,run.seed),direction=event.direction||1,terrain=courseSample(event.at,run.seed);
  const body={
    s:pose.centerS,x:pose.x,height:Math.max(0,pose.height),worldY:pose.centerY,worldVy:velocity.y,grounded:false,rx:-terrain.pitch,ry:pose.ry,rz:pose.rz,
    vs:velocity.s/WORLD_PER_METER,vx:velocity.x,vy:velocity.y,
    wx:direction*(4+Math.abs(velocity.s)*.1),wy:direction*2.5,wz:-direction*4,
    active:true,life:4.2,wheel:run.wheel,chainId,depth,impacts:0,contacts:{},
    previousS:pose.centerS,previousX:pose.x,previousHeight:Math.max(0,pose.height),previousWorldY:pose.centerY,previousRx:-terrain.pitch,previousRy:pose.ry,previousRz:pose.rz,
  };
  event.used=false;event.body=body;return body;
}

function breakCookie(run,event,feedback,sourceId) {
  if(event.type!=='cookie'||event.fragment||event.broken)return 0;
  const pose=eventPose(event,run.elapsed,run.seed),body=event.body;
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
    const fragment=launchProp(run,piece,value,chainId,depth);if(fragment){fragment.worldY=pose.centerY+.15+(index%2)*.15;fragment.previousWorldY=fragment.worldY;}
  }
  refreshEarnings(run);
  feedback?.push({...feedbackFor(run,'cookie','cookie-break',event,1.3),sourceId,chainId,chainDepth:depth,crumbs:pieces.length,powered:true});
  return pieces.length;
}

function advanceProps(run,dt){
 const guardian=nextGuardian(run);
 for(const event of run.events){
  const body=event.body;if(!body?.active)continue;
  if(!Number.isFinite(body.worldY)){body.worldY=floorCenter(body.s,run.seed,finite(event.height,1.05)).y+finite(body.height);body.worldVy=finite(body.vy);}
  if(body.wheel!==run.wheel){body.active=false;consumeEvent(run,event);continue;}
  body.previousS=body.s;body.previousX=body.x;body.previousHeight=body.height;body.previousWorldY=body.worldY;body.previousRx=body.rx;body.previousRy=body.ry;body.previousRz=body.rz;body.life-=dt;
  if(body.life<=0){body.active=false;consumeEvent(run,event);continue;}
  const damping=Math.exp(-dt*(body.grounded?.8:.08));body.vs*=damping;body.vx*=damping;
  body.worldVy-=GRAVITY*dt;body.s+=body.vs*dt;body.x+=body.vx*dt;body.worldY+=body.worldVy*dt+.5*GRAVITY*dt*dt;
  const r=finite(event.radius,.85),floor=floorCenter(body.s,run.seed,finite(event.height,r)),n=floor.terrain;let vz=body.vs*WORLD_PER_METER;
  if(body.worldY<floor.y){body.worldY=floor.y;const into=vz*n.normalZ+body.worldVy*n.normalY;if(into<0){const bounce=-into>2.5?.28:0;vz-=(1+bounce)*into*n.normalZ;body.worldVy-=(1+bounce)*into*n.normalY;body.vs=vz/WORLD_PER_METER;}body.grounded=Math.abs(vz*n.normalZ+body.worldVy*n.normalY)<.8;}
  else body.grounded=false;
  body.height=Math.max(0,body.worldY-floor.y);body.vy=body.worldVy;
  const limit=TRACK_WIDTH/2-r-.1;if(Math.abs(body.x)>limit){body.x=Math.sign(body.x)*limit;body.vx=-Math.sign(body.x)*Math.abs(body.vx)*.65;}
  const barrier=guardian.at-(r+finite(guardian.depth,3.2)/2)/WORLD_PER_METER;
  if(body.vs>0&&body.s>=barrier){body.s=barrier;body.vs=-Math.abs(body.vs)*.5;body.vx*=.8;}
  body.rx+=body.wx*dt;body.ry+=body.wy*dt;body.rz+=body.wz*dt;
 }
}

function sweptContact(a0,a1,b0,b1,radius){
 const q={s:(a0.s-b0.s)*WORLD_PER_METER,x:a0.x-b0.x,y:a0.y-b0.y},d={s:((a1.s-a0.s)-(b1.s-b0.s))*WORLD_PER_METER,x:(a1.x-a0.x)-(b1.x-b0.x),y:(a1.y-a0.y)-(b1.y-b0.y)};
 const length=Math.hypot(q.s,q.x,q.y),c=length*length-radius*radius,A=d.s*d.s+d.x*d.x+d.y*d.y;let t=0;
 if(c>0){if(A<1e-12)return null;const B=2*(q.s*d.s+q.x*d.x+q.y*d.y),discriminant=B*B-4*A*c;if(discriminant<0)return null;t=(-B-Math.sqrt(discriminant))/(2*A);if(t<0||t>1)return null;}
 const ns=q.s+d.s*t,nx=q.x+d.x*t,ny=q.y+d.y*t,n=Math.hypot(ns,nx,ny);
 return n>1e-8?{s:ns/n,x:nx/n,y:ny/n,t,penetration:Math.max(0,radius-length)}:{s:-Math.sign(d.s)||-1,x:0,y:0,t,penetration:radius};
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
      const pose=eventPose(target,run.elapsed,run.seed),b=target.body?.active?target.body:null;
      const previous=b?{s:b.previousS,x:b.previousX,y:b.previousWorldY}:
        {s:pose.centerS,x:idleX(target,run.elapsed-dt),y:pose.centerY};
      const normal=sweptContact(
        {s:a.previousS,x:a.previousX,y:a.previousWorldY},
        {s:a.s,x:a.x,y:a.worldY},
        previous,{s:pose.centerS,x:pose.x,y:pose.centerY},
        finite(source.radius,.85)+finite(target.radius,.85));
      if(!normal)continue;
      const bv={s:b?b.vs*WORLD_PER_METER:0,x:b?b.vx:0,y:b?b.worldVy:0};
      const av={s:a.vs*WORLD_PER_METER,x:a.vx,y:a.worldVy};
      const dot=(av.s-bv.s)*normal.s+(av.x-bv.x)*normal.x+(av.y-bv.y)*normal.y;
      if(dot>=-.15)continue;
      handled.add(pair);a.contacts[target.id]=run.elapsed+.4;if(b)b.contacts[source.id]=run.elapsed+.4;
      const canMove=Boolean(b)||(a.depth<MAX_CHAIN_DEPTH&&sources.length<MAX_PROP_BODIES);
      const ia=1/propMass(source),ib=canMove?1/propMass(target):0;
      const impulse=-(1+.68)*dot/(ia+ib);
      a.vs=(av.s+normal.s*impulse*ia)/WORLD_PER_METER;
      a.vx=clamp(av.x+normal.x*impulse*ia,-42,42);a.worldVy=av.y+normal.y*impulse*ia;a.vy=a.worldVy;a.impacts++;
      if(!canMove)continue;
      const velocity={s:bv.s-normal.s*impulse*ib,x:bv.x-normal.x*impulse*ib,y:bv.y-normal.y*impulse*ib};
      const depth=Math.min(MAX_CHAIN_DEPTH,a.depth+1);
      const body=b||launchProp(run,target,velocity,a.chainId,depth);
      if(!body)continue;
      if(b){body.vs=velocity.s/WORLD_PER_METER;body.vx=velocity.x;body.worldVy=velocity.y;body.vy=velocity.y;}
      body.contacts[source.id]=run.elapsed+.4;body.wz+=normal.x*3;
      target.cooldown=Math.max(target.cooldown||0,run.elapsed+.12);
      run.chainHits++;run.maxChain=Math.max(run.maxChain,depth);run.lastChain=run.elapsed;
      feedback.push({type:target.type,kind:'chain',text:'',eventId:target.id,sourceId:source.id,
        contactS:pose.centerS,contactX:pose.x,contactY:pose.centerY,chainDepth:depth,chainId:a.chainId,s:pose.s,x:pose.x,height:pose.height,strength:Math.min(1.4,.7+Math.abs(dot)*.02),
        effect:COLLISION_EFFECTS[target.type].effect,effectDirection:Math.sign(velocity.x)||target.direction||1,effectDuration:COLLISION_EFFECTS[target.type].duration||.6});
      if(target.type==='cookie'&&!target.fragment)breakCookie(run,target,feedback,source.id);
      if(a.impacts>=4)break;
    }
  }
}

export function resolveEvent(run, event, profile, normal) {
  if (!run || !event || run.phase !== 'rolling' || event.used || run.consumed.has(event.id) || (event.cooldown || 0) > run.elapsed) return null;
  const type = event.type, ballLevel = run.challenge?0:level(profile, 'ball'), pilotLevel = run.challenge?0:level(profile, 'pilot');
  const trait=runTrait(run),topSpeed = runStats(run,profile).launchSpeed * 1.25;
  const side = event.direction || (eventX(event, run.elapsed) < run.x ? 1 : -1);
  if (type === 'coins') {
    consumeEvent(run,event);run.bonusGold += 12;refreshEarnings(run);
    return feedbackFor(run, type, 'good', event, .4);
  }
  if (type === 'ufo' || type === 'hole') {
    consumeEvent(run,event);
    run.s = guardianDestination(run,(Math.floor(Math.max(0, run.s) / TRACK_LENGTH) + 1) * TRACK_LENGTH + 12);
    run.wheel++;placeRun(run,{s:run.s,x:run.x,height:type==='ufo'?2.2:1.2,vy:4});
    for(const prop of run.events)if(prop.body?.active){prop.body.active=false;consumeEvent(run,prop);}
    run.speed *= .9;run.rollSpeed = Math.max(0,run.speed);
    run.restTime=0;
    if (type === 'hole') run.bonusGold += 20;
    refreshEarnings(run);refreshEvents(run);
    return feedbackFor(run, type, 'warp', event, 1.4);
  }
  if (type === 'boost') {
    consumeEvent(run,event);const boost = runStats(run,profile).launchSpeed*COLLISION_EFFECTS.boost.forward;
    const powered=!(run.brakeTime>0);
    run.speed += powered?boost*clamp(1-Math.max(0,run.speed)/topSpeed,0,1):0;
    if(run.grounded)run.worldVy=courseSample(run.s,run.seed).slope*run.speed*WORLD_PER_METER;publishPose(run);
    run.restTime=0;
    refreshEarnings(run);
    return {...feedbackFor(run, type, 'good', event, .9),powered,effect:powered?'propulsion':'brake'};
  }
  if(type==='tar'){
    const before=Math.abs(run.speed),effect=COLLISION_EFFECTS.tar;
    consumeEvent(run,event);event.hits=(event.hits||0)+1;
    run.collisions++;run.combo=run.elapsed-run.lastImpact<3.2?run.combo+1:1;run.lastImpact=run.elapsed;
    run.speed*=Math.min(.4,BRAKE_RETENTION.tar[ballLevel]+pilotLevel*.004);
    run.vx*=.08;run.curveSpin*=.04;const ground=floorCenter(run.s,run.seed);run.worldY=ground.y;run.worldVy=ground.terrain.slope*run.speed*WORLD_PER_METER;run.grounded=true;publishPose(run);
    run.slowTime=effect.duration;run.slowFactor=3.4;run.brakeTime=effect.duration;
    run.rollSpeed=Math.max(0,run.speed);refreshEarnings(run);
    return hazardImpact(run,event,before);
  }
  const effect=event.fragment?{...COLLISION_EFFECTS.cookie,restitution:.7,lift:.6,lateral:.3}:COLLISION_EFFECTS[type];
  if (!effect) return null;
  const incoming={s:run.speed*WORLD_PER_METER,x:run.vx,y:run.worldVy},wasMoving=Boolean(event.body?.active);
  event.hits=(event.hits||0)+1;event.cooldown=run.elapsed+.18;
  run.combo=run.elapsed-run.lastImpact<3.2?run.combo+1:1;run.lastImpact=run.elapsed;run.collisions++;
  const n={s:normal?.s??-.8,x:normal?.x??side*.6,y:normal?.y??0},norm=Math.hypot(n.s,n.x,n.y);n.s/=norm;n.x/=norm;n.y/=norm;
  const prop={s:wasMoving?event.body.vs*WORLD_PER_METER:0,x:wasMoving?event.body.vx:0,y:wasMoving?event.body.worldVy:0};
  const dot=(incoming.s-prop.s)*n.s+(incoming.x-prop.x)*n.x+(incoming.y-prop.y)*n.y;
  const restitution=Math.min(1,Math.min(.9,effect.restitution+pilotLevel*.008)*trait.restitution),ballMass=(run.challenge?6:2+(ballLevel?8+ballLevel*12:0)+pilotLevel*.18)*trait.mass,bodyMass=propMass(event);
  const impulse=dot<0?-(1+restitution)*dot/(1/ballMass+1/bodyMass):0;
  const velocity={s:incoming.s+n.s*impulse/ballMass,x:incoming.x+n.x*impulse/ballMass,y:incoming.y+n.y*impulse/ballMass};
  const bodyVelocity={s:prop.s-n.s*impulse/bodyMass,x:prop.x-n.x*impulse/bodyMass,y:prop.y-n.y*impulse/bodyMass};
  const powered=!(run.brakeTime>0)&&(!wasMoving||type==='spring'&&!event.activated);
  if(powered&&effect.forwardImpulse)velocity.s+=(effect.forwardImpulse+(type==='punch'?ballLevel*1.2:0))*WORLD_PER_METER*clamp(1-Math.max(0,velocity.s/WORLD_PER_METER)/topSpeed,0,1);
  if(powered&&['spring','beast','giant-alien'].includes(type)){
    event.activated=true;
    const terrain=courseSample(run.s,run.seed),up=velocity.y*terrain.normalY+velocity.s*terrain.normalZ,lift=Math.max(0,effect.lift-up);
    velocity.s+=terrain.normalZ*lift;velocity.y+=terrain.normalY*lift;
  }
  if(powered&&(type==='alien'||type==='giant-alien')){run.curveSpin=side*effect.curve*trait.steer;velocity.x+=side*effect.lateral;run.angularVelocity.y+=side*effect.curve*.08;}
  if(!wasMoving&&type==='trap'){
    const retention=Math.min(.6,BRAKE_RETENTION.trap[ballLevel]+pilotLevel*.005);velocity.s*=retention;velocity.x*=.12;
    run.curveSpin*=.1;run.slowTime=effect.duration;run.slowFactor=1.9;run.brakeTime=1.2;
  }
  if(!wasMoving&&type==='anvil'){velocity.s*=Math.min(.52,BRAKE_RETENTION.anvil[ballLevel]+pilotLevel*.005);velocity.x*=.45;run.curveSpin*=.25;run.brakeTime=effect.duration;bodyVelocity.s*=.25;bodyVelocity.x*=.25;bodyVelocity.y*=.25;}
  run.speed=velocity.s/WORLD_PER_METER;run.vx=velocity.x;run.worldVy=velocity.y;
  const ground=courseSample(run.s,run.seed);run.grounded=velocity.s*ground.normalZ+velocity.y*ground.normalY<=.35&&run.height<.04;
  if(run.grounded){const along=run.speed*WORLD_PER_METER*ground.tangentZ+run.worldVy*ground.tangentY;run.speed=along*ground.tangentZ/WORLD_PER_METER;run.worldVy=along*ground.tangentY;}
  if(!wasMoving)launchProp(run,event,bodyVelocity,++run.nextChainId,1);
  else{event.body.vs=bodyVelocity.s/WORLD_PER_METER;event.body.vx=bodyVelocity.x;event.body.worldVy=bodyVelocity.y;event.body.vy=bodyVelocity.y;}
  if(Math.abs(run.speed)>=2)run.restTime=0;publishPose(run);
  refreshEarnings(run);
  if(!wasMoving&&(type==='anvil'||type==='trap'))return hazardImpact(run,event,Math.abs(incoming.s)/WORLD_PER_METER);
  if(type==='cookie'&&!event.fragment&&!event.broken){
    const crumbs=breakCookie(run,event);
    return {...feedbackFor(run,type,'cookie-break',event,1.3),crumbs,effectDirection:side,powered:true};
  }
  return {...feedbackFor(run, type, type === 'comet' ? 'danger' : 'bounce', event, type === 'spring' ? 1.5 : 1.1),effectDirection:side,powered};
}

function moveBall(run,stats,dt,feedback){
  const start=floorCenter(run.s,run.seed),terrain=start.terrain;let vz=run.speed*WORLD_PER_METER;
  if(run.grounded){
    const u=vz*Math.hypot(1,terrain.slope),sign=Math.sign(u),braking=stats.drag*WORLD_PER_METER*(run.slowTime>0?run.slowFactor||1.9:1);
    const next=u+(-GRAVITY*terrain.tangentY-sign*braking)*dt,tangentSpeed=Math.abs(u)<.005||Math.sign(next)!==sign?0:next;
    vz=tangentSpeed*terrain.tangentZ;run.worldVy=tangentSpeed*terrain.tangentY;run.vx*=Math.exp(-dt*.28);
    if(GRAVITY*terrain.normalY+tangentSpeed*tangentSpeed*(terrain.curvature||0)<-.05)run.grounded=false;
  }
  if(!run.grounded){const damping=Math.exp(-stats.airDrag*dt);vz*=damping;run.vx*=damping;run.worldVy-=GRAVITY*dt;}
  if(run.exhausted){vz=0;run.vx=0;}
  const steering=clamp(Math.abs(vz)/10,0,1)*(run.slowTime>0?.16:1)*(run.grounded?1:.2);run.curveSpin*=Math.exp(-dt*1.1);
  if(!run.exhausted){const budget=vz*vz+run.vx*run.vx;run.vx=clamp(run.vx+(run.steer*6.5*runTrait(run).steer+run.curveSpin)*steering*dt,-23,23);run.vx=clamp(run.vx,-Math.sqrt(budget),Math.sqrt(budget));vz=Math.sign(vz)*Math.sqrt(Math.max(0,budget-run.vx*run.vx));}
  run.speed=vz/WORLD_PER_METER;const oldS=run.s,oldY=run.worldY;run.s+=run.speed*dt;run.x+=run.vx*dt;const nextFloor=floorCenter(run.s,run.seed);
  if(run.grounded){const along=Math.sign(vz)*Math.hypot(vz,run.worldVy);vz=along*nextFloor.terrain.tangentZ;run.speed=vz/WORLD_PER_METER;run.worldY=nextFloor.y;run.worldVy=along*nextFloor.terrain.tangentY;}
  else{
    run.worldY+=run.worldVy*dt+.5*GRAVITY*dt*dt;
    if(run.worldY<nextFloor.y){
      let lo=0,hi=1;for(let i=0;i<10;i++){const t=(lo+hi)*.5,y=oldY+(run.worldY-oldY)*t,at=oldS+(run.s-oldS)*t;if(y>floorCenter(at,run.seed).y)lo=t;else hi=t;}
      const at=oldS+(run.s-oldS)*hi,contact=floorCenter(at,run.seed),n=contact.terrain;run.s=at;run.worldY=contact.y;
      const into=vz*n.normalZ+run.worldVy*n.normalY;
      if(into<0){const bounce=-into>4.5?Math.min(1,.45*runTrait(run).restitution):0;vz-=(1+bounce)*into*n.normalZ;run.worldVy-=(1+bounce)*into*n.normalY;
        const tangent=vz*n.tangentZ+run.worldVy*n.tangentY,normal=vz*n.normalZ+run.worldVy*n.normalY;run.grounded=normal<1.05;
        if(run.grounded){vz=tangent*n.tangentZ;run.worldVy=tangent*n.tangentY;}
        if(-into>3.5&&run.elapsed-run.lastLanding>.25){feedback.push(feedbackFor(run,'landing','landing',null,Math.min(1,-into/14)));run.lastLanding=run.elapsed;}
      }run.speed=vz/WORLD_PER_METER;
    }
  }publishPose(run);
}

function physicsStep(run,profile,dt,feedback){
  const stats=runStats(run,profile),feedbackStart=feedback.length;run.previousS=run.s;run.previousX=run.x;run.previousWorldY=run.worldY;run.previousRotation=[...run.rotation];
  run.slowTime=Math.max(0,run.slowTime-dt);run.brakeTime=Math.max(0,(run.brakeTime||0)-dt);moveBall(run,stats,dt,feedback);
  if(Math.abs(run.x)>SIDE_LIMIT){const sign=Math.sign(run.x);run.x=sign*SIDE_LIMIT;run.vx=-sign*Math.abs(run.vx)*Math.min(1,.72*runTrait(run).restitution);
    if(run.elapsed-run.lastRail>.32&&Math.abs(run.vx)>1){run.collisions++;feedback.push(feedbackFor(run,'rail','bounce',null,Math.min(1,Math.abs(run.vx)/12)));run.lastRail=run.elapsed;}}
  if(!run.challenge)collideGuardian(run,profile,feedback);advanceProps(run,dt);
  if(!run.exhausted)for(const event of run.events){
    if(event.used||(event.cooldown||0)>run.elapsed||event.body?.wheel!==undefined&&event.body.wheel!==run.wheel)continue;
    const body=event.body?.active?event.body:null,pose=eventPose(event,run.elapsed,run.seed);
    if(Math.abs((pose.centerS-run.previousS)*WORLD_PER_METER)>6+Math.abs(run.s-run.previousS)*WORLD_PER_METER+Math.abs(body?.vs||0)*dt*WORLD_PER_METER)continue;
    const previous=body?{s:body.previousS,x:body.previousX,y:body.previousWorldY}:eventPose(event,run.elapsed-dt,run.seed);
    const normal=sweptContact({s:run.previousS,x:run.previousX,y:run.previousWorldY},{s:run.s,x:run.x,y:run.worldY},body?previous:{s:previous.centerS,x:previous.x,y:previous.centerY},{s:pose.centerS,x:pose.x,y:pose.centerY},BALL_RADIUS+finite(event.radius,.85));
    if(!normal)continue;
    const approaching=(run.vx-(body?.vx||0))*normal.x+(run.speed-(body?.vs||0))*WORLD_PER_METER*normal.s+(run.worldVy-(body?.worldVy||0))*normal.y;
    if(SOLIDS.has(event.type)&&approaching>=-.1)continue;
    if(!body&&!event.airborne&&['spring','trap','boost','hole'].includes(event.type)&&run.height>1.1)continue;if(event.type==='tar'&&run.height>.55)continue;
    if(SOLIDS.has(event.type)){run.s=run.previousS+(run.s-run.previousS)*normal.t;run.x=run.previousX+(run.x-run.previousX)*normal.t;run.worldY=run.previousWorldY+(run.worldY-run.previousWorldY)*normal.t;const offset=(normal.penetration||0)+.012;run.s+=normal.s*offset/WORLD_PER_METER;run.x+=normal.x*offset;run.worldY+=normal.y*offset;}
    const result=resolveEvent(run,event,profile,normal);if(result)feedback.push(result);if(result?.kind==='warp'||result&&SOLIDS.has(event.type))break;
  }
  collideProps(run,feedback,dt);if(run.s<0){run.s=0;run.speed=Math.max(0,run.speed);}
  const floor=floorCenter(run.s,run.seed);if(run.worldY<floor.y){run.worldY=floor.y;const away=run.worldVy*floor.terrain.normalY+run.speed*WORLD_PER_METER*floor.terrain.normalZ;if(away<.35){run.grounded=true;run.worldVy=floor.terrain.slope*run.speed*WORLD_PER_METER;}}
  publishPose(run);integrateRotation(run,dt,floor.terrain);run.spin+=Math.hypot(run.speed*WORLD_PER_METER,run.vx)*dt/BALL_RADIUS;
  run.elapsed=Math.min(run.durationLimit,run.elapsed+dt);refreshEarnings(run);refreshEvents(run);
  if(run.challenge){
    const recent=feedback.slice(feedbackStart);updateChallenge(run,recent);
    const targetHit=recent.findLast(event=>event.kind==='chain'&&run.challenge.hitTargetIds.includes(event.eventId));
    if(targetHit)run.lastDecisiveImpact={...targetHit,at:run.elapsed};
    if(run.challenge.success&&run.elapsed-run.challenge.completedAt>=1.1){stopRun(run,'challenge-success',feedback);return;}
    if(!run.challenge.success&&run.s>=run.challenge.arenaEnd&&!run.events.some(event=>event.body?.active)){stopRun(run,'challenge-end',feedback);return;}
  }
  if(Math.abs(run.speed)<1.4)run.restTime+=dt;else run.restTime=0;
  if(run.restTime>=.55||run.distance>=MAX_DISTANCE){run.exhausted=true;run.speed=0;run.rollSpeed=0;run.vx=0;run.steer=0;run.curveSpin=0;}
  if(run.exhausted&&run.grounded&&(!run.challenge||!run.challenge.success&&!run.events.some(event=>event.body?.active))){stopRun(run,'natural',feedback);}
}

function stopRun(run,reason,feedback){
  run.speed=0;run.rollSpeed=0;run.vx=0;run.steer=0;run.curveSpin=0;run.worldVy=0;run.vy=0;run.slowTime=0;run.brakeTime=0;run.angularVelocity={x:0,y:0,z:0};run.phase='stopped';run.stopReason=reason;
  if(run.challenge)run.challenge.finished=true;
  feedback.push(feedbackFor(run,'stop','stop'));
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
    run.elapsed = run.durationLimit;stopRun(run,run.challenge?.success?'challenge-success':'time',feedback);
  }
  return feedback;
}

export function collectRunGold(profile, run) {
  if (!profile || !run || run.challenge) return 0;
  const amount = Math.max(0, Math.floor(run.earned) - run.banked);
  profile.gold = Math.min(MAX_GOLD, profile.gold + amount);
  run.banked += amount;
  return amount;
}

export function continueCost() {
  return CONTINUE_COST;
}

export function canContinue(profile, run) {
  return Boolean(run && !run.challenge && run.phase === 'stopped' && !run.finished && !run.continued && !run.tutorial
    && run.elapsed < run.durationLimit
    && profile.gold + Math.max(0, run.earned - run.banked) >= CONTINUE_COST);
}

export function continueRun(profile, run) {
  if (!canContinue(profile, run)) return false;
  collectRunGold(profile, run);
  profile.gold -= CONTINUE_COST;
  run.continued = true;
  run.phase = 'rolling';
  run.speed = runStats(run,profile).launchSpeed * .82;
  run.exhausted=false;run.grounded=true;run.worldVy=courseSample(run.s,run.seed).slope*run.speed*WORLD_PER_METER;run.rollSpeed = run.speed;run.steer = 0;run.curveSpin=0;run.slowTime=0;run.brakeTime=0;run.restTime = 0;run.accumulator = 0;
  return true;
}

export function settleRun(profile, run) {
  if (!profile || !run || run.finished || run.phase !== 'stopped') return false;
  if(run.challenge){
    const before=availableTraits(profile),definition=challengeDefinition(run.challenge.id),wins=Array.isArray(profile.challengeWins)?profile.challengeWins:[];
    const firstWin=Boolean(definition&&run.challenge.success&&run.stopReason==='challenge-success'&&!wins.includes(definition.id));
    if(firstWin){profile.challengeWins=[...wins,definition.id];profile.gold=Math.min(MAX_GOLD,profile.gold+CHALLENGE_REWARD);}
    run.challengeAward={firstWin,gold:firstWin?CHALLENGE_REWARD:0,unlocked:availableTraits(profile).filter(id=>!before.includes(id))};
    run.earned=run.challengeAward.gold;run.banked=run.earned;run.challenge.finished=true;run.finished=true;run.phase='ended';return true;
  }
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
