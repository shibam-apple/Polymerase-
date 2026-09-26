import { SNAP } from '../theme/motion';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const MOOD_TRACK = ['#6e6af0', '#40b4d0', '#a1a1a6', '#3ec46d', '#ff9f0a'] as const;

/**
 * The design's range input: 6 pt track (mood gradient or neutral), 28 pt white thumb. Drag or tap
 * anywhere on the track; values snap to `step`.
 */
export function Slider({ value, min, max, step, onChange, neutral, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; neutral?: boolean; label: string }) {
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const frac = (value - min) / (max - min);
  useEffect(() => { if (w) x.value = withSpring(frac * (w - 28), SNAP); }, [frac, w, x]);
  const emit = (px: number) => {
    const f = Math.max(0, Math.min(1, (px - 14) / Math.max(1, w - 28)));
    const v = Math.round((min + f * (max - min)) / step) * step;
    onChange(Math.round(v * 10) / 10);
  };
  const pan = Gesture.Pan().minDistance(0).onBegin(e => runOnJS(emit)(e.x)).onChange(e => runOnJS(emit)(e.x));
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <GestureDetector gesture={pan}>
      <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ flex: 1, height: 32, justifyContent: 'center' }} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min, max, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={e => onChange(Math.min(max, Math.max(min, value + (e.nativeEvent.actionName === 'increment' ? step : -step))))}>
        {neutral ? <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(120,120,128,.2)' }} />
          : <LinearGradient colors={MOOD_TRACK} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 6, borderRadius: 3 }} />}
        <Animated.View style={[{ position: 'absolute', left: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.2), 0 0 0 .5px rgba(0,0,0,.06)' }, thumb]} />
      </View>
    </GestureDetector>
  );
}
