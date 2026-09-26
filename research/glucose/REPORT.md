# Glucose from PPG: leave-one-subject-out evaluation

Dataset: PPG-based BGL assessment (Vásquez Salazar & Argüello-Prada, 2026). 20 subjects, one fingerstick BGL each
(88–138 mg/dL), 2 min of finger/earlobe/forehead PPG at ~34 Hz.
Features come from the app's own on-device pipeline (`src/signal`). Every number below is on subjects the model never saw;
ridge λ is picked by an inner leave-one-out on the training subjects only.

| Model | R² | MAE (mg/dL) | RMSE | MARD | Clarke A | Clarke A+B |
|---|---|---|---|---|---|---|
| Baseline: predict the training mean | -0.11 | 12.3 | 15.0 | 11.3% | 85% | 100% |
| Age only (ridge) | -0.27 | 13.1 | 16.1 | 12.0% | 80% | 100% |
| Finger PPG features (ridge) | -1.31 | 15.0 | 21.7 | 14.2% | 80% | 100% |
| Finger PPG + age (ridge) | -0.73 | 14.3 | 18.8 | 13.4% | 75% | 100% |
| Finger + earlobe PPG + age (ridge) | -0.13 | 11.4 | 15.1 | 10.6% | 90% | 100% |

## Verdict

**No PPG model meaningfully beats predicting the average** on unseen subjects (best: Finger + earlobe PPG + age (ridge), MAE 11.4 vs 12.3 mg/dL, R² -0.13).
Note that even the trivial baseline scores 100% in Clarke A+B, which is why Clarke zones alone cannot validate a glucose model.
So the app must **not** show a calibration-free glucose number. This matches the 2026 re-evaluation of the field.

## Per-subject signal quality

| Subject | Age | Group | BGL | Finger quality (SQI) | Finger HR | Earlobe quality (SQI) |
|---|---|---|---|---|---|---|
| PPG_subj_01 | 24 | Non-diabetic | 108 | good (1.00) | 75 | good (1.00) |
| PPG_subj_02 | 33 | Non-diabetic | 99 | good (0.99) | 83 | good (0.99) |
| PPG_subj_03 | 27 | Non-diabetic | 138 | good (1.00) | 89 | good (0.96) |
| PPG_subj_04 | 72 | Diabetic (Type 2) | 96 | good (1.00) | 62 | good (0.99) |
| PPG_subj_05 | 25 | Non-diabetic | 95 | good (0.99) | 97 | good (0.97) |
| PPG_subj_06 | 52 | Non-diabetic | 120 | good (1.00) | 76 | good (0.99) |
| PPG_subj_07 | 25 | Non-diabetic | 88 | good (1.00) | 47 | good (0.99) |
| PPG_subj_08 | 48 | Non-diabetic | 118 | good (1.00) | 66 | good (1.00) |
| PPG_subj_09 | 30 | Non-diabetic | 107 | good (1.00) | 75 | good (1.00) |
| PPG_subj_10 | 56 | Prediabetic | 121 | good (1.00) | 71 | good (1.00) |
| PPG_subj_11 | 69 | Diabetic (Type 2) | 136 | good (1.00) | 64 | good (1.00) |
| PPG_subj_12 | 30 | Diabetic (Type 2) | 128 | good (1.00) | 67 | good (1.00) |
| PPG_subj_13 | 21 | Non-diabetic | 91 | good (1.00) | 68 | good (0.99) |
| PPG_subj_14 | 23 | Non-diabetic | 102 | good (0.99) | 81 | good (0.98) |
| PPG_subj_15 | 23 | Non-diabetic | 93 | good (0.99) | 68 | good (0.99) |
| PPG_subj_16 | 21 | Non-diabetic | 105 | good (0.99) | 82 | good (0.99) |
| PPG_subj_17 | 24 | Non-diabetic | 101 | good (0.99) | 72 | good (1.00) |
| PPG_subj_19 | 48 | Non-diabetic | 98 | good (0.99) | 92 | good (0.97) |
| PPG_subj_20 | 23 | Non-diabetic | 104 | good (0.99) | 72 | good (1.00) |
| PPG_subj_21 | 65 | Diabetic (Type 2) | 100 | good (1.00) | 62 | good (0.99) |
