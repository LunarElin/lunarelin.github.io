// Test-only worker: the shipped rules, fixed seed corpus and timestep are unchanged.
import { parentPort, workerData } from 'node:worker_threads';
import { newProfile, newRun, stepRun, RUN_DURATION } from '../rules.mjs';

const level=workerData.level,seedCount=workerData.seedCount||100,seedStart=workerData.seedStart||1,started=performance.now();
const profile={...newProfile(),tutorialComplete:true,upgrades:{pilot:0,ball:level}};
const values=[],times=[],chains=[],depths=[];let capped=0;
for(let seed=seedStart;seed<seedStart+seedCount;seed++){
  const run=newRun(profile,1,seed,8);
  for(let count=0;run.phase==='rolling'&&count<20000;count++)stepRun(run,profile,.2);
  if(run.phase!=='stopped')throw new Error(`level ${level}, seed ${seed}: a shot did not stop`);
  if(!(run.elapsed<=RUN_DURATION))throw new Error(`level ${level}, seed ${seed}: duration cap exceeded`);
  values.push(run.distance);times.push(run.elapsed);chains.push(run.chainHits);depths.push(run.maxChain);
  if(run.stopReason==='time')capped++;
  if(seed%25===0)parentPort.postMessage({type:'progress',level,seedStart,seed,seconds:Number(((performance.now()-started)/1000).toFixed(1))});
}
const median=items=>[...items].sort((a,b)=>a-b)[Math.floor((items.length-1)/2)];
parentPort.postMessage({type:'result',level,seedStart,values,times,chains,depths,capped,calibration:{level,distance:Math.round(median(values)),seconds:Number(median(times).toFixed(1)),
  chains:median(chains),depth:median(depths),timeCaps:capped,chainsPresent:chains.filter(value=>value>0).length}});
parentPort.close();
