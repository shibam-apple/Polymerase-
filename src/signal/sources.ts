import { beatTimes, pulseAt, rng } from './simulate';

/** One brightness sample from a PPG sensor. `t` in seconds (monotonic). */
export type PpgSample = { t: number; v: number; r?: number; g?: number; b?: number; luma?: number; contact?: boolean };

export type SourceStatus = 'idle' | 'starting' | 'running' | 'no-contact' | 'error';

/**
 * Anything that can stream raw PPG: the phone camera today, a BLE wearable (e.g. Polar Verity
 * Sense raw PPG) later. The measurement hook only depends on this interface.
 */
export interface HeartSource {
  readonly id: string;
  /** Camera PPG is reflected light, which falls as blood volume rises. */
  readonly inverted: boolean;
  start(onSample: (s: PpgSample) => void, onStatus?: (s: SourceStatus) => void): void;
  stop(): void;
}

/** Realistic synthetic camera PPG at ~30 fps. Used on web, simulators and in tests. */
export class SimulatedPpgSource implements HeartSource {
  readonly id = 'simulated';
  readonly inverted = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(private opts: { hr?: number; rsaMs?: number } = {}) {}

  start(onSample: (s: PpgSample) => void, onStatus?: (s: SourceStatus) => void) {
    this.stop();
    const r = rng(Date.now() & 0xffff);
    const hr = this.opts.hr ?? 56 + Math.round(r() * 10), rsaMs = this.opts.rsaMs ?? 50 + r() * 40;
    const beats = beatTimes(600, { hr, rsaMs, seed: Math.round(r() * 1000) }), period = 60 / hr;
    const t0 = Date.now();
    onStatus?.('running');
    this.timer = setInterval(() => {
      const t = (Date.now() - t0) / 1000;
      const p = pulseAt(t, beats, period) + 0.25 * Math.sin(2 * Math.PI * 0.08 * t) + (r() - 0.5) * 0.08;
      // Like a real fingertip under the torch: strong red, weaker green, almost no blue pulse.
      const red = 180 - 6 * p, green = 60 - 2.2 * p + (r() - 0.5) * 0.6, blue = 22 + (r() - 0.5) * 1.2;
      onSample({ t, v: red, r: red, g: green, b: blue, luma: 0.299 * red + 0.587 * green + 0.114 * blue, contact: true });
    }, 1000 / 30);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
