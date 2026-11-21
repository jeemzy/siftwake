import {
  M,
  contactKey,
  editMaterial,
  firstCustom,
  readMaterialCatalog,
  type ContactRule,
  type Material,
  type MaterialDraft,
  type MaterialResult,
} from './materials.ts';
export { M } from './materials.ts';
import type { MotionInput } from './motion.ts';

export const W = 160,
  H = 240,
  A = 40,
  B = 60;
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
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const tile = (x: number, y: number) => (x >> 2) + (y >> 2) * A;

const ambient = 20;
// Effective game-scale conductivity for the material IDs above.
const conductivity = [
  0, 0.09, 0.14, 0.08, 0.055, 0.15, 0.12, 0.2, 0.14, 0.16, 0.07, 0.12, 0.13, 0.14, 0.15, 0.08, 0.07,
];
const builtinDensity = [0, 60, 82, 5, 30, 3, 45, 35, 72, 32, 7, 75, 72, 85, 95, 38, 20];
const fixed = new Set<number>([M.Wood, M.Char, M.Rock, M.Glass, M.Ice, M.Ember]);

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

  cells = new Uint8Array(N);
  life = new Uint16Array(N);
  wall = new Uint8Array(T);
  // Device values 1–4 are cardinal fans, 5 adds air, and 6 removes air.
  device = new Uint8Array(T);
  pressure = new Float32Array(T);
  u = new Float32Array(T); // Velocity through the right face.
  v = new Float32Array(T); // Velocity through the lower face.
  private openness = new Float32Array(T);
  private moved = new Uint32Array(N);
  private reacted = new Uint8Array(N);
  private seed = 139729;
  ticks = 0;
  strength = 0.55;
  edits = 0;
  private catalog: readonly Material[] = [];
  private contacts = new Map<number, { owner: number; rule: ContactRule }>();
  private contactMaterials = new Set<number>();
  private customColors: readonly (readonly number[])[] = [];

  get customMaterials() {
    return this.catalog;
  }

  get materialColors() {
    return this.customColors;
  }

  private custom(id: number): Material | undefined {
    return id >= firstCustom ? this.catalog[id - firstCustom] : undefined;
  }

  hasCustomMaterial(id: number) {
    return Number.isInteger(id) && this.custom(id) !== undefined;
  }

  private setCatalog(catalog: readonly Material[]) {
    this.catalog = catalog;
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

  private persistedFields() {
    return [
      this.cells,
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
  }

  // V2 appends the catalog to the unchanged 0.3.0 header and typed arrays.
  snapshot(): Uint8Array {
    const fields = this.persistedFields();
    const catalog = this.catalog.length ? catalogBytes(this.catalog) : null;
    const bytes = new Uint8Array(
      32 + fields.reduce((size, field) => size + field.byteLength, 0) + (catalog?.length ?? 0),
    );
    const header = new DataView(bytes.buffer);
    header.setUint32(0, 0x53494654);
    header.setUint32(4, catalog ? 2 : 1);
    header.setUint16(8, W);
    header.setUint16(10, H);
    header.setFloat64(12, this.ticks);
    header.setUint32(20, this.seed);
    header.setFloat64(24, this.strength);
    let offset = 32;
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
    const fields = world.persistedFields();
    const version = header.getUint32(4);
    const baseLength = 32 + fields.reduce((n, f) => n + f.byteLength, 0);
    if (
      !(
        (version === 1 && bytes.length === baseLength) ||
        (version === 2 && bytes.length > baseLength)
      ) ||
      header.getUint32(0) !== 0x53494654 ||
      header.getUint16(8) !== W ||
      header.getUint16(10) !== H
    )
      throw Error('Unsupported world checkpoint');
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
    if (version === 2)
      world.setCatalog(readMaterialCatalog(catalogText(bytes.subarray(baseLength))));
    let offset = 32;
    for (const field of fields) {
      new Uint8Array(field.buffer).set(bytes.subarray(offset, offset + field.byteLength));
      offset += field.byteLength;
    }
    if (
      world.cells.some((id) => id >= firstCustom + world.catalog.length) ||
      world.device.some((id) => id > 6) ||
      world.wall.some((id) => id > 1) ||
      fields.some((f) => f instanceof Float32Array && !f.every(Number.isFinite))
    )
      throw Error('Unreadable world data');
    return world;
  }

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  constructor(scene: Scene = 'Blank') {
    if (scene === 'Tunnel') this.tunnel();
  }

  private deposit(x: number, y: number, id: number) {
    const i = x + y * W;
    this.cells[i] = id;
    this.temperature[i] = id === M.Flame ? 850 : id === M.Smoke ? 48 : ambient;
    this.latent[i] = 0;
    this.life[i] = id === M.Flame ? 28 + Math.floor(this.random() * 20) : 0;
  }

  paint(tool: Exclude<Tool, 'Probe'>, x: number, y: number, radius = 3) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (typeof tool === 'number' && !this.hasCustomMaterial(tool)) return;
    this.edits++;
    const t = tile(x, y);
    if (tool === 'Wall') {
      this.wall[t] = 1;
      this.device[t] = this.pressure[t] = this.u[t] = this.v[t] = 0;
      if (t % A) this.u[t - 1] = 0;
      if (t >= A) this.v[t - A] = 0;
      this.airTemperature[t] = ambient;
      for (let j = y & ~3; j < (y & ~3) + 4; j++)
        for (let k = x & ~3; k < (x & ~3) + 4; k++) this.deposit(k, j, M.Empty);
      return;
    }
    if (tool === 'Fan' || tool === 'Pressure' || tool === 'Suction') {
      if (!this.wall[t])
        this.device[t] =
          tool === 'Fan'
            ? this.device[t] <= 4
              ? (this.device[t] % 4) + 1
              : 1
            : tool === 'Pressure'
              ? 5
              : 6;
      return;
    }
    if (tool === 'Wind') return;
    const touchedAir = tool === 'Heat' || tool === 'Cool' ? new Set<number>() : null;
    if (tool === 'Erase') this.wall[t] = this.device[t] = 0;
    for (let j = Math.max(0, y - radius); j <= Math.min(H - 1, y + radius); j++) {
      for (let k = Math.max(0, x - radius); k <= Math.min(W - 1, x + radius); k++) {
        if ((k - x) ** 2 + (j - y) ** 2 > radius ** 2 || this.wall[tile(k, j)]) continue;
        if (tool === 'Heat' || tool === 'Cool') {
          const i = k + j * W,
            t = tile(k, j);
          const change = tool === 'Heat' ? 220 : -120;
          if (this.cells[i]) this.temperature[i] = clamp(this.temperature[i] + change, -150, 2300);
          else if (!touchedAir!.has(t)) {
            this.airTemperature[t] = clamp(this.airTemperature[t] + change, -150, 2300);
            touchedAir!.add(t);
          }
          continue;
        }
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

  private air() {
    this.openness.fill(1);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const m = this.cells[x + y * W];
        if (
          m &&
          m !== M.Flame &&
          m !== M.Smoke &&
          m !== M.Steam &&
          this.custom(m)?.family !== 'gas'
        )
          this.openness[tile(x, y)] -= 0.061;
      }
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
        let power = this.strength * (1 - Math.abs(lane) * 0.22);
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
    for (let t = 0; t < T; t++) {
      const p = this.pressure[t];
      const face = (other: number, speed: number) =>
        clamp(
          (0.89 * speed + 0.31 * (p - this.pressure[other])) *
            Math.min(this.openness[t], this.openness[other]),
          -5,
          5,
        );
      this.u[t] = t % A === A - 1 || this.wall[t] || this.wall[t + 1] ? 0 : face(t + 1, this.u[t]);
      this.v[t] = t >= T - A || this.wall[t] || this.wall[t + A] ? 0 : face(t + A, this.v[t]);
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

  private move(i: number, x: number, y: number) {
    if (x < 0 || y < 0 || x >= W || y >= H || this.wall[tile(x, y)]) return false;
    const j = x + y * W;
    const displaced = this.cells[j];
    if (displaced !== M.Empty) {
      const m = this.cells[i];
      if (this.moved[j] === this.ticks) return false;
      if (m < firstCustom && displaced < firstCustom) {
        if (displaced !== M.Water || (m !== M.WetSand && m !== M.Gravel) || j !== i + W)
          return false;
      } else {
        const target = this.custom(displaced);
        if (fixed.has(displaced) || target?.family === 'solid') return false;
        const density = this.custom(m)?.density ?? builtinDensity[m];
        const other = target?.density ?? builtinDensity[displaced];
        if (!(j - i >= W - 1 && density > other) && !(i - j >= W - 1 && density < other))
          return false;
      }
    }
    const previousTemp = this.temperature[j],
      previousLatent = this.latent[j];
    this.temperature[j] = this.temperature[i];
    this.latent[j] = this.latent[i];
    this.temperature[i] = previousTemp;
    this.latent[i] = previousLatent;
    this.cells[j] = this.cells[i];
    const previousLife = this.life[j];
    this.life[j] = this.life[i];
    this.moved[j] = this.ticks;
    this.cells[i] = displaced;
    this.life[i] = displaced === M.Empty ? 0 : previousLife;
    if (displaced !== M.Empty) this.moved[i] = this.ticks;
    return true;
  }

  private nudge(i: number, x: number, y: number) {
    return x >= 0 && y >= 0 && x < W && y < H && !this.cells[x + y * W] && this.move(i, x, y);
  }

  private hydrateSand() {
    // Resolve contacts before gravity can carry either partner away.
    for (let i = this.cells.indexOf(M.Water); i !== -1; i = this.cells.indexOf(M.Water, i + 1)) {
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
        this.moved[i] = this.moved[grain] = this.ticks;
        break;
      }
    }
  }

  private customReactions() {
    if (!this.contacts.size) return;
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
        const { own, other: result } = contact.rule;
        const [here, there] = m === contact.owner ? [own, result] : [result, own];
        if (here !== null && here !== m) {
          this.deposit(x, y, here);
          this.moved[i] = this.ticks;
        }
        if (there !== null && there !== other) {
          this.deposit(nx, ny, there);
          this.moved[j] = this.ticks;
        }
        this.reacted[i] = this.reacted[j] = 1;
        break;
      }
    }
  }

  private flowLiquid(i: number, x: number, y: number) {
    if (this.move(i, x, y + 1)) return;
    const first = this.random() < 0.5 ? 1 : -1;
    for (const dx of [first, -first]) {
      const nx = x + dx;
      if (nx < 0 || nx >= W || this.wall[tile(nx, y)] || this.cells[nx + y * W] !== M.Empty)
        continue;
      if (this.move(i, nx, y + 1)) return;
    }
    if (!this.move(i, x + first, y)) this.move(i, x - first, y);
  }

  probeAt(x: number, y: number): ProbeReading {
    const t = tile(x, y);
    // Cell-centred velocity uses the same two faces per axis as the airflow overlay.
    const u = (this.u[t] + (t % A ? this.u[t - 1] : 0)) / 2;
    const v = (this.v[t] + (t >= A ? this.v[t - A] : 0)) / 2;
    const speed = Math.round(Math.hypot(u, v) * 100) / 100;
    const sector = (Math.round(Math.atan2(v, u) / (Math.PI / 4)) + 8) % 8;
    return {
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
      delta = this.heatDelta;
    delta.fill(0);
    this.airDelta.fill(0);
    for (let t = 0; t < T; t++) {
      if (this.wall[t]) continue;
      // Transport excess heat through the same faces used by the pressure solver.
      for (let axis = 0; axis < 2; axis++) {
        const j = axis ? t + A : t + 1;
        if ((!axis && t % A === A - 1) || j >= T || this.wall[j]) continue;
        const speed = axis ? this.v[t] : this.u[t];
        const flux =
          0.035 * (air[t] - air[j]) + 0.033 * speed * ((speed > 0 ? air[t] : air[j]) - ambient);
        this.airDelta[t] -= flux;
        this.airDelta[j] += flux;
      }
    }
    for (let i = 0; i < N; i++) {
      const m = this.cells[i];
      if (!m) continue;
      const x = i % W,
        t = tile(x, Math.floor(i / W));
      const toAir = (temp[i] - air[t]) * (m === M.Flame ? 0.065 : 0.009);
      delta[i] -= toAir;
      this.airDelta[t] += toAir / 16;
      for (let axis = 0; axis < 2; axis++) {
        const j = axis ? i + W : i + 1;
        if ((!axis && x === W - 1) || j >= N || !this.cells[j]) continue;
        const flow =
          (temp[i] - temp[j]) *
          Math.min(conductivity[m] ?? 0.09, conductivity[this.cells[j]] ?? 0.09);
        delta[i] -= flow;
        delta[j] += flow;
      }
    }
    for (let t = 0; t < T; t++)
      air[t] = clamp(ambient + (air[t] + this.airDelta[t] - ambient) * 0.999, -150, 2300);
    for (let i = 0; i < N; i++) if (this.cells[i]) temp[i] = clamp(temp[i] + delta[i], -150, 2300);
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
  }

  private reactions() {
    for (let i = 0; i < N; i++) {
      const m = this.cells[i];
      if (!m) continue;
      const e = this.temperature[i] + this.latent[i];
      this.temperature[i] = e;
      this.latent[i] = 0;
      if (m === M.Water && e <= 0) this.phase(i, e, 0, 24, M.Ice);
      else if (m === M.Ice && e >= 0) this.phase(i, e, 0, 24, M.Water);
      else if (m === M.Water && e >= 100) this.phase(i, e, 100, 65, M.Steam);
      else if (m === M.Steam && e <= 100) this.phase(i, e, 100, 65, M.Water);
      else if (m === M.WetSand && e >= 100) {
        const x = i % W,
          y = Math.floor(i / W);
        for (const [dx, dy] of dirs) {
          const nx = x + dx,
            ny = y + dy,
            j = nx + ny * W;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H || this.wall[tile(nx, ny)] || this.cells[j])
            continue;
          this.phase(i, e, 100, 65, M.Sand);
          if (this.cells[i] === M.Sand) {
            this.deposit(nx, ny, M.Steam);
            this.temperature[j] = 100;
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
    }
  }

  private burn(i: number, x: number, y: number) {
    if (
      this.cells[i] === M.Ember &&
      y > 0 &&
      !this.cells[i - W] &&
      !this.wall[tile(x, y - 1)] &&
      this.random() < 0.22
    ) {
      this.deposit(x, y - 1, this.random() < 0.68 ? M.Flame : M.Smoke);
      this.moved[i - W] = this.ticks;
    }
    if (--this.life[i] === 0) this.cells[i] = this.cells[i] === M.Flame ? M.Smoke : M.Ash;
  }

  step(motion?: MotionInput) {
    this.ticks++;
    this.air();
    this.transferHeat();
    this.reactions();
    this.hydrateSand();
    this.customReactions();
    const tilt = motion?.tiltX ?? 0;
    const shakeX = motion?.shakeX ?? 0;
    const shakeY = motion?.shakeY ?? 0;
    const shake = Math.min(1, Math.hypot(shakeX, shakeY));
    const shakeHorizontal = Math.abs(shakeX) / (Math.abs(shakeX) + Math.abs(shakeY));
    const reverse = this.ticks % 2 === 0;
    for (let y = H - 1; y >= 0; y--)
      for (let column = 0; column < W; column++) {
        const x = reverse ? W - 1 - column : column,
          i = x + y * W,
          m = this.cells[i];
        if (!m) continue;
        const custom = this.custom(m);
        const family = custom?.family;
        if (
          m === M.Wood ||
          m === M.Char ||
          m === M.Rock ||
          m === M.Glass ||
          m === M.Ice ||
          family === 'solid' ||
          this.moved[i] === this.ticks
        )
          continue;
        if (m === M.Ember || m === M.Flame) this.burn(i, x, y);
        if (m === M.Ember) continue;
        const liquid = m === M.Water || m === M.MoltenGlass || m === M.Lava || family === 'liquid';
        const gas = m === M.Smoke || m === M.Flame || m === M.Steam || family === 'gas';
        if (tilt || shake) {
          const response = 1 - (custom?.density ?? builtinDensity[m]) * 0.006;
          if (shake && this.random() < shake * response * 0.85) {
            const horizontal = this.random() < shakeHorizontal;
            const nx = horizontal ? x + Math.sign(shakeX) : x;
            const ny = horizontal ? y : y + Math.sign(shakeY);
            if (this.nudge(i, nx, ny)) continue;
          }
          if (
            tilt &&
            !gas &&
            (liquid || y === 0 || !this.cells[i - W]) &&
            this.random() < Math.min(1, Math.abs(tilt)) * response * (liquid ? 0.72 : 0.55) &&
            this.nudge(i, x + Math.sign(tilt), y)
          )
            continue;
        }
        if (liquid) {
          this.flowLiquid(i, x, y);
          continue;
        }
        const t = tile(x, y);
        const vx = (this.u[t] + (t % A ? this.u[t - 1] : 0)) * 0.5;
        const vy = (this.v[t] + (t >= A ? this.v[t - A] : 0)) * 0.5;
        if (gas) {
          const dx = this.random() < Math.min(1, Math.abs(vx) * 1.6) ? Math.sign(vx) : 0;
          const rise = vy - (m === M.Smoke ? 0.2 : 0.15);
          const dy = this.random() < Math.min(1, Math.abs(rise)) ? Math.sign(rise) : 0;
          if (dx || dy) {
            if (!this.move(i, x + dx, y + dy) && dx && dy) this.move(i, x + dx, y);
          }
          continue;
        }
        const exposed = y === 0 || !this.cells[i - W];
        const threshold = custom
          ? (custom.density / 100) ** 2 + 0.1
          : m === M.Gravel
            ? 1.1
            : m === M.WetSand
              ? 0.8
              : 0.2;
        if (
          exposed &&
          Math.abs(vx) > threshold &&
          this.random() < Math.min(1, Math.abs(vx) - threshold)
        ) {
          const dx = Math.sign(vx);
          if (this.move(i, x + dx, y) || this.move(i, x + dx, y - 1)) continue;
        }
        if (this.move(i, x, y + 1)) continue;
        const dx = this.random() < 0.5 ? 1 : -1;
        if (m === M.WetSand) {
          // Cohesion holds a damp grain on a shallow step. A deeper drop breaks it loose.
          for (const side of [x + dx, x - dx]) {
            if (side < 0 || side >= W || y + 2 >= H) continue;
            if (
              !this.wall[tile(side, y + 2)] &&
              this.cells[side + (y + 2) * W] === M.Empty &&
              this.move(i, side, y + 1)
            )
              break;
          }
        } else if (!this.move(i, x + dx, y + 1)) this.move(i, x - dx, y + 1);
      }
  }
}
