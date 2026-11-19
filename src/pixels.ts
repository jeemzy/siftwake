import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { rasterize } from './raster';
import type { Layers } from './views';
import { W, H, type World } from './world';

export function worldImage(w: World, camera: Layers, pixels: Uint8Array) {
  rasterize(w, camera, pixels);
  const data = Skia.Data.fromBytes(pixels);
  const image = Skia.Image.MakeImage(
    { width: W, height: H, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque },
    data,
    W * 4,
  );
  data.dispose();
  return image;
}
