export const SOURCE = { material: 7, heat: 8, cool: 9 } as const;

export const percent = (value: number) =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0;

// Interleave the four open faces so even a size-one outlet emits in every direction.
export const outlets = Array.from({ length: 16 }, (_, n) => {
  const offset = n >> 2;
  return [[offset, 4], [-1, offset], [3 - offset, -1], [4, 3 - offset]][n % 4];
});

// Traverse the segment in air-tile coordinates. At a corner, both faces must be open.
export function clearWallPath(
  wall: Uint8Array, stride: number, x: number, y: number, endX: number, endY: number,
) {
  let tx = x >> 2, ty = y >> 2;
  const targetX = endX >> 2, targetY = endY >> 2;
  const dx = endX - x, dy = endY - y;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const stepX = dx ? 4 / Math.abs(dx) : Infinity;
  const stepY = dy ? 4 / Math.abs(dy) : Infinity;
  let crossX = dx ? ((tx + Number(sx > 0)) * 4 - x) / dx : Infinity;
  let crossY = dy ? ((ty + Number(sy > 0)) * 4 - y) / dy : Infinity;
  while (!wall[tx + ty * stride]) {
    if (tx === targetX && ty === targetY) return true;
    const moveX = tx !== targetX && (ty === targetY || crossX <= crossY);
    const moveY = ty !== targetY && (tx === targetX || crossY <= crossX);
    if (moveX && moveY && (wall[tx + sx + ty * stride] || wall[tx + (ty + sy) * stride]))
      return false;
    if (moveX) { tx += sx; crossX += stepX; }
    if (moveY) { ty += sy; crossY += stepY; }
  }
  return false;
}
