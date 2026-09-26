# Plan: "Daily" — Apple-style health app with PPG, BP estimation, recovery & predictive diagnostics

## Context
Source spec: the Claude Design handoff (`/home/claude/repo/project/Health App v3.dc.html` + `chats/chat1.md`). It defines a
minimal, Apple-style, liquid-glass app: Today, Progress, Details and Report tabs, one-tap and swipe logging, a day→night
wallpaper, GitHub-style grid, readiness, health age, vitals sheets, hold-to-measure heart + HRV capsule, and a one-ball report
animation. The user then widened the scope:
- An Apple-style **hypertension / BP monitoring** system using an ML model (open source where possible).
- **PPG** with the most accurate open-source tooling, **HR + HRV** with intuitive graphs.
- **Health markers, recovery, predictive diagnostics, medications, fitness**. The main focus is **recovery and predictive
  diagnostics**, including designing their algorithms.
- An **experimental blood-glucose** feature, for personal research only and never production.

Decisions made with the user:
- **React Native (Expo)**, installable on their Android phone.
- Glass must work on Android 17, with a designed fallback on Android 11.
- App only, no prototype dev controls.
- PPG source: **phone camera first**, behind an interface so a BLE wearable can be added later.
- Compute: **Python backend + on-device**.
- Predictions: **hypertension risk trend, illness/overreaching onset, recovery forecast**.
- Build **in phases**.

Repo: `shibam-apple/Polymerase-`, cloned at `/home/claude/polymerase-`. It is empty upstream. An Expo SDK 57 blank-TS
scaffold is copied in, uncommitted. Extra deps are not installed yet, because the last `expo install` hit a network error.

## Verified facts that shape the design
- **NeuroKit2** is MIT-licensed. Its default PPG peak method is Elgendi et al. 2013. It's the core pipeline and I'll port Elgendi to TS for live on-device use.
- **pyPPG** is GPL-3.0. It gives 74 pulse-wave biomarkers plus SQI. I'll use it only in the backend for research features, which is fine for personal use. Shipping a combined product later would need GPL compliance or a swap, so I'll keep it isolated in `backend/features/pyppg_adapter.py`.
- **PulseDB** (MIMIC-III + VitalDB) has 5.2M 10-second PPG/ECG/ABP segments from 5,361 subjects, subject-disjoint splits,
  and fiducial points. It's the BP training and benchmark set.
- Its data comes from hospital finger-clip PPG, and phone-camera PPG differs from that. So the BP estimate is **only shown after
  per-user cuff calibration** and is labelled an estimate throughout.

## Safety framing (built into the UI and the code)
- BP, the predictions and health age are shown as **estimates / trends, not diagnoses**. Each screen has a one-line note, as the
  design already does ("A guide for your day, not a diagnosis").
- Hypertension flags say "worth confirming with a cuff / mentioning to your doctor". They never give treatment advice.
- Glucose sits behind **Settings → Experimental**. It has its own banner ("Research only · not for treatment decisions"), is never
  included in the doctor report, and requires paired reference readings (fingerstick or CGM).

## Architecture
```
app (Expo RN, TS)                                   backend/ (Python 3.12, FastAPI)
 ├ PPG capture: CameraPpgSource (VisionCamera        ├ pipeline/: clean (NeuroKit2), peaks (Elgendi),
 │  frame processor → red/luma mean @30 fps, torch)  │   SQI, pyPPG fiducials+biomarkers (adapter)
 │  SimulatedPpgSource (web/emulator/tests)          ├ models/bp/: PulseDB loader, feature + CNN models,
 ├ src/signal/ (on-device, live): band-pass,          │   subject-disjoint eval (MAE/SD vs AAMI 5±8),
 │  Elgendi peaks, IBI cleaning, HR, RMSSD/SDNN/pNN50,│   per-user calibration, ONNX export
 │  SQI → drives gauge + live graphs                  ├ algorithms/: recovery, illness_onset,
 ├ src/api/: upload 60 s recordings + daily summaries │   htn_trend, recovery_forecast
 └ UI (v3 design) + new Heart / BP / Recovery views   ├ experimental/glucose/ (flagged)
                                                      ├ api.py (FastAPI routes), storage (SQLite)
                                                      └ tests/ + notebooks/ (metrics reports)
```
The app works offline for live HR/HRV. BP, recovery, predictions and glucose come from the backend. The backend URL is set in Settings,
e.g. a laptop on the same Wi-Fi.

## Algorithms (the focus)
**Recovery score (0–100, transparent points like the design's "What's shaping it")**
- HRV: 7-day rolling mean of morning ln(RMSSD) compared with a personal normal band (60-day mean ± 0.5 SD). Worth up to 40 points.
- Resting HR: today's value against the 30-day baseline as a z-score. Up to 20 points.
- Sleep: duration against need, taken from the logged Sleep item. Up to 25 points.
- Load: yesterday's training load / strain from Fitness. Up to 10 points.
- Adherence: meds and habits. Up to 5 points.
- Cold start (fewer than 14 days of data) uses population priors and shows "Learning · n of 14 days", matching the Insights rows.

**Illness / overreaching onset**
- Daily z-scores for RHR (up is worse) and ln RMSSD (down is worse) against a 28-day baseline that excludes the last 3 days.
- A combined score feeds a one-sided CUSUM. An alert fires after 2 consecutive days above threshold.
- Overreaching versus illness is told apart by recent load: high load means "overreaching", low load means "possible illness onset".
- Evaluated on the user's own history and on synthetic injected-anomaly tests. The thresholds are configurable.

**Hypertension risk trend**
- Calibrated BP estimates, preferring morning seated readings, are summarised as a 7-day mean and a 28-day robust (Theil–Sen) slope.
- Categories follow the ACC/AHA bands (normal, elevated, stage 1 ≥130/80, stage 2 ≥140/90) on the 7-day mean.
- It flags a sustained stage-1+ mean over 14 days, or a slope above +1 mmHg/week. The drift-detection logic also asks the user to recalibrate.

**Recovery forecast (tomorrow)**
- Uses personal gradient-boosted regression (LightGBM) on lagged features: HRV, RHR, sleep, load, adherence and weekday.
- Until 30 days of data exist, it falls back to an exponentially weighted persistence model.
- The UI shows the forecast with an uncertainty band.

**BP model**
- Baseline: pyPPG and NeuroKit2 morphology plus second-derivative (SDPPG a–e ratios) features and demographics, fed to LightGBM.
- Advanced: a 1D-ResNet trained on raw 10 s segments.
- Both are trained and evaluated on PulseDB with subject-disjoint splits and reported against AAMI.
- On the phone: per-user calibration (offset plus slope from at least 3 cuff pairs, refreshed every 4 weeks or on drift), then the best model is exported to ONNX.
- The metrics report is committed, so real accuracy is visible, not assumed.

**Experimental glucose (Phase 4)**
- Personal model only: PPG morphology + HRV + time-since-meal features, trained with ridge or GBM on the user's paired fingerstick/CGM readings.
- Evaluated with MARD and a Clarke Error Grid. The app shows the error metrics alongside any estimate.

## Phases (each ends committed, pushed, and usable)
1. **App + live heart**
   - Expo RN implementation of the v3 design: Today, Progress, Details and Report tabs, sheets, toast/undo, wallpaper, and the tiered glass (below).
   - Camera PPG source, with a simulated source for web and tests.
   - On-device `src/signal/` with unit tests.
   - Heart screen: live PPG waveform, HR gauge (design), 60 s HRV session, RR tachogram and Poincaré plot, HR/HRV history charts (day/week/month).
2. **Backend + BP + Recovery**
   - FastAPI, NeuroKit2/pyPPG pipeline, PulseDB training scripts plus the metrics report.
   - Calibration flow in the app ("Add a cuff reading" sheet reusing the design's vital sheet).
   - BP screen: estimate, trend chart and category bands.
   - Recovery algorithm powering the readiness/recovery card.
3. **Predictive diagnostics + health markers + fitness**
   - Illness onset, HTN trend and recovery forecast, filling the design's reserved Insights slots (`analytics-*`).
   - Health markers: RHR, HRV, BP, weight, health age.
   - Fitness: steps and workouts via Health Connect, used as load.
4. **Experimental glucose**, behind a flag.

## Phase 1 detail (what I build first)
- **Deps** (`npx expo install`): expo-router, reanimated + worklets, gesture-handler, react-native-svg, @shopify/react-native-skia,
  expo-blur, expo-linear-gradient, expo-haptics, safe-area-context, react-native-vision-camera (+ worklets-core if SDK 57 needs it),
  react-native-web/react-dom for browser checks; jest-expo for tests. I'll check each package's `.d.ts` for the SDK 57 API.
- **Glass tiers** (`src/ui/glass/`), with one `<Glass>` component encoding the design recipe:
  - `live` (Android API ≥ 31, i.e. Android 12–17, plus iOS and web): expo-blur backdrop blur, tint gradient, specular edge and sheen.
  - `frosted` (Android ≤ 30, i.e. Android 11): no live blur. A denser frosted fill with the same highlights, so it still reads as glass.
  - Tab bar and + refraction are drawn in Skia (turbulence → displacement of the wallpaper, porting `#lgRefract`), so they work on both tiers.
- **Layout**
  - `src/app/` (single route)
  - `src/state/` (seed data, reducer, pure selectors ported from `renderVals`)
  - `src/theme/`
  - `src/ui/`
  - `src/components/` (Wallpaper, TabBar, MinimisedWidget)
  - `src/screens/` (Today, Progress, Details, Report, Heart)
  - `src/sheets/`
  - `src/viz/` (Skia: ReportOrb, HeartGauge, FlameCapsule, charts)
  - `src/signal/` (ppg.ts, hrv.ts, sources.ts, useHeartMeasurement.ts)
- **Camera PPG**
  - Hold the capsule, which starts the camera with the torch on. It measures 30 s for HR, or 60 s for a full HRV session (60 s is the minimum for reliable RMSSD).
  - The SQI gate tells the user "Cover the lens fully" / "Keep still".
  - The design's 3-second hold becomes "hold to start", then the measurement runs hands-free.
- **Fidelity**: exact sizes, radii, colours and easing come from the HTML. Uses the system font and tabular numerals.
- **Docs**: `README.md` covers building an installable APK (`npx expo run:android` or `eas build -p android --profile preview`), the glass tiers, and what is simulated or experimental.

## Verification
- **Phase 1**
  - `npx tsc --noEmit`, `npx expo lint`, `npx jest` (signal tests use synthetic PPG at 50/75/110 bpm within ±2 bpm, RMSSD on known IBIs, and noise/motion rejection), and `npx expo-doctor`.
  - `npx expo export -p android` must succeed.
  - Web smoke test: Playwright + Chromium at 390×844, screenshots of every tab/sheet/animation state, compared with the prototype.
- **Phase 2+**
  - `pytest` for the pipeline and algorithms, including injected-anomaly tests for the CUSUM alerts.
  - A committed BP metrics report (MAE/SD, calibrated vs uncalibrated).
  - API contract tests.
- **Not verifiable in this container**
  - Real camera PPG on a phone.
  - Android 11 vs 17 glass rendering.
  - An installed APK.
  - The final report will say so plainly, and the README will give the on-device test checklist.
