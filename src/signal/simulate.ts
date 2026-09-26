/**
 * Synthetic PPG generator, used by tests, web and the emulator. Each beat is a systolic Gaussian
 * plus a smaller, later reflected wave (dicrotic notch). Beat-to-beat intervals carry respiratory
 * sinus arrhythmia so RMSSD is controllable.
 */
export type SimOptions = {
  hr: number;
  /** Peak-to-peak RSA swing of the IBI, ms. RMSSD ≈ rsaMs · π · f_resp / f_hr … roughly tracks it. */
  rsaMs?: number;
  respHz?: number;
  jitterMs?: number;
  noise?: number;
  wander?: number;
  /** Mimic camera PPG: reflected light drops as blood volume rises. */
  inverted?: boolean;
  seed?: number;
};

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1_000_000) / 1_000_000; };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());

export function beatTimes(durSec: number, o: SimOptions): number[] {
  const r = rng((o.seed ?? 7) + 101), base = 60000 / o.hr, out: number[] = [];
  let t = 0.2;
  while (t < durSec + 2) {
    out.push(t);
    const ibi = base + ((o.rsaMs ?? 40) / 2) * Math.sin(2 * Math.PI * (o.respHz ?? 0.25) * t) + gauss(r) * (o.jitterMs ?? 8);
    t += ibi / 1000;
  }
  return out;
}

export function pulseAt(t: number, beats: number[], periodSec: number): number {
  let v = 0;
  for (const b of beats) {
    const d = t - b;
    if (d < -0.3) break;
    if (d > 1.2) continue;
    const w = Math.min(1, periodSec / 0.9);
    v += Math.exp(-(((d - 0.12 * w) / (0.07 * w)) ** 2)) + 0.45 * Math.exp(-(((d - 0.38 * w) / (0.11 * w)) ** 2));
  }
  return v;
}

/** Sample the waveform at the given times (seconds). Returns camera-like intensity values. */
export function simulatePpg(times: number[], o: SimOptions): number[] {
  const r = rng(o.seed ?? 7), beats = beatTimes(times[times.length - 1] ?? 0, o), period = 60 / o.hr;
  return times.map(t => {
    const p = pulseAt(t, beats, period) + (o.wander ?? 0.3) * Math.sin(2 * Math.PI * 0.08 * t) + gauss(r) * (o.noise ?? 0.03);
    return o.inverted ? 180 - 6 * p : p;
  });
}

/** Camera-like irregular timestamps around `fps`. */
export function frameTimes(durSec: number, fps = 30, jitter = 0.15, seed = 3): number[] {
  const r = rng(seed), out: number[] = [];
  for (let t = 0; t < durSec; t += (1 / fps) * (1 + (r() - 0.5) * 2 * jitter)) out.push(t);
  return out;
}
