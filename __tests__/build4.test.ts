import { describeDiag, firstLine, INITIAL_DIAG } from '../src/signal/camera/diag';
import { nightFromTimes } from '../src/state/health';
import { minToPoint, pointToMin, toHHMM, toMin } from '../src/ui/sleepDialMath';
import { niceTicks, smoothPath } from '../src/viz/chartMath';

const at = (d: string, hm: string) => new Date(`${d}T${hm}:00`).getTime();

describe('camera diagnostics', () => {
  it('shows only the first line of a native error', () => {
    const e = 'androidx.camera.core.CameraControl$OperationCanceledException: Camera is not active.\n  at androidx.camera.camera2.impl.TorchControl';
    expect(firstLine(e)).toBe('androidx.camera.core.CameraControl$OperationCanceledException: Camera is not active.');
    const line = describeDiag({ ...INITIAL_DIAG, permission: 'granted', started: true, torch: 'failed', fps: 20.2, lastError: e });
    expect(line).toContain('torch failed');
    expect(line).not.toContain('TorchControl');
  });
  it('reads cleanly when all is well', () => {
    expect(describeDiag({ ...INITIAL_DIAG, permission: 'granted', started: true, torch: 'on', fps: 30, pixelFormat: 'rgb' })).toBe('torch on · 30 fps · rgb');
  });
});

describe('timed night', () => {
  it('crosses midnight and is dated to the wake-up day', () => {
    const n = nightFromTimes(at('2026-09-25', '23:12'), at('2026-09-26', '07:04'));
    expect(n).toMatchObject({ date: '2026-09-26', bed: '23:10', wake: '07:05', stale: false });
    expect(n.hours).toBeCloseTo(7.92, 2);
  });
  it('flags a forgotten "Going to bed"', () => {
    expect(nightFromTimes(at('2026-09-24', '23:00'), at('2026-09-26', '07:00')).stale).toBe(true);
  });
});

describe('sleep dial', () => {
  it('maps clock times to the dial and back', () => {
    for (const t of ['00:00', '06:00', '12:00', '18:00', '23:15', '07:05']) {
      const p = minToPoint(toMin(t), 100, 100, 80);
      expect(toHHMM(pointToMin(p.x, p.y, 100, 100))).toBe(t);
    }
  });
  it('puts midnight at the top and 6 AM on the right', () => {
    expect(pointToMin(100, 10, 100, 100)).toBe(0);
    expect(pointToMin(190, 100, 100, 100)).toBe(360);
  });
});

describe('day chart helpers', () => {
  it('picks three round gridlines covering the data', () => {
    const t = niceTicks(38, 61);
    expect(t.length).toBe(3);
    expect(t[0]).toBeLessThanOrEqual(38);
    expect(t[2]).toBeGreaterThanOrEqual(61);
    expect(t[1] - t[0]).toBe(t[2] - t[1]);
  });
  it('draws a smooth path that stays within the data range', () => {
    const d = smoothPath([{ x: 0, y: 10 }, { x: 10, y: 50 }, { x: 20, y: 30 }]);
    const ys = d.match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...ys)).toBeLessThanOrEqual(50);
  });
});
