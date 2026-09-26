import { Canvas, Circle, LinearGradient as SkLinear, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring, withTiming, type EntryAnimationsValues } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MinimisedWidget } from './components/MinimisedWidget';
import { Sheet, Toast } from './components/Overlay';
import { TabBar } from './components/TabBar';
import { Wallpaper } from './components/Wallpaper';
import { Details } from './screens/Details';
import { Heart } from './screens/Heart';
import { Progress } from './screens/Progress';
import { Report } from './screens/Report';
import { Today } from './screens/Today';
import { ItemSheet, MoodSheet, QuickSheet, ShareSheet, VitalSheet } from './sheets/Sheets';
import { useNow } from './state/clock';
import { useStore } from './state/store';
import type { Tab } from './state/types';
import { DAY_INK, isNight, NIGHT_INK } from './theme';
import { GlassBackdrop } from './ui/glass/Glass';
import { InkProvider } from './ui/Text';

/** `@keyframes screenIn { from { opacity:0; transform:translateY(8px) } }`, 350 ms ease-out. */
const screenIn = (_: EntryAnimationsValues) => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 8 }] },
    animations: { opacity: withTiming(1, { duration: 350 }), transform: [{ translateY: withTiming(0, { duration: 350 }) }] },
  };
};

/** Calm light backdrop for every tab except Today (the design's neutral gradient + two soft tints). */
function NeutralBackdrop({ width: W, height: H }: { width: number; height: number }) {
  return (
    <Canvas style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }} pointerEvents="none">
      <Rect x={0} y={0} width={W} height={H}><SkLinear start={vec(0, 0)} end={vec(0, H)} colors={['#f4f4f7', '#ececf1']} /></Rect>
      <Circle cx={0} cy={0} r={Math.max(W * 1.2, H * 0.6)}><RadialGradient c={vec(0, 0)} r={Math.max(W * 1.2, H * 0.6)} colors={['rgba(255,200,190,.45)', 'rgba(255,200,190,0)']} positions={[0, 0.6]} /></Circle>
      <Circle cx={W} cy={H * 0.3} r={Math.max(W, H * 0.5)}><RadialGradient c={vec(W, H * 0.3)} r={Math.max(W, H * 0.5)} colors={['rgba(200,200,255,.4)', 'rgba(200,200,255,0)']} positions={[0, 0.6]} /></Circle>
    </Canvas>
  );
}

function useFade(on: boolean, ms = 800) {
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => { v.value = withTiming(on ? 1 : 0, { duration: ms }); }, [on, v, ms]);
  return useAnimatedStyle(() => ({ opacity: v.value }));
}

export function HealthApp() {
  const { s, a } = useStore();
  const { now, hour } = useNow();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const onWallpaper = s.tab === 'today' && !s.heartOpen;
  const night = isNight(hour);
  const ink = onWallpaper && night ? NIGHT_INK : DAY_INK;
  const scroll = useRef<ScrollView>(null);
  const [visits, setVisits] = useState<Record<Tab, number>>({ today: 0, progress: 0, details: 0, report: 0 });

  const goTab = (t: Tab) => {
    if (t !== s.tab || s.heartOpen) setVisits(v => ({ ...v, [t]: v[t] + 1 }));
    a.patch({ heartOpen: false });
    a.setTab(t);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const openHeart = (open: boolean) => { a.openHeart(open); scroll.current?.scrollTo({ y: 0, animated: false }); };

  // Android back: close the sheet, then the heart screen, then restore from minimised.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (s.sheet) { a.closeSheet(); return true; }
      if (s.heartOpen) { openHeart(false); return true; }
      if (s.minimised) { a.toggleMinimised(); return true; }
      return false;
    });
    return () => sub.remove();
  });

  const wallStyle = useFade(onWallpaper);
  const neutralStyle = useFade(!onWallpaper);
  const appV = useSharedValue(1);
  useEffect(() => { appV.value = s.minimised ? withTiming(0, { duration: 350 }) : withSpring(1, { damping: 16, stiffness: 160 }); }, [s.minimised, appV]);
  const appStyle = useAnimatedStyle(() => ({ opacity: appV.value, transform: [{ scale: 0.86 + 0.14 * appV.value }] }));
  const widgetStyle = useAnimatedStyle(() => ({ opacity: 1 - appV.value, transform: [{ scale: 1 - 0.2 * appV.value }] }));

  const screenKey = s.heartOpen ? 'heart' : s.tab;
  const bottom = 24 + insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: '#f4f4f7' }}>
      <StatusBar style={ink === NIGHT_INK ? 'light' : 'dark'} />
      <GlassBackdrop style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, neutralStyle]}><NeutralBackdrop width={W} height={H} /></Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, wallStyle]}><Wallpaper width={W} height={H} hour={hour} /></Animated.View>
      </GlassBackdrop>

      <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 5 }, widgetStyle]} pointerEvents={s.minimised ? 'auto' : 'none'}>
        <InkProvider value={ink}><MinimisedWidget /></InkProvider>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 10 }, appStyle]} pointerEvents={s.minimised ? 'none' : 'auto'}>
        <InkProvider value={ink}>
          <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 130 + insets.bottom }}>
            <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center' }}>
              <Animated.View key={screenKey} entering={Platform.OS === 'web' ? FadeIn.duration(350) : screenIn}>
                {s.heartOpen ? <Heart onBack={() => openHeart(false)} />
                  : s.tab === 'today' ? <Today now={now} hour={hour} onDetails={() => goTab('details')} />
                  : s.tab === 'progress' ? <Progress now={now} visitKey={visits.progress} />
                  : s.tab === 'details' ? <Details now={now} visitKey={visits.details} onHeart={() => openHeart(true)} />
                  : <Report now={now} />}
              </Animated.View>
            </View>
          </ScrollView>
        </InkProvider>
        <TabBar tab={s.tab} onTab={goTab} quickOpen={s.sheet === 'quick'} onQuick={() => a.openSheet(s.sheet === 'quick' ? null : 'quick')} bottom={bottom} screenW={W} screenH={H} hour={hour} onWallpaper={onWallpaper} />
      </Animated.View>

      {s.toast && <Toast key={s.toast.key} text={s.toast.text} onUndo={s.toast.undo ? a.undo : undefined} bottom={insets.bottom} />}
      {s.sheet && (
        <Sheet onClose={a.closeSheet} bottom={insets.bottom}>
          {s.sheet === 'quick' ? <QuickSheet /> : s.sheet === 'mood' ? <MoodSheet /> : s.sheet === 'vital' ? <VitalSheet key={s.vitalKey} /> : s.sheet === 'item' ? <ItemSheet now={now} /> : <ShareSheet />}
        </Sheet>
      )}
    </View>
  );
}
