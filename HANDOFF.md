# Bar Path Tracker — Handoff / Status

Last updated: 2026-06-29 (Phase 1 bar-off-midfoot BUILT; in PR; next = device-test → Phase 2).

## ►► START HERE next session
**Phase 1 (deadlift bar-off-midfoot cue) is BUILT and in a PR** on branch
`feat/phase1-bar-off-midfoot`. 29/29 tests, build green, full SDD review (per-task + opus
whole-branch) done; the one Critical found (a pose-failure hang) is fixed. **Next = JP device-test,
then Phase 2.**

What shipped (spec: `docs/superpowers/specs/2026-06-29-phase1-bar-off-midfoot-design.md`,
plan: `docs/superpowers/plans/2026-06-29-phase1-bar-off-midfoot.md`):
- **Vendored MediaPipe same-origin** under `public/mediapipe/` (no CDN, offline); `src/pose.ts`
  repointed off CDN, still lazy-loaded only on the processing screen.
- **`src/coach.ts`** (pure, 10 tests) — `analyzeBarDrift` fuses the bar path with a pose-derived
  **robust median midfoot x**; pose-midfoot → plate-tap fallback → silence. Calibrated clips flag
  at **≥5 cm**; **uncalibrated stays SILENT** (no actionable px number — shows a "size a plate" hint).
- **Second pose pass** in `src/screens/processing.ts` (`playFrames` in `capture.ts`, no OpenCV) —
  pose can't share the tracker's real-time loop (~37 ms/frame). Strictly additive: any pose
  load/per-frame failure still reaches the result screen.
- **Cue UI** in `result.ts`/`overlay.ts`: cue card + tappable scrub tick at the peak-drift frame +
  a minimal amber midfoot line + bar-to-midfoot gap drawn at that frame. **No skeleton** (Phase 2).
- **Persisted** with saved lifts (optional fields; older records unaffected).

### ►► JP device-test checklist (do before/with PR merge)
Desktop OK for logic (Edge `msedge`, headed, or `npm run preview`); iPhone Safari for real perf.
- [ ] Real **side-on deadlift + sized plate** → cue card shows a sensible cm number; tapping it
      seeks to the visibly worst frame; amber midfoot line + gap draw there; scrub tick at that moment.
- [ ] A **clean rep** → no cue card, no marker.
- [ ] **Uncalibrated** clip (no plate sized) → "Size a plate…" hint, NO number.
- [ ] Pose assets load **only on the processing screen** (Network shows `mediapipe/*` during
      "Reading body position…", not on first paint); **airplane-mode reload** still works.
- [ ] **Save** a lift with a cue → reopen from library → cue/tick/marker intact. Old saved lift
      reopens fine with no cue.
- [ ] iPhone: pose pass completes in reasonable time; foot landmark survives shoes/plate occlusion.

### Deferred / known (after device-test)
- **Drop ~22 MB unused wasm:** `public/mediapipe/wasm/vision_wasm_module_internal.{js,wasm}` are
  unused extras from `cp -r` (FilesetResolver only uses `vision_wasm_internal` / `_nosimd_`).
  `git rm` them to shrink the deploy — **only after** device-test confirms pose loads with the kept pair.
- **Tilt-correction limitation:** the cue is computed on the UNROTATED path. `verticalAngleRad` is
  currently dormant (always null), so nothing wrong ships. If tilt-correction is ever re-enabled,
  route the cue (path + midfoot ref) through the same rotation (commented in `processing.ts`).
- Cue copy says **"off midfoot"** (neutral), not the spec's "forward" — direction can't be claimed
  without knowing facing. Facing-detection from heel/toe is a possible Phase 2 add.

### Phase 2 (next build cycle)
**early-hip-rise cue** (hip-vs-bar vertical rate — net-new insight pose unlocks) + the **toggleable
skeleton overlay** + the one-time **build slider** (widens tolerances only). Guardrails unchanged
(report §5–§7): body type only *widens tolerances*, never prescriptive verdicts; never spine/3D from 2D.

**UX: make the pose work visible even on a good rep (JP feedback 2026-06-29).** Phase 1's cue is
*conditionally* surfaced — it only appears when plate-sized AND drift ≥5 cm — so a clean or
uncalibrated rep looks identical to Phase 0 and the user can't tell the pose pass did anything.
Rework so the **threshold gates TONE, not visibility**: once a plate is sized, always show a
midfoot card — a positive "✓ Bar stayed over midfoot (drifted only N cm)" for small drift, and the
amber "Bar drifted N cm off midfoot" nudge at/above threshold. Keep uncalibrated silent (still no
real number). Also revisit the **5 cm flag** — it's a report heuristic (~2 in, "above landmark
noise"), not empirically tuned; pick the on/off-tone boundary from real clips. `analyzeBarDrift`
already takes `opts.flagCm`, so the threshold is one call-site change.

Design report (source of truth for the roadmap): `docs/body-analysis-exploration.md` (PR #3).
Spike spec: `docs/superpowers/specs/2026-06-29-pose-spike-design.md`.

Also still pending (smaller): **device-test** the Phase 0 cm calibration + peak/avg readout on
a real side-on deadlift clip (the pose spike used a clip but didn't exercise the cm flow).

## What this is
A fully **client-side** web app that tracks a barbell's bar path in a lifting video
(squat/deadlift) using **OpenCV.js** optical flow. You tap the weight plate on the start
frame, it tracks that point through the clip, draws the path over the video, lets you
review it (play/pause/scrub/slow-mo), and export an overlaid `.mp4`.

- **Live:** https://jplikescoding.github.io/bar-path/
- **Repo:** https://github.com/jplikescoding/bar-path (GitHub: `jplikescoding`)
- **Deploy:** push to `master` → GitHub Actions (`.github/workflows/deploy.yml`) builds and
  publishes to GitHub Pages automatically. Vite `base: './'`.

## Status: v1 is DONE and working (verified on real footage)
- Tap-to-track optical flow ✅ · processing pass ✅
- Review screen: **play/pause, scrubber, slow-mo (1×/0.5×/0.25×)**, progressive trail
  (line draws as the bar moves, bright→gray fade, red marker rides the bar) ✅
- **Export** to an overlaid `.mp4` (line baked in; records at normal speed) ✅
- Setup: tap plate (= start), "Set end here" trim, Reset, no auto-play ✅
- Removed the confusing manual "vertical reference" button; an auto orange plumb line
  at the start-x remains.

## Tech stack & key files
- Vite + TypeScript (strict, `noEmit:true` — Vite bundles; create only `.ts`), Tailwind,
  Vitest (unit tests for pure logic only), OpenCV.js (vendored at `public/opencv.js`).
- `src/app.ts` — `App` screen router (`register`/`go`/`reset`). Screens in `src/screens/`.
- `src/state.ts` — `AppData` (videoEl, seed, startTime, endTime, verticalAngleRad, path).
- `src/geometry.ts` — PURE math (smoothing, drift, tilt rotate). **Tested.**
- `src/opencv.ts` — loads OpenCV (see gotchas below).
- `src/tracker.ts` — Lucas-Kanade cluster tracker. `src/capture.ts` — rVFC playback loop.
- `src/overlay.ts` — `drawReview` (progressive trail), `drawOverlay`/`drawPath` (export).
- `src/exportVideo.ts` — MediaRecorder export.
- `prototype/` — original Python LK validation.

## OpenCV.js gotchas (HARD-WON — do not re-trip these)
1. Use a **single-threaded** build. Threaded builds need SharedArrayBuffer (COOP/COEP
   headers GitHub Pages can't send) → init hangs forever. We vendored **4.9.0** (4.8.0 was
   threaded and hung). Check with `grep -c 'pthread' public/opencv.js` (low = good).
2. This build's `window.cv` is a **Promise/thenable that NEVER settles**. Use
   `Module.onRuntimeInitialized` (registered BEFORE injecting the script) to detect ready.
3. Resolving a JS Promise *with* `window.cv` makes it **adopt that dead thenable and hang** —
   strip `cv.then` before resolving. (Both handled in `src/opencv.ts`.)
4. It's ~10MB and parsing it **blocks the main thread**, so load it only on the processing
   screen (not on page load or the interactive setup screen).
5. iOS WebKit: `drawImage()` from a `<video>` that was never played returns a **black frame**.
   So screens show the **native `<video>` element** with a transparent canvas overlaid for
   the path/markers (not canvas-painted frames). The video stays mounted during tracking.

## Testing (this is how to self-verify without a phone)
- Unit tests: `npm test` (pure geometry/logic; jsdom can't run OpenCV/canvas/video).
- E2E harness: `scripts/*.mjs` (Playwright, **gitignored — local only**). Drive the built
  app in **Edge** (channel `msedge`, HEADED — headless doesn't fire requestVideoFrameCallback;
  bundled Chromium/WebKit lack H.264 so can't decode the `.mp4` test clips). It uploads a real
  clip, taps the plate, tracks, and screenshots/inspects results. Kill stray `msedge`/`node`
  between runs; use a fresh `--port` each run.
- Real device testing is JP's: he tests on **iPhone Safari, Private tab** (Private avoids the
  Pages HTML cache so he gets the latest deploy).

## DONE: Saved Library + PWA install (both merged to master)
PR #1 (saved library) and PR #2 (PWA install) were reviewed, verified (17/17 tests,
build green), and merged 2026-06-24. Both cloud branches are merged.
- **Device-test checklist (JP):** save a lift → see in library → reopen → delete →
  survives reload; Add to Home Screen → launches standalone; offline reload works.

## DONE: Review-screen polish round (master, 2026-06-24, commit 99cd223)
Iteration from device testing. Files: `state.ts`, `result.ts`, `library.ts`. No change to
tracking/export logic. 17/17 tests, build green.
- **Audio:** speaker toggle on the review screen (`#sound`), default muted; unmutes on play,
  applies live at any speed.
- **Naming:** Save opens an inline prefilled name field before persisting; library rows have
  a per-row ✎ inline rename.
- **Drift clarity:** relabelled "Drift from plumb" → **"Side-to-side travel"** + caption
  "lower number = straighter path" + a toggleable ⓘ explainer (peak spread = farthest-left↔
  farthest-right = `left + right`, not an average; units are video px).
- **Saved-lift navigation fix:** reopening a saved lift was a dead end. `AppData.savedId`
  now tracks whether the result is a saved lift; result actions are context-aware —
  **saved** = Library (back) / Export / Delete; **fresh** = Save / Export / New. Library
  reopen and post-save both set `savedId`.
- **Device-test checklist (JP):** hear audio, name + rename a lift, reopen → Back/Delete work,
  toggle the ⓘ explainer.

## DONE: Phase 0 — cm bar-drift (master, 2026-06-25)
First slice of the body-analysis roadmap. Drift now reads in **real centimeters** when the
user sizes a plate. No pose yet. 19/19 tests, build green. Files: `geometry.ts` (+`pxToCm`,
`PLATE_DIAMETER_CM=45`, tested), `state.ts`/`librarySupport.ts` (+`plateDiameterPx`),
`setpoint.ts`, `result.ts`, `library.ts`.
- **Scale capture = option 2 + optional drag:** on setup, tap the bar plate as before
  (tracking unchanged); *optionally* drag from there to the plate's rim → captures the plate
  pixel diameter (amber dashed circle), "Scale set ✓". Plain tap = today's behavior, px.
- **cm everywhere when calibrated:** result headline + L/R + library subtitle switch px→cm;
  explainer updates. Saved lifts persist `plateDiameterPx`; old/uncalibrated lifts stay px.
- **Metric:** peak extremes (`horizontalDrift` range/left/right) unit-converted via
  `pxToCm(px, plateDiameterPx)` (45 cm plate ruler). **+ Average (2026-06-25):**
  `horizontalDrift` now also returns `meanAbs` (mean |x−refX| over the rep); result card
  shows the big number as **peak** plus an **"avg N cm from plumb"** line.
- **Assumption:** ruler = 45 cm (standard/bumper plate). Smaller iron plates would mis-scale;
  a plate-size picker is a possible later add.
- **Device-test (JP):** size a plate on a real side-on deadlift clip → sensible cm drift.

## Body analysis exploration → PR #3 (MERGED)
Overnight remote-agent research. Report at `docs/body-analysis-exploration.md`
(~5.7k words, doc-only). See "START HERE" at the top for the verdict + roadmap. Key pose finding:
**MediaPipe Tasks Vision "Pose Landmarker"** runs on iOS Safari with NO SharedArrayBuffer
(single-thread WASM + WebGL), Apache-2.0, ~6–9 MB on top of OpenCV, ~15 FPS mid-iPhone;
fallback TF.js MoveNet Lightning. Hard rule the report sets: body type only *widens
tolerances*, never *generates verdicts*; never ship spine-rounding "safety" claims or 3D
joint angles from 2D video.

## Design: "Precision Instrument" identity (2026-06-24)
Whole UI reskinned around the measurement-instrument concept. Deep graphite ground
(`--bg #0b0e11`), chalk text, and **amber `#FFB020`** (from the plumb line) as the
ONE action color — rule of thumb: *color = data, amber = action*. Numeric readouts
use self-hosted **IBM Plex Mono**; headings use **Space Grotesk**. Signature elements:
the plumb-line-vs-drifting-path glyph and the result screen's drift-from-plumb gauge.
- Tokens + components live in `src/style.css`; fonts in `src/fonts/*.woff2`.
- **Fonts MUST be referenced relatively in CSS** (`url('./fonts/…')`) so Vite hashes
  and rebases them for the GitHub Pages `base:'./'` subpath. An absolute `/fonts/…`
  404s under `/bar-path/`. They're runtime-cached by the SW (not in its precache list).
- SW now does **network-first for HTML navigations** (cache `bp-v2`) so fresh deploys
  show immediately; assets/fonts/opencv stay cache-first for offline.

## Backlog / future
1. **Side-on test** — JP films a set from directly to the side (true forward/back drift; his
   current clips are end-on so forward/back is invisible).
2. **UI polish** — DONE (Precision Instrument design pass, see above). Future: a
   real loading/skeleton state, transitions between screens, a velocity graph.
3. **Saved library** — DONE (merged).
4. **v2: body/pose tracking** + toggleable on/off **analysis cues** during the rep showing
   *where* form broke down (JP's idea). Scoped in PR #3; **Phase 0 (cm drift) DONE**. Next is
   the average metric (#6), then pose cues (Phase 1 — see "START HERE"). Squat coaching still
   needs a side-on filming prompt first (backlog #1).
5. Possible later: velocity graph synced to playback (like one reference app), draw tools.
6. **Drift metric: average option** — the result screen shows *peak* side-to-side travel
   (extremes: farthest-left↔farthest-right = `left + right`). JP wants an **average**
   deviation too (mean horizontal distance from plumb), likely as a toggle between
   peak/average rather than replacing peak. `geometry.horizontalDrift` would gain a
   mean field. Deferred 2026-06-24.

## Reference apps JP wants to emulate
Iron Path (saved-clip library + play/slow-mo) and a richer one (scrubber + slow-mo + velocity
graph + draw tools). The review UX is modeled on these.
