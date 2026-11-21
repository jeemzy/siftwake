import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMotionAccess, createMotionInput } from '../src/motion.ts';
import { W, H, M, World, tile } from '../src/world.ts';
import { decodeCheckpoint, encodeCheckpoint } from '../src/checkpoint.ts';
import { normal } from '../src/views.ts';

const neutral = { tiltX: 0, shakeX: 0, shakeY: 0 };
const gravity = 9.80665;
const sample = (tilt, x = 0, y = 0, z = 0) => ({
  acceleration: { x, y, z },
  accelerationIncludingGravity: { x: x + tilt * gravity },
});
const read = (world, x, y) => world.cells[x + y * W];

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

test('only gravity drives steady tilt, with a dead zone and stale-sample cutoff', () => {
  const motion = createMotionInput();
  motion.sample(sample(0.08, 3), 0);
  assert.deepEqual(motion.read(0), neutral);
  for (let i = 1; i <= 8; i++) motion.sample(sample(-0.55), i * 50);
  const leaning = motion.read(400);
  assert.ok(leaning.tiltX < -0.6 && leaning.tiltX > -1);
  assert.equal(leaning.shakeX, 0);
  assert.equal(leaning.shakeY, 0);
  assert.deepEqual(motion.read(651), neutral);
});

test('a shake is directional, decays during fresh sampling, and clears at a lifecycle boundary', () => {
  const motion = createMotionInput();
  motion.sample(sample(0, 14), 0);
  const start = motion.read(0);
  assert.ok(start.shakeX < -0.45 && start.shakeX >= -1);
  assert.equal(start.tiltX, 0);
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

test('tilt reverses sand and water drift, and lighter custom powders move farther', () => {
  const experiment = (tiltX) => {
    const world = new World();
    const powder = (name, density) =>
      world.saveMaterial(null, {
        name,
        density,
        color: '#749FAB',
        family: 'powder',
        rules: [],
      }).id;
    const light = powder('Pumice', '5');
    const heavy = powder('Iron filings', '98');
    for (const [tool, x, y] of [
      ['Sand', 80, 25],
      ['Water', 80, 75],
      [light, 80, 125],
      [heavy, 80, 175],
    ])
      for (let row = 0; row < 3; row++)
        for (let column = 0; column < 4; column++)
          world.paint(tool, x + column * 3, y + row * 3, 0);
    for (let i = 0; i < 22; i++) world.step({ ...neutral, tiltX });
    const centers = new Map([M.Sand, M.Water, light, heavy].map((id) => [id, []]));
    world.cells.forEach((id, i) => centers.get(id)?.push(i % W));
    return [...centers.values()].map((cells) => cells.reduce((n, x) => n + x) / cells.length);
  };
  const left = experiment(-1);
  const right = experiment(1);
  for (let i = 0; i < 4; i++) assert.ok(left[i] < 82 && right[i] > 87, [left, right]);
  assert.ok(right[2] - left[2] > right[3] - left[3] + 2, [left, right]);
});

test('shake moves gas while a sealed wall, fixed material and device keep their locations', () => {
  const world = new World();
  for (let y = 0; y < H; y += 4) world.paint('Wall', 100, y);
  world.paint('Wood', 70, 80, 0);
  world.paint('Fan', 65, 82);
  world.strength = 0;
  for (let y = 85; y < 117; y++) world.paint('Smoke', 96, y, 0);
  for (let i = 0; i < 24; i++) world.step({ ...neutral, tiltX: 1, shakeX: 1 });
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
