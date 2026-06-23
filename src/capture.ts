export function playAndProcess(
  video: HTMLVideoElement,
  startTime: number,
  onFrame: (gray: any, t: number) => void,
  onProgress: (frac: number) => void,
): Promise<void> {
  const cv = (window as any).cv
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const duration = video.duration

  return new Promise((resolve) => {
    const onTick = (_now: number, meta: any) => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const rgba = cv.imread(canvas)
      const gray = new cv.Mat()
      cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY)
      rgba.delete()
      const t = meta?.mediaTime ?? video.currentTime
      onFrame(gray, t)
      gray.delete()
      onProgress(Math.min(1, (t - startTime) / Math.max(0.001, duration - startTime)))
      if (!video.ended) video.requestVideoFrameCallback(onTick)
    }
    const begin = () => {
      video.requestVideoFrameCallback(onTick)
      video.play()
    }
    video.addEventListener('ended', () => resolve(), { once: true })
    if (Math.abs(video.currentTime - startTime) > 0.01) {
      video.addEventListener('seeked', begin, { once: true })
      video.currentTime = startTime
    } else begin()
  })
}
