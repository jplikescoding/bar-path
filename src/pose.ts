// Lazy MediaPipe Pose Landmarker loader, mirroring src/opencv.ts: nothing loads
// until loadPose() is first called, so the main app pays zero cost. Assets are
// vendored same-origin under public/mediapipe/ (offline, no third-party CDN).

// Vendored same-origin (public/mediapipe/, like public/opencv.js) — offline, no CDN.
// Resolve against document.baseURI so it works under the GitHub Pages '/bar-path/' subpath.
const ASSETS = new URL('mediapipe/', document.baseURI)
const BUNDLE = new URL('vision_bundle.mjs', ASSETS).href
const WASM = new URL('wasm', ASSETS).href // FilesetResolver wants the wasm DIRECTORY url
// "lite" pose model — smallest/fastest; the spike validated it at ~14.6 fps on iPhone.
const MODEL = new URL('pose_landmarker_lite.task', ASSETS).href

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
