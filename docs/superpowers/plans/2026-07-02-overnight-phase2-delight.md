# Overnight Build: Phase 1.5 polish + Phase 2 pose cues + velocity graph

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the app's next level of utility overnight: merge Phase 1, fix all four device-test findings, build Phase 2 (per-frame pose capture, early-hip-rise cue, toggleable skeleton overlay), and add a playback-synced bar-velocity graph — deployed to production (GitHub Pages) with tests green at every merge.

**Architecture:** All-new analysis logic stays PURE in `src/coach.ts` / `src/geometry.ts` (unit-tested, jsdom-safe), mirroring the existing pattern. The pose pass in `processing.ts` grows from "collect foot x" to "collect slim per-frame landmarks"; everything downstream (midfoot, hip-rise, skeleton) derives from that one array. UI work is confined to `result.ts` / `overlay.ts` / `setpoint.ts`. Persistence adds optional fields only (older records unaffected).

**Tech Stack:** Vite + TypeScript strict, Tailwind + custom Precision-Instrument tokens (`src/style.css`), Vitest, OpenCV.js (vendored), MediaPipe Tasks Vision (vendored, lazy). Verification: `npm test`, `npm run build`, local Playwright harness (`scripts/*.mjs`, Edge headed, clips in `C:\Users\JP\Videos\`).

## Global Constraints

- **Guardrails (report §5–§7):** cues are calm nudges, never verdicts; never spine/3D claims; body type only widens tolerances (build slider DEFERRED this run — see Sprint notes). Silence over a wrong number.
- **Uncalibrated clips stay SILENT for cm-based cues** (no actionable px threshold). The hip-rise cue is ratio-based (unitless) so it may fire uncalibrated — but only with strong pose data.
- **Design language:** `color = data, amber = action`. Amber `#FFB020` only for actionable nudges/controls; data reads in chalk/green. Mono readouts = `readout` class; eyebrows = `eyebrow`.
- **iOS gotchas:** never `drawImage` a never-played video; pose/OpenCV load only on the processing screen; strictly-increasing timestamps for `detectForVideo`.
- **TS strict, `.ts` only, no new deps.** Pure logic gets unit tests; UI verified via the Playwright harness + screenshots.
- **Deploy:** merge to `master` → GitHub Actions → Pages. One PR per sprint, `npm test` + `npm run build` green before every merge.
- **Commit style:** `feat(scope): …` / `fix(scope): …` / `docs: …` as in git history.

## Sprint map

- **A. Merge Phase 1 (PR #4)** — it's device-validated; findings below are follow-ups.
- **B. Phase 1.5 polish** (branch `feat/phase15-polish`): midfoot heel-bias fix · tone-not-visibility midfoot card · post-save New · scale-capture discoverability.
- **C. Phase 2 pose** (branch `feat/phase2-pose-cues`): slim per-frame pose capture · early-hip-rise cue · skeleton overlay · persistence.
- **D. Velocity + delight** (branch `feat/velocity-graph`): pure velocity series · playback-synced velocity graph (invoke `dataviz` skill first) · unused-wasm cleanup · screen-enter polish.
- **E. Wrap-up:** e2e pass, HANDOFF.md rewrite, deploy verification, memory notes.

**Deferred (deliberate):** build/body-type slider — its only permitted effect is widening thresholds, which with two cues is a one-line constant change; the UX (one-time capture screen) needs JP's input. Flag in HANDOFF. Also deferred: flagCm re-tuning (needs JP's clip library; only 2 side-ish clips exist locally — keep 5 cm).

---

### Task A1: Merge PR #4 and confirm deploy

**Files:** none (git/gh only)

- [ ] `git checkout master && git pull`, `gh pr merge 4 --squash --delete-branch` (squash matches nothing in history — history shows merge commits for #1–#3, so use `--merge` instead to match repo convention).
- [ ] Watch the Pages deploy: `gh run list --limit 3` → newest `deploy` run success.
- [ ] Verify live: fetch `https://jplikescoding.github.io/bar-path/` returns 200 and the built JS references `mediapipe/` (spot-check one asset).

### Task B1: Midfoot = heel↔toe midpoint (drop ankle)

**Files:**
- Modify: `src/coach.ts:20-41` (`FOOT_LANDMARKS`, `midfootXFromFrame`)
- Test: `test/coach.test.ts`

**Interfaces:** `midfootXFromFrame(landmarks, videoWidth, minVis=0.5): number | null` — signature unchanged; semantics now: mean visible heel x (29,30) and mean visible toe x (31,32); require ≥1 of each; return midpoint × videoWidth.

- [ ] **Failing tests** (replace/extend existing midfoot tests):

```ts
// helper: lm(i → {x, visibility}) sparse array builder already exists in the file's style
it('midfoot is the heel↔toe midpoint, ankle ignored', () => {
  const lms: Landmark[] = []
  lms[27] = { x: 0.10, y: 0, z: 0, visibility: 1 } // ankle far left — must NOT pull the result
  lms[29] = { x: 0.40, y: 0, z: 0, visibility: 1 } // heel
  lms[31] = { x: 0.60, y: 0, z: 0, visibility: 1 } // toe
  expect(midfootXFromFrame(lms, 1000)).toBeCloseTo(500) // (0.4+0.6)/2 × 1000
})
it('null when no visible heel (even if ankles+toes visible)', () => {
  const lms: Landmark[] = []
  lms[27] = { x: 0.4, y: 0, z: 0, visibility: 1 }
  lms[31] = { x: 0.6, y: 0, z: 0, visibility: 1 }
  expect(midfootXFromFrame(lms, 1000)).toBeNull()
})
it('null when no visible toe', () => {
  const lms: Landmark[] = []
  lms[29] = { x: 0.4, y: 0, z: 0, visibility: 1 }
  expect(midfootXFromFrame(lms, 1000)).toBeNull()
})
```

- [ ] Run `npm test` → new tests FAIL (old averaging includes the ankle).
- [ ] **Implementation** — replace `FOOT_LANDMARKS` + body:

```ts
// BlazePose heels (29,30) and toes (31,32). Midfoot = the heel↔toe midpoint —
// anatomy, not landmark averaging: ankles sit OVER the heel, so including them
// biased the line toward the heel (validated on a real clip, 2026-06-29).
const HEELS = [29, 30]
const TOES = [31, 32]

export function midfootXFromFrame(
  landmarks: Landmark[],
  videoWidth: number,
  minVis = 0.5,
): number | null {
  const avg = (idxs: number[]): number | null => {
    let sum = 0, n = 0
    for (const i of idxs) {
      const lm = landmarks[i]
      if (!lm) continue
      if (lm.visibility != null && lm.visibility < minVis) continue
      sum += lm.x; n++
    }
    return n ? sum / n : null
  }
  const heel = avg(HEELS), toe = avg(TOES)
  if (heel == null || toe == null) return null
  return ((heel + toe) / 2) * videoWidth
}
```

- [ ] `npm test` → PASS. Commit: `fix(coach): midfoot = heel↔toe midpoint, ankle dropped (heel-bias fix)`

### Task B2: Threshold gates TONE, not visibility

**Files:**
- Modify: `src/coach.ts` (`BarDriftCue`, `analyzeBarDrift`), `src/screens/result.ts` (cue card + tick), `src/screens/processing.ts` (no change expected — cue call site same)
- Test: `test/coach.test.ts`

**Interfaces:** `BarDriftCue` gains `tone: 'good' | 'nudge'`. `analyzeBarDrift` now returns a cue for **every calibrated clip with a path** (tone reflects threshold); uncalibrated: unchanged (null unless `opts.flagPx`, which yields tone `'nudge'` only at/above and null below — px behavior identical to today). Render sites treat missing tone (older saved records) as `'nudge'`.

- [ ] **Failing tests:**

```ts
it('calibrated below-threshold drift returns a GOOD-tone cue (visible, positive)', () => {
  const cue = analyzeBarDrift(pathWithDriftPx(20), midfootAt(100), 300, 100) // 20px @300px-plate = 3cm < 5
  expect(cue).not.toBeNull()
  expect(cue!.tone).toBe('good')
  expect(cue!.driftCm).toBeCloseTo(3)
})
it('calibrated at/above threshold is a NUDGE', () => {
  const cue = analyzeBarDrift(pathWithDriftPx(40), midfootAt(100), 300, 100) // 6cm
  expect(cue!.tone).toBe('nudge')
})
it('uncalibrated stays silent below flagPx and nudges at flagPx', () => {
  expect(analyzeBarDrift(pathWithDriftPx(20), null, null, 100)).toBeNull()
  expect(analyzeBarDrift(pathWithDriftPx(40), null, null, 100, { flagPx: 30 })!.tone).toBe('nudge')
})
```

(Adapt existing "silent below 5 cm" tests: they now assert `tone === 'good'` instead of null.)

- [ ] `npm test` → FAIL.
- [ ] **Implementation** in `analyzeBarDrift` — replace the `fires` block:

```ts
// Threshold gates TONE, not visibility (JP, 2026-06-29): a calibrated clip
// always gets a midfoot card — positive below flagCm, a nudge at/above — so the
// pose pass is visible even on a clean rep. Uncalibrated stays silent (no
// actionable px number) unless the caller opts in via flagPx (nudge-only).
let tone: BarDriftCue['tone']
if (calibrated) tone = driftCm! >= flagCm ? 'nudge' : 'good'
else if (opts.flagPx != null && driftPx >= opts.flagPx) tone = 'nudge'
else return null
```

…and add `tone` to the interface + return object.

- [ ] `npm test` → PASS.
- [ ] **Result screen:** cue card renders both tones (`const tone = cue.tone ?? 'nudge'` for old saved records):
  - `nudge` (unchanged): amber eyebrow "Bar drift off midfoot", copy "Bar drifted N cm off midfoot", encouragement + "Tap to see the moment →".
  - `good`: eyebrow in the data green (`#22ff55` at ~80%, e.g. `style="color:rgba(34,255,85,.8)"`) reading "Bar path ✓", readout "Bar stayed over midfoot", subline "Drifted only N cm at its widest — tap to see →". Same seek-on-tap.
  - Scrub tick: amber for nudge; for good use a faint chalk tick (`bg-[var(--faint)]`, or `--line-bright`) — amber stays action-only.
  - Peak-frame `drawDriftMarker` stays for both (it's evidence, not an alarm); pass a `color` option: amber `#FFB020` for nudge, `'rgba(230,235,240,0.8)'` chalk for good. Modify `drawDriftMarker(ctx, path, cue)` → `cue: { refX; frameT; color?: string }`.
- [ ] Build + quick harness screenshot of both tones (drive `preview-cm.mjs`-style script or reuse e2e; a clean rep on `deadlift 10s.mp4` calibrated should now show the good card).
- [ ] Commit: `feat(result): midfoot card always shows when calibrated — threshold gates tone, not visibility`

### Task B3: Post-save "New" affordance

**Files:** Modify: `src/screens/result.ts:276-291` (`renderActions` saved branch)

- [ ] Saved-state actions become a 2×2 grid:

```ts
actions.innerHTML = `
  <div class="grid grid-cols-2 gap-2">
    <button id="library" class="btn btn-amber">Library</button>
    <button id="export" class="btn btn-ghost">Export</button>
    <button id="new" class="btn btn-quiet">New</button>
    <button id="delete" class="btn btn-quiet">Delete</button>
  </div>`
```

with `actions.querySelector('#new')!.addEventListener('click', () => { app.reset(); leave('upload') })` — note `leave()` calls `app.go` AFTER `app.reset()` here; reuse the fresh-branch handler order exactly (`app.reset(); leave('upload')` — leave() aborts + pauses the (now detached) video safely; keep the same order as the fresh branch).
- [ ] Harness screenshot: save a lift → actions show all four; New returns to upload.
- [ ] Commit: `feat(result): New action on saved lifts — no more library round-trip`

### Task B4: Scale-capture discoverability

**Files:** Modify: `src/screens/setpoint.ts` (hint copy + persistent scale status)

- [ ] Hint strings gain the redo affordance; the trim readout line doubles as a persistent scale status. Changes:
  - After sizing (`pointerup` moved>10 branch): `'Scale set ✓ — drift will read in cm. Draw a new circle anytime to redo it.'`
  - Plain tap with scale already set: `'Tracking that plate (scale kept ✓). Drag to the rim again to re-size, or hit Track.'`
  - Plain tap, no scale: keep, but append redo-free nudge stays as-is.
  - `updateTrim()` becomes: `trimEl.textContent = \`Tracking ${s} → ${e}${app.data.plateDiameterPx != null ? ' · scale ✓' : ''}\``
- [ ] Harness screenshot of the sized state.
- [ ] Commit: `feat(setpoint): scale-capture discoverability — redo hint + persistent scale status`

### Task B5: Sprint B verification + PR + merge

- [ ] `npm test` and `npm run build` green; run `scripts/e2e.mjs` (both clips if quick) — no console errors, result renders.
- [ ] `/code-review` (medium) on the branch; fix real findings.
- [ ] PR (base master) titled `Phase 1.5: device-test findings — midfoot accuracy, tone-gated cue, post-save New, scale hints`, body summarizing the four findings → merge (merge commit) → confirm Pages deploy green.

---

### Task C1: Slim per-frame pose capture

**Files:**
- Modify: `src/capture.ts` (`playFrames` onFrame gains `mediaTime`), `src/coach.ts` (types + `slimFrame`), `src/state.ts` (`poseFrames`), `src/screens/processing.ts` (collect frames)
- Test: `test/coach.test.ts` (slimFrame)

**Interfaces (produced, later tasks rely on these exact names):**

```ts
// coach.ts
export interface PoseLm { x: number; y: number; vis?: number }        // normalized 0..1
export interface PoseFrame { t: number; lm: PoseLm[] }                // t = mediaTime seconds
export function slimFrame(landmarks: Landmark[], t: number): PoseFrame // rounds x/y to 4dp, vis to 2dp, drops z
// state.ts
poseFrames: PoseFrame[] | null   // + initialData() → null
// capture.ts
onFrame: (video: HTMLVideoElement, timestampMs: number, mediaTime: number) => void | Promise<void>
```

`midfootXFromFrame` keeps accepting `Landmark[]`; `PoseLm` is structurally compatible except `visibility`→`vis` — so instead REDEFINE `midfootXFromFrame` (and the new hip helpers) to take `PoseLm[]`, and have processing.ts call it on `slimFrame(...).lm`. Update B1's tests to build `PoseLm` (`vis`) — mechanical rename.

- [ ] Failing test:

```ts
it('slimFrame rounds and drops z', () => {
  const f = slimFrame([{ x: 0.123456, y: 0.654321, z: 9, visibility: 0.876 }], 1.5)
  expect(f).toEqual({ t: 1.5, lm: [{ x: 0.1235, y: 0.6543, vis: 0.88 }] })
})
```

- [ ] Implement `slimFrame` (omit `vis` key when `visibility == null`); switch foot/midfoot helpers to `PoseLm`/`.vis`; `npm test` PASS.
- [ ] `capture.ts`: `onTick` already computes `t` — pass it: `await onFrame(video, now, t)`.
- [ ] `processing.ts` pose pass:

```ts
const frames: PoseFrame[] = []
const xs: (number | null)[] = []
await playFrames(video, start, end, (v, tMs, t) => {
  try {
    const lm = pose.detect(v, tMs)[0]
    if (lm) {
      const f = slimFrame(lm, t)
      frames.push(f)
      xs.push(midfootXFromFrame(f.lm, v.videoWidth))
    } else xs.push(null)
  } catch { xs.push(null) }
}, /* progress unchanged */)
app.data.poseMidfoot = robustMidfoot(xs)
app.data.poseFrames = frames.length ? frames : null
```

- [ ] `npm test` + `npm run build` green. Commit: `feat(processing): pose pass captures slim per-frame landmarks (poseFrames)`

### Task C2: Early-hip-rise cue (pure + tests)

**Files:**
- Modify: `src/coach.ts`
- Test: `test/coach.test.ts`

**Interfaces (produced):**

```ts
export interface HipRiseCue {
  ratio: number      // hip rise ÷ bar rise over the early-pull window (unitless → calibration-free)
  fired: boolean     // true = hips shot up early (nudge); false = moved together (positive)
  startT: number     // pull start (bar leaves the bottom)
  endT: number       // window end (bar has risen windowFrac of its ROM)
  frameT: number     // pose frame of max hip-vs-bar divergence (scrub tick / seek target)
}
export function hipYFromFrame(lm: PoseLm[], minVis = 0.5): number | null   // mean visible hip y (23,24), normalized
export function analyzeHipRise(
  path: PathPoint[],
  poseFrames: PoseFrame[] | null,
  videoHeight: number,
  opts: { fireRatio?: number; windowFrac?: number; minFrames?: number; minHipRiseFrac?: number; minRomFrac?: number } = {},
): HipRiseCue | null
```

**Algorithm (report §3.2 "hips rising too early" — both signals in-plane side-on):**
1. Bar bottom = path point with max y → `startT` (ties: first). ROM = maxY − minY; require `ROM ≥ (opts.minRomFrac ?? 0.15) × videoHeight` else null (not a real pull → silence).
2. Window end = first path point at/after `startT` with `y ≤ bottomY − windowFrac×ROM` (`windowFrac` default 0.25) → `endT`. If none → null.
3. Pose frames inside `[startT, endT]` with a visible hip (`hipYFromFrame ≠ null`): need ≥ `minFrames` (default 5) else null (pose too weak → silence, never a wrong number).
4. `hipStart` = median hip y (px = `y×videoHeight`) of the first `k` window frames, `hipEnd` = median of the last `k`, `k = max(1, floor(n/4))`. `hipRise = hipStart − hipEnd` (screen y grows down; positive = rising).
5. `barRise = windowFrac × ROM` (by construction of the window end; use the actual `bottomY − y(endT)`).
6. `ratio = hipRise / barRise`. `fired = ratio ≥ (fireRatio ?? 1.5) && hipRise ≥ (minHipRiseFrac ?? 0.02) × videoHeight`.
7. `frameT` = window pose frame maximizing `(hipStartPx − hipPx(f)) − (bottomY − barYNearest(f.t))` (hip got ahead of the bar the most). For not-fired cues `frameT = endT`'s nearest frame — harmless.
8. Return the cue **always** when steps 1–4 pass (fired or not) — the positive tone is the point (surface the pose work).

- [ ] **Failing tests** (synthetic geometry; build helpers `barPath(points)` and `hipFrames(...)`):

```ts
const H = 1000 // videoHeight
// bar: sits at y=900 until t=1, rises linearly to y=300 by t=4 (ROM 600 ≥ 15%)
const rising = (): PathPoint[] => {
  const pts: PathPoint[] = []
  for (let t = 0; t <= 1; t += 0.1) pts.push({ x: 100, y: 900, t })
  for (let t = 1.1; t <= 4; t += 0.1) pts.push({ x: 100, y: 900 - 600 * ((t - 1) / 3), t })
  return pts
}
const framesWithHip = (hipYAt: (t: number) => number): PoseFrame[] => {
  const fs: PoseFrame[] = []
  for (let t = 0; t <= 4; t += 0.1) {
    const lm: PoseLm[] = []
    lm[23] = { x: 0.5, y: hipYAt(t), vis: 1 }; lm[24] = { x: 0.5, y: hipYAt(t), vis: 1 }
    fs.push({ t, lm })
  }
  return fs
}
it('good rep — hips track the bar → cue present, not fired, ratio ≈ 1', () => {
  // hips rise proportionally to the bar: 0.6 → 0.45 over the same climb
  const cue = analyzeHipRise(rising(), framesWithHip((t) => t <= 1 ? 0.6 : 0.6 - 0.15 * Math.min(1, (t - 1) / 3)), H)!
  expect(cue.fired).toBe(false)
  expect(cue.ratio).toBeGreaterThan(0.5); expect(cue.ratio).toBeLessThan(1.5)
})
it('early hip rise — hips 2× the bar in the window → fired', () => {
  // over the window (bar rises 150px) hips rise ~300px (0.30 of height)
  const cue = analyzeHipRise(rising(), framesWithHip((t) => t <= 1 ? 0.8 : 0.8 - 0.4 * Math.min(1, (t - 1) / 3)), H)!
  expect(cue.fired).toBe(true)
  expect(cue.ratio).toBeGreaterThan(1.5)
  expect(cue.frameT).toBeGreaterThanOrEqual(cue.startT)
  expect(cue.frameT).toBeLessThanOrEqual(cue.endT + 0.101)
})
it('null when pose frames missing or hips invisible', () => {
  expect(analyzeHipRise(rising(), null, H)).toBeNull()
  const blind = framesWithHip(() => 0.5).map((f) => ({ ...f, lm: f.lm.map((l) => ({ ...l, vis: 0.1 })) }))
  expect(analyzeHipRise(rising(), blind, H)).toBeNull()
})
it('null when the bar never really rises (no pull)', () => {
  const flat: PathPoint[] = Array.from({ length: 40 }, (_, i) => ({ x: 100, y: 900 - i, t: i / 10 }))
  expect(analyzeHipRise(flat, framesWithHip(() => 0.5), H)).toBeNull()
})
```

- [ ] `npm test` → FAIL → implement per the algorithm (pure, total; median helper local) → PASS.
- [ ] Commit: `feat(coach): early-hip-rise cue — hip-vs-bar rise ratio over the early pull (pure, tested)`

### Task C3: Hip-rise UI + wiring + persistence

**Files:**
- Modify: `src/state.ts` (`hipCue: HipRiseCue | null`), `src/screens/processing.ts` (call site), `src/screens/result.ts` (card + tick), `src/librarySupport.ts` (`hipCue?`, `poseFrames?`), `src/screens/library.ts` (`reopen` restores both), `src/screens/result.ts` `persist()` (save both)

- [ ] `processing.ts` after the midfoot cue: `app.data.hipCue = analyzeHipRise(app.data.path, app.data.poseFrames, video.videoHeight)`.
- [ ] `result.ts` second cue card (below the midfoot card), tap-to-seek `hipCue.frameT`:
  - fired: amber eyebrow "Hip timing" · readout `Hips rose ${hipCue.ratio.toFixed(1)}× faster than the bar off the floor` · line "Push the floor away — chest and hips rise together. Tap to see the moment →".
  - not fired: green-tinted eyebrow "Hip timing ✓" · readout "Hips and bar rose together" · subline "Off the floor, your hips didn't outrun the bar — tap to review the pull →".
  - Scrub tick at `hipCue.frameT` (amber when fired, faint chalk otherwise) — same pattern as B2.
- [ ] Persistence: add optional `hipCue`/`poseFrames` to `SavedAnalysis`; write them in `persist()`; restore in `reopen()` (`?? null`). Older records: absent → null → no card, exactly like today.
- [ ] `npm test` (state/librarySupport tests may need the new fields) + build green; harness run shows the hip card on a real clip (either tone).
- [ ] Commit: `feat(result): hip-timing cue card + scrub tick, persisted with saved lifts`

### Task C4: Toggleable skeleton overlay

**Files:**
- Modify: `src/overlay.ts` (`POSE_BODY_CONNECTIONS`, `drawSkeleton`), `src/screens/result.ts` (chip + render hook)

**Interfaces:**

```ts
// overlay.ts — body-only BlazePose topology (face omitted: clutter, no coaching value)
export const POSE_BODY_CONNECTIONS: [number, number][] = [
  [11,12],[11,13],[13,15],[12,14],[14,16],          // shoulders + arms
  [11,23],[12,24],[23,24],                          // torso
  [23,25],[24,26],[25,27],[26,28],                  // legs
  [27,29],[28,30],[29,31],[30,32],[27,31],[28,32],  // feet
]
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame,
  highlightHips: boolean,   // amber hips during a fired hip-rise window
  minVis = 0.5,
): void
```

- [ ] Implement `drawSkeleton`: scale normalized lm by canvas w/h; skip segments where either end `vis < minVis`; chalk strokes `rgba(226,232,240,0.5)`, width 3, round caps; joints 4px dots same color; when `highlightHips`, draw `[23,24]` segment + both hip dots in `#FFB020` width 4. Low-confidence honesty: if <60% of the 12 body landmarks are visible, halve the alpha (dim, don't invent).
- [ ] `result.ts`: add chip after `#sound`: `<button id="skel" class="chip" aria-pressed="false">Skeleton</button>` — only when `app.data.poseFrames?.length`. Toggle sets `skelOn`, re-renders current frame; chip gets amber-active styling via `aria-pressed` (check `.chip` active pattern in `style.css`; reuse how speed/sound indicate state — text/aria only is fine, add `style.borderColor` amber when on).
- [ ] In `render(t)`: after `drawReview` (+ marker), when `skelOn`, find nearest `poseFrames` frame to `t` (linear scan is fine at ~150 frames) and `drawSkeleton(ctx, frame, hipCue?.fired === true && t >= hipCue.startT - 0.05 && t <= hipCue.endT + 0.05)`.
- [ ] Harness: toggle chip on a tracked clip, screenshot shows skeleton over the lifter; toggle off clears next render.
- [ ] Commit: `feat(overlay): toggleable skeleton overlay from persisted pose frames, amber hips on a fired cue window`

### Task C5: Sprint C verification + PR + merge

- [ ] `npm test`, `npm run build`, full harness run on `deadlift 10s.mp4` AND `deadlift 18s.mp4` with plate sizing (extend `scripts/e2e.mjs` locally into `scripts/e2e-phase2.mjs`: after the seed tap, `mouse.down/move/up` a ~60px drag for the plate; assert midfoot + hip cards exist; click `#skel`; screenshot).
- [ ] `/code-review` (medium); fix findings. PR `Phase 2: pose frames, early-hip-rise cue, skeleton overlay` → merge → deploy green.

---

### Task D1: Vertical bar-velocity series (pure + tests)

**Files:**
- Modify: `src/geometry.ts`
- Test: `test/geometry.test.ts`

**Interfaces:**

```ts
export interface VelocityPoint { t: number; vy: number }  // px/s; + = bar moving UP (screen y inverted)
export function verticalVelocity(path: PathPoint[], smoothWindow = 5): VelocityPoint[]
```

Central difference `vy[i] = -(y[i+1] - y[i-1]) / (t[i+1] - t[i-1])` (endpoints: one-sided), then a `smoothWindow` moving average over vy (reuse the smoothPath windowing shape inline). Returns `[]` for paths shorter than 2 points; guards zero dt (skip → carry previous, or 0 for degenerate).

- [ ] Failing tests: constant rise 100px/s → all vy ≈ 100; descent → negative; length === path length; `[]` on singleton; duplicate-t points don't produce NaN/Infinity.
- [ ] Implement → PASS. Commit: `feat(geometry): verticalVelocity series (central difference, smoothed)`

### Task D2: Playback-synced velocity graph on the result screen

**PRE-STEP (mandatory): invoke the `dataviz` skill before writing any chart code — it governs form/color/interaction. Apply its rules with the app's tokens (graphite ground, chalk text, green data, amber cursor/action).**

**Files:** Modify: `src/screens/result.ts` (+ small helpers kept inline or in `overlay.ts` if canvas-based)

- [ ] Card between the scrubber and the travel card: eyebrow "Bar speed", an inline SVG (or canvas) sparkline of `verticalVelocity(path)` vs t — line in the data green, zero baseline as a faint hairline, concentric region reads above the line naturally. Amber vertical cursor at `video.currentTime`, updated inside the existing `tick()`/`render()` loop and on `seeked`.
- [ ] Readouts (mono): `peak {v}` where calibrated → m/s (`pxToCm(vy, plate)/100`, 2dp), else px/s (0dp) — plus a live `now {v}` value at the cursor. One line of caption: "concentric bar speed — the pull off the floor".
- [ ] Pointer events on the graph seek the video (map x→t, same pattern as scrub input; pause first).
- [ ] Graph only renders when `path.length ≥ 8` (too-short tracks look like noise).
- [ ] Harness screenshot: graph visible, cursor moves with playback, tap seeks.
- [ ] Commit: `feat(result): playback-synced bar-velocity graph (m/s when calibrated)`

### Task D3: Drop the ~22 MB unused wasm pair

**Files:** Delete: `public/mediapipe/wasm/vision_wasm_module_internal.js`, `public/mediapipe/wasm/vision_wasm_module_internal.wasm`

- [ ] FIRST verify locally which wasm files the loader actually requests: run `node scripts/pose-smoke.mjs` (uses the vendored path via `#pose`) and capture requested URLs (add a temporary `page.on('request')` log locally if needed) → expect only `vision_wasm_internal.*`.
- [ ] `git rm` the two `_module_` files; `npm run build`; re-run pose-smoke → pose still loads, poses found.
- [ ] Commit: `chore(mediapipe): drop unused vision_wasm_module_internal pair (~22 MB off the deploy)`

### Task D4: Screen-enter polish

**Files:** Modify: `src/screens/setpoint.ts`, `src/screens/processing.ts`, `src/screens/upload.ts` (only where missing)

- [ ] Check `style.css` for the existing `rise` animation class (result/library use it). Add `rise` to the root wrapper of any screen missing it (setpoint has it? verify — add where absent). Nothing heavier; no new animation system.
- [ ] Build green; visual spot-check via harness screenshots.
- [ ] Commit: `feat(ui): consistent screen-enter rise across screens`

### Task D5: Sprint D verification + PR + merge

- [ ] `npm test` + `npm run build` + `e2e-phase2.mjs` both clips; `/code-review` (medium); PR `Velocity graph + polish + 22 MB lighter deploy` → merge → deploy green.

---

### Task E1: HANDOFF + docs + memory wrap-up

**Files:** Modify: `HANDOFF.md`; Create: none. Memory dir: session notes.

- [ ] Rewrite HANDOFF "START HERE": Phase 1 merged; Phase 1.5 + Phase 2 (minus build slider) + velocity graph SHIPPED tonight; new device-test checklist for JP (midfoot line position vs laces, good-tone cards on a clean rep, hip cue sanity, skeleton toggle feel, velocity graph legibility, post-save New, scale redo hint, airplane-mode reload after the wasm removal); deferred = build slider (needs JP's UX call), flagCm tuning (needs clip library), facing-detection copy upgrade.
- [ ] Note the "confirm exact heel/toe weighting across JP's clip library" item stays open (Phase 2 validation data).
- [ ] Commit `docs: HANDOFF — overnight build shipped (Phase 1.5 + Phase 2 + velocity graph)`; push to master (docs-only, matches repo history of docs commits straight to the feature branch/master).
- [ ] Update auto-memory: pose-spike-verdict note gains "Phase 2 shipped"; add memory for hip-rise cue thresholds (ratio 1.5, window 25% ROM — untuned, awaiting JP clips).
- [ ] Final live check: fetch the Pages URL, confirm new bundle hash; leave a clear summary for JP.

## Self-review

- Spec coverage: all four device-test findings (B1–B4) ✓; Phase 2 = poseFrames (C1), hip-rise (C2–C3), skeleton (C4) ✓, build slider explicitly deferred with rationale ✓; velocity graph (D1–D2) = backlog #5 ✓; wasm cleanup (D3) = HANDOFF deferred item, gated on a local load verification ✓; tone-not-visibility (B2) honors "uncalibrated stays silent" ✓.
- Types consistent: `PoseLm`/`PoseFrame`/`slimFrame` (C1) consumed by C2/C4; `HipRiseCue` (C2) consumed by C3/C4; `verticalVelocity` (D1) consumed by D2; `tone` (B2) consumed by C3's card pattern.
- No placeholders: every code step has real code or an exact copy/DOM spec.
