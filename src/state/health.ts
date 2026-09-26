import { healthAge, type HealthAge } from '../health/healthAge';
import { forecastTomorrow, recoveryFor, scoreHistory, type DayInput, type Forecast, type Recovery } from '../health/recovery';
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
  const recovery = recoveryFor(days, todayInput, target);
  const scored = scoreHistory(days.filter(d => d.date < today), target);
  const forecast = recovery.score != null ? forecastTomorrow([...scored, recovery.score], undefined, target) : null;

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
  return { recovery, forecast, age, latestHeart, todaysHeart, sleepToday, rmssd7, sleepAvg7, days };
}

/** "7 h 12 m" */
export const fmtHours = (h: number) => `${Math.floor(h)} h ${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, '0')} m`;

/** Hours between two "HH:MM" clock times, crossing midnight when wake < bed. */
export function sleepHours(bed: string, wake: string): number {
  const [bh, bm] = bed.split(':').map(Number), [wh, wm] = wake.split(':').map(Number);
  let d = wh * 60 + wm - (bh * 60 + bm);
  if (d <= 0) d += 24 * 60;
  return Math.round((d / 60) * 100) / 100;
}
