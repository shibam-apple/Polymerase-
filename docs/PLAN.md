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


---

# Phase 1.5: test builds on your phone, camera/HRV hardening, glucose research track

## Context
Phase 1 is on `main` (commit `4df6f53`): the v3 design in Expo, camera PPG capture and on-device HR/HRV. Nothing
has run on a real phone yet. The user now wants:
- An easy-to-install build they can test.
- Updates pushed to their phone after each change, with a live feedback loop. They asked for a "live ADB bridge".
- The camera module and HRV algorithm tested and improved on real hardware.
- Blood-sugar sensing based on the latest viable research, **using public datasets**, so ordinary users don't need
  fingersticks.
- The full plan from our discussions in the repo. It's already there: `docs/PLAN.md` holds phases 1–4. This plan
  gets appended to it as Phase 1.5.

### What this environment allows (checked)
- **No live ADB is possible.** This container runs in the cloud and has no route to a USB or Wi-Fi phone. Expo's
  servers are also blocked by the network policy (`api.expo.dev`, `expo.dev`, `u.expo.dev`), so there's no EAS Build,
  no EAS Update and no Metro tunnel from here.
- **GitHub works.** `api.github.com` is reachable and the session has `GH_TOKEN`. The repo is public, and the user
  approved public test APKs. So builds run in **GitHub Actions** and publish to **GitHub Releases**. I can trigger
  them, watch them and read their logs from here.

## A. Delivery loop to your phone (replaces "live ADB")
1. **`.github/workflows/android-apk.yml`**
   - Triggers on push to `main` and on manual dispatch.
   - Steps: Node 22 + JDK 17 → `npm ci` → `npx expo prebuild -p android` → `./gradlew assembleRelease`.
   - Publishes the APK to a rolling GitHub Release `test-latest`, with the build number and commit message as notes.
   - Fixed install link: `github.com/shibam-apple/Polymerase-/releases/tag/test-latest`.
2. **Stable signing key.** Android only installs an update over an existing app if both are signed with the same key.
   - Generate a keystore once and store it as repo secrets (`ANDROID_KEYSTORE_B64` + passwords) via the GitHub API.
   - If the token can't write secrets, the user pastes them in once and I give exact steps.
   - The keystore is never committed.
3. **Version stamping.** `versionCode` is set from the Actions run number, and the app shows it under Settings → About.
4. **In-app updater (Android only).**
   - On launch, the app checks the `test-latest` release. If it's newer, a glass banner offers "Update available ·
     Install".
   - Install downloads the APK (expo-file-system) and opens Android's installer (expo-intent-launcher, needs the
     `REQUEST_INSTALL_PACKAGES` permission).
   - Result: push → about 15 min build → the phone offers the update. That's the closest thing to "push to my phone".
5. **Feedback without ADB: Settings → Diagnostics.**
   - Recent logs and errors from an in-app ring buffer, captured with a global error handler.
   - "Share last measurement" exports the raw PPG session (timestamps, R/G/B means, contact status, device model,
     fps, exposure) as JSON through the Android share sheet.
   - The user uploads that file in this chat, and I replay it through the pipeline in tests to tune on real data.
   - Recordings stay out of the public repo unless the user asks to add one (anonymised) as a regression fixture.
6. **Me watching the builds.** I trigger builds and poll Actions via `api.github.com`. I fix failures before telling the
   user a build is ready.

## B. Camera module + HRV, hardened for real phones
- **Capture** (`src/signal/camera/CameraPpgCapture.tsx`)
  - Record **R, G, B channel means separately**, not only luma, using VisionCamera `pixelFormat: 'rgb'` on a
    downscaled ~VGA frame, or YUV→RGB on the sampled grid.
    - Red is the most robust under the torch. Green carries the most pulsatile signal. Glucose features need both.
  - Pick the best channel per session by SNR, measured as spectral power in the 0.7–3.5 Hz band against everything
    else.
  - Lock auto-exposure, white balance and focus if VisionCamera v5 exposes them (check its `.d.ts`). Otherwise detect
    exposure jumps and drop those segments.
  - Request 30 fps, with 60 fps when the device supports it. Log the fps actually achieved.
  - Contact detection from red dominance plus uniformity. Pressure/motion detection from sudden DC shifts and SQI
    drops, with live coaching text.
- **Pipeline** (`src/signal/*`), reusing `analyzePpg`, `elgendiPeaks`, `cleanIbis`, `hrvFromIbis` and `templateSqi`.
  - Add a per-beat SQI so individual bad beats are dropped instead of the whole session.
  - Add frequency-domain HRV (LF/HF via Lomb-Scargle on the IBIs) and respiratory rate from RSA.
  - Add perfusion index (AC/DC), a quality score of 0–100, and "retry" guidance.
- **Validation**
  - Replay the user's shared sessions as test fixtures.
  - Compare HR against their watch or pulse oximeter, which they note in the app when saving.
  - Target: HR within ±3 bpm on good-quality sessions.

## C. Glucose research track (experimental, public data, honest evaluation)

**What the research says** (searched this session):
- Many papers claim high accuracy, for example ResNet-Transformer MARD 11–15% and "100% in Clarke A+B".
- A 2026 re-evaluation, *Reassessing the Feasibility of PPG-Based Non-Invasive Blood Glucose Level Estimation*
  (arXiv 2608.01820), found that those models **collapse to about the skill of guessing the average (R² ≤ 0) once tested
  on unseen people**.
- It also found that Clarke A+B stays above 90% even for that trivial baseline, so the metric hides failure. Handcrafted
  morphology features generalised better than raw-signal deep learning.
- The most credible accuracy comes with light calibration. Chu et al. (Communications Medicine, 2025) used **one
  pretest a month plus an inferred HbA1c** and got MARD of 9.6–16.4%.

**Plan: a population model with no fingersticks, measured honestly**
1. **Public datasets**, each licence checked before use; only datasets that allow it are used:
   - PPG-based BGL assessment: 20 non-hospitalised people, finger, earlobe and forehead PPG (GitHub).
   - The Zenodo PPG blood-glucose dataset (MIT-licensed code).
   - The *Scientific Data* 2025 multimodal non-invasive glucose dataset.
   - PhysioCGM: 10 people with type 1 diabetes, wearable PPG plus CGM.
   - VitalDB: surgical PPG with lab glucose, if its licence allows.
2. **Training runs in GitHub Actions** (`backend/glucose/`, Python), not this container, because its network can't
   reach most dataset hosts.
   - Pipeline: download → resample → **camera-robust handcrafted features**. These are pulse-shape ratios from the
     NeuroKit2 fiducials and the SDPPG a–e ratios, which don't depend on absolute amplitude.
   - Plus HRV, perfusion index, time of day and time since the last logged meal.
   - Candidate models: ridge and gradient boosting.
3. **Honest evaluation**
   - Leave-subjects-out and leave-dataset-out.
   - Report **R² and MAE against a predict-the-mean baseline** first, then MARD and Clarke/Parkes.
   - The report `backend/glucose/REPORT.md` is committed on every training run.
4. **Ship on the device only if it beats the baseline.**
   - Export the model as JSON (linear or small tree ensemble) and evaluate it in TypeScript on the phone.
   - It sits behind **Settings → Experimental → Glucose trend**, with a research-only banner, and is never included in
     reports.
   - If it doesn't beat the baseline on unseen people, the app shows **trend direction only**, or nothing, and says why.
5. **Domain gap.** The datasets use contact finger or wrist sensors, not phone cameras.
   - The user's own glucometer readings serve as a **held-out real-world test set, never training**. That's how we
     learn whether it works for an ordinary user on a phone camera.
   - The app has a "log a reference reading" sheet (reusing the vital sheet) that pairs a reading with the latest PPG
     session.
6. **Optional, low-effort accuracy boost** (opt-in, following Chu et al.):
   - Enter an HbA1c value from a routine lab report.
   - Optionally, one fingerstick a month. Ordinary users are never required to do either.

## Order of work (each step is pushed as a new test build)
1. Actions APK workflow + signing + `test-latest` release + version shown in the app. **The first installable build.**
2. Diagnostics screen + in-app updater + raw-session export.
3. Camera RGB capture, exposure handling, per-beat SQI, and coaching.
4. Frequency-domain HRV, respiratory rate and perfusion index. Tests on synthetic data, then on the user's recordings.
5. `backend/glucose` pipeline in Actions + REPORT.md. Then the experimental glucose screen and reference-reading
   logging, if the report justifies it.
6. Append this plan to `docs/PLAN.md` as Phase 1.5.

## Verification
- After every push:
  - `npm test`, `npm run typecheck` and `npm run lint` pass.
  - The Actions build is green, which I confirm through the API, and the release APK exists at `test-latest`.
- On the user's phone:
  1. Install from the link.
  2. Check that the version matches, and that the updater offers the next build after a new push.
  3. Run a measurement and share the session file here. I replay it in a test and report HR/HRV against their
     watch.
- Glucose:
  - `REPORT.md` shows leave-subjects-out R², MAE and MARD against the mean baseline, with no random splits.
  - The on-device model's outputs match the Python model on shared test vectors.

## Limits to state plainly
- There's no live ADB or instant hot reload from this cloud session. The loop is push → build (~15 min) → in-app update.
- A glucose estimate from a phone camera with no calibration is unproven in the literature. This track measures
  whether it works; it doesn't assume it.
