import { View } from 'react-native';
import { useStore } from '../state/store';
import { nextItem, pillarBars, progress, withWater } from '../state/selectors';
import { Bar, Hairline, PressableScale } from '../ui/controls';
import { Glass } from '../ui/glass/Glass';
import { T } from '../ui/Text';

/**
 * "Minimised" home-screen widget: one thin bar per area plus the next item. Mirrors what an
 * Android home-screen widget would show (a real widget needs a native module; see README).
 */
export function MinimisedWidget() {
  const { s, a } = useStore();
  const items = withWater(s.items, s.water);
  const nx = nextItem(items, s.snoozed), { left } = progress(items);
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 16 }}>
      <PressableScale scaleTo={0.97} onPress={a.toggleMinimised} accessibilityLabel="Open Daily">
        <Glass radius={28} tint={[0.66, 0.34]} blur={30} border={0.8} innerStyle={{ padding: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T size={13} weight="600" tone="ink2">Daily</T>
            <T size={13} weight="600" tabular>{left} left</T>
          </View>
          {pillarBars(items).map((b, i) => (
            <View key={b.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <T size={13} weight="500" style={{ width: 62 }}>{b.name}</T>
              <Bar frac={b.frac} color={b.color} delay={i * 60} />
              <T size={12} tone="ink2" tabular style={{ width: 30, textAlign: 'right' }}>{b.label}</T>
            </View>
          ))}
          {nx && (
            <>
              <Hairline style={{ backgroundColor: 'rgba(60,60,67,.18)' }} />
              <T size={13} tone="ink2">Next · <T size={13} weight="700">{nx.title}</T> at {nx.time}</T>
            </>
          )}
        </Glass>
      </PressableScale>
      <T size={12} tone="ink3" center style={{ marginTop: 14 }}>Tap the widget to open</T>
    </View>
  );
}
