import React, { useEffect, useRef, type PointerEvent } from 'react';
import type { StrokeProps } from './StrokeSurface';

export default function StrokeSurface({ sample, end }: StrokeProps) {
  const active = useRef<number | null>(null);
  useEffect(() => {
    function cancel() {
      if (active.current === null) return;
      active.current = null;
      end(true);
    }
    function visibility() { if (document.hidden) cancel(); }
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [end]);
  function point(event: PointerEvent<HTMLDivElement>, start: boolean) {
    const rect = event.currentTarget.getBoundingClientRect();
    const samples =
      !start && event.type === 'pointermove' ? event.nativeEvent.getCoalescedEvents?.() : undefined;
    for (const p of samples?.length ? samples : [event]) {
      sample(p.clientX - rect.left, p.clientY - rect.top, start);
    }
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerId !== active.current) return;
    if (event.type === 'pointerup') point(event, false);
    active.current = null;
    end(event.type !== 'pointerup');
  }
  return (
    <div
      data-testid="world"
      aria-label="Simulation canvas"
      style={{
        position: 'absolute',
        inset: 0,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: 'crosshair',
      }}
      onPointerDown={(event) => {
        if (active.current !== null || event.button !== 0 || !event.isPrimary) return;
        active.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        point(event, true);
      }}
      onPointerMove={(event) => {
        if (event.pointerId === active.current) point(event, false);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
