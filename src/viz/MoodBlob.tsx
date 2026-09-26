import { Canvas, Group, Path, RadialGradient, Shadow, Skia, vec } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { interpolateColor, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { MOODS } from '../theme';
import { ease } from '../theme/motion';

/** Radius multipliers around the blob (8 control points) per mood: lumpy when low, round at "Okay", lively when great. */
const SHAPES = [
  [0.86, 1.08, 0.95, 1.1, 0.88, 1.04, 0.92, 1.06],
  [0.94, 1.04, 0.98, 1.05, 0.95, 1.02, 0.97, 1.04],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1.03, 0.97, 1.02, 0.96, 1.04, 0.98, 1.02, 0.97],
  [1.08, 0.9, 1.06, 0.92, 1.1, 0.9, 1.07, 0.93],
];
const S = 170, R = 65;

/** The mood check-in orb: morphs shape, colour, size and tilt as the slider moves. */
export function MoodBlob({ mood }: { mood: number }) {
  const t = useSharedValue(mood - 1);
  useEffect(() => { t.value = withTiming(mood - 1, { duration: 320, easing: ease.springSoft }); }, [mood, t]);
  const path = useDerivedValue(() => {
    const i = Math.max(0, Math.min(3.999, t.value)), a = Math.floor(i), f = i - a;
    const m = SHAPES[a].map((v, k) => v + (SHAPES[Math.min(4, a + 1)][k] - v) * f);
    const scale = MOODS[a].scale + (MOODS[Math.min(4, a + 1)].scale - MOODS[a].scale) * f;
    const rot = ((MOODS[a].rot + (MOODS[Math.min(4, a + 1)].rot - MOODS[a].rot) * f) * Math.PI) / 180;
    const pts = m.map((mm, k) => { const th = (k / 8) * 2 * Math.PI + rot; return [S / 2 + Math.cos(th) * R * mm * scale, S / 2 + Math.sin(th) * R * mm * scale]; });
    const p = Skia.Path.Make();
    // Closed Catmull-Rom → cubic Bézier for a smooth organic outline.
    const n = pts.length;
    p.moveTo(pts[0][0], pts[0][1]);
    for (let k = 0; k < n; k++) {
      const p0 = pts[(k - 1 + n) % n], p1 = pts[k], p2 = pts[(k + 1) % n], p3 = pts[(k + 2) % n];
      p.cubicTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    p.close();
    return p;
  });
  const c1 = useDerivedValue(() => interpolateColor(t.value, [0, 1, 2, 3, 4], MOODS.map(x => x.c1)));
  const c2 = useDerivedValue(() => interpolateColor(t.value, [0, 1, 2, 3, 4], MOODS.map(x => x.c2)));
  const colors = useDerivedValue(() => [c1.value, c2.value]);
  const glow = useDerivedValue(() => interpolateColor(t.value, [0, 1, 2, 3, 4], MOODS.map(x => x.c2 + '55')));
  return (
    <Canvas style={{ width: S, height: S }}>
      <Group>
        <Path path={path}>
          <RadialGradient c={vec(S * 0.4, S * 0.36)} r={R * 1.4} colors={colors} />
          <Shadow dx={0} dy={20} blur={25} color={glow} />
        </Path>
      </Group>
    </Canvas>
  );
}
