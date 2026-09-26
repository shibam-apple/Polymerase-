import { seedState } from '../src/state/seed';
import { gridModel, nextItem, parts, progress, readiness, vitalNote } from '../src/state/selectors';

/** The design's 13:10 snapshot: the morning routine done (sleep, meds, mood "Good"). */
const s = (() => {
  const st = seedState(0);
  st.items = st.items.map(i => (i.part === 0 ? { ...i, done: true, detail: i.p === 'mind' ? 'Good' : i.detail, auto: i.id === 1 ? true : i.auto } : i));
  return st;
})();

describe('Today', () => {
  it('next item is Omega-3 with a Taken action; 8 left', () => {
    const nx = nextItem(s.items, [])!;
    expect(nx.title).toBe('Omega-3');
    expect(nx.cta).toBe('Taken');
    expect(progress(s.items).left).toBe(8);
  });

  it('snoozing skips to the next pending item', () => {
    expect(nextItem(s.items, [5])!.title).toBe('Water');
  });

  it('morning is folded as done; midday offers Log all', () => {
    const p = parts(s.items);
    expect(p[0].allDone).toBe(true);
    expect(p[1].canLogAll).toBe(true);
    expect(p[1].due.map(i => i.id)).toEqual([5, 6, 7]);
  });
});

describe('Readiness', () => {
  it('matches the design at 13:10 (29 sleep + 20 mood + 17 meds + 0 habits = 66)', () => {
    const r = readiness(s.items);
    expect(r.pts).toEqual({ sleep: 29, mind: 20, med: 17, habit: 0 });
    expect(r.score).toBe(66);
    expect(r.label).toBe('Take it steady');
    expect(r.lift?.item.title).toBe('Water');
  });

  it('rises when midday items are logged', () => {
    const items = s.items.map(i => ([5, 6, 7].includes(i.id) ? { ...i, done: true } : i));
    expect(readiness(items).score).toBe(94);
  });
});

describe('Vitals', () => {
  it('classifies blood pressure', () => {
    expect(vitalNote('bp', [118, 76], [122, 79]).note).toBe('Normal range');
    expect(vitalNote('bp', [126, 78], [122, 79]).note).toBe('Slightly raised');
    expect(vitalNote('bp', [135, 85], [122, 79]).note).toBe('Raised · worth mentioning');
  });
  it('describes weight change', () => {
    expect(vitalNote('weight', [72.5], [72.8]).note).toBe('−0.3 kg since last');
  });
});

describe('Progress grid', () => {
  it('ends on today, marks later days as future, and labels months', () => {
    const g = gridModel(s.items, 'all', new Date(2026, 8, 24)); // Thu 24 Sep 2026, as in the design
    expect(g.todayIdx).toBe(14 * 7 + 3);
    expect(g.cells.filter(c => c.future)).toHaveLength(3);
    expect(g.monthLabels[0]).toBe('Jun');
    expect(g.detail(g.todayIdx).label).toBe('Today');
    expect(g.streak).toBeGreaterThanOrEqual(0);
    expect(g.best).toBeGreaterThanOrEqual(g.streak);
  });
});
