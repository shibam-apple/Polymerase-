import { bpCategory, healthAge, hrvAge } from '../src/health/healthAge';
import { forecastTomorrow, recoveryFor, scoreHistory, type DayInput } from '../src/health/recovery';

const day = (i: number, rmssd: number, rhr: number, extra: Partial<DayInput> = {}): DayInput => ({ date: `2026-09-${String(i).padStart(2, '0')}`, lnRmssd: Math.log(rmssd), rhr, ...extra });
const baseline = [day(1, 50, 58), day(2, 46, 60), day(3, 52, 57), day(4, 48, 59), day(5, 55, 58), day(6, 47, 60), day(7, 51, 58)];

describe('recovery score', () => {
  it('is "learning" with fewer than 3 prior mornings, with no score', () => {
    const r = recoveryFor(baseline.slice(0, 2), day(3, 50, 58));
    expect(r.status).toBe('learning');
    expect(r.score).toBeNull();
    expect(r.label).toBe('Learning · 2 of 3 mornings');
  });

  it('scores a typical morning in the 70s–80s and an HRV crash much lower', () => {
    const typical = recoveryFor(baseline, day(8, 50, 58, { sleepH: 7.8, sleepQ: 4 }));
    const crash = recoveryFor(baseline, day(8, 30, 68, { sleepH: 5, sleepQ: 2 }));
    expect(typical.status).toBe('ok');
    expect(typical.score!).toBeGreaterThanOrEqual(70);
    expect(crash.score!).toBeLessThan(45);
    expect(crash.parts.find(p => p.key === 'hrv')!.note).toBe('Below your normal range');
    expect(crash.parts.find(p => p.key === 'rhr')!.note).toMatch(/above your usual/);
  });

  it('gives a personal normal band around the baseline RMSSD', () => {
    const r = recoveryFor(baseline, day(8, 50, 58));
    expect(r.band![0]).toBeLessThan(50);
    expect(r.band![1]).toBeGreaterThan(48);
    expect(r.band![1] - r.band![0]).toBeLessThan(12);
  });

  it('renormalises when sleep is not logged instead of treating it as bad sleep', () => {
    const noSleep = recoveryFor(baseline, day(8, 50, 58));
    const withGood = recoveryFor(baseline, day(8, 50, 58, { sleepH: 8, sleepQ: 5 }));
    expect(Math.abs(noSleep.score! - withGood.score!)).toBeLessThan(15);
    expect(noSleep.parts.some(p => p.key === 'sleep')).toBe(false);
  });

  it('asks for a measurement when today has no heart data', () => {
    const r = recoveryFor(baseline, { date: '2026-09-08', sleepH: 8 });
    expect(r.status).toBe('needs-data');
    expect(r.score).toBeNull();
  });
});

describe('forecast', () => {
  it('needs 3 scored days, then sits between today and the average with a band', () => {
    expect(forecastTomorrow([70, 72])).toBeNull();
    const f = forecastTomorrow([80, 78, 82, 79, 60])!;
    expect(f.score).toBeGreaterThan(60);
    expect(f.score).toBeLessThan(80);
    expect(f.lo).toBeLessThan(f.score);
    expect(f.hi).toBeGreaterThan(f.score);
  });

  it('scores history day by day using only each day’s past', () => {
    const s = scoreHistory([...baseline, day(8, 50, 58), day(9, 40, 62)]);
    expect(s.length).toBe(6); // days 4..9 have ≥3 prior mornings
    expect(s[s.length - 1]).toBeLessThan(s[s.length - 2]);
  });
});

describe('health age', () => {
  const p = { age: 38, sex: 'male' as const, heightCm: 176, sleepTargetH: 8 };

  it('needs an age', () => {
    expect(healthAge({ ...p, age: null }, { rhr: 58 }).age).toBeNull();
  });

  it('adds up transparent adjustments', () => {
    const h = healthAge(p, { rhr: 58, sys: 118, dia: 76, weightKg: 72.8, sleepAvgH: 7.5 });
    // RHR −1, BP −1, BMI 23.5 −1, sleep −1
    if (h.age == null) throw new Error('expected an age');
    expect(h.age).toBe(34);
    expect(h.diffText).toBe('4 years younger than 38');
    expect(h.parts.map(q => q.label)).toEqual(['Resting HR', 'Blood pressure', 'Weight', 'Sleep']);
  });

  it('penalises stage-2 blood pressure and obesity', () => {
    const h = healthAge(p, { sys: 150, dia: 95, weightKg: 100 });
    if (h.age == null) throw new Error('expected an age');
    expect(h.age).toBe(45);
  });

  it('classifies BP by ACC/AHA and maps RMSSD to an HRV-age', () => {
    expect(bpCategory(118, 76)).toBe('normal');
    expect(bpCategory(125, 78)).toBe('elevated');
    expect(bpCategory(132, 70)).toBe('stage1');
    expect(bpCategory(120, 92)).toBe('stage2');
    expect(hrvAge(20)).toBeGreaterThan(hrvAge(45));
  });
});
