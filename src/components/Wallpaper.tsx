import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop, LinearGradient as SvgLinear } from 'react-native-svg';
import { rand } from '../state/selectors';
import { mix, skyAt } from '../theme';

type Props = { width: number; height: number; hour: number };

/** A 0 → 1 → 0 loop on the UI thread (the design's `ease-in-out infinite` keyframes). */
function useLoop(ms: number) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: ms / 2, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(p);
  }, [p, ms]);
  return p;
}

/** Soft blob: a radial gradient fading to transparent stands in for a blurred ellipse (no filters, no Skia). */
function Glow({ id, cx, cy, rx, ry, color, opacity = 1 }: { id: string; cx: number; cy: number; rx: number; ry: number; color: string; opacity?: number }) {
  return (
    <>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.45" stopColor={color} stopOpacity={opacity * 0.55} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id})`} />
    </>
  );
}

/**
 * Day → night wallpaper for Today, after the PS5 home screen. Drawn with ordinary native views (gradients
 * + SVG) so the Android liquid-glass shader can refract it; motion is Reanimated transforms on the UI thread.
 */
export const Wallpaper = memo(function Wallpaper({ width: W, height: H, hour: hr }: Props) {
  const [top, mid, bot] = skyAt(hr);
  const dayT = (hr - 6) / 13, sunUp = dayT > -0.02 && dayT < 1.02;
  const el = sunUp ? Math.sin(Math.PI * Math.max(0, Math.min(1, dayT))) : 0;
  const night = sunUp ? Math.max(0, Math.min(1, 1 - el * 4)) : 1;
  const mT = ((hr - 19.5 + 24) % 24) / 10, moonUp = mT >= 0 && mT <= 1, mEl = moonUp ? Math.sin(Math.PI * mT) : 0;
  const sunC = mix('#ff8a4c', '#fff6dc', Math.min(1, el * 1.6));
  const sx = W * ((8 + 84 * dayT) / 100), sy = H * ((62 - 50 * el) / 100);
  const mx = W * ((10 + 80 * mT) / 100), my = H * ((58 - 42 * mEl) / 100);

  const stars = useMemo(() => Array.from({ length: 46 }, (_, i) => ({ x: rand(i, 91) * W * 1.08, y: rand(i, 17) * 460, r: rand(i, 3) > 0.85 ? 1.6 : 0.9, o: 0.35 + rand(i, 5) * 0.65 })), [W]);

  const twinkle = useLoop(4000), r1 = useLoop(22000), r2 = useLoop(26000);
  const starStyle = useAnimatedStyle(() => ({ opacity: night * 0.95 * (1 - 0.6 * twinkle.value) }));
  const rib1 = useAnimatedStyle(() => ({ transform: [{ translateX: -36 * r1.value }, { translateY: 24 * r1.value }, { rotate: `${-14 + 8 * r1.value}deg` }, { scale: 1 + 0.08 * r1.value }] }));
  const rib2 = useAnimatedStyle(() => ({ transform: [{ translateX: 30 * r2.value }, { translateY: -20 * r2.value }, { rotate: `${18 - 8 * r2.value}deg` }] }));

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      <LinearGradient colors={[top, mid, bot]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />

      {night > 0.02 && (
        <Animated.View style={[StyleSheet.absoluteFill, starStyle]}>
          <Svg width={W} height={H}>{stars.map((s, i) => <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />)}</Svg>
        </Animated.View>
      )}

      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        {sunUp && <>
          <Glow id="sunGlow" cx={sx} cy={sy} rx={170} ry={170} color={sunC} opacity={0.65} />
          <Glow id="sunHalo" cx={sx} cy={sy} rx={58} ry={58} color={sunC} opacity={0.9} />
          <Defs>
            <RadialGradient id="sunDisc" cx="40%" cy="38%" r="60%"><Stop offset="0" stopColor="#fffdf4" /><Stop offset="1" stopColor={sunC} /></RadialGradient>
          </Defs>
          <Circle cx={sx} cy={sy} r={34} fill="url(#sunDisc)" />
        </>}
        {moonUp && <>
          <Glow id="moonGlow" cx={mx} cy={my} rx={110} ry={110} color="#dce1ff" opacity={0.28} />
          <Defs>
            <RadialGradient id="moonDisc" cx="38%" cy="36%" r="60%"><Stop offset="0" stopColor="#fbfaf3" /><Stop offset="1" stopColor="#cfd3e6" /></RadialGradient>
          </Defs>
          <Circle cx={mx} cy={my} r={22} fill="url(#moonDisc)" />
        </>}
      </Svg>

      <Animated.View style={[{ position: 'absolute', left: -170, top: H * 0.3 - 60, width: 620, height: 340 }, rib1]}>
        <Svg width={620} height={340}><Glow id="rib1" cx={310} cy={170} rx={310} ry={170} color={mix(mid, bot, 0.5)} opacity={0.55} /></Svg>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: W + 140 - 520, top: H * 0.48 - 50, width: 560, height: 280 }, rib2]}>
        <Svg width={560} height={280}><Glow id="rib2" cx={280} cy={140} rx={280} ry={140} color={mix(bot, top, 0.5)} opacity={0.45} /></Svg>
      </Animated.View>

      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinear id="hill1" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={mix(bot, top, 0.35)} stopOpacity={0.55} /><Stop offset="1" stopColor={mix(top, '#000000', 0.35)} stopOpacity={0.55} /></SvgLinear>
          <SvgLinear id="hill2" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={mix(mid, top, 0.5)} stopOpacity={0.6} /><Stop offset="1" stopColor={mix(top, '#000000', 0.5)} stopOpacity={0.6} /></SvgLinear>
        </Defs>
        <Ellipse cx={W * 0.5} cy={H * 0.97} rx={W * 0.8} ry={H * 0.21} fill="url(#hill1)" />
        <Ellipse cx={W * 0.7} cy={H * 1.07} rx={W * 0.8} ry={H * 0.19} fill="url(#hill2)" />
      </Svg>
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,.08)']} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
    </View>
  );
});

/** Calm light backdrop for the other tabs: the design's neutral gradient + two soft tints. */
export function NeutralBackdrop({ width: W, height: H }: { width: number; height: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={['#f4f4f7', '#ececf1']} style={StyleSheet.absoluteFill} />
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Glow id="nt1" cx={0} cy={0} rx={W * 1.2} ry={H * 0.6} color="#ffc8be" opacity={0.45} />
        <Glow id="nt2" cx={W} cy={H * 0.3} rx={W} ry={H * 0.5} color="#c8c8ff" opacity={0.4} />
      </Svg>
    </View>
  );
}
