// Straight, seed-owned terrain. s is game metres; heights are world Y.
export const COURSE_WORLD_PER_METER = Math.PI * 2 * 23 / 360;
export const COURSE_SECTION_LENGTH = 360;
const DESCENT = -.052, MIN_SLOPE = -.32, MAX_SLOPE = .26;
const PROFILES = Object.freeze([
  {id:'long-descent',label:'긴 내리막',breaks:[0,.16,.32,.82,1],heights:[0,0,1,-.6,0]},
  {id:'crest',label:'큰 언덕',breaks:[0,.16,.53,.84,1],heights:[0,0,1,0,0]},
  {id:'valley',label:'깊은 골짜기',breaks:[0,.16,.53,.84,1],heights:[0,0,-1,0,0]},
  {id:'double-hill',label:'연속 언덕',breaks:[0,.16,.34,.52,.70,.86,1],heights:[0,0,.8,-.45,.65,0,0]},
  {id:'terraces',label:'계단 고원',breaks:[0,.16,.31,.53,.72,.90,1],heights:[0,0,.65,.65,-.65,-.65,0]},
  {id:'tableland',label:'넓은 고원',breaks:[0,.16,.34,.70,.88,1],heights:[0,0,.8,.8,0,0]},
  {id:'dip-ramp',label:'골짜기와 오르막',breaks:[0,.16,.42,.72,.90,1],heights:[0,0,-.8,.4,0,0]},
  {id:'long-climb',label:'완만한 고개',breaks:[0,.16,.65,.86,1],heights:[0,0,.9,.2,0]},
]);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const normalizedSeed=seed=>Number.isFinite(seed)?seed>>>0:1;
function mix(value){value=Math.imul(value^(value>>>16),0x7feb352d);value=Math.imul(value^(value>>>15),0x846ca68b);return(value^(value>>>16))>>>0;}
function randomFor(seed){let state=seed>>>0;return()=>{state=(state+0x6d2b79f5)>>>0;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return((n^(n>>>14))>>>0)/4294967296;};}
function shuffle(items,random){for(let i=items.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;}
function boundaryHeight(track,seed){return track===0?0:(mix(seed^Math.imul(track,0x9e3779b1)^0x71c3a52d)/4294967296-.5)*5;}
const smooth=t=>t*t*t*(t*(t*6-15)+10);
const smoothRate=t=>30*t*t*(t-1)*(t-1);
let cachedSeed,order=[];
const patterns=new Map();

export function coursePattern(track=0,seed=1){
  seed=normalizedSeed(seed);track=Math.max(0,Math.floor(Number.isFinite(track)?track:0));
  if(cachedSeed!==seed){cachedSeed=seed;patterns.clear();order=shuffle(PROFILES.map((_,index)=>index),randomFor(mix(seed^0x632be59b)));}
  if(patterns.has(track))return patterns.get(track);
  const bag=Math.floor(track/PROFILES.length),slot=track%PROFILES.length;
  // Distinct boundary sentinels prevent repeats without generating earlier bags.
  const first=order[bag%order.length],last=order[(bag+2)%order.length];
  const random=randomFor(mix(seed^Math.imul(bag+1,0x85ebca6b)^0xa14f2d39));
  const middle=shuffle(order.filter(index=>index!==first&&index!==last),random);
  const index=[first,...middle,last][slot],profile=PROFILES[index];
  const shapeRandom=randomFor(mix(seed^Math.imul(track+1,0xc2b2ae35)^0x28e7195b));
  const breaks=profile.breaks.map((value,i,all)=>i===0||i===all.length-1?value:value+(shapeRandom()-.5)*.035);
  if(track===0)breaks[1]=Math.max(1/6,breaks[1]);
  const anchor0=boundaryHeight(track,seed),anchor1=boundaryHeight(track+1,seed),anchorDelta=anchor1-anchor0;
  let maximum=Infinity;
  for(let i=1;i<breaks.length;i++){
    const span=breaks[i]-breaks[i-1],change=profile.heights[i]-profile.heights[i-1];
    if(change===0)continue;
    // A quintic span's maximum derivative is 1.875; solve its height budget.
    const allowed=(change>0?MAX_SLOPE-DESCENT:MIN_SLOPE-DESCENT)*span*COURSE_SECTION_LENGTH*COURSE_WORLD_PER_METER/1.875;
    maximum=Math.min(maximum,(allowed-anchorDelta*span)/change);
  }
  const amplitude=maximum*(.62+shapeRandom()*.33)*(track===0?.75:1);
  const heights=profile.heights.map((value,i)=>anchor0+anchorDelta*breaks[i]+value*amplitude);
  const pattern=Object.freeze({id:profile.id,label:profile.label,index,track,seed,length:COURSE_SECTION_LENGTH,amplitude,
    breaks:Object.freeze(breaks),heights:Object.freeze(heights)});
  patterns.set(track,pattern);if(patterns.size>128)patterns.delete(patterns.keys().next().value);
  return pattern;
}

export function courseSample(s=0,seed=1){
  s=Number.isFinite(s)?s:0;
  const forward=s*COURSE_WORLD_PER_METER,track=Math.max(0,Math.floor(s/COURSE_SECTION_LENGTH)),pattern=coursePattern(track,seed);
  let height=DESCENT*forward,slope=DESCENT;
  if(s>=0){
    const u=clamp((s-track*COURSE_SECTION_LENGTH)/COURSE_SECTION_LENGTH,0,1),points=pattern.breaks;
    let i=1;while(i<points.length-1&&u>points[i])i++;
    const span=points[i]-points[i-1],t=clamp((u-points[i-1])/span,0,1),change=pattern.heights[i]-pattern.heights[i-1];
    height+=pattern.heights[i-1]+change*smooth(t);
    slope+=change*smoothRate(t)/(span*COURSE_SECTION_LENGTH*COURSE_WORLD_PER_METER);
  }
  const scale=1/Math.sqrt(1+slope*slope),tangentY=slope*scale,tangentZ=scale;
  return{height,forward,lateral:0,slope,gravitySlope:slope,tangentX:0,tangentY,tangentZ,normalY:tangentZ,normalZ:-tangentY,pitch:Math.atan(slope),pattern};
}
