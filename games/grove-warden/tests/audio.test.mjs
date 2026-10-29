import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAudio } from '../audio.mjs';

class Parameter {
  value = 0;
  values = [];
  setValueAtTime(value, time) { this.values.push([value, time]); }
  exponentialRampToValueAtTime(value, time) { this.values.push([value, time]); }
  linearRampToValueAtTime(value, time) { this.values.push([value, time]); }
}
class AudioNode {
  connections = [];
  gain = new Parameter();
  connect(node) { this.connections.push(node); }
  disconnect() { this.disconnected = true; }
}
class FakeContext {
  state = 'suspended';
  currentTime = 0;
  destination = {};
  gains = [];
  oscillators = [];
  createGain() { const node = new AudioNode(); this.gains.push(node); return node; }
  createDynamicsCompressor() {
    const node = new AudioNode();
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = new Parameter();
    this.compressor = node; return node;
  }
  createOscillator() {
    const node = new AudioNode(); node.frequency = new Parameter();
    node.start = time => { node.startTime = time; };
    node.stop = time => { node.stopTime = time; };
    this.oscillators.push(node); return node;
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}
const setup = () => {
  const context = new FakeContext();
  return { context, audio: createGameAudio({ createContext: () => context }) };
};

test('audio stays lazy and muted until a user gesture wakes its separate buses', () => {
  const { audio, context } = setup();
  audio.play('hit'); assert.equal(context.oscillators.length, 0);
  audio.wake(); audio.play('hit'); audio.play('upgrade');
  assert.equal(context.oscillators.length, 6);
  assert.ok(context.gains[0].gain.value < .32);
  assert.ok(context.gains[1].gain.value < context.gains[2].gain.value);
  assert.equal(context.gains[1].connections[0], context.gains[0]);
  assert.equal(context.gains[2].connections[0], context.gains[0]);
  assert.equal(context.gains[0].connections[0], context.compressor);
  assert.equal(context.compressor.connections[0], context.destination);
});

test('combat leaves reserved voices for a reward and all finished nodes disconnect', () => {
  const { audio, context } = setup(); audio.wake();
  for (let i = 0; i < 8; i++) { audio.play('shoot'); context.currentTime += .2; }
  assert.equal(audio.stats().voices, 8);
  audio.play('level-up'); assert.equal(audio.stats().voices, 12);
  audio.play('player-hit'); assert.equal(audio.stats().voices, 12);
  for (const oscillator of context.oscillators) oscillator.onended();
  assert.equal(audio.stats().voices, 0);
  assert.ok(context.oscillators.every(node => node.disconnected));
});

test('rapid repeated cues throttle and successive attacks vary without changing reward tuning', () => {
  const { audio, context } = setup(); audio.wake();
  audio.play('shoot'); audio.play('shoot'); assert.equal(context.oscillators.length, 1);
  context.currentTime += .2; audio.play('shoot');
  assert.notEqual(context.oscillators[0].frequency.values[0][0], context.oscillators[1].frequency.values[0][0]);
  audio.play('deposit');
  assert.deepEqual(context.oscillators.slice(2).map(node => node.frequency.values[0][0]), [660, 880, 1320]);
  assert.ok(context.oscillators[4].startTime > context.oscillators[2].startTime);
});

test('all three burst shots can sound at their actual cadence while duplicate frames stay throttled', () => {
  const { audio, context } = setup(); audio.wake();
  for (const time of [0, .1, .2]) { context.currentTime = time; audio.play('staff-burst'); audio.play('staff-burst'); }
  assert.equal(context.oscillators.length, 3);
  audio.suspend(); assert.equal(audio.stats().voices, 0);
  assert.ok(context.oscillators.every(node => node.disconnected));
});

test('mute and pause cancel scheduled tones instead of replaying tails when resumed', () => {
  const { audio, context } = setup(); audio.wake(); audio.play('level-up');
  audio.setEnabled(false); assert.equal(audio.stats().voices, 0); assert.equal(context.state, 'suspended');
  audio.play('shoot'); assert.equal(context.oscillators.length, 4);
  audio.setEnabled(true); audio.play('hit'); assert.equal(audio.stats().voices, 3);
  audio.suspend(); assert.equal(audio.stats().voices, 0);
  audio.wake(); audio.play('hit'); assert.equal(audio.stats().voices, 3);
  audio.dispose(); audio.dispose(); audio.wake(); audio.play('hit');
  assert.equal(audio.stats().voices, 0); assert.equal(context.state, 'closed');
  assert.ok(context.gains.every(node => node.disconnected));
});

test('unsupported audio remains silent without preventing gameplay', () => {
  const audio = createGameAudio({ createContext: () => { throw new Error('unavailable'); } });
  assert.doesNotThrow(() => { audio.wake(); audio.play('hit'); audio.suspend(); audio.dispose(); });
});

test('a reward waits for asynchronous gesture resume and is cancelled if muted meanwhile', async () => {
  const { audio, context } = setup(); let finishResume;
  context.resume = () => new Promise(resolve => { finishResume = () => { context.state = 'running'; resolve(); }; });
  audio.wake(); audio.play('upgrade'); assert.equal(context.oscillators.length, 0);
  finishResume(); await Promise.resolve(); assert.equal(context.oscillators.length, 3);
  audio.suspend(); audio.wake(); audio.play('level-up'); audio.setEnabled(false);
  finishResume(); await Promise.resolve(); assert.equal(context.oscillators.length, 3);
  assert.equal(audio.stats().voices, 0);
});

test('impact noise reuses one buffer and its one-shot sources obey voice cleanup', () => {
  const { audio, context } = setup(); const sources = []; let buffers = 0;
  context.sampleRate = 48000;
  context.createBuffer = (_channels, length) => { buffers++; const data = new Float32Array(length); return { getChannelData: () => data }; };
  context.createBufferSource = () => {
    const node = new AudioNode(); node.playbackRate = new Parameter(); node.start = () => {}; node.stop = () => {};
    sources.push(node); return node;
  };
  audio.wake(); audio.play('hit'); context.currentTime += .2; audio.play('hit');
  assert.equal(buffers, 1); assert.equal(sources.length, 2);
  assert.equal(sources[0].buffer, sources[1].buffer);
  assert.ok(sources[0].buffer.getChannelData(0).some(value => value !== 0));
  assert.equal(audio.stats().voices, 6);
  audio.suspend(); assert.equal(audio.stats().voices, 0); assert.ok(sources.every(node => node.disconnected));
});
