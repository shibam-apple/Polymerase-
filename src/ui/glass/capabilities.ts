import { Platform } from 'react-native';
import { LIQUID_TIER } from '../../../modules/liquid-glass';

/**
 * Glass rendering tier, fixed at startup.
 *
 * - `liquid`  Android 13+ (API 33+): native AGSL shader: lens refraction, chromatic aberration,
 *             specular rim (modules/liquid-glass).
 * - `blur`    Android 12 (API 31–32): native Gaussian backdrop blur (RenderEffect). iOS and web use the
 *             platform blur (expo-blur) in this tier too.
 * - `frosted` Android 11 and older: a denser frosted fill with the same edge highlights; no live effects.
 */
export type GlassTier = 'liquid' | 'blur' | 'frosted';

export const androidApi = Platform.OS === 'android' ? Number(Platform.Version) : null;
export const GLASS_TIER: GlassTier =
  Platform.OS !== 'android' ? 'blur' : LIQUID_TIER === 'shader' ? 'liquid' : LIQUID_TIER === 'blur' ? 'blur' : 'frosted';
/** True when Android draws glass natively (liquid or blur tier). */
export const NATIVE_GLASS = Platform.OS === 'android' && LIQUID_TIER !== 'none';
