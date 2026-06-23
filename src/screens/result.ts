import type { App } from '../app'
import { drawPath } from '../overlay'
import { rotatePath, horizontalDrift, type PathPoint } from '../geometry'

export function renderResult(app: App, root: HTMLElement): void {
  const video = app.data.videoEl!
  const seed = app.data.seed!
  let path: PathPoint[] = app.data.path
  if (app.data.verticalAngleRad != null) {
    path = rotatePath(path, app.data.verticalAngleRad, seed)
  }
  const refX = seed.x
  const drift = horizontalDrift(path, refX)
  const startT = app.data.startTime
  const endT = path[path.length - 1]?.t ?? app.data.endTime ?? video.duration

  root.innerHTML = `
    <div class="min-h-screen flex flex-col gap-3 p-3">
      <div id="stage" class="relative w-fit mx-auto"></div>
      <input id="scrub" type="range" min="0" max="1000" value="1000" class="w-full" />
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

  // Native video for the frame; transparent canvas on top for the path overlay.
  const stage = root.querySelector<HTMLDivElement>('#stage')!
  video.className = 'max-h-[60vh] w-auto block rounded-lg'
  stage.appendChild(video)
  const canvas = document.createElement('canvas')
  canvas.className = 'absolute inset-0 w-full h-full pointer-events-none'
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  stage.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  const scrub = root.querySelector<HTMLInputElement>('#scrub')!

  let exporting = false
  const renderAt = (t: number) => { ctx.clearRect(0, 0, canvas.width, canvas.height); drawPath(ctx, path, t, refX) }
  const ac = new AbortController()
  video.addEventListener('seeked', () => { if (!exporting) renderAt(video.currentTime) }, { signal: ac.signal })
  scrub.addEventListener('input', () => {
    video.currentTime = startT + (Number(scrub.value) / 1000) * (endT - startT)
  })

  root.querySelector('#new')!.addEventListener('click', () => { ac.abort(); app.reset(); app.go('upload') })
  root.querySelector('#export')!.addEventListener('click', async () => {
    const btn = root.querySelector<HTMLButtonElement>('#export')!
    btn.disabled = true; btn.textContent = 'Exporting…'
    exporting = true
    try {
      const { exportOverlay } = await import('../exportVideo')
      const blob = await exportOverlay({ video, path, refX, startTime: startT, endTime: app.data.endTime,
        onProgress: (f) => { btn.textContent = `Exporting… ${Math.round(f * 100)}%` } })
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = `bar-path.${ext}`; a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) {
      btn.textContent = 'Export failed'
      console.error(err)
    } finally {
      exporting = false
      btn.disabled = false
      if (btn.textContent !== 'Export failed') btn.textContent = 'Export video'
      // restore the static end-frame view
      video.currentTime = endT
    }
  })

  // show the last frame with the full path initially
  video.currentTime = endT
  renderAt(endT)
}
