import { Blur, Canvas, Circle, Group, LinearGradient, Oval, Points, RadialGradient, Rect, useClock, vec, type SkPoint } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import { rand } from '../state/selectors';
import { mix, skyAt } from '../theme';

type Props = { width: number; height: number; hour: number };

/** Ease-in-out sine loop between 0 and 1 over `period` ms (CSS `ease-in-out infinite` 0%→50%→100%). */
function loop(t: number, period: number) {
  'worklet';
  return 0.5 - 0.5 * Math.cos(((t % period) / period) * 2 * Math.PI);
}

/**
 * Day → night wallpaper for Today, after the PS5 home screen: the sky gradient follows the real
 * clock, the sun and moon arc across, stars twinkle after dusk, and soft ribbons of colour drift.
 */
export const WallpaperLayer = memo(function WallpaperLayer({ width: W, height: H, hour: hr }: Props) {
  const clock = useClock();
  const [top, mid, bot] = skyAt(hr);
  const dayT = (hr - 6) / 13, sunUp = dayT > -0.02 && dayT < 1.02;
  const el = sunUp ? Math.sin(Math.PI * Math.max(0, Math.min(1, dayT))) : 0;
  const night = sunUp ? Math.max(0, Math.min(1, 1 - el * 4)) : 1;
  const mT = ((hr - 19.5 + 24) % 24) / 10, moonUp = mT >= 0 && mT <= 1, mEl = moonUp ? Math.sin(Math.PI * mT) : 0;
  const sunC = mix('#ff8a4c', '#fff6dc', Math.min(1, el * 1.6));

  const stars = useMemo(() => {
    const small: SkPoint[] = [], big: SkPoint[] = [];
    for (let i = 0; i < 46; i++) (rand(i, 3) > 0.85 ? big : small).push(vec(Math.round(rand(i, 91) * 420 * (W / 390)), Math.round(rand(i, 17) * 460)));
    return { small, big };
  }, [W]);

  const twinkle = useDerivedValue(() => night * 0.95 * (1 - 0.6 * loop(clock.value, 4000)));
  const ribbon1 = useDerivedValue(() => {
    const p = loop(clock.value, 22000);
    return [{ translateX: -36 * p }, { translateY: 24 * p }, { rotate: ((-14 + 8 * p) * Math.PI) / 180 }, { scale: 1 + 0.08 * p }];
  });
  const ribbon2 = useDerivedValue(() => {
    const p = loop(clock.value, 26000);
    return [{ translateX: 30 * p }, { translateY: -20 * p }, { rotate: ((18 - 8 * p) * Math.PI) / 180 }];
  });
  const sweepW = W * 1.6;
  const sweep = useDerivedValue(() => {
    const p = (clock.value % 14000) / 14000, e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return [{ translateX: sweepW * (-0.6 + 1.2 * e) }, { rotate: (-24 * Math.PI) / 180 }];
  });
  const sweepOp = useDerivedValue(() => {
    const p = (clock.value % 14000) / 14000;
    return p < 0.3 ? (p / 0.3) * 0.5 : p > 0.7 ? ((1 - p) / 0.3) * 0.5 : 0.5;
  });

  const sx = W * ((8 + 84 * dayT) / 100), sy = H * ((62 - 50 * el) / 100);
  const mx = W * ((10 + 80 * mT) / 100), my = H * ((58 - 42 * mEl) / 100);

  return (
    <Group>
      <Rect x={0} y={0} width={W} height={H}>
        <LinearGradient start={vec(0, 0)} end={vec(0, H)} colors={[top, mid, bot]} positions={[0, 0.55, 1]} />
      </Rect>

      <Group opacity={twinkle}>
        <Points points={stars.small} mode="points" color="rgba(255,255,255,.8)" strokeWidth={2} strokeCap="round" />
        <Points points={stars.big} mode="points" color="#ffffff" strokeWidth={3.5} strokeCap="round" />
      </Group>

      {sunUp && (
        <Group>
          <Circle cx={sx} cy={sy} r={170}>
            <RadialGradient c={vec(sx, sy)} r={170} colors={[sunC + 'aa', sunC + '33', sunC + '00']} positions={[0, 0.35, 0.7]} />
          </Circle>
          <Circle cx={sx} cy={sy} r={34} color={sunC}><Blur blur={18} /></Circle>
          <Circle cx={sx} cy={sy} r={34}>
            <RadialGradient c={vec(sx - 7, sy - 8)} r={40} colors={['#fffdf4', sunC]} />
          </Circle>
        </Group>
      )}
      {moonUp && (
        <Group>
          <Circle cx={mx} cy={my} r={110}>
            <RadialGradient c={vec(mx, my)} r={110} colors={['rgba(220,225,255,.28)', 'rgba(220,225,255,0)']} positions={[0, 0.7]} />
          </Circle>
          <Circle cx={mx} cy={my} r={22} color="rgba(220,225,255,.5)"><Blur blur={12} /></Circle>
          <Circle cx={mx} cy={my} r={22}>
            <RadialGradient c={vec(mx - 5, my - 6)} r={26} colors={['#fbfaf3', '#cfd3e6']} />
          </Circle>
        </Group>
      )}

      <Group transform={ribbon1} origin={vec(-120 + 260, H * 0.3 + 110)} blendMode="screen" opacity={0.55}>
        <Oval x={-120} y={H * 0.3} width={520} height={220}>
          <LinearGradient start={vec(-120, 0)} end={vec(400, 0)} colors={[mid, bot]} />
          <Blur blur={60} />
        </Oval>
      </Group>
      <Group transform={ribbon2} origin={vec(W + 140 - 230, H * 0.48 + 90)} blendMode="screen" opacity={0.45}>
        <Oval x={W + 140 - 460} y={H * 0.48} width={460} height={180}>
          <LinearGradient start={vec(W - 320, 0)} end={vec(W + 140, 0)} colors={[bot, top]} />
          <Blur blur={60} />
        </Oval>
      </Group>

      <Group transform={sweep} origin={vec(W / 2, H * 0.38 + 30)} opacity={sweepOp}>
        <Rect x={-0.3 * W} y={H * 0.38} width={sweepW} height={60}>
          <LinearGradient start={vec(-0.3 * W, 0)} end={vec(1.3 * W, 0)} colors={['rgba(255,255,255,0)', 'rgba(255,255,255,.55)', 'rgba(255,255,255,0)']} />
          <Blur blur={18} />
        </Rect>
      </Group>

      <Oval x={-0.3 * W} y={H * (1 + 0.18 - 0.42)} width={1.6 * W} height={H * 0.42} opacity={0.55}>
        <LinearGradient start={vec(0, H * 0.76)} end={vec(0, H * 1.18)} colors={[mix(bot, top, 0.35), mix(top, '#000000', 0.35)]} />
        <Blur blur={8} />
      </Oval>
      <Oval x={-0.1 * W} y={H * (1 + 0.26 - 0.38)} width={1.6 * W} height={H * 0.38} opacity={0.6}>
        <LinearGradient start={vec(0, H * 0.88)} end={vec(0, H * 1.26)} colors={[mix(mid, top, 0.5), mix(top, '#000000', 0.5)]} />
        <Blur blur={6} />
      </Oval>
      <Rect x={0} y={0} width={W} height={H}>
        <LinearGradient start={vec(0, 0)} end={vec(0, H)} colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,.08)']} positions={[0, 0.6, 1]} />
      </Rect>
    </Group>
  );
});

export function Wallpaper(p: Props) {
  return (
    <Canvas style={{ position: 'absolute', left: 0, top: 0, width: p.width, height: p.height }} pointerEvents="none">
      <WallpaperLayer {...p} />
    </Canvas>
  );
}
