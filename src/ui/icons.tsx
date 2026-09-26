import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Line icons in one weight, drawn on a 24-unit grid (SF-Symbols-like): used for the home card stats,
 * the Sleep page and the predictions.
 */
export type IconName = 'heart' | 'wave' | 'moon' | 'lungs' | 'sun' | 'alert' | 'info' | 'chevron' | 'bed' | 'sonar' | 'timer' | 'pencil' | 'spark';

export function Icon({ name, size = 20, color, weight = 2 }: { name: IconName; size?: number; color: string; weight?: number }) {
  const p = { stroke: color, strokeWidth: weight, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'heart' && <Path d="M12 20s-7.5-4.6-9.2-9.3C1.7 7.4 3.8 4.5 7 4.5c2 0 3.3 1.1 5 3 1.7-1.9 3-3 5-3 3.2 0 5.3 2.9 4.2 6.2C19.5 15.4 12 20 12 20Z" {...p} />}
      {name === 'wave' && <Path d="M2 12h3.5l2.5-6 4 12 3-9 2 3H22" {...p} />}
      {name === 'moon' && <Path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" {...p} />}
      {name === 'lungs' && <>
        <Path d="M12 4v7m0 0-2.5 2M12 11l2.5 2" {...p} />
        <Path d="M8.5 8.2C6 8.7 3.5 12.6 3.5 17c0 1.7 1 2.6 2.4 2.3 2.2-.5 3.6-1.9 3.6-4.3V9.3c0-.7-.4-1.2-1-1.1ZM15.5 8.2c2.5.5 5 4.4 5 8.8 0 1.7-1 2.6-2.4 2.3-2.2-.5-3.6-1.9-3.6-4.3V9.3c0-.7.4-1.2 1-1.1Z" {...p} />
      </>}
      {name === 'sun' && <>
        <Circle cx={12} cy={12} r={4} {...p} />
        <Path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" {...p} />
      </>}
      {name === 'alert' && <>
        <Path d="M10.3 4.2 2.7 17.5A2 2 0 0 0 4.4 20.5h15.2a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" {...p} />
        <Path d="M12 9.5v4M12 17h.01" {...p} />
      </>}
      {name === 'info' && <>
        <Circle cx={12} cy={12} r={9} {...p} />
        <Path d="M12 11v5M12 8h.01" {...p} />
      </>}
      {name === 'chevron' && <Path d="m9 6 6 6-6 6" {...p} />}
      {name === 'bed' && <Path d="M3 18V7m0 7h18v4m0-4v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01" {...p} />}
      {name === 'sonar' && <>
        <Circle cx={6} cy={12} r={1.6} {...p} />
        <Path d="M10 8.5a5 5 0 0 1 0 7M13.5 6a9 9 0 0 1 0 12M17 3.5a13 13 0 0 1 0 17" {...p} />
      </>}
      {name === 'timer' && <>
        <Circle cx={12} cy={13} r={8} {...p} />
        <Path d="M12 9v4l2.5 2M9.5 2.5h5" {...p} />
      </>}
      {name === 'pencil' && <Path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" {...p} />}
      {name === 'spark' && <Path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" {...p} />}
    </Svg>
  );
}
