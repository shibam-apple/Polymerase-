import { useState } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { mean } from '../signal/filters';
import { hrvFromIbis } from '../signal/hrv';
import { deriveHealth } from '../state/health';
import { useHeart } from '../state/heart';
import { useStore } from '../state/store';
import { accent, fill, ink } from '../theme';
import { PressableScale } from '../ui/controls';
import { Glass } from '../ui/glass/Glass';
import { T } from '../ui/Text';
import { Icon, type IconName } from '../ui/icons';
import { DayBars, DayChart, dayLabel, Poincare, PulseLine, Tachogram, Waveform, type DayPoint } from '../viz/charts';

function Segmented<K extends string>({ options, value, onChange }: { options: [K, string][]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={{ flexDirection: 'row', padding: 2, borderRadius: 10, backgroundColor: fill.tertiary }}>
      {options.map(([k, label]) => (
        <PressableScale key={k} scaleTo={0.96} onPress={() => onChange(k)} accessibilityState={{ selected: value === k }} style={{ flex: 1, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: value === k ? '#fff' : 'transparent', boxShadow: value === k ? '0 1px 3px rgba(0,0,0,.1)' : undefined }}>
          <T size={13} weight="600" color={ink[1]}>{label}</T>
        </PressableScale>
      ))}
    </View>
  );
}

/** Raw R/G/B session as compact JSON through the system share sheet, so it can be sent back for tuning. */
function shareSession(sess: NonNullable<ReturnType<typeof useHeart>['lastSession']>) {
  const q = (a: number[], d = 2) => a.map(v => Math.round(v * 10 ** d) / 10 ** d);
  const body = JSON.stringify({ ...sess, t: q(sess.t, 4), r: q(sess.r), g: q(sess.g), b: q(sess.b) });
  Share.share({ title: 'Daily PPG session', message: body }).catch(() => {});
}

const GOOD = '#34c759', WARN = '#ff9f0a', HIGH = '#0a84ff';
type State = { word: string; c: string } | null;

/** A big number with its unit and a one-word state underneath. */
const Metric = ({ label, value, unit, state, big }: { label: string; value: string; unit?: string; state?: State; big?: boolean }) => (
  <View style={{ flex: 1, gap: 2 }}>
    <T size={big ? 26 : 17} weight={big ? '700' : '600'} track={-0.02} tabular>{value}{unit ? <T size={12} weight="500" tone="ink3"> {unit}</T> : null}</T>
    <T size={12} tone="ink2">{label}</T>
    {state ? <T size={11} weight="600" color={state.c}>{state.word}</T> : null}
  </View>
);

const avg = (v: number[]) => (v.length ? Math.round(mean(v)) : null);
const timeOf = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const dayWord = (t: number, now: Date) => { const d = new Date(t); return d.toDateString() === now.toDateString() ? 'Today' : `${d.getDate()}/${d.getMonth() + 1}`; };

/**
 * A summary like a watch widget: icon + title + when, one huge number, then weekly and monthly
 * averages. Below it, day bars with an optional "your normal" band; tap a bar to read that day.
 */
function MetricCard({ icon, color, title, unit, latest, when, week, month, chip, points, band, colorFor, caption, width, line }: {
  icon: IconName; color: string; title: string; unit: string; latest: number | null; when: string; week: number | null; month: number | null; chip?: State;
  points: DayPoint[]; band?: [number, number] | null; colorFor?: (v: number) => string; caption: string; width: number;
  /** A line scaled to the data instead of bars from zero (for values that only move a few %, like resting HR). */
  line?: boolean;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const p = sel != null ? points[sel] : null;
  return (
    <Glass radius={24} style={{ marginTop: 10 }} innerStyle={{ padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={18} color={color} />
        <T size={15} weight="600" color={color} style={{ flex: 1 }}>{title}</T>
        {chip && !p ? <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10, backgroundColor: `${chip.c}22` }}><T size={12} weight="600" color={chip.c}>{chip.word}</T></View> : null}
      </View>
      <View>
        <T size={13} tone="ink2">{p ? dayLabel(p.date) : when}</T>
        <T size={44} weight="700" track={-0.04} lh={1.1} tabular>{p ? Math.round(p.v) : latest ?? '–'}<T size={16} weight="600" tone="ink3" track={0}> {unit}</T></T>
      </View>
      <View style={{ flexDirection: 'row', paddingTop: 10, borderTopWidth: 0.5, borderTopColor: 'rgba(60,60,67,.14)' }}>
        <View style={{ flex: 1 }}><T size={12} tone="ink2">Weekly average</T><T size={22} weight="700" tabular>{week ?? '–'}<T size={12} tone="ink3"> {unit}</T></T></View>
        <View style={{ flex: 1 }}><T size={12} tone="ink2">Monthly average</T><T size={22} weight="700" tabular>{month ?? '–'}<T size={12} tone="ink3"> {unit}</T></T></View>
      </View>
      {points.length >= 2 ? (
        <>
          {line
            ? <DayChart points={points} width={width} color={color} band={band} selected={sel} onSelect={setSel} />
            : <DayBars points={points} width={width} band={band} color={color} colorFor={colorFor} selected={sel} onSelect={setSel} />}
          <T size={12} tone="ink2" lh={1.35}>{caption}</T>
        </>
      ) : (
        <T size={12} tone="ink2" lh={1.35}>Bars appear after mornings on two different days. Measure at the same time each morning, before coffee.</T>
      )}
    </Glass>
  );
}

/**
 * Heart: HR and HRV as easy summaries and day bars, then the latest session — its pulse over the
 * minute and three numbers up front, with the technical detail behind "Expert view".
 */
export function Heart({ onBack, backLabel = 'Details' }: { onBack: () => void; backLabel?: string }) {
  const { s } = useStore();
  const h = useHeart();
  const now = new Date();
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [expert, setExpert] = useState(false);
  const [w, setW] = useState(0);
  // One morning value per day (the readiness inputs), so trends match the scores.
  const d = deriveHealth(s);
  const all = d.days.filter(x => x.rhr != null);
  const days = all.slice(range === 'week' ? -7 : -30);
  const hrPts: DayPoint[] = days.map(x => ({ date: x.date, v: x.rhr! }));
  const rmPts: DayPoint[] = days.filter(x => x.lnRmssd != null).map(x => ({ date: x.date, v: Math.round(Math.exp(x.lnRmssd!)) }));
  const rmAll = all.filter(x => x.lnRmssd != null).map(x => Math.exp(x.lnRmssd!));
  const band = d.recovery.band;
  const last = d.latestHeart;
  const hrvColor = (v: number) => (!band ? '#8e6cff' : v < band[0] ? WARN : v > band[1] ? HIGH : GOOD);
  const hrvChip: State = last && band ? (last.rmssd < band[0] ? { word: 'Below normal', c: WARN } : last.rmssd > band[1] ? { word: 'Above normal', c: HIGH } : { word: 'Normal', c: GOOD }) : null;

  const L = h.live, measuring = L.phase === 'measuring';
  const session = L.ibis.length >= 3 ? hrvFromIbis(L.ibis.map(ms => ({ ms, valid: true }))) : null;
  const inner = Math.max(0, w - 32);
  const qualityNote = L.quality === 'good' ? 'Clean signal' : L.quality === 'fair' ? 'Usable signal' : L.quality === 'poor' ? 'Noisy: keep still' : '';
  const sHrv = session && isFinite(session.rmssd) ? Math.round(session.rmssd) : null;
  const sHrvState: State = sHrv != null && band ? (sHrv < band[0] ? { word: 'Below your normal', c: WARN } : sHrv > band[1] ? { word: 'Above your normal', c: HIGH } : { word: 'Your normal', c: GOOD }) : null;
  const br = L.respRate;
  const brState: State = br != null ? (br >= 10 && br <= 20 ? { word: 'Typical at rest', c: GOOD } : { word: br < 10 ? 'Slow' : 'Fast', c: WARN }) : null;

  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)}>
      <PressableScale onPress={onBack} accessibilityLabel={`Back to ${backLabel}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 6 }}>
        <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="m15 18-6-6 6-6" fill="none" stroke={accent.tab} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        <T size={16} weight="500" color={accent.tab}>{backLabel}</T>
      </PressableScale>
      <View style={{ paddingHorizontal: 4 }}>
        <T size={13} weight="500" tone="ink2">Heart rate · HRV · Breathing</T>
        <T size={32} weight="700" track={-0.025} lh={1.15} accessibilityRole="header">Heart</T>
      </View>

      <View style={{ marginTop: 14 }}><Segmented options={[['week', 'Week'], ['month', 'Month']]} value={range} onChange={setRange} /></View>

      <MetricCard icon="heart" color="#ff375f" title="Resting heart rate" unit="bpm" latest={last?.hr ?? null} when={last ? `${dayWord(last.at, now)} ${timeOf(last.at)}` : 'No measurement yet'}
        week={avg(all.slice(-7).map(x => x.rhr!))} month={avg(all.slice(-30).map(x => x.rhr!))} points={hrPts} width={inner} line
        caption="Lower is usually better. A jump of 5+ bpm above your usual can mean strain, poor sleep or illness." />
      <MetricCard icon="wave" color="#8e6cff" title="Heart rate variability" unit="ms" latest={last?.rmssd ?? null} when={last ? `${dayWord(last.at, now)} ${timeOf(last.at)}` : 'No measurement yet'}
        week={avg(rmAll.slice(-7))} month={avg(rmAll.slice(-30))} chip={hrvChip} points={rmPts} band={band} colorFor={hrvColor} width={inner}
        caption="Taller bars = more recovered, for you. Green is inside your normal (shaded), amber below it, blue above." />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 26, paddingHorizontal: 6, paddingBottom: 8 }}>
        <T size={19} weight="700" track={-0.015}>{measuring ? 'Measuring' : 'Latest session'}</T>
        {qualityNote ? <T size={12} weight="600" color={L.quality === 'good' ? '#248a3d' : L.quality === 'fair' ? '#c25e00' : accent.heart}>{qualityNote}</T> : null}
      </View>
      <Glass radius={24} innerStyle={{ padding: 16, gap: 14 }}>
        {L.trace.length > 1 ? (
          <>
            {measuring && <Waveform trace={L.trace} width={inner} height={48} />}
            {measuring && <View style={{ height: 4, borderRadius: 2, backgroundColor: fill.tertiary, overflow: 'hidden' }}><View style={{ width: `${L.progress * 100}%`, height: 4, backgroundColor: accent.heart }} /></View>}
            <View style={{ flexDirection: 'row' }}>
              <Metric big label="Heart rate" value={session ? String(Math.round(session.hr)) : '–'} unit="bpm" />
              <Metric big label="HRV" value={sHrv != null ? String(sHrv) : '–'} unit="ms" state={sHrvState} />
              <Metric big label="Breathing" value={br != null ? String(Math.round(br)) : '–'} unit="/min" state={brState} />
            </View>
            {L.ibis.length > 3 && (
              <View style={{ gap: 6 }}>
                <T size={13} weight="600" tone="ink2">Your pulse during the minute</T>
                <PulseLine ibis={L.ibis} width={inner} />
                <T size={12} tone="ink2" lh={1.35}>It rises as you breathe in and falls as you breathe out. A bigger swing usually means higher HRV.</T>
              </View>
            )}
            <Pressable onPress={() => setExpert(m => !m)} accessibilityRole="button" accessibilityState={{ expanded: expert }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <T size={14} weight="600" color={accent.tab}>{expert ? 'Hide expert view' : 'Expert view'}</T>
              <Svg width={12} height={12} viewBox="0 0 24 24" style={{ transform: [{ rotate: expert ? '180deg' : '0deg' }] }}><Path d="m6 9 6 6 6-6" fill="none" stroke={accent.tab} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></Svg>
            </Pressable>
            {expert && (
              <Animated.View entering={FadeIn.duration(200)} style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row' }}>
                  <Metric label="SDNN" value={session ? String(Math.round(session.sdnn)) : '–'} unit="ms" />
                  <Metric label="Beats" value={String(L.ibis.length + (L.ibis.length ? 1 : 0))} />
                  <Metric label="Perfusion" value={L.perfusion != null ? L.perfusion.toFixed(1) : '–'} unit="%" />
                  <Metric label="Signal" value={L.score != null ? String(L.score) : '–'} />
                </View>
                {L.ibis.length > 3 && (
                  <>
                    <T size={12} weight="600" tone="ink2">Beat-to-beat intervals (ms)</T>
                    <Tachogram ibis={L.ibis} width={inner} />
                    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                      <Poincare ibis={L.ibis} sd1={session?.sd1} sd2={session?.sd2} size={112} />
                      <T size={12} lh={1.4} color={ink.body} style={{ flex: 1 }}>Poincaré plot: each dot is one beat against the next. SD1 {session && isFinite(session.sd1) ? Math.round(session.sd1) : '–'} ms, SD2 {session && isFinite(session.sd2) ? Math.round(session.sd2) : '–'} ms. Colour channel {L.channel ? L.channel.toUpperCase() : '–'}.</T>
                    </View>
                  </>
                )}
              </Animated.View>
            )}
          </>
        ) : measuring ? (
          <View style={{ gap: 8, alignItems: 'center', paddingVertical: 8 }}>
            <T size={15} weight="600">Finding your pulse…</T>
            <T size={13} tone="ink2" center lh={1.4}>{L.status === 'no-contact' ? 'Cover the lens and flash fully with your fingertip.' : 'Keep still. The first few seconds let the camera settle.'}</T>
          </View>
        ) : (
          <View style={{ gap: 8, alignItems: 'center', paddingVertical: 8 }}>
            <T size={15} weight="600">No session yet</T>
            <T size={13} tone="ink2" center lh={1.4}>Rest your fingertip over the rear camera and flash. 60 seconds gives a reliable HRV reading.</T>
          </View>
        )}
        <PressableScale scaleTo={0.97} onPress={measuring ? h.cancel : h.start} style={{ height: 48, borderRadius: 24, backgroundColor: measuring ? fill.tertiary : ink[1], alignItems: 'center', justifyContent: 'center' }}>
          <T size={16} weight="600" color={measuring ? ink[1] : '#fff'}>{measuring ? 'Stop' : 'Measure now'}</T>
        </PressableScale>
        {!measuring && h.lastSession && (
          <PressableScale scaleTo={0.97} onPress={() => shareSession(h.lastSession!)} style={{ height: 44, borderRadius: 22, backgroundColor: fill.tertiary, alignItems: 'center', justifyContent: 'center' }}>
            <T size={15} weight="600" color={ink[1]}>Share raw measurement</T>
          </PressableScale>
        )}
      </Glass>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 26, paddingHorizontal: 6, paddingBottom: 8 }}>
        <T size={19} weight="700" track={-0.015}>Glucose</T>
        <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: fill.tertiary }}><T size={12} weight="600" tone="ink2">Research</T></View>
      </View>
      <Glass radius={20} innerStyle={{ padding: 16, gap: 8 }} testID="analytics-glucose">
        <T size={15} weight="600">No estimate yet, on purpose</T>
        <T size={13} lh={1.45} color={ink.body}>
          We tested glucose-from-pulse on a public dataset of 20 people with the same algorithm this app runs. On people it hadn’t seen, it did no better than guessing the average, so showing a number would mislead you.
        </T>
        <T size={13} lh={1.45} color={ink.body}>
          Each measurement still records the pulse shape (rise time, reflection, second-derivative ratios) so a future model can be checked against it.
        </T>
      </Glass>

      {(Platform.OS === 'web' || __DEV__) && <T size={13} tone="ink2" style={{ paddingTop: 22, paddingHorizontal: 16, paddingBottom: 6 }}>Signal source</T>}
      {(Platform.OS === 'web' || __DEV__) && <Segmented options={[['camera', 'Phone camera'], ['simulated', 'Simulated']]} value={h.source} onChange={k => { if (!measuring) h.setSource(k); }} />}
      <T size={11} tone="ink3" lh={1.4} style={{ paddingTop: 8, paddingHorizontal: 16 }}>
        {Platform.OS === 'web' ? 'Browsers can’t control the flash, so web builds use a simulated signal. ' : ''}
        Processing runs on the phone: band-pass filter, Elgendi peak detection, artefact rejection, then HR and HRV. Not a medical device.
      </T>
    </View>
  );
}
