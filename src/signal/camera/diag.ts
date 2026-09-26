/** What the camera is doing, surfaced on screen so failures are never silent. */
export type CameraDiag = {
  permission: 'unknown' | 'granted' | 'denied' | 'blocked';
  format: 'rgb' | 'yuv';
  frames: number;
  fps: number;
  pixelFormat: string;
  started: boolean;
  aeLocked?: boolean;
  awbLocked?: boolean;
  afLocked?: boolean;
  lastError: string;
};

export const INITIAL_DIAG: CameraDiag = { permission: 'unknown', format: 'rgb', frames: 0, fps: 0, pixelFormat: '', started: false, lastError: '' };

/** One line for the status strip / clipboard. */
export function describeDiag(d: CameraDiag): string {
  const locks = ['aeLocked', 'awbLocked', 'afLocked'].map(k => (d[k as keyof CameraDiag] === true ? k.slice(0, -6).toUpperCase() : null)).filter(Boolean).join('+');
  return [
    `perm ${d.permission}`,
    d.started ? 'camera on' : 'camera off',
    `${d.frames} frames`,
    d.fps ? `${d.fps} fps` : null,
    d.pixelFormat || d.format,
    locks ? `locked ${locks}` : null,
    d.lastError ? `error: ${d.lastError}` : null,
  ].filter(Boolean).join(' · ');
}
