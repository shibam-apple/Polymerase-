import { mean, movingAverage } from './filters';

/**
 * Systolic peak detection after Elgendi et al. (2013), "Systolic Peak Detection in Acceleration
 * Photoplethysmograms…", PLoS ONE 8(10): e76585. Same parameters as NeuroKit2's default
 * `ppg_findpeaks(method="elgendi")` (MIT-licensed reference implementation).
 *
 * Returns fractional sample indices: each peak is refined with parabolic interpolation, which
 * matters for HRV at camera frame rates (1 sample = 33 ms at 30 fps).
 */
export function elgendiPeaks(
  signal: ArrayLike<number>,
  fs: number,
  { peakWindow = 0.111, beatWindow = 0.667, beatOffset = 0.02, minDelay = 0.3 } = {},
): number[] {
  const n = signal.length;
  if (n < fs) return [];
  const sq = new Float64Array(n);
  for (let i = 0; i < n; i++) sq[i] = signal[i] > 0 ? signal[i] * signal[i] : 0;

  const pw = Math.round(peakWindow * fs), bw = Math.round(beatWindow * fs);
  const maPeak = movingAverage(sq, pw), maBeat = movingAverage(sq, bw);
  const thr = beatOffset * mean(sq), minGap = minDelay * fs;

  const peaks: number[] = [];
  let i = 0;
  while (i < n) {
    if (maPeak[i] > maBeat[i] + thr) {
      const beg = i;
      while (i < n && maPeak[i] > maBeat[i] + thr) i++;
      const end = i;
      if (end - beg < pw) continue;
      let best = beg;
      for (let k = beg + 1; k < end; k++) if (signal[k] > signal[best]) best = k;
      const last = peaks[peaks.length - 1];
      if (last != null && best - last < minGap) {
        if (signal[best] > signal[Math.round(last)]) peaks[peaks.length - 1] = best;
      } else peaks.push(best);
    } else i++;
  }
  return peaks.map(p => refinePeak(signal, p));
}

/** Sub-sample peak location from a parabola through (p-1, p, p+1). */
export function refinePeak(x: ArrayLike<number>, p: number): number {
  if (p <= 0 || p >= x.length - 1) return p;
  const a = x[p - 1], b = x[p], c = x[p + 1], d = a - 2 * b + c;
  if (d >= 0) return p;
  const off = (0.5 * (a - c)) / d;
  return Math.abs(off) <= 1 ? p + off : p;
}
