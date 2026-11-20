(function (JD) {
  'use strict';

  const colors = {
    bgTop:'#0B0E2A', bgBottom:'#1A1146', lane:'#070920', laneEdge:'#5A62A8',
    pegNormal:'#39A0FF', pegNormalLit:'#BDF3FF', pegGold:'#FFC83D', pegGoldLit:'#FFF1B8',
    pegBomb:'#FF4D6D', pegBombLit:'#FFD0D8', bumper:'#B26BFF', gatePlus:'#3DFFC8', gateMinus:'#FF4D6D',
    block:'#2E3A8C', blockEdge:'#8FA2FF', vault:'#5A3A00', vaultEdge:'#FFC83D',
    terrain:'#3A3F66', terrainEdge:'#C9CEF5', ball:'#FFFFFF', jackpot:'#FFC83D',
    combo1:'#3DD6FF', combo2:'#5CFFB0', combo3:'#FFC83D', combo4:'#FF4DD2',
    springStandard:'#C9CEF5', ironWall:'#59627E',
    ironEdge:'#C9D1E6', warp:'#9D4DFF', bank:'#5CFFB0', hint:'#FFC83D', glass:'#BDF3FF',
    iron:'#9AA3B8', text:'#FFFFFF', textDim:'#A9B0D6', danger:'#FF6B6B', success:'#5CFFB0', ink:'#05061A'
  };
  const twoPi = 2 * Math.PI;
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

  function coil(c,x,y,halfWidth,height) {
    const turns=7;
    c.save(); c.lineJoin='round'; c.lineCap='round';
    c.beginPath(); c.moveTo(x,y);
    for(let i=0;i<turns;i++) c.lineTo(x+(i%2?-halfWidth:halfWidth),y+(i+1)*height/(turns+1));
    c.lineTo(x,y+height); c.lineWidth=2;
    c.strokeStyle=colors.springStandard; c.stroke(); c.restore();
  }

  function menuButton(c, {x,y,w,h}, text, primary, focused) {
    const radius = h/2;
    const fill = c.createLinearGradient(0, y, 0, y+h);
    fill.addColorStop(0, primary ? '#FFE493' : '#3C345F');
    fill.addColorStop(1, primary ? colors.jackpot : '#25203E');
    if (focused) box(c,x-4,y-4,w+8,h+12,radius+4,null,colors.text,3);
    box(c,x,y+4,w,h,radius,primary ? '#A55826' : '#15112C');
    box(c,x,y,w,h,radius,fill,primary ? '#FFF6CA' : '#7768A6',1.5);
    label(c,text,x+w/2,y+h/2+7,22,primary ? colors.bgBottom : colors.text);
  }

  JD.Drawing={colors,clamp,pulse,number,score,combo,rgba,fresh,box,circle,line,label,glow,ball,menuButton,fontFamily,bodyFamily};
  JD.UI={
    magazine(s) {
      const slots=s.rack.map((_,slot)=>slot).filter(slot=>slot!==s.slot);
      if(s.rack[s.slot]) slots.unshift(s.slot);
      return slots.map((slot,row)=>({slot,y:590-row*52}));
    },
    cards:s=>s.offer&&(s.offer.length===1?[{x:46,y:220,w:300,h:200}]:
      s.offer.map((_,i)=>({x:30,y:170+120*i,w:332,h:100}))),
    result:{x:76,y:470,w:240,h:56},
    pauseButtons:[
      {x:84,y:253,w:272,h:60,label:'계속'},
      {x:84,y:325,w:272,h:60,label:'처음부터'},
      {x:84,y:397,w:272,h:60,label:'포트폴리오'}
    ]
  };

  function drawPause(c, focus) {
    const panel = c.createLinearGradient(0, 175, 0, 481);
    panel.addColorStop(0, '#352650');
    panel.addColorStop(1, '#1A1436');
    box(c,0,0,440,640,0,rgba(colors.ink,.8));
    box(c,56,181,328,306,19,'#100822');
    box(c,56,175,328,306,19,panel,'#8C78BF',1.5);
    label(c,'일시 정지',220,225,29,colors.text);
    JD.UI.pauseButtons.forEach((button,index) => menuButton(c,button,button.label,index===0,index===focus));
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
        if(ui.stageAge<60) {
          const gate=s.iron.some(group=>group.alive&&group.segs.some(([x1,y1,x2,y2])=>
            Math.max(x1,x2)>left&&Math.min(x1,x2)<x[i+1]&&Math.min(y1,y2)>=562&&Math.max(y1,y2)<=586));
          const cueY=gate?597:584+(ui.reduced?0:4*Math.sin(t*Math.PI/20));
          const cueX=clamp(center,40,320);
          label(c,'▼ JACKPOT',cueX,cueY,gate?12:14,colors.jackpot,'center',
            {outline:colors.ink,max:Math.min(94,2*cueX-6,714-2*cueX),minSize:11});
        }
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

    const {perfectLo:lo,perfectHi:hi}=JD.SPRING;
    const example=ui.demoPower;
    const p=s.state==='AIM' ? Math.max(s.power,example) : 0;
    const perfect=s.perfect && s.state==='AIM' || example>=lo && example<=hi;
    const color=p===1?colors.text : perfect?colors.jackpot:colors.combo1;
    const tremor=!ui.reduced && p===1 ? t%2?1:-1 : 0;
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
    coil(c,376,trayY,8,handleY-trayY);
    box(c,367,trayY-1,18,3,1,colors.laneEdge);
    box(c,362+tremor,handleY,28,12,4,perfect?colors.jackpot:'#E6E9FF');
    if(handleY+12>640) box(c,362,636,28,4,1,colors.text);
    line(c,368+tremor,handleY+6,384+tremor,handleY+6,rgba(colors.bgTop,.45));
  }

  function drawMagazine(c,s,ui,t,animation,fx) {
    const slots=JD.UI.magazine(s);
    const start=animation.from;
    const key=s.stage+':'+slots.map(({slot})=>s.rackIndices[slot]).join(',');
    if (key!==animation.key) {
      animation.key=key;
      animation.from=new Map();
      if (animation.stage===s.stage) {
        const progress=clamp((t-animation.at)/6,0,1);
        for (const [id,target] of animation.targets) {
          const from=start.get(id)??target;
          animation.from.set(id,from+(target-from)*progress);
        }
      }
      animation.stage=s.stage;
      animation.at=t;
      animation.targets=new Map(slots.map(({slot,y})=>[s.rackIndices[slot],y]));
    }

    box(c,392,340,48,288,0,rgba(colors.lane,.6));
    line(c,392.5,340,392.5,628,colors.laneEdge);
    const ready=s.state==='AIM'&&!s.charging;
    const progress=ui.reduced?1:clamp((t-animation.at)/6,0,1);
    const canPick=ready&&s.stage!==1;
    const hint=canPick&&!ui.stageFired?s.hint?.ball:null;
    const last=ready&&slots.length===1;
    c.save();
    c.globalAlpha=ready?1:.5;
    for (let i=0;i<s.fullRack.length;i++) {
      const y=590-i*52;
      const selected=!i&&canPick&&slots.length>0;
      const warning=i===0&&last;
      const border=warning&&Math.floor(t/15)%2?colors.danger:colors.text;
      const matchingHint=hint&&s.rack[slots[i]?.slot]===hint;
      const edge=matchingHint?rgba(colors.hint,.64+.36*pulse(t,20)):
        selected||warning?border:rgba(colors.laneEdge,.63);
      box(c,396,y-22,40,44,9,selected?'#252947':'#10152E',edge,selected||matchingHint||warning?2:1);
      if(selected) {
        label(c,'◀',395,y+4,11,border);
        label(c,'장전',416,y-11,10,border);
      }
    }
    const picked=fresh(fx,'ball_picked');
    for (const {slot,y} of slots) {
      const id=s.rackIndices[slot];
      const kind=s.rack[slot];
      const from=animation.from.get(id)??y;
      const dy=y===590&&canPick?3:0;
      const bump=picked?.age<6&&slot===s.slot&&!ui.reduced?1+.12*Math.sin(Math.PI*picked.age/6):1;
      ball(c,kind,416,from+(y-from)*progress+dy,JD.BALLS[kind].r*1.5*bump,{cracked:kind==='glass'});
    }
    c.restore();
    label(c,slots.length+'/'+s.fullRack.length,416,628,12,last?colors.danger:colors.textDim);
  }

  function aimMessages(s,ui,fx) {
    if (s.charging) return ['RELEASE IN GOLD!'];
    if (fresh(fx,'charge_cancel')?.age<30) return ['HOLD!'];
    if (s.state!=='AIM') return [];
    if (s.stage===1 && !ui.tutorialSeen) return ['HOLD','release in GOLD · aim for JACKPOT ×5'];
    if (s.stage===1 || ui.stageAge>=90 || ui.hintHidden) return [];
    const title=(s.endless?'ENDLESS ':'STAGE ')+s.stage+' · '+s.stageName;
    const hint=s.hint?.ball==='iron'?'SAVE BALLS ON THE GATE · IRON BALL LAST':'GET THE JACKPOT';
    return [title,hint];
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
      label(c,messages[0],180+wiggle,136,24,s.perfect?colors.jackpot:colors.text,'center',{outline:colors.ink,max:326});
      return;
    }
    if (s.stage===1 && s.state==='AIM') {
      if (ui.tutorialSeen) {
        label(c,'HOLD',350,439,14,colors.text,'right',{outline:colors.ink});
        drawHand(c,339,451,.44,-Math.PI*.47);
        return;
      }
      const scale=ui.reduced?1:1+.12*pulse(t,30);
      const nudge=(ui.age-300)%600;
      const bump=ui.age>=300&&nudge<15&&!ui.reduced?1+.16*Math.sin(nudge*Math.PI/15):1;
      box(c,17,100,326,53,8,rgba(colors.ink,.63));
      label(c,messages[0],180,124,33*scale*bump,colors.text,'center',{outline:colors.ink,max:324});
      label(c,messages[1],180,146,14,colors.jackpot,'center',{body:true,max:312});
      const cycle=(ui.age+12)%90;
      const down=ui.reduced?0:cycle<6?cycle/6:cycle<60?1:cycle<66?(66-cycle)/6:0;
      const y=430+4*down;
      const ring=cycle<6?cycle/6:(cycle%20)/20;
      if (!ui.reduced&&cycle<66) circle(c,180,y,10+12*ring,null,rgba(colors.text,.65*(1-ring)),2);
      drawHand(c,180,y,1,-.24);
      if (!ui.reduced&&cycle>=6&&cycle<60) {
        circle(c,180,y-27,14,rgba(colors.ink,.9),colors.textDim);
        c.beginPath();
        c.arc(180,y-27,11,-Math.PI/2,-Math.PI/2+twoPi*(cycle-6)/54);
        c.strokeStyle=ui.demoPower>=JD.SPRING.perfectLo?colors.jackpot:colors.combo1;
        c.lineWidth=3; c.stroke();
      }
      return;
    }
    if (messages.length>1) {
      box(c,17,108,326,44,8,rgba(colors.ink,.68));
      label(c,messages[0],180,128,18,colors.text,'center',{max:310});
      label(c,messages[1],180,147,14,colors.hint,'center',{max:310});
    }
  }

  function panel(c,s,ui,fx) {
    const {shot,payout}=s;
    const fired=fresh(fx,'shot_fired');
    if (fired?.e.perfect&&fired.age<30) {
      const age=fired.age;
      const scale=ui.reduced?1:age<5?.6+.12*age:1+.2*Math.max(0,1-(age-5)/12);
      const x=shot?12:300;
      const y=shot?108:92;
      label(c,'PERFECT!',x,y,22*scale,colors.jackpot,shot?'left':'center',{outline:colors.ink,max:shot?126:145});
    }
    if (shot) {
      const mult=Math.max(s.stageMult,shot.liveMult-(fx?fx.pendingMult():0));
      const hit=fresh(fx,'peg_hit');
      const pop=hit&&hit.age<4&&!ui.reduced?1+.12*Math.sin(hit.age*Math.PI/4):1;
      const bank=Math.max(0,shot.bankIn-(fx?.pendingBank?.()||0));
      const base=bank?'('+score(shot.pts)+' + '+score(bank)+')':score(shot.pts);
      box(c,150,84,180,32,16,rgba(colors.ink,.7),shot.tier?combo(shot.tier):colors.laneEdge,2);
      label(c,base,162,109,(bank?20:28)*pop,bank?colors.bank:colors.text,'left',{max:99,minSize:18});
      label(c,'× '+score(mult),316,108,22,colors.jackpot,'right',{max:54,minSize:19});
      if (shot.tier) {
        const award=JD.CFG.COMBO_NAMES[shot.tier]+' +'+JD.CFG.COMBO_BONUS[shot.tier];
        label(c,award,240,146,25+shot.tier,combo(shot.tier),'center',{outline:colors.ink,max:174,minSize:22});
      }
      return;
    }
    if (!payout) return;
    const reveal=payout.elapsed-payout.pins.length*payout.spacing;
    const tint=(reveal>=20&&payout.jackpot)||(reveal>=0&&payout.mult>=4)?colors.jackpot:colors.laneEdge;
    const pop=fresh(fx,'payout_pop',payout.pins[Math.max(0,Math.floor(payout.elapsed/payout.spacing)-1)]?.id);
    const bump=pop?.age<5&&!ui.reduced?1+.08*(1-pop.age/5):1;
    const base=payout.bankIn?'('+score(payout.pts)+' + '+score(payout.bankIn)+')':score(payout.pts);
    const factor=age=>ui.reduced?1:1+.6*Math.max(0,1-age/20);
    box(c,150,84,180,32,16,rgba(colors.ink,.7),tint,2);
    label(c,base,162,108,22*bump,payout.bankIn?colors.bank:colors.text,'left',{max:68,minSize:17});
    if (reveal>=0) label(c,'× '+score(payout.mult),276,108,20*factor(reveal),reveal>=20&&payout.mult<4?colors.text:colors.jackpot,'right',{max:42,minSize:17});
    if (reveal>=20) label(c,'× '+score(payout.bucketSum),320,108,20*factor(reveal-20),payout.jackpot?colors.jackpot:colors.text,'right',{max:42,minSize:17});
    if (reveal>=40) {
      const progress=clamp((reveal-40)/30,0,1);
      const travel=ui.reduced?0:progress*progress;
      c.save();
      c.globalAlpha=1-travel;
      label(c,'= '+score(payout.score),240-60*travel,143-110*travel,32-16*travel,colors.jackpot,'center',{outline:colors.ink,max:174});
      c.restore();
    }
  }

  function drawBalls(c,s,ui,fx,t) {
    if(s.state==='AIM'&&s.ball) {
      const p=Math.max(s.power,ui.demoPower);
      ball(c,s.ball,376,540+p*24,JD.BALLS[s.ball].r,{});
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
      ball(c,s.launch.ball,q[0],q[1],JD.BALLS[s.launch.ball].r,{});
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
      const kind=b.ball||s.shot.ball;
      ball(c,kind,x,y,r,{cracked:kind==='glass'&&s.shot.cracked});
    });
  }

  function hud(c,s,ui,fx) {
    const payout=s.payout;
    const earned=payout?payout.score*clamp((payout.elapsed-(payout.duration-30))/30,0,1):0;
    const displayed=s.stageScore+earned;
    const win=displayed>=s.target;
    label(c,s.endless?'ENDLESS '+s.stage:'STAGE '+s.stage+'/8',12,27,14,s.endless?colors.jackpot:colors.text,'left',{max:80});
    const clear=fresh(fx,'stage_clear');
    const bump=clear&&clear.age<6&&!ui.reduced ? .1*Math.sin(clear.age*Math.PI/6) : 0;
    const barHeight=18*(1+bump);
    box(c,96,23-barHeight/2,168,barHeight,9,rgba(colors.text,.12));
    box(c,96,23-barHeight/2,168*clamp(displayed/s.target,0,1),barHeight,9,win?colors.success:colors.jackpot);
    label(c,score(displayed)+' / '+score(s.target),180,28,16,colors.text,'center',{outline:colors.ink,max:158,minSize:13});
    label(c,'BALLS',291,26,12,colors.textDim);
    label(c,String(s.ballsLeft),326,30,22,s.ballsLeft===1?colors.danger:colors.text);
    const mult=s.shot?Math.max(s.stageMult,s.shot.liveMult-(fx?fx.pendingMult():0)):s.stageMult;
    label(c,'×'+score(mult),12,66,22,mult>=4?colors.jackpot:colors.text,'left',{max:100});
  }

  JD.createRenderer = function (canvas) {
    const c=canvas.getContext('2d');
    const magazine={key:'',stage:null,at:0,from:new Map(),targets:new Map()};
    return function draw(s,ui,fx,t) {
      const rect=canvas.getBoundingClientRect(), dpr=Math.min(window.devicePixelRatio||1,2);
      const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
      if(canvas.width!==w||canvas.height!==h) { canvas.width=w;canvas.height=h; }
      c.setTransform(w/440,0,0,h/640,0,0);
      background(c,s,fx);
      drawMagazine(c,s,ui,t,magazine,fx);
      c.save();
      c.beginPath(); c.rect(0,0,392,640); c.clip();
      if(fx) fx.world(c,s,ui);
      buckets(c,s,ui,fx,t,true);
      buckets(c,s,ui,fx,t,false);
      lane(c,s,ui,fx,t);
      if(JD.drawBoardObjects) JD.drawBoardObjects(c,s,ui,fx,t);
      if (s.state!=='CARD'&&s.state!=='RESULT') {
        // Keep the score fixed, then paint even high rebounds in front of it.
        c.save();
        c.setTransform(w/440,0,0,h/640,0,0);
        hud(c,s,ui,fx);
        panel(c,s,ui,fx);
        c.restore();
      }
      drawBalls(c,s,ui,fx,t);
      if(fx) fx.draw(c);
      c.restore();
      if(fx) fx.overlay(c,s,ui);
      drawAim(c,s,ui,fx,t);
      if(JD.drawScreens) JD.drawScreens(c,s,ui,fx,t);
      if(JD.drawCardReward) JD.drawCardReward(c,s,ui);
      if(ui.paused) drawPause(c,ui.pauseFocus);
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
    if (peg.lit&&peg.touches>0) D.line(ctx,peg.x-4*bounce,peg.y-2*bounce,peg.x+4*bounce,peg.y+3*bounce, D.colors.jackpot,1.2);
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
    if (!breaking&&!snapshot.parked.some(ball=>ball.group===group.id)) {
      D.label(ctx,'IRON',(left+right)/2,top-9,9,C.ironEdge,'center',{outline:'#0B0E2A'});
    }
    ctx.restore();
  }

  function savedPillPosition(group) {
    let left=360,right=0,top=640;
    for(const [x1,y1,x2,y2] of group.segs) {
      left=Math.min(left,x1,x2);
      right=Math.max(right,x1,x2);
      top=Math.min(top,y1,y2);
    }
    return {x:(left+right)/2,y:Math.max(520,top-32)};
  }

  function drawParked(ctx,s,ui,fx,time,D) {
    const C=D.colors;
    const byGroup=new Map();
    for(const token of s.parked) {
      const {x,y,r,group}=token;
      const arrival=D.fresh(fx,'ball_parked',group);
      const age=arrival&&Math.abs(arrival.e.x-x)<.01&&Math.abs(arrival.e.y-y)<.01?arrival.age:Infinity;
      const squash=age<6&&!ui.reduced?1-.15*Math.sin(age*Math.PI/6):1;
      const halo=age<6&&!ui.reduced?20+(r+3-20)*age/6:r+3;
      D.ball(ctx,token.ball,x,y,r*squash,{cracked:token.ball==='glass'});
      D.circle(ctx,x,y,halo,null,D.rgba(C.bank,.5+.4*D.pulse(time,40)),1.5);
      const info=byGroup.get(group)||{count:0,points:0};
      info.count++;
      info.points+=token.bank;
      byGroup.set(group,info);
    }

    for(const group of s.iron) {
      const entry=byGroup.get(group.id);
      const release=D.fresh(fx,'parked_release',group.id);
      if(!entry && !(release?.age<8)) continue;
      const {x,y}=savedPillPosition(group);
      if(!entry) {
        const alpha=.85*(1-release.age/8);
        const cx=D.clamp(x,82,278);
        D.box(ctx,cx-60,y-10,120,20,10,D.rgba(C.jackpot,alpha*.45),D.rgba(C.jackpot,alpha),1.5);
        continue;
      }
      const saved='SAVED ×'+entry.count;
      const bank=entry.points?' · '+D.score(entry.points):'';
      const finish=D.fresh(fx,'shot_finished');
      const bump=finish?.age<8&&finish.e.parked&&!ui.reduced?1+.3*Math.sin(finish.age*Math.PI/8):1;
      ctx.save();
      ctx.font='900 13px '+D.fontFamily;
      const leftWidth=ctx.measureText(saved).width;
      const rightWidth=bank?ctx.measureText(bank).width*bump:0;
      const width=Math.min(244,leftWidth+rightWidth+20);
      const left=D.clamp(x-width/2,24,336-width);
      D.box(ctx,left,y-10,width,20,10,D.rgba(C.ink,.91),C.ironEdge,1.5);
      D.label(ctx,saved,left+10,y+4,13,C.text,'left',{max:width-20});
      if(bank) D.label(ctx,bank,left+10+leftWidth,y+4,13*bump,C.bank,'left',{max:width-20-leftWidth,minSize:12});
      ctx.restore();
    }
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
      } else if (D.fresh(fx,'peg_break',peg.id)?.age<2) {
        D.circle(ctx,peg.x,peg.y,7,D.colors.text);
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
    drawParked(ctx,snapshot,ui,fx,time,D);
    if (snapshot.warps) snapshot.warps.ins.forEach(hole => drawWarp(ctx, hole, time, D));
  };
}(window.JD));

(function (JD) {
  'use strict';

  const cards = {
    goldPlus: ['GOLD RUSH', '+3 gold pegs on every board', '✦', 'jackpot'],
    heavy: ['RICH PEGS', '+10 points per blue/gold peg', '✦', 'pegNormal'],
    bombPlus: ['BIG BANG', '+2 bombs, blast radius +16', '●', 'pegBomb'],
    fever: ['HOT START', 'Stage multiplier starts +1', '×', 'jackpot'],
    jackpot: ['WIDE JACKPOT', '×5 buckets 40px wider', '×5', 'jackpot'],
    gate: ['MULTI BALL', '+1 green gate on every board', '+1', 'gatePlus'],
    extra: ['EXTRA BALL', '+1 ball every stage', '+', 'pegNormal'],
    split: ['SPLIT SHOT', '+1 ball on first new peg hit', '÷', 'text'],
    ballIron: ['IRON BALL', 'Breaks iron walls,\nblocks take 2 damage', '', 'iron'],
    ballGlass: ['GLASS BALL', 'Cracks at 12 hits,\nshatters into 3 at 24', '', 'glass'],
    ballBig: ['BIG BALL', 'Bigger ball, more hits', '', 'glass']
  };

  const previewNames = {1:'IRON LID',2:'CURVE · GATES',3:'BLOCKS ×+1 · WARP',7:'THE VAULT ×+3',8:'ENDLESS'};
  const previewJackpots = {center:'JACKPOT ▼',left:'JACKPOT ◀',right:'JACKPOT ▶',twin:'TWIN JACKPOT'};
  const resultStats = [
    ['BEST STAGE',null],['BIGGEST SHOT','biggestShot'],['JACKPOTS','jackpots'],
    ['PERFECT SHOTS','perfects'],['BEST COMBO','bestTier'],
    ['PEGS POPPED','pegsPopped'],['BLOCKS BROKEN','blocksBroken']
  ];

  function preview(s) {
    const next=JD.stageDef(s.stage);
    const current=JD.stageDef(s.stage-1);
    const suffix=next.buckets===current.buckets?'':' · '+previewJackpots[next.buckets];
    return 'NEXT: '+(previewNames[s.stage]||next.name)+suffix;
  }

  function effectLines(ctx,text,width,size,D) {
    const lines=text.split('\n');
    if(lines.length>1) return lines;
    lines[0]='';
    ctx.save();
    ctx.font='600 '+size+'px '+D.bodyFamily;
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
    const fixed=s.offer.length===1;
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
    D.box(ctx,x,y+5,w,h,fixed?18:14,'#080A20');
    D.box(ctx,x,y,w,h,fixed?18:14,face,focus||selectedAge!==null?C.text:C[token],focus||selectedAge!==null?3:1.5);
    if (fixed) {
      drawIcon(ctx,id,cx,y+48,40,D);
      D.label(ctx,name,cx,y+110,26,C.text,'center',{max:w-30});
      effectLines(ctx,effect,w-38,16,D).forEach((value,i)=>
        D.label(ctx,value,cx,y+134+i*18,16,C.text,'center',{body:true,max:w-38,minSize:14}));
      rackPreview(ctx,s.fullRack,id,cx,y+180,w-60,8,D);
    } else {
      D.label(ctx,String(index+1),43,y+19,12,focus?C.text:C.textDim);
      drawIcon(ctx,id,x+34,y+49,24,D);
      D.label(ctx,name,x+63,y+31,21,C.text,'left',{max:w-80,minSize:19});
      effectLines(ctx,effect,w-81,15,D).forEach((value,i)=>
        D.label(ctx,value,x+63,y+51+i*17,15,C.text,'left',{body:true,max:w-81,minSize:13}));
      if (JD.CARD_BALL[id]) {
        rackPreview(ctx,s.fullRack,id,x+152,y+86,176,5,D);
        D.label(ctx,'NEW BALL',x+w-14,y+91,12,C[token],'right');
      } else {
        const level=s.up[id]||0;
        D.label(ctx,'Lv '+level+' → '+(level+1),x+w-14,y+89,12,C.textDim,'right');
      }
    }
    ctx.restore();
  }

  function drawCardScreen(ctx,s,ui,t,D) {
    const C=D.colors;
    const fixed=s.offer.length===1;
    D.box(ctx,0,0,440,640,0,D.rgba(C.ink,.75));
    D.label(ctx,fixed?'NEW BALL!':'PICK ONE',196,120,fixed?28:24,fixed?C.jackpot:C.text);
    D.label(ctx,preview(s),196,146,15,C.textDim,'center',{max:352,minSize:11});
    for(let i=0;i<s.offer.length;i++) {
      if(ui.stateAge>=6*i||ui.reduced) drawCard(ctx,s,i,ui,D);
    }
    if(fixed) {
      const alpha=ui.reduced?1:.75+.25*D.pulse(t,30);
      D.label(ctx,'TAP TO TAKE',196,452,16,D.rgba(C.text,alpha));
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

  function drawBanner(ctx,s,ui,t,D) {
    const C=D.colors;
    const b=s.banner;
    const clear=b.kind==='clear';
    const allClear=b.kind==='allclear';
    const flash=ui.reduced?0:1-D.clamp(ui.stateAge/12,0,1);
    const tint=clear?C.success:allClear?C.jackpot:b.ratio>=80?C.danger:C.text;
    const bonus=clear?Math.round(s.target/10)*s.ballsLeft:0;
    const subtitle=allClear?'ENDLESS MODE':bonus>0?'BALL BONUS +'+D.score(bonus):'';
    const title=allClear?'ALL CLEAR!':clear?'STAGE CLEAR!':b.ratio>=80?'SO CLOSE!':'OUT OF BALLS';
    D.box(ctx,12,269,336,b.kind==='fail'?112:subtitle?109:82,18,'#10152D',D.rgba(tint,.58),1.5);
    D.label(ctx,title,180,322,36,tint,'center',{max:312,minSize:34});
    if(b.kind==='fail') {
      D.label(ctx,b.ratio+'%',180,350,24,tint);
      drawRatio(ctx,b.ratio,180,360,t,D);
    } else if (subtitle) D.label(ctx,subtitle,180,354,23,C.text,'center',{max:300,minSize:20});
    if(allClear&&flash) D.box(ctx,3,3,386,634,6,null,D.rgba(C.jackpot,flash*.75),6);
  }

  function drawResult(ctx,s,ui,t,D) {
    const r=s.result,C=D.colors;
    const title=r.won?'JACKPOT RUN!':r.ratio>=80?'SO CLOSE!':'OUT OF BALLS';
    const tint=r.won?C.jackpot:r.ratio>=80?C.danger:C.text;
    const shownScore=Math.round(r.runScore*D.clamp(ui.stateAge/40,0,1));
    D.box(ctx,0,0,440,640,0,D.rgba(C.ink,.94));
    D.label(ctx,title,196,150,32,tint,'center',{max:352,minSize:28});
    if(r.won) D.label(ctx,'ALL CLEAR · REACHED STAGE '+r.stageReached,196,176,14,C.jackpot,'center',{max:352,minSize:13});
    D.label(ctx,stageLabel(s)+' · '+r.ratio+'%',196,200,18,C.text,'center',{max:352,minSize:16});
    drawRatio(ctx,r.ratio,196,210,t,D);
    D.label(ctx,'RUN SCORE',196,250,16,C.textDim);
    D.label(ctx,D.number(shownScore),196,289,40,C.text,'center',{max:344,minSize:37});
    const best=s.practiceStart?'PRACTICE · START '+s.practiceStart:ui.newBest?'NEW BEST!':'BEST '+D.score(ui.saved.best);
    if(ui.newBest&&!s.practiceStart) D.box(ctx,146,298,100,18,9,D.rgba(C.jackpot,.18),C.jackpot);
    D.label(ctx,best,196,311,13,ui.newBest&&!s.practiceStart?C.jackpot:C.textDim,'center',{max:346,minSize:12});
    D.box(ctx,42,318,308,137,11,'#131834',D.rgba(C.laneEdge,.62));
    resultStats.forEach(([label,key],i)=>{
      const y=332+i*19;
      const value=key==='bestTier'?JD.CFG.COMBO_NAMES[r.bestTier]||'—':D.score(key?r[key]:ui.saved.bestStage);
      const emphasis=i===0&&ui.newBestStage&&!s.practiceStart;
      const color=key==='bestTier'?D.combo(r.bestTier):emphasis?C.jackpot:C.text;
      if(i>0) D.line(ctx,51,y-14,341,y-14,D.rgba(C.laneEdge,.28));
      D.label(ctx,label,56,y,14,emphasis?C.jackpot:C.textDim,'left',{body:true});
      D.label(ctx,value,336,y,15,color,'right',{max:132,minSize:13});
    });
    D.menuButton(ctx,JD.UI.result,'PLAY AGAIN',true,ui.focus===0);
    rackRow(ctx,r.rack,196-(r.rack.length-1)*23/2,571,23,8,D);
    D.label(ctx,'SEED '+s.seed,376,610,12,C.textDim,'right',{max:170});
  }

  JD.drawScreens = function (ctx,s,ui,fx,t) {
    const D = JD.Drawing;
    if(s.state === 'BANNER') drawBanner(ctx,s,ui,t,D);
    else if(s.state === 'CARD') drawCardScreen(ctx,s,ui,t,D);
    else if(s.state === 'RESULT') drawResult(ctx,s,ui,t,D);
  };

  JD.drawCardReward = function (ctx,s,ui) {
    const notice=ui.cardNotice;
    if(!notice?.before||s.state!=='AIM') return;
    const {event,before,age}=notice;
    const id=event.id;
    const index=before.offer.indexOf(id);
    if(index<0) return;
    const D=JD.Drawing;
    if(age<12&&!ui.reduced) drawCard(ctx,before,index,ui,D,age);
    const kind=JD.CARD_BALL[id];
    if(!kind) return;
    const fullIndex=s.fullRack.findIndex((value,i)=>value!==before.fullRack[i]);
    const slot=s.rackIndices.indexOf(fullIndex);
    const destination=JD.UI.magazine(s).find(item=>item.slot===slot);
    if(!destination) return;
    const card=JD.UI.cards(before)[index];
    const fixed=before.offer.length===1;
    const startX=fixed?card.x+card.w/2:card.x+34;
    const startY=card.y+(fixed?48:49);
    const progress=ui.reduced?1:D.clamp((age-8)/20,0,1);
    if(progress===0) return;
    const x=startX+(416-startX)*progress;
    const y=startY+(destination.y-startY)*progress-(ui.reduced?0:48*Math.sin(Math.PI*progress));
    const land=Math.max(0,age-28);
    const bump=ui.reduced?1:1+.4*(1-Math.min(land/12,1));
    const tint=D.colors[cards[id][3]];
    if(progress<1) {
      D.line(ctx,x-11*progress,y-8,x,y,D.rgba(tint,.7),2);
      D.ball(ctx,kind,x,y,JD.BALLS[kind].r*(1.8-.3*progress),{cracked:kind==='glass'});
    } else if(land<13) {
      D.ball(ctx,kind,x,y,JD.BALLS[kind].r*1.5*bump,{cracked:kind==='glass'});
      D.circle(ctx,x,y,12+land*.75,null,D.rgba(tint,.8*(1-land/13)),2);
    }
  };
}(window.JD));
