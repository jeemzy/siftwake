import assert from 'node:assert/strict';
import test from 'node:test';
import { M } from '../src/materialIds.ts';
import { engineeringStep } from '../src/packs/engineering.ts';
import { World, W } from '../src/world.ts';

const at = (x, y) => x + W * y;

// Isolate the cell's heat budget and contacts from air exchange and movement.
function sample(id, ...neighbors) {
  const cells = Uint16Array.of(id, ...neighbors);
  const temperature = new Float32Array(cells.length).fill(20);
  const aux = new Uint16Array(cells.length);
  const context = {
    world: { cells, temperature, aux },
    neighbors: () => neighbors.map((_, n) => n + 1),
    change(i, product) {
      cells[i] = product;
      aux[i] = 0;
    },
  };
  return { cells, temperature, step: () => engineeringStep(context, 0) };
}

for (const [name, solid, liquid, point, cost] of [
  ['copper', M.Copper, M.MoltenCopper, 1085, 140],
  ['tin', M.Tin, M.MoltenTin, 232, 60],
  ['wax', M.Wax, M.MoltenWax, 60, 24],
]) {
  test(`${name} holds its melting point while absorbing and releasing latent heat`, () => {
    const s = sample(solid);
    s.temperature[0] = point - 1;
    s.step();
    assert.equal(s.cells[0], solid);
    s.temperature[0] += 11;
    s.step();
    assert.equal(s.cells[0], solid);
    assert.equal(s.temperature[0], point);

    // Reversing a partial melt returns the stored heat.
    s.temperature[0] -= 13;
    s.step();
    assert.equal(s.cells[0], solid);
    assert.equal(s.temperature[0], point - 3);

    for (let pass = 0; pass < 2; pass++) {
      s.temperature[0] = point + cost - 1;
      s.step();
      assert.equal(s.cells[0], solid);
      assert.equal(s.temperature[0], point);
      s.temperature[0] += 3;
      s.step();
      assert.equal(s.cells[0], liquid);
      assert.equal(s.temperature[0], point + 2);
      s.temperature[0] = point - cost + 1;
      s.step();
      assert.equal(s.cells[0], liquid);
      assert.equal(s.temperature[0], point);
      s.temperature[0] -= 4;
      s.step();
      assert.equal(s.cells[0], solid);
      assert.equal(s.temperature[0], point - 3);
    }
  });
}

test('wet, air-exposed iron rusts sooner in brine, preserving the adjacent drop', () => {
  function rustTime(...contacts) {
    const s = sample(M.Iron, ...contacts);
    for (let tick = 1; tick <= 150; tick++) {
      s.step();
      assert.deepEqual(Array.from(s.cells.slice(1)), contacts);
      if (s.cells[0] === M.Rust) return tick;
    }
    return Infinity;
  }
  const fresh = rustTime(M.Water, M.Empty);
  const brine = rustTime(M.Brine, M.Empty);
  assert.ok(brine > 1 && brine < fresh && fresh < Infinity);
  assert.equal(rustTime(M.Empty, M.Rock), Infinity);
  assert.equal(rustTime(M.Water, M.Rock), Infinity);
  assert.equal(rustTime(M.Brine, M.Brine), Infinity);
  assert.equal(rustTime(M.Ice, M.Empty), Infinity);
});

test('a copper bar conducts heat along its length faster than a wood bar', () => {
  const w = new World();
  for (let x = 50; x <= 55; x++) {
    w.paint(M.Copper, x, 40, 0);
    w.paint(M.Wood, x, 80, 0);
  }
  w.temperature[at(50, 40)] = 100;
  w.temperature[at(50, 80)] = 100;
  w.step();
  assert.ok(w.temperature[at(51, 40)] - 20 > 3 * (w.temperature[at(51, 80)] - 20));
  for (let t = 1; t < 5; t++) w.step();
  const gain = (row) => w.temperature[at(53, row)] - 20;
  assert.ok(gain(80) > 0 && gain(40) > 2 * gain(80));
});

test('tin pours at a heat setting that leaves copper solid, and both can be recast', () => {
  const w = new World();
  w.paint(M.Copper, 30, 30, 0);
  w.paint(M.Tin, 50, 30, 0);
  for (const x of [30, 50]) {
    w.paint('Heat', x, 30, 0);
    w.paint('Heat', x, 30, 0);
  }
  w.step();
  assert.equal(w.cells[at(30, 30)], M.Copper);
  assert.ok(w.cells.includes(M.MoltenTin));
  for (let n = 0; n < 4; n++) w.paint('Heat', 30, 30, 0);
  for (let n = 0; n < 3; n++) w.step();
  for (const [solid, liquid, x, heatTaps] of [
    [M.Tin, M.MoltenTin, 50, 3],
    [M.Copper, M.MoltenCopper, 30, 8],
  ]) {
    const drop = w.cells.indexOf(liquid);
    assert.ok(drop >= at(x, 31));
    for (let n = 0; n < 15; n++) w.paint('Cool', x, Math.floor(drop / W), 0);
    w.step();
    const casting = w.cells.indexOf(solid);
    assert.ok(casting >= 0);
    w.step();
    assert.equal(w.cells[casting], solid);
    for (let n = 0; n < heatTaps; n++) w.paint('Heat', x, Math.floor(casting / W), 0);
    w.step();
    assert.ok(w.cells.includes(liquid));
  }
});

test('cork, oil and water sort by density in a narrow column and retain all grains', () => {
  const w = new World();
  const x = 52;
  for (let y = 46; y <= 52; y++) {
    w.paint(M.Glass, x - 1, y, 0);
    w.paint(M.Glass, x + 1, y, 0);
  }
  w.paint(M.Glass, x, 52, 0);
  const initial = [M.Water, M.Water, M.Oil, M.Oil, M.Cork, M.Cork];
  initial.forEach((id, n) => w.paint(id, x, 46 + n, 0));
  for (let t = 0; t < 24; t++) w.step();
  assert.deepEqual(initial.map((_, n) => w.cells[at(x, 46 + n)]),
    [M.Cork, M.Cork, M.Oil, M.Oil, M.Water, M.Water]);
});

test('a wax plug holds in place, flows when heated and sets again when cooled', () => {
  const w = new World();
  for (let y = 38; y <= 50; y++) {
    w.paint(M.Glass, 47, y, 0);
    w.paint(M.Glass, 49, y, 0);
  }
  w.paint(M.Wax, 48, 40, 0);
  w.paint(M.Water, 48, 39, 0);
  for (let n = 0; n < 3; n++) w.step();
  assert.equal(w.cells[at(48, 40)], M.Wax);
  assert.equal(w.cells[at(48, 39)], M.Water);
  w.paint('Heat', 48, 40, 0);
  for (let n = 0; n < 5; n++) w.step();
  const drop = w.cells.indexOf(M.MoltenWax);
  assert.ok(drop >= at(48, 41));
  assert.ok(w.cells.indexOf(M.Water) >= at(48, 40));
  for (let n = 0; n < 3; n++) w.paint('Cool', drop % W, Math.floor(drop / W), 0);
  w.step();
  const plug = w.cells.indexOf(M.Wax);
  assert.ok(plug >= 0);
  for (let n = 0; n < 3; n++) w.step();
  assert.equal(w.cells[plug], M.Wax);
});
