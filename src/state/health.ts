import { healthAge, type HealthAge } from '../health/healthAge';
import { predict, type Prediction } from '../health/predict';
import { forecastTomorrow, populationPrior, recoveryFor, type DayInput, type Forecast, type Recovery } from '../health/recovery';
import { dayKey } from './seed';
import type { HeartEntry, SleepEntry, State } from './types';

export type Derived = {
  recovery: Recovery;
  forecast: Forecast;
  age: HealthAge;
  latestHeart: HeartEntry | null;
  todaysHeart: HeartEntry | null;
  sleepToday: SleepEntry | null;
  rmssd7: number | null;
  sleepAvg7: number | null;
  /** One morning value per day (first measurement of each day), oldest first. */
  days: DayInput[];
  /** Readiness for each past day with a morning measurement (each scored against its own past). */
  history: { date: string; score: number }[];
  /** Active predictions, alerts first. */
  predictions: Prediction[];
  /** Forecast gain from sleeping the full target tonight (points), when a forecast exists. */
  sleepBoost: number | null;
  /** Breathing rate of the latest measurement, if detected. */
  breathing: number | null;
};

/** Share of the med + habit items due so far today that are done (null before anything is due). */
export function adherence(s: State, now: Date): number | null {
  const part = now.getHours() < 11 ? 0 : now.getHours() < 17 ? 1 : 2;
  const due = s.items.filter(i => (i.p === 'med' || i.p === 'habit') && i.part <= part);
  return due.length ? due.filter(i => i.done).length / due.length : null;
}

/** One entry per calendar day: the first heart measurement of that day (a morning / resting reading) and that night's sleep. */
export function dailyInputs(heartLog: HeartEntry[], sleepLog: SleepEntry[]): DayInput[] {
  const map = new Map<string, DayInput>();
  for (const h of [...heartLog].sort((a, b) => a.at - b.at)) {
    const k = dayKey(new Date(h.at));
    if (!map.has(k)) map.set(k, { date: k, lnRmssd: h.rmssd > 0 ? Math.log(h.rmssd) : undefined, rhr: h.hr });
  }
  for (const sl of sleepLog) map.set(sl.date, { ...(map.get(sl.date) ?? { date: sl.date }), sleepH: sl.hours, sleepQ: sl.quality });
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function deriveHealth(s: State, now = new Date()): Derived {
  const today = dayKey(now), target = s.profile.sleepTargetH;
  const days = dailyInputs(s.heartLog, s.sleepLog);
  const todayInput: DayInput = { ...(days.find(d => d.date === today) ?? { date: today }), adherence: adherence(s, now) ?? undefined };
  const prior = populationPrior(s.profile.age);
  const recovery = recoveryFor(days, todayInput, target, prior);
  const history = days.filter(d => d.date < today).map(d => ({ date: d.date, score: recoveryFor(days, d, target, prior).score }))
    .filter((x): x is { date: string; score: number } => x.score != null);
  const series = [...history.map(h => h.score), ...(recovery.score != null ? [recovery.score] : [])];
  // Tomorrow if you sleep as you have been this week, and if you sleep the full target tonight.
  const usualSleep = s.sleepLog.length ? s.sleepLog.slice(-7).reduce((a, x) => a + x.hours, 0) / Math.min(7, s.sleepLog.length) : undefined;
  const forecast = recovery.score != null ? forecastTomorrow(series, usualSleep, target) : null;
  const planned = recovery.score != null ? forecastTomorrow(series, target, target) : null;
  const sleepBoost = forecast && planned && planned.score > forecast.score ? planned.score - forecast.score : null;

  const latestHeart = s.heartLog.length ? s.heartLog[s.heartLog.length - 1] : null;
  const todaysHeart = s.heartLog.find(h => dayKey(new Date(h.at)) === today) ?? null;
  const last7 = days.slice(-7);
  const lnR = last7.map(d => d.lnRmssd).filter((x): x is number => x != null);
  const rmssd7 = lnR.length ? Math.exp(lnR.reduce((a, b) => a + b, 0) / lnR.length) : null;
  const sl = s.sleepLog.slice(-7).map(x => x.hours);
  const sleepAvg7 = sl.length ? sl.reduce((a, b) => a + b, 0) / sl.length : null;
  const sleepToday = s.sleepLog.find(x => x.date === today) ?? null;

  const bp = s.vitals.bp.v, w = s.vitals.weight.v;
  const age = healthAge(s.profile, {
    rhr: latestHeart?.hr ?? null, sys: bp.length === 2 ? bp[0] : null, dia: bp.length === 2 ? bp[1] : null,
    weightKg: w.length ? w[0] : null, sleepAvgH: sleepAvg7, rmssd: rmssd7,
  });
  const predictions = predict({ days, prior, sleepTargetH: target, bedtimes: s.sleepLog.slice(-7).map(x => x.bed), bp: s.bpLog, now: now.getTime(), today });
  const breathing = latestHeart?.respRate ?? null;
  return { recovery, forecast, age, latestHeart, todaysHeart, sleepToday, rmssd7, sleepAvg7, days, history, predictions, sleepBoost, breathing };
}

/** "7 h 12 m" */
export const fmtHours = (h: number) => `${Math.floor(h)} h ${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, '0')} m`;

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Longest a timed night can be before it's treated as a forgotten "Going to bed". */
export const MAX_NIGHT_H = 16;

/**
 * A night from the "Going to bed" and "I'm up" taps: clock times rounded to 5 minutes, dated to the
 * wake-up day. `stale` when the start is too old to be one night (forgotten tap).
 */
export function nightFromTimes(start: number, end: number): { date: string; bed: string; wake: string; hours: number; stale: boolean } {
  const r5 = (t: number) => Math.round(t / 300000) * 300000;
  const b = new Date(r5(start)), w = new Date(r5(end));
  const bed = hhmm(b), wake = hhmm(w);
  const stale = end - start > MAX_NIGHT_H * 3600000 || end <= start;
  return { date: dayKey(w), bed, wake, hours: stale ? sleepHours(bed, wake) : Math.round(((w.getTime() - b.getTime()) / 3600000) * 100) / 100, stale };
}

/** Hours between two "HH:MM" clock times, crossing midnight when wake < bed. */
export function sleepHours(bed: string, wake: string): number {
  const [bh, bm] = bed.split(':').map(Number), [wh, wm] = wake.split(':').map(Number);
  let d = wh * 60 + wm - (bh * 60 + bm);
  if (d <= 0) d += 24 * 60;
  return Math.round((d / 60) * 100) / 100;
}
