import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polyline, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { accent, ink, SVG_FONT } from '../theme';
import { niceTicks, smoothPath } from './chartMath';

export { niceTicks, smoothPath } from './chartMath';

// ── Line chart with optional personal normal band ────────────────────────────
export function TrendChart({ data, color, width, height = 120, band, unit, labels }: { data: number[]; color: string; width: number; height?: number; band?: [number, number]; unit?: string; labels?: [string, string] }) {
  if (data.length < 2 || width <= 0) return <View style={{ height }} />;
  const padL = 30, padR = 8, padT = 10, padB = labels ? 18 : 6;
  const all = band ? [...data, ...band] : data;
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = Math.max(1, (hi - lo) * 0.15); lo = Math.floor(lo - pad); hi = Math.ceil(hi + pad);
  const X = (i: number) => padL + (i / (data.length - 1)) * (width - padL - padR);
  const Y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
  const pts = data.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
  const area = `M ${X(0)} ${height - padB} L ${data.map((v, i) => `${X(i)} ${Y(v)}`).join(' L ')} L ${X(data.length - 1)} ${height - padB} Z`;
  const gid = `g${color.replace('#', '')}`;
  return (
    <Svg width={width} height={height}>
      <Defs><LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={color} stopOpacity={0.22} /><Stop offset="1" stopColor={color} stopOpacity={0} /></LinearGradient></Defs>
      {band && <Rect x={padL} y={Y(band[1])} width={width - padL - padR} height={Math.max(1, Y(band[0]) - Y(band[1]))} rx={4} fill={color} opacity={0.1} />}
      {[lo, (lo + hi) / 2, hi].map(v => (
        <G key={v}>
          <Line x1={padL} x2={width - padR} y1={Y(v)} y2={Y(v)} stroke="rgba(60,60,67,.1)" strokeWidth={0.5} />
          <SvgText fontFamily={SVG_FONT} x={padL - 6} y={Y(v) + 3} fontSize={9} fill={ink[3]} textAnchor="end">{Math.round(v)}</SvgText>
        </G>
      ))}
      <Path d={area} fill={`url(#${gid})`} />
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={X(data.length - 1)} cy={Y(data[data.length - 1])} r={4} fill={color} stroke="#fff" strokeWidth={2} />
      {labels && <>
        <SvgText fontFamily={SVG_FONT} x={padL} y={height - 4} fontSize={9} fill={ink[3]}>{labels[0]}</SvgText>
        <SvgText fontFamily={SVG_FONT} x={width - padR} y={height - 4} fontSize={9} fill={ink[3]} textAnchor="end">{labels[1]}</SvgText>
      </>}
      {unit && <SvgText fontFamily={SVG_FONT} x={padL - 6} y={padT - 2} fontSize={9} fill={ink[3]} textAnchor="end">{unit}</SvgText>}
    </Svg>
  );
}

// ── Clean day chart (HRV / resting HR trends) ────────────────────────────────
export type DayPoint = { date: string; v: number };
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateOf = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const dayLabel = (k: string) => { const d = dateOf(k); return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };

/**
 * One value per day: a smooth line with dots, faint gridlines labelled on the right, weekday initials
 * (or dates) underneath, and an optional shaded "your normal" band. Tap or drag to select a day;
 * `onSelect(null)` when the finger lifts.
 */
export function DayChart({ points, color, width, height = 150, band, selected, onSelect }: {
  points: DayPoint[]; color: string; width: number; height?: number; band?: [number, number] | null;
  selected?: number | null; onSelect?: (i: number | null) => void;
}) {
  if (points.length < 2 || width <= 0) return <View style={{ height }} />;
  const padL = 6, padR = 34, padT = 12, padB = 22;
  const vals = points.map(p => p.v), all = band ? [...vals, ...band] : vals;
  const ticks = niceTicks(Math.min(...all), Math.max(...all));
  const lo = ticks[0], hi = ticks[2];
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const X = (i: number) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const Y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * plotH;
  const xy = points.map((p, i) => ({ x: X(i), y: Y(p.v) }));
  const line = smoothPath(xy);
  const area = `${line} L ${xy[xy.length - 1].x} ${padT + plotH} L ${xy[0].x} ${padT + plotH} Z`;
  const gid = `dc${color.replace('#', '')}`;
  const few = points.length <= 8;
  const labelIdx = few ? points.map((_, i) => i) : [0, Math.round((points.length - 1) / 2), points.length - 1];
  const sel = selected != null && selected >= 0 && selected < points.length ? selected : null;

  const pick = (x: number) => onSelect?.(Math.max(0, Math.min(points.length - 1, Math.round(((x - padL) / plotW) * (points.length - 1)))));
  const pan = Gesture.Pan().minDistance(0).onBegin(e => pick(e.x)).onUpdate(e => pick(e.x)).onFinalize(() => onSelect?.(null)).runOnJS(true);

  const chart = (
    <Svg width={width} height={height}>
      <Defs><LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={color} stopOpacity={0.16} /><Stop offset="1" stopColor={color} stopOpacity={0} /></LinearGradient></Defs>
      {ticks.map(v => (
        <G key={v}>
          <Line x1={padL} x2={padL + plotW} y1={Y(v)} y2={Y(v)} stroke="rgba(60,60,67,.12)" strokeWidth={1} strokeDasharray={v === lo ? undefined : '2 4'} />
          <SvgText fontFamily={SVG_FONT} x={width - 2} y={Y(v) + 3.5} fontSize={10} fill={ink[3]} textAnchor="end">{Math.round(v)}</SvgText>
        </G>
      ))}
      {band && (
        <>
          <Rect x={padL} y={Y(band[1])} width={plotW} height={Math.max(2, Y(band[0]) - Y(band[1]))} rx={6} fill={color} opacity={0.1} />
          <SvgText fontFamily={SVG_FONT} x={padL + 2} y={Y(band[1]) - 5} fontSize={9} fontWeight="600" fill={color} opacity={0.8}>Your normal</SvgText>
        </>
      )}
      <Path d={area} fill={`url(#${gid})`} />
      <Path d={line} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      {sel != null && <Line x1={xy[sel].x} x2={xy[sel].x} y1={padT - 4} y2={padT + plotH} stroke={color} strokeWidth={1} opacity={0.4} />}
      {xy.map((p, i) => {
        const last = i === xy.length - 1, on = sel === i;
        return <Circle key={i} cx={p.x} cy={p.y} r={on ? 5.5 : last && sel == null ? 4.5 : few ? 3 : 0} fill={on || (last && sel == null) ? color : '#fff'} stroke={color} strokeWidth={on || (last && sel == null) ? 2.5 : 1.5} />;
      })}
      {labelIdx.map(i => {
        const d = dateOf(points[i].date), anchor = few ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
        return <SvgText fontFamily={SVG_FONT} key={i} x={X(i)} y={height - 5} fontSize={10} fontWeight={sel === i ? '700' : '400'} fill={sel === i ? color : ink[3]} textAnchor={anchor}>{few ? WD[d.getDay()] : `${d.getDate()} ${MON[d.getMonth()]}`}</SvgText>;
      })}
    </Svg>
  );
  return onSelect ? <GestureDetector gesture={pan}><View collapsable={false}>{chart}</View></GestureDetector> : chart;
}

/** Tiny line for a card (last few mornings). */
export function Sparkline({ data, color, width = 64, height = 22 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const lo = Math.min(...data), hi = Math.max(...data), r = hi - lo || 1;
  const xy = data.map((v, i) => ({ x: 3 + (i / (data.length - 1)) * (width - 6), y: 3 + (1 - (v - lo) / r) * (height - 6) }));
  const e = xy[xy.length - 1];
  return (
    <Svg width={width} height={height}>
      <Path d={smoothPath(xy)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={e.x} cy={e.y} r={2.6} fill={color} />
    </Svg>
  );
}

// ── Live PPG waveform ────────────────────────────────────────────────────────
export function Waveform({ trace, width, height = 44, color = accent.heart }: { trace: number[]; width: number; height?: number; color?: string }) {
  if (trace.length < 2 || width <= 0) return <View style={{ height }} />;
  const pts = trace.map((v, i) => `${(i / (trace.length - 1)) * width},${height - 3 - v * (height - 6)}`).join(' ');
  return <Svg width={width} height={height}><Polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /></Svg>;
}

// ── RR tachogram: beat-to-beat intervals over the session ────────────────────
export function Tachogram({ ibis, width, height = 90, color = '#7c5cff' }: { ibis: number[]; width: number; height?: number; color?: string }) {
  return <TrendChart data={ibis} color={color} width={width} height={height} unit="ms" />;
}

// ── Poincaré plot: RR(n) vs RR(n+1) with the SD1/SD2 ellipse ─────────────────
export function Poincare({ ibis, sd1, sd2, size }: { ibis: number[]; sd1?: number; sd2?: number; size: number }) {
  if (ibis.length < 3) return <View style={{ width: size, height: size }} />;
  const lo = Math.min(...ibis) - 40, hi = Math.max(...ibis) + 40, P = (v: number) => ((v - lo) / (hi - lo)) * (size - 16) + 8;
  const m = ibis.reduce((a, b) => a + b, 0) / ibis.length, k = (size - 16) / (hi - lo);
  return (
    <Svg width={size} height={size}>
      <Rect x={0} y={0} width={size} height={size} rx={12} fill="rgba(120,120,128,.06)" />
      <Line x1={8} y1={size - 8} x2={size - 8} y2={8} stroke="rgba(60,60,67,.18)" strokeWidth={1} strokeDasharray="3 4" />
      {sd1 != null && sd2 != null && isFinite(sd1) && isFinite(sd2) && (
        <Ellipse cx={P(m)} cy={size - P(m)} rx={sd2 * k * 2} ry={sd1 * k * 2} fill="rgba(124,92,255,.12)" stroke="rgba(124,92,255,.5)" strokeWidth={1} transform={`rotate(-45 ${P(m)} ${size - P(m)})`} />
      )}
      {ibis.slice(1).map((v, i) => <Circle key={i} cx={P(ibis[i])} cy={size - P(v)} r={2.6} fill="#7c5cff" opacity={0.75} />)}
    </Svg>
  );
}
