import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { Tab } from '../state/types';
import { accent, ink } from '../theme';
import { ease } from '../theme/motion';
import { GLASS_DROP, GLASS_EDGE, GlassFill } from '../ui/glass/Glass';
import { PressableScale } from '../ui/controls';
import { GLASS_TIER } from '../ui/glass/capabilities';
import { T } from '../ui/Text';

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

/** Clear glass runs only where the AGSL shader does. */
const CLEAR = GLASS_TIER === 'liquid';
/** A soft white halo keeps labels legible over any content under clear glass. */
const LEGIBLE = { textShadowColor: 'rgba(255,255,255,.85)', textShadowRadius: 6 };

type Props = { tab: Tab; onTab: (t: Tab) => void; quickOpen: boolean; onQuick: () => void; bottom: number; screenW: number };

export function TabBar({ tab, onTab, quickOpen, onQuick, bottom, screenW }: Props) {
  const [pillW, setPillW] = useState(0);
  const rowW = Math.min(screenW - 32, 420), rowX = (screenW - rowW) / 2;
  const idx = TABS.findIndex(t => t.id === tab), slot = (pillW - 8) / 4;
  const tx = useSharedValue(0);
  useEffect(() => { tx.value = withTiming(idx * slot, { duration: 260, easing: ease.tab }); }, [idx, slot, tx]);
  const capsule = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const rot = useSharedValue(0);
  useEffect(() => { rot.value = withTiming(quickOpen ? 45 : 0, { duration: 220, easing: ease.spring }); }, [quickOpen, rot]);
  const plus = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  // Clear glass: the bar refracts what scrolls under it (the `content` backdrop) with almost no tint or
  // frost, so the content stays sharp and bends at the rim. Blur / frosted tiers keep a denser fill.
  const glassLayers = (r: number) => (
    <>
      <GlassFill radius={r} tint={[0.34, 0.26]} backdrop="content" lens={1.6} clear={{ tint: 0.08, dispersion: 0.5 }} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 1, borderColor: CLEAR ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.6)', boxShadow: GLASS_EDGE }]} />
    </>
  );

  return (
    <View style={{ position: 'absolute', left: rowX, width: rowW, bottom, flexDirection: 'row', gap: 10, zIndex: 25 }} pointerEvents="box-none">
      <View onLayout={e => setPillW(e.nativeEvent.layout.width)} style={{ flex: 1, height: 62, borderRadius: 31, boxShadow: GLASS_DROP }}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: 31, overflow: 'hidden' }]} pointerEvents="none">
          {glassLayers(31)}
          <Animated.View style={[{ position: 'absolute', top: 4, bottom: 4, left: 4, width: slot, borderRadius: 27, backgroundColor: CLEAR ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.55)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,1), 0 2px 8px rgba(0,0,0,.06)' }, capsule]} />
        </View>
        <View style={{ flex: 1, flexDirection: 'row', padding: 4 }}>
          {TABS.map(t => {
            const c = tab === t.id ? accent.tab : ink[1];
            return (
              <PressableScale key={t.id} scaleTo={0.9} onPress={() => onTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }} accessibilityLabel={t.label} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <Icon id={t.id} color={c} />
                <T size={10} weight="600" color={c} track={0.01} style={CLEAR ? LEGIBLE : undefined}>{t.label}</T>
              </PressableScale>
            );
          })}
        </View>
      </View>
      <PressableScale scaleTo={0.9} onPress={onQuick} accessibilityLabel="Quick log" style={{ width: 62, height: 62, borderRadius: 31, boxShadow: GLASS_DROP, alignItems: 'center', justifyContent: 'center' }}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: 31, overflow: 'hidden' }]} pointerEvents="none">{glassLayers(31)}</View>
        <Animated.View style={plus}>
          <Svg width={24} height={24} viewBox="0 0 24 24"><Path d="M5 12h14M12 5v14" stroke={ink[1]} strokeWidth={2.2} strokeLinecap="round" /></Svg>
        </Animated.View>
      </PressableScale>
    </View>
  );
}
