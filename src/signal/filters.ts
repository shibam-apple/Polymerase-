/**
 * Signal conditioning for PPG. Mirrors NeuroKit2's `ppg_clean(method="elgendi")`:
 * a Butterworth band-pass (0.5–8 Hz) applied forward and backward (zero phase).
 */

export type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

/** RBJ-cookbook 2nd-order Butterworth sections (Q = 1/√2). */
export function lowpass(fc: number, fs: number): Biquad {
  const w = (2 * Math.PI * fc) / fs, c = Math.cos(w), al = Math.sin(w) / Math.SQRT2, a0 = 1 + al;
  return { b0: (1 - c) / 2 / a0, b1: (1 - c) / a0, b2: (1 - c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - al) / a0 };
}

export function highpass(fc: number, fs: number): Biquad {
  const w = (2 * Math.PI * fc) / fs, c = Math.cos(w), al = Math.sin(w) / Math.SQRT2, a0 = 1 + al;
  return { b0: (1 + c) / 2 / a0, b1: -(1 + c) / a0, b2: (1 + c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - al) / a0 };
}

export function applyBiquad(x: ArrayLike<number>, q: Biquad): Float64Array {
  const y = new Float64Array(x.length);
  // Initialise state at the first sample's steady state to avoid a start-up transient.
  let x1 = x[0] ?? 0, x2 = x1;
  const dc = (q.b0 + q.b1 + q.b2) / (1 + q.a1 + q.a2);
  let y1 = x1 * dc, y2 = y1;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i], yi = q.b0 * xi + q.b1 * x1 + q.b2 * x2 - q.a1 * y1 - q.a2 * y2;
    y[i] = yi; x2 = x1; x1 = xi; y2 = y1; y1 = yi;
  }
  return y;
}

/** Zero-phase filtering: run the cascade forward, reverse, run again, reverse. */
export function filtfilt(x: ArrayLike<number>, sections: Biquad[]): Float64Array {
  let y: Float64Array = Float64Array.from(x as ArrayLike<number>);
  for (const s of sections) y = applyBiquad(y, s);
  y.reverse();
  for (const s of sections) y = applyBiquad(y, s);
  y.reverse();
  return y;
}

export function bandpass(x: ArrayLike<number>, fs: number, lo = 0.5, hi = 8): Float64Array {
  const top = Math.min(hi, fs * 0.45);
  return filtfilt(x, [highpass(lo, fs), highpass(lo, fs), lowpass(top, fs), lowpass(top, fs)]);
}

/** Centered boxcar moving average (NeuroKit2 `signal_smooth(kernel="boxcar")`). */
export function movingAverage(x: ArrayLike<number>, win: number): Float64Array {
  const n = x.length, w = Math.max(1, Math.round(win)), half = Math.floor(w / 2);
  const cs = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + x[i];
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half), b = Math.min(n, i - half + w);
    y[i] = (cs[b] - cs[a]) / (b - a);
  }
  return y;
}

/**
 * Resample irregular samples (camera frame timestamps jitter) onto a uniform grid by linear
 * interpolation. `t` in seconds, strictly increasing.
 */
export function resampleUniform(t: ArrayLike<number>, x: ArrayLike<number>, fs: number): { t0: number; y: Float64Array } {
  const n = t.length;
  if (n < 2) return { t0: t[0] ?? 0, y: Float64Array.from(x as ArrayLike<number>) };
  const t0 = t[0], dur = t[n - 1] - t0, m = Math.floor(dur * fs) + 1, y = new Float64Array(m);
  let j = 0;
  for (let i = 0; i < m; i++) {
    const ti = t0 + i / fs;
    while (j < n - 2 && t[j + 1] < ti) j++;
    const span = t[j + 1] - t[j], f = span > 0 ? (ti - t[j]) / span : 0;
    y[i] = x[j] + (x[j + 1] - x[j]) * Math.min(1, Math.max(0, f));
  }
  return { t0, y };
}

export const mean = (x: ArrayLike<number>) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i]; return x.length ? s / x.length : 0; };
export const std = (x: ArrayLike<number>) => { const m = mean(x); let s = 0; for (let i = 0; i < x.length; i++) s += (x[i] - m) ** 2; return x.length > 1 ? Math.sqrt(s / (x.length - 1)) : 0; };
export const median = (x: ArrayLike<number>) => {
  if (!x.length) return NaN;
  const s = Array.from(x).sort((a, b) => a - b), h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
