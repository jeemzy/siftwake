import { chemistryStep } from './packs/chemistry.ts';
import { engineeringStep } from './packs/engineering.ts';
import { gardenStep } from './packs/garden.ts';
import { weatherStep } from './packs/weather.ts';
import { M } from './materialIds.ts';
import type { PackContext } from './packRuntime.ts';
import { H, W, cellTile } from './grid.ts';
import type { World } from './world.ts';

/** Pack rules share one reservation mask with material movement and custom reactions. */
export function runPacks(context: PackContext) {
  const world = context.world;
  // Change scan direction each tick so a growth front can develop in either direction.
  const reverse = world.ticks % 2 === 1;
  const tiles = cellTile;
  const direction = reverse ? -1 : 1;
  const end = reverse ? -1 : world.cells.length;
  for (let i = reverse ? world.cells.length - 1 : 0; i !== end; i += direction) {
    const id = world.cells[i];
    if (id < M.Slush) {
      // Plain water's only pack reaction is CO₂ uptake. One bubble requires at
      // least 1.25 pressure even at the highest possible absorption capacity.
      if (id !== M.Water || world.pressure[tiles[i]] < 1.25) continue;
    }
    if (!context.available(i)) continue;
    if (id <= M.Sponge) weatherStep(context, i);
    else if (id <= M.FiredBrick) chemistryStep(context, i);
    else if (id <= M.Cork) engineeringStep(context, i);
    else if (id <= M.Compost) gardenStep(context, i);
  }
}

export function packContext(world: World, change: PackContext['change'], touch: PackContext['touch'],
  reserved: (i: number) => boolean, random: () => number): PackContext {
  const tiles = cellTile;
  function available(i: number) {
    return i >= 0 && i < W * H && !reserved(i) && !world.wall[tiles[i]];
  }
  function neighbors(i: number) {
    const adjacent: number[] = [];
    const x = i % W;
    if (x > 0 && available(i - 1)) adjacent.push(i - 1);
    if (x < W - 1 && available(i + 1)) adjacent.push(i + 1);
    if (available(i - W)) adjacent.push(i - W);
    if (available(i + W)) adjacent.push(i + W);
    return adjacent;
  }
  return {
    world, shake: 0, down: [0, 1], tile: (i) => tiles[i], change, touch, random, available, neighbors,
    empty: (i) => neighbors(i).find((j) => !world.cells[j]) ?? -1,
    heat: (i, delta) => {
      world.temperature[i] = Math.max(-150, Math.min(2300, world.temperature[i] + delta));
    },
    gas: (i, delta) => {
      const t = tiles[i];
      world.pressure[t] = Math.max(-12, Math.min(12, world.pressure[t] + delta));
    },
  };
}
