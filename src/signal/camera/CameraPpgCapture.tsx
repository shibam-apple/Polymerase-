import { useCallback, useEffect, useRef } from 'react';
import { useCamera, useCameraPermission, useFrameOutput, CommonResolutions, type Frame } from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';
import type { PpgSample, SourceStatus } from '../sources';

export type CameraPpgCaptureProps = {
  active: boolean;
  onSample: (s: PpgSample) => void;
  onStatus: (s: SourceStatus) => void;
};

/**
 * Fingertip camera PPG. Rear camera + torch; the finger covers the lens and flash. Each frame's
 * luma (Y plane, centre region, sub-sampled grid) is averaged into one brightness sample.
 * A covered lens gives an almost uniform frame, so the spatial coefficient of variation doubles
 * as a finger-contact detector. Renders nothing: there is no preview.
 *
 * NOTE: untested on a physical device from this repo's CI. See README → On-device checklist.
 */
export function CameraPpgCapture({ active, onSample, onStatus }: CameraPpgCaptureProps) {
  const permission = useCameraPermission();
  const unit = useRef<{ scale: number; last: number | null; t0: number | null }>({ scale: 0, last: null, t0: null });

  useEffect(() => {
    if (active && !permission.hasPermission) {
      if (permission.canRequestPermission) permission.requestPermission().then(ok => { if (!ok) onStatus('error'); });
      else onStatus('error');
    }
    if (active) { unit.current = { scale: 0, last: null, t0: null }; onStatus('starting'); }
  }, [active, permission, onStatus]);

  const receive = useCallback((ts: number, mean: number, cv: number) => {
    const u = unit.current;
    // Frame timestamps are ns on Android and s on iOS; infer the unit from the first frame gap.
    if (u.last != null && u.scale === 0) {
      const d = ts - u.last;
      u.scale = d > 1e5 ? 1e-9 : d > 1 ? 1e-3 : 1;
    }
    u.last = ts;
    if (u.scale === 0) return;
    if (u.t0 == null) u.t0 = ts;
    onStatus(cv > 0.25 || mean < 20 ? 'no-contact' : 'running');
    onSample({ t: (ts - u.t0) * u.scale, v: mean });
  }, [onSample, onStatus]);

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_4_3,
    pixelFormat: 'yuv',
    onFrame(frame: Frame) {
      'worklet';
      try {
        const planes = frame.getPlanes();
        if (planes.length > 0) {
          const y = planes[0], buf = new Uint8Array(y.getPixelBuffer()), row = y.bytesPerRow;
          const w = y.width, h = y.height, x0 = (w / 4) | 0, x1 = ((3 * w) / 4) | 0, y0 = (h / 4) | 0, y1 = ((3 * h) / 4) | 0;
          let s = 0, s2 = 0, n = 0;
          for (let j = y0; j < y1; j += 8) for (let i = x0; i < x1; i += 8) { const v = buf[j * row + i]; s += v; s2 += v * v; n++; }
          if (n > 0) {
            const m = s / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m));
            scheduleOnRN(receive, frame.timestamp, m, m > 0 ? sd / m : 1);
          }
        }
      } finally {
        frame.dispose();
      }
    },
  });

  useCamera({
    isActive: active && permission.hasPermission,
    device: 'back',
    outputs: [frameOutput],
    torchMode: active ? 'on' : 'off',
    constraints: [{ fps: 30 }],
    onError: () => onStatus('error'),
  });

  return null;
}
