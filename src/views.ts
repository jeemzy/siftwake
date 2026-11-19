export const views = ['Normal', 'Pressure', 'Air', 'Heat'] as const;
export type ViewName = (typeof views)[number];
export type Layers = Record<Exclude<ViewName, 'Normal'>, boolean>;
export const normal: Layers = { Pressure: false, Air: false, Heat: false };

export function isChecked(layers: Layers, view: ViewName) {
  return view === 'Normal' ? !layers.Pressure && !layers.Air && !layers.Heat : layers[view];
}

export function changeLayer(layers: Layers, view: ViewName, enabled: boolean): Layers {
  return view === 'Normal' ? normal : { ...layers, [view]: enabled };
}
