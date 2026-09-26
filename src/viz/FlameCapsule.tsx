import { Blur, Canvas, DisplacementMap, Group, LinearGradient, Paint, Path, Rect, RoundedRect, Skia, Turbulence, useClock, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

const W = 52, H = 86;

/**
 * "Flame in a glass" capsule: a dark glass pill whose purple → red → orange liquid rises with
 * measurement progress; turbulence displacement makes the surface move like a flame.
 */
export function FlameCapsule({ progress, measuring }: { progress: number; measuring: boolean }) {
  const clock = useClock();
  const lvl = useSharedValue(H - 12);
  useEffect(() => {
    lvl.value = withTiming(H - (measuring ? 10 + progress * (H - 18) : 12), { duration: measuring ? 500 : 800 });
  }, [progress, measuring, lvl]);
  const liquid = useDerivedValue(() => [{ translateY: lvl.value }]);
  const period = measuring ? 1600 : 5000;
  const fx = useDerivedValue(() => 0.035 + 0.015 * (0.5 - 0.5 * Math.cos(((clock.value % period) / period) * 2 * Math.PI)));
  const fy = useDerivedValue(() => 0.09 + 0.05 * (0.5 - 0.5 * Math.cos(((clock.value % period) / period) * 2 * Math.PI)));
  const heart = useMemo(() => Skia.Path.MakeFromSVGString('M26 50.5 24.9 49.5C20.9 46 18.3 43.6 18.3 40.6 18.3 38.2 20.2 36.3 22.6 36.3c1.3 0 2.6.6 3.4 1.6.8-1 2.1-1.6 3.4-1.6 2.4 0 4.3 1.9 4.3 4.3 0 3-2.6 5.4-6.6 8.9Z')!, []);
  const clip = useMemo(() => Skia.RRectXY(Skia.XYWHRect(0, 0, W, H), W / 2, W / 2), []);

  return (
    <Canvas style={{ width: W, height: H }}>
      <Group clip={clip}>
        <Rect x={0} y={0} width={W} height={H} color="#0e0e10" />
        <Group layer={<Paint><Blur blur={1.6} /><DisplacementMap channelX="r" channelY="g" scale={measuring ? 18 : 8}><Turbulence freqX={fx} freqY={fy} octaves={2} seed={9} /></DisplacementMap></Paint>}>
          <Group transform={liquid}>
            <Rect x={-10} y={0} width={W + 20} height={H + 20}>
              <LinearGradient start={vec(0, 0)} end={vec(0, H)} colors={['#7c5cff', '#ff375f', '#ff8a3d']} positions={[0, 0.45, 1]} />
            </Rect>
            <Rect x={-10} y={-3} width={W + 20} height={8} color="rgba(255,255,255,.25)" />
          </Group>
        </Group>
        <Rect x={0} y={0} width={W * 0.45} height={H} color="rgba(255,255,255,.06)" />
      </Group>
      <RoundedRect x={0.75} y={0.75} width={W - 1.5} height={H - 1.5} r={W / 2 - 0.75} style="stroke" strokeWidth={1.5} color="rgba(255,255,255,.3)" />
      <Path path={heart} color="rgba(255,255,255,.92)" />
    </Canvas>
  );
}
