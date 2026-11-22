(function (JD, window) {
  'use strict';

  const C5=523.251, D5=587.330, E5=659.255, G5=783.991;
  const C6=1046.502, E6=1318.510, G6=1567.982;
  const comboNotes = [[], [C5,E5], [D5,739.989], [E5,830.609], [G5,987.767,1174.659]];

  JD.createAudio = function (initialMuted) {
    const voices = new Set();
    const contacts = new Map();
    let muted = !!initialMuted;
    let context, master, noiseBuffer, previousAngle = 0, frameNumber = 0;
    let activePegTones = 0;

    function activate() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (muted || !AudioContext) return;
      try {
        if (!context) {
          context = new AudioContext();
          master = context.createGain();
          master.gain.value = .6;
          master.connect(context.destination);
        }
        if (context.state === 'suspended') context.resume().catch(() => {});
      } catch (_) { /* The board can be played without audio. */ }
    }

    function dispose(voice) {
      if (!voices.delete(voice)) return;
      if (voice.peg) activePegTones--;
      voice.source.disconnect();
      voice.gain.disconnect();
      if (voice.filter) voice.filter.disconnect();
    }

    function schedule(source, gain, filter, start, end, peg) {
      if (filter) {
        source.connect(filter);
        filter.connect(gain);
      } else source.connect(gain);
      gain.connect(master);
      const voice = { source, gain, filter, peg };
      if (peg) activePegTones++;
      voices.add(voice);
      source.onended = () => dispose(voice);
      source.start(start);
      if (end !== null) source.stop(end);
      return voice;
    }

    function envelope(gain, start, end, volume) {
      const attack = Math.min(.008, (end - start) / 4);
      gain.gain.setValueAtTime(.001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + attack);
      gain.gain.exponentialRampToValueAtTime(.001, end);
    }

    function tone(type, frequency, duration, volume, options) {
      const o = options || {};
      if (!context || muted || (o.peg && activePegTones >= 6)) return;
      const start = context.currentTime + (o.delay || 0), end = start + duration;
      const source = context.createOscillator();
      const gain = context.createGain();
      source.type = type;
      source.frequency.setValueAtTime(frequency, start);
      if (o.endHz) source.frequency.exponentialRampToValueAtTime(o.endHz, end);
      envelope(gain, start, end, volume);
      schedule(source, gain, null, start, end, o.peg);
    }

    function noise(type, startHz, endHz, duration, volume, delay) {
      if (!context || muted) return;
      if (!noiseBuffer) {
        noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const samples = noiseBuffer.getChannelData(0);
        for (let i=0; i<samples.length; i++) samples[i] = Math.random()*2-1;
      }
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      const start = context.currentTime + (delay || 0), end = start + duration;
      source.buffer = noiseBuffer;
      filter.type = type;
      filter.frequency.setValueAtTime(startHz, start);
      if (endHz !== startHz) filter.frequency.exponentialRampToValueAtTime(endHz, end);
      if (type === 'bandpass') filter.Q.value = 1.1;
      envelope(gain, start, end, volume);
      schedule(source, gain, filter, start, end, false);
    }

    function sequence(notes, length, type, volume, delay, gap) {
      notes.forEach((frequency,i) => tone(type, frequency, length, volume, {
        delay:(delay || 0)+i*(gap || length)
      }));
    }

    function chord(notes, length, type, volume, delay) {
      notes.forEach(frequency => tone(type,frequency,length,volume,{delay}));
    }

    function fanfare(delay) {
      sequence([C5,E5,G5], .10, 'sine', .29, delay);
      tone('sine',C6,.40,.36,{delay:(delay || 0)+.30});
    }

    function silverPing(delay) {
      chord([C6,G6],.12,'sine',.12,delay);
    }

    function vibrate(ms) {
      if (!muted && window.navigator && typeof window.navigator.vibrate === 'function') {
        window.navigator.vibrate(ms);
      }
    }

    function pause() {
      for (const voice of voices) {
        voice.source.stop();
        dispose(voice);
      }
      previousAngle = 0;
    }

    function mute(next) {
      muted = !!next;
      if (master) master.gain.value = muted ? 0 : .6;
      if (muted) pause();
    }

    function aimFrame(snapshot) {
      const angle = snapshot.charging ? snapshot.angle : 0;
      if (snapshot.chargeTicks === JD.CANNON.load) {
        tone('square',900,.015,.22);
        noise('bandpass',1900,1900,.02,.15);
      } else if (snapshot.chargeTicks > JD.CANNON.load && angle !== previousAngle && angle % 10 === 0) {
        tone('square',220,.01,.15);
        if (Math.abs(angle) === JD.CANNON.maxAngle) tone('square',460,.018,.13);
      }
      previousAngle = angle;
    }

    function rateLimited(event, gap=3, id=event.index, tick=frameNumber) {
      const key = event.type + ':' + id;
      const last = contacts.get(key);
      if (last !== undefined && tick - last < gap) return true;
      contacts.set(key,tick);
      return false;
    }

    function ballLanded(event) {
      if (event.mult === 5) {
        vibrate(30);
        sequence([C5,E5,G5,C6],.07,'sine',.30);
        sequence([2600,3100,2600,3100,2600,3100,2600,3100],.027,'sine',.08,.02,.038);
        noise('highpass',3100,3100,.40,.14);
      } else if (event.mult === 2) sequence([330,440],.08,'sine',.27);
      else tone('sine',110,.10,.3);
    }

    function gateSound(event) {
      switch (event.result) {
        case 'spawn': sequence([520,780,1040],.05,'square',.14); break;
        case 'capped': tone('sine',660,.04,.19); break;
        case 'removed': tone('square',440,.15,.16,{endHz:220}); break;
        case 'saved': sequence([660,660],.08,'sine',.24,0,.10); break;
      }
    }

    function event(e,snapshot) {
      switch (e.type) {
        case 'stage_started':
          contacts.clear();
          break;
        case 'tutorial_nudge':
          tone('sine',880,.06,.26);
          break;
        case 'charge_started':
          previousAngle = 0;
          break;
        case 'charge_zone':
          if (e.zone === 'perfect') {
            vibrate(12);
            tone('sine',1568,.085,.25);
          }
          break;
        case 'charge_cancel':
          tone('sine',150,.04,.29);
          break;
        case 'ball_picked':
        case 'reward_ball_arrived':
          sequence([900,1500],.015,'square',.18,0,.015);
          break;
        case 'shot_fired': {
          noise('lowpass',1400,520,.06,.24);
          tone('sine',160,.12,.36,{endHz:420});
          if(e.perfect) chord([C6,G6],.15,'sine',.18);
          break;
        }
        case 'wall_spring':
          tone('sine',300,.08,.23,{endHz:900});
          tone('sine',328,.06,.08,{endHz:850,delay:.01});
          break;
        case 'launch':
          noise('highpass',1500,1500,.08,.22);
          break;
        case 'peg_hit': {
          if(e.cause !== 'ball') break;
          const pitch=392*Math.pow(2,Math.min(e.n-1,24)/12);
          tone('triangle',pitch,.07,.26,{peg:true});
          if(e.pegType === 'gold') tone('sine',pitch*1.5,.12,.16,{peg:true});
          break;
        }
        case 'peg_break':
          noise('bandpass',5000,5000,.025,.15);
          break;
        case 'ball_hit':
          if (rateLimited(e,6,e.a+':'+e.b,e.tick)) break;
          tone('triangle',1800,.018,.13);
          tone('sine',900,.030,.07);
          break;
        case 'combo_up':
          chord(comboNotes[e.tier],.09,'square',e.tier === 4 ? .12 : .16);
          noise('highpass',3400,3400,.10,.11);
          break;
        case 'iron_hit':
          if(rateLimited(e,8,e.ball,e.tick)) break;
          tone('square',1400,.025,.14);
          tone('sine',300,.06,.24);
          break;
        case 'iron_break':
          noise('bandpass',2500,2500,.25,.34);
          tone('sine',120,.20,.43);
          break;
        case 'warp':
          tone('sine',900,.20,.32,{endHz:150});
          tone('sine',150,.12,.24,{delay:4/60,endHz:600});
          tone('sine',220,.05,.16,{delay:4/60});
          break;
        case 'bomb_exploded':
          noise('lowpass',900,120,.30,.72);
          tone('sine',60,.20,.63);
          break;
        case 'ball_split':
          sequence([660,880],.05,'square',.19);
          break;
        case 'ball_crack':
          noise('bandpass',3000,3000,.06,.27);
          break;
        case 'ball_shatter':
          noise('bandpass',4500,4500,.20,.48);
          tone('sine',2000,.12,.19);
          break;
        case 'gate_passed':
          gateSound(e);
          break;
        case 'block_hit': {
          if(e.cause === 'blast') break;
          const block = snapshot.blocks.find(candidate => candidate.id === e.id);
          const pitch=180*Math.pow(2,((block ? block.maxHp : e.hp)-e.hp)/12);
          tone('square',pitch,.05,.25);
          noise('highpass',950,950,.05,.15);
          if(snapshot.shot?.balls[0]==='iron') {
            tone('square',1200,.03,.13);
            tone('sine',600,.08,.20);
          } else if(block && block.kind === 'vault') silverPing();
          break;
        }
        case 'block_broken':
          if(e.kind === 'vault') {
            tone('sine',50,.40,.68);
            noise('highpass',2300,2300,.80,.18,.08);
            sequence([2600,3100,2750,3300,2600,3100,2750,3300],.042,'sine',.12,.08,.075);
          } else {
            noise('lowpass',2000,300,.20,.52);
            tone('sine',330,.20,.30,{endHz:660});
            silverPing();
          }
          break;
        case 'mult_land':
          if(e.vault) fanfare(0);
          else silverPing();
          break;
        case 'terrain_hit':
          if(!rateLimited(e)) tone('sine',140,.03,.40);
          break;
        case 'bumper_hit':
          if(!rateLimited(e)) tone('square',220,.04,.20);
          break;
        case 'stuck_clear':
          noise('highpass',800,800,.04,.17);
          break;
        case 'ball_landed':
          ballLanded(e);
          break;
        case 'slow_heartbeat':
          tone('sine',70,.06,.32);
          break;
        case 'payout_pop':
          tone('sine',880*Math.pow(2,Math.min(e.index || 0,24)/12),.03,.20);
          break;
        case 'stage_clear':
          if(snapshot.mode==='endless'||e.stage!==JD.STAGES.length&&!(e.stage===8&&e.firstClear)) fanfare(0);
          break;
        case 'endless_unlocked':
          tone('square',600,.030,.16);
          tone('sine',1200,.060,.15,{delay:.02});
          fanfare(.09);
          break;
        case 'coins_earned':
          if(e.amount>0) sequence([1600,1600],.040,'triangle',.12,0,.023);
          break;
        case 'perk_bought': {
          const base=440*Math.pow(2,(e.level-1)/12);
          sequence([base,base*1.5],.07,'sine',.20,0,.023);
          break;
        }
        case 'map_locked':
          tone('sine',170,.065,.24);
          break;
        case 'all_clear':
          fanfare(0);
          fanfare(.60);
          noise('highpass',2700,2700,.80,.14,.35);
          break;
        case 'stage_failed':
          sequence([392,262],.15,'sine',.32);
          break;
        case 'run_ended':
          if(e.newBest) fanfare(0);
          break;
      }
    }

    return {
      activate,mute,event,pause,
      frame(snapshot) {
        frameNumber++;
        aimFrame(snapshot);
      }
    };
  };
}(window.JD, window));
