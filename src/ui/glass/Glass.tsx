import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { DAY_INK } from '../../theme';
import { InkProvider } from '../Text';
import { GLASS_TIER } from './capabilities';

const TargetCtx = createContext<RefObject<View | null> | null>(null);

/**
 * Wraps the backdrop layers (wallpaper, neutral tint). On Android, BlurViews blur this target;
 * keeping cards outside it avoids recursive blur and keeps the cost to one backdrop.
 */
export function GlassBackdrop({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useContext(TargetCtx);
  if (Platform.OS === 'android' && ref) return <BlurTargetView ref={ref} style={style}>{children}</BlurTargetView>;
  return <View style={style}>{children}</View>;
}

export function GlassProvider({ children }: { children: ReactNode }) {
  const ref = useRef<View | null>(null);
  return <TargetCtx.Provider value={ref}>{children}</TargetCtx.Provider>;
}

/** Specular edge + soft drop shadow shared by every glass surface in the design. */
export const GLASS_EDGE = 'inset 0 1px 1px rgba(255,255,255,.95), inset 0 -1px 1px rgba(255,255,255,.35), inset 0 0 18px rgba(255,255,255,.18)';
export const GLASS_DROP = '0 12px 32px rgba(0,0,0,.1)';

export type GlassProps = {
  radius: number;
  /** Top-left and bottom-right white alpha of the tint gradient (design: .72→.42, .66→.34, .8→.5). */
  tint?: [number, number];
  /** 135deg for most cards, 160deg for the hero cards. */
  angle?: 135 | 160;
  blur?: number;
  border?: number;
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
};

export function Glass({ radius, tint = [0.72, 0.42], angle = 135, blur = 24, border = 0.75, shadow = true, style, innerStyle, children, testID }: GlassProps) {
  const target = useContext(TargetCtx);
  const live = GLASS_TIER === 'live';
  // Frosted tier: no blur, so lift the tint to keep text contrast and the frosted look.
  const [a, b] = live ? tint : [Math.min(0.92, tint[0] + 0.14), Math.min(0.85, tint[1] + 0.26)];
  const end = angle === 160 ? { x: 0.34, y: 1 } : { x: 1, y: 1 };
  return (
    <View testID={testID} style={[{ borderRadius: radius, boxShadow: shadow ? GLASS_DROP : undefined }, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
        {live && (
          <BlurView
            intensity={Math.min(100, blur * 1.6)}
            tint="light"
            blurMethod="dimezisBlurViewSdk31Plus"
            blurTarget={Platform.OS === 'android' ? target ?? undefined : undefined}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient colors={[`rgba(255,255,255,${a})`, `rgba(255,255,255,${b})`]} start={{ x: 0, y: 0 }} end={end} style={StyleSheet.absoluteFill} />
        {/* Diagonal sheen: the light-catching band across thick glass. */}
        <LinearGradient colors={['rgba(255,255,255,.22)', 'rgba(255,255,255,0)', 'rgba(255,255,255,.08)']} locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill} />
      </View>
      <View style={[{ borderRadius: radius, borderWidth: 1, borderColor: `rgba(255,255,255,${border})`, boxShadow: GLASS_EDGE }, innerStyle]}>
        <InkProvider value={DAY_INK}>{children}</InkProvider>
      </View>
    </View>
  );
}
