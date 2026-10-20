// Repeatable diagnostic, not a human win-rate test. The policy never reads solution or covered types.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const moduleURL=process.argv[2]?pathToFileURL(resolve(process.argv[2])):new URL('../rules.mjs',import.meta.url);
const {createGame,available,pick,tick}=await import(moduleURL);

function choose(open,tray,fever,time) {
  const count=Array(8).fill(0),held=Array(8).fill(0);
  for(const t of open) if(!t.item) count[t.type]++;
  for(const t of tray) held[t.type]++;
  const triple=count.some((n,type)=>n>0&&n+held[type]>=3);
  const rank=t=>{
    if(t.item==='fever') return fever<=6&&triple?100:1;
    if(t.item==='magnet') return tray.length>=5||tray.length>=3&&!triple?110:2;
    if(t.item==='basket') return tray.length>=5&&!triple?110:0;
    if(t.item==='shuffle') return tray.length>=4&&!triple?105:1;
    if(t.item==='freeze') return time<=45?115:1;
    if(t.item) return 1;
    return (held[t.type]+count[t.type]>=3?60:10)+held[t.type]*5+count[t.type];
  };
  return open.slice().sort((a,b)=>rank(b)-rank(a))[0];
}
const report=[];
for(const level of [10,20,50]) for(const pace of [2.5,4]) {
  let wins=0,timeouts=0,rescued=0,matches=0,feverMatches=0,feverStarts=0,peak=0,remaining=0;
  for(let seed=1;seed<=100;seed++) {
    const s=createGame({level,seed});let moves=0;
    while(s.status==='playing'&&moves++<160) {
      const tile=choose(available(s),s.tray,s.fever,s.time);
      for(let dt=pace;dt>0;dt-=Math.min(1,dt)) tick(s,Math.min(1,dt));
      if(s.status!=='playing') break;
      const result=pick(s,tile.id);
      if(!result.ok) throw Error('Invalid diagnostic move');
      if(result.match) {matches++;if(result.multiplier===2) feverMatches++;}
      if(result.feverStarted) feverStarts++;
      peak=Math.max(peak,s.tray.length);
    }
    if(s.status==='playing') throw Error('Diagnostic move limit');
    if(s.status==='won') {wins++;remaining+=s.time;}
    else if(s.time===0) timeouts++;
    rescued+=s.saved/s.total;
  }
  report.push({level,secondsPerMove:pace,runs:100,wins,timeouts,basketLosses:100-wins-timeouts,meanRescuedPercent:Math.round(rescued),feverMatchPercent:Math.round(feverMatches/Math.max(1,matches)*100),meanFeverStarts:+(feverStarts/100).toFixed(2),meanWinTime:wins?Math.round(remaining/wins):null,peakTray:peak});
}
console.log(JSON.stringify(report,null,2));
