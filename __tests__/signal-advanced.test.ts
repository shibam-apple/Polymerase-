import { analyzePpg, analyzeSession } from '../src/signal/ppg';
import { frameTimes, rng, simulatePpg } from '../src/signal/simulate';
import { freqHrv } from '../src/signal/spectral';

describe('frequency-domain HRV', () => {
  it('finds a 15 breaths/min respiratory peak and HF-dominant power', () => {
    const times: number[] = [], ibis: number[] = [];
    let t = 0;
    while (t < 180) {
      const ibi = 950 + 45 * Math.sin(2 * Math.PI * 0.25 * t); // RSA at 0.25 Hz
      t += ibi / 1000; times.push(t); ibis.push(ibi);
    }
    const f = freqHrv(times, ibis)!;
    expect(f.respRate).not.toBeNull();
    expect(Math.abs(f.respRate! - 15)).toBeLessThanOrEqual(0.6);
    expect(f.hf).toBeGreaterThan(f.lf * 5);
    expect(f.lfReliable).toBe(true);
  });

  it('reports no breathing rate when there is no rhythm in the HF band', () => {
    const r = rng(4), times: number[] = [], ibis: number[] = [];
    let t = 0;
    while (t < 90) { const ibi = 900 + (r() - 0.5) * 20; t += ibi / 1000; times.push(t); ibis.push(ibi); }
    expect(freqHrv(times, ibis)!.respRate).toBeNull();
  });
});

describe('per-beat quality', () => {
  it('drops a motion artefact instead of letting it distort RMSSD', () => {
    const t = frameTimes(60, 30);
    const o = { hr: 64, rsaMs: 30, jitterMs: 4, inverted: true, seed: 11 };
    const clean = analyzePpg(t, simulatePpg(t, o), { inverted: true });
    const v = simulatePpg(t, o).map((x, i) => (t[i] > 30 && t[i] < 31.2 ? x + 25 * Math.sin(t[i] * 17) : x));
    const hit = analyzePpg(t, v, { inverted: true });
    expect(hit.beatQuality.some(q => q < 0.75)).toBe(true);
    expect(Math.abs(hit.metrics!.rmssd - clean.metrics!.rmssd)).toBeLessThan(4);
    expect(Math.abs(hit.metrics!.hr - 64)).toBeLessThanOrEqual(2);
  });
});

describe('camera session (RGB)', () => {
  const t = frameTimes(60, 30);
  const base = simulatePpg(t, { hr: 70, rsaMs: 40, inverted: true, seed: 21, noise: 0.03 });
  const r = rng(99);
  const session = {
    t,
    inverted: true,
    channels: {
      r: base, // strong pulse
      g: base.map(v => 120 + (v - 180) * 0.25 + (r() - 0.5) * 1.5), // weaker, noisier
      b: t.map(() => 30 + (r() - 0.5) * 4), // no pulse
    },
  };
  const a = analyzeSession(session)!;

  it('picks the channel with the strongest cardiac band', () => {
    expect(a.channel).toBe('r');
    expect(a.channelSnr.r).toBeGreaterThan(a.channelSnr.b);
  });

  it('measures HR, a sane perfusion index and a quality score', () => {
    expect(Math.abs(a.metrics!.hr - 70)).toBeLessThanOrEqual(2);
    expect(a.perfusion!).toBeGreaterThan(1);
    expect(a.perfusion!).toBeLessThan(10);
    expect(a.score).toBeGreaterThan(70);
  });

  it('extracts pulse morphology consistent with the simulated wave', () => {
    const m = a.morphology!;
    expect(m.nBeats).toBeGreaterThan(40);
    expect(m.riseFrac).toBeGreaterThan(0.05);
    expect(m.riseFrac).toBeLessThan(0.45);
    expect(m.width50).toBeGreaterThan(0.1);
    expect(m.width50).toBeLessThan(0.7);
    expect(m.ba).not.toBeNull();
    expect(m.ba!).toBeLessThan(0); // b-wave is a trough of the second derivative
    expect(m.reflectionIndex).not.toBeNull();
    expect(m.reflectionIndex!).toBeGreaterThan(0.15);
    expect(m.reflectionIndex!).toBeLessThan(0.95);
  });
});

describe('simulated source → session pipeline', () => {
  it('produces a clean 60 s RGB session the pipeline reads correctly', () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const { SimulatedPpgSource } = require('../src/signal/sources');
    const s = { t: [] as number[], r: [] as number[], g: [] as number[], b: [] as number[] };
    const src = new SimulatedPpgSource({ hr: 62, rsaMs: 50 });
    src.start((x: { t: number; r: number; g: number; b: number }) => { s.t.push(x.t); s.r.push(x.r); s.g.push(x.g); s.b.push(x.b); });
    jest.advanceTimersByTime(60_000);
    src.stop();
    jest.useRealTimers();
    const a = analyzeSession({ t: s.t, channels: { r: s.r, g: s.g, b: s.b }, inverted: true })!;
    expect(s.t.length).toBeGreaterThan(1500);
    expect(Math.abs(a.metrics!.hr - 62)).toBeLessThanOrEqual(2);
    expect(a.quality).not.toBe('poor');
  });
});
