import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { longDate } from '../state/clock';
import { deriveHealth } from '../state/health';
import { nextItem, parts, progress, withWater } from '../state/selectors';
import { useStore } from '../state/store';
import type { Item, Page } from '../state/types';
import { C, ink, isNight } from '../theme';
import { ease, SNAP } from '../theme/motion';
import { HomeCard } from '../components/HomeCard';
import { Glass } from '../ui/glass/Glass';
import { PressableScale } from '../ui/controls';
import { T } from '../ui/Text';

const Check = ({ size = 16, color = '#fff', w = 3.2 }: { size?: number; color?: string; w?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M20 6 9 17l-5-5" fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" /></Svg>
);

export function Today({ now, hour, onPage }: { now: Date; hour: number; onPage: (p: Page) => void }) {
  const { s, a } = useStore();
  const items = withWater(s.items, s.water);
  const nx = nextItem(items, s.snoozed), { left } = progress(items);
  const d = deriveHealth(s, now);
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: false, 1: true, 2: true });
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 6, paddingHorizontal: 4 }}>
        <View>
          <T size={13} weight="500" tone="ink2">{longDate(now)}</T>
          <T size={32} weight="700" track={-0.025} lh={1.15} accessibilityRole="header">Today</T>
        </View>
        <PressableScale scaleTo={0.9} onPress={a.toggleMinimised} accessibilityLabel="Minimise" style={{ width: 36, height: 36, borderRadius: 18, marginBottom: 4, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.6)' }}>
          <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M5 12h14" stroke={ink[1]} strokeWidth={2.5} strokeLinecap="round" /></Svg>
        </PressableScale>
      </View>

      <HomeCard d={d} now={now} dark={isNight(hour)} nx={nx} left={left} onPage={onPage} />

      <View style={{ marginTop: 6 }}>
        {parts(items).map(p => {
          const isOpen = p.allDone ? !!open[p.index] : open[p.index] !== false;
          const toggle = () => setOpen(o => ({ ...o, [p.index]: !isOpen }));
          return (
            <View key={p.label} style={{ marginTop: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingBottom: 8 }}>
                <Pressable onPress={toggle} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
                  <T size={19} weight="700" track={-0.015}>{p.label}</T>
                  <Chevron open={isOpen} />
                </Pressable>
                {p.canLogAll && (
                  <Animated.View entering={FadeIn.duration(300)}>
                    <PressableScale onPress={() => a.setDone(p.due.map(i => i.id), true, `${p.due.length} items logged`)} style={{ height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.6)', justifyContent: 'center' }}>
                      <T size={13} weight="600" color={ink[1]}>Log all</T>
                    </PressableScale>
                  </Animated.View>
                )}
                <T size={14} tone="ink2" tabular>{p.summary}</T>
              </View>
              {!isOpen && p.allDone ? (
                <PressableScale scaleTo={0.98} onPress={toggle}>
                  <Glass radius={20} tint={[0.66, 0.34]} innerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16 }}>
                    <View style={{ flexDirection: 'row' }}>
                      {p.items.map(it => <View key={it.id} style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C[it.p], borderWidth: 2, borderColor: '#f5f5f7', marginRight: -6 }} />)}
                    </View>
                    <T size={15} weight="500" style={{ flex: 1, marginLeft: 10 }}>All {p.count} done</T>
                    <Check size={18} color={ink[1]} w={2.5} />
                  </Glass>
                </PressableScale>
              ) : isOpen ? (
                <Glass radius={20} innerStyle={{ overflow: 'hidden', borderRadius: 20 }}>
                  {p.items.map((it, i) => (
                    <SwipeRow key={it.id} it={it} last={i === p.items.length - 1} popping={s.pop === it.id}
                      onComplete={() => a.complete(it)} onOpen={() => (it.id === 1 ? onPage('sleep') : a.openSheet('item', { itemId: it.id }))}
                      onWater={() => a.addWater()} onSwiped={() => !s.swiped && a.patch({ swiped: true })} />
                  ))}
                </Glass>
              ) : null}
            </View>
          );
        })}
      </View>
      {!s.swiped && left > 0 && <T size={13} tone="ink3" center style={{ marginTop: 14 }}>Swipe a row right to log it</T>}
    </View>
  );
}

function Chevron({ open, color = ink[3] }: { open: boolean; color?: string }) {
  const r = useSharedValue(open ? 0 : -90);
  useEffect(() => { r.value = withTiming(open ? 0 : -90, { duration: 300 }); }, [open, r]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={st}>
      <Svg width={14} height={14} viewBox="0 0 24 24"><Path d="m6 9 6 6 6-6" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
    </Animated.View>
  );
}

const THRESH = 90;

/** A schedule row: swipe right past 90 pt to log (with a haptic tick at the threshold), tap the circle, or tap the title for details. */
function SwipeRow({ it, last, popping, onComplete, onOpen, onWater, onSwiped }: { it: Item; last: boolean; popping: boolean; onComplete: () => void; onOpen: () => void; onWater: () => void; onSwiped: () => void }) {
  const tx = useSharedValue(0);
  const [past, setPast] = useState(false);
  const color = C[it.p];
  const tick = (p: boolean) => { setPast(p); if (p) Haptics.selectionAsync().catch(() => {}); };
  // A drag must not also count as a tap on the title (the design's `_dragEnd` guard): the pan
  // flags itself, each new touch clears the flag, and the title's press checks it.
  const dragged = useSharedValue(false);
  const open = () => { if (!dragged.get()) onOpen(); };
  const pan = Gesture.Pan()
    .enabled(!it.auto)
    .activeOffsetX(8)
    .failOffsetY([-10, 10])
    .onStart(() => { dragged.set(true); })
    .onChange(e => {
      const was = tx.value > THRESH;
      tx.value = Math.max(0, Math.min(200, tx.value + e.changeX));
      const now = tx.value > THRESH;
      if (now !== was) runOnJS(tick)(now);
    })
    .onEnd(() => {
      const go = tx.value > THRESH;
      tx.value = withTiming(0, { duration: 260, easing: ease.springSoft });
      runOnJS(onSwiped)();
      if (go) runOnJS(onComplete)();
      runOnJS(setPast)(false);
    });
  const row = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }], backgroundColor: tx.value > 4 ? 'rgba(255,255,255,.97)' : 'transparent' }));
  const reveal = useAnimatedStyle(() => ({ opacity: tx.value > 4 ? 1 : 0 }));
  const revealScale = useSharedValue(0.8);
  useEffect(() => { revealScale.value = withSpring(past ? 1.08 : 0.9, SNAP); }, [past, revealScale]);
  const revealIcon = useAnimatedStyle(() => ({ transform: [{ scale: revealScale.value }] }));

  const scale = useSharedValue(1);
  const ring = useSharedValue(0);
  useEffect(() => {
    if (!popping) return;
    scale.value = withSequence(withTiming(1.1, { duration: 90 }), withSpring(1, SNAP));
    if (it.done) { ring.value = 0; ring.value = withTiming(1, { duration: 380 }); }
  }, [popping, it.done, scale, ring]);
  const check = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ripple = useAnimatedStyle(() => ({ opacity: ring.value > 0 && ring.value < 1 ? 0.9 * (1 - ring.value) : 0, transform: [{ scale: 1 + 1.1 * ring.value }] }));
  const op = it.done ? 0.42 : 1;

  return (
    <View style={{ overflow: 'hidden' }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 22 }, reveal]}>
        <Animated.View style={revealIcon}><Check size={20} w={3} /></Animated.View>
        <T size={15} weight="600" color="#fff">{it.done ? 'Undo' : past ? 'Release' : 'Log'}</T>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 60 }, row]}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, opacity: op }} />
          <Pressable onPressIn={() => dragged.set(false)} onPress={open} style={{ flex: 1, minWidth: 0, paddingVertical: 11, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: 'rgba(60,60,67,.14)', opacity: op }} accessibilityHint="Opens details">
            <T size={16} weight="600" track={-0.01} selectable={false}>{it.title}</T>
            <T size={13} tone="ink2" selectable={false}>{it.time} · {it.detail}</T>
          </Pressable>
          {it.id === 6 && !it.done && (
            <PressableScale scaleTo={0.9} onPress={onWater} accessibilityLabel="Add a glass" style={{ height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: 'rgba(120,120,128,.14)', justifyContent: 'center' }}>
              <T size={13} weight="600" color={ink[1]}>+1</T>
            </PressableScale>
          )}
          <Pressable onPress={onComplete} disabled={it.auto} accessibilityLabel={(it.done ? 'Undo ' : 'Log ') + it.title} hitSlop={8}>
            <Animated.View style={[{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: it.done ? color : 'transparent', boxShadow: it.done ? undefined : 'inset 0 0 0 2px rgba(60,60,67,.26)' }, check]}>
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 15, borderWidth: 2, borderColor: color }, ripple]} />
              {it.done && <Check />}
            </Animated.View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
