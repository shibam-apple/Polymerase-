import { Blur, Canvas, DisplacementMap, Group, Paint, Turbulence } from '@shopify/react-native-skia';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { Tab } from '../state/types';
import { accent, ink } from '../theme';
import { ease } from '../theme/motion';
import { GLASS_DROP, GLASS_EDGE } from '../ui/glass/Glass';
import { GLASS_TIER } from '../ui/glass/capabilities';
import { PressableScale } from '../ui/controls';
import { T } from '../ui/Text';
import { WallpaperLayer } from './Wallpaper';
import { useLingering } from '../ui/useLingering';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' }, { id: 'progress', label: 'Progress' }, { id: 'details', label: 'Details' }, { id: 'report', label: 'Report' },
];

function Icon({ id, color }: { id: Tab; color: string }) {
  const p = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      {id === 'today' && <><Circle cx={12} cy={12} r={4} {...p} /><Path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" {...p} /></>}
      {id === 'progress' && <><Rect x={3} y={3} width={7} height={7} rx={2} {...p} /><Rect x={14} y={3} width={7} height={7} rx={2} {...p} /><Rect x={3} y={14} width={7} height={7} rx={2} {...p} /><Rect x={14} y={14} width={7} height={7} rx={2} {...p} /></>}
      {id === 'details' && <Path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" {...p} />}
      {id === 'report' && <><Path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" {...p} /><Path d="M14 2v4a2 2 0 0 0 2 2h4M9 15h6" {...p} /></>}
    </Svg>
  );
}

/**
 * Liquid-glass refraction: the wallpaper seen through the bar is displaced by low-frequency
 * turbulence and softly blurred — a port of the design's `#lgRefract` SVG filter. Drawn by Skia,
 * so it works on every Android version, including the Android 11 frosted tier.
 */
function Refraction({ x, y, w, h, screenW, screenH, hour, visible }: { x: number; y: number; w: number; h: number; screenW: number; screenH: number; hour: number; visible: boolean }) {
  const op = useSharedValue(visible ? 1 : 0);
  useEffect(() => { op.value = withTiming(visible ? 1 : 0, { duration: 800 }); }, [visible, op]);
  const a = useAnimatedStyle(() => ({ opacity: op.value }));
  const mounted = useLingering(visible);
  if (w <= 0 || !mounted) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, a]} pointerEvents="none">
      <Canvas style={{ width: w, height: h }}>
        <Group layer={<Paint><Blur blur={10} /><DisplacementMap channelX="r" channelY="g" scale={34}><Turbulence freqX={0.008} freqY={0.012} octaves={1} seed={7} /></DisplacementMap></Paint>}>
          <Group transform={[{ translateX: -x }, { translateY: -y }]}>
            <WallpaperLayer width={screenW} height={screenH} hour={hour} />
          </Group>
        </Group>
      </Canvas>
    </Animated.View>
  );
}

type Props = { tab: Tab; onTab: (t: Tab) => void; quickOpen: boolean; onQuick: () => void; bottom: number; screenW: number; screenH: number; hour: number; onWallpaper: boolean };

export function TabBar({ tab, onTab, quickOpen, onQuick, bottom, screenW, screenH, hour, onWallpaper }: Props) {
  const [pillW, setPillW] = useState(0);
  const rowW = Math.min(screenW - 32, 420), rowX = (screenW - rowW) / 2, rowY = screenH - bottom - 62;
  const idx = TABS.findIndex(t => t.id === tab), slot = (pillW - 8) / 4;
  const tx = useSharedValue(0);
  useEffect(() => { tx.value = withTiming(idx * slot, { duration: 500, easing: ease.tab }); }, [idx, slot, tx]);
  const capsule = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const rot = useSharedValue(0);
  useEffect(() => { rot.value = withTiming(quickOpen ? 45 : 0, { duration: 350, easing: ease.spring }); }, [quickOpen, rot]);
  const plus = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  // Content under the bar: blurred where the platform can blur it live; otherwise a denser fill.
  const liveUnder = GLASS_TIER === 'live' && Platform.OS !== 'android';
  const baseFill = liveUnder || onWallpaper ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.72)';

  const glassLayers = (x: number, w: number, r: number) => (
    <>
      {liveUnder && <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />}
      <Refraction x={x} y={rowY} w={w} h={62} screenW={screenW} screenH={screenH} hour={hour} visible={onWallpaper} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: baseFill }]} />
      <LinearGradient colors={['rgba(255,255,255,.55)', 'rgba(255,255,255,0)', 'rgba(255,255,255,.18)']} locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.35, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 1, borderColor: 'rgba(255,255,255,.6)', boxShadow: GLASS_EDGE }]} />
    </>
  );

  return (
    <View style={{ position: 'absolute', left: rowX, width: rowW, bottom, flexDirection: 'row', gap: 10, zIndex: 25 }} pointerEvents="box-none">
      <View onLayout={e => setPillW(e.nativeEvent.layout.width)} style={{ flex: 1, height: 62, borderRadius: 31, boxShadow: GLASS_DROP }}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: 31, overflow: 'hidden' }]} pointerEvents="none">
          {glassLayers(rowX, pillW, 31)}
          <Animated.View style={[{ position: 'absolute', top: 4, bottom: 4, left: 4, width: slot, borderRadius: 27, backgroundColor: 'rgba(255,255,255,.55)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,1), 0 2px 8px rgba(0,0,0,.06)' }, capsule]} />
        </View>
        <View style={{ flex: 1, flexDirection: 'row', padding: 4 }}>
          {TABS.map(t => {
            const c = tab === t.id ? accent.tab : ink[1];
            return (
              <PressableScale key={t.id} scaleTo={0.9} onPress={() => onTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }} accessibilityLabel={t.label} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <Icon id={t.id} color={c} />
                <T size={10} weight="600" color={c} track={0.01}>{t.label}</T>
              </PressableScale>
            );
          })}
        </View>
      </View>
      <PressableScale scaleTo={0.9} onPress={onQuick} accessibilityLabel="Quick log" style={{ width: 62, height: 62, borderRadius: 31, boxShadow: GLASS_DROP, alignItems: 'center', justifyContent: 'center' }}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: 31, overflow: 'hidden' }]} pointerEvents="none">{glassLayers(rowX + rowW - 62, 62, 31)}</View>
        <Animated.View style={plus}>
          <Svg width={24} height={24} viewBox="0 0 24 24"><Path d="M5 12h14M12 5v14" stroke={ink[1]} strokeWidth={2.2} strokeLinecap="round" /></Svg>
        </Animated.View>
      </PressableScale>
    </View>
  );
}
