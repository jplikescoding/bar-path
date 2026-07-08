# Bar Path Tracker — Handoff / Status

Last updated: 2026-07-07 (Phase 3 side-on squat coaching BUILT on `feat/phase3-squat-coaching`,
PR open awaiting JP review + device test; sticky review stage PR #8 merged 2026-07-07).

## ►► Phase 3 — side-on squat coaching (PR open, NOT merged, untested on device)

Built per report §7 Phase 3 (spec `docs/superpowers/specs/2026-07-07-phase3-squat-coaching-design.md`,
plan `docs/superpowers/plans/2026-07-07-phase3-squat-coaching.md`):

- **Lift prompt (setup screen):** chips `Deadlift · Squat` under the hint; Deadlift is the
  default and that flow is completely unchanged (zero new taps). Picking Squat asks inline:
  *"Filmed from the side?"* → `Side-on` / `Not side-on`.
- **The gate:** a squat NOT confirmed side-on gets **no pose pass and no pose cues** — end-on
  squat faults live on the depth axis (report risk #2), so the result screen shows one quiet
  "Film from the side to unlock squat cues" card instead. Bar path / gauge / velocity still
  render (honest end-on data). Unanswered = gated.
- **Side-on squat cues:** bar-over-midfoot (same `analyzeBarDrift`, squat wording "out of the
  hole"), hip timing (`analyzeHipRise` `opts.lift:'squat'` — the judged ascent anchors at the
  bar's DEEPEST point / hole exit, not the deadlift floor anchoring), and **Depth** — a
  measurement-only chalk card (`analyzeSquatDepth`: hips below/level/above knee height at the
  deepest bar moment, cm when calibrated, median over `DEPTH_WINDOW_S`). Depth is NEVER amber
  and never prescriptive — "hit depth" nudges are the report's false-positive trap (§4.3).
- **Facing detection (`detectFacing`):** heel/toe x-ordering (median over frames, needs
  `FACING_MARGIN`) upgrades drift copy to *"drifted 6 cm **forward** off midfoot"* — deadlifts
  too. Self-gates: end-on feet point at the camera → null → generic wording. 2D x-order only, no
  depth/3D claims.
- **Persistence:** `liftType` / `sideOn` / `depthCue` thread `state.ts` → save → `librarySupport.ts`
  → library reopen (older records default to deadlift). Library subtitle prefixes squat rows.
- Guardrails held: at most ONE amber per review (hip still demotes when drift nudged; depth never
  amber); no spine/safety claims; silence whenever pose is weak. All new math is pure in
  `coach.ts`, unit-tested (65 tests green).

### ►► JP device-test checklist — Phase 3 (iPhone Safari, Private tab, after merge)
- [ ] **Deadlift regression:** run a deadlift clip WITHOUT touching the new chips — identical
      flow and cards to before (midfoot cue, hip timing, skeleton, speed).
- [ ] **Prompt:** tap Squat on setup → "Filmed from the side?" appears; answers toggle amber;
      switching back to Deadlift hides it.
- [ ] **End-on squat (your existing clips), Squat + "Not side-on":** processing skips the body
      pass (faster), result shows the quiet "Film from the side" card, NO midfoot/hip/depth
      cards, but gauge + velocity still there.
- [ ] **Side-on squat (film one), Squat + "Side-on", plate sized:** midfoot card reads "out of
      the hole" wording; hip timing judges the ascent from the hole (tap seeks there); **Depth**
      card in chalk (never amber) says hips below/at/above knee level with a sane cm number —
      tap seeks the bottom.
- [ ] **Facing copy:** on a clean side-on clip the drift card should read "forward"/"backward"
      off midfoot (falls back to generic wording if feet aren't clearly seen).
- [ ] **One amber max:** if the drift nudge fires, the hip card must read chalk, not amber;
      depth card is never amber.
- [ ] **Save → reopen from library:** squat rows show "squat · drift …"; reopened lift keeps
      squat wording + depth card; old saved lifts still open as deadlifts.

## ►► START HERE next session
**Everything through Phase 2 is MERGED and LIVE** (PRs #4–#7, deploys green). Shipped overnight
2026-07-02 (plan: `docs/superpowers/plans/2026-07-02-overnight-phase2-delight.md`):

- **Phase 1 (bar-off-midfoot cue)** — merged as validated on-device (PR #4).
- **Phase 1.5 — all four device-test findings fixed (PR #5):** midfoot = **heel↔toe midpoint**
  (ankle dropped, heel bias gone) · **threshold gates TONE not visibility** (calibrated clips
  always get a midfoot card — green "Bar path ✓" under 5 cm, amber nudge at/above; uncalibrated
  still silent) · **post-save New** action (Library/Export/New/Delete grid) · scale-capture
  **redo hint + persistent "· scale ✓"** status on the trim readout.
- **Phase 2 (PR #6):** pose pass stores slim per-frame landmarks (`AppData.poseFrames`, z dropped) ·
  **early-hip-rise cue** (`analyzeHipRise`, pure: hip-rise ÷ bar-rise over the bar's first 25% of
  ROM; unitless → works uncalibrated; fires ≥1.5×; positive green card when clean — silence only
  when pose can't see the pull) · **toggleable skeleton overlay** (chalk bones synced to scrub,
  amber hips during a fired window, dims low confidence, hides across >0.35s pose gaps) · all
  persisted with saved lifts. **At most one amber cue per review** (report §5.4): hip demotes to
  chalk if the drift nudge fired. Build slider DEFERRED (needs JP's UX call; it only widens
  thresholds — one-line once wanted).
- **Velocity graph + polish (PR #7):** `verticalVelocity` (pure) + a **Bar speed card** — peak
  concentric m/s when calibrated (real VBT numbers), live now-value, amber cursor riding playback,
  tap/drag the graph to seek · **~22 MB off the deploy** (unused `vision_wasm_module_internal`
  pair removed; pose-smoke verified the kept pair loads) · `rise` screen-enter on processing.

**Three hard-won runtime lessons (do not re-trip):**
1. **MediaPipe VIDEO mode is stateful — cold starts miss a bent-over lifter.** The person
   *detector* fails on the setup crouch; the *tracker* follows fine once locked upright. The pose
   pass therefore starts `POSE_WARMUP_S` (2 s, in `coach.ts` with the other tuning knobs) before
   the trim start and discards warm-up frames. Without this the hip cue was silent on a real
   trimmed rep (pose lost for the entire early pull).
2. **Orphaned-retap race (fixed):** a tracking loss on the clip's final frames raced the
   'ended'-driven finish of pass 1 — the dangling re-tap paused the video under the pose pass and
   froze processing forever. `reTap` is a no-op once `pass1Over`.
3. **Hip-rise window anchoring:** the pull start is the LAST bottom-level point before the ascent
   (bar can sit in setup for seconds; clips often end with the bar set down lower than it started).

### ►► JP device-test checklist (iPhone Safari, Private tab; app is live)
- [ ] Clean **calibrated** rep → green "Bar path ✓ — stayed over midfoot" card (chalk tick/marker);
      drifty rep → amber nudge. Only ever ONE amber card at a time.
- [ ] **Hip timing** card on a trimmed side-on rep: ratio sane, tap seeks to the moment, green
      positive card on a clean pull. Untrimmed multi-rep clips may stay silent (it judges the
      ascent to the bar's highest point — trim to one rep).
- [ ] **Skeleton** chip: bones track the body, hide when pose loses you, amber hips at a fired moment.
- [ ] **Bar speed** card: peak m/s plausible (~0.3–1.2 for real pulls), cursor rides playback,
      tap/drag the graph seeks. Uncalibrated shows px/s.
- [ ] Post-save **New**; scale **redo** hint + "· scale ✓"; processing takes ~2 s longer than
      before (pose warm-up) — acceptable?
- [ ] **Airplane-mode reload** still works after the wasm removal (SW may serve a stale cached
      pair on old installs — a fresh Private-tab load exercises the new set).
- [ ] Save → reopen from library: cue cards + skeleton + velocity all intact; old records fine.

### Next build cycle (in order)
1. **Phase 2 validation/tuning on JP's clip library** — heel↔toe weighting, the 5 cm drift flag,
   hip-rise `fireRatio`/`windowFrac`/`POSE_WARMUP_S` (all in `coach.ts` opts/consts). Pipeline
   validation works on roughly-side clips; absolute-cm needs square side-on (tripod pending).
   Phase 3 added more knobs to the same sweep: `FACING_MARGIN`, `DEPTH_WINDOW_S`,
   `DEPTH_LEVEL_BAND_FRAC`, and the squat hip-rise `fireRatio` (currently shared 1.5×).
2. **Build slider** (one-time, skippable, widens tolerances only — report §5.1) once JP wants it.
3. ~~Phase 3 (report §7): side-on squat coaching behind an angle prompt~~ — **BUILT** (PR open,
   see the Phase 3 section at the top; awaiting JP review + device test on a real side-on squat).
   Explicitly cut from the slice: knee valgus (separate front-on capture per the report) and
   auto side-on detection from plate circularity (manual prompt is the Phase 3 mechanism).

Design report (source of truth): `docs/body-analysis-exploration.md` (PR #3).

### Known / deferred
- **Tilt-correction parity:** cue + skeleton are computed/drawn on the UNROTATED frame;
  `verticalAngleRad` is dormant (always null). If re-enabled, rotate cue path, midfoot ref AND
  skeleton landmarks together (notes in `processing.ts` + `overlay.ts`).
- A cosmetic 404 fires mid-flow in the local harness (not on page load; likely favicon/sourcemap);
  pre-existing, no functional impact.
- Multi-rep clips: hip cue judges the ascent to the bar's highest point; midfoot cue uses the whole
  trimmed range. The app's model remains "trim to one rep".

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
  between runs; use a fresh `--port` each run (a stale preview server on the port makes vite
  hop ports and the harness time out).
- **`scripts/e2e-phase2.mjs`** is the full-feature run: scrubs to a mid-clip rep, drags the
  plate scale, tracks (both passes), asserts cue cards/skeleton chip/saved actions, saves,
  reopens from the library, and dumps `scripts/hip-dump.json` (raw path + poseFrames) for
  offline analysis of the pure functions. `scripts/debug-hip.mjs` is the lighter probe.
  `window.__app` is exposed by `main.ts` for these scripts.
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

## Phase 1 device-test UX findings (JP, 2026-06-29) — ALL FIXED in PR #5 (2026-07-02)
1. **Scale capture — discoverability, not mechanic.** JP first thought the tap-then-drag-to-rim
   gesture was unusable, then reconsidered after learning it: click-drag works, and you redo by
   drawing a new circle. So the earlier "decouple place/size/reposition" redesign is NOT wanted —
   keep the click-drag. Real gap is **discoverability**: no hint that you can drag to size or
   redraw to redo, and the dot doubles as the tracking seed. Lightweight fix: an on-screen hint
   / "redo scale" affordance, not a rebuild. (`src/screens/setpoint.ts`.) LOWER priority than #2.
2. **Post-save dead end.** After Save, result actions are Library / Export / Delete — no "New", so
   you can't start a fresh analysis without round-tripping. Add a New affordance to the saved state
   (or a clear path from the library screen). (`src/screens/result.ts` `renderActions`, saved branch.)
3. **Surface the pose work on a good rep** (see Phase 2 UX note above) — clean/uncalibrated reps look
   identical to Phase 0, so the feature feels absent. Threshold should gate tone, not visibility.
4. **Midfoot estimate is heel-biased** (validated on a real clip, JP 2026-06-29 — cue otherwise
   landed great, fired 12.8 cm). `midfootXFromFrame` averages ankle+heel+toe landmarks; the ankle
   sits over the heel, so the line lands slightly behind true midfoot (toward the heel). **Fix:**
   use the **heel↔toe midpoint, drop the ankle** (`coach.ts` `FOOT_LANDMARKS` / averaging) — shifts
   the line forward toward the laces and lowers the cm a touch (more accurate). Principled (anatomy,
   not one-clip overfit); confirm exact weighting across JP's clip library in Phase 2.

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
5. Velocity graph synced to playback — DONE (PR #7, 2026-07-02). Draw tools still possible later.
6. **Drift metric: average option** — the result screen shows *peak* side-to-side travel
   (extremes: farthest-left↔farthest-right = `left + right`). JP wants an **average**
   deviation too (mean horizontal distance from plumb), likely as a toggle between
   peak/average rather than replacing peak. `geometry.horizontalDrift` would gain a
   mean field. Deferred 2026-06-24.

## Reference apps JP wants to emulate
Iron Path (saved-clip library + play/slow-mo) and a richer one (scrubber + slow-mo + velocity
graph + draw tools). The review UX is modeled on these.
