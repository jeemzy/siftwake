export const W = 160, H = 240;
export const A = W / 4, B = H / 4;
export const tile = (x: number, y: number) => (x >> 2) + (y >> 2) * A;

// The particle-to-air mapping is fixed for the lifetime of every world.
export const cellTile = new Uint16Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) cellTile[y * W + x] = tile(x, y);
