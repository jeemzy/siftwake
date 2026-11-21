import { M } from '../materialIds.ts';
import type { PackContext, PackMaterial } from '../packRuntime.ts';

function material(
  id: number, name: string, color: string, family: PackMaterial['family'],
  density: number, conductivity: number, temperature: number, tip: string,
  amount = 0, life = 0,
): PackMaterial {
  return {
    id, name, color, family, density, conductivity, temperature, tip, amount, life,
    group: 'Weather', sourceEligible: family !== 'solid',
  };
}

const spongeCapacity = 8;
const pressurePerBubble = 0.25;
export const weatherDefinitions: PackMaterial[] = [
  material(M.Slush, 'Slush', '#A0CBDD', 'liquid', 43, 0.13, 0,
    'Chill slush into ice or warm it into water.'),
  material(M.Fog, 'Fog', '#B4C3CD', 'gas', 6, 0.06, 8,
    'Cold surfaces collect droplets. Below freezing, the mist deposits frost.'),
  material(M.Frost, 'Frost', '#CAE6F8', 'solid', 30, 0.12, -10,
    'Frost clings to a surface until warming turns it to slush.'),
  material(M.Salt, 'Salt', '#E6DFCF', 'powder', 62, 0.12, 20,
    'Dissolve one grain in a drop of water to make brine.'),
  material(M.Brine, 'Brine', '#739FAB', 'liquid', 53, 0.18, 14,
    'Brine stays liquid down to −18 °C. Freezing or boiling separates the salt.'),
  material(M.CarbonDioxide, 'Carbon Dioxide', '#9C91AB', 'gas', 9, 0.07, 18,
    'Each gas cell supplies one bubble to cool water under pressure.', 1),
  material(M.CarbonatedWater, 'Carbonated Water', '#70C4C6', 'liquid', 45, 0.17, 10,
    'Dissolved gas escapes on warming or venting. Shake to speed its release.', 3),
  material(M.DryIce, 'Dry Ice', '#C9BCE3', 'powder', 65, 0.15, -80,
    'Warming a pellet cools its surroundings and releases up to four CO₂ bubbles.', 4),
  material(M.SoapyWater, 'Soapy Water', '#9AD5C2', 'liquid', 44, 0.17, 20,
    'A drop traps a free CO₂ bubble as foam.'),
  material(M.Foam, 'Foam', '#DDEDD3', 'gas', 7, 0.06, 20,
    'When a bubble drains, it returns its soapy water and trapped gas.', 1, 60),
  material(M.Sponge, 'Sponge', '#C8A74E', 'solid', 29, 0.07, 20,
    'Absorbs up to eight drops. Shake it to squeeze out water or heat it to release steam.'),
];

function neighborWith(c: PackContext, i: number, id: number) {
  return c.neighbors(i).find(j => c.world.cells[j] === id);
}

// A solution contains one drop of water. Its amount counts dissolved CO₂ cells.
// Agitation changes the rate of release, never the equilibrium capacity.
function carbonate(c: PackContext, i: number) {
  const w = c.world;
  const dissolved = w.cells[i] === M.Water ? 0 : w.amount[i];
  const pressure = w.pressure[c.tile(i)];
  const cool = Math.max(0, Math.min(1, (35 - w.temperature[i]) / 15));
  const capacity = Math.min(8, Math.floor(Math.max(0, pressure) * cool));
  // The uptake itself lowers pressure. Leave enough headroom that this transfer
  // cannot immediately supersaturate the same closed tile.
  if (dissolved < capacity && (pressure - pressurePerBubble) * cool >= dissolved + 1) {
    const gas = neighborWith(c, i, M.CarbonDioxide);
    if (gas === undefined) return;
    c.change(gas, M.Empty);
    c.change(i, M.CarbonatedWater);
    w.amount[i] = dissolved + 1;
    c.gas(gas, -pressurePerBubble);
  } else if (dissolved > capacity && c.random() < 0.2 + 0.8 * c.shake) {
    const outlet = c.empty(i);
    if (outlet < 0) return;
    c.change(outlet, M.CarbonDioxide);
    w.temperature[outlet] = w.temperature[i];
    c.change(i, dissolved === 1 ? M.Water : M.CarbonatedWater);
    if (dissolved > 1) w.amount[i] = dissolved - 1;
    c.gas(outlet, pressurePerBubble);
  }
}

function condenseFog(c: PackContext, i: number) {
  const w = c.world;
  for (const j of c.neighbors(i)) {
    if (w.temperature[j] > 8) continue;
    const id = w.cells[j];
    if (id === M.Empty || id === M.Fog || id === M.Steam || id === M.Smoke ||
        id === M.CarbonDioxide || id === M.Foam || id === M.Flame) continue;
    if (w.hasCustomMaterial(id) && w.customMaterials.find(m => m.id === id)?.family === 'gas') continue;
    c.change(i, w.temperature[j] <= 0 ? M.Frost : M.Water);
    w.temperature[i] = w.temperature[j];
    return;
  }
}

function separateBrine(c: PackContext, i: number) {
  const w = c.world;
  const temp = w.temperature[i];
  if (temp > -18 && temp < 105) return;
  const outlet = c.empty(i);
  if (outlet < 0) return;
  c.change(i, M.Salt);
  c.change(outlet, temp <= -18 ? M.Ice : M.Steam);
  w.temperature[outlet] = temp;
}

function sublime(c: PackContext, i: number) {
  const w = c.world;
  if (w.temperature[i] <= -78) return;
  const last = w.amount[i] === 1;
  const outlet = last ? i : c.empty(i);
  if (outlet < 0) return;
  const temp = w.temperature[i];
  if (!last) {
    w.amount[i]--;
    c.touch(i);
    c.heat(i, -12);
  }
  c.change(outlet, M.CarbonDioxide);
  w.temperature[outlet] = Math.min(temp, -78);
  c.gas(outlet, pressurePerBubble);
}

function drainFoam(c: PackContext, i: number) {
  const w = c.world;
  if (w.life[i] > 0 && --w.life[i] > 0) return;
  const outlet = c.empty(i);
  if (outlet < 0) return;
  c.change(i, M.SoapyWater);
  c.change(outlet, M.CarbonDioxide);
  w.temperature[outlet] = w.temperature[i];
  c.gas(outlet, pressurePerBubble);
}

function soakOrSqueeze(c: PackContext, i: number) {
  const w = c.world;
  const hot = w.temperature[i] >= 100;
  if (hot || c.shake >= 0.5) {
    if (!w.amount[i]) return;
    const outlet = c.empty(i);
    if (outlet < 0) return;
    c.change(outlet, hot ? M.Steam : M.Water);
    w.temperature[outlet] = w.temperature[i];
    w.amount[i]--;
    c.touch(i);
  } else if (w.amount[i] < spongeCapacity) {
    const water = neighborWith(c, i, M.Water);
    if (water === undefined) return;
    c.change(water, M.Empty);
    w.amount[i]++;
    c.touch(i);
  }
}

export function weatherStep(c: PackContext, i: number): void {
  const w = c.world;
  switch (w.cells[i]) {
    case M.Frost:
      if (w.temperature[i] > 0) c.change(i, M.Slush);
      break;
    case M.Slush:
      if (w.temperature[i] <= -2) c.change(i, M.Ice);
      else if (w.temperature[i] >= 2) c.change(i, M.Water);
      break;
    case M.Fog:
      condenseFog(c, i);
      break;
    case M.Salt: {
      const water = neighborWith(c, i, M.Water);
      if (water !== undefined) {
        c.change(water, M.Brine);
        c.change(i, M.Empty);
      }
      break;
    }
    case M.Brine:
      separateBrine(c, i);
      break;
    case M.Water:
    case M.CarbonatedWater:
      carbonate(c, i);
      break;
    case M.DryIce:
      sublime(c, i);
      break;
    case M.SoapyWater: {
      const gas = neighborWith(c, i, M.CarbonDioxide);
      if (gas !== undefined) {
        c.change(gas, M.Empty);
        c.change(i, M.Foam);
        c.gas(gas, -pressurePerBubble);
      }
      break;
    }
    case M.Foam:
      drainFoam(c, i);
      break;
    case M.Sponge:
      soakOrSqueeze(c, i);
      break;
  }
}
