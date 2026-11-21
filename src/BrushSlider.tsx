import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';

const radii = [1, 3, 6] as const;
const sizes = ['Fine', 'Medium', 'Wide'] as const;
const railInset = 6;

function positionAt(event: PointerEvent<HTMLInputElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const travel = bounds.height - 2 * railInset;
  return Math.max(0, Math.min(2, 2 * (bounds.bottom - railInset - event.clientY) / travel));
}

export default function BrushSlider({ brush, onBrush }: {
  brush: number;
  onBrush: (radius: number) => Promise<void>;
}) {
  const detent = Math.max(0, radii.findIndex(radius => radius === brush));
  const [selected, setSelected] = useState(detent);
  useLayoutEffect(() => setSelected(detent), [detent]);
  const [drag, setDrag] = useState<number | null>(null);
  const tracking = useRef<number | null>(null);
  const value = drag ?? selected;
  const stop = Math.round(value);
  const hue = value <= 1 ? 135 - value * 85 : 50 - (value - 1) * 46;

  function commit(position: number) {
    const next = Math.max(0, Math.min(2, Math.round(position)));
    setDrag(null);
    if (next !== selected) {
      setSelected(next);
      void onBrush(radii[next]);
    }
  }

  return <label className="sw-brush-slider" style={{
    '--brush-position': `${(2 - value) * 50}%`,
    '--brush-color': `hsl(${hue} 66% 48%)`,
  } as CSSProperties} data-dragging={drag !== null || undefined}>
    <span>Brush</span>
    <span className="sw-slider-rail">
      <span className="sw-slider-stops" aria-hidden="true"><i /><i /><i /></span>
      <span className="sw-slider-throw" aria-hidden="true"><i /></span>
      <input aria-label="Brush size" type="range" min="0" max="2" step="0.01" value={value}
        aria-orientation="vertical" aria-valuetext={sizes[stop]}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          tracking.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag(positionAt(event));
        }}
        onPointerMove={event => {
          if (tracking.current === event.pointerId) setDrag(positionAt(event));
        }}
        onPointerUp={event => {
          if (tracking.current !== event.pointerId) return;
          tracking.current = null;
          commit(positionAt(event));
        }}
        onLostPointerCapture={event => {
          if (tracking.current !== event.pointerId) return;
          tracking.current = null;
          setDrag(null);
        }}
        onChange={event => { if (tracking.current === null) commit(event.currentTarget.valueAsNumber); }}
        onKeyDown={event => {
          const next = { ArrowUp: selected + 1, ArrowRight: selected + 1, ArrowDown: selected - 1,
            ArrowLeft: selected - 1, Home: 0, End: 2, PageUp: 2, PageDown: 0 }[event.key];
          if (next !== undefined) { event.preventDefault(); commit(next); }
        }} />
    </span>
    <span className="sw-brush-size">{sizes[stop]}</span>
  </label>;
}
