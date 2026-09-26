import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, FadeIn, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { longDate } from '../state/clock';
import { useHeart } from '../state/heart';
import { fmtVital, healthAge, readiness, READY_MAX, REAL_AGE, WEEK_SCORES, withWater } from '../state/selectors';
import { useStore } from '../state/store';
import { accent, C, fill, ink, LONG_NAMES, VMETA, type Pillar, type VitalKey } from '../theme';
import { ease } from '../theme/motion';
import { Bar, Dot, PressableScale, useCountUp } from '../ui/controls';
import { Glass } from '../ui/glass/Glass';
import { T } from '../ui/Text';
import { HeartGauge, Waveform } from '../viz/charts';
import { FlameCapsule } from '../viz/FlameCapsule';

const ACircle = Animated.createAnimatedComponent(Circle);
const RING = 326.73;

export function Details({ now, visitKey, onHeart }: { now: Date; visitKey: number; onHeart: () => void }) {
  const { s, a } = useStore();
  const items = withWater(s.items, s.water);
  const r = readiness(items), age = healthAge(s.vitals, r.score);
  const shownR = useCountUp(r.score, { from: 0, runKey: visitKey, duration: 800 });
  const shownAge = useCountUp(age.age, { from: REAL_AGE, runKey: visitKey, duration: 900 });
  const [daySel, setDaySel] = useState(6);
  const [factorOpen, setFactorOpen] = useState<Pillar | null>(null);
  const week = [...WEEK_SCORES, r.score], wkL = ['F', 'S', 'S', 'M', 'T', 'W', 'T'], wkN = ['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Today'];

  const off = useSharedValue(RING);
  useEffect(() => { off.value = withTiming(RING * (1 - shownR / 100), { duration: 120 }); }, [shownR, off]);
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: off.value }));

  return (
    <View>
      <View style={{ paddingTop: 6, paddingHorizontal: 4 }}>
        <T size={13} weight="500" tone="ink2">{longDate(now)}</T>
        <T size={32} weight="700" track={-0.025} lh={1.15} accessibilityRole="header">Details</T>
      </View>

      <Glass radius={28} tint={[0.66, 0.34]} blur={30} border={0.8} style={{ marginTop: 16 }} innerStyle={{ paddingTop: 20, paddingHorizontal: 18, paddingBottom: 16, gap: 18 }}>
        <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
          <View style={{ width: 120, height: 120 }}>
            <Svg width={120} height={120} viewBox="0 0 120 120" style={{ transform: [{ rotate: '-90deg' }] }}>
              <Circle cx={60} cy={60} r={52} fill="none" stroke="rgba(120,120,128,.16)" strokeWidth={11} />
              <ACircle cx={60} cy={60} r={52} fill="none" stroke={r.color} strokeWidth={11} strokeLinecap="round" strokeDasharray={`${RING}`} animatedProps={ringProps} />
            </Svg>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <T size={36} weight="700" track={-0.03} tabular lh={1}>{shownR}</T>
              <T size={11} weight="500" tone="ink2" style={{ marginTop: 2 }}>of 100</T>
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <T size={12} weight="600" tone="ink2">Readiness</T>
            <T size={21} weight="700" track={-0.02} lh={1.15}>{r.label}</T>
            <T size={13} tone="ink2" lh={1.35}>{r.sub}</T>
          </View>
        </View>
        {r.lift && (
          <Animated.View entering={FadeIn.duration(300)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingRight: 10, paddingLeft: 14, borderRadius: 16, backgroundColor: fill.quaternary }}>
            <Dot color={C[r.lift.item.p]} />
            <T size={14} lh={1.3} style={{ flex: 1 }}><T size={14} weight="700">{r.lift.item.title}</T> <T size={14} tone="ink2">would add +{r.lift.gain}</T></T>
            <PressableScale scaleTo={0.92} onPress={() => a.setDone([r.lift!.item.id], true, `${r.lift!.item.title} logged`)} style={{ height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: ink[1], justifyContent: 'center' }}>
              <T size={14} weight="600" color="#fff">Log</T>
            </PressableScale>
          </Animated.View>
        )}
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T size={12} weight="600" tone="ink2">Last 7 days</T>
            <T size={12} weight="600" tabular>{wkN[daySel]} · {week[daySel]}</T>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', height: 84 }}>
            {week.map((v, j) => <DayBar key={`${j}-${visitKey}`} v={v} on={daySel === j} color={r.color} delay={j * 45} label={`${wkN[j]} ${v}`} onPress={() => setDaySel(j)} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {wkL.map((l, j) => <T key={j} size={11} weight="600" center color={daySel === j ? ink[1] : ink[3]} style={{ flex: 1 }}>{l}</T>)}
          </View>
        </View>
      </Glass>

      <T size={19} weight="700" track={-0.015} style={{ paddingTop: 24, paddingHorizontal: 6, paddingBottom: 8 }}>What’s shaping it</T>
      <Glass radius={20} innerStyle={{ overflow: 'hidden', borderRadius: 20 }}>
        {(['sleep', 'mind', 'med', 'habit'] as Pillar[]).map((k, i) => {
          const open = factorOpen === k;
          return (
            <View key={k} style={{ borderBottomWidth: i === 3 ? 0 : 0.5, borderBottomColor: 'rgba(60,60,67,.14)' }}>
              <Pressable onPress={() => setFactorOpen(open ? null : k)} style={({ pressed }) => ({ gap: 8, paddingVertical: 13, paddingHorizontal: 16, backgroundColor: pressed ? 'rgba(120,120,128,.06)' : 'transparent' })} accessibilityState={{ expanded: open }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Dot color={C[k]} />
                  <T size={16} weight="500" style={{ flex: 1 }}>{LONG_NAMES[k]}</T>
                  <T size={14} tone="ink2">{r.values[k]}</T>
                  <T size={14} weight="600" tabular style={{ width: 40, textAlign: 'right' }}>{r.pts[k]}/{READY_MAX[k]}</T>
                </View>
                <View style={{ marginLeft: 22 }}><Bar frac={r.pts[k] / READY_MAX[k]} color={C[k]} height={4} /></View>
              </Pressable>
              {open && <Animated.View entering={FadeIn.duration(300)}><T size={13} lh={1.45} color={ink.body} style={{ paddingLeft: 38, paddingRight: 16, paddingBottom: 14 }}>{r.notes[k]}</T></Animated.View>}
            </View>
          );
        })}
      </Glass>
      <T size={12} tone="ink3" lh={1.4} style={{ paddingTop: 8, paddingHorizontal: 16 }}>Updates as you log. A guide for your day, not a diagnosis.</T>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 26, paddingHorizontal: 6, paddingBottom: 8 }}>
        <T size={19} weight="700" track={-0.015}>Vitals</T>
        <T size={12} tone="ink3">Tap to log</T>
      </View>
      <HeartCard onOpen={onHeart} />

      <Glass radius={24} tint={[0.8, 0.5]} angle={160} blur={34} border={0.85} innerStyle={{ paddingVertical: 16, paddingHorizontal: 18, gap: 10 }}>
        <T size={13} tone="ink2">Health age</T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <T size={44} weight="700" track={-0.04} lh={1} tabular>{shownAge}</T>
          <T size={15} tone="ink2">{age.diff} than {REAL_AGE}</T>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: 'rgba(60,60,67,.14)' }}>
          {age.parts.map(([label, d]) => (
            <T key={label} size={13} tone="ink2">{label} <T size={13} weight="600" tabular color={d < 0 ? '#248a3d' : '#c25e00'}>{d < 0 ? '−' : '+'}{Math.abs(d)}</T></T>
          ))}
        </View>
      </Glass>
      <T size={12} tone="ink3" lh={1.4} style={{ paddingTop: 8, paddingHorizontal: 16 }}>Estimated from your vitals and routine. Not a medical assessment.</T>

      <Glass radius={20} style={{ marginTop: 10 }} innerStyle={{ overflow: 'hidden', borderRadius: 20 }}>
        {(['rhr', 'bp', 'weight'] as VitalKey[]).map((k, i) => {
          const v = s.vitals[k], hs = v.hist, mn = Math.min(...hs), mx = Math.max(...hs), m = VMETA[k];
          return (
            <Pressable key={k} onPress={() => a.openVital(k)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 62, backgroundColor: pressed ? 'rgba(120,120,128,.06)' : 'transparent' })}>
              <Dot color={m.color} />
              <View style={{ flex: 1, minWidth: 0, paddingVertical: 11, borderBottomWidth: i === 2 ? 0 : 0.5, borderBottomColor: 'rgba(60,60,67,.14)' }}>
                <T size={16} weight="500">{m.name}</T>
                <T size={12} tone="ink3">{v.when}</T>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 22, width: 42 }}>
                {hs.map((x, j) => <View key={j} style={{ flex: 1, height: `${mx === mn ? 60 : 25 + ((x - mn) / (mx - mn)) * 75}%`, borderRadius: 2, backgroundColor: m.color, opacity: j === hs.length - 1 ? 1 : 0.35 }} />)}
              </View>
              <T size={17} weight="600" tabular style={{ textAlign: 'right', minWidth: 62 }}>{fmtVital(k, v.v)}<T size={12} weight="500" tone="ink3"> {m.unit}</T></T>
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
}

function DayBar({ v, on, color, delay, label, onPress }: { v: number; on: boolean; color: string; delay: number; label: string; onPress: () => void }) {
  const h = useSharedValue(0);
  useEffect(() => { h.value = withDelay(delay, withTiming(1, { duration: 600, easing: ease.springBar })); }, [h, delay]);
  const a = useAnimatedStyle(() => ({ transform: [{ scaleY: h.value }] }));
  return (
    <PressableScale scaleTo={0.92} onPress={onPress} accessibilityLabel={label} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
      <Animated.View style={[{ width: '100%', height: `${v}%`, borderRadius: 8, backgroundColor: on ? color : 'rgba(120,120,128,.2)', transformOrigin: 'bottom' }, a]} />
    </PressableScale>
  );
}

function HeartIcon({ bpm }: { bpm: number }) {
  const sc = useSharedValue(1);
  useEffect(() => {
    const beat = 60000 / Math.max(35, bpm);
    sc.value = withRepeat(withSequence(
      withTiming(1.2, { duration: beat * 0.14 }), withTiming(0.96, { duration: beat * 0.14 }),
      withTiming(1.1, { duration: beat * 0.14 }), withTiming(1, { duration: beat * 0.28 }), withTiming(1, { duration: beat * 0.3 }),
    ), -1);
    return () => cancelAnimation(sc);
  }, [bpm, sc]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  return (
    <Animated.View style={a}>
      <Svg width={22} height={22} viewBox="0 0 24 24"><Path fill={accent.heart} d="M12 21.4 10.6 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5L12 21.4Z" /></Svg>
    </Animated.View>
  );
}

/**
 * Heart rate · HRV: gauge, beating heart at the live rate, and the flame capsule. Hold the capsule
 * to start a 60 s fingertip measurement (camera + torch); tap it again to stop.
 */
function HeartCard({ onOpen }: { onOpen: () => void }) {
  const { s, a } = useStore();
  const h = useHeart();
  const L = h.live, measuring = L.phase === 'measuring';
  const bpm = measuring && L.hr != null ? L.hr : s.vitals.rhr.v[0];
  const hrv = measuring && L.rmssd != null ? L.rmssd : s.hrv;
  const [traceW, setTraceW] = useState(0);
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  useEffect(() => { press.set(withSpring(measuring ? 1.06 : 1, { damping: 10, stiffness: 260 })); }, [measuring, press]);

  const hold = Gesture.LongPress().minDuration(600)
    .onBegin(() => { press.set(withTiming(0.94, { duration: 600, easing: Easing.out(Easing.quad) })); })
    .onStart(() => { h.start(); })
    .onFinalize((_, ok) => { if (!ok && !measuring) press.set(withSpring(1)); })
    .runOnJS(true);
  const tap = Gesture.Tap().maxDuration(550).onEnd(() => { if (measuring) h.cancel(); else a.toast('Hold the capsule to start'); }).runOnJS(true);
  const gesture = Gesture.Exclusive(hold, tap);

  const hint = !measuring ? 'Hold the capsule to measure'
    : L.status === 'no-contact' ? 'Cover the lens and flash fully'
    : L.quality === 'poor' && L.progress > 0.15 ? 'Keep still, press lightly'
    : `${Math.max(0, Math.round(60 * (1 - L.progress)))} s · keep still`;
  const pill = measuring ? 'Measuring…' : s.vitals.rhr.when === 'Just now' ? 'Just now' : 'Resting';

  return (
    <Glass radius={28} tint={[0.72, 0.4]} blur={30} border={0.8} style={{ marginBottom: 10 }} innerStyle={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14, gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <PressableScale onPress={onOpen} accessibilityLabel="Open heart trends" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <T size={14} weight="600">Heart rate · HRV</T>
          <Svg width={12} height={12} viewBox="0 0 24 24"><Path d="m9 18 6-6-6-6" fill="none" stroke={ink[3]} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </PressableScale>
        <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 11, backgroundColor: 'rgba(120,120,128,.12)' }}>
          <T size={12} weight="600" tabular color={measuring ? accent.heart : ink[1]}>{pill}</T>
        </View>
      </View>
      <View style={{ width: 220, height: 170, alignSelf: 'center' }}>
        <HeartGauge bpm={bpm} measuring={measuring} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: 60, alignItems: 'center' }} pointerEvents="none">
          <HeartIcon bpm={bpm} />
          <T size={40} weight="700" track={-0.04} lh={1.05} tabular>{bpm}</T>
          <T size={11} weight="500" tone="ink3">bpm</T>
          <View style={{ marginTop: 8, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10, backgroundColor: accent.hrvBg }}>
            <T size={12} weight="600" tabular color={accent.hrv}>HRV {hrv} ms</T>
          </View>
        </View>
      </View>
      {measuring && (
        <Animated.View entering={FadeIn.duration(300)} onLayout={e => setTraceW(e.nativeEvent.layout.width)} style={{ height: 44 }}>
          <Waveform trace={L.trace} width={traceW} />
        </Animated.View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <T size={12} tone="ink2" lh={1.3} style={{ width: 96 }}>{hint}</T>
        <GestureDetector gesture={gesture}>
          <Animated.View accessible accessibilityRole="button" accessibilityLabel={measuring ? 'Stop measuring' : 'Hold to measure heart rate and HRV'} style={pressStyle}>
            <FlameCapsule progress={L.progress} measuring={measuring} />
          </Animated.View>
        </GestureDetector>
        <T size={12} tone="ink2" lh={1.3} style={{ width: 96, textAlign: 'right' }}>{bpm < 60 ? 'Athletic range' : bpm < 100 ? 'Normal range' : 'Elevated'}</T>
      </View>
      <T size={11} tone="ink3" center style={{ marginTop: 4 }}>Fingertip over the rear camera and flash · measures heart rate and HRV</T>
    </Glass>
  );
}
