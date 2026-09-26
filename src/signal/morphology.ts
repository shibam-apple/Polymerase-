/**
 * Pulse-wave morphology from the ensemble-averaged beat. These are the amplitude-independent,
 * "handcrafted" features that generalise best in the PPG→BP and PPG→glucose literature (and are what
 * NeuroKit2 / pyPPG compute on finger-clip PPG), so a camera trace can be compared to public datasets.
 *
 * All times are fractions of the beat period or ms; all amplitudes are ratios, so camera exposure and
 * finger pressure (which scale the whole pulse) cancel out.
 */
export type Morphology = {
  /** Onset → systolic peak, ms and as a fraction of the beat. */
  riseTimeMs: number;
  riseFrac: number;
  /** Width of the pulse at half its height, fraction of the beat. */
  width50: number;
  /** Second-derivative (SDPPG / APG) wave ratios; aging index = (b − c − d − e) / a. */
  ba: number | null;
  ca: number | null;
  da: number | null;
  ea: number | null;
  agingIndex: number | null;
  /** Systolic-peak → diastolic-peak (or inflection) time, ms: shorter with stiffer arteries. */
  deltaTMs: number | null;
  /** Diastolic / systolic amplitude (reflection index). */
  reflectionIndex: number | null;
  /** Area after / before the dicrotic notch (inflection point area ratio). */
  ipa: number | null;
  /** Beats averaged into the template. */
  nBeats: number;
};

const N = 100;

/** Average of beats (onset → next onset) resampled to N points, normalised 0–1. */
export function averageBeat(x: ArrayLike<number>, peaks: number[], keep: (i: number) => boolean): { beat: Float64Array; periodSamples: number; n: number } | null {
  const onsets: number[] = [];
  for (let k = 0; k < peaks.length; k++) {
    // Onset = minimum in the 60% of the interval before this peak.
    const p = Math.round(peaks[k]), prev = k ? Math.round(peaks[k - 1]) : Math.max(0, p - 40);
    let lo = p, from = Math.round(p - 0.6 * (p - prev));
    for (let i = Math.max(0, from); i < p; i++) if (x[i] < x[lo]) lo = i;
    onsets.push(lo);
  }
  const acc = new Float64Array(N);
  let n = 0, periods = 0;
  for (let k = 0; k + 1 < onsets.length; k++) {
    if (!keep(k)) continue;
    const a = onsets[k], b = onsets[k + 1];
    if (b - a < 8) continue;
    let lo = Infinity, hi = -Infinity;
    for (let i = a; i <= b; i++) { lo = Math.min(lo, x[i]); hi = Math.max(hi, x[i]); }
    if (hi <= lo) continue;
    for (let j = 0; j < N; j++) {
      const pos = a + (j / (N - 1)) * (b - a), i = Math.floor(pos), f = pos - i;
      acc[j] += ((x[i] + (x[Math.min(i + 1, b)] - x[i]) * f) - lo) / (hi - lo);
    }
    n++; periods += b - a;
  }
  if (n < 3) return null;
  for (let j = 0; j < N; j++) acc[j] /= n;
  return { beat: acc, periodSamples: periods / n, n };
}

const deriv = (y: ArrayLike<number>) => { const d = new Float64Array(y.length); for (let i = 1; i < y.length - 1; i++) d[i] = (y[i + 1] - y[i - 1]) / 2; d[0] = d[1]; d[y.length - 1] = d[y.length - 2]; return d; };
const smooth = (y: ArrayLike<number>) => { const o = new Float64Array(y.length); for (let i = 0; i < y.length; i++) { let s = 0, c = 0; for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j < y.length) { s += y[j]; c++; } } o[i] = s / c; } return o; };

/** Local extrema of `y` in [from, to), alternating max/min starting with a max. */
function alternatingExtrema(y: ArrayLike<number>, from: number, to: number) {
  const out: { i: number; v: number; max: boolean }[] = [];
  for (let i = Math.max(1, from); i < Math.min(to, y.length - 1); i++) {
    const isMax = y[i] > y[i - 1] && y[i] >= y[i + 1], isMin = y[i] < y[i - 1] && y[i] <= y[i + 1];
    if (!isMax && !isMin) continue;
    const want = out.length % 2 === 0;
    if (isMax === want) out.push({ i, v: y[i], max: isMax });
  }
  return out;
}

export function morphology(x: ArrayLike<number>, peaks: number[], fs: number, beatOk: (i: number) => boolean = () => true): Morphology | null {
  const avg = averageBeat(x, peaks, beatOk);
  if (!avg) return null;
  const { beat, periodSamples, n } = avg;
  const periodMs = (periodSamples / fs) * 1000;
  let sp = 0;
  for (let j = 0; j < N * 0.6; j++) if (beat[j] > beat[sp]) sp = j;

  // Pulse width at 50% of the height.
  let l = sp, r = sp;
  while (l > 0 && beat[l] > 0.5) l--;
  while (r < N - 1 && beat[r] > 0.5) r++;

  // SDPPG: a (early max), b (min), c (max), d (min), e (max) within the first ~60% of the beat.
  const d1 = smooth(deriv(beat)), d2 = smooth(deriv(d1));
  const ex = alternatingExtrema(d2, 1, Math.round(N * 0.6));
  const [a, b, c, d, e] = ex;
  const ratio = (w?: { v: number }) => (a && w && a.v > 0 ? w.v / a.v : null);
  const agingIndex = a && b && c && d && e ? (b.v - c.v - d.v - e.v) / a.v : null;

  // Diastolic peak / inflection after the systolic peak: first local max of the pulse, or else the
  // point where the first derivative comes closest to zero (inflection) in the diastolic half.
  let dia = -1;
  for (let j = sp + 3; j < N - 3; j++) if (beat[j] > beat[j - 1] && beat[j] >= beat[j + 1]) { dia = j; break; }
  if (dia < 0) {
    let bestV = Infinity;
    for (let j = sp + 5; j < Math.round(N * 0.85); j++) if (d1[j] < 0 && -d1[j] < bestV && d1[j - 1] < d1[j] && d1[j] >= d1[j + 1]) { bestV = -d1[j]; dia = j; }
  }
  // Dicrotic notch = minimum between systolic and diastolic peaks.
  let notch = -1;
  if (dia > sp) { notch = sp; for (let j = sp; j < dia; j++) if (beat[j] < beat[notch]) notch = j; }
  let areaSys = 0, areaDia = 0;
  if (notch > 0) for (let j = 0; j < N; j++) { if (j < notch) areaSys += beat[j]; else areaDia += beat[j]; }

  return {
    riseTimeMs: (sp / (N - 1)) * periodMs,
    riseFrac: sp / (N - 1),
    width50: (r - l) / (N - 1),
    ba: ratio(b), ca: ratio(c), da: ratio(d), ea: ratio(e), agingIndex,
    deltaTMs: dia > sp ? ((dia - sp) / (N - 1)) * periodMs : null,
    reflectionIndex: dia > sp ? beat[dia] / beat[sp] : null,
    ipa: notch > 0 && areaSys > 0 ? areaDia / areaSys : null,
    nBeats: n,
  };
}
