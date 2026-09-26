/** Small, dependency-free statistics for the research scripts (and later on-device models). */

export type Row = { id: string; y: number; x: Record<string, number | null> };
export type RidgeModel = { cols: string[]; mean: number[]; sd: number[]; w: number[]; b: number };

/** Solve A·x = b by Gaussian elimination with partial pivoting (A is small and SPD here). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || !M[c][c]) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => (r[i] ? r[n] / r[i] : 0));
}

/**
 * Ridge regression on standardised features. Missing values are imputed with the training mean
 * (i.e. 0 after standardisation), so a feature the device could not measure simply contributes nothing.
 */
export function ridgeFit(rows: Row[], cols: string[], lambda: number): RidgeModel {
  const mean = cols.map(c => { const v = rows.map(r => r.x[c]).filter((q): q is number => q != null && isFinite(q)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; });
  const sd = cols.map((c, j) => { const v = rows.map(r => r.x[c]).filter((q): q is number => q != null && isFinite(q)); const s = Math.sqrt(v.reduce((a, q) => a + (q - mean[j]) ** 2, 0) / Math.max(1, v.length - 1)); return s || 1; });
  const Z = rows.map(r => cols.map((c, j) => { const q = r.x[c]; return q != null && isFinite(q) ? (q - mean[j]) / sd[j] : 0; }));
  const ym = rows.reduce((a, r) => a + r.y, 0) / rows.length;
  const p = cols.length;
  const A = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, k) => Z.reduce((s, z) => s + z[i] * z[k], 0) + (i === k ? lambda : 0)));
  const bv = Array.from({ length: p }, (_, i) => Z.reduce((s, z, n) => s + z[i] * (rows[n].y - ym), 0));
  return { cols, mean, sd, w: solve(A, bv), b: ym };
}

export function ridgePredict(m: RidgeModel, r: Row): number {
  return m.b + m.cols.reduce((s, c, j) => { const q = r.x[c]; return s + (q != null && isFinite(q) ? ((q - m.mean[j]) / m.sd[j]) * m.w[j] : 0); }, 0);
}

/** Clarke error grid zone for a reference / predicted glucose pair (mg/dL), standard boundaries. */
export function clarkeZone(ref: number, pred: number): 'A' | 'B' | 'C' | 'D' | 'E' {
  const x = ref, y = pred;
  if ((x <= 70 && y <= 70) || (y <= 1.2 * x && y >= 0.8 * x)) return 'A';
  if ((x >= 180 && y <= 70) || (x <= 70 && y >= 180)) return 'E';
  if ((x >= 70 && x <= 290 && y >= x + 110) || (x >= 130 && x <= 180 && y <= (7 / 5) * x - 182)) return 'C';
  if ((x >= 240 && y >= 70 && y <= 180) || (x <= 175 / 3 && y <= 180 && y >= 70) || (x >= 175 / 3 && x <= 70 && y >= (6 / 5) * x)) return 'D';
  return 'B';
}
