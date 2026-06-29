// THROWAWAY SPIKE (branch spike/pose). Lazy MediaPipe Pose Landmarker loader,
// mirroring src/opencv.ts: nothing loads until loadPose() is first called, so
// the main app pays zero cost. If Phase 1 ships, vendor these assets same-origin
// (like public/opencv.js) instead of pulling from CDN.

const VERSION = '0.10.35'
const BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`
// "lite" is the smallest/fastest of the three pose models — right for a feasibility floor.
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

// One BlazePose landmark, normalized to the frame (x,y in 0..1; z depth from hips).
export interface Landmark { x: number; y: number; z: number; visibility?: number }
// A bone: indices into the 33-landmark array.
export interface Connection { start: number; end: number }

export interface PoseApi {
  // Run inference on the current video frame. timestampMs MUST strictly increase
  // across calls (VIDEO mode requirement) — pass performance.now().
  detect(video: HTMLVideoElement, timestampMs: number): Landmark[][]
  connections: Connection[]
}

let promise: Promise<PoseApi> | null = null

export function loadPose(): Promise<PoseApi> {
  if (promise) return promise
  promise = (async () => {
    const vision: any = await import(/* @vite-ignore */ BUNDLE)
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM)
    const landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, // GPU = WebGL on the web
      runningMode: 'VIDEO',
      numPoses: 1,
    })
    return {
      detect(video: HTMLVideoElement, timestampMs: number): Landmark[][] {
        const res = landmarker.detectForVideo(video, timestampMs)
        return res?.landmarks ?? []
      },
      connections: vision.PoseLandmarker.POSE_CONNECTIONS as Connection[],
    }
  })()
  return promise
}
