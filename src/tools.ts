import type { BuiltinTool } from './world';
export const groups = {
  Materials: ['Sand', 'Water', 'Gravel', 'Smoke', 'Wood', 'Flame'],
  Air: ['Wind', 'Fan', 'Pressure', 'Suction'],
  Build: ['Wall', 'Erase'],
  Thermal: ['Heat', 'Cool', 'Probe'],
  World: [],
} as const satisfies Record<string, readonly BuiltinTool[]>;
