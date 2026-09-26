import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { findNodeHandle, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LiquidGlassView } from '../../../modules/liquid-glass';
import { DAY_INK } from '../../theme';
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

/** Specular edge + soft drop shadow shared by every glass surface in the design. */
export const GLASS_EDGE = 'inset 0 1px 1px rgba(255,255,255,.95), inset 0 -1px 1px rgba(255,255,255,.35), inset 0 0 18px rgba(255,255,255,.18)';
export const GLASS_DROP = '0 12px 32px rgba(0,0,0,.1)';

const hexA = (a: number) => Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0').toUpperCase();

/**
 * The glass fill for one surface, per tier. Used by cards (`Glass`), the tab bar and sheets.
 * On `liquid`, the shader tints the glass itself, so only a faint sheen is layered on top.
 */
export function GlassFill({ radius, tint, angle = 135, blur = 24, backdrop = 'wallpaper', lens = 1, clear }: {
  radius: number; tint: [number, number]; angle?: 135 | 160; blur?: number; backdrop?: BackdropKind; lens?: number;
  /** Liquid tier only: clear glass (no frost, faint tint, stronger refraction and dispersion). `tint` still applies to the fallbacks. */
  clear?: { tint: number; dispersion?: number };
}) {
  const tag = useBackdropTag(backdrop);
  const end = angle === 160 ? { x: 0.34, y: 1 } : { x: 1, y: 1 };
  const avg = (tint[0] + tint[1]) / 2;
  if (NATIVE_GLASS && LiquidGlassView) {
    const liquid = GLASS_TIER === 'liquid';
    const isClear = liquid && !!clear;
    return (
      <>
        <LiquidGlassView
          style={StyleSheet.absoluteFill}
          backdropTag={tag}
          cornerRadius={radius}
          refraction={liquid ? 1.1 * lens : 0}
          dispersion={isClear ? clear!.dispersion ?? 0.5 : 0.35}
          bevel={Math.min(22, radius * 0.9)}
          frost={isClear ? 0 : liquid ? 2 : blur * 0.6}
          specular={isClear ? 0.9 : 0.7}
          tint={`#${hexA(isClear ? clear!.tint : liquid ? avg * 0.75 : avg)}FFFFFF`}
        />
        <LinearGradient colors={[`rgba(255,255,255,${isClear ? 0.1 : 0.16})`, 'rgba(255,255,255,0)', 'rgba(255,255,255,.05)']} locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill} />
      </>
    );
  }
  const live = GLASS_TIER === 'blur';
  // Frosted tier: no blur, so lift the tint to keep text contrast and the frosted look.
  const [a, b] = live ? tint : [Math.min(0.92, tint[0] + 0.14), Math.min(0.85, tint[1] + 0.26)];
  return (
    <>
      {live && Platform.OS !== 'android' && <BlurView intensity={Math.min(100, blur * 1.6)} tint="light" style={StyleSheet.absoluteFill} />}
      <LinearGradient colors={[`rgba(255,255,255,${a})`, `rgba(255,255,255,${b})`]} start={{ x: 0, y: 0 }} end={end} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(255,255,255,.22)', 'rgba(255,255,255,0)', 'rgba(255,255,255,.08)']} locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill} />
    </>
  );
}

export type GlassProps = {
  radius: number;
  /** Kept for call sites written against the design's glass cards; content cards now render flat. */
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
 * A normal content card: solid and light, hairline border, soft shadow. Liquid glass is reserved for
 * the navigation (tab bar, + button) so text on cards is always legible, day or night.
 */
export function Glass({ radius, shadow = true, style, innerStyle, children, testID }: GlassProps) {
  return (
    <View testID={testID} style={[{ borderRadius: radius, backgroundColor: CARD_BG, borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER, boxShadow: shadow ? CARD_SHADOW : undefined }, style]}>
      <View style={[{ borderRadius: radius }, innerStyle]}>
        <InkProvider value={DAY_INK}>{children}</InkProvider>
      </View>
    </View>
  );
}
