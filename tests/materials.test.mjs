import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { World, M, W, H, tile } from '../src/world.ts';
import { decodeCheckpoint } from '../src/checkpoint.ts';
import { rasterize } from '../src/raster.ts';

const draft = (name, fields = {}) => ({
  name,
  color: '#d600aa',
  family: 'solid',
  density: '70',
  rules: [],
  ...fields,
});
const cell = (x, y) => x + y * W;
const noLayers = { Pressure: false, Air: false, Heat: false };
function pixel(world, x, y) {
  const pixels = new Uint8Array(W * H * 4);
  rasterize(world, noLayers, pixels);
  return pixels.slice(cell(x, y) * 4, cell(x, y) * 4 + 3);
}

test('editing keeps painted IDs and contact rules, including after a checkpoint and replay', () => {
  const world = new World();
  const { id } = world.saveMaterial(
    null,
    draft('Ink', {
      rules: [{ with: M.Water, own: null, other: M.Glass }],
    }),
  );
  world.paint(id, 40, 40, 0);
  world.paint('Water', 41, 40, 0);
  const before = pixel(world, 40, 40);
  const { rules } = world.customMaterials[0];
  assert.equal(world.saveMaterial(id, draft('Dye', { color: '#45dd64', rules })).id, id);
  assert.equal(world.cells[cell(40, 40)], id);
  const after = pixel(world, 40, 40);
  assert.notDeepEqual(after, before);
  world.step();
  assert.equal(world.cells[cell(40, 40)], id);
  assert.equal(world.cells[cell(41, 40)], M.Glass);

  const editor = { scene: 'Blank', tool: id, brush: 1, category: 'Materials', camera: noLayers };
  const restored = decodeCheckpoint(world.snapshot(), JSON.stringify({ version: 1, editor }));
  assert.deepEqual(restored.editor, editor);
  assert.deepEqual(restored.world.customMaterials, world.customMaterials);
  world.paint('Water', 39, 40, 0);
  restored.world.paint('Water', 39, 40, 0);
  for (let i = 0; i < 100; i++) {
    world.step();
    restored.world.step();
  }
  assert.equal(world.cells[cell(39, 40)], M.Glass);
  assert.deepEqual(restored.world.snapshot(), world.snapshot());
});

test('invalid changes and reversed contacts leave the working catalog untouched', () => {
  const world = new World();
  const { id: a } = world.saveMaterial(null, draft('A'));
  const { id: b } = world.saveMaterial(
    null,
    draft('B', { rules: [{ with: a, own: null, other: 0 }] }),
  );
  const before = world.snapshot();
  const { errors } = world.saveMaterial(
    a,
    draft(' b ', {
      color: 'red',
      density: 'Infinity',
      rules: [
        { with: b, own: null, other: null },
        { with: 255, own: 252, other: null },
      ],
    }),
  );
  assert.ok(errors.name && errors.color && errors.density);
  assert.ok(errors.rules[0].with && errors.rules[1].with && errors.rules[1].own);
  assert.deepEqual(world.snapshot(), before);
  world.paint(a, 30, 30, 0);
  world.paint(b, 31, 30, 0);
  world.step();
  assert.equal(world.cells[cell(30, 30)], M.Empty);
  assert.equal(world.cells[cell(31, 30)], b);
});

test('custom density displaces lighter mobile cells and contacts are resolved once per tick', () => {
  const world = new World();
  const { id: heavy } = world.saveMaterial(
    null,
    draft('Heavy', { family: 'powder', density: '90' }),
  );
  const { id: light } = world.saveMaterial(
    null,
    draft('Light', { family: 'powder', density: '10' }),
  );
  world.paint(heavy, 20, 238, 0);
  world.paint(light, 20, 239, 0);
  world.step();
  assert.equal(world.cells[cell(20, 239)], heavy);
  assert.equal(world.cells[cell(20, 238)], light);
  const { id: catalyst } = world.saveMaterial(
    null,
    draft('Catalyst', {
      rules: [{ with: M.Water, own: null, other: M.Glass }],
    }),
  );
  world.paint(catalyst, 51, 40, 0);
  world.paint('Water', 50, 40, 0);
  world.paint('Water', 52, 40, 0);
  world.step();
  assert.equal(world.cells.filter((id) => id === M.Glass).length, 1);
});

test('reads a binary checkpoint produced by the 0.3.0 release', () => {
  const bytes = gunzipSync(readFileSync(new URL('./fixtures/world-0.3.0.bin.gz', import.meta.url)));
  const world = World.restore(bytes);
  assert.equal(world.ticks, 2);
  assert.equal(world.strength, 0.43);
  assert.equal(world.cells[cell(30, 40)], M.Wood);
  assert.equal(world.device[tile(66, 54)], 1);
  assert.deepEqual(world.customMaterials, []);
});

test('keeping a contact material preserves its movement and resetting retains the catalog', () => {
  const world = new World();
  const { id } = world.saveMaterial(
    null,
    draft('Grit', {
      family: 'powder',
      rules: [{ with: M.Wood, own: null, other: null }],
    }),
  );
  world.paint(id, 70, 50, 0);
  world.paint('Wood', 71, 50, 0);
  world.step();
  assert.equal(world.cells[cell(70, 51)], id);
  assert.equal(world.cells[cell(71, 50)], M.Wood);
  const reset = world.reset('Blank');
  assert.deepEqual(reset.customMaterials, world.customMaterials);
  assert.equal(reset.ticks, 0);
  assert.equal(reset.cells.some(Boolean), false);
  reset.paint(id, 70, 50, 0);
  assert.equal(reset.cells[cell(70, 50)], id);
});
