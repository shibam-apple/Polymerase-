import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CameraPpgCapture } from '../signal/camera/CameraPpgCapture';
import { MIN_VALID_BEATS, useHeartMeasurement, type HeartReading } from '../signal/useHeartMeasurement';
import { useStore } from './store';

type HeartCtx = ReturnType<typeof useHeartMeasurement> & { last: HeartReading | null };
const Ctx = createContext<HeartCtx | null>(null);

const OUTCOME_TEXT = {
  'too-noisy': 'Not saved · signal too noisy. Keep still and press lightly',
  'too-few-beats': `Not saved · need ${MIN_VALID_BEATS} clean beats. Try the full 60 s`,
  'no-signal': 'Not saved · no pulse found. Cover the lens and flash fully',
} as const;

/** One measurement session for the whole app; the camera capture is mounted once, here. */
export function HeartProvider({ children }: { children: ReactNode }) {
  const { a } = useStore();
  const [last, setLast] = useState<HeartReading | null>(null);
  const m = useHeartMeasurement({
    onComplete: r => {
      setLast(r);
      a.saveHeart({ at: r.at, hr: r.hr, rmssd: r.rmssd, score: r.score, respRate: r.respRate, source: r.source });
    },
  });
  const { phase, outcome, status } = m.live;
  const told = useRef<string | null>(null);
  useEffect(() => {
    if (phase === 'done' && outcome && outcome !== 'saved' && told.current !== `${m.lastSession?.startedAt}`) {
      told.current = `${m.lastSession?.startedAt}`;
      a.toast(OUTCOME_TEXT[outcome]);
    }
  }, [phase, outcome, a, m.lastSession]);
  useEffect(() => {
    if (status === 'error' && m.diag.permission !== 'granted' && m.diag.permission !== 'unknown') a.toast('Camera access is needed to measure');
  }, [status, m.diag.permission, a]);
  return (
    <Ctx.Provider value={{ ...m, last }}>
      <CameraPpgCapture {...m.camera} />
      {children}
    </Ctx.Provider>
  );
}

export function useHeart() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useHeart outside HeartProvider');
  return v;
}
