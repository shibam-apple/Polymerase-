import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { INITIAL_DIAG, type CameraDiag } from './camera/diag';
import type { Morphology } from './morphology';
import { analyzeSession, rankChannels, type Channel } from './ppg';
import type { Quality } from './quality';
import { SimulatedPpgSource, type PpgSample, type SourceStatus } from './sources';

export type SourceKind = 'camera' | 'simulated';
export type MeasurePhase = 'idle' | 'measuring' | 'done';

export type HeartReading = {
  hr: number; rmssd: number; sdnn: number; sd1: number; sd2: number; ibis: number[]; quality: Quality; at: number;
  respRate: number | null; lfHf: number | null; perfusion: number | null; score: number; channel: Channel; morphology: Morphology | null;
  source: SourceKind;
};

/** Everything needed to replay a measurement offline (shared from the Heart screen). */
export type RawSession = {
  version: 1;
  source: SourceKind;
  startedAt: number;
  t: number[]; r: number[]; g: number[]; b: number[];
  info: Record<string, string | number | boolean>;
};

/** Why a finished measurement was or wasn't saved. */
export type Outcome = 'saved' | 'too-noisy' | 'too-few-beats' | 'no-signal';

export type LiveState = {
  phase: MeasurePhase;
  status: SourceStatus;
  /** Seconds of finger-on-lens signal collected (the timer pauses when the finger lifts). */
  contactSec: number;
  progress: number;
  hr: number | null;
  rmssd: number | null;
  quality: Quality | null;
  score: number | null;
  respRate: number | null;
  perfusion: number | null;
  channel: Channel | null;
  validBeats: number;
  outcome: Outcome | null;
  /** Last ~6 s of the cleaned waveform, normalised to 0–1, for the live trace. */
  trace: number[];
  /** Valid IBIs so far (ms), for the tachogram / Poincaré plot. */
  ibis: number[];
};

const IDLE: LiveState = { phase: 'idle', status: 'idle', contactSec: 0, progress: 0, hr: null, rmssd: null, quality: null, score: null, respRate: null, perfusion: null, channel: null, validBeats: 0, outcome: null, trace: [], ibis: [] };
const r1 = (v: number | null | undefined) => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
/** A save needs this many clean beats (≈ 40–60 s at rest). */
export const MIN_VALID_BEATS = 40;

/**
 * Contact-gated buffer: only samples with the fingertip on the lens are kept, and gaps where the
 * finger lifted are closed up (timestamps shifted) so the timer effectively pauses. The first
 * `warmupSec` of contact are dropped (torch + exposure settling, finger pressure). Exported for tests.
 */
export class ContactBuffer {
  t: number[] = []; r: number[] = []; g: number[] = []; b: number[] = [];
  private lastRaw: number | null = null;
  private offset = 0;
  private contactTime = 0;
  constructor(private warmupSec: number, private maxGapSec = 0.25) {}
  push(s: PpgSample): void {
    if (s.contact === false) { this.lastRaw = null; return; }
    const dt = this.lastRaw == null ? -1 : s.t - this.lastRaw;
    const continuous = dt > 0 && dt < this.maxGapSec;
    if (continuous) this.contactTime += dt;
    this.lastRaw = s.t;
    if (this.contactTime < this.warmupSec) return;
    const n = this.t.length;
    // A new segment (first kept sample, finger re-placed, or dropped frames) continues one frame after
    // the last kept sample, so the analysed trace has no hole and the timer effectively paused.
    if (!continuous || n === 0) this.offset = s.t - (n ? this.t[n - 1] + 1 / 30 : 0);
    const tt = s.t - this.offset;
    if (n && tt <= this.t[n - 1]) return;
    this.t.push(tt); this.r.push(s.r ?? s.v); this.g.push(s.g ?? s.v); this.b.push(s.b ?? s.v);
  }
  get seconds(): number { return this.t.length > 1 ? this.t[this.t.length - 1] - this.t[0] : 0; }
}

/**
 * Drives one measurement session. The camera (or, on web / in dev only, the simulated source) streams
 * R/G/B samples; only finger-on-lens samples are analysed, every 500 ms. The session ends after
 * `durationSec` of contact; a result is saved only if quality isn't poor and ≥ MIN_VALID_BEATS clean
 * beats were kept. There is no silent fallback to simulated data.
 */
export function useHeartMeasurement({ durationSec = 60, warmupSec = 3, onComplete }: { durationSec?: number; warmupSec?: number; onComplete?: (r: HeartReading) => void } = {}) {
  const [source, setSource] = useState<SourceKind>(Platform.OS === 'web' ? 'simulated' : 'camera');
  const [live, setLive] = useState<LiveState>(IDLE);
  const [diag, setDiag] = useState<CameraDiag>(INITIAL_DIAG);
  const [lastSession, setLastSession] = useState<RawSession | null>(null);
  const buf = useRef<ContactBuffer | null>(null);
  const meta = useRef<{ startedAt: number; source: SourceKind }>({ startedAt: 0, source: 'camera' });
  const sim = useRef<SimulatedPpgSource | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  // Channel choice is re-ranked every 10 s of data, not every tick (the ranking is the costly part).
  const chan = useRef<{ ch: Channel; snr: Record<string, number>; at: number } | null>(null);
  const diagRef = useRef<CameraDiag>(INITIAL_DIAG);
  const done = useRef(onComplete);
  useEffect(() => { done.current = onComplete; });

  const stopAll = useCallback(() => {
    sim.current?.stop(); sim.current = null;
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
  }, []);

  const onSample = useCallback((s: PpgSample) => { buf.current?.push(s); }, []);

  const onStatus = useCallback((status: SourceStatus) => {
    setLive(l => (l.phase === 'measuring' && l.status !== status ? { ...l, status } : l));
  }, []);

  const onDiag = useCallback((d: CameraDiag) => { diagRef.current = d; setDiag(d); }, []);

  const analyse = useCallback((final: boolean) => {
    const s = buf.current;
    if (!s) return;
    const contactSec = s.seconds, progress = Math.min(1, contactSec / durationSec);
    const doneNow = final || progress >= 1;
    if (s.t.length < 90 && !doneNow) { setLive(l => ({ ...l, progress, contactSec })); return; }
    const sess = { t: s.t, channels: { r: s.r, g: s.g, b: s.b }, inverted: true };
    if (!doneNow && (!chan.current || contactSec - chan.current.at >= 10)) {
      const { best, snr } = rankChannels(sess);
      if (best) chan.current = { ch: best, snr, at: contactSec };
    }
    const a = s.t.length >= 90 ? (doneNow ? analyzeSession(sess, { full: true }) : analyzeSession(sess, { full: false, channel: chan.current?.ch, channelSnr: chan.current?.snr })) : null;
    const m = a?.metrics ?? null;
    const ibis = a ? a.ibis.filter(b => b.valid).map(b => b.ms) : [];
    if (a) {
      const tail = a.clean.slice(Math.max(0, a.clean.length - a.fs * 6));
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < tail.length; i += 2) { lo = Math.min(lo, tail[i]); hi = Math.max(hi, tail[i]); }
      const trace: number[] = [];
      for (let i = 0; i < tail.length; i += 2) trace.push(hi > lo ? (tail[i] - lo) / (hi - lo) : 0.5);
      setLive(l => ({
        ...l, progress, contactSec, trace, ibis, validBeats: ibis.length, quality: a.quality, score: a.score, channel: a.channel,
        perfusion: a.perfusion != null ? r1(a.perfusion) : l.perfusion, respRate: a.resp.rate ?? a.freq?.respRate ?? l.respRate,
        hr: m ? Math.round(m.hr) : l.hr, rmssd: m && isFinite(m.rmssd) ? Math.round(m.rmssd) : l.rmssd,
      }));
    }
    if (!doneNow) return;
    stopAll();
    const outcome: Outcome = !a || !m ? 'no-signal' : a.quality === 'poor' ? 'too-noisy' : ibis.length < MIN_VALID_BEATS ? 'too-few-beats' : 'saved';
    setLive(l => ({ ...l, phase: 'done', progress: 1, outcome }));
    setLastSession({
      version: 1, source: meta.current.source, startedAt: meta.current.startedAt, t: s.t, r: s.r, g: s.g, b: s.b,
      info: { platform: Platform.OS, os: String(Platform.Version), outcome, channel: a?.channel ?? '', score: a?.score ?? 0, hr: m ? Math.round(m.hr) : 0, rmssd: m ? Math.round(m.rmssd) : 0, ...flatDiag(diagRef.current) },
    });
    if (outcome === 'saved' && a && m) {
      done.current?.({
        hr: Math.round(m.hr), rmssd: Math.round(m.rmssd), sdnn: Math.round(m.sdnn), sd1: m.sd1, sd2: m.sd2, ibis, quality: a.quality, at: Date.now(),
        respRate: a.resp.rate ?? a.freq?.respRate ?? null, lfHf: r1(a.freq?.lfHf), perfusion: r1(a.perfusion), score: a.score, channel: a.channel, morphology: a.morphology,
        source: meta.current.source,
      });
    }
  }, [durationSec, stopAll]);

  const start = useCallback(() => {
    stopAll();
    chan.current = null;
    buf.current = new ContactBuffer(warmupSec);
    meta.current = { startedAt: Date.now(), source };
    setDiag(INITIAL_DIAG); diagRef.current = INITIAL_DIAG;
    setLive({ ...IDLE, phase: 'measuring', status: 'starting' });
    if (source === 'simulated') { sim.current = new SimulatedPpgSource(); sim.current.start(onSample, onStatus); }
    tick.current = setInterval(() => analyse(false), 500);
  }, [source, warmupSec, stopAll, onSample, onStatus, analyse]);

  /** Stop early: analyse what was collected (saved only if it meets the same rules). */
  const finish = useCallback(() => analyse(true), [analyse]);
  const cancel = useCallback(() => { stopAll(); setLive(IDLE); }, [stopAll]);
  const reset = useCallback(() => setLive(IDLE), []);

  useEffect(() => stopAll, [stopAll]);

  return {
    live, diag, source, setSource, start, finish, cancel, reset, lastSession,
    /** Props for <CameraPpgCapture/>; mount it once near the heart card. */
    camera: { active: live.phase === 'measuring' && source === 'camera', onSample, onStatus, onDiag },
  };
}

function flatDiag(d: CameraDiag): Record<string, string | number | boolean> {
  const o: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(d)) if (v !== undefined) o[`cam_${k}`] = v as string | number | boolean;
  return o;
}
