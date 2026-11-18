import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { W, H, tile, type World } from './world';

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
];
const fanArrows = [
  [4, 5, 6, 7, 2, 10],
  [1, 5, 9, 13, 8, 10],
  [4, 5, 6, 7, 1, 9],
  [2, 6, 10, 14, 5, 7],
];
export function worldImage(w: World, overlay: boolean, pixels: Uint8Array) {
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
      } else if (overlay) {
        const p = w.pressure[t],
          k = Math.min(0.85, Math.abs(p) * 0.72);
        r += ((p > 0 ? 244 : 65) - r) * k;
        g += ((p > 0 ? 145 : 155) - g) * k;
        b += ((p > 0 ? 70 : 238) - b) * k;
      }
      pixels[4 * i] = Math.min(255, r);
      pixels[4 * i + 1] = g;
      pixels[4 * i + 2] = b;
      pixels[4 * i + 3] = 255;
    }
  const data = Skia.Data.fromBytes(pixels);
  const image = Skia.Image.MakeImage(
    { width: W, height: H, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque },
    data,
    W * 4,
  );
  data.dispose();
  return image;
}
