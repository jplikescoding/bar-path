import { pxToCm, type PathPoint } from './geometry'
import type { BarDriftCue, HipRiseCue, LiftType, MidfootEstimate, PoseFrame, SquatDepthCue } from './coach'

// A persisted, completed bar-path analysis. Mirrors AppData plus the bits we need
// to render a library list (name/date/thumbnail/drift) and to reopen later.
export interface SavedAnalysis {
  id: string
  name: string
  createdAt: number // ms epoch
  video: Blob
  seed: { x: number; y: number }
  startTime: number
  endTime: number | null
  verticalAngleRad: number | null
  path: PathPoint[]
  thumbnail: string // data: URL JPEG
  driftRange: number
  plateDiameterPx?: number | null // bar-plate diameter in px; enables cm readout. Optional: older records lack it.
  cue?: BarDriftCue | null            // bar-off-midfoot cue; optional — older records lack it
  poseMidfoot?: MidfootEstimate | null
  poseFrames?: PoseFrame[] | null     // slim per-frame pose (skeleton overlay); optional — older records lack it
  hipCue?: HipRiseCue | null          // early-hip-rise timing cue; optional — older records lack it
  liftType?: LiftType                 // Phase 3; optional — older records are deadlifts
  sideOn?: boolean | null             // squat angle answer; optional — older records lack it
  depthCue?: SquatDepthCue | null     // squat depth readout; optional — older records lack it
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// e.g. "Lift — Jun 23, 7:14 PM". Uses new Date(createdAt) (allowed with an arg).
export function defaultName(createdAt: number): string {
  const d = new Date(createdAt)
  const month = MONTHS[d.getMonth()]
  const day = d.getDate()
  let hours = d.getHours()
  const minutes = d.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  if (hours === 0) hours = 12
  const mm = minutes < 10 ? `0${minutes}` : String(minutes)
  return `Lift — ${month} ${day}, ${hours}:${mm} ${ampm}`
}

// Newest first by createdAt. Returns a new array; does not mutate the input.
export function sortByNewest(list: SavedAnalysis[]): SavedAnalysis[] {
  return list.slice().sort((a, b) => b.createdAt - a.createdAt)
}

// e.g. "drift 95px", or "drift 8.4cm" when the lift was plate-calibrated. Squat
// records are prefixed ("squat · drift 8.4cm") so lifts are tellable apart in the
// list; deadlift/legacy rows read exactly as before.
export function driftSubtitle(range: number, plateDiameterPx?: number | null, liftType?: LiftType): string {
  const prefix = liftType === 'squat' ? 'squat · ' : ''
  if (plateDiameterPx) {
    return `${prefix}drift ${pxToCm(range, plateDiameterPx).toFixed(1)}cm`
  }
  return `${prefix}drift ${Math.round(range)}px`
}
