import { useState } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { deriveHealth, fmtHours } from '../state/health';
import { useStore } from '../state/store';
import type { State } from '../state/types';
import { accent, C, fill, ink, NIGHT_INK } from '../theme';
import { PressableScale } from '../ui/controls';
import { Glass } from '../ui/glass/Glass';
import { Icon, type IconName } from '../ui/icons';
import { SleepDial } from '../ui/SleepDial';
import { InkProvider, T } from '../ui/Text';
import { DayBars, type DayPoint } from '../viz/charts';

const QUALITY = ['Poor', 'Fair', 'OK', 'Good', 'Great'];
const METHODS: [State['sleepMethod'], string, IconName][] = [['timer', 'Tap timer', 'timer'], ['manual', 'Manual', 'pencil'], ['sonar', 'Ultrasonic', 'sonar']];
const clock = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
/** Minutes after 18:00, so bedtimes either side of midnight compare correctly. */
const bedMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h * 60 + m - 18 * 60 + 1440) % 1440; };
const sd = (v: number[]) => { if (v.length < 2) return 0; const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

function Stat({ icon, color, value, label }: { icon: IconName; color: string; value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Icon name={icon} size={18} color={color} />
      <T size={18} weight="700" tabular>{value}</T>
      <T size={11} tone="ink2">{label}</T>
    </View>
  );
}

/**
 * Sleep: tonight's toggle and tracking method in a night-sky header, then last night on the dial,
 * the key numbers as icon stats, and the week against your goal.
 */
export function Sleep({ now, onBack, backLabel = 'Today' }: { now: Date; onBack: () => void; backLabel?: string }) {
  const { s, a } = useStore();
  const d = deriveHealth(s, now);
  const [w, setW] = useState(0);
  const target = s.profile.sleepTargetH;
  const last = s.sleepLog.length ? s.sleepLog[s.sleepLog.length - 1] : null;
  const week = s.sleepLog.slice(-7);
  const avg = week.length ? week.reduce((x, e) => x + e.hours, 0) / week.length : null;
  const debt = week.reduce((x, e) => x + Math.max(0, target - e.hours), 0);
  const spread = week.length >= 3 ? Math.round(sd(week.map(e => bedMin(e.bed)))) : null;
  const asleep = s.sleepStart != null;
  const asleepH = asleep ? Math.max(0, (now.getTime() - s.sleepStart!) / 3600000) : 0;
  const points: DayPoint[] = week.map(e => ({ date: e.date, v: e.hours }));
  const inner = Math.max(0, w - 32);

  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)}>
      <PressableScale onPress={onBack} accessibilityLabel={`Back to ${backLabel}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 6 }}>
        <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="m15 18-6-6 6-6" fill="none" stroke={accent.tab} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        <T size={16} weight="500" color={accent.tab}>{backLabel}</T>
      </PressableScale>

      {/* Night-sky header: tonight's toggle and the tracking method */}
      <View style={{ marginTop: 8, borderRadius: 30, overflow: 'hidden', boxShadow: '0 12px 30px rgba(40,30,110,.25)' }}>
        <LinearGradient colors={['#141333', '#2a2560', '#4b3f93']} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ padding: 20, gap: 18 }}>
          <InkProvider value={NIGHT_INK}>
            <View style={{ position: 'absolute', right: 18, top: 16, opacity: 0.18 }}><Icon name="moon" size={90} color="#fff" weight={1.2} /></View>
            <View style={{ gap: 2 }}>
              <T size={13} weight="600" tone="ink2">Sleep</T>
              <T size={34} weight="700" track={-0.03} lh={1.1} accessibilityRole="header">
                {asleep ? `${Math.floor(asleepH)} h ${Math.round((asleepH % 1) * 60)} m` : last ? fmtHours(last.hours) : 'Tonight'}
              </T>
              <T size={13} tone="ink2">{asleep ? `Asleep since ${clock(s.sleepStart!)}` : last ? `Last night · ${last.bed}–${last.wake}` : `Your goal is ${target} h`}</T>
            </View>

            {s.sleepMethod === 'manual' ? (
              <PressableScale testID="sleep-page-toggle" scaleTo={0.97} onPress={() => a.openSheet('sleep', { sleepDraft: null })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, paddingHorizontal: 18, borderRadius: 28, backgroundColor: 'rgba(255,255,255,.14)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,.28)' }}>
                <Icon name="pencil" size={20} color="#fff" />
                <T size={17} weight="600" style={{ flex: 1 }}>Log last night</T>
                <Icon name="chevron" size={16} color="rgba(255,255,255,.7)" />
              </PressableScale>
            ) : (
              <PressableScale testID="sleep-page-toggle" scaleTo={0.97} onPress={asleep ? a.endSleep : a.startSleep}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, paddingHorizontal: 18, borderRadius: 28, backgroundColor: asleep ? '#fff' : 'rgba(255,255,255,.14)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,.28)' }}>
                <Icon name={asleep ? 'sun' : 'moon'} size={20} color={asleep ? '#ff9f0a' : '#fff'} />
                <T size={17} weight="600" color={asleep ? ink[1] : '#fff'} style={{ flex: 1 }}>{asleep ? 'I’m up' : 'Going to bed'}</T>
                {asleep
                  ? <PressableScale onPress={a.cancelSleep} scaleTo={0.94}><T size={13} weight="600" color={ink[2]}>Cancel</T></PressableScale>
                  : <Icon name="chevron" size={16} color="rgba(255,255,255,.7)" />}
              </PressableScale>
            )}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              {METHODS.map(([k, label, icon]) => {
                const on = s.sleepMethod === k;
                return (
                  <PressableScale key={k} scaleTo={0.95} onPress={() => a.patch({ sleepMethod: k })} accessibilityState={{ selected: on }} accessibilityLabel={`${label} tracking`}
                    style={{ flex: 1, height: 36, borderRadius: 18, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.1)' }}>
                    <Icon name={icon} size={14} color={on ? ink[1] : '#fff'} />
                    <T size={12} weight="600" color={on ? ink[1] : '#fff'}>{label}</T>
                  </PressableScale>
                );
              })}
            </View>
          </InkProvider>
        </LinearGradient>
      </View>

      {s.sleepMethod === 'sonar' && (
        <Animated.View entering={FadeIn.duration(250)}>
          <Glass radius={22} style={{ marginTop: 10 }} innerStyle={{ padding: 16, gap: 8 }} testID="sonar-info">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="sonar" size={20} color={C.sleep} />
              <T size={16} weight="700" style={{ flex: 1 }}>Ultrasonic tracking</T>
              <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10, backgroundColor: fill.tertiary }}><T size={11} weight="600" tone="ink2">Next update</T></View>
            </View>
            <T size={13} lh={1.45} color={ink.body}>
              Your phone plays a quiet, inaudible 19–20 kHz tone and listens to its echo. Each breath moves your chest a few millimetres and shifts the echo, which gives breathing rate, movement and estimated sleep stages all night, with nothing to wear.
            </T>
            <T size={12} tone="ink2" lh={1.4}>Phone on the nightstand within 1 m, speaker towards you, plugged in. No sound is recorded or uploaded; only the echo’s movement is kept.</T>
          </Glass>
        </Animated.View>
      )}

      {/* Last night on the dial */}
      <T size={19} weight="700" track={-0.015} style={{ paddingTop: 24, paddingHorizontal: 6, paddingBottom: 8 }}>Last night</T>
      <Glass radius={24} innerStyle={{ padding: 16 }}>
        {last ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <SleepDial bed={last.bed} wake={last.wake} size={Math.max(150, Math.min(190, inner * 0.55))} readOnly />
            <View style={{ flex: 1, gap: 12 }}>
              <View><T size={12} tone="ink2">Bedtime</T><T size={20} weight="700" tabular>{last.bed}</T></View>
              <View><T size={12} tone="ink2">Woke up</T><T size={20} weight="700" tabular>{last.wake}</T></View>
              <View><T size={12} tone="ink2">Felt</T><T size={17} weight="600">{QUALITY[last.quality - 1] ?? '–'}</T></View>
              <PressableScale scaleTo={0.95} onPress={() => a.openSheet('sleep', { sleepDraft: { bed: last.bed, wake: last.wake, date: last.date } })} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: fill.tertiary }}>
                <Icon name="pencil" size={14} color={ink[1]} />
                <T size={13} weight="600" color={ink[1]}>Edit</T>
              </PressableScale>
            </View>
          </View>
        ) : (
          <View style={{ gap: 10, alignItems: 'center', paddingVertical: 8 }}>
            <Icon name="moon" size={28} color={C.sleep} />
            <T size={15} weight="600">No nights yet</T>
            <T size={13} tone="ink2" center lh={1.4}>Tap “Going to bed” tonight, or log last night by hand.</T>
            <PressableScale scaleTo={0.96} onPress={() => a.openSheet('sleep', { sleepDraft: null })} style={{ height: 40, paddingHorizontal: 18, borderRadius: 20, backgroundColor: ink[1], justifyContent: 'center' }}>
              <T size={14} weight="600" color="#fff">Log last night</T>
            </PressableScale>
          </View>
        )}
      </Glass>

      {/* Key numbers */}
      <Glass radius={22} style={{ marginTop: 10 }} innerStyle={{ flexDirection: 'row', padding: 16, gap: 8 }}>
        <Stat icon="moon" color={C.sleep} value={avg != null ? `${Math.floor(avg)}h${String(Math.round((avg % 1) * 60)).padStart(2, '0')}` : '–'} label="7-day average" />
        <Stat icon="timer" color="#32ade6" value={spread != null ? `±${spread}m` : '–'} label="Bedtime spread" />
        <Stat icon="alert" color={debt >= 5 ? '#ff9f0a' : '#34c759'} value={week.length ? `${Math.round(debt * 10) / 10}h` : '–'} label="Sleep debt" />
        <Stat icon="lungs" color="#32ade6" value={d.breathing != null ? `${Math.round(d.breathing)}` : '–'} label="Breaths/min" />
      </Glass>

      {/* The week against the goal */}
      <T size={19} weight="700" track={-0.015} style={{ paddingTop: 24, paddingHorizontal: 6, paddingBottom: 8 }}>This week</T>
      <Glass radius={24} innerStyle={{ padding: 16, gap: 8 }}>
        {points.length >= 2 ? (
          <>
            <DayBars points={points} width={inner} goal={target} color={C.sleep} colorFor={v => (v >= target - 0.5 ? C.sleep : '#b9b6f7')} />
            <T size={12} tone="ink2" lh={1.35}>Dashed line: your {target} h goal. Lighter bars fell short of it.</T>
          </>
        ) : (
          <T size={13} tone="ink2" lh={1.4}>Your week appears after two nights.</T>
        )}
      </Glass>
    </View>
  );
}
