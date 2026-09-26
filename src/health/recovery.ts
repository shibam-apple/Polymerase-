/**
 * Recovery score (0–100) and tomorrow's forecast from the user's own history. Pure functions.
 *
 * Components (points):
 *   HRV        40  today's morning ln(RMSSD) vs your baseline (Bayesian, up to 60 prior days; band = mean ± ½ SD)
 *   Resting HR 20  today's resting HR vs its 30-day baseline (higher = worse)
 *   Sleep      25  last night's hours vs target, scaled by self-rated quality
 *   Adherence   5  meds + habits due so far that are done
 *   (Load      10  not tracked yet: excluded, and the score is renormalised to the available max)
 * A component with no data today is left out and the rest are renormalised, so a missing sleep log
 * doesn't read as bad sleep.
 *
 * Baselines are Bayesian (normal–normal model): your usual level starts at a population prior
 * (age-expected ln RMSSD, typical resting HR, with the between-person spread) and is updated by each
 * morning, weighted by the typical day-to-day variation. Today is z-scored against the posterior
 * predictive spread (day-to-day variation + remaining uncertainty about your usual level). So there is
 * a (provisional) score from the very first morning, and it is fully personal within about a week.
 */

export type DayInput = { date: string; lnRmssd?: number; rhr?: number; sleepH?: number; sleepQ?: number; adherence?: number };
export type Part = { key: 'hrv' | 'rhr' | 'sleep' | 'adherence'; pts: number; max: number; note: string };
export type Recovery = {
  status: 'ok' | 'provisional' | 'needs-data';
  score: number | null;
  parts: Part[];
  /** Mornings with HRV before today (baseline size). */
  baselineDays: number;
  /** Normal RMSSD band (ms): population-based at first, personal as mornings accumulate. */
  band: [number, number] | null;
  label: string;
};
export type Forecast = { score: number; lo: number; hi: number; basis: number } | null;

/** Mornings before the score counts as personal rather than provisional. */
export const PERSONAL_AFTER = 7;
/** Weight of the default day-to-day SD when estimating yours, in "mornings". */
export const PRIOR_K = 4;
export type Prior = {
  lnRmssd: number; rhr: number;
  /** Between-person spread of the usual level (how unsure we are about you before any data). */
  lnRmssdSd: number; rhrSd: number;
  /** Typical within-person day-to-day SD (including measurement noise). */
  lnRmssdDaySd: number; rhrDaySd: number;
};
/**
 * Population prior. ln RMSSD falls ~0.017 per year of age (short-term resting RMSSD norms; ≈ 36 ms at
 * 35) with a between-person SD of ~0.45; day to day, a person's ln RMSSD varies by ~0.2 and resting HR
 * by ~3 bpm.
 */
export function populationPrior(age: number | null | undefined): Prior {
  return { lnRmssd: 4.2 - 0.017 * (age ?? 35), lnRmssdSd: 0.45, lnRmssdDaySd: 0.2, rhr: 64, rhrSd: 8, rhrDaySd: 3 };
}

/**
 * Normal–normal update of the usual level from n mornings. Returns the posterior mean, the day-to-day
 * SD (`daySd`, blended with the default until you have enough mornings) and `sd`, the predictive SD
 * used for z-scoring a new morning.
 */
export function blendBaseline(vals: number[], priorMean: number, priorSd: number, daySd0: number, minSd: number) {
  const n = vals.length;
  const daySd = Math.max(minSd, n >= 3 ? Math.sqrt((n * sdOf(vals) ** 2 + PRIOR_K * daySd0 ** 2) / (n + PRIOR_K)) : daySd0);
  const prec = 1 / priorSd ** 2 + n / daySd ** 2;
  const mean = (priorMean / priorSd ** 2 + (n ? vals.reduce((a, b) => a + b, 0) : 0) / daySd ** 2) / prec;
  return { mean, daySd, sd: Math.sqrt(daySd ** 2 + 1 / prec), n };
}
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const meanOf = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sdOf = (v: number[]) => { if (v.length < 2) return 0; const m = meanOf(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

export function labelFor(score: number) {
  return score >= 80 ? 'Good to go' : score >= 60 ? 'Take it steady' : 'Go easy today';
}

/** Score for `today` using only days strictly before it as baseline. `history` sorted by date. */
export function recoveryFor(history: DayInput[], today: DayInput, sleepTargetH = 8, prior: Prior = populationPrior(null)): Recovery {
  const prior60 = history.filter(d => d.date < today.date).slice(-60);
  const hrvVals = prior60.map(d => d.lnRmssd).filter((x): x is number => x != null);
  const rhrVals = prior60.slice(-30).map(d => d.rhr).filter((x): x is number => x != null);
  const hb = blendBaseline(hrvVals, prior.lnRmssd, prior.lnRmssdSd, prior.lnRmssdDaySd, 0.05);
  const rb = blendBaseline(rhrVals, prior.rhr, prior.rhrSd, prior.rhrDaySd, 1.5);
  const band: [number, number] = [Math.exp(hb.mean - 0.5 * hb.sd), Math.exp(hb.mean + 0.5 * hb.sd)];
  const parts: Part[] = [];

  if (today.lnRmssd != null) {
    const z = (today.lnRmssd - hb.mean) / hb.sd;
    // Logistic: ~33 at baseline, ~37 at +½ SD, 20 at −1 SD, ~7 at −2 SD.
    const pts = 40 / (1 + Math.exp(-(z + 1) * 1.5));
    parts.push({ key: 'hrv', pts, max: 40, note: z >= 0.5 ? 'Above your normal range' : z <= -0.5 ? 'Below your normal range' : 'Within your normal range' });
  }
  if (today.rhr != null) {
    const z = (today.rhr - rb.mean) / rb.sd;
    const pts = 20 / (1 + Math.exp((z - 1) * 1.5));
    parts.push({ key: 'rhr', pts, max: 20, note: z >= 1 ? `${Math.round(today.rhr - rb.mean)} bpm above your usual` : z <= -0.5 ? 'Lower than usual' : 'About usual' });
  }
  if (today.sleepH != null) {
    const dur = clamp((today.sleepH - 0.5 * sleepTargetH) / (0.5 * sleepTargetH), 0, 1);
    const qf = today.sleepQ != null ? 0.8 + 0.05 * (clamp(today.sleepQ, 1, 5) - 1) : 0.9;
    const h = Math.floor(today.sleepH), mnt = Math.round((today.sleepH - h) * 60);
    parts.push({ key: 'sleep', pts: 25 * dur * qf, max: 25, note: `${h} h ${mnt} m of your ${sleepTargetH} h target` });
  }
  if (today.adherence != null) parts.push({ key: 'adherence', pts: 5 * clamp(today.adherence, 0, 1), max: 5, note: `${Math.round(today.adherence * 100)}% of today’s items so far` });

  const hasHeart = parts.some(p => p.key === 'hrv' || p.key === 'rhr');
  const status: Recovery['status'] = !hasHeart ? 'needs-data' : hrvVals.length < PERSONAL_AFTER ? 'provisional' : 'ok';
  const rounded = parts.map(p => ({ ...p, pts: Math.round(p.pts) }));
  if (!hasHeart) return { status, score: null, parts: rounded, baselineDays: hrvVals.length, band, label: 'Measure this morning' };
  const max = parts.reduce((a, p) => a + p.max, 0), got = parts.reduce((a, p) => a + p.pts, 0);
  const score = Math.round((got / max) * 100);
  return { status, score, parts: rounded, baselineDays: hrvVals.length, band, label: labelFor(score) };
}

/**
 * Tomorrow's score: exponentially weighted persistence. Tomorrow tends to sit between today and the
 * personal average, pulled by recent days; the band is ±1 SD of past day-to-day changes. Needs ≥ 3
 * scored days. `plannedSleepH` nudges the estimate toward the sleep target's effect.
 */
export function forecastTomorrow(scores: number[], plannedSleepH?: number, sleepTargetH = 8): Forecast {
  if (scores.length < 3) return null;
  const today = scores[scores.length - 1];
  let ewma = scores[0];
  for (const s of scores.slice(1)) ewma = 0.3 * s + 0.7 * ewma;
  const avg = meanOf(scores.slice(-30));
  let f = 0.5 * today + 0.3 * ewma + 0.2 * avg;
  if (plannedSleepH != null) f += 25 * clamp((plannedSleepH - sleepTargetH) / sleepTargetH, -0.5, 0.25) * 0.5;
  const diffs = scores.slice(1).map((s, i) => s - scores[i]);
  const band = Math.max(5, sdOf(diffs));
  const score = Math.round(clamp(f, 0, 100));
  return { score, lo: Math.round(clamp(f - band, 0, 100)), hi: Math.round(clamp(f + band, 0, 100)), basis: scores.length };
}

/** Recovery score for each historical day (each using only its own past as baseline). */
export function scoreHistory(history: DayInput[], sleepTargetH = 8, prior: Prior = populationPrior(null)): number[] {
  return history.map(d => recoveryFor(history, d, sleepTargetH, prior).score).filter((s): s is number => s != null);
}
