import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polyline, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { accent, ink } from '../theme';

// ── Heart-rate gauge (design: tachometer, 40–140 bpm, red zone ≥ 120) ─────────
const GX = 110, GY = 100, GR = 84, A0 = -120, A1 = 120, LO = 40, HI = 140;
const ang = (v: number) => A0 + ((Math.max(LO, Math.min(HI, v)) - LO) / (HI - LO)) * (A1 - A0);
const pt = (a: number, rr: number): [number, number] => { const t = ((a - 90) * Math.PI) / 180; return [GX + rr * Math.cos(t), GY + rr * Math.sin(t)]; };

const TICKS = (() => {
  const out: { x1: number; y1: number; x2: number; y2: number; major: boolean; red: boolean; v: number; tx: number; ty: number }[] = [];
  for (let v = LO; v <= HI; v += 2.5) {
    const a = ang(v), major = v % 20 === 0, [x1, y1] = pt(a, GR), [x2, y2] = pt(a, GR - (major ? 12 : 6)), [tx, ty] = pt(a, GR - 24);
    out.push({ x1, y1, x2, y2, major, red: v >= 120, v, tx, ty });
  }
  return out;
})();

export function HeartGauge({ bpm, measuring }: { bpm: number; measuring: boolean }) {
  const na = ang(bpm);
  const rot = useSharedValue(na);
  useEffect(() => {
    rot.value = measuring ? withTiming(na, { duration: 120 }) : withSpring(na, { damping: 9, stiffness: 90 });
  }, [na, measuring, rot]);
  const needle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const [sx, sy] = pt(A0, GR + 6), [ex, ey] = pt(A1, GR + 6), [nx, ny] = pt(na, GR + 6);
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width: 220, height: 170 }} pointerEvents="none">
      <Svg width={220} height={170} viewBox="0 0 220 170">
        <Path d={`M ${sx} ${sy} A ${GR + 6} ${GR + 6} 0 1 1 ${ex} ${ey}`} fill="none" stroke="rgba(120,120,128,.14)" strokeWidth={3} strokeLinecap="round" />
        <Path d={`M ${sx} ${sy} A ${GR + 6} ${GR + 6} 0 ${na - A0 > 180 ? 1 : 0} 1 ${nx} ${ny}`} fill="none" stroke={accent.heart} strokeWidth={3} strokeLinecap="round" />
        {TICKS.map(t => (
          <G key={t.v}>
            <Line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.red ? accent.heart : t.major ? ink[1] : 'rgba(29,29,31,.35)'} strokeWidth={t.major ? 2 : 1.2} strokeLinecap="round" />
            {t.major && <SvgText x={t.tx} y={t.ty + 3.5} textAnchor="middle" fontSize={9} fontWeight="600" fill={t.red ? accent.heart : 'rgba(29,29,31,.55)'}>{t.v}</SvgText>}
          </G>
        ))}
        <Circle cx={GX} cy={GY} r={5} fill="#fff" stroke={ink[1]} strokeWidth={2} />
      </Svg>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 220, height: 170, transformOrigin: `${GX}px ${GY}px` }, needle]}>
        <Svg width={220} height={170}><Line x1={GX} y1={GY + 12} x2={GX} y2={GY - GR + 16} stroke={accent.heart} strokeWidth={2.2} strokeLinecap="round" /></Svg>
      </Animated.View>
    </View>
  );
}

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
          <SvgText x={padL - 6} y={Y(v) + 3} fontSize={9} fill={ink[3]} textAnchor="end">{Math.round(v)}</SvgText>
        </G>
      ))}
      <Path d={area} fill={`url(#${gid})`} />
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={X(data.length - 1)} cy={Y(data[data.length - 1])} r={4} fill={color} stroke="#fff" strokeWidth={2} />
      {labels && <>
        <SvgText x={padL} y={height - 4} fontSize={9} fill={ink[3]}>{labels[0]}</SvgText>
        <SvgText x={width - padR} y={height - 4} fontSize={9} fill={ink[3]} textAnchor="end">{labels[1]}</SvgText>
      </>}
      {unit && <SvgText x={padL - 6} y={padT - 2} fontSize={9} fill={ink[3]} textAnchor="end">{unit}</SvgText>}
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
