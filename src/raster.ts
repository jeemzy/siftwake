import type { World } from './world.ts';
import { W, H, A, B, tile } from './grid.ts';
import { M, builtinMaterials, firstCustom } from './materials.ts';
import type { Layers } from './views';
import { clearWallPath, SOURCE } from './devices.ts';
const count = W * H;
const shadeCount = 17;
const lastId = Math.max(...builtinMaterials.map(material => material.id));

// Uint8Array assignments in the original renderer capped red and wrapped the other
// channels. Preserve those exact bytes for black, white, and saturated custom paints.
function rgba(r: number, g: number, b: number) {
  return (Math.min(255, r) & 255) | ((g & 255) << 8) | ((b & 255) << 16) | 0xff000000;
}
const background = new Uint32Array(count);
const grain = new Uint8Array(count);
const airTile = new Uint16Array(count);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = x + W * y;
    background[i] = x % 8 === 0 && y % 8 === 0 ? rgba(34, 46, 47) : rgba(19, 29, 31);
    grain[i] = (Math.imul(i + 1231, 16807) >>> 4) % shadeCount;
    airTile[i] = tile(x, y);
  }
}
const builtinShades = new Uint32Array((lastId + 1) * shadeCount);
function setShades(target: Uint32Array, id: number, r: number, g: number, b: number) {
  for (let k = 0; k < shadeCount; k++) {
    const noise = k - 8;
    target[id * shadeCount + k] = rgba(r + noise, g + noise, b + noise);
  }
}
for (const { id, color } of builtinMaterials) {
  const rgb = Number.parseInt(color.slice(1), 16);
  setShades(builtinShades, id, rgb >> 16, (rgb >> 8) & 255, rgb & 255);
}
const spongeRgb = builtinShades[M.Sponge * shadeCount + 8];
const spongeShades = new Uint32Array(256 * shadeCount);
for (let water = 0; water <= 255; water++)
  setShades(spongeShades, water, (spongeRgb & 255) - water * 8,
    ((spongeRgb >> 8) & 255) - water * 5, (spongeRgb >> 16) & 255);

const customShades = new WeakMap<World['materialColors'], Uint32Array>();
function shadesFor(colors: World['materialColors']) {
  if (!colors.length) return builtinShades;
  let shades = customShades.get(colors);
  if (!shades) {
    shades = builtinShades.slice();
    for (let j = 0; j < colors.length; j++) {
      const [r, g, b] = colors[j];
      setShades(shades, firstCustom + j, r, g, b);
    }
    customShades.set(colors, shades);
  }
  return shades;
}
const rotorFrames = Array.from({length: 8}, (_, phase) => {
  const angle = phase * Math.PI / 16;
  const pixels: [number, number, number][] = [];
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 6; x++) {
    const r = Math.hypot(x, y);
    let color = 0;
    if (r <= 4.6) {
      const a = Math.atan2(y, x) - angle - r * 0.16;
      color = r > 3.8 ? 2 : r < 1 ? 3 : Math.cos(4 * a) > 0.1 ? 4 : 1;
    }
    if (x >= 4 && Math.abs(y) <= 6 - x) color = 3;
    if (color) pixels.push([x, y, color]);
  }
  return pixels;
});
const rotorColors = [0, rgba(30, 58, 59), rgba(85, 152, 141), rgba(209, 252, 221), rgba(118, 220, 190)];
const fanAxes = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function drawFans(w: World, words: Uint32Array) {
  for (let t = 0; t < w.device.length; t++) {
    const direction = w.device[t];
    if (direction < 1 || direction > 4) continue;
    const cx = (t % A) * 4 + 2, cy = Math.floor(t / A) * 4 + 2;
    const phase = Math.floor(w.ticks * w.devicePower[t] / 100) % rotorFrames.length;
    const [ax, ay] = fanAxes[direction - 1];
    for (const [dx, dy, color] of rotorFrames[phase]) {
      const x = cx + dx * ax - dy * ay;
      const y = cy + dx * ay + dy * ax;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const at = tile(x, y);
      if (t !== at && (w.device[at] || !clearWallPath(w.wall, A, cx + 0.5, cy + 0.5, x + 0.5, y + 0.5))) continue;
      words[x + y * W] = rotorColors[color];
    }
  }
}
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
const heatAir = new Uint32Array(2451);
const heatMatter = new Uint32Array(2451);
for (let t = -150, hi = 1; t <= 2300; t++) {
  if (t > stops[hi][0]) hi++;
  const lo = stops[hi - 1],
    upper = stops[hi],
    f = (t - lo[0]) / (upper[0] - lo[0]);
  const r = Math.round(lo[1] + f * (upper[1] - lo[1]));
  const g = Math.round(lo[2] + f * (upper[2] - lo[2]));
  const b = Math.round(lo[3] + f * (upper[3] - lo[3]));
  heatAir[t + 150] = rgba(r, g, b);
  heatMatter[t + 150] = rgba(Math.min(255, r + 9), Math.min(255, g + 9), Math.min(255, b + 9));
}

const flowSpeed = new Float64Array(A * B);
const flowX = new Float64Array(A * B);
const flowY = new Float64Array(A * B);
const flowPhase = new Float64Array(A * B);
const trailDim = rgba(121, 153, 161), trailLit = rgba(205, 237, 245);
const arrowTip = rgba(212, 244, 252), arrowWing = rgba(183, 215, 223);

function streamlines(w: World, words: Uint32Array) {
  const { wall, device, u, v, ticks } = w;
  flowSpeed.fill(-1);
  function dot(x: number, y: number, color: number) {
    const ix = Math.floor(x),
      iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
    const i = ix + iy * W, t = airTile[i];
    if (!wall[t] && !device[t]) words[i] = color;
  }
  for (let sy = 4; sy < H; sy += 8)
    for (let sx = 4; sx < W; sx += 8) {
      let x = sx + 0.5,
        y = sy + 0.5,
        dx = 0,
        dy = 0,
        length = 0;
      for (let n = 0; n < 7; n++) {
        const tx = x >> 2, tileRow = (y >> 2) * A, t = tx + tileRow;
        if (wall[t]) break;
        let speed = flowSpeed[t];
        if (speed < 0) {
          const vx = (u[t] + (tx ? u[t - 1] : 0)) * 0.5;
          const vy = (v[t] + (t >= A ? v[t - A] : 0)) * 0.5;
          flowSpeed[t] = speed = Math.hypot(vx, vy);
          if (speed >= 0.045) {
            flowX[t] = vx / speed;
            flowY[t] = vy / speed;
            flowPhase[t] = 8 - Math.floor(ticks * Math.min(0.6, speed * 0.5));
          }
        }
        if (speed < 0.045 || n >= 3 + speed * 4) break;
        dx = flowX[t];
        dy = flowY[t];
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) break;
        const nextTx = nx >> 2, nextRow = (ny >> 2) * A, nextTile = nextRow + nextTx;
        if (wall[tileRow + nextTx] || wall[nextRow + tx] || wall[nextTile]) break;
        if (!device[nextTile])
          words[(nx | 0) + (ny | 0) * W] = (n + flowPhase[t]) % 5 === 0 ? trailLit : trailDim;
        x = nx;
        y = ny;
        length++;
      }
      if (length >= 3) {
        dot(x, y, arrowTip);
        dot(x - 1.6 * dx + dy, y - 1.6 * dy - dx, arrowWing);
        dot(x - 1.6 * dx - dy, y - 1.6 * dy + dx, arrowWing);
      }
    }
}
const wallLip = rgba(101, 123, 121);
const wallFace = rgba(63, 81, 82);
const pumpInk = rgba(24, 41, 39);
const pumpFace = rgba(106, 216, 187);
const sourceCore = rgba(27, 42, 44);
const hotRim = rgba(255, 145, 85);
const coldRim = rgba(123, 202, 248);

function deviceTile(words: Uint32Array, start: number, outer: number, inner: number, rim: boolean) {
  for (let row = 0; row < 4; row++, start += W) {
    const middle = row === 0 || (rim && row === 3) ? outer : inner;
    words[start] = outer;
    words[start + 1] = words[start + 2] = middle;
    words[start + 3] = rim ? outer : middle;
  }
}

const tileStart = new Uint16Array(A * B);
for (let t = 0; t < tileStart.length; t++) tileStart[t] = (t % A) * 4 + Math.floor(t / A) * 4 * W;

function drawTileLayers(w: World, words: Uint32Array, shades: Uint32Array, heat: boolean, pressure: boolean) {
  const { wall, device, deviceMaterial, cells, amount } = w;
  for (let t = 0; t < wall.length; t++) {
    const d = device[t];
    if (wall[t]) {
      deviceTile(words, tileStart[t], wallLip, wallFace, false);
    } else if (d >= SOURCE.material) {
      const rim = d === SOURCE.material ? shades[deviceMaterial[t] * shadeCount + 8]
        : d === SOURCE.heat ? hotRim : coldRim;
      deviceTile(words, tileStart[t], rim, sourceCore, true);
    } else if (d >= 5) {
      for (let row = 0, i = tileStart[t]; row < 4; row++, i += W) {
        const face = row === 1 ? pumpInk : pumpFace;
        words[i] = words[i + 2] = words[i + 3] = face;
        words[i + 1] = d === 5 ? pumpInk : face;
      }
    } else if (!d && pressure && w.pressure[t] !== 0) {
      const p = w.pressure[t];
      const k = Math.min(0.85, Math.sqrt(Math.abs(p)) * 0.85);
      const targetR = p > 0 ? 244 : 65, targetG = p > 0 ? 145 : 155, targetB = p > 0 ? 70 : 238;
      for (let row = 0, start = tileStart[t]; row < 4; row++, start += W) {
        // Thermography shows pressure on one diagonal per tile.
        const end = start + 4;
        for (let i = heat ? start + ((4 - row) & 3) : start; i < end; i += heat ? 4 : 1) {
          const m = cells[i];
          let rgb = words[i], noise = 0;
          if (!heat && m && m !== M.Smoke && m !== M.Steam) {
            // Pressure blends the original signed, pre-clipping color. A saturated
            // custom paint or waterlogged sponge cannot be reconstructed from its bytes.
            rgb = shades[m * shadeCount + 8];
            noise = grain[i] - 8;
          }
          let r = (rgb & 255) + noise, g = ((rgb >> 8) & 255) + noise;
          const b = ((rgb >> 16) & 255) + noise;
          if (!heat && m === M.Sponge) {
            r -= amount[i] * 8;
            g -= amount[i] * 5;
          }
          const red = r + (targetR - r) * k;
          words[i] = ((red > 255 ? 255 : red) & 255) | (((g + (targetG - g) * k) & 255) << 8)
            | (((b + (targetB - b) * k) & 255) << 16) | 0xff000000;
        }
      }
    }
  }
}

const airHeatByTile = new Uint32Array(A * B);
const outputViews = new WeakMap<Uint8Array, Uint32Array>();
const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

export function rasterize(w: World, camera: Layers, pixels: Uint8Array) {
  let words = outputViews.get(pixels);
  if (!words) {
    words = pixels.byteOffset % 4 === 0 && pixels.byteLength >= 4 * count
      ? new Uint32Array(pixels.buffer, pixels.byteOffset, count) : new Uint32Array(count);
    outputViews.set(pixels, words);
  }
  const shades = shadesFor(w.materialColors);
  const { cells, amount, aux, temperature, airTemperature } = w;
  if (camera.Heat) {
    for (let t = 0; t < airHeatByTile.length; t++) {
      const temp = airTemperature[t];
      airHeatByTile[t] = heatAir[temp < -150 ? 0 : temp > 2300 ? 2450 : (temp + 150.5) | 0];
    }
    for (let i = 0; i < count; i++) {
      if (cells[i]) {
        const temp = temperature[i];
        words[i] = heatMatter[temp < -150 ? 0 : temp > 2300 ? 2450 : (temp + 150.5) | 0];
      } else words[i] = airHeatByTile[airTile[i]];
    }
  } else {
    words.set(background);
    for (let i = 0; i < count; i++) {
      const m = cells[i];
      if (m) {
        words[i] = m === M.Sponge ? spongeShades[amount[i] * shadeCount + grain[i]]
          : shades[m * shadeCount + grain[i]];
        if ((m === M.Smoke || m === M.Steam) && aux[i] > 0 && aux[i] < 60) {
          const weight = aux[i] / 60, gas = words[i], air = background[i];
          const r = air & 255, g = (air >> 8) & 255, b = (air >> 16) & 255;
          words[i] = rgba(r + ((gas & 255) - r) * weight,
            g + (((gas >> 8) & 255) - g) * weight, b + (((gas >> 16) & 255) - b) * weight);
        }
      }
    }
  }
  drawTileLayers(w, words, shades, camera.Heat, camera.Pressure);
  if (camera.Air) streamlines(w, words);
  drawFans(w, words);
  // All supported Expo hosts use little endian and the board supplies an aligned buffer.
  // Honor other callers' byte offsets without slowing down the normal path.
  if (!littleEndian) {
    for (let i = 0; i < count; i++) {
      const color = words[i];
      words[i] = (color << 24) | ((color & 0xff00) << 8) | ((color >>> 8) & 0xff00) | (color >>> 24);
    }
  }
  if (words.buffer !== pixels.buffer)
    pixels.set(new Uint8Array(words.buffer, words.byteOffset, Math.min(pixels.length, count * 4)));
}
