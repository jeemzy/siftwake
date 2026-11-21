import {
  contactKey,
  editMaterial,
  firstCustom,
  readMaterialCatalog,
  type ContactRule,
  type Material,
  type MaterialDraft,
  type MaterialResult,
} from './materials.ts';
import { M } from './materialIds.ts';
export { M } from './materialIds.ts';
import type { MotionInput } from './motion.ts';
import { builtinById, builtinMaterials } from './builtinRegistry.ts';
import { clearWallPath, outlets, percent, SOURCE } from './devices.ts';
import { packContext, runPacks } from './runPacks.ts';
import { W, H, A, B, cellTile, tile } from './grid.ts';
export { W, H, A, B, tile } from './grid.ts';

const N = W * H,
  T = A * B;
export type BuiltinTool =
  | 'Sand'
  | 'Water'
  | 'Gravel'
  | 'Smoke'
  | 'Wood'
  | 'Flame'
  | 'Wall'
  | 'Fan'
  | 'Pressure'
  | 'Suction'
  | 'Wind'
  | 'Erase'
  | 'Heat'
  | 'Cool'
  | 'Probe';
export type Tool = BuiltinTool | number;

export type ProbeReading = {
  temperature: number;
  contents?: { label: string; value: number; unit: string };
  pressure: number;
  speed: number;
  direction: string;
};
export type Scene = 'Tunnel' | 'Blank';
const dirs = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
type Direction = readonly [number, number];
const screenDown: Direction = [0, 1];
const builtinsForMovement: (typeof builtinMaterials[number] | Material)[] = [];
for (const material of builtinMaterials) builtinsForMovement[material.id] = material;
const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v;

const ambient = 20;
const materialCount = Math.max(...builtinMaterials.map(m => m.id)) + 1;
const conductivityById = new Float64Array(materialCount).fill(0.09);
const airFlagsById = new Uint8Array(materialCount).fill(1);
airFlagsById[M.Empty] = 0;
for (const m of builtinMaterials) {
  conductivityById[m.id] = m.conductivity;
  airFlagsById[m.id] = m.family === 'gas' ? 0 : 1;
}
// Each material pair conducts at the lower of its coefficients. Materials with
// the same coefficient share one row, including every player-made material.
const conductivities = new Map<number, Float64Array>();
const contactConductivity = Array.from(conductivityById, k => {
  let row = conductivities.get(k);
  if (!row) {
    row = conductivityById.map(other => Math.min(k, other));
    conductivities.set(k, row);
  }
  return row;
});
// Match the original Float32 rounding after each occupied cell narrows its air tile.
const opennessByCount = new Float32Array(17);
opennessByCount[0] = 1;
for (let i = 1; i <= 16; i++) opennessByCount[i] = opennessByCount[i - 1] - 0.061;
// Four cells contribute at most four obstructions. A higher bit flags a material
// that needs a reaction or lifetime update even at room temperature.
const roomReactionFlag = 8;
for (const id of [M.Ice, M.Smoke, M.Steam, M.Ember, M.Flame, M.Lava, M.MoltenGlass])
  airFlagsById[id] |= roomReactionFlag;

// Escaping non-ASCII code units keeps the appended JSON portable across JS runtimes.
function catalogBytes(catalog: readonly Material[]) {
  const json = JSON.stringify(catalog).replace(
    /[\u007f-\uffff]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
  return Uint8Array.from(json, (c) => c.charCodeAt(0));
}

function catalogText(bytes: Uint8Array) {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 8192)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return text;
}

export class World {
  temperature = new Float32Array(N).fill(ambient);
  airTemperature = new Float32Array(T).fill(ambient);
  private airDelta = new Float32Array(T);
  private heatDelta = new Float32Array(N);
  private latent = new Float32Array(N);
  private latentBits = new Uint32Array(this.latent.buffer);

  cells = new Uint16Array(N);
  life = new Uint16Array(N);
  amount = new Uint8Array(N);
  aux = new Uint16Array(N);
  wall = new Uint8Array(T);
  // Device values 1–4 are cardinal fans, 5 adds air, and 6 removes air.
  device = new Uint8Array(T);
  devicePower = new Uint8Array(T);
  deviceRadius = new Uint8Array(T);
  deviceMaterial = new Uint16Array(T);
  pressure = new Float32Array(T);
  u = new Float32Array(T); // Velocity through the right face.
  v = new Float32Array(T); // Velocity through the lower face.
  private openness = new Float32Array(T);
  private airFlags = airFlagsById.slice();
  private obstructionCatalog: readonly Material[] | undefined;
  private heatTiles = new Uint8Array(T);
  private occupiedStrips = new Uint8Array(N / 4);
  private hasPackCells = false;
  private reactionStrips = new Uint8Array(N / 4);
  private moved = new Uint32Array(N);
  private reacted = new Uint8Array(N);
  private seed = 139729;
  ticks = 0;
  strength = 0.55;
  edits = 0;
  private catalog: readonly Material[] = [];
  private movementMaterials = builtinsForMovement;
  private contacts = new Map<number, { owner: number; rule: ContactRule }>();
  private contactMaterials = new Set<number>();
  private customColors: readonly (readonly number[])[] = [];
  private packs = packContext(this, (i, product) => {
    const temperature = this.temperature[i];
    this.deposit(i % W, Math.floor(i / W), product);
    this.temperature[i] = temperature;
    this.moved[i] = this.ticks;
  }, (i) => { this.moved[i] = this.ticks; },
  (i) => this.moved[i] === this.ticks || !!this.reacted[i], () => this.random());

  get customMaterials() {
    return this.catalog;
  }

  get materialColors() {
    return this.customColors;
  }

  private custom(id: number): Material | undefined {
    return id >= firstCustom && id < 256 ? this.catalog[id - firstCustom] : undefined;
  }

  hasCustomMaterial(id: number) {
    return Number.isInteger(id) && this.custom(id) !== undefined;
  }

  private setCatalog(catalog: readonly Material[]) {
    this.catalog = catalog;
    this.movementMaterials = builtinsForMovement.slice();
    for (const material of catalog) this.movementMaterials[material.id] = material;
    this.contacts = new Map();
    this.contactMaterials = new Set();
    this.customColors = catalog.map(({ color }) =>
      [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16)),
    );
    for (const { id, rules } of catalog)
      for (const rule of rules) {
        this.contacts.set(contactKey(id, rule.with), { owner: id, rule });
        this.contactMaterials.add(id);
        this.contactMaterials.add(rule.with);
      }
  }

  saveMaterial(id: number | null, draft: MaterialDraft): MaterialResult {
    const result = editMaterial(this.catalog, id, draft);
    if ('errors' in result) return result;
    const next = [...this.catalog];
    next[result.material.id - firstCustom] = result.material;
    this.setCatalog(next);
    this.edits++;
    return { id: result.material.id };
  }

  reset(scene: Scene) {
    const world = new World(scene);
    world.setCatalog(this.catalog);
    return world;
  }

  // V1/V2 used one byte per cell. Their remaining fields have the same widths and order.
  private persistedFields(cells: Uint8Array | Uint16Array = this.cells) {
    const common = [
      cells,
      this.life,
      this.temperature,
      this.latent,
      this.wall,
      this.device,
      this.pressure,
      this.u,
      this.v,
      this.airTemperature,
      this.moved,
    ];
    if (cells instanceof Uint8Array) return common;
    return [...common, this.amount, this.aux, this.devicePower, this.deviceRadius, this.deviceMaterial];
  }

  // V3 records the catalog length, so a truncated tail cannot masquerade as an empty catalog.
  snapshot(): Uint8Array {
    const fields = this.persistedFields();
    const catalog = this.catalog.length ? catalogBytes(this.catalog) : null;
    const bytes = new Uint8Array(
      36 + fields.reduce((size, field) => size + field.byteLength, 0) + (catalog?.length ?? 0),
    );
    const header = new DataView(bytes.buffer);
    header.setUint32(0, 0x53494654);
    header.setUint32(4, 3);
    header.setUint16(8, W);
    header.setUint16(10, H);
    header.setFloat64(12, this.ticks);
    header.setUint32(20, this.seed);
    header.setFloat64(24, this.strength);
    header.setUint32(32, catalog?.length ?? 0);
    let offset = 36;
    for (const field of fields) {
      bytes.set(new Uint8Array(field.buffer, field.byteOffset, field.byteLength), offset);
      offset += field.byteLength;
    }
    if (catalog) bytes.set(catalog, offset);
    return bytes;
  }

  static restore(bytes: Uint8Array) {
    if (bytes.length < 32) throw Error('Unsupported world checkpoint');
    const world = new World();
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = header.getUint32(4);
    if (
      (version !== 1 && version !== 2 && version !== 3) ||
      (version === 3 && bytes.length < 36) ||
      header.getUint32(0) !== 0x53494654 ||
      header.getUint16(8) !== W ||
      header.getUint16(10) !== H
    )
      throw Error('Unsupported world checkpoint');
    const legacyCells = version < 3 ? new Uint8Array(N) : undefined;
    const fields = world.persistedFields(legacyCells);
    let offset = version < 3 ? 32 : 36;
    const baseLength = offset + fields.reduce((n, f) => n + f.byteLength, 0);
    const catalogLength = bytes.length - baseLength;
    if (
      (version === 1 && catalogLength !== 0) ||
      (version === 2 && catalogLength <= 0) ||
      (version === 3 && catalogLength !== header.getUint32(32))
    )
      throw Error('Invalid world checkpoint length');
    world.ticks = header.getFloat64(12);
    world.seed = header.getUint32(20);
    world.strength = header.getFloat64(24);
    if (
      !Number.isSafeInteger(world.ticks) ||
      world.ticks < 0 ||
      !Number.isFinite(world.strength) ||
      world.strength < 0 ||
      world.strength > 1
    )
      throw Error('Invalid world checkpoint');
    if (catalogLength)
      world.setCatalog(readMaterialCatalog(catalogText(bytes.subarray(baseLength))));
    for (const field of fields) {
      new Uint8Array(field.buffer, field.byteOffset, field.byteLength)
        .set(bytes.subarray(offset, offset + field.byteLength));
      offset += field.byteLength;
    }
    if (legacyCells) {
      world.cells.set(legacyCells);
      for (let i = 0; i < N; i++) world.amount[i] = builtinById(legacyCells[i])?.amount ?? 0;
      for (let t = 0; t < T; t++) {
        if (world.device[t] >= 1 && world.device[t] <= 4)
          world.devicePower[t] = Math.round(world.strength * 100);
      }
    }
    const known = (id: number) =>
      id === M.Empty || builtinById(id) !== undefined || world.hasCustomMaterial(id);
    if (
      world.cells.some((id) => !known(id)) ||
      world.deviceMaterial.some((id) => !known(id)) ||
      world.device.some((id, t) =>
        id > (legacyCells ? 6 : SOURCE.cool) ||
        (id >= SOURCE.material && ![1, 3, 6].includes(world.deviceRadius[t])) ||
        (id === SOURCE.material && world.deviceMaterial[t] === M.Empty)
      ) ||
      world.devicePower.some((value) => value > 100) ||
      world.wall.some((id) => id > 1) ||
      fields.some((f) => f instanceof Float32Array && !f.every(Number.isFinite))
    )
      throw Error('Unreadable world data');
    return world;
  }

  private random() {
    // The largest 32-bit seed times this multiplier, plus the increment, is below 2^53.
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  constructor(scene: Scene = 'Blank') {
    if (scene === 'Tunnel') this.tunnel();
  }

  private deposit(x: number, y: number, id: number) {
    if (id >= M.Slush) this.hasPackCells = true;
    const i = x + y * W;
    this.cells[i] = id;
    const definition = builtinById(id);
    this.temperature[i] = definition?.temperature ?? ambient;
    this.latent[i] = 0;
    this.life[i] = id === M.Flame ? 28 + Math.floor(this.random() * 20) : definition?.life ?? 0;
    this.amount[i] = definition?.amount ?? 0;
    this.aux[i] = 0;
  }

  private removeDevice(t: number) {
    this.device[t] = this.devicePower[t] = this.deviceRadius[t] = this.deviceMaterial[t] = 0;
  }

  placeSource(tool: Tool, x: number, y: number, radius = 3, thermalPower = 100) {
    if (!(x >= 0 && x < W && y >= 0 && y < H) || ![1, 3, 6].includes(radius)) return false;
    const t = tile(x, y);
    if (this.wall[t] || this.device[t]) return false;
    const kind = tool === 'Heat' ? SOURCE.heat : tool === 'Cool' ? SOURCE.cool : SOURCE.material;
    let material = 0;
    if (kind === SOURCE.material) {
      material = typeof tool === 'number' ? tool : M[tool as keyof typeof M];
      const custom = this.custom(material);
      if (!(custom ? custom.family !== 'solid' : builtinById(material)?.sourceEligible)) return false;
    }
    const left = x & ~3, top = y & ~3;
    for (let j = top; j < top + 4; j++)
      for (let k = left; k < left + 4; k++)
        if (this.cells[k + j * W]) return false;
    this.device[t] = kind;
    this.deviceMaterial[t] = material;
    this.deviceRadius[t] = radius;
    this.devicePower[t] = kind === SOURCE.material ? 0 : percent(thermalPower);
    this.edits++;
    return true;
  }

  fanAt(x: number, y: number, hitRadius: number) {
    if (!(x >= 0 && y >= 0 && x < W && y < H) || this.wall[tile(x, y)]) return -1;
    let nearest = -1, distance = hitRadius ** 2;
    for (let ty = Math.max(0, (y - hitRadius) >> 2); ty <= Math.min(B - 1, (y + hitRadius) >> 2); ty++)
      for (let tx = Math.max(0, (x - hitRadius) >> 2); tx <= Math.min(A - 1, (x + hitRadius) >> 2); tx++) {
        const t = tx + A * ty;
        if (this.device[t] < 1 || this.device[t] > 4) continue;
        const cx = tx * 4 + 2, cy = ty * 4 + 2;
        const squared = (x - cx) ** 2 + (y - cy) ** 2;
        if (squared <= distance && clearWallPath(this.wall, A, x, y, cx, cy)) {
          distance = squared;
          nearest = t;
        }
      }
    return nearest;
  }

  private applyThermal(x: number, y: number, radius: number, change: number, source = false) {
    if (!change) return;
    const touchedAir = new Set<number>();
    for (let j = Math.max(0, y - radius); j <= Math.min(H - 1, y + radius); j++)
      for (let k = Math.max(0, x - radius); k <= Math.min(W - 1, x + radius); k++) {
        const t = tile(k, j);
        if ((k - x) ** 2 + (j - y) ** 2 > radius ** 2 || this.wall[t]) continue;
        if (source && !clearWallPath(this.wall, A, x + 0.5, y + 0.5, k + 0.5, j + 0.5)) continue;
        const i = k + j * W;
        if (this.cells[i]) this.temperature[i] = clamp(this.temperature[i] + change, -150, 2300);
        else if (!touchedAir.has(t)) {
          this.changeAirTemperature(t, change);
          touchedAir.add(t);
        }
      }
  }

  private tickSources() {
    for (let t = 0; t < T; t++) {
      const kind = this.device[t];
      if (kind < SOURCE.material) continue;
      const x = (t % A) * 4, y = Math.floor(t / A) * 4;
      const radius = this.deviceRadius[t];
      if (kind !== SOURCE.material) {
        const change = (kind === SOURCE.heat ? 220 : -120) * this.devicePower[t] / 100;
        this.applyThermal(x + 2, y + 2, radius, change, true);
        continue;
      }
      let remaining = radius;
      for (let n = 0; n < outlets.length && remaining > 0; n++) {
        const [dx, dy] = outlets[(n + this.ticks + t) % outlets.length];
        const ox = x + dx, oy = y + dy;
        if (!this.openCell(ox, oy) || this.device[tile(ox, oy)]) continue;
        this.deposit(ox, oy, this.deviceMaterial[t]);
        remaining--;
      }
    }
  }

  paint(tool: Exclude<Tool, 'Probe'>, x: number, y: number, radius = 3, thermalPower = 100) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (typeof tool === 'number' && !this.hasCustomMaterial(tool) && !builtinById(tool)) return;
    this.edits++;
    const t = tile(x, y);
    if (tool === 'Wall') {
      this.wall[t] = 1;
      this.removeDevice(t);
      this.pressure[t] = this.u[t] = this.v[t] = 0;
      if (t % A) this.u[t - 1] = 0;
      if (t >= A) this.v[t - A] = 0;
      this.airTemperature[t] = ambient;
      for (let j = y & ~3; j < (y & ~3) + 4; j++)
        for (let k = x & ~3; k < (x & ~3) + 4; k++) this.deposit(k, j, M.Empty);
      return;
    }
    if (tool === 'Fan' || tool === 'Pressure' || tool === 'Suction') {
      if (this.wall[t]) return;
      if (tool === 'Fan' && this.device[t] >= 1 && this.device[t] <= 4) {
        this.device[t] = (this.device[t] % 4) + 1;
      } else if (!this.device[t]) {
        this.device[t] = tool === 'Fan' ? 1 : tool === 'Pressure' ? 5 : 6;
        if (tool === 'Fan') this.devicePower[t] = percent(this.strength * 100);
      }
      return;
    }
    if (tool === 'Wind') return;
    if (tool === 'Heat' || tool === 'Cool') {
      this.applyThermal(x, y, radius, (tool === 'Heat' ? 220 : -120) * percent(thermalPower) / 100);
      return;
    }
    if (tool === 'Erase') {
      this.wall[t] = 0;
      this.removeDevice(t);
    }
    for (let j = Math.max(0, y - radius); j <= Math.min(H - 1, y + radius); j++) {
      for (let k = Math.max(0, x - radius); k <= Math.min(W - 1, x + radius); k++) {
        if ((k - x) ** 2 + (j - y) ** 2 > radius ** 2 || this.wall[tile(k, j)]) continue;
        if (tool === 'Erase' || !this.cells[k + j * W])
          this.deposit(
            k,
            j,
            typeof tool === 'number' ? tool : tool === 'Erase' ? M.Empty : M[tool],
          );
      }
    }
  }

  gust(x: number, y: number, dx: number, dy: number) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const t = tile(x, y);
    if (this.wall[t]) return;
    this.edits++;
    if (t % A !== A - 1 && !this.wall[t + 1]) this.u[t] = clamp(this.u[t] + dx * 0.55, -5, 5);
    if (t < T - A && !this.wall[t + A]) this.v[t] = clamp(this.v[t] + dy * 0.55, -5, 5);
  }

  private tunnel() {
    for (const floor of [72, 144, 216]) {
      for (let x = 8; x < 152; x += 4) {
        this.paint('Wall', x, floor);
        if (x < 124) this.paint('Wall', x, floor - 44);
      }
      this.paint('Fan', 16, floor - 9);
    }
    this.paint('Fan', 82, 135);
    for (let x = 34; x < 83; x++) {
      for (let y = 46; y < 66; y++) {
        const ridge = 55 + 4 * Math.sin(x / 7);
        if (Math.abs(y - ridge) < 5 && this.random() < 0.54) this.deposit(x, y, M.Smoke);
      }
    }
    for (const [cx, id] of [
      [55, M.Sand],
      [106, M.Gravel],
    ]) {
      for (let x = cx - 23; x <= cx + 23; x++) {
        const height = Math.max(0, 19 - Math.abs(x - cx) * 0.8 + this.random() * 1.8);
        for (let j = 0; j < height; j++) this.deposit(x, 143 - j, id);
      }
    }
    for (const start of [58, 77]) {
      for (let x = start; x < start + 12; x++)
        for (let y = 204; y < 216; y++) this.deposit(x, y, M.Wood);
    }
    for (let x = 59; x < 70; x++) this.deposit(x, 203, M.Flame);
  }

  // Use the realized change so a saturated brush or a steady source cannot pump pressure.
  private changeAirTemperature(t: number, delta: number) {
    const before = this.airTemperature[t];
    this.airTemperature[t] = clamp(before + delta, -150, 2300);
    this.pressure[t] = clamp(this.pressure[t] + (this.airTemperature[t] - before) * 0.008, -12, 12);
  }

  private air(gravityX: number, gravityY: number) {
    const { cells, openness, airFlags, heatTiles, occupiedStrips, reactionStrips,
      temperature, airTemperature, latentBits } = this;
    if (this.obstructionCatalog !== this.catalog) {
      for (const m of this.catalog) airFlags[m.id] = m.family === 'gas' ? 0 : 1;
      this.obstructionCatalog = this.catalog;
    }
    heatTiles.fill(0);
    occupiedStrips.fill(0);
    reactionStrips.fill(0);
    let materialBits = 0;
    for (let t = 0; t < T; t++) {
      const column = t % A;
      const start = (t - column) * 16 + column * 4;
      let count = 0, thermal = airTemperature[t] !== ambient;
      for (let i = start; i < start + 4 * W; i += W) {
        const a = cells[i], b = cells[i + 1], c = cells[i + 2], d = cells[i + 3];
        const ids = a | b | c | d;
        if (!ids) continue;
        materialBits |= ids;
        const flags = airFlags[a] + airFlags[b] + airFlags[c] + airFlags[d];
        count += flags & (roomReactionFlag - 1);
        occupiedStrips[i >> 2] = 1;
        if (flags >= roomReactionFlag || (latentBits[i] | latentBits[i + 1] | latentBits[i + 2] | latentBits[i + 3]))
          reactionStrips[i >> 2] = 1;
        if (!thermal && (temperature[i] !== ambient || temperature[i + 1] !== ambient ||
            temperature[i + 2] !== ambient || temperature[i + 3] !== ambient)) thermal = true;
      }
      openness[t] = opennessByCount[count];
      if (thermal) {
        // Material conduction visits the right and lower faces in scan order. Include
        // neighboring tiles so their ambient cells can donate heat to a colder tile.
        heatTiles[t] = 1;
        if (column) heatTiles[t - 1] = 1;
        if (column < A - 1) heatTiles[t + 1] = 1;
        if (t >= A) heatTiles[t - A] = 1;
        if (t < T - A) heatTiles[t + A] = 1;
      }
    }
    // All custom and classic IDs fit in one byte. Plain water needs a pack
    // neighbor (CO₂) for its pack reaction, so classic-only worlds skip that scan.
    this.hasPackCells = materialBits > 255;
    for (let t = 0; t < T; t++) {
      const d = this.device[t];
      if (d === 5 || d === 6)
        this.pressure[t] = clamp(this.pressure[t] + (d === 5 ? 0.3 : -0.3), -12, 12);
      if (d < 1 || d > 4) continue;
      const [dx, dy] = dirs[d - 1];
      // Spread the jet along its axis. Each crossed tile attenuates it.
      for (let lane = -2; lane <= 2; lane++) {
        // Adjacent jet lanes must connect to the fan mouth, even beside a wall.
        let connected = true;
        for (let offset = 1; offset <= Math.abs(lane); offset++) {
          const shift = offset * Math.sign(lane);
          const x = (t % A) - dy * shift,
            y = Math.floor(t / A) + dx * shift;
          if (x < 0 || x >= A || y < 0 || y >= B || this.wall[x + y * A]) connected = false;
        }
        if (!connected) continue;
        let power = (this.devicePower[t] / 100) * (1 - Math.abs(lane) * 0.22);
        for (let s = 0; s < 35 && power > 0.008; s++) {
          const x = (t % A) + dx * s - dy * lane,
            y = Math.floor(t / A) + dy * s + dx * lane;
          if (x < 0 || x >= A || y < 0 || y >= B) break;
          const k = x + y * A;
          if (this.wall[k]) break;
          power *= this.openness[k] * 0.964;
          if (dx && x + dx >= 0 && x + dx < A) this.u[k - (dx < 0 ? 1 : 0)] += dx * power * 0.55;
          if (dy && y + dy >= 0 && y + dy < B) this.v[k - (dy < 0 ? A : 0)] += dy * power * 0.55;
        }
      }
    }
    // Buoyancy is relative to nearby connected air. Uniformly warm chambers stay at rest.
    const buoyancy = this.airDelta;
    buoyancy.fill(0);
    for (let t = 0; t < T; t++) {
      if (!heatTiles[t] || this.wall[t]) continue;
      const temp = this.airTemperature[t];
      let contrast = 0;
      if (t % A && !this.wall[t - 1]) contrast += temp - this.airTemperature[t - 1];
      if (t % A < A - 1 && !this.wall[t + 1]) contrast += temp - this.airTemperature[t + 1];
      if (t >= A && !this.wall[t - A]) contrast += temp - this.airTemperature[t - A];
      if (t < T - A && !this.wall[t + A]) contrast += temp - this.airTemperature[t + A];
      buoyancy[t] = clamp(contrast * 0.0003, -0.25, 0.25);
    }
    const face = (t: number, other: number, speed: number, gravity: number) => {
      const lift = gravity * (buoyancy[t] + buoyancy[other]) * 0.5;
      const next = 0.89 * speed + 0.31 * (this.pressure[t] - this.pressure[other]) - lift;
      return clamp(next * Math.min(openness[t], openness[other]), -5, 5);
    };
    for (let t = 0; t < T; t++) {
      this.u[t] = t % A === A - 1 || this.wall[t] || this.wall[t + 1]
        ? 0 : face(t, t + 1, this.u[t], gravityX);
      this.v[t] = t >= T - A || this.wall[t] || this.wall[t + A]
        ? 0 : face(t, t + A, this.v[t], gravityY);
    }
    for (let t = 0; t < T; t++) {
      if (this.wall[t]) continue;
      const incoming = (t % A ? this.u[t - 1] : 0) + (t >= A ? this.v[t - A] : 0);
      this.pressure[t] = clamp(
        this.pressure[t] + 0.25 * (incoming - this.u[t] - this.v[t]),
        -12,
        12,
      );
    }
  }

  private move(i: number, x: number, y: number, down = screenDown) {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const j = x + y * W;
    if (this.wall[cellTile[j]]) return false;
    const displaced = this.cells[j];
    if (displaced !== M.Empty) {
      const m = this.cells[i];
      if (this.moved[j] === this.ticks) return false;
      if (m < firstCustom && displaced < firstCustom) {
        if (
          displaced !== M.Water ||
          (m !== M.WetSand && m !== M.Gravel) ||
          j - i !== down[0] + down[1] * W
        )
          return false;
      } else {
        const target = this.movementMaterials[displaced];
        const moving = this.movementMaterials[m];
        if (!moving || !target || target.family === 'solid') return false;
        const density = moving.density;
        const other = target.density;
        const descent = (x - (i % W)) * down[0] + (y - Math.floor(i / W)) * down[1];
        if (!(descent > 0 && density > other) && !(descent < 0 && density < other)) return false;
      }
    }
    const previousTemp = this.temperature[j],
      previousLatent = this.latent[j];
    this.temperature[j] = this.temperature[i];
    this.latent[j] = this.latent[i];
    this.temperature[i] = previousTemp;
    this.latent[i] = previousLatent;
    this.cells[j] = this.cells[i];
    const amount = this.amount[j], aux = this.aux[j];
    this.amount[j] = this.amount[i];
    this.aux[j] = this.aux[i];
    this.amount[i] = displaced === M.Empty ? 0 : amount;
    this.aux[i] = displaced === M.Empty ? 0 : aux;
    const previousLife = this.life[j];
    this.life[j] = this.life[i];
    this.moved[j] = this.ticks;
    this.cells[i] = displaced;
    this.life[i] = displaced === M.Empty ? 0 : previousLife;
    if (displaced !== M.Empty) this.moved[i] = this.ticks;
    return true;
  }

  private openCell(x: number, y: number) {
    const i = x + y * W;
    return x >= 0 && y >= 0 && x < W && y < H && !this.cells[i] && !this.wall[cellTile[i]];
  }

  private hydrateSand() {
    // Resolve contacts before gravity can carry either partner away.
    const cells = this.cells, water = M.Water, sand = M.Sand;
    for (let i = cells.indexOf(water); i !== -1; i = cells.indexOf(water, i + 1)) {
      if (cells[i - 1] !== sand && cells[i + 1] !== sand &&
          cells[i - W] !== sand && cells[i + W] !== sand) continue;
      const x = i % W,
        y = Math.floor(i / W);
      const first = (this.ticks + x + y) % dirs.length;
      for (let k = 0; k < dirs.length; k++) {
        const [dx, dy] = dirs[(first + k) % dirs.length];
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const grain = nx + ny * W;
        if (this.cells[grain] !== M.Sand) continue;
        this.temperature[grain] = (this.temperature[i] + this.temperature[grain]) * 0.5;
        this.temperature[i] = ambient;
        this.latent[i] = this.latent[grain] = 0;
        this.cells[i] = M.Empty;
        this.cells[grain] = M.WetSand;
        this.amount[grain] = this.amount[i];
        this.amount[i] = 0;
        this.moved[i] = this.moved[grain] = this.ticks;
        break;
      }
    }
  }

  private customReactions() {
    if (!this.contacts.size) return;
    const transform = (i: number, product: number, physical: boolean) => {
      if (product === this.cells[i]) return;
      if (physical) this.packs.change(i, product);
      else {
        // Original contact-only saves use the product's brush temperature.
        this.deposit(i % W, Math.floor(i / W), product);
        this.moved[i] = this.ticks;
      }
    };
    this.reacted.fill(0);
    const reverse = this.random() < 0.5;
    for (let index = 0; index < N; index++) {
      const i = reverse ? N - 1 - index : index;
      const m = this.cells[i];
      if (!this.contactMaterials.has(m) || this.reacted[i] || this.moved[i] === this.ticks)
        continue;
      const x = i % W,
        y = Math.floor(i / W);
      const first = (this.ticks + x + y) % dirs.length;
      for (let k = 0; k < dirs.length; k++) {
        const [dx, dy] = dirs[(first + k) % dirs.length];
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const j = nx + ny * W,
          other = this.cells[j];
        if (!this.contactMaterials.has(other) || this.reacted[j] || this.moved[j] === this.ticks)
          continue;
        const contact = this.contacts.get(contactKey(m, other));
        if (!contact) continue;
        const {
          own, other: result, minTemperature, maxTemperature, minPressure, maxPressure, heatExchange = 0,
        } = contact.rule;
        const owner = m === contact.owner ? i : j;
        const neighbor = owner === i ? j : i;
        const physical = minTemperature !== undefined || maxTemperature !== undefined ||
          minPressure !== undefined || maxPressure !== undefined || heatExchange !== 0;
        if (physical) {
          const temperature = this.temperature[owner];
          const pressure = this.pressure[this.packs.tile(owner)];
          if (
            temperature < (minTemperature ?? -Infinity) || temperature > (maxTemperature ?? Infinity) ||
            pressure < (minPressure ?? -Infinity) || pressure > (maxPressure ?? Infinity)
          ) continue;
        }
        const nextOwner = own ?? this.cells[owner];
        const nextNeighbor = result ?? this.cells[neighbor];
        transform(i, owner === i ? nextOwner : nextNeighbor, physical);
        transform(j, owner === j ? nextOwner : nextNeighbor, physical);
        if (heatExchange && contactKey(nextOwner, nextNeighbor) !== contactKey(m, other)) {
          if (nextOwner) this.packs.heat(owner, heatExchange);
          else if (nextNeighbor) this.packs.heat(neighbor, heatExchange);
          else this.changeAirTemperature(this.packs.tile(owner), heatExchange / 16);
        }
        this.reacted[i] = this.reacted[j] = 1;
        break;
      }
    }
  }

  private flowLiquid(
    i: number,
    x: number,
    y: number,
    down: Direction,
    side: Direction,
    downhill: number,
    crossSlope: number,
  ) {
    if (this.move(i, x + down[0], y + down[1], down)) return;
    const first = this.random() < (1 + crossSlope) / 2 ? 1 : -1;
    for (let attempt = 0; attempt < 2; attempt++) {
      const sign = attempt ? -first : first;
      if (downhill + crossSlope * sign < 0) continue;
      const nx = x + side[0] * sign;
      const ny = y + side[1] * sign;
      if (this.openCell(nx, ny) && this.move(i, nx + down[0], ny + down[1], down)) return;
    }
    if (!this.move(i, x + side[0] * first, y + side[1] * first, down) && first * crossSlope <= 0)
      this.move(i, x - side[0] * first, y - side[1] * first, down);
  }

  probeAt(x: number, y: number): ProbeReading {
    const t = tile(x, y);
    // Cell-centred velocity uses the same two faces per axis as the airflow overlay.
    const u = (this.u[t] + (t % A ? this.u[t - 1] : 0)) / 2;
    const v = (this.v[t] + (t >= A ? this.v[t - A] : 0)) / 2;
    const speed = Math.round(Math.hypot(u, v) * 100) / 100;
    const sector = (Math.round(Math.atan2(v, u) / (Math.PI / 4)) + 8) % 8;
    const i = x + y * W;
    const contents = this.cells[i] === M.Sponge
      ? { label: 'Water held', value: this.amount[i], unit: 'drops' }
      : this.cells[i] === M.CarbonatedWater
        ? { label: 'Dissolved CO₂', value: this.amount[i], unit: 'bubbles' }
        : undefined;
    return {
      ...(contents && { contents }),
      temperature: Math.round(this.temperatureAt(x, y)),
      pressure: Math.round(this.pressure[t] * 100) / 100,
      speed,
      direction: speed ? ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][sector] : '',
    };
  }

  temperatureAt(x: number, y: number) {
    const i = x + y * W;
    return this.cells[i] ? this.temperature[i] : this.airTemperature[tile(x, y)];
  }

  private transferHeat() {
    const air = this.airTemperature,
      temp = this.temperature,
      delta = this.heatDelta,
      cells = this.cells,
      airDelta = this.airDelta,
      heatTiles = this.heatTiles,
      occupiedStrips = this.occupiedStrips,
      reactionStrips = this.reactionStrips;
    delta.fill(0);
    airDelta.fill(0);
    for (let t = 0; t < T; t++) {
      if (!heatTiles[t] || this.wall[t]) continue;
      // Transport excess heat through the same faces used by the pressure solver.
      for (let axis = 0; axis < 2; axis++) {
        const j = axis ? t + A : t + 1;
        if ((!axis && t % A === A - 1) || j >= T || this.wall[j]) continue;
        const speed = axis ? this.v[t] : this.u[t];
        const flux =
          0.035 * (air[t] - air[j]) + 0.033 * speed * ((speed > 0 ? air[t] : air[j]) - ambient);
        airDelta[t] -= flux;
        airDelta[j] += flux;
      }
    }
    const flame = M.Flame, width = W, stripCount = occupiedStrips.length;
    for (let strip = 0; strip < stripCount; strip++) {
      if (!occupiedStrips[strip]) {
        strip = occupiedStrips.indexOf(1, strip + 1);
        if (strip < 0) break;
      }
      const start = strip * 4, end = start + 4, t = cellTile[start];
      if (!heatTiles[t]) continue;
      const rightLimit = end % width === 0 ? end - 1 : end;
      const airTemp = air[t];
      for (let i = start; i < end; i++) {
        const m = cells[i];
        if (!m) continue;
        const current = temp[i];
        if (current !== airTemp) {
          const toAir = (current - airTemp) * (m === flame ? 0.065 : 0.009);
          delta[i] -= toAir;
          airDelta[t] += toAir / 16;
        }
        const conduct = contactConductivity[m];
        const right = i + 1, below = i + width;
        const rightId = i < rightLimit ? cells[right] : 0;
        const rightTemp = rightId ? temp[right] : current;
        if (current !== rightTemp) {
          const flow = (current - rightTemp) * conduct[rightId];
          delta[i] -= flow;
          delta[right] += flow;
        }
        const belowId = below < N ? cells[below] : 0;
        const belowTemp = belowId ? temp[below] : current;
        if (current !== belowTemp) {
          const flow = (current - belowTemp) * conduct[belowId];
          delta[i] -= flow;
          delta[below] += flow;
        }
        // Later cells only read temperatures to their right and below.
        const next = current + delta[i];
        temp[i] = next < -150 ? -150 : next > 2300 ? 2300 : next;
        // Test the stored Float32 value. Rounding can put it exactly on a threshold.
        if (temp[i] <= 0 || temp[i] >= 76) reactionStrips[strip] = 1;
      }
    }
    for (let t = 0; t < T; t++) {
      if (this.wall[t]) continue;
      const delta = airDelta[t] * 0.999 + (ambient - air[t]) * 0.001;
      if (delta) this.changeAirTemperature(t, delta);
    }
  }

  // Store energy at the transition temperature until enough has accumulated.
  private phase(i: number, energy: number, threshold: number, cost: number, product: number) {
    const excess = energy - threshold;
    this.temperature[i] = threshold;
    this.latent[i] = excess;
    if (Math.abs(excess) < cost) return;
    this.temperature[i] += excess - Math.sign(excess) * cost;
    this.latent[i] = 0;
    this.cells[i] = product;
    if (product >= M.Slush) this.hasPackCells = true;
    this.amount[i] = builtinById(product)?.amount ?? 0;
    this.aux[i] = 0;
  }

  private reactions() {
    const { cells, temperature, latent, reactionStrips } = this;
    for (let i = 0; i < N; i++) {
      if (!(i & 3) && !reactionStrips[i >> 2]) {
        const next = reactionStrips.indexOf(1, (i >> 2) + 1);
        if (next < 0) break;
        i = next * 4;
      }
      const m = cells[i];
      if (!m) continue;
      if (m === M.Smoke) {
        this.ageVapor(i, m);
        continue;
      }
      const e = temperature[i] + latent[i];
      temperature[i] = e;
      latent[i] = 0;
      // Higher pressure raises saturation temperature. Pressure is in signed game units.
      const boiling = m === M.Water || m === M.Steam || m === M.WetSand
        ? 100 + 2 * clamp(this.pressure[tile(i % W, Math.floor(i / W))], -12, 12)
        : 100;
      if (m === M.Water && e <= 0) this.phase(i, e, 0, 24, M.Ice);
      else if (m === M.Ice && e >= 0) this.phase(i, e, 0, 24, M.Water);
      else if (m === M.Water && e >= boiling) this.phase(i, e, boiling, 65, M.Steam);
      else if (m === M.Steam && e <= boiling) {
        const t = tile(i % W, Math.floor(i / W));
        const air = this.airTemperature[t];
        this.phase(i, e, boiling, 65, air <= 8 ? M.Fog : M.Water);
        if (this.cells[i] === M.Fog) {
          // Suspended droplets equilibrate with the surrounding tile (16 cells of air).
          const exchange = (this.temperature[i] - air) / 17;
          this.changeAirTemperature(t, exchange);
          this.temperature[i] = this.airTemperature[t];
        }
      } else if (m === M.WetSand && e >= boiling) {
        const x = i % W,
          y = Math.floor(i / W);
        for (const [dx, dy] of dirs) {
          const nx = x + dx,
            ny = y + dy,
            j = nx + ny * W;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H || this.wall[tile(nx, ny)] || this.cells[j])
            continue;
          this.phase(i, e, boiling, 65, M.Sand);
          if (this.cells[i] === M.Sand) {
            this.deposit(nx, ny, M.Steam);
            this.temperature[j] = boiling;
            reactionStrips[j >> 2] = 1;
          }
          break;
        }
      } else if ((m === M.Sand || m === M.Glass) && e >= 1500)
        this.phase(i, e, 1500, 90, M.MoltenGlass);
      else if (m === M.MoltenGlass && e <= 1450) this.phase(i, e, 1450, 90, M.Glass);
      else if ((m === M.Gravel || m === M.Rock) && e >= 1050) this.phase(i, e, 1050, 80, M.Lava);
      else if (m === M.Lava && e <= 1000) this.phase(i, e, 1000, 80, M.Rock);
      else if (m === M.Wood && e >= 155) {
        this.cells[i] = M.Char;
        this.life[i] = 120 + Math.floor(this.random() * 60);
      } else if (m === M.Char || m === M.Ember || m === M.Flame) {
        const x = i % W;
        const neighbors = [x ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W];
        const wet = neighbors.some((j) => this.cells[j] === M.Water);
        if ((wet || e < 125) && (m === M.Ember || m === M.Flame)) {
          this.cells[i] = m === M.Ember ? M.Char : M.Smoke;
          this.temperature[i] = Math.min(e, 95);
        } else if (
          m === M.Char &&
          !wet &&
          e >= 210 &&
          neighbors.some(
            (j) =>
              j >= 0 &&
              j < N &&
              !this.wall[tile(j % W, Math.floor(j / W))] &&
              (this.cells[j] === M.Empty || this.cells[j] === M.Flame || this.cells[j] === M.Smoke),
          )
        ) {
          this.cells[i] = M.Ember;
        } else if (m === M.Ember || m === M.Flame) {
          this.temperature[i] += 0.22 * ((m === M.Flame ? 950 : 780) - e);
        }
      }
      if (m === M.Steam && cells[i] === M.Steam) this.ageVapor(i, m);
    }
  }

  private ageVapor(i: number, material: number) {
    // Zero also identifies vapor from older saves. Stagger lifetimes without
    // consuming random draws used by the movement and reaction rules.
    if (!this.aux[i]) {
      const spread = Math.imul(i + 31 * this.ticks, 0x9e3779b1) >>> 0;
      this.aux[i] = material === M.Smoke ? 240 + spread % 181 : 180 + spread % 121;
    }
    if (--this.aux[i] === 0) this.deposit(i % W, Math.floor(i / W), M.Empty);
  }

  private burn(i: number, x: number, y: number, down: Direction) {
    const upX = x - down[0];
    const upY = y - down[1];
    if (this.cells[i] === M.Ember && this.openCell(upX, upY) && this.random() < 0.22) {
      this.deposit(upX, upY, this.random() < 0.68 ? M.Flame : M.Smoke);
      this.moved[upX + upY * W] = this.ticks;
    }
    if (--this.life[i] === 0) this.cells[i] = this.cells[i] === M.Flame ? M.Smoke : M.Ash;
  }

  step(motion?: MotionInput) {
    this.ticks++;
    this.tickSources();
    const gravityX = motion?.gravityX ?? 0;
    const gravityY = motion?.gravityY ?? 1;
    this.air(gravityX, gravityY);
    this.transferHeat();
    this.reactions();
    this.hydrateSand();
    this.customReactions();
    const horizontal = Math.abs(gravityX);
    const vertical = Math.abs(gravityY);
    // Interleave grid axes in proportion to the measured slope, without snapping intermediate angles.
    const xShare = horizontal / (horizontal + vertical);
    const useX = horizontal > 0 && (!vertical || (this.ticks * 0.61803398875) % 1 < xShare);
    const down: Direction = useX ? [Math.sign(gravityX), 0] : [0, Math.sign(gravityY) || 1];
    const [downX, downY] = down;
    const side: Direction = [downY, -downX];
    const [sideX, sideY] = side;
    const downhill = useX ? horizontal : vertical;
    const crossSlope = gravityX * sideX + gravityY * sideY;
    const shakeX = motion?.shakeX ?? 0;
    const shakeY = motion?.shakeY ?? 0;
    const shake = Math.min(1, Math.hypot(shakeX, shakeY));
    this.packs.down = down;
    this.packs.shake = shake;
    if (this.hasPackCells) runPacks(this.packs);
    const shakeHorizontal = Math.abs(shakeX) / (Math.abs(shakeX) + Math.abs(shakeY));
    const reverse = this.ticks % 2 === 0;
    const depth = useX ? W : H;
    const acrossCount = useX ? H : W;
    const { cells, moved, ticks, movementMaterials } = this;
    const downOffset = downY * W + downX, sideOffset = sideY * W + sideX;
    const grain = M.Sand, gravel = M.Gravel, wet = M.WetSand, water = M.Water;
    for (let row = depth - 1; row >= 0; row--) {
      const depthIndex = downX + downY > 0 ? row : depth - 1 - row;
      for (let column = 0; column < acrossCount; column++) {
        const acrossIndex = reverse ? acrossCount - 1 - column : column;
        const x = useX ? depthIndex : acrossIndex,
          y = useX ? acrossIndex : depthIndex,
          i = x + y * W,
          m = cells[i];
        if (!m || moved[i] === ticks) continue;
        // Inside a packed bed the classic brushes have no possible destination.
        // Keep their tie-break draw so exposed particles follow the same trajectory.
        if (!shake && (m === grain || m === gravel || m === wet || m === water) &&
            x > 0 && x < W - 1 && y > 0 && y < H - 1) {
          const below = cells[i + downOffset];
          if (below && below < firstCustom && (below !== water || m === water || m === grain)) {
            const flank = m === water ? i : i + downOffset;
            const a = cells[flank - sideOffset], b = cells[flank + sideOffset];
            if (a && b && a < firstCustom && b < firstCustom &&
                (m === water || cells[i - downOffset])) {
              if (m === water || !crossSlope) this.random();
              continue;
            }
          }
        }
        const material = movementMaterials[m];
        if (!material) continue;
        const family = material.family;
        if (family === 'solid' && m !== M.Ember) continue;
        if (m === M.Ember || m === M.Flame) this.burn(i, x, y, down);
        if (m === M.Ember) continue;
        if (shake) {
          const response = 1 - material.density * 0.006;
          if (this.random() < shake * response * 0.85) {
            const horizontal = this.random() < shakeHorizontal;
            const nx = horizontal ? x + Math.sign(shakeX) : x;
            const ny = horizontal ? y : y + Math.sign(shakeY);
            if (this.openCell(nx, ny) && this.move(i, nx, ny, down)) continue;
          }
        }
        if (family === 'liquid') {
          this.flowLiquid(i, x, y, down, side, downhill, crossSlope);
          continue;
        }
        const t = cellTile[i];
        const vx = (this.u[t] + (t % A ? this.u[t - 1] : 0)) * 0.5;
        const vy = (this.v[t] + (t >= A ? this.v[t - A] : 0)) * 0.5;
        const windAcross = vx * sideX + vy * sideY;
        if (family === 'gas') {
          const across =
            this.random() < Math.min(1, Math.abs(windAcross) * 1.6) ? Math.sign(windAcross) : 0;
          const rise = vx * downX + vy * downY - (m === M.Smoke ? 0.2 : 0.15);
          const along = this.random() < Math.min(1, Math.abs(rise)) ? Math.sign(rise) : 0;
          if (across || along) {
            const nx = x + sideX * across;
            const ny = y + sideY * across;
            if (!this.move(i, nx + downX * along, ny + downY * along, down) && across && along)
              this.move(i, nx, ny, down);
          }
          continue;
        }
        const upX = x - downX;
        const upY = y - downY;
        const exposed = upX < 0 || upY < 0 || upX >= W || upY >= H || !this.cells[upX + upY * W];
        const threshold = m >= firstCustom
          ? (material.density / 100) ** 2 + 0.1
          : m === M.Gravel
            ? 1.1
            : m === M.WetSand
              ? 0.8
              : 0.2;
        if (
          exposed &&
          Math.abs(windAcross) > threshold &&
          this.random() < Math.min(1, Math.abs(windAcross) - threshold)
        ) {
          const sideSign = Math.sign(windAcross);
          const nx = x + sideX * sideSign;
          const ny = y + sideY * sideSign;
          if (this.move(i, nx, ny, down) || this.move(i, nx - downX, ny - downY, down)) continue;
        }
        if (this.move(i, x + downX, y + downY, down)) continue;
        const first = crossSlope ? Math.sign(crossSlope) : this.random() < 0.5 ? 1 : -1;
        for (let attempt = 0; attempt < 2; attempt++) {
          const sign = attempt ? -first : first;
          if (downhill + crossSlope * sign < 0) continue;
          const nx = x + downX + sideX * sign;
          const ny = y + downY + sideY * sign;
          // Cohesion holds wet sand until there's a deeper drop in the gravity direction.
          if (m === M.WetSand && !this.openCell(nx + downX, ny + downY)) continue;
          if (this.move(i, nx, ny, down)) break;
        }
      }
    }
  }
}
