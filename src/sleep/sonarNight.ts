import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { Sonar } from '../../modules/sonar';
import { analyseNightAsync, decodeRecords, liveBreathing, type Complex, type NightSummary, type Stage } from './sonar';

/** Carrier tones (Hz): near-ultrasonic, 600 Hz apart, inside what phone speakers and mics reproduce. */
export const SONAR_TONES = [18900, 19500, 20100];
/** Output level before the media volume: quiet (≈ 40 dB at 1 m at typical media volume). */
export const SONAR_VOLUME = 0.3;
export const SONAR_AVAILABLE = !!Sonar;

/** A night as stored: the summary with stages packed as one character per 30 s epoch. */
export type StoredNight = Omit<NightSummary, 'stages'> & { date: string; stages: string; source: string };
const CODE: Record<Stage, string> = { out: 'o', wake: 'w', light: 'l', deep: 'd', rem: 'r' };
const DECODE: Record<string, Stage> = { o: 'out', w: 'wake', l: 'light', d: 'deep', r: 'rem' };
export const packStages = (s: Stage[]) => s.map(x => CODE[x]).join('');
export const unpackStages = (s: string): Stage[] => Array.from(s, c => DECODE[c] ?? 'wake');

/** Microphone (required) and notifications (for the overnight notice; optional). */
export async function ensureMic(): Promise<'granted' | 'denied' | 'blocked'> {
  if (Platform.OS !== 'android') return 'denied';
  const P = PermissionsAndroid.PERMISSIONS;
  if (!(await PermissionsAndroid.check(P.RECORD_AUDIO))) {
    const r = await PermissionsAndroid.request(P.RECORD_AUDIO, {
      title: 'Microphone for sleep tracking',
      message: 'Ultrasonic tracking listens only to the echo of an inaudible tone to follow your breathing. No sound is recorded or uploaded.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    if (r !== PermissionsAndroid.RESULTS.GRANTED) return r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
  }
  if (Number(Platform.Version) >= 33 && P.POST_NOTIFICATIONS) await PermissionsAndroid.request(P.POST_NOTIFICATIONS).catch(() => null);
  return 'granted';
}

/** Start overnight tracking (foreground service). Returns the recording path. */
export async function startSonarNight(): Promise<{ path: string; mediaVolume: number }> {
  if (!Sonar) throw new Error('Ultrasonic tracking needs the Android app');
  const p = await ensureMic();
  if (p !== 'granted') throw new Error(p === 'blocked' ? 'Microphone access is blocked in Settings' : 'Microphone access is needed');
  const r = await Sonar.start(SONAR_TONES, SONAR_VOLUME, false);
  return { path: r.path, mediaVolume: r.mediaVolume };
}

/** Stop without analysing (cancel). */
export async function stopSonar(): Promise<void> {
  const st = await Sonar?.stop();
  if (st?.path) await Sonar?.remove(st.path).catch(() => false);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = (() => { const t = new Uint8Array(128); for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i; return t; })();
/** base64 → bytes (no dependency on atob / Buffer). */
export function b64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, ''), n = Math.floor((clean.length * 3) / 4), out = new Uint8Array(n);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)], b = LOOKUP[clean.charCodeAt(i + 1)], c = LOOKUP[clean.charCodeAt(i + 2)], d = LOOKUP[clean.charCodeAt(i + 3)];
    const v = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < n) out[o++] = (v >> 16) & 255;
    if (o < n) out[o++] = (v >> 8) & 255;
    if (o < n) out[o++] = v & 255;
  }
  return out;
}

/** Stop, read the night's baseband, analyse it. The recording file is deleted afterwards. */
export async function finishSonarNight(run: { path: string; start: number }, onProgress?: (p: number) => void): Promise<StoredNight> {
  if (!Sonar) throw new Error('Ultrasonic tracking needs the Android app');
  const st = await Sonar.stop();
  const bytes = b64ToBytes(await Sonar.read(run.path));
  const tones = decodeRecords(bytes, SONAR_TONES.length);
  if (tones[0].re.length < 10 * 60 * 10) throw new Error('Less than 10 minutes were recorded');
  const s = await analyseNightAsync(tones, SONAR_TONES, run.start, onProgress);
  Sonar.remove(run.path).catch(() => {});
  const end = new Date(run.start + s.minutes * 60000);
  const date = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return { ...s, date, stages: packStages(s.stages), source: st.source };
}

export type CheckState = {
  phase: 'idle' | 'starting' | 'running' | 'done' | 'error';
  seconds: number;
  rate: number | null;
  wave: number[];
  /** 0–1: how clearly breathing stands out; ≥ 0.35 is usable. */
  snr: number;
  mediaVolume: number | null;
  unprocessed: boolean | null;
  error: string;
};
const IDLE: CheckState = { phase: 'idle', seconds: 0, rate: null, wave: [], snr: 0, mediaVolume: null, unprocessed: null, error: '' };

/**
 * The 30 s setup check: runs the sonar in the foreground, streams the baseband once a second and shows
 * the live breathing wave and rate, so you can compare it with your own count.
 */
export function useSonarCheck(durationSec = 30) {
  const [state, setState] = useState<CheckState>(IDLE);
  const buf = useRef<Complex[]>([]);
  const sub = useRef<{ remove(): void } | null>(null);

  const stop = useCallback(async () => {
    sub.current?.remove(); sub.current = null;
    await Sonar?.stop().catch(() => null);
  }, []);

  const start = useCallback(async () => {
    if (!Sonar) { setState({ ...IDLE, phase: 'error', error: 'Ultrasonic tracking needs the Android app' }); return; }
    setState({ ...IDLE, phase: 'starting' });
    const p = await ensureMic();
    if (p !== 'granted') { setState({ ...IDLE, phase: 'error', error: p === 'blocked' ? 'Microphone access is blocked in Settings' : 'Microphone access is needed' }); return; }
    const n = SONAR_TONES.length;
    buf.current = SONAR_TONES.map(() => ({ re: new Float64Array(0), im: new Float64Array(0) }));
    sub.current = Sonar.addListener('onFrame', e => {
      const recs = e.iq.length / (2 * n);
      buf.current = buf.current.map((z, k) => {
        const keep = Math.max(0, z.re.length + recs - 300);
        const re = new Float64Array(z.re.length + recs - keep), im = new Float64Array(re.length);
        re.set(z.re.subarray(keep)); im.set(z.im.subarray(keep));
        for (let r = 0; r < recs; r++) { re[re.length - recs + r] = e.iq[r * 2 * n + 2 * k]; im[im.length - recs + r] = e.iq[r * 2 * n + 2 * k + 1]; }
        return { re, im };
      });
      const live = liveBreathing(buf.current, SONAR_TONES);
      setState(s => ({ ...s, phase: e.seconds >= durationSec ? 'done' : 'running', seconds: e.seconds, rate: live?.rate ?? s.rate, wave: live?.wave.slice(-200) ?? s.wave, snr: live?.snr ?? s.snr }));
      if (e.seconds >= durationSec) stop();
    });
    try {
      const r = await Sonar.start(SONAR_TONES, SONAR_VOLUME, true);
      setState(s => ({ ...s, phase: 'running', mediaVolume: r.mediaVolume, unprocessed: r.unprocessed }));
    } catch (e) {
      await stop();
      setState({ ...IDLE, phase: 'error', error: String((e as Error)?.message ?? e).split('\n')[0] });
    }
  }, [durationSec, stop]);

  const cancel = useCallback(() => { stop(); setState(IDLE); }, [stop]);
  useEffect(() => () => { sub.current?.remove(); Sonar?.stop().catch(() => null); }, []);
  return { state, start, cancel };
}
