import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { ease } from '../theme/motion';
import { fill } from '../theme';

const APressable = Animated.createAnimatedComponent(Pressable);

/** The design's `style-active="transform:scale(.95)"` with a springy release. */
export function PressableScale({ scaleTo = 0.95, style, children, ...rest }: Omit<PressableProps, 'style' | 'children'> & { scaleTo?: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      {...rest}
      onPressIn={e => { s.set(withTiming(scaleTo, { duration: 90 })); rest.onPressIn?.(e); }}
      onPressOut={e => { s.set(withSpring(1, { damping: 11, stiffness: 320 })); rest.onPressOut?.(e); }}
      style={[style, a]}
    >
      {children}
    </APressable>
  );
}

/** iOS-style switch: 46×28 track, 24 knob, overshooting knob travel. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  const x = useSharedValue(on ? 18 : 0);
  useEffect(() => { x.value = withTiming(on ? 18 : 0, { duration: 300, easing: ease.tab }); }, [on, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Pressable onPress={onChange} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label} hitSlop={8}>
      <View style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: on ? '#34c759' : 'rgba(120,120,128,.18)' }}>
        <Animated.View style={[{ position: 'absolute', top: 2, left: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,.15)' }, knob]} />
      </View>
    </Pressable>
  );
}

/** Thin progress bar that springs to its value (`transition: width .8s cubic-bezier(.3,1.2,.4,1)`). */
export function Bar({ frac, color, height = 6, track = fill.tertiary, width, delay = 0 }: { frac: number; color: string; height?: number; track?: string; width?: number; delay?: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    const t = setTimeout(() => { w.value = withTiming(Math.max(0, Math.min(1, frac)), { duration: 800, easing: ease.springBar }); }, delay);
    return () => clearTimeout(t);
  }, [frac, w, delay]);
  const a = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden', width, flex: width == null ? 1 : undefined }}>
      <Animated.View style={[{ height: '100%', borderRadius: height / 2, backgroundColor: color }, a]} />
    </View>
  );
}

/** Counts from `from` to `target` with ease-out cubic, restarting whenever `runKey` changes. */
export function useCountUp(target: number, { duration = 700, from, runKey }: { duration?: number; from?: number; runKey?: unknown } = {}) {
  const [shown, setShown] = useState(from ?? target);
  // `cur` mirrors what is on screen so a new target animates from there; only touched in effects.
  const cur = useRef(from ?? target);
  const lastKey = useRef(runKey);
  useEffect(() => {
    const restart = runKey !== lastKey.current;
    lastKey.current = runKey;
    const start = restart && from != null ? from : cur.current;
    const show = (v: number) => { cur.current = v; setShown(v); };
    if (start === target) { show(target); return; }
    let raf = 0;
    const t0 = Date.now();
    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / duration), e = 1 - Math.pow(1 - p, 3);
      show(Math.round(start + (target - start) * e));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, runKey]);
  return shown;
}

export const Dot = ({ color, size = 10, style }: { color: string; size?: number; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />
);

export const Hairline = ({ style }: { style?: StyleProp<ViewStyle> }) => <View style={[{ height: 0.5, backgroundColor: 'rgba(60,60,67,.14)' }, style]} />;
