import type { PathPoint } from './geometry'

export type Screen = 'upload' | 'setpoint' | 'processing' | 'result' | 'library'

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
  }
}
