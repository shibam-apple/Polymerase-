import { bandpass, median } from '../signal/filters';

/**
 * Ultrasonic (sonar) breathing and sleep analysis. Pure functions, run on what the native module
 * recorded: for each carrier tone, the echo demodulated to complex baseband (I/Q) at 10 Hz.
 *
 * Physics: a reflector moving by Δd changes the round-trip path by 2Δd, so the echo's phase turns by
 * 4πΔd/λ (λ ≈ 1.7 cm at 20 kHz: a 5 mm breath ≈ 3.7 rad). The received baseband is
 *     z(t) = S + A·e^{jφ(t)} + noise,
 * where S is the "static vector" (direct speaker→mic sound + walls, furniture) and the second term is
 * the echo from the chest. S hides φ, so per epoch we fit a circle to the I/Q points (Kasa least
 * squares): the chest term traces an arc around S, the fitted centre is S, and the angle around it is φ.
 * (SonarBeat — Wang et al. 2017/2021 — uses the same CW-phase idea with a median static estimate; the
 * circle-centre method is the standard CW-radar DC-offset fix.) A small speaker/mic clock mismatch
 * rotates everything slowly; the mean phase slope is removed first.
 *
 * Per 30 s epoch: breathing displacement (band-pass 0.1–0.7 Hz), its SNR, rate (autocorrelation),
 * breath-by-breath intervals and their variability, and a movement index. Then sleep/wake
 * (Cole–Kripke-style weighted activity), estimated stages, and breathing disturbances.
 */

export const FS = 10;
export const EPOCH_S = 30;
const SPEED_OF_SOUND = 343;

export type Complex = { re: Float64Array; im: Float64Array };

/** Decode the recorder's file layout: little-endian float32 records [I1,Q1,I2,Q2,…] per 0.1 s. */
export function decodeRecords(bytes: Uint8Array, tones: number): Complex[] {
  const n = Math.floor(bytes.byteLength / (8 * tones));
  const view = new DataView(bytes.buffer, bytes.byteOffset, n * 8 * tones);
  const out = Array.from({ length: tones }, () => ({ re: new Float64Array(n), im: new Float64Array(n) }));
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < tones; k++) {
      const o = (i * tones + k) * 8;
      out[k].re[i] = view.getFloat32(o, true);
      out[k].im[i] = view.getFloat32(o + 4, true);
    }
  }
  return out;
}

/** Algebraic (Kasa) least-squares circle fit. */
export function fitCircle(x: ArrayLike<number>, y: ArrayLike<number>): { cx: number; cy: number; r: number } | null {
  const n = x.length;
  if (n < 5) return null;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (let i = 0; i < n; i++) {
    const u = x[i] - mx, v = y[i] - my;
    suu += u * u; svv += v * v; suv += u * v;
    suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-18) return null;
  const a = 0.5 * (suuu + suvv), b = 0.5 * (svvv + svuu);
  const uc = (a * svv - b * suv) / det, vc = (b * suu - a * suv) / det;
  return { cx: uc + mx, cy: vc + my, r: Math.sqrt(uc * uc + vc * vc + (suu + svv) / n) };
}

const unwrap = (p: Float64Array) => {
  for (let i = 1; i < p.length; i++) {
    let d = p[i] - p[i - 1];
    while (d > Math.PI) { p[i] -= 2 * Math.PI; d -= 2 * Math.PI; }
    while (d < -Math.PI) { p[i] += 2 * Math.PI; d += 2 * Math.PI; }
  }
  return p;
};

/** Remove a slow common rotation (speaker/mic clock offset) from one epoch of baseband. */
export function derotate(z: Complex): Complex {
  const n = z.re.length, ph = new Float64Array(n);
  for (let i = 0; i < n; i++) ph[i] = Math.atan2(z.im[i], z.re[i]);
  unwrap(ph);
  const slope = n > 1 ? (ph[n - 1] - ph[0]) / (n - 1) : 0;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = -slope * i, c = Math.cos(a), s = Math.sin(a);
    re[i] = z.re[i] * c - z.im[i] * s; im[i] = z.re[i] * s + z.im[i] * c;
  }
  return { re, im };
}

/** Chest displacement (mm) for one epoch of one tone: de-rotate, fit the circle, angle around its centre. */
export function displacement(z: Complex, toneHz: number): { mm: Float64Array; radius: number; staticMag: number; echoSnr: number } | null {
  const d = derotate(z);
  const c = fitCircle(d.re, d.im);
  if (!c || !Number.isFinite(c.r)) return null;
  const n = d.re.length, ph = new Float64Array(n);
  // White-noise level from second differences (a slow breathing arc barely has any): σ² ≈ E|Δ²z|² / 6.
  let s2 = 0;
  for (let i = 2; i < n; i++) s2 += (d.re[i] - 2 * d.re[i - 1] + d.re[i - 2]) ** 2 + (d.im[i] - 2 * d.im[i - 1] + d.im[i - 2]) ** 2;
  const sigma = Math.sqrt(s2 / Math.max(1, n - 2) / 6 / 2);
  for (let i = 0; i < n; i++) ph[i] = Math.atan2(d.im[i] - c.cy, d.re[i] - c.cx);
  unwrap(ph);
  const lambdaMm = (SPEED_OF_SOUND / toneHz) * 1000, k = lambdaMm / (4 * Math.PI);
  const mm = new Float64Array(n);
  for (let i = 0; i < n; i++) mm[i] = ph[i] * k;
  return { mm, radius: c.r, staticMag: Math.hypot(c.cx, c.cy), echoSnr: sigma > 0 ? c.r / sigma : Infinity };
}

/** Share of power in the breathing band (0.1–0.7 Hz) vs 0.05–4 Hz (Goertzel bins: no trig per sample). */
export function breathingSnr(x: ArrayLike<number>, fs = FS): number {
  const n = x.length;
  // Remove the mean and linear trend (slow drift would otherwise leak into every low bin).
  let mt = 0, mx = 0;
  for (let i = 0; i < n; i++) { mt += i; mx += x[i]; }
  mt /= n; mx /= n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - mt) * (x[i] - mx); den += (i - mt) ** 2; }
  const slope = den ? num / den : 0;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = x[i] - mx - slope * (i - mt);
  let inBand = 0, total = 0;
  // Every bin inside the breathing band (a breath between two bins would otherwise vanish); outside
  // it every third bin, weighted ×3 — the total only needs to be approximate.
  const df = fs / n;
  for (let b = Math.ceil(0.05 / df); b * df <= 4; ) {
    const f = b * df, band = f >= 0.1 && f <= 0.7;
    const coeff = 2 * Math.cos((2 * Math.PI * f) / fs);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < n; i++) { const s0 = y[i] + coeff * s1 - s2; s2 = s1; s1 = s0; }
    const p = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    const near = f <= 0.75;
    total += near ? p : 3 * p;
    if (band) inBand += p;
    b += near ? 1 : 3;
  }
  return total ? inBand / total : 0;
}

/** Breathing rate (breaths/min) from the autocorrelation peak of a band-passed displacement. */
export function acfRate(x: ArrayLike<number>, fs = FS): { rate: number; strength: number } | null {
  const n = x.length, minLag = Math.round(fs * 60 / 42), maxLag = Math.min(n - 2, Math.round(fs * 10));
  let e0 = 0;
  for (let i = 0; i < n; i++) e0 += x[i] * x[i];
  if (!e0) return null;
  const acf = (L: number) => { let s = 0; for (let i = 0; i + L < n; i++) s += x[i] * x[i + L]; return s / e0; };
  // The first local maximum after the first zero crossing: robust to harmonics.
  let L = minLag;
  while (L < maxLag && acf(L) > 0) L++;
  let best = -1, bestL = 0;
  for (; L <= maxLag; L++) { const v = acf(L); if (v > best) { best = v; bestL = L; } }
  if (bestL === 0 || best < 0.2) return null;
  // Parabolic refinement of the lag.
  const y0 = acf(bestL - 1), y1 = best, y2 = acf(bestL + 1), den = y0 - 2 * y1 + y2;
  const lag = den ? bestL + (0.5 * (y0 - y2)) / den : bestL;
  return { rate: (60 * fs) / lag, strength: best };
}

/** Breath-to-breath intervals (s) from inhalation peaks of a band-passed displacement. */
export function breathIntervals(x: ArrayLike<number>, fs = FS): number[] {
  const n = x.length, minGap = Math.round(fs * 60 / 42);
  let sd = 0;
  for (let i = 0; i < n; i++) sd += x[i] * x[i];
  sd = Math.sqrt(sd / Math.max(1, n));
  const peaks: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > 0.3 * sd) {
      if (peaks.length && i - peaks[peaks.length - 1] < minGap) { if (x[i] > x[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i; }
      else peaks.push(i);
    }
  }
  return peaks.slice(1).map((p, k) => (p - peaks[k]) / fs);
}

export type Epoch = {
  /** Seconds since the start of the night. */
  t: number;
  /** Tone used (index), breathing SNR, rate, breath interval CV, breathing amplitude (mm RMS). */
  tone: number; snr: number; rate: number | null; cv: number | null; ampMm: number;
  /** Movement: RMS of the baseband step size relative to the echo radius (≫ 1 when you move). */
  motion: number;
  /** Chest-echo radius over the noise level: low when nobody is in front of the phone. */
  echoSnr: number;
  present: boolean;
};

/** Epoch features plus the chosen tone's band-passed breathing (mm) for each epoch. */
function epochsWithBreathing(tones: Complex[], toneHz: number[], fs = FS): { ep: Epoch[]; bp: Float64Array[] } {
  const len = EPOCH_S * fs, n = Math.min(...tones.map(t => t.re.length));
  const ep: Epoch[] = [], bps: Float64Array[] = [];
  for (let s = 0; s + len <= n; s += len) {
    // Pick the tone with the cleanest breathing first; band-pass only that one.
    let best: { k: number; mm: Float64Array; snr: number; radius: number; echoSnr: number } | null = null;
    for (let k = 0; k < tones.length; k++) {
      const d = displacement({ re: tones[k].re.subarray(s, s + len), im: tones[k].im.subarray(s, s + len) }, toneHz[k]);
      if (!d) continue;
      const snr = breathingSnr(d.mm, fs);
      if (!best || snr > best.snr) best = { k, mm: d.mm, snr, radius: d.radius, echoSnr: d.echoSnr };
    }
    if (!best) { bps.push(new Float64Array(len)); ep.push({ t: s / fs, tone: 0, snr: 0, rate: null, cv: null, ampMm: 0, motion: 0, echoSnr: 0, present: false }); continue; }
    const z = tones[best.k];
    let step = 0;
    for (let i = s + 1; i < s + len; i++) step += (z.re[i] - z.re[i - 1]) ** 2 + (z.im[i] - z.im[i - 1]) ** 2;
    const motion = Math.sqrt(step / (len - 1)) / Math.max(1e-12, best.radius);
    const bp = bandpass(best.mm, fs, 0.1, 0.7);
    let amp = 0;
    for (let i = 0; i < len; i++) amp += bp[i] * bp[i];
    const ampMm = Math.sqrt(amp / len);
    const r = acfRate(bp, fs);
    const iv = breathIntervals(bp, fs);
    const mean = iv.length ? iv.reduce((x, y) => x + y, 0) / iv.length : 0;
    const cv = iv.length >= 3 ? Math.sqrt(iv.reduce((x, v) => x + (v - mean) ** 2, 0) / (iv.length - 1)) / mean : null;
    const present = best.snr >= 0.35 && r != null && ampMm >= 0.2 && best.echoSnr >= 4;
    ep.push({ t: s / fs, tone: best.k, snr: best.snr, rate: present && r ? Math.round(r.rate * 10) / 10 : null, cv: present ? cv : null, ampMm, motion, echoSnr: best.echoSnr, present });
    bps.push(bp);
  }
  return { ep, bp: bps };
}

/** Epoch features for the whole night, picking per epoch the tone with the cleanest breathing. */
export function epochs(tones: Complex[], toneHz: number[], fs = FS): Epoch[] {
  return epochsWithBreathing(tones, toneHz, fs).ep;
}

export type Stage = 'out' | 'wake' | 'light' | 'deep' | 'rem';
export type NightSummary = {
  start: number;
  minutes: number;
  onsetMin: number | null;
  asleepMin: number;
  wakeups: number;
  stages: Stage[];
  minutesBy: Record<Stage, number>;
  rate: { avg: number; min: number; max: number } | null;
  events: { apnea: number; hypopnea: number; perHour: number };
  /** Fraction of in-bed epochs with a clean breathing signal. */
  coverage: number;
};

/** Cole–Kripke weights (1-min epochs) applied to the epoch activity; wake where the score ≥ 1. */
const CK = [1.06, 0.54, 0.58, 0.76, 2.3, 0.74, 0.67];

export function sleepWake(ep: Epoch[]): boolean[] {
  const med = median(ep.map(e => e.motion).filter(Number.isFinite)) || 1;
  const act = ep.map(e => Math.min(10, Math.max(0, e.motion / med - 1.5)));
  // A single epoch with activity ≥ 2 (i.e. motion ≥ 3.5× the night's typical) scores as wake.
  const P = 1 / (CK[4] * 2);
  return ep.map((e, i) => {
    if (!e.present && act[i] === 0) return true; // no one breathing in front of the phone
    let d = 0;
    for (let k = 0; k < CK.length; k++) { const j = i + k - 4; if (j >= 0 && j < act.length) d += CK[k] * act[j]; }
    return P * d >= 1;
  });
}

const tercile = (v: number[], q: number) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

/** Estimated stages from wake flags and breathing regularity (deep: steady, REM: irregular, motionless). */
export function stages(ep: Epoch[], wake: boolean[]): Stage[] {
  const n = ep.length, per = 60 / EPOCH_S;
  // Sleep onset: the first run of ≥ 10 min of sleep.
  let onset = -1;
  for (let i = 0; i + 10 * per <= n && onset < 0; i++) if (wake.slice(i, i + 10 * per).every(w => !w)) onset = i;
  const cvs = ep.filter((e, i) => !wake[i] && e.cv != null).map(e => e.cv!);
  const lo = cvs.length >= 6 ? tercile(cvs, 1 / 3) : -Infinity, hi = cvs.length >= 6 ? tercile(cvs, 2 / 3) : Infinity;
  const raw: Stage[] = ep.map((e, i) => {
    if (wake[i]) return !e.present ? 'out' : 'wake';
    if (onset < 0 || i < onset) return 'wake';
    const stillFor = (m: number) => wake.slice(Math.max(0, i - m * per), i + 1).every(w => !w);
    if (e.cv != null && e.cv <= lo && stillFor(5)) return 'deep';
    if (e.cv != null && e.cv >= hi && i - onset >= 60 * per) return 'rem';
    return 'light';
  });
  // 3-epoch mode filter to remove single-epoch flicker (never over wake/out).
  return raw.map((s, i) => {
    if (s === 'wake' || s === 'out' || i === 0 || i === n - 1) return s;
    return raw[i - 1] === raw[i + 1] && raw[i - 1] !== 'wake' && raw[i - 1] !== 'out' ? raw[i - 1] : s;
  });
}

/**
 * Breathing disturbances: the breathing envelope (4 s RMS) drops ≥ 90% (apnea-like) or 30–90%
 * (hypopnea-like) against the previous 2 min median for ≥ 10 s, during sleep and not while moving.
 */
export function disturbances(bp: Float64Array, asleep: (sec: number) => boolean, fs = FS): { apnea: number; hypopnea: number } {
  const w = 4 * fs, env: number[] = [];
  for (let i = 0; i + w <= bp.length; i += fs) {
    let s = 0;
    for (let k = i; k < i + w; k++) s += bp[k] * bp[k];
    env.push(Math.sqrt(s / w));
  }
  let apnea = 0, hypopnea = 0, run = 0, deepest = 1;
  const flush = () => { if (run >= 10) { if (deepest <= 0.1) apnea++; else hypopnea++; } run = 0; deepest = 1; };
  let base = 0;
  for (let sec = 120; sec < env.length; sec++) {
    // The 2-min baseline, refreshed every 10 s (a moving median per second is needlessly slow).
    if (sec % 10 === 0 || sec === 120) base = median(env.slice(sec - 120, sec - 10));
    const ratio = base > 0 ? env[sec] / base : 1;
    if (ratio <= 0.7 && asleep(sec)) { run++; deepest = Math.min(deepest, ratio); }
    else flush();
  }
  flush();
  return { apnea, hypopnea };
}

/** Everything for one night. `tones` from `decodeRecords`, `toneHz` the carrier frequencies. */
export function analyseNight(tones: Complex[], toneHz: number[], start: number, fs = FS): NightSummary {
  const { ep, bp } = epochsWithBreathing(tones, toneHz, fs);
  return summarise(ep, bp, start, fs);
}

/**
 * The same, in chunks of epochs with a yield in between, so the phone's UI stays responsive while a
 * night (≈ 1,000 epochs × 3 tones) is analysed. `onProgress` gets 0–1.
 */
export async function analyseNightAsync(tones: Complex[], toneHz: number[], start: number, onProgress?: (p: number) => void, fs = FS): Promise<NightSummary> {
  const len = EPOCH_S * fs, n = Math.min(...tones.map(t => t.re.length)), total = Math.floor(n / len);
  const ep: Epoch[] = [], bp: Float64Array[] = [];
  for (let e0 = 0; e0 < total; e0 += 40) {
    const e1 = Math.min(total, e0 + 40);
    const part = epochsWithBreathing(tones.map(t => ({ re: t.re.subarray(e0 * len, e1 * len), im: t.im.subarray(e0 * len, e1 * len) })), toneHz, fs);
    part.ep.forEach(e => ep.push({ ...e, t: e.t + e0 * EPOCH_S }));
    bp.push(...part.bp);
    onProgress?.(e1 / total);
    await new Promise(r => setTimeout(r, 0));
  }
  return summarise(ep, bp, start, fs);
}

function summarise(ep: Epoch[], bp: Float64Array[], start: number, fs: number): NightSummary {
  const wake = sleepWake(ep);
  const st = stages(ep, wake);
  const per = 60 / EPOCH_S;
  const minutesBy: Record<Stage, number> = { out: 0, wake: 0, light: 0, deep: 0, rem: 0 };
  st.forEach(s => { minutesBy[s] += EPOCH_S / 60; });
  const onsetIdx = st.findIndex(s => s === 'light' || s === 'deep' || s === 'rem');
  let wakeups = 0;
  for (let i = Math.max(1, onsetIdx); i < st.length; i++) {
    // A wake-up is a wake bout of ≥ 2 epochs (1 min) after sleep onset.
    if ((st[i] === 'wake' || st[i] === 'out') && st[i - 1] !== 'wake' && st[i - 1] !== 'out' && (st[i + 1] === 'wake' || st[i + 1] === 'out')) wakeups++;
  }
  const rates = ep.filter((e, i) => e.rate != null && st[i] !== 'wake' && st[i] !== 'out').map(e => e.rate!);
  // Disturbances on the night's breathing trace (each epoch's best tone, stitched).
  const len = EPOCH_S * fs, whole = new Float64Array(bp.length * len);
  bp.forEach((x, i) => whole.set(x, i * len));
  const asleepMin = minutesBy.light + minutesBy.deep + minutesBy.rem;
  const ev = disturbances(whole, sec => { const s = st[Math.floor(sec / EPOCH_S)]; return s === 'light' || s === 'deep' || s === 'rem'; }, fs);
  const inBed = ep.filter((_, i) => st[i] !== 'out').length;
  return {
    start,
    minutes: (ep.length * EPOCH_S) / 60,
    onsetMin: onsetIdx >= 0 ? onsetIdx / per : null,
    asleepMin,
    wakeups,
    stages: st,
    minutesBy,
    rate: rates.length ? { avg: Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10, min: Math.round(Math.min(...rates)), max: Math.round(Math.max(...rates)) } : null,
    events: { ...ev, perHour: asleepMin ? Math.round(((ev.apnea + ev.hypopnea) / (asleepMin / 60)) * 10) / 10 : 0 },
    coverage: inBed ? ep.filter((e, i) => st[i] !== 'out' && e.present).length / inBed : 0,
  };
}

/** Live view for the setup check: the last `seconds` of the best tone's breathing, and its rate. */
export function liveBreathing(tones: Complex[], toneHz: number[], fs = FS): { wave: number[]; rate: number | null; snr: number; tone: number } | null {
  let best: { wave: Float64Array; snr: number; tone: number } | null = null;
  for (let k = 0; k < tones.length; k++) {
    if (tones[k].re.length < fs * 12) return null;
    const d = displacement(tones[k], toneHz[k]);
    if (!d) continue;
    const snr = breathingSnr(d.mm, fs);
    if (!best || snr > best.snr) best = { wave: bandpass(d.mm, fs, 0.1, 0.7), snr, tone: k };
  }
  if (!best) return null;
  const r = acfRate(best.wave, fs);
  return { wave: Array.from(best.wave), rate: r && best.snr >= 0.35 ? Math.round(r.rate) : null, snr: best.snr, tone: best.tone };
}
