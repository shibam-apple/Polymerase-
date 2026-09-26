/** What the camera is doing, surfaced on screen so failures are never silent. */
export type CameraDiag = {
  permission: 'unknown' | 'granted' | 'denied' | 'blocked';
  format: 'rgb' | 'yuv';
  frames: number;
  fps: number;
  pixelFormat: string;
  started: boolean;
  torch: 'off' | 'on' | 'failed';
  aeLocked?: boolean;
  awbLocked?: boolean;
  afLocked?: boolean;
  lastError: string;
};

export const INITIAL_DIAG: CameraDiag = { permission: 'unknown', format: 'rgb', frames: 0, fps: 0, pixelFormat: '', started: false, torch: 'off', lastError: '' };

/** First line of an error message, without the native stack trace. */
export const firstLine = (e: unknown) => String((e as Error)?.message ?? e).split('\n')[0].trim().slice(0, 160);

/** One line for the status strip / clipboard. */
export function describeDiag(d: CameraDiag): string {
  const locks = ['aeLocked', 'awbLocked', 'afLocked'].map(k => (d[k as keyof CameraDiag] === true ? k.slice(0, -6).toUpperCase() : null)).filter(Boolean).join('+');
  return [
    d.permission === 'granted' ? null : `camera access ${d.permission}`,
    d.started ? null : 'camera starting',
    `torch ${d.torch}`,
    d.fps ? `${d.fps} fps` : `${d.frames} frames`,
    d.pixelFormat || d.format,
    locks ? `locked ${locks}` : null,
    d.lastError ? `last error: ${firstLine(d.lastError)}` : null,
  ].filter(Boolean).join(' · ');
}
