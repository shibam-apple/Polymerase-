import { useEffect, useState } from 'react';

/** Current time, re-rendered every 30 s. `hour` is fractional (13.5 = 13:30) for the wallpaper. */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return { now, hour: now.getHours() + now.getMinutes() / 60 };
}

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Thursday, 24 September" (the design's header format). */
export const longDate = (d: Date) => `${WD[d.getDay()]}, ${d.getDate()} ${MO[d.getMonth()]}`;
