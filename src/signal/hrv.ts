import { mean, median, std } from './filters';

export type Ibi = { ms: number; valid: boolean };

/**
 * Artefact rejection on inter-beat intervals: physiological range (300–2000 ms, i.e. 30–200 bpm)
 * and deviation > `tol` from the local median of neighbouring beats (ectopics, missed/extra peaks).
 */
export function cleanIbis(ibisMs: number[], tol = 0.2, halfWindow = 3): Ibi[] {
  return ibisMs.map((ms, i) => {
    if (ms < 300 || ms > 2000) return { ms, valid: false };
    const lo = Math.max(0, i - halfWindow), hi = Math.min(ibisMs.length, i + halfWindow + 1);
    const neigh = ibisMs.slice(lo, hi).filter((v, k) => lo + k !== i && v >= 300 && v <= 2000);
    const ref = neigh.length ? median(neigh) : ms;
    return { ms, valid: Math.abs(ms - ref) / ref <= tol };
  });
}

export type HrvMetrics = {
  /** Mean heart rate from the median valid IBI, bpm. */
  hr: number;
  /** Root mean square of successive differences, ms (short-term / vagal HRV). */
  rmssd: number;
  sdnn: number;
  pnn50: number;
  /** Poincaré plot descriptors, ms. */
  sd1: number;
  sd2: number;
  nValid: number;
  validFraction: number;
};

export function hrvFromIbis(ibis: Ibi[]): HrvMetrics | null {
  const valid = ibis.filter(b => b.valid).map(b => b.ms);
  if (valid.length < 3) return null;
  // Successive differences only across pairs of adjacent, both-valid beats.
  const diffs: number[] = [];
  for (let i = 1; i < ibis.length; i++) if (ibis[i].valid && ibis[i - 1].valid) diffs.push(ibis[i].ms - ibis[i - 1].ms);
  const rmssd = diffs.length ? Math.sqrt(mean(diffs.map(d => d * d))) : NaN;
  const sdnn = std(valid);
  const sd1 = diffs.length > 1 ? std(diffs) / Math.SQRT2 : NaN;
  const sd2 = Math.sqrt(Math.max(0, 2 * sdnn * sdnn - sd1 * sd1));
  return {
    hr: 60000 / median(valid),
    rmssd, sdnn, sd1, sd2,
    pnn50: diffs.length ? diffs.filter(d => Math.abs(d) > 50).length / diffs.length : NaN,
    nValid: valid.length,
    validFraction: valid.length / ibis.length,
  };
}
