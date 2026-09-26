import { mean } from './filters';

/**
 * Lomb–Scargle periodogram for unevenly sampled series (beat-to-beat intervals are timed by the
 * beats themselves, so they are never evenly sampled). Returns power at each requested frequency.
 */
export function lombScargle(t: ArrayLike<number>, y: ArrayLike<number>, freqs: number[]): number[] {
  const n = t.length, m = mean(y);
  const yc = Array.from({ length: n }, (_, i) => y[i] - m);
  return freqs.map(f => {
    const w = 2 * Math.PI * f;
    let s2 = 0, c2 = 0;
    for (let i = 0; i < n; i++) { s2 += Math.sin(2 * w * t[i]); c2 += Math.cos(2 * w * t[i]); }
    const tau = Math.atan2(s2, c2) / (2 * w);
    let yc_c = 0, yc_s = 0, cc = 0, ss = 0;
    for (let i = 0; i < n; i++) {
      const a = w * (t[i] - tau), c = Math.cos(a), s = Math.sin(a);
      yc_c += yc[i] * c; yc_s += yc[i] * s; cc += c * c; ss += s * s;
    }
    return 0.5 * ((cc ? (yc_c * yc_c) / cc : 0) + (ss ? (yc_s * yc_s) / ss : 0));
  });
}

export type FreqHrv = {
  /** Band powers, ms². LF needs ≥ 2 min of data to be meaningful; shown as indicative only below that. */
  lf: number;
  hf: number;
  lfHf: number;
  /** Breathing rate from the respiratory sinus arrhythmia peak in the HF band, breaths/min. */
  respRate: number | null;
  lfReliable: boolean;
};

/**
 * Frequency-domain HRV (Task Force 1996 bands: LF 0.04–0.15 Hz, HF 0.15–0.4 Hz) on valid IBIs,
 * plus respiratory rate from the HF peak (RSA). `beatTimes` in s, `ibisMs` the interval ending at each beat.
 */
export function freqHrv(beatTimes: number[], ibisMs: number[]): FreqHrv | null {
  if (ibisMs.length < 20) return null;
  const df = 0.005, freqs: number[] = [];
  for (let f = 0.04; f <= 0.4 + 1e-9; f += df) freqs.push(f);
  const p = lombScargle(beatTimes, ibisMs, freqs);
  // Normalise so that the integrated spectrum equals the series variance (ms²).
  const varY = ibisMs.reduce((a, v) => a + (v - mean(ibisMs)) ** 2, 0) / (ibisMs.length - 1);
  const total = p.reduce((a, v) => a + v, 0) * df || 1;
  const k = varY / total;
  let lf = 0, hf = 0, best = -1, bestF = 0;
  freqs.forEach((f, i) => {
    const pw = p[i] * k * df;
    if (f < 0.15) lf += pw;
    else { hf += pw; if (p[i] > best) { best = p[i]; bestF = f; } }
  });
  const dur = beatTimes[beatTimes.length - 1] - beatTimes[0];
  // Accept the HF peak as breathing only if it holds a real share of the HF power (a rhythm), not
  // just the tallest spike of a flat, noisy spectrum.
  let near = 0, hfAll = 0;
  freqs.forEach((f, i) => { if (f >= 0.15) { hfAll += p[i]; if (Math.abs(f - bestF) <= 0.02) near += p[i]; } });
  const prominent = hfAll > 0 && near / hfAll >= 0.35;
  return { lf, hf, lfHf: hf ? lf / hf : NaN, respRate: prominent ? Math.round(bestF * 60 * 10) / 10 : null, lfReliable: dur >= 120 };
}

/**
 * Fraction of signal power in a narrow band around the dominant cardiac frequency (0.7–3.5 Hz),
 * relative to the whole 0.3–8 Hz band. Used to pick the best camera colour channel.
 */
export function cardiacSnr(input: ArrayLike<number>, fsIn: number): { snr: number; f0: number } {
  // Decimate to ≤ 16 Hz first: the band of interest ends at 8 Hz, and this keeps the single-bin DFTs
  // cheap enough to run on the JS thread during a live measurement.
  const step = Math.max(1, Math.floor(fsIn / 16)), fs = fsIn / step;
  const x: number[] = [];
  for (let i = 0; i + step <= input.length; i += step) { let s = 0; for (let k = 0; k < step; k++) s += input[i + k]; x.push(s / step); }
  const n = x.length, m = mean(x);
  const power = (f: number) => {
    // Goertzel-style single-bin DFT.
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { const a = (2 * Math.PI * f * i) / fs, v = x[i] - m; re += v * Math.cos(a); im -= v * Math.sin(a); }
    return re * re + im * im;
  };
  const df = Math.max(0.05, fs / n);
  let best = 0, f0 = 1;
  const band: number[] = [];
  for (let f = 0.3; f <= Math.min(8, fs / 2 - 0.1); f += df) {
    const p = power(f);
    band.push(p);
    if (f >= 0.7 && f <= 3.5 && p > best) { best = p; f0 = f; }
  }
  // Signal = fundamental ±0.1 Hz and first harmonic ±0.1 Hz.
  let sig = 0;
  for (const c of [f0, 2 * f0]) for (let f = c - 0.1; f <= c + 0.1; f += df) if (f < fs / 2) sig += power(f);
  const tot = band.reduce((a, v) => a + v, 0);
  return { snr: tot ? Math.min(1, sig / tot) : 0, f0 };
}

/**
 * Perfusion index (%) = pulsatile AC amplitude / DC level × 100, from the raw light level (not
 * negated), beat by beat between consecutive peaks. Low PI (< ~0.2% on camera PPG) means weak
 * contact, too much pressure or cold fingers.
 */
export function perfusionIndex(raw: ArrayLike<number>, peaks: number[]): number | null {
  const amps: number[] = [], dcs: number[] = [];
  for (let k = 1; k < peaks.length; k++) {
    const a = Math.round(peaks[k - 1]), b = Math.round(peaks[k]);
    let lo = Infinity, hi = -Infinity, s = 0;
    for (let i = a; i <= b; i++) { const v = raw[i]; lo = Math.min(lo, v); hi = Math.max(hi, v); s += v; }
    amps.push(hi - lo); dcs.push(s / (b - a + 1));
  }
  if (!amps.length) return null;
  const med = (v: number[]) => [...v].sort((p, q) => p - q)[v.length >> 1];
  const dc = med(dcs);
  // Inverted (camera) signals were negated for analysis; DC must be the positive light level.
  return dc ? (med(amps) / Math.abs(dc)) * 100 : null;
}
