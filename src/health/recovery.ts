/**
 * Recovery score (0–100) and tomorrow's forecast from the user's own history. Pure functions.
 *
 * Components (points):
 *   HRV        40  today's morning ln(RMSSD) vs a personal baseline (mean ± ½ SD of up to 60 prior days)
 *   Resting HR 20  today's resting HR vs its 30-day baseline (higher = worse)
 *   Sleep      25  last night's hours vs target, scaled by self-rated quality
 *   Adherence   5  meds + habits due so far that are done
 *   (Load      10  not tracked yet: excluded, and the score is renormalised to the available max)
 * A component with no data today is left out and the rest are renormalised, so a missing sleep log
 * doesn't read as bad sleep. HRV/RHR need ≥ 3 prior mornings before they count ("learning").
 */

export type DayInput = { date: string; lnRmssd?: number; rhr?: number; sleepH?: number; sleepQ?: number; adherence?: number };
export type Part = { key: 'hrv' | 'rhr' | 'sleep' | 'adherence'; pts: number; max: number; note: string };
export type Recovery = {
  status: 'ok' | 'provisional' | 'learning' | 'needs-data';
  score: number | null;
  parts: Part[];
  /** Mornings with HRV before today (baseline size). */
  baselineDays: number;
  /** Personal normal RMSSD band (ms), when a baseline exists. */
  band: [number, number] | null;
  label: string;
};
export type Forecast = { score: number; lo: number; hi: number; basis: number } | null;

export const MIN_BASELINE = 3;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const meanOf = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sdOf = (v: number[]) => { if (v.length < 2) return 0; const m = meanOf(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

export function labelFor(score: number) {
  return score >= 80 ? 'Ready for a full day' : score >= 60 ? 'Take it steady' : 'Go easy today';
}

/** Score for `today` using only days strictly before it as baseline. `history` sorted by date. */
export function recoveryFor(history: DayInput[], today: DayInput, sleepTargetH = 8): Recovery {
  const prior = history.filter(d => d.date < today.date).slice(-60);
  const hrvBase = prior.map(d => d.lnRmssd).filter((x): x is number => x != null);
  const rhrBase = prior.slice(-30).map(d => d.rhr).filter((x): x is number => x != null);
  const parts: Part[] = [];
  let band: [number, number] | null = null;

  if (hrvBase.length >= MIN_BASELINE) {
    const m = meanOf(hrvBase), s = Math.max(sdOf(hrvBase), 0.05);
    band = [Math.exp(m - 0.5 * s), Math.exp(m + 0.5 * s)];
    if (today.lnRmssd != null) {
      const z = (today.lnRmssd - m) / s;
      // Logistic: ~33 at baseline, ~37 at +½ SD, 20 at −1 SD, ~7 at −2 SD.
      const pts = 40 / (1 + Math.exp(-(z + 1) * 1.5));
      parts.push({ key: 'hrv', pts, max: 40, note: z >= 0.5 ? 'Above your normal range' : z <= -0.5 ? 'Below your normal range' : 'Within your normal range' });
    }
  }
  if (rhrBase.length >= MIN_BASELINE && today.rhr != null) {
    const m = meanOf(rhrBase), s = Math.max(sdOf(rhrBase), 1.5);
    const z = (today.rhr - m) / s;
    const pts = 20 / (1 + Math.exp((z - 1) * 1.5));
    parts.push({ key: 'rhr', pts, max: 20, note: z >= 1 ? `${Math.round(today.rhr - m)} bpm above your usual` : z <= -0.5 ? 'Lower than usual' : 'About usual' });
  }
  if (today.sleepH != null) {
    const dur = clamp((today.sleepH - 0.5 * sleepTargetH) / (0.5 * sleepTargetH), 0, 1);
    const qf = today.sleepQ != null ? 0.8 + 0.05 * (clamp(today.sleepQ, 1, 5) - 1) : 0.9;
    const h = Math.floor(today.sleepH), mnt = Math.round((today.sleepH - h) * 60);
    parts.push({ key: 'sleep', pts: 25 * dur * qf, max: 25, note: `${h} h ${mnt} m of your ${sleepTargetH} h target` });
  }
  if (today.adherence != null) parts.push({ key: 'adherence', pts: 5 * clamp(today.adherence, 0, 1), max: 5, note: `${Math.round(today.adherence * 100)}% of today’s items so far` });

  const hasHeart = parts.some(p => p.key === 'hrv' || p.key === 'rhr');
  const status: Recovery['status'] = hrvBase.length < MIN_BASELINE ? 'learning' : !hasHeart ? 'needs-data' : hrvBase.length < 7 ? 'provisional' : 'ok';
  const rounded = parts.map(p => ({ ...p, pts: Math.round(p.pts) }));
  if (!hasHeart) return { status, score: null, parts: rounded, baselineDays: hrvBase.length, band, label: status === 'learning' ? `Learning · ${hrvBase.length} of ${MIN_BASELINE} mornings` : 'Measure this morning' };
  const max = parts.reduce((a, p) => a + p.max, 0), got = parts.reduce((a, p) => a + p.pts, 0);
  const score = Math.round((got / max) * 100);
  return { status, score, parts: rounded, baselineDays: hrvBase.length, band, label: labelFor(score) };
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
export function scoreHistory(history: DayInput[], sleepTargetH = 8): number[] {
  return history.map(d => recoveryFor(history, d, sleepTargetH).score).filter((s): s is number => s != null);
}
