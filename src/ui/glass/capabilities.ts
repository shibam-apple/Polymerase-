import { Platform } from 'react-native';

/**
 * Glass rendering tier, fixed at startup.
 *
 * - `live`    Real backdrop blur. Android 12+ (API 31+, incl. Android 17) via RenderEffect-backed
 *             Dimezis BlurView, iOS UIVisualEffectView, web `backdrop-filter`.
 * - `frosted` Android 11 and older (API ≤ 30): live blur there is software-rendered and janky, so
 *             glass is drawn as a denser frosted fill with the same specular edges and sheen.
 *
 * Refraction on the tab bar and + button is drawn by Skia and works on both tiers.
 */
export type GlassTier = 'live' | 'frosted';

export const androidApi = Platform.OS === 'android' ? Number(Platform.Version) : null;
export const GLASS_TIER: GlassTier = androidApi != null && androidApi < 31 ? 'frosted' : 'live';
