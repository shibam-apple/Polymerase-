import { bandpass, resampleUniform } from './filters';
import { cleanIbis, hrvFromIbis, type HrvMetrics, type Ibi } from './hrv';
import { elgendiPeaks } from './peaks';
import { grade, templateSqi, type Quality } from './quality';

export type PpgAnalysis = {
  metrics: HrvMetrics | null;
  quality: Quality;
  sqi: number;
  /** Peak times in seconds since the first sample. */
  peakTimes: number[];
  ibis: Ibi[];
  /** Cleaned, uniformly sampled waveform (for the live trace) and its rate. */
  clean: Float64Array;
  fs: number;
};

export type PpgOptions = {
  /** Rate the irregular input is resampled to before filtering. */
  fs?: number;
  /**
   * Camera PPG measures reflected light, which *drops* when blood volume rises, so the raw trace
   * is inverted relative to a finger-clip pleth. Sources report which way their signal points.
   */
  inverted?: boolean;
};

/**
 * Full PPG → HR/HRV pipeline:
 * resample → invert (camera) → band-pass 0.5–8 Hz → Elgendi peaks (sub-sample) →
 * IBIs → artefact rejection → HR, RMSSD, SDNN, pNN50, Poincaré → template-match SQI.
 */
export function analyzePpg(tSec: ArrayLike<number>, raw: ArrayLike<number>, opts: PpgOptions = {}): PpgAnalysis {
  const fs = opts.fs ?? 60;
  const { y } = resampleUniform(tSec, raw, fs);
  if (opts.inverted) for (let i = 0; i < y.length; i++) y[i] = -y[i];
  const clean = y.length > fs * 2 ? bandpass(y, fs) : y;
  const peaks = elgendiPeaks(clean, fs);
  const peakTimes = peaks.map(p => p / fs);
  const ibis = cleanIbis(peakTimes.slice(1).map((t, i) => (t - peakTimes[i]) * 1000));
  const metrics = hrvFromIbis(ibis);
  const sqi = templateSqi(clean, peaks, fs);
  return { metrics, sqi, quality: metrics ? grade(sqi, metrics.validFraction) : 'poor', peakTimes, ibis, clean, fs };
}
