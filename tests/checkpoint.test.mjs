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

test('restart waits for SQLite commit; an interrupted save preserves both previous generations', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { writeSlot } = await import('../src/checkpoint.ts');
  const { saveAndRestart } = await import('../src/updateCheck.ts');
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE checkpoints (id INTEGER PRIMARY KEY, world BLOB NOT NULL, editor TEXT NOT NULL)',
  );
  const adapter = {
    withTransactionSync(fn) {
      db.exec('BEGIN');
      try {
        fn();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    execSync(sql) {
      db.exec(sql);
    },
    runSync(sql, ...args) {
      db.prepare(sql).run(...args);
    },
  };
  try {
    const world = new World('Tunnel');
    const save = () => writeSlot(adapter, { world, editor });
    const rows = () => db.prepare('SELECT world,editor FROM checkpoints ORDER BY id DESC').all();
    save();
    world.step();
    save();
    world.step();
    let reloads = 0;
    db.exec(
      "CREATE TRIGGER fail_write BEFORE DELETE ON checkpoints BEGIN SELECT RAISE(ABORT,'simulated interrupted write'); END",
    );
    await assert.rejects(
      saveAndRestart(save, async () => {
        reloads++;
      }),
    );
    assert.equal(reloads, 0);
    assert.deepEqual(
      rows().map((r) => decodeCheckpoint(r.world, r.editor).world.ticks),
      [1, 0],
    );
    db.exec('DROP TRIGGER fail_write');
    await saveAndRestart(save, async () => {
      reloads++;
      assert.deepEqual(readSlots(rows()).session.world.snapshot(), world.snapshot());
    });
    assert.equal(reloads, 1);
    assert.equal(rows().length, 2);
  } finally {
    db.close();
  }
});
