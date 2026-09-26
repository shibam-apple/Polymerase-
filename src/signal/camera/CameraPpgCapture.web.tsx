import { useEffect } from 'react';
import type { CameraPpgCaptureProps } from './CameraPpgCapture';

/** Browsers have no torch control, so web builds always use the simulated source. */
export function CameraPpgCapture({ active, onStatus }: CameraPpgCaptureProps) {
  useEffect(() => { if (active) onStatus('error'); }, [active, onStatus]);
  return null;
}
