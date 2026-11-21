import { M } from './materialIds.ts';
import type { PackMaterial } from './packRuntime.ts';
import { weatherDefinitions } from './packs/weather.ts';
import { chemistryDefinitions } from './packs/chemistry.ts';
import { engineeringDefinitions } from './packs/engineering.ts';
import { gardenDefinitions } from './packs/garden.ts';

function classic(
  id: number, name: string, color: string, family: PackMaterial['family'],
  density: number, conductivity: number, tip: string,
  temperature = 20, life = 0, amount = 0,
): PackMaterial {
  return {
    id, name, color, family, density, conductivity, temperature, life, amount, tip,
    group: 'Classic', sourceEligible: family !== 'solid',
  };
}

export const builtinMaterials: readonly PackMaterial[] = [
  classic(M.Sand, 'Sand', '#E7B565', 'powder', 60, 0.09, 'Water binds loose grains into wet sand.'),
  classic(M.Gravel, 'Gravel', '#869294', 'powder', 82, 0.14, 'Dense gravel resists wind and melts into lava.'),
  classic(M.Smoke, 'Smoke', '#B3CECA', 'gas', 5, 0.08, 'Follow the plume to see where air flows. It thins and clears over time.', 48),
  classic(M.Wood, 'Wood', '#9F633C', 'solid', 30, 0.055, 'Heat wood until it chars and starts to burn.'),
  classic(M.Flame, 'Flame', '#FFAC49', 'gas', 3, 0.15, 'A short-lived flame heats the air and nearby matter.', 850, 28),
  classic(M.Ember, 'Ember', '#EE5E2D', 'solid', 45, 0.12, 'An ember gives off flame and smoke until it becomes ash.', 780, 120),
  classic(M.Water, 'Water', '#469DD3', 'liquid', 35, 0.2, 'Cool a drop into ice or heat it into steam.', 20, 0, 1),
  classic(M.WetSand, 'Wet Sand', '#A17849', 'powder', 72, 0.14, 'Heat wet sand to release its water as steam.', 20, 0, 1),
  classic(M.Ice, 'Ice', '#A2D7F0', 'solid', 32, 0.16, 'Warm the ice to return its water to the chamber.', -12, 0, 1),
  classic(M.Steam, 'Steam', '#D8E9F1', 'gas', 7, 0.07, 'Cool the vapor to collect water before it dissipates.', 120, 0, 1),
  classic(M.MoltenGlass, 'Molten Glass', '#FFBE5D', 'liquid', 75, 0.12, 'Let molten glass cool to form solid glass.', 1600),
  classic(M.Glass, 'Glass', '#85CAC3', 'solid', 72, 0.13, 'Glass holds its shape until intense heat melts it.'),
  classic(M.Lava, 'Lava', '#FC6724', 'liquid', 85, 0.14, 'Cool lava to cast solid rock.', 1150),
  classic(M.Rock, 'Rock', '#67625F', 'solid', 95, 0.15, 'Intense heat turns rock into flowing lava.'),
  classic(M.Char, 'Char', '#483730', 'solid', 38, 0.08, 'Hot char burns into an ember when exposed to air.', 20, 120),
  classic(M.Ash, 'Ash', '#979089', 'powder', 20, 0.07, 'Wind can scatter the light powder left by a spent ember.'),
  ...weatherDefinitions,
  ...chemistryDefinitions,
  ...engineeringDefinitions,
  ...gardenDefinitions,
];

const byId: (PackMaterial | undefined)[] = [];
for (const material of builtinMaterials) byId[material.id] = material;

export function builtinById(id: number): PackMaterial | undefined {
  return typeof id === 'number' ? byId[id] : undefined;
}
