import test from 'node:test';
import assert from 'node:assert/strict';
import { createZoneEntryGate } from '../zone-entry.mjs';

const player = { id: 'upgrade:player', stationKey: 'player' }, worker = { id: 'upgrade:worker', stationKey: 'worker' };
function hold(gate, zone, standing, frames) { const result = []; for (let i = 0; i < frames; i++) { const entered = gate.update(zone, standing, .05); if (entered) result.push(entered.id); } return result; }

test('walking across a floor upgrade circle never opens its menu, while a quarter-second stop opens once', () => {
  const gate = createZoneEntryGate();
  assert.deepEqual(hold(gate, player, false, 20), []);
  assert.deepEqual(hold(gate, player, true, 4), []);
  assert.deepEqual(hold(gate, player, true, 20), [player.id]);
});

test('closing a menu does not reopen it until leaving the circle or visiting another circle', () => {
  const gate = createZoneEntryGate(); gate.mark(player);
  assert.deepEqual(hold(gate, player, true, 100), []);
  assert.deepEqual(hold(gate, worker, true, 5), [worker.id]);
  gate.update(null, false, .05);
  assert.deepEqual(hold(gate, player, true, 5), [player.id]);
});

test('construction changing into an upgrade at the same plot does not reopen a dismissed menu', () => {
  const gate = createZoneEntryGate(); gate.mark({ id: 'unlock:inn', stationKey: 'inn' });
  assert.deepEqual(hold(gate, { id: 'upgrade:inn', stationKey: 'inn' }, true, 20), []);
  gate.reset(); assert.equal(hold(gate, player, true, 5).length, 1);
});
