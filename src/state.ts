import type { PathPoint } from './geometry'
import type { BarDriftCue, HipRiseCue, MidfootEstimate, PoseFrame } from './coach'

export type Screen = 'upload' | 'setpoint' | 'processing' | 'result' | 'library' | 'posetest'

export interface AppData {
  videoUrl: string | null
  videoEl: HTMLVideoElement | null
  seed: { x: number; y: number } | null
  verticalAngleRad: number | null
  startTime: number
  endTime: number | null
  path: PathPoint[]
  // id of the persisted analysis when the result screen is showing a saved lift
  // (reopened from the library, or just saved). null = a fresh, unsaved track.
  savedId: string | null
  // diameter (in video pixels) of the bar plate, captured by the optional
  // drag-to-rim gesture on the setup screen. Lets drift read in cm (a 45 cm
  // plate is the ruler). null = not calibrated → drift stays in pixels.
  plateDiameterPx: number | null
  // Pose-derived midfoot reference (camera-side foot x, robust median) for the
  // bar-off-midfoot cue; null when pose was unavailable/too weak.
  poseMidfoot: MidfootEstimate | null
  // The deadlift bar-off-midfoot coaching cue, or null when none fired.
  cue: BarDriftCue | null
  // Slim per-frame pose landmarks from the pose pass (skeleton overlay +
  // hip-rise cue); null when pose was unavailable.
  poseFrames: PoseFrame[] | null
  // Early-hip-rise timing cue (fired or positive); null when unjudgeable.
  hipCue: HipRiseCue | null
}

export function initialData(): AppData {
  return {
    videoUrl: null,
    videoEl: null,
    seed: null,
    verticalAngleRad: null,
    startTime: 0,
    endTime: null,
    path: [],
    savedId: null,
    plateDiameterPx: null,
    poseMidfoot: null,
    cue: null,
    poseFrames: null,
    hipCue: null,
  }
}
