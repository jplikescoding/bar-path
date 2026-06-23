import { drawOverlay } from './overlay'
import type { PathPoint } from './geometry'

function pickMime(): string {
  const c = ['video/mp4;codecs=h264', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
  for (const m of c) if ((window as any).MediaRecorder?.isTypeSupported?.(m)) return m
  return 'video/webm'
}

export function exportOverlay(opts: {
  video: HTMLVideoElement
  canvas: HTMLCanvasElement
  path: PathPoint[]
  refX: number
  startTime: number
  onProgress?: (f: number) => void
}): Promise<Blob> {
  const { video, canvas, path, refX, startTime, onProgress } = opts
  const ctx = canvas.getContext('2d')!
  const mime = pickMime()
  const stream = canvas.captureStream(30)
  const rec = new MediaRecorder(stream, { mimeType: mime })
  const chunks: BlobPart[] = []
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  const endT = path[path.length - 1]?.t ?? video.duration

  return new Promise((resolve, reject) => {
    let stopped = false
    rec.onstop = () => resolve(new Blob(chunks, { type: mime }))
    rec.onerror = (e) => reject(e)
    const onTick = (_n: number, meta: any) => {
      const t = meta?.mediaTime ?? video.currentTime
      drawOverlay(ctx, video, path, t, refX)
      onProgress?.(Math.min(1, (t - startTime) / Math.max(0.001, endT - startTime)))
      if (!video.ended && t < endT) video.requestVideoFrameCallback(onTick)
      else if (!stopped) { stopped = true; rec.stop() }
    }
    const begin = () => { rec.start(); video.requestVideoFrameCallback(onTick); video.play().catch(reject) }
    video.addEventListener('seeked', begin, { once: true })
    video.currentTime = startTime
  })
}
