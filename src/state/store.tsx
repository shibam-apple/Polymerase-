import * as Haptics from 'expo-haptics';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { MOODS, VMETA, type Pillar, type VitalKey } from '../theme';
import { seedState } from './seed';
import { fmtVital, REP_DEFS } from './selectors';
import type { HeartEntry, Item, SheetKind, State, Tab } from './types';

type Action =
  | { type: 'patch'; patch: Partial<State> }
  | { type: 'setDone'; ids: number[]; done: boolean }
  | { type: 'moodSaved'; id: number | null; label: string }
  | { type: 'vitalSaved'; key: VitalKey; v: number[] }
  | { type: 'heartSaved'; entry: HeartEntry };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'patch':
      return { ...s, ...a.patch };
    case 'setDone':
      return { ...s, pop: a.ids[0] ?? null, items: s.items.map(i => (a.ids.includes(i.id) && !i.auto ? { ...i, done: a.done } : i)) };
    case 'moodSaved':
      return { ...s, sheet: null, pop: a.id, items: s.items.map(i => (i.id === a.id ? { ...i, done: true, detail: a.label } : i)) };
    case 'vitalSaved': {
      const cur = s.vitals[a.key];
      return { ...s, vitals: { ...s.vitals, [a.key]: { ...cur, v: [...a.v], hist: [...cur.hist.slice(1), a.v[0]], when: 'Just now' } } };
    }
    case 'heartSaved': {
      const rhr = s.vitals.rhr;
      return {
        ...s, hrv: a.entry.rmssd, heartLog: [...s.heartLog, a.entry],
        vitals: { ...s.vitals, rhr: { ...rhr, v: [a.entry.hr], hist: [...rhr.hist.slice(1), a.entry.hr], when: 'Just now' } },
      };
    }
  }
}

const tap = (kind: 'light' | 'success' = 'light') => {
  if (Platform.OS === 'web') return;
  if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

function useActions(s: State, dispatch: (a: Action) => void) {
  const timers = useRef<{ toast?: ReturnType<typeof setTimeout>; pop?: ReturnType<typeof setTimeout>; gen: ReturnType<typeof setTimeout>[] }>({ gen: [] });
  // Actions read the newest state; refreshed after every commit, before any event can fire.
  const latest = useRef(s);
  useLayoutEffect(() => { latest.current = s; });
  useEffect(() => () => { clearTimeout(timers.current.toast); clearTimeout(timers.current.pop); timers.current.gen.forEach(clearTimeout); }, []);

  return useMemo(() => {
    const patch = (p: Partial<State>) => dispatch({ type: 'patch', patch: p });
    const toast = (text: string, undo?: number[] | null) => {
      clearTimeout(timers.current.toast);
      patch({ toast: { text, undo: undo ?? null, key: Date.now() } });
      timers.current.toast = setTimeout(() => patch({ toast: null }), 3000);
    };
    const setDone = (ids: number[], done: boolean, msg?: string) => {
      dispatch({ type: 'setDone', ids, done });
      clearTimeout(timers.current.pop);
      timers.current.pop = setTimeout(() => patch({ pop: null }), 420);
      if (done) tap();
      if (done && msg) toast(msg, ids);
    };
    const clearGen = () => { timers.current.gen.forEach(clearTimeout); timers.current.gen = []; };

    const a = {
      patch, toast, setDone,
      setTab: (tab: Tab) => { if (tab !== latest.current.tab) tap(); patch({ tab }); },
      toggleMinimised: () => patch({ minimised: !latest.current.minimised, sheet: null }),
      openHeart: (open: boolean) => patch({ heartOpen: open }),
      openSheet: (sheet: SheetKind, extra: Partial<State> = {}) => patch({ sheet, ...extra }),
      closeSheet: () => patch({ sheet: null }),
      /** Tap on a row's check circle / hero button / swipe release. Mood items open the check-in instead. */
      complete: (it: Item) => {
        if (it.auto) return;
        if (!it.done && it.p === 'mind') { patch({ sheet: 'mood', moodFor: it.id }); return; }
        setDone([it.id], !it.done, `${it.title} logged`);
      },
      addWater: (fromSheet = false) => {
        const w = Math.min(12, latest.current.water + 1);
        patch({ water: w, pop: 6, ...(fromSheet ? { sheet: null } : {}) });
        if (w >= 8 && !latest.current.items.find(i => i.id === 6)?.done) setDone([6], true, 'Water goal reached');
        else toast(`Water · ${w} of 8`);
      },
      snooze: (it: Item) => { patch({ sheet: null, snoozed: [...latest.current.snoozed, it.id] }); toast(`${it.title} · reminder in 30 min`); },
      saveMood: (mood: number) => {
        const st = latest.current, firstMind = st.items.find(i => i.p === 'mind' && !i.done);
        const id = st.moodFor ?? firstMind?.id ?? null, label = MOODS[mood - 1].label;
        dispatch({ type: 'moodSaved', id, label });
        tap('success');
        toast(`Mood · ${label}`, id != null ? [id] : null);
      },
      openVital: (k: VitalKey) => {
        if (k === 'rhr') { toast('Hold the capsule to measure'); return; }
        patch({ sheet: 'vital', vitalKey: k });
      },
      saveVital: (k: VitalKey, v: number[]) => { dispatch({ type: 'vitalSaved', key: k, v }); patch({ sheet: null }); tap('success'); toast(`${VMETA[k].name} · ${fmtVital(k, v)} saved`); },
      saveHeart: (e: HeartEntry) => { dispatch({ type: 'heartSaved', entry: e }); tap('success'); toast(`Saved · ${e.hr} bpm · HRV ${e.rmssd} ms`); },
      undo: () => {
        const ids = latest.current.toast?.undo;
        if (ids) dispatch({ type: 'setDone', ids, done: false });
        patch({ toast: null });
      },
      setFilter: (filter: State['filter']) => patch({ filter }),
      toggleNotify: (slot: string, title: string) => {
        const on = !latest.current.notify[slot];
        patch({ notify: { ...latest.current.notify, [slot]: on } });
        if (on) toast(`We’ll tell you when ${title} is ready`);
      },
      toggleRep: (k: Pillar) => { clearGen(); patch({ rep: { ...latest.current.rep, [k]: !latest.current.rep[k] }, repPhase: 'idle', repStep: 0 }); },
      createReport: () => {
        const n = REP_DEFS.filter(([k]) => latest.current.rep[k]).length;
        clearGen();
        patch({ repPhase: 'gen', repStep: 0 });
        for (let i = 1; i <= n; i++) timers.current.gen.push(setTimeout(() => { patch({ repStep: i }); tap(); }, 1150 * i));
        timers.current.gen.push(setTimeout(() => { patch({ repPhase: 'ready' }); tap('success'); }, 1150 * n + 750));
      },
    };
    return a;
  }, [dispatch]);
}

type Store = { s: State; a: ReturnType<typeof useActions> };
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, dispatch] = useReducer(reducer, undefined, () => seedState());
  const a = useActions(s, dispatch);
  const value = useMemo(() => ({ s, a }), [s, a]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
