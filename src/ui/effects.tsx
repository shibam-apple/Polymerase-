import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, interpolateColor, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';

/** Loading shimmer (`background-size:240px; animation: shimmer 1.8s linear infinite`). */
export function Shimmer({ style, base = 'rgba(120,120,128,.1)', hi = 'rgba(120,120,128,.24)', period = 1800, children }: { style?: StyleProp<ViewStyle>; base?: string; hi?: string; period?: number; children?: ReactNode }) {
  const x = useSharedValue(-240);
  useEffect(() => {
    x.value = withRepeat(withTiming(240, { duration: period, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(x);
  }, [x, period]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: base }, style]}>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: 240 }, a]}>
        <LinearGradient colors={[base, hi, base]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>
      {children}
    </View>
  );
}

/** A view whose background cross-fades to each new colour after `delay` ms (the grid's colour sweep). */
export function ColorCell({ color, delay = 0, duration = 400, style, children }: { color: string; delay?: number; duration?: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const from = useSharedValue(color), to = useSharedValue(color), p = useSharedValue(1);
  useEffect(() => {
    if (to.value === color) return;
    from.value = to.value;
    to.value = color;
    p.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration }));
  }, [color, delay, duration, from, to, p]);
  const a = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(p.value, [0, 1], [from.value, to.value]) }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** Soft pulsing ring (`breathe 2.4s ease-in-out infinite`), used on today's grid square. */
export function Breathe({ radius, color = 'rgba(52,168,83,.3)' }: { radius: number; color?: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(p);
  }, [p]);
  const a = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: 1 + 0.14 * p.value }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, borderRadius: radius + 2, borderWidth: 2, borderColor: color }, a]} />;
}
