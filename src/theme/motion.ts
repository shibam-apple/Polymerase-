import { Easing } from 'react-native-reanimated';

/**
 * Motion: quick and settled, no visible overshoot. All curves are ease-outs (they never pass 1), and
 * springs are close to critically damped (ζ ≈ 0.85, < 1% overshoot) so presses settle in ~200 ms.
 */
export const ease = {
  /** Default UI transition. */
  spring: Easing.bezier(0.25, 1, 0.5, 1),
  springSoft: Easing.bezier(0.22, 1, 0.36, 1),
  springBar: Easing.bezier(0.22, 1, 0.36, 1),
  sheet: Easing.bezier(0.2, 0.9, 0.3, 1),
  tab: Easing.bezier(0.3, 1, 0.4, 1),
  out: Easing.out(Easing.cubic),
};

/** Near-critically-damped spring for press feedback, selection and drag release. */
export const SNAP = { damping: 34, stiffness: 400, mass: 1 } as const;
