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
import { DayBars, Hypnogram, STAGE_COLOR, Waveform, type DayPoint } from '../viz/charts';
import { SONAR_AVAILABLE, unpackStages, useSonarCheck } from '../sleep/sonarNight';

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
  const sonar = s.sonarNights.length ? s.sonarNights[s.sonarNights.length - 1] : null;

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

      {s.sleepMethod === 'sonar' && <SonarPanel width={inner} />}

      {s.sonarBusy != null && (
        <Glass radius={22} style={{ marginTop: 10 }} innerStyle={{ padding: 16, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="sonar" size={18} color={C.sleep} />
            <T size={15} weight="600" style={{ flex: 1 }}>Analysing your night…</T>
            <T size={13} weight="600" tone="ink2" tabular>{Math.round(s.sonarBusy * 100)}%</T>
          </View>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: fill.tertiary, overflow: 'hidden' }}><View style={{ width: `${s.sonarBusy * 100}%`, height: 4, backgroundColor: C.sleep }} /></View>
        </Glass>
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

      {sonar && (
        <Glass radius={24} style={{ marginTop: 10 }} innerStyle={{ padding: 16, gap: 12 }} testID="sonar-night">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="sonar" size={18} color={C.sleep} />
            <T size={15} weight="600" style={{ flex: 1 }}>Sleep stages</T>
            <T size={11} weight="600" tone="ink3">estimated · ultrasonic</T>
          </View>
          <Hypnogram stages={unpackStages(sonar.stages)} start={sonar.start} width={inner} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['deep', 'rem', 'light', 'wake'] as const).map(k => (
              <View key={k} style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STAGE_COLOR[k] }} /><T size={11} tone="ink2">{k === 'rem' ? 'REM' : k[0].toUpperCase() + k.slice(1)}</T></View>
                <T size={15} weight="700" tabular>{Math.round(sonar.minutesBy[k])}m</T>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', paddingTop: 10, borderTopWidth: 0.5, borderTopColor: 'rgba(60,60,67,.14)', gap: 8 }}>
            <Stat icon="lungs" color="#32ade6" value={sonar.rate ? `${sonar.rate.avg}` : '–'} label={sonar.rate ? `breaths/min (${sonar.rate.min}–${sonar.rate.max})` : 'breaths/min'} />
            <Stat icon="timer" color={C.sleep} value={sonar.onsetMin != null ? `${Math.round(sonar.onsetMin)}m` : '–'} label="to fall asleep" />
            <Stat icon="sun" color="#ff9f0a" value={String(sonar.wakeups)} label="wake-ups" />
            <Stat icon="alert" color={sonar.events.perHour >= 15 ? '#ff453a' : sonar.events.perHour >= 5 ? '#ff9f0a' : '#34c759'} value={String(sonar.events.perHour)} label="pauses/hour" />
          </View>
          <T size={11} tone="ink3" lh={1.4}>
            Stages are estimated from breathing regularity and movement ({Math.round(sonar.coverage * 100)}% of the night had a clear signal). Breathing pauses are experimental, not a diagnosis; if you often see 5 or more per hour and feel unrefreshed, talk to a doctor.
          </T>
        </Glass>
      )}

      {/* Key numbers */}
      <Glass radius={22} style={{ marginTop: 10 }} innerStyle={{ flexDirection: 'row', padding: 16, gap: 8 }}>
        <Stat icon="moon" color={C.sleep} value={avg != null ? `${Math.floor(avg)}h${String(Math.round((avg % 1) * 60)).padStart(2, '0')}` : '–'} label="7-day average" />
        <Stat icon="timer" color="#32ade6" value={spread != null ? `±${spread}m` : '–'} label="Bedtime spread" />
        <Stat icon="alert" color={debt >= 5 ? '#ff9f0a' : '#34c759'} value={week.length ? `${Math.round(debt * 10) / 10}h` : '–'} label="Sleep debt" />
        <Stat icon="lungs" color="#32ade6" value={sonar?.rate ? `${sonar.rate.avg}` : d.breathing != null ? `${Math.round(d.breathing)}` : '–'} label="Breaths/min" />
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

/** Ultrasonic tracking: what it does, and a live 30 s setup check with the breathing wave and rate. */
function SonarPanel({ width }: { width: number }) {
  const { state: c, start, cancel } = useSonarCheck(30);
  const running = c.phase === 'starting' || c.phase === 'running';
  const good = c.snr >= 0.35 && c.rate != null;
  const w = c.wave, lo = w.length ? Math.min(...w) : 0, hi = w.length ? Math.max(...w) : 1;
  const trace = w.map(v => (hi > lo ? (v - lo) / (hi - lo) : 0.5));
  return (
    <Animated.View entering={FadeIn.duration(250)}>
      <Glass radius={22} style={{ marginTop: 10 }} innerStyle={{ padding: 16, gap: 10 }} testID="sonar-info">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="sonar" size={20} color={C.sleep} />
          <T size={16} weight="700" style={{ flex: 1 }}>Ultrasonic tracking</T>
          <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10, backgroundColor: fill.tertiary }}><T size={11} weight="600" tone="ink2">Beta</T></View>
        </View>
        <T size={13} lh={1.45} color={ink.body}>
          Your phone plays a quiet, inaudible tone and listens to its echo. Each breath moves your chest a few millimetres and shifts the echo, which gives breathing rate, movement and estimated sleep stages, with nothing to wear.
        </T>
        {!SONAR_AVAILABLE ? (
          <T size={13} tone="ink2">Available in the Android app.</T>
        ) : c.phase === 'idle' || c.phase === 'error' ? (
          <>
            {c.error ? <T size={13} weight="600" color="#ff453a">{c.error}</T> : null}
            <T size={12} tone="ink2" lh={1.4}>Before the first night: lie down as you would in bed, phone on the nightstand within 1 m, speaker towards you, and run the check.</T>
            <PressableScale scaleTo={0.96} onPress={start} style={{ height: 44, borderRadius: 22, backgroundColor: ink[1], alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Run setup check">
              <T size={15} weight="600" color="#fff">Run 30-second setup check</T>
            </PressableScale>
          </>
        ) : (
          <View style={{ gap: 10 }}>
            <View style={{ height: 56, justifyContent: 'center' }}>
              {trace.length > 20 ? <Waveform trace={trace} width={width} height={56} color={C.sleep} /> : <T size={13} tone="ink2" center>Listening… lie still and breathe normally</T>}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <T size={34} weight="700" tabular>{c.rate ?? '–'}</T>
              <T size={13} tone="ink2">breaths/min</T>
              <T size={12} weight="600" color={good ? '#248a3d' : '#c25e00'} style={{ marginLeft: 'auto' }}>{c.seconds < 12 ? 'Warming up' : good ? 'Signal good' : 'Signal weak'}</T>
            </View>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: fill.tertiary, overflow: 'hidden' }}><View style={{ width: `${Math.min(1, c.seconds / 30) * 100}%`, height: 4, backgroundColor: C.sleep }} /></View>
            {c.mediaVolume != null && c.mediaVolume < 0.25 && <T size={12} weight="600" color="#c25e00">Media volume is low: turn it up to about half (the tone stays inaudible).</T>}
            {c.phase === 'done' && (
              <T size={12} tone="ink2" lh={1.4}>
                {good ? 'Count your own breaths for 30 s and compare. If they match, choose Going to bed tonight.' : 'Move the phone closer (under 1 m), point the bottom speaker towards your chest, remove any case covering the mic, and try again.'}
              </T>
            )}
            <PressableScale scaleTo={0.96} onPress={running ? cancel : start} style={{ height: 40, borderRadius: 20, backgroundColor: fill.tertiary, alignItems: 'center', justifyContent: 'center' }}>
              <T size={14} weight="600" color={ink[1]}>{running ? 'Stop' : 'Check again'}</T>
            </PressableScale>
          </View>
        )}
      </Glass>
    </Animated.View>
  );
}
