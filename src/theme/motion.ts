import { Easing } from 'react-native-reanimated';

/** The design's CSS easings, as Reanimated curves. */
export const ease = {
  spring: Easing.bezier(0.34, 1.56, 0.64, 1),
  springSoft: Easing.bezier(0.3, 1.3, 0.5, 1),
  springBar: Easing.bezier(0.3, 1.2, 0.4, 1),
  sheet: Easing.bezier(0.2, 1.1, 0.3, 1),
  tab: Easing.bezier(0.3, 1.35, 0.5, 1),
  out: Easing.out(Easing.cubic),
};
