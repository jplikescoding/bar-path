import type { PathPoint } from './geometry'

export type Screen = 'upload' | 'setpoint' | 'processing' | 'result'

export interface AppData {
  videoUrl: string | null
  videoEl: HTMLVideoElement | null
  seed: { x: number; y: number } | null
  verticalAngleRad: number | null
  startTime: number
  endTime: number | null
  path: PathPoint[]
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
  }
}
