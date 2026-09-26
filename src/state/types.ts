import type { Pillar, VitalKey } from '../theme';

export type Item = {
  id: number;
  /** 0 morning, 1 midday, 2 evening */
  part: 0 | 1 | 2;
  time: string;
  p: Pillar;
  title: string;
  detail: string;
  done: boolean;
  /** Filled in automatically (e.g. sleep from a watch); cannot be toggled. */
  auto?: boolean;
};

export type Vital = { v: number[]; hist: number[]; when: string; auto?: boolean };

export type HeartEntry = { at: number; hr: number; rmssd: number };

export type Tab = 'today' | 'progress' | 'details' | 'report';
export type SheetKind = null | 'quick' | 'mood' | 'vital' | 'item' | 'share';
export type Toast = { text: string; undo?: number[] | null; key: number } | null;
export type RepPhase = 'idle' | 'gen' | 'ready';

export type State = {
  tab: Tab;
  minimised: boolean;
  heartOpen: boolean;
  items: Item[];
  water: number;
  snoozed: number[];
  swiped: boolean;
  pop: number | null;
  sheet: SheetKind;
  itemId: number | null;
  moodFor: number | null;
  vitalKey: Exclude<VitalKey, 'rhr'>;
  toast: Toast;
  vitals: Record<VitalKey, Vital>;
  hrv: number;
  heartLog: HeartEntry[];
  filter: 'all' | Pillar;
  notify: Record<string, boolean>;
  rep: Record<Pillar, boolean>;
  repPhase: RepPhase;
  repStep: number;
};
