import test from 'node:test';
import assert from 'node:assert/strict';
import { botHandshake, drainFrames, frame, NET } from '../src/protocol.js';

test('BOT1 handshake carries implementation and independent player identity', () => {
  const packet = botHandshake(7, { name: 'Flagship', version: '0.1.0', author: 'BaboViolent', playerName: '^4Flag^1ship' });
  let decoded;
  assert.equal(drainFrames(packet, (type, payload) => { decoded = { type, payload }; }).length, 0);
  assert.equal(decoded.type, NET.GAMEVERSION_ACCEPTED);
  assert.equal(decoded.payload[0], 7);
  assert.equal(new TextDecoder().decode(decoded.payload.slice(17, 21)), 'BOT1');
});

test('frame drainer retains partial data', () => {
  const packet = frame(42, new Uint8Array([1, 2, 3]));
  assert.deepEqual(drainFrames(packet.slice(0, 5), () => assert.fail()), packet.slice(0, 5));
});
