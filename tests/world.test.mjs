import test from 'node:test';
import assert from 'node:assert/strict';
import { World, M, W, H, A, tile } from '../src/world.ts';

function advance(w, n) {
  for (let i = 0; i < n; i++) w.step();
}
function center(w, id) {
  let x = 0,
    y = 0,
    count = 0;
  w.cells.forEach((m, i) => {
    if (m === id) {
      x += i % W;
      y += Math.floor(i / W);
      count++;
    }
  });
  assert.ok(count > 0);
  return { x: x / count, y: y / count, count };
}
function floor(w, y) {
  for (let x = 0; x < W; x += 4) w.paint('Wall', x, y);
}
test('fan sweep transports smoke, then sand, then gravel', () => {
  function displacement(m, power) {
    const w = new World();
    floor(w, 84);
    w.strength = power;
    w.paint('Fan', 20, 80);
    w.paint(m, 34, 83, 0);
    advance(w, 14);
    return center(w, M[m]).x - 34;
  }
  assert.ok(displacement('Smoke', 0.18) > 4);
  assert.ok(displacement('Sand', 0.4) > 2);
  assert.equal(displacement('Gravel', 0.4), 0);
  assert.ok(displacement('Gravel', 1) > 2);
});
test('a packed pile diverts a plume upward and erasure restores its path', () => {
  function plume(pile, erase) {
    const w = new World();
    floor(w, 96);
    w.strength = 0.7;
    w.paint('Fan', 20, 86);
    if (pile)
      for (let y = 0; y < 17; y++)
        for (let x = 50 + y; x <= 84 - y; x++) w.paint('Gravel', x, 95 - y, 0);
    if (erase)
      for (let y = 79; y < 96; y++) for (let x = 50; x <= 84; x++) w.paint('Erase', x, y, 0);
    w.paint('Smoke', 38, 85, 3);
    advance(w, 55);
    return center(w, M.Smoke);
  }
  const clear = plume(false, false),
    blocked = plume(true, false);
  assert.equal(clear.count, blocked.count);
  assert.ok(blocked.y < clear.y - 4);
  assert.deepEqual(plume(true, true), clear);
});
test('sealed pressure and suction chambers exchange air through an opening', () => {
  const w = new World();
  for (let y = 0; y < H; y += 4) w.paint('Wall', 80, y);
  w.paint('Pressure', 72, 100);
  w.paint('Suction', 88, 100);
  advance(w, 55);
  const left = tile(76, 100),
    right = tile(84, 100);
  const before = w.pressure[left] - w.pressure[right];
  assert.ok(w.pressure[left] > 0 && w.pressure[right] < 0);
  assert.equal(w.u[left], 0);
  w.paint('Erase', 72, 100, 0);
  w.paint('Erase', 88, 100, 0);
  w.paint('Erase', 80, 100, 0);
  w.step();
  assert.ok(w.u[left] > 0 && w.u[right - 1] > 0);
  advance(w, 20);
  assert.ok(w.pressure[left] - w.pressure[right] < before);
});
test('a fan beside a sealed divider cannot drive the isolated side', () => {
  const w = new World();
  floor(w, 84);
  w.paint('Fan', 20, 80);
  advance(w, 40);
  for (let t = 22 * A; t < w.pressure.length; t++) {
    assert.equal(w.pressure[t], 0);
    assert.equal(w.u[t], 0);
    assert.equal(w.v[t], 0);
  }
});
test('a directional gust decays after release', () => {
  const w = new World(),
    t = tile(80, 100);
  w.gust(80, 100, 8, 0);
  const initial = w.u[t];
  assert.ok(initial > 1);
  advance(w, 60);
  assert.ok(Math.max(...w.u.map(Math.abs)) < initial * 0.05);
});
test('turning the fire-lane fan changes ignition of the second wood block', () => {
  function ignites(turns) {
    const w = new World('Tunnel');
    for (let i = 0; i < turns; i++) w.paint('Fan', 16, 207);
    for (let i = 0; i < 120; i++) {
      w.step();
      for (let y = 204; y < 216; y++)
        for (let x = 77; x < 89; x++) if (w.cells[x + y * W] === M.Ember) return true;
    }
    return false;
  }
  assert.ok(ignites(0));
  assert.equal(ignites(2), false);
});
test('reset repeats material and air evolution from the same seed', () => {
  const a = new World('Tunnel'),
    b = new World('Tunnel');
  advance(a, 28);
  advance(b, 28);
  assert.deepEqual(a.cells, b.cells);
  assert.deepEqual(a.pressure, b.pressure);
  assert.equal(a.ticks, 28);
});
