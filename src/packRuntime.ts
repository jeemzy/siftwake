import type { World } from './world.ts';

/** Paint defaults and the catalog entry share a definition so products work as brushes too. */
export type PackMaterial = {
  id: number;
  name: string;
  color: string;
  family: 'powder' | 'liquid' | 'gas' | 'solid';
  density: number;
  conductivity: number;
  temperature: number;
  life: number;
  amount: number;
  tip: string;
  group: string;
  sourceEligible: boolean;
};

export type PackContext = {
  world: World;
  shake: number;
  down: readonly [number, number];
  tile(i: number): number;
  neighbors(i: number): readonly number[];
  empty(i: number): number;
  available(i: number): boolean;
  /** Change identity while preserving local heat. Resets product-specific particle state. */
  change(i: number, id: number): void;
  /** Reserve a participant when changing only its inventory. */
  touch(i: number): void;
  heat(i: number, delta: number): void;
  gas(i: number, delta: number): void;
  random(): number;
};
