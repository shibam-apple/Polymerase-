import type { HeartEntry, State } from './types';

/** Demo schedule and history from the design. Replace with persisted user data. */
export function seedState(now = Date.now()): State {
  return {
    tab: 'today',
    minimised: false,
    heartOpen: false,
    water: 4,
    snoozed: [],
    swiped: false,
    pop: null,
    sheet: null,
    itemId: null,
    moodFor: null,
    vitalKey: 'weight',
    toast: null,
    hrv: 48,
    filter: 'all',
    notify: {},
    rep: { med: true, mind: true, sleep: true, habit: false },
    repPhase: 'idle',
    repStep: 0,
    vitals: {
      rhr: { v: [58], hist: [61, 60, 59, 60, 58, 58], when: 'From Watch · this morning', auto: true },
      bp: { v: [122, 79], hist: [126, 124, 125, 121, 123, 122], when: 'Yesterday' },
      weight: { v: [72.8], hist: [73.6, 73.4, 73.1, 73.2, 72.9, 72.8], when: '3 days ago' },
    },
    heartLog: seedHeartLog(now),
    items: [
      { id: 1, part: 0, time: '07:30', p: 'sleep', title: 'Sleep', detail: '7 h 12 m', done: true, auto: true },
      { id: 2, part: 0, time: '08:00', p: 'med', title: 'Levothyroxine', detail: '50 µg', done: true },
      { id: 3, part: 0, time: '08:30', p: 'med', title: 'Vitamin D', detail: '1 tablet', done: true },
      { id: 4, part: 0, time: '08:45', p: 'mind', title: 'Mood', detail: 'Good', done: true },
      { id: 5, part: 1, time: '12:30', p: 'med', title: 'Omega-3', detail: 'With lunch', done: false },
      { id: 6, part: 1, time: '13:00', p: 'habit', title: 'Water', detail: '', done: false },
      { id: 7, part: 1, time: '13:30', p: 'habit', title: 'Meditate', detail: '10 min', done: false },
      { id: 8, part: 1, time: '14:00', p: 'mind', title: 'Mood', detail: 'Check in', done: false },
      { id: 9, part: 2, time: '19:00', p: 'med', title: 'Magnesium', detail: 'With dinner', done: false },
      { id: 10, part: 2, time: '21:00', p: 'mind', title: 'Mood', detail: 'Check in', done: false },
      { id: 11, part: 2, time: '21:30', p: 'habit', title: 'Screens off', detail: '1 h before bed', done: false },
      { id: 12, part: 2, time: '22:30', p: 'sleep', title: 'Wind down', detail: 'Aim for 7½ h', done: false },
    ],
  };
}

/** 30 days of plausible morning readings (demo only), deterministic so charts are stable. */
export function seedHeartLog(now: number): HeartEntry[] {
  const day = 86_400_000, out: HeartEntry[] = [];
  for (let d = 29; d >= 1; d--) {
    const r = (s: number) => { const x = Math.sin(d * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
    const dip = d >= 9 && d <= 11 ? 1 : 0; // a short run of poorer recovery, so trends have something to show
    out.push({ at: now - d * day + 7 * 3_600_000, hr: Math.round(57 + r(1) * 5 + dip * 5), rmssd: Math.round(44 + r(2) * 14 - dip * 14) });
  }
  const today = new Date(now);
  today.setHours(7, 0, 0, 0);
  out.push({ at: today.getTime(), hr: 58, rmssd: 48 });
  return out;
}
