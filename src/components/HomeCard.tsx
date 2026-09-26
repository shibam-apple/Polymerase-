import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import type { Derived } from '../state/health';
import { useHeart } from '../state/heart';
import { useStore } from '../state/store';
import type { Item, Page } from '../state/types';
import { C, ink } from '../theme';
import { Glass } from '../ui/glass/Glass';
import { Icon, type IconName } from '../ui/icons';
import { PressableScale } from '../ui/controls';
import { T, useInk } from '../ui/Text';

const GOOD = '#34c759', WARN = '#ff9f0a', BAD = '#ff453a';
const scoreColor = (s: number) => (s >= 80 ? GOOD : s >= 60 ? WARN : BAD);
const clock = (t: number) => { const x = new Date(t); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
const hm = (h: number) => `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** Readiness as a ring with the score inside. */
function Ring({ score, size = 62, dark }: { score: number | null; size?: number; dark: boolean }) {
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={dark ? 'rgba(255,255,255,.18)' : 'rgba(120,120,128,.16)'} strokeWidth={6} fill="none" />
        {score != null && <Circle cx={size / 2} cy={size / 2} r={r} stroke={scoreColor(score)} strokeWidth={6} fill="none" strokeLinecap="round" strokeDasharray={`${(c * score) / 100} ${c}`} />}
      </Svg>
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        <T size={21} weight="700" track={-0.03} tabular>{score ?? '–'}</T>
      </View>
    </View>
  );
}

/** One icon stat: coloured line icon, value, unit, and a small state dot. */
function Stat({ icon, color, value, unit, state, label, onPress }: { icon: IconName; color: string; value: string; unit: string; state: 'good' | 'warn' | null; label: string; onPress: () => void }) {
  return (
    <PressableScale scaleTo={0.94} onPress={onPress} accessibilityLabel={`${label} ${value} ${unit}`} style={{ flex: 1, alignItems: 'flex-start', gap: 4 }}>
      <Icon name={icon} size={18} color={color} />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <T size={20} weight="700" track={-0.02} tabular>{value}</T>
        {state && <View style={{ width: 6, height: 6, borderRadius: 3, marginBottom: 2, backgroundColor: state === 'good' ? GOOD : WARN }} />}
      </View>
      <T size={11} weight="500" tone="ink2">{unit}</T>
    </PressableScale>
  );
}

/** A compact action row inside the card: icon · title/sub · trailing element. */
function Row({ icon, iconColor, title, sub, onPress, trailing, fill, testID }: { icon: IconName; iconColor: string; title: string; sub?: string; onPress: () => void; trailing?: React.ReactNode; fill: string; testID?: string }) {
  return (
    <PressableScale testID={testID} scaleTo={0.98} onPress={onPress} accessibilityLabel={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 18, backgroundColor: fill }}>
      <Icon name={icon} size={20} color={iconColor} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T size={15} weight="600" numberOfLines={1}>{title}</T>
        {sub ? <T size={12} tone="ink2" numberOfLines={1}>{sub}</T> : null}
      </View>
      {trailing}
    </PressableScale>
  );
}

/**
 * The home card: one liquid-glass window with readiness, four icon stats, the top prediction and the
 * next thing to do. Dark tint and white text over the night sky.
 */
export function HomeCard({ d, now, dark, nx, left, onPage }: { d: Derived; now: Date; dark: boolean; nx: (Item & { cta: string }) | null; left: number; onPage: (p: Page) => void }) {
  const { s, a } = useStore();
  const h = useHeart();
  const ink2 = useInk();
  const rec = d.recovery, last = d.latestHeart, target = s.profile.sleepTargetH;
  const fill = dark ? 'rgba(255,255,255,.12)' : 'rgba(120,120,128,.1)';
  const btnBg = dark ? '#fff' : ink[1], btnFg = dark ? ink[1] : '#fff';
  const hour = now.getHours();

  const hrvPart = rec.parts.find(p => p.key === 'hrv'), rhrPart = rec.parts.find(p => p.key === 'rhr');
  const reasons = [
    hrvPart && (hrvPart.note.startsWith('Above') ? 'HRV above your normal' : hrvPart.note.startsWith('Below') ? 'HRV below your normal' : 'HRV normal'),
    rhrPart && rhrPart.note.includes('above') ? `resting HR ${rhrPart.note.split(' ')[0]} up` : null,
    d.sleepToday ? `slept ${hm(d.sleepToday.hours)}` : null,
  ].filter(Boolean).join(' · ');
  const measure = () => { onPage('heart'); h.start(); };

  const band = rec.band;
  const hrvState = last && band ? (last.rmssd < band[0] ? 'warn' : 'good') : null;
  const hrState = rhrPart ? (rhrPart.note.includes('above') ? 'warn' : 'good') : null;
  const sleepState = d.sleepToday ? (d.sleepToday.hours >= target - 0.5 ? 'good' : 'warn') : null;
  const br = d.breathing;
  const brState = br != null ? (br >= 10 && br <= 20 ? 'good' : 'warn') : null;

  const top = d.predictions[0];
  const asleepH = s.sleepStart != null ? Math.max(0, (now.getTime() - s.sleepStart) / 3600000) : 0;

  return (
    <Glass variant="glass" dark={dark} radius={30} style={{ marginTop: 16 }} innerStyle={{ padding: 16, gap: 14 }} testID="home-card">
      {/* Readiness */}
      <Pressable onPress={() => (rec.score == null ? measure() : a.openSheet('insights'))} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }} accessibilityRole="button" accessibilityLabel={`Readiness ${rec.score ?? 'not measured'}`}>
        <Ring score={rec.score} dark={dark} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <T size={12} weight="600" tone="ink2">Readiness{rec.status === 'provisional' ? ' · provisional' : ''}</T>
          <T size={21} weight="700" track={-0.02} numberOfLines={1}>{rec.score != null ? rec.label : 'No reading yet'}</T>
          <T size={12} tone="ink2" numberOfLines={1}>
            {rec.score != null ? reasons || 'Based on this morning' : '1 minute, fingertip on camera'}
          </T>
        </View>
        {rec.score == null ? (
          <PressableScale scaleTo={0.94} onPress={measure} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: btnBg, justifyContent: 'center' }}>
            <T size={14} weight="600" color={btnFg}>Measure</T>
          </PressableScale>
        ) : d.forecast ? (
          <View style={{ alignItems: 'flex-end' }}>
            <T size={11} tone="ink2">Tomorrow</T>
            <T size={17} weight="700" tabular>~{d.forecast.score}</T>
          </View>
        ) : null}
      </Pressable>

      {/* Stats */}
      <View style={{ flexDirection: 'row', paddingTop: 12, borderTopWidth: 0.5, borderTopColor: dark ? 'rgba(255,255,255,.16)' : 'rgba(60,60,67,.14)' }}>
        <Stat icon="heart" color="#ff375f" label="Heart rate" value={last ? String(last.hr) : '–'} unit="bpm" state={hrState} onPress={() => onPage('heart')} />
        <Stat icon="wave" color="#8e6cff" label="HRV" value={last ? String(last.rmssd) : '–'} unit="ms HRV" state={hrvState} onPress={() => onPage('heart')} />
        <Stat icon="moon" color={C.sleep} label="Sleep" value={d.sleepToday ? hm(d.sleepToday.hours) : '–'} unit="sleep" state={sleepState} onPress={() => onPage('sleep')} />
        <Stat icon="lungs" color="#32ade6" label="Breathing" value={br != null ? String(Math.round(br)) : '–'} unit="breaths/min" state={brState} onPress={() => onPage('heart')} />
      </View>

      {/* Top prediction, or an all-clear once there is a score */}
      {top ? (
        <Animated.View entering={FadeIn.duration(250)}>
          <Row testID="prediction-row" icon="alert" iconColor={top.level === 'alert' ? BAD : WARN} title={top.title} sub={top.evidence[0]} fill={fill}
            onPress={() => a.openSheet('insights')} trailing={<Icon name="chevron" size={16} color={ink2.ink3} />} />
        </Animated.View>
      ) : rec.score != null ? (
        <Row icon="spark" iconColor={GOOD} title="No warning signs" sub={d.sleepBoost ? `Sleep ${target} h tonight for about +${d.sleepBoost} tomorrow` : 'Heart, sleep and trends look typical for you'} fill={fill}
          onPress={() => a.openSheet('insights')} trailing={<Icon name="chevron" size={16} color={ink2.ink3} />} />
      ) : null}

      {/* Sleep toggle (evening / while asleep / morning without a log) */}
      {s.sleepStart != null ? (
        <Row testID="sleep-toggle" icon="sun" iconColor={WARN} title="I’m up" sub={`Asleep since ${clock(s.sleepStart)} · ${Math.floor(asleepH)} h ${Math.round((asleepH % 1) * 60)} m`} fill={fill} onPress={a.endSleep}
          trailing={<Pressable onPress={a.cancelSleep} hitSlop={10} accessibilityLabel="Cancel sleep timer"><T size={13} weight="600" tone="ink2">Cancel</T></Pressable>} />
      ) : hour >= 20 || hour < 4 ? (
        <Row testID="sleep-toggle" icon="moon" iconColor={C.sleep} title="Going to bed" sub="Tap now, then “I’m up” when you wake" fill={fill} onPress={a.startSleep} trailing={<Icon name="chevron" size={16} color={ink2.ink3} />} />
      ) : hour < 12 && !d.sleepToday ? (
        <Row testID="sleep-toggle" icon="moon" iconColor={C.sleep} title="Log last night" sub="Bed and wake times, in two drags" fill={fill} onPress={() => a.openSheet('sleep', { sleepDraft: null })} trailing={<Icon name="chevron" size={16} color={ink2.ink3} />} />
      ) : null}

      {/* Next item */}
      {nx ? (
        <Animated.View key={nx.id} entering={FadeIn.duration(250)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C[nx.p] }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={16} weight="600" numberOfLines={1}>{nx.title}</T>
            <T size={12} tone="ink2" tabular>{nx.time} · {left} left today</T>
          </View>
          <PressableScale scaleTo={0.94} onPress={() => a.complete(nx)} style={{ height: 34, paddingHorizontal: 16, borderRadius: 17, backgroundColor: btnBg, justifyContent: 'center' }}>
            <T size={14} weight="600" color={btnFg}>{nx.cta}</T>
          </PressableScale>
        </Animated.View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
          <Icon name="spark" size={16} color={GOOD} />
          <T size={15} weight="600">All set for today</T>
        </View>
      )}
    </Glass>
  );
}
