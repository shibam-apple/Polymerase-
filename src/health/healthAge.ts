/**
 * Health age: chronological age, adjusted by transparent, published-direction risk markers. It is an
 * indicative summary, NOT a validated model; every adjustment is listed so the user can see why.
 *
 *   Resting HR     <55 −2 · 55–64 −1 · 65–74 0 · 75–84 +1 · ≥85 +3      (higher RHR ↔ higher risk)
 *   Blood pressure normal −1 · elevated 0 · stage 1 +2 · stage 2 +4       (ACC/AHA 2017 categories)
 *   BMI            18.5–24.9 −1 · <18.5 +1 · 25–29.9 +1 · ≥30 +3
 *   Sleep (7-day)  7–9 h −1 · 6–7 h 0 · >9 h +1 · <6 h +2
 *   HRV            RMSSD vs an approximate age trend (RMSSD falls ~1.7%/year of age; ln RMSSD ≈ 4.2 − 0.017·age),
 *                  (HRV-age − age)/4, capped at ±3
 * Parts without data are simply left out.
 */
export type Profile = { age: number | null; sex: 'female' | 'male' | null; heightCm: number | null; sleepTargetH: number };
export type AgeInputs = { rhr?: number | null; sys?: number | null; dia?: number | null; weightKg?: number | null; sleepAvgH?: number | null; rmssd?: number | null };
export type AgePart = { label: string; years: number; detail: string };
export type HealthAge = { age: number; realAge: number; parts: AgePart[]; diffText: string } | { age: null; missing: string };

export function bpCategory(sys: number, dia: number): 'normal' | 'elevated' | 'stage1' | 'stage2' {
  if (sys >= 140 || dia >= 90) return 'stage2';
  if (sys >= 130 || dia >= 80) return 'stage1';
  if (sys >= 120) return 'elevated';
  return 'normal';
}

export const hrvAge = (rmssd: number) => Math.max(18, Math.min(90, (4.2 - Math.log(rmssd)) / 0.017));

export function healthAge(p: Profile, x: AgeInputs): HealthAge {
  if (p.age == null) return { age: null, missing: 'Add your age to see your health age' };
  const parts: AgePart[] = [];
  if (x.rhr != null) {
    const r = x.rhr, y = r < 55 ? -2 : r < 65 ? -1 : r < 75 ? 0 : r < 85 ? 1 : 3;
    parts.push({ label: 'Resting HR', years: y, detail: `${Math.round(r)} bpm` });
  }
  if (x.sys != null && x.dia != null) {
    const c = bpCategory(x.sys, x.dia), y = { normal: -1, elevated: 0, stage1: 2, stage2: 4 }[c];
    parts.push({ label: 'Blood pressure', years: y, detail: `${x.sys}/${x.dia}` });
  }
  if (x.weightKg != null && p.heightCm) {
    const bmi = x.weightKg / (p.heightCm / 100) ** 2, y = bmi < 18.5 ? 1 : bmi < 25 ? -1 : bmi < 30 ? 1 : 3;
    parts.push({ label: 'Weight', years: y, detail: `BMI ${bmi.toFixed(1)}` });
  }
  if (x.sleepAvgH != null) {
    const s = x.sleepAvgH, y = s >= 7 && s <= 9 ? -1 : s >= 6 && s < 7 ? 0 : s > 9 ? 1 : 2;
    parts.push({ label: 'Sleep', years: y, detail: `${s.toFixed(1)} h avg` });
  }
  if (x.rmssd != null && x.rmssd > 0) {
    const y = Math.round(Math.max(-3, Math.min(3, (hrvAge(x.rmssd) - p.age) / 4)));
    parts.push({ label: 'HRV', years: y, detail: `${Math.round(x.rmssd)} ms` });
  }
  if (!parts.length) return { age: null, missing: 'Measure your heart rate or log a vital to see your health age' };
  const age = p.age + parts.reduce((a, q) => a + q.years, 0), d = p.age - age;
  return { age, realAge: p.age, parts: parts.filter(q => q.years !== 0).concat(parts.filter(q => q.years === 0)), diffText: d !== 0 ? `${Math.abs(d)} year${Math.abs(d) === 1 ? '' : 's'} ${d > 0 ? 'younger' : 'older'} than ${p.age}` : `Same as your age, ${p.age}` };
}
