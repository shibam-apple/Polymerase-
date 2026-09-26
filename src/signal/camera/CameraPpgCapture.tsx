import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { useCamera, useCameraPermission, useFrameOutput, CommonResolutions, type Frame } from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';
import type { PpgSample, SourceStatus } from '../sources';
import { firstLine, INITIAL_DIAG, type CameraDiag } from './diag';

/** The frame format that last delivered frames; retests start with it instead of re-probing. */
let preferredFormat: 'rgb' | 'yuv' = 'rgb';

export type CameraPpgCaptureProps = {
  active: boolean;
  onSample: (s: PpgSample) => void;
  onStatus: (s: SourceStatus) => void;
  onDiag?: (d: CameraDiag) => void;
};

/** Android: ask with the platform dialog directly (VisionCamera can report "denied" before ever asking). */
async function ensurePermission(fallback: () => Promise<boolean>): Promise<CameraDiag['permission']> {
  if (Platform.OS !== 'android') return (await fallback()) ? 'granted' : 'denied';
  const P = PermissionsAndroid.PERMISSIONS.CAMERA;
  if (await PermissionsAndroid.check(P)) return 'granted';
  const r = await PermissionsAndroid.request(P, {
    title: 'Camera for heart rate',
    message: 'Daily reads your pulse from your fingertip using the rear camera and flash. Nothing is recorded or uploaded.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return r === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
}

/**
 * Fingertip camera PPG. Rear camera + torch; the fingertip covers lens and flash. Every frame is
 * reduced to mean R, G, B over a sub-sampled centre grid (the pipeline picks the channel with the
 * strongest pulse). ~2.5 s after the torch comes on, exposure / white balance / focus are locked so
 * the camera stops "correcting away" the pulse. A covered lens gives a red, almost uniform frame:
 * red dominance + low spatial variation = finger contact.
 *
 * If RGB frames don't arrive within 2.5 s the output is recreated in YUV (luma only). Everything that
 * happens is reported through `onDiag` for the on-screen status line.
 */
export function CameraPpgCapture({ active, onSample, onStatus, onDiag }: CameraPpgCaptureProps) {
  const vcPermission = useCameraPermission();
  const [granted, setGranted] = useState(false);
  const [format, setFormat] = useState<'rgb' | 'yuv'>(preferredFormat);
  const [started, setStarted] = useState(false);
  const diag = useRef<CameraDiag>({ ...INITIAL_DIAG });
  const unit = useRef<{ scale: number; last: number | null; t0: number | null; lastReport: number }>({ scale: 0, last: null, t0: null, lastReport: 0 });

  const report = useCallback((patch: Partial<CameraDiag>) => {
    diag.current = { ...diag.current, ...patch };
    onDiag?.(diag.current);
  }, [onDiag]);

  // Session start: reset counters, ask for permission if needed.
  useEffect(() => {
    if (!active) return;
    unit.current = { scale: 0, last: null, t0: null, lastReport: 0 };
    diag.current = { ...INITIAL_DIAG, format: preferredFormat };
    onStatus('starting');
    let cancelled = false;
    ensurePermission(() => vcPermission.requestPermission())
      .then(p => {
        if (cancelled) return;
        report({ permission: p });
        setGranted(p === 'granted');
        if (p !== 'granted') onStatus('error');
      })
      .catch(e => { if (!cancelled) { report({ lastError: `permission: ${firstLine(e)}` }); onStatus('error'); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // The session started but no frames 4 s later → retry with YUV (remembered for later sessions).
  useEffect(() => {
    if (!active || !started || format === 'yuv') return;
    const id = setTimeout(() => {
      if (diag.current.frames === 0) { preferredFormat = 'yuv'; report({ format: 'yuv', lastError: 'no RGB frames after 4 s, retrying in YUV' }); setFormat('yuv'); }
    }, 4000);
    return () => clearTimeout(id);
  }, [active, started, format, report]);

  const receive = useCallback((ts: number, r: number, g: number, b: number, cv: number, fmt: string) => {
    const u = unit.current;
    // Frame timestamps are ns on Android and s on iOS; infer the unit from the first frame gap.
    if (u.last != null && u.scale === 0) {
      const d = ts - u.last;
      u.scale = d > 1e5 ? 1e-9 : d > 1 ? 1e-3 : 1;
    }
    u.last = ts;
    const d = diag.current;
    d.frames++;
    if (d.frames === 1) preferredFormat = d.format;
    if (u.scale === 0) return;
    if (u.t0 == null) u.t0 = ts;
    const t = (ts - u.t0) * u.scale;
    // Status line refreshes about once a second, not per frame.
    if (t - u.lastReport >= 1) { u.lastReport = t; report({ fps: Math.round((d.frames / Math.max(0.5, t)) * 10) / 10, pixelFormat: fmt }); }
    const contact = r > 40 && r > 1.4 * g && cv < 0.25;
    onStatus(contact ? 'running' : 'no-contact');
    onSample({ t, v: r, r, g, b, luma: 0.299 * r + 0.587 * g + 0.114 * b, contact });
  }, [onSample, onStatus, report]);

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_4_3,
    pixelFormat: format,
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
          // Planar (YUV): luma only. Reported with a synthetic red dominance so contact still works
          // (under the torch a covered lens is bright and uniform).
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
    isActive: active && granted,
    device: 'back',
    outputs: [frameOutput],
    // No declarative torchMode: VisionCamera applies it before a restarted session is running, which
    // fails ("Camera is not active") and is never retried. The torch is driven from onStarted instead.
    constraints: [{ fps: 30 }],
    onStarted: () => { report({ started: true }); setStarted(true); },
    onStopped: () => setStarted(false),
    onError: e => {
      report({ lastError: firstLine(e) });
      // A hiccup after frames are flowing isn't fatal; frames + contact decide the status from here.
      if (diag.current.frames === 0) onStatus('error');
    },
  });
  const ctrl = useRef(controller);
  useEffect(() => { ctrl.current = controller; }, [controller]);

  // Torch on once the session is running, with retries and a watchdog (interruptions and output
  // reconfigures turn it off). Exposure / white balance / focus lock 2.5 s after the torch is confirmed
  // on, once auto-exposure has converged on the lit fingertip; each lock is optional.
  useEffect(() => {
    if (!active || !granted || !started) return;
    let cancelled = false, busy = false, locked = false;
    let lockTimer: ReturnType<typeof setTimeout> | null = null;
    const wait = (ms: number) => new Promise(res => setTimeout(res, ms));
    const lock = async () => {
      const c = ctrl.current;
      if (cancelled || !c) return;
      const res: Partial<CameraDiag> = {};
      for (const [k, fn] of [['aeLocked', () => c.lockCurrentExposure()], ['awbLocked', () => c.lockCurrentWhiteBalance()], ['afLocked', () => c.lockCurrentFocus()]] as const) {
        try { await fn(); res[k] = true; } catch { res[k] = false; }
      }
      if (!cancelled) report(res);
    };
    const ensureTorch = async () => {
      if (busy) return;
      busy = true;
      let err = '';
      for (let i = 0; i < 5 && !cancelled; i++) {
        const c = ctrl.current;
        try {
          if (c) {
            await c.setTorchMode('on');
            if (c.torchMode === 'on') {
              if (!cancelled) report({ torch: 'on' });
              if (!locked) { locked = true; lockTimer = setTimeout(lock, 2500); }
              busy = false;
              return;
            }
          }
        } catch (e) { err = firstLine(e); }
        await wait(400);
      }
      if (!cancelled) report({ torch: 'failed', lastError: err ? `torch: ${err}` : 'torch did not turn on' });
      busy = false;
    };
    ensureTorch();
    const watchdog = setInterval(() => {
      const c = ctrl.current;
      if (c && c.torchMode !== 'on') ensureTorch();
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(watchdog);
      if (lockTimer) clearTimeout(lockTimer);
      ctrl.current?.setTorchMode('off').catch(() => {});
    };
  }, [active, granted, started, report]);

  return null;
}
