import assert from 'node:assert/strict';
import test from 'node:test';
import { H, M, W, World } from '../src/world.ts';

const at = (x, y) => x + y * W;
const count = (w, id) => w.cells.reduce((total, cell) => total + Number(cell === id), 0);

function waterUnits(w) {
  let total = 0;
  for (let i = 0; i < w.cells.length; i++) {
    const id = w.cells[i];
    if ([M.Water, M.Fog, M.Steam, M.Ice, M.Frost, M.Slush].includes(id)) total++;
    else if (id >= M.Soil && id <= M.Compost) total += w.amount[i];
  }
  return total;
}

test('soil stores successive drops and returns each as fog while drying', () => {
  const w = new World();
  const x = 55, y = H - 1, bed = at(x, y);
  w.paint(M.Soil, x, y, 0);
  for (let n = 1; n <= 4; n++) {
    w.paint(M.Water, x, y - 1, 0);
    w.step();
    assert.equal(w.cells[bed], M.Mud);
    assert.equal(w.amount[bed], n);
    assert.equal(waterUnits(w), n);
  }
  // At capacity, even a drop confined above the mud remains free.
  w.paint(M.Glass, x - 1, y - 1, 0);
  w.paint(M.Glass, x + 1, y - 1, 0);
  w.paint(M.Water, x, y - 1, 0);
  w.step();
  assert.equal(w.amount[bed], 4);
  assert.equal(waterUnits(w), 5);
  const drop = w.cells.indexOf(M.Water);
  w.paint('Erase', drop % W, Math.floor(drop / W), 0);
  for (let t = 0; t < 150 && w.cells[bed] === M.Mud; t++) {
    w.temperature[bed] = 65;
    w.step();
  }
  assert.equal(w.cells[bed], M.Soil);
  assert.equal(count(w, M.Fog), 4);
  assert.equal(waterUnits(w), 4);
});

test('root tips choose the soil leading toward water on either side', () => {
  for (const direction of [-1, 1]) {
    const w = new World();
    const x = 57, y = H - 1;
    w.paint(M.Root, x, y, 0);
    w.paint(M.Soil, x - 1, y, 0);
    w.paint(M.Soil, x + 1, y, 0);
    w.paint(M.Water, x + 2 * direction, y, 0);
    // Hold this drop in the pore until the growing root reaches its bank.
    w.paint(M.Glass, x + 3 * direction, y, 0);
    for (let t = 0; t < 12 && count(w, M.Root) === 1; t++) w.step();
    assert.equal(w.cells[at(x + direction, y)], M.Root);
    assert.equal(w.cells[at(x - direction, y)], M.Soil);
    assert.equal(waterUnits(w), 1);
  }
});

test('a drop passes from mud through root and stem to leaf and then to chamber fog', () => {
  const w = new World(), x = 63, y = H - 1;
  for (const [dx, id] of [M.Mud, M.Root, M.Stem, M.Leaf].entries()) w.paint(id, x + dx, y, 0);
  w.paint(M.Glass, x + 2, y - 1, 0);
  const visited = new Set();
  for (let t = 0; t < 48; t++) {
    w.step();
    assert.equal(waterUnits(w), 1);
    for (const id of [M.Root, M.Stem, M.Leaf])
      if (w.cells.some((cell, i) => cell === id && w.amount[i] > 0)) visited.add(id);
    if (count(w, M.Fog)) break;
  }
  assert.deepEqual(visited, new Set([M.Root, M.Stem, M.Leaf]));
  assert.equal(count(w, M.Fog), 1);
});

test('roots recover fog and sealed leaves hold that water until an outlet opens', () => {
  const w = new World(), x = 83, y = H - 1, leaf = at(x, y);
  w.paint(M.Leaf, x, y, 0);
  w.paint(M.Stem, x - 1, y, 0);
  w.paint(M.Root, x - 2, y, 0);
  w.paint(M.Fog, x - 3, y, 0);
  w.paint(M.Glass, x, y - 1, 0);
  w.paint(M.Glass, x - 1, y - 1, 0);
  w.paint(M.Glass, x + 1, y, 0);
  for (let t = 0; t < 48; t++) w.step();
  assert.equal(w.amount[leaf], 1);
  assert.equal(count(w, M.Fog), 0);
  w.paint('Erase', x + 1, y, 0);
  for (let t = 0; t < 12; t++) w.step();
  assert.equal(w.amount[leaf], 0);
  assert.equal(count(w, M.Fog), 1);
  assert.equal(waterUnits(w), 1);
});

test('a painted column conducts water upward through multiple roots and stems', () => {
  const w = new World(), x = 63, bottom = H - 1;
  for (const [dy, id] of [M.Mud, M.Root, M.Root, M.Stem, M.Stem, M.Leaf].entries()) {
    w.paint(id, x, bottom - dy, 0);
    w.paint(M.Glass, x - 1, bottom - dy, 0);
    w.paint(M.Glass, x + 1, bottom - dy, 0);
  }
  for (let t = 0; t < 36; t++) w.step();
  assert.equal(count(w, M.Fog), 1);
  assert.equal(waterUnits(w), 1);
});

test('seeds stay dormant on dry soil, grow finite leafy shoots on mud, and form reeds by water', () => {
  const x = 67, y = H - 1;
  for (const [soil, bank, shoot] of [
    [M.Soil, false, M.Seed], [M.Mud, false, M.Stem], [M.Mud, true, M.Reed],
  ]) {
    const w = new World();
    w.paint(soil, x, y, 0);
    w.paint(M.Seed, x, y - 1, 0);
    if (bank) w.paint(M.Water, x + 1, y - 1, 0);
    w.step();
    assert.equal(count(w, shoot), 1);
    if (shoot === M.Seed) continue;
    const top = y - 1 - (bank ? 5 : 3);
    for (let t = 0; t < 64; t++) w.step();
    assert.equal(w.cells[at(x, top)], M.Leaf);
    assert.equal(count(w, shoot), bank ? 5 : 3);
    const leaves = count(w, M.Leaf);
    assert.ok(bank ? leaves === 1 : leaves > 1);
    for (let t = 0; t < 64; t++) w.step();
    assert.equal(count(w, shoot), bank ? 5 : 3);
    assert.equal(count(w, M.Leaf), leaves);
    assert.equal(waterUnits(w), bank ? 2 : 1);
  }
});

test('drought sheds mobile litter and damp decomposition supplies a second seed', () => {
  const w = new World(), x = 52, y = H - 1, bed = at(x, y);
  w.paint(M.Leaf, x, y - 2, 0);
  for (let t = 0; t < 165; t++) w.step();
  assert.equal(w.cells[bed], M.LeafLitter);
  assert.equal(waterUnits(w), 0);
  w.paint(M.Mud, x - 1, y, 0);
  for (let t = 0; t < 24; t++) w.step();
  assert.equal(w.cells[bed], M.Compost);
  assert.equal(w.amount[bed], 1);
  assert.equal(waterUnits(w), 1);
  w.paint(M.Seed, x, y - 1, 0);
  w.step();
  assert.equal(w.cells[bed], M.Root);
  assert.equal(w.cells[bed - W], M.Stem);
  for (let t = 0; t < 64; t++) w.step();
  assert.equal(w.cells[bed - 6 * W], M.Leaf);
  assert.equal(waterUnits(w), 1);
});

test('gusts carry dry litter in the direction of the airflow', () => {
  for (const direction of [-1, 1]) {
    const w = new World(), start = 82, y = H - 1;
    w.paint(M.LeafLitter, start, y, 0);
    for (let t = 0; t < 16; t++) {
      for (let x = 60; x < 104; x += 4) w.gust(x, y, direction * 8, 0);
      w.step();
    }
    assert.ok((w.cells.indexOf(M.LeafLitter) % W - start) * direction >= 8);
  }
});
