import { horizontalDrift, pxToCm, type PathPoint } from './geometry'
import type { Landmark } from './pose'

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
