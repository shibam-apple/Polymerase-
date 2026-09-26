import { BlurView } from 'expo-blur';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { findNodeHandle, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LiquidGlassView } from '../../../modules/liquid-glass';
import { DAY_INK, NIGHT_INK } from '../../theme';
import { InkProvider } from '../Text';
import { GLASS_TIER, NATIVE_GLASS } from './capabilities';

/**
 * Two backdrops the glass can refract:
 *  - `wallpaper`  the sky / neutral layers behind everything (cards use this: they scroll over it)
 *  - `content`    wallpaper + scrolling content (the tab bar and sheets, which float above the scroll view)
 * A glass view must never refract a backdrop that contains it; the native side refuses that.
 */
export type BackdropKind = 'wallpaper' | 'content';
type Tags = Record<BackdropKind, number | null>;
const TagsCtx = createContext<{ tags: Tags; register: (k: BackdropKind, v: View | null) => void } | null>(null);

export function GlassProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<Tags>({ wallpaper: null, content: null });
  const register = useCallback((k: BackdropKind, v: View | null) => {
    // Tags only matter to the native Android glass (web has no findNodeHandle). Unmounts (null) are
    // ignored so a re-render can't flip the tag off and on.
    if (!NATIVE_GLASS || !v) return;
    const tag = findNodeHandle(v);
    setTags(t => (t[k] === tag ? t : { ...t, [k]: tag }));
  }, []);
  const value = useMemo(() => ({ tags, register }), [tags, register]);
  return <TagsCtx.Provider value={value}>{children}</TagsCtx.Provider>;
}

/** Marks a view as a refractable backdrop. `collapsable={false}` keeps it a real native view. */
export function GlassBackdrop({ kind = 'wallpaper', children, style }: { kind?: BackdropKind; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const register = useContext(TagsCtx)?.register;
  const ref = useCallback((v: View | null) => register?.(kind, v), [register, kind]);
  return <View ref={ref} collapsable={false} style={style}>{children}</View>;
}

export function useBackdropTag(kind: BackdropKind) {
  return useContext(TagsCtx)?.tags[kind] ?? null;
}

/** Soft drop shadow under floating glass (tab bar, + button, the home card). */
export const GLASS_DROP = '0 10px 30px rgba(0,0,0,.12)';
/** Hairline edge for glass surfaces: no inner glow. */
export const glassBorder = (dark = false) => (dark ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.45)');

const hexA = (a: number) => Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0').toUpperCase();

export type GlassVariant = 'regular' | 'clear';

/**
 * The glass fill for one surface, after Apple's Liquid Glass: smooth refraction at the rim, a flat tint,
 * a hairline rim light, and no colour fringes, sheens or glows.
 *  - `regular`: light frost + tint so text on it stays readable (the home card).
 *  - `clear`: no frost, faint tint (the tab bar and + button).
 * Per tier: AGSL lens on Android 13+; Gaussian blur on Android 12; a plain translucent fill below that
 * (with the platform blur on iOS and web). `dark` tints for the night wallpaper.
 */
export function GlassFill({ radius, variant = 'regular', dark = false, backdrop = 'wallpaper', lens = 1 }: {
  radius: number; variant?: GlassVariant; dark?: boolean; backdrop?: BackdropKind; lens?: number;
}) {
  const tag = useBackdropTag(backdrop);
  const clear = variant === 'clear';
  const rgb = dark ? '000000' : 'FFFFFF';
  if (NATIVE_GLASS && LiquidGlassView) {
    const liquid = GLASS_TIER === 'liquid';
    const alpha = liquid ? (clear ? 0.06 : dark ? 0.22 : 0.2) : clear ? 0.3 : dark ? 0.3 : 0.38;
    return (
      <LiquidGlassView
        style={StyleSheet.absoluteFill}
        backdropTag={tag}
        cornerRadius={radius}
        refraction={liquid ? lens : 0}
        bevel={Math.min(20, radius * 0.8)}
        frost={liquid ? (clear ? 0 : 10) : 20}
        specular={dark ? 0.35 : 0.6}
        tint={`#${hexA(alpha)}${rgb}`}
      />
    );
  }
  const blur = Platform.OS !== 'android';
  // Plain translucent fill; denser where there's no blur behind it, so text keeps its contrast.
  const a = dark ? (blur ? 0.3 : 0.4) : blur ? (clear ? 0.25 : 0.36) : clear ? 0.55 : 0.5;
  return (
    <>
      {blur && <BlurView intensity={clear ? 30 : 70} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? `rgba(20,20,40,${a})` : `rgba(255,255,255,${a})` }]} />
    </>
  );
}

export type GlassProps = {
  radius: number;
  /** `card` (default): a normal opaque card. `glass`: liquid glass (the home card). */
  variant?: 'card' | 'glass';
  /** Glass over a dark backdrop (the night sky): dark tint and white text. */
  dark?: boolean;
  /** Kept for call sites written against the design's glass cards. */
  tint?: [number, number];
  angle?: 135 | 160;
  blur?: number;
  border?: number;
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
};

/** Opaque, so nothing on the wallpaper (the moon, glows) shows through a card. */
export const CARD_BG = '#ffffff';
export const CARD_BORDER = 'rgba(60,60,67,.1)';
export const CARD_SHADOW = '0 6px 20px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)';

/**
 * A content card. Normal cards are solid and light with a hairline border and soft shadow; the
 * `glass` variant is liquid glass for the one hero card on the home screen.
 */
export function Glass({ radius, variant = 'card', dark = false, shadow = true, style, innerStyle, children, testID }: GlassProps) {
  if (variant === 'glass') {
    return (
      <View testID={testID} style={[{ borderRadius: radius, boxShadow: shadow ? GLASS_DROP : undefined }, style]}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
          <GlassFill radius={radius} dark={dark} />
        </View>
        <View style={[{ borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, borderColor: glassBorder(dark) }, innerStyle]}>
          <InkProvider value={dark ? NIGHT_INK : DAY_INK}>{children}</InkProvider>
        </View>
      </View>
    );
  }
  return (
    <View testID={testID} style={[{ borderRadius: radius, backgroundColor: CARD_BG, borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER, boxShadow: shadow ? CARD_SHADOW : undefined }, style]}>
      <View style={[{ borderRadius: radius }, innerStyle]}>
        <InkProvider value={DAY_INK}>{children}</InkProvider>
      </View>
    </View>
  );
}
