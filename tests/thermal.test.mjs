import assert from 'node:assert/strict';
import test from 'node:test';
import { World, W, H, M, tile } from '../src/world.ts';
import { rasterize } from '../src/raster.ts';
import { normal, changeLayer, isChecked } from '../src/views.ts';

const at = (x, y) => x + y * W;
function run(world, ticks) {
  for (let n = 0; n < ticks; n++) world.step();
}
function single(world, id) {
  const i = world.cells.indexOf(id);
  assert.ok(i >= 0, 'Missing ' + Object.keys(M).find((k) => M[k] === id));
  return i;
}
function brush(w, tool, material, taps) {
  const i = single(w, material);
  for (let n = 0; n < taps; n++) w.paint(tool, i % W, Math.floor(i / W), 0);
  w.step();
}
test('material temperature travels with a grain; neighboring wood and downwind air exchange heat', () => {
  const w = new World();
  w.paint('Sand', 25, 25, 0);
  w.paint('Heat', 25, 25, 0);
  w.step();
  assert.equal(single(w, M.Sand), at(25, 26));
  assert.ok(w.temperature[at(25, 26)] > 200);
  w.paint('Wood', 80, 80, 0);
  w.paint('Wood', 81, 80, 0);
  w.paint('Heat', 80, 80, 0);
  w.step();
  assert.ok(w.temperature[at(81, 80)] > 25);
  const a = new World();
  a.paint('Heat', 80, 80, 0);
  a.u[tile(80, 80)] = 2;
  a.step();
  assert.ok(a.airTemperature[tile(84, 80)] > a.airTemperature[tile(76, 80)] + 4);
});
test('water holds at a phase threshold, freezes, melts, boils and condenses', () => {
  const w = new World();
  w.paint('Water', 60, 40, 0);
  w.temperature[at(60, 40)] = -8;
  w.step();
  assert.equal(w.temperature[single(w, M.Water)], 0);
  brush(w, 'Cool', M.Water, 1);
  single(w, M.Ice);
  brush(w, 'Heat', M.Ice, 1);
  single(w, M.Water);
  brush(w, 'Heat', M.Water, 1);
  single(w, M.Steam);
  brush(w, 'Cool', M.Steam, 3);
  single(w, M.Water);
});
test('wet sand releases one steam cell as it dries', () => {
  const w = new World();
  w.paint('Water', 21, 20, 0);
  w.paint('Sand', 20, 20, 0);
  w.step();
  brush(w, 'Heat', M.WetSand, 1);
  single(w, M.Sand);
  single(w, M.Steam);
  assert.equal(w.cells.filter(Boolean).length, 2);
});
test('both mineral families flow when molten, solidify, and remelt', () => {
  for (const [tool, liquid, solid, taps] of [
    ['Sand', M.MoltenGlass, M.Glass, 8],
    ['Gravel', M.Lava, M.Rock, 6],
  ]) {
    const w = new World();
    w.paint(tool, 30, 20, 0);
    brush(w, 'Heat', M[tool], taps);
    assert.equal(single(w, liquid), at(30, 21));
    brush(w, 'Cool', liquid, 6);
    const fixed = single(w, solid);
    run(w, 3);
    assert.equal(single(w, solid), fixed);
    brush(w, 'Heat', solid, 6);
    single(w, liquid);
  }
});
test('a passing flame only warms wood; sustained heat chars, burns out and can be quenched', () => {
  const w = new World();
  w.paint('Wood', 40, 80, 0);
  w.paint('Flame', 40, 79, 0);
  w.step();
  assert.equal(w.cells[at(40, 80)], M.Wood);
  assert.ok(w.temperature[at(40, 80)] > 20);
  w.paint('Heat', 40, 80, 0);
  w.step();
  assert.equal(w.cells[at(40, 80)], M.Char);
  w.step();
  assert.equal(w.cells[at(40, 80)], M.Ember);
  w.paint('Water', 41, 80, 0);
  w.step();
  assert.equal(w.cells[at(40, 80)], M.Char);
  const dry = new World();
  dry.paint('Wood', 40, 80, 0);
  dry.paint('Heat', 40, 80, 0);
  run(dry, 220);
  single(dry, M.Ash);
});
test('all eight overlay combinations are distinct and leave physics untouched', () => {
  const w = new World('Tunnel');
  w.paint('Pressure', 80, 60, 0);
  run(w, 9);
  const twins = new World('Tunnel');
  twins.paint('Pressure', 80, 60, 0);
  run(twins, 9);
  const outputs = new Set();
  for (let mask = 0; mask < 8; mask++) {
    const layers = { Pressure: !!(mask & 1), Air: !!(mask & 2), Heat: !!(mask & 4) };
    const pixels = Buffer.alloc(W * H * 4);
    rasterize(w, layers, pixels);
    outputs.add(pixels.toString('base64'));
    assert.equal(isChecked(layers, 'Normal'), mask === 0);
  }
  assert.equal(outputs.size, 8);
  w.step();
  twins.step();
  for (const key of ['cells', 'temperature', 'airTemperature', 'pressure', 'u', 'v'])
    assert.deepEqual(w[key], twins[key]);
  const both = changeLayer(changeLayer(normal, 'Heat', true), 'Air', true);
  assert.deepEqual(changeLayer(both, 'Air', false), { ...normal, Heat: true });
  assert.deepEqual(changeLayer(both, 'Normal', true), normal);
});
test('air streamlines point downwind, animate with ticks and stop at a wall', () => {
  const w = new World(),
    buffer = Buffer.alloc(W * H * 4);
  const lit = (x, y) => buffer[4 * at(x, y) + 1] > 140;
  const camera = { ...normal, Air: true };
  w.u[tile(0, 4)] = w.u[tile(4, 4)] = 1;
  rasterize(w, camera, buffer);
  assert.ok(lit(7, 4));
  assert.ok(!lit(2, 4));
  const before = Buffer.from(buffer);
  w.ticks += 5;
  rasterize(w, camera, buffer);
  assert.ok(!before.equals(buffer));
  w.u[tile(0, 4)] = w.u[tile(4, 4)] = -1;
  rasterize(w, camera, buffer);
  assert.ok(lit(2, 4));
  assert.ok(!lit(7, 4));
  w.paint('Wall', 4, 4);
  rasterize(w, camera, buffer);
  assert.ok(!lit(6, 5));
});
