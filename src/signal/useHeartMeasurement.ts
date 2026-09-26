import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { analyzePpg } from './ppg';
import type { Quality } from './quality';
import { SimulatedPpgSource, type PpgSample, type SourceStatus } from './sources';

export type SourceKind = 'camera' | 'simulated';
export type MeasurePhase = 'idle' | 'measuring' | 'done';

export type HeartReading = { hr: number; rmssd: number; sdnn: number; sd1: number; sd2: number; ibis: number[]; quality: Quality; at: number };

export type LiveState = {
  phase: MeasurePhase;
  status: SourceStatus;
  progress: number;
  hr: number | null;
  rmssd: number | null;
  quality: Quality | null;
  /** Last ~6 s of the cleaned waveform, normalised to 0–1, for the live trace. */
  trace: number[];
  /** Valid IBIs so far (ms), for the tachogram / Poincaré plot. */
  ibis: number[];
};

const IDLE: LiveState = { phase: 'idle', status: 'idle', progress: 0, hr: null, rmssd: null, quality: null, trace: [], ibis: [] };

/**
 * Drives one measurement session. The raw samples from the active source (camera or simulated)
 * are re-analysed every 500 ms on a sliding buffer; the first `warmup` seconds are discarded
 * (auto-exposure settling, finger pressure). 60 s is the conventional minimum for ultra-short RMSSD.
 */
export function useHeartMeasurement({ durationSec = 60, warmupSec = 3, onComplete }: { durationSec?: number; warmupSec?: number; onComplete?: (r: HeartReading) => void } = {}) {
  const [source, setSource] = useState<SourceKind>(Platform.OS === 'web' ? 'simulated' : 'camera');
  const [live, setLive] = useState<LiveState>(IDLE);
  const buf = useRef<{ t: number[]; v: number[] }>({ t: [], v: [] });
  const sim = useRef<SimulatedPpgSource | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = useRef(onComplete);
  useEffect(() => { done.current = onComplete; });

  const stopAll = useCallback(() => {
    sim.current?.stop(); sim.current = null;
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
  }, []);

  const onSample = useCallback((s: PpgSample) => {
    if (s.t < warmupSec) return;
    buf.current.t.push(s.t); buf.current.v.push(s.v);
  }, [warmupSec]);

  const onStatus = useCallback((status: SourceStatus) => {
    setLive(l => (l.phase === 'measuring' && l.status !== status ? { ...l, status } : l));
    if (status === 'error' && Platform.OS !== 'web') setSource('simulated');
  }, []);

  const analyse = useCallback((final: boolean) => {
    const { t, v } = buf.current;
    const elapsed = t.length ? t[t.length - 1] - t[0] : 0;
    const progress = Math.min(1, elapsed / durationSec);
    if (t.length < 90) { setLive(l => ({ ...l, progress })); return; }
    const a = analyzePpg(t, v, { inverted: true });
    const tail = a.clean.slice(Math.max(0, a.clean.length - a.fs * 6));
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < tail.length; i += 2) { lo = Math.min(lo, tail[i]); hi = Math.max(hi, tail[i]); }
    const trace: number[] = [];
    for (let i = 0; i < tail.length; i += 2) trace.push(hi > lo ? (tail[i] - lo) / (hi - lo) : 0.5);
    const ibis = a.ibis.filter(b => b.valid).map(b => b.ms);
    const m = a.metrics;
    setLive(l => ({ ...l, progress, trace, ibis, quality: a.quality, hr: m ? Math.round(m.hr) : l.hr, rmssd: m && isFinite(m.rmssd) ? Math.round(m.rmssd) : l.rmssd }));
    if (final || progress >= 1) {
      stopAll();
      setLive(l => ({ ...l, phase: 'done', progress: 1 }));
      if (m && a.quality !== 'poor') done.current?.({ hr: Math.round(m.hr), rmssd: Math.round(m.rmssd), sdnn: Math.round(m.sdnn), sd1: m.sd1, sd2: m.sd2, ibis, quality: a.quality, at: Date.now() });
    }
  }, [durationSec, stopAll]);

  const start = useCallback(() => {
    stopAll();
    buf.current = { t: [], v: [] };
    setLive({ ...IDLE, phase: 'measuring', status: 'starting' });
    if (source === 'simulated') { sim.current = new SimulatedPpgSource(); sim.current.start(onSample, onStatus); }
    tick.current = setInterval(() => analyse(false), 500);
  }, [source, stopAll, onSample, onStatus, analyse]);

  const cancel = useCallback(() => { stopAll(); setLive(IDLE); }, [stopAll]);
  const reset = useCallback(() => setLive(IDLE), []);

  useEffect(() => stopAll, [stopAll]);

  return {
    live, source, setSource, start, cancel, reset,
    /** Props for <CameraPpgCapture/>; mount it once near the heart card. */
    camera: { active: live.phase === 'measuring' && source === 'camera', onSample, onStatus },
  };
}
