import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { gridModel, REP_DEFS, reportSections, withWater } from '../state/selectors';
import { useStore } from '../state/store';
import { C, fill, ink } from '../theme';
import { ease } from '../theme/motion';
import { Dot, PressableScale, Switch } from '../ui/controls';
import { Glass } from '../ui/glass/Glass';
import { T } from '../ui/Text';
import { ReportOrb } from '../viz/ReportOrb';

export function Report({ now }: { now: Date }) {
  const { s, a } = useStore();
  const incl = REP_DEFS.filter(([k]) => s.rep[k]).map(([k, name]) => ({ key: k, name, color: C[k] }));
  const g = gridModel(withWater(s.items, s.water), 'all', now);
  const sections = reportSections(s.rep, g.last30);
  const first = incl[0] ?? { key: 'med' as const, color: C.med, name: 'Medication' };
  const curI = Math.min(s.repStep, incl.length - 1), cur = incl[curI] ?? first, allDone = s.repStep >= incl.length;
  const genText = s.repStep < incl.length ? `Reading ${incl[s.repStep].name.toLowerCase()}…` : 'Putting it together…';
  const visit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((9 - now.getDay()) % 7 || 7));
  const visitLabel = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][visit.getDay()]} ${visit.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][visit.getMonth()]}`;

  const btn = s.repPhase === 'ready' ? { label: 'Share report', bg: ink[1], fg: '#fff', disabled: false, go: () => a.openSheet('share') }
    : s.repPhase === 'gen' ? { label: 'Creating…', bg: fill.tertiary, fg: ink[3], disabled: true, go: () => {} }
    : { label: 'Create report', bg: ink[1], fg: '#fff', disabled: incl.length === 0, go: a.createReport };

  return (
    <View>
      <View style={{ paddingTop: 6, paddingHorizontal: 4 }}>
        <T size={13} weight="500" tone="ink2">Dr. Patel · {visitLabel}</T>
        <T size={32} weight="700" track={-0.025} lh={1.15} accessibilityRole="header">Report</T>
      </View>

      {s.repPhase === 'idle' && (
        <Animated.View entering={FadeIn.duration(300)}>
          <Glass radius={26} tint={[0.66, 0.34]} blur={30} border={0.8} style={{ marginTop: 14 }} innerStyle={{ paddingVertical: 22, paddingHorizontal: 18, alignItems: 'center', gap: 14 }}>
            <View style={{ opacity: incl.length ? 1 : 0.25 }}><ReportOrb pillar={first.key} color={first.color} mode="idle" size={88} /></View>
            <View style={{ alignItems: 'center', gap: 2 }}>
              <T size={17} weight="600">Summary for Dr. Patel</T>
              <T size={13} tone="ink2">Last 30 days · {sections.length} sections</T>
            </View>
          </Glass>
        </Animated.View>
      )}

      {s.repPhase === 'gen' && (
        <Animated.View entering={FadeIn.duration(300)}>
          <Glass radius={26} tint={[0.66, 0.34]} blur={30} border={0.8} style={{ marginTop: 14 }} innerStyle={{ paddingTop: 28, paddingHorizontal: 18, paddingBottom: 22, alignItems: 'center', gap: 18 }}>
            <Animated.View key={cur.key + (allDone ? '-d' : '')} entering={ZoomIn.duration(450).easing(ease.springSoft)}>
              <ReportOrb pillar={cur.key} color={cur.color} mode={allDone ? 'done' : 'work'} size={132} />
            </Animated.View>
            <View style={{ alignItems: 'center', gap: 12, width: '100%' }}>
              <T size={15} weight="600">{genText}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
                {incl.map((c, i) => {
                  const d = i < s.repStep, w = i === s.repStep;
                  return (
                    <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 12, backgroundColor: d ? c.color : 'rgba(120,120,128,.12)' }}>
                      <Dot size={7} color={d ? '#fff' : w ? c.color : 'rgba(120,120,128,.4)'} />
                      <T size={12} weight="600" color={d ? '#fff' : w ? ink[1] : ink[3]}>{c.name}</T>
                    </View>
                  );
                })}
              </View>
            </View>
          </Glass>
        </Animated.View>
      )}

      {s.repPhase === 'ready' && (
        <Animated.View entering={FadeInDown.duration(450).easing(ease.springSoft)} style={{ marginTop: 14, borderRadius: 18, backgroundColor: '#fff', padding: 18, gap: 14, boxShadow: '0 12px 32px rgba(0,0,0,.07), 0 0 0 .5px rgba(0,0,0,.05)' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T size={15} weight="700" color={ink[1]}>Alex Morgan</T>
            <T size={12} color={ink[2]}>Last 30 days</T>
          </View>
          {sections.map((sec, si) => (
            <Animated.View key={sec.key} entering={FadeInDown.delay(si * 90 + 120).duration(450).easing(ease.springSoft)} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Dot size={8} color={sec.color} /><T size={13} weight="600" color={ink[1]}>{sec.name}</T></View>
                <T size={13} weight="600" color={ink[1]}>{sec.value}</T>
              </View>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {sec.days.map((bg, i) => <View key={i} style={{ flex: 1, aspectRatio: 1, borderRadius: 2, backgroundColor: bg }} />)}
              </View>
            </Animated.View>
          ))}
          {sections.length === 0 && <T size={13} color={ink[3]}>Turn on at least one section.</T>}
        </Animated.View>
      )}

      <T size={13} tone="ink2" style={{ paddingTop: 22, paddingHorizontal: 16, paddingBottom: 6 }}>Include</T>
      <Glass radius={20} innerStyle={{ overflow: 'hidden', borderRadius: 20 }}>
        {REP_DEFS.map(([k, name], i) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 50 }}>
            <Dot color={C[k]} />
            <T size={16} style={{ flex: 1, paddingVertical: 14, borderBottomWidth: i === 3 ? 0 : 0.5, borderBottomColor: 'rgba(60,60,67,.14)' }}>{name}</T>
            <Switch on={s.rep[k]} onChange={() => a.toggleRep(k)} label={name} />
          </View>
        ))}
      </Glass>
      <PressableScale scaleTo={0.97} disabled={btn.disabled} onPress={btn.go} style={{ marginTop: 18, height: 52, borderRadius: 26, backgroundColor: btn.bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: btn.disabled && s.repPhase === 'idle' ? 0.4 : 1 }}>
        {s.repPhase === 'ready' && (
          <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        )}
        <T size={17} weight="600" color={btn.fg}>{btn.label}</T>
      </PressableScale>
    </View>
  );
}
