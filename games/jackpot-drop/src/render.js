(function (JD) {
  'use strict';

  const colors = {
    bgTop:'#0B0E2A', bgBottom:'#1A1146', lane:'#070920', laneEdge:'#5A62A8',
    pegNormal:'#39A0FF', pegNormalLit:'#BDF3FF', pegGold:'#FFC83D', pegGoldLit:'#FFF1B8',
    pegBomb:'#FF4D6D', pegBombLit:'#FFD0D8', bumper:'#B26BFF', gatePlus:'#3DFFC8', gateMinus:'#FF4D6D',
    block:'#2E3A8C', blockEdge:'#8FA2FF', vault:'#5A3A00', vaultEdge:'#FFC83D',
    terrain:'#3A3F66', terrainEdge:'#C9CEF5', ball:'#FFFFFF', jackpot:'#FFC83D',
    combo1:'#3DD6FF', combo2:'#5CFFB0', combo3:'#FFC83D', combo4:'#FF4DD2',
    springStandard:'#C9CEF5', turret:'#8D96D6', turretLight:'#D7DCFF', turretDark:'#4B5291', turretEdge:'#252A5E',
    ironWall:'#59627E',
    ironEdge:'#C9D1E6', warp:'#9D4DFF', hint:'#FFC83D', glass:'#BDF3FF',
    iron:'#9AA3B8', text:'#FFFFFF', textDim:'#A9B0D6', danger:'#FF6B6B', success:'#5CFFB0', ink:'#05061A'
  };
  const twoPi = 2 * Math.PI;
  const degrees = Math.PI / 180;
  const magazineX = 400;
  const fontFamily='"Arial Black","Segoe UI",system-ui,sans-serif';
  const bodyFamily='"Segoe UI",system-ui,sans-serif';

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const pulse = (time, period) => .5 - .5 * Math.cos(time * twoPi / period);
  const number = n => Math.round(n).toLocaleString('en-US');
  const compactScore = new Intl.NumberFormat('ko-KR', {notation:'compact', maximumSignificantDigits:4});
  const score = n => n < 1000000 ? number(n) : compactScore.format(n);
  const combo = tier => colors['combo' + tier] || colors.text;
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };
  const fresh = (fx, type, id) => fx ? fx.fresh(type, id) : null;
  const viewHeight = 640;
  const ease = progress => progress*progress*(3-2*progress);

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
    const family = opts.body ? bodyFamily : fontFamily;
    c.font = font + size + 'px ' + family;
    while (opts.max && c.measureText(value).width>opts.max && size>(opts.minSize || 11)) {
      c.font=font + (--size) + 'px ' + family;
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
    c.restore();
  }

  function menuButton(c, {x,y,w,h}, text, variant, focused) {
    const radius = h/2;
    if (variant==='outline') {
      box(c,x,y,w,h,radius,null,focused?colors.text:colors.textDim,focused?3:1.5);
      label(c,text,x+w/2,y+h/2+6,16,colors.text);
      return;
    }
    const success=variant==='success';
    const fill=c.createLinearGradient(0,y,0,y+h);
    fill.addColorStop(0,success?'#A1FFD3':'#FFE493');
    fill.addColorStop(1,success?colors.success:colors.jackpot);
    if (focused) box(c,x-4,y-4,w+8,h+12,radius+4,null,colors.text,3);
    box(c,x,y+4,w,h,radius,success?'#2D876B':'#A55826');
    box(c,x,y,w,h,radius,fill,success?'#D6FFEA':'#FFF6CA',1.5);
    label(c,text,x+w/2,y+h/2+7,22,colors.bgBottom,'center',{max:w-24,minSize:17});
  }

  function coin(c,x,y,r) {
    circle(c,x,y,r,'#C78024','#FFF0A5',1);
    circle(c,x,y,r*.72,colors.jackpot);
    circle(c,x-r*.24,y-r*.29,r*.22,'#FFF9DC');
  }

  JD.Drawing={colors,clamp,pulse,number,score,combo,rgba,fresh,box,circle,line,label,glow,ball,coin,menuButton,fontFamily,bodyFamily};
  JD.UI={
    magazine(s) {
      const slots=s.rack.map((_,slot)=>slot).filter(slot=>slot!==s.slot);
      if (s.rack[s.slot]) slots.unshift(s.slot);
      return slots.map((slot,row)=>({slot,y:590-row*52}));
    },
    ballSelectionEnabled:s=>s.endless||s.stage!==1||s.rack.some(kind=>kind!=='normal'),
    magazineTop:340,
    ironAnchor(group) {
      const [x1,y1,x2,y2]=group.segs[0];
      return {x:(x1+x2)/2,y:(y1+y2)/2};
    },
    cards:s=>s.offer?.map((_,i)=>({x:30,y:170+120*i,w:332,h:100})),
    shopPerks:JD.PERK_IDS.map((id,i)=>({x:30,y:184+72*i,w:332,h:64,id})),
    shopRetry:{x:76,y:560,w:240,h:56},
    mapStages:JD.STAGES.map((_,i)=>({x:30+84*(i%4),y:96+84*Math.floor(i/4),w:72,h:72})),
    mapEndless:{x:30,y:540,w:332,h:68},
    mapClose:{x:330,y:2,w:44,h:44},
    result:{x:76,y:470,w:240,h:56},
    resultMap:{x:76,y:540,w:240,h:44}
  };

  function activeCardNotice(s,ui,id) {
    const notice=ui.cardNotice;
    return s.state==='AIM'&&notice?.event.id===id&&notice.before.stageIndex===s.stageIndex?notice:null;
  }

  function ballArrival(s,ui) {
    if (s.state!=='AIM'||ui.reduced) return null;
    if (ui.ironUnlockAge!=null&&ui.ironUnlockAge<32) {
      const slot=s.rack.indexOf('iron');
      if (slot>=0) return {slot,key:'iron',age:ui.ironUnlockAge,startX:180,startY:346};
    }
    const notice=ui.cardNotice;
    if (!notice?.before?.offer||notice.before.stageIndex!==s.stageIndex||notice.age>=40) return null;
    const id=notice.event.id;
    const key=JD.CARD_BALL[id]||(id==='extra'?'normal':null);
    if (!key) return null;
    const slot=s.rack.findIndex((kind,index)=>kind===key&&kind!==notice.before.rack[index]);
    const card=JD.UI.cards(notice.before)[notice.before.offer.indexOf(id)];
    return slot>=0&&card?{slot,key,age:notice.age-8,startX:card.x+34,startY:card.y+49}:null;
  }

  function drawBallArrival(c,arrival,position) {
    if (!arrival||arrival.age<0||position===null) return;
    const {key,age,startX,startY}=arrival;
    const progress=clamp(age/20,0,1);
    const x=startX+(magazineX-startX)*progress;
    const y=startY+(position-startY)*progress-48*Math.sin(Math.PI*progress);
    const color=key==='iron'?colors.ironEdge:key==='normal'?colors.pegNormal:colors.glass;
    const radius=JD.BALLS[key].r;
    if (progress<1) {
      line(c,x-11*progress,y-8,x,y,rgba(color,.72),2);
      ball(c,key,x,y,radius*(1.8-.3*progress),{cracked:key==='glass'});
    } else {
      const land=clamp((age-20)/12,0,1);
      ball(c,key,magazineX,position,radius*1.5*(1.4-.4*land),{cracked:key==='glass'});
      circle(c,magazineX,position,12+land*9,null,rgba(color,.8*(1-land)),2);
    }
  }

  JD.updateCamera = function (s,ui) {
    const bottom=Math.max(0,s.boardH-viewHeight);
    ui.introReveal=bottom>0&&s.state==='AIM'&&ui.stageAge<90&&!ui.hintHidden&&!ui.stageFired;
    if (!bottom) {
      ui.cameraY=0;
      return;
    }
    if (ui.introReveal) {
      const age=ui.reduced?Math.floor(ui.stageAge/30)*30:ui.stageAge;
      ui.cameraY=bottom*(1-ease(clamp((age-30)/60,0,1)));
    } else if (s.state==='FLIGHT') {
      let lowest=null;
      for (const marble of s.balls) {
        if (!marble.done) lowest=Math.max(lowest??0,marble.y);
      }
      if (lowest===null) return;
      const target=clamp(lowest-384,0,bottom);
      if (ui.reduced) {
        if (ui.stateAge%30===0) ui.cameraY=target;
      } else {
        const current=ui.cameraY||0;
        ui.cameraY=current+.12*(target-current);
      }
    } else if (s.state==='LAUNCH'||s.state==='AIM'&&(s.charging||!ui.stageFired)) {
      ui.cameraY=0;
    } else if (s.state==='AIM') {
      const age=ui.reduced?Math.floor(ui.stateAge/30)*30:ui.stateAge;
      const returning=bottom*(1-ease(clamp(age/30,0,1)));
      ui.cameraY=Math.min(ui.cameraY??bottom,returning);
    } else {
      ui.cameraY=bottom;
    }
  };

  function cameraProgress(c,s,ui) {
    if (s.boardH<=viewHeight) return;
    const scale=600/s.boardH;
    box(c,2,20,4,600,2,rgba(colors.text,.25));
    box(c,2,20+(ui.cameraY||0)*scale,4,viewHeight*scale,2,rgba(colors.text,.6));
    circle(c,4,20+s.landY*scale,3,colors.jackpot);
  }

  function background(c,s,fx) {
    const bg=c.createLinearGradient(0,0,0,640);
    bg.addColorStop(0,colors.bgTop); bg.addColorStop(1,colors.bgBottom);
    c.fillStyle=bg; c.fillRect(0,0,440,640);
    const tier = s.shot ? s.shot.tier : fx ? fx.hotTier : 0;
    if (tier>=3) {
      const heat=c.createLinearGradient(0,0,0,410);
      heat.addColorStop(0,rgba(combo(tier),.06*(s.shot ? 1 : fx.heat)));
      heat.addColorStop(1,rgba(combo(tier),0)); c.fillStyle=heat; c.fillRect(0,0,440,410);
    }
    for(let x=0;x<440;x+=40) line(c,x+.5,0,x+.5,640,rgba(colors.text,.04));
    for(let y=0;y<640;y+=40) line(c,0,y+.5,440,y+.5,rgba(colors.text,.04));
  }

  function roofFlash(s,fx,left,right) {
    let strength=0;
    for (const group of s.iron) {
      if (group.alive) continue;
      const hit=fresh(fx,'iron_break',group.id);
      if (!hit||hit.age>=12) continue;
      const [x1,,x2]=group.segs[0];
      if (Math.max(x1,x2)>left&&Math.min(x1,x2)<right) {
        strength=Math.max(strength,1-hit.age/12);
      }
    }
    return strength;
  }

  function buckets(c,s,ui,fx,t,beam) {
    const offset=s.boardH-640;
    if ((ui.cameraY||0)+640<offset+(beam?380:580)) return;
    c.save();
    c.translate(0,offset);
    const notice=activeCardNotice(s,ui,'jackpot');
    const old=notice?.before.buckets.x;
    const widen=notice&&!ui.reduced?ease(clamp(notice.age/12,0,1)):1;
    const x=widen<1?s.buckets.x.map((edge,i)=>old[i]+(edge-old[i])*widen):s.buckets.x;
    const tutorial=!s.endless&&s.stage===1&&!ui.tutorialSeen;
    s.buckets.mult.forEach((mult,i)=>{
      const left=x[i], width=x[i+1]-left, center=left+width/2;
      const landing=fresh(fx,'ball_landed',i);
      const jackpot=mult===5;
      if(beam) {
        if(!jackpot) return;
        const g=c.createLinearGradient(0,380,0,600);
        const ambient=(.12+.10*pulse(t,40))*(tutorial?1.5:1)*(1+ui.slowBlend);
        const roof=roofFlash(s,fx,left,left+width);
        const alpha=landing&&landing.age<20?.5:ambient+(.56-ambient)*roof;
        g.addColorStop(0,rgba(colors.jackpot,0)); g.addColorStop(1,rgba(colors.jackpot,alpha));
        c.fillStyle=g; c.fillRect(left,380,width,220);
        return;
      }
      if(jackpot) {
        box(c,left+2,600,width-4,40,3,rgba(colors.jackpot,.35+.25*pulse(t,40)),rgba(colors.jackpot,.4),10);
        box(c,left+2,600,width-4,40,3,null,colors.jackpot,2);
        const flash=(ui.introReveal||ui.stageAge<30) && ui.stageAge%10<4 || landing && landing.age<30 && landing.age%10<4;
        if (flash) box(c,left+2,601,width-4,38,3,rgba(colors.text,.45));
        label(c,'×5',center,width>=56?620:628,width>=56?24:29,colors.bgBottom);
        if(width>=56) label(c,'JACKPOT',center,630,10,colors.bgBottom);
        for(let k=0;k<6;k++) {
          c.beginPath(); c.ellipse(center+(k%3-1)*9+(k>=3?3:0),637-(k>=3?3:0),5,2.3,0,0,twoPi);
          c.fillStyle=k>=3?'#FFED9C':colors.jackpot; c.fill();
        }
        for(let k=0;k<3;k++){
          const lead=((t/120+k/3)%1);
          circle(c,left+5+lead*(width-10),592+2*Math.sin(lead*twoPi+k),1.3,rgba(colors.jackpot,.45+.55*pulse(t+k*20,40)));
        }
        if(t%60<10) circle(c,center+9,632,2,rgba(colors.text,1-(t%60)/10));
        if(ui.introReveal||!offset&&ui.stageAge<60) {
          const cueY=584+(ui.reduced?0:4*Math.sin(t*Math.PI/20));
          const cueX=clamp(center,40,320);
          label(c,'▼ JACKPOT',cueX,cueY,14,colors.jackpot,'center',
            {outline:colors.ink,max:Math.min(94,2*cueX-6,714-2*cueX),minSize:11});
        }
      } else {
        box(c,left+2,600,width-4,40,0,rgba(colors.text,.04));
        label(c,'×'+mult,center,627,21,colors.textDim);
        if(landing && landing.age<12) box(c,left+2,600,width-4,40,0,rgba(colors.text,.3*(1-landing.age/12)));
      }
      if(i>0) box(c,left-2,600,4,40,0,colors.lane);
    });
    c.restore();
  }

  function dashed(c,x,y,xx,yy,tint,width=1.5) {
    c.save();
    c.setLineDash([4,6]);
    line(c,x,y,xx,yy,tint,width);
    c.restore();
  }

  function visibleZone(s,ui) {
    const zone=s.zone;
    if (!zone||(s.state!=='AIM'&&!s.launch)) return null;
    if (!ui.zoneFrom||ui.reduced||ui.zoneAge>=8) return zone;
    const progress=ease(clamp(ui.zoneAge/8,0,1));
    const shown={kind:zone.kind};
    for (const key of ['x','y','center','lo','hi']) shown[key]=ui.zoneFrom[key]+(zone[key]-ui.zoneFrom[key])*progress;
    return shown;
  }

  function drawZone(c,s,zone,fx) {
    const {x,y}=JD.CANNON;
    const radius=Math.hypot(zone.x-x,zone.y-y);
    if (!(radius>0)) return;
    const mark=fresh(fx,'charge_zone');
    const fired=fresh(fx,'shot_fired');
    const flash=s.charging&&s.perfect&&mark?.age<6 ? 1-mark.age/6 : s.launch?.perfect&&fired?.age<10 ? 1-fired.age/10 : 0;
    c.beginPath();
    c.moveTo(x,y);
    c.arc(x,y,radius,Math.PI/2-zone.hi*degrees,Math.PI/2-zone.lo*degrees);
    c.closePath();
    c.fillStyle=rgba(colors.jackpot,.16+.27*flash);
    c.fill();
    const center=zone.center*degrees;
    dashed(c,x,y,x+Math.sin(center)*radius,y+Math.cos(center)*radius,rgba(colors.jackpot,.35+.4*flash));
  }

  function drawZoneLabel(c,s,ui,zone) {
    const top=ui.cameraY||0;
    if (zone.y<top+45) return;
    const {x,y}=JD.CANNON;
    let labelY=clamp(zone.y-14,top+56,top+613);
    let labelX=zone.x;
    if (zone.y>top+627) labelX=x+(labelY-y)*Math.tan(zone.center*degrees);
    if (zone.kind==='guide') {
      // Keep the tutorial's centered placard clear of the nearby target tag.
      labelX=x+70;
      labelY=clamp(zone.y-64,top+56,top+613);
    } else if (zone.kind==='iron'&&zone.y<=top+627) {
      labelX+=zone.x<180?84:-84;
      labelY=clamp(zone.y-25,top+56,top+613);
    } else if ((zone.kind==='block'||zone.kind==='vault')&&zone.y<=top+627) {
      const target=s.blocks.find(block=>block.alive&&block.x===s.zone.x&&block.y===s.zone.y);
      if (target) labelY=clamp(zone.y-target.h/2-14,top+56,top+613);
    } else if (zone.kind==='jackpot'&&(ui.introReveal||ui.stageAge<60)) {
      labelY=Math.min(labelY,zone.y-36);
    }
    label(c,'▶ '+zone.kind.toUpperCase(),clamp(labelX,42,318),labelY,11,colors.jackpot,'center',
      {outline:colors.ink,outlineWidth:2.5,max:88});
  }

  const easeOut=progress=>1-Math.pow(1-clamp(progress,0,1),3);
  const retractedBarrel=ticks=>-8*easeOut(ticks/JD.CANNON.load);
  const turretRadius=13;
  const barrelHalfWidth=5;
  const turretJoin=Math.sqrt(turretRadius**2-barrelHalfWidth**2);
  const turretArc=Math.atan2(turretJoin,barrelHalfWidth);

  function cannonPose(s,ui,fx) {
    const aiming=s.state==='AIM';
    const cancelled=fresh(fx,'charge_cancel');
    const demo=aiming&&!s.charging&&!s.endless&&s.stage===1&&!ui.tutorialSeen&&!ui.reduced;
    const cycle=ui.age%90;
    const {load,swing,dwell}=JD.CANNON;
    const demoHold=demo&&cycle>=6&&cycle<60
      ? Math.min(cycle-6,load)+Math.max(0,cycle-6-load)*(swing*2+dwell)/(54-load)
      : 0;
    const ticks=s.charging?s.chargeTicks:demoHold;
    const launchTick=s.launch?.elapsed??(demo&&cycle>=60&&cycle<66?1+2*(cycle-60):0);
    const returnAngle=(s.lastAngle??0)*(1-easeOut(s.stateElapsed/8));
    const aim=s.launch?.angle??(demo?JD.aimAngle(ticks):aiming&&!s.charging&&!ui.reduced?returnAngle:s.angle);
    let barrel=28,body=0,loadFlash=0,muzzleFlash=-1;
    if (launchTick) {
      barrel+=launchTick<=9?-8+11*(launchTick/9)**2:12-launchTick;
      body=ui.reduced?0:-3*(1-easeOut((launchTick-1)/8));
      if (launchTick>=10) muzzleFlash=clamp((launchTick-10)/2,0,1);
    } else if (ticks>0) {
      barrel+=retractedBarrel(ticks);
      if (ticks>=load&&ticks<load+4) loadFlash=1-(ticks-load)/4;
      if (!ui.reduced) body=ticks<=load?Math.max(0,1-(ticks-1)/4):.5*Math.sin((ticks-load)*twoPi/3);
    } else if (aiming&&cancelled?.age<6) {
      barrel+=retractedBarrel(cancelled.e.ticks)*(1-easeOut(cancelled.age/6));
    }
    return {aim,barrel,body,loadFlash,muzzleFlash};
  }

  function drawTurretMount(c,x,y) {
    c.beginPath();
    c.moveTo(x-20,y-14);
    c.quadraticCurveTo(x-20,y-16,x-18,y-16);
    c.lineTo(x+18,y-16);
    c.quadraticCurveTo(x+20,y-16,x+20,y-14);
    c.lineTo(x+20,y-2);
    c.quadraticCurveTo(x+20,y,x+18,y);
    c.lineTo(x+17,y);
    c.quadraticCurveTo(x+15,y,x+15,y-2);
    c.lineTo(x+15,y-12);
    c.lineTo(x-15,y-12);
    c.lineTo(x-15,y-2);
    c.quadraticCurveTo(x-15,y,x-17,y);
    c.lineTo(x-18,y);
    c.quadraticCurveTo(x-20,y,x-20,y-2);
    c.closePath();
    c.fillStyle=colors.lane;
    c.fill();
    c.strokeStyle=colors.laneEdge;
    c.lineWidth=1.5;
    c.stroke();
  }

  function turretOutline(barrel) {
    const shape=new Path2D();
    shape.arc(0,0,turretRadius,turretArc,Math.PI-turretArc,true);
    shape.lineTo(-barrelHalfWidth,barrel-5);
    shape.lineTo(-6,barrel-5);
    shape.arcTo(-6,barrel,-4,barrel,2);
    shape.lineTo(4,barrel);
    shape.arcTo(6,barrel,6,barrel-2,2);
    shape.lineTo(6,barrel-5);
    shape.lineTo(barrelHalfWidth,barrel-5);
    shape.lineTo(barrelHalfWidth,turretJoin);
    shape.closePath();
    return shape;
  }

  function drawCannon(c,s,ui,fx,t) {
    const {x,y}=JD.CANNON;
    const aiming=s.state==='AIM';
    const {aim,barrel,body,loadFlash,muzzleFlash}=cannonPose(s,ui,fx);
    const angle=aim*degrees;
    const dx=Math.sin(angle),dy=Math.cos(angle);
    const perfect=s.launch?.perfect??(aiming&&JD.inZone(s.zone,aim));
    const muzzle=body+barrel;
    if (aiming) {
      dashed(c,x+dx*muzzle,y+dy*muzzle,x+dx*(muzzle+90),y+dy*(muzzle+90),
        rgba(perfect?colors.jackpot:colors.text,.5),1.8);
    }
    drawTurretMount(c,x,y);
    if (s.lastAngle!==null) {
      const last=s.lastAngle*degrees;
      const lastX=Math.sin(last),lastY=Math.cos(last);
      line(c,x+lastX*17.5,y+lastY*17.5,x+lastX*22.5,y+lastY*22.5,rgba(colors.text,.6),2);
    }

    const shape=turretOutline(barrel);
    const headX=x+dx*body,headY=y+dy*body;
    c.save();
    c.translate(headX,headY);
    c.rotate(-angle);
    c.save();
    c.translate(-3*dx,3*dy);
    c.fillStyle='rgba(0,0,0,.3)';
    c.fill(shape);
    c.restore();
    const metal=c.createLinearGradient(-turretRadius,0,turretRadius,0);
    metal.addColorStop(0,colors.turretLight);
    metal.addColorStop(.5,colors.turret);
    metal.addColorStop(1,colors.turretDark);
    c.fillStyle=metal;
    c.fill(shape);

    const zoneEntry=fresh(fx,'charge_zone');
    const bandAlpha=aiming&&!s.charging&&!ui.reduced?.7+.3*pulse(t,40)
      : perfect&&zoneEntry?.age<6?.75+.25*(1-zoneEntry.age/6):1;
    c.save();
    c.clip(shape);
    c.fillStyle=rgba(perfect?colors.jackpot:colors.turretDark,bandAlpha);
    c.fillRect(-barrelHalfWidth,(turretJoin+barrel-5)/2-2,barrelHalfWidth*2,4);
    c.fillStyle=colors.turretLight;
    c.fillRect(-6,barrel-5,12,5);
    if (loadFlash) {
      c.fillStyle=rgba(colors.text,loadFlash);
      c.fillRect(-6,barrel-5,12,5);
    }
    c.restore();
    c.strokeStyle=colors.turretEdge;
    c.lineWidth=2;
    c.stroke(shape);

    const key=s.launch?.balls[0]??(aiming?s.ball:null);
    if (key) {
      const radius=JD.BALLS[key].r;
      c.save();
      c.beginPath();
      c.rect(-radius-2,barrel,radius*2+4,radius+2);
      c.clip();
      ball(c,key,0,barrel-1,radius);
      c.restore();
    }
    if (muzzleFlash>=0) {
      circle(c,0,barrel,4+10*muzzleFlash,rgba(colors.text,1-muzzleFlash));
    }
    c.restore();
    circle(c,x,y,3,colors.turretEdge);
    c.beginPath();
    c.ellipse(headX-5,headY-5,4,2,0,0,twoPi);
    c.fillStyle=rgba(colors.text,.35);
    c.fill();
  }

  function drawWallSprings(c,s,ui,fx,t) {
    for (const side of ['L','R']) {
      const hit=fresh(fx,'wall_spring',side);
      for (const [y1,y2] of s.springs) {
        const age=hit&&hit.e.y>=y1&&hit.e.y<=y2?hit.age:Infinity;
        const width=6-(!ui.reduced&&age<8?3*(1-age/8):0);
        const left=side==='L';
        const x=left?0:360-width;
        box(c,x,y1,width,y2-y1,2,rgba(colors.springStandard,.8));
        c.beginPath();
        for (let turn=0;turn<=6;turn++) {
          const depth=(turn%2?.65:.25)*width;
          const coilX=left?x+depth:x+width-depth;
          const y=y1+4+turn*(y2-y1-8)/6;
          if (turn===0) c.moveTo(coilX,y);
          else c.lineTo(coilX,y);
        }
        c.strokeStyle=rgba(colors.lane,.72);
        c.lineWidth=1.5;
        c.stroke();
        const edge=left?x+width:x;
        line(c,edge,y1,edge,y2,rgba(colors.text,age<8?1:.6+.4*pulse(t,40)),2);
      }
    }
  }

  function drawMagazine(c,s,ui,t,animation,fx,arrival) {
    const slots=JD.UI.magazine(s);
    const start=animation.from;
    const stage=s.mode+':'+s.stage+':'+s.attempt;
    const key=stage+':'+slots.map(({slot})=>s.rackIndices[slot]).join(',');
    if (key!==animation.key) {
      animation.key=key;
      animation.from=new Map();
      if (animation.stage===stage) {
        const progress=clamp((t-animation.at)/6,0,1);
        for (const [id,target] of animation.targets) {
          const from=start.get(id)??target;
          animation.from.set(id,from+(target-from)*progress);
        }
      }
      animation.stage=stage;
      animation.at=t;
      animation.targets=new Map(slots.map(({slot,y})=>[s.rackIndices[slot],y]));
    }

    const top=JD.UI.magazineTop;
    box(c,360,top,80,628-top,0,rgba(colors.lane,.6));
    line(c,360.5,top,360.5,628,colors.laneEdge);
    const ready=s.state==='AIM'&&!s.charging;
    const progress=ui.reduced?1:clamp((t-animation.at)/6,0,1);
    const canPick=JD.UI.ballSelectionEnabled(s);
    const hint=ready&&canPick&&!ui.stageFired?s.hint?.ball:null;
    const last=ready&&slots.length===1;
    const loadColor=last&&Math.floor(t/15)%2?colors.danger:colors.text;
    c.save();
    c.globalAlpha=ready?1:.5;
    for (let i=0;i<Math.min(5,s.fullRack.length);i++) {
      const y=590-i*52;
      const slot=slots[i]?.slot;
      const selected=canPick&&slot!==undefined&&slot===s.slot;
      const warning=i===0&&last;
      const matchingHint=slot!==undefined&&hint===s.rack[slot];
      const edge=matchingHint?rgba(colors.hint,.64+.36*pulse(t,20)):warning||selected?loadColor:rgba(colors.laneEdge,.63);
      box(c,magazineX-20,y-22,40,44,9,selected?'#252947':'#10152E',edge,matchingHint||warning||selected?2:1);
      if (selected) {
        label(c,'◀',magazineX-22,y+4,11,loadColor);
        label(c,'장전',magazineX,y-11,10,loadColor);
      }
    }
    const picked=fresh(fx,'ball_picked');
    let landingY=null;
    for (const {slot,y} of slots) {
      const id=s.rackIndices[slot];
      const kind=s.rack[slot];
      const from=animation.from.get(id)??y;
      const spot=from+(y-from)*progress;
      const dy=slot===s.slot&&canPick?3:0;
      const bump=picked?.age<6&&slot===picked.e.slot&&!ui.reduced?1+.12*Math.sin(Math.PI*picked.age/6):1;
      if (slot===arrival?.slot) landingY=spot+dy;
      else ball(c,kind,magazineX,spot+dy,JD.BALLS[kind].r*1.5*bump,{cracked:kind==='glass'});
    }
    c.restore();
    label(c,slots.length+'/'+s.fullRack.length,magazineX,628,12,last?colors.danger:colors.textDim);
    return landingY;
  }

  function stageIntro(s) {
    const title=(s.endless?'ENDLESS ':'STAGE ')+s.stage+' · '+s.stageName;
    const hint=s.hint?.ball==='iron'?'IRON BALL FIRST · OPEN THE JACKPOT':'GET THE JACKPOT';
    return [title,hint];
  }

  function drawStageIntro(c,[title,hint],y) {
    box(c,17,y-20,326,44,8,rgba(colors.ink,.68));
    label(c,title,180,y,18,colors.text,'center',{max:310});
    label(c,hint,180,y+19,14,colors.hint,'center',{max:310});
  }

  function aimMessages(s,ui,fx) {
    if (s.state!=='AIM') return [];
    if (s.charging) return ['RELEASE IN GOLD!'];
    if (fresh(fx,'charge_cancel')?.age<30) return ['HOLD!'];
    const first=!s.endless&&s.stage===1;
    if (first&&!ui.tutorialSeen) return ['HOLD','release in GOLD · aim for JACKPOT ×5'];
    if (first||ui.stageAge>=90||ui.hintHidden||ui.introReveal) return [];
    return stageIntro(s);
  }

  function drawHand(c,x,y,scale,angle) {
    c.save();
    c.translate(x,y); c.scale(scale,scale); c.rotate(angle);
    box(c,-5,0,14,30,7,rgba(colors.text,.9),colors.ink);
    circle(c,1,0,9,rgba(colors.text,.9),colors.ink);
    box(c,-5,0,12,14,4,'#EFF1FC');
    c.restore();
  }

  function drawAim(c,s,ui,fx,t) {
    const messages=aimMessages(s,ui,fx);
    if (messages.length===1) {
      const cancelled=messages[0]==='HOLD!';
      const wiggle=cancelled&&!ui.reduced?4*Math.sin(ui.stateAge*1.7):0;
      label(c,messages[0],180+wiggle,136,cancelled?20:24,!cancelled&&s.perfect?colors.jackpot:colors.text,
        'center',{outline:colors.ink,max:326});
      return;
    }
    if (!s.endless&&s.stage===1&&s.state==='AIM') {
      if (ui.tutorialSeen) {
        label(c,'HOLD',216,47,12,colors.text,'center',{outline:colors.ink});
        drawHand(c,243,44,.34,-Math.PI*.36);
        return;
      }
      const scale=ui.reduced?1:1+.12*pulse(t,30);
      const nudge=(ui.age-300)%600;
      const bump=ui.age>=300&&nudge<15&&!ui.reduced?1+.16*Math.sin(nudge*Math.PI/15):1;
      box(c,17,100,326,53,8,rgba(colors.ink,.63));
      label(c,messages[0],180,124,33*scale*bump,colors.text,'center',{outline:colors.ink,max:324});
      label(c,messages[1],180,146,14,colors.jackpot,'center',{body:true,max:312});
      const cycle=ui.age%90;
      const down=ui.reduced?0:cycle<6?cycle/6:cycle<60?1:cycle<66?(66-cycle)/6:0;
      const y=430+4*down;
      const ring=cycle<6?cycle/6:(cycle%20)/20;
      if (!ui.reduced&&cycle<66) circle(c,180,y,10+12*ring,null,rgba(colors.text,.65*(1-ring)),2);
      drawHand(c,180,y,1,-.24);
      return;
    }
    if (messages.length>1) drawStageIntro(c,messages,128);
  }

  function shownMultiplier(mult,ui,fx) {
    const arrival=fresh(fx,'mult_land');
    const arriving=arrival&&arrival.age<12;
    const scale=arriving&&!ui.reduced?1+(arrival.e.vault?1:.6)*(1-arrival.age/12):1;
    return {value:Math.max(1,mult-(fx?.pendingMult()||0)),scale,arriving,duringPayout:arrival?.e.duringPayout};
  }

  function panel(c,s,ui,fx) {
    const {shot,payout}=s;
    const fired=fresh(fx,'shot_fired');
    if (fired?.e.perfect&&fired.age<30) {
      const age=fired.age;
      const scale=ui.reduced?1:age<5?.6+.12*age:1+.2*Math.max(0,1-(age-5)/12);
      const x=shot?12:180;
      const y=shot?108:92;
      label(c,'PERFECT!',x,y,22*scale,colors.jackpot,shot?'left':'center',{outline:colors.ink,max:shot?126:145});
    }
    if (shot) {
      const mult=shownMultiplier(shot.liveMult,ui,fx);
      const hit=fresh(fx,'peg_hit');
      const pop=hit&&hit.age<4&&!ui.reduced?1+.12*Math.sin(hit.age*Math.PI/4):1;
      const room=22*(mult.scale-1);
      box(c,150,84,180,32,16,rgba(colors.ink,.7),shot.tier?combo(shot.tier):colors.laneEdge,2);
      label(c,score(shot.pts),162,109,28*pop,colors.text,'left',{max:99-room,minSize:18});
      label(c,'× '+score(mult.value),316,108,22*mult.scale,colors.jackpot,'right',{max:54+room,minSize:19});
      const comboTier=fx?.comboTier??shot.tier;
      if (comboTier) {
        const award=JD.CFG.COMBO_NAMES[comboTier]+'! +'+JD.CFG.COMBO_BONUS[comboTier];
        label(c,award,240,146,25+comboTier,combo(comboTier),'center',{outline:colors.ink,max:174,minSize:22});
      }
      return;
    }
    if (!payout) return;
    const mult=shownMultiplier(payout.mult,ui,fx);
    const reveal=payout.elapsed-payout.pins.length*payout.spacing;
    const tint=mult.arriving||(reveal>=20&&payout.jackpot)||(reveal>=0&&mult.value>=4)?colors.jackpot:colors.laneEdge;
    const pop=fresh(fx,'payout_pop',payout.pins[Math.max(0,Math.floor(payout.elapsed/payout.spacing)-1)]?.id);
    const bump=pop?.age<5&&!ui.reduced?1+.08*(1-pop.age/5):1;
    const factor=age=>ui.reduced?1:1+.6*Math.max(0,1-age/20);
    box(c,150,84,180,32,16,rgba(colors.ink,.7),tint,2);
    label(c,score(payout.pts),162,108,22*bump,colors.text,'left',{max:61,minSize:17});
    if (reveal>=0||mult.duringPayout) {
      const revealScale=reveal>=0?factor(reveal):1;
      label(c,'× '+score(mult.value),276,108,20*Math.max(mult.scale,revealScale),
        reveal>=20&&mult.value<4&&!mult.arriving?colors.text:colors.jackpot,'right',{max:reveal>=20?42:52,minSize:17});
    }
    if (reveal>=20) label(c,'× '+score(payout.bucketSum),320,108,20*factor(reveal-20),payout.jackpot?colors.jackpot:colors.text,'right',{max:42,minSize:17});
    if (reveal>=40) {
      const progress=clamp((reveal-40)/30,0,1);
      const travel=ui.reduced?0:progress*progress;
      c.save();
      c.globalAlpha=1-travel;
      label(c,'= '+score(payout.score),240-60*travel,143-124*travel,32-16*travel,colors.jackpot,'center',{outline:colors.ink,max:174});
      c.restore();
    }
  }

  function drawWorldBalls(c,s,ui,fx,t) {
    if(!s.shot) return;
    const tier=s.shot.tier;
    const launch=fresh(fx,'launch');
    const launchTrail=launch?.age<6;
    const tint=launchTrail?(launch.e.perfect?colors.jackpot:colors.text):combo(tier);
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
        const len=Math.min(tail.length,ui.reduced?4:launchTrail?6:8+3*tier);
        const a=tier===0?.35:.4+.1*tier;
        for(let j=len-1;j>=0;j--){
          const past=tail[tail.length-1-j], fraction=1-j/(len+1);
          circle(c,past.x,past.y,2+(r-2)*fraction,rgba(tint,a*fraction*.6));
        }
      }
      if(tier>=3) glow(c,x,y,r*2.2,tint,.35);
      const hit=fx?.ballHitAge?.(i)??Infinity;
      const squash=hit<4&&!ui.reduced?.15*Math.sin(hit*Math.PI/4):0;
      ball(c,b.key,x,y,r*(1-squash),{cracked:b.cracked});
    });
  }

  function hud(c,s,ui,fx) {
    if (ui.cameraY>0) {
      const fade=c.createLinearGradient(0,34,0,56);
      fade.addColorStop(0,colors.bgTop);
      fade.addColorStop(1,rgba(colors.bgTop,0));
      c.save();
      c.globalAlpha=clamp(ui.cameraY/48,0,1);
      c.fillStyle=fade;
      c.fillRect(0,0,360,56);
      c.restore();
    }
    const payout=s.payout;
    const earned=payout?payout.score*clamp((payout.elapsed-(payout.duration-30))/30,0,1):0;
    const displayed=s.stageScore+earned;
    const win=displayed>=s.target;
    label(c,s.endless?'ENDLESS '+s.stage:'STAGE '+s.stage+'/'+JD.STAGES.length,12,24,14,
      s.endless?colors.jackpot:colors.text,'left',{max:80});
    if (s.attempt>0) label(c,'TRY '+(s.attempt+1),12,39,10,colors.textDim,'left',{max:76});
    const clear=fresh(fx,'stage_clear');
    const bump=clear&&clear.age<6&&!ui.reduced ? .1*Math.sin(clear.age*Math.PI/6) : 0;
    const barHeight=16*(1+bump);
    box(c,96,22-barHeight,168,barHeight,8,rgba(colors.text,.12));
    box(c,96,22-barHeight,168*clamp(displayed/s.target,0,1),barHeight,8,win?colors.success:colors.jackpot);
    label(c,score(displayed)+' / '+score(s.target),180,19,13,colors.text,'center',{outline:colors.ink,max:158,minSize:13});
    const earnedCoin=fresh(fx,'coins_earned');
    const coinArrival=fresh(fx,'coin_arrived');
    const coinAge=Math.min(earnedCoin?.age??Infinity,coinArrival?.age??Infinity);
    const coinBump=coinAge<12&&!ui.reduced?1+.2*Math.sin(Math.PI*coinAge/12):1;
    coin(c,300,20,6);
    label(c,number(s.coins),352,25,14*coinBump,colors.jackpot,'right',{max:44,minSize:11});
    label(c,'BALLS',290,44,11,colors.textDim);
    label(c,String(s.ballsLeft),328,46,18,s.ballsLeft===1?colors.danger:colors.text);
    if (earnedCoin?.e.cause==='clear'&&earnedCoin.age<30) {
      const alpha=Math.min(1,(30-earnedCoin.age)/8);
      label(c,'+'+earnedCoin.e.amount+' FIRST CLEAR',352,67,14,rgba(colors.jackpot,alpha),'right',
        {max:133,outline:rgba(colors.ink,alpha)});
    }
    const mult=shownMultiplier(s.shot?.liveMult??s.stageMult,ui,fx);
    const addedMult=activeCardNotice(s,ui,'fever');
    const cardBump=addedMult?.age<12&&!ui.reduced?1+.25*Math.sin(Math.PI*addedMult.age/12):1;
    const multBump=Math.max(mult.scale,cardBump);
    label(c,'×'+score(mult.value),12,66,22*multBump,mult.value>=4||mult.arriving||cardBump>1?colors.jackpot:colors.text,'left',
      {max:100,outline:ui.cameraY>0?colors.ink:null});
  }

  JD.createRenderer = function (canvas) {
    const c=canvas.getContext('2d');
    const magazine={key:'',stage:null,at:0,from:new Map(),targets:new Map()};
    return function draw(s,ui,fx,t) {
      const rect=canvas.getBoundingClientRect(), dpr=Math.min(window.devicePixelRatio||1,2);
      const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
      if(canvas.width!==w||canvas.height!==h) { canvas.width=w;canvas.height=h; }
      c.setTransform(w/440,0,0,h/640,0,0);
      if (s.state==='MAP') {
        JD.drawScreens(c,s,ui,fx,t);
        return;
      }
      background(c,s,fx);
      const arrival=ballArrival(s,ui);
      const landingY=drawMagazine(c,s,ui,t,magazine,fx,arrival);
      c.save();
      c.beginPath(); c.rect(0,0,360,640); c.clip();
      if(fx) fx.world(c,s,ui);
      c.translate(0,-(ui.cameraY||0));
      buckets(c,s,ui,fx,t,true);
      buckets(c,s,ui,fx,t,false);
      const zone=visibleZone(s,ui);
      if (zone) drawZone(c,s,zone,fx);
      drawWallSprings(c,s,ui,fx,t);
      if(JD.drawBoardObjects) JD.drawBoardObjects(c,s,ui,fx,t);
      if (zone&&s.state==='AIM') drawZoneLabel(c,s,ui,zone);
      if(ui.introReveal) drawStageIntro(c,stageIntro(s),s.boardH-102);
      c.restore();
      c.save();
      c.beginPath(); c.rect(0,0,360,640); c.clip();
      if(fx) fx.world(c,s,ui,false);
      c.translate(0,-(ui.cameraY||0));
      drawCannon(c,s,ui,fx,t);
      c.restore();
      if (s.state!=='RESULT'&&s.state!=='SHOP') {
        // Keep the score fixed, then paint even high rebounds in front of it.
        hud(c,s,ui,fx);
        panel(c,s,ui,fx);
      }
      cameraProgress(c,s,ui);
      c.save();
      c.beginPath(); c.rect(0,0,360,640); c.clip();
      if(fx) fx.world(c,s,ui);
      c.translate(0,-(ui.cameraY||0));
      drawWorldBalls(c,s,ui,fx,t);
      if(fx) fx.draw(c);
      c.restore();
      if(fx) fx.overlay(c,s,ui);
      drawAim(c,s,ui,fx,t);
      if(JD.drawScreens) JD.drawScreens(c,s,ui,fx,t);
      if(JD.drawPickedCard) JD.drawPickedCard(c,s,ui);
      drawBallArrival(c,arrival,landingY);
    };
  };
})(JD);

(function (JD) {
  'use strict';

  const glows = new Map();
  const changedPegCache = new WeakMap();
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
    const tutorial = !snapshot.endless && snapshot.stage === 1;
    const tutorialBomb = tutorial && peg.id === 4 && !ui.tutorialSeen && snapshot.state === 'AIM';
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
    if (peg.lit&&peg.touches>0) D.line(ctx,peg.x-4*bounce,peg.y-2*bounce,peg.x+4*bounce,peg.y+3*bounce, D.colors.jackpot,1.2);
    if (peg.type === 'bomb') {
      D.circle(ctx, peg.x, peg.y, 3 * bounce, '#5A0F1E');
      const fuse = tutorial ? .7 : .42 + .58 * D.pulse(time, 10);
      D.circle(ctx, peg.x + 1.6, peg.y - 4.5 * bounce, 2, D.rgba('#FFF1B8', fuse));
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
    const breaking = !group.alive && broken?.age < 3;
    if (!group.alive && !breaking) return;

    const C = D.colors;
    const [x1,y1,x2,y2]=group.segs[0];
    const usable = snapshot.rack.includes('iron');
    const pulse = usable ? D.pulse(time, 40) : 0;
    ctx.save();
    ctx.lineCap = 'round';
    if (breaking) {
      D.line(ctx, x1, y1, x2, y2, C.text, 10);
    } else {
      if (usable) D.line(ctx, x1, y1, x2, y2, D.rgba(C.ironEdge, 0.35 * pulse), 13);
      D.line(ctx, x1, y1+2, x2, y2+2, '#293148', 10);
      D.line(ctx, x1, y1, x2, y2, C.ironEdge, 10);
      D.line(ctx, x1, y1, x2, y2, C.ironWall, 7);
      drawIronMarks(ctx,x1,y1,x2,y2,D);
      const {x,y}=JD.UI.ironAnchor(group);
      D.label(ctx,'IRON',x,y-10,9,C.ironEdge,'center',{outline:C.bgTop});
    }
    ctx.restore();
  }

  function drawIronMarks(ctx,x1,y1,x2,y2,D) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const slope = Math.atan2(y2-y1,x2-x1);
    const downhill = y2>y1?1:-1;
    ctx.save();
    ctx.translate(x1,y1);
    ctx.rotate(slope);
    for (let offset = 6; offset < length; offset += 12) {
      D.circle(ctx,offset,-2,1.5,D.colors.ironEdge);
    }
    ctx.beginPath();
    for (const position of [.25,.5,.75]) {
      const x=length*position;
      ctx.moveTo(x-2.5*downhill,-.5);
      ctx.lineTo(x+2.5*downhill,1.1);
      ctx.lineTo(x-2.5*downhill,3);
    }
    ctx.strokeStyle=D.rgba(D.colors.ironEdge,.6);
    ctx.lineWidth=1.4;
    ctx.stroke();
    ctx.restore();
  }

  function drawWarp(ctx, hole, time, D, scale=1) {
    const { x, y } = hole, color = D.colors.warp;
    ctx.save();
    ctx.translate(x,y);
    ctx.scale(scale,scale);
    ctx.translate(-x,-y);
    const grad = ctx.createRadialGradient(x, y, 3, x, y, 22);
    grad.addColorStop(0, D.rgba(color, .30));
    grad.addColorStop(1, D.rgba(color, 0));
    D.circle(ctx, x, y, 22, grad);
    D.circle(ctx, x, y, 10, 'rgba(7,9,32,.84)');
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

  function changedPegs(s,ui) {
    const notice=ui.cardNotice;
    if (ui.reduced||s.state!=='AIM'||!notice||notice.age>=18||notice.before.stageIndex!==s.stageIndex||
      !['goldPlus','bombPlus'].includes(notice.event.id)) return null;
    let changes=changedPegCache.get(notice);
    if (!changes) {
      changes=new Map();
      const before=new Map(notice.before.pegs.map(peg=>[peg.id,peg.type]));
      for (const peg of s.pegs) {
        const type=before.get(peg.id);
        if (peg.alive&&type&&type!==peg.type) changes.set(peg.id,{type,delay:changes.size*4});
      }
      changedPegCache.set(notice,changes);
    }
    return changes;
  }

  JD.drawBoardObjects = function (ctx, snapshot, ui, fx, time) {
    const D = JD.Drawing;
    const top=(ui.cameraY||0)-72, bottom=top+784;
    const inView=y=>y>=top&&y<=bottom;
    const transformations=changedPegs(snapshot,ui);
    drawTerrain(ctx, snapshot.terrain, D);
    for (const peg of snapshot.pegs) {
      if (!inView(peg.y)) continue;
      if (peg.alive) {
        const change=transformations?.get(peg.id);
        const age=change?ui.cardNotice.age-change.delay:Infinity;
        const pending=fx?.pegsPending.has(peg.id);
        let drawn=peg;
        if (pending||age<0) drawn={...peg,lit:pending?false:peg.lit,type:age<0?change.type:peg.type};
        drawPeg(ctx, drawn, snapshot, ui, fx, time, D);
        if (age>=0&&age<8) {
          const tint=peg.type==='gold'?D.colors.jackpot:D.colors.pegBomb;
          const alpha=1-age/8;
          D.circle(ctx,peg.x,peg.y,7,D.rgba(D.colors.text,.58*alpha));
          D.circle(ctx,peg.x,peg.y,8+age,null,D.rgba(tint,.9*alpha),2);
        }
      } else if (D.fresh(fx,'peg_break',peg.id)?.age<2) {
        D.circle(ctx,peg.x,peg.y,7,D.colors.text);
      }
    }
    if (snapshot.payout) {
      const { elapsed, spacing, pins } = snapshot.payout;
      for (let i = Math.floor(elapsed / spacing); i < pins.length; i++) {
        if (!pins[i].removed&&inView(pins[i].y)) drawPeg(ctx, Object.assign({ lit: true }, pins[i]), snapshot, ui, fx, time, D);
      }
    }
    snapshot.bumpers.forEach((bumper, i) => { if (inView(bumper.y)) drawBumper(ctx, bumper, i, ui, fx, D); });
    snapshot.blocks.forEach(block => { if (inView(block.y)) drawBlock(ctx, block, ui, fx, time, D); });
    snapshot.gates.forEach(gate => { if (inView(gate.y)) drawGate(ctx, gate, fx, time, D); });
    snapshot.iron.forEach(group => drawIron(ctx, group, snapshot, fx, time, D));
    snapshot.warps?.ins.forEach((hole,index)=>{
      if (!inView(hole.y)) return;
      if (hole.alive) {
        drawWarp(ctx,hole,time,D);
        return;
      }
      const close=D.fresh(fx,'warp_closed',index);
      if (!(close?.age<20)) return;
      if (close.age<16&&!ui.reduced) drawWarp(ctx,hole,time+3*close.age,D,1-close.age/16);
      const alpha=.8*(1-close.age/20);
      D.label(ctx,'CLOSED',hole.x,hole.y-14-close.age/2,10,D.rgba(D.colors.warp,alpha),'center',
        {outline:D.rgba(D.colors.ink,alpha),outlineWidth:2});
    });
  };
}(window.JD));

(function (JD) {
  'use strict';

  const cards = {
    goldPlus: ['GOLD RUSH', '3 blue pegs turn gold', '✦', 'jackpot'],
    heavy: ['RICH PEGS', '+10 points per blue/gold peg', '✦', 'pegNormal'],
    bombPlus: ['BIG BANG', '2 pegs turn bombs, blast +16', '●', 'pegBomb'],
    fever: ['HOT STREAK', 'Stage multiplier +1 now', '×', 'jackpot'],
    jackpot: ['WIDE JACKPOT', '×5 buckets 40px wider', '×5', 'jackpot'],
    extra: ['EXTRA BALL', '+1 ball this stage', '+', 'pegNormal'],
    split: ['SPLIT SHOT', '+1 ball on first new peg hit', '÷', 'text'],
    ballIron: ['IRON BALL', 'Breaks iron walls, blocks take 2 damage', '', 'iron'],
    ballGlass: ['GLASS BALL', 'Cracks at 12 hits, shatters into 3 at 24', '', 'glass'],
    ballBig: ['BIG BALL', 'Bigger ball, more hits', '', 'glass']
  };

  const previewNames = {1:'IRON LID',3:'BLOCKS ×+1 · WARP',4:'ZIGZAG · LONG BOARD',
    7:'THE VAULT ×+3 · LONG BOARD',8:'CROSSFIRE · ENDLESS UNLOCKED'};
  const previewJackpots = {center:'JACKPOT ▼',left:'JACKPOT ◀',right:'JACKPOT ▶',twin:'TWIN JACKPOT'};
  const resultStats = [
    ['REACHED','stageReached'],['BIGGEST SHOT','biggestShot'],['JACKPOTS','jackpots'],
    ['PERFECT SHOTS','perfects'],['BEST COMBO','bestTier'],
    ['COINS','coins'],['BLOCKS BROKEN','blocksBroken']
  ];
  const perkArt = {
    mult:['START ×','Stage multiplier starts +1','×','jackpot'],
    value:['PEG VALUE','+5 points per blue/gold peg','+','pegNormal'],
    gold:['GOLD PEGS','+2 gold pegs on every board','✦','jackpot'],
    ball:['EXTRA BALL','+1 ball every stage','','glass'],
    blast:['BLAST','Blast radius +12','','pegBomb']
  };
  JD.UI.perkNames=Object.fromEntries(Object.entries(perkArt).map(([id,[name]])=>[id,name]));

  function preview(s) {
    const next=JD.stageDef(s.stageIndex+1);
    const current=JD.stageDef(s.stageIndex);
    const suffix=next.buckets===current.buckets?'':' · '+previewJackpots[next.buckets];
    return 'NEXT: '+(previewNames[s.stageIndex+1]||next.name+(next.rows===24?' · LONG BOARD':''))+suffix;
  }

  function effectLines(ctx,text,width,size,D) {
    ctx.save();
    ctx.font='600 '+size+'px '+D.bodyFamily;
    if (ctx.measureText(text).width<=width) {
      ctx.restore();
      return [text];
    }
    const comma=text.indexOf(', ');
    if (comma!==-1) {
      const clauses=[text.slice(0,comma+1),text.slice(comma+2)];
      if (clauses.every(clause=>ctx.measureText(clause).width<=width)) {
        ctx.restore();
        return clauses;
      }
    }
    const lines=[''];
    const tokens=text.split(' ');
    for (const token of tokens) {
      const index=lines.length-1;
      const line=lines[index]?lines[index]+' '+token:token;
      if (lines[index]&&lines.length<2&&ctx.measureText(line).width>width) lines.push(token);
      else lines[index]=line;
    }
    ctx.restore();
    return lines;
  }

  function rackRow(ctx, rack, x, y, gap, r, D) {
    rack.forEach((kind, index) => D.ball(ctx, kind, x + index * gap, y, kind === 'big' ? r * 1.18 : r,
      {cracked: kind === 'glass'}));
  }

  function rackPreview(ctx, rack, id, x, y, width, r, D) {
    const firstNormal=rack.indexOf('normal');
    const next=rack.map((ball,index)=>index===firstNormal?JD.CARD_BALL[id]:ball);
    const gap = Math.min(r * 2.7, (width - 32) / (rack.length + next.length));
    const beforeW = (rack.length - 1) * gap;
    const afterW = (next.length - 1) * gap;
    const left = x - (beforeW + afterW + 34) / 2;
    rackRow(ctx, rack, left, y, gap, r, D);
    D.label(ctx, '→', left + beforeW + 17, y + 4.5, 15, D.colors.textDim);
    rackRow(ctx, next, left + beforeW + 34, y, gap, r, D);
  }

  function drawIcon(ctx, id, x, y, r, D) {
    const [, , glyph, token] = cards[id];
    const tint = D.colors[token];
    D.circle(ctx, x, y, r, D.rgba(tint, .13), D.rgba(tint, .6), 1.3);
    if (JD.CARD_BALL[id]) {
      const kind = JD.CARD_BALL[id];
      D.ball(ctx, kind, x, y, Math.min(r-3,JD.BALLS[kind].r*2), { cracked:kind === 'glass' });
    } else if (id === 'bombPlus') {
      D.circle(ctx, x, y + 3, r * .40, tint);
      D.circle(ctx, x, y + 3, r * .16, '#5A0F1E');
      D.line(ctx, x, y - r * .32, x + r * .19, y - r * .51, D.colors.text, 1.6);
      D.circle(ctx, x + r * .23, y - r * .56, 2, D.colors.jackpot);
    } else {
      D.label(ctx, glyph, x, y + r * .28, r * .91, tint);
    }
  }

  function drawCard(ctx,s,index,ui,D,selectedAge=null) {
    const {x,y,w,h}=JD.UI.cards(s)[index];
    const id=s.offer[index];
    const [name,effect,,token]=cards[id];
    const C=D.colors;
    const focus=index===ui.focus;
    const age=Math.max(0,ui.stateAge-6*index);
    const enter=selectedAge===null&&!ui.reduced?D.clamp(age/12,0,1):1;
    const scale=ui.reduced?1:selectedAge!==null?1+.1*Math.sin(Math.PI*selectedAge/12):focus?1.03:1;
    const cx=x+w/2;
    const cy=y+h/2;
    ctx.save();
    ctx.globalAlpha=selectedAge===null?Math.min(1,.15+enter*1.7):1-selectedAge/12;
    ctx.translate(cx,cy+(1-enter)*20);
    ctx.scale(scale,scale);
    ctx.translate(-cx,-cy);
    const face=ctx.createLinearGradient(0,y,0,y+h);
    face.addColorStop(0,'#252D63');
    face.addColorStop(1,'#121634');
    D.box(ctx,x,y+5,w,h,14,'#080A20');
    D.box(ctx,x,y,w,h,14,face,focus||selectedAge!==null?C.text:C[token],focus||selectedAge!==null?3:1.5);
    D.label(ctx,String(index+1),43,y+19,12,focus?C.text:C.textDim);
    drawIcon(ctx,id,x+34,y+49,24,D);
    D.label(ctx,name,x+63,y+31,21,C.text,'left',{max:w-80,minSize:19});
    effectLines(ctx,effect,w-81,15,D).forEach((value,i)=>
      D.label(ctx,value,x+63,y+51+i*17,15,C.text,'left',{body:true,max:w-81,minSize:13}));
    if (JD.CARD_BALL[id]) {
      rackPreview(ctx,s.rack,id,x+142,y+86,156,5,D);
      D.label(ctx,'NEW BALL',x+w-14,y+91,14,C[token],'right');
    } else {
      const level=s.up[id]||0;
      D.label(ctx,'Lv '+level+' → '+(level+1),x+w-14,y+89,14,C.textDim,'right');
    }
    if (selectedAge!==null&&selectedAge<5) D.box(ctx,x,y,w,h,14,D.rgba(C.text,.23*(1-selectedAge/5)));
    ctx.restore();
  }

  function drawCardScreen(ctx,s,ui,D) {
    const C=D.colors;
    D.box(ctx,0,0,440,640,0,D.rgba(C.ink,.6));
    D.label(ctx,'PICK ONE',196,120,24,C.text);
    D.label(ctx,'FOR THIS STAGE',196,146,14,C.textDim);
    for(let i=0;i<s.offer.length;i++) {
      if(ui.stateAge>=6*i||ui.reduced) drawCard(ctx,s,i,ui,D);
    }
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
    return (s.endless?'ENDLESS ':'STAGE ')+s.stage+' · '+s.stageName;
  }

  function drawPerk(ctx,item,rect,ui,bought,t,D) {
    const {x,y,w,h}=rect;
    const C=D.colors;
    const [name,effect,glyph,token]=perkArt[item.id];
    const maxed=item.level===item.max;
    const focused=ui.panelFocus===item.id;
    const age=bought?.e.id===item.id?bought.age:Infinity;
    const bounce=age<8&&!ui.reduced?1+.06*Math.sin(Math.PI*age/8):1;
    ctx.save();
    ctx.translate(x+w/2,y+h/2);
    ctx.scale(bounce,bounce);
    ctx.translate(-x-w/2,-y-h/2);
    const trim=item.affordable?D.rgba(C.jackpot,.61+.39*(ui.reduced?1:D.pulse(t,40))):C.laneEdge;
    D.box(ctx,x,y+3,w,h,12,'#080A20');
    D.box(ctx,x,y,w,h,12,'#151B3B',focused?C.text:trim,focused?3:1.5);
    const tint=C[token];
    const iconX=x+30, iconY=y+h/2;
    if (item.id==='blast') drawIcon(ctx,'bombPlus',iconX,iconY,20,D);
    else {
      D.circle(ctx,iconX,iconY,20,D.rgba(tint,.13),D.rgba(tint,.55),1.3);
      if (item.id==='ball') D.ball(ctx,'normal',iconX,iconY,10);
      else D.label(ctx,glyph,iconX,iconY+7,25,tint);
    }
    D.label(ctx,name,x+58,y+21,16,C.text,'left',{max:166});
    D.label(ctx,effect,x+58,y+39,12,C.textDim,'left',{body:true,max:172});
    for (let i=0;i<item.max;i++) {
      const justBought=i===item.level-1&&age<8;
      const color=i>=item.level?null:justBought&&age<4?C.text:C.jackpot;
      D.box(ctx,x+58+12*i,y+49,9,8,2,color,D.rgba(C.textDim,.7),1);
    }
    const priceX=x+w-97;
    if (maxed) D.label(ctx,'MAX',priceX+44,y+37,14,C.jackpot);
    else {
      const priceColor=item.affordable?C.bgBottom:C.textDim;
      D.box(ctx,priceX,y+12,88,40,12,item.affordable?C.jackpot:null,
        item.affordable?'#FFF6CA':D.rgba(C.textDim,.55),1.5);
      D.coin(ctx,priceX+18,y+32,7);
      D.label(ctx,D.number(item.cost),priceX+74,y+38,17,priceColor,'right',{max:46,minSize:13});
    }
    ctx.restore();
  }

  function drawShop(ctx,s,ui,fx,t,D) {
    const C=D.colors, {items,coins,earned,ratio}=s.shop;
    const center=196;
    D.box(ctx,0,0,440,640,0,D.rgba(C.ink,.82));
    D.label(ctx,'UPGRADE',center,96,26,C.text);
    D.label(ctx,stageLabel(s)+' · '+ratio+'%',center,122,13,ratio>=80?C.danger:C.textDim,'center',{max:330});
    const lastPurchase=D.fresh(fx,'perk_bought');
    const age=ui.stateAge;
    const added=ui.reduced?1:D.clamp(age/30,0,1);
    const spent=lastPurchase&&!ui.reduced?Math.max(0,1-lastPurchase.age/12)*lastPurchase.e.cost:0;
    const balance=Math.max(0,Math.round(coins-(1-added)*earned+spent));
    const digits=D.number(balance);
    ctx.save();
    ctx.font='900 22px '+D.fontFamily;
    const textWidth=Math.min(99,ctx.measureText(digits).width);
    ctx.restore();
    D.coin(ctx,center-textWidth/2-4,149,9);
    D.label(ctx,digits,center+10,156,22,C.text,'center',{max:99});
    if (earned>0&&age<36) D.label(ctx,'+'+D.number(earned),center+26+textWidth/2,156,14,
      D.rgba(C.jackpot,Math.min(1,(36-age)/6)),'left',{max:60});
    items.forEach((item,index)=>drawPerk(ctx,item,JD.UI.shopPerks[index],ui,lastPurchase,t,D));
    const cheapest=Math.min(...items.filter(item=>item.cost!=null).map(item=>item.cost));
    if (cheapest>coins&&Number.isFinite(cheapest)) D.label(ctx,'NEXT +'+D.number(cheapest-coins),center,550,12,C.textDim);
    D.menuButton(ctx,JD.UI.shopRetry,'RETRY STAGE '+s.stage,'success',ui.panelFocus==='retry');
  }

  function lockRays(ctx,x,y,r,age,D) {
    if (age>=34) return;
    const alpha=1-age/34;
    for (let i=0;i<8;i++) {
      const a=i*Math.PI/4;
      const radius=r*(1.12+age/68);
      const end=radius+r*.42;
      D.line(ctx,x+Math.cos(a)*radius,y+Math.sin(a)*radius,x+Math.cos(a)*end,y+Math.sin(a)*end,
        D.rgba(D.colors.jackpot,.88*alpha),Math.max(1,r*.06));
    }
  }

  function drawLock(ctx,x,y,r,opening,D) {
    const C=D.colors;
    ctx.save();
    ctx.translate(x-r*.55,y-r*.22);
    ctx.rotate(-Math.PI/12*opening);
    ctx.beginPath();
    ctx.arc(r*.55,-r*.10*opening,r*.55,Math.PI,2*Math.PI);
    ctx.strokeStyle=C.ironEdge;
    ctx.lineWidth=Math.max(1.5,r*.22);
    ctx.lineCap='round';
    ctx.stroke();
    ctx.restore();
    D.box(ctx,x-r*.8,y-r*.22,r*1.6,r*1.2,3,'#59627E',C.ironEdge,1.5);
    D.circle(ctx,x,y+r*.28,r*.15,C.ink);
    D.line(ctx,x,y+r*.31,x,y+r*.59,C.ink,Math.max(1,r*.13));
  }

  function drawMapTile(ctx,rect,index,s,ui,t,D) {
    const C=D.colors, {x,y,w,h}=rect;
    const {current,cleared,stageBest}=s.map;
    const stage=JD.STAGES[index];
    const active=index===current;
    const done=!active&&index<cleared;
    const locked=!active&&!done;
    const focus=ui.panelFocus===index;
    const trim=active?D.rgba(C.jackpot,.68+.32*(ui.reduced?1:D.pulse(t,40))):D.rgba(C.laneEdge,.52);
    D.box(ctx,x,y+2,w,h,11,'#080A20');
    if (focus) D.box(ctx,x-3,y-3,w+6,h+6,13,null,C.text,2);
    D.box(ctx,x,y,w,h,11,done?'#2E3A8C':active?'#1F2750':D.rgba(C.text,.055),trim,active?2:1);
    if (locked) drawLock(ctx,x+w/2,y+39,10,0,D);
    if (done) {
      D.line(ctx,x+52,y+15,x+57,y+20,C.success,2);
      D.line(ctx,x+57,y+20,x+65,y+11,C.success,2);
    } else if (active) {
      D.label(ctx,'▶',x+60,y+18,11,C.jackpot);
    }
    const details=active||done;
    D.label(ctx,String(index+1),x+w/2,y+(locked?22:31),22,locked?D.rgba(C.text,.40):C.text);
    D.label(ctx,stage.name,x+w/2,y+(details?48:64),9,C.textDim,'center',{max:64,minSize:8});
    if (active) D.label(ctx,'이어하기',x+w/2,y+64,10,C.jackpot,'center',{max:53});
    if (done) D.label(ctx,D.score(stageBest[index]||0),x+w/2,y+64,9,C.success,'center',{max:48,minSize:8});
    if (stage.rows===24) D.label(ctx,'↓',x+w-9,y+(locked?51:h-6),10,C.jackpot);
  }

  function drawMap(ctx,s,ui,t,D) {
    const C=D.colors;
    const gradient=ctx.createLinearGradient(0,0,0,640);
    gradient.addColorStop(0,C.bgTop);
    gradient.addColorStop(1,C.bgBottom);
    D.box(ctx,0,0,440,640,0,gradient);
    D.label(ctx,'STAGES',196,60,24,C.text);
    D.label(ctx,'CLEARED '+s.map.cleared+' / '+JD.STAGES.length,196,82,13,C.textDim);
    D.coin(ctx,267,21,6);
    D.label(ctx,D.number(s.coins),310,26,14,C.jackpot,'right',{max:34,minSize:11});
    const close=JD.UI.mapClose;
    const cx=close.x+close.w/2, cy=close.y+close.h/2;
    const closeAvailable=s.map.canClose;
    const closeFocus=closeAvailable&&ui.panelFocus==='close';
    D.box(ctx,close.x,close.y,close.w,close.h,9,'#141936',closeFocus?C.text:C.laneEdge,closeFocus?3:1);
    const cross=closeAvailable?C.text:D.rgba(C.textDim,.46);
    D.line(ctx,cx-6,cy-6,cx+6,cy+6,cross,2);
    D.line(ctx,cx-6,cy+6,cx+6,cy-6,cross,2);
    JD.UI.mapStages.forEach((rect,index)=>drawMapTile(ctx,rect,index,s,ui,t,D));

    const endless=s.map.endlessUnlocked;
    const {x,y,w,h}=JD.UI.mapEndless;
    const focus=ui.panelFocus==='endless';
    const shake=ui.panelShake?.target==='endless'&&!ui.reduced?ui.panelShake.age:Infinity;
    const dx=shake<12?4*Math.sin(shake*Math.PI/2):0;
    const unlockAge=ui.mapUnlock?ui.stateAge:Infinity;
    const opening=endless?(ui.reduced?1:D.clamp(unlockAge/12,0,1)):0;
    D.box(ctx,x,y+3,w,h,16,'#080A20');
    D.box(ctx,x,y,w,h,16,endless?D.rgba(C.jackpot,.24):D.rgba(C.text,.06),focus?C.text:endless?C.jackpot:C.laneEdge,
      focus?3:endless?2:1);
    const lockX=x+38+dx, lockY=y+30;
    if (endless&&!ui.reduced) lockRays(ctx,lockX,lockY,16,unlockAge,D);
    drawLock(ctx,lockX,lockY,16,opening,D);
    D.label(ctx,'ENDLESS',x+68,y+30,20,endless?C.jackpot:D.rgba(C.text,.52),'left');
    D.label(ctx,endless?'최고 ENDLESS '+s.map.endlessBest:'8단계를 넘기면 열립니다',x+68,y+51,13,C.textDim,'left',{max:244});
  }

  function drawBanner(ctx,s,ui,t,D) {
    const C=D.colors;
    const b=s.banner;
    if (b.kind==='unlock') {
      const age=ui.stateAge;
      const opening=ui.reduced?1:D.clamp(age/12,0,1);
      D.box(ctx,12,232,336,203,18,'#10152D',D.rgba(C.jackpot,.7),1.5);
      if (!ui.reduced) lockRays(ctx,180,300,40,age,D);
      drawLock(ctx,180,300,40,opening,D);
      D.label(ctx,'ENDLESS UNLOCKED',180,373,28,C.jackpot,'center',{max:314,minSize:24});
      D.label(ctx,'스테이지 지도에서 도전하세요',180,397,13,C.textDim,'center',{max:305});
      D.label(ctx,preview(s),180,419,14,C.textDim,'center',{max:312,minSize:11});
      return;
    }
    if (b.kind==='clear') {
      D.box(ctx,12,269,336,111,18,'#10152D',D.rgba(C.success,.58),1.5);
      D.label(ctx,'STAGE CLEAR!',180,322,32,C.success,'center',{max:312});
      if (b.newBall==='iron') D.label(ctx,'NEW BALL: IRON',180,343,18,C.iron);
      D.label(ctx,preview(s),180,362,14,C.textDim,'center',{max:312,minSize:11});
      return;
    }
    const allClear=b.kind==='allclear';
    const flash=ui.reduced?0:1-D.clamp(ui.stateAge/12,0,1);
    const tint=allClear?C.jackpot:b.ratio>=80?C.danger:C.text;
    const title=allClear?'CAMPAIGN CLEAR!':b.ratio>=80?'SO CLOSE!':'OUT OF BALLS';
    D.box(ctx,12,269,336,112,18,'#10152D',D.rgba(tint,.58),1.5);
    const beat=allClear&&!ui.reduced?ui.stateAge<8?.5+ui.stateAge*.08125:1+.15*Math.max(0,1-(ui.stateAge-8)/12):1;
    D.label(ctx,title,180,322,36*beat,tint,'center',{max:312,minSize:30});
    if(b.kind==='fail') {
      D.label(ctx,b.ratio+'%',180,350,24,tint);
      drawRatio(ctx,b.ratio,180,360,t,D);
    } else if (allClear&&(ui.stateAge>=30||ui.reduced)) {
      D.label(ctx,'20 / 20',180,354,18,C.text,'center',{max:300});
    }
    if(allClear&&flash) D.box(ctx,3,3,386,634,6,null,D.rgba(C.jackpot,flash*.75),6);
  }

  function drawResult(ctx,s,ui,t,D) {
    const r=s.result,C=D.colors;
    const title=r.ratio>=80?'SO CLOSE!':'ENDLESS OVER';
    const tint=r.ratio>=80?C.danger:C.text;
    const shownScore=ui.reduced?r.runScore:Math.round(r.runScore*D.clamp(ui.stateAge/40,0,1));
    D.box(ctx,0,0,440,640,0,D.rgba(C.ink,.94));
    D.label(ctx,title,196,150,32,tint,'center',{max:352,minSize:28});
    D.label(ctx,stageLabel(s)+' · '+r.ratio+'%',196,200,18,C.text,'center',{max:352,minSize:16});
    drawRatio(ctx,r.ratio,196,210,t,D);
    D.label(ctx,'RUN SCORE',196,250,16,C.textDim);
    D.label(ctx,D.number(shownScore),196,289,40,C.text,'center',{max:344,minSize:37});
    const newBest=ui.newBest&&!s.practice;
    const best=s.practice?'PRACTICE':newBest?'NEW BEST!':'BEST ENDLESS '+s.endlessBest;
    if(newBest) D.box(ctx,146,298,100,18,9,D.rgba(C.jackpot,.18),C.jackpot);
    D.label(ctx,best,196,311,13,newBest?C.jackpot:C.textDim,'center',{max:346,minSize:12});
    D.box(ctx,42,318,308,137,11,'#131834',D.rgba(C.laneEdge,.62));
    resultStats.forEach(([label,key],i)=>{
      const y=332+i*19;
      const value=key==='bestTier'?JD.CFG.COMBO_NAMES[r.bestTier]||'—':D.score(r[key]);
      const emphasis=i===0&&newBest;
      const color=key==='bestTier'?D.combo(r.bestTier):emphasis?C.jackpot:C.text;
      if(i>0) D.line(ctx,51,y-14,341,y-14,D.rgba(C.laneEdge,.28));
      D.label(ctx,label,56,y,14,emphasis?C.jackpot:C.textDim,'left',{body:true});
      D.label(ctx,value,336,y,15,color,'right',{max:132,minSize:13});
    });
    D.menuButton(ctx,JD.UI.result,'PLAY AGAIN','jackpot',ui.panelFocus==='replay');
    D.menuButton(ctx,JD.UI.resultMap,'MAP','outline',ui.panelFocus==='map');
    rackRow(ctx,r.rack,196-(r.rack.length-1)*23/2,604,23,8,D);
    D.label(ctx,'SEED '+s.seed,376,625,11,C.textDim,'right',{max:170});
  }

  JD.drawScreens = function (ctx,s,ui,fx,t) {
    const D = JD.Drawing;
    if(s.state === 'BANNER') drawBanner(ctx,s,ui,t,D);
    else if(s.state === 'CARD') drawCardScreen(ctx,s,ui,D);
    else if(s.state === 'SHOP') {
      drawShop(ctx,s,ui,fx,t,D);
      fx?.shopOverlay?.(ctx,s,ui);
    }
    else if(s.state === 'MAP') drawMap(ctx,s,ui,t,D);
    else if(s.state === 'RESULT') drawResult(ctx,s,ui,t,D);
  };

  JD.drawPickedCard = function (ctx,s,ui) {
    const notice=ui.cardNotice;
    if (!notice?.before?.offer||s.state!=='AIM'||notice.age>=12||ui.reduced||notice.before.stageIndex!==s.stageIndex) return;
    const {event,before,age}=notice;
    const index=before.offer.indexOf(event.id);
    if (index>=0) drawCard(ctx,before,index,ui,JD.Drawing,age);
  };
}(window.JD));
