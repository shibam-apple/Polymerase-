import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Morphology } from './morphology';
import { analyzeSession, rankChannels, type Channel } from './ppg';
import type { Quality } from './quality';
import { SimulatedPpgSource, type PpgSample, type SourceStatus } from './sources';

export type SourceKind = 'camera' | 'simulated';
export type MeasurePhase = 'idle' | 'measuring' | 'done';

export type HeartReading = {
  hr: number; rmssd: number; sdnn: number; sd1: number; sd2: number; ibis: number[]; quality: Quality; at: number;
  respRate: number | null; lfHf: number | null; perfusion: number | null; score: number; channel: Channel; morphology: Morphology | null;
};

/** Everything needed to replay a measurement offline (shared from Diagnostics). */
export type RawSession = {
  version: 1;
  source: SourceKind;
  startedAt: number;
  t: number[]; r: number[]; g: number[]; b: number[]; contact: number[];
  info: Record<string, string | number | boolean>;
};

export type LiveState = {
  phase: MeasurePhase;
  status: SourceStatus;
  progress: number;
  hr: number | null;
  rmssd: number | null;
  quality: Quality | null;
  score: number | null;
  respRate: number | null;
  perfusion: number | null;
  channel: Channel | null;
  /** Last ~6 s of the cleaned waveform, normalised to 0–1, for the live trace. */
  trace: number[];
  /** Valid IBIs so far (ms), for the tachogram / Poincaré plot. */
  ibis: number[];
};

const IDLE: LiveState = { phase: 'idle', status: 'idle', progress: 0, hr: null, rmssd: null, quality: null, score: null, respRate: null, perfusion: null, channel: null, trace: [], ibis: [] };
const r1 = (v: number | null | undefined) => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);

/**
 * Drives one measurement session. Raw R/G/B samples from the active source (camera or simulated)
 * are re-analysed every 500 ms; the first `warmupSec` are discarded (torch + 3A settling, finger
 * pressure). 60 s is the conventional minimum for ultra-short RMSSD.
 */
export function useHeartMeasurement({ durationSec = 60, warmupSec = 3, onComplete }: { durationSec?: number; warmupSec?: number; onComplete?: (r: HeartReading) => void } = {}) {
  const [source, setSource] = useState<SourceKind>(Platform.OS === 'web' ? 'simulated' : 'camera');
  const [live, setLive] = useState<LiveState>(IDLE);
  const [lastSession, setLastSession] = useState<RawSession | null>(null);
  const buf = useRef<RawSession | null>(null);
  const sim = useRef<SimulatedPpgSource | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  // Channel choice is re-ranked every 10 s of data, not every tick (the ranking is the costly part).
  const chan = useRef<{ ch: Channel; snr: Record<string, number>; at: number } | null>(null);
  const done = useRef(onComplete);
  useEffect(() => { done.current = onComplete; });

  const stopAll = useCallback(() => {
    sim.current?.stop(); sim.current = null;
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
  }, []);

  const onSample = useCallback((s: PpgSample) => {
    const b = buf.current;
    if (!b || s.t < warmupSec) return;
    b.t.push(s.t); b.r.push(s.r ?? s.v); b.g.push(s.g ?? s.v); b.b.push(s.b ?? s.v); b.contact.push(s.contact === false ? 0 : 1);
  }, [warmupSec]);

  const onStatus = useCallback((status: SourceStatus) => {
    setLive(l => (l.phase === 'measuring' && l.status !== status ? { ...l, status } : l));
    if (status === 'error' && Platform.OS !== 'web') setSource('simulated');
  }, []);

  const onInfo = useCallback((info: Record<string, string | number | boolean>) => {
    if (buf.current) buf.current.info = { ...buf.current.info, ...info };
  }, []);

  const analyse = useCallback((final: boolean) => {
    const s = buf.current;
    if (!s) return;
    const elapsed = s.t.length ? s.t[s.t.length - 1] - s.t[0] : 0;
    const progress = Math.min(1, elapsed / durationSec);
    if (s.t.length < 90) { setLive(l => ({ ...l, progress })); return; }
    const sess = { t: s.t, channels: { r: s.r, g: s.g, b: s.b }, inverted: true };
    const doneNow = final || progress >= 1;
    if (!doneNow && (!chan.current || elapsed - chan.current.at >= 10)) {
      const { best, snr } = rankChannels(sess);
      if (best) chan.current = { ch: best, snr, at: elapsed };
    }
    const a = doneNow ? analyzeSession(sess, { full: true }) : analyzeSession(sess, { full: false, channel: chan.current?.ch, channelSnr: chan.current?.snr });
    if (!a) { setLive(l => ({ ...l, progress })); return; }
    const tail = a.clean.slice(Math.max(0, a.clean.length - a.fs * 6));
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < tail.length; i += 2) { lo = Math.min(lo, tail[i]); hi = Math.max(hi, tail[i]); }
    const trace: number[] = [];
    for (let i = 0; i < tail.length; i += 2) trace.push(hi > lo ? (tail[i] - lo) / (hi - lo) : 0.5);
    const ibis = a.ibis.filter(b => b.valid).map(b => b.ms);
    const m = a.metrics;
    setLive(l => ({
      ...l, progress, trace, ibis, quality: a.quality, score: a.score, channel: a.channel,
      perfusion: a.perfusion != null ? r1(a.perfusion) : l.perfusion, respRate: a.freq?.respRate ?? l.respRate,
      hr: m ? Math.round(m.hr) : l.hr, rmssd: m && isFinite(m.rmssd) ? Math.round(m.rmssd) : l.rmssd,
    }));
    if (doneNow) {
      stopAll();
      setLive(l => ({ ...l, phase: 'done', progress: 1 }));
      setLastSession({ ...s, info: { ...s.info, channel: a.channel, score: a.score, hr: m ? Math.round(m.hr) : 0 } });
      if (m && a.quality !== 'poor') {
        done.current?.({
          hr: Math.round(m.hr), rmssd: Math.round(m.rmssd), sdnn: Math.round(m.sdnn), sd1: m.sd1, sd2: m.sd2, ibis, quality: a.quality, at: Date.now(),
          respRate: a.freq?.respRate ?? null, lfHf: r1(a.freq?.lfHf), perfusion: r1(a.perfusion), score: a.score, channel: a.channel, morphology: a.morphology,
        });
      }
    }
  }, [durationSec, stopAll]);

  const start = useCallback(() => {
    stopAll();
    chan.current = null;
    buf.current = { version: 1, source, startedAt: Date.now(), t: [], r: [], g: [], b: [], contact: [], info: { platform: Platform.OS, os: String(Platform.Version) } };
    setLive({ ...IDLE, phase: 'measuring', status: 'starting' });
    if (source === 'simulated') { sim.current = new SimulatedPpgSource(); sim.current.start(onSample, onStatus); }
    tick.current = setInterval(() => analyse(false), 500);
  }, [source, stopAll, onSample, onStatus, analyse]);

  const cancel = useCallback(() => { stopAll(); setLive(IDLE); }, [stopAll]);
  const reset = useCallback(() => setLive(IDLE), []);

  useEffect(() => stopAll, [stopAll]);

  return {
    live, source, setSource, start, cancel, reset, lastSession,
    /** Props for <CameraPpgCapture/>; mount it once near the heart card. */
    camera: { active: live.phase === 'measuring' && source === 'camera', onSample, onStatus, onInfo },
  };
}
