(function (JD) {
  'use strict';

  const TAU=2*Math.PI;

  JD.createFx=function () {
    const D=JD.Drawing, C=D.colors;
    const recent=new Map(), pending=[], pegsPending=new Set();
    const trails=[], births=[], particles=[], rings=[], floats=[], heads=[], rewards=[], bonuses=[];
    const firstIronHits=new Set(), contactTimes=new Map();
    let time=0, visualTime=0, seed=20261120, reduced=false, shake=null;
    let combo=null, banner=null, vaultAt=-1000, hotTier=0, heat=0, payoutIndex=0;
    let lastTrailTick=-1, lastHeatTime=-1, lastConfetti=-1;

    function random() {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      return seed/4294967296;
    }
    function key(type,id) { return type+':'+(id===undefined?'*':id); }
    function fresh(type,id) {
      const v=recent.get(key(type,id));
      return v ? {e:v.e,age:time-v.time} : null;
    }
    function mark(e,id) {
      const v={e,time};
      recent.set(key(e.type,undefined),v);
      if(id!==undefined) recent.set(key(e.type,id),v);
    }
    function shakeScreen(amount,life) {
      if(!reduced && (!shake || amount>shake.amount*(1-(time-shake.at)/shake.life))) {
        shake={amount,life,at:time};
      }
    }
    function ring(x,y,r0,r1,color,life,width) {
      rings.push({x,y,r0,r1,color,life,width:width||2,at:time});
    }
    function text(list,value,x,y,size,tint,life,extra) {
      list.push(Object.assign({value,x,y,size,tint,life,at:time},extra));
    }
    function burst(x,y,count,tint,options) {
      const o=options||{};
      const n=reduced?Math.ceil(count/3):count;
      for(let i=0;i<n;i++) {
        const a=random()*TAU, speed=(o.speed||4)*(.35+.65*random());
        const v=Math.sin(a)*speed;
        particles.push({
          x:x+(o.spreadX ? (random()-.5)*o.spreadX:0), y, vx:Math.cos(a)*speed,
          vy:o.up?-Math.abs(v)-(o.lift||1.3):v, color:Array.isArray(tint)?tint[i%tint.length]:tint,
          life:o.life||30, at:visualTime+(o.delay||0), g:o.gravity==null?.18:o.gravity,
          size:o.size||1.5+random()*2.5, shape:o.shape||'spark', rotation:random()*TAU, speedSpin:(random()-.5)*.46
        });
      }
      if(particles.length>300) particles.splice(0,particles.length-300);
    }
    function fragment(x,y,w,h,color,life,vx,vy,rotation,delay) {
      particles.push({x,y,vx,vy,color,life,at:visualTime+(delay||0),g:.25,size:w,
        h,shape:'fragment',rotation,speedSpin:(random()-.5)*.35});
      if(particles.length>300) particles.shift();
    }
    function burstPeg(p,e) {
      mark(e,p.id);
      const tier=e.tier, tint=tier?D.combo(tier):e.pegType==='gold'?C.pegGold:e.pegType==='bomb'?C.pegBomb:C.pegNormal;
      text(floats,'+'+D.number(e.pts),p.x,p.y-7,12+3*tier,tint,30,{tier});
      if(e.pegType==='gold'){
        text(floats,'×+1',p.x,p.y+8,14,C.jackpot,20);
        mark({type:'gold'});
      }
      if(e.spin) {
        const x=p.x+e.spin*11, y=p.y;
        rings.push({x,y,r0:7,r1:14,color:C.spin,life:6,width:2,at:time,arc:e.spin});
      }
    }
    function contact(e,id) {
      const k=key(e.type,id);
      if(time-(contactTimes.get(k)||-1000)<3) return false;
      contactTimes.set(k,time);
      return true;
    }
    function flushPending() {
      for(let i=0;i<pending.length;) {
        const p=pending[i];
        if(p.at>time){i++;continue;}
        pending.splice(i,1);
        pegsPending.delete(p.peg.id);
        burstPeg(p.peg,p.e);
      }
    }
    function setCombo(tier) {
      combo={tier,at:time};
      hotTier=tier; heat=1;
      if(tier===4) shakeScreen(3,8);
    }
    function gotBlock(e,s) {
      const vault=e.kind==='vault', delay=3;
      if(vault) {
        vaultAt=time;
        shakeScreen(8,16);
        fragment(e.x-16,e.y,33,25,C.vaultEdge,45,-3.8,-2.3,-.12,delay);
        fragment(e.x+16,e.y,33,25,C.vaultEdge,45,3.8,-2.3,.12,delay);
        burst(e.x,e.y,80,C.jackpot,{shape:'coin',life:70,speed:7,up:true,delay});
        banner={value:'VAULT BROKEN! ×+3',tint:C.jackpot,size:30,at:visualTime+delay,life:60};
      } else {
        burst(e.x,e.y,8,[C.blockEdge,C.block,C.glass],{shape:'fragment',life:30,speed:4,delay});
        text(floats,'+'+D.number(e.bonus),e.x,e.y-13,18,C.jackpot,30);
      }
      const add=vault?3:1;
      const landing=visualTime+delay+(vault?30:20);
      rewards.push({x:e.x,y:e.y,vault,add,at:visualTime+delay,end:landing,done:false});
    }
    function gotGate(e,s,before) {
      const gate=s.gates.find(g=>g.id===e.id), tint=e.kind==='plus'?C.gatePlus:C.gateMinus;
      if(gate) for(let i=0;i<6;i++) {
        fragment(gate.x-30+i*12,gate.y,10,3,tint,20,(i-2.5)*.45,-.6-random(),0,4);
      }
      if(e.result==='spawn'){
        ring(e.x,e.y,0,28,tint,24,3);
        text(heads,'+1 BALL!',e.x,e.y-15,16,tint,24);
      } else if(e.result==='removed'){
        const b=before.balls[e.ball]||s.balls[e.ball];
        burst(e.x,e.y,10,tint,{shape:'fragment',life:20,speed:3});
        if(b) heads.push({ghost:b,x:e.x,y:e.y,ball:before.ball,life:12,at:time});
        text(heads,'−1 BALL',e.x,e.y-15,16,tint,20);
      } else if(e.result==='saved'){
        const b=s.balls[e.ball];
        ring(e.x,e.y,(b?b.r:8)+6,(b?b.r:8)+8,C.text,12,2);
        text(heads,'SAFE!',e.x,e.y-15,14,C.text,16);
      } else text(heads,'MAX BALLS',e.x,e.y-15,12,C.textDim,16);
    }
    function gotIron(e,s,before) {
      const iron=s.iron.find(group=>group.id===e.id);
      if(!iron) return;
      const points=[].concat(...iron.segs);
      const xs=points.filter((_,i)=>i%2===0), ys=points.filter((_,i)=>i%2===1);
      const x=(Math.min(...xs)+Math.max(...xs))/2, y=Math.min(...ys);
      if(e.type==='iron_hit') {
        const b=s.balls[e.ball]||before.balls[e.ball];
        if(b) burst(b.x,b.y,4,C.text,{speed:3,life:11,up:true});
        if(!firstIronHits.has(e.id)) {
          firstIronHits.add(e.id); text(heads,'IRON ONLY',x,y-18,12,C.ironEdge,30);
        }
        return;
      }
      for(const w of iron.segs) {
        const dx=w[2]-w[0], dy=w[3]-w[1], length=Math.hypot(dx,dy);
        for(let a=5;a<length;a+=12) {
          if(reduced&&Math.floor(a/12)%3!==0) continue;
          const tilt=Math.atan2(dy,dx);
          fragment(w[0]+a*dx/length,w[1]+a*dy/length,11,7,C.ironEdge,40,(random()-.5)*2,-random()*2,tilt,3);
        }
      }
      text(heads,'CRASH!',x,y-18,22,C.text,32);
      shakeScreen(5,10);
    }
    function coinFan(x,y,count) {
      burst(x,y,count,['#FFC83D','#FFE695','#E79C21'],{shape:'coin',speed:7.3,up:true,life:65,lift:2.8});
    }
    function confetti(count) {
      burst(196,170,count,[C.combo1,C.success,C.jackpot,C.combo4,C.text],
        {shape:'fragment',life:72,speed:5,up:true,spreadX:130,gravity:.14});
    }
    function event(e,s,before,blastDelays) {
      let id=e.id;
      if(e.type==='warp') id=e.ball;
      if(e.type==='ball_landed') id=e.bucket;
      if(e.type==='terrain_hit'||e.type==='bumper_hit') id=e.index;
      if(e.type==='spring_picked') e=Object.assign({oldLo:before.spring.perfectLo,oldHi:before.spring.perfectHi},e);
      if(e.type==='peg_hit'){
        const p=s.pegs[e.id]||before.pegs[e.id];
        if(!p) return;
        const delay=e.cause==='blast'?(blastDelays.get(e.id)||0):0;
        const trigger=Object.assign({spin:s.shot?s.shot.spin:before.shot?before.shot.spin:0},e);
        if(delay){pegsPending.add(p.id);pending.push({e:trigger,peg:p,at:time+delay});}
        else burstPeg(p,trigger);
        return;
      }
      if((e.type==='terrain_hit'||e.type==='bumper_hit')&&!contact(e,id)) return;
      mark(e,id);
      switch(e.type){
        case 'stage_started':
          firstIronHits.clear();contactTimes.clear();trails.length=0;births.length=0;
          recent.clear();particles.length=0;rings.length=0;floats.length=0;heads.length=0;
          rewards.length=0;bonuses.length=0;pending.length=0;pegsPending.clear();
          combo=null;banner=null;shake=null;vaultAt=-1000;hotTier=0;heat=0;
          break;
        case 'shot_fired':
          trails.length=0; births.length=0; combo=null;
          ring(376,540,12,0,C.text,6,2);
          break;
        case 'launch':
          ring(352,60,10,0,C.text,6,2);
          if(e.tier) setCombo(e.tier);
          break;
        case 'combo_up': setCombo(e.tier); break;
        case 'bomb_exploded':
          ring(e.x,e.y,0,e.r,C.pegBomb,12,6);
          burst(e.x,e.y,24,[C.pegBomb,C.pegBombLit,C.jackpot],{shape:'fragment',life:24,speed:5});
          shakeScreen(6,12); break;
        case 'ball_split':
          ring(e.x,e.y,0,24,C.text,16,2);
          text(heads,'SPLIT!',e.x,e.y-16,14,C.text,16); break;
        case 'ball_crack': text(heads,'CRACK!',e.x,e.y-16,14,C.glass,24); break;
        case 'ball_shatter':
          burst(e.x,e.y,14,C.glass,{shape:'triangle',life:30,speed:5});
          ring(e.x,e.y,0,30,C.text,24,3);
          text(heads,'SHATTER! +'+e.count,e.x,e.y-16,18,C.glass,30); break;
        case 'gate_passed': gotGate(e,s,before); break;
        case 'warp':
          if(trails[e.ball]) trails[e.ball].length=0;
          ring(e.x,e.y,17,2,C.warp,4,3);
          text(heads,'WARP!',e.x,e.y-17,14,C.warp,12);
          rings.push({x:e.ox,y:e.oy,r0:30,r1:0,color:C.warp,life:20,width:3,at:time+4});
          text(heads,'?!',e.ox,e.oy-12,14,C.warp,20,{at:time+4}); break;
        case 'iron_hit': case 'iron_break': gotIron(e,s,before); break;
        case 'block_hit': {
          const b=s.blocks.find(p=>p.id===e.id);
          if(!b||e.cause!=='ball') break;
          text(floats,'+5',b.x,b.y+20,12,C.text,24);
          if(s.ball==='iron'||before.ball==='iron'){
            text(floats,'−2',b.x-12,b.y-14,12,C.ironEdge,24);
            burst(b.x,b.y,6,C.jackpot,{speed:3,up:true,life:16});
          }
          if(b.kind==='vault') burst(b.x,b.y,4,C.jackpot,{shape:'coin',life:32,up:true});
          break;
        }
        case 'block_broken': gotBlock(e,s); break;
        case 'terrain_hit': {
          const w=s.terrain[e.index], balls=s.balls.length?s.balls:before.balls;
          if(w&&balls.length){
            const p=balls.map(b=>JD.segPoint(b.x,b.y,w)).sort((a,b)=>a.d-b.d)[0];
            ring(p.cx,p.cy,6,0,C.text,6,1.5);
          }
          break;
        }
        case 'stuck_clear':
          for(const id of e.ids){ const p=s.pegs[id]; if(p) ring(p.x,p.y,7,0,C.text,10,2); }
          break;
        case 'ball_landed': {
          const x=(s.buckets.x[e.bucket]+s.buckets.x[e.bucket+1])/2;
          if(e.mult===5) {
            banner={value:'JACKPOT ×5',tint:C.jackpot,size:32,at:visualTime,life:60};
            coinFan(x,614,60); shakeScreen(5,12);
          } else if(e.mult===2) text(heads,'×2',x,581,18,C.text,18,{pop:true});
          break;
        }
        case 'shot_finished': combo=null;payoutIndex=0;break;
        case 'payout_done':
          rings.length=0;floats.length=0;
          if(banner&&banner.value.indexOf('JACKPOT')===0) banner=null;
          break;
        case 'stage_clear':
          confetti(60);
          if(e.ballsLeft) {
            const amount=e.bonus/e.ballsLeft;
            s.rackIndices.forEach((slot,i)=>bonuses.push({x:JD.UI.ballX(s,slot),y:44,amount,at:time+i*6}));
          }
          break;
        case 'all_clear':
          coinFan(196,560,120);
          confetti(42);
          break;
      }
    }

    function events(items,s,before,ui) {
      time=ui.age;reduced=ui.reduced;
      const delays=new Map();
      for (const e of items) {
        if(e.type!=='bomb_exploded') continue;
        e.lit.map(id=>s.pegs[id]).filter(Boolean)
          .sort((a,b)=>Math.hypot(a.x-e.x,a.y-e.y)-Math.hypot(b.x-e.x,b.y-e.y))
          .forEach((p,i)=>delays.set(p.id,Math.min(6,i+1)));
      }
      for(const e of items) event(e,s,before,delays);
      if(s.shot&&s.balls.length>before.balls.length) {
        for(let i=Math.max(1,before.balls.length);i<s.balls.length;i++) births[i]=time;
      }
    }

    function keep(list,t) {
      for(let i=list.length-1;i>=0;i--) if(t-list[i].at>=list[i].life) list.splice(i,1);
    }
    function frame(s,ui,audio) {
      time=ui.age; reduced=ui.reduced;
      const slowVault=time-vaultAt>=3&&time-vaultAt<33;
      visualTime+=slowVault?.5:1;
      flushPending();
      const decaying=s.state!=='FLIGHT';
      if(lastHeatTime!==time&&decaying) heat=Math.max(0,heat-.05);
      lastHeatTime=time;
      if(s.shot&&s.tick!==lastTrailTick){
        lastTrailTick=s.tick;
        s.balls.forEach((b,i)=>{
          if(b.done) return;
          const past=trails[i]||(trails[i]=[]);
          const off=fresh('warp',i);
          if(!off||off.age>=8) past.push({x:b.x,y:b.y});
          if(past.length>21) past.shift();
          if(s.shot.tier===4&&time%2===0&&!reduced) burst(b.x,b.y,1,C.combo4,{life:11,speed:1.5,gravity:.05,size:1.5});
        });
      }
      if(s.payout){
        const next=Math.min(s.payout.pins.length,Math.floor(s.payout.elapsed/s.payout.spacing));
        while(payoutIndex<next){
          const p=s.payout.pins[payoutIndex];
          mark({type:'payout_pop',index:payoutIndex},p.id);
          if(!p.removed){
            ring(p.x,p.y,7,14,C.text,10,2);
            burst(p.x,p.y,4,p.type==='gold'?C.jackpot:C.pegNormalLit,{life:15,speed:3});
          }
          if(audio) audio.event({type:'payout_pop',index:payoutIndex},s);
          payoutIndex++;
        }
      }
      for(const r of rewards){
        if(!r.done&&visualTime>=r.end) {
          r.done=true;
          mark({type:'mult_land',vault:r.vault});
          if(r.vault){ring(33,60,9,21,C.jackpot,15,2);ring(33,60,14,30,C.jackpot,18,2);}
          if(audio) audio.event({type:'mult_land',vault:r.vault},s);
        }
      }
      while(rewards.length&&visualTime-rewards[0].end>20) rewards.shift();
      while(bonuses.length&&time-bonuses[0].at>=32) bonuses.shift();

      const celebrate=s.banner&&s.banner.kind==='allclear'||s.result&&s.result.won;
      if(celebrate&&time-lastConfetti>=8) {
        lastConfetti=time;
        if(s.result) coinFan(196,625,4);
        else confetti(4);
      }
      keep(particles,visualTime);keep(rings,time);keep(floats,time);keep(heads,time);
    }

    function drawParticle(c,p) {
      const age=visualTime-p.at;
      if(age<0) return;
      c.save();
      c.translate(p.x+p.vx*age,p.y+p.vy*age+p.g*age*age/2);
      c.rotate(p.rotation+p.speedSpin*age);
      c.globalAlpha=Math.min(1,(p.life-age)/10);
      if(p.shape==='coin'){
        c.beginPath();
        c.ellipse(0,0,p.size+1.6,1.5+Math.abs(Math.cos(age/5))*p.size*.75,0,0,TAU);
        c.fillStyle=p.color;c.fill();c.strokeStyle='#FFF1B8';c.lineWidth=.8;c.stroke();
      } else if(p.shape==='triangle'){
        c.beginPath();c.moveTo(-p.size,p.size);c.lineTo(p.size,0);c.lineTo(0,-p.size*1.5);
        c.closePath();c.fillStyle=p.color;c.fill();
      } else if(p.shape==='fragment'){
        c.fillStyle=p.color;c.fillRect(-p.size/2,-(p.h||p.size)/2,p.size,p.h||p.size);
      } else D.circle(c,0,0,p.size,p.color);
      c.restore();
    }
    function drawRings(c) {
      for(const r of rings){
        const a=(time-r.at)/r.life;
        if(a<0||a>=1) continue;
        const size=r.r0+(r.r1-r.r0)*a;
        c.beginPath();
        c.arc(r.x,r.y,Math.max(.1,size),r.arc?(r.arc<0?2.4:-.5):0,r.arc?(r.arc<0?3.8:.8):TAU);
        c.strokeStyle=D.rgba(r.color,1-a);c.lineWidth=1+(r.width-1)*(1-a);c.stroke();
      }
    }
    function drawText(c,d) {
      const k=time-d.at;
      if(k<0) return;
      const ratio=k/d.life, fade=Math.min(1,(1-ratio)*4);
      const twitch=!reduced&&(d.tier===4||d.wave)?Math.sin(k*2)*(d.wave?4:1):0;
      const rise=d.fixed?0:20*ratio;
      const adjust=d.pop?(k<6?.6+k*.1:1+.18*Math.max(0,1-(k-6)/10)):1;
      c.save();
      c.globalAlpha=fade;
      D.label(c,d.value,D.clamp(d.x+twitch,36,356),d.y-rise,d.size*Math.min(adjust,reduced?1.15:1.25),
        d.tint,'center',{outline:C.ink,max:350});
      c.restore();
    }
    function drawRewards(c) {
      for(const r of rewards){
        if(r.done||visualTime<r.at) continue;
        const a=(visualTime-r.at)/(r.end-r.at);
        const x=r.x+(28-r.x)*a, y=r.y+(64-r.y)*a+52*Math.sin(a*Math.PI);
        for(let i=1;i<6;i++) D.circle(c,x+(r.x-x)*i*.025,y+(r.y-y)*i*.028,4-i*.5,D.rgba(C.jackpot,.35-i*.04));
        D.label(c,'×+'+r.add,x,y,r.vault?32:22,C.jackpot,'center',{outline:C.ink});
      }
    }
    function draw(c) {
      drawRings(c);
      for(const p of particles) drawParticle(c,p);
      for(const d of floats) drawText(c,d);
      for(const d of heads) {
        if(d.ghost) D.ball(c,d.ball,d.x,d.y,d.ghost.r*(1-(time-d.at)/d.life));
        else drawText(c,d);
      }
      drawRewards(c);
      if(banner) {
        const age=visualTime-banner.at;
        if(age>=0&&age<banner.life){
          const scale=age<4?.6+age*.1375:1+.15*Math.max(0,1-(age-4)/10);
          c.save();c.globalAlpha=Math.min(1,(banner.life-age)/9);
          const fade=D.rgba(C.ink,.77), grad=c.createLinearGradient(17,0,375,0);
          grad.addColorStop(0,D.rgba(C.ink,0));grad.addColorStop(.21,fade);
          grad.addColorStop(.79,fade);grad.addColorStop(1,D.rgba(C.ink,0));
          D.box(c,17,283,358,61,9,grad);
          D.label(c,banner.value,196,326,banner.size*scale,banner.tint,'center',{max:355,outline:C.ink,outlineWidth:4});
          c.restore();
        }
      }
    }
    function world(c,s,ui) {
      if(reduced) return;
      if(shake){
        const a=shake.amount*Math.max(0,1-(time-shake.at)/shake.life);
        if(a>0) c.translate(Math.sin(time*2.1)*a,Math.cos(time*2.9)*a*.55);
      }
      if(ui.slowBlend>0.01&&s.shot){
        const b=s.balls.find(p=>!p.done);
        if(b) {
          const scale=1+.06*ui.slowBlend;
          c.translate(b.x,b.y);c.scale(scale,scale);c.translate(-b.x,-b.y);
        }
      }
    }
    function overlay(c,s,ui) {
      if(ui.slowBlend>0){
        const g=c.createRadialGradient(196,333,150,196,333,340);
        g.addColorStop(0,D.rgba('#000000',0));g.addColorStop(1,D.rgba('#000000',.35*ui.slowBlend));
        c.fillStyle=g;c.fillRect(0,0,392,640);
      }
      if(combo&&time-combo.at<8){
        const age=time-combo.at;
        D.box(c,2,2,388,636,9,null,D.rgba(D.combo(combo.tier),.25*(1-age/8)),9);
      }
      if(time-vaultAt<8) {
        c.fillStyle=D.rgba(C.text,.6*(1-(time-vaultAt)/8));c.fillRect(0,0,392,640);
      }
      const clear=fresh('all_clear');
      if(clear&&clear.age<18) D.box(c,4,4,384,632,8,null,D.rgba(C.jackpot,.65*(1-clear.age/18)),12);
      for(const b of bonuses) {
        if(time<b.at) continue;
        const a=Math.min(1,(time-b.at)/28);
        const x=b.x+(264-b.x)*a,y=b.y+(23-b.y)*a+84*Math.sin(a*Math.PI);
        if(a<.2) D.ball(c,'normal',x,y,7*(1-a/.25));
        else D.label(c,'+'+D.number(b.amount),x,y,15,C.success,'center',{outline:C.ink});
      }
    }
    return {
      events,frame,draw,world,overlay,fresh,trails,births,pegsPending,
      get hotTier(){return hotTier;},get heat(){return heat;},
      pendingMult(){return rewards.reduce((sum,r)=>sum+(r.done?0:r.add),0);}
    };
  };
})(JD);
