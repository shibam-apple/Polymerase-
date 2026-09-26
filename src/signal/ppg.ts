import { bandpass, resampleUniform } from './filters';
import { cleanIbis, hrvFromIbis, type HrvMetrics, type Ibi } from './hrv';
import { morphology, type Morphology } from './morphology';
import { elgendiPeaks } from './peaks';
import { respirationFromPpg, type RespResult } from './respiration';
import { beatSqis, grade, type Quality } from './quality';
import { cardiacSnr, freqHrv, perfusionIndex, type FreqHrv } from './spectral';

export type PpgAnalysis = {
  metrics: HrvMetrics | null;
  quality: Quality;
  sqi: number;
  /** Peak times in seconds since the first sample. */
  peakTimes: number[];
  /** Per-beat template correlation (NaN at the edges). */
  beatQuality: number[];
  ibis: Ibi[];
  /** Cleaned, uniformly sampled waveform (for the live trace) and its rate. */
  clean: Float64Array;
  fs: number;
  /** Breathing rate by fusion of the three respiratory modulations of the pulse. */
  resp: RespResult;
};

export type PpgOptions = {
  /** Rate the irregular input is resampled to before filtering. */
  fs?: number;
  /**
   * Camera PPG measures reflected light, which *drops* when blood volume rises, so the raw trace
   * is inverted relative to a finger-clip pleth. Sources report which way their signal points.
   */
  inverted?: boolean;
  /** Beats correlating less than this with the average beat are treated as artefacts. */
  minBeatSqi?: number;
};

/**
 * Full PPG → HR/HRV pipeline:
 * resample → invert (camera) → band-pass 0.5–8 Hz → Elgendi peaks (sub-sample) → per-beat SQI →
 * IBIs (intervals touching a bad beat are dropped) → artefact rejection → HR, RMSSD, SDNN, pNN50,
 * Poincaré → session SQI.
 */
export function analyzePpg(tSec: ArrayLike<number>, raw: ArrayLike<number>, opts: PpgOptions = {}): PpgAnalysis {
  const fs = opts.fs ?? 60, minBeat = opts.minBeatSqi ?? 0.75;
  const { y } = resampleUniform(tSec, raw, fs);
  if (opts.inverted) for (let i = 0; i < y.length; i++) y[i] = -y[i];
  const clean = y.length > fs * 2 ? bandpass(y, fs) : y;
  const peaks = elgendiPeaks(clean, fs);
  const peakTimes = peaks.map(p => p / fs);
  const bq = beatSqis(clean, peaks, fs);
  const bad = (k: number) => !Number.isNaN(bq[k]) && bq[k] < minBeat;
  const ibis = cleanIbis(peakTimes.slice(1).map((t, i) => (t - peakTimes[i]) * 1000)).map((b, i) => (bad(i) || bad(i + 1) ? { ...b, valid: false } : b));
  const metrics = hrvFromIbis(ibis);
  const q = bq.filter(v => !Number.isNaN(v));
  const sqi = q.length >= 3 ? q.reduce((a, v) => a + Math.max(0, v), 0) / q.length : 0;
  const resp = respirationFromPpg(clean, y, peaks, fs, ibis.map(b => b.valid));
  return { metrics, sqi, quality: metrics ? grade(sqi, metrics.validFraction) : 'poor', peakTimes, beatQuality: bq, ibis, clean, fs, resp };
}

export type Channel = 'r' | 'g' | 'b' | 'luma';
export type PpgSession = { t: number[]; channels: Partial<Record<Channel, number[]>>; inverted: boolean };

export type SessionAnalysis = PpgAnalysis & {
  channel: Channel;
  channelSnr: Record<string, number>;
  freq: FreqHrv | null;
  perfusion: number | null;
  morphology: Morphology | null;
  /** 0–100 summary of signal quality for the UI. */
  score: number;
};

/**
 * Multi-channel camera session: pick the colour channel with the strongest cardiac band (red is
 * usually most robust under the torch, green most pulsatile), then run the full pipeline plus
 * frequency-domain HRV, perfusion index and pulse morphology.
 */
/** Cardiac-band SNR per channel; the channel to analyse is the one with the highest. */
export function rankChannels(s: PpgSession): { best: Channel | null; snr: Record<string, number> } {
  const snr: Record<string, number> = {};
  let best: Channel | null = null;
  for (const [ch, v] of Object.entries(s.channels) as [Channel, number[]][]) {
    if (!v || v.length < 60) continue;
    const { y } = resampleUniform(s.t, v, 30);
    snr[ch] = cardiacSnr(bandpass(y, 30), 30).snr;
    if (best == null || snr[ch] > snr[best]) best = ch;
  }
  return { best, snr };
}

export function analyzeSession(
  s: PpgSession,
  opts: Omit<PpgOptions, 'inverted'> & {
    /** Reuse a previously chosen channel (live updates) instead of re-ranking every time. */
    channel?: Channel; channelSnr?: Record<string, number>;
    /** Compute frequency HRV, perfusion and morphology (final analysis); live updates skip them. */
    full?: boolean;
  } = {},
): SessionAnalysis | null {
  const fs = opts.fs ?? 60, full = opts.full ?? true;
  const ranked = opts.channel ? { best: opts.channel, snr: opts.channelSnr ?? {} } : rankChannels(s);
  const best = ranked.best, snr = ranked.snr;
  if (!best || !s.channels[best]) return null;
  const raw = s.channels[best]!;
  const a = analyzePpg(s.t, raw, { ...opts, inverted: s.inverted });
  const valid = a.ibis.map((b, i) => ({ ...b, t: a.peakTimes[i + 1] })).filter(b => b.valid);
  const freq = full ? freqHrv(valid.map(b => b.t), valid.map(b => b.ms)) : null;
  const perfusion = full ? perfusionIndex(resampleUniform(s.t, raw, fs).y, a.peakTimes.map(t => t * fs)) : null;
  const bq = a.beatQuality;
  const morph = full ? morphology(a.clean, a.peakTimes.map(t => t * fs), fs, k => !(bq[k] < 0.85) && !(bq[k + 1] < 0.85)) : null;
  const vf = a.metrics?.validFraction ?? 0;
  const score = Math.round(100 * Math.max(0, Math.min(1, 0.55 * a.sqi + 0.3 * vf + 0.15 * (snr[best] ?? 0))));
  return { ...a, channel: best, channelSnr: snr, freq, perfusion, morphology: morph, score };
}
