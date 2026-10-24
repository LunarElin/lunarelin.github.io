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
export const TRACK_WIDTH = 20;
export const SIDE_LIMIT = TRACK_WIDTH / 2 - BALL_RADIUS - .1;
export const MAX_PROP_BODIES = 18;
export const MAX_CHAIN_DEPTH = 6;
const FIXED_DT = 1 / 120;
const GRAVITY = 19;
const SOLIDS = new Set(['bumper','alien','comet','punch','spring','trap']);
const PROP_MASS = { bumper: 1.1, alien: .7, comet: 1.4, punch: .8, spring: .65, trap: .6 };

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
  const types = ['alien', 'spring', 'comet', 'punch', 'trap', 'bumper'];
  for (let index = types.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [types[index], types[other]] = [types[other], types[index]];
  }
  const events=[];
  const add=(type,at,x)=>events.push({
    id:`${track}:${events.length}`,at,x:clamp(x,-7.7,7.7),type,
    radius:type==='bumper'?1.15:type==='comet'?1.05:type==='coins'?.6:.85,
    height:1.05,phase:random()*Math.PI*2,direction:random()<.5?-1:1,
    used:false,hits:0,cooldown:0,
  });
  // Small bowling clusters create genuine prop-to-prop collisions across a wide floor.
  for(let cluster=0;cluster<5;cluster++) {
    const at=track*TRACK_LENGTH+30+cluster*64+random()*4;
    const x=cluster===0?1.9+random()*.7:(random()-.5)*14;
    for(let index=0;index<3;index++) {
      const type=cluster===0&&index===0?'bumper':types[(cluster*3+index)%types.length];
      add(type,at+index*7.5,x+(random()-.5)*(index?2.1:.4));
    }
    add(cluster%2?'boost':'coins',at+27,x+(random()-.5)*5);
  }
  add('coins',track*TRACK_LENGTH+337,(random()-.5)*14);
  add(special,track*TRACK_LENGTH+350,(random()-.5)*14);
  return events.sort((a,b)=>a.at-b.at);
}

function idleX(event, elapsed = 0) {
  const base = finite(event?.x);
  if (event?.type === 'alien') return clamp(base+Math.sin(finite(elapsed)*1.5+finite(event.phase))*3.2,-7.9,7.9);
  if (event?.type === 'punch') return clamp(base+Math.sin(finite(elapsed)*2.8+finite(event.phase))*.8,-7.9,7.9);
  return clamp(base,-7.9,7.9);
}

// Rendering and collisions read the same body; height is lift above the static base.
export function eventPose(event, elapsed = 0) {
  if(event?.body) {
    const b=event.body;return {s:b.s,x:b.x,height:b.height,rx:b.rx,ry:b.ry,rz:b.rz};
  }
  return {s:finite(event?.at),x:idleX(event,elapsed),height:0,rx:0,ry:0,rz:0};
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
    .flatMap(track => generateTrack(track, run.seed).map(event => old.get(event.id) ?? {...event,used:run.consumed.has(event.id)}));
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
    height: 0, vy: 0, speed: Math.cos(angle) * velocity, rollSpeed: velocity,
    aim: angle * 180 / Math.PI, steer: 0, spin: 0, combo: 0, collisions: 0, maxHeight: 0,
    chainHits:0,maxChain:0,lastChain:-10,nextChainId:0,consumed:new Set(),
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

function advanceProps(run,dt) {
  for(const event of run.events) {
    const body=event.body;if(!body?.active)continue;
    if(body.wheel!==run.wheel){body.active=false;consumeEvent(run,event);continue;}
    body.previousS=body.s;body.previousX=body.x;body.previousHeight=body.height;
    body.life-=dt;
    if(body.life<=0){body.active=false;consumeEvent(run,event);continue;}
    const damping=Math.exp(-dt*(body.height<=0?.8:.2));
    body.vs*=damping;body.vx*=damping;body.vy-=GRAVITY*dt;
    body.s+=body.vs*dt;body.x+=body.vx*dt;body.height+=body.vy*dt;
    if(body.height<0){body.height=0;body.vy=Math.abs(body.vy)>2.5?-body.vy*.32:0;}
    if(body.height>8){body.height=8;body.vy=Math.min(0,body.vy);}
    const limit=TRACK_WIDTH/2-finite(event.radius,.85)-.1;
    if(Math.abs(body.x)>limit){body.x=Math.sign(body.x)*limit;body.vx=-Math.sign(body.x)*Math.abs(body.vx)*.7;}
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
      const pair=source.id<target.id?`${source.id}|${target.id}`:`${target.id}|${source.id}`;
      if(handled.has(pair)||(a.contacts[target.id]||0)>run.elapsed)continue;
      const targetS=target.body?.s??finite(target.at);
      if(Math.abs((a.s-targetS)*WORLD_PER_METER)>8+Math.abs(a.vs*WORLD_PER_METER*dt))continue;
      const pose=eventPose(target,run.elapsed),b=target.body?.active?target.body:null;
      const previous=b?{s:b.previousS,x:b.previousX,y:b.previousHeight+finite(target.height,1.05)}:
        {s:pose.s,x:idleX(target,run.elapsed-dt),y:finite(target.height,1.05)};
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
      const ia=1/(PROP_MASS[source.type]||1),ib=canMove?1/(PROP_MASS[target.type]||1):0;
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
      const words={alien:'외계인: 왜 나까지?!',comet:'혜성 볼링! 꽈당!',bumper:'말랑 행성 도미노!',punch:'주먹이 주먹을! 퍽!',spring:'스프링 대이동! 뿅!',trap:'젤리 배달 사고!'};
      feedback.push({type:target.type,kind:'chain',text:`${depth}연쇄! ${words[target.type]}`,eventId:target.id,sourceId:source.id,
        chainDepth:depth,chainId:a.chainId,s:pose.s,x:pose.x,height:pose.height,strength:Math.min(1.4,.7+Math.abs(dot)*.02)});
      if(a.impacts>=4)break;
    }
  }
}

export function resolveEvent(run, event, profile, normal) {
  if (!run || !event || run.phase !== 'rolling' || event.used || run.consumed.has(event.id) || (event.cooldown || 0) > run.elapsed || SOLIDS.has(event.type)&&(event.hits||0)>=3) return null;
  const type = event.type, ballLevel = level(profile, 'ball'), pilotLevel = level(profile, 'pilot');
  const topSpeed = Math.max(340, ballStats(profile).launchSpeed * 1.35);
  const side = event.direction || (eventX(event, run.elapsed) < run.x ? 1 : -1);
  if (type === 'coins') {
    consumeEvent(run,event);run.bonusGold += 12;refreshEarnings(run);
    return feedbackFor(run, type, '+12 골드! 우주 용돈!', 'good', event, .4);
  }
  if (type === 'ufo' || type === 'hole') {
    consumeEvent(run,event);
    run.s = (Math.floor(Math.max(0, run.s) / TRACK_LENGTH) + 1) * TRACK_LENGTH + 12;
    run.wheel++;run.height = type === 'ufo' ? 2.2 : 1.2;run.vy = 4;
    for(const prop of run.events)if(prop.body?.active){prop.body.active=false;consumeEvent(run,prop);}
    run.speed = Math.max(run.rollSpeed * .8, 48);run.rollSpeed = Math.max(run.rollSpeed, run.speed);
    if (type === 'hole') run.bonusGold += 20;
    refreshEarnings(run);refreshEvents(run);
    return feedbackFor(run, type, type === 'ufo' ? '납치인 줄? 무료 택시!' : '어? 들어갔네?! 홀인원!', 'warp', event, 1.4);
  }
  if (type === 'boost') {
    consumeEvent(run,event);const boost = 16 + ballLevel * 3;
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
  const incoming={s:run.speed*WORLD_PER_METER,x:run.vx,y:run.vy},wasMoving=Boolean(event.body?.active);
  event.hits = (event.hits || 0) + 1;
  event.cooldown = run.elapsed + .4;
  run.combo = run.elapsed - run.lastImpact < 3.2 ? run.combo + 1 : 1;
  run.lastImpact = run.elapsed;run.collisions++;
  const nx = normal?.x ?? side * .75, ns = normal?.s ?? -.66;
  let vx = run.vx, forward = run.speed * WORLD_PER_METER;
  const propVx=wasMoving?event.body.vx:0,propVs=wasMoving?event.body.vs*WORLD_PER_METER:0;
  const dot = (vx-propVx) * nx + (forward-propVs) * ns;
  const restitution = .74 + pilotLevel * .035 + ballLevel * .012;
  const transfer = 1 / (1 + ballLevel * .12);
  if (dot < 0) {vx -= (1 + restitution) * transfer * dot * nx;forward -= (1 + restitution) * transfer * dot * ns;}
  const retention = .85 + pilotLevel * .018 + ballLevel * .08 + (wasMoving?.08:0);
  run.rollSpeed *= Math.min(.98, retention);
  run.speed = clamp(forward / WORLD_PER_METER, -topSpeed * .55, topSpeed);
  run.vx = clamp(vx + side * (type === 'punch' ? 7 : 2), -23, 23);
  const launch = type === 'spring' ? 11 : type === 'trap' ? 6 : type === 'punch' ? 8 : 5.5;
  run.vy = Math.max(run.vy, launch);
  if (type === 'spring' || type === 'punch') {
    run.rollSpeed = Math.min(topSpeed, run.rollSpeed + (type === 'spring' ? 8 : 5));
  }
  if(!wasMoving) {
    const chainId=++run.nextChainId;
    launchProp(run,event,{s:Math.max(5,Math.abs(incoming.s)*.82)*-ns,x:incoming.x*.55-nx*Math.max(5,Math.abs(incoming.s)*.55),y:4.2},chainId,1);
  } else {
    event.body.vs=clamp(event.body.vs+(-ns)*Math.max(4,Math.abs(incoming.s)*.35)/WORLD_PER_METER,-240,360);
    event.body.vx=clamp(event.body.vx-nx*5,-42,42);event.body.vy=Math.max(event.body.vy,4);
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
        {s:pose.s,x:idleX(event,run.elapsed-dt),y:finite(event.height,1.05)},
      {s:pose.s,x:pose.x,y:finite(event.height,1.05)+pose.height},BALL_RADIUS+finite(event.radius,.85));
    if(!normal)continue;
    const approaching=(run.vx-(body?.vx||0))*normal.x+(run.speed-(body?.vs||0))*WORLD_PER_METER*normal.s+(run.vy-(body?.vy||0))*normal.y;
    if(SOLIDS.has(event.type)&&approaching>=-.1)continue;
    // Pads and pickups require low contact; other props can be cleared with a high bounce.
    if (!body&&['spring', 'trap', 'boost', 'hole'].includes(event.type) && run.height > 1.1) continue;
    const result = resolveEvent(run, event, profile, normal);
    if (result) feedback.push(result);
    if (result?.kind === 'warp') break;
  }
  collideProps(run,feedback,dt);
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
