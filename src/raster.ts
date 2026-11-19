import { W, H, A, tile, type World } from './world.ts';
import type { Layers } from './views';
const palette = [
  [19, 29, 31],
  [231, 181, 101],
  [134, 146, 148],
  [179, 206, 202],
  [159, 99, 60],
  [255, 172, 73],
  [238, 94, 45],
  [70, 157, 211],
  [161, 120, 73],
  [162, 215, 240],
  [216, 233, 241],
  [255, 190, 93],
  [133, 202, 195],
  [252, 103, 36],
  [103, 98, 95],
  [72, 55, 48],
  [151, 144, 137],
];
const fanArrows = [
  [4, 5, 6, 7, 2, 10],
  [1, 5, 9, 13, 8, 10],
  [4, 5, 6, 7, 1, 9],
  [2, 6, 10, 14, 5, 7],
];
// Fixed, piecewise Celsius scale; cold water and warm wood remain distinguishable.
const stops = [
  [-150, 38, 66, 172],
  [0, 50, 164, 217],
  [20, 55, 44, 89],
  [100, 164, 52, 123],
  [400, 227, 74, 46],
  [1000, 255, 155, 54],
  [2300, 255, 248, 200],
];
const heatColors = new Uint8Array(2451 * 3);
for (let t = -150, hi = 1; t <= 2300; t++) {
  if (t > stops[hi][0]) hi++;
  const lo = stops[hi - 1],
    upper = stops[hi],
    f = (t - lo[0]) / (upper[0] - lo[0]);
  for (let c = 0; c < 3; c++)
    heatColors[(t + 150) * 3 + c] = Math.round(lo[c + 1] + f * (upper[c + 1] - lo[c + 1]));
}

function streamlines(w: World, pixels: Uint8Array) {
  function dot(x: number, y: number, brightness: number) {
    const ix = Math.floor(x),
      iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return false;
    const t = tile(ix, iy);
    if (w.wall[t]) return false;
    if (!w.device[t]) {
      const i = 4 * (ix + iy * W);
      pixels[i] = brightness - 32;
      pixels[i + 1] = brightness;
      pixels[i + 2] = brightness + 8;
    }
    return true;
  }
  for (let sy = 4; sy < H; sy += 8)
    for (let sx = 4; sx < W; sx += 8) {
      let x = sx + 0.5,
        y = sy + 0.5,
        dx = 0,
        dy = 0,
        length = 0;
      for (let n = 0; n < 7; n++) {
        const t = tile(Math.floor(x), Math.floor(y));
        const u = (w.u[t] + (t % A ? w.u[t - 1] : 0)) * 0.5;
        const v = (w.v[t] + (t >= A ? w.v[t - A] : 0)) * 0.5;
        const speed = Math.hypot(u, v);
        if (w.wall[t] || speed < 0.045 || n >= 3 + speed * 4) break;
        dx = u / speed;
        dy = v / speed;
        const nx = x + dx,
          ny = y + dy;
        if (
          w.wall[tile(Math.floor(nx), Math.floor(y))] ||
          w.wall[tile(Math.floor(x), Math.floor(ny))]
        )
          break;
        if (
          !dot(
            nx,
            ny,
            (((n + 8 - Math.floor(w.ticks * Math.min(0.6, speed * 0.5))) % 5) + 5) % 5 === 0
              ? 237
              : 153,
          )
        )
          break;
        x = nx;
        y = ny;
        length++;
      }
      if (length >= 3) {
        dot(x, y, 244);
        dot(x - 1.6 * dx + dy, y - 1.6 * dy - dx, 215);
        dot(x - 1.6 * dx - dy, y - 1.6 * dy + dx, 215);
      }
    }
}
export function rasterize(w: World, camera: Layers, pixels: Uint8Array) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x,
        t = tile(x, y),
        m = w.cells[i],
        d = w.device[t];
      let [r, g, b] = palette[m];
      const grain = ((Math.imul(i + 1231, 16807) >>> 4) % 17) - 8;
      if (m) {
        r += grain;
        g += grain;
        b += grain;
      } else if (x % 8 === 0 && y % 8 === 0) {
        r += 15;
        g += 17;
        b += 16;
      }
      if (w.wall[t]) {
        const lip = y % 4 === 0 || x % 4 === 0;
        r = lip ? 101 : 63;
        g = lip ? 123 : 81;
        b = lip ? 121 : 82;
      } else if (d) {
        const lx = x % 4,
          ly = y % 4;
        const mark =
          d <= 4 ? fanArrows[d - 1].includes(lx + ly * 4) : ly === 1 || (d === 5 && lx === 1);
        r = mark ? 24 : 106;
        g = mark ? 41 : 216;
        b = mark ? 39 : 187;
      } else if (camera.Heat) {
        const h = (150 + Math.max(-150, Math.min(2300, Math.round(w.temperatureAt(x, y))))) * 3;
        r = heatColors[h];
        g = heatColors[h + 1];
        b = heatColors[h + 2];
        if (m) {
          r = Math.min(255, r + 9);
          g = Math.min(255, g + 9);
          b = Math.min(255, b + 9);
        }
      }
      // In thermography, leave most pixels on the fixed temperature scale.
      // The signed pressure stipple occupies one diagonal out of four.
      if (camera.Pressure && !w.wall[t] && !d && (!camera.Heat || (x + y) % 4 === 0)) {
        const p = w.pressure[t],
          k = Math.min(0.85, Math.sqrt(Math.abs(p)) * 0.85);
        r += ((p > 0 ? 244 : 65) - r) * k;
        g += ((p > 0 ? 145 : 155) - g) * k;
        b += ((p > 0 ? 70 : 238) - b) * k;
      }
      pixels[4 * i] = Math.min(255, r);
      pixels[4 * i + 1] = g;
      pixels[4 * i + 2] = b;
      pixels[4 * i + 3] = 255;
    }
  if (camera.Air) streamlines(w, pixels);
}
