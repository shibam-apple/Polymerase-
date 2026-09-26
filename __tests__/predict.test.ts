import { bpFlags, overreachingFlag, predict, sleepFlags, strainFlag } from '../src/health/predict';
import { populationPrior, type DayInput } from '../src/health/recovery';

const key = (i: number) => { const d = new Date(2026, 8, 1); d.setDate(d.getDate() + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const morning = (i: number, rmssd: number, rhr: number, extra: Partial<DayInput> = {}): DayInput => ({ date: key(i), lnRmssd: Math.log(rmssd), rhr, ...extra });
// A steady person: HRV ~50 ± 3 ms, RHR ~58 ± 1.
const steady = (n: number) => Array.from({ length: n }, (_, i) => morning(i, 50 + ((i * 7) % 7) - 3, 58 + ((i * 3) % 3) - 1));
const prior = populationPrior(32);

describe('strain / illness-onset flag', () => {
  it('stays quiet for a normal person', () => {
    const d = steady(20);
    expect(strainFlag(d, prior, d[d.length - 1].date)).toBeNull();
  });
  it('watches after one strained morning and alerts on the second', () => {
    const base = steady(14);
    const one = [...base, morning(14, 36, 65)];
    const f1 = strainFlag(one, prior, key(14))!;
    expect(f1.level).toBe('watch');
    const two = [...one, morning(15, 34, 66)];
    const f2 = strainFlag(two, prior, key(15))!;
    expect(f2.level).toBe('alert');
    expect(f2.confidence).toBe('high');
    expect(f2.evidence[0]).toMatch(/\+\d+ vs your usual/);
  });
  it('ignores an old strained morning', () => {
    const d = [...steady(14), morning(14, 34, 66)];
    expect(strainFlag(d, prior, key(18))).toBeNull();
  });
  it('needs both signals: high RHR alone is not flagged', () => {
    const d = [...steady(14), morning(14, 50, 66)];
    expect(strainFlag(d, prior, key(14))).toBeNull();
  });
});

describe('overreaching trend', () => {
  it('flags a falling and less steady weekly HRV', () => {
    const good = Array.from({ length: 14 }, (_, i) => morning(i, 55 + (i % 2), 57));
    const worse = [44, 36, 47, 33, 45, 35, 42].map((r, i) => morning(14 + i, r, 60));
    const f = overreachingFlag([...good, ...worse])!;
    expect(f.id).toBe('overreaching');
  });
  it('needs two weeks of data', () => {
    expect(overreachingFlag(steady(10))).toBeNull();
  });
});

describe('sleep flags', () => {
  it('flags sleep debt and irregular bedtimes', () => {
    const days = [5.5, 6, 5.8, 6.2, 5.9].map((h, i) => ({ date: key(i), sleepH: h }));
    const f = sleepFlags(days, key(4), 8, ['22:30', '01:15', '23:00', '02:00', '22:45']);
    expect(f.map(x => x.id)).toEqual(['sleep-debt', 'sleep-irregular']);
    expect(f[0].level).toBe('alert'); // ~10 h short
  });
  it('treats bedtimes either side of midnight as close', () => {
    const days = [8, 8, 8, 8].map((h, i) => ({ date: key(i), sleepH: h }));
    expect(sleepFlags(days, key(3), 8, ['23:50', '00:10', '23:55', '00:05'])).toEqual([]);
  });
});

describe('blood pressure flags', () => {
  const now = new Date(2026, 8, 30).getTime(), D = 86400000;
  it('flags a stage 1 average and an upward trend', () => {
    const prev = [118, 120].map((sys, i) => ({ at: now - (20 + i) * D, sys, dia: 76 }));
    const cur = [132, 134, 131].map((sys, i) => ({ at: now - i * D, sys, dia: 82 }));
    const ids = bpFlags([...prev, ...cur], now).map(f => f.id);
    expect(ids).toEqual(['bp-high', 'bp-trend']);
  });
  it('is quiet for normal readings', () => {
    expect(bpFlags([115, 117, 114].map((sys, i) => ({ at: now - i * D, sys, dia: 74 })), now)).toEqual([]);
  });
});

it('sorts alerts before watches', () => {
  const days = [...steady(14), morning(14, 36, 65), morning(15, 34, 66)].map((d, i) => (i > 10 ? { ...d, sleepH: 5.5 } : d));
  const out = predict({ days, prior, sleepTargetH: 8, bedtimes: [], bp: [], now: Date.now(), today: key(15) });
  expect(out[0].level).toBe('alert');
});
