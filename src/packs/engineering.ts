import { M } from '../materialIds.ts';
import type { PackMaterial, PackContext } from '../packRuntime.ts';

const defaults = { group: 'Engineering', temperature: 20, life: 0, amount: 0 } as const;

export const engineeringDefinitions: PackMaterial[] = [
  {
    ...defaults, id: M.Copper, name: 'Copper', color: '#CD794A', family: 'solid',
    density: 99, conductivity: 0.24, sourceEligible: false,
    tip: 'Heat one end of a copper bar to carry heat along it. Copper melts at 1085 °C.',
  },
  {
    ...defaults, id: M.MoltenCopper, name: 'Molten Copper', color: '#FF9A47', family: 'liquid',
    density: 97, conductivity: 0.19, temperature: 1250, sourceEligible: true,
    tip: 'Pour into a mold and cool to cast a fixed copper shape.',
  },
  {
    ...defaults, id: M.Tin, name: 'Tin', color: '#ADBCC6', family: 'solid',
    density: 94, conductivity: 0.14, sourceEligible: false,
    tip: 'Tin melts at 232 °C. Heat it to fill a mold while nearby copper stays solid.',
  },
  {
    ...defaults, id: M.MoltenTin, name: 'Molten Tin', color: '#DADDEA', family: 'liquid',
    density: 92, conductivity: 0.12, temperature: 310, sourceEligible: true,
    tip: 'Cool liquid tin to cast it in place. Heat the casting to pour it again.',
  },
  {
    ...defaults, id: M.Iron, name: 'Iron', color: '#75818B', family: 'solid',
    density: 96, conductivity: 0.16, sourceEligible: false,
    tip: 'Keep an iron edge in contact with water and air to grow rust. Brine speeds it up.',
  },
  {
    ...defaults, id: M.Rust, name: 'Rust', color: '#AF542F', family: 'powder',
    density: 68, conductivity: 0.07, sourceEligible: true,
    tip: 'Rust crumbles away from wet iron and settles as reddish grains.',
  },
  {
    ...defaults, id: M.Wax, name: 'Wax', color: '#E7CF91', family: 'solid',
    density: 32, conductivity: 0.035, sourceEligible: false,
    tip: 'Seal a gap with wax. Warm the plug past 60 °C to drain it.',
  },
  {
    ...defaults, id: M.MoltenWax, name: 'Molten Wax', color: '#F2BB52', family: 'liquid',
    density: 28, conductivity: 0.035, temperature: 85, sourceEligible: true,
    tip: 'Flow into a gap and cool to make a fixed plug.',
  },
  {
    ...defaults, id: M.Oil, name: 'Oil', color: '#A18D3D', family: 'liquid',
    density: 30, conductivity: 0.04, sourceEligible: true,
    tip: 'Pour oil into water to see it collect in a separate layer on top.',
  },
  {
    ...defaults, id: M.Cork, name: 'Cork', color: '#C99965', family: 'powder',
    density: 12, conductivity: 0.025, sourceEligible: true,
    tip: 'Drop cork grains into a tank. They float on both water and oil.',
  },
];

// Store partial fusion as a magnitude in aux. The current phase gives its sign,
// so heat added partway through freezing can undo that progress, and vice versa.
function cast(c: PackContext, i: number, solid: number, liquid: number, point: number, cost: number) {
  const { cells, temperature, aux } = c.world;
  const direction = cells[i] === solid ? 1 : -1;
  const energy = direction * (temperature[i] - point) + aux[i] / 256;
  if (energy >= cost) {
    c.change(i, direction === 1 ? liquid : solid);
    temperature[i] = point + direction * (energy - cost);
  } else if (energy > 0) {
    temperature[i] = point;
    aux[i] = Math.round(energy * 256);
  } else if (aux[i]) {
    temperature[i] = point + direction * energy;
    aux[i] = 0;
  }
}

function corrode(c: PackContext, i: number) {
  const { cells, aux } = c.world;
  let exposed = false;
  let rate = 0;
  for (const j of c.neighbors(i)) {
    if (cells[j] === M.Empty) exposed = true;
    else if (cells[j] === M.Brine) rate = 4;
    else if (cells[j] === M.Water && rate === 0) rate = 1;
  }
  if (!exposed || !rate) return;
  aux[i] += rate;
  if (aux[i] >= 90) c.change(i, M.Rust);
}

export function engineeringStep(c: PackContext, i: number): void {
  switch (c.world.cells[i]) {
    case M.Copper:
    case M.MoltenCopper:
      return cast(c, i, M.Copper, M.MoltenCopper, 1085, 140);
    case M.Tin:
    case M.MoltenTin:
      return cast(c, i, M.Tin, M.MoltenTin, 232, 60);
    case M.Wax:
    case M.MoltenWax:
      return cast(c, i, M.Wax, M.MoltenWax, 60, 24);
    case M.Iron:
      return corrode(c, i);
  }
}
