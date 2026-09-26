import { mean, median, std } from './filters';

export type Ibi = { ms: number; valid: boolean };

/**
 * Artefact rejection on inter-beat intervals, in three passes:
 *  1. physiological range (300–2000 ms, i.e. 30–200 bpm);
 *  2. deviation > `tol` from the local median of neighbouring beats (missed / extra peaks);
 *  3. adaptive thresholds after Lipponen & Tarvainen (2019, J Med Eng Technol): the threshold is 5.2 ×
 *     the quartile deviation of the recent successive differences, so it scales with the person's own
 *     variability. An interval is rejected if it sits beyond it from the local median, or if it is one
 *     half of an ectopic pattern (a large jump immediately reversed).
 */
export function cleanIbis(ibisMs: number[], tol = 0.2, halfWindow = 3): Ibi[] {
  const first = ibisMs.map((ms, i) => {
    if (ms < 300 || ms > 2000) return { ms, valid: false };
    const lo = Math.max(0, i - halfWindow), hi = Math.min(ibisMs.length, i + halfWindow + 1);
    const neigh = ibisMs.slice(lo, hi).filter((v, k) => lo + k !== i && v >= 300 && v <= 2000);
    const ref = neigh.length ? median(neigh) : ms;
    return { ms, valid: Math.abs(ms - ref) / ref <= tol };
  });
  const bad = adaptiveArtefacts(first.map(b => (b.valid ? b.ms : NaN)));
  return first.map((b, i) => (b.valid && bad[i] ? { ...b, valid: false } : b));
}

const quartileDev = (v: number[]) => {
  if (v.length < 4) return NaN;
  const s = [...v].sort((a, b) => a - b), q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  return (q(0.75) - q(0.25)) / 2;
};

/** Pass 3 of `cleanIbis`: `true` where an interval is an artefact. NaN entries are already rejected. */
export function adaptiveArtefacts(rr: number[], win = 91, k = 5.2, minThMs = 40): boolean[] {
  const n = rr.length, out = new Array<boolean>(n).fill(false);
  if (n < 8) return out;
  const d = rr.map((v, i) => (i && Number.isFinite(v) && Number.isFinite(rr[i - 1]) ? v - rr[i - 1] : NaN));
  const around = (arr: number[], i: number, half: number) => arr.slice(Math.max(0, i - half), Math.min(n, i + half + 1)).filter(Number.isFinite);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(rr[i])) continue;
    const th = Math.max(minThMs, k * (quartileDev(around(d, i, win >> 1)) || 0));
    const local = around(rr, i, 5);
    const mRR = rr[i] - median(local);
    const jumpIn = d[i], jumpOut = i + 1 < n ? d[i + 1] : NaN;
    const ectopic = Number.isFinite(jumpIn) && Number.isFinite(jumpOut) && Math.abs(jumpIn) > th && Math.abs(jumpOut) > th && Math.sign(jumpIn) !== Math.sign(jumpOut);
    if (Math.abs(mRR) > th || ectopic) out[i] = true;
  }
  return out;
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
