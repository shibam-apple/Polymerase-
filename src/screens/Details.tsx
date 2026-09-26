import { useEffect, useState } from 'react';
import { Linking, Pressable, Share, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { recoveryFor, type Part } from '../health/recovery';
import { describeDiag } from '../signal/camera/diag';
import { longDate } from '../state/clock';
import { deriveHealth } from '../state/health';
import { useHeart } from '../state/heart';
import { fmtVital } from '../state/selectors';
import { useStore } from '../state/store';
import { accent, C, fill, ink, VMETA, type VitalKey } from '../theme';
import { ease, SNAP } from '../theme/motion';
import { Bar, Dot, PressableScale, useCountUp } from '../ui/controls';
import { Glass } from '../ui/glass/Glass';
import { T } from '../ui/Text';
import { Waveform } from '../viz/charts';
import { FlameCapsule } from '../viz/FlameCapsule';

const ACircle = Animated.createAnimatedComponent(Circle);
const RING = 326.73;
const PART_META: Record<Part['key'], { name: string; color: string }> = {
  hrv: { name: 'HRV', color: '#7c5cff' },
  rhr: { name: 'Resting heart rate', color: '#ff6b5a' },
  sleep: { name: 'Sleep', color: C.sleep },
  adherence: { name: 'Meds & habits', color: C.med },
};
const scoreColor = (s: number) => (s >= 80 ? '#34a853' : s >= 60 ? '#ff9f0a' : '#ff6b5a');

export function Details({ now, visitKey, onHeart }: { now: Date; visitKey: number; onHeart: () => void }) {
  const { s, a } = useStore();
  const h = useHeart();
  const d = deriveHealth(s, now);
  const rec = d.recovery;
  const shown = useCountUp(rec.score ?? 0, { from: 0, runKey: visitKey, duration: 600 });
  const [open, setOpen] = useState<string | null>(null);
  const color = rec.score != null ? scoreColor(rec.score) : 'rgba(120,120,128,.35)';

  const off = useSharedValue(RING);
  useEffect(() => { off.value = withTiming(RING * (1 - (rec.score != null ? shown : 0) / 100), { duration: 120 }); }, [shown, rec.score, off]);
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: off.value }));

  const needsHeart = !d.todaysHeart, needsSleep = !d.sleepToday;
  const sub = rec.status === 'learning'
    ? 'Measure each morning, ideally before coffee. After 3 mornings your score has a baseline to compare against.'
    : rec.status === 'needs-data' ? 'Measure your heart rate this morning to see today’s score.'
    : rec.status === 'provisional' ? `Based on ${rec.baselineDays} mornings so far. It gets steadier after a week.`
    : 'Compared with your own last 60 days.';

  const measure = () => { h.start(); };
  const missing: Part['key'][] = [...(needsHeart ? (['hrv', 'rhr'] as const) : []), ...(needsSleep ? (['sleep'] as const) : [])];

  return (
    <View>
      <View style={{ paddingTop: 6, paddingHorizontal: 4 }}>
        <T size={13} weight="500" tone="ink2">{longDate(now)}</T>
        <T size={32} weight="700" track={-0.025} lh={1.15} accessibilityRole="header">Details</T>
      </View>

      <Glass radius={28} tint={[0.66, 0.34]} blur={30} border={0.8} style={{ marginTop: 16 }} innerStyle={{ paddingTop: 20, paddingHorizontal: 18, paddingBottom: 16, gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
          <View style={{ width: 120, height: 120 }}>
            <Svg width={120} height={120} viewBox="0 0 120 120" style={{ transform: [{ rotate: '-90deg' }] }}>
              <Circle cx={60} cy={60} r={52} fill="none" stroke="rgba(120,120,128,.16)" strokeWidth={11} />
              <ACircle cx={60} cy={60} r={52} fill="none" stroke={color} strokeWidth={11} strokeLinecap="round" strokeDasharray={`${RING}`} animatedProps={ringProps} />
            </Svg>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <T size={36} weight="700" track={-0.03} tabular lh={1}>{rec.score != null ? shown : '–'}</T>
              <T size={11} weight="500" tone="ink2" style={{ marginTop: 2 }}>{rec.score != null ? 'of 100' : 'no score yet'}</T>
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <T size={12} weight="600" tone="ink2">Recovery</T>
            <T size={21} weight="700" track={-0.02} lh={1.15}>{rec.label}</T>
            <T size={13} tone="ink2" lh={1.35}>{sub}</T>
          </View>
        </View>

        {d.forecast && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, backgroundColor: fill.quaternary }}>
            <T size={14} style={{ flex: 1 }}>Tomorrow <T size={14} tone="ink2">estimate</T></T>
            <T size={17} weight="700" tabular>{d.forecast.score}</T>
            <T size={12} tone="ink3" tabular>{d.forecast.lo}–{d.forecast.hi}</T>
          </View>
        )}

        {(needsHeart || needsSleep) && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {needsHeart && (
              <PressableScale scaleTo={0.96} onPress={measure} style={{ flex: 1, height: 40, borderRadius: 20, backgroundColor: ink[1], alignItems: 'center', justifyContent: 'center' }}>
                <T size={14} weight="600" color="#fff">Measure now</T>
              </PressableScale>
            )}
            {needsSleep && (
              <PressableScale scaleTo={0.96} onPress={() => a.openSheet('sleep')} style={{ flex: 1, height: 40, borderRadius: 20, backgroundColor: fill.tertiary, alignItems: 'center', justifyContent: 'center' }}>
                <T size={14} weight="600" color={ink[1]}>Log last night’s sleep</T>
              </PressableScale>
            )}
          </View>
        )}

        <HistoryBars days={d.days} visitKey={visitKey} target={s.profile.sleepTargetH} />
      </Glass>

      <T size={19} weight="700" track={-0.015} style={{ paddingTop: 24, paddingHorizontal: 6, paddingBottom: 8 }}>What’s shaping it</T>
      <Glass radius={20} innerStyle={{ overflow: 'hidden', borderRadius: 20 }}>
        {rec.parts.map((p, i) => {
          const isOpen = open === p.key, meta = PART_META[p.key];
          return (
            <View key={p.key} style={{ borderBottomWidth: i === rec.parts.length - 1 && !missing.length ? 0 : 0.5, borderBottomColor: 'rgba(60,60,67,.14)' }}>
              <Pressable onPress={() => setOpen(isOpen ? null : p.key)} style={({ pressed }) => ({ gap: 8, paddingVertical: 13, paddingHorizontal: 16, backgroundColor: pressed ? 'rgba(120,120,128,.06)' : 'transparent' })} accessibilityState={{ expanded: isOpen }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Dot color={meta.color} />
                  <T size={16} weight="500" style={{ flex: 1 }}>{meta.name}</T>
                  <T size={14} weight="600" tabular style={{ width: 44, textAlign: 'right' }}>{p.pts}/{p.max}</T>
                </View>
                <View style={{ marginLeft: 22 }}><Bar frac={p.pts / p.max} color={meta.color} height={4} /></View>
              </Pressable>
              {isOpen && <Animated.View entering={FadeIn.duration(200)}><T size={13} lh={1.45} color={ink.body} style={{ paddingLeft: 38, paddingRight: 16, paddingBottom: 14 }}>{p.note}</T></Animated.View>}
            </View>
          );
        })}
        {missing.map((k, i) => (
          <Pressable key={k} onPress={() => (k === 'sleep' ? a.openSheet('sleep') : measure())} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: i === missing.length - 1 ? 0 : 0.5, borderBottomColor: 'rgba(60,60,67,.14)', backgroundColor: pressed ? 'rgba(120,120,128,.06)' : 'transparent' })}>
            <Dot color="rgba(120,120,128,.35)" />
            <T size={16} weight="500" tone="ink2" style={{ flex: 1 }}>{PART_META[k].name}</T>
            <T size={14} weight="600" color={accent.tab}>{k === 'sleep' ? 'Log' : 'Measure'}</T>
          </Pressable>
        ))}
      </Glass>
      <T size={12} tone="ink3" lh={1.4} style={{ paddingTop: 8, paddingHorizontal: 16 }}>
        HRV and resting heart rate are compared with your own baseline. Training load isn’t tracked yet. A guide, not a diagnosis.
      </T>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 26, paddingHorizontal: 6, paddingBottom: 8 }}>
        <T size={19} weight="700" track={-0.015}>Vitals</T>
        <T size={12} tone="ink3">Tap to log</T>
      </View>
      <HeartCard onOpen={onHeart} />
      <HealthAgeCard d={d} onSetup={() => a.openSheet('profile')} visitKey={visitKey} />

      <Glass radius={20} style={{ marginTop: 10 }} innerStyle={{ overflow: 'hidden', borderRadius: 20 }}>
        {(['rhr', 'bp', 'weight'] as VitalKey[]).map((k, i) => {
          const v = s.vitals[k], hs = v.hist, mn = Math.min(...hs), mx = Math.max(...hs), m = VMETA[k], has = v.v.length > 0;
          return (
            <Pressable key={k} onPress={() => (k === 'rhr' ? measure() : a.openVital(k))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 62, backgroundColor: pressed ? 'rgba(120,120,128,.06)' : 'transparent' })}>
              <Dot color={m.color} />
              <View style={{ flex: 1, minWidth: 0, paddingVertical: 11, borderBottomWidth: i === 2 ? 0 : 0.5, borderBottomColor: 'rgba(60,60,67,.14)' }}>
                <T size={16} weight="500">{m.name}</T>
                <T size={12} tone="ink3">{v.when}</T>
              </View>
              {hs.length > 1 && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 22, width: 42 }}>
                  {hs.map((x, j) => <View key={j} style={{ flex: 1, height: `${mx === mn ? 60 : 25 + ((x - mn) / (mx - mn)) * 75}%`, borderRadius: 2, backgroundColor: m.color, opacity: j === hs.length - 1 ? 1 : 0.35 }} />)}
                </View>
              )}
              {has
                ? <T size={17} weight="600" tabular style={{ textAlign: 'right', minWidth: 62 }}>{fmtVital(k, v.v)}<T size={12} weight="500" tone="ink3"> {m.unit}</T></T>
                : <T size={15} weight="600" color={accent.tab}>{k === 'rhr' ? 'Measure' : 'Add'}</T>}
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
}

/** Recovery for each of the last 7 days that have a score (each scored against its own past). */
function HistoryBars({ days, visitKey, target }: { days: ReturnType<typeof deriveHealth>['days']; visitKey: number; target: number }) {
  const scored = days.map(d => ({ date: d.date, score: recoveryFor(days, d, target).score })).filter((x): x is { date: string; score: number } => x.score != null).slice(-7);
  const [sel, setSel] = useState<number | null>(null);
  if (scored.length < 2) return null;
  const idx = sel != null && sel < scored.length ? sel : scored.length - 1;
  const dayName = (k: string) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${k}T12:00:00`).getDay()];
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T size={12} weight="600" tone="ink2">Recent days</T>
        <T size={12} weight="600" tabular>{dayName(scored[idx].date)} · {scored[idx].score}</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', height: 72 }}>
        {scored.map((x, j) => <DayBar key={`${x.date}-${visitKey}`} v={x.score} on={idx === j} color={scoreColor(x.score)} delay={j * 30} label={`${dayName(x.date)} ${x.score}`} onPress={() => setSel(j)} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {scored.map((x, j) => <T key={x.date} size={11} weight="600" center color={idx === j ? ink[1] : ink[3]} style={{ flex: 1 }}>{dayName(x.date)[0]}</T>)}
      </View>
    </View>
  );
}

function DayBar({ v, on, color, delay, label, onPress }: { v: number; on: boolean; color: string; delay: number; label: string; onPress: () => void }) {
  const h = useSharedValue(0);
  useEffect(() => { h.value = withDelay(delay, withTiming(1, { duration: 380, easing: ease.springBar })); }, [h, delay]);
  const a = useAnimatedStyle(() => ({ transform: [{ scaleY: h.value }] }));
  return (
    <PressableScale scaleTo={0.94} onPress={onPress} accessibilityLabel={label} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
      <Animated.View style={[{ width: '100%', height: `${Math.max(6, v)}%`, borderRadius: 8, backgroundColor: on ? color : 'rgba(120,120,128,.2)', transformOrigin: 'bottom' }, a]} />
    </PressableScale>
  );
}

function HealthAgeCard({ d, onSetup, visitKey }: { d: ReturnType<typeof deriveHealth>; onSetup: () => void; visitKey: number }) {
  const age = d.age;
  const shown = useCountUp(age.age ?? 0, { from: age.age != null ? age.realAge : 0, runKey: visitKey, duration: 700 });
  return (
    <>
      <Glass radius={24} tint={[0.8, 0.5]} angle={160} blur={34} border={0.85} innerStyle={{ paddingVertical: 16, paddingHorizontal: 18, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T size={13} tone="ink2">Health age</T>
          <PressableScale scaleTo={0.94} onPress={onSetup} hitSlop={8}><T size={13} weight="600" color={accent.tab}>{age.age != null ? 'Edit profile' : 'Set up'}</T></PressableScale>
        </View>
        {age.age != null ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <T size={44} weight="700" track={-0.04} lh={1} tabular>{shown}</T>
              <T size={15} tone="ink2">{age.diffText}</T>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: 'rgba(60,60,67,.14)' }}>
              {age.parts.map(p => (
                <T key={p.label} size={13} tone="ink2">{p.label} <T size={13} weight="600" tabular color={p.years < 0 ? '#248a3d' : p.years > 0 ? '#c25e00' : ink[3]}>{p.years < 0 ? '−' : p.years > 0 ? '+' : '±'}{Math.abs(p.years)}</T></T>
              ))}
            </View>
          </>
        ) : (
          <T size={15} tone="ink2" lh={1.4}>{age.missing}</T>
        )}
      </Glass>
      <T size={12} tone="ink3" lh={1.4} style={{ paddingTop: 8, paddingHorizontal: 16 }}>
        Indicative: your age adjusted for resting heart rate, blood pressure, BMI, sleep and HRV. Not a validated medical measure.
      </T>
    </>
  );
}

const whenText = (at: number) => { const d = new Date(at), t = new Date(); return d.toDateString() === t.toDateString() ? 'today' : `${d.getDate()}/${d.getMonth() + 1}`; };

/**
 * Heart rate · HRV. The liquid capsule is the control: hold it for half a second to start a 60 s
 * fingertip measurement; the heart inside beats at your live rate. Tap it while measuring to finish
 * early. A status line shows exactly what the camera is doing.
 */
function HeartCard({ onOpen }: { onOpen: () => void }) {
  const { s } = useStore();
  const h = useHeart();
  const L = h.live, measuring = L.phase === 'measuring';
  const latest = s.heartLog.length ? s.heartLog[s.heartLog.length - 1] : null;
  const bpm = measuring ? L.hr : latest?.hr ?? null;
  const hrv = measuring ? L.rmssd : latest?.rmssd ?? null;
  const [traceW, setTraceW] = useState(0);
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  useEffect(() => { press.set(withSpring(measuring ? 1.03 : 1, SNAP)); }, [measuring, press]);

  const hold = Gesture.LongPress().minDuration(450)
    .onBegin(() => { if (!measuring) press.set(withTiming(0.96, { duration: 450, easing: Easing.out(Easing.quad) })); })
    .onStart(() => { h.start(); })
    .onFinalize((_, ok) => { if (!ok && !measuring) press.set(withSpring(1, SNAP)); })
    .runOnJS(true);
  const tap = Gesture.Tap().maxDuration(400).onEnd(() => { if (measuring) h.finish(); }).runOnJS(true);
  const gesture = Gesture.Exclusive(hold, tap);

  const blocked = h.diag.permission === 'blocked' || h.diag.permission === 'denied';
  const left = Math.max(0, Math.round(60 - L.contactSec));
  const hint = !measuring ? (latest ? 'Hold the capsule to measure again' : 'Hold the capsule, then rest a fingertip over the rear camera and flash')
    : L.status === 'starting' ? 'Starting the camera…'
    : L.status === 'no-contact' ? 'Cover the lens and flash fully · timer paused'
    : L.status === 'error' ? 'Camera problem, see status below'
    : L.quality === 'poor' && L.contactSec > 10 ? `Keep still, press lightly · ${left} s`
    : `${left} s · keep still · tap to finish`;
  const when = latest ? new Date(latest.at) : null;
  const pill = measuring ? 'Measuring…' : when ? `${when.getHours()}:${String(when.getMinutes()).padStart(2, '0')}` : 'No reading yet';

  return (
    <Glass radius={28} tint={[0.72, 0.4]} blur={30} border={0.8} style={{ marginBottom: 10 }} innerStyle={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <PressableScale onPress={onOpen} accessibilityLabel="Open heart trends" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <T size={14} weight="600">Heart rate · HRV</T>
          <Svg width={12} height={12} viewBox="0 0 24 24"><Path d="m9 18 6-6-6-6" fill="none" stroke={ink[3]} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </PressableScale>
        <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 11, backgroundColor: 'rgba(120,120,128,.12)' }}>
          <T size={12} weight="600" tabular color={measuring ? accent.heart : ink[1]}>{pill}</T>
        </View>
      </View>

      {blocked && !measuring ? (
        <View style={{ gap: 10, alignItems: 'center', paddingVertical: 8 }}>
          <T size={16} weight="600">Camera access needed</T>
          <T size={13} tone="ink2" center lh={1.4}>Daily reads your pulse from your fingertip with the rear camera and flash. Nothing is recorded or uploaded.</T>
          <PressableScale scaleTo={0.96} onPress={() => (h.diag.permission === 'blocked' ? Linking.openSettings() : h.start())} style={{ height: 40, paddingHorizontal: 18, borderRadius: 20, backgroundColor: ink[1], justifyContent: 'center' }}>
            <T size={14} weight="600" color="#fff">{h.diag.permission === 'blocked' ? 'Open settings' : 'Allow camera'}</T>
          </PressableScale>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <GestureDetector gesture={gesture}>
            <Animated.View accessible accessibilityRole="button" accessibilityLabel={measuring ? 'Finish measuring' : 'Hold to measure heart rate and HRV'} style={pressStyle}>
              <FlameCapsule progress={L.progress} measuring={measuring} bpm={bpm} />
            </Animated.View>
          </GestureDetector>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <T size={48} weight="700" track={-0.04} lh={1.05} tabular>{bpm ?? '–'}</T>
              <T size={13} weight="500" tone="ink3">bpm</T>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10, backgroundColor: accent.hrvBg }}><T size={12} weight="600" tabular color={accent.hrv}>HRV {hrv != null ? `${hrv} ms` : '–'}</T></View>
              {measuring && L.score != null && <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10, backgroundColor: fill.tertiary }}><T size={12} weight="600" tabular tone="ink2">Signal {L.score}</T></View>}
            </View>
            <T size={12} tone="ink2" lh={1.3}>{hint}</T>
          </View>
        </View>
      )}

      {measuring && L.trace.length > 1 && (
        <Animated.View entering={FadeIn.duration(200)} onLayout={e => setTraceW(e.nativeEvent.layout.width)} style={{ height: 44 }}>
          <Waveform trace={L.trace} width={traceW} />
        </Animated.View>
      )}
      {(measuring || h.diag.lastError !== '') && h.source === 'camera' && (
        <Pressable onPress={() => Share.share({ message: `Daily camera diagnostics\n${describeDiag(h.diag)}\ncontact ${L.contactSec.toFixed(1)} s · status ${L.status} · beats ${L.validBeats}` }).catch(() => {})} style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: fill.quaternary }}>
          <T size={11} tone="ink2" tabular lh={1.35}>{describeDiag(h.diag)} · contact {L.contactSec.toFixed(0)} s · {L.validBeats} beats</T>
          <T size={11} weight="600" color={accent.tab} style={{ marginTop: 2 }}>Share diagnostics</T>
        </Pressable>
      )}
      {!measuring && latest && (
        <T size={12} tone="ink3">Last: {latest.hr} bpm · HRV {latest.rmssd} ms{latest.respRate ? ` · ${Math.round(latest.respRate)} breaths/min` : ''} · {whenText(latest.at)}</T>
      )}
      {h.source === 'simulated' && <T size={11} weight="600" color="#c25e00">Simulated signal (demo). Not your pulse.</T>}
    </Glass>
  );
}
