import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { gridModel, withWater, WEEKS } from '../state/selectors';
import { useStore } from '../state/store';
import { C, fill, ink, LONG_NAMES, NAMES, PILLARS, type Pillar } from '../theme';
import { ease, SNAP } from '../theme/motion';
import { Bar, Dot, PressableScale, Switch, useCountUp } from '../ui/controls';
import { Breathe, ColorCell } from '../ui/effects';
import { Glass } from '../ui/glass/Glass';
import { T } from '../ui/Text';

const INSIGHTS: [string, string, string, number, string][] = [
  ['sleep-mood', 'Sleep & mood', 'How your nights shape your days', 18, 'Links sleep length and timing with the mood check-ins that follow. It shows which nights help most, and needs about 30 days of data.'],
  ['dose-timing', 'Dose timing', 'How steady your medication times are', 24, 'Measures how much your dose times vary and when doses tend to slip. This is useful to share with your doctor.'],
  ['daily-balance', 'Daily balance', 'All four areas, one gentle score', 11, 'Combines medication, mood, sleep and habits into a single daily score, weighted by what matters most to you.'],
];

export function Progress({ now, visitKey }: { now: Date; visitKey: number }) {
  const { s, a } = useStore();
  const items = withWater(s.items, s.water);
  const f = s.filter;
  const g = gridModel(items, f, now);
  const [sel, setSel] = useState<number | null>(null);
  const [openIns, setOpenIns] = useState<string | null>(null);
  const streak = useCountUp(g.streak, { from: 0, runKey: `${visitKey}-${f}` });
  const pick = (k: 'all' | Pillar) => { a.setFilter(k); setSel(null); };
  const d = sel != null ? g.detail(sel) : null;

  return (
    <View>
      <View style={{ paddingTop: 6, paddingHorizontal: 4 }}>
        <T size={13} weight="500" tone="ink2">Last {WEEKS} weeks</T>
        <T size={32} weight="700" track={-0.025} lh={1.15} accessibilityRole="header">Progress</T>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }} contentContainerStyle={{ gap: 6 }}>
        {(['all', ...PILLARS] as const).map(k => {
          const on = f === k;
          return (
            <PressableScale key={k} onPress={() => pick(k)} accessibilityState={{ selected: on }} style={{ height: 32, paddingHorizontal: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? ink[1] : 'rgba(255,255,255,.6)' }}>
              <Dot size={8} color={k === 'all' ? '#34a853' : C[k]} />
              <T size={14} weight="600" color={on ? '#fff' : ink[1]}>{k === 'all' ? 'All' : NAMES[k]}</T>
            </PressableScale>
          );
        })}
      </ScrollView>

      <Glass radius={26} style={{ marginTop: 14 }} blur={30} border={0.8} innerStyle={{ paddingTop: 18, paddingHorizontal: 16, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <View>
            <T size={40} weight="700" track={-0.03} lh={1} tabular>{streak}</T>
            <T size={13} tone="ink2" style={{ marginTop: 4 }}>days in a row · best {g.best}</T>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <T size={11} weight="500" tone="ink3">This week</T>
            <View style={{ flexDirection: 'row', gap: 5 }}>
              {g.weekDots.map((w, j) => (
                <View key={j} style={{ alignItems: 'center', gap: 3 }}>
                  <WeekDot on={w.on} future={w.future} color={g.base} delay={j * 50} />
                  <T size={9} weight="600" color={w.today ? ink[1] : ink[3]}>{w.l}</T>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 5, marginTop: 20 }}>
          <View style={{ width: 22, gap: 5 }}>
            <View style={{ height: 12 }} />
            {['M', '', 'W', '', 'F', '', 'S'].map((l, i) => <View key={i} style={{ flex: 1, justifyContent: 'center' }}><T size={10} weight="500" tone="ink3">{l}</T></View>)}
          </View>
          {Array.from({ length: WEEKS }, (_, w) => (
            <View key={w} style={{ flex: 1, gap: 5 }}>
              <View style={{ height: 12, overflow: 'visible', zIndex: 1 }}><T size={10} weight="500" tone="ink3" style={{ position: 'absolute', left: 0, top: 0, width: 40 }}>{g.monthLabels[w]}</T></View>
              {g.cells.slice(w * 7, w * 7 + 7).map(c => (
                <GridCell key={c.i} future={c.future} today={c.today} selected={sel === c.i} color={c.future ? 'rgba(0,0,0,0)' : g.shade(c.level)} delay={w * 12}
                  label={g.detail(c.i).label} onPress={() => !c.future && setSel(sel === c.i ? null : c.i)} />
              ))}
            </View>
          ))}
        </View>

        <View style={{ marginTop: 14, minHeight: 48, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: fill.quaternary, flexDirection: 'row', alignItems: 'center' }}>
          {d ? (
            <Animated.View key={sel} entering={FadeIn.duration(300)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%' }}>
              <View style={{ width: 14, height: 14, borderRadius: 5, backgroundColor: d.shade }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T size={13} weight="600">{d.label}</T>
                <T size={12} tone="ink2">{d.text}</T>
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {d.dots.map(x => <Dot key={x.key} size={9} color={x.on ? C[x.key] : 'rgba(120,120,128,.2)'} />)}
              </View>
              <PressableScale scaleTo={0.88} onPress={() => setSel(null)} accessibilityLabel="Close" style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: fill.tertiary, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={10} height={10} viewBox="0 0 24 24"><Path d="M18 6 6 18M6 6l12 12" stroke={ink[2]} strokeWidth={3.5} strokeLinecap="round" /></Svg>
              </PressableScale>
            </Animated.View>
          ) : (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <T size={12} tone="ink3">Tap a day to see how it went</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <T size={12} tone="ink3">Rest</T>
                {[0, 1, 2, 3, 4].map(l => <View key={l} style={{ width: 11, height: 11, borderRadius: 4, backgroundColor: g.shade(l) }} />)}
                <T size={12} tone="ink3">Full</T>
              </View>
            </View>
          )}
        </View>
      </Glass>

      <Glass radius={20} style={{ marginTop: 14 }} innerStyle={{ overflow: 'hidden', borderRadius: 20 }}>
        {PILLARS.map((k, i) => (
          <Pressable key={k} onPress={() => pick(f === k ? 'all' : k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52, backgroundColor: f === k ? 'rgba(120,120,128,.1)' : 'transparent' }}>
            <Dot color={C[k]} />
            <T size={16} style={{ flex: 1, paddingVertical: 15, borderBottomWidth: i === 3 ? 0 : 0.5, borderBottomColor: 'rgba(60,60,67,.14)' }}>{k === 'mind' ? 'Mood check-ins' : LONG_NAMES[k]}</T>
            <Bar key={`${k}-${visitKey}-${f}`} frac={g.pct[k] / 100} color={C[k]} height={5} width={52} />
            <T size={15} weight="600" tabular style={{ width: 40, textAlign: 'right' }}>{g.pct[k]}%</T>
          </Pressable>
        ))}
      </Glass>
      <T size={12} tone="ink3" style={{ paddingTop: 6, paddingHorizontal: 16 }}>Last 30 days · tap a row to filter the grid</T>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 26, paddingHorizontal: 6, paddingBottom: 8 }}>
        <T size={19} weight="700" track={-0.015}>Insights</T>
        <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: fill.tertiary }}><T size={12} weight="600" tone="ink2">In development</T></View>
      </View>
      <View style={{ gap: 10 }}>
        {INSIGHTS.map(([slot, title, sub, n, desc]) => {
          const open = openIns === slot, on = !!s.notify[slot];
          return (
            <Glass key={slot} testID={`analytics-${slot}`} radius={20} innerStyle={{ overflow: 'hidden', borderRadius: 20 }}>
              <Pressable onPress={() => setOpenIns(open ? null : slot)} style={({ pressed }) => ({ gap: 10, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: pressed ? 'rgba(120,120,128,.06)' : 'transparent' })} accessibilityState={{ expanded: open }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: fill.tertiary }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T size={16} weight="600">{title}</T>
                    <T size={13} tone="ink2">{sub}</T>
                  </View>
                  <SideChevron open={open} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: fill.tertiary, overflow: 'hidden' }}>
                    <View style={{ width: `${(n / 30) * 100}%`, height: 4, borderRadius: 2, backgroundColor: '#86868b' }} />
                  </View>
                  <T size={11} tone="ink3" tabular>Learning · {n} of 30 days</T>
                </View>
              </Pressable>
              {open && (
                <Animated.View entering={FadeIn.duration(300)} style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 12 }}>
                  <T size={13} lh={1.45} color={ink.body}>{desc}</T>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 0.5, borderTopColor: 'rgba(60,60,67,.14)' }}>
                    <T size={14} weight="500">Tell me when it’s ready</T>
                    <Switch on={on} onChange={() => a.toggleNotify(slot, title)} label={`Notify when ${title} is ready`} />
                  </View>
                </Animated.View>
              )}
            </Glass>
          );
        })}
        {[{ slot: 'analytics-reserved-1', w1: '55%', w2: '35%' }, { slot: 'analytics-reserved-2', w1: '45%', w2: '28%' }].map(r => (
          <View key={r.slot} testID={r.slot} style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(60,60,67,.22)', borderRadius: 20, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(60,60,67,.22)' }} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ width: r.w1 as `${number}%`, height: 8, borderRadius: 4, backgroundColor: fill.tertiary }} />
              <View style={{ width: r.w2 as `${number}%`, height: 8, borderRadius: 4, backgroundColor: 'rgba(120,120,128,.1)' }} />
            </View>
            <T size={11} tone="ink3">Reserved</T>
          </View>
        ))}
      </View>
    </View>
  );
}

function GridCell({ color, delay, future, today, selected, label, onPress }: { color: string; delay: number; future: boolean; today: boolean; selected: boolean; label: string; onPress: () => void }) {
  const sc = useSharedValue(1);
  useEffect(() => { sc.value = withSpring(selected ? 1.08 : 1, SNAP); }, [selected, sc]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  return (
    <Pressable onPress={onPress} disabled={future} accessibilityLabel={label} onPressIn={() => { if (!future) sc.set(withTiming(0.88, { duration: 90 })); }} onPressOut={() => { sc.set(withSpring(selected ? 1.08 : 1, SNAP)); }}>
      <Animated.View style={[{ aspectRatio: 1 }, a]}>
        <ColorCell color={color} delay={delay} style={{ flex: 1, borderRadius: 6, boxShadow: selected ? '0 0 0 2px #f5f5f7, 0 0 0 4px #1d1d1f' : future ? 'inset 0 0 0 1.5px rgba(120,120,128,.16)' : undefined }} />
        {today && !selected && <Breathe radius={6} />}
      </Animated.View>
    </Pressable>
  );
}

function WeekDot({ on, future, color, delay }: { on: boolean; future: boolean; color: string; delay: number }) {
  const sc = useSharedValue(on ? 1 : 0.85);
  useEffect(() => { const t = setTimeout(() => { sc.value = withTiming(on ? 1 : 0.85, { duration: 240, easing: ease.spring }); }, delay); return () => clearTimeout(t); }, [on, delay, sc]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  return (
    <Animated.View style={a}>
      <ColorCell color={future ? 'rgba(0,0,0,0)' : on ? color : 'rgba(120,120,128,.18)'} delay={delay} style={{ width: 14, height: 14, borderRadius: 7, boxShadow: future ? 'inset 0 0 0 1.5px rgba(120,120,128,.25)' : undefined }} />
    </Animated.View>
  );
}

function SideChevron({ open }: { open: boolean }) {
  const r = useSharedValue(open ? 90 : 0);
  useEffect(() => { r.value = withTiming(open ? 90 : 0, { duration: 200, easing: ease.springSoft }); }, [open, r]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={st}>
      <Svg width={14} height={14} viewBox="0 0 24 24"><Path d="m9 18 6-6-6-6" fill="none" stroke={ink[3]} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
    </Animated.View>
  );
}
