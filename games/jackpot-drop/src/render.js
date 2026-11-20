(function (JD) {
  'use strict';

  const colors = {
    bgTop:'#0B0E2A', bgBottom:'#1A1146', lane:'#070920', laneEdge:'#5A62A8',
    pegNormal:'#39A0FF', pegNormalLit:'#BDF3FF', pegGold:'#FFC83D', pegGoldLit:'#FFF1B8',
    pegBomb:'#FF4D6D', pegBombLit:'#FFD0D8', bumper:'#B26BFF', gatePlus:'#3DFFC8', gateMinus:'#FF4D6D',
    block:'#2E3A8C', blockEdge:'#8FA2FF', vault:'#5A3A00', vaultEdge:'#FFC83D',
    terrain:'#3A3F66', terrainEdge:'#C9CEF5', ball:'#FFFFFF', jackpot:'#FFC83D',
    combo1:'#3DD6FF', combo2:'#5CFFB0', combo3:'#FFC83D', combo4:'#FF4DD2',
    springStandard:'#C9CEF5', springSoft:'#5CFFB0', springStiff:'#FF6B6B', ironWall:'#59627E',
    ironEdge:'#C9D1E6', warp:'#9D4DFF', spin:'#3DD6FF', hint:'#FFC83D', glass:'#BDF3FF',
    iron:'#9AA3B8', text:'#FFFFFF', textDim:'#A9B0D6', danger:'#FF6B6B', success:'#5CFFB0', ink:'#05061A'
  };
  const twoPi = 2 * Math.PI;
  const fontFamily = '"Jackpot Sans","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif';
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const pulse = (time, period) => .5 - .5 * Math.cos(time * twoPi / period);
  const number = n => Math.round(n).toLocaleString('en-US');
  const combo = tier => colors['combo' + tier] || colors.text;
  const springColor = key => ({standard:colors.springStandard, soft:colors.springSoft, stiff:colors.springStiff, spin:colors.spin})[key];
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };
  const fresh = (fx, type, id) => fx ? fx.fresh(type, id) : null;

  function box(c,x,y,w,h,r,fill,stroke,width) {
    if (w <= 0 || h <= 0) return;
    r = Math.max(0, Math.min(r, w/2, h/2));
    c.beginPath();
    c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
    c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
    if (fill) { c.fillStyle=fill; c.fill(); }
    if (stroke) { c.strokeStyle=stroke; c.lineWidth=width || 1; c.stroke(); }
  }

  function circle(c,x,y,r,fill,stroke,width) {
    if (r <= 0) return;
    c.beginPath(); c.arc(x,y,r,0,twoPi);
    if (fill) { c.fillStyle=fill; c.fill(); }
    if (stroke) { c.strokeStyle=stroke; c.lineWidth=width || 1; c.stroke(); }
  }

  function line(c,x,y,xx,yy,stroke,width) {
    c.beginPath(); c.moveTo(x,y); c.lineTo(xx,yy); c.strokeStyle=stroke; c.lineWidth=width || 1; c.stroke();
  }

  function label(c, value, x, y, size, tint, align, opts) {
    opts = opts || {};
    c.save();
    c.textAlign=align || 'center'; c.textBaseline='alphabetic';
    const font = opts.body ? '600 ' : '900 ';
    c.font = font + size + 'px ' + fontFamily;
    while (opts.max && c.measureText(value).width>opts.max && size>(opts.minSize || 11)) {
      c.font=font + (--size) + 'px ' + fontFamily;
    }
    if (opts.outline) {
      c.lineJoin='round'; c.lineWidth=opts.outlineWidth || 3; c.strokeStyle=opts.outline;
      if (opts.max) c.strokeText(value,x,y,opts.max);
      else c.strokeText(value,x,y);
    }
    c.fillStyle=tint;
    if (opts.max) c.fillText(value,x,y,opts.max);
    else c.fillText(value,x,y);
    c.restore();
  }

  function glow(c,x,y,r,tint,alpha) {
    const g=c.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,rgba(tint,alpha)); g.addColorStop(1,rgba(tint,0));
    circle(c,x,y,r,g);
  }

  function ball(c,key,x,y,r,o) {
    o = o || {};
    if (!r || r<0) return;
    c.save(); c.translate(x,y);
    let fill=colors.ball, edge=null, width=1.5;
    if (key==='big') { edge=colors.glass; width=2; }
    if (key==='glass') { fill=rgba(colors.glass,.55); edge=colors.text; }
    if (key==='iron') {
      fill=c.createRadialGradient(-r*.25,-r*.35,0,0,0,r);
      fill.addColorStop(0,'#E6E9FF'); fill.addColorStop(.5,colors.iron); fill.addColorStop(1,'#4A5068');
      edge='#2A2F44';
    }
    circle(c,0,0,r,fill,edge,width);
    circle(c,-r*.28,-r*.34,r*.36,rgba(colors.text,.8));
    if (o.cracked) {
      line(c,-r*.7,-r*.55,0,-r*.1,colors.text,1);
      line(c,0,-r*.1,r*.38,r*.69,colors.text,1);
      line(c,0,-r*.1,r*.85,-r*.31,colors.text,1);
    }
    if (o.spin) {
      c.save(); c.beginPath(); c.arc(0,0,r-.3,0,twoPi); c.clip();
      c.rotate(o.spin*(o.time || 0)*twoPi/10);
      c.beginPath(); c.ellipse(-r*.36,0,r*.5,r*.91,.2,0,twoPi);
      c.ellipse(r*.34,0,r*.45,r*.91,.2,0,twoPi);
      c.strokeStyle=colors.spin; c.lineWidth=1.4; c.stroke(); c.restore();
    }
    c.restore();
  }

  function coil(c,x,y,halfWidth,height,spring) {
    const turns={standard:7,spin:7,soft:5,stiff:10}[spring] || 7;
    c.save(); c.lineJoin='round'; c.lineCap='round';
    c.beginPath(); c.moveTo(x,y);
    for(let i=0;i<turns;i++) c.lineTo(x+(i%2 ? -halfWidth : halfWidth),y+(i+1)*height/(turns+1));
    c.lineTo(x,y+height); c.lineWidth=spring==='stiff'?3:2;
    c.strokeStyle=springColor(spring) || colors.springStandard; c.stroke(); c.restore();
  }

  JD.Drawing={colors,clamp,pulse,number,combo,springColor,rgba,fresh,box,circle,line,label,glow,ball,coil,fontFamily};
  JD.UI={
    ballX:(s,i) => 180+(i-(s.fullRack.length-1)/2)*28,
    cards:s => s.offer && (s.offer.length===1 ? [{x:46,y:202,w:300,h:218}] :
      s.offer.map((_,i)=>({x:30,y:166+120*i,w:332,h:106}))),
    result:{x:76,y:470,w:240,h:56}
  };

  function background(c,s,fx) {
    const bg=c.createLinearGradient(0,0,0,640);
    bg.addColorStop(0,colors.bgTop); bg.addColorStop(1,colors.bgBottom);
    c.fillStyle=bg; c.fillRect(0,0,392,640);
    const tier = s.shot ? s.shot.tier : fx ? fx.hotTier : 0;
    if (tier>=3) {
      const heat=c.createLinearGradient(0,0,0,410);
      heat.addColorStop(0,rgba(combo(tier),.06*(s.shot ? 1 : fx.heat)));
      heat.addColorStop(1,rgba(combo(tier),0)); c.fillStyle=heat; c.fillRect(0,0,392,410);
    }
    for(let x=0;x<392;x+=40) line(c,x+.5,0,x+.5,640,rgba(colors.text,.04));
    for(let y=0;y<640;y+=40) line(c,0,y+.5,392,y+.5,rgba(colors.text,.04));
  }

  function buckets(c,s,ui,fx,t,beam) {
    const x=s.buckets.x;
    const tutorial=s.stage===1 && !ui.tutorialSeen;
    s.buckets.mult.forEach((mult,i)=>{
      const left=x[i], width=x[i+1]-left, center=left+width/2;
      const landing=fresh(fx,'ball_landed',i);
      const jackpot=mult===5;
      if(beam) {
        if(!jackpot) return;
        const g=c.createLinearGradient(0,380,0,600);
        const alpha=landing && landing.age<20 ? .5 : (.12+.10*pulse(t,40))*(tutorial?1.5:1)*(1+ui.slowBlend);
        g.addColorStop(0,rgba(colors.jackpot,0)); g.addColorStop(1,rgba(colors.jackpot,alpha));
        c.fillStyle=g; c.fillRect(left,380,width,220);
        return;
      }
      if(jackpot) {
        box(c,left+2,600,width-4,40,3,rgba(colors.jackpot,.35+.25*pulse(t,40)),rgba(colors.jackpot,.4),10);
        box(c,left+2,600,width-4,40,3,null,colors.jackpot,2);
        const flash=ui.stageAge<30 && ui.stageAge%10<4 || landing && landing.age<30 && landing.age%10<4;
        if (flash) box(c,left+2,601,width-4,38,3,rgba(colors.text,.45));
        label(c,'×5',center,628,29,colors.bgBottom);
        for(let k=0;k<6;k++) {
          c.beginPath(); c.ellipse(center+(k%3-1)*9+(k>=3?3:0),637-(k>=3?3:0),5,2.3,0,0,twoPi);
          c.fillStyle=k>=3?'#FFED9C':colors.jackpot; c.fill();
        }
        for(let k=0;k<3;k++){
          const lead=((t/120+k/3)%1);
          circle(c,left+5+lead*(width-10),592+2*Math.sin(lead*twoPi+k),1.3,rgba(colors.jackpot,.45+.55*pulse(t+k*20,40)));
        }
        if(t%60<10) circle(c,center+9,632,2,rgba(colors.text,1-(t%60)/10));
        if(ui.stageAge<80) label(c,'▼ 잭팟',clamp(center,40,320),584,20,colors.jackpot,'center',{outline:colors.ink});
      } else {
        box(c,left+2,600,width-4,40,0,rgba(colors.text,.04));
        label(c,'×'+mult,center,627,21,colors.textDim);
        if(landing && landing.age<12) box(c,left+2,600,width-4,40,0,rgba(colors.text,.3*(1-landing.age/12)));
      }
      if(i>0) box(c,left-2,600,4,40,0,colors.lane);
    });
  }

  function launchPosition(k) {
    const e=1-Math.pow(1-clamp(k/12,0,1),2);
    const d=e*(456+Math.PI*12);
    if (d<=456) return [376,540-d];
    const a=(d-456)/24;
    return [352+24*Math.cos(a),84-24*Math.sin(a)];
  }

  function lane(c,s,ui,fx,t) {
    c.fillStyle=colors.lane; c.fillRect(360,40,32,600);
    box(c,364,77,24,563,0,colors.lane);
    for(let y=90;y<640;y+=8) line(c,366,y,386,y,rgba(colors.text,.1));
    const shot=fresh(fx,'shot_fired');
    const zone=fresh(fx,'charge_zone');
    const laneColor=shot&&shot.e.perfect&&shot.age<10 ? colors.jackpot :
      s.launch&&s.launch.elapsed>8 ? colors.textDim : colors.laneEdge;
    c.save(); c.lineWidth=24; c.strokeStyle=colors.lane;
    c.beginPath(); c.arc(352,84,24,-Math.PI/2,0); c.stroke();
    c.strokeStyle=laneColor; c.lineWidth=2;
    c.beginPath(); c.arc(352,84,36,-Math.PI/2,0); c.lineTo(388,640); c.stroke();
    c.beginPath(); c.arc(352,84,12,-Math.PI/2,0); c.lineTo(364,640); c.stroke(); c.restore();

    const sKey=s.spring.key;
    const example=ui.demoPower;
    const p=s.state==='AIM' ? Math.max(s.power,example) : 0;
    const perfect=s.perfect && s.state==='AIM' || example>=s.spring.perfectLo && example<=s.spring.perfectHi;
    const color=p===1?colors.text : perfect?colors.jackpot:colors.combo1;
    const tremor=!ui.reduced && p===1 ? t%2?1:-1 : 0;
    const pick=fresh(fx,'spring_picked');
    const zoneT=pick&&pick.age<8 ? pick.age/8 : 1;
    const lo=pick&&zoneT<1?pick.e.oldLo+(s.spring.perfectLo-pick.e.oldLo)*zoneT:s.spring.perfectLo;
    const hi=pick&&zoneT<1?pick.e.oldHi+(s.spring.perfectHi-pick.e.oldHi)*zoneT:s.spring.perfectHi;
    c.save(); c.translate(tremor,0);
    box(c,364,360,24,160,0,rgba(colors.text,.08));
    if(p>0) box(c,364,520-p*160,24,p*160,0,color);
    box(c,364,520-hi*160,24,(hi-lo)*160,0,rgba(colors.jackpot,.35));
    line(c,364,520-hi*160,388,520-hi*160,rgba(colors.jackpot,.8));
    line(c,364,520-lo*160,388,520-lo*160,rgba(colors.jackpot,.8));
    if(perfect) box(c,363,360,26,160,2,null,rgba(colors.jackpot,zone&&zone.age<6?.9:.25+.25*pulse(t,10)),2);
    c.restore();
    if(s.lastPower!==null) label(c,'◀',387,523-s.lastPower*160,9,colors.textDim);
    const recoil=shot&&shot.age<18 ? -10*Math.cos(shot.age*.9)*Math.pow(.75,shot.age) : ui.demoRecoil;
    const handleY=616+p*48+recoil, trayY=548+p*24;
    const coilJitter=!ui.reduced && sKey==='stiff' && s.charging ? (t%2?1:-1):0;
    coil(c,376+coilJitter,trayY,8,handleY-trayY,sKey);
    box(c,367,trayY-1,18,3,1,colors.laneEdge);
    box(c,362+tremor,handleY,28,12,4,perfect?colors.jackpot:'#E6E9FF');
    if(handleY+12>640) box(c,362,636,28,4,1,colors.text);
    line(c,368+tremor,handleY+6,384+tremor,handleY+6,rgba(colors.bgTop,.45));
  }

  function panel(c,s,ui,fx) {
    const shot=s.shot, p=s.payout, hit=fresh(fx,'peg_hit'), mult=fresh(fx,'mult_land');
    if(!shot&&!p) return;
    if(shot){
      const bump=hit&&hit.age<4 ? 1+.12*Math.sin(hit.age*Math.PI/4) : 1;
      box(c,150,84,180,32,16,rgba(colors.ink,.7),shot.tier?combo(shot.tier):rgba(colors.text,.2),2);
      label(c,number(shot.pts),164,109,32*bump,colors.text,'left',{max:99,minSize:25});
      const gold=fresh(fx,'gold');
      const bounce=mult && mult.age<12 ? mult.e.vault?2:1.6 : gold&&gold.age<20 ? 1+.5*(1-gold.age/20):1;
      const multValue=Math.max(s.stageMult,shot.liveMult-(fx?fx.pendingMult():0));
      label(c,'×'+number(multValue),316,109,31*Math.min(bounce,ui.reduced?1.15:1.35),colors.jackpot,'right',{max:65,minSize:25});
      return;
    }
    const n=p.pins.length*p.spacing, elapsed=p.elapsed;
    const first=elapsed>=n, second=elapsed>=n+20, last=elapsed>=n+40;
    box(c,150,84,180,32,16,rgba(colors.ink,.85),
      second&&p.jackpot || first&&p.mult>=4 ? colors.jackpot : rgba(colors.text,.3),2);
    const pop=fresh(fx,'payout_pop');
    label(c,number(p.pts),162,110,pop&&pop.age<3?31:27,colors.text,'left',{max:70,minSize:23});
    if(first) label(c,'×'+number(p.mult),260,109,26+5*Math.max(0,1-(elapsed-n)/20),p.mult>=4?colors.jackpot:colors.text,'right',{max:52,minSize:20});
    if(second) label(c,'×'+number(p.bucketSum),321,109,26+5*Math.max(0,1-(elapsed-n-20)/20),p.jackpot?colors.jackpot:colors.text,'right',{max:52,minSize:20});
    if(last) {
      const a=clamp((elapsed-n-40)/30,0,1), ease=a*a;
      label(c,'+'+number(p.score),240+24*ease,152-44*ease,35-8*ease,colors.jackpot,'center',{outline:colors.ink,max:150,minSize:24});
    }
  }

  function drawBalls(c,s,ui,fx,t) {
    if(s.state==='AIM') {
      const p=Math.max(s.power,ui.demoPower);
      ball(c,s.pick.ball,376,540+p*24,JD.BALLS[s.pick.ball].r,{});
    }
    if(s.launch) {
      const tint=s.launch.perfect?colors.jackpot:colors.text;
      const tail=ui.reduced?4:6;
      for(let i=tail;i>0;i--){
        if(s.launch.elapsed<=i) continue;
        const q=launchPosition(s.launch.elapsed-i);
        circle(c,q[0],q[1],8*(1-i/(tail+2)),rgba(tint,.5*(1-i/(tail+1))));
      }
      const q=launchPosition(s.launch.elapsed);
      ball(c,s.launch.ball,q[0],q[1],JD.BALLS[s.launch.ball].r,{spin:s.launch.spin,time:t});
    }
    if(!s.shot) return;
    const tier=s.shot.tier,tint=combo(tier);
    s.balls.forEach((b,i)=>{
      if(b.done) return;
      const warp=fresh(fx,'warp',i);
      const warpAge=warp?warp.age:Infinity;
      let x=b.x,y=b.y,r=b.r;
      if(warpAge<4){x=warp.e.x;y=warp.e.y;r*=1-warpAge/4;}
      else if(warpAge<8){x=warp.e.ox;y=warp.e.oy;r*=.25+(warpAge-4)*.1875;}
      const birth=fx&&fx.births[i];
      if(birth!=null&&t-birth<8) r*=.6+.4*(t-birth)/8;
      const tail=fx&&fx.trails[i];
      if(tail&&warpAge>=8) {
        const len=Math.min(tail.length,ui.reduced?4:8+3*tier);
        const a=tier===0?.35:.4+.1*tier;
        for(let j=len-1;j>=0;j--){
          const past=tail[tail.length-1-j], fraction=1-j/(len+1);
          circle(c,past.x,past.y,2+(r-2)*fraction,rgba(tint,a*fraction*.6));
        }
      }
      if(tier>=3) glow(c,x,y,r*2.2,tint,.35);
      ball(c,s.shot.ball,x,y,r,{cracked:s.shot.cracked,spin:s.shot.spin,time:t});
      if(i===0&&s.shot.hits>0){
        const n=number(s.shot.hits), hit=fresh(fx,'peg_hit');
        const size=(11+2*tier)*(hit&&hit.age<4?1+(ui.reduced?.15:.3)*(1-hit.age/4):1);
        box(c,x+3,y-28,9+n.length*(size*.65),size+2,8,rgba(tier?combo(tier):colors.lane,.91));
        label(c,n,x+7,y-27+size,size,tier?colors.ink:colors.text,'left');
      }
    });
  }

  function hud(c,s) {
    const p=s.payout, a=p?clamp((p.elapsed-(p.duration-30))/30,0,1):0;
    const displayed=s.stageScore+(p?p.score*a:0);
    const win=displayed>=s.target;
    const progressColor=win?colors.success:colors.jackpot;
    const ballsColor=s.ballsLeft===1?colors.danger:colors.text;
    box(c,8,6,342,76,13,'#151A3E','#3F4879',1.5);
    line(c,267,15,267,66,rgba(colors.laneEdge,.55));
    label(c,(s.endless?'무한 ':'')+s.stage+'단계',19,23,21,s.endless?colors.jackpot:colors.textDim,'left',{max:126});
    label(c,'목표 점수',253,23,20,colors.textDim,'right');
    label(c,number(displayed)+' / '+number(s.target),19,64,41,win?colors.success:colors.text,'left',{max:236,minSize:39});
    label(c,'구슬',309,23,20,colors.textDim);
    label(c,number(s.ballsLeft),300,64,40,ballsColor);
    if (s.pick.ball) ball(c,s.pick.ball,329,50,9,{});
    box(c,19,74,234,4,2,rgba(colors.text,.16));
    box(c,19,74,234*clamp(displayed/s.target,0,1),4,2,progressColor);
    if (!s.shot && !s.payout) {
      label(c,'×'+number(s.stageMult),15,114,34,s.stageMult>=4?colors.jackpot:colors.text,'left',{outline:colors.ink,max:90,minSize:29});
    }
  }

  function tutorial(c,s,ui,fx,t) {
    if(s.stage!==1||s.state!=='AIM') return;
    if(ui.tutorialSeen && !s.charging) return;
    const change=ui.chargeAge<6 ? ui.chargeAge/6 : 1;
    const nudge=pulse(ui.age-300,24);
    const scale=!ui.reduced&&ui.age>=300&&(ui.age-300)%600<24?1+.3*nudge:1+.12*pulse(t,30);
    const cancelled=fresh(fx,'charge_cancel');
    box(c,29,121,302,60,10,rgba(colors.ink,.9),colors.laneEdge);
    if(s.charging) {
      label(c,s.perfect?'지금 떼기!':'금색에서 떼기',180,159,28+2*change,s.perfect?colors.jackpot:colors.text,'center');
    } else {
      const twitch=cancelled&&cancelled.age<30&&!ui.reduced?4*Math.sin(cancelled.age):0;
      label(c,'길게 눌러 발사',180+twitch,146,24*scale,colors.text,'center');
      label(c,'금색 구간에서 손을 떼세요',180,171,22,colors.jackpot,'center',{body:true,max:285,minSize:21});
    }
    if(s.charging) return;
    const cycle=(t+12)%90, down=cycle<6?cycle/6:cycle<60?1:cycle<66?(66-cycle)/6:0;
    const y=430+4*down;
    const ring=cycle<6?cycle/6:(cycle%20)/20;
    if(cycle<66) circle(c,180,y,10+12*ring,null,rgba(colors.text,.65*(1-ring)),2);
    c.save(); c.translate(180,y); c.rotate(-.24);
    box(c,-5,0,14,30,7,rgba(colors.text,.9),colors.ink,1);
    circle(c,1,0,9,rgba(colors.text,.9),colors.ink,1);
    box(c,-5,0,12,14,4,'#EFF1FC'); c.restore();
    if(cycle>=6&&cycle<60){
      circle(c,180,y-27,14,rgba(colors.ink,.9),colors.textDim,1);
      c.beginPath(); c.arc(180,y-27,11,-Math.PI/2,-Math.PI/2+twoPi*(cycle-6)/54);
      c.strokeStyle=ui.demoPower>=s.spring.perfectLo?colors.jackpot:colors.combo1; c.lineWidth=3; c.stroke();
    }
  }

  JD.createRenderer = function (canvas) {
    const c=canvas.getContext('2d');
    return function draw(s,ui,fx,t) {
      const rect=canvas.getBoundingClientRect(), dpr=Math.min(window.devicePixelRatio||1,2);
      const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
      if(canvas.width!==w||canvas.height!==h) { canvas.width=w;canvas.height=h; }
      c.setTransform(w/392,0,0,h/640,0,0);
      background(c,s,fx);
      c.save();
      if(fx) fx.world(c,s,ui);
      buckets(c,s,ui,fx,t,true);
      buckets(c,s,ui,fx,t,false);
      lane(c,s,ui,fx,t);
      if(JD.drawBoardObjects) JD.drawBoardObjects(c,s,ui,fx,t);
      panel(c,s,ui,fx);
      drawBalls(c,s,ui,fx,t);
      if(fx) fx.draw(c,s,ui);
      c.restore();
      if(fx) fx.overlay(c,s,ui);
      hud(c,s);
      if(JD.drawStageHint) JD.drawStageHint(c,s,ui,fx,t);
      tutorial(c,s,ui,fx,t);
      if(JD.drawScreens) JD.drawScreens(c,s,ui,fx,t);
      if(JD.drawCardReward) JD.drawCardReward(c,s,ui,fx,t);
    };
  };
})(JD);

(function (JD) {
  'use strict';

  const glows = new Map();
  const pegColors = {
    normal: ['pegNormal', 'pegNormalLit'],
    gold: ['pegGold', 'pegGoldLit'],
    bomb: ['pegBomb', 'pegBombLit']
  };
  const pegFaces = new Map();
  const pegShadows = {normal:'#19478F', gold:'#BB7011', bomb:'#872442'};

  function pegFace(D, type, lit) {
    const key = `${type}:${lit}`;
    if (!pegFaces.has(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 40;
      const ctx = canvas.getContext('2d');
      ctx.scale(2,2);
      const [body, shine] = pegColors[type].map(name=>D.colors[name]);
      const sheen = ctx.createRadialGradient(7,5,0,10,9,9);
      sheen.addColorStop(0,lit?'#FFF':shine);
      sheen.addColorStop(.48,lit?shine:body);
      sheen.addColorStop(1,lit?body:pegShadows[type]);
      D.circle(ctx,10,11,7.5,'#05071E');
      D.circle(ctx,10,9,7,sheen,lit?'#FFF':D.rgba(shine,.7),1);
      pegFaces.set(key,canvas);
    }
    return pegFaces.get(key);
  }

  function glow(D, type, tier) {
    const key = type + ':' + tier;
    if (!glows.has(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 38;
      const sprite = canvas.getContext('2d');
      const tint = type === 'normal' && tier ? D.combo(tier) : D.colors[pegColors[type][1]];
      const radius = type === 'gold' ? 18 : 14;
      const rad = sprite.createRadialGradient(19, 19, 2, 19, 19, radius);
      rad.addColorStop(0, D.rgba(tint, 0.5));
      rad.addColorStop(1, D.rgba(tint, 0));
      sprite.fillStyle = rad;
      sprite.fillRect(0, 0, 38, 38);
      glows.set(key, canvas);
    }
    return glows.get(key);
  }

  function star(ctx, x, y, size, color) {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.24, y - size * 0.24);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x + size * 0.24, y + size * 0.24);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size * 0.24, y + size * 0.24);
    ctx.lineTo(x - size, y);
    ctx.lineTo(x - size * 0.24, y - size * 0.24);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawTerrain(ctx, segments, D) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const [x1, y1, x2, y2] of segments) {
      D.line(ctx, x1, y1, x2, y2, D.colors.terrainEdge, 8);
      D.line(ctx, x1, y1, x2, y2, D.colors.terrain, 5);
      D.line(ctx, x1, y1, x2, y2, 'rgba(255,255,255,.15)', 1);
    }
    ctx.restore();
  }

  function drawPeg(ctx, peg, snapshot, ui, fx, time, D) {
    const hit = D.fresh && D.fresh(fx, 'peg_hit', peg.id);
    const liveHit = hit && hit.age < 8;
    const hitSize = snapshot.ball === 'big' ? 0.6 : 0.4;
    const factor = ui.reduced ? Math.min(hitSize, 0.15) : hitSize;
    const bounce = liveHit ? 1 + factor * Math.sin(Math.PI * hit.age / 8) : 1;
    const tier = peg.tier || (hit && hit.e.tier) || 0;
    const tutorialBomb = snapshot.stage === 1 && peg.id === 3 && !ui.tutorialSeen && snapshot.state === 'AIM';
    const pulse = tutorialBomb ? D.pulse(time, 20) : 0;
    if (peg.lit) ctx.drawImage(glow(D, peg.type, tier), peg.x - 19, peg.y - 19);
    if (tutorialBomb) {
      ctx.save();
      ctx.globalAlpha = 0.18 + 0.32 * pulse;
      ctx.drawImage(glow(D, 'bomb', 0), peg.x - 19, peg.y - 19);
      ctx.restore();
    }
    ctx.drawImage(pegFace(D,peg.type,peg.lit),peg.x-10*bounce,peg.y-9*bounce,20*bounce,20*bounce);
    if (peg.type === 'gold') star(ctx, peg.x, peg.y, 3.3 * bounce, '#FFFFFF');
    if (peg.type === 'bomb') {
      D.circle(ctx, peg.x, peg.y, 3 * bounce, '#5A0F1E');
      D.circle(ctx, peg.x + 1.6, peg.y - 4.5 * bounce, 2, D.rgba('#FFF1B8', 0.42 + 0.58 * D.pulse(time, 10)));
    }
  }

  function drawBumper(ctx, bumper, index, ui, fx, D) {
    const hit = D.fresh && D.fresh(fx, 'bumper_hit', index);
    const recent = hit && hit.age < 8;
    const factor = ui.reduced ? 0.15 : 0.25;
    const r = recent ? 14 * (1 + factor * (1 - hit.age / 8)) : 14;
    D.circle(ctx, bumper.x, bumper.y, r, D.rgba(D.colors.bumper, 0.25), recent ? '#FFFFFF' : D.colors.bumper, 3);
    D.circle(ctx, bumper.x, bumper.y, r - 6, null, D.rgba(D.colors.bumper, 0.45), 1);
    D.circle(ctx, bumper.x, bumper.y, 2.5, D.rgba('#FFFFFF', 0.65));
  }

  function drawBlock(ctx, block, ui, fx, time, D) {
    const C = D.colors;
    const vault = block.kind === 'vault';
    const hit = D.fresh && D.fresh(fx, 'block_hit', block.id);
    const broken = D.fresh && D.fresh(fx, 'block_broken', block.id);
    const breaking = broken && broken.age < 3;
    if (!block.alive && !breaking) return;

    const blinking = hit && hit.age < 4 && hit.e.cause === 'ball';
    const down = blinking && !ui.reduced ? 2 * (1 - hit.age / 4) : 0;
    const x = block.x - block.w / 2;
    const y = block.y - block.h / 2 + down;
    const fill = vault ? C.vault : C.block;
    const stroke = block.hp === 1 ? C.danger : vault ? C.vaultEdge : C.blockEdge;
    D.box(ctx, x, y, block.w, block.h, 4, breaking || blinking ? '#FFFFFF' : fill, stroke, vault ? 3 : 2);
    if (breaking) return;

    if (block.hp <= block.maxHp / 2 || block.hp === 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 2, y + 2, block.w - 4, block.h - 4);
      ctx.clip();
      const count = block.hp === 1 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const left = x + 3 + i * (block.w - 10) / Math.max(1, count - 1);
        const top = y + (i % 2 ? 1 : block.h * .54);
        D.line(ctx, left, top, left + (i % 2 ? -8 : 9), top + block.h * .58, D.rgba(C.blockEdge, 0.72), 1);
        D.line(ctx, left + (i % 2 ? -6 : 5), top + block.h * .35, left + (i % 2 ? -12 : 12), top + block.h * .35,
          D.rgba(C.blockEdge, 0.50), 1);
      }
      ctx.restore();
    }

    const bump = hit && hit.e.cause === 'ball' && hit.age < 8 ? (ui.reduced ? 0.15 : 0.4) * (1 - hit.age / 8) : 0;
    const text = blinking ? '#242447' : '#FFFFFF';
    if (vault) D.label(ctx, 'VAULT', block.x, block.y - 1 + down, 11, text);
    const numberY = block.y + (vault ? 12 : 7) + down;
    D.label(ctx, block.hp, block.x, numberY, (vault ? 16 : 14) * (1 + bump), text);

    const badgeCenter = y + (vault ? -3 : -1);
    const badgeHeight = vault ? 16 : 15;
    const badgeWidth = vault ? 34 : 31;
    if (block.hp === 1 && !ui.reduced) {
      D.box(ctx, block.x - badgeWidth / 2 - 2, badgeCenter - badgeHeight / 2 - 2,
        badgeWidth + 4, badgeHeight + 4, 9, D.rgba(C.jackpot, 0.28 * D.pulse(time, 20)));
    }
    D.box(ctx, block.x - badgeWidth / 2, badgeCenter - badgeHeight / 2, badgeWidth, badgeHeight, badgeHeight / 2, C.jackpot);
    D.label(ctx, vault ? '×+3' : '×+1', block.x, badgeCenter + 4, 11, C.bgBottom);

    if (vault) {
      const w = block.w, h = block.h, perimeter = 2 * (w + h);
      for (let i = 0; i < 3; i++) {
        const p = ((time / 40 + i / 3) % 1) * perimeter;
        let px = x, py = y;
        if (p < w) px += p;
        else if (p < w + h) { px += w; py += p - w; }
        else if (p < 2 * w + h) { px += 2 * w + h - p; py += h; }
        else py += perimeter - p;
        star(ctx, px, py, 2.5, '#FFF1B8');
      }
    }
  }

  function drawGate(ctx, gate, fx, time, D) {
    const passed = D.fresh && D.fresh(fx, 'gate_passed', gate.id);
    if (!gate.alive && (!passed || passed.age >= 4)) return;

    const C = D.colors;
    const color = gate.kind === 'plus' ? C.gatePlus : C.gateMinus;
    const lineColor = gate.alive ? color : '#FFFFFF';
    const { x, y } = gate;
    const edge = JD.CFG.GATE_HALF_W;
    D.line(ctx, x - edge, y, x + edge, y, D.rgba(lineColor, 0.35), 9);
    D.line(ctx, x - edge, y, x + edge, y, D.rgba(lineColor, .7 + .3 * D.pulse(time, 40)), 3);
    for (const direction of [-1, 1]) {
      const flagX = x + direction * edge;
      D.line(ctx, flagX, y - 5, flagX, y + 3, lineColor, 2);
      ctx.beginPath();
      ctx.moveTo(flagX, y - 7);
      ctx.lineTo(flagX - direction * 6, y - 4);
      ctx.lineTo(flagX, y - 1);
      ctx.closePath();
      ctx.fillStyle = lineColor;
      ctx.fill();
    }
    D.box(ctx, x - 14, y - 8, 28, 16, 8, 'rgba(5,6,26,.85)', lineColor, 1);
    D.label(ctx, gate.kind === 'plus' ? '+1' : '−1', x, y + 4, 12, lineColor);
  }

  function drawIron(ctx, group, snapshot, fx, time, D) {
    const broken = D.fresh && D.fresh(fx, 'iron_break', group.id);
    const breaking = broken && broken.age < 3;
    if (!group.alive && !breaking) return;

    const C = D.colors;
    const usable = snapshot.rack.includes('iron');
    const pulse = usable ? D.pulse(time, 40) : 0;
    ctx.save();
    ctx.lineCap = 'round';
    let top = 640, left = 360, right = 0;
    for (const [x1, y1, x2, y2] of group.segs) {
      top = Math.min(top, y1, y2);
      left = Math.min(left, x1, x2);
      right = Math.max(right, x1, x2);
      if (breaking) {
        D.line(ctx, x1, y1, x2, y2, '#FFFFFF', 10);
        continue;
      }
      if (usable) D.line(ctx, x1, y1, x2, y2, D.rgba(C.ironEdge, 0.35 * pulse), 13);
      D.line(ctx, x1, y1, x2, y2, C.ironEdge, 10);
      D.line(ctx, x1, y1, x2, y2, C.ironWall, 7);
      const length = Math.hypot(x2 - x1, y2 - y1);
      for (let offset = 6; offset < length; offset += 12) {
        const t = offset / length;
        D.circle(ctx, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 1.5, C.ironEdge);
      }
    }
    if (!breaking) D.label(ctx, 'IRON', (left + right) / 2, top - 9, 9, C.ironEdge, 'center', { outline: '#0B0E2A' });
    ctx.restore();
  }

  function drawWarp(ctx, hole, time, D) {
    const { x, y } = hole, color = D.colors.warp;
    const grad = ctx.createRadialGradient(x, y, 3, x, y, 22);
    grad.addColorStop(0, D.rgba(color, .30));
    grad.addColorStop(1, D.rgba(color, 0));
    D.circle(ctx, x, y, 22, grad);
    D.circle(ctx, x, y, 10, 'rgba(7,9,32,.84)');
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    [13, 8, 4].forEach((radius, i) => {
      const a = time * Math.PI / 30 + i * 1.6;
      ctx.beginPath();
      ctx.arc(x, y, radius, a, a + Math.PI * (1.6 - i * .14));
      ctx.stroke();
    });
    ctx.restore();
  }

  JD.drawBoardObjects = function (ctx, snapshot, ui, fx, time) {
    const D = JD.Drawing;
    drawTerrain(ctx, snapshot.terrain, D);
    for (const peg of snapshot.pegs) {
      if (peg.alive) {
        const drawn=fx&&fx.pegsPending.has(peg.id)?Object.assign({},peg,{lit:false}):peg;
        drawPeg(ctx, drawn, snapshot, ui, fx, time, D);
      }
    }
    if (snapshot.payout) {
      const { elapsed, spacing, pins } = snapshot.payout;
      for (let i = Math.floor(elapsed / spacing); i < pins.length; i++) {
        if (!pins[i].removed) drawPeg(ctx, Object.assign({ lit: true }, pins[i]), snapshot, ui, fx, time, D);
      }
    }
    snapshot.bumpers.forEach((bumper, i) => drawBumper(ctx, bumper, i, ui, fx, D));
    snapshot.blocks.forEach(block => drawBlock(ctx, block, ui, fx, time, D));
    snapshot.gates.forEach(gate => drawGate(ctx, gate, fx, time, D));
    snapshot.iron.forEach(group => drawIron(ctx, group, snapshot, fx, time, D));
    if (snapshot.warps) snapshot.warps.ins.forEach(hole => drawWarp(ctx, hole, time, D));
  };
}(window.JD));

(function (JD) {
  'use strict';

  const cards = {
    goldPlus: ['골드 러시', '보드마다 금색 핀 +3', '✦', 'jackpot'],
    heavy: ['핀 보너스', '파랑·금색 핀 점수 +10', '✦', 'pegNormal'],
    bombPlus: ['빅뱅', '폭탄 +2, 폭발 반경 +16', '●', 'pegBomb'],
    fever: ['배수 보너스', '시작 배수 +1', '×', 'jackpot'],
    jackpot: ['넓은 잭팟', '×5 착지 칸 너비 +40', '×5', 'jackpot'],
    gate: ['멀티볼', '보드마다 초록 게이트 +1', '+1', 'gatePlus'],
    extra: ['여분 구슬', '단계마다 구슬 +1', '+', 'pegNormal'],
    split: ['분열 발사', '첫 새 핀 충돌에 구슬 +1', '÷', 'text'],
    ballIron: ['철구', '쇠 벽 부수고 블록 피해 2', '', 'iron'],
    ballGlass: ['유리구슬', '12회에 금이 가고 24회에 3개로 분열', '', 'glass'],
    ballBig: ['큰 구슬', '크기가 커서 핀에 더 잘 닿아요', '', 'glass'],
    springSpin: ['회전 스프링', '핀에 닿을 때 선택한 방향으로 휘어요', '', 'spin'],
    springSoft: ['부드러운 스프링', '빠른 충전·넓은 금색 구간 / 낮은 힘', '', 'springSoft'],
    springStiff: ['강한 스프링', '느린 충전·좁은 금색 구간 / 높은 힘·퍼펙트 콤보 +1', '', 'springStiff']
  };

  const stageNames = {
    TUTORIAL:'첫 발사', 'IRON LID':'쇠 덮개', CURVE:'커브', HOURGLASS:'모래시계',
    ZIGZAG:'지그재그', BOWL:'그릇', RING:'고리', VAULT:'금고'
  };
  const previewNames = { 1:'쇠 덮개', 2:'커브 · 게이트', 3:'블록 ×+1 · 워프', 7:'금고 ×+3', 8:'무한 모드' };
  const previewJackpots = { center:'중앙 잭팟', left:'왼쪽 잭팟', right:'오른쪽 잭팟', twin:'잭팟 2곳' };
  const resultStats = [
    ['최고 단계', null], ['최고 발사 점수', 'biggestShot'], ['잭팟', 'jackpots'],
    ['퍼펙트 발사', 'perfects'], ['최고 콤보', 'bestTier'],
    ['맞힌 핀', 'pegsPopped'], ['부순 블록', 'blocksBroken']
  ];

  function wrapLines(ctx, words, maxWidth, size, D) {
    ctx.save();
    ctx.font = '600 ' + size + 'px ' + D.fontFamily;
    const lines = [];
    let current = '';
    for (const word of words.split(' ')) {
      const joined = current ? current + ' ' + word : word;
      if (current && ctx.measureText(joined).width > maxWidth) {
        lines.push(current);
        current = word;
      } else current = joined;
    }
    lines.push(current);
    ctx.restore();
    return lines;
  }

  function preview(s) {
    const next = JD.stageDef(s.stage);
    const current = JD.stageDef(s.stage - 1);
    const suffix = next.buckets === current.buckets ? '' : ' · ' + previewJackpots[next.buckets];
    return '다음 · ' + (previewNames[s.stage] || stageNames[next.name] || next.name) + suffix;
  }

  function rackAfter(rack, id) {
    const next = rack.slice();
    const index = rack.indexOf('normal');
    if (index < 0) next.push(JD.CARD_BALL[id]);
    else next[index] = JD.CARD_BALL[id];
    return next;
  }

  function rackRow(ctx, rack, x, y, gap, r, D) {
    rack.forEach((kind, index) => D.ball(ctx, kind, x + index * gap, y, kind === 'big' ? r * 1.18 : r,
      {cracked: kind === 'glass'}));
  }

  function rackPreview(ctx, rack, id, x, y, width, r, D) {
    const next = rackAfter(rack, id);
    const gap = Math.min(r * 2.7, (width - 32) / (rack.length + next.length));
    const beforeW = (rack.length - 1) * gap;
    const afterW = (next.length - 1) * gap;
    const left = x - (beforeW + afterW + 34) / 2;
    rackRow(ctx, rack, left, y, gap, r, D);
    D.label(ctx, '→', left + beforeW + 17, y + 4.5, 15, D.colors.textDim);
    rackRow(ctx, next, left + beforeW + 34, y, gap, r, D);
  }

  function drawIcon(ctx, id, x, y, r, time, reduced, D) {
    const [, , glyph, token] = cards[id];
    const tint = D.colors[token];
    D.circle(ctx, x, y, r, D.rgba(tint, .13), D.rgba(tint, .6), 1.3);
    if (JD.CARD_BALL[id]) {
      const kind = JD.CARD_BALL[id];
      D.ball(ctx, kind, x, y, Math.min(r * .62, JD.BALLS[kind].r * 2), { cracked:kind === 'glass' });
    } else if (JD.CARD_SPRING[id]) {
      const spring = JD.CARD_SPRING[id];
      const height = r * (reduced ? .95 : .78 + .24 * D.pulse(time,60));
      D.coil(ctx, x, y - height / 2, r * .37, height, spring);
      if (spring === 'spin') D.label(ctx, '⟲', x + r * .57, y - 1, r * .66, tint);
    } else if (id === 'bombPlus') {
      D.circle(ctx, x, y + 3, r * .40, tint);
      D.circle(ctx, x, y + 3, r * .16, '#5A0F1E');
      D.line(ctx, x, y - r * .32, x + r * .19, y - r * .51, D.colors.text, 1.6);
      D.circle(ctx, x + r * .23, y - r * .56, 2, D.colors.jackpot);
    } else {
      D.label(ctx, glyph, x, y + r * .28, r * .91, tint);
    }
  }

  function drawTrajectory(ctx, x, y, D) {
    D.coil(ctx, x - 49, y - 14, 9, 27, 'spin');
    D.label(ctx, '◀', x - 23, y + 5, 12, D.colors.spin);
    ctx.save();
    ctx.strokeStyle = D.colors.spin;
    ctx.lineWidth = 2;
    ctx.setLineDash([3,5]);
    ctx.beginPath();
    ctx.moveTo(x + 47, y - 12);
    ctx.bezierCurveTo(x + 51, y + 1, x + 44, y + 14, x + 5, y + 15);
    ctx.stroke();
    ctx.restore();
    D.ball(ctx, 'normal', x + 45, y - 11, 5, {spin:-1,time:0});
    D.circle(ctx, x + 6, y + 15, 3, D.colors.spin);
  }

  function drawCard(ctx, s, index, ui, time, opts, D) {
    const card = JD.UI.cards(s)[index];
    if (!card) return;
    const id = s.offer[index];
    const [name, detail, , token] = cards[id];
    const { x, y, w, h } = card;
    const C = D.colors;
    const tint = C[token];
    const fixed = s.offer.length === 1;
    const midX = x + w / 2;
    const midY = y + h / 2;
    const focus = opts.focus;
    const age = opts.age;
    const rise = ui.reduced || opts.picked ? 0 : Math.max(0, 1 - age / 12) * 20;
    const scale = opts.picked ? 1 + 0.10 * Math.sin(Math.PI * Math.min(1, age / 12)) : focus ? 1.03 : 1;
    ctx.save();
    ctx.globalAlpha = opts.picked ? 1 - Math.max(0, age - 7) / 5 : Math.min(1, (age + 2) / 8);
    ctx.translate(midX, midY + rise);
    ctx.scale(scale, scale);
    ctx.translate(-midX, -midY);
    const face = ctx.createLinearGradient(0,y,0,y+h);
    face.addColorStop(0,'#252D63');
    face.addColorStop(1,'#121634');
    D.box(ctx, x, y+5, w, h, fixed ? 18 : 14, '#080A20');
    D.box(ctx, x, y, w, h, fixed ? 18 : 14, face, focus ? '#FFFFFF' : tint, focus ? 3 : 1.5);
    D.box(ctx, x+4, y+4, w-8, h-8, fixed ? 15 : 11,
      D.rgba(tint, opts.picked ? .08 + .24 * D.pulse(age,10) : .07));

    if (fixed) {
      drawIcon(ctx, id, midX, y+49, 36, time, ui.reduced, D);
      D.label(ctx, name, midX, y+111, 32, C.text, 'center', {max:w-24,minSize:26});
      const lines = wrapLines(ctx, detail, w-28, 23, D);
      lines.forEach((line, i) => D.label(ctx, line, midX, y+142+i*24, 23, C.text, 'center', {body:true}));
      if (JD.CARD_BALL[id]) rackPreview(ctx, s.fullRack, id, midX, y+191, w-56, 8, D);
      if (JD.CARD_SPRING[id]) drawTrajectory(ctx, midX, y+190, D);
    } else {
      drawIcon(ctx, id, x+32, y+51, 24, time, ui.reduced, D);
      D.label(ctx, name, x+65, y+32, 26, C.text, 'left', {max:w-79,minSize:24});
      const lines = wrapLines(ctx, detail, w-77, 23, D);
      lines.forEach((line, i) => D.label(ctx, line, x+65, y+56+i*22, 23, C.text, 'left', {body:true}));
    }
    ctx.restore();
  }

  function drawCardScreen(ctx, s, ui, t, D) {
    const C = D.colors;
    const fixed = s.offer.length === 1;
    const title = !fixed ? '강화 선택' : JD.CARD_BALL[s.offer[0]] ? '새 구슬' : '새 스프링';
    D.box(ctx, 0, 0, 392, 640, 0, D.rgba(C.ink, .75));
    D.label(ctx, title, 196, 112, 36, fixed ? C.jackpot : C.text);
    D.label(ctx, preview(s), 196, 141, 22, C.textDim, 'center', {max:352,minSize:20});
    for (let i = 0; i < s.offer.length; i++) {
      const age = ui.stateAge - 6 * i;
      if (age >= 0) drawCard(ctx, s, i, ui, t, {focus:ui.focus===i,age}, D);
    }
    if (fixed) D.label(ctx, '카드를 눌러 받기', 196, 477, 23, C.text);
  }

  function drawRatio(ctx, ratio, center, y, time, D) {
    const C = D.colors;
    const w = 240, x = center-w/2;
    const progress = Math.min(w-8, w*ratio/100);
    D.box(ctx, x, y, w, 10, 5, D.rgba(C.text, .14));
    if (ratio >= 80) D.box(ctx, x+progress, y, w-progress, 10, 4, D.rgba(C.danger, .20+.58*D.pulse(time,15)));
    if (progress) D.box(ctx, x, y, progress, 10, 4, C.jackpot);
  }

  function stageLabel(s) {
    return (s.endless ? '무한 ' : '') + s.stage + '단계 · ' + (stageNames[s.stageName] || s.stageName);
  }

  function stageBonus(ctx, s, ui, D) {
    const C = D.colors;
    const value = '+' + D.number(Math.round(s.target/10));
    s.rackIndices.forEach((i, n) => {
      const age = ui.stateAge-6*n;
      const x0 = JD.UI.ballX(s,i);
      if (age < 0 || age >= 32) return;
      if (age < 6) {
        D.ball(ctx, s.fullRack[i], x0, 44, 8 + (ui.reduced ? 0 : age * .28));
        return;
      }
      const p = (age-6)/26, arc = ui.reduced ? 0 : 98 * Math.sin(Math.PI*p);
      D.label(ctx, value, x0+(264-x0)*p, 46-23*p+arc, 15, C.jackpot, 'center', {outline:C.ink});
    });
  }

  function drawBanner(ctx, s, ui, t, D) {
    const C = D.colors;
    const b = s.banner;
    const clear = b.kind === 'clear';
    const allClear = b.kind === 'allclear';
    const flash = ui.reduced ? 0 : (1-D.clamp(ui.stateAge/12,0,1));
    const tint = clear ? C.success : allClear ? C.jackpot : b.ratio >= 80 ? C.danger : C.text;
    const scale = ui.reduced ? 1 : 1-.44*flash + .14*Math.sin(Math.PI*D.clamp(ui.stateAge/14,0,1));
    D.box(ctx, 12, 282, 336, b.kind === 'fail' ? 99 : 77, 18, D.rgba(C.ink,.79), D.rgba(tint,.53), 1.5);
    const title = allClear ? '전 단계 클리어!' : clear ? '단계 클리어!' : b.ratio >= 80 ? '아깝다!' : '구슬 소진';
    D.label(ctx,title,180,326,(allClear ? 40 : clear ? 36 : 34)*scale,tint,'center',{max:312,outline:C.ink});
    if (b.kind === 'fail') {
      D.label(ctx,b.ratio+'%',180,351,22,tint);
      drawRatio(ctx,b.ratio,180,357,t,D);
    } else if (allClear) {
      if (ui.stateAge >= 30) D.label(ctx,'무한 모드 시작',180,353,22,C.text);
      if (flash) D.box(ctx, 3,3,386,634,6,null,D.rgba(C.jackpot, flash*.75),6);
      stageBonus(ctx,s,ui,D);
    } else stageBonus(ctx,s,ui,D);
  }

  function resultLoadout(ctx, r, t, D) {
    const w = (r.rack.length-1)*21+(r.springs.length-1)*29+48;
    const left = 196-w/2;
    rackRow(ctx,r.rack,left,578,21,7,D);
    const springsX = left+(r.rack.length-1)*21+48;
    D.line(ctx,springsX-24,570,springsX-24,586,D.rgba(D.colors.text,.21),1);
    r.springs.forEach((spring,i) => {
      const height = 20 + 2*D.pulse(t,60);
      D.coil(ctx,springsX+29*i,578-height/2,6,height,spring);
    });
  }

  function drawResult(ctx,s,ui,t,D) {
    const r = s.result, C = D.colors;
    const title = r.won ? '전 단계 클리어!' : r.ratio>=80 ? '아깝다!' : '구슬 소진';
    const tint = r.won ? C.jackpot : r.ratio>=80 ? C.danger : C.text;
    const shownScore = Math.round(r.runScore*D.clamp(ui.stateAge/40,0,1));
    D.box(ctx,0,0,392,640,0,D.rgba(C.ink,.9));
    D.label(ctx,title,196,112,40,tint,'center',{max:352,minSize:35});
    D.label(ctx,stageLabel(s)+' · '+r.ratio+'%',196,149,22,C.text,'center',{max:352,minSize:20});
    drawRatio(ctx,r.ratio,196,162,t,D);
    D.label(ctx,'최종 점수',196,211,22,C.textDim);
    D.label(ctx,D.number(shownScore),196,258,50,C.text,'center',{max:344,minSize:38});
    const best = s.practiceStart ? '연습 · '+s.practiceStart+'단계 시작' : ui.newBest ? '최고점 경신!' : '최고점 '+D.number(ui.saved.best);
    D.label(ctx,best,196,287,22,ui.newBest&&!s.practiceStart ? C.jackpot : C.textDim);
    resultStats.forEach(([label,key],i) => {
      const y = 320+i*22;
      const value = key === 'bestTier' ? JD.CFG.COMBO_NAMES[r.bestTier] || '—' : D.number(key ? r[key] : ui.saved.bestStage);
      const emphasis = i===0 && ui.newBestStage && !s.practiceStart;
      const color = key === 'bestTier' ? D.combo(r.bestTier) : emphasis ? C.jackpot : C.text;
      D.label(ctx,label,55,y,20,emphasis ? C.jackpot : C.textDim,'left');
      D.label(ctx,value,337,y,20,color,'right');
    });
    resultLoadout(ctx,r,t,D);
  }

  JD.drawScreens = function (ctx,s,ui,fx,t) {
    const D = JD.Drawing;
    if(s.state === 'BANNER') drawBanner(ctx,s,ui,t,D);
    else if(s.state === 'CARD') drawCardScreen(ctx,s,ui,t,D);
    else if(s.state === 'RESULT') drawResult(ctx,s,ui,t,D);
  };

  JD.drawStageHint = function (ctx,s,ui,fx,t) {
    if(s.stage === 1 || s.state !== 'AIM' || ui.stageAge >= 180 || ui.hintHidden) return;
    const D = JD.Drawing;
    const C = D.colors;
    const direction = s.hint && s.hint.spin === 1 ? '오른쪽' : '왼쪽';
    let text = '잭팟 칸을 노려요';
    if(s.hint && s.hint.ball && s.hint.spring) text = '철구 + '+direction+' 회전';
    else if(s.hint && s.hint.ball) text = '철구로 쇠 벽을 부숴요';
    else if(s.hint && s.hint.spring) text = direction+' 회전으로 휘어요';
    D.box(ctx,29,121,302,66,10,D.rgba(C.ink,.9),C.laneEdge);
    D.label(ctx,stageLabel(s),180,147,25,C.text,'center',{max:288,minSize:22});
    D.label(ctx,text,180,174,22,C.hint,'center',{max:288,minSize:20});
  };

  JD.drawCardReward = function (ctx,s,ui,fx,t) {
    const notice = ui.cardNotice;
    if (!notice || !notice.before.offer) return;
    const D = JD.Drawing;
    const { event, before, age } = notice;
    const id = event.id;
    const index = before.offer.indexOf(id);
    if (index < 0) return;
    if (age < 12) {
      drawCard(ctx,before,index,ui,t,{focus:true,picked:true,age},D);
      return;
    }
    const kind = JD.CARD_BALL[id], spring = JD.CARD_SPRING[id];
    if (!kind && !spring) return;
    const card = JD.UI.cards(before)[index];
    const fixed = before.offer.length === 1;
    const startX = fixed ? card.x+card.w/2 : card.x+32;
    const startY = card.y+(fixed ? 49 : 51);
    const endX = kind ? 329 : 376;
    const endY = kind ? 50 : 583;
    const p = D.clamp((age-12)/20,0,1);
    const land = Math.max(0, age-32);
    const arc = ui.reduced ? 0 : 44*Math.sin(Math.PI*p);
    const x = startX+(endX-startX)*p, y = startY+(endY-startY)*p-arc;
    const trail = D.colors[cards[id][3]];
    if (p > 0 && p < 1) D.line(ctx,x,y,x+Math.sign(startX-endX)*10,y+14,D.rgba(trail,.65),3);
    const bump = p === 1 ? (ui.reduced ? .15 : .4)*Math.max(0,1-land/12) : 0;
    if (kind) D.ball(ctx,kind,x,y,(8+8*(1-p))*(1+bump),{cracked:kind==='glass'});
    else D.coil(ctx,x,y-10,7*(1+bump),20*(1+bump),spring);
    if (p === 1) D.circle(ctx,x,y,9+land*1.5,null,D.rgba(trail,.72*Math.max(0,1-land/12)),2);
  };
}(window.JD));
