import { Platform, type ViewProps } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';

export type LiquidTier = 'shader' | 'blur' | 'none';

export type LiquidGlassProps = ViewProps & {
  /** React tag (findNodeHandle) of the view to refract. Must not contain this view. */
  backdropTag?: number | null;
  cornerRadius?: number;
  /** 0–2: how strongly the rim bends the backdrop. */
  refraction?: number;
  /** Width of the curved rim, dp. */
  bevel?: number;
  /** Light Gaussian frost under the lens, dp. */
  frost?: number;
  /** 0–1: hairline rim light strength. */
  specular?: number;
  /** Glass body colour, #AARRGGBB. */
  tint?: string;
};

const mod = Platform.OS === 'android' ? requireOptionalNativeModule<{ tier: LiquidTier }>('LiquidGlass') : null;

/** "shader" on Android 13+ (AGSL), "blur" on Android 12, otherwise "none". */
export const LIQUID_TIER: LiquidTier = mod?.tier ?? 'none';

export const LiquidGlassView = LIQUID_TIER !== 'none' ? requireNativeView<LiquidGlassProps>('LiquidGlass', 'LiquidGlassView') : null;
