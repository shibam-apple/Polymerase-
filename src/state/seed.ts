import type { State } from './types';

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Starting state. The daily schedule is the design's example routine; everything measured (heart,
 * sleep, vitals, profile) starts empty and is only ever filled by the user or the camera.
 */
export function seedState(now = Date.now()): State {
  return {
    tab: 'today',
    minimised: false,
    page: null,
    water: 0,
    snoozed: [],
    swiped: false,
    pop: null,
    sheet: null,
    itemId: null,
    moodFor: null,
    vitalKey: 'weight',
    toast: null,
    filter: 'all',
    notify: {},
    rep: { med: true, mind: true, sleep: true, habit: false },
    repPhase: 'idle',
    repStep: 0,
    day: dayKey(new Date(now)),
    vitals: {
      rhr: { v: [], hist: [], when: 'Not measured yet', auto: true },
      bp: { v: [], hist: [], when: 'Not logged yet' },
      weight: { v: [], hist: [], when: 'Not logged yet' },
    },
    heartLog: [],
    sleepLog: [],
    profile: { age: null, sex: null, heightCm: null, sleepTargetH: 8 },
    sleepStart: null,
    sonarRun: null,
    sonarNights: [],
    sonarBusy: null,
    sleepMethod: 'timer',
    bpLog: [],
    sleepDraft: null,
    items: seedItems(),
  };
}

export function seedItems(): State['items'] {
  return [
    { id: 1, part: 0, time: '07:30', p: 'sleep', title: 'Sleep', detail: 'Tap to log last night', done: false },
    { id: 2, part: 0, time: '08:00', p: 'med', title: 'Levothyroxine', detail: '50 µg', done: false },
    { id: 3, part: 0, time: '08:30', p: 'med', title: 'Vitamin D', detail: '1 tablet', done: false },
    { id: 4, part: 0, time: '08:45', p: 'mind', title: 'Mood', detail: 'Check in', done: false },
    { id: 5, part: 1, time: '12:30', p: 'med', title: 'Omega-3', detail: 'With lunch', done: false },
    { id: 6, part: 1, time: '13:00', p: 'habit', title: 'Water', detail: '', done: false },
    { id: 7, part: 1, time: '13:30', p: 'habit', title: 'Meditate', detail: '10 min', done: false },
    { id: 8, part: 1, time: '14:00', p: 'mind', title: 'Mood', detail: 'Check in', done: false },
    { id: 9, part: 2, time: '19:00', p: 'med', title: 'Magnesium', detail: 'With dinner', done: false },
    { id: 10, part: 2, time: '21:00', p: 'mind', title: 'Mood', detail: 'Check in', done: false },
    { id: 11, part: 2, time: '21:30', p: 'habit', title: 'Screens off', detail: '1 h before bed', done: false },
    { id: 12, part: 2, time: '22:30', p: 'sleep', title: 'Wind down', detail: 'Aim for your sleep target', done: false },
  ];
}
