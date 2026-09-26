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
import { DayChart, dayLabel, Poincare, Tachogram, Waveform, type DayPoint } from '../viz/charts';

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

const Metric = ({ label, value, unit, big }: { label: string; value: string; unit?: string; big?: boolean }) => (
  <View style={{ flex: 1, gap: 2 }}>
    <T size={big ? 26 : 17} weight={big ? '700' : '600'} track={-0.02} tabular>{value}{unit ? <T size={12} weight="500" tone="ink3"> {unit}</T> : null}</T>
    <T size={12} tone="ink2">{label}</T>
  </View>
);

type Chip = { t: string; c: string; bg: string };
const CHIP = {
  normal: { t: 'Normal', c: '#248a3d', bg: 'rgba(52,199,89,.14)' },
  low: { t: 'Below normal', c: '#c25e00', bg: 'rgba(255,149,0,.14)' },
  high: { t: 'Above normal', c: '#248a3d', bg: 'rgba(52,199,89,.14)' },
} satisfies Record<string, Chip>;

/** A trend card: the selected (or latest) value as a big number, a status chip, and a clean day chart. */
function TrendCard({ title, unit, points, color, band, chip, note, width }: {
  title: string; unit: string; points: DayPoint[]; color: string; band?: [number, number] | null; chip?: Chip | null; note?: string; width: number;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const i = sel ?? points.length - 1, p = points[i];
  const avg = Math.round(mean(points.map(x => x.v)));
  return (
    <Glass radius={24} style={{ marginTop: 10 }} innerStyle={{ padding: 16, gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T size={14} weight="600" color={color}>{title}</T>
        {sel == null && chip ? (
          <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10, backgroundColor: chip.bg }}><T size={12} weight="600" color={chip.c}>{chip.t}</T></View>
        ) : <T size={12} tone="ink3" tabular>avg {avg} {unit}</T>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <T size={34} weight="700" track={-0.035} tabular>{Math.round(p.v)}</T>
        <T size={14} weight="500" tone="ink3">{unit}</T>
        <T size={13} tone="ink2" style={{ marginLeft: 'auto' }}>{sel == null ? 'Latest morning' : dayLabel(p.date)}</T>
      </View>
      <View style={{ marginTop: 6 }}>
        <DayChart points={points} color={color} width={width} band={band} selected={sel} onSelect={setSel} />
      </View>
      {note ? <T size={13} tone="ink2" lh={1.4} style={{ marginTop: 6 }}>{note}</T> : null}
    </Glass>
  );
}

/**
 * Heart trends: HRV and resting HR per morning (with the personal normal band the recovery score
 * uses), then the latest session: three numbers up front, the technical detail behind a disclosure.
 */
export function Heart({ onBack }: { onBack: () => void }) {
  const { s } = useStore();
  const h = useHeart();
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [more, setMore] = useState(false);
  const [w, setW] = useState(0);
  // One morning value per day (the recovery algorithm's inputs), so trends match the scores.
  const d = deriveHealth(s);
  const days = d.days.filter(x => x.rhr != null).slice(range === 'week' ? -7 : -30);
  const hrPts: DayPoint[] = days.map(x => ({ date: x.date, v: x.rhr! }));
  const rmPts: DayPoint[] = days.filter(x => x.lnRmssd != null).map(x => ({ date: x.date, v: Math.round(Math.exp(x.lnRmssd!)) }));
  const band = d.recovery.band;
  const latest = d.latestHeart;
  const hrvKey = !latest || !band ? null : latest.rmssd < band[0] ? 'low' : latest.rmssd > band[1] ? 'high' : 'normal';
  const hrvNote = hrvKey === 'low' ? 'Lower than your normal. Often follows short sleep, stress, illness or hard training: take it easier today.'
    : hrvKey === 'high' ? 'Higher than your normal: usually a sign you’re well recovered.'
    : hrvKey === 'normal' ? 'In your normal range: recovery looks typical for you.'
    : `Your normal range appears after ${Math.max(0, 3 - d.recovery.baselineDays)} more morning${3 - d.recovery.baselineDays === 1 ? '' : 's'}.`;

  const L = h.live, measuring = L.phase === 'measuring';
  const session = L.ibis.length >= 3 ? hrvFromIbis(L.ibis.map(ms => ({ ms, valid: true }))) : null;
  const inner = Math.max(0, w - 32);
  const qualityNote = L.quality === 'good' ? 'Clean signal' : L.quality === 'fair' ? 'Usable signal, some noise' : L.quality === 'poor' ? 'Noisy signal: keep still, press lightly' : '';

  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)}>
      <PressableScale onPress={onBack} accessibilityLabel="Back to Details" style={{ flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 6 }}>
        <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="m15 18-6-6 6-6" fill="none" stroke={accent.tab} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        <T size={16} weight="500" color={accent.tab}>Details</T>
      </PressableScale>
      <View style={{ paddingHorizontal: 4 }}>
        <T size={13} weight="500" tone="ink2">Heart rate · HRV</T>
        <T size={32} weight="700" track={-0.025} lh={1.15} accessibilityRole="header">Heart</T>
      </View>

      <View style={{ marginTop: 14 }}><Segmented options={[['week', 'Week'], ['month', 'Month']]} value={range} onChange={setRange} /></View>

      {rmPts.length < 2 ? (
        <Glass radius={24} style={{ marginTop: 10 }} innerStyle={{ padding: 16, gap: 6 }}>
          <T size={15} weight="600">{latest ? `${latest.hr} bpm · HRV ${latest.rmssd} ms` : 'No measurements yet'}</T>
          <T size={13} tone="ink2" lh={1.4}>Your trend appears after measurements on two different mornings. Measure at the same time each morning, before coffee, for the clearest picture.</T>
        </Glass>
      ) : (
        <>
          <TrendCard title="HRV" unit="ms" points={rmPts} color="#7c5cff" band={band} chip={hrvKey ? CHIP[hrvKey] : null} note={hrvNote} width={inner} />
          <TrendCard title="Resting heart rate" unit="bpm" points={hrPts} color="#ff6b5a" width={inner} />
          <T size={11} tone="ink3" lh={1.4} style={{ paddingTop: 8, paddingHorizontal: 16 }}>Tap or drag a chart to see a day. HRV here is RMSSD from your first measurement each morning; “your normal” is the mean ± ½ SD of your previous mornings.</T>
        </>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 26, paddingHorizontal: 6, paddingBottom: 8 }}>
        <T size={19} weight="700" track={-0.015}>{measuring ? 'Measuring' : 'Latest session'}</T>
        {qualityNote ? <T size={12} weight="600" color={L.quality === 'good' ? '#248a3d' : L.quality === 'fair' ? '#c25e00' : accent.heart}>{qualityNote}</T> : null}
      </View>
      <Glass radius={24} innerStyle={{ padding: 16, gap: 14 }}>
        {L.trace.length > 1 ? (
          <>
            <Waveform trace={L.trace} width={inner} height={56} />
            {measuring && <View style={{ height: 4, borderRadius: 2, backgroundColor: fill.tertiary, overflow: 'hidden' }}><View style={{ width: `${L.progress * 100}%`, height: 4, backgroundColor: accent.heart }} /></View>}
            <View style={{ flexDirection: 'row' }}>
              <Metric big label="Heart rate" value={session ? String(Math.round(session.hr)) : '–'} unit="bpm" />
              <Metric big label="HRV" value={session && isFinite(session.rmssd) ? String(Math.round(session.rmssd)) : '–'} unit="ms" />
              <Metric big label="Breathing" value={L.respRate != null ? String(Math.round(L.respRate)) : '–'} unit="/min" />
            </View>
            <Pressable onPress={() => setMore(m => !m)} accessibilityRole="button" accessibilityState={{ expanded: more }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <T size={14} weight="600" color={accent.tab}>{more ? 'Hide details' : 'Details'}</T>
              <Svg width={12} height={12} viewBox="0 0 24 24" style={{ transform: [{ rotate: more ? '180deg' : '0deg' }] }}><Path d="m6 9 6 6 6-6" fill="none" stroke={accent.tab} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></Svg>
            </Pressable>
            {more && (
              <Animated.View entering={FadeIn.duration(200)} style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row' }}>
                  <Metric label="SDNN" value={session ? String(Math.round(session.sdnn)) : '–'} unit="ms" />
                  <Metric label="Beats" value={String(L.ibis.length + (L.ibis.length ? 1 : 0))} />
                  <Metric label="Perfusion" value={L.perfusion != null ? L.perfusion.toFixed(1) : '–'} unit="%" />
                  <Metric label="Signal" value={L.score != null ? String(L.score) : '–'} />
                </View>
                {L.ibis.length > 3 && (
                  <>
                    <T size={12} weight="600" tone="ink2">Beat-to-beat intervals</T>
                    <Tachogram ibis={L.ibis} width={inner} />
                    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                      <Poincare ibis={L.ibis} sd1={session?.sd1} sd2={session?.sd2} size={112} />
                      <T size={13} lh={1.4} color={ink.body} style={{ flex: 1 }}>Each dot is one beat against the next. A wider cloud across the diagonal (SD1 {session && isFinite(session.sd1) ? Math.round(session.sd1) : '–'} ms) means more beat-to-beat variability. Colour channel: {L.channel ? L.channel.toUpperCase() : '–'}.</T>
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
