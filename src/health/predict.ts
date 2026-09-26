import { bpCategory } from './healthAge';
import { blendBaseline, type DayInput, type Prior } from './recovery';

/**
 * Predictive flags from the daily inputs. Pure functions; each flag carries its evidence, a confidence
 * and what helps, and is worded as "may" (indicative, not a diagnosis).
 *
 *  strain         Morning resting HR ≥ baseline + max(3 bpm, 1 SD) together with ln RMSSD ≤ baseline − 1 SD.
 *                 Two consecutive mornings → alert; the latest morning alone → watch. Elevated RHR with
 *                 suppressed HRV precedes symptoms of infection (Radin et al. 2020, Lancet Digit Health;
 *                 Mishra et al. 2020, Nat Biomed Eng) and accompanies acute training strain.
 *  overreaching   The 7-day mean ln RMSSD dropped > 0.5 SD versus the 7 days before, while its day-to-day
 *                 CV rose (Plews et al. 2012, Int J Sports Physiol Perform).
 *  sleep-debt     Logged nights in the last 7 days fall ≥ 5 h short of the target in total (≥ 8 h: alert).
 *  sleep-irregular Bedtime SD > 60 min over the last 7 nights (irregular timing is linked to poorer
 *                 recovery independent of duration).
 *  bp-high        Mean of the last 14 days' readings (≥ 3) in ACC/AHA stage 1 (watch) or stage 2 (alert).
 *  bp-trend       Mean systolic of the last 14 days ≥ 5 mmHg above the 14 days before (≥ 2 readings each).
 */
export type PredictionId = 'strain' | 'overreaching' | 'sleep-debt' | 'sleep-irregular' | 'bp-high' | 'bp-trend';
export type Prediction = {
  id: PredictionId;
  level: 'alert' | 'watch';
  title: string;
  detail: string;
  evidence: string[];
  helps: string;
  confidence: 'low' | 'medium' | 'high';
};
export type BpReading = { at: number; sys: number; dia: number };
export type PredictInput = {
  days: DayInput[];
  prior: Prior;
  sleepTargetH: number;
  /** Bedtimes ("HH:MM") of the last nights, oldest first. */
  bedtimes: string[];
  bp: BpReading[];
  now: number;
  /** Today's date key (YYYY-MM-DD). */
  today: string;
};

const DAY = 86400000;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v: number[]) => { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const dateMs = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
const daysBetween = (a: string, b: string) => Math.round((dateMs(b) - dateMs(a)) / DAY);
const ms = (ln: number) => Math.round(Math.exp(ln));

type Morning = DayInput & { lnRmssd: number; rhr: number };

/** Is this morning strained relative to the mornings before it? */
function strained(m: Morning, before: Morning[], prior: Prior) {
  const hb = blendBaseline(before.map(d => d.lnRmssd).slice(-60), prior.lnRmssd, prior.lnRmssdSd, prior.lnRmssdDaySd, 0.05);
  const rb = blendBaseline(before.map(d => d.rhr).slice(-30), prior.rhr, prior.rhrSd, prior.rhrDaySd, 1.5);
  const rhrUp = m.rhr - rb.mean, hrvDown = (hb.mean - m.lnRmssd) / hb.sd;
  return { hit: rhrUp >= Math.max(3, rb.sd) && hrvDown >= 1, rhrUp, rhrBase: rb.mean, hrvBase: hb.mean, n: before.length };
}

export function strainFlag(days: DayInput[], prior: Prior, today: string): Prediction | null {
  const ms_ = days.filter((d): d is Morning => d.lnRmssd != null && d.rhr != null);
  if (!ms_.length) return null;
  const last = ms_[ms_.length - 1];
  if (daysBetween(last.date, today) > 1) return null; // only about the last day or two
  const s1 = strained(last, ms_.slice(0, -1), prior);
  if (!s1.hit) return null;
  const prev = ms_.length >= 2 ? ms_[ms_.length - 2] : null;
  // The day before is judged against its own past, so two strained days don't hide each other.
  const s0 = prev && daysBetween(prev.date, last.date) <= 2 ? strained(prev, ms_.slice(0, -2), prior) : null;
  const two = !!s0?.hit;
  const n = s1.n;
  return {
    id: 'strain',
    level: two ? 'alert' : 'watch',
    title: two ? 'Your body may be under strain' : 'Early sign of strain',
    detail: two
      ? 'Two mornings in a row with a raised resting heart rate and low HRV. This pattern often shows up a day or two before a cold, or after hard training, poor sleep or alcohol.'
      : 'Resting heart rate is up and HRV is down this morning. Measure again tomorrow to see if it persists.',
    evidence: [
      `Resting HR ${last.rhr} bpm, +${Math.round(s1.rhrUp)} vs your usual ${Math.round(s1.rhrBase)}`,
      `HRV ${ms(last.lnRmssd)} ms vs your usual ${ms(s1.hrvBase)} ms`,
      ...(two && prev ? [`Yesterday: ${prev.rhr} bpm, HRV ${ms(prev.lnRmssd)} ms`] : []),
    ],
    helps: 'Keep today light, sleep early, drink water. If you feel unwell, rest.',
    confidence: n >= 7 ? 'high' : n >= 3 ? 'medium' : 'low',
  };
}

export function overreachingFlag(days: DayInput[]): Prediction | null {
  const v = days.filter(d => d.lnRmssd != null).map(d => d.lnRmssd!);
  if (v.length < 14) return null;
  const cur = v.slice(-7), prev = v.slice(-14, -7), all = v.slice(-28);
  const drop = mean(prev) - mean(cur), s = Math.max(0.05, sd(all));
  const cv = (x: number[]) => sd(x) / Math.abs(mean(x));
  if (drop <= 0.5 * s || cv(cur) <= cv(prev)) return null;
  return {
    id: 'overreaching',
    level: drop > s ? 'alert' : 'watch',
    title: 'Recovery trending down',
    detail: 'Your weekly HRV average has fallen and become less steady. That is a common sign of accumulating fatigue from training, stress or short sleep.',
    evidence: [`7-day HRV average ${ms(mean(cur))} ms, down from ${ms(mean(prev))} ms`, 'Day-to-day HRV is less steady than the week before'],
    helps: 'Plan 2–3 easier days and protect your sleep; it usually rebounds within a week.',
    confidence: v.length >= 21 ? 'high' : 'medium',
  };
}

/** Minutes after 18:00, so bedtimes either side of midnight compare correctly. */
const bedMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h * 60 + m - 18 * 60 + 1440) % 1440; };

export function sleepFlags(days: DayInput[], today: string, target: number, bedtimes: string[]): Prediction[] {
  const out: Prediction[] = [];
  const recent = days.filter(d => d.sleepH != null && daysBetween(d.date, today) >= 0 && daysBetween(d.date, today) < 7);
  if (recent.length >= 3) {
    const debt = recent.reduce((a, d) => a + Math.max(0, target - d.sleepH!), 0);
    if (debt >= 5) {
      const h = Math.round(debt * 10) / 10;
      out.push({
        id: 'sleep-debt', level: debt >= 8 ? 'alert' : 'watch', title: 'Sleep debt building',
        detail: `You are about ${h} h short of your ${target} h target over the last ${recent.length} nights. Readiness and HRV usually dip when this builds up.`,
        evidence: [`${recent.length} nights logged, average ${(mean(recent.map(d => d.sleepH!))).toFixed(1)} h`],
        helps: 'Go to bed 30–45 min earlier for the next few nights.',
        confidence: recent.length >= 5 ? 'high' : 'medium',
      });
    }
  }
  const b = bedtimes.slice(-7).map(bedMin);
  if (b.length >= 4 && sd(b) > 60) {
    out.push({
      id: 'sleep-irregular', level: 'watch', title: 'Irregular bedtime',
      detail: 'Your bedtime moved by more than an hour from night to night this week. A steady bedtime helps recovery even when total sleep is the same.',
      evidence: [`Bedtime varies by ±${Math.round(sd(b))} min`],
      helps: 'Pick a bedtime and keep it within 30 min, weekends included.',
      confidence: b.length >= 6 ? 'high' : 'medium',
    });
  }
  return out;
}

export function bpFlags(bp: BpReading[], now: number): Prediction[] {
  const out: Prediction[] = [];
  const last14 = bp.filter(r => now - r.at <= 14 * DAY), prev14 = bp.filter(r => now - r.at > 14 * DAY && now - r.at <= 28 * DAY);
  if (last14.length >= 3) {
    const sys = Math.round(mean(last14.map(r => r.sys))), dia = Math.round(mean(last14.map(r => r.dia))), cat = bpCategory(sys, dia);
    if (cat === 'stage1' || cat === 'stage2') {
      out.push({
        id: 'bp-high', level: cat === 'stage2' ? 'alert' : 'watch',
        title: cat === 'stage2' ? 'Blood pressure is high' : 'Blood pressure is raised',
        detail: `Your 14-day average of ${sys}/${dia} is in the ${cat === 'stage2' ? 'stage 2' : 'stage 1'} range (ACC/AHA). A doctor can confirm with standard measurements.`,
        evidence: [`${last14.length} readings in 14 days, average ${sys}/${dia} mmHg`],
        helps: cat === 'stage2' ? 'Book a check with your doctor soon.' : 'Less salt and alcohol, regular activity; mention it at your next check-up.',
        confidence: last14.length >= 7 ? 'high' : 'medium',
      });
    }
  }
  if (last14.length >= 2 && prev14.length >= 2) {
    const up = mean(last14.map(r => r.sys)) - mean(prev14.map(r => r.sys));
    if (up >= 5) {
      out.push({
        id: 'bp-trend', level: 'watch', title: 'Blood pressure trending up',
        detail: 'Your systolic pressure averaged higher these two weeks than the two before.',
        evidence: [`+${Math.round(up)} mmHg systolic vs the previous 14 days`],
        helps: 'Measure at the same time each day, seated, after 5 min rest, to confirm the trend.',
        confidence: last14.length + prev14.length >= 8 ? 'high' : 'medium',
      });
    }
  }
  return out;
}

/** All active predictions, alerts first. */
export function predict(x: PredictInput): Prediction[] {
  const all = [
    strainFlag(x.days, x.prior, x.today),
    overreachingFlag(x.days),
    ...sleepFlags(x.days, x.today, x.sleepTargetH, x.bedtimes),
    ...bpFlags(x.bp, x.now),
  ].filter((p): p is Prediction => p != null);
  return all.sort((a, b) => (a.level === b.level ? 0 : a.level === 'alert' ? -1 : 1));
}
