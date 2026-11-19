import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { decodeCheckpoint, readSlots } from '../src/checkpoint.ts';
import { createUpdateCheck } from '../src/updateCheck.ts';

const editor = {
  scene: 'Tunnel',
  tool: 'Heat',
  brush: 6,
  category: 'Thermal',
  camera: { Pressure: true, Air: false, Heat: true },
};
const meta = JSON.stringify({ version: 1, editor });
test('binary checkpoint continues a hot, moving world deterministically', () => {
  const w = new World('Tunnel');
  w.strength = 0.76;
  w.paint('Water', 100, 40, 4);
  w.paint('Heat', 100, 40, 4);
  for (let i = 0; i < 80; i++) w.step();
  const blob = w.snapshot();
  const restored = decodeCheckpoint(blob, meta);
  assert.deepEqual(restored.editor, editor);
  assert.deepEqual(blob, restored.world.snapshot());
  for (let i = 0; i < 60; i++) {
    w.step();
    restored.world.step();
  }
  assert.deepEqual(w.snapshot(), restored.world.snapshot());
});
test('truncated or future checkpoints preserve the previous readable slot', () => {
  const row = { editor: meta, world: new World().snapshot() };
  const newer = { ...row, editor: '{"version":2}' };
  assert.equal(readSlots([newer, row]).writable, false);
  assert.ok(readSlots([newer, row]).session);
  assert.equal(readSlots([{ editor: meta, world: row.world.slice(1) }]).session, undefined);
  assert.ok(readSlots([]).writable);
});
test('offline checks and interrupted fetches never activate; foreground retries are throttled', async () => {
  let t = 0,
    checks = 0,
    downloads = 0;
  const check = createUpdateCheck(
    {
      check: async () => {
        if (++checks === 1) throw Error('offline');
        return { isAvailable: true };
      },
      fetch: async () => {
        if (++downloads === 1) throw Error('interrupted');
        return { isNew: true };
      },
    },
    () => t,
  );
  assert.equal(await check(), false);
  await check();
  assert.equal(checks, 1);
  t += 60001;
  assert.equal(await check(), false);
  t += 60001;
  assert.equal(await check(), true);
  t += 60001;
  assert.equal(await check(), true);
  assert.equal(downloads, 2);
});
