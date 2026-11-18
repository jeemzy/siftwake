export const W = 160,
  H = 240,
  A = 40,
  B = 60;
const N = W * H,
  T = A * B;
export const M = { Empty: 0, Sand: 1, Gravel: 2, Smoke: 3, Wood: 4, Flame: 5, Ember: 6 } as const;
export type Tool =
  | 'Sand'
  | 'Gravel'
  | 'Smoke'
  | 'Wood'
  | 'Flame'
  | 'Wall'
  | 'Fan'
  | 'Pressure'
  | 'Suction'
  | 'Wind'
  | 'Erase';
export type Scene = 'Tunnel' | 'Blank';
const dirs = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const tile = (x: number, y: number) => (x >> 2) + (y >> 2) * A;

export class World {
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
  private seed = 139729;
  ticks = 0;
  strength = 0.55;

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
    this.life[i] = id === M.Flame ? 28 + Math.floor(this.random() * 20) : 0;
  }

  paint(tool: Tool, x: number, y: number, radius = 3) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const t = tile(x, y);
    if (tool === 'Wall') {
      this.wall[t] = 1;
      this.device[t] = this.pressure[t] = this.u[t] = this.v[t] = 0;
      if (t % A) this.u[t - 1] = 0;
      if (t >= A) this.v[t - A] = 0;
      for (let j = y & ~3; j < (y & ~3) + 4; j++)
        this.cells.fill(0, (x & ~3) + j * W, (x & ~3) + j * W + 4);
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
    if (tool === 'Erase') this.wall[t] = this.device[t] = 0;
    for (let j = Math.max(0, y - radius); j <= Math.min(H - 1, y + radius); j++) {
      for (let k = Math.max(0, x - radius); k <= Math.min(W - 1, x + radius); k++) {
        if ((k - x) ** 2 + (j - y) ** 2 > radius ** 2 || this.wall[tile(k, j)]) continue;
        if (tool === 'Erase' || !this.cells[k + j * W])
          this.deposit(k, j, tool === 'Erase' ? 0 : M[tool]);
      }
    }
  }

  gust(x: number, y: number, dx: number, dy: number) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const t = tile(x, y);
    if (this.wall[t]) return;
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
    for (const start of [42, 77]) {
      for (let x = start; x < start + 12; x++)
        for (let y = 204; y < 216; y++) this.deposit(x, y, M.Wood);
    }
    for (let x = 43; x < 54; x++) this.deposit(x, 203, M.Flame);
  }

  private air() {
    this.openness.fill(1);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const m = this.cells[x + y * W];
        if (m === M.Sand || m === M.Gravel || m === M.Wood || m === M.Ember)
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
    if (this.cells[j]) return false;
    this.cells[j] = this.cells[i];
    this.life[j] = this.life[i];
    this.moved[j] = this.ticks;
    this.cells[i] = 0;
    this.life[i] = 0;
    return true;
  }

  private burn(i: number, x: number, y: number) {
    for (const [dx, dy] of dirs) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const j = nx + ny * W;
      if (this.cells[j] === M.Wood) {
        this.cells[j] = M.Ember;
        this.life[j] = 90 + Math.floor(this.random() * 80);
        this.moved[j] = this.ticks;
      }
    }
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
    if (--this.life[i] === 0) this.cells[i] = this.cells[i] === M.Flame ? M.Smoke : M.Empty;
  }

  step() {
    this.ticks++;
    this.air();
    const reverse = this.ticks % 2 === 0;
    for (let y = H - 1; y >= 0; y--)
      for (let column = 0; column < W; column++) {
        const x = reverse ? W - 1 - column : column,
          i = x + y * W,
          m = this.cells[i];
        if (!m || m === M.Wood || this.moved[i] === this.ticks) continue;
        if (m === M.Ember || m === M.Flame) this.burn(i, x, y);
        if (m === M.Ember) continue;
        const t = tile(x, y);
        const vx = (this.u[t] + (t % A ? this.u[t - 1] : 0)) * 0.5;
        const vy = (this.v[t] + (t >= A ? this.v[t - A] : 0)) * 0.5;
        if (m === M.Smoke || m === M.Flame) {
          const dx = this.random() < Math.min(1, Math.abs(vx) * 1.6) ? Math.sign(vx) : 0;
          const rise = vy - (m === M.Smoke ? 0.2 : 0.15);
          const dy = this.random() < Math.min(1, Math.abs(rise)) ? Math.sign(rise) : 0;
          if (dx || dy) {
            if (!this.move(i, x + dx, y + dy) && dx && dy) this.move(i, x + dx, y);
          }
          continue;
        }
        const exposed = y === 0 || !this.cells[i - W];
        const threshold = m === M.Gravel ? 1.1 : 0.2;
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
        if (!this.move(i, x + dx, y + 1)) this.move(i, x - dx, y + 1);
      }
  }
}
