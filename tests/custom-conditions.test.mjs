import assert from 'node:assert/strict';
import test from 'node:test';
import { editMaterial, readMaterialCatalog, self } from '../src/materials.ts';
import { World, W, M, tile } from '../src/world.ts';

const contact = { with: M.Wood, own: null, other: M.Glass };
const draft = (rule) => ({
  name: 'Thermostat', color: '#715774', family: 'solid', density: '50', rules: [rule],
});
const at = (x, y) => x + y * W;

test('optional signed fields retain zero and normalize decimal commas without changing old rules', () => {
  const input = draft({ ...contact, minTemperature: ' -10,5 ', maxTemperature: '+0',
    minPressure: ' ', maxPressure: '0.25', heatExchange: '-.5' });
  const { material } = editMaterial([], null, input);
  assert.deepEqual(material.rules[0], { ...contact, minTemperature: -10.5, maxTemperature: 0,
    maxPressure: 0.25, heatExchange: -0.5 });
  assert.deepEqual(readMaterialCatalog(JSON.stringify([material])), [material]);
  const old = editMaterial([], null, draft(contact)).material;
  assert.deepEqual(old.rules, [contact]);
  assert.deepEqual(readMaterialCatalog(JSON.stringify([old])), [old]);
});

test('drafts, live catalogs and restored catalogs enforce the same bounds and pair conflicts', () => {
  const world = new World();
  const { id } = world.saveMaterial(null, draft(contact));
  const snapshot = world.snapshot();
  for (const [fields, key] of [
    [{ minTemperature: -151 }, 'minTemperature'], [{ maxTemperature: 2301 }, 'maxTemperature'],
    [{ minPressure: -12.01 }, 'minPressure'], [{ maxPressure: 12.01 }, 'maxPressure'],
    [{ heatExchange: 201 }, 'heatExchange'], [{ heatExchange: -201 }, 'heatExchange'],
    [{ minTemperature: 2, maxTemperature: 1 }, 'maxTemperature'],
    [{ minPressure: 2, maxPressure: 1 }, 'maxPressure'],
    [{ heatExchange: 'nine' }, 'heatExchange'], [{ minTemperature: 'Infinity' }, 'minTemperature'],
    [{ own: null, other: null, heatExchange: 5 }, 'heatExchange'],
    [{ own: id, other: M.Wood, heatExchange: -5 }, 'heatExchange'],
    [{ own: M.Wood, other: id, heatExchange: 5 }, 'heatExchange'],
  ]) {
    const input = draft({ ...contact, ...fields });
    const before = structuredClone(input);
    assert.ok(world.saveMaterial(id, input).errors.rules[0][key], key);
    assert.deepEqual(input, before);
    assert.throws(() => readMaterialCatalog(JSON.stringify([{ ...world.customMaterials[0],
      rules: input.rules }])), /catalog/);
  }
  const duplicates = draft({ ...contact, minTemperature: 1 });
  duplicates.rules.push({ ...contact, maxTemperature: 4 });
  assert.ok(world.saveMaterial(id, duplicates).errors.rules[1].with);
  assert.deepEqual(world.snapshot(), snapshot);
  assert.ok(editMaterial([], null, draft({ ...contact, own: self, other: null, heatExchange: 5 }))
    .errors.rules[0].heatExchange);
});

function experiment(rule, ownerX = 43, woodX = 44) {
  const world = new World();
  const { id } = world.saveMaterial(null, draft({ ...contact, ...rule }));
  assert.ok(id);
  world.paint(id, ownerX, 40, 0);
  world.paint('Wood', woodX, 40, 0);
  return { world, id, owner: at(ownerX, 40), wood: at(woodX, 40), gauge: tile(ownerX, 40) };
}

test('restored contact-only rules keep the product brush temperature; conditional rules keep local heat', () => {
  for (const [fields, expected] of [[{}, 850], [{ minTemperature: 20 }, 20]]) {
    const { world, wood } = experiment({ other: M.Flame, ...fields });
    const restored = World.restore(world.snapshot());
    restored.step();
    assert.equal(restored.cells[wood], M.Flame);
    assert.equal(restored.temperature[wood], expected);
  }
});

test('inclusive local conditions gate a completed reaction independent of scan orientation', () => {
  const rule = { minTemperature: 20, maxTemperature: 20, minPressure: 0, maxPressure: 0,
    heatExchange: 40 };
  for (const [ownerX, woodX] of [[43, 44], [44, 43]]) {
    const { world, owner, wood } = experiment(rule, ownerX, woodX);
    const restored = World.restore(world.snapshot());
    world.step();
    assert.equal(world.cells[wood], M.Glass);
    assert.equal(world.temperature[owner], 60);
    assert.equal(world.temperature[wood], 20);
    for (let n = 0; n < 99; n++) world.step();
    for (let n = 0; n < 100; n++) restored.step();
    assert.deepEqual(restored.snapshot(), world.snapshot());

    for (const [key, inside, outside] of [
      ['minPressure', 2, 0], ['maxPressure', -2, 0],
      ['minTemperature', 100, 20], ['maxTemperature', -20, 20],
    ]) {
      for (const shouldFire of [true, false]) {
        const { world: w, owner: i, wood: j, gauge } =
          experiment({ [key]: (inside + outside) / 2 }, ownerX, woodX);
        const values = key.endsWith('Pressure') ? w.pressure : w.temperature;
        const ownerIndex = values === w.pressure ? gauge : i;
        const otherIndex = values === w.pressure ? tile(woodX, 40) : j;
        values[ownerIndex] = shouldFire ? inside : outside;
        values[otherIndex] = shouldFire ? outside : inside;
        w.step();
        assert.equal(w.cells[j], shouldFire ? M.Glass : M.Wood, key);
      }
    }
  }
});

test('a signed heat exchange occurs once, stays bounded, and reaches the surviving product or air', () => {
  for (const delta of [-180, 160]) {
    const { world, owner, wood } = experiment({ own: M.Empty, heatExchange: delta });
    world.step();
    assert.equal(world.cells[owner], M.Empty);
    assert.equal(world.cells[wood], M.Glass);
    assert.equal(world.temperature[wood], Math.max(-150, 20 + delta));
    world.step();
    assert.ok(Math.abs(world.temperature[wood] - 20) < Math.abs(delta));
  }
  const { world, gauge } = experiment({ own: M.Empty, other: M.Empty, heatExchange: 160 });
  world.step();
  assert.equal(world.airTemperature[gauge], 30);
  const hot = experiment({ own: M.Copper, heatExchange: 200 });
  hot.world.temperature[hot.owner] = 2300;
  hot.world.step();
  assert.equal(hot.world.cells[hot.owner], M.Copper);
  assert.equal(hot.world.temperature[hot.owner], 2300);
});
