import { M } from '../materialIds.ts';
import type { PackContext, PackMaterial } from '../packRuntime.ts';

function material(
  id: number,
  name: string,
  color: string,
  family: PackMaterial['family'],
  density: number,
  conductivity: number,
  tip: string,
  amount = 0,
): PackMaterial {
  return {
    id, name, color, family, density, conductivity, tip, amount,
    group: 'Chemistry', temperature: 20, life: 0, sourceEligible: family !== 'solid',
  };
}

export const chemistryDefinitions: PackMaterial[] = [
  material(M.Vinegar, 'Vinegar', '#e8c784', 'liquid', 36, 0.19,
    'Mix with baking soda to release carbon dioxide and cool the liquid.'),
  material(M.BakingSoda, 'Baking soda', '#e1ded6', 'powder', 59, 0.09,
    'Fizzes in vinegar and leaves sodium acetate solution.'),
  material(M.SodiumAcetateSolution, 'Sodium acetate solution', '#85cbbb', 'liquid', 43, 0.18,
    'Evaporate a drop of water, then cool and touch with a crystal to grow warm crystals.', 1),
  material(M.SodiumAcetateCrystals, 'Sodium acetate crystals', '#e5ffde', 'solid', 66, 0.14,
    'Seeds concentrated acetate. Heat to melt it back into concentrated solution.'),
  material(M.Plaster, 'Plaster', '#c6c1b8', 'powder', 61, 0.11,
    'Add water to set the powder into warm, solid gypsum.'),
  material(M.Gypsum, 'Gypsum', '#efe9d8', 'solid', 76, 0.13,
    'Set plaster holds its shape in water.'),
  material(M.ClayDust, 'Clay dust', '#c89375', 'powder', 56, 0.085,
    'Absorbs a drop of water to form wet clay.'),
  material(M.WetClay, 'Wet clay', '#976853', 'solid', 69, 0.16,
    'Dries in open air. Heating drives its water out faster.', 1),
  material(M.DryClay, 'Dry clay', '#d0a388', 'solid', 66, 0.12,
    'Add water to soften it again, or hold it at 800°C or hotter to fire a brick.'),
  material(M.FiredBrick, 'Fired brick', '#ba543e', 'solid', 80, 0.14,
    'Fired clay keeps its shape when cooled or soaked.'),
];

const crystalHeat = 18;
const meltTemperature = 58;
const dryingTime = 150;
const firingTime = 24;

function neighbor(c: PackContext, i: number, materialId: number) {
  return c.neighbors(i).find((j) => c.world.cells[j] === materialId);
}

// amount counts free water drops. Concentrated acetate still contains the water
// bound in its hydrated crystal, which stays with the acetate when it melts.
function evaporate(c: PackContext, i: number, isClay: boolean) {
  const w = c.world;
  const outlet = c.empty(i);
  if (outlet < 0 || w.temperature[i] <= 0 || w.amount[i] === 0) return;

  const boiling = w.temperature[i] >= 100;
  if (!boiling) {
    w.aux[i] += w.temperature[i] >= 50 ? 6 : 1;
    if (w.aux[i] < dryingTime) return;
  }

  const air = w.airTemperature[c.tile(outlet)];
  const vaporTemperature = boiling ? Math.max(100, air) : air;
  const remaining = w.amount[i] - 1;
  if (isClay && remaining === 0) c.change(i, M.DryClay);
  else c.touch(i);
  w.amount[i] = remaining;
  w.aux[i] = 0;
  c.change(outlet, boiling ? M.Steam : M.Fog);
  c.heat(outlet, vaporTemperature - w.temperature[outlet]);
  // Pay for evaporation and for warming a new steam drop above the local air.
  c.heat(i, -8 - (vaporTemperature - air));
}

export function chemistryStep(c: PackContext, i: number): void {
  const w = c.world;
  const id = w.cells[i];
  switch (id) {
    case M.Vinegar: {
      const soda = neighbor(c, i, M.BakingSoda);
      if (soda === undefined) return;
      // Both products fit in the reactants' cells, even in a sealed vessel.
      c.change(i, M.SodiumAcetateSolution);
      c.change(soda, M.CarbonDioxide);
      c.heat(i, -9);
      c.gas(soda, 0.25); // One free CO₂ bubble, as in the weather pack.
      return;
    }
    case M.SodiumAcetateSolution: {
      if (w.amount[i] > 0) {
        evaporate(c, i, false);
      } else if (w.temperature[i] < meltTemperature - crystalHeat &&
                 neighbor(c, i, M.SodiumAcetateCrystals) !== undefined) {
        c.change(i, M.SodiumAcetateCrystals);
        c.heat(i, crystalHeat);
      }
      return;
    }
    case M.SodiumAcetateCrystals:
      if (w.temperature[i] >= meltTemperature) {
        c.change(i, M.SodiumAcetateSolution);
        w.amount[i] = 0;
        c.heat(i, -crystalHeat);
      }
      return;
    case M.WetClay:
      evaporate(c, i, true);
      return;
    case M.DryClay:
    case M.ClayDust:
    case M.Plaster: {
      const water = neighbor(c, i, M.Water);
      if (water !== undefined) {
        c.change(water, M.Empty);
        c.change(i, id === M.Plaster ? M.Gypsum : M.WetClay);
        if (id === M.Plaster) c.heat(i, 16);
      } else if (id === M.DryClay) {
        if (w.temperature[i] < 800) w.aux[i] = 0;
        else if (++w.aux[i] >= firingTime) c.change(i, M.FiredBrick);
      }
      return;
    }
  }
}
