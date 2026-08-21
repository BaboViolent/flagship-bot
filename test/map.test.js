import test from 'node:test';
import assert from 'node:assert/strict';
import { NavigationGrid } from '../src/map.js';

function grid(width, height, walls = []) {
  const cells = new Uint8Array(width * height).fill(0x80);
  for (const [x, y] of walls) cells[y * width + x] = 1;
  return new NavigationGrid(width, height, cells);
}

test('tile navigation chooses a committed waypoint around a wall', () => {
  const map = grid(7, 7, [[3, 2], [3, 3], [3, 4]]);
  const next = map.navigate([1.5, 3.5], [5.5, 3.5]);
  assert.notDeepEqual(next, [5.5, 3.5]);
  assert.equal(map.passable(Math.floor(next[0]), Math.floor(next[1])), true);
});

test('direct route is retained when it has player-radius clearance', () => {
  const map = grid(7, 7);
  assert.deepEqual(map.navigate([1.5, 3.5], [5.5, 3.5]), [5.5, 3.5]);
});
