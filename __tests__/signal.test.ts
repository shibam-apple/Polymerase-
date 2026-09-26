import { bandpass, resampleUniform, std } from '../src/signal/filters';
import { cleanIbis, hrvFromIbis } from '../src/signal/hrv';
import { elgendiPeaks, refinePeak } from '../src/signal/peaks';
import { analyzePpg } from '../src/signal/ppg';
import { beatTimes, frameTimes, simulatePpg } from '../src/signal/simulate';

describe('filters', () => {
  it('band-pass keeps a 1.2 Hz pulse and removes a 0.05 Hz drift', () => {
    const fs = 60, n = fs * 30;
    const pulse = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 1.2 * i) / fs));
    const drift = Array.from({ length: n }, (_, i) => 5 * Math.sin((2 * Math.PI * 0.05 * i) / fs));
    const out = bandpass(pulse.map((p, i) => p + drift[i]), fs).slice(fs * 5, n - fs * 5);
    const err = out.map((v, i) => v - pulse[i + fs * 5]);
    expect(std(err)).toBeLessThan(0.15);
  });

  it('resamples jittery frame times onto a uniform grid', () => {
    const t = [0, 0.03, 0.07, 0.1], x = [0, 3, 7, 10];
    const { y } = resampleUniform(t, x, 100);
    expect(y.length).toBe(11);
    expect(y[5]).toBeCloseTo(5, 5);
  });
});

describe('peaks', () => {
  it('parabolic refinement finds the true vertex', () => {
    const x = [0, 0.9, 1, 0.5].map((_, i) => -((i - 1.3) ** 2));
    expect(refinePeak(x, 1)).toBeCloseTo(1.3, 5);
  });

  it('finds every beat on a clean synthetic PPG', () => {
    const fs = 60, t = Array.from({ length: fs * 20 }, (_, i) => i / fs);
    const x = simulatePpg(t, { hr: 72, rsaMs: 0, jitterMs: 0, noise: 0, wander: 0 });
    const peaks = elgendiPeaks(bandpass(x, fs), fs);
    expect(peaks.length).toBeGreaterThanOrEqual(22);
    expect(peaks.length).toBeLessThanOrEqual(25);
  });
});

describe('hrv', () => {
  it('computes RMSSD / SDNN / pNN50 on a known IBI series', () => {
    const m = hrvFromIbis([1000, 1020, 980, 1000, 1060].map(ms => ({ ms, valid: true })))!;
    // diffs 20,-40,20,60 → rmssd = sqrt((400+1600+400+3600)/4)
    expect(m.rmssd).toBeCloseTo(Math.sqrt(1500), 6);
    expect(m.pnn50).toBeCloseTo(0.25, 6);
    expect(m.hr).toBeCloseTo(60, 6);
  });

  it('rejects an ectopic beat and a missed beat without polluting RMSSD', () => {
    const series = [900, 910, 905, 450, 1360, 900, 1810, 905, 895, 910];
    const ibis = cleanIbis(series);
    expect(ibis.filter(b => !b.valid).map(b => b.ms)).toEqual([450, 1360, 1810]);
    expect(hrvFromIbis(ibis)!.rmssd).toBeLessThan(15);
  });
});

describe('analyzePpg (camera-like input)', () => {
  it.each([50, 75, 110])('recovers %i bpm within ±2 bpm from 30 fps inverted camera PPG', hr => {
    const t = frameTimes(40, 30);
    const v = simulatePpg(t, { hr, rsaMs: 30, inverted: true, noise: 0.04, seed: hr });
    const a = analyzePpg(t, v, { inverted: true });
    expect(a.metrics).not.toBeNull();
    expect(Math.abs(a.metrics!.hr - hr)).toBeLessThanOrEqual(2);
    expect(a.quality).not.toBe('poor');
  });

  it('tracks RMSSD: more respiratory variability gives a higher RMSSD', () => {
    const t = frameTimes(60, 30);
    const low = analyzePpg(t, simulatePpg(t, { hr: 60, rsaMs: 10, jitterMs: 3, inverted: true, seed: 5 }), { inverted: true });
    const high = analyzePpg(t, simulatePpg(t, { hr: 60, rsaMs: 120, jitterMs: 3, inverted: true, seed: 5 }), { inverted: true });
    expect(high.metrics!.rmssd).toBeGreaterThan(low.metrics!.rmssd * 2);
    // sub-sample peak refinement keeps timing error well under one 33 ms frame
    expect(low.metrics!.rmssd).toBeLessThan(25);
  });

  it.each([[55, 60], [60, 30], [70, 80], [90, 20]])('RMSSD within 2 ms of ground truth (hr %i, RSA %i ms)', (hr, rsaMs) => {
    const o = { hr, rsaMs, jitterMs: 6, inverted: true, seed: hr, noise: 0.04 };
    const t = frameTimes(60, 30);
    const est = analyzePpg(t, simulatePpg(t, o), { inverted: true }).metrics!.rmssd;
    const b = beatTimes(60, o).filter(x => x > 0.5 && x < 59.5);
    const ibi = b.slice(1).map((x, i) => (x - b[i]) * 1000);
    const d = ibi.slice(1).map((x, i) => x - ibi[i]);
    const truth = Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length);
    expect(Math.abs(est - truth)).toBeLessThan(2);
  });

  it('flags pure noise (no finger on lens) as poor quality', () => {
    const t = frameTimes(30, 30);
    let s = 9;
    const v = t.map(() => { s = (s * 16807) % 2147483647; return 120 + (s / 2147483647) * 20; });
    expect(analyzePpg(t, v, { inverted: true }).quality).toBe('poor');
  });
});
