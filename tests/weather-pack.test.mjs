import assert from 'node:assert/strict';
import test from 'node:test';
import { M, W, World, tile } from '../src/world.ts';

const at = (x, y) => x + y * W;
const shake = { gravityX: 0, gravityY: 1, shakeX: 1, shakeY: 0 };
const count = (w, id) => w.cells.reduce((n, cell) => n + (cell === id), 0);
function single(w, id) {
  assert.equal(count(w, id), 1, 'expected one ' + Object.keys(M).find(k => M[k] === id));
  return w.cells.indexOf(id);
}
function advance(w, ticks, motion) {
  for (let n = 0; n < ticks; n++) w.step(motion);
}
function paint(w, id, x, y, temperature) {
  w.paint(id, x, y, 0);
  assert.equal(w.cells[at(x, y)], id);
  if (temperature !== undefined) w.temperature[at(x, y)] = temperature;
}

// One 4 × 4 air tile surrounded by an airtight ring. Glass inserts can make a
// two-cell sample well inside it. Opening the east wall vents the whole tile.
function chamber() {
  const w = new World();
  for (let y = 36; y <= 44; y += 4) {
    for (let x = 36; x <= 44; x += 4) {
      if (x !== 40 || y !== 40) w.paint('Wall', x, y, 0);
    }
  }
  return w;
}
const gauge = tile(40, 40);
function fillAroundSample(w, sample) {
  for (let y = 40; y < 44; y++) {
    for (let x = 40; x < 44; x++) {
      if (!sample.includes(at(x, y))) paint(w, M.Glass, x, y);
    }
  }
}
function totalCO2(w) {
  return w.cells.reduce((sum, id, i) => {
    if (id === M.CarbonDioxide) return sum + 1;
    if (id === M.CarbonatedWater || id === M.DryIce || id === M.Foam) return sum + w.amount[i];
    return sum;
  }, 0);
}

test('warming frost produces slush, which can melt to water or freeze to ice', () => {
  for (const [temperature, expected] of [[15, M.Water], [-12, M.Ice]]) {
    const w = chamber();
    paint(w, M.Frost, 41, 41, 8);
    w.step();
    w.temperature[single(w, M.Slush)] = temperature;
    w.step();
    single(w, expected);
    assert.equal(w.cells.filter(Boolean).length, 1);
  }
});

test('a cold pane collects each fog particle once as frost or a droplet', () => {
  for (const [temperature, expected] of [[-25, M.Frost], [3, M.Water], [22, M.Fog]]) {
    const w = chamber();
    paint(w, M.Glass, 41, 42, temperature);
    paint(w, M.Fog, 41, 41, temperature);
    w.step();
    single(w, expected);
    assert.equal(w.cells.filter(Boolean).length, 2);
    if (expected === M.Frost) {
      const surface = single(w, M.Frost);
      advance(w, 4);
      assert.equal(single(w, M.Frost), surface);
      w.temperature[surface] = 20;
      w.step();
      single(w, M.Slush);
    }
  }
  const w = chamber();
  paint(w, M.Fog, 41, 41, -12);
  paint(w, M.Fog, 41, 42, -12);
  w.step();
  assert.equal(count(w, M.Fog), 2);
});

test('one grain and one drop make brine; freezing and evaporation each return both constituents', () => {
  for (const [extreme, product] of [[-32, M.Ice], [145, M.Steam]]) {
    const w = chamber();
    paint(w, M.Salt, 41, 41);
    paint(w, M.Water, 42, 41);
    w.step();
    const brine = single(w, M.Brine);
    assert.equal(w.cells.filter(Boolean).length, 1);
    w.temperature[brine] = -6;
    w.step();
    w.temperature[single(w, M.Brine)] = extreme;
    w.step();
    single(w, product);
    single(w, M.Salt);
    assert.equal(w.cells.filter(Boolean).length, 2);
  }
});

test('sealed soda chamber consumes free CO₂, holds equilibrium while shaken, then vents', () => {
  const w = chamber();
  paint(w, M.Water, 41, 42, 20);
  paint(w, M.CarbonDioxide, 42, 42, 20);
  w.pressure[gauge] = 3;
  w.step();
  assert.equal(w.amount[single(w, M.CarbonatedWater)], 1);
  assert.equal(count(w, M.CarbonDioxide), 0);
  const equilibrium = w.pressure[gauge];
  assert.ok(equilibrium > 2.5 && equilibrium < 3);
  advance(w, 40, shake);
  assert.equal(w.amount[single(w, M.CarbonatedWater)], 1);
  assert.equal(count(w, M.CarbonDioxide), 0);
  assert.ok(Math.abs(w.pressure[gauge] - equilibrium) < 0.01);

  w.paint('Erase', 44, 40, 0);
  advance(w, 60, shake);
  single(w, M.Water);
  single(w, M.CarbonDioxide);
  assert.ok(w.pressure[gauge] < equilibrium);
  assert.equal(totalCO2(w), 1);
});

test('carbonation needs cool water, actual CO₂ and enough pressure', () => {
  for (const [pressure, temperature, hasGas] of [[0, 10, true], [5, 55, true], [5, 10, false]]) {
    const w = chamber();
    paint(w, M.Water, 41, 42, temperature);
    if (hasGas) paint(w, M.CarbonDioxide, 42, 42, temperature);
    w.pressure[gauge] = pressure;
    w.step(shake);
    single(w, M.Water);
    assert.equal(count(w, M.CarbonDioxide), Number(hasGas));
    assert.equal(count(w, M.CarbonatedWater), 0);
  }
});

test('shaking speeds the first bubbles in warmed soda with the same starting gas and pressure', () => {
  function warmSample(motion) {
    const w = chamber();
    paint(w, M.CarbonatedWater, 41, 42, 65);
    w.pressure[gauge] = 4;
    w.step(motion);
    assert.equal(totalCO2(w), 3);
    return { free: count(w, M.CarbonDioxide), pressure: w.pressure[gauge] };
  }
  const still = warmSample();
  const shaken = warmSample(shake);
  assert.ok(shaken.free > still.free);
  assert.ok(shaken.pressure > still.pressure);
});

test('supersaturation needs a free outlet; each bubble adds pressure and spends one unit', () => {
  const w = chamber();
  fillAroundSample(w, [at(42, 42)]);
  paint(w, M.CarbonatedWater, 42, 42, 20);
  const initial = totalCO2(w);
  w.step(shake);
  assert.equal(w.amount[single(w, M.CarbonatedWater)], initial);
  assert.ok(Math.abs(w.pressure[gauge]) < 0.01);
  for (const [x, y] of [[41, 42], [43, 42], [42, 41]]) {
    const before = count(w, M.CarbonDioxide);
    const pressure = w.pressure[gauge];
    w.paint('Erase', x, y, 0);
    w.step(shake);
    assert.equal(count(w, M.CarbonDioxide), before + 1);
    assert.ok(w.pressure[gauge] > pressure + 0.1);
    assert.equal(totalCO2(w), initial);
  }
  single(w, M.Water);
});

test('dry ice cools a neighboring pane as its finite pellet sublimates', () => {
  const w = chamber();
  paint(w, M.DryIce, 41, 42);
  paint(w, M.Glass, 42, 42);
  w.step();
  assert.ok(w.temperature[at(42, 42)] < 18);
  assert.equal(totalCO2(w), 4);
  for (let n = 0; n < 40 && w.cells.includes(M.DryIce); n++) {
    w.temperature[single(w, M.DryIce)] = -30;
    w.step();
    assert.equal(totalCO2(w), 4);
  }
  assert.equal(count(w, M.CarbonDioxide), 4);
});

test('soapy water traps one gas cell and returns it only when the foam can drain', () => {
  const w = chamber();
  fillAroundSample(w, [at(41, 42), at(42, 42)]);
  paint(w, M.SoapyWater, 41, 42);
  w.step(shake);
  const soap = single(w, M.SoapyWater);
  const otherX = soap % W === 41 ? 42 : 41;
  paint(w, M.CarbonDioxide, otherX, 42);
  w.step();
  const foam = single(w, M.Foam);
  assert.equal(count(w, M.CarbonDioxide), 0);
  assert.equal(totalCO2(w), 1);
  paint(w, M.Glass, otherX, 42);
  advance(w, w.life[foam] + 3);
  single(w, M.Foam);
  w.paint('Erase', otherX, 42, 0);
  w.step();
  single(w, M.SoapyWater);
  single(w, M.CarbonDioxide);
  assert.equal(totalCO2(w), 1);
});

test('a sponge holds eight drops and releases only stored water under shaking or heat', () => {
  const w = chamber();
  const sponge = at(41, 42);
  fillAroundSample(w, [sponge, at(42, 42)]);
  paint(w, M.Sponge, 41, 42);
  for (let n = 1; n <= 8; n++) {
    paint(w, M.Water, 42, 42);
    w.step();
    assert.equal(w.amount[sponge], n);
    assert.equal(count(w, M.Water), 0);
  }
  paint(w, M.Water, 42, 42);
  w.step();
  w.step(shake);
  assert.equal(w.amount[sponge], 8);
  single(w, M.Water);
  for (let n = 7; n >= 0; n--) {
    w.paint('Erase', 42, 42, 0);
    if (n === 0) w.temperature[sponge] = 180;
    w.step(n === 0 ? undefined : shake);
    assert.equal(w.amount[sponge], n);
    single(w, n === 0 ? M.Steam : M.Water);
  }
  w.paint('Erase', 42, 42, 0);
  advance(w, 3, shake);
  assert.equal(count(w, M.Water) + count(w, M.Steam), 0);
});
