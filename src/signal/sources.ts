import { beatTimes, pulseAt, rng } from './simulate';

/** One brightness sample from a PPG sensor. `t` in seconds (monotonic). */
export type PpgSample = { t: number; v: number };

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
      onSample({ t, v: 180 - 6 * p });
    }, 1000 / 30);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
