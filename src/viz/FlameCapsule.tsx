import { Blur, Canvas, DisplacementMap, Group, LinearGradient, Paint, Path, Rect, RoundedRect, Skia, Turbulence, useClock, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

const HEART = 'M12 21.4 10.6 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5L12 21.4Z';

/**
 * The heart measurement control: a dark glass capsule whose purple → red → orange liquid rises with
 * measurement progress, with the heart inside it beating at the live rate. Turbulence (one octave)
 * only moves while measuring; at rest the liquid is still, so nothing animates off-screen work.
 */
export function FlameCapsule({ progress, measuring, bpm, width: W = 72, height: H = 120 }: { progress: number; measuring: boolean; bpm: number | null; width?: number; height?: number }) {
  const clock = useClock();
  const lvl = useSharedValue(H - 14);
  useEffect(() => {
    lvl.value = withTiming(H - (measuring ? 14 + progress * (H - 22) : 14), { duration: measuring ? 450 : 500 });
  }, [progress, measuring, lvl, H]);
  const liquid = useDerivedValue(() => [{ translateY: lvl.value }]);
  const fx = useDerivedValue(() => (measuring ? 0.035 + 0.012 * Math.sin(clock.value / 400) : 0.035));
  // Heartbeat: a quick lub-dub scale pulse at the live rate (resting pulse when idle).
  const beatPeriod = 60000 / Math.max(40, Math.min(180, bpm ?? 60));
  const heartT = useDerivedValue(() => {
    const p = (clock.value % beatPeriod) / beatPeriod;
    const k = p < 0.12 ? p / 0.12 : p < 0.24 ? 1 - (p - 0.12) / 0.12 : p < 0.34 ? 0.5 * ((p - 0.24) / 0.1) : p < 0.46 ? 0.5 * (1 - (p - 0.34) / 0.12) : 0;
    const sc = 1 + (bpm != null || measuring ? 0.12 : 0.05) * k;
    const size = W * 0.46;
    return [{ translateX: W / 2 - (size / 2) * sc }, { translateY: H * 0.34 - (size / 2) * sc }, { scale: (size / 24) * sc }];
  });
  const heart = useMemo(() => Skia.Path.MakeFromSVGString(HEART)!, []);
  const clip = useMemo(() => Skia.RRectXY(Skia.XYWHRect(0, 0, W, H), W / 2, W / 2), [W, H]);

  return (
    <Canvas style={{ width: W, height: H }}>
      <Group clip={clip}>
        <Rect x={0} y={0} width={W} height={H} color="#0e0e10" />
        <Group layer={<Paint><Blur blur={1.4} /><DisplacementMap channelX="r" channelY="g" scale={measuring ? 14 : 6}><Turbulence freqX={fx} freqY={0.09} octaves={1} seed={9} /></DisplacementMap></Paint>}>
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
      <Group transform={heartT}>
        <Path path={heart} color="rgba(255,255,255,.95)" />
      </Group>
    </Canvas>
  );
}
