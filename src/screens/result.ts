import type { App } from '../app'
import { drawReview } from '../overlay'
import { rotatePath, horizontalDrift, type PathPoint } from '../geometry'

export function renderResult(app: App, root: HTMLElement): void {
  const video = app.data.videoEl!
  const seed = app.data.seed!
  let path: PathPoint[] = app.data.path
  if (app.data.verticalAngleRad != null) path = rotatePath(path, app.data.verticalAngleRad, seed)
  const refX = seed.x
  const drift = horizontalDrift(path, refX)
  const startT = app.data.startTime
  const endT = Math.max(startT + 0.1, path[path.length - 1]?.t ?? app.data.endTime ?? video.duration)

  root.innerHTML = `
    <div class="min-h-screen flex flex-col gap-3 p-3">
      <div id="stage" class="relative w-fit mx-auto"></div>
      <div class="flex items-center gap-3 justify-center">
        <button id="play" class="w-14 h-11 rounded bg-blue-600 text-lg">▶</button>
        <button id="speed" class="px-3 h-11 rounded bg-neutral-700 text-sm">🐢 1×</button>
      </div>
      <input id="scrub" type="range" min="0" max="1000" value="0" class="w-full" />
      <div class="text-center text-sm text-neutral-300">
        Horizontal drift — left <span class="text-neutral-100">${drift.maxLeft.toFixed(0)}px</span>,
        right <span class="text-neutral-100">${drift.maxRight.toFixed(0)}px</span>,
        total <span class="text-neutral-100">${drift.range.toFixed(0)}px</span>
        ${app.data.verticalAngleRad != null ? '<span class="text-cyan-400">(tilt-corrected)</span>' : ''}
      </div>
      <div class="flex gap-2 justify-center">
        <button id="export" class="px-4 py-2 rounded bg-green-600">Export video</button>
        <button id="new" class="px-4 py-2 rounded bg-neutral-700">New video</button>
      </div>
    </div>`

  const stage = root.querySelector<HTMLDivElement>('#stage')!
  video.className = 'max-h-[58vh] w-auto block rounded-lg'
  stage.appendChild(video)
  const canvas = document.createElement('canvas')
  canvas.className = 'absolute inset-0 w-full h-full pointer-events-none'
  canvas.width = video.videoWidth; canvas.height = video.videoHeight
  stage.appendChild(canvas)
  const ctx = canvas.getContext('2d')!

  const playBtn = root.querySelector<HTMLButtonElement>('#play')!
  const speedBtn = root.querySelector<HTMLButtonElement>('#speed')!
  const scrub = root.querySelector<HTMLInputElement>('#scrub')!

  const speeds = [1, 0.5, 0.25]
  let speedIdx = 0
  let exporting = false
  const ac = new AbortController()

  const render = (t: number) => drawReview(ctx, path, t, refX)
  const setScrubFromTime = (t: number) => { scrub.value = String(Math.round(((t - startT) / (endT - startT)) * 1000)) }

  const tick = () => {
    render(video.currentTime); setScrubFromTime(video.currentTime)
    if (video.paused) return
    if (video.currentTime >= endT) { video.pause(); playBtn.textContent = '▶'; render(endT); return }
    video.requestVideoFrameCallback(tick)
  }
  const play = () => {
    if (video.currentTime >= endT - 0.05) video.currentTime = startT
    video.muted = true
    video.playbackRate = speeds[speedIdx]
    video.play().then(() => { playBtn.textContent = '⏸'; video.requestVideoFrameCallback(tick) }).catch(() => {})
  }
  const pause = () => { video.pause(); playBtn.textContent = '▶' }

  playBtn.addEventListener('click', () => { video.paused ? play() : pause() })
  speedBtn.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % speeds.length
    speedBtn.textContent = `🐢 ${speeds[speedIdx]}×`
    if (!video.paused) video.playbackRate = speeds[speedIdx]
  })
  scrub.addEventListener('input', () => {
    if (!video.paused) pause()
    video.currentTime = startT + (Number(scrub.value) / 1000) * (endT - startT)
  })
  video.addEventListener('seeked', () => { if (video.paused && !exporting) render(video.currentTime) }, { signal: ac.signal })

  root.querySelector('#new')!.addEventListener('click', () => { ac.abort(); video.pause(); app.reset(); app.go('upload') })
  root.querySelector('#export')!.addEventListener('click', async () => {
    const btn = root.querySelector<HTMLButtonElement>('#export')!
    pause(); btn.disabled = true; btn.textContent = 'Exporting…'; exporting = true
    try {
      const { exportOverlay } = await import('../exportVideo')
      const blob = await exportOverlay({ video, path, refX, startTime: startT, endTime: endT,
        onProgress: (f) => { btn.textContent = `Exporting… ${Math.round(f * 100)}%` } })
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = `bar-path.${ext}`; a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) { btn.textContent = 'Export failed'; console.error(err) }
    finally {
      exporting = false; btn.disabled = false
      if (btn.textContent !== 'Export failed') btn.textContent = 'Export video'
      video.currentTime = startT; render(startT); setScrubFromTime(startT)
    }
  })

  // start paused at the first frame with the full path visible
  video.currentTime = startT
  render(startT)
}
