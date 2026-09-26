import { C, fill, MOODS, NAMES, PILLARS, tint, type Pillar, type VitalKey } from '../theme';
import type { Item, State } from './types';

// Pure ports of the design's `renderVals` computations. No React, no side effects.

export const rand = (i: number, s: number) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };

/** Historical 0–4 completion level for grid day `i` (demo history, deterministic). */
export function level(i: number, key: 'all' | Pillar): number {
  const seed = { all: 1, med: 2, mind: 3, sleep: 4, habit: 5 }[key];
  const v = rand(i, seed) * 0.75 + (i / 140) * 0.35 + (key === 'med' ? 0.25 : 0);
  return v > 0.95 ? 4 : v > 0.75 ? 3 : v > 0.5 ? 2 : v > 0.28 ? 1 : 0;
}

export const withWater = (items: Item[], water: number) => items.map(i => (i.id === 6 ? { ...i, detail: `${water} of 8 glasses` } : i));

export function progress(items: Item[]) {
  const total = items.length, done = items.filter(i => i.done).length;
  return { total, done, left: total - done, frac: total ? done / total : 0 };
}

export function nextItem(items: Item[], snoozed: number[]) {
  const nx = items.find(i => !i.done && !snoozed.includes(i.id)) ?? items.find(i => !i.done);
  return nx ? { ...nx, cta: ctaFor(nx) } : null;
}
export const ctaFor = (i: Item) => (i.p === 'med' ? 'Taken' : i.p === 'mind' ? 'Check in' : 'Done');

export function pillarBars(items: Item[]) {
  return PILLARS.map(k => {
    const its = items.filter(i => i.p === k), d = its.filter(i => i.done).length;
    return { key: k, name: NAMES[k], color: C[k], frac: its.length ? d / its.length : 0, label: `${d}/${its.length}` };
  });
}

export function parts(items: Item[]) {
  return (['Morning', 'Midday', 'Evening'] as const).map((label, p) => {
    const its = items.filter(i => i.part === p), d = its.filter(i => i.done).length;
    const due = its.filter(i => !i.done && !i.auto && i.p !== 'mind');
    return { label, index: p, items: its, count: its.length, doneCount: d, allDone: d === its.length, summary: d === its.length ? 'Done' : `${d}/${its.length}`, due, canLogAll: p === 1 && due.length > 1 };
  });
}

// ── Readiness ────────────────────────────────────────────────────────────────
export const READY_MAX: Record<Pillar, number> = { sleep: 30, mind: 25, med: 25, habit: 20 };

export function readiness(items: Item[]) {
  const dueBy = (k: Pillar) => items.filter(i => i.p === k && i.part <= 1 && !i.auto);
  const medDue = dueBy('med'), habDue = dueBy('habit');
  const medDone = medDue.filter(i => i.done).length, habDone = habDue.filter(i => i.done).length;
  const moodDone = items.filter(i => i.p === 'mind' && i.done).pop();
  const moodIdx = moodDone ? Math.max(0, MOODS.findIndex(x => x.label === moodDone.detail)) : 3;
  const M = READY_MAX;
  const pts: Record<Pillar, number> = {
    sleep: Math.round(M.sleep * Math.min(1, 7.2 / 7.5)),
    mind: Math.round((M.mind * (moodIdx + 1)) / 5),
    med: Math.round((M.med * medDone) / Math.max(1, medDue.length)),
    habit: Math.round((M.habit * habDone) / Math.max(1, habDue.length)),
  };
  const score = pts.sleep + pts.mind + pts.med + pts.habit;
  const color = score >= 80 ? '#34a853' : score >= 60 ? '#ff9f0a' : '#ff6b5a';
  const label = score >= 80 ? 'Ready for a full day' : score >= 60 ? 'Take it steady' : 'Go easy today';
  const sub = score >= 80 ? 'Sleep, mood and routine are all on track.' : 'Good sleep. Your midday routine is still open.';
  const gain = (k: Pillar) => (k === 'med' ? Math.round(M.med / Math.max(1, medDue.length)) : k === 'habit' ? Math.round(M.habit / Math.max(1, habDue.length)) : k === 'mind' ? M.mind : M.sleep);
  const lift = items
    .filter(i => !i.done && i.part <= 1 && (i.p === 'med' || i.p === 'habit'))
    .map(i => ({ item: i, gain: gain(i.p) }))
    .sort((a, b) => b.gain - a.gain)[0] ?? null;
  const values: Record<Pillar, string> = { sleep: '7 h 12 m', mind: MOODS[moodIdx].label, med: `${medDone} of ${medDue.length}`, habit: `${habDone} of ${habDue.length}` };
  const notes: Record<Pillar, string> = {
    sleep: '7 h 12 m last night, close to your 7½ h goal. Nights over 7 h tend to lift your mood the next day.',
    mind: 'Based on your latest check-in. Checking in twice a day gives a steadier read.',
    med: `${medDone} of ${medDue.length} doses due so far are logged. Taking them on time counts most.`,
    habit: `${habDone} of ${habDue.length} habits due so far are done. Small ones like water add up quickly.`,
  };
  return { pts, score, color, label, sub, lift, moodIdx, values, notes, gain };
}

// ── Vitals ───────────────────────────────────────────────────────────────────
export const fmtVital = (k: VitalKey, v: number[]) => (k === 'bp' ? `${v[0]}/${v[1]}` : k === 'weight' ? v[0].toFixed(1) : String(v[0]));

export function vitalNote(k: VitalKey, draft: number[], last: number[]) {
  if (k === 'bp') {
    const s = draft[0], d = draft[1] ?? 0;
    if (s < 120 && d < 80) return { note: 'Normal range', color: '#3ec46d' };
    if (s < 130 && d < 80) return { note: 'Slightly raised', color: '#ffb340' };
    return { note: 'Raised · worth mentioning', color: '#ff6b5a' };
  }
  const df = Math.round((draft[0] - last[0]) * 10) / 10;
  return { note: df === 0 ? 'Same as last time' : `${df > 0 ? '+' : '−'}${Math.abs(df).toFixed(1)} kg since last`, color: df === 0 ? '#8e8e93' : df < 0 ? '#3ec46d' : '#ffb340' };
}

export function vitalFields(k: VitalKey, last: number[]): { label: string; min: number; max: number; step: number }[] {
  return k === 'bp'
    ? [{ label: 'Systolic', min: 90, max: 170, step: 1 }, { label: 'Diastolic', min: 50, max: 110, step: 1 }]
    : [{ label: 'Weight', min: Math.floor(last[0] - 5), max: Math.ceil(last[0] + 5), step: 0.1 }];
}

// ── Progress grid (GitHub-style, 15 weeks × 7 days, Monday first) ────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const FRIENDLY = ['A rest day. That’s okay.', 'A light day', 'Halfway there', 'A good day', 'Everything done. Nice.'];
export const WEEKS = 15;

export function gridModel(items: Item[], filter: 'all' | Pillar, today = new Date()) {
  const dow = (today.getDay() + 6) % 7; // Mon = 0
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow - (WEEKS - 1) * 7);
  const todayIdx = (WEEKS - 1) * 7 + dow;
  const { frac } = progress(items);
  const todayLv = Math.round(frac * 4);
  const lv = (i: number) => (i === todayIdx ? todayLv : level(i, filter));
  const base = filter === 'all' ? '#34a853' : C[filter];
  const shade = (l: number) => (l <= 0 ? fill.tertiary : tint(base, [0, 30, 55, 80, 100][l]));
  const dateOf = (i: number) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
  const label = (i: number) => { const d = dateOf(i); return i === todayIdx ? 'Today' : `${DAYS[i % 7]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };

  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => ({ i, future: i > todayIdx, level: i > todayIdx ? -1 : lv(i), today: i === todayIdx }));
  const monthLabels = Array.from({ length: WEEKS }, (_, w) => { const d = dateOf(w * 7), p = dateOf(w * 7 - 7); return w === 0 || p.getMonth() !== d.getMonth() ? MONTHS[d.getMonth()] : ''; });
  let streak = 0;
  for (let i = todayIdx - 1; i >= 0 && lv(i) >= 1; i--) streak++;
  let best = 0, run = 0;
  for (let i = 0; i < todayIdx; i++) { run = lv(i) >= 1 ? run + 1 : 0; best = Math.max(best, run); }
  const weekDots = Array.from({ length: 7 }, (_, j) => { const i = (WEEKS - 1) * 7 + j, fut = i > todayIdx, l = fut ? 0 : lv(i); return { l: 'MTWTFSS'[j], today: i === todayIdx, future: fut, on: !fut && l >= 1 }; });
  const last30 = Array.from({ length: 30 }, (_, k) => todayIdx - 29 + k);
  const pctOf = (key: Pillar) => Math.round((last30.reduce((a, i) => a + (i === todayIdx ? todayLv : level(i, key)), 0) / 120) * 100);
  const todayPillar = (k: Pillar) => { const its = items.filter(x => x.p === k); return its.filter(x => x.done).length / its.length >= 0.5; };
  const detail = (i: number) => {
    const l = lv(i);
    return { label: label(i), text: FRIENDLY[l], shade: shade(l), dots: PILLARS.map(k => ({ key: k, on: i === todayIdx ? todayPillar(k) : level(i, k) >= 2 })) };
  };
  return { cells, monthLabels, streak, best, weekDots, base, shade, todayIdx, pct: Object.fromEntries(PILLARS.map(k => [k, pctOf(k)])) as Record<Pillar, number>, detail, last30 };
}

/** 14-day kept/missed history for one item, for the item sheet. */
export function itemHistory(item: Item, todayIdx: number) {
  return Array.from({ length: 14 }, (_, k) => { const i = todayIdx - 13 + k; return i === todayIdx ? item.done : level(i, item.p) >= 2; });
}

// ── Report ───────────────────────────────────────────────────────────────────
export const REP_DEFS: [Pillar, string, string][] = [['med', 'Medication', '96% taken'], ['mind', 'Mood', 'Mostly good'], ['sleep', 'Sleep', '7 h average'], ['habit', 'Habits', '81% kept']];

export function reportSections(rep: State['rep'], last30: number[]) {
  return REP_DEFS.filter(([k]) => rep[k]).map(([k, name, value]) => ({
    key: k, name, value, color: C[k],
    days: last30.map(i => { const l = level(i, k); return l === 0 ? fill.tertiary : tint(C[k], [0, 30, 55, 80, 100][l], '#ffffff'); }),
  }));
}
