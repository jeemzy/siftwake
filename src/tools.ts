import type { Tool } from './world';
export const groups = {
  Materials: ['Sand', 'Water', 'Gravel', 'Smoke', 'Wood', 'Flame'],
  Air: ['Wind', 'Fan', 'Pressure', 'Suction'],
  Build: ['Wall', 'Erase'],
  Thermal: ['Heat', 'Cool'],
  World: [],
} as const satisfies Record<string, readonly Tool[]>;
export const swatches: Record<Tool, string> = {
  Heat: '#eb7648',
  Cool: '#78baf6',
  Sand: '#e7b565',
  Water: '#469dd3',
  Gravel: '#909a9e',
  Smoke: '#c2d8cf',
  Wood: '#b07751',
  Flame: '#ff9353',
  Wall: '#758b83',
  Fan: '#6fd4b0',
  Pressure: '#eab08e',
  Suction: '#80b4dc',
  Wind: '#a5cfd8',
  Erase: '#d8cebd',
};
