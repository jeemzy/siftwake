import assert from 'node:assert/strict';
import test from 'node:test';
import { World, W, M } from '../src/world.ts';

const x = 60, y = 44;
const cell = (offset) => x + offset + y * W;
const count = (w, id) => w.cells.reduce((n, value) => n + (value === id), 0);

// A single horizontal row of sample cells surrounded by fixed glass keeps
// contacts reproducible while running the real pressure, heat and motion steps.
function vessel(...materials) {
  const w = new World();
  for (let offset = -1; offset <= materials.length; offset++) {
    w.paint(M.Glass, x + offset, y - 1, 0);
    w.paint(M.Glass, x + offset, y + 1, 0);
  }
  w.paint(M.Glass, x - 1, y, 0);
  w.paint(M.Glass, x + materials.length, y, 0);
  materials.forEach((id, offset) => w.paint(id, x + offset, y, 0));
  return w;
}

function equilibrate(w, temperature) {
  w.airTemperature.fill(temperature);
  w.temperature.fill(temperature);
}

test('one soda grain fizzes once between competing vinegar drops in a full vessel', () => {
  const w = vessel(M.Vinegar, M.BakingSoda, M.Vinegar);
  w.step();
  assert.equal(count(w, M.BakingSoda), 0);
  assert.equal(count(w, M.Vinegar), 1);
  assert.equal(count(w, M.SodiumAcetateSolution), 1);
  assert.equal(count(w, M.CarbonDioxide), 1);
  assert.equal(w.amount[cell(1)], 1);
  const solution = w.cells.indexOf(M.SodiumAcetateSolution);
  assert.equal(w.amount[solution], 1);
  assert.ok(w.temperature[solution] < 20);
  assert.equal(w.pressure.reduce((a, b) => a + b), 0.25);
  w.step();
  assert.equal(count(w, M.CarbonDioxide), 1);
  assert.equal(count(w, M.Vinegar), 1);
});

test('the fizz supplies exactly one bubble to neighboring water under pressure', () => {
  const w = vessel(M.Vinegar, M.BakingSoda, M.Water);
  w.pressure.fill(2);
  w.step();
  assert.equal(w.cells[cell(1)], M.CarbonDioxide);
  assert.equal(w.amount[cell(1)], 1);
  w.step();
  assert.equal(count(w, M.CarbonDioxide), 0);
  const drink = w.cells.indexOf(M.CarbonatedWater);
  assert.ok(drink >= 0);
  assert.equal(w.amount[drink], 1);
  assert.equal(count(w, M.SodiumAcetateSolution), 1);
});

test('solution keeps its water until every emitted drop has an outlet', () => {
  const w = vessel(M.SodiumAcetateSolution);
  equilibrate(w, 120);
  w.step();
  assert.equal(w.amount[cell(0)], 1);
  assert.equal(count(w, M.Steam), 0);
  w.paint('Erase', x, y - 1, 0);
  const hot = w.temperature[cell(0)];
  w.step();
  assert.equal(w.cells[cell(0)], M.SodiumAcetateSolution);
  assert.equal(w.amount[cell(0)], 0);
  assert.ok(w.temperature[cell(0)] < hot);
  assert.equal(count(w, M.Steam), 1);
  for (let t = 0; t < 5; t++) w.step();
  assert.equal(count(w, M.Steam), 1);
});

test('two hot samples sharing their only outlet release just one drop', () => {
  const w = vessel(M.WetClay, M.Empty, M.SodiumAcetateSolution);
  equilibrate(w, 120);
  w.step();
  assert.equal(w.cells[cell(1)], M.Steam);
  assert.equal(w.amount[cell(0)] + w.amount[cell(2)], 1);
  w.step();
  assert.equal(count(w, M.Steam), 1);
  assert.equal(w.amount[cell(0)] + w.amount[cell(2)], 1);
});

test('only concentrated cool acetate grows a warm front one cell per tick and remelts', () => {
  const s = M.SodiumAcetateSolution;
  const crystal = M.SodiumAcetateCrystals;
  const w = vessel(s, s, s, s);
  // Boil three drops. The covered fourth sample stays dilute.
  for (let j = 0; j < 3; j++) w.paint('Erase', x + j, y - 1, 0);
  equilibrate(w, 120);
  w.step();
  assert.equal(count(w, M.Steam), 3);
  for (let j = 0; j < 3; j++) {
    w.paint('Erase', x + j, y - 1, 0);
    w.paint(M.Glass, x + j, y - 1, 0);
  }
  equilibrate(w, 20);
  w.step();
  assert.equal(count(w, crystal), 0);
  w.paint('Erase', x - 1, y, 0);
  w.paint(crystal, x - 1, y, 0);
  for (let j = 0; j < 3; j++) {
    w.step();
    assert.equal(count(w, crystal), 2 + j);
    assert.equal(w.cells[cell(j)], crystal);
    assert.ok(w.temperature[cell(j)] > 20);
  }
  w.step();
  assert.equal(w.cells[cell(3)], s);
  assert.equal(w.amount[cell(3)], 1);
  equilibrate(w, 80);
  w.step();
  assert.equal(count(w, crystal), 0);
  assert.equal(count(w, s), 5);
  assert.equal(w.amount[cell(1)], 0);
  assert.ok(w.temperature[cell(1)] < 80);
});

test('plaster consumes one drop, releases heat, and stays solid when soaked again', () => {
  const w = vessel(M.Water, M.Plaster, M.Water);
  w.step();
  assert.equal(w.cells[cell(1)], M.Gypsum);
  assert.ok(w.temperature[cell(1)] > 20);
  assert.equal(count(w, M.Water), 1);
  w.paint('Erase', x + 1, y + 1, 0);
  for (let t = 0; t < 5; t++) w.step();
  assert.equal(w.cells[cell(1)], M.Gypsum);
  assert.equal(count(w, M.Water), 1);
});

test('clay takes up one drop, retains it when enclosed, air-dries and rewets', () => {
  const w = vessel(M.ClayDust, M.Water);
  w.step();
  assert.equal(w.cells[cell(0)], M.WetClay);
  assert.equal(w.amount[cell(0)], 1);
  assert.equal(count(w, M.Water), 0);
  w.paint(M.Glass, x + 1, y, 0);
  equilibrate(w, 125);
  w.step();
  assert.equal(w.amount[cell(0)], 1);
  assert.equal(count(w, M.Steam), 0);
  equilibrate(w, 20);
  w.paint('Erase', x + 1, y, 0);
  for (let t = 0; t < 180 && w.cells[cell(0)] === M.WetClay; t++) w.step();
  assert.equal(w.cells[cell(0)], M.DryClay);
  assert.equal(w.amount[cell(0)], 0);
  assert.equal(w.cells[cell(1)], M.Fog);
  assert.ok(w.temperature[cell(0)] < 20);
  // Condense that same finite drop and return it to the clay.
  w.temperature[cell(1) + W] = 2;
  for (let t = 0; t < 4 && w.cells[cell(0)] === M.DryClay; t++) w.step();
  assert.equal(w.cells[cell(0)], M.WetClay);
  assert.equal(w.amount[cell(0)], 1);
  assert.equal(count(w, M.Fog) + count(w, M.Water), 0);
});

test('firing requires uninterrupted high heat and cooling or soaking leaves brick intact', () => {
  const w = vessel(M.WetClay, M.Empty);
  equilibrate(w, 900);
  w.step();
  assert.equal(w.cells[cell(0)], M.DryClay);
  assert.equal(count(w, M.Steam), 1);
  // Vent the steam before closing the kiln so it cannot condense back onto the clay.
  w.paint('Erase', x + 1, y, 0);
  w.paint(M.Glass, x + 1, y, 0);
  // Two short kiln visits separated by cooling must not combine into one firing.
  for (let visit = 0; visit < 2; visit++) {
    equilibrate(w, 900);
    for (let t = 0; t < 17; t++) w.step();
    assert.equal(w.cells[cell(0)], M.DryClay);
    equilibrate(w, 20);
    w.step();
  }
  equilibrate(w, 900);
  for (let t = 0; t < 32 && w.cells[cell(0)] === M.DryClay; t++) w.step();
  assert.equal(w.cells[cell(0)], M.FiredBrick);
  equilibrate(w, 20);
  w.paint('Erase', x + 1, y, 0);
  w.paint(M.Water, x + 1, y, 0);
  for (let t = 0; t < 10; t++) w.step();
  assert.equal(w.cells[cell(0)], M.FiredBrick);
  assert.equal(count(w, M.Water), 1);
});
