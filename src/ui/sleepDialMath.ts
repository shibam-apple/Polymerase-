/** Pure 24 h dial geometry (no React Native imports, so it's unit-testable). */
export const DAY = 1440;
export const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const toHHMM = (m: number) => { const x = ((Math.round(m) % DAY) + DAY) % DAY; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

/** Minutes past midnight for a point on a 24 h dial (midnight at the top, clockwise), snapped to `snap` minutes. */
export function pointToMin(x: number, y: number, cx: number, cy: number, snap = 5): number {
  let a = Math.atan2(x - cx, cy - y);
  if (a < 0) a += 2 * Math.PI;
  return (Math.round(((a / (2 * Math.PI)) * DAY) / snap) * snap) % DAY;
}

/** Position of a clock time on the dial. */
export function minToPoint(min: number, cx: number, cy: number, r: number) {
  const a = (min / DAY) * 2 * Math.PI;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}
