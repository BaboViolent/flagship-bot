import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseObjective, chooseTarget, combatPermission } from '../src/strategy.js';

const state = (overrides = {}) => ({
  id: 4, team: 0,
  flags: [{ state: -2, position: [0, 0, 0] }, { state: -2, position: [10, 0, 0] }],
  players: new Map([[4, { id: 4, team: 0, status: 0, life: 1, position: [5, 0, 0] }]]),
  ...overrides,
});

test('a carrier commits to the capture instead of stopping short', () => {
  const s = state(); s.flags[1].state = 4;
  assert.deepEqual(chooseObjective(s), { kind: 'capture', utility: 1000, goal: [0, 0, 0] });
});

test('returning a dropped home flag outranks stealing', () => {
  const s = state(); s.flags[0] = { state: -1, position: [3, 2, 0] };
  assert.equal(chooseObjective(s).kind, 'recover');
});

test('enemy flag carrier is the highest threat target', () => {
  const s = state();
  s.players.set(5, { id: 5, team: 1, status: 0, position: [6, 0, 0] });
  s.players.set(6, { id: 6, team: 1, status: 0, position: [7, 0, 0] });
  s.flags[0].state = 6;
  assert.equal(chooseTarget(s).id, 6);
});

test('carrier avoids distant optional fights', () => {
  const s = state(); s.flags[1].state = 4;
  const target = { id: 5, team: 1, status: 0, position: [12, 0, 0] };
  assert.equal(combatPermission(s, chooseObjective(s), target), false);
});
