// Shared path frame. s is game metres; lateral/height/forward are world X/Y/Z.
// The expanding turn drops and moves sideways so the broad entry/exit decks never cross.
export const COURSE_WORLD_PER_METER = Math.PI * 2 * 23 / 360;
export const LOOP_FIRST_START = 780;
export const LOOP_INTERVAL = 1800;
export const LOOP_RADIUS = 14;
const TAU=Math.PI*2,DRIFT=16,DROP=14,SHIFT=40,STEPS=512;
const radius=u=>LOOP_RADIUS+DROP*u*u*(3-2*u),radiusRate=u=>DROP*6*u*(1-u);
const arc=new Float64Array(STEPS+1),rate=u=>{const a=TAU*u,r=radius(u),dr=radiusRate(u);return Math.hypot(SHIFT*6*u*(1-u),DRIFT+dr*Math.sin(a)+TAU*r*Math.cos(a),-dr*Math.cos(a)+TAU*r*Math.sin(a));};
for(let i=1;i<=STEPS;i++){const a=(i-1)/STEPS,b=i/STEPS;arc[i]=arc[i-1]+(rate(a)+4*rate((a+b)/2)+rate(b))*(b-a)/6;}
export const LOOP_LENGTH = arc[STEPS]/COURSE_WORLD_PER_METER;
const FORWARD_LOSS=arc[STEPS]-DRIFT;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function baseSample(s){const d=s*COURSE_WORLD_PER_METER;return{height:-.06*d-4.5*Math.sin(d/30)+1.4*Math.sin(d/67),slope:-.06-.15*Math.cos(d/30)+1.4/67*Math.cos(d/67)};}
export function loopAt(s=0,margin=0){
  if(!Number.isFinite(s))return null;
  margin=Number.isFinite(margin)?Math.max(0,Math.min(200,margin)):0;
  const index=Math.max(0,Math.floor((s-LOOP_FIRST_START+margin)/LOOP_INTERVAL)),start=LOOP_FIRST_START+index*LOOP_INTERVAL,end=start+LOOP_LENGTH;
  return s>=start-margin&&s<=end+margin?{index,start,end,section:Math.floor(start/360)+1,progress:clamp((s-start)/LOOP_LENGTH,0,1),radius:LOOP_RADIUS}:null;
}
// Invert the sampled arc with a local Hermite curve, including its endpoint derivative.
function loopParameter(metres){
  const distance=clamp(metres*COURSE_WORLD_PER_METER,0,arc[STEPS]);let lo=0,hi=STEPS;
  while(hi-lo>1){const m=(lo+hi)>>1;if(arc[m]<=distance)lo=m;else hi=m;}
  const length=arc[hi]-arc[lo],m0=rate(lo/STEPS)/STEPS,m1=rate(hi/STEPS)/STEPS;
  let t=clamp((distance-arc[lo])/length,0,1),derivative=length;
  for(let n=0;n<3;n++){
    const t2=t*t,t3=t2*t,value=(-2*t3+3*t2)*length+(t3-2*t2+t)*m0+(t3-t2)*m1;
    derivative=(-6*t2+6*t)*length+(3*t2-4*t+1)*m0+(3*t2-2*t)*m1;
    t=clamp(t-(arc[lo]+value-distance)/derivative,0,1);
  }
  return{u:(lo+t)/STEPS,du:COURSE_WORLD_PER_METER/(derivative*STEPS)};
}
export function courseSample(s=0){
  s=Number.isFinite(s)?s:0;const base=baseSample(s),loop=loopAt(s);
  const complete=s<LOOP_FIRST_START?0:Math.max(0,Math.floor((s-LOOP_FIRST_START)/LOOP_INTERVAL)+1-(loop?1:0));
  let lateral=complete*SHIFT,dx=0,forward=s*COURSE_WORLD_PER_METER-complete*FORWARD_LOSS,dy=base.slope*COURSE_WORLD_PER_METER,dz=COURSE_WORLD_PER_METER,height=base.height-complete*DROP;
  if(loop){const{u,du}=loopParameter(s-loop.start),theta=TAU*u,r=radius(u),dr=radiusRate(u);lateral+=SHIFT*u*u*(3-2*u);dx=SHIFT*6*u*(1-u)*du;forward=loop.start*COURSE_WORLD_PER_METER-loop.index*FORWARD_LOSS+DRIFT*u+r*Math.sin(theta);height+=LOOP_RADIUS-r*Math.cos(theta);dy+=(-dr*Math.cos(theta)+r*TAU*Math.sin(theta))*du;dz=(DRIFT+dr*Math.sin(theta)+r*TAU*Math.cos(theta))*du;}
  // Width stays along world X; the YZ normal remains perpendicular to that whole ribbon.
  const metric=Math.hypot(dx,dy,dz),verticalMetric=Math.hypot(dy,dz),tangentX=dx/metric,tangentY=dy/metric,tangentZ=dz/metric;
  let pitch=Math.atan2(tangentY,tangentZ);if(loop&&loop.progress>.4&&pitch<0)pitch+=TAU;
  // Keep the legacy landscape slope separate from the exact elevation-work gradient.
  return{height,forward,lateral,slope:base.slope,gravitySlope:dy/COURSE_WORLD_PER_METER,tangentX,tangentY,tangentZ,normalY:dz/verticalMetric,normalZ:-dy/verticalMetric,pitch,loop};
}
