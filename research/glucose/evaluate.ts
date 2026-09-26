/**
 * Glucose-from-PPG feasibility study on public data, using the *same* TypeScript feature pipeline
 * the phone runs (src/signal). Honest protocol, after "Reassessing the Feasibility of PPG-Based
 * Non-Invasive Blood Glucose Level Estimation" (arXiv 2608.01820):
 *   - leave-one-subject-out (no windows of the same person in train and test),
 *   - hyper-parameters chosen with an inner LOSO on the training subjects only,
 *   - compared against predicting the training mean, and against an age-only model,
 *   - R² / MAE first; MARD and Clarke zones reported but not trusted on their own.
 *
 * Usage: npx tsx research/glucose/evaluate.ts <path-to-PPG-based-BGL-assessment> [out.md]
 * Dataset: S. Vásquez Salazar & E. J. Argüello-Prada, "PPG-based BGL assessment dataset" (GitHub, 2026).
 */
import fs from 'node:fs';
import path from 'node:path';
import { analyzePpg } from '../../src/signal/ppg';
import { morphology } from '../../src/signal/morphology';
import { clarkeZone, ridgeFit, ridgePredict, type Row } from './stats';

type Subject = { id: string; age: number; sex: string; type: string; bgl: number; sites: Record<string, { t: number[]; v: number[] }> };

function load(dir: string): Subject[] {
  const infoDir = path.join(dir, 'Dataset', 'PPG_csv_info'), sigDir = path.join(dir, 'Dataset', 'PPG_csv');
  return fs.readdirSync(sigDir).filter(f => f.endsWith('.csv')).sort().map(f => {
    const id = f.replace('.csv', '');
    const info = fs.readFileSync(path.join(infoDir, f.replace('PPG_subj_', 'PPG_subj_wInfo_')), 'utf8').split('\n')[0].split(',');
    const lines = fs.readFileSync(path.join(sigDir, f), 'utf8').trim().split('\n');
    const head = lines[0].split(',').map(h => h.trim());
    const cols = lines.slice(1).map(l => l.split(',').map(Number));
    const sites: Subject['sites'] = {};
    head.slice(1).forEach((h, k) => { sites[h.replace('PPG_', '')] = { t: cols.map(c => c[0]), v: cols.map(c => c[k + 1]) }; });
    return { id, age: +info[1], sex: info[2], type: info[4], bgl: +info[5], sites };
  });
}

const FEATURES = ['hr', 'rmssd', 'sdnn', 'riseFrac', 'width50', 'ba', 'ca', 'da', 'ea', 'agingIndex', 'reflectionIndex', 'ipa', 'deltaTMs'] as const;

/** Features for one site; the polarity with the cleaner beats wins (the dataset's sign convention is not documented). */
function features(sig: { t: number[]; v: number[] }) {
  // Skip the sensor warm-up plateau at the start of each record.
  const start = sig.v.findIndex((x, i) => i > 0 && x !== sig.v[0]);
  const t = sig.t.slice(start + 40), v = sig.v.slice(start + 40);
  let best: ReturnType<typeof analyzePpg> | null = null;
  for (const inverted of [false, true]) {
    const a = analyzePpg(t, v, { inverted, fs: 60 });
    if (!best || a.sqi > best.sqi) best = a;
  }
  const a = best!;
  const m = morphology(a.clean, a.peakTimes.map(x => x * a.fs), a.fs, k => !(a.beatQuality[k] < 0.85) && !(a.beatQuality[k + 1] < 0.85));
  const out: Record<string, number | null> = { hr: a.metrics?.hr ?? null, rmssd: a.metrics?.rmssd ?? null, sdnn: a.metrics?.sdnn ?? null };
  for (const k of FEATURES.slice(3)) out[k] = (m as Record<string, number | null> | null)?.[k] ?? null;
  return { f: out, sqi: a.sqi, quality: a.quality };
}

function evaluate(rows: Row[], cols: string[] | null, label: string) {
  const preds: number[] = [], lambdas: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const train = rows.filter((_, j) => j !== i);
    let yhat: number, lam = 0;
    if (!cols) yhat = train.reduce((s, r) => s + r.y, 0) / train.length;
    else {
      // Inner LOSO on the training subjects picks λ; the test subject never influences it.
      let bestErr = Infinity;
      for (const l of [0.1, 1, 3, 10, 30, 100, 300]) {
        let e = 0;
        for (let k = 0; k < train.length; k++) {
          const inner = train.filter((_, j) => j !== k);
          e += Math.abs(ridgePredict(ridgeFit(inner, cols, l), train[k]) - train[k].y);
        }
        if (e < bestErr) { bestErr = e; lam = l; }
      }
      yhat = ridgePredict(ridgeFit(train, cols, lam), rows[i]);
    }
    preds.push(yhat); lambdas.push(lam);
  }
  const y = rows.map(r => r.y), my = y.reduce((a, b) => a + b, 0) / y.length;
  const ssRes = y.reduce((s, v, i) => s + (v - preds[i]) ** 2, 0), ssTot = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const mae = y.reduce((s, v, i) => s + Math.abs(v - preds[i]), 0) / y.length;
  const mard = (100 * y.reduce((s, v, i) => s + Math.abs(v - preds[i]) / v, 0)) / y.length;
  const zones = y.map((v, i) => clarkeZone(v, preds[i]));
  const pct = (z: string) => Math.round((100 * zones.filter(q => q === z).length) / zones.length);
  return { label, r2: 1 - ssRes / ssTot, mae, rmse: Math.sqrt(ssRes / y.length), mard, zoneA: pct('A'), zoneAB: pct('A') + pct('B'), preds, lambdas };
}

function main() {
  const dir = process.argv[2], out = process.argv[3];
  if (!dir) throw new Error('usage: evaluate.ts <dataset dir> [out.md]');
  const subjects = load(dir);
  const rows: Row[] = [], perSubject: string[] = [];
  for (const s of subjects) {
    const fin = features(s.sites.Finger), ear = features(s.sites.Earlobe);
    const x: Record<string, number | null> = { age: s.age };
    for (const k of FEATURES) { x[`fin_${k}`] = fin.f[k]; x[`ear_${k}`] = ear.f[k]; }
    rows.push({ id: s.id, y: s.bgl, x });
    perSubject.push(`| ${s.id} | ${s.age} | ${s.type} | ${s.bgl} | ${fin.quality} (${fin.sqi.toFixed(2)}) | ${fin.f.hr ? Math.round(fin.f.hr) : '–'} | ${ear.quality} (${ear.sqi.toFixed(2)}) |`);
  }
  const finCols = FEATURES.map(k => `fin_${k}`), allCols = [...finCols, ...FEATURES.map(k => `ear_${k}`)];
  const results = [
    evaluate(rows, null, 'Baseline: predict the training mean'),
    evaluate(rows, ['age'], 'Age only (ridge)'),
    evaluate(rows, finCols, 'Finger PPG features (ridge)'),
    evaluate(rows, [...finCols, 'age'], 'Finger PPG + age (ridge)'),
    evaluate(rows, [...allCols, 'age'], 'Finger + earlobe PPG + age (ridge)'),
  ];
  const base = results[0];
  const md = [
    '# Glucose from PPG: leave-one-subject-out evaluation',
    '',
    `Dataset: PPG-based BGL assessment (Vásquez Salazar & Argüello-Prada, 2026). ${subjects.length} subjects, one fingerstick BGL each`,
    `(${Math.min(...rows.map(r => r.y))}–${Math.max(...rows.map(r => r.y))} mg/dL), 2 min of finger/earlobe/forehead PPG at ~34 Hz.`,
    'Features come from the app\'s own on-device pipeline (`src/signal`). Every number below is on subjects the model never saw;',
    'ridge λ is picked by an inner leave-one-out on the training subjects only.',
    '',
    '| Model | R² | MAE (mg/dL) | RMSE | MARD | Clarke A | Clarke A+B |',
    '|---|---|---|---|---|---|---|',
    ...results.map(r => `| ${r.label} | ${r.r2.toFixed(2)} | ${r.mae.toFixed(1)} | ${r.rmse.toFixed(1)} | ${r.mard.toFixed(1)}% | ${r.zoneA}% | ${r.zoneAB}% |`),
    '',
    '## Verdict',
    '',
    ...(() => {
      const bestPpg = results.slice(2).reduce((a, b) => (b.mae < a.mae ? b : a));
      const beats = bestPpg.mae < base.mae * 0.9 && bestPpg.r2 > 0.1;
      return beats
        ? [`**${bestPpg.label}** beats the mean baseline by ${(100 * (1 - bestPpg.mae / base.mae)).toFixed(0)}% MAE (R² ${bestPpg.r2.toFixed(2)}). Promising, but ${subjects.length} subjects is far too few to trust; needs replication on a larger dataset before any on-device use.`]
        : [`**No PPG model meaningfully beats predicting the average** on unseen subjects (best: ${bestPpg.label}, MAE ${bestPpg.mae.toFixed(1)} vs ${base.mae.toFixed(1)} mg/dL, R² ${bestPpg.r2.toFixed(2)}).`,
           `Note that even the trivial baseline scores ${base.zoneAB}% in Clarke A+B, which is why Clarke zones alone cannot validate a glucose model.`,
           'So the app must **not** show a calibration-free glucose number. This matches the 2026 re-evaluation of the field.'];
    })(),
    '',
    '## Per-subject signal quality',
    '',
    '| Subject | Age | Group | BGL | Finger quality (SQI) | Finger HR | Earlobe quality (SQI) |',
    '|---|---|---|---|---|---|---|',
    ...perSubject,
    '',
  ].join('\n');
  if (out) fs.writeFileSync(out, md);
  console.log(md);
}

main();
