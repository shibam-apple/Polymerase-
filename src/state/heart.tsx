import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CameraPpgCapture } from '../signal/camera/CameraPpgCapture';
import { useHeartMeasurement, type HeartReading } from '../signal/useHeartMeasurement';
import { useStore } from './store';

type HeartCtx = ReturnType<typeof useHeartMeasurement> & { last: HeartReading | null };
const Ctx = createContext<HeartCtx | null>(null);

/** One measurement session for the whole app; the camera capture is mounted once, here. */
export function HeartProvider({ children }: { children: ReactNode }) {
  const { a } = useStore();
  const [last, setLast] = useState<HeartReading | null>(null);
  const m = useHeartMeasurement({
    onComplete: r => {
      setLast(r);
      a.saveHeart({ at: r.at, hr: r.hr, rmssd: r.rmssd });
    },
  });
  const { status, phase, quality } = m.live;
  // Tell the user once if the camera can't be used; the hook has switched to the simulated source.
  const warned = useRef(false);
  useEffect(() => {
    if (status === 'error' && !warned.current) { warned.current = true; a.toast('Camera unavailable · using simulated signal'); }
  }, [status, a]);
  useEffect(() => {
    if (phase === 'done' && (quality === 'poor' || quality == null)) a.toast('Signal too noisy · try again, keep still');
  }, [phase, quality, a]);
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
