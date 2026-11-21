import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { M, World, W, tile } from '../src/world.ts';
import { builtinById, contactKey } from '../src/materials.ts';
import { classicHotbar, decodeCheckpoint, defaultHotbar, encodeCheckpoint, readSlots } from '../src/checkpoint.ts';
import { createUpdateCheck } from '../src/updateCheck.ts';

const editor = {
  scene: 'Tunnel',
  tool: 'Heat',
  brush: 6,
  category: 'Thermal',
  camera: { Pressure: true, Air: false, Heat: true },
};
const meta = JSON.stringify({ version: 1, editor });
const fixture = (name) => gunzipSync(readFileSync(new URL('./fixtures/' + name, import.meta.url)));

test('v1 widens the released world and restores editor and per-fan defaults', () => {
  const blob = fixture('world-0.3.0.bin.gz');
  const { world, editor: migrated } = decodeCheckpoint(blob, meta);
  assert.ok(world.cells instanceof Uint16Array);
  assert.deepEqual(world.cells, Uint16Array.from(blob.subarray(32, 32 + world.cells.length)));
  assert.equal(world.devicePower[tile(66, 54)], 43);
  assert.deepEqual(migrated, { ...editor, hotbar: [...classicHotbar], thermalPower: 100, sourceMode: false });
  assert.deepEqual(World.restore(world.snapshot()).snapshot(), world.snapshot());
});

test('fresh material defaults differ from legacy slots; configured hotbars survive every probe mode', () => {
  assert.deepEqual(defaultHotbar, [M.ClayDust, M.BakingSoda, M.Vinegar, M.Copper, M.Wax, M.Flame]);
  assert.deepEqual(classicHotbar, [M.Sand, M.Water, M.Gravel, M.Smoke, M.Wood, M.Flame]);
  const world = new World();
  const hotbar = [null, M.Rock, M.Smoke, null, null, M.Soil];
  function roundtrip(tool, category, probeMode) {
    const row = encodeCheckpoint({ world, editor: { ...editor, tool, category, hotbar, probeMode } });
    const saved = decodeCheckpoint(row.world, row.editor).editor;
    assert.deepEqual(saved.hotbar, hotbar);
    return [saved.tool, saved.probeMode, saved.category];
  }
  assert.deepEqual(roundtrip('Probe', 'Thermal'), ['Probe', true, 'Thermal']);
  for (const tool of ['Heat', 'Cool']) {
    assert.deepEqual(roundtrip(tool, 'Thermal', true), [tool, true, 'Thermal']);
    assert.deepEqual(roundtrip(tool, 'Thermal', false), [tool, false, 'Thermal']);
  }
  assert.deepEqual(roundtrip('Probe', 'Air', true), [M.Rock, false, 'Air']);
  assert.deepEqual(roundtrip(M.Soil, 'Materials', true), [M.Soil, false, 'Materials']);
  assert.deepEqual(roundtrip('Cool', 'World', true), ['Cool', false, 'World']);
});

test('v2 preserves all 239 custom IDs, the custom Snow and its Water contact when upgraded', () => {
  // The bd283ab writer painted custom ID 255, heated it, and advanced a tick before saving.
  const blob = fixture('world-bd283ab-v2.bin.gz');
  const { world } = decodeCheckpoint(blob, JSON.stringify({ version: 1, editor: { ...editor, tool: 255 } }));
  assert.deepEqual(world.customMaterials.map((m) => m.id), Array.from({ length: 239 }, (_, i) => 17 + i));
  const snow = world.customMaterials.at(-1);
  assert.equal(snow.name, 'Snow');
  assert.deepEqual(snow.rules, [{ with: M.Water, own: null, other: M.Ice }]);
  assert.equal(world.cells[55 + 64 * W], 255);
  assert.ok(world.temperature[55 + 64 * W] > 200);
  assert.equal(world.amount[world.cells.indexOf(M.Water)], 1);
  assert.equal(world.devicePower[tile(12, 8)], 69);
  assert.equal(builtinById(256), undefined);
  assert.equal(M.Slush, 257);
  const oldSlush = world.customMaterials.at(-2);
  assert.equal(oldSlush.name, builtinById(M.Slush).name);
  assert.deepEqual(world.saveMaterial(254, { ...oldSlush, density: '46' }), { id: 254 });
  assert.deepEqual(world.saveMaterial(255, { ...snow, density: '80' }), { id: 255 });
  assert.ok(world.saveMaterial(null, { ...snow, density: '80' }).errors.form);
  const settings = { ...editor, tool: M.Slush, hotbar: [255, M.Slush, null, M.Cork, M.Ash, null],
    thermalPower: 34, sourceMode: true };
  world.paint(M.Slush, 56, 64, 0);
  world.aux[56 + 64 * W] = 1024;
  assert.ok(world.placeSource(M.Slush, 80, 40, 6));
  assert.ok(world.placeSource('Cool', 90, 40, 3, 34));
  const row = encodeCheckpoint({ world, editor: settings });
  const restored = decodeCheckpoint(row.world, row.editor);
  assert.deepEqual(restored.editor, settings);
  assert.equal(restored.world.customMaterials.at(-1).name, 'Snow');
  assert.equal(restored.world.cells[56 + 64 * W], M.Slush);
  assert.equal(restored.world.aux[56 + 64 * W], 1024);
  assert.equal(restored.world.deviceMaterial[tile(80, 40)], M.Slush);
  assert.equal(restored.world.deviceRadius[tile(80, 40)], 6);
  assert.equal(restored.world.devicePower[tile(90, 40)], 34);
  assert.deepEqual(restored.world.snapshot(), row.world);
});

test('a corrupt v3 slot falls back without changing either stored generation', () => {
  const previous = { world: fixture('world-0.3.0.bin.gz'), editor: meta };
  const previousBytes = Buffer.from(previous.world);
  const expected = World.restore(previous.world).snapshot();
  for (const damage of [
    (w) => { w.cells[0] = 256; },
    (w) => { w.cells[0] = 255; }, // No custom catalog in this world.
    (w) => { w.deviceMaterial[0] = 65535; },
    (w) => { w.device[0] = 10; },
    (w) => { w.pressure[0] = Infinity; },
  ]) {
    const w = new World();
    damage(w);
    const latest = { world: w.snapshot(), editor: meta };
    const copy = latest.world.slice();
    const opened = readSlots([latest, previous]);
    assert.deepEqual(opened.session.world.snapshot(), expected);
    assert.equal(opened.writable, false);
    assert.deepEqual(latest.world, copy);
    assert.deepEqual(previous.world, previousBytes);
  }
});

test('unordered contact keys keep extended IDs distinct from legacy pairs', () => {
  assert.notEqual(contactKey(17, M.Slush + 20), contactKey(18, 21));
  assert.equal(contactKey(17, M.Slush), contactKey(M.Slush, 17));
});

test('invalid editor bindings and an incomplete v3 catalog preserve the previous slot', () => {
  const w = new World();
  const { id } = w.saveMaterial(null, { name: 'Test', color: '#112233', family: 'solid', density: '30', rules: [] });
  assert.equal(id, 17);
  const row = { world: w.snapshot(), editor: meta };
  for (const fields of [
    { hotbar: [0, 1, 2, 3, 4, 5] }, { hotbar: [null] }, { hotbar: [255, 1, 2, 3, 4, 5] },
    { sourceMode: 1 }, { probeMode: 'true' }, { thermalPower: 101 }, { thermalPower: -1 }, { tool: 256 },
  ]) {
    const latest = { ...row, editor: JSON.stringify({ version: 1, editor: { ...editor, ...fields } }) };
    assert.equal(readSlots([latest, row]).writable, false);
  }
  const tail = new DataView(row.world.buffer).getUint32(32);
  assert.ok(tail > 0);
  assert.throws(() => World.restore(row.world.subarray(0, row.world.length - tail)), /length/);
});

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
    const draft = {
      name: 'Vitreous dye',
      color: '#6B3FC4',
      family: 'solid',
      density: '40',
      rules: [{ with: M.Water, own: null, other: M.Glass }],
    };
    const { id } = world.saveMaterial(null, draft);
    world.paint(id, 60, 10, 1);
    const save = () => writeSlot(adapter, { world, editor });
    const rows = () => db.prepare('SELECT world,editor FROM checkpoints ORDER BY id DESC').all();
    save();
    world.step();
    save();
    world.saveMaterial(id, { ...draft, name: 'Glaze' });
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
    assert.equal(readSlots(rows()).session.world.customMaterials[0].name, 'Vitreous dye');
    db.exec('DROP TRIGGER fail_write');
    await saveAndRestart(save, async () => {
      reloads++;
      const reopened = readSlots(rows()).session.world;
      assert.deepEqual(reopened.snapshot(), world.snapshot());
      assert.equal(reopened.customMaterials[0].name, 'Glaze');
      assert.deepEqual(reopened.customMaterials[0].rules, draft.rules);
    });
    assert.equal(reloads, 1);
    assert.equal(rows().length, 2);
  } finally {
    db.close();
  }
});
