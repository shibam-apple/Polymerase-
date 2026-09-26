import { useEffect } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { C, ink, SVG_FONT } from '../theme';

import { DAY, minToPoint, pointToMin, toHHMM, toMin } from './sleepDialMath';

export { toHHMM, toMin } from './sleepDialMath';

const Moon = ({ x, y, c }: { x: number; y: number; c: string }) => (
  <Path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" fill={c} transform={`translate(${x - 8} ${y - 8}) scale(${16 / 24})`} />
);
const Sun = ({ x, y, c }: { x: number; y: number; c: string }) => (
  <G transform={`translate(${x - 8} ${y - 8}) scale(${16 / 24})`}>
    <Circle cx={12} cy={12} r={4.5} fill={c} />
    <Path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" stroke={c} strokeWidth={2.2} strokeLinecap="round" />
  </G>
);

/**
 * 24 h sleep dial, after Apple Health's sleep schedule: drag the moon (bedtime) or the sun (wake-up),
 * or drag the arc to move the whole night. Snaps to 5 minutes with a light tick.
 */
export function SleepDial({ bed, wake, onChange, size = 280, color = C.sleep }: { bed: string; wake: string; onChange: (bed: string, wake: string) => void; size?: number; color?: string }) {
  const cx = size / 2, cy = size / 2, stroke = 34, r = size / 2 - stroke / 2 - 2;
  const b = toMin(bed), w = toMin(wake);
  const span = (w - b + DAY) % DAY || DAY;
  const pb = minToPoint(b, cx, cy, r), pw = minToPoint(w, cx, cy, r);
  const arc = `M ${pb.x} ${pb.y} A ${r} ${r} 0 ${span > DAY / 2 ? 1 : 0} 1 ${pw.x} ${pw.y}`;

  // Gesture scratch state lives in shared values (mutable from gesture callbacks; these run on JS here).
  type Drag = { mode: 'bed' | 'wake' | 'both'; grab: number; b: number; w: number };
  const drag = useSharedValue<Drag | null>(null);
  const cur = useSharedValue({ b, w });
  useEffect(() => { cur.value = { b, w }; }, [cur, b, w]);
  const sent = useSharedValue('');
  const emit = (nb: number, nw: number) => {
    const key = `${nb}-${nw}`;
    if (key === sent.value || (nb === cur.value.b && nw === cur.value.w)) return;
    sent.value = key;
    Haptics.selectionAsync().catch(() => {});
    onChange(toHHMM(nb), toHHMM(nw));
  };
  const pan = Gesture.Pan().minDistance(0)
    .onBegin(e => {
      const { b: cb, w: cw } = cur.value;
      const hb = minToPoint(cb, cx, cy, r), hw = minToPoint(cw, cx, cy, r);
      const db = Math.hypot(e.x - hb.x, e.y - hb.y), dw = Math.hypot(e.x - hw.x, e.y - hw.y);
      const m = pointToMin(e.x, e.y, cx, cy, 1);
      const onArc = Math.abs(Math.hypot(e.x - cx, e.y - cy) - r) < stroke && (m - cb + DAY) % DAY < (cw - cb + DAY) % DAY;
      const mode = Math.min(db, dw) < 34 ? (db <= dw ? 'bed' : 'wake') : onArc ? 'both' : null;
      drag.value = mode ? { mode, grab: m, b: cb, w: cw } : null;
    })
    .onUpdate(e => {
      const d = drag.value;
      if (!d) return;
      const m = pointToMin(e.x, e.y, cx, cy);
      if (d.mode === 'bed') emit(m, cur.value.w);
      else if (d.mode === 'wake') emit(cur.value.b, m);
      else {
        const delta = Math.round((pointToMin(e.x, e.y, cx, cy, 1) - d.grab) / 5) * 5;
        emit((d.b + delta + DAY) % DAY, (d.w + delta + DAY) % DAY);
      }
    })
    .onFinalize(() => { drag.value = null; })
    .runOnJS(true);

  const hours = span / 60;
  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} style={{ width: size, height: size }} accessible accessibilityLabel={`Sleep from ${bed} to ${wake}`}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={r} stroke="rgba(120,120,128,.12)" strokeWidth={stroke} fill="none" />
          {Array.from({ length: 48 }, (_, i) => {
            const major = i % 12 === 0, hour = i % 2 === 0;
            const o = minToPoint(i * 30, cx, cy, r - stroke / 2 - 6), n = minToPoint(i * 30, cx, cy, r - stroke / 2 - (major ? 10 : hour ? 9 : 8));
            return <Line key={i} x1={o.x} y1={o.y} x2={n.x} y2={n.y} stroke={major ? ink[2] : 'rgba(60,60,67,.25)'} strokeWidth={major ? 1.6 : 1} strokeLinecap="round" />;
          })}
          {[[0, '12AM'], [360, '6AM'], [720, '12PM'], [1080, '6PM']].map(([m, l]) => {
            const p = minToPoint(m as number, cx, cy, r - stroke / 2 - 31);
            return <SvgText fontFamily={SVG_FONT} key={l} x={p.x} y={p.y + 4} fontSize={10} fontWeight="600" fill={ink[3]} textAnchor="middle">{l}</SvgText>;
          })}
          <Path d={arc} stroke={color} strokeWidth={stroke - 6} strokeLinecap="round" fill="none" opacity={0.9} />
          <Circle cx={pb.x} cy={pb.y} r={stroke / 2 - 4} fill="#fff" />
          <Moon x={pb.x} y={pb.y} c={color} />
          <Circle cx={pw.x} cy={pw.y} r={stroke / 2 - 4} fill="#fff" />
          <Sun x={pw.x} y={pw.y} c="#ff9f0a" />
          <SvgText fontFamily={SVG_FONT} x={cx} y={cy + 9} fontSize={26} fontWeight="700" fill={ink[1]} textAnchor="middle">{`${Math.floor(hours)}h ${String(Math.round((hours % 1) * 60)).padStart(2, '0')}m`}</SvgText>
        </Svg>
      </View>
    </GestureDetector>
  );
}

export const SleepIcon = { Moon, Sun };
