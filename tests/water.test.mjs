import test from 'node:test';
import assert from 'node:assert/strict';
import { World, W, H, M } from '../src/world.ts';

function advance(world, ticks) {
  for (let t = 0; t < ticks; t++) world.step();
}

test('one water cell and one orthogonally touching grain produce wet sand in place', () => {
  const x = 60,
    y = 45,
    grain = x + y * W;
  for (const [dx, dy] of [
    [0, -1],
    [-1, 0],
    [0, 1],
    [1, 0],
  ]) {
    const w = new World();
    w.paint('Sand', x, y, 0);
    w.paint('Water', x + dx, y + dy, 0);
    w.step();
    assert.equal(w.cells[grain], M.WetSand);
    assert.equal(w.cells[grain + dx + dy * W], M.Empty);
    assert.equal(w.cells.filter(Boolean).length, 1);
    w.step();
    assert.equal(w.cells[grain + W], M.WetSand);
  }
});

test('competing water and sand contacts consume exactly one of each, without wrapping at edges', () => {
  for (const [center, neighbors, leftover] of [
    ['Water', 'Sand', M.Sand],
    ['Sand', 'Water', M.Water],
  ]) {
    const w = new World();
    w.paint(center, 40, 40, 0);
    for (const [x, y] of [
      [40, 39],
      [40, 41],
      [39, 40],
      [41, 40],
    ])
      w.paint(neighbors, x, y, 0);
    w.step();
    assert.equal(w.cells.filter((m) => m === M.WetSand).length, 1);
    assert.equal(w.cells.filter((m) => m === leftover).length, 3);
  }
  const w = new World();
  w.paint('Sand', W - 1, 10, 0);
  w.paint('Water', 0, 11, 0);
  w.paint('Water', W - 2, 9, 0);
  w.step();
  assert.equal(w.cells.includes(M.WetSand), false);
});

test('water falls, spreads over a basin floor and flows out through an opened drain', () => {
  function basin() {
    const w = new World();
    for (let x = 40; x <= 72; x += 4) w.paint('Wall', x, 100);
    for (let y = 68; y < 100; y += 4) {
      w.paint('Wall', 40, y);
      w.paint('Wall', 72, y);
    }
    w.paint('Water', 56, 74, 2);
    return w;
  }
  const w = basin(),
    twin = basin(),
    count = w.cells.filter((m) => m === M.Water).length;
  w.step();
  assert.equal(w.cells[56 + 77 * W], M.Water);
  advance(w, 149);
  advance(twin, 150);
  assert.deepEqual(w.cells, twin.cells);
  const water = Array.from(w.cells.keys()).filter((i) => w.cells[i] === M.Water);
  assert.equal(water.length, count);
  assert.ok(water.every((i) => Math.floor(i / W) === 99 && i % W >= 44 && i % W < 72));
  w.paint('Erase', 56, 100, 0);
  advance(w, 450);
  assert.equal(w.cells.filter((m) => m === M.Water).length, count);
  assert.ok(w.cells.subarray((H - 1) * W).includes(M.Water));
});

test('wet sand stays on a shallow ledge where a dry grain slides', () => {
  function ledge(wet) {
    const w = new World();
    for (let x = 44; x < 64; x += 4) w.paint('Wall', x, 100);
    w.paint('Wood', 52, 99, 0);
    w.paint('Sand', 52, 98, 0);
    if (wet) w.paint('Water', 52, 97, 0);
    advance(w, 12);
    return w;
  }
  assert.equal(ledge(true).cells[52 + 98 * W], M.WetSand);
  assert.equal(ledge(false).cells[52 + 98 * W], M.Empty);
});

test('gravel sinks through confined water and keeps the displaced water in the world', () => {
  const w = new World();
  for (let y = 92; y <= 98; y++) {
    w.paint('Wood', 49, y, 0);
    w.paint('Wood', 51, y, 0);
  }
  w.paint('Wood', 50, 98, 0);
  w.paint('Water', 50, 97, 0);
  w.paint('Gravel', 50, 96, 0);
  w.step();
  assert.equal(w.cells[50 + 97 * W], M.Gravel);
  assert.equal(w.cells[50 + 96 * W], M.Water);
});
