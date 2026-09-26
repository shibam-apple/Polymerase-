import { Platform } from 'react-native';

/** SVG text on web falls back to a serif face; give it the system sans like the rest of the UI. */
export const SVG_FONT = Platform.OS === 'web' ? '-apple-system, system-ui, Roboto, "Segoe UI", sans-serif' : undefined;

export type Pillar = 'med' | 'mind' | 'sleep' | 'habit';
export const PILLARS: Pillar[] = ['med', 'mind', 'sleep', 'habit'];

/** Pillar colours and names, verbatim from the design. */
export const C: Record<Pillar, string> = { med: '#40b4d0', mind: '#a66be0', sleep: '#6e6af0', habit: '#ff9f0a' };
export const NAMES: Record<Pillar, string> = { med: 'Meds', mind: 'Mind', sleep: 'Sleep', habit: 'Habits' };
export const LONG_NAMES: Record<Pillar, string> = { med: 'Medication', mind: 'Mood', sleep: 'Sleep', habit: 'Habits' };

export const ink = { 1: '#1d1d1f', 2: '#6e6e73', 3: '#86868b', body: '#3a3a3c' } as const;
export const hairline = 'rgba(60,60,67,.14)';
export const fill = { quaternary: 'rgba(120,120,128,.08)', tertiary: 'rgba(120,120,128,.14)', secondary: 'rgba(120,120,128,.2)' };
export const accent = { tab: '#fa2d48', green: '#34c759', greenDeep: '#34a853', heart: '#ff375f', hrv: '#5b3fd6', hrvBg: 'rgba(124,92,255,.12)' };

export type Ink = { ink: string; ink2: string; ink3: string };
export const DAY_INK: Ink = { ink: '#1d1d1f', ink2: 'rgba(29,29,31,.66)', ink3: 'rgba(29,29,31,.52)' };
export const NIGHT_INK: Ink = { ink: '#ffffff', ink2: 'rgba(255,255,255,.74)', ink3: 'rgba(255,255,255,.58)' };

export const MOODS = [
  { label: 'Low', c1: '#9d9bf5', c2: '#4b3fc4', scale: 0.82, rot: -20, text: '#4b3fc4' },
  { label: 'Not great', c1: '#9ccbf5', c2: '#3a78d6', scale: 0.88, rot: -8, text: '#3a78d6' },
  { label: 'Okay', c1: '#e0ecee', c2: '#40b4d0', scale: 0.94, rot: 0, text: '#1f7f93' },
  { label: 'Good', c1: '#cff3cc', c2: '#3ec46d', scale: 1, rot: 10, text: '#23803f' },
  { label: 'Great', c1: '#ffe4ad', c2: '#ff8a00', scale: 1.08, rot: 24, text: '#b85a00' },
] as const;

export type VitalKey = 'rhr' | 'bp' | 'weight';
export const VMETA: Record<VitalKey, { name: string; unit: string; color: string }> = {
  rhr: { name: 'Resting heart rate', unit: 'bpm', color: '#ff6b5a' },
  bp: { name: 'Blood pressure', unit: 'mmHg', color: '#e0569b' },
  weight: { name: 'Weight', unit: 'kg', color: '#8e8e93' },
};

/** Typography scale used by the design (system font, tight tracking on large sizes). */
export const type = {
  largeTitle: { fontSize: 32, fontWeight: '700', letterSpacing: -0.8, lineHeight: 37 },
  title2: { fontSize: 24, fontWeight: '700', letterSpacing: -0.6, lineHeight: 28 },
  title3: { fontSize: 21, fontWeight: '700', letterSpacing: -0.42 },
  section: { fontSize: 19, fontWeight: '700', letterSpacing: -0.28 },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 16 },
  callout: { fontSize: 15 },
  subhead: { fontSize: 14 },
  footnote: { fontSize: 13 },
  caption: { fontSize: 12 },
  caption2: { fontSize: 11 },
} as const;

export const tabular = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] };

// ── colour helpers ───────────────────────────────────────────────────────────
const hex = (x: string) => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
export function mix(a: string, b: string, t: number): string {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
/** CSS `color-mix(in srgb, base p%, bg)`, used for the grid's shades. */
export const tint = (base: string, pct: number, bg = '#f5f5f7') => mix(bg, base, pct / 100);
export const alpha = (h: string, a: number) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };

/** Sky keyframes (hour, top, middle, bottom), verbatim from the design. */
export const SKY: [number, string, string, string][] = [
  [0, '#060a1c', '#141a3d', '#2a2358'], [4.5, '#0b1230', '#1f2553', '#3d2f66'], [6, '#2d3a78', '#b27aa0', '#ffb38a'],
  [7.5, '#5d8fd6', '#a9c4ec', '#ffe0bd'], [12, '#4aa3ea', '#9fd0f5', '#e8f5fd'], [16.5, '#5b8fd8', '#b6c8ea', '#ffe2b8'],
  [18.5, '#3d4f9e', '#d08aa4', '#ffae7a'], [20, '#1e2766', '#5a3f86', '#e0788a'], [21.5, '#0c1436', '#241f55', '#4a3070'],
  [24, '#060a1c', '#141a3d', '#2a2358'],
];
export function skyAt(hr: number): [string, string, string] {
  let i = 0;
  while (i < SKY.length - 2 && hr >= SKY[i + 1][0]) i++;
  const a = SKY[i], b = SKY[i + 1], t = Math.max(0, Math.min(1, (hr - a[0]) / (b[0] - a[0]))), e = t * t * (3 - 2 * t);
  return [mix(a[1], b[1], e), mix(a[2], b[2], e), mix(a[3], b[3], e)];
}
export const isNight = (hr: number) => hr < 6.4 || hr >= 18.6;
