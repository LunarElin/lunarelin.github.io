// Straight, seed-owned terrain. s is game metres; Y and Z are world units.
export const COURSE_WORLD_PER_METER = Math.PI * 2 * 23 / 360;
export const COURSE_SECTION_LENGTH = 360;
export const COURSE_PHRASE_LENGTH = COURSE_SECTION_LENGTH * 3;
const DESCENT = -.012, MIN_SLOPE = -.36, MAX_SLOPE = .34, MAX_SECOND_DERIVATIVE = .0075;
// A phrase spans three event sections. Long arcs keep tall hills from becoming
// short vertical-looking walls, and give a grounded ball time to roll uphill.
const PROFILES = Object.freeze([
  {id:'long-descent',label:'넓은 내리막 능선',breaks:[0,.08,.36,.76,1],heights:[0,0,.7,-.5,0]},
  {id:'crest',label:'높은 산등성이',breaks:[0,.08,.51,1],heights:[0,0,1,0]},
  {id:'valley',label:'깊은 골짜기',breaks:[0,.08,.51,1],heights:[0,0,-1,0]},
  {id:'double-hill',label:'이어지는 두 고개',breaks:[0,.08,.35,.65,1],heights:[0,0,.7,-.7,0]},
  {id:'terraces',label:'완만한 높은 고원',breaks:[0,.08,.36,.72,1],heights:[0,0,1,1,0]},
  {id:'tableland',label:'하늘 고원',breaks:[0,.08,.40,.67,1],heights:[0,0,.85,.85,0]},
  {id:'dip-ramp',label:'골짜기 뒤 긴 오름',breaks:[0,.08,.39,.72,1],heights:[0,0,-.6,.8,0]},
  {id:'long-climb',label:'긴 오르막',breaks:[0,.08,.70,1],heights:[0,0,1,0]},
]);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const normalizedSeed=seed=>Number.isFinite(seed)?seed>>>0:1;
function mix(value){value=Math.imul(value^(value>>>16),0x7feb352d);value=Math.imul(value^(value>>>15),0x846ca68b);return(value^(value>>>16))>>>0;}
function randomFor(seed){let state=seed>>>0;return()=>{state=(state+0x6d2b79f5)>>>0;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return((n^(n>>>14))>>>0)/4294967296;};}
function shuffle(items,random){for(let i=items.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;}
function boundaryHeight(phrase,seed){return phrase===0?0:(mix(seed^Math.imul(phrase,0x9e3779b1)^0x71c3a52d)/4294967296-.5)*6;}
const smooth=t=>t*t*t*(t*(t*6-15)+10);
const smoothRate=t=>30*t*t*(t-1)*(t-1);
const smoothAcceleration=t=>60*t*(2*t*t-3*t+1);
let cachedSeed,order=[];
const phrases=new Map(),patterns=new Map();
function phraseAt(phrase,seed){
  if(cachedSeed!==seed){cachedSeed=seed;phrases.clear();patterns.clear();order=shuffle(PROFILES.map((_,index)=>index),randomFor(mix(seed^0x632be59b)));}
  if(phrases.has(phrase))return phrases.get(phrase);
  const bag=Math.floor(phrase/PROFILES.length),slot=phrase%PROFILES.length;
  const first=order[bag%order.length],last=order[(bag+2)%order.length];
  const random=randomFor(mix(seed^Math.imul(bag+1,0x85ebca6b)^0xa14f2d39));
  const middle=shuffle(order.filter(index=>index!==first&&index!==last),random);
  const index=[first,...middle,last][slot],profile=PROFILES[index];
  const shapeRandom=randomFor(mix(seed^Math.imul(phrase+1,0xc2b2ae35)^0x28e7195b));
  const breaks=profile.breaks.map((value,i,all)=>i===0||i===all.length-1?value:value+(shapeRandom()-.5)*.025);
  const anchor0=boundaryHeight(phrase,seed),anchor1=boundaryHeight(phrase+1,seed),anchorDelta=anchor1-anchor0;
  let maximum=Infinity;
  for(let i=1;i<breaks.length;i++){
    const span=breaks[i]-breaks[i-1],change=profile.heights[i]-profile.heights[i-1];
    if(change===0)continue;
    const length=span*COURSE_PHRASE_LENGTH*COURSE_WORLD_PER_METER;
    const slopeBudget=(change>0?MAX_SLOPE-DESCENT:MIN_SLOPE-DESCENT)*length/1.875;
    const curvatureBudget=Math.sign(change)*MAX_SECOND_DERIVATIVE*length*length/(10/Math.sqrt(3));
    maximum=Math.min(maximum,(slopeBudget-anchorDelta*span)/change,(curvatureBudget-anchorDelta*span)/change);
  }
  const broadArc=profile.id==='crest'||profile.id==='valley';
  const desired=broadArc?25+shapeRandom()*4:20+shapeRandom()*7;
  const amplitude=Math.min(desired,maximum*(.90+shapeRandom()*.06));
  const heights=profile.heights.map((value,i)=>anchor0+anchorDelta*breaks[i]+value*amplitude);
  const extrema=heights.map((height,i)=>({u:breaks[i],height:height+DESCENT*breaks[i]*COURSE_PHRASE_LENGTH*COURSE_WORLD_PER_METER}));
  for(let i=1;i<breaks.length;i++){
    const span=breaks[i]-breaks[i-1],change=heights[i]-heights[i-1],length=span*COURSE_PHRASE_LENGTH*COURSE_WORLD_PER_METER;
    const derivativeTarget=-DESCENT*length/change;
    if(!(derivativeTarget>0&&derivativeTarget<1.875))continue;
    const root=Math.sqrt(1-4*Math.sqrt(derivativeTarget/30));
    for(const t of[(1-root)/2,(1+root)/2]){
      const u=breaks[i-1]+span*t;
      extrema.push({u,height:heights[i-1]+change*smooth(t)+DESCENT*u*COURSE_PHRASE_LENGTH*COURSE_WORLD_PER_METER});
    }
  }
  extrema.sort((a,b)=>a.u-b.u);const elevations=extrema.map(point=>point.height);
  let rise=0,drop=0;
  for(let i=1;i<elevations.length;i++){const change=elevations[i]-elevations[i-1];rise+=Math.max(0,change);drop+=Math.max(0,-change);}
  const verticalSpan=Math.max(...elevations)-Math.min(...elevations);
  const result=Object.freeze({id:profile.id,label:profile.label,index,phrase,seed,macroStart:phrase*COURSE_PHRASE_LENGTH,macroLength:COURSE_PHRASE_LENGTH,amplitude,
    breaks:Object.freeze(breaks),heights:Object.freeze(heights),rise,drop,verticalSpan});
  phrases.set(phrase,result);if(phrases.size>128)phrases.delete(phrases.keys().next().value);return result;
}
export function coursePattern(track=0,seed=1){
  seed=normalizedSeed(seed);track=Math.max(0,Math.floor(Number.isFinite(track)?track:0));
  const phrase=phraseAt(Math.floor(track/3),seed);
  if(patterns.has(track))return patterns.get(track);
  const pattern=Object.freeze({...phrase,track,length:COURSE_SECTION_LENGTH,macroPhase:(track%3)/3});
  patterns.set(track,pattern);if(patterns.size>128)patterns.delete(patterns.keys().next().value);return pattern;
}
export function courseSample(s=0,seed=1){
  s=Number.isFinite(s)?s:0;
  const forward=s*COURSE_WORLD_PER_METER,track=Math.max(0,Math.floor(s/COURSE_SECTION_LENGTH)),pattern=coursePattern(track,seed);
  let height=DESCENT*forward,slope=DESCENT,heightSecondDerivative=0;
  if(s>=0){
    const u=clamp((s-pattern.macroStart)/COURSE_PHRASE_LENGTH,0,1),points=pattern.breaks;
    let i=1;while(i<points.length-1&&u>points[i])i++;
    const span=points[i]-points[i-1],t=clamp((u-points[i-1])/span,0,1),change=pattern.heights[i]-pattern.heights[i-1];
    const length=span*COURSE_PHRASE_LENGTH*COURSE_WORLD_PER_METER;
    height+=pattern.heights[i-1]+change*smooth(t);
    slope+=change*smoothRate(t)/length;
    heightSecondDerivative=change*smoothAcceleration(t)/(length*length);
  }
  const scale=1/Math.sqrt(1+slope*slope),tangentY=slope*scale,tangentZ=scale;
  const curvature=heightSecondDerivative*scale*scale*scale;
  return{height,forward,lateral:0,slope,gravitySlope:slope,heightSecondDerivative,curvature,tangentX:0,tangentY,tangentZ,normalY:tangentZ,normalZ:-tangentY,pitch:Math.atan(slope),pattern};
}
