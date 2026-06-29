# Phase 1 — Deadlift bar-off-midfoot cue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single high-confidence deadlift cue — "bar drifted N cm off midfoot" — computed from the existing bar path plus a pose-derived midfoot reference, calibrated to cm by the 45 cm plate, surfaced as a cue card + a tappable peak-drift moment with a minimal amber drift line.

**Architecture:** A second, pose-only decode pass runs after the existing (untouched) optical-flow tracker pass on the processing screen. It reduces the camera-side foot landmarks to one robust midfoot x. A new pure module `coach.ts` fuses that midfoot x with the bar path to produce a `BarDriftCue | null`. The result screen renders the cue card, a scrub tick, and (only at the peak frame) an amber midfoot line + bar-to-midfoot gap. Pose is strictly additive: any failure falls back to the plate-tap line, then to no cue, and the app behaves exactly as today.

**Tech Stack:** Vite + TypeScript (strict, `noEmit`), Vitest (pure logic only), MediaPipe Tasks Vision Pose Landmarker (Lite, vendored same-origin), existing OpenCV.js LK tracker.

## Global Constraints

- **100% client-side**, GitHub Pages, `base: './'`. No backend, no server inference.
- **No SharedArrayBuffer.** MediaPipe single-thread WASM + WebGL(GPU) delegate only; CPU/Lite fallback ladder.
- **Vendor MediaPipe same-origin** under `public/mediapipe/` (like `public/opencv.js`). No CDN at runtime. The ~6–9 MB model is **lazily cached on first use** by the existing SW fetch handler — do NOT add it to the SW `SHELL` precache.
- **Lazy-load pose only on the processing screen** (never on first paint), mirroring `loadOpenCV()`.
- **Black-frame gotcha:** read pose from the **played native `<video>`** during the pass, never a never-played paused frame.
- **VIDEO mode needs strictly increasing timestamps** — drive `detect()` with the rVFC `now` timestamp.
- **Guardrails (report §4–§7):** build-independent cue only; no body-type input this phase; no verdict, no medical/ spine/3D claim; **silence is a valid, frequent output** — never a wrong number.
- **Pure logic in `coach.ts`** (like `geometry.ts`), unit-tested; no DOM/globals/I/O.
- Tests live in `test/*.test.ts`, import from `../src/...`. Run with `npm test`. Type-check with `npx tsc --noEmit`.
- Plates ruler = `PLATE_DIAMETER_CM = 45` (from `geometry.ts`); reuse `pxToCm` and `horizontalDrift`.
- Existing AppData fields are required-with-null (house style); follow it.

---

## File Structure

```
public/mediapipe/                 NEW  vendored vision_bundle.mjs + wasm/ + pose_landmarker_lite.task
src/pose.ts                       EDIT repoint BUNDLE/WASM/MODEL to vendored same-origin URLs
src/coach.ts                      NEW  PURE: midfootXFromFrame, robustMidfoot, analyzeBarDrift (+ types)
src/capture.ts                    EDIT add playFrames() — pose-pass loop, no OpenCV
src/state.ts                      EDIT AppData += poseMidfoot, cue; initialData inits both null
src/screens/processing.ts         EDIT after tracker pass: run pose pass, compute cue, store on AppData
src/overlay.ts                    EDIT add drawDriftMarker(ctx, path, cue)
src/screens/result.ts             EDIT cue card + scrub tick + draw marker at peak frame
src/librarySupport.ts             EDIT SavedAnalysis += cue, poseMidfoot (optional)
src/screens/library.ts            EDIT reopen() carries cue + poseMidfoot back onto AppData
test/coach.test.ts                NEW  pure unit tests for coach.ts
```

**Testing reality (from HANDOFF §Testing):** jsdom cannot run OpenCV/canvas/video/MediaPipe. Only **pure logic is unit-tested** — that is `coach.ts` (Task 2). Every other task is verified by `npx tsc --noEmit` + `npm run build` (green) and listed **device checks (JP, iPhone Safari, Private tab)**. This matches the project's established practice; do not invent jsdom tests for DOM/video code.

---

## Task 1: Vendor MediaPipe same-origin + repoint `pose.ts`

**Files:**
- Create: `public/mediapipe/vision_bundle.mjs`, `public/mediapipe/wasm/*`, `public/mediapipe/pose_landmarker_lite.task`
- Modify: `src/pose.ts:6-11` (the three URL constants), `package.json` (devDependency for sourcing the files)

**Interfaces:**
- Consumes: nothing.
- Produces: `loadPose(): Promise<PoseApi>` (unchanged signature from the spike) now loading from `./mediapipe/…`. `PoseApi.detect(video, timestampMs): Landmark[][]`, `Landmark { x; y; z; visibility? }` (already exported by `src/pose.ts`).

- [ ] **Step 1: Add the source package (dev-only) and vendor the assets**

The runtime has no third-party dependency — these files are copied into `public/` and served same-origin. The npm package is dev-only, used solely to obtain and pin the exact 0.10.35 files (the version the spike validated).

Run (Bash tool; from repo root):
```bash
npm i -D @mediapipe/tasks-vision@0.10.35
mkdir -p public/mediapipe
cp node_modules/@mediapipe/tasks-vision/vision_bundle.mjs public/mediapipe/vision_bundle.mjs
cp -r node_modules/@mediapipe/tasks-vision/wasm public/mediapipe/wasm
curl -L -o public/mediapipe/pose_landmarker_lite.task \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
```

- [ ] **Step 2: Verify the assets landed**

Run:
```bash
ls -la public/mediapipe public/mediapipe/wasm
test -s public/mediapipe/pose_landmarker_lite.task && echo "model OK ($(wc -c < public/mediapipe/pose_landmarker_lite.task) bytes)"
```
Expected: `vision_bundle.mjs` present; `wasm/` contains `vision_wasm_internal.{js,wasm}` and `vision_wasm_nosimd_internal.{js,wasm}`; model is ~3 MB (`model OK (…)` prints a multi-MB byte count, not 0).

- [ ] **Step 3: Repoint the loader to the vendored, same-origin URLs**

Replace `src/pose.ts` lines 6–11 (the `VERSION`/`BUNDLE`/`WASM`/`MODEL` block) with:

```ts
// Vendored same-origin (public/mediapipe/, like public/opencv.js) — offline, no CDN.
// Resolve against document.baseURI so it works under the GitHub Pages '/bar-path/' subpath.
const ASSETS = new URL('mediapipe/', document.baseURI)
const BUNDLE = new URL('vision_bundle.mjs', ASSETS).href
const WASM = new URL('wasm', ASSETS).href // FilesetResolver wants the wasm DIRECTORY url
// "lite" pose model — smallest/fastest; the spike validated it at ~14.6 fps on iPhone.
const MODEL = new URL('pose_landmarker_lite.task', ASSETS).href
```

Leave the rest of `pose.ts` (the `loadPose()` body, `PoseApi`, `Landmark`, `Connection`) unchanged. Also delete the now-stale top comment line "If Phase 1 ships, vendor these assets…" since this IS that — replace the file's opening comment block with:

```ts
// Lazy MediaPipe Pose Landmarker loader, mirroring src/opencv.ts: nothing loads
// until loadPose() is first called, so the main app pays zero cost. Assets are
// vendored same-origin under public/mediapipe/ (offline, no third-party CDN).
```

- [ ] **Step 4: Type-check and build**

Run:
```bash
npx tsc --noEmit && npm run build
```
Expected: both succeed. `dist/mediapipe/` exists after build (Vite copies `public/` verbatim).

- [ ] **Step 5: Commit**

```bash
git add public/mediapipe src/pose.ts package.json package-lock.json
git commit -m "feat(pose): vendor MediaPipe Tasks Vision same-origin; repoint loader off CDN"
```

**Device check (JP):** deferred — exercised once the pose pass runs (Task 4). Here, confirm `npm run build` copies `dist/mediapipe/pose_landmarker_lite.task`.

---

## Task 2: `coach.ts` — pure cue logic (TDD)

**Files:**
- Create: `src/coach.ts`, `test/coach.test.ts`

**Interfaces:**
- Consumes: `PathPoint` from `geometry.ts`; `horizontalDrift`, `pxToCm` from `geometry.ts`; `Landmark` (type only) from `pose.ts`.
- Produces:
  - `interface MidfootEstimate { x: number; frames: number; conf: number }`
  - `interface BarDriftCue { driftCm: number | null; driftPx: number; frameT: number; refX: number; refSource: 'pose-midfoot' | 'plate-tap'; confidence: 'ok' | 'low' }`
  - `midfootXFromFrame(landmarks: Landmark[], videoWidth: number, minVis?: number): number | null`
  - `robustMidfoot(perFrameX: (number | null)[], minFrames?: number): MidfootEstimate | null`
  - `analyzeBarDrift(path: PathPoint[], midfoot: MidfootEstimate | null, plateDiameterPx: number | null, plumbX: number, opts?: { flagCm?: number; flagPx?: number; minConf?: number }): BarDriftCue | null`

- [ ] **Step 1: Write the failing tests**

Create `test/coach.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { midfootXFromFrame, robustMidfoot, analyzeBarDrift } from '../src/coach'
import type { Landmark } from '../src/pose'
import type { PathPoint } from '../src/geometry'

// 33-landmark frame with foot landmarks (indices 27..32) set to a given normalized x.
function frameWithFootX(x: number, visibility = 0.9): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }))
  for (const i of [27, 28, 29, 30, 31, 32]) lm[i] = { x, y: 0.8, z: 0, visibility }
  return lm
}

describe('midfootXFromFrame', () => {
  it('returns the foot landmark x scaled to pixels', () => {
    expect(midfootXFromFrame(frameWithFootX(0.5), 1000)).toBeCloseTo(500)
  })
  it('returns null when foot landmarks are below the visibility floor', () => {
    expect(midfootXFromFrame(frameWithFootX(0.5, 0.1), 1000)).toBeNull()
  })
})

describe('robustMidfoot', () => {
  it('takes the median of contributing frames and reports confidence', () => {
    const est = robustMidfoot([100, 102, 98, null, 101, 99])
    expect(est).not.toBeNull()
    expect(est!.x).toBeCloseTo(100)        // median of [98,99,100,101,102]
    expect(est!.frames).toBe(5)
    expect(est!.conf).toBeCloseTo(5 / 6)
  })
  it('returns null when too few frames contributed', () => {
    expect(robustMidfoot([100, null, null, null], 5)).toBeNull()
  })
})

describe('analyzeBarDrift', () => {
  const path: PathPoint[] = [
    { x: 100, y: 200, t: 0 },
    { x: 110, y: 150, t: 0.5 },   // peak: 10 px from refX 100
    { x: 104, y: 100, t: 1.0 },
  ]
  // plate: 90 px = 45 cm → 0.5 cm/px. 10 px = 5 cm.
  const plate = 90

  it('fires off the pose midfoot when drift >= 5 cm, with frameT at the peak', () => {
    const cue = analyzeBarDrift(path, { x: 100, frames: 30, conf: 0.95 }, plate, 100)
    expect(cue).not.toBeNull()
    expect(cue!.refSource).toBe('pose-midfoot')
    expect(cue!.driftCm).toBeCloseTo(5)
    expect(cue!.driftPx).toBeCloseTo(10)
    expect(cue!.frameT).toBe(0.5)
    expect(cue!.confidence).toBe('ok')
  })

  it('stays silent when drift is below the 5 cm flag threshold', () => {
    const flat: PathPoint[] = [{ x: 100, y: 0, t: 0 }, { x: 104, y: 0, t: 1 }] // 4 px = 2 cm
    expect(analyzeBarDrift(flat, { x: 100, frames: 30, conf: 0.95 }, plate, 100)).toBeNull()
  })

  it('falls back to the plate-tap line when pose midfoot is null/weak', () => {
    const cue = analyzeBarDrift(path, null, plate, 100)
    expect(cue).not.toBeNull()
    expect(cue!.refSource).toBe('plate-tap')
    expect(cue!.confidence).toBe('low')
  })

  it('reports px (driftCm null) when no plate scale is set', () => {
    const cue = analyzeBarDrift(path, { x: 100, frames: 30, conf: 0.95 }, null, 100)
    expect(cue).not.toBeNull()
    expect(cue!.driftCm).toBeNull()
    expect(cue!.driftPx).toBeCloseTo(10)
  })

  it('returns null on empty input (total & safe)', () => {
    expect(analyzeBarDrift([], null, plate, 100)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
npx vitest run test/coach.test.ts
```
Expected: FAIL — cannot resolve `../src/coach` (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/coach.ts`:

```ts
import { horizontalDrift, pxToCm, type PathPoint } from './geometry'
import type { Landmark } from './pose'

// One robust midfoot reference: the median camera-side foot x (pixels) plus how
// many frames contributed and the fraction that did (confidence).
export interface MidfootEstimate { x: number; frames: number; conf: number }

// The single deadlift coaching cue. driftCm is null when no plate scale is set
// (UI shows px). refSource records whether the reference was the pose midfoot or
// the plate-tap fallback line; confidence is 'ok' only for a calibrated pose-midfoot cue.
export interface BarDriftCue {
  driftCm: number | null
  driftPx: number
  frameT: number
  refX: number
  refSource: 'pose-midfoot' | 'plate-tap'
  confidence: 'ok' | 'low'
}

// BlazePose camera-side foot landmarks: ankles (27,28), heels (29,30), toes (31,32).
// In a side-on view the near/far foot overlap in x, so averaging the visible ones
// gives a stable vertical foot line ≈ midfoot.
const FOOT_LANDMARKS = [27, 28, 29, 30, 31, 32]

// Reduce one pose frame to a midfoot x in PIXELS (landmarks are normalized 0..1).
// Returns null if fewer than 2 foot landmarks clear the visibility floor.
export function midfootXFromFrame(
  landmarks: Landmark[],
  videoWidth: number,
  minVis = 0.5,
): number | null {
  let sum = 0, n = 0
  for (const i of FOOT_LANDMARKS) {
    const lm = landmarks[i]
    if (!lm) continue
    if (lm.visibility != null && lm.visibility < minVis) continue
    sum += lm.x; n++
  }
  if (n < 2) return null
  return (sum / n) * videoWidth
}

// Median of the per-frame xs that were detected; conf = contributed / total.
// null if fewer than minFrames contributed (pose too weak to trust).
export function robustMidfoot(
  perFrameX: (number | null)[],
  minFrames = 5,
): MidfootEstimate | null {
  const xs = perFrameX.filter((v): v is number => v != null)
  if (xs.length < minFrames) return null
  const sorted = xs.slice().sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return { x: median, frames: xs.length, conf: xs.length / perFrameX.length }
}

// Fuse the bar path (from the LK tracker) with the midfoot reference into a cue.
// Pure & total: same inputs → same output; returns null (no cue) when drift is
// below threshold or there is nothing to measure. Silence is a valid output.
export function analyzeBarDrift(
  path: PathPoint[],
  midfoot: MidfootEstimate | null,
  plateDiameterPx: number | null,
  plumbX: number,
  opts: { flagCm?: number; flagPx?: number; minConf?: number } = {},
): BarDriftCue | null {
  if (!path.length) return null
  const flagCm = opts.flagCm ?? 5
  const flagPx = opts.flagPx ?? 40 // PLACEHOLDER for uncalibrated clips; tune on device (JP)
  const minConf = opts.minConf ?? 0.5

  let refX: number
  let refSource: BarDriftCue['refSource']
  if (midfoot && midfoot.conf >= minConf) {
    refX = midfoot.x; refSource = 'pose-midfoot'
  } else {
    refX = plumbX; refSource = 'plate-tap'
  }

  // horizontalDrift gives the extreme magnitude; scan for the frame of peak |x−refX|.
  const drift = horizontalDrift(path, refX)
  const driftPx = Math.max(drift.maxLeft, drift.maxRight)
  let frameT = path[0].t, peak = -1
  for (const p of path) {
    const d = Math.abs(p.x - refX)
    if (d > peak) { peak = d; frameT = p.t }
  }

  const calibrated = plateDiameterPx != null && plateDiameterPx > 0
  const driftCm = calibrated ? pxToCm(driftPx, plateDiameterPx!) : null
  const fires = calibrated ? driftCm! >= flagCm : driftPx >= flagPx
  if (!fires) return null

  const confidence: BarDriftCue['confidence'] =
    refSource === 'pose-midfoot' && calibrated ? 'ok' : 'low'
  return { driftCm, driftPx, frameT, refX, refSource, confidence }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
npx vitest run test/coach.test.ts && npx tsc --noEmit
```
Expected: all coach tests PASS; type-check clean.

- [ ] **Step 5: Commit**

```bash
git add src/coach.ts test/coach.test.ts
git commit -m "feat(coach): pure bar-off-midfoot cue logic with tests"
```

---

## Task 3: `playFrames` — the pose-pass decode loop

**Files:**
- Modify: `src/capture.ts` (add a second exported function alongside `playAndProcess`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `playFrames(video: HTMLVideoElement, startTime: number, endTime: number | null, onFrame: (video: HTMLVideoElement, timestampMs: number) => void | Promise<void>, onProgress: (frac: number) => void): Promise<void>`

- [ ] **Step 1: Add `playFrames` to `capture.ts`**

Append to `src/capture.ts` (after the existing `playAndProcess`):

```ts
// Like playAndProcess, but with NO OpenCV work — for the pose pass. Plays the
// native <video> through the trimmed range and hands each decoded frame straight
// to onFrame (reads the played video directly, avoiding the black-frame gotcha).
// The rVFC `now` timestamp is a strictly-increasing DOMHighResTimeStamp, exactly
// what MediaPipe VIDEO mode requires for detectForVideo.
export function playFrames(
  video: HTMLVideoElement,
  startTime: number,
  endTime: number | null,
  onFrame: (video: HTMLVideoElement, timestampMs: number) => void | Promise<void>,
  onProgress: (frac: number) => void,
): Promise<void> {
  const end = endTime ?? video.duration
  const span = Math.max(0.001, end - startTime)
  return new Promise((resolve) => {
    let finished = false
    const finish = () => { if (!finished) { finished = true; video.pause(); resolve() } }
    const onTick = async (now: number, meta: any) => {
      const t = meta?.mediaTime ?? video.currentTime
      await onFrame(video, now)
      onProgress(Math.min(1, (t - startTime) / span))
      if (!video.ended && t < end) video.requestVideoFrameCallback(onTick)
      else finish()
    }
    const begin = () => {
      video.muted = true
      video.requestVideoFrameCallback(onTick)
      video.play().catch(() => finish())
    }
    video.addEventListener('ended', finish, { once: true })
    if (Math.abs(video.currentTime - startTime) > 0.01) {
      video.addEventListener('seeked', begin, { once: true })
      video.currentTime = startTime
    } else begin()
  })
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: clean. (No unit test — jsdom has no `requestVideoFrameCallback`; verified live in Task 4 device check.)

- [ ] **Step 3: Commit**

```bash
git add src/capture.ts
git commit -m "feat(capture): playFrames pose-pass loop (no OpenCV)"
```

---

## Task 4: Wire the pose pass into processing + AppData

**Files:**
- Modify: `src/state.ts` (AppData + initialData), `src/screens/processing.ts` (run pass 2, compute cue)

**Interfaces:**
- Consumes: `loadPose` (`pose.ts`), `playFrames` (`capture.ts`), `midfootXFromFrame`/`robustMidfoot`/`analyzeBarDrift` + `MidfootEstimate`/`BarDriftCue` (`coach.ts`).
- Produces: `AppData.poseMidfoot: MidfootEstimate | null`, `AppData.cue: BarDriftCue | null` (populated before `app.go('result')`).

- [ ] **Step 1: Extend `AppData`**

In `src/state.ts`, add the import at the top:

```ts
import type { BarDriftCue, MidfootEstimate } from './coach'
```

Add these two fields to the `AppData` interface (after `plateDiameterPx`):

```ts
  // Pose-derived midfoot reference (camera-side foot x, robust median) for the
  // bar-off-midfoot cue; null when pose was unavailable/too weak.
  poseMidfoot: MidfootEstimate | null
  // The deadlift bar-off-midfoot coaching cue, or null when none fired.
  cue: BarDriftCue | null
```

And in `initialData()` add (after `plateDiameterPx: null,`):

```ts
    poseMidfoot: null,
    cue: null,
```

- [ ] **Step 2: Run the pose pass in `processing.ts`**

In `src/screens/processing.ts`, add imports after the existing `import { smoothPath, ... }` line:

```ts
import { playFrames } from '../capture'
import { loadPose } from '../pose'
import { midfootXFromFrame, robustMidfoot, analyzeBarDrift } from '../coach'
```

(Note: `playAndProcess` is already imported on the existing capture import line — extend that line instead of duplicating: `import { playAndProcess, playFrames } from '../capture'`.)

Then, in the `run` function, replace the success tail — the two lines:

```ts
      app.data.path = smoothPath(raw, 5)
      app.go('result')
```

with:

```ts
      app.data.path = smoothPath(raw, 5)

      // Pass 2 (pose): a SECOND decode pass — pose alone (~37 ms/frame on iPhone)
      // won't fit alongside OpenCV in one real-time loop. Strictly additive: any
      // failure falls back to the plate-tap line (seed.x), then to no cue.
      try {
        pctEl.textContent = 'Reading body position…'
        barEl.style.width = '0%'
        const pose = await loadPose()
        const xs: (number | null)[] = []
        await playFrames(video, start, end, (v, tMs) => {
          const lm = pose.detect(v, tMs)[0]
          xs.push(lm ? midfootXFromFrame(lm, v.videoWidth) : null)
        }, (f) => {
          const p = Math.round(f * 100)
          barEl.style.width = `${p}%`; pctEl.textContent = `Reading body position… ${p}%`
        })
        app.data.poseMidfoot = robustMidfoot(xs)
      } catch (err) {
        console.error('pose pass failed; cue falls back to the plate-tap line', err)
        app.data.poseMidfoot = null
      }
      app.data.cue = analyzeBarDrift(
        app.data.path, app.data.poseMidfoot, app.data.plateDiameterPx, app.data.seed!.x,
      )
      app.go('result')
```

- [ ] **Step 3: Type-check and build**

Run:
```bash
npx tsc --noEmit && npm run build
```
Expected: both succeed.

- [ ] **Step 4: Run the full unit suite (no regressions)**

Run:
```bash
npm test
```
Expected: all existing tests + coach tests PASS (state.ts type change must not break `state.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/state.ts src/screens/processing.ts
git commit -m "feat(processing): pose pass computes bar-off-midfoot cue onto AppData"
```

**Device check (JP, iPhone Safari, Private tab):** track a real **side-on deadlift** with a sized plate → after "Tracking…" you see "Reading body position…" then the result screen. In the console (Web Inspector) confirm no "pose pass failed". Confirm pose assets load only on this screen (Network shows `mediapipe/*` fetched during processing, not on first paint). Re-run with airplane mode after one online load → still works (assets cached by SW).

---

## Task 5: Cue UI — card, scrub tick, amber drift marker

**Files:**
- Modify: `src/overlay.ts` (add `drawDriftMarker`), `src/screens/result.ts` (card, tick, marker render, seek)

**Interfaces:**
- Consumes: `AppData.cue` (`BarDriftCue`), `path`.
- Produces: `drawDriftMarker(ctx: CanvasRenderingContext2D, path: PathPoint[], cue: { refX: number; frameT: number }): void`.

- [ ] **Step 1: Add `drawDriftMarker` to `overlay.ts`**

Append to `src/overlay.ts`:

```ts
// Draw the bar-off-midfoot evidence at the peak-drift frame: an amber dashed
// midfoot reference line + the horizontal bar-to-midfoot gap at the bar's height.
// Called by the result screen AFTER drawReview (which clears the canvas), only
// when the current time is at the cue's peak frame. No skeleton (that is Phase 2).
export function drawDriftMarker(
  ctx: CanvasRenderingContext2D,
  path: PathPoint[],
  cue: { refX: number; frameT: number },
): void {
  if (!path.length) return
  // Bar position at the peak frame = the path point nearest cue.frameT.
  let bar = path[0], best = Infinity
  for (const p of path) {
    const d = Math.abs(p.t - cue.frameT)
    if (d < best) { best = d; bar = p }
  }
  const h = ctx.canvas.height
  ctx.save()
  // Midfoot reference line (amber, dashed — distinct from the muted plumb line).
  ctx.strokeStyle = '#FFB020'; ctx.lineWidth = 2; ctx.setLineDash([6, 5])
  ctx.beginPath(); ctx.moveTo(cue.refX, 0); ctx.lineTo(cue.refX, h); ctx.stroke()
  // The drift itself: a solid amber gap from midfoot to the bar at the bar's height.
  ctx.setLineDash([]); ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(cue.refX, bar.y); ctx.lineTo(bar.x, bar.y); ctx.stroke()
  ctx.fillStyle = '#FFB020'
  ctx.beginPath(); ctx.arc(bar.x, bar.y, 5, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}
```

- [ ] **Step 2: Render the cue card + tick + marker in `result.ts`**

In `src/screens/result.ts`:

(a) Add to the imports — extend the overlay import:
```ts
import { drawReview, drawDriftMarker } from '../overlay'
```

(b) After the line `const drift = horizontalDrift(path, refX)`, add:
```ts
  const cue = app.data.cue
  const cueUnit = cue?.driftCm != null ? 'cm' : 'px'
  const cueVal = cue ? (cue.driftCm != null ? cue.driftCm.toFixed(1) : cue.driftPx.toFixed(0)) : ''
  const cueRef = cue?.refSource === 'pose-midfoot' ? 'midfoot' : 'your starting line'
  const tickPct = cue ? Math.max(0, Math.min(100, ((cue.frameT - startT) / (endT - startT)) * 100)) : 0
```

(c) Replace the scrub input line:
```ts
      <input id="scrub" type="range" min="0" max="1000" value="1000" />
```
with a wrapped version carrying the tick:
```ts
      <div class="relative">
        <input id="scrub" type="range" min="0" max="1000" value="1000" class="w-full" />
        ${cue ? `<div class="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-[var(--amber)] pointer-events-none" style="left:${tickPct}%"></div>` : ''}
      </div>
```

(d) Insert the cue card immediately AFTER the closing `</div>` of the "Side-to-side travel" card (the `</div>` on the line before `<div id="actions"></div>`), and before `<div id="actions">`:
```ts
      ${cue ? `
      <button id="cue-card" class="card p-4 flex flex-col gap-1.5 text-left active:bg-[var(--surface-2)]">
        <span class="eyebrow text-[var(--amber)]">Bar drift off midfoot</span>
        <span class="readout text-xl font-semibold leading-tight text-[var(--chalk)]">Bar drifted ${cueVal}${cueUnit} off ${cueRef}</span>
        <span class="text-sm text-[var(--muted)]">Keeping it over midfoot will feel stronger off the floor. <span class="text-[var(--amber)]">Tap to see the moment →</span></span>
        ${cue.confidence === 'low' ? '<span class="text-xs text-[var(--faint)]">Measured against your starting line — film square to the side for a midfoot read.</span>' : ''}
      </button>` : ''}
```

(e) Update the `render` function so the marker draws at the peak frame. Replace:
```ts
  const render = (t: number) => drawReview(ctx, path, t, refX)
```
with:
```ts
  const render = (t: number) => {
    drawReview(ctx, path, t, refX)
    if (cue && Math.abs(t - cue.frameT) < 0.12) drawDriftMarker(ctx, path, { refX: cue.refX, frameT: cue.frameT })
  }
```

(f) After the `scrub.addEventListener('input', …)` block, add the seek-to-cue handler:
```ts
  const cueCard = root.querySelector<HTMLButtonElement>('#cue-card')
  if (cueCard && cue) {
    cueCard.addEventListener('click', () => {
      pause()
      video.currentTime = cue.frameT // 'seeked' handler re-renders (marker drawn at the peak frame)
      setScrubFromTime(cue.frameT)
    })
  }
```

- [ ] **Step 3: Type-check and build**

Run:
```bash
npx tsc --noEmit && npm run build
```
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/overlay.ts src/screens/result.ts
git commit -m "feat(result): bar-off-midfoot cue card, scrub tick, amber drift marker"
```

**Device check (JP):** on a forward-drift deadlift the cue card shows a sensible cm number; tapping it seeks to the visibly worst frame and draws the amber midfoot line + gap there; the scrub tick sits at that moment; a clean rep shows **no** cue card and no marker. The existing "Side-to-side travel" card, play/scrub/export are unchanged.

---

## Task 6: Persist the cue with saved lifts

**Files:**
- Modify: `src/librarySupport.ts` (SavedAnalysis), `src/screens/result.ts` (persist writes), `src/screens/library.ts` (reopen reads)

**Interfaces:**
- Consumes: `BarDriftCue`, `MidfootEstimate` (`coach.ts`).
- Produces: persisted + reopened `cue` / `poseMidfoot` on saved lifts.

- [ ] **Step 1: Extend `SavedAnalysis`**

In `src/librarySupport.ts`, add the import:
```ts
import type { BarDriftCue, MidfootEstimate } from './coach'
```
Add to the `SavedAnalysis` interface (after `plateDiameterPx?`):
```ts
  cue?: BarDriftCue | null            // bar-off-midfoot cue; optional — older records lack it
  poseMidfoot?: MidfootEstimate | null
```

- [ ] **Step 2: Write them in `result.ts` persist()**

In `src/screens/result.ts`, in the `record: SavedAnalysis = { … }` literal (inside `persist`), add after `plateDiameterPx: app.data.plateDiameterPx,`:
```ts
      cue: app.data.cue,
      poseMidfoot: app.data.poseMidfoot,
```

- [ ] **Step 3: Carry them back on reopen in `library.ts`**

In `src/screens/library.ts`, in `reopen()`'s `app.data = { … }` literal, add after `plateDiameterPx: saved.plateDiameterPx ?? null,`:
```ts
    poseMidfoot: saved.poseMidfoot ?? null,
    cue: saved.cue ?? null,
```

- [ ] **Step 4: Type-check, build, and run the suite**

Run:
```bash
npx tsc --noEmit && npm run build && npm test
```
Expected: all succeed; `librarySupport.test.ts` and `library.test.ts` still PASS (new fields are optional, so existing records/tests are unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/librarySupport.ts src/screens/result.ts src/screens/library.ts
git commit -m "feat(library): persist bar-off-midfoot cue with saved lifts"
```

**Device check (JP):** save a deadlift that fired a cue → reopen from the library → the cue card + tick + marker are intact. Save a clean lift → reopens with no cue (no crash). An older saved lift (pre-Phase-1) reopens normally with no cue.

---

## Notes & assumptions (flag to JP)

- **Cue wording softened from the spec's "forward" to neutral "off midfoot."** Direction (forward/back) can't be claimed honestly without knowing which way the lifter faces; deadlift drift is *usually* forward but not always. Detecting facing from heel/toe landmarks is a clean Phase 2 add. If you'd rather keep "forward" (the common case), it's a one-word change in Task 5(d).
- **`flagPx = 40` for uncalibrated clips is a placeholder.** px thresholds are resolution-dependent and shaky; the real value path is the plate-calibrated 5 cm. Tune `flagPx` on device, or decide uncalibrated clips should stay silent and prompt "size a plate."
- **The plate-tap fallback measures the same reference (seed.x) as the existing "Side-to-side travel" card.** When pose is unavailable the cue restates that drift with coaching framing + the tick/marker; the copy says "off your starting line," not "off midfoot," to stay honest.
- **No SW change.** The existing cache-first fetch handler runtime-caches any same-origin asset, so `public/mediapipe/*` is cached on first use automatically. Do not add it to `SHELL` (would bloat install).

## Self-review

- **Spec coverage:** vendor MediaPipe (T1) · `coach.ts` pure+tested (T2) · second pose pass, lenient sampling, robust median midfoot (T2/T3/T4) · pose-midfoot→plate-tap→silent fallback ladder (T2 logic, T4 wiring) · cm via plate / px otherwise (T2) · 5 cm threshold, silence valid (T2) · card + scrub tick + amber drift line, no skeleton (T5) · persistence (T6) · guardrails: build-independent, no body-type, no verdict (copy in T5, logic in T2) · lazy-load only on processing screen, no SW precache (T1/T4 + Notes). All spec sections map to a task.
- **Placeholder scan:** the only literal placeholder is `flagPx = 40`, explicitly called out as device-tunable (not a plan gap — it has a concrete default and a note).
- **Type consistency:** `MidfootEstimate` / `BarDriftCue` defined in `coach.ts` (T2), consumed identically in `state.ts` (T4), `librarySupport.ts` (T6); `analyzeBarDrift`/`robustMidfoot`/`midfootXFromFrame` signatures match between T2 definition, T2 tests, and T4 call site; `drawDriftMarker` signature matches between T5 definition and T5 call site; `cue.frameT`/`cue.refX`/`cue.refSource`/`cue.driftCm`/`cue.driftPx`/`cue.confidence` used consistently.
