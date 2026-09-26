import { lombScargle } from './spectral';

/**
 * Breathing rate from a fingertip PPG by "smart fusion" (Karlen et al. 2013, IEEE Trans Biomed Eng).
 * Breathing modulates the pulse in three ways, each sampled once per beat:
 *  - RIFV  frequency: beat-to-beat intervals (respiratory sinus arrhythmia)
 *  - RIAV  amplitude: pulse height (stroke volume changes with intrathoracic pressure)
 *  - RIIV  intensity: the baseline under each beat (venous return)
 * Each series gets a Lomb–Scargle spectrum over 0.1–0.5 Hz (6–30 breaths/min); its peak is an estimate
 * if it holds a clear share of the band's power. The rate is reported only when at least two estimates
 * agree (SD ≤ 4 breaths/min); otherwise null, rather than a guess.
 */
export type RespEstimate = { source: 'rifv' | 'riav' | 'riiv'; rate: number; share: number };
export type RespResult = { rate: number | null; estimates: RespEstimate[] };

const F_LO = 0.1, F_HI = 0.5, DF = 0.005;

/** Dominant breathing-band frequency of a beat-sampled series, with the share of band power near it. */
export function bandPeak(t: number[], y: number[]): { f: number; share: number } | null {
  if (t.length < 12 || t[t.length - 1] - t[0] < 20) return null;
  const freqs: number[] = [];
  for (let f = F_LO; f <= F_HI + 1e-9; f += DF) freqs.push(f);
  // Remove a linear trend first so slow drift doesn't pile power at the bottom of the band.
  const n = t.length, mt = t.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (t[i] - mt) * (y[i] - my); den += (t[i] - mt) ** 2; }
  const slope = den ? num / den : 0;
  const yd = y.map((v, i) => v - my - slope * (t[i] - mt));
  const p = lombScargle(t, yd, freqs);
  let best = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
  const total = p.reduce((a, v) => a + v, 0);
  if (!total) return null;
  let near = 0;
  freqs.forEach((f, i) => { if (Math.abs(f - freqs[best]) <= 0.02) near += p[i]; });
  return { f: freqs[best], share: near / total };
}

export function fuseRespiration(series: { source: RespEstimate['source']; t: number[]; y: number[] }[], minShare = 0.3, maxSd = 4): RespResult {
  const estimates: RespEstimate[] = [];
  for (const s of series) {
    const pk = bandPeak(s.t, s.y);
    if (pk && pk.share >= minShare) estimates.push({ source: s.source, rate: Math.round(pk.f * 60 * 10) / 10, share: Math.round(pk.share * 100) / 100 });
  }
  if (estimates.length < 2) return { rate: null, estimates };
  const r = estimates.map(e => e.rate), m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, v) => a + (v - m) ** 2, 0) / (r.length - 1));
  if (sd <= maxSd) return { rate: Math.round(m), estimates };
  // Two of three can still agree when one modulation is swamped by noise.
  if (estimates.length === 3) {
    for (let i = 0; i < 3; i++) {
      const pair = estimates.filter((_, k) => k !== i);
      if (Math.abs(pair[0].rate - pair[1].rate) <= maxSd * Math.SQRT2) return { rate: Math.round((pair[0].rate + pair[1].rate) / 2), estimates };
    }
  }
  return { rate: null, estimates };
}

/**
 * Build the three beat-sampled series from a cleaned (band-passed) PPG, the pre-filter signal and the
 * detected peaks (sample positions, possibly fractional), then fuse. `validIbi[k]` says whether the interval ending at peak
 * k+1 survived artefact rejection; beats touching a rejected interval are left out.
 */
export function respirationFromPpg(clean: ArrayLike<number>, raw: ArrayLike<number>, peaks: number[], fs: number, validIbi: boolean[]): RespResult {
  const tF: number[] = [], yF: number[] = [], tA: number[] = [], yA: number[] = [], tI: number[] = [], yI: number[] = [];
  for (let k = 1; k < peaks.length; k++) {
    if (!validIbi[k - 1]) continue;
    // Peaks are sub-sample positions; index the waveforms at the nearest sample.
    const a = Math.round(peaks[k - 1]), b = Math.min(clean.length - 1, Math.round(peaks[k]));
    if (b <= a) continue;
    let trough = Infinity, sum = 0;
    for (let i = a; i < b; i++) { trough = Math.min(trough, clean[i]); sum += raw[i]; }
    const t = peaks[k] / fs;
    tF.push(t); yF.push(((peaks[k] - peaks[k - 1]) / fs) * 1000);
    tA.push(t); yA.push(clean[b] - trough);
    tI.push(t); yI.push(sum / (b - a));
  }
  return fuseRespiration([{ source: 'rifv', t: tF, y: yF }, { source: 'riav', t: tA, y: yA }, { source: 'riiv', t: tI, y: yI }]);
}
