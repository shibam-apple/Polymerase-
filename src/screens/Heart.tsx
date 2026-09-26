import { useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { mean, std } from '../signal/filters';
import { hrvFromIbis } from '../signal/hrv';
import { useHeart } from '../state/heart';
import { useStore } from '../state/store';
import { accent, fill, ink } from '../theme';
import { PressableScale } from '../ui/controls';
import { Glass } from '../ui/glass/Glass';
import { T } from '../ui/Text';
import { Poincare, Tachogram, TrendChart, Waveform } from '../viz/charts';

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

const Metric = ({ label, value, unit }: { label: string; value: string; unit?: string }) => (
  <View style={{ flex: 1, gap: 2 }}>
    <T size={20} weight="600" track={-0.02} tabular>{value}{unit ? <T size={12} weight="500" tone="ink3"> {unit}</T> : null}</T>
    <T size={12} tone="ink2">{label}</T>
  </View>
);

/**
 * Heart trends: resting HR and HRV history (with the personal normal band the recovery score
 * uses), the latest session's waveform, RR tachogram and Poincaré plot, and the signal source.
 */
export function Heart({ onBack }: { onBack: () => void }) {
  const { s } = useStore();
  const h = useHeart();
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [w, setW] = useState(0);
  const log = s.heartLog.slice(range === 'week' ? -7 : -30);
  const hr = log.map(e => e.hr), rm = log.map(e => e.rmssd);
  const all = s.heartLog.map(e => Math.log(e.rmssd));
  const m = mean(all), sd = std(all);
  const band: [number, number] = [Math.exp(m - 0.5 * sd), Math.exp(m + 0.5 * sd)];
  const latest = s.heartLog[s.heartLog.length - 1];
  const hrvState = latest.rmssd < band[0] ? { t: 'Below your normal range', sub: 'Often follows poor sleep, stress, illness or hard training. Take it easier today.', c: '#c25e00' }
    : latest.rmssd > band[1] ? { t: 'Above your normal range', sub: 'Usually a sign you’re well recovered.', c: '#248a3d' }
    : { t: 'Within your normal range', sub: 'Your recovery looks typical for you.', c: '#248a3d' };

  const L = h.live, measuring = L.phase === 'measuring';
  const session = L.ibis.length >= 3 ? hrvFromIbis(L.ibis.map(ms => ({ ms, valid: true }))) : null;
  const labels: [string, string] = range === 'week' ? ['7 days ago', 'Today'] : ['30 days ago', 'Today'];
  const inner = Math.max(0, w - 32);

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

      <Glass radius={24} style={{ marginTop: 14 }} innerStyle={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <T size={14} weight="600">Resting heart rate</T>
          <T size={13} tone="ink2" tabular>avg {Math.round(mean(hr))} bpm</T>
        </View>
        <T size={28} weight="700" track={-0.03} tabular>{latest.hr}<T size={13} weight="500" tone="ink3"> bpm this morning</T></T>
        <TrendChart key={`hr-${range}`} data={hr} color="#ff6b5a" width={inner} labels={labels} />
      </Glass>

      <Glass radius={24} style={{ marginTop: 10 }} innerStyle={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <T size={14} weight="600">HRV · RMSSD</T>
          <T size={13} tone="ink2" tabular>normal {Math.round(band[0])}–{Math.round(band[1])} ms</T>
        </View>
        <T size={28} weight="700" track={-0.03} tabular>{latest.rmssd}<T size={13} weight="500" tone="ink3"> ms</T></T>
        <TrendChart key={`rm-${range}`} data={rm} color="#7c5cff" width={inner} band={band} labels={labels} />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 14, backgroundColor: fill.quaternary }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, backgroundColor: hrvState.c }} />
          <View style={{ flex: 1 }}>
            <T size={14} weight="600">{hrvState.t}</T>
            <T size={13} tone="ink2" lh={1.35}>{hrvState.sub}</T>
          </View>
        </View>
        <T size={11} tone="ink3" lh={1.4}>The shaded band is your personal normal: the mean ± ½ SD of ln(RMSSD) across your readings.</T>
      </Glass>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 26, paddingHorizontal: 6, paddingBottom: 8 }}>
        <T size={19} weight="700" track={-0.015}>{measuring ? 'Measuring' : 'Latest session'}</T>
        {L.quality && <T size={12} weight="600" color={L.quality === 'good' ? '#248a3d' : L.quality === 'fair' ? '#c25e00' : accent.heart}>Signal {L.quality}</T>}
      </View>
      <Glass radius={24} innerStyle={{ padding: 16, gap: 14 }}>
        {L.trace.length > 1 ? (
          <>
            <Waveform trace={L.trace} width={inner} height={56} />
            {measuring && <View style={{ height: 4, borderRadius: 2, backgroundColor: fill.tertiary, overflow: 'hidden' }}><View style={{ width: `${L.progress * 100}%`, height: 4, backgroundColor: accent.heart }} /></View>}
            <View style={{ flexDirection: 'row' }}>
              <Metric label="Heart rate" value={session ? String(Math.round(session.hr)) : '–'} unit="bpm" />
              <Metric label="RMSSD" value={session && isFinite(session.rmssd) ? String(Math.round(session.rmssd)) : '–'} unit="ms" />
              <Metric label="SDNN" value={session ? String(Math.round(session.sdnn)) : '–'} unit="ms" />
              <Metric label="Beats" value={String(L.ibis.length + (L.ibis.length ? 1 : 0))} />
            </View>
            {L.ibis.length > 3 && (
              <Animated.View entering={FadeIn.duration(300)} style={{ gap: 8 }}>
                <T size={12} weight="600" tone="ink2">Beat-to-beat intervals</T>
                <Tachogram ibis={L.ibis} width={inner} />
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                  <Poincare ibis={L.ibis} sd1={session?.sd1} sd2={session?.sd2} size={120} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <T size={12} weight="600" tone="ink2">Poincaré plot</T>
                    <T size={13} lh={1.4} color={ink.body}>Each dot is one beat against the next. A wider cloud across the diagonal (SD1 {session && isFinite(session.sd1) ? Math.round(session.sd1) : '–'} ms) means more beat-to-beat variability.</T>
                  </View>
                </View>
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
      </Glass>

      <T size={13} tone="ink2" style={{ paddingTop: 22, paddingHorizontal: 16, paddingBottom: 6 }}>Signal source</T>
      <Segmented options={[['camera', 'Phone camera'], ['simulated', 'Simulated']]} value={h.source} onChange={k => { if (!measuring) h.setSource(k); }} />
      <T size={11} tone="ink3" lh={1.4} style={{ paddingTop: 8, paddingHorizontal: 16 }}>
        {Platform.OS === 'web' ? 'Browsers can’t control the flash, so web builds use a simulated signal. ' : ''}
        Processing runs on the phone: band-pass filter, Elgendi peak detection, artefact rejection, then HR and HRV. Not a medical device.
      </T>
    </View>
  );
}
