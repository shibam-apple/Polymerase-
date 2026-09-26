import { mean } from './filters';

/**
 * Template-matching signal quality index (Orphanidou et al. 2015, as used in NeuroKit2's
 * `ppg_quality(method="templatematch")`): every beat is resampled to a fixed length and
 * correlated with the average beat. Clean PPG scores > 0.9; motion artefact drops it fast.
 */
export function templateSqi(x: ArrayLike<number>, peaks: number[], fs: number): number {
  if (peaks.length < 4) return 0;
  const q = beatSqis(x, peaks, fs).filter(v => !Number.isNaN(v));
  return q.length >= 3 ? mean(q.map(v => Math.max(0, v))) : 0;
}

export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export type Quality = 'good' | 'fair' | 'poor';
export function grade(sqi: number, validFraction: number): Quality {
  if (sqi >= 0.9 && validFraction >= 0.85) return 'good';
  if (sqi >= 0.75 && validFraction >= 0.7) return 'fair';
  return 'poor';
}

/**
 * Per-beat quality: each beat's correlation with the session's average beat. Lets the pipeline drop
 * individual artefacts (a twitch, a pressure change) instead of discarding the whole session.
 * Beats too close to the edges get NaN.
 */
export function beatSqis(x: ArrayLike<number>, peaks: number[], fs: number): number[] {
  const L = 32, pre = Math.round(0.3 * fs), post = Math.round(0.45 * fs);
  const beats: (Float64Array | null)[] = peaks.map(pk => {
    const p = Math.round(pk), a = p - pre, b = p + post;
    if (a < 0 || b >= x.length) return null;
    const beat = new Float64Array(L);
    for (let k = 0; k < L; k++) {
      const pos = a + (k / (L - 1)) * (b - a), i = Math.floor(pos), f = pos - i;
      beat[k] = x[i] + (x[Math.min(i + 1, x.length - 1)] - x[i]) * f;
    }
    return beat;
  });
  const good = beats.filter((b): b is Float64Array => b != null);
  if (good.length < 3) return peaks.map(() => NaN);
  const tpl = new Float64Array(L);
  for (const bt of good) for (let k = 0; k < L; k++) tpl[k] += bt[k] / good.length;
  return beats.map(bt => (bt ? pearson(bt, tpl) : NaN));
}
