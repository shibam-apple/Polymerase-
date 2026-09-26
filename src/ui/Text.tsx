import { createContext, useContext, type ReactNode } from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { DAY_INK, type Ink } from '../theme';

/**
 * Text ink follows the surface: on the Today wallpaper it flips to white after dusk, while every
 * glass card resets it to dark (the design sets `--ink` per card).
 */
const InkCtx = createContext<Ink>(DAY_INK);
export const InkProvider = ({ value, children }: { value: Ink; children: ReactNode }) => <InkCtx.Provider value={value}>{children}</InkCtx.Provider>;
export const useInk = () => useContext(InkCtx);

type Tone = 'ink' | 'ink2' | 'ink3';
export type TProps = TextProps & {
  size?: number;
  weight?: TextStyle['fontWeight'];
  tone?: Tone;
  color?: string;
  track?: number;
  tabular?: boolean;
  center?: boolean;
  lh?: number;
};

/** Letter-spacing in the design is in em; convert to points for RN. */
export function T({ size = 16, weight, tone = 'ink', color, track, tabular, center, lh, style, ...rest }: TProps) {
  const ink = useInk();
  return (
    <Text
      {...rest}
      style={[
        {
          fontSize: size,
          fontWeight: weight,
          color: color ?? ink[tone],
          letterSpacing: track != null ? track * size : undefined,
          fontVariant: tabular ? ['tabular-nums'] : undefined,
          textAlign: center ? 'center' : undefined,
          lineHeight: lh != null ? lh * size : undefined,
        },
        style,
      ]}
    />
  );
}
