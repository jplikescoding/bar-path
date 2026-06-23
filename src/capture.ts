export function playAndProcess(
  video: HTMLVideoElement,
  startTime: number,
  endTime: number | null,
  onFrame: (gray: any, t: number) => void | Promise<void>,
  onProgress: (frac: number) => void,
): Promise<void> {
  const cv = (window as any).cv
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const end = endTime ?? video.duration
  const span = Math.max(0.001, end - startTime)

  return new Promise((resolve) => {
    let finished = false
    const finish = () => { if (!finished) { finished = true; video.pause(); resolve() } }
    const onTick = async (_now: number, meta: any) => {
      const t = meta?.mediaTime ?? video.currentTime
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const rgba = cv.imread(canvas)
      const gray = new cv.Mat()
      cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY)
      rgba.delete()
      await onFrame(gray, t)
      gray.delete()
      onProgress(Math.min(1, (t - startTime) / span))
      // stop at the trimmed end (or the clip's natural end)
      if (!video.ended && t < end) video.requestVideoFrameCallback(onTick)
      else finish()
    }
    const begin = () => {
      video.muted = true
      video.requestVideoFrameCallback(onTick)
      video.play().catch(() => finish())
    }
    video.addEventListener('ended', finish, { once: true })
    if (Math.abs(video.currentTime - startTime) > 0.01) {
      video.addEventListener('seeked', begin, { once: true })
      video.currentTime = startTime
    } else begin()
  })
}
