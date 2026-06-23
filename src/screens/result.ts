import type { App } from '../app'
import { drawOverlay } from '../overlay'
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

  root.innerHTML = `
    <div class="min-h-screen flex flex-col gap-3 p-3">
      <canvas id="cv" class="max-h-[68vh] w-auto mx-auto rounded-lg"></canvas>
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

  const canvas = root.querySelector<HTMLCanvasElement>('#cv')!
  canvas.width = video.videoWidth; canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')!
  const scrub = root.querySelector<HTMLInputElement>('#scrub')!
  const endT = path[path.length - 1]?.t ?? video.duration

  const render = (t: number) => drawOverlay(ctx, video, path, t, refX)
  scrub.addEventListener('input', () => {
    const t = app.data.startTime + (Number(scrub.value) / 1000) * (endT - app.data.startTime)
    video.currentTime = t
  })
  video.addEventListener('seeked', () => render(video.currentTime))

  root.querySelector('#new')!.addEventListener('click', () => { app.reset(); app.go('upload') })
  root.querySelector('#export')!.addEventListener('click', () => {
    ;(window as any).__exportFn?.()  // wired in Task 10
  })

  video.currentTime = endT
  if (video.readyState >= 2) render(endT)
}
