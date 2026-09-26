import { Blur, Canvas, Circle, ColorMatrix, Group, Mask, Paint, Path, Rect, Skia, useClock } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { Easing, useDerivedValue, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import type { Pillar } from '../theme';

export type OrbMode = 'idle' | 'work' | 'done';

type Cut = { a: number; dx?: number; slide?: 1 | -1 };
/** Per-area cut patterns from the design: tilting line, spinning X, sliding bars, turning grid. */
const PAT: Record<Pillar, { cuts: Cut[] }> = {
  med: { cuts: [{ a: 80 }] },
  mind: { cuts: [{ a: 45 }, { a: -45 }] },
  sleep: { cuts: [{ a: 0, dx: -12, slide: 1 }, { a: 0, dx: 12, slide: -1 }] },
  habit: { cuts: [{ a: 0, dx: -15 }, { a: 0, dx: 15 }, { a: 90, dx: -15 }, { a: 90, dx: 15 }] },
};

function bez(t: number) {
  'worklet';
  // cubic-bezier(.6,0,.3,1) approximated by smootherstep: slow start, quick middle, soft landing.
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function sine(t: number, period: number) {
  'worklet';
  return 0.5 - 0.5 * Math.cos(((t % period) / period) * 2 * Math.PI);
}
/** Pattern rotation (degrees) for the whole cut group at time t (ms). */
function patternDeg(k: Pillar, t: number) {
  'worklet';
  if (k === 'med') return -16 + 36 * sine(t, 2200);
  if (k === 'mind') { const p = (t % 1600) / 1600; return p < 0.2 ? 0 : p > 0.7 ? 90 : 90 * bez((p - 0.2) / 0.5); }
  if (k === 'habit') {
    const p = (t % 3200) / 3200;
    if (p < 0.25) return 0;
    if (p < 0.5) return 45 * bez((p - 0.25) / 0.25);
    if (p < 0.75) return 45;
    return 45 + 45 * bez((p - 0.75) / 0.25);
  }
  return 0;
}

/**
 * "Sliced circle" report ball: a coloured disc with soft-edged gaps moving through it, made
 * gooey by blur + alpha threshold. `work` animates the pattern and breathes; `done` closes the
 * gaps, pops, and draws a check.
 */
export function ReportOrb({ pillar, color, mode, size }: { pillar: Pillar; color: string; mode: OrbMode; size: number }) {
  const clock = useClock();
  const close = useSharedValue(mode === 'done' ? 1 : 0);
  const pop = useSharedValue(1);
  const check = useSharedValue(mode === 'done' ? 1 : 0);
  useEffect(() => {
    if (mode === 'done') {
      close.value = withTiming(1, { duration: 550, easing: Easing.bezier(0.3, 1.2, 0.4, 1) });
      pop.value = withSequence(withTiming(0.9, { duration: 1 }), withSpring(1, { damping: 6, stiffness: 180 }));
      check.value = 0;
      check.value = withDelay(350, withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) }));
    } else { close.value = 0; check.value = 0; }
  }, [mode, close, pop, check]);

  const work = mode === 'work';
  const s = size / 100;
  const groupT = useDerivedValue(() => [{ rotate: ((work ? patternDeg(pillar, clock.value) : 0) * Math.PI) / 180 }]);
  const breathe = useDerivedValue(() => {
    const b = work ? 1 - 0.06 * sine(clock.value, 1800) : 1;
    return [{ scale: b * pop.value }];
  });
  const cutW = useDerivedValue(() => 6 * (1 - close.value));
  const slides = useDerivedValue(() => (work ? 9 * sine(clock.value, 2000) : 0));
  const checkPath = useMemo(() => Skia.Path.MakeFromSVGString('M33 51 L45 63 L68 38')!, []);

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group transform={[{ scale: s }]}>
      <Group transform={breathe} origin={{ x: 50, y: 50 }}>
        <Group layer={<Paint><Blur blur={3.2} /><ColorMatrix matrix={[1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 20, -9]} /></Paint>}>
          <Mask
            mode="luminance"
            mask={
              <Group>
                <Rect x={0} y={0} width={100} height={100} color="white" />
                <Group transform={groupT} origin={{ x: 50, y: 50 }}>
                  {PAT[pillar].cuts.map((c, i) => <CutBar key={i} cut={c} width={cutW} slide={slides} />)}
                </Group>
              </Group>
            }
          >
            <Circle cx={50} cy={50} r={44} color={color} />
          </Mask>
        </Group>
        {mode === 'done' && <Path path={checkPath} style="stroke" strokeWidth={8} strokeCap="round" strokeJoin="round" color="#fff" end={check} />}
      </Group>
      </Group>
    </Canvas>
  );
}

function CutBar({ cut, width, slide }: { cut: Cut; width: { value: number }; slide: { value: number } }) {
  const x = useDerivedValue(() => 50 + (cut.dx ?? 0) + (cut.slide ? cut.slide * slide.value : 0) - width.value / 2);
  const w = useDerivedValue(() => width.value);
  return (
    <Group transform={[{ rotate: (cut.a * Math.PI) / 180 }]} origin={{ x: 50, y: 50 }}>
      <Rect x={x} y={-10} width={w} height={120} color="black" />
    </Group>
  );
}
