import { SNAP } from './theme/motion';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring, withTiming, type EntryAnimationsValues } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MinimisedWidget } from './components/MinimisedWidget';
import { Sheet, Toast } from './components/Overlay';
import { TabBar } from './components/TabBar';
import { NeutralBackdrop, Wallpaper } from './components/Wallpaper';
import { Details } from './screens/Details';
import { Heart } from './screens/Heart';
import { Progress } from './screens/Progress';
import { Report } from './screens/Report';
import { Sleep } from './screens/Sleep';
import { Today } from './screens/Today';
import { InsightsSheet, ItemSheet, MoodSheet, ProfileSheet, QuickSheet, ShareSheet, SleepSheet, VitalSheet } from './sheets/Sheets';
import { useNow } from './state/clock';
import { useStore } from './state/store';
import type { Page, Tab } from './state/types';
import { DAY_INK, isNight, NIGHT_INK } from './theme';
import { GlassBackdrop } from './ui/glass/Glass';
import { InkProvider } from './ui/Text';
import { useLingering } from './ui/useLingering';

/** `@keyframes screenIn { from { opacity:0; transform:translateY(8px) } }`, 350 ms ease-out. */
const screenIn = (_: EntryAnimationsValues) => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 8 }] },
    animations: { opacity: withTiming(1, { duration: 220 }), transform: [{ translateY: withTiming(0, { duration: 220 }) }] },
  };
};

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
  const onWallpaper = s.tab === 'today' && !s.page;
  const night = isNight(hour);
  const ink = onWallpaper && night ? NIGHT_INK : DAY_INK;
  const scroll = useRef<ScrollView>(null);
  const [visits, setVisits] = useState<Record<Tab, number>>({ today: 0, progress: 0, details: 0, report: 0 });

  const goTab = (t: Tab) => {
    if (t !== s.tab || s.page) setVisits(v => ({ ...v, [t]: v[t] + 1 }));
    a.patch({ page: null });
    a.setTab(t);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const openPage = (p: Page) => { a.openPage(p); scroll.current?.scrollTo({ y: 0, animated: false }); };

  // Android back: close the sheet, then the heart screen, then restore from minimised.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (s.sheet) { a.closeSheet(); return true; }
      if (s.page) { openPage(null); return true; }
      if (s.minimised) { a.toggleMinimised(); return true; }
      return false;
    });
    return () => sub.remove();
  });

  const wallStyle = useFade(onWallpaper);
  const wallMounted = useLingering(onWallpaper);
  const neutralStyle = useFade(!onWallpaper);
  const appV = useSharedValue(1);
  useEffect(() => { appV.value = s.minimised ? withTiming(0, { duration: 350 }) : withSpring(1, SNAP); }, [s.minimised, appV]);
  const appStyle = useAnimatedStyle(() => ({ opacity: appV.value, transform: [{ scale: 0.86 + 0.14 * appV.value }] }));
  const widgetStyle = useAnimatedStyle(() => ({ opacity: 1 - appV.value, transform: [{ scale: 1 - 0.2 * appV.value }] }));

  const screenKey = s.page ?? s.tab;
  const bottom = 24 + insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: '#f4f4f7' }}>
      <StatusBar style={ink === NIGHT_INK ? 'light' : 'dark'} />
      {/* "content" = everything the tab bar and sheets float over (wallpaper + scrolling screens). */}
      <GlassBackdrop kind="content" style={StyleSheet.absoluteFill}>
        <GlassBackdrop kind="wallpaper" style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, neutralStyle]}><NeutralBackdrop width={W} height={H} /></Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, wallStyle]}>{wallMounted && <Wallpaper width={W} height={H} hour={hour} />}</Animated.View>
        </GlassBackdrop>

        <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 5 }, widgetStyle]} pointerEvents={s.minimised ? 'auto' : 'none'}>
          <InkProvider value={ink}><MinimisedWidget /></InkProvider>
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 10 }, appStyle]} pointerEvents={s.minimised ? 'none' : 'auto'}>
          <InkProvider value={ink}>
            <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 130 + insets.bottom }}>
              <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center' }}>
                <Animated.View key={screenKey} entering={Platform.OS === 'web' ? FadeIn.duration(250) : screenIn}>
                  {s.page === 'heart' ? <Heart onBack={() => openPage(null)} backLabel={s.tab === 'today' ? 'Today' : 'Details'} />
                    : s.page === 'sleep' ? <Sleep now={now} onBack={() => openPage(null)} backLabel={s.tab === 'today' ? 'Today' : 'Details'} />
                    : s.tab === 'today' ? <Today now={now} hour={hour} onPage={openPage} />
                    : s.tab === 'progress' ? <Progress now={now} visitKey={visits.progress} />
                    : s.tab === 'details' ? <Details now={now} visitKey={visits.details} onHeart={() => openPage('heart')} onSleep={() => openPage('sleep')} />
                    : <Report now={now} />}
                </Animated.View>
              </View>
            </ScrollView>
          </InkProvider>
        </Animated.View>
      </GlassBackdrop>

      <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 20 }, appStyle]} pointerEvents={s.minimised ? 'none' : 'box-none'}>
        <TabBar tab={s.tab} onTab={goTab} quickOpen={s.sheet === 'quick'} onQuick={() => a.openSheet(s.sheet === 'quick' ? null : 'quick')} bottom={bottom} screenW={W} />
      </Animated.View>

      {s.toast && <Toast key={s.toast.key} text={s.toast.text} onUndo={s.toast.undo ? a.undo : undefined} bottom={insets.bottom} />}
      {s.sheet && (
        <Sheet onClose={a.closeSheet} bottom={insets.bottom}>
          {s.sheet === 'quick' ? <QuickSheet /> : s.sheet === 'mood' ? <MoodSheet /> : s.sheet === 'vital' ? <VitalSheet key={s.vitalKey} /> : s.sheet === 'item' ? <ItemSheet now={now} /> : s.sheet === 'sleep' ? <SleepSheet /> : s.sheet === 'profile' ? <ProfileSheet /> : s.sheet === 'insights' ? <InsightsSheet now={now} /> : <ShareSheet />}
        </Sheet>
      )}
    </View>
  );
}
