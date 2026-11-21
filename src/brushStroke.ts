// Pointer events may arrive several times between two simulation ticks. Keep one
// stamp per crossed cell and repeat only the held position on subsequent ticks.
export function brushStroke() {
  const path = new Set<number>();
  let held: number | null = null;
  function cancel() {
    path.clear();
    held = null;
  }
  return {
    visit(cell: number) {
      path.add(cell);
      held = cell;
    },
    tick(stamp: (cell: number) => void) {
      if (path.size) {
        for (const cell of path) stamp(cell);
        path.clear();
      } else if (held !== null) stamp(held);
    },
    release(stamp: (cell: number) => void) {
      // Preserve the last segment and fast taps that fit entirely between ticks.
      for (const cell of path) stamp(cell);
      cancel();
    },
    cancel,
  };
}
