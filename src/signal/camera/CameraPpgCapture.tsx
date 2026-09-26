import { useCallback, useEffect, useRef } from 'react';
import { useCamera, useCameraPermission, useFrameOutput, CommonResolutions, type Frame } from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';
import type { PpgSample, SourceStatus } from '../sources';

export type CameraPpgCaptureProps = {
  active: boolean;
  onSample: (s: PpgSample) => void;
  onStatus: (s: SourceStatus) => void;
  /** Capture details for diagnostics (pixel format, achieved fps, which 3A locks succeeded). */
  onInfo?: (info: Record<string, string | number | boolean>) => void;
};

/**
 * Fingertip camera PPG. Rear camera + torch; the fingertip covers lens and flash. Every frame is
 * reduced to mean R, G, B over a sub-sampled centre grid (the pipeline later picks the channel with
 * the strongest pulse). After the torch has settled, auto-exposure, white balance and focus are locked
 * so the camera stops "correcting away" the pulse. A covered lens gives a red, almost uniform frame:
 * red dominance + low spatial variation = finger contact.
 *
 * NOTE: untested on a physical device from CI. See README → On-device checklist.
 */
export function CameraPpgCapture({ active, onSample, onStatus, onInfo }: CameraPpgCaptureProps) {
  const permission = useCameraPermission();
  const unit = useRef<{ scale: number; last: number | null; t0: number | null; n: number; fmt: string }>({ scale: 0, last: null, t0: null, n: 0, fmt: '' });

  useEffect(() => {
    if (active && !permission.hasPermission) {
      if (permission.canRequestPermission) permission.requestPermission().then(ok => { if (!ok) onStatus('error'); });
      else onStatus('error');
    }
    if (active) { unit.current = { scale: 0, last: null, t0: null, n: 0, fmt: '' }; onStatus('starting'); }
  }, [active, permission, onStatus]);

  const receive = useCallback((ts: number, r: number, g: number, b: number, cv: number, fmt: string) => {
    const u = unit.current;
    // Frame timestamps are ns on Android and s on iOS; infer the unit from the first frame gap.
    if (u.last != null && u.scale === 0) {
      const d = ts - u.last;
      u.scale = d > 1e5 ? 1e-9 : d > 1 ? 1e-3 : 1;
    }
    u.last = ts;
    if (u.scale === 0) return;
    if (u.t0 == null) { u.t0 = ts; u.fmt = fmt; }
    u.n++;
    const t = (ts - u.t0) * u.scale;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const contact = r > 40 && r > 1.4 * g && cv < 0.25;
    onStatus(contact ? 'running' : 'no-contact');
    onSample({ t, v: r, r, g, b, luma, contact });
    if (u.n === 150 && onInfo) onInfo({ pixelFormat: fmt, fps: Math.round((u.n / Math.max(0.001, t)) * 10) / 10 });
  }, [onSample, onStatus, onInfo]);

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_4_3,
    pixelFormat: 'rgb',
    onFrame(frame: Frame) {
      'worklet';
      try {
        const fmt = String(frame.pixelFormat);
        if (frame.hasPixelBuffer && !frame.isPlanar) {
          const buf = new Uint8Array(frame.getPixelBuffer()), row = frame.bytesPerRow, w = frame.width, h = frame.height;
          const bpp = Math.max(3, Math.round(row / w));
          const bgr = fmt.indexOf('bgra') >= 0;
          const x0 = (w / 4) | 0, x1 = ((3 * w) / 4) | 0, y0 = (h / 4) | 0, y1 = ((3 * h) / 4) | 0;
          let sr = 0, sg = 0, sb = 0, s2 = 0, n = 0;
          for (let j = y0; j < y1; j += 6) {
            for (let i = x0; i < x1; i += 6) {
              const o = j * row + i * bpp;
              const r = bgr ? buf[o + 2] : buf[o], g = buf[o + 1], b = bgr ? buf[o] : buf[o + 2];
              sr += r; sg += g; sb += b; s2 += r * r; n++;
            }
          }
          if (n > 0) {
            const mr = sr / n, sd = Math.sqrt(Math.max(0, s2 / n - mr * mr));
            scheduleOnRN(receive, frame.timestamp, mr, sg / n, sb / n, mr > 0 ? sd / mr : 1, fmt);
          }
        } else {
          // Planar (YUV) fallback: luma only, reported as all three channels.
          const planes = frame.getPlanes();
          if (planes.length > 0) {
            const y = planes[0], buf = new Uint8Array(y.getPixelBuffer()), row = y.bytesPerRow;
            const w = y.width, h = y.height;
            let s = 0, s2 = 0, n = 0;
            const ya = (h / 4) | 0, yb = ((3 * h) / 4) | 0, xa = (w / 4) | 0, xb = ((3 * w) / 4) | 0;
            for (let j = ya; j < yb; j += 8) for (let i = xa; i < xb; i += 8) { const v = buf[j * row + i]; s += v; s2 += v * v; n++; }
            if (n > 0) { const m = s / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m)); scheduleOnRN(receive, frame.timestamp, m, m / 2, m / 4, m > 0 ? sd / m : 1, fmt); }
          }
        }
      } finally {
        frame.dispose();
      }
    },
  });

  const controller = useCamera({
    isActive: active && permission.hasPermission,
    device: 'back',
    outputs: [frameOutput],
    torchMode: active ? 'on' : 'off',
    constraints: [{ fps: 30 }],
    onError: () => onStatus('error'),
  });

  // Lock exposure / white balance / focus ~2.5 s after the torch comes on, once auto-exposure has
  // converged on the lit fingertip. Each lock is optional; unsupported devices just keep auto.
  useEffect(() => {
    if (!active || !controller) return;
    const id = setTimeout(async () => {
      const res: Record<string, boolean> = {};
      for (const [k, fn] of [['aeLocked', () => controller.lockCurrentExposure()], ['awbLocked', () => controller.lockCurrentWhiteBalance()], ['afLocked', () => controller.lockCurrentFocus()]] as const) {
        try { await fn(); res[k] = true; } catch { res[k] = false; }
      }
      onInfo?.(res);
    }, 2500);
    return () => clearTimeout(id);
  }, [active, controller, onInfo]);

  return null;
}
