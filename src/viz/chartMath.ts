/** Pure chart geometry (unit-testable). */
/** Smooth path through the points: cubic segments with horizontal tangents, so it never overshoots a value. */
export function smoothPath(p: { x: number; y: number }[]): string {
  if (!p.length) return '';
  let d = `M ${p[0].x} ${p[0].y}`;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i], mx = (a.x + b.x) / 2;
    d += ` C ${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;
  }
  return d;
}

/** Three evenly spaced round gridline values whose range covers [lo, hi]. */
export function niceTicks(lo: number, hi: number): number[] {
  const raw = Math.max(1, hi - lo) / 2, mag = 10 ** Math.floor(Math.log10(raw));
  for (const k of [1, 2, 2.5, 5, 10, 20, 25, 50]) {
    const step = k * mag, start = Math.floor(lo / step) * step;
    if (step >= raw && start + 2 * step >= hi) return [start, start + step, start + 2 * step];
  }
  return [lo, (lo + hi) / 2, hi];
}
