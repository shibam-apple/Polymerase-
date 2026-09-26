import type { Profile } from '../health/healthAge';
import type { StoredNight } from '../sleep/sonarNight';
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

/** One saved camera measurement (real data only). */
export type HeartEntry = { at: number; hr: number; rmssd: number; score?: number; respRate?: number | null; source?: 'camera' | 'simulated' };

/** A night of sleep, keyed by the date you woke up (YYYY-MM-DD). */
export type SleepEntry = { date: string; bed: string; wake: string; hours: number; quality: number };

export type Tab = 'today' | 'progress' | 'details' | 'report';
export type Page = 'heart' | 'sleep' | null;
export type SheetKind = null | 'quick' | 'mood' | 'vital' | 'item' | 'share' | 'sleep' | 'profile' | 'insights';
export type Toast = { text: string; undo?: number[] | null; key: number } | null;
export type RepPhase = 'idle' | 'gen' | 'ready';

export type State = {
  tab: Tab;
  minimised: boolean;
  /** A full page over the tabs (heart trends, sleep), or null. */
  page: Page;
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
  heartLog: HeartEntry[];
  sleepLog: SleepEntry[];
  profile: Profile;
  /** Every blood pressure reading with its time (for the BP trend prediction). */
  bpLog: { at: number; sys: number; dia: number }[];
  /** How nights are recorded: logged by hand, timed with the bed/up taps, or by ultrasonic sonar. */
  sleepMethod: 'manual' | 'timer' | 'sonar';
  /** The ultrasonic recording in progress (path + start), if any. */
  sonarRun: { path: string; start: number } | null;
  /** Analysed ultrasonic nights (summaries only; the raw echo is deleted after analysis). */
  sonarNights: StoredNight[];
  /** Analysis progress 0–1 while "I'm up" processes a sonar night, else null. */
  sonarBusy: number | null;
  /** When "Going to bed" was tapped (ms), while a night is being timed. */
  sleepStart: number | null;
  /** Prefill for the sleep sheet (from "I'm up"); cleared when the sheet saves. */
  sleepDraft: { bed: string; wake: string; date: string } | null;
  /** Local date (YYYY-MM-DD) the day's schedule belongs to; a new day resets the checklist. */
  day: string;
  filter: 'all' | Pillar;
  notify: Record<string, boolean>;
  rep: Record<Pillar, boolean>;
  repPhase: RepPhase;
  repStep: number;
};
