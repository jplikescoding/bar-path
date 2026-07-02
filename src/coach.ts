import { horizontalDrift, pxToCm, type PathPoint } from './geometry'
import type { Landmark } from './pose'

// A slimmed BlazePose landmark kept per frame: normalized x/y + visibility.
// z is dropped (nothing here may claim depth from 2D — report guardrail) and
// values are rounded so persisted poseFrames stay small in IndexedDB.
export interface PoseLm { x: number; y: number; vis?: number }
// One pose detection: t = the frame's mediaTime (seconds, same clock as PathPoint.t).
export interface PoseFrame { t: number; lm: PoseLm[] }

// Reduce a raw MediaPipe detection to a PoseFrame (4dp positions, 2dp visibility).
export function slimFrame(landmarks: Landmark[], t: number): PoseFrame {
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4
  return {
    t,
    lm: landmarks.map((l) => l.visibility == null
      ? { x: r4(l.x), y: r4(l.y) }
      : { x: r4(l.x), y: r4(l.y), vis: Math.round(l.visibility * 100) / 100 }),
  }
}

// One robust midfoot reference: the median camera-side foot x (pixels) plus how
// many frames contributed and the fraction that did (confidence).
export interface MidfootEstimate { x: number; frames: number; conf: number }

// The single deadlift coaching cue. driftCm is null when no plate scale is set
// (UI shows px). refSource records whether the reference was the pose midfoot or
// the plate-tap fallback line; confidence is 'ok' only for a calibrated pose-midfoot cue.
// tone: 'good' = drift under the flag threshold (positive card), 'nudge' = at/above.
export interface BarDriftCue {
  driftCm: number | null
  driftPx: number
  frameT: number
  refX: number
  refSource: 'pose-midfoot' | 'plate-tap'
  confidence: 'ok' | 'low'
  tone: 'good' | 'nudge'
}

// BlazePose heels (29,30) and toes (31,32). Midfoot = the heel↔toe midpoint —
// anatomy, not landmark averaging: the ankle sits OVER the heel, so including it
// biased the line toward the heel (validated on a real clip, 2026-06-29).
const HEELS = [29, 30]
const TOES = [31, 32]

// Reduce one pose frame to a midfoot x in PIXELS (landmarks are normalized 0..1).
// Needs at least one visible heel AND one visible toe; otherwise null.
export function midfootXFromFrame(
  landmarks: PoseLm[],
  videoWidth: number,
  minVis = 0.5,
): number | null {
  const avg = (idxs: number[]): number | null => {
    let sum = 0, n = 0
    for (const i of idxs) {
      const lm = landmarks[i]
      if (!lm) continue
      if (lm.vis != null && lm.vis < minVis) continue
      sum += lm.x; n++
    }
    return n ? sum / n : null
  }
  const heel = avg(HEELS), toe = avg(TOES)
  if (heel == null || toe == null) return null
  return ((heel + toe) / 2) * videoWidth
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

// ——— Early-hip-rise cue (Phase 2) ———————————————————————————————————————————
// "Hips shooting up before the bar leaves the floor" is one of the report's few
// build-independent, reliably-2D deadlift faults (§3.2/§4.4): compare how much
// the HIPS rise vs how much the BAR rises over the early pull. The ratio is
// unitless, so it works without a plate scale — but only with strong pose data.

export interface HipRiseCue {
  ratio: number      // hip rise ÷ bar rise over the early-pull window
  fired: boolean     // true = hips shot up early (nudge); false = moved together (positive)
  startT: number     // pull start (bar leaves its bottom)
  endT: number       // window end (bar has risen windowFrac of its ROM)
  frameT: number     // moment of max hip-vs-bar divergence (scrub tick / seek target)
}

const LEFT_HIP = 23, RIGHT_HIP = 24

// Mean visible hip y for one frame (normalized 0..1), or null if neither hip clears minVis.
export function hipYFromFrame(lm: PoseLm[], minVis = 0.5): number | null {
  let sum = 0, n = 0
  for (const i of [LEFT_HIP, RIGHT_HIP]) {
    const l = lm[i]
    if (!l) continue
    if (l.vis != null && l.vis < minVis) continue
    sum += l.y; n++
  }
  return n ? sum / n : null
}

const median = (xs: number[]): number => {
  const s = xs.slice().sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Pure & total. Silence (null) whenever the geometry or the pose data is not
// trustworthy — a wrong timing call is worse than no call (report guardrail).
export function analyzeHipRise(
  path: PathPoint[],
  poseFrames: PoseFrame[] | null,
  videoHeight: number,
  opts: {
    fireRatio?: number      // hips rising this many × the bar fires the nudge
    windowFrac?: number     // early-pull window = bar's first fraction of its ROM
    minFrames?: number      // pose frames with a visible hip needed inside the window
    minHipRiseFrac?: number // hip rise (× videoHeight) below this never fires (noise floor)
    minRomFrac?: number     // bar ROM (× videoHeight) below this = no real pull → silence
  } = {},
): HipRiseCue | null {
  if (!path.length || !poseFrames?.length || videoHeight <= 0) return null
  const fireRatio = opts.fireRatio ?? 1.5
  const windowFrac = opts.windowFrac ?? 0.25
  const minFrames = opts.minFrames ?? 5
  const minHipRisePx = (opts.minHipRiseFrac ?? 0.02) * videoHeight
  const minRomPx = (opts.minRomFrac ?? 0.15) * videoHeight

  // The judged movement is the ASCENT to the bar's highest point. Real clips
  // often end with the bar lowered back down (sometimes below the start), so the
  // bottom is measured AT OR BEFORE the top — never the set-down. And the bar can
  // sit on the floor for seconds of setup, so the pull START is the LAST moment
  // the bar is still at bottom level (within 5% of ROM) before the ascent — not
  // the first bottom frame (validated on a real clip: anchoring at frame 0 put
  // the measuring window in dead setup time / a pose gap).
  let top = path[0]
  for (const p of path) if (p.y < top.y) top = p
  let bottomY = -Infinity
  for (const p of path) {
    if (p.t > top.t) break
    if (p.y > bottomY) bottomY = p.y
  }
  const rom = bottomY - top.y
  if (rom < minRomPx) return null
  let bottom = path[0]
  for (const p of path) {
    if (p.t > top.t) break
    if (p.y >= bottomY - 0.05 * rom) bottom = p
  }

  // Window end = first frame at/after the pull start where the bar has risen windowFrac·ROM.
  const risenY = bottomY - windowFrac * rom
  let end: PathPoint | null = null
  for (const p of path) {
    if (p.t < bottom.t) continue
    if (p.y <= risenY) { end = p; break }
  }
  if (!end) return null
  const startT = bottom.t, endT = end.t

  // Hip samples inside the window (px, screen-down like the bar path).
  const hips: { t: number; y: number }[] = []
  for (const f of poseFrames) {
    if (f.t < startT || f.t > endT) continue
    const y = hipYFromFrame(f.lm)
    if (y != null) hips.push({ t: f.t, y: y * videoHeight })
  }
  if (hips.length < minFrames) return null

  // Rise over the window, endpoints estimated as medians of the first/last 20%
  // (identical slices for hip and bar, so landmark jitter attenuates both alike).
  const slice = 0.2 * (endT - startT)
  const inStart = (t: number) => t <= startT + slice
  const inEnd = (t: number) => t >= endT - slice
  const hipStartYs = hips.filter((h) => inStart(h.t)).map((h) => h.y)
  const hipEndYs = hips.filter((h) => inEnd(h.t)).map((h) => h.y)
  const barStartYs = path.filter((p) => p.t >= startT && inStart(p.t)).map((p) => p.y)
  const barEndYs = path.filter((p) => p.t <= endT && inEnd(p.t)).map((p) => p.y)
  if (!hipStartYs.length || !hipEndYs.length || !barStartYs.length || !barEndYs.length) return null

  const hipStart = median(hipStartYs)
  const hipRise = hipStart - median(hipEndYs)
  const barStart = median(barStartYs)
  const barRise = barStart - median(barEndYs)
  if (barRise <= 0) return null

  const ratio = hipRise / barRise
  const fired = ratio >= fireRatio && hipRise >= minHipRisePx

  // Peak divergence: where the hips have gotten the farthest ahead of the bar.
  let frameT = endT, peak = -Infinity
  let pi = 0
  for (const hp of hips) {
    while (pi < path.length - 1 && path[pi].t < hp.t) pi++
    const div = (hipStart - hp.y) - (barStart - path[pi].y)
    if (div > peak) { peak = div; frameT = hp.t }
  }

  return { ratio, fired, startT, endT, frameT }
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
  // Threshold gates TONE, not visibility (JP, 2026-06-29): a calibrated clip always
  // gets a midfoot cue — positive below flagCm, a nudge at/above — so the pose pass
  // is visible even on a clean rep. Uncalibrated stays SILENT (a px drift is
  // resolution-dependent and not actionable); a caller may opt into px NUDGES by
  // passing opts.flagPx explicitly (below flagPx stays silent — no good tone
  // without a real number).
  let tone: BarDriftCue['tone']
  if (calibrated) tone = driftCm! >= flagCm ? 'nudge' : 'good'
  else if (opts.flagPx != null && driftPx >= opts.flagPx) tone = 'nudge'
  else return null

  const confidence: BarDriftCue['confidence'] =
    refSource === 'pose-midfoot' && calibrated ? 'ok' : 'low'
  return { driftCm, driftPx, frameT, refX, refSource, confidence, tone }
}
