import { acfRate, analyseNight, analyseNightAsync, decodeRecords, displacement, epochs, fitCircle, liveBreathing, type Complex } from '../src/sleep/sonar';
import { rng } from '../src/signal/simulate';

const FS = 10, TONES = [18900, 19500, 20100];
const g = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());

type Seg = { sec: number; bpm?: number; ampMm?: number; jitter?: number; move?: boolean; absent?: boolean };
/** Synthetic baseband for each tone: static vector + chest echo + clock drift + noise. */
function night(segs: Seg[], seed = 1): Complex[] {
  const r = rng(seed), n = segs.reduce((a, s) => a + s.sec * FS, 0);
  const d = new Float64Array(n), present = new Float64Array(n);
  let i = 0, phase = 0, walk = 0;
  for (const s of segs) {
    for (let k = 0; k < s.sec * FS; k++, i++) {
      const f = ((s.bpm ?? 14) / 60) * (1 + (s.jitter ?? 0.03) * g(r));
      phase += (2 * Math.PI * f) / FS;
      if (s.move) walk += 1.5 * g(r);
      d[i] = (s.ampMm ?? 4) * 0.5 * Math.sin(phase) + walk;
      present[i] = s.absent ? 0.02 : 1;
    }
  }
  return TONES.map((hz, t) => {
    const lam = (343 / hz) * 1000, re = new Float64Array(n), im = new Float64Array(n);
    const S = 3, A = 1, phi0 = t * 1.3, drift = 0.0004;
    for (let k = 0; k < n; k++) {
      const a = (4 * Math.PI * d[k]) / lam + phi0, dr = drift * k;
      const zr = S * Math.cos(0.7) + present[k] * A * Math.cos(a), zi = S * Math.sin(0.7) + present[k] * A * Math.sin(a);
      re[k] = zr * Math.cos(dr) - zi * Math.sin(dr) + 0.03 * g(r);
      im[k] = zr * Math.sin(dr) + zi * Math.cos(dr) + 0.03 * g(r);
    }
    return { re, im };
  });
}

describe('sonar signal processing', () => {
  it('fits the circle traced by the chest echo around the static vector', () => {
    const x: number[] = [], y: number[] = [];
    for (let a = 0.2; a < 2.6; a += 0.05) { x.push(3 + 1.5 * Math.cos(a)); y.push(-2 + 1.5 * Math.sin(a)); }
    const c = fitCircle(x, y)!;
    expect(c.cx).toBeCloseTo(3, 3); expect(c.cy).toBeCloseTo(-2, 3); expect(c.r).toBeCloseTo(1.5, 3);
  });

  it('recovers chest displacement in millimetres despite a strong static vector and clock drift', () => {
    const z = night([{ sec: 30, bpm: 12, ampMm: 5, jitter: 0 }])[1];
    const d = displacement(z, TONES[1])!;
    const mm = Array.from(d.mm).slice(20), p2p = Math.max(...mm) - Math.min(...mm);
    expect(p2p).toBeGreaterThan(4);
    expect(p2p).toBeLessThan(6.5);
  });

  for (const bpm of [8, 12, 16, 24]) {
    it(`measures ${bpm} breaths/min within ±1`, () => {
      const ep = epochs(night([{ sec: 90, bpm, jitter: 0.02 }], bpm), TONES);
      for (const e of ep) {
        expect(e.present).toBe(true);
        expect(Math.abs(e.rate! - bpm)).toBeLessThanOrEqual(1);
      }
    });
  }

  it('reports an empty bed as not present', () => {
    const ep = epochs(night([{ sec: 60, absent: true }]), TONES);
    expect(ep.every(e => !e.present)).toBe(true);
  });

  it('flags movement', () => {
    const ep = epochs(night([{ sec: 60 }, { sec: 30, move: true }, { sec: 60 }]), TONES);
    const m = ep.map(e => e.motion);
    expect(m[2]).toBeGreaterThan(3 * Math.max(m[0], m[4]));
  });

  it('decodes the native little-endian float32 record layout', () => {
    const f = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const t = decodeRecords(new Uint8Array(f.buffer), 3);
    expect(Array.from(t[1].re)).toEqual([3, 9]);
    expect(Array.from(t[2].im)).toEqual([6, 12]);
  });

  it('gives a live breathing rate for the setup check', () => {
    const live = liveBreathing(night([{ sec: 20, bpm: 15 }]), TONES)!;
    expect(Math.abs(live.rate! - 15)).toBeLessThanOrEqual(1);
    expect(live.wave.length).toBe(200);
  });

  it('autocorrelation rate ignores a missing signal', () => {
    expect(acfRate(new Float64Array(300))).toBeNull();
  });
});

describe('a synthetic night', () => {
  // 15 min restless in bed → sleep with steady and irregular stretches, two breathing pauses and one
  // wake-up with movement, then out of bed.
  const segs: Seg[] = [];
  for (let m = 0; m < 15; m++) segs.push({ sec: 40, bpm: 16 }, { sec: 20, bpm: 16, move: true });
  segs.push({ sec: 30 * 60, bpm: 14, jitter: 0.12 });            // light
  segs.push({ sec: 30 * 60, bpm: 13, jitter: 0.01 });            // deep: very regular
  segs.push({ sec: 2 * 60, bpm: 14, move: true });               // wake-up
  segs.push({ sec: 50 * 60, bpm: 14, jitter: 0.12 });
  segs.push({ sec: 5 * 60, bpm: 13, jitter: 0.02 });
  segs.push({ sec: 15, bpm: 13, ampMm: 0.1 });                    // pause (apnea-like)
  segs.push({ sec: 5 * 60, bpm: 13, jitter: 0.02 });
  segs.push({ sec: 15, bpm: 13, ampMm: 0.1 });                    // pause
  segs.push({ sec: 30 * 60, bpm: 15, jitter: 0.3 });            // REM-like: irregular, still
  segs.push({ sec: 5 * 60, absent: true });                       // out of bed
  const s = analyseNight(night(segs, 5), TONES, 0);

  it('finds sleep onset after the restless first quarter hour', () => {
    expect(s.onsetMin!).toBeGreaterThanOrEqual(13);
    expect(s.onsetMin!).toBeLessThanOrEqual(19);
  });
  it('counts the wake-up and ends out of bed', () => {
    expect(s.wakeups).toBeGreaterThanOrEqual(1);
    expect(s.stages[s.stages.length - 1]).toBe('out');
  });
  it('estimates deep and REM stages and a sensible breathing rate', () => {
    expect(s.minutesBy.deep).toBeGreaterThan(10);
    expect(s.minutesBy.rem).toBeGreaterThan(10);
    expect(s.rate!.avg).toBeGreaterThan(12);
    expect(s.rate!.avg).toBeLessThan(16);
  });
  it('detects the breathing pauses', () => {
    expect(s.events.apnea + s.events.hypopnea).toBeGreaterThanOrEqual(2);
    expect(s.events.apnea + s.events.hypopnea).toBeLessThanOrEqual(4);
  });
});

it('gives the same result in chunks (async) as in one pass', async () => {
  const tones = night([{ sec: 25 * 60, bpm: 14, jitter: 0.05 }, { sec: 60, move: true }, { sec: 10 * 60, bpm: 13 }], 9);
  const a = analyseNight(tones, TONES, 0);
  let last = 0;
  const b = await analyseNightAsync(tones, TONES, 0, p => { last = p; });
  expect(b.stages).toEqual(a.stages);
  expect(b.rate).toEqual(a.rate);
  expect(last).toBe(1);
});
