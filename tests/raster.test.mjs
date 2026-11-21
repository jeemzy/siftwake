import test from 'node:test';
import assert from 'node:assert/strict';
import { World, W, H, M, tile } from '../src/world.ts';
import { rasterize } from '../src/raster.ts';

test('aging smoke and steam fade toward the chamber background, including under pressure', () => {
  const w = new World(), pixels = new Uint8Array(W * H * 4), i = 83 + 40 * W;
  for (const pressure of [false, true]) {
    w.pressure.fill(0.3);
    const view = { Heat: false, Air: false, Pressure: pressure };
    const red = () => { rasterize(w, view, pixels); return pixels[i * 4]; };
    for (const material of [M.Smoke, M.Steam]) {
      w.paint('Erase', 83, 40, 0);
      const background = red();
      w.paint(material, 83, 40, 0);
      const fresh = red();
      w.aux[i] = 30;
      const fading = red();
      assert.ok(fading > background && fading < fresh);
    }
  }
});

test('pressure blends signed grain and sponge shading before packing into an RGBA subarray', () => {
  const world = new World();
  const { id } = world.saveMaterial(null, {
    name: 'High contrast', color: '#FF00FF', family: 'solid', density: '70', rules: [],
  });
  const bytes = new Uint8Array(W * H * 4 + 2).fill(111);
  const output = bytes.subarray(1, -1);
  const shades = [[255, 0, 255], [200 - 8 * 30, 167 - 5 * 30, 78]];
  for (let x = 0; x < W; x++) {
    world.cells[x] = x % 2 === 0 ? id : M.Sponge;
    world.amount[x] = 30;
  }
  for (const p of [0, -0.00025, 0.16, -4]) {
    world.pressure.fill(p);
    rasterize(world, { Heat: false, Air: false, Pressure: true }, output);
    const k = Math.min(0.85, Math.sqrt(Math.abs(world.pressure[tile(0, 0)])) * 0.85);
    const target = p > 0 ? [244, 145, 70] : [65, 155, 238];
    for (let x = 0; x < W; x++) {
      const grain = ((Math.imul(x + 1231, 16807) >>> 4) % 17) - 8;
      const channels = shades[x % 2].map((value, c) => {
        const raw = value + grain;
        const mixed = raw + (target[c] - raw) * k;
        return c === 0 ? Math.min(255, mixed) : mixed;
      });
      const expected = Uint8Array.from([...channels, 255]);
      assert.deepEqual(output.subarray(x * 4, x * 4 + 4), expected);
    }
    assert.equal(bytes[0], 111);
    assert.equal(bytes.at(-1), 111);
  }
});
