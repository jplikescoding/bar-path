# Phase 1 — Deadlift "bar-off-midfoot" cue (pose-integration phase)

*Design spec for Bar Path Tracker. Source of truth for the feature: `docs/body-analysis-exploration.md` (PR #3). Pose feasibility: GO — see `memory/pose-spike-verdict.md` and `HANDOFF.md`. This spec covers Phase 1 only.*

## Goal & framing

Ship the report's Phase 1: a single, high-confidence, build-independent deadlift cue — **"bar drifted N cm forward off your midfoot"** — computed from the existing bar path plus a pose-derived midfoot reference, calibrated to centimeters by the 45 cm plate.

The user's goal is "extract real insight on lift data and advise the user." We thread that against the report's #1 guardrail (never over-claim from 2D pixels) as follows: **the insight is precise, calibrated measurement; the advice is one calm nudge attached to it — never a verdict, diagnosis, or body-type prescription.**

Phase 1 is deliberately scoped as **"the pose-integration phase that happens to ship one cue."** The coaching logic is small and low-risk; the real work and risk are the plumbing: vendoring MediaPipe same-origin, running a pose pass in the processing pipeline within budget on a real iPhone, and confirming the foot landmark is usable. Bar-off-midfoot is the right first cue because it leans least on pose reliability (one reference line, with a plate-tap fallback) and carries zero mis-coaching risk.

## Decisions (locked during brainstorming)

1. **One cue, done well** — deadlift bar-off-midfoot only. Early-hip-rise, skeleton overlay, and the build/body-type slider are Phase 2+.
2. **Reference line = pose midfoot, with plate-tap fallback.** Use the pose foot/ankle landmark when its confidence is strong across the rep; otherwise fall back to the plate-tap start-x line the app already captures; if neither is trustworthy (end-on clip / too few confident frames), stay silent.
3. **Cue visual = card + tappable scrub tick + a minimal amber drift line.** At the peak-drift frame only, draw the midfoot reference line and the bar-to-midfoot gap in amber. No skeleton (that is Phase 2). Seeing the drift — not just reading the number — is what makes the insight land, and it reuses the existing canvas overlay.
4. **Pose runs as a SECOND pass**, separate from the LK tracker, with lenient sampling. The shipping tracker is untouched.

## Architecture & data flow

One new pose pass slots in after the existing tracker pass; one new pure module computes the cue; the result screen renders it.

```
processing screen:
  pass 1 (UNCHANGED)  playAndProcess → LK tracker → AppData.path        (bar path, dense)
  pass 2 (NEW)        pose-pass loop → pose.detect(video, tMs) per frame
                          → collect camera-side foot landmark x per high-confidence frame
                          → robust median → AppData.poseMidfoot
  then (pure)         coach.analyzeBarDrift(path, midfoot, plateDiameterPx, plumbX)
                          → BarDriftCue | null  → AppData.cue
result screen:
  cue card + amber scrub tick at cue.frameT + amber drift line drawn at that frame
```

### Why a second pass (not one combined pass)

The pose spike measured **~37 ms/frame** on JP's iPhone. Real-time 30fps gives a **~33 ms/frame** budget, so pose *alone* already exceeds real-time; bolting it onto the OpenCV LK tracker + per-frame RGBA→gray in one decode loop would overrun the frame interval. The processing pass is driven by `requestVideoFrameCallback`, which only fires for *presented* frames — so an overrun does not merely slow the pass, it **silently skips frames**, corrupting the analysis. A second pass keeps each loop within budget and leaves the shipping tracker completely untouched (lower risk). Wall-clock is ~2× over a clip that is only a few seconds, run offline — an acceptable trade. (This is the report's "split if profiling shows overrun" path; the spike numbers already show the overrun.)

### Why lenient pose sampling is fine

For this cue we need the **midfoot x**, and in a deadlift the feet are planted and nearly stationary for the whole rep. So we do not need a dense, every-frame pose track. We run pose at whatever rate it naturally hits (~15fps is plenty) and collapse the camera-side foot landmark to **one robust value — the median x over the high-confidence frames**. This turns per-frame landmark jitter into a single stable reference, and means frame-skipping in the pose pass does not hurt the result. The *bar* path stays dense (from pass 1); only the near-constant *reference line* comes from pose.

## New & changed files

```
public/mediapipe/…        NEW   vendored wasm runtime + pose_landmarker_lite.task,
                                same-origin (mirrors public/opencv.js) → offline, no CDN/third-party dep
src/pose.ts               EDIT  point BUNDLE / WASM / MODEL at the vendored same-origin paths
                                (currently CDN); keep the lazy single-load PoseApi shape as-is
src/coach.ts              NEW   PURE, unit-tested (like geometry.ts).
                                analyzeBarDrift(...) → BarDriftCue | null. Body type NOT involved this phase.
src/screens/processing.ts EDIT  after the tracker pass: lazy-load pose, run the pose pass,
                                compute the cue, store poseMidfoot + cue on AppData
src/state.ts              EDIT  AppData += poseMidfoot?: {x:number; frames:number; conf:number} | null;
                                cue?: BarDriftCue | null
src/overlay.ts            EDIT  drawReview() optionally draws the midfoot line + bar-to-midfoot gap
                                in amber, only at cue.frameT
src/screens/result.ts     EDIT  cue card (Precision-Instrument style) + tappable amber scrub tick at cue.frameT
src/librarySupport.ts     EDIT  persist cue (+ midfoot x) so saved lifts reopen with the cue intact
```

`pose.ts` keeps the lazy single-load pattern it already has (mirrors `opencv.ts`), so the ~6–9 MB model is fetched only on the processing screen, never on first paint. `coach.ts` stays pure like `geometry.ts`, so the cue logic is deterministically unit-tested without a browser. The ~6–9 MB model is **lazily cached on first use** by the service worker, **not** added to the install precache (same reasoning that keeps OpenCV off the landing path).

## The `coach.ts` contract

```ts
export interface BarDriftCue {
  driftCm: number | null               // null when no plate scale → present px instead
  driftPx: number
  frameT: number                       // mediaTime of peak drift → scrub tick + drift line
  refX: number                         // the midfoot line we measured against
  refSource: 'pose-midfoot' | 'plate-tap'
  confidence: 'ok' | 'low'
}

// midfoot: robust median of the camera-side foot landmark x over high-confidence
// frames, plus how many frames contributed and an aggregate confidence; null if
// pose was too weak. plumbX: the plate-tap start-x fallback reference.
export function analyzeBarDrift(
  path: PathPoint[],
  midfoot: { x: number; frames: number; conf: number } | null,
  plateDiameterPx: number | null,
  plumbX: number,
): BarDriftCue | null
```

Logic:
- Choose `refX`: pose midfoot if `midfoot` is present and strong (enough contributing frames, aggregate confidence above a floor); else `plumbX`. Record which in `refSource`.
- Reuse `horizontalDrift(path, refX)` for the peak excursion; scan `path` for the frame `t` with the largest `|x − refX|` → `frameT`.
- Convert to cm via `pxToCm(driftPx, plateDiameterPx)` when calibrated; otherwise `driftCm = null` and the UI shows px.
- **Return `null`** (no cue) when drift is below the flag threshold, or when geometry/confidence is untrustworthy. Silence is a valid and frequent output.

The function is total and pure: same inputs → same `BarDriftCue | null`, no I/O, no globals.

## Guardrails, thresholds, confidence

- **Flag threshold:** drift ≥ **5 cm** (≈ 2 in), build-independent — a coaching-meaningful forward drift well above landmark noise. Below threshold → return `null`, no cue. For uncalibrated (px-only) clips, use a conservative px-equivalent threshold and present px.
- **Silent when untrustworthy:** if the clip looks end-on (no plate sized, or a future plate-roundness signal) or too few confident foot frames contributed, emit no cue — optionally a quiet *"Film side-on to check bar drift."* **Never a wrong number.**
- **Pose is strictly additive:** if pose load or inference fails entirely, the app behaves exactly as today (bar path only). The cue degrades pose-midfoot → plate-tap line → nothing.
- **Tone:** one mono readout (`"Bar drifted 6 cm forward off midfoot"`) + one encouraging line (`"Keeping it over midfoot will feel stronger off the floor."`). No verdict, no medical claim, no body-type prescription. At most one cue per review, with a positive frame.

These directly honor the report's hard guardrails (report §5–§7): body type only ever *widens tolerances* (and is absent entirely this phase), never emits prescriptive verdicts; the app never claims spine-rounding or 3D joint angles from 2D video.

## iOS / engineering constraints to respect

- **No SharedArrayBuffer:** MediaPipe Tasks Vision (single-thread WASM + WebGL delegate) satisfies this — already proven by the spike. Keep the GPU(WebGL) delegate with a CPU/Lite fallback ladder.
- **Black-frame gotcha:** the pose pass must read from the **played native `<video>`** during processing (as the existing capture loop does), never a never-played paused frame.
- **VIDEO-mode timestamps:** `detectForVideo` requires strictly increasing timestamps; drive the pose pass with a monotonic timestamp, not a possibly-repeating `mediaTime`.
- **Memory:** keep only landmark numbers / the derived midfoot, not retained frame bitmaps; delete any pose input bitmaps promptly (OpenCV `Mat`s are already deleted per frame in pass 1).

## Test plan

- **Unit — `coach.test.ts` (jsdom-safe, pure):**
  - fires when synthetic drift ≥ 5 cm; silent when < 5 cm;
  - selects pose-midfoot when strong, plate-tap fallback when pose is null/weak (asserts `refSource`);
  - px-only path when `plateDiameterPx` is null (`driftCm === null`);
  - `frameT` equals the frame of peak `|x − refX|`;
  - returns `null` on empty / garbage input (total & safe).
- **Build/lint:** `npm test` green; `tsc` clean (strict).
- **Device (JP, iPhone Safari, Private tab):**
  - real side-on deadlift → sensible cm drift; tick seeks to the visibly worst frame; the amber drift line is drawn at the right place;
  - pose loads only on the processing screen (not first paint);
  - a clean rep stays silent (no false cue);
  - airplane-mode reload still works (vendored model offline);
  - existing bar-path-only flow unaffected when pose is toggled off / fails.

## Explicitly NOT in this phase

Early-hip-rise cue · full toggleable skeleton overlay · build/body-type slider · any squat coaching · any lumbar/spine or 3D-angle claim. All deferred to Phase 2+ per the report's phased plan.
