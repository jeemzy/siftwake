import assert from 'node:assert/strict';
import test from 'node:test';
import { builtinMaterials } from '../src/builtinRegistry.ts';
import { World, W, H, M } from '../src/world.ts';
import { normal } from '../src/views.ts';
import { rasterize } from '../src/raster.ts';

test('every catalog brush paints its own ID and renders, including newly paintable products', () => {
  assert.equal(builtinMaterials.length, 56);
  assert.equal(new Set(builtinMaterials.map((m) => m.id)).size, 56);
  const world = new World();
  const pixels = new Uint8Array(W * H * 4);
  for (const [index, material] of builtinMaterials.entries()) {
    const x = index + 8;
    world.paint(material.id, x, 12, 0);
    const i = 12 * W + x;
    assert.equal(world.cells[i], material.id, material.name);
    assert.equal(world.temperature[i], material.temperature, material.name);
    assert.ok(material.tip.length > 0, material.name);
  }
  rasterize(world, normal, pixels);
  for (let x = 8; x < 8 + builtinMaterials.length; x++) assert.equal(pixels[(12 * W + x) * 4 + 3], 255);
});

test('a mixed-material experiment with active sources replays its next 100 ticks after restore', () => {
  const world = new World();
  for (const [index, material] of builtinMaterials.entries()) {
    world.paint(material.id, 10 + (index % 10) * 13, 30 + Math.floor(index / 10) * 22, 2);
  }
  assert.ok(world.placeSource(M.CarbonatedWater, 46, 20, 1));
  assert.ok(world.placeSource('Heat', 64, 20, 3, 35));
  world.paint('Fan', 4, 28);
  for (let tick = 0; tick < 20; tick++) world.step();
  const restored = World.restore(world.snapshot());
  for (let tick = 0; tick < 100; tick++) {
    const motion = tick % 16 === 0 ? { gravityX: 0, gravityY: 1, shakeX: 0.7, shakeY: 0.3 } : undefined;
    world.step(motion);
    restored.step(motion);
  }
  assert.deepEqual(restored.snapshot(), world.snapshot());
});
