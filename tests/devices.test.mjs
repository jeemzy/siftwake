import test from 'node:test';
import assert from 'node:assert/strict';
import { World, M, W, H, tile } from '../src/world.ts';
import { rasterize } from '../src/raster.ts';
import { brushStroke } from '../src/brushStroke.ts';

test('held brushes stamp once per crossed cell per tick and stop on release or cancellation', () => {
  const stroke = brushStroke();
  const stamps = [];
  const stamp = (cell) => stamps.push(cell);
  stroke.visit(5);
  stroke.visit(5);
  stroke.tick(stamp);
  stroke.tick(stamp);
  stroke.visit(6);
  stroke.visit(7);
  stroke.tick(stamp);
  stroke.release(stamp);
  stroke.tick(stamp);
  stroke.visit(9);
  stroke.cancel();
  stroke.tick(stamp);
  stroke.visit(10);
  stroke.release(stamp);
  assert.deepEqual(stamps, [5, 5, 6, 7, 10]);
});

test('sources require an empty air tile, reject fixed solids, and wait for an open outlet', () => {
  const w = new World();
  w.paint('Wood', 83, 83, 0);
  assert.equal(w.placeSource('Water', 80, 80, 3), false);
  assert.equal(w.cells[83 + W * 83], M.Wood);
  w.paint('Erase', 83, 83, 0);
  assert.equal(w.placeSource('Wood', 80, 80, 3), false);
  assert.ok(w.placeSource('Water', 80, 80, 3));
  assert.equal(w.placeSource('Heat', 82, 82, 6, 15), false);
  w.paint('Fan', 82, 82);
  for (const [x, y] of [[76,80], [84,80], [80,76]]) w.paint('Wall', x, y);
  w.paint('Pressure', 80, 84);
  w.step();
  assert.ok(!w.cells.some(Boolean));
  w.paint('Erase', 80, 84, 0);
  w.step();
  assert.equal(w.cells.filter(id => id === M.Water).length, 3);
  w.paint('Wall', 80, 80);
  for (const field of [w.device, w.devicePower, w.deviceRadius, w.deviceMaterial])
    assert.equal(field[tile(80, 80)], 0);
});

test('two material outlets and two thermal sources retain independent settings across a restore', () => {
  const w = new World();
  for (const [x, radius] of [[12, 1], [48, 6]]) assert.ok(w.placeSource(M.Water, x, 28, radius));
  assert.ok(w.placeSource('Heat', 16, 120, 3, 15));
  assert.ok(w.placeSource('Heat', 88, 120, 6, 80));
  assert.ok(w.placeSource('Cool', 40, 184, 3, 100));
  assert.ok(w.placeSource('Heat', 112, 184, 1, 0));
  assert.ok(!w.cells.some(Boolean));
  const restored = World.restore(w.snapshot());
  w.step();
  restored.step();
  assert.deepEqual(w.snapshot(), restored.snapshot());
  assert.equal(w.cells.filter((id, i) => id === M.Water && i % W < 30).length, 1);
  assert.equal(w.cells.filter((id, i) => id === M.Water && i % W > 30).length, 6);
  assert.ok(w.temperatureAt(18, 122) > 20);
  assert.ok(w.temperatureAt(90, 122) > w.temperatureAt(18, 122) + 80);
  assert.ok(w.temperatureAt(42, 186) < 20);
  assert.equal(w.temperatureAt(114, 186), 20);
  assert.equal(w.deviceRadius[tile(88, 120)], 6);
  assert.equal(w.devicePower[tile(88, 120)], 80);
  w.paint('Erase', 88, 120, 1);
  assert.equal(w.device[tile(88, 120)], 0);
});

test('thermal brush percentage applies to both matter and air immediately while paused', () => {
  const w = new World();
  w.paint('Wood', 51, 51, 0);
  w.paint('Heat', 51, 51, 0, 25);
  w.paint('Cool', 12, 12, 1, 50);
  w.paint('Heat', 51, 51, 0, 0);
  assert.equal(w.temperatureAt(51, 51), 75);
  assert.equal(w.temperatureAt(12, 12), -40);
  assert.equal(w.ticks, 0);
});

test('fan hit testing picks the nearest visible fan and rejects walls and blocked corners', () => {
  const w = new World();
  w.paint('Fan', 40, 40);
  w.paint('Fan', 52, 40);
  assert.equal(w.fanAt(49, 42, 11), tile(52, 40));
  assert.equal(w.fanAt(34, 42, 11), tile(40, 40));
  w.paint('Wall', 44, 40);
  assert.equal(w.fanAt(45, 42, 11), -1);
  assert.equal(w.fanAt(50, 42, 11), tile(52, 40));
  w.paint('Erase', 52, 40);
  assert.equal(w.fanAt(50, 42, 11), -1);
  assert.equal(w.fanAt(46, 46, 11), -1);
});

test('fan rotor, flow, and direction use each installed power and occupy one physics tile', () => {
  const w = new World();
  w.strength = 0;
  w.paint('Fan', 20, 20);
  w.strength = 1;
  w.paint('Fan', 80, 160);
  w.strength = 0.15;
  w.paint('Fan', 80, 160);
  assert.equal(w.device[tile(80, 160)], 2);
  assert.equal(w.devicePower[tile(80, 160)], 100);
  assert.equal(w.device.filter(Boolean).length, 2);
  const restored = World.restore(w.snapshot());
  function patch(x, y) {
    const pixels = new Uint8Array(W * H * 4);
    rasterize(restored, { Air: false, Heat: false, Pressure: false }, pixels);
    const result = [];
    for (let dy = -5; dy <= 6; dy++)
      for (let dx = -5; dx <= 6; dx++)
        result.push(pixels[4 * (x + dx + W * (y + dy))]);
    return result;
  }
  const stopped = patch(22, 22), moving = patch(82, 162);
  assert.equal(moving[11 * 12 + 5], 209); // Pointer at dx=0, dy=6, outside the physics tile.
  restored.step();
  assert.deepEqual(patch(22, 22), stopped);
  assert.notDeepEqual(patch(82, 162), moving);
  assert.equal(restored.u[tile(20, 20)], 0);
  assert.ok(restored.v[tile(80, 160)] > 0);
});
