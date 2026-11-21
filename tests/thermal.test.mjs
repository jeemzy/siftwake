import assert from 'node:assert/strict';
import test from 'node:test';
import { World, W, H, A, M, tile } from '../src/world.ts';
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

function sealedTile() {
  const w = new World();
  for (const [x, y] of [[76, 80], [84, 80], [80, 76], [80, 84]]) w.paint('Wall', x, y);
  return w;
}

test('a thermal stroke changes temperature alone; a sealed chamber responds on later ticks and vents', () => {
  const t = tile(80, 80);
  for (const [tool, sign] of [['Heat', 1], ['Cool', -1]]) {
    const w = sealedTile();
    w.paint(tool, 82, 82, 1);
    assert.equal(w.pressure[t], 0);
    assert.equal(w.probeAt(82, 82).speed, 0);
    assert.ok(sign * (w.airTemperature[t] - 20) > 100);
    const twin = World.restore(w.snapshot());
    w.step();
    twin.step();
    const first = sign * w.pressure[t];
    assert.ok(first > 0 && first < 0.05);
    run(w, 120);
    run(twin, 120);
    assert.deepEqual(w.snapshot(), twin.snapshot());
    assert.ok(sign * w.pressure[t] > first * 10);
    assert.equal(w.pressure[t + 2], 0);
    assert.equal(w.airTemperature[t + 2], 20);
    assert.equal(w.u[t], 0);

    const held = sign * w.pressure[t];
    w.paint('Erase', 84, 80, 0);
    w.step();
    assert.ok(sign * w.u[t] > 0.1);
    run(w, 45);
    assert.ok(Math.abs(w.pressure[t]) < held * 0.25);
  }
});

test('a constant thermal source at equilibrium produces no further pressure or flow', () => {
  const t = tile(80, 80);
  for (const [tool, sign] of [['Heat', 1], ['Cool', -1]]) {
    const w = sealedTile();
    assert.ok(w.placeSource(tool, 82, 82, 1, 100));
    assert.equal(w.pressure[t], 0);
    run(w, 500);
    const pressure = w.pressure[t];
    const temperature = w.airTemperature[t];
    assert.ok(pressure * sign > 0.5 && Math.abs(pressure) <= 12);
    run(w, 240);
    assert.equal(w.airTemperature[t], temperature);
    assert.ok(Math.abs(w.pressure[t] - pressure) < 0.0001);
    assert.equal(w.pressure[t + 2], 0);
    assert.ok(w.u.every(v => v === 0) && w.v.every(v => v === 0));
  }
});

test('hot and cold air in a walled chamber carry heat in opposite directions as gravity rotates', () => {
  const t = tile(80, 80);
  for (const [tool, sign] of [['Heat', -1], ['Cool', 1]]) {
    for (const [gx, gy] of [[0, 1], [1, 0], [-0.6, -0.8]]) {
      const w = new World();
      for (let offset = 56; offset <= 108; offset += 4) {
        for (const [x, y] of [[56, offset], [108, offset], [offset, 56], [offset, 108]])
          w.paint('Wall', x, y);
      }
      w.paint(tool, 80, 80, 0);
      for (let k = 0; k < 8; k++) w.step({ gravityX: gx, gravityY: gy, shakeX: 0, shakeY: 0 });
      const vx = (w.u[t] + w.u[t - 1]) / 2;
      const vy = (w.v[t] + w.v[t - A]) / 2;
      assert.ok(sign * (gx * vx + gy * vy) > 0.02);
      assert.ok(Math.abs(gx * vy - gy * vx) < 0.01);
      let thermalMoment = 0;
      for (let k = 0; k < w.airTemperature.length; k++) {
        const distance = ((k % A) - 20) * gx + (Math.floor(k / A) - 20) * gy;
        thermalMoment += distance * Math.abs(w.airTemperature[k] - 20);
      }
      assert.ok(sign * thermalMoment > 0.25);
    }
  }
});

test('flame, held thermal brushes and continuous heaters and coolers leave open air and loose grains still', () => {
  for (const [tool, source] of [['Flame', false], ['Heat', false], ['Cool', false], ['Heat', true], ['Cool', true]]) {
    const w = new World();
    const grains = [];
    for (let x = 56; x < 112; x++) w.paint(M.Rock, x, 128, 0);
    for (let x = 62; x <= 102; x += 2) {
      if (Math.abs(x - 82) <= 4) continue;
      w.paint('Sand', x, 127, 0);
      grains.push(at(x, 127));
    }
    if (source) assert.ok(w.placeSource(tool, 82, 126, 3));
    if (tool === 'Flame') w.paint(tool, 82, 126, 3);
    let rose = false;
    for (let tick = 0; tick < 120; tick++) {
      if (!source && tool !== 'Flame') w.paint(tool, 82, 126, 3);
      w.step();
      assert.ok(w.pressure.every(p => p === 0));
      assert.ok(w.u.every(u => u === 0) && w.v.every(v => v === 0));
      assert.ok(grains.every(i => w.cells[i] === M.Sand));
      const firstFlame = w.cells.indexOf(M.Flame);
      if (firstFlame >= 0 && firstFlame < at(0, 123)) rose = true;
    }
    if (tool === 'Flame') assert.ok(rose);
    else assert.ok((tool === 'Heat' ? 1 : -1) * (w.airTemperature[tile(82, 126)] - 20) > 1);
  }
});

test('closing a wall gap enables thermal expansion; reopening releases stored pressure', () => {
  const w = sealedTile();
  const t = tile(82, 82);
  w.paint('Erase', 84, 80, 0);
  w.paint('Heat', 82, 82, 1, 10);
  run(w, 25);
  assert.equal(w.pressure[t], 0);
  w.paint('Wall', 84, 80, 0);
  w.paint('Heat', 82, 82, 1);
  const twin = World.restore(w.snapshot());
  run(w, 90);
  run(twin, 90);
  assert.deepEqual(w.snapshot(), twin.snapshot());
  assert.ok(w.pressure[t] > 0.5);
  w.paint('Erase', 84, 80, 0);
  w.step();
  assert.ok(w.u[t] > 0.1);
});

test('a tile filled with fog admits a gust while a tile filled with copper blocks most of it', () => {
  function speed(material) {
    const w = new World();
    if (material !== M.Empty) {
      for (let y = 80; y < 84; y++)
        for (let x = 80; x < 84; x++) w.paint(material, x, y, 0);
    }
    w.gust(82, 82, 2, 0);
    w.step();
    return w.u[tile(82, 82)];
  }
  const open = speed(M.Empty);
  assert.ok(open > 0.9);
  assert.equal(speed(M.Fog), open);
  assert.ok(speed(M.Copper) < open * 0.05);
});

test('water and steam share a pressure-adjusted latent threshold of 100 °C at neutral pressure', () => {
  function trial(material, temperature, device) {
    const w = sealedTile();
    if (device) {
      w.paint(device, 82, 82);
      run(w, 18);
      w.paint('Erase', 82, 82, 0);
    }
    w.paint(material, 80, 80, 0);
    w.temperature[at(80, 80)] = temperature;
    // Cancel particle-to-air exchange for this tick, keeping chamber pressure fixed.
    w.paint(M.Rock, 83, 83, 0);
    w.temperature[at(83, 83)] = 40 - temperature;
    w.step();
    return w;
  }
  for (const [material, temperature] of [[M.Water, 145], [M.Steam, 65]]) {
    const plateau = device => {
      const w = trial(material, temperature, device);
      return w.temperature[single(w, material)];
    };
    assert.equal(plateau(null), 100);
    assert.ok(plateau('Suction') < 95);
    assert.ok(plateau('Pressure') > 105);
  }
  single(trial(M.Water, 165, 'Suction'), M.Steam);
  single(trial(M.Water, 165, 'Pressure'), M.Water);
  single(trial(M.Steam, 35, 'Suction'), M.Steam);
  single(trial(M.Steam, 35, 'Pressure'), M.Water);
});

test('chilled air turns condensing steam into one airborne fog particle', () => {
  function condense(chilled, vapor) {
    const w = new World();
    w.strength = 1;
    w.paint('Fan', 64, 82);
    if (chilled) w.paint('Cool', 82, 82, 1, 20);
    if (vapor) {
      w.paint(M.Steam, 82, 82, 0);
      w.paint('Cool', 82, 82, 0, 80);
    }
    w.step();
    return w;
  }
  single(condense(false, true), M.Water);
  assert.equal(condense(true, false).cells.some(Boolean), false);
  const w = condense(true, true);
  const initial = single(w, M.Fog);
  assert.equal(w.cells.filter(Boolean).length, 1);
  assert.ok(w.temperature[initial] < 20);
  run(w, 20);
  assert.ok(single(w, M.Fog) % W > initial % W + 4);
  assert.equal(w.cells.filter(Boolean).length, 1);
});

test('a moving plume thins over time, resumes its countdown after a save and frees its cells', () => {
  for (const [material, middle, last] of [[M.Smoke, 330, 420], [M.Steam, 240, 300]]) {
    const w = new World();
    // Keep steam hot so that this experiment measures dissipation alone.
    if (material === M.Steam) w.airTemperature.fill(400);
    for (let x = 30; x < 94; x++) w.paint(material, x, 60, 0);
    run(w, middle);
    const count = w.cells.filter(m => m === material).length;
    assert.ok(count > 0 && count < 64, 'Some of the original plume should remain');
    const resumed = World.restore(w.snapshot());
    run(w, last - middle);
    run(resumed, last - middle);
    assert.ok(!w.cells.some(Boolean));
    assert.ok(!w.aux.some(Boolean));
    assert.deepEqual(resumed.snapshot(), w.snapshot());
  }
});

test('condensation wins on the last tick of a steam particle', () => {
  const w = new World();
  w.paint(M.Steam, 80, 80, 0);
  w.aux[at(80, 80)] = 1;
  w.paint('Cool', 80, 80, 0, 80);
  w.step();
  const drop = single(w, M.Water);
  assert.equal(w.aux[drop], 0);
});

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
