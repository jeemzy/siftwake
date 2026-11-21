import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMotionAccess, createMotionInput } from '../src/motion.ts';
import { W, H, M, World, tile } from '../src/world.ts';
import { decodeCheckpoint, encodeCheckpoint } from '../src/checkpoint.ts';
import { normal } from '../src/views.ts';

const neutral = { gravityX: 0, gravityY: 1, shakeX: 0, shakeY: 0 };
const gravity = 9.80665;
const sample = (tilt, x = 0, y = 0, z = 0, down = 1) => ({
  acceleration: { x, y, z },
  accelerationIncludingGravity: { x: x + tilt * gravity, y: y - down * gravity },
});
const read = (world, x, y) => world.cells[x + y * W];

function positions(world, material) {
  const points = [];
  world.cells.forEach((id, i) => {
    if (id === material) points.push([i % W, Math.floor(i / W)]);
  });
  return points;
}

test('sensor gravity preserves both axes at intermediate angles', () => {
  const motion = createMotionInput();
  motion.sample(
    {
      acceleration: { x: 2, y: 3, z: 0 },
      accelerationIncludingGravity: { x: 2 - 0.6 * gravity, y: 3 - 0.8 * gravity },
    },
    0,
  );
  const { gravityX, gravityY } = motion.read(0);
  assert.ok(Math.abs(gravityX + 0.6) < 0.03);
  assert.ok(Math.abs(gravityY - 0.8) < 0.03);
});

test('rotating the phone moves water and powder already on the board and reverses gas rise', () => {
  for (const gravityX of [-1, 1]) {
    const world = new World();
    const custom = world.saveMaterial(null, {
      name: 'Dye',
      density: '40',
      color: '#749FAB',
      family: 'liquid',
      rules: [],
    }).id;
    world.paint('Water', 80, 45, 1);
    world.paint('Sand', 80, 100, 0);
    world.paint(custom, 80, 145, 1);
    world.paint('Smoke', 80, 190, 0);
    for (let i = 0; i < 10; i++) world.step();
    const [[oldX, oldY]] = positions(world, M.Smoke);
    for (let i = 0; i < 100; i++) world.step({ ...neutral, gravityX, gravityY: 0 });
    const edge = gravityX > 0 ? W - 1 : 0;
    for (const id of [M.Water, M.Sand, custom]) {
      const points = positions(world, id);
      assert.ok(points.length && points.every(([x, y]) => x === edge && y < H - 20));
    }
    const [[x, y]] = positions(world, M.Smoke);
    assert.ok((x - oldX) * gravityX < -8);
    assert.equal(y, oldY);
  }
});

test('water follows intermediate angles and pools in the lowest corner', () => {
  const world = new World();
  world.paint('Water', 80, 110, 0);
  const diagonal = { ...neutral, gravityX: -0.6, gravityY: 0.8 };
  for (let i = 0; i < 70; i++) world.step(diagonal);
  const [[x, y]] = positions(world, M.Water);
  assert.ok(x < 55 && x > 45 && y > 145 && y < 155, [x, y]);
  for (let i = 0; i < 300; i++) world.step(diagonal);
  const [[cornerX, cornerY]] = positions(world, M.Water);
  assert.ok(cornerX < 4 && cornerY > H - 5, [cornerX, cornerY]);
  for (let i = 0; i < H; i++) world.step({ ...neutral, gravityX: 0, gravityY: -1 });
  assert.equal(positions(world, M.Water)[0][1], 0);
});

test('a restored preference checks permission silently and only an explicit enable can prompt', async () => {
  let prompts = 0;
  let canAskAgain = true;
  let granted = false;
  const sensor = {
    isAvailableAsync: async () => true,
    getPermissionsAsync: async () => ({ granted, canAskAgain }),
    requestPermissionsAsync: async () => {
      prompts++;
      granted = true;
      return { granted, canAskAgain };
    },
  };
  assert.equal(await checkMotionAccess(sensor, false), 'denied');
  assert.equal(prompts, 0);
  assert.equal(await checkMotionAccess(sensor, true), 'ready');
  assert.equal(await checkMotionAccess(sensor, false), 'ready');
  assert.equal(prompts, 1);
  granted = canAskAgain = false;
  assert.equal(await checkMotionAccess(sensor, true), 'denied');
  assert.equal(prompts, 1);
  assert.equal(
    await checkMotionAccess({ ...sensor, isAvailableAsync: async () => false }, true),
    'unavailable',
  );
});

test('the filtered direction ignores tiny axis noise and returns to screen-down when stale', () => {
  const motion = createMotionInput();
  motion.sample(sample(0.01, 3), 0);
  assert.deepEqual(motion.read(0), neutral);
  for (let i = 1; i <= 8; i++) motion.sample(sample(-0.6, 0, 0, 0, 0.8), i * 50);
  const leaning = motion.read(400);
  assert.ok(leaning.gravityX < -0.5 && leaning.gravityX > -0.6);
  assert.ok(leaning.gravityY > 0.8 && leaning.gravityY < 0.9);
  assert.equal(leaning.shakeX, 0);
  assert.equal(leaning.shakeY, 0);
  assert.deepEqual(motion.read(651), neutral);
});

test('a shake is directional, decays during fresh sampling, and clears at a lifecycle boundary', () => {
  const motion = createMotionInput();
  motion.sample(sample(0, 14), 0);
  const start = motion.read(0);
  assert.ok(start.shakeX < -0.45 && start.shakeX >= -1);
  assert.equal(start.gravityX, 0);
  motion.sample(sample(0, -14), 100);
  assert.ok(motion.read(100).shakeX < 0 && motion.read(100).shakeX > start.shakeX);
  motion.sample(sample(0), 250);
  assert.deepEqual(motion.read(250), neutral);
  motion.sample(sample(0, 0, 0, 14), 300);
  assert.notEqual(motion.read(300).shakeX, 0);
  motion.clear();
  assert.deepEqual(motion.read(310), neutral);
  motion.sample(sample(0, 0, 14), 320);
  assert.ok(motion.read(320).shakeY > 0);
});

test('a queued sample uses acquisition time and cannot cross a pause boundary', () => {
  const motion = createMotionInput();
  motion.sample(sample(0, 14), 100, 400);
  assert.deepEqual(motion.read(400), neutral);
  motion.sample(sample(0, 14), 380, 400);
  assert.ok(motion.read(400).shakeX < 0);
  motion.clear(420);
  motion.sample(sample(0, 14), 410, 445);
  assert.deepEqual(motion.read(445), neutral);
  motion.sample(sample(0, -14), 450, 460);
  assert.ok(motion.read(460).shakeX > 0);
});

test('shake still jostles lighter custom powder more than heavier powder', () => {
  const shift = (density) => {
    const world = new World();
    const { id } = world.saveMaterial(null, {
      name: 'Grains',
      density,
      color: '#749FAB',
      family: 'powder',
      rules: [],
    });
    for (let y = 70; y < 100; y++) world.paint(id, 80, y, 0);
    for (let i = 0; i < 25; i++) world.step({ ...neutral, shakeX: 1 });
    return positions(world, id).reduce((sum, [x]) => sum + x - 80, 0) / 30;
  };
  assert.ok(shift('5') > shift('98') + 4);
});

test('shake moves gas while a sealed wall, fixed material and device keep their locations', () => {
  const world = new World();
  for (let y = 0; y < H; y += 4) world.paint('Wall', 100, y);
  world.paint('Wood', 70, 80, 0);
  world.paint('Fan', 65, 82);
  world.strength = 0;
  for (let y = 85; y < 117; y++) world.paint('Smoke', 96, y, 0);
  for (let i = 0; i < 24; i++) world.step({ ...neutral, gravityX: 1, gravityY: 0, shakeX: 1 });
  assert.equal(read(world, 70, 80), M.Wood);
  assert.equal(world.device[tile(65, 82)], 1);
  assert.equal(world.wall[tile(100, 86)], 1);
  const smoke = [];
  world.cells.forEach((id, i) => {
    if (id === M.Smoke) smoke.push(i % W);
  });
  assert.equal(smoke.length, 32);
  assert.ok(smoke.every((x) => x < 100) && smoke.some((x) => x > 96));
});

test('neutral ticks stay deterministic and checkpoints store only the Motion preference', () => {
  const w = new World('Tunnel');
  const neutralWorld = World.restore(w.snapshot());
  for (let i = 0; i < 25; i++) {
    w.step();
    neutralWorld.step(neutral);
  }
  assert.deepEqual(w.snapshot(), neutralWorld.snapshot());
  const editor = { scene: 'Tunnel', tool: 'Sand', brush: 3, camera: normal, category: 'Air' };
  const old = encodeCheckpoint({ world: w, editor });
  assert.equal(decodeCheckpoint(old.world, old.editor).editor.motionEnabled, undefined);
  w.step({ ...neutral, shakeX: 1 });
  const next = encodeCheckpoint({ world: w, editor: { ...editor, motionEnabled: true } });
  const loaded = decodeCheckpoint(next.world, next.editor);
  assert.equal(loaded.editor.motionEnabled, true);
  w.step();
  loaded.world.step();
  assert.deepEqual(loaded.world.snapshot(), w.snapshot());
  assert.throws(() =>
    decodeCheckpoint(
      next.world,
      JSON.stringify({
        version: 1,
        editor: {
          ...editor,
          motionEnabled: 'true',
        },
      }),
    ),
  );
});
