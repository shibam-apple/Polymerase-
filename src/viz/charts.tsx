import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polyline, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { accent, ink, SVG_FONT } from '../theme';
import { smoothPath } from './chartMath';

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
  const padL = 10, padR = 10, padT = 22, padB = 22;
  const vals = points.map(p => p.v), all = band ? [...vals, ...band] : vals;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  // Scale to the data with a little headroom; values are written on the dots, so no axis is needed.
  const span = Math.max(4, Math.max(...all) - Math.min(...all));
  const lo = Math.min(...all) - span * 0.25, hi = Math.max(...all) + span * 0.25;
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
      <Line x1={padL} x2={padL + plotW} y1={padT + plotH} y2={padT + plotH} stroke="rgba(60,60,67,.18)" strokeWidth={1} />
      {!band && (
        <G>
          <Line x1={padL} x2={padL + plotW} y1={Y(avg)} y2={Y(avg)} stroke={ink[2]} strokeWidth={1} strokeDasharray="3 4" opacity={0.6} />
          <SvgText fontFamily={SVG_FONT} x={padL + plotW} y={Y(avg) + 13} fontSize={10} fontWeight="600" fill={ink[2]} textAnchor="end">{`avg ${Math.round(avg)}`}</SvgText>
        </G>
      )}
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
        const focus = on || (last && sel == null);
        return (
          <G key={i}>
            <Circle cx={p.x} cy={p.y} r={focus ? 5 : few ? 3 : 0} fill={focus ? color : '#fff'} stroke={color} strokeWidth={focus ? 2.5 : 1.5} />
            {(few || focus) && <SvgText fontFamily={SVG_FONT} x={p.x} y={!band && p.y > Y(avg) ? p.y + 17 : p.y - 9} fontSize={focus ? 12 : 10} fontWeight={focus ? '700' : '500'} fill={focus ? ink[1] : ink[3]} textAnchor={i === 0 ? 'start' : last ? 'end' : 'middle'}>{Math.round(points[i].v)}</SvgText>}
          </G>
        );
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

// ── Day bars (trends anyone can read) ────────────────────────────────────────
/** A bar with only its top corners rounded, standing on the baseline. */
const barPath = (x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, w / 2, h);
  return `M ${x} ${y + h} V ${y + rr} Q ${x} ${y} ${x + rr} ${y} H ${x + w - rr} Q ${x + w} ${y} ${x + w} ${y + rr} V ${y + h} Z`;
};

/**
 * One bar per day, each labelled with its value, so there is no axis to read. An optional shaded
 * "your normal" band, and a dashed reference line (your average, or a goal) labelled in words.
 * Bars are coloured by `colorFor` (e.g. against your normal); the latest or the tapped bar is full
 * strength and bold, the others softer. Tap or drag to select a day; `onSelect(null)` on release.
 */
export function DayBars({ points, width, height = 150, band, goal, goalLabel, average, color, colorFor, fmt = v => String(Math.round(v)), selected, onSelect }: {
  points: DayPoint[]; width: number; height?: number; band?: [number, number] | null; goal?: number; goalLabel?: string; average?: boolean; color: string;
  colorFor?: (v: number) => string; fmt?: (v: number) => string; selected?: number | null; onSelect?: (i: number | null) => void;
}) {
  if (!points.length || width <= 0) return <View style={{ height }} />;
  const padT = 20, padB = 20, plotW = width, plotH = height - padT - padB;
  const vals = points.map(p => p.v);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const ref = goal ?? (average ? avg : null);
  const top = Math.max(...vals, ...(band ?? []), ...(ref != null ? [ref] : [])) * 1.12 || 1;
  const Y = (v: number) => padT + (1 - v / top) * plotH;
  const slot = plotW / points.length, bw = Math.max(4, Math.min(28, slot * 0.6));
  const few = points.length <= 10;
  const labelIdx = few ? points.map((_, i) => i) : [0, Math.round((points.length - 1) / 2), points.length - 1];
  const focus = selected != null && selected >= 0 && selected < points.length ? selected : points.length - 1;
  const pick = (x: number) => onSelect?.(Math.max(0, Math.min(points.length - 1, Math.floor(x / slot))));
  const pan = Gesture.Pan().minDistance(0).onBegin(e => pick(e.x)).onUpdate(e => pick(e.x)).onFinalize(() => onSelect?.(null)).runOnJS(true);
  const refText = goal != null ? goalLabel ?? `goal ${fmt(goal)}` : `avg ${fmt(avg)}`;
  const chart = (
    <Svg width={width} height={height}>
      {band && <Rect x={0} y={Y(band[1])} width={plotW} height={Math.max(2, Y(band[0]) - Y(band[1]))} fill={color} opacity={0.09} rx={6} />}
      <Line x1={0} x2={plotW} y1={padT + plotH} y2={padT + plotH} stroke="rgba(60,60,67,.18)" strokeWidth={1} />
      {points.map((p, i) => {
        const x = i * slot + (slot - bw) / 2, y = Y(p.v), c = colorFor ? colorFor(p.v) : color, on = i === focus;
        // Value above the bar, unless the reference line runs right there: then just inside the bar top.
        const clash = ref != null && Math.abs(y - 6 - Y(ref)) < 11, inside = clash && padT + plotH - y > 24;
        return (
          <G key={p.date}>
            <Path d={barPath(x, y, bw, Math.max(3, padT + plotH - y), 7)} fill={c} opacity={selected != null && !on ? 0.4 : 1} />
            {few && <SvgText fontFamily={SVG_FONT} x={x + bw / 2} y={inside ? y + 15 : clash ? Y(ref!) - 6 : y - 6} fontSize={on ? 12 : 10} fontWeight={on ? '700' : '600'} fill={inside ? '#fff' : on ? ink[1] : ink[2]} textAnchor="middle">{fmt(p.v)}</SvgText>}
          </G>
        );
      })}
      {ref != null && (
        <G>
          <Line x1={0} x2={plotW} y1={Y(ref)} y2={Y(ref)} stroke={ink[2]} strokeWidth={1} strokeDasharray="3 4" opacity={0.7} />
          <Rect x={plotW - refText.length * 6 - 10} y={Y(ref) - 17} width={refText.length * 6 + 10} height={15} rx={7.5} fill="#fff" opacity={0.92} />
          <SvgText fontFamily={SVG_FONT} x={plotW - 5} y={Y(ref) - 6} fontSize={10} fontWeight="600" fill={ink[2]} textAnchor="end">{refText}</SvgText>
        </G>
      )}
      {labelIdx.map(i => {
        const d = new Date(`${points[i].date}T12:00:00`), x = i * slot + slot / 2;
        return <SvgText fontFamily={SVG_FONT} key={i} x={x} y={height - 4} fontSize={10} fontWeight={i === focus ? '700' : '400'} fill={i === focus ? ink[1] : ink[3]} textAnchor="middle">{few ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()] : `${d.getDate()}/${d.getMonth() + 1}`}</SvgText>;
      })}
    </Svg>
  );
  return onSelect ? <GestureDetector gesture={pan}><View collapsable={false}>{chart}</View></GestureDetector> : chart;
}

// ── Pulse during a measurement, in bpm, with its peak and low ────────────────
export function PulseLine({ ibis, width, height = 90, color = accent.heart }: { ibis: number[]; width: number; height?: number; color?: string }) {
  if (ibis.length < 3 || width <= 0) return <View style={{ height }} />;
  // Smooth over 3 beats so the line reads as heart rate, not beat-timing noise.
  const bpm = ibis.map(ms => 60000 / ms).map((v, i, a) => (a[i - 1] ?? v) * 0.25 + v * 0.5 + (a[i + 1] ?? v) * 0.25);
  const lo = Math.min(...bpm), hi = Math.max(...bpm), padT = 18, padB = 18;
  const Y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * (height - padT - padB);
  const xy = bpm.map((v, i) => ({ x: 4 + (i / (bpm.length - 1)) * (width - 8), y: Y(v) }));
  const iHi = bpm.indexOf(hi), iLo = bpm.indexOf(lo);
  const tag = (i: number, label: string, above: boolean) => {
    const p = xy[i], anchor = p.x < 40 ? 'start' : p.x > width - 40 ? 'end' : 'middle';
    return <SvgText fontFamily={SVG_FONT} x={p.x} y={above ? p.y - 7 : p.y + 15} fontSize={10} fontWeight="600" fill={ink[2]} textAnchor={anchor}>{label}</SvgText>;
  };
  return (
    <Svg width={width} height={height}>
      <Path d={smoothPath(xy)} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Circle cx={xy[iHi].x} cy={xy[iHi].y} r={3.5} fill={color} />
      <Circle cx={xy[iLo].x} cy={xy[iLo].y} r={3.5} fill="#fff" stroke={color} strokeWidth={2} />
      {tag(iHi, `PEAK ${Math.round(hi)}`, true)}
      {tag(iLo, `LOW ${Math.round(lo)}`, false)}
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

// ── Hypnogram: estimated sleep stages across the night ───────────────────────
const STAGE_ROW = { wake: 0, rem: 1, light: 2, deep: 3 } as const;
export const STAGE_COLOR = { wake: '#ff9f0a', rem: '#5ac8fa', light: '#6e6af0', deep: '#3a2fa8' } as const;
export function Hypnogram({ stages, start, width, height = 120 }: { stages: string[]; start: number; width: number; height?: number }) {
  if (stages.length < 2 || width <= 0) return <View style={{ height }} />;
  const padL = 44, padB = 18, rowH = (height - padB) / 4, W = width - padL, n = stages.length, dx = W / n;
  const runs: { s: string; a: number; b: number }[] = [];
  stages.forEach((s, i) => { const r = runs[runs.length - 1]; if (r && r.s === s) r.b = i + 1; else runs.push({ s, a: i, b: i + 1 }); });
  const clock = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  return (
    <Svg width={width} height={height}>
      {(['wake', 'rem', 'light', 'deep'] as const).map(k => (
        <G key={k}>
          <Line x1={padL} x2={width} y1={STAGE_ROW[k] * rowH + rowH / 2} y2={STAGE_ROW[k] * rowH + rowH / 2} stroke="rgba(60,60,67,.08)" strokeWidth={1} />
          <SvgText fontFamily={SVG_FONT} x={0} y={STAGE_ROW[k] * rowH + rowH / 2 + 4} fontSize={11} fontWeight="600" fill={STAGE_COLOR[k]}>{k === 'rem' ? 'REM' : k[0].toUpperCase() + k.slice(1)}</SvgText>
        </G>
      ))}
      {runs.filter(r => r.s !== 'out').map((r, i) => {
        const k = r.s as keyof typeof STAGE_ROW;
        return <Rect key={i} x={padL + r.a * dx} y={STAGE_ROW[k] * rowH + 3} width={Math.max(1.5, (r.b - r.a) * dx)} height={rowH - 6} rx={3} fill={STAGE_COLOR[k]} />;
      })}
      {(() => {
        // Whole-hour ticks (every 2 h on long nights), plus the start and end times.
        const first = Math.ceil(start / 3600000) * 3600000, end = start + n * 30000, every = n > 600 ? 2 : 1, out = [];
        for (let t = first, k = 0; t < end - 1800000; t += 3600000, k++) {
          if (k % every || t - start < 1800000) continue;
          const x = padL + ((t - start) / 30000) * dx;
          out.push(<G key={t}><Line x1={x} x2={x} y1={0} y2={height - padB} stroke="rgba(60,60,67,.08)" strokeWidth={1} /><SvgText fontFamily={SVG_FONT} x={x} y={height - 4} fontSize={10} fill={ink[3]} textAnchor="middle">{clock(t).slice(0, 2)}</SvgText></G>);
        }
        return out;
      })()}
      <SvgText fontFamily={SVG_FONT} x={padL} y={height - 4} fontSize={10} fontWeight="600" fill={ink[2]}>{clock(start)}</SvgText>
      <SvgText fontFamily={SVG_FONT} x={width} y={height - 4} fontSize={10} fontWeight="600" fill={ink[2]} textAnchor="end">{clock(start + n * 30000)}</SvgText>
    </Svg>
  );
}
