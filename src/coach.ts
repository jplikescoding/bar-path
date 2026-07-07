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

const median = (xs: number[]): number => {
  const s = xs.slice().sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Mean of the given landmarks' x or y over the visibility floor; null when none clear it.
function meanVisible(lm: PoseLm[], idxs: number[], axis: 'x' | 'y', minVis: number): number | null {
  let sum = 0, n = 0
  for (const i of idxs) {
    const l = lm[i]
    if (!l) continue
    if (l.vis != null && l.vis < minVis) continue
    sum += l[axis]; n++
  }
  return n ? sum / n : null
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
  // Which way the peak drift went relative to the LIFTER (toes = forward), set
  // only when facing is known AND the reference is the pose midfoot (Phase 3).
  direction?: 'forward' | 'backward'
}

// Which lift the user said this clip is (setup-screen prompt). Deadlift is the
// default and keeps every pre-Phase-3 behavior; squat unlocks squat-worded cues
// only when the user also confirmed a side-on angle (report §7 Phase 3 gate).
export type LiftType = 'deadlift' | 'squat'

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
  const heel = meanVisible(landmarks, HEELS, 'x', minVis)
  const toe = meanVisible(landmarks, TOES, 'x', minVis)
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
  return { x: median(xs), frames: xs.length, conf: xs.length / perFrameX.length }
}

// ——— Facing detection (Phase 3) ——————————————————————————————————————————————
// Which way the lifter points, from heel/toe x-ordering alone (side-on: toes sit
// clearly left or right of the heels; end-on: feet point at the camera and the
// spread collapses below the margin → null, so this self-gates on bad angles).
// Purely 2D x-ordering — no depth/3D claims (report guardrail).

export type Facing = 'left' | 'right'

// Median per-frame toe−heel spread (normalized x) must clear this to call a
// facing. Tuning knob (heuristic awaiting JP's clip library, like the rest).
export const FACING_MARGIN = 0.02

export function detectFacing(
  poseFrames: PoseFrame[] | null,
  opts: { minFrames?: number; margin?: number; minVis?: number } = {},
): Facing | null {
  if (!poseFrames?.length) return null
  const minFrames = opts.minFrames ?? 5
  const margin = opts.margin ?? FACING_MARGIN
  const minVis = opts.minVis ?? 0.5
  const deltas: number[] = []
  for (const f of poseFrames) {
    const heel = meanVisible(f.lm, HEELS, 'x', minVis)
    const toe = meanVisible(f.lm, TOES, 'x', minVis)
    if (heel == null || toe == null) continue
    deltas.push(toe - heel)
  }
  if (deltas.length < minFrames) return null
  const m = median(deltas)
  if (Math.abs(m) < margin) return null
  return m > 0 ? 'right' : 'left'
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

const HIPS = [23, 24]

// The pose pass warms up this many seconds BEFORE the trim start: MediaPipe
// VIDEO mode's person detector often misses a lifter already bent over the bar
// on a cold start, but the tracker follows fine once locked while they stand/
// approach. Lives here with the other pose tuning knobs (Phase 2 clip-library
// tuning adjusts them together).
export const POSE_WARMUP_S = 2

// Mean visible hip y for one frame (normalized 0..1), or null if neither hip clears minVis.
export function hipYFromFrame(lm: PoseLm[], minVis = 0.5): number | null {
  return meanVisible(lm, HIPS, 'y', minVis)
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
    lift?: LiftType         // squat anchors the window at the HOLE, not the floor
  } = {},
): HipRiseCue | null {
  if (!path.length || !poseFrames?.length || videoHeight <= 0) return null
  const fireRatio = opts.fireRatio ?? 1.5
  const windowFrac = opts.windowFrac ?? 0.25
  const minFrames = opts.minFrames ?? 5
  const minHipRisePx = (opts.minHipRiseFrac ?? 0.02) * videoHeight
  const minRomPx = (opts.minRomFrac ?? 0.15) * videoHeight

  // The judged movement is an ASCENT; each lift anchors it differently.
  // DEADLIFT (default): the ascent ends at the bar's highest point; the bar can
  // sit on the floor for seconds of setup and clips often end with the bar set
  // back down, so the bottom is measured AT OR BEFORE the top — never the
  // set-down (validated on a real clip: anchoring at frame 0 put the measuring
  // window in dead setup time / a pose gap).
  // SQUAT: the clip STARTS at standing height, so the deadlift anchoring would
  // misread it. The ascent starts at the bar's DEEPEST point (the hole) and
  // ends at its highest point AFTER the hole.
  let top: PathPoint
  let bottomY: number
  if (opts.lift === 'squat') {
    let deepest = path[0]
    for (const p of path) if (p.y > deepest.y) deepest = p
    bottomY = deepest.y
    top = deepest
    for (const p of path) if (p.t >= deepest.t && p.y < top.y) top = p
  } else {
    top = path[0]
    for (const p of path) if (p.y < top.y) top = p
    bottomY = -Infinity
    for (const p of path) {
      if (p.t > top.t) break
      if (p.y > bottomY) bottomY = p.y
    }
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
  opts: { flagCm?: number; flagPx?: number; minConf?: number; facing?: Facing | null } = {},
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
  let frameT = path[0].t, peak = -1, peakSigned = 0
  for (const p of path) {
    const d = Math.abs(p.x - refX)
    if (d > peak) { peak = d; peakSigned = p.x - refX; frameT = p.t }
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
  const cue: BarDriftCue = { driftCm, driftPx, frameT, refX, refSource, confidence, tone }
  // Forward/backward wording needs BOTH a known facing and a real midfoot
  // reference — the plate-tap fallback line says nothing about the feet.
  if (opts.facing && refSource === 'pose-midfoot' && peakSigned !== 0) {
    const towardToes = (peakSigned > 0) === (opts.facing === 'right')
    cue.direction = towardToes ? 'forward' : 'backward'
  }
  return cue
}

// ——— Squat depth readout (Phase 3) ———————————————————————————————————————————
// A MEASUREMENT, not a verdict (report §4.3: sub-parallel depth is normal for
// many builds — flagging it is the false-positive trap; §7 Phase 3 still wants
// depth surfaced). At the bar's deepest moment, how far the hip landmarks sit
// below/above the knee landmarks. Rendered as a neutral data card — never amber,
// never a prescription, and never any "you can't squat deep" claim.

const KNEES = [25, 26]

// Pose frames within ± this many seconds of the deepest bar point contribute
// (median over the window attenuates landmark jitter at one frame).
export const DEPTH_WINDOW_S = 0.15
// |hip−knee| inside this fraction of videoHeight reads as "level with the knee"
// — landmark noise must not manufacture a below/above call. Tuning knob.
export const DEPTH_LEVEL_BAND_FRAC = 0.008

export interface SquatDepthCue {
  dropPx: number         // hip below knee at the deepest bar point; + = below
  dropCm: number | null  // signed, when plate-calibrated
  where: 'below' | 'level' | 'above'
  frameT: number         // the deepest bar moment (seek target)
}

// Pure & total. Null whenever the hips/knees aren't clearly visible around the
// bottom — silence over a wrong number (report guardrail).
export function analyzeSquatDepth(
  path: PathPoint[],
  poseFrames: PoseFrame[] | null,
  videoHeight: number,
  plateDiameterPx: number | null,
  opts: { windowS?: number; levelBandFrac?: number; minFrames?: number; minVis?: number } = {},
): SquatDepthCue | null {
  if (!path.length || !poseFrames?.length || videoHeight <= 0) return null
  const windowS = opts.windowS ?? DEPTH_WINDOW_S
  const band = (opts.levelBandFrac ?? DEPTH_LEVEL_BAND_FRAC) * videoHeight
  const minFrames = opts.minFrames ?? 3
  const minVis = opts.minVis ?? 0.5

  let deepest = path[0]
  for (const p of path) if (p.y > deepest.y) deepest = p

  const drops: number[] = []
  for (const f of poseFrames) {
    if (Math.abs(f.t - deepest.t) > windowS) continue
    const hipY = meanVisible(f.lm, HIPS, 'y', minVis)
    const kneeY = meanVisible(f.lm, KNEES, 'y', minVis)
    if (hipY == null || kneeY == null) continue
    drops.push((hipY - kneeY) * videoHeight) // screen y grows down: + = hip below knee
  }
  if (drops.length < minFrames) return null

  const dropPx = median(drops)
  const calibrated = plateDiameterPx != null && plateDiameterPx > 0
  return {
    dropPx,
    dropCm: calibrated ? pxToCm(dropPx, plateDiameterPx!) : null,
    where: dropPx > band ? 'below' : dropPx < -band ? 'above' : 'level',
    frameT: deepest.t,
  }
}
