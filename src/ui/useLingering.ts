import { useEffect, useState } from 'react';

/**
 * True while `on`, and for `ms` after it turns off, so a fade-out can finish before the view unmounts.
 * Used to stop hidden Skia canvases (wallpaper, refraction) from animating on every other tab.
 */
export function useLingering(on: boolean, ms = 900) {
  const [mounted, setMounted] = useState(on);
  useEffect(() => {
    // Only the "off" edge needs state: while `on`, the hook returns true regardless.
    const id = setTimeout(() => setMounted(on), on ? 0 : ms);
    return () => clearTimeout(id);
  }, [on, ms]);
  return on || mounted;
}
