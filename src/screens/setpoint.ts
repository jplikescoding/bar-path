import type { App } from '../app'
import { angleFromVertical } from '../geometry'

export function renderSetPoint(app: App, root: HTMLElement): void {
  const video = app.data.videoEl!
  root.innerHTML = `
    <div class="min-h-screen flex flex-col gap-3 p-3">
      <p id="hint" class="text-sm text-center text-neutral-300">Scrub to where the bar starts moving, then tap the end of the bar.</p>
      <div class="relative mx-auto">
        <canvas id="cv" class="max-h-[70vh] w-auto rounded-lg touch-none"></canvas>
      </div>
      <input id="scrub" type="range" min="0" max="1000" value="0" class="w-full" />
      <div class="flex gap-2 justify-center">
        <button id="vref" class="px-3 py-2 rounded bg-neutral-700 text-sm">Set vertical reference</button>
        <button id="track" disabled class="px-4 py-2 rounded bg-blue-600 disabled:opacity-40">Track</button>
      </div>
    </div>`

  const canvas = root.querySelector<HTMLCanvasElement>('#cv')!
  const ctx = canvas.getContext('2d')!
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const scrub = root.querySelector<HTMLInputElement>('#scrub')!
  const hint = root.querySelector<HTMLParagraphElement>('#hint')!
  const trackBtn = root.querySelector<HTMLButtonElement>('#track')!
  const vrefBtn = root.querySelector<HTMLButtonElement>('#vref')!

  let mode: 'seed' | 'vref' = 'seed'
  let vrefP1: { x: number; y: number } | null = null

  const draw = () => {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    if (app.data.seed) dot(app.data.seed.x, app.data.seed.y, '#ef4444')
    if (vrefP1) dot(vrefP1.x, vrefP1.y, '#22d3ee')
  }
  const dot = (x: number, y: number, color: string) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill()
  }
  const seekFrac = (f: number) => {
    video.currentTime = f * video.duration
  }
  video.addEventListener('seeked', draw)

  scrub.addEventListener('input', () => seekFrac(Number(scrub.value) / 1000))

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (canvas.width / rect.width)
    const y = (e.clientY - rect.top) * (canvas.height / rect.height)
    if (mode === 'seed') {
      app.data.seed = { x, y }
      app.data.startTime = video.currentTime
      trackBtn.disabled = false
      draw()
    } else {
      if (!vrefP1) { vrefP1 = { x, y }; hint.textContent = 'Tap a second point higher up the same vertical line.' ; draw() }
      else {
        app.data.verticalAngleRad = angleFromVertical(vrefP1, { x, y })
        mode = 'seed'; vrefBtn.textContent = 'Vertical reference set'
        hint.textContent = 'Tap the end of the bar (or re-tap to adjust).'
        vrefP1 = null; draw()
      }
    }
  })

  vrefBtn.addEventListener('click', () => {
    mode = 'vref'; vrefP1 = null
    hint.textContent = 'Tap the bottom of a true-vertical line (e.g. a rack upright).'
  })

  trackBtn.addEventListener('click', () => app.go('processing'))

  seekFrac(0)
  // draw once metadata/first frame is painted
  if (video.readyState >= 2) draw(); else video.addEventListener('loadeddata', draw, { once: true })
}
